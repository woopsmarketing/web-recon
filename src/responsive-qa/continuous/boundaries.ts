import { parseMediaCondition } from "../../sitespec/media-condition.js";
import {
  DISCONTINUITY_PAGE_H_PX,
  DISCONTINUITY_PAGE_H_RATIO,
  DISCONTINUITY_RENDERED_MIN,
  DISCONTINUITY_RENDERED_RATIO,
  DISCONTINUITY_XW_PX,
  MAX_BISECTION_STEPS,
  type AuthoredBoundarySet,
  type BisectedBoundary,
  type BoundaryEvidence,
  type Discontinuity,
  type DiscontinuityReason,
  type Interval,
  type NodeReading,
  type PageReading,
  type SweepSample,
} from "./types.js";

/**
 * Boundary discovery (audit §14 step 1) — pure functions.
 *
 *   B_authored  = width boundaries of authored @media / @container conditions
 *   B_observed  = coarse-sweep discontinuities, bisected to a 1px bracket
 *   intervals   = partition of the range by (B_authored ∪ B_observed), SOURCE ONLY
 *
 * A boundary is always the FIRST whole-pixel width of the new state:
 * `(max-width: 899.98px)` and `(min-width: 900px)` both name 900.
 */

// ---------------------------------------------------------------------------
// Authored boundaries
// ---------------------------------------------------------------------------

export interface ConditionText {
  kind: "media" | "container";
  text: string;
}

/**
 * Container preludes may carry a container name before the condition
 * (`card (min-width: 30em)`); strip it so the width grammar can read it. A
 * container's width bound is still recorded separately from @media bounds —
 * it is not a viewport width, only a sampling/partition hint.
 */
function containerConditionText(text: string): string {
  const trimmed = text.trim();
  if (/^not\b/i.test(trimmed)) return trimmed;
  return trimmed.replace(/^[a-zA-Z_-][\w-]*\s+(?=\()/, "");
}

export function authoredBoundariesFromConditions(
  conditions: readonly ConditionText[],
): {
  media: number[];
  container: number[];
  parsed: number;
  unsupported: number;
  nonScreenSkipped: number;
} {
  const media = new Set<number>();
  const container = new Set<number>();
  let parsed = 0;
  let unsupported = 0;
  let nonScreenSkipped = 0;
  for (const condition of conditions) {
    const text =
      condition.kind === "container" ? containerConditionText(condition.text) : condition.text;
    const result = parseMediaCondition(text);
    parsed++;
    for (const alternative of result.alternatives) {
      if (alternative.status === "unsupported" || alternative.status === "unparsed") {
        unsupported++;
        continue;
      }
      if (alternative.status !== "width") continue;
      if (condition.kind === "media" && !alternative.screenApplicable) {
        nonScreenSkipped++;
        continue;
      }
      if (alternative.interval?.empty) continue;
      for (const bound of alternative.bounds) {
        const above = bound.boundary.above;
        if (!Number.isFinite(above) || above <= 0) continue;
        (condition.kind === "media" ? media : container).add(above);
      }
    }
  }
  return {
    media: [...media].sort((a, b) => a - b),
    container: [...container].sort((a, b) => a - b),
    parsed,
    unsupported,
    nonScreenSkipped,
  };
}

/** SiteSpec `viewports.*.authoredBreakpoints.boundaries[].above`, read leniently. */
export function siteSpecAuthoredBoundaries(pageSpec: unknown): number[] {
  const out = new Set<number>();
  const viewports = (pageSpec as { viewports?: Record<string, unknown> } | undefined)?.viewports;
  if (!viewports || typeof viewports !== "object") return [];
  for (const viewport of Object.values(viewports)) {
    const boundaries = (viewport as { authoredBreakpoints?: { boundaries?: unknown } })
      ?.authoredBreakpoints?.boundaries;
    if (!Array.isArray(boundaries)) continue;
    for (const entry of boundaries) {
      const above = (entry as { above?: unknown }).above;
      if (typeof above === "number" && Number.isFinite(above) && above > 0) out.add(above);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function mergeAuthored(
  fromSiteSpec: readonly number[],
  live: ReturnType<typeof authoredBoundariesFromConditions>,
  unreadableSheets: number,
): AuthoredBoundarySet {
  const media = new Set<number>([...fromSiteSpec, ...live.media]);
  return {
    media: [...media].sort((a, b) => a - b),
    container: [...live.container],
    fromSiteSpec: [...fromSiteSpec],
    fromLiveScan: [...live.media],
    conditionsParsed: live.parsed,
    unsupportedConditions: live.unsupported,
    nonScreenSkipped: live.nonScreenSkipped,
    unreadableSheets,
  };
}

// ---------------------------------------------------------------------------
// Discontinuity detection
// ---------------------------------------------------------------------------

export interface DetectorOptions {
  /** Keys whose x/w participate (container-like categories). */
  xwKeys: ReadonlySet<string>;
  /** Keys whose x is excluded (motion-unstable). */
  noXKeys: ReadonlySet<string>;
}

export interface Feature {
  kind: "vis" | "x" | "w" | "sh" | "rendered" | "served";
  key?: string;
}

function nodeMap(reading: PageReading): Map<string, NodeReading> {
  const map = new Map<string, NodeReading>();
  for (const node of reading.nodes) map.set(node.k, node);
  return map;
}

function visibleOf(node: NodeReading | undefined): boolean {
  return node !== undefined && node.v === 1 && node.st !== "unmatched" && node.st !== "ambiguous";
}

function servedKey(reading: PageReading): string {
  return [...reading.served].sort().join(",");
}

function pageHeightJump(a: number, b: number): boolean {
  const threshold = Math.max(DISCONTINUITY_PAGE_H_PX, DISCONTINUITY_PAGE_H_RATIO * Math.max(a, b));
  return Math.abs(b - a) > threshold;
}

function renderedJump(a: number, b: number): boolean {
  const delta = Math.abs(b - a);
  return delta >= DISCONTINUITY_RENDERED_MIN && delta >= DISCONTINUITY_RENDERED_RATIO * Math.max(a, b);
}

/** Value of one feature at series index i (undefined = not measurable). */
type Getter = (index: number) => number | undefined;

/**
 * Is the step from index i-1 to i a NON-LINEAR jump > threshold? The jump is
 * explained (not flagged) when the line through the two previous samples, or
 * the line through the two following samples, predicts it within threshold.
 */
export function nonlinearJump(
  widths: readonly number[],
  i: number,
  get: Getter,
  threshold: number,
): boolean {
  const cur = get(i);
  const prev = get(i - 1);
  if (cur === undefined || prev === undefined) return false;
  const delta = Math.abs(cur - prev);
  if (delta <= threshold) return false;
  const wPrev = widths[i - 1]!;
  const wCur = widths[i]!;
  let evidence = 0;
  if (i >= 2) {
    const prev2 = get(i - 2);
    const wPrev2 = widths[i - 2]!;
    if (prev2 !== undefined && wPrev !== wPrev2) {
      evidence++;
      const pred = prev + ((prev - prev2) * (wCur - wPrev)) / (wPrev - wPrev2);
      if (Math.abs(cur - pred) <= threshold) return false;
    }
  }
  if (i + 1 < widths.length) {
    const next = get(i + 1);
    const wNext = widths[i + 1]!;
    if (next !== undefined && wNext !== wCur) {
      evidence++;
      const pred = cur - ((next - cur) * (wCur - wPrev)) / (wNext - wCur);
      if (Math.abs(prev - pred) <= threshold) return false;
    }
  }
  if (evidence === 0) {
    // No neighbours: only a change faster than 1px per px of viewport counts.
    return delta > threshold + Math.abs(wCur - wPrev);
  }
  return true;
}

/** Features that changed discontinuously between series[i-1] and series[i]. */
export function discontinuityFeatures(
  series: readonly SweepSample[],
  i: number,
  options: DetectorOptions,
  maps: readonly Map<string, NodeReading>[] = series.map((s) => nodeMap(s.reading)),
): Feature[] {
  const a = series[i - 1]!.reading;
  const b = series[i]!.reading;
  const widths = series.map((s) => s.width);
  const features: Feature[] = [];
  if (servedKey(a) !== servedKey(b)) features.push({ kind: "served" });
  if (renderedJump(a.rendered, b.rendered)) features.push({ kind: "rendered" });
  if (pageHeightJump(a.sh, b.sh)) features.push({ kind: "sh" });
  const mapA = maps[i - 1]!;
  const mapB = maps[i]!;
  const keys = new Set<string>([...mapA.keys(), ...mapB.keys()]);
  for (const key of [...keys].sort()) {
    const na = mapA.get(key);
    const nb = mapB.get(key);
    if (visibleOf(na) !== visibleOf(nb)) {
      features.push({ kind: "vis", key });
      continue;
    }
    if (!visibleOf(na) || !options.xwKeys.has(key)) continue;
    const field = (name: "x" | "w"): Getter => (index) => {
      const node = maps[index]?.get(key);
      return visibleOf(node) ? node![name] : undefined;
    };
    if (nonlinearJump(widths, i, field("w"), DISCONTINUITY_XW_PX)) {
      features.push({ kind: "w", key });
    }
    if (!options.noXKeys.has(key) && nonlinearJump(widths, i, field("x"), DISCONTINUITY_XW_PX)) {
      features.push({ kind: "x", key });
    }
  }
  return features;
}

function reasonsOf(features: readonly Feature[]): DiscontinuityReason[] {
  const map: Record<Feature["kind"], DiscontinuityReason> = {
    vis: "visibility",
    x: "x",
    w: "w",
    sh: "page-height",
    rendered: "rendered-count",
    served: "served-variant",
  };
  return [...new Set(features.map((f) => map[f.kind]))].sort();
}

function keysOf(features: readonly Feature[]): string[] {
  return [...new Set(features.flatMap((f) => (f.key ? [f.key] : [])))].sort().slice(0, 20);
}

export interface DetectedGap extends Discontinuity {
  index: number;
  features: Feature[];
}

/** Every adjacent-sample discontinuity of an ascending sweep. */
export function detectDiscontinuities(
  series: readonly SweepSample[],
  options: DetectorOptions,
): DetectedGap[] {
  const maps = series.map((s) => nodeMap(s.reading));
  const out: DetectedGap[] = [];
  for (let i = 1; i < series.length; i++) {
    const features = discontinuityFeatures(series, i, options, maps);
    if (features.length === 0) continue;
    out.push({
      index: i,
      lo: series[i - 1]!.width,
      hi: series[i]!.width,
      reasons: reasonsOf(features),
      keys: keysOf(features),
      features,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bisection
// ---------------------------------------------------------------------------

function featureValue(reading: PageReading, feature: Feature): number | string | boolean | undefined {
  switch (feature.kind) {
    case "served":
      return servedKey(reading);
    case "rendered":
      return reading.rendered;
    case "sh":
      return reading.sh;
    case "vis":
      return visibleOf(reading.nodes.find((n) => n.k === feature.key));
    case "x":
    case "w": {
      const node = reading.nodes.find((n) => n.k === feature.key);
      return visibleOf(node) ? node![feature.kind] : undefined;
    }
  }
}

function slope(a: SweepSample | null, b: SweepSample | null, feature: Feature): number {
  if (!a || !b || a.width === b.width) return 0;
  const va = featureValue(a.reading, feature);
  const vb = featureValue(b.reading, feature);
  if (typeof va !== "number" || typeof vb !== "number") return 0;
  return (vb - va) / (b.width - a.width);
}

/** Which side of the gap does `mid` belong to for this feature? */
export function voteFeature(
  feature: Feature,
  prev: SweepSample | null,
  lo: SweepSample,
  mid: SweepSample,
  hi: SweepSample,
  next: SweepSample | null,
): "lo" | "hi" | "tie" | "skip" {
  const vLo = featureValue(lo.reading, feature);
  const vHi = featureValue(hi.reading, feature);
  const vMid = featureValue(mid.reading, feature);
  if (vMid === undefined || vLo === undefined || vHi === undefined) return "skip";
  if (typeof vMid !== "number" || typeof vLo !== "number" || typeof vHi !== "number") {
    if (vMid === vLo && vMid !== vHi) return "lo";
    if (vMid === vHi && vMid !== vLo) return "hi";
    return "tie";
  }
  if (feature.kind === "rendered") {
    const dl = Math.abs(vMid - vLo);
    const dh = Math.abs(vMid - vHi);
    return dl < dh ? "lo" : dh < dl ? "hi" : "tie";
  }
  const predLo = vLo + slope(prev, lo, feature) * (mid.width - lo.width);
  const predHi = vHi + slope(hi, next, feature) * (mid.width - hi.width);
  const el = Math.abs(vMid - predLo);
  const eh = Math.abs(vMid - predHi);
  return el < eh ? "lo" : eh < el ? "hi" : "tie";
}

/** Do two readings differ on this feature by a discontinuity-sized amount (no trend excuse)? */
export function featureJump(lo: PageReading, hi: PageReading, feature: Feature): boolean {
  const a = featureValue(lo, feature);
  const b = featureValue(hi, feature);
  switch (feature.kind) {
    case "served":
    case "vis":
      return a !== b;
    case "rendered":
      return typeof a === "number" && typeof b === "number" && renderedJump(a, b);
    case "sh":
      return typeof a === "number" && typeof b === "number" && pageHeightJump(a, b);
    case "x":
    case "w":
      if (a === undefined && b === undefined) return false;
      if (typeof a !== "number" || typeof b !== "number") return true;
      return Math.abs(a - b) > DISCONTINUITY_XW_PX;
  }
}

/** A 1px bracket still differs on at least one feature (no trend excuse). */
export function bracketConfirms(lo: PageReading, hi: PageReading, features: readonly Feature[]): boolean {
  return features.some((feature) => featureJump(lo, hi, feature));
}

function signOf(lo: PageReading, hi: PageReading, feature: Feature): number {
  const a = featureValue(lo, feature);
  const b = featureValue(hi, feature);
  return typeof a === "number" && typeof b === "number" ? Math.sign(b - a) : 0;
}

export interface Reproduction {
  reproduced: boolean;
  reproducedFeatures: number;
  /** Features whose repeat readings at the SAME width differ by a jump-sized amount. */
  noisyFeatures: number;
}

/**
 * REPRODUCIBILITY GATE (calibration follow-up). A discontinuity is a property
 * of the page at two widths, so it must survive fresh re-measurement: the
 * bracket is re-measured lo, hi, lo, hi (alternating, so a width-crossing
 * switch fires on every crossing) and a feature counts only when
 *   – both fresh pairs show the jump, in the same direction, and
 *   – the two readings at the SAME width do not themselves differ by a
 *     jump-sized amount (the jump exceeds within-width measurement noise).
 * Deterministic CSS / matchMedia / JS switches reproduce by construction; a
 * JS reflow zone whose values depend on resize history or settle timing does
 * not, and is reported as unreproducible instead of partitioning the range.
 */
export async function reproduceBracket(
  loWidth: number,
  hiWidth: number,
  features: readonly Feature[],
  remeasure: MeasureAt,
): Promise<Reproduction> {
  const l1 = await remeasure(loWidth);
  const h1 = await remeasure(hiWidth);
  const l2 = await remeasure(loWidth);
  const h2 = await remeasure(hiWidth);
  let reproducedFeatures = 0;
  let noisyFeatures = 0;
  for (const feature of features) {
    const noisy = featureJump(l1, l2, feature) || featureJump(h1, h2, feature);
    if (noisy) {
      noisyFeatures++;
      continue;
    }
    if (!featureJump(l1, h1, feature) || !featureJump(l2, h2, feature)) continue;
    if (signOf(l1, h1, feature) !== signOf(l2, h2, feature)) continue;
    reproducedFeatures++;
  }
  return { reproduced: reproducedFeatures > 0, reproducedFeatures, noisyFeatures };
}

export type MeasureAt = (width: number) => Promise<PageReading>;

/**
 * Bisect one detected gap of `series` down to a 1px bracket with in-place
 * resizes, then gate the bracket on reproducibility. `remeasure` defaults to
 * `measure`; the session passes a longer-settling variant.
 */
export async function bisectGap(
  series: readonly SweepSample[],
  gap: DetectedGap,
  measure: MeasureAt,
  remeasure: MeasureAt = measure,
): Promise<BisectedBoundary> {
  let prev: SweepSample | null = gap.index >= 2 ? series[gap.index - 2]! : null;
  let lo: SweepSample = series[gap.index - 1]!;
  let hi: SweepSample = series[gap.index]!;
  let next: SweepSample | null = gap.index + 1 < series.length ? series[gap.index + 1]! : null;
  // Feature screen BEFORE bisecting: a feature whose fresh reading at the same
  // width differs jump-sized from its sweep reading is measurement noise (resize
  // history / settle timing), and a feature whose jump vanished on fresh
  // readings is not a discontinuity. Neither may vote — a noisy feature would
  // steer the bracket away from the real change it co-occurs with.
  const loFresh = await remeasure(lo.width);
  const hiFresh = await remeasure(hi.width);
  const features = gap.features.filter(
    (feature) =>
      !featureJump(lo.reading, loFresh, feature) &&
      !featureJump(hi.reading, hiFresh, feature) &&
      featureJump(loFresh, hiFresh, feature),
  );
  const screenedOut = gap.features.length - features.length;
  if (features.length === 0) {
    return {
      width: hi.width,
      lo: lo.width,
      hi: hi.width,
      steps: 0,
      converged: false,
      ties: 0,
      confirmed: false,
      reproducedFeatures: 0,
      noisyFeatures: screenedOut,
      reasons: gap.reasons,
      keys: gap.keys,
    };
  }
  lo = { width: lo.width, reading: loFresh };
  hi = { width: hi.width, reading: hiFresh };
  let steps = 0;
  let ties = 0;
  while (hi.width - lo.width > 1 && steps < MAX_BISECTION_STEPS) {
    const midWidth = Math.floor((lo.width + hi.width) / 2);
    const mid: SweepSample = { width: midWidth, reading: await measure(midWidth) };
    steps++;
    let votesLo = 0;
    let votesHi = 0;
    for (const feature of features) {
      const vote = voteFeature(feature, prev, lo, mid, hi, next);
      if (vote === "lo") votesLo++;
      else if (vote === "hi") votesHi++;
    }
    if (votesLo > votesHi) {
      prev = lo;
      lo = mid;
    } else {
      if (votesLo === votesHi) ties++;
      next = hi;
      hi = mid;
    }
  }
  const bracketed = hi.width - lo.width <= 1;
  const converged = bracketed && ties === 0;
  const reproduction: Reproduction = bracketed
    ? await reproduceBracket(lo.width, hi.width, features, remeasure)
    : { reproduced: false, reproducedFeatures: 0, noisyFeatures: 0 };
  return {
    width: hi.width,
    lo: lo.width,
    hi: hi.width,
    steps,
    converged,
    ties,
    confirmed: bracketed && reproduction.reproduced,
    reproducedFeatures: reproduction.reproducedFeatures,
    noisyFeatures: screenedOut + reproduction.noisyFeatures,
    reasons: gap.reasons,
    keys: gap.keys,
  };
}

// ---------------------------------------------------------------------------
// Partition
// ---------------------------------------------------------------------------

export type BoundaryKind = BoundaryEvidence["kinds"][number];

export function partitionIntervals(input: {
  min: number;
  max: number;
  /** Largest extrapolation width (≤ max when there is none). */
  extrapolateMax: number;
  boundaries: ReadonlyMap<number, readonly BoundaryKind[]>;
}): Interval[] {
  const { min, max } = input;
  const upperEnd = Math.max(max, input.extrapolateMax);
  const edges = new Map<number, Set<BoundaryKind>>();
  const add = (width: number, kind: BoundaryKind): void => {
    if (!edges.has(width)) edges.set(width, new Set());
    edges.get(width)!.add(kind);
  };
  add(min, "range-edge");
  add(upperEnd + 1, "range-edge");
  if (upperEnd > max) add(max + 1, "extrapolation-edge");
  for (const [width, kinds] of input.boundaries) {
    if (width <= min || width > upperEnd) continue;
    for (const kind of kinds) add(width, kind);
  }
  const sorted = [...edges.keys()].sort((a, b) => a - b);
  const intervals: Interval[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const lo = sorted[i]!;
    const hi = sorted[i + 1]!;
    intervals.push({
      min: lo,
      max: hi,
      extrapolated: lo > max,
      sourceEvidence: {
        lower: { width: lo, kinds: [...edges.get(lo)!].sort() },
        upper: { width: hi, kinds: [...edges.get(hi)!].sort() },
      },
    });
  }
  return intervals;
}

export function intervalIndexOf(intervals: readonly Interval[], width: number): number {
  for (let i = 0; i < intervals.length; i++) {
    if (width >= intervals[i]!.min && width < intervals[i]!.max) return i;
  }
  return -1;
}
