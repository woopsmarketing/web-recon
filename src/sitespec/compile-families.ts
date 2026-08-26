import type { PageFamilySet } from "../selector/types.js";
import type { ObservedSitePage } from "../multi-observer/types.js";
import {
  sortLimitations,
  type FamilySpec,
  type LimitationCode,
} from "./types.js";

/**
 * Compile Task 07/08 page families into the SiteSpec family model (items 18, 19).
 *
 * A family here means exactly what it meant two Tasks ago: *pages that
 * deterministic route + structure signals say are likely to share a structural
 * pattern*. It is deliberately NOT renamed to `component`, and there is no
 * `componentId` field (item 19) — a family is a statement about a set of URLs,
 * while a component is a claim about a render tree, and conflating the two is
 * how an honest grouping quietly becomes a fabricated architecture.
 *
 * Nothing is re-derived. Membership, representative choice and the coarse-signal
 * evidence string come straight from `page-families.json`; this layer only adds
 * the arithmetic a reconstruction engine needs: which members were actually
 * observed, and which are only represented.
 */

export interface CompiledFamilies {
  families: FamilySpec[];
  /** Verified URL → the family that contains it. */
  familyIdByUrl: Map<string, string>;
  /** Family id → the representative's PageSpec id, when it was observed. */
  representativePageIdByFamily: Map<string, string>;
}

export function compileFamilies(
  pageFamilies: PageFamilySet,
  successfulPages: readonly ObservedSitePage[],
): CompiledFamilies {
  const pagesByUrl = new Map<string, ObservedSitePage>();
  for (const page of successfulPages) pagesByUrl.set(page.url, page);

  const pagesByFamily = new Map<string, ObservedSitePage[]>();
  for (const page of successfulPages) {
    const bucket = pagesByFamily.get(page.familyId);
    if (bucket) bucket.push(page);
    else pagesByFamily.set(page.familyId, [page]);
  }

  const familyIdByUrl = new Map<string, string>();
  const representativePageIdByFamily = new Map<string, string>();
  const families: FamilySpec[] = [];

  for (const family of [...pageFamilies.families].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const memberUrls = family.members.map((m) => m.url).sort();
    for (const url of memberUrls) familyIdByUrl.set(url, family.id);

    const representativePage = pagesByUrl.get(family.representativeUrl);
    // A page is only a reconstruction source for its family when Task 09 filed
    // it as that family's REPRESENTATIVE. A validation sample of the same family
    // is a real observation of its own URL and never a stand-in for the others
    // (item 88).
    const representativePageId =
      representativePage && representativePage.role === "representative"
        ? representativePage.pageId
        : undefined;
    if (representativePageId !== undefined) {
      representativePageIdByFamily.set(family.id, representativePageId);
    }

    const observedVariantPageIds = (pagesByFamily.get(family.id) ?? [])
      .map((p) => p.pageId)
      .sort();

    const exactObservedMemberCount = memberUrls.filter((url) =>
      pagesByUrl.has(url),
    ).length;

    const limitations = new Set<LimitationCode>();
    if (representativePageId === undefined) {
      limitations.add("family-representative-not-observed");
    }

    families.push({
      familyId: family.id,
      familyType: family.type,
      representativeUrl: family.representativeUrl,
      ...(representativePageId !== undefined ? { representativePageId } : {}),
      observedVariantPageIds,
      memberUrls,
      memberCount: memberUrls.length,
      exactObservedMemberCount,
      representedOnlyMemberCount: memberUrls.length - exactObservedMemberCount,
      ...(family.localePrefix !== undefined ? { localePrefix: family.localePrefix } : {}),
      ...(family.routeScope !== undefined ? { routeScope: family.routeScope } : {}),
      ...(family.inferredRoutePattern !== undefined
        ? { inferredRoutePattern: family.inferredRoutePattern }
        : {}),
      ...(family.structuralMatchReason !== undefined
        ? { selectionEvidence: family.structuralMatchReason }
        : {}),
      limitations: sortLimitations(limitations),
    });
  }

  return { families, familyIdByUrl, representativePageIdByFamily };
}
