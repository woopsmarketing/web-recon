/**
 * The Region-enablement PORT, over the real engine.
 *
 * THE EDITOR OWNS NONE OF THE SAFETY RULES. Every decision comes from
 * `src/editor/enablement.ts`, which is a thin, honest consumer of
 * `src/release/enablement.ts` (`evaluateRegionDisable`, `resolveEnablement`)
 * and records acceptances through `commitAuthoredEdits`. This file is only the
 * adapter that fits that API to the `RegionEnablementPort` shape the Region
 * panel was written against, so the panel did not have to be rewritten when
 * the engine landed.
 *
 * REFUSALS TRAVEL WHOLE. `read()` reports `enabled: null` — UNKNOWN, never
 * "off" — for a recorded disable the resolver refuses, and carries the
 * refusals with it so the panel can name the route, the region and the
 * dependency instead of saying "failed".
 *
 * `UNWIRED_REGION_ENABLEMENT` (panels.ts) stays as the documented fallback:
 * `startVisualEditor({ regionEnablement })` takes any implementation.
 */
import {
  refusalViews,
  resolveSiteEnablement,
  toggleRegion,
  type RefusalView,
} from "./enablement.js";
import type { EditorSite } from "./catalog.js";
import type {
  RegionEnablementPort,
  RegionEnablementState,
  RegionEnablementWriteRequest,
  RegionEnablementWriteResult,
} from "./panels.js";

/**
 * Per-region enablement state, RE-ADJUDICATED.
 *
 * `resolveSiteEnablement` runs the same rules the build runs, so a recorded
 * disable that stopped being safe (a template recompile that moved a region id,
 * a second edit that changed a shared page's route set) reports as refused here
 * exactly as it would at build time.
 */
export async function regionEnablementRows(
  site: EditorSite,
  regionIds: readonly string[],
): Promise<Map<string, RegionEnablementState>> {
  const out = new Map<string, RegionEnablementState>();
  const disabled = site.project.authored.disabledRegions ?? {};
  const bySubject = new Map<string, RefusalView[]>();
  if (Object.keys(disabled).length > 0) {
    try {
      const resolved = await resolveSiteEnablement(site);
      for (const view of refusalViews(resolved.refusals)) {
        const list = bySubject.get(view.subject) ?? [];
        list.push(view);
        bySubject.set(view.subject, list);
      }
    } catch {
      bySubject.clear();
    }
  }
  for (const regionId of regionIds) {
    const record = disabled[regionId];
    const refusals = bySubject.get(regionId) ?? [];
    out.set(regionId, {
      regionId,
      // A recorded disable the resolver REFUSES is not "off": it is a decision
      // the bake will not apply and the preview does not apply, and calling it
      // disabled would be the exact honesty failure this program exists to
      // prevent.
      enabled: record === undefined ? true : refusals.length > 0 ? null : false,
      source:
        record === undefined
          ? "authored.disabledRegions has no entry — the region renders"
          : refusals.length > 0
            ? `a disable IS recorded but the resolver REFUSES it, so the region still renders: ${refusals
                .map((refusal) => `${refusal.code} — ${refusal.message}`)
                .join(" | ")}`
            : `authored.disabledRegions[${regionId}] scope=${record.scope}${
                record.routes !== undefined ? ` routes=${record.routes.join(", ")}` : ""
              }${record.reason !== undefined ? ` reason=${record.reason}` : ""}`,
      editable: true,
      refusals,
    });
  }
  return out;
}

export const RELEASE_REGION_ENABLEMENT: RegionEnablementPort = {
  name: "release/enablement",
  wired: true,

  async read(site: EditorSite, regionIds: string[]): Promise<Map<string, RegionEnablementState>> {
    return regionEnablementRows(site, regionIds);
  },

  async write(
    site: EditorSite,
    request: RegionEnablementWriteRequest,
  ): Promise<RegionEnablementWriteResult> {
    const result = await toggleRegion(site, {
      regionId: request.regionId,
      enabled: request.enabled,
      // FORWARDED, not dropped: see RegionEnablementWriteRequest.route.
      ...(request.route !== undefined ? { route: request.route } : {}),
      ...(request.scope !== undefined ? { scope: request.scope } : {}),
      ...(request.routes !== undefined ? { routes: request.routes } : {}),
      ...(request.cascadeRegionIds !== undefined
        ? { cascadeRegionIds: request.cascadeRegionIds }
        : {}),
      ...(request.reason !== undefined ? { reason: request.reason } : {}),
    });
    // The state is RE-READ from the resolver after the write, so what the panel
    // shows is what the engine now says — never what the write hoped for.
    const state = (await regionEnablementRows(site, [request.regionId])).get(request.regionId) ?? null;
    return {
      changed: result.changed,
      reason: result.reason,
      refusals: result.refusals,
      revisionId: result.revisionId,
      cascadeApplied: result.regionIds.filter((id) => id !== request.regionId),
      warnings: result.warnings,
      effect: result.effect,
      adoption: result.adoption,
      widenedToBlastRadius: result.widenedToBlastRadius,
      state,
    };
  },
};
