import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  loadSiteSelection,
  observeSelectedPages,
  type ObservedSitePage,
  type SiteObservation,
} from "./multi-observer/index.js";
import {
  LAYOUT_PROBE_WIDTHS,
  MOBILE_LAYOUT_PROBE_WIDTHS,
  PAGE_STATE_EVIDENCE_ROOT_DEFAULT,
} from "./observer/types.js";
import { parseProbeWidths, resolveProbeWidths } from "./observer/layout-probe.js";

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
 * ("Explore Once → Reuse Data"). In the browser it renders and reads, with an
 * optional read-only prepare-scroll, plus (Task 28.7 A2) the bounded,
 * evidence-gated page-state normalization phase that may dismiss an entry popup
 * before collection — default ON, `--no-normalize-page-state` opts out.
 * COLLECTION itself stays strictly read-only: it never types or submits. There
 * is no AI anywhere.
 *
 * There is no resume and no cache: one run observes its whole page list and
 * records what happened. A page that fails is recorded as failed; the rest of
 * the run is unaffected.
 */

interface ParsedArgs {
  selectedPagesFile?: string;
  concurrency: number;
  prepareScroll: boolean;
  /** Task 28.7 A2 — bounded page-state normalization (default ON). */
  normalizePageState: boolean;
  /**
   * Task 28.75 — where dismissal evidence is written. The DEFAULT
   * ({@link PAGE_STATE_EVIDENCE_ROOT_DEFAULT}) is wave-neutral and outside
   * `docs/result/`, so a run can never write into a frozen wave's artifacts.
   */
  pageStateEvidenceRoot?: string;
  /** Task 28.6 W1.3 — extra layout-probe widths, applied to every page. */
  probeWidths?: number[];
  /** Extra widths for the MOBILE-context probe pass (Task 28.6 W1.4). */
  probeWidthsMobile?: number[];
  /** Task 28.8 FAST — cap the validation samples per site (default: MAX_VALIDATION_SAMPLES_PER_SITE). */
  maxValidationSamples?: number;
  /** Source Preservation V2 Phase 1 — capture a Source Package per viewport load (default OFF). */
  sourcePackage: boolean;
  /** Within a Source Package capture, capture JSON response bodies (default ON; --no-source-package-json opts out). */
  sourcePackageJson: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let selectedPagesFile: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;
  // Task 28.6 W8 RC2 — ON by default; --no-prepare-scroll opts out.
  let prepareScroll = true;
  // Task 28.7 A2 — ON by default; --no-normalize-page-state opts out.
  let normalizePageState = true;
  let sourcePackage = false;
  let sourcePackageJson = true;
  let pageStateEvidenceRoot: string | undefined;
  let probeWidths: number[] | undefined;
  let probeWidthsMobile: number[] | undefined;
  let maxValidationSamples: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--concurrency") {
      concurrency = parseConcurrency(argv[++i]);
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = parseConcurrency(arg.slice("--concurrency=".length));
    } else if (arg === "--prepare-scroll") {
      prepareScroll = true;
    } else if (arg === "--no-prepare-scroll") {
      prepareScroll = false;
    } else if (arg === "--normalize-page-state") {
      normalizePageState = true;
    } else if (arg === "--no-normalize-page-state") {
      normalizePageState = false;
    } else if (arg === "--page-state-evidence-root") {
      pageStateEvidenceRoot = argv[++i];
    } else if (arg.startsWith("--page-state-evidence-root=")) {
      pageStateEvidenceRoot = arg.slice("--page-state-evidence-root=".length);
    } else if (arg === "--probe-widths") {
      probeWidths = parseProbeWidths(argv[++i]);
    } else if (arg.startsWith("--probe-widths=")) {
      probeWidths = parseProbeWidths(arg.slice("--probe-widths=".length));
    } else if (arg === "--probe-widths-mobile") {
      probeWidthsMobile = parseProbeWidths(argv[++i]);
    } else if (arg.startsWith("--probe-widths-mobile=")) {
      probeWidthsMobile = parseProbeWidths(arg.slice("--probe-widths-mobile=".length));
    } else if (arg === "--source-package") {
      sourcePackage = true;
    } else if (arg === "--no-source-package") {
      sourcePackage = false;
    } else if (arg === "--source-package-json") {
      sourcePackageJson = true;
    } else if (arg === "--no-source-package-json") {
      sourcePackageJson = false;
    } else if (arg === "--max-validation-samples") {
      maxValidationSamples = parseMaxValidationSamples(argv[++i]);
    } else if (arg.startsWith("--max-validation-samples=")) {
      maxValidationSamples = parseMaxValidationSamples(arg.slice("--max-validation-samples=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (selectedPagesFile === undefined) {
      selectedPagesFile = arg;
    }
  }

  return {
    selectedPagesFile,
    concurrency,
    prepareScroll,
    normalizePageState,
    ...(pageStateEvidenceRoot ? { pageStateEvidenceRoot } : {}),
    ...(probeWidths ? { probeWidths } : {}),
    ...(probeWidthsMobile ? { probeWidthsMobile } : {}),
    ...(maxValidationSamples !== undefined ? { maxValidationSamples } : {}),
    sourcePackage,
    sourcePackageJson,
  };
}

function parseMaxValidationSamples(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--max-validation-samples expects a non-negative integer, got ${value}`);
  }
  return n;
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
    "Usage: pnpm observe:site <path-to-selected-pages.json> [--concurrency N] [--source-package] " +
      "[--prepare-scroll] [--no-normalize-page-state]",
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
  console.log(
    `  --page-state-evidence-root=DIR  where dismissal evidence is written` +
      ` (default ${PAGE_STATE_EVIDENCE_ROOT_DEFAULT})`,
  );
  console.log(
    "  --no-normalize-page-state       do NOT dismiss entry popups before " +
      "collection (observe every page WITH its popup; recorded per page)",
  );
  console.log(
    `  --probe-widths=700,1100         extra layout-probe widths (desktop context;` +
      ` defaults ${LAYOUT_PROBE_WIDTHS.join(",")})`,
  );
  console.log(
    `  --probe-widths-mobile=430,600   extra widths for the mobile-context probe` +
      ` (defaults ${MOBILE_LAYOUT_PROBE_WIDTHS.join(",")})`,
  );
  console.log(
    "  --no-source-package-json        with --source-package, do NOT capture" +
      " JSON response bodies (captured by default when --source-package is on)",
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
    // Task 28.6 C3 D1 — the FLOOR set. The set actually probed is derived per
    // page from that page's own authored breakpoints, so it varies across the
    // run; each page's `layout-probe.json` carries its widths and why.
    console.log(
      `Probe widths (floor): ${resolveProbeWidths(LAYOUT_PROBE_WIDTHS, args.probeWidths ?? []).join(", ")}` +
        ` | mobile ${resolveProbeWidths(MOBILE_LAYOUT_PROBE_WIDTHS, args.probeWidthsMobile ?? []).join(", ")}`,
    );
    if (args.prepareScroll) console.log("(prepare-scroll: ON)");
    console.log(
      `(page-state normalization: ${args.normalizePageState ? "ON" : "OFF"}` +
        `${
          args.normalizePageState
            ? `, evidence → ${args.pageStateEvidenceRoot ?? PAGE_STATE_EVIDENCE_ROOT_DEFAULT}`
            : ""
        })`,
    );
    console.log("");

    const run = await observeSelectedPages(selection, {
      concurrency: args.concurrency,
      prepareScroll: args.prepareScroll,
      normalizePageState: args.normalizePageState,
      ...(args.sourcePackage
        ? { sourcePackage: args.sourcePackageJson ? true : { bodyPolicy: { json: false } } }
        : {}),
      ...(args.pageStateEvidenceRoot
        ? { pageStateEvidenceRoot: args.pageStateEvidenceRoot }
        : {}),
      ...(args.probeWidths ? { probeExtraWidths: args.probeWidths } : {}),
      ...(args.probeWidthsMobile
        ? { mobileProbeExtraWidths: args.probeWidthsMobile }
        : {}),
      ...(args.maxValidationSamples !== undefined
        ? { maxValidationSamples: args.maxValidationSamples }
        : {}),
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
