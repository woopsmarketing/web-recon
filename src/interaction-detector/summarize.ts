import type { SiteObservation } from "../multi-observer/types.js";
import {
  CAPABILITY_ORDER,
  GUARD_FLAG_ORDER,
  PRIORITY_ORDER,
  type CountMap,
  type PageInteractionAnalysis,
  type PageInteractionSummary,
  type PriorityCounts,
  type PrioritySplitCounts,
  type SitePageInteractionSummary,
  type SitePageViewportSummary,
  type ValidationInteractionComparison,
  type ValidationInteractionViewportComparison,
  type ViewportInteractionAnalysis,
  type ViewportSplitCounts,
} from "./types.js";

/**
 * Deterministic aggregation (Task 10, items 59–66, 103).
 *
 * Pure arithmetic over already-detected candidates: no re-detection, no I/O, no
 * verdicts. Two rules shape everything here:
 *
 *  - **Never embed the candidate arrays twice.** The site manifest holds counts
 *    and a relative path to each page artifact (item 60). A site with 19 pages
 *    would otherwise carry every candidate in two files.
 *  - **Never turn a measurement into a judgement.** `candidateDensity` and the
 *    representative↔sample comparisons are diagnostics; nothing in this module
 *    decides that a page is "good", a family is "wrong", or that a page with
 *    zero candidates has no interactions (item 66).
 */

/** Sum count maps in canonical key order, dropping zero entries. */
function mergeCounts(order: readonly string[], sources: readonly CountMap[]): CountMap {
  const totals = new Map<string, number>();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }
  const out: CountMap = {};
  for (const key of order) {
    const value = totals.get(key);
    if (value) out[key] = value;
  }
  // A key outside the canonical vocabulary would be a bug, but dropping it
  // silently would hide it — surface it in a stable position instead.
  for (const [key, value] of [...totals.entries()].sort()) {
    if (!order.includes(key) && value) out[key] = value;
  }
  return out;
}

function addPriorities(a: PriorityCounts, b: PriorityCounts): PriorityCounts {
  return { P1: a.P1 + b.P1, P2: a.P2 + b.P2, P3: a.P3 + b.P3 };
}

const ZERO_PRIORITIES: PriorityCounts = { P1: 0, P2: 0, P3: 0 };

/** Compact per-viewport figures for the site manifest's `pages[]`. */
export function toSitePageViewportSummary(
  viewport: ViewportInteractionAnalysis,
): SitePageViewportSummary {
  return {
    total: viewport.stats.candidateCount,
    p1: viewport.stats.priorityCounts.P1,
    p2: viewport.stats.priorityCounts.P2,
    p3: viewport.stats.priorityCounts.P3,
    visible: viewport.stats.visibleCandidateCount,
    operable: viewport.stats.operableCandidateCount,
    targets: viewport.stats.targetCount,
    candidateDensity: viewport.stats.candidateDensity,
  };
}

/** Page-level roll-up across both viewports. */
export function buildPageSummary(
  desktop: ViewportInteractionAnalysis,
  mobile: ViewportInteractionAnalysis,
): PageInteractionSummary {
  return {
    desktopCandidateCount: desktop.stats.candidateCount,
    mobileCandidateCount: mobile.stats.candidateCount,
    totalCandidateCount: desktop.stats.candidateCount + mobile.stats.candidateCount,
    priorityCounts: addPriorities(
      desktop.stats.priorityCounts,
      mobile.stats.priorityCounts,
    ),
    targetCount: desktop.stats.targetCount + mobile.stats.targetCount,
    unresolvedControlCount:
      desktop.stats.unresolvedControlCount + mobile.stats.unresolvedControlCount,
  };
}

/** Site-wide capability counts, split desktop / mobile / combined. */
export function buildCapabilitySummary(
  pages: readonly PageInteractionAnalysis[],
): ViewportSplitCounts {
  const desktop = mergeCounts(
    CAPABILITY_ORDER,
    pages.map((p) => p.viewports.desktop.stats.capabilityCounts),
  );
  const mobile = mergeCounts(
    CAPABILITY_ORDER,
    pages.map((p) => p.viewports.mobile.stats.capabilityCounts),
  );
  return { desktop, mobile, total: mergeCounts(CAPABILITY_ORDER, [desktop, mobile]) };
}

/** Site-wide guard-flag counts, split desktop / mobile / combined. */
export function buildGuardSummary(
  pages: readonly PageInteractionAnalysis[],
): ViewportSplitCounts {
  const desktop = mergeCounts(
    GUARD_FLAG_ORDER,
    pages.map((p) => p.viewports.desktop.stats.guardCounts),
  );
  const mobile = mergeCounts(
    GUARD_FLAG_ORDER,
    pages.map((p) => p.viewports.mobile.stats.guardCounts),
  );
  return { desktop, mobile, total: mergeCounts(GUARD_FLAG_ORDER, [desktop, mobile]) };
}

/** Site-wide P1/P2/P3 counts, split desktop / mobile / combined. */
export function buildPrioritySummary(
  pages: readonly PageInteractionAnalysis[],
): PrioritySplitCounts {
  const desktop = pages.reduce(
    (acc, p) => addPriorities(acc, p.viewports.desktop.stats.priorityCounts),
    ZERO_PRIORITIES,
  );
  const mobile = pages.reduce(
    (acc, p) => addPriorities(acc, p.viewports.mobile.stats.priorityCounts),
    ZERO_PRIORITIES,
  );
  return { desktop, mobile, total: addPriorities(desktop, mobile) };
}

/** One page entry in the site manifest. */
export function toSitePageSummary(
  analysis: PageInteractionAnalysis,
  interactionCandidatesFile: string,
): SitePageInteractionSummary {
  return {
    pageId: analysis.pageId,
    url: analysis.url,
    role: analysis.role,
    familyId: analysis.familyId,
    familyType: analysis.familyType,
    interactionCandidatesFile,
    desktop: toSitePageViewportSummary(analysis.viewports.desktop),
    mobile: toSitePageViewportSummary(analysis.viewports.mobile),
  };
}

/** `sample - representative` for one viewport of one validation pair. */
function compareViewport(
  representative: ViewportInteractionAnalysis,
  sample: ViewportInteractionAnalysis,
): ValidationInteractionViewportComparison {
  const capabilityDifferences: Record<string, number> = {};
  for (const capability of CAPABILITY_ORDER) {
    const diff =
      (sample.stats.capabilityCounts[capability] ?? 0) -
      (representative.stats.capabilityCounts[capability] ?? 0);
    if (diff !== 0) capabilityDifferences[capability] = diff;
  }

  return {
    representativeTotal: representative.stats.candidateCount,
    sampleTotal: sample.stats.candidateCount,
    totalDifference: sample.stats.candidateCount - representative.stats.candidateCount,
    p1Difference:
      sample.stats.priorityCounts.P1 - representative.stats.priorityCounts.P1,
    p2Difference:
      sample.stats.priorityCounts.P2 - representative.stats.priorityCounts.P2,
    p3Difference:
      sample.stats.priorityCounts.P3 - representative.stats.priorityCounts.P3,
    capabilityDifferences,
  };
}

/**
 * Interaction-side comparison of Task 09's representative ↔ sample pairs.
 *
 * Task 09 already deep-observed both members of each pair, so this costs no
 * browser time at all. It answers a question static structure could not: two
 * pages can share a skeleton, a landmark tree and an element-count band while
 * one has three controls and the other eighteen.
 *
 * A pair is skipped (not fabricated) when either page was not analyzed. The
 * numbers are recorded for a later decision about family tuning or
 * representative-based exploration; Task 10 changes neither (item 65).
 */
export function buildValidationComparisons(
  siteObservation: SiteObservation,
  analysisByPageId: ReadonlyMap<string, PageInteractionAnalysis>,
): ValidationInteractionComparison[] {
  const out: ValidationInteractionComparison[] = [];
  for (const sample of siteObservation.validationSamples) {
    const rep = analysisByPageId.get(sample.representativePageId);
    const smp = analysisByPageId.get(sample.samplePageId);
    if (!rep || !smp) continue;
    out.push({
      familyId: sample.familyId,
      familyType: sample.familyType,
      familyMemberCount: sample.familyMemberCount,
      representativePageId: sample.representativePageId,
      samplePageId: sample.samplePageId,
      representativeUrl: sample.representativeUrl,
      sampleUrl: sample.sampleUrl,
      desktop: compareViewport(rep.viewports.desktop, smp.viewports.desktop),
      mobile: compareViewport(rep.viewports.mobile, smp.viewports.mobile),
    });
  }
  return out.sort((a, b) => a.familyId.localeCompare(b.familyId));
}

/** Re-exported for callers that iterate priorities in the canonical order. */
export { PRIORITY_ORDER };
