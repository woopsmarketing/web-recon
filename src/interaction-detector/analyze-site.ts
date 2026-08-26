import {
  loadPageObservation,
  loadSiteObservation,
  type LoadedPageObservation,
} from "./load-observation.js";
import { detectViewportCandidates } from "./detect-candidates.js";
import {
  buildCapabilitySummary,
  buildGuardSummary,
  buildPageSummary,
  buildPrioritySummary,
  buildValidationComparisons,
  toSitePageSummary,
} from "./summarize.js";
import {
  interactionCandidatesFileRelative,
  savePageInteractionAnalysis,
  saveSiteInteractionAnalysis,
} from "./store.js";
import {
  DETECTOR_ENGINE,
  SCHEMA_VERSION,
  type PageInteractionAnalysis,
  type SiteInteractionAnalysis,
  type SiteInteractionStats,
  type SitePageInteractionSummary,
  type SkippedPage,
} from "./types.js";

/**
 * Site-level orchestration for Interaction Candidate Detection (Task 10).
 *
 * One pass over an existing Task 09 site run:
 *
 *   site-observation.json
 *     → for each SUCCESSFUL page
 *         observation.json + viewports/{desktop,mobile}/{dom,styles}.json
 *         → detectViewportCandidates() × 2   (independent viewports)
 *         → pages/<id>/interaction-candidates.json
 *     → interaction-analysis.json
 *
 * Failure policy mirrors Task 09's, one level up (item 7): a page that FAILED to
 * be observed is skipped and counted — the whole detector must not die because
 * one page timed out days ago. A page that Task 09 recorded as `success` but
 * whose artifacts are missing or inconsistent is a different thing entirely
 * (pipeline corruption), and `load-observation.ts` fails fast on it.
 *
 * Pages are processed sequentially. There is no concurrency knob: this is JSON
 * parsing and array walking with no network and no browser, so the run is
 * seconds long, and a pool would add nondeterministic interleaving to a stage
 * whose entire value is being deterministic.
 */

export interface AnalyzeSiteOptions {
  /** Path to an existing Task 09 `site-observation.json`. */
  siteObservationFile: string;
  /** Timestamp recorded in the artifacts; injectable so tests stay deterministic. */
  analyzedAt?: string;
  /** Progress callback, one call per page (analyzed or skipped). */
  onPageAnalyzed?: (progress: PageProgress) => void;
}

export interface PageProgress {
  index: number;
  total: number;
  pageId: string;
  url: string;
  /** Absent when the page was skipped. */
  analysis?: PageInteractionAnalysis;
  skippedStatus?: string;
}

export interface SiteInteractionRun {
  analysis: SiteInteractionAnalysis;
  /** Directory holding `site-observation.json` (and now the new artifacts). */
  runDir: string;
  manifestPath: string;
  /** In-memory page analyses, in `pageId` order. */
  pages: PageInteractionAnalysis[];
}

/** Build ONE page's analysis from its loaded observation. Pure. */
export function analyzePage(
  loaded: LoadedPageObservation,
  analyzedAt: string,
): PageInteractionAnalysis {
  const desktop = detectViewportCandidates({
    viewportId: "desktop",
    elements: loaded.viewports.desktop.elements,
    styleTable: loaded.viewports.desktop.styleTable,
    domFile: loaded.viewports.desktop.domFile,
    stylesFile: loaded.viewports.desktop.stylesFile,
    pageUrl: loaded.observation.viewports.desktop.metadata.finalUrl,
  });
  const mobile = detectViewportCandidates({
    viewportId: "mobile",
    elements: loaded.viewports.mobile.elements,
    styleTable: loaded.viewports.mobile.styleTable,
    domFile: loaded.viewports.mobile.domFile,
    stylesFile: loaded.viewports.mobile.stylesFile,
    pageUrl: loaded.observation.viewports.mobile.metadata.finalUrl,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    engine: DETECTOR_ENGINE,
    pageId: loaded.page.pageId,
    url: loaded.page.url,
    role: loaded.page.role,
    familyId: loaded.page.familyId,
    familyType: loaded.page.familyType,
    sourceObservationFile: loaded.observationFileRelative,
    analyzedAt,
    viewports: { desktop, mobile },
    summary: buildPageSummary(desktop, mobile),
  };
}

/** Round to 4 decimals, matching every other rate in this codebase. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Analyze a whole site run and persist both artifact kinds.
 *
 * Offline end to end: the only I/O is reading Task 09's files and writing the
 * two derived ones.
 */
export async function analyzeSiteInteractions(
  options: AnalyzeSiteOptions,
): Promise<SiteInteractionRun> {
  const startedAt = Date.now();
  const analyzedAt = options.analyzedAt ?? new Date().toISOString();

  const { siteObservation, runDir, sourceSiteObservationFile } =
    await loadSiteObservation(options.siteObservationFile);

  const pages: PageInteractionAnalysis[] = [];
  const pageSummaries: SitePageInteractionSummary[] = [];
  const skippedPages: SkippedPage[] = [];
  let interactionCandidatesBytes = 0;
  let domElementsAnalyzed = 0;

  const total = siteObservation.pages.length;
  let index = 0;
  for (const page of siteObservation.pages) {
    index++;
    if (page.status !== "success") {
      skippedPages.push({
        pageId: page.pageId,
        url: page.url,
        status: page.status,
      });
      options.onPageAnalyzed?.({
        index,
        total,
        pageId: page.pageId,
        url: page.url,
        skippedStatus: page.status,
      });
      continue;
    }

    const loaded = await loadPageObservation(runDir, page);
    const analysis = analyzePage(loaded, analyzedAt);
    const saved = await savePageInteractionAnalysis(runDir, analysis);

    pages.push(analysis);
    pageSummaries.push(toSitePageSummary(analysis, saved.relativePath));
    interactionCandidatesBytes += saved.bytes;
    domElementsAnalyzed +=
      analysis.viewports.desktop.stats.domElementCount +
      analysis.viewports.mobile.stats.domElementCount;

    options.onPageAnalyzed?.({
      index,
      total,
      pageId: page.pageId,
      url: page.url,
      analysis,
    });
  }

  const prioritySummary = buildPrioritySummary(pages);
  const capabilitySummary = buildCapabilitySummary(pages);
  const guardSummary = buildGuardSummary(pages);

  const sum = (pick: (p: PageInteractionAnalysis) => number): number =>
    pages.reduce((acc, p) => acc + pick(p), 0);

  const desktopCandidateCount = sum((p) => p.viewports.desktop.stats.candidateCount);
  const mobileCandidateCount = sum((p) => p.viewports.mobile.stats.candidateCount);
  const totalCandidateCount = desktopCandidateCount + mobileCandidateCount;

  const controlRelationCount = sum(
    (p) =>
      p.viewports.desktop.stats.controlRelationCount +
      p.viewports.mobile.stats.controlRelationCount,
  );
  const resolvedControlCount = sum(
    (p) =>
      p.viewports.desktop.stats.resolvedControlCount +
      p.viewports.mobile.stats.resolvedControlCount,
  );

  const stats: SiteInteractionStats = {
    analyzedPages: pages.length,
    skippedFailedPages: skippedPages.length,
    domElementsAnalyzed,

    desktopCandidateCount,
    mobileCandidateCount,
    totalCandidateCount,

    p1Count: prioritySummary.total.P1,
    p2Count: prioritySummary.total.P2,
    p3Count: prioritySummary.total.P3,

    visibleCandidateCount: sum(
      (p) =>
        p.viewports.desktop.stats.visibleCandidateCount +
        p.viewports.mobile.stats.visibleCandidateCount,
    ),
    hiddenCandidateCount: sum(
      (p) =>
        p.viewports.desktop.stats.hiddenCandidateCount +
        p.viewports.mobile.stats.hiddenCandidateCount,
    ),
    operableCandidateCount: sum(
      (p) =>
        p.viewports.desktop.stats.operableCandidateCount +
        p.viewports.mobile.stats.operableCandidateCount,
    ),
    nonOperableCandidateCount: sum(
      (p) =>
        p.viewports.desktop.stats.nonOperableCandidateCount +
        p.viewports.mobile.stats.nonOperableCandidateCount,
    ),

    controlledTargetCount: sum(
      (p) =>
        p.viewports.desktop.stats.targetCount + p.viewports.mobile.stats.targetCount,
    ),
    controlRelationCount,
    resolvedControlCount,
    unresolvedControlCount: controlRelationCount - resolvedControlCount,

    p3Ratio:
      totalCandidateCount === 0
        ? 0
        : round4(prioritySummary.total.P3 / totalCandidateCount),

    interactionCandidatesBytes,
    // Filled in by the store's fixpoint pass once the manifest's real size is known.
    interactionAnalysisJsonBytes: 0,
    totalAddedBytes: 0,

    elapsedMs: 0,
  };

  const analysis: SiteInteractionAnalysis = {
    schemaVersion: SCHEMA_VERSION,
    engine: DETECTOR_ENGINE,
    rootUrl: siteObservation.rootUrl,
    sourceSiteObservationFile,
    analyzedAt,
    stats,
    pages: [...pageSummaries].sort((a, b) => a.pageId.localeCompare(b.pageId)),
    skippedPages: [...skippedPages].sort((a, b) => a.pageId.localeCompare(b.pageId)),
    capabilitySummary,
    prioritySummary,
    guardSummary,
    validationInteractionComparisons: buildValidationComparisons(
      siteObservation,
      new Map(pages.map((p) => [p.pageId, p])),
    ),
  };

  // Wall time is measured last so it covers loading, detection and page writes —
  // everything except writing the manifest that records it.
  analysis.stats.elapsedMs = Date.now() - startedAt;

  const saved = await saveSiteInteractionAnalysis(runDir, analysis);

  return {
    analysis: saved.analysis,
    runDir,
    manifestPath: saved.filePath,
    pages,
  };
}

/** Exposed for callers that want the manifest path convention. */
export { interactionCandidatesFileRelative };
