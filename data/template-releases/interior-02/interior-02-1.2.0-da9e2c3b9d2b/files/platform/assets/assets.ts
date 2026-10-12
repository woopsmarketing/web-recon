import { z } from "zod";
import { AssetRefSchema, ContentOriginSchema } from "../content/schema";

/**
 * Customer-owned asset registry + resolver.
 *
 * Stored (per site):  assets/registry.json → { id, file, mediaType, width, height }
 * Snapshot (per build): only REFERENCED entries, each with its sha256 and a
 * content-addressed public path. Templates never see file paths or hosts; they
 * resolve an asset ref to { src, width, height } through the AssetResolver.
 */

export const ALLOWED_MEDIA_TYPES = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type AllowedMediaType = keyof typeof ALLOWED_MEDIA_TYPES;

export const AssetEntrySchema = z
  .object({
    id: AssetRefSchema,
    /** Path relative to the site's assets/ directory; no traversal. */
    file: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i).max(128),
    mediaType: z.enum(Object.keys(ALLOWED_MEDIA_TYPES) as [AllowedMediaType, ...AllowedMediaType[]]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetRegistryDocSchema = z
  .object({
    schema: z.literal("assets@1"),
    origin: ContentOriginSchema,
    items: z.array(AssetEntrySchema),
  })
  .strict();

/**
 * Customer SVGs are served same-origin (direct navigation to /assets/x.svg renders
 * them as documents), so they must be inert and self-contained. ALLOWLIST, not
 * blocklist: only plain shape/text/gradient elements, only presentation attributes,
 * no namespaces prefixes, no entities except &amp; &lt; &gt; &quot; &apos;, no
 * DOCTYPE/CDATA/PI (except a leading XML declaration), no backslashes (CSS escapes),
 * url() only as url(#id). Returns the problems found (empty = accepted).
 */
const SVG_ELEMENTS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
  "defs", "lineargradient", "radialgradient", "stop", "clippath", "title", "desc",
]);
const SVG_ATTRS = new Set([
  "xmlns", "width", "height", "viewbox", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "opacity", "transform", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "letter-spacing",
  "id", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "clip-path", "clip-rule",
  "preserveaspectratio", "fx", "fy",
]);
const SVG_NS = "http://www.w3.org/2000/svg";

export function svgProblems(text: string): string[] {
  const problems: string[] = [];
  let body = text.replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/, "");
  if (/<[!?]/.test(body)) problems.push("DOCTYPE / CDATA / comment / processing instruction");
  if (/\\/.test(body)) problems.push("backslash (CSS/escape) in SVG");
  for (const m of body.matchAll(/&([^;\s]*);?/g)) if (!["amp", "lt", "gt", "quot", "apos"].includes(m[1]!)) problems.push(`entity &${m[1]};`);
  const tagRe = /<\/?([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*\/?>/g;
  let sawRoot = false;
  for (const m of body.matchAll(tagRe)) {
    const name = m[1]!;
    if (!SVG_ELEMENTS.has(name.toLowerCase()) || name.includes(":")) {
      problems.push(`element <${name}> not allowed`);
      continue;
    }
    if (name.toLowerCase() === "svg" && !m[0].startsWith("</")) sawRoot = true;
    for (const a of (m[2] ?? "").matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const attr = a[1]!.toLowerCase();
      const value = a[2] ?? a[3] ?? "";
      if (!SVG_ATTRS.has(attr)) {
        problems.push(`attribute ${a[1]} not allowed`);
        continue;
      }
      if (attr === "xmlns" && value !== SVG_NS) problems.push(`xmlns ${value}`);
      if (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z][\w-]*\)$/.test(value.trim())) problems.push(`external url() in ${attr}`);
      if (/(^|[^a-z])(javascript|data|https?):|\/\//i.test(value) && attr !== "xmlns") problems.push(`URL-like value in ${attr}`);
    }
  }
  // Anything left that looks like markup was not a well-formed allowed tag.
  if (/[<>]/.test(body.replace(tagRe, ""))) problems.push("malformed or disallowed markup");
  if (!sawRoot) problems.push("no <svg> root");
  return problems;
}

export interface SnapshotAsset extends AssetEntry {
  sha256: string;
  /** Content-addressed path inside the static package, e.g. /assets/ab12…cd.svg */
  publicPath: string;
}

export function publicAssetPath(sha256: string, mediaType: AllowedMediaType): string {
  return `/assets/${sha256.slice(0, 20)}.${ALLOWED_MEDIA_TYPES[mediaType]}`;
}

export interface ResolvedAsset {
  src: string;
  width: number;
  height: number;
}

export interface AssetResolver {
  resolve(ref: string): ResolvedAsset;
}

export function createAssetResolver(assets: readonly SnapshotAsset[]): AssetResolver {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return {
    resolve(ref) {
      const hit = byId.get(ref);
      if (!hit) throw new Error(`asset "${ref}" is not in the site snapshot`);
      return { src: hit.publicPath, width: hit.width, height: hit.height };
    },
  };
}
