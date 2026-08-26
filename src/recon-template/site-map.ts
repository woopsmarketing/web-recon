import type { LoadedSiteSpec } from "../sitespec/index.js";
import type { RuntimeRouteMap } from "../reconstruction/index.js";
import { RECON_TEMPLATE_SCHEMA_VERSION, type SiteMap } from "./types.js";
import type { SlotDefinition } from "./types.js";

/**
 * Minimal site map — facts the pipeline already established, restated in one
 * artifact. No crawler runs here and no SiteGraph is inferred: routes come
 * from the reconstruction's route map, families and representatives from the
 * SiteSpec, and internal links from the URL slots this compiler extracted.
 */
export function buildSiteMap(
  routeMap: RuntimeRouteMap,
  siteSpec: LoadedSiteSpec,
  slots: SlotDefinition[],
): SiteMap {
  const familyByPage = new Map<string, string>();
  const representativePages = new Set<string>();
  for (const family of siteSpec.siteSpec.families) {
    if (family.representativePageId) representativePages.add(family.representativePageId);
  }
  for (const page of siteSpec.siteSpec.pages) {
    familyByPage.set(page.pageId, page.familyId);
  }

  const internalLinks = new Set<string>();
  for (const slot of slots) {
    if (slot.type !== "url" || slot.urlKind !== "internal") continue;
    if (typeof slot.defaultValue === "string") internalLinks.add(slot.defaultValue);
  }

  return {
    schemaVersion: RECON_TEMPLATE_SCHEMA_VERSION,
    root: routeMap.rootUrl,
    routes: routeMap.routes.map((route) => ({
      route: route.key,
      url: route.url,
      pageId: route.pageSourceId,
      familyId: familyByPage.get(route.pageSourceId),
      representative: representativePages.has(route.pageSourceId),
      renderCoverage: route.renderCoverage,
    })),
    pageFamilies: siteSpec.siteSpec.families.map((family) => ({
      familyId: family.familyId,
      familyType: family.familyType,
      representativeUrl: family.representativeUrl,
      memberCount: family.memberCount,
    })),
    representatives: [...representativePages].sort(),
    internalLinks: [...internalLinks].sort(),
  };
}
