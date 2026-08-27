import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  BATCH_EXECUTION_FILE,
  CONTENT_ENGINE,
  CONTENT_REPORT_DIR,
  TELEMETRY_FILE,
  assertNoBatchConflicts,
  executeGenerationBatches,
  ingestGenerationResult,
  loadContentRun,
  loadManualGenerationResult,
  resolveGenerator,
  updateManifest,
} from "./content-injection/index.js";
import { TelemetryRecorder } from "./telemetry/index.js";

/**
 * web-recon Content Injection — generate CLI (Task 19 §3/§14/§21, Task 27 §1/§7).
 *
 *   pnpm content:generate <content-run-dir> --provider fake
 *   pnpm content:generate <content-run-dir> --result <generation-result.json>
 *
 * Runs a provider against the prepared Content Task Packet, or ingests a
 * manually authored result (the MVP seam where Claude Code reads the packet
 * and writes the JSON). Either way the result passes the SAME deterministic
 * validator; only a passing result becomes `slot-values.json`.
 *
 * Task 27 §1: the provider path now EXECUTES the packet's batches — one call
 * per batch, global first, in the persisted batch order — instead of handing a
 * single call the whole unit set. The manual seam is unchanged by design: an
 * out-of-process author produces one result file and it is ingested as before.
 */

interface ParsedArgs {
  runRef?: string;
  provider?: string;
  resultFile?: string;
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
    if (arg === "--provider") {
      const [value, next] = take(i, arg);
      args.provider = value;
      i = next;
    } else if (arg === "--result") {
      const [value, next] = take(i, arg);
      args.resultFile = value;
      i = next;
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
  console.log("Usage: pnpm content:generate <content-run-dir> (--provider fake | --result <json>)");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runRef || (!args.provider && !args.resultFile) || (args.provider && args.resultFile)) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const run = await loadContentRun(args.runRef);
  const telemetry = new TelemetryRecorder({
    file: path.join(run.runDir, CONTENT_REPORT_DIR, TELEMETRY_FILE),
    engine: CONTENT_ENGINE,
    runId: run.manifest.runId,
  });

  let result;
  if (args.resultFile) {
    const startedAt = Date.now();
    result = await loadManualGenerationResult(args.resultFile);
    // §7: the out-of-process author reports no usage, so `usage` is ABSENT.
    // It is never zero-filled and never estimated.
    await telemetry.record({
      seamId: "content.generate.manual",
      stage: "manual",
      provider: "manual",
      ...(result.generator.model !== undefined ? { model: result.generator.model } : {}),
      batchIds: run.request.batches.map((batch) => batch.batchId),
      unitCount: run.unitsFile.units.length,
      slotCount: Object.keys(result.slotValues).length,
      routes: run.manifest.scopedRoutes,
      elapsedMs: Date.now() - startedAt,
      retryCount: 0,
      outcome: "ok",
    });
  } else {
    const execution = await executeGenerationBatches({
      runId: run.manifest.runId,
      intent: run.intent,
      policy: run.policy,
      unitsFile: run.unitsFile,
      request: run.request,
      generator: resolveGenerator(args.provider!),
      telemetry,
      log: (line) => console.log(line),
    });
    await writeFile(
      path.join(run.runDir, CONTENT_REPORT_DIR, BATCH_EXECUTION_FILE),
      JSON.stringify(execution.report, null, 2) + "\n",
      "utf8",
    );
    await updateManifest(run, (m) => ({
      ...m,
      batching: {
        executed: true,
        batches: run.request.batches.length,
        calls: execution.report.calls.length,
        conflicts: execution.report.conflicts.length,
        batchUnitLimit: execution.report.batchUnitLimit,
      },
    }));
    // A key two batches both produced is NEVER silently merged.
    assertNoBatchConflicts(execution.report);
    console.log(
      `[content:generate] batches    ${execution.report.calls.length} call(s), bound ${execution.report.batchUnitLimit} unit(s)/batch`,
    );
    result = execution.result;
  }

  const outcome = await ingestGenerationResult(run, result);
  console.log(`[content:generate] generator   ${result.generator.name}${result.generator.model ? ` (${result.generator.model})` : ""}`);
  console.log(`[content:generate] validation  PASS (${outcome.validation.warnings.length} warning(s))`);
  console.log(`[content:generate] assigned    ${outcome.validation.stats.assignedSlots} slot(s), changed vs default ${outcome.changed.size}`);
  console.log(`[content:generate] unresolved  ${outcome.validation.stats.unresolvedSlots} (needs-input)`);
  // §4 is a STRICTER behaviour than Task 19 had, so a refusal is never silent:
  // under verified-only a fact-shaped value the operator did not back has just
  // been withheld, and re-running with --truth-mode synthetic-allowed keeps it.
  const refused = outcome.accounting.truthDecisions.filter((d) => d.decision === "refused-unresolved");
  const marked = outcome.accounting.truthDecisions.filter((d) => d.decision === "marked-synthetic");
  console.log(
    `[content:generate] truth mode  ${outcome.accounting.truthMode} — ` +
      `${refused.length} claim(s) withheld, ${marked.length} marked synthetic`,
  );
  for (const decision of refused) {
    console.log(`  withheld ${decision.slotKey} (${decision.claim}) — supply the fact, or use --truth-mode synthetic-allowed`);
  }
  console.log(
    `[content:generate] accounting  ${outcome.accounting.totals.inScopeSlots} in-scope slot(s), ` +
      `reconciled ${outcome.accounting.reconciliation.reconciled}, ambiguous ${outcome.accounting.scopeHonesty.ambiguousSlots}`,
  );
  console.log(`[content:generate] overlay     ${run.runDir}/slot-values.json`);
  console.log(`[content:generate] review      ${run.runDir}/report/operator-review.md`);
  console.log(`[content:generate] account     ${run.runDir}/slot-accounting.json`);
  console.log("");
  console.log("Next:");
  console.log(`  pnpm content:qa ${run.runDir}`);
  console.log(`  pnpm content:preview ${run.runDir}`);
}

main().catch((err) => {
  console.error("[content:generate] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
