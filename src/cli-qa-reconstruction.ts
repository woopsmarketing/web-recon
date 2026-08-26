import {
  MAX_CONCURRENCY,
  MAX_FIX_ITERATIONS_CEILING,
  MIN_CONCURRENCY,
  QaEngineError,
  QaInfrastructureError,
  QaInputError,
  runReconstructionQa,
  type QaRunResult,
} from "./reconstruction-qa/index.js";

/**
 * web-recon Reconstruction QA CLI — Task 15.
 *
 * ```
 *   reconstruction-manifest.json (Task 14, immutable)
 *     → the generated app, served locally
 *     → the SiteSpec it was built from + the Task 09/11/12 evidence behind it
 *     → the LIVE original, re-observed in the Task 05 environment
 *     → data/<host>/reconstruction-qa/<run-id>/
 * ```
 *
 * The default run MEASURES and CLASSIFIES; it changes nothing. Applying
 * corrections requires `--auto-fix`, because a repair is an operator's decision
 * and not a side effect of asking how good the clone is (item 11).
 *
 * Nothing here calls Firecrawl, runs discovery, or uses AI. Playwright is used
 * against exactly two things: the public original (read-only, with Task 11's
 * safety guards on any interaction) and the local clone.
 */

interface ParsedArgs {
  manifestFile?: string;
  siteSpecFile?: string;
  concurrency?: number;
  snapshotOnly?: boolean;
  noLiveOriginal?: boolean;
  autoFix?: boolean;
  maxFixIterations?: number;
  familyAudit?: number;
  saveAllScreenshots?: boolean;
  outputDir?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const take = (index: number, flag: string): [string, number] => {
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    return [value, index + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--concurrency") {
      const [value, next] = take(i, arg);
      args.concurrency = Number(value);
      i = next;
    } else if (arg.startsWith("--concurrency=")) {
      args.concurrency = Number(arg.slice("--concurrency=".length));
    } else if (arg === "--site-spec") {
      const [value, next] = take(i, arg);
      args.siteSpecFile = value;
      i = next;
    } else if (arg.startsWith("--site-spec=")) {
      args.siteSpecFile = arg.slice("--site-spec=".length);
    } else if (arg === "--snapshot-only") {
      args.snapshotOnly = true;
    } else if (arg === "--no-live-original") {
      args.noLiveOriginal = true;
    } else if (arg === "--auto-fix") {
      args.autoFix = true;
    } else if (arg === "--max-fix-iterations") {
      const [value, next] = take(i, arg);
      args.maxFixIterations = Number(value);
      i = next;
    } else if (arg.startsWith("--max-fix-iterations=")) {
      args.maxFixIterations = Number(arg.slice("--max-fix-iterations=".length));
    } else if (arg === "--family-audit") {
      const [value, next] = take(i, arg);
      args.familyAudit = Number(value);
      i = next;
    } else if (arg.startsWith("--family-audit=")) {
      args.familyAudit = Number(arg.slice("--family-audit=".length));
    } else if (arg === "--save-all-screenshots") {
      args.saveAllScreenshots = true;
    } else if (arg === "--output" || arg === "--out") {
      const [value, next] = take(i, arg);
      args.outputDir = value;
      i = next;
    } else if (arg.startsWith("--output=")) {
      args.outputDir = arg.slice("--output=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.manifestFile === undefined) {
      args.manifestFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm qa:reconstruction <path-to-reconstruction-manifest.json> [options]");
  console.log(`  --concurrency N          pages in flight (${MIN_CONCURRENCY}–${MAX_CONCURRENCY}, default 2)`);
  console.log("  --site-spec <file>       the SiteSpec this reconstruction came from");
  console.log("                           (default: resolved from the manifest's site + versions)");
  console.log("  --snapshot-only          snapshot ↔ clone only: no live original at all,");
  console.log("                           no interaction/unknown replay, no family audit");
  console.log("  --no-live-original       no live-original network access; clone-side");
  console.log("                           behavior is still replayed and recorded");
  console.log("  --auto-fix               propose AND apply corrections (opt-in, item 11)");
  console.log("  --max-fix-iterations N   correction iterations after the baseline (default 2)");
  console.log("  --family-audit N         family-represented routes to audit (default 4)");
  console.log("  --save-all-screenshots   keep every PNG, not just the retained set");
  console.log("  --output <dir>           write the QA run here instead of");
  console.log("                           data/<host>/reconstruction-qa/<run-id>/");
  console.log("");
  console.log("  Reads the reconstruction, the SiteSpec behind it and the Task 09/11/12");
  console.log("  evidence behind that. Writes ONLY into its own run directory: no Task");
  console.log("  06–14 artifact is ever modified.");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function reportRun(result: QaRunResult): void {
  const { baseline } = result;
  const fidelity = baseline.snapshotFidelity;

  console.log("");
  console.log("Static truth set (exact-observed pages only)");
  console.log(`  page/viewport pairs        ${fidelity.pageViewportPairs}`);
  console.log(`  completed                  ${fidelity.completed}`);
  console.log(`  nodes compared             ${fidelity.comparedNodes}`);
  console.log(`  nodes missing in clone     ${fidelity.missingNodes}`);

  console.log("");
  console.log("Snapshot fidelity (SiteSpec ↔ clone — the reconstruction contract)");
  console.log(`  content exact ratio        ${fidelity.contentExactRatio}`);
  console.log(`  content mismatched nodes   ${fidelity.contentMismatchedNodes}`);
  console.log(`  style properties compared  ${fidelity.styleComparedProperties}`);
  console.log(`  style mismatches           ${fidelity.styleMismatchedProperties}`);
  console.log(`  …of which sub-layout-unit  ${fidelity.styleSubLayoutUnitMismatches} (counted apart)`);
  console.log(`  geometry median-of-medians ${fidelity.geometryMedianOfMedians}px`);
  console.log(`  geometry median-of-p95     ${fidelity.geometryMedianOfP95}px`);
  console.log(`  geometry max delta         ${fidelity.geometryMaxDelta}px`);
  console.log(`  document height Δ median   ${fidelity.documentHeightDeltaMedian}px`);
  console.log(`  screenshot mean Δ median   ${fidelity.screenshotMeanDeltaMedian}`);
  console.log(`  changed pixel ratio median ${fidelity.screenshotChangedRatioMedian}`);
  console.log(`  asset failures             ${fidelity.assetFailures}`);
  console.log(`  clone JS runtime errors    ${fidelity.runtimeErrors}`);
  console.log(`  blocked-asset console msgs ${fidelity.blockedAssetMessages} (not JS — item 54)`);
  console.log(`  unstable measurements      ${fidelity.unstablePages}`);

  console.log("");
  console.log("Live original drift (why a difference is NOT always a clone defect)");
  const drift = baseline.sourceDrift;
  console.log(`  attempted                  ${drift.attempted}`);
  console.log(`  structurally aligned       ${drift.structurallyAligned}`);
  console.log(`  structural drift           ${drift.structuralDrift}`);
  console.log(`  content drift (pairs)      ${drift.contentDriftPairs} (${drift.contentDriftNodes} nodes)`);
  console.log(`  style drift (pairs)        ${drift.styleDriftPairs} (${drift.styleDriftProperties} properties)`);
  console.log(`  live load failures         ${drift.loadFailures}`);

  console.log("");
  console.log("Live fidelity (drift-free pages only — never mixed with the above)");
  console.log(`  comparable pairs           ${baseline.liveFidelity.comparablePairs}`);
  console.log(`  content exact ratio        ${baseline.liveFidelity.contentExactRatio}`);
  console.log(`  changed pixel ratio median ${baseline.liveFidelity.screenshotChangedRatioMedian}`);

  console.log("");
  console.log("Behavior equivalence (a DIFFERENT axis from Task 14's binding count)");
  const behavior = baseline.behavior;
  console.log(`  source pattern instances   ${behavior.sourcePatternInstances}`);
  console.log(`  replayed                   ${behavior.attempted}`);
  console.log(`  trigger state equivalent   ${behavior.triggerStateEquivalent}`);
  console.log(`  trigger state mismatch     ${behavior.triggerStateMismatch}`);
  console.log(`  visible target equivalent  ${behavior.visibleTargetEquivalent}`);
  console.log(`  visible target mismatch    ${behavior.visibleTargetMismatch}`);
  console.log(`  visible target not-observed ${behavior.visibleTargetNotObserved}`);
  console.log(`  visible target not-declared ${behavior.visibleTargetNotDeclared}`);
  console.log(`  combined equivalent        ${behavior.behaviorEquivalent}`);
  console.log(`  combined mismatch          ${behavior.behaviorMismatch}`);
  console.log(`  source-drifted             ${behavior.sourceDrifted}`);
  console.log(`  unverifiable               ${behavior.unverifiable}`);
  console.log(`  dynamic targets compared   ${behavior.dynamicTargetsCompared} (${behavior.dynamicTargetContentGaps} content gaps)`);
  console.log(`  open-state evidence usable ${behavior.openStateEvidenceUsable}`);
  console.log(`  tab panel unverified       ${behavior.tabPanelUnverified} (selection only, item 72)`);

  console.log("");
  console.log("Unknown interactions (detected, never implemented)");
  console.log(`  signature groups           ${baseline.unknowns.signatureGroups}`);
  console.log(`  sampled                    ${baseline.unknowns.sampled}`);
  console.log(`  gaps detected              ${baseline.unknowns.gapsDetected}`);
  console.log(`  clone no-op                ${baseline.unknowns.cloneNoOp}`);
  console.log(`  auto-fixed                 ${baseline.unknowns.autoFixed}`);

  console.log("");
  console.log("Routes");
  console.log(`  rendered                   ${result.routeCheck.rendered}/${result.routeCheck.checked}`);
  if (result.routeCheck.failures.length > 0) {
    for (const failure of result.routeCheck.failures.slice(0, 5)) {
      console.log(`    FAILED ${failure}`);
    }
  }

  console.log("");
  console.log("Family audit (representative reuse risk — never a generator defect)");
  console.log(`  routes audited             ${result.familyAudit.length}`);
  console.log(
    `  major content mismatch     ${result.familyAudit.filter((entry) => entry.majorContentMismatch).length}`,
  );
  console.log(
    `  major structure mismatch   ${result.familyAudit.filter((entry) => entry.majorStructureMismatch).length}`,
  );

  console.log("");
  console.log("Root causes (occurrences · affected nodes · auto-fix eligible)");
  for (const row of baseline.rootCauses.rows) {
    console.log(
      `  ${row.classification.padEnd(36)} ${String(row.occurrences).padStart(5)} ${String(
        row.affectedNodes,
      ).padStart(7)} ${String(row.autoFixEligible).padStart(4)}`,
    );
  }

  console.log("");
  console.log("Most frequently mismatching computed-style properties");
  for (const entry of baseline.topStyleProperties) {
    console.log(`  ${entry.property.padEnd(24)} ${entry.count}`);
  }

  console.log("");
  console.log("Worst pages (per dimension — never one merged rank)");
  for (const [name, entries] of Object.entries(baseline.worst)) {
    console.log(`  ${name}`);
    for (const entry of entries) {
      console.log(`    ${entry.value} — ${entry.pageId}/${entry.viewport} ${entry.url}`);
      if (entry.detail) console.log(`      ${entry.detail}`);
    }
  }

  console.log("");
  console.log("Corrections");
  console.log(`  proposed                   ${result.proposed.length}`);
  console.log(`  applied (accepted)         ${result.applied.length}`);
  console.log(`  rejected                   ${result.rejected.length}`);
  console.log(`  iterations                 ${result.iterations}`);
  for (const correction of result.applied) {
    console.log(`    ACCEPTED ${correction.id} ${correction.type}`);
  }
  for (const entry of result.rejected.slice(0, 10)) {
    console.log(`    REJECTED ${entry.correction.id} ${entry.correction.type} — ${entry.reason}`);
  }

  console.log("");
  console.log("Performance");
  for (const [phase, ms] of Object.entries(result.timings)) {
    console.log(`  ${phase.padEnd(26)} ${ms} ms`);
  }
  console.log(`  storage written            ${formatBytes(result.storageBytes)}`);
  console.log("");
  console.log(`[qa] wrote ${result.runDir}`);
  console.log("  Firecrawl 0 · AI 0 · discovery 0 · SiteSpec writes 0 · baseline app writes 0");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (
    args.concurrency !== undefined &&
    (!Number.isInteger(args.concurrency) ||
      args.concurrency < MIN_CONCURRENCY ||
      args.concurrency > MAX_CONCURRENCY)
  ) {
    throw new Error(
      `--concurrency must be an integer between ${MIN_CONCURRENCY} and ${MAX_CONCURRENCY}`,
    );
  }
  if (
    args.maxFixIterations !== undefined &&
    (!Number.isInteger(args.maxFixIterations) ||
      args.maxFixIterations < 0 ||
      args.maxFixIterations > MAX_FIX_ITERATIONS_CEILING)
  ) {
    throw new Error(
      `--max-fix-iterations must be an integer between 0 and ${MAX_FIX_ITERATIONS_CEILING}`,
    );
  }

  const result = await runReconstructionQa({
    manifestFile: args.manifestFile,
    ...(args.siteSpecFile !== undefined ? { siteSpecFile: args.siteSpecFile } : {}),
    ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}),
    ...(args.snapshotOnly ? { snapshotOnly: true } : {}),
    ...(args.noLiveOriginal ? { noLiveOriginal: true } : {}),
    ...(args.autoFix ? { autoFix: true } : {}),
    ...(args.maxFixIterations !== undefined
      ? { maxFixIterations: args.maxFixIterations }
      : {}),
    ...(args.familyAudit !== undefined ? { familyAudit: args.familyAudit } : {}),
    ...(args.saveAllScreenshots ? { saveAllScreenshots: true } : {}),
    ...(args.outputDir !== undefined ? { outputDir: args.outputDir } : {}),
    onLog: (message) => console.log(message),
  });
  reportRun(result);
}

main().catch((err) => {
  if (err instanceof QaInputError) {
    console.error(`[qa] INPUT ERROR — ${err.message}`);
  } else if (err instanceof QaEngineError) {
    console.error(`[qa] ENGINE ERROR — ${err.message}`);
  } else if (err instanceof QaInfrastructureError) {
    console.error(`[qa] INFRASTRUCTURE ERROR — ${err.message}`);
  } else {
    console.error("[qa] ERROR —", err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
});
