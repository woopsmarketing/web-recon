import path from "node:path";
import {
  QaInfrastructureError,
  runReconstructionQa,
  type QaRunResult,
} from "../reconstruction-qa/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stage 11 — Reconstruction QA (Task 16, items 56, 57).
 *
 * Task 15's engine, unchanged, called with `--auto-fix` when the run asked for
 * it. What Task 16 adds is not measurement but TIMING: in a fresh E2E run the
 * snapshot, the live original and the clone are minutes apart rather than days,
 * so `source-drift` should be near zero and the three-way model is measuring
 * the clone rather than the calendar (item 58). When drift does appear it is
 * still routed to the site, not to the generator — that policy is Task 15's and
 * is not relaxed here.
 *
 * A QA infrastructure failure (the clone will not start, a browser will not
 * launch) is NOT a reconstruction failure. It gets its own name so a report can
 * distinguish "the clone is wrong" from "we could not look at it" (item 37).
 */

export interface QaStageResult {
  qa: QaRunResult;
  qaManifestFile: string;
}

export interface QaStageInput {
  context: E2eRunContext;
  manifestFile: string;
  siteSpecFile: string;
  autoFix: boolean;
  familyAudit: number;
  /** Task 15 default is 2; the E2E CLI exposes it as `--max-fix-iterations`. */
  maxFixIterations: number;
}

export async function runQaStage(input: QaStageInput): Promise<QaStageResult> {
  const { context } = input;

  const { value } = await executeStage<QaStageResult>({
    context,
    stage: "qa",
    onError: "qa-infrastructure-failure",
    run: async () => {
      let qa: QaRunResult;
      try {
        qa = await runReconstructionQa({
          manifestFile: input.manifestFile,
          siteSpecFile: input.siteSpecFile,
          concurrency: Math.min(context.options.concurrency, 3),
          ...(input.autoFix ? { autoFix: true } : {}),
          maxFixIterations: input.maxFixIterations,
          familyAudit: input.familyAudit,
          onLog: (message) => context.log(`[e2e]   ${message}`),
        });
      } catch (err) {
        throw new E2eError(
          err instanceof Error ? err.message : String(err),
          err instanceof QaInfrastructureError
            ? "qa-infrastructure-failure"
            : "qa-infrastructure-failure",
        );
      }

      const qaManifestFile = portablePath(path.join(qa.runDir, "qa-manifest.json"));
      context.lineage.qaManifestFile = qaManifestFile;

      const baseline = qa.baseline;
      const final = qa.final ?? qa.baseline;
      const warnings: string[] = [];
      if (qa.routeCheck.failures.length > 0) {
        warnings.push(
          `${qa.routeCheck.failures.length} route(s) did not render: ` +
            qa.routeCheck.failures.slice(0, 3).join(", "),
        );
      }
      if (qa.rejected.length > 0) {
        warnings.push(`${qa.rejected.length} correction(s) were rejected on re-measurement`);
      }

      return {
        outcome: {
          artifact: qaManifestFile,
          runDir: portablePath(qa.runDir),
          counts: {
            pageViewports: baseline.snapshotFidelity.pageViewportPairs,
            completed: baseline.snapshotFidelity.completed,
            routesChecked: qa.routeCheck.checked,
            routesRendered: qa.routeCheck.rendered,
            behaviorEquivalent: final.behavior.behaviorEquivalent,
            behaviorMismatch: final.behavior.behaviorMismatch,
            triggerStateEquivalent: final.behavior.triggerStateEquivalent,
            triggerStateMismatch: final.behavior.triggerStateMismatch,
            visibleTargetEquivalent: final.behavior.visibleTargetEquivalent,
            visibleTargetMismatch: final.behavior.visibleTargetMismatch,
            visibleTargetNotObserved: final.behavior.visibleTargetNotObserved,
            visibleTargetNotDeclared: final.behavior.visibleTargetNotDeclared,
            unknownGaps: final.unknowns.gapsDetected,
            familyGaps: qa.familyAudit.filter(
              (audit) => audit.majorContentMismatch || audit.majorStructureMismatch,
            ).length,
            correctionsProposed: qa.proposed.length,
            correctionsAccepted: qa.applied.length,
            correctionsRejected: qa.rejected.length,
            iterations: qa.iterations,
            scrollRestored: final.snapshotFidelity.scrollRestoredNodes,
            scrollMismatched: final.snapshotFidelity.scrollMismatchedNodes,
            assetOccurrenceLost: final.snapshotFidelity.assetOccurrenceLost,
            assetUnboundInSpec: final.snapshotFidelity.assetUnboundImageNodes,
            dynamicTargetsWithCloneChildren:
              final.behavior.dynamicTargetsWithCloneChildren,
            runtimeJsErrors: final.snapshotFidelity.runtimeErrors,
          },
          warnings,
          bytes: qa.storageBytes,
        },
        value: { qa, qaManifestFile },
      };
    },
  });

  if (!value) throw new E2eError("QA produced no result", "qa-infrastructure-failure");
  return value;
}
