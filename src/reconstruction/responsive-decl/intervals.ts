/**
 * Interval algebra over CSS viewport widths (Responsive Core P0, contract §C2.2).
 *
 * PURE: no I/O, no clock, no browser. Deterministic. Never throws on media text.
 *
 * CONVENTION — `[min, max)`: min INCLUSIVE, max EXCLUSIVE, in CSS px; `max` may be
 * `Infinity`. The domain is `[0, Infinity)`.
 *
 * THE 0.02px CONVENTION. This engine emits a bounded band `[lo, hi)` as
 * `(min-width: lo) and (max-width: hi-0.02px)` (`bandMedia`, responsive-plan's
 * mobile query): 0.02px is below any real fractional viewport step and keeps the two
 * sides of a switch from both matching at a fractional width. Parsing is the exact
 * inverse, so a round trip is lossless:
 *   - `(max-width: X)`  (inclusive upper)  → max = X + 0.02
 *   - `(width < X)`     (strict upper)     → max = X
 *   - `(min-width: X)`  (inclusive lower)  → min = X
 *   - `(width > X)`     (strict lower)     → min = X + 0.02
 *   - `(width: X)`                         → [X, X + 0.02)
 * So `(max-width: 899.98px)` → [0, 900) and `(max-width: 899px)` → [0, 899.02). An
 * authored `(max-width: 899px)` next to `(min-width: 900px)` therefore leaves the
 * sliver [899.02, 900) where NEITHER applies — which is the true CSS semantics at a
 * fractional viewport. Algebra keeps it; {@link containsIntegerWidth} lets a caller
 * see that no integer CSS width lies inside.
 *
 * MEDIA APPLICABILITY DECISIONS (documented, never guessed):
 *  - no condition / `all` / `screen` / `only screen` → always applies.
 *  - an alternative whose media type is not screen-applicable (`print`, `speech`,
 *    `tv`, …) never applies to the clone's screen rendering → contributes nothing;
 *    when EVERY alternative is like that the status is `not-screen`.
 *  - a comma list is a disjunction → union of its alternatives.
 *  - `not …`, unparsed, or unsupported (calc() bound, `or` over width, …) →
 *    AMBIGUOUS: may hold anywhere.
 *  - any NON-WIDTH media feature (`hover`, `pointer`, `orientation`, `height`,
 *    `aspect-ratio`, `resolution`, `prefers-*`, `color`, …) → AMBIGUOUS over that
 *    alternative's width interval. Rationale: the clone is served to real devices
 *    whose environment differs from the probe (a `(hover: hover)` rule is not true for
 *    touch users, `orientation`/`aspect-ratio`/`height` are not width functions), and a
 *    per-width plan cannot express those conditions. The contract's wording ("does not
 *    apply … unless width-only") is implemented as "not KNOWN to apply": relevance is
 *    `unknown`, which only blocks a decision when that declaration could actually win.
 *  - the deprecated `device-width` family follows the parser's
 *    `DEVICE_WIDTH_POLICY` (treated as a width constraint) unless
 *    `deviceWidth: "ambiguous"` is passed.
 */

import { parseMediaCondition } from "../../sitespec/media-condition.js";
import type { MediaWidthBound } from "../../sitespec/media-condition.js";
import type { Interval, MediaIntervals } from "./types.js";

/** Emission / parse convention for an inclusive upper media bound. */
export const MEDIA_MAX_EPSILON_PX = 0.02;

export const FULL_WIDTH_RANGE: Interval = Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY });

/** Keeps float edges byte-stable (`899.98 + 0.02` → `900`). */
export function roundEdge(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1e6) / 1e6;
}

export function makeInterval(min: number, max: number): Interval {
  return { min: roundEdge(min), max: roundEdge(max) };
}

export function isEmptyInterval(iv: Interval): boolean {
  return !(iv.max > iv.min);
}

export function intervalContains(iv: Interval, width: number): boolean {
  return width >= iv.min && width < iv.max;
}

export function intervalsContain(list: readonly Interval[], width: number): boolean {
  return list.some((iv) => intervalContains(iv, width));
}

/** `inner ⊆ outer` (an empty inner is covered by anything). */
export function intervalCovers(outer: Interval, inner: Interval): boolean {
  if (isEmptyInterval(inner)) return true;
  return inner.min >= outer.min && inner.max <= outer.max;
}

/** Sorted, merged (touching intervals join), empty ones dropped. */
export function normalizeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list
    .filter((iv) => !isEmptyInterval(iv))
    .map((iv) => ({ min: iv.min, max: iv.max }))
    .sort((a, b) => a.min - b.min || a.max - b.max);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && iv.min <= last.max) {
      if (iv.max > last.max) out[out.length - 1] = { min: last.min, max: iv.max };
    } else {
      out.push(iv);
    }
  }
  return out;
}

export function unionIntervals(...lists: ReadonlyArray<readonly Interval[]>): Interval[] {
  return normalizeIntervals(lists.flat());
}

export function intersectInterval(a: Interval, b: Interval): Interval | undefined {
  const iv = { min: Math.max(a.min, b.min), max: Math.min(a.max, b.max) };
  return isEmptyInterval(iv) ? undefined : iv;
}

export function intersectIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const iv = intersectInterval(x, y);
      if (iv !== undefined) out.push(iv);
    }
  }
  return normalizeIntervals(out);
}

/** `a \ b`. */
export function subtractIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  let current = normalizeIntervals(a);
  for (const cut of normalizeIntervals(b)) {
    const next: Interval[] = [];
    for (const iv of current) {
      const inter = intersectInterval(iv, cut);
      if (inter === undefined) {
        next.push(iv);
        continue;
      }
      if (iv.min < inter.min) next.push({ min: iv.min, max: inter.min });
      if (inter.max < iv.max) next.push({ min: inter.max, max: iv.max });
    }
    current = next;
  }
  return normalizeIntervals(current);
}

export function intervalsEqual(a: readonly Interval[], b: readonly Interval[]): boolean {
  const x = normalizeIntervals(a);
  const y = normalizeIntervals(b);
  return x.length === y.length && x.every((iv, i) => iv.min === y[i]!.min && iv.max === y[i]!.max);
}

/** Every finite edge of the given intervals, sorted and deduped. */
export function intervalEdges(list: readonly Interval[]): number[] {
  const edges = new Set<number>();
  for (const iv of list) {
    if (Number.isFinite(iv.min)) edges.add(iv.min);
    if (Number.isFinite(iv.max)) edges.add(iv.max);
  }
  return [...edges].sort((a, b) => a - b);
}

/**
 * Split `served` at every edge strictly inside it. The pieces cover `served` exactly,
 * in order, without overlap. Edges outside or on the boundary are ignored.
 */
export function partitionInterval(served: Interval, edges: readonly number[]): Interval[] {
  if (isEmptyInterval(served)) return [];
  const inside = [...new Set(edges)]
    .filter((e) => Number.isFinite(e) && e > served.min && e < served.max)
    .sort((a, b) => a - b);
  const out: Interval[] = [];
  let lo = served.min;
  for (const e of inside) {
    out.push({ min: lo, max: e });
    lo = e;
  }
  out.push({ min: lo, max: served.max });
  return out;
}

/** Does at least one integer CSS width lie in `[min, max)`? */
export function containsIntegerWidth(iv: Interval): boolean {
  if (isEmptyInterval(iv)) return false;
  return Math.ceil(iv.min) < iv.max;
}

export function formatInterval(iv: Interval): string {
  return `[${iv.min}, ${Number.isFinite(iv.max) ? iv.max : "∞"})`;
}

// ---------------------------------------------------------------------------
// Media condition → intervals
// ---------------------------------------------------------------------------

export interface MediaToIntervalsOptions {
  readonly rootFontSizePx?: number;
  /** Default `"as-width"` (the parser's DEVICE_WIDTH_POLICY). */
  readonly deviceWidth?: "as-width" | "ambiguous";
}

const WIDTH_ONLY_IDENTIFIERS: ReadonlySet<string> = new Set([
  "and",
  "only",
  "screen",
  "all",
  "width",
  "min-width",
  "max-width",
  "device-width",
  "min-device-width",
  "max-device-width",
]);

const NUMBER_TOKEN_RE = /(?<![a-z0-9_-])[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z%]*/g;
const IDENT_TOKEN_RE = /-?[a-z_][a-z0-9_-]*/g;

/**
 * Identifiers in one alternative that are NOT part of a pure screen/width query.
 * Scans the text itself rather than trusting the parser's `features`, because the
 * parser drops nested non-width groups (`((hover: hover) or (pointer: fine))`)
 * without naming them.
 */
function nonWidthIdentifiers(normalized: string): string[] {
  const stripped = normalized.toLowerCase().replace(NUMBER_TOKEN_RE, " ");
  const found = new Set<string>();
  for (const m of stripped.matchAll(IDENT_TOKEN_RE)) {
    if (!WIDTH_ONLY_IDENTIFIERS.has(m[0])) found.add(m[0]);
  }
  return [...found].sort();
}

function lowerEdge(bound: MediaWidthBound): number {
  return bound.inclusive ? bound.px : bound.px + MEDIA_MAX_EPSILON_PX;
}

function upperEdge(bound: MediaWidthBound): number {
  return bound.inclusive ? bound.px + MEDIA_MAX_EPSILON_PX : bound.px;
}

function boundsToInterval(bounds: readonly MediaWidthBound[]): Interval | undefined {
  let min = 0;
  let max = Number.POSITIVE_INFINITY;
  for (const b of bounds) {
    if (b.kind === "min") min = Math.max(min, lowerEdge(b));
    else max = Math.min(max, upperEdge(b));
  }
  const iv = makeInterval(Math.max(0, min), max);
  return isEmptyInterval(iv) ? undefined : iv;
}

const mediaCache = new Map<string, MediaIntervals>();

/**
 * Where a media condition holds, as intervals over viewport width.
 * `undefined` / blank → unconditional (`[0, ∞)`, status `ok`).
 */
export function mediaToIntervals(
  conditionText: string | undefined,
  options: MediaToIntervalsOptions = {},
): MediaIntervals {
  const text = typeof conditionText === "string" ? conditionText : "";
  const key = `${options.rootFontSizePx ?? ""}|${options.deviceWidth ?? ""}|${text}`;
  const cached = mediaCache.get(key);
  if (cached !== undefined) return cloneMediaIntervals(cached);
  const result = computeMediaIntervals(text, options);
  if (mediaCache.size < 4096) mediaCache.set(key, result);
  return cloneMediaIntervals(result);
}

function cloneMediaIntervals(m: MediaIntervals): MediaIntervals {
  return {
    intervals: m.intervals.map((iv) => ({ ...iv })),
    status: m.status,
    possible: m.possible.map((iv) => ({ ...iv })),
    reasons: [...m.reasons],
  };
}

function computeMediaIntervals(text: string, options: MediaToIntervalsOptions): MediaIntervals {
  if (text.trim() === "") {
    return { intervals: [{ ...FULL_WIDTH_RANGE }], status: "ok", possible: [{ ...FULL_WIDTH_RANGE }], reasons: [] };
  }
  const parsed = parseMediaCondition(text, {
    ...(options.rootFontSizePx !== undefined ? { rootFontSizePx: options.rootFontSizePx } : {}),
  });
  const definite: Interval[] = [];
  const possible: Interval[] = [];
  const reasons = new Set<string>();
  let screenAlternatives = 0;

  for (const alt of parsed.alternatives) {
    if (alt.qualifier === "not") {
      screenAlternatives++;
      possible.push({ ...FULL_WIDTH_RANGE });
      reasons.add("media-not-qualifier");
      continue;
    }
    if (alt.status === "unparsed") {
      screenAlternatives++;
      possible.push({ ...FULL_WIDTH_RANGE });
      reasons.add("media-unparsed");
      continue;
    }
    if (alt.status === "unsupported") {
      if (!alt.screenApplicable) continue;
      screenAlternatives++;
      possible.push({ ...FULL_WIDTH_RANGE });
      reasons.add("media-unsupported");
      continue;
    }
    if (!alt.screenApplicable) continue;
    screenAlternatives++;
    const extra = nonWidthIdentifiers(alt.normalized);
    const deviceAmbiguous =
      options.deviceWidth === "ambiguous" && alt.bounds.some((b) => b.deviceWidth);
    let iv: Interval | undefined;
    if (alt.status === "width") {
      iv = boundsToInterval(alt.bounds);
    } else {
      iv = { ...FULL_WIDTH_RANGE }; // width-irrelevant
    }
    if (iv === undefined) continue; // unsatisfiable conjunction: holds nowhere
    if (extra.length > 0 || deviceAmbiguous) {
      possible.push(iv);
      for (const id of extra) reasons.add(`media-non-width-feature:${id}`);
      if (deviceAmbiguous) reasons.add("media-device-width");
    } else {
      definite.push(iv);
    }
  }

  const intervals = normalizeIntervals(definite);
  const possibleAll = unionIntervals(intervals, possible);
  if (screenAlternatives === 0) {
    return { intervals: [], status: "not-screen", possible: [], reasons: [] };
  }
  if (intervalsEqual(intervals, possibleAll)) {
    return { intervals, status: "ok", possible: intervals.map((iv) => ({ ...iv })), reasons: [] };
  }
  return { intervals, status: "ambiguous", possible: possibleAll, reasons: [...reasons].sort() };
}

/** Relevance of a parsed media condition at one width. */
export function mediaRelevanceAt(
  media: MediaIntervals,
  width: number,
): "applies" | "not-applies" | "unknown" {
  if (intervalsContain(media.intervals, width)) return "applies";
  if (intervalsContain(media.possible, width)) return "unknown";
  return "not-applies";
}
