/**
 * Probe widths derived from the SITE'S OWN authored breakpoints (Task 28.6 C3 D1).
 *
 * WHY. The layout probe sampled a fixed global width list
 * ({@link LAYOUT_PROBE_WIDTHS} = 390/700/768/1024/1100/1440/1920) on every page
 * of every site. The reconstruction engine builds a responsive band edge at the
 * MIDPOINT between two adjacent probe samples, so the density and placement of
 * those samples sets how wrong every band edge can be — and the list knows
 * nothing about the site under it.
 *
 * MEASURED CONSEQUENCE, linear.app/pricing: the authored breakpoint is
 * `max-width: 1024px`, i.e. the layout changes between 1024 and 1025. The
 * samples either side were 1024 and 1440 (the pre-28.6 list
 * `[390, 768, 1024, 1440, 1920]`), so the emitted band edge was their midpoint
 * 1232 and the clone hid the comparison table across 1025–1231, where the
 * source shows it. The responsive-QA harness graded that pair a BLOCKER
 * independently. Today's 7-width floor list narrows the same error to 1062
 * (1024/1100) rather than removing it; only a sample AT 1025 puts the edge on
 * the authored pixel. A second instance from the same page: 57 grid containers
 * could not have their track structure recovered because their children are
 * hidden at 1024 and the next sample up is 1440, leaving no width where the
 * children are visible AND the container width differs.
 *
 * MEASURED RESULT (2026-09-02, this module live in the pipeline). Desktop pass,
 * linear.app/pricing: 31 authored conditions → 14 screen breakpoints → widths
 * 390, 640, 641, 700, 768, 769, 928, 929, 1024, 1025, 1100, 1280, 1281, 1440,
 * 1441, 1920. The 1024/1025 pair is now adjacent, AND 1280/1281 lands inside
 * the old 1232-to-1440 blind gap. Identical across two runs. stripe.com: 40
 * conditions → 21 breakpoints → 599/600, 639/640, 641, 939/940, 1263/1264
 * added; 12 breakpoints refused by the 16-width cap and itemised in
 * `breakpointsRefused`.
 *
 * WHAT THIS DOES. The observation already records every distinct `@media`
 * condition the page authored ({@link StylesheetCoverage.authoredMediaConditions},
 * collected in-page during the same pass that recovers CORS-blocked sheets), and
 * that record exists BEFORE the probe runs. This module folds those conditions
 * into whole-pixel breakpoints and asks for a sample on EACH SIDE of every one
 * that fits, merged with the floor set.
 *
 * FIVE PROPERTIES IT HOLDS, each pinned by a check in
 * `scripts/smoke-multi-observer.ts` §8:
 *
 *  1. DETERMINISTIC. Conditions are folded in a defined order, breakpoints are
 *     ranked by (authored weight desc, px asc, kind asc), and the output is
 *     sorted ascending. Permuting the input tally cannot change the output.
 *  2. BOUNDED. `cap` (default {@link MAX_PROBE_WIDTHS_TOTAL}) is the hard limit
 *     on how many widths one probe pass samples. Each added width costs one
 *     `setViewportSize` + settle + measure — see the constant's doc for the
 *     measured per-width cost — so the cap is a real budget, and every
 *     breakpoint it refuses is counted in `breakpointsDroppedByCap` AND
 *     itemised by value in `breakpointsRefused`, because "the budget ran out
 *     before this edge" and "nobody authored an edge here" must never look the
 *     same to the reconstruction lane.
 *  3. PROVENANCE. Every width in the result carries why it is there, so the
 *     reconstruction lane and an auditor can see which samples came from the
 *     site and which from the floor.
 *  4. AN AUTHORED WIDTH OUTRANKS A FLOOR WIDTH (Task 28.6 W6 O3). The floor is
 *     seeded first — coinciding with an authored pixel costs that bracket
 *     nothing, the coincidence Linear's 1024 case depends on — but only
 *     {@link MIN_GUARANTEED_FLOOR_WIDTHS} of it (narrowest / median / widest)
 *     is PROTECTED from eviction. THE DEFECT THIS REMOVES: the budget used to
 *     be spent floor-first with no eviction, so when the cap bit it was always
 *     an authored width that lost — even to a floor width the site never
 *     authored. MEASURED on gs.severance.healthcare: the site's own `768/max`,
 *     `992/min` and `1200/min` were refused while un-authored floor widths
 *     700, 1100 and 1920 were kept. Now, when a higher-ranked authored bracket
 *     needs room the cap does not have, an EVICTABLE floor width is given up
 *     for it (`floorWidthsEvicted`, `breakpointsAdoptedByEviction`) instead of
 *     refusing the bracket; only once evictable floor is exhausted does the
 *     cap refuse an authored bracket. A derived set can therefore be smaller on
 *     the floor side than the fixed list — never on the authored side, and
 *     never below the guaranteed core, so a site authoring nothing is still
 *     probed across its whole envelope.
 *  5. HONEST DEGRADATION. A page whose authored CSS could not be read falls back
 *     to the floor list and says so in `degradedToFloor` + `degradedReason`.
 *     Three distinct causes are told apart; none of them is silent.
 *
 * BRACKETS ARE ADOPTED WHOLE. A breakpoint contributes both of its sides or
 * neither. Adding only one side moves the midpoint of a neighbouring pair
 * without pinning the authored edge — which is the very defect this module
 * exists to remove — so a half-bracket is refused and counted rather than
 * banked as progress.
 *
 * LAYERING NOTE. The media-condition parser lives in
 * `src/sitespec/media-condition.ts` and is a PURE LEAF (zero imports). Reusing
 * it here is deliberate: a second width parser in the observer would be a
 * second system with a second set of bugs, and the SiteSpec's authored
 * breakpoints and the probe's sample placement must agree about what a
 * condition means or the band edges will not line up with the samples.
 *
 * Pure and deterministic: no I/O, no clock, no randomness.
 */

import {
  MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX,
  foldMediaBreakpoints,
  parseMediaCondition,
  type MediaWidthBoundKind,
} from "../sitespec/media-condition.js";
import {
  MAX_ENVELOPE_EXTENSION_BRACKETS,
  MAX_LISTED_REFUSED_BREAKPOINTS,
  MAX_PROBE_WIDTH,
  MAX_PROBE_WIDTHS_TOTAL,
  MIN_GUARANTEED_FLOOR_WIDTHS,
  MIN_PROBE_WIDTH,
  type ProbeWidthOrigin,
  type ProbeWidthProvenance,
} from "./types.js";

/** One authored `@media` condition and how many times the page authored it. */
export interface AuthoredMediaConditionTally {
  readonly condition: string;
  readonly count: number;
}

export interface DeriveProbeWidthsInput {
  /**
   * The fixed set that is probed absent any authored evidence. Task 28.6 W6
   * O3: no longer UNCONDITIONALLY preserved — only its guaranteed core
   * ({@link MIN_GUARANTEED_FLOOR_WIDTHS} widths) survives every input; the rest
   * is evictable, and is evicted for a higher-ranked authored bracket only
   * once the cap has no other room. See property 4 on {@link deriveProbeWidths}.
   */
  readonly floorWidths: readonly number[];
  /**
   * Task 28.6 W7 O3.1 — widths a DOWNSTREAM consumer HARD-REQUIRES, pinned
   * against eviction whatever the authored CSS says.
   *
   * WHY. W6 O3 made floor widths evictable, protected only by POSITION
   * ({@link pickGuaranteedFloor}). The layout inference anchors each viewport's
   * whole pass to the width that viewport's full DOM observation was taken at,
   * and refuses the pass with `truth-width-not-probed` when that width is not
   * in the probe set. On the 7-width desktop floor the positional core is
   * `[390, 1024, 1920]`, so the 1440 observation width was evictable — and was
   * evicted on 4 of 7 pilot sites, shipping 0 desktop layout rules.
   *
   * The CALLER states what it requires (it knows its own observation width);
   * this file never names a pixel value, which would be the host-specific hack
   * the engine forbids. Required widths are added to the guaranteed core, so
   * they can neither be evicted for an authored bracket nor be missing from
   * the result.
   */
  readonly requiredWidths?: readonly number[];
  /**
   * The page's authored `@media` tally. `undefined` means the observation
   * carried no tally at all (a pre-C3 artifact, or a capture mode that indexes
   * no stylesheets) — a different fact from an empty array, which means the
   * sheets were read and hold no `@media`.
   */
  readonly conditions: readonly AuthoredMediaConditionTally[] | undefined;
  /**
   * Sheets this load could actually read (`cssomReadable + fallbackRecovered`)
   * and how many the page has. Used ONLY to tell "this page authors no
   * breakpoints" apart from "we could not read this page's stylesheets"; never
   * to change which widths are chosen.
   */
  readonly sheetsReadable?: number;
  readonly sheetsTotal?: number;
  /** Distinct conditions the collector's own cap refused. Carried through. */
  readonly conditionsDroppedByCollector?: number;
  /** Hard cap on the returned width count. Defaults to {@link MAX_PROBE_WIDTHS_TOTAL}. */
  readonly cap?: number;
  /** Narrowest width worth probing. Defaults to {@link MIN_PROBE_WIDTH}. */
  readonly minWidth?: number;
  /**
   * Widest width worth probing. Defaults to the widest floor width, so the
   * derivation never widens the envelope the floor set defines — the desktop
   * probe stays a 390–1920 instrument and the mobile probe stays below the
   * desktop/mobile switch. A breakpoint outside it is counted, not sampled.
   */
  readonly maxWidth?: number;
  /** Root font size for `em` / `rem` conversion. Assumption, carried in the output. */
  readonly rootFontSizePx?: number;
  /**
   * Task 28.7 B2 — authored conditions read in ANOTHER browser context of the
   * SAME page in the SAME run, merged into `conditions` for this derivation.
   *
   * WHY. A site that serves a different DOM to mobile can serve different
   * sheets with it, and the pixel that governs the desktop/mobile tree switch
   * is normally authored in the DESKTOP-loaded stylesheets — which the mobile
   * pass never sees. The switch itself is inferred DOWNSTREAM and does not
   * exist at observe time, so the authored pixel is the only evidence available
   * here. Counts are summed per condition string, so a condition both contexts
   * author ranks above one only a single context does.
   */
  readonly crossContextConditions?: readonly AuthoredMediaConditionTally[];
  /**
   * Task 28.7 B2 — allow AUTHORED evidence to push this pass's width ceiling
   * ABOVE the floor set's own widest width. Off by default: the desktop pass
   * already covers its whole envelope, and an unrequested extension would widen
   * every pass silently.
   *
   * Never widens the envelope on its own. With no authored breakpoint above the
   * floor ceiling the envelope is unchanged and `envelopeExtension.extended` is
   * `false` — which is what keeps this from being a hardcoded larger ceiling.
   */
  readonly extendEnvelopeFromAuthored?: boolean;
  /**
   * Brackets allowed to push the ceiling. Defaults to
   * {@link MAX_ENVELOPE_EXTENSION_BRACKETS}.
   */
  readonly envelopeExtensionBrackets?: number;
  /**
   * Task 28.7 B2 — the width the envelope extension may never pass.
   *
   * The CALLER supplies it, because only the caller knows what the OTHER
   * context observed: it passes the width that context's own full observation
   * was taken at. Above that width the other context's tree is demonstrably
   * what renders — it was just observed rendering there — so an authored
   * breakpoint beyond it cannot be this pass's tree switch and buys nothing but
   * probe time. Defaults to {@link MAX_PROBE_WIDTH}; this file never names a
   * pixel value of its own.
   */
  readonly envelopeExtensionMaxWidth?: number;
}

export interface DerivedProbeWidths {
  /** The widths to probe: ascending, deduplicated, at most `cap` of them. */
  readonly widths: number[];
  /** The record written into `layout-probe.json`. */
  readonly provenance: ProbeWidthProvenance;
}

/**
 * Select the {@link MIN_GUARANTEED_FLOOR_WIDTHS} floor widths that can never be
 * evicted (Task 28.6 W6 O3), chosen by POSITION in the sorted floor list — the
 * narrowest, the widest, and (at count 3) the median — never by pixel value,
 * which would be the host-specific hack this engine forbids.
 *
 * Evenly spaced indices generalize "narrowest / median / widest" to any count
 * and any floor length: for the 7-width desktop floor and count 3 this picks
 * indices 0, 3, 6 — 390, 1024, 1920 — and for the 5-width mobile floor it picks
 * indices 0, 2, 4 — 390, 700, 914. `floorWidths` must already be ascending.
 */
export function pickGuaranteedFloor(
  floorWidths: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  if (floorWidths.length <= count) return [...floorWidths];
  if (count === 1) {
    return [floorWidths[Math.floor((floorWidths.length - 1) / 2)]!];
  }
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    indices.add(Math.round((i * (floorWidths.length - 1)) / (count - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((i) => floorWidths[i]!);
}

/** One breakpoint, ranked and bracketed. */
interface BracketCandidate {
  readonly px: number;
  readonly kind: MediaWidthBoundKind;
  readonly count: number;
  /** Last whole pixel on the low side of the authored change. */
  readonly below: number;
  /** First whole pixel on the high side. */
  readonly above: number;
}

/**
 * Derive the probe width set for ONE probe pass.
 *
 * Never throws: a malformed condition is the parser's `"unparsed"` status and
 * lands in a counter, and an input with no usable evidence degrades to the
 * floor set with a reason.
 */
export function deriveProbeWidths(
  input: DeriveProbeWidthsInput,
): DerivedProbeWidths {
  const floorWidths = [...new Set(input.floorWidths)]
    .filter((w) => Number.isInteger(w) && w > 0)
    .sort((a, b) => a - b);
  const requiredWidths = [...new Set(input.requiredWidths ?? [])]
    .filter((w) => Number.isInteger(w) && w > 0)
    .sort((a, b) => a - b);
  const cap = input.cap !== undefined && input.cap > 0 ? input.cap : MAX_PROBE_WIDTHS_TOTAL;
  const minWidth = input.minWidth ?? MIN_PROBE_WIDTH;
  // Task 28.7 B2 — the ceiling the FLOOR SET alone defines. Authored evidence
  // may move the working ceiling above it (see the envelope extension below);
  // this value stays the baseline every extension is reported against.
  const baseMaxWidth =
    input.maxWidth ?? (floorWidths.length > 0 ? floorWidths[floorWidths.length - 1]! : minWidth);
  const rootFontSizePx = input.rootFontSizePx ?? MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX;
  const conditionsDroppedByCollector = input.conditionsDroppedByCollector ?? 0;

  // --- fold the authored conditions ----------------------------------------
  // Task 28.7 B2 — this pass's own tally, plus (when the caller supplied it)
  // the tally another browser context of the SAME page read. Counts are summed
  // per condition string: a condition BOTH contexts author is authored twice
  // over and ranks accordingly. `undefined` on both sides stays `undefined` —
  // "no tally at all" is a different fact from "read, and empty".
  const mergedConditions = mergeConditionTallies(
    input.conditions,
    input.crossContextConditions,
  );
  const tally = mergedConditions ?? [];
  const histogram = foldMediaBreakpoints(
    // Sorted before folding so the fold is order-independent by input as well
    // as by construction; the fold's own output is already sorted.
    [...tally]
      .filter((t) => typeof t.condition === "string" && t.condition.trim() !== "")
      .sort((a, b) =>
        a.condition < b.condition ? -1 : a.condition > b.condition ? 1 : 0,
      )
      .map((t) => ({
        condition: parseMediaCondition(t.condition, { rootFontSizePx }),
        count: Number.isInteger(t.count) && t.count > 0 ? t.count : 1,
      })),
  );

  // --- rank the breakpoints -------------------------------------------------
  // (weight desc, px asc, kind asc). Total order: no two entries share
  // (px, kind), because the fold buckets on exactly that pair.
  const ranked: BracketCandidate[] = histogram.entries
    .map((e) => ({
      px: e.px,
      kind: e.kind,
      count: e.count,
      // `min` names the FIRST pixel at which the rule applies, so the authored
      // change sits between px-1 and px. `max` names the LAST pixel, so it sits
      // between px and px+1.
      below: e.kind === "min" ? e.px - 1 : e.px,
      above: e.kind === "min" ? e.px : e.px + 1,
    }))
    .sort((a, b) =>
      a.count !== b.count
        ? b.count - a.count
        : a.px !== b.px
          ? a.px - b.px
          : a.kind < b.kind
            ? -1
            : a.kind > b.kind
              ? 1
              : 0,
    );

  /* --- Task 28.7 B2: extend the ENVELOPE from authored evidence -------------
   *
   * THE DEFECT (28.6 defect A13). `maxWidth` defaults to the floor set's own
   * widest width, so every authored breakpoint above it was counted
   * `out-of-range` and never sampled. For the MOBILE pass that is exactly
   * wrong: the mobile tree is what renders up to the desktop/mobile switch, and
   * on 5 of 7 pilot sites the switch sits ABOVE the mobile ceiling — leaving a
   * band with no width evidence at all (915-1024 on three of them), which is
   * why a clone served a 390px layout at 1024.
   *
   * The switch is inferred DOWNSTREAM and does not exist here. The PIXEL that
   * governs it does: it is authored in the site's own CSS, normally in the
   * desktop-loaded stylesheets, which `crossContextConditions` brings in. So
   * the ceiling moves ONLY as far as an authored bracket above it, and by at
   * most {@link MAX_ENVELOPE_EXTENSION_BRACKETS} brackets — never to a fixed
   * larger number, which 28.6 rejected as a guess.
   *
   * NEAREST FIRST (by the bracket's high side, ascending), not by authored
   * weight: the question this answers is "how far above the floor ceiling does
   * the site's own evidence reach", and the nearest edge is the one that closes
   * the blind band. A page that authors nothing above the ceiling extends
   * nothing and records `extended: false`.
   */
  let maxWidth = baseMaxWidth;
  let envelopeExtension: ProbeWidthProvenance["envelopeExtension"];
  if (input.extendEnvelopeFromAuthored === true) {
    const bracketCap =
      input.envelopeExtensionBrackets !== undefined &&
      input.envelopeExtensionBrackets >= 0
        ? input.envelopeExtensionBrackets
        : MAX_ENVELOPE_EXTENSION_BRACKETS;
    const hardMaxWidth = Math.min(
      input.envelopeExtensionMaxWidth !== undefined &&
        input.envelopeExtensionMaxWidth > 0
        ? input.envelopeExtensionMaxWidth
        : MAX_PROBE_WIDTH,
      MAX_PROBE_WIDTH,
    );
    const candidates = ranked.filter(
      (b) => b.above > baseMaxWidth && b.below >= minWidth,
    );
    const aboveBase = candidates
      .filter((b) => b.above <= hardMaxWidth)
      .sort((a, b) =>
        a.above !== b.above
          ? a.above - b.above
          : a.kind < b.kind
            ? -1
            : a.kind > b.kind
              ? 1
              : 0,
      );
    const admitted = aboveBase.slice(0, bracketCap);
    for (const bracket of admitted) {
      if (bracket.above > maxWidth) maxWidth = bracket.above;
    }
    envelopeExtension = {
      baseMaxWidth,
      maxWidth,
      extended: maxWidth > baseMaxWidth,
      bracketCap,
      hardMaxWidth,
      bracketsAboveBase: candidates.length,
      bracketsBeyondHardMax: candidates.length - aboveBase.length,
      bracketsAdmitted: admitted.map((b) => ({
        px: b.px,
        kind: b.kind,
        count: b.count,
      })),
      crossContextConditions: (input.crossContextConditions ?? []).length,
      // Filled in below, once the adoption loop has decided what is sampled.
      widthsBeyondBase: [],
    };
  }

  // --- adopt brackets: floor seeded first, but only a GUARANTEED core of it
  // is protected from eviction (Task 28.6 W6 O3) -----------------------------
  const guaranteedFloorWidths = pickGuaranteedFloor(
    floorWidths,
    MIN_GUARANTEED_FLOOR_WIDTHS,
  );
  // Task 28.6 W7 O3.1 — the caller's required widths join the positional core.
  // A width a downstream pass hard-requires is not surplus coverage that can be
  // traded for an authored bracket; giving it up refuses that pass entirely.
  const guaranteedSet = new Set([...guaranteedFloorWidths, ...requiredWidths]);
  // Evictable floor widths still present in `chosen`. Eviction picks the
  // narrowest surplus sample first — deterministic, and it is also usually the
  // sample closest to the guaranteed core, so it is the least likely to be the
  // only interior sample covering some region.
  const evictableRemaining = new Set(
    floorWidths.filter((w) => !guaranteedSet.has(w)),
  );

  const chosen = new Map<number, ProbeWidthOrigin>();
  for (const width of floorWidths) {
    chosen.set(width, { width, source: "floor" });
  }
  // A required width outside the floor list still has to be sampled. Both
  // current callers pass their own observation width, which IS a floor width,
  // so this seeds nothing today; it exists so the guarantee holds for any
  // caller rather than only for the two that happen to overlap the floor.
  for (const width of requiredWidths) {
    if (!chosen.has(width)) chosen.set(width, { width, source: "operator" });
  }
  let breakpointsOutOfRange = 0;
  let breakpointsAlreadyBracketed = 0;
  let breakpointsAdopted = 0;
  let breakpointsDroppedByCap = 0;
  let breakpointsAdoptedByEviction = 0;
  let capHit = false;
  const floorWidthsEvicted: number[] = [];
  const refused: ProbeWidthProvenance["breakpointsRefused"] = [];
  let refusedListTruncated = false;
  const noteRefused = (
    bracket: BracketCandidate,
    reason: "cap" | "out-of-range",
  ): void => {
    if (refused.length >= MAX_LISTED_REFUSED_BREAKPOINTS) {
      refusedListTruncated = true;
      return;
    }
    refused.push({
      px: bracket.px,
      kind: bracket.kind,
      count: bracket.count,
      reason,
    });
  };

  for (const bracket of ranked) {
    if (bracket.below < minWidth || bracket.above > maxWidth) {
      // One side (or both) falls outside the envelope this probe pass covers.
      // The bracket is refused WHOLE — half a bracket moves a midpoint without
      // pinning the edge — and counted.
      breakpointsOutOfRange++;
      noteRefused(bracket, "out-of-range");
      continue;
    }
    const sides: { width: number; source: "authored-below" | "authored-above" }[] = [
      { width: bracket.below, source: "authored-below" },
      { width: bracket.above, source: "authored-above" },
    ];
    const missing = sides.filter((side) => !chosen.has(side.width));
    if (missing.length === 0) {
      // Both sides are already sampled (the floor set, or a wider bracket
      // adopted earlier). The breakpoint is honoured; no width is added.
      breakpointsAlreadyBracketed++;
      for (const side of sides) annotateAuthored(chosen, side.width, bracket);
      continue;
    }
    let evictedForThisBracket: number[] = [];
    if (chosen.size + missing.length > cap) {
      // Cap pressure. Task 28.6 W6 O3: before refusing this AUTHORED bracket,
      // try to buy room by evicting evictable (un-guaranteed) floor widths —
      // width the site never authored outranks nothing, once something the
      // site DID author needs its slot.
      const deficit = chosen.size + missing.length - cap;
      const candidates = [...evictableRemaining].sort((a, b) => a - b).slice(0, deficit);
      if (candidates.length < deficit) {
        // Evictable floor is exhausted (or was never enough) — only now does
        // the cap actually refuse an authored bracket.
        breakpointsDroppedByCap++;
        capHit = true;
        noteRefused(bracket, "cap");
        continue;
      }
      evictedForThisBracket = candidates;
      for (const w of evictedForThisBracket) {
        chosen.delete(w);
        evictableRemaining.delete(w);
        floorWidthsEvicted.push(w);
      }
    }
    for (const side of missing) {
      chosen.set(side.width, {
        width: side.width,
        source: side.source,
        breakpointPx: bracket.px,
        breakpointKind: bracket.kind,
      });
    }
    for (const side of sides) annotateAuthored(chosen, side.width, bracket);
    breakpointsAdopted++;
    if (evictedForThisBracket.length > 0) breakpointsAdoptedByEviction++;
  }

  floorWidthsEvicted.sort((a, b) => a - b);
  const widths = [...chosen.keys()].sort((a, b) => a - b);
  // Task 28.7 B2 — a width above the floor set's own ceiling exists only
  // because authored evidence extended the envelope. Marked per width so the
  // origin of every extended sample is inspectable, and listed on the
  // extension record so a reader does not have to diff the two.
  const origins = widths.map((w) => {
    const origin = chosen.get(w)!;
    return w > baseMaxWidth ? { ...origin, beyondFloorEnvelope: true } : origin;
  });
  if (envelopeExtension) {
    envelopeExtension = {
      ...envelopeExtension,
      widthsBeyondBase: widths.filter((w) => w > baseMaxWidth),
    };
  }
  // Task 28.6 W6 O3: counted directly rather than as `widths.length -
  // floorWidths.length`, which is only the same number while the floor set is
  // inevictable — see the field's doc.
  const widthsAdded = origins.filter(
    (o) => o.source === "authored-below" || o.source === "authored-above",
  ).length;

  /* --- degradation, told apart SIX ways ------------------------------------
   *
   * `degradedToFloor` states the fact: the returned set is the floor list and
   * nothing else. `degradedReason` states WHY, and the six causes are genuinely
   * different things a consumer would act on differently — "we could not read
   * this page's CSS" is not "this page authors no breakpoints" is not "the
   * budget ran out". Collapsing any pair of them would be the confident-wrong-
   * value bug this record exists to prevent.
   *
   * Fixed precedence, so the reason is deterministic when more than one applies.
   */
  const degradedToFloor = widthsAdded === 0;
  let degradedReason: ProbeWidthProvenance["degradedReason"];
  if (degradedToFloor) {
    if (mergedConditions === undefined) {
      // Neither this pass's own context NOR the cross-context tally existed.
      degradedReason = "no-condition-tally";
    } else if (
      input.sheetsTotal !== undefined &&
      input.sheetsTotal > 0 &&
      (input.sheetsReadable ?? 0) === 0
    ) {
      degradedReason = "authored-css-unreadable";
    } else if (breakpointsDroppedByCap > 0) {
      degradedReason = "cap-left-no-room";
    } else if (breakpointsOutOfRange > 0) {
      degradedReason = "breakpoints-out-of-range";
    } else if (breakpointsAlreadyBracketed > 0) {
      // NOT a degradation of evidence: the page DOES author breakpoints and the
      // floor set already samples both sides of every one of them. Reporting
      // this as "no-width-breakpoints" would claim the page authored none.
      degradedReason = "authored-breakpoints-already-bracketed";
    } else {
      degradedReason = "no-width-breakpoints";
    }
  }

  const provenance: ProbeWidthProvenance = {
    floorWidths,
    cap,
    capHit,
    origins,
    degradedToFloor,
    ...(degradedReason !== undefined ? { degradedReason } : {}),
    conditionsRead: tally.length,
    conditionsWeight: histogram.totalCount,
    conditionsDroppedByCollector,
    breakpointsFolded: histogram.entries.length,
    breakpointsOutOfRange,
    breakpointsAlreadyBracketed,
    breakpointsAdopted,
    breakpointsDroppedByCap,
    breakpointsRefused: refused,
    refusedListTruncated,
    widthsAdded,
    guaranteedFloorWidths,
    ...(requiredWidths.length > 0 ? { requiredWidths } : {}),
    floorWidthsEvicted,
    breakpointsAdoptedByEviction,
    conditionsWidthIrrelevant: histogram.widthIrrelevantCount,
    conditionsUnsupported: histogram.unsupportedCount,
    conditionsUnparsed: histogram.unparsedCount,
    queriesNonScreenSkipped: histogram.nonScreenSkippedCount,
    queriesEmptyInterval: histogram.emptyIntervalCount,
    rootFontSizePx,
    // Task 28.7 B2 — present ONLY when the caller asked for the extension, so
    // its absence means "not requested" and `extended: false` inside it means
    // "requested, and the site authored no evidence above the floor ceiling".
    ...(envelopeExtension ? { envelopeExtension } : {}),
  };
  return { widths, provenance };
}

/**
 * Task 28.7 B2 — merge two authored-condition tallies read in two browser
 * contexts of the SAME page in the SAME run.
 *
 * Counts are SUMMED per condition string (a condition both contexts author is
 * authored twice over and outranks one only a single context authored), the
 * output is sorted by condition so the merge is order-independent, and
 * `undefined` on both sides stays `undefined` — "there was no tally at all" is
 * a different fact from "the sheets were read and hold no `@media`", and the
 * degradation reason depends on telling them apart.
 */
function mergeConditionTallies(
  own: readonly AuthoredMediaConditionTally[] | undefined,
  other: readonly AuthoredMediaConditionTally[] | undefined,
): AuthoredMediaConditionTally[] | undefined {
  if (own === undefined && other === undefined) return undefined;
  const merged = new Map<string, number>();
  for (const tally of [...(own ?? []), ...(other ?? [])]) {
    if (typeof tally.condition !== "string") continue;
    const count =
      Number.isInteger(tally.count) && tally.count > 0 ? tally.count : 1;
    merged.set(tally.condition, (merged.get(tally.condition) ?? 0) + count);
  }
  return [...merged.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([condition, count]) => ({ condition, count }));
}

/**
 * Mark a width that is ALSO one side of an authored breakpoint. `source` keeps
 * the first reason the width entered the set (floor beats authored), so a floor
 * width never changes its `source` and the record stays comparable across runs;
 * `alsoAuthored` is how the authored reason survives. The FIRST breakpoint in
 * rank order wins the annotation, so it is deterministic when a width brackets
 * more than one.
 */
function annotateAuthored(
  chosen: Map<number, ProbeWidthOrigin>,
  width: number,
  bracket: BracketCandidate,
): void {
  const existing = chosen.get(width);
  if (existing === undefined) return;
  if (existing.alsoAuthored === true) return;
  if (existing.source === "authored-below" || existing.source === "authored-above") return;
  chosen.set(width, {
    ...existing,
    alsoAuthored: true,
    breakpointPx: bracket.px,
    breakpointKind: bracket.kind,
  });
}

/**
 * Fold an operator-supplied width set into an existing provenance record, so
 * every width a probe pass actually sampled carries a reason — including the
 * ones a `--probe-widths` flag added after the derivation ran.
 */
export function withOperatorWidths(
  provenance: ProbeWidthProvenance,
  probedWidths: readonly number[],
): ProbeWidthProvenance {
  const known = new Map(provenance.origins.map((o) => [o.width, o]));
  const origins: ProbeWidthOrigin[] = [...probedWidths]
    .sort((a, b) => a - b)
    .map((width) => known.get(width) ?? { width, source: "operator" as const });
  return { ...provenance, origins };
}
