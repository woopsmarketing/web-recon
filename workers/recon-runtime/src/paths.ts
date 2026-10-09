/**
 * URL pathname → package-relative key, derived strictly from the Next 16 static export
 * layout (`output: "export"`, `trailingSlash: false`) observed in real Site Build Packages:
 *
 *   /                          → index.html
 *   /about, /portfolio/<slug>  → about.html, portfolio/<slug>.html     (links are extensionless)
 *   /<anything>.<ext>          → exactly that file, ext ≠ html          (RSC *.txt incl. "$" names,
 *                                                                        _next/static/**, assets/*,
 *                                                                        robots.txt, sitemap.xml)
 * Deliberately NOT served (→ not-found, answered with the package's 404.html + status 404):
 *   - any *.html spelled out (/index.html, /about.html, /404.html, /_not-found.html): one URL per page
 *   - extensionless /404, /_not-found, …/index: framework pages, never a route of the site
 *   - trailing slash (/about/): the export has trailingSlash false and the runtime never redirects
 *   - the package seal /_package.json
 *   - anything under /_runtime/: inputs of the portfolio publisher, not site files
 * Rejected (→ bad request): undecodable percent-escapes, encoded "/" or "\" (%2F, %5C), empty,
 * "." or ".." segments, control characters. The query string is ignored (Next adds ?_rsc=…).
 * Percent-escapes are decoded exactly once per segment, so "/x/__next.portfolio.%24d%24slug.__PAGE__.txt"
 * and the literal "$" spelling address the same object.
 */

import { SEAL_NAME } from "./contract";

export type PathResolution =
  | { kind: "key"; key: string }
  /** `runtimeInput`: the path is under /_runtime/ (in any percent-escaped spelling) — the package's alone, like /_next/ */
  | { kind: "not-found"; reason: string; runtimeInput?: true }
  | { kind: "bad-request"; reason: string };

/** HTML files the framework always emits that are not routes of the site. */
const FRAMEWORK_PAGES = new Set(["404", "_not-found"]);
export const NOT_FOUND_KEY = "404.html";
/** Package directory of the portfolio publisher's inputs (runtime.json, shell.json). */
const RUNTIME_DIR = "_runtime";

/** The percent-decoded URL path that resolvePath maps to this package key ("about.html" → "/about"). */
export function routeOfKey(key: string): string {
  if (key === "index.html") return "/";
  return `/${key.endsWith(".html") ? key.slice(0, -".html".length) : key}`;
}

export function resolvePath(pathname: string): PathResolution {
  if (!pathname.startsWith("/")) return { kind: "bad-request", reason: "path must start with /" };
  if (/%(2f|5c)/i.test(pathname) || pathname.includes("\\")) return { kind: "bad-request", reason: "encoded or literal path separator" };
  if (pathname === "/") return { kind: "key", key: "index.html" };
  if (pathname.endsWith("/")) return { kind: "not-found", reason: "trailing slash (export uses trailingSlash: false; no redirects)" };

  const segments: string[] = [];
  for (const raw of pathname.slice(1).split("/")) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return { kind: "bad-request", reason: "malformed percent-encoding" };
    }
    if (seg === "" || seg === "." || seg === "..") return { kind: "bad-request", reason: "empty or dot segment" };
    if (/[\u0000-\u001f\u007f/\\]/.test(seg)) return { kind: "bad-request", reason: "control character or separator in segment" };
    segments.push(seg);
  }

  if (segments.length > 1 && segments[0] === RUNTIME_DIR) return { kind: "not-found", reason: "publisher runtime inputs are not site files", runtimeInput: true };
  const rel = segments.join("/");
  const last = segments[segments.length - 1]!;
  const ext = /\.([A-Za-z0-9]+)$/.exec(last)?.[1];
  if (ext !== undefined) {
    if (ext.toLowerCase() === "html") return { kind: "not-found", reason: "HTML pages are served only at their extensionless route" };
    if (rel === SEAL_NAME) return { kind: "not-found", reason: "package seal is not a site file" };
    return { kind: "key", key: rel };
  }
  if (last === "index") return { kind: "not-found", reason: "…/index is not a route (use /)" };
  if (segments.length === 1 && FRAMEWORK_PAGES.has(last)) return { kind: "not-found", reason: "framework page is not a route" };
  return { kind: "key", key: `${rel}.html` };
}
