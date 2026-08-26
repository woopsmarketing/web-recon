import {
  QA_CLASSIFICATION_ORDER,
  type QaClassification,
  type QaDiff,
  type QaRecommendation,
} from "./types.js";

/**
 * Root-cause accounting (items 162, 166).
 *
 * The per-classification table is the single most useful thing this Task
 * produces, because it is the one view where "how different" and "why" appear in
 * the same row. Its columns are fixed by item 162:
 *
 *   classification · occurrences · affected pages · affected nodes ·
 *   auto-fix eligible · auto-fixed · requires-reobserve · requires-upstream ·
 *   requires-new-interaction-probe
 *
 * `occurrences` counts DIFF RECORDS while `affectedNodes` counts the nodes those
 * records stand for, and the two differ exactly where a grouping did its job: a
 * layout cascade is one occurrence and 300 affected nodes. Reporting only the
 * first would understate the page's damage; reporting only the second would
 * undo the grouping the classifier just performed.
 *
 * There is deliberately no weighted total anywhere (items 85, 86). A single
 * "quality score" would have to decide that one font mismatch is worth n pixels,
 * and nothing in this pipeline observed that exchange rate.
 */

export interface RootCauseRow {
  classification: QaClassification;
  occurrences: number;
  affectedPages: number;
  affectedNodes: number;
  affectedPatterns: number;
  autoFixEligible: number;
  autoFixed: number;
  requiresReobserve: number;
  requiresExactObservation: number;
  requiresNewInteractionObservation: number;
  requiresAssetMaterialization: number;
  requiresFontBindingObservation: number;
  requiresPatternModeling: number;
  /** Non-zero counts per upstream stage, sorted. */
  upstreamStages: Record<string, number>;
}

export interface RootCauseSummary {
  rows: RootCauseRow[];
  totalDiffs: number;
  totalAffectedNodes: number;
  autoFixEligible: number;
  autoFixed: number;
  /** Non-zero counts per recommendation, in schema order. */
  recommendationCounts: Record<string, number>;
  /** Non-zero counts per auto-fix eligibility reason, sorted. */
  eligibilityCounts: Record<string, number>;
}

const RECOMMENDATION_FIELDS: Readonly<
  Partial<Record<QaRecommendation, keyof RootCauseRow>>
> = {
  "requires-reobserve": "requiresReobserve",
  "requires-exact-observation": "requiresExactObservation",
  "requires-new-interaction-observation": "requiresNewInteractionObservation",
  "requires-asset-materialization": "requiresAssetMaterialization",
  "requires-font-binding-observation": "requiresFontBindingObservation",
  "requires-pattern-modeling": "requiresPatternModeling",
};

function emptyRow(classification: QaClassification): RootCauseRow {
  return {
    classification,
    occurrences: 0,
    affectedPages: 0,
    affectedNodes: 0,
    affectedPatterns: 0,
    autoFixEligible: 0,
    autoFixed: 0,
    requiresReobserve: 0,
    requiresExactObservation: 0,
    requiresNewInteractionObservation: 0,
    requiresAssetMaterialization: 0,
    requiresFontBindingObservation: 0,
    requiresPatternModeling: 0,
    upstreamStages: {},
  };
}

export interface SummarizeRootCausesInput {
  diffs: readonly QaDiff[];
  /** Diff ids a correction was ACCEPTED for, so `autoFixed` is measured. */
  fixedDiffIds?: ReadonlySet<string>;
}

export function summarizeRootCauses(
  input: SummarizeRootCausesInput,
): RootCauseSummary {
  const rows = new Map<QaClassification, RootCauseRow>();
  const pagesPerRow = new Map<QaClassification, Set<string>>();
  const patternsPerRow = new Map<QaClassification, Set<string>>();
  const recommendationCounts: Record<string, number> = {};
  const eligibilityCounts: Record<string, number> = {};
  const fixed = input.fixedDiffIds ?? new Set<string>();

  let totalAffectedNodes = 0;
  let autoFixEligible = 0;
  let autoFixed = 0;

  for (const diff of input.diffs) {
    let row = rows.get(diff.classification);
    if (!row) {
      row = emptyRow(diff.classification);
      rows.set(diff.classification, row);
      pagesPerRow.set(diff.classification, new Set());
      patternsPerRow.set(diff.classification, new Set());
    }
    row.occurrences++;
    row.affectedNodes += diff.affectedNodeCount;
    totalAffectedNodes += diff.affectedNodeCount;
    if (diff.pageId !== undefined) {
      pagesPerRow.get(diff.classification)!.add(`${diff.pageId}|${diff.viewport ?? ""}`);
    }
    if (diff.patternId !== undefined) {
      patternsPerRow.get(diff.classification)!.add(diff.patternId);
    }
    if (diff.autoFixEligibility === "eligible") {
      row.autoFixEligible++;
      autoFixEligible++;
    }
    if (fixed.has(diff.id)) {
      row.autoFixed++;
      autoFixed++;
    }
    const field = RECOMMENDATION_FIELDS[diff.recommendation];
    if (field) (row[field] as number)++;
    row.upstreamStages[diff.upstreamStage] =
      (row.upstreamStages[diff.upstreamStage] ?? 0) + 1;
    recommendationCounts[diff.recommendation] =
      (recommendationCounts[diff.recommendation] ?? 0) + 1;
    eligibilityCounts[diff.autoFixEligibility] =
      (eligibilityCounts[diff.autoFixEligibility] ?? 0) + 1;
  }

  for (const [classification, row] of rows) {
    row.affectedPages = pagesPerRow.get(classification)!.size;
    row.affectedPatterns = patternsPerRow.get(classification)!.size;
    row.upstreamStages = sortRecord(row.upstreamStages);
  }

  const ordered = QA_CLASSIFICATION_ORDER.filter((code) => rows.has(code)).map(
    (code) => rows.get(code)!,
  );

  return {
    rows: ordered,
    totalDiffs: input.diffs.length,
    totalAffectedNodes,
    autoFixEligible,
    autoFixed,
    recommendationCounts: sortRecord(recommendationCounts),
    eligibilityCounts: sortRecord(eligibilityCounts),
  };
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key]!;
  return out;
}
