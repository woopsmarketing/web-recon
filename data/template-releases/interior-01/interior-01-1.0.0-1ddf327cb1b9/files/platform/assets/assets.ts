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

const SVG_NAMESPACES = new Set(["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"]);

/**
 * Customer SVGs are served same-origin, so they must be inert and self-contained:
 * no script, no event handlers, no foreignObject, no external href/url()/@import.
 * Returns the problems found (empty = accepted).
 */
export function svgProblems(text: string): string[] {
  const problems: string[] = [];
  if (/<script\b/i.test(text)) problems.push("<script>");
  if (/<foreignObject\b/i.test(text)) problems.push("<foreignObject>");
  if (/\son[a-z]+\s*=/i.test(text)) problems.push("event handler attribute");
  if (/@import/i.test(text)) problems.push("@import");
  for (const m of text.matchAll(/\b(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!m[1]!.startsWith("#")) problems.push(`external href ${m[1]}`);
  for (const m of text.matchAll(/url\(\s*["']?([^"')]*)/gi)) if (!m[1]!.startsWith("#")) problems.push(`external url(${m[1]})`);
  for (const m of text.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/gi)) if (!SVG_NAMESPACES.has(m[0])) problems.push(`remote reference ${m[0]}`);
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
