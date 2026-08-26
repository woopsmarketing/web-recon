/**
 * Source brand asset classification (Task 22 E) — conservative by
 * construction. Deterministic rule list, first match wins, every decision
 * carries its rule id and evidence.
 *
 * What is NEVER auto-approved for materialization: source brand marks
 * (favicon, social cards, logo-named files), photos of real people and
 * customer-identity assets (detected via the Task 19 imageBrief warnings —
 * the only person/customer evidence any stored artifact carries), and
 * branded product screenshots carrying an explicit misrepresentation
 * warning. Those are `replacement-required` and the fetcher skips them.
 *
 * The conservative DEFAULT for everything unproven is
 * `replacement-recommended`: fetched so the runtime dependency dies, but
 * flagged in the replacement manifest for an operator-supplied replacement.
 * `safe-to-materialize` requires positive evidence (a Task 19 keep-default
 * brief on the joined slot).
 *
 * Inline SVG entries (url === null) are NOT classified here: their markup is
 * already local to the template (nothing to fetch), and reviewing SVG brand
 * content is the template/content layer's named limitation.
 */
import type {
  AssetInventoryEntry,
  ClassificationDecision,
} from "./types.js";

const LOGO_FILENAME = /logo|wordmark|brand[-_]?mark/i;

export interface ClassifyOptions {
  /** Source brand labels derived from evidence (e.g. host label "stripe"). */
  brandTerms: string[];
}

export function deriveBrandTermsFromHost(sourceHost: string): string[] {
  const labels = sourceHost.toLowerCase().split(".");
  // Same guard as seo/brand-isolation: only labels >= 4 chars become bare terms.
  const meaningful = labels.filter(
    (label) => label.length >= 4 && !["www", "com", "net", "org"].includes(label),
  );
  return [...new Set(meaningful)];
}

function filenameOf(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter((s) => s.length > 0);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

export function classifyEntry(
  entry: AssetInventoryEntry,
  options: ClassifyOptions,
): ClassificationDecision | null {
  if (entry.url === null) return null; // inline-svg: nothing fetchable to classify

  const decision = (
    classification: ClassificationDecision["classification"],
    ruleId: string,
    evidence: string[],
  ): ClassificationDecision => ({
    inventoryId: entry.inventoryId,
    url: entry.url,
    classification,
    ruleId,
    evidence,
  });

  // R1 — fonts: license is unknown, never self-hosted (Task 22 G).
  if (entry.kind === "font" || entry.origin === "head-font-preload") {
    return decision("license-needs-review", "font-license-unknown", [
      "font file; no verifiable open-license evidence in any stored artifact",
    ]);
  }
  // R2 — favicon / icon: the source site's brand mark.
  if (entry.origin === "head-favicon" || entry.kind === "icon" || entry.kind === "favicon") {
    return decision("replacement-required", "brand-favicon", [
      `favicon/icon reference (${entry.origin})`,
    ]);
  }
  // R3 — og:image / twitter:image: source social/brand cards.
  if (entry.origin === "head-og-image") {
    return decision("replacement-required", "brand-social-card", [
      "og:image / twitter:image in source head evidence",
    ]);
  }
  // R4 — logo-or-brand-named files.
  const filename = filenameOf(entry.url);
  if (LOGO_FILENAME.test(filename)) {
    return decision("replacement-required", "brand-filename", [
      `filename matches logo pattern: ${filename}`,
    ]);
  }
  const lowerName = filename.toLowerCase();
  for (const term of options.brandTerms) {
    if (lowerName.includes(term)) {
      return decision("replacement-required", "brand-filename", [
        `filename contains source brand term "${term}": ${filename}`,
      ]);
    }
  }
  // R5 — Task 19 brief with a warning (real people / customer identity /
  // misrepresentation risk) — never auto-approved.
  if (entry.imageBrief && entry.imageBrief.warning) {
    return decision("replacement-required", "image-brief-warning", [
      `imageBrief ${entry.imageBrief.slotKey}: ${entry.imageBrief.warning}`,
    ]);
  }
  // R6 — brief says replace-recommended.
  if (entry.imageBrief && entry.imageBrief.action === "replace-recommended") {
    return decision("replacement-recommended", "image-brief-replace-recommended", [
      `imageBrief ${entry.imageBrief.slotKey} action replace-recommended`,
    ]);
  }
  // R7 — brief says keep-default (decorative, brand-neutral): positive evidence.
  if (entry.imageBrief && entry.imageBrief.action === "keep-default") {
    return decision("safe-to-materialize", "image-brief-keep-default", [
      `imageBrief ${entry.imageBrief.slotKey} action keep-default (decorative per brief)`,
    ]);
  }
  // R8 — video content: brand/product footage until proven otherwise.
  if (entry.kind === "source" || entry.kind === "video") {
    return decision("replacement-recommended", "video-brand-content", [
      "video asset; content unreviewed",
    ]);
  }
  // R9 — truncated URLs are unfetchable; still record a conservative class.
  if (entry.truncated) {
    return decision("replacement-recommended", "truncated-url-unfetchable", [
      "observer attribute cap truncated this URL (strict prefix of a longer inventory URL)",
    ]);
  }
  // R10 — conservative default: photos / product imagery cannot be proven
  // brand-neutral from stored evidence.
  return decision("replacement-recommended", "default-conservative", [
    "no positive brand-neutral evidence; fetched for independence but flagged for replacement",
  ]);
}

function pathnameKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export function classifyInventory(
  entries: AssetInventoryEntry[],
  options: ClassifyOptions,
): ClassificationDecision[] {
  const decisions: ClassificationDecision[] = [];
  for (const entry of entries) {
    const decision = classifyEntry(entry, options);
    if (decision) decisions.push(decision);
  }
  // Sibling-variant escalation (strictly upward, never a relaxation): the
  // same underlying asset appears under several URLs differing only in query
  // parameters (rendition width, fm=webp picture-source variants). If ANY
  // variant is replacement-required (a person photo, a customer logo, a
  // brand mark), EVERY variant of that pathname is — a webp rendition of a
  // real person's photo is still a photo of that person.
  const requiredPathnames = new Map<string, string>(); // pathKey -> evidencing URL
  for (const decision of decisions) {
    if (decision.classification === "replacement-required" && decision.url) {
      const key = pathnameKey(decision.url);
      if (key && !requiredPathnames.has(key)) requiredPathnames.set(key, decision.url);
    }
  }
  for (const decision of decisions) {
    if (decision.classification === "replacement-required") continue;
    if (decision.classification === "license-needs-review") continue; // fonts: separate axis
    if (!decision.url) continue;
    const key = pathnameKey(decision.url);
    const evidenceUrl = key ? requiredPathnames.get(key) : undefined;
    if (evidenceUrl !== undefined && evidenceUrl !== decision.url) {
      decision.evidence = [
        `escalated from ${decision.ruleId}: sibling variant ${evidenceUrl} is replacement-required (same host+pathname)`,
      ];
      decision.ruleId = "sibling-variant-escalation";
      decision.classification = "replacement-required";
    }
  }
  return decisions;
}
