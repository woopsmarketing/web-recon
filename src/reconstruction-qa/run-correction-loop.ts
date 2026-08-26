import path from "node:path";
import type { Browser } from "playwright";
import type { ViewportProfile } from "../observer/types.js";
import { clonePathFor } from "../reconstruction/route-plan.js";
import type { CompiledPattern } from "../sitespec/index.js";
import { applyCorrections, writeCorrectionSet } from "./apply-corrections.js";
import { DiffCollector } from "./classify-diff.js";
import {
  evaluateRegression,
  judgeCorrection,
  metricIsHigherBetter,
  type CorrectionOutcome,
  type RegressionSnapshot,
} from "./correction-loop.js";
import { replayClone } from "./interaction-qa.js";
import { compareBehavior, compareOpenStateStyle } from "./compare-behavior.js";
import type { QaInputs } from "./load-inputs.js";
import { qaOnePage, type PageWork, type StoredOriginal } from "./qa-page.js";
import { checkRoutes } from "./qa-behavior.js";
import { summarizeRootCauses } from "./root-cause.js";
import { summarizeQa, type QaSummary } from "./summarize.js";
import { startClone } from "./start-clone.js";
import {
  iterationDirRelative,
  iterationReconstructionDirRelative,
  iterationSummaryFileRelative,
  portablePath,
  writeQaJson,
} from "./store.js";
import {
  qaIterationId,
  SCHEMA_VERSION,
  type BehaviorVerdict,
  type InteractionQaResult,
  type QaPageResult,
  type UnknownQaResult,
} from "./types.js";
import type {
  QaCorrection,
  QaCorrectionSet,
  RejectedCorrection,
} from "./correction-types.js";
import type { ProposedCorrections } from "./propose-corrections.js";

/**
 * The correction loop (items 117–122, 142).
 *
 * ```
 *   q000 baseline  →  propose  →  apply  →  generate q00N  →  clone-only recapture
 *        →  compare against the STORED original evidence  →  accept / reject
 * ```
 *
 * Two properties make this loop trustworthy rather than merely convergent:
 *
 *  - **The original is not revisited** (item 118). Every iteration re-measures the
 *    clone against evidence captured once, in the baseline. Otherwise the site's
 *    own drift and network variability would enter the loop as noise, and a
 *    correction could be accepted because the original happened to change.
 *  - **Acceptance is per-correction, rejection is per-iteration.** A correction is
 *    accepted only when ITS named metric improved; but if the no-regression gate
 *    fails, the whole iteration is rejected, because two corrections applied
 *    together produced the damage and choosing a survivor would be a guess
 *    (item 122).
 *
 * Termination is explicit (item 142): the loop stops at `maxIterations`, and
 * earlier when an iteration has nothing left to try. Both are recorded, so
 * "finished" and "ran out" are different sentences in the report.
 */

export interface CorrectionLoopInput {
  runDir: string;
  inputs: QaInputs;
  browser: Browser;
  work: readonly PageWork[];
  baselinePages: readonly QaPageResult[];
  baselineInteractions: readonly InteractionQaResult[];
  baselineUnknowns: readonly UnknownQaResult[];
  proposal: ProposedCorrections;
  maxIterations: number;
  concurrency: number;
  storedOriginals: Map<string, StoredOriginal>;
  routeUrls: readonly string[];
  profileFor: (viewport: "desktop" | "mobile") => ViewportProfile;
  mapLimit: <T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
  ) => Promise<R[]>;
  log: (message: string) => void;
}

export interface CorrectionLoopResult {
  iterations: number;
  accepted: QaCorrection[];
  rejected: RejectedCorrection[];
  storageBytes: number;
  finalSummary?: QaSummary;
  /** Per-iteration record, for the report's before/after table. */
  history: Array<{
    iteration: string;
    applied: number;
    accepted: number;
    rejected: number;
    regressionPass: boolean;
    regressionFailures: string[];
  }>;
}

/**
 * Build a comparable snapshot, restricted to the pages and patterns BOTH passes
 * measured.
 *
 * `comparablePages` / `comparablePatterns` are the intersection keys; anything
 * outside them is excluded from both sides, so a transient live-site refusal or
 * a one-off clone load failure cannot manufacture a regression. See the module
 * header of `correction-loop.ts` for the nextjs.org case this exists for.
 */
function snapshotOf(
  pages: readonly QaPageResult[],
  interactions: readonly InteractionQaResult[],
  routeCheck: { checked: number; rendered: number },
  generatorInvariantsPass: boolean,
  comparablePages: ReadonlySet<string>,
  comparablePatterns: ReadonlySet<string>,
): RegressionSnapshot {
  let runtimeErrors = 0;
  let contentMismatches = 0;
  let countedPages = 0;
  for (const page of pages) {
    if (!comparablePages.has(`${page.pageId}|${page.viewport}`)) continue;
    countedPages++;
    runtimeErrors += page.runtime.cloneJsErrors;
    contentMismatches +=
      page.content.changed + page.content.missing + page.content.extra;
  }
  let behaviorMismatches = 0;
  let countedPatterns = 0;
  for (const entry of interactions) {
    if (!comparablePatterns.has(entry.patternId)) continue;
    countedPatterns++;
    if (entry.verdict === "mismatch") behaviorMismatches++;
  }
  return {
    routesRendered: routeCheck.rendered,
    routesExpected: routeCheck.checked,
    runtimeErrors,
    contentMismatches,
    behaviorMismatches,
    unknownBehaviorsImplemented: 0,
    formWrites: 0,
    generatorInvariantsPass,
    comparablePages: countedPages,
    comparablePatterns: countedPatterns,
  };
}

/** Pages that COMPLETED on both passes. */
function comparablePageKeys(
  baseline: readonly QaPageResult[],
  corrected: readonly QaPageResult[],
): Set<string> {
  const ok = (pages: readonly QaPageResult[]): Set<string> =>
    new Set(
      pages
        .filter((page) => page.status === "complete" || page.status === "source-drift")
        .map((page) => `${page.pageId}|${page.viewport}`),
    );
  const a = ok(baseline);
  const b = ok(corrected);
  return new Set([...a].filter((key) => b.has(key)));
}

/** Patterns whose behavior BOTH passes could actually judge. */
function comparablePatternIds(
  baseline: readonly InteractionQaResult[],
  corrected: readonly InteractionQaResult[],
): Set<string> {
  const judged = (results: readonly InteractionQaResult[]): Set<string> =>
    new Set(
      results
        .filter((entry) => entry.verdict === "equivalent" || entry.verdict === "mismatch")
        .map((entry) => entry.patternId),
    );
  const a = judged(baseline);
  const b = judged(corrected);
  return new Set([...a].filter((id) => b.has(id)));
}

/**
 * Re-verdict one pattern from a fresh CLONE replay and the STORED original.
 *
 * Uses the same `compareBehavior()` the baseline used — see that module for why
 * a second implementation broke the regression gate.
 */
function reverdict(
  baseline: InteractionQaResult,
  cloneSide: InteractionQaResult["clone"],
  pattern: CompiledPattern,
): {
  verdict: BehaviorVerdict;
  mismatchFields: string[];
  limitations: string[];
  targetStyleMismatches: InteractionQaResult["targetStyleMismatches"];
} {
  const comparison = compareBehavior({
    pattern,
    original: baseline.original,
    clone: cloneSide,
    liveOriginalUsed: true,
  });
  const targetStyleMismatches =
    baseline.openStateEvidenceUsable && cloneSide.ok
      ? compareOpenStateStyle(baseline.original, cloneSide)
      : [];
  return {
    verdict: comparison.verdict,
    mismatchFields: comparison.mismatchFields,
    limitations: comparison.limitations,
    targetStyleMismatches,
  };
}

export async function runCorrectionLoop(
  input: CorrectionLoopInput,
): Promise<CorrectionLoopResult> {
  const { inputs, log } = input;
  let storageBytes = 0;
  const history: CorrectionLoopResult["history"] = [];
  const rejected: RejectedCorrection[] = [];
  let pending: QaCorrection[] = [...input.proposal.corrections];
  let accepted: QaCorrection[] = [];
  let finalSummary: QaSummary | undefined;
  let iterations = 0;

  // The asset bytes are written once and shared by every iteration: they are
  // content-addressed, so two iterations naming the same file name mean the same
  // bytes by construction.
  const baseSet: QaCorrectionSet = {
    schemaVersion: SCHEMA_VERSION,
    sourceQaRun: portablePath(input.runDir),
    sourceSiteSpec: portablePath(inputs.siteSpecFile),
    sourceReconstruction: portablePath(inputs.manifestFile),
    rootUrl: inputs.siteSpec.siteSpec.rootUrl,
    corrections: [],
  };

  for (let iteration = 1; iteration <= input.maxIterations; iteration++) {
    if (pending.length === 0) {
      log(`[qa] correction loop: nothing left to apply, stopping before ${qaIterationId(iteration)}`);
      break;
    }
    iterations = iteration;
    const iterationId = qaIterationId(iteration);
    log(`[qa] ${iterationId}: applying ${pending.length} correction(s)`);

    const setPath = `${iterationDirRelative(iterationId)}/correction-set.json`;
    const written = await writeCorrectionSet(
      input.runDir,
      setPath,
      { ...baseSet, corrections: pending },
      input.proposal.assets,
    );
    storageBytes += written.bytes + written.assetBytes;

    let applied;
    try {
      applied = await applyCorrections({
        siteSpecFile: inputs.siteSpecFile,
        outputDir: path.join(
          input.runDir,
          ...iterationReconstructionDirRelative(iterationId).split("/"),
        ),
        correctionSet: { ...baseSet, corrections: pending },
        correctionSetFile: written.file,
        assetDir: written.assetDir,
        sourceQaRun: input.runDir,
        onLog: log,
      });
    } catch (err) {
      for (const correction of pending) {
        rejected.push({
          correction,
          reason: "generation-failed",
          detail: err instanceof Error ? err.message.split("\n", 1)[0]! : String(err),
        });
      }
      history.push({
        iteration: iterationId,
        applied: pending.length,
        accepted: 0,
        rejected: pending.length,
        regressionPass: false,
        regressionFailures: ["generation-failed"],
      });
      break;
    }

    const clone = await startClone({ appDir: applied.appDir, forceBuild: true, onLog: log });
    try {
      // --- clone-only recapture (item 118) ---------------------------------
      const collector = new DiffCollector();
      const pages = await input.mapLimit(input.work, input.concurrency, async (item) =>
        qaOnePage({
          item,
          inputs,
          browser: input.browser,
          cloneBaseUrl: clone.baseUrl,
          useLiveOriginal: false,
          collector,
          storedOriginals: input.storedOriginals,
        }),
      );
      const routeCheck = await checkRoutes(clone.baseUrl, input.routeUrls);

      // --- clone-side behavior recheck -------------------------------------
      const comparable = input.baselineInteractions.filter((entry) => entry.original.ok);
      const interactions: InteractionQaResult[] = [];
      const replays = await input.mapLimit(comparable, input.concurrency, async (entry) => {
        const pattern = inputs.siteSpec.interactionSpec.patterns.find(
          (candidate) => candidate.patternId === entry.patternId,
        );
        if (!pattern) return undefined;
        let clonePath = "/";
        try {
          clonePath = clonePathFor(new URL(entry.url));
        } catch {
          clonePath = "/";
        }
        const side = await replayClone({
          browser: input.browser,
          baseUrl: clone.baseUrl,
          clonePath,
          profile: input.profileFor(entry.viewport),
          viewportId: entry.viewport,
          pattern,
          ...(entry.targetNodeId !== undefined ? { targetNodeId: entry.targetNodeId } : {}),
          captureTargetStyle: entry.targetNodeId !== undefined,
          // Task 17 §6: the re-verdict must measure the same axes as the
          // baseline, so the observed-target replay runs here too.
          ...(pattern.observedTargets && pattern.observedTargets.length > 0
            ? { observedTargets: pattern.observedTargets }
            : {}),
        });
        const judged = reverdict(entry, side, pattern);
        return {
          ...entry,
          clone: side,
          verdict: judged.verdict,
          mismatchFields: judged.mismatchFields,
          limitations: judged.limitations,
          targetStyleMismatches: judged.targetStyleMismatches,
        } satisfies InteractionQaResult;
      });
      for (const entry of replays) if (entry) interactions.push(entry);
      for (const entry of input.baselineInteractions) {
        if (!entry.original.ok) interactions.push(entry);
      }

      // --- judge each correction --------------------------------------------
      const outcomes: CorrectionOutcome[] = [];
      for (const correction of pending) {
        const after = measureTargetMetric(correction, pages, interactions);
        outcomes.push(judgeCorrection(correction, after, metricIsHigherBetter(correction.targetMetric.metric)));
      }

      // --- no-regression gate ------------------------------------------------
      const pageKeys = comparablePageKeys(input.baselinePages, pages);
      const patternIds = comparablePatternIds(input.baselineInteractions, interactions);
      const baselineSnapshot = snapshotOf(
        input.baselinePages,
        input.baselineInteractions,
        { checked: input.routeUrls.length, rendered: input.routeUrls.length },
        true,
        pageKeys,
        patternIds,
      );
      const correctedSnapshot = snapshotOf(
        pages,
        interactions,
        routeCheck,
        true,
        pageKeys,
        patternIds,
      );
      const regression = evaluateRegression(baselineSnapshot, correctedSnapshot);

      const rootCauses = summarizeRootCauses({ diffs: collector.build() });
      const summary = summarizeQa({
        pages,
        interactions,
        unknowns: input.baselineUnknowns,
        signatureGroups: inputs.unknowns.signatureGroups.length,
        sourcePatternInstances: inputs.siteSpec.interactionSpec.patterns.length,
        rootCauses,
        diffs: [],
      });

      const iterationAccepted = regression.pass
        ? outcomes.filter((outcome) => outcome.accepted).map((outcome) => outcome.correction)
        : [];
      const iterationRejected = regression.pass
        ? outcomes.filter((outcome) => !outcome.accepted)
        : outcomes;

      for (const outcome of iterationRejected) {
        rejected.push({
          correction: outcome.correction,
          reason: regression.pass
            ? (outcome.reason ?? "target-metric-not-improved")
            : regression.failures[0]!,
          detail: regression.pass
            ? (outcome.detail ?? "")
            : regression.detail.join("; "),
          after: outcome.after,
        });
      }

      storageBytes += (
        await writeQaJson(input.runDir, iterationSummaryFileRelative(iterationId), {
          schemaVersion: SCHEMA_VERSION,
          iteration: iterationId,
          kind: "correction",
          appliedCorrections: pending.length,
          appliedByType: applied.appliedByType,
          acceptedCorrections: iterationAccepted.length,
          rejectedCorrections: iterationRejected.length,
          regression: {
            pass: regression.pass,
            failures: regression.failures,
            detail: regression.detail,
            baseline: baselineSnapshot,
            corrected: correctedSnapshot,
          },
          targetMetrics: outcomes.map((outcome) => ({
            correctionId: outcome.correction.id,
            type: outcome.correction.type,
            metric: outcome.correction.targetMetric.metric,
            before: outcome.before,
            after: outcome.after,
            accepted: outcome.accepted,
          })),
          routeCheck,
          summary,
        })
      ).bytes;

      history.push({
        iteration: iterationId,
        applied: pending.length,
        accepted: iterationAccepted.length,
        rejected: iterationRejected.length,
        regressionPass: regression.pass,
        regressionFailures: regression.failures,
      });

      if (!regression.pass) {
        log(`[qa] ${iterationId}: REJECTED — ${regression.detail.join("; ")}`);
        pending = [];
        break;
      }

      finalSummary = summary;
      accepted = iterationAccepted;
      log(
        `[qa] ${iterationId}: ${iterationAccepted.length} accepted, ${iterationRejected.length} rejected`,
      );

      // A second iteration is only worth running when the set actually changed:
      // re-applying the identical corrections would reproduce the identical app.
      if (iterationRejected.length === 0 || iterationAccepted.length === 0) {
        pending = [];
        break;
      }
      pending = iterationAccepted;
    } finally {
      await clone.stop();
    }
  }

  return {
    iterations,
    accepted,
    rejected,
    storageBytes,
    ...(finalSummary ? { finalSummary } : {}),
    history,
  };
}

/** Re-measure exactly the number the correction named (item 119). */
function measureTargetMetric(
  correction: QaCorrection,
  pages: readonly QaPageResult[],
  interactions: readonly InteractionQaResult[],
): number {
  const payload = correction.payload;
  switch (payload.type) {
    case "document-canvas-background": {
      let worst = 0;
      for (const page of pages) {
        if (page.canvas.mismatchedProperties.length > worst) {
          worst = page.canvas.mismatchedProperties.length;
        }
      }
      return worst;
    }
    case "interaction-target-state-style": {
      const result = interactions.find((entry) => entry.patternId === payload.patternId);
      return result ? result.targetStyleMismatches.length : correction.targetMetric.before;
    }
    case "safe-data-image-recovery": {
      const page = pages.find(
        (entry) => entry.pageId === payload.pageId && entry.viewport === payload.viewport,
      );
      if (!page) return 0;
      // The recovered image is accepted when the clone's image count with no src
      // dropped — measured as "this page still has an image the browser could
      // not decode" inverted, so higher is better.
      return page.asset.cloneImagesWithoutSrc === 0 ? 1 : 0;
    }
  }
}
