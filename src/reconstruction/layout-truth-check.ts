import { REACT_PROP_NAMES, VOID_ELEMENTS } from "./react-attributes.js";
import {
  FULL_WIDTH_TOLERANCE_PX,
  RESIDUAL_AUDIT_MAX_WIDTHS,
  RESIDUAL_CLONE_CONSTANT_PX,
  RESIDUAL_FROZEN_REPORTED,
  RESIDUAL_SOURCE_CHANGE_MIN_PX,
  TRUTH_SANITY_TOLERANCE_PX,
  bandContains,
  generateLayoutCss,
  type HiddenBand,
  type IntervalSample,
  type LayoutViewportId,
  type OwnedPlanOffer,
  type RecoveredLayoutRule,
  type RecoveredRuleKind,
  type ResidualAuditNode,
  type ResidualAuditPass,
} from "./layout-inference.js";
import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "./types.js";

/**
 * Post-emit browser truth check for recovered layout rules (Task 28.5B).
 *
 * `layout-inference.ts` used to claim its rules "cannot regress the truth
 * viewport by construction". The 28.5A audit measured the opposite — 349 of
 * 1,910 recovered-rule nodes rendering FARTHER from their observed box with the
 * rules than without, 0 closer — because nothing in the generator had ever
 * rendered an emitted rule. This module is the missing render.
 *
 * The mechanism is deliberately small and deliberately not a layout engine:
 *
 *   1. Serialize the reconstruction's OWN emitted desktop tree (the same
 *      `RuntimeNode` IR `NodeRenderer.tsx` renders) into static HTML, inside the
 *      same `data-wr-page` / `data-wr-viewport="desktop"` wrapper
 *      `PageRenderer.tsx` produces, so the (0,3,0) recovered selectors match
 *      exactly as they will in the app.
 *   2. Load it in Chromium at the truth viewport with the app's real generated
 *      stylesheet — globals, exact computed classes, pseudo tier, observed-target
 *      tier — plus one empty `<style id="wr-layout-candidates">`.
 *   3. Measure every candidate rule's node with the candidate tier EMPTY. That
 *      is the BASELINE: what the exact computed fallback alone renders.
 *   4. Swap the candidate tier's text and re-measure. No navigation, no
 *      re-parse: one reflow per round, which is what makes several rounds cheap.
 *   5. A candidate is REJECTED when its node lands farther than
 *      {@link TRUTH_SANITY_TOLERANCE_PX} from the observed truth rect AND
 *      farther than the baseline did. Both halves matter: the first says the
 *      rule is wrong, the second says the rule — not the reconstruction's own
 *      unavoidable drift (absent images, substituted fonts) — is what made it
 *      wrong. Anything the baseline already got wrong by the same amount is not
 *      this module's regression to claim.
 *   6. Rejecting changes the layout, so survivors are re-measured, up to
 *      {@link MAX_ROUNDS}. If the set has still not settled, every remaining
 *      truth-checkable candidate is dropped — prefer rejection over clever math.
 *
 * Everything here is offline and deterministic: all network is aborted at the
 * route level, so an absent image is absent identically in every round.
 *
 * TASK 28.6 R3 — THE EXEMPTION THIS REMOVES. An earlier revision exempted every
 * `responsive-hidden` rule carrying an `@media` band from being checked at all,
 * and called that a proof rather than an exemption: the band cannot apply at the
 * truth viewport, so rendering at 1440 would measure nothing. The first half is
 * true; the conclusion does not follow. "This rule cannot be seen from 1440" is
 * a reason to render somewhere ELSE, not a reason to ship unverified. The
 * exemption is precisely what let 28.6 R1's inverted band — 503 nodes on one
 * route, hidden across a range the probe had measured them VISIBLE in — ship
 * through a green truth check.
 *
 * So a banded rule is now verified INSIDE its own active range, in two
 * measurements:
 *
 *   * at `band.verifyWidth` — one of the probe widths the band was built from,
 *     so the expected visibility there is observed rather than interpolated —
 *     the node's OWN computed `display` must be `none` with the rule applied. A
 *     band that does not actually hide what it claims to hide is rejected.
 *   * at the truth width, in the render that is happening anyway, the node's own
 *     computed `display` must NOT be `none`. A band that reaches 1440
 *     contradicts the observation it was built from (the truth width is always
 *     on the visible side) and is rejected.
 *
 * TASK 28.6 V6(b) — WHAT THIS PAIR DOES *NOT* CATCH. An earlier revision of this
 * docstring called the truth-width measurement "the R1-class detector". It is
 * not: under R1's inverted band the node is VISIBLE at 1440 and HIDDEN at
 * `verifyWidth` 1024, so both measurements above pass and the rule ships. The
 * two tests pin the band's ACTIVE side and its INACTIVE side at the two widths
 * they can see; they cannot see the edge in between, which is where R1 lived.
 * Only the band-EDGE assertions catch that — `smoke-layout-safety` Part 6a/6b,
 * which render the produced band at the widths either side of both its edges.
 *
 * TASK 28.6 V1 — WHY "OWN COMPUTED DISPLAY" AND NOT "IN LAYOUT". The first R3
 * revision asked `element.getClientRects().length > 0`, which is a question
 * about the whole ancestor chain: an ancestor's `display: none` answers it for
 * every descendant, so a descendant's own band was never discriminated.
 * Measured on the 28.5B Linear corpus, 505 of 738 shipped banded rules (68.4%)
 * were satisfied that way and only 233 stood on their own; a fixture rule
 * carrying `@media (min-width: 99999px)`, which cannot match at its verify
 * width, shipped with `rejectedByBandCheck` 0 whenever a correct band on its
 * ancestor hid the subtree.
 *
 * `getComputedStyle(el).display` is resolved from the element's OWN cascade and
 * is unaffected by an ancestor being `display: none` (measured in the same
 * Chromium this module launches: an ancestor at `display: none` still reports a
 * child's `display` as `block`). So every banded rule is now discriminated by
 * its own `@media` condition, at no extra render, and the two populations are
 * reported separately —
 * {@link TruthCheckCounters.bandHiddenByAncestorAtBandWidth} counts the rules an
 * ancestor would have answered for, and
 * {@link TruthCheckCounters.bandExactTierHidesAtBandWidth} the ones the exact
 * computed class was already hiding.
 *
 * Presence — `element.getClientRects().length > 0` — is still measured, because
 * it is the right question for the two BASELINE facts: whether an ancestor is
 * doing the hiding at the band width, and whether the node was in layout at the
 * truth width at all (V4).
 *
 * Everything else — `centered-max-width`, `full-width`, `percentage-width` —
 * changes geometry AT the truth viewport, and the invariant is that such a rule
 * NEVER ships unverified. So every path on which the check cannot judge one
 * REJECTS it (`rejectedUnverifiable`) instead of letting it through:
 *
 *   * the rule carries no observed rect, or names a page this generation is not
 *     writing              → `status: "unverifiable-candidates"` if that is all
 *                             of them, otherwise dropped inside a `verified` run
 *   * playwright missing / chromium fails to launch → `chromium-unavailable`
 *   * the node is absent from the render, or the candidate makes it unmeasurable
 *   * the page's candidate set never settles inside {@link MAX_ROUNDS}
 *   * the page throws while rendering
 *
 * A banded rule is held to the same standard: no band, or no such page, and it
 * is rejected rather than shipped.
 *
 * The single exception is `status: "disabled"`, the caller's explicit "do not
 * check": it ships the candidates and records that no verification happened, so
 * the artifact still cannot be mistaken for a verified one. It is the only
 * status under which `acceptedUnchecked` is not 0.
 */

/** Candidate re-render rounds after the baseline. Bounded on purpose. */
export const MAX_ROUNDS = 4;

/** Subpixel noise floor for the "worse than baseline" comparison. */
export const REGRESSION_EPSILON_PX = 0.5;

/**
 * RECI2 root-cause fix (a) — a verification page load is retried before its
 * rules are declared unverifiable. On a loaded machine a single 30s
 * `setContent` timeout at ONE sample width used to drop every sampled rule of
 * the pass (apartmentary p000001/desktop: 312 rules, root `width:auto` lost).
 * A load that fails every attempt still rejects, exactly as before.
 */
export const RENDER_LOAD_ATTEMPTS = 3;
export const RENDER_RETRY_TIMEOUT_MS = 120_000;

export async function setContentWithRetry(
  page: import("playwright").Page,
  html: string,
  onRetry?: (attempt: number, err: unknown) => void,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.setContent(html, {
        waitUntil: "load",
        ...(attempt > 1 ? { timeout: RENDER_RETRY_TIMEOUT_MS } : {}),
      });
      return;
    } catch (err) {
      if (attempt >= RENDER_LOAD_ATTEMPTS) throw err;
      onRetry?.(attempt, err);
    }
  }
}

/**
 * RECI2 root-cause fix (a) — phase-A interval-sample rejection is ISOLATED.
 * A sweep's regressors are bisected (the stage minus every other regressor) so
 * no rule is rejected for another rule's error; the sweeps that isolate are
 * bounded, after which the stage falls back to the old joint rejection for up
 * to {@link MAX_ROUNDS} further sweeps. Isolation renders per pass are capped.
 */
export const INTERVAL_ISOLATED_SWEEPS = 8;
export const INTERVAL_ISOLATION_RENDER_BUDGET = 400;

// ---------------------------------------------------------------------------
// P0 contract C2.1 — per-width source truth: interval-sample verification
// ---------------------------------------------------------------------------

/**
 * WHY 1440 ALONE IS NOT ACCEPTANCE. Every geometry rule used to be measured at
 * exactly one width — its pass's truth width — where the exact computed tier is
 * already right by construction. A rule that reproduces the source at 1440 and
 * is 200px wrong at 1024 shipped green. A rule that carries
 * {@link RecoveredLayoutRule.samples} (the source probe box at every probe width
 * inside its served interval) is now ALSO rendered at EVERY one of those probe
 * widths — the positional picks of {@link selectIntervalSamples} plus
 * `allProbeWidthsInInterval`, bounded at 16 per pass by
 * {@link capIntervalSampleWidths} (contract C2.1 as amended: the positional
 * picks alone skipped exactly the widths, 1024/1100, where the audit measured
 * failures) — and rejected with
 * `interval-sample-regressed` when, at ANY of them,
 * `errWith > max(4px, 0.5%·W) AND errWith > errWithout + 0.5px`.
 *
 * COORDINATE FRAME. The probe reads `getBoundingClientRect().x` with the page
 * scrolled to 0 horizontally (`layout-probe.ts` resets scroll before the width
 * loop and only ever scrolls vertically, which does not move `x`); this harness
 * reads the same property on a document that is never scrolled. Both are
 * viewport-relative border-box x in the same engine, so no normalization is
 * applied.
 *
 * `errWithout` is the same width rendered with the recovered tier EMPTY (the
 * frozen exact tier alone) — the identical baseline the truth-width rounds use —
 * so a rule is never rejected for being no worse than what shipping nothing
 * would render.
 *
 * Rules WITHOUT samples (hand-built fixtures, and any rule whose node carries no
 * multi-width probe) never enter this stage. This is NOT an old-artifact gate:
 * samples are built by `attachIntervalSamples()` from `node.probe`, which
 * SiteSpecs have carried since long before P0, so pre-P0 artifacts DO enter this
 * stage (more renders; rules wrong at an interval sample are rejected). That
 * behaviour change for old artifacts is deliberate and user-approved (P0 spec).
 */
export const INTERVAL_SAMPLE_MIN_TOLERANCE_PX = 4;
/** …the relative half of `max(4px, 0.5%·W)`. */
export const INTERVAL_SAMPLE_RELATIVE_TOLERANCE = 0.005;
/** The midpoint position is taken over `[lo, min(hi, cap)]`, so an open interval has a finite middle. */
export const INTERVAL_SAMPLE_MID_CAP_PX = 1920;

export type IntervalSamplePosition = "lo" | "lo+1" | "mid" | "hi-1" | "truth";

export interface IntervalSampleSelection {
  interval: { min: number; max: number };
  /** Distinct POSITIONAL picks, ascending. Every one is a real probe width inside the interval. */
  widths: number[];
  /**
   * P0 contract C2.1 (amended) — EVERY distinct probe width inside the
   * interval, ascending. Verification uses the union of this and
   * {@link widths} (this is a superset), bounded per pass by
   * {@link capIntervalSampleWidths}.
   */
  allProbeWidthsInInterval: number[];
  /** Every position the contract asks for, with the target px it is nearest to. */
  requestedPositions: { position: IntervalSamplePosition; target: number }[];
  /** …the ones a probe width inside the interval answered, and which width. */
  probedPositions: {
    position: IntervalSamplePosition;
    target: number;
    width: number;
    distancePx: number;
  }[];
  /** …and the ones no probe width answered. Reported, never fabricated. */
  unprobed: { position: IntervalSamplePosition; target: number }[];
}

/**
 * P0 contract C2.1 — which probe widths verify a rule served on `[min, max)`.
 * Pure and deterministic.
 *
 * Positions: nearest-to-lo, nearest-to-lo+1, nearest-to-midpoint of
 * `[lo, min(hi, 1920)]`, nearest-to-hi-1 (for an open interval: the widest
 * probe inside it), and the truth width when it lies inside the interval (exact
 * match only — the truth width is a probe width in every inference pass). Ties
 * go to the narrower width. Duplicates collapse, so "lo+1" adds a width only
 * when it is distinct. A position with no probe width inside the interval is
 * `unprobed`.
 */
export function selectIntervalSamples(
  probeWidths: readonly number[],
  interval: { min: number; max: number },
  truthWidth?: number,
): IntervalSampleSelection {
  const lo = interval.min;
  const hi = interval.max;
  const inside = [...new Set(probeWidths)]
    .filter((width) => width >= lo && width < hi)
    .sort((a, b) => a - b);
  const midUpper = Math.min(hi, INTERVAL_SAMPLE_MID_CAP_PX);
  const requestedPositions: IntervalSampleSelection["requestedPositions"] = [
    { position: "lo", target: lo },
    { position: "lo+1", target: lo + 1 },
    { position: "mid", target: (lo + Math.max(lo, midUpper)) / 2 },
    { position: "hi-1", target: hi - 1 },
  ];
  if (truthWidth !== undefined && truthWidth >= lo && truthWidth < hi) {
    requestedPositions.push({ position: "truth", target: truthWidth });
  }
  const probedPositions: IntervalSampleSelection["probedPositions"] = [];
  const unprobed: IntervalSampleSelection["unprobed"] = [];
  for (const request of requestedPositions) {
    let best: number | undefined;
    if (request.position === "truth") {
      best = inside.includes(request.target) ? request.target : undefined;
    } else {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const width of inside) {
        // `hi - 1` of an open interval is Infinity: every distance is Infinity,
        // so compare on the width itself — the widest probe is the nearest.
        const distance = Number.isFinite(request.target)
          ? Math.abs(width - request.target)
          : -width;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = width;
        }
      }
    }
    if (best === undefined) {
      unprobed.push({ position: request.position, target: request.target });
    } else {
      probedPositions.push({
        position: request.position,
        target: request.target,
        width: best,
        distancePx: Number.isFinite(request.target)
          ? Math.round(Math.abs(best - request.target) * 100) / 100
          : 0,
      });
    }
  }
  const widths = [...new Set(probedPositions.map((entry) => entry.width))].sort(
    (a, b) => a - b,
  );
  return {
    interval: { min: lo, max: hi },
    widths,
    allProbeWidthsInInterval: inside,
    requestedPositions,
    probedPositions,
    unprobed,
  };
}

/** P0 contract C2.1 (amended) — at most this many sample widths per page × viewport pass. */
export const INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS = 16;

/**
 * P0 contract C2.1 (amended) — bound one pass's verification widths. Pure.
 *
 * Positional picks first (if they alone exceed the cap, they are themselves
 * chosen by the rule below), then the remaining widths by LARGEST GAP: each
 * step adds the candidate farthest from every width already chosen (ties to the
 * narrower width), so the cut spreads over the range rather than clustering.
 * `capped` counts what the cap dropped; it is never silent.
 */
export function capIntervalSampleWidths(
  positional: readonly number[],
  all: readonly number[],
  cap: number = INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS,
): { widths: number[]; capped: number } {
  const positionalSet = [...new Set(positional)].sort((a, b) => a - b);
  const universe = [...new Set([...positionalSet, ...all])].sort((a, b) => a - b);
  if (universe.length <= cap) return { widths: universe, capped: 0 };
  const chosen: number[] = [];
  const addByGap = (pool: readonly number[]): void => {
    const remaining = pool.filter((width) => !chosen.includes(width));
    while (chosen.length < cap && remaining.length > 0) {
      let bestIndex = 0;
      let bestGap = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < remaining.length; i++) {
        const width = remaining[i]!;
        const gap =
          chosen.length === 0
            ? -width // nothing chosen yet: start from the narrowest
            : Math.min(...chosen.map((picked) => Math.abs(picked - width)));
        if (gap > bestGap) {
          bestGap = gap;
          bestIndex = i;
        }
      }
      chosen.push(remaining.splice(bestIndex, 1)[0]!);
    }
  };
  addByGap(positionalSet);
  addByGap(universe);
  const widths = chosen.sort((a, b) => a - b);
  return { widths, capped: universe.length - widths.length };
}

/** `max(4px, 0.5%·W)`. */
export function intervalSampleTolerancePx(width: number): number {
  return Math.max(INTERVAL_SAMPLE_MIN_TOLERANCE_PX, INTERVAL_SAMPLE_RELATIVE_TOLERANCE * width);
}

/** One rendered box as the interval stage measures it. */
export interface RenderedSampleBox {
  x: number;
  w: number;
  /** In layout (`getClientRects().length > 0`). */
  l: boolean;
}

/**
 * `max(|Δx|, |Δw|)` against one source sample, or `undefined` when the sample
 * says nothing (source not visible there). A box the source rendered and the
 * clone did not (absent, or out of layout) is `+∞`.
 */
export function intervalSampleError(
  expected: Pick<IntervalSample, "x" | "w" | "v">,
  rendered: RenderedSampleBox | null | undefined,
): number | undefined {
  if (expected.v !== 1) return undefined;
  if (rendered == null || !rendered.l) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(rendered.x - expected.x), Math.abs(rendered.w - expected.w));
}

/** The C2.1 reject predicate. */
export function intervalSampleRegressed(
  errWith: number,
  errWithout: number,
  width: number,
): boolean {
  return (
    errWith > intervalSampleTolerancePx(width) &&
    errWith > errWithout + REGRESSION_EPSILON_PX
  );
}

/** Does this rule carry the C2.1 evidence the interval stage needs? */
export function hasIntervalSampleEvidence(rule: RecoveredLayoutRule): boolean {
  return (
    rule.kind !== "responsive-hidden" &&
    rule.servedInterval !== undefined &&
    rule.samples !== undefined &&
    rule.samples.length > 0
  );
}

/** A geometry rule the interval stage rejected. */
export interface IntervalSampleRejection {
  pageId: string;
  viewportId: LayoutViewportId;
  nodeId: string;
  /** Set when the regressing box was a witness rather than the rule's own node. */
  witnessNodeId?: string;
  kind: RecoveredRuleKind;
  reason: "interval-sample-regressed";
  /** The probe width the regression was measured at. */
  width: number;
  /** Which selection positions that width answered. */
  positions: IntervalSamplePosition[];
  expected: { x: number; w: number };
  rendered: RenderedSampleBox | null;
  baseline: RenderedSampleBox | null;
  /** `Infinity` when the clone was out of layout where the source was visible. */
  errWith: number;
  errWithout: number;
  tolerancePx: number;
}

export type TruthCheckStatus =
  /** The browser ran and every shipped rule was measured. */
  | "verified"
  /** Inference proposed nothing at all. */
  | "no-candidates"
  /**
   * Every candidate carried an `@media` band, so there was no truth-viewport
   * geometry to render — but the bands themselves WERE rendered and measured
   * inside their own active ranges (Task 28.6 R3).
   *
   * TASK 28.6 V1 — WHAT "MEASURED" MEANS HERE, AND WHAT IT USED TO MEAN. The
   * first R3 revision asked the in-band render "is this node out of layout at
   * the band width", with the whole shipped stylesheet applied. That question is
   * answered by ANY ancestor's `display: none`, so a rule could ship without
   * ever being discriminated: measured on the 28.5B Linear corpus, 505 of 738
   * shipped banded rules (68.4%) were satisfied by an ancestor, and a fixture
   * carrying `@media (min-width: 99999px)` — a condition that cannot match at
   * its own verify width — shipped with `rejectedByBandCheck` 0.
   *
   * The verdict is now taken from the node's OWN computed `display` instead
   * ({@link measureOwnDisplayInBrowser}), which a hidden ancestor does not
   * change, so every banded rule is discriminated by its own cascade.
   * {@link TruthCheckCounters.bandHiddenByAncestorAtBandWidth} reports how many
   * of them an ancestor would have answered for.
   */
  | "responsive-hidden-only"
  /**
   * Candidates exist and NONE of them could be rendered: a geometry rule with no
   * observed rect, a banded rule with no band, or a rule naming a page this
   * generation is not writing. They are rejected.
   */
  | "unverifiable-candidates"
  /** No usable Chromium. Candidates are rejected, not shipped blind. */
  | "chromium-unavailable"
  /** The caller opted out. The one status under which anything ships unchecked. */
  | "disabled";

/**
 * Is this rule scoped to an `@media` band?
 *
 * Task 28.6 R3 replaced `isAcceptedUnchecked()` with this. The predicate is the
 * same shape; what changed is the conclusion drawn from it. A banded rule is no
 * longer exempt from verification — it is verified somewhere ELSE, at
 * {@link HiddenBand.verifyWidth}, because the truth viewport is exactly where it
 * cannot be seen.
 */
export function isBanded(rule: RecoveredLayoutRule): boolean {
  return rule.media !== undefined;
}

/**
 * Task 28.75 §03b — is this a banded rule whose claim is GEOMETRY, not visibility?
 *
 * `responsive-hidden` is verified by asking whether the node's own computed
 * `display` really is `none` inside the band, which is the whole of what that
 * rule claims. A banded `grid-template-columns` claims something else entirely —
 * where the container's items sit — and `display` cannot see it. So the banded
 * population splits in two, and this predicate is the split: a banded geometry
 * rule is measured the way every other geometry rule is, against the boxes it
 * names, but AT ITS OWN BAND WIDTH rather than at the truth viewport.
 *
 * A banded geometry rule whose band CONTAINS the truth width needs no new path
 * at all — it is active there, so it is verified in the ordinary truth-width
 * round with the rest of the geometry. {@link verifyLayoutRules} routes it
 * accordingly.
 */
export function isBandedGeometry(rule: RecoveredLayoutRule): boolean {
  return rule.media !== undefined && rule.kind !== "responsive-hidden";
}

/** Why an in-band render rejected a banded rule. */
export type BandRejectionReason =
  /** The band reached the truth viewport, where the probe saw the node VISIBLE. */
  | "hidden-at-truth-width"
  /** Inside its own band the node's own computed `display` was not `none`. */
  | "not-hidden-in-band"
  /**
   * Task 28.6 V4 — at the truth width the node was ALREADY out of layout with
   * the recovered tier empty, so the "does this band reach 1440" test had
   * nothing to discriminate. That is not a pass: the band was built from a probe
   * sample that measured this node VISIBLE at the truth width, so the render and
   * the observation contradict each other and the rule is not verifiable.
   */
  | "truth-baseline-not-in-layout";

export interface BandCheckRejection {
  pageId: string;
  nodeId: string;
  media: string;
  reason: BandRejectionReason;
  /** The width the measurement was taken at. */
  measuredAtWidth: number;
}

export interface TruthCheckRejection {
  pageId: string;
  nodeId: string;
  /**
   * Task 28.6 A5 — set when the box that regressed was one of the rule's
   * {@link RecoveredLayoutRule.witnesses} rather than the rule's own node. The
   * rejected rule is still the one on `nodeId`; this says which box caught it.
   */
  witnessNodeId?: string;
  kind: RecoveredLayoutRule["kind"];
  /** Observed truth rect. */
  observed: { x: number; w: number };
  /** Rendered with the candidate applied. */
  rendered: { x: number; w: number };
  /** Rendered with the recovered tier empty. */
  baseline: { x: number; w: number };
  errorWith: number;
  errorWithout: number;
}

export interface TruthCheckCounters {
  status: TruthCheckStatus;
  /** Rules the inference emitted and handed to this check. */
  candidateRules: number;
  /** …of those, the GEOMETRY ones that can be measured at the truth viewport. */
  truthCheckable: number;
  /**
   * …and the BANDED ones that can be measured inside their own active range
   * (Task 28.6 R3). A banded rule with no {@link HiddenBand} is not one of them
   * and is rejected as unverifiable.
   */
  bandCheckable: number;
  /** Rules that survived. */
  acceptedRules: number;
  /**
   * …of those, shipped with no render at all. 0 on every status but `disabled`
   * since Task 28.6 R3 removed the responsive-hidden exemption; the field stays
   * so a manifest can still say when nothing was verified.
   */
  acceptedUnchecked: number;
  /** Rejected by a re-render that measured them regressing. */
  rejectedByTruthCheck: number;
  /**
   * Banded rules rejected by an in-band render: the band reached the truth
   * viewport, or it did not actually hide the node inside its own range.
   */
  rejectedByBandCheck: number;
  /**
   * Geometry-affecting candidates dropped because they could NOT be measured:
   * no observed rect, no such page in this generation, the node absent from the
   * render, the page's set never settling, a failed render, or no Chromium.
   * They are rejected rather than shipped — the invariant is that a geometry
   * rule never ships unverified.
   */
  rejectedUnverifiable: number;
  /**
   * Accepted rules still measurably regressing in the FINAL confirming render.
   * Zero by construction after this module runs — it is recorded so the claim is
   * a measurement in the artifact rather than a sentence in a docstring.
   */
  acceptedRegressed: number;
  rounds: number;
  pagesRendered: number;
  /**
   * Extra page loads spent on in-band verification, one per (page × distinct
   * band verify-width). This is what Task 28.6 R3 costs; it is reported so the
   * cost is a measurement rather than an assumption.
   */
  bandWidthsRendered: number;
  /**
   * Task 28.6 V1 — banded rules that reached the in-band render, where the
   * verdict is read off the node's OWN computed `display`.
   *
   * TASK 28.6 D1(b) — THIS IS A PRESENCE COUNT, NOT A DISCRIMINATION COUNT.
   * Every rule whose node is in the document increments it, so it equals
   * {@link bandCheckable} under the reverted pre-V1 semantics too. The
   * discriminated population is this number MINUS
   * {@link bandExactTierHidesAtBandWidth}, and any statement of the form "all of
   * them were discriminated" is sound only while that counter is 0. State all
   * three: N checkable, N present, M already hidden by the exact tier ⇒ N − M
   * discriminated.
   */
  bandIndependentlyDiscriminated: number;
  /**
   * Task 28.75 §03b — banded GEOMETRY rules offered to the band-width check, and
   * the extra renders it needed for them. Separate from `bandCheckable`, which
   * counts `responsive-hidden` rules verified by their own computed `display`:
   * these are verified by their BOXES, so mixing the two would make neither
   * number readable.
   */
  bandGeometryCheckable: number;
  bandGeometryWidthsRendered: number;
  /**
   * Task 28.6 V1 — …of those, the ones an ANCESTOR removed from layout at the
   * band width, which the pre-V1 presence test would have accepted without
   * discriminating them. Corroborates nothing about the rule itself; it is
   * reported so the size of that population is measured.
   */
  bandHiddenByAncestorAtBandWidth: number;
  /**
   * Task 28.6 V1 — …and the ones whose own computed `display` was already
   * `none` at the band width with the recovered tier EMPTY, i.e. the exact
   * computed class hides them there and the band adds nothing. Also not a
   * discrimination, also counted.
   */
  bandExactTierHidesAtBandWidth: number;
  /**
   * Task 28.6 V4 — banded rules whose node was NOT in layout at the truth width
   * in the baseline render, contradicting the probe sample the band was built
   * from. Latent on the 28.5B Linear corpus (0 occurrences); rejected rather
   * than passed, because an unverifiable rule is rejected everywhere else here.
   */
  bandTruthBaselineNotInLayout: number;
  /** Did the reject/re-measure loop settle inside {@link MAX_ROUNDS}? */
  converged: boolean;
  /*
   * P0 contract C2.1 — interval-sample verification.
   */
  /** Geometry rules that carried samples and entered the interval stage. */
  intervalSampleCheckable: number;
  /**
   * Extra page loads the interval stage added: sample widths that neither the
   * truth render nor the band/audit loop had already open. A width shared with
   * those costs nothing and is not counted here.
   */
  intervalSamplesRendered: number;
  /** (rule × verification width) comparisons made in the interval stage's first sweep. */
  intervalSamplesChecked: number;
  /** Rules rejected `interval-sample-regressed`. Its own channel in the accounting. */
  rejectedAtIntervalSample: number;
  rejectedAtIntervalSampleByKind: Record<string, number>;
  /** Selection positions no probe width inside the served interval answered. */
  unprobedPositions: number;
  /** P0 contract C2.1 (amended) — sample widths the per-pass cap of 16 dropped. */
  intervalSampleWidthsCapped: number;
  /**
   * Review fix (MINOR) — sampled rules the per-pass width cap left with ZERO
   * verification widths. Counted as UNVERIFIED at interval samples (they keep
   * their truth-width verdict) and NOT in {@link intervalSampleCheckable}.
   */
  intervalSampleUnverifiedByCap: number;
  /** RECI2 fix (a) — verification page loads retried after a failure/timeout. */
  renderLoadRetries: number;
  /** RECI2 fix (a) — isolation renders spent bisecting interval-sample regressors. */
  intervalIsolationRenders: number;
  /** RECI2 fix (a) — regressors kept alive because their error came from another rule. */
  intervalCoRejectionsAvoided: number;
  /** RECI2 fix (a) — rules rejected when the truth width was re-checked after removals. */
  truthRecheckRejections: number;
  /** Review-VF MINOR — times the isolation render budget ran out and a group was rejected jointly. */
  intervalIsolationBudgetFallbacks: number;
}

// ---------------------------------------------------------------------------
// Task 28.7 B1 — the residual freeze audit. REPORT ONLY.
// ---------------------------------------------------------------------------

/**
 * THE DEFECT THIS MEASURES, AND WHY IT IS NOT A GATE.
 *
 * When recovery refuses to emit a responsive rule, the exact tier's
 * 1440-resolved pixels still ship and nothing checks them at any other width. A
 * refusal is NOT neutral: declining to emit IS shipping a value. Proven
 * arithmetic from one real corpus — a footer grid whose recovered
 * `grid-template-columns` refused, leaving `padding-left 46 + 6 × 224 = 1390`
 * of frozen track list inside an 1100px viewport.
 *
 * WHY IT MUST NEVER REJECT ANYTHING. The obvious next step — "then refuse the
 * frozen value too" — was measured and is WRONG. On the one worked case,
 * refusing the recovered `width: auto` leaves the container at 1436 and trades
 * a 290px overhang for a 336px one: the refusal makes the clipping WORSE. A
 * measurement that cannot say which of two bad outcomes is better has no
 * business being a gate. So this block writes to {@link ResidualAuditReport}
 * and to nothing else — never to `regressed`, never to `bandRejected`, never to
 * `unverifiable`, and therefore never to the SUBTRACTION that derives
 * {@link TruthCheckCounters.rejectedUnverifiable}.
 */
export type ResidualConsequence =
  /** The frozen box's right edge leaves the viewport where the source's did not. */
  | "offscreen"
  /** The frozen box overflows its own parent where the source's did not. */
  | "clipping"
  /** Measurably frozen, with no overflow consequence inside the observed range. */
  | "neither";

/** One node that kept its 1440-resolved geometry while the source's moved. */
export interface ResidualFrozenNode {
  pageId: string;
  /** Always explicit — an absent `viewportId` reads as `"desktop"` elsewhere. */
  viewportId: LayoutViewportId;
  nodeId: string;
  tagName: string;
  parentNodeId?: string;
  /** The frozen property this record is attributed to, and its family. */
  property: string;
  family: string;
  frozenValue: string;
  /** The widths BOTH halves were measured at, ascending. */
  widths: number[];
  sourceX: number[];
  sourceW: number[];
  cloneX: number[];
  cloneW: number[];
  /** Largest |clone − source| width error across {@link widths}. */
  absoluteDeltaPx: number;
  /** …as a fraction of the largest observed source width. */
  relativeDelta: number;
  consequence: ResidualConsequence;
  /** Descendants under this node — how much of the tree one frozen box carries. */
  descendants: number;
  /** The recovered rule this node DID get, if any. */
  recoveredKind?: RecoveredRuleKind;
  /** The stage and reason that declined, when one was recorded. */
  refusalReason?: string;
}

export interface ResidualAuditReport {
  /**
   * `not-performed` when no evidence was supplied or the browser never ran —
   * which is a different artifact from a clean audit, and is never read as one.
   */
  status: "performed" | "not-performed" | "no-candidates";
  /** page × viewport passes that got at least two measured widths. */
  passes: number;
  nodesMeasured: number;
  /** Candidates inference's per-pass bound dropped before this ran. */
  nodesOmitted: number;
  /** Extra page loads this audit added, beyond the ones the check already did. */
  widthsRendered: number;
  /** Audit widths {@link RESIDUAL_AUDIT_MAX_WIDTHS} dropped. */
  widthsCapped: number;
  /** Ranked, top-N per ROUTE. */
  residuals: ResidualFrozenNode[];
  /** …and what the per-route cut dropped. Never silent. */
  residualsOmitted: number;
  /** Every detected residual by frozen family, before the cut. */
  familyHistogram: Record<string, number>;
  /** …and by likely visual consequence. */
  consequenceHistogram: Record<string, number>;
}

export interface TruthCheckResult {
  rules: RecoveredLayoutRule[];
  css: string;
  counters: TruthCheckCounters;
  rejections: TruthCheckRejection[];
  bandRejections: BandCheckRejection[];
  /** P0 contract C2.1 — rules rejected at an interval sample width. */
  intervalRejections: IntervalSampleRejection[];
  /** Task 28.7 B1 — the residual freeze audit. Diagnostic, never a gate. */
  residual: ResidualAuditReport;
  /** Wall time, for reporting only. NEVER written to the manifest (item 114). */
  elapsedMs: number;
}

export interface TruthCheckInput {
  rules: readonly RecoveredLayoutRule[];
  /** The compiled runtime pages — the exact trees the app will render. */
  pages: readonly RuntimePage[];
  /**
   * The generated stylesheet WITHOUT the recovered tier: globals, exact computed
   * classes, pseudo rules, observed-target rules, in the order `generateApp()`
   * concatenates them.
   */
  css: string;
  /** Opt out (records `status: "disabled"`, never a silent acceptance). */
  enabled?: boolean;
  /**
   * Task 28.7 B1 — per page × viewport probe evidence for the residual freeze
   * audit, as `inferLayoutRules()` built it.
   *
   * OPTIONAL ON PURPOSE. A caller that does not supply it gets
   * `residual.status: "not-performed"` — the audit degrades to "we did not look"
   * rather than throwing, and never to "we looked and found nothing".
   */
  residualAudit?: readonly ResidualAuditPass[];
  /**
   * Task 28.7 B1 — audit candidates INFERENCE's per-pass bound already dropped,
   * carried through so the report's own accounting is complete rather than
   * reading 0 for "unknown".
   */
  residualAuditNodesOmitted?: number;
  /** Progress log. */
  onLog?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// RuntimeNode → HTML
// ---------------------------------------------------------------------------

/** React prop name → HTML attribute name. The inverse of the render adapter. */
const HTML_ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(REACT_PROP_NAMES).map(([attribute, prop]) => [prop, attribute]),
  ),
  className: "class",
  defaultChecked: "checked",
  defaultValue: "value",
};

/** Props that exist for React and have no HTML spelling at all. */
const NON_HTML_PROPS: ReadonlySet<string> = new Set([
  "key",
  "suppressContentEditableWarning",
  "dangerouslySetInnerHTML",
]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function serializeNode(node: RuntimeNode, out: string[]): void {
  if (node.k === "t") {
    out.push(escapeText(node.v));
    return;
  }
  const element = node as RuntimeElementNode;
  const tag = element.t;
  out.push("<", tag);
  if (element.p) {
    for (const prop of Object.keys(element.p)) {
      if (NON_HTML_PROPS.has(prop)) continue;
      const value = element.p[prop];
      if (value === undefined || value === null || value === false) continue;
      const name = HTML_ATTRIBUTE_NAMES[prop] ?? prop;
      if (value === true) {
        out.push(" ", name);
        continue;
      }
      out.push(" ", name, '="', escapeAttribute(String(value)), '"');
    }
  }
  out.push(">");
  if (VOID_ELEMENTS.has(tag)) return;
  if (element.v !== undefined) {
    // Sanitized inline SVG markup, already re-serialized by the compiler. It is
    // the same string `dangerouslySetInnerHTML` receives in the real app.
    out.push(element.v);
  } else if (element.c) {
    for (const child of element.c) serializeNode(child, out);
  }
  out.push("</", tag, ">");
}

/**
 * ONE page, ONE viewport's tree, as a standalone document.
 *
 * The OTHER tree is omitted on purpose: `globals.css` gives it `display: none`
 * at the width this document is rendered at, so it contributes nothing to the
 * geometry being measured and doubles the DOM the browser has to lay out.
 *
 * TASK 28.6 C2b — this used to hard-code the desktop tree, because layout
 * inference only ever produced desktop rules. It now produces mobile rules too,
 * and requirement (c) is that they earn their place under exactly the checks a
 * desktop rule does: the same regression rounds against the same observed truth
 * rects, and the same two band measurements. The only thing that differs is
 * WHICH tree is serialized and at WHICH width it is measured — both of which are
 * properties of the rule being checked, not exemptions from checking it.
 */
export function truthCheckHtml(
  page: RuntimePage,
  css: string,
  viewportId: "desktop" | "mobile" = "desktop",
): string {
  const out: string[] = [];
  serializeNode(page[viewportId].doc, out);
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    `<style>${css}</style>` +
    '<style id="wr-layout-candidates"></style>' +
    "</head><body>" +
    `<div class="wr-variant" data-wr-viewport="${viewportId}" data-wr-page="${escapeAttribute(
      page.pageId,
    )}">` +
    out.join("") +
    "</div></body></html>"
  );
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  w: number;
}

/**
 * Every box a rule is responsible for: its own node, then its witnesses.
 *
 * Task 28.6 A5. A `grid-track-columns` rule changes a container's INNER track
 * sizes and leaves the container's own border box exactly where it was, so
 * measuring the container alone would accept any track list at all. The rule
 * therefore names the boxes it actually moves — its grid items — and they are
 * measured under the same rule as the node itself: farther than the tolerance
 * from the observation AND farther than the baseline was.
 */
function responsibleBoxes(
  rule: RecoveredLayoutRule,
): { nodeId: string; observed: Rect; witness: boolean }[] {
  const boxes: { nodeId: string; observed: Rect; witness: boolean }[] = [
    { nodeId: rule.nodeId, observed: rule.truth!, witness: false },
  ];
  for (const witness of rule.witnesses ?? []) {
    boxes.push({
      nodeId: witness.nodeId,
      observed: { x: witness.x, w: witness.w },
      witness: true,
    });
  }
  return boxes;
}

/**
 * P0 contract C2.1 — the box a responsible node is EXPECTED at `width`: the
 * source probe sample at that width when the rule carries one (visible there),
 * otherwise the single observed rect the rule was built with. The banded
 * geometry check renders at `band.verifyWidth`, so it now compares against the
 * per-width source sample there instead of a rect taken elsewhere.
 */
function expectedAtWidth(
  rule: RecoveredLayoutRule,
  box: { nodeId: string; observed: Rect; witness: boolean },
  width: number,
): Rect {
  const samples = box.witness
    ? rule.witnesses?.find((witness) => witness.nodeId === box.nodeId)?.samples
    : rule.samples;
  const sample = samples?.find((entry) => entry.width === width && entry.v === 1);
  return sample !== undefined ? { x: sample.x, w: sample.w } : box.observed;
}

/**
 * P0 contract C2.1 — every (box, source sample) pair a rule is judged on at one
 * width: its own node, then each witness that carries a sample there. A box
 * whose source was not visible at that width says nothing and is skipped.
 */
function sampleBoxesAt(
  rule: RecoveredLayoutRule,
  width: number,
): { nodeId: string; expected: IntervalSample; witness: boolean }[] {
  const out: { nodeId: string; expected: IntervalSample; witness: boolean }[] = [];
  const own = rule.samples?.find((entry) => entry.width === width);
  if (own !== undefined && own.v === 1) {
    out.push({ nodeId: rule.nodeId, expected: own, witness: false });
  }
  for (const witness of rule.witnesses ?? []) {
    const sample = witness.samples?.find((entry) => entry.width === width);
    if (sample !== undefined && sample.v === 1) {
      out.push({ nodeId: witness.nodeId, expected: sample, witness: true });
    }
  }
  return out;
}

/** Every node id a set of rules needs measured, de-duplicated. */
function measuredNodeIds(rules: readonly RecoveredLayoutRule[]): string[] {
  const ids = new Set<string>();
  for (const rule of rules) {
    ids.add(rule.nodeId);
    for (const witness of rule.witnesses ?? []) ids.add(witness.nodeId);
  }
  return [...ids];
}

/** `max(|Δx|, |Δwidth|)` against the observed truth rect. */
function errorAgainst(observed: Rect, rendered: Rect | undefined): number {
  if (rendered === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(rendered.x - observed.x), Math.abs(rendered.w - observed.w));
}

/**
 * Runs inside the page. Measures the named nodes with no layout assumptions.
 *
 * Deliberately free of inner named bindings: the loader compiles this file with
 * `keepNames`, which wraps a nested `const fn = …` in a `__name()` helper that
 * does not exist inside the browser context this function is serialized into.
 */
function measureInBrowser(nodeIds: string[]): Record<string, { x: number; w: number } | null> {
  const out: Record<string, { x: number; w: number } | null> = {};
  for (const nodeId of nodeIds) {
    const element = document.querySelector(`[data-wr-node="${nodeId}"]`);
    if (!element) {
      out[nodeId] = null;
      continue;
    }
    const rect = element.getBoundingClientRect();
    out[nodeId] = {
      x: Math.round(rect.x * 100) / 100,
      w: Math.round(rect.width * 100) / 100,
    };
  }
  return out;
}

/**
 * Runs inside the page. Is each named node IN LAYOUT?
 *
 * `getClientRects().length` rather than a rect comparison, because the question
 * is "did `display: none` take effect", not "how big is it". A `display: none`
 * element has zero client rects; a displayed element with a zero-sized box still
 * has one. `null` means the node is not in the document at all, which is a
 * different failure (unverifiable) from being hidden.
 *
 * Same no-inner-named-bindings rule as {@link measureInBrowser}.
 */
function measurePresenceInBrowser(nodeIds: string[]): Record<string, boolean | null> {
  const out: Record<string, boolean | null> = {};
  for (const nodeId of nodeIds) {
    const element = document.querySelector(`[data-wr-node="${nodeId}"]`);
    out[nodeId] = element ? element.getClientRects().length > 0 : null;
  }
  return out;
}

/**
 * P0 contract C2.1 — runs inside the page. Box AND presence in one pass, so a
 * node the source rendered and the clone put out of layout reads as an error of
 * `+∞` rather than as a zero rect that happens to be close. `null` = not in the
 * document. Same no-inner-named-bindings rule as {@link measureInBrowser}.
 */
function measureSampleBoxInBrowser(
  nodeIds: string[],
): Record<string, { x: number; w: number; l: boolean } | null> {
  const out: Record<string, { x: number; w: number; l: boolean } | null> = {};
  for (const nodeId of nodeIds) {
    const element = document.querySelector(`[data-wr-node="${nodeId}"]`);
    if (!element) {
      out[nodeId] = null;
      continue;
    }
    const rect = element.getBoundingClientRect();
    out[nodeId] = {
      x: Math.round(rect.x * 100) / 100,
      w: Math.round(rect.width * 100) / 100,
      l: element.getClientRects().length > 0,
    };
  }
  return out;
}

/**
 * Runs inside the page. Each named node's OWN computed `display`.
 *
 * Task 28.6 V1. This is the question `getClientRects()` could not answer: an
 * ancestor at `display: none` removes every descendant from layout, but it does
 * not change what the descendant's own cascade computes, so this reads the
 * effect of the node's OWN `@media` band and nothing else. `null` means the node
 * is not in the document, which is a different failure (unverifiable).
 *
 * Same no-inner-named-bindings rule as {@link measureInBrowser}.
 */
function measureOwnDisplayInBrowser(nodeIds: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const nodeId of nodeIds) {
    const element = document.querySelector(`[data-wr-node="${nodeId}"]`);
    out[nodeId] = element ? window.getComputedStyle(element).display : null;
  }
  return out;
}

/**
 * Runs inside the page. Does any ANCESTOR of each named node compute to
 * `display: none`?
 *
 * Task 28.6 V1. This is the population the pre-V1 in-band test was accidentally
 * measuring: a node whose ancestor is hidden has no client rects whatever its
 * own band does, so "is it out of layout" was answered for it by something other
 * than its own rule. Reported so the size of that population is a number in the
 * artifact. `null` means the node is not in the document.
 *
 * Same no-inner-named-bindings rule as {@link measureInBrowser}.
 */
function measureAncestorHiddenInBrowser(nodeIds: string[]): Record<string, boolean | null> {
  const out: Record<string, boolean | null> = {};
  for (const nodeId of nodeIds) {
    const element = document.querySelector(`[data-wr-node="${nodeId}"]`);
    if (!element) {
      out[nodeId] = null;
      continue;
    }
    let hidden = false;
    let ancestor = element.parentElement;
    while (ancestor) {
      if (window.getComputedStyle(ancestor).display === "none") {
        hidden = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    out[nodeId] = hidden;
  }
  return out;
}

function applyCandidateCss(css: string): void {
  const style = document.getElementById("wr-layout-candidates");
  // P0 contract C2.1 — identical text is a no-op, so re-applying the set a page
  // already carries (the interval stage reuses open pages) costs no restyle.
  if (style && style.textContent !== css) style.textContent = css;
}

// ---------------------------------------------------------------------------
// Task 28.7 B1 — residual detection, out of the two measured halves
// ---------------------------------------------------------------------------

function emptyResidualReport(
  status: ResidualAuditReport["status"],
  nodesOmitted = 0,
): ResidualAuditReport {
  return {
    status,
    passes: 0,
    nodesMeasured: 0,
    nodesOmitted,
    widthsRendered: 0,
    widthsCapped: 0,
    residuals: [],
    residualsOmitted: 0,
    familyHistogram: {},
    consequenceHistogram: {},
  };
}

/** Ranking order: what a reader should look at first. */
const CONSEQUENCE_RANK: Readonly<Record<ResidualConsequence, number>> = {
  offscreen: 0,
  clipping: 1,
  neither: 2,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Which of one pass's audit nodes kept their frozen geometry.
 *
 * A residual needs BOTH halves and at least two widths where both were
 * measured: the source moved by at least
 * {@link RESIDUAL_SOURCE_CHANGE_MIN_PX}, and the clone moved by no more than
 * {@link RESIDUAL_CLONE_CONSTANT_PX}. A node the source never moved has no
 * responsive meaning for the exact tier to have frozen away; a node the clone
 * moves with is already responsive, whatever else is true of it.
 */
export function residualsForPass(
  pass: ResidualAuditPass,
  cloneByWidth: ReadonlyMap<number, Record<string, { x: number; w: number } | null>>,
): ResidualFrozenNode[] {
  const out: ResidualFrozenNode[] = [];
  const widthIndex = new Map(pass.widths.map((width, i) => [width, i]));
  const measuredWidths = [...cloneByWidth.keys()]
    .filter((width) => widthIndex.has(width))
    .sort((a, b) => a - b);
  if (measuredWidths.length < 2) return out;
  for (const node of pass.nodes) {
    const widths: number[] = [];
    const sourceW: number[] = [];
    const sourceX: number[] = [];
    const cloneW: number[] = [];
    const cloneX: number[] = [];
    const parentSourceW: (number | undefined)[] = [];
    const parentCloneW: (number | undefined)[] = [];
    for (const width of measuredWidths) {
      const i = widthIndex.get(width)!;
      // A width the source did not render this node at says nothing about it.
      if ((node.sourceV[i] ?? 0) !== 1) continue;
      const measured = cloneByWidth.get(width)![node.nodeId];
      if (measured == null) continue;
      widths.push(width);
      sourceW.push(node.sourceW[i] ?? 0);
      sourceX.push(node.sourceX[i] ?? 0);
      cloneW.push(measured.w);
      cloneX.push(measured.x);
      parentSourceW.push(node.parentSourceW?.[i]);
      parentCloneW.push(
        node.parentNodeId !== undefined
          ? (cloneByWidth.get(width)![node.parentNodeId]?.w ?? undefined)
          : undefined,
      );
    }
    if (widths.length < 2) continue;
    const sourceSpread = Math.max(...sourceW) - Math.min(...sourceW);
    if (sourceSpread < RESIDUAL_SOURCE_CHANGE_MIN_PX) continue;
    const cloneSpread = Math.max(...cloneW) - Math.min(...cloneW);
    if (cloneSpread > RESIDUAL_CLONE_CONSTANT_PX) continue;

    let absoluteDeltaPx = 0;
    for (let k = 0; k < widths.length; k++) {
      absoluteDeltaPx = Math.max(absoluteDeltaPx, Math.abs(cloneW[k]! - sourceW[k]!));
    }
    /*
     * The consequence tag is DERIVED from the same two measurements, never
     * asserted. "offscreen" is the frozen box's right edge leaving a viewport
     * the source's stayed inside; "clipping" is it overflowing its own parent
     * where the source's did not. Anything else is a measured freeze with no
     * overflow consequence inside the range that was observed — which is a
     * weaker finding, and says so.
     */
    let consequence: ResidualConsequence = "neither";
    for (let k = 0; k < widths.length; k++) {
      const viewport = widths[k]!;
      if (
        cloneX[k]! + cloneW[k]! > viewport + FULL_WIDTH_TOLERANCE_PX &&
        sourceX[k]! + sourceW[k]! <= viewport + FULL_WIDTH_TOLERANCE_PX
      ) {
        consequence = "offscreen";
        break;
      }
    }
    if (consequence === "neither") {
      for (let k = 0; k < widths.length; k++) {
        const parentSource = parentSourceW[k];
        const parentClone = parentCloneW[k];
        if (parentSource === undefined || parentClone === undefined) continue;
        if (
          cloneW[k]! > parentClone + FULL_WIDTH_TOLERANCE_PX &&
          sourceW[k]! <= parentSource + FULL_WIDTH_TOLERANCE_PX
        ) {
          consequence = "clipping";
          break;
        }
      }
    }
    out.push({
      pageId: pass.pageId,
      viewportId: pass.viewportId,
      nodeId: node.nodeId,
      tagName: node.tagName,
      ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {}),
      property: node.property,
      family: node.family,
      frozenValue: node.frozenValue,
      widths,
      sourceX: sourceX.map(round2),
      sourceW: sourceW.map(round2),
      cloneX: cloneX.map(round2),
      cloneW: cloneW.map(round2),
      absoluteDeltaPx: round2(absoluteDeltaPx),
      relativeDelta: round2(absoluteDeltaPx / Math.max(1, Math.max(...sourceW))) ,
      consequence,
      descendants: node.descendants,
      ...(node.recoveredKind !== undefined ? { recoveredKind: node.recoveredKind } : {}),
      ...(node.refusalReason !== undefined ? { refusalReason: node.refusalReason } : {}),
    });
  }
  return out;
}

/**
 * Rank, histogram and TRUNCATE PER ROUTE.
 *
 * Ranking order is the one a reader needs: what leaves the viewport, then what
 * overflows its parent, then the raw pixel error, then how much of the tree the
 * frozen box carries with it. The per-route cut follows the tree-switch
 * precedent — bounded output with a never-silent omitted count.
 */
export function summariseResiduals(
  detected: readonly ResidualFrozenNode[],
  reportedPerRoute: number = RESIDUAL_FROZEN_REPORTED,
): {
  residuals: ResidualFrozenNode[];
  residualsOmitted: number;
  familyHistogram: Record<string, number>;
  consequenceHistogram: Record<string, number>;
} {
  const familyHistogram: Record<string, number> = {};
  const consequenceHistogram: Record<string, number> = {};
  const byRoute = new Map<string, ResidualFrozenNode[]>();
  for (const record of detected) {
    familyHistogram[record.family] = (familyHistogram[record.family] ?? 0) + 1;
    consequenceHistogram[record.consequence] =
      (consequenceHistogram[record.consequence] ?? 0) + 1;
    const list = byRoute.get(record.pageId);
    if (list) list.push(record);
    else byRoute.set(record.pageId, [record]);
  }
  const residuals: ResidualFrozenNode[] = [];
  let residualsOmitted = 0;
  for (const pageId of [...byRoute.keys()].sort()) {
    const list = byRoute.get(pageId)!;
    list.sort(
      (a, b) =>
        CONSEQUENCE_RANK[a.consequence] - CONSEQUENCE_RANK[b.consequence] ||
        b.absoluteDeltaPx - a.absoluteDeltaPx ||
        b.descendants - a.descendants ||
        a.nodeId.localeCompare(b.nodeId),
    );
    if (list.length > reportedPerRoute) residualsOmitted += list.length - reportedPerRoute;
    residuals.push(...list.slice(0, reportedPerRoute));
  }
  const sortRecord = (record: Record<string, number>): Record<string, number> => {
    const sorted: Record<string, number> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = record[key]!;
    return sorted;
  };
  return {
    residuals,
    residualsOmitted,
    familyHistogram: sortRecord(familyHistogram),
    consequenceHistogram: sortRecord(consequenceHistogram),
  };
}

/**
 * The extra widths one pass's audit renders at, and what the bound dropped.
 *
 * The pass's own truth width is excluded because the main render already
 * measured it — that sample costs one `evaluate`, not one page load.
 *
 * The cut is an EVENLY SPACED sample that always keeps both extremes. Real
 * probe grids cluster around breakpoints (…1280, 1281, 1440, 1441…), so a
 * head-and-tail cut spends half its budget on two widths one pixel apart and
 * learns nothing from the second; spreading the samples measures the range the
 * frozen value actually has to survive. Whatever the bound drops is counted.
 */
export function auditRenderWidths(
  probeWidths: readonly number[],
  truthWidth: number,
  limit: number = RESIDUAL_AUDIT_MAX_WIDTHS,
): { widths: number[]; capped: number } {
  const extra = [...new Set(probeWidths)]
    .filter((width) => width !== truthWidth)
    .sort((a, b) => a - b);
  if (extra.length <= limit) return { widths: extra, capped: 0 };
  if (limit <= 1) return { widths: extra.slice(0, Math.max(limit, 0)), capped: extra.length - Math.max(limit, 0) };
  const picked = new Set<number>();
  for (let i = 0; i < limit; i++) {
    picked.add(extra[Math.round((i * (extra.length - 1)) / (limit - 1))]!);
  }
  const widths = [...picked].sort((a, b) => a - b);
  return { widths, capped: extra.length - widths.length };
}

/**
 * Verify every recovered rule by re-rendering it, and return only the survivors.
 *
 * Failure to verify never fails the generation — that is the module's existing
 * invariant and this check inherits it. What it does NOT do is fail QUIETLY:
 * an unusable browser is recorded as `status: "chromium-unavailable"` in the
 * manifest, which is a different artifact from a verified run.
 */
export async function verifyLayoutRules(
  input: TruthCheckInput,
): Promise<TruthCheckResult> {
  const started = Date.now();
  const log = input.onLog ?? ((): void => {});
  const candidates = [...input.rules];

  /*
   * Two populations, and they are verified in two different places.
   *
   *  * BANDED rules (`responsive-hidden`) live inside an `@media` condition that
   *    is built to EXCLUDE the truth width, so the truth viewport is the one
   *    place they provably cannot be seen. Task 28.6 R3: that is a reason to
   *    render them somewhere else — at `band.verifyWidth`, one of the probe
   *    widths the band was built from — not a reason to ship them unverified.
   *  * UNBANDED rules (`centered-max-width`, `full-width`, `percentage-width`)
   *    change geometry AT the truth viewport and are measured there.
   *
   * Both populations obey the same 28.5B invariant: a rule this module cannot
   * render and measure is REJECTED and counted as `rejectedUnverifiable`.
   * Refusal is free — the node keeps its exact computed class, which is what it
   * would have had if inference had never fired. Shipping it would put an
   * unmeasured (0,3,0) rule above that class.
   */
  const banded = candidates.filter((rule) => isBanded(rule) && !isBandedGeometry(rule));
  /**
   * Task 28.75 §03b — banded rules whose claim is geometry. Split again below,
   * once `pageById` is in hand: the ones ACTIVE at their pass's truth width join
   * `geometry` and are measured there; the rest are measured at their own band
   * width by the same accept/reject rule.
   */
  const bandedGeometryAll = candidates.filter(isBandedGeometry);
  const geometry = candidates.filter((rule) => !isBanded(rule));

  /*
   * Task 28.7 B1 — the audit needs a browser, so every early return below is a
   * path on which it did NOT run. "no-candidates" is the one case where the
   * distinction matters in the other direction: evidence was offered and there
   * was nothing to render it against.
   */
  const auditPasses = (input.residualAudit ?? []).filter((pass) => pass.nodes.length > 0);
  const residualDefaultStatus: ResidualAuditReport["status"] =
    auditPasses.length === 0 ? "no-candidates" : "not-performed";
  const residualNodesOmitted = input.residualAuditNodesOmitted ?? 0;

  /**
   * Assemble the result. `shipped` is the ONLY channel by which a rule survives;
   * every candidate not in it and not counted in one of the two measured
   * rejection channels is, by definition, one this module could not verify — so
   * `rejectedUnverifiable` is derived, never hand-maintained.
   */
  const finish = (
    status: TruthCheckStatus,
    part: {
      shipped: readonly RecoveredLayoutRule[];
      truthCheckable?: number;
      bandCheckable?: number;
      bandGeometryCheckable?: number;
      bandGeometryWidthsRendered?: number;
      rejectedByTruthCheck?: number;
      rejectedByBandCheck?: number;
      acceptedUnchecked?: number;
      rejections?: TruthCheckRejection[];
      bandRejections?: BandCheckRejection[];
      acceptedRegressed?: number;
      rounds?: number;
      pagesRendered?: number;
      bandWidthsRendered?: number;
      bandIndependentlyDiscriminated?: number;
      bandHiddenByAncestorAtBandWidth?: number;
      bandExactTierHidesAtBandWidth?: number;
      bandTruthBaselineNotInLayout?: number;
      converged?: boolean;
      intervalSampleCheckable?: number;
      intervalSamplesRendered?: number;
      intervalSamplesChecked?: number;
      rejectedAtIntervalSample?: number;
      unprobedPositions?: number;
      intervalSampleWidthsCapped?: number;
      intervalSampleUnverifiedByCap?: number;
      renderLoadRetries?: number;
      intervalIsolationRenders?: number;
      intervalCoRejectionsAvoided?: number;
      truthRecheckRejections?: number;
      intervalIsolationBudgetFallbacks?: number;
      intervalRejections?: IntervalSampleRejection[];
      /** Task 28.7 B1 — report-only, and structurally separate from every count above. */
      residual?: ResidualAuditReport;
    },
  ): TruthCheckResult => {
    const shippedSet = new Set(part.shipped);
    const rules = candidates.filter((rule) => shippedSet.has(rule));
    const rejectedByTruthCheck = part.rejectedByTruthCheck ?? 0;
    const rejectedByBandCheck = part.rejectedByBandCheck ?? 0;
    /*
     * P0 contract C2.1 — the interval stage is a measured rejection channel of
     * its own, so it is subtracted here alongside the other two; leaving it out
     * would silently inflate `rejectedUnverifiable`.
     */
    const rejectedAtIntervalSample = part.rejectedAtIntervalSample ?? 0;
    const rejectedAtIntervalSampleByKind: Record<string, number> = {};
    for (const rejection of part.intervalRejections ?? []) {
      rejectedAtIntervalSampleByKind[rejection.kind] =
        (rejectedAtIntervalSampleByKind[rejection.kind] ?? 0) + 1;
    }
    return {
      rules,
      css: generateLayoutCss(rules),
      counters: {
        status,
        candidateRules: candidates.length,
        truthCheckable: part.truthCheckable ?? 0,
        bandCheckable: part.bandCheckable ?? 0,
        bandGeometryCheckable: part.bandGeometryCheckable ?? 0,
        bandGeometryWidthsRendered: part.bandGeometryWidthsRendered ?? 0,
        acceptedRules: rules.length,
        acceptedUnchecked: part.acceptedUnchecked ?? 0,
        rejectedByTruthCheck,
        rejectedByBandCheck,
        rejectedUnverifiable:
          candidates.length -
          rules.length -
          rejectedByTruthCheck -
          rejectedByBandCheck -
          rejectedAtIntervalSample,
        acceptedRegressed: part.acceptedRegressed ?? 0,
        rounds: part.rounds ?? 0,
        pagesRendered: part.pagesRendered ?? 0,
        bandWidthsRendered: part.bandWidthsRendered ?? 0,
        bandIndependentlyDiscriminated: part.bandIndependentlyDiscriminated ?? 0,
        bandHiddenByAncestorAtBandWidth: part.bandHiddenByAncestorAtBandWidth ?? 0,
        bandExactTierHidesAtBandWidth: part.bandExactTierHidesAtBandWidth ?? 0,
        bandTruthBaselineNotInLayout: part.bandTruthBaselineNotInLayout ?? 0,
        converged: part.converged ?? true,
        intervalSampleCheckable: part.intervalSampleCheckable ?? 0,
        intervalSamplesRendered: part.intervalSamplesRendered ?? 0,
        intervalSamplesChecked: part.intervalSamplesChecked ?? 0,
        rejectedAtIntervalSample,
        rejectedAtIntervalSampleByKind,
        unprobedPositions: part.unprobedPositions ?? 0,
        intervalSampleWidthsCapped: part.intervalSampleWidthsCapped ?? 0,
        intervalSampleUnverifiedByCap: part.intervalSampleUnverifiedByCap ?? 0,
        renderLoadRetries: part.renderLoadRetries ?? 0,
        intervalIsolationRenders: part.intervalIsolationRenders ?? 0,
        intervalCoRejectionsAvoided: part.intervalCoRejectionsAvoided ?? 0,
        truthRecheckRejections: part.truthRecheckRejections ?? 0,
        intervalIsolationBudgetFallbacks: part.intervalIsolationBudgetFallbacks ?? 0,
      },
      rejections: part.rejections ?? [],
      bandRejections: part.bandRejections ?? [],
      intervalRejections: part.intervalRejections ?? [],
      /*
       * Task 28.7 B1 — the audit is REPORT ONLY. It is assembled here and
       * nowhere else, and it is deliberately NOT one of the inputs to the
       * `rejectedUnverifiable` subtraction above: a new accept/reject channel
       * that skipped `finish()` would make that number wrong with no error.
       */
      residual:
        part.residual ?? emptyResidualReport(residualDefaultStatus, residualNodesOmitted),
      elapsedMs: Date.now() - started,
    };
  };

  /*
   * `disabled` is the one status that ships rules unverified, and it is the
   * caller's explicit instruction not to check — recorded in the manifest as
   * `disabled`, which is a different artifact from `verified`. Every OTHER way
   * the check can fail to run drops the rules instead.
   */
  if (input.enabled === false) {
    return finish("disabled", {
      shipped: candidates,
      acceptedUnchecked: candidates.length,
    });
  }
  if (candidates.length === 0) return finish("no-candidates", { shipped: [] });

  /*
   * A geometry rule with no observed rect has nothing to be compared against; a
   * banded rule with no numeric band has no width to be rendered at; and one
   * naming a page this generation is not writing has nothing to be rendered IN.
   * All three are unverifiable, so all three are dropped.
   */
  const pageById = new Map(input.pages.map((page) => [page.pageId, page]));
  /**
   * The width THIS rule's pass renders at — the one width where its variant's
   * `truth` rects are an observation. Absent when the page is not being written.
   */
  const passWidthOf = (rule: RecoveredLayoutRule): number | undefined =>
    pageById.get(rule.pageId)?.[rule.viewportId ?? "desktop"]?.width;
  /*
   * Task 28.75 §03b — a banded geometry rule ACTIVE at its pass's truth width is
   * an ordinary geometry rule with an `@media` wrapper around it, and is
   * measured in the ordinary round. One that is not active there cannot be
   * measured there at all, and gets its own render at `band.verifyWidth`.
   */
  const bandedGeometryAtTruth = bandedGeometryAll.filter((rule) => {
    const width = passWidthOf(rule);
    return (
      width !== undefined && rule.band !== undefined && bandContains(rule.band, width)
    );
  });
  const bandedGeometryElsewhere = bandedGeometryAll.filter(
    (rule) => !bandedGeometryAtTruth.includes(rule),
  );
  const checkable = [...geometry, ...bandedGeometryAtTruth].filter(
    (rule) => rule.truth !== undefined && pageById.has(rule.pageId),
  );
  const bandCheckable = banded.filter(
    (rule) => rule.band !== undefined && pageById.has(rule.pageId),
  );
  const bandGeomCheckable = bandedGeometryElsewhere.filter(
    (rule) =>
      rule.band !== undefined && rule.truth !== undefined && pageById.has(rule.pageId),
  );
  if (checkable.length === 0 && bandCheckable.length === 0 && bandGeomCheckable.length === 0) {
    log(
      `[layout-truth] ${candidates.length} candidate(s) cannot be rendered ` +
        `(no observed rect, no band, or no such page) — rejecting rather than shipping them`,
    );
    return finish("unverifiable-candidates", { shipped: [] });
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    log(
      `[layout-truth] playwright is unavailable (${
        err instanceof Error ? err.message : String(err)
      }) — recovered rules are REJECTED, not shipped unverified`,
    );
    return finish("chromium-unavailable", {
      shipped: [],
      truthCheckable: checkable.length,
      bandCheckable: bandCheckable.length,
      bandGeometryCheckable: bandGeomCheckable.length,
      converged: false,
    });
  }

  /*
   * TASK 28.6 C2b — ONE BUCKET PER PAGE **AND VIEWPORT**.
   *
   * A rule's node id is unique inside its own tree and means nothing in the
   * other one, and the two trees are measured at two different widths. Bucketing
   * by page alone would have mixed mobile rules into the desktop render, where
   * their nodes are absent and every one of them would have been dropped as
   * "unverifiable" — a silent 100% rejection that looks exactly like a clean run.
   */
  interface PassBucket {
    pageId: string;
    viewportId: "desktop" | "mobile";
    geometry: RecoveredLayoutRule[];
    banded: RecoveredLayoutRule[];
    /** Task 28.75 §03b — banded GEOMETRY rules, verified at their own band width. */
    bandGeometry: RecoveredLayoutRule[];
  }
  const byPass = new Map<string, PassBucket>();
  const bucket = (rule: RecoveredLayoutRule): PassBucket => {
    const viewportId = rule.viewportId ?? "desktop";
    const key = `${rule.pageId}|${viewportId}`;
    let entry = byPass.get(key);
    if (!entry) {
      entry = { pageId: rule.pageId, viewportId, geometry: [], banded: [], bandGeometry: [] };
      byPass.set(key, entry);
    }
    return entry;
  };
  for (const rule of checkable) bucket(rule).geometry.push(rule);
  for (const rule of bandCheckable) bucket(rule).banded.push(rule);
  for (const rule of bandGeomCheckable) bucket(rule).bandGeometry.push(rule);

  /*
   * Task 28.7 B1 — a page × viewport with NO recovered rule is not a page with
   * nothing to audit; it is the MAXIMAL residual, every box on it frozen. So
   * the audit's passes get a bucket of their own, and the pass loop below runs
   * for them with empty rule lists: one page load, no rounds, no rejections.
   */
  const auditByPass = new Map<string, ResidualAuditPass>();
  for (const pass of auditPasses) {
    if (!pageById.has(pass.pageId)) continue;
    const key = `${pass.pageId}|${pass.viewportId}`;
    auditByPass.set(key, pass);
    if (!byPass.has(key)) {
      byPass.set(key, {
        pageId: pass.pageId,
        viewportId: pass.viewportId,
        geometry: [],
        banded: [],
        bandGeometry: [],
      });
    }
  }
  /** Every residual the audit measured, before the per-route cut. */
  const detectedResiduals: ResidualFrozenNode[] = [];
  let residualPasses = 0;
  let residualNodesMeasured = 0;
  let residualWidthsRendered = 0;
  let residualWidthsCapped = 0;

  /** Candidates a measurement showed regressing at the truth viewport. */
  const regressed = new Set<RecoveredLayoutRule>();
  /** Banded candidates an in-band (or truth-width) presence measurement rejected. */
  const bandRejected = new Set<RecoveredLayoutRule>();
  /** Candidates no measurement could judge: node absent, page never settled. */
  const unverifiable = new Set<RecoveredLayoutRule>();
  const rejections: TruthCheckRejection[] = [];
  const bandRejections: BandCheckRejection[] = [];
  let rounds = 0;
  let pagesRendered = 0;
  let bandWidthsRendered = 0;
  /** Task 28.75 §03b — extra renders the banded GEOMETRY check needed. */
  let bandGeometryWidthsRendered = 0;
  let bandIndependentlyDiscriminated = 0;
  let bandHiddenByAncestorAtBandWidth = 0;
  let bandExactTierHidesAtBandWidth = 0;
  let bandTruthBaselineNotInLayout = 0;
  let converged = true;
  let acceptedRegressed = 0;
  /** P0 contract C2.1 — rules the interval-sample stage measured regressing. */
  const intervalRejected = new Set<RecoveredLayoutRule>();
  const intervalRejections: IntervalSampleRejection[] = [];
  let intervalSampleCheckable = 0;
  let intervalSamplesRendered = 0;
  let intervalSamplesChecked = 0;
  let unprobedPositions = 0;
  let intervalSampleWidthsCapped = 0;
  let intervalSampleUnverifiedByCap = 0;
  let renderLoadRetries = 0;
  let intervalIsolationRenders = 0;
  let intervalCoRejectionsAvoided = 0;
  let intervalIsolationBudgetFallbacks = 0;
  let truthRecheckRejections = 0;
  const onLoadRetry = (attempt: number, err: unknown): void => {
    renderLoadRetries++;
    log(
      `[layout-truth] page load attempt ${attempt} failed (${
        err instanceof Error ? err.message.split("\n")[0] : String(err)
      }) — retrying`,
    );
  };
  const alive = (rule: RecoveredLayoutRule): boolean =>
    !regressed.has(rule) &&
    !bandRejected.has(rule) &&
    !unverifiable.has(rule) &&
    !intervalRejected.has(rule);

  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch();
  } catch (err) {
    log(
      `[layout-truth] chromium failed to launch (${
        err instanceof Error ? err.message : String(err)
      }) — recovered rules are REJECTED, not shipped unverified`,
    );
    return finish("chromium-unavailable", {
      shipped: [],
      truthCheckable: checkable.length,
      bandCheckable: bandCheckable.length,
      bandGeometryCheckable: bandGeomCheckable.length,
      converged: false,
    });
  }

  try {
    for (const [passKey, pageRules] of [...byPass.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const pageId = pageRules.pageId;
      const viewportId = pageRules.viewportId;
      const runtimePage = pageById.get(pageId)!;
      // Each variant is measured at ITS OWN observed width — the one width where
      // its `truth` rects are an observation rather than an inference.
      const width = runtimePage[viewportId].width;
      const html = truthCheckHtml(runtimePage, input.css, viewportId);
      const geometryRules = pageRules.geometry;
      const bandedRules = pageRules.banded;

      /*
       * Task 28.7 B1 — this pass's audit set. The PARENT of every candidate is
       * measured alongside it, because "the frozen box overflows its own
       * parent" needs the parent's rendered width and it is one more entry in a
       * measurement that is already one round trip.
       */
      const auditPass = auditByPass.get(passKey);
      const auditIds: string[] = [];
      if (auditPass !== undefined) {
        const ids = new Set<string>();
        for (const node of auditPass.nodes) {
          ids.add(node.nodeId);
          if (node.parentNodeId !== undefined) ids.add(node.parentNodeId);
        }
        auditIds.push(...[...ids].sort());
      }
      /** width → the audit set's rendered boxes at that width. */
      const cloneByWidth = new Map<number, Record<string, Rect | null>>();
      const auditPlan =
        auditPass !== undefined && auditIds.length > 0
          ? auditRenderWidths(auditPass.widths, width)
          : { widths: [] as number[], capped: 0 };
      residualWidthsCapped += auditPlan.capped;
      const auditWidthSet = new Set(auditPlan.widths);
      /*
       * P0 contract C2.1 — this pass's interval-sample plan, computed before any
       * render so the truth and band/audit renders that land on a sample width
       * can be KEPT OPEN and reused: one setContent per width per pass, never
       * one per rule. A pass with no sampled rule keeps every page's pre-C2.1
       * lifecycle exactly.
       */
      const intervalSelection = new Map<RecoveredLayoutRule, IntervalSampleSelection>();
      for (const rule of [...geometryRules, ...pageRules.bandGeometry]) {
        if (!hasIntervalSampleEvidence(rule)) continue;
        intervalSelection.set(
          rule,
          selectIntervalSamples(
            rule.samples!.map((sample) => sample.width),
            rule.servedInterval!,
            width,
          ),
        );
      }
      /*
       * P0 contract C2.1 (amended) — a rule is verified at EVERY probe width
       * inside its served interval (positional picks ∪ all), bounded per pass
       * by {@link capIntervalSampleWidths}.
       */
      const passCap = capIntervalSampleWidths(
        [...intervalSelection.values()].flatMap((selection) => selection.widths),
        [...intervalSelection.values()].flatMap(
          (selection) => selection.allProbeWidthsInInterval,
        ),
      );
      intervalSampleWidthsCapped += passCap.capped;
      const intervalWidthPlan = new Set<number>(passCap.widths);
      const verifyWidthsOf = new Map<RecoveredLayoutRule, number[]>();
      for (const [rule, selection] of intervalSelection) {
        verifyWidthsOf.set(
          rule,
          [...new Set([...selection.widths, ...selection.allProbeWidthsInInterval])]
            .filter((sampleWidth) => intervalWidthPlan.has(sampleWidth))
            .sort((a, b) => a - b),
        );
      }
      const keepPagesOpen = intervalSelection.size > 0;
      /** Sample-box node ids every planned rule needs at one width. */
      const plannedSampleIds = (at: number): string[] => {
        const ids = new Set<string>();
        for (const [rule, verifyWidths] of verifyWidthsOf) {
          if (!verifyWidths.includes(at)) continue;
          for (const box of sampleBoxesAt(rule, at)) ids.add(box.nodeId);
        }
        return [...ids];
      };
      /**
       * width → empty-tier sample boxes. Taken the moment a page on a planned
       * width finishes loading, while the candidate tier is still empty, so the
       * baseline costs no extra restyle.
       */
      const baselineByWidth = new Map<number, Record<string, RenderedSampleBox | null>>();
      const openPages = new Map<
        number,
        { page: import("playwright").Page; context: import("playwright").BrowserContext }
      >();
      let truthRendered = false;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      // Deterministic and offline: an absent asset must be absent identically in
      // every round, and nothing here may touch the network. Only remote schemes
      // are aborted — the harness document itself is set in-process.
      await context.route("http://**", (route) => route.abort());
      await context.route("https://**", (route) => route.abort());
      const browserPage = await context.newPage();
      /** Banded rules that survived the truth-width leak test on this page. */
      let survivingBanded: RecoveredLayoutRule[] = [];
      let survivingGeometry: RecoveredLayoutRule[] = [];
      /*
       * Task 28.75 §03b — banded GEOMETRY rules on this pass. They are inactive
       * at the truth width by construction (a rule active there was routed into
       * `geometry` instead), so nothing here can judge them; they are carried to
       * the band-width loop below, which measures them the same way the
       * truth-width rounds measure everything else.
       */
      let survivingBandGeometry: RecoveredLayoutRule[] = pageRules.bandGeometry;
      let truthBaseline: Record<string, Rect | null> | undefined;
      try {
        await setContentWithRetry(browserPage, html, onLoadRetry);
        pagesRendered++;
        if (keepPagesOpen && intervalWidthPlan.has(width)) {
          baselineByWidth.set(
            width,
            await browserPage.evaluate(measureSampleBoxInBrowser, plannedSampleIds(width)),
          );
        }

        // Task 28.6 A5: witnesses are measured alongside their rule's own node.
        const nodeIds = measuredNodeIds(geometryRules);
        const baseline = await browserPage.evaluate(measureInBrowser, nodeIds);
        truthBaseline = baseline;
        const bandBaseline = await browserPage.evaluate(
          measurePresenceInBrowser,
          bandedRules.map((rule) => rule.nodeId),
        );

        // A node the emitted tree does not actually render cannot be measured,
        // so its rule cannot be verified — drop it before the rounds begin.
        for (const rule of geometryRules) {
          if (responsibleBoxes(rule).some((box) => baseline[box.nodeId] == null)) {
            unverifiable.add(rule);
          }
        }
        for (const rule of bandedRules) {
          if (bandBaseline[rule.nodeId] == null) unverifiable.add(rule);
        }
        let activeBanded = bandedRules.filter((rule) => !unverifiable.has(rule));
        let active = geometryRules.filter((rule) => !unverifiable.has(rule));
        let lastRendered: Record<string, Rect | null> = baseline;
        let settled = active.length === 0;
        let pageRounds = 0;

        /*
         * The banded rules are applied ALONGSIDE the geometry candidates in every
         * round, because that is what ships. If a band leaks into the truth
         * viewport it will change the geometry measurements too, which is the
         * honest thing for those measurements to see.
         */
        while (active.length > 0 && pageRounds < MAX_ROUNDS) {
          await browserPage.evaluate(
            applyCandidateCss,
            generateLayoutCss([...active, ...activeBanded]),
          );
          lastRendered = await browserPage.evaluate(
            measureInBrowser,
            measuredNodeIds(active),
          );
          pageRounds++;
          rounds++;

          const regressors: RecoveredLayoutRule[] = [];
          const vanished: RecoveredLayoutRule[] = [];
          for (const rule of active) {
            const boxes = responsibleBoxes(rule);
            if (boxes.some((box) => (lastRendered[box.nodeId] ?? undefined) === undefined)) {
              // The candidate itself made one of its boxes unmeasurable.
              vanished.push(rule);
              continue;
            }
            for (const box of boxes) {
              const rendered = lastRendered[box.nodeId]!;
              const errorWith = errorAgainst(box.observed, rendered);
              const errorWithout = errorAgainst(
                box.observed,
                baseline[box.nodeId] ?? undefined,
              );
              if (
                errorWith > TRUTH_SANITY_TOLERANCE_PX &&
                errorWith > errorWithout + REGRESSION_EPSILON_PX
              ) {
                regressors.push(rule);
                rejections.push({
                  pageId: rule.pageId,
                  nodeId: rule.nodeId,
                  ...(box.witness ? { witnessNodeId: box.nodeId } : {}),
                  kind: rule.kind,
                  observed: box.observed,
                  rendered,
                  baseline: baseline[box.nodeId] ?? { x: NaN, w: NaN },
                  errorWith,
                  errorWithout,
                });
                break;
              }
            }
          }
          if (regressors.length === 0 && vanished.length === 0) {
            settled = true;
            break;
          }
          for (const rule of regressors) regressed.add(rule);
          for (const rule of vanished) unverifiable.add(rule);
          active = active.filter(
            (rule) => !regressed.has(rule) && !unverifiable.has(rule),
          );
          if (active.length === 0) {
            settled = true;
            break;
          }
        }

        if (!settled) {
          // The set is oscillating. Prefer rejection over clever math: drop every
          // remaining truth-checkable candidate on this page rather than ship one
          // whose effect on its own truth viewport was never confirmed. These are
          // unverifiable, not measured regressions, and are counted as such.
          converged = false;
          for (const rule of active) unverifiable.add(rule);
          log(
            `[layout-truth] ${pageId}/${viewportId}: did not settle in ${MAX_ROUNDS} rounds — ` +
              `dropping the remaining ${active.length} candidate rule(s)`,
          );
          active = [];
        }
        survivingGeometry = active;

        /*
         * Task 28.6 R3, measurement 1 of 2 — the band must NOT reach the truth
         * viewport. The probe saw every banded node VISIBLE at the truth width;
         * a band that hides it there contradicts its own evidence, and it is
         * measured in the render that is happening anyway.
         *
         * This is NOT a detector for the R1 off-by-one (V6(b)): an inverted band
         * is inactive at 1440 and active at its verify width, so it passes here
         * and at the in-band render both. See the module docstring.
         */
        if (activeBanded.length > 0) {
          await browserPage.evaluate(
            applyCandidateCss,
            generateLayoutCss([...active, ...activeBanded, ...survivingBandGeometry]),
          );
          const displayWith = await browserPage.evaluate(
            measureOwnDisplayInBrowser,
            activeBanded.map((rule) => rule.nodeId),
          );
          for (const rule of activeBanded) {
            const before = bandBaseline[rule.nodeId];
            const after = displayWith[rule.nodeId];
            if (after == null) {
              unverifiable.add(rule);
              continue;
            }
            /*
             * Task 28.6 V4 — the node was ALREADY out of layout at the truth
             * width with the recovered tier empty. The old test read that as a
             * pass (`before === true` was required to fire), but the band was
             * built from a probe sample that measured this node VISIBLE at the
             * truth width, so the render contradicts the observation and there
             * is nothing here to verify. Rejected and counted, the way every
             * other unverifiable rule in this module is.
             */
            if (before === false) {
              bandTruthBaselineNotInLayout++;
              bandRejected.add(rule);
              bandRejections.push({
                pageId: rule.pageId,
                nodeId: rule.nodeId,
                media: rule.media!,
                reason: "truth-baseline-not-in-layout",
                measuredAtWidth: width,
              });
              continue;
            }
            /*
             * Task 28.6 V1 — the node's OWN computed display, so a band leaking
             * from an ANCESTOR is charged to the ancestor's rule rather than to
             * every rule beneath it.
             */
            if (after === "none") {
              bandRejected.add(rule);
              bandRejections.push({
                pageId: rule.pageId,
                nodeId: rule.nodeId,
                media: rule.media!,
                reason: "hidden-at-truth-width",
                measuredAtWidth: width,
              });
            }
          }
          activeBanded = activeBanded.filter(
            (rule) => !bandRejected.has(rule) && !unverifiable.has(rule),
          );
        }
        survivingBanded = activeBanded;

        // Confirming measurement of exactly the surviving geometry set, with
        // exactly the CSS that will ship — a band rejected just above must not
        // still be applied while the geometry is confirmed.
        if (settled && active.length > 0) {
          await browserPage.evaluate(
            applyCandidateCss,
            generateLayoutCss([...active, ...survivingBanded, ...survivingBandGeometry]),
          );
          const confirmed = await browserPage.evaluate(
            measureInBrowser,
            measuredNodeIds(active),
          );
          for (const rule of active) {
            for (const box of responsibleBoxes(rule)) {
              const errorWith = errorAgainst(box.observed, confirmed[box.nodeId] ?? undefined);
              const errorWithout = errorAgainst(
                box.observed,
                baseline[box.nodeId] ?? undefined,
              );
              if (
                errorWith > TRUTH_SANITY_TOLERANCE_PX &&
                errorWith > errorWithout + REGRESSION_EPSILON_PX
              ) {
                acceptedRegressed++;
                break;
              }
            }
          }
        }

        /*
         * Task 28.7 B1 — the audit's TRUTH-WIDTH sample, taken in the render
         * that is already open and with exactly the stylesheet that will ship.
         * Costs one `evaluate`, not one page load: the truth width is never
         * added to the audit's extra widths for precisely this reason.
         */
        if (auditPass !== undefined && auditIds.length > 0) {
          await browserPage.evaluate(
            applyCandidateCss,
            generateLayoutCss([
              ...survivingGeometry,
              ...survivingBanded,
              ...survivingBandGeometry,
            ]),
          );
          cloneByWidth.set(
            width,
            await browserPage.evaluate(measureInBrowser, auditIds),
          );
        }
        truthRendered = true;
      } catch (err) {
        // A page that could not be rendered verifies nothing. Its candidates are
        // unverifiable, and a broken render must not fail the generation either.
        for (const rule of [...geometryRules, ...bandedRules, ...pageRules.bandGeometry]) {
          if (!regressed.has(rule) && !bandRejected.has(rule)) unverifiable.add(rule);
        }
        survivingGeometry = [];
        survivingBanded = [];
        survivingBandGeometry = [];
        log(
          `[layout-truth] ${pageId}/${viewportId}: render failed (${
            err instanceof Error ? err.message : String(err)
          }) — its ${geometryRules.length + bandedRules.length} candidate rule(s) are ` +
            `REJECTED as unverifiable`,
        );
      } finally {
        if (keepPagesOpen && truthRendered) {
          // P0 contract C2.1 — reused by the interval stage below.
          openPages.set(width, { page: browserPage, context });
        } else {
          await browserPage.close();
          await context.close();
        }
      }

      /*
       * Task 28.6 R3, measurement 2 of 2 — the band must actually hide the node
       * INSIDE its own range.
       *
       * Batched by band width, not by rule: every rule whose band names the same
       * verify-width shares one page load, so a page with 500 banded rules on one
       * band costs one extra render, not 500. The full shipped set is applied, so
       * what is measured is what the stylesheet will do.
       */
      const byBandWidth = new Map<number, RecoveredLayoutRule[]>();
      for (const rule of survivingBanded) {
        const verifyWidth = (rule.band as HiddenBand).verifyWidth;
        const list = byBandWidth.get(verifyWidth);
        if (list) list.push(rule);
        else byBandWidth.set(verifyWidth, [rule]);
      }
      /*
       * Task 28.75 §03b — and the banded GEOMETRY rules, batched the same way.
       * A width that already had a display band to check costs nothing extra;
       * a width that had none adds one render, which is the price of measuring
       * a rule instead of shipping it unmeasured.
       */
      const byGeomBandWidth = new Map<number, RecoveredLayoutRule[]>();
      for (const rule of survivingBandGeometry) {
        const verifyWidth = (rule.band as HiddenBand).verifyWidth;
        const list = byGeomBandWidth.get(verifyWidth);
        if (list) list.push(rule);
        else byGeomBandWidth.set(verifyWidth, [rule]);
      }
      /*
       * TASK 28.7 B1 — ONE WIDTH SET, TWO CONSUMERS.
       *
       * The audit needs the clone rendered at the widths the PROBE measured the
       * source at, and this loop already renders arbitrary widths for the band
       * check. So the two are unioned rather than looped twice: a width the
       * band check was going to render anyway costs the audit nothing, and the
       * audit's own widths are bounded by `auditRenderWidths()`.
       */
      const renderWidths = [
        ...new Set<number>([
          ...byBandWidth.keys(),
          ...byGeomBandWidth.keys(),
          ...auditPlan.widths,
        ]),
      ].sort((a, b) => a - b);
      for (const bandWidth of renderWidths) {
        const group = byBandWidth.get(bandWidth) ?? [];
        const geomGroup = byGeomBandWidth.get(bandWidth) ?? [];
        const auditHere = auditWidthSet.has(bandWidth);
        const bandContext = await browser.newContext({
          viewport: { width: bandWidth, height: 900 },
          deviceScaleFactor: 1,
        });
        await bandContext.route("http://**", (route) => route.abort());
        await bandContext.route("https://**", (route) => route.abort());
        const bandPage = await bandContext.newPage();
        let bandLoaded = false;
        try {
          await setContentWithRetry(bandPage, html, onLoadRetry);
          bandLoaded = true;
          if (keepPagesOpen && intervalWidthPlan.has(bandWidth)) {
            baselineByWidth.set(
              bandWidth,
              await bandPage.evaluate(measureSampleBoxInBrowser, plannedSampleIds(bandWidth)),
            );
          }
          // Counted apart, so "renders the band check needed" stays readable
          // next to "renders the audit added". A shared width increments both.
          if (group.length > 0) bandWidthsRendered++;
          if (geomGroup.length > 0) bandGeometryWidthsRendered++;
          if (auditHere) residualWidthsRendered++;
          const nodeIds = group.map((rule) => rule.nodeId);
          /*
           * Task 28.6 V1 — the two BASELINE facts, taken with the recovered tier
           * EMPTY, so they describe the stylesheet without these rules:
           *
           *   * the node's own computed display, which says whether the exact
           *     computed class is already hiding it at this width (in which case
           *     the band adds nothing and discriminates nothing), and
           *   * whether it is in layout at all, which says whether an ancestor
           *     is doing the hiding — the question the pre-V1 presence test was
           *     accidentally answering for 68.4% of this corpus's banded rules.
           */
          let baselineDisplay: Record<string, string | null> = {};
          /*
           * Task 28.75 §03b — and the GEOMETRY baseline at this width, taken in
           * the same empty-tier render: the boxes as the exact computed class
           * alone would place them. It is the `errorWithout` half of the same
           * accept/reject rule the truth-width rounds use, and without it a rule
           * could be accepted for being merely "close" while making the box
           * worse than doing nothing at all.
           */
          let geomBaseline: Record<string, Rect | null> = {};
          if (group.length > 0 || geomGroup.length > 0) {
            await bandPage.evaluate(applyCandidateCss, "");
            if (group.length > 0) {
              baselineDisplay = await bandPage.evaluate(measureOwnDisplayInBrowser, nodeIds);
            }
            if (geomGroup.length > 0) {
              geomBaseline = await bandPage.evaluate(
                measureInBrowser,
                measuredNodeIds(geomGroup),
              );
            }
          }
          const bandCss = (): string =>
            generateLayoutCss([
              ...survivingGeometry,
              ...survivingBanded,
              ...survivingBandGeometry.filter(
                (rule) => !regressed.has(rule) && !unverifiable.has(rule),
              ),
            ]);
          await bandPage.evaluate(applyCandidateCss, bandCss());
          /*
           * Task 28.7 B1 — the audit sample, with the SHIPPING stylesheet
           * applied, which is what the reader of a residual is being told about.
           */
          if (auditHere) {
            cloneByWidth.set(
              bandWidth,
              await bandPage.evaluate(measureInBrowser, auditIds),
            );
          }
          /*
           * ------------------------------------------------------------------
           * Task 28.75 §03b — THE BANDED GEOMETRY CHECK.
           * ------------------------------------------------------------------
           *
           * The same measurement the truth-width rounds make, at the one width
           * where these rules are active: render, measure every box the rule is
           * responsible for, and REJECT it when its box is both outside the
           * tolerance of the observation AND further from it than the baseline
           * was. A banded track list moves its items and leaves the container's
           * own border box exactly where it was, so `responsibleBoxes()` — the
           * container plus its witnesses — is what carries the verdict, exactly
           * as it does at the truth width.
           *
           * Rejections are charged to `regressed`, so they land in
           * `rejectedByTruthCheck` and inside the `rejectedUnverifiable`
           * subtraction that `finish()` derives. A new accept/reject channel
           * that skipped those would silently unbalance the accounting.
           */
          if (geomGroup.length > 0) {
            let activeGeom = geomGroup.filter((rule) => {
              if (responsibleBoxes(rule).some((box) => geomBaseline[box.nodeId] == null)) {
                // A box the render does not produce cannot be measured, so the
                // rule cannot be verified. Rejected, never shipped blind.
                unverifiable.add(rule);
                return false;
              }
              return true;
            });
            let geomRounds = 0;
            let geomSettled = activeGeom.length === 0;
            while (activeGeom.length > 0 && geomRounds < MAX_ROUNDS) {
              await bandPage.evaluate(applyCandidateCss, bandCss());
              const rendered = await bandPage.evaluate(
                measureInBrowser,
                measuredNodeIds(activeGeom),
              );
              geomRounds++;
              rounds++;
              const geomRegressors: RecoveredLayoutRule[] = [];
              for (const rule of activeGeom) {
                for (const box of responsibleBoxes(rule)) {
                  // P0 contract C2.1 — against the per-width source sample at
                  // this band width when the rule carries one.
                  const expected = expectedAtWidth(rule, box, bandWidth);
                  const errorWith = errorAgainst(expected, rendered[box.nodeId] ?? undefined);
                  const errorWithout = errorAgainst(
                    expected,
                    geomBaseline[box.nodeId] ?? undefined,
                  );
                  if (
                    errorWith > TRUTH_SANITY_TOLERANCE_PX &&
                    errorWith > errorWithout + REGRESSION_EPSILON_PX
                  ) {
                    geomRegressors.push(rule);
                    rejections.push({
                      pageId: rule.pageId,
                      nodeId: rule.nodeId,
                      ...(box.witness ? { witnessNodeId: box.nodeId } : {}),
                      kind: rule.kind,
                      observed: expected,
                      rendered: rendered[box.nodeId] ?? { x: NaN, w: NaN },
                      baseline: geomBaseline[box.nodeId] ?? { x: NaN, w: NaN },
                      errorWith,
                      errorWithout,
                    });
                    break;
                  }
                }
              }
              if (geomRegressors.length === 0) {
                geomSettled = true;
                break;
              }
              for (const rule of geomRegressors) regressed.add(rule);
              activeGeom = activeGeom.filter((rule) => !regressed.has(rule));
            }
            if (!geomSettled) {
              // Oscillating. Prefer rejection over clever math, exactly as the
              // truth-width rounds do.
              converged = false;
              for (const rule of activeGeom) unverifiable.add(rule);
              log(
                `[layout-truth] ${pageId} @${bandWidth}px: banded geometry did not settle ` +
                  `in ${MAX_ROUNDS} rounds — dropping ${activeGeom.length} rule(s)`,
              );
            }
            // The audit's sample for this width, retaken with the settled set.
            if (auditHere) {
              await bandPage.evaluate(applyCandidateCss, bandCss());
              cloneByWidth.set(
                bandWidth,
                await bandPage.evaluate(measureInBrowser, auditIds),
              );
            }
          }
          if (group.length === 0) continue;
          await bandPage.evaluate(applyCandidateCss, bandCss());
          const ownDisplay = await bandPage.evaluate(measureOwnDisplayInBrowser, nodeIds);
          const ancestorHidden = await bandPage.evaluate(
            measureAncestorHiddenInBrowser,
            nodeIds,
          );
          for (const rule of group) {
            const display = ownDisplay[rule.nodeId];
            if (display == null) {
              unverifiable.add(rule);
              continue;
            }
            /*
             * TASK 28.6 D1(b) — READ THESE TWO TOGETHER, NEVER THE FIRST ALONE.
             *
             * `bandIndependentlyDiscriminated` increments for EVERY banded rule
             * whose node is in the document. It is a presence count: a verifier
             * reverted the V1 semantics (the in-band verdict taken from presence
             * again, so an ancestor answers for a descendant) and measured it
             * still equal to `bandCheckable`. On its own it cannot say that
             * anything was discriminated.
             *
             * What discriminates is the node's OWN cascade having something to
             * say at this width, and the counter below is where it does not: the
             * exact computed class was already `none` here with the recovered
             * tier empty, so the band changes nothing and answers nothing.
             * Discriminated = present − already-hidden. On the 28.5B Linear
             * corpus that reads 738 checkable, 738 present, 0 already hidden ⇒
             * 738 discriminated — sound because the third number is 0, and a
             * claim to be restated the moment it is not.
             */
            bandIndependentlyDiscriminated++;
            if (baselineDisplay[rule.nodeId] === "none") {
              bandExactTierHidesAtBandWidth++;
            }
            if (ancestorHidden[rule.nodeId] === true) {
              // The old presence test would have been satisfied here by the
              // ancestor, whatever this rule's own band did.
              bandHiddenByAncestorAtBandWidth++;
            }
            if (display !== "none") {
              // The band did not hide what it claims to hide at a width the probe
              // measured the node HIDDEN at. Whatever it is doing, it is not the
              // rule it says it is. The verdict is the node's OWN computed
              // display, so an ancestor's correct band can no longer answer for
              // a descendant's wrong one (Task 28.6 V1).
              bandRejected.add(rule);
              bandRejections.push({
                pageId: rule.pageId,
                nodeId: rule.nodeId,
                media: rule.media!,
                reason: "not-hidden-in-band",
                measuredAtWidth: bandWidth,
              });
            }
          }
        } catch (err) {
          bandLoaded = false;
          for (const rule of [...group, ...geomGroup]) {
            if (!bandRejected.has(rule) && !regressed.has(rule)) unverifiable.add(rule);
          }
          log(
            `[layout-truth] ${pageId} @${bandWidth}px: in-band render failed (${
              err instanceof Error ? err.message : String(err)
            }) — its ${group.length} banded rule(s) are REJECTED as unverifiable`,
          );
        } finally {
          if (
            keepPagesOpen &&
            bandLoaded &&
            !openPages.has(bandWidth) &&
            (intervalWidthPlan.has(bandWidth) || auditWidthSet.has(bandWidth))
          ) {
            // P0 contract C2.1 — a sample (or audit) width already loaded here
            // is reused by the interval stage instead of being loaded again.
            openPages.set(bandWidth, { page: bandPage, context: bandContext });
          } else {
            await bandPage.close();
            await bandContext.close();
          }
        }
      }

      /*
       * ------------------------------------------------------------------
       * P0 contract C2.1 — THE INTERVAL-SAMPLE STAGE.
       * ------------------------------------------------------------------
       *
       * Every surviving geometry rule that carries per-width source samples is
       * rendered at every probe width inside its served interval (capped per
       * pass) and REJECTED
       * (`interval-sample-regressed`) when, at any of them, its box — or a
       * witness's — is farther than `max(4px, 0.5%·W)` from the source sample
       * AND farther than the empty-tier baseline was, plus 0.5px. A clone box
       * out of layout where the source was visible is an error of +∞.
       *
       * All sampled rules of the pass share each width's page. The shipping set
       * changes when something is rejected, so the widths are swept again until
       * a whole sweep rejects nothing, bounded by {@link MAX_ROUNDS}; a set that
       * never settles is dropped as unverifiable, exactly as the truth rounds do.
       */
      try {
        const aliveSampled = [...intervalSelection.keys()].filter(alive);
        const sampled = aliveSampled.filter((rule) => (verifyWidthsOf.get(rule) ?? []).length > 0);
        intervalSampleUnverifiedByCap += aliveSampled.length - sampled.length;
        intervalSampleCheckable += sampled.length;
        for (const rule of sampled) {
          unprobedPositions += intervalSelection.get(rule)!.unprobed.length;
        }
        if (sampled.length > 0) {
          const widthsOf = (rule: RecoveredLayoutRule): number[] => verifyWidthsOf.get(rule)!;
          const stageWidths = [...new Set(sampled.flatMap(widthsOf))].sort((a, b) => a - b);
          const passRules = new Set<RecoveredLayoutRule>([
            ...geometryRules,
            ...bandedRules,
            ...pageRules.bandGeometry,
          ]);
          // Candidate order, which is the order `finish()` ships them in.
          const stageCss = (): string =>
            generateLayoutCss(candidates.filter((rule) => passRules.has(rule) && alive(rule)));
          const idsFor = (rules: readonly RecoveredLayoutRule[], at: number): string[] => {
            const ids = new Set<string>();
            for (const rule of rules) {
              for (const box of sampleBoxesAt(rule, at)) ids.add(box.nodeId);
            }
            return [...ids];
          };
          let stageChanged = false;
          for (const sampleWidth of stageWidths) {
            const rulesHere = sampled.filter(
              (rule) => alive(rule) && widthsOf(rule).includes(sampleWidth),
            );
            if (rulesHere.length === 0) continue;
            let entry = openPages.get(sampleWidth);
            if (entry === undefined) {
              const sampleContext = await browser.newContext({
                viewport: { width: sampleWidth, height: 900 },
                deviceScaleFactor: 1,
              });
              await sampleContext.route("http://**", (route) => route.abort());
              await sampleContext.route("https://**", (route) => route.abort());
              const samplePage = await sampleContext.newPage();
              openPages.set(sampleWidth, { page: samplePage, context: sampleContext });
              try {
                await setContentWithRetry(samplePage, html, onLoadRetry);
                intervalSamplesRendered++;
                entry = openPages.get(sampleWidth)!;
                baselineByWidth.set(
                  sampleWidth,
                  await samplePage.evaluate(measureSampleBoxInBrowser, plannedSampleIds(sampleWidth)),
                );
              } catch (err) {
                for (const rule of rulesHere) unverifiable.add(rule);
                stageChanged = true;
                openPages.delete(sampleWidth);
                await samplePage.close().catch(() => {});
                await sampleContext.close().catch(() => {});
                log(
                  `[layout-truth] ${pageId}/${viewportId} @${sampleWidth}px: interval-sample ` +
                    `render failed (${err instanceof Error ? err.message : String(err)}) — ` +
                    `${rulesHere.length} rule(s) REJECTED as unverifiable`,
                );
                continue;
              }
            }
            let baseline = baselineByWidth.get(sampleWidth);
            if (baseline === undefined) {
              // Not captured at load (e.g. an open page whose load was not planned).
              await entry.page.evaluate(applyCandidateCss, "");
              baseline = await entry.page.evaluate(
                measureSampleBoxInBrowser,
                plannedSampleIds(sampleWidth),
              );
              baselineByWidth.set(sampleWidth, baseline);
            }
            for (const rule of rulesHere) {
              if (sampleBoxesAt(rule, sampleWidth).some((box) => baseline![box.nodeId] == null)) {
                // A box the emitted tree does not render cannot be judged.
                unverifiable.add(rule);
                stageChanged = true;
              }
            }
          }

          /** Renders `css` at a sample width and returns each judged rule's first regressed box. */
          const judgeAtSample = async (
            sampleWidth: number,
            judged: readonly RecoveredLayoutRule[],
            css: string,
          ): Promise<Map<RecoveredLayoutRule, IntervalSampleRejection>> => {
            const entry = openPages.get(sampleWidth)!;
            const baseline = baselineByWidth.get(sampleWidth)!;
            await entry.page.evaluate(applyCandidateCss, css);
            const rendered = await entry.page.evaluate(
              measureSampleBoxInBrowser,
              idsFor(judged, sampleWidth),
            );
            const failures = new Map<RecoveredLayoutRule, IntervalSampleRejection>();
            for (const rule of judged) {
              for (const box of sampleBoxesAt(rule, sampleWidth)) {
                const errWith = intervalSampleError(box.expected, rendered[box.nodeId]);
                const errWithout = intervalSampleError(box.expected, baseline[box.nodeId]);
                if (errWith === undefined || errWithout === undefined) continue;
                if (!intervalSampleRegressed(errWith, errWithout, sampleWidth)) continue;
                failures.set(rule, {
                  pageId: rule.pageId,
                  viewportId,
                  nodeId: rule.nodeId,
                  ...(box.witness ? { witnessNodeId: box.nodeId } : {}),
                  kind: rule.kind,
                  reason: "interval-sample-regressed",
                  width: sampleWidth,
                  positions: intervalSelection
                    .get(rule)!
                    .probedPositions.filter((entry) => entry.width === sampleWidth)
                    .map((entry) => entry.position),
                  expected: { x: box.expected.x, w: box.expected.w },
                  rendered: rendered[box.nodeId] ?? null,
                  baseline: baseline[box.nodeId] ?? null,
                  errWith,
                  errWithout,
                  tolerancePx: intervalSampleTolerancePx(sampleWidth),
                });
                break;
              }
            }
            return failures;
          };
          /*
           * RECI2 fix (a) — bisect a sweep's regressors. Each half is rendered with
           * the stage MINUS every other regressor; a half that no longer fails
           * keeps its rules alive (their error came from someone else) and the
           * next sweep re-judges them against the smaller set. When no half fails
           * on its own the failure is genuinely joint and the whole group is
           * rejected, as before. Over budget, the group is rejected jointly.
           */
          let isolationRendersThisPass = 0;
          const isolate = async (
            sampleWidth: number,
            regressors: ReadonlySet<RecoveredLayoutRule>,
            group: readonly RecoveredLayoutRule[],
            groupFailures: Map<RecoveredLayoutRule, IntervalSampleRejection>,
          ): Promise<Map<RecoveredLayoutRule, IntervalSampleRejection>> => {
            if (group.length <= 1) return groupFailures;
            const mid = Math.ceil(group.length / 2);
            const kept = new Map<RecoveredLayoutRule, IntervalSampleRejection>();
            for (const half of [group.slice(0, mid), group.slice(mid)]) {
              const halfFailing = half.filter((rule) => groupFailures.has(rule));
              if (halfFailing.length === 0) continue;
              if (isolationRendersThisPass >= INTERVAL_ISOLATION_RENDER_BUDGET) {
                // Review-VF MINOR — counted: the stage falls back to joint rejection here.
                intervalIsolationBudgetFallbacks++;
                return groupFailures;
              }
              isolationRendersThisPass++;
              intervalIsolationRenders++;
              const halfSet = new Set(half);
              const css = generateLayoutCss(
                candidates.filter(
                  (rule) =>
                    passRules.has(rule) &&
                    alive(rule) &&
                    (!regressors.has(rule) || halfSet.has(rule)),
                ),
              );
              const failures = await judgeAtSample(sampleWidth, halfFailing, css);
              if (failures.size === 0) continue;
              for (const [rule, record] of await isolate(sampleWidth, regressors, halfFailing, failures)) {
                kept.set(rule, record);
              }
            }
            return kept.size === 0 ? groupFailures : kept;
          };

          const truthRecheck = async (): Promise<number> => {
            /*
             * RECI2 fix (a) — the truth-width verdict was taken with rules the
             * interval stage has since removed. Re-measure the surviving geometry
             * rules at the truth width with exactly the stage stylesheet; a rule
             * that now regresses against its observation is rejected.
             */
            const truthEntry = openPages.get(width);
            if (truthEntry === undefined || truthBaseline === undefined) return 0;
            const live = geometryRules.filter(alive);
            if (live.length === 0) return 0;
            await truthEntry.page.evaluate(applyCandidateCss, stageCss());
            const confirmed = await truthEntry.page.evaluate(measureInBrowser, measuredNodeIds(live));
            let removed = 0;
            for (const rule of live) {
              for (const box of responsibleBoxes(rule)) {
                const rendered = confirmed[box.nodeId] ?? undefined;
                const errorWith = errorAgainst(box.observed, rendered);
                const errorWithout = errorAgainst(box.observed, truthBaseline[box.nodeId] ?? undefined);
                if (errorWith > TRUTH_SANITY_TOLERANCE_PX && errorWith > errorWithout + REGRESSION_EPSILON_PX) {
                  if (rendered === undefined) {
                    unverifiable.add(rule);
                  } else {
                    regressed.add(rule);
                    rejections.push({
                      pageId: rule.pageId,
                      nodeId: rule.nodeId,
                      ...(box.witness ? { witnessNodeId: box.nodeId } : {}),
                      kind: rule.kind,
                      observed: box.observed,
                      rendered,
                      baseline: truthBaseline[box.nodeId] ?? { x: NaN, w: NaN },
                      errorWith,
                      errorWithout,
                    });
                  }
                  truthRecheckRejections++;
                  removed++;
                  break;
                }
              }
            }
            return removed;
          };

          let sweeps = 0;
          let stageSettled = false;
          const sweepLimit = INTERVAL_ISOLATED_SWEEPS + MAX_ROUNDS;
          while (sweeps < sweepLimit) {
            sweeps++;
            const isolating = sweeps <= INTERVAL_ISOLATED_SWEEPS;
            let rejectedThisSweep = 0;
            for (const sampleWidth of stageWidths) {
              const entry = openPages.get(sampleWidth);
              const baseline = baselineByWidth.get(sampleWidth);
              if (entry === undefined || baseline === undefined) continue;
              const rulesHere = sampled.filter(
                (rule) => alive(rule) && widthsOf(rule).includes(sampleWidth),
              );
              if (rulesHere.length === 0) continue;
              if (sweeps === 1) intervalSamplesChecked += rulesHere.length;
              const joint = await judgeAtSample(sampleWidth, rulesHere, stageCss());
              if (joint.size === 0) continue;
              const rejectedHere = isolating
                ? await isolate(sampleWidth, new Set(joint.keys()), [...joint.keys()], joint)
                : joint;
              intervalCoRejectionsAvoided += joint.size - rejectedHere.size;
              for (const [rule, record] of rejectedHere) {
                intervalRejected.add(rule);
                intervalRejections.push(record);
              }
              rejectedThisSweep += rejectedHere.size;
            }
            if (rejectedThisSweep === 0) {
              // Removals can change what the truth width renders: re-check it,
              // and sweep again if that removed anything.
              if (stageChanged && (await truthRecheck()) > 0) continue;
              stageSettled = true;
              break;
            }
            stageChanged = true;
          }
          if (!stageSettled) {
            converged = false;
            const remaining = sampled.filter(alive);
            for (const rule of remaining) unverifiable.add(rule);
            log(
              `[layout-truth] ${pageId}/${viewportId}: interval samples did not settle in ` +
              `${sweepLimit} sweeps — dropping the remaining ${remaining.length} sampled rule(s)`,
            );
            // Review-VF MINOR — the sample-less survivors' truth verdict was taken
            // with the dropped rules applied: re-check them until nothing moves.
            let recheckRemoved = 1;
            for (let pass = 0; pass < MAX_ROUNDS && recheckRemoved > 0; pass++) {
              recheckRemoved = await truthRecheck();
            }
            if (recheckRemoved > 0) {
              const unsettledGeometry = geometryRules.filter(alive);
              for (const rule of unsettledGeometry) unverifiable.add(rule);
              log(
                `[layout-truth] ${pageId}/${viewportId}: truth re-check did not settle — ` +
                  `dropping ${unsettledGeometry.length} geometry rule(s) as unverifiable`,
              );
            }
          }

          /*
           * Task 28.7 B1 stays REPORT ONLY; this only keeps it describing the
           * stylesheet that ships. When the stage changed the set, the audit's
           * samples at every width still open here are retaken with the final
           * CSS. Nothing below touches a rule's fate.
           */
          if (stageChanged && auditPass !== undefined && auditIds.length > 0) {
            for (const [openWidth, entry] of [...openPages.entries()].sort(([a], [b]) => a - b)) {
              if (openWidth !== width && !auditWidthSet.has(openWidth)) continue;
              if (!cloneByWidth.has(openWidth)) continue;
              await entry.page.evaluate(applyCandidateCss, stageCss());
              cloneByWidth.set(openWidth, await entry.page.evaluate(measureInBrowser, auditIds));
            }
          }
        }
      } catch (err) {
        for (const rule of [...intervalSelection.keys()].filter(alive)) unverifiable.add(rule);
        log(
          `[layout-truth] ${pageId}/${viewportId}: interval-sample stage failed (${
            err instanceof Error ? err.message : String(err)
          }) — its sampled rule(s) are REJECTED as unverifiable`,
        );
      } finally {
        for (const entry of openPages.values()) {
          await entry.page.close().catch(() => {});
          await entry.context.close().catch(() => {});
        }
        openPages.clear();
      }

      /*
       * Task 28.7 B1 — both halves are in hand for this pass, so subtract them.
       * REPORT ONLY: this appends to `detectedResiduals` and touches none of
       * `regressed` / `bandRejected` / `unverifiable`, so no rule's fate — and
       * no counter derived from those sets — depends on anything measured here.
       */
      if (auditPass !== undefined && cloneByWidth.size >= 2) {
        residualPasses++;
        residualNodesMeasured += auditPass.nodes.length;
        detectedResiduals.push(...residualsForPass(auditPass, cloneByWidth));
      }
    }
  } finally {
    await browser.close();
  }

  const survivors = [...checkable, ...bandCheckable, ...bandGeomCheckable].filter(
    (rule) =>
      !regressed.has(rule) &&
      !bandRejected.has(rule) &&
      !unverifiable.has(rule) &&
      !intervalRejected.has(rule),
  );
  const summary = summariseResiduals(detectedResiduals);
  const residual: ResidualAuditReport = {
    status: auditPasses.length === 0 ? "no-candidates" : "performed",
    passes: residualPasses,
    nodesMeasured: residualNodesMeasured,
    nodesOmitted: input.residualAuditNodesOmitted ?? 0,
    widthsRendered: residualWidthsRendered,
    widthsCapped: residualWidthsCapped,
    ...summary,
  };
  return finish(checkable.length === 0 && bandGeomCheckable.length === 0
    ? "responsive-hidden-only"
    : "verified", {
    residual,
    shipped: survivors,
    truthCheckable: checkable.length,
    bandCheckable: bandCheckable.length,
    bandGeometryCheckable: bandGeomCheckable.length,
    bandGeometryWidthsRendered,
    rejectedByTruthCheck: regressed.size,
    rejectedByBandCheck: bandRejected.size,
    rejections,
    bandRejections,
    acceptedRegressed,
    rounds,
    pagesRendered,
    bandWidthsRendered,
    bandIndependentlyDiscriminated,
    bandHiddenByAncestorAtBandWidth,
    bandExactTierHidesAtBandWidth,
    bandTruthBaselineNotInLayout,
    converged,
    intervalSampleCheckable,
    intervalSamplesRendered,
    intervalSamplesChecked,
    rejectedAtIntervalSample: intervalRejected.size,
    unprobedPositions,
    intervalSampleWidthsCapped,
    intervalSampleUnverifiedByCap,
    renderLoadRetries,
    intervalIsolationRenders,
    intervalCoRejectionsAvoided,
    truthRecheckRejections,
    intervalIsolationBudgetFallbacks,
    intervalRejections,
  });
}

// ===========================================================================
// Responsive Core P0 §C2.4 / §C2.5 (REC-I2) — PHASE B: OWNERSHIP PLAN GROUPS.
// ===========================================================================

/**
 * Phase A ({@link verifyLayoutRules}) verifies every non-owned rule and yields
 * the accepted set M. Phase B verifies each node's width-family ownership plan
 * (all its `responsive-owned` pieces) as ONE group, in OVERLAY form: base CSS +
 * M + the group's rules appended after M. Every piece restates all six
 * width-family properties explicitly and the pieces tile the served interval,
 * so for the owner node the overlay form is geometrically the owned form (the
 * split token and dropped M declarations are overridden at every served width);
 * {@link confirmOwnedForm} re-checks that claim on the real owned output.
 *
 * A group is ACCEPTED iff, against B = M + groups accepted so far:
 *  - at its truth width, its node box is within 4px of the observed truth rect;
 *  - at every verification width (all probe widths inside the served interval,
 *    per-pass cap {@link INTERVAL_SAMPLE_MAX_WIDTHS_PER_PASS}) where the source
 *    node was visible: `err ≤ max(4px, 0.5%·W)` OR `err ≤ errBaseline + 0.5px`;
 *  - CO-DAMAGE guard (review fix MAJOR-2): no WITNESS carrying a source sample
 *    there gets worse than its B-baseline by more than `max(4px, 0.5%·W)`.
 *    Witnesses are the owner's element children, its parent, its element
 *    siblings, and every node carrying a phase-A accepted rule (with samples)
 *    inside the parent's subtree; and no group already in B stops passing its
 *    own predicate (judged against B).
 *
 * ISOLATION (settle by partition). A batch of pending groups (document order,
 * ancestors first) is rendered once per width as B + batch. If nothing fails,
 * the whole batch joins B. Otherwise it is split, each part strictly smaller,
 * and the parts are settled in turn against the B their predecessors left:
 *  - some groups fail their OWN predicate, some do not → failers first, then
 *    the rest (a group that only failed because a passer moved it is judged
 *    before that passer joins B);
 *  - otherwise (every group fails, or the damage is to a witness or an accepted
 *    group and cannot be attributed) → halved in document order.
 * A singleton that still fails is rejected: a group is only ever rejected when
 * rendered by itself on top of groups that were themselves accepted — never for
 * another pending group's error.
 *
 * BUDGET (review fix MAJOR-4). Every render is one (set × width) page restyle.
 * A page × viewport pass may spend at most {@link OWNERSHIP_RENDER_BUDGET_PER_PASS}
 * of them; groups still unsettled when it runs out are rejected
 * `render-budget`. Recursion depth is bounded by {@link MAX_OWNERSHIP_ROUNDS}
 * (`non-convergence`).
 */
export const MAX_OWNERSHIP_ROUNDS = 24;
/**
 * Review fix (MAJOR-4) — (set × width) renders one page × viewport pass of
 * phase B may spend, including its baseline and final joint renders. 2,000 is
 * about 3× what a fully-joint pass of the P0 apartmentary capture needs
 * (≤ 17 widths × (baseline + a few batches + joint)) and bounds the
 * pathological all-halving path to roughly a minute per pass on that corpus
 * (≈ 25 ms per restyle + measure).
 */
export const OWNERSHIP_RENDER_BUDGET_PER_PASS = 2000;
/**
 * RECI2 root-cause note (budget) — a flat 2,000 renders is ~180 set measures at
 * 11 widths: on apartmentary p000005/mobile (626 groups × 11 widths) it ran out
 * after judging 240 groups (223 accepted) and rejected the other 386 UNJUDGED.
 * The default per-pass budget therefore scales with the pass: at least
 * {@link OWNERSHIP_RENDER_BUDGET_PER_PASS}, else
 * {@link OWNERSHIP_RENDERS_PER_GROUP_WIDTH} × groups × widths, capped at
 * {@link OWNERSHIP_RENDER_BUDGET_CEILING} (≈ 3.5 min at 25 ms). An explicit
 * `renderBudgetPerPass` is used verbatim.
 */
export const OWNERSHIP_RENDERS_PER_GROUP_WIDTH = 2;
export const OWNERSHIP_RENDER_BUDGET_CEILING = 8000;
export function ownershipRenderBudgetForPass(groups: number, widths: number): number {
  return Math.max(
    OWNERSHIP_RENDER_BUDGET_PER_PASS,
    Math.min(OWNERSHIP_RENDER_BUDGET_CEILING, OWNERSHIP_RENDERS_PER_GROUP_WIDTH * groups * widths),
  );
}
/** Truth-width acceptance for an owned group (strict: no baseline escape). */
export const OWNED_TRUTH_TOLERANCE_PX = 4;
/** Owned form vs overlay form agreement required by {@link confirmOwnedForm}. */
export const OWNED_FORM_TOLERANCE_PX = 0.5;

export type OwnedGroupRejectionReason =
  | "truth"
  | "interval-sample"
  | "co-damage"
  | "non-convergence"
  | "render-budget"
  | "unverifiable"
  | "verification-disabled"
  | "joint-regression"
  | "owned-form-mismatch"
  | "rollback-exhausted";

export interface OwnedGroupRejection {
  planGroup: string;
  pageId: string;
  viewportId: LayoutViewportId;
  nodeId: string;
  reason: OwnedGroupRejectionReason;
  width?: number;
  /** The box that failed (the node itself, a child/witness for co-damage). */
  failedNodeId?: string;
  errWith?: number;
  errBaseline?: number;
  tolerancePx?: number;
}

export interface OwnedGroupVerificationInput {
  offers: readonly OwnedPlanOffer[];
  /** Every `responsive-owned` rule (all groups). */
  groupRules: readonly RecoveredLayoutRule[];
  /** Phase A's accepted rules (M). */
  acceptedRules: readonly RecoveredLayoutRule[];
  pages: readonly RuntimePage[];
  /** Globals + base stylesheet, exactly as phase A rendered it. */
  css: string;
  enabled?: boolean;
  onLog?: (message: string) => void;
  /** Test hook — overrides {@link OWNERSHIP_RENDER_BUDGET_PER_PASS}. */
  renderBudgetPerPass?: number;
}

export interface OwnedGroupVerificationResult {
  acceptedGroups: string[];
  rejections: OwnedGroupRejection[];
  rejectedBy: Record<string, number>;
  /** planGroup → width → the node box in the FINAL overlay state (B_final). */
  overlayBoxes: Map<string, Map<number, RenderedSampleBox | null>>;
  /** Accepted groups failing their own predicate in the final joint state against M alone. */
  jointRegressedGroups: string[];
  counters: {
    groupsVerified: number;
    widthsRendered: number;
    widthsCapped: number;
    rounds: number;
    isolatedRenders: number;
    converged: boolean;
    /** Accepted groups failing the criteria in the final joint state (see {@link jointRegressedGroups}). */
    acceptedJointRegressions: number;
    /** (set × width) renders spent across all passes. */
    renders: number;
    /** Groups rejected `render-budget`. */
    renderBudgetRejections: number;
    /** Pass-level witnesses (parent, siblings, phase-A rule nodes) guarded. */
    witnessesGuarded: number;
    /** RECI2 fix (budget) — set renders spent judging all-failing batches as independent sets. */
    independentSetRenders: number;
    /** Review-VF MINOR — page loads retried in phase B. */
    renderLoadRetries: number;
  };
  elapsedMs: number;
}

type BoxMap = Record<string, RenderedSampleBox | null>;
type OwnedFailure = Omit<OwnedGroupRejection, "planGroup" | "pageId" | "viewportId" | "nodeId">;
type SampledWitness = { nodeId: string; samples: IntervalSample[] };

/** Pre-order document position of every runtime element (ancestors first). */
function runtimeDocumentOrder(doc: RuntimeElementNode): Map<string, number> {
  const order = new Map<string, number>();
  const stack: RuntimeElementNode[] = [doc];
  while (stack.length > 0) {
    const current = stack.pop()!;
    order.set(current.n, order.size);
    const children = (current.c ?? []).filter((c): c is RuntimeElementNode => c.k === "e");
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return order;
}

/** Runtime element → its element parent. */
function runtimeParents(doc: RuntimeElementNode): Map<string, string> {
  const parents = new Map<string, string>();
  const stack: RuntimeElementNode[] = [doc];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of current.c ?? []) {
      if (child.k !== "e") continue;
      parents.set(child.n, current.n);
      stack.push(child);
    }
  }
  return parents;
}

/** A witness box got worse than its baseline by more than the width tolerance. */
function witnessDamageAt(
  witness: SampledWitness,
  width: number,
  withGroup: BoxMap,
  baseline: BoxMap,
): OwnedFailure | undefined {
  const sample = witness.samples.find((entry) => entry.width === width);
  if (sample === undefined) return undefined;
  if (baseline[witness.nodeId] == null) return undefined; // not rendered by the clone at all: nothing to guard
  const errWith = intervalSampleError(sample, withGroup[witness.nodeId]);
  const errBaseline = intervalSampleError(sample, baseline[witness.nodeId]);
  if (errWith === undefined || errBaseline === undefined) return undefined;
  const tolerance = intervalSampleTolerancePx(width);
  if (errWith > errBaseline + tolerance) {
    return { reason: "co-damage", width, failedNodeId: witness.nodeId, errWith, errBaseline, tolerancePx: tolerance };
  }
  return undefined;
}

/**
 * Review-VF MAJOR-1 — the witnesses of every group of one page × viewport pass:
 * its parent and element siblings (carried by the offer) plus every node with a
 * phase-A rule with samples inside the parent's subtree. Only the group's OWN
 * node and children are removed here. Offered nodes are NOT removed: whether a
 * witness is governed by an owner's own predicate depends on which groups end
 * up owned, so that is decided per judgement by {@link ownedIdsOf}.
 */
function passOwnedWitnesses(
  offers: readonly OwnedPlanOffer[],
  mRules: readonly RecoveredLayoutRule[],
  parents: ReadonlyMap<string, string>,
): Map<string, SampledWitness[]> {
  const ruleWitnessesByAncestor = new Map<string, SampledWitness[]>();
  const ruleWitnessSeen = new Set<string>();
  for (const rule of mRules) {
    if (rule.samples === undefined || rule.samples.length === 0 || ruleWitnessSeen.has(rule.nodeId)) continue;
    ruleWitnessSeen.add(rule.nodeId);
    const witness: SampledWitness = { nodeId: rule.nodeId, samples: rule.samples };
    let ancestor = parents.get(rule.nodeId);
    while (ancestor !== undefined) {
      const list = ruleWitnessesByAncestor.get(ancestor);
      if (list) list.push(witness);
      else ruleWitnessesByAncestor.set(ancestor, [witness]);
      ancestor = parents.get(ancestor);
    }
  }
  const witnessesOf = new Map<string, SampledWitness[]>();
  for (const offer of offers) {
    const byId = new Map<string, SampledWitness>();
    for (const witness of offer.witnesses ?? []) byId.set(witness.nodeId, witness);
    const parentId = offer.parentNodeId ?? parents.get(offer.nodeId);
    if (parentId !== undefined) {
      for (const witness of ruleWitnessesByAncestor.get(parentId) ?? []) {
        if (!byId.has(witness.nodeId)) byId.set(witness.nodeId, witness);
      }
    }
    for (const id of [offer.nodeId, ...offer.children.map((child) => child.nodeId)]) byId.delete(id);
    witnessesOf.set(offer.planGroup, [...byId.values()]);
  }
  return witnessesOf;
}

/** Nodes an owned set's OWN predicates govern: each owner node and its children. */
function ownedIdsOf(groups: readonly OwnedPlanOffer[]): Set<string> {
  const ids = new Set<string>();
  for (const offer of groups) {
    ids.add(offer.nodeId);
    for (const child of offer.children) ids.add(child.nodeId);
  }
  return ids;
}

/**
 * Damage to any witness of `groups` that is NOT governed by an owner of
 * `groups` (a rejected or still-pending offer is guarded like any other node).
 * `perGroup` returns the first failure for EACH group instead of the first overall.
 */
function ownedWitnessDamage(
  groups: readonly OwnedPlanOffer[],
  witnessesOf: ReadonlyMap<string, readonly SampledWitness[]>,
  widths: readonly number[],
  withBy: ReadonlyMap<number, BoxMap>,
  baseBy: ReadonlyMap<number, BoxMap>,
): Map<string, OwnedFailure> {
  const governed = ownedIdsOf(groups);
  const failures = new Map<string, OwnedFailure>();
  const verdict = new Map<string, OwnedFailure | null>();
  for (const offer of groups) {
    for (const witness of witnessesOf.get(offer.planGroup) ?? []) {
      if (governed.has(witness.nodeId)) continue;
      let damage = verdict.get(witness.nodeId);
      if (damage === undefined) {
        damage = null;
        for (const width of widths) {
          const withAt = withBy.get(width);
          const baseAt = baseBy.get(width);
          if (withAt === undefined || baseAt === undefined) continue;
          const found = witnessDamageAt(witness, width, withAt, baseAt);
          if (found !== undefined) {
            damage = found;
            break;
          }
        }
        verdict.set(witness.nodeId, damage);
      }
      if (damage !== null) {
        failures.set(offer.planGroup, damage);
        break;
      }
    }
  }
  return failures;
}

/**
 * The accept predicate for one group at one width. `undefined` = passes.
 * Checks the owner's own box, its children and (unless `includeWitnesses` is
 * false) the offer's own witnesses (parent, element siblings).
 */
export function judgeOwnedGroupAtWidth(
  offer: OwnedPlanOffer,
  width: number,
  withGroup: BoxMap,
  baseline: BoxMap,
  options: { includeWitnesses?: boolean } = {},
): OwnedFailure | undefined {
  const own = withGroup[offer.nodeId];
  if (width === offer.truthWidth) {
    const err =
      own == null || !own.l
        ? Number.POSITIVE_INFINITY
        : Math.max(Math.abs(own.x - offer.truth.x), Math.abs(own.w - offer.truth.w));
    if (err > OWNED_TRUTH_TOLERANCE_PX) {
      return {
        reason: "truth",
        width,
        failedNodeId: offer.nodeId,
        errWith: err,
        tolerancePx: OWNED_TRUTH_TOLERANCE_PX,
      };
    }
  }
  const tolerance = intervalSampleTolerancePx(width);
  const sample = offer.samples.find((entry) => entry.width === width);
  if (sample !== undefined) {
    const errWith = intervalSampleError(sample, own);
    const errBaseline = intervalSampleError(sample, baseline[offer.nodeId]);
    if (
      errWith !== undefined &&
      errBaseline !== undefined &&
      errWith > tolerance &&
      errWith > errBaseline + REGRESSION_EPSILON_PX
    ) {
      return { reason: "interval-sample", width, failedNodeId: offer.nodeId, errWith, errBaseline, tolerancePx: tolerance };
    }
  }
  for (const child of offer.children) {
    const damage = witnessDamageAt(child, width, withGroup, baseline);
    if (damage !== undefined) return damage;
  }
  if (options.includeWitnesses !== false) {
    for (const witness of offer.witnesses ?? []) {
      const damage = witnessDamageAt(witness, width, withGroup, baseline);
      if (damage !== undefined) return damage;
    }
  }
  return undefined;
}

export async function verifyOwnedPlanGroups(
  input: OwnedGroupVerificationInput,
): Promise<OwnedGroupVerificationResult> {
  const started = Date.now();
  const log = input.onLog ?? ((): void => {});
  const budgetFor = (groups: number, widthCount: number): number =>
    input.renderBudgetPerPass ?? ownershipRenderBudgetForPass(groups, widthCount);
  const rejections: OwnedGroupRejection[] = [];
  const accepted = new Set<string>();
  const overlayBoxes = new Map<string, Map<number, RenderedSampleBox | null>>();
  const jointRegressed = new Set<string>();
  const counters: OwnedGroupVerificationResult["counters"] = {
    groupsVerified: 0,
    widthsRendered: 0,
    widthsCapped: 0,
    rounds: 0,
    isolatedRenders: 0,
    converged: true,
    acceptedJointRegressions: 0,
    renders: 0,
    renderBudgetRejections: 0,
    witnessesGuarded: 0,
    independentSetRenders: 0,
    renderLoadRetries: 0,
  };
  const offers = [...input.offers].sort((a, b) => a.planGroup.localeCompare(b.planGroup));
  const reject = (offer: OwnedPlanOffer, detail: OwnedFailure): void => {
    rejections.push({
      planGroup: offer.planGroup,
      pageId: offer.pageId,
      viewportId: offer.viewportId,
      nodeId: offer.nodeId,
      ...detail,
    });
  };
  const finish = (): OwnedGroupVerificationResult => {
    const rejectedBy: Record<string, number> = {};
    for (const rejection of rejections) {
      rejectedBy[rejection.reason] = (rejectedBy[rejection.reason] ?? 0) + 1;
    }
    return {
      acceptedGroups: offers.filter((offer) => accepted.has(offer.planGroup)).map((offer) => offer.planGroup),
      rejections,
      rejectedBy: Object.fromEntries(Object.entries(rejectedBy).sort(([a], [b]) => a.localeCompare(b))),
      overlayBoxes,
      jointRegressedGroups: offers.filter((offer) => jointRegressed.has(offer.planGroup)).map((offer) => offer.planGroup),
      counters,
      elapsedMs: Date.now() - started,
    };
  };
  if (offers.length === 0) return finish();
  counters.groupsVerified = offers.length;
  if (input.enabled === false) {
    for (const offer of offers) reject(offer, { reason: "verification-disabled" });
    return finish();
  }

  const rulesByGroup = new Map<string, RecoveredLayoutRule[]>();
  for (const rule of input.groupRules) {
    if (rule.planGroup === undefined) continue;
    const list = rulesByGroup.get(rule.planGroup);
    if (list) list.push(rule);
    else rulesByGroup.set(rule.planGroup, [rule]);
  }
  const pageById = new Map(input.pages.map((page) => [page.pageId, page]));

  let browser: import("playwright").Browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch (err) {
    log(`[layout-ownership] chromium unavailable (${err instanceof Error ? err.message : String(err)}) — plans REJECTED`);
    for (const offer of offers) reject(offer, { reason: "unverifiable" });
    counters.converged = false;
    return finish();
  }

  const passes = new Map<string, OwnedPlanOffer[]>();
  for (const offer of offers) {
    const key = `${offer.pageId}|${offer.viewportId}`;
    const list = passes.get(key);
    if (list) list.push(offer);
    else passes.set(key, [offer]);
  }

  try {
    for (const [passKey, passOffers] of [...passes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const first = passOffers[0]!;
      const runtimePage = pageById.get(first.pageId);
      const usable = passOffers.filter((offer) => {
        if (runtimePage === undefined || !rulesByGroup.has(offer.planGroup)) {
          reject(offer, { reason: "unverifiable" });
          return false;
        }
        return true;
      });
      if (runtimePage === undefined || usable.length === 0) continue;
      const doc = runtimePage[first.viewportId].doc;
      const order = runtimeDocumentOrder(doc);
      const parents = runtimeParents(doc);

      // --- widths -----------------------------------------------------------
      const positional: number[] = [];
      const all: number[] = [];
      for (const offer of usable) {
        const probeWidths = offer.samples.map((sample) => sample.width);
        const selection = selectIntervalSamples(probeWidths, offer.servedInterval, offer.truthWidth);
        positional.push(...selection.widths, offer.truthWidth);
        all.push(...selection.allProbeWidthsInInterval);
      }
      const cap = capIntervalSampleWidths(positional, all);
      counters.widthsCapped += cap.capped;
      const widths = [...new Set([...cap.widths, ...usable.map((offer) => offer.truthWidth)])].sort((a, b) => a - b);

      const mRules = input.acceptedRules.filter(
        (rule) => rule.pageId === first.pageId && (rule.viewportId ?? "desktop") === first.viewportId,
      );
      const mCss = generateLayoutCss(mRules);
      const cssFor = (groups: readonly OwnedPlanOffer[]): string => {
        const rules = groups.flatMap((offer) => rulesByGroup.get(offer.planGroup) ?? []);
        return rules.length === 0 ? mCss : `${mCss}\n${generateLayoutCss(rules)}`;
      };

      /*
       * Review fix (MAJOR-2) — pass-level witnesses. Per group: its parent and
       * element siblings (carried by the offer) plus every node carrying a
       * phase-A accepted rule with samples inside the parent's subtree. A
       * witness is skipped only while an owner of the judged set governs it
       * (review-VF MAJOR-1): a rejected or pending offer stays guarded.
       */
      const witnessesOf = passOwnedWitnesses(usable, mRules, parents);
      const passWitnessIds = new Set([...witnessesOf.values()].flatMap((list) => list.map((witness) => witness.nodeId)));
      counters.witnessesGuarded += passWitnessIds.size;
      const witnessDamage = (
        groups: readonly OwnedPlanOffer[],
        withBy: Map<number, BoxMap>,
        baseBy: Map<number, BoxMap>,
      ): OwnedFailure | undefined =>
        ownedWitnessDamage(groups, witnessesOf, widths, withBy, baseBy).values().next().value;

      const ids = [
        ...new Set([
          ...usable.flatMap((offer) => [offer.nodeId, ...offer.children.map((c) => c.nodeId)]),
          ...passWitnessIds,
        ]),
      ];
      const html = truthCheckHtml(runtimePage, input.css, first.viewportId);
      const open = new Map<number, { page: import("playwright").Page; context: import("playwright").BrowserContext }>();
      let passRenders = 0;
      const measureSet = async (groups: readonly OwnedPlanOffer[]): Promise<Map<number, BoxMap>> => {
        const out = new Map<number, BoxMap>();
        const css = cssFor(groups);
        for (const width of widths) {
          const entry = open.get(width)!;
          await entry.page.evaluate(applyCandidateCss, css);
          out.set(width, await entry.page.evaluate(measureSampleBoxInBrowser, ids));
          passRenders++;
          counters.renders++;
        }
        return out;
      };
      const ownFailure = (
        offer: OwnedPlanOffer,
        withBy: Map<number, BoxMap>,
        baseBy: Map<number, BoxMap>,
      ): OwnedFailure | undefined => {
        for (const width of widths) {
          const failure = judgeOwnedGroupAtWidth(offer, width, withBy.get(width)!, baseBy.get(width)!, {
            includeWitnesses: false,
          });
          if (failure !== undefined) return failure;
        }
        return undefined;
      };
      try {
        for (const width of widths) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
          await context.route("http://**", (route) => route.abort());
          await context.route("https://**", (route) => route.abort());
          const page = await context.newPage();
          open.set(width, { page, context });
          await setContentWithRetry(page, html, () => {
            counters.renderLoadRetries++;
          });
          counters.widthsRendered++;
        }

        const base: OwnedPlanOffer[] = [];
        const ordered = [...usable].sort((a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0));
        let baselineBy = await measureSet(base);
        const mOnlyBy = baselineBy;
        /** Reserve for the final joint render. */
        const reserve = widths.length;
        const budgetPerPass = budgetFor(ordered.length, widths.length);
        let unsettled = 0;
        let budgetRejected = 0;
        /** Damage the batch does to a group already in B (own predicate against B). */
        const damageToAccepted = (withBy: Map<number, BoxMap>): OwnedFailure | undefined => {
          for (const owner of base) {
            const failure = ownFailure(owner, withBy, baselineBy);
            if (failure !== undefined) return { ...failure, reason: "co-damage" };
          }
          return undefined;
        };
        /*
         * RECI2 root-cause fix (budget) — SET SCREENING of an all-failing batch.
         * Groups outside each other's parent scope (parent subtree + parent's
         * ancestors) are rendered together on top of B. Review-VF MAJOR-2: that
         * scope test is NOT a proof of independence (shrink-to-fit ancestors,
         * auto grid tracks and table cells carry size across it), so a set
         * render may only SCREEN: a group that passes its own predicate there
         * goes back to the joint settle (which judges it again with witnesses),
         * and a group that fails there is re-judged ALONE on B before it can be
         * rejected. Cost ≤ sets + failures, against 2k − 1 halving renders.
         */
        const ancestorMemo = new Map<string, Set<string>>();
        const ancestorsOf = (id: string): Set<string> => {
          let set = ancestorMemo.get(id);
          if (set !== undefined) return set;
          set = new Set<string>();
          for (let at = parents.get(id); at !== undefined; at = parents.get(at)) set.add(at);
          ancestorMemo.set(id, set);
          return set;
        };
        const inScopeOf = (id: string, scopeRoot: string | undefined): boolean =>
          scopeRoot === undefined ||
          id === scopeRoot ||
          ancestorsOf(id).has(scopeRoot) ||
          ancestorsOf(scopeRoot).has(id);
        const related = (a: OwnedPlanOffer, b: OwnedPlanOffer): boolean =>
          inScopeOf(b.nodeId, parents.get(a.nodeId)) || inScopeOf(a.nodeId, parents.get(b.nodeId));
        const independentSets = (batch: readonly OwnedPlanOffer[]): OwnedPlanOffer[][] => {
          const sets: OwnedPlanOffer[][] = [];
          for (const offer of batch) {
            const home = sets.find((set) => set.every((other) => !related(offer, other)));
            if (home) home.push(offer);
            else sets.push([offer]);
          }
          return sets;
        };
        const settle = async (batch: readonly OwnedPlanOffer[], depth: number): Promise<void> => {
          if (batch.length === 0) return;
          counters.rounds = Math.max(counters.rounds, depth);
          if (passRenders + widths.length > budgetPerPass - reserve) {
            budgetRejected += batch.length;
            counters.renderBudgetRejections += batch.length;
            for (const offer of batch) reject(offer, { reason: "render-budget" });
            return;
          }
          if (depth > MAX_OWNERSHIP_ROUNDS) {
            counters.converged = false;
            unsettled += batch.length;
            for (const offer of batch) reject(offer, { reason: "non-convergence" });
            return;
          }
          const withBy = await measureSet([...base, ...batch]);
          if (batch.length === 1) counters.isolatedRenders++;
          const failing = batch.filter((offer) => ownFailure(offer, withBy, baselineBy) !== undefined);
          const shared =
            failing.length === 0
              ? (damageToAccepted(withBy) ?? witnessDamage([...base, ...batch], withBy, baselineBy))
              : undefined;
          if (failing.length === 0 && shared === undefined) {
            for (const offer of batch) {
              accepted.add(offer.planGroup);
              base.push(offer);
            }
            baselineBy = withBy;
            return;
          }
          if (batch.length === 1) {
            reject(
              batch[0]!,
              ownFailure(batch[0]!, withBy, baselineBy) ??
                shared ??
                damageToAccepted(withBy) ??
                witnessDamage([...base, ...batch], withBy, baselineBy)!,
            );
            return;
          }
          if (failing.length === batch.length) {
            const sets = independentSets(batch);
            if (sets.length < batch.length) {
              const survivors: OwnedPlanOffer[] = [];
              let rejectedAny = false;
              let budgetHit = false;
              const setFailures: OwnedPlanOffer[] = [];
              for (const set of sets) {
                if (budgetHit || passRenders + widths.length > budgetPerPass - reserve) {
                  budgetHit = true;
                  survivors.push(...set);
                  continue;
                }
                const setBy = await measureSet([...base, ...set]);
                counters.independentSetRenders++;
                for (const offer of set) {
                  if (ownFailure(offer, setBy, baselineBy) !== undefined) setFailures.push(offer);
                  else survivors.push(offer);
                }
              }
              for (const offer of setFailures) {
                if (budgetHit || passRenders + widths.length > budgetPerPass - reserve) {
                  budgetHit = true;
                  survivors.push(offer);
                  continue;
                }
                // Judged ALONE against B: the only render a rejection may come from.
                const aloneBy = await measureSet([...base, offer]);
                counters.isolatedRenders++;
                const failure = ownFailure(offer, aloneBy, baselineBy);
                if (failure !== undefined) {
                  reject(offer, failure);
                  rejectedAny = true;
                } else {
                  survivors.push(offer);
                }
              }
              if (rejectedAny || budgetHit) {
                // The batch strictly shrank (or the budget will reject the rest at
                // once), so the same depth cannot loop: no depth is spent here.
                await settle(
                  ordered.filter((offer) => survivors.includes(offer)),
                  rejectedAny ? depth : depth + 1,
                );
                return;
              }
              // Nobody fails on its own: the failure is joint — halve below.
            }
          }
          if (failing.length > 0 && failing.length < batch.length) {
            await settle(failing, depth + 1);
            await settle(batch.filter((offer) => !failing.includes(offer)), depth + 1);
            return;
          }
          const mid = Math.ceil(batch.length / 2);
          await settle(batch.slice(0, mid), depth + 1);
          await settle(batch.slice(mid), depth + 1);
        };
        const passStarted = Date.now();
        const rejectedBefore = rejections.length;
        await settle(ordered, 1);
        log(
          `[layout-ownership] ${passKey}: ${ordered.length} group(s) × ${widths.length} width(s) — ` +
            `accepted ${base.length}, rejected ${rejections.length - rejectedBefore}, ` +
            `${passRenders} render(s), ${passWitnessIds.size} witness(es), ${Date.now() - passStarted}ms`,
        );
        if (unsettled > 0) {
          log(`[layout-ownership] ${passKey}: ${unsettled} plan group(s) unsettled at depth ${MAX_OWNERSHIP_ROUNDS} — rejected`);
        }
        if (budgetRejected > 0) {
          log(`[layout-ownership] ${passKey}: render budget ${budgetPerPass} exhausted — ${budgetRejected} plan group(s) rejected render-budget`);
        }

        // Final joint overlay state: the boxes the owned form must reproduce.
        if (base.length > 0) {
          const joint = await measureSet(base);
          for (const width of widths) {
            const at = joint.get(width)!;
            for (const offer of base) {
              let perWidth = overlayBoxes.get(offer.planGroup);
              if (perWidth === undefined) {
                perWidth = new Map();
                overlayBoxes.set(offer.planGroup, perWidth);
              }
              perWidth.set(width, at[offer.nodeId] ?? null);
            }
          }
          // Review-VF MAJOR-1 — the final joint state also guards every
          // witness no owner governs (parent, siblings, rejected offers, phase-A rule nodes).
          const witnessRegressed = ownedWitnessDamage(base, witnessesOf, widths, joint, mOnlyBy);
          for (const offer of base) {
            if (ownFailure(offer, joint, mOnlyBy) !== undefined || witnessRegressed.has(offer.planGroup)) {
              counters.acceptedJointRegressions++;
              jointRegressed.add(offer.planGroup);
            }
          }
        }
      } catch (err) {
        for (const offer of usable) {
          if (!accepted.has(offer.planGroup) && !rejections.some((r) => r.planGroup === offer.planGroup)) {
            reject(offer, { reason: "unverifiable" });
          }
        }
        for (const offer of usable) {
          if (accepted.has(offer.planGroup) && !overlayBoxes.has(offer.planGroup)) {
            accepted.delete(offer.planGroup);
            reject(offer, { reason: "unverifiable" });
          }
        }
        counters.converged = false;
        log(`[layout-ownership] ${passKey}: render failed (${err instanceof Error ? err.message : String(err)}) — unsettled plan groups REJECTED`);
      } finally {
        for (const entry of open.values()) {
          await entry.page.close().catch(() => {});
          await entry.context.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }
  return finish();
}

/**
 * Review fix (MAJOR-1) — re-measure the JOINT overlay state (base + M + the
 * given groups) after a rollback removed some groups, so the owned-form confirm
 * compares against the state that will actually ship. Also returns the groups
 * that fail their own predicate in that state against M alone.
 */
export async function measureOwnedJointOverlay(input: {
  offers: readonly OwnedPlanOffer[];
  groupRules: readonly RecoveredLayoutRule[];
  acceptedRules: readonly RecoveredLayoutRule[];
  pages: readonly RuntimePage[];
  css: string;
}): Promise<{
  overlayBoxes: Map<string, Map<number, RenderedSampleBox | null>>;
  jointRegressedGroups: string[];
  status: "measured" | "not-run" | "chromium-unavailable";
  renderLoadRetries: number;
}> {
  const overlayBoxes = new Map<string, Map<number, RenderedSampleBox | null>>();
  const jointRegressed: string[] = [];
  let renderLoadRetries = 0;
  if (input.offers.length === 0) return { overlayBoxes, jointRegressedGroups: [], status: "not-run", renderLoadRetries };
  let browser: import("playwright").Browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { overlayBoxes, jointRegressedGroups: [], status: "chromium-unavailable", renderLoadRetries };
  }
  const rulesByGroup = new Map<string, RecoveredLayoutRule[]>();
  for (const rule of input.groupRules) {
    if (rule.planGroup === undefined) continue;
    const list = rulesByGroup.get(rule.planGroup) ?? [];
    list.push(rule);
    rulesByGroup.set(rule.planGroup, list);
  }
  const pageById = new Map(input.pages.map((page) => [page.pageId, page]));
  const passes = new Map<string, OwnedPlanOffer[]>();
  for (const offer of input.offers) {
    const key = `${offer.pageId}|${offer.viewportId}`;
    passes.set(key, [...(passes.get(key) ?? []), offer]);
  }
  try {
    for (const [, passOffers] of [...passes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const first = passOffers[0]!;
      const runtimePage = pageById.get(first.pageId);
      if (runtimePage === undefined) {
        for (const offer of passOffers) jointRegressed.push(offer.planGroup);
        continue;
      }
      const widths = [
        ...new Set(passOffers.flatMap((offer) => [offer.truthWidth, ...offer.samples.map((sample) => sample.width)])),
      ].sort((a, b) => a - b);
      const passMRules = input.acceptedRules.filter(
        (rule) => rule.pageId === first.pageId && (rule.viewportId ?? "desktop") === first.viewportId,
      );
      const mCss = generateLayoutCss(passMRules);
      const groupCss = generateLayoutCss(passOffers.flatMap((offer) => rulesByGroup.get(offer.planGroup) ?? []));
      // Review-VF MAJOR-1 — the re-measure guards non-owner witnesses too.
      const witnessesOf = passOwnedWitnesses(passOffers, passMRules, runtimeParents(runtimePage[first.viewportId].doc));
      const ids = [
        ...new Set([
          ...passOffers.flatMap((offer) => [offer.nodeId, ...offer.children.map((c) => c.nodeId)]),
          ...[...witnessesOf.values()].flatMap((list) => list.map((witness) => witness.nodeId)),
        ]),
      ];
      const html = truthCheckHtml(runtimePage, input.css, first.viewportId);
      const regressed = new Set<string>();
      const jointBy = new Map<number, BoxMap>();
      const mOnlyBy = new Map<number, BoxMap>();
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await context.route("http://**", (route) => route.abort());
        await context.route("https://**", (route) => route.abort());
        const page = await context.newPage();
        try {
          await setContentWithRetry(page, html, () => {
            renderLoadRetries++;
          });
          await page.evaluate(applyCandidateCss, mCss);
          const mOnly: BoxMap = await page.evaluate(measureSampleBoxInBrowser, ids);
          await page.evaluate(applyCandidateCss, groupCss === "" ? mCss : `${mCss}\n${groupCss}`);
          const joint: BoxMap = await page.evaluate(measureSampleBoxInBrowser, ids);
          jointBy.set(width, joint);
          mOnlyBy.set(width, mOnly);
          for (const offer of passOffers) {
            const perWidth = overlayBoxes.get(offer.planGroup) ?? new Map<number, RenderedSampleBox | null>();
            perWidth.set(width, joint[offer.nodeId] ?? null);
            overlayBoxes.set(offer.planGroup, perWidth);
            if (judgeOwnedGroupAtWidth(offer, width, joint, mOnly, { includeWitnesses: false }) !== undefined) {
              regressed.add(offer.planGroup);
            }
          }
        } finally {
          await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
      }
      for (const group of ownedWitnessDamage(passOffers, witnessesOf, widths, jointBy, mOnlyBy).keys()) regressed.add(group);
      jointRegressed.push(...passOffers.filter((offer) => regressed.has(offer.planGroup)).map((offer) => offer.planGroup));
    }
  } finally {
    await browser.close();
  }
  return { overlayBoxes, jointRegressedGroups: jointRegressed, status: "measured", renderLoadRetries };
}

export interface OwnedFormMismatch {
  planGroup: string;
  width: number;
  overlay: RenderedSampleBox | null;
  owned: RenderedSampleBox | null;
}

/**
 * FINAL CONFIRM (REC-I2): render the OWNED form — runtime trees carrying the
 * `wr-ow-*` marker classes, the split exact tier, the final recovered tier with
 * the owner nodes' measured width-family declarations dropped — and require
 * every owned node's box to equal its overlay-form verification box within
 * {@link OWNED_FORM_TOLERANCE_PX} at every width it was verified at.
 */
export async function confirmOwnedForm(input: {
  offers: readonly OwnedPlanOffer[];
  overlayBoxes: ReadonlyMap<string, ReadonlyMap<number, RenderedSampleBox | null>>;
  /** Owned-form runtime pages. */
  pages: readonly RuntimePage[];
  /** Globals + owned-form base stylesheet (split exact tier). */
  css: string;
  /** The final recovered tier. */
  recoveredCss: string;
  onLog?: (message: string) => void;
}): Promise<{
  checked: number;
  mismatches: OwnedFormMismatch[];
  status: "confirmed" | "not-run" | "chromium-unavailable";
  renderLoadRetries?: number;
}> {
  const offers = input.offers.filter((offer) => input.overlayBoxes.has(offer.planGroup));
  if (offers.length === 0) return { checked: 0, mismatches: [], status: "not-run" };
  let renderLoadRetries = 0;
  let browser: import("playwright").Browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { checked: 0, mismatches: [], status: "chromium-unavailable" };
  }
  const pageById = new Map(input.pages.map((page) => [page.pageId, page]));
  const mismatches: OwnedFormMismatch[] = [];
  let checked = 0;
  try {
    const passes = new Map<string, OwnedPlanOffer[]>();
    for (const offer of offers) {
      const key = `${offer.pageId}|${offer.viewportId}`;
      const list = passes.get(key);
      if (list) list.push(offer);
      else passes.set(key, [offer]);
    }
    for (const [, passOffers] of [...passes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const first = passOffers[0]!;
      const runtimePage = pageById.get(first.pageId);
      const widths = [
        ...new Set(passOffers.flatMap((offer) => [...input.overlayBoxes.get(offer.planGroup)!.keys()])),
      ].sort((a, b) => a - b);
      for (const width of widths) {
        if (runtimePage === undefined) {
          for (const offer of passOffers) {
            mismatches.push({ planGroup: offer.planGroup, width, overlay: input.overlayBoxes.get(offer.planGroup)!.get(width) ?? null, owned: null });
          }
          continue;
        }
        const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
        await context.route("http://**", (route) => route.abort());
        await context.route("https://**", (route) => route.abort());
        const page = await context.newPage();
        try {
          await setContentWithRetry(page, truthCheckHtml(runtimePage, input.css, first.viewportId), () => {
            renderLoadRetries++;
          });
          await page.evaluate(applyCandidateCss, input.recoveredCss);
          const here = passOffers.filter((offer) => input.overlayBoxes.get(offer.planGroup)!.has(width));
          const boxes: BoxMap = await page.evaluate(
            measureSampleBoxInBrowser,
            here.map((offer) => offer.nodeId),
          );
          for (const offer of here) {
            checked++;
            const overlay = input.overlayBoxes.get(offer.planGroup)!.get(width) ?? null;
            const owned = boxes[offer.nodeId] ?? null;
            const same =
              overlay === null || owned === null
                ? overlay === owned
                : overlay.l === owned.l &&
                  Math.abs(overlay.x - owned.x) <= OWNED_FORM_TOLERANCE_PX &&
                  Math.abs(overlay.w - owned.w) <= OWNED_FORM_TOLERANCE_PX;
            if (!same) mismatches.push({ planGroup: offer.planGroup, width, overlay, owned });
          }
        } finally {
          await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }
  input.onLog?.(`[layout-ownership] owned-form confirm: ${checked} (group × width) checked, ${mismatches.length} mismatch(es)`);
  if (mismatches.length > 0) {
    input.onLog?.(`[layout-ownership] owned form differs from overlay form on ${mismatches.length} (group × width) sample(s)`);
  }
  return { checked, mismatches, status: "confirmed", renderLoadRetries };
}
