/**
 * Publish-time content-type and cache-control for each Site Build Package file. Both are
 * stored as R2 httpMetadata and returned unchanged by recon-runtime.
 *
 * Content types: fixed extension table; an unknown extension fails the publish (fail closed —
 * never guess, never serve octet-stream by accident). RSC payloads (*.txt) are text/plain: the
 * Next static-export client accepts text/plain flight responses (observed in-browser).
 *
 * Cache policy:
 *  - `_next/static/**`                                   → immutable (Next's content/build-hashed output)
 *  - a file whose name stem (≥16 hex) is a prefix of its own sha256 → immutable (verified content-addressed,
 *    e.g. platform assets `assets/<sha256[0:20]>.<ext>`)
 *  - everything else (HTML, RSC *.txt, robots.txt, sitemap.xml, unhashed media) → revalidate (ETag → 304)
 */

import { CACHE_IMMUTABLE, CACHE_REVALIDATE } from "../../workers/recon-runtime/src/contract";

export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  xml: "application/xml",
  webmanifest: "application/manifest+json",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function contentTypeFor(relPath: string): string | undefined {
  const ext = /\.([A-Za-z0-9]+)$/.exec(relPath)?.[1]?.toLowerCase();
  return ext ? CONTENT_TYPES[ext] : undefined;
}

export type CacheReason = "next-static" | "content-addressed" | "revalidate";

export function cachePolicyFor(relPath: string, sha256: string): { cacheControl: string; reason: CacheReason } {
  if (relPath.startsWith("_next/static/")) return { cacheControl: CACHE_IMMUTABLE, reason: "next-static" };
  const stem = /^([0-9a-f]{16,64})\.[A-Za-z0-9]+$/.exec(relPath.split("/").pop()!)?.[1];
  if (stem && sha256.startsWith(stem)) return { cacheControl: CACHE_IMMUTABLE, reason: "content-addressed" };
  return { cacheControl: CACHE_REVALIDATE, reason: "revalidate" };
}
