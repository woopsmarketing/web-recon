import path from "node:path";
import { chromium } from "playwright";
import { normalizeUrl, type DiscoveryProvider } from "../discovery/index.js";
import { MANIFEST_FILE } from "../reconstruction/index.js";
import type { QaRunResult } from "../reconstruction-qa/index.js";
import { runDiscoveryStage } from "./run-discovery.js";
import { runSelectionStage, runVerificationStage } from "./run-verification.js";
import { runObservationStage } from "./run-observation.js";
import {
  runDetectionStage,
  runExplorationStage,
  runModelingStage,
} from "./run-interactions.js";
import { runSiteSpecStage } from "./run-sitespec.js";
import { runBuildStage, runReconstructionStage } from "./run-reconstruction.js";
import { runQaStage } from "./run-qa.js";
import { runFamilyEscalationStage } from "./family-escalation.js";
import { runFinalValidationStage } from "./final-validation.js";
import { assertRegistryIntegrity } from "./stage-registry.js";
import { buildE2eSummary } from "./summarize.js";
import { e2eRunDir, newE2eRunId, saveE2eManifest } from "./store.js";
import { recordSkipped } from "./execute-stage.js";
import {
  createRunContext,
  orderedStages,
  portablePath,
  type E2eRunContext,
} from "./run-context.js";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_FAMILY_ESCALATION,
  DEFAULT_MAX_FIX_ITERATIONS,
  DEFAULT_MAX_URLS,
  E2E_ENGINE,
  E2eError,
  PIPELINE_VERSION,
  SCHEMA_VERSION,
  type E2eCoverage,
  type E2eManifest,
  type UpstreamAccounting,
} from "./types.js";

/**
 * Full End-to-End Reconstruction (Task 16).
 *
 * ```
 * URL → Discovery → Verification → Selection → Deep Observation
 *     → Interaction Detection → Exploration → Pattern Modeling
 *     → SiteSpec → Next.js Reconstruction → next build
 *     → QA (+ corrections) → [family escalation → recompile → rebuild → re-QA]
 *     → Final independence validation → E2E manifest
 * ```
 *
 * A straight line, deliberately. Every branch in this function is one of three
 * kinds and nothing else: a fatal failure (stop), an optional stage whose
 * precondition is absent (skip and record), or the ONE escalation loop item 63
 * allows. There is no retry, no adaptive re-planning, no "try a different
 * strategy" — a pipeline that quietly changes what it does is a pipeline whose
 * output cannot be compared with the last run's.
 *
 * ## What this function does NOT decide
 *
 * Everything about the site. It never reads a framework fingerprint, never
 * branches on a CMS, never chooses a different renderer for a WordPress page
 * than for a React one (items 47, 48). The origin's technology is an
 * implementation detail of a server this pipeline only ever looks at through a
 * browser, and the output is Next.js + React + TypeScript + generated CSS
 * regardless.
 */

export interface RunE2eOptions {
  rootUrl: string;
  maxUrls?: number;
  concurrency?: number;
  autoFix?: boolean;
  maxFixIterations?: number;
  familyEscalation?: number;
  prepareScroll?: boolean;
  /** Injected for the local fixture; production uses the Firecrawl adapter. */
  discoveryProvider?: DiscoveryProvider;
  firecrawlApiKey?: string;
  /** Override the E2E run directory (the fixture uses this). */
  outputDir?: string;
  onLog?: (message: string) => void;
}

export interface E2eRunResult {
  runDir: string;
  manifestPath: string;
  manifest: E2eManifest;
  /** The QA run, when it got that far. */
  qa?: QaRunResult;
}

export async function runE2eReconstruction(
  options: RunE2eOptions,
): Promise<E2eRunResult> {
  assertRegistryIntegrity();

  const runId = newE2eRunId();
  const runDir = options.outputDir ?? e2eRunDir(options.rootUrl, runId);
  const context = createRunContext({
    runId,
    rootUrl: options.rootUrl,
    runDir,
    options: {
      maxUrls: options.maxUrls ?? DEFAULT_MAX_URLS,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      autoFix: options.autoFix ?? false,
      maxFixIterations: options.maxFixIterations ?? DEFAULT_MAX_FIX_ITERATIONS,
      familyEscalation: options.familyEscalation ?? DEFAULT_FAMILY_ESCALATION,
      prepareScroll: options.prepareScroll ?? false,
      localDiscovery: options.discoveryProvider !== undefined,
    },
    ...(options.onLog ? { onLog: options.onLog } : {}),
  });

  let qa: QaRunResult | undefined;
  let finalValidation: Awaited<ReturnType<typeof runFinalValidationStage>> | undefined;
  let finalReconstruction: E2eManifest["finalReconstruction"];
  let coverage = emptyCoverage();
  let upstream = emptyUpstream();
  let fatal: E2eError | undefined;

  try {
    // --- 1. Discovery ------------------------------------------------------
    const discovery = await runDiscoveryStage({
      context,
      ...(options.discoveryProvider ? { provider: options.discoveryProvider } : {}),
      ...(options.firecrawlApiKey ? { firecrawlApiKey: options.firecrawlApiKey } : {}),
    });
    coverage.discoveredUrls = discovery.discovery.links.length;

    // Root URL Invariant (Task 17): track the input root explicitly through
    // every stage that could lose it. `normalizeUrl` is Discovery's own rule,
    // so "included" means exactly what the candidate set means.
    const normalizedRoot = normalizeUrl(context.rootUrl);
    coverage.inputRootIncluded =
      normalizedRoot !== null &&
      discovery.discovery.links.some((link) => link.normalizedUrl === normalizedRoot);

    // --- 2/3. Verification + selection -------------------------------------
    const verification = await runVerificationStage(context, discovery.discoveryFile);
    coverage.verifiedUrls = verification.verifiedUrls.count;

    // The root may redirect; a verified entry counts as the root when either
    // its final URL or any of its source candidates normalizes to the root.
    const rootVerifiedEntry =
      normalizedRoot === null
        ? undefined
        : verification.verifiedUrls.urls.find(
            (entry) =>
              entry.url === normalizedRoot ||
              entry.sourceCandidateUrls.some(
                (candidate) => normalizeUrl(candidate) === normalizedRoot,
              ),
          );
    coverage.inputRootVerified = rootVerifiedEntry !== undefined;

    const selection = await runSelectionStage(
      context,
      verification.verifiedUrlsFile,
      verification.verificationFile,
    );
    coverage.families = selection.selection.familyCount;
    coverage.representatives = selection.selection.selectedCount;
    coverage.inputRootSelectedOrRepresented =
      rootVerifiedEntry !== undefined &&
      (selection.selection.pages.some((page) => page.url === rootVerifiedEntry.url) ||
        selection.selection.unselected.some(
          (entry) => entry.url === rootVerifiedEntry.url,
        ));

    // --- 4. Deep observation -----------------------------------------------
    const observation = await runObservationStage(context, selection.selectedPagesFile);
    coverage.observedPages = observation.siteObservation.pages.filter(
      (page) => page.status === "success",
    ).length;
    coverage.failedPages =
      observation.siteObservation.pages.length - coverage.observedPages;
    coverage.validationSamples = observation.siteObservation.coverage.validationSampleCount;
    const observationCounts = context.stages.get("observation")?.counts ?? {};
    upstream.observedAssetOccurrences = observationCounts["assetOccurrences"] ?? 0;
    upstream.uniqueAssets = observationCounts["uniqueAssetIdentities"] ?? 0;
    upstream.observedScrollContainers = observationCounts["scrollContainers"] ?? 0;

    // --- 5/6/7. Interactions ------------------------------------------------
    const detection = await runDetectionStage(context, observation.siteObservationFile);
    coverage.interactionCandidates = detection.candidateCount;

    const exploration = await runExplorationStage(
      context,
      detection.interactionAnalysisFile,
    );
    coverage.actionsPlanned = exploration.plannedActions;
    coverage.actionsExecuted = exploration.executedActions;

    const modeling = await runModelingStage(
      context,
      exploration.interactionExplorationFile,
    );
    coverage.patternsConfirmed = modeling.patterns;
    coverage.unknownInteractions = modeling.unknowns;

    // --- 8. SiteSpec --------------------------------------------------------
    let siteSpec = await runSiteSpecStage({
      context,
      interactionPatternsFile: modeling.interactionPatternsFile,
    });
    applySiteSpecAccounting(upstream, siteSpec);

    // --- 9/10. Reconstruction + build --------------------------------------
    let reconstruction = await runReconstructionStage({
      context,
      siteSpecFile: siteSpec.siteSpecFile,
    });
    coverage.generatedRoutes = reconstruction.routes;
    coverage.inputRootReconstructed =
      rootVerifiedEntry !== undefined &&
      reconstruction.routeUrls.includes(rootVerifiedEntry.url);
    upstream.cloneScrollRestoreNodes = reconstruction.scrollRestoreNodes;
    await runBuildStage(context, reconstruction.appDir);
    finalReconstruction = {
      path: portablePath(reconstruction.outputDir),
      kind: "baseline",
      reason: "the Task 14 baseline; no correction or escalation has been accepted yet",
    };

    // --- 11. QA (+ corrections) --------------------------------------------
    const qaStage = await runQaStage({
      context,
      manifestFile: reconstruction.manifestFile,
      siteSpecFile: siteSpec.siteSpecFile,
      autoFix: context.options.autoFix,
      familyAudit: context.options.familyEscalation,
      maxFixIterations: context.options.maxFixIterations,
    });
    qa = qaStage.qa;
    applyQaCoverage(coverage, qa);
    applyQaAccounting(upstream, qa);
    finalReconstruction = chooseFinalReconstruction(qa, reconstruction.outputDir);

    // --- 12. Family escalation (item 63) ------------------------------------
    // The ONE loop this pipeline has, and it runs at most once. A route whose
    // audit says the representative is visibly the wrong page is observed
    // exactly, the SiteSpec is recompiled from the augmented observation, and
    // the clone is rebuilt and re-measured. Everything else the QA found is
    // reported, not acted on (item 60).
    if (context.options.familyEscalation > 0 && qa.familyAudit.length > 0) {
      const escalation = await runFamilyEscalationStage({
        context,
        siteObservationFile: observation.siteObservationFile,
        audits: qa.familyAudit,
        limit: context.options.familyEscalation,
      });
      coverage.familyEscalations = escalation.escalatedUrls.length;

      if (escalation.augmentedObservationFile) {
        context.log(
          `[e2e] re-compiling from the augmented observation ` +
            `(${escalation.escalatedUrls.length} exactly-observed route(s))`,
        );
        /*
         * The interaction model is unchanged — the escalation observed pages,
         * it did not explore them — so the SiteSpec is recompiled from the SAME
         * Task 12 artifact against the AUGMENTED Task 09 run.
         *
         * Naming the observation file explicitly is not optional here.
         * `loadInputs()` otherwise follows `exploration.sourceSiteObservation`
         * straight back to the original run, and the escalation would observe
         * four pages and then compile as if it had not.
         */
        siteSpec = await runSiteSpecStage({
          context,
          interactionPatternsFile: modeling.interactionPatternsFile,
          siteObservationFile: escalation.augmentedObservationFile,
        });
        applySiteSpecAccounting(upstream, siteSpec);
        reconstruction = await runReconstructionStage({
          context,
          siteSpecFile: siteSpec.siteSpecFile,
        });
        coverage.generatedRoutes = reconstruction.routes;
        coverage.inputRootReconstructed =
          rootVerifiedEntry !== undefined &&
          reconstruction.routeUrls.includes(rootVerifiedEntry.url);
        upstream.cloneScrollRestoreNodes = reconstruction.scrollRestoreNodes;
        await runBuildStage(context, reconstruction.appDir);

        const rerun = await runQaStage({
          context,
          manifestFile: reconstruction.manifestFile,
          siteSpecFile: siteSpec.siteSpecFile,
          autoFix: context.options.autoFix,
          // The audit already did its job; re-auditing would only re-escalate.
          familyAudit: 0,
          maxFixIterations: context.options.maxFixIterations,
        });
        qa = rerun.qa;
        applyQaCoverage(coverage, qa);
        applyQaAccounting(upstream, qa);
        finalReconstruction = chooseFinalReconstruction(qa, reconstruction.outputDir, {
          escalated: true,
          escalatedRoutes: escalation.escalatedUrls.length,
        });
      }
    } else {
      recordSkipped(
        context,
        "family-escalation",
        context.options.familyEscalation === 0
          ? "--family-escalation 0"
          : "the family audit found no route to escalate",
      );
    }

    // --- 13. Final independence validation ----------------------------------
    const finalAppDir = finalReconstruction
      ? path.resolve(finalReconstruction.path, "app")
      : reconstruction.appDir;
    finalValidation = await runFinalValidationStage({
      context,
      appDir: finalAppDir,
      rootUrl: context.rootUrl,
    });
  } catch (err) {
    fatal = err instanceof E2eError ? err : undefined;
    if (!fatal) throw err;
    context.log(`[e2e] run stopped: ${fatal.failure} — ${fatal.message}`);
  }

  // --- manifest -------------------------------------------------------------
  const summary = buildE2eSummary({
    context,
    ...(qa ? { qa } : {}),
    coverage,
    upstream,
    ...(finalValidation ? { finalValidation } : {}),
  });

  const manifest: E2eManifest = {
    schemaVersion: SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    engine: E2E_ENGINE,
    runId,
    input: { rootUrl: context.rootUrl, options: context.options },
    environment: await describeEnvironment(context),
    stages: orderedStages(context),
    lineage: context.lineage,
    ...(context.lineage.qaManifestFile ? { qaRun: context.lineage.qaManifestFile } : {}),
    ...(qa && qa.iterations > 0 && qa.applied.length > 0
      ? { correctionRun: portablePath(path.join(qa.runDir, "corrections")) }
      : {}),
    ...(finalReconstruction ? { finalReconstruction } : {}),
    coverage: summary.coverage,
    upstream: summary.upstream,
    unresolvedIssues: summary.unresolved,
    timings: context.timings,
    storageBytes: context.storageBytes,
    finalStatus: summary.finalStatus,
    startedAt: context.startedAt,
    completedAt: new Date().toISOString(),
  };

  const saved = await saveE2eManifest(runDir, manifest);
  context.log(
    `[e2e] ${manifest.finalStatus} — ${summary.finalStatusReason}`,
  );
  context.log(`[e2e] wrote ${portablePath(saved.manifestPath)}`);

  return {
    runDir,
    manifestPath: saved.manifestPath,
    manifest,
    ...(qa ? { qa } : {}),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function emptyCoverage(): E2eCoverage {
  return {
    discoveredUrls: 0,
    verifiedUrls: 0,
    families: 0,
    representatives: 0,
    validationSamples: 0,
    observedPages: 0,
    failedPages: 0,
    interactionCandidates: 0,
    actionsPlanned: 0,
    actionsExecuted: 0,
    patternsConfirmed: 0,
    unknownInteractions: 0,
    generatedRoutes: 0,
    routesRendered: 0,
    qaPageViewports: 0,
    behaviorEquivalent: 0,
    behaviorMismatch: 0,
    familyEscalations: 0,
    correctionsProposed: 0,
    correctionsAccepted: 0,
  };
}

function emptyUpstream(): UpstreamAccounting {
  return {
    observedAssetOccurrences: 0,
    uniqueAssets: 0,
    specImageNodes: 0,
    specAssetBoundImageNodes: 0,
    assetOccurrenceLoss: 0,
    observedScrollContainers: 0,
    specScrollStateNodes: 0,
    specScrolledNodes: 0,
    cloneScrollRestoreNodes: 0,
    qaScrollRestored: 0,
    qaScrollMismatched: 0,
    gridPropertyOccurrences: {},
    dynamicTargets: 0,
    dynamicTargetsWithTemplate: 0,
    dynamicTemplateNodes: 0,
  };
}

function applySiteSpecAccounting(
  upstream: UpstreamAccounting,
  siteSpec: Awaited<ReturnType<typeof runSiteSpecStage>>,
): void {
  upstream.specScrollStateNodes = siteSpec.scrollStateNodes;
  upstream.specScrolledNodes = siteSpec.scrolledNodes;
  upstream.specImageNodes = siteSpec.imageNodes;
  upstream.specAssetBoundImageNodes = siteSpec.assetBoundImageNodes;
  upstream.gridPropertyOccurrences = siteSpec.gridPropertyOccurrences;
  upstream.dynamicTargets = siteSpec.dynamicTargets;
  upstream.dynamicTargetsWithTemplate = siteSpec.dynamicTargetsWithTemplate;
  upstream.dynamicTemplateNodes = siteSpec.dynamicTemplateNodes;
}

function applyQaCoverage(coverage: E2eCoverage, qa: QaRunResult): void {
  const final = qa.final ?? qa.baseline;
  coverage.routesRendered = qa.routeCheck.rendered;
  coverage.qaPageViewports = final.snapshotFidelity.pageViewportPairs;
  coverage.behaviorEquivalent = final.behavior.behaviorEquivalent;
  coverage.behaviorMismatch = final.behavior.behaviorMismatch;
  coverage.triggerStateEquivalent = final.behavior.triggerStateEquivalent;
  coverage.triggerStateMismatch = final.behavior.triggerStateMismatch;
  coverage.userVisibleTargetEquivalent = final.behavior.visibleTargetEquivalent;
  coverage.userVisibleTargetMismatch = final.behavior.visibleTargetMismatch;
  coverage.userVisibleTargetNotObserved = final.behavior.visibleTargetNotObserved;
  coverage.userVisibleTargetNotDeclared = final.behavior.visibleTargetNotDeclared;
  coverage.cloneRuntimeErrors = final.snapshotFidelity.runtimeErrors;
  coverage.correctionsProposed = qa.proposed.length;
  coverage.correctionsAccepted = qa.applied.length;
}

function applyQaAccounting(upstream: UpstreamAccounting, qa: QaRunResult): void {
  const final = qa.final ?? qa.baseline;
  upstream.qaScrollRestored = final.snapshotFidelity.scrollRestoredNodes;
  upstream.qaScrollMismatched = final.snapshotFidelity.scrollMismatchedNodes;
  upstream.assetOccurrenceLoss = final.snapshotFidelity.assetOccurrenceLost;
}

/**
 * Pick the reconstruction a reader should look at (items 93, 94).
 *
 * NOT "the last iteration". An iteration exists whether or not its corrections
 * survived re-measurement, and Task 15's whole acceptance model is that a
 * correction is accepted by the metric it named, not by being newer. So the
 * corrected app is chosen only when corrections were actually APPLIED and
 * ACCEPTED; otherwise the baseline is the honest answer, and the reason says so.
 */
function chooseFinalReconstruction(
  qa: QaRunResult,
  baselineDir: string,
  escalation?: { escalated: boolean; escalatedRoutes: number },
): E2eManifest["finalReconstruction"] {
  const escalationNote = escalation?.escalated
    ? ` (recompiled after ${escalation.escalatedRoutes} exact family escalation(s))`
    : "";
  if (qa.applied.length > 0 && qa.iterations > 0) {
    const iteration = `q${String(qa.iterations).padStart(3, "0")}`;
    return {
      path: portablePath(path.join(qa.runDir, "iterations", iteration, "reconstruction")),
      kind: escalation?.escalated ? "escalated" : "corrected",
      reason:
        `${qa.applied.length} correction(s) passed their own target metric and the ` +
        `no-regression gate${escalationNote}`,
    };
  }
  return {
    path: portablePath(baselineDir),
    kind: escalation?.escalated ? "escalated" : "baseline",
    reason:
      qa.proposed.length === 0
        ? `no correction was eligible, so the baseline is the final reconstruction${escalationNote}`
        : `${qa.rejected.length} correction(s) were rejected on re-measurement, so the baseline stands${escalationNote}`,
  };
}

async function describeEnvironment(
  context: E2eRunContext,
): Promise<E2eManifest["environment"]> {
  let browser: string | undefined;
  try {
    const instance = await chromium.launch();
    browser = `chromium ${instance.version()}`;
    await instance.close();
  } catch {
    // A missing browser is already visible as a failed stage; recording it
    // twice would not add information.
  }
  const versions = await readGeneratedVersions();
  return {
    node: process.version,
    platform: process.platform,
    ...(browser !== undefined ? { browser } : {}),
    ...versions,
    // Item 46: this orchestrator never enables AI. The count is a fact about
    // the pipeline, not about whether a key happens to be present.
    aiCalls: 0,
    firecrawlCalls: context.options.localDiscovery ? 0 : 1,
  };
}

async function readGeneratedVersions(): Promise<{
  nextVersion?: string;
  reactVersion?: string;
  typescriptVersion?: string;
}> {
  const { resolveDependencyVersions } = await import("../reconstruction/index.js");
  const versions = await resolveDependencyVersions(process.cwd());
  return {
    ...(versions.next !== undefined ? { nextVersion: versions.next } : {}),
    ...(versions.react !== undefined ? { reactVersion: versions.react } : {}),
    ...(versions.typescript !== undefined
      ? { typescriptVersion: versions.typescript }
      : {}),
  };
}

/** Re-exported so a caller can name the generated manifest without a literal. */
export { MANIFEST_FILE as RECONSTRUCTION_MANIFEST_FILE };
