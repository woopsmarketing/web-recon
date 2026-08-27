/**
 * Source-brand SURFACE detection (Task 27, GED-F).
 *
 * `brand-leak.ts` answers one question — does an EDITABLE SLOT still carry the
 * source brand after the overlay. This module answers the wider one: on which
 * RENDERED SURFACE does the source identity survive at all. The two are
 * complementary and deliberately separate:
 *
 *   brand-leak.ts   slot-shaped, effective (post-injection) values, feeds the
 *                   content run's operator report
 *   brand-surfaces  attribute/markup-shaped, feeds the release layer's
 *                   `brand-leak` requirement kind (src/release/brand-scan.ts)
 *
 * DETECTOR ONLY. Nothing here rewrites anything: the two surfaces this module
 * newly reaches — an inline SVG's `aria-label` and a `<symbol id>` — live in
 * the runtime IR's `v` markup (src/reconstruction/types.ts RuntimeElementNode),
 * which has no slot binding, so there is no write target to rewrite through.
 * Neutralization belongs at BAKE, never in the template compiler, and is
 * sequenced after Content V2 / region enablement.
 */

/**
 * The closed surface vocabulary. A surface is named here whether or not this
 * repo can see it today — the release report says which, so an unimplemented
 * surface is a recorded gap rather than a silent one.
 */
export const BRAND_SURFACES = [
  "visible-text",
  "source-url",
  "title-meta",
  "canonical",
  "open-graph",
  "json-ld",
  "image-logo",
  "image-alt",
  "aria-label",
  "svg-text",
  "svg-aria-label",
  "svg-symbol-id",
  "dynamic-template-content",
  "body-anchor-identity",
] as const;
export type BrandSurface = (typeof BRAND_SURFACES)[number];

export interface BrandSurfaceHit {
  surface: BrandSurface;
  /** The matched attribute / text value (truncated for reporting). */
  value: string;
  /** Which brand token (or the source host) matched. */
  matched: string;
  /** Absolute source URL when the surface carries one. */
  sourceUrl: string | null;
}

const VALUE_CAP = 120;

function truncate(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > VALUE_CAP ? `${collapsed.slice(0, VALUE_CAP)}…` : collapsed;
}

/** `stripe.com` → ["stripe"]; `foo-bar.co.kr` → ["foo-bar", "foo", "bar"]. */
export function brandTokensFromHost(host: string): string[] {
  const first = host.toLowerCase().split(".")[0];
  const tokens = new Set<string>([first]);
  for (const part of first.split(/[-_]/)) {
    if (part.length >= 4) tokens.add(part);
  }
  return [...tokens].filter((t) => t.length >= 3).sort();
}

/** Word-boundary match — "linear" hits "Linear Logo" but not "collinear". */
export function containsBrandToken(value: string, token: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i").test(value);
}

export function firstBrandToken(value: string, tokens: readonly string[]): string | undefined {
  return tokens.find((token) => containsBrandToken(value, token));
}

/**
 * Identifier match. `<symbol id="LinearAi">` carries the brand with no
 * separator at all, so the plain word-boundary test misses it: split the camel
 * humps first and only then apply it.
 */
export function firstBrandTokenInIdentifier(
  identifier: string,
  tokens: readonly string[],
): string | undefined {
  const separated = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return firstBrandToken(separated, tokens);
}

const SVG_ARIA_LABEL = /\baria-label\s*=\s*"([^"]*)"/g;
const SVG_SYMBOL_ID = /<symbol\b[^>]*?\bid\s*=\s*"([^"]*)"/g;
const SVG_TEXTUAL = /<(text|title)\b[^>]*>([\s\S]*?)<\/\1>/g;

/**
 * Scan one sanitized inline-SVG markup string (a RuntimeElementNode `v`).
 * The whole string IS svg markup, so an `aria-label` found here is an SVG
 * accessible name — the mark's announced identity, not a button's.
 */
export function scanInlineSvgMarkup(
  markup: string,
  tokens: readonly string[],
): BrandSurfaceHit[] {
  const hits: BrandSurfaceHit[] = [];
  for (const match of markup.matchAll(SVG_ARIA_LABEL)) {
    const matched = firstBrandToken(match[1], tokens);
    if (matched !== undefined) {
      hits.push({ surface: "svg-aria-label", value: truncate(match[1]), matched, sourceUrl: null });
    }
  }
  for (const match of markup.matchAll(SVG_SYMBOL_ID)) {
    const matched = firstBrandTokenInIdentifier(match[1], tokens);
    if (matched !== undefined) {
      hits.push({ surface: "svg-symbol-id", value: truncate(match[1]), matched, sourceUrl: null });
    }
  }
  for (const match of markup.matchAll(SVG_TEXTUAL)) {
    const text = match[2].replace(/<[^>]*>/g, "");
    const matched = firstBrandToken(text, tokens);
    if (matched !== undefined) {
      hits.push({ surface: "svg-text", value: truncate(text), matched, sourceUrl: null });
    }
  }
  return hits;
}

const URL_PROPS = ["href", "src", "poster", "action"] as const;

/** Is this absolute URL on the source host (or its www alias)? */
export function isSourceHostUrl(value: string, sourceHost: string): boolean {
  if (!/^(https?:)?\/\//i.test(value)) return false;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.host === sourceHost || url.host === `www.${sourceHost}`;
  } catch {
    return false;
  }
}

/**
 * Scan a runtime element's props. `alt` and `aria-label` are text surfaces an
 * assistive technology reads aloud; `href`/`src` are the URL surface.
 */
export function scanElementProps(
  props: Record<string, unknown>,
  tokens: readonly string[],
  sourceHost: string,
): BrandSurfaceHit[] {
  const hits: BrandSurfaceHit[] = [];
  for (const name of URL_PROPS) {
    const value = props[name];
    if (typeof value !== "string") continue;
    if (!isSourceHostUrl(value, sourceHost)) continue;
    hits.push({
      surface: "source-url",
      value: truncate(value),
      matched: sourceHost,
      sourceUrl: value,
    });
  }
  const srcset = props.srcset;
  if (typeof srcset === "string") {
    for (const candidate of srcset.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url === undefined || url === "") continue;
      if (!isSourceHostUrl(url, sourceHost)) continue;
      hits.push({
        surface: "source-url",
        value: truncate(url),
        matched: sourceHost,
        sourceUrl: url,
      });
    }
  }
  const alt = props.alt;
  if (typeof alt === "string") {
    const matched = firstBrandToken(alt, tokens);
    if (matched !== undefined) {
      hits.push({ surface: "image-alt", value: truncate(alt), matched, sourceUrl: null });
    }
  }
  const ariaLabel = props["aria-label"];
  if (typeof ariaLabel === "string") {
    const matched = firstBrandToken(ariaLabel, tokens);
    if (matched !== undefined) {
      hits.push({ surface: "aria-label", value: truncate(ariaLabel), matched, sourceUrl: null });
    }
  }
  return hits;
}

/** Anchors in SERVED html whose href is still an absolute source-host URL. */
export function scanBodyAnchorIdentity(
  html: string,
  sourceHost: string,
): BrandSurfaceHit[] {
  const hits: BrandSurfaceHit[] = [];
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*"([^"]*)"/gi)) {
    if (!isSourceHostUrl(match[1], sourceHost)) continue;
    hits.push({
      surface: "body-anchor-identity",
      value: truncate(match[1]),
      matched: sourceHost,
      sourceUrl: match[1],
    });
  }
  return hits;
}
