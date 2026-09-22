import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  AuthoredResultGenerator,
  BriefContentGenerator,
  AuthoringDeltaSchema,
  AuthoringPlanFileSchema,
  ConsistencyReportSchema,
  ContentGenerationResultSchema,
  ContentInputError,
  ContentValidationError,
  SLOT_DISPOSITIONS,
  SLOT_ORIGINS,
  SlotAccountingFileSchema,
  assertNoBatchConflicts,
  composeAuthoredResult,
  executeGenerationBatches,
  ingestGenerationResult,
  loadAuthoringDelta,
  loadContentRun,
  loadManualGenerationResult,
  prepareContentRun,
  factClaimIn,
  reviewCrossPageConsistency,
  sha256OfFile,
  valueShapeIsFactBearing,
  valueShapeOf,
  type ContentBrief,
  type ContentGenerationResult,
  type ValueShape,
} from "../src/content-injection/index.js";

/**
 * Task 28 Phase 9 smoke — FULL-SITE CONTENT GENERATION.
 *
 * The proof this suite exists for is a single sentence: ONE BRIEF PRODUCES A
 * COMPLETE SELECTED CORE SITE, not a homepage with seven untouched pages.
 *
 * It runs the REAL 8-route linear.app recon template through the REAL packet →
 * plan → batched generation → ingest → accounting → review chain, offline, with
 * a hand-authored generation result served through the ordinary
 * `ContentGenerator` seam (there is no LLM API key in this repository; the
 * authoring delta beside this suite records exactly who wrote which value and
 * why, and asserts `liveModelCall: false` in its own schema).
 *
 * SECTIONS
 *   A  the hierarchy is REAL: brief → site → page → region → unit → slot, each
 *      level derived from the one above, closure naming every orphan
 *   B  the provider seam: an authored result is a PROVIDER, batched like any
 *      other, losing no key
 *   C  multi-route coverage: every one of the 8 routes receives written values
 *   D  total slot accounting closes and UNRESOLVED = 0
 *   E  a disabled route and a disabled region are EXPLICITLY dispositioned,
 *      never absent, and never needs-input
 *   F  the ingest path REJECTS malformed input instead of accepting it
 *
 * BOUNDED COVERAGE, stated: this suite is OFFLINE. It does not start a browser
 * and does not run `runContentLayoutQa` over the 8-route canary — the browser
 * layout-review pass is exercised on the synthetic fixture in
 * scripts/smoke-content-injection.ts. Authored values were written to the
 * character lengths of the strings they replace (recorded per value in the
 * decisions file) precisely because this suite cannot measure their boxes.
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

const TEMPLATE_MANIFEST = "data/linear.app/recon-templates/2026-08-25T21-53-26-980Z/manifest.json";
const PAGE_REGIONS = "data/linear.app/page-regions/2026-08-26T16-14-07-901Z/page-regions.json";
const BASE_RESULT = "data/linear.app/content-runs/2026-08-25T21-54-40-120Z/generation-result.json";
const DELTA = "docs/result/handoffs/28-intel/phase9/authoring-delta.json";
const FULLSITE_RUN = "data/linear.app/content-runs/wr28-phase9-fullsite";
const VALUE_SHAPE_RUN = "data/linear.app/content-runs/wr28-phase9-valueshape";
const DISABLED_RUN = "data/linear.app/content-runs/wr28-phase9-disabled";

const CORE_ROUTES = [
  "/",
  "/changelog",
  "/customers",
  "/customers/automattic",
  "/integrations",
  "/plan",
  "/pricing",
  "/security",
];

/** Serve an authored result through the packet's own batches. */
async function generateThroughSeam(
  runRef: string,
  authored: ContentGenerationResult,
): Promise<{ merged: ContentGenerationResult; calls: number; unserved: string[] }> {
  const run = await loadContentRun(runRef);
  const generator = new AuthoredResultGenerator(authored);
  const execution = await executeGenerationBatches({
    runId: run.manifest.runId,
    intent: run.intent,
    policy: run.policy,
    unitsFile: run.unitsFile,
    request: run.request,
    generator,
  });
  assertNoBatchConflicts(execution.report);
  return {
    merged: execution.result,
    calls: execution.report.calls.length,
    unserved: generator.unservedKeys(),
  };
}

async function main(): Promise<void> {
  section("Phase 9 canary inputs (real linear.app 8-route template, offline)");
  const delta = await loadAuthoringDelta(DELTA);
  const baseRaw = await readFile(BASE_RESULT, "utf8");
  const base = ContentGenerationResultSchema.parse(JSON.parse(baseRaw));
  check(
    "P9.0 the authoring delta pins its base result by sha256 and declares no live model call",
    delta.base.sha256 === sha256OfFile(baseRaw) && delta.authoredBy.liveModelCall === false,
    `${delta.base.sha256.slice(0, 12)} vs ${sha256OfFile(baseRaw).slice(0, 12)}`,
  );
  const composed = composeAuthoredResult(base, delta, baseRaw);
  check(
    "P9.0b composition clears every needs-input entry the base carried",
    composed.applied.baseUnresolved === 117 &&
      composed.applied.composedUnresolved === 0 &&
      composed.applied.resolutions === 117,
    JSON.stringify(composed.applied),
  );
  const brief = delta.brief as ContentBrief;

  // -------------------------------------------------------------------------
  section("A — ONE BRIEF → the derivation chain, level by level");
  // -------------------------------------------------------------------------
  await rm(FULLSITE_RUN, { recursive: true, force: true });
  const prepared = await prepareContentRun({
    templateManifestFile: TEMPLATE_MANIFEST,
    rawIntent: brief.goal!,
    routes: CORE_ROUTES,
    brief,
    truthMode: "synthetic-allowed",
    pageRegionsFile: PAGE_REGIONS,
    outputDir: FULLSITE_RUN,
    runId: "wr28-phase9-fullsite",
  });
  const planOnDisk = AuthoringPlanFileSchema.parse(
    JSON.parse(await readFile(path.join(FULLSITE_RUN, "authoring-plan.json"), "utf8")),
  );
  check(
    "P9.A1 the packet emits an authoring plan carrying all six levels of the hierarchy",
    planOnDisk.levels.join(">") === "brief>site>page>region>unit>slot",
    planOnDisk.levels.join(">"),
  );
  check(
    "P9.A2 the SITE level is derived from the BRIEF, field by field, with provenance",
    planOnDisk.site.derivedFrom === "brief" &&
      planOnDisk.site.siteIdentity.workingName === brief.workingName &&
      planOnDisk.site.identityProvenance["workingName"] === "brief" &&
      planOnDisk.site.identityProvenance["audience"] === "brief" &&
      planOnDisk.brief.goal === brief.goal,
    JSON.stringify(planOnDisk.site.identityProvenance),
  );
  check(
    "P9.A3 one PAGE level per scoped route, each derived from the site",
    planOnDisk.pages.length === CORE_ROUTES.length &&
      planOnDisk.pages.every((page) => page.derivedFrom === "site") &&
      CORE_ROUTES.every((route) => planOnDisk.pages.some((page) => page.route === route)),
    `${planOnDisk.pages.length} page level(s)`,
  );
  check(
    "P9.A4 the REGION level is populated from the PageRegion contract and every region has a parent",
    planOnDisk.regionLayer.kind === "page-regions-artifact" &&
      planOnDisk.regions.length > 0 &&
      planOnDisk.regions.every(
        (region) =>
          region.derivedFrom === "site" || planOnDisk.pages.some((page) => page.planId === region.derivedFrom),
      ) &&
      planOnDisk.closure.orphanRegionIds.length === 0,
    `${planOnDisk.regions.length} region(s), ${planOnDisk.regionLayer.regionsRead} read`,
  );
  const regionParented = planOnDisk.units.filter((unit) => unit.parentLevel === "region").length;
  check(
    "P9.A5 every UNIT hangs from exactly one parent, and a region claims most of them",
    planOnDisk.closure.everyUnitHasExactlyOneParent &&
      planOnDisk.closure.orphanUnitIds.length === 0 &&
      planOnDisk.closure.duplicateParentUnitIds.length === 0 &&
      regionParented > 0 &&
      planOnDisk.units.length === prepared.units.units.length,
    `${regionParented}/${planOnDisk.units.length} unit(s) claimed by a region`,
  );
  check(
    "P9.A6 every SLOT key in the packet belongs to a unit, and the chain CLOSES",
    planOnDisk.closure.everySlotKeyBelongsToAUnit && planOnDisk.closure.complete,
    JSON.stringify(planOnDisk.closure),
  );

  // -------------------------------------------------------------------------
  section("B — the provider seam: an authored result is a PROVIDER, not a bypass");
  // -------------------------------------------------------------------------
  const seam = await generateThroughSeam(FULLSITE_RUN, composed.result);
  check(
    "P9.B1 the authored result is served through the packet's batches, one call per batch",
    seam.calls === prepared.request.batches.length && seam.calls > 1,
    `${seam.calls} call(s) for ${prepared.request.batches.length} batch(es)`,
  );
  check(
    "P9.B2 the batched seam loses NO authored value — every key some batch asked for",
    seam.unserved.length === 0,
    `${seam.unserved.length} unserved: ${seam.unserved.slice(0, 5).join(", ")}`,
  );
  check(
    "P9.B3 batching preserves the authored value set exactly",
    Object.keys(seam.merged.slotValues).length === Object.keys(composed.result.slotValues).length,
    `${Object.keys(seam.merged.slotValues).length} vs ${Object.keys(composed.result.slotValues).length}`,
  );
  const vendorHits = await (async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    try {
      const { stdout } = await promisify(execFile)("grep", [
        "-rIlE",
        "@anthropic-ai|openai|@google/gener|mistralai|cohere-ai",
        "src/content-injection",
      ]);
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  })();
  check(
    "P9.B4 no vendor SDK is imported anywhere in the content engine",
    vendorHits.length === 0,
    vendorHits.join(", "),
  );

  // -------------------------------------------------------------------------
  section("C/D — ingest: multi-route coverage, accounting closure, UNRESOLVED = 0");
  // -------------------------------------------------------------------------
  const run = await loadContentRun(FULLSITE_RUN);
  const outcome = await ingestGenerationResult(run, seam.merged);
  const accounting = SlotAccountingFileSchema.parse(
    JSON.parse(await readFile(path.join(FULLSITE_RUN, "slot-accounting.json"), "utf8")),
  );
  const consistency = ConsistencyReportSchema.parse(
    JSON.parse(await readFile(path.join(FULLSITE_RUN, "report", "consistency.json"), "utf8")),
  );
  const coveredRoutes = consistency.routeCoverage.filter((entry) => entry.writtenSlots > 0);
  check(
    "P9.C1 ONE BRIEF → EVERY CORE ROUTE: all 8 scoped routes carry written values",
    coveredRoutes.length === CORE_ROUTES.length &&
      consistency.routeCoverage.every((entry) => entry.changedSlots > 0),
    consistency.routeCoverage.map((entry) => `${entry.route}=${entry.writtenSlots}/${entry.inScopeSlots}`).join(" "),
  );
  check(
    "P9.C2 the cross-page consistency review runs and reports no `route-uncovered` finding",
    consistency.checks.some((entry) => entry.id === "route-uncovered") &&
      !consistency.findings.some((finding) => finding.code === "route-uncovered"),
    JSON.stringify(consistency.counts),
  );
  check(
    "P9.C3 the review names one site: no working-name spelling variant across any page",
    !consistency.findings.some((finding) => finding.code === "site-name-variant") &&
      !consistency.findings.some((finding) => finding.code === "site-name-absent"),
    consistency.findings
      .filter((finding) => finding.code.startsWith("site-name"))
      .map((finding) => finding.slotKey ?? "")
      .join(", "),
  );
  check(
    "P9.C4 every enabled scoped route has a PageContentPlan of its own",
    !consistency.findings.some((finding) => finding.code === "page-plan-missing"),
    consistency.findings.filter((f) => f.code === "page-plan-missing").map((f) => f.route).join(", "),
  );
  check(
    "P9.D1 the account reconciles: Σorigin == Σdisposition == in-scope slots, nothing missing",
    accounting.reconciliation.reconciled &&
      accounting.reconciliation.missing.length === 0 &&
      accounting.reconciliation.doubleCounted.length === 0 &&
      Object.values(accounting.totals.byOrigin).reduce((a, b) => a + b, 0) === accounting.totals.inScopeSlots &&
      Object.values(accounting.totals.byDisposition).reduce((a, b) => a + b, 0) === accounting.totals.inScopeSlots,
    JSON.stringify(accounting.reconciliation),
  );
  check(
    "P9.D2 every in-scope slot carries exactly one origin and exactly one disposition",
    accounting.entries.every(
      (entry) =>
        (SLOT_ORIGINS as readonly string[]).includes(entry.origin) &&
        (SLOT_DISPOSITIONS as readonly string[]).includes(entry.disposition),
    ) && new Set(accounting.entries.map((entry) => entry.slotKey)).size === accounting.entries.length,
  );
  const unresolvedEntries = accounting.entries.filter((entry) => entry.disposition === "unresolved");
  check(
    "P9.D3 UNRESOLVED = 0 — re-derived from the artifact's own rows, not a summary line",
    unresolvedEntries.length === 0 &&
      (accounting.totals.byDisposition["unresolved"] ?? 0) === 0 &&
      seam.merged.unresolved.length === 0 &&
      outcome.validation.stats.unresolvedSlots === 0,
    `${unresolvedEntries.length} row(s): ${unresolvedEntries.slice(0, 5).map((e) => e.slotKey).join(", ")}`,
  );
  check(
    "P9.D4 the truth mode is synthetic-allowed and every invention is RECORDED, not silent",
    accounting.truthMode === "synthetic-allowed" &&
      (accounting.totals.byOrigin["synthetic-fact"] ?? 0) > 0 &&
      accounting.truthDecisions.every((decision) => decision.decision !== "refused-unresolved"),
    `${accounting.totals.byOrigin["synthetic-fact"] ?? 0} synthetic-fact origin(s), ${accounting.truthDecisions.length} decision(s)`,
  );
  check(
    "P9.D5 the run manifest surfaces the review's headline numbers",
    run.manifest.consistency?.routesInScope === CORE_ROUTES.length &&
      run.manifest.consistency?.routesCovered === CORE_ROUTES.length &&
      run.manifest.slotAccounting?.reconciled === true,
    JSON.stringify(run.manifest.consistency),
  );
  check(
    "P9.C7 the review REPORTS the canary's one real gap rather than hiding it: /integrations is source-dominant",
    consistency.findings
      .filter((finding) => finding.code === "route-source-dominant")
      .map((finding) => finding.route)
      .join(",") === "/integrations",
    JSON.stringify(consistency.findings.map((finding) => `${finding.code}@${finding.route ?? "-"}`)),
  );
  const rebuiltPlan = AuthoringPlanFileSchema.parse(
    JSON.parse(await readFile(path.join(FULLSITE_RUN, "authoring-plan.json"), "utf8")),
  );
  check(
    "P9.C5 after ingest the PAGE level carries the real PageContentPlan for every route",
    rebuiltPlan.pages.length === CORE_ROUTES.length &&
      rebuiltPlan.pages.every((page) => page.supplied && page.plan !== undefined) &&
      rebuiltPlan.closure.everyRouteHasAPagePlan &&
      rebuiltPlan.closure.routesWithoutPagePlan.length === 0 &&
      rebuiltPlan.pages.every((page) => page.plan!.route === page.route),
    JSON.stringify(rebuiltPlan.closure.routesWithoutPagePlan),
  );
  check(
    "P9.C6 each page plan's REGION set is non-empty and every region it names is in the region level",
    rebuiltPlan.pages.every((page) => page.regionIds.length > 0) &&
      rebuiltPlan.pages.every((page) =>
        page.regionIds.every((id) => rebuiltPlan.regions.some((region) => region.regionId === id)),
      ),
    rebuiltPlan.pages.map((page) => `${page.route}=${page.regionIds.length}`).join(" "),
  );
  // -------------------------------------------------------------------------
  // D6 — THE DENOMINATOR IS TIED TO THE TEMPLATE, NOT TO ITSELF.
  // The verifier deleted the review-slot half of `inScopeSlotKeys()`, watched
  // the canary close at 1,586 instead of 3,079 with `human-required` at 0, and
  // this suite still reported 40/40: every check above compares the artifact
  // with the artifact's own `inScopeSlots`. These checks re-derive the expected
  // population from the TEMPLATE's own slots.json and compare SETS, so an
  // in-scope predicate that narrows anywhere fails here by name.
  // -------------------------------------------------------------------------
  const templateSlotKeys = run.template.slotsFile.slots.map((slot) => slot.key);
  const accountedKeys = new Set(accounting.entries.map((entry) => entry.slotKey));
  const missingFromAccounting = templateSlotKeys.filter((key) => !accountedKeys.has(key));
  const notInTemplate = [...accountedKeys].filter((key) => !run.template.slotByKey.has(key));
  check(
    "P9.D6 the in-scope DENOMINATOR is the template's own slot population — re-derived from slots.json, both directions",
    accounting.totals.inScopeSlots === run.template.manifest.counts.slots &&
      accounting.totals.inScopeSlots === templateSlotKeys.length &&
      missingFromAccounting.length === 0 &&
      notInTemplate.length === 0 &&
      accountedKeys.size === templateSlotKeys.length,
    `inScope=${accounting.totals.inScopeSlots} templateSlots=${run.template.manifest.counts.slots} ` +
      `missing=${missingFromAccounting.length} extra=${notInTemplate.length}`,
  );
  check(
    "P9.D6b the ENGINE proves it in the artifact: templateCoverage names any scoped template slot with no row, and a shrunken denominator cannot report itself reconciled",
    accounting.reconciliation.templateCoverage.complete &&
      accounting.reconciliation.templateCoverage.templateSlots === run.template.manifest.counts.slots &&
      accounting.reconciliation.templateCoverage.scopedTemplateSlots === templateSlotKeys.length &&
      accounting.reconciliation.templateCoverage.unaccountedSlotKeys.length === 0 &&
      accounting.reconciliation.templateCoverage.accountedOutsideScope === 0,
    JSON.stringify(accounting.reconciliation.templateCoverage),
  );
  check(
    "P9.D7 the ambiguity bucket is the template's OWN review population — it cannot be dropped out of the denominator",
    (accounting.totals.byDisposition["human-required"] ?? 0) === run.template.manifest.counts.reviewSlots &&
      accounting.scopeHonesty.reviewSlots === run.template.manifest.counts.reviewSlots,
    `human-required=${accounting.totals.byDisposition["human-required"] ?? 0} vs template reviewSlots=${run.template.manifest.counts.reviewSlots}`,
  );
  // D8 — a SOURCE fact that survives unchanged is RECORDED, never silent
  // (Phase 9 finding F3, which shipped uncorrected and was caught in the draft
  // of Phase 10 as a live "50%" on an editable customer-facing slot).
  const decidedKeys = new Set(accounting.truthDecisions.map((decision) => decision.slotKey));
  const survivingSourceFacts = accounting.entries.filter((entry) => {
    if (entry.type !== "text") return false;
    const written = outcome.overlay?.[entry.slotKey];
    const original = run.template.defaultContent.values[entry.slotKey];
    if (typeof written !== "string" || typeof original !== "string" || written !== original) return false;
    return factClaimIn(written) !== undefined;
  });
  check(
    "P9.D8 every SOURCE fact that survives unchanged on a written slot carries a recorded truth decision — the F3 silence is closed",
    survivingSourceFacts.length > 0 && survivingSourceFacts.every((entry) => decidedKeys.has(entry.slotKey)),
    `${survivingSourceFacts.length} surviving source fact(s), ` +
      `${survivingSourceFacts.filter((entry) => !decidedKeys.has(entry.slotKey)).length} undecided: ` +
      survivingSourceFacts.map((entry) => entry.slotKey).join(", "),
  );
  check(
    "P9.D8b under synthetic-allowed they are KEPT and labelled `source-fact-carried-over` — not silently, and not mislabelled as an invention",
    accounting.truthDecisions.filter((decision) => decision.decision === "source-fact-carried-over").length ===
      survivingSourceFacts.filter((entry) => !(composed.result.synthetic ?? []).includes(entry.slotKey)).length &&
      accounting.truthDecisions
        .filter((decision) => decision.decision === "source-fact-carried-over")
        .every((decision) => decision.detail.includes("identical to the source default")),
    JSON.stringify(
      accounting.truthDecisions
        .filter((decision) => decision.decision === "source-fact-carried-over")
        .map((decision) => `${decision.slotKey}:${decision.claim}`),
    ),
  );
  console.log(
    `  [measured] inScopeSlots=${accounting.totals.inScopeSlots} byDisposition=${JSON.stringify(accounting.totals.byDisposition)}`,
  );
  console.log(
    `  [measured] templateCoverage=${JSON.stringify(accounting.reconciliation.templateCoverage)} ` +
      `truthDecisions=${JSON.stringify(
        accounting.truthDecisions.reduce<Record<string, number>>((acc2, d) => {
          acc2[d.decision] = (acc2[d.decision] ?? 0) + 1;
          return acc2;
        }, {}),
      )}`,
  );
  console.log(`  [measured] byOrigin=${JSON.stringify(accounting.totals.byOrigin)}`);
  console.log(
    `  [measured] consistency errors=${consistency.counts.errors} warnings=${consistency.counts.warnings} ` +
      `codes=${JSON.stringify([...new Set(consistency.findings.map((f) => f.code))])}`,
  );

  // -------------------------------------------------------------------------
  section("E — a DISABLED route and a DISABLED region are dispositioned, never absent");
  // -------------------------------------------------------------------------
  const regions = JSON.parse(await readFile(PAGE_REGIONS, "utf8")) as {
    regions: { regionId: string; scope: string; slotKeys: string[]; pages: { routes: string[] }[] }[];
  };
  const disabledRoute = "/plan";
  const enabledRoutes = CORE_ROUTES.filter((route) => route !== disabledRoute);
  const template = run.template;
  const routeDisabledKeys = template.slotsFile.slots
    .filter((slot) => slot.scope === "page" && slot.route === disabledRoute)
    .map((slot) => slot.key);
  const regionCandidate = regions.regions.find(
    (region) =>
      region.scope === "page" &&
      region.slotKeys.length >= 3 &&
      region.slotKeys.length <= 40 &&
      region.pages.every((page) => page.routes.every((route) => enabledRoutes.includes(route))) &&
      region.slotKeys.every((key) => !routeDisabledKeys.includes(key)) &&
      region.slotKeys.every((key) => template.slotByKey.has(key)),
  );
  if (regionCandidate === undefined) throw new Error("no page region on an enabled route was available to disable");
  const regionDisabledKeys = regionCandidate.slotKeys.filter((key) => template.slotByKey.has(key));
  const disabledSlots = [
    ...routeDisabledKeys.map((slotKey) => ({
      slotKey,
      disposition: "disabled-route" as const,
      detail: `every route rendering this slot is disabled (${disabledRoute})`,
    })),
    ...regionDisabledKeys.map((slotKey) => ({
      slotKey,
      disposition: "disabled-region" as const,
      detail: `slot lives in disabled region ${regionCandidate.regionId}`,
    })),
  ];
  await rm(DISABLED_RUN, { recursive: true, force: true });
  await prepareContentRun({
    templateManifestFile: TEMPLATE_MANIFEST,
    rawIntent: brief.goal!,
    routes: enabledRoutes,
    brief,
    truthMode: "synthetic-allowed",
    pageRegionsFile: PAGE_REGIONS,
    outputDir: DISABLED_RUN,
    runId: "wr28-phase9-disabled",
    enablement: {
      disabledRoutes: [disabledRoute],
      disabledSlots,
      disabledRegionIds: [regionCandidate.regionId],
    },
  });
  const dropped = new Set([...routeDisabledKeys, ...regionDisabledKeys]);
  const filtered: ContentGenerationResult = {
    ...composed.result,
    sitePlan: {
      ...composed.result.sitePlan,
      pagePlans: composed.result.sitePlan.pagePlans.filter((plan) => plan.route !== disabledRoute),
    },
    slotValues: Object.fromEntries(
      Object.entries(composed.result.slotValues).filter(([key]) => !dropped.has(key)),
    ) as ContentGenerationResult["slotValues"],
    sources: Object.fromEntries(
      Object.entries(composed.result.sources).filter(([key]) => !dropped.has(key)),
    ) as ContentGenerationResult["sources"],
    unresolved: composed.result.unresolved.filter((entry) => !dropped.has(entry.slotKey)),
    imageBriefs: composed.result.imageBriefs.filter((brief2) => !dropped.has(brief2.slotKey)),
    ...(composed.result.synthetic !== undefined
      ? { synthetic: composed.result.synthetic.filter((key) => !dropped.has(key)) }
      : {}),
  };
  const disabledSeam = await generateThroughSeam(DISABLED_RUN, filtered);
  const disabledRun = await loadContentRun(DISABLED_RUN);
  const disabledOutcome = await ingestGenerationResult(disabledRun, disabledSeam.merged);
  const disabledAccounting = disabledOutcome.accounting;
  const rowFor = (key: string) => disabledAccounting.entries.find((entry) => entry.slotKey === key);
  check(
    "P9.E1 EVERY slot of the disabled route is present with the `disabled-route` disposition",
    routeDisabledKeys.every((key) => rowFor(key)?.disposition === "disabled-route") &&
      (disabledAccounting.totals.byDisposition["disabled-route"] ?? 0) === routeDisabledKeys.length,
    `${routeDisabledKeys.length} route slot(s), counted ${disabledAccounting.totals.byDisposition["disabled-route"] ?? 0}`,
  );
  check(
    "P9.E2 EVERY slot of the disabled region is present with the `disabled-region` disposition",
    regionDisabledKeys.every((key) => rowFor(key)?.disposition === "disabled-region") &&
      (disabledAccounting.totals.byDisposition["disabled-region"] ?? 0) === regionDisabledKeys.length,
    `${regionDisabledKeys.length} region slot(s) of ${regionCandidate.regionId}`,
  );
  check(
    "P9.E3 not one disabled slot is `unresolved`, `removed` or missing from the denominator",
    [...dropped].every((key) => {
      const row = rowFor(key);
      return row !== undefined && row.disposition !== "unresolved" && row.disposition !== "removed";
    }) && disabledAccounting.reconciliation.missing.length === 0,
  );
  check(
    "P9.E4 the disabled run still reconciles AND still holds UNRESOLVED = 0",
    disabledAccounting.reconciliation.reconciled &&
      (disabledAccounting.totals.byDisposition["unresolved"] ?? 0) === 0 &&
      disabledAccounting.entries.filter((entry) => entry.disposition === "unresolved").length === 0,
    JSON.stringify(disabledAccounting.totals.byDisposition),
  );
  check(
    "P9.E5 the review does NOT demand coverage or a page plan from the disabled route",
    !disabledOutcome.consistency.findings.some((finding) => finding.route === disabledRoute) &&
      disabledOutcome.consistency.routeCoverage.every((entry) => entry.route !== disabledRoute),
    disabledOutcome.consistency.findings.filter((f) => f.route === disabledRoute).map((f) => f.code).join(", "),
  );
  const disabledExpected = disabledRun.template.slotsFile.slots.filter(
    (slot) => slot.scope === "global" || (slot.route !== undefined && slot.route !== disabledRoute),
  );
  const disabledAccountedKeys = new Set(disabledAccounting.entries.map((entry) => entry.slotKey));
  check(
    "P9.E6 disabling a route SHRINKS NOTHING: the denominator is still the whole template, and templateCoverage names the 227 slots that left the scoped set as accounted-outside-scope",
    disabledAccounting.totals.inScopeSlots === disabledRun.template.manifest.counts.slots &&
      disabledAccounting.reconciliation.templateCoverage.complete &&
      disabledAccounting.reconciliation.templateCoverage.scopedTemplateSlots === disabledExpected.length &&
      disabledAccounting.reconciliation.templateCoverage.accountedOutsideScope === routeDisabledKeys.length &&
      disabledRun.template.slotsFile.slots.every((slot) => disabledAccountedKeys.has(slot.key)),
    JSON.stringify(disabledAccounting.reconciliation.templateCoverage),
  );
  console.log(
    `  [measured] disabled run inScopeSlots=${disabledAccounting.totals.inScopeSlots} ` +
      `byDisposition=${JSON.stringify(disabledAccounting.totals.byDisposition)}`,
  );

  // -------------------------------------------------------------------------
  section("F — the ingest path REJECTS malformed input instead of accepting it");
  // -------------------------------------------------------------------------
  const scratch = path.join(FULLSITE_RUN, ".reject");
  await mkdir(scratch, { recursive: true });
  const rejects: { name: string; file: string; body: string; expect: "input" }[] = [
    { name: "not JSON at all", file: "a.json", body: "{not json", expect: "input" },
    {
      name: "an unknown top-level key (schema is strict)",
      file: "b.json",
      body: JSON.stringify({ ...composed.result, surpriseField: 1 }),
      expect: "input",
    },
    {
      name: "an invalid provenance value",
      file: "d.json",
      body: JSON.stringify({
        ...composed.result,
        sources: { ...composed.result.sources, "global.header.nav.product": "made-up-source" },
      }),
      expect: "input",
    },
    {
      name: "a missing sitePlan",
      file: "e.json",
      body: JSON.stringify({ ...composed.result, sitePlan: undefined }),
      expect: "input",
    },
  ];
  for (const reject of rejects) {
    const file = path.join(scratch, reject.file);
    await writeFile(file, reject.body, "utf8");
    let rejected = false;
    let message = "";
    try {
      await loadManualGenerationResult(file);
    } catch (error) {
      rejected = error instanceof ContentInputError;
      message = error instanceof Error ? error.message : String(error);
    }
    check(`P9.F1 ingest rejects: ${reject.name}`, rejected, message.slice(0, 140));
  }
  // The schema is not the only gate: a structurally valid result naming a slot
  // key the template does not have must fail the DETERMINISTIC VALIDATOR too.
  let validatorRejected = false;
  try {
    await ingestGenerationResult(await loadContentRun(FULLSITE_RUN), {
      ...composed.result,
      slotValues: { ...composed.result.slotValues, "not.a.real.slot": "x" },
      sources: { ...composed.result.sources, "not.a.real.slot": "generated-marketing" },
    });
  } catch (error) {
    validatorRejected = error instanceof ContentValidationError;
  }
  check("P9.F2 the validator rejects a value for a slot key the template does not have", validatorRejected);
  // The SCHEMA is not the whole gate and this case proves it: a result with no
  // provenance map parses fine and is stopped one layer down, by the validator.
  let provenanceRejected = false;
  try {
    await ingestGenerationResult(await loadContentRun(FULLSITE_RUN), {
      ...composed.result,
      sources: {} as ContentGenerationResult["sources"],
    });
  } catch (error) {
    provenanceRejected = error instanceof ContentValidationError;
  }
  check("P9.F2b the validator rejects values that carry no provenance in `sources`", provenanceRejected);

  // The AUTHORING DELTA has gates of its own, and they are the ones that keep
  // "we cleared N blockers" honest.
  const deltaRejects: { name: string; mutate: (raw: Record<string, unknown>) => void }[] = [
    {
      name: "a base sha256 that does not match the base file",
      mutate: (raw) => {
        (raw["base"] as Record<string, unknown>)["sha256"] = "0".repeat(64);
      },
    },
    {
      name: "a RESOLUTION for a key the base never left unresolved",
      mutate: (raw) => {
        (raw["resolutions"] as unknown[]).push({
          slotKey: "global.header.nav.product",
          value: "Relabelled",
          source: "generated-marketing",
          rationale: "mislabelled: this key already had a value",
        });
        (raw["base"] as Record<string, unknown>)["unresolved"] = 117;
      },
    },
    {
      name: "a REWRITE for a key the base held no value for",
      mutate: (raw) => {
        (raw["rewrites"] as unknown[]).push({
          slotKey: "not.a.real.slot",
          value: "x",
          source: "generated-marketing",
          rationale: "mislabelled: no base value",
        });
      },
    },
  ];
  for (const deltaReject of deltaRejects) {
    const raw = JSON.parse(await readFile(DELTA, "utf8")) as Record<string, unknown>;
    deltaReject.mutate(raw);
    const parsed = AuthoringDeltaSchema.parse(raw);
    let rejected = false;
    let message = "";
    try {
      composeAuthoredResult(base, parsed, baseRaw);
    } catch (error) {
      rejected = error instanceof ContentInputError;
      message = error instanceof Error ? error.message : String(error);
    }
    check(`P9.F3 the authoring delta rejects: ${deltaReject.name}`, rejected, message.slice(0, 160));
  }
  await rm(scratch, { recursive: true, force: true });

  // The two rejection ingests above deliberately failed validation, which left
  // the canary run holding an empty overlay. Re-ingest the good result so the
  // artifact this suite PUBLISHES on disk is the one it measured.
  const restored = await ingestGenerationResult(await loadContentRun(FULLSITE_RUN), seam.merged);
  check(
    "P9.F5 the canary run on disk is restored to the measured result after the rejection tests",
    restored.validation.pass &&
      restored.accounting.totals.inScopeSlots === accounting.totals.inScopeSlots &&
      (restored.accounting.totals.byDisposition["unresolved"] ?? 0) === 0 &&
      Object.keys(restored.overlay).length === Object.keys(outcome.overlay).length,
    `${Object.keys(restored.overlay).length} vs ${Object.keys(outcome.overlay).length}`,
  );

  // The review is a FUNCTION, not only a file: a site whose brief produced one
  // page must FAIL the multi-route check, or the check proves nothing.
  const homepageOnly = reviewCrossPageConsistency({
    runId: run.manifest.runId,
    templateId: run.manifest.templateId,
    scopedRoutes: CORE_ROUTES,
    template: run.template,
    unitsFile: run.unitsFile,
    overlay: Object.fromEntries(
      Object.entries(outcome.overlay).filter(([key]) => key.startsWith("home.") || key.startsWith("global.")),
    ),
    changed: outcome.changed,
    // The REBUILT plan, so every route still has its page plan and the only
    // thing that can differ is coverage — otherwise `page-plan-missing` would
    // fail the review on its own and this check would prove nothing.
    plan: rebuiltPlan,
  });
  const uncovered = homepageOnly.findings.filter((finding) => finding.code === "route-uncovered");
  check(
    "P9.F4 the SAME review FAILS a homepage-only site with one `route-uncovered` ERROR per untouched route",
    !homepageOnly.pass &&
      uncovered.length === CORE_ROUTES.length - 1 &&
      uncovered.every((finding) => finding.severity === "error") &&
      homepageOnly.counts.errors === CORE_ROUTES.length - 1,
    `${homepageOnly.counts.errors} error(s): ${homepageOnly.findings
      .map((f) => `${f.code}/${f.severity}@${f.route ?? "-"}`)
      .join(", ")}`,
  );

  // -------------------------------------------------------------------------
  section("G — VALUE-SHAPED SLOTS: a price is not a place for a headline");
  // -------------------------------------------------------------------------
  // The verifier read the Phase 10 draft and found the pricing table saying
  // "$10 per user/month" -> "Shorter changeovers", the changelog date column
  // saying "August 20, 2026" -> "Paper traveller" and the security page saying
  // "ISO 27001 certified" -> "Rockwell FactoryTalk". These checks pin the fix
  // on the REAL template, through the real packet and the real ingest.
  const shapeCases: { value: string; expect: ValueShape | undefined }[] = [
    { value: "$0", expect: "price" },
    { value: "$16 per user/month", expect: "price" },
    { value: "50%", expect: "percentage" },
    { value: "2.0x", expect: "multiplier" },
    { value: "250 issues", expect: "counted-quantity" },
    { value: "ISO 27001 certified", expect: "certification" },
    { value: "SOC 2 compliance", expect: "certification" },
    { value: "By romain · 1 day ago", expect: "attribution" },
    { value: "August 20, 2026", expect: "date" },
    { value: "00:17", expect: "time" },
    { value: "1 day ago", expect: "relative-time" },
    { value: "1.4", expect: "version" },
    { value: "X", expect: "glyph" },
    // NOT value-shaped: real sentences that merely contain a figure.
    { value: " Charged at $0.25 per 20-minute block", expect: undefined },
    { value: "Linear uses this workflow internally to resolve roughly 30% of incoming bug reports.", expect: undefined },
    { value: "Plan the work your team will actually finish", expect: undefined },
  ];
  const misread = shapeCases.filter((testCase) => valueShapeOf(testCase.value) !== testCase.expect);
  check(
    "P9.G1 the value-shape classifier separates VALUES from copy, and a sentence containing a figure is still copy",
    misread.length === 0,
    misread.map((testCase) => `${JSON.stringify(testCase.value)}=>${valueShapeOf(testCase.value)} want ${testCase.expect}`).join("; "),
  );

  // The real thing: run the brief writer over the real /pricing + /security
  // scope and prove NOTHING value-shaped was overwritten with copy.
  const shapeRoutes = ["/pricing", "/security"];
  const runValueShaped = async (facts: { kind: string; value: string }[]) => {
    await rm(VALUE_SHAPE_RUN, { recursive: true, force: true });
    const shapedBrief: ContentBrief = {
      ...brief,
      facts: [...(brief.facts ?? []), ...facts],
    } as ContentBrief;
    const preparedShape = await prepareContentRun({
      templateManifestFile: TEMPLATE_MANIFEST,
      rawIntent: shapedBrief.goal!,
      routes: shapeRoutes,
      brief: shapedBrief,
      outputDir: VALUE_SHAPE_RUN,
      runId: "wr28-phase9-valueshape",
    });
    const shapeRun = await loadContentRun(preparedShape.runDir);
    const writer = new BriefContentGenerator();
    const execution = await executeGenerationBatches({
      runId: shapeRun.manifest.runId,
      intent: shapeRun.intent,
      policy: shapeRun.policy,
      unitsFile: shapeRun.unitsFile,
      request: shapeRun.request,
      generator: writer,
    });
    const ingested = await ingestGenerationResult(shapeRun, execution.result);
    return { ingested, stats: writer.writerStats(), template: shapeRun.template };
  };
  const shaped = await runValueShaped([]);
  const shapedRows = shaped.ingested.accounting.entries.filter((entry) => entry.type === "text");
  const overwritten: string[] = [];
  const factNeedsInput: string[] = [];
  const chromeKept: string[] = [];
  for (const entry of shapedRows) {
    const original = shaped.template.defaultContent.values[entry.slotKey];
    if (typeof original !== "string") continue;
    const shape = valueShapeOf(original);
    if (shape === undefined) continue;
    const written = shaped.ingested.overlay[entry.slotKey];
    if (valueShapeIsFactBearing(shape)) {
      if (written === undefined && entry.disposition === "unresolved") factNeedsInput.push(entry.slotKey);
      else if (typeof written === "string" && written !== original) overwritten.push(`${entry.slotKey}:${shape}`);
    } else if (written === original) chromeKept.push(entry.slotKey);
    else if (typeof written === "string" && written !== original) overwritten.push(`${entry.slotKey}:${shape}`);
  }
  check(
    "P9.G2 NOT ONE value-shaped slot is overwritten with composed copy — no price, plan limit, statistic, certification, date, time, version or byline",
    overwritten.length === 0 && factNeedsInput.length > 0 && chromeKept.length > 0,
    `overwritten=${overwritten.join(", ")} factNeedsInput=${factNeedsInput.length} chromeKept=${chromeKept.length}`,
  );
  check(
    "P9.G3 a fact-bearing value the brief did not state is a NAMED needs-input, quoting the source figure it refuses to carry",
    factNeedsInput.length > 0 &&
      factNeedsInput.length === shaped.stats.valueShapedFactsWithheld &&
      shaped.ingested.accounting.entries
        .filter((entry) => factNeedsInput.includes(entry.slotKey))
        .every((entry) => entry.detail.includes("needs factual input") && entry.detail.includes("SOURCE business")),
    `${factNeedsInput.length} withheld: ${factNeedsInput.slice(0, 6).join(", ")}`,
  );
  // The inverse: the operator states the figures and the same run writes them.
  const stated = await runValueShaped([
    { kind: "figure", value: "10-per-user-month: $49 per line/month" },
    { kind: "figure", value: "16-per-user-month: $79 per line/month" },
    { kind: "figure", value: "250-issues: 500 work orders" },
  ]);
  const statedValues = ["pricing.main.text.10-per-user-month", "pricing.main.text.16-per-user-month", "pricing.main.text.250-issues"]
    .map((key) => stated.ingested.overlay[key]);
  check(
    "P9.G4 INVERSE: a `figure` fact in the brief resolves the slot with the OPERATOR's number, and the needs-input list shrinks by exactly that many",
    statedValues.join("|") === "$49 per line/month|$79 per line/month|500 work orders" &&
      stated.stats.valueShapedFactsFromBrief === 3 &&
      stated.stats.valueShapedFactsWithheld === shaped.stats.valueShapedFactsWithheld - 3,
    `${JSON.stringify(statedValues)} fromBrief=${stated.stats.valueShapedFactsFromBrief} ` +
      `withheld ${stated.stats.valueShapedFactsWithheld} vs ${shaped.stats.valueShapedFactsWithheld}`,
  );
  console.log(
    `  [measured] value-shape run: withheld=${shaped.stats.valueShapedFactsWithheld} ` +
      `chromeKept=${shaped.stats.valueShapedChromeKept} written=${shaped.stats.textSlotsWritten}`,
  );

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("smoke-content-generation ERROR —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
