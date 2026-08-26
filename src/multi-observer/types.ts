import { z } from "zod";
import {
  ObservationProfileSchema,
  ResponsiveSummarySchema,
  ViewportProfileSchema,
} from "../observer/types.js";
import { PageFamilyTypeSchema } from "../selector/types.js";

/**
 * Multi-page site observation types & schemas (Task 09).
 *
 * This layer is **orchestration only**. It does not observe anything itself: it
 * reads `selected-pages.json`, decides WHICH pages to deep-observe and in WHAT
 * order, hands each URL to the existing Task 03–05 Responsive Deep Observer, and
 * binds the resulting per-page artifacts into one site-level run.
 *
 *   selected-pages.json
 *   → MultiPage Orchestrator          ← this module
 *   → existing responsive observer    ← src/observer (unchanged pipeline)
 *   → site-observation.json + pages/<page-id>/…
 *
 * There is no multi-page DOM collector, no multi-page style dedup, no
 * multi-page viewport logic. Every page directory has the exact Task 05 layout,
 * so a page observed by `pnpm observe` and a page observed by `pnpm observe:site`
 * are byte-comparable.
 *
 * Explicitly NOT here: Firecrawl, discovery, verification, selection, resume,
 * caching, retry, interaction, AI. See the Task 09 report §5, §18, §19, §47.
 *
 * Data levels:
 *  - `observed` : produced by the Observer per page (reused verbatim).
 *  - `derived`  : computed here with no AI — page ids, ordering, family
 *                 provenance, coverage arithmetic, byte totals, and the
 *                 validation-sample ratios (raw measurements only, never a
 *                 `representative=true/false` verdict; see item 26).
 */

/** Bumped when the persisted site-observation shape changes. */
export const SCHEMA_VERSION = 1 as const;

/**
 * Pages observed in parallel. Deliberately far below the Verifier's default of
 * 3: verification loads a page once and reads a few signals, while EVERY page
 * here gets a full desktop + mobile deep observation (DOM, computed styles,
 * geometry, assets, links, frames, and two full-page screenshots). Two pages in
 * flight means up to two Chromium contexts rendering concurrently against one
 * host, which is as much load as this stage should ever put on a live site.
 */
export const DEFAULT_CONCURRENCY = 2;
export const MIN_CONCURRENCY = 1;
/** Conservative ceiling for the same reason — this stage is heavy, not a crawl. */
export const MAX_CONCURRENCY = 4;

/**
 * Hard cap on extra deep observations spent per site on representative
 * validation (item 23). The whole point of Task 07/08 selection is to *avoid*
 * observing every URL; an unbounded sampling pass would give that saving back.
 * Three samples against e.g. 12 representatives is a ~25% surcharge and still
 * far below observing all 40 verified URLs.
 */
export const MAX_VALIDATION_SAMPLES_PER_SITE = 3;

/**
 * Smallest family worth sampling. A 2-member family is a weak claim to test —
 * if the representative is wrong there, only one URL is affected. Families of 3+
 * are where a single representative is actually standing in for a crowd.
 * Singletons are never sampled (they have no other member).
 */
export const MIN_VALIDATION_FAMILY_SIZE = 3;

/** Max characters of an error message kept in an artifact (item 15). */
export const ERROR_MESSAGE_MAX_LEN = 300;

/**
 * Where a page sits in the run.
 *  - `representative`   : chosen by Task 07/08 selection — the production output.
 *  - `validation-sample`: an extra, non-representative member of a family,
 *                         observed only to measure how well its representative
 *                         stands in for it (item 22/24).
 */
export const SitePageRoleSchema = z.enum(["representative", "validation-sample"]);
export type SitePageRole = z.infer<typeof SitePageRoleSchema>;

/**
 * Outcome of one page. Kept small on purpose (item 14): the useful split is
 * "the site never gave us the page" vs "our own pipeline failed", because only
 * the second kind is a bug in this engine.
 *
 *  - `success`           : both viewports observed and persisted.
 *  - `navigation-error`  : Chromium could not load the URL (timeout, DNS,
 *                          connection reset, …) — a site/network fact.
 *  - `observation-error` : the page loaded but observation failed.
 *  - `storage-error`     : observation succeeded but persisting it failed.
 */
export const SitePageStatusSchema = z.enum([
  "success",
  "navigation-error",
  "observation-error",
  "storage-error",
]);
export type SitePageStatus = z.infer<typeof SitePageStatusSchema>;

/**
 * Run outcome. A single page failure must never destroy the run (item 13), so
 * there is no run-level `failed`: the successful pages are always kept and the
 * failures are listed per page.
 */
export const SiteRunStatusSchema = z.enum(["completed", "completed-with-errors"]);
export type SiteRunStatus = z.infer<typeof SiteRunStatusSchema>;

/** Which stage of the per-page work threw. */
export const ObservationPhaseSchema = z.enum(["observe", "store"]);
export type ObservationPhase = z.infer<typeof ObservationPhaseSchema>;

/**
 * A recorded failure. Deliberately minimal (item 15): error type, a truncated
 * message, and the phase — never a stack trace, and never the error object's
 * arbitrary properties. Observation sends no cookies, auth headers, or API keys,
 * so there is nothing credential-shaped to leak into `message`; keeping it short
 * and structured is what stops that from changing quietly later.
 */
export const ObservationErrorSchema = z.object({
  /** Error constructor name, e.g. `TimeoutError`. */
  name: z.string(),
  /** First line of the message, truncated to {@link ERROR_MESSAGE_MAX_LEN}. */
  message: z.string(),
  phase: ObservationPhaseSchema,
});
export type ObservationError = z.infer<typeof ObservationErrorSchema>;

/**
 * One page in the site run. Selector provenance (`familyId` / `familyType` /
 * `familyMemberCount`) is mandatory so a reader can always answer "how many URLs
 * was this one observation standing in for?" (item 20).
 *
 * Bulk DOM data is never embedded here — only `pageObservationFile`, a path
 * RELATIVE to the site run directory (item 33) — plus the same deterministic
 * `responsiveSummary` the Observer already computes, which is small and is what
 * the validation comparison is built from (item 25).
 */
export const ObservedSitePageSchema = z.object({
  /** Deterministic `p000001…`, from a stable sort of the selection (item 8). */
  pageId: z.string(),
  url: z.string(),
  role: SitePageRoleSchema,

  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  /** Verified URLs in this family — how many URLs this page represents. */
  familyMemberCount: z.number().int().positive(),

  status: SitePageStatusSchema,

  /** Per-page timestamps: pages are observed at DIFFERENT moments (item 42). */
  startedAt: z.string(),
  completedAt: z.string(),
  elapsedMs: z.number().int().nonnegative(),

  /** e.g. `pages/p000003/observation.json` — relative, present on success. */
  pageObservationFile: z.string().optional(),
  /** Observed final URL after redirects (desktop viewport). */
  finalUrl: z.string().optional(),
  title: z.string().optional(),
  /** The Observer's own deterministic desktop/mobile figures. */
  responsiveSummary: ResponsiveSummarySchema.optional(),
  /** Every byte this page wrote (both viewports + its observation.json). */
  bytes: z.number().int().nonnegative().optional(),

  error: ObservationErrorSchema.optional(),
});
export type ObservedSitePage = z.infer<typeof ObservedSitePageSchema>;

/**
 * Deterministic comparison of one viewport between a family representative and a
 * sampled member of the same family.
 *
 * Ratios are `sample / representative` — direction is kept on purpose, because
 * "the sample is twice the representative" and "half of it" are different
 * findings. Counts that are naturally small (assets, links) are reported as a
 * signed difference instead, where a ratio would be noise.
 *
 * These are MEASUREMENTS, not a verdict (item 26). Nothing here decides whether
 * the representative was adequate; a human reads the numbers.
 */
export const ViewportComparisonSchema = z.object({
  elementCountRatio: z.number(),
  effectiveVisibleRatio: z.number(),
  styleCountRatio: z.number(),
  documentHeightRatio: z.number(),
  /** `sample - representative`, in CSS px. */
  documentWidthDifference: z.number(),
  /** `sample - representative`. */
  assetCountDifference: z.number().int(),
  /** `sample - representative`. */
  linkCountDifference: z.number().int(),
});
export type ViewportComparison = z.infer<typeof ViewportComparisonSchema>;

export const ValidationComparisonSchema = z.object({
  desktop: ViewportComparisonSchema,
  mobile: ViewportComparisonSchema,
});
export type ValidationComparison = z.infer<typeof ValidationComparisonSchema>;

/**
 * One representative ↔ sample pair (item 24). `comparison` is present only when
 * BOTH pages were observed successfully — a failed sample yields no numbers
 * rather than a fabricated one.
 */
export const ValidationSampleSchema = z.object({
  familyId: z.string(),
  familyType: PageFamilyTypeSchema,
  familyMemberCount: z.number().int().positive(),

  representativePageId: z.string(),
  samplePageId: z.string(),
  representativeUrl: z.string(),
  sampleUrl: z.string(),

  comparison: ValidationComparisonSchema.optional(),
});
export type ValidationSample = z.infer<typeof ValidationSampleSchema>;

/** What the run was configured to do (recorded for reproducibility). */
export const SiteObservationConfigSchema = z.object({
  concurrency: z.number().int().positive(),
  prepareScroll: z.boolean(),
  /** Profiles as actually applied, incl. the UA resolved from the live engine. */
  viewportProfiles: z.array(ViewportProfileSchema),
  maxValidationSamplesPerSite: z.number().int().nonnegative(),
  minValidationFamilySize: z.number().int().positive(),
});
export type SiteObservationConfig = z.infer<typeof SiteObservationConfigSchema>;

/** Task 07/08 selection figures, copied verbatim from `selected-pages.json`. */
export const SiteSelectionSummarySchema = z.object({
  verifiedUrlCount: z.number().int().nonnegative(),
  familyCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  largestFamilySize: z.number().int().nonnegative(),
  selectedAt: z.string(),
});
export type SiteSelectionSummary = z.infer<typeof SiteSelectionSummarySchema>;

/**
 * What the selection actually bought, in Deep Observation terms (items 21, 30).
 *
 * `fullObservationPageCount` is the counterfactual: deep-observing every
 * verified URL. `observationReductionRate` compares the real total (including
 * validation samples — the surcharge is not hidden) against it.
 */
export const SiteCoverageSchema = z.object({
  familyCount: z.number().int().nonnegative(),
  observedRepresentativeCount: z.number().int().nonnegative(),
  /** Verified URLs covered by the observed representatives. */
  representedVerifiedUrlCount: z.number().int().nonnegative(),
  validationSampleCount: z.number().int().nonnegative(),
  /** Representatives + validation samples actually attempted. */
  totalObservedPageCount: z.number().int().nonnegative(),

  /** Deep observations needed without any selection (= verified URL count). */
  fullObservationPageCount: z.number().int().nonnegative(),
  observationReductionCount: z.number().int(),
  /** `reductionCount / fullObservationPageCount`, 4 decimals (0 when no input). */
  observationReductionRate: z.number(),
});
export type SiteCoverage = z.infer<typeof SiteCoverageSchema>;

/** Run counts, byte totals and wall time (items 29, 38). */
export const SiteObservationStatsSchema = z.object({
  requestedPages: z.number().int().nonnegative(),
  completedPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
  desktopObservations: z.number().int().nonnegative(),
  mobileObservations: z.number().int().nonnegative(),

  desktopBytes: z.number().int().nonnegative(),
  mobileBytes: z.number().int().nonnegative(),
  /** PNG bytes only, across both viewports of every successful page. */
  screenshotBytes: z.number().int().nonnegative(),
  /** Everything persisted that is not a screenshot (JSON + rendered HTML). */
  jsonHtmlBytes: z.number().int().nonnegative(),
  /** Sum of every page directory. */
  pageBytes: z.number().int().nonnegative(),
  siteObservationJsonBytes: z.number().int().nonnegative(),
  /** Every byte of the run, including this manifest. */
  totalBytes: z.number().int().nonnegative(),
  /** `pageBytes / completedPages`, rounded (0 when nothing succeeded). */
  averageBytesPerObservedPage: z.number().int().nonnegative(),

  /** Wall clock for the whole run — NOT the sum of per-page times. */
  totalElapsedMs: z.number().int().nonnegative(),
});
export type SiteObservationStats = z.infer<typeof SiteObservationStatsSchema>;

/**
 * The site run manifest (persisted as `site-observation.json`).
 *
 * This is a *manifest*, not a dataset: no DOM, style table, asset list, or HTML
 * is embedded (item 9). It records what was asked for, what happened to each
 * page, and where each page's artifacts are.
 *
 * It deliberately does NOT claim to be an atomic snapshot of the site. Pages are
 * loaded at different moments, sequentially or in parallel, and live sites
 * change between requests (Task 08 observed exactly that), so each page carries
 * its own timestamps and the run only claims a start and an end (item 42).
 */
export const SiteObservationSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  engine: z.string(),

  rootUrl: z.string(),
  /** Provenance: the selection this run consumed (path as given to the CLI). */
  sourceSelectedPagesFile: z.string(),
  /** Sibling family file, when present — used for membership cross-checks. */
  sourcePageFamiliesFile: z.string().optional(),

  startedAt: z.string(),
  completedAt: z.string(),
  status: SiteRunStatusSchema,

  config: SiteObservationConfigSchema,
  /** Browser-context profile shared by every page and viewport (Task 05). */
  observationProfile: ObservationProfileSchema,

  selection: SiteSelectionSummarySchema,
  coverage: SiteCoverageSchema,
  stats: SiteObservationStatsSchema,

  /** Sorted by `pageId` — stable regardless of completion order (item 17). */
  pages: z.array(ObservedSitePageSchema),
  /** Sorted by `familyId`. */
  validationSamples: z.array(ValidationSampleSchema),
});
export type SiteObservation = z.infer<typeof SiteObservationSchema>;
