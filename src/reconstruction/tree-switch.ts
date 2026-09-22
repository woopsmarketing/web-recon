import type { FamilySwitchBisection, LayoutProbeFingerprint } from "../observer/types.js";
import type { AuthoredBreakpointEntry, ElementSpecNode, PageSpec } from "../sitespec/index.js";
import { authoredEdgePx } from "./layout-inference.js";

/**
 * TASK 28.6 C1 — WHERE THE CLONE SWAPS ITS TWO OBSERVED TREES.
 *
 * THE DEFECT. The generated app carries two DOM trees — the one observed at 390
 * and the one observed at 1440 — and one number decides which is visible at a
 * given width. Until now that number was `floor((390 + 1440) / 2) = 915`:
 * arithmetic on the observation's own sampling grid, written by nobody, matching
 * nothing. The SAME generated stylesheet already snaps every RESPONSIVE-HIDE band
 * edge onto a breakpoint the source authored ({@link snapBandEdges}), so one
 * stylesheet shipped band edges from the source and a tree switch from a
 * calculator.
 *
 * It was measured wrong on four sites. seoultone.kr authors seven breakpoints
 * (500/768/1024/1200/1280/1600/1921) and 915 matches none of them: it lands
 * INSIDE the source's `max-width: 1024` band, so at 1024 the clone showed the
 * desktop tree and its 1296px footer inside a 1024px viewport. Same shape on
 * gs.severance.healthcare (clone scrollWidth 1440 in a 1024 viewport, both
 * routes). Six of the corpus's twenty graded BLOCKERs traced back to this one
 * number.
 *
 * THE FIX. Route the switch through the same authored-breakpoint histogram the
 * band edges use, ranked by evidence this module states in code, and clamp it to
 * the interval the observation actually leaves open.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CAN AND CANNOT DISTINGUISH — READ BEFORE TRUSTING THE NUMBER.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * An authored breakpoint says where the source changes its CSS. It does NOT say
 * where the source changes its DOM. Those are different facts and only one of
 * them is observed:
 *
 *   • CAN distinguish — whether the source serves ONE DOM or TWO. The mobile and
 *     desktop observations walked the same page in two browser contexts. If the
 *     two element walks are identical the source serves one DOM and the switch
 *     only chooses which STYLED snapshot to mount; no width can then mount "the
 *     wrong DOM". If they differ, the source serves two, and the switch chooses
 *     between them. {@link classifyTreeDivergence} decides this by measurement.
 *
 *   • CANNOT distinguish — WHERE a two-DOM source swaps them. That was true of
 *     every signal this module had before §27, and the reason is worth stating
 *     precisely: {@link measureObservedChange} infers the switch from GEOMETRY
 *     changes of matched nodes, and a CSS reflow and a family swap both move
 *     geometry. On linear.app `/` the per-page geometry counts were 1,868 changed
 *     nodes at 1025 against 1,783 at 641 — within 5% of each other, so the ranker
 *     took the larger and shipped 1025, while the page's own render family
 *     changes at 641. `domSwitchWidthObserved` was hardcoded `false` on every
 *     path, and it was false precisely because nothing had ever observed a swap.
 *
 * So the refusal here is a refusal to CLAIM, not a refusal to emit: some number
 * must ship or no media query can be written at all. What must never ship is a
 * number that reads as measured when it is not — which is exactly what 915 did.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TASK 28.7 §27 — THE SWAP IS NOW OBSERVED, WHEN THE PROBE MEASURED ONE.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The layout probe already resizes the page to every probe width. §27 makes it
 * take a DOM-FAMILY FINGERPRINT in the same in-page pass — the live document's
 * element population, its RENDERED population (elements that generate layout
 * boxes) and a depth-capped structure hash — so the artifact now carries a direct
 * answer to "which family does this width render", separate from "where did this
 * box move to". {@link measureFingerprintChange} reads it,
 * {@link decidePageTreeSwitch} prefers it, and
 * {@link TreeSwitchDecision.domSwitchWidthObserved} is finally `true` when the
 * width that ships is a width a swap was seen at.
 *
 * WHY RENDERED POPULATION AND NOT ELEMENT POPULATION. Measured on linear.app the
 * source's total node count is FLAT across its switch (4,704 at 700, 1024, 1100
 * and 1440 on `/`; 2,771 at every width on `/pricing`) while the count of nodes
 * that RENDER goes 969 → 2,860 between 390 and 700: the site ships both variants
 * in one document and swaps them with `display`. A population-only fingerprint
 * would have called that page purely CSS-responsive. Mounting a variant and
 * displaying one are the same fact to a reconstruction that must choose a tree,
 * and only the rendered set is common to both.
 *
 * WHAT §27 STILL CANNOT DO. It reads the DESKTOP probe, the same artifact the
 * geometry path reads, so it measures where the DESKTOP browser context swaps
 * families. A site that serves a different DOM to a mobile USER AGENT rather than
 * to a narrow viewport is invisible to it, exactly as it was to the geometry path.
 * And it still cannot invent a third tree: a route whose fingerprint changed at
 * more than one width is served at one of them and reports the rest as
 * `variant-tree-not-observed-at-<px>`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TASK 28.7 §26 — THE SWITCH IS PER ROUTE, NOT PER SITE.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * C1 fixed WHICH number. §26 fixes HOW MANY. One site-wide number assumes every
 * route changes layout regime at the same width, and measured on linear.app they
 * do not: `/` changes between 390 and 700 while `/pricing` changes between 1024
 * and 1100, so whichever single number ships, one of the two mounts a tree the
 * source does not render at that width.
 *
 * The evidence to separate them was already being taken and then summed away:
 * {@link measureObservedChange} computed a per-page count and folded it into a
 * site-wide total one line later. It now returns the breakout as well, and
 * {@link decidePageTreeSwitch} runs the SAME three steps on one page's own
 * histogram and its own probe. {@link rankTreeSwitchCandidates} is untouched:
 * 28.6 established that the ranker was not the defect, and this changes the
 * GRAIN, not the ranking.
 *
 * WHAT IT STILL CANNOT DO. It cannot invent a third tree. Two were observed, and
 * a route whose probe watched it change at more than one width can only be swapped
 * at one of them; every other such width is reported as
 * `variant-tree-not-observed-at-<px>` rather than served in silence.
 *
 * Pure and deterministic: no I/O, no clock, no mutation of the input pages.
 */

/** Widest probe gap, in px, that attributes an observed change to ONE candidate. */
export const TIGHT_BRACKET_MAX_PX = 1;

/**
 * Per-node geometry change, in px, below which a probe sample counts as
 * unchanged. A fluid box moves by ~1px across a 1px width step, so 1px of slack
 * is what separates continuous reflow from a discrete media-query change.
 */
export const TREE_SWITCH_CHANGE_TOLERANCE_PX = 1;

/** Candidate switch widths reported in the manifest before omission kicks in. */
export const TREE_SWITCH_CANDIDATES_REPORTED = 32;

/**
 * TASK 28.7 §27 — how much of the RENDER FAMILY must move across a bracket
 * before the probe is held to have watched a FAMILY SWAP rather than a tweak.
 *
 * MEASURED, on linear.app's own desktop probe (16 widths, both canary routes):
 *
 *              same family, adjacent samples        a real swap
 *   `/`        2056 → 2067 (+0.53%)                 657 → 1808 (+175%)
 *              1843 → 1846 (+0.16%)                 1846 → 2056 (+11.4%)
 *   `/pricing` 796 → 802 (+0.75%)                   793 → 1278 (+61%)
 *
 * The noise band on a live page across a 1px resize is under 1% — a sticky
 * header rebinding, one lazily decoded image, a tooltip root — and the smallest
 * swap measured is 11%. FIVE PERCENT sits an order of magnitude above the first
 * and an order below the second, which is the only kind of justification a
 * threshold like this can have. It is a RATIO and not a pixel count on purpose:
 * a 200-element page and a 4,000-element one do not share an absolute floor.
 */
export const FAMILY_CHANGE_MIN_RATIO = 0.05;

/**
 * …and the absolute floor underneath it, so a tiny page cannot qualify a swap on
 * one or two elements. On a 100-element page 5% is five elements; eight is the
 * smallest count that cannot be produced by a single component re-rendering its
 * own wrapper, header and label.
 */
export const FAMILY_CHANGE_MIN_ELEMENTS = 8;

/** One authored breakpoint offered as the tree switch, with all its evidence. */
export interface TreeSwitchCandidate {
  /**
   * The first width at which the state on its RIGHT holds — the `above` half of
   * the authored boundary, so `(max-width: 1024px)` and `(min-width: 1025px)`
   * are ONE candidate at 1025 rather than two rivals a pixel apart.
   */
  px: number;
  /** Matched layout declarations across the site that name this boundary. */
  authoredWeight: number;
  /** Pages whose stylesheet named it. */
  authoredPages: number;
  /**
   * Probed nodes whose visibility or box PROVABLY changed across this
   * breakpoint, summed over the pages that could attribute the change to it
   * alone. This is observation, not stylesheet text.
   */
  observedChange: number;
  /** Pages that supplied a tight enough probe bracket to attribute anything. */
  observedChangePages: number;
  /**
   * Pages where a bracket existed but was too wide to attribute — the change
   * across it belongs to the whole gap, not to this breakpoint, so it is
   * DISCARDED rather than credited. Counted so a thin corroboration is visible.
   */
  observedChangeUnattributablePages: number;

  /*
   * ------------------------------------------------------------------------
   * TASK 28.7 §27 — THE DIRECT SIGNAL. Everything above is geometry.
   * ------------------------------------------------------------------------
   */
  /**
   * Pages whose layout probe carried a DOM-family fingerprint on both sides of a
   * tight bracket around this width. ZERO MEANS UNKNOWN, never "no change":
   * every probe artifact written before §27 lands here as 0, and so does a page
   * whose fingerprint was truncated on one side (where an EQUALITY is unproven
   * even though a difference would still be evidence).
   */
  familyChangePages: number;
  /**
   * The probe watched the RENDER FAMILY change across this width on at least one
   * page — a direct observation of a tree swap, as opposed to the geometry above,
   * which a CSS reflow produces just as readily. Meaningful only when
   * {@link familyChangePages} is non-zero.
   */
  familyChangeObserved: boolean;
  /**
   * HOW BIG that family change was: the largest per-page change in the count of
   * elements the width RENDERS (or, when larger, in the live element population),
   * summed over nothing — the maximum, because a swap is a property of one route
   * and adding two routes' swaps together measures neither.
   *
   * ZERO with {@link familyChangeObserved} true is a real state and not a bug: a
   * swap detected by the STRUCTURE HASH alone changed which elements render
   * without changing how many, and this module refuses to invent a magnitude for
   * it. Such a candidate sorts last among observed swaps and is then ordered by
   * the geometry ranker like any other.
   */
  familyChange: number;
}

/** Why a midpoint was kept instead of an authored breakpoint. */
export type TreeSwitchFallbackReason =
  /** No page spec was supplied, so no histogram could be read. */
  | "no-page-specs"
  /** Page specs were read and not one carried an authored histogram. */
  | "no-histogram"
  /** Histograms were read and every one of them was empty. */
  | "empty-histogram"
  /**
   * Histograms named breakpoints, but every one fell OUTSIDE the observed
   * interval `(mobileWidth, desktopWidth]`. Snapping to one would move the
   * switch past a width at which the other tree was actually observed.
   */
  | "no-candidate-in-observed-interval";

/** Whether the source serves one DOM across the two observations, or two. */
export type TreeDivergence =
  /** Every observed page's two element walks are identical. */
  | "single-dom"
  /** At least one page's two walks differ. */
  | "dual-dom"
  /** No page carried both walks, so the question was not answered. */
  | "unknown";

/** The measured answer to "one DOM or two", with the counts behind it. */
export interface TreeDivergenceReport {
  divergence: TreeDivergence;
  /** Pages whose desktop and mobile element walks are identical. */
  pagesIdenticalWalk: number;
  /** Pages whose walks differ in length or in a tag. */
  pagesDivergentWalk: number;
  /** Pages that carried no comparable pair of walks. */
  pagesNotComparable: number;
}

/**
 * One page's own probe evidence, at the grain it was measured.
 *
 * `attributed` holds a count for every candidate this page bracketed TIGHTLY —
 * including `0`, which is a measurement ("nothing changed here") and not an
 * absence. A candidate the page could not bracket tightly appears in
 * `unattributable` instead and is credited nothing, exactly as the site-wide
 * fold does.
 */
export interface PageObservedChange {
  /** candidate px → nodes that provably changed across it, on THIS page. */
  attributed: Map<number, number>;
  /** Candidates whose bracket existed but was too wide to attribute. */
  unattributable: Set<number>;
}

/**
 * TASK 28.7 §27 — ONE PAGE'S DOM-FAMILY EVIDENCE, at the grain it was measured.
 *
 * The same shape as {@link PageObservedChange} and deliberately so, because it
 * answers the same question from a different measurement: `attributed` holds an
 * entry for every candidate this page bracketed TIGHTLY and could compare two
 * fingerprints across — including entries whose verdict is "the family did not
 * change here", which is a measurement and not an absence.
 */
export interface PageFingerprintChange {
  /**
   * candidate px → the SIZE of the family change across it, on THIS page. An
   * entry exists for every tightly bracketed candidate with fingerprints on both
   * sides; `changed` says which of those sizes qualified.
   */
  attributed: Map<number, number>;
  /** …of those, the candidates whose change qualified as a family SWAP. */
  changed: Set<number>;
  /**
   * Candidates this page could not answer for: no tight bracket, no fingerprint
   * on one side, or a TRUNCATED fingerprint that reported no change (a change
   * past the walk cap is still a change, but an equality past it is unproven).
   */
  unattributable: Set<number>;
}

/**
 * TASK 28.7 §27 — DID THE RENDER FAMILY CHANGE BETWEEN THESE TWO SAMPLES?
 *
 * Three ways to say yes, in the order they were justified by measurement:
 *
 *  1. The count of elements the width RENDERS moved by at least
 *     {@link FAMILY_CHANGE_MIN_RATIO} of the larger side. This is the one that
 *     fires on every real site measured, because a site that swaps variants with
 *     `display` (linear.app does) moves nothing else.
 *  2. The live element POPULATION moved by the same fraction — a site that
 *     MOUNTS and UNMOUNTS its variants instead of displaying them.
 *  3. The structure hash differs while BOTH counts are EXACTLY equal. This is
 *     the same-size swap: variant A of N boxes replaced by variant B of N boxes.
 *     The exact-equality guard is what keeps this clause honest. Measured on
 *     linear.app `/pricing`, the shallow hash changes across 640→641 where six
 *     of 796 rendered boxes moved — a responsive tweak, not a swap — so a hash
 *     difference on its own would have nominated the wrong width. Requiring that
 *     nothing at all was added or removed leaves the clause firing only where no
 *     count could ever have detected the swap.
 *
 * A TRUNCATED fingerprint on either side makes a NO answer unusable (the walk
 * stopped before it could see the rest of the tree) while leaving a YES intact.
 * The caller distinguishes the two through {@link familyChangeVerdict}.
 */
export type FamilyChangeVerdict = "changed" | "unchanged" | "unproven";

export function familyChangeVerdict(
  below: LayoutProbeFingerprint,
  above: LayoutProbeFingerprint,
): FamilyChangeVerdict {
  const floor = (a: number, b: number): number =>
    Math.max(FAMILY_CHANGE_MIN_ELEMENTS, Math.ceil(FAMILY_CHANGE_MIN_RATIO * Math.max(a, b)));
  if (Math.abs(above.rendered - below.rendered) >= floor(below.rendered, above.rendered)) {
    return "changed";
  }
  if (Math.abs(above.elements - below.elements) >= floor(below.elements, above.elements)) {
    return "changed";
  }
  if (
    above.structure !== below.structure &&
    above.rendered === below.rendered &&
    above.elements === below.elements
  ) {
    return "changed";
  }
  return below.truncated || above.truncated ? "unproven" : "unchanged";
}

/**
 * HOW BIG the change was, in elements. The larger of the two count deltas, and
 * 0 for a structure-only swap — see {@link TreeSwitchCandidate.familyChange} for
 * why that zero is deliberate rather than missing.
 */
export function familyChangeSize(
  below: LayoutProbeFingerprint,
  above: LayoutProbeFingerprint,
): number {
  return Math.max(
    Math.abs(above.rendered - below.rendered),
    Math.abs(above.elements - below.elements),
  );
}

/**
 * TASK 28.7 §26 — ONE ROUTE'S SWITCH, DECIDED FROM THAT ROUTE'S OWN EVIDENCE.
 *
 * THE DEFECT §26 FIXES. `chooseTreeSwitch` produced exactly one number for the
 * whole site, and a site's routes do not agree. Measured on linear.app: `/`
 * changes rendering regime between 390 and 700 while `/pricing` changes it
 * between 1024 and 1100, so no single width can serve both — whichever number
 * ships, one of the two routes mounts a tree the source does not render at that
 * width. The evidence to tell them apart was already computed and then summed
 * away one line after it was taken.
 *
 * WHAT THIS IS NOT. It is not a third tree. Only two were observed (at
 * `mobileWidth` and `desktopWidth`), and per-route switching moves WHERE the
 * swap happens, never how many trees there are. The ranking is untouched — the
 * same {@link rankTreeSwitchCandidates} decides a route's winner as decides the
 * site's — because the grain was the defect and the ranker was not.
 */
export interface PageTreeSwitch {
  pageId: string;
  /** The width this route's own evidence chose, or the site's when it had none. */
  px: number;
  /** True when `px` is this ROUTE's own winner rather than the site's number. */
  ownDecision: boolean;
  /** True when this route's own winner differs from the site-wide switch. */
  differsFromSite: boolean;
  /** Why this route produced no winner of its own. Set exactly when `!ownDecision`. */
  fallbackReason?: TreeSwitchFallbackReason;
  /** Authored candidates from THIS page's stylesheet, inside the observed interval. */
  candidateCount: number;
  /** `candidateCount > 1` on this page alone. */
  ambiguous: boolean;
  /** This route's ranked candidates, best first, capped at the report cap. */
  candidates: TreeSwitchCandidate[];
  /** This route's winner and its evidence. */
  chosen?: TreeSwitchCandidate;
  /** This page's own two element walks differ. */
  dualDom: boolean;
  /**
   * TASK 28.7 §27 — `px` is a width at which this route's probe WATCHED the
   * render family change, not a width inferred from geometry or read from a
   * stylesheet. False on every pre-§27 artifact and on every route whose
   * fingerprint held still, which is the correct answer for a route that is
   * purely CSS-responsive.
   */
  domSwitchWidthObserved: boolean;
  /** Widths where this route's fingerprint measured a family swap, ascending. */
  familyChangeWidths: number[];
  /**
   * Responsive Core P0 §C2.6 grade 3 — this route's OWN bisected family
   * switches (C1.6) that no authored candidate of this route explains.
   */
  observedOnly: ObservedOnlyReport;
  /**
   * REFUSING HONESTLY (§26.4). Widths where THIS route's probe measured the page
   * changing — a tight bracket and a non-zero count — and at which the clone does
   * NOT swap trees, because it swaps at `px` and it has only the two trees it
   * observed. At each of these the clone keeps serving whichever tree the switch
   * selected, and neither tree was ever observed at that width. Sorted ascending.
   *
   * Measured against `px` (this route's INFERENCE). The manifest's served-width
   * version is computed from {@link changeWidths} in `responsive-plan.ts`.
   */
  unservedChangeWidths: number[];
  /**
   * Responsive Core P0 — every width this route's own evidence measured it
   * change at, BEFORE removing any switch width: the fingerprint family-swap
   * widths when a swap was observed (else the geometry-change widths), plus the
   * route's own grade-3 bisected family switches. Sorted ascending, unique.
   * `unservedChangeWidths` = this minus the width that is actually swapped at.
   */
  changeWidths: number[];
}

/** The parametric limitation string §26.4 requires, for one unserved width. */
export function variantTreeNotObservedCode(px: number): string {
  return `variant-tree-not-observed-at-${px}`;
}

/** Everything {@link chooseTreeSwitch} decided, and the evidence for it. */
export interface TreeSwitchDecision {
  /** The width that SHIPS. */
  px: number;
  /** The floored observed-endpoint midpoint — what shipped before C1. */
  midpointPx: number;
  /** True when `px` came from the source's stylesheet rather than the midpoint. */
  snapped: boolean;
  /** Set only when `snapped` is false. */
  fallbackReason?: TreeSwitchFallbackReason;
  /** Authored candidates inside the observed interval. */
  candidateCount: number;
  /** `candidateCount > 1`: the source named more than one usable breakpoint. */
  ambiguous: boolean;
  /** Authored boundaries DROPPED because they sat outside the observed interval. */
  candidatesOutsideObservedInterval: number;
  /** Candidates omitted from {@link candidates} by the report cap. Never silent. */
  candidatesOmitted: number;
  /** The ranked candidates, best first, capped at {@link TREE_SWITCH_CANDIDATES_REPORTED}. */
  candidates: TreeSwitchCandidate[];
  /** The winner's evidence, when there is a winner. */
  chosen?: TreeSwitchCandidate;
  /** Pages read for histograms. */
  pagesRead: number;
  /** …of those, the ones that carried an authored histogram. */
  pagesWithHistogram: number;
  /** …and the ones whose probe could corroborate a candidate by measurement. */
  pagesWithUsableProbe: number;
  /** One DOM or two, measured. */
  treeDivergence: TreeDivergence;
  divergenceReport: TreeDivergenceReport;
  /**
   * TASK 28.7 §26 — the same decision taken once per page, from that page's own
   * histogram and its own probe. One entry per input page, in input order. The
   * site-wide `px` above is unchanged and still ships as the DEFAULT: a route
   * with no evidence of its own is served by it.
   */
  perPage: PageTreeSwitch[];
  /**
   * TASK 28.7 §27 — TRUE WHEN A SWAP WAS SEEN, and it can now be true.
   *
   * It was hardcoded `false` on every path from 28.6 C1 until §27, and that was
   * honest: the only width evidence in the pipeline was the geometry of matched
   * nodes, which a CSS reflow moves exactly as a DOM swap does. It is `true` here
   * when the layout probe's per-width DOM-family fingerprint watched the RENDER
   * FAMILY change across the width that ships — an observation of the swap
   * itself, not an inference from a stylesheet.
   *
   * It is still `false` for: every artifact observed before §27; a site that is
   * purely CSS-responsive, whose fingerprint correctly holds still at every
   * width; and any run that fell back to the midpoint. A `false` here means "not
   * observed", never "no swap exists".
   */
  domSwitchWidthObserved: boolean;
  /** Pages whose probe carried a per-width DOM-family fingerprint at all. */
  pagesWithFingerprint: number;
  /**
   * Responsive Core P0 §C2.6 grade 3 — the site-wide fold of every page's
   * bisected family switches that no authored candidate explains.
   */
  observedOnly: ObservedOnlyReport;
}

/*
 * ────────────────────────────────────────────────────────────────────────────
 * RESPONSIVE CORE P0 §C2.6 — GRADE 3: A SWAP OBSERVED WITH NO AUTHORED NAME.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Every candidate above starts life as an authored breakpoint, so a source that
 * swaps its variants from SCRIPT (a `matchMedia` / resize listener) and authors
 * no matching `@media` offers the ranker nothing, however clearly the probe saw
 * the family change. The observer (C1.6) now bisects every adjacent probe pair
 * whose fingerprints differ down to a 1px bracket. A CONVERGED 1px bracket whose
 * two fingerprints still differ per {@link familyChangeVerdict} is a direct
 * observation of WHERE the family changes — no stylesheet involved — and it is
 * what this section reads.
 *
 * What it refuses, and counts:
 *   • an unconverged or wider-than-1px bracket (the swap is somewhere inside it);
 *   • a bracket whose end fingerprints do not differ by the SAME verdict the
 *     tight-bracket path uses (a "changed" pair per probe pair can flatten back
 *     to noise at 1px — then nothing was located);
 *   • a width with an authored candidate within ±1px — that width belongs to
 *     grade 2's evidence, not to this one;
 *   • a width outside `(mobileWidth, desktopWidth]`, the interval every switch is
 *     clamped to. It is dropped rather than clamped: a clamped number would be a
 *     width nobody observed a swap at.
 *
 * Both probes are read (`layoutProbe` and `layoutProbeMobile`): a resize inside
 * ONE browser context changes only the width, so a family change across it is
 * width evidence whichever context measured it. The probe is recorded.
 */

/** One bisected 1px bracket that located a family change. */
export interface ObservedBisectionEvidence {
  pageId: string;
  probe: "desktop" | "mobile";
  lo: number;
  hi: number;
  pairLo?: number;
  pairHi?: number;
  steps: number;
  converged: boolean;
  familyChange: number;
}

/** One grade-3 candidate width, folded over every page/probe that located it. */
export interface ObservedOnlyCandidate {
  /** The first width of the NEW family — the bracket's `hi`. */
  px: number;
  /** The largest family change located at this width (maximum, like §27). */
  familyChange: number;
  /** Distinct pages whose probe located it. */
  pages: number;
  /** The strongest bisection at this width. */
  bisection: ObservedBisectionEvidence;
}

export interface ObservedOnlyReport {
  /** Ranked best first: magnitude, then pages, then nearest midpoint, then smallest px. */
  candidates: ObservedOnlyCandidate[];
  /** Bisection records read, across every page and both probes. */
  bisectionsRead: number;
  excludedNotConverged: number;
  excludedWideBracket: number;
  excludedNoFamilyChange: number;
  excludedNearAuthored: number;
  excludedOutsideObservedInterval: number;
  /**
   * Review fix (MAJOR-5) — located widths whose only support is ONE page with a
   * structure-only swap (`familyChange` 0). A single converged bracket can be a
   * timing artifact (autoplay, lazy load: lo and hi are taken at different
   * times), so such a width is not used. Absent on reports built before it.
   */
  excludedWeakSupport?: number;
}

/**
 * Review fix (MAJOR-5) — a grade-3 width whose strongest bisection has family
 * change magnitude 0 needs at least this many distinct pages locating it.
 */
export const OBSERVED_ONLY_MIN_PAGES_STRUCTURE_ONLY = 2;

/** The widest distance, in px, at which an authored candidate claims a bisected width. */
export const OBSERVED_ONLY_AUTHORED_EXCLUSION_PX = 1;

/**
 * Grade-3 evidence for a set of pages. `authoredPx` are the authored candidates
 * of the SAME grain (the site aggregate for the site, the page's own histogram
 * for a route). Pure; absent `familySwitchBisections` read as "no evidence",
 * which is how every pre-P0 artifact behaves exactly as before.
 */
export function collectObservedOnlySwitches(
  pages: readonly PageSpec[],
  options: {
    mobileWidth: number;
    desktopWidth: number;
    midpointPx: number;
    authoredPx: readonly number[];
  },
): ObservedOnlyReport {
  const { mobileWidth, desktopWidth, midpointPx, authoredPx } = options;
  const report: ObservedOnlyReport = {
    candidates: [],
    bisectionsRead: 0,
    excludedNotConverged: 0,
    excludedWideBracket: 0,
    excludedNoFamilyChange: 0,
    excludedNearAuthored: 0,
    excludedOutsideObservedInterval: 0,
    excludedWeakSupport: 0,
  };
  const byPx = new Map<number, { best: ObservedBisectionEvidence; pageIds: Set<string> }>();
  for (const page of pages) {
    const probes: Array<{ probe: "desktop" | "mobile"; list: readonly FamilySwitchBisection[] | undefined }> = [
      { probe: "desktop", list: page.layoutProbe?.familySwitchBisections },
      { probe: "mobile", list: page.layoutProbeMobile?.familySwitchBisections },
    ];
    for (const { probe, list } of probes) {
      if (list === undefined) continue;
      for (const b of list) {
        report.bisectionsRead++;
        // `converged: false` (incl. the observer's `gradual` re-measure verdict)
        // and an absent flag are both unusable.
        if (b.converged !== true) {
          report.excludedNotConverged++;
          continue;
        }
        if (!(b.hi > b.lo) || b.hi - b.lo > TIGHT_BRACKET_MAX_PX) {
          report.excludedWideBracket++;
          continue;
        }
        if (familyChangeVerdict(b.loFingerprint, b.hiFingerprint) !== "changed") {
          report.excludedNoFamilyChange++;
          continue;
        }
        if (!(b.hi > mobileWidth && b.hi <= desktopWidth)) {
          report.excludedOutsideObservedInterval++;
          continue;
        }
        if (authoredPx.some((px) => Math.abs(px - b.hi) <= OBSERVED_ONLY_AUTHORED_EXCLUSION_PX)) {
          report.excludedNearAuthored++;
          continue;
        }
        const evidence: ObservedBisectionEvidence = {
          pageId: page.pageId,
          probe,
          lo: b.lo,
          hi: b.hi,
          ...(b.pairLo !== undefined ? { pairLo: b.pairLo } : {}),
          ...(b.pairHi !== undefined ? { pairHi: b.pairHi } : {}),
          steps: b.steps,
          converged: b.converged,
          familyChange: familyChangeSize(b.loFingerprint, b.hiFingerprint),
        };
        const slot = byPx.get(b.hi);
        if (slot === undefined) {
          byPx.set(b.hi, { best: evidence, pageIds: new Set([page.pageId]) });
          continue;
        }
        slot.pageIds.add(page.pageId);
        if (evidence.familyChange > slot.best.familyChange) slot.best = evidence;
      }
    }
  }
  report.candidates = [...byPx.entries()]
    .map(([px, slot]) => ({
      px,
      familyChange: slot.best.familyChange,
      pages: slot.pageIds.size,
      bisection: slot.best,
    }))
    .filter((candidate) => {
      if (candidate.familyChange > 0 || candidate.pages >= OBSERVED_ONLY_MIN_PAGES_STRUCTURE_ONLY) return true;
      report.excludedWeakSupport = (report.excludedWeakSupport ?? 0) + 1;
      return false;
    })
    .sort((a, b) => {
      if (a.familyChange !== b.familyChange) return b.familyChange - a.familyChange;
      if (a.pages !== b.pages) return b.pages - a.pages;
      const da = Math.abs(a.px - midpointPx);
      const db = Math.abs(b.px - midpointPx);
      if (da !== db) return da - db;
      return a.px - b.px;
    });
  return report;
}

/** The element tag walk of one viewport, in document order. */
function elementWalk(nodes: readonly { type: string; tagName?: string }[]): string[] {
  const walk: string[] = [];
  for (const node of nodes) {
    if (node.type !== "element") continue;
    walk.push(node.tagName ?? "");
  }
  return walk;
}

/**
 * ONE DOM OR TWO — the question this module CAN answer.
 *
 * Compares each page's desktop and mobile element walks tag for tag. A single
 * differing page makes the whole site `dual-dom`: the switch then chooses a DOM
 * rather than a paint, and a wrong choice shows structure the source does not
 * serve at that width. Sites where every walk matches are `single-dom`, and for
 * them the switch cannot mount the wrong tree at any width because there is only
 * one tree.
 */
export function classifyTreeDivergence(
  pages: readonly PageSpec[],
): TreeDivergenceReport {
  let identical = 0;
  let divergent = 0;
  let notComparable = 0;
  for (const page of pages) {
    const desktop = page.viewports.desktop?.nodes;
    const mobile = page.viewports.mobile?.nodes;
    if (desktop === undefined || mobile === undefined) {
      notComparable++;
      continue;
    }
    const dWalk = elementWalk(desktop);
    const mWalk = elementWalk(mobile);
    if (dWalk.length === 0 && mWalk.length === 0) {
      notComparable++;
      continue;
    }
    if (dWalk.length === mWalk.length && dWalk.every((tag, i) => tag === mWalk[i])) {
      identical++;
    } else {
      divergent++;
    }
  }
  const divergence: TreeDivergence =
    divergent > 0 ? "dual-dom" : identical > 0 ? "single-dom" : "unknown";
  return {
    divergence,
    pagesIdenticalWalk: identical,
    pagesDivergentWalk: divergent,
    pagesNotComparable: notComparable,
  };
}

/**
 * The authored boundaries every page's DESKTOP stylesheet named, merged by value.
 *
 * Boundaries outside `(lower, upper]` are dropped HERE, not weighed and rejected
 * later, so nothing downstream can reintroduce a switch past a width at which the
 * other tree was actually observed. `authoredEdgePx()` is the same fold the band
 * snapper uses, so the tree switch and the band edges cannot disagree about what
 * one authored change is called.
 */
export function aggregateAuthoredCandidates(
  pages: readonly PageSpec[],
  lower: number,
  upper: number,
): {
  byPx: Map<number, { authoredWeight: number; authoredPages: number }>;
  pagesWithHistogram: number;
  emptyHistograms: number;
  outsideInterval: number;
} {
  const byPx = new Map<number, { authoredWeight: number; authoredPages: number }>();
  let pagesWithHistogram = 0;
  let emptyHistograms = 0;
  let outsideInterval = 0;
  for (const page of pages) {
    const histogram = page.viewports.desktop?.authoredBreakpoints;
    if (histogram === undefined) continue;
    pagesWithHistogram++;
    if (histogram.entries.length === 0) {
      emptyHistograms++;
      continue;
    }
    const seenOnThisPage = new Set<number>();
    for (const entry of histogram.entries as readonly AuthoredBreakpointEntry[]) {
      if (!Number.isFinite(entry.px)) continue;
      const px = authoredEdgePx(entry);
      if (!(px > lower && px <= upper)) {
        outsideInterval++;
        continue;
      }
      const slot = byPx.get(px) ?? { authoredWeight: 0, authoredPages: 0 };
      slot.authoredWeight += Number.isFinite(entry.count) ? entry.count : 0;
      if (!seenOnThisPage.has(px)) {
        slot.authoredPages++;
        seenOnThisPage.add(px);
      }
      byPx.set(px, slot);
    }
  }
  return { byPx, pagesWithHistogram, emptyHistograms, outsideInterval };
}

/**
 * HOW MUCH THE OBSERVED DESKTOP TREE ACTUALLY CHANGES ACROSS ONE BREAKPOINT.
 *
 * The layout probe re-rendered the page at a list of widths and recorded every
 * node's box and visibility at each. When two ADJACENT probe widths bracket a
 * candidate tightly — `above - below <= TIGHT_BRACKET_MAX_PX`, which the probe
 * deliberately produces by sampling each authored breakpoint from both sides —
 * every node that changed between them changed BECAUSE of that breakpoint, and
 * nothing else can be responsible.
 *
 * A LOOSE bracket is discarded, not credited. Across a 199px gap every fluid box
 * on the page changes width, so the count would measure the gap's width rather
 * than the breakpoint's force; on seoultone.kr that error made a breakpoint with
 * a 1-page tight bracket outrank one with 14. Discarded brackets are counted in
 * `observedChangeUnattributablePages` so thin corroboration stays visible.
 */
export function measureObservedChange(
  pages: readonly PageSpec[],
  candidates: readonly number[],
): {
  byPx: Map<number, { observedChange: number; pages: number; unattributablePages: number }>;
  /**
   * TASK 28.7 §26 — THE SAME EVIDENCE, BEFORE IT IS SUMMED.
   *
   * `byPx` folds every page's count into one number, which is the right shape
   * for a site-wide switch and the wrong shape for a per-route one: two routes
   * that change regime at two different widths add up to a site that changes at
   * neither. The per-page breakout is the identical measurement kept at the
   * grain it was taken at — no extra render, no extra pass, no second opinion.
   */
  byPage: Map<string, PageObservedChange>;
  pagesWithUsableProbe: number;
} {
  const byPx = new Map<
    number,
    { observedChange: number; pages: number; unattributablePages: number }
  >();
  const byPage = new Map<string, PageObservedChange>();
  for (const px of candidates) {
    byPx.set(px, { observedChange: 0, pages: 0, unattributablePages: 0 });
  }
  let pagesWithUsableProbe = 0;
  for (const page of pages) {
    const probeInfo = page.layoutProbe;
    if (probeInfo === undefined) continue;
    const attached = probeInfo.aligned || (probeInfo.alignedElementCount ?? 0) > 0;
    if (!attached) continue;
    const widths = probeInfo.widths;
    if (widths.length < 2) continue;
    const nodes = (page.viewports.desktop?.nodes ?? []).filter(
      (node): node is ElementSpecNode => node.type === "element" && node.probe !== undefined,
    );
    if (nodes.length === 0) continue;
    pagesWithUsableProbe++;
    const pageSlot: PageObservedChange = {
      attributed: new Map<number, number>(),
      unattributable: new Set<number>(),
    };
    byPage.set(page.pageId, pageSlot);
    for (const px of candidates) {
      const slot = byPx.get(px);
      if (slot === undefined) continue;
      let below = Number.NEGATIVE_INFINITY;
      let belowIndex = -1;
      let above = Number.POSITIVE_INFINITY;
      let aboveIndex = -1;
      widths.forEach((width, index) => {
        if (width < px && width > below) {
          below = width;
          belowIndex = index;
        }
        if (width >= px && width < above) {
          above = width;
          aboveIndex = index;
        }
      });
      if (belowIndex < 0 || aboveIndex < 0) continue;
      if (above - below > TIGHT_BRACKET_MAX_PX) {
        slot.unattributablePages++;
        pageSlot.unattributable.add(px);
        continue;
      }
      let changed = 0;
      for (const node of nodes) {
        const probe = node.probe;
        if (probe === undefined) continue;
        const vBelow = probe.v[belowIndex] ?? 0;
        const vAbove = probe.v[aboveIndex] ?? 0;
        if (vBelow !== vAbove) {
          changed++;
          continue;
        }
        if (vBelow === 0) continue;
        const dw = Math.abs((probe.w[belowIndex] ?? 0) - (probe.w[aboveIndex] ?? 0));
        const dx = Math.abs((probe.x[belowIndex] ?? 0) - (probe.x[aboveIndex] ?? 0));
        if (dw > TREE_SWITCH_CHANGE_TOLERANCE_PX || dx > TREE_SWITCH_CHANGE_TOLERANCE_PX) {
          changed++;
        }
      }
      // The per-route grain, kept. `slot` is the site-wide fold of exactly this.
      pageSlot.attributed.set(px, changed);
      slot.observedChange += changed;
      slot.pages++;
    }
  }
  return { byPx, byPage, pagesWithUsableProbe };
}

/**
 * TASK 28.7 §27 — WHERE EACH PAGE'S RENDER FAMILY ACTUALLY CHANGED.
 *
 * The direct counterpart to {@link measureObservedChange}, run over the same
 * probe artifact, with the same tight-bracket rule, and reading a different
 * field. Where that function asks "how many of the nodes I parked moved", this
 * one asks "is the tree at `above` the same FAMILY as the tree at `below`" —
 * which is the question the tree switch has always needed and never had.
 *
 * NOT GATED ON PROBE ATTACHMENT, and that is the substantive difference.
 * `measureObservedChange` requires `aligned || alignedElementCount > 0` because
 * it indexes per-ELEMENT arrays and a mis-indexed array is worse than no array.
 * The fingerprint is a census of the live document at a width: it makes no claim
 * about which element is which, so a probe whose two page loads produced
 * different element ORDER still measured the family correctly. Measured on
 * linear.app `/`, the mobile probe attaches nothing (`aligned: false`, 311 of
 * 2,306 elements) and its fingerprint is nevertheless the same family evidence
 * the desktop probe records.
 *
 * Reads the DESKTOP probe, like the geometry path, so both signals describe the
 * same browser context and can be compared without a second variable.
 */
export function measureFingerprintChange(
  pages: readonly PageSpec[],
  candidates: readonly number[],
): {
  byPage: Map<string, PageFingerprintChange>;
  /** Pages that carried a usable per-width fingerprint at all. */
  pagesWithFingerprint: number;
} {
  const byPage = new Map<string, PageFingerprintChange>();
  let pagesWithFingerprint = 0;
  for (const page of pages) {
    const probeInfo = page.layoutProbe;
    const fingerprints = probeInfo?.fingerprints;
    if (probeInfo === undefined || fingerprints === undefined) continue;
    const widths = probeInfo.widths;
    // The all-or-nothing guarantee the compiler makes, re-checked here rather
    // than assumed: a mis-aligned pair would compare two unrelated widths.
    if (widths.length < 2 || fingerprints.length !== widths.length) continue;
    pagesWithFingerprint++;
    const slot: PageFingerprintChange = {
      attributed: new Map<number, number>(),
      changed: new Set<number>(),
      unattributable: new Set<number>(),
    };
    byPage.set(page.pageId, slot);
    for (const px of candidates) {
      let below = Number.NEGATIVE_INFINITY;
      let belowIndex = -1;
      let above = Number.POSITIVE_INFINITY;
      let aboveIndex = -1;
      widths.forEach((width, index) => {
        if (width < px && width > below) {
          below = width;
          belowIndex = index;
        }
        if (width >= px && width < above) {
          above = width;
          aboveIndex = index;
        }
      });
      if (belowIndex < 0 || aboveIndex < 0) continue;
      if (above - below > TIGHT_BRACKET_MAX_PX) {
        slot.unattributable.add(px);
        continue;
      }
      const lo = fingerprints[belowIndex];
      const hi = fingerprints[aboveIndex];
      if (lo === undefined || hi === undefined) {
        slot.unattributable.add(px);
        continue;
      }
      const verdict = familyChangeVerdict(lo, hi);
      if (verdict === "unproven") {
        slot.unattributable.add(px);
        continue;
      }
      slot.attributed.set(px, familyChangeSize(lo, hi));
      if (verdict === "changed") slot.changed.add(px);
    }
  }
  return { byPage, pagesWithFingerprint };
}

/**
 * "BEST", DEFINED IN CODE.
 *
 * Ranked, and the order is the point:
 *
 *  1. CORROBORATED BY OBSERVATION FIRST. A candidate the probe watched the page
 *     change across outranks one that only appears in a stylesheet, however
 *     heavily. Measurement beats text, and an uncorroborated candidate may be a
 *     breakpoint that governs colour, type or a print sheet rather than layout.
 *  2. Among corroborated candidates, the LARGEST attributed change — the width
 *     where the most boxes provably moved or appeared is the layout's real
 *     regime boundary.
 *  3. Then the HEAVIEST authored weight, the same primary rule
 *     {@link chooseAuthoredEdge} uses for band edges, so the two mechanisms
 *     agree about what evidence means when measurement is silent.
 *  4. Then NEAREST the midpoint. A tie-break and nothing more: the midpoint is a
 *     guess, so it may order equals and must never outrank evidence.
 *  5. Then the SMALLEST px, so the result is a function of the input and never of
 *     map iteration order.
 */
export function rankTreeSwitchCandidates(
  candidates: readonly TreeSwitchCandidate[],
  midpointPx: number,
): TreeSwitchCandidate[] {
  return [...candidates].sort((a, b) => {
    const aCorroborated = a.observedChangePages > 0 ? 1 : 0;
    const bCorroborated = b.observedChangePages > 0 ? 1 : 0;
    if (aCorroborated !== bCorroborated) return bCorroborated - aCorroborated;
    if (aCorroborated === 1 && a.observedChange !== b.observedChange) {
      return b.observedChange - a.observedChange;
    }
    if (a.authoredWeight !== b.authoredWeight) return b.authoredWeight - a.authoredWeight;
    const da = Math.abs(a.px - midpointPx);
    const db = Math.abs(b.px - midpointPx);
    if (da !== db) return da - db;
    return a.px - b.px;
  });
}

/**
 * TASK 28.7 §27 — "BEST" AMONG WIDTHS A SWAP WAS ACTUALLY SEEN AT.
 *
 * Called only on candidates whose fingerprint says the render family changed
 * there, so every input is already a measured swap and the only question left is
 * WHICH swap is the tree switch. The answer is the BIGGEST one: a page that
 * changes family at two widths changed a handful of boxes at one of them and its
 * whole layout regime at the other, and the second is the switch. Measured on
 * linear.app `/`, the family moves by 1,151 rendered elements across 641 and by
 * 210 across 929; the geometry ranker preferred 1025 (1,868 changed nodes
 * against 641's 1,783 — inside 5%) because a reflow and a swap move geometry
 * alike, and 1025 is the width whose clone served a 390px tree at 1024.
 *
 * TIES GO TO {@link rankTreeSwitchCandidates}, UNCHANGED. 28.6 established that
 * the ranker was not the defect and this task does not re-open it: the §27 signal
 * decides which candidates are eligible and how they order by magnitude, and
 * everything below that — corroboration, authored weight, distance to the
 * midpoint, smallest px — is still the 28.6 order, applied to the surviving set.
 * A structure-only swap carries magnitude 0 and is therefore ordered entirely by
 * that unchanged ranker.
 */
export function rankFamilyChangeCandidates(
  candidates: readonly TreeSwitchCandidate[],
  midpointPx: number,
): TreeSwitchCandidate[] {
  const geometryOrder = new Map<number, number>();
  rankTreeSwitchCandidates(candidates, midpointPx).forEach((candidate, index) => {
    geometryOrder.set(candidate.px, index);
  });
  return [...candidates].sort((a, b) => {
    if (a.familyChange !== b.familyChange) return b.familyChange - a.familyChange;
    return (geometryOrder.get(a.px) ?? 0) - (geometryOrder.get(b.px) ?? 0);
  });
}

/**
 * TASK 28.7 §27 — the two rankings, composed into ONE reported order.
 *
 * When the fingerprint corroborates nothing this is exactly
 * {@link rankTreeSwitchCandidates} and the decision is byte-identical to the one
 * that shipped before §27. When it corroborates something, the observed swaps
 * come first (ordered by {@link rankFamilyChangeCandidates}) and every remaining
 * candidate follows in the unchanged geometry order — so the reported list still
 * reads best-first, `candidates[0]` is still the winner, and no candidate is
 * dropped from the record just because a stronger signal outranked it.
 */
function rankWithFingerprint(
  candidates: readonly TreeSwitchCandidate[],
  midpointPx: number,
): { ranked: TreeSwitchCandidate[]; swapObserved: boolean } {
  const observed = candidates.filter((candidate) => candidate.familyChangeObserved);
  if (observed.length === 0) {
    return { ranked: rankTreeSwitchCandidates(candidates, midpointPx), swapObserved: false };
  }
  const observedPx = new Set(observed.map((candidate) => candidate.px));
  const rest = rankTreeSwitchCandidates(
    candidates.filter((candidate) => !observedPx.has(candidate.px)),
    midpointPx,
  );
  return {
    ranked: [...rankFamilyChangeCandidates(observed, midpointPx), ...rest],
    swapObserved: true,
  };
}

export interface ChooseTreeSwitchInput {
  pages: readonly PageSpec[];
  /** The observed MOBILE endpoint. The switch is never placed at or below it. */
  mobileWidth: number;
  /** The observed DESKTOP endpoint. The switch is never placed above it. */
  desktopWidth: number;
}

/**
 * TASK 28.7 §26 — ONE PAGE'S SWITCH.
 *
 * Deliberately the SAME three steps `chooseTreeSwitch` runs, with the inputs
 * narrowed to one page: this page's authored histogram clamped to the observed
 * interval, this page's probe-attributed change, and {@link
 * rankTreeSwitchCandidates} unchanged and given the same site midpoint so the
 * tie-break cannot drift between the two grains. A page whose own evidence names
 * no candidate does not invent one — it inherits `sitePx` and says so.
 */
export function decidePageTreeSwitch(
  page: PageSpec,
  options: {
    mobileWidth: number;
    desktopWidth: number;
    midpointPx: number;
    /** The site-wide switch, inherited when this page has no winner of its own. */
    sitePx: number;
  },
  observed: PageObservedChange | undefined,
  fingerprint?: PageFingerprintChange,
): PageTreeSwitch {
  const { mobileWidth, desktopWidth, midpointPx, sitePx } = options;
  const own = aggregateAuthoredCandidates([page], mobileWidth, desktopWidth);
  const dualDom = classifyTreeDivergence([page]).pagesDivergentWalk > 0;
  const pxList = [...own.byPx.keys()].sort((a, b) => a - b);
  const candidates: TreeSwitchCandidate[] = pxList.map((px) => {
    const authored = own.byPx.get(px);
    const attributed = observed?.attributed.get(px);
    const familySize = fingerprint?.attributed.get(px);
    return {
      px,
      authoredWeight: authored?.authoredWeight ?? 0,
      authoredPages: authored?.authoredPages ?? 0,
      observedChange: attributed ?? 0,
      observedChangePages: attributed === undefined ? 0 : 1,
      observedChangeUnattributablePages: observed?.unattributable.has(px) ? 1 : 0,
      familyChangePages: familySize === undefined ? 0 : 1,
      familyChangeObserved: fingerprint?.changed.has(px) ?? false,
      familyChange: fingerprint?.changed.has(px) ? (familySize ?? 0) : 0,
    };
  });
  const { ranked, swapObserved } = rankWithFingerprint(candidates, midpointPx);
  const winner = ranked[0];
  const px = winner?.px ?? sitePx;
  /*
   * §26.4. Every width this page's probe watched it change across, minus the one
   * the clone actually swaps at.
   *
   * §27 CHANGES WHAT "CHANGE" MEANS HERE, and only where it has the evidence to.
   * With a fingerprint the honest list is the widths where the RENDER FAMILY
   * changed: those are the widths at which the clone would have to mount a tree
   * it never observed. The geometry list was a superset that also named every
   * width where boxes merely reflowed — on linear.app `/` it named five widths,
   * four of which the clone serves correctly with the tree it has. Without a
   * fingerprint the geometry rule is unchanged, because it is then the only
   * evidence there is.
   */
  const measuredChange = (
    swapObserved
      ? ranked.filter((c) => c.familyChangeObserved)
      : ranked.filter((c) => c.observedChangePages > 0 && c.observedChange > 0)
  ).map((c) => c.px);
  const unservedChangeWidths = measuredChange.filter((w) => w !== px).sort((a, b) => a - b);
  const observedOnly = collectObservedOnlySwitches([page], {
    mobileWidth,
    desktopWidth,
    midpointPx,
    authoredPx: pxList,
  });
  const changeWidths = [
    ...new Set([...measuredChange, ...observedOnly.candidates.map((c) => c.px)]),
  ].sort((a, b) => a - b);
  const fallbackReason: TreeSwitchFallbackReason | undefined =
    winner !== undefined
      ? undefined
      : own.pagesWithHistogram === 0
        ? "no-histogram"
        : own.emptyHistograms === own.pagesWithHistogram
          ? "empty-histogram"
          : "no-candidate-in-observed-interval";
  return {
    pageId: page.pageId,
    px,
    ownDecision: winner !== undefined,
    differsFromSite: winner !== undefined && px !== sitePx,
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
    candidateCount: ranked.length,
    ambiguous: ranked.length > 1,
    candidates: ranked.slice(0, TREE_SWITCH_CANDIDATES_REPORTED),
    ...(winner !== undefined ? { chosen: winner } : {}),
    dualDom,
    // True only when an OBSERVED SWAP is what chose `px`. A route that inherits
    // `sitePx` for want of a candidate of its own has observed nothing, whatever
    // its fingerprint saw.
    domSwitchWidthObserved: swapObserved && winner !== undefined,
    familyChangeWidths: candidates
      .filter((c) => c.familyChangeObserved)
      .map((c) => c.px)
      .sort((a, b) => a - b),
    observedOnly,
    unservedChangeWidths,
    changeWidths,
  };
}

/**
 * The whole C1 decision: candidates, evidence, ranking, fallback and provenance.
 *
 * REQUIREMENT (e) — a site that authors nothing still works. Every failure path
 * returns the midpoint with a `fallbackReason` naming which failure it was, so a
 * guessed switch is always distinguishable from a snapped one in the artifact.
 */
export function chooseTreeSwitch(input: ChooseTreeSwitchInput): TreeSwitchDecision {
  const { pages, mobileWidth, desktopWidth } = input;
  const midpointPx = Math.floor((mobileWidth + desktopWidth) / 2);
  const divergenceReport = classifyTreeDivergence(pages);
  const base = {
    midpointPx,
    pagesRead: pages.length,
    treeDivergence: divergenceReport.divergence,
    divergenceReport,
  };

  if (pages.length === 0) {
    return {
      ...base,
      px: midpointPx,
      snapped: false,
      fallbackReason: "no-page-specs",
      candidateCount: 0,
      ambiguous: false,
      candidatesOutsideObservedInterval: 0,
      candidatesOmitted: 0,
      candidates: [],
      pagesWithHistogram: 0,
      pagesWithUsableProbe: 0,
      pagesWithFingerprint: 0,
      domSwitchWidthObserved: false,
      perPage: [],
      observedOnly: collectObservedOnlySwitches([], {
        mobileWidth,
        desktopWidth,
        midpointPx,
        authoredPx: [],
      }),
    };
  }

  const aggregate = aggregateAuthoredCandidates(pages, mobileWidth, desktopWidth);
  const pxList = [...aggregate.byPx.keys()].sort((a, b) => a - b);
  const measured = measureObservedChange(pages, pxList);
  const family = measureFingerprintChange(pages, pxList);

  /*
   * TASK 28.7 §27 — the site-wide fold of the family evidence.
   *
   * `familyChange` takes the MAXIMUM over pages rather than the sum that
   * `observedChange` takes, and the asymmetry is deliberate. A geometry count is
   * a tally of nodes and tallies add up; a family swap is a property of ONE
   * route's document, and two routes swapping 200 elements each is not one site
   * swapping 400. The maximum answers "how big is the biggest swap anyone saw
   * here", which is the question the site-wide default has to rank on.
   */
  const candidates: TreeSwitchCandidate[] = pxList.map((px) => {
    const authored = aggregate.byPx.get(px);
    const observed = measured.byPx.get(px);
    let familyChangePages = 0;
    let familyChangeObserved = false;
    let familyChange = 0;
    for (const slot of family.byPage.values()) {
      const size = slot.attributed.get(px);
      if (size === undefined) continue;
      familyChangePages++;
      if (!slot.changed.has(px)) continue;
      familyChangeObserved = true;
      if (size > familyChange) familyChange = size;
    }
    return {
      px,
      authoredWeight: authored?.authoredWeight ?? 0,
      authoredPages: authored?.authoredPages ?? 0,
      observedChange: observed?.observedChange ?? 0,
      observedChangePages: observed?.pages ?? 0,
      observedChangeUnattributablePages: observed?.unattributablePages ?? 0,
      familyChangePages,
      familyChangeObserved,
      familyChange,
    };
  });
  const siteRanking = rankWithFingerprint(candidates, midpointPx);
  const ranked = siteRanking.ranked;
  const reported = ranked.slice(0, TREE_SWITCH_CANDIDATES_REPORTED);

  const winner = ranked[0];
  /*
   * TASK 28.7 §26 — the site-wide number is decided FIRST because it is the
   * default every route without evidence of its own inherits, and a route must
   * never inherit a different number from the one `globals.css` will serve it.
   */
  const sitePx = winner?.px ?? midpointPx;
  const perPage = pages.map((page) =>
    decidePageTreeSwitch(
      page,
      { mobileWidth, desktopWidth, midpointPx, sitePx },
      measured.byPage.get(page.pageId),
      family.byPage.get(page.pageId),
    ),
  );

  const common = {
    ...base,
    candidateCount: ranked.length,
    ambiguous: ranked.length > 1,
    candidatesOutsideObservedInterval: aggregate.outsideInterval,
    candidatesOmitted: ranked.length - reported.length,
    candidates: reported,
    pagesWithHistogram: aggregate.pagesWithHistogram,
    pagesWithUsableProbe: measured.pagesWithUsableProbe,
    pagesWithFingerprint: family.pagesWithFingerprint,
    perPage,
    observedOnly: collectObservedOnlySwitches(pages, {
      mobileWidth,
      desktopWidth,
      midpointPx,
      authoredPx: pxList,
    }),
  };

  if (winner === undefined) {
    const fallbackReason: TreeSwitchFallbackReason =
      aggregate.pagesWithHistogram === 0
        ? "no-histogram"
        : aggregate.outsideInterval > 0
          ? "no-candidate-in-observed-interval"
          : aggregate.emptyHistograms === aggregate.pagesWithHistogram
            ? "empty-histogram"
            : "no-candidate-in-observed-interval";
    // The midpoint is a calculator's number whatever the fingerprint saw.
    return {
      ...common,
      px: midpointPx,
      snapped: false,
      fallbackReason,
      domSwitchWidthObserved: false,
    };
  }

  return {
    ...common,
    px: winner.px,
    snapped: true,
    chosen: winner,
    domSwitchWidthObserved: siteRanking.swapObserved,
  };
}
