import path from "node:path";
import {
  buildInteractionModels,
  InteractionPatternInputError,
  loadExploration,
  modelRunDir,
  PATTERN_MECHANISM_ORDER,
  PATTERN_TYPE_ORDER,
  resolveAnalyzer,
  runAiFallback,
  saveAiAnalysis,
  saveInteractionPatterns,
  saveUnknownInteractions,
  UNKNOWN_REASON_ORDER,
  type BuiltModels,
} from "./interaction-patterns/index.js";

/**
 * web-recon Model-Interactions CLI — Task 12 (Interaction Pattern Modeling &
 * Unknown Interaction Strategy).
 *
 * Flow:
 *   interaction-exploration.json (Task 11, immutable)
 *     → deterministic pattern registry  → interaction-patterns.json
 *     → unknown taxonomy                → unknown-interactions.json
 *     → [--ai, optional]                → ai-analysis.json
 *
 * The default run is **completely offline**: 0 Firecrawl calls, 0 Playwright
 * launches, 0 network requests, 0 AI calls. It performs no interaction of any
 * kind — nothing is clicked, hovered, focused, or navigated. It interprets
 * evidence Task 11 already recorded, so re-modeling a site costs no browser time
 * and touches nobody's server.
 *
 * `--ai` is an annotation on the part the rules could not explain, never a
 * dependency: with no provider configured it prints one line and the
 * deterministic artifacts are still written (item 55).
 */

interface ParsedArgs {
  explorationFile?: string;
  ai: boolean;
  aiProvider?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let explorationFile: string | undefined;
  let ai = false;
  let aiProvider: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--ai") {
      ai = true;
    } else if (arg === "--ai-provider") {
      const value = argv[++i];
      if (!value) throw new Error("--ai-provider requires a provider name");
      aiProvider = value;
      ai = true;
    } else if (arg.startsWith("--ai-provider=")) {
      aiProvider = arg.slice("--ai-provider=".length);
      ai = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (explorationFile === undefined) {
      explorationFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return {
    ...(explorationFile !== undefined ? { explorationFile } : {}),
    ai,
    ...(aiProvider !== undefined ? { aiProvider } : {}),
  };
}

function printUsage(): void {
  console.log(
    "Usage: pnpm model:interactions <path-to-interaction-exploration.json> [--ai] [--ai-provider <name>]",
  );
  console.log(
    "  Offline: reads an existing Task 11 exploration run and writes deterministic",
  );
  console.log(
    "  interaction patterns + a classified unknown taxonomy. No browser, no network.",
  );
  console.log(
    "  --ai analyzes ONLY the eligible unknown signature representatives; a missing",
  );
  console.log("  provider prints a note and never fails the run.");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printCounts(
  order: readonly string[],
  counts: Record<string, number>,
  indent = "    ",
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

/** A run id for the OUTPUT namespace only — never inside a deterministic file. */
function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function report(models: BuiltModels): void {
  const { coverage } = models.patterns;

  console.log("");
  console.log("Coverage");
  console.log(`  planned actions        ${coverage.totalActions}`);
  console.log(`  executed actions       ${coverage.executedActions}`);
  console.log(`  changed actions        ${coverage.changedActions}`);
  console.log(`  confirmed patterns     ${coverage.confirmedPatternInstances}`);
  console.log(`  unknown cases          ${coverage.unknownCases}`);
  console.log(
    `  coverage of changed    ${percent(coverage.patternCoverageOfChanged)} ` +
      `(${coverage.confirmedPatternInstances}/${coverage.changedActions})`,
  );
  console.log(
    `  coverage of executed   ${percent(coverage.patternCoverageOfExecuted)} ` +
      `(${coverage.confirmedPatternInstances}/${coverage.executedActions})`,
  );

  console.log("");
  console.log("Pattern types");
  printCounts(PATTERN_TYPE_ORDER, models.patterns.patternTypeSummary);

  console.log("");
  console.log("Mechanisms");
  printCounts(PATTERN_MECHANISM_ORDER, models.patterns.mechanismSummary);

  console.log("");
  console.log("Unknown reasons");
  printCounts(UNKNOWN_REASON_ORDER, models.unknowns.stats.reasonCounts);

  console.log("");
  console.log("Viewports");
  for (const viewport of models.patterns.viewportSummary) {
    console.log(
      `    ${viewport.viewport.padEnd(8)} actions ${String(viewport.actions).padStart(3)}  ` +
        `patterns ${String(viewport.patterns).padStart(3)}  unknown ${String(viewport.unknowns).padStart(3)}`,
    );
  }

  console.log("");
  console.log("Groups");
  console.log(`  pattern signature groups   ${models.patterns.groups.length}`);
  console.log(`  unknown signature groups   ${models.unknowns.stats.signatureGroups}`);
  console.log(
    `    AI eligible              ${models.unknowns.stats.aiEligibleGroups} ` +
      `(covering ${models.unknowns.stats.aiEligibleCases} cases)`,
  );
  console.log(`    AI conditional           ${models.unknowns.stats.aiConditionalGroups}`);
  console.log(`    AI excluded              ${models.unknowns.stats.aiExcludedGroups}`);
  console.log(
    `  estimated AI calls if enabled  ${models.unknowns.stats.estimatedAiCalls}`,
  );

  if (models.patterns.ruleConflicts.length > 0) {
    console.log("");
    console.log(
      `Rule conflicts: ${models.patterns.ruleConflicts.length} (equal specificity — recorded, never resolved arbitrarily)`,
    );
    for (const conflict of models.patterns.ruleConflicts) {
      console.log(
        `    ${conflict.actionId}  ${conflict.ruleIds.join(" vs ")}  (specificity ${conflict.specificity})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.explorationFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  // Kept in the caller's own form, never resolved: an absolute path leaks the
  // machine layout into a shareable artifact (the same rule Task 11 applies).
  const explorationFile = args.explorationFile;

  console.log(`[model:interactions] reading ${explorationFile}`);
  const exploration = await loadExploration(explorationFile);
  console.log(
    `[model:interactions] ${exploration.rootUrl} — ${exploration.actions.length} action artifacts validated`,
  );

  const models = buildInteractionModels({ exploration });

  const runDir = modelRunDir(exploration.rootUrl, newRunId());
  const patternsFile = await saveInteractionPatterns(runDir, models.patterns);
  const unknownsFile = await saveUnknownInteractions(runDir, models.unknowns);
  let bytes = patternsFile.bytes + unknownsFile.bytes;

  report(models);

  // --- optional AI fallback (items 55, 62) -----------------------------------
  if (args.ai) {
    console.log("");
    const resolved = resolveAnalyzer({ provider: args.aiProvider });
    console.log(`[model:interactions] ${resolved.message}`);
    if (resolved.analyzer) {
      const result = await runAiFallback({
        analyzer: resolved.analyzer,
        unknowns: models.unknowns,
        sourceUnknownInteractions: path.join(runDir, unknownsFile.relativePath),
      });
      const aiFile = await saveAiAnalysis(runDir, result.artifact);
      bytes += aiFile.bytes;
      console.log(
        `[model:interactions] AI analyzed ${result.artifact.analyzedCaseCount} representative case(s) ` +
          `standing for ${result.artifact.representedCaseCount} occurrence(s) — provenance: inferred, promoted: 0`,
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("");
  console.log(`[model:interactions] wrote ${runDir}`);
  console.log(`  interaction-patterns.json   ${formatBytes(patternsFile.bytes)}`);
  console.log(`  unknown-interactions.json   ${formatBytes(unknownsFile.bytes)}`);
  console.log(`  total                       ${formatBytes(bytes)}`);
  console.log(`  elapsed                     ${elapsedMs} ms`);
  console.log(
    "  Firecrawl 0 · Playwright 0 · network 0" + (args.ai ? "" : " · AI 0"),
  );
}

main().catch((err) => {
  if (err instanceof InteractionPatternInputError) {
    console.error(`[model:interactions] INPUT ERROR — ${err.message}`);
  } else {
    console.error(
      "[model:interactions] ERROR —",
      err instanceof Error ? err.message : err,
    );
  }
  process.exitCode = 1;
});
