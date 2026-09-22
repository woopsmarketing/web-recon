import {
  computeAuthoredBreakpoints,
  parseMediaCondition,
} from "../sitespec/index.js";
import { isSafeCssValue } from "./style-generator.js";
import {
  WIDTH_FAMILY_INITIAL_VALUES,
  WIDTH_FAMILY_PROPERTIES,
  contributingRecordNames,
  partitionInterval,
  pieceAt,
  planNodeWidthFamily,
  type PiecewisePlan,
  type WidthFamilyProperty,
} from "./responsive-decl/index.js";
import type {
  AuthoredBreakpointEntry,
  AuthoredBreakpoints,
  ElementSpecNode,
  PageSpec,
  ViewportPageSpec,
} from "../sitespec/index.js";

/**
 * Deterministic layout-rule inference (Task 17 §9) and its generated CSS tier
 * (§10).
 *
 * The exact-computed CSS is correct at the observed viewport and silently
 * wrong at every other one: a centered container arrives as
 * `width: 1080px; margin-left: 180px`, so at 1920px the clone is left-biased
 * where the original stays centered. This module re-derives the RESPONSIVE
 * meaning of a box from two observed evidence channels:
 *
 *   - the multi-width layout probe (§8): the same element's x/width at
 *     390/768/1024/1440/1920, with DOM-identity across widths;
 *   - the authored layout declarations (§7), used as supporting evidence.
 *
 * Rules are conjunctions of exact measurements with fixed pixel tolerances —
 * there is no similarity score and no AI anywhere. A node that satisfies no
 * rule keeps its exact computed style untouched (§10: recovery failing must
 * never fail the page).
 *
 * TRUTH-VIEWPORT SAFETY (Task 28.5B). An earlier revision of this docstring
 * claimed emitted rules "cannot regress the truth viewport by construction".
 * That claim was FALSE and is retracted: the 28.5A audit measured 349 of 1,910
 * recovered-rule nodes rendering FARTHER from their own observed box with the
 * rules than without, 0 closer, 98,613px of introduced width error. Nothing in
 * this module ever re-rendered anything; the `:152-160` sanity gate only
 * compared the probe against the deep observation BEFORE emitting.
 *
 * The guarantee is now MEASURED, in two layers, and neither is "by
 * construction":
 *
 *   1. Containing-block guards (below). `contentAt()` — parent border box minus
 *      the parent's horizontal padding and border — is the denominator both the
 *      full-width test and the percentage ratio stand on, and it is only the
 *      node's containing block when that containing block IS the parent's
 *      content box. It is NOT, for a grid item (containing block = the grid
 *      AREA), for a flex item whose used width comes from flex-basis/grow, or
 *      for an out-of-flow node whose containing block is some ancestor's
 *      padding box. Those classes are REFUSED rather than solved: this is not a
 *      CSS layout engine, and a refused node simply keeps its exact computed
 *      style, which is the module's existing failure mode.
 *   2. A post-emit browser truth check (`layout-truth-check.ts`), run by
 *      `generateApp()` on the real generation path: the emitted DOM plus the
 *      full generated stylesheet is rendered in Chromium at the truth viewport,
 *      once without the recovered tier and once with it, and any candidate whose
 *      node lands FARTHER than {@link TRUTH_SANITY_TOLERANCE_PX} from its
 *      observed truth rect *and* farther than it did without the rule is
 *      dropped. The manifest counts candidates, acceptances, and both refusal
 *      channels.
 *
 * Priority is encoded in specificity, not order:
 *   1. recovered rule      `[data-wr-page][data-wr-viewport] [data-wr-node]`
 *                          (0,3,0) — beats the exact class
 *   2. observed responsive `@media`-wrapped rules at the same specificity
 *   3. exact computed      `.wr-stXXXXXX` (0,1,0) — the unchanged fallback
 */

/** Tolerances and gates. Global constants, never per-site tuning. */
export const CENTER_GAP_TOLERANCE_PX = 2;
export const WIDTH_CONSTANT_TOLERANCE_PX = 1;
export const FULL_WIDTH_TOLERANCE_PX = 2;
export const TRUTH_SANITY_TOLERANCE_PX = 4;
export const PARENT_GROWTH_MIN_PX = 40;
export const PERCENTAGE_RATIO_TOLERANCE = 0.01;
export const TRUTH_WIDTH = 1440;

/**
 * Task 28.7 B2 — tolerance for matching a child box against a RUN of k
 * consecutive tracks. SEPARATE from {@link FULL_WIDTH_TOLERANCE_PX} on purpose.
 *
 * `FULL_WIDTH_TOLERANCE_PX` does double duty: it is the single-column match
 * tolerance AND the tiling tolerance. Loosening it to admit spans would loosen
 * COLUMN matching too, which turns a safe refusal into a wrong emitted track
 * list the truth check can still pass (the container's own border box is
 * unchanged by a track list). So the span role gets its own name.
 *
 * Its VALUE is deliberately the same 2px: a run's expected width is a sum of
 * Chromium's own serialized used track sizes plus (k−1) serialized gaps, all of
 * which carry sub-pixel precision, so the accumulated error over a run is still
 * sub-pixel and nothing needs loosening. The constant exists so the two roles
 * can move independently if a measurement ever says one of them should — not
 * because this one is looser today.
 */
export const GRID_SPAN_TOLERANCE_PX = 2;

/**
 * Task 28.7 B1 — the residual freeze audit's thresholds and bounds.
 *
 * A node is a RESIDUAL when the SOURCE's own geometry moves across the observed
 * widths and the clone's does not, because that is the exact shape of "recovery
 * declined and the 1440-resolved px shipped anyway". Both halves are measured:
 * the source half from the probe, the clone half from a real render.
 */
export const RESIDUAL_SOURCE_CHANGE_MIN_PX = 8;
/** …and "the clone did not move" means it moved no more than this. */
export const RESIDUAL_CLONE_CONSTANT_PX = 2;
/**
 * Audit candidates carried per page × viewport. Ranked by source movement
 * before the cut, and whatever the cut drops is counted, never silent.
 */
export const RESIDUAL_AUDIT_MAX_NODES_PER_PASS = 1200;
/** Extra render widths the audit may add per pass, beyond the truth width. */
export const RESIDUAL_AUDIT_MAX_WIDTHS = 4;
/** Residual records serialized per ROUTE, ranked. The rest are counted. */
export const RESIDUAL_FROZEN_REPORTED = 24;
/** Per-node grid-track refusal records serialized per ROUTE, ranked. */
export const GRID_TRACK_REFUSALS_REPORTED = 24;
/**
 * The width the MOBILE deep observation was taken at (Task 28.6 C2b).
 *
 * The counterpart of {@link TRUTH_WIDTH} for the mobile tree: the one width at
 * which that tree's `boundingBox` values are an observation rather than an
 * inference, and therefore the only width its truth-sanity gate can anchor on.
 * A caller whose corpus used a different mobile endpoint passes
 * `InferLayoutInput.mobileTruthWidth`; a mismatch is never papered over, it
 * refuses the pass with `truth-width-not-probed`.
 */
export const MOBILE_TRUTH_WIDTH = 390;

export type RecoveredRuleKind =
  | "centered-max-width"
  | "full-width"
  | "percentage-width"
  | "responsive-hidden"
  /**
   * Task 28.6 A5 — the grid container's COLUMN TRACKS, re-expressed from the
   * observed child geometry. Chromium serializes `grid-template-columns` as the
   * USED track sizes in px, so the exact tier freezes `2fr repeat(4, 1fr)` into
   * `448px 224px 224px 224px 224px` and the row overflows every viewport the
   * container is narrower in. See {@link recoverGridTracks}.
   */
  | "grid-track-columns"
  /**
   * Task 28.75 §03b — the same statement, made ONE AUTHORED BAND AT A TIME.
   *
   * A grid whose column COUNT changes at a breakpoint has no single track list,
   * so `grid-track-columns` refuses it `tracks-not-reproducible-at-every-width`
   * and the frozen used pixels ship. This kind carries one `grid-template-columns`
   * (and the `column-gap` its `fr` weights are shares against) per measured band,
   * inside the `@media` machinery `responsive-hidden` already uses. See
   * {@link recoverGridTracksBanded}.
   */
  | "grid-track-columns-banded"
  /**
   * Task 28.7 G — the frozen used `width` of an OUT-OF-FLOW box whose inline
   * insets are both definite, restated as `width: auto`.
   *
   * This is not a new inference: it is the browser's own equation read
   * backwards. For an absolutely or fixed positioned box with `left` and
   * `right` both definite and `width: auto`, CSS solves
   * `width = containingBlock − left − right − margins`, and the px number the
   * exact tier froze is that equation's answer at the truth viewport. Restating
   * it as `auto` hands the equation back to the browser, which then re-solves it
   * at every width. See {@link insetResolvedWidth}.
   */
  | "inset-resolved-width"
  /**
   * Task 28.75 — the frozen used `width` of an IN-FLOW BLOCK box that was
   * observed absorbing the whole of its parent's growth, restated as
   * `width: auto`.
   *
   * The in-flow counterpart of `inset-resolved-width`, and the largest chain-root
   * class on all four canary corpora. The existing `full-width` branch cannot
   * reach these boxes because it needs the parent's padding as ONE number and
   * these parents pad differently per authored band; the gap between the two
   * border boxes is measured instead, and required to be constant across real
   * parent growth and to decompose into the exact tier's own box model at the
   * truth width. See {@link trackedFillWidth}.
   */
  | "tracked-fill-width"
  /**
   * Task 28.75 — the frozen used geometry of an IN-FLOW FULL-BLEED band,
   * restated as `width: 100vw` with `margin-inline: calc(50% - 50vw)`.
   *
   * The exact tier freezes all three halves of the idiom at once —
   * `width: 1440px; margin-left: -720px; left: 672px` — so restating any ONE of
   * them is a regression (28.7 measured a NEW 240px overhang at 1920). The kind
   * exists to CO-EMIT the whole set. See {@link viewportBleedWidth}.
   */
  | "viewport-bleed-width"
  /**
   * Task 28.75 §19 — THE DAMAGE CLAMP, and the only kind here that is not a
   * recovered relation.
   *
   * `max-width: 100%` on a box the module can PROVE is damaged — the source's
   * own border box never left its parent's, and the frozen pixel makes the
   * clone's leave it by a material amount — and for which no branch could
   * re-derive an authored relation. It claims nothing about the authored CSS.
   * See {@link damageClampWidth}.
   */
  | "damage-clamped-width"
  /**
   * Task 28.75 §03b — the frozen used `width` of a GRID ITEM whose own box was
   * observed filling its grid AREA at every width, restated as `width: auto`
   * with `min-width: 0`.
   *
   * The companion of `grid-track-columns`: recovering a container's tracks makes
   * the AREA responsive, and this makes the item follow it. Without it the
   * container renders a correct 1008px track at 1100px and its item still
   * renders the frozen 1344px inside it. See {@link gridAreaFillWidth}.
   */
  | "grid-area-fill-width"
  /**
   * TASK 28.8 A2 — the source's OWN authored inline-size declarations, re-emitted
   * for a node no measurement branch could answer for.
   *
   * The only kind here that is not derived from probe geometry. It stands on
   * `ElementSpecNode.authoredLayout` — the declarations the browser matched to
   * this element — and it is deliberately the LAST thing tried, so it can never
   * displace a relation the observation proved. See
   * {@link authoredInlineSizeIntent}.
   */
  | "authored-inline-size"
  /**
   * Responsive Core P0 §C2.4/§C2.5 (REC-I2) — one PIECE of a node's width-family
   * OWNERSHIP plan: the Cascade-5 winner of the source's own sheet + inline
   * declarations for all six width-family properties over one sub-interval of
   * the served tree interval, written explicitly (initial values included).
   * Rules of one node share a {@link RecoveredLayoutRule.planGroup} and are
   * verified and accepted TOGETHER (two-phase verification), never one by one.
   * See {@link offerOwnedWidthFamilyPlan}.
   */
  | "responsive-owned";

/**
 * Task 28.6 R1/R3 — one hidden band, as NUMBERS before it becomes a media string.
 *
 * The band edges are kept numeric and separate from their `@media` spelling for
 * two reasons:
 *
 *  1. The post-emit truth check has to RENDER the rule inside its own active
 *    range (`verifyWidth`). Parsing that width back out of a media string would
 *    be a second, divergent source of truth.
 *  2. Task 28.6 D1 snaps these edges to breakpoints the source site actually
 *    authored — a pure function over `{minWidth, maxWidth}` applied between
 *    {@link hiddenBands} and {@link bandMedia}. See {@link snapBandEdges}.
 *
 * An absent edge is an OPEN one, and that is load-bearing rather than a default:
 * see {@link hiddenBands} for the off-by-one it replaces.
 */
export interface HiddenBand {
  /** Inclusive lower edge, CSS px. Absent = open downward. */
  minWidth?: number;
  /**
   * Upper edge, CSS px, EXCLUSIVE — emitted as `max-width: (maxWidth - 0.02)px`
   * so the band and the next one cannot both match a fractional viewport width.
   * Absent = open upward.
   */
  maxWidth?: number;
  /** The desktop probe widths inside this band. Every one was observed HIDDEN. */
  hiddenSamples: number[];
  /**
   * The width the truth check renders at to see this rule ACTIVE. Always one of
   * `hiddenSamples` — a width the probe really measured on the source page, so
   * the expected visibility there is observed rather than interpolated.
   */
  verifyWidth: number;
  /**
   * Task 28.6 D1 — THE TWO OBSERVED PROBE WIDTHS THAT BRACKET {@link minWidth}.
   *
   * `[visibleSample, hiddenSample]`: the probe measured the node VISIBLE at the
   * first and HIDDEN at the second, and nothing at all in between. The true
   * lower edge therefore lies in `(visibleSample, hiddenSample]` and the
   * midpoint is one guess inside that interval, not a measurement. Present iff
   * `minWidth` is; absent when the band is open downward, where there is no
   * lower neighbour and so no interval to snap inside.
   */
  lowerBracket?: readonly [number, number];
  /**
   * Task 28.6 D1 — the same for {@link maxWidth}: `[hiddenSample, visibleSample]`,
   * with the true upper edge in `(hiddenSample, visibleSample]`. Present iff
   * `maxWidth` is.
   */
  upperBracket?: readonly [number, number];
  /**
   * Task 28.6 D1 — how each PRESENT edge got the number it ships with. Written
   * by {@link snapBandEdges}; absent on a band that has not been through it, so
   * "not snapped" and "never offered a histogram" cannot look the same.
   */
  edgeDecisions?: readonly BandEdgeDecision[];
}

export interface RecoveredLayoutRule {
  pageId: string;
  /**
   * Task 28.6 C2b — WHICH OF THE TWO TREES this rule is about.
   *
   * The generated document mounts both variants and `globals.css` shows one at a
   * time, so a rule aimed at the wrong wrapper is either dead CSS or, worse,
   * applied to a node id that exists in both trees and means different things in
   * each. Optional only so that fixtures written before this field still
   * type-check; ABSENT IS READ AS `"desktop"`, which is what every rule emitted
   * before this field was. `inferLayoutRules()` always sets it explicitly.
   */
  viewportId?: LayoutViewportId;
  nodeId: string;
  kind: RecoveredRuleKind;
  declarations: Record<string, string>;
  /** Present for responsive-hidden rules (the @media condition). */
  media?: string;
  /**
   * The numeric form of {@link media}. Present on every rule this module emits
   * with a `media`; a rule carrying `media` but no `band` cannot be verified
   * inside its own range and the truth check rejects it rather than shipping it.
   */
  band?: HiddenBand;
  /** Named measurements the rule stood on. */
  evidence: string[];
  /**
   * The node's OBSERVED truth-viewport box (deep observation, not the probe).
   * Carried on the rule so the post-emit truth check has something to compare a
   * re-render against without re-opening the SiteSpec. Absent only when the
   * node had no bounding box, which the sanity gate already forbids.
   */
  truth?: { x: number; w: number };
  /**
   * Task 28.6 A5 — OTHER nodes this rule answers for, with their observed truth
   * rects.
   *
   * A `grid-track-columns` rule changes the container's INNER geometry and not
   * the container's own box, so re-rendering the container alone would accept
   * any track list at all. The witnesses are the boxes the rule actually moves —
   * its grid items — and the truth check measures them exactly as it measures
   * {@link truth}. Absent on every kind whose effect is confined to its own box.
   */
  witnesses?: {
    nodeId: string;
    x: number;
    w: number;
    /**
     * P0 contract C2.1 — the witness node's own source probe boxes inside the
     * rule's {@link RecoveredLayoutRule.servedInterval}, same shape and same
     * provenance as {@link RecoveredLayoutRule.samples}. Absent = no evidence.
     */
    samples?: IntervalSample[];
  }[];
  /**
   * P0 contract C2.1 — the served interval this rule is live on: the viewport
   * tree's range from the pass breakpoint (desktop `[bp, ∞)`, mobile `[0, bp)`)
   * intersected with {@link band} when there is one. `max` is exclusive and may
   * be `Infinity`. Absent on rules built before C2.1 (or when no probe evidence
   * could be attached) — the truth check then behaves exactly as it did.
   */
  servedInterval?: ServedInterval;
  /**
   * P0 contract C2.1 — the source probe box of this rule's node at EVERY probe
   * width inside {@link servedInterval}, straight from `node.probe` indexed by
   * the pass's own probe width list. Never interpolated. Absent = no evidence.
   */
  samples?: IntervalSample[];
  /**
   * REC-I2 — `pageId:viewportId:nodeId` of the ownership plan this
   * `responsive-owned` piece belongs to. Present only on that kind.
   */
  planGroup?: string;
  /** REC-I2 — the piece's own sub-interval of {@link servedInterval}. */
  pieceInterval?: ServedInterval;
}

/**
 * REC-I2 — one node's width-family ownership plan, as offered to two-phase
 * verification. The rules themselves are in `LayoutInferenceResult.rules`
 * (kind `responsive-owned`, same `planGroup`); this record carries what the
 * verifier needs beyond them.
 */
export interface OwnedPlanOffer {
  planGroup: string;
  pageId: string;
  viewportId: LayoutViewportId;
  nodeId: string;
  tagName: string;
  /** The tree's served interval the pieces tile exactly. */
  servedInterval: ServedInterval;
  /** The probe width the deep observation was taken at (inside the interval). */
  truthWidth: number;
  /** Observed truth box (deep observation). */
  truth: { x: number; w: number };
  /** The node's source probe boxes at every probe width inside the interval. */
  samples: IntervalSample[];
  /** Element children with probe samples — the co-damage guard's witnesses. */
  children: { nodeId: string; samples: IntervalSample[] }[];
  /** Review fix (MAJOR-2) — the owner's element parent (runtime tree id). */
  parentNodeId?: string;
  /**
   * Review fix (MAJOR-2) — co-damage witnesses beyond the children: the parent
   * and the element siblings that carry a visible sample in the interval.
   * Phase B adds the phase-A rule nodes in the parent's subtree.
   */
  witnesses?: { nodeId: string; samples: IntervalSample[] }[];
  /** Number of `responsive-owned` rules (pieces) emitted for this group. */
  pieces: number;
  /** property → provenance class → piece count (`authored-sheet`, `frozen-UA`, `initial`, …). */
  provenanceByProperty: Record<string, Record<string, number>>;
}

/** P0 contract C2.1 — `[min, max)` in CSS px; `max` may be `Infinity`. */
export interface ServedInterval {
  min: number;
  max: number;
}

/**
 * P0 contract C2.1 — one source probe box: viewport-relative border-box `x`
 * and width `w` (`getBoundingClientRect()` at scroll 0) and visibility `v` at
 * probe width `width`.
 */
export interface IntervalSample {
  width: number;
  x: number;
  w: number;
  v: 0 | 1;
}

/**
 * P0 contract C2.1 — the interval a rule is served on. Pure.
 *
 * Tree range first — desktop `[breakpoint, ∞)`, mobile `[0, breakpoint)`, the
 * same split `resolveViewportProbe()` and `globals.css` use — then the band's
 * own `[minWidth, maxWidth)`. `undefined` when the intersection is empty (the
 * rule could never apply to a displayed tree, so there is nothing to sample).
 */
export function ruleServedInterval(
  viewportId: LayoutViewportId,
  breakpoint: number,
  band?: Pick<HiddenBand, "minWidth" | "maxWidth">,
): ServedInterval | undefined {
  let min = viewportId === "desktop" ? breakpoint : 0;
  let max = viewportId === "desktop" ? Number.POSITIVE_INFINITY : breakpoint;
  if (band?.minWidth !== undefined) min = Math.max(min, band.minWidth);
  if (band?.maxWidth !== undefined) max = Math.min(max, band.maxWidth);
  if (!(min < max)) return undefined;
  return { min, max };
}

/**
 * P0 contract C2.1 — a node's probe boxes at every probe width inside
 * `interval`. Pure. A width whose arrays carry no entry is skipped, never
 * filled in.
 */
export function probeSamplesInInterval(
  probe: { x: readonly number[]; w: readonly number[]; v: readonly number[] },
  widths: readonly number[],
  interval: ServedInterval,
): IntervalSample[] {
  const out: IntervalSample[] = [];
  for (let i = 0; i < widths.length; i++) {
    const width = widths[i]!;
    if (!(width >= interval.min && width < interval.max)) continue;
    const x = probe.x[i];
    const w = probe.w[i];
    const v = probe.v[i];
    if (x === undefined || w === undefined || v === undefined) continue;
    out.push({ width, x, w, v: v === 1 ? 1 : 0 });
  }
  return out.sort((a, b) => a.width - b.width);
}

/**
 * P0 contract C2.1 — attach `servedInterval` + `samples` (and witness samples)
 * to the rules one page emitted. Additive: it never changes a rule's
 * declarations, kind, band or truth, and a rule whose pass has no attached
 * probe simply gets nothing (explicit absent evidence).
 */
export function attachIntervalSamples(
  page: PageSpec,
  pageRules: readonly RecoveredLayoutRule[],
  breakpoint: number,
): void {
  for (const viewportId of LAYOUT_VIEWPORT_IDS) {
    const probeInfo =
      viewportId === "desktop" ? page.layoutProbe : page.layoutProbeMobile;
    const viewport = page.viewports[viewportId];
    if (probeInfo === undefined || viewport === undefined) continue;
    let nodeById: Map<string, ElementSpecNode> | undefined;
    for (const rule of pageRules) {
      if (rule.pageId !== page.pageId) continue;
      if ((rule.viewportId ?? "desktop") !== viewportId) continue;
      const interval = ruleServedInterval(viewportId, breakpoint, rule.band);
      if (interval === undefined) continue;
      if (nodeById === undefined) {
        nodeById = new Map();
        for (const node of viewport.nodes) {
          if (node.type === "element") nodeById.set(node.nodeId, node);
        }
      }
      const node = nodeById.get(rule.nodeId);
      if (node?.probe === undefined) continue;
      rule.servedInterval = interval;
      rule.samples = probeSamplesInInterval(node.probe, probeInfo.widths, interval);
      for (const witness of rule.witnesses ?? []) {
        const witnessNode = nodeById.get(witness.nodeId);
        if (witnessNode?.probe === undefined) continue;
        witness.samples = probeSamplesInInterval(
          witnessNode.probe,
          probeInfo.widths,
          interval,
        );
      }
    }
  }
}

/**
 * Why a containing-block guard refused a node (Task 28.5B).
 *
 * Every one of these means the same thing: the node's containing block is NOT
 * its parent's content box, so `contentAt()` is the wrong denominator and any
 * percentage or fills-parent conclusion drawn from it is arithmetic about a box
 * that does not exist. Refusing is the whole fix — see the module docstring.
 */
export type LayoutGuardReason =
  | "grid-item"
  | "flex-item-basis-governed"
  | "abs-containing-block-not-parent"
  | "abs-containing-block-is-padding-box"
  | "fixed-position"
  /**
   * Task 28.6 V2 — the parent's horizontal padding could not be read from its
   * computed style, so `contentAt()` cannot be formed at all. The pre-28.6 code
   * read this case as `?? 0`, which turned "I could not read the padding" into
   * "the padding is zero" and shipped a confident denominator that was too
   * large by exactly the padding. A refusal is the only honest answer.
   */
  | "parent-padding-unreadable"
  /**
   * TASK 28.6 C3 — the parent's horizontal padding is KNOWN NOT to be the same
   * at every width, and no measured content box was available to replace it.
   *
   * `contentAt()` reads the padding ONCE, from the truth-viewport computed
   * style, and treats it as a constant number of pixels. Linear.app authors
   * `padding-left: var(--page-padding-left)` and moves the responsive change into
   * the custom property under a media query, so the assumed constant is wrong by
   * +36px at 928/929/1024 and +72px at 1025/1100/1280 — against a 2px tolerance.
   * Where the parent's own authored declarations say the padding changes with the
   * viewport (a padding under `@media`, or one written in `vw`/`%`), the
   * denominator is not a measurement and the value derived from it is not either.
   * Guessing the custom property's value at an unobserved width is exactly what
   * this refuses to do.
   */
  | "parent-padding-not-constant";

export const LAYOUT_GUARD_REASONS: readonly LayoutGuardReason[] = [
  "grid-item",
  "flex-item-basis-governed",
  "abs-containing-block-not-parent",
  "abs-containing-block-is-padding-box",
  "fixed-position",
  "parent-padding-unreadable",
  "parent-padding-not-constant",
];

/**
 * TASK 28.6 C3 — WHAT HAPPENED TO EVERY NODE THAT REACHED THE INLINE-SIZE STAGE.
 *
 * THE DEFECT THIS MAKES VISIBLE. The three inline-size branches below — centered
 * max-width, capped fill, percentage — each end in a bare `continue` when their
 * predicate does not hold, and until now NOTHING counted those nodes. The
 * artifact therefore reported a handful of refusals over a population of
 * hundreds: gs.severance.healthcare shipped 184 recovered rules across 3,005
 * probed nodes — 2.8% carrying any inline-size rule — while `widthModeRefusals`
 * read 7 and `widthValueRefusals` 0. A reader could not tell "this generator
 * examined 3,000 boxes and could restate 85 of them" from "this generator found
 * almost nothing to examine", and those are opposite facts about the engine.
 *
 * These outcomes PARTITION the candidate population: exactly one is recorded per
 * candidate, and `sum(inlineSizeOutcomes) === inlineSizeCandidates` is asserted
 * in `smoke-layout-safety`. `no-branch-matched` is the number the defect hid.
 *
 * NOTE ON SCOPE. This funnel is about INLINE SIZE only. A node can emit a
 * `responsive-hidden` rule (a visibility statement) and still land in
 * `no-branch-matched` here, because nothing about its width was recoverable.
 */
export type InlineSizeOutcome =
  /** A `max-width` + auto margins rule was emitted (cap visibly engaged twice). */
  | "emitted-centered-max-width"
  /** …the same kind, from the capped-fill signature whose cap engages at one width. */
  | "emitted-centered-max-width-capped-fill"
  /** A `width` rule was emitted: the box fills its parent's content box everywhere. */
  | "emitted-full-width"
  /** A `width: N%` rule was emitted: a constant ratio of the parent's content box. */
  | "emitted-percentage-width"
  /**
   * Task 28.7 G — a `width: auto` rule was emitted for an out-of-flow box whose
   * observed border box equals `containingBlock − insets − margins` at EVERY
   * width its variant is displayed at. Reached only from an exit the
   * parent-relative branches had already refused. See {@link insetResolvedWidth}.
   */
  | "emitted-inset-resolved-width"
  /**
   * Task 28.75 — a `width: auto` rule was emitted for an IN-FLOW BLOCK box whose
   * gap to its parent's border box is constant across real parent growth and
   * decomposes into the box model at the truth width. Reached only from an exit
   * the parent-relative branches had already refused. See
   * {@link trackedFillWidth}.
   */
  | "emitted-tracked-fill-width"
  /**
   * Task 28.75 — the full-bleed declaration SET was emitted for an in-flow box
   * observed to be exactly the viewport, at viewport x = 0, at every displayed
   * width, inside a centred parent. See {@link viewportBleedWidth}.
   */
  | "emitted-viewport-bleed-width"
  /**
   * Task 28.75 §19 — a `max-width: 100%` CLAMP was emitted for a box with proven
   * frozen-width damage and no recoverable relation. The last resort, reached
   * after all three recovery branches have refused.
   */
  | "emitted-damage-clamped-width"
  /** Task 28.75 §03b — a grid item restated against its own recovered area. */
  | "emitted-grid-area-fill-width"
  /** The PARENT's horizontal padding could not be read, so no denominator exists. */
  | "refused-parent-padding-unreadable"
  /** The node's OWN padding could not be read, so the emitted length would be wrong. */
  | "refused-own-padding-unreadable"
  /** A branch's claim is ABOUT the parent's content box, which is not this node's
   *  containing block. See {@link containingBlockGuard}. */
  | "refused-containing-block-guard"
  /** The observation cannot say whether `width: auto` stretches here. */
  | "refused-width-mode"
  /** The shape was recoverable; a length the declaration must subtract was not. */
  | "refused-width-value"
  /**
   * THE ONE THE ARTIFACT USED TO HIDE. Every predicate was evaluated and none
   * held: the box is neither a centered cap, nor a fill, nor a constant fraction
   * of its parent. Its exact computed width — frozen at the truth viewport —
   * therefore ships unchanged at every width, which is where a `width: 1344px`
   * box inside a 1100px viewport comes from.
   */
  | "no-branch-matched";

export const INLINE_SIZE_OUTCOMES: readonly InlineSizeOutcome[] = [
  "emitted-centered-max-width",
  "emitted-centered-max-width-capped-fill",
  "emitted-full-width",
  "emitted-percentage-width",
  "emitted-inset-resolved-width",
  "emitted-tracked-fill-width",
  "emitted-viewport-bleed-width",
  "emitted-damage-clamped-width",
  "emitted-grid-area-fill-width",
  "refused-parent-padding-unreadable",
  "refused-own-padding-unreadable",
  "refused-containing-block-guard",
  "refused-width-mode",
  "refused-width-value",
  "no-branch-matched",
];

/**
 * Why a probed node never reached the inline-size stage at all. Disjoint from
 * {@link InlineSizeOutcome}, and together with it exhaustive:
 * `sum(preStageDrops) + inlineSizeCandidates === nodesWithProbe`.
 */
export type InlineSizePreStageDrop =
  /** The probe's truth-width box disagrees with the deep observation's. */
  | "truth-sanity-mismatch"
  /** Hidden at the truth width: the exact computed style already hides it. */
  | "hidden-at-truth-width"
  /** `display` is absent or not a blockish value, so no block width to restate. */
  | "display-not-blockish"
  /** The node's parent is not an element of this viewport's node list. */
  | "parent-not-in-viewport"
  /** The parent exists but carries no probe arrays, so it was never measured. */
  | "parent-probe-missing";

export const INLINE_SIZE_PRE_STAGE_DROPS: readonly InlineSizePreStageDrop[] = [
  "truth-sanity-mismatch",
  "hidden-at-truth-width",
  "display-not-blockish",
  "parent-not-in-viewport",
  "parent-probe-missing",
];

export interface LayoutInferenceCounters {
  pagesWithAlignedProbe: number;
  nodesWithProbe: number;
  centered: number;
  fullWidth: number;
  percentage: number;
  responsiveHidden: number;
  /** Task 28.5B — nodes a containing-block guard refused, total. */
  guardRefusals: number;
  /** …and by reason, sorted, zero entries omitted. */
  guardRefusalsByReason: Record<string, number>;
  /**
   * Task 28.6 R2 — candidates refused because the observation cannot say whether
   * `width: auto` would STRETCH or shrink-to-fit on that box. Total…
   */
  widthModeRefusals: number;
  /** …and by reason. See {@link InlineSizeRefusal}. */
  widthModeRefusalsByReason: Record<string, number>;
  /** Emitted `width: auto` — the box was shown to resolve to stretch. */
  widthModeStretch: number;
  /** Emitted `width: 100%` / `calc(100% - Npx)` — stretch was NOT available. */
  widthModeFillPercentage: number;
  /**
   * Task 28.6 R1 — emitted bands whose coverage of the desktop probe widths
   * DISAGREES with what the probe observed at those widths. Structurally 0: it
   * is counted so the claim is a measurement in the artifact rather than a
   * sentence in this docstring, and so an off-by-one can never ship silently
   * again.
   *
   * TASK 28.6 V6(a) — WHAT THIS DOES *NOT* CORROBORATE. A verifier re-introduced
   * the R1 off-by-one and measured this counter still 0, because the mismatch
   * scan and the band builder read the same `bandContains()`: the counter proves
   * the emitted band agrees with the observation UNDER THE BUILDER'S OWN EDGE
   * CONVENTION, and it cannot see a convention that is wrong on both sides. Only
   * the band-edge assertions (`smoke-layout-safety` Part 6a/6b) catch R1.
   */
  bandSampleMismatches: number;

  /*
   * ------------------------------------------------------------------------
   * Task 28.6 D1 — AUTHORED-BREAKPOINT SNAPPING ACCOUNTING.
   * ------------------------------------------------------------------------
   *
   * A band edge that was NOT snapped is a guess between two probe samples; a
   * band edge that WAS snapped is a number the source's stylesheet wrote. The
   * two must never read alike in an artifact, and the reason a snap did not
   * happen must be legible: no histogram at all, an empty histogram, or a
   * histogram that named nothing inside this particular gap.
   */
  /**
   * Pages by where their desktop breakpoint histogram came from:
   * `spec-field` (the SiteSpec carried `authoredBreakpoints`),
   * `derived-from-nodes` (a pre-v5 SiteSpec whose nodes still carry
   * `authoredLayout`, folded here through the SAME `computeAuthoredBreakpoints`
   * the compiler uses), or `unavailable` (neither). Sorted; zero entries
   * omitted. Only pages that reached band building are counted.
   */
  authoredBreakpointPages: Record<string, number>;
  /** Histogram entries read, summed over those pages. */
  authoredBreakpointEntries: number;
  /** Matched authored declarations those histograms were folded from. */
  authoredBreakpointDeclarations: number;
  /**
   * …of those, the ones that could not be READ at all. Non-zero means the
   * histograms are INCOMPLETE by that much, not that the source authored fewer
   * breakpoints — so a "no authored breakpoint in the gap" verdict below is
   * only as strong as this number is small.
   */
  authoredBreakpointUnparsedDeclarations: number;
  /** Nodes whose authored-declaration list the observation truncated. Same caveat. */
  authoredBreakpointTruncatedNodes: number;

  /** Band edges that are OPEN — no bracketing sample exists, so nothing to snap. */
  bandEdgesOpen: number;
  /**
   * PRESENT band edges offered to the snapper. Splits exactly into
   * {@link bandEdgesSnapped} + {@link bandEdgesKeptMidpointNoAuthoredInGap} +
   * {@link bandEdgesKeptMidpointEmptyHistogram} +
   * {@link bandEdgesKeptMidpointNoHistogram}.
   */
  bandEdgesConsidered: number;
  /** …moved onto a breakpoint the source authored INSIDE the probe gap. */
  bandEdgesSnapped: number;
  /**
   * …of the snapped, the ones whose gap held more than one distinct authored
   * edge, so the pick is one of several the source could have meant. The choice
   * rule is stated on {@link chooseAuthoredEdge}; this counts how often it had
   * to be exercised.
   */
  bandEdgesSnappedAmbiguous: number;
  /** …kept the midpoint: a histogram was read and named nothing inside the gap. */
  bandEdgesKeptMidpointNoAuthoredInGap: number;
  /** …kept the midpoint: the histogram was present but carried zero entries. */
  bandEdgesKeptMidpointEmptyHistogram: number;
  /** …kept the midpoint FOR WANT OF DATA: the viewport supplied no histogram. */
  bandEdgesKeptMidpointNoHistogram: number;
  /** Total px the snapped edges moved off their midpoint guess. 0 when none snapped. */
  bandEdgeSnapShiftPx: number;

  /**
   * Task 28.6 V2 — rules refused because a length the declaration must SUBTRACT
   * could not be read from the computed style. Total…
   */
  widthValueRefusals: number;
  /** …and by reason. See {@link WidthValueReason}. */
  widthValueRefusalsByReason: Record<string, number>;

  /*
   * ------------------------------------------------------------------------
   * Task 28.6 C3 — THE INLINE-SIZE FUNNEL, COUNTED END TO END.
   * ------------------------------------------------------------------------
   */
  /**
   * Probed nodes that reached the inline-size stage: probe present, not
   * html/body, truth-sanity passed, visible at the truth width, blockish
   * display, parent measured. Exactly the population the three branches divide.
   */
  /*
   * ------------------------------------------------------------------------
   * Task 28.6 C2b — THE DESKTOP / MOBILE SPLIT.
   * ------------------------------------------------------------------------
   */
  /** Viewport passes ATTEMPTED, by viewport id. One per page per viewport. */
  viewportPasses: Record<string, number>;
  /** …of those, the ones that resolved a probe and ran. */
  viewportPassesUsed: Record<string, number>;
  /**
   * …and the ones that refused, keyed `"<viewport>:<reason>"`. See
   * {@link ViewportPassRefusal}. On a pre-28.6 artifact every mobile pass lands
   * in `mobile:probe-absent`, which is the honest reading of a missing field.
   */
  viewportPassRefusals: Record<string, number>;
  /** Rules EMITTED, by viewport id. Requirement (d) of C2b. */
  rulesByViewport: Record<string, number>;

  /*
   * ------------------------------------------------------------------------
   * Task 28.6 C3 — WHERE THE PARENT CONTENT BOX CAME FROM.
   * ------------------------------------------------------------------------
   */
  /** Candidates whose denominator was MEASURED from filling siblings per width. */
  contentBoxMeasured: number;
  /** Candidates that fell back to the truth-width padding, assumed constant px. */
  contentBoxAssumedConstant: number;
  /**
   * …of the measured ones, how many the measurement actually MOVED — the derived
   * and assumed content widths differ by more than {@link FULL_WIDTH_TOLERANCE_PX}
   * at some probe width. These are the nodes whose branch verdict the constant-px
   * assumption was getting wrong.
   */
  contentBoxMeasuredDisagreed: number;
  /** Largest px disagreement seen between the two, rounded to 2dp. */
  contentBoxMaxDisagreementPx: number;
  /**
   * Parents whose authored padding says it is NOT one number at every width, by
   * what said so. Counted for every candidate, whether or not a measured box
   * rescued it — the refusals are the subset with no measurement.
   */
  parentPaddingNotConstant: Record<string, number>;

  inlineSizeCandidates: number;
  /**
   * …by outcome. One per candidate, so these sum to {@link inlineSizeCandidates}.
   * See {@link InlineSizeOutcome}; `no-branch-matched` is the count the pre-28.6
   * artifact had no field for. Sorted, zero entries omitted.
   */
  inlineSizeOutcomes: Record<string, number>;
  /**
   * Candidates that somehow recorded a second outcome. Structurally 0; counted
   * rather than asserted so a future edit that adds an exit path without an
   * outcome — or with two — shows up as a number instead of a silent drift in
   * the partition.
   */
  inlineSizeOutcomeDoubleCounts: number;
  /**
   * Task 28.75 §19 — candidates whose recorded outcome was REPLACED by a later
   * branch's answer (only the damage clamp does this today). The partition is
   * preserved exactly: the earlier outcome is decremented as the new one is
   * recorded. Counted so the replacement is visible rather than silent.
   */
  inlineSizeOutcomesSuperseded: number;
  /**
   * Probed nodes DROPPED BEFORE that stage, by reason. Together with
   * {@link inlineSizeCandidates} these sum to {@link nodesWithProbe}.
   */
  inlineSizePreStageDrops: Record<string, number>;

  /**
   * Task 28.6 A5 — grid containers whose COLUMN TRACKS were re-expressed from
   * observed child geometry (`grid-track-columns` rules emitted).
   */
  gridTrackColumns: number;
  /** Grid containers examined for track recovery and refused. Total… */
  gridTrackRefusals: number;
  /** …and by reason. See {@link GridTrackRefusalReason}. */
  gridTrackRefusalsByReason: Record<string, number>;
  /**
   * Task 28.75 §03b — grid containers answered BAND BY BAND, and the rules they
   * emitted.
   *
   * Two numbers because they are not the same number: one container emits one
   * rule per band. The conservation invariant is over CONTAINERS —
   * `gridTrackColumns + gridTrackBandContainers + gridTrackRefusals` equals the
   * grid containers considered — because `gridTrackColumns` is also one rule per
   * container.
   */
  gridTrackBandContainers: number;
  gridTrackColumnsBanded: number;
  /** Containers the banded pass was OFFERED and refused. */
  gridTrackBandRefusals: number;
  /** …and by reason. See {@link GridBandRefusalReason}. */
  gridTrackBandRefusalsByReason: Record<string, number>;
  /** Band edges the grid pass snapped onto a breakpoint the source authored. */
  gridBandEdgesSnapped: number;
  /** …edges it considered, snapped or not. */
  gridBandEdgesConsidered: number;
  /** Task 28.75 §03b — grid ITEMS restated against their own recovered grid area. */
  gridAreaFillWidth: number;
  /** …and every node the same test declined, by reason. */
  gridAreaFillRefusalsByReason: Record<string, number>;

  /**
   * Task 28.7 G — out-of-flow boxes whose frozen used `width` was restated as
   * `width: auto` because the inset equation reproduces the observed box at
   * EVERY displayed width. See {@link insetResolvedWidth}.
   */
  insetResolvedWidth: number;
  /**
   * …and every node the same test declined, by reason. `not-out-of-flow` is not
   * counted (it is the overwhelming majority of every page and says nothing);
   * every other reason is, so a reader can see how much of the population the
   * negative control refuses. See {@link InsetResolvedRefusalReason}.
   */
  insetResolvedRefusalsByReason: Record<string, number>;

  /**
   * Task 28.75 — in-flow block boxes whose frozen used `width` was restated as
   * `width: auto` because the gap to the parent's border box is constant across
   * real parent growth and decomposes into the box model at the truth width.
   * See {@link trackedFillWidth}.
   */
  trackedFillWidth: number;
  /**
   * …and every node the same test declined, by reason. `auto-does-not-stretch`
   * IS counted, unlike `insetResolvedWidth`'s `not-out-of-flow`, because it is
   * the answer for a minority of the population rather than for almost all of
   * it — and it is the count that says how much of the corpus the module's own
   * stretch discriminator, not this branch, is keeping out.
   * See {@link TrackedFillRefusalReason}.
   */
  trackedFillRefusalsByReason: Record<string, number>;

  /**
   * Task 28.75 — in-flow full-bleed bands whose frozen `width`/`margin`/`left`
   * set was co-emitted as `100vw` + `calc(50% - 50vw)`.
   * See {@link viewportBleedWidth}.
   */
  viewportBleedWidth: number;
  /**
   * …and every node the same test declined, by reason. `not-in-flow` and
   * `fewer-than-three-visible-widths` are counted like the rest: the point of
   * the histogram is that `not-viewport-wide` dominates it, which is what
   * "this branch speaks about one node in a thousand" means as a number.
   * See {@link ViewportBleedRefusalReason}.
   */
  viewportBleedRefusalsByReason: Record<string, number>;

  /**
   * Task 28.75 §19 — boxes with PROVEN frozen-width damage and no recoverable
   * relation, capped at their containing block. See {@link damageClampWidth}.
   */
  damageClampedWidth: number;
  /**
   * …and every node the same test declined, by reason. `no-material-damage` and
   * `source-overflows-parent` dominating this histogram is the evidence that the
   * clamp is per-node and predicated rather than blanket.
   * See {@link DamageClampRefusalReason}.
   */
  damageClampRefusalsByReason: Record<string, number>;

  /**
   * Task 28.7 B1 — nodes whose OWN source geometry moves across the widths
   * their variant is displayed at, and which are therefore candidates for the
   * residual freeze audit. The bound is per page × viewport
   * ({@link RESIDUAL_AUDIT_MAX_NODES_PER_PASS}); whatever it drops is counted
   * rather than silently absent.
   */
  residualAuditNodesOffered: number;
  residualAuditNodesOmitted: number;

  /**
   * TASK 28.8 A2 — the authored inline-size fallback, counted apart from the
   * inline-size funnel above.
   *
   * DELIBERATELY NOT AN `InlineSizeOutcome`. The funnel's one invariant is
   * `sum(inlineSizeOutcomes) === inlineSizeCandidates`, and this branch runs
   * over a DIFFERENT population — every element node with no recovered inline
   * size, including the ones dropped before the funnel's candidate line (no
   * parent probe, hidden at the truth width, display not blockish). Folding it
   * into that histogram would make two different denominators look like one.
   */
  authoredIntent: {
    /** Nodes this branch was offered, per viewport. */
    offered: Record<string, number>;
    /** …of those, nodes that produced a rule, per viewport. */
    emitted: Record<string, number>;
    /** Declarations across every emitted rule. */
    declarations: number;
    /** Admissible declarations BEYOND the one taken, summed over properties. */
    cascadeCandidates: number;
    /** Rules that added `width: auto` because the source declared no width. */
    widthAutoAdded: number;
    /** Why a NODE produced nothing. One entry per refused node. */
    refusalsByReason: Record<string, number>;
    /** Why one DECLARATION was refused. Many per node; `property:reason`. */
    declarationRefusalsByReason: Record<string, number>;
    /** Emitted declarations by property, so the shape of the win is readable. */
    emittedByProperty: Record<string, number>;
    /** Task 28.8 A2b — emitted declarations admitted through a resolved `var()`. */
    varAdmitted: number;
  };

  /**
   * REC-I2 (§C2.4/§C2.5) — the authored-first width-family plan OFFER stage.
   * Optional so counters assembled by hand before REC-I2 still type-check.
   *
   * Partition: every element node of a served tree lands in exactly one of
   * `notConsideredByReason` (evidence gate) or `nodesConsidered`, and
   * `nodesConsidered = plansOffered + Σ notOfferedByReason`.
   */
  responsiveOwnership?: {
    nodesConsidered: number;
    /** Evidence absent (old observation, no cascade metadata, …), per node. */
    notConsideredByReason: Record<string, number>;
    plansOffered: number;
    rulesEmitted: number;
    /** `ambiguous`, `contradicted-by-truth`, `no-interval-evidence`, … per node. */
    notOfferedByReason: Record<string, number>;
    /** Planner reasons (`<property>: <reason>`), one count per ambiguous node × reason. */
    ambiguousByReason: Record<string, number>;
    /** Truth contradictions by property. */
    contradictedByProperty: Record<string, number>;
    /**
     * Review fix (MAJOR-3) — all-initial plans refused `coverage-incomplete`,
     * by the first coverage reason (`coverage-evidence-absent`, `fallback-missed`, …).
     */
    coverageIncompleteByReason?: Record<string, number>;
  };
}

export interface LayoutInferenceResult {
  rules: RecoveredLayoutRule[];
  css: string;
  counters: LayoutInferenceCounters;
  /**
   * Task 28.7 B1 — per page × viewport probe evidence for the residual freeze
   * audit. Handed to `verifyLayoutRules()`, which renders the clone half. Empty
   * when no pass produced a candidate; the audit then records "not performed"
   * rather than an implicit clean bill.
   */
  residualAudit: ResidualAuditPass[];
  /** Task 28.7 B1 — bounded per-node grid-track refusal log, ranked per route. */
  gridTrackRefusalNodes: GridTrackRefusalRecord[];
  /** …and what the per-route cut dropped. Never silent. */
  gridTrackRefusalNodesOmitted: number;
  /**
   * REC-I2 — the width-family ownership plans offered (one per node). Optional:
   * a result assembled by hand before REC-I2 carries none, which reads as
   * "no plan offered" (the pre-P0 pipeline exactly).
   */
  ownedPlans?: OwnedPlanOffer[];
}

export interface InferLayoutInput {
  pages: readonly PageSpec[];
  /** styleTokenId → computed properties (for the display gate). */
  styleLookup: (
    styleTokenId: string,
  ) => Readonly<Record<string, string>> | undefined;
  /** The generated SITE-WIDE breakpoint — the default probe-axis split. */
  breakpoint: number;
  /**
   * TASK 28.7 §26.5 — `pageId` → that route's own switch width, for the routes
   * that swap somewhere other than the site-wide number.
   *
   * THE SUBTLE FAILURE MODE THIS EXISTS TO PREVENT. This same number splits the
   * probe axis in {@link resolveViewportProbe}: widths at or above it feed the
   * DESKTOP variant's rules, widths below it feed the MOBILE variant's. If a
   * route is SERVED with a switch at 641 while its rules were inferred with the
   * axis split at 1025, every desktop-variant rule on that route was derived
   * from widths ≥ 1025 — and the route now mounts the desktop tree from 641
   * upwards, where no rule it ships was ever measured. The map is threaded here
   * so the two layers read one number, and both read it through
   * `breakpointForPage()`.
   *
   * OPTIONAL: absent means every page uses `breakpoint`, which is exactly the
   * pre-§26 behaviour.
   */
  breakpointByPageId?: ReadonlyMap<string, number>;
  /**
   * The width the MOBILE deep observation was taken at. Defaults to
   * {@link MOBILE_TRUTH_WIDTH}. A page whose mobile probe never sampled this
   * width refuses its mobile pass rather than anchoring on a different one.
   */
  mobileTruthWidth?: number;
  /**
   * TASK 28.8 A2b — the custom properties this reconstruction emits, keyed
   * `${pageId}:${viewportId}`, name → value. Threaded through to
   * {@link authoredInlineSizeIntent} so a `var(--name)` in an authored
   * declaration can be admitted against the scope the clone actually ships for
   * that page × viewport. Absent (or a missing key) means "none declared for
   * this scope" — every `var()` there is then refused unless it carries a
   * usable fallback, exactly the pre-A2b behaviour.
   */
  customPropertiesByPage?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /**
   * Review fix (MAJOR-3) — the observation's stylesheet coverage per
   * `${pageId}:${viewportId}`, when the caller has it. A viewport spec carrying a
   * `stylesheetCoverage` record is read first. Absent everywhere ⇒ coverage is
   * UNPROVEN and an all-initial ownership plan is never offered.
   */
  stylesheetCoverageByPage?: ReadonlyMap<string, StylesheetCoverageLike>;
}

const BLOCKISH_DISPLAY = new Set([
  "block",
  "flex",
  "grid",
  "flow-root",
  "table",
]);

/** `12px` → 12; anything else → undefined. */
function parsePx(value: string | undefined): number | undefined {
  if (value === undefined) return 0; // computed padding absent means 0
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** The node's horizontal padding from its exact computed style, in px. */
function horizontalPadding(
  node: ElementSpecNode | undefined,
  styleLookup: InferLayoutInput["styleLookup"],
): number | undefined {
  if (!node?.styleTokenId) return 0;
  const props = styleLookup(node.styleTokenId);
  if (!props) return 0;
  const left = parsePx(props["padding-left"]);
  const right = parsePx(props["padding-right"]);
  if (left === undefined || right === undefined) return undefined;
  return left + right;
}

/**
 * The node's horizontal BORDER width from its exact computed style, in px.
 *
 * The parent's content box is its border box minus padding AND border. The
 * original `contentAt()` subtracted only padding, so every bordered parent fed
 * a denominator that was too large by the border width — one of the four
 * containing-block errors 28.5A named. Chromium serializes the computed
 * `border-left` shorthand as `<width> <style> <color>`, so the leading length
 * is the width.
 */
function horizontalBorder(
  node: ElementSpecNode | undefined,
  styleLookup: InferLayoutInput["styleLookup"],
): number {
  if (!node?.styleTokenId) return 0;
  const props = styleLookup(node.styleTokenId);
  if (!props) return 0;
  let total = 0;
  for (const side of ["border-left", "border-right"] as const) {
    const raw = props[side];
    if (raw === undefined) continue;
    const match = /^\s*(-?\d+(?:\.\d+)?)px\b/.exec(raw);
    if (match) total += Number(match[1]);
  }
  return total;
}

/**
 * Does this element establish a containing block for ABSOLUTELY positioned
 * descendants?
 *
 * Conservative on purpose: a property the Observer does not record reads as
 * absent, which makes this return `false`, which makes the caller REFUSE. The
 * failure direction is "keep the exact computed style", never "emit a rule
 * against a box we could not verify".
 */
/**
 * Horizontal-padding longhands and shorthands, as an author may spell them.
 * `padding-block*` is deliberately absent: it never touches the inline axis.
 */
const HORIZONTAL_PADDING_PROPERTIES: ReadonlySet<string> = new Set([
  "padding",
  "padding-left",
  "padding-right",
  "padding-inline",
  "padding-inline-start",
  "padding-inline-end",
]);

/** A length that changes when the VIEWPORT changes, whatever else is true. */
const VIEWPORT_RELATIVE_LENGTH =
  /(?:^|[\s(,])[+-]?\d*\.?\d+(?:vw|vmin|vmax|%)/i;

/** What the parent's authored declarations say about its horizontal padding. */
export type ParentPaddingConstancy =
  /** Nothing authored says it varies ACROSS THIS RANGE: the truth-width px stands. */
  | "constant"
  /**
   * A horizontal padding sits under an `@media` whose truth value CHANGES
   * somewhere inside the widths this variant is rendered at, so there is more
   * than one padding in the range and the one sample cannot name them all.
   */
  | "media-conditional"
  /** A horizontal padding is written in `vw` / `vmin` / `vmax` / `%`. */
  | "viewport-relative"
  /**
   * A horizontal padding sits under an `@media` this module could not parse at
   * all. Whether it varies is UNKNOWN, which is not the same as constant, and a
   * caller that treats the two alike cannot tell a clean page from an unread one.
   */
  | "media-unparsed";

/**
 * TASK 28.6 C3 — IS THE ONE PADDING WE MEASURED THE PADDING AT EVERY WIDTH?
 *
 * `contentAt()` reads the parent's horizontal padding once, from the truth-width
 * computed style, and subtracts that number at every probe width. That is right
 * for a padding authored in px and wrong for one that changes with the viewport,
 * and the observation cannot tell the two apart — one computed style is one
 * sample. The AUTHORED declarations can: a horizontal padding sitting inside an
 * `@media`, or written in a viewport-relative unit, is a padding the source
 * itself says is not one number.
 *
 * WHAT THIS DELIBERATELY DOES NOT FLAG. A `var()` alone is not evidence of
 * variation — `padding-left: var(--gap)` with `--gap: 24px` is as constant as
 * `24px`, and the corpus's generated sheets carry constant ones. Only a
 * declaration whose own text says it varies counts, so the refusal stays a
 * statement about the source rather than about the spelling.
 */
export function parentPaddingConstancy(
  parent: ElementSpecNode | undefined,
  /**
   * The widths this variant is actually rendered at, ascending or not. A media
   * condition is only a source of variation if its boundary falls INSIDE this
   * range: `@media (min-width: 768px)` changes nothing across a desktop variant
   * whose narrowest rendered width is already 1025, and refusing there would
   * throw away sound rules to guard against a change that cannot happen.
   */
  widths: readonly number[],
): ParentPaddingConstancy {
  if (parent === undefined) return "constant";
  const declared = (parent.authoredLayout ?? []).filter((rule) =>
    HORIZONTAL_PADDING_PROPERTIES.has(rule.property),
  );
  if (declared.length === 0) return "constant";
  const lowest = Math.min(...widths);
  const highest = Math.max(...widths);
  let relative = false;
  let unparsed = false;
  for (const rule of declared) {
    if (rule.media !== undefined) {
      const parsed = parseMediaCondition(rule.media);
      if (parsed.status === "unparsed") {
        unparsed = true;
      } else if (parsed.widthRelevant) {
        for (const alternative of parsed.alternatives) {
          if (!alternative.screenApplicable) continue;
          for (const bound of alternative.bounds) {
            // The first width on the high side of the authored change. A change
            // strictly inside `(lowest, highest]` splits this range in two.
            const edge = bound.boundary.above;
            if (edge > lowest && edge <= highest) return "media-conditional";
          }
        }
      } else {
        /*
         * A non-width media condition (`print`, `hover`, `prefers-*`) does not
         * make the padding vary WITH WIDTH. It may still be off in the rendering
         * context, but that is true of the truth-width sample too — the sample
         * and the other widths agree about it, which is all this test needs.
         */
      }
    }
    if (VIEWPORT_RELATIVE_LENGTH.test(rule.value)) relative = true;
  }
  if (relative) return "viewport-relative";
  return unparsed ? "media-unparsed" : "constant";
}

/** A parent's content box, measured per probe index rather than derived. */
export interface MeasuredContentBox {
  /** Content-box left edge at each probe index. */
  x: readonly number[];
  /** Content-box width at each probe index. */
  w: readonly number[];
  /** How many independent filling children agreed on it. Always >= 2. */
  witnesses: number;
}

/**
 * TASK 28.6 C3 — MEASURE THE PARENT'S CONTENT BOX INSTEAD OF DERIVING IT.
 *
 * The probe measured every node's border box at every width. A parent's CONTENT
 * box is not among them — but a child that FILLS it has exactly that box, and
 * the probe measured the child. So the content box is recoverable by finding
 * such a child, and the recovery needs no padding value at all: it is immune to
 * a `var()` whose value moves under a media query, which is the whole defect.
 *
 * NON-CIRCULARITY, AND THE THREE GUARDS THAT BUY IT. "Fills the content box" is
 * what the caller is trying to decide, so it cannot be assumed here. It is
 * ANCHORED instead at the ONE width where an independent measurement exists —
 * the truth viewport, where the parent's computed padding and border ARE known
 * px — and a candidate must then survive:
 *
 *   1. TRUTH ANCHOR. At the truth index the child's border box must equal the
 *      parent's border box minus the computed padding and border, within
 *      {@link FULL_WIDTH_TOLERANCE_PX}.
 *   2. TWO INDEPENDENT WITNESSES. At least two such children must exist and
 *      agree on x AND w at EVERY probe width. One child that merely happens to
 *      be `width: 1344px` inside a 1344px content box passes guard 1 and fails
 *      guard 2 unless a second box is fixed at the identical width at every
 *      sampled viewport — at which point the two are describing the same box and
 *      the answer is the same either way.
 *   3. CONTAINMENT. The derived content box must sit inside the parent's border
 *      box at every width, and be narrower than it by a non-negative amount.
 *      A frozen child that outgrows its shrinking parent is rejected here.
 *
 * A recovery that fails any guard returns `undefined` and the caller falls back
 * to the constant-px derivation — with {@link parentPaddingConstancy} deciding
 * whether that fallback is honest or a refusal.
 */
export function measureParentContentBox(input: {
  parent: ElementSpecNode;
  children: readonly ElementSpecNode[];
  styleLookup: (
    styleTokenId: string,
  ) => Readonly<Record<string, string>> | undefined;
  widthCount: number;
  truthIndex: number;
}): MeasuredContentBox | undefined {
  const { parent, children, styleLookup, widthCount, truthIndex } = input;
  const parentProbe = parent.probe;
  if (parentProbe === undefined) return undefined;
  const padding = horizontalPadding(parent, styleLookup);
  if (padding === undefined) return undefined;
  const border = horizontalBorder(parent, styleLookup);
  const anchorWidth = (parentProbe.w[truthIndex] ?? 0) - padding - border;

  // Guard 1 — the truth anchor.
  const fillers = children.filter((child) => {
    const probe = child.probe;
    if (probe === undefined) return false;
    if ((probe.v[truthIndex] ?? 0) === 0) return false;
    return (
      Math.abs((probe.w[truthIndex] ?? 0) - anchorWidth) <=
      FULL_WIDTH_TOLERANCE_PX
    );
  });
  // Guard 2 — two independent witnesses that agree everywhere.
  if (fillers.length < 2) return undefined;
  const first = fillers[0]!.probe!;
  for (const filler of fillers) {
    const probe = filler.probe!;
    for (let i = 0; i < widthCount; i += 1) {
      if (
        Math.abs((probe.w[i] ?? 0) - (first.w[i] ?? 0)) >
        FULL_WIDTH_TOLERANCE_PX
      ) {
        return undefined;
      }
      if (
        Math.abs((probe.x[i] ?? 0) - (first.x[i] ?? 0)) >
        FULL_WIDTH_TOLERANCE_PX
      ) {
        return undefined;
      }
    }
  }
  // Guard 3 — containment inside the parent's border box at every width.
  for (let i = 0; i < widthCount; i += 1) {
    const contentWidth = first.w[i] ?? 0;
    const parentWidth = parentProbe.w[i] ?? 0;
    if (contentWidth <= 0) return undefined;
    if (contentWidth > parentWidth + FULL_WIDTH_TOLERANCE_PX) return undefined;
    const left = (first.x[i] ?? 0) - (parentProbe.x[i] ?? 0);
    if (left < -FULL_WIDTH_TOLERANCE_PX) return undefined;
    if (left + contentWidth > parentWidth + FULL_WIDTH_TOLERANCE_PX)
      return undefined;
  }
  return { x: [...first.x], w: [...first.w], witnesses: fillers.length };
}

function establishesAbsoluteContainingBlock(
  props: Readonly<Record<string, string>>,
): boolean {
  const position = props["position"];
  if (position !== undefined && position !== "static") return true;
  for (const property of ["transform", "filter", "perspective"] as const) {
    const value = props[property];
    if (value !== undefined && value !== "none" && value !== "") return true;
  }
  const willChange = props["will-change"];
  if (
    willChange !== undefined &&
    /transform|perspective|filter/.test(willChange)
  ) {
    return true;
  }
  const contain = props["contain"];
  if (
    contain !== undefined &&
    /\b(layout|paint|strict|content)\b/.test(contain)
  ) {
    return true;
  }
  return false;
}

/**
 * Task 28.5B — the containing-block guard.
 *
 * Returns the reason this node's width may NOT be re-expressed against its
 * parent's content box, or `undefined` when the parent's content box really is
 * the containing block. There is deliberately no clever math here and no
 * attempt to compute the true containing block: the guard's only two answers
 * are "the denominator is valid" and "refuse".
 */
export function containingBlockGuard(
  node: ElementSpecNode,
  parent: ElementSpecNode | undefined,
  styleLookup: InferLayoutInput["styleLookup"],
): LayoutGuardReason | undefined {
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const parentProps = parent?.styleTokenId
    ? styleLookup(parent.styleTokenId)
    : undefined;

  // --- out of flow ---------------------------------------------------------
  const position = own?.["position"] ?? "static";
  if (position === "fixed") {
    // The containing block is the viewport (or a transformed ancestor). It is
    // never the parent's content box, at any width.
    return "fixed-position";
  }
  if (position === "absolute") {
    if (
      parentProps === undefined ||
      !establishesAbsoluteContainingBlock(parentProps)
    ) {
      // Some ANCESTOR is the containing block. The parent's box is unrelated to
      // this node's width, so every ratio measured against it is meaningless.
      return "abs-containing-block-not-parent";
    }
    // The parent IS the containing block — but for an absolutely positioned
    // child that block is the parent's PADDING box, which is exactly the
    // quantity `contentAt()` subtracts away. Only a zero-padding, zero-border
    // parent makes the two boxes coincide.
    // Task 28.6 V2: an unreadable padding is not a zero one. `?? 0` here read
    // "cannot parse" as "no padding", which is the ONE answer that lets the node
    // through — the fail-safe direction is to refuse.
    const parentPadding = horizontalPadding(parent, styleLookup);
    if (parentPadding === undefined) return "parent-padding-unreadable";
    if (parentPadding !== 0 || horizontalBorder(parent, styleLookup) !== 0) {
      return "abs-containing-block-is-padding-box";
    }
    // Out of flow, but the two boxes coincide: the denominator is valid.
    return undefined;
  }

  // --- in flow, formatting context of the parent ---------------------------
  const parentDisplay = parentProps?.["display"];
  if (parentDisplay === "grid" || parentDisplay === "inline-grid") {
    // A grid item's containing block is its GRID AREA, which the probe never
    // measured and which `contentAt()` cannot see. This is the proven /changelog
    // defect: a 624px item inside a 1280px grid emitted as `width: 48.61%`,
    // which CSS then resolved against the 624px area and rendered at 303.27px.
    return "grid-item";
  }
  if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
    const direction = parentProps?.["flex-direction"] ?? "row";
    if (direction === "row" || direction === "row-reverse") {
      // Main axis is horizontal: the used width is the flex base size grown or
      // shrunk by the container's free space, not a percentage of the content
      // box. `flex-grow: 0` with `flex-basis: auto` is the one shape whose width
      // still resolves the ordinary way.
      const grow = Number.parseFloat(own?.["flex-grow"] ?? "0");
      const basis = (own?.["flex-basis"] ?? "auto").trim();
      if ((Number.isFinite(grow) && grow > 0) || basis !== "auto") {
        return "flex-item-basis-governed";
      }
    }
  }
  return undefined;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Task 28.6 R2 — `width: auto` is INTRINSIC sizing, not a synonym for "stretch"
// ---------------------------------------------------------------------------

/**
 * How this box's inline size may be re-expressed.
 *
 *  * `stretch` — `width: auto` on this box FILLS its containing block. Emitting
 *    `auto` is then strictly better than a percentage: it subtracts the box's
 *    own margins, it adapts to `box-sizing`, and it keeps the box contributing
 *    its real size to an intrinsically-sized ancestor.
 *  * `fill-percentage` — `width: auto` on this box is SHRINK-TO-FIT (or an auto
 *    inline margin defeats the stretch), so `auto` would resolve to max-content.
 *    The observed geometry has to be restated as an explicit percentage.
 *  * `refuse` — the two cannot be told apart from what was observed, or the
 *    percentage form is not reproducible either. Nothing is emitted.
 */
export type InlineSizeMode = "stretch" | "fill-percentage" | "refuse";

/**
 * Why {@link inlineSizeBehaviour} refused, or which fact it keyed on. Recorded
 * on the rule's evidence and, for the refusals, counted in the manifest.
 */
export type InlineSizeReason =
  /* stretch */
  | "block-level-in-flow"
  | "flex-column-cross-stretch"
  /* fill-percentage */
  | "out-of-flow-shrink-to-fit"
  | "shrink-to-fit-display"
  | "flex-cross-auto-margin-defeats-stretch"
  | "flex-cross-not-stretch"
  /* refuse */
  | "styles-unavailable"
  | "parent-display-unknown"
  | "flex-item-main-axis"
  | "grid-item-inline-size"
  | "out-of-flow-auto-margin"
  | "display-not-block-level"
  /**
   * Task 28.6 V3 — the parent's computed display is a NON-REPLACED INLINE box.
   * A block-level child of an inline box takes its containing block from the
   * nearest block-container ANCESTOR, not from the parent, so a percentage
   * width names the wrong box. `stretch` stays available on this shape because
   * `width: auto` names no denominator at all; only the percentage form is
   * refused. An `inline-block` parent is NOT this case — it is a block
   * container — and is left alone.
   */
  | "inline-parent-containing-block";

export const INLINE_SIZE_REFUSAL_REASONS: readonly InlineSizeReason[] = [
  "styles-unavailable",
  "parent-display-unknown",
  "flex-item-main-axis",
  "grid-item-inline-size",
  "out-of-flow-auto-margin",
  "display-not-block-level",
  "inline-parent-containing-block",
];

/**
 * Task 28.6 V2 — why a rule that had already been ACCEPTED could not be given a
 * numeric value.
 *
 * Distinct from {@link InlineSizeReason}, which is about the *shape* of the box:
 * these are refusals of the arithmetic itself, because a length the declaration
 * must subtract is not readable from the computed style. Both directions of the
 * old `?? 0` were wrong in the same way — `width: 100%` that overflows by the
 * padding, `max-width` that is too large by it — and neither was counted.
 */
export type WidthValueReason =
  /** The NODE's own horizontal padding is not a plain px length. */
  "own-padding-unreadable";

export const WIDTH_VALUE_REFUSAL_REASONS: readonly WidthValueReason[] = [
  "own-padding-unreadable",
];

/** Block-level displays whose `width: auto` fills the containing block. */
const STRETCHING_SELF_DISPLAY = new Set([
  "block",
  "flex",
  "grid",
  "flow-root",
  "list-item",
]);

/**
 * In-flow displays whose `width: auto` is shrink-to-fit even in a block
 * container. `table` is the one that bites: it is block-level, it passes the
 * `BLOCKISH_DISPLAY` gate, and `width: auto` on it is max-content.
 */
const SHRINK_TO_FIT_SELF_DISPLAY = new Set([
  "table",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
]);

const FLEX_CONTAINER_DISPLAY = new Set(["flex", "inline-flex"]);
const GRID_CONTAINER_DISPLAY = new Set(["grid", "inline-grid"]);
/** A parent whose own box we cannot reason about: the child's flow is elsewhere. */
const OPAQUE_PARENT_DISPLAY = new Set(["contents", "none"]);
/**
 * Task 28.6 V3 — parent displays that are NON-REPLACED INLINE boxes.
 *
 * An inline box is not a block container, so a block-level child of one takes
 * its containing block from the nearest block-container ANCESTOR. `100%` on
 * that child therefore names a box the parent probe never measured. `inline
 * flow` is Chromium's two-keyword serialization of the same thing; `inline-block`
 * (`inline flow-root`) is deliberately absent because it IS a block container.
 */
const NON_REPLACED_INLINE_PARENT_DISPLAY = new Set(["inline", "inline flow"]);

export interface InlineSizeBehaviour {
  mode: InlineSizeMode;
  reason: InlineSizeReason;
}

/**
 * Task 28.6 R2 — decide, from OBSERVATION, whether `width: auto` stretches.
 *
 * This exists because the two `width: auto` emitters (`centered-max-width` and
 * `full-width`) were resolving correctly only by accident. `width: auto` is
 * intrinsic sizing wherever the box is not a block-level in-flow box in a block
 * container, and on this corpus it was landing on out-of-flow boxes and on flex
 * items, where max-content happened to equal the observed width because every
 * descendant still carried a frozen pixel width from the exact tier. Unfreeze
 * one descendant and the box collapses.
 *
 * The naive repair — swap every `width: auto` for `width: 100%` — was MEASURED
 * to be worse: a percentage contributes nothing to an ancestor's intrinsic size,
 * so putting `100%` on a genuinely-stretch anchor collapsed its container from
 * full width to 742px. Hence a discriminator rather than a swap.
 *
 * WHAT IT KEYS ON, and why that is observation and not guesswork. The clone's
 * stylesheet is exactly the Observer's computed-style whitelist (see
 * `style-generator.ts`), so the set of properties that can influence sizing in
 * the RECONSTRUCTED document is closed and known. `float` is not in that set, so
 * no box in the clone is floated; `display`, `position`, `flex-direction`,
 * `align-self` and `align-items` all are, and are read here. The question asked
 * is therefore not "what did the source page do" but the answerable one: "given
 * the declarations this generation will emit, does `width: auto` on this box
 * fill its containing block?"
 *
 * `autoInlineMargins` is part of the question, not a detail. `margin-inline:
 * auto` is harmless on a block-level in-flow box — the margins resolve to 0
 * while the width is auto, and split the remainder once `max-width` clamps it —
 * but on a flex item, a grid item or an out-of-flow box an auto inline margin
 * DEFEATS stretch and the box falls back to fit-content. So the same node can
 * be `stretch` for `full-width` and `fill-percentage` for `centered-max-width`.
 */
export function inlineSizeBehaviour(
  node: ElementSpecNode,
  parent: ElementSpecNode | undefined,
  styleLookup: InferLayoutInput["styleLookup"],
  options: { autoInlineMargins: boolean },
): InlineSizeBehaviour {
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const parentProps = parent?.styleTokenId
    ? styleLookup(parent.styleTokenId)
    : undefined;
  if (own === undefined || parentProps === undefined) {
    return { mode: "refuse", reason: "styles-unavailable" };
  }

  // --- out of flow ---------------------------------------------------------
  const position = own["position"] ?? "static";
  if (position === "absolute" || position === "fixed") {
    // Shrink-to-fit unless BOTH inset offsets are definite, which the exact tier
    // does not generally give us. With auto inline margins the box is not
    // centered either — it is placed at its static position with margins 0 — so
    // the centered form is not reproducible at all and is refused.
    if (options.autoInlineMargins) {
      return { mode: "refuse", reason: "out-of-flow-auto-margin" };
    }
    return { mode: "fill-percentage", reason: "out-of-flow-shrink-to-fit" };
  }

  // --- formatting context of the parent ------------------------------------
  const parentDisplay = parentProps["display"];
  if (parentDisplay === undefined || OPAQUE_PARENT_DISPLAY.has(parentDisplay)) {
    return { mode: "refuse", reason: "parent-display-unknown" };
  }
  if (FLEX_CONTAINER_DISPLAY.has(parentDisplay)) {
    const direction = parentProps["flex-direction"] ?? "row";
    if (direction === "row" || direction === "row-reverse") {
      // Width is the MAIN size: `auto` means "use the content", and `100%` sets a
      // flex base size that grow/shrink then move off again. Neither form
      // reproduces the observation reliably, so nothing is emitted.
      return { mode: "refuse", reason: "flex-item-main-axis" };
    }
    // Column: width is the CROSS size, and the default `align-items: normal`
    // behaves as `stretch` for a flex item.
    const self = own["align-self"];
    const align =
      self === undefined || self === "auto"
        ? (parentProps["align-items"] ?? "normal")
        : self;
    const stretches = align === "normal" || align === "stretch";
    if (!stretches)
      return { mode: "fill-percentage", reason: "flex-cross-not-stretch" };
    if (options.autoInlineMargins) {
      // An auto cross margin absorbs the free space BEFORE alignment, so the
      // item no longer stretches. A percentage cross size resolves against the
      // container's inner cross size, which is the same box `contentAt()` names.
      return {
        mode: "fill-percentage",
        reason: "flex-cross-auto-margin-defeats-stretch",
      };
    }
    return { mode: "stretch", reason: "flex-column-cross-stretch" };
  }
  if (GRID_CONTAINER_DISPLAY.has(parentDisplay)) {
    /*
     * A grid item stretches to its GRID AREA, and a percentage resolves against
     * that area too — neither is the parent's content box, which is the only box
     * this module measured. `containingBlockGuard()` already refuses grid items
     * for the two dividing branches; this refuses them for the centered one.
     *
     * TASK 28.6 A5(c) — THE RELAXATION THAT WAS BUILT, MEASURED AND REVERTED.
     * There is one shape where the area and the content box provably coincide: a
     * container {@link recoverGridTracks} proved has a single fully fractional
     * column, with this child observed filling it at every observed width. That
     * relaxation was implemented and rebuilt on the 28.5B Linear corpus: it
     * converted 24 of the 71 `grid-item` refusals into `full-width` rules, and a
     * per-node rect diff against the same build without it measured 100 of 9,252
     * nodes moving up to 2px AWAY from their observed boxes, identically at
     * 1024/1232/1440, with the corpus overflow totals unchanged at all four
     * widths. The cause is not the containing block at all: a grid item's
     * AUTOMATIC MINIMUM SIZE is min-content, so `width: auto` on an item whose
     * own child is wider than the area resolves to the child's 672px where the
     * source had a frozen 670px. Reproducing that would need `min-width: 0`,
     * which is a larger claim than the observation supports. Refusal costs
     * nothing measurable and the relaxation cost 100 nodes, so grid items stay
     * refused.
     */
    return { mode: "refuse", reason: "grid-item-inline-size" };
  }

  // --- in flow, block container --------------------------------------------
  const display = own["display"];
  if (display !== undefined && STRETCHING_SELF_DISPLAY.has(display)) {
    return { mode: "stretch", reason: "block-level-in-flow" };
  }
  if (display !== undefined && SHRINK_TO_FIT_SELF_DISPLAY.has(display)) {
    /*
     * Task 28.6 V3 — the percentage's denominator is the CONTAINING BLOCK, and
     * for a block-level child of a non-replaced inline parent that is the
     * nearest block-container ANCESTOR, not the parent. Everything this module
     * measured (`contentAt()`, the ratio, the fills-parent test) is about the
     * parent, so the percentage form names the wrong box and is refused.
     *
     * `stretch` above is NOT refused on the same shape, and that asymmetry is
     * the point: `width: auto` names no denominator, so it fills whichever box
     * really is the containing block.
     */
    if (NON_REPLACED_INLINE_PARENT_DISPLAY.has(parentDisplay)) {
      return { mode: "refuse", reason: "inline-parent-containing-block" };
    }
    return { mode: "fill-percentage", reason: "shrink-to-fit-display" };
  }
  return { mode: "refuse", reason: "display-not-block-level" };
}

/**
 * The `width` value for a `fill-percentage` box, or `undefined` to REFUSE.
 *
 * A percentage resolves against the containing block's width. Under
 * `box-sizing: border-box` that is the whole border box, so `100%` is exact;
 * under `content-box` the padding and border sit OUTSIDE the declared width, so
 * `100%` overflows by exactly that much and the honest value is
 * `calc(100% - <padding + border>px)`.
 *
 * TASK 28.6 V2 — WHY THIS RETURNS `undefined`. The content-box branch used to
 * read the padding as `(horizontalPadding(...) ?? 0)`. `parsePx()` answers
 * `undefined` for anything that is not a plain px length and `horizontalPadding`
 * propagates it, so `?? 0` turned "I could not read the padding" into "the
 * padding is zero" and emitted a confident `width: 100%` that overflows its
 * containing block by exactly the padding — with nothing in any counter. The
 * caller now counts the refusal ({@link WidthValueReason}) and the node keeps
 * its exact computed style, which is this module's designed failure mode.
 */
function fillPercentageWidth(
  node: ElementSpecNode,
  styleLookup: InferLayoutInput["styleLookup"],
): string | undefined {
  const borderBox =
    node.styleTokenId !== undefined &&
    styleLookup(node.styleTokenId)?.["box-sizing"] === "border-box";
  if (borderBox) return "100%";
  const padding = horizontalPadding(node, styleLookup);
  if (padding === undefined) return undefined;
  const inset = padding + horizontalBorder(node, styleLookup);
  return inset === 0 ? "100%" : `calc(100% - ${round2(inset)}px)`;
}

// ---------------------------------------------------------------------------
// Task 28.7 G — the FROZEN WIDTH CHAIN ROOT that is an out-of-flow box
// ---------------------------------------------------------------------------

/**
 * Why {@link insetResolvedWidth} declined to restate a frozen width.
 *
 * Every one of these means what every other refusal in this module means: the
 * observation does not determine the answer, so nothing is emitted and the node
 * keeps its exact computed width. `width-constant` is the load-bearing one —
 * it is the whole negative control, and it is what separates an author's real
 * `width: 640px` (which must stay 640px) from a used value the browser derived.
 */
export type InsetResolvedRefusalReason =
  /** `position` is neither `absolute` nor `fixed`: no inset equation exists. */
  | "not-out-of-flow"
  /** `left` or `right` is `auto` (or not a plain px length), so `auto` is
   *  shrink-to-fit rather than a solved width. */
  | "inset-not-definite"
  /** An inline margin is not a plain px length, so the equation has an unknown. */
  | "margin-not-definite"
  /**
   * THE NEGATIVE CONTROL. The box does not move across the widths its variant is
   * displayed at, so nothing says the frozen px is a derived value rather than
   * an authored one. An over-constrained `left/right/width` box ignores `right`
   * and holds its authored width — exactly this signature — and restating it as
   * `auto` would be a fabrication.
   */
  | "width-constant"
  /** Fewer than two widths where the node is visible: nothing to compare. */
  | "fewer-than-two-visible-widths"
  /** The containing block was identified but carries no probe arrays. */
  | "containing-block-probe-missing"
  /**
   * The equation `border box = containing block − left − right − margins` fails
   * at some width. A percentage or `vw` inset, or one under an `@media`, has
   * this signature: the exact tier froze ONE inset value and the identity then
   * only holds at the truth viewport.
   */
  | "identity-fails";

export const INSET_RESOLVED_REFUSAL_REASONS: readonly InsetResolvedRefusalReason[] =
  [
    "not-out-of-flow",
    "inset-not-definite",
    "margin-not-definite",
    "width-constant",
    "fewer-than-two-visible-widths",
    "containing-block-probe-missing",
    "identity-fails",
  ];

/** Which box the inset equation was solved against. Recorded on the evidence. */
export type InsetContainingBlockKind =
  /** No transformed/positioned ancestor: the viewport (or the initial CB, which
   *  has the viewport's dimensions). The probe's own width list IS this box. */
  | "viewport"
  /** A named ancestor's PADDING box, measured by that ancestor's probe. */
  | "ancestor-padding-box";

export type InsetResolvedResult =
  | {
      ok: true;
      containingBlock: InsetContainingBlockKind;
      /** The ancestor whose padding box was used, when there is one. */
      containingBlockNodeId?: string;
      evidence: string[];
    }
  | { ok: false; reason: InsetResolvedRefusalReason };

/** A definite px length, or `undefined` for `auto` / absent / anything else. */
function definitePx(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/**
 * Does this element establish a containing block for FIXED descendants?
 *
 * Narrower than {@link establishesAbsoluteContainingBlock} by exactly one
 * clause: `position` alone does NOT capture a fixed box. Only a transform-like
 * property (or containment) does.
 */
function establishesFixedContainingBlock(
  props: Readonly<Record<string, string>>,
): boolean {
  for (const property of ["transform", "filter", "perspective"] as const) {
    const value = props[property];
    if (value !== undefined && value !== "none" && value !== "") return true;
  }
  const willChange = props["will-change"];
  if (
    willChange !== undefined &&
    /transform|perspective|filter/.test(willChange)
  ) {
    return true;
  }
  const contain = props["contain"];
  if (
    contain !== undefined &&
    /\b(layout|paint|strict|content)\b/.test(contain)
  ) {
    return true;
  }
  return false;
}

/**
 * TASK 28.7 G — RESTATE AN OUT-OF-FLOW BOX'S FROZEN USED WIDTH AS `auto`.
 *
 * THE PROBLEM THIS EXISTS FOR. The 28.7 residual audit measured which frozen
 * property leaves the clone wrong at widths that are not 1440, and `width` was
 * 91.3% of it on linear.app and 99.1% on hobbang.net. Its ranked list then said
 * something the histogram alone could not: most of the top residual is
 * DOWNSTREAM of a frozen ancestor. A `full-width` rule the truth check verified
 * still measures a constant clone width when the box it resolves against is
 * itself frozen. The lever is the ROOT of the chain, not more leaves.
 *
 * WHY THIS PARTICULAR ROOT. An out-of-flow box is the one shape whose width the
 * parent-relative branches can NEVER answer for: `containingBlockGuard()`
 * refuses `fixed-position` and `abs-containing-block-not-parent` on principle,
 * and it is right to — the parent's content box is not the denominator. So the
 * page shell, the fixed header and the absolutely positioned overlay reach the
 * end of the funnel with no rule and ship 1440px-wide at 1025px, taking every
 * correctly-ruled descendant with them.
 *
 * WHY IT NEEDS NO GUARD AND NO DENOMINATOR. `width: auto` on a box with `left`
 * and `right` both definite is not a claim about any box this module measured.
 * CSS 2.1 §10.3.7 solves
 *
 *     left + margin-left + border + padding + width + padding + border
 *       + margin-right + right = containing block width
 *
 * for `width`, and the px value the exact tier froze IS that solution, taken at
 * the truth viewport. Emitting `auto` hands the same equation back to the
 * browser to re-solve at every width. This is the identical argument the module
 * already makes for `stretch` — "`width: auto` names no denominator" — applied
 * to the out-of-flow case the existing `inlineSizeBehaviour()` declines because
 * "both inset offsets are definite … the exact tier does not GENERALLY give us"
 * them. It generally does not. This function is the test for when it does.
 *
 * WHAT IS ACTUALLY VERIFIED, AT EVERY WIDTH. The equation is not assumed. The
 * containing block is identified with the same rules
 * {@link establishesAbsoluteContainingBlock} already encodes, its width is read
 * from ITS probe (or from the viewport width list, when the containing block is
 * the viewport / initial containing block), and
 *
 *     w[i] + left + right + margin-left + margin-right === containingBlock[i]
 *
 * is checked at EVERY width the variant is displayed at and the node is visible.
 * One width off the curve refuses. That is a stronger gate than the post-emit
 * truth check can apply, because the truth check renders only at the truth
 * viewport — where the frozen px and the re-solved `auto` agree by construction.
 *
 * THE NEGATIVE CONTROL IS THE FIRST GATE, NOT AN AFTERTHOUGHT. A box that does
 * not move is refused (`width-constant`). An author who writes
 * `left: 0; right: 0; width: 640px` over-constrains the box; CSS drops `right`
 * and the width stays 640px at every viewport, so the probe measures a flat
 * line, so nothing is emitted. On linear.app that refusal is 214 of the 300
 * out-of-flow candidates and on gs.severance.healthcare 60 of 78 — the common
 * case is REFUSAL, and the mechanism only speaks where the source moved.
 */
export function insetResolvedWidth(input: {
  node: ElementSpecNode;
  /** Walks one step up the spec tree; `undefined` at the root. */
  parentOf: (node: ElementSpecNode) => ElementSpecNode | undefined;
  styleLookup: InferLayoutInput["styleLookup"];
  /** The width axis this variant is displayed on, as the pass computed it. */
  variantIdx: readonly { width: number; i: number }[];
}): InsetResolvedResult {
  const { node, parentOf, styleLookup, variantIdx } = input;
  const probe = node.probe;
  if (!probe) return { ok: false, reason: "containing-block-probe-missing" };
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const position = own?.["position"] ?? "static";
  if (position !== "absolute" && position !== "fixed") {
    return { ok: false, reason: "not-out-of-flow" };
  }
  const left = definitePx(own?.["left"]);
  const right = definitePx(own?.["right"]);
  if (left === undefined || right === undefined) {
    return { ok: false, reason: "inset-not-definite" };
  }
  const marginLeft = definitePx(own?.["margin-left"]);
  const marginRight = definitePx(own?.["margin-right"]);
  if (marginLeft === undefined || marginRight === undefined) {
    return { ok: false, reason: "margin-not-definite" };
  }

  const shown = variantIdx.filter((entry) => (probe.v[entry.i] ?? 0) === 1);
  if (shown.length < 2)
    return { ok: false, reason: "fewer-than-two-visible-widths" };
  const widths = shown.map((entry) => probe.w[entry.i] ?? 0);
  // THE NEGATIVE CONTROL. Same threshold every other branch uses for "this box
  // moved enough for a claim about its movement to mean anything".
  if (Math.max(...widths) - Math.min(...widths) < PARENT_GROWTH_MIN_PX) {
    return { ok: false, reason: "width-constant" };
  }

  // --- which box does the equation resolve against? -------------------------
  let ancestor: ElementSpecNode | undefined;
  for (
    let candidate = parentOf(node);
    candidate !== undefined;
    candidate = parentOf(candidate)
  ) {
    const props = candidate.styleTokenId
      ? styleLookup(candidate.styleTokenId)
      : undefined;
    if (props === undefined) continue;
    const establishes =
      position === "fixed"
        ? establishesFixedContainingBlock(props)
        : establishesAbsoluteContainingBlock(props);
    if (establishes) {
      ancestor = candidate;
      break;
    }
  }
  if (ancestor !== undefined && !ancestor.probe) {
    return { ok: false, reason: "containing-block-probe-missing" };
  }
  // The containing block of an out-of-flow box is the ancestor's PADDING box,
  // which is its border box minus its borders. The probe measures border boxes.
  const ancestorBorder =
    ancestor !== undefined ? horizontalBorder(ancestor, styleLookup) : 0;
  const containingBlockAt = (entry: { width: number; i: number }): number =>
    ancestor === undefined
      ? entry.width
      : (ancestor.probe!.w[entry.i] ?? 0) - ancestorBorder;

  const insets = left + right + marginLeft + marginRight;
  for (const entry of shown) {
    const observed = (probe.w[entry.i] ?? 0) + insets;
    if (
      Math.abs(observed - containingBlockAt(entry)) > FULL_WIDTH_TOLERANCE_PX
    ) {
      return { ok: false, reason: "identity-fails" };
    }
  }

  const evidence = shown.map(
    (entry) =>
      `${entry.width}px: width ${round2(probe.w[entry.i] ?? 0)} + insets ${round2(
        insets,
      )} = ${round2(containingBlockAt(entry))} containing block`,
  );
  evidence.push(
    `position: ${position}; left: ${left}px; right: ${right}px; ` +
      `margin-inline: ${marginLeft}px ${marginRight}px`,
  );
  evidence.push(
    ancestor === undefined
      ? "containing block: viewport (no transformed or positioned ancestor)"
      : `containing block: padding box of ${ancestor.nodeId}`,
  );
  return {
    ok: true,
    containingBlock:
      ancestor === undefined ? "viewport" : "ancestor-padding-box",
    ...(ancestor !== undefined
      ? { containingBlockNodeId: ancestor.nodeId }
      : {}),
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Task 28.75 — the FROZEN WIDTH CHAIN ROOT that is an IN-FLOW block box
// ---------------------------------------------------------------------------

/**
 * Why {@link trackedFillWidth} declined to restate a frozen width.
 *
 * The same meaning every refusal in this module carries: the observation does
 * not determine the answer, so nothing is emitted and the node keeps its exact
 * computed width. Two of these are load-bearing negative controls and are named
 * as such — `width-constant` (an author's real `width: 640px` must stay 640px)
 * and `gap-not-box-model` (a `calc(100% - 100px)` box measures the same shape as
 * a filled box inside a 100px-padded parent, and only the box model tells them
 * apart).
 */
export type TrackedFillRefusalReason =
  /**
   * `width: auto` does NOT fill the containing block on this box, as
   * {@link inlineSizeBehaviour} already decides for every other emitter: an
   * out-of-flow box, a flex item on the main axis, a grid item, an
   * `inline-block`, or a block-level child of a non-replaced inline parent.
   */
  | "auto-does-not-stretch"
  /** Fewer than three widths where the node and its parent are both visible. */
  | "fewer-than-three-visible-widths"
  /**
   * THE FIRST NEGATIVE CONTROL. The box does not move across the widths its
   * variant is displayed at, so nothing says the frozen px is a derived value
   * rather than an authored one. Same threshold every other branch uses.
   */
  | "width-constant"
  /** The node's border box is WIDER than its parent's at some width, so it is
   *  overflowing rather than filling and `auto` would shrink it. */
  | "negative-gap"
  /**
   * THE EVIDENCE GATE. Sorted by parent width, the gap `parentBorderBox − ownBorderBox`
   * forms runs of a constant value; some run does not span
   * {@link PARENT_GROWTH_MIN_PX} of parent growth, so nowhere was this box
   * observed absorbing the whole of its parent's growth. A `width: N%` box has
   * exactly this signature — its gap varies continuously, so every run is one
   * sample wide and no run is witnessed.
   */
  | "gap-run-unwitnessed"
  /** The parent's padding or border, or the node's own inline margins, are not
   *  plain px lengths, so the gap cannot be decomposed. */
  | "box-model-unreadable"
  /**
   * THE SECOND NEGATIVE CONTROL. At the truth width the gap is NOT accounted for
   * by the parent's padding + border and this node's own inline margins — the
   * four quantities `width: auto` will actually resolve against. A
   * `width: calc(100% - 100px)` box tracks its parent one-for-one exactly like a
   * filled box does, and this is the only measurement that separates them.
   */
  | "gap-not-box-model";

export const TRACKED_FILL_REFUSAL_REASONS: readonly TrackedFillRefusalReason[] =
  [
    "auto-does-not-stretch",
    "fewer-than-three-visible-widths",
    "width-constant",
    "negative-gap",
    "gap-run-unwitnessed",
    "box-model-unreadable",
    "gap-not-box-model",
  ];

export type TrackedFillResult =
  | {
      ok: true;
      /** The constant-gap runs, in ascending parent width. Evidence, not a rule. */
      gapRuns: readonly {
        gapPx: number;
        parentFromPx: number;
        parentToPx: number;
      }[];
      evidence: string[];
    }
  | { ok: false; reason: TrackedFillRefusalReason };

/**
 * TASK 28.75 — RESTATE AN IN-FLOW BLOCK BOX'S FROZEN USED WIDTH AS `auto`.
 *
 * THE PROBLEM THIS EXISTS FOR. The 28.7 residual audit measured `width` at 91.3%
 * of linear.app's residual and 99.1% of hobbang.net's, and said the residual is
 * an ANCESTOR-CHAIN property: a `full-width` rule the truth check verified still
 * measures a constant clone width when the box it resolves against is frozen.
 * The 28.75 chain analysis then walked `parentNodeId` upward from every measured
 * residual and grouped them under the earliest ancestor that is itself frozen.
 * On all four canary corpora the largest class of chain ROOT is not out-of-flow
 * and not a grid container: it is an ordinary in-flow block box —
 * 1,254 of linear.app's 2,101 residual nodes, 211 of gs.severance's 217,
 * 832 of seoultone.kr's 2,305, 653 of hobbang.net's 2,304.
 *
 * WHY THE EXISTING FULL-WIDTH BRANCH CANNOT ANSWER THEM. That branch tests
 * `w[i] === contentAt(i)` where `contentAt()` is the parent's border box minus
 * ONE padding number read at the truth viewport. linear.app's `<section>` shell
 * sits inside a parent whose authored padding is 28px below 1025, 10px to 1280
 * and 46px above — three numbers. The truth-width one is 46, so `contentAt(641)`
 * reads 549 against an observed 585 and the fills-parent test is false by 36px;
 * the ratio test then sees a ratio that slides from 1.066 to 1.000 and is false
 * too. The node leaves through `no-branch-matched` and ships `width: 1344px`
 * inside a 641px viewport, taking 156 residual descendants with it.
 *
 * WHAT IS MEASURED INSTEAD, AND WHY IT NEEDS NO PADDING CONSTANT. The gap
 * between this box's border box and its parent's,
 *
 *     gap[i] = parentBorderBox[i] − ownBorderBox[i]
 *
 * is, for a filled box, exactly `parentPadding + parentBorder + ownMarginInline`
 * — quantities an author writes as lengths and changes only at breakpoints. For
 * a `width: N%` box it is `(1 − N)·parentContent + …`, which slides continuously
 * with the parent. So the observation that decides it is: sort by parent width,
 * cut the samples into runs of constant gap, and require EVERY run to span at
 * least {@link PARENT_GROWTH_MIN_PX} of parent growth. Inside such a run the
 * parent grew 40px or more and the whole of that growth went to this box, which
 * is what `width: auto` means and what no percentage and no fixed px can do.
 *
 * THE SECOND CONTROL IS THE BOX MODEL, BECAUSE GEOMETRY ALONE CANNOT SEPARATE
 * `calc(100% − 100px)` FROM A FILL INSIDE A 100px-PADDED PARENT. Both track the
 * parent one-for-one with a constant gap. So the truth-width gap is decomposed
 * against the exact tier's own numbers —
 *
 *     gap[truth] === parentPaddingInline + parentBorderInline + ownMarginInline
 *
 * — and a mismatch refuses. This is also what makes the emitted rule exact at the
 * truth width, and therefore what the post-emit render in `verifyLayoutRules()`
 * is checking against; away from the truth width the clone reproduces the frozen
 * gap rather than the source's banded one, which is a named and quantified
 * limitation, not a hidden one.
 *
 * WHY `auto` AND NOT A PERCENTAGE. Identical to the argument this module already
 * makes for `stretch`: `width: auto` names no denominator, so it cannot be wrong
 * about one. `width: 100%` would name the parent's content box explicitly and
 * then double-count this node's own padding under `content-box`.
 *
 * REACHED ONLY FROM AN EXIT THAT HAS ALREADY REFUSED, exactly like
 * {@link insetResolvedWidth}, so it never competes with a rule the funnel would
 * have shipped.
 */
export function trackedFillWidth(input: {
  node: ElementSpecNode;
  parent: ElementSpecNode | undefined;
  styleLookup: InferLayoutInput["styleLookup"];
  /** The width axis this variant is displayed on, as the pass computed it. */
  variantIdx: readonly { width: number; i: number }[];
  /** Index into `variantIdx`'s arrays for the truth viewport. */
  truthIndex: number;
}): TrackedFillResult {
  const { node, parent, styleLookup, variantIdx, truthIndex } = input;
  const probe = node.probe;
  const parentProbe = parent?.probe;
  if (!probe || !parentProbe)
    return { ok: false, reason: "fewer-than-three-visible-widths" };

  /*
   * Gate 1 — the module's OWN existing test for "does `width: auto` fill the
   * containing block here". Not a new discriminator: the same call the
   * `full-width` branch makes, with the same options, so an out-of-flow box, a
   * flex row item, a grid item, a table and an `inline-block` are refused here
   * for exactly the reasons they are refused there.
   */
  if (
    inlineSizeBehaviour(node, parent, styleLookup, { autoInlineMargins: false })
      .mode !== "stretch"
  ) {
    return { ok: false, reason: "auto-does-not-stretch" };
  }

  const shown = variantIdx.filter(
    (entry) =>
      (probe.v[entry.i] ?? 0) === 1 &&
      (probe.w[entry.i] ?? 0) > 0 &&
      (parentProbe.w[entry.i] ?? 0) > 0,
  );
  /*
   * Three, not two. Two samples can only ever produce one gap run, and a run
   * built from two samples is a line through two points — it cannot distinguish
   * a constant gap from a sliding one. The evidence gate below needs a run to
   * MEAN something.
   */
  if (shown.length < 3)
    return { ok: false, reason: "fewer-than-three-visible-widths" };

  const widths = shown.map((entry) => probe.w[entry.i] ?? 0);
  // NEGATIVE CONTROL 1. Same threshold every other branch uses for "this box
  // moved enough for a claim about its movement to mean anything".
  if (Math.max(...widths) - Math.min(...widths) < PARENT_GROWTH_MIN_PX) {
    return { ok: false, reason: "width-constant" };
  }

  const samples = shown
    .map((entry) => ({
      viewport: entry.width,
      own: probe.w[entry.i] ?? 0,
      parent: parentProbe.w[entry.i] ?? 0,
      gap: (parentProbe.w[entry.i] ?? 0) - (probe.w[entry.i] ?? 0),
    }))
    .sort((a, b) => a.parent - b.parent || a.viewport - b.viewport);
  if (samples.some((sample) => sample.gap < -FULL_WIDTH_TOLERANCE_PX)) {
    return { ok: false, reason: "negative-gap" };
  }

  /*
   * THE EVIDENCE GATE. Runs of constant gap in ascending parent width, each of
   * which must be witnessed by real parent growth.
   */
  const runs: {
    gapPx: number;
    parentFromPx: number;
    parentToPx: number;
    n: number;
  }[] = [];
  for (const sample of samples) {
    const last = runs[runs.length - 1];
    if (
      last !== undefined &&
      Math.abs(sample.gap - last.gapPx) <= FULL_WIDTH_TOLERANCE_PX
    ) {
      last.gapPx = (last.gapPx * last.n + sample.gap) / (last.n + 1);
      last.n += 1;
      last.parentToPx = sample.parent;
      continue;
    }
    runs.push({
      gapPx: sample.gap,
      parentFromPx: sample.parent,
      parentToPx: sample.parent,
      n: 1,
    });
  }
  for (const run of runs) {
    if (run.parentToPx - run.parentFromPx < PARENT_GROWTH_MIN_PX) {
      return { ok: false, reason: "gap-run-unwitnessed" };
    }
  }

  /*
   * NEGATIVE CONTROL 2 — the box model, at the truth width. `width: auto` will
   * resolve against exactly these four numbers, all of which the exact tier
   * already ships as frozen px, so if they do not add up to the observed gap the
   * emitted `auto` would not reproduce the observation even at the one width the
   * post-emit render can check.
   */
  const parentPadding = horizontalPadding(parent, styleLookup);
  if (parentPadding === undefined)
    return { ok: false, reason: "box-model-unreadable" };
  const parentBorder = horizontalBorder(parent, styleLookup);
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const marginLeft = definitePx(own?.["margin-left"]);
  const marginRight = definitePx(own?.["margin-right"]);
  if (marginLeft === undefined || marginRight === undefined) {
    return { ok: false, reason: "box-model-unreadable" };
  }
  const truthGap =
    (parentProbe.w[truthIndex] ?? 0) - (probe.w[truthIndex] ?? 0);
  const boxModel = parentPadding + parentBorder + marginLeft + marginRight;
  if (Math.abs(truthGap - boxModel) > FULL_WIDTH_TOLERANCE_PX) {
    return { ok: false, reason: "gap-not-box-model" };
  }

  const evidence = runs.map(
    (run) =>
      `parent ${round2(run.parentFromPx)}…${round2(run.parentToPx)}px: gap constant at ` +
      `${round2(run.gapPx)}px over ${round2(run.parentToPx - run.parentFromPx)}px of parent growth`,
  );
  evidence.push(
    ...samples.map(
      (sample) =>
        `${sample.viewport}px: width ${round2(sample.own)} vs parent border box ` +
        `${round2(sample.parent)} (gap ${round2(sample.gap)})`,
    ),
  );
  evidence.push(
    `truth-width gap ${round2(truthGap)}px = parent padding ${round2(parentPadding)} + ` +
      `parent border ${round2(parentBorder)} + own margins ${round2(marginLeft)}/${round2(
        marginRight,
      )}`,
  );
  return {
    ok: true,
    gapRuns: runs.map((run) => ({
      gapPx: round2(run.gapPx),
      parentFromPx: round2(run.parentFromPx),
      parentToPx: round2(run.parentToPx),
    })),
    evidence,
  };
}

/**
 * Why {@link viewportBleedWidth} declined to restate a frozen full-bleed width.
 *
 * `not-viewport-wide` and `width-constant` are the negative controls, and
 * between them they are why this branch speaks about roughly one node in a
 * thousand: the box has to BE the viewport, at every width, and it has to have
 * been observed moving.
 */
export type ViewportBleedRefusalReason =
  /** Out of flow: {@link insetResolvedWidth} owns that population, not this one. */
  | "not-in-flow"
  /** Fewer than three widths where the node and its parent are both visible. */
  | "fewer-than-three-visible-widths"
  /**
   * THE FIRST NEGATIVE CONTROL. The box does not move across the widths its
   * variant is displayed at, so the frozen px may be an authored width.
   */
  | "width-constant"
  /**
   * THE SECOND, AND THE ONE THAT DOES THE WORK. At some width the box's border
   * box is not exactly the viewport — either it is not viewport-WIDE, or its
   * left edge is not at viewport x = 0. An intentional decorative bleed that
   * overhangs one side, a carousel track, and a box that merely happens to be
   * 1440px wide at 1440 all fail here.
   */
  | "not-viewport-wide"
  /**
   * The PARENT's border box is not centred in the viewport at some width, so
   * `calc(50% - 50vw)` — whose whole derivation is that the parent's centre and
   * the viewport's centre coincide — would place the box somewhere else.
   */
  | "parent-not-centred"
  /** The parent's inline padding or border is asymmetric or unreadable, so the
   *  parent's CONTENT box is not centred even where its border box is. */
  | "parent-box-asymmetric"
  /** The node's own padding/border could not be read, so a `content-box` node's
   *  border box cannot be made to equal `100vw`. */
  | "own-box-unreadable";

export const VIEWPORT_BLEED_REFUSAL_REASONS: readonly ViewportBleedRefusalReason[] =
  [
    "not-in-flow",
    "fewer-than-three-visible-widths",
    "width-constant",
    "not-viewport-wide",
    "parent-not-centred",
    "parent-box-asymmetric",
    "own-box-unreadable",
  ];

export type ViewportBleedResult =
  | { ok: true; declarations: Record<string, string>; evidence: string[] }
  | { ok: false; reason: ViewportBleedRefusalReason };

/**
 * TASK 28.75 — THE IN-FLOW FULL-BLEED CHAIN ROOT.
 *
 * WHAT IT IS. `width: 100vw; margin-inline: -50vw; left: 50%` on a
 * `position: relative` box inside a centred column — the standard idiom for a
 * band that escapes its container and spans the window. The exact tier freezes
 * all three: `width: 1440px`, `margin-left: -720px`, `left: 672px`. The clone
 * then lays a 1440px band inside a 641px viewport, 797px of it offscreen, and
 * carries its descendants with it. On linear.app this is 7 chain roots and 28
 * residual nodes, all on the home route, all at the top of the page.
 *
 * WHY 28.7 DECLINED IT, AND WHAT CHANGED. The 28.7 experiment worked out the
 * ONE-declaration version — emit `width: 100vw` and leave the frozen
 * `margin-left: -720px` and `left: 672px` alone — and found it is a REGRESSION
 * at wide viewports: at 1920 the box would render `240 → 2160`, a new 240px
 * overhang where the frozen 1440px box had none. That arithmetic is correct and
 * it is an argument against emitting ONE declaration, not against the pattern.
 * This function CO-EMITS the whole set, so the geometry closes:
 *
 *     margin-left = margin-right = calc(50% - 50vw)
 *     left = 0, right = auto
 *     width = 100vw
 *
 * and the box's left edge is
 *
 *     parentContentLeft + (0.5·parentContentWidth − 0.5·viewport)
 *
 * which, for a parent whose border box is centred and whose inline padding and
 * border are symmetric, is exactly `0.5·(viewport − parentBorderWidth) +
 * 0.5·parentBorderWidth − 0.5·viewport = 0` — INDEPENDENT of the parent's
 * padding, which matters because that padding is itself frozen in the clone.
 * At 1920 that gives `0 → 1920`: the 240px overhang the one-declaration version
 * would have introduced is gone, by construction rather than by luck.
 *
 * WHAT IS VERIFIED, AT EVERY WIDTH. Nothing about the authored CSS is assumed —
 * the `100vw`/`-50vw` reading is a description, not an input. What is required
 * is the OBSERVED geometry it produces, at every width the variant is displayed
 * at: the box's border box starts at viewport x = 0 and is exactly the viewport
 * wide, and its parent's border box is centred in the viewport. One width off
 * the curve refuses.
 */
export function viewportBleedWidth(input: {
  node: ElementSpecNode;
  parent: ElementSpecNode | undefined;
  styleLookup: InferLayoutInput["styleLookup"];
  variantIdx: readonly { width: number; i: number }[];
}): ViewportBleedResult {
  const { node, parent, styleLookup, variantIdx } = input;
  const probe = node.probe;
  const parentProbe = parent?.probe;
  if (!probe || !parentProbe)
    return { ok: false, reason: "fewer-than-three-visible-widths" };
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const position = own?.["position"] ?? "static";
  if (position !== "static" && position !== "relative") {
    return { ok: false, reason: "not-in-flow" };
  }
  const display = own?.["display"];
  if (display === undefined || !STRETCHING_SELF_DISPLAY.has(display)) {
    return { ok: false, reason: "not-in-flow" };
  }

  const shown = variantIdx.filter(
    (entry) =>
      (probe.v[entry.i] ?? 0) === 1 &&
      (probe.w[entry.i] ?? 0) > 0 &&
      (parentProbe.w[entry.i] ?? 0) > 0,
  );
  if (shown.length < 3)
    return { ok: false, reason: "fewer-than-three-visible-widths" };
  const widths = shown.map((entry) => probe.w[entry.i] ?? 0);
  // NEGATIVE CONTROL 1 — the same threshold every other branch uses.
  if (Math.max(...widths) - Math.min(...widths) < PARENT_GROWTH_MIN_PX) {
    return { ok: false, reason: "width-constant" };
  }

  // NEGATIVE CONTROL 2 — the box IS the viewport, at every width.
  for (const entry of shown) {
    if (
      Math.abs((probe.w[entry.i] ?? 0) - entry.width) > FULL_WIDTH_TOLERANCE_PX
    ) {
      return { ok: false, reason: "not-viewport-wide" };
    }
    if (Math.abs(probe.x[entry.i] ?? 0) > FULL_WIDTH_TOLERANCE_PX) {
      return { ok: false, reason: "not-viewport-wide" };
    }
  }

  // The derivation's one assumption about the parent, measured rather than assumed.
  for (const entry of shown) {
    const parentWidth = parentProbe.w[entry.i] ?? 0;
    const expected = (entry.width - parentWidth) / 2;
    if (
      Math.abs((parentProbe.x[entry.i] ?? 0) - expected) >
      CENTER_GAP_TOLERANCE_PX
    ) {
      return { ok: false, reason: "parent-not-centred" };
    }
  }
  const parentProps = parent?.styleTokenId
    ? styleLookup(parent.styleTokenId)
    : undefined;
  const padLeft = parsePx(parentProps?.["padding-left"]);
  const padRight = parsePx(parentProps?.["padding-right"]);
  const bordLeft = parsePx(parentProps?.["border-left-width"]);
  const bordRight = parsePx(parentProps?.["border-right-width"]);
  if (
    padLeft === undefined ||
    padRight === undefined ||
    bordLeft === undefined ||
    bordRight === undefined ||
    Math.abs(padLeft - padRight) > FULL_WIDTH_TOLERANCE_PX ||
    Math.abs(bordLeft - bordRight) > FULL_WIDTH_TOLERANCE_PX
  ) {
    return { ok: false, reason: "parent-box-asymmetric" };
  }

  /*
   * `100vw` is a BORDER-box statement only under `border-box`. Under
   * `content-box` the node's own padding and border sit outside the declared
   * width, exactly as `fillPercentageWidth()` already reasons, so they are
   * subtracted rather than silently double-counted.
   */
  const borderBox = own?.["box-sizing"] === "border-box";
  let widthValue = "100vw";
  if (!borderBox) {
    const ownPadding = horizontalPadding(node, styleLookup);
    if (ownPadding === undefined)
      return { ok: false, reason: "own-box-unreadable" };
    const inset = ownPadding + horizontalBorder(node, styleLookup);
    if (inset !== 0) widthValue = `calc(100vw - ${round2(inset)}px)`;
  }

  const evidence = shown.map(
    (entry) =>
      `${entry.width}px: box ${round2(probe.x[entry.i] ?? 0)} … ` +
      `${round2((probe.x[entry.i] ?? 0) + (probe.w[entry.i] ?? 0))} (the whole viewport); ` +
      `parent ${round2(parentProbe.x[entry.i] ?? 0)} wide ${round2(parentProbe.w[entry.i] ?? 0)} ` +
      `(centred: expected ${round2((entry.width - (parentProbe.w[entry.i] ?? 0)) / 2)})`,
  );
  evidence.push(
    `frozen: width ${own?.["width"] ?? "?"}, margin-inline ${own?.["margin-left"] ?? "?"}/` +
      `${own?.["margin-right"] ?? "?"}, left ${own?.["left"] ?? "?"} — all co-emitted, so the ` +
      `1920px case renders 0…1920 rather than 240…2160`,
  );
  evidence.push(
    `parent padding ${round2(padLeft)}/${round2(padRight)}, border ` +
      `${round2(bordLeft)}/${round2(bordRight)} — symmetric, so the parent's CONTENT box is ` +
      `centred too and the frozen padding cancels out of the margin equation`,
  );
  return {
    ok: true,
    declarations: {
      width: widthValue,
      "margin-left": "calc(50% - 50vw)",
      "margin-right": "calc(50% - 50vw)",
      left: "0px",
      right: "auto",
    },
    evidence,
  };
}

/**
 * Why {@link damageClampWidth} declined to clamp a frozen width.
 *
 * A clamp is the LAST resort in the 28.75 preference order — source-authored
 * relation, then observed geometric relation, then safe generic containment,
 * then this. So every one of these refusals is the ordinary answer, and the
 * three that carry the argument are named: `frozen-width-not-observed` (the
 * frozen px is not what the box measured at the truth width, so the clamp would
 * not be a no-op there), `source-overflows-parent` (the box is an INTENTIONAL
 * bleed — the source's own box leaves its parent, so shrinking it would be a
 * new defect), and `no-material-damage` (nothing to fix).
 */
export type DamageClampRefusalReason =
  /** The exact tier's `width` is not a plain px length: nothing is frozen. */
  | "no-frozen-width"
  /** Fewer than two widths where the node and its parent are both visible. */
  | "fewer-than-two-visible-widths"
  /**
   * THE FIRST CONTROL. The source's own box does not move across the widths its
   * variant is displayed at — the same source half the residual audit uses. A
   * box that never moved has no responsive meaning the freeze destroyed.
   */
  | "source-width-constant"
  /** The frozen px is not the box the deep observation measured at the truth
   *  width, so clamping would change the one width the render can check. */
  | "frozen-width-not-observed"
  /**
   * THE SECOND CONTROL, AND THE ONE THAT PROTECTS INTENTIONAL BLEEDS. At some
   * displayed width the SOURCE's own border box extends past its parent's, or a
   * negative inline margin says it is meant to. A full-bleed band, a decorative
   * overhang and a horizontally scrolling track all have this signature, and
   * `max-width: 100%` would break every one of them.
   */
  | "source-overflows-parent"
  /**
   * THE THIRD CONTROL. The frozen width never exceeds the parent's border box by
   * a material amount at any displayed width, so there is no proven damage to
   * clamp. This is most of the population.
   */
  | "no-material-damage"
  /**
   * The parent's content box is not this node's containing block, so `100%` does
   * not name the box the predicate was verified against. Read straight off
   * {@link containingBlockGuard} — the clamp relaxes nothing and consults the
   * same function every dividing branch does.
   */
  | "containing-block-not-parent"
  /** The node's own padding/border could not be read under `content-box`, so a
   *  percentage cap cannot be written without double-counting them. */
  | "own-box-unreadable";

export const DAMAGE_CLAMP_REFUSAL_REASONS: readonly DamageClampRefusalReason[] =
  [
    "no-frozen-width",
    "fewer-than-two-visible-widths",
    "source-width-constant",
    "frozen-width-not-observed",
    "source-overflows-parent",
    "no-material-damage",
    "containing-block-not-parent",
    "own-box-unreadable",
  ];

/**
 * Guard verdicts under which the parent's content box IS this node's containing
 * block, so a percentage cap resolves against the box the predicate measured.
 *
 * `flex-item-basis-governed` and the two padding refusals are ADMITTED here on
 * purpose, and the reason is the same one this module already gives for
 * `stretch`: those three refusals are about the DENOMINATOR being unknowable —
 * a flex base size the observation cannot decompose, a padding that is not one
 * number — and `max-width: 100%` never names a denominator. It hands the
 * containing block back to the browser exactly as `width: auto` does. The four
 * that are NOT admitted (`grid-item`, both `abs-containing-block-*` and
 * `fixed-position`) are refusals about the containing BLOCK itself being a
 * different box from the parent's content box, and there a percentage would
 * resolve against a box the predicate never measured.
 */
const CLAMPABLE_GUARDS: ReadonlySet<string> = new Set([
  "flex-item-basis-governed",
  "parent-padding-unreadable",
  "parent-padding-not-constant",
]);

/**
 * TASK 28.75 §19 — THE DAMAGE CLAMP. A CONSERVATIVE LAST RESORT, PER NODE.
 *
 * WHAT IT IS FOR. After the three recovery branches above, one class of frozen
 * box is left on every corpus: a container the module can PROVE is damaged and
 * cannot re-derive a relation for. linear.app's site header is the canonical
 * one — `width: 1436px; max-width: 1436px` on a flex row item, whose source box
 * measures 641px at a 641px viewport and 1436px at 1440. `inlineSizeBehaviour()`
 * refuses it `flex-item-main-axis` and is right to: `width: auto` on a flex row
 * item is its content size and `width: 100%` sets a flex base size that grow and
 * shrink then move off again, so neither reproduces the observation. The header
 * therefore ships 1436px wide inside a 700px viewport and the navigation is cut
 * off — the exact defect the acceptance criteria name.
 *
 * WHAT THE CLAMP CLAIMS, AND WHAT IT DOES NOT. It does not claim to know the
 * authored relation. It claims something much weaker and fully measured: THIS
 * BOX NEVER LEFT ITS PARENT IN THE SOURCE, AND THE FROZEN PIXEL MAKES IT LEAVE
 * ITS PARENT IN THE CLONE. `max-width: 100%` is the minimal CSS that says so.
 * It cannot make a box smaller than the source at any width where the source fit
 * inside its parent, because that is the containing block the percentage names.
 *
 * IT IS A NO-OP AT THE TRUTH WIDTH BY CONSTRUCTION, which is why it is safe to
 * put through the same post-emit render as everything else: the frozen px is
 * required to BE the truth-width observation (`frozen-width-not-observed`
 * refuses otherwise), and at that width the box fits its parent, so
 * `min(frozen, 100%)` is the frozen value and `errorWith === errorWithout`.
 * The render still runs, and would still reject.
 *
 * THE PREDICATE IS PROVED PER NODE. There is no blanket `max-width: 100%` here
 * and there must never be one: an intentional full-bleed band, a decorative
 * overhang and a horizontally scrolling track are all boxes whose source
 * geometry deliberately leaves the parent, and `source-overflows-parent` refuses
 * every one of them on the source's own measurements plus the negative-margin
 * signature. On the four canary corpora that refusal plus `no-material-damage`
 * account for the overwhelming majority of the population.
 */
export function damageClampWidth(input: {
  node: ElementSpecNode;
  parent: ElementSpecNode | undefined;
  styleLookup: InferLayoutInput["styleLookup"];
  variantIdx: readonly { width: number; i: number }[];
  truthIndex: number;
  /** {@link containingBlockGuard}'s verdict for this node, computed once. */
  guard: LayoutGuardReason | undefined;
}):
  | { ok: true; declarations: Record<string, string>; evidence: string[] }
  | { ok: false; reason: DamageClampRefusalReason } {
  const { node, parent, styleLookup, variantIdx, truthIndex, guard } = input;
  const probe = node.probe;
  const parentProbe = parent?.probe;
  if (!probe || !parentProbe)
    return { ok: false, reason: "fewer-than-two-visible-widths" };
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const frozen = definitePx(own?.["width"]);
  if (frozen === undefined) return { ok: false, reason: "no-frozen-width" };

  const shown = variantIdx.filter(
    (entry) =>
      (probe.v[entry.i] ?? 0) === 1 &&
      (probe.w[entry.i] ?? 0) > 0 &&
      (parentProbe.w[entry.i] ?? 0) > 0,
  );
  if (shown.length < 2)
    return { ok: false, reason: "fewer-than-two-visible-widths" };
  const widths = shown.map((entry) => probe.w[entry.i] ?? 0);
  // CONTROL 1 — the residual audit's own source half, at its own threshold.
  if (
    Math.max(...widths) - Math.min(...widths) <
    RESIDUAL_SOURCE_CHANGE_MIN_PX
  ) {
    return { ok: false, reason: "source-width-constant" };
  }
  if (Math.abs(frozen - (probe.w[truthIndex] ?? 0)) > FULL_WIDTH_TOLERANCE_PX) {
    return { ok: false, reason: "frozen-width-not-observed" };
  }
  if (guard !== undefined && !CLAMPABLE_GUARDS.has(guard)) {
    return { ok: false, reason: "containing-block-not-parent" };
  }

  // CONTROL 2 — the intentional bleed, refused on the SOURCE's own geometry.
  const marginLeft = definitePx(own?.["margin-left"]);
  const marginRight = definitePx(own?.["margin-right"]);
  if (
    (marginLeft !== undefined && marginLeft < -FULL_WIDTH_TOLERANCE_PX) ||
    (marginRight !== undefined && marginRight < -FULL_WIDTH_TOLERANCE_PX)
  ) {
    return { ok: false, reason: "source-overflows-parent" };
  }
  /*
   * THE BOX `100%` ACTUALLY NAMES IS THE PARENT'S CONTENT BOX, NOT ITS BORDER
   * BOX, and the padding it will be reduced by in the CLONE is the exact tier's
   * frozen one. So the containment test is against exactly that estimate. This
   * is not a detail: the first build of this clamp compared against the parent's
   * BORDER box and shipped a cap on linear.app's `<h2 style="width: 1250px">`,
   * whose parent's border box is 1280 at that width but whose CONTENT box is
   * 1188 — the source overflows its containing block there by 62px, and the cap
   * measured exactly 62px of new error on it. A banded parent padding makes this
   * estimate too SMALL at narrow widths, which refuses rather than over-caps.
   */
  const parentPadding = horizontalPadding(parent, styleLookup);
  if (parentPadding === undefined)
    return { ok: false, reason: "own-box-unreadable" };
  const parentInset = parentPadding + horizontalBorder(parent, styleLookup);
  const containingBlockAt = (entry: { width: number; i: number }): number =>
    (parentProbe.w[entry.i] ?? 0) - parentInset;
  for (const entry of shown) {
    const left = probe.x[entry.i] ?? 0;
    const right = left + (probe.w[entry.i] ?? 0);
    const parentLeft = parentProbe.x[entry.i] ?? 0;
    const parentRight = parentLeft + (parentProbe.w[entry.i] ?? 0);
    if (
      left < parentLeft - FULL_WIDTH_TOLERANCE_PX ||
      right > parentRight + FULL_WIDTH_TOLERANCE_PX
    ) {
      return { ok: false, reason: "source-overflows-parent" };
    }
    if (
      (probe.w[entry.i] ?? 0) >
      containingBlockAt(entry) + FULL_WIDTH_TOLERANCE_PX
    ) {
      return { ok: false, reason: "source-overflows-parent" };
    }
  }

  // CONTROL 3 — proven, MATERIAL damage: the frozen box leaves the box `100%` names.
  let worstOverhang = 0;
  let worstAt = 0;
  for (const entry of shown) {
    const overhang = frozen - containingBlockAt(entry);
    if (overhang > worstOverhang) {
      worstOverhang = overhang;
      worstAt = entry.width;
    }
  }
  if (worstOverhang < PARENT_GROWTH_MIN_PX)
    return { ok: false, reason: "no-material-damage" };

  /*
   * A percentage `max-width` caps the CONTENT box unless the node is
   * border-box, exactly as `fillPercentageWidth()` already reasons. Reading an
   * unparseable padding as 0 would emit a cap that still overflows by the
   * padding, which is the silent-zero defect 28.6 V2 removed.
   */
  const borderBox = own?.["box-sizing"] === "border-box";
  let capValue = "100%";
  if (!borderBox) {
    const ownPadding = horizontalPadding(node, styleLookup);
    if (ownPadding === undefined)
      return { ok: false, reason: "own-box-unreadable" };
    const ownInset = ownPadding + horizontalBorder(node, styleLookup);
    if (ownInset !== 0) capValue = `calc(100% - ${round2(ownInset)}px)`;
  }

  const evidence = shown.map(
    (entry) =>
      `${entry.width}px: source box ${round2(probe.x[entry.i] ?? 0)} … ` +
      `${round2((probe.x[entry.i] ?? 0) + (probe.w[entry.i] ?? 0))} inside parent ` +
      `${round2(parentProbe.x[entry.i] ?? 0)} … ` +
      `${round2((parentProbe.x[entry.i] ?? 0) + (parentProbe.w[entry.i] ?? 0))}`,
  );
  evidence.push(
    `frozen width ${round2(frozen)}px overhangs the containing block ` +
      `(parent border box − ${round2(parentInset)}px padding/border) by ` +
      `${round2(worstOverhang)}px at ${worstAt}px — the source's own box never left it`,
  );
  evidence.push(
    `CLAMP, not a recovered relation: the authored width is not re-derived, only ` +
      `capped at the containing block. No-op at the truth width, where the frozen ` +
      `px IS the observation (${round2(probe.w[truthIndex] ?? 0)}px).`,
  );
  evidence.push(
    `containing-block guard: ${guard ?? "none"} (admitted for a percentage cap)`,
  );
  return { ok: true, declarations: { "max-width": capValue }, evidence };
}

// ---------------------------------------------------------------------------
// Task 28.6 A5 — grid COLUMN TRACKS, recovered from observed child geometry
// ---------------------------------------------------------------------------

/**
 * Why {@link recoverGridTracks} refused a grid container.
 *
 * Every one of these means the same thing the containing-block guards mean: the
 * observation does not determine the track structure, so nothing is emitted and
 * the container keeps the frozen used-track pixels the exact tier already gives
 * it. A refusal is always acceptable here; a wrong track list never is.
 */
export type GridTrackRefusalReason =
  /** `grid-template-columns` is absent, `none`, or `subgrid`. */
  | "no-computed-tracks"
  /** The computed track list is not a plain px list (a used value always is). */
  | "tracks-not-px"
  /** `column-gap` is neither `normal` nor a px length. */
  | "gap-not-px"
  /** Padding or border could not be read, so the content box cannot be formed. */
  | "container-box-unreadable"
  /** The container carries no probe arrays. */
  | "no-probe"
  /** Fewer than two desktop probe widths render this container at all. */
  | "fewer-than-2-visible-widths"
  /**
   * The container's CONTENT width never changes across the widths it was
   * observed at, so a fixed px track and a fractional one produce exactly the
   * same measurements. This is the refusal that matters most: it is the
   * difference between recovering a track and guessing one.
   */
  | "container-width-constant"
  /** The deep observation's truth width is not one of the visible widths. */
  | "not-visible-at-truth-width"
  /** A direct child has no probe arrays, so it cannot witness a track. */
  | "child-probe-missing"
  /**
   * The children cannot be a whole number of rows over these columns.
   *
   * TASK 28.7 B2 — RETIRED AS A TEST, KEPT AS A NAME. `rows =
   * children.length / trackCount` was an assumption, not a measurement: a grid
   * with one `display: none` child, or one child spanning a run of columns, is
   * a perfectly ordinary grid that this arithmetic called ragged. The
   * rectangularity test is replaced by a per-track witness requirement (see
   * `not-every-track-witnessed`), so nothing emits this reason any more. The
   * member stays so a manifest written before 28.7 still reads back.
   */
  | "child-count-not-multiple-of-tracks"
  /**
   * At the truth width a child's box matches no single computed track and no
   * consecutive RUN of them (Task 28.7 B2).
   */
  | "children-do-not-tile-tracks"
  /**
   * Some column is measured by no child that occupies it ALONE.
   *
   * Task 28.7 B2 — a column covered only by SPANNING children has no
   * individually determined size: a span of k tracks measures their sum, and
   * any partition of that sum reproduces it. Refusing is the whole fix; see
   * {@link recoverGridTracks}.
   */
  | "not-every-track-witnessed"
  /**
   * Task 28.7 B2 — a direct child computes `display: contents`, so ITS children
   * are the grid items and this list of boxes is not the track structure.
   */
  | "child-display-contents"
  /**
   * Task 28.7 B2 — a `display: none` child (removed from the grid at the truth
   * width) is measured VISIBLE at another observed width, so the grid is
   * restructured across the range this recovery reasons over.
   */
  | "hidden-child-participates-at-another-width"
  /** Task 28.7 B2 — every direct child is removed from the grid. */
  | "no-participating-children"
  /**
   * Task 28.7 B2 — the child's own computed `grid-column` declares a span that
   * contradicts the run its box actually covers. Geometry is the primary
   * signal and this is corroboration only, so a DISAGREEMENT refuses rather
   * than overriding the measurement.
   */
  | "span-contradicts-grid-column"
  /** A child's probe box and its deep-observed box disagree. */
  | "witness-sanity-mismatch"
  /** At some observed width the children stop reproducing the track list. */
  | "tracks-not-reproducible-at-every-width"
  /** Every track is constant px: the recovered rule would say what the exact tier already says. */
  | "all-tracks-fixed"
  /** The fixed tracks and gaps already consume the content box. */
  | "no-free-space"
  /** A track is neither constant px nor a constant share of the free space. */
  | "track-not-fixed-or-fractional";

export const GRID_TRACK_REFUSAL_REASONS: readonly GridTrackRefusalReason[] = [
  "no-computed-tracks",
  "tracks-not-px",
  "gap-not-px",
  "container-box-unreadable",
  "no-probe",
  "fewer-than-2-visible-widths",
  "container-width-constant",
  "not-visible-at-truth-width",
  "child-probe-missing",
  "child-count-not-multiple-of-tracks",
  "children-do-not-tile-tracks",
  "not-every-track-witnessed",
  "child-display-contents",
  "hidden-child-participates-at-another-width",
  "no-participating-children",
  "span-contradicts-grid-column",
  "witness-sanity-mismatch",
  "tracks-not-reproducible-at-every-width",
  "all-tracks-fixed",
  "no-free-space",
  "track-not-fixed-or-fractional",
];

/** One recovered column track. */
export type RecoveredTrack =
  /** Constant px across every observed width. Emitted verbatim. */
  | { kind: "fixed"; px: number }
  /** A constant share of the free space. Emitted as `minmax(0, <weight>fr)`. */
  | { kind: "fractional"; share: number; weight: number };

export interface GridTrackRecovery {
  /** The `grid-template-columns` value this recovery emits. */
  value: string;
  tracks: RecoveredTrack[];
  /**
   * The direct children whose observed boxes this rule is responsible for, with
   * their deep-observed truth rects. The post-emit truth check re-renders them
   * alongside the container: a track list that moves a child is a wrong track
   * list, and the container's own box would not show it.
   */
  witnesses: { nodeId: string; x: number; w: number }[];
  /**
   * TASK 28.75 §03b — per SIZING child, the width of the GRID AREA this rule
   * gives it, at each probe index the container was observed at.
   *
   * TASK 28.6 V5 KEPT A MAP LIKE THIS AND DELETED IT because nothing read it.
   * This one has a reader: {@link gridAreaFillWidth}, which is the only place
   * the module can answer a grid ITEM's frozen width, and it needs the one
   * quantity `containingBlockGuard()` correctly says the probe never measured —
   * the item's containing block. It is supplied here, and ONLY here, because
   * only this function has established it: each child's `(start, span)` came
   * from matching its box against the FROZEN used track list — an independent
   * channel — and the per-width tiling test then proved the children account for
   * the whole content box at every observed width, which is exactly the
   * statement "these items fill their areas".
   *
   * The BANDED recovery deliberately supplies no such thing: there the columns
   * are clustered OUT of the children's boxes, so "the child equals its column"
   * is true by construction and proves nothing.
   */
  areas: { nodeId: string; widths: { i: number; w: number }[] }[];
  evidence: string[];
}

export type GridTrackResult =
  | { ok: true; recovery: GridTrackRecovery }
  | { ok: false; reason: GridTrackRefusalReason };

// ---------------------------------------------------------------------------
// Task 28.7 B1 — residual freeze audit: the evidence side
// ---------------------------------------------------------------------------

/**
 * TASK 28.7 B1 — WHY A REFUSAL IS NOT A NEUTRAL OUTCOME.
 *
 * Every refusal in this module is written as if declining were free: "the node
 * simply keeps its exact computed style, which is the module's existing failure
 * mode". That sentence is true about the CODE and false about the OUTPUT. The
 * exact computed style is a USED value serialized at {@link TRUTH_WIDTH}, so
 * declining to emit a responsive rule IS a decision to ship a 1440-resolved
 * pixel at every other width. Nothing in the pipeline ever checked what that
 * pixel does at a width that is not 1440.
 *
 * This block is the missing check, and it is a DIAGNOSTIC, never a gate — see
 * the report-only note in `layout-truth-check.ts`. Inference builds the source
 * half of the evidence here (probe geometry plus the frozen values and the
 * refusal that left them in place); the truth check renders the clone half and
 * subtracts.
 */
export interface ResidualAuditNode {
  nodeId: string;
  tagName: string;
  parentNodeId?: string;
  /** Descendants in this viewport's tree — the blast radius of one frozen box. */
  descendants: number;
  /** Index-aligned to {@link ResidualAuditPass.widths}. */
  sourceX: number[];
  sourceW: number[];
  sourceV: (0 | 1)[];
  /** The parent's observed widths, same indexing. Absent for a root. */
  parentSourceW?: number[];
  /** The frozen property this record is about, and its exact-tier value. */
  property: string;
  /** The family {@link property} belongs to, for the histogram. */
  family: string;
  frozenValue: string;
  /** Source movement that made this node a candidate, in px. */
  sourceSpreadPx: number;
  /** The recovered rule this node already carries, if any. */
  recoveredKind?: RecoveredRuleKind;
  /** Why recovery declined, when a stage recorded a reason for this node. */
  refusalReason?: string;
}

/** One page × viewport's audit evidence, with its OWN probe width list. */
export interface ResidualAuditPass {
  pageId: string;
  viewportId: LayoutViewportId;
  /**
   * The probe widths this pass's arrays are indexed by — only the half of the
   * width axis this variant is actually displayed on, exactly as every rule in
   * the pass was derived from.
   */
  widths: number[];
  nodes: ResidualAuditNode[];
}

/**
 * Frozen horizontal-layout property families, in the order a record claims
 * them. The FIRST family carrying a px-bearing value is the one a residual is
 * attributed to, so the histogram answers "which frozen family dominates"
 * rather than double-counting a node under five headings.
 */
export const RESIDUAL_FROZEN_FAMILIES: readonly {
  family: string;
  properties: readonly string[];
}[] = [
  { family: "grid-template-columns", properties: ["grid-template-columns"] },
  { family: "width", properties: ["width", "inline-size"] },
  { family: "max-width", properties: ["max-width", "max-inline-size"] },
  { family: "min-width", properties: ["min-width", "min-inline-size"] },
  { family: "flex-basis", properties: ["flex-basis"] },
  { family: "margin-inline", properties: ["margin-left", "margin-right"] },
  { family: "padding-inline", properties: ["padding-left", "padding-right"] },
  { family: "inset-inline", properties: ["left", "right"] },
  { family: "column-gap", properties: ["column-gap", "gap"] },
];

/** The family a node's frozen style is attributed to. Never throws, never guesses. */
export function frozenFamilyOf(
  props: Readonly<Record<string, string>> | undefined,
): { family: string; property: string; value: string } {
  for (const entry of RESIDUAL_FROZEN_FAMILIES) {
    for (const property of entry.properties) {
      const value = props?.[property];
      if (value === undefined) continue;
      // Only a px-BEARING value is frozen. `width: auto`, `max-width: none` and
      // `flex-basis: content` all respond to the viewport on their own.
      if (!/(^|[^a-z-])\d+(\.\d+)?px/.test(value)) continue;
      return { family: entry.family, property, value: value.trim() };
    }
  }
  return { family: "no-frozen-px", property: "", value: "" };
}

/**
 * Task 28.7 B1 — one grid container's refusal, with the node named.
 *
 * The aggregate histogram (`gridTrackRefusalsByReason`) cannot answer "why did
 * node X ship frozen": one real manifest reads `gridTrackRefusals: 209` with no
 * way to name a single one of them. Bounded per route, ranked by the MEASURED
 * cost of the freeze, with a never-silent omitted count — the same shape as
 * `TreeSwitchDecision.candidates` / `candidatesOmitted`.
 */
export interface GridTrackRefusalRecord {
  pageId: string;
  /** Always explicit: an absent `viewportId` reads as `"desktop"` elsewhere. */
  viewportId: LayoutViewportId;
  nodeId: string;
  tagName: string;
  reason: GridTrackRefusalReason;
  childCount: number;
  /** The frozen `grid-template-columns` the exact tier ships instead. */
  frozenTracks?: string;
  trackCount?: number;
  /** px the frozen track list overhangs the container by, at `atWidth`. */
  frozenExcessPx?: number;
  atWidth?: number;
}

/** `[a b] 100px [c]` → `100px`. Chromium keeps authored line names in the used value. */
function stripGridLineNames(value: string): string {
  return value.replace(/\[[^\]]*\]/g, " ");
}

/** The container's used column gap in px, or `undefined` when unreadable. */
function columnGapPx(
  props: Readonly<Record<string, string>>,
): number | undefined {
  const raw = props["column-gap"] ?? props["gap"];
  if (raw === undefined) return 0;
  const trimmed = raw.trim();
  // `normal` is the initial value and computes to 0 on a grid container.
  if (trimmed === "" || trimmed === "normal") return 0;
  // The `gap` shorthand serializes as `<row> <column>`; a single value is both.
  const parts = trimmed.split(/\s+/);
  return parsePx(parts.length > 1 ? parts[1] : parts[0]);
}

/**
 * Task 28.7 B2 — a direct child's role in its grid container's track structure.
 *
 * Decided from the child's OWN computed style, which the exact tier already
 * carries (`display` and `position` are both in the observer's style
 * whitelist) and which `recoverGridTracks()` never used to read. The
 * discrimination the probe cannot make lives here: `probe.v` is
 * `display !== none AND visibility !== hidden AND the box has area`, so it says
 * 0 for a `display: none` child (removed from the grid) and 0 for a
 * `visibility: hidden` child (STILL OCCUPIES ITS CELL) alike.
 */
export type GridChildRole =
  /** Sizes its track run, and is a witness. */
  | "sizing"
  /**
   * Out of flow: sizes NO track (an abspos grid child does not participate in
   * track sizing), but its containing block is its grid area, so a wrong track
   * list still moves it and it must remain a witness.
   */
  | "witness-only"
  /** `display: none` — no box, sizes nothing, witnesses nothing. */
  | "removed"
  /** `display: contents` — ITS children are the grid items. Refuse. */
  | "refuse-display-contents";

export function gridChildRole(
  props: Readonly<Record<string, string>> | undefined,
): GridChildRole {
  const display = props?.["display"];
  if (display === "none") return "removed";
  if (display === "contents") return "refuse-display-contents";
  const position = props?.["position"];
  if (position === "absolute" || position === "fixed") return "witness-only";
  return "sizing";
}

/**
 * Task 28.7 B2 — the column span a child's own `grid-column` DECLARES, if any.
 *
 * CORROBORATION ONLY. Chromium serializes an auto-placed item's `grid-column`
 * as `auto / auto`, so most grid items carry nothing usable here and the span
 * has to come from geometry. `undefined` means "the style says nothing", which
 * is not the same as "the style says span 1".
 */
export function declaredColumnSpan(
  props: Readonly<Record<string, string>> | undefined,
): number | undefined {
  const raw = props?.["grid-column"];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "auto") return undefined;
  const sides = trimmed.split("/").map((side) => side.trim());
  for (const side of sides) {
    const span = /^span\s+(\d+)$/.exec(side);
    if (span) {
      const value = Number(span[1]);
      return Number.isInteger(value) && value >= 1 ? value : undefined;
    }
  }
  if (sides.length !== 2) return undefined;
  const start = Number(sides[0]);
  const end = Number(sides[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start)
    return undefined;
  return end - start;
}

/**
 * Task 28.7 B1 — how much WIDER than the container the frozen track list is, at
 * the narrowest width the container was observed at.
 *
 * This is the arithmetic that makes a grid-track refusal a measured harm rather
 * than a neutral outcome: the exact tier ships `padding-left + Σ used tracks +
 * (n−1) × gap` as an unconditional pixel width, and at any width the container
 * is narrower than the sum of those numbers, the row overhangs. Positive means
 * the frozen list does not fit; zero or negative means the freeze costs nothing
 * measurable inside the observed range.
 *
 * `undefined` when the frozen list cannot be read at all — which is itself one
 * of the refusal reasons, and ranks last rather than pretending to be 0.
 */
export function gridFrozenExcessPx(input: {
  node: ElementSpecNode;
  styleLookup: InferLayoutInput["styleLookup"];
  variantIdx: readonly { width: number; i: number }[];
}):
  | { excessPx: number; atWidth: number; trackCount: number; frozen: string }
  | undefined {
  const { node, styleLookup, variantIdx } = input;
  const props = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  if (props === undefined) return undefined;
  const rawTracks = props["grid-template-columns"];
  if (
    rawTracks === undefined ||
    rawTracks.trim() === "" ||
    rawTracks.trim() === "none"
  ) {
    return undefined;
  }
  const tokens = stripGridLineNames(rawTracks)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return undefined;
  let total = 0;
  for (const token of tokens) {
    const px = parsePx(token);
    if (px === undefined) return undefined;
    total += px;
  }
  const gap = columnGapPx(props);
  if (gap === undefined) return undefined;
  const padding = horizontalPadding(node, styleLookup);
  if (padding === undefined) return undefined;
  const border = horizontalBorder(node, styleLookup);
  const probe = node.probe;
  if (probe === undefined) return undefined;
  const visible = variantIdx.filter(
    (entry) => (probe.v[entry.i] ?? 0) === 1 && (probe.w[entry.i] ?? 0) > 0,
  );
  if (visible.length === 0) return undefined;
  const narrowest = visible.reduce((best, entry) =>
    (probe.w[entry.i] ?? 0) < (probe.w[best.i] ?? 0) ? entry : best,
  );
  const forced = total + gap * (tokens.length - 1) + padding + border;
  return {
    excessPx: round2(forced - (probe.w[narrowest.i] ?? 0)),
    atWidth: narrowest.width,
    trackCount: tokens.length,
    frozen: rawTracks.trim(),
  };
}

/**
 * Task 28.6 A5 — re-express a grid container's COLUMN TRACKS from observation.
 *
 * THE DEFECT. `getComputedStyle().gridTemplateColumns` is the USED track list,
 * always in px. The exact-computed tier therefore ships
 * `grid-template-columns: 448px 224px 224px 224px 224px` for a row the source
 * authored as `2fr repeat(4, 1fr)`, and those five frozen pixels keep summing to
 * 1344 inside every viewport the container is narrower in. No rule kind could
 * express a track before this one, so the freeze had no recovery path at all.
 *
 * THE EVIDENCE, and it is deliberately only these three channels:
 *
 *   1. the container's own computed `display`, `grid-template-columns`,
 *      `column-gap`, padding, border and `box-sizing` — the frozen used values,
 *      which say how many columns there are and where their edges sit AT THE
 *      DEEP-OBSERVATION VIEWPORT;
 *   2. the multi-width layout probe on the container — `{x, w, v}` at each
 *      desktop probe width, which gives the CONTENT WIDTH the tracks had to
 *      divide at each of those widths;
 *   3. the same probe on its direct element children, which is what actually
 *      measures each track: a grid item's used width IS its column's width when
 *      the item fills the column, and the tiling test below is what establishes
 *      that it does.
 *
 * The authored stylesheet is NOT read. `2fr repeat(4, 1fr)` is never parsed,
 * never matched, never consulted — the fractions come out of the child boxes.
 *
 * WHAT MAKES IT A MEASUREMENT RATHER THAN A GUESS. A track observed at ONE
 * container width is consistent with both `Npx` and `<share>fr`; nothing
 * distinguishes them. So the container's content width must actually CHANGE, by
 * at least {@link PARENT_GROWTH_MIN_PX}, across the widths it was observed at.
 * A track that stays the same size while the content box grows is `fixed`; a
 * track whose share of the free space stays the same is `fractional`; a track
 * that is neither refuses the whole container.
 */
export function recoverGridTracks(input: {
  node: ElementSpecNode;
  children: readonly ElementSpecNode[];
  styleLookup: InferLayoutInput["styleLookup"];
  /** Desktop probe entries, as `inferLayoutRules()` computed them. */
  variantIdx: readonly { width: number; i: number }[];
  /** Index of {@link TRUTH_WIDTH} inside the probe arrays. */
  truthIndex: number;
}): GridTrackResult {
  const { node, children, styleLookup, variantIdx, truthIndex } = input;
  const props = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  if (props === undefined)
    return { ok: false, reason: "container-box-unreadable" };

  const rawTracks = props["grid-template-columns"];
  if (
    rawTracks === undefined ||
    rawTracks.trim() === "" ||
    rawTracks.trim() === "none"
  ) {
    return { ok: false, reason: "no-computed-tracks" };
  }
  const trackTokens = stripGridLineNames(rawTracks)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (trackTokens.length === 0)
    return { ok: false, reason: "no-computed-tracks" };
  const usedTracks: number[] = [];
  for (const token of trackTokens) {
    const px = parsePx(token);
    // `parsePx(undefined)` is 0 by contract; a real token must parse as px.
    if (px === undefined) return { ok: false, reason: "tracks-not-px" };
    usedTracks.push(px);
  }
  const trackCount = usedTracks.length;

  const gap = columnGapPx(props);
  if (gap === undefined) return { ok: false, reason: "gap-not-px" };
  const padding = horizontalPadding(node, styleLookup);
  if (padding === undefined)
    return { ok: false, reason: "container-box-unreadable" };
  const border = horizontalBorder(node, styleLookup);

  const probe = node.probe;
  if (!probe) return { ok: false, reason: "no-probe" };
  const visible = variantIdx.filter(
    (entry) => (probe.v[entry.i] ?? 0) === 1 && (probe.w[entry.i] ?? 0) > 0,
  );
  if (visible.length < 2)
    return { ok: false, reason: "fewer-than-2-visible-widths" };
  const contentAt = (i: number): number => (probe.w[i] ?? 0) - padding - border;
  const contentWidths = visible.map((entry) => contentAt(entry.i));
  if (
    Math.max(...contentWidths) - Math.min(...contentWidths) <
    PARENT_GROWTH_MIN_PX
  ) {
    return { ok: false, reason: "container-width-constant" };
  }
  if (!visible.some((entry) => entry.i === truthIndex)) {
    return { ok: false, reason: "not-visible-at-truth-width" };
  }

  /*
   * ------------------------------------------------------------------------
   * TASK 28.7 B2 — WHICH CHILDREN ARE GRID ITEMS, AND WHICH TRACKS THEY COVER.
   * ------------------------------------------------------------------------
   *
   * The pre-28.7 version asked two questions that were not the right ones:
   *
   *   1. `children.length % trackCount === 0`, and later
   *      `rows = children.length / trackCount`. That is an ASSUMPTION of a
   *      perfect rectangle. A footer with six columns and one full-width bar
   *      below them has seven children over six tracks and was refused as
   *      "ragged" while being a completely ordinary grid.
   *   2. `probe.v[truthIndex] === 1` as "does this child participate". The
   *      observer's `v` is `display !== none AND visibility !== hidden AND the
   *      box has area` (`layout-probe.ts`), so it CONFLATES two opposite facts:
   *      a `display: none` child is removed from the grid and occupies nothing,
   *      while a `visibility: hidden` child still occupies its cell and still
   *      sizes its track. Skipping on `v` alone mis-counts in both directions.
   *
   * So participation is decided from the child's OWN computed style — which the
   * exact tier already carries and this function never used to read — and a
   * child may cover a RUN of consecutive tracks rather than exactly one.
   */
  const sizing: ElementSpecNode[] = [];
  const witnessOnly: ElementSpecNode[] = [];
  const removed: ElementSpecNode[] = [];
  const propsOfChild = new Map<
    string,
    Readonly<Record<string, string>> | undefined
  >();
  for (const child of children) {
    const childProps = child.styleTokenId
      ? styleLookup(child.styleTokenId)
      : undefined;
    propsOfChild.set(child.nodeId, childProps);
    const role = gridChildRole(childProps);
    if (role === "refuse-display-contents") {
      return { ok: false, reason: "child-display-contents" };
    }
    if (role === "removed") removed.push(child);
    else if (role === "witness-only") witnessOnly.push(child);
    else sizing.push(child);
  }
  if (sizing.length === 0)
    return { ok: false, reason: "no-participating-children" };
  for (const child of [...sizing, ...witnessOnly]) {
    if (!child.probe) return { ok: false, reason: "child-probe-missing" };
  }
  /*
   * A `display: none` child sizes nothing HERE, and this recovery reasons over
   * every observed width, so it must size nothing THERE either. A child the
   * source brings back at some other width restructures the grid, and a track
   * list measured from the widths where it happened to be absent would be a
   * description of a different grid.
   */
  for (const child of removed) {
    if (child.probe === undefined) continue;
    if (visible.some((entry) => (child.probe!.v[entry.i] ?? 0) === 1)) {
      return {
        ok: false,
        reason: "hidden-child-participates-at-another-width",
      };
    }
  }

  /*
   * Column assignment, at the truth width and from the children's own boxes.
   *
   * The anchor is the leftmost SIZING child rather than the container's content
   * edge, so the assignment needs no `padding-left`/`border-left` split — only
   * the OFFSETS between columns, which is what the used track list gives.
   * (Pre-28.7 the anchor was taken over ALL children, including `display: none`
   * ones whose probe records `x: 0`, which silently dragged the anchor to the
   * viewport origin on every grid that had one.)
   *
   * A child matches when its left edge sits on some track's offset AND its
   * width equals that track, or a RUN of k consecutive tracks PLUS the (k−1)
   * gaps the run absorbs. Exactly one (start, span) must match: a
   * `justify-self: start` item is narrower than its track and matches nothing,
   * which is the test that establishes items fill their columns.
   */
  const anchorX = Math.min(
    ...sizing.map((child) => child.probe!.x[truthIndex] ?? 0),
  );
  const offsets: number[] = [];
  let cursor = 0;
  for (const track of usedTracks) {
    offsets.push(cursor);
    cursor += track + gap;
  }
  /**
   * The width a run of `span` tracks starting at `start` occupies.
   *
   * THE `(k−1) × gap` TERM IS THE WHOLE POINT. A span of k tracks swallows the
   * k−1 gaps between them, so its box is WIDER than the tracks it covers. Omit
   * the term and every track in the run is overstated by `gap×(k−1)/k`, the
   * tiling test below then fails, and one refusal is silently converted into a
   * different refusal instead of being fixed.
   */
  const runWidth = (start: number, span: number): number => {
    let total = gap * (span - 1);
    for (let c = start; c < start + span; c++) total += usedTracks[c]!;
    return total;
  };
  /** Does this child occupy a cell at probe index `i`? */
  const occupiesAt = (child: ElementSpecNode, i: number): boolean => {
    if ((child.probe!.v[i] ?? 0) === 1) return true;
    // `visibility: hidden` / `collapse` is `v === 0` and STILL occupies its
    // cell. Its probe `x`/`w` are the real box (`getBoundingClientRect()` does
    // not care about visibility), so it remains a faithful track measurement.
    const visibilityValue = propsOfChild.get(child.nodeId)?.["visibility"];
    return visibilityValue === "hidden" || visibilityValue === "collapse";
  };
  const placementOf = new Map<string, { start: number; span: number }>();
  for (const child of sizing) {
    const childProbe = child.probe!;
    if (!occupiesAt(child, truthIndex)) {
      return { ok: false, reason: "children-do-not-tile-tracks" };
    }
    const dx = (childProbe.x[truthIndex] ?? 0) - anchorX;
    const dw = childProbe.w[truthIndex] ?? 0;
    const matches: { start: number; span: number }[] = [];
    for (let start = 0; start < trackCount; start++) {
      if (Math.abs(dx - offsets[start]!) > FULL_WIDTH_TOLERANCE_PX) continue;
      for (let span = 1; start + span <= trackCount; span++) {
        const tolerance =
          span === 1 ? FULL_WIDTH_TOLERANCE_PX : GRID_SPAN_TOLERANCE_PX;
        if (Math.abs(dw - runWidth(start, span)) <= tolerance)
          matches.push({ start, span });
      }
    }
    if (matches.length !== 1)
      return { ok: false, reason: "children-do-not-tile-tracks" };
    const placement = matches[0]!;
    /*
     * Corroboration only, never the primary signal: Chromium serializes an
     * AUTO-PLACED item's `grid-column` as `auto / auto`, so most items carry no
     * usable text at all. When one does and it DISAGREES with the geometry, the
     * container is refused rather than either signal overriding the other.
     */
    const declared = declaredColumnSpan(propsOfChild.get(child.nodeId));
    if (declared !== undefined && declared !== placement.span) {
      return { ok: false, reason: "span-contradicts-grid-column" };
    }
    placementOf.set(child.nodeId, placement);
  }

  /*
   * EVERY TRACK MUST BE MEASURED BY A CHILD THAT OCCUPIES IT ALONE.
   *
   * This is the replacement for `perColumn[c] === rows`, and it is the
   * constraint that keeps a ragged grid honest. A span of k tracks measures
   * their SUM, and every partition of that sum reproduces it identically — so a
   * column covered only by spanning children has no determined size and the
   * container is refused. Spanning children are then used for what they CAN
   * prove: that the sizes derived from the span-1 children still add up, at
   * every observed width.
   */
  const spanOneByColumn: ElementSpecNode[][] = Array.from(
    { length: trackCount },
    () => [],
  );
  for (const child of sizing) {
    const placement = placementOf.get(child.nodeId)!;
    if (placement.span === 1) spanOneByColumn[placement.start]!.push(child);
  }
  if (spanOneByColumn.some((list) => list.length === 0)) {
    return { ok: false, reason: "not-every-track-witnessed" };
  }

  /*
   * Track sizes at EVERY observed width, from the span-1 children. Same-column
   * children must agree with each other; every SPANNING child must equal the
   * run it covers (gaps included); and the tracks plus gaps must tile the
   * content box — otherwise the children are not a faithful measurement of the
   * columns at that width (a wrapped row, a media query that restructured the
   * grid) and the container is refused rather than described from one width.
   */
  const sizesAt = new Map<number, number[]>();
  for (const entry of visible) {
    const row: number[] = [];
    for (let c = 0; c < trackCount; c++) {
      const widths: number[] = [];
      for (const child of spanOneByColumn[c]!) {
        if (!occupiesAt(child, entry.i)) {
          return {
            ok: false,
            reason: "tracks-not-reproducible-at-every-width",
          };
        }
        widths.push(child.probe!.w[entry.i] ?? 0);
      }
      if (
        widths.length === 0 ||
        Math.max(...widths) - Math.min(...widths) > WIDTH_CONSTANT_TOLERANCE_PX
      ) {
        return { ok: false, reason: "tracks-not-reproducible-at-every-width" };
      }
      row.push(widths.reduce((sum, width) => sum + width, 0) / widths.length);
    }
    for (const child of sizing) {
      const placement = placementOf.get(child.nodeId)!;
      if (placement.span === 1) continue;
      if (!occupiesAt(child, entry.i)) {
        return { ok: false, reason: "tracks-not-reproducible-at-every-width" };
      }
      // Same `(k−1) × gap` arithmetic as `runWidth()`, now against the MEASURED
      // sizes rather than the frozen used ones.
      let expected = gap * (placement.span - 1);
      for (let c = placement.start; c < placement.start + placement.span; c++) {
        expected += row[c]!;
      }
      if (
        Math.abs((child.probe!.w[entry.i] ?? 0) - expected) >
        GRID_SPAN_TOLERANCE_PX
      ) {
        return { ok: false, reason: "tracks-not-reproducible-at-every-width" };
      }
    }
    const tiled =
      row.reduce((sum, width) => sum + width, 0) + gap * (trackCount - 1);
    if (Math.abs(tiled - contentAt(entry.i)) > FULL_WIDTH_TOLERANCE_PX) {
      return { ok: false, reason: "tracks-not-reproducible-at-every-width" };
    }
    sizesAt.set(entry.i, row);
  }

  // --- classify each track: constant px, or a constant share of free space ---
  const isFixed: boolean[] = [];
  for (let c = 0; c < trackCount; c++) {
    const values = visible.map((entry) => sizesAt.get(entry.i)![c]!);
    isFixed.push(
      Math.max(...values) - Math.min(...values) <= WIDTH_CONSTANT_TOLERANCE_PX,
    );
  }
  if (isFixed.every(Boolean)) return { ok: false, reason: "all-tracks-fixed" };
  const freeAt = new Map<number, number>();
  for (const entry of visible) {
    const row = sizesAt.get(entry.i)!;
    let fixedTotal = 0;
    for (let c = 0; c < trackCount; c++) if (isFixed[c]) fixedTotal += row[c]!;
    const free = contentAt(entry.i) - gap * (trackCount - 1) - fixedTotal;
    if (free <= 0) return { ok: false, reason: "no-free-space" };
    freeAt.set(entry.i, free);
  }
  const shares: (number | undefined)[] = [];
  for (let c = 0; c < trackCount; c++) {
    if (isFixed[c]) {
      shares.push(undefined);
      continue;
    }
    const ratios = visible.map(
      (entry) => sizesAt.get(entry.i)![c]! / freeAt.get(entry.i)!,
    );
    if (
      Math.max(...ratios) - Math.min(...ratios) >
      PERCENTAGE_RATIO_TOLERANCE
    ) {
      return { ok: false, reason: "track-not-fixed-or-fractional" };
    }
    shares.push(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length);
  }

  /*
   * `fr` weights are RELATIVE, so they are normalised by the smallest share —
   * a 2:1:1:1:1 partition prints as `2fr 1fr 1fr 1fr 1fr` rather than
   * `0.333fr 0.167fr …`, and two containers with the same partition print the
   * same string.
   *
   * `minmax(0, <n>fr)` rather than a bare `<n>fr` on purpose: a bare `fr` track
   * has an AUTOMATIC MINIMUM of min-content, so at a width narrower than any
   * that was observed the track could grow past its share and push the columns
   * out — which is a new failure mode this rule would have introduced. The
   * `minmax(0, …)` form holds each track to exactly the share that was measured
   * and lets the CONTENT overflow instead, which is what the frozen px did too.
   */
  const smallest = Math.min(
    ...shares.filter((share): share is number => share !== undefined),
  );
  const tracks: RecoveredTrack[] = [];
  const parts: string[] = [];
  for (let c = 0; c < trackCount; c++) {
    const share = shares[c];
    if (share === undefined) {
      const px = round2(
        visible.reduce((sum, entry) => sum + sizesAt.get(entry.i)![c]!, 0) /
          visible.length,
      );
      tracks.push({ kind: "fixed", px });
      parts.push(`${px}px`);
      continue;
    }
    const weight = Math.round((share / smallest) * 1000) / 1000;
    tracks.push({ kind: "fractional", share, weight });
    parts.push(`minmax(0, ${weight}fr)`);
  }

  /*
   * --- witnesses: the boxes the rule answers for, at the truth viewport -----
   *
   * TASK 28.7 B2 — THE SINGLE MOST IMPORTANT INVARIANT IN THIS FUNCTION. The
   * truth check verifies a grid rule ONLY through `witnesses`
   * (`responsibleBoxes()` in `layout-truth-check.ts`), because a track list
   * leaves the container's own border box exactly where it was. **A grid rule
   * with an empty `witnesses` array is verified against nothing and always
   * passes.** So every child this recovery still MOVES has to appear here —
   * including the ones it stopped using to SIZE tracks:
   *
   *   * `visibility: hidden` children (`sizing`): they occupy a cell, so a
   *     wrong track list moves them.
   *   * out-of-flow children (`witness-only`): they size no track, but an
   *     absolutely positioned grid child's containing block is its GRID AREA,
   *     so a wrong track list moves them too.
   *   * spanning children: their box is the run, so they catch exactly the
   *     errors a per-column witness cannot.
   *
   * The one population left out is `display: none` children, which have no box
   * to move and no box to compare — leaving them out removes nothing from the
   * gate, and putting them in would compare two degenerate 0×0 rects and always
   * pass.
   */
  const witnessed = [...sizing, ...witnessOnly];
  const witnesses: { nodeId: string; x: number; w: number }[] = [];
  for (const child of witnessed) {
    const box = child.boundingBox;
    const childProbe = child.probe!;
    if (
      box === undefined ||
      Math.abs((childProbe.w[truthIndex] ?? 0) - box.width) >
        TRUTH_SANITY_TOLERANCE_PX
    ) {
      return { ok: false, reason: "witness-sanity-mismatch" };
    }
    witnesses.push({ nodeId: child.nodeId, x: box.x, w: box.width });
  }
  if (witnesses.length === 0)
    return { ok: false, reason: "no-participating-children" };
  witnesses.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  const evidence = visible.map((entry) => {
    const row = sizesAt.get(entry.i)!;
    return (
      `${entry.width}px: content ${round2(contentAt(entry.i))} = ` +
      `${row.map((width) => round2(width)).join(" + ")}` +
      (gap > 0 ? ` + ${trackCount - 1}×${round2(gap)} gap` : "")
    );
  });
  evidence.push(
    `used tracks at ${TRUTH_WIDTH}px: ${usedTracks.map((t) => `${round2(t)}px`).join(" ")}`,
  );
  const spanning = sizing.filter(
    (child) => placementOf.get(child.nodeId)!.span > 1,
  );
  evidence.push(
    `${trackCount} column(s); each measured by ≥1 of ${sizing.length - spanning.length} ` +
      `single-column child box(es); ${spanning.length} spanning child box(es) checked ` +
      `against their run; ${removed.length} display:none child(ren) excluded; ` +
      `${witnessOnly.length} out-of-flow child(ren) witnessed but not sizing`,
  );

  const areas = sizing.map((child) => {
    const placement = placementOf.get(child.nodeId)!;
    return {
      nodeId: child.nodeId,
      widths: visible.map((entry) => {
        const row = sizesAt.get(entry.i)!;
        // Same `(k−1) × gap` arithmetic as `runWidth()`: a span swallows the
        // gaps inside it, and its AREA is wider than the tracks it covers.
        let total = gap * (placement.span - 1);
        for (
          let c = placement.start;
          c < placement.start + placement.span;
          c++
        ) {
          total += row[c]!;
        }
        return { i: entry.i, w: round2(total) };
      }),
    };
  });

  return {
    ok: true,
    recovery: {
      value: parts.join(" "),
      tracks,
      witnesses,
      areas,
      evidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 28.75 §03b — BAND-AWARE grid column tracks
// ---------------------------------------------------------------------------

/**
 * Why {@link recoverGridTracksBanded} refused a grid container.
 *
 * Every one of these leaves the container exactly where the single-band pass
 * left it: the frozen used-track pixels from the exact tier, and the refusal
 * that pass already recorded. This mechanism can only ADD an answer; it can
 * never take one away, because it is reached only from a refusal.
 */
export type GridBandRefusalReason =
  /** The container carries no probe arrays. */
  | "no-probe"
  /** Fewer than two probe widths render this container at all. */
  | "fewer-than-2-visible-widths"
  /** A direct child computes `display: contents`: ITS children are the items. */
  | "child-display-contents"
  /** A direct child has no probe arrays, so it cannot witness a column. */
  | "child-probe-missing"
  /** No child participates in the grid at any observed width. */
  | "no-participating-children"
  /**
   * At some width, two children whose left edges coincide disagree on width.
   *
   * They are in the same column and a column has ONE size, so either they are
   * not both filling it (a `justify-self` that is not `stretch`, an inline
   * margin) or one of them spans a run the other does not. Either way the
   * cluster is not a column measurement.
   */
  | "column-children-disagree"
  /**
   * At some width the gaps BETWEEN the clusters are not one number.
   *
   * A grid has one `column-gap`, so unequal gaps mean the clusters are not the
   * columns: an empty column, a spanning item, or a wrapped row is sitting in
   * the middle of them.
   */
  | "gaps-not-uniform"
  /**
   * The observed structure never changes across the range.
   *
   * THE DISCRIMINATOR THAT KEEPS THIS MECHANISM BAND-AWARE. One structure over
   * the whole range is precisely the case the single-band recovery already owns,
   * and it refused. Answering it HERE would be a second, rival recovery of the
   * same shape from a different measurement — so this refuses, and the only
   * containers this mechanism can reach are the ones whose structure genuinely
   * changes at a band edge.
   */
  | "single-band"
  /** Some band is witnessed by fewer than two probe widths. */
  | "band-too-few-widths"
  /**
   * Some band's container width never changes by {@link PARENT_GROWTH_MIN_PX}.
   *
   * The same refusal `container-width-constant` makes, per band: inside a band
   * where the container does not grow, a fixed px track and a fractional one
   * produce identical measurements and nothing distinguishes them.
   */
  | "band-width-constant"
  /**
   * Some band's LEFT or RIGHT inset — the distance from the container's border
   * box to the first/last column — is not constant across the band.
   *
   * This is the proof that the columns are a PARTITION of the content box
   * rather than a fixed-size row sitting inside it. If the row were fixed and
   * the container grew, a centred or end-aligned row would move and one of the
   * insets would grow with it; both staying constant while the container grows
   * by ≥ {@link PARENT_GROWTH_MIN_PX} means the columns absorbed all of the
   * growth. It is also what lets the emitted `fr` weights be correct WITHOUT
   * this module ever forming the container's content width: the browser
   * computes the free space from the real padding at that width, which is
   * exactly the quantity the constant insets prove is the padding.
   */
  | "band-insets-not-constant"
  /** Some band's column gap is not one constant number across the band. */
  | "band-gap-not-constant"
  /** Some band's gaps already consume the row: there is no free space to share. */
  | "band-no-free-space"
  /** Some column is neither a constant share of the free space nor readable as one. */
  | "band-track-not-fractional"
  /**
   * The recovered shares do not sum to the whole row.
   *
   * An EMPTY column is invisible to a measurement taken from child boxes, and
   * this is the test that catches it: a hole in the row makes the witnessed
   * columns add up to less than the free space, and the container is refused
   * rather than described with one column too few.
   */
  | "band-tracks-do-not-partition"
  /** No band contains the truth width, so no band can be verified there. */
  | "truth-band-missing"
  /** A snapped band edge would put an observed sample in the wrong band. */
  | "snapped-edge-crosses-sample"
  /** A child's probe box and its deep-observed box disagree at the truth width. */
  | "witness-sanity-mismatch"
  /** The container has no deep-observed box, so the truth band cannot be verified. */
  | "container-box-unreadable";

export const GRID_BAND_REFUSAL_REASONS: readonly GridBandRefusalReason[] = [
  "no-probe",
  "fewer-than-2-visible-widths",
  "child-display-contents",
  "child-probe-missing",
  "no-participating-children",
  "column-children-disagree",
  "gaps-not-uniform",
  "single-band",
  "band-too-few-widths",
  "band-width-constant",
  "band-insets-not-constant",
  "band-gap-not-constant",
  "band-no-free-space",
  "band-track-not-fractional",
  "band-tracks-do-not-partition",
  "truth-band-missing",
  "snapped-edge-crosses-sample",
  "witness-sanity-mismatch",
  "container-box-unreadable",
];

/** One recovered band: a track list, its `@media` range, and the boxes it answers for. */
export interface GridTrackBand {
  band: HiddenBand;
  /** The `grid-template-columns` value this band emits. */
  value: string;
  /** The `column-gap` this band emits, in px. Co-emitted; see {@link recoverGridTracksBanded}. */
  gapPx: number;
  columnCount: number;
  /** Each column's share of the free space, measured. */
  shares: number[];
  /** Does this band's range contain the viewport's truth width? */
  containsTruthWidth: boolean;
  /** The CONTAINER's box at {@link HiddenBand.verifyWidth}. */
  truth: { x: number; w: number };
  /** The grid items' boxes at {@link HiddenBand.verifyWidth}. */
  witnesses: { nodeId: string; x: number; w: number }[];
  evidence: string[];
}

export type GridTrackBandResult =
  | {
      ok: true;
      bands: GridTrackBand[];
      accounting: BandSnapAccounting;
      /**
       * Each sizing child's grid AREA width at every observed probe index,
       * unioned across the bands (whose index sets are disjoint by construction).
       *
       * TASK 28.75 §03b CYCLE 1 — WHY THIS EXISTS, AND WHAT IT DOES *NOT* CLAIM.
       *
       * The first revision of this pass deliberately published no areas, on the
       * argument that a banded column is clustered OUT of its children, so "the
       * child equals its column" is true by construction and proves nothing.
       * That argument is correct, and it is not the claim {@link gridAreaFillWidth}
       * makes. Its claim is "this item has no inline size of its OWN — it is
       * sized BY its column", and the evidence for that is the item's width
       * MOVING with the container across the band by a constant share, which
       * every band here has already been held to (`band-track-not-fractional`,
       * `band-insets-not-constant`, `band-tracks-do-not-partition`). An item
       * with an authored fixed width cannot move that way, and
       * `gridAreaFillWidth()` refuses `area-width-constant` when it does not.
       *
       * WHAT PAID FOR THE CHANGE. Withholding these areas shipped a MEASURED
       * regression: on hobbang.net the banded track list put the items at the
       * source's exact x while their frozen truth-width `width` stayed, so the
       * mobile tree gained 16–52px of content extent at 640/700/768 and
       * `/` @768 went MAJOR → BLOCKER on a NEW `footer-clipped`. A correct
       * track list whose items are still frozen is worse than no track list.
       */
      areas: { nodeId: string; widths: { i: number; w: number }[] }[];
    }
  | { ok: false; reason: GridBandRefusalReason };

/**
 * TASK 28.75 §03b — RE-EXPRESS A GRID CONTAINER'S TRACKS ONE BAND AT A TIME.
 *
 * THE DEFECT {@link recoverGridTracks} CANNOT REACH. That function measures the
 * columns from the frozen used track list at the truth width and then requires
 * the children to reproduce THAT list at every other observed width. A grid
 * whose column COUNT changes at an authored breakpoint — one column below
 * 768px and two above it, the single commonest responsive grid idiom there is —
 * can never satisfy it: the two-column widths are not a different SIZE of the
 * same one-column structure, they are a different structure, and the refusal
 * `tracks-not-reproducible-at-every-width` is the correct verdict for a
 * mechanism that only has one list to give.
 *
 * So this one gives more than one, and takes its structure from a channel the
 * frozen list cannot supply.
 *
 * WHERE THE STRUCTURE COMES FROM, AND WHY IT IS NOT THE COMPUTED VALUE. Inside a
 * band the deep observation never visited there IS no computed
 * `grid-template-columns` — the exact tier holds exactly one, from the truth
 * viewport. The columns are therefore clustered out of the children's own left
 * edges: children whose left edges coincide are in one column, the distinct
 * edges in order are the column starts, and the column's size is the width its
 * children agree on. The frozen list is never read here, and the authored
 * stylesheet is never read at all.
 *
 * WHAT MAKES EACH BAND A MEASUREMENT RATHER THAN A GUESS. Four controls, and a
 * band failing any of them refuses the whole container:
 *
 *   1. the container's border box must actually GROW inside the band by
 *      {@link PARENT_GROWTH_MIN_PX} — otherwise fixed px and fractional tracks
 *      are indistinguishable, exactly as `container-width-constant` says;
 *   2. the LEFT and RIGHT insets from the container's border box to the row must
 *      each be constant across that growth — which is what proves the columns
 *      partition the content box rather than sitting inside it, and which is
 *      what makes the emitted `fr` weights correct without this module ever
 *      forming the content width itself (the browser forms it, from the real
 *      padding at that width, which may be banded too);
 *   3. every column's share of the free space must be constant across the band;
 *   4. the shares must sum to the whole row, which is the test that catches an
 *      EMPTY column — invisible to a measurement taken from child boxes.
 *
 * WHY THE COLUMN GAP IS CO-EMITTED. The exact tier freezes ONE `column-gap`,
 * from the truth viewport, and a site that changes its column count at a
 * breakpoint routinely changes its gutter there too. A band's `fr` weights are
 * shares of `row − (n−1) × gap`, so shipping the weights against the wrong gap
 * mis-sizes every column in the band. The gap is measured per band from the
 * distances between the clusters and emitted with the track list, which makes
 * each band a self-contained statement.
 *
 * WHY IT CANNOT DISTURB A SHIPPING RULE. It is reached from exactly one place —
 * a `tracks-not-reproducible-at-every-width` refusal — and it refuses
 * `single-band` when the structure does not change, which is the whole domain
 * of the single-band recovery. On the four canary corpora, zero of the 131
 * containers that recover a track list today are multi-band.
 */
export function recoverGridTracksBanded(input: {
  node: ElementSpecNode;
  children: readonly ElementSpecNode[];
  styleLookup: InferLayoutInput["styleLookup"];
  /** Probe entries for THIS viewport variant, as `inferLayoutRules()` computed them. */
  variantIdx: readonly { width: number; i: number }[];
  /** Index of this variant's truth width inside the probe arrays. */
  truthIndex: number;
  /** The page's authored breakpoint histogram, for snapping the band edges. */
  authored: AuthoredBreakpoints | undefined;
}): GridTrackBandResult {
  const { node, children, styleLookup, variantIdx, truthIndex, authored } =
    input;
  const probe = node.probe;
  if (!probe) return { ok: false, reason: "no-probe" };
  const box = node.boundingBox;
  if (box === undefined)
    return { ok: false, reason: "container-box-unreadable" };

  const visible = [...variantIdx]
    .filter(
      (entry) => (probe.v[entry.i] ?? 0) === 1 && (probe.w[entry.i] ?? 0) > 0,
    )
    .sort((a, b) => a.width - b.width);
  if (visible.length < 2)
    return { ok: false, reason: "fewer-than-2-visible-widths" };
  if (!visible.some((entry) => entry.i === truthIndex)) {
    return { ok: false, reason: "truth-band-missing" };
  }

  /*
   * PARTICIPATION, PER WIDTH.
   *
   * `gridChildRole()` reads the TRUTH-width computed style, which is the only
   * style there is — so it says "removed" for a child the source hides at 1440
   * and shows at 768. That child is a grid item at 768 and its box is a real
   * column measurement there, so participation cannot be decided once: it is
   * decided per width, from the probe.
   *
   * The observer's `v` is `display !== none AND visibility !== hidden AND the
   * box has area`, so a `visibility: hidden` child reads `v === 0` while still
   * occupying its cell. Its truth-width `visibility` is the one fact that tells
   * the two apart, and it is used for exactly that.
   */
  const sizing: ElementSpecNode[] = [];
  const witnessOnly: ElementSpecNode[] = [];
  const alwaysOccupies = new Set<string>();
  for (const child of children) {
    const childProps = child.styleTokenId
      ? styleLookup(child.styleTokenId)
      : undefined;
    const role = gridChildRole(childProps);
    if (role === "refuse-display-contents") {
      return { ok: false, reason: "child-display-contents" };
    }
    if (child.probe === undefined)
      return { ok: false, reason: "child-probe-missing" };
    if (role === "witness-only") {
      witnessOnly.push(child);
      continue;
    }
    sizing.push(child);
    const visibility = childProps?.["visibility"];
    if (
      role !== "removed" &&
      (visibility === "hidden" || visibility === "collapse")
    ) {
      alwaysOccupies.add(child.nodeId);
    }
  }
  if (sizing.length === 0)
    return { ok: false, reason: "no-participating-children" };
  const participates = (child: ElementSpecNode, i: number): boolean =>
    (child.probe!.v[i] ?? 0) === 1 || alwaysOccupies.has(child.nodeId);

  /** One width's measured column structure. */
  interface Structure {
    width: number;
    i: number;
    /** Container border-box width at this width. */
    containerW: number;
    /** Column sizes, left to right. */
    tracks: number[];
    /** The one gap between consecutive columns. 0 when there is a single column. */
    gap: number;
    /** Distance from the container's left border edge to the first column. */
    left: number;
    /** Distance from the last column's right edge to the container's right border edge. */
    right: number;
    /** Which children sat in the grid here, sorted — part of the band signature. */
    members: string[];
    /**
     * Which COLUMN each participating child sat in at this width.
     *
     * Task 28.75 §03b cycle 1 — the child's grid AREA, per width, which is the
     * one quantity `containingBlockGuard()` correctly says nothing else
     * measures. See the `areas` field on {@link GridTrackBandResult}.
     */
    columnOf: Map<string, number>;
    signature: string;
  }

  const structures: Structure[] = [];
  for (const entry of visible) {
    const containerX = probe.x[entry.i] ?? 0;
    const containerW = probe.w[entry.i] ?? 0;
    const here = sizing.filter((child) => participates(child, entry.i));
    if (here.length === 0)
      return { ok: false, reason: "no-participating-children" };
    // Cluster by left edge, relative to the container's border box.
    const clusters: { x: number; widths: number[]; ids: string[] }[] = [];
    for (const child of here) {
      const x = round2((child.probe!.x[entry.i] ?? 0) - containerX);
      const width = child.probe!.w[entry.i] ?? 0;
      const existing = clusters.find(
        (cluster) => Math.abs(cluster.x - x) <= FULL_WIDTH_TOLERANCE_PX,
      );
      if (existing) {
        existing.widths.push(width);
        existing.ids.push(child.nodeId);
      } else clusters.push({ x, widths: [width], ids: [child.nodeId] });
    }
    clusters.sort((a, b) => a.x - b.x);
    const columnOf = new Map<string, number>();
    clusters.forEach((cluster, column) => {
      for (const id of cluster.ids) columnOf.set(id, column);
    });
    const tracks: number[] = [];
    for (const cluster of clusters) {
      const spread = Math.max(...cluster.widths) - Math.min(...cluster.widths);
      if (spread > WIDTH_CONSTANT_TOLERANCE_PX) {
        return { ok: false, reason: "column-children-disagree" };
      }
      tracks.push(
        round2(
          cluster.widths.reduce((sum, width) => sum + width, 0) /
            cluster.widths.length,
        ),
      );
    }
    const gaps: number[] = [];
    for (let c = 1; c < clusters.length; c++) {
      gaps.push(round2(clusters[c]!.x - (clusters[c - 1]!.x + tracks[c - 1]!)));
    }
    if (gaps.length > 0) {
      if (Math.min(...gaps) < 0)
        return { ok: false, reason: "gaps-not-uniform" };
      if (Math.max(...gaps) - Math.min(...gaps) > WIDTH_CONSTANT_TOLERANCE_PX) {
        return { ok: false, reason: "gaps-not-uniform" };
      }
    }
    const gap =
      gaps.length === 0
        ? 0
        : round2(gaps.reduce((sum, value) => sum + value, 0) / gaps.length);
    const left = round2(clusters[0]!.x);
    const lastCluster = clusters[clusters.length - 1]!;
    const right = round2(
      containerW - (lastCluster.x + tracks[tracks.length - 1]!),
    );
    const members = here.map((child) => child.nodeId).sort();
    structures.push({
      width: entry.width,
      i: entry.i,
      containerW,
      tracks,
      gap,
      left,
      right,
      members,
      columnOf,
      signature: `${clusters.length}|${members.join(",")}`,
    });
  }

  /*
   * --- runs of one structure, in ascending width order ----------------------
   *
   * A BAND IS EVERYTHING THE RECOVERY HOLDS CONSTANT, not just the column count.
   * The insets and the gap are in the split for the same reason the column count
   * is: linear.app and hobbang.net both change their gutter and their container
   * padding at the very breakpoint where they change the column count, and a run
   * that straddles such a change is not one measurement of one grid — it is two,
   * averaged. Splitting there costs nothing (each side is still witnessed by its
   * own probe widths) and it is what lets `minmax(0, <n>fr)` be correct in both:
   * the weights are shares of `row − (n−1) × gap`, and `gap` is a per-band
   * number.
   *
   * The comparison is anchored on the run's FIRST structure rather than chained
   * to its predecessor, so a slow drift cannot walk a run away from where it
   * started one tolerance at a time. The per-band tests below then re-check the
   * whole run's spread and refuse it outright if the greedy split let it grow
   * too wide.
   */
  const runs: Structure[][] = [];
  for (const structure of structures) {
    const last = runs[runs.length - 1];
    const anchor = last?.[0];
    if (
      last !== undefined &&
      anchor !== undefined &&
      anchor.signature === structure.signature &&
      Math.abs(anchor.left - structure.left) <= FULL_WIDTH_TOLERANCE_PX &&
      Math.abs(anchor.right - structure.right) <= FULL_WIDTH_TOLERANCE_PX &&
      Math.abs(anchor.gap - structure.gap) <= WIDTH_CONSTANT_TOLERANCE_PX
    ) {
      last.push(structure);
    } else runs.push([structure]);
  }
  if (runs.length < 2) return { ok: false, reason: "single-band" };

  // --- per-run recovery -----------------------------------------------------
  interface RunRecovery {
    run: Structure[];
    shares: number[];
    gap: number;
    value: string;
  }
  const recovered: RunRecovery[] = [];
  for (const run of runs) {
    if (run.length < 2) return { ok: false, reason: "band-too-few-widths" };
    const widths = run.map((structure) => structure.containerW);
    if (Math.max(...widths) - Math.min(...widths) < PARENT_GROWTH_MIN_PX) {
      return { ok: false, reason: "band-width-constant" };
    }
    const lefts = run.map((structure) => structure.left);
    const rights = run.map((structure) => structure.right);
    if (
      Math.max(...lefts) - Math.min(...lefts) > FULL_WIDTH_TOLERANCE_PX ||
      Math.max(...rights) - Math.min(...rights) > FULL_WIDTH_TOLERANCE_PX
    ) {
      return { ok: false, reason: "band-insets-not-constant" };
    }
    const gaps = run.map((structure) => structure.gap);
    if (Math.max(...gaps) - Math.min(...gaps) > WIDTH_CONSTANT_TOLERANCE_PX) {
      return { ok: false, reason: "band-gap-not-constant" };
    }
    const gap = round2(
      gaps.reduce((sum, value) => sum + value, 0) / gaps.length,
    );
    const columnCount = run[0]!.tracks.length;
    const frees: number[] = [];
    for (const structure of run) {
      const row = structure.containerW - structure.left - structure.right;
      const free = row - gap * (columnCount - 1);
      if (free <= 0) return { ok: false, reason: "band-no-free-space" };
      frees.push(free);
    }
    const shares: number[] = [];
    for (let c = 0; c < columnCount; c++) {
      const ratios = run.map(
        (structure, k) => structure.tracks[c]! / frees[k]!,
      );
      if (
        Math.max(...ratios) - Math.min(...ratios) >
        PERCENTAGE_RATIO_TOLERANCE
      ) {
        return { ok: false, reason: "band-track-not-fractional" };
      }
      shares.push(
        ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
      );
    }
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (Math.abs(total - 1) > PERCENTAGE_RATIO_TOLERANCE * 2) {
      return { ok: false, reason: "band-tracks-do-not-partition" };
    }
    /*
     * `minmax(0, <n>fr)`, for the reason `recoverGridTracks()` gives: a bare
     * `fr` track carries an AUTOMATIC MINIMUM of min-content and could grow past
     * its measured share at a width narrower than any that was observed. The
     * frozen px this replaces did not do that either.
     */
    const smallest = Math.min(...shares);
    const value = shares
      .map(
        (share) =>
          `minmax(0, ${Math.round((share / smallest) * 1000) / 1000}fr)`,
      )
      .join(" ");
    recovered.push({ run, shares, gap, value });
  }

  // --- band edges: midpoints, then the snap onto what the source authored ----
  const rawBands: HiddenBand[] = recovered.map(({ run }, index) => {
    const previous = recovered[index - 1]?.run;
    const next = recovered[index + 1]?.run;
    const first = run[0]!.width;
    const last = run[run.length - 1]!.width;
    /*
     * The band a run occupies, verified at the widest width inside it — the
     * width at which the container is largest and a wrong track list is
     * therefore most visible. An absent neighbour is an OPEN edge, the same
     * convention `hiddenBands()` uses and for the same reason: the probe
     * measured nothing beyond it, which is not the same as measuring a change.
     */
    const truthHere = run.some((structure) => structure.i === truthIndex);
    const verifyWidth = truthHere
      ? variantIdx.find((entry) => entry.i === truthIndex)!.width
      : last;
    const lowerNeighbour = previous?.[previous.length - 1]?.width;
    const upperNeighbour = next?.[0]?.width;
    return {
      ...(lowerNeighbour !== undefined
        ? {
            minWidth: Math.floor((lowerNeighbour + first) / 2),
            lowerBracket: [lowerNeighbour, first] as const,
          }
        : {}),
      ...(upperNeighbour !== undefined
        ? {
            maxWidth: Math.floor((last + upperNeighbour) / 2),
            upperBracket: [last, upperNeighbour] as const,
          }
        : {}),
      hiddenSamples: run.map((structure) => structure.width),
      verifyWidth,
    };
  });
  const snap = snapBandEdges(rawBands, authored);

  /*
   * THE SCAN THE 28.6 R1 OFF-BY-ONE WOULD HAVE FAILED. Every observed sample
   * must land in the band that was measured from it, and in no other. A snapped
   * edge is a number out of the source's stylesheet that this module had no hand
   * in choosing, so for those edges this really is two independent sources
   * agreeing rather than one convention checking itself.
   */
  for (let index = 0; index < snap.bands.length; index++) {
    for (const structure of recovered[index]!.run) {
      for (let other = 0; other < snap.bands.length; other++) {
        const contains = bandContains(snap.bands[other]!, structure.width);
        if (contains !== (other === index)) {
          return { ok: false, reason: "snapped-edge-crosses-sample" };
        }
      }
    }
  }

  // --- the boxes each band answers for --------------------------------------
  const bands: GridTrackBand[] = [];
  for (let index = 0; index < snap.bands.length; index++) {
    const band = snap.bands[index]!;
    const { run, shares, gap, value } = recovered[index]!;
    const containsTruthWidth = run.some(
      (structure) => structure.i === truthIndex,
    );
    const verifyEntry = run.find(
      (structure) => structure.width === band.verifyWidth,
    )!;
    /*
     * TASK 28.7 B2'S INVARIANT, ONE BAND AT A TIME. A track list leaves the
     * container's own border box exactly where it was, so a rule verified
     * through the container alone is verified against nothing. Every box the
     * rule can MOVE is named: the sizing children, the ones that only occupy
     * (`visibility: hidden`), and the out-of-flow ones whose containing block is
     * their grid AREA.
     */
    const witnessed = [...sizing, ...witnessOnly];
    const witnesses: { nodeId: string; x: number; w: number }[] = [];
    for (const child of witnessed) {
      const childProbe = child.probe!;
      if (containsTruthWidth) {
        // The truth band is measured against the DEEP observation, exactly as
        // `recoverGridTracks()` measures its own, so the two are one convention.
        const childBox = child.boundingBox;
        if (
          childBox === undefined ||
          Math.abs((childProbe.w[truthIndex] ?? 0) - childBox.width) >
            TRUTH_SANITY_TOLERANCE_PX
        ) {
          return { ok: false, reason: "witness-sanity-mismatch" };
        }
        witnesses.push({
          nodeId: child.nodeId,
          x: childBox.x,
          w: childBox.width,
        });
        continue;
      }
      if (
        (childProbe.v[verifyEntry.i] ?? 0) !== 1 &&
        !alwaysOccupies.has(child.nodeId)
      ) {
        // Not in layout at the verify width: it has no box to be moved, and
        // comparing two zero rects would make the check pass for free.
        continue;
      }
      witnesses.push({
        nodeId: child.nodeId,
        x: round2(childProbe.x[verifyEntry.i] ?? 0),
        w: round2(childProbe.w[verifyEntry.i] ?? 0),
      });
    }
    if (witnesses.length === 0)
      return { ok: false, reason: "no-participating-children" };
    witnesses.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    const truth = containsTruthWidth
      ? { x: box.x, w: box.width }
      : {
          x: round2(probe.x[verifyEntry.i] ?? 0),
          w: round2(probe.w[verifyEntry.i] ?? 0),
        };

    const evidence = run.map(
      (structure) =>
        `${structure.width}px: border box ${round2(structure.containerW)} = ` +
        `${round2(structure.left)} + ` +
        `${structure.tracks.map((track) => round2(track)).join(" + ")}` +
        (structure.gap > 0
          ? ` + ${structure.tracks.length - 1}×${round2(structure.gap)} gap`
          : "") +
        ` + ${round2(structure.right)}`,
    );
    evidence.push(
      `band ${band.minWidth === undefined ? "(open)" : `${band.minWidth}px`} … ` +
        `${band.maxWidth === undefined ? "(open)" : `${band.maxWidth}px`}, ` +
        `${run[0]!.tracks.length} column(s), gap ${round2(gap)}px, ` +
        `shares ${shares.map((share) => Math.round(share * 1000) / 1000).join("/")}, ` +
        `verified at ${band.verifyWidth}px` +
        (containsTruthWidth
          ? " (the truth width)"
          : " (an observed probe width)"),
    );
    evidence.push(
      `insets constant across ${round2(Math.min(...run.map((s) => s.containerW)))}→` +
        `${round2(Math.max(...run.map((s) => s.containerW)))}px of container growth: ` +
        `left ${round2(run[0]!.left)}px, right ${round2(run[0]!.right)}px`,
    );
    evidence.push(
      ...(band.edgeDecisions ?? []).map(
        (decision) =>
          `${decision.edge} edge ${decision.px}px ` +
          `(${decision.source}; midpoint ${decision.midpointPx}px; ` +
          `probe gap ${decision.bracket[0]}…${decision.bracket[1]}px; ` +
          `${decision.candidateCount} authored candidate(s))`,
      ),
    );
    bands.push({
      band,
      value,
      gapPx: gap,
      columnCount: run[0]!.tracks.length,
      shares,
      containsTruthWidth,
      truth,
      witnesses,
      evidence,
    });
  }
  if (!bands.some((entry) => entry.containsTruthWidth)) {
    return { ok: false, reason: "truth-band-missing" };
  }
  /*
   * The areas, unioned across bands. Each band's run covers a disjoint set of
   * probe indices, so a child that participates in several bands accumulates one
   * entry per index and never two for the same one. A child that does not
   * participate at some width simply has no entry there, and
   * `gridAreaFillWidth()` refuses `area-not-measured-at-every-width` if it needs
   * one that is missing.
   */
  const areaByChild = new Map<string, { i: number; w: number }[]>();
  for (let index = 0; index < snap.bands.length; index++) {
    for (const structure of recovered[index]!.run) {
      for (const [nodeId, column] of structure.columnOf) {
        const track = structure.tracks[column];
        if (track === undefined) continue;
        const list = areaByChild.get(nodeId) ?? [];
        list.push({ i: structure.i, w: round2(track) });
        areaByChild.set(nodeId, list);
      }
    }
  }
  const areas = [...areaByChild.entries()]
    .map(([nodeId, widths]) => ({
      nodeId,
      widths: widths.sort((a, b) => a.i - b.i),
    }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  return { ok: true, bands, accounting: snap.accounting, areas };
}

// ---------------------------------------------------------------------------
// Task 28.75 §03b — the GRID ITEM's frozen width, against its own grid area
// ---------------------------------------------------------------------------

/** Why {@link gridAreaFillWidth} refused a grid item. */
export type GridAreaFillRefusalReason =
  /** The containing-block guard did not say `grid-item`: this is not that shape. */
  | "not-a-grid-item"
  /**
   * The parent container's tracks were NOT recovered by the single-band pass, so
   * nothing measured the item's grid area at any width but the truth one.
   *
   * This is the load-bearing refusal. `width: auto` on an item inside a
   * container whose tracks are still frozen pixels reproduces the frozen pixel,
   * and claiming a relation for it would be a claim about a box nothing
   * measured — precisely what `containingBlockGuard()` refuses grid items for.
   */
  | "container-tracks-not-recovered"
  /** The item carries no frozen px `width` to restate. */
  | "no-frozen-width"
  /** The frozen px is not the truth-width observation: something else set it. */
  | "frozen-width-not-observed"
  /**
   * The item declares its own definite `min-width`.
   *
   * The emission co-states `min-width: 0`, because a grid item's AUTOMATIC
   * MINIMUM SIZE is min-content and `width: auto` alone would let the item grow
   * past its area — the exact failure Task 28.6 A5(c) measured and reverted for.
   * Where the source declares a real minimum, overriding it to 0 would DISCARD
   * an observed declaration, so the item is refused instead.
   */
  | "own-min-width-declared"
  /** Fewer than two widths render both the item and its container. */
  | "fewer-than-two-visible-widths"
  /** The area never changes: a frozen px and `auto` are indistinguishable. */
  | "area-width-constant"
  /** Some width the item is visible at has no measured area. */
  | "area-not-measured-at-every-width"
  /**
   * At some width the item's border box is not its area.
   *
   * `justify-self` that is not `stretch`, an inline margin, an intrinsic size —
   * any of them, and `width: auto` would not reproduce what was observed.
   */
  | "does-not-fill-area";

export const GRID_AREA_FILL_REFUSAL_REASONS: readonly GridAreaFillRefusalReason[] =
  [
    "not-a-grid-item",
    "container-tracks-not-recovered",
    "no-frozen-width",
    "frozen-width-not-observed",
    "own-min-width-declared",
    "fewer-than-two-visible-widths",
    "area-width-constant",
    "area-not-measured-at-every-width",
    "does-not-fill-area",
  ];

export type GridAreaFillResult =
  | { ok: true; declarations: Record<string, string>; evidence: string[] }
  | { ok: false; reason: GridAreaFillRefusalReason };

/**
 * TASK 28.75 §03b — THE GRID ITEM, ANSWERED FROM ITS OWN AREA.
 *
 * THE DEFECT, MEASURED. On `linear.app /pricing` at 1100px the two plan
 * containers `n000352` and `n000291` already ship a recovered
 * `grid-template-columns: minmax(0, 1fr)` and render a 1008px track — the track
 * recovery is done and it is correct. Their ITEMS still render 1344px wide,
 * because the exact tier put `width: 1344px` on them and no branch may touch it:
 * `containingBlockGuard()` refuses `grid-item`, and it is right to, because a
 * grid item's containing block is its grid AREA and every parent-relative
 * branch divides by the parent's CONTENT box instead. The three outermost
 * overflow roots on that route are exactly those items. Recovering the
 * container's tracks does not free them; nothing in the funnel could.
 *
 * WHAT THIS ADDS THAT THE GUARD DOES NOT HAVE. The guard's objection is that the
 * area was never measured. {@link recoverGridTracks} measures it — that is what
 * it is for — and now says so: `GridTrackRecovery.areas` carries each sizing
 * child's area width at every observed probe index, derived from a placement
 * that was matched against the FROZEN used track list (an independent channel)
 * and then held to the per-width tiling test. So this branch does not relax the
 * guard, and does not consult it except to require that it fired: it supplies
 * the missing measurement and then makes the ordinary argument on top of it.
 * `containingBlockGuard()` is byte-for-byte unchanged.
 *
 * WHY `min-width: 0` IS CO-EMITTED, AND WHY IT IS NOT A NEW CLAIM. Task 28.6
 * A5(c) built a version of this branch, shipped `width: 100%`, and measured 100
 * of 9,252 nodes moving up to 2px AWAY from their observed boxes. It named the
 * cause exactly: a grid item's automatic minimum size is min-content, so
 * `width: auto` on an item whose own child is wider than the area resolves to
 * that child's width. A frozen `width: 1344px` does not honour min-content
 * either — an explicit width never does — so `min-width: 0` restores the
 * behaviour the frozen pixel had rather than inventing one. It is the same
 * argument `recoverGridTracks()` already makes when it emits
 * `minmax(0, <n>fr)` instead of a bare `fr`, and for the same reason.
 *
 * WHAT IT REFUSES. Everything else. An item that does not FILL its area at every
 * observed width (a `justify-self` that is not stretch, an inline margin, an
 * intrinsic size) is refused `does-not-fill-area` — the measurement is the
 * predicate. An item whose area never moves is refused `area-width-constant`,
 * because there a frozen px and `auto` are the same statement. And an item whose
 * container's tracks are still frozen is refused outright, because `auto` there
 * would reproduce the freeze while claiming to have recovered something.
 */
export function gridAreaFillWidth(input: {
  node: ElementSpecNode;
  styleLookup: InferLayoutInput["styleLookup"];
  /** The containing-block verdict, computed once by the caller. */
  guard: LayoutGuardReason | undefined;
  variantIdx: readonly { width: number; i: number }[];
  truthIndex: number;
  /** The area widths {@link recoverGridTracks} measured for this node, by probe index. */
  area: ReadonlyMap<number, number> | undefined;
}): GridAreaFillResult {
  const { node, styleLookup, guard, variantIdx, truthIndex, area } = input;
  if (guard !== "grid-item") return { ok: false, reason: "not-a-grid-item" };
  if (area === undefined || area.size === 0) {
    return { ok: false, reason: "container-tracks-not-recovered" };
  }
  const own = node.styleTokenId ? styleLookup(node.styleTokenId) : undefined;
  const frozen = parsePx(own?.["width"]);
  if (frozen === undefined) return { ok: false, reason: "no-frozen-width" };
  const minWidth = own?.["min-width"];
  if (minWidth !== undefined && minWidth !== "auto") {
    const declared = parsePx(minWidth);
    if (declared === undefined || declared > 0) {
      return { ok: false, reason: "own-min-width-declared" };
    }
  }
  const probe = node.probe;
  if (probe === undefined) return { ok: false, reason: "no-frozen-width" };
  const visible = variantIdx.filter(
    (entry) => (probe.v[entry.i] ?? 0) === 1 && (probe.w[entry.i] ?? 0) > 0,
  );
  if (visible.length < 2)
    return { ok: false, reason: "fewer-than-two-visible-widths" };
  if (
    Math.abs((probe.w[truthIndex] ?? 0) - frozen) > TRUTH_SANITY_TOLERANCE_PX
  ) {
    return { ok: false, reason: "frozen-width-not-observed" };
  }
  const areas: number[] = [];
  for (const entry of visible) {
    const measured = area.get(entry.i);
    if (measured === undefined) {
      return { ok: false, reason: "area-not-measured-at-every-width" };
    }
    areas.push(measured);
  }
  if (Math.max(...areas) - Math.min(...areas) < PARENT_GROWTH_MIN_PX) {
    return { ok: false, reason: "area-width-constant" };
  }
  for (let k = 0; k < visible.length; k++) {
    const observed = probe.w[visible[k]!.i] ?? 0;
    if (Math.abs(observed - areas[k]!) > FULL_WIDTH_TOLERANCE_PX) {
      return { ok: false, reason: "does-not-fill-area" };
    }
  }
  const evidence = visible.map(
    (entry, k) =>
      `${entry.width}px: item ${round2(probe.w[entry.i] ?? 0)} = grid area ${round2(areas[k]!)}`,
  );
  evidence.push(
    `frozen width ${round2(frozen)}px; area moves ${round2(Math.min(...areas))}→` +
      `${round2(Math.max(...areas))}px across ${visible.length} observed width(s)`,
  );
  evidence.push(
    "min-width: 0 co-emitted — a grid item's automatic minimum is min-content, " +
      "which the frozen px did not honour either (Task 28.6 A5(c))",
  );
  return {
    ok: true,
    declarations: { width: "auto", "min-width": "0px" },
    evidence,
  };
}

/*
 * TASK 28.75 §03b CYCLE 1 — THE A/B GATE IS GONE, AND WHAT PAID FOR ITS REMOVAL.
 *
 * `WR_GRID_BANDS` and `WR_GRID_ITEM_FILL` gated the two branches below while
 * their flag-OFF builds were proved byte-identical to the pre-lane artifacts by
 * SHA-256 — linear.app `78f7e616…`, hobbang.net `1c01ada3…`,
 * gs.severance.healthcare `d6335416…`, each matching the shipped baseline
 * exactly. The flag-ON builds were then measured two-directionally against the
 * source's own probe, every node, every displayed width:
 *
 *   linear.app  77,688 comparisons  width 2,032 improved / 5 worsened
 *                                   x     3,426 improved / 44 worsened
 *                                   total width error 2,959,679 → 2,558,196px
 *   hobbang.net measured on the same axis; see docs/result/28.75/03b.
 *   gs.severance.healthcare  flag-ON output byte-identical to flag-OFF: it has
 *                            no grid containers, so neither branch can reach it.
 *
 * No dead toggle ships, so the constants are deleted rather than defaulted on.
 */

/** The viewports a layout pass runs over, in a fixed order (Task 28.6 C2b). */
export const LAYOUT_VIEWPORT_IDS = ["desktop", "mobile"] as const;
export type LayoutViewportId = (typeof LAYOUT_VIEWPORT_IDS)[number];

/** Why one viewport's pass produced nothing. Every value is COUNTED, never silent. */
export type ViewportPassRefusal =
  /**
   * The SiteSpec carries no probe record for this viewport. For `mobile` on
   * every pre-28.6 artifact this is the NORMAL case — `layoutProbeMobile` did
   * not exist before schemaVersion 6 — and it is counted rather than treated as
   * "the probe found nothing", because those are different facts.
   */
  | "probe-absent"
  /**
   * The probe record exists and says NOTHING was attached: its walk did not
   * match this viewport's element list, or it ran in the wrong browser context,
   * or the observer truncated it. `PageSpec.layoutProbeMobile.refusedReason`
   * names which, and requirement (a) is that this module READS that verdict
   * rather than re-deriving it — the compiler already did the alignment and a
   * second opinion here could only disagree with it.
   */
  | "probe-not-attached"
  /**
   * Fewer than two probe widths fall on this variant's side of the breakpoint,
   * so nothing can be compared across widths.
   */
  | "fewer-than-two-widths"
  /**
   * No probe width equals this viewport's truth width, so no sample can be
   * checked against the deep observation and every rule would be unanchored.
   */
  | "truth-width-not-probed"
  /** The page carries no node list for this viewport at all. */
  | "viewport-absent";

export const VIEWPORT_PASS_REFUSALS: readonly ViewportPassRefusal[] = [
  "probe-absent",
  "probe-not-attached",
  "fewer-than-two-widths",
  "truth-width-not-probed",
  "viewport-absent",
];

export type ResolvedViewportPass =
  | {
      ok: true;
      probeInfo: { widths: number[] };
      viewport: ViewportPageSpec;
      variantIdx: { width: number; i: number }[];
      truthEntry: { width: number; i: number };
    }
  | { ok: false; reason: ViewportPassRefusal };

/**
 * PAIR ONE VIEWPORT WITH ITS OWN PROBE — or refuse and say which check failed.
 *
 * Requirement (a) of C2b in one function. The probe-to-element identity is NOT
 * re-derived here: the SiteSpec compiler already walked both lists and wrote its
 * verdict into `aligned` / `alignedElementCount` / `refusedReason`, so this reads
 * that verdict. A second alignment opinion could only ever disagree with the one
 * that decided whether the per-node arrays were attached at all, and the arrays
 * are what every rule below is computed from.
 *
 * Requirement (b): an ABSENT field degrades cleanly. Every artifact compiled
 * before schemaVersion 6 lacks `layoutProbeMobile`, and for those the mobile pass
 * refuses with `probe-absent` and the desktop pass proceeds exactly as it did
 * before this change — the counter is how a reader tells an old artifact from a
 * site whose mobile probe genuinely failed.
 */
export function resolveViewportProbe(
  page: PageSpec,
  viewportId: LayoutViewportId,
  options: { breakpoint: number; truthWidth: number },
): ResolvedViewportPass {
  const probeInfo =
    viewportId === "desktop" ? page.layoutProbe : page.layoutProbeMobile;
  if (probeInfo === undefined) return { ok: false, reason: "probe-absent" };
  // Full alignment or a usable prefix (≥90% of both walks) both qualify: nodes
  // outside the attached range simply carry no probe arrays.
  const attached =
    probeInfo.aligned || (probeInfo.alignedElementCount ?? 0) > 0;
  if (!attached) return { ok: false, reason: "probe-not-attached" };
  const viewport = page.viewports[viewportId];
  if (viewport === undefined) return { ok: false, reason: "viewport-absent" };
  /*
   * The half of the width axis this variant is VISIBLE on. `globals.css` hides
   * the desktop tree below the breakpoint and the mobile tree at or above it
   * (see `breakpointMediaQueries()`), so a rule inferred from a width where its
   * own variant is not displayed would describe a box nobody ever sees.
   */
  const variantIdx = probeInfo.widths
    .map((width, i) => ({ width, i }))
    .filter((entry) =>
      viewportId === "desktop"
        ? entry.width >= options.breakpoint
        : entry.width < options.breakpoint,
    );
  if (variantIdx.length < 2)
    return { ok: false, reason: "fewer-than-two-widths" };
  const truthEntry = variantIdx.find(
    (entry) => entry.width === options.truthWidth,
  );
  if (truthEntry === undefined)
    return { ok: false, reason: "truth-width-not-probed" };
  return { ok: true, probeInfo, viewport, variantIdx, truthEntry };
}

/*
 * ---------------------------------------------------------------------------
 * TASK 28.8 A2 — AUTHORED INLINE-SIZE INTENT, THE FINAL FALLBACK.
 * ---------------------------------------------------------------------------
 *
 * Everything above this point recovers a relation by MEASURING the source at
 * several widths and proving the relation held at all of them. That is the
 * strongest evidence available and it is why those branches run first.
 *
 * This branch uses a different, weaker, and much more plentiful kind of
 * evidence: the source's OWN CSS. `ElementSpecNode.authoredLayout` carries the
 * declarations the browser matched to this element, verbatim — `width: 100%`,
 * `max-width: 1200px`, `margin-inline: auto`, `grid-template-columns: repeat(3, 1fr)`.
 * Until 28.8 the pipeline read those only as evidence ABOUT other decisions and
 * never emitted one, so a node the measurement branches declined shipped the
 * frozen used pixel even when the stylesheet it came from said `width: 100%`
 * in so many words. On seoultone.kr that is 1,215 `width:%` declarations and
 * 835 `max-width:%` the clone knew about and threw away.
 *
 * WHY IT IS LAST, AND WHY IT IS NARROW. An authored declaration is not a
 * measurement: the browser may have matched it and then had it overridden by a
 * rule this allowlist does not record, and a declaration under an `@media` says
 * nothing about the widths outside that media's range. So this branch:
 *
 *  - runs ONLY for nodes no recovered rule already answers for, so it can never
 *    displace a measured relation;
 *  - considers a closed set of properties, and inside them a closed set of
 *    VALUE SHAPES that express a relation rather than a frozen number — a px
 *    `width` is refused, because that is the very thing the exact tier already
 *    ships and re-emitting it recovers nothing;
 *  - accepts a media-conditional declaration only when its condition is true
 *    across the WHOLE range its viewport serves, so the rule cannot be right at
 *    one width and wrong at another inside the same variant;
 *  - checks the value against the observed truth box before emitting, so a
 *    stale or overridden declaration is refused here rather than rejected later
 *    by a browser render;
 *  - and then goes through `verifyLayoutRules()` exactly like every other kind.
 */

/** The closed set of properties whose authored value this branch will re-emit. */
export const AUTHORED_INTENT_PROPERTIES: readonly string[] = [
  "width",
  "max-width",
  "min-width",
  "margin-left",
  "margin-right",
  "margin-inline",
  "grid-template-columns",
];

/** Why one node produced no authored-intent rule. */
export type AuthoredIntentRefusal =
  /** The node carries no `authoredLayout` at all (the common case). */
  | "no-authored-layout"
  /** It carries declarations, but none in {@link AUTHORED_INTENT_PROPERTIES}. */
  | "no-admissible-property"
  /** Every candidate declaration was refused. See the declaration histogram. */
  | "no-admissible-declaration"
  /** Computed `display` is inline: `width` does not apply to it at all. */
  | "node-display-inline"
  /** Computed `position` is absolute/fixed: its width is an inset equation. */
  | "node-out-of-flow"
  /** No observed truth box, so no pre-check and no rect for the truth check. */
  | "no-truth-box"
  /** A recovered rule already sets this node's inline size. */
  | "already-recovered";

/** Why ONE declaration was refused. Per declaration, not per node. */
export type AuthoredIntentDeclarationRefusal =
  /**
   * TASK 28.8 A2b — `var(...)` this module could not READ: unbalanced
   * parentheses, an empty name, or nesting past {@link AUTHORED_VAR_MAX_DEPTH}.
   * Distinct from `value-uses-var-unresolved`, which is a well-formed reference
   * to a property the clone does not declare.
   */
  | "value-uses-var"
  /**
   * TASK 28.8 A2b — a well-formed `var(--name)` whose NAME is not among the
   * custom properties this reconstruction emits for that page × viewport, and
   * which carries no usable fallback. Emitting it would ship a declaration that
   * resolves to nothing in the clone.
   */
  | "value-uses-var-unresolved"
  /** A px `width` — the frozen pixel the exact tier already ships. */
  | "value-frozen-px"
  /** A shape this branch does not read. */
  | "value-unparsed"
  /** A margin that is not `auto` says nothing about inline size. */
  | "margin-not-auto"
  /** A `grid-template-columns` with no fr/repeat/minmax/% — a frozen track list. */
  | "grid-tracks-frozen"
  /** The `@media` condition is true across only PART of this viewport's range. */
  | "media-partial-range"
  /** The `@media` condition could not be read at all. */
  | "media-unparsed"
  /** The value contradicts the node's observed box at the truth width. */
  | "authored-inconsistent-with-truth"
  /** The value could not survive `isSafeCssValue` (untrusted page content). */
  | "value-unsafe";

const AUTHORED_VAR = /\bvar\s*\(/i;
const AUTHORED_PX = /^[+-]?(?:\d+\.?\d*|\.\d+)px$/i;
const AUTHORED_PERCENT = /^[+-]?(?:\d+\.?\d*|\.\d+)%$/;
const AUTHORED_VIEWPORT_UNIT =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:vw|vh|vmin|vmax|dvw|dvh|svw|svh|lvw|lvh)$/i;
const AUTHORED_FONT_RELATIVE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:em|rem|ch|ex)$/i;
const AUTHORED_FUNCTION = /^(?:calc|min|max|clamp|fit-content)\s*\(/i;
const AUTHORED_INTRINSIC = new Set([
  "auto",
  "fit-content",
  "max-content",
  "min-content",
  "stretch",
  "-webkit-fill-available",
]);
const AUTHORED_GRID_RELATIONAL =
  /(?:\bfr\b|repeat\s*\(|minmax\s*\(|auto-fit|auto-fill|%)/i;

/** Displays for which an inline-size declaration is simply not applicable. */
const AUTHORED_INTENT_INLINE_DISPLAYS = new Set(["inline", "contents", "none"]);

/** One admissible declaration, after parsing. */
interface AuthoredIntentDeclaration {
  property: string;
  value: string;
  /** How many admissible declarations existed for this property (cascade depth). */
  candidates: number;
  /** Task 28.8 A2b — admitted through a resolved `var()` reference. */
  usedVar: boolean;
}

/** No custom properties declared for a scope. Shared, so no allocation per node. */
const EMPTY_CUSTOM_PROPERTIES: ReadonlyMap<string, string> = new Map();

export type AuthoredIntentAnswer =
  | {
      ok: true;
      declarations: Record<string, string>;
      evidence: string[];
      /** Admissible declarations beyond the one taken, summed over properties. */
      cascadeCandidates: number;
      /** Task 28.8 A2b — emitted declarations admitted through a `var()`. */
      varAdmitted: number;
    }
  | { ok: false; reason: AuthoredIntentRefusal };

export interface AuthoredIntentInput {
  node: ElementSpecNode;
  styleLookup: (
    styleTokenId: string,
  ) => Readonly<Record<string, string>> | undefined;
  /**
   * The INCLUSIVE width range this viewport's variant is served at:
   * `[0, mobileMaxPx]` for mobile, `[desktopMinPx, Infinity]` for desktop. A
   * media-conditional declaration must be true across the whole of it.
   */
  servedRange: readonly [number, number];
  /** The node's observed border-box width at its truth viewport. */
  truthWidth: number | undefined;
  /** The parent's observed CONTENT-box width at the truth viewport, if readable. */
  parentContentWidth: number | undefined;
  /**
   * TASK 28.8 A2b — the custom properties THIS reconstruction emits for this
   * node's page × viewport scope, name → value. A `var()` reference is
   * admissible only against this map; absent means "none declared", and every
   * `var()` without a fallback is then refused rather than shipped dangling.
   */
  customProperties?: ReadonlyMap<string, string>;
  /** A recovered rule already answers this node's inline size. */
  alreadyRecovered: boolean;
  /** Every refused declaration is reported here, with its reason. */
  onDeclarationRefusal: (
    property: string,
    reason: AuthoredIntentDeclarationRefusal,
  ) => void;
}

/**
 * Does `media` hold across the WHOLE of `[lo, hi]`?
 *
 * "Partly" is a refusal, not a hedge: a rule emitted unconditionally from a
 * declaration that is true only above 1024px is wrong at 801px, and the truth
 * check renders at 1440 where it would look right.
 */
export function authoredMediaHolds(
  media: string | undefined,
  lo: number,
  hi: number,
): "holds" | "partial" | "unparsed" {
  if (media === undefined || media.trim() === "") return "holds";
  const parsed = parseMediaCondition(media);
  if (parsed.status === "unparsed" || parsed.status === "unsupported")
    return "unparsed";
  if (parsed.status === "width-irrelevant") {
    /*
     * `screen` / `all` with no features is true at every width. Anything else —
     * `print`, `(hover: hover)`, `(prefers-color-scheme: dark)` — is a context
     * this module cannot evaluate, and "cannot evaluate" is not "true".
     */
    const trivial = parsed.alternatives.some(
      (alternative) =>
        alternative.screenApplicable &&
        alternative.qualifier !== "not" &&
        alternative.features.length === 0,
    );
    return trivial ? "holds" : "unparsed";
  }
  /*
   * A disjunction is covered only if ONE alternative covers the range on its
   * own. A union of two partial ranges may well cover it, but proving that needs
   * interval arithmetic this branch does not need to be right.
   */
  for (const alternative of parsed.alternatives) {
    if (!alternative.screenApplicable) continue;
    if (alternative.qualifier === "not") continue;
    if (alternative.status !== "width") continue;
    const interval = alternative.interval;
    if (interval === undefined || interval.empty) continue;
    const min = interval.min;
    const max = interval.max;
    const lowOk =
      min === undefined || (min.inclusive ? min.px <= lo : min.px < lo);
    const highOk =
      max === undefined || (max.inclusive ? max.px >= hi : max.px > hi);
    if (lowOk && highOk) return "holds";
  }
  return "partial";
}

/**
 * How deep a `var()` chain this module will follow. A custom property whose
 * value is itself a `var()` is ordinary (`--1fr: minmax(0, 1fr)` is not, but
 * `--gap: var(--space-4)` is); four levels covers every chain on the corpus and
 * bounds the substitution against a cyclic declaration.
 */
export const AUTHORED_VAR_MAX_DEPTH = 4;

/** Stands in for a reference that resolved to nothing; no shape test accepts it. */
const AUTHORED_VAR_UNRESOLVED_SENTINEL = "wr-unresolved-custom-property";

export type AuthoredVarResolution =
  /** No `var()`, or every reference resolved. `text` is the resolved form. */
  | { status: "resolved"; text: string; usedVar: boolean }
  /** Well-formed, but a referenced name is not declared and has no fallback. */
  | { status: "unresolved"; missing: string[] }
  /** Could not be read as `var()` syntax at all. */
  | { status: "malformed" };

/**
 * TASK 28.8 A2b — RESOLVE `var()` FOR THE ADMISSION TEST ONLY.
 *
 * The emitted declaration is the source's own text, verbatim — the browser does
 * the resolving, and substituting would throw away exactly the per-viewport
 * indirection that makes these declarations worth recovering
 * (`--grid-columns: 4` on mobile and `12` on desktop is one authored rule and
 * two correct layouts). What the substitution is FOR is the shape test: this
 * module must still be able to say "that is a relation, not a frozen pixel",
 * and `var(--page-max-width)` says nothing about which it is until the value
 * behind the name is read.
 *
 * A reference resolves when the name is declared in the scope the clone emits
 * for this page × viewport, or when it carries a fallback — `var(--x, 100%)` is
 * admissible on the fallback's own merits, which is what CSS does at runtime
 * when `--x` is missing.
 */
export function resolveAuthoredVars(
  raw: string,
  declared: ReadonlyMap<string, string>,
): AuthoredVarResolution {
  let text = raw;
  let usedVar = false;
  const missing: string[] = [];
  for (let depth = 0; depth <= AUTHORED_VAR_MAX_DEPTH; depth++) {
    const start = text.toLowerCase().indexOf("var(");
    if (start === -1) {
      return missing.length > 0
        ? { status: "unresolved", missing }
        : { status: "resolved", text, usedVar };
    }
    if (depth === AUTHORED_VAR_MAX_DEPTH) return { status: "malformed" };
    usedVar = true;
    // Balanced-paren scan, so a fallback containing its own parentheses
    // (`var(--x, calc(100% - 2px))`) is not cut in half.
    let level = 0;
    let end = -1;
    for (let i = start + 3; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") level++;
      else if (ch === ")") {
        level--;
        if (level === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return { status: "malformed" };
    const inner = text.slice(start + 4, end);
    // The name ends at the first TOP-LEVEL comma; everything after is fallback.
    let commaAt = -1;
    let innerLevel = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") innerLevel++;
      else if (ch === ")") innerLevel--;
      else if (ch === "," && innerLevel === 0) {
        commaAt = i;
        break;
      }
    }
    const name = (commaAt === -1 ? inner : inner.slice(0, commaAt)).trim();
    const fallback = commaAt === -1 ? undefined : inner.slice(commaAt + 1).trim();
    if (!/^--[A-Za-z0-9_-]+$/.test(name)) return { status: "malformed" };
    const declaredValue = declared.get(name);
    let replacement: string;
    if (declaredValue !== undefined) {
      replacement = declaredValue;
    } else if (fallback !== undefined && fallback !== "") {
      replacement = fallback;
    } else {
      missing.push(name);
      // Replace with a token no shape test accepts, so the scan can continue and
      // report EVERY missing name rather than only the first.
      replacement = AUTHORED_VAR_UNRESOLVED_SENTINEL;
    }
    text = text.slice(0, start) + replacement + text.slice(end + 1);
  }
  if (missing.length > 0) return { status: "unresolved", missing };
  return { status: "resolved", text, usedVar };
}

/** Is this authored VALUE a relation rather than a frozen measurement? */
function authoredValueAdmissible(
  property: string,
  raw: string,
): AuthoredIntentDeclarationRefusal | "ok" {
  const value = raw.trim();
  if (value === "") return "value-unparsed";
  if (AUTHORED_VAR.test(value)) return "value-uses-var";
  if (!isSafeCssValue(value)) return "value-unsafe";
  if (property === "grid-template-columns") {
    return AUTHORED_GRID_RELATIONAL.test(value) ? "ok" : "grid-tracks-frozen";
  }
  if (
    property === "margin-left" ||
    property === "margin-right" ||
    property === "margin-inline"
  ) {
    return /\bauto\b/i.test(value) ? "ok" : "margin-not-auto";
  }
  const lower = value.toLowerCase();
  if (AUTHORED_INTRINSIC.has(lower)) return "ok";
  if (lower === "none")
    return property === "max-width" ? "ok" : "value-unparsed";
  if (AUTHORED_PERCENT.test(value)) return "ok";
  if (AUTHORED_VIEWPORT_UNIT.test(value)) return "ok";
  if (AUTHORED_FONT_RELATIVE.test(value)) return "ok";
  if (AUTHORED_FUNCTION.test(value)) return "ok";
  if (AUTHORED_PX.test(value)) {
    // A px CAP is a relation ("never wider than this"); a px WIDTH is the frozen
    // number the exact tier already ships, and re-emitting it recovers nothing.
    return property === "max-width" || property === "min-width"
      ? "ok"
      : "value-frozen-px";
  }
  return "value-unparsed";
}

/** Light pre-checks against the observed box, so the truth check has less to reject. */
function authoredConsistentWithTruth(
  property: string,
  value: string,
  truthWidth: number,
  parentContentWidth: number | undefined,
): boolean {
  const lower = value.trim().toLowerCase();
  if (AUTHORED_PX.test(lower)) {
    const px = Number.parseFloat(lower);
    if (!Number.isFinite(px)) return true;
    // A cap below the observed width would shrink the box at the truth width.
    if (property === "max-width") return px >= truthWidth - 1;
    // A floor above it would widen the box at the truth width.
    if (property === "min-width") return px <= truthWidth + 1;
    return true;
  }
  if (property === "width" && AUTHORED_PERCENT.test(lower)) {
    if (parentContentWidth === undefined || parentContentWidth <= 0)
      return true;
    const pct = Number.parseFloat(lower);
    if (!Number.isFinite(pct)) return true;
    const observedPct = (truthWidth / parentContentWidth) * 100;
    return Math.abs(pct - observedPct) <= 1;
  }
  return true;
}

/**
 * The whole branch, for ONE node in ONE viewport.
 *
 * Emits nothing unless the source's own CSS names a relation this module can
 * read, that holds across the whole range the variant serves, and that agrees
 * with the box the observation measured.
 */
export function authoredInlineSizeIntent(
  input: AuthoredIntentInput,
): AuthoredIntentAnswer {
  const { node } = input;
  if (input.alreadyRecovered) return { ok: false, reason: "already-recovered" };
  if (node.tagName === "html" || node.tagName === "body") {
    return { ok: false, reason: "node-out-of-flow" };
  }
  const authored = node.authoredLayout ?? [];
  if (authored.length === 0) return { ok: false, reason: "no-authored-layout" };

  const props = node.styleTokenId
    ? input.styleLookup(node.styleTokenId)
    : undefined;
  const display = props?.["display"];
  if (display !== undefined && AUTHORED_INTENT_INLINE_DISPLAYS.has(display)) {
    return { ok: false, reason: "node-display-inline" };
  }
  const position = props?.["position"];
  if (position === "absolute" || position === "fixed") {
    return { ok: false, reason: "node-out-of-flow" };
  }
  const truthWidth = input.truthWidth;
  if (truthWidth === undefined || !(truthWidth > 0)) {
    return { ok: false, reason: "no-truth-box" };
  }

  const [lo, hi] = input.servedRange;
  const admissible = new Map<string, AuthoredIntentDeclaration>();
  /**
   * Was a `width` DECLARED at all, in any admissible or inadmissible form? A
   * `max-width` with no `width` beside it means the source's own width IS
   * `auto`; a px `width` beside it means the frozen pixel must stay.
   */
  let widthDeclaredAnyForm = false;
  let sawAllowlistedProperty = false;

  for (const rule of authored) {
    const property = rule.property;
    if (property === "width") widthDeclaredAnyForm = true;
    if (!AUTHORED_INTENT_PROPERTIES.includes(property)) continue;
    sawAllowlistedProperty = true;

    /*
     * TASK 28.8 A2b — resolve `var()` for the SHAPE TEST, emit the source's own
     * text. See {@link resolveAuthoredVars}: the substitution decides whether
     * this is a relation or a frozen pixel; it never reaches the stylesheet.
     */
    const resolution = resolveAuthoredVars(
      rule.value,
      input.customProperties ?? EMPTY_CUSTOM_PROPERTIES,
    );
    if (resolution.status === "malformed") {
      input.onDeclarationRefusal(property, "value-uses-var");
      continue;
    }
    if (resolution.status === "unresolved") {
      input.onDeclarationRefusal(property, "value-uses-var-unresolved");
      continue;
    }
    // The EMITTED text is untrusted page content in its own right, and it is not
    // the text the shape test just read.
    if (!isSafeCssValue(rule.value.trim())) {
      input.onDeclarationRefusal(property, "value-unsafe");
      continue;
    }
    const effectiveValue = resolution.text;
    const valueVerdict = authoredValueAdmissible(property, effectiveValue);
    if (valueVerdict !== "ok") {
      input.onDeclarationRefusal(property, valueVerdict);
      continue;
    }
    const mediaVerdict = authoredMediaHolds(rule.media, lo, hi);
    if (mediaVerdict !== "holds") {
      input.onDeclarationRefusal(
        property,
        mediaVerdict === "partial" ? "media-partial-range" : "media-unparsed",
      );
      continue;
    }
    if (
      !authoredConsistentWithTruth(
        property,
        effectiveValue,
        truthWidth,
        input.parentContentWidth,
      )
    ) {
      input.onDeclarationRefusal(property, "authored-inconsistent-with-truth");
      continue;
    }
    /*
     * CASCADE. `authoredLayout` is written in the order the browser matched the
     * rules, so the LAST admissible declaration for a property is the one that
     * won. There is no evidence in the artifact that the order is anything else,
     * so `cascade-conflict` is never claimed — the depth is simply counted, and
     * a reader can see how many declarations one emitted value stood on.
     */
    const previous = admissible.get(property);
    admissible.set(property, {
      property,
      value: rule.value.trim(),
      candidates: (previous?.candidates ?? 0) + 1,
      usedVar: resolution.usedVar,
    });
  }

  if (!sawAllowlistedProperty)
    return { ok: false, reason: "no-admissible-property" };
  if (admissible.size === 0)
    return { ok: false, reason: "no-admissible-declaration" };

  const declarations: Record<string, string> = {};
  const evidence: string[] = [];
  let cascadeCandidates = 0;
  let varAdmitted = 0;
  for (const property of AUTHORED_INTENT_PROPERTIES) {
    const entry = admissible.get(property);
    if (entry === undefined) continue;
    declarations[property] = entry.value;
    cascadeCandidates += entry.candidates - 1;
    if (entry.usedVar) varAdmitted++;
    evidence.push(
      `authored ${property}: ${entry.value}` +
        (entry.candidates > 1
          ? ` (last of ${entry.candidates} admissible)`
          : "") +
        (entry.usedVar
          ? " (var() resolved against the emitted custom properties)"
          : ""),
    );
  }
  /*
   * THE HALF THAT IS EASY TO FORGET. `max-width: 1200px` alone does not undo a
   * frozen `width: 1152px` — the cap never engages, and the box stays 1152 at
   * every viewport. The source's own `width` in that case is `auto`, and saying
   * so is a statement about the source, not an invention: it is only added when
   * NO `width` was declared anywhere in `authoredLayout`, in any form.
   */
  if (
    declarations["width"] === undefined &&
    !widthDeclaredAnyForm &&
    (declarations["max-width"] !== undefined ||
      declarations["min-width"] !== undefined)
  ) {
    declarations["width"] = "auto";
    evidence.push(
      "no authored width of any form beside the cap: the source's width is auto",
    );
  }
  if (Object.keys(declarations).length === 0) {
    return { ok: false, reason: "no-admissible-declaration" };
  }
  evidence.push(
    `holds across the whole served range ${lo}…${hi === Number.POSITIVE_INFINITY ? "∞" : hi}px`,
  );
  return { ok: true, declarations, evidence, cascadeCandidates, varAdmitted };
}

/*
 * ---------------------------------------------------------------------------
 * Responsive Core P0 §C2.4 / §C2.5 (REC-I2) — AUTHORED-FIRST WIDTH-FAMILY PLANS.
 * ---------------------------------------------------------------------------
 *
 * The authored inline-size fallback above re-emits "the last admissible
 * declaration in array order" and refuses any `@media` that does not hold over
 * the whole served range. With the observer's cascade metadata (§C1.5) and the
 * runtime inline style + its provenance (§C1.2/§C1.4) neither refusal is needed:
 * `planNodeWidthFamily()` resolves the Cascade-5 winner of every width-family
 * property per sub-interval of the served tree interval. This section turns an
 * UNAMBIGUOUS plan into `responsive-owned` rules — one per piece, every piece
 * restating all six properties explicitly — and offers them to two-phase
 * verification as ONE group per node.
 *
 * It is gated on evidence, never on guesses:
 *  - the viewport must come from an observer that recorded initial-document
 *    evidence (`initialDocument`) and read authored declarations at all;
 *  - every width-family authored record of the node must carry `ruleOrder`
 *    (old artifacts carry none → no offer → the pre-P0 pipeline byte-for-byte);
 *  - the node needs a visible probe sample inside the served interval at a
 *    width OTHER than the truth width (never accepted on the truth width alone);
 *  - the plan's value at the truth width must reproduce the computed style
 *    (`contradicted-by-truth` otherwise: a JS or cascade override the evidence
 *    did not see).
 */

/** Why a node never reached the planner (evidence gate). */
export type OwnershipNotConsideredReason =
  | "observer-evidence-absent"
  | "authored-declarations-unread"
  | "probe-unavailable"
  | "truth-outside-served-interval"
  | "cascade-metadata-absent"
  | "svg-content"
  | "node-not-in-layout";

/** Why a considered node produced no ownership offer. */
export type OwnershipNotOfferedReason =
  | "coverage-incomplete"
  | "ambiguous"
  | "contradicted-by-truth"
  | "no-interval-evidence"
  | "node-display-inline";

/**
 * Review fix (MAJOR-3) — the observer's `StylesheetCoverage` counters this gate
 * reads (structural; every field optional so an absent one reads as unproven).
 */
export interface StylesheetCoverageLike {
  readonly fallbackMissed?: number;
  readonly importsUnresolved?: number;
  readonly importRulesUnresolved?: number;
  readonly ruleIndexCapHit?: boolean;
  readonly groupingRulesSkipped?: number;
  readonly sheetsSkippedBySizeCap?: number;
  readonly sheetsBodyUnavailable?: number;
}

/**
 * Why a page's authored CSS may be incomplete for the purpose of proving that a
 * node has NO width-family declaration. Empty ⇒ proven complete. Unreadable or
 * unrecovered sheets (CORS), unresolved `@import`s, the rule-index cap, skipped
 * grouping rules (`@scope`, …), size-capped sheets and unavailable bodies each
 * could hold the missing declaration.
 */
export function stylesheetCoverageGaps(coverage: StylesheetCoverageLike | undefined): string[] {
  if (coverage === undefined) return ["coverage-evidence-absent"];
  const gaps: string[] = [];
  const required: Array<[keyof StylesheetCoverageLike, string]> = [
    ["fallbackMissed", "fallback-missed"],
    ["importsUnresolved", "imports-unresolved"],
    ["groupingRulesSkipped", "grouping-rules-skipped"],
    ["sheetsSkippedBySizeCap", "sheets-skipped-by-size-cap"],
  ];
  for (const [field, reason] of required) {
    const value = coverage[field];
    if (typeof value !== "number") gaps.push(`${field}-absent`);
    else if (value > 0) gaps.push(reason);
  }
  if (typeof coverage.ruleIndexCapHit !== "boolean") gaps.push("ruleIndexCapHit-absent");
  else if (coverage.ruleIndexCapHit) gaps.push("rule-index-cap-hit");
  if ((coverage.importRulesUnresolved ?? 0) > 0) gaps.push("import-rules-unresolved");
  if ((coverage.sheetsBodyUnavailable ?? 0) > 0) gaps.push("sheets-body-unavailable");
  return gaps;
}

/** Plan provenances that come from a declaration the source actually wrote. */
const OWNERSHIP_DECLARED_PROVENANCE = new Set(["authored-sheet", "authored-inline", "runtime-inline"]);

/** Replaced elements for which `display: inline` still sizes the box. */
const OWNERSHIP_INLINE_REPLACED = new Set([
  "img",
  "video",
  "canvas",
  "iframe",
  "svg",
  "object",
  "embed",
  "input",
  "select",
  "textarea",
  "audio",
]);

const OWNERSHIP_CSS_WIDE_REFUSED = new Set(["inherit", "unset", "revert", "revert-layer"]);
const OWNERSHIP_UNITLESS_ZERO = /^[+-]?0*\.?0+$/;

/**
 * The admission hook for a WINNING width-family value (§C2.3).
 *
 * The existing {@link authoredValueAdmissible} shape rules, with the two
 * refusals that only made sense for the old "last in array" fallback lifted:
 * a px `width` and a px/number margin are the CASCADE WINNER here, i.e. authored
 * semantics rather than the frozen computed pixel; and the partial-range media
 * refusal is replaced by the planner's interval pieces. `var()` is admitted when
 * it resolves against the custom properties the clone emits for this scope; the
 * emitted text stays verbatim.
 */
export function ownedValueAdmissible(
  property: WidthFamilyProperty,
  raw: string,
  customProperties: ReadonlyMap<string, string>,
): string {
  const verbatim = raw.trim();
  if (verbatim === "") return "value-unparsed";
  if (!isSafeCssValue(verbatim)) return "value-unsafe";
  const resolution = resolveAuthoredVars(verbatim, customProperties);
  if (resolution.status === "malformed") return "value-uses-var";
  if (resolution.status === "unresolved") return "value-uses-var-unresolved";
  const value = resolution.text.trim();
  const lower = value.toLowerCase();
  if (OWNERSHIP_CSS_WIDE_REFUSED.has(lower)) return "value-css-wide-keyword";
  if (lower === "initial") return "ok";
  if (AUTHORED_INTRINSIC.has(lower)) return "ok";
  if (lower === "none") return property === "max-width" ? "ok" : "value-unparsed";
  if (lower === "content") return property === "flex-basis" ? "ok" : "value-unparsed";
  if (
    AUTHORED_PERCENT.test(value) ||
    AUTHORED_VIEWPORT_UNIT.test(value) ||
    AUTHORED_FONT_RELATIVE.test(value) ||
    AUTHORED_FUNCTION.test(value) ||
    AUTHORED_PX.test(value) ||
    OWNERSHIP_UNITLESS_ZERO.test(value)
  ) {
    return "ok";
  }
  return "value-unparsed";
}

/** The value a width-family piece writes (winner, UA-frozen, or initial). */
function pieceValue(plan: PiecewisePlan, width: number): { value: string; provenance: string } | undefined {
  const piece = pieceAt(plan, width);
  if (piece === undefined) return undefined;
  if (piece.kind === "winner") return { value: piece.decl.value, provenance: piece.decl.provenance };
  if (piece.kind === "no-author-declaration") {
    return piece.frozen !== undefined
      ? { value: piece.frozen.value, provenance: "frozen-UA" }
      : { value: piece.initialValue, provenance: "initial" };
  }
  return undefined;
}

function pxOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const t = value.trim().toLowerCase();
  if (OWNERSHIP_UNITLESS_ZERO.test(t)) return 0;
  return AUTHORED_PX.test(t) ? Number.parseFloat(t) : undefined;
}

function percentOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return AUTHORED_PERCENT.test(t) ? Number.parseFloat(t) : undefined;
}

/**
 * §C2.5 browser-truth guard, generalized from {@link authoredConsistentWithTruth}:
 * the plan's value AT THE TRUTH WIDTH must reproduce the computed style the deep
 * observation recorded. Returns the contradicted properties (empty = consistent).
 *
 * Only statements the computed style can decide are checked; anything else
 * (calc(), em, a flex/grid item's `width`) is left to the verification render.
 *  - `max-width` / `min-width` / `flex-basis` compute to the specified form:
 *    px ±0.5, % ±0.01, keywords equal.
 *  - `width` computes to the used px: px ±1, % of the parent content box ±1pt,
 *    vw of the truth viewport ±1 — only for a box in normal block flow.
 *  - margins compute to used px: px ±1, % of the parent content box ±1px, and
 *    `auto` on both sides of a block in normal flow must resolve symmetrically.
 */
export function ownedPlanContradictions(input: {
  plans: Readonly<Record<WidthFamilyProperty, PiecewisePlan>>;
  truthWidth: number;
  computed: Readonly<Record<string, string>> | undefined;
  parentDisplay: string | undefined;
  parentContentWidth: number | undefined;
  customProperties: ReadonlyMap<string, string>;
}): WidthFamilyProperty[] {
  const computed = input.computed;
  if (computed === undefined) return [];
  const out: WidthFamilyProperty[] = [];
  const resolved = (property: WidthFamilyProperty): string | undefined => {
    const piece = pieceValue(input.plans[property], input.truthWidth);
    if (piece === undefined) return undefined;
    const r = resolveAuthoredVars(piece.value, input.customProperties);
    return r.status === "resolved" ? r.text.trim() : undefined;
  };
  const position = computed["position"];
  const inFlowBlock =
    position !== "absolute" &&
    position !== "fixed" &&
    (input.parentDisplay === undefined ||
      !(FLEX_CONTAINER_DISPLAY.has(input.parentDisplay) || GRID_CONTAINER_DISPLAY.has(input.parentDisplay)));

  for (const property of ["max-width", "min-width", "flex-basis"] as const) {
    const planned = resolved(property);
    const actual = computed[property];
    if (planned === undefined || actual === undefined) continue;
    const p = planned.toLowerCase();
    const a = actual.trim().toLowerCase();
    const pPx = pxOf(p);
    const aPx = pxOf(a);
    const pPct = percentOf(p);
    const aPct = percentOf(a);
    let contradicted = false;
    if (pPx !== undefined) {
      contradicted = aPx === undefined ? !(pPx === 0 && property === "min-width" && a === "auto") : Math.abs(pPx - aPx) > 0.5;
    } else if (pPct !== undefined) {
      contradicted = aPct === undefined || Math.abs(pPct - aPct) > 0.01;
    } else if (p === "none" || p === "auto") {
      contradicted = !(a === p || (p === "auto" && property === "min-width" && aPx === 0));
    }
    if (contradicted) out.push(property);
  }

  if (inFlowBlock) {
    const planned = resolved("width");
    const actualPx = pxOf(computed["width"]);
    if (planned !== undefined && actualPx !== undefined) {
      const pPx = pxOf(planned);
      const pPct = percentOf(planned);
      const vw = /^([+-]?(?:\d+\.?\d*|\.\d+))vw$/i.exec(planned);
      let contradicted = false;
      if (pPx !== undefined) contradicted = Math.abs(pPx - actualPx) > 1;
      else if (vw !== null) contradicted = Math.abs((Number(vw[1]) * input.truthWidth) / 100 - actualPx) > 1;
      else if (pPct !== undefined && input.parentContentWidth !== undefined && input.parentContentWidth > 0) {
        contradicted = Math.abs(pPct - (actualPx / input.parentContentWidth) * 100) > 1;
      }
      if (contradicted) out.push("width");
    }
    const left = resolved("margin-left");
    const right = resolved("margin-right");
    const leftPx = pxOf(computed["margin-left"]);
    const rightPx = pxOf(computed["margin-right"]);
    for (const [property, planned, actualPx] of [
      ["margin-left", left, leftPx],
      ["margin-right", right, rightPx],
    ] as const) {
      if (planned === undefined || actualPx === undefined) continue;
      const pPx = pxOf(planned);
      const pPct = percentOf(planned);
      if (pPx !== undefined && Math.abs(pPx - actualPx) > 1) out.push(property);
      else if (
        pPct !== undefined &&
        input.parentContentWidth !== undefined &&
        Math.abs((pPct * input.parentContentWidth) / 100 - actualPx) > 1
      ) {
        out.push(property);
      }
    }
    if (
      left?.toLowerCase() === "auto" &&
      right?.toLowerCase() === "auto" &&
      leftPx !== undefined &&
      rightPx !== undefined &&
      Math.abs(leftPx - rightPx) > 1
    ) {
      out.push("margin-left", "margin-right");
    }
  }
  return [...new Set(out)].sort();
}

function formatMediaPx(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The `@media` of one piece inside its served interval — the `bandMedia()`
 * convention (min inclusive, max exclusive written −0.02px), rounded to 2dp.
 * An edge equal to the served interval's own edge is not written: the tree
 * switch already bounds it. A piece covering the whole interval has none.
 */
export function ownedPieceMedia(piece: ServedInterval, served: ServedInterval): string | undefined {
  const parts: string[] = [];
  if (piece.min > served.min) parts.push(`(min-width: ${formatMediaPx(piece.min)}px)`);
  if (piece.max < served.max) parts.push(`(max-width: ${formatMediaPx(piece.max - 0.02)}px)`);
  return parts.length > 0 ? parts.join(" and ") : undefined;
}

/**
 * Six property plans → the pieces a node emits: the served interval partitioned
 * at every property's piece edge, each sub-interval carrying all six values,
 * adjacent sub-intervals with identical declarations merged.
 */
export function ownedPiecesOf(
  plans: Readonly<Record<WidthFamilyProperty, PiecewisePlan>>,
  served: ServedInterval,
): { interval: ServedInterval; declarations: Record<string, string>; provenance: Record<string, string> }[] {
  const edges = new Set<number>();
  for (const property of WIDTH_FAMILY_PROPERTIES) {
    for (const piece of plans[property].pieces) {
      if (piece.interval.min > served.min && piece.interval.min < served.max) edges.add(piece.interval.min);
    }
  }
  const out: { interval: ServedInterval; declarations: Record<string, string>; provenance: Record<string, string> }[] = [];
  for (const sub of partitionInterval(served, [...edges].sort((a, b) => a - b))) {
    const declarations: Record<string, string> = {};
    const provenance: Record<string, string> = {};
    for (const property of WIDTH_FAMILY_PROPERTIES) {
      const value = pieceValue(plans[property], sub.min) ?? {
        value: WIDTH_FAMILY_INITIAL_VALUES[property],
        provenance: "initial",
      };
      declarations[property] = value.value;
      provenance[property] = value.provenance;
    }
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      last.interval.max === sub.min &&
      JSON.stringify(last.declarations) === JSON.stringify(declarations) &&
      JSON.stringify(last.provenance) === JSON.stringify(provenance)
    ) {
      last.interval = { min: last.interval.min, max: sub.max };
    } else {
      out.push({ interval: { min: sub.min, max: sub.max }, declarations, provenance });
    }
  }
  return out;
}

export function inferLayoutRules(
  input: InferLayoutInput,
): LayoutInferenceResult {
  const rules: RecoveredLayoutRule[] = [];
  const counters: LayoutInferenceCounters = {
    pagesWithAlignedProbe: 0,
    nodesWithProbe: 0,
    centered: 0,
    fullWidth: 0,
    percentage: 0,
    responsiveHidden: 0,
    guardRefusals: 0,
    guardRefusalsByReason: {},
    widthModeRefusals: 0,
    widthModeRefusalsByReason: {},
    widthModeStretch: 0,
    widthModeFillPercentage: 0,
    bandSampleMismatches: 0,
    authoredBreakpointPages: {},
    authoredBreakpointEntries: 0,
    authoredBreakpointDeclarations: 0,
    authoredBreakpointUnparsedDeclarations: 0,
    authoredBreakpointTruncatedNodes: 0,
    bandEdgesOpen: 0,
    bandEdgesConsidered: 0,
    bandEdgesSnapped: 0,
    bandEdgesSnappedAmbiguous: 0,
    bandEdgesKeptMidpointNoAuthoredInGap: 0,
    bandEdgesKeptMidpointEmptyHistogram: 0,
    bandEdgesKeptMidpointNoHistogram: 0,
    bandEdgeSnapShiftPx: 0,
    widthValueRefusals: 0,
    widthValueRefusalsByReason: {},
    contentBoxMeasured: 0,
    contentBoxAssumedConstant: 0,
    contentBoxMeasuredDisagreed: 0,
    contentBoxMaxDisagreementPx: 0,
    parentPaddingNotConstant: {},
    viewportPasses: {},
    viewportPassesUsed: {},
    viewportPassRefusals: {},
    rulesByViewport: {},
    inlineSizeCandidates: 0,
    inlineSizeOutcomes: {},
    inlineSizeOutcomeDoubleCounts: 0,
    inlineSizeOutcomesSuperseded: 0,
    inlineSizePreStageDrops: {},
    insetResolvedWidth: 0,
    insetResolvedRefusalsByReason: {},
    trackedFillWidth: 0,
    trackedFillRefusalsByReason: {},
    viewportBleedWidth: 0,
    viewportBleedRefusalsByReason: {},
    damageClampedWidth: 0,
    damageClampRefusalsByReason: {},
    gridTrackColumns: 0,
    gridTrackRefusals: 0,
    gridTrackRefusalsByReason: {},
    gridTrackBandContainers: 0,
    gridTrackColumnsBanded: 0,
    gridTrackBandRefusals: 0,
    gridTrackBandRefusalsByReason: {},
    gridBandEdgesSnapped: 0,
    gridBandEdgesConsidered: 0,
    gridAreaFillWidth: 0,
    gridAreaFillRefusalsByReason: {},
    residualAuditNodesOffered: 0,
    residualAuditNodesOmitted: 0,
    authoredIntent: {
      offered: {},
      emitted: {},
      declarations: 0,
      cascadeCandidates: 0,
      widthAutoAdded: 0,
      refusalsByReason: {},
      declarationRefusalsByReason: {},
      emittedByProperty: {},
      varAdmitted: 0,
    },
    responsiveOwnership: {
      nodesConsidered: 0,
      notConsideredByReason: {},
      plansOffered: 0,
      rulesEmitted: 0,
      notOfferedByReason: {},
      ambiguousByReason: {},
      contradictedByProperty: {},
    },
  };
  /** REC-I2 — the width-family ownership plans offered, one per node. */
  const ownedPlans: OwnedPlanOffer[] = [];
  /**
   * Task 28.7 B1 — every grid refusal, WITH ITS NODE. Bounded per route at the
   * end of the pass; unbounded here only for the length of one generation.
   */
  const gridRefusalRecords: GridTrackRefusalRecord[] = [];
  /**
   * Task 28.7 B1 — `${viewportId}|${nodeId}` → the reason recovery declined.
   *
   * The key carries `viewportId` EXPLICITLY: a node id is unique inside its own
   * tree and means something different in the other one, and an absent
   * `viewportId` reads as `"desktop"` in three other places in this file.
   */
  const refusalByNode = new Map<string, string>();
  const residualAudit: ResidualAuditPass[] = [];
  const refuse = (reason: LayoutGuardReason): void => {
    counters.guardRefusals++;
    counters.guardRefusalsByReason[reason] =
      (counters.guardRefusalsByReason[reason] ?? 0) + 1;
  };
  const refuseWidthMode = (reason: InlineSizeReason): void => {
    counters.widthModeRefusals++;
    counters.widthModeRefusalsByReason[reason] =
      (counters.widthModeRefusalsByReason[reason] ?? 0) + 1;
  };
  const refuseWidthValue = (reason: WidthValueReason): void => {
    counters.widthValueRefusals++;
    counters.widthValueRefusalsByReason[reason] =
      (counters.widthValueRefusalsByReason[reason] ?? 0) + 1;
  };
  const refuseGridTrack = (reason: GridTrackRefusalReason): void => {
    counters.gridTrackRefusals++;
    counters.gridTrackRefusalsByReason[reason] =
      (counters.gridTrackRefusalsByReason[reason] ?? 0) + 1;
  };
  const refuseGridBand = (reason: GridBandRefusalReason): void => {
    counters.gridTrackBandRefusals++;
    counters.gridTrackBandRefusalsByReason[reason] =
      (counters.gridTrackBandRefusalsByReason[reason] ?? 0) + 1;
  };
  /* Task 28.6 C3 — a probed node dropped before the inline-size stage. */
  const dropBeforeInlineSize = (
    reason: InlineSizePreStageDrop,
    /** Task 28.7 B1 — the node the drop happened on, so the audit can name it. */
    at?: { viewportId: LayoutViewportId; nodeId: string },
  ): void => {
    counters.inlineSizePreStageDrops[reason] =
      (counters.inlineSizePreStageDrops[reason] ?? 0) + 1;
    if (at === undefined) return;
    const key = `${at.viewportId}|${at.nodeId}`;
    if (!refusalByNode.has(key)) refusalByNode.set(key, `pre-stage:${reason}`);
  };

  const mobileTruthWidth = input.mobileTruthWidth ?? MOBILE_TRUTH_WIDTH;

  for (const page of input.pages) {
    /** P0 contract C2.1 — where this page's rules start, for the sample attach below. */
    const pageRulesStart = rules.length;
    /*
     * ------------------------------------------------------------------------
     * TASK 28.6 C2b — ONE PASS PER VIEWPORT, NOT ONE PER PAGE.
     * ------------------------------------------------------------------------
     *
     * THE DEFECT. Everything below used to read `page.viewports.desktop` and
     * `page.layoutProbe` and nothing else, so the MOBILE subtree — the tree the
     * clone actually mounts below the breakpoint — received not one recovered
     * layout rule. Measured: 0 of 1,135 rules on linear.app and 0 of 1,106 on
     * hobbang.net targeted the mobile variant, which means every pair a grader
     * compared at 390 or 700 was graded against a tree with NO recovered rule at
     * all, frozen at whatever geometry the single deep mobile observation caught.
     *
     * THE FIX. The loop body is parameterised by viewport. Each pass reads ITS
     * OWN probe (`layoutProbe` for desktop, `layoutProbeMobile` for mobile), ITS
     * OWN element list, ITS OWN truth width, and the half of the width axis its
     * variant is actually visible on. Nothing else changes: requirement (c) is
     * that a mobile rule earns its place under exactly the gates a desktop rule
     * does — same truth-sanity gate, same containing-block guard, same band
     * agreement scan, same post-emit browser truth check — so there is one code
     * path and no mobile exemption anywhere in it.
     *
     * WHY THE TWO PROBES MAY NEVER SHARE A FIELD. They walked two different
     * trees in two different browser contexts. The mobile probe's per-element
     * arrays are indexed by ITS width list and align to the MOBILE element list;
     * indexing one viewport's arrays with the other's widths would corrupt every
     * rule derived from them. `resolveViewportProbe()` is the only place the two
     * are paired, and it refuses rather than guesses.
     */
    for (const viewportId of LAYOUT_VIEWPORT_IDS) {
      /*
       * §26.5 — the probe axis splits at the width THIS ROUTE is served at, not at
       * the site-wide number. Same lookup shape as `breakpointForPage()`: the map
       * carries only the routes that differ, and everything else uses the default.
       */
      const pageBreakpoint =
        input.breakpointByPageId?.get(page.pageId) ?? input.breakpoint;
      const resolved = resolveViewportProbe(page, viewportId, {
        breakpoint: pageBreakpoint,
        truthWidth: viewportId === "desktop" ? TRUTH_WIDTH : mobileTruthWidth,
      });
      counters.viewportPasses[viewportId] =
        (counters.viewportPasses[viewportId] ?? 0) + 1;
      if (!resolved.ok) {
        const key = `${viewportId}:${resolved.reason}`;
        counters.viewportPassRefusals[key] =
          (counters.viewportPassRefusals[key] ?? 0) + 1;
        continue;
      }
      const { probeInfo, viewport, variantIdx, truthEntry } = resolved;
      counters.pagesWithAlignedProbe++;
      counters.viewportPassesUsed[viewportId] =
        (counters.viewportPassesUsed[viewportId] ?? 0) + 1;

      const nodeById = new Map<string, ElementSpecNode>();
      for (const node of viewport.nodes) {
        if (node.type === "element") nodeById.set(node.nodeId, node);
      }
      /*
       * Task 28.6 C3 — one content-box recovery per PARENT, not per child.
       * `undefined` in the map means "tried and could not"; a missing key means
       * "not tried yet". A page of 1,600 nodes would otherwise re-scan a shared
       * parent's sibling list once per sibling.
       */
      const contentBoxByParent = new Map<
        string,
        MeasuredContentBox | undefined
      >();
      const measuredContentFor = (
        parentNode: ElementSpecNode,
      ): MeasuredContentBox | undefined => {
        if (contentBoxByParent.has(parentNode.nodeId)) {
          return contentBoxByParent.get(parentNode.nodeId);
        }
        const siblings: ElementSpecNode[] = [];
        for (const childId of parentNode.childNodeIds) {
          const child = nodeById.get(childId);
          if (child !== undefined) siblings.push(child);
        }
        const box = measureParentContentBox({
          parent: parentNode,
          children: siblings,
          styleLookup: input.styleLookup,
          widthCount: probeInfo.widths.length,
          truthIndex: truthEntry.i,
        });
        contentBoxByParent.set(parentNode.nodeId, box);
        return box;
      };

      /*
       * Task 28.6 D1 — the breakpoints THIS PAGE's stylesheet authored, resolved
       * once per page and used by every band built below. Read here rather than
       * inside the node loop so the fold happens once for a page's 1,600 nodes,
       * and so the provenance is recorded per page even when the page turns out
       * to emit no band at all.
       */
      const authored = resolveAuthoredBreakpoints(viewport);
      counters.authoredBreakpointPages[authored.provenance] =
        (counters.authoredBreakpointPages[authored.provenance] ?? 0) + 1;
      if (authored.histogram !== undefined) {
        counters.authoredBreakpointEntries += authored.histogram.entries.length;
        counters.authoredBreakpointDeclarations +=
          authored.histogram.declarationsExamined;
        counters.authoredBreakpointUnparsedDeclarations +=
          authored.histogram.unparsedDeclarations;
        counters.authoredBreakpointTruncatedNodes +=
          authored.histogram.truncatedNodeCount;
      }

      /*
       * ------------------------------------------------------------------------
       * Task 28.6 A5, phase 1 — grid COLUMN TRACKS.
       * ------------------------------------------------------------------------
       *
       * A pass of its own, before the per-node pass, because it is a statement
       * about the container's INSIDE rather than about its width and so shares
       * none of the gates below: a container hidden at the truth width is refused
       * by `recoverGridTracks()` on its own terms.
       *
       * TASK 28.6 V5 — this used to keep a `gridRecoveries` map "so phase 2 can
       * ask whether a node's PARENT ships a single fractional track". Phase 2
       * never asked: A5(c) lifted no `grid-item` refusal, so the map was written
       * and never read, and it was deleted.
       *
       * TASK 28.75 §03b — A MAP IS BACK, AND THIS TIME IT HAS A READER. It carries
       * a different thing from the one V5 deleted: not "does the parent ship a
       * fractional track" but the ITEM'S OWN GRID AREA WIDTH AT EVERY OBSERVED
       * PROBE INDEX, which is the one quantity `containingBlockGuard()` correctly
       * says nothing else measured. {@link gridAreaFillWidth} is the reader; the
       * ordering of the two passes, which was already what it is, is what makes
       * the map available.
       */
      /** `${viewportId}|${childNodeId}` → probe index → that item's grid area width. */
      const gridAreaByChild = new Map<string, Map<number, number>>();
      for (const node of viewport.nodes) {
        if (node.type !== "element") continue;
        const props = node.styleTokenId
          ? input.styleLookup(node.styleTokenId)
          : undefined;
        const display = props?.["display"];
        // Only a real grid container is a candidate, and only a candidate is
        // counted: refusing every non-grid node would drown the reason histogram.
        if (display !== "grid" && display !== "inline-grid") continue;
        const children: ElementSpecNode[] = [];
        for (const childId of node.childNodeIds) {
          const child = nodeById.get(childId);
          if (child) children.push(child);
        }
        const result = recoverGridTracks({
          node,
          children,
          styleLookup: input.styleLookup,
          variantIdx,
          truthIndex: truthEntry.i,
        });
        /*
         * Task 28.7 B1 — the node was already in scope here and unused. A
         * refusal is now recorded WITH the container it refused and with the
         * measured cost of the freeze it leaves behind, because
         * `gridTrackRefusalsByReason` cannot answer "why did node X ship frozen".
         */
        const noteGridRefusal = (reason: GridTrackRefusalReason): void => {
          refuseGridTrack(reason);
          refusalByNode.set(`${viewportId}|${node.nodeId}`, `grid:${reason}`);
          const excess = gridFrozenExcessPx({
            node,
            styleLookup: input.styleLookup,
            variantIdx,
          });
          gridRefusalRecords.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            tagName: node.tagName,
            reason,
            childCount: children.length,
            ...(excess !== undefined
              ? {
                  frozenTracks: excess.frozen,
                  trackCount: excess.trackCount,
                  frozenExcessPx: excess.excessPx,
                  atWidth: excess.atWidth,
                }
              : {}),
          });
        };
        if (!result.ok) {
          /*
           * TASK 28.75 §03b — THE ONE PLACE THE BANDED RECOVERY IS REACHED.
           *
           * Only from `tracks-not-reproducible-at-every-width`, and only after the
           * single-band pass has had its turn and refused. Every other refusal —
           * `all-tracks-fixed`, `container-width-constant`, `not-every-track-witnessed`,
           * `children-do-not-tile-tracks` — is a statement about evidence the band
           * pass does not have either, and offering it those containers would let
           * a second mechanism re-answer a question the first one already refused
           * on its own terms. The banded pass then refuses `single-band` whenever
           * the structure does not change, so the two mechanisms have disjoint
           * domains by construction rather than by ordering.
           */
          if (result.reason !== "tracks-not-reproducible-at-every-width") {
            noteGridRefusal(result.reason);
            continue;
          }
          const banded = recoverGridTracksBanded({
            node,
            children,
            styleLookup: input.styleLookup,
            variantIdx,
            truthIndex: truthEntry.i,
            authored: authored.histogram,
          });
          if (!banded.ok) {
            refuseGridBand(banded.reason);
            noteGridRefusal(result.reason);
            continue;
          }
          counters.gridTrackBandContainers++;
          counters.gridBandEdgesSnapped += banded.accounting.snapped;
          counters.gridBandEdgesConsidered += banded.accounting.edgesConsidered;
          for (const entry of banded.bands) {
            rules.push({
              pageId: page.pageId,
              viewportId,
              nodeId: node.nodeId,
              truth: entry.truth,
              kind: "grid-track-columns-banded",
              declarations: {
                "grid-template-columns": entry.value,
                "column-gap": `${entry.gapPx}px`,
              },
              media: bandMedia(entry.band),
              band: entry.band,
              witnesses: entry.witnesses,
              evidence: entry.evidence,
            });
            counters.gridTrackColumnsBanded++;
          }
          /*
           * TASK 28.75 §03b CYCLE 1 — THE BANDED PASS NOW FEEDS THE ITEM PASS.
           *
           * It did not, and the measurement said what that costs: a banded track
           * list moves the items to the source's exact x while their frozen
           * truth-width `width` stays, so the container is right and its contents
           * overflow it. On hobbang.net that turned `/` @768 from MAJOR into a
           * BLOCKER on a NEW `footer-clipped` — the very channel this wave exists
           * to drive to zero. See `GridTrackBandResult.areas` for why publishing
           * them is evidence rather than tautology.
           */
          for (const item of banded.areas) {
            gridAreaByChild.set(
              `${viewportId}|${item.nodeId}`,
              new Map(item.widths.map((entry) => [entry.i, entry.w])),
            );
          }
          continue;
        }
        const box = node.boundingBox;
        if (box === undefined) {
          // No truth rect means the post-emit check cannot render it, and this
          // module never emits a rule the check will have to reject blind.
          noteGridRefusal("container-box-unreadable");
          continue;
        }
        rules.push({
          pageId: page.pageId,
          viewportId,
          nodeId: node.nodeId,
          truth: { x: box.x, w: box.width },
          kind: "grid-track-columns",
          declarations: { "grid-template-columns": result.recovery.value },
          witnesses: result.recovery.witnesses,
          evidence: result.recovery.evidence,
        });
        counters.gridTrackColumns++;
        /*
         * The areas this rule establishes, recorded for the per-node pass. Only
         * the SINGLE-BAND recovery contributes: its placements were matched
         * against the frozen used track list and then held to the per-width tiling
         * test, which is an independent proof that the items account for the whole
         * content box. The banded recovery clusters its columns OUT of the
         * children, so "the child equals its column" is true there by construction
         * and would prove nothing.
         */
        for (const item of result.recovery.areas) {
          gridAreaByChild.set(
            `${viewportId}|${item.nodeId}`,
            new Map(item.widths.map((entry) => [entry.i, entry.w])),
          );
        }
      }

      for (const node of viewport.nodes) {
        if (node.type !== "element" || !node.probe) continue;
        if (node.tagName === "html" || node.tagName === "body") continue;
        counters.nodesWithProbe++;

        /*
         * Task 28.6 C3 — this node's ONE inline-size outcome.
         *
         * Declared here so every exit path below is in its scope, and recorded at
         * each of them including the final fall-through. A second call is counted
         * rather than swallowed: the partition is only worth reading if a drift in
         * it is visible as a number.
         */
        let outcomeRecorded = false;
        let recordedOutcome: InlineSizeOutcome | undefined;
        const outcome = (reason: InlineSizeOutcome): void => {
          if (outcomeRecorded) counters.inlineSizeOutcomeDoubleCounts++;
          outcomeRecorded = true;
          recordedOutcome = reason;
          counters.inlineSizeOutcomes[reason] =
            (counters.inlineSizeOutcomes[reason] ?? 0) + 1;
          /*
           * Task 28.7 B1 — the same verdict, keyed by NODE. The histogram says
           * how many nodes reached each outcome; the residual audit has to say
           * which outcome left THIS frozen box on the page. A grid refusal
           * recorded above is more specific, so it is not overwritten.
           */
          const key = `${viewportId}|${node.nodeId}`;
          if (!refusalByNode.has(key))
            refusalByNode.set(key, `inline-size:${reason}`);
        };
        /*
         * TASK 28.75 §19 — A LATER BRANCH ANSWERS A NODE AN EARLIER ONE ALREADY
         * REFUSED, WITHOUT BREAKING THE PARTITION.
         *
         * `widthValueFor()` records `refused-width-mode` and returns `undefined`
         * from inside the centered / capped-fill / percentage branches, so by the
         * time the damage clamp is offered the node already has an outcome. Simply
         * calling `outcome()` again would count it twice and the funnel would stop
         * adding up — the one invariant `smoke-layout-safety` asserts about this
         * histogram. So the earlier verdict is DECREMENTED as the new one is
         * recorded: `sum(inlineSizeOutcomes)` still equals `inlineSizeCandidates`,
         * `inlineSizeOutcomeDoubleCounts` stays 0, and the move is counted rather
         * than silent. The guard/width-mode refusal counters are deliberately NOT
         * rolled back — "the mode was refused and a clamp was applied instead" is
         * two true facts, and both stay readable.
         */
        const supersedeOutcome = (reason: InlineSizeOutcome): void => {
          if (recordedOutcome !== undefined) {
            counters.inlineSizeOutcomes[recordedOutcome] =
              (counters.inlineSizeOutcomes[recordedOutcome] ?? 1) - 1;
            counters.inlineSizeOutcomesSuperseded++;
            outcomeRecorded = false;
            const key = `${viewportId}|${node.nodeId}`;
            if (refusalByNode.get(key)?.startsWith("inline-size:") === true) {
              refusalByNode.delete(key);
            }
          }
          outcome(reason);
        };

        const probe = node.probe;
        const wAt = (i: number): number => probe.w[i] ?? 0;
        const xAt = (i: number): number => probe.x[i] ?? 0;
        const vAt = (i: number): 0 | 1 => probe.v[i] ?? 0;

        // Sanity gate: the probe's truth-width box must agree with the deep
        // observation, or the two loads rendered different pages for this node.
        const truthWidth = wAt(truthEntry.i);
        const observedWidth = node.boundingBox?.width;
        if (
          observedWidth === undefined ||
          Math.abs(truthWidth - observedWidth) > TRUTH_SANITY_TOLERANCE_PX
        ) {
          dropBeforeInlineSize("truth-sanity-mismatch", {
            viewportId,
            nodeId: node.nodeId,
          });
          continue;
        }
        // The box the post-emit truth check re-renders against. Viewport-relative
        // at scroll 0, the same convention `collect-dom.ts` and the probe use.
        const truthRect = { x: node.boundingBox?.x ?? 0, w: observedWidth };

        // --- responsive hide (visible at truth, hidden at some other width) ---
        if (vAt(truthEntry.i) === 1) {
          const hiddenEntries = variantIdx.filter(
            (entry) => vAt(entry.i) === 0,
          );
          if (
            hiddenEntries.length > 0 &&
            hiddenEntries.length < variantIdx.length
          ) {
            /*
             * Task 28.6 D1 — the midpoint edges, then the SNAP onto whatever the
             * source authored inside each edge's gap. Snapping happens BEFORE the
             * agreement scan and before `bandMedia()`, so every downstream
             * consumer — the scan below, the emitted `@media`, the in-band render
             * — sees one band, the one that ships.
             */
            const snap = snapBandEdges(
              hiddenBands(variantIdx, hiddenEntries),
              authored.histogram,
            );
            const bands = snap.bands;
            counters.bandEdgesOpen += snap.accounting.edgesOpen;
            counters.bandEdgesConsidered += snap.accounting.edgesConsidered;
            counters.bandEdgesSnapped += snap.accounting.snapped;
            counters.bandEdgesSnappedAmbiguous +=
              snap.accounting.snappedAmbiguous;
            counters.bandEdgesKeptMidpointNoAuthoredInGap +=
              snap.accounting.keptMidpointNoAuthoredInGap;
            counters.bandEdgesKeptMidpointEmptyHistogram +=
              snap.accounting.keptMidpointEmptyHistogram;
            counters.bandEdgesKeptMidpointNoHistogram +=
              snap.accounting.keptMidpointNoHistogram;
            counters.bandEdgeSnapShiftPx += snap.accounting.shiftPx;
            /*
             * Task 28.6 R1 — the bands must reproduce the observation exactly at
             * every desktop probe width: covered where hidden, uncovered where
             * visible. This is what the shipped off-by-one violated, and a green
             * truth check could not see it because the check never rendered a
             * banded rule at all.
             *
             * TASK 28.6 D1 — WHAT THE SNAP ADDS TO THIS SCAN. V6(a) showed the
             * counter cannot see an edge convention that is wrong on BOTH sides,
             * because the scan and the builder share `bandContains()`. A snapped
             * edge is a number from the source's stylesheet, which the builder had
             * no hand in, so for those edges this scan really is two independent
             * sources agreeing — and a snap that moved an edge across a measured
             * sample would land here.
             */
            for (const entry of variantIdx) {
              const covered = bands.some((band) =>
                bandContains(band, entry.width),
              );
              if (covered !== (vAt(entry.i) === 0))
                counters.bandSampleMismatches++;
            }
            for (const band of bands) {
              rules.push({
                pageId: page.pageId,
                viewportId,
                nodeId: node.nodeId,
                truth: truthRect,
                kind: "responsive-hidden",
                declarations: { display: "none" },
                media: bandMedia(band),
                band,
                evidence: [
                  `visible at ${TRUTH_WIDTH}px, hidden at ` +
                    hiddenEntries.map((entry) => `${entry.width}px`).join("/"),
                  `band ${band.minWidth === undefined ? "(open)" : `${band.minWidth}px`} … ` +
                    `${band.maxWidth === undefined ? "(open)" : `${band.maxWidth}px`}, ` +
                    `verified at ${band.verifyWidth}px (an observed-hidden probe width)`,
                  // Task 28.6 D1 — per edge, so a reader of one rule can see which
                  // of its numbers the source wrote and which the probe guessed.
                  ...(band.edgeDecisions ?? []).map(
                    (decision) =>
                      `${decision.edge} edge ${decision.px}px ` +
                      `(${decision.source}; midpoint ${decision.midpointPx}px; ` +
                      `probe gap ${decision.bracket[0]}…${decision.bracket[1]}px; ` +
                      `${decision.candidateCount} authored candidate(s)` +
                      (decision.source === "authored-breakpoint"
                        ? `, weight ${decision.chosenWeight}${decision.ambiguous ? ", AMBIGUOUS" : ""}`
                        : "") +
                      `)`,
                  ),
                ],
              });
              counters.responsiveHidden++;
            }
          }
        } else {
          // Hidden at the truth width: the exact computed style already hides
          // it, and revealing it at other widths cannot be verified against the
          // deep observation, so nothing is emitted.
          dropBeforeInlineSize("hidden-at-truth-width", {
            viewportId,
            nodeId: node.nodeId,
          });
          continue;
        }

        const displayValue = node.styleTokenId
          ? input.styleLookup(node.styleTokenId)?.["display"]
          : undefined;
        if (displayValue === undefined || !BLOCKISH_DISPLAY.has(displayValue)) {
          dropBeforeInlineSize("display-not-blockish", {
            viewportId,
            nodeId: node.nodeId,
          });
          continue;
        }

        const parent =
          node.parentNodeId !== undefined
            ? nodeById.get(node.parentNodeId)
            : undefined;
        const parentProbe = parent?.probe;
        if (!parentProbe) {
          dropBeforeInlineSize(
            parent === undefined
              ? "parent-not-in-viewport"
              : "parent-probe-missing",
            { viewportId, nodeId: node.nodeId },
          );
          continue;
        }
        // Task 28.6 C3 — past this line the node is a CANDIDATE and leaves through
        // exactly one `outcome()`.
        counters.inlineSizeCandidates++;
        const pwAt = (i: number): number => parentProbe.w[i] ?? 0;
        const pxAt = (i: number): number => parentProbe.x[i] ?? 0;
        /*
         * Box-model correction: probe widths are border-box rects, but a CSS
         * percentage (and an auto block width) resolves against the parent's
         * CONTENT box. Without subtracting the parent's padding, a child that
         * simply fills its padded parent measures a constant ~0.97 ratio and
         * would be emitted as `width: 97%` — which then double-counts the
         * padding at render time. Padding is read from the parent's exact
         * computed style (px at the truth viewport, assumed constant-px).
         */
        /*
         * Task 28.6 V2 — an UNREADABLE parent padding is not a zero one.
         *
         * `contentAt()` is the denominator every branch below stands on. Reading
         * an unparseable `padding-left` as 0 makes that denominator too large by
         * exactly the padding and every ratio drawn from it wrong, with nothing in
         * any counter. There is no partial answer here: the node is refused.
         */
        const parentPaddingRaw = horizontalPadding(parent, input.styleLookup);
        if (parentPaddingRaw === undefined) {
          refuse("parent-padding-unreadable");
          outcome("refused-parent-padding-unreadable");
          continue;
        }
        const parentPadding = parentPaddingRaw;
        // Task 28.5B: the content box is the border box minus padding AND border.
        const parentBorder = horizontalBorder(parent, input.styleLookup);
        const derivedContentAt = (i: number): number =>
          pwAt(i) - parentPadding - parentBorder;

        /*
         * TASK 28.6 C3 — PREFER THE MEASURED CONTENT BOX OVER THE DERIVED ONE.
         *
         * `derivedContentAt()` subtracts ONE padding number, read at the truth
         * viewport, at every width. `measureParentContentBox()` reads the box off
         * two filling siblings the probe measured AT each width, so it needs no
         * padding value and cannot be wrong about one. Where both exist and agree
         * the answer is unchanged; where they disagree the measurement wins,
         * because the alternative is arithmetic on an assumption.
         */
        const measuredContent = measuredContentFor(parent);
        if (measuredContent !== undefined) {
          counters.contentBoxMeasured++;
          let maxDelta = 0;
          for (const entry of variantIdx) {
            maxDelta = Math.max(
              maxDelta,
              Math.abs(
                (measuredContent.w[entry.i] ?? 0) - derivedContentAt(entry.i),
              ),
            );
          }
          if (maxDelta > FULL_WIDTH_TOLERANCE_PX) {
            counters.contentBoxMeasuredDisagreed++;
            counters.contentBoxMaxDisagreementPx = Math.max(
              counters.contentBoxMaxDisagreementPx,
              round2(maxDelta),
            );
          }
        } else {
          counters.contentBoxAssumedConstant++;
        }
        const contentAt = (i: number): number =>
          measuredContent !== undefined
            ? (measuredContent.w[i] ?? 0)
            : derivedContentAt(i);
        /*
         * The parent's own x is used only for the centering gaps, where the border
         * box is the right frame of reference — a child is centered inside its
         * parent's CONTENT box, so when that box is measured the gaps are measured
         * against it too.
         */
        const contentLeftAt = (i: number): number =>
          measuredContent !== undefined ? (measuredContent.x[i] ?? 0) : pxAt(i);
        const contentRightAt = (i: number): number =>
          contentLeftAt(i) + contentAt(i);

        /*
         * TASK 28.6 C3 — WHEN THERE IS NO MEASUREMENT AND THE ASSUMPTION IS KNOWN
         * TO BE FALSE.
         *
         * A parent whose authored padding sits under an `@media`, or is written in
         * `vw`/`%`, does not have one padding: it has one per band. With no
         * measured content box to stand on, `contentAt()` is then a number nobody
         * measured, and a ratio or a fills-parent verdict drawn from it is a guess
         * dressed as arithmetic. The two branches that DIVIDE by it refuse, exactly
         * as they do for a containing block that is not the parent.
         */
        const paddingConstancy = parentPaddingConstancy(
          parent,
          variantIdx.map((entry) => entry.width),
        );
        if (paddingConstancy !== "constant") {
          counters.parentPaddingNotConstant[paddingConstancy] =
            (counters.parentPaddingNotConstant[paddingConstancy] ?? 0) + 1;
        }
        const contentBoxGuard: LayoutGuardReason | undefined =
          measuredContent === undefined && paddingConstancy !== "constant"
            ? "parent-padding-not-constant"
            : undefined;

        /*
         * Task 28.5B — is `contentAt()` this node's containing block at all?
         *
         * Computed once per node and consulted by the two branches that DIVIDE by
         * it (full width, percentage width). The centered branch is not gated on
         * it: it emits `max-width` + `margin-inline: auto` + `width: auto`, which
         * asserts a cap and a centering rather than a fraction of the parent, and
         * the browser truth check is its backstop.
         */
        const guard = containingBlockGuard(node, parent, input.styleLookup);

        /*
         * TASK 28.7 G — THE ONE EXIT THE PARENT-RELATIVE BRANCHES CANNOT TAKE.
         *
         * Reached ONLY from an exit that has already refused: a containing-block
         * guard, or the final fall-through. It therefore never competes with a
         * rule the existing funnel would have shipped, and a run with the flag off
         * is byte-identical. Attempted at most once per node so the refusal
         * histogram counts nodes, not visits.
         */
        let insetAttempted = false;
        const tryInsetResolved = (): boolean => {
          if (insetAttempted) return false;
          insetAttempted = true;
          const answer = insetResolvedWidth({
            node,
            parentOf: (child) =>
              child.parentNodeId !== undefined
                ? nodeById.get(child.parentNodeId)
                : undefined,
            styleLookup: input.styleLookup,
            variantIdx,
          });
          if (!answer.ok) {
            if (answer.reason !== "not-out-of-flow") {
              counters.insetResolvedRefusalsByReason[answer.reason] =
                (counters.insetResolvedRefusalsByReason[answer.reason] ?? 0) +
                1;
            }
            return false;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "inset-resolved-width",
            declarations: { width: "auto" },
            evidence: answer.evidence,
          });
          counters.insetResolvedWidth++;
          outcome("emitted-inset-resolved-width");
          return true;
        };

        /*
         * TASK 28.75 — THE IN-FLOW CHAIN ROOT.
         *
         * Same discipline as `tryInsetResolved()` immediately above: reached ONLY
         * from an exit that has already refused, attempted at most once per node
         * so the refusal histogram counts nodes rather than visits, and always
         * AFTER the out-of-flow attempt — the two populations are disjoint by
         * `position`, but the order makes that a fact about the code rather than
         * about the data.
         */
        let trackedFillAttempted = false;
        const tryTrackedFill = (): boolean => {
          if (trackedFillAttempted) return false;
          trackedFillAttempted = true;
          const answer = trackedFillWidth({
            node,
            parent,
            styleLookup: input.styleLookup,
            variantIdx,
            truthIndex: truthEntry.i,
          });
          if (!answer.ok) {
            counters.trackedFillRefusalsByReason[answer.reason] =
              (counters.trackedFillRefusalsByReason[answer.reason] ?? 0) + 1;
            return false;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "tracked-fill-width",
            declarations: { width: "auto" },
            evidence: answer.evidence,
          });
          counters.trackedFillWidth++;
          outcome("emitted-tracked-fill-width");
          return true;
        };

        /*
         * TASK 28.75 — THE FULL-BLEED CHAIN ROOT. Third and last of the
         * refusal-exit attempts, in the same shape as the two above: at most one
         * attempt per node, and only after every branch that could have shipped a
         * rule has already declined. Disjoint from `tryTrackedFill()` by
         * construction — a bleed's border box is WIDER than its parent's, which is
         * the `negative-gap` refusal there.
         */
        let viewportBleedAttempted = false;
        const tryViewportBleed = (): boolean => {
          if (viewportBleedAttempted) return false;
          viewportBleedAttempted = true;
          const answer = viewportBleedWidth({
            node,
            parent,
            styleLookup: input.styleLookup,
            variantIdx,
          });
          if (!answer.ok) {
            counters.viewportBleedRefusalsByReason[answer.reason] =
              (counters.viewportBleedRefusalsByReason[answer.reason] ?? 0) + 1;
            return false;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "viewport-bleed-width",
            declarations: answer.declarations,
            evidence: answer.evidence,
          });
          counters.viewportBleedWidth++;
          outcome("emitted-viewport-bleed-width");
          return true;
        };

        /*
         * TASK 28.75 §19 — THE LAST RESORT. Attempted only after all three
         * recovery branches have refused, so a box with a recoverable relation
         * never gets a clamp instead of one.
         */
        let damageClampAttempted = false;
        const tryDamageClamp = (): boolean => {
          if (damageClampAttempted) return false;
          damageClampAttempted = true;
          const answer = damageClampWidth({
            node,
            parent,
            styleLookup: input.styleLookup,
            variantIdx,
            truthIndex: truthEntry.i,
            guard,
          });
          if (!answer.ok) {
            counters.damageClampRefusalsByReason[answer.reason] =
              (counters.damageClampRefusalsByReason[answer.reason] ?? 0) + 1;
            return false;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "damage-clamped-width",
            declarations: answer.declarations,
            evidence: answer.evidence,
          });
          counters.damageClampedWidth++;
          supersedeOutcome("emitted-damage-clamped-width");
          return true;
        };

        /*
         * Task 28.6 A5(c) — 0 of the `grid-item` refusals were lifted, and the
         * relaxation the evidence could have supported (a single fully fractional
         * track, where the item's grid AREA and the container's content box are
         * the same box) was built, measured at 100 nodes moving up to 2px AWAY,
         * and reverted. See {@link inlineSizeBehaviour} for that account.
         *
         * TASK 28.75 §03b — THE SAME POPULATION, ANSWERED FROM A DIFFERENT
         * MEASUREMENT AND WITH THE NAMED CAUSE FIXED.
         *
         * A5(c) inferred the area from the container's content box and shipped a
         * percentage. This branch does neither: the area comes from
         * `GridTrackRecovery.areas` — measured per width, against the frozen used
         * track list and held to the tiling test — and it ships `width: auto` with
         * `min-width: 0`, which is the exact cure for the automatic-minimum-size
         * failure A5(c) diagnosed. It is attempted only where the guard said
         * `grid-item`, so it can never take a node a shipping branch would answer,
         * and it refuses `container-tracks-not-recovered` wherever the container's
         * tracks are still frozen — where `auto` would reproduce the freeze.
         */
        let gridAreaFillAttempted = false;
        const tryGridAreaFill = (): boolean => {
          if (gridAreaFillAttempted) return false;
          gridAreaFillAttempted = true;
          const answer = gridAreaFillWidth({
            node,
            styleLookup: input.styleLookup,
            guard,
            variantIdx,
            truthIndex: truthEntry.i,
            area: gridAreaByChild.get(`${viewportId}|${node.nodeId}`),
          });
          if (!answer.ok) {
            counters.gridAreaFillRefusalsByReason[answer.reason] =
              (counters.gridAreaFillRefusalsByReason[answer.reason] ?? 0) + 1;
            return false;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "grid-area-fill-width",
            declarations: answer.declarations,
            evidence: answer.evidence,
          });
          counters.gridAreaFillWidth++;
          supersedeOutcome("emitted-grid-area-fill-width");
          return true;
        };

        /*
         * Task 28.6 V2 — the node's own horizontal padding, read ONCE.
         *
         * `max-width` and the percentage ratio both resolve on the CONTENT box
         * unless the node is border-box, so under `content-box` they subtract this
         * padding. Reading it as `?? 0` when the computed style could not be
         * parsed emitted a `max-width` too large by exactly the padding — the same
         * silent-zero defect `fillPercentageWidth()` had. Under `border-box` the
         * padding is inside the declared width and never subtracted, so an
         * unreadable one is harmless there and is NOT refused.
         */
        const nodeBorderBox =
          node.styleTokenId !== undefined &&
          input.styleLookup(node.styleTokenId)?.["box-sizing"] === "border-box";
        const ownPaddingRaw = horizontalPadding(node, input.styleLookup);
        const ownPaddingUnreadable =
          !nodeBorderBox && ownPaddingRaw === undefined;
        const ownPadding = ownPaddingRaw ?? 0;

        /*
         * Task 28.6 R2 — how may this box's inline size be restated?
         *
         * Two answers, because the answer depends on what else the rule emits:
         * `centered-max-width` always adds `margin-inline: auto`, which defeats
         * stretch on a flex item, a grid item and an out-of-flow box, while
         * `full-width` emits the width alone.
         */
        const centeredSizing = inlineSizeBehaviour(
          node,
          parent,
          input.styleLookup,
          {
            autoInlineMargins: true,
          },
        );
        const bareSizing = inlineSizeBehaviour(
          node,
          parent,
          input.styleLookup,
          {
            autoInlineMargins: false,
          },
        );
        /**
         * Turn a decision into the `width` declaration, or refuse.
         *
         * A `fill-percentage` answer is a claim ABOUT the parent's content box, so
         * it stands on the same containing-block guard the dividing branches use.
         * A `stretch` answer is not: `width: auto` names no denominator.
         */
        const widthValueFor = (
          behaviour: InlineSizeBehaviour,
        ): string | undefined => {
          if (behaviour.mode === "stretch") {
            counters.widthModeStretch++;
            return "auto";
          }
          if (behaviour.mode === "fill-percentage") {
            if (guard !== undefined) {
              refuse(guard);
              outcome("refused-containing-block-guard");
              return undefined;
            }
            // Task 28.6 V2: an unreadable own padding refuses the VALUE, which is
            // a different failure from refusing the SHAPE, and is counted apart.
            const value = fillPercentageWidth(node, input.styleLookup);
            if (value === undefined) {
              refuseWidthValue("own-padding-unreadable");
              outcome("refused-width-value");
              return undefined;
            }
            counters.widthModeFillPercentage++;
            return value;
          }
          refuseWidthMode(behaviour.reason);
          outcome("refused-width-mode");
          return undefined;
        };

        /*
         * Task 28.6 C3 — growth of the CONTAINING BLOCK, not of the parent's border
         * box. Every branch below asks "did the box this node resolves against
         * actually change enough for a constancy claim to mean anything", and that
         * box is the content box. With a measured content box the two differ by
         * exactly the padding change the assumption used to miss.
         */
        const parentGrowth =
          Math.max(...variantIdx.map((entry) => contentAt(entry.i))) -
          Math.min(...variantIdx.map((entry) => contentAt(entry.i)));

        // --- centered max-width ------------------------------------------------
        const constrained = variantIdx.filter(
          (entry) => contentAt(entry.i) - wAt(entry.i) >= PARENT_GROWTH_MIN_PX,
        );
        const widthValues = constrained.map((entry) => wAt(entry.i));
        const widthConstant =
          widthValues.length >= 2 &&
          Math.max(...widthValues) - Math.min(...widthValues) <=
            WIDTH_CONSTANT_TOLERANCE_PX;
        // Gaps against the CONTAINING BLOCK: `margin-inline: auto` centers a box
        // inside its parent's CONTENT box, so that is the frame the equality has
        // to hold in (Task 28.6 C3).
        const centeredEverywhere =
          constrained.length >= 2 &&
          constrained.every((entry) => {
            const leftGap = xAt(entry.i) - contentLeftAt(entry.i);
            const rightGap =
              contentRightAt(entry.i) - (xAt(entry.i) + wAt(entry.i));
            return Math.abs(leftGap - rightGap) <= CENTER_GAP_TOLERANCE_PX;
          });
        if (
          widthConstant &&
          centeredEverywhere &&
          parentGrowth >= PARENT_GROWTH_MIN_PX
        ) {
          if (ownPaddingUnreadable) {
            refuseWidthValue("own-padding-unreadable");
            outcome("refused-own-padding-unreadable");
            continue;
          }
          const widthValue = widthValueFor(centeredSizing);
          if (widthValue === undefined) {
            // Task 28.75 §19 — the shape was recoverable, the VALUE was not. The
            // clamp supersedes the refusal it just recorded; see `supersedeOutcome`.
            if (!tryGridAreaFill()) tryDamageClamp();
            continue;
          }
          // `max-width` resolves on the CONTENT box unless the node itself is
          // border-box; the probe width is always border-box.
          const maxWidth = Math.round(
            Math.max(...widthValues) - (nodeBorderBox ? 0 : ownPadding),
          );
          const evidence = constrained.map(
            (entry) =>
              `${entry.width}px: left ${round2(xAt(entry.i) - contentLeftAt(entry.i))} / ` +
              `width ${round2(wAt(entry.i))} / right ${round2(
                contentRightAt(entry.i) - xAt(entry.i) - wAt(entry.i),
              )}`,
          );
          const authored = (node.authoredLayout ?? []).filter(
            (rule) =>
              (rule.property === "max-width" && rule.media === undefined) ||
              ((rule.property === "margin" ||
                rule.property === "margin-left" ||
                rule.property === "margin-right" ||
                rule.property === "margin-inline") &&
                rule.value.includes("auto")),
          );
          for (const rule of authored) {
            evidence.push(
              `authored ${rule.property}: ${rule.value} (${rule.selector})`,
            );
          }
          evidence.push(
            `inline size: ${centeredSizing.mode} (${centeredSizing.reason})`,
          );
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "centered-max-width",
            declarations: {
              "max-width": `${maxWidth}px`,
              "margin-left": "auto",
              "margin-right": "auto",
              width: widthValue,
            },
            evidence,
          });
          counters.centered++;
          outcome("emitted-centered-max-width");
          continue;
        }

        /*
         * --- centered max-width whose cap engages only ABOVE the truth width ---
         *
         * The check above needs the cap visibly engaged at TWO probe widths. A
         * marketing shell of the form `max-width: C; margin-inline: auto` whose C
         * sits at (or just under) the truth viewport shows a different probe
         * signature: at every width below C the node simply FILLS its parent's
         * content box, and only at the widest probe width does it stop growing
         * and center. `w == min(parentContent, cap)` at EVERY desktop width is
         * exactly the arithmetic of `width:auto + max-width + margin auto`, so it
         * is checked in full — one width off the curve rejects the rule — plus
         * equal gaps wherever the cap is engaged, at least one width where it
         * demonstrably is, and the same truth-sanity gate as every other rule.
         * (Task 26 generic correction; first measured on a fresh non-Stripe
         * source, where every route's outer shell had this shape and the wide
         * viewports drifted 480px left on the exact fallback.)
         */
        const cap = Math.max(...variantIdx.map((entry) => wAt(entry.i)));
        const capEngaged = variantIdx.filter(
          (entry) => contentAt(entry.i) - cap >= PARENT_GROWTH_MIN_PX,
        );
        const followsCappedFill = variantIdx.every((entry) => {
          const expected = Math.min(contentAt(entry.i), cap);
          return Math.abs(wAt(entry.i) - expected) <= FULL_WIDTH_TOLERANCE_PX;
        });
        const engagedCentered = capEngaged.every((entry) => {
          const leftGap = xAt(entry.i) - contentLeftAt(entry.i);
          const rightGap =
            contentRightAt(entry.i) - (xAt(entry.i) + wAt(entry.i));
          return Math.abs(leftGap - rightGap) <= CENTER_GAP_TOLERANCE_PX;
        });
        if (
          capEngaged.length >= 1 &&
          followsCappedFill &&
          engagedCentered &&
          parentGrowth >= PARENT_GROWTH_MIN_PX
        ) {
          if (ownPaddingUnreadable) {
            refuseWidthValue("own-padding-unreadable");
            outcome("refused-own-padding-unreadable");
            continue;
          }
          const widthValue = widthValueFor(centeredSizing);
          if (widthValue === undefined) {
            // Task 28.75 §19 — the shape was recoverable, the VALUE was not. The
            // clamp supersedes the refusal it just recorded; see `supersedeOutcome`.
            if (!tryGridAreaFill()) tryDamageClamp();
            continue;
          }
          const maxWidth = Math.round(cap - (nodeBorderBox ? 0 : ownPadding));
          const evidence = variantIdx.map(
            (entry) =>
              `${entry.width}px: width ${round2(wAt(entry.i))} vs parent content ` +
              `${round2(contentAt(entry.i))} (${
                capEngaged.includes(entry)
                  ? "cap engaged, centered"
                  : "fills content"
              })`,
          );
          const authored = (node.authoredLayout ?? []).filter(
            (rule) =>
              (rule.property === "max-width" && rule.media === undefined) ||
              ((rule.property === "margin" ||
                rule.property === "margin-left" ||
                rule.property === "margin-right" ||
                rule.property === "margin-inline") &&
                rule.value.includes("auto")),
          );
          for (const rule of authored) {
            evidence.push(
              `authored ${rule.property}: ${rule.value} (${rule.selector})`,
            );
          }
          evidence.push(
            `inline size: ${centeredSizing.mode} (${centeredSizing.reason})`,
          );
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "centered-max-width",
            declarations: {
              "max-width": `${maxWidth}px`,
              "margin-left": "auto",
              "margin-right": "auto",
              width: widthValue,
            },
            evidence,
          });
          counters.centered++;
          outcome("emitted-centered-max-width-capped-fill");
          continue;
        }

        // --- full width --------------------------------------------------------
        const fullWidthEverywhere = variantIdx.every(
          (entry) =>
            Math.abs(wAt(entry.i) - contentAt(entry.i)) <=
            FULL_WIDTH_TOLERANCE_PX,
        );
        if (fullWidthEverywhere && parentGrowth >= PARENT_GROWTH_MIN_PX) {
          // Task 28.6 C3 — a fills-parent verdict drawn from a padding the source
          // says is not constant, with nothing measured to replace it.
          if (contentBoxGuard !== undefined) {
            if (tryInsetResolved()) continue;
            if (tryTrackedFill()) continue;
            if (tryViewportBleed()) continue;
            if (tryGridAreaFill()) continue;
            if (tryDamageClamp()) continue;
            refuse(contentBoxGuard);
            outcome("refused-containing-block-guard");
            continue;
          }
          if (guard !== undefined) {
            // "Fills its parent's content box" is a claim ABOUT that box. When the
            // box is not the containing block the claim is untestable, and the
            // 28.5A corpus's single worst regression (1344px observed → 805px
            // rendered) came through exactly here: a flex box inside a grid.
            if (tryInsetResolved()) continue;
            if (tryTrackedFill()) continue;
            if (tryViewportBleed()) continue;
            if (tryGridAreaFill()) continue;
            if (tryDamageClamp()) continue;
            refuse(guard);
            outcome("refused-containing-block-guard");
            continue;
          }
          const widthValue = widthValueFor(bareSizing);
          if (widthValue === undefined) {
            if (!tryGridAreaFill()) tryDamageClamp();
            continue;
          }
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "full-width",
            declarations: { width: widthValue },
            evidence: [
              ...variantIdx.map(
                (entry) =>
                  `${entry.width}px: width ${round2(wAt(entry.i))} vs parent content ` +
                  `${round2(contentAt(entry.i))} (padding ${parentPadding})`,
              ),
              `inline size: ${bareSizing.mode} (${bareSizing.reason})`,
            ],
          });
          counters.fullWidth++;
          outcome("emitted-full-width");
          continue;
        }

        // --- constant percentage width -----------------------------------------
        const ratios = variantIdx.map((entry) =>
          contentAt(entry.i) > 0 ? wAt(entry.i) / contentAt(entry.i) : 0,
        );
        const ratioSpread = Math.max(...ratios) - Math.min(...ratios);
        const meanRatio =
          ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
        const nodeGrowth =
          Math.max(...variantIdx.map((entry) => wAt(entry.i))) -
          Math.min(...variantIdx.map((entry) => wAt(entry.i)));
        if (
          ratioSpread <= PERCENTAGE_RATIO_TOLERANCE &&
          meanRatio >= 0.05 &&
          meanRatio <= 0.98 &&
          parentGrowth >= PARENT_GROWTH_MIN_PX &&
          nodeGrowth >= 20
        ) {
          // Task 28.6 C3 — a constant ratio against a denominator that is not one
          // number is still a constant ratio, and still wrong.
          if (contentBoxGuard !== undefined) {
            if (tryInsetResolved()) continue;
            if (tryTrackedFill()) continue;
            if (tryViewportBleed()) continue;
            if (tryGridAreaFill()) continue;
            if (tryDamageClamp()) continue;
            refuse(contentBoxGuard);
            outcome("refused-containing-block-guard");
            continue;
          }
          if (guard !== undefined) {
            // The proven defect. A constant ratio against the WRONG denominator is
            // still a constant ratio, so no measurement in this branch can detect
            // the error — only the containing block can.
            if (tryInsetResolved()) continue;
            if (tryTrackedFill()) continue;
            if (tryViewportBleed()) continue;
            if (tryGridAreaFill()) continue;
            if (tryDamageClamp()) continue;
            refuse(guard);
            outcome("refused-containing-block-guard");
            continue;
          }
          if (ownPaddingUnreadable) {
            refuseWidthValue("own-padding-unreadable");
            outcome("refused-own-padding-unreadable");
            continue;
          }
          const effectiveRatio = nodeBorderBox
            ? meanRatio
            : variantIdx
                .map((entry) =>
                  contentAt(entry.i) > 0
                    ? (wAt(entry.i) - ownPadding) / contentAt(entry.i)
                    : 0,
                )
                .reduce((sum, ratio) => sum + ratio, 0) / variantIdx.length;
          const pct = Math.round(effectiveRatio * 10_000) / 100;
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: truthRect,
            kind: "percentage-width",
            declarations: { width: `${pct}%` },
            evidence: variantIdx.map(
              (entry) =>
                `${entry.width}px: ratio ${round2(
                  contentAt(entry.i) > 0
                    ? wAt(entry.i) / contentAt(entry.i)
                    : 0,
                )} of parent content (padding ${parentPadding})`,
            ),
          });
          counters.percentage++;
          outcome("emitted-percentage-width");
          continue;
        }

        /*
         * TASK 28.6 C3 — THE FALL-THROUGH, AT LAST COUNTED.
         *
         * Every inline-size predicate was evaluated and none held. Before this
         * line the node simply left the loop and the artifact said nothing about
         * it, which is how gs.severance.healthcare could report 7 width refusals
         * over a population in the thousands. The node keeps its exact computed
         * width — measured at the truth viewport and frozen there — at every width
         * the clone renders.
         */
        if (tryInsetResolved()) continue;
        if (tryTrackedFill()) continue;
        if (tryViewportBleed()) continue;
        if (tryGridAreaFill()) continue;
        if (tryDamageClamp()) continue;
        outcome("no-branch-matched");
      }

      /*
       * ------------------------------------------------------------------------
       * TASK 28.7 B1 — RESIDUAL FREEZE AUDIT EVIDENCE (source half).
       * ------------------------------------------------------------------------
       *
       * Runs LAST in the pass, so every rule and every refusal reason this pass
       * produced is already known and can be attached to the node it belongs to.
       *
       * A candidate is any node whose OWN observed geometry moves across the
       * widths this variant is displayed at. That filter is the whole point: if
       * the source box never moved, there is no responsive meaning for the exact
       * tier to have frozen away, and nothing for the clone to be wrong about.
       * The clone half — does the clone move too? — is a render, and it happens
       * in `layout-truth-check.ts`.
       */
      const descendantsOf = (nodeId: string): number => {
        let total = 0;
        const stack = [nodeId];
        while (stack.length > 0) {
          const current = nodeById.get(stack.pop()!);
          if (current === undefined) continue;
          for (const childId of current.childNodeIds) {
            total++;
            stack.push(childId);
          }
        }
        return total;
      };
      const ruleByNode = new Map<string, RecoveredRuleKind>();
      for (const rule of rules) {
        if (rule.pageId !== page.pageId) continue;
        if ((rule.viewportId ?? "desktop") !== viewportId) continue;
        ruleByNode.set(rule.nodeId, rule.kind);
      }
      const auditCandidates: ResidualAuditNode[] = [];
      for (const node of viewport.nodes) {
        if (node.type !== "element" || !node.probe) continue;
        if (node.tagName === "html" || node.tagName === "body") continue;
        const probe = node.probe;
        const shown = variantIdx.filter(
          (entry) =>
            (probe.v[entry.i] ?? 0) === 1 && (probe.w[entry.i] ?? 0) > 0,
        );
        if (shown.length < 2) continue;
        const widths = shown.map((entry) => probe.w[entry.i] ?? 0);
        const lefts = shown.map((entry) => probe.x[entry.i] ?? 0);
        const spread = Math.max(
          Math.max(...widths) - Math.min(...widths),
          Math.max(...lefts) - Math.min(...lefts),
        );
        if (spread < RESIDUAL_SOURCE_CHANGE_MIN_PX) continue;
        const props = node.styleTokenId
          ? input.styleLookup(node.styleTokenId)
          : undefined;
        const frozen = frozenFamilyOf(props);
        const parent =
          node.parentNodeId !== undefined
            ? nodeById.get(node.parentNodeId)
            : undefined;
        const refusal = refusalByNode.get(`${viewportId}|${node.nodeId}`);
        const kind = ruleByNode.get(node.nodeId);
        auditCandidates.push({
          nodeId: node.nodeId,
          tagName: node.tagName,
          ...(node.parentNodeId !== undefined
            ? { parentNodeId: node.parentNodeId }
            : {}),
          descendants: descendantsOf(node.nodeId),
          sourceX: variantIdx.map((entry) => probe.x[entry.i] ?? 0),
          sourceW: variantIdx.map((entry) => probe.w[entry.i] ?? 0),
          sourceV: variantIdx.map((entry) => probe.v[entry.i] ?? 0),
          ...(parent?.probe !== undefined
            ? {
                parentSourceW: variantIdx.map(
                  (entry) => parent.probe!.w[entry.i] ?? 0,
                ),
              }
            : {}),
          property: frozen.property,
          family: frozen.family,
          frozenValue: frozen.value,
          sourceSpreadPx: round2(spread),
          ...(kind !== undefined ? { recoveredKind: kind } : {}),
          ...(refusal !== undefined ? { refusalReason: refusal } : {}),
        });
      }
      counters.residualAuditNodesOffered += auditCandidates.length;
      /*
       * Bounded, and what the bound drops is COUNTED. Ranked by source movement
       * before the cut because the biggest movers are the boxes a frozen pixel
       * costs the most on — the ranking after the render is a different one, over
       * the measured residual rather than over the source alone.
       */
      auditCandidates.sort(
        (a, b) =>
          b.sourceSpreadPx - a.sourceSpreadPx ||
          a.nodeId.localeCompare(b.nodeId),
      );
      if (auditCandidates.length > RESIDUAL_AUDIT_MAX_NODES_PER_PASS) {
        counters.residualAuditNodesOmitted +=
          auditCandidates.length - RESIDUAL_AUDIT_MAX_NODES_PER_PASS;
      }
      const kept = auditCandidates.slice(0, RESIDUAL_AUDIT_MAX_NODES_PER_PASS);
      if (kept.length > 0) {
        residualAudit.push({
          pageId: page.pageId,
          viewportId,
          widths: variantIdx.map((entry) => entry.width),
          nodes: kept,
        });
      }
    }

    /*
     * ------------------------------------------------------------------------
     * REC-I2 (§C2.5 step 1) — AUTHORED-FIRST WIDTH-FAMILY PLAN OFFERS.
     * ------------------------------------------------------------------------
     *
     * After the measured funnel (which still runs for every node: it is the
     * tier-3 fallback) and BEFORE the authored inline-size fallback, which runs
     * for EVERY node, offered or not (continuous-QA fix: a rejected plan must
     * keep its tier-3 fallback; `applyOwnership()` drops an accepted owner's
     * measured width-family declarations). See
     * {@link ownedValueAdmissible} / {@link ownedPlanContradictions}. The plan
     * wins over measured width-family rules only once two-phase verification
     * accepts it (`generateApp()`); `already-recovered` no longer suppresses it.
     */
    for (const viewportId of LAYOUT_VIEWPORT_IDS) {
      const viewport = page.viewports[viewportId];
      if (viewport === undefined) continue;
      const own = counters.responsiveOwnership!;
      const elementNodes = viewport.nodes.filter(
        (node): node is ElementSpecNode => node.type === "element",
      );
      const notConsidered = (reason: OwnershipNotConsideredReason, count = 1): void => {
        if (count <= 0) return;
        own.notConsideredByReason[reason] = (own.notConsideredByReason[reason] ?? 0) + count;
      };
      const planRoots = elementNodes.filter(
        (node) => node.tagName !== "html" && node.tagName !== "body",
      );
      if (viewport.initialDocument === undefined) {
        notConsidered("observer-evidence-absent", planRoots.length);
        continue;
      }
      if (
        viewport.authoredBreakpoints === undefined ||
        viewport.authoredBreakpoints.declarationsExamined === 0
      ) {
        notConsidered("authored-declarations-unread", planRoots.length);
        continue;
      }
      const pageBreakpoint =
        input.breakpointByPageId?.get(page.pageId) ?? input.breakpoint;
      const resolved = resolveViewportProbe(page, viewportId, {
        breakpoint: pageBreakpoint,
        truthWidth: viewportId === "desktop" ? TRUTH_WIDTH : mobileTruthWidth,
      });
      if (!resolved.ok) {
        notConsidered("probe-unavailable", planRoots.length);
        continue;
      }
      const served = ruleServedInterval(viewportId, pageBreakpoint);
      const truthWidth = resolved.truthEntry.width;
      if (served === undefined || !(truthWidth >= served.min && truthWidth < served.max)) {
        notConsidered("truth-outside-served-interval", planRoots.length);
        continue;
      }
      const nodeById = new Map(elementNodes.map((node) => [node.nodeId, node]));
      const customProperties =
        input.customPropertiesByPage?.get(`${page.pageId}:${viewportId}`) ??
        EMPTY_CUSTOM_PROPERTIES;
      const widthFamilyRecordNames = new Set(
        WIDTH_FAMILY_PROPERTIES.flatMap((property) => contributingRecordNames(property)),
      );
      /*
       * Review fix (MAJOR-3) — `.some()` over a node's width-family records is
       * vacuously false for a node with NONE, so the per-node metadata check
       * cannot prove anything for it: the viewport must show cascade metadata
       * on at least one authored record at all.
       */
      const viewportHasCascadeMetadata = elementNodes.some((candidate) =>
        (candidate.authoredLayout ?? []).some((record) => record.ruleOrder !== undefined),
      );
      const coverageGaps = stylesheetCoverageGaps(
        (viewport as { stylesheetCoverage?: StylesheetCoverageLike }).stylesheetCoverage ??
          input.stylesheetCoverageByPage?.get(`${page.pageId}:${viewportId}`),
      );
      const insideSvg = (node: ElementSpecNode): boolean => {
        let parentId = node.parentNodeId;
        while (parentId !== undefined) {
          const parent = nodeById.get(parentId);
          if (parent === undefined) return false;
          if (parent.tagName === "svg") return true;
          parentId = parent.parentNodeId;
        }
        return false;
      };
      for (const node of planRoots) {
        const box = node.boundingBox;
        if (box === undefined || !(box.width > 0) || node.effectiveVisible === false) {
          notConsidered("node-not-in-layout");
          continue;
        }
        if (insideSvg(node)) {
          notConsidered("svg-content");
          continue;
        }
        const widthFamilyRecords = (node.authoredLayout ?? []).filter((record) =>
          widthFamilyRecordNames.has(record.property),
        );
        if (
          widthFamilyRecords.some((record) => record.ruleOrder === undefined) ||
          (widthFamilyRecords.length === 0 && !viewportHasCascadeMetadata)
        ) {
          notConsidered("cascade-metadata-absent");
          continue;
        }
        own.nodesConsidered++;
        const notOffered = (reason: OwnershipNotOfferedReason): void => {
          own.notOfferedByReason[reason] = (own.notOfferedByReason[reason] ?? 0) + 1;
        };
        const props = node.styleTokenId ? input.styleLookup(node.styleTokenId) : undefined;
        const display = props?.["display"];
        if (
          display !== undefined &&
          AUTHORED_INTENT_INLINE_DISPLAYS.has(display) &&
          !(display === "inline" && OWNERSHIP_INLINE_REPLACED.has(node.tagName))
        ) {
          notOffered("node-display-inline");
          continue;
        }
        const samples =
          node.probe !== undefined
            ? probeSamplesInInterval(node.probe, resolved.probeInfo.widths, served)
            : [];
        if (!samples.some((sample) => sample.v === 1 && sample.width !== truthWidth)) {
          notOffered("no-interval-evidence");
          continue;
        }
        const family = planNodeWidthFamily({
          node,
          viewportId,
          served,
          pageId: page.pageId,
          ...(props !== undefined ? { truthComputed: props } : {}),
          truthViewportWidth: truthWidth,
          admit: (property, value) => ownedValueAdmissible(property, value, customProperties),
        });
        if (!family.ok) {
          notOffered("ambiguous");
          for (const reason of family.reasons) {
            own.ambiguousByReason[reason] = (own.ambiguousByReason[reason] ?? 0) + 1;
          }
          continue;
        }
        const parentNode =
          node.parentNodeId !== undefined ? nodeById.get(node.parentNodeId) : undefined;
        const parentProps = parentNode?.styleTokenId
          ? input.styleLookup(parentNode.styleTokenId)
          : undefined;
        let parentContentWidth: number | undefined;
        if (parentNode?.boundingBox !== undefined) {
          const pad = horizontalPadding(parentNode, input.styleLookup);
          const border = horizontalBorder(parentNode, input.styleLookup);
          if (pad !== undefined) parentContentWidth = parentNode.boundingBox.width - pad - border;
        }
        const contradicted = ownedPlanContradictions({
          plans: family.plans,
          truthWidth,
          computed: props,
          parentDisplay: parentProps?.["display"],
          parentContentWidth,
          customProperties,
        });
        if (contradicted.length > 0) {
          notOffered("contradicted-by-truth");
          for (const property of contradicted) {
            own.contradictedByProperty[property] = (own.contradictedByProperty[property] ?? 0) + 1;
          }
          continue;
        }

        const planGroup = `${page.pageId}:${viewportId}:${node.nodeId}`;
        const pieces = ownedPiecesOf(family.plans, served);
        /*
         * Review fix (MAJOR-3) — an ALL-INITIAL plan (no piece of any of the six
         * properties comes from a declaration the source wrote) is a claim that
         * NO declaration exists. That is only provable when the page's authored
         * CSS was read completely and nothing about this node was truncated;
         * otherwise an unread sheet's `.card{width:320px}` would be replaced by
         * `width:auto`.
         */
        const declared = pieces.some((piece) =>
          Object.values(piece.provenance).some((provenance) => OWNERSHIP_DECLARED_PROVENANCE.has(provenance)),
        );
        if (!declared) {
          const nodeGaps = [
            ...coverageGaps,
            ...(node.authoredLayoutTruncated === true ? ["authored-layout-truncated"] : []),
            ...(node.inlineStyle?.truncated === true ? ["inline-style-truncated"] : []),
          ];
          if (nodeGaps.length > 0) {
            notOffered("coverage-incomplete");
            const byReason = (own.coverageIncompleteByReason ??= {});
            byReason[nodeGaps[0]!] = (byReason[nodeGaps[0]!] ?? 0) + 1;
            continue;
          }
        }
        const provenanceByProperty: Record<string, Record<string, number>> = {};
        const children: OwnedPlanOffer["children"] = [];
        for (const childId of node.childNodeIds) {
          const child = nodeById.get(childId);
          if (child?.probe === undefined) continue;
          const childSamples = probeSamplesInInterval(child.probe, resolved.probeInfo.widths, served);
          if (childSamples.some((sample) => sample.v === 1)) {
            children.push({ nodeId: child.nodeId, samples: childSamples });
          }
        }
        const witnesses: NonNullable<OwnedPlanOffer["witnesses"]> = [];
        for (const witnessId of [
          ...(parentNode !== undefined ? [parentNode.nodeId] : []),
          ...(parentNode?.childNodeIds ?? []).filter((id) => id !== node.nodeId),
        ]) {
          const witness = nodeById.get(witnessId);
          if (witness?.probe === undefined) continue;
          const witnessSamples = probeSamplesInInterval(witness.probe, resolved.probeInfo.widths, served);
          if (witnessSamples.some((sample) => sample.v === 1)) {
            witnesses.push({ nodeId: witness.nodeId, samples: witnessSamples });
          }
        }
        for (const piece of pieces) {
          const evidence = [
            `width-family ownership plan ${planGroup}: piece [${piece.interval.min}, ${
              piece.interval.max === Number.POSITIVE_INFINITY ? "∞" : piece.interval.max
            }) of served [${served.min}, ${served.max === Number.POSITIVE_INFINITY ? "∞" : served.max})`,
          ];
          for (const property of WIDTH_FAMILY_PROPERTIES) {
            const provenance = piece.provenance[property]!;
            const bucket = (provenanceByProperty[property] ??= {});
            bucket[provenance] = (bucket[provenance] ?? 0) + 1;
            const planPiece = pieceAt(family.plans[property], piece.interval.min);
            const condition =
              planPiece?.kind === "winner" && planPiece.decl.sourceCondition !== undefined
                ? ` [${planPiece.decl.sourceCondition}]`
                : "";
            evidence.push(`${property}: ${piece.declarations[property]} (${provenance})${condition}`);
          }
          const media = ownedPieceMedia(piece.interval, served);
          rules.push({
            pageId: page.pageId,
            viewportId,
            nodeId: node.nodeId,
            truth: { x: box.x, w: box.width },
            kind: "responsive-owned",
            declarations: piece.declarations,
            ...(media !== undefined ? { media } : {}),
            evidence,
            planGroup,
            pieceInterval: piece.interval,
            servedInterval: served,
            samples,
          });
          own.rulesEmitted++;
        }
        own.plansOffered++;
        ownedPlans.push({
          planGroup,
          pageId: page.pageId,
          viewportId,
          nodeId: node.nodeId,
          tagName: node.tagName,
          servedInterval: served,
          truthWidth,
          truth: { x: box.x, w: box.width },
          samples,
          children,
          ...(parentNode !== undefined ? { parentNodeId: parentNode.nodeId } : {}),
          witnesses,
          pieces: pieces.length,
          provenanceByProperty,
        });
      }
    }

    /*
     * ------------------------------------------------------------------------
     * TASK 28.8 A2 — THE AUTHORED INLINE-SIZE FALLBACK.
     * ------------------------------------------------------------------------
     *
     * ITS OWN PASS, DELIBERATELY OUTSIDE THE PROBE-GATED ONE ABOVE.
     *
     * Every branch above stands on the multi-width probe, so all of them live
     * inside `resolveViewportProbe()`'s verdict and a page whose probe did not
     * align gets no rule from any of them. This branch stands on something else
     * entirely — the source's own matched declarations and the node's observed
     * truth box — and neither of those needs the probe. Gating it on the probe
     * anyway would refuse a relation the artifact plainly carries because a
     * DIFFERENT evidence channel was unusable.
     *
     * It runs over every element node in the variant that no recovered rule
     * already answers for. A node that reached `no-branch-matched`, one refused
     * by a containing-block guard, and one dropped before the funnel even
     * started are all the same thing here: a box about to ship its
     * truth-resolved pixel at every width. If the source's own stylesheet said
     * something relational about that box, this is where it gets said again —
     * and then goes through `verifyLayoutRules()` exactly like every other kind.
     *
     * The served RANGE is derived from the number this route actually serves —
     * the same `breakpointByPageId` lookup the probe axis splits on — so the two
     * can never disagree about the widths a mobile declaration must be true at.
     */
    for (const viewportId of LAYOUT_VIEWPORT_IDS) {
      const viewport = page.viewports[viewportId];
      if (viewport === undefined) continue;
      const pageBreakpoint =
        input.breakpointByPageId?.get(page.pageId) ?? input.breakpoint;
      const nodeById = new Map<string, ElementSpecNode>();
      for (const node of viewport.nodes) {
        if (node.type === "element") nodeById.set(node.nodeId, node);
      }
      /*
       * The nodes a MEASURED branch already answered for. Anything this pass
       * emits for one of them would either duplicate a proven relation or fight
       * it at the same specificity, so they are excluded rather than ranked.
       */
      const inlineSizeAnswered = new Set<string>();
      for (const rule of rules) {
        if (rule.pageId !== page.pageId) continue;
        if ((rule.viewportId ?? "desktop") !== viewportId) continue;
        // An ownership OFFER answers nothing until verified (see above).
        if (rule.kind === "responsive-owned") continue;
        for (const property of AUTHORED_INTENT_PROPERTIES) {
          if (rule.declarations[property] !== undefined) {
            inlineSizeAnswered.add(rule.nodeId);
            break;
          }
        }
      }
      const servedRange: readonly [number, number] =
        viewportId === "mobile"
          ? [0, pageBreakpoint - 0.02]
          : [pageBreakpoint, Number.POSITIVE_INFINITY];
      const bump = (record: Record<string, number>, key: string): void => {
        record[key] = (record[key] ?? 0) + 1;
      };
      for (const node of viewport.nodes) {
        if (node.type !== "element") continue;
        if (node.tagName === "html" || node.tagName === "body") continue;
        const box = node.boundingBox;
        if (box === undefined || !(box.width > 0)) continue;
        if (node.effectiveVisible === false) continue;
        bump(counters.authoredIntent.offered, viewportId);
        /*
         * REC-I2 regression fix — a plan-offered node is NOT skipped here. An offer
         * is only a candidate: when phase B rejects it (or a rollback drops it) the
         * node must still have this tier-3 fallback, or it collapses to the frozen
         * truth px at every width. When the group IS accepted, `applyOwnership()`
         * drops this rule's width-family declarations for the owner.
         */
        const parentNode =
          node.parentNodeId !== undefined
            ? nodeById.get(node.parentNodeId)
            : undefined;
        let parentContentWidth: number | undefined;
        if (parentNode?.boundingBox !== undefined) {
          const pad = horizontalPadding(parentNode, input.styleLookup);
          const border = horizontalBorder(parentNode, input.styleLookup);
          if (pad !== undefined) {
            parentContentWidth = parentNode.boundingBox.width - pad - border;
          }
        }
        const answer = authoredInlineSizeIntent({
          node,
          styleLookup: input.styleLookup,
          servedRange,
          truthWidth: box.width,
          parentContentWidth,
          customProperties: input.customPropertiesByPage?.get(
            `${page.pageId}:${viewportId}`,
          ),
          alreadyRecovered: inlineSizeAnswered.has(node.nodeId),
          onDeclarationRefusal: (property, reason) =>
            bump(
              counters.authoredIntent.declarationRefusalsByReason,
              `${property}:${reason}`,
            ),
        });
        if (!answer.ok) {
          bump(counters.authoredIntent.refusalsByReason, answer.reason);
          continue;
        }
        rules.push({
          pageId: page.pageId,
          viewportId,
          nodeId: node.nodeId,
          truth: { x: box.x, w: box.width },
          kind: "authored-inline-size",
          declarations: answer.declarations,
          evidence: answer.evidence,
        });
        bump(counters.authoredIntent.emitted, viewportId);
        counters.authoredIntent.cascadeCandidates += answer.cascadeCandidates;
        counters.authoredIntent.varAdmitted += answer.varAdmitted;
        counters.authoredIntent.declarations += Object.keys(
          answer.declarations,
        ).length;
        if (
          answer.evidence.some((line) => line.startsWith("no authored width"))
        ) {
          counters.authoredIntent.widthAutoAdded++;
        }
        for (const property of Object.keys(answer.declarations)) {
          bump(counters.authoredIntent.emittedByProperty, property);
        }
      }
    }

    /*
     * P0 contract C2.1 — per-width source truth for verification. Every rule
     * this page emitted (both trees, every kind) gets the source probe box of
     * its node at each probe width inside its served interval, so the truth
     * check can hold it to more than the one truth width. Additive: no rule's
     * declarations change here.
     */
    attachIntervalSamples(
      page,
      rules.slice(pageRulesStart),
      input.breakpointByPageId?.get(page.pageId) ?? input.breakpoint,
    );
  }

  // Requirement (d) of C2b — the split, reported rather than assumed.
  for (const rule of rules) {
    const id = rule.viewportId ?? "desktop";
    counters.rulesByViewport[id] = (counters.rulesByViewport[id] ?? 0) + 1;
  }

  /*
   * Task 28.7 B1 — the per-node grid refusal log, bounded PER ROUTE by the
   * measured cost of the freeze. Same shape as `TreeSwitchDecision.candidates`
   * / `candidatesOmitted`: a cut that cannot be silent.
   */
  const refusalsByRoute = new Map<string, GridTrackRefusalRecord[]>();
  for (const record of gridRefusalRecords) {
    const list = refusalsByRoute.get(record.pageId);
    if (list) list.push(record);
    else refusalsByRoute.set(record.pageId, [record]);
  }
  const gridTrackRefusalNodes: GridTrackRefusalRecord[] = [];
  let gridTrackRefusalNodesOmitted = 0;
  for (const pageId of [...refusalsByRoute.keys()].sort()) {
    const list = refusalsByRoute.get(pageId)!;
    list.sort(
      (a, b) =>
        (b.frozenExcessPx ?? Number.NEGATIVE_INFINITY) -
          (a.frozenExcessPx ?? Number.NEGATIVE_INFINITY) ||
        a.nodeId.localeCompare(b.nodeId),
    );
    if (list.length > GRID_TRACK_REFUSALS_REPORTED) {
      gridTrackRefusalNodesOmitted +=
        list.length - GRID_TRACK_REFUSALS_REPORTED;
    }
    gridTrackRefusalNodes.push(...list.slice(0, GRID_TRACK_REFUSALS_REPORTED));
  }

  return {
    rules,
    css: generateLayoutCss(rules),
    counters,
    residualAudit,
    gridTrackRefusalNodes,
    gridTrackRefusalNodesOmitted,
    ownedPlans,
  };
}

/**
 * Turn hidden probe widths into numeric bands, using the same midpoint
 * convention as the generated breakpoint: the boundary between a visible and a
 * hidden probe width is their midpoint, floored. Contiguous hidden widths merge
 * into one band.
 *
 * TASK 28.6 R1 — THE OFF-BY-ONE THIS REPLACES. The previous revision opened a
 * band at `entry.width` itself whenever the hidden run started at the LOWEST
 * desktop probe width:
 *
 *     start = previous ? midpoint(previous.width, entry.width) : entry.width;
 *
 * There is no `previous` there because there is no lower VISIBLE neighbour — the
 * observation says nothing was measured below that width, not that the node was
 * visible below it. Treating the sample as its own lower boundary made the band
 * run UPWARD from the observation. On the 28.5B Linear corpus every one of the
 * 738 candidates had the same shape — hidden at 1024, visible at 1440/1920 — so
 * every one shipped as `(min-width: 1024px) and (max-width: 1231.98px)` and left
 * the node VISIBLE across [breakpoint, 1024), the very range the probe had
 * measured it hidden in. Rendering the built app confirmed the edge: 21 nodes
 * hidden at 1023 against 524 at 1024.
 *
 * The fix is that an absent neighbour yields an ABSENT edge — the band is open
 * in that direction — which is also exactly right for the desktop subtree,
 * because `globals.css` already hides the whole variant below the generated
 * breakpoint.
 *
 * FUTURE SNAPPING. Edges stay numbers here on purpose. When the SiteSpec carries
 * the breakpoints the source site actually authored, snapping is a pure map over
 * `{minWidth, maxWidth}` applied between this function and {@link bandMedia};
 * `hiddenSamples` is retained so a snap can be REJECTED when it would move an
 * edge across an observed sample.
 */
export function hiddenBands(
  variantIdx: readonly { width: number; i: number }[],
  hiddenEntries: readonly { width: number; i: number }[],
): HiddenBand[] {
  const hidden = new Set(hiddenEntries.map((entry) => entry.width));
  const sorted = [...variantIdx].sort((a, b) => a.width - b.width);
  const bands: HiddenBand[] = [];
  let start: number | undefined;
  let samples: number[] = [];
  let open = false;
  let lowerBracket: readonly [number, number] | undefined;
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!;
    const isHidden = hidden.has(entry.width);
    if (isHidden && !open) {
      open = true;
      samples = [];
      const previous = sorted[i - 1];
      // No lower VISIBLE neighbour ⇒ no measured lower boundary ⇒ open band.
      start = previous
        ? Math.floor((previous.width + entry.width) / 2)
        : undefined;
      // Task 28.6 D1 — and the interval that midpoint is a guess INSIDE: the
      // node was seen visible at `previous` and hidden at `entry`.
      lowerBracket = previous ? [previous.width, entry.width] : undefined;
    }
    if (isHidden) samples.push(entry.width);
    if (!isHidden && open) {
      const lastHidden = sorted[i - 1]!.width;
      const boundary = Math.floor((lastHidden + entry.width) / 2);
      bands.push({
        ...(start !== undefined ? { minWidth: start } : {}),
        maxWidth: boundary,
        hiddenSamples: [...samples],
        verifyWidth: samples[0]!,
        ...(lowerBracket !== undefined ? { lowerBracket } : {}),
        upperBracket: [lastHidden, entry.width] as const,
      });
      open = false;
      start = undefined;
      lowerBracket = undefined;
    }
  }
  if (open) {
    bands.push({
      ...(start !== undefined ? { minWidth: start } : {}),
      hiddenSamples: [...samples],
      verifyWidth: samples[0]!,
      ...(lowerBracket !== undefined ? { lowerBracket } : {}),
    });
  }
  return bands;
}

// ---------------------------------------------------------------------------
// Task 28.6 D1 — snapping band edges onto the breakpoints the SOURCE authored
// ---------------------------------------------------------------------------

/**
 * Where a band edge's number came from. Four values, because "did not snap" has
 * three different causes and an artifact that cannot tell them apart cannot tell
 * a thin observation from a site that authored nothing here.
 */
export type BandEdgeSource =
  /** Moved onto a breakpoint the source authored, inside the probe gap. */
  | "authored-breakpoint"
  /** A histogram was read; it named no breakpoint inside THIS gap. */
  | "probe-midpoint-no-authored-in-gap"
  /** A histogram was read and it carried zero entries. */
  | "probe-midpoint-empty-histogram"
  /** No histogram for this viewport at all: nothing to snap to. */
  | "probe-midpoint-no-histogram";

/** One band edge's provenance, carried on the band the truth check verifies. */
export interface BandEdgeDecision {
  /** Which edge of the band this is. */
  edge: "lower" | "upper";
  /** The value that SHIPS. */
  px: number;
  /** The probe midpoint alone — what shipped before D1. Equal to `px` when nothing snapped. */
  midpointPx: number;
  source: BandEdgeSource;
  /** The two OBSERVED probe widths bracketing the edge, ascending. */
  bracket: readonly [number, number];
  /** Distinct authored edge values inside the gap. 0 when there were none or no data. */
  candidateCount: number;
  /** Matched declarations naming the CHOSEN edge. 0 when nothing snapped. */
  chosenWeight: number;
  /** `candidateCount > 1`: the source named more than one edge in this gap. */
  ambiguous: boolean;
}

/**
 * The whole-pixel band edge one authored breakpoint names.
 *
 * A band edge — either edge — is "the first width at which the state on its
 * RIGHT holds": `minWidth` is the first width the band applies at, `maxWidth`
 * the first width it stops applying at. That is exactly the `above` half of the
 * `{below, above}` boundary the media-condition parser produces, and it is why
 * `(max-width: 1024px)` and `(min-width: 1025px)` — one authored change spelled
 * from either side — both resolve to 1025 here instead of to two rival numbers
 * one pixel apart.
 *
 * The SiteSpec histogram stores that boundary collapsed to a single `px` plus
 * the side it names ({@link AuthoredBreakpointEntry}), so `above` is recovered
 * as `px` for a `min` bound and `px + 1` for a `max` one.
 */
export function authoredEdgePx(entry: AuthoredBreakpointEntry): number {
  return entry.kind === "min" ? entry.px : entry.px + 1;
}

/**
 * The authored edges that lie inside the interval of uncertainty `(lower, upper]`,
 * merged by value and weighted by matched declarations.
 *
 * REQUIREMENT (a) — NEVER SNAP PAST A SAMPLE YOU MEASURED. `lower` and `upper`
 * are two adjacent probe widths at which the node's visibility was actually
 * observed, and they disagree; the transition is therefore at some width `e`
 * with `lower < e <= upper`, and every width outside that is contradicted by an
 * observation. A candidate outside the interval is dropped here rather than
 * weighed and rejected later, so no code path downstream can reintroduce it.
 *
 * Merging by value is the point of the boundary form: two spellings of one
 * authored change contribute one candidate carrying both their weights, and
 * only a genuinely different edge raises the candidate count.
 */
export function authoredEdgeCandidates(
  entries: readonly AuthoredBreakpointEntry[],
  lower: number,
  upper: number,
): { px: number; weight: number }[] {
  const byPx = new Map<number, number>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.px)) continue;
    const px = authoredEdgePx(entry);
    if (!(px > lower && px <= upper)) continue;
    byPx.set(
      px,
      (byPx.get(px) ?? 0) + (Number.isFinite(entry.count) ? entry.count : 0),
    );
  }
  return [...byPx.entries()]
    .map(([px, weight]) => ({ px, weight }))
    .sort((a, b) => a.px - b.px);
}

/**
 * REQUIREMENT (b) — WHICH AUTHORED EDGE, AND WHY.
 *
 * When a gap holds several authored breakpoints the pick is, in order:
 *
 *  1. the HEAVIEST — the edge the largest number of matched layout declarations
 *     named. Weight is the only evidence in the histogram about which change is
 *     the layout's and which is a detail;
 *  2. then the one NEAREST the probe midpoint. This is a tie-break and nothing
 *     more: the midpoint is a guess, so it may order equals but must never
 *     outrank weight;
 *  3. then the SMALLEST px, so the result is a function of the input and not of
 *     map iteration order.
 *
 * Every such pick is counted in `bandEdgesSnappedAmbiguous`, because rule 1
 * chooses between real alternatives and a caller is entitled to know how often
 * that happened.
 */
export function chooseAuthoredEdge(
  candidates: readonly { px: number; weight: number }[],
  midpointPx: number,
): { px: number; weight: number } | undefined {
  let best: { px: number; weight: number } | undefined;
  for (const candidate of candidates) {
    if (best === undefined) {
      best = candidate;
      continue;
    }
    if (candidate.weight !== best.weight) {
      if (candidate.weight > best.weight) best = candidate;
      continue;
    }
    const dCandidate = Math.abs(candidate.px - midpointPx);
    const dBest = Math.abs(best.px - midpointPx);
    if (dCandidate !== dBest) {
      if (dCandidate < dBest) best = candidate;
      continue;
    }
    if (candidate.px < best.px) best = candidate;
  }
  return best;
}

/** What {@link snapBandEdges} adds up over one page's bands. */
export interface BandSnapAccounting {
  edgesOpen: number;
  edgesConsidered: number;
  snapped: number;
  snappedAmbiguous: number;
  keptMidpointNoAuthoredInGap: number;
  keptMidpointEmptyHistogram: number;
  keptMidpointNoHistogram: number;
  shiftPx: number;
}

/** A zeroed {@link BandSnapAccounting}. */
export function emptyBandSnapAccounting(): BandSnapAccounting {
  return {
    edgesOpen: 0,
    edgesConsidered: 0,
    snapped: 0,
    snappedAmbiguous: 0,
    keptMidpointNoAuthoredInGap: 0,
    keptMidpointEmptyHistogram: 0,
    keptMidpointNoHistogram: 0,
    shiftPx: 0,
  };
}

/**
 * TASK 28.6 D1 — MOVE EACH BAND EDGE ONTO THE BREAKPOINT THE SOURCE AUTHORED.
 *
 * THE DEFECT. `hiddenBands()` puts an edge at the floored MIDPOINT of the two
 * probe samples that disagree. That number is arithmetic on the probe's own
 * sampling grid and has nothing to do with the site: on the Linear corpus the
 * comparison-table rows shipped `(max-width: 1231.98px)` because
 * `floor((1024 + 1440) / 2) = 1232`, while the source authors its table
 * unconditionally and only switches to the stacked layout under
 * `(max-width: 1024px)`. Between 1025 and 1231 the source SHOWS those rows and
 * the clone hides them — a whole band of a page wrong, from a number no one
 * wrote.
 *
 * THE FIX, AND ITS FIVE RULES.
 *
 *  (a) An edge only moves INSIDE the interval of uncertainty between the two
 *      probe samples that produced it — `(lower, upper]`, enforced in
 *      {@link authoredEdgeCandidates}. Moving past a sample would contradict an
 *      observation, which is strictly worse than guessing between two.
 *  (b) Several authored breakpoints in one gap is a real ambiguity: the pick is
 *      {@link chooseAuthoredEdge}'s, and every such pick is counted.
 *  (c) No authored breakpoint in the gap keeps the midpoint, counted separately
 *      from (d) so a guessed edge never reads as a snapped one.
 *  (d) The histogram is OPTIONAL and every pre-28.6 SiteSpec lacks it. Absent
 *      data keeps the midpoint too, and is counted apart again — "we had nothing
 *      to snap to" and "we looked and the source said nothing here" are
 *      different facts about the site.
 *  (e) A snapped band is NOT exempted from anything. It keeps its
 *      `hiddenSamples` and its `verifyWidth`, so the post-emit in-band render
 *      and the truth-width baseline measure it exactly as before, and the
 *      band/observation agreement scan in {@link inferLayoutRules} runs on the
 *      SNAPPED band. That scan is also the one place `bandSampleMismatches`
 *      gains real force: an edge from the stylesheet is an INDEPENDENT number,
 *      so a mismatch there is no longer the builder failing to contradict
 *      itself.
 *
 * Pure: no I/O, no clock, no mutation of the input bands.
 */
export function snapBandEdges(
  bands: readonly HiddenBand[],
  histogram: AuthoredBreakpoints | undefined,
): { bands: HiddenBand[]; accounting: BandSnapAccounting } {
  const accounting = emptyBandSnapAccounting();
  const entries = histogram?.entries;
  const noHistogram = entries === undefined;
  const emptyHistogram = entries !== undefined && entries.length === 0;

  const snapped: HiddenBand[] = bands.map((band) => {
    const decisions: BandEdgeDecision[] = [];
    const resolve = (
      edge: "lower" | "upper",
      midpointPx: number,
      bracket: readonly [number, number],
    ): number => {
      accounting.edgesConsidered++;
      const [low, high] =
        bracket[0] <= bracket[1] ? bracket : [bracket[1], bracket[0]];
      const candidates = noHistogram
        ? []
        : authoredEdgeCandidates(entries, low, high);
      const chosen = chooseAuthoredEdge(candidates, midpointPx);
      if (chosen === undefined) {
        const source: BandEdgeSource = noHistogram
          ? "probe-midpoint-no-histogram"
          : emptyHistogram
            ? "probe-midpoint-empty-histogram"
            : "probe-midpoint-no-authored-in-gap";
        if (source === "probe-midpoint-no-histogram")
          accounting.keptMidpointNoHistogram++;
        else if (source === "probe-midpoint-empty-histogram") {
          accounting.keptMidpointEmptyHistogram++;
        } else accounting.keptMidpointNoAuthoredInGap++;
        decisions.push({
          edge,
          px: midpointPx,
          midpointPx,
          source,
          bracket: [low, high],
          candidateCount: candidates.length,
          chosenWeight: 0,
          ambiguous: false,
        });
        return midpointPx;
      }
      accounting.snapped++;
      accounting.shiftPx += Math.abs(chosen.px - midpointPx);
      const ambiguous = candidates.length > 1;
      if (ambiguous) accounting.snappedAmbiguous++;
      decisions.push({
        edge,
        px: chosen.px,
        midpointPx,
        source: "authored-breakpoint",
        bracket: [low, high],
        candidateCount: candidates.length,
        chosenWeight: chosen.weight,
        ambiguous,
      });
      return chosen.px;
    };

    let minWidth = band.minWidth;
    if (band.minWidth !== undefined && band.lowerBracket !== undefined) {
      minWidth = resolve("lower", band.minWidth, band.lowerBracket);
    } else if (band.minWidth === undefined) {
      accounting.edgesOpen++;
    }
    let maxWidth = band.maxWidth;
    if (band.maxWidth !== undefined && band.upperBracket !== undefined) {
      maxWidth = resolve("upper", band.maxWidth, band.upperBracket);
    } else if (band.maxWidth === undefined) {
      accounting.edgesOpen++;
    }

    return {
      ...band,
      ...(minWidth !== undefined ? { minWidth } : {}),
      ...(maxWidth !== undefined ? { maxWidth } : {}),
      hiddenSamples: [...band.hiddenSamples],
      edgeDecisions: decisions,
    };
  });

  return { bands: snapped, accounting };
}

/** Where a page's authored-breakpoint histogram came from. */
export type AuthoredBreakpointProvenance =
  /** The SiteSpec carried `authoredBreakpoints` (schemaVersion ≥ 5). */
  | "spec-field"
  /**
   * A pre-v5 SiteSpec whose NODES still carry `authoredLayout`. The histogram is
   * folded here through the very function the compiler uses, so a derived
   * histogram and a compiled one are the same object for the same input — this
   * reads an older artifact, it does not define a second breakpoint model.
   */
  | "derived-from-nodes"
  /** Neither: no histogram, and therefore nothing any edge can snap to. */
  | "unavailable";

/**
 * The breakpoint histogram for one viewport, with WHERE IT CAME FROM.
 *
 * Requirement (d) in one function. `authoredBreakpoints` is optional and every
 * pre-28.6 SiteSpec lacks it, so an absent field is not evidence that the source
 * authored nothing — on a v4 spec the same facts are still on the nodes, one
 * fold away. Falling back to that fold is the difference between measuring this
 * mechanism on the existing corpus and reporting zeroes about it; reporting the
 * provenance is what keeps the two apart in the artifact.
 */
export function resolveAuthoredBreakpoints(viewport: ViewportPageSpec): {
  histogram?: AuthoredBreakpoints;
  provenance: AuthoredBreakpointProvenance;
} {
  if (viewport.authoredBreakpoints !== undefined) {
    return {
      histogram: viewport.authoredBreakpoints,
      provenance: "spec-field",
    };
  }
  // Element nodes only — exactly the set `compileViewport()` folds, so a derived
  // histogram is byte-identical to the one a v5 spec would have carried.
  const derived = computeAuthoredBreakpoints(
    viewport.nodes.filter(
      (node): node is ElementSpecNode => node.type === "element",
    ),
  );
  if (derived === undefined) return { provenance: "unavailable" };
  return { histogram: derived, provenance: "derived-from-nodes" };
}

/** Does this band match the given viewport width? */
export function bandContains(band: HiddenBand, width: number): boolean {
  if (band.minWidth !== undefined && width < band.minWidth) return false;
  if (band.maxWidth !== undefined && width >= band.maxWidth) return false;
  return true;
}

/**
 * The `@media` condition for a band.
 *
 * The upper edge is written 0.02px below the boundary for the reason
 * `breakpointMediaQueries()` gives: viewport widths are fractional on
 * fractional-DPR displays, and a whole-pixel gap would leave a width matched by
 * neither the band nor its neighbour.
 */
export function bandMedia(band: HiddenBand): string {
  const parts: string[] = [];
  if (band.minWidth !== undefined)
    parts.push(`(min-width: ${band.minWidth}px)`);
  if (band.maxWidth !== undefined)
    parts.push(`(max-width: ${band.maxWidth - 0.02}px)`);
  if (parts.length === 0) {
    // Both edges open means every desktop probe width was observed hidden, which
    // the caller forbids (the truth width must be visible). Emit a condition
    // that is true rather than an empty one, so the CSS stays well-formed.
    return "(min-width: 0px)";
  }
  return parts.join(" and ");
}

/** One rule per recovered node, at (0,3,0) so it outranks the exact class. */
export function generateLayoutCss(
  rules: readonly RecoveredLayoutRule[],
): string {
  if (rules.length === 0) return "";
  const lines: string[] = [
    "/* Recovered layout rules (Task 17 §9/§10). Do not edit. */",
  ];
  const sorted = [...rules].sort((a, b) => {
    const aViewport = a.viewportId ?? "desktop";
    const bViewport = b.viewportId ?? "desktop";
    if (a.pageId !== b.pageId) return a.pageId.localeCompare(b.pageId);
    if (aViewport !== bViewport) return aViewport.localeCompare(bViewport);
    if (a.nodeId !== b.nodeId) return a.nodeId.localeCompare(b.nodeId);
    return a.kind.localeCompare(b.kind);
  });
  for (const rule of sorted) {
    // Task 28.6 C2b — the rule's OWN variant wrapper. Absent means the rule was
    // built before the field existed, when every rule was a desktop rule.
    const selector =
      `[data-wr-page="${rule.pageId}"][data-wr-viewport="${rule.viewportId ?? "desktop"}"] ` +
      `[data-wr-node="${rule.nodeId}"]`;
    const declarations = Object.entries(rule.declarations)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([property, value]) => `  ${property}: ${value};`)
      .join("\n");
    const body = `${selector} {\n${declarations}\n}`;
    lines.push(
      rule.media !== undefined ? `@media ${rule.media} {\n${body}\n}` : body,
    );
  }
  return lines.join("\n");
}
