import type { Browser } from "playwright";
import {
  authoredBoundariesFromConditions,
  bisectGap,
  detectDiscontinuities,
  mergeAuthored,
  partitionIntervals,
  type BoundaryKind,
} from "./boundaries.js";
import { analyzeSample, type SampleAnalysis } from "./checks.js";
import { buildSampleSet } from "./sampling.js";
import { openSide, type SideSession, type SideTiming } from "./session.js";
import { toInPageTargets } from "./tracked.js";
import {
  COARSE_STEP_PX,
  CONTINUOUS_QA_SCHEMA_VERSION,
  G6_EXPLAINED_WITHIN_PX,
  REPRODUCE_EXTRA_SETTLE_MS,
  type AuthoredBoundarySet,
  type BisectedBoundary,
  type CheckId,
  type Discontinuity,
  type InPageTarget,
  type PageReading,
  type StylesheetScan,
  type SweepSample,
  type TrackedNode,
  type TrackedVariant,
} from "./types.js";
import {
  buildIntervalResults,
  mergeSpans,
  type CloneOnlyDiscontinuity,
  type IntervalResult,
  type MeasuredSample,
} from "./verdict.js";

/**
 * One route, both sides, end to end (brief steps 1–9). Needs only a browser and
 * two URLs, so the offline smoke drives exactly this function against local
 * fixtures and the CLI drives it against a live source and a `next start`
 * clone.
 */

export interface RouteRunInput {
  browser: Browser;
  routePath: string;
  pageId: string;
  sourceUrl: string;
  cloneUrl: string;
  variants: TrackedVariant[];
  /** SiteSpec `authoredBreakpoints` boundaries for this page. */
  siteSpecBoundaries: readonly number[];
  /** Reconstruction manifest switch values — sampling hints only, never partition. */
  cloneHintBoundaries: readonly number[];
  /** The width this route's clone swaps variant trees at (route-map primary). Added to the hints. */
  servedSwitch?: { px: number; source: string } | null;
  min: number;
  max: number;
  extrapolate: readonly number[];
  cssOverrideBody?: string;
  evidenceRoot: string;
  normalizePageState?: boolean;
  timing?: SideTiming;
  coarseStep?: number;
  log?: (line: string) => void;
}

export interface SideDiscovery {
  stylesheets: { sheets: number; unreadableSheets: number; conditions: number };
  sweepSamples: number;
  discontinuities: Discontinuity[];
  bisected: BisectedBoundary[];
  /** Confirmed 1px boundaries (first width of the new state). */
  observedBoundaries: number[];
  unconfirmed: number[];
}

export interface RouteResult {
  schemaVersion: number;
  route: { path: string; pageId: string; sourceUrl: string; cloneUrl: string };
  /** The route's served tree switch (null when the reconstruction declares none). */
  servedSwitchPx: number | null;
  servedSwitchSource: string | null;
  range: { min: number; max: number; extrapolate: number[] };
  timing: {
    sourceOpenMs: number;
    cloneOpenMs: number;
    sourceDiscoveryMs: number;
    cloneDiscoveryMs: number;
    samplingSourceMs: number;
    samplingCloneMs: number;
    sourceSideMs: number;
    cloneSideMs: number;
    totalMs: number;
  };
  normalization: { source: SideSession["normalization"]; clone: SideSession["normalization"] };
  tracked: Record<
    string,
    {
      nodes: number;
      candidates: number;
      capped: boolean;
      dedupedWrappers: number;
      byCategory: Record<string, number>;
      byRefSource: Record<string, number>;
      withAltRef: number;
    }
  >;
  discovery: {
    source: SideDiscovery & { authored: AuthoredBoundarySet };
    clone: SideDiscovery & { authoredBoundaries: number[]; hintBoundaries: number[] };
    partitionBoundaries: Array<{ width: number; kinds: BoundaryKind[] }>;
  };
  intervals: IntervalResult[];
  samples: {
    widths: number[];
    origins: Record<string, string[]>;
    perSample: Array<{
      width: number;
      served: string[];
      sourceVariant: string;
      shares: Record<string, number>;
      treeMismatch: boolean;
      scrollHeightRatio: number | null;
      violations: Partial<Record<CheckId, number>>;
      nodeStatus: SampleAnalysis["nodeStatus"];
      lazyRescroll: { source: boolean; clone: boolean };
    }>;
  };
  counters: {
    samples: number;
    nodesTracked: number;
    nodesMatchedEver: number;
    nodesNeverMatched: number;
    nodesTreeMismatchEver: number;
    nodeSampleStatus: SampleAnalysis["nodeStatus"];
    treeMismatchSamples: number;
    motionUnstable: { source: number; clone: number; union: number };
    exemptions: Partial<Record<CheckId, number>>;
    unverifiable: Partial<Record<CheckId, number>>;
    measurements: { source: number; clone: number };
    lazyScrollPasses: { source: number; clone: number };
    cssOverrideRequests: number;
    cloneOnlyDiscontinuities: number;
    /** Source node-samples matched only through anchored ±1 sibling re-resolution. */
    anchoredDriftMatches: number;
    /** Distinct tracked nodes matched through anchored re-resolution at ≥1 sample. */
    nodesAnchoredDriftEver: number;
    /** Why source nodes failed to match, summed over samples. */
    unmatchedReasons: Record<string, number>;
    /** Source node-samples refused because look-alike ±1 siblings matched the signature (review M4). */
    ambiguousSignature: number;
    /** Source+clone correspondence established, summed over all samples (review B1: 0 → route never PASS). */
    comparedNodeSamples: number;
  };
  summary: {
    verdict: "PASS" | "FAIL";
    intervalsPass: number;
    intervalsTotal: number;
    passWidthSpans: Array<{ min: number; max: number }>;
    failWidthSpans: Array<{ min: number; max: number }>;
    failingChecks: Partial<Record<CheckId, number>>;
    firstFailingWidth: number | null;
  };
  trackedNodes: Array<{ key: string; category: string; tag: string; sourcePath: string | null; refSource: string }>;
  rawViolationsTotal: number;
  rawViolations: ReturnType<typeof buildIntervalResults>["rawViolations"];
}

const CONTAINER = new Set(["a", "b", "d", "e"]);

function addCounts<K extends string>(into: Partial<Record<K, number>>, from: Partial<Record<K, number>>): void {
  for (const [key, value] of Object.entries(from) as Array<[K, number]>) {
    into[key] = (into[key] ?? 0) + value;
  }
}

async function discover(
  session: SideSession,
  min: number,
  max: number,
  step: number,
  xwKeys: ReadonlySet<string>,
  reproduceExtraSettleMs: number,
  log: (line: string) => void,
): Promise<{ scan: StylesheetScan; discovery: SideDiscovery }> {
  const scan = await session.scanStylesheets();
  const series: SweepSample[] = [];
  const widths: number[] = [];
  for (let w = min; w <= max; w += step) widths.push(w);
  if (widths[widths.length - 1] !== max) widths.push(max);
  for (const width of widths) {
    series.push({ width, reading: await session.measure(width, false) });
  }
  const gaps = detectDiscontinuities(series, {
    xwKeys,
    noXKeys: new Set(session.motionUnstable),
  });
  const bisected: BisectedBoundary[] = [];
  for (const gap of gaps) {
    bisected.push(
      await bisectGap(
        series,
        gap,
        (width) => session.measure(width, false),
        (width) => session.measure(width, false, [], reproduceExtraSettleMs),
      ),
    );
  }
  const observed = [...new Set(bisected.filter((b) => b.confirmed).map((b) => b.width))].sort((a, b) => a - b);
  const unconfirmed = [...new Set(bisected.filter((b) => !b.confirmed).map((b) => b.width))]
    .filter((width) => !observed.includes(width))
    .sort((a, b) => a - b);
  log(
    `[continuous-qa] ${session.side} sweep ${series.length} widths, ${gaps.length} gaps → ` +
      `observed [${observed.join(",")}]${unconfirmed.length ? ` unreproduced [${unconfirmed.join(",")}]` : ""}`,
  );
  return {
    scan,
    discovery: {
      stylesheets: {
        sheets: scan.sheets,
        unreadableSheets: scan.unreadableSheets,
        conditions: scan.conditions.length,
      },
      sweepSamples: series.length,
      discontinuities: gaps.map((gap) => ({ lo: gap.lo, hi: gap.hi, reasons: gap.reasons, keys: gap.keys })),
      bisected,
      observedBoundaries: observed,
      unconfirmed,
    },
  };
}

export async function runContinuousRoute(input: RouteRunInput): Promise<RouteResult> {
  const log = input.log ?? (() => {});
  const startedAt = Date.now();
  const step = input.coarseStep ?? COARSE_STEP_PX;
  const reproduceExtraSettleMs = input.timing?.reproduceExtraSettleMs ?? REPRODUCE_EXTRA_SETTLE_MS;
  const extrapolate = [...new Set(input.extrapolate)].filter((w) => w > input.max).sort((a, b) => a - b);
  const tracked = new Map<string, TrackedNode>();
  for (const variant of input.variants) for (const node of variant.nodes) tracked.set(node.key, node);
  const targets: InPageTarget[] = toInPageTargets(input.variants);
  const xwKeys = new Set([...tracked.values()].filter((t) => t.categories.some((c) => CONTAINER.has(c))).map((t) => t.key));

  let source: SideSession | undefined;
  let clone: SideSession | undefined;
  try {
    const t0 = Date.now();
    source = await openSide({
      browser: input.browser,
      side: "source",
      url: input.sourceUrl,
      pageId: input.pageId,
      loadWidth: input.min,
      targets,
      normalize: input.normalizePageState,
      evidenceRoot: input.evidenceRoot,
      timing: input.timing,
      log,
    });
    const sourceOpenMs = Date.now() - t0;
    const t1 = Date.now();
    clone = await openSide({
      browser: input.browser,
      side: "clone",
      url: input.cloneUrl,
      pageId: input.pageId,
      loadWidth: input.min,
      targets,
      cssOverrideBody: input.cssOverrideBody,
      normalize: input.normalizePageState,
      evidenceRoot: input.evidenceRoot,
      timing: input.timing,
      log,
    });
    const cloneOpenMs = Date.now() - t1;

    // 1. Boundary discovery — source defines the partition.
    const t2 = Date.now();
    const sourceFound = await discover(source, input.min, input.max, step, xwKeys, reproduceExtraSettleMs, log);
    const sourceDiscoveryMs = Date.now() - t2;
    const t3 = Date.now();
    const cloneFound = await discover(clone, input.min, input.max, step, xwKeys, reproduceExtraSettleMs, log);
    const cloneDiscoveryMs = Date.now() - t3;

    const liveAuthored = authoredBoundariesFromConditions(sourceFound.scan.conditions);
    const authored = mergeAuthored(input.siteSpecBoundaries, liveAuthored, sourceFound.scan.unreadableSheets);
    const cloneAuthored = authoredBoundariesFromConditions(cloneFound.scan.conditions);

    const partitionMap = new Map<number, BoundaryKind[]>();
    const addKind = (width: number, kind: BoundaryKind): void => {
      const list = partitionMap.get(width) ?? [];
      if (!list.includes(kind)) list.push(kind);
      partitionMap.set(width, list);
    };
    for (const b of authored.media) addKind(b, "authored-media");
    for (const b of authored.container) addKind(b, "authored-container");
    for (const b of sourceFound.discovery.observedBoundaries) addKind(b, "observed");
    const extrapolateMax = extrapolate.length > 0 ? extrapolate[extrapolate.length - 1]! : input.max;
    const intervals = partitionIntervals({
      min: input.min,
      max: input.max,
      extrapolateMax,
      boundaries: partitionMap,
    });
    const sourceBoundaries = [...partitionMap.keys()].sort((a, b) => a - b);

    // G6 — clone discontinuities with no source boundary within ±2px.
    const g6: CloneOnlyDiscontinuity[] = [];
    for (const b of cloneFound.discovery.bisected.filter((x) => x.confirmed)) {
      let nearest: number | null = null;
      for (const s of sourceBoundaries) {
        if (nearest === null || Math.abs(s - b.width) < Math.abs(nearest - b.width)) nearest = s;
      }
      if (nearest !== null && Math.abs(nearest - b.width) <= G6_EXPLAINED_WITHIN_PX) continue;
      if (g6.some((d) => d.width === b.width)) continue;
      g6.push({ width: b.width, lo: b.lo, hi: b.hi, reasons: b.reasons, keys: b.keys, nearestSourceBoundary: nearest });
    }
    g6.sort((a, b) => a.width - b.width);

    // 2. Sample set.
    const cloneBoundaries = [
      ...new Set([
        ...cloneFound.discovery.observedBoundaries,
        ...cloneFound.discovery.unconfirmed,
        ...cloneAuthored.media,
        ...input.cloneHintBoundaries,
        ...(input.servedSwitch ? [input.servedSwitch.px] : []),
      ]),
    ].sort((a, b) => a - b);
    const sampleSet = buildSampleSet({
      routePath: input.routePath,
      min: input.min,
      max: input.max,
      extrapolate,
      sourceBoundaries,
      cloneBoundaries,
      intervals,
    });
    log(`[continuous-qa] ${intervals.length} intervals, ${sampleSet.widths.length} samples`);

    // 3–7. Measure every sample on both sides, analyse.
    const motionUnstable = new Set([...source.motionUnstable, ...clone.motionUnstable]);
    const measured: MeasuredSample[] = [];
    const perSample: RouteResult["samples"]["perSample"] = [];
    let samplingSourceMs = 0;
    let samplingCloneMs = 0;
    let prevWidth: number | null = null;
    let prevSource: PageReading | null = null;
    let prevClone: PageReading | null = null;
    for (const width of sampleSet.widths) {
      const crossed =
        prevWidth !== null && sourceBoundaries.some((b) => b > prevWidth! && b <= width);
      const tc = Date.now();
      let cloneReading = await clone.measure(width, true);
      let cloneRescroll = false;
      if (crossed && prevClone && cloneReading.rendered !== prevClone.rendered) {
        await clone.lazyScroll();
        cloneReading = await clone.measure(width, true);
        cloneRescroll = true;
      }
      samplingCloneMs += Date.now() - tc;

      const findTextKeys: string[] = [];
      const findTexts: string[] = [];
      for (const node of cloneReading.nodes) {
        const t = tracked.get(node.k);
        if (!t || !cloneReading.served.includes(t.variant)) continue;
        if (node.st !== "matched" || node.v !== 1 || !node.txt) continue;
        if (!t.categories.includes("c") && !t.categories.includes("f")) continue;
        findTextKeys.push(node.k);
        findTexts.push(node.txt);
      }
      const ts = Date.now();
      let sourceReading = await source.measure(width, true, findTexts);
      let sourceRescroll = false;
      if (crossed && prevSource && sourceReading.rendered !== prevSource.rendered) {
        await source.lazyScroll();
        sourceReading = await source.measure(width, true, findTexts);
        sourceRescroll = true;
      }
      samplingSourceMs += Date.now() - ts;

      const analysis = analyzeSample({
        width,
        source: sourceReading,
        clone: cloneReading,
        tracked,
        motionUnstable,
        findTextKeys,
      });
      measured.push({ width, source: sourceReading, clone: cloneReading, analysis });
      const histogram: Partial<Record<CheckId, number>> = {};
      for (const v of analysis.violations) histogram[v.check] = (histogram[v.check] ?? 0) + 1;
      perSample.push({
        width,
        served: analysis.served,
        sourceVariant: analysis.sourceVariant,
        shares: analysis.shares,
        treeMismatch: analysis.treeMismatch,
        scrollHeightRatio: analysis.scrollHeightRatio,
        violations: histogram,
        nodeStatus: analysis.nodeStatus,
        lazyRescroll: { source: sourceRescroll, clone: cloneRescroll },
      });
      prevWidth = width;
      prevSource = sourceReading;
      prevClone = cloneReading;
    }

    // 8–9. Behaviour classes, verdicts, summary.
    const built = buildIntervalResults({ intervals, samples: measured, tracked, motionUnstable, g6 });
    const passSamples = new Set<number>();
    for (const sample of measured) {
      const interval = built.intervals.find((i) => sample.width >= i.min && sample.width < i.max);
      if (interval?.verdict === "PASS" && sample.analysis.violations.length === 0) passSamples.add(sample.width);
    }
    const spans = mergeSpans(sampleSet.widths, passSamples);
    const failingChecks: Partial<Record<CheckId, number>> = {};
    for (const interval of built.intervals) addCounts(failingChecks, interval.failingChecks);
    const firstFailing = built.intervals
      .map((i) => i.firstFailingWidth)
      .filter((w): w is number => w !== null);

    const nodeSampleStatus = { compared: 0, matched: 0, unmatched: 0, ambiguous: 0, treeMismatch: 0 };
    const exemptions: Partial<Record<CheckId, number>> = {};
    const unverifiable: Partial<Record<CheckId, number>> = {};
    const matchedEver = new Set<string>();
    const treeMismatchEver = new Set<string>();
    const driftEver = new Set<string>();
    const unmatchedReasons: Record<string, number> = {};
    let anchoredDriftMatches = 0;
    let ambiguousSignature = 0;
    let comparedNodeSamples = 0;
    for (const sample of measured) {
      addCounts(nodeSampleStatus, sample.analysis.nodeStatus);
      addCounts(exemptions, sample.analysis.exemptions);
      addCounts(unverifiable, sample.analysis.unverifiable);
      comparedNodeSamples += sample.analysis.coverage.compared;
      for (const node of sample.source.nodes) {
        if (node.why === "ambiguous-signature") ambiguousSignature++;
        if (node.st === "matched" && node.why === "anchored-drift") {
          anchoredDriftMatches++;
          driftEver.add(node.k);
        }
        if (node.st === "unmatched" || node.st === "ambiguous") {
          const reason = node.why ?? node.st;
          unmatchedReasons[reason] = (unmatchedReasons[reason] ?? 0) + 1;
        }
        if (node.st === "matched") matchedEver.add(node.k);
        if (node.st === "tree-mismatch") treeMismatchEver.add(node.k);
      }
    }

    const trackedSummary: RouteResult["tracked"] = {};
    for (const variant of input.variants) {
      const byCategory: Record<string, number> = {};
      const byRefSource: Record<string, number> = {};
      for (const node of variant.nodes) {
        for (const c of node.categories) byCategory[c] = (byCategory[c] ?? 0) + 1;
        byRefSource[node.refSource] = (byRefSource[node.refSource] ?? 0) + 1;
      }
      trackedSummary[variant.variant] = {
        nodes: variant.nodes.length,
        candidates: variant.candidates,
        capped: variant.capped,
        dedupedWrappers: variant.dedupedWrappers,
        byCategory,
        byRefSource,
        withAltRef: variant.nodes.filter((n) => n.alt !== null).length,
      };
    }

    const intervalsPass = built.intervals.filter((i) => i.verdict === "PASS").length;
    const sourceSideMs = sourceOpenMs + sourceDiscoveryMs + samplingSourceMs;
    const cloneSideMs = cloneOpenMs + cloneDiscoveryMs + samplingCloneMs;
    return {
      schemaVersion: CONTINUOUS_QA_SCHEMA_VERSION,
      route: {
        path: input.routePath,
        pageId: input.pageId,
        sourceUrl: input.sourceUrl,
        cloneUrl: input.cloneUrl,
      },
      servedSwitchPx: input.servedSwitch?.px ?? null,
      servedSwitchSource: input.servedSwitch?.source ?? null,
      range: { min: input.min, max: input.max, extrapolate },
      timing: {
        sourceOpenMs,
        cloneOpenMs,
        sourceDiscoveryMs,
        cloneDiscoveryMs,
        samplingSourceMs,
        samplingCloneMs,
        sourceSideMs,
        cloneSideMs,
        totalMs: Date.now() - startedAt,
      },
      normalization: { source: source.normalization, clone: clone.normalization },
      tracked: trackedSummary,
      discovery: {
        source: { ...sourceFound.discovery, authored },
        clone: {
          ...cloneFound.discovery,
          authoredBoundaries: cloneAuthored.media,
          hintBoundaries: [
            ...new Set([...input.cloneHintBoundaries, ...(input.servedSwitch ? [input.servedSwitch.px] : [])]),
          ].sort((a, b) => a - b),
        },
        partitionBoundaries: sourceBoundaries.map((width) => ({
          width,
          kinds: [...(partitionMap.get(width) ?? [])].sort(),
        })),
      },
      intervals: built.intervals,
      samples: { widths: sampleSet.widths, origins: sampleSet.origins, perSample },
      counters: {
        samples: measured.length,
        nodesTracked: tracked.size,
        nodesMatchedEver: matchedEver.size,
        nodesNeverMatched: tracked.size - matchedEver.size,
        nodesTreeMismatchEver: treeMismatchEver.size,
        nodeSampleStatus,
        treeMismatchSamples: measured.filter((s) => s.analysis.treeMismatch).length,
        motionUnstable: {
          source: source.motionUnstable.length,
          clone: clone.motionUnstable.length,
          union: motionUnstable.size,
        },
        exemptions,
        unverifiable,
        measurements: { source: source.measurements, clone: clone.measurements },
        lazyScrollPasses: { source: source.lazyScrollPasses, clone: clone.lazyScrollPasses },
        cssOverrideRequests: clone.cssOverrideRequests,
        cloneOnlyDiscontinuities: g6.length,
        anchoredDriftMatches,
        nodesAnchoredDriftEver: driftEver.size,
        unmatchedReasons,
        ambiguousSignature,
        comparedNodeSamples,
      },
      summary: {
        verdict:
          intervalsPass === built.intervals.length && built.intervals.length > 0 && comparedNodeSamples > 0
            ? "PASS"
            : "FAIL",
        intervalsPass,
        intervalsTotal: built.intervals.length,
        passWidthSpans: spans.passWidthSpans,
        failWidthSpans: spans.failWidthSpans,
        failingChecks,
        firstFailingWidth: firstFailing.length > 0 ? Math.min(...firstFailing) : null,
      },
      trackedNodes: [...tracked.values()]
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map((t) => ({
          key: t.key,
          category: t.categories.join(""),
          tag: t.tag,
          sourcePath: t.primary ? t.primary.path.join(".") : null,
          refSource: t.refSource,
        })),
      rawViolationsTotal: built.rawViolationsTotal,
      rawViolations: built.rawViolations,
    };
  } finally {
    await source?.close();
    await clone?.close();
  }
}
