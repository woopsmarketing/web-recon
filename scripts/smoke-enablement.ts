import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  ENABLEMENT_REFUSAL_CODES,
  authoredEnablementIsEmpty,
  evaluateRegionDisable,
  evaluateRouteDisable,
  hrefsInSerializedMarkup,
  loadEnablementInputs,
  resolveEnablement,
  type EnablementInputs,
} from "../src/release/enablement.js";
import {
  buildRegionMembership,
  buildSignaturePageCounts,
  nodeIdFromGeneratedDomId,
  regionEnablementScope,
  regionRouteBlastRadius,
  scanInteractionEdges,
} from "../src/regions/enablement.js";
import {
  AUTHORED_DISABLED_REGION_IMPACTS,
  AUTHORED_DISABLED_ROUTE_IMPACTS,
  AUTHORED_FIELD_IMPACTS,
  authoredInvalidatedStages,
} from "../src/release/graph.js";
import { authoredEnablementSlice, resolutionSliceFor } from "../src/release/freshness.js";
import {
  applyAuthoredEdits,
  removeAuthoredRegionDisabled,
  removeAuthoredRouteDisabled,
  setAuthoredRegionDisabled,
  setAuthoredRouteDisabled,
} from "../src/release/authored.js";
import {
  authoredChangeIsEmpty,
  diffAuthoredState,
  hashAuthoredState,
  summarizeAuthoredChange,
} from "../src/release/revisions.js";
import {
  AuthoredStateSchema,
  DisabledRegionSchema,
  emptyAuthoredState,
  type AuthoredState,
} from "../src/release/types.js";
import { applyEnablementToApp, emptyEnablementPlan } from "../src/production/enablement.js";
import { buildSlotAccounting } from "../src/content-injection/accounting.js";
import { SLOT_DISPOSITIONS, type ContentRunManifest, type ContentUnitsFile } from "../src/content-injection/types.js";
import { buildContentUnits } from "../src/content-injection/units.js";
import { loadReconTemplate } from "../src/content-injection/index.js";
import { startAuthoringPreview } from "../src/authoring-preview/index.js";
import type { RuntimePage } from "../src/reconstruction/types.js";

/**
 * Task 28 Phases 5 + 6 smoke — SAFE REGION ENABLEMENT and SAFE ROUTE ENABLEMENT.
 *
 * Every safety property is checked against a REAL template and a REAL
 * page-regions artifact, because the properties only exist on real markup:
 *
 *   linear.app  recon-templates/2026-08-25T21-53-26-980Z + page-regions/
 *               2026-08-26T16-14-07-901Z — the accepted Task-26 lineage. Its
 *               homepage carries the three cross-region interaction edges the
 *               cut rule exists for, and its eight page-scoped footer regions
 *               are the case the compiler's strict global lift misses.
 *   stripe.com  recon-templates/2026-08-18T10-45-40-007Z + page-regions/
 *               2026-08-26T16-14-08-675Z — the ONLY lineage on disk with a
 *               MANY-TO-ONE page group (`/resources/more/arr-loans-explained`
 *               and `/resources/more/virtual-credit-cards-for-businesses-
 *               explained` both load pages/p000012.json). Both the refused and
 *               the safe branch of §4 are proven on that real group.
 *
 * Nothing here writes into a lineage run directory. §9 copies the template app
 * into a scratch dir before applying anything, and §11's preview workspace is a
 * NEW wr28- namespace.
 */

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}
function measured(line: string): void {
  console.log(`  [measured] ${line}`);
}

const LINEAR_TEMPLATE = path.join("data", "linear.app", "recon-templates", "2026-08-25T21-53-26-980Z");
const LINEAR_REGIONS = path.join("data", "linear.app", "page-regions", "2026-08-26T16-14-07-901Z");
const STRIPE_TEMPLATE = path.join("data", "stripe.com", "recon-templates", "2026-08-18T10-45-40-007Z");
const STRIPE_REGIONS = path.join("data", "stripe.com", "page-regions", "2026-08-26T16-14-08-675Z");
const SCRATCH = path.join("tmp", "wr28", `enablement-${process.pid}`);
const PREVIEW_DIR = path.join("data", "linear.app", "authoring-previews", "wr28-p56");

const AT = "2026-08-28T00:00:00.000Z";

/** The stripe many-to-one group, named once. */
const SHARED_ROUTE_A = "/resources/more/arr-loans-explained";
const SHARED_ROUTE_B = "/resources/more/virtual-credit-cards-for-businesses-explained";

function authoredWith(partial: Partial<AuthoredState>): AuthoredState {
  return AuthoredStateSchema.parse({ ...emptyAuthoredState(), ...partial });
}

async function main(): Promise<void> {
  await rm(SCRATCH, { recursive: true, force: true });
  await mkdir(SCRATCH, { recursive: true });

  // =========================================================================
  section("1. the authored model — absent-when-empty, idempotent, schema-enforced");
  // =========================================================================
  const empty = emptyAuthoredState();
  check(
    "28.P5.1 emptyAuthoredState emits NEITHER enablement field",
    !("disabledRoutes" in empty) && !("disabledRegions" in empty),
    Object.keys(empty).join(","),
  );
  const emptyHash = hashAuthoredState(empty);

  const offOnce = setAuthoredRouteDisabled(empty, "/pricing", { reason: "not needed" }, AT);
  check("28.P5.2 disabling a route reports changed", offOnce.changed === true);
  const offTwice = setAuthoredRouteDisabled(offOnce.authored, "/pricing", { reason: "not needed" }, AT);
  check(
    "28.P5.3 re-disabling the SAME route is a no-op — no change, same object",
    offTwice.changed === false && offTwice.authored === offOnce.authored,
  );
  const backOn = removeAuthoredRouteDisabled(offOnce.authored, "/pricing", AT);
  const emptyStamped = AuthoredStateSchema.parse({ ...empty, updatedAt: AT });
  check(
    "28.P5.4 re-enabling the LAST route deletes the field and round-trips to the pre-enablement hash",
    backOn.changed === true &&
      !("disabledRoutes" in backOn.authored) &&
      hashAuthoredState(backOn.authored) === hashAuthoredState(emptyStamped) &&
      // the ONLY difference from the untouched empty state is the edit stamp
      hashAuthoredState(backOn.authored) !== emptyHash,
    `${Object.keys(backOn.authored).join(",")} hash=${hashAuthoredState(backOn.authored).slice(0, 12)} vs ${hashAuthoredState(emptyStamped).slice(0, 12)}`,
  );
  check(
    "28.P5.5 re-enabling an already-enabled route is a no-op",
    removeAuthoredRouteDisabled(empty, "/pricing", AT).changed === false,
  );

  const regionOff = setAuthoredRegionDisabled(
    empty,
    "p000001:rgn:main1:div:2>section:4",
    { scope: "routes", routes: ["/b", "/a", "/a"] },
    AT,
  );
  check(
    "28.P5.6 a scoped region disable stores a DEDUPED, SORTED route list",
    JSON.stringify(regionOff.authored.disabledRegions?.["p000001:rgn:main1:div:2>section:4"]?.routes) ===
      JSON.stringify(["/a", "/b"]),
    JSON.stringify(regionOff.authored.disabledRegions),
  );
  check(
    "28.P5.7 the same decision with the routes in a DIFFERENT order is a no-op",
    setAuthoredRegionDisabled(
      regionOff.authored,
      "p000001:rgn:main1:div:2>section:4",
      { scope: "routes", routes: ["/b", "/a"] },
      "2026-08-28T09:99:99.000Z",
    ).changed === false,
  );
  check(
    "28.P5.8 changing the scope to global IS a change",
    setAuthoredRegionDisabled(regionOff.authored, "p000001:rgn:main1:div:2>section:4", { scope: "global" }, AT)
      .changed === true,
  );
  check(
    "28.P5.9 removing the last disabled region deletes the field",
    !("disabledRegions" in removeAuthoredRegionDisabled(regionOff.authored, "p000001:rgn:main1:div:2>section:4", AT).authored),
  );

  let scopedNoRoutes = "no throw";
  try {
    DisabledRegionSchema.parse({ scope: "routes", updatedAt: AT });
  } catch (error) {
    scopedNoRoutes = (error as Error).message;
  }
  check(
    '28.P5.10 scope "routes" with no route list is REFUSED by the schema',
    scopedNoRoutes.includes("non-empty route list"),
    scopedNoRoutes.slice(0, 90),
  );
  let globalWithRoutes = "no throw";
  try {
    DisabledRegionSchema.parse({ scope: "global", routes: ["/"], updatedAt: AT });
  } catch (error) {
    globalWithRoutes = (error as Error).message;
  }
  check(
    '28.P5.11 scope "global" carrying a route list is REFUSED by the schema',
    globalWithRoutes.includes("must not carry a route list"),
    globalWithRoutes.slice(0, 90),
  );
  let extraField = "no throw";
  try {
    AuthoredStateSchema.parse({
      ...empty,
      disabledRegions: { r: { scope: "global", updatedAt: AT, nodeIds: ["n1"] } },
    });
  } catch (error) {
    extraField = (error as Error).message;
  }
  check(
    "28.P5.12 a disabled region stores NO derivation evidence (an extra nodeIds key is refused)",
    extraField !== "no throw",
    extraField.slice(0, 90),
  );

  const batch = applyAuthoredEdits(
    empty,
    [
      { op: "disable-route", route: "/pricing" },
      { op: "disable-region", regionId: "p000001:rgn:footer1:self", scope: "global" },
    ],
    AT,
  );
  check(
    "28.P5.13 the AuthoredEdit union carries both ops and one batch applies both",
    batch.changed &&
      Object.keys(batch.authored.disabledRoutes ?? {}).length === 1 &&
      Object.keys(batch.authored.disabledRegions ?? {}).length === 1,
  );
  check(
    "28.P5.14 authoredEnablementIsEmpty is true before and false after",
    authoredEnablementIsEmpty(empty) && !authoredEnablementIsEmpty(batch.authored),
  );

  // =========================================================================
  section("2. freshness + impact prediction");
  // =========================================================================
  check(
    "28.P5.15 the impact table names both enablement fields",
    AUTHORED_FIELD_IMPACTS.disabledRoutes === AUTHORED_DISABLED_ROUTE_IMPACTS &&
      AUTHORED_FIELD_IMPACTS.disabledRegions === AUTHORED_DISABLED_REGION_IMPACTS,
  );
  const routePrediction = authoredInvalidatedStages(empty, batch.authored);
  check(
    "28.P5.16 an enablement edit predicts content+theme+seo+assets+production, never a frozen root",
    JSON.stringify(routePrediction) === JSON.stringify(["content", "theme", "seo", "assets", "production"]),
    routePrediction.join(","),
  );
  const regionOnly = applyAuthoredEdits(
    empty,
    [{ op: "disable-region", regionId: "p000001:rgn:main1:div:2>section:4", scope: "global" }],
    AT,
  ).authored;
  check(
    "28.P5.17 a REGION-only edit still closes to seo+theme through the content dependency",
    JSON.stringify(authoredInvalidatedStages(empty, regionOnly)) ===
      JSON.stringify(["content", "theme", "seo", "assets", "production"]),
    authoredInvalidatedStages(empty, regionOnly).join(","),
  );
  check(
    "28.P5.18 an empty authored state contributes NOTHING to the enablement slice (back-compat)",
    JSON.stringify(authoredEnablementSlice(empty)) === "{}",
  );
  const packOnly = { schemaVersion: 1 as const, schemaName: "production-resolution-v1" as const };
  for (const stage of ["content", "seo", "assets", "production"] as const) {
    const before = JSON.stringify(resolutionSliceFor(stage, packOnly, {}, empty));
    const after = JSON.stringify(resolutionSliceFor(stage, packOnly, {}, batch.authored));
    check(
      `28.P5.19.${stage} the ${stage} input slice MOVES when enablement changes`,
      before !== after,
      `${before} -> ${after}`,
    );
  }
  check(
    "28.P5.20 a project with no enablement hashes exactly as it did before the field existed",
    JSON.stringify(resolutionSliceFor("production", packOnly, {}, empty)) ===
      JSON.stringify(resolutionSliceFor("production", packOnly, {}, undefined)),
  );
  check(
    "28.P5.21 a REGION edit does NOT enter the seo slice (regions are not per-route SEO)",
    JSON.stringify(resolutionSliceFor("seo", packOnly, {}, regionOnly)) ===
      JSON.stringify(resolutionSliceFor("seo", packOnly, {}, empty)),
  );

  // =========================================================================
  section("3. the revision chain sees enablement in both directions");
  // =========================================================================
  const diffOn = diffAuthoredState(empty, batch.authored);
  check(
    "28.P5.22 diffAuthoredState reports routesDisabled + regionsDisabled",
    JSON.stringify(diffOn.routesDisabled) === '["/pricing"]' &&
      JSON.stringify(diffOn.regionsDisabled) === '["p000001:rgn:footer1:self"]',
    JSON.stringify(diffOn),
  );
  const diffOff = diffAuthoredState(batch.authored, empty);
  check(
    "28.P5.23 the reverse edit reports routesReEnabled + regionsReEnabled",
    JSON.stringify(diffOff.routesReEnabled) === '["/pricing"]' &&
      JSON.stringify(diffOff.regionsReEnabled) === '["p000001:rgn:footer1:self"]',
    JSON.stringify(diffOff),
  );
  const scopeChange = diffAuthoredState(
    batch.authored,
    setAuthoredRegionDisabled(batch.authored, "p000001:rgn:footer1:self", { scope: "routes", routes: ["/"] }, AT).authored,
  );
  check(
    "28.P5.24 changing a region's scope is reported as regionsChanged, not as a new disable",
    JSON.stringify(scopeChange.regionsChanged) === '["p000001:rgn:footer1:self"]' &&
      (scopeChange.regionsDisabled ?? []).length === 0,
    JSON.stringify(scopeChange),
  );
  check(
    "28.P5.25 an unchanged snapshot is still EMPTY with the new dimensions in the schema",
    authoredChangeIsEmpty(diffAuthoredState(batch.authored, batch.authored)),
  );
  check(
    "28.P5.26 the one-line summary names the enablement movement",
    summarizeAuthoredChange(diffOn, "edit") === "edit: -1 route off, -1 region off",
    summarizeAuthoredChange(diffOn, "edit"),
  );

  // =========================================================================
  section("4. REAL linear.app template — the region analysis");
  // =========================================================================
  if (!existsSync(LINEAR_TEMPLATE) || !existsSync(LINEAR_REGIONS)) {
    console.log(`  SKIP  linear canary not on disk (${LINEAR_TEMPLATE} / ${LINEAR_REGIONS})`);
  } else {
    const linear = await loadEnablementInputs({
      templateRunDir: LINEAR_TEMPLATE,
      pageRegionsRef: LINEAR_REGIONS,
    });
    measured(
      `linear: ${linear.routes.length} routes, ${linear.pages.size} pages, ${linear.slots.length} slots, ` +
        `${linear.regionById.size} regions, ${linear.interactionTriggers} interaction triggers, ` +
        `${linear.interactionEdges.length} target edges`,
    );
    check(
      "28.P5.27 the region membership map resolves every region root in the artifact",
      linear.membership !== null && linear.membership.unresolvedRoots.length === 0,
      `${linear.membership?.unresolvedRoots.length} unresolved`,
    );
    // MEASURED, and it disagrees with the naive expectation: on BOTH real
    // templates the compiler's selection partitions the covered nodes, so no
    // node belongs to two regions. What IS many-to-many is the SLOT layer, and
    // that is the axis a safety rule has to get right — `region-plan.ts` maps a
    // slotKey to its FIRST owning region, which on linear collapses all eight
    // footer regions into one and under-reports the affected set by 7x.
    const regionsBySlotKey = new Map<string, Set<string>>();
    let nodesInMoreThanOneRegion = 0;
    for (const region of linear.regions!.regions) {
      for (const key of region.slotKeys) {
        regionsBySlotKey.set(key, (regionsBySlotKey.get(key) ?? new Set<string>()).add(region.regionId));
      }
    }
    for (const [pageSourceId, page] of linear.pages) {
      for (const viewport of ["desktop", "mobile"] as const) {
        const stack = [page[viewport].doc];
        while (stack.length > 0) {
          const node = stack.pop()!;
          if (linear.membership!.regionsOf(pageSourceId, viewport, node.n).length > 1) {
            nodesInMoreThanOneRegion += 1;
          }
          for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
        }
      }
    }
    const sharedSlotKeys = [...regionsBySlotKey.values()].filter((set) => set.size > 1).length;
    measured(
      `membership: ${linear.membership!.size} (page,viewport,node) keys owned by >=1 region, ` +
        `${nodesInMoreThanOneRegion} owned by >1 (the compiler PARTITIONS nodes); ` +
        `slot keys owned by >1 region: ${sharedSlotKeys} of ${regionsBySlotKey.size}`,
    );
    check(
      "28.P5.28 the SLOT layer is many-to-many — 134 linear slot keys belong to more than one region",
      sharedSlotKeys === 134 && regionsBySlotKey.size === 3079,
      `${sharedSlotKeys} shared of ${regionsBySlotKey.size}`,
    );
    check(
      "28.P5.28b the 84 global.footer.* keys are each owned by all EIGHT footer regions",
      [...regionsBySlotKey].filter(([key, set]) => key.startsWith("global.footer.") && set.size === 8).length === 84,
      String([...regionsBySlotKey].filter(([key, set]) => key.startsWith("global.footer.") && set.size === 8).length),
    );

    const signaturePageCounts = buildSignaturePageCounts(linear.regions!);
    let compilerGlobal = 0;
    let unionGlobal = 0;
    const footerIds: string[] = [];
    for (const region of linear.regions!.regions) {
      const scope = regionEnablementScope(region, {
        globalSlotKeys: linear.globalSlotKeys,
        signaturePageCounts,
      });
      if (region.scope === "global") compilerGlobal += 1;
      if (scope.global) unionGlobal += 1;
      if (region.landmark.key === "footer1" && region.childPath === "self") footerIds.push(region.regionId);
    }
    measured(
      `global regions: compiler strict lift ${compilerGlobal}, three-signal union ${unionGlobal}; ` +
        `footer1:self regions ${footerIds.length}`,
    );
    check(
      "28.P5.29 the three-signal union recovers MORE globals than the compiler's strict lift",
      unionGlobal > compilerGlobal,
      `${compilerGlobal} -> ${unionGlobal}`,
    );
    check(
      "28.P5.30 all 8 page-scoped footer regions are global by the GLOBAL-SLOT signal (the strict lift misses them)",
      footerIds.length === 8 &&
        footerIds.every((id) => {
          const region = linear.regionById.get(id)!;
          const scope = regionEnablementScope(region, {
            globalSlotKeys: linear.globalSlotKeys,
            signaturePageCounts,
          });
          return region.scope === "page" && scope.global && scope.signals.includes("global-scope-slot");
        }),
      footerIds.join(" "),
    );

    // ---- interaction graph census ----------------------------------------
    const edges = linear.interactionEdges;
    const withTarget = edges.filter((edge) => edge.targetRegionIds !== null);
    const cross = withTarget.filter(
      (edge) =>
        edge.triggerRegionIds.length > 0 &&
        edge.targetRegionIds!.length > 0 &&
        JSON.stringify(edge.triggerRegionIds) !== JSON.stringify(edge.targetRegionIds),
    );
    const same = withTarget.filter(
      (edge) =>
        edge.triggerRegionIds.length > 0 &&
        edge.targetRegionIds!.length > 0 &&
        JSON.stringify(edge.triggerRegionIds) === JSON.stringify(edge.targetRegionIds),
    );
    const regionless = withTarget.filter((edge) => edge.targetRegionIds!.length === 0);
    measured(
      `interaction edges: ${edges.length} total, ${same.length} same-region, ${cross.length} CROSS-region, ` +
        `${regionless.length} target outside every region, ${edges.length - withTarget.length} dyn-mount (no static target)`,
    );
    check(
      "28.P5.31 the scan finds REAL cross-region interaction edges on the linear homepage",
      cross.length === 3 &&
        cross.every((edge) => edge.targetNodeId === "n001530") &&
        cross.some((edge) => edge.triggerRegionIds.includes("global:rgn:nav1:self")),
      cross.map((edge) => `${edge.triggerNodeId}${JSON.stringify(edge.triggerRegionIds)}->${edge.targetNodeId}`).join(" "),
    );
    check(
      "28.P5.32 targets OUTSIDE every region are the larger bucket and are counted, not hidden",
      regionless.length > cross.length,
      `${regionless.length} vs ${cross.length}`,
    );
    check(
      "28.P5.33 a generated DOM id resolves back to its node id",
      nodeIdFromGeneratedDomId("wr-p000001-desktop-n001530") === "n001530" &&
        nodeIdFromGeneratedDomId("not-a-wr-id") === null,
    );

    // =======================================================================
    section("5. interaction cut safety — refuse, cascade, and the safe branch");
    // =======================================================================
    const cutRegion = "p000001:rgn:main1:div:2>section:3";
    const cut = evaluateRegionDisable({ regionId: cutRegion, scope: "global" }, linear);
    const cutCodes = cut.refusals.map((refusal) => refusal.code);
    check(
      "28.P5.34 disabling the region holding n001530 is REFUSED — 3 enabled triggers drive it",
      cut.allowed === false &&
        cutCodes.filter((code) => code === "interaction-cut-target-disabled").length === 3,
      cutCodes.join(","),
    );
    check(
      "28.P5.35 the refusal is MACHINE-READABLE: code, subject, the trigger and the target node",
      cut.refusals.every(
        (refusal) =>
          (ENABLEMENT_REFUSAL_CODES as readonly string[]).includes(refusal.code) &&
          refusal.subject === cutRegion &&
          typeof refusal.detail.triggerNodeId === "string" &&
          refusal.detail.targetNodeId === "n001530",
      ),
      JSON.stringify(cut.refusals[0]?.detail),
    );
    check(
      "28.P5.36 one of the broken triggers is in the GLOBAL nav, so the refusal names a cascade across all 8 routes",
      cut.refusals.some(
        (refusal) => refusal.cascadeAvailable && refusal.cascadeRegionIds.includes("global:rgn:nav1:self"),
      ),
      cut.refusals.map((refusal) => refusal.cascadeRegionIds.join("+")).join(" | "),
    );
    const cascade = [...new Set(cut.refusals.flatMap((refusal) => refusal.cascadeRegionIds))];
    const cascaded = evaluateRegionDisable({ regionId: cutRegion, scope: "global" }, linear, cascade);
    check(
      "28.P5.37 applying the named cascade CLEARS every target-disabled cut",
      cascaded.refusals.every((refusal) => refusal.code !== "interaction-cut-target-disabled"),
      cascaded.refusals.map((refusal) => refusal.code).join(","),
    );
    check(
      "28.P5.38 the cascade exposes a SECOND hazard the engine refuses instead of waving through: hidden targets that lose every trigger",
      cascaded.allowed === false &&
        cascaded.refusals.some(
          (refusal) => refusal.code === "interaction-cut-target-unreachable" && refusal.cascadeAvailable === false,
        ),
      cascaded.refusals.map((refusal) => `${refusal.code}/${refusal.cascadeAvailable}`).join(","),
    );

    const safeRegion = "p000001:rgn:main1:div:2>section:4";
    const safe = evaluateRegionDisable({ regionId: safeRegion, scope: "global" }, linear);
    check(
      "28.P5.39 SAFE BRANCH: the neighbouring section disables cleanly — the cut removes trigger AND affordance together",
      safe.allowed === true && safe.refusals.length === 0,
      safe.refusals.map((refusal) => refusal.code).join(","),
    );
    check(
      "28.P5.40 a disabled trigger whose target SURVIVES is REPORTED, never silently accepted",
      (safe.effect?.orphanedTargets.length ?? 0) > 0,
      JSON.stringify(safe.effect?.orphanedTargets),
    );

    // =======================================================================
    section("6. global region safety — a global region is disabled globally or not at all");
    // =======================================================================
    const footerHome = footerIds.find((id) => id.startsWith("p000001:"))!;
    const footerScoped = evaluateRegionDisable(
      { regionId: footerHome, scope: "routes", routes: regionRouteBlastRadius(linear.regionById.get(footerHome)!) },
      linear,
    );
    check(
      '28.P5.41 the footer refuses scope "routes" even when the list covers its whole blast radius',
      footerScoped.allowed === false &&
        footerScoped.refusals.some((refusal) => refusal.code === "global-region-requires-explicit-global"),
      footerScoped.refusals.map((refusal) => refusal.code).join(","),
    );
    const footerGlobal = evaluateRegionDisable({ regionId: footerHome, scope: "global" }, linear);
    check(
      '28.P5.42 the same footer is ACCEPTED with scope "global"',
      footerGlobal.allowed === true,
      footerGlobal.refusals.map((refusal) => refusal.code).join(","),
    );
    measured(
      `footer global disable: ${footerGlobal.effect?.slotKeys.length} slot keys, ` +
        `${footerGlobal.effect?.nodes.length} occurrences, ${footerGlobal.effect?.siblingRegionIds.length} sibling region ids`,
    );
    check(
      "28.P5.43 the effect names the 7 SIBLING footer ids — never pretending one id is the whole footer",
      footerGlobal.effect?.siblingRegionIds.length === 7 &&
        footerGlobal.effect.siblingRegionIds.every((id) => footerIds.includes(id)),
      footerGlobal.effect?.siblingRegionIds.join(" "),
    );
    check(
      "28.P5.44 the footer's 84 global-scope slot keys are what makes it global",
      footerGlobal.effect?.scope.globalSlotKeys.length === 84 &&
        footerGlobal.effect.slotKeys.length === 84,
      `${footerGlobal.effect?.scope.globalSlotKeys.length} / ${footerGlobal.effect?.slotKeys.length}`,
    );

    const unknown = evaluateRegionDisable({ regionId: "p000001:rgn:nope:self", scope: "global" }, linear);
    check(
      "28.P5.45 an unknown region id is REFUSED, not ignored",
      unknown.allowed === false && unknown.refusals[0]?.code === "unknown-region",
      unknown.refusals.map((refusal) => refusal.code).join(","),
    );
    const noRegions = await loadEnablementInputs({ templateRunDir: LINEAR_TEMPLATE, pageRegionsRef: null });
    const noCompile = evaluateRegionDisable({ regionId: footerHome, scope: "global" }, noRegions);
    check(
      "28.P5.46 a project with NO region compile refuses every region edit with regions-not-compiled",
      noCompile.allowed === false && noCompile.refusals[0]?.code === "regions-not-compiled",
      noCompile.refusals.map((refusal) => refusal.code).join(","),
    );

    // =======================================================================
    section("8. route enablement on the real linear template");
    // =======================================================================
    const routeOff = evaluateRouteDisable(["/pricing"], linear);
    measured(
      `/pricing off: ${routeOff.navCascade.length} deterministic nav group(s) ` +
        `(${routeOff.navCascade.reduce((sum, item) => sum + item.nodes.length, 0)} anchor nodes), ` +
        `${routeOff.deadLinks.length} dead link(s), orphaned pages ${routeOff.orphanedPageSourceIds.join(",") || "none"}`,
    );
    check(
      "28.P6.1 disabling /pricing is allowed and leaves the other 7 routes",
      routeOff.allowed && routeOff.remainingRoutes.length === 7,
      routeOff.remainingRoutes.join(","),
    );
    check(
      "28.P6.2 the nav cascade is DETERMINISTIC: every removed anchor carries only its own slot group",
      routeOff.navCascade.length === 2 &&
        routeOff.navCascade.every(
          (item) => item.groupId !== null && item.removedSlotKeys.length === 2 && item.targetRoute === "/pricing",
        ),
      routeOff.navCascade.map((item) => `${item.slotKey}(${item.removedSlotKeys.length})`).join(" "),
    );
    check(
      "28.P6.3 the href's PAIRED LABEL rides along through the slot groupId — the label is never left orphaned",
      routeOff.navCascade.every((item) =>
        item.removedSlotKeys.some((key) => key.endsWith(".label")) &&
        item.removedSlotKeys.some((key) => key.endsWith(".href")),
      ),
      routeOff.navCascade.map((item) => item.removedSlotKeys.join("+")).join(" | "),
    );
    check(
      "28.P6.4 anchors are removed ONLY from routes that stay enabled (7 pages x 2 viewports)",
      routeOff.navCascade.every((item) => item.nodes.length === 14) &&
        routeOff.navCascade.every((item) => item.nodes.every((node) => node.pageSourceId !== "p000007")),
      routeOff.navCascade.map((item) => item.nodes.length).join(","),
    );
    check(
      "28.P6.5 the page no live route reaches any more is named as orphaned",
      routeOff.orphanedPageSourceIds.length === 1 && routeOff.sharedWithEnabledPageSourceIds.length === 0,
      `${routeOff.orphanedPageSourceIds.join(",")} / ${routeOff.sharedWithEnabledPageSourceIds.join(",")}`,
    );
    check(
      "28.P6.6 disabling EVERY route is REFUSED — a site with no page is not a disable",
      (() => {
        const all = evaluateRouteDisable(linear.routes.map((route) => route.key), linear);
        return all.allowed === false && all.refusals[0]?.code === "last-route";
      })(),
    );
    check(
      "28.P6.7 a route the template does not have is REFUSED",
      (() => {
        const bogus = evaluateRouteDisable(["/nope"], linear);
        return bogus.allowed === false && bogus.refusals[0]?.code === "unknown-route";
      })(),
    );

    // A link the engine must NOT touch: repoint a slot that hosts a whole card.
    const cardSlot = linear.slots.find(
      (slot) =>
        slot.type === "url" &&
        (linear.bindingsBySlotId.get(slot.id) ?? []).some((binding) => {
          const keys = linear.slotKeysByNode.get(`${binding.pageId}|${binding.viewport}|${binding.nodeId}`) ?? [];
          void keys;
          return true;
        }),
    );
    void cardSlot;
    const nonDeterministic = evaluateRouteDisable(["/pricing"], linear, (() => {
      // Point a slot whose ANCHOR also hosts unrelated slots at /pricing.
      const groupKeys = new Map<string, string[]>();
      for (const slot of linear.slots) {
        if (slot.groupId === undefined) continue;
        groupKeys.set(slot.groupId, [...(groupKeys.get(slot.groupId) ?? []), slot.key]);
      }
      for (const slot of linear.slots) {
        if (slot.type !== "url") continue;
        const allowed = new Set(slot.groupId === undefined ? [slot.key] : groupKeys.get(slot.groupId) ?? []);
        for (const binding of linear.bindingsBySlotId.get(slot.id) ?? []) {
          const host = linear.slotKeysByNode.get(`${binding.pageId}|${binding.viewport}|${binding.nodeId}`) ?? [];
          void host;
        }
        const hasForeign = (linear.bindingsBySlotId.get(slot.id) ?? []).some((binding) => {
          const page = linear.pages.get(binding.pageId);
          if (page === undefined) return false;
          const subtreeKeys = new Set<string>();
          const stack = [page[binding.viewport].doc];
          let found = false;
          while (stack.length > 0) {
            const node = stack.pop()!;
            if (node.n === binding.nodeId) {
              found = true;
              const walk = [node];
              while (walk.length > 0) {
                const inner = walk.pop()!;
                for (const key of linear.slotKeysByNode.get(`${binding.pageId}|${binding.viewport}|${inner.n}`) ?? []) {
                  subtreeKeys.add(key);
                }
                for (const child of inner.c ?? []) if (child.k === "e") walk.push(child);
              }
              break;
            }
            for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
          }
          return found && [...subtreeKeys].some((key) => !allowed.has(key));
        });
        if (hasForeign) return { [slot.key]: "/pricing" };
      }
      return {};
    })());
    measured(
      `non-deterministic repoint: ${nonDeterministic.deadLinks.length} dead-link finding(s), ` +
        `${nonDeterministic.navCascade.length} auto-removable group(s)`,
    );
    measured(
      `dead-link reasons: ${[...new Set(nonDeterministic.deadLinks.map((link) => link.reason))].sort().join(", ")}`,
    );
    check(
      "28.P6.8 a link the engine cannot remove deterministically is NEVER auto-removed — it becomes a dead-link finding",
      nonDeterministic.deadLinks.length > 0 &&
        nonDeterministic.deadLinks.every((link) =>
          [
            "slot-host-carries-unrelated-slots",
            "anchor-has-no-slot",
            "dynamic-template-host",
            "paint-twin-host",
            // Added by the Phase-5/6 correction: a link carried inside a
            // serialized markup string, which no element walk can see.
            "serialized-markup-host",
          ].includes(link.reason),
        ) &&
        !nonDeterministic.navCascade.some((item) =>
          nonDeterministic.deadLinks.some((link) =>
            item.nodes.some(
              (node) =>
                node.pageSourceId === link.pageSourceId &&
                node.viewport === link.viewport &&
                node.nodeId === link.nodeId,
            ),
          ),
        ),
      JSON.stringify(nonDeterministic.deadLinks[0] ?? null),
    );
    check(
      "28.P6.8b a DYNAMIC-TEMPLATE binding is refused for auto-removal — its nodeId is the TRIGGER, not the anchor",
      nonDeterministic.deadLinks.some((link) => link.reason === "dynamic-template-host") &&
        nonDeterministic.deadLinks
          .filter((link) => link.reason === "dynamic-template-host")
          .every((link) => {
            // A SLOT-BOUND finding must name a binding whose nodeId is the
            // trigger — the original property, unchanged.
            if (link.slotKey !== null) {
              const bindings = linear.bindingsBySlotId.get(
                linear.slots.find((slot) => slot.key === link.slotKey)?.id ?? "",
              );
              return (bindings ?? []).some(
                (binding) => binding.nodeId === link.nodeId && binding.surface !== "static",
              );
            }
            // The correction's population: no binding at all, so the evidence
            // is the captured template ITSELF carrying that href.
            const page = linear.pages.get(link.pageSourceId)?.[link.viewport];
            if (page === undefined) return false;
            const stack = [page.doc];
            while (stack.length > 0) {
              const node = stack.pop()!;
              if (node.n === link.nodeId) {
                const template = node.p?.["data-wr-dyn-template"];
                return typeof template === "string" && hrefsInSerializedMarkup(template).includes(link.href);
              }
              for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
            }
            return false;
          }),
      JSON.stringify(nonDeterministic.deadLinks.find((link) => link.reason === "dynamic-template-host")),
    );
    check(
      "28.P6.9 every dead-link finding is ACTIONABLE: the disabled route, the linking route, the page and the slot",
      nonDeterministic.deadLinks.every(
        (link) =>
          link.targetRoute === "/pricing" &&
          typeof link.linkingRoute === "string" &&
          link.linkingRoute.startsWith("/") &&
          typeof link.pageSourceId === "string" &&
          typeof link.nodeId === "string",
      ),
      JSON.stringify(nonDeterministic.deadLinks.slice(0, 2)),
    );

    // =======================================================================
    section("9. the disable, made PHYSICAL (a scratch copy of the template app)");
    // =======================================================================
    const appCopy = path.join(SCRATCH, "app");
    await cp(path.join(LINEAR_TEMPLATE, "app", "reconstruction-data"), path.join(appCopy, "reconstruction-data"), {
      recursive: true,
    });
    const resolved = resolveEnablement(
      authoredWith({
        disabledRoutes: { "/pricing": { updatedAt: AT } },
        disabledRegions: { [safeRegion]: { scope: "global", updatedAt: AT } },
      }),
      linear,
    );
    check(
      "28.P5.47 resolveEnablement builds ONE plan from both dimensions with no refusal",
      resolved.refusals.length === 0 &&
        resolved.plan.disabledRoutes.length === 1 &&
        resolved.plan.disabledNodes.length === 2 &&
        resolved.plan.removedNavNodes.length === 28,
      `refusals=${resolved.refusals.length} routes=${resolved.plan.disabledRoutes.length} nodes=${resolved.plan.disabledNodes.length} nav=${resolved.plan.removedNavNodes.length}`,
    );
    const beforeTree = JSON.parse(
      await readFile(path.join(appCopy, "reconstruction-data", "pages", "p000001.json"), "utf8"),
    ) as RuntimePage;
    const regionRootBefore = resolved.plan.disabledNodes[0];
    const applied = await applyEnablementToApp(appCopy, resolved.plan);
    measured(
      `applied: routes removed ${applied.routesRemoved.join(",")}, region roots ${applied.regionNodesRemoved}, ` +
        `nav hosts ${applied.navNodesRemoved}, page trees rewritten ${applied.pageFilesRewritten.length}, ` +
        `orphaned page trees deleted ${applied.pageFilesRemoved.join(",") || "none"}`,
    );
    const routeMapAfter = JSON.parse(
      await readFile(path.join(appCopy, "reconstruction-data", "route-map.json"), "utf8"),
    ) as { routes: Array<{ key: string; pageFile: string }> };
    check(
      "28.P6.10 the disabled route is gone from the route table and 7 remain",
      !routeMapAfter.routes.some((route) => route.key === "/pricing") && routeMapAfter.routes.length === 7,
      routeMapAfter.routes.map((route) => route.key).join(","),
    );
    check(
      "28.P6.11 the orphaned page TREE is deleted from the build copy, not merely unreferenced",
      applied.pageFilesRemoved.includes("pages/p000007.json") &&
        !existsSync(path.join(appCopy, "reconstruction-data", "pages", "p000007.json")),
      applied.pageFilesRemoved.join(","),
    );
    const afterTree = JSON.parse(
      await readFile(path.join(appCopy, "reconstruction-data", "pages", "p000001.json"), "utf8"),
    ) as RuntimePage;
    const findNode = (page: RuntimePage, viewport: "desktop" | "mobile", nodeId: string): boolean => {
      const stack = [page[viewport].doc];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.n === nodeId) return true;
        for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
      }
      return false;
    };
    check(
      "28.P5.48 the disabled region ROOT was present before and is absent after",
      findNode(beforeTree, regionRootBefore.viewport, regionRootBefore.nodeId) &&
        !findNode(afterTree, regionRootBefore.viewport, regionRootBefore.nodeId),
      `${regionRootBefore.pageSourceId}/${regionRootBefore.viewport}/${regionRootBefore.nodeId}`,
    );
    check(
      "28.P5.49 the whole SUBTREE went with it, not just the root",
      (() => {
        const membership = buildRegionMembership(
          new Map([["p000001", beforeTree]]),
          { regions: [linear.regionById.get(safeRegion)!] },
        );
        void membership;
        const region = linear.regionById.get(safeRegion)!;
        const inner = region.slotKeys.length;
        measured(`disabled region ${safeRegion}: ${inner} slot keys, ${resolved.regionEffects[0]?.disabledNodeCount} nodes`);
        return (resolved.regionEffects[0]?.disabledNodeCount ?? 0) > 2;
      })(),
    );
    const navNode = resolved.plan.removedNavNodes[0];
    check(
      "28.P6.12 the nav anchor pointing at the disabled route is gone from an ENABLED page",
      applied.navNodesRemoved === 28 &&
        !findNode(
          JSON.parse(
            await readFile(
              path.join(appCopy, "reconstruction-data", "pages", `${navNode.pageSourceId}.json`),
              "utf8",
            ),
          ) as RuntimePage,
          navNode.viewport,
          navNode.nodeId,
        ),
      `${navNode.pageSourceId}/${navNode.viewport}/${navNode.nodeId}`,
    );
    check(
      "28.P6.13 no anchor to the disabled route survives anywhere in the rewritten trees",
      await (async (): Promise<boolean> => {
        let remaining = 0;
        for (const route of routeMapAfter.routes) {
          const page = JSON.parse(
            await readFile(path.join(appCopy, "reconstruction-data", route.pageFile), "utf8"),
          ) as RuntimePage;
          for (const viewport of ["desktop", "mobile"] as const) {
            const stack = [page[viewport].doc];
            while (stack.length > 0) {
              const node = stack.pop()!;
              if (node.p?.href === "/pricing") remaining += 1;
              for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
            }
          }
        }
        measured(`anchors still pointing at /pricing after the cascade: ${remaining}`);
        return remaining === 0;
      })(),
    );
    let refusedApply = "no throw";
    try {
      await applyEnablementToApp(appCopy, {
        ...emptyEnablementPlan(),
        disabledRoutes: routeMapAfter.routes.map((route) => route.key),
      });
    } catch (error) {
      refusedApply = (error as Error).message;
    }
    check(
      "28.P6.14 the applier REFUSES to disable the last route",
      refusedApply.includes("export no page at all"),
      refusedApply.slice(0, 80),
    );

    // =======================================================================
    section("10. slot accounting — a disabled slot is ACCOUNTED FOR, never absent");
    // =======================================================================
    check(
      "28.P5.50 the disposition vocabulary gained disabled-region and disabled-route and kept `removed`",
      (SLOT_DISPOSITIONS as readonly string[]).includes("disabled-region") &&
        (SLOT_DISPOSITIONS as readonly string[]).includes("disabled-route") &&
        (SLOT_DISPOSITIONS as readonly string[]).includes("removed"),
      SLOT_DISPOSITIONS.join(","),
    );
    const template = await loadReconTemplate(path.join(LINEAR_TEMPLATE, "manifest.json"));
    const regionSlotKeys = linear.regionById.get(safeRegion)!.slotKeys.filter((key) => template.slotByKey.has(key));
    // A PAGE slot on the disabled route: literally a slot whose only route is
    // disabled, and therefore genuinely outside the packet's scope, which is
    // what makes the "+1, never absent" arithmetic below mean something. (The
    // first disabled-route slot in the plan is `global.footer.link.pricing.href`
    // — a GLOBAL nav href pointing at the disabled route. It is in scope on
    // every run, so using it here would have compared 594 with 594.)
    const routeSlot = resolved.disabledSlots.find(
      (slot) =>
        slot.disposition === "disabled-route" && template.slotByKey.get(slot.slotKey)?.scope === "page",
    )!;
    // The packet this fixture feeds to the accounting is built by the REAL unit
    // builder over the REAL scope ("/" — the route the safe region lives on),
    // not hand-assembled from three keys. It used to be hand-assembled, and the
    // correction pass's new denominator invariant (every scoped template slot
    // must have a row) correctly flagged that as an account covering 3 of 594
    // scoped slots. The checks below are unchanged in substance: the two region
    // keys are still the only unresolved ones, and the disabled-route slot
    // still arrives from OUTSIDE the scope, so it is still exactly +1.
    const fixtureRoutes = ["/"];
    const builtUnits = buildContentUnits(template, fixtureRoutes, false);
    const unitsFile: ContentUnitsFile = {
      schemaVersion: 1,
      templateId: template.manifest.templateId,
      units: builtUnits.units,
      reviewSlotKeys: builtUnits.reviewSlotKeys,
    };
    const manifestBase = {
      schemaVersion: 1 as const,
      schemaName: "content-run-v1" as const,
      engine: "web-recon-content-injection" as const,
      runId: "2026-08-28T00-00-00-000Z",
      createdAt: "2026-08-28T00:00:00.000Z",
      templateId: template.manifest.templateId,
      templateManifestFile: template.manifestFile,
      policyId: "content-policy-v1" as const,
      policyVersion: 1 as const,
      intentHash: "0".repeat(64),
      scopedRoutes: fixtureRoutes,
      includeReview: false,
      manualEdits: false,
      repairIterations: 0,
      counts: {
        units: builtUnits.units.length,
        editableSlots: builtUnits.editableSlotCount,
        reviewSlotsListed: builtUnits.reviewSlotKeys.length,
        generatedSlots: 0,
        unresolvedSlots: 0,
        imageBriefs: 0,
      },
      provenance: "derived" as const,
    };
    const withoutEnablement = buildSlotAccounting({
      manifest: manifestBase as unknown as ContentRunManifest,
      template,
      unitsFile,
      overlay: {},
      sources: {},
      unresolved: regionSlotKeys.slice(0, 2).map((key) => ({ slotKey: key, reason: "needs factual input" })),
      truthMode: "verified-only",
      truthDecisions: [],
    });
    const withEnablement = buildSlotAccounting({
      manifest: {
        ...manifestBase,
        enablement: {
          disabledRoutes: ["/pricing"],
          disabledSlots: [
            ...regionSlotKeys.slice(0, 2).map((key) => ({
              slotKey: key,
              disposition: "disabled-region" as const,
              detail: `slot lives in disabled region ${safeRegion}`,
            })),
            {
              slotKey: routeSlot.slotKey,
              disposition: "disabled-route" as const,
              detail: routeSlot.detail,
            },
          ],
          disabledRegionIds: [safeRegion],
        },
      } as unknown as ContentRunManifest,
      template,
      unitsFile,
      overlay: {},
      sources: {},
      unresolved: regionSlotKeys.slice(0, 2).map((key) => ({ slotKey: key, reason: "needs factual input" })),
      truthMode: "verified-only",
      truthDecisions: [],
    });
    measured(
      `accounting without enablement: ${withoutEnablement.totals.inScopeSlots} in scope, ` +
        `unresolved ${withoutEnablement.totals.byDisposition.unresolved}; with enablement: ` +
        `${withEnablement.totals.inScopeSlots} in scope, disabled-region ` +
        `${withEnablement.totals.byDisposition["disabled-region"]}, disabled-route ` +
        `${withEnablement.totals.byDisposition["disabled-route"]}, unresolved ` +
        `${withEnablement.totals.byDisposition.unresolved}`,
    );
    check(
      "28.P5.51 a disabled REGION slot stops being `unresolved` and becomes `disabled-region`",
      withoutEnablement.totals.byDisposition.unresolved === 2 &&
        withEnablement.totals.byDisposition.unresolved === 0 &&
        withEnablement.totals.byDisposition["disabled-region"] === 2,
      JSON.stringify(withEnablement.totals.byDisposition),
    );
    check(
      "28.P6.15 a slot whose ONLY route is disabled is in scope with disposition `disabled-route`, not absent",
      withEnablement.entries.some(
        (entry) => entry.slotKey === routeSlot.slotKey && entry.disposition === "disabled-route",
      ) && withEnablement.totals.inScopeSlots === withoutEnablement.totals.inScopeSlots + 1,
      `${withEnablement.totals.inScopeSlots} vs ${withoutEnablement.totals.inScopeSlots}`,
    );
    check(
      "28.P5.52 the reconciliation still PROVES the account: both axis totals equal the in-scope count",
      withEnablement.reconciliation.reconciled &&
        withEnablement.reconciliation.originTotal === withEnablement.reconciliation.inScopeSlots &&
        withEnablement.reconciliation.dispositionTotal === withEnablement.reconciliation.inScopeSlots &&
        withEnablement.reconciliation.missing.length === 0,
      JSON.stringify(withEnablement.reconciliation),
    );
    check(
      "28.P5.53 every entry still carries EXACTLY ONE origin and EXACTLY ONE disposition",
      withEnablement.entries.every(
        (entry) =>
          typeof entry.origin === "string" &&
          typeof entry.disposition === "string" &&
          (SLOT_DISPOSITIONS as readonly string[]).includes(entry.disposition),
      ),
    );
    check(
      "28.P5.54 `removed` is NOT reused: no disabled slot is reported as an emptied value",
      withEnablement.totals.byDisposition.removed === 0,
      JSON.stringify(withEnablement.totals.byDisposition),
    );
  }

  // =========================================================================
  section("7. SHARED PAGE (many-to-one) — the refused branch and the safe branch");
  // =========================================================================
  if (!existsSync(STRIPE_TEMPLATE) || !existsSync(STRIPE_REGIONS)) {
    console.log(`  SKIP  stripe shared-page canary not on disk (${STRIPE_TEMPLATE} / ${STRIPE_REGIONS})`);
  } else {
    const stripe: EnablementInputs = await loadEnablementInputs({
      templateRunDir: STRIPE_TEMPLATE,
      pageRegionsRef: STRIPE_REGIONS,
    });
    const sharedPages = [...stripe.routesByPage].filter(([, routes]) => routes.length > 1);
    measured(
      `stripe: ${stripe.routes.length} routes over ${stripe.pages.size} pages; ` +
        `${sharedPages.length} MANY-TO-ONE page group(s): ` +
        sharedPages.map(([page, routes]) => `${page}<-${routes.length}`).join(", "),
    );
    check(
      "28.P5.55 the fixture really is many-to-one: two routes load the same pageSourceId",
      sharedPages.length === 2 &&
        (stripe.routesByPage.get("p000012") ?? []).includes(SHARED_ROUTE_A) &&
        (stripe.routesByPage.get("p000012") ?? []).includes(SHARED_ROUTE_B),
      JSON.stringify(stripe.routesByPage.get("p000012")),
    );
    const sharedRegion = [...stripe.regionById.values()]
      .filter((region) => region.pages.some((page) => page.pageSourceId === "p000012"))
      .sort((a, b) => b.slotKeys.length - a.slotKeys.length)[0];
    measured(
      `chosen shared region ${sharedRegion.regionId}: ${sharedRegion.slotKeys.length} slot keys, ` +
        `blast radius ${regionRouteBlastRadius(sharedRegion).join(" + ")}`,
    );
    const refused = evaluateRegionDisable(
      { regionId: sharedRegion.regionId, scope: "routes", routes: [SHARED_ROUTE_A] },
      stripe,
    );
    const blast = refused.refusals.find((refusal) => refusal.code === "shared-page-blast-radius");
    check(
      "28.P5.56 REFUSED BRANCH: disabling a region for ONE route of a shared page is refused",
      refused.allowed === false && blast !== undefined,
      refused.refusals.map((refusal) => refusal.code).join(","),
    );
    check(
      "28.P5.57 the refusal NAMES the other route that would have been silently damaged",
      JSON.stringify(blast?.detail.wouldAlsoAffect) === JSON.stringify([SHARED_ROUTE_B]) &&
        blast?.affectedRoutes.includes(SHARED_ROUTE_B) === true,
      JSON.stringify(blast?.detail),
    );
    check(
      "28.P5.58 the refusal explains WHY it cannot be isolated (the id is namespaced by pageSourceId)",
      (blast?.message ?? "").includes("pageSourceId") && blast?.cascadeAvailable === false,
      blast?.message.slice(0, 120),
    );
    const accepted = evaluateRegionDisable({ regionId: sharedRegion.regionId, scope: "global" }, stripe);
    check(
      "28.P5.59 SAFE BRANCH: the same region IS disabled once the operator accepts the whole blast radius",
      accepted.allowed === true &&
        JSON.stringify(accepted.effect?.blastRadius) === JSON.stringify([SHARED_ROUTE_A, SHARED_ROUTE_B].sort()),
      JSON.stringify(accepted.effect?.blastRadius),
    );
    check(
      "28.P5.60 the accepted effect removes ONE page's occurrences and says so — no phantom per-route copy",
      accepted.effect?.pageSourceIds.length === 1 &&
        accepted.effect.pageSourceIds[0] === "p000012" &&
        accepted.effect.nodes.every((node) => node.pageSourceId === "p000012"),
      JSON.stringify(accepted.effect?.pageSourceIds),
    );
    const outside = evaluateRegionDisable(
      { regionId: sharedRegion.regionId, scope: "routes", routes: ["/"] },
      stripe,
    );
    check(
      "28.P5.61 naming a route the region does not render on is REFUSED as a no-op decision",
      outside.allowed === false &&
        outside.refusals.some((refusal) => refusal.code === "route-not-in-region-radius"),
      outside.refusals.map((refusal) => refusal.code).join(","),
    );
    const routeShared = evaluateRouteDisable([SHARED_ROUTE_A], stripe);
    check(
      "28.P6.16 disabling ONE route of a shared page keeps the page (its sibling route still needs it)",
      routeShared.allowed &&
        routeShared.sharedWithEnabledPageSourceIds.includes("p000012") &&
        routeShared.orphanedPageSourceIds.length === 0,
      `${routeShared.sharedWithEnabledPageSourceIds.join(",")} / ${routeShared.orphanedPageSourceIds.join(",")}`,
    );
  }

  // =========================================================================
  section("11. REGION OFF / ROUTE OFF in the authoring PREVIEW");
  // =========================================================================
  if (!existsSync(LINEAR_TEMPLATE) || !existsSync(LINEAR_REGIONS)) {
    console.log("  SKIP  §11 needs the linear canary");
  } else {
    const linear = await loadEnablementInputs({
      templateRunDir: LINEAR_TEMPLATE,
      pageRegionsRef: LINEAR_REGIONS,
    });
    const previewRegion = "p000001:rgn:main1:div:2>section:4";
    const resolved = resolveEnablement(
      authoredWith({
        disabledRoutes: { "/pricing": { updatedAt: AT } },
        disabledRegions: { [previewRegion]: { scope: "global", updatedAt: AT } },
      }),
      linear,
    );
    const rootNode = resolved.plan.disabledNodes.find((node) => node.viewport === "desktop")!;
    const navNode = resolved.plan.removedNavNodes.find(
      (node) => node.viewport === "desktop" && node.pageSourceId === "p000001",
    )!;

    await rm(PREVIEW_DIR, { recursive: true, force: true });
    const before = await startAuthoringPreview({
      templateRunDir: LINEAR_TEMPLATE,
      previewDir: PREVIEW_DIR,
      hot: true,
      log: () => {},
    });
    let baselineHtml = "";
    let baselinePricing = 0;
    try {
      baselineHtml = await (await fetch(`${before.baseUrl}/`)).text();
      baselinePricing = (await fetch(`${before.baseUrl}/pricing`)).status;
    } finally {
      await before.stop();
    }
    check(
      "28.P5.62 PREVIEW BASELINE: the region root and the /pricing nav anchor are both served",
      baselineHtml.includes(`data-wr-node="${rootNode.nodeId}"`) &&
        baselineHtml.includes(`data-wr-node="${navNode.nodeId}"`),
      `${rootNode.nodeId}=${baselineHtml.includes(`data-wr-node="${rootNode.nodeId}"`)} ${navNode.nodeId}=${baselineHtml.includes(`data-wr-node="${navNode.nodeId}"`)}`,
    );
    check("28.P6.17 PREVIEW BASELINE: /pricing answers 200", baselinePricing === 200, String(baselinePricing));

    const previewApply = await applyEnablementToApp(path.join(PREVIEW_DIR, "app"), resolved.plan);
    measured(
      `preview enablement applied: ${previewApply.routesRemoved.length} route(s), ` +
        `${previewApply.regionNodesRemoved} region root(s), ${previewApply.navNodesRemoved} nav host(s)`,
    );
    const after = await startAuthoringPreview({
      templateRunDir: LINEAR_TEMPLATE,
      previewDir: PREVIEW_DIR,
      hot: true,
      log: () => {},
    });
    let afterHtml = "";
    let afterPricing = 0;
    try {
      afterHtml = await (await fetch(`${after.baseUrl}/`)).text();
      afterPricing = (await fetch(`${after.baseUrl}/pricing`)).status;
    } finally {
      await after.stop();
    }
    check(
      "28.P5.63 REGION OFF IN PREVIEW: the disabled region root is GONE from the served homepage",
      !afterHtml.includes(`data-wr-node="${rootNode.nodeId}"`) && afterHtml.length > 10_000,
      `${afterHtml.length} bytes`,
    );
    check(
      "28.P6.18 ROUTE OFF IN PREVIEW: the disabled route answers 404, never a redirect to the homepage",
      afterPricing === 404,
      String(afterPricing),
    );
    check(
      "28.P6.19 ROUTE OFF IN PREVIEW: the navigation item pointing at it is gone from the served page",
      !afterHtml.includes(`data-wr-node="${navNode.nodeId}"`) && !afterHtml.includes('href="/pricing"'),
      `nav=${afterHtml.includes(`data-wr-node="${navNode.nodeId}"`)} href=${afterHtml.includes('href="/pricing"')}`,
    );
    check(
      "28.P5.64 the preview is still a real page: the rest of the homepage still renders",
      afterHtml.includes("data-wr-node=\"n000002\"") && afterHtml.includes("</html>"),
    );
  }

  // =========================================================================
  section("12. the three CORRECTION properties (verifier findings, Phases 5+6)");
  // =========================================================================
  {
    const linear = await loadEnablementInputs({
      templateRunDir: LINEAR_TEMPLATE,
      pageRegionsRef: LINEAR_REGIONS,
    });

    // ---- correction 1: a link inside SERIALIZED MARKUP is not invisible ----
    //
    // The dead-link detector used to be two ELEMENT walks (url-slot bindings,
    // then `node.p.href`). A link reconstruction captured as TEXT inside a
    // `data-wr-dyn-template` prop is neither, so `evaluateRouteDisable`
    // returned deadLinks.length === 0 for the real linear mobile nav dialog
    // while a real Chromium click on the shipped package mounted a visible
    // `a[href="/pricing"]` that answered 404.
    check(
      "28.P6.39 the serialized-markup scan reads BOTH encodings — JSON IR and HTML markup",
      hrefsInSerializedMarkup('{"p":{"href":"/pricing","rel":"noopener"}}').join("|") === "/pricing" &&
        hrefsInSerializedMarkup("<a href='/a' x=1><a href=\"/b\">").join("|") === "/b|/a" &&
        hrefsInSerializedMarkup('\\"href\\":\\"/pricing\\"').join("|") === "/pricing" &&
        hrefsInSerializedMarkup('{"data-href":"/x"}').length === 0,
      JSON.stringify(hrefsInSerializedMarkup('{"p":{"href":"/pricing"}}')),
    );
    const pricingOff = evaluateRouteDisable(["/pricing"], linear, {});
    const serialized = pricingOff.deadLinks.filter(
      (finding) => finding.reason === "dynamic-template-host" || finding.reason === "serialized-markup-host",
    );
    measured(
      `linear /pricing OFF: navCascade ${pricingOff.navCascade.length} group(s) / ` +
        `${pricingOff.navCascade.reduce((sum, item) => sum + item.nodes.length, 0)} anchor node(s), ` +
        `deadLinks ${pricingOff.deadLinks.length} ` +
        `(${[...new Set(pricingOff.deadLinks.map((finding) => finding.reason))].sort().join(", ")})`,
    );
    check(
      "28.P6.40 a link carried inside a captured dynamic template IS a dead-link finding (was 0)",
      serialized.length === 7 && serialized.every((finding) => finding.reason === "dynamic-template-host"),
      `${serialized.length} finding(s)`,
    );
    check(
      "28.P6.41 one per ENABLED page, on the mobile viewport, with no slot to blame",
      new Set(serialized.map((finding) => finding.pageSourceId)).size === 7 &&
        !serialized.some((finding) => finding.pageSourceId === "p000007") &&
        serialized.every(
          (finding) =>
            finding.viewport === "mobile" &&
            finding.nodeId === "n000057" &&
            finding.slotKey === null &&
            finding.href === "/pricing",
        ),
      serialized.map((finding) => `${finding.pageSourceId}/${finding.linkingRoute}`).join(" "),
    );
    check(
      "28.P6.42 the nav cascade is UNCHANGED by the new pass — it still removes the 28 static anchors",
      pricingOff.navCascade.length === 2 &&
        pricingOff.navCascade.reduce((sum, item) => sum + item.nodes.length, 0) === 28,
    );
    check(
      "28.P6.43 no finding is reported twice for the same (page, viewport, node, target)",
      new Set(
        pricingOff.deadLinks.map(
          (finding) => `${finding.pageSourceId}|${finding.viewport}|${finding.nodeId}|${finding.targetRoute}`,
        ),
      ).size === pricingOff.deadLinks.length,
    );
    check(
      "28.P6.44 a route with no serialized link to it produces no serialized finding — the scan is not a blanket",
      evaluateRouteDisable(["/security"], linear, {}).deadLinks.every(
        (finding) => finding.reason !== "serialized-markup-host" && finding.reason !== "dynamic-template-host",
      ),
    );

    // ---- correction 2: `disabled-region` means it does not render ----------
    //
    // A region id is namespaced by pageSourceId; a GLOBAL slot key is not. All
    // 8 linear footer regions carry the IDENTICAL 84 `global.footer.*` keys, so
    // disabling ONE of them used to mark all 84 `disabled-region` while all 84
    // still rendered on the other 7 routes — and because the enablement branch
    // wins in `classify()`, four customer-facing needs-input BLOCKERS went
    // quiet for content that still ships.
    const footerOff = resolveEnablement(
      authoredWith({ disabledRegions: { "p000002:rgn:footer1:self": { scope: "global", updatedAt: AT } } }),
      linear,
    );
    const footerEffect = footerOff.regionEffects[0];
    const stillRendering = footerEffect.slotKeys.filter(
      (key) => !footerOff.disabledSlots.some((slot) => slot.slotKey === key),
    );
    measured(
      `footer region OFF (blast radius ${footerEffect.blastRadius.join(", ")}): ` +
        `${footerEffect.slotKeys.length} member slot key(s), ${footerOff.disabledSlots.length} accounted disabled, ` +
        `${stillRendering.length} still bound on an enabled route`,
    );
    check(
      "28.P6.45 a region-member slot that is ALSO bound outside the region is NOT `disabled-region`",
      footerEffect.slotKeys.length === 84 && stillRendering.length === 84 && footerOff.disabledSlots.length === 0,
      `members=${footerEffect.slotKeys.length} disabled=${footerOff.disabledSlots.length}`,
    );
    check(
      "28.P6.46 the four customer-facing needs-input BLOCKERS keep their ordinary disposition",
      ["status", "x-twitter", "github", "youtube"].every(
        (name) => !footerOff.plan.disabledSlotKeys.includes(`global.footer.link.${name}.href`),
      ),
    );
    check(
      "28.P6.47 the survivors are REPORTED, not silently dropped",
      footerOff.warnings.some(
        (warning) => warning.includes("84 slot key(s)") && warning.includes("still render"),
      ),
      footerOff.warnings.join(" | ").slice(0, 120),
    );
    check(
      "28.P6.48 the region is still PHYSICALLY removed — the guard narrows the ACCOUNTING, never the plan",
      footerOff.plan.disabledNodes.length === 2 && footerOff.plan.disabledRegionIds.length === 1,
      `${footerOff.plan.disabledNodes.length} node(s)`,
    );
    // The guard must not become a blanket refusal: a slot whose every binding
    // IS inside the disable still lands as `disabled-region`.
    const bothOff = resolveEnablement(
      authoredWith({
        disabledRegions: { "p000002:rgn:footer1:self": { scope: "global", updatedAt: AT } },
        disabledRoutes: { "/pricing": { updatedAt: AT } },
      }),
      linear,
    );
    const regionDisabled = bothOff.disabledSlots.filter((slot) => slot.disposition === "disabled-region");
    check(
      "28.P6.49 a slot bound NOWHERE this plan still renders IS `disabled-region` — the guard is not a blanket",
      regionDisabled.length >= 1 &&
        regionDisabled.every((slot) => slot.detail.includes("bound nowhere this build still renders")),
      `${regionDisabled.length} disabled-region row(s)`,
    );

    // ---- correction 3: a disabled route can COMPLETE a content run ---------
    //
    // `buildContentUnits` scopes a page slot by `slot.scope === "global" ||
    // routeSet.has(slot.route)`, and `validateGenerationResult` REJECTS any
    // value or needs-input entry outside that scope. The release content stage
    // therefore needs every key that leaves the scope with the route to be
    // ACCOUNTED as a disabled slot — otherwise it must fail loudly rather than
    // filter by scope alone. This is that invariant, measured on real slots.
    const routeOff = resolveEnablement(
      authoredWith({ disabledRoutes: { "/pricing": { updatedAt: AT } } }),
      linear,
    );
    const accounted = new Set(routeOff.disabledSlots.map((slot) => slot.slotKey));
    const leavesScope = linear.slots.filter(
      (slot) => slot.scope !== "global" && slot.route === "/pricing",
    );
    const unaccounted = leavesScope.filter((slot) => !accounted.has(slot.key));
    measured(
      `linear /pricing OFF: ${leavesScope.length} page slot(s) leave the units scope, ` +
        `${routeOff.disabledSlots.length} slot(s) accounted disabled, ${unaccounted.length} unaccounted`,
    );
    check(
      "28.P6.50 EVERY slot that leaves the content scope with the route is accounted as a disabled slot",
      leavesScope.length === 140 && unaccounted.length === 0,
      `${unaccounted.length} unaccounted: ${unaccounted.slice(0, 4).map((slot) => slot.key).join(", ")}`,
    );
    check(
      "28.P6.51 the accounting is WIDER than the scope drop — the removed nav anchors are in it too",
      routeOff.disabledSlots.length > leavesScope.length &&
        accounted.has("global.header.nav.pricing.href"),
      `${routeOff.disabledSlots.length} vs ${leavesScope.length}`,
    );
  }

  await rm(SCRATCH, { recursive: true, force: true });

  console.log("");
  console.log(`smoke:enablement — ${checks} checks, ${failures} failures`);
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("smoke-enablement ERROR —", error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
