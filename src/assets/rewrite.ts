/**
 * Reference rewriting (Task 22 D): source asset URLs → local /media paths.
 *
 * Application is string-substitution over the FULLY BUFFERED response body,
 * the same mechanism the Task 21 SEO proxy uses for the RSC flight payload.
 * A URL appears in three encodings across a Next.js response:
 *
 *   raw               inside CSS url(...) and client-side strings
 *   HTML-escaped      & → &amp; inside SSR'd attribute values (src, srcset)
 *   JSON-escaped      & → & inside the RSC flight payload
 *
 * All three variants are replaced. Longer URLs are replaced first so a URL
 * that is a prefix of another can never steal its occurrences.
 */
import type { RewriteMap } from "./types.js";

export function rewriteVariants(url: string): string[] {
  const variants = [url];
  const htmlEscaped = url.replace(/&/g, "&amp;");
  if (htmlEscaped !== url) variants.push(htmlEscaped);
  const jsonEscaped = url.replace(/&/g, "\\u0026");
  if (jsonEscaped !== url) variants.push(jsonEscaped);
  return variants;
}

export interface RewriteResult {
  body: string;
  replacedUrls: number;
  replacedOccurrences: number;
}

export function applyRewrite(
  body: string,
  map: RewriteMap,
  context: "html" | "css",
): RewriteResult {
  let out = body;
  let replacedUrls = 0;
  let replacedOccurrences = 0;
  // rewrite-map entries are already sorted longest-first at creation; keep
  // that guarantee locally too so callers may hand-build maps in tests.
  const entries = [...map.entries].sort(
    (a, b) => b.sourceUrl.length - a.sourceUrl.length || a.sourceUrl.localeCompare(b.sourceUrl),
  );
  for (const entry of entries) {
    if (!entry.contexts.includes(context)) continue;
    let hits = 0;
    for (const variant of rewriteVariants(entry.sourceUrl)) {
      if (!out.includes(variant)) continue;
      const parts = out.split(variant);
      hits += parts.length - 1;
      out = parts.join(entry.localPath);
    }
    if (hits > 0) {
      replacedUrls++;
      replacedOccurrences += hits;
    }
  }
  return { body: out, replacedUrls, replacedOccurrences };
}

/** Content types for serving /media/<sha>.<ext> files. */
export function mediaContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const table: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff2: "font/woff2",
    woff: "font/woff",
    ttf: "font/ttf",
    otf: "font/otf",
    mp4: "video/mp4",
    webm: "video/webm",
    css: "text/css",
  };
  return table[ext] ?? "application/octet-stream";
}
