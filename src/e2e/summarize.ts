import type { QaRunResult } from "../reconstruction-qa/index.js";
import { summarizeUnresolved } from "./escalation-policy.js";
import type { E2eRunContext } from "./run-context.js";
import type { FinalValidationResult } from "./final-validation.js";
import {
  type E2eCoverage,
  type FinalStatus,
  type StageRecord,
  type UnresolvedIssue,
  type UpstreamAccounting,
} from "./types.js";

/**
 * Turning a finished run into the manifest's headline figures (Task 16).
 *
 * Two rules, both from item 132:
 *
 *  - **No overall score.** There is no `92`, no `A`, no weighted average of
 *    content fidelity and behavior equivalence. Those two dimensions have
 *    different units and different owners, and any formula combining them would
 *    be this Task inventing a judgement it has no evidence for.
 *  - **`finalStatus` is a classification, not a grade.** It answers "what kind
 *    of result is this?" — which is what a reader actually needs before looking
 *    at the numbers.
 */

/**
 * Classify the run (items 127–131).
 *
 * Order matters and encodes precedence:
 *
 *   failed    a required stage did not produce its artifact. Nothing downstream
 *             is meaningful.
 *   partial   the pipeline ran, but some verified pages never made it through.
 *             The clone is real and incomplete, and the difference from
 *             `complete-with-known-limitations` is COVERAGE, not accuracy.
 *   complete-with-known-limitations
 *             every stage succeeded and something the pipeline cannot see
 *             remains: a region no observation can reach, an asset an origin
 *             refuses to serve, a behavior whose data lives in a backend.
 *   complete  every stage succeeded and nothing is outside the boundary. Minor
 *             fidelity deltas do not disqualify it — a geometry p95 of 3px is a
 *             measurement, not a limitation.
 */
export function classifyFinalStatus(input: {
  stages: readonly StageRecord[];
  coverage: E2eCoverage;
  unresolved: readonly UnresolvedIssue[];
  finalValidation?: FinalValidationResult;
}): { status: FinalStatus; reason: string } {
  const failed = input.stages.filter((stage) => stage.status === "failed");
  if (failed.length > 0) {
    return {
      status: "failed",
      reason: `${failed.map((stage) => `${stage.stage} (${stage.failure ?? "error"})`).join(", ")}`,
    };
  }

  const partialStages = input.stages.filter((stage) => stage.status === "partial");
  const missingRoutes = input.coverage.generatedRoutes - input.coverage.routesRendered;
  if (input.coverage.failedPages > 0 || missingRoutes > 0) {
    return {
      status: "partial",
      reason:
        input.coverage.failedPages > 0
          ? `${input.coverage.failedPages} page(s) failed observation, so their routes render from a family representative or not at all`
          : `${missingRoutes} generated route(s) did not render`,
    };
  }

  // Root URL Invariant (Task 17): the input root is the one URL the caller
  // knows exists. If it verified as a valid page and the reconstruction still
  // has no route for it, that is a coverage defect of this pipeline — the
  // stripe.com Task 16 run shipped a 19-route clone with no homepage while
  // every counter read "lossless" — so the run can never classify `complete`.
  if (
    input.coverage.inputRootVerified === true &&
    input.coverage.inputRootReconstructed !== true
  ) {
    return {
      status: "partial",
      reason:
        "the input root URL verified as a valid page but is missing from the reconstructed route set",
    };
  }

  // A clone that throws is this pipeline's defect, not a boundary of public
  // observation, so it can never be filed as a "known limitation". Task 16
  // shipped 30 React hydration errors under a `complete-with-known-limitations`
  // headline precisely because nothing here looked at them.
  const cloneErrors = input.coverage.cloneRuntimeErrors ?? 0;
  if (cloneErrors > 0) {
    return {
      status: "partial",
      reason: `the clone threw ${cloneErrors} JavaScript error(s) while it was measured; a runtime defect in the generated app is not an observation limitation`,
    };
  }

  // A limitation is something OUTSIDE what public browser observation can
  // reach, plus the two categories the pipeline deliberately refuses to guess
  // at. A style or geometry delta is a measurement and does not qualify.
  const BOUNDARY_CLASSIFICATIONS = new Set([
    "asset-hotlink-blocked",
    "asset-load-failure",
    "asset-missing",
    "unknown-behavior-gap",
    "dynamic-target-content-unobserved",
    "family-representation-gap",
    "font-binding-missing",
    "source-structural-drift",
    "source-content-drift",
    "source-style-drift",
    "environment-unstable",
  ]);
  const boundary = input.unresolved.filter((issue) =>
    BOUNDARY_CLASSIFICATIONS.has(issue.classification),
  );

  const notIndependent = input.finalValidation?.independent === false;
  if (boundary.length > 0 || partialStages.length > 0 || notIndependent) {
    const parts: string[] = [];
    if (boundary.length > 0) {
      parts.push(
        boundary
          .slice(0, 4)
          .map((issue) => `${issue.classification} ×${issue.count}`)
          .join(", "),
      );
    }
    for (const stage of partialStages) parts.push(`${stage.stage} partial`);
    if (notIndependent) parts.push("generated app independence audit found a reference");
    return { status: "complete-with-known-limitations", reason: parts.join("; ") };
  }

  return {
    status: "complete",
    reason: "every required stage succeeded and no observation-boundary limitation remains",
  };
}

export interface BuildSummaryInput {
  context: E2eRunContext;
  qa?: QaRunResult;
  coverage: E2eCoverage;
  upstream: UpstreamAccounting;
  finalValidation?: FinalValidationResult;
}

export interface E2eSummary {
  coverage: E2eCoverage;
  upstream: UpstreamAccounting;
  unresolved: UnresolvedIssue[];
  finalStatus: FinalStatus;
  finalStatusReason: string;
}

export function buildE2eSummary(input: BuildSummaryInput): E2eSummary {
  const unresolved = input.qa ? summarizeUnresolved(input.qa.diffs) : [];
  const stages = [...input.context.stages.values()];
  const { status, reason } = classifyFinalStatus({
    stages,
    coverage: input.coverage,
    unresolved,
    ...(input.finalValidation ? { finalValidation: input.finalValidation } : {}),
  });
  return {
    coverage: input.coverage,
    upstream: input.upstream,
    unresolved,
    finalStatus: status,
    finalStatusReason: reason,
  };
}
