import { nonlinearJump } from "./boundaries.js";
import {
  CENTERED_CLONE_RATIO,
  CENTERED_PX,
  FLUID_MIN_SLOPE,
  FLUID_SLOPE_TOLERANCE,
  FULL_BLEED_PX,
  STEP_LOCATION_PX,
  relationTolerance,
  type AnchorClass,
  type BehaviorFit,
  type WidthClass,
} from "./types.js";

/**
 * Behaviour class per node per interval (brief step 8) — pure.
 *
 *   FIXED       w range ≤ T                      (→ CAPPED when w == computed max-width cap)
 *   FULL_BLEED  w ≈ W and x ≈ 0 at every sample
 *   FLUID       w = a·W + b, |a| ≥ 0.05, max residual ≤ T
 *   CAPPED      fluid then constant (piecewise), or constant == max-width cap
 *   HIDDEN      invisible at every sample
 *   STEP        a discontinuity inside the interval (incl. a visibility change)
 *   MIXED       nothing fits
 *
 * T is evaluated at the interval's median sample width. FLUID's intercept `b`
 * is reported at the interval's lower bound (w = a·(W − min) + b) so that
 * |Δb| ≤ T compares values the interval actually contains, not an intercept at
 * W = 0 that a small slope difference would inflate.
 */

export interface FitSample {
  /** Measured viewport width (clientWidth). */
  W: number;
  x: number;
  w: number;
  v: 0 | 1;
  mxw?: number | null;
}

function linearFit(points: ReadonlyArray<{ W: number; w: number }>, origin: number): {
  a: number;
  b: number;
  maxResidual: number;
} {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0, maxResidual: 0 };
  if (n === 1) return { a: 0, b: points[0]!.w, maxResidual: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const X = p.W - origin;
    sx += X;
    sy += p.w;
    sxx += X * X;
    sxy += X * p.w;
  }
  const denom = n * sxx - sx * sx;
  const a = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  let maxResidual = 0;
  for (const p of points) {
    maxResidual = Math.max(maxResidual, Math.abs(p.w - (a * (p.W - origin) + b)));
  }
  return { a, b, maxResidual };
}

function range(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function fitAnchor(samples: readonly FitSample[], T: number): AnchorClass {
  const visible = samples.filter((s) => s.v === 1);
  if (visible.length === 0) return "NONE";
  const centered = visible.every(
    (s) => Math.abs(s.x - (s.W - s.x - s.w)) <= Math.max(CENTERED_PX, CENTERED_CLONE_RATIO * s.W),
  );
  if (centered) return "CENTERED";
  if (range(visible.map((s) => s.x)) <= T) return "LEFT";
  if (range(visible.map((s) => s.W - s.x - s.w)) <= T) return "RIGHT";
  return "NONE";
}

export function fitBehavior(
  samplesIn: readonly FitSample[],
  intervalMin: number,
  options: { skipAnchor?: boolean } = {},
): BehaviorFit {
  const samples = [...samplesIn].sort((a, b) => a.W - b.W);
  const n = samples.length;
  const median = n > 0 ? samples[Math.floor((n - 1) / 2)]!.W : intervalMin;
  const T = relationTolerance(median);
  const anchor: AnchorClass = options.skipAnchor ? "NONE" : fitAnchor(samples, T);
  const make = (widthClass: WidthClass, params: BehaviorFit["params"] = {}): BehaviorFit => ({
    widthClass,
    anchor,
    samples: n,
    params,
  });
  if (n === 0 || samples.every((s) => s.v === 0)) return { ...make("HIDDEN"), anchor: "NONE" };
  if (samples.some((s) => s.v === 0)) return make("STEP", stepParams(samples, T));

  if (samples.every((s) => s.w >= s.W - FULL_BLEED_PX && Math.abs(s.x) <= 1)) return make("FULL_BLEED");

  const ws = samples.map((s) => s.w);
  if (range(ws) <= T) {
    const mean = ws.reduce((sum, w) => sum + w, 0) / n;
    const caps = samples.map((s) => s.mxw);
    const cap = caps[0];
    if (typeof cap === "number" && caps.every((c) => c === cap) && Math.abs(mean - cap) <= T) {
      return make("CAPPED", { cap: round(cap) });
    }
    return make("FIXED", { w: round(mean) });
  }

  const full = linearFit(samples, intervalMin);
  if (Math.abs(full.a) >= FLUID_MIN_SLOPE && full.maxResidual <= T) {
    return make("FLUID", { a: round(full.a, 4), b: round(full.b) });
  }

  // CAPPED piecewise: fluid for the first k samples, constant after.
  for (let k = 2; k <= n - 2; k++) {
    const left = samples.slice(0, k);
    const right = samples.slice(k);
    const lf = linearFit(left, intervalMin);
    if (Math.abs(lf.a) < FLUID_MIN_SLOPE || lf.maxResidual > T) continue;
    if (range(right.map((s) => s.w)) > T) continue;
    const cap = right.reduce((sum, s) => sum + s.w, 0) / right.length;
    return make("CAPPED", { cap: round(cap) });
  }

  const widths = samples.map((s) => s.W);
  for (let i = 1; i < n; i++) {
    if (nonlinearJump(widths, i, (index) => samples[index]!.w, T)) return make("STEP", stepParams(samples, T));
  }
  return make("MIXED");
}

/**
 * STEP parameters (review m5): every step (a visibility change, or a non-linear
 * w jump between two visible samples), the first step's bracket and the w on
 * either side of it (0 when hidden). Samples must be sorted by W.
 */
export function stepParams(samples: readonly FitSample[], T: number): BehaviorFit["params"] {
  const widths = samples.map((s) => s.W);
  const get = (index: number): number | undefined => (samples[index]!.v === 1 ? samples[index]!.w : undefined);
  const steps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a.v !== b.v || (a.v === 1 && b.v === 1 && nonlinearJump(widths, i, get, T))) steps.push(i);
  }
  if (steps.length === 0) return { stepCount: 0 };
  const i = steps[0]!;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  return {
    stepCount: steps.length,
    stepFrom: a.W,
    stepAt: b.W,
    before: a.v === 1 ? round(a.w) : 0,
    after: b.v === 1 ? round(b.w) : 0,
    vBefore: a.v,
    vAfter: b.v,
  };
}

export interface FitComparison {
  pass: boolean;
  reason: string | null;
}

/** Paired per-sample series (same widths, same order) for pointwise fallbacks. */
export interface FitSeries {
  s: readonly FitSample[];
  c: readonly FitSample[];
  /** Skip x comparison (motion-unstable node, as R11 does). */
  skipX?: boolean;
}

/**
 * Class and parameter agreement. STEP / MIXED / HIDDEN never pass on the class
 * name alone (review m5):
 *   STEP   same step count, first step bracket within ±STEP_LOCATION_PX, w before
 *          and after the step within T, same visibility on either side.
 *   MIXED  pointwise: at every paired sample same visibility and, when visible,
 *          |Δw| ≤ T(W) and |Δx| ≤ T(W).
 *   HIDDEN both hidden at every paired sample (and ≥1 sample).
 * MIXED/HIDDEN without `series` FAIL (cannot be verified).
 */
export function compareFits(source: BehaviorFit, clone: BehaviorFit, T: number, series?: FitSeries): FitComparison {
  if (source.widthClass !== clone.widthClass) {
    return { pass: false, reason: `class ${source.widthClass}≠${clone.widthClass}` };
  }
  if (source.anchor !== clone.anchor) {
    return { pass: false, reason: `anchor ${source.anchor}≠${clone.anchor}` };
  }
  const p = source.params;
  const q = clone.params;
  switch (source.widthClass) {
    case "FIXED":
      if (Math.abs((p.w ?? 0) - (q.w ?? 0)) > T) return { pass: false, reason: `fixed w ${p.w}≠${q.w}` };
      break;
    case "FLUID":
      if (Math.abs((p.a ?? 0) - (q.a ?? 0)) > FLUID_SLOPE_TOLERANCE) {
        return { pass: false, reason: `fluid slope ${p.a}≠${q.a}` };
      }
      if (Math.abs((p.b ?? 0) - (q.b ?? 0)) > T) return { pass: false, reason: `fluid b ${p.b}≠${q.b}` };
      break;
    case "CAPPED":
      if (Math.abs((p.cap ?? 0) - (q.cap ?? 0)) > T) {
        return { pass: false, reason: `cap ${p.cap}≠${q.cap}` };
      }
      break;
    case "STEP": {
      if (p.stepCount === undefined || q.stepCount === undefined || p.stepAt === undefined || q.stepAt === undefined) {
        return { pass: false, reason: "step: location unknown" };
      }
      if (p.stepCount !== q.stepCount) return { pass: false, reason: `step count ${p.stepCount}≠${q.stepCount}` };
      if (
        Math.abs(p.stepAt - q.stepAt) > STEP_LOCATION_PX ||
        Math.abs((p.stepFrom ?? 0) - (q.stepFrom ?? 0)) > STEP_LOCATION_PX
      ) {
        return { pass: false, reason: `step at ${p.stepFrom}..${p.stepAt}≠${q.stepFrom}..${q.stepAt}` };
      }
      if (p.vBefore !== q.vBefore || p.vAfter !== q.vAfter) {
        return { pass: false, reason: `step visibility ${p.vBefore}→${p.vAfter}≠${q.vBefore}→${q.vAfter}` };
      }
      if (Math.abs((p.before ?? 0) - (q.before ?? 0)) > T || Math.abs((p.after ?? 0) - (q.after ?? 0)) > T) {
        return { pass: false, reason: `step w ${p.before}→${p.after}≠${q.before}→${q.after}` };
      }
      break;
    }
    case "MIXED":
    case "HIDDEN": {
      if (!series || series.s.length === 0 || series.s.length !== series.c.length) {
        return { pass: false, reason: `${source.widthClass.toLowerCase()}: no pointwise samples` };
      }
      const s = [...series.s].sort((a, b) => a.W - b.W);
      const c = [...series.c].sort((a, b) => a.W - b.W);
      for (let i = 0; i < s.length; i++) {
        const a = s[i]!;
        const b = c[i]!;
        if (source.widthClass === "HIDDEN") {
          if (a.v !== 0 || b.v !== 0) return { pass: false, reason: `hidden: visible at ${a.W}` };
          continue;
        }
        if (a.v !== b.v) return { pass: false, reason: `mixed: visibility ${a.v}≠${b.v} at ${a.W}` };
        if (a.v === 0) continue;
        const t = relationTolerance(a.W);
        if (Math.abs(a.w - b.w) > t) return { pass: false, reason: `mixed: w ${a.w}≠${b.w} at ${a.W}` };
        if (!series.skipX && Math.abs(a.x - b.x) > t) return { pass: false, reason: `mixed: x ${a.x}≠${b.x} at ${a.W}` };
      }
      break;
    }
    default:
      break;
  }
  return { pass: true, reason: null };
}
