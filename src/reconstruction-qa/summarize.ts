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
  screenshotPairsMeasured: z.number().int().nonnegative(),
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
  let screenshotPairs = 0;

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
      if (metric.pair !== "snapshot-clone" || !metric.available) continue;
      screenshotPairs++;
      if (metric.meanAbsoluteRgbDelta !== undefined) {
        screenshotMeanDeltas.push(metric.meanAbsoluteRgbDelta);
      }
      if (metric.changedPixelRatio !== undefined) {
        screenshotChangedRatios.push(metric.changedPixelRatio);
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
    screenshotPairsMeasured: screenshotPairs,
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
  const visual = comparable
    .map(
      (page) =>
        page.screenshots.find((metric) => metric.pair === "original-clone")
          ?.changedPixelRatio,
    )
    .filter((value): value is number => value !== undefined);
  return {
    comparablePairs: comparable.length,
    contentExactRatio: median(ratios),
    styleMismatches,
    geometryP95Median: median(geometry),
    screenshotChangedRatioMedian: median(visual),
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
        detail: `mean Δ ${metric.meanAbsoluteRgbDelta ?? 0}, height Δ ${metric.heightDelta ?? 0}px`,
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
