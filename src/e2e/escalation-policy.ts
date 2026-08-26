import type { QaDiff, QaRecommendation } from "../reconstruction-qa/index.js";
import { MAX_REOBSERVE_PER_ROUTE, type UnresolvedIssue } from "./types.js";

/**
 * What an E2E run is allowed to do about a QA finding (Task 16, items 59–62).
 *
 * Task 15 classifies and routes; it does not act on anything outside its three
 * closed correction types. Task 16 adds exactly one new action — targeted
 * re-observation / exact observation — and this module is where the boundary is
 * written down, as data, so "what can escalation do?" is answerable without
 * reading the orchestrator.
 *
 * The allowed set is deliberately small and shaped by ONE question: *does the
 * fix consist of looking again?*
 *
 *   requires-exact-observation            → yes. Observe the exact URL.
 *   requires-new-interaction-observation  → yes. Probe the interaction again.
 *   requires-reobserve                    → conditionally (see below).
 *
 * Everything else is refused here rather than at the call site:
 *
 *   unknown-semantic-gap            naming a behavior from a label is invention
 *   requires-font-binding-observation   a filename heuristic is not evidence
 *   requires-asset-materialization  fetching remote bytes is a separate
 *                                   security surface (SSRF, redirects, private
 *                                   IPs, MIME confusion) this Task does not open
 *   requires-pattern-modeling       a registry rule needs fixtures and review
 *   source-drift                    the answer is re-observe, and that is the
 *                                   conditional case, not a licence to rewrite
 *                                   a past SiteSpec into the present
 */

/** Escalations this pipeline performs without asking (item 60). */
export const ALLOWED_ESCALATIONS: readonly QaRecommendation[] = [
  "requires-exact-observation",
  "requires-new-interaction-observation",
];

/**
 * Allowed only when re-observing could actually change the answer (item 61).
 *
 * Two situations qualify, and they are checked rather than assumed:
 *
 *  1. **The observation pipeline itself changed.** A Task 15 run recorded
 *     `requires-reobserve` for 325 nextjs asset findings BECAUSE the Observer
 *     was losing element→asset mappings. Task 16 fixed that, so a fresh
 *     observation genuinely answers differently. In an E2E run this is
 *     automatic: the observation IS fresh, so nothing to escalate.
 *  2. **Structural drift between observation and QA.** Minutes apart in an E2E
 *     run, so a drift finding usually means the page is non-deterministic
 *     rather than stale — and one re-observation is enough to tell those apart.
 */
export const CONDITIONAL_ESCALATIONS: readonly QaRecommendation[] = [
  "requires-reobserve",
];

/** Never escalated by this pipeline, with the reason in one line each. */
export const REFUSED_ESCALATIONS: Readonly<Partial<Record<QaRecommendation, string>>> = {
  "requires-font-binding-observation":
    "an @font-face binding built from a filename heuristic is a guess, not an observation",
  "requires-asset-materialization":
    "downloading remote bytes is a separate security surface (SSRF / redirect / private IP / MIME) this Task does not open",
  "requires-pattern-modeling":
    "a deterministic registry rule requires positive and negative fixtures, a live canary and a human false-positive review",
  "unknown-semantic-gap":
    "naming a behavior from a label would be exactly the invention the pipeline exists to avoid",
  "unsupported-browser-region":
    "iframe and closed-shadow content are outside what public browser observation can reach",
};

export interface EscalationDecision {
  recommendation: QaRecommendation;
  allowed: boolean;
  conditional: boolean;
  reason: string;
}

export function decideEscalation(
  recommendation: QaRecommendation,
): EscalationDecision {
  if (ALLOWED_ESCALATIONS.includes(recommendation)) {
    return {
      recommendation,
      allowed: true,
      conditional: false,
      reason: "the fix is to observe the exact thing that was represented",
    };
  }
  if (CONDITIONAL_ESCALATIONS.includes(recommendation)) {
    return {
      recommendation,
      allowed: true,
      conditional: true,
      reason: `at most ${MAX_REOBSERVE_PER_ROUTE} targeted re-observation per route`,
    };
  }
  return {
    recommendation,
    allowed: false,
    conditional: false,
    reason:
      REFUSED_ESCALATIONS[recommendation] ??
      "no escalation path exists for this recommendation",
  };
}

/**
 * Roll QA diffs up into the report's limitation table (item 142).
 *
 * One row per classification rather than per occurrence, because 1,251
 * `geometry-mismatch` rows are one finding about a page's layout and 1,251 rows
 * of a table nobody reads. `affectedNodes` keeps the magnitude.
 */
export function summarizeUnresolved(diffs: readonly QaDiff[]): UnresolvedIssue[] {
  const byClassification = new Map<string, UnresolvedIssue>();
  for (const diff of diffs) {
    const existing = byClassification.get(diff.classification);
    if (existing) {
      existing.count++;
      existing.affectedNodes += diff.affectedNodeCount ?? 1;
      if (diff.autoFixEligibility === "eligible") existing.autoFixPossible = true;
      continue;
    }
    const decision = decideEscalation(diff.recommendation);
    byClassification.set(diff.classification, {
      classification: diff.classification,
      count: 1,
      affectedNodes: diff.affectedNodeCount ?? 1,
      upstreamStage: diff.upstreamStage,
      recommendation: diff.recommendation,
      requiresReobserve:
        diff.recommendation === "requires-reobserve" ||
        diff.recommendation === "requires-exact-observation",
      requiresNewInteractionProbe:
        diff.recommendation === "requires-new-interaction-observation",
      autoFixPossible:
        diff.autoFixEligibility === "eligible" ||
        (decision.allowed && !decision.conditional),
    });
  }
  return [...byClassification.values()].sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : a.classification < b.classification
        ? -1
        : a.classification > b.classification
          ? 1
          : 0,
  );
}
