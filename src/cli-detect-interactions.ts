import {
  analyzeSiteInteractions,
  CAPABILITY_ORDER,
  GUARD_FLAG_ORDER,
  type SiteInteractionAnalysis,
} from "./interaction-detector/index.js";

/**
 * web-recon Detect-Interactions CLI — Task 10 (Interaction Candidate Detection).
 *
 * Flow:
 *   site-observation.json → per-page dom.json/styles.json → deterministic
 *   interaction candidates + targets → pages/<id>/interaction-candidates.json +
 *   interaction-analysis.json (same site run directory).
 *
 * This command is **offline deterministic processing**: it never calls Firecrawl,
 * never launches Playwright, makes no network request, and runs no AI. It reads
 * only what `pnpm observe:site` already wrote — so re-analyzing a site costs 0
 * crawl and 0 browser time, and 52 pages do NOT get re-observed to answer a
 * question the stored data can already answer.
 *
 * It performs **no interaction**. Nothing is clicked, hovered, focused, typed
 * into, dragged, submitted, or navigated. The output is a list of elements a
 * later stage MAY interact with, plus the guard flags that stage should respect.
 */

interface ParsedArgs {
  siteObservationFile?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let siteObservationFile: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (siteObservationFile === undefined) {
      siteObservationFile = arg;
    }
  }
  return { siteObservationFile };
}

function printUsage(): void {
  console.log("Usage: pnpm detect:interactions <path-to-site-observation.json>");
  console.log(
    "  Offline: reads an existing site observation run and writes interaction candidates.",
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Print the non-zero entries of a count map in the canonical vocabulary order. */
function printCounts(
  order: readonly string[],
  counts: Record<string, number>,
  indent = "",
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

function printSummary(analysis: SiteInteractionAnalysis): void {
  const s = analysis.stats;
  console.log("");
  console.log("Interaction Candidate Detection");
  console.log("");
  console.log(`Analyzed pages: ${s.analyzedPages}`);
  console.log(`Skipped (failed observation): ${s.skippedFailedPages}`);
  console.log(`DOM elements analyzed: ${s.domElementsAnalyzed}`);
  console.log("");
  console.log(`Candidates: ${s.totalCandidateCount}`);
  console.log(`  desktop: ${s.desktopCandidateCount}`);
  console.log(`  mobile:  ${s.mobileCandidateCount}`);
  console.log(
    `  P1 ${s.p1Count}  P2 ${s.p2Count}  P3 ${s.p3Count}  (P3 ratio ${s.p3Ratio})`,
  );
  console.log(
    `  visible ${s.visibleCandidateCount}  hidden ${s.hiddenCandidateCount}` +
      `  operable ${s.operableCandidateCount}  non-operable ${s.nonOperableCandidateCount}`,
  );
  console.log("");
  console.log(
    `Targets: ${s.controlledTargetCount}   ` +
      `control relations: ${s.controlRelationCount} ` +
      `(resolved ${s.resolvedControlCount}, unresolved ${s.unresolvedControlCount})`,
  );
  console.log("");
  console.log("Capabilities (desktop + mobile):");
  printCounts(CAPABILITY_ORDER, analysis.capabilitySummary.total, "  ");
  console.log("");
  console.log("Guard flags (desktop + mobile):");
  printCounts(GUARD_FLAG_ORDER, analysis.guardSummary.total, "  ");

  if (analysis.validationInteractionComparisons.length > 0) {
    console.log("");
    console.log("Validation pairs (sample - representative, desktop / mobile):");
    for (const pair of analysis.validationInteractionComparisons) {
      const d = pair.desktop;
      const m = pair.mobile;
      console.log(
        `  ${pair.familyId}  ${pair.representativePageId}→${pair.samplePageId}  ` +
          `desktop ${d.representativeTotal}→${d.sampleTotal} (${d.totalDifference >= 0 ? "+" : ""}${d.totalDifference})  ` +
          `mobile ${m.representativeTotal}→${m.sampleTotal} (${m.totalDifference >= 0 ? "+" : ""}${m.totalDifference})`,
      );
    }
  }

  console.log("");
  console.log(
    `Added bytes: ${formatBytes(s.totalAddedBytes)} ` +
      `(pages ${formatBytes(s.interactionCandidatesBytes)} + manifest ${formatBytes(s.interactionAnalysisJsonBytes)})`,
  );
  console.log(`Elapsed: ${s.elapsedMs} ms`);
}

async function main(): Promise<void> {
  console.log(
    "web-recon — detect:interactions (offline deterministic interaction candidate detection)",
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

  if (!args.siteObservationFile) {
    printUsage();
    return;
  }

  try {
    const run = await analyzeSiteInteractions({
      siteObservationFile: args.siteObservationFile,
      onPageAnalyzed: (progress) => {
        const prefix = `[${progress.index}/${progress.total}] ${progress.pageId}`;
        if (progress.skippedStatus) {
          console.log(`${prefix} SKIPPED (${progress.skippedStatus}) ${progress.url}`);
          return;
        }
        const a = progress.analysis;
        if (!a) return;
        const d = a.viewports.desktop.stats;
        const m = a.viewports.mobile.stats;
        console.log(
          `${prefix} desktop ${d.candidateCount} (P1 ${d.priorityCounts.P1}) / ` +
            `mobile ${m.candidateCount} (P1 ${m.priorityCounts.P1})  ${progress.url}`,
        );
      },
    });

    printSummary(run.analysis);
    console.log("");
    console.log("Saved:");
    console.log(run.manifestPath);
    console.log(
      `${run.analysis.pages.length} page file(s) under ${run.runDir}/pages/<page-id>/interaction-candidates.json`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
