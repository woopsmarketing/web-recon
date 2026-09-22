import {
  AUTHORING_PLAN_LEVELS,
  AuthoringPlanFileSchema,
  CONTENT_SCHEMA_VERSION,
  type AuthoringPlanFile,
  type AuthoringPlanPageLevel,
  type BriefGap,
  type ContentBrief,
  type ContentIntent,
  type ContentUnitsFile,
  type PageContentPlan,
  type RegionPlanFile,
  type SiteContentPlan,
} from "./types.js";

/**
 * The authoring hierarchy, DERIVED and CHECKABLE (Task 28 Phase 9).
 *
 *   Brief → SiteContentPlan → PageContentPlan → RegionPlan → ContentUnit → Slot
 *
 * Every one of those levels already existed as a schema. What did not exist was
 * evidence that a level was derived from the one above it — so "the hierarchy
 * is real" was an architecture claim with no artifact behind it. This module
 * builds that artifact from things the run already has: the intent/brief, an
 * optional supplied SiteContentPlan, the RegionPlan layer, and the units.
 *
 * DETERMINISTIC. No LLM, no similarity score, no text analysis. A field the
 * brief did not state and no supplied plan filled is marked `engine-default`
 * and says so — it is never invented and never quietly inherited.
 */

const ENGINE_DEFAULTS = {
  category: "unstated — the brief named no category",
  audience: "unstated — the brief named no audience",
  positioning: "unstated — the brief named no positioning",
  primaryConversion: "unstated — the brief named no primary conversion",
} as const;

export interface BuildAuthoringPlanInput {
  runId: string;
  templateId: string;
  scopedRoutes: readonly string[];
  intent: ContentIntent;
  /** Non-essential brief fields the packet noticed were absent (Task 27 §5). */
  briefGaps?: readonly BriefGap[];
  unitsFile: ContentUnitsFile;
  /** Emitted by the packet when a page-regions artifact was supplied. */
  regionPlan?: RegionPlanFile;
  /**
   * A SiteContentPlan a generator or author already produced. When present its
   * fields WIN over brief-derived ones (the author saw the packet); every field
   * it filled is marked `supplied-plan` so the two are never confused.
   */
  sitePlan?: SiteContentPlan;
}

function pagePlanId(route: string): string {
  return `page:${route}`;
}

/** Site identity, field by field, with the provenance of each field recorded. */
function deriveSite(
  brief: ContentBrief | undefined,
  supplied: SiteContentPlan | undefined,
): {
  identity: { workingName: string; category: string; audience: string; positioning: string };
  provenance: Record<string, "brief" | "raw-intent" | "supplied-plan" | "engine-default">;
  primaryConversion: string;
  tone: string[];
  messages: string[];
} {
  const provenance: Record<string, "brief" | "raw-intent" | "supplied-plan" | "engine-default"> = {};
  const pick = (
    field: string,
    fromBrief: string | undefined,
    fromPlan: string | undefined,
    fallback: string,
  ): string => {
    if (fromBrief !== undefined && fromBrief !== "") {
      provenance[field] = "brief";
      return fromBrief;
    }
    if (fromPlan !== undefined && fromPlan !== "") {
      provenance[field] = "supplied-plan";
      return fromPlan;
    }
    provenance[field] = "engine-default";
    return fallback;
  };
  const workingNameFallback = supplied?.siteIdentity.workingName;
  const workingName =
    brief?.workingName !== undefined && brief.workingName !== ""
      ? ((provenance["workingName"] = "brief"), brief.workingName)
      : workingNameFallback !== undefined && workingNameFallback !== ""
        ? ((provenance["workingName"] = "supplied-plan"), workingNameFallback)
        : ((provenance["workingName"] = "engine-default"), "unnamed working site");
  const identity = {
    workingName,
    category: pick("category", brief?.category, supplied?.siteIdentity.category, ENGINE_DEFAULTS.category),
    audience: pick("audience", brief?.audience, supplied?.siteIdentity.audience, ENGINE_DEFAULTS.audience),
    positioning: pick(
      "positioning",
      brief?.positioning,
      supplied?.siteIdentity.positioning,
      ENGINE_DEFAULTS.positioning,
    ),
  };
  const primaryConversion = pick(
    "primaryConversion",
    brief?.primaryConversion,
    supplied?.primaryConversion,
    ENGINE_DEFAULTS.primaryConversion,
  );
  const briefTone = brief?.tone ?? [];
  const tone = briefTone.length > 0 ? briefTone : (supplied?.tone ?? []);
  provenance["tone"] = briefTone.length > 0 ? "brief" : supplied?.tone?.length ? "supplied-plan" : "engine-default";
  const messages = supplied?.messages ?? [];
  provenance["messages"] = messages.length > 0 ? "supplied-plan" : "engine-default";
  // The raw intent is ALWAYS the root of the chain, even when a brief filled
  // every field: what the user actually said is the thing the plan answers to.
  provenance["goal"] = brief?.goal !== undefined && brief.goal !== "" ? "brief" : "raw-intent";
  return { identity, provenance, primaryConversion, tone: [...tone], messages: [...messages] };
}

export function buildAuthoringPlan(input: BuildAuthoringPlanInput): AuthoringPlanFile {
  const { intent, unitsFile } = input;
  const brief = intent.brief;
  const scopedRoutes = [...input.scopedRoutes];
  const site = deriveSite(brief, input.sitePlan);

  // ---- unit → region -----------------------------------------------------
  const regionByUnitId = new Map<string, string>();
  for (const plan of input.regionPlan?.plans ?? []) {
    for (const unitId of plan.unitIds) {
      if (!regionByUnitId.has(unitId)) regionByUnitId.set(unitId, plan.regionId);
    }
  }

  // ---- units -------------------------------------------------------------
  const unitsByRoute = new Map<string, string[]>();
  const globalUnitIds: string[] = [];
  const parentCount = new Map<string, number>();
  const units = unitsFile.units.map((unit) => {
    const regionId = regionByUnitId.get(unit.unitId);
    const parentLevel = regionId !== undefined ? "region" : unit.scope === "global" ? "site" : "page";
    const derivedFrom =
      regionId !== undefined
        ? regionId
        : unit.scope === "global"
          ? "site"
          : pagePlanId(unit.route ?? "");
    parentCount.set(unit.unitId, (parentCount.get(unit.unitId) ?? 0) + 1);
    if (unit.scope === "global") globalUnitIds.push(unit.unitId);
    else if (unit.route !== undefined) {
      const list = unitsByRoute.get(unit.route) ?? [];
      list.push(unit.unitId);
      unitsByRoute.set(unit.route, list);
    }
    return {
      unitId: unit.unitId,
      scope: unit.scope,
      ...(unit.route !== undefined ? { route: unit.route } : {}),
      kind: unit.kind,
      parentLevel: parentLevel as "region" | "page" | "site",
      derivedFrom,
      derivation:
        regionId !== undefined
          ? "the PageRegion that owns the unit's first slot key claims the whole unit (region-plan.ts)"
          : unit.scope === "global"
            ? "a global unit renders on every page, so it hangs from the site level, never one page plan"
            : "no region claimed the unit; it hangs directly from its route's page plan",
      slotKeys: unit.slots.map((slot) => slot.key),
    };
  });

  // ---- regions -----------------------------------------------------------
  const regionsByRoute = new Map<string, string[]>();
  const orphanRegionIds: string[] = [];
  const routeSet = new Set(scopedRoutes);
  const regions = (input.regionPlan?.plans ?? []).map((plan) => {
    const ownRoutes = plan.routes.filter((route) => routeSet.has(route));
    const parentRoute = ownRoutes[0];
    const derivedFrom = plan.scope === "global" ? "site" : parentRoute !== undefined ? pagePlanId(parentRoute) : "";
    if (derivedFrom === "") orphanRegionIds.push(plan.regionId);
    for (const route of ownRoutes) {
      const list = regionsByRoute.get(route) ?? [];
      list.push(plan.regionId);
      regionsByRoute.set(route, list);
    }
    return {
      regionId: plan.regionId,
      scope: plan.scope,
      derivedFrom,
      derivation:
        plan.scope === "global"
          ? "a global region renders on every page, so it hangs from the site level"
          : "the region's first in-scope route owns it; every route it appears on is listed",
      routes: ownRoutes,
      unitIds: plan.unitIds,
      slotKeys: plan.slotKeys,
      purpose: plan.purpose,
    };
  });

  // ---- page plans --------------------------------------------------------
  const suppliedPlanByRoute = new Map<string, PageContentPlan>();
  for (const plan of input.sitePlan?.pagePlans ?? []) suppliedPlanByRoute.set(plan.route, plan);
  const slotKeysByUnitId = new Map(units.map((unit) => [unit.unitId, unit.slotKeys]));
  const pages: AuthoringPlanPageLevel[] = scopedRoutes.map((route) => {
    const unitIds = unitsByRoute.get(route) ?? [];
    const supplied = suppliedPlanByRoute.get(route);
    return {
      planId: pagePlanId(route),
      route,
      derivedFrom: "site" as const,
      derivation:
        supplied !== undefined
          ? "a PageContentPlan for this route was supplied and is carried verbatim under the site plan"
          : "no PageContentPlan was supplied for this scoped route; the page exists in the chain with its units, and the consistency review reports the gap",
      supplied: supplied !== undefined,
      ...(supplied !== undefined ? { plan: supplied } : {}),
      regionIds: regionsByRoute.get(route) ?? [],
      unitIds,
      slotKeys: unitIds.reduce((total, id) => total + (slotKeysByUnitId.get(id)?.length ?? 0), 0),
    };
  });

  // ---- closure -----------------------------------------------------------
  const knownRegionIds = new Set(regions.map((region) => region.regionId));
  const knownPageIds = new Set(pages.map((page) => page.planId));
  const orphanUnitIds = units
    .filter((unit) =>
      unit.parentLevel === "region"
        ? !knownRegionIds.has(unit.derivedFrom)
        : unit.parentLevel === "page"
          ? !knownPageIds.has(unit.derivedFrom)
          : false,
    )
    .map((unit) => unit.unitId);
  const duplicateParentUnitIds = [...parentCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([unitId]) => unitId);
  const routesWithoutPagePlan = pages.filter((page) => !page.supplied).map((page) => page.route);
  const slotKeyCount = new Set(units.flatMap((unit) => unit.slotKeys)).size;
  const unitSlotKeys = new Set(units.flatMap((unit) => unit.slotKeys));
  const everySlotKeyBelongsToAUnit = unitsFile.units.every((unit) =>
    unit.slots.every((slot) => unitSlotKeys.has(slot.key)),
  );
  const unitsReachable = units.length - orphanUnitIds.length;
  const everyRegionHasAParent = orphanRegionIds.length === 0;
  const everyUnitHasExactlyOneParent = orphanUnitIds.length === 0 && duplicateParentUnitIds.length === 0;

  return AuthoringPlanFileSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-authoring-plan-v1",
    runId: input.runId,
    templateId: input.templateId,
    levels: [...AUTHORING_PLAN_LEVELS],
    scopedRoutes,
    brief: {
      present: brief !== undefined,
      source: brief?.goal !== undefined && brief.goal !== "" ? "brief-file" : "raw-intent",
      goal: brief?.goal !== undefined && brief.goal !== "" ? brief.goal : intent.rawIntent,
      preferences: intent.preferences,
      providedFacts: intent.providedFacts.length,
      gaps: [...(input.briefGaps ?? [])],
    },
    site: {
      planId: "site",
      derivedFrom: "brief",
      derivation:
        "each identity field is taken from the brief when the brief stated it, else from a supplied " +
        "SiteContentPlan, else marked engine-default — a field nobody stated is never invented here",
      identityProvenance: site.provenance,
      siteIdentity: site.identity,
      primaryConversion: site.primaryConversion,
      tone: site.tone,
      messages: site.messages,
      supplied: input.sitePlan !== undefined,
    },
    pages,
    regions,
    units,
    regionLayer: {
      kind: input.regionPlan?.contractSource.kind ?? "absent",
      regionsRead: input.regionPlan?.contractSource.regionsRead ?? 0,
      unitsClaimedByARegion: regionByUnitId.size,
      note:
        input.regionPlan === undefined
          ? "no page-regions artifact was supplied; units hang directly from their page plan (global units from the site). The chain is complete WITHOUT the region layer — this is a stated absence, not a silent one."
          : "regions come from the PageRegion consumer contract (regionId / scope / slotKeys / pages). Region granularity follows the source markup and is NOT uniform, so units no region claims are expected and are listed on the region plan.",
    },
    closure: {
      scopedRoutes: scopedRoutes.length,
      pagePlans: pages.length,
      regions: regions.length,
      units: units.length,
      slotKeys: slotKeyCount,
      unitsReachable,
      siteDerivedFromBrief: true,
      everyRouteHasAPagePlan: routesWithoutPagePlan.length === 0,
      everyRegionHasAParent,
      everyUnitHasExactlyOneParent,
      everySlotKeyBelongsToAUnit,
      routesWithoutPagePlan,
      orphanRegionIds,
      orphanUnitIds,
      duplicateParentUnitIds,
      // COMPLETE means the STRUCTURE closes: every unit reaches the site level
      // through exactly one parent and every slot key belongs to a unit. It
      // deliberately does NOT require `everyRouteHasAPagePlan` — a missing page
      // plan is a CONTENT gap the consistency review reports as an error, not a
      // broken derivation chain, and folding the two together would let a
      // structural defect hide behind a content one.
      complete: everyUnitHasExactlyOneParent && everyRegionHasAParent && everySlotKeyBelongsToAUnit,
    },
    provenance: "derived",
  });
}
