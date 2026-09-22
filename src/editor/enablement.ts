/**
 * THE ENABLEMENT SEAM, CLOSED (Task 28 integration phase).
 *
 * Two builders worked in parallel behind a file boundary: one shipped the
 * region/route enablement ENGINE (`src/release/enablement.ts` decides,
 * `src/production/enablement.ts` applies, `src/release/authored.ts` records),
 * the other shipped the operator app and deliberately left the toggle unwired,
 * recording the port it expected. This module is the join.
 *
 * THE ENGINE IS AUTHORITATIVE; THE UI IS A CONSUMER. Nothing here decides
 * whether a disable is safe, widens a route list, or softens a refusal:
 *
 *   - every decision comes from `evaluateRegionDisable` / `evaluateRouteDisable`
 *     over `loadEnablementInputs`, the same functions `release:plan` and
 *     `release:build` call, over the SAME page-regions artifact the project
 *     records (`auxiliary.pageRegionsDir`) — not the newest one on disk;
 *   - every refusal is carried to the browser whole (code, message, requested
 *     and affected routes, cascade, detail) and rendered as a refusal, never as
 *     a silent no-op and never as a generic error;
 *   - every acceptance is recorded through `commitAuthoredEdits`, so an
 *     enablement change is one revision on the same chain a text edit appends
 *     to, and Undo restores it like any other edit.
 *
 * WHY THE PREVIEW NEEDS MORE THAN AN OVERLAY. A slot value is an overlay the
 * running app re-reads per epoch. A disable is STRUCTURAL: it removes nodes
 * from the page trees and rows from the route table, which is why the engine
 * applies it to the BUILD COPY of the app. The authoring preview has its own
 * copy — `<previewDir>/app` — so the identical `applyEnablementToApp` runs
 * against it, from the PRISTINE template each time (an apply is destructive and
 * re-enabling has to restore deleted nodes), followed by one worker restart:
 * the patched loader memoizes the RAW page JSON for the process lifetime
 * (`rawCache`, patch.ts), so the epoch seam cannot see a structural change.
 * The proxy URL is the session's identity and does not move, so the editor
 * iframe stays where it is.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluateRegionDisable,
  evaluateRouteDisable,
  loadEnablementInputs,
  resolveEnablement,
  resolvePageRegionsFile,
  type DeadLinkFinding,
  type EnablementInputs,
  type EnablementRefusal,
  type RegionDisableDecision,
  type ResolvedEnablement,
  type RouteDisableDecision,
} from "../release/enablement.js";
import {
  regionEnablementScope,
  regionRouteBlastRadius,
} from "../regions/enablement.js";
import { commitAuthoredEdits, type AuthoredEdit } from "../release/authored.js";
import { loadReleaseProject, saveReleaseProject } from "../release/store.js";
import { applyEnablementToApp, enablementPlanIsEmpty } from "../production/enablement.js";
import type { AuthoringPreviewSession } from "../authoring-preview/session.js";
import type { EditorSite } from "./catalog.js";

// ---------------------------------------------------------------------------
// Refusals, in the shape the browser renders
// ---------------------------------------------------------------------------

/**
 * What the operator can DO about a refusal, derived from its code alone.
 *
 * The engine already says what is wrong and what would make it safe
 * (`affectedRoutes`, `cascadeRegionIds`, `cascadeAvailable`); this turns that
 * into the one button the panel offers. `kind: "none"` is the honest answer for
 * a refusal no re-issue can satisfy — the panel then offers Cancel and nothing
 * else, rather than a retry that will be refused again.
 */
export interface RefusalRemedy {
  kind: "retry-global" | "retry-all-routes" | "retry-with-cascade" | "none";
  label: string;
  scope?: "global" | "routes";
  routes?: string[];
  cascadeRegionIds?: string[];
}

export interface RefusalView {
  code: string;
  subject: string;
  message: string;
  requestedRoutes: string[];
  affectedRoutes: string[];
  cascadeRegionIds: string[];
  cascadeAvailable: boolean;
  remedy: RefusalRemedy;
  detail: Record<string, unknown>;
}

export function refusalView(refusal: EnablementRefusal): RefusalView {
  let remedy: RefusalRemedy = {
    kind: "none",
    label: "No re-issue can make this safe — cancel.",
  };
  if (refusal.code === "global-region-requires-explicit-global") {
    remedy = {
      kind: "retry-global",
      label: `Disable it everywhere (${refusal.affectedRoutes.length} route(s): ${refusal.affectedRoutes.join(", ")})`,
      scope: "global",
    };
  } else if (refusal.code === "shared-page-blast-radius") {
    remedy = {
      kind: "retry-all-routes",
      label: `Disable it on all ${refusal.affectedRoutes.length} route(s): ${refusal.affectedRoutes.join(", ")}`,
      scope: "routes",
      routes: refusal.affectedRoutes,
    };
  } else if (refusal.cascadeAvailable && refusal.cascadeRegionIds.length > 0) {
    remedy = {
      kind: "retry-with-cascade",
      label: `Disable it together with ${refusal.cascadeRegionIds.length} region(s): ${refusal.cascadeRegionIds.join(", ")}`,
      cascadeRegionIds: refusal.cascadeRegionIds,
    };
  }
  return {
    code: refusal.code,
    subject: refusal.subject,
    message: refusal.message,
    requestedRoutes: refusal.requestedRoutes,
    affectedRoutes: refusal.affectedRoutes,
    cascadeRegionIds: refusal.cascadeRegionIds,
    cascadeAvailable: refusal.cascadeAvailable,
    remedy,
    detail: refusal.detail,
  };
}

export function refusalViews(refusals: readonly EnablementRefusal[]): RefusalView[] {
  return refusals.map(refusalView);
}

// ---------------------------------------------------------------------------
// Which page-regions artifact — the project's, or none
// ---------------------------------------------------------------------------

export interface PageRegionsBinding {
  /** The reference the ENGINE will use on the next build. */
  projectRef: string | null;
  /** The newest compile on disk whose templateId matches (discovery only). */
  discoveredFile: string | null;
  /** True when the project's reference and the discovery disagree. */
  divergent: boolean;
  note: string;
}

/**
 * WHICH ARTIFACT THE EDITOR EVALUATES AGAINST — and why it is not "the newest".
 *
 * `release:build` resolves enablement against `auxiliary.pageRegionsDir`
 * (build.ts). An editor that evaluated against the newest compile on disk could
 * accept a disable the build then refuses with `regions-not-compiled`, or
 * addresses different region ids entirely. So the project's own reference wins
 * whenever it exists, and a divergence from the newest compile is REPORTED
 * rather than resolved by preferring the fresher artifact.
 */
export function pageRegionsBinding(site: EditorSite): PageRegionsBinding {
  const projectRef = site.project.auxiliary.pageRegionsDir ?? null;
  const discoveredFile = site.regionsFile;
  if (projectRef === null) {
    return {
      projectRef: null,
      discoveredFile,
      divergent: false,
      note:
        discoveredFile === null
          ? "this project records no auxiliary.pageRegionsDir and no compile on disk matches this template — regions cannot be addressed"
          : `this project records no auxiliary.pageRegionsDir; the first enablement edit will adopt ${path.dirname(discoveredFile)} so the BUILD resolves against the same artifact the editor evaluated`,
    };
  }
  const resolved = resolvePageRegionsFile(projectRef);
  const divergent = discoveredFile !== null && path.resolve(discoveredFile) !== path.resolve(resolved);
  return {
    projectRef,
    discoveredFile,
    divergent,
    note: divergent
      ? `the project records ${projectRef}, which the build will use; a NEWER compile exists at ${discoveredFile} and is NOT used here — re-run release:prepare --page-regions to adopt it`
      : `page-regions artifact: ${projectRef} (the same reference release:build resolves against)`,
  };
}

/**
 * Record the discovered compile on the project, so the build and the editor
 * evaluate the same artifact.
 *
 * This is the identical field `release:prepare --page-regions` writes, and it
 * is written ONCE, on the first enablement edit — never on a read, so merely
 * opening the Region panel does not modify the project document.
 */
export async function adoptPageRegionsDir(
  site: EditorSite,
): Promise<{ adopted: boolean; ref: string | null; note: string }> {
  const binding = pageRegionsBinding(site);
  if (binding.projectRef !== null) return { adopted: false, ref: binding.projectRef, note: binding.note };
  if (binding.discoveredFile === null) return { adopted: false, ref: null, note: binding.note };
  const dir = path.dirname(binding.discoveredFile);
  const { project, projectDir } = await loadReleaseProject(site.projectDir);
  project.auxiliary = { ...project.auxiliary, pageRegionsDir: dir };
  project.updatedAt = new Date().toISOString();
  await saveReleaseProject(projectDir, project);
  site.project = project;
  return {
    adopted: true,
    ref: dir,
    note: `recorded auxiliary.pageRegionsDir=${dir} on the project — release:build now resolves enablement against the same artifact this editor evaluated`,
  };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const inputsCache = new Map<string, Promise<EnablementInputs>>();

/** Enablement inputs for a site, memoized on (template, page-regions ref). */
export function enablementInputsFor(site: EditorSite): Promise<EnablementInputs> {
  const binding = pageRegionsBinding(site);
  const ref = binding.projectRef ?? binding.discoveredFile;
  const key = `${path.resolve(site.templateRunDir)}|${ref === null ? "" : path.resolve(resolvePageRegionsFile(ref))}`;
  const cached = inputsCache.get(key);
  if (cached !== undefined) return cached;
  const pending = loadEnablementInputs({
    templateRunDir: site.templateRunDir,
    pageRegionsRef: ref,
  });
  inputsCache.set(key, pending);
  return pending;
}

/** Drop the memo — used by tests that rewrite an artifact under a live editor. */
export function clearEnablementInputsCache(): void {
  inputsCache.clear();
}

export async function resolveSiteEnablement(site: EditorSite): Promise<ResolvedEnablement> {
  return resolveEnablement(site.project.authored, await enablementInputsFor(site));
}

// ---------------------------------------------------------------------------
// Region toggle
// ---------------------------------------------------------------------------

export interface RegionToggleRequest {
  regionId: string;
  enabled: boolean;
  /** The route the operator is looking at — the default disable scope. */
  route?: string | null;
  /** Explicit re-issue after a refusal. */
  scope?: "global" | "routes";
  routes?: string[];
  /** Regions to disable in the SAME edit (an interaction-cut cascade). */
  cascadeRegionIds?: string[];
  reason?: string;
}

export interface RegionToggleResult {
  changed: boolean;
  allowed: boolean;
  reason: string;
  refusals: RefusalView[];
  revisionId: string | null;
  regionIds: string[];
  effect: {
    blastRadius: string[];
    slotKeys: number;
    nodes: number;
    disabledNodeCount: number;
    siblingRegionIds: string[];
    orphanedTargets: number;
  } | null;
  warnings: string[];
  adoption: string | null;
  /**
   * True when NO route was named and the edit was recorded over the region's
   * whole blast radius. Reported so the widening can never be silent.
   */
  widenedToBlastRadius: boolean;
}

/**
 * The scope a CASCADE member is recorded with.
 *
 * The operator accepted the whole radius when they pressed the cascade button
 * (its label names the regions), so a cascade member is disabled on every route
 * it renders on — `scope: "global"` when the engine calls it global, otherwise
 * `scope: "routes"` over its full blast radius, which is the only route list
 * rule 1 accepts.
 */
function cascadeRequestFor(
  regionId: string,
  inputs: EnablementInputs,
): { regionId: string; scope: "global" | "routes"; routes?: string[] } {
  const region = inputs.regionById.get(regionId);
  if (region === undefined) return { regionId, scope: "routes", routes: [] };
  const scope = regionEnablementScope(region, {
    globalSlotKeys: inputs.globalSlotKeys,
    signaturePageCounts: inputs.signaturePageCounts,
  });
  if (scope.global) return { regionId, scope: "global" };
  return { regionId, scope: "routes", routes: regionRouteBlastRadius(region) };
}

export async function toggleRegion(
  site: EditorSite,
  request: RegionToggleRequest,
): Promise<RegionToggleResult> {
  const empty: RegionToggleResult = {
    changed: false,
    allowed: false,
    reason: "",
    refusals: [],
    revisionId: null,
    regionIds: [request.regionId],
    effect: null,
    warnings: [],
    adoption: null,
    widenedToBlastRadius: false,
  };

  if (request.enabled) {
    const commit = await commitAuthoredEdits(
      site.projectDir,
      [{ op: "enable-region", regionId: request.regionId }],
      { origin: "edit", summary: `editor: enable region ${request.regionId}` },
    );
    return {
      ...empty,
      allowed: true,
      changed: commit.changed,
      revisionId: commit.revision?.revisionId ?? null,
      reason: commit.changed
        ? `region ${request.regionId} enabled again (revision ${commit.revision?.revisionId ?? "?"})`
        : "the region was already enabled — nothing written, no revision",
    };
  }

  const binding = pageRegionsBinding(site);
  if (binding.projectRef === null && binding.discoveredFile === null) {
    return {
      ...empty,
      reason: `REFUSED — ${binding.note}`,
      refusals: [
        {
          code: "regions-not-compiled",
          subject: request.regionId,
          message: binding.note,
          requestedRoutes: [],
          affectedRoutes: [],
          cascadeRegionIds: [],
          cascadeAvailable: false,
          remedy: { kind: "none", label: "Run the region compiler for this template, then re-open the site." },
          detail: { templateRunDir: site.templateRunDir },
        },
      ],
    };
  }

  const inputs = await enablementInputsFor(site);
  const scope = request.scope ?? "routes";
  const route = request.route ?? null;
  /**
   * THE DEFAULT SCOPE, AND WHY THE WIDENING IS NEVER SILENT.
   *
   * "Disable region" means ON THE PAGE THE OPERATOR IS LOOKING AT, so the
   * default route list is the route they named. That is what makes rule 1
   * reachable from the UI at all: `shared-page-blast-radius` only fires on a
   * PARTIAL route list, so a caller that always asks for the region's whole
   * radius can never be told the other routes were in scope.
   *
   * A caller that names no route is NOT refused — it gets the region's full
   * blast radius, which is the widest and most conservative reading of
   * "disable this region" — but the widening is reported in `reason` and in
   * `widenedToBlastRadius`, because a silent widening is exactly the failure
   * mode this phase exists to prevent.
   */
  const region = inputs.regionById.get(request.regionId);
  const blastRadius = regionRouteBlastRadius(region ?? { pages: [] });
  const widenedToBlastRadius =
    scope === "routes" && request.routes === undefined && route === null && blastRadius.length > 1;
  const routes =
    scope === "global"
      ? undefined
      : request.routes !== undefined
        ? request.routes
        : route !== null
          ? [route]
          : blastRadius;

  const cascadeIds = [...new Set(request.cascadeRegionIds ?? [])].filter(
    (id) => id !== request.regionId,
  );
  const allIds = [request.regionId, ...cascadeIds];

  const decisions: Array<{ regionId: string; decision: RegionDisableDecision }> = [];
  decisions.push({
    regionId: request.regionId,
    decision: evaluateRegionDisable(
      { regionId: request.regionId, scope, ...(routes !== undefined ? { routes } : {}) },
      inputs,
      cascadeIds,
    ),
  });
  for (const id of cascadeIds) {
    const shape = cascadeRequestFor(id, inputs);
    decisions.push({
      regionId: id,
      decision: evaluateRegionDisable(
        { regionId: id, scope: shape.scope, ...(shape.routes !== undefined ? { routes: shape.routes } : {}) },
        inputs,
        allIds.filter((other) => other !== id),
      ),
    });
  }

  const refusals = decisions.flatMap((entry) => entry.decision.refusals);
  if (refusals.length > 0) {
    return {
      ...empty,
      regionIds: allIds,
      reason: `REFUSED (${refusals.length}) — ${refusals.map((r) => r.code).join(", ")}`,
      refusals: refusalViews(refusals),
      // REPORTED ON THE REFUSAL PATH TOO. `empty` carries `false`, which was
      // right only for the early return above (no inputs, so no radius to
      // widen to). Once the radius IS known, a refused request that named no
      // route was still ADJUDICATED over the whole radius, and the caller has
      // to be able to see that — a widening the operator cannot observe is the
      // exact failure this flag exists to prevent, refusal or not.
      widenedToBlastRadius,
    };
  }

  const adoption = await adoptPageRegionsDir(site);
  const edits: AuthoredEdit[] = decisions.map((entry) => {
    const shape =
      entry.regionId === request.regionId
        ? { scope, routes }
        : (() => {
            const derived = cascadeRequestFor(entry.regionId, inputs);
            return { scope: derived.scope, routes: derived.routes };
          })();
    return {
      op: "disable-region",
      regionId: entry.regionId,
      scope: shape.scope,
      ...(shape.scope === "routes" && shape.routes !== undefined ? { routes: shape.routes } : {}),
      ...(request.reason !== undefined ? { reason: request.reason } : {}),
    };
  });
  const commit = await commitAuthoredEdits(site.projectDir, edits, {
    origin: "edit",
    summary:
      edits.length === 1
        ? `editor: disable region ${request.regionId} (${scope})`
        : `editor: disable ${edits.length} regions (${request.regionId} + cascade)`,
  });

  const primary = decisions[0].decision.effect;
  const warnings: string[] = [];
  for (const entry of decisions) {
    const orphans = entry.decision.effect?.orphanedTargets ?? [];
    if (orphans.length > 0) {
      warnings.push(
        `${entry.regionId}: ${orphans.length} interaction target(s) survive this disable with no trigger left to drive them — they stay in their default state`,
      );
    }
    const siblings = entry.decision.effect?.siblingRegionIds ?? [];
    if (siblings.length > 0) {
      warnings.push(
        `${entry.regionId} carries the same content as ${siblings.length} sibling region id(s) on other pages — this edit removes THIS id only: ${siblings.join(", ")}`,
      );
    }
  }

  if (widenedToBlastRadius) {
    warnings.push(
      `no route was named, so this edit was recorded over the region's WHOLE blast radius — ` +
        `all ${blastRadius.length} route(s) it renders on: ${blastRadius.join(", ")}`,
    );
  }

  return {
    changed: commit.changed,
    allowed: true,
    reason: commit.changed
      ? `disabled ${edits.length} region(s) on ${primary?.blastRadius.length ?? 0} route(s), ` +
        `${primary?.slotKeys.length ?? 0} slot(s)` +
        (widenedToBlastRadius ? " — NO ROUTE NAMED, so the whole blast radius was used" : "") +
        ` (revision ${commit.revision?.revisionId ?? "?"})`
      : "already recorded — nothing written, no revision",
    refusals: [],
    revisionId: commit.revision?.revisionId ?? null,
    regionIds: allIds,
    effect:
      primary === null
        ? null
        : {
            blastRadius: primary.blastRadius,
            slotKeys: primary.slotKeys.length,
            nodes: primary.nodes.length,
            disabledNodeCount: primary.disabledNodeCount,
            siblingRegionIds: primary.siblingRegionIds,
            orphanedTargets: primary.orphanedTargets.length,
          },
    warnings,
    adoption: adoption.adopted ? adoption.note : null,
    widenedToBlastRadius,
  };
}

// ---------------------------------------------------------------------------
// Route toggle
// ---------------------------------------------------------------------------

export interface RouteEnablementRow {
  route: string;
  path: string;
  pageId: string;
  enabled: boolean;
  /** null when the engine REFUSES the recorded decision — never "off". */
  applied: boolean | null;
  source: string;
}

export interface RouteEnablementPanel {
  rows: RouteEnablementRow[];
  disabledRoutes: string[];
  refusals: RefusalView[];
  navCascadeAnchors: number;
  deadLinks: DeadLinkFinding[];
  note: string;
}

export async function routeEnablementPanel(site: EditorSite): Promise<RouteEnablementPanel> {
  const inputs = await enablementInputsFor(site);
  const recorded = Object.keys(site.project.authored.disabledRoutes ?? {}).sort();
  let decision: RouteDisableDecision | null = null;
  if (recorded.length > 0) {
    decision = evaluateRouteDisable(recorded, inputs, site.project.authored.slotValues);
  }
  const refused = new Set(
    (decision?.allowed === false ? decision.refusals : []).map((refusal) => refusal.subject),
  );
  const rows: RouteEnablementRow[] = inputs.routes.map((route) => {
    const isRecorded = recorded.includes(route.key);
    const refusedHere = decision?.allowed === false;
    return {
      route: route.key,
      path: route.path,
      pageId: route.pageSourceId,
      enabled: !isRecorded,
      applied: !isRecorded ? true : refusedHere ? null : false,
      source: !isRecorded
        ? "authored.disabledRoutes has no entry — the route ships"
        : refusedHere
          ? `recorded, but the resolver REFUSES the current set: ${(decision?.refusals ?? []).map((r) => r.code).join(", ")}${refused.has(route.key) ? "" : " (refused as a set)"}`
          : `authored.disabledRoutes[${route.key}] — removed from the route table, the SEO plan, the sitemap and the export`,
    };
  });
  return {
    rows,
    disabledRoutes: recorded,
    refusals: refusalViews(decision?.allowed === false ? decision.refusals : []),
    navCascadeAnchors: (decision?.navCascade ?? []).reduce((total, item) => total + item.nodes.length, 0),
    deadLinks: decision?.deadLinks ?? [],
    note:
      recorded.length === 0
        ? "every route is enabled"
        : `${recorded.length} route(s) disabled: ${recorded.join(", ")}`,
  };
}

export interface RouteToggleResult {
  changed: boolean;
  allowed: boolean;
  reason: string;
  refusals: RefusalView[];
  revisionId: string | null;
  route: string;
  navCascade: { groups: number; anchors: number; slotKeys: string[] } | null;
  deadLinks: DeadLinkFinding[];
  orphanedPageSourceIds: string[];
  sharedWithEnabledPageSourceIds: string[];
  warnings: string[];
}

export async function toggleRoute(
  site: EditorSite,
  request: { route: string; enabled: boolean; reason?: string },
): Promise<RouteToggleResult> {
  const base: RouteToggleResult = {
    changed: false,
    allowed: false,
    reason: "",
    refusals: [],
    revisionId: null,
    route: request.route,
    navCascade: null,
    deadLinks: [],
    orphanedPageSourceIds: [],
    sharedWithEnabledPageSourceIds: [],
    warnings: [],
  };
  const inputs = await enablementInputsFor(site);
  const recorded = Object.keys(site.project.authored.disabledRoutes ?? {});

  if (request.enabled) {
    const commit = await commitAuthoredEdits(
      site.projectDir,
      [{ op: "enable-route", route: request.route }],
      { origin: "edit", summary: `editor: enable route ${request.route}` },
    );
    return {
      ...base,
      allowed: true,
      changed: commit.changed,
      revisionId: commit.revision?.revisionId ?? null,
      reason: commit.changed
        ? `route ${request.route} enabled again (revision ${commit.revision?.revisionId ?? "?"})`
        : "the route was already enabled — nothing written, no revision",
    };
  }

  // The decision is taken over the WHOLE disabled set, not this route alone:
  // `last-route` and the nav cascade are properties of the set.
  const wanted = [...new Set([...recorded, request.route])];
  const decision = evaluateRouteDisable(wanted, inputs, site.project.authored.slotValues);
  if (!decision.allowed) {
    return {
      ...base,
      reason: `REFUSED (${decision.refusals.length}) — ${decision.refusals.map((r) => r.code).join(", ")}`,
      refusals: refusalViews(decision.refusals),
    };
  }

  const commit = await commitAuthoredEdits(
    site.projectDir,
    [
      {
        op: "disable-route",
        route: request.route,
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
      },
    ],
    { origin: "edit", summary: `editor: disable route ${request.route}` },
  );

  const anchors = decision.navCascade.reduce((total, item) => total + item.nodes.length, 0);
  const warnings: string[] = [];
  if (decision.deadLinks.length > 0) {
    warnings.push(
      `${decision.deadLinks.length} link(s) to a disabled route CANNOT be removed automatically ` +
        `(${[...new Set(decision.deadLinks.map((link) => link.reason))].join(", ")}) — each becomes a ` +
        "release-blocking dead-internal-link requirement and the build will not clear it on its own",
    );
  }
  if (decision.sharedWithEnabledPageSourceIds.length > 0) {
    warnings.push(
      `page(s) ${decision.sharedWithEnabledPageSourceIds.join(", ")} stay in the package — an ENABLED route still loads them`,
    );
  }
  return {
    changed: commit.changed,
    allowed: true,
    reason: commit.changed
      ? `route ${request.route} disabled — ${anchors} navigation anchor(s) removed, ${decision.deadLinks.length} dead link(s) reported (revision ${commit.revision?.revisionId ?? "?"})`
      : "already recorded — nothing written, no revision",
    refusals: [],
    revisionId: commit.revision?.revisionId ?? null,
    route: request.route,
    navCascade: {
      groups: decision.navCascade.length,
      anchors,
      slotKeys: decision.navCascade.map((item) => item.slotKey),
    },
    deadLinks: decision.deadLinks,
    orphanedPageSourceIds: decision.orphanedPageSourceIds,
    sharedWithEnabledPageSourceIds: decision.sharedWithEnabledPageSourceIds,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Making it physical in the PREVIEW
// ---------------------------------------------------------------------------

export const PREVIEW_ENABLEMENT_MARKER = "enablement-applied.json";

interface PreviewEnablementMarker {
  schemaName: "preview-enablement-v1";
  /** Signature of the plan currently applied to `<previewDir>/app`. */
  signature: string;
  /** false while an apply is in flight — a crash leaves the app DIRTY. */
  complete: boolean;
  appliedAt: string;
  disabledRoutes: string[];
  disabledRegionIds: string[];
}

export interface PreviewEnablementSync {
  changed: boolean;
  signature: string;
  previousSignature: string;
  restoredPristine: boolean;
  workerRestarted: boolean;
  routesRemoved: string[];
  routesRemaining: number;
  regionNodesRemoved: number;
  navNodesRemoved: number;
  pageFilesRemoved: string[];
  refusals: RefusalView[];
  warnings: string[];
  ms: number;
}

function planSignature(resolved: ResolvedEnablement): string {
  const plan = resolved.plan;
  if (enablementPlanIsEmpty(plan)) return "";
  return createHash("sha256")
    .update(
      JSON.stringify({
        routes: [...plan.disabledRoutes].sort(),
        nodes: plan.disabledNodes
          .map((node) => `${node.pageSourceId}|${node.viewport}|${node.nodeId}`)
          .sort(),
        nav: plan.removedNavNodes
          .map((node) => `${node.pageSourceId}|${node.viewport}|${node.nodeId}`)
          .sort(),
      }),
    )
    .digest("hex");
}

async function readMarker(file: string): Promise<PreviewEnablementMarker | null> {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as PreviewEnablementMarker;
  } catch {
    return null;
  }
}

/**
 * Restore the preview app's `reconstruction-data` from the IMMUTABLE template.
 *
 * An enablement apply DELETES nodes and page files; re-enabling cannot undo
 * that in place. The template run is the read-only source of truth those bytes
 * were copied from in the first place, so every sync starts from it and applies
 * the CURRENT plan whole. That also makes the preview self-healing: a workspace
 * left dirty by a killed session is repaired on the next open.
 */
async function restorePristineData(templateRunDir: string, appDir: string): Promise<void> {
  const source = path.join(templateRunDir, "app", "reconstruction-data");
  const target = path.join(appDir, "reconstruction-data");
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

/**
 * Make the project's authored enablement physical in the running preview.
 *
 * Idempotent by signature: when the plan the workspace already carries is the
 * plan the project now wants, nothing is copied, nothing is applied and the
 * worker is not restarted — so opening a site, saving a text edit or switching
 * routes never pays this cost.
 */
export async function syncPreviewEnablement(
  site: EditorSite,
  session: AuthoringPreviewSession,
): Promise<PreviewEnablementSync> {
  const started = Date.now();
  const markerFile = path.join(session.previewDir, "overlay", PREVIEW_ENABLEMENT_MARKER);
  const resolved = await resolveSiteEnablement(site);
  const signature = planSignature(resolved);
  const marker = await readMarker(markerFile);
  const previousSignature = marker === null ? "" : marker.complete ? marker.signature : "DIRTY";

  const base: PreviewEnablementSync = {
    changed: false,
    signature,
    previousSignature,
    restoredPristine: false,
    workerRestarted: false,
    routesRemoved: [],
    routesRemaining: 0,
    regionNodesRemoved: 0,
    navNodesRemoved: 0,
    pageFilesRemoved: [],
    refusals: refusalViews(resolved.refusals),
    warnings: resolved.warnings,
    ms: 0,
  };
  if (previousSignature === signature) return { ...base, ms: Date.now() - started };

  await mkdir(path.dirname(markerFile), { recursive: true });
  await writeFile(
    markerFile,
    JSON.stringify(
      {
        schemaName: "preview-enablement-v1",
        signature,
        complete: false,
        appliedAt: new Date().toISOString(),
        disabledRoutes: resolved.plan.disabledRoutes,
        disabledRegionIds: resolved.plan.disabledRegionIds,
      } satisfies PreviewEnablementMarker,
      null,
      2,
    ),
    "utf8",
  );

  let restoredPristine = false;
  if (previousSignature !== "") {
    await restorePristineData(site.templateRunDir, session.appDir);
    restoredPristine = true;
  }
  let report = {
    routesRemoved: [] as string[],
    routesRemaining: 0,
    regionNodesRemoved: 0,
    navNodesRemoved: 0,
    pageFilesRemoved: [] as string[],
  };
  if (signature !== "") {
    const applied = await applyEnablementToApp(session.appDir, resolved.plan);
    report = {
      routesRemoved: applied.routesRemoved,
      routesRemaining: applied.routesRemaining,
      regionNodesRemoved: applied.regionNodesRemoved,
      navNodesRemoved: applied.navNodesRemoved,
      pageFilesRemoved: applied.pageFilesRemoved,
    };
    if (applied.regionNodesNotFound.length > 0 || applied.navNodesNotFound.length > 0) {
      base.warnings.push(
        `preview apply: ${applied.regionNodesNotFound.length} region node(s) and ` +
          `${applied.navNodesNotFound.length} nav node(s) named by the plan were not in the page trees`,
      );
    }
  }

  await writeFile(
    markerFile,
    JSON.stringify(
      {
        schemaName: "preview-enablement-v1",
        signature,
        complete: true,
        appliedAt: new Date().toISOString(),
        disabledRoutes: resolved.plan.disabledRoutes,
        disabledRegionIds: resolved.plan.disabledRegionIds,
      } satisfies PreviewEnablementMarker,
      null,
      2,
    ),
    "utf8",
  );

  // The patched loader memoizes the RAW page JSON for the process lifetime, so
  // a structural change is invisible until the worker is swapped. The proxy URL
  // does not move: the iframe stays exactly where the operator left it.
  await session.restartWorker();

  return {
    ...base,
    ...report,
    changed: true,
    restoredPristine,
    workerRestarted: true,
    ms: Date.now() - started,
  };
}
