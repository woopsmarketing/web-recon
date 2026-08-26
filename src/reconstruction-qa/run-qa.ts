import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  DESKTOP_PROFILE,
  MOBILE_PROFILE,
  type ViewportId,
  type ViewportProfile,
} from "../observer/types.js";
import { resolveViewportProfiles } from "../observer/observe-page.js";
import { clonePathFor } from "../reconstruction/route-plan.js";
import { probeBreakpoint } from "./capture-clone.js";
import { DiffCollector } from "./classify-diff.js";
import { attachDiffIds } from "./emit-diffs.js";
import { loadQaInputs } from "./load-inputs.js";
import {
  auditFamilyRoute,
  checkRoutes,
  qaOnePattern,
  qaOneUnknown,
  selectFamilyAuditRoutes,
} from "./qa-behavior.js";
import { qaOnePage, type PageWork, type RetainedScreenshots, type StoredOriginal } from "./qa-page.js";
import { proposeCorrections, type CanvasCandidate, type DataImageCandidate, type StateStyleCandidate } from "./propose-corrections.js";
import { runCorrectionLoop } from "./run-correction-loop.js";
import { summarizeRootCauses } from "./root-cause.js";
import { diffIdsOfCorrections, summarizeQa, type QaSummary } from "./summarize.js";
import { startClone, type RunningClone } from "./start-clone.js";
import { selectUnknownSamples } from "./unknown-qa.js";
import type { AssetFinding } from "./asset-diff.js";
import type { QaCorrection, RejectedCorrection } from "./correction-types.js";
import {
  APPLIED_CORRECTIONS_FILE,
  BASELINE_SUMMARY_FILE,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_FIX_ITERATIONS,
  FINAL_SUMMARY_FILE,
  MAX_CONCURRENCY,
  MAX_FAMILY_AUDIT_ROUTES_PER_SITE,
  PROPOSED_CORRECTIONS_FILE,
  QA_ENGINE,
  QA_MANIFEST_FILE,
  REJECTED_CORRECTIONS_FILE,
  SCHEMA_VERSION,
  SOURCE_DRIFT_FILE,
  WORST_SCREENSHOTS_PER_SITE,
  qaIterationId,
  type FamilyAuditResult,
  type InteractionQaResult,
  type QaDiff,
  type QaPageResult,
  type UnknownQaResult,
} from "./types.js";
import {
  correctionFileRelative,
  diffFileRelative,
  driftFileRelative,
  interactionResultFileRelative,
  iterationSummaryFileRelative,
  newQaRunId,
  pageResultFileRelative,
  portablePath,
  qaRunDir,
  screenshotFileRelative,
  unknownResultFileRelative,
  writeQaBinary,
  writeQaJson,
} from "./store.js";

/**
 * The Reconstruction QA orchestrator (Task 15).
 *
 * One run, in strict order, because each phase's evidence is the next phase's
 * input:
 *
 *   load inputs        manifest → SiteSpec → Task 09/11/12 artifacts
 *   serve the clone    the real Next.js app, on an ephemeral port
 *   page QA            every exact-observed PageSpec × desktop/mobile:
 *                        snapshot ↔ clone   (the reconstruction contract)
 *                        snapshot ↔ live    (source drift)
 *                        live ↔ clone       (canary, drift-free pages only)
 *   route QA           every verified route answers 200 in the clone
 *   breakpoint probe   clone-only consistency at 914 / 915 / 916
 *   interaction QA     every verified pattern, replayed on BOTH sides
 *   unknown QA         one representative per Task 12 signature
 *   family audit       a bounded sample of family-represented routes
 *   classify           diffs → causes, with an explicit precedence
 *   [--auto-fix]       propose → apply → regenerate → re-measure → accept/reject
 *
 * The live original is visited ONCE, in the baseline (item 118). Correction
 * iterations re-measure the clone against the evidence already stored, so the
 * site's own drift cannot leak into the loop as noise.
 */

export interface RunQaOptions {
  manifestFile: string;
  siteSpecFile?: string;
  concurrency?: number;
  /** Snapshot ↔ clone only: no live original, no interaction/unknown replay. */
  snapshotOnly?: boolean;
  /** No live-original network access; clone-side behavior is still recorded. */
  noLiveOriginal?: boolean;
  autoFix?: boolean;
  maxFixIterations?: number;
  familyAudit?: number;
  saveAllScreenshots?: boolean;
  /** Override the output directory (the fixture uses this). */
  outputDir?: string;
  onLog?: (message: string) => void;
}

export interface QaRunResult {
  runDir: string;
  rootUrl: string;
  baseline: QaSummary;
  final?: QaSummary;
  diffs: QaDiff[];
  pages: QaPageResult[];
  interactions: InteractionQaResult[];
  unknowns: UnknownQaResult[];
  familyAudit: FamilyAuditResult[];
  proposed: QaCorrection[];
  applied: QaCorrection[];
  rejected: RejectedCorrection[];
  iterations: number;
  routeCheck: { checked: number; rendered: number; failures: string[] };
  timings: Record<string, number>;
  storageBytes: number;
}

const VIEWPORTS: readonly ViewportId[] = ["desktop", "mobile"];

/** Run tasks with a bounded number in flight, preserving input order in output. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, Math.max(1, items.length))) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/** Keep memory bounded: the always-keep pages plus the running worst N (item 32). */
function pruneRetained(retained: RetainedScreenshots[], saveAll: boolean): void {
  if (saveAll) return;
  const keep = new Set<RetainedScreenshots>();
  for (const entry of retained) if (entry.alwaysKeep) keep.add(entry);
  for (const entry of [...retained]
    .filter((candidate) => !candidate.alwaysKeep)
    .sort((a, b) => b.changedRatio - a.changedRatio)
    .slice(0, WORST_SCREENSHOTS_PER_SITE)) {
    keep.add(entry);
  }
  for (const entry of retained) {
    if (keep.has(entry)) continue;
    delete entry.snapshot;
    delete entry.original;
    delete entry.clone;
    entry.diffs = [];
  }
}

async function persistScreenshots(
  runDir: string,
  retained: readonly RetainedScreenshots[],
): Promise<number> {
  let bytes = 0;
  for (const entry of retained) {
    for (const which of ["snapshot", "original", "clone"] as const) {
      const buffer = entry[which];
      if (!buffer) continue;
      bytes += (
        await writeQaBinary(
          runDir,
          screenshotFileRelative(entry.pageId, entry.viewport, which),
          buffer,
        )
      ).bytes;
    }
    for (const diff of entry.diffs) {
      bytes += (
        await writeQaBinary(
          runDir,
          diffFileRelative(entry.pageId, entry.viewport, diff.pair),
          diff.image,
        )
      ).bytes;
    }
  }
  return bytes;
}

export async function runReconstructionQa(
  options: RunQaOptions,
): Promise<QaRunResult> {
  const log = options.onLog ?? (() => {});
  const timings: Record<string, number> = {};
  const startedAt = Date.now();
  const concurrency = Math.max(
    1,
    Math.min(MAX_CONCURRENCY, options.concurrency ?? DEFAULT_CONCURRENCY),
  );
  const snapshotOnly = options.snapshotOnly === true;
  const useLiveOriginal = !snapshotOnly && options.noLiveOriginal !== true;
  const familyAuditLimit = options.familyAudit ?? MAX_FAMILY_AUDIT_ROUTES_PER_SITE;
  const maxIterations = options.maxFixIterations ?? DEFAULT_MAX_FIX_ITERATIONS;

  const loadStarted = Date.now();
  const inputs = await loadQaInputs({
    manifestFile: options.manifestFile,
    ...(options.siteSpecFile !== undefined ? { siteSpecFile: options.siteSpecFile } : {}),
  });
  timings.loadInputsMs = Date.now() - loadStarted;
  const { siteSpec } = inputs.siteSpec;
  const rootUrl = siteSpec.rootUrl;
  const runDir = options.outputDir ?? qaRunDir(rootUrl, newQaRunId());
  log(`[qa] ${rootUrl} — ${siteSpec.pages.length} pages, ${siteSpec.routes.length} routes`);
  log(`[qa] output ${runDir}`);

  const cloneStarted = Date.now();
  const clone: RunningClone = await startClone({ appDir: inputs.appDir, onLog: log });
  timings.cloneBuildMs = clone.buildMs;
  timings.cloneStartMs = Date.now() - cloneStarted;

  const browser: Browser = await chromium.launch();
  const profiles = resolveViewportProfiles(browser);
  const profileFor = (viewport: ViewportId): ViewportProfile =>
    profiles.find((profile) => profile.id === viewport) ??
    (viewport === "desktop" ? DESKTOP_PROFILE : MOBILE_PROFILE);

  const collector = new DiffCollector();
  const pages: QaPageResult[] = [];
  const retained: RetainedScreenshots[] = [];
  const canvasCandidates: CanvasCandidate[] = [];
  const dataImageCandidates: DataImageCandidate[] = [];
  const stateStyleCandidates: StateStyleCandidate[] = [];
  const assetFindingsByPage = new Map<string, AssetFinding[]>();
  const storedOriginals = new Map<string, StoredOriginal>();

  try {
    // --- page work list (item 22) -------------------------------------------
    const routeByPageId = new Map<string, string>();
    for (const route of siteSpec.routes) {
      if (route.pageId && !routeByPageId.has(route.pageId)) {
        routeByPageId.set(route.pageId, route.url);
      }
    }
    const work: PageWork[] = [];
    for (const page of inputs.siteSpec.pages) {
      const url = routeByPageId.get(page.pageId) ?? page.url;
      let clonePath = "/";
      try {
        clonePath = clonePathFor(new URL(url));
      } catch {
        clonePath = "/";
      }
      for (const viewport of VIEWPORTS) {
        work.push({ page, viewport, clonePath, profile: profileFor(viewport) });
      }
    }
    log(`[qa] ${work.length} page/viewport pairs (concurrency ${concurrency})`);

    // --- page QA ------------------------------------------------------------
    const pageStarted = Date.now();
    const pageResults = await mapLimit(work, concurrency, async (item, index) => {
      const result = await qaOnePage({
        item,
        inputs,
        browser,
        cloneBaseUrl: clone.baseUrl,
        useLiveOriginal,
        collector,
        canvasCandidates,
        dataImageCandidates,
        assetFindingsByPage,
        storedOriginals,
        retained,
        saveAllScreenshots: options.saveAllScreenshots === true,
      });
      pruneRetained(retained, options.saveAllScreenshots === true);
      if ((index + 1) % 10 === 0 || index + 1 === work.length) {
        log(`[qa]   ${index + 1}/${work.length} page/viewport pairs measured`);
      }
      return result;
    });
    pages.push(...pageResults);
    timings.pageQaMs = Date.now() - pageStarted;

    const driftedPages = new Set(
      pages
        .filter(
          (page) =>
            !page.sourceDrift.structurallyAligned ||
            page.sourceDrift.changedTextNodes > 0 ||
            page.sourceDrift.changedStyleProperties > 0,
        )
        .map((page) => `${page.pageId}|${page.viewport}`),
    );

    // --- route render check (item 152) --------------------------------------
    const routeStarted = Date.now();
    const routeCheck = await checkRoutes(
      clone.baseUrl,
      siteSpec.routes.map((route) => route.url),
    );
    timings.routeCheckMs = Date.now() - routeStarted;
    for (const failure of routeCheck.failures) {
      collector.add({
        dimension: "route",
        classification: "route-mismatch",
        route: failure,
        cloneActual: "did not answer 200",
        evidence: [{ kind: "clone-http", note: "verified route did not render" }],
      });
    }
    log(`[qa] routes ${routeCheck.rendered}/${routeCheck.checked} rendered`);

    // --- clone-only breakpoint probe (items 59, 60) -------------------------
    const probeStarted = Date.now();
    const probePath = work.length > 0 ? work[0]!.clonePath : "/";
    const probes = await probeBreakpoint({
      browser,
      baseUrl: clone.baseUrl,
      clonePath: probePath,
      desktopProfile: profileFor("desktop"),
    });
    timings.breakpointProbeMs = Date.now() - probeStarted;
    for (const probe of probes) {
      if (probe.ok) continue;
      collector.add({
        dimension: "responsive",
        classification: "inferred-breakpoint-runtime-defect",
        route: probePath,
        cloneActual: `width ${probe.width}: desktop=${probe.desktopVisible} mobile=${probe.mobileVisible} elements=${probe.elementCount} errors=${probe.runtimeErrors}`,
        evidence: [
          {
            kind: "clone-breakpoint-probe",
            field: String(probe.width),
            clone: `desktop=${probe.desktopVisible} mobile=${probe.mobileVisible}`,
          },
        ],
        limitations: ["inferred-breakpoint-never-observed"],
      });
    }

    // --- interaction QA (items 61–75) ---------------------------------------
    const interactions: InteractionQaResult[] = [];
    if (!snapshotOnly) {
      const interactionStarted = Date.now();
      const patterns = [...inputs.siteSpec.interactionSpec.patterns].sort((a, b) =>
        a.patternId.localeCompare(b.patternId),
      );
      log(`[qa] interaction QA — ${patterns.length} verified pattern(s)`);
      // Task 17 §6: the Manual Visual Review's four-capture evidence, folded
      // into production — before/after viewport PNGs for both sides, under
      // `interactions/<patternId>/` in the QA run directory.
      const screenshotRoot = {
        dir: path.join(runDir, "interactions"),
        rel: "interactions",
      };
      const replayed = await mapLimit(patterns, concurrency, async (pattern) =>
        qaOnePattern({
          pattern,
          inputs,
          browser,
          cloneBaseUrl: clone.baseUrl,
          profile: profileFor(pattern.viewport),
          useLiveOriginal,
          routeByPageId,
          driftedPages,
          screenshotRoot,
        }),
      );
      for (const entry of replayed) {
        if (!entry) continue;
        interactions.push(entry.result);
        for (const draft of entry.drafts) collector.add(draft);
        if (entry.stateStyle) stateStyleCandidates.push(entry.stateStyle);
      }
      timings.interactionQaMs = Date.now() - interactionStarted;
    }

    // --- unknown QA (items 76–80) -------------------------------------------
    const unknowns: UnknownQaResult[] = [];
    if (!snapshotOnly) {
      const unknownStarted = Date.now();
      const samples = selectUnknownSamples(inputs.unknowns);
      log(`[qa] unknown QA — ${samples.length} signature representative(s)`);
      const replayed = await mapLimit(samples, concurrency, async (sample) =>
        qaOneUnknown({
          sample,
          inputs,
          browser,
          cloneBaseUrl: clone.baseUrl,
          profileFor,
          useLiveOriginal,
          routeByPageId,
        }),
      );
      for (const entry of replayed) {
        if (!entry) continue;
        unknowns.push(entry.result);
        for (const draft of entry.drafts) collector.add(draft);
      }
      timings.unknownQaMs = Date.now() - unknownStarted;
    }

    // --- family audit (items 23–25) -----------------------------------------
    const familyAudit: FamilyAuditResult[] = [];
    if (useLiveOriginal && familyAuditLimit > 0) {
      const familyStarted = Date.now();
      const targets = selectFamilyAuditRoutes(inputs, familyAuditLimit);
      log(`[qa] family audit — ${targets.length} represented route(s)`);
      const audited = await mapLimit(targets, concurrency, async (target) =>
        auditFamilyRoute({
          target,
          browser,
          cloneBaseUrl: clone.baseUrl,
          profile: profileFor("desktop"),
        }),
      );
      for (const entry of audited) {
        familyAudit.push(entry.result);
        for (const draft of entry.drafts) collector.add(draft);
      }
      timings.familyAuditMs = Date.now() - familyStarted;
    }

    // --- classify + summarize ------------------------------------------------
    const diffs = collector.build();
    attachDiffIds(pages, interactions, unknowns, familyAudit, diffs);
    const rootCauses = summarizeRootCauses({ diffs });
    const baseline = summarizeQa({
      pages,
      interactions,
      unknowns,
      signatureGroups: inputs.unknowns.signatureGroups.length,
      sourcePatternInstances: inputs.siteSpec.interactionSpec.patterns.length,
      rootCauses,
      diffs,
    });

    // --- persist the baseline ------------------------------------------------
    let storageBytes = 0;
    for (const page of pages) {
      storageBytes += (
        await writeQaJson(runDir, pageResultFileRelative(page.pageId, page.viewport), page)
      ).bytes;
    }
    for (const result of interactions) {
      storageBytes += (
        await writeQaJson(runDir, interactionResultFileRelative(result.patternId), result)
      ).bytes;
    }
    for (const result of unknowns) {
      storageBytes += (
        await writeQaJson(runDir, unknownResultFileRelative(result.unknownId), result)
      ).bytes;
    }
    storageBytes += (
      await writeQaJson(runDir, driftFileRelative(SOURCE_DRIFT_FILE), {
        schemaVersion: SCHEMA_VERSION,
        rootUrl,
        totals: baseline.sourceDrift,
        pages: pages.map((page) => ({
          pageId: page.pageId,
          viewport: page.viewport,
          url: page.url,
          status: page.status,
          ...page.sourceDrift,
        })),
      })
    ).bytes;
    storageBytes += (
      await writeQaJson(runDir, iterationSummaryFileRelative(qaIterationId(0)), {
        schemaVersion: SCHEMA_VERSION,
        iteration: qaIterationId(0),
        kind: "baseline",
        routeCheck,
        summary: baseline,
      })
    ).bytes;
    storageBytes += (
      await writeQaJson(runDir, BASELINE_SUMMARY_FILE, {
        schemaVersion: SCHEMA_VERSION,
        engine: QA_ENGINE,
        rootUrl,
        sourceReconstruction: portablePath(inputs.manifestFile),
        sourceSiteSpec: portablePath(inputs.siteSpecFile),
        routeCheck,
        familyAudit,
        diffCount: diffs.length,
        summary: baseline,
      })
    ).bytes;
    storageBytes += await persistScreenshots(runDir, retained);

    // --- corrections ---------------------------------------------------------
    const proposal = proposeCorrections({
      canvas: canvasCandidates,
      stateStyle: stateStyleCandidates,
      dataImage: dataImageCandidates,
    });
    // Cross-reference each correction with the diffs it claims to resolve.
    for (const correction of proposal.corrections) {
      correction.diffIds = diffIdsFor(correction, diffs);
    }
    storageBytes += (
      await writeQaJson(runDir, correctionFileRelative(PROPOSED_CORRECTIONS_FILE), {
        schemaVersion: SCHEMA_VERSION,
        sourceQaRun: portablePath(runDir),
        sourceSiteSpec: portablePath(inputs.siteSpecFile),
        sourceReconstruction: portablePath(inputs.manifestFile),
        rootUrl,
        corrections: proposal.corrections,
      })
    ).bytes;
    log(
      `[qa] corrections proposed ${proposal.corrections.length}, rejected at proposal ${proposal.rejected.length}`,
    );

    let final: QaSummary | undefined;
    const applied: QaCorrection[] = [];
    const rejected: RejectedCorrection[] = [...proposal.rejected];
    let iterations = 0;
    let history: Awaited<ReturnType<typeof runCorrectionLoop>>["history"] = [];

    if (options.autoFix && proposal.corrections.length > 0) {
      const loopStarted = Date.now();
      const loop = await runCorrectionLoop({
        runDir,
        inputs,
        browser,
        work,
        baselinePages: pages,
        baselineInteractions: interactions,
        baselineUnknowns: unknowns,
        proposal,
        maxIterations,
        concurrency,
        storedOriginals,
        routeUrls: siteSpec.routes.map((route) => route.url),
        profileFor,
        mapLimit,
        log,
      });
      timings.correctionLoopMs = Date.now() - loopStarted;
      iterations = loop.iterations;
      applied.push(...loop.accepted);
      rejected.push(...loop.rejected);
      storageBytes += loop.storageBytes;
      final = loop.finalSummary;
      history = loop.history;
    } else if (options.autoFix) {
      log("[qa] --auto-fix: 0 corrections proposed; nothing to apply");
    }

    storageBytes += (
      await writeQaJson(runDir, correctionFileRelative(APPLIED_CORRECTIONS_FILE), {
        schemaVersion: SCHEMA_VERSION,
        sourceQaRun: portablePath(runDir),
        sourceSiteSpec: portablePath(inputs.siteSpecFile),
        sourceReconstruction: portablePath(inputs.manifestFile),
        rootUrl,
        corrections: applied,
      })
    ).bytes;
    storageBytes += (
      await writeQaJson(runDir, correctionFileRelative(REJECTED_CORRECTIONS_FILE), {
        schemaVersion: SCHEMA_VERSION,
        rootUrl,
        rejected,
      })
    ).bytes;

    const finalSummary = final ?? baseline;
    const fixedDiffIds = diffIdsOfCorrections(applied);
    const finalRootCauses = summarizeRootCauses({ diffs, fixedDiffIds });
    storageBytes += (
      await writeQaJson(runDir, FINAL_SUMMARY_FILE, {
        schemaVersion: SCHEMA_VERSION,
        engine: QA_ENGINE,
        rootUrl,
        iterations,
        autoFix: options.autoFix === true,
        proposedCorrections: proposal.corrections.length,
        appliedCorrections: applied.length,
        rejectedCorrections: rejected.length,
        history,
        summary: finalSummary,
        rootCauses: finalRootCauses,
      })
    ).bytes;

    timings.totalMs = Date.now() - startedAt;
    storageBytes += (
      await writeQaJson(runDir, QA_MANIFEST_FILE, {
        schemaVersion: SCHEMA_VERSION,
        engine: QA_ENGINE,
        rootUrl,
        sourceReconstruction: portablePath(inputs.manifestFile),
        sourceSiteSpec: portablePath(inputs.siteSpecFile),
        sourceSiteObservation: portablePath(inputs.siteObservationFile),
        sourceInteractionExploration: portablePath(inputs.explorationFile),
        sourceInteractionPatterns: portablePath(inputs.patternsFile),
        config: {
          concurrency,
          snapshotOnly,
          liveOriginal: useLiveOriginal,
          autoFix: options.autoFix === true,
          maxFixIterations: maxIterations,
          familyAuditLimit,
          saveAllScreenshots: options.saveAllScreenshots === true,
        },
        counts: {
          pageViewportPairs: pages.length,
          diffs: diffs.length,
          interactionsReplayed: interactions.length,
          unknownsSampled: unknowns.length,
          familyAuditRoutes: familyAudit.length,
          proposedCorrections: proposal.corrections.length,
          appliedCorrections: applied.length,
          rejectedCorrections: rejected.length,
          iterations,
        },
        diffs,
        timings,
      })
    ).bytes;

    return {
      runDir,
      rootUrl,
      baseline,
      ...(final ? { final } : {}),
      diffs,
      pages,
      interactions,
      unknowns,
      familyAudit,
      proposed: proposal.corrections,
      applied,
      rejected,
      iterations,
      routeCheck,
      timings,
      storageBytes,
    };
  } finally {
    await browser.close().catch(() => {});
    await clone.stop();
  }
}

/** The diffs a correction claims to resolve, matched by its own subject. */
function diffIdsFor(correction: QaCorrection, diffs: readonly QaDiff[]): string[] {
  const payload = correction.payload;
  const out: string[] = [];
  for (const diff of diffs) {
    switch (payload.type) {
      case "document-canvas-background":
        if (diff.classification === "canvas-background-mismatch") out.push(diff.id);
        break;
      case "interaction-target-state-style":
        if (
          diff.classification === "interaction-target-style-mismatch" &&
          diff.patternId === payload.patternId
        ) {
          out.push(diff.id);
        }
        break;
      case "safe-data-image-recovery":
        if (
          diff.classification === "asset-missing" &&
          diff.pageId === payload.pageId &&
          diff.viewport === payload.viewport &&
          diff.nodeId === payload.nodeId
        ) {
          out.push(diff.id);
        }
        break;
    }
  }
  return out.sort();
}
