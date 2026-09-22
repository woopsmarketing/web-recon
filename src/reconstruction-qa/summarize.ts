import { z } from "zod";
import { WORST_RANK_SIZE, type QaDiff, type QaPageResult } from "./types.js";
import type { RootCauseSummary } from "./root-cause.js";
import type { BehaviorVerdict, InteractionQaResult, UnknownQaResult } from "./types.js";

/**
 * Aggregation (items 85, 86, 149–151, 162, 163, 169).
 *
 * The hard rule here is a negative one (item 85): **no overall quality score.**
 * There is no `82.4`, no weighted composite, no letter grade. Producing one
 * would require deciding how many pixels a font mismatch is worth, and nothing
 * in this pipeline measured that exchange rate — so what a report gets is raw
 * per-dimension numbers plus per-dimension rankings.
 *
 * Rankings are also per dimension (item 86). "Worst visual", "worst geometry"
 * and "worst style" are three different lists that legitimately disagree, and a
 * single merged rank would hide the disagreement behind an average.
 *
 * Two fidelity blocks, never combined (items 150, 151):
 *
 *   SNAPSHOT fidelity  every exact-observed page/viewport — the contract.
 *   LIVE fidelity      only pages whose live original still aligns — a canary.
 *
 * Mixing them would let a site that changed under us make the clone look worse
 * (or, on a drifted page whose clone matched the new content by luck, better).
 */

export const WorstEntrySchema = z.object({
  pageId: z.string(),
  viewport: z.enum(["desktop", "mobile"]),
  url: z.string(),
  value: z.number(),
  /** Secondary figure for context (e.g. mean delta beside changed ratio). */
  detail: z.string().optional(),
});
export type WorstEntry = z.infer<typeof WorstEntrySchema>;

export const SnapshotFidelitySchema = z.object({
  pageViewportPairs: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  comparedNodes: z.number().int().nonnegative(),
  missingNodes: z.number().int().nonnegative(),
  duplicateNodes: z.number().int().nonnegative(),
  /** Σ exact text nodes / Σ compared text nodes, 4 decimals. */
  contentExactRatio: z.number(),
  contentMismatchedNodes: z.number().int().nonnegative(),
  styleComparedProperties: z.number().int().nonnegative(),
  styleMismatchedProperties: z.number().int().nonnegative(),
  /** Length differences below the engine's own 1/64 px resolution. */
  styleSubLayoutUnitMismatches: z.number().int().nonnegative(),
  /** Non-zero per-property mismatch counts across the site, sorted. */
  styleMismatchByProperty: z.record(z.string(), z.number().int().nonnegative()),
  /** Median of the per-page medians / p95s — never a mean of means. */
  geometryMedianOfMedians: z.number(),
  geometryMedianOfP95: z.number(),
  geometryMaxDelta: z.number(),
  documentHeightDeltaMedian: z.number(),
  documentHeightDeltaMax: z.number(),
  screenshotMeanDeltaMedian: z.number(),
  screenshotChangedRatioMedian: z.number(),
  /*
   * Task 28.5B change 6 — the @1 median above is kept unchanged and joined by
   * an amplitude-gated and two perceptual medians. They are reported side by
   * side because they answer different questions: @1 says "did any pixel move
   * at all", @16 says "did it move enough to see", ΔE76 says "did the colour
   * change perceptibly". Optional so pre-28.5B summaries still parse.
   */
  /** Median per-page ratio of pixels whose max channel delta is ≥ 16/255. */
  screenshotChangedRatioAt16Median: z.number().optional(),
  /** Median per-page fraction of pixels with ΔE76 > 2.3 (JND). */
  screenshotDeltaE76AboveJndRatioMedian: z.number().optional(),
  /** Median per-page fraction of pixels with ΔE76 > 10 (clearly visible). */
  screenshotDeltaE76AboveVisibleRatioMedian: z.number().optional(),
  /** Median per-page mean ΔE76. */
  screenshotDeltaE76MeanMedian: z.number().optional(),
  screenshotPairsMeasured: z.number().int().nonnegative(),
  /*
   * Task 28.6 C5 — the coverage caveat on every pixel median above.
   *
   * Those medians are computed over the OVERLAP of two PNGs. If a side stopped
   * short of the document, the median is still a real number and still speaks
   * only for the part that was captured. These two fields say how much of the
   * site the visual figures are a verdict on. Optional so pre-28.6 summaries
   * still parse; absent means "never measured", not "fully covered".
   */
  /**
   * SNAPSHOT-CLONE page/viewports where a screenshot side was truncated, failed
   * to capture, or had an unmeasurable document. Counted before the
   * availability gate, so a pair that could not be measured at all still lands
   * here rather than vanishing from the run's coverage picture.
   */
  screenshotTruncatedPairs: z.number().int().nonnegative().optional(),
  /**
   * …of those, how many produced no measurement at all (`available: false`).
   * The gap in `screenshotPairsMeasured`'s denominator, stated rather than left
   * to be inferred by subtraction from a number that is not published.
   */
  screenshotUnavailablePairs: z.number().int().nonnegative().optional(),
  /**
   * Smallest covered fraction across the run's SNAPSHOT-CLONE pairs, 4 decimals.
   *
   * The population is named because it is narrower than "the run": the
   * original-clone and snapshot-original pairs are summarized separately (see
   * {@link LiveFidelitySchema}), and a pair whose coverage is UNKNOWN carries no
   * fraction at all and therefore cannot lower this. Absent means no pair
   * carried a fraction — read `screenshotTruncatedPairs` and
   * `screenshotUnavailablePairs` before reading its absence as "fully covered".
   */
  screenshotMinCoveredFraction: z.number().optional(),
  assetFailures: z.number().int().nonnegative(),
  /** JavaScript errors only. Blocked assets are counted separately (item 54). */
  runtimeErrors: z.number().int().nonnegative(),
  blockedAssetMessages: z.number().int().nonnegative(),
  unstablePages: z.number().int().nonnegative(),

  // --- Task 16 observed-initial-state dimensions (items 89, 91) -------------
  /** Nodes carrying an observed `scrollState` across the compared pairs. */
  scrollStateNodes: z.number().int().nonnegative(),
  /** …of those, how many were at a non-zero offset (the ones that matter). */
  scrolledNodes: z.number().int().nonnegative(),
  /** Scrolled nodes whose clone offset matches within the tolerance. */
  scrollRestoredNodes: z.number().int().nonnegative(),
  scrollMismatchedNodes: z.number().int().nonnegative(),
  /** `<img>` nodes in the compared SiteSpec trees. */
  imageNodes: z.number().int().nonnegative(),
  /** …of those, how many carry an asset reference (the A1 fix's own metric). */
  assetBoundImageNodes: z.number().int().nonnegative(),
  /** SiteSpec `<img>` with NO asset reference — an OBSERVATION gap. */
  assetUnboundImageNodes: z.number().int().nonnegative(),
  /** Bound in the IR, no `src` in the clone — a RECONSTRUCTION gap. */
  assetOccurrenceLost: z.number().int().nonnegative(),
});
export type SnapshotFidelity = z.infer<typeof SnapshotFidelitySchema>;

export const LiveFidelitySchema = z.object({
  /** Page/viewports whose live original still aligned structurally. */
  comparablePairs: z.number().int().nonnegative(),
  contentExactRatio: z.number(),
  styleMismatches: z.number().int().nonnegative(),
  geometryP95Median: z.number(),
  screenshotChangedRatioMedian: z.number(),
  /** Task 28.5B change 6 — the same pair measured at ≥ 16/255 amplitude. */
  screenshotChangedRatioAt16Median: z.number().optional(),
  /** Task 28.5B change 6 — …and perceptually, ΔE76 > 2.3. */
  screenshotDeltaE76AboveJndRatioMedian: z.number().optional(),

  /*
   * Task 28.6 C5 — the coverage caveat on the three visual medians above.
   *
   * They are medians over ORIGINAL-CLONE pairs, and those pairs are computed
   * over the overlap of two full-page PNGs exactly like the snapshot-clone ones.
   * When C5 added coverage accounting it added it only to
   * {@link SnapshotFidelitySchema}, so this half of the report could still read
   * as a whole-page verdict over a capped, short or unmeasurable capture — the
   * precise failure C5 exists to remove, left standing in the other summary.
   *
   * Same three counters, same population rule, same meaning. Optional so a
   * pre-28.6 summary parses; absent means "never measured", not "fully covered".
   */
  /** ORIGINAL-CLONE page/viewports where a side was truncated, missing or unmeasurable. */
  screenshotTruncatedPairs: z.number().int().nonnegative().optional(),
  /** …of those, how many produced no measurement at all. */
  screenshotUnavailablePairs: z.number().int().nonnegative().optional(),
  /** Smallest covered fraction across the run's ORIGINAL-CLONE pairs, 4 decimals. */
  screenshotMinCoveredFraction: z.number().optional(),

  /*
   * Task 28.5B change 6 (integration) — the QA-only style channel.
   *
   * POPULATION NOTE, because it is deliberately different from the fields above:
   * those are drift-free pages only, while these count every page whose live
   * original STRUCTURALLY aligned with the SiteSpec, which is the condition the
   * pairing actually needs. `qaOnlyStyleComparedPairs` is the denominator and
   * `qaOnlyStyleUnavailablePairs` names what could not be compared at all, so
   * "0 mismatches" can never be read as "0 out of nothing". Optional, so a
   * pre-28.5B summary still parses and reads as absent rather than as zero.
   */
  /** Page/viewports where the original↔clone QA-only comparison actually ran. */
  qaOnlyStyleComparedPairs: z.number().int().nonnegative().optional(),
  /** …and where it could not run; see the per-page `unavailableReason`. */
  qaOnlyStyleUnavailablePairs: z.number().int().nonnegative().optional(),
  /** Σ QA-only property mismatches over the compared pairs. Uncapped. */
  qaOnlyStyleMismatchTotal: z.number().int().nonnegative().optional(),
  /** Median per-page QA-only mismatch count — never a mean of means. */
  qaOnlyStyleMismatchMedian: z.number().optional(),
  /** Non-zero per-property QA-only counts across the site, sorted. */
  qaOnlyStyleMismatchByProperty: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
});
export type LiveFidelity = z.infer<typeof LiveFidelitySchema>;

export const SourceDriftSummaryTotalsSchema = z.object({
  attempted: z.number().int().nonnegative(),
  structurallyAligned: z.number().int().nonnegative(),
  structuralDrift: z.number().int().nonnegative(),
  contentDriftPairs: z.number().int().nonnegative(),
  contentDriftNodes: z.number().int().nonnegative(),
  styleDriftPairs: z.number().int().nonnegative(),
  styleDriftProperties: z.number().int().nonnegative(),
  /** Non-zero per-property drift counts, sorted. */
  styleDriftByProperty: z.record(z.string(), z.number().int().nonnegative()),
  loadFailures: z.number().int().nonnegative(),
});
export type SourceDriftTotals = z.infer<typeof SourceDriftSummaryTotalsSchema>;

export const BehaviorSummarySchema = z.object({
  sourcePatternInstances: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  /**
   * Task 17 §3 — what Task 16 published as `behaviorEquivalent` was TRIGGER
   * state transition equivalence, and its name now says so. The user-visible
   * question gets its own axis below, and absence of target evidence is a
   * counted state (`not-observed` / `not-declared`), never an `equivalent`.
   */
  triggerStateEquivalent: z.number().int().nonnegative(),
  triggerStateMismatch: z.number().int().nonnegative(),
  visibleTargetEquivalent: z.number().int().nonnegative(),
  visibleTargetMismatch: z.number().int().nonnegative(),
  visibleTargetNotObserved: z.number().int().nonnegative(),
  visibleTargetNotDeclared: z.number().int().nonnegative(),
  /** Combined-verdict counts (both axes), the regression gate's measure. */
  behaviorEquivalent: z.number().int().nonnegative(),
  behaviorMismatch: z.number().int().nonnegative(),
  sourceDrifted: z.number().int().nonnegative(),
  unverifiable: z.number().int().nonnegative(),
  /** Non-zero counts per pattern type, sorted. */
  byPatternType: z.record(z.string(), z.number().int().nonnegative()),
  /** Non-zero verdict counts per pattern type, `type|verdict` keys. */
  verdictByPatternType: z.record(z.string(), z.number().int().nonnegative()),
  dynamicTargetsCompared: z.number().int().nonnegative(),
  dynamicTargetContentGaps: z.number().int().nonnegative(),
  /** Dynamic targets where the clone mounted observed children (Task 16). */
  dynamicTargetsWithCloneChildren: z.number().int().nonnegative(),
  /** …of those, how many matched the replayed original's child count exactly. */
  dynamicTargetChildCountMatches: z.number().int().nonnegative(),
  openStateEvidenceUsable: z.number().int().nonnegative(),
  targetStyleMismatchPatterns: z.number().int().nonnegative(),
  /**
   * Patterns whose declared target is their own trigger, so the panel axis was
   * not evidence: selection equivalence only, never full tab equivalence (item 72).
   */
  tabPanelUnverified: z.number().int().nonnegative(),
});
export type BehaviorSummary = z.infer<typeof BehaviorSummarySchema>;

export const UnknownSummarySchema = z.object({
  signatureGroups: z.number().int().nonnegative(),
  sampled: z.number().int().nonnegative(),
  gapsDetected: z.number().int().nonnegative(),
  cloneNoOp: z.number().int().nonnegative(),
  unverifiable: z.number().int().nonnegative(),
  /** Always 0. Unknown behavior is never implemented (items 80, 110). */
  autoFixed: z.literal(0),
});
export type UnknownSummary = z.infer<typeof UnknownSummarySchema>;

export const FamilyAuditSummarySchema = z.object({
  routesAudited: z.number().int().nonnegative(),
  majorContentMismatch: z.number().int().nonnegative(),
  majorStructureMismatch: z.number().int().nonnegative(),
  requiresExactObservation: z.number().int().nonnegative(),
  /** Always 0 (item 111). */
  autoFixed: z.literal(0),
});
export type FamilyAuditSummary = z.infer<typeof FamilyAuditSummarySchema>;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return Math.round(value * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key]!;
  return out;
}

/** Aggregate the snapshot-contract fidelity across every page/viewport. */
export function summarizeSnapshotFidelity(
  pages: readonly QaPageResult[],
): SnapshotFidelity {
  let comparedNodes = 0;
  let missingNodes = 0;
  let duplicateNodes = 0;
  let exactText = 0;
  let comparedText = 0;
  let contentMismatchedNodes = 0;
  let styleCompared = 0;
  let styleMismatched = 0;
  let styleSubLayoutUnit = 0;
  let assetFailures = 0;
  let runtimeErrors = 0;
  let blockedAssetMessages = 0;
  let unstablePages = 0;
  let completed = 0;
  // Task 16 observed-initial-state accounting (items 89, 91).
  let scrollStateNodes = 0;
  let scrolledNodes = 0;
  let scrollRestoredNodes = 0;
  let scrollMismatchedNodes = 0;
  let imageNodes = 0;
  let assetBoundImageNodes = 0;
  let assetUnboundImageNodes = 0;
  let assetOccurrenceLost = 0;
  const styleByProperty: Record<string, number> = {};
  const medians: number[] = [];
  const p95s: number[] = [];
  const maxima: number[] = [];
  const documentHeightDeltas: number[] = [];
  const screenshotMeanDeltas: number[] = [];
  const screenshotChangedRatios: number[] = [];
  const screenshotChangedRatiosAt16: number[] = [];
  const screenshotDeltaE76AboveJnd: number[] = [];
  const screenshotDeltaE76AboveVisible: number[] = [];
  const screenshotDeltaE76Means: number[] = [];
  let screenshotPairs = 0;
  let screenshotTruncatedPairs = 0;
  /** snapshot-clone pairs that could not be measured at all. The denominator's gap. */
  let screenshotUnavailablePairs = 0;
  const screenshotCoveredFractions: number[] = [];

  for (const page of pages) {
    if (page.status === "complete") completed++;
    comparedNodes += page.cloneMappedNodes;
    missingNodes += page.cloneMissingNodes;
    duplicateNodes += page.cloneDuplicateNodes;
    exactText += page.content.exactEqual;
    comparedText += page.content.comparedTextNodes;
    contentMismatchedNodes +=
      page.content.changed + page.content.missing + page.content.extra;
    styleCompared += page.style.comparedProperties;
    styleMismatched += page.style.mismatchedProperties;
    styleSubLayoutUnit += page.style.subLayoutUnitLengthMismatches;
    for (const [property, count] of Object.entries(page.style.byProperty)) {
      styleByProperty[property] = (styleByProperty[property] ?? 0) + count;
    }
    assetFailures +=
      page.asset.cloneImagesFailed + page.asset.cloneImagesWithoutSrc;
    runtimeErrors += page.runtime.cloneJsErrors;
    blockedAssetMessages += page.runtime.cloneBlockedAssetMessages;
    if (page.stability.measured && !page.stability.stable) unstablePages++;
    if (page.scrollState) {
      scrollStateNodes += page.scrollState.expectedNodes;
      scrolledNodes += page.scrollState.expectedScrolledNodes;
      scrollRestoredNodes += page.scrollState.restoredNodes;
      scrollMismatchedNodes += page.scrollState.mismatchedNodes;
    }
    if (page.assetOccurrence) {
      imageNodes += page.assetOccurrence.specImageNodes;
      assetBoundImageNodes += page.assetOccurrence.specAssetBoundImageNodes;
      assetUnboundImageNodes += page.assetOccurrence.unboundInSpec;
      assetOccurrenceLost += page.assetOccurrence.lostInReconstruction;
    }
    if (page.geometry.comparedNodes > 0) {
      medians.push(page.geometry.y.median);
      p95s.push(page.geometry.y.p95);
      maxima.push(page.geometry.y.max);
    }
    if (page.documentGeometry.clone) {
      documentHeightDeltas.push(
        Math.abs(
          page.documentGeometry.clone.documentHeight -
            page.documentGeometry.snapshot.documentHeight,
        ),
      );
    }
    for (const metric of page.screenshots) {
      if (metric.pair !== "snapshot-clone") continue;
      /*
       * Task 28.6 C5 — counted, never inferred from silence. A pre-28.6 metric
       * has neither field and contributes to neither counter.
       *
       * COUNTED BEFORE THE AVAILABILITY GATE, on purpose. The gate used to read
       * `|| !metric.available`, which skipped exactly the case C5 created: a
       * page whose clone screenshot failed outright now produces
       * `available: false` WITH `coverageTruncated: true`, and it contributed
       * nothing to `screenshotTruncatedPairs` and never lowered
       * `screenshotMinCoveredFraction`. The per-page finding still fired, but
       * the run summary — the artifact a reader trusts for the whole-run number
       * — read as fully covered. A pair that could not be measured is the
       * strongest possible evidence that the run did not see the whole site.
       */
      if (metric.coverageTruncated === true) screenshotTruncatedPairs++;
      if (metric.coveredFraction !== undefined) {
        screenshotCoveredFractions.push(metric.coveredFraction);
      }
      if (!metric.available) {
        screenshotUnavailablePairs++;
        continue;
      }
      screenshotPairs++;
      if (metric.meanAbsoluteRgbDelta !== undefined) {
        screenshotMeanDeltas.push(metric.meanAbsoluteRgbDelta);
      }
      if (metric.changedPixelRatio !== undefined) {
        screenshotChangedRatios.push(metric.changedPixelRatio);
      }
      // Absent on a pre-28.5B artifact — skipped, never defaulted to 0, which
      // would read as "no visible difference" for a run that never measured.
      if (metric.changedRatioAt16 !== undefined) {
        screenshotChangedRatiosAt16.push(metric.changedRatioAt16);
      }
      if (metric.deltaE76AboveJndRatio !== undefined) {
        screenshotDeltaE76AboveJnd.push(metric.deltaE76AboveJndRatio);
      }
      if (metric.deltaE76AboveVisibleRatio !== undefined) {
        screenshotDeltaE76AboveVisible.push(metric.deltaE76AboveVisibleRatio);
      }
      if (metric.deltaE76Mean !== undefined) {
        screenshotDeltaE76Means.push(metric.deltaE76Mean);
      }
    }
  }

  return {
    pageViewportPairs: pages.length,
    completed,
    comparedNodes,
    missingNodes,
    duplicateNodes,
    contentExactRatio: ratio(exactText, comparedText),
    contentMismatchedNodes,
    styleComparedProperties: styleCompared,
    styleMismatchedProperties: styleMismatched,
    styleSubLayoutUnitMismatches: styleSubLayoutUnit,
    styleMismatchByProperty: sortRecord(styleByProperty),
    geometryMedianOfMedians: median(medians),
    geometryMedianOfP95: median(p95s),
    geometryMaxDelta: maxima.length === 0 ? 0 : Math.max(...maxima),
    documentHeightDeltaMedian: median(documentHeightDeltas),
    documentHeightDeltaMax:
      documentHeightDeltas.length === 0 ? 0 : Math.max(...documentHeightDeltas),
    screenshotMeanDeltaMedian: median(screenshotMeanDeltas),
    screenshotChangedRatioMedian: median(screenshotChangedRatios),
    // Left ABSENT, not 0, when nothing measured the channel — `median([])` is
    // 0 and a 0 here would read as "no visible difference measured".
    ...(screenshotChangedRatiosAt16.length > 0
      ? { screenshotChangedRatioAt16Median: median(screenshotChangedRatiosAt16) }
      : {}),
    ...(screenshotDeltaE76AboveJnd.length > 0
      ? { screenshotDeltaE76AboveJndRatioMedian: median(screenshotDeltaE76AboveJnd) }
      : {}),
    ...(screenshotDeltaE76AboveVisible.length > 0
      ? {
          screenshotDeltaE76AboveVisibleRatioMedian: median(
            screenshotDeltaE76AboveVisible,
          ),
        }
      : {}),
    ...(screenshotDeltaE76Means.length > 0
      ? { screenshotDeltaE76MeanMedian: median(screenshotDeltaE76Means) }
      : {}),
    screenshotPairsMeasured: screenshotPairs,
    /*
     * Emitted whenever ANY snapshot-clone pair existed, not only when at least
     * one carried a covered fraction. A run whose pairs were all unmeasurable
     * has an empty `screenshotCoveredFractions` and a non-zero
     * `screenshotTruncatedPairs`, and the old condition dropped both — leaving
     * a summary with no coverage fields at all, which reads as a pre-28.6
     * artifact rather than as a run that saw nothing.
     */
    ...(screenshotPairs + screenshotUnavailablePairs > 0
      ? {
          screenshotTruncatedPairs,
          screenshotUnavailablePairs,
          ...(screenshotCoveredFractions.length > 0
            ? { screenshotMinCoveredFraction: Math.min(...screenshotCoveredFractions) }
            : {}),
        }
      : {}),
    assetFailures,
    runtimeErrors,
    blockedAssetMessages,
    unstablePages,
    scrollStateNodes,
    scrolledNodes,
    scrollRestoredNodes,
    scrollMismatchedNodes,
    imageNodes,
    assetBoundImageNodes,
    assetUnboundImageNodes,
    assetOccurrenceLost,
  };
}

/** Live-original ↔ clone figures, DRIFT-FREE pages only (item 151). */
export function summarizeLiveFidelity(
  pages: readonly QaPageResult[],
): LiveFidelity {
  const comparable = pages.filter((page) => page.liveFidelity?.comparable === true);
  const ratios = comparable
    .map((page) => page.liveFidelity?.contentExactRatio)
    .filter((value): value is number => value !== undefined);
  const styleMismatches = comparable.reduce(
    (sum, page) => sum + (page.liveFidelity?.styleMismatches ?? 0),
    0,
  );
  const geometry = comparable
    .map((page) => page.liveFidelity?.geometryP95)
    .filter((value): value is number => value !== undefined);
  const originalClone = comparable
    .map((page) => page.screenshots.find((metric) => metric.pair === "original-clone"))
    .filter((metric): metric is NonNullable<typeof metric> => metric !== undefined);
  /*
   * Task 28.6 C5 — how much of the page the three visual medians below speak
   * for. Counted over EVERY original-clone metric, available or not, for the
   * same reason the snapshot-clone counters are: a pair that could not be
   * measured is evidence the run did not see the whole site, and dropping it
   * makes the summary read as fully covered.
   */
  let liveTruncatedPairs = 0;
  let liveUnavailablePairs = 0;
  const liveCoveredFractions: number[] = [];
  for (const metric of originalClone) {
    if (metric.coverageTruncated === true) liveTruncatedPairs++;
    if (metric.coveredFraction !== undefined) liveCoveredFractions.push(metric.coveredFraction);
    if (!metric.available) liveUnavailablePairs++;
  }
  const visual = originalClone
    .map((metric) => metric.changedPixelRatio)
    .filter((value): value is number => value !== undefined);
  const visualAt16 = originalClone
    .map((metric) => metric.changedRatioAt16)
    .filter((value): value is number => value !== undefined);
  const visualJnd = originalClone
    .map((metric) => metric.deltaE76AboveJndRatio)
    .filter((value): value is number => value !== undefined);
  /*
   * Task 28.5B change 6 (integration). Counted over every page that RECORDED a
   * verdict, not just the drift-free ones — see the schema's population note.
   * A page with no `qaOnlyStyleComparison` at all is a pre-28.5B artifact and
   * contributes to neither counter, which is why both stay absent rather than
   * becoming 0 on an old run.
   */
  const qaOnlyCompared = pages.filter(
    (page) => page.qaOnlyStyleComparison === "compared",
  );
  const qaOnlyUnavailable = pages.filter(
    (page) => page.qaOnlyStyleComparison === "unavailable",
  );
  const qaOnlyCounts = qaOnlyCompared.map((page) => page.qaOnlyStyleMismatches ?? 0);
  const qaOnlyByProperty: Record<string, number> = {};
  for (const page of qaOnlyCompared) {
    for (const [property, count] of Object.entries(page.qaOnlyStyleByProperty ?? {})) {
      qaOnlyByProperty[property] = (qaOnlyByProperty[property] ?? 0) + count;
    }
  }
  const qaOnlyRecorded = qaOnlyCompared.length + qaOnlyUnavailable.length;

  return {
    comparablePairs: comparable.length,
    contentExactRatio: median(ratios),
    styleMismatches,
    geometryP95Median: median(geometry),
    screenshotChangedRatioMedian: median(visual),
    ...(visualAt16.length > 0
      ? { screenshotChangedRatioAt16Median: median(visualAt16) }
      : {}),
    ...(visualJnd.length > 0
      ? { screenshotDeltaE76AboveJndRatioMedian: median(visualJnd) }
      : {}),
    ...(originalClone.length > 0
      ? {
          screenshotTruncatedPairs: liveTruncatedPairs,
          screenshotUnavailablePairs: liveUnavailablePairs,
          ...(liveCoveredFractions.length > 0
            ? { screenshotMinCoveredFraction: Math.min(...liveCoveredFractions) }
            : {}),
        }
      : {}),
    ...(qaOnlyRecorded > 0
      ? {
          qaOnlyStyleComparedPairs: qaOnlyCompared.length,
          qaOnlyStyleUnavailablePairs: qaOnlyUnavailable.length,
          qaOnlyStyleMismatchTotal: qaOnlyCounts.reduce((sum, n) => sum + n, 0),
          qaOnlyStyleMismatchMedian: median(qaOnlyCounts),
          qaOnlyStyleMismatchByProperty: sortRecord(qaOnlyByProperty),
        }
      : {}),
  };
}

/** Live-original drift rates, which item 149 calls the most important numbers. */
export function summarizeSourceDrift(
  pages: readonly QaPageResult[],
): SourceDriftTotals {
  let attempted = 0;
  let aligned = 0;
  let structuralDrift = 0;
  let contentDriftPairs = 0;
  let contentDriftNodes = 0;
  let styleDriftPairs = 0;
  let styleDriftProperties = 0;
  let loadFailures = 0;
  const byProperty: Record<string, number> = {};

  for (const page of pages) {
    if (!page.sourceDrift.attempted) continue;
    attempted++;
    if (page.status === "source-load-error") {
      loadFailures++;
      continue;
    }
    if (page.sourceDrift.structurallyAligned) aligned++;
    else structuralDrift++;
    if (page.sourceDrift.changedTextNodes > 0) {
      contentDriftPairs++;
      contentDriftNodes += page.sourceDrift.changedTextNodes;
    }
    if (page.sourceDrift.changedStyleProperties > 0) {
      styleDriftPairs++;
      styleDriftProperties += page.sourceDrift.changedStyleProperties;
    }
    for (const [property, count] of Object.entries(page.sourceDrift.styleDriftByProperty)) {
      byProperty[property] = (byProperty[property] ?? 0) + count;
    }
  }

  return {
    attempted,
    structurallyAligned: aligned,
    structuralDrift,
    contentDriftPairs,
    contentDriftNodes,
    styleDriftPairs,
    styleDriftProperties,
    styleDriftByProperty: sortRecord(byProperty),
    loadFailures,
  };
}

export function summarizeBehavior(
  results: readonly InteractionQaResult[],
  sourcePatternInstances: number,
): BehaviorSummary {
  const counts: Record<BehaviorVerdict, number> = {
    equivalent: 0,
    mismatch: 0,
    "source-drifted": 0,
    unverifiable: 0,
  };
  const byPatternType: Record<string, number> = {};
  const verdictByPatternType: Record<string, number> = {};
  let dynamicTargetsCompared = 0;
  let dynamicTargetContentGaps = 0;
  let dynamicTargetsWithCloneChildren = 0;
  let dynamicTargetChildCountMatches = 0;
  let openStateEvidenceUsable = 0;
  let targetStyleMismatchPatterns = 0;
  let tabPanelUnverified = 0;
  const triggerCounts: Record<BehaviorVerdict, number> = {
    equivalent: 0,
    mismatch: 0,
    "source-drifted": 0,
    unverifiable: 0,
  };
  const visibleCounts = {
    equivalent: 0,
    mismatch: 0,
    "not-observed": 0,
    "not-declared": 0,
  };

  for (const result of results) {
    counts[result.verdict]++;
    // Task 17 §3 — the two axes. A v1 artifact (no axis fields) counts its
    // combined verdict as the trigger axis (which is what it measured) and
    // contributes nothing to the visible-target axis.
    triggerCounts[result.triggerState ?? result.verdict]++;
    const visible = result.visibleTarget;
    if (visible === "equivalent") visibleCounts.equivalent++;
    else if (visible === "mismatch") visibleCounts.mismatch++;
    else if (visible === "not-observed") visibleCounts["not-observed"]++;
    else if (visible === "not-declared") visibleCounts["not-declared"]++;
    byPatternType[result.patternType] = (byPatternType[result.patternType] ?? 0) + 1;
    const key = `${result.patternType}|${result.verdict}`;
    verdictByPatternType[key] = (verdictByPatternType[key] ?? 0) + 1;
    if (result.targetIsDynamic) {
      dynamicTargetsCompared++;
      const originalChildren = result.original.targetAfter?.childElementCount ?? 0;
      const cloneChildren = result.clone.targetAfter?.childElementCount ?? 0;
      if (originalChildren > 0 && cloneChildren === 0) dynamicTargetContentGaps++;
      // Task 16: the clone mounting observed children at all is the first
      // measurable improvement; matching the replayed original's count exactly
      // is the second, and they are reported apart because a region whose
      // contents depend on live data can legitimately do the first only.
      if (cloneChildren > 0) {
        dynamicTargetsWithCloneChildren++;
        if (originalChildren === cloneChildren) dynamicTargetChildCountMatches++;
      }
    }
    if (result.openStateEvidenceUsable) openStateEvidenceUsable++;
    if (result.targetStyleMismatches.length > 0) targetStyleMismatchPatterns++;
    if (result.limitations.includes("tabpanel-unverified")) tabPanelUnverified++;
  }

  return {
    sourcePatternInstances,
    attempted: results.length,
    triggerStateEquivalent: triggerCounts.equivalent,
    triggerStateMismatch: triggerCounts.mismatch,
    visibleTargetEquivalent: visibleCounts.equivalent,
    visibleTargetMismatch: visibleCounts.mismatch,
    visibleTargetNotObserved: visibleCounts["not-observed"],
    visibleTargetNotDeclared: visibleCounts["not-declared"],
    behaviorEquivalent: counts.equivalent,
    behaviorMismatch: counts.mismatch,
    sourceDrifted: counts["source-drifted"],
    unverifiable: counts.unverifiable,
    byPatternType: sortRecord(byPatternType),
    verdictByPatternType: sortRecord(verdictByPatternType),
    dynamicTargetsCompared,
    dynamicTargetContentGaps,
    dynamicTargetsWithCloneChildren,
    dynamicTargetChildCountMatches,
    openStateEvidenceUsable,
    targetStyleMismatchPatterns,
    tabPanelUnverified,
  };
}

export function summarizeUnknowns(
  results: readonly UnknownQaResult[],
  signatureGroups: number,
): UnknownSummary {
  let gapsDetected = 0;
  let cloneNoOp = 0;
  let unverifiable = 0;
  for (const result of results) {
    if (result.gapDetected) gapsDetected++;
    if (result.cloneChangeFields.length === 0) cloneNoOp++;
    if (!result.original.ok) unverifiable++;
  }
  return {
    signatureGroups,
    sampled: results.length,
    gapsDetected,
    cloneNoOp,
    unverifiable,
    autoFixed: 0,
  };
}

/** `n/a` rather than 0 for a channel a pre-28.5B artifact never measured. */
function fmt(value: number | undefined): string {
  return value === undefined ? "n/a" : String(value);
}

/** Per-dimension worst lists. Never one merged rank (item 86). */
export function worstPages(
  pages: readonly QaPageResult[],
  size: number = WORST_RANK_SIZE,
): {
  visual: WorstEntry[];
  geometry: WorstEntry[];
  style: WorstEntry[];
} {
  const visual: WorstEntry[] = [];
  const geometry: WorstEntry[] = [];
  const style: WorstEntry[] = [];

  for (const page of pages) {
    const metric = page.screenshots.find((entry) => entry.pair === "snapshot-clone");
    if (metric?.available && metric.changedPixelRatio !== undefined) {
      visual.push({
        pageId: page.pageId,
        viewport: page.viewport,
        url: page.url,
        value: metric.changedPixelRatio,
        /*
         * Task 28.5B change 6: the rank VALUE is still the historical @1 ratio
         * (so the ranking is comparable with every earlier run), but the detail
         * prints the other channels beside it, because @1 alone routinely says
         * 0.98 for a page a human cannot tell apart. `n/a` marks a pre-28.5B
         * artifact that never measured the channel.
         */
        detail:
          `@1 ${metric.changedPixelRatio}` +
          ` · @16 ${fmt(metric.changedRatioAt16)}` +
          ` · ΔE76>2.3 ${fmt(metric.deltaE76AboveJndRatio)}` +
          ` · ΔE76>10 ${fmt(metric.deltaE76AboveVisibleRatio)}` +
          ` · mean ΔE76 ${fmt(metric.deltaE76Mean)}` +
          ` · mean Δ ${metric.meanAbsoluteRgbDelta ?? 0}` +
          ` · mean maxΔ ${fmt(metric.meanMaxChannelDelta)}` +
          ` · common ${fmt(metric.commonAreaRatio)}` +
          ` · height Δ ${metric.heightDelta ?? 0}px` +
          /*
           * Task 28.8 FAST change 3: every ratio to the left of here was computed
           * over the min-crop of the two captures. This is the strip that crop
           * left out and how much ink is in it, so a low @1 measured on 700 of
           * 862 columns can never again read as a whole-image pass. `n/a` marks
           * a pre-28.8-FAST artifact that never measured the band — it is never
           * rendered as "none".
           */
          ` · uncompared ${
            metric.uncomparedPixels === undefined
              ? "n/a"
              : metric.uncomparedPixels === 0
                ? "none"
                : `${metric.uncomparedWidthPx ?? 0}×${metric.uncomparedHeightPx ?? 0}px band, ${metric.uncomparedPixels}px ${
                    metric.uncomparedMeasured === false
                      ? "ink unmeasurable"
                      : `ink ${fmt(metric.uncomparedInkRatio)}${
                          (metric.uncomparedSampledPixels ?? metric.uncomparedPixels) <
                          (metric.uncomparedPixels ?? 0)
                            ? ` (sampled ${metric.uncomparedSampledPixels}px)`
                            : ""
                        }`
                  }`
          }` +
          /*
           * Task 28.6 C5: `common` above is image-to-image. This is
           * image-to-DOCUMENT, and it is what stops a low @1 in this ranking
           * from reading as a whole-page pass. `n/a` marks a pre-28.6 artifact
           * that never measured coverage — it is never rendered as 1.
           */
          ` · page covered ${
            metric.coveredFraction === undefined
              ? "n/a"
              : `${metric.coveredFraction}${metric.coverageTruncated ? " TRUNCATED" : ""}`
          }` +
          /*
           * Task 28.5B change 6 (integration): the QA-only style channel prints
           * beside the pixel channels because it answers the question they
           * cannot — "did a property the Observer never records differ?".
           * `unavailable` is printed as such; it is never rendered as 0.
           */
          ` · QA-only style ${
            page.qaOnlyStyleComparison === "compared"
              ? `${page.qaOnlyStyleMismatches ?? 0} of ${page.qaOnlyStyleComparedProperties ?? 0}`
              : page.qaOnlyStyleComparison === "unavailable"
                ? `unavailable (${page.qaOnlyStyleUnavailableReason ?? "unknown"})`
                : "n/a"
          }`,
      });
    }
    if (page.geometry.comparedNodes > 0) {
      geometry.push({
        pageId: page.pageId,
        viewport: page.viewport,
        url: page.url,
        value: page.geometry.y.p95,
        detail: `median ${page.geometry.y.median}px, max ${page.geometry.y.max}px, ${page.geometry.mismatchedNodes} nodes`,
      });
    }
    style.push({
      pageId: page.pageId,
      viewport: page.viewport,
      url: page.url,
      value: page.style.mismatchedProperties,
      detail: `${page.style.mismatchedNodes} nodes of ${page.style.comparedNodes}`,
    });
  }

  const rank = (entries: WorstEntry[]): WorstEntry[] =>
    entries
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        const page = a.pageId.localeCompare(b.pageId);
        if (page !== 0) return page;
        return a.viewport.localeCompare(b.viewport);
      })
      .slice(0, size);

  return { visual: rank(visual), geometry: rank(geometry), style: rank(style) };
}

/** Every diff id a correction claims to resolve. */
export function diffIdsOfCorrections(
  corrections: readonly { diffIds: readonly string[] }[],
): Set<string> {
  const out = new Set<string>();
  for (const correction of corrections) {
    for (const id of correction.diffIds) out.add(id);
  }
  return out;
}

/** The top-N most frequently mismatching computed-style properties (item 183.6). */
export function topStyleProperties(
  byProperty: Readonly<Record<string, number>>,
  size = 10,
): Array<{ property: string; count: number }> {
  return Object.entries(byProperty)
    .map(([property, count]) => ({ property, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.property.localeCompare(b.property);
    })
    .slice(0, size);
}

export interface QaSummaryInput {
  pages: readonly QaPageResult[];
  interactions: readonly InteractionQaResult[];
  unknowns: readonly UnknownQaResult[];
  signatureGroups: number;
  sourcePatternInstances: number;
  rootCauses: RootCauseSummary;
  diffs: readonly QaDiff[];
}

export interface QaSummary {
  snapshotFidelity: SnapshotFidelity;
  liveFidelity: LiveFidelity;
  sourceDrift: SourceDriftTotals;
  behavior: BehaviorSummary;
  unknowns: UnknownSummary;
  rootCauses: RootCauseSummary;
  worst: ReturnType<typeof worstPages>;
  topStyleProperties: Array<{ property: string; count: number }>;
}

export function summarizeQa(input: QaSummaryInput): QaSummary {
  const snapshotFidelity = summarizeSnapshotFidelity(input.pages);
  return {
    snapshotFidelity,
    liveFidelity: summarizeLiveFidelity(input.pages),
    sourceDrift: summarizeSourceDrift(input.pages),
    behavior: summarizeBehavior(input.interactions, input.sourcePatternInstances),
    unknowns: summarizeUnknowns(input.unknowns, input.signatureGroups),
    rootCauses: input.rootCauses,
    worst: worstPages(input.pages),
    topStyleProperties: topStyleProperties(snapshotFidelity.styleMismatchByProperty),
  };
}
