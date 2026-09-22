import { compareFits, fitBehavior, type FitSample } from "./behavior.js";
import type { SampleAnalysis } from "./checks.js";
import {
  MAX_RAW_VIOLATIONS,
  MIN_COMPARED_RATIO,
  WORST_NODES,
  relationTolerance,
  type BehaviorFit,
  type CheckId,
  type Interval,
  type NodeReading,
  type PageReading,
  type TrackedNode,
  type Violation,
} from "./types.js";

/**
 * Interval verdicts and the route summary (brief step 9) — pure.
 *
 * route interval PASS ⇔ every matched node PASS on behaviour class
 *                      ∧ R9–R15 violations 0 ∧ H1–H8 violations 0 over the
 *                        interval's samples ∧ no G6 inside it
 *                      ∧ coverage ratio ≥ MIN_COMPARED_RATIO ∧ compared > 0
 *                        (else `insufficient-coverage`, review B1)
 * Tree-mismatch samples are recorded as FAIL explicitly.
 */

export interface MeasuredSample {
  width: number;
  source: PageReading;
  clone: PageReading;
  analysis: SampleAnalysis;
}

export interface CloneOnlyDiscontinuity {
  width: number;
  lo: number;
  hi: number;
  reasons: string[];
  keys: string[];
  nearestSourceBoundary: number | null;
}

export interface NodeClassRow {
  key: string;
  nodeId: string;
  variant: string;
  category: string;
  source: BehaviorFit;
  clone: BehaviorFit;
  pass: boolean;
  reason: string | null;
}

export interface WorstNode {
  key: string;
  check: CheckId;
  count: number;
  firstWidth: number;
  sourcePath: string | null;
  example: { width: number; source: number | string | null; clone: number | string | null; detail?: string };
}

export interface IntervalResult {
  min: number;
  max: number;
  extrapolated: boolean;
  sourceEvidence: Interval["sourceEvidence"];
  samples: number[];
  verdict: "PASS" | "FAIL" | "UNSAMPLED";
  failingChecks: Partial<Record<CheckId, number>>;
  minorChecks: Partial<Record<CheckId, number>>;
  firstFailingWidth: number | null;
  treeMismatchWidths: number[];
  cloneOnlyDiscontinuities: CloneOnlyDiscontinuity[];
  /**
   * Coverage (review B1): tracked = tracked node-samples of the served
   * variant(s) over non-tree-mismatch samples; compared = source+clone
   * correspondence established; ratio = compared/tracked (0 when tracked = 0).
   * ratio < MIN_COMPARED_RATIO or compared = 0 → `insufficient-coverage` FAIL.
   */
  coverage: {
    tracked: number;
    compared: number;
    visibleCompared: number;
    unmatched: number;
    ambiguous: number;
    ratio: number;
    floor: number;
  };
  nodesClassified: number;
  nodesClassFailed: number;
  worstNodes: WorstNode[];
  nodeClasses: NodeClassRow[];
}

export interface WidthSpan {
  min: number;
  max: number;
}

function toFit(node: NodeReading, vw: number): FitSample {
  return { W: vw, x: node.x, w: node.w, v: node.v, mxw: node.mxw ?? null };
}

function inc(map: Partial<Record<CheckId, number>>, check: CheckId, by = 1): void {
  map[check] = (map[check] ?? 0) + by;
}

function magnitude(v: Violation): number {
  if (typeof v.source === "number" && typeof v.clone === "number") return Math.abs(v.source - v.clone);
  return 0;
}

export function mergeSpans(widths: readonly number[], pass: ReadonlySet<number>): {
  passWidthSpans: WidthSpan[];
  failWidthSpans: WidthSpan[];
} {
  const passWidthSpans: WidthSpan[] = [];
  const failWidthSpans: WidthSpan[] = [];
  let current: { ok: boolean; span: WidthSpan } | null = null;
  for (const width of [...widths].sort((a, b) => a - b)) {
    const ok = pass.has(width);
    if (current && current.ok === ok) {
      current.span.max = width;
      continue;
    }
    if (current) (current.ok ? passWidthSpans : failWidthSpans).push(current.span);
    current = { ok, span: { min: width, max: width } };
  }
  if (current) (current.ok ? passWidthSpans : failWidthSpans).push(current.span);
  return { passWidthSpans, failWidthSpans };
}

export function buildIntervalResults(input: {
  intervals: readonly Interval[];
  samples: readonly MeasuredSample[];
  tracked: ReadonlyMap<string, TrackedNode>;
  motionUnstable: ReadonlySet<string>;
  g6: readonly CloneOnlyDiscontinuity[];
}): { intervals: IntervalResult[]; rawViolations: Violation[]; rawViolationsTotal: number } {
  const results: IntervalResult[] = [];
  const raw: Violation[] = [];
  let rawTotal = 0;
  for (const interval of input.intervals) {
    const inside = input.samples.filter((s) => s.width >= interval.min && s.width < interval.max);
    const violations: Violation[] = inside.flatMap((s) => s.analysis.violations);

    // Behaviour class per node over the interval.
    const series = new Map<string, { s: FitSample[]; c: FitSample[]; first: number }>();
    for (const sample of inside) {
      if (sample.analysis.treeMismatch) continue;
      const sourceByKey = new Map(sample.source.nodes.map((n) => [n.k, n]));
      for (const c of sample.clone.nodes) {
        const t = input.tracked.get(c.k);
        if (!t || !sample.analysis.served.includes(t.variant)) continue;
        const s = sourceByKey.get(c.k);
        if (!s || s.st !== "matched" || c.st !== "matched") continue;
        const entry = series.get(c.k) ?? { s: [], c: [], first: sample.width };
        entry.s.push(toFit(s, sample.source.vw));
        entry.c.push(toFit(c, sample.clone.vw));
        series.set(c.k, entry);
      }
    }
    const nodeClasses: NodeClassRow[] = [];
    for (const key of [...series.keys()].sort()) {
      const entry = series.get(key)!;
      const t = input.tracked.get(key)!;
      const skipAnchor = input.motionUnstable.has(key);
      const sourceFit = fitBehavior(entry.s, interval.min, { skipAnchor });
      const cloneFit = fitBehavior(entry.c, interval.min, { skipAnchor });
      const medianWidth = entry.s[Math.floor((entry.s.length - 1) / 2)]?.W ?? interval.min;
      const comparison = compareFits(sourceFit, cloneFit, relationTolerance(medianWidth), {
        s: entry.s,
        c: entry.c,
        skipX: skipAnchor,
      });
      nodeClasses.push({
        key,
        nodeId: t.nodeId,
        variant: t.variant,
        category: t.category,
        source: sourceFit,
        clone: cloneFit,
        pass: comparison.pass,
        reason: comparison.reason,
      });
      if (!comparison.pass) {
        violations.push({
          width: entry.first,
          check: "behavior-class",
          key,
          source: `${sourceFit.widthClass}/${sourceFit.anchor}`,
          clone: `${cloneFit.widthClass}/${cloneFit.anchor}`,
          detail: comparison.reason ?? undefined,
        });
      }
    }

    const g6 = input.g6.filter((d) => d.width >= interval.min && d.width < interval.max);
    for (const d of g6) {
      violations.push({
        width: d.width,
        check: "clone-only-discontinuity",
        key: null,
        source: d.nearestSourceBoundary,
        clone: d.width,
        detail: d.reasons.join(","),
      });
    }

    const coverage = { tracked: 0, compared: 0, visibleCompared: 0, unmatched: 0, ambiguous: 0, ratio: 0, floor: MIN_COMPARED_RATIO };
    for (const sample of inside) {
      // Older callers may lack `coverage`; derive it from nodeStatus then.
      const cov = sample.analysis.coverage ?? {
        tracked: sample.analysis.nodeStatus.matched + sample.analysis.nodeStatus.unmatched + sample.analysis.nodeStatus.ambiguous,
        compared: sample.analysis.nodeStatus.matched,
        visibleCompared: sample.analysis.nodeStatus.compared,
      };
      coverage.tracked += cov.tracked;
      coverage.compared += cov.compared;
      coverage.visibleCompared += cov.visibleCompared;
      coverage.unmatched += sample.analysis.nodeStatus.unmatched;
      coverage.ambiguous += sample.analysis.nodeStatus.ambiguous;
    }
    coverage.ratio = coverage.tracked > 0 ? Math.round((coverage.compared / coverage.tracked) * 10000) / 10000 : 0;
    if (inside.length > 0 && (coverage.compared === 0 || coverage.ratio < MIN_COMPARED_RATIO)) {
      violations.push({
        width: inside[0]!.width,
        check: "insufficient-coverage",
        key: null,
        source: coverage.ratio,
        clone: coverage.compared,
        detail: `compared ${coverage.compared}/${coverage.tracked} node-samples (unmatched ${coverage.unmatched}, ambiguous ${coverage.ambiguous}) < floor ${MIN_COMPARED_RATIO}`,
      });
    }

    const failingChecks: Partial<Record<CheckId, number>> = {};
    const minorChecks: Partial<Record<CheckId, number>> = {};
    for (const v of violations) {
      inc(failingChecks, v.check);
      if (v.minor) inc(minorChecks, v.check);
    }
    rawTotal += violations.length;
    for (const v of violations) if (raw.length < MAX_RAW_VIOLATIONS) raw.push(v);

    const groups = new Map<string, Violation[]>();
    for (const v of violations) {
      if (v.key === null) continue;
      const id = `${v.key}#${v.check}`;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(v);
    }
    const worstNodes: WorstNode[] = [...groups.entries()]
      .map(([, list]) => {
        const worst = [...list].sort((a, b) => magnitude(b) - magnitude(a) || a.width - b.width)[0]!;
        const firstKey = worst.key!.split("|")[0]!;
        const t = input.tracked.get(firstKey);
        const example: WorstNode["example"] = { width: worst.width, source: worst.source, clone: worst.clone };
        if (worst.detail) example.detail = worst.detail;
        return {
          key: worst.key!,
          check: worst.check,
          count: list.length,
          firstWidth: Math.min(...list.map((v) => v.width)),
          sourcePath: t?.primary ? t.primary.path.join(".") : null,
          example,
        };
      })
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.check < b.check ? -1 : 1))
      .slice(0, WORST_NODES);

    const verdict: IntervalResult["verdict"] =
      inside.length === 0 ? "UNSAMPLED" : violations.length === 0 ? "PASS" : "FAIL";
    results.push({
      min: interval.min,
      max: interval.max,
      extrapolated: interval.extrapolated,
      sourceEvidence: interval.sourceEvidence,
      samples: inside.map((s) => s.width),
      verdict,
      failingChecks,
      minorChecks,
      firstFailingWidth: violations.length > 0 ? Math.min(...violations.map((v) => v.width)) : null,
      treeMismatchWidths: inside.filter((s) => s.analysis.treeMismatch).map((s) => s.width),
      coverage,
      cloneOnlyDiscontinuities: g6,
      nodesClassified: nodeClasses.length,
      nodesClassFailed: nodeClasses.filter((row) => !row.pass).length,
      worstNodes,
      nodeClasses,
    });
  }
  return { intervals: results, rawViolations: raw, rawViolationsTotal: rawTotal };
}
