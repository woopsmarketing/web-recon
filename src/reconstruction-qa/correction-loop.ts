import type {
  CorrectionRejectionReason,
  QaCorrection,
} from "./correction-types.js";

/**
 * Acceptance and the no-regression gate (items 117–122).
 *
 * The rule that makes this loop worth having is item 119: **a correction is not
 * accepted because CSS changed.** It is accepted because the exact mismatch it
 * named got smaller, and nothing else got worse.
 *
 * So each correction carries its own `targetMetric` from the moment it is
 * proposed — canvas mismatched properties, an interaction target's open-state
 * property mismatches, a recovered image's `naturalWidth` — and acceptance
 * re-measures that one number. A pixel score that improved a little is not a
 * substitute (item 121): visual metrics are recorded before and after for
 * diagnosis, and they never decide.
 *
 * ## The gate (item 120)
 *
 * Before ANY correction in an iteration is accepted, the corrected clone has to
 * hold every one of these against the baseline:
 *
 *   all routes still render · runtime errors did not increase ·
 *   content mismatches did not increase · verified behavior mismatches did not
 *   increase · unknown behaviors implemented still 0 · form writes still 0 ·
 *   generator invariants still pass
 *
 * **Both sides are restricted to what was comparable on BOTH passes.** This is
 * not a softening — it is what makes the gate mean anything. A live site that
 * refuses one replay in the baseline pass and answers it in the corrected pass
 * moves the raw mismatch count without anything about the clone changing, and
 * nextjs.org did exactly that: 21 patterns came back `unverifiable` in one pass
 * and 0 in the next, turning "4 → 9 mismatches" into a regression that never
 * happened and rejecting three corrections whose own target metrics had all gone
 * to zero. So the behavior gate compares the INTERSECTION of patterns that both
 * passes actually measured, and the content gate compares only pages that
 * completed on both.
 *
 * A failed gate rejects the whole iteration rather than picking survivors: two
 * corrections applied together produced the regression, and deciding which one
 * to keep would be a guess this Task does not make. The previous iteration
 * stands (item 122).
 *
 * ## Termination (item 142)
 *
 * The loop stops at `maxIterations`, and it also stops early when an iteration
 * proposes nothing new. Both are recorded, so "we stopped because we were done"
 * and "we stopped because we ran out" are different sentences in the report.
 */

export interface RegressionSnapshot {
  routesRendered: number;
  routesExpected: number;
  runtimeErrors: number;
  contentMismatches: number;
  behaviorMismatches: number;
  unknownBehaviorsImplemented: number;
  formWrites: number;
  generatorInvariantsPass: boolean;
  /** Pages / patterns this snapshot was restricted to. Reported, not compared. */
  comparablePages?: number;
  comparablePatterns?: number;
}

export interface RegressionVerdict {
  pass: boolean;
  /** Named failures, sorted. Empty when the gate passed. */
  failures: CorrectionRejectionReason[];
  detail: string[];
}

/** Compare a corrected iteration against the baseline it must not damage. */
export function evaluateRegression(
  baseline: RegressionSnapshot,
  corrected: RegressionSnapshot,
): RegressionVerdict {
  const failures: CorrectionRejectionReason[] = [];
  const detail: string[] = [];

  if (corrected.routesRendered < corrected.routesExpected) {
    failures.push("regression-routes");
    detail.push(
      `routes rendered ${corrected.routesRendered}/${corrected.routesExpected}`,
    );
  }
  if (corrected.runtimeErrors > baseline.runtimeErrors) {
    failures.push("regression-runtime-errors");
    detail.push(
      `runtime errors ${baseline.runtimeErrors} → ${corrected.runtimeErrors}`,
    );
  }
  if (corrected.contentMismatches > baseline.contentMismatches) {
    failures.push("regression-content");
    detail.push(
      `content mismatches ${baseline.contentMismatches} → ${corrected.contentMismatches}`,
    );
  }
  if (corrected.behaviorMismatches > baseline.behaviorMismatches) {
    failures.push("regression-behavior");
    detail.push(
      `behavior mismatches ${baseline.behaviorMismatches} → ${corrected.behaviorMismatches}`,
    );
  }
  if (corrected.unknownBehaviorsImplemented > 0) {
    failures.push("regression-unknown-implemented");
    detail.push(
      `unknown behaviors implemented ${corrected.unknownBehaviorsImplemented} (must stay 0)`,
    );
  }
  if (corrected.formWrites > 0) {
    failures.push("regression-form-writes");
    detail.push(`form writes ${corrected.formWrites} (must stay 0)`);
  }
  if (!corrected.generatorInvariantsPass) {
    failures.push("generator-invariant-failed");
    detail.push("validateGeneratedApp() reported a broken invariant");
  }

  return {
    pass: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    detail,
  };
}

export interface CorrectionOutcome {
  correction: QaCorrection;
  accepted: boolean;
  before: number;
  after: number;
  reason?: CorrectionRejectionReason;
  detail?: string;
}

/**
 * Decide one correction from its own target metric.
 *
 * `requiredAtMost` is the value that counts as fixed, and it is compared with
 * `<=` rather than `<` so a correction whose metric is "the image must decode"
 * can express itself as "0 is not allowed, anything above is" by inverting the
 * sign at proposal time.
 */
export function judgeCorrection(
  correction: QaCorrection,
  after: number,
  higherIsBetter = false,
): CorrectionOutcome {
  const target = correction.targetMetric;
  const fixed = higherIsBetter ? after > target.requiredAtMost : after <= target.requiredAtMost;
  const improved = higherIsBetter ? after > target.before : after < target.before;
  if (fixed || improved) {
    return { correction, accepted: true, before: target.before, after };
  }
  return {
    correction,
    accepted: false,
    before: target.before,
    after,
    reason: "target-metric-not-improved",
    detail: `${target.metric}: ${target.before} → ${after} (required ${
      higherIsBetter ? ">" : "≤"
    } ${target.requiredAtMost})`,
  };
}

/** Metrics whose target is "go UP", not "go down". */
export function metricIsHigherBetter(metric: string): boolean {
  return metric.startsWith("clone-image-natural-width:");
}
