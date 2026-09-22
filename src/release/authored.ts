/**
 * The authored-state WRITE API (Task 28 Phase 2) — the seam a Visual Editor
 * calls, and the only place `authored.assets` / `authored.brand` are mutated.
 *
 * THE SHAPE OF EVERY FUNCTION HERE IS THE SAME, deliberately:
 *
 *   pure     `applyAuthoredEdit(authored, edit, at) -> { authored, changed }`
 *            never touches disk, never mutates its input, and reports whether
 *            anything actually moved.
 *   commit   `commitAuthoredEdits(projectDir, edits) -> { changed, revision }`
 *            loads the project, applies the edits, and — ONLY when `changed`
 *            — writes the document and APPENDS one revision.
 *
 * `changed` is the whole contract. `appendAuthoredRevisionIfChanged` already
 * refuses to append an identical snapshot, but an editor that saves on every
 * keystroke would still rewrite release-project.json (and move its mtime, and
 * therefore its `updatedAt`) for a no-op. So the no-op is decided BEFORE any
 * write happens: setting the same asset file twice, or re-affirming the same
 * brand decision, writes nothing at all and returns `revision: null`.
 *
 * WHY A SEPARATE MODULE. `instance.ts` owns folding a RESOLUTION PACK into the
 * authored block (the operator's batch path) and `revisions.ts` owns the
 * history. This is the third path — a single addressed edit — and putting it
 * in either of those would mix "how a pack becomes authored state" with "how
 * one field is set".
 */
import { brandSurfaceIdOf } from "../content-injection/brand-surfaces.js";
import type { BrandFinding } from "./brand-scan.js";
import { commitAuthoredState, type AuthoredRevision, type RevisionOrigin } from "./revisions.js";
import { loadReleaseProject } from "./store.js";
import {
  AuthoredStateSchema,
  DisabledRegionSchema,
  type AuthoredAsset,
  type AuthoredBrandDecision,
  type AuthoredState,
  type BrandDecision,
  type DisabledRegion,
  type DisabledRoute,
  type RegionDisableScope,
  type ResolutionAsset,
} from "./types.js";

// ---------------------------------------------------------------------------
// Brand surface identity
// ---------------------------------------------------------------------------

/**
 * The STABLE id a brand decision is keyed by.
 *
 * Derived from the detector's finding, and only from the axes that ADDRESS the
 * surface — never from what was found there:
 *
 *   surface           which of the 14 BRAND_SURFACES this is
 *   route             the template route (stable across template runs)
 *   nodeId / slotKey  DOM identity (`data-wr-node`) or the slot binding
 *   evidencePointer   `desktop.doc[n000017].v` — carries the viewport, which
 *                     `route` + `nodeId` alone do not
 *
 * DELIBERATELY EXCLUDED: `value`, `matched`, `sourceUrl` and `evidenceFile`.
 * The first three are the finding's CONTENT — an id that moved when the text
 * changed could never survive the edit it is supposed to record. `evidenceFile`
 * is an absolute-ish path into one template run directory, so including it
 * would rotate every id on a template recompile.
 *
 * LIMITATION, stated rather than hidden: the pointer is per-NODE, not
 * per-match, so a single node whose inline SVG carries two `aria-label`
 * attributes produces two findings with ONE id. The decision is therefore a
 * decision about that surface ON THAT HOST, which is the granularity a
 * REPLACE/REMOVE/PRESERVE choice has anyway — but it is not a per-occurrence
 * addressing scheme and must not be described as one.
 */
export function brandSurfaceId(
  finding: Pick<BrandFinding, "surface" | "route" | "nodeId" | "slotKey" | "evidencePointer">,
): string {
  // ONE implementation, in the layer both readers already import (Task 28
  // Phase 2): the bake-time resolver in src/production/brand-bake.ts must
  // derive the identical id or an authored decision addresses nothing, and
  // src/production importing src/release would be a cycle. The derivation and
  // the bytes it produces are unchanged.
  return brandSurfaceIdOf(finding);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Key-sorted JSON — the same canonicalisation `hashAuthoredState` relies on,
 *  so "changed" here and "a new revision" there can never disagree. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Is this edit a no-op?
 *
 * `updatedAt` is EXCLUDED from the comparison on purpose: it is a stamp the
 * edit itself would set, so comparing it would make every edit look changed
 * and defeat the whole point of the API.
 */
function entryUnchanged(before: unknown, after: unknown): boolean {
  const strip = (value: unknown): unknown => {
    if (value === undefined || value === null || typeof value !== "object") return value;
    const { updatedAt: _ignored, ...rest } = value as Record<string, unknown>;
    return rest;
  };
  return canonicalJson(strip(before)) === canonicalJson(strip(after));
}

// ---------------------------------------------------------------------------
// Pure editors
// ---------------------------------------------------------------------------

export interface AuthoredEditResult {
  authored: AuthoredState;
  changed: boolean;
}

function unchanged(authored: AuthoredState): AuthoredEditResult {
  return { authored, changed: false };
}

/** Re-parse + stamp. `updatedAt` moves ONLY when something actually changed. */
function committed(next: Omit<AuthoredState, "updatedAt">, at: string): AuthoredEditResult {
  return { authored: AuthoredStateSchema.parse({ ...next, updatedAt: at }), changed: true };
}

/**
 * Set one slot value. The authoritative content write path (store.ts doctrine):
 * `content-runs/<run>/slot-values.json` is materialized FROM this map, never
 * back into it.
 */
export function setAuthoredSlotValue(
  authored: AuthoredState,
  slotKey: string,
  value: unknown,
  at: string,
): AuthoredEditResult {
  if (slotKey in authored.slotValues && canonicalJson(authored.slotValues[slotKey]) === canonicalJson(value)) {
    return unchanged(authored);
  }
  return committed(
    { ...authored, slotValues: { ...authored.slotValues, [slotKey]: value } },
    at,
  );
}

export function removeAuthoredSlotValue(
  authored: AuthoredState,
  slotKey: string,
  at: string,
): AuthoredEditResult {
  if (!(slotKey in authored.slotValues)) return unchanged(authored);
  const slotValues = { ...authored.slotValues };
  delete slotValues[slotKey];
  return committed({ ...authored, slotValues }, at);
}

export interface AuthoredAssetInput {
  file: string;
  alt?: string;
  note?: string;
}

/**
 * Set one authored asset replacement, keyed by the SAME `assetId` the
 * resolution pack uses (inventory id, or `og-image` / `organization-logo`).
 */
export function setAuthoredAsset(
  authored: AuthoredState,
  assetId: string,
  input: AuthoredAssetInput,
  at: string,
): AuthoredEditResult {
  const next: AuthoredAsset = {
    file: input.file,
    ...(input.alt !== undefined ? { alt: input.alt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    updatedAt: at,
  };
  const before = authored.assets?.[assetId];
  if (before !== undefined && entryUnchanged(before, next)) return unchanged(authored);
  return committed({ ...authored, assets: { ...(authored.assets ?? {}), [assetId]: next } }, at);
}

/** Remove an authored asset. Dropping the LAST one deletes the field again, so
 *  the state round-trips exactly back to its pre-authoring hash. */
export function removeAuthoredAsset(
  authored: AuthoredState,
  assetId: string,
  at: string,
): AuthoredEditResult {
  if (authored.assets?.[assetId] === undefined) return unchanged(authored);
  const assets = { ...authored.assets };
  delete assets[assetId];
  const { assets: _dropped, ...rest } = authored;
  return committed(
    Object.keys(assets).length > 0 ? { ...rest, assets } : { ...rest },
    at,
  );
}

export interface AuthoredBrandDecisionInput {
  decision: BrandDecision;
  replacement?: { text?: string; assetId?: string; file?: string };
  reason?: string;
  note?: string;
}

/**
 * Record the operator's decision about one detected source-brand surface.
 *
 * The REPLACE-needs-a-payload / PRESERVE-needs-a-reason invariants are enforced
 * by `AuthoredBrandDecisionSchema` (types.ts), not re-implemented here: this
 * function builds the record and the schema parse below refuses it. That way a
 * hand-edited release-project.json is held to the identical rule.
 */
export function setAuthoredBrandDecision(
  authored: AuthoredState,
  surfaceId: string,
  input: AuthoredBrandDecisionInput,
  at: string,
): AuthoredEditResult {
  const next: AuthoredBrandDecision = {
    decision: input.decision,
    ...(input.replacement !== undefined ? { replacement: input.replacement } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    updatedAt: at,
  };
  const before = authored.brand?.[surfaceId];
  if (before !== undefined && entryUnchanged(before, next)) return unchanged(authored);
  return committed({ ...authored, brand: { ...(authored.brand ?? {}), [surfaceId]: next } }, at);
}

export function removeAuthoredBrandDecision(
  authored: AuthoredState,
  surfaceId: string,
  at: string,
): AuthoredEditResult {
  if (authored.brand?.[surfaceId] === undefined) return unchanged(authored);
  const brand = { ...authored.brand };
  delete brand[surfaceId];
  const { brand: _dropped, ...rest } = authored;
  return committed(Object.keys(brand).length > 0 ? { ...rest, brand } : { ...rest }, at);
}

// ---------------------------------------------------------------------------
// Enablement (Task 28 Phases 5 + 6)
// ---------------------------------------------------------------------------

export interface AuthoredRouteDisableInput {
  reason?: string;
  note?: string;
}

/**
 * Turn one route OFF.
 *
 * SAFETY IS NOT DECIDED HERE. This is the write API; `evaluateRouteDisable`
 * (enablement.ts) is the analysis, and `resolveEnablement` re-runs it on every
 * build, so a recorded edit that stops being safe is refused then rather than
 * being trusted because it was once accepted. Keeping the two apart is what
 * lets the analysis read the template + region artifacts without this module
 * dragging them into every authored-state write.
 */
export function setAuthoredRouteDisabled(
  authored: AuthoredState,
  route: string,
  input: AuthoredRouteDisableInput,
  at: string,
): AuthoredEditResult {
  const next: DisabledRoute = {
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    updatedAt: at,
  };
  const before = authored.disabledRoutes?.[route];
  if (before !== undefined && entryUnchanged(before, next)) return unchanged(authored);
  return committed(
    { ...authored, disabledRoutes: { ...(authored.disabledRoutes ?? {}), [route]: next } },
    at,
  );
}

/** Turn a route back ON. Dropping the LAST one deletes the field again. */
export function removeAuthoredRouteDisabled(
  authored: AuthoredState,
  route: string,
  at: string,
): AuthoredEditResult {
  if (authored.disabledRoutes?.[route] === undefined) return unchanged(authored);
  const disabledRoutes = { ...authored.disabledRoutes };
  delete disabledRoutes[route];
  const { disabledRoutes: _dropped, ...rest } = authored;
  return committed(
    Object.keys(disabledRoutes).length > 0 ? { ...rest, disabledRoutes } : { ...rest },
    at,
  );
}

export interface AuthoredRegionDisableInput {
  scope: RegionDisableScope;
  routes?: string[];
  reason?: string;
  note?: string;
}

/**
 * Delete one section — recorded as a DISABLE of a PageRegion id.
 *
 * The REQUIRED-shape invariants (scope `routes` needs a route list, scope
 * `global` must not carry one) are enforced by `DisabledRegionSchema`, not
 * re-implemented here, so a hand-edited release-project.json is held to the
 * identical rule. Route lists are sorted before comparison: re-issuing the same
 * decision with the routes in a different order is a NO-OP, not a new revision.
 */
export function setAuthoredRegionDisabled(
  authored: AuthoredState,
  regionId: string,
  input: AuthoredRegionDisableInput,
  at: string,
): AuthoredEditResult {
  const next: DisabledRegion = DisabledRegionSchema.parse({
    scope: input.scope,
    ...(input.routes !== undefined ? { routes: [...new Set(input.routes)].sort() } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    updatedAt: at,
  });
  const before = authored.disabledRegions?.[regionId];
  if (before !== undefined && entryUnchanged(before, next)) return unchanged(authored);
  return committed(
    { ...authored, disabledRegions: { ...(authored.disabledRegions ?? {}), [regionId]: next } },
    at,
  );
}

export function removeAuthoredRegionDisabled(
  authored: AuthoredState,
  regionId: string,
  at: string,
): AuthoredEditResult {
  if (authored.disabledRegions?.[regionId] === undefined) return unchanged(authored);
  const disabledRegions = { ...authored.disabledRegions };
  delete disabledRegions[regionId];
  const { disabledRegions: _dropped, ...rest } = authored;
  return committed(
    Object.keys(disabledRegions).length > 0 ? { ...rest, disabledRegions } : { ...rest },
    at,
  );
}

// ---------------------------------------------------------------------------
// One addressed edit
// ---------------------------------------------------------------------------

export type AuthoredEdit =
  | { op: "set-slot-value"; slotKey: string; value: unknown }
  | { op: "remove-slot-value"; slotKey: string }
  | ({ op: "set-asset"; assetId: string } & AuthoredAssetInput)
  | { op: "remove-asset"; assetId: string }
  | ({ op: "set-brand-decision"; surfaceId: string } & AuthoredBrandDecisionInput)
  | { op: "remove-brand-decision"; surfaceId: string }
  | ({ op: "disable-route"; route: string } & AuthoredRouteDisableInput)
  | { op: "enable-route"; route: string }
  | ({ op: "disable-region"; regionId: string } & AuthoredRegionDisableInput)
  | { op: "enable-region"; regionId: string };

export function applyAuthoredEdit(
  authored: AuthoredState,
  edit: AuthoredEdit,
  at: string,
): AuthoredEditResult {
  switch (edit.op) {
    case "set-slot-value":
      return setAuthoredSlotValue(authored, edit.slotKey, edit.value, at);
    case "remove-slot-value":
      return removeAuthoredSlotValue(authored, edit.slotKey, at);
    case "set-asset":
      return setAuthoredAsset(
        authored,
        edit.assetId,
        {
          file: edit.file,
          ...(edit.alt !== undefined ? { alt: edit.alt } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        },
        at,
      );
    case "remove-asset":
      return removeAuthoredAsset(authored, edit.assetId, at);
    case "set-brand-decision":
      return setAuthoredBrandDecision(
        authored,
        edit.surfaceId,
        {
          decision: edit.decision,
          ...(edit.replacement !== undefined ? { replacement: edit.replacement } : {}),
          ...(edit.reason !== undefined ? { reason: edit.reason } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        },
        at,
      );
    case "remove-brand-decision":
      return removeAuthoredBrandDecision(authored, edit.surfaceId, at);
    case "disable-route":
      return setAuthoredRouteDisabled(
        authored,
        edit.route,
        {
          ...(edit.reason !== undefined ? { reason: edit.reason } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        },
        at,
      );
    case "enable-route":
      return removeAuthoredRouteDisabled(authored, edit.route, at);
    case "disable-region":
      return setAuthoredRegionDisabled(
        authored,
        edit.regionId,
        {
          scope: edit.scope,
          ...(edit.routes !== undefined ? { routes: edit.routes } : {}),
          ...(edit.reason !== undefined ? { reason: edit.reason } : {}),
          ...(edit.note !== undefined ? { note: edit.note } : {}),
        },
        at,
      );
    case "enable-region":
      return removeAuthoredRegionDisabled(authored, edit.regionId, at);
  }
}

/** Apply a batch. `changed` is true iff at least ONE edit moved something. */
export function applyAuthoredEdits(
  authored: AuthoredState,
  edits: readonly AuthoredEdit[],
  at: string,
): AuthoredEditResult {
  let current = authored;
  let changed = false;
  for (const edit of edits) {
    const result = applyAuthoredEdit(current, edit, at);
    current = result.authored;
    changed = changed || result.changed;
  }
  return { authored: current, changed };
}

// ---------------------------------------------------------------------------
// The project-level write path
// ---------------------------------------------------------------------------

export interface CommitAuthoredEditsResult {
  changed: boolean;
  /** null when nothing moved — a no-op edit appends NO revision. */
  revision: AuthoredRevision | null;
  authored: AuthoredState;
}

/**
 * Apply edits to a release project on disk, atomically with the history.
 *
 * NOTHING IS WRITTEN when the edits are a no-op: no project save, no revision,
 * no `updatedAt` move. When something did change, `commitAuthoredState`
 * (revisions.ts) writes the revision record FIRST and the project document
 * second — a record with no matching project state is recoverable, a project
 * state with no record is silently lost history.
 */
export async function commitAuthoredEdits(
  projectDir: string,
  edits: readonly AuthoredEdit[],
  options: { origin?: RevisionOrigin; summary?: string; now?: Date } = {},
): Promise<CommitAuthoredEditsResult> {
  const { project, projectDir: dir } = await loadReleaseProject(projectDir);
  const now = options.now ?? new Date();
  const result = applyAuthoredEdits(project.authored, edits, now.toISOString());
  if (!result.changed) {
    return { changed: false, revision: null, authored: project.authored };
  }
  const commit = await commitAuthoredState(dir, result.authored, {
    origin: options.origin ?? "edit",
    ...(options.summary !== undefined ? { summary: options.summary } : {}),
    now,
  });
  return { changed: true, revision: commit.revision, authored: commit.authored };
}

// ---------------------------------------------------------------------------
// Feeding the resolution-pack path (never replacing it)
// ---------------------------------------------------------------------------

/**
 * `authored.assets` in the shape `applyAssetResolutions` already consumes.
 *
 * The asset stage runner keeps taking `effective.assets` — this is MERGED over
 * it, so a project whose only asset input is a resolution pack behaves exactly
 * as before (an absent `authored.assets` contributes nothing), and a project
 * with both applies the authored value last. `alt` is deliberately NOT mapped:
 * `ResolutionAsset` has no alt field and the materialization writes bytes, not
 * markup, so inventing a mapping would claim a consumption that does not exist.
 */
export function authoredAssetsAsResolutionAssets(
  authored: AuthoredState,
): Record<string, ResolutionAsset> {
  const out: Record<string, ResolutionAsset> = {};
  for (const [assetId, asset] of Object.entries(authored.assets ?? {})) {
    out[assetId] = {
      file: asset.file,
      ...(asset.note !== undefined ? { note: asset.note } : {}),
    };
  }
  return out;
}

/** Pack assets first, AUTHORED assets last — authored is authoritative. */
export function mergedAssetResolutions(
  packAssets: Record<string, ResolutionAsset> | undefined,
  authored: AuthoredState,
): Record<string, ResolutionAsset> {
  return { ...(packAssets ?? {}), ...authoredAssetsAsResolutionAssets(authored) };
}
