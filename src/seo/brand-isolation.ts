import type { BrandIsolationResult, SourceSeoSnapshot } from "./types.js";

/**
 * Source Brand Isolation (Task 21 I).
 *
 * Production SEO artifacts must contain NO source canonical, source OG URLs,
 * source JSON-LD identity, or source social links. The forbidden set is
 * DERIVED from the Source SEO Snapshot itself (host, canonical origins,
 * JSON-LD organization identity, og/twitter site handles, sameAs links) —
 * no hardcoded site-specific list anywhere.
 */

function collectJsonLdIdentity(json: unknown, into: Set<string>): void {
  if (Array.isArray(json)) {
    for (const item of json) collectJsonLdIdentity(item, into);
    return;
  }
  if (json === null || typeof json !== "object") return;
  const record = json as Record<string, unknown>;
  const type = record["@type"];
  const typeNames = typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
  if (typeNames.some((t) => typeof t === "string" && /organization|corporation|brand/i.test(t))) {
    if (typeof record.name === "string" && record.name.trim() !== "") into.add(record.name.trim());
    if (typeof record.legalName === "string" && record.legalName.trim() !== "") into.add(record.legalName.trim());
  }
  if (typeof record.url === "string") {
    try {
      into.add(new URL(record.url).host);
    } catch {
      /* not a URL — ignore */
    }
  }
  const sameAs = record.sameAs;
  const sameAsList = typeof sameAs === "string" ? [sameAs] : Array.isArray(sameAs) ? sameAs : [];
  for (const link of sameAsList) if (typeof link === "string" && link.trim() !== "") into.add(link.trim());
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) collectJsonLdIdentity(value, into);
  }
}

/** Derive the forbidden identity terms from source evidence. */
export function deriveForbiddenTerms(snapshot: SourceSeoSnapshot): string[] {
  const terms = new Set<string>();
  terms.add(snapshot.host);
  const hostLabel = snapshot.host.replace(/^www\./, "").split(".")[0];
  if (hostLabel.length >= 4) terms.add(hostLabel);
  for (const page of snapshot.pages) {
    if (page.canonical !== null) {
      try {
        terms.add(new URL(page.canonical.href).host);
      } catch {
        /* relative canonical — host term already covers it */
      }
    }
    for (const entry of [...page.openGraph, ...page.twitter]) {
      if (entry.key === "og:site_name" && entry.content.trim() !== "") terms.add(entry.content.trim());
      if (entry.key === "twitter:site" && entry.content.trim() !== "") terms.add(entry.content.trim());
      if (entry.key === "og:url" || entry.key === "og:image" || entry.key === "twitter:image") {
        try {
          terms.add(new URL(entry.content).host);
        } catch {
          /* non-URL content */
        }
      }
    }
    for (const jsonLd of page.jsonLd) {
      if (jsonLd.parseable) collectJsonLdIdentity(jsonLd.json, terms);
    }
  }
  return [...terms].sort();
}

function* stringsOf(value: unknown, location: string): Generator<{ location: string; text: string }> {
  if (typeof value === "string") {
    yield { location, text: value };
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* stringsOf(value[i], `${location}[${i}]`);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) yield* stringsOf(child, `${location}.${key}`);
  }
}

/**
 * Scan named documents (JSON values or raw text) for the forbidden terms.
 * Matching is case-insensitive substring on word-ish boundaries for short
 * name terms and plain substring for host/URL terms.
 */
export function checkBrandIsolation(
  forbiddenTerms: string[],
  documents: { location: string; content: unknown }[],
): BrandIsolationResult {
  const violations: BrandIsolationResult["violations"] = [];
  let scannedStrings = 0;
  const matchers = forbiddenTerms.map((term) => {
    const isUrlish = term.includes(".") || term.includes("/") || term.startsWith("@");
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      term,
      pattern: isUrlish
        ? new RegExp(escaped, "i")
        : new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu"),
    };
  });
  for (const document of documents) {
    for (const { location, text } of stringsOf(document.content, document.location)) {
      scannedStrings += 1;
      for (const { term, pattern } of matchers) {
        const match = pattern.exec(text);
        if (match !== null) {
          const at = match.index;
          violations.push({
            location,
            term,
            excerpt: text.slice(Math.max(0, at - 40), at + term.length + 40),
          });
        }
      }
    }
  }
  return {
    pass: violations.length === 0,
    forbiddenTerms,
    scannedStrings,
    violations: violations.slice(0, 50),
  };
}
