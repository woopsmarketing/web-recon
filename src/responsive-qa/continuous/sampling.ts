import { seededWidths } from "./seed.js";
import { GRID_STEP_PX, SEEDED_PER_INTERVAL, type Interval } from "./types.js";

/**
 * Sample set (brief step 2) — pure and deterministic.
 *
 *   ∀ boundary b (source ∪ clone): {b−1, b, b+1}
 *   fixed grid Wmin..Wmax step 40 (Wmax included)
 *   ∀ interval: SEEDED_PER_INTERVAL widths, seed = FNV-1a("route|min|max")
 *   extrapolation widths
 */

export type SampleOrigin = "boundary" | "grid" | "seeded" | "extrapolation";

export interface SampleSet {
  widths: number[];
  origins: Record<string, SampleOrigin[]>;
}

export function buildSampleSet(input: {
  routePath: string;
  min: number;
  max: number;
  extrapolate: readonly number[];
  sourceBoundaries: readonly number[];
  cloneBoundaries: readonly number[];
  intervals: readonly Interval[];
  gridStep?: number;
}): SampleSet {
  const upper = Math.max(input.max, ...input.extrapolate);
  const origins = new Map<number, Set<SampleOrigin>>();
  const add = (width: number, origin: SampleOrigin): void => {
    if (!Number.isInteger(width) || width < input.min || width > upper) return;
    if (!origins.has(width)) origins.set(width, new Set());
    origins.get(width)!.add(origin);
  };
  for (const b of [...input.sourceBoundaries, ...input.cloneBoundaries]) {
    add(b - 1, "boundary");
    add(b, "boundary");
    add(b + 1, "boundary");
  }
  const step = input.gridStep ?? GRID_STEP_PX;
  for (let w = input.min; w <= input.max; w += step) add(w, "grid");
  add(input.max, "grid");
  for (const interval of input.intervals) {
    const hi = Math.min(interval.max, upper + 1);
    for (const w of seededWidths(input.routePath, interval.min, hi, SEEDED_PER_INTERVAL)) add(w, "seeded");
  }
  for (const w of input.extrapolate) add(w, "extrapolation");
  const widths = [...origins.keys()].sort((a, b) => a - b);
  const out: Record<string, SampleOrigin[]> = {};
  for (const w of widths) out[String(w)] = [...origins.get(w)!].sort();
  return { widths, origins: out };
}
