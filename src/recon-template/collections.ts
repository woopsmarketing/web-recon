import type { RuntimeRouteMap } from "../reconstruction/index.js";
import type { LoadedSiteSpec } from "../sitespec/index.js";
import {
  isSlotizedScope,
  type CollectionSemanticKind,
  type CollectionSpec,
  type RouteScope,
  type SlotDefinition,
} from "./types.js";
import type { ResolvedRoutePolicy } from "./route-policy.js";

/**
 * Collection detection — REPRESENTATION ONLY.
 *
 * A "collection" is what the pipeline already knows about a repeated route
 * family (blog posts, docs pages, customer stories), restated once at the
 * template boundary where it is currently LOST: `site-map.json` used to carry
 * only {route, url, pageId, familyId, representative, renderCoverage}, so the
 * SiteSpec's `inferredRoutePattern`, member counts and represented-only state
 * died here. Nothing new is inferred — every field below is a restatement of a
 * SiteSpec family fact, a route-map fact or an applied route-scope decision.
 *
 * Two honesty rules are structural, not stylistic:
 *
 *   1. `discoveredMemberCount` is a CRAWL-CAPPED FLOOR. It counts the member
 *      URLs one bounded discovery run happened to see. `countIsFloor` is
 *      literally `true` in the schema so no reader can mistake it for a census.
 *   2. There is NO pagination detection anywhere in this repo, so there is no
 *      honest way to estimate a real total. `estimatedTotalMembers` is
 *      literally `null` in the schema — the field exists to say "unknown", and
 *      it cannot be filled in without new observation.
 *
 * This is emphatically NOT a blog engine: no article CRUD, no category UI, no
 * publishing flow, no CMS, and no source article is copied. It is a map.
 */

/** `/blog/next-15` → the family scope token the SiteSpec recorded, e.g. `blog`. */
const SEMANTIC_KIND_BY_SCOPE: Record<string, CollectionSemanticKind> = {
  blog: "blog",
  posts: "blog",
  news: "news",
  newsroom: "news",
  docs: "docs",
  documentation: "docs",
  guides: "docs",
  changelog: "changelog",
  customers: "customers",
  careers: "careers",
  jobs: "careers",
  resources: "resources",
};

function semanticKind(scopeToken: string | undefined): CollectionSemanticKind {
  if (scopeToken === undefined) return "other";
  return SEMANTIC_KIND_BY_SCOPE[scopeToken] ?? "other";
}

function collectionId(n: number): string {
  return `c${String(n).padStart(6, "0")}`;
}

interface Bucket {
  /** `scope:blog` or `pattern:/blog/<*>` — the grouping evidence, kept verbatim. */
  groupKey: string;
  routeScope?: string;
  familyIds: string[];
  order: number;
}

/**
 * Collections from families the pipeline already grouped.
 *
 * Grouping key, in order of preference: the family's `routeScope` (the URL
 * scope token Task 08 recorded), else its `inferredRoutePattern`. A family with
 * neither is a standalone page, not a collection member. A bucket becomes a
 * collection only when it holds at least two discovered members — one page is
 * a page.
 */
export function buildCollections(
  routeMap: RuntimeRouteMap,
  siteSpec: LoadedSiteSpec,
  slots: SlotDefinition[],
  policy: ResolvedRoutePolicy,
): CollectionSpec[] {
  const families = siteSpec.siteSpec.families;
  const familyById = new Map(families.map((f) => [f.familyId, f]));
  const buckets = new Map<string, Bucket>();
  for (const family of families) {
    const groupKey =
      family.routeScope !== undefined
        ? `scope:${family.routeScope}`
        : family.inferredRoutePattern !== undefined
          ? `pattern:${family.inferredRoutePattern}`
          : undefined;
    if (groupKey === undefined) continue;
    let bucket = buckets.get(groupKey);
    if (!bucket) {
      bucket = {
        groupKey,
        ...(family.routeScope !== undefined ? { routeScope: family.routeScope } : {}),
        familyIds: [],
        order: buckets.size,
      };
      buckets.set(groupKey, bucket);
    }
    bucket.familyIds.push(family.familyId);
  }

  // Route-side facts: which template routes serve which family, and which of
  // them serve a family's representative page.
  const familyByPage = new Map<string, string>();
  for (const page of siteSpec.siteSpec.pages) familyByPage.set(page.pageId, page.familyId);
  const representativePages = new Set<string>();
  for (const family of families) {
    if (family.representativePageId) representativePages.add(family.representativePageId);
  }

  const routesByRole = new Map<string, string[]>();
  for (const slot of slots) {
    if (slot.route === undefined) continue;
    const list = routesByRole.get(slot.route) ?? [];
    if (!list.includes(slot.role)) list.push(slot.role);
    routesByRole.set(slot.route, list);
  }

  const collections: CollectionSpec[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => a.order - b.order)) {
    const bucketFamilies = bucket.familyIds
      .map((id) => familyById.get(id)!)
      .filter((f) => f !== undefined);
    const discoveredMemberCount = bucketFamilies.reduce((sum, f) => sum + f.memberCount, 0);
    if (discoveredMemberCount < 2) continue;

    const memberRoutes: string[] = [];
    const representativeRoutes: string[] = [];
    const memberScopeCounts = new Map<RouteScope, number>();
    for (const route of routeMap.routes) {
      const familyId = familyByPage.get(route.pageSourceId);
      if (familyId === undefined || !bucket.familyIds.includes(familyId)) continue;
      memberRoutes.push(route.key);
      if (representativePages.has(route.pageSourceId)) representativeRoutes.push(route.key);
      const scope = policy.scopeByRoute.get(route.key) ?? policy.defaultScope;
      memberScopeCounts.set(scope, (memberScopeCounts.get(scope) ?? 0) + 1);
    }

    // The index route is claimed only when a route with exactly that key was
    // reconstructed (`/blog` for scope `blog`). Never synthesized.
    const indexKey = bucket.routeScope !== undefined ? `/${bucket.routeScope}` : undefined;
    const indexRoute =
      indexKey !== undefined && routeMap.routes.some((r) => r.key === indexKey) ? indexKey : null;

    const patterns = [
      ...new Set(
        bucketFamilies
          .map((f) => f.inferredRoutePattern)
          .filter((p): p is string => p !== undefined),
      ),
    ].sort();

    const hintRoutes = representativeRoutes.length > 0 ? representativeRoutes : memberRoutes;
    const fieldHints = [...new Set(hintRoutes.flatMap((r) => routesByRole.get(r) ?? []))].sort();

    collections.push({
      collectionId: collectionId(collections.length + 1),
      groupedBy: bucket.groupKey,
      ...(bucket.routeScope !== undefined ? { routeScope: bucket.routeScope } : {}),
      semanticKind: semanticKind(bucket.routeScope),
      sourceFamilyIds: [...bucket.familyIds].sort(),
      // One inferred pattern or none: two different patterns in one scope are
      // not a single detail shape, and guessing which one wins would be an
      // invention.
      detailPattern: patterns.length === 1 ? patterns[0]! : null,
      indexRoute,
      representativeRoutes: [...representativeRoutes].sort(),
      reconstructedRoutes: [...memberRoutes].sort(),
      discoveredMemberCount,
      observedMemberCount: bucketFamilies.reduce((s, f) => s + f.exactObservedMemberCount, 0),
      representedOnlyMemberCount: bucketFamilies.reduce(
        (s, f) => s + f.representedOnlyMemberCount,
        0,
      ),
      countIsFloor: true,
      estimatedTotalMembers: null,
      countEvidence: "sitespec-family-member-urls-crawl-capped-no-pagination-detection",
      fieldHints,
      renderPolicy: {
        slotizedRoutes: memberRoutes.filter((r) =>
          isSlotizedScope(policy.scopeByRoute.get(r) ?? policy.defaultScope),
        ).length,
        scopeCounts: [...memberScopeCounts.entries()]
          .map(([scope, routes]) => ({ scope, routes }))
          .sort((a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0)),
      },
    });
  }
  return collections;
}
