import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTENT_ENGINE,
  CONTENT_POLICY,
  CONTENT_REPORT_DIR,
  MAX_REPAIR_ITERATIONS,
  REPAIR_DIR,
  REPAIR_STOP_FILE,
  RepairProgressGuard,
  SLOT_VALUES_FILE,
  TELEMETRY_FILE,
  buildRepairRequest,
  failureSignatureOf,
  loadContentRun,
  mergeRepairValues,
  noRepairCandidatesStop,
  recordLayoutQa,
  repairStopFromLoop,
  resolveGenerator,
  revalidateSlotValues,
  runContentLayoutQa,
  unitsForRepair,
  updateManifest,
  validateSlotAssignments,
  type LayoutQaReport,
  type RepairStop,
} from "./content-injection/index.js";
import { TelemetryRecorder } from "./telemetry/index.js";

/**
 * web-recon Content Injection — layout safety QA CLI (Task 19 §24–§27, §32–§34).
 *
 *   pnpm content:qa <content-run-dir> [options]
 *
 * Builds the immutable template app once and serves it twice — default
 * content vs the run's slot-values overlay — then asks the only question that
 * matters after intentional content change: did the layout survive? Verifies
 * every changed binding actually renders the new value (static + mounted
 * dynamic templates), replays the pattern triggers on both apps, captures
 * screenshots, and (with --repair --provider …) runs the bounded content
 * repair loop (max 2 iterations, content rewrites only — never CSS).
 *
 * Task 27 §6 (GED-D): the repair loop now also stops on NO PROGRESS — the
 * repaired values change nothing, repeat the previous iteration, or answer the
 * same failure signature again — and RECORDS WHY, machine-readably, in
 * `report/repair/repair-stop.json` and in the run manifest.
 */

interface ParsedArgs {
  runRef?: string;
  widths?: number[];
  routes?: string[];
  forceBuild?: boolean;
  skipInteractions?: boolean;
  noScreenshots?: boolean;
  repair?: boolean;
  provider?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const take = (i: number, flag: string): [string, number] => {
    const value = argv[i + 1];
    if (!value) throw new Error(`${flag} requires a value`);
    return [value, i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--widths") {
      const [value, next] = take(i, arg);
      args.widths = value.split(",").map((w) => Number(w.trim()));
      i = next;
    } else if (arg === "--routes") {
      const [value, next] = take(i, arg);
      args.routes = value.split(",").map((r) => r.trim());
      i = next;
    } else if (arg === "--provider") {
      const [value, next] = take(i, arg);
      args.provider = value;
      i = next;
    } else if (arg === "--force-build") {
      args.forceBuild = true;
    } else if (arg === "--skip-interactions") {
      args.skipInteractions = true;
    } else if (arg === "--no-screenshots") {
      args.noScreenshots = true;
    } else if (arg === "--repair") {
      args.repair = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.runRef === undefined) {
      args.runRef = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log("Usage: pnpm content:qa <content-run-dir> [options]");
  console.log("  --widths <list>       comma-separated widths (default 390,1440)");
  console.log("  --routes <list>       routes to check (default: the run's scoped routes)");
  console.log("  --force-build         rebuild the template app even if .next exists");
  console.log("  --skip-interactions   skip the interaction regression phase");
  console.log("  --no-screenshots      skip screenshot capture");
  console.log("  --repair              run the bounded repair loop on failure evidence");
  console.log("  --provider <name>     provider for --repair (e.g. fake)");
}

function printSummary(report: LayoutQaReport): void {
  const failingPages = report.pages.filter((p) => !p.pass);
  const failedApplied = report.appliedChecks.filter((c) => !c.applied);
  const failedInteractions = report.interactionChecks.filter((i) => !i.equivalent);
  console.log("");
  console.log("Layout safety (default vs injected, same template app)");
  console.log(`  route/width pages          ${report.pages.length} (${failingPages.length} failing)`);
  console.log(`  changed-slot observations  ${report.slotObservations.length}`);
  console.log(`  applied-value checks       ${report.appliedChecks.length - failedApplied.length}/${report.appliedChecks.length}`);
  console.log(`  interaction checks         ${report.interactionChecks.length - failedInteractions.length}/${report.interactionChecks.length}`);
  console.log(`  repair candidates          ${report.repairCandidates.length}`);
  console.log(`  screenshots                ${report.screenshots.length}`);
  for (const p of failingPages) console.log(`  FAIL page ${p.route} @${p.width}: ${p.notes.join("; ")}`);
  for (const c of failedApplied.slice(0, 10)) console.log(`  FAIL applied ${c.slotKey} ${c.bindingId}: ${c.detail}`);
  for (const i of failedInteractions) console.log(`  FAIL interaction ${i.patternId} @${i.width}: ${i.detail}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runRef || (args.repair && !args.provider)) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  const run = await loadContentRun(args.runRef);
  // Always revalidate the current overlay first — QA must never render an
  // overlay that no longer passes the deterministic validator.
  const outcome = await revalidateSlotValues(run);
  const overlayFile = path.join(run.runDir, SLOT_VALUES_FILE);
  const routes = args.routes ?? run.manifest.scopedRoutes;
  const qaOptions = {
    runId: run.manifest.runId,
    runDir: run.runDir,
    template: run.template,
    slotValuesFile: overlayFile,
    routes,
    widths: args.widths,
    forceBuild: args.forceBuild,
    skipInteractions: args.skipInteractions,
    screenshots: !(args.noScreenshots ?? false),
    log: (line: string) => console.log(line),
  };

  let report = await runContentLayoutQa(qaOptions);
  let validation = outcome.validation;
  let overlay = outcome.overlay;
  let iterations = 0;
  let repairStop: RepairStop | undefined;

  if (args.repair && args.provider) {
    const generator = resolveGenerator(args.provider);
    const telemetry = new TelemetryRecorder({
      file: path.join(run.runDir, CONTENT_REPORT_DIR, TELEMETRY_FILE),
      engine: CONTENT_ENGINE,
      runId: run.manifest.runId,
    });
    // GED-D: bounded no-progress detection, stateful across the loop.
    const guard = new RepairProgressGuard();
    while (!report.pass && report.repairCandidates.length > 0 && iterations < MAX_REPAIR_ITERATIONS) {
      iterations++;
      const currentValues = new Map(Object.entries(overlay));
      const request = buildRepairRequest(run.manifest.runId, iterations, report, run.unitsFile, currentValues);
      if (!request) {
        // `iterations` was incremented for a round that never ran, so the
        // COMPLETED count is one lower — and 0 means "never started".
        repairStop = noRepairCandidatesStop(iterations - 1);
        break;
      }
      const repairDir = path.join(run.runDir, CONTENT_REPORT_DIR, REPAIR_DIR);
      await mkdir(repairDir, { recursive: true });
      await writeFile(
        path.join(repairDir, `repair-request-${iterations}.json`),
        JSON.stringify(request, null, 2) + "\n",
        "utf8",
      );
      console.log(`[content:qa] repair iteration ${iterations}: ${request.items.length} slot(s)`);
      const startedAt = Date.now();
      const repairResult = await generator.generate({
        mode: "repair",
        intent: run.intent,
        policy: CONTENT_POLICY,
        units: unitsForRepair(run.unitsFile, request),
        request: run.request,
        repair: request,
      });
      const usage = generator.lastUsage?.();
      await telemetry.record({
        seamId: "content.repair.iteration",
        stage: "repair",
        provider: generator.name,
        batchIds: [],
        unitCount: unitsForRepair(run.unitsFile, request).length,
        slotCount: request.items.length,
        routes,
        elapsedMs: Date.now() - startedAt,
        retryCount: iterations - 1,
        outcome: "ok",
        ...(usage !== undefined ? { usage } : {}),
      });
      await writeFile(
        path.join(repairDir, `repair-result-${iterations}.json`),
        JSON.stringify(repairResult, null, 2) + "\n",
        "utf8",
      );
      // GED-D §6: decide BEFORE applying. A repair that cannot change anything
      // must not consume another browser QA pass.
      const stop = guard.evaluate({
        iteration: iterations,
        candidateKeys: request.items.map((item) => item.slotKey).sort(),
        failureSignature: failureSignatureOf(report),
        repairedValues: repairResult.slotValues,
        currentOverlay: overlay,
      });
      if (stop) {
        repairStop = stop;
        console.log(`[content:qa] repair stopped: ${stop.reason} — ${stop.detail}`);
        break;
      }
      const { merged, ignoredKeys } = mergeRepairValues(overlay, request, repairResult.slotValues);
      if (ignoredKeys.length > 0) {
        console.log(`[content:qa] repair wrote outside its scope; ignored: ${ignoredKeys.join(", ")}`);
      }
      const repairedValidation = validateSlotAssignments(
        run.template,
        run.unitsFile,
        merged,
        [],
        { ...(run.result?.sources ?? {}), ...repairResult.sources },
        run.result?.imageBriefs ?? [],
      );
      if (!repairedValidation.pass) {
        console.log(`[content:qa] repair result failed validation (${repairedValidation.errors.length} errors) — stopping loop`);
        repairStop = repairStopFromLoop(
          iterations,
          "repair-validation-failed",
          `repaired values failed the deterministic validator with ${repairedValidation.errors.length} error(s)`,
        );
        break;
      }
      overlay = merged;
      validation = repairedValidation;
      await writeFile(overlayFile, JSON.stringify(merged, null, 2) + "\n", "utf8");
      await updateManifest(run, (m) => ({ ...m, repairIterations: iterations }));
      report = await runContentLayoutQa(qaOptions);
    }
    if (repairStop === undefined) {
      repairStop = report.pass
        ? repairStopFromLoop(iterations, "layout-qa-passed", "layout QA passed; no further repair needed")
        : iterations >= MAX_REPAIR_ITERATIONS
          ? repairStopFromLoop(
              iterations,
              "iteration-bound-reached",
              `the bound of ${MAX_REPAIR_ITERATIONS} iteration(s) was reached with evidence still open`,
            )
          : noRepairCandidatesStop(iterations);
    }
    const repairDir = path.join(run.runDir, CONTENT_REPORT_DIR, REPAIR_DIR);
    await mkdir(repairDir, { recursive: true });
    await writeFile(
      path.join(repairDir, REPAIR_STOP_FILE),
      JSON.stringify(repairStop, null, 2) + "\n",
      "utf8",
    );
    await updateManifest(run, (m) => ({ ...m, repairStop }));
  }

  await recordLayoutQa(run, report, validation, overlay);
  printSummary(report);
  console.log("");
  console.log(`[content:qa] ${report.pass ? "PASS" : "FAIL"} in ${Math.round((Date.now() - startedAt) / 1000)}s${iterations > 0 ? ` (repair iterations: ${iterations})` : ""}`);
  if (repairStop) console.log(`  repair stop: ${repairStop.reason} at iteration ${repairStop.iteration}`);
  console.log(`  report: ${path.join(run.runDir, CONTENT_REPORT_DIR, "layout-qa.json")}`);
  if (!report.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[content:qa] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
