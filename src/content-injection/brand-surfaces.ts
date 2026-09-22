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

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROUTE_MAP_FILE, RUNTIME_DATA_DIR } from "../reconstruction/types.js";

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

/**
 * Word-boundary match — "linear" hits "Linear Logo" but not "collinear".
 *
 * The token is REGEX-ESCAPED (Task 28 Phase 2 correction). Host-derived tokens
 * never carry a metacharacter, but a DECLARED brand name does — `Next.js` would
 * otherwise compile to `next.js` where `.` matches any character, so
 * `nextXjs` would count as the brand. Escaping narrows nothing real: it only
 * removes matches the token never claimed.
 */
export function containsBrandToken(value: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value);
}

/**
 * Separators a page title uses between the PAGE's name and the SITE's own name
 * ("Docs | Next.js"). The ASCII hyphen is deliberately NOT one of them: it is
 * ordinary prose punctuation ("Next.js by Vercel - The React Framework") and
 * treating it as a separator manufactures names the site never declared.
 */
const TITLE_SEPARATOR = /\s[|·•–—]\s/;

/**
 * The brand name(s) the SOURCE ITSELF declares, derived from the route map's
 * own page titles (Task 28 Phase 2 correction).
 *
 * WHY THIS EXISTS. `brandTokensFromHost` derives every token from the host
 * LABEL, so a brand that is never spelled the way its domain is spelled is
 * invisible to it. Measured counterexample in this repo:
 * `domainchecker.co.kr` ships `aria-label="도메인체커 홈"` — the site's own
 * name, in Korean, on a surface the resolver owns — and the host-only detector
 * finds ZERO brand-carrying hosts on that lineage, so no source-brand
 * requirement is raised at all.
 *
 * THE RULE. A site that appends its own name to its titles does so on EVERY
 * page; a page-specific phrase does not. So a candidate is the trailing
 * segment of a separated title, and it is accepted only when it recurs across
 * at least two titles AND across a MAJORITY of the titled routes. That is
 * evidence from the source's own artifact — never a hardcoded name, never an
 * operator-supplied one.
 *
 * This can only ADD tokens. It is a widening of detection, and it is measured:
 * linear.app 80 -> 80 hosts and stripe.com 195 -> 195 (their declared name is
 * already the host label), domainchecker.co.kr 0 -> 38, nextjs.org 160 -> 190.
 */
export function declaredBrandNamesFromTitles(titles: readonly string[]): string[] {
  const present = titles.map((title) => title.trim()).filter((title) => title !== "");
  if (present.length === 0) return [];
  const counts = new Map<string, number>();
  for (const title of present) {
    if (!TITLE_SEPARATOR.test(title)) continue;
    const segments = title
      .split(TITLE_SEPARATOR)
      .map((segment) => segment.trim())
      .filter((segment) => segment !== "");
    const tail = segments[segments.length - 1];
    if (tail === undefined) continue;
    if (tail.length < 2 || tail.length > 40) continue;
    counts.set(tail, (counts.get(tail) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2 && count / present.length >= 0.5)
    .map(([name]) => name.toLowerCase())
    .sort();
}

/**
 * The token set a brand scan runs with: the host-derived tokens, plus every
 * DECLARED name that none of them already matches.
 *
 * The dedupe is what keeps the widening honest about its own effect — a site
 * whose declared name IS its host label ("Linear", "Stripe") contributes
 * nothing new and its measured host count does not move.
 */
export function brandTokensFrom(host: string, declaredNames: readonly string[] = []): string[] {
  const hostTokens = brandTokensFromHost(host);
  const extra = declaredNames
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length >= 2)
    .filter((name) => !hostTokens.some((token) => containsBrandToken(name, token)));
  return [...new Set([...hostTokens, ...extra])].sort();
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

/**
 * The STABLE id one detected brand surface is addressed by — the key
 * `authored.brand` decisions are stored under and the key the bake-time
 * resolver looks a decision up with.
 *
 * It lives HERE, in the lowest layer both readers already import, for one
 * reason: `src/release/authored.ts` (the write API) and
 * `src/production/brand-bake.ts` (the rewriter) must derive the SAME id or a
 * decision silently addresses nothing. A second copy of this hash would be a
 * drift waiting to happen, and `src/production` importing `src/release` would
 * be a cycle (release/stages.ts imports production).
 *
 * Derived ONLY from the axes that ADDRESS the surface — never from what was
 * found there (see the doc on `brandSurfaceId` in release/authored.ts, which
 * delegates here).
 */
export function brandSurfaceIdOf(parts: {
  surface: BrandSurface;
  route: string;
  nodeId: string | null;
  slotKey: string | null;
  evidencePointer: string;
}): string {
  const discriminator = JSON.stringify([
    parts.surface,
    parts.route,
    parts.nodeId,
    parts.slotKey,
    parts.evidencePointer,
  ]);
  const digest = createHash("sha256").update(discriminator, "utf8").digest("hex").slice(0, 12);
  return `bs-${parts.surface}-${digest}`;
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
 * `image-logo` — an `<img>` whose IMAGE FILE names the source brand.
 *
 * The rule is deliberately narrow and file-derived: a brand token inside the
 * URL's own path (camel humps split, so `/StripeLogo.svg` matches) is the
 * source shipping its own mark as a raster/vector FILE. It is not "any image
 * on a brand page" and it is not "any image whose alt mentions the brand" —
 * measured on the accepted templates, a third-party customer logo
 * (`logo-FoxSports-…`) carries no source token and is correctly ignored.
 *
 * MEASURED ON REAL DATA (Task 28 Phase 2 CORRECTION). An earlier revision of
 * this comment claimed the surface was "measured zero on every accepted
 * template". That claim was FALSE and is preserved here so the error is not
 * quietly erased: running this very scanner over
 * `data/nextjs.org/recon-templates/2026-08-19T07-12-35-732Z/app` returns 160
 * `image-logo` hosts over 40 routes, on two source logotype files
 * (`nextjs-logotype-light…svg` / `-dark…svg`, `alt="NextjsLogotype"`).
 * linear.app, stripe.com and domainchecker.co.kr do measure zero on this
 * surface. The nextjs.org lineage is now exercised end to end by
 * `scripts/smoke-brand-assets.ts` §5e (two real `next build`s).
 */
export function scanImageLogo(
  props: Record<string, unknown>,
  tokens: readonly string[],
): BrandSurfaceHit[] {
  const candidates: string[] = [];
  const src = props.src;
  if (typeof src === "string") candidates.push(src);
  const srcset = props.srcset;
  if (typeof srcset === "string") {
    for (const candidate of srcset.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url !== undefined && url !== "") candidates.push(url);
    }
  }
  for (const candidate of candidates) {
    const pathname = urlPathOf(candidate);
    const matched = firstBrandTokenInIdentifier(pathname, tokens);
    if (matched === undefined) continue;
    return [
      {
        surface: "image-logo",
        value: truncate(candidate),
        matched,
        sourceUrl: /^(https?:)?\/\//i.test(candidate) ? candidate : null,
      },
    ];
  }
  return [];
}

/** Path portion of a url or a bare path — never throws. */
function urlPathOf(value: string): string {
  if (!/^(https?:)?\/\//i.test(value)) return value.split("?")[0];
  try {
    return new URL(value.startsWith("//") ? `https:${value}` : value).pathname;
  } catch {
    return value;
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
  /**
   * The element's tag, when the caller knows it (Task 28 Phase 2). OPTIONAL so
   * every existing caller keeps its exact behaviour: `image-logo` is the only
   * surface that needs it, because "an image FILE that names the brand" is
   * only a logo claim when the element is an `<img>`.
   */
  tag?: string,
): BrandSurfaceHit[] {
  const hits: BrandSurfaceHit[] = [];
  if (tag === "img") hits.push(...scanImageLogo(props, tokens));
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
    // IDENTIFIER matcher, not the plain word-boundary one (Task 28 close-out).
    //
    // WHY, measured. `scanImageLogo` above reads the SAME <img>'s src PATH with
    // `firstBrandTokenInIdentifier`, so it splits camel humps; this line used
    // `firstBrandToken`, which does not. On the real nextjs.org lineage that
    // asymmetry is worth 120 surfaces: every logotype <img> carries
    // `alt="NextjsLogotype"`, whose brand token has NO separator after it, so
    // the src path was detected as an `image-logo` host while the alt on the
    // very same element was invisible — and `brand-census.ts` measured that alt
    // axis with the same weak matcher, so the shipped `NextjsLogotype` alt
    // counted as ZERO. Two blind spots that agreed with each other are not an
    // alignment; they are the same hole twice.
    //
    // This is a WIDENING: it can only raise MORE surfaces, never fewer, so it
    // cannot manufacture a clean census. Measured effect on the accepted
    // lineages: linear.app 14 -> 14 alt surfaces, stripe.com 10 -> 10,
    // domainchecker.co.kr 0 -> 0, nextjs.org 12 -> 132.
    const matched = firstBrandTokenInIdentifier(alt, tokens);
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
// ---------------------------------------------------------------------------
// Runtime-IR walk (Task 28 CR8) — ONE implementation, two callers
// ---------------------------------------------------------------------------

/**
 * A hit located in a template's runtime IR: which route, which viewport, which
 * `data-wr-node` identity. NO new DOM attribute is involved — `nodeId` is the
 * existing `data-wr-node` value the compiler already stamped.
 */
export interface RuntimeSurfaceHit extends BrandSurfaceHit {
  route: string;
  viewport: string;
  nodeId: string | null;
  pageFile: string;
  /** Stable pointer into the page file, e.g. `desktop.doc[n12].v`. */
  pointer: string;
}

export interface RuntimeSurfaceScan {
  /** False when the lineage has no runtime IR (nothing was measured). */
  available: boolean;
  routeMapFile: string;
  routesScanned: number;
  elementNodes: number;
  inlineSvgNodes: number;
  hits: RuntimeSurfaceHit[];
}

interface RuntimeNodeLike {
  k?: string;
  n?: string;
  t?: string;
  p?: Record<string, unknown>;
  c?: RuntimeNodeLike[];
  v?: string;
}

/**
 * Walk a compiled template's runtime IR and return every brand surface hit.
 *
 * Extracted from `src/release/brand-scan.ts` (Task 28 CR8) so the release scan
 * and the content run's brand-leak report see the SAME surfaces through the
 * same code. Traversal order is preserved exactly (stack pop, `v` before `p`,
 * children pushed in document order) because brand-scan keeps a CAPPED sample
 * of the findings and that sample must not move.
 *
 * Reads only; scans nothing outside the template run directory.
 */
export async function scanRuntimeTemplateSurfaces(options: {
  /** `<template-run>/app` — the generated app directory. */
  templateAppDir: string;
  sourceHost: string;
  brandTokens?: readonly string[];
}): Promise<RuntimeSurfaceScan> {
  const tokens = options.brandTokens ?? brandTokensFromHost(options.sourceHost);
  const dataDir = path.join(options.templateAppDir, RUNTIME_DATA_DIR);
  const routeMapFile = path.join(dataDir, ROUTE_MAP_FILE);
  const scan: RuntimeSurfaceScan = {
    available: false,
    routeMapFile,
    routesScanned: 0,
    elementNodes: 0,
    inlineSvgNodes: 0,
    hits: [],
  };
  if (!existsSync(routeMapFile)) return scan;
  scan.available = true;
  const routeMap = JSON.parse(await readFile(routeMapFile, "utf8")) as {
    routes: Array<{ path: string; pageFile: string }>;
  };
  for (const route of routeMap.routes) {
    const pageFile = path.join(dataDir, route.pageFile);
    if (!existsSync(pageFile)) continue;
    scan.routesScanned += 1;
    const page = JSON.parse(await readFile(pageFile, "utf8")) as Record<
      string,
      { doc?: RuntimeNodeLike } | undefined
    >;
    for (const viewport of ["desktop", "mobile"]) {
      const doc = page[viewport]?.doc;
      if (doc === undefined) continue;
      const stack: RuntimeNodeLike[] = [doc];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.k !== "e") continue;
        scan.elementNodes += 1;
        const nodeId = node.n ?? null;
        const pointer = `${viewport}.doc[${nodeId ?? "?"}]`;
        if (typeof node.v === "string") {
          scan.inlineSvgNodes += 1;
          for (const hit of scanInlineSvgMarkup(node.v, tokens)) {
            scan.hits.push({
              ...hit,
              route: route.path,
              viewport,
              nodeId,
              pageFile,
              pointer: `${pointer}.v`,
            });
          }
        }
        if (node.p !== undefined) {
          for (const hit of scanElementProps(node.p, tokens, options.sourceHost, node.t)) {
            scan.hits.push({
              ...hit,
              route: route.path,
              viewport,
              nodeId,
              pageFile,
              pointer: `${pointer}.p`,
            });
          }
        }
        if (node.c !== undefined) for (const child of node.c) stack.push(child);
      }
    }
  }
  return scan;
}

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
