import path from "node:path";
import { analyzeSiteInteractions } from "../interaction-detector/index.js";
import { exploreSite } from "../interaction-explorer/index.js";
import {
  buildInteractionModels,
  loadExploration,
  modelRunDir,
  saveInteractionPatterns,
  saveUnknownInteractions,
} from "../interaction-patterns/index.js";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";
import { E2eError } from "./types.js";

/**
 * Stages 5–7 — Interaction detection, exploration and modeling (Task 16).
 *
 * Three separate stages in the manifest even though one function could call all
 * three, because they have three different costs and three different failure
 * meanings: detection is free and offline, exploration is the only stage that
 * touches a live site WITH INTENT, and modeling is offline interpretation.
 * Collapsing them would make "the interaction pipeline failed" the only thing a
 * reader could learn.
 *
 * The standing order is Task 12's, unchanged and not re-litigated here: rules
 * first, unknown second, AI last. This orchestrator never passes `--ai`, so a
 * run with no provider configured produces exactly the same deterministic
 * artifacts as one with a provider that was not asked (item 46).
 */

export interface DetectionStageResult {
  interactionAnalysisFile: string;
  candidateCount: number;
}

export async function runDetectionStage(
  context: E2eRunContext,
  siteObservationFile: string,
): Promise<DetectionStageResult> {
  const { value } = await executeStage<DetectionStageResult>({
    context,
    stage: "interaction-detection",
    onError: "interaction-failure",
    run: async () => {
      const run = await analyzeSiteInteractions({ siteObservationFile });
      const file = portablePath(run.manifestPath);
      context.lineage.interactionAnalysisFile = file;
      const stats = run.analysis.stats;
      return {
        outcome: {
          artifact: file,
          counts: {
            pages: run.analysis.pages.length,
            candidates: stats.totalCandidateCount,
            p1: stats.p1Count,
            p2: stats.p2Count,
            p3: stats.p3Count,
            targets: stats.controlledTargetCount,
          },
          warnings: run.analysis.skippedPages.map(
            (page) => `page ${page.pageId} skipped (${page.status})`,
          ),
        },
        value: {
          interactionAnalysisFile: file,
          candidateCount: stats.totalCandidateCount,
        },
      };
    },
  });
  if (!value) {
    throw new E2eError("interaction detection produced no result", "interaction-failure");
  }
  return value;
}

export interface ExplorationStageResult {
  interactionExplorationFile: string;
  plannedActions: number;
  executedActions: number;
}

export async function runExplorationStage(
  context: E2eRunContext,
  interactionAnalysisFile: string,
): Promise<ExplorationStageResult> {
  const { value } = await executeStage<ExplorationStageResult>({
    context,
    stage: "interaction-exploration",
    onError: "interaction-failure",
    run: async () => {
      const run = await exploreSite({
        interactionAnalysisFile,
        concurrency: Math.min(context.options.concurrency, 3),
        onActionDone: (observation, done, total) => {
          context.log(
            `[e2e]   explore [${done}/${total}] ${observation.actionId} ${observation.status}`,
          );
        },
      });

      const file = portablePath(run.manifestPath);
      context.lineage.interactionExplorationFile = file;
      const manifest = run.exploration;
      const executed = manifest.actionStatusSummary;
      const executedCount = run.observations.filter(
        (o) => o.action.attempted,
      ).length;

      // A locator that no longer resolves is a fact about the site between the
      // observation and the click, not a pipeline error — recorded, never fatal.
      const warnings: string[] = [];
      const notFound = (executed["not-found"] ?? 0) + (executed["ambiguous"] ?? 0);
      if (notFound > 0) {
        warnings.push(
          `${notFound} planned action(s) could not be re-identified in the live DOM`,
        );
      }

      return {
        outcome: {
          artifact: file,
          runDir: portablePath(run.runDir),
          counts: {
            plannedActions: run.plan.actions.length,
            executedActions: executedCount,
            changed: executed["changed"] ?? 0,
            noChange: executed["no-change"] ?? 0,
            dynamicTargetsMounted: manifest.dynamicTargetSummary.resolvedAfterAction,
            skipped: run.plan.skipped.length,
          },
          warnings,
          bytes: manifest.storageSummary.totalBytes,
          ...(notFound > 0 ? { failure: "interaction-partial" as const } : {}),
        },
        value: {
          interactionExplorationFile: file,
          plannedActions: run.plan.actions.length,
          executedActions: executedCount,
        },
      };
    },
  });
  if (!value) {
    throw new E2eError("interaction exploration produced no result", "interaction-failure");
  }
  return value;
}

export interface ModelingStageResult {
  interactionPatternsFile: string;
  patterns: number;
  unknowns: number;
}

export async function runModelingStage(
  context: E2eRunContext,
  interactionExplorationFile: string,
): Promise<ModelingStageResult> {
  const { value } = await executeStage<ModelingStageResult>({
    context,
    stage: "interaction-modeling",
    onError: "interaction-failure",
    run: async () => {
      const exploration = await loadExploration(interactionExplorationFile);
      const models = buildInteractionModels({ exploration });
      // Run-id namespace only — never inside a deterministic artifact body.
      const runDir = modelRunDir(
        exploration.rootUrl,
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
      const patternsFile = await saveInteractionPatterns(runDir, models.patterns);
      const unknownsFile = await saveUnknownInteractions(runDir, models.unknowns);

      const file = portablePath(path.join(runDir, patternsFile.relativePath));
      context.lineage.interactionPatternsFile = file;

      return {
        outcome: {
          artifact: file,
          runDir: portablePath(runDir),
          counts: {
            patterns: models.patterns.patterns.length,
            unknowns: models.unknowns.cases.length,
            signatureGroups: models.unknowns.signatureGroups.length,
            // Item 46: this orchestrator never enables AI, so this is 0 whether
            // or not a provider happens to be configured on the machine.
            aiCalls: 0,
          },
          warnings: [],
          bytes: patternsFile.bytes + unknownsFile.bytes,
        },
        value: {
          interactionPatternsFile: file,
          patterns: models.patterns.patterns.length,
          unknowns: models.unknowns.cases.length,
        },
      };
    },
  });
  if (!value) {
    throw new E2eError("interaction modeling produced no result", "interaction-failure");
  }
  return value;
}
