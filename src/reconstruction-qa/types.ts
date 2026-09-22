import { z } from "zod";
import { ViewportProfileSchema } from "../observer/types.js";

/**
 * Reconstruction QA & Automated Correction Loop — types (Task 15).
 *
 * Task 14 produced a clone. This layer answers two questions that a screenshot
 * comparison alone cannot, and keeps them strictly apart:
 *
 *   > how different is the clone?      →  raw per-dimension metrics
 *   > WHY is it different?             →  a classified, evidenced root cause
 *
 * The central design constraint is that a pixel difference is not a root cause
 * (item 1). A font that failed to bind changes text width, which changes
 * wrapping, which changes container height, which moves three hundred elements.
 * Counting those as three hundred defects would be arithmetically true and
 * diagnostically worthless, so diff COLLECTION and causal CLASSIFICATION are two
 * separate passes with two separate vocabularies.
 *
 * ## Three truth sources, never merged (items 2–4)
 *
 *   S  Saved Snapshot   Task 09 observation + Task 13/13.1 SiteSpec.
 *                       This is the reconstruction CONTRACT: what the clone was
 *                       built to reproduce.
 *   O  Live Original    the public site re-observed NOW, in the Task 05
 *                       environment. Its job is drift detection, interaction
 *                       after-state observation and canary — never to redefine
 *                       the contract.
 *   C  Current Clone    the Task 14 generated app, served locally.
 *
 * A clone that matches S but differs from O is source drift, not a defect
 * (item 3), and Task 15 is forbidden from quietly reshaping a past SiteSpec to
 * match today's site (item 4).
 *
 * ## What this layer may NOT do
 *
 * No AI, no Firecrawl, no discovery, no family-algorithm change, no SiteSpec
 * mutation, no Task 14 baseline mutation, no promotion of an unknown interaction
 * into a pattern, no remote asset crawler, no font filename heuristic (item 185).
 * Corrections are a CLOSED enum of three types and every one of them is gated on
 * direct observation of what the right answer is (item 87).
 *
 * Data levels, unchanged from the rest of the pipeline:
 *  - `observed` : anything read from a live page, a saved snapshot or a clone.
 *  - `derived`  : diff ids, classifications, groupings, correction plans.
 *  - `inferred` : none. There is no AI in this Task at all.
 */

/**
 * Bumped when any persisted QA shape changes.
 * v2 (Task 17): behavior equivalence split into `triggerState` and
 * `visibleTarget` axes; observed-target replay states; optional interaction
 * before/after screenshots.
 */
export const SCHEMA_VERSION = 2 as const;

/** QA shapes this codebase can still READ. */
export const READABLE_SCHEMA_VERSIONS = [1, 2] as const;
const ReadableSchemaVersionSchema = z.union([z.literal(1), z.literal(2)]);

/** Recorded in artifacts so a reader can tell what produced them. */
export const QA_ENGINE = "playwright-chromium-deterministic-qa";

/** Fixed file / directory names inside a QA run directory (item 15). */
export const QA_MANIFEST_FILE = "qa-manifest.json";
export const BASELINE_SUMMARY_FILE = "baseline-summary.json";
export const FINAL_SUMMARY_FILE = "final-summary.json";
export const PAGES_DIR = "pages";
export const INTERACTIONS_DIR = "interactions";
export const UNKNOWNS_DIR = "unknowns";
export const DRIFT_DIR = "drift";
export const SOURCE_DRIFT_FILE = "source-drift.json";
export const CORRECTIONS_DIR = "corrections";
export const PROPOSED_CORRECTIONS_FILE = "proposed.json";
export const APPLIED_CORRECTIONS_FILE = "applied.json";
export const REJECTED_CORRECTIONS_FILE = "rejected.json";
export const CORRECTION_ASSETS_DIR = "assets";
export const ITERATIONS_DIR = "iterations";
export const ARTIFACTS_DIR = "artifacts";
export const SCREENSHOTS_DIR = "screenshots";
export const DIFFS_DIR = "diffs";

// ---------------------------------------------------------------------------
// Policy constants — ONE global policy, never per-site (items 10, 24, 77, 104)
// ---------------------------------------------------------------------------

/**
 * Pages captured concurrently. Every capture loads a real page on somebody
 * else's server, so this stays at the Task 09 / Task 11 ceiling rather than the
 * Verifier's: 2 by default, 3 as an absolute maximum (item 174).
 */
export const DEFAULT_CONCURRENCY = 2;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 3;

/** Correction iterations after the baseline (item 117). q000 is not counted. */
export const DEFAULT_MAX_FIX_ITERATIONS = 2;
export const MAX_FIX_ITERATIONS_CEILING = 5;

/**
 * Family-represented routes audited per site (item 24).
 *
 * These routes have no exact observation of their own, so they can never enter
 * the snapshot fidelity score (item 23) — but "the representative stood in
 * badly" is a real risk that has to be measured rather than assumed away.
 */
export const MAX_FAMILY_AUDIT_ROUTES_PER_SITE = 4;

/** Unknown interactions replayed per site — one per signature (items 76, 77). */
export const MAX_UNKNOWN_QA_PER_SITE = 8;

/**
 * Unknown signature priority for the per-site sample (item 77). Signatures are
 * grouped by Task 12's `reason`; this order decides which groups get a slot when
 * there are more groups than {@link MAX_UNKNOWN_QA_PER_SITE}.
 */
export const UNKNOWN_SIGNATURE_PRIORITY: readonly string[] = [
  "unmatched-transition",
  "style-only-change",
  "opaque-action",
  "navigation-tainted",
];

/** Decoded bytes a recovered data image may carry (item 104). */
export const MAX_DATA_IMAGE_BYTES = 1024 * 1024;

/**
 * MIME types the safe data-image recovery accepts (item 103).
 *
 * Raster only, and deliberately no `image/svg+xml`: an SVG data URI is markup
 * that can carry script, and "sanitize it first" is a second security surface
 * this Task has no reason to open. Everything else — `text/html`,
 * `application/*`, anything unlisted — is rejected outright.
 */
export const SAFE_DATA_IMAGE_MIMES: readonly string[] = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Extension used for a recovered image of each accepted MIME. */
export const DATA_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Screenshots persisted per site per dimension when not `--save-all-screenshots`. */
export const WORST_SCREENSHOTS_PER_SITE = 5;

/** Worst-N rows reported per dimension (items 86, 169). */
export const WORST_RANK_SIZE = 5;

/**
 * FALLBACK widths for the clone-only breakpoint probe (item 59).
 *
 * Responsive Core P0 — these were the 390/1440 midpoint ±1 and were probed on
 * every run, while the clone's served switch is 641, 801, 900 or 992 depending
 * on the evidence grade. The probe now reads the SERVED switch from the
 * manifest (`config.inferredBreakpoint.value`) and the route map's
 * `pageBreakpoints` and probes served−1 / served / served+1 per route
 * ({@link planBreakpointProbeTargets} in `capture-clone.ts`). This constant is
 * used ONLY for a manifest carrying no usable breakpoint, and every such target
 * is counted as `fallback-constant`.
 */
export const BREAKPOINT_PROBE_WIDTHS: readonly number[] = [914, 915, 916];

/**
 * Bounded settle between the two stability captures (item 21).
 *
 * The original's CSS animations are NEVER disabled — forcing `transition: none`
 * would change the page being measured — so instead the same page is measured
 * twice a short interval apart and a page whose geometry keeps moving is
 * classified `environment-unstable` rather than counted as a clone defect.
 */
export const STABILITY_SETTLE_MS = 400;

/** Geometry delta (px) above which a re-capture counts as still moving. */
export const STABILITY_GEOMETRY_EPSILON = 1;

/** Nodes sampled for the stability re-capture. Bounded, deterministic (first N). */
export const STABILITY_SAMPLE_SIZE = 400;

/**
 * The largest single dimension, in DEVICE pixels, a full-page screenshot may
 * have before the browser driver refuses it (Task 28.6, C5).
 *
 * This is not a number this Task chose. It is Playwright's own
 * `validateScreenshotDimension` limit. WHERE THAT LIMIT IS APPLIED IS
 * ENGINE-SPECIFIC, and the first version of this note got it wrong by reading
 * only the platform guard inside the function. Re-measured against
 * playwright-core 1.62.1 on disk (`lib/coreBundle.js`):
 *
 *   defined  :47205 (WKPage, WebKit) and :49747 (WVPage)
 *   called   :47216-17 and :49760-61 — inside those two classes and nowhere else
 *   chromium :37182 `CRPage.takeScreenshot` — ZERO calls
 *   firefox  :45106 `FFPage.takeScreenshot` — ZERO calls
 *   bidi     :41727 `BidiPage.takeScreenshot` — ZERO calls
 *
 * So the cap does not bite in this pipeline at all: {@link QA_ENGINE} is
 * chromium (`run-qa.ts` launches `chromium`), and chromium never calls the
 * check on any platform. The platform guard (`if (process.platform ===
 * "darwin") return;`) is real but is reached only by the two engines above.
 *
 * The consequence of getting this wrong was not academic: `capEnforced` was
 * computed from the platform alone, so every non-darwin run wrote
 * `capEnforced: true` into three coverage records per page/viewport and into
 * every coverage finding's evidence text — a confident, wrong statement about
 * the instrument, in the record whose entire job is to describe the instrument
 * honestly.
 *
 * Measured behaviour that remains true: on darwin with chromium,
 * `page.screenshot({ fullPage: true })` returned the complete document at
 * 1440x40000, 1440x200000 and 1170x180000 device px. Nothing was clipped.
 *
 * A future engine that refuses, or one that CLIPS instead of refusing, is
 * covered by the same record either way, because {@link ScreenshotCoverage} is
 * computed by comparing the PNG that came back against the document that was
 * measured — it never trusts the driver to report its own truncation.
 */
export const SCREENSHOT_DEVICE_DIMENSION_CAP = 32_767;

/**
 * The playwright page classes that actually call `validateScreenshotDimension`.
 *
 * Sorted, and named by engine rather than by class so a caller can pass what it
 * launched. Anything not in here does not consult the cap, whatever the platform.
 */
export const SCREENSHOT_CAP_ENFORCING_ENGINES: readonly string[] = ["webkit", "webview"];

/** The engine this QA pipeline launches. `run-qa.ts` calls `chromium.launch()`. */
export const QA_BROWSER_ENGINE = "chromium";

/**
 * True when the browser driver enforces {@link SCREENSHOT_DEVICE_DIMENSION_CAP}.
 *
 * BOTH conditions are required, and the engine one is the one that was missing:
 * the cap check is defined only on the WebKit and WebView page classes, and it
 * returns early on darwin. Defaults to this pipeline's own engine, so the common
 * call site cannot accidentally answer for an engine it did not launch.
 */
export function screenshotCapEnforced(
  engine: string = QA_BROWSER_ENGINE,
  platform: string = process.platform,
): boolean {
  return platform !== "darwin" && SCREENSHOT_CAP_ENFORCING_ENGINES.includes(engine);
}

/** Which of the three images a coverage record describes. */
export const ScreenshotSideSchema = z.enum(["snapshot", "live-original", "clone"]);
export type ScreenshotSide = z.infer<typeof ScreenshotSideSchema>;

/**
 * How much of the document ONE screenshot actually contains (Task 28.6, C5).
 *
 * Every pixel metric in this pipeline is computed over the overlap of two PNGs.
 * Without this record, a PNG that stopped short of the document bottom produces
 * exactly the same shaped metric as one that did not, and a reader cannot tell
 * "clean" from "clean as far as we looked". `coveredFraction` is that
 * distinction, and it is written for EVERY side, truncated or not, so its
 * absence means a pre-28.6 artifact rather than full coverage.
 *
 * `capturedDeviceHeight` is read from the PNG's IHDR, not from what the driver
 * claimed, so a silent clip is detected the same way an explicit refusal is.
 */
export const ScreenshotCoverageSchema = z.object({
  side: ScreenshotSideSchema,
  /**
   * TRUE when the document dimensions beside this were actually measured.
   *
   * The denominator of every fraction here is the document, and the document is
   * measured by a `page.evaluate` that can throw — a navigation mid-flight, a
   * closed context, a CSP that killed the world. When it threw, the old record
   * kept `documentHeightCss: 0`, which made `expectedDeviceHeight` 0, which made
   * `coveredFraction` 0 AND `truncatedDeviceRows` 0 AND `truncated` false — a
   * confident "we covered none of it" sitting beside "nothing was truncated",
   * with no finding raised, because the emitter skipped anything not truncated.
   * Measured: a real capture at 1440x5000 with an unmeasurable document produced
   * exactly that record and zero diffs.
   *
   * So the unknown denominator is now its own fact. `false` means every fraction
   * on this record is UNKNOWN, not zero, and the emitter raises a finding on it.
   */
  documentMeasured: z.boolean(),
  /** Document height at capture time, CSS px. Meaningless when `documentMeasured` is false. */
  documentHeightCss: z.number(),
  /** Document width at capture time, CSS px. Meaningless when `documentMeasured` is false. */
  documentWidthCss: z.number(),
  deviceScaleFactor: z.number(),
  /** `documentHeightCss * deviceScaleFactor`, rounded — what a whole page WOULD be. */
  expectedDeviceHeight: z.number().int().nonnegative(),
  expectedDeviceWidth: z.number().int().nonnegative(),
  /** Read from the PNG header. 0 when nothing was captured. */
  capturedDeviceHeight: z.number().int().nonnegative(),
  capturedDeviceWidth: z.number().int().nonnegative(),
  /**
   * The fraction of the document AREA this capture contains, 4 decimals:
   * `coveredHeightFraction * coveredWidthFraction`. 0 when nothing was captured,
   * and 0 when the document could not be measured — read `documentMeasured`
   * before reading this, because in that case 0 means UNKNOWN.
   */
  coveredFraction: z.number(),
  /** `capturedDeviceHeight / expectedDeviceHeight`, clamped to 1, 4 decimals. */
  coveredHeightFraction: z.number(),
  /**
   * `capturedDeviceWidth / expectedDeviceWidth`, clamped to 1, 4 decimals.
   *
   * Recorded because the width channel is live and was unchecked: truncation
   * used to be height-only while both width fields were written down, so a
   * half-width capture (measured: expected 1440, captured 720) reported
   * `coveredFraction: 1`, `truncated: false` and raised no finding. Real
   * observations do diverge on this axis — 12 MDN captures record documentWidth
   * 1425 against a 1440-wide PNG — so the channel is not hypothetical.
   */
  coveredWidthFraction: z.number(),
  /** True when the capture covers less than the document on EITHER axis. */
  truncated: z.boolean(),
  /** Device rows of the document that no pixel metric on this page ever saw. */
  truncatedDeviceRows: z.number().int().nonnegative(),
  /** Device COLUMNS of the document that no pixel metric on this page ever saw. */
  truncatedDeviceColumns: z.number().int().nonnegative(),
  /** True when a PNG came back at all. */
  captured: z.boolean(),
  /** The driver cap that would apply, device px. */
  capDeviceDimension: z.number().int().positive(),
  /**
   * True only when the launched ENGINE consults the cap and the platform does
   * not skip it — see {@link screenshotCapEnforced}. False for chromium, which
   * never calls the check on any platform.
   */
  capEnforced: z.boolean(),
  /** Why nothing (or less than everything) was captured. Absent on a full capture. */
  reason: z.string().optional(),
});
export type ScreenshotCoverage = z.infer<typeof ScreenshotCoverageSchema>;

/** Round to 4 decimals, the ratio precision every metric in this Task uses. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Build a coverage record from a measured document and the PNG that came back.
 *
 * Pure, and deliberately takes the CAPTURED dimensions rather than a Buffer, so
 * it is testable without a browser and without decoding an image.
 */
export function buildScreenshotCoverage(input: {
  side: ScreenshotSide;
  /**
   * REQUIRED, not defaulted. Every caller knows whether its document numbers
   * came from a measurement or from a `catch`, and a default here would let the
   * one fact that makes the fractions readable be forgotten silently.
   */
  documentMeasured: boolean;
  documentHeightCss: number;
  documentWidthCss: number;
  deviceScaleFactor: number;
  captured?: { width: number; height: number };
  reason?: string;
  /** Engine that took the shot, when it is not this pipeline's own. */
  engine?: string;
  capEnforced?: boolean;
}): ScreenshotCoverage {
  const expectedDeviceHeight = Math.max(
    0,
    Math.round(input.documentHeightCss * input.deviceScaleFactor),
  );
  const expectedDeviceWidth = Math.max(
    0,
    Math.round(input.documentWidthCss * input.deviceScaleFactor),
  );
  const capturedDeviceHeight = input.captured?.height ?? 0;
  const capturedDeviceWidth = input.captured?.width ?? 0;
  const coveredHeightFraction =
    expectedDeviceHeight === 0
      ? 0
      : round4(Math.min(1, capturedDeviceHeight / expectedDeviceHeight));
  const coveredWidthFraction =
    expectedDeviceWidth === 0
      ? 0
      : round4(Math.min(1, capturedDeviceWidth / expectedDeviceWidth));
  const truncatedDeviceRows = Math.max(0, expectedDeviceHeight - capturedDeviceHeight);
  // Both axes. A capture that is short on width hides exactly as much of the
  // page as one that is short on height, and it used to score as whole-page.
  const truncatedDeviceColumns = Math.max(0, expectedDeviceWidth - capturedDeviceWidth);
  const truncated = truncatedDeviceRows > 0 || truncatedDeviceColumns > 0;
  return {
    side: input.side,
    documentMeasured: input.documentMeasured,
    documentHeightCss: input.documentHeightCss,
    documentWidthCss: input.documentWidthCss,
    deviceScaleFactor: input.deviceScaleFactor,
    expectedDeviceHeight,
    expectedDeviceWidth,
    capturedDeviceHeight,
    capturedDeviceWidth,
    // The AREA fraction, so a short-on-width capture cannot read as whole-page.
    // Equal to the height fraction whenever the width is complete, which is why
    // every previously measured figure is unchanged by the addition.
    coveredFraction: round4(coveredHeightFraction * coveredWidthFraction),
    coveredHeightFraction,
    coveredWidthFraction,
    truncated,
    truncatedDeviceRows,
    truncatedDeviceColumns,
    captured: input.captured !== undefined,
    capDeviceDimension: SCREENSHOT_DEVICE_DIMENSION_CAP,
    capEnforced: input.capEnforced ?? screenshotCapEnforced(input.engine),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  };
}

/**
 * A y-offset group this large or larger is reported as one cascade candidate
 * rather than as N independent geometry defects (item 45).
 */
export const LAYOUT_CASCADE_MIN_NODES = 8;

/** Two nodes share a displacement when their y deltas agree within this (px). */
export const LAYOUT_CASCADE_TOLERANCE_PX = 1;

/** Descendants sharing one inherited-property mismatch before it is grouped (item 48). */
export const INHERITED_STYLE_MIN_NODES = 5;

/** Computed properties treated as inherited for root-cause grouping (item 48). */
export const INHERITED_STYLE_PROPERTIES: readonly string[] = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-transform",
  "visibility",
  "white-space",
  "word-break",
];

/** Background properties a canvas correction may carry (item 92). */
export const CANVAS_BACKGROUND_PROPERTIES: readonly string[] = [
  "background-attachment",
  "background-color",
  "background-image",
  "background-position",
  "background-repeat",
  "background-size",
];

/** A geometry delta at or below this (px) is not reported as a mismatch. */
export const GEOMETRY_EPSILON_PX = 0.5;

/**
 * Blink's layout quantum — the smallest length the engine can represent.
 *
 * This is not a taste threshold, it is the renderer's own resolution: Blink
 * stores lengths as `LayoutUnit`, a fixed-point type with 1/64 px precision, and
 * a computed `width: 111.609px` is already a quantized value. Two independent
 * layout passes of the same box can therefore land one quantum either side of
 * the same true length, which bounds their difference at TWO quanta.
 *
 * It matters because the clone lays every box out again: on domainchecker's four
 * blog pages alone, exact string comparison reports 1,160 `width` and 842
 * `height` "mismatches" whose largest disagreement is 0.031 px — two quanta —
 * and they would otherwise be the two most frequent style differences on the
 * site, burying every real one. They are counted separately rather than dropped
 * (`subLayoutUnitLengthMismatches`), so nothing is hidden.
 */
export const LAYOUT_UNIT_PX = 1 / 64;
export const LENGTH_TOLERANCE_PX = 2 * LAYOUT_UNIT_PX;

// --- load policy (item 20) --------------------------------------------------
// Deliberately the Observer's own numbers. A QA capture that stabilized
// differently from the observation it is compared against would manufacture
// differences, so these are imported constants in spirit and identical in value.

export const QA_NAV_TIMEOUT_MS = 45_000;
export const QA_NETWORK_IDLE_TIMEOUT_MS = 8_000;
export const QA_FONTS_READY_TIMEOUT_MS = 5_000;
export const QA_SETTLE_MS = 1_200;
export const QA_RAF_COUNT = 2;

/** Timeout for one interaction click during QA replay (Task 11's value). */
export const QA_ACTION_TIMEOUT_MS = 10_000;

/** Max characters of an error message kept in a QA artifact. */
export const ERROR_MESSAGE_MAX_LEN = 300;

// ---------------------------------------------------------------------------
// Diff taxonomy (item 81)
// ---------------------------------------------------------------------------

/**
 * Every classification this Task can assign, as a CODE.
 *
 * Grouped by what they blame, because that grouping IS the precedence order
 * (item 82): a source-drift finding explains the live-original mismatch on the
 * same node, so the generator is never charged for it twice.
 *
 *  - `source-*`      the live site moved since the snapshot. Not a clone defect.
 *  - `*-mismatch`    the clone disagrees with the SNAPSHOT contract.
 *  - `*-unobserved`  the pipeline never observed what the right answer is.
 *  - `family-*`      a route with no exact observation of its own.
 *  - `runtime-error` the clone (or the original) reported an error.
 *  - `environment-*` the measurement itself was not stable.
 */
export const QaClassificationSchema = z.enum([
  // --- the live original moved (never a clone defect) ---
  "source-structural-drift",
  "source-content-drift",
  "source-style-drift",
  // --- routing ---
  "route-mismatch",
  // --- structure / content ---
  "content-mismatch",
  "structure-mismatch",
  // --- layout ---
  "geometry-mismatch",
  "layout-cascade",
  "nested-scroll-state-mismatch",
  // --- style ---
  "style-mismatch",
  "font-binding-missing",
  // --- assets ---
  "asset-missing",
  "asset-load-failure",
  "asset-hotlink-blocked",
  // --- canvas ---
  "canvas-background-mismatch",
  // --- responsive ---
  "responsive-variant-mismatch",
  "responsive-variant-runtime-error",
  "inferred-breakpoint-runtime-defect",
  // --- behavior ---
  "interaction-state-mismatch",
  "interaction-visible-target-mismatch",
  "interaction-target-style-mismatch",
  "dynamic-target-content-unobserved",
  "unknown-behavior-gap",
  // --- coverage ---
  "family-representation-gap",
  "visual-coverage-truncated",
  // --- infrastructure ---
  "runtime-error",
  "environment-unstable",
  "unclassified",
]);
export type QaClassification = z.infer<typeof QaClassificationSchema>;

export const QA_CLASSIFICATION_ORDER: readonly QaClassification[] =
  QaClassificationSchema.options;

/** One human sentence per classification. Embedded (filtered) into the manifest. */
export const QA_CLASSIFICATION_MESSAGES: Readonly<
  Record<QaClassification, string>
> = {
  "source-structural-drift":
    "The live original's element sequence no longer matches the saved snapshot, so this page cannot be compared node by node. The clone is not blamed and nothing is auto-corrected toward the current site.",
  "source-content-drift":
    "The live original's text differs from the saved snapshot while its structure still aligns. Where the clone matches the snapshot, this is not a clone defect.",
  "source-style-drift":
    "The live original's computed style differs from the saved snapshot while its structure still aligns.",
  "route-mismatch":
    "A verified route did not render in the clone.",
  "content-mismatch":
    "The clone's text differs from the SiteSpec snapshot text on a node whose source did not drift.",
  "structure-mismatch":
    "A SiteSpec node is missing from, or duplicated in, the clone's rendered tree.",
  "geometry-mismatch":
    "The clone's element geometry differs from the observed snapshot geometry.",
  "layout-cascade":
    "Many nodes share one displacement, so they are reported as a single cascade with its first divergence point rather than as N independent geometry defects.",
  "nested-scroll-state-mismatch":
    "A nested scroll container the snapshot observed at a non-zero offset sits at a different offset in the clone. Every descendant's recorded position was measured at the observed offset, so this is the CAUSE of their geometry deltas rather than another instance of them.",
  "style-mismatch":
    "A computed style property differs between the SiteSpec snapshot and the clone.",
  "font-binding-missing":
    "A font-family mismatch coincides with text-node geometry drift on the same page. The pipeline never compiled @font-face, so the family the browser resolved is not the family that was observed.",
  "asset-missing":
    "The SiteSpec has no usable asset reference for an element that displayed an image in the snapshot.",
  "asset-load-failure":
    "An asset the clone references failed to load in the clone.",
  "asset-hotlink-blocked":
    "An asset the clone references was refused by the origin server for a cross-origin/hotlink reason (CORP, CORS, 403).",
  "canvas-background-mismatch":
    "The viewport canvas (the area outside the reconstructed document-root wrapper) does not carry the observed document-root background.",
  "responsive-variant-mismatch":
    "The clone's rendering at an OBSERVED viewport width (390 or 1440) disagrees with the observation made at that width.",
  "responsive-variant-runtime-error":
    "Both viewport variants were visible at once, or neither was — the clone's responsive switching is broken, independently of any fidelity question.",
  "inferred-breakpoint-runtime-defect":
    "The clone misbehaves around its own inferred breakpoint. This is a clone-only consistency finding: the breakpoint was never observed on the original, so no original comparison is claimed.",
  "interaction-state-mismatch":
    "A verified pattern's observable before/after state transition differs between the live original and the clone.",
  "interaction-visible-target-mismatch":
    "A verified pattern's USER-VISIBLE target region behaves differently: what appeared, disappeared or changed on the live original did not do the same in the clone (Task 17 §6).",
  "interaction-target-style-mismatch":
    "A verified pattern's target reaches a different computed style in the clone's open state than the live original's.",
  "dynamic-target-content-unobserved":
    "The original mounts a region with contents; the clone mounts the observed tag and role and no children, because the contents were never observed. A known limitation, never auto-corrected.",
  "unknown-behavior-gap":
    "The original shows an observable behavior on a trigger Task 12 classified as unknown; the clone deliberately implements nothing. Detection is the goal — the gap is never auto-filled.",
  "family-representation-gap":
    "A family-represented route (no exact observation of its own) renders its representative's tree and differs from the live URL. This is a coverage gap, not a generator defect.",
  "visual-coverage-truncated":
    "A full-page screenshot did not cover the whole document, so every pixel metric computed from it speaks only for the part that was captured. Nothing below the captured height was inspected, and a clean pixel ratio on this page means \u201cclean as far as we looked\u201d, not \u201cclean\u201d.",
  "runtime-error":
    "The clone reported a console error, page error, hydration error or failed resource.",
  "environment-unstable":
    "Two captures of the same page a short interval apart disagreed, so the measurement itself is not stable enough to attribute.",
  unclassified:
    "A difference with no evidence predicate satisfied. Recorded rather than guessed at.",
};

/**
 * Which dimension produced a diff. Kept separate from the classification so
 * "where was this measured" and "what caused it" never collapse into one field.
 */
export const QaDimensionSchema = z.enum([
  "route",
  "structure",
  "content",
  "geometry",
  "document-geometry",
  "scroll-state",
  "style",
  "asset",
  "runtime",
  "visual",
  "canvas",
  "responsive",
  "interaction",
  "unknown-interaction",
  "family-audit",
  "source-drift",
]);
export type QaDimension = z.infer<typeof QaDimensionSchema>;

export const QA_DIMENSION_ORDER: readonly QaDimension[] =
  QaDimensionSchema.options;

/**
 * What has to happen for a diff nobody can auto-fix (item 166).
 *
 * "Not automatically fixable" is not a failure — it is a routing decision, and
 * every unfixable diff carries exactly one of these so the next Task knows which
 * stage owns it.
 */
export const QaRecommendationSchema = z.enum([
  "requires-reobserve",
  "requires-exact-observation",
  "requires-new-interaction-observation",
  "requires-asset-materialization",
  "requires-font-binding-observation",
  "requires-pattern-modeling",
  "unknown-semantic-gap",
  "unsupported-browser-region",
  "source-drift",
  "none",
]);
export type QaRecommendation = z.infer<typeof QaRecommendationSchema>;

/** Which upstream stage owns a finding, for the report's routing table. */
export const QaUpstreamStageSchema = z.enum([
  "discovery",
  "verification",
  "selection",
  "observation",
  "interaction-exploration",
  "pattern-modeling",
  "sitespec",
  "reconstruction",
  "qa",
  "source-site",
  "none",
]);
export type QaUpstreamStage = z.infer<typeof QaUpstreamStageSchema>;

/**
 * Whether a diff may be auto-corrected.
 *
 * Not a score (item 83). `eligible` means an evidence predicate for one of the
 * three closed correction types is satisfied; everything else names WHY not, in
 * a closed vocabulary a reviewer can count.
 */
export const AutoFixEligibilitySchema = z.enum([
  "eligible",
  "not-eligible-no-observed-target-state",
  "not-eligible-source-drift",
  "not-eligible-unknown-behavior",
  "not-eligible-family-representation",
  "not-eligible-requires-materialization",
  "not-eligible-requires-font-binding",
  "not-eligible-unstable-measurement",
  "not-eligible-no-correction-type",
]);
export type AutoFixEligibility = z.infer<typeof AutoFixEligibilitySchema>;

/** One piece of evidence behind a classification. Never free-form prose. */
export const QaEvidenceSchema = z.object({
  /** `snapshot-style`, `live-style`, `clone-style`, `clone-console`, … */
  kind: z.string(),
  /** Property / field / relation the evidence is about. */
  field: z.string().optional(),
  snapshot: z.string().optional(),
  liveOriginal: z.string().optional(),
  clone: z.string().optional(),
  /** A count when the evidence is aggregate rather than per-value. */
  count: z.number().optional(),
  note: z.string().optional(),
});
export type QaEvidence = z.infer<typeof QaEvidenceSchema>;

/** One classified difference (item 84). */
export const QaDiffSchema = z.object({
  /** `qd000001…`, assigned after a stable sort (item 17). */
  id: z.string(),
  pageId: z.string().optional(),
  viewport: ViewportProfileSchema.shape.id.optional(),
  route: z.string().optional(),

  dimension: QaDimensionSchema,
  classification: QaClassificationSchema,

  nodeId: z.string().optional(),
  patternId: z.string().optional(),
  unknownId: z.string().optional(),
  property: z.string().optional(),

  snapshotExpected: z.string().optional(),
  liveOriginal: z.string().optional(),
  cloneActual: z.string().optional(),

  evidence: z.array(QaEvidenceSchema),

  /** True when the live original disagrees with the snapshot on this subject. */
  sourceDrift: z.boolean(),
  /** How many nodes/occurrences this one diff stands for (cascade grouping). */
  affectedNodeCount: z.number().int().nonnegative(),

  autoFixEligibility: AutoFixEligibilitySchema,
  correctionType: z.string().optional(),
  recommendation: QaRecommendationSchema,
  upstreamStage: QaUpstreamStageSchema,
  /** Closed-vocabulary honesty notes, sorted. */
  limitations: z.array(z.string()),
});
export type QaDiff = z.infer<typeof QaDiffSchema>;

// ---------------------------------------------------------------------------
// Per-page QA results
// ---------------------------------------------------------------------------

/** Outcome of one page/viewport QA (item 175). */
export const QaPageStatusSchema = z.enum([
  "complete",
  "source-load-error",
  "clone-load-error",
  "source-drift",
  "alignment-failed",
  "capture-error",
]);
export type QaPageStatus = z.infer<typeof QaPageStatusSchema>;

/** Deterministic screenshot metrics for ONE image pair (items 29, 30). */
export const ScreenshotMetricSchema = z.object({
  pair: z.enum(["snapshot-clone", "snapshot-original", "original-clone"]),
  available: z.boolean(),
  /** Absent when one side is missing. */
  unavailableReason: z.string().optional(),
  aWidth: z.number().int().nonnegative().optional(),
  aHeight: z.number().int().nonnegative().optional(),
  bWidth: z.number().int().nonnegative().optional(),
  bHeight: z.number().int().nonnegative().optional(),
  widthDelta: z.number().int().optional(),
  heightDelta: z.number().int().optional(),
  /** Mean |ΔR|+|ΔG|+|ΔB| / 3 over the overlapping area, 0–255, 4 decimals. */
  meanAbsoluteRgbDelta: z.number().optional(),
  /** Largest single-channel delta anywhere in the overlap. */
  maxChannelDelta: z.number().int().optional(),
  /** Changed pixels / overlap pixels, 4 decimals. A pixel changes if any channel does. */
  changedPixelRatio: z.number().optional(),
  /** Overlap pixels / max(a,b) pixels, 4 decimals — how much was comparable at all. */
  commonAreaRatio: z.number().optional(),
  overlapPixels: z.number().int().nonnegative().optional(),
  changedPixels: z.number().int().nonnegative().optional(),

  /*
   * Task 28.5B change 6 — additional pixel channels, reported ALONGSIDE the @1
   * figures above, never instead of them. Every field is optional so QA
   * artifacts written before 28.5B still parse against this schema; a reader
   * that finds them absent is reading a pre-28.5B run, not a zero.
   *
   * No single field here is "the" visual number. 28.5A measured @1 saturating
   * at ~1.0 on renders a human calls identical; the amplitude-gated and
   * perceptual channels are what separate that noise from a real regression.
   */
  /** Pixels whose largest channel delta is ≥ 16/255, over the overlap. */
  changedPixelsAt16: z.number().int().nonnegative().optional(),
  /** `changedPixelsAt16 / overlapPixels`, 4 decimals. */
  changedRatioAt16: z.number().optional(),
  /** Mean per-pixel MAX channel delta over the overlap, 0–255. */
  meanMaxChannelDelta: z.number().optional(),
  /** Mean CIELab ΔE*76 over the overlap. */
  deltaE76Mean: z.number().optional(),
  /** Largest ΔE*76 anywhere in the overlap. */
  deltaE76Max: z.number().optional(),
  /** Overlap pixels with ΔE76 > 2.3 (the JND threshold). */
  deltaE76AboveJndPixels: z.number().int().nonnegative().optional(),
  /** `deltaE76AboveJndPixels / overlapPixels`, 4 decimals. */
  deltaE76AboveJndRatio: z.number().optional(),
  /** Overlap pixels with ΔE76 > 10 (clearly visible, not merely detectable). */
  deltaE76AboveVisiblePixels: z.number().int().nonnegative().optional(),
  /** `deltaE76AboveVisiblePixels / overlapPixels`, 4 decimals. */
  deltaE76AboveVisibleRatio: z.number().optional(),

  /*
   * Task 28.8 FAST change 3 — THE CANVAS THE MIN-CROP LEFT OUT.
   *
   * Every pixel field above is computed over `min(a,b)` in each axis. Until now
   * that crop was silent: two captures of different widths produced a perfectly
   * well-formed set of numbers describing only the columns they shared, and
   * nothing in the artifact said how much had been dropped or whether anything
   * was in it. `widthDelta` recorded that the sizes differed and never that the
   * difference was excluded from every number beside it.
   *
   * The crop stays — a resize invents pixels — and the band is measured. INK is
   * the field that decides whether the omission matters: a strip of plain page
   * background reads 0 and hides nothing. Optional so pre-28.8-FAST artifacts still
   * parse; ABSENT means "this run never measured the band", never "the band was
   * empty", and `uncomparedMeasured` distinguishes an unresolvable modal colour
   * from a measured zero.
   */
  /** Columns the wider capture has that the comparison never read. */
  uncomparedWidthPx: z.number().int().nonnegative().optional(),
  /** Rows the taller capture has that the comparison never read. */
  uncomparedHeightPx: z.number().int().nonnegative().optional(),
  /** Pixels outside the compared canvas, summed over BOTH captures. */
  uncomparedPixels: z.number().int().nonnegative().optional(),
  /** Pixels actually READ for the ink figures. Below `uncomparedPixels` when
   *  the band exceeded the sample budget, in which case the ratio is a sample
   *  and the AREA above is still exact. */
  uncomparedSampledPixels: z.number().int().nonnegative().optional(),
  /** Sampled pixels that are ink against their own capture's modal colour. */
  uncomparedInkPixels: z.number().int().nonnegative().optional(),
  /** `uncomparedInkPixels / uncomparedSampledPixels`, 4 decimals. */
  uncomparedInkRatio: z.number().optional(),
  /** False when a modal colour could not be resolved on one side, so the ink
   *  figure beside it is not a measured zero. */
  uncomparedMeasured: z.boolean().optional(),

  /*
   * Task 28.6 C5 — how much of the PAGE this pair's numbers speak for.
   *
   * Every field above is computed over the OVERLAP of two PNGs, and
   * `commonAreaRatio` compares the two IMAGES to each other, not either of them
   * to the document. If a side stopped short of the document bottom, the metrics
   * are still perfectly well-formed and still describe only the part that was
   * captured. These three fields are what makes that visible. Optional so
   * pre-28.6 artifacts still parse; absent means "this run never measured
   * coverage", never "coverage was complete".
   */
  /**
   * min(a, b) covered fraction — the fraction of the document this pair
   * inspected. ABSENT when either side's coverage is unknown (missing record,
   * or a document that could not be measured): a pair cannot speak for a side it
   * knows nothing about, and reporting the known side's number there was the
   * defect. Read `coverageUnknownSides` before concluding anything from its
   * absence.
   */
  coveredFraction: z.number().optional(),
  /**
   * True when either side stopped short of its own document, OR when either
   * side's coverage is unknown. Both mean the same thing to a reader: this
   * pair's pixel numbers are not a whole-page verdict.
   */
  coverageTruncated: z.boolean().optional(),
  /** Which sides were truncated or missing, sorted. */
  truncatedSides: z.array(ScreenshotSideSchema).optional(),
  /**
   * How many of the pair's TWO sides have no usable coverage record — 0, 1 or 2.
   * `0` with a `coveredFraction` present is the only shape that speaks for the
   * whole pair.
   */
  coverageUnknownSides: z.number().int().min(0).max(2).optional(),

  /** Persisted diff PNG, relative to the run dir, when one was kept. */
  diffFile: z.string().optional(),
});
export type ScreenshotMetric = z.infer<typeof ScreenshotMetricSchema>;

export const ContentDiffSummarySchema = z.object({
  snapshotTextNodes: z.number().int().nonnegative(),
  comparedTextNodes: z.number().int().nonnegative(),
  exactEqual: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  extra: z.number().int().nonnegative(),
  /** Σ|len(expected) − len(actual)| over compared nodes. */
  characterDelta: z.number().int().nonnegative(),
  /** Ordered concatenation equality — catches reordering exact-equality misses. */
  orderedSequenceEqual: z.boolean(),
  /** `exactEqual / comparedTextNodes`, 4 decimals. */
  exactRatio: z.number(),
  /*
   * Task 28.6 — nodes that were compared by PREFIX, not by equality, because
   * the Observer's own `TEXT_MAX_LEN` cap truncated the stored text. Their
   * tails were never compared by anyone, so `exactRatio` over a page with a
   * high count here is a weaker claim than the same number on a page with
   * zero. Counted rather than silent. Optional for pre-28.6 artifacts.
   */
  prefixComparedNodes: z.number().int().nonnegative().optional(),
});
export type ContentDiffSummary = z.infer<typeof ContentDiffSummarySchema>;

export const GeometryStatsSchema = z.object({
  comparedNodes: z.number().int().nonnegative(),
  median: z.number(),
  p90: z.number(),
  p95: z.number(),
  max: z.number(),
});
export type GeometryStats = z.infer<typeof GeometryStatsSchema>;

export const GeometryDiffSummarySchema = z.object({
  comparedNodes: z.number().int().nonnegative(),
  mismatchedNodes: z.number().int().nonnegative(),
  x: GeometryStatsSchema,
  y: GeometryStatsSchema,
  width: GeometryStatsSchema,
  height: GeometryStatsSchema,
  /** Worst nodes per property, deterministic order. */
  worst: z.array(
    z.object({
      property: z.string(),
      nodeId: z.string(),
      expected: z.number(),
      actual: z.number(),
      delta: z.number(),
    }),
  ),
});
export type GeometryDiffSummary = z.infer<typeof GeometryDiffSummarySchema>;

export const StyleDiffSummarySchema = z.object({
  comparedNodes: z.number().int().nonnegative(),
  comparedProperties: z.number().int().nonnegative(),
  mismatchedProperties: z.number().int().nonnegative(),
  mismatchedNodes: z.number().int().nonnegative(),
  /**
   * Length properties whose values differ by at most two Blink layout units.
   * Counted, never silently dropped — see {@link LENGTH_TOLERANCE_PX}.
   */
  subLayoutUnitLengthMismatches: z.number().int().nonnegative(),
  /** Non-zero per-property mismatch counts, sorted by property. */
  byProperty: z.record(z.string(), z.number().int().nonnegative()),
});
export type StyleDiffSummary = z.infer<typeof StyleDiffSummarySchema>;

export const DocumentGeometrySchema = z.object({
  viewportWidth: z.number(),
  viewportHeight: z.number(),
  documentWidth: z.number(),
  documentHeight: z.number(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
});
export type DocumentGeometry = z.infer<typeof DocumentGeometrySchema>;

export const AssetDiffSummarySchema = z.object({
  snapshotImages: z.number().int().nonnegative(),
  cloneImages: z.number().int().nonnegative(),
  cloneImagesLoaded: z.number().int().nonnegative(),
  cloneImagesFailed: z.number().int().nonnegative(),
  cloneImagesWithoutSrc: z.number().int().nonnegative(),
  originalImagesLoaded: z.number().int().nonnegative().optional(),
  originalImagesFailed: z.number().int().nonnegative().optional(),
  /** Network responses in the clone with a failure status or an abort. */
  cloneResourceFailures: z.number().int().nonnegative(),
  originalResourceFailures: z.number().int().nonnegative().optional(),
});
export type AssetDiffSummary = z.infer<typeof AssetDiffSummarySchema>;

export const RuntimeDiffSummarySchema = z.object({
  cloneConsoleErrors: z.number().int().nonnegative(),
  /**
   * Console errors that are a BLOCKED ASSET, not JavaScript (item 54).
   *
   * MDN serves its icons with no `Access-Control-Allow-Origin`, so a clone on
   * localhost gets 84 `blocked by CORS policy` console errors per run. Counting
   * those as runtime errors would blame the clone's runtime for somebody else's
   * response header — which is exactly the conflation item 54 forbids.
   */
  cloneBlockedAssetMessages: z.number().int().nonnegative(),
  /** Console + page errors that are genuinely JavaScript. */
  cloneJsErrors: z.number().int().nonnegative(),
  cloneConsoleWarnings: z.number().int().nonnegative(),
  clonePageErrors: z.number().int().nonnegative(),
  cloneHydrationErrors: z.number().int().nonnegative(),
  cloneFailedResources: z.number().int().nonnegative(),
  cloneUnexpectedNavigations: z.number().int().nonnegative(),
  originalConsoleErrors: z.number().int().nonnegative().optional(),
  originalPageErrors: z.number().int().nonnegative().optional(),
  originalFailedResources: z.number().int().nonnegative().optional(),
  /** Deterministically capped sample of the clone's own messages. */
  cloneSamples: z.array(z.string()),
});
export type RuntimeDiffSummary = z.infer<typeof RuntimeDiffSummarySchema>;

export const SourceDriftSummarySchema = z.object({
  attempted: z.boolean(),
  structurallyAligned: z.boolean(),
  alignmentFailure: z.string().optional(),
  liveElementCount: z.number().int().nonnegative().optional(),
  snapshotElementCount: z.number().int().nonnegative().optional(),
  mismatchIndex: z.number().int().nonnegative().optional(),
  mismatchDetail: z.string().optional(),
  changedTextNodes: z.number().int().nonnegative(),
  changedStyleProperties: z.number().int().nonnegative(),
  changedStyleNodes: z.number().int().nonnegative(),
  /** Non-zero per-property drift counts, sorted. */
  styleDriftByProperty: z.record(z.string(), z.number().int().nonnegative()),
  geometryP95: z.number().optional(),
});
export type SourceDriftSummary = z.infer<typeof SourceDriftSummarySchema>;

export const CanvasCheckSchema = z.object({
  available: z.boolean(),
  /** Observed document-root background properties from the SiteSpec. */
  expected: z.record(z.string(), z.string()),
  /** The clone's framework `<html>` / `<body>` computed background. */
  cloneHtml: z.record(z.string(), z.string()),
  cloneBody: z.record(z.string(), z.string()),
  /** Properties where the canvas differs from the observed root. */
  mismatchedProperties: z.array(z.string()),
});
export type CanvasCheck = z.infer<typeof CanvasCheckSchema>;

export const VariantCheckSchema = z.object({
  desktopVisible: z.boolean(),
  mobileVisible: z.boolean(),
  /** Exactly one visible is the only correct answer. */
  ok: z.boolean(),
});
export type VariantCheck = z.infer<typeof VariantCheckSchema>;

/**
 * Nested scroll restoration, measured directly (Task 16, item 89).
 *
 * Task 15 could only see this dimension through its symptoms: MDN's sidebar
 * scroll offset surfaced as a 19,739px median y delta, and identifying the
 * cause took a diff image and a manual DOM walk. These five counts answer the
 * question the geometry table could not: how many scrollers were observed at a
 * non-zero offset, and how many of them does the clone actually reproduce?
 */
export const ScrollStateComparisonSchema = z.object({
  expectedNodes: z.number().int().nonnegative(),
  expectedScrolledNodes: z.number().int().nonnegative(),
  comparedNodes: z.number().int().nonnegative(),
  restoredNodes: z.number().int().nonnegative(),
  mismatchedNodes: z.number().int().nonnegative(),
  worst: z.array(
    z.object({
      nodeId: z.string(),
      tagName: z.string(),
      expectedTop: z.number(),
      actualTop: z.number(),
      topDelta: z.number(),
      expectedLeft: z.number(),
      actualLeft: z.number(),
    }),
  ),
});
export type ScrollStateComparison = z.infer<typeof ScrollStateComparisonSchema>;

/**
 * Element→asset mapping survival (Task 16, item 91).
 *
 * Three counts with three different owners, deliberately not collapsed:
 * `unboundInSpec` is an observation gap, `lostInReconstruction` is a generator
 * gap, and an image that has a `src` but does not decode belongs to
 * `asset-diff.ts`. Task 15's 325 nextjs findings were all the first kind and
 * were routed as `requires-reobserve`; this makes that distinction a number
 * rather than an investigation.
 */
export const AssetOccurrenceComparisonSchema = z.object({
  specImageNodes: z.number().int().nonnegative(),
  specAssetBoundImageNodes: z.number().int().nonnegative(),
  cloneImageNodes: z.number().int().nonnegative(),
  cloneSrcBoundImageNodes: z.number().int().nonnegative(),
  lostInReconstruction: z.number().int().nonnegative(),
  unboundInSpec: z.number().int().nonnegative(),
  unboundNodeIds: z.array(z.string()),
});
export type AssetOccurrenceComparison = z.infer<
  typeof AssetOccurrenceComparisonSchema
>;

/**
 * Whether the page's geometry was still moving between two captures (item 21).
 *
 * Task 28.6 C5, same-standard pass: this record USED to say `sampledNodes: 400`
 * and nothing else, which is a cap reported as if it were a population. Three
 * silent limits are now counted, because each one is a way the `stable` verdict
 * can be true about less of the page than a reader assumes:
 *
 *   `candidateNodes`  how many elements the first capture actually had
 *   `unsampledNodes`  …minus the ones the {@link STABILITY_SAMPLE_SIZE} prefix
 *                     reached. Never looked at. A page whose animation lives
 *                     past element 400 is "stable" only in its first 400 nodes.
 *   `unmatchedNodes`  sampled nodes with no counterpart in the SECOND capture.
 *                     They cannot be compared, so they are skipped — and a node
 *                     that vanished between two captures 400ms apart is exactly
 *                     the kind of movement this check exists to notice.
 *
 * `stable` is a verdict over `sampledNodes - unmatchedNodes` nodes. It is
 * meaningless when `measured` is false, and every consumer must gate on
 * `measured` first: a re-capture that THREW returns `measured: false` with
 * `stable: true`, which is a placeholder, not a finding of stability.
 */
export const StabilitySchema = z.object({
  measured: z.boolean(),
  /** Sampled nodes whose geometry kept moving between the two captures. */
  movingNodes: z.number().int().nonnegative(),
  /** Nodes actually compared, i.e. `min(candidateNodes, STABILITY_SAMPLE_SIZE)`. */
  sampledNodes: z.number().int().nonnegative(),
  /** Elements the first capture had. Optional: absent on a pre-28.6 artifact. */
  candidateNodes: z.number().int().nonnegative().optional(),
  /** Elements past the sample cap that were never looked at. `candidate - sampled`. */
  unsampledNodes: z.number().int().nonnegative().optional(),
  /** Sampled nodes missing from the second capture, so not comparable. */
  unmatchedNodes: z.number().int().nonnegative().optional(),
  documentHeightDelta: z.number(),
  /** Only meaningful when `measured`. See the note above. */
  stable: z.boolean(),
});
export type Stability = z.infer<typeof StabilitySchema>;

/**
 * One QA-only style difference between the LIVE ORIGINAL browser and the CLONE
 * browser (Task 28.5B change 6, integration).
 *
 * `nodeId` is the SiteSpec node id — the identity BOTH sides were already keyed
 * by for asset and style diffing — so a finding here points at the same node the
 * rest of the report points at, and can be looked up in the SiteSpec directly.
 */
export const QaOnlyStyleSampleSchema = z.object({
  nodeId: z.string(),
  tagName: z.string(),
  property: z.string(),
  /** The live original's computed value. */
  original: z.string(),
  /** The clone's computed value. */
  clone: z.string(),
});
export type QaOnlyStyleSample = z.infer<typeof QaOnlyStyleSampleSchema>;

/** Cap on retained per-page samples. Counts are NEVER capped. */
export const QA_ONLY_STYLE_SAMPLE_LIMIT = 50;

/**
 * Why a page has no QA-only style comparison. Recorded instead of a zero, because
 * "nothing was compared" and "nothing differed" are different statements and the
 * whole point of change 6 is to stop conflating them.
 */
export const QaOnlyStyleUnavailableReasonSchema = z.enum([
  "no-clone-capture",
  "no-live-original",
  "source-not-aligned",
  "no-comparable-nodes",
]);
export type QaOnlyStyleUnavailableReason = z.infer<
  typeof QaOnlyStyleUnavailableReasonSchema
>;

/** One page × viewport QA result, persisted as `pages/<pageId>/<viewport>.json`. */
export const QaPageResultSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  url: z.string(),
  clonePath: z.string(),
  status: QaPageStatusSchema,
  /** Provenance timestamps of the live captures (item 16 allows these). */
  capturedAt: z.string().optional(),

  snapshotNodeCount: z.number().int().nonnegative(),
  cloneMappedNodes: z.number().int().nonnegative(),
  cloneMissingNodes: z.number().int().nonnegative(),
  cloneDuplicateNodes: z.number().int().nonnegative(),
  /** Snapshot nodes not compared because they were hidden in the snapshot. */
  hiddenSnapshotNodes: z.number().int().nonnegative(),

  content: ContentDiffSummarySchema,
  geometry: GeometryDiffSummarySchema,
  style: StyleDiffSummarySchema,
  asset: AssetDiffSummarySchema,
  runtime: RuntimeDiffSummarySchema,
  /**
   * Nested scroll offsets (Task 16, item 89). Optional so a QA run over a Task
   * 13.1 SiteSpec — which has no `scrollState` anywhere — is not required to
   * invent a zeroed object.
   */
  scrollState: ScrollStateComparisonSchema.optional(),
  /** Element→asset mapping survival across IR and clone (Task 16, item 91). */
  assetOccurrence: AssetOccurrenceComparisonSchema.optional(),
  canvas: CanvasCheckSchema,
  variant: VariantCheckSchema,
  stability: StabilitySchema,

  documentGeometry: z.object({
    snapshot: DocumentGeometrySchema,
    clone: DocumentGeometrySchema.optional(),
    liveOriginal: DocumentGeometrySchema.optional(),
  }),

  screenshots: z.array(ScreenshotMetricSchema),
  /*
   * Task 28.6 C5 — one record per screenshot side that was attempted, sorted by
   * side. Written whether or not anything was truncated, so a reader can tell a
   * fully covered page from a page this field was never computed for. Optional
   * only for pre-28.6 artifacts.
   */
  screenshotCoverage: z.array(ScreenshotCoverageSchema).optional(),
  /*
   * Task 28.6 — what the bounded waits in `stabilize()` actually reached.
   *
   * Both waits are deliberately bounded (many sites never truly idle), but
   * before this the two booleans were computed and then dropped on the floor by
   * every caller, so a page captured mid-load was indistinguishable from a
   * settled one. Recorded, not gated on. Optional for pre-28.6 artifacts.
   */
  stabilization: z
    .object({
      clone: z.object({
        networkIdleReached: z.boolean(),
        fontsReadyReached: z.boolean(),
      }),
      liveOriginal: z
        .object({
          networkIdleReached: z.boolean(),
          fontsReadyReached: z.boolean(),
        })
        .optional(),
    })
    .optional(),
  sourceDrift: SourceDriftSummarySchema,

  /** Live-original ↔ clone figures, computed ONLY when the source did not drift. */
  liveFidelity: z
    .object({
      comparable: z.boolean(),
      contentExactRatio: z.number().optional(),
      styleMismatches: z.number().int().nonnegative().optional(),
      geometryP95: z.number().optional(),
    })
    .optional(),

  /*
   * Task 28.5B change 6 (integration) — the BROWSER-TO-BROWSER axis.
   *
   * `style` above compares the clone against the SiteSpec's stored style token,
   * so it can only ever see properties the OBSERVER wrote down. The 30 QA-only
   * properties have nothing to compare against there and are silently skipped.
   * These fields close that gap on the one axis that needs no observer data at
   * all: the live original's computed style vs the clone's, over the SAME
   * SiteSpec-node pairing the asset diff already uses.
   *
   * Every field is optional so a pre-28.5B QA artifact still parses, and
   * `qaOnlyStyleComparison: "unavailable"` is recorded rather than a zero
   * whenever the pairing could not be established.
   */
  qaOnlyStyleComparison: z.enum(["compared", "unavailable"]).optional(),
  qaOnlyStyleUnavailableReason: QaOnlyStyleUnavailableReasonSchema.optional(),
  /** Whether the original side was captured this iteration or reused (item 118). */
  qaOnlyStyleOriginalSource: z.enum(["live", "stored"]).optional(),
  /** Node pairs whose styles were actually compared. */
  qaOnlyStyleComparedNodes: z.number().int().nonnegative().optional(),
  /** Property comparisons performed (both sides reported a value). */
  qaOnlyStyleComparedProperties: z.number().int().nonnegative().optional(),
  /** Total QA-only property mismatches. UNCAPPED, unlike the sample list. */
  qaOnlyStyleMismatches: z.number().int().nonnegative().optional(),
  /** Paired nodes whose tags differ (document-root wrappers); NOT compared. */
  qaOnlyStyleTagMismatchedNodes: z.number().int().nonnegative().optional(),
  /** Non-zero per-property counts, sorted. Uncapped. */
  qaOnlyStyleByProperty: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** Bounded, deterministic evidence sample (document order × sorted property). */
  qaOnlyStyleSamples: z.array(QaOnlyStyleSampleSchema).optional(),

  diffIds: z.array(z.string()),
  errors: z.array(z.string()),
  timings: z.record(z.string(), z.number().int().nonnegative()),
});
export type QaPageResult = z.infer<typeof QaPageResultSchema>;

// ---------------------------------------------------------------------------
// Interaction QA (items 61–80)
// ---------------------------------------------------------------------------

/**
 * Behavior equivalence verdict (item 67).
 *
 * Deliberately NOT derived from Task 14's binding count. "98/98 implemented" is
 * a statement about the generator; "98/98 equivalent" would be a statement about
 * the browser, and only a replay can make it.
 */
export const BehaviorVerdictSchema = z.enum([
  "equivalent",
  "mismatch",
  "source-drifted",
  "unverifiable",
]);
export type BehaviorVerdict = z.infer<typeof BehaviorVerdictSchema>;

/**
 * User-visible target equivalence verdict (Task 17 §3/§6).
 *
 * The metric Task 16 called `behaviorEquivalent` was TRIGGER state transition
 * equivalence, and 28/28 of it coexisted with 2/28 correct user-visible
 * after-states. The two questions now have two names, and absence of target
 * evidence is stated (`not-observed` / `not-declared`) instead of ever
 * defaulting to `equivalent`.
 */
export const VisibleTargetVerdictSchema = z.enum([
  "equivalent",
  "mismatch",
  /** Targets exist in the model but neither side produced comparable evidence. */
  "not-observed",
  /** The pattern names no target — declared or discovered — at all. */
  "not-declared",
  "source-drifted",
  "unverifiable",
]);
export type VisibleTargetVerdict = z.infer<typeof VisibleTargetVerdictSchema>;

/** Compact before/after state of one replay side. */
export const ReplayStateSchema = z.object({
  exists: z.boolean(),
  visible: z.boolean().optional(),
  tagName: z.string().optional(),
  role: z.string().optional(),
  /** State-bearing attributes only (aria-*, open, checked, selected). */
  attributes: z.record(z.string(), z.string()).optional(),
  /** Live boolean DOM properties. */
  state: z.record(z.string(), z.boolean()).optional(),
  boundingBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  /** Computed style whitelist subset, present for target after-states. */
  computed: z.record(z.string(), z.string()).optional(),
  childElementCount: z.number().int().nonnegative().optional(),
  interactiveDescendantCount: z.number().int().nonnegative().optional(),
  /** Content fingerprint of a target region (Task 17 §6). */
  textSample: z.string().optional(),
  textLength: z.number().int().nonnegative().optional(),
});
export type ReplayState = z.infer<typeof ReplayStateSchema>;

/** One observed user-visible target region, as replayed on one side (Task 17). */
export const ObservedTargetReplaySchema = z.object({
  discoveryId: z.string(),
  /** How the region was found on this side (absent when it was not). */
  resolvedBy: z
    .enum(["html-id", "structural-path", "node-id", "mounted-id"])
    .optional(),
  before: ReplayStateSchema,
  after: ReplayStateSchema,
});
export type ObservedTargetReplay = z.infer<typeof ObservedTargetReplaySchema>;

export const ReplaySideSchema = z.object({
  attempted: z.boolean(),
  ok: z.boolean(),
  /** `resolved` / `not-found` / `ambiguous` / `load-error` / `click-error` / … */
  outcome: z.string(),
  urlChanged: z.boolean(),
  triggerBefore: ReplayStateSchema.optional(),
  triggerAfter: ReplayStateSchema.optional(),
  targetBefore: ReplayStateSchema.optional(),
  targetAfter: ReplayStateSchema.optional(),
  /** Stateful containers that appeared / disappeared / changed visibility. */
  containerDelta: z
    .object({
      added: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
      visibilityChanged: z.number().int().nonnegative(),
    })
    .optional(),
  mutationCount: z.number().int().nonnegative().optional(),
  /** Task 17 §6 — observed user-visible target regions, replayed per side. */
  observedTargets: z.array(ObservedTargetReplaySchema).optional(),
  /** Task 17 §6 — viewport screenshot paths, relative to the QA run dir. */
  beforeScreenshot: z.string().optional(),
  afterScreenshot: z.string().optional(),
  safetyEvents: z.array(z.string()),
  error: z.string().optional(),
});
export type ReplaySide = z.infer<typeof ReplaySideSchema>;

/** One verified pattern's QA, persisted as `interactions/<patternId>.json`. */
export const InteractionQaResultSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  patternId: z.string(),
  patternType: z.string(),
  mechanism: z.string(),
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  url: z.string(),
  triggerNodeId: z.string(),
  targetNodeId: z.string().optional(),
  targetIsDynamic: z.boolean(),

  original: ReplaySideSchema,
  clone: ReplaySideSchema,

  verdict: BehaviorVerdictSchema,
  /**
   * Task 17 §3 — the two questions Task 16's single `behaviorEquivalent`
   * conflated, answered separately. `verdict` above stays the combined verdict
   * (both axes) for the regression gate; these two are the published metrics.
   * Absent on v1 artifacts.
   */
  triggerState: BehaviorVerdictSchema.optional(),
  visibleTarget: VisibleTargetVerdictSchema.optional(),
  /** Named visible-target comparison fields that disagreed, sorted. */
  visibleTargetFields: z.array(z.string()).optional(),
  /** Named comparison fields that disagreed, sorted (item 66). */
  mismatchFields: z.array(z.string()),
  /**
   * Child-element counts of a mounted region on both sides (Task 16, item 101).
   * Present for every dynamic target, matching or not, so the effect of the
   * subtree capture is a measured before/after rather than an assertion.
   */
  dynamicTargetChildren: z
    .object({
      original: z.number().int().nonnegative(),
      clone: z.number().int().nonnegative(),
    })
    .optional(),
  /** Open-state computed style properties that disagreed (items 70, 71). */
  targetStyleMismatches: z.array(
    z.object({ property: z.string(), original: z.string(), clone: z.string() }),
  ),
  /** True when the original's after-state is usable new observed evidence (item 71). */
  openStateEvidenceUsable: z.boolean(),
  diffIds: z.array(z.string()),
  limitations: z.array(z.string()),
  capturedAt: z.string().optional(),
});
export type InteractionQaResult = z.infer<typeof InteractionQaResultSchema>;

/** One sampled unknown interaction's QA, `unknowns/<unknownId>.json`. */
export const UnknownQaResultSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  unknownId: z.string(),
  reason: z.string(),
  signature: z.string(),
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  url: z.string(),
  triggerNodeId: z.string().optional(),

  original: ReplaySideSchema,
  clone: ReplaySideSchema,

  /** The original showed something and the clone did nothing. */
  gapDetected: z.boolean(),
  /** Named original-side changes the clone did not reproduce. */
  originalChangeFields: z.array(z.string()),
  cloneChangeFields: z.array(z.string()),
  /** Always false. Unknown behavior is never implemented (items 80, 110). */
  autoFixEligible: z.literal(false),
  recommendation: QaRecommendationSchema,
  diffIds: z.array(z.string()),
  capturedAt: z.string().optional(),
});
export type UnknownQaResult = z.infer<typeof UnknownQaResultSchema>;

// ---------------------------------------------------------------------------
// Family audit (items 23–25)
// ---------------------------------------------------------------------------

export const FamilyAuditResultSchema = z.object({
  routeId: z.string(),
  url: z.string(),
  familyId: z.string(),
  representativePageId: z.string(),
  status: QaPageStatusSchema,
  /** Live original ↔ clone, at the desktop viewport only. */
  liveElementCount: z.number().int().nonnegative().optional(),
  cloneElementCount: z.number().int().nonnegative().optional(),
  liveTextLength: z.number().int().nonnegative().optional(),
  cloneTextLength: z.number().int().nonnegative().optional(),
  /** `|live − clone| / max(live, clone)`, 4 decimals. */
  contentDivergence: z.number().optional(),
  structureDivergence: z.number().optional(),
  majorContentMismatch: z.boolean(),
  majorStructureMismatch: z.boolean(),
  diffIds: z.array(z.string()),
  error: z.string().optional(),
});
export type FamilyAuditResult = z.infer<typeof FamilyAuditResultSchema>;

// ---------------------------------------------------------------------------
// Ids (deterministic, zero-padded, never random) — item 17
// ---------------------------------------------------------------------------

export function qaDiffId(index: number): string {
  return `qd${String(index).padStart(6, "0")}`;
}

export function qaCorrectionId(index: number): string {
  return `qc${String(index).padStart(6, "0")}`;
}

/** `q000` is the baseline; `q001…` are correction iterations (item 15). */
export function qaIterationId(index: number): string {
  return `q${String(index).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The QA input chain is broken (items 12, 176). Fail-fast. */
export class QaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaInputError";
  }
}

/** An engine invariant broke — schema, accounting, unsafe correction (item 176). */
export class QaEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaEngineError";
  }
}

/** A browser crash / timeout. NOT a fidelity mismatch (item 177). */
export class QaInfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaInfrastructureError";
  }
}
