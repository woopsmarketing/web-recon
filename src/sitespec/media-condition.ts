/**
 * Media condition tokenizer (Task 28.6 — Lane W2).
 *
 * Nothing else in `src/` reads a media condition today: the Observer stores
 * `CSSMediaRule.conditionText` verbatim, `layout-inference` only tests whether
 * a rule *has* a media condition, and the responsive band generator emits
 * condition strings without ever parsing one. This module is the missing
 * direction: condition text in, numbers out.
 *
 * Contract:
 *  - Pure. No I/O, no clock, no randomness, no third-party imports.
 *  - Deterministic: the same string always yields the same object, and every
 *    list it produces is in a defined order.
 *  - Never throws. Malformed input becomes a clean `"unparsed"` result.
 *  - Never guesses. A condition whose meaning cannot be represented faithfully
 *    (a `not` inversion, an intra-query `or` over width, a `calc()` bound, a
 *    viewport-relative unit) is reported `"unsupported"` rather than reduced to
 *    a wrong interval. Getting that wrong would make the reconstruction engine
 *    hide content at a width where the source shows it, so the bias is always
 *    toward refusing.
 *
 * Adjacency — the thing the reconstruction lane actually needs:
 *   A source that authors `(max-width: 1024px)` is telling you the layout
 *   changes *between* 1024 and 1025. Every parsed bound therefore carries a
 *   `boundary` of `{ below, above }` with `above === below + 1`: the last
 *   integer CSS pixel on one side of the authored change and the first on the
 *   other. Generated band edges snap to these numbers.
 *
 * HOW TO READ A RESULT — the one trap in this API:
 *   `result.status`, `result.widthRelevant`, `result.bounds` and
 *   `result.interval` describe the WIDTH ALGEBRA of the condition and nothing
 *   else. They say nothing about whether the condition applies to a SCREEN.
 *   `print and (min-width: 900px)` is genuinely width-relevant — it names 900 —
 *   and it must never move a screen band edge. Media-type applicability lives
 *   on `alternatives[i].screenApplicable`, per alternative, because a comma
 *   list can mix `screen` and `print` in one condition.
 *
 *   So: a caller that snaps layout to these numbers MUST read
 *   `alternatives[]` and honour `screenApplicable`, or use
 *   {@link foldMediaBreakpoints}, which does it (and counts what it skipped).
 *   Reading `result.bounds` directly is correct only for a caller that wants
 *   the authored numbers regardless of media type.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Root font size assumed when converting an `em` / `rem` breakpoint to px. */
export const MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX = 16;

/**
 * The narrowest width a viewport can have. A width is a non-negative length, so
 * an upper bound whose `breakpointPx` falls below this excludes every width
 * there is and its interval is `empty` — `(width < 0px)` is not a very small
 * range, it is no range.
 */
export const MEDIA_CONDITION_MIN_WIDTH_PX = 0;

/**
 * The largest authored length this module will turn into a bound, in CSS px.
 *
 * 2^31 is ~1.4 million times a 1440px desktop, so nothing a real stylesheet
 * authors is refused by it — `(max-width: 99999px)` is fine. What it buys is
 * that `Math.floor` / `Math.ceil` of any accepted length, and that value plus
 * one, are exact integers nowhere near 2^53, so the `above === below + 1`
 * adjacency invariant is true rather than vacuously true in float. A length
 * past this is reported `"unsupported"` — understood in shape, refused as a
 * number — instead of producing a boundary whose two halves are the same
 * float.
 */
export const MEDIA_CONDITION_MAX_LENGTH_PX = 2 ** 31;

/** `"min"` = the condition holds at and above the value; `"max"` = at and below. */
export type MediaWidthBoundKind = "min" | "max";

/** Length units this module can turn into CSS pixels. */
export type MediaLengthUnit = "px" | "em" | "rem" | "pt" | "pc" | "in" | "cm" | "mm" | "q";

/**
 * The layout change an authored bound implies, in whole CSS pixels.
 *
 * `above === below + 1` ALWAYS, and both are exact integers: every bound is
 * built from a length no larger than {@link MEDIA_CONDITION_MAX_LENGTH_PX},
 * which keeps `below + 1` far inside the exactly-representable integer range,
 * so the invariant is a fact rather than a float coincidence.
 *
 * `below` may be `-1`. That happens only for a bound authored at 0px
 * (`(min-width: 0)`): the pixel "before" the first real one is a notional
 * index naming the low side of the change, not a width any viewport can have.
 * Clamping it to 0 would break adjacency, which is the property band-edge
 * snapping depends on, so it is reported as-is.
 */
export interface MediaWidthBoundary {
  /** Last whole pixel on the low side of the authored change. */
  readonly below: number;
  /** First whole pixel on the high side of the authored change. */
  readonly above: number;
}

/** One width constraint expressed by a media condition. */
export interface MediaWidthBound {
  readonly kind: MediaWidthBoundKind;
  /**
   * The authored value in CSS pixels, after unit conversion. NOT rounded to a
   * breakpoint — see `breakpointPx` for that.
   */
  readonly px: number;
  /**
   * `true` for `min-width` / `max-width` / `>=` / `<=`; `false` for the strict
   * `<` and `>` range forms. Recorded rather than fudged with an epsilon.
   */
  readonly inclusive: boolean;
  /** Feature name as authored, lowercased (`min-width`, `width`, `max-device-width`, …). */
  readonly feature: string;
  /** The length token as authored, lowercased (`40em`, `1024px`). */
  readonly rawValue: string;
  readonly unit: MediaLengthUnit;
  /** `true` when `px` was computed from a non-px unit under an assumption. */
  readonly converted: boolean;
  /** Only present when `converted`: the root font size the conversion assumed. */
  readonly assumedRootFontSizePx?: number;
  /** `true` for the deprecated `device-width` family — see DEVICE_WIDTH_POLICY. */
  readonly deviceWidth: boolean;
  readonly boundary: MediaWidthBoundary;
  /**
   * The whole-pixel breakpoint this bound names: `boundary.above` for a `min`,
   * `boundary.below` for a `max`. This is the number a generated band edge
   * should snap to.
   */
  readonly breakpointPx: number;
}

/** The intersection of every bound in one conjunctive query. */
export interface MediaWidthInterval {
  /** Tightest lower bound, or `undefined` when the query has none. */
  readonly min: MediaWidthBound | undefined;
  /** Tightest upper bound, or `undefined` when the query has none. */
  readonly max: MediaWidthBound | undefined;
  /** `true` when the bounds contradict each other and no width can match. */
  readonly empty: boolean;
}

/**
 * - `"width"`            — parsed, and it constrains width.
 * - `"width-irrelevant"` — parsed cleanly, but names no width constraint.
 * - `"unsupported"`      — understood in shape, but its meaning cannot be
 *                          represented faithfully. Never treat as a breakpoint.
 * - `"unparsed"`         — malformed or empty. Must be surfaced, never swallowed.
 */
export type MediaConditionStatus = "width" | "width-irrelevant" | "unsupported" | "unparsed";

/** One comma-separated query inside a condition list. */
export interface MediaConditionAlternative {
  readonly raw: string;
  readonly normalized: string;
  readonly status: MediaConditionStatus;
  /** `"not"` (always unsupported) or `"only"` (a legacy no-op), when present. */
  readonly qualifier: "not" | "only" | undefined;
  /** Media type as authored (`screen`, `print`, `all`, …), when one was given. */
  readonly mediaType: string | undefined;
  /** `false` for `print` / `speech` / other non-screen types. */
  readonly screenApplicable: boolean;
  readonly bounds: readonly MediaWidthBound[];
  readonly interval: MediaWidthInterval | undefined;
  /** Every feature name seen in this query, deduped and sorted. */
  readonly features: readonly string[];
  readonly reason: string | undefined;
}

export interface MediaConditionResult {
  /** The input exactly as given (or `""` when the input was not a string). */
  readonly raw: string;
  /** Lowercased, whitespace-normalized form. Stable enough to use as a key. */
  readonly normalized: string;
  readonly status: MediaConditionStatus;
  /**
   * `true` when the condition names at least one width constraint.
   *
   * WIDTH ALGEBRA ONLY — this is NOT "applies to the screen". `print and
   * (min-width: 900px)` is `widthRelevant: true` with a populated `bounds` and
   * `interval.min.breakpointPx === 900`, and it must never move a screen band
   * edge. A caller that snaps layout to these numbers MUST first check
   * `alternatives[i].screenApplicable`, or use {@link foldMediaBreakpoints},
   * which honours it and counts what it skipped.
   */
  readonly widthRelevant: boolean;
  /** `true` when the condition is a comma list, i.e. a disjunction. */
  readonly disjunction: boolean;
  /** One entry per comma-separated query, in source order. Always non-empty. */
  readonly alternatives: readonly MediaConditionAlternative[];
  /**
   * Bounds of the single query — empty when this is a disjunction, because a
   * disjunction of different widths cannot be reduced to one interval. Read
   * `alternatives` in that case.
   *
   * Carries NO media-type filter and NO satisfiability filter: see
   * `widthRelevant` for the screen-applicability trap, and `interval.empty`
   * for a conjunction that no width can satisfy.
   */
  readonly bounds: readonly MediaWidthBound[];
  /**
   * Interval of the single query; `undefined` for a disjunction.
   *
   * Same two caveats as `bounds`: check `alternatives[i].screenApplicable`
   * before treating it as a screen breakpoint, and check `interval.empty`
   * before treating it as a range that can actually match.
   */
  readonly interval: MediaWidthInterval | undefined;
  readonly rootFontSizePx: number;
  /** Deterministic, deduped, lexicographically sorted diagnostics. */
  readonly notes: readonly string[];
  /** Why the status is not `"width"`, when it is not. */
  readonly reason: string | undefined;
}

export interface ParseMediaConditionOptions {
  /**
   * Root font size used to convert `em` / `rem` breakpoints.
   * Defaults to {@link MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX}. A
   * non-finite or non-positive value falls back to the default.
   */
  readonly rootFontSizePx?: number;
}

/** One `(px, kind)` bucket of the folded histogram. */
export interface MediaBreakpointEntry {
  readonly px: number;
  readonly kind: MediaWidthBoundKind;
  readonly count: number;
}

/**
 * One AUTHORED CHANGE of the folded histogram, keyed on the boundary itself.
 *
 * `entries` is keyed on `(px, kind)`, which is the right key for "what did the
 * source literally write" but the WRONG key for "where does the layout change".
 * `(max-width: 1024px)` and `(min-width: 1025px)` are the two sides of ONE
 * change, and they land in two different `entries` buckets — 1024/max and
 * 1025/min — because their `breakpointPx` differs by the one pixel that
 * separates the low side of a change from its high side. A consumer that snaps
 * a responsive band edge to `entries` therefore sees two breakpoints one pixel
 * apart where the author wrote one, and this is not hypothetical: the
 * observations on disk carry `(max-width: 899px)` and `(min-width: 900px)`,
 * `(max-width: 599px)` and `(min-width: 600px)`, `(max-width: 1111px)` and
 * `(min-width: 1112px)` — all adjacent pairs naming a single boundary.
 *
 * `boundaries` is that same fold keyed on `{below, above}`, so each authored
 * change appears exactly ONCE regardless of which side the author spelled it
 * from. `minCount` / `maxCount` keep the split visible, and their sum is
 * `count`, so nothing is lost by folding.
 */
export interface MediaBreakpointBoundaryEntry {
  /** Last whole pixel on the low side of the change. May be `-1` for a 0px bound. */
  readonly below: number;
  /** First whole pixel on the high side of the change. Always `below + 1`. */
  readonly above: number;
  /** Weighted declarations naming this boundary from EITHER side. `min + max`. */
  readonly count: number;
  /** …of those, the ones spelled as a `min` bound (the change begins at `above`). */
  readonly minCount: number;
  /** …and the ones spelled as a `max` bound (the change ends at `below`). */
  readonly maxCount: number;
}

export interface MediaBreakpointHistogram {
  /** Sorted by `px` ascending, then `kind` ascending (`"max"` before `"min"`). */
  readonly entries: readonly MediaBreakpointEntry[];
  /**
   * The same fold keyed on the BOUNDARY rather than on `(px, kind)`, so the two
   * spellings of one authored change collapse into one row. Sorted by `below`
   * ascending. See {@link MediaBreakpointBoundaryEntry} for why both views
   * exist and which one a band-edge snapper should read.
   */
  readonly boundaries: readonly MediaBreakpointBoundaryEntry[];
  /** Conditions folded (weighted by `count`). */
  readonly totalCount: number;
  /** Conditions that contributed at least one histogram entry. */
  readonly widthCount: number;
  /** Conditions that parsed cleanly but contributed no screen breakpoint. */
  readonly widthIrrelevantCount: number;
  /** Conditions whose meaning could not be represented (`not`, `or`, `calc()`, …). */
  readonly unsupportedCount: number;
  /**
   * Conditions that could not be read at all. Surfaced so a caller can tell
   * "this source authored no breakpoints" vs. "we could not read them".
   */
  readonly unparsedCount: number;
  /** Informational: conditions that were comma-separated disjunctions. */
  readonly disjunctionCount: number;
  /** Informational: conditions that contributed a deprecated `device-width` bound. */
  readonly deviceWidthCount: number;
  /** Informational: queries skipped because their media type is not screen-applicable. */
  readonly nonScreenSkippedCount: number;
  /**
   * Queries skipped because their `interval.empty` says no width can match
   * them (`(min-width: 64px) and (max-width: 32px)`, `(width < 0px)`).
   *
   * Counted rather than dropped silently: an unsatisfiable condition folded in
   * would inject phantom snap targets, and a consumer that snaps responsive
   * band edges to this histogram would put a real pixel at a width the source
   * never changed at.
   */
  readonly emptyIntervalCount: number;
}

/** A parsed condition, optionally weighted by how many times it occurred. */
export type MediaConditionTally =
  | MediaConditionResult
  | { readonly condition: MediaConditionResult; readonly count?: number };

// ---------------------------------------------------------------------------
// Policy constants (documented decisions, not magic)
// ---------------------------------------------------------------------------

/**
 * The deprecated `device-width` family (common on older Korean sites) IS
 * treated as a width constraint: on the sites that used it, it was the
 * viewport-width proxy the author intended. Every such bound carries
 * `deviceWidth: true` and the condition emits a note, so a caller that wants to
 * exclude them can, and the histogram counts them separately.
 */
export const DEVICE_WIDTH_POLICY = "treated-as-width-constraint" as const;

const WIDTH_FEATURES: ReadonlyMap<string, { kind: MediaWidthBoundKind | "exact"; device: boolean }> =
  new Map([
    ["width", { kind: "exact", device: false }],
    ["min-width", { kind: "min", device: false }],
    ["max-width", { kind: "max", device: false }],
    ["device-width", { kind: "exact", device: true }],
    ["min-device-width", { kind: "min", device: true }],
    ["max-device-width", { kind: "max", device: true }],
  ]);

/** Only these two spellings accept the range operators (`min-width < x` is invalid CSS). */
const RANGE_WIDTH_NAMES: ReadonlySet<string> = new Set(["width", "device-width"]);

const MEDIA_TYPES: ReadonlySet<string> = new Set([
  "all",
  "aural",
  "braille",
  "embossed",
  "handheld",
  "print",
  "projection",
  "screen",
  "speech",
  "tty",
  "tv",
]);

const SCREEN_APPLICABLE_TYPES: ReadonlySet<string> = new Set(["all", "screen"]);

/** Exact CSS absolute-length ratios; `em`/`rem` resolve against the root font size. */
const ABSOLUTE_UNIT_PX: ReadonlyMap<MediaLengthUnit, number> = new Map([
  ["px", 1],
  ["pt", 96 / 72],
  ["pc", 16],
  ["in", 96],
  ["cm", 96 / 2.54],
  ["mm", 96 / 25.4],
  ["q", 96 / 101.6],
]);

const IDENT_RE = /^-?[a-z_][a-z0-9_-]*$/;
/** Any identifier-shaped run inside a nested group, used only to prove one exists. */
const IDENT_SCAN_RE = /-?[a-z_][a-z0-9_-]*/g;
/** Words that are grammar, not a feature name. A group made only of these names nothing. */
const GROUP_CONNECTORS: ReadonlySet<string> = new Set(["and", "or", "not"]);
const LENGTH_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z]*)$/;
/** Conservative: matches `width`, `min-width`, `max-device-width`, and anything ending `-width`. */
const ANY_WIDTH_RE = /\bwidth\b/;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Lowercase, collapse whitespace, and regularize the punctuation that real
 * stylesheets vary on: `(prefers-reduced-motion:reduced)` (no space after the
 * colon) appears verbatim in the corpus, as do `( min-width : 900px )` and
 * `(width>=1024px)`.
 */
function normalizeCondition(text: string): string {
  let out = text.toLowerCase().replace(/\s+/g, " ").trim();
  out = out.replace(/\s*(<=|>=|<|>|=)\s*/g, " $1 ");
  out = out.replace(/\s*:\s*/g, ": ");
  out = out.replace(/\s*,\s*/g, ", ");
  out = out.replace(/\(\s+/g, "(");
  out = out.replace(/\s+\)/g, ")");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Does this nested-group body name any media feature at all?
 *
 * Paren balance is NOT evidence of meaning: `(())` and `((((()))))` are balanced
 * and name nothing. Treating them as a clean "non-width group" would let
 * arbitrary balanced garbage report `width-irrelevant`, which quietly defeats
 * the `unparsedCount` gate a caller uses to decide whether this module
 * understood a stylesheet at all.
 */
function namesAFeature(text: string): boolean {
  for (const match of text.matchAll(IDENT_SCAN_RE)) {
    if (!GROUP_CONNECTORS.has(match[0])) return true;
  }
  return false;
}

/** Splits on a character at paren depth 0. Returns `undefined` on unbalanced parens. */
function splitTopLevel(text: string, separator: string): string[] | undefined {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return undefined;
    }
    if (ch === separator && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (depth !== 0) return undefined;
  parts.push(buf);
  return parts;
}

// ---------------------------------------------------------------------------
// Bound construction
// ---------------------------------------------------------------------------

/** Keeps float conversions byte-stable across runs. */
function roundPx(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function boundaryFor(kind: MediaWidthBoundKind, px: number, inclusive: boolean): MediaWidthBoundary {
  if (kind === "min") {
    // First whole pixel at which the condition holds.
    const first = inclusive ? Math.ceil(px) : Math.floor(px) + 1;
    return { below: first - 1, above: first };
  }
  // Last whole pixel at which the condition holds.
  const last = inclusive ? Math.floor(px) : Math.ceil(px) - 1;
  return { below: last, above: last + 1 };
}

interface LengthParse {
  readonly px: number;
  readonly unit: MediaLengthUnit;
  readonly converted: boolean;
  readonly raw: string;
}

type LengthOutcome =
  | { readonly ok: true; readonly length: LengthParse }
  | { readonly ok: false; readonly status: "unparsed" | "unsupported"; readonly reason: string };

/**
 * The one exit for a successful length: every accepted value passes the
 * magnitude guard, so no caller can build a bound this module cannot represent.
 */
function acceptLength(length: LengthParse): LengthOutcome {
  if (!Number.isFinite(length.px) || Math.abs(length.px) > MEDIA_CONDITION_MAX_LENGTH_PX) {
    return {
      ok: false,
      status: "unsupported",
      reason: `'${length.raw}' resolves to ${length.px}px, past the ${MEDIA_CONDITION_MAX_LENGTH_PX}px magnitude this module represents exactly`,
    };
  }
  return { ok: true, length };
}

function parseLength(token: string, rootFontSizePx: number): LengthOutcome {
  const raw = token.trim();
  if (raw.includes("calc(") || raw.includes("var(")) {
    return { ok: false, status: "unsupported", reason: `computed length '${raw}' is not resolvable offline` };
  }
  const m = LENGTH_RE.exec(raw);
  if (!m) return { ok: false, status: "unparsed", reason: `'${raw}' is not a length` };
  const value = Number(m[1]);
  const unit = m[2] ?? "";
  if (!Number.isFinite(value)) return { ok: false, status: "unparsed", reason: `'${raw}' is not a length` };
  if (value < 0) return { ok: false, status: "unparsed", reason: `'${raw}' is a negative width` };
  if (unit === "") {
    // A unitless length is only legal when it is exactly zero.
    if (value !== 0) return { ok: false, status: "unparsed", reason: `'${raw}' has no unit` };
    return acceptLength({ px: 0, unit: "px", converted: false, raw });
  }
  if (unit === "em" || unit === "rem") {
    return acceptLength({ px: roundPx(value * rootFontSizePx), unit, converted: true, raw });
  }
  const ratio = ABSOLUTE_UNIT_PX.get(unit as MediaLengthUnit);
  if (ratio === undefined) {
    return { ok: false, status: "unsupported", reason: `unit '${unit}' cannot be resolved to pixels` };
  }
  return acceptLength({
    px: roundPx(value * ratio),
    unit: unit as MediaLengthUnit,
    converted: unit !== "px",
    raw,
  });
}

function makeBound(
  kind: MediaWidthBoundKind,
  inclusive: boolean,
  feature: string,
  device: boolean,
  length: LengthParse,
  rootFontSizePx: number,
): MediaWidthBound {
  const boundary = boundaryFor(kind, length.px, inclusive);
  return {
    kind,
    px: length.px,
    inclusive,
    feature,
    rawValue: length.raw,
    unit: length.unit,
    converted: length.converted,
    ...(length.converted && (length.unit === "em" || length.unit === "rem")
      ? { assumedRootFontSizePx: rootFontSizePx }
      : {}),
    deviceWidth: device,
    boundary,
    breakpointPx: kind === "min" ? boundary.above : boundary.below,
  };
}

// ---------------------------------------------------------------------------
// Feature terms
// ---------------------------------------------------------------------------

type TermOutcome =
  | { readonly kind: "bounds"; readonly feature: string; readonly bounds: readonly MediaWidthBound[]; readonly notes: readonly string[] }
  | { readonly kind: "irrelevant"; readonly feature: string | undefined; readonly note?: string }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "unparsed"; readonly reason: string };

const OP_TO_BOUND: ReadonlyMap<string, { kind: MediaWidthBoundKind | "exact"; inclusive: boolean }> =
  new Map([
    [">=", { kind: "min", inclusive: true }],
    [">", { kind: "min", inclusive: false }],
    ["<=", { kind: "max", inclusive: true }],
    ["<", { kind: "max", inclusive: false }],
    ["=", { kind: "exact", inclusive: true }],
  ]);

function flipOperator(op: string): string {
  switch (op) {
    case "<":
      return ">";
    case "<=":
      return ">=";
    case ">":
      return "<";
    case ">=":
      return "<=";
    default:
      return op;
  }
}

function boundsForOperator(
  op: string,
  feature: string,
  device: boolean,
  length: LengthParse,
  rootFontSizePx: number,
): readonly MediaWidthBound[] | undefined {
  const spec = OP_TO_BOUND.get(op);
  if (spec === undefined) return undefined;
  if (spec.kind === "exact") {
    return [
      makeBound("min", true, feature, device, length, rootFontSizePx),
      makeBound("max", true, feature, device, length, rootFontSizePx),
    ];
  }
  return [makeBound(spec.kind, spec.inclusive, feature, device, length, rootFontSizePx)];
}

function deviceNote(feature: string): string {
  return `'${feature}' is deprecated; ${DEVICE_WIDTH_POLICY}`;
}

function conversionNote(length: LengthParse, rootFontSizePx: number): string | undefined {
  if (!length.converted) return undefined;
  if (length.unit === "em" || length.unit === "rem") {
    return `'${length.raw}' converted to ${length.px}px assuming a ${rootFontSizePx}px root font size`;
  }
  return `'${length.raw}' converted to ${length.px}px (unit '${length.unit}')`;
}

function parseTerm(term: string, rootFontSizePx: number): TermOutcome {
  const text = term.trim();
  if (text === "") return { kind: "unparsed", reason: "empty term" };

  if (!text.startsWith("(")) {
    // A bare identifier at this position can only be a media type; the caller
    // rejects it anywhere but the head of the query.
    return { kind: "unparsed", reason: `'${text}' is not a media feature` };
  }
  if (!text.endsWith(")")) return { kind: "unparsed", reason: `unbalanced parentheses in '${text}'` };

  const inner = text.slice(1, -1).trim();
  if (inner === "") return { kind: "unparsed", reason: "empty media feature" };

  if (inner === "not" || inner.startsWith("not ") || inner.startsWith("not(")) {
    return { kind: "unsupported", reason: "'not' inverts the condition and is not represented" };
  }
  if (inner.startsWith("(")) {
    // A nested group. We do not evaluate boolean algebra over width.
    if (ANY_WIDTH_RE.test(inner)) {
      return { kind: "unsupported", reason: "nested group combines width constraints" };
    }
    if (!namesAFeature(inner)) {
      return { kind: "unparsed", reason: `nested group '(${inner})' names no media feature` };
    }
    return { kind: "irrelevant", feature: undefined, note: "nested non-width group ignored" };
  }

  const colon = inner.indexOf(":");
  if (colon >= 0) {
    const name = inner.slice(0, colon).trim();
    const value = inner.slice(colon + 1).trim();
    if (name === "" || !IDENT_RE.test(name)) {
      return { kind: "unparsed", reason: `'${inner}' is not a media feature` };
    }
    if (value === "") return { kind: "unparsed", reason: `feature '${name}' has no value` };
    const width = WIDTH_FEATURES.get(name);
    if (width === undefined) return { kind: "irrelevant", feature: name };
    const length = parseLength(value, rootFontSizePx);
    if (!length.ok) return { kind: length.status, reason: length.reason };
    const bounds =
      width.kind === "exact"
        ? [
            makeBound("min", true, name, width.device, length.length, rootFontSizePx),
            makeBound("max", true, name, width.device, length.length, rootFontSizePx),
          ]
        : [makeBound(width.kind, true, name, width.device, length.length, rootFontSizePx)];
    const notes: string[] = [];
    const conv = conversionNote(length.length, rootFontSizePx);
    if (conv !== undefined) notes.push(conv);
    if (width.device) notes.push(deviceNote(name));
    return { kind: "bounds", feature: name, bounds, notes };
  }

  // Range syntax: `width >= 1024px`, `1024px <= width`, `1024px <= width <= 1440px`.
  const parts = inner.split(/ (<=|>=|<|>|=) /);
  if (parts.length === 1) {
    // Boolean feature: `(hover)`, `(color)`, `(width)`. Never a breakpoint.
    if (!IDENT_RE.test(inner)) return { kind: "unparsed", reason: `'${inner}' is not a media feature` };
    if (WIDTH_FEATURES.has(inner)) {
      return { kind: "irrelevant", feature: inner, note: `boolean '${inner}' names no breakpoint` };
    }
    return { kind: "irrelevant", feature: inner };
  }

  if (parts.length === 3) {
    const [a, op, b] = parts as [string, string, string];
    if (RANGE_WIDTH_NAMES.has(a)) {
      const length = parseLength(b, rootFontSizePx);
      if (!length.ok) return { kind: length.status, reason: length.reason };
      const device = WIDTH_FEATURES.get(a)!.device;
      const bounds = boundsForOperator(op, a, device, length.length, rootFontSizePx);
      if (bounds === undefined) return { kind: "unparsed", reason: `unknown operator '${op}'` };
      const notes: string[] = [];
      const conv = conversionNote(length.length, rootFontSizePx);
      if (conv !== undefined) notes.push(conv);
      if (device) notes.push(deviceNote(a));
      return { kind: "bounds", feature: a, bounds, notes };
    }
    if (RANGE_WIDTH_NAMES.has(b)) {
      const length = parseLength(a, rootFontSizePx);
      if (!length.ok) return { kind: length.status, reason: length.reason };
      const device = WIDTH_FEATURES.get(b)!.device;
      // `1024px <= width` means `width >= 1024px`.
      const bounds = boundsForOperator(flipOperator(op), b, device, length.length, rootFontSizePx);
      if (bounds === undefined) return { kind: "unparsed", reason: `unknown operator '${op}'` };
      const notes: string[] = [];
      const conv = conversionNote(length.length, rootFontSizePx);
      if (conv !== undefined) notes.push(conv);
      if (device) notes.push(deviceNote(b));
      return { kind: "bounds", feature: b, bounds, notes };
    }
    if (WIDTH_FEATURES.has(a) || WIDTH_FEATURES.has(b)) {
      // `(min-width < 100px)` — a width family name that cannot take a range op.
      return { kind: "unparsed", reason: `'${a}' cannot be used with a range operator` };
    }
    if (IDENT_RE.test(a) || IDENT_RE.test(b)) {
      return { kind: "irrelevant", feature: IDENT_RE.test(a) ? a : b };
    }
    return { kind: "unparsed", reason: `'${inner}' is not a media feature` };
  }

  if (parts.length === 5) {
    const [lowValue, op1, name, op2, highValue] = parts as [string, string, string, string, string];
    if (!RANGE_WIDTH_NAMES.has(name)) {
      if (WIDTH_FEATURES.has(name)) {
        return { kind: "unparsed", reason: `'${name}' cannot be used with a range operator` };
      }
      if (IDENT_RE.test(name)) return { kind: "irrelevant", feature: name };
      return { kind: "unparsed", reason: `'${inner}' is not a media feature` };
    }
    const device = WIDTH_FEATURES.get(name)!.device;
    const low = parseLength(lowValue, rootFontSizePx);
    if (!low.ok) return { kind: low.status, reason: low.reason };
    const high = parseLength(highValue, rootFontSizePx);
    if (!high.ok) return { kind: high.status, reason: high.reason };
    // `a <= width <= b` — the first comparison is written backwards.
    const lowBounds = boundsForOperator(flipOperator(op1), name, device, low.length, rootFontSizePx);
    const highBounds = boundsForOperator(op2, name, device, high.length, rootFontSizePx);
    if (lowBounds === undefined || highBounds === undefined) {
      return { kind: "unparsed", reason: `unknown operator in '${inner}'` };
    }
    const kinds = new Set([...lowBounds, ...highBounds].map((b) => b.kind));
    if (kinds.size !== 2) {
      return { kind: "unparsed", reason: `'${inner}' points both comparisons the same way` };
    }
    const notes: string[] = [];
    for (const length of [low.length, high.length]) {
      const conv = conversionNote(length, rootFontSizePx);
      if (conv !== undefined) notes.push(conv);
    }
    if (device) notes.push(deviceNote(name));
    return { kind: "bounds", feature: name, bounds: [...lowBounds, ...highBounds], notes };
  }

  return { kind: "unparsed", reason: `'${inner}' is not a media feature` };
}

// ---------------------------------------------------------------------------
// Alternatives
// ---------------------------------------------------------------------------

function intersect(bounds: readonly MediaWidthBound[]): MediaWidthInterval | undefined {
  if (bounds.length === 0) return undefined;
  let min: MediaWidthBound | undefined;
  let max: MediaWidthBound | undefined;
  for (const bound of bounds) {
    if (bound.kind === "min") {
      // Strictly greater wins, so an earlier bound survives a tie: deterministic.
      if (min === undefined || bound.breakpointPx > min.breakpointPx) min = bound;
    } else if (max === undefined || bound.breakpointPx < max.breakpointPx) {
      max = bound;
    }
  }
  const contradictory =
    min !== undefined && max !== undefined && min.breakpointPx > max.breakpointPx;
  // A width is never negative, so an upper bound below the first real pixel
  // excludes every width there is. `(width < 0px)` yields breakpointPx -1 and
  // is unsatisfiable; `(max-width: 0px)` yields 0 and matches exactly width 0,
  // which is degenerate but real, so it is NOT empty.
  const belowFirstPixel = max !== undefined && max.breakpointPx < MEDIA_CONDITION_MIN_WIDTH_PX;
  return { min, max, empty: contradictory || belowFirstPixel };
}

function parseAlternative(
  raw: string,
  rootFontSizePx: number,
  notes: string[],
): MediaConditionAlternative {
  const normalized = raw.trim();
  const base = {
    raw,
    normalized,
    qualifier: undefined,
    mediaType: undefined,
    screenApplicable: true,
    bounds: [] as readonly MediaWidthBound[],
    interval: undefined,
    features: [] as readonly string[],
  };
  if (normalized === "") {
    return { ...base, status: "unparsed", reason: "empty query" };
  }

  const tokens = splitTopLevel(normalized, " ");
  if (tokens === undefined) {
    return { ...base, status: "unparsed", reason: `unbalanced parentheses in '${normalized}'` };
  }
  const words = tokens.filter((t) => t !== "");

  let index = 0;
  let qualifier: "not" | "only" | undefined;
  if (words[index] === "not") {
    // Refusing rather than inverting: a wrong inversion hides content.
    return {
      ...base,
      qualifier: "not",
      status: "unsupported",
      reason: "'not' inverts the condition and is not represented",
    };
  }
  if (words[index] === "only") {
    qualifier = "only";
    notes.push("'only' prefix ignored — it does not change what the condition matches");
    index += 1;
  }

  let mediaType: string | undefined;
  const head = words[index];
  if (head !== undefined && !head.startsWith("(")) {
    if (!MEDIA_TYPES.has(head)) {
      return {
        ...base,
        qualifier,
        status: "unparsed",
        reason: `'${head}' is not a media type`,
      };
    }
    mediaType = head;
    index += 1;
  } else if (qualifier === "only") {
    return { ...base, qualifier, status: "unparsed", reason: "'only' requires a media type" };
  }

  const screenApplicable = mediaType === undefined || SCREEN_APPLICABLE_TYPES.has(mediaType);
  const withType = { ...base, qualifier, mediaType, screenApplicable };

  const terms: string[] = [];
  let sawOr = false;
  let expectConnector = mediaType !== undefined;
  for (; index < words.length; index += 1) {
    const word = words[index]!;
    if (expectConnector) {
      if (word === "and") {
        expectConnector = false;
        continue;
      }
      if (word === "or") {
        sawOr = true;
        expectConnector = false;
        continue;
      }
      return { ...withType, status: "unparsed", reason: `expected 'and' before '${word}'` };
    }
    if (word === "and" || word === "or") {
      return { ...withType, status: "unparsed", reason: `dangling '${word}'` };
    }
    terms.push(word);
    expectConnector = true;
  }
  if (!expectConnector && (mediaType !== undefined || terms.length > 0)) {
    return { ...withType, status: "unparsed", reason: "condition ends with a connector" };
  }
  if (terms.length === 0) {
    if (mediaType === undefined) {
      return { ...withType, status: "unparsed", reason: `'${normalized}' names nothing` };
    }
    return { ...withType, status: "width-irrelevant", reason: `media type '${mediaType}' names no width` };
  }

  const bounds: MediaWidthBound[] = [];
  const features = new Set<string>();
  const localNotes: string[] = [];
  for (const term of terms) {
    const outcome = parseTerm(term, rootFontSizePx);
    if (outcome.kind === "unparsed") {
      return { ...withType, status: "unparsed", reason: outcome.reason };
    }
    if (outcome.kind === "unsupported") {
      return { ...withType, status: "unsupported", reason: outcome.reason };
    }
    if (outcome.kind === "irrelevant") {
      if (outcome.feature !== undefined) features.add(outcome.feature);
      if (outcome.note !== undefined) localNotes.push(outcome.note);
      continue;
    }
    features.add(outcome.feature);
    bounds.push(...outcome.bounds);
    localNotes.push(...outcome.notes);
  }

  if (sawOr) {
    if (bounds.length > 0) {
      return {
        ...withType,
        features: [...features].sort(),
        status: "unsupported",
        reason: "'or' between width constraints cannot be reduced to one interval",
      };
    }
    localNotes.push("'or' over non-width features ignored");
  }

  notes.push(...localNotes);
  const sortedFeatures = [...features].sort();
  if (bounds.length === 0) {
    return {
      ...withType,
      features: sortedFeatures,
      status: "width-irrelevant",
      reason: "no width feature",
    };
  }
  if (!screenApplicable) {
    notes.push(`width constraints under media type '${mediaType}' do not apply to screen layout`);
  }
  return {
    ...withType,
    features: sortedFeatures,
    bounds,
    interval: intersect(bounds),
    status: "width",
    reason: undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses one CSS media condition (a `CSSMediaRule.conditionText`, an `@media`
 * prelude, or a `<link media>` value) into the width constraints it expresses.
 *
 * Never throws: anything it cannot read comes back as `status: "unparsed"`.
 */
export function parseMediaCondition(
  input: unknown,
  options: ParseMediaConditionOptions = {},
): MediaConditionResult {
  const rootFontSizePx =
    typeof options.rootFontSizePx === "number" &&
    Number.isFinite(options.rootFontSizePx) &&
    options.rootFontSizePx > 0
      ? options.rootFontSizePx
      : MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX;

  if (typeof input !== "string") {
    return {
      raw: "",
      normalized: "",
      status: "unparsed",
      widthRelevant: false,
      disjunction: false,
      alternatives: [
        {
          raw: "",
          normalized: "",
          status: "unparsed",
          qualifier: undefined,
          mediaType: undefined,
          screenApplicable: true,
          bounds: [],
          interval: undefined,
          features: [],
          reason: "condition is not a string",
        },
      ],
      bounds: [],
      interval: undefined,
      rootFontSizePx,
      notes: [],
      reason: "condition is not a string",
    };
  }

  const normalized = normalizeCondition(input);
  const notes: string[] = [];

  if (normalized === "") {
    return {
      raw: input,
      normalized,
      status: "unparsed",
      widthRelevant: false,
      disjunction: false,
      alternatives: [
        {
          raw: input,
          normalized,
          status: "unparsed",
          qualifier: undefined,
          mediaType: undefined,
          screenApplicable: true,
          bounds: [],
          interval: undefined,
          features: [],
          reason: "empty condition",
        },
      ],
      bounds: [],
      interval: undefined,
      rootFontSizePx,
      notes: [],
      reason: "empty condition",
    };
  }

  const rawAlternatives = splitTopLevel(normalized, ",");
  const alternatives: MediaConditionAlternative[] =
    rawAlternatives === undefined
      ? [
          {
            raw: input,
            normalized,
            status: "unparsed",
            qualifier: undefined,
            mediaType: undefined,
            screenApplicable: true,
            bounds: [],
            interval: undefined,
            features: [],
            reason: `unbalanced parentheses in '${normalized}'`,
          },
        ]
      : rawAlternatives.map((part) => parseAlternative(part, rootFontSizePx, notes));

  const disjunction = alternatives.length > 1;
  if (disjunction) {
    notes.push(
      `comma list is a disjunction of ${alternatives.length} alternatives; no single interval`,
    );
  }

  let status: MediaConditionStatus;
  let reason: string | undefined;
  const unparsed = alternatives.find((a) => a.status === "unparsed");
  const unsupported = alternatives.find((a) => a.status === "unsupported");
  if (unparsed !== undefined) {
    status = "unparsed";
    reason = unparsed.reason;
  } else if (unsupported !== undefined) {
    // Err toward unsupported: one branch we cannot represent poisons the list.
    status = "unsupported";
    reason = unsupported.reason;
  } else if (alternatives.some((a) => a.bounds.length > 0)) {
    status = "width";
    reason = undefined;
  } else {
    status = "width-irrelevant";
    reason = alternatives[0]?.reason ?? "no width feature";
  }

  const single = !disjunction && status === "width" ? alternatives[0] : undefined;

  return {
    raw: input,
    normalized,
    status,
    widthRelevant: status === "width",
    disjunction,
    alternatives,
    bounds: single?.bounds ?? [],
    interval: single?.interval,
    rootFontSizePx,
    notes: [...new Set(notes)].sort(),
    reason,
  };
}

function tallyOf(entry: MediaConditionTally): { condition: MediaConditionResult; count: number } {
  if ("condition" in entry) {
    const raw = entry.count;
    const count =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
    return { condition: entry.condition, count };
  }
  return { condition: entry, count: 1 };
}

/**
 * Folds parsed conditions into a sorted breakpoint histogram.
 *
 * Bounds are harvested from every screen-applicable, SATISFIABLE alternative,
 * so a disjunction contributes each of its branches. Within one condition a
 * given `(px, kind)` pair is counted at most once.
 *
 * Two classes of alternative are deliberately skipped, each with its own
 * counter so the skip is never silent:
 *  - not screen-applicable (`print and (min-width: 900px)`) → `nonScreenSkippedCount`
 *  - unsatisfiable (`(min-width: 64px) and (max-width: 32px)`) → `emptyIntervalCount`
 * An unsatisfiable alternative matches no width at all, so folding its two
 * bounds in would hand a consumer two snap targets for a layout change that
 * never happens.
 *
 * The four status counters partition the input, with precedence
 * unparsed > unsupported > width > width-irrelevant. `unparsedCount` is the
 * point of the whole thing: it lets a caller distinguish "the source authored
 * no breakpoints" vs. "we could not read its breakpoints".
 *
 * TWO VIEWS OF THE SAME FOLD. `entries` is keyed on `(px, kind)` — what the
 * source literally wrote. `boundaries` is keyed on `{below, above}` — WHERE the
 * layout changes, so `(max-width: 1024px)` and `(min-width: 1025px)` are one
 * row, not two one pixel apart. Both are computed from the same bounds in the
 * same pass and their weights agree by construction; see
 * {@link MediaBreakpointBoundaryEntry} for which one a band-edge snapper wants.
 */
export function foldMediaBreakpoints(
  conditions: Iterable<MediaConditionTally>,
): MediaBreakpointHistogram {
  const buckets = new Map<string, { px: number; kind: MediaWidthBoundKind; count: number }>();
  /**
   * The boundary view, keyed on `below|above` so that the `max` spelling and
   * the `min` spelling of ONE authored change share a row. Deduped per
   * condition on its own key, exactly like `seen` below: a condition that names
   * the same boundary from both sides (`(min-width: 900px) and (width >= 900px)`)
   * still weighs once.
   */
  const boundaryBuckets = new Map<
    string,
    { below: number; above: number; count: number; minCount: number; maxCount: number }
  >();
  let totalCount = 0;
  let widthCount = 0;
  let widthIrrelevantCount = 0;
  let unsupportedCount = 0;
  let unparsedCount = 0;
  let disjunctionCount = 0;
  let deviceWidthCount = 0;
  let nonScreenSkippedCount = 0;
  let emptyIntervalCount = 0;

  for (const entry of conditions) {
    const { condition, count } = tallyOf(entry);
    totalCount += count;
    if (condition.disjunction) disjunctionCount += count;

    if (condition.status === "unparsed") {
      unparsedCount += count;
      continue;
    }
    if (condition.status === "unsupported") {
      unsupportedCount += count;
      continue;
    }

    const seen = new Set<string>();
    const seenBoundaries = new Set<string>();
    let sawDeviceWidth = false;
    for (const alternative of condition.alternatives) {
      if (alternative.status !== "width") continue;
      if (!alternative.screenApplicable) {
        nonScreenSkippedCount += count;
        continue;
      }
      if (alternative.interval?.empty === true) {
        // No width satisfies it, so it names no layout change. Counted, never
        // folded: two phantom entries here become two wrong pixels downstream.
        emptyIntervalCount += count;
        continue;
      }
      for (const bound of alternative.bounds) {
        const key = `${bound.breakpointPx}|${bound.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (bound.deviceWidth) sawDeviceWidth = true;
        const bucket = buckets.get(key);
        if (bucket === undefined) {
          buckets.set(key, { px: bound.breakpointPx, kind: bound.kind, count });
        } else {
          bucket.count += count;
        }

        // …and the same bound folded onto its BOUNDARY, where the `max` and the
        // `min` spelling of one change meet. Keyed on `below` alone would do,
        // since `above === below + 1` by construction, but the pair is written
        // out so the key cannot drift away from what the entry reports.
        const boundaryKey = `${bound.boundary.below}|${bound.boundary.above}`;
        if (seenBoundaries.has(boundaryKey)) continue;
        seenBoundaries.add(boundaryKey);
        const boundaryBucket = boundaryBuckets.get(boundaryKey);
        if (boundaryBucket === undefined) {
          boundaryBuckets.set(boundaryKey, {
            below: bound.boundary.below,
            above: bound.boundary.above,
            count,
            minCount: bound.kind === "min" ? count : 0,
            maxCount: bound.kind === "max" ? count : 0,
          });
        } else {
          boundaryBucket.count += count;
          if (bound.kind === "min") boundaryBucket.minCount += count;
          else boundaryBucket.maxCount += count;
        }
      }
    }

    if (seen.size > 0) {
      widthCount += count;
      if (sawDeviceWidth) deviceWidthCount += count;
    } else {
      widthIrrelevantCount += count;
    }
  }

  const entries = [...buckets.values()]
    .map((b) => ({ px: b.px, kind: b.kind, count: b.count }))
    .sort((a, b) => (a.px !== b.px ? a.px - b.px : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const boundaries = [...boundaryBuckets.values()]
    .map((b) => ({
      below: b.below,
      above: b.above,
      count: b.count,
      minCount: b.minCount,
      maxCount: b.maxCount,
    }))
    .sort((a, b) => a.below - b.below);

  return {
    entries,
    boundaries,
    totalCount,
    widthCount,
    widthIrrelevantCount,
    unsupportedCount,
    unparsedCount,
    disjunctionCount,
    deviceWidthCount,
    nonScreenSkippedCount,
    emptyIntervalCount,
  };
}
