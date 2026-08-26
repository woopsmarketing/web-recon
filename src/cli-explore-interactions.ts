import {
  ACTION_STATUS_ORDER,
  DEFAULT_CONCURRENCY,
  DIFF_CATEGORY_ORDER,
  LOCATOR_STRATEGY_ORDER,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  SKIP_REASON_ORDER,
  exploreSite,
  type ExplorationRun,
} from "./interaction-explorer/index.js";

/**
 * web-recon Explore-Interactions CLI — Task 11 (Safe Rule-Based Interaction
 * Exploration).
 *
 * Flow:
 *   interaction-analysis.json (Task 10, immutable)
 *     → deterministic offline action plan
 *     → ONE Chromium, a fresh BrowserContext per action
 *     → click → before/after state diff
 *     → data/<host>/interaction-explorations/<run-id>/
 *
 * This command performs REAL interaction on a live site, and everything about
 * it is built to keep that safe:
 *
 *  - no Firecrawl, no discovery, no verification, no selection, no re-observation
 *  - no AI, no LLM, no embedding, no similarity score
 *  - `click` is the only physical action: nothing is typed, uploaded, dragged,
 *    or submitted
 *  - candidates carrying a `form-submit`, `file-input` or `navigation` guard are
 *    excluded from the plan before a browser starts
 *  - during the action phase, main-frame navigations, popups, downloads and
 *    every non-GET request are blocked and recorded
 *  - each action runs in its own anonymous context: no user cookies, no login
 *    session, no saved passwords, and no state carried from the previous action
 *
 * `--plan-only` produces the plan and touches no browser at all.
 */

interface ParsedArgs {
  interactionAnalysisFile?: string;
  concurrency: number;
  planOnly: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let interactionAnalysisFile: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;
  let planOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--concurrency") {
      const raw = argv[++i];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < MIN_CONCURRENCY || value > MAX_CONCURRENCY) {
        throw new Error(
          `--concurrency must be an integer between ${MIN_CONCURRENCY} and ${MAX_CONCURRENCY} (got ${raw})`,
        );
      }
      concurrency = value;
    } else if (arg === "--plan-only") {
      planOnly = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (interactionAnalysisFile === undefined) {
      interactionAnalysisFile = arg;
    }
  }

  return { interactionAnalysisFile, concurrency, planOnly };
}

function printUsage(): void {
  console.log(
    "Usage: pnpm explore:interactions <path-to-interaction-analysis.json> [--concurrency 1-3] [--plan-only]",
  );
  console.log(
    "  Re-finds Task 10 candidates in the live page, clicks them safely, and records the state diff.",
  );
  console.log("  --plan-only builds the deterministic action plan without launching a browser.");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printCounts(
  order: readonly string[],
  counts: Record<string, number>,
  indent = "  ",
): void {
  const rows = order.filter((key) => (counts[key] ?? 0) > 0);
  if (rows.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  const width = Math.max(...rows.map((r) => r.length));
  for (const key of rows) {
    console.log(`${indent}${key.padEnd(width)}  ${counts[key]}`);
  }
}

function printPlan(run: ExplorationRun): void {
  const s = run.plan.stats;
  console.log("");
  console.log("Action plan (deterministic, offline)");
  console.log("");
  console.log(
    `Site (Task 10): ${s.siteCandidateCount} candidate(s) across ${s.sitePageCount} page(s)`,
  );
  console.log(`Pages planned: ${run.plan.pages.length} (${s.plannedPages} with actions)`);
  console.log(`Candidates in planned pages: ${s.totalCandidates}`);
  console.log(`  eligible:            ${s.eligibleCandidates}`);
  console.log(`  interaction shapes:  ${s.shapeGroups}`);
  console.log(`  deduped by shape:    ${s.deduplicatedByShape}`);
  console.log(
    `Planned actions: ${s.plannedActions}  (desktop ${s.desktopActions} / mobile ${s.mobileActions})`,
  );
  console.log(
    `Skipped: ${s.skippedByPolicy} by policy, ${s.skippedByBudget} by budget`,
  );
  printCounts(SKIP_REASON_ORDER, s.skipReasonCounts);
}

function printExploration(run: ExplorationRun): void {
  const e = run.exploration;
  const s = e.stats;
  console.log("");
  console.log("Live exploration");
  console.log("");
  console.log(
    `Executed: ${s.executedActions}/${s.plannedActions}   ` +
      `changed ${s.changedActions}  no-change ${s.noChangeActions}  ` +
      `(change rate ${s.changeRate})`,
  );
  console.log(
    `  desktop  planned ${s.desktopPlanned}  executed ${s.desktopExecuted}  changed ${s.desktopChanged}`,
  );
  console.log(
    `  mobile   planned ${s.mobilePlanned}  executed ${s.mobileExecuted}  changed ${s.mobileChanged}`,
  );
  console.log("");
  console.log("Action status:");
  printCounts(ACTION_STATUS_ORDER, e.actionStatusSummary);
  console.log("");
  console.log(`Locator resolution rate: ${s.locatorResolutionRate}`);
  printCounts(
    ["resolved", "not-found", "ambiguous", "semantic-mismatch"],
    e.locatorStatusSummary,
  );
  console.log("Locator strategy (successful resolutions):");
  printCounts(LOCATOR_STRATEGY_ORDER, e.locatorStrategySummary);
  console.log("");
  console.log("State diff:");
  printCounts(DIFF_CATEGORY_ORDER, e.diffSummary);
  console.log("");
  const safety = e.safetySummary;
  console.log("Safety:");
  console.log(
    `  plan exclusions   form-submit ${safety.formSubmitSkipped}  ` +
      `file-input ${safety.fileInputSkipped}  navigation ${safety.navigationGuardSkipped}`,
  );
  console.log(
    `  live guards       navigation ${safety.navigationAttemptsBlocked}  ` +
      `popup ${safety.popupAttempts}  download ${safety.downloadAttempts}  ` +
      `write-request ${safety.writeRequestsBlocked}  dialog ${safety.dialogsDismissed}`,
  );
  console.log(
    `  unblockable       same-document navigation ${safety.sameDocumentNavigations} ` +
      `(client-side router; the diff of such an action is not counted as a state change)`,
  );
  const d = e.dynamicTargetSummary;
  console.log("");
  console.log(
    `Dynamic targets: planned ${d.plannedUnresolvedTriggers}, executed ${d.executedUnresolvedTriggers}, ` +
      `mounted after action ${d.resolvedAfterAction}, still unresolved ${d.stillUnresolved} ` +
      `(+${d.newInteractiveDescendants} interactive descendants)`,
  );
  console.log("");
  console.log(
    `Storage: ${formatBytes(e.storageSummary.totalBytes)} ` +
      `(plan ${formatBytes(e.storageSummary.planBytes)} + actions ${formatBytes(e.storageSummary.actionArtifactBytes)} + ` +
      `manifest ${formatBytes(e.storageSummary.manifestBytes)}), ` +
      `avg ${formatBytes(e.storageSummary.averageBytesPerAction)}/action`,
  );
  console.log(
    `Timing: ${s.totalElapsedMs} ms wall, ${s.totalLoadMs} ms in page loads, ` +
      `avg ${s.averageActionMs} ms/action`,
  );
  if (e.mutationTruncatedCount > 0) {
    console.log(`Mutation cap reached on ${e.mutationTruncatedCount} action(s)`);
  }
}

async function main(): Promise<void> {
  console.log(
    "web-recon — explore:interactions (safe rule-based interaction exploration)",
  );
  console.log("");

  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!args.interactionAnalysisFile) {
    printUsage();
    return;
  }

  try {
    const run = await exploreSite({
      interactionAnalysisFile: args.interactionAnalysisFile,
      concurrency: args.concurrency,
      planOnly: args.planOnly,
      onActionDone: (observation, done, total) => {
        const locator =
          observation.locatorResolution.status === "resolved"
            ? (observation.locatorResolution.strategy ?? "resolved")
            : observation.locatorResolution.status;
        console.log(
          `[${done}/${total}] ${observation.actionId} ${observation.viewportId} ` +
            `${observation.status}  locator=${locator}  ` +
            `changes=${observation.diff?.changes.length ?? 0}  ` +
            `${observation.pageId}/${observation.sourceCandidateId}`,
        );
      },
    });

    printPlan(run);
    if (!args.planOnly) printExploration(run);

    console.log("");
    console.log("Saved:");
    console.log(run.planPath);
    console.log(run.manifestPath);
    if (!args.planOnly && run.observations.length > 0) {
      console.log(
        `${run.observations.length} action file(s) under ${run.runDir}/pages/<page-id>/<viewport>/<action-id>.json`,
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
