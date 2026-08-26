import type { RouteSpec, SiteSpec } from "../sitespec/index.js";
import { ReconstructionError, type RuntimeRoute } from "./types.js";

/**
 * Route compilation (items 18–22).
 *
 * A RouteSpec's identity is its URL, not its pathname, so the clone's lookup key
 * has to be able to tell `/search?q=a` from `/search?q=b` (item 19). It also has
 * to survive the two things a real HTTP server does to a URL before the app sees
 * it — trailing-slash normalization and query reordering — without either
 * merging two distinct routes or losing one.
 *
 * The key is therefore:
 *
 *   normalized pathname  +  normalized query
 *
 * where the pathname loses a trailing slash (except at the root) and the query
 * is rebuilt from `(name, value)` pairs sorted by name and then by value. Sorting
 * is what makes `?a=1&b=2` and `?b=2&a=1` the same route, which they are: a
 * server that treated them as two pages would be describing a site nobody has.
 *
 * Two rules keep this honest rather than convenient:
 *
 *  - Every verified URL becomes exactly one route, and a key collision is a
 *    FAIL, never a silent merge (item 21).
 *  - A request whose key is not in the table gets `notFound()`. Nothing is
 *    rerouted to "the closest page" (item 18) — a clone that answers every URL
 *    with the home page would score wonderfully in Task 15 and mean nothing.
 */

/**
 * Percent-DECODED path segments, trailing slash removed.
 *
 * Decoding is what makes the two sides agree. Next.js hands a page its route
 * segments already decoded, so a key built from the raw URL would never match a
 * path containing `%20` or a non-ASCII character; re-encoding on the runtime side
 * is worse, because `encodeURIComponent` escapes characters (`(`, `'`, `!`) that
 * a real URL usually leaves literal. Decoding both sides is symmetric and has no
 * such table. Two URLs that decode to the same key are a genuine ambiguity and
 * are caught as a collision rather than merged.
 */
function normalizePathname(pathname: string): string {
  if (pathname === "") return "/";
  const decoded = pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
  if (decoded.length > 1 && decoded.endsWith("/")) return decoded.slice(0, -1);
  return decoded;
}

/**
 * Sorted, re-encoded query string (empty when there is none).
 *
 * `URLSearchParams` re-encodes to a canonical form, so two spellings of the same
 * query (`+` vs `%20`) collapse — which is correct, they ARE the same query.
 */
function normalizeSearch(search: string): string {
  if (search === "" || search === "?") return "";
  const params = [...new URLSearchParams(search)];
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const out = new URLSearchParams();
  for (const [name, value] of params) out.append(name, value);
  const serialized = out.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

/** The deterministic route key for a pathname + raw query string. */
export function routeKeyFromParts(pathname: string, search: string): string {
  return `${normalizePathname(pathname)}${normalizeSearch(search)}`;
}

/** The deterministic route key for an absolute URL. */
export function routeKeyFromUrl(url: URL): string {
  return routeKeyFromParts(url.pathname, url.search);
}

/**
 * The clone-local path for a route — what a rewritten `href` points at.
 *
 * The ORIGINAL pathname and query are preserved (item 81), not the normalized
 * ones: a link should look like the site's own link. Normalization only happens
 * on the lookup side, where both spellings converge on the same key.
 */
export function clonePathFor(url: URL): string {
  return `${url.pathname}${url.search}`;
}

export interface RoutePlan {
  routes: RuntimeRoute[];
  /** Route key → index into `routes`. */
  byKey: Map<string, number>;
  /** Every page id some route renders from, sorted. */
  usedPageIds: string[];
}

export interface BuildRoutePlanOptions {
  /** `pageId → runtime page file`, relative to `reconstruction-data/`. */
  pageFileFor: (pageId: string) => string;
}

function titleFor(
  route: RouteSpec,
  siteSpec: SiteSpec,
  pageTitleById: ReadonlyMap<string, string>,
): string | undefined {
  /*
   * Task 06 loaded THIS exact URL and recorded what the document called itself,
   * so for any route that has a verification summary the per-route title is an
   * observed fact about that URL. Only when there is none does the render
   * source's title stand in — which on a family-represented route is the
   * representative's title, and is labeled as such by `renderCoverage`.
   */
  const verified = route.verificationSummary?.title;
  if (verified !== undefined && verified !== "") return verified;
  if (route.renderSourcePageId) {
    const fromPage = pageTitleById.get(route.renderSourcePageId);
    if (fromPage !== undefined && fromPage !== "") return fromPage;
  }
  void siteSpec;
  return undefined;
}

/** Compile the SiteSpec route table into the clone's route map. */
export function buildRoutePlan(
  siteSpec: SiteSpec,
  pageTitleById: ReadonlyMap<string, string>,
  options: BuildRoutePlanOptions,
): RoutePlan {
  const routes: RuntimeRoute[] = [];
  const byKey = new Map<string, number>();
  const usedPageIds = new Set<string>();

  for (const route of siteSpec.routes) {
    let url: URL;
    try {
      url = new URL(route.url);
    } catch {
      throw new ReconstructionError(
        `route ${route.routeId} has an unparseable URL (${route.url})`,
      );
    }
    const key = routeKeyFromUrl(url);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      throw new ReconstructionError(
        `two verified routes collapse to the same clone route key "${key}": ` +
          `${routes[existing]!.url} and ${route.url}. The route table must map 1:1 ` +
          `(item 21) — merging them would silently drop a verified URL.`,
      );
    }
    if (!route.renderSourcePageId) {
      throw new ReconstructionError(
        `route ${route.routeId} (${route.url}) has no renderSourcePageId, so there is ` +
          `nothing to render it from. Task 13 marks this with route-render-source-missing; ` +
          `this generator does not substitute an arbitrary page for it.`,
      );
    }

    usedPageIds.add(route.renderSourcePageId);
    byKey.set(key, routes.length);
    const title = titleFor(route, siteSpec, pageTitleById);
    routes.push({
      routeId: route.routeId,
      key,
      url: route.url,
      path: clonePathFor(url),
      pageFile: options.pageFileFor(route.renderSourcePageId),
      pageSourceId: route.renderSourcePageId,
      ...(title !== undefined ? { title } : {}),
      renderCoverage: route.coverage,
      behaviorCoverage: route.behaviorCoverage,
      observedOnThisExactUrl: route.observedOnThisExactUrl,
      // Implementation reuse is not evidence promotion (item 25).
      verifiedOnThisRoute: route.behaviorCoverage === "exact-verified",
    });
  }

  return {
    routes,
    byKey,
    usedPageIds: [...usedPageIds].sort(),
  };
}
