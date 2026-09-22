/**
 * Authored viewport breakpoints, per viewport of one page (Task 28.6 — Lane W2).
 *
 * The Observer records, on each element, the layout-critical authored
 * declarations the browser matched to it, each carrying the grouping rules it
 * sat inside: `@media`, `@supports`, `@container`, `@layer`. Until now nothing
 * read those condition strings — the reconstruction engine inferred responsive
 * bands from measured geometry alone and never once asked the source where IT
 * said the layout changes. This module asks.
 *
 * It answers with one histogram per viewport: every distinct authored `@media`
 * condition, weighted by how many matched declarations sit under it, folded
 * through {@link foldMediaBreakpoints} into whole-pixel snap targets.
 *
 * THREE RULES IT DOES NOT BEND
 *
 * 1. `@container` is not a viewport.
 *    A container query gates on an ELEMENT's box, not the window's. A
 *    declaration inside one changes at a width that depends on where its
 *    container sits in the layout, so its enclosing `@media` value is not a
 *    reliable viewport band edge. Such declarations are excluded from the
 *    histogram and counted in `containerGatedSkippedDeclarations`. Nothing from
 *    a `container` string is ever parsed as a media condition.
 *
 * 2. A gated declaration is not an unconditional one.
 *    Pre-28.6 the collector recorded `@supports` / `@container` / `@layer`
 *    bodies as if they were unconditional. `unconditionalDeclarations` counts
 *    ONLY declarations with no `media`, no `supports` and no `container` at
 *    all, so that old lie cannot be reconstructed from these numbers.
 *
 * 3. `@supports` gates on a FEATURE, not a size.
 *    `@supports (display: grid) { @media (min-width: 900px) { … } }` really
 *    does change the layout at 900 on every engine that has grid. It is folded,
 *    and counted in `supportsScopedDeclarations` so a caller can tell.
 *
 * Everything skipped is counted. A caller can always reconstruct
 * `declarationsExamined` from the parts, which is the point: "this page
 * authored no breakpoints" and "we could not read this page's breakpoints" must
 * never look the same.
 *
 * Pure and deterministic: conditions are parsed in sorted order, the histogram
 * is sorted, and the two diagnostic string arrays are deduped and sorted. No
 * I/O, no clock.
 */

import {
  MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX,
  foldMediaBreakpoints,
  parseMediaCondition,
  type MediaConditionResult,
} from "./media-condition.js";
import type { AuthoredBreakpoints } from "./types.js";

/**
 * The subset of an observed authored declaration this module reads.
 *
 * Structural on purpose: `MatchedLayoutRule` satisfies it, and so does any
 * future carrier of the same four grouping fields, without this module having
 * to know about `property` / `value` / `selector`.
 */
export interface AuthoredLayoutScope {
  /** Enclosing `@media` condition text (nested conditions joined with `" and "`). */
  readonly media?: string;
  /** Enclosing `@supports` condition text. Gates on a feature, not a size. */
  readonly supports?: string;
  /** Enclosing `@container` query text. NEVER a viewport width. */
  readonly container?: string;
  /** Enclosing `@layer` name chain. Affects cascade order only, never applicability. */
  readonly layer?: string;
  /** `"fetched"` means the sheet text was recovered from the network, not the CSSOM. */
  readonly origin?: "cssom" | "fetched";
}

/** A node that may carry authored declarations. `ElementSpecNode` satisfies it. */
export interface AuthoredLayoutBearingNode {
  readonly authoredLayout?: readonly AuthoredLayoutScope[];
  readonly authoredLayoutTruncated?: boolean;
}

export interface ComputeAuthoredBreakpointsOptions {
  /**
   * Root font size used to convert `em` / `rem` breakpoints. Defaults to
   * {@link MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX}; the observation does not
   * record the real one, so the assumption is carried in the output rather than
   * hidden.
   */
  readonly rootFontSizePx?: number;
}

/** A non-empty string after trimming, or `undefined`. */
function scopeText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Fold every authored `@media` condition on these nodes into one viewport
 * breakpoint histogram.
 *
 * Returns `undefined` only when the nodes carry NO authored declarations at all
 * AND nothing was truncated — the honest answer for a viewport whose stylesheets
 * were never readable, and the reason the SiteSpec field is optional.
 *
 * Two cases deliberately do NOT collapse into that `undefined`:
 *  - A viewport that HAS authored declarations but no `@media` among them gets a
 *    record with zero entries and a non-zero `declarationsExamined`.
 *  - A viewport whose every node had its authored-declaration list truncated to
 *    nothing gets a record with `declarationsExamined === 0` and a non-zero
 *    `truncatedNodeCount`. Returning `undefined` there would discard the one
 *    fact that separates the page authoring no breakpoint at all from this
 *    module truncating away every breakpoint the page authored, and would make
 *    the handoff rule `absent means recovered nothing` false for that input.
 *    Latent at the observer's
 *    current default cap of 32 declarations per node, which never truncates to
 *    zero, but the collector's cap is not this module's invariant to assume.
 */
export function computeAuthoredBreakpoints(
  nodes: Iterable<AuthoredLayoutBearingNode>,
  options: ComputeAuthoredBreakpointsOptions = {},
): AuthoredBreakpoints | undefined {
  const rootFontSizePx =
    typeof options.rootFontSizePx === "number" &&
    Number.isFinite(options.rootFontSizePx) &&
    options.rootFontSizePx > 0
      ? options.rootFontSizePx
      : MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX;

  /** raw (trimmed) condition text → how many matched declarations sit under it. */
  const rawWeights = new Map<string, number>();
  let declarationsExamined = 0;
  let mediaScopedDeclarations = 0;
  let foldedDeclarations = 0;
  let unconditionalDeclarations = 0;
  let containerScopedDeclarations = 0;
  let supportsScopedDeclarations = 0;
  let layerScopedDeclarations = 0;
  let containerGatedSkippedDeclarations = 0;
  let fetchedOriginDeclarations = 0;
  let truncatedNodeCount = 0;

  for (const node of nodes) {
    if (node.authoredLayoutTruncated === true) truncatedNodeCount += 1;
    for (const declaration of node.authoredLayout ?? []) {
      declarationsExamined += 1;
      if (declaration.origin === "fetched") fetchedOriginDeclarations += 1;
      if (scopeText(declaration.layer) !== undefined) layerScopedDeclarations += 1;

      const container = scopeText(declaration.container);
      const supports = scopeText(declaration.supports);
      const media = scopeText(declaration.media);
      if (container !== undefined) containerScopedDeclarations += 1;
      if (supports !== undefined) supportsScopedDeclarations += 1;

      if (media === undefined) {
        // Rule 2: only a declaration with NO gate of any kind is unconditional.
        if (container === undefined && supports === undefined) {
          unconditionalDeclarations += 1;
        }
        continue;
      }
      mediaScopedDeclarations += 1;
      if (container !== undefined) {
        // Rule 1: its width is its container's, not the viewport's.
        containerGatedSkippedDeclarations += 1;
        continue;
      }
      rawWeights.set(media, (rawWeights.get(media) ?? 0) + 1);
      foldedDeclarations += 1;
    }
  }

  // A truncated node list is evidence, not absence: see the doc comment above.
  if (declarationsExamined === 0 && truncatedNodeCount === 0) return undefined;

  // Parsed in sorted order. MEASURED HONESTY NOTE (Task 28.6 Wave 3, V-item):
  // deleting this sort changes NOTHING observable today, and 200 random
  // permutations of a 10-condition node — including unparsed, unsupported and
  // disjunction cases — fold byte-identically with and without it. The output is
  // order-independent BY CONSTRUCTION, not because of this line: `byNormalized`
  // is keyed, `histogram.entries` / `histogram.boundaries` are sorted by px, and
  // both diagnostic string arrays are sorted after a flatMap. The sort is kept as
  // a DEFENSIVE measure — it fixes which raw spelling's `MediaConditionResult`
  // becomes the group representative, so a future field that surfaces anything
  // from that representative (its `raw`, its `notes`) is deterministic on the day
  // it is added rather than a day later. It is not the guarantee; the guarantee
  // is pinned by the permutation check in smoke-sitespec §28.6-W2.6.
  const rawByWeight = [...rawWeights.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  // Keyed on the PARSER's normalized form, never the raw text. `(max-width: 640px)`,
  // `(MAX-WIDTH: 640px)` and `(max-width:640px)` are ONE authored breakpoint spelled
  // three ways; keying on the raw string reported `distinctConditions: 3` for it and
  // overstated how much the source actually said. The spellings are not thrown away:
  // `distinctRawConditions` counts them, and a spelling that failed to parse is still
  // named individually in `unparsedConditions` / `unsupportedConditions` so a caller
  // can go find that exact text in the stylesheet.
  const byNormalized = new Map<
    string,
    { result: MediaConditionResult; count: number; rawForms: string[] }
  >();
  for (const [raw, weight] of rawByWeight) {
    const result = parseMediaCondition(raw, { rootFontSizePx });
    const existing = byNormalized.get(result.normalized);
    if (existing === undefined) {
      byNormalized.set(result.normalized, { result, count: weight, rawForms: [raw] });
    } else {
      // The weight is carried over, never recomputed and never defaulted: every
      // declaration counted in the loop reaches exactly one histogram entry.
      existing.count += weight;
      existing.rawForms.push(raw);
    }
  }
  const folded = [...byNormalized.values()];
  const histogram = foldMediaBreakpoints(
    folded.map(({ result, count }) => ({ condition: result, count })),
  );

  const unparsedConditions = folded
    .filter(({ result }) => result.status === "unparsed")
    .flatMap(({ rawForms }) => rawForms)
    .sort();
  const unsupportedConditions = folded
    .filter(({ result }) => result.status === "unsupported")
    .flatMap(({ rawForms }) => rawForms)
    .sort();

  return {
    entries: histogram.entries.map((entry) => ({
      px: entry.px,
      kind: entry.kind,
      count: entry.count,
    })),
    // The same fold keyed on the authored CHANGE rather than on the pixel a
    // bound happens to name, so `(max-width: 1024px)` and `(min-width: 1025px)`
    // are ONE breakpoint here and two in `entries`. This is the view a band-edge
    // snapper wants; see `MediaBreakpointBoundaryEntry` for why both exist.
    boundaries: histogram.boundaries.map((entry) => ({
      below: entry.below,
      above: entry.above,
      count: entry.count,
      minCount: entry.minCount,
      maxCount: entry.maxCount,
    })),
    rootFontSizePx,
    declarationsExamined,
    distinctConditions: byNormalized.size,
    distinctRawConditions: rawWeights.size,
    mediaScopedDeclarations,
    foldedDeclarations,
    unconditionalDeclarations,
    containerScopedDeclarations,
    supportsScopedDeclarations,
    layerScopedDeclarations,
    containerGatedSkippedDeclarations,
    fetchedOriginDeclarations,
    truncatedNodeCount,
    widthDeclarations: histogram.widthCount,
    widthIrrelevantDeclarations: histogram.widthIrrelevantCount,
    unsupportedDeclarations: histogram.unsupportedCount,
    unparsedDeclarations: histogram.unparsedCount,
    disjunctionDeclarations: histogram.disjunctionCount,
    deviceWidthDeclarations: histogram.deviceWidthCount,
    nonScreenSkippedDeclarations: histogram.nonScreenSkippedCount,
    emptyIntervalSkippedDeclarations: histogram.emptyIntervalCount,
    unparsedConditions,
    unsupportedConditions,
  };
}
