import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  loadSiteSelection,
  observeSelectedPages,
  type ObservedSitePage,
  type SiteObservation,
} from "./multi-observer/index.js";

/**
 * web-recon Observe-Site CLI — Task 09 (Multi-page Deep Observation).
 *
 * Flow:
 *   selected-pages.json → schema + provenance validation → deterministic page
 *   plan (p000001…) → ONE Chromium → the existing responsive deep observer per
 *   page → data/<host>/site-observations/<run-id>/ (manifest + pages/<id>/).
 *
 * This command NEVER calls Firecrawl and never re-runs discovery, verification,
 * or selection — it consumes only what those stages already wrote
 * ("Explore Once → Reuse Data"). It is read-only in the browser: renders and
 * reads, with an optional read-only prepare-scroll; it never clicks, types, or
 * submits. There is no AI anywhere.
 *
 * There is no resume and no cache: one run observes its whole page list and
 * records what happened. A page that fails is recorded as failed; the rest of
 * the run is unaffected.
 */

interface ParsedArgs {
  selectedPagesFile?: string;
  concurrency: number;
  prepareScroll: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let selectedPagesFile: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;
  let prepareScroll = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--concurrency") {
      concurrency = parseConcurrency(argv[++i]);
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = parseConcurrency(arg.slice("--concurrency=".length));
    } else if (arg === "--prepare-scroll") {
      prepareScroll = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (selectedPagesFile === undefined) {
      selectedPagesFile = arg;
    }
  }

  return { selectedPagesFile, concurrency, prepareScroll };
}

function parseConcurrency(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_CONCURRENCY || n > MAX_CONCURRENCY) {
    throw new Error(
      `--concurrency expects an integer ${MIN_CONCURRENCY}–${MAX_CONCURRENCY}, got: ${value ?? "(missing)"}`,
    );
  }
  return n;
}

function printUsage(): void {
  console.log(
    "Usage: pnpm observe:site <path-to-selected-pages.json> [--concurrency N] [--prepare-scroll]",
  );
  console.log(
    "  Deep-observes every selected representative (desktop AND mobile) plus a",
  );
  console.log(
    "  few validation samples, into data/<host>/site-observations/<run-id>/.",
  );
  console.log("");
  console.log("Options:");
  console.log(
    `  --concurrency N    pages observed in parallel (${MIN_CONCURRENCY}–${MAX_CONCURRENCY}, default ${DEFAULT_CONCURRENCY})`,
  );
  console.log(
    "  --prepare-scroll   Read-only auto-scroll to trigger lazy-loaded content",
  );
}

const mb = (n: number): string => `${(n / (1024 * 1024)).toFixed(2)} MB`;
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** Fixed-width status label for the per-page progress line. */
function statusLabel(page: ObservedSitePage): string {
  switch (page.status) {
    case "success":
      return "OK       ";
    case "navigation-error":
      return "NAV-ERR  ";
    case "observation-error":
      return "OBS-ERR  ";
    case "storage-error":
      return "STORE-ERR";
  }
}

function printValidationSamples(site: SiteObservation): void {
  if (site.validationSamples.length === 0) return;
  console.log("");
  console.log("Validation samples (representative vs sampled family member):");
  for (const sample of site.validationSamples) {
    console.log("");
    console.log(
      `  ${sample.familyId} (${sample.familyType}, ${sample.familyMemberCount} members)`,
    );
    console.log(`    representative ${sample.representativePageId}  ${sample.representativeUrl}`);
    console.log(`    sample         ${sample.samplePageId}  ${sample.sampleUrl}`);
    if (!sample.comparison) {
      console.log("    comparison: (unavailable — a page in this pair failed)");
      continue;
    }
    console.log(
      "      viewport   elements  visible   styles   height   assets   links",
    );
    for (const id of ["desktop", "mobile"] as const) {
      const c = sample.comparison[id];
      console.log(
        `      ${id.padEnd(9)}` +
          `${c.elementCountRatio.toFixed(2).padStart(8)}×` +
          `${c.effectiveVisibleRatio.toFixed(2).padStart(8)}×` +
          `${c.styleCountRatio.toFixed(2).padStart(8)}×` +
          `${c.documentHeightRatio.toFixed(2).padStart(8)}×` +
          `${(c.assetCountDifference >= 0 ? "+" : "") + c.assetCountDifference}`.padStart(9) +
          `${(c.linkCountDifference >= 0 ? "+" : "") + c.linkCountDifference}`.padStart(8),
      );
    }
  }
  console.log("");
  console.log(
    "  Ratios are sample/representative; differences are sample−representative.",
  );
  console.log(
    "  Measurements only — this run declares no verdict on representativeness.",
  );
}

async function main(): Promise<void> {
  console.log("web-recon — observe:site (multi-page deep observation)");
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

  if (!args.selectedPagesFile) {
    printUsage();
    return;
  }

  try {
    const input = await loadSiteSelection(args.selectedPagesFile);
    const selection = input.selection;

    console.log("Source:");
    console.log(input.sourceSelectedPagesFile);
    if (input.sourcePageFamiliesFile) console.log(input.sourcePageFamiliesFile);
    for (const skipped of input.skippedChecks) console.log(`(${skipped})`);
    console.log("");
    console.log(`Root: ${selection.rootUrl}`);
    console.log(
      `Selection: ${selection.verifiedUrlCount} verified → ${selection.familyCount} families → ${selection.selectedCount} representatives`,
    );
    console.log(`Concurrency: ${args.concurrency}`);
    if (args.prepareScroll) console.log("(prepare-scroll: ON)");
    console.log("");

    const run = await observeSelectedPages(selection, {
      concurrency: args.concurrency,
      prepareScroll: args.prepareScroll,
      sourceSelectedPagesFile: input.sourceSelectedPagesFile,
      ...(input.sourcePageFamiliesFile
        ? { sourcePageFamiliesFile: input.sourcePageFamiliesFile }
        : {}),
      onPageDone: (page, done, total) => {
        const total3 = String(total);
        const role = page.role === "validation-sample" ? " [sample]" : "";
        const detail =
          page.status === "success"
            ? `${secs(page.elapsedMs)}, ${mb(page.bytes ?? 0)}`
            : `${page.error?.name ?? "Error"}: ${page.error?.message ?? ""}`;
        console.log(
          `[${String(done).padStart(total3.length)}/${total3}] ${statusLabel(page)} ${page.pageId} ${page.url}${role} — ${detail}`,
        );
      },
    });

    const site = run.siteObservation;
    const c = site.coverage;
    const s = site.stats;

    console.log("");
    console.log(`Status: ${site.status}`);
    console.log("");
    console.log("Coverage");
    console.log(`  Verified URLs:               ${c.fullObservationPageCount}`);
    console.log(`  Families:                    ${c.familyCount}`);
    console.log(`  Representatives observed:    ${c.observedRepresentativeCount}`);
    console.log(`  Verified URLs represented:   ${c.representedVerifiedUrlCount}`);
    console.log(`  Validation samples:          ${c.validationSampleCount}`);
    console.log(`  Deep observations attempted: ${c.totalObservedPageCount}`);
    console.log(
      `  Reduction vs full observe:   ${c.observationReductionCount} (${(c.observationReductionRate * 100).toFixed(1)}%)`,
    );

    console.log("");
    console.log("Pages");
    console.log(`  Succeeded: ${s.completedPages}`);
    console.log(`  Failed:    ${s.failedPages}`);
    console.log(
      `  Viewports: ${s.desktopObservations} desktop + ${s.mobileObservations} mobile`,
    );

    if (s.failedPages > 0) {
      console.log("");
      console.log("Failures:");
      for (const page of site.pages.filter((p) => p.status !== "success")) {
        console.log(
          `  ${page.pageId} ${page.status} (${page.error?.phase}) ${page.url}`,
        );
        console.log(`    ${page.error?.name}: ${page.error?.message}`);
      }
    }

    console.log("");
    console.log("Storage");
    console.log(`  Desktop:     ${mb(s.desktopBytes)}`);
    console.log(`  Mobile:      ${mb(s.mobileBytes)}`);
    console.log(`  Screenshots: ${mb(s.screenshotBytes)}`);
    console.log(`  JSON + HTML: ${mb(s.jsonHtmlBytes)}`);
    console.log(`  Run total:   ${mb(s.totalBytes)}`);
    console.log(`  Average per observed page: ${mb(s.averageBytesPerObservedPage)}`);
    console.log("");
    console.log(`Elapsed: ${secs(s.totalElapsedMs)}`);

    printValidationSamples(site);

    console.log("");
    console.log("Saved:");
    console.log(run.manifestPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
