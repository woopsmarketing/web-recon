import type { ContentReader } from "../content/reader";
import type { TemplateRoute } from "./template-manifest";

/**
 * Route plan — which concrete pages ONE site's build generates, derived from the
 * Template's declared routes + the site's visible content. One source for:
 *   - generateStaticParams (Template code: ctx.routes.params(key))
 *   - navigation / links (ctx.routes.has(key))
 *   - sitemap (ctx.routes.paths())
 *   - build-time pruning of routes with no page (Next static export aborts on an
 *     empty generateStaticParams and still writes notFound() pages) — an internal
 *     build detail, never a content or Template-domain concept
 *   - package QA (exactly these HTML pages, nothing else)
 *
 * Pure: no filesystem, no clock.
 */

export interface PlannedRoute {
  key: string;
  /** App Router pattern, e.g. "/portfolio/[slug]" */
  pattern: string;
  /** One entry per generated page (static routes: one empty object). */
  params: Record<string, string>[];
  /** Concrete URL path per generated page, same order as params. */
  paths: string[];
}

/** app/-relative route file/dir to delete before `next build` because it generates no page. */
export interface PruneEntry {
  key: string;
  /** app/-relative directory of the route segment, e.g. "portfolio/page/[n]" or "portfolio" */
  dir: string;
  /** "segment": remove the whole dynamic segment dir · "page": remove only that dir's page.* file */
  scope: "segment" | "page";
}

export interface RoutePlan {
  routes: PlannedRoute[];
  prune: PruneEntry[];
  /** Slugs that can never address an item under each item route (static sibling segments + platform reserved). */
  reservedSlugs: Record<string, string[]>;
}

export interface SiteRoutes {
  /** true when the route generates at least one page for this site */
  has(key: string): boolean;
  /** generateStaticParams() value for a dynamic route ([] when it generates nothing) */
  params(key: string): Record<string, string>[];
  /** concrete URL paths of one route, or of every route when key is omitted (plan order) */
  paths(key?: string): string[];
  plan: RoutePlan;
}

export class RoutePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutePlanError";
  }
}

const STATIC_SEG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DYNAMIC_SEG = /^\[([a-z][a-zA-Z0-9]*)\]$/;
/**
 * Slugs refused under ANY item route: `index` — a static export writes /x/index as
 * x/index.html, which common static hosts also serve for /x/ (collides with the list page).
 */
const PLATFORM_RESERVED_SLUGS = ["index"];

function segments(pattern: string): string[] {
  if (pattern === "/") return [];
  if (!pattern.startsWith("/") || pattern.endsWith("/")) throw new RoutePlanError(`route pattern "${pattern}" must start with "/" and not end with "/"`);
  const segs = pattern.slice(1).split("/");
  for (const s of segs) {
    if (!STATIC_SEG.test(s) && !DYNAMIC_SEG.test(s)) throw new RoutePlanError(`route pattern "${pattern}": invalid segment "${s}"`);
  }
  return segs;
}

function lastParam(key: string, segs: string[]): string {
  const dyn = segs.filter((s) => DYNAMIC_SEG.test(s));
  const last = segs[segs.length - 1];
  if (dyn.length !== 1 || !last || !DYNAMIC_SEG.test(last)) {
    throw new RoutePlanError(`route "${key}": exactly one dynamic segment, in last position, is required`);
  }
  return DYNAMIC_SEG.exec(last)![1]!;
}

export function planRoutes(declared: readonly TemplateRoute[], reader: ContentReader): RoutePlan {
  const keys = new Set<string>();
  const patterns = new Set<string>();
  const pageSizes = new Map<string, number>();
  for (const r of declared) {
    if (keys.has(r.key)) throw new RoutePlanError(`duplicate route key "${r.key}"`);
    if (patterns.has(r.path)) throw new RoutePlanError(`duplicate route pattern "${r.path}"`);
    keys.add(r.key);
    patterns.add(r.path);
    if ("list" in r) {
      const { pageSize, collection } = r.list;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new RoutePlanError(`route "${r.key}": invalid pageSize ${pageSize}`);
      const prev = pageSizes.get(collection);
      if (prev !== undefined && prev !== pageSize) throw new RoutePlanError(`list routes over "${collection}" disagree on pageSize (${prev} vs ${pageSize})`);
      pageSizes.set(collection, pageSize);
    }
  }

  // Reserved slugs per item route: static siblings of the slug segment + platform-reserved names.
  const reservedSlugs: Record<string, string[]> = {};
  for (const r of declared) {
    if (!("item" in r)) continue;
    const segs = segments(r.path);
    lastParam(r.key, segs);
    const prefix = segs.slice(0, -1);
    const reserved = new Set(PLATFORM_RESERVED_SLUGS);
    for (const other of declared) {
      if (other === r) continue;
      const os = segments(other.path);
      if (os.length > prefix.length && prefix.every((s, i) => os[i] === s)) {
        const sibling = os[prefix.length]!;
        if (STATIC_SEG.test(sibling)) reserved.add(sibling);
      }
    }
    reservedSlugs[r.key] = [...reserved].sort();
  }

  const routes: PlannedRoute[] = [];
  const prune: PruneEntry[] = [];
  const seenPaths = new Map<string, string>();
  for (const r of declared) {
    const segs = segments(r.path);
    let params: Record<string, string>[];
    if ("list" in r) {
      const first = reader.paginate({ type: r.list.collection, selection: { mode: "latest" } }, { page: 1, pageSize: r.list.pageSize });
      const pageCount = first?.pageCount ?? 0;
      if (r.list.page === "first") {
        if (segs.some((s) => DYNAMIC_SEG.test(s))) throw new RoutePlanError(`route "${r.key}": the first list page must be a static route`);
        params = pageCount >= 1 ? [{}] : [];
      } else {
        const name = lastParam(r.key, segs);
        // Page 1 is the "first" route: pages 2…N only, so /…/page/1 is never emitted.
        params = [];
        for (let n = 2; n <= pageCount; n++) params.push({ [name]: String(n) });
      }
    } else if ("item" in r) {
      const name = lastParam(r.key, segs);
      const reserved = new Set(reservedSlugs[r.key]);
      params = reader.listSlugs(r.item.collection).map((slug) => {
        if (reserved.has(slug)) {
          throw new RoutePlanError(`${r.item.collection} slug "${slug}" is reserved under ${r.path} (collides with a route segment); choose another slug`);
        }
        return { [name]: slug };
      });
    } else {
      if (segs.some((s) => DYNAMIC_SEG.test(s))) throw new RoutePlanError(`route "${r.key}": a dynamic route needs a list or item source`);
      params = [{}];
    }
    const paths = params.map((p) =>
      r.path === "/" ? "/" : `/${segs.map((s) => (DYNAMIC_SEG.test(s) ? p[DYNAMIC_SEG.exec(s)![1]!]! : s)).join("/")}`,
    );
    for (const p of paths) {
      const owner = seenPaths.get(p);
      if (owner) throw new RoutePlanError(`URL ${p} is generated by both "${owner}" and "${r.key}"`);
      seenPaths.set(p, r.key);
    }
    routes.push({ key: r.key, pattern: r.path, params, paths });
    if (params.length === 0) {
      const isDynamic = segs.some((s) => DYNAMIC_SEG.test(s));
      prune.push({ key: r.key, dir: segs.join("/"), scope: isDynamic ? "segment" : "page" });
    }
  }
  return { routes, prune, reservedSlugs };
}

export function createSiteRoutes(plan: RoutePlan): SiteRoutes {
  const byKey = new Map(plan.routes.map((r) => [r.key, r]));
  const get = (key: string) => {
    const r = byKey.get(key);
    if (!r) throw new RoutePlanError(`template reads undeclared route "${key}"`);
    return r;
  };
  return {
    has: (key) => get(key).params.length > 0,
    params: (key) => get(key).params.map((p) => ({ ...p })),
    paths: (key) => (key === undefined ? plan.routes.flatMap((r) => r.paths) : [...get(key).paths]),
    plan,
  };
}
