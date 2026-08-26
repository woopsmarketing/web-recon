import {
  LOCALE_PREFIX_PATTERN,
  classifyTerminalSegment,
  type RouteFeatures,
} from "./types.js";

/**
 * Deterministic route feature extraction (Task 07).
 *
 * Pure string work on an already-normalized verified URL — no network, no
 * browser, no AI. Every field is a *shape* observation; none of them claims to
 * know what the page means.
 *
 * Two deliberate restraints:
 *  - A locale-looking first segment is recorded, never removed. `/ko/guide` and
 *    `/guide` stay different URLs with different parents; the only consequence
 *    of `localePrefix` is that `routeScope` looks one segment further in.
 *  - A readable terminal slug stays `text`. We never declare `/blog/post-a` to
 *    be a dynamic route on the strength of the string alone; that claim needs
 *    repeated same-structure siblings (see build-families.ts).
 */

/** Decode a path segment, falling back to the raw form on malformed escapes. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Join segments back into an absolute path (`[] → "/"`). */
function toPath(segments: readonly string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Derive {@link RouteFeatures} for one URL. Throws only if the URL cannot be
 * parsed, which cannot happen for Task 06 output (already normalized + verified).
 */
export function extractRouteFeatures(rawUrl: string): RouteFeatures {
  const url = new URL(rawUrl);

  const pathSegments = url.pathname
    .split("/")
    .filter((s) => s.length > 0)
    .map(decodeSegment);
  const pathDepth = pathSegments.length;

  const first = pathSegments[0];
  const localePrefix =
    first !== undefined && LOCALE_PREFIX_PATTERN.test(first) ? first : undefined;

  // First segment that is not the locale prefix. Undefined at the site root and
  // for a locale-only path such as `/en-US/`.
  const routeScope = localePrefix ? pathSegments[1] : pathSegments[0];

  const parentPath = toPath(pathSegments.slice(0, -1));

  const queryKeys = [...new Set([...url.searchParams.keys()])].sort();

  const terminalSegment = pathSegments[pathDepth - 1] ?? "";

  return {
    url: rawUrl,
    pathname: url.pathname,
    pathSegments,
    pathDepth,
    ...(localePrefix ? { localePrefix } : {}),
    ...(routeScope ? { routeScope } : {}),
    parentPath,
    queryKeys,
    queryKeySignature: queryKeys.join("&"),
    terminalSegment,
    terminalKind: classifyTerminalSegment(terminalSegment),
  };
}

/**
 * Whether a URL is the run's site root. Two cases count:
 *  - the host's bare root (`/`, no query), and
 *  - the run root itself, which may carry a path — a discovery run can be
 *    rooted at `https://developer.mozilla.org/en-US/`, and that entry page
 *    deserves the same protection as a bare `/`.
 *
 * The root is force-isolated during grouping so it can never lose a
 * representative contest and disappear from the selection.
 */
export function isSiteRoot(rawUrl: string, rootUrl: string): boolean {
  let url: URL;
  let root: URL;
  try {
    url = new URL(rawUrl);
    root = new URL(rootUrl);
  } catch {
    return false;
  }
  if (url.hostname.toLowerCase() !== root.hostname.toLowerCase()) return false;
  if (url.pathname === "/" && url.search === "") return true;

  // Compare against the run root, tolerating only a trailing-slash difference
  // (Task 06 normalization already resolved everything else).
  const stripSlash = (p: string): string =>
    p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  return (
    url.search === root.search && stripSlash(url.pathname) === stripSlash(root.pathname)
  );
}

/**
 * Build the observation-derived sibling pattern for a parent path, e.g.
 * `/blog` → `/blog/<*>`. The `<*>` spelling is intentional: it reads as "the
 * varying segment we observed", not as a framework route parameter.
 */
export function inferredSiblingPattern(parentPath: string): string {
  return parentPath === "/" ? "/<*>" : `${parentPath}/<*>`;
}
