/**
 * Stage dependency graph + resolution-driven invalidation (spec §12).
 *
 * The graph is explicit and closed:
 *
 *   reconstruction → template → content → { theme, seo } → production
 *                    template ────────────→ assets ──────→ production
 *
 * and each resolution field DIRECTLY affects the stages the spec names —
 * `invalidatedStages` then closes that set over the graph above, so a
 * content-affecting field also stales theme + seo + production:
 *
 *   productionBaseUrl → seo
 *   facts             → content (affected slots) + seo (structured data)
 *   urls              → content + seo
 *   routeContent      → content + seo
 *   assets            → assets
 *   fontDecisions     → assets                  (layout-QA note recorded, §12)
 *   theme selection   → theme                   (closure adds production only)
 *
 * Reconstruction / template are frozen roots: unless the SOURCE URL changes
 * (out of release scope) they are NEVER re-run (spec §12/§26).
 */
import type { AuthoredState, ProductionResolution, ReleaseStage } from "./types.js";

/** stage → its direct upstream dependencies. */
export const STAGE_DEPENDENCIES: Record<ReleaseStage, ReleaseStage[]> = {
  reconstruction: [],
  template: ["reconstruction"],
  content: ["template"],
  // A theme run pins its content run (manifest.contentRunDir) — a content
  // rerun therefore invalidates the theme overlay run too.
  theme: ["template", "content"],
  seo: ["template", "content"],
  // NOTE: the asset inventory join of content imageBriefs is advisory; the
  // release graph follows spec §12 (image/font → assets) and records the
  // simplification as a project limitation.
  assets: ["template"],
  production: ["template", "content", "theme", "seo", "assets"],
};

/** Deterministic topological order for execution. */
export const STAGE_ORDER: readonly ReleaseStage[] = [
  "reconstruction",
  "template",
  "content",
  "theme",
  "seo",
  "assets",
  "production",
];

/** Theme selection → theme + production. Reconstruction / template / content
 *  are NEVER touched by a theme edit: theme is a paint overlay over an
 *  unchanged template + content (Task 20). */
export const THEME_SELECTION_IMPACTS: ReleaseStage[] = ["theme", "production"];

/**
 * AUTHORED-STATE impacts (Task 28 Phase 2) — the direct stages an edit to one
 * `authored` field makes stale. `THEME_SELECTION_IMPACTS` above is the theme
 * row of this same table and is left where Task 27 put it.
 *
 *   slotValues  content is materialized FROM this map (store.ts write doctrine)
 *   theme       THEME_SELECTION_IMPACTS
 *   assets      the assets stage applies them (stages.ts `assetsStageRunner`)
 *   brand       the PRODUCTION BAKE is where a brand plan can be applied: the
 *               template is frozen and content/theme/seo/assets never read it.
 *
 * HONESTY NOTE ON `brand`. As of this commit NO stage reads `authored.brand` —
 * Phase 2's bake-time rewrite is the consumer being built alongside this. The
 * impact set is therefore CONSERVATIVE: a brand decision reruns the production
 * compile, which today reproduces the same bytes. Over-staleness costs a
 * rebuild; under-staleness ships a decision the operator believes was applied,
 * which is the failure mode worth paying to avoid. This comment is the record
 * that the rerun is currently a no-op in OUTPUT, not in selection.
 */
export const AUTHORED_SLOT_VALUE_IMPACTS: ReleaseStage[] = ["content"];
export const AUTHORED_ASSET_IMPACTS: ReleaseStage[] = ["assets", "production"];
export const AUTHORED_BRAND_IMPACTS: ReleaseStage[] = ["production"];

/**
 * ENABLEMENT impacts (Task 28 Phases 5 + 6), each row derived from a REAL
 * consumer rather than from intuition:
 *
 *   disabledRoutes -> content   `contentStageRunner` computes its `routes`
 *                               from the content manifest's scopedRoutes; a
 *                               disabled route must leave that scope, which
 *                               changes content-units and slot accounting
 *                     seo       `production-plan.ts` loops the route table for
 *                               title/description/canonical/og/twitter/jsonLd,
 *                               and `robots-sitemap.ts` builds the urlset from
 *                               `plan.routes`
 *                     assets    `assets/inventory.ts` joins by slotKey +
 *                               pageId and its `usageCount` IS `pageIds.length`
 *                     production the bake, the static export, the head splice,
 *                               the brand census and QA are all per-route
 *
 *   disabledRegions -> content   the region's slot keys leave the writable
 *                                population and take a new disposition
 *                      assets    image slots inside a disabled region stop
 *                                being referenced
 *                      production the bake is where the region is physically
 *                                not rendered
 *
 * The DAG closure (`downstreamOf`) adds theme + seo + production to the region
 * row and theme to the route row. Both rows inherit the `brand` posture
 * declared above: over-staleness costs a rebuild, under-staleness ships a site
 * the operator believes was edited.
 */
export const AUTHORED_DISABLED_ROUTE_IMPACTS: ReleaseStage[] = [
  "content",
  "seo",
  "assets",
  "production",
];
export const AUTHORED_DISABLED_REGION_IMPACTS: ReleaseStage[] = ["content", "assets", "production"];

export const AUTHORED_FIELD_IMPACTS: Record<string, ReleaseStage[]> = {
  slotValues: AUTHORED_SLOT_VALUE_IMPACTS,
  theme: THEME_SELECTION_IMPACTS,
  assets: AUTHORED_ASSET_IMPACTS,
  brand: AUTHORED_BRAND_IMPACTS,
  disabledRoutes: AUTHORED_DISABLED_ROUTE_IMPACTS,
  disabledRegions: AUTHORED_DISABLED_REGION_IMPACTS,
};

/** Resolution field → stages it makes stale (downstream closure applied later). */
export const RESOLUTION_FIELD_IMPACTS: Record<string, ReleaseStage[]> = {
  productionBaseUrl: ["seo", "production"],
  facts: ["content", "seo", "production"],
  urls: ["content", "seo", "production"],
  routeContent: ["content", "seo", "production"],
  assets: ["assets", "production"],
  fontDecisions: ["assets", "production"],
  // Task 27: `theme` IS a resolution-pack field now (production-resolution-v1
  // `theme`, folded into authored.theme) — THEME_SELECTION_IMPACTS is no longer
  // a dead declaration, it is the live impact set for that field.
  theme: THEME_SELECTION_IMPACTS,
};

/** All stages transitively downstream of `stage` (exclusive). */
export function downstreamOf(stage: ReleaseStage): ReleaseStage[] {
  const out = new Set<ReleaseStage>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of STAGE_ORDER) {
      if (out.has(candidate)) continue;
      const deps = STAGE_DEPENDENCIES[candidate];
      if (deps.includes(stage) || deps.some((dep) => out.has(dep))) {
        out.add(candidate);
        changed = true;
      }
    }
  }
  return STAGE_ORDER.filter((s) => out.has(s));
}

/** The stages a resolution pack makes stale: the union of its matched fields'
 *  DIRECT impacts, closed over STAGE_DEPENDENCIES with `downstreamOf`.
 *
 *  The closure is DERIVED, never hand-maintained. RESOLUTION_FIELD_IMPACTS used
 *  to claim to be pre-closed and was not (`routeContent` omitted `theme`, which
 *  depends on content), so release:resolve reported 3 invalidated stages for a
 *  pack release:plan then called 4 stale — the same "surface reasons about
 *  staleness without applying the graph" defect fixed in release:plan. Deriving
 *  it here means the next row added to the table cannot reintroduce it. */
export function invalidatedStages(resolution: ProductionResolution): ReleaseStage[] {
  const stale = new Set<ReleaseStage>();
  const fieldPresent = (field: keyof ProductionResolution): boolean => {
    const value = resolution[field];
    if (value === undefined) return false;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return Object.keys(value).length > 0;
    }
    return true;
  };
  for (const [field, stages] of Object.entries(RESOLUTION_FIELD_IMPACTS)) {
    if (fieldPresent(field as keyof ProductionResolution)) {
      for (const stage of stages) {
        stale.add(stage);
        // `downstreamOf` is itself transitively closed, so closing an already
        // hand-closed row (productionBaseUrl, assets, theme) is a no-op.
        for (const downstream of downstreamOf(stage)) stale.add(downstream);
      }
    }
  }
  // acknowledgements + notes change requirement status only — no stage rerun.
  return STAGE_ORDER.filter((stage) => stale.has(stage));
}

/**
 * The stages an AUTHORED edit makes stale: the union of the DIRECT impacts of
 * every authored field that actually moved between `before` and `after`,
 * closed over `STAGE_DEPENDENCIES` by `downstreamOf` — the same derivation
 * `invalidatedStages` uses for a resolution pack, so the two answers cannot
 * drift apart by hand-maintenance.
 *
 * This is a PREDICTION for an operator surface. The authoritative answer stays
 * where it has always been — `computeStageInputsHash` over each stage's real
 * input slice (freshness.ts) — and a release:build reruns what THAT says.
 */
export function authoredInvalidatedStages(
  before: AuthoredState | null,
  after: AuthoredState,
): ReleaseStage[] {
  const canonical = (value: unknown): string => JSON.stringify(value ?? null);
  const moved: string[] = [];
  if (canonical(before?.slotValues ?? {}) !== canonical(after.slotValues)) moved.push("slotValues");
  if (canonical(before?.theme ?? {}) !== canonical(after.theme)) moved.push("theme");
  if (canonical(before?.assets) !== canonical(after.assets)) moved.push("assets");
  if (canonical(before?.brand) !== canonical(after.brand)) moved.push("brand");
  if (canonical(before?.disabledRoutes) !== canonical(after.disabledRoutes)) {
    moved.push("disabledRoutes");
  }
  if (canonical(before?.disabledRegions) !== canonical(after.disabledRegions)) {
    moved.push("disabledRegions");
  }
  const stale = new Set<ReleaseStage>();
  for (const field of moved) {
    for (const stage of AUTHORED_FIELD_IMPACTS[field] ?? []) {
      stale.add(stage);
      for (const downstream of downstreamOf(stage)) stale.add(downstream);
    }
  }
  return STAGE_ORDER.filter((stage) => stale.has(stage));
}
