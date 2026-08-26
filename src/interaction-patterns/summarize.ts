import type { ViewportId } from "../observer/types.js";
import type { ActionFacts } from "./facts.js";
import type { PatternRule } from "./registry.js";
import {
  PATTERN_MECHANISM_ORDER,
  PATTERN_TYPE_ORDER,
  UNKNOWN_REASON_ORDER,
  type InteractionPatternInstance,
  type InteractionPatternsArtifact,
  type PatternCoverage,
  type PatternGroup,
  type PatternPageSummary,
  type PatternType,
  type UnknownGroup,
  type UnknownInteractionCase,
  type UnknownInteractionsArtifact,
  type ViewportPatternSummary,
} from "./types.js";

/**
 * Deterministic aggregation (Task 12, items 41, 43, 63–66, 111, 118).
 *
 * Everything here is pure counting over already-decided data, and every list is
 * sorted by a fixed vocabulary or a stable key — so two runs over the same input
 * produce byte-identical summaries, and a summary can never depend on Map
 * insertion order.
 *
 * The one judgement encoded in this file is what a GROUP means. Grouping by
 * signature answers "how many times does this site do the same thing?" and
 * deliberately does not answer "is this the same component?" (item 41). Twenty
 * `<details>` disclosures on MDN are twenty instances of one behavior; whether
 * they are one React component is not observable from a click, and is not
 * claimed anywhere.
 */

export interface SummarizeInput {
  facts: readonly ActionFacts[];
  patterns: readonly InteractionPatternInstance[];
  unknowns: readonly UnknownInteractionCase[];
  rules: readonly PatternRule[];
  ruleMatchCounts: ReadonlyMap<string, number>;
}

export interface Summaries {
  rules: InteractionPatternsArtifact["rules"];
  coverage: PatternCoverage;
  patternTypeSummary: Record<string, number>;
  mechanismSummary: Record<string, number>;
  viewportSummary: ViewportPatternSummary[];
  pages: PatternPageSummary[];
  patternGroups: PatternGroup[];
  unknownGroups: UnknownGroup[];
  unknownStats: UnknownInteractionsArtifact["stats"];
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

/** Non-zero counts only, emitted in the canonical vocabulary order. */
function orderedCounts(
  order: readonly string[],
  counts: ReadonlyMap<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of order) {
    const n = counts.get(key) ?? 0;
    if (n > 0) out[key] = n;
  }
  return out;
}

function tally<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function summarize(input: SummarizeInput): Summaries {
  const { facts, patterns, unknowns, rules, ruleMatchCounts } = input;

  // --- rules ----------------------------------------------------------------
  const ruleRows: InteractionPatternsArtifact["rules"] = rules.map((rule) => ({
    id: rule.id,
    patternType: rule.patternType,
    version: rule.version,
    specificity: rule.specificity,
    description: rule.description,
    requiredEvidence: [...rule.requiredEvidence],
    optionalEvidence: [...rule.optionalEvidence],
    rejectionConditions: [...rule.rejectionConditions],
    matchCount: ruleMatchCounts.get(rule.id) ?? 0,
  }));

  // --- coverage (item 43) ---------------------------------------------------
  const executed = facts.filter((f) => f.executed).length;
  const changed = facts.filter((f) => f.status === "changed").length;
  const coverage: PatternCoverage = {
    totalActions: facts.length,
    executedActions: executed,
    changedActions: changed,
    confirmedPatternInstances: patterns.length,
    unknownCases: unknowns.length,
    navigationTainted: unknowns.filter((u) => u.reason === "navigation-tainted").length,
    executionErrors: unknowns.filter((u) => u.reason === "execution-error").length,
    unmatchedTransitions: unknowns.filter((u) => u.reason === "unmatched-transition")
      .length,
    patternCoverageOfChanged: ratio(patterns.length, changed),
    patternCoverageOfExecuted: ratio(patterns.length, executed),
  };

  const patternTypeSummary = orderedCounts(
    PATTERN_TYPE_ORDER,
    tally(patterns, (p) => p.patternType),
  );
  const mechanismSummary = orderedCounts(
    PATTERN_MECHANISM_ORDER,
    tally(patterns, (p) => p.mechanism),
  );

  // --- viewport (item 42) ---------------------------------------------------
  const viewportIds = [...new Set(facts.map((f) => f.viewport))].sort() as ViewportId[];
  const viewportSummary: ViewportPatternSummary[] = viewportIds.map((viewport) => ({
    viewport,
    actions: facts.filter((f) => f.viewport === viewport).length,
    patterns: patterns.filter((p) => p.source.viewport === viewport).length,
    unknowns: unknowns.filter((u) => u.source.viewport === viewport).length,
    patternTypeCounts: orderedCounts(
      PATTERN_TYPE_ORDER,
      tally(
        patterns.filter((p) => p.source.viewport === viewport),
        (p) => p.patternType,
      ),
    ),
  }));

  // --- page index (item 118) ------------------------------------------------
  // This is the table the SiteSpec compiler reads first: for each page, which
  // verified behaviors exist, where they were seen, and how much is still
  // unexplained.
  const pageIds = [...new Set(facts.map((f) => f.pageId))].sort();
  const pages: PatternPageSummary[] = pageIds.map((pageId) => {
    const onPage = patterns.filter((p) => p.source.pageId === pageId);
    const url = facts.find((f) => f.pageId === pageId)?.url ?? "";
    const types = new Set<PatternType>(onPage.map((p) => p.patternType));
    return {
      pageId,
      url,
      desktopPatternIds: onPage
        .filter((p) => p.source.viewport === "desktop")
        .map((p) => p.id),
      mobilePatternIds: onPage
        .filter((p) => p.source.viewport === "mobile")
        .map((p) => p.id),
      patternTypes: PATTERN_TYPE_ORDER.filter((t) => types.has(t)),
      unknownCount: unknowns.filter((u) => u.source.pageId === pageId).length,
    };
  });

  // --- pattern groups (item 41) ---------------------------------------------
  const patternGroups: PatternGroup[] = [];
  const bySignature = new Map<string, InteractionPatternInstance[]>();
  for (const pattern of patterns) {
    const bucket = bySignature.get(pattern.signature);
    if (bucket) bucket.push(pattern);
    else bySignature.set(pattern.signature, [pattern]);
  }
  for (const signature of [...bySignature.keys()].sort()) {
    const members = bySignature.get(signature)!;
    const first = members[0]!;
    patternGroups.push({
      signature,
      patternType: first.patternType,
      ...(first.subtype !== undefined ? { subtype: first.subtype } : {}),
      mechanism: first.mechanism,
      ...(first.transition.direction !== undefined
        ? { direction: first.transition.direction }
        : {}),
      triggerTag: first.trigger.tagName,
      ...(first.trigger.role !== undefined ? { triggerRole: first.trigger.role } : {}),
      ...(first.target?.tagName !== undefined ? { targetTag: first.target.tagName } : {}),
      ...(first.target?.role !== undefined ? { targetRole: first.target.role } : {}),
      viewport: first.source.viewport,
      instanceCount: members.length,
      pageIds: [...new Set(members.map((m) => m.source.pageId))].sort(),
      patternIds: members.map((m) => m.id).sort(),
    });
  }

  // --- unknown groups (items 46, 47, 112) -----------------------------------
  // The whole cost argument lives here: an enabled AI pass analyzes ONE case per
  // eligible signature, not one per occurrence.
  const unknownGroups: UnknownGroup[] = [];
  const unknownBySignature = new Map<string, UnknownInteractionCase[]>();
  for (const unknown of unknowns) {
    const bucket = unknownBySignature.get(unknown.signature);
    if (bucket) bucket.push(unknown);
    else unknownBySignature.set(unknown.signature, [unknown]);
  }
  for (const signature of [...unknownBySignature.keys()].sort()) {
    const members = unknownBySignature.get(signature)!;
    const first = members[0]!;
    const caseIds = members.map((m) => m.id).sort();
    unknownGroups.push({
      signature,
      reason: first.reason,
      status: first.status,
      triggerTag: first.candidateSummary.tagName,
      ...(first.candidateSummary.role !== undefined
        ? { triggerRole: first.candidateSummary.role }
        : {}),
      caseCount: members.length,
      pageIds: [...new Set(members.map((m) => m.source.pageId))].sort(),
      caseIds,
      // Lowest id: deterministic, and it is the first occurrence in model order.
      representativeCaseId: caseIds[0]!,
      aiEligibility: first.aiEligibility,
    });
  }

  const eligibleGroups = unknownGroups.filter((g) => g.aiEligibility === "eligible");
  const unknownStats: UnknownInteractionsArtifact["stats"] = {
    totalCases: unknowns.length,
    signatureGroups: unknownGroups.length,
    aiEligibleGroups: eligibleGroups.length,
    aiConditionalGroups: unknownGroups.filter((g) => g.aiEligibility === "conditional")
      .length,
    aiExcludedGroups: unknownGroups.filter((g) => g.aiEligibility === "excluded").length,
    aiEligibleCases: unknowns.filter((u) => u.aiEligibility === "eligible").length,
    estimatedAiCalls: eligibleGroups.length,
    reasonCounts: orderedCounts(
      UNKNOWN_REASON_ORDER,
      tally(unknowns, (u) => u.reason),
    ),
  };

  return {
    rules: ruleRows,
    coverage,
    patternTypeSummary,
    mechanismSummary,
    viewportSummary,
    pages,
    patternGroups,
    unknownGroups,
    unknownStats,
  };
}
