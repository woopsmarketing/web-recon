/**
 * Source-brand SURFACE CENSUS over a served/exported HTML document.
 *
 * Extracted from `qa.ts` (Task 28 CR7) so it has exactly ONE implementation and
 * TWO callers with different evidence:
 *
 *   production/bake.ts  the STATIC EXPORT this compile just produced, measured
 *                       after the head splice and the asset rewrite — the bake
 *                       output itself, carried on BakeReport.brand
 *   production/qa.ts    the SERVED package, measured over real HTTP
 *
 * A census is a MEASUREMENT, never an assertion: it counts what a document
 * still says about the source brand. Nothing here rewrites anything, and no
 * number is ever inherited from another run.
 *
 * `qa.ts` re-exports every symbol below, so its public surface is unchanged.
 */
import {
  firstBrandToken,
  firstBrandTokenInIdentifier,
  isSourceHostUrl,
  scanBodyAnchorIdentity,
  scanImageLogo,
  scanInlineSvgMarkup,
} from "../content-injection/brand-surfaces.js";

export interface BrandSurfaceCounts {
  sourceUrl: number;
  bodyAnchorIdentity: number;
  visibleText: number;
  /**
   * BRAND-NAMED IMAGE PATH in the RENDERED output — the census axis for the
   * `image-logo` surface (Task 28 close-out).
   *
   * WHY IT EXISTS. `image-logo` is the FIRST entry of
   * `RESOLVABLE_BRAND_SURFACES` and the resolver really does rewrite
   * `props.src` for it, but until now NO axis measured it: `sourceUrl` is
   * deliberately excluded from `markupBrandSurfaceTotal` (it is the asset
   * layer's), and a self-hosted path like `/static/AcmeLogo.svg` is not a
   * source-host URL at all, so it matched NOTHING. Measured consequence on a
   * fixture image-logo lineage: a PRESERVE-everything decision produced a
   * census of all zeros — `markupBrandSurfaceTotal` 0 — and the requirement
   * read `resolved` with 0 blockers WHILE the source logotype was still in the
   * shipped bytes.
   *
   * It is measured with `scanImageLogo` ITSELF — the detector's own function —
   * so the census cannot drift blinder than detection, and it counts ONE per
   * `<img>` element, exactly as detection raises one host per element.
   */
  imageSrcPath: number;
  imageAlt: number;
  ariaLabel: number;
  svgAriaLabel: number;
  svgSymbolId: number;
  svgText: number;
}

export interface BrandSurfaceCensus extends BrandSurfaceCounts {
  brandTokens: string[];
  routesMeasured: number;
  byRoute: Array<BrandSurfaceCounts & { route: string }>;
}

const SVG_BLOCK = /<svg\b[\s\S]*?<\/svg>/gi;
const ANY_ARIA_LABEL = /\baria-label\s*=\s*"([^"]*)"/g;
const IMG_ALT = /<img\b[^>]*?\balt\s*=\s*"([^"]*)"/gi;
const URL_ATTR = /\b(?:href|src|poster|action)\s*=\s*"([^"]*)"/gi;
const IMG_TAG = /<img\b[^>]*>/gi;
// A leading WHITESPACE, not `\b`: ` data-src="…"` also satisfies `\bsrc`, and
// the detector reads `props.src` / `props.srcset` and nothing else, so matching
// a data-attribute here would make the census wider than detection instead of
// equal to it.
const SRC_ATTR = /\ssrc\s*=\s*"([^"]*)"/i;
const SRCSET_ATTR = /\ssrcset\s*=\s*"([^"]*)"/i;

/**
 * Count `<img>` elements in RENDERED markup whose `src`/`srcset` path names the
 * brand, using the DETECTOR'S OWN `scanImageLogo` so the two can never drift.
 * One per element, matching how detection raises one host per element.
 */
export function countBrandNamedImagePaths(
  markup: string,
  brandTokens: readonly string[],
): number {
  let hits = 0;
  for (const tag of markup.match(IMG_TAG) ?? []) {
    const props: Record<string, unknown> = {};
    const src = SRC_ATTR.exec(tag);
    if (src !== null) props.src = src[1];
    const srcset = SRCSET_ATTR.exec(tag);
    if (srcset !== null) props.srcset = srcset[1];
    if (scanImageLogo(props, brandTokens).length > 0) hits += 1;
  }
  return hits;
}

/**
 * Census ONE served html document. Everything is derived from the document
 * itself — no host list, no hardcoded brand (the tokens come from the
 * deploy manifest's `sourceHost`).
 */
export function censusServedHtml(
  html: string,
  sourceHost: string,
  brandTokens: readonly string[],
): BrandSurfaceCounts {
  const counts: BrandSurfaceCounts = {
    sourceUrl: 0,
    bodyAnchorIdentity: 0,
    visibleText: 0,
    imageSrcPath: 0,
    imageAlt: 0,
    ariaLabel: 0,
    svgAriaLabel: 0,
    svgSymbolId: 0,
    svgText: 0,
  };
  const svgBlocks = html.match(SVG_BLOCK) ?? [];
  for (const block of svgBlocks) {
    for (const hit of scanInlineSvgMarkup(block, brandTokens)) {
      if (hit.surface === "svg-aria-label") counts.svgAriaLabel += 1;
      else if (hit.surface === "svg-symbol-id") counts.svgSymbolId += 1;
      else counts.svgText += 1;
    }
  }
  // aria-label OUTSIDE inline SVG (the SVG ones are counted on their own axis).
  const outsideSvg = html.replace(SVG_BLOCK, "");
  for (const match of outsideSvg.matchAll(ANY_ARIA_LABEL)) {
    if (firstBrandToken(match[1], brandTokens) !== undefined) counts.ariaLabel += 1;
  }
  // IDENTIFIER matcher — the same one `scanElementProps` now uses for `alt`.
  // A census that read `alt="NextjsLogotype"` as zero while the detector called
  // it a surface would be blinder than detection (Task 28 close-out).
  for (const match of html.matchAll(IMG_ALT)) {
    if (firstBrandTokenInIdentifier(match[1], brandTokens) !== undefined) counts.imageAlt += 1;
  }
  counts.imageSrcPath = countBrandNamedImagePaths(html, brandTokens);
  for (const match of html.matchAll(URL_ATTR)) {
    if (isSourceHostUrl(match[1], sourceHost)) counts.sourceUrl += 1;
  }
  counts.bodyAnchorIdentity = scanBodyAnchorIdentity(html, sourceHost).length;
  const text = outsideSvg.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ");
  for (const token of brandTokens) {
    const matches = text.match(new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "gi"));
    counts.visibleText += matches?.length ?? 0;
  }
  return counts;
}

/** Fold per-route counts into the report-level census. */
export function summarizeBrandCensus(
  brandTokens: readonly string[],
  byRoute: BrandSurfaceCensus["byRoute"],
): BrandSurfaceCensus {
  const total = (pick: (row: BrandSurfaceCounts) => number): number =>
    byRoute.reduce((sum, row) => sum + pick(row), 0);
  return {
    brandTokens: [...brandTokens],
    routesMeasured: byRoute.length,
    sourceUrl: total((row) => row.sourceUrl),
    bodyAnchorIdentity: total((row) => row.bodyAnchorIdentity),
    visibleText: total((row) => row.visibleText),
    imageSrcPath: total((row) => row.imageSrcPath),
    imageAlt: total((row) => row.imageAlt),
    ariaLabel: total((row) => row.ariaLabel),
    svgAriaLabel: total((row) => row.svgAriaLabel),
    svgSymbolId: total((row) => row.svgSymbolId),
    svgText: total((row) => row.svgText),
    byRoute,
  };
}

// ---------------------------------------------------------------------------
// RSC FLIGHT PAYLOAD (Task 28 Phase 2)
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS. `censusServedHtml` above reads ONE encoding: the SSR
 * markup. A Next.js static export ships the same inline SVG at least twice
 * more, in two other encodings:
 *
 *   route.txt     the RSC flight, JSON-escaped:  aria-label=\"Linear Logo\"
 *   route.html    the SAME flight inlined in `self.__next_f.push(...)` script
 *                 chunks, escaped again:  \\u003csvg … aria-label=\\\\\"…\\\\\"
 *
 * Measured on the accepted linear package: 50 brand aria-labels in the
 * exported HTML markup vs 32 more inside the `.txt` flight files, and the
 * inlined flight is 1,485,658 of index.html's 2,674,090 bytes. The HTML-only
 * census cannot match either escaped form, so a rewrite that reached only the
 * markup would drive the reported census to 0 while the site still SHIPPED the
 * source brand — and, because the inline SVG arrives through
 * `dangerouslySetInnerHTML` from the flight, the client value would win on
 * hydration and on every client-side navigation back to the route.
 *
 * So the flight gets its own measured axis. It is a MEASUREMENT, exactly like
 * the HTML census — nothing here asserts or rewrites.
 */
export interface BrandFlightCounts {
  /** Files/documents measured. */
  documents: number;
  /** `T<hexlen>,` chunk markers seen — the length-prefixed blob encoding. */
  lengthPrefixedChunks: number;
  svgAriaLabel: number;
  svgSymbolId: number;
  svgText: number;
  /** The flight encoding of the markup census's `imageSrcPath` axis. */
  imageSrcPath: number;
  imageAlt: number;
  ariaLabel: number;
  sourceUrl: number;
  /** Coarse floor: brand-token occurrences anywhere in the decoded payload. */
  brandTokenOccurrences: number;
}

export function emptyFlightCounts(): BrandFlightCounts {
  return {
    documents: 0,
    lengthPrefixedChunks: 0,
    svgAriaLabel: 0,
    svgSymbolId: 0,
    svgText: 0,
    imageSrcPath: 0,
    imageAlt: 0,
    ariaLabel: 0,
    sourceUrl: 0,
    brandTokenOccurrences: 0,
  };
}

const T_CHUNK = /(?:^|\n)[0-9a-f]+:T[0-9a-f]+,/g;
const FLIGHT_SCRIPT = /self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g;

/**
 * Undo the flight's escaping, one layer per round, until it stops changing.
 * The inlined-in-HTML form is escaped TWICE (a JSON string inside a JS string
 * literal inside a script), so a single pass is not enough.
 */
export function decodeFlightPayload(
  text: string,
  maxRounds = 5,
  /** Applied after EACH round — see `stripObservationEvidence`. */
  perRound?: (text: string) => string,
): string {
  let out = text;
  for (let round = 0; round < maxRounds; round += 1) {
    const unescaped = out
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u0022/gi, '"')
      .replace(/\\u0027/gi, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n");
    const next = perRound === undefined ? unescaped : perRound(unescaped);
    if (next === out) return out;
    out = next;
  }
  return out;
}

/**
 * Remove `data-wr-obs` payloads before counting.
 *
 * WHY, measured. `data-wr-obs` carries OBSERVATION EVIDENCE — the recorded
 * interaction/mutation payload the exact-reconstruction verifier reads. It is
 * an attribute VALUE holding serialized nodes, so it never renders as an
 * `alt`, an `aria-label` or an inline SVG: nothing inside it is a brand
 * SURFACE. Because it is JSON-escaped, the markup census could never match it;
 * the flight census decodes, so without this it WOULD — and it did: on the
 * accepted linear lineage a `data-wr-obs` blob on /plan carries
 * `alt: "A blueprint image … in Linear"`, which counted as 4 residual flight
 * `imageAlt` occurrences after every rendered surface had been resolved. That
 * is a false positive, and an over-strict gate is as dishonest as a lax one.
 *
 * Stripped ONE ESCAPING LAYER AT A TIME (as a `perRound` hook of the decoder),
 * because only at the layer where the value is still a single escaped JSON
 * string can its end be located exactly.
 */
/**
 * Remove HOISTED observation-evidence chunks.
 *
 * A large attribute value is not inlined in the flight: it is emitted as its
 * own chunk and referenced (`"data-wr-obs":"$23"` + a `23:T2abd,…` chunk whose
 * body is the RAW payload, unescaped). So the escaping-aware strip below can
 * never see it, and on the accepted linear lineage that raw chunk carries
 * `alt: "A blueprint image … in Linear"` — an OBSERVATION EVIDENCE payload,
 * which renders as an attribute string and never as an `alt` surface.
 *
 * The exclusion is STRUCTURAL, not a heuristic: only chunks whose id is
 * actually referenced as a `data-wr-obs` value are dropped, and the drop
 * extends exactly to the next chunk header.
 */
export function stripReferencedObservationChunks(text: string): string {
  const ids = new Set<string>();
  for (const match of text.matchAll(/\\*"data-wr-obs\\*"\s*:\s*\\*"\$([0-9a-f]+)\\*"/g)) {
    ids.add(match[1]);
  }
  if (ids.size === 0) return text;
  // Chunk headers are newline-delimited in a `.txt` flight and ESCAPED-newline
  // delimited (`\n`, at whatever depth) once the same flight is inlined in a
  // `self.__next_f.push` script — so both forms count as a boundary.
  const header = /(?:^|\n|\\+n)([0-9a-f]+):/g;
  const spans: Array<[number, number]> = [];
  const headers: Array<{ id: string; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text)) !== null) {
    headers.push({ id: match[1], start: match.index });
  }
  for (let index = 0; index < headers.length; index += 1) {
    if (!ids.has(headers[index].id)) continue;
    spans.push([headers[index].start, headers[index + 1]?.start ?? text.length]);
  }
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    out += text.slice(cursor, start);
    cursor = end;
  }
  return out + text.slice(cursor);
}

export function stripObservationEvidence(text: string): string {
  // The key appears at whatever escaping depth the payload is at:
  //   .txt flight            \"data-wr-obs\":\"…\"
  //   inlined in the html    \\\"data-wr-obs\\\":\\\"…\\\"
  // Capture that backslash run, then find the FIRST closing delimiter at the
  // SAME depth: everything inside the value is escaped one level deeper, so
  // its quotes are preceded by an extra backslash and are skipped.
  // `\\*` (not `\\+`): at depth 0 the key is plain `"data-wr-obs"` and its value
  // is a JSON string whose own quotes are escaped, so the same
  // "first delimiter not preceded by a backslash" rule locates its end.
  const key = /(\\*)"data-wr-obs\1"\s*:\s*\1"/g;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = key.exec(text)) !== null) {
    const escape = match[1];
    const terminator = `${escape}"`;
    const valueStart = match.index + match[0].length;
    let search = valueStart;
    let end = -1;
    while (search < text.length) {
      const at = text.indexOf(terminator, search);
      if (at === -1) break;
      if (text[at - 1] !== "\\") {
        end = at;
        break;
      }
      search = at + 1;
    }
    if (end === -1) continue;
    out += text.slice(cursor, valueStart);
    cursor = end;
    key.lastIndex = end;
  }
  return cursor === 0 ? text : out + text.slice(cursor);
}


/** The `self.__next_f.push(...)` script bodies inlined in an exported HTML. */
export function extractInlineFlightChunks(html: string): string[] {
  return [...html.matchAll(FLIGHT_SCRIPT)].map((match) => match[1]);
}

/**
 * Census ONE flight payload (a `.txt` file's contents, or one inlined chunk).
 * `documents` is left at 0 — the caller counts documents, because a route's
 * HTML may contain many chunks that are all one document.
 */
export function censusFlightPayload(
  payload: string,
  sourceHost: string,
  brandTokens: readonly string[],
): BrandFlightCounts {
  const counts = emptyFlightCounts();
  counts.lengthPrefixedChunks = (payload.match(T_CHUNK) ?? []).length;
  const decoded = decodeFlightPayload(
    stripObservationEvidence(stripReferencedObservationChunks(payload)),
    5,
    stripObservationEvidence,
  );
  for (const block of decoded.match(SVG_BLOCK) ?? []) {
    for (const hit of scanInlineSvgMarkup(block, brandTokens)) {
      if (hit.surface === "svg-aria-label") counts.svgAriaLabel += 1;
      else if (hit.surface === "svg-symbol-id") counts.svgSymbolId += 1;
      else counts.svgText += 1;
    }
  }
  const outsideSvg = decoded.replace(SVG_BLOCK, "");
  for (const match of outsideSvg.matchAll(ANY_ARIA_LABEL)) {
    if (firstBrandToken(match[1], brandTokens) !== undefined) counts.ariaLabel += 1;
  }
  // The flight serialises props as JSON, so `alt` is a JSON key, not an <img>
  // attribute: match both forms rather than pretending the markup form is all.
  for (const match of decoded.matchAll(/"alt"\s*:\s*"([^"]*)"/g)) {
    if (firstBrandTokenInIdentifier(match[1], brandTokens) !== undefined) counts.imageAlt += 1;
  }
  for (const match of decoded.matchAll(IMG_ALT)) {
    if (firstBrandTokenInIdentifier(match[1], brandTokens) !== undefined) counts.imageAlt += 1;
  }
  // The `image-logo` axis, in both flight encodings — the JSON prop the flight
  // actually serialises (`"src":"…"` / `"srcSet":"…"`) and any `<img>` markup a
  // decoded chunk carries. Same shape as `imageAlt` directly above, which is
  // already counted in both forms.
  for (const match of decoded.matchAll(/"(src|srcSet|srcset)"\s*:\s*"([^"]*)"/g)) {
    const props: Record<string, unknown> = match[1] === "src" ? { src: match[2] } : { srcset: match[2] };
    if (scanImageLogo(props, brandTokens).length > 0) counts.imageSrcPath += 1;
  }
  counts.imageSrcPath += countBrandNamedImagePaths(decoded, brandTokens);
  for (const match of decoded.matchAll(URL_ATTR)) {
    if (isSourceHostUrl(match[1], sourceHost)) counts.sourceUrl += 1;
  }
  for (const token of brandTokens) {
    const matches = decoded.match(new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "gi"));
    counts.brandTokenOccurrences += matches?.length ?? 0;
  }
  return counts;
}

export function addFlightCounts(a: BrandFlightCounts, b: BrandFlightCounts): BrandFlightCounts {
  return {
    documents: a.documents + b.documents,
    lengthPrefixedChunks: a.lengthPrefixedChunks + b.lengthPrefixedChunks,
    svgAriaLabel: a.svgAriaLabel + b.svgAriaLabel,
    svgSymbolId: a.svgSymbolId + b.svgSymbolId,
    svgText: a.svgText + b.svgText,
    imageSrcPath: a.imageSrcPath + b.imageSrcPath,
    imageAlt: a.imageAlt + b.imageAlt,
    ariaLabel: a.ariaLabel + b.ariaLabel,
    sourceUrl: a.sourceUrl + b.sourceUrl,
    brandTokenOccurrences: a.brandTokenOccurrences + b.brandTokenOccurrences,
  };
}

/** Brand surfaces that must be ZERO for a brand-free flight (the coarse
 *  `brandTokenOccurrences` and `sourceUrl` axes are excluded: source URLs are
 *  the asset layer's, and the coarse count includes ordinary prose). */
export function flightBrandSurfaceTotal(counts: BrandFlightCounts): number {
  return (
    counts.svgAriaLabel +
    counts.svgSymbolId +
    counts.svgText +
    counts.imageSrcPath +
    counts.imageAlt +
    counts.ariaLabel
  );
}

/**
 * Same, for the HTML census. `visibleText`, `sourceUrl` and
 * `bodyAnchorIdentity` are owned by content / assets, not by this resolver.
 *
 * `imageSrcPath` IS this resolver's — `image-logo` is the first entry of
 * `RESOLVABLE_BRAND_SURFACES` and the resolver rewrites `props.src` for it, so
 * leaving it out of the total was the census axis this instrument was missing
 * (Task 28 close-out). It is NOT the same thing as `sourceUrl`: a self-hosted
 * `/static/AcmeLogo.svg` is not a source-host URL and `sourceUrl` never saw it.
 */
export function markupBrandSurfaceTotal(counts: BrandSurfaceCounts): number {
  return (
    counts.svgAriaLabel +
    counts.svgSymbolId +
    counts.svgText +
    counts.imageSrcPath +
    counts.imageAlt +
    counts.ariaLabel
  );
}
