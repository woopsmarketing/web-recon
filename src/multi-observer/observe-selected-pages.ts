import { chromium, type Browser } from "playwright";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
  makeRunId,
  observePageWithBrowser,
  resolveViewportProfiles,
  type ObservationProfile,
  type PageObservation,
  type ViewportResponsiveSummary,
} from "../observer/index.js";
import type { PageSelection } from "../selector/types.js";
import {
  DEFAULT_CONCURRENCY,
  ERROR_MESSAGE_MAX_LEN,
  MAX_VALIDATION_SAMPLES_PER_SITE,
  MIN_VALIDATION_FAMILY_SIZE,
  SCHEMA_VERSION,
  type ObservationError,
  type ObservationPhase,
  type ObservedSitePage,
  type SiteCoverage,
  type SiteObservation,
  type SiteObservationStats,
  type SitePageStatus,
  type ValidationComparison,
  type ValidationSample,
  type ViewportComparison,
} from "./types.js";
import { planSitePages, type PlannedPage, type SitePagePlan } from "./plan-pages.js";
import {
  saveSiteObservation,
  saveSitePage,
  siteRunDir,
  type SavedSiteObservation,
} from "./store.js";

/**
 * Multi-page Deep Observation orchestrator (Task 09).
 *
 * Its whole job is scheduling and bookkeeping:
 *
 *   selected-pages.json (already validated)
 *   → deterministic page plan (ids, order, validation samples)
 *   → ONE Chromium process
 *   → for each page: the existing responsive deep observer
 *   → per-page artifacts + one site manifest
 *
 * What it does NOT do: observe. Every page goes through
 * {@link observePageWithBrowser}, the same primitive `pnpm observe` calls — no
 * DOM collector, style dedup, asset collector, viewport logic, or mobile profile
 * is reimplemented here (item 10). If the observation of a page differs between
 * single-page and site runs, that is a bug, not a feature.
 *
 * It also never discovers, verifies, or re-selects anything (item 5), and it has
 * no resume, cache, skip-already-observed, or retry (items 18, 19, 44): a run
 * observes what it was asked to, records exactly what happened, and stops.
 */

const ENGINE = "playwright-chromium";

export interface ObserveSiteOptions {
  /** Pages observed in parallel (default {@link DEFAULT_CONCURRENCY}). */
  concurrency?: number;
  /** Read-only preparation auto-scroll, applied identically to every page. */
  prepareScroll?: boolean;
  /** Provenance recorded in the manifest. */
  sourceSelectedPagesFile: string;
  sourcePageFamiliesFile?: string;
  maxValidationSamples?: number;
  minValidationFamilySize?: number;
  /** Progress hooks for the CLI. */
  onLog?: (message: string) => void;
  onPageStart?: (page: PlannedPage, index: number, total: number) => void;
  onPageDone?: (page: ObservedSitePage, done: number, total: number) => void;
  /** Inject a browser (used by the fixture smoke test); default launches Chromium. */
  browser?: Browser;
  /** Override the run id (used by tests for a deterministic directory). */
  runId?: string;
  /** Override the run directory entirely (used by tests to write to a temp dir). */
  runDir?: string;
}

/**
 * Run `worker` over `items` with at most `limit` in flight, dispatching in index
 * order. Same simple pool the Verifier uses (item 16): a fixed set of runners
 * pulling from one cursor. Results come back in the ORIGINAL order, so the
 * manifest ordering never depends on which page happened to finish first.
 */
async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners: Promise<void>[] = [];
  const n = Math.min(limit, items.length);
  for (let w = 0; w < n; w++) {
    runners.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) break;
          results[i] = await worker(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

/** First line of an error message, length-capped (item 15). */
function shortMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n", 1)[0].trim();
  return firstLine.length > ERROR_MESSAGE_MAX_LEN
    ? `${firstLine.slice(0, ERROR_MESSAGE_MAX_LEN)}…`
    : firstLine;
}

/**
 * Classify a page failure (item 14). The distinction that matters is "the site
 * never gave us the page" versus "our pipeline broke", because only the second
 * is a defect in this engine — so navigation failures are separated by the
 * signatures Playwright actually produces (`page.goto` timeouts, Chromium
 * `net::ERR_*` codes, and its DNS/connection wording). Anything else is reported
 * as an observation error rather than being optimistically excused as a network
 * blip. The raw name and message are stored either way, so a misclassification
 * is visible instead of hidden.
 */
function classifyObservationError(err: unknown, phase: ObservationPhase): SitePageStatus {
  if (phase === "store") return "storage-error";
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const navigationSignatures = [
    "net::ERR_",
    "page.goto",
    "NS_ERROR_",
    "ERR_CONNECTION",
    "Navigation failed",
    "frame was detached",
  ];
  if (navigationSignatures.some((s) => message.includes(s))) {
    return "navigation-error";
  }
  if (name === "TimeoutError" && message.includes("goto")) return "navigation-error";
  return "observation-error";
}

function toObservationError(
  err: unknown,
  phase: ObservationPhase,
): ObservationError {
  return {
    name: err instanceof Error ? err.name : typeof err,
    message: shortMessage(err),
    phase,
  };
}

/** Ratio rounded to 3 decimals; `0` when the denominator is 0 (no fake infinity). */
function ratio(sample: number, representative: number): number {
  if (representative === 0) return 0;
  return Math.round((sample / representative) * 1000) / 1000;
}

function compareViewport(
  representative: ViewportResponsiveSummary,
  sample: ViewportResponsiveSummary,
): ViewportComparison {
  return {
    elementCountRatio: ratio(sample.elementCount, representative.elementCount),
    effectiveVisibleRatio: ratio(
      sample.effectiveVisibleCount,
      representative.effectiveVisibleCount,
    ),
    styleCountRatio: ratio(
      sample.uniqueStyleCount,
      representative.uniqueStyleCount,
    ),
    documentHeightRatio: ratio(
      sample.documentHeight,
      representative.documentHeight,
    ),
    documentWidthDifference:
      sample.documentWidth - representative.documentWidth,
    assetCountDifference: sample.assetCount - representative.assetCount,
    linkCountDifference: sample.linkCount - representative.linkCount,
  };
}

/**
 * Deterministic representative ↔ sample comparison (items 25–26).
 *
 * Only figures the Observer already computed are used — no new measurement, no
 * screenshot comparison, no visual diff, no AI. And no verdict: this returns
 * numbers, never `representative: true/false`. Whether a 1.4× element ratio
 * means the family is too broad is a judgement for the report, made by a human
 * looking at real data.
 */
function compareObservations(
  representative: PageObservation,
  sample: PageObservation,
): ValidationComparison {
  return {
    desktop: compareViewport(
      representative.responsiveSummary.desktop,
      sample.responsiveSummary.desktop,
    ),
    mobile: compareViewport(
      representative.responsiveSummary.mobile,
      sample.responsiveSummary.mobile,
    ),
  };
}

export interface SiteObservationRun extends SavedSiteObservation {
  runId: string;
  dir: string;
  plan: SitePagePlan;
}

/**
 * Observe every selected page of one site.
 *
 * **Browser lifecycle (item 11).** One Chromium process is launched for the
 * whole run and reused across pages; each page still gets fresh
 * `BrowserContext`s (one per viewport) from the Observer, so page A's cookies,
 * localStorage, or sessionStorage can never influence page B (item 12).
 *
 * **Failure isolation (item 13).** A page that fails is recorded as a failed
 * page and the run continues; the artifacts of every successful page are kept.
 * The only errors that abort a run are the ones that make the whole output
 * meaningless — invalid input (rejected before this function is called) and page
 * plan invariant violations (id collisions).
 */
export async function observeSelectedPages(
  selection: PageSelection,
  options: ObserveSiteOptions,
): Promise<SiteObservationRun> {
  const log = options.onLog ?? (() => {});
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const prepareScroll = options.prepareScroll ?? false;
  const maxValidationSamples =
    options.maxValidationSamples ?? MAX_VALIDATION_SAMPLES_PER_SITE;
  const minValidationFamilySize =
    options.minValidationFamilySize ?? MIN_VALIDATION_FAMILY_SIZE;

  // Plan BEFORE launching anything: an invariant violation here must cost zero
  // browser time.
  const plan = planSitePages(selection, {
    maxValidationSamples,
    minValidationFamilySize,
  });

  const runId = options.runId ?? makeRunId();
  const dir = options.runDir ?? siteRunDir(selection.rootUrl, runId);

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const browser = options.browser ?? (await chromium.launch());
  const ownsBrowser = !options.browser;

  const observedPages: ObservedSitePage[] = [];
  const observationByPageId = new Map<string, PageObservation>();

  try {
    const viewportProfiles = resolveViewportProfiles(browser);

    let done = 0;
    const results = await runPool(plan.pages, concurrency, async (page, index) => {
      options.onPageStart?.(page, index, plan.pages.length);
      const pageStartedAt = new Date().toISOString();
      const pageStartedMs = Date.now();

      let status: SitePageStatus = "success";
      let error: ObservationError | undefined;
      let observation: PageObservation | undefined;
      let relativePath: string | undefined;

      try {
        const observed = await observePageWithBrowser(browser, page.url, {
          prepareScroll,
          onLog: (msg) => log(`[${page.pageId}] ${msg}`),
        });
        try {
          const saved = await saveSitePage(dir, page.pageId, observed);
          observation = saved.observation;
          relativePath = saved.relativePath;
        } catch (err) {
          status = classifyObservationError(err, "store");
          error = toObservationError(err, "store");
        }
      } catch (err) {
        status = classifyObservationError(err, "observe");
        error = toObservationError(err, "observe");
      }

      const entry: ObservedSitePage = {
        pageId: page.pageId,
        url: page.url,
        role: page.role,
        familyId: page.familyId,
        familyType: page.familyType,
        familyMemberCount: page.familyMemberCount,
        status,
        startedAt: pageStartedAt,
        completedAt: new Date().toISOString(),
        elapsedMs: Date.now() - pageStartedMs,
        ...(relativePath ? { pageObservationFile: relativePath } : {}),
        ...(observation
          ? {
              finalUrl: observation.target.finalUrl,
              title: observation.target.title,
              responsiveSummary: observation.responsiveSummary,
              bytes: observation.sizes.runTotalBytes,
            }
          : {}),
        ...(error ? { error } : {}),
      };

      if (observation) observationByPageId.set(page.pageId, observation);
      done++;
      options.onPageDone?.(entry, done, plan.pages.length);
      return entry;
    });

    observedPages.push(...results);

    // --- validation comparisons (only where both sides really succeeded) ----
    const validationSamples: ValidationSample[] = plan.validationSamples.map(
      (sample) => {
        const representative = observationByPageId.get(sample.representativePageId);
        const sampled = observationByPageId.get(sample.samplePageId);
        return {
          familyId: sample.familyId,
          familyType: sample.familyType,
          familyMemberCount: sample.familyMemberCount,
          representativePageId: sample.representativePageId,
          samplePageId: sample.samplePageId,
          representativeUrl: sample.representativeUrl,
          sampleUrl: sample.sampleUrl,
          ...(representative && sampled
            ? { comparison: compareObservations(representative, sampled) }
            : {}),
        };
      },
    );

    // --- deterministic ordering, independent of completion order (item 17) --
    const pages = [...observedPages].sort((a, b) =>
      a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0,
    );
    validationSamples.sort((a, b) =>
      a.familyId < b.familyId ? -1 : a.familyId > b.familyId ? 1 : 0,
    );

    const successful = pages.filter((p) => p.status === "success");
    const representatives = pages.filter((p) => p.role === "representative");
    const successfulRepresentatives = representatives.filter(
      (p) => p.status === "success",
    );

    // Only representatives that were actually observed can be claimed as
    // coverage: a failed representative represents nothing on disk.
    const representedVerifiedUrlCount = successfulRepresentatives.reduce(
      (sum, p) => sum + p.familyMemberCount,
      0,
    );

    const fullObservationPageCount = selection.verifiedUrlCount;
    const totalObservedPageCount = pages.length;
    const observationReductionCount =
      fullObservationPageCount - totalObservedPageCount;
    const coverage: SiteCoverage = {
      familyCount: selection.familyCount,
      observedRepresentativeCount: successfulRepresentatives.length,
      representedVerifiedUrlCount,
      validationSampleCount: validationSamples.length,
      totalObservedPageCount,
      fullObservationPageCount,
      observationReductionCount,
      observationReductionRate:
        fullObservationPageCount > 0
          ? Math.round(
              (observationReductionCount / fullObservationPageCount) * 10000,
            ) / 10000
          : 0,
    };

    // --- byte accounting (item 29), summed from what was actually written ---
    let desktopBytes = 0;
    let mobileBytes = 0;
    let screenshotBytes = 0;
    let pageBytes = 0;
    for (const page of successful) {
      const observation = observationByPageId.get(page.pageId);
      if (!observation) continue;
      desktopBytes += observation.viewports.desktop.sizes.viewportTotalBytes;
      mobileBytes += observation.viewports.mobile.sizes.viewportTotalBytes;
      screenshotBytes +=
        observation.viewports.desktop.sizes.screenshotBytes +
        observation.viewports.mobile.sizes.screenshotBytes;
      pageBytes += observation.sizes.runTotalBytes;
    }

    const stats: SiteObservationStats = {
      requestedPages: pages.length,
      completedPages: successful.length,
      failedPages: pages.length - successful.length,
      desktopObservations: successful.length,
      mobileObservations: successful.length,
      desktopBytes,
      mobileBytes,
      screenshotBytes,
      jsonHtmlBytes: pageBytes - screenshotBytes,
      pageBytes,
      // Filled in by the store's fixpoint (they describe the manifest itself).
      siteObservationJsonBytes: 0,
      totalBytes: pageBytes,
      averageBytesPerObservedPage:
        successful.length > 0 ? Math.round(pageBytes / successful.length) : 0,
      totalElapsedMs: Date.now() - startedMs,
    };

    const observationProfile: ObservationProfile = {
      locale: OBSERVATION_LOCALE,
      timezone: OBSERVATION_TIMEZONE,
      colorScheme: OBSERVATION_COLOR_SCHEME,
      reducedMotion: OBSERVATION_REDUCED_MOTION,
    };

    const manifest: SiteObservation = {
      schemaVersion: SCHEMA_VERSION,
      engine: ENGINE,
      rootUrl: selection.rootUrl,
      sourceSelectedPagesFile: options.sourceSelectedPagesFile,
      ...(options.sourcePageFamiliesFile
        ? { sourcePageFamiliesFile: options.sourcePageFamiliesFile }
        : {}),
      startedAt,
      completedAt: new Date().toISOString(),
      status: stats.failedPages > 0 ? "completed-with-errors" : "completed",
      config: {
        concurrency,
        prepareScroll,
        viewportProfiles,
        maxValidationSamplesPerSite: maxValidationSamples,
        minValidationFamilySize,
      },
      observationProfile,
      selection: {
        verifiedUrlCount: selection.verifiedUrlCount,
        familyCount: selection.familyCount,
        selectedCount: selection.selectedCount,
        largestFamilySize: selection.largestFamilySize,
        selectedAt: selection.selectedAt,
      },
      coverage,
      stats,
      pages,
      validationSamples,
    };

    const saved = await saveSiteObservation(dir, manifest);
    return { ...saved, runId, dir, plan };
  } finally {
    if (ownsBrowser) await browser.close();
  }
}
