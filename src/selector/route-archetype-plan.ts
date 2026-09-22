import { z } from "zod";
import {
  PageFamilySchema,
  type PageFamily,
  type PageFamilySet,
  type PageSelection,
  type SelectedPage,
} from "./types.js";

/**
 * Route Archetype Plan (WP 28.7).
 *
 * A pure PROJECTION over data the selector already produced
 * (`page-families.json` + `selected-pages.json`) — no new crawl, no browser, no
 * network, no new pipeline stage. It answers one question a consumer of the
 * selector output should not have to re-derive by hand: "which discovered
 * routes are the SAME structural thing, and which one of them actually gets a
 * deep observation?"
 *
 * It adds nothing the selector did not already decide. `buildPageFamilies` /
 * `buildPageSelection` (Task 07/08) already grouped URLs and already picked one
 * representative per group; this module only makes both facts explicit and
 * gives them a stable shape to persist.
 *
 * Every field is either:
 *  - copied verbatim from `PageFamily` / `SelectedPage`,
 *  - a cheap deterministic string built ONLY from route-shape fields
 *    (`routeScope` / `inferredRoutePattern` / `localePrefix`), or
 *  - explicitly omitted with a doc comment when it cannot be derived honestly.
 *
 * This respects the same no-guessed-semantics policy `types.ts` states for
 * `PageFamilyType` (content-duplicate / sibling-pattern / scope-structure /
 * singleton are grouping REASONS, never labels like "blog-detail").
 */

export const SCHEMA_VERSION = 1 as const;

/** One archetype — one PageFamily, projected. */
export const RouteArchetypeSchema = z.object({
  /** `PageFamily.id` (`f000001…`), unchanged. */
  archetypeId: z.string(),
  /**
   * Cheap, deterministic, NON-semantic string derived from route shape only
   * (`localePrefix` + `inferredRoutePattern ?? routeScope`). Omitted — never
   * guessed — when the family has neither (the site root, or any family whose
   * members share no route scope at all).
   */
  label: z.string().optional(),
  /** `inferredRoutePattern ?? routeScope`. Omitted for the same reason as `label`. */
  routePattern: z.string().optional(),
  /** `PageFamily.signals.memberCount`, verbatim. */
  memberCount: z.number().int().positive(),
  /**
   * The representative URL, plus — when the family has more than one member —
   * exactly one further member URL for illustrative context (deterministically
   * the lexicographically smallest non-representative member).
   *
   * NOTE: this is NOT the multi-observer validation sample. Which member (if
   * any) gets a validation deep-observation is decided by a later stage
   * (`multi-observer/plan-pages.ts`) and is not persisted in
   * `page-families.json` / `selected-pages.json` — the only two inputs this
   * projection is allowed to read to stay pure. The second URL here is context
   * only; it carries no claim that the page was ever observed.
   */
  representativeRoutes: z.array(z.string()).min(1),
  /** `shallowSkeletonHash ?? landmarkHash`. Undefined when the family has neither. */
  layoutFingerprint: z.string().optional(),
  /**
   * `sharedShell` (a header/footer subtree isolated by diffing two pages' DOM)
   * is deliberately NOT a field here: nothing in the codebase computes it today
   * and building a DOM-diff shell extractor is out of scope for this task.
   */
  /** `"<SelectedPage.reason>: <reasonDetail>"`. */
  reasonSelected: z.string(),
  /**
   * Always `true`. Rule: `selected-pages.json` already guarantees exactly one
   * representative per family, and every representative gets a deep
   * observation (`multi-observer/plan-pages.ts` puts every `selection.pages`
   * entry in the `representative` block) — so every archetype in this plan
   * gets a deep observation, and this field just says so explicitly.
   */
  deepReconstruct: z.literal(true),
});
export type RouteArchetype = z.infer<typeof RouteArchetypeSchema>;

/** Plan-level counts (the "500 posts → 2 jobs" evidence). */
export const RouteArchetypePlanSummarySchema = z.object({
  /** = `selection.verifiedUrlCount`. */
  totalDiscoveredRoutes: z.number().int().nonnegative(),
  /** = number of archetypes = `familySet.familyCount`. */
  totalArchetypes: z.number().int().nonnegative(),
  /** Sum of every archetype's `memberCount`; equals `totalDiscoveredRoutes`. */
  totalMembersRepresented: z.number().int().nonnegative(),
  /**
   * Sum over archetypes of `memberCount - 1` — every member represented by an
   * archetype WITHOUT itself being deep-reconstructed, because only its
   * archetype's single representative is. This is the number that proves 40
   * `/notice/<n>` detail pages collapsed into one deep-observation job.
   */
  representedWithoutDeepReconstructionCount: z.number().int().nonnegative(),
});
export type RouteArchetypePlanSummary = z.infer<typeof RouteArchetypePlanSummarySchema>;

export const RouteArchetypePlanSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  rootUrl: z.string(),
  /** = `selection.selectedAt` — reused so this stays a pure function of its inputs (no wall clock of its own). */
  builtAt: z.string(),
  summary: RouteArchetypePlanSummarySchema,
  /** Stable order: same order as `familySet.families` (deterministic `f000001…` sort). */
  archetypes: z.array(RouteArchetypeSchema),
});
export type RouteArchetypePlan = z.infer<typeof RouteArchetypePlanSchema>;

/** Byte-wise URL comparison — no locale/ICU coupling (matches multi-observer's `byUrl`). */
function byUrl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `localePrefix:inferredRoutePattern ?? routeScope`, or undefined if neither exists. */
function deriveLabel(family: PageFamily): string | undefined {
  const pattern = family.inferredRoutePattern ?? family.routeScope;
  if (!pattern) return undefined;
  return family.localePrefix ? `${family.localePrefix}:${pattern}` : pattern;
}

function representativeRoutesOf(family: PageFamily): string[] {
  const others = family.members
    .map((m) => m.url)
    .filter((url) => url !== family.representativeUrl)
    .sort(byUrl);
  return others.length > 0 ? [family.representativeUrl, others[0]] : [family.representativeUrl];
}

function projectArchetype(family: PageFamily, selectedPage: SelectedPage): RouteArchetype {
  const label = deriveLabel(family);
  const routePattern = family.inferredRoutePattern ?? family.routeScope;
  return {
    archetypeId: family.id,
    ...(label ? { label } : {}),
    ...(routePattern ? { routePattern } : {}),
    memberCount: family.signals.memberCount,
    representativeRoutes: representativeRoutesOf(family),
    ...(family.shallowSkeletonHash ?? family.landmarkHash
      ? { layoutFingerprint: family.shallowSkeletonHash ?? family.landmarkHash }
      : {}),
    reasonSelected: `${selectedPage.reason}: ${selectedPage.reasonDetail}`,
    deepReconstruct: true,
  };
}

/**
 * Build the Route Archetype Plan from the two selector artifacts already on
 * disk. Pure: same `familySet` + `selection` in ⇒ byte-identical plan out.
 */
export function buildRouteArchetypePlan(
  familySet: PageFamilySet,
  selection: PageSelection,
): RouteArchetypePlan {
  if (familySet.rootUrl !== selection.rootUrl) {
    throw new Error(
      `Route archetype plan input mismatch: page-families.json rootUrl (${familySet.rootUrl}) != selected-pages.json rootUrl (${selection.rootUrl})`,
    );
  }

  const selectedByFamilyId = new Map(selection.pages.map((p) => [p.familyId, p]));

  const families = [...familySet.families].sort((a, b) => byUrl(a.id, b.id));
  const archetypes: RouteArchetype[] = [];
  for (const family of families) {
    PageFamilySchema.parse(family);
    const selectedPage = selectedByFamilyId.get(family.id);
    if (!selectedPage) {
      throw new Error(
        `Route archetype plan: family ${family.id} has no matching entry in selected-pages.json`,
      );
    }
    archetypes.push(projectArchetype(family, selectedPage));
  }

  const totalMembersRepresented = archetypes.reduce((sum, a) => sum + a.memberCount, 0);
  const representedWithoutDeepReconstructionCount = archetypes.reduce(
    (sum, a) => sum + (a.memberCount - 1),
    0,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    rootUrl: familySet.rootUrl,
    builtAt: selection.selectedAt,
    summary: {
      totalDiscoveredRoutes: selection.verifiedUrlCount,
      totalArchetypes: familySet.familyCount,
      totalMembersRepresented,
      representedWithoutDeepReconstructionCount,
    },
    archetypes,
  };
}
