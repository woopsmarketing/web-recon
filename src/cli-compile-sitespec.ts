import {
  assertSiteSpecValid,
  compileSiteSpec,
  loadInputs,
  loadSiteSpec,
  saveSiteSpec,
  siteSpecRunDir,
  SiteSpecInputError,
  SiteSpecValidationError,
  summarizeSiteSpec,
  type SiteSpecSummary,
} from "./sitespec/index.js";

/**
 * web-recon Compile-SiteSpec CLI — Task 13 (SiteSpec Compiler).
 *
 * Flow:
 *   interaction-patterns.json (Task 12, immutable)
 *     → provenance chain back to Task 11 / 09 / 08 / 07 / 06
 *     → content recovery from each viewport's rendered.html
 *     → data/<host>/site-specs/<run-id>/
 *          site-spec.json + style-catalog + asset-catalog + interaction-spec + pages/
 *
 * The run is **completely offline**: 0 Firecrawl calls, 0 Playwright launches, 0
 * network requests, 0 AI calls. It visits no site, downloads no asset, and never
 * writes into any run it reads.
 *
 * `--ai-analysis` is the single opt-in door for `inferred` data (item 5). Task 12
 * validation writes `provider: "fake"` artifacts next to the two files this CLI
 * consumes by default, so nothing AI-shaped is ever picked up implicitly — a
 * production SiteSpec cannot absorb an invented behavior by accident.
 */

interface ParsedArgs {
  patternsFile?: string;
  aiAnalysisFile?: string;
  siteObservationFile?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--ai-analysis") {
      const value = argv[++i];
      if (!value) throw new Error("--ai-analysis requires a path");
      args.aiAnalysisFile = value;
    } else if (arg.startsWith("--ai-analysis=")) {
      args.aiAnalysisFile = arg.slice("--ai-analysis=".length);
    } else if (arg === "--site-observation") {
      const value = argv[++i];
      if (!value) throw new Error("--site-observation requires a path");
      args.siteObservationFile = value;
    } else if (arg.startsWith("--site-observation=")) {
      args.siteObservationFile = arg.slice("--site-observation=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (args.patternsFile === undefined) {
      args.patternsFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(
    "Usage: pnpm compile:sitespec <path-to-interaction-patterns.json> [--ai-analysis <path>] [--site-observation <path>]",
  );
  console.log(
    "  Offline: follows the Task 12 → 11 → 09 → 08/07 → 06 provenance chain and compiles",
  );
  console.log(
    "  one self-contained reconstruction IR. No browser, no network, no asset download.",
  );
  console.log(
    "  --ai-analysis is the ONLY way inferred data enters; it never merges with verified patterns.",
  );
  console.log(
    "  --site-observation overrides the recorded Task 09 path when the run tree was moved.",
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printCounts(counts: Record<string, number>, indent = "    "): void {
  const keys = Object.keys(counts);
  if (keys.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  const width = Math.max(...keys.map((key) => key.length));
  for (const key of keys) {
    console.log(`${indent}${key.padEnd(width)}  ${counts[key]}`);
  }
}

function report(summary: SiteSpecSummary): void {
  console.log("");
  console.log("Routes (every verified URL, never just the observed ones)");
  console.log(`  verified routes            ${summary.routes.total}`);
  console.log(`  route coverage             ${percent(summary.routes.routeCoverage)}`);
  console.log(`  exact observation coverage ${percent(summary.routes.exactObservationCoverage)}`);
  console.log(`    representative observed  ${summary.routes.exactObserved}`);
  console.log(`    validation observed      ${summary.routes.validationSampleObserved}`);
  console.log(`    family-represented only  ${summary.routes.familyRepresented}`);

  console.log("");
  console.log("Pages");
  console.log(`  page specs                 ${summary.pages.total}`);
  console.log(`    representative           ${summary.pages.representative}`);
  console.log(`    validation sample        ${summary.pages.validationSample}`);
  console.log(`  interaction explored       ${summary.pages.explored}`);
  console.log(`  interaction not explored   ${summary.pages.notExplored}`);

  console.log("");
  console.log("Content recovery");
  console.log(
    `  viewports aligned/fallback ${summary.content.aligned}/${summary.content.fallback} ` +
      `(of ${summary.content.viewports})`,
  );
  console.log(
    `  element nodes  desktop ${summary.content.desktopElementNodes}  mobile ${summary.content.mobileElementNodes}`,
  );
  console.log(
    `  text nodes     desktop ${summary.content.desktopTextNodes}  mobile ${summary.content.mobileTextNodes}`,
  );
  console.log(
    `  observer 200-char caps hit ${summary.content.cappedSourceTexts}, recovered in full ${summary.content.recoveredLongTexts}`,
  );
  console.log(`  longest recovered text     ${summary.content.longestTextLength} chars`);

  console.log("");
  console.log("Style catalog");
  console.log(`  source local records       ${summary.styles.sourceLocalRecords}`);
  console.log(`  global style tokens        ${summary.styles.globalTokens}`);
  console.log(`  dedup reduction            ${percent(summary.styles.dedupReductionRate)}`);
  console.log(`  nodes with a style token   ${summary.styles.nodesWithStyleToken}`);

  console.log("");
  console.log("Asset catalog");
  console.log(`  occurrences → unique       ${summary.assets.occurrences} → ${summary.assets.unique}`);
  console.log(`  inline SVGs sanitized      ${summary.assets.inlineSvgSanitized}`);
  printCounts(summary.assets.kindCounts);

  console.log("");
  console.log("Interactions");
  console.log(`  verified patterns          ${summary.interactions.patterns}`);
  console.log(`  unknown interactions       ${summary.interactions.unknowns}`);
  console.log(`  inferred (AI)              ${summary.interactions.inferred}`);
  console.log(`  triggers resolved          ${summary.interactions.staticTriggers}`);
  console.log(`  static targets             ${summary.interactions.staticTargets}`);
  console.log(`  dynamic targets            ${summary.interactions.dynamicTargets}`);
  console.log(`  no declared target         ${summary.interactions.withoutTarget}`);
  console.log("  pattern types");
  printCounts(summary.interactions.patternTypeCounts, "      ");
  console.log("  unknown reasons");
  printCounts(summary.interactions.unknownReasonCounts, "      ");
  console.log(
    `  routes: exact behavior ${summary.interactions.routesExactBehavior} · ` +
      `represented ${summary.interactions.routesRepresentedBehavior} · ` +
      `none ${summary.interactions.routesNoBehavior}`,
  );

  if (summary.frames > 0 || summary.shadowHosts > 0) {
    console.log("");
    console.log(
      `Inventory only: ${summary.frames} iframe(s), ${summary.shadowHosts} open shadow host(s) — contents never observed`,
    );
  }
}

/** A run id for the OUTPUT directory only — never inside a deterministic file. */
function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.patternsFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();

  console.log(`[compile:sitespec] reading ${args.patternsFile}`);
  const inputs = await loadInputs({
    patternsFile: args.patternsFile,
    ...(args.siteObservationFile ? { siteObservationFile: args.siteObservationFile } : {}),
    ...(args.aiAnalysisFile ? { aiAnalysisFile: args.aiAnalysisFile } : {}),
  });
  const successfulPages = inputs.siteObservation.pages.filter(
    (page) => page.status === "success",
  );
  console.log(
    `[compile:sitespec] ${inputs.rootUrl} — ${inputs.verifiedUrls.urls.length} verified URLs, ` +
      `${inputs.pageFamilies.families.length} families, ${successfulPages.length} observed pages, ` +
      `${inputs.patterns.patterns.length} patterns, ${inputs.unknowns.cases.length} unknowns`,
  );
  if (inputs.aiAnalysis) {
    console.log(
      `[compile:sitespec] --ai-analysis: ${inputs.aiAnalysis.analyses.length} inferred analysis(es) ` +
        `from provider "${inputs.aiAnalysis.provider}" — kept in inferredInteractions[], never merged`,
    );
  }

  const compiled = await compileSiteSpec(inputs);

  assertSiteSpecValid(compiled, {
    expectedVerifiedUrls: inputs.verifiedUrls.urls.map((entry) => entry.url),
    expectedPageIds: successfulPages.map((page) => page.pageId),
    expectedPatternIds: inputs.patterns.patterns.map((pattern) => pattern.id),
    expectedUnknownIds: inputs.unknowns.cases.map((unknown) => unknown.id),
  });

  const runDir = siteSpecRunDir(inputs.rootUrl, newRunId());
  const saved = await saveSiteSpec(runDir, compiled);

  // Read it back through the CONSUMER path and validate again (item 98): if the
  // artifact a renderer will open does not satisfy the same invariants the
  // compiler just checked in memory, that has to fail here and not in Task 14.
  const reloaded = await loadSiteSpec(saved.siteSpecPath);

  report(summarizeSiteSpec(reloaded));

  const elapsedMs = Date.now() - startedAt;
  console.log("");
  console.log(`[compile:sitespec] wrote ${saved.runDir}`);
  console.log(`  site-spec.json             ${formatBytes(saved.bytes.siteSpec)}`);
  console.log(`  style-catalog.json         ${formatBytes(saved.bytes.styleCatalog)}`);
  console.log(`  asset-catalog.json         ${formatBytes(saved.bytes.assetCatalog)}`);
  console.log(`  interaction-spec.json      ${formatBytes(saved.bytes.interactionSpec)}`);
  console.log(
    `  pages/ (${String(saved.pageFileCount).padStart(3)} files)        ${formatBytes(saved.bytes.pages)}`,
  );
  console.log(`  total                      ${formatBytes(saved.bytes.total)}`);
  console.log(`  elapsed                    ${elapsedMs} ms`);
  console.log("  round-trip validation      PASS (loadSiteSpec read the SiteSpec root only)");
  console.log(
    "  Firecrawl 0 · Playwright 0 · network 0 · asset downloads 0" +
      (inputs.aiAnalysis ? "" : " · AI 0"),
  );
}

main().catch((err) => {
  if (err instanceof SiteSpecInputError) {
    console.error(`[compile:sitespec] INPUT ERROR — ${err.message}`);
  } else if (err instanceof SiteSpecValidationError) {
    console.error(`[compile:sitespec] INVARIANT FAILURE — ${err.message}`);
  } else {
    console.error(
      "[compile:sitespec] ERROR —",
      err instanceof Error ? err.message : err,
    );
  }
  process.exitCode = 1;
});
