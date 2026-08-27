import type { LoadedSiteSpec } from "../sitespec/index.js";
import type { RuntimeRouteMap } from "../reconstruction/index.js";
import { RECON_TEMPLATE_SCHEMA_VERSION, isSlotizedScope, type SiteMap } from "./types.js";
import type { RouteScope, SlotDefinition } from "./types.js";
import { familyIdByPageId, type ResolvedRoutePolicy } from "./route-policy.js";
import { buildCollections } from "./collections.js";

/**
 * Minimal site map — facts the pipeline already established, restated in one
 * artifact. No crawler runs here and no SiteGraph is inferred: routes come
 * from the reconstruction's route map, families and representatives from the
 * SiteSpec, and internal links from the URL slots this compiler extracted.
 *
 * Task 27 adds two things in the same spirit — the route-scope decision the
 * compiler actually applied, and the COLLECTIONS the family evidence already
 * described (`collections.ts`). Both are additive and optional in the schema:
 * a Task 18/19 site-map.json on disk still parses byte for byte as it is.
 */
export function buildSiteMap(
  routeMap: RuntimeRouteMap,
  siteSpec: LoadedSiteSpec,
  slots: SlotDefinition[],
  policy: ResolvedRoutePolicy,
): SiteMap {
  const familyByPage = familyIdByPageId(siteSpec);
  const representativePages = new Set<string>();
  for (const family of siteSpec.siteSpec.families) {
    if (family.representativePageId) representativePages.add(family.representativePageId);
  }

  const internalLinks = new Set<string>();
  for (const slot of slots) {
    if (slot.type !== "url" || slot.urlKind !== "internal") continue;
    if (typeof slot.defaultValue === "string") internalLinks.add(slot.defaultValue);
  }

  const slotCountByRoute = new Map<string, number>();
  for (const slot of slots) {
    if (slot.route === undefined) continue;
    slotCountByRoute.set(slot.route, (slotCountByRoute.get(slot.route) ?? 0) + 1);
  }

  const excluded = new Set(
    policy.decisions.filter((d) => d.scope === "exclude").map((d) => d.route),
  );

  return {
    schemaVersion: RECON_TEMPLATE_SCHEMA_VERSION,
    root: routeMap.rootUrl,
    routes: routeMap.routes
      .filter((route) => !excluded.has(route.key))
      .map((route) => ({
        route: route.key,
        url: route.url,
        pageId: route.pageSourceId,
        familyId: familyByPage.get(route.pageSourceId),
        representative: representativePages.has(route.pageSourceId),
        renderCoverage: route.renderCoverage,
        scope: policy.scopeByRoute.get(route.key) ?? policy.defaultScope,
        slotCount: slotCountByRoute.get(route.key) ?? 0,
      })),
    pageFamilies: siteSpec.siteSpec.families.map((family) => ({
      familyId: family.familyId,
      familyType: family.familyType,
      representativeUrl: family.representativeUrl,
      memberCount: family.memberCount,
    })),
    representatives: [...representativePages].sort(),
    internalLinks: [...internalLinks].sort(),
    routePolicy: {
      applied: policy.applied,
      ...(policy.policyFile !== undefined ? { policyFile: policy.policyFile } : {}),
      defaultScope: policy.defaultScope,
      scopeCounts: (Object.entries(policy.scopeCounts) as [RouteScope, number][])
        .filter(([, routes]) => routes > 0)
        .map(([scope, routes]) => ({ scope, routes })),
      slotizedRoutes: policy.decisions.filter((d) => isSlotizedScope(d.scope)).length,
      slotizedPages: policy.slotizedPageIds.size,
      structureOnlyPages: policy.unslotizedPageIds.size,
      // Emitted only when there is one, so a policy-free site map keeps the
      // bytes it had before this count existed.
      ...(policy.structureOnlySharedPageRoutes > 0
        ? { structureOnlySharedPageRoutes: policy.structureOnlySharedPageRoutes }
        : {}),
    },
    collections: buildCollections(routeMap, siteSpec, slots, policy),
    excludedRoutes: policy.decisions
      .filter((d) => d.scope === "exclude")
      .map((d) => ({
        route: d.route,
        url: d.url,
        pageId: d.pageId,
        ...(d.reason !== undefined ? { reason: d.reason } : {}),
      })),
  };
}
