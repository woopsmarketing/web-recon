/**
 * Stage dependency graph + resolution-driven invalidation (spec §12).
 *
 * The graph is explicit and closed:
 *
 *   reconstruction → template → content → { theme, seo } → production
 *                    template ────────────→ assets ──────→ production
 *
 * and each resolution field invalidates exactly the stages the spec names:
 *
 *   productionBaseUrl → seo → production
 *   facts             → content(affected slots) → seo(structured data) → production
 *   urls              → content → seo → production
 *   routeContent      → content → seo → production
 *   assets            → assets → production
 *   fontDecisions     → assets → production   (layout-QA note recorded, §12)
 *   theme selection   → theme → production
 *
 * Reconstruction / template are frozen roots: unless the SOURCE URL changes
 * (out of release scope) they are NEVER re-run (spec §12/§26).
 */
import type { ProductionResolution, ReleaseStage } from "./types.js";

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

/** Resolution field → stages it makes stale (downstream closure applied later). */
export const RESOLUTION_FIELD_IMPACTS: Record<string, ReleaseStage[]> = {
  productionBaseUrl: ["seo", "production"],
  facts: ["content", "seo", "production"],
  urls: ["content", "seo", "production"],
  routeContent: ["content", "seo", "production"],
  assets: ["assets", "production"],
  fontDecisions: ["assets", "production"],
};

/** Theme selection (not a resolution-pack field) → theme + production. */
export const THEME_SELECTION_IMPACTS: ReleaseStage[] = ["theme", "production"];

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

/** The stages a resolution pack makes stale (its own fields only — the
 *  dependency closure is already encoded in RESOLUTION_FIELD_IMPACTS). */
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
      for (const stage of stages) stale.add(stage);
    }
  }
  // acknowledgements + notes change requirement status only — no stage rerun.
  return STAGE_ORDER.filter((stage) => stale.has(stage));
}
