import type { DecodedImage } from "../reconstruction-qa/screenshot-diff.js";
import type { ColumnComparison } from "./correspondence.js";
import { describeBlankRegions, detectBlankRegions } from "./blank-region.js";
import { describeTextCollisions, detectTextCollisions } from "./text-collision.js";
import {
  BLANK_REGION_BLOCKER_RATIO,
  CRITICAL_REGION_MAX_VIEWPORT_HEIGHT_RATIO,
  CRITICAL_REGION_TAGS,
  CRITICAL_TEXT_COLLISION_BLOCKER_ROWS,
  CRITICAL_TEXT_COLLISION_MAJOR_ROWS,
  MAX_TEXT_COLLISION_SAMPLES,
  TEXT_COLLISION_MIN_INTERSECTION_RATIO,
  BLANK_REGION_MAJOR_RATIO,
  BLANK_REGION_MINOR_RATIO,
  MIN_REGION_SUFFIX_SEGMENTS,
  REGION_FALLBACK_HEIGHT_TOLERANCE,
  REGION_INK_DOM_COVERAGE_MIN,
  REGION_SOURCE_MIN_DESCENDANTS,
  COLUMN_MODE_MAJOR_DELTA,
  DISTRIBUTION_MAJOR_P90_PX,
  DISTRIBUTION_MINOR_P90_PX,
  DUPLICATE_IMAGE_LAYER_TOLERANCE_PX,
  EMPTY_BAND_BLOCKER_EXCESS_RATIO,
  HORIZONTAL_OVERFLOW_MAJOR_EXCESS_PX,
  IMAGE_LAYER_FAILURE_MAJOR_EXCESS,
  IMAGE_PRESENCE_BLOCKER_RATIO,
  IMAGE_PRESENCE_MIN_SOURCE_IMAGES,
  LOGO_ROW_BUNCH_EXTENT_FACTOR,
  MIN_TRUSTWORTHY_MATCH_FRACTION,
  MISSING_TEXT_BLOCKER_RATIO,
  MISSING_TEXT_MAJOR_RATIO,
  NAV_LINK_BLOCKER_RATIO,
  NAV_LINK_MIN_SOURCE_LINKS,
  OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS,
  OFFSCREEN_TEXT_MAJOR_EXCESS_CHARS,
  OVERLAP_BLOCKER_EXCESS_RATIO,
  OVERLAP_MAJOR_EXCESS_RATIO,
  OVERLAP_MINOR_EXCESS_RATIO,
  PIXEL_RESIDUAL_MINOR_RATIO,
  PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO,
  PIXEL_VISIBLE_MAJOR_RATIO,
  RIGHT_GUTTER_MAJOR_EXCESS_RATIO,
  SCROLL_HEIGHT_MAJOR_MAX_RATIO,
  SCROLL_HEIGHT_MAJOR_MIN_RATIO,
  SOURCE_UNDER_RENDER_RATIO,
  TEXT_KEY_MAX_CHARS,
  VISIBLE_TEXT_BLOCKER_RATIO,
  WIDE_ELEMENT_VIEWPORT_FACTOR,
  type ChannelReading,
  type Classification,
  type CorrespondenceResult,
  type Finding,
  type MissingTextResult,
  type PageStateRecord,
  type PixelChannels,
  type ScrollReport,
  type Severity,
  type SideMeasurement,
  type Verdict,
} from "./types.js";

/**
 * The BLOCKER / MAJOR / MINOR rubric, in code (Task 28.6, lane W3).
 *
 * In Task 28.5C these three labels were typed into a literal in a throwaway
 * script. That made them unfalsifiable: there was no way to ask WHY 1024 was a
 * BLOCKER and 1440 was not, and no way to re-derive the answer on a different
 * build. Everything below is derived from measurements, every threshold is a
 * named constant in `types.ts` with its justification written next to it, and
 * every channel is RECORDED whether or not it fired.
 *
 * Two invariants, both forced by the 28.5C evidence:
 *
 *   RELATIVE. A channel that has a source analogue is scored against the
 *   SOURCE'S OWN VALUE AT THE SAME WIDTH. Real pages overflow, real pages have
 *   offscreen nodes, real pages overlap their own boxes. An absolute threshold
 *   measures the web; a relative one measures the reconstruction.
 *
 *   NEVER SUPPRESSING. There is no early return, no "if the pixel diff is small
 *   then stop looking". Every channel is evaluated, every reading is kept, and
 *   the verdict is the MAXIMUM severity found. A reader who distrusts the
 *   rubric has all the same numbers and the composite image to overrule it.
 */

interface Band {
  severity: Severity;
  threshold: number;
}

type ReadingInput = {
  channel: string;
  value: number;
  sourceValue: number | null;
  note: string;
  /** Bands ordered most-severe first. */
  bands: Band[];
  /** `higher` = value ≥ threshold fires; `lower` = value ≤ threshold fires. */
  direction: "higher" | "lower";
  /** When false the channel is recorded but cannot raise severity. */
  eligible?: boolean;
  /** Why it could not raise severity. Appended to the classification caveats. */
  ineligibleReason?: string;
  /**
   * TASK 28.8 FAST item 1. A CEILING on the severity this reading may report,
   * distinct from `eligible`.
   *
   * `eligible: false` says "this measurement cannot be trusted at all". A cap
   * says "this measurement is trusted, and the EVIDENCE BEHIND IT only supports
   * so much". The band the value hits is still computed and still recorded in
   * `threshold`; the finding is emitted at the capped severity and states why.
   *
   * Bands are ordered most-severe first, so the cap is applied by dropping to
   * the first band at or below it.
   */
  severityCap?: Severity;
  /** Required whenever `severityCap` is set: what evidence limited it. */
  severityCapReason?: string;
  summary: (value: number, threshold: number) => string;
};


class RubricAccumulator {
  readonly channels: ChannelReading[] = [];
  readonly findings: Finding[] = [];
  readonly caveats: string[] = [];
  /**
   * WP-C GUARD 1, the whole mechanism. One nullable string that, once set,
   * makes EVERY channel evaluated after it ineligible.
   *
   * The alternative was to thread `eligible:` through fifteen separate
   * `evaluate()` calls by hand — and six of the channels that fire (
   * `overlap-excess-ratio`, `scroll-height-ratio-high`,
   * `scroll-height-ratio-low`, `logo-row-overlap`, `logo-row-bunching`,
   * `pixel-visible-difference-ratio`) take no `eligible` argument at all today,
   * so the odds of missing one, and of the next channel added missing it too,
   * are high. A gate that has to be remembered is not a gate. This one is
   * remembered once, at the top of `classifyPair`, and applies by construction
   * to every channel that exists now or later.
   */
  private suppression: string | null = null;

  /**
   * Hold every SUBSEQUENT channel ineligible, with one stated reason.
   *
   * Channels already evaluated are untouched on purpose: the gate channel that
   * decides to call this has to be able to fire itself.
   */
  suppressEveryFurtherChannel(reason: string): void {
    this.suppression = reason;
    this.caveat(reason);
  }

  evaluate(input: ReadingInput): void {
    const suppressed = this.suppression;
    const eligible = input.eligible !== false && suppressed === null;
    const ineligibleReason =
      suppressed !== null
        ? suppressed
        : input.eligible === false
          ? input.ineligibleReason
          : undefined;
    let firedAt: Severity | null = null;
    let firedThreshold: number | null = null;
    for (const band of input.bands) {
      const hit =
        input.direction === "higher"
          ? input.value >= band.threshold
          : input.value <= band.threshold;
      if (hit) {
        firedAt = band.severity;
        firedThreshold = band.threshold;
        break;
      }
    }
    if (!eligible && firedAt !== null) {
      if (ineligibleReason && !this.caveats.includes(ineligibleReason)) {
        this.caveats.push(ineligibleReason);
      }
      firedAt = null;
    }
    // THE CAP. Applied after the band is chosen, so `threshold` still reports
    // the band the value actually reached and the demotion is visible rather
    // than disguised as a lower measurement.
    let cappedFrom: Severity | null = null;
    if (
      firedAt !== null &&
      input.severityCap !== undefined &&
      SEVERITY_ORDER[firedAt] > SEVERITY_ORDER[input.severityCap]
    ) {
      cappedFrom = firedAt;
      firedAt = input.severityCap;
      if (input.severityCapReason && !this.caveats.includes(input.severityCapReason)) {
        this.caveats.push(input.severityCapReason);
      }
    }
    // Said in the reading's own words, so a reader of the artifact sees the
    // demotion and its reason without having to know this class exists.
    const capNote =
      cappedFrom === null
        ? ""
        : ` — SEVERITY CAPPED to ${firedAt} from ${cappedFrom}: ${input.severityCapReason ?? "the evidence behind this reading does not support the band it reached"}`;
    this.channels.push({
      channel: input.channel,
      value: input.value,
      sourceValue: input.sourceValue,
      // A suppressed channel reports no threshold: a `threshold` beside
      // `firedAt: null` reads as "measured and cleared", and this channel was
      // not cleared, it was never asked.
      threshold: eligible ? firedThreshold : null,
      firedAt,
      note: input.note + capNote,
      ...(ineligibleReason ? { ineligibleReason } : {}),
    });
    if (firedAt !== null && firedThreshold !== null) {
      this.findings.push({
        severity: firedAt,
        channel: input.channel,
        summary: input.summary(input.value, firedThreshold) + capNote,
        value: input.value,
        sourceValue: input.sourceValue,
        threshold: firedThreshold,
      });
    }
  }

  /** A channel with no bands: recorded so a reader can see it, never fires. */
  record(channel: string, value: number, sourceValue: number | null, note: string): void {
    this.channels.push({
      channel,
      value,
      sourceValue,
      threshold: null,
      firedAt: null,
      note,
      // A recorded channel has no bands, so a gate cannot change what it says.
      // It still carries the reason, because a reader scanning `channels[]` for
      // "why did nothing fire on this pair" must find the same answer on every
      // row rather than only on the ones that have bands.
      ...(this.suppression ? { ineligibleReason: this.suppression } : {}),
    });
  }

  caveat(text: string): void {
    if (!this.caveats.includes(text)) this.caveats.push(text);
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { BLOCKER: 3, MAJOR: 2, MINOR: 1 };

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : round4(numerator / denominator);
}

/**
 * TASK 28.8 FAST, ITEM 1 — the severity ceiling for `blank-region-ratio`.
 *
 * The channel's VALUE stays the full blanked ratio: every region the detector
 * reported is still reported, and shrinking the number would hide them. What
 * changes is how far that number is allowed to carry the pair's verdict.
 *
 * A finding may reach whatever band the CORROBORATED area reaches on its own —
 * the area where meaningful source content is measurably missing or unpainted
 * on the clone ({@link regionCorroboratesContentAbsence}) — and no further.
 * Blanked area with no corroboration is extra padding, a taller gap, or a
 * section drawn on plain ground where the source drew a panel; those are real
 * differences, they are worth MINOR, and they are not a broken page.
 *
 * `seoultone.kr / @1440` is the case this exists for: 0.5767 of a viewport
 * blanked across `div/footer` and `div/header`, both carrying every leaf the
 * source carries, both inking exactly like text that painted normally. It
 * graded BLOCKER; a human auditor found no missing section anywhere on the page
 * and graded the pair MAJOR on an unrelated defect.
 */
export function blankRegionSeverityCap(corroboratedRatio: number): Severity {
  if (corroboratedRatio >= BLANK_REGION_BLOCKER_RATIO) return "BLOCKER";
  if (corroboratedRatio >= BLANK_REGION_MAJOR_RATIO) return "MAJOR";
  return "MINOR";
}

export interface ClassifyInput {
  source: SideMeasurement;
  clone: SideMeasurement;
  correspondence: CorrespondenceResult;
  columns: ColumnComparison;
  missing: MissingTextResult;
  /** The containment test run the other way; recorded, never fired on. */
  missingReverse?: MissingTextResult;
  pixels: PixelChannels;
  /** What each side's scroll-to-settle pass actually did (item C3.13). Optional
   *  so a caller measuring two static DOMs need not fabricate one; when both
   *  are present the depth ratio is recorded as a channel. */
  sourceScroll?: ScrollReport;
  cloneScroll?: ScrollReport;
  /**
   * WP-C GUARD 1. The HTTP status each side's document answered with, when the
   * caller knows it (`SideProvenance.httpStatus`).
   *
   * Until this existed, `httpStatus` was read in exactly ONE place in the whole
   * repository — a display-only evidence string in `buildLimitations` — and the
   * classifier never referenced it at all. A clone route that 404s was
   * therefore graded by the identical code path as a clone route that renders:
   * the server's own error page has no text, no images, no nav and no footer,
   * so ONE missing route manufactured a full column of independent-looking
   * content BLOCKERS and inflated the count that the whole exercise is trying
   * to measure.
   *
   * `undefined` and `null` both mean "not known" and neither can trip the gate;
   * see {@link cloneRouteGate}.
   */
  sourceHttpStatus?: number | null;
  cloneHttpStatus?: number | null;
  /**
   * WP-C GUARD 1. `false` when the harness knows the clone route was never
   * built at all — no document to request, so there is no status to read. Left
   * undefined when the question was not asked.
   */
  cloneRouteBuilt?: boolean;
  /**
   * TASK 28.75, ITEM B7. What page STATE each side was actually captured in.
   *
   * The observer dismisses entry popups before it collects. Until 28.75 the QA
   * source capture did not, so the two rendered the same URL into two different
   * page states and every text channel charged the clone the difference. On
   * `seoultone.kr / @390` the source screenshot shows the entry popup, the clone
   * correctly shows the hero underneath, and `missing-text-ratio` billed the
   * clone for the popup's copy.
   *
   * Both sides now run the same shared normalization
   * (`docs/result/28.75/page-state-api-contract.md`) and hand the record here,
   * because normalization can FAIL: an overlay can qualify and refuse to close,
   * or the 2-dismissal cap can bite. When that happens on the SOURCE the pair is
   * not comparable, and the honest response is to say so on the channels it
   * affects rather than to charge the clone anyway.
   *
   * `undefined` means the caller did not run the phase (a fixture, or an older
   * artifact) and is never read as "nothing was found".
   */
  sourcePageState?: PageStateRecord;
  clonePageState?: PageStateRecord;
  /**
   * Task 28.75, the INK leg. The two full-page screenshots, decoded, so the
   * blank-region channel can ask what a region's PIXELS look like and not only
   * what its DOM claims.
   *
   * OPTIONAL, and the omission is visible in the artifact rather than silent:
   * `blank-region-ink-only-count` says so in its note and the channel then runs
   * DOM-only. `CAPTURE_DEVICE_SCALE_FACTOR` is 1, so a region box in CSS px
   * indexes these images directly.
   */
  sourceImage?: DecodedImage;
  cloneImage?: DecodedImage;
}

/** 2xx: the server answered with a document. */
function isSuccessStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 200 && status < 300;
}

export interface CloneRouteGateResult {
  missing: boolean;
  /** Stated in full so it can go straight into the finding and into every
   *  suppressed channel's `ineligibleReason`. */
  reason: string;
  sourceHttpStatus: number | null;
  cloneHttpStatus: number | null;
}

/**
 * WP-C GUARD 1: did the SOURCE serve a document where the CLONE did not?
 *
 * THE RULE. The source's status must be a 2xx — the gate never fires off an
 * unknown source — and the clone must have either answered with an ERROR status
 * (>= 400) or never been built at all.
 *
 * WHY >= 400 AND NOT "ANYTHING THAT IS NOT 2xx". Playwright follows redirects,
 * and `captureSide` records the FIRST response whose URL equals the URL it
 * asked for, which for a redirect is the 3xx itself. Treating 3xx as missing
 * would condemn every trailing-slash normalisation and every locale redirect as
 * a missing route — a false BLOCKER, which is the same disease as the one this
 * guard cures, pointed the other way. The cost is stated plainly in the report:
 * a clone route that redirects INTO a 404 is recorded as its 3xx and this gate
 * does not see it; the content channels then grade it, exactly as they did
 * before this guard existed.
 */
export function cloneRouteGate(input: {
  sourceHttpStatus?: number | null;
  cloneHttpStatus?: number | null;
  cloneRouteBuilt?: boolean;
}): CloneRouteGateResult {
  const sourceHttpStatus = input.sourceHttpStatus ?? null;
  const cloneHttpStatus = input.cloneHttpStatus ?? null;
  const sourceServed = isSuccessStatus(sourceHttpStatus);
  const notBuilt = input.cloneRouteBuilt === false;
  const cloneErrored = typeof cloneHttpStatus === "number" && cloneHttpStatus >= 400;
  const missing = sourceServed && (notBuilt || cloneErrored);
  return {
    missing,
    reason: missing
      ? `the clone did not serve this route: the source answered HTTP ${sourceHttpStatus}${
          notBuilt
            ? " and the clone route was never built"
            : ` and the clone answered HTTP ${cloneHttpStatus}`
        }. Every content channel below is measured against the clone server's error document, not against a reconstruction of this page, so none of them can raise severity — the missing route is the ONE defect on this pair`
      : "",
    sourceHttpStatus,
    cloneHttpStatus,
  };
}

export function classifyPair(input: ClassifyInput): Classification {
  const {
    source,
    clone,
    correspondence,
    columns,
    missing,
    missingReverse,
    pixels,
    sourceScroll,
    cloneScroll,
  } = input;
  const rubric = new RubricAccumulator();

  // -- 0. WP-C GUARD 1: is there a clone page here at all? ------------------
  //
  // THE SHORT-CIRCUIT, and it is deliberately a short-circuit rather than
  // fifteen hand-placed `eligible:` arguments. This channel is evaluated FIRST,
  // while the accumulator is still ungated, so it can fire; the moment it does,
  // `suppressEveryFurtherChannel` makes every channel below it — every channel
  // that exists today and every channel anyone adds later — record its measured
  // value with `firedAt: null` and this reason attached. The pair ends with a
  // BLOCKER verdict and exactly ONE finding, and a reader comparing the
  // top-line verdict against `channels[]` finds no contradiction: the verdict
  // says "no route", and every other row says "not asked, because there was no
  // route".
  const gate = cloneRouteGate(input);
  rubric.evaluate({
    channel: "clone-route-missing",
    value: gate.missing ? 1 : 0,
    sourceValue: gate.sourceHttpStatus,
    note: `HTTP status of the document each side served: source ${gate.sourceHttpStatus ?? "unknown"}, clone ${gate.cloneHttpStatus ?? "unknown"}. Fires only when the source answered 2xx AND the clone answered 4xx/5xx or was never built; a 3xx is a redirect Playwright followed, not a missing route, and never fires here`,
    direction: "higher",
    bands: [{ severity: "BLOCKER", threshold: 1 }],
    summary: () =>
      `the clone has no page at this route (source HTTP ${gate.sourceHttpStatus ?? "unknown"}, clone ${gate.cloneHttpStatus === null ? "route not built" : `HTTP ${gate.cloneHttpStatus}`}) — every other channel on this pair is measured against an error document and is held ineligible`,
  });
  if (gate.missing) rubric.suppressEveryFurtherChannel(gate.reason);

  // -- 0b. PAGE STATE: is this pair comparable at all? (item B7) -----------
  //
  // Two captures of the same URL are only comparable if they are in the same
  // page STATE. The observer dismisses entry popups before it collects; until
  // 28.75 this harness's source capture did not, so on a page with an entry
  // overlay the source screenshot showed the popup, the clone correctly showed
  // the hero underneath, and every text channel billed the clone for copy the
  // engine had deliberately removed. Both sides now run the observer's own
  // normalization from the one shared implementation.
  //
  // Normalization can still FAIL — an overlay can qualify and refuse to close,
  // or the 2-dismissal cap can bite with something still qualifying — and when
  // it fails ON THE SOURCE the pair is not comparable. THAT IS DECLARED, not
  // absorbed: the two channels a standing source overlay directly corrupts are
  // held ineligible with a reason, rather than firing against a page state the
  // clone was never asked to reproduce.
  const sourcePageState = input.sourcePageState;
  const clonePageState = input.clonePageState;
  const sourceOverlayStanding =
    sourcePageState !== undefined &&
    sourcePageState.ran &&
    (sourcePageState.qualifiedNotDismissed > 0 || sourcePageState.attemptCapHit);
  const pageStateComparable = !sourceOverlayStanding;
  const pageStateReason = sourceOverlayStanding
    ? `the SOURCE capture still carries ${sourcePageState!.qualifiedNotDismissed} entry overlay(s) that qualified for dismissal and did not close${sourcePageState!.attemptCapHit ? " (the dismissal cap was reached with something still qualifying)" : ""}, so the two sides are in DIFFERENT PAGE STATES: the clone is built from an observation the engine normalized and does not carry that overlay. The text-presence channels are recorded and held ineligible rather than charging the clone for copy it was never asked to reproduce — see docs/result/28.75/page-state-api-contract.md`
    : undefined;
  if (sourcePageState !== undefined || clonePageState !== undefined) {
    rubric.record(
      "page-state-source-overlays-dismissed",
      sourcePageState?.dismissed ?? 0,
      sourcePageState?.qualified ?? 0,
      `entry overlays the SOURCE capture dismissed before probing, of ${sourcePageState?.qualified ?? 0} that qualified (${sourcePageState?.qualifiedNotDismissed ?? 0} still standing; initial-paint census ${sourcePageState?.initialPaintCensusStatus ?? "not run"}${sourcePageState?.initialPaintCensusAvailable === false ? ", so appeared-after-initial-paint could not contribute evidence" : ""}). This is the observer's own normalization, from the one shared implementation, and it is what makes the source's page state the same page state the clone was generated from`,
    );
    rubric.record(
      "page-state-clone-overlays-dismissed",
      clonePageState?.dismissed ?? 0,
      clonePageState?.qualified ?? 0,
      `the SAME normalization run on the CLONE, as a CHECK rather than a fix: a reconstruction built from a normalized observation should have no entry overlay left to dismiss, so 0 is the expected reading and a non-zero one says the engine reproduced an entry popup. ${clonePageState?.dismissed ?? 0} dismissed of ${clonePageState?.qualified ?? 0} qualified, ${clonePageState?.qualifiedNotDismissed ?? 0} still standing`,
    );
    rubric.record(
      "page-state-comparable",
      pageStateComparable ? 1 : 0,
      null,
      pageStateComparable
        ? "1 — both sides reached the same normal page state, so a missing-text reading on this pair is attributable to real content loss rather than to an entry overlay standing on one side only"
        : `0 — ${pageStateReason}`,
    );
    if (pageStateReason) rubric.caveat(pageStateReason);
    if (sourcePageState?.initialPaintCensusAvailable === false) {
      rubric.caveat(
        `the source capture's initial-paint census was ${sourcePageState.initialPaintCensusStatus}, so the normalizer's STRONG \`appeared-after-initial-paint\` signal could not contribute on this page-load; an entry overlay whose only evidence was "it was not there at first paint" would not have been dismissed`,
      );
    }
  }

  // -- 1. missing content (the primary BLOCKER signal) ---------------------
  rubric.evaluate({
    channel: "missing-text-ratio",
    value: missing.missingRatio,
    sourceValue: null,
    note: `${missing.missingChars} of ${missing.sourceVisibleChars} source visible characters are not painted by the clone at a token boundary — ${missing.missingOccurrences} of ${missing.sourceOccurrences} text-node occurrences over ${missing.missingStringCount} of ${missing.sourceStringCount} distinct strings. Numerator and denominator are the SAME census: occurrences counted, lengths untruncated (item C3.10). ${missing.absentChars} of those characters are absent from the clone even as a raw substring and ${missing.boundaryOnlyChars} over ${missing.boundaryOnlyStringCount} strings appear only inside a longer word (the \`US\` in \`customers\` class); ${missing.truncatedSourceKeys} source keys were longer than the ${TEXT_KEY_MAX_CHARS}-character key limit, so their containment test ran on a prefix`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: MISSING_TEXT_BLOCKER_RATIO },
      { severity: "MAJOR", threshold: MISSING_TEXT_MAJOR_RATIO },
      // Values are rounded to 4 decimals, so 0.0001 is the smallest non-zero
      // reading: any missing text at all is at least a MINOR finding.
      { severity: "MINOR", threshold: 0.0001 },
    ],
    // ITEM B7. A pair whose two sides are in different page states cannot
    // support this channel's claim, and the honest move is to say so.
    eligible: pageStateComparable,
    ...(pageStateReason ? { ineligibleReason: pageStateReason } : {}),
    summary: (value, threshold) =>
      `${(value * 100).toFixed(2)}% of the source's visible text is missing from the clone (threshold ${(threshold * 100).toFixed(2)}%)`,
  });

  rubric.record(
    "missing-text-absent-ratio",
    missing.absentRatio,
    null,
    `the LOOSER reading of the same test (item C3.10): ${missing.absentChars} of ${missing.sourceVisibleChars} source characters whose string the clone does not contain even as a raw substring, over ${missing.absentStringCount} distinct strings. missing-text-ratio is the STRICT reading and is what fires; the difference between the two is missing-text-boundary-only-chars`,
  );
  rubric.record(
    "missing-text-script-relaxed-chars",
    missing.scriptRelaxedChars,
    null,
    `${missing.scriptRelaxedChars} characters over ${missing.scriptRelaxedStringCount} strings that the clone DOES paint and the pre-G2, English-only boundary rule would have reported as missing anyway, because the source key's edge sits in a script with no orthographic word boundary (Han, Hangul, Kana, Thai, Lao, Khmer, Myanmar). \`missingChars + missing-text-script-relaxed-chars\` is what that rule would have reported; on a Latin-script source this is 0 by construction. Measured against the shipped function on Korean pilot text, the English-only rule scored \`진료시간\` inside a clone's \`진료시간안내\` as 100.00 % missing while the identical English shape scored 0.00 %`,
  );
  rubric.record(
    "missing-text-boundary-only-chars",
    missing.boundaryOnlyChars,
    null,
    `${missing.boundaryOnlyChars} characters over ${missing.boundaryOnlyStringCount} strings that the clone contains as a raw substring but never at a token boundary. This is the population the old \`indexOf\` containment test silently counted as PRESENT — it is where the source's \`US\` currency prefix hid inside the clone's \`customers\` — and it is also where a source that splits a word across text nodes would land, so it is counted apart rather than folded in`,
  );
  if (missingReverse) {
    rubric.record(
      "missing-text-reverse-ratio",
      missingReverse.missingRatio,
      null,
      `${missingReverse.missingChars} of ${missingReverse.sourceVisibleChars} CLONE visible characters appear nowhere in the source (${missingReverse.missingStringCount} distinct strings). Recorded, never fired on: the forward channel is asymmetric, and without this number a floor of 0% cannot be distinguished from a second capture that simply happened to be a superset of the first`,
    );
  }

  // -- 1b. ITEM G1: what the unified visibility rule stopped counting -------
  //
  // Recorded on BOTH sides, because the number that matters is the DIFFERENCE:
  // a clone that bakes a source's scroll-reveal pre-reveal state hides text the
  // source paints, and before G1 both censuses counted it as painted, so
  // `missing-text-ratio` read 0.0000 on blocks that were blank to a reader.
  rubric.record(
    "opacity-hidden-text-chars",
    clone.opacityHiddenTextChars,
    source.opacityHiddenTextChars,
    `characters inside an \`opacity: 0\` subtree — laid out, not \`display:none\`, not \`visibility:hidden\`, and blank to a reader. They are OUT of visibleTextChars and out of the missing-text census on both sides (item G1); before that unification the text census counted them as painted while the box census did not. Clone ${clone.opacityHiddenTextChars} over ${clone.opacityHiddenTextNodes} text nodes, source ${source.opacityHiddenTextChars} over ${source.opacityHiddenTextNodes}. A clone number far ABOVE the source's is a clone that baked a pre-reveal animation state`,
  );
  rubric.record(
    "opacity-hidden-nodes",
    clone.opacityHiddenNodes,
    source.opacityHiddenNodes,
    `laid-out elements painting nothing because \`opacity: 0\` sits on them or on an ancestor; ${clone.opacityHiddenByAncestorNodes} of the clone's and ${source.opacityHiddenByAncestorNodes} of the source's are hidden by an ANCESTOR only — the population the pre-G1 box census counted as visible, since \`opacity\` does not inherit. Clone has ${clone.zeroOpacityNodes} elements whose own opacity is 0, source ${source.zeroOpacityNodes}`,
  );

  // -- 2. major section missing --------------------------------------------
  rubric.evaluate({
    channel: "visible-text-ratio",
    value: ratio(clone.visibleTextChars, source.visibleTextChars),
    sourceValue: source.visibleTextChars,
    note: `clone renders ${clone.visibleTextChars} visible characters against the source's ${source.visibleTextChars}; a ratio far above 1 is normal because the clone ships both viewport subtrees`,
    direction: "lower",
    bands: [{ severity: "BLOCKER", threshold: VISIBLE_TEXT_BLOCKER_RATIO }],
    // ITEM B7, same reason as missing-text-ratio: an entry overlay standing on
    // the source only adds characters to the denominator.
    eligible: pageStateComparable,
    ...(pageStateReason ? { ineligibleReason: pageStateReason } : {}),
    summary: (value, threshold) =>
      `the clone renders only ${(value * 100).toFixed(1)}% of the source's visible text (threshold ${(threshold * 100).toFixed(0)}%) — a major section did not render`,
  });

  // -- 2b. the SOURCE did not render (the false-PASS direction) ------------
  //
  // Every other channel in this rubric asks whether the clone is worse than the
  // source. This one asks whether the source arrived at all, because a source
  // that did not render makes the clone look perfect: there is no text to be
  // missing, no box to be displaced and nothing to overlap. It is the only
  // failure mode in the harness that produces a FALSE PASS, so it is checked
  // explicitly and it is checked before anything reads the numbers.
  rubric.evaluate({
    channel: "source-under-render-suspected",
    value: ratio(source.visibleTextChars, clone.visibleTextChars),
    sourceValue: clone.visibleTextChars,
    note: `source rendered ${source.visibleTextChars} visible characters over ${source.totalNodes} elements (scrollHeight ${source.scrollHeight}); clone rendered ${clone.visibleTextChars} over ${clone.totalNodes} (scrollHeight ${clone.scrollHeight})`,
    direction: "lower",
    bands: [{ severity: "BLOCKER", threshold: SOURCE_UNDER_RENDER_RATIO }],
    summary: (value, threshold) =>
      `the SOURCE rendered only ${(value * 100).toFixed(1)}% of the clone's visible text (${source.visibleTextChars} characters over ${source.totalNodes} elements, threshold ${(threshold * 100).toFixed(0)}%) — this is a failed source capture, NOT a clone defect, and every other channel on this pair is measured against a page that did not arrive`,
  });

  // -- 3. horizontal clipping: unreachable content (28.5C's channel) -------
  const offscreenExcess = clone.offscreenTextChars - source.offscreenTextChars;
  rubric.evaluate({
    channel: "offscreen-text-excess-chars",
    value: offscreenExcess,
    sourceValue: source.offscreenTextChars,
    note: `${clone.offscreenTextChars} characters sit in boxes starting at or past the right edge (source: ${source.offscreenTextChars}); with scrollWidth ${clone.scrollWidth} and innerWidth ${clone.innerWidth} they ${clone.scrollWidth > clone.innerWidth + 1 ? "can" : "cannot"} be scrolled to`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS },
      { severity: "MAJOR", threshold: OFFSCREEN_TEXT_MAJOR_EXCESS_CHARS },
      { severity: "MINOR", threshold: 1 },
    ],
    summary: (value, threshold) =>
      `${value} more characters than the source begin past the right edge (threshold ${threshold})`,
  });
  rubric.record(
    "offscreen-nodes",
    clone.offscreenNodes,
    source.offscreenNodes,
    "visible boxes whose left edge is at or past the viewport's right edge",
  );
  rubric.record(
    "overflowing-nodes",
    clone.overflowingNodes,
    source.overflowingNodes,
    "visible boxes that start inside the viewport and extend past its right edge",
  );

  // -- 4. hero / footer clipped --------------------------------------------
  const footerClipped =
    source.footer.elementCount > 0 &&
    clone.footer.elementCount > 0 &&
    source.footer.fullyInsideViewport &&
    !clone.footer.fullyInsideViewport;
  rubric.evaluate({
    channel: "footer-clipped",
    value: footerClipped ? 1 : 0,
    sourceValue: source.footer.fullyInsideViewport ? 0 : 1,
    note: `footer landmarks: source ${source.footer.elementCount} (max right ${source.footer.maxRight}/${source.innerWidth}), clone ${clone.footer.elementCount} (max right ${clone.footer.maxRight}/${clone.innerWidth})`,
    direction: "higher",
    bands: [{ severity: "BLOCKER", threshold: 1 }],
    summary: () =>
      `the footer extends past the viewport's right edge (clone max right ${clone.footer.maxRight} > ${clone.innerWidth}) while the source's does not`,
  });
  rubric.record(
    "footer-visible-text-ratio",
    ratio(clone.footer.visibleTextChars, source.footer.visibleTextChars),
    source.footer.visibleTextChars,
    "footer completeness: clone footer visible characters over the source's",
  );

  // -- 4b. landmark boxes too wide to be a statistic (item C3.3) ------------
  //
  // `maxRight` excludes boxes wider than 1.5 viewports so a legitimately
  // full-bleed wrapper cannot make the statistic meaningless. That exclusion
  // used to be SILENT, and it pointed the wrong way: the worse a landmark's
  // horizontal overflow, the more certainly the offending box was dropped from
  // the measurement. Two things changed. The clipping test
  // (`fullyInsideViewport`, which feeds the footer-clipped BLOCKER above) now
  // sees every box, wide ones included. And the exclusions themselves are
  // counted here and fire, so an omission became a finding.
  const sourceWideLandmarks =
    source.header.wideElementsExcluded + source.footer.wideElementsExcluded;
  const cloneWideLandmarks =
    clone.header.wideElementsExcluded + clone.footer.wideElementsExcluded;
  rubric.evaluate({
    channel: "landmark-wide-element-excess",
    value: cloneWideLandmarks - sourceWideLandmarks,
    sourceValue: sourceWideLandmarks,
    note: `boxes inside header/nav or footer wider than ${WIDE_ELEMENT_VIEWPORT_FACTOR}× the viewport: clone ${cloneWideLandmarks} (widest header ${clone.header.widestExcludedWidth}px, footer ${clone.footer.widestExcludedWidth}px in a ${clone.innerWidth}px viewport), source ${sourceWideLandmarks} (widest header ${source.header.widestExcludedWidth}px, footer ${source.footer.widestExcludedWidth}px). Landmark right edges with nothing excluded: clone header ${clone.header.maxRightIncludingWide}px / footer ${clone.footer.maxRightIncludingWide}px, source header ${source.header.maxRightIncludingWide}px / footer ${source.footer.maxRightIncludingWide}px`,
    direction: "higher",
    bands: [{ severity: "MAJOR", threshold: 1 }],
    summary: (value) =>
      `${value} more box(es) inside the clone's header or footer are wider than ${WIDE_ELEMENT_VIEWPORT_FACTOR}× the ${clone.innerWidth}px viewport than in the source (widest ${Math.max(clone.header.widestExcludedWidth, clone.footer.widestExcludedWidth)}px)`,
  });
  rubric.record(
    "content-wide-leaf-excess",
    clone.wideLeavesExcluded - source.wideLeavesExcluded,
    source.wideLeavesExcluded,
    `leaf boxes excluded from the contentMaxRight statistic for being wider than ${WIDE_ELEMENT_VIEWPORT_FACTOR}× the viewport: clone ${clone.wideLeavesExcluded} (widest ${clone.widestExcludedLeafWidth}px, unfiltered content right edge ${clone.contentMaxRightIncludingWide}px), source ${source.wideLeavesExcluded} (widest ${source.widestExcludedLeafWidth}px, unfiltered ${source.contentMaxRightIncludingWide}px). Counted rather than dropped; the horizontal-overflow and offscreen channels see these boxes`,
  );

  // -- 5. large overlap, split three ways (WP-C GUARD 3) --------------------
  //
  // `overlap-excess-ratio` reads the TRUE overlap: two different things landing
  // on top of each other. Two other populations used to be inside it and are
  // now demoted to channels of their own, each with its own count:
  //
  //   duplicate-image-stack   the same picture drawn twice in the same box —
  //                           a <picture> under its own <img>, a placeholder
  //                           under its full-res source, a crossfade holding
  //                           two layers. ONE thing on screen; not a collapse.
  //   image-layer-state       an image whose asset never painted. The resource
  //                           failure is the defect and the channel below owns
  //                           it; charging the same square pixels a second time
  //                           as a layout collapse double-counts one fault.
  //
  // NEITHER demotion is silent. The undemoted total is recorded one channel
  // down, the demoted pair counts are recorded beside it, and
  // `Classification.demotions` carries them as numbers the run artifact's
  // coverage block sums — so a blocker count that falls because of this split
  // can be told apart from a clone that got better.
  const undemotedOverlapExcess = round4(
    clone.overlapAreaRatio - source.overlapAreaRatio,
  );
  const overlapExcess = round4(
    clone.trueOverlapAreaRatio - source.trueOverlapAreaRatio,
  );
  rubric.evaluate({
    channel: "overlap-excess-ratio",
    value: overlapExcess,
    sourceValue: source.trueOverlapAreaRatio,
    note: `TRUE overlap — two different visual owners in the same place: clone ${clone.trueOverlapPairCount} leaf pairs covering ${clone.trueOverlapArea} px² (${(clone.trueOverlapAreaRatio * 100).toFixed(2)}% of the viewport), source ${source.trueOverlapPairCount} pairs / ${(source.trueOverlapAreaRatio * 100).toFixed(2)}%. Demoted out of these numbers: ${clone.duplicateImageStackPairCount} duplicate image layer(s) and ${clone.failedImageLayerOverlapPairCount} overlap(s) on a failed image asset on the clone, ${source.duplicateImageStackPairCount} and ${source.failedImageLayerOverlapPairCount} on the source. Totals including everything: clone ${clone.overlapPairCount} pairs / ${(clone.overlapAreaRatio * 100).toFixed(2)}%, source ${source.overlapPairCount} / ${(source.overlapAreaRatio * 100).toFixed(2)}%`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: OVERLAP_BLOCKER_EXCESS_RATIO },
      { severity: "MAJOR", threshold: OVERLAP_MAJOR_EXCESS_RATIO },
      { severity: "MINOR", threshold: OVERLAP_MINOR_EXCESS_RATIO },
    ],
    summary: (value, threshold) =>
      `visible boxes overlap over ${(value * 100).toFixed(2)}% more of the viewport than the source's do (threshold ${(threshold * 100).toFixed(2)}%)`,
  });
  // -- 5a2. LOCAL TEXT COLLISION IN A CRITICAL REGION (Task 28.8 FAST, item 2) --
  //
  // The channel above is an AREA over a viewport, summed over the document, and
  // it cannot see text printed over text: two collided glyph boxes are a few
  // thousand px² on a page of tens of millions. That defect is the most
  // widespread class in the 28.8 corpus (1 blocker, 4 majors across two
  // unrelated sites) and no channel here could reach it.
  //
  // This one counts ROWS inside COMPACT CRITICAL REGIONS, so it is never
  // averaged over a page height, and it is read against the SOURCE's own count
  // at the same width like everything else: a source that already overprints
  // its own footer cancels out and the clone is charged only for what it added.
  const cloneCollisions = detectTextCollisions(clone.regions, clone.leaves, {
    innerHeight: clone.innerHeight,
    maxSamples: MAX_TEXT_COLLISION_SAMPLES,
  });
  const sourceCollisions = detectTextCollisions(source.regions, source.leaves, {
    innerHeight: source.innerHeight,
    maxSamples: MAX_TEXT_COLLISION_SAMPLES,
  });
  const collisionExcess = Math.max(
    0,
    cloneCollisions.collidingRows - sourceCollisions.collidingRows,
  );
  rubric.evaluate({
    channel: "critical-text-collision-rows",
    value: collisionExcess,
    sourceValue: sourceCollisions.collidingRows,
    note: `pairs of DIFFERENT text nodes whose glyph boxes intersect over at least ${(TEXT_COLLISION_MIN_INTERSECTION_RATIO * 100).toFixed(0)}% of the smaller box, inside a region whose TAG is one of ${[...CRITICAL_REGION_TAGS].join("/")} and which is at most ${(CRITICAL_REGION_MAX_VIEWPORT_HEIGHT_RATIO * 100).toFixed(0)}% of a viewport tall. Regions identified by generic HTML structure only — never a hostname, a class name or copy. CLONE: ${cloneCollisions.collidingRows} collided pair(s) across ${cloneCollisions.collidingRegions} of its ${cloneCollisions.criticalRegions} critical region(s). SOURCE: ${sourceCollisions.collidingRows} across ${sourceCollisions.collidingRegions} of ${sourceCollisions.criticalRegions}. The value is the clone's EXCESS, so a source that overprints its own footer cancels. Worst on the clone: ${describeTextCollisions(cloneCollisions, 3)}${cloneCollisions.comparisonsTruncated || sourceCollisions.comparisonsTruncated ? ". THE PER-LEAF COMPARISON CAP BIT on at least one side, so this count is a lower bound" : ""}`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: CRITICAL_TEXT_COLLISION_BLOCKER_ROWS },
      { severity: "MAJOR", threshold: CRITICAL_TEXT_COLLISION_MAJOR_ROWS },
    ],
    summary: (value, threshold) =>
      `${value} row(s) of text are printed over other text inside a ${cloneCollisions.worst[0]?.regionTag ?? "critical"} block the reader has to read (threshold ${threshold}): ${describeTextCollisions(cloneCollisions, 2)}`,
  });
  rubric.record(
    "critical-text-collision-regions",
    cloneCollisions.collidingRegions,
    sourceCollisions.collidingRegions,
    `distinct compact critical regions holding at least one collided row, both sides. Recorded beside the row count so one badly broken block and one collided row in each of four blocks can be told apart. Critical regions examined: clone ${cloneCollisions.criticalRegions}, source ${sourceCollisions.criticalRegions} — a page with none of them reports 0 rows because it has nowhere to look, not because it is clean`,
  );
  rubric.record(
    "overlap-excess-ratio-undemoted",
    undemotedOverlapExcess,
    source.overlapAreaRatio,
    `the SAME excess computed over every overlapping pair, duplicate image layers and failed image assets included — the number the rubric read before WP-C guard 3. Recorded, never fired on directly: the part of it the guard removed is graded on its own in overlap-demoted-excess-ratio (item L1), so this row stays a plain reconstruction of the old reading and a falling blocker count can be attributed`,
  );
  // -- 5b. THE DEMOTED AREA IS ITSELF GRADED (Task 28.75, item L1) ---------
  //
  // WP-C guard 3 removes area from `overlap-excess-ratio` on the strength of
  // ONE claim: "this area is not a defect — it is how the platform draws a
  // picture, or it is a resource failure another channel owns." Until now that
  // claim was unfalsifiable per pair. `overlap-excess-ratio-undemoted` carried
  // the number the guard removed, but it went to `record()`, which has no
  // bands, so no amount of demoted area could ever move a verdict. A guard that
  // can only ever subtract, and whose subtraction nothing can question, is the
  // shape of an instrument that quietly stops finding things.
  //
  // The claim IS falsifiable, and against evidence this run already holds: the
  // SOURCE is rendered by the same browser, at the same width, under the same
  // pinning policy (`animations: "disabled"`, videos paused and rewound). A
  // `<picture>` that renders as two layers, or an asset that fails to decode,
  // does so on the source too — so a genuine platform artefact CANCELS in a
  // clone-minus-source reading and this channel stays silent. Demoted area that
  // does NOT cancel is area the clone piled up and the guard excused with an
  // explanation the source refuses to corroborate.
  //
  // The bands are the overlap channel's OWN bands, unchanged and untuned: this
  // is the same quantity (viewport-fractions of collided area, relative to the
  // source) read over the population the guard removed, so grading it on a
  // different scale would be inventing a number. It cannot double-count the
  // primary channel: the two populations are disjoint by construction, and on
  // every real pair measured to date both demoted populations are EMPTY on both
  // sides, so this reads exactly 0 and adds no finding.
  const demotedOverlapExcess = round4(
    clone.duplicateImageStackAreaRatio +
      clone.failedImageLayerOverlapAreaRatio -
      source.duplicateImageStackAreaRatio -
      source.failedImageLayerOverlapAreaRatio,
  );
  rubric.evaluate({
    channel: "overlap-demoted-excess-ratio",
    value: demotedOverlapExcess,
    sourceValue: round4(
      source.duplicateImageStackAreaRatio + source.failedImageLayerOverlapAreaRatio,
    ),
    note: `the area WP-C guard 3 removed from overlap-excess-ratio, read the way every other channel in this rubric is read — against the source's own value at the same width. Clone: ${clone.duplicateImageStackPairCount} duplicate-layer pair(s) over ${clone.duplicateImageStackArea} px² plus ${clone.failedImageLayerOverlapPairCount} failed-asset pair(s) over ${clone.failedImageLayerOverlapArea} px² (${((clone.duplicateImageStackAreaRatio + clone.failedImageLayerOverlapAreaRatio) * 100).toFixed(2)}% of the viewport). Source: ${source.duplicateImageStackPairCount} + ${source.failedImageLayerOverlapPairCount} pair(s) over ${source.duplicateImageStackArea} + ${source.failedImageLayerOverlapArea} px² (${((source.duplicateImageStackAreaRatio + source.failedImageLayerOverlapAreaRatio) * 100).toFixed(2)}%). A stacked layer the platform genuinely draws appears on BOTH sides and cancels here; what is left is stacking the clone invented, which the guard's explanation does not cover`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: OVERLAP_BLOCKER_EXCESS_RATIO },
      { severity: "MAJOR", threshold: OVERLAP_MAJOR_EXCESS_RATIO },
      { severity: "MINOR", threshold: OVERLAP_MINOR_EXCESS_RATIO },
    ],
    summary: (value, threshold) =>
      `the overlap guard demoted ${(value * 100).toFixed(2)}% more of the viewport on the clone than the same guard demotes on the source (threshold ${(threshold * 100).toFixed(2)}%) — that area is excused by an explanation the source does not corroborate`,
  });
  rubric.record(
    "duplicate-image-stack",
    clone.duplicateImageStackPairCount,
    source.duplicateImageStackPairCount,
    `overlapping leaf pairs that are the SAME image key or the same visual owner occupying the SAME box to within ${DUPLICATE_IMAGE_LAYER_TOLERANCE_PX}px on every edge: clone ${clone.duplicateImageStackPairCount} pair(s) over ${clone.duplicateImageStackArea} px², source ${source.duplicateImageStackPairCount} over ${source.duplicateImageStackArea} px². Key equality alone is NOT the test — two different repeated components piled up by a real layout bug share a key too — which is why identical geometry is required as well. Recorded, never fired on: a stacked layer is how the platform renders a picture`,
  );
  rubric.record(
    "duplicate-image-stack-area-ratio",
    clone.duplicateImageStackAreaRatio,
    source.duplicateImageStackAreaRatio,
    "the demoted duplicate-layer area as a fraction of the viewport, so the size of what was taken out of overlap-excess-ratio is legible without recomputing it",
  );
  rubric.evaluate({
    channel: "image-layer-state",
    value: clone.failedImageLeafCount - source.failedImageLeafCount,
    sourceValue: source.failedImageLeafCount,
    note: `image leaves whose backing asset did not decode (\`complete && naturalWidth > 0\` is false): clone ${clone.failedImageLeafCount} failed / ${clone.loadedImageLeafCount} loaded of ${clone.imageLeafCount} image leaves, source ${source.failedImageLeafCount} failed / ${source.loadedImageLeafCount} loaded of ${source.imageLeafCount}. Leaves whose load state cannot be read from script (inline SVG, canvas, iframe) are in NEITHER count. The ${clone.failedImageLayerOverlapPairCount} overlap pair(s) involving a failed clone asset are demoted out of overlap-excess-ratio and belong to THIS channel: a broken image is a resource failure, and counting its box a second time as a layout collapse would report one fault twice`,
    direction: "higher",
    bands: [{ severity: "MAJOR", threshold: IMAGE_LAYER_FAILURE_MAJOR_EXCESS }],
    summary: (value, threshold) =>
      `${value} more image asset(s) failed to paint in the clone than in the source (${clone.failedImageLeafCount} against ${source.failedImageLeafCount}, threshold ${threshold})`,
  });
  if (clone.overlapComparisonsTruncated || source.overlapComparisonsTruncated) {
    rubric.caveat(
      "the overlap sweep hit its per-leaf comparison cap on at least one side; the overlap area is a lower bound",
    );
  }

  // -- 6. unusable navigation ----------------------------------------------
  rubric.evaluate({
    channel: "nav-link-ratio",
    value: ratio(clone.header.visibleLinkCount, source.header.visibleLinkCount),
    sourceValue: source.header.visibleLinkCount,
    note: `header/nav landmarks: source ${source.header.elementCount} element(s) with ${source.header.visibleLinkCount} visible links, clone ${clone.header.elementCount} with ${clone.header.visibleLinkCount}`,
    direction: "lower",
    bands: [{ severity: "BLOCKER", threshold: NAV_LINK_BLOCKER_RATIO }],
    eligible: source.header.visibleLinkCount >= NAV_LINK_MIN_SOURCE_LINKS,
    ineligibleReason: `the source shows fewer than ${NAV_LINK_MIN_SOURCE_LINKS} visible header/nav links at this width, so the navigation-completeness channel cannot fire`,
    summary: (value, threshold) =>
      `the clone shows ${clone.header.visibleLinkCount} of the source's ${source.header.visibleLinkCount} visible header/nav links (${(value * 100).toFixed(0)}%, threshold ${(threshold * 100).toFixed(0)}%)`,
  });

  // -- 7. pathological whitespace ------------------------------------------
  const emptyBandExcess = round4(
    clone.largestEmptyBandRatio - source.largestEmptyBandRatio,
  );
  rubric.evaluate({
    channel: "empty-band-excess-ratio",
    value: emptyBandExcess,
    sourceValue: source.largestEmptyBandRatio,
    note: `largest vertical band with no visible content: clone ${clone.largestEmptyBand}px at y=${clone.largestEmptyBandTop} of ${clone.scrollHeight} (${(clone.largestEmptyBandRatio * 100).toFixed(1)}%); source ${source.largestEmptyBand}px of ${source.scrollHeight} (${(source.largestEmptyBandRatio * 100).toFixed(1)}%)`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: EMPTY_BAND_BLOCKER_EXCESS_RATIO },
      { severity: "MAJOR", threshold: EMPTY_BAND_BLOCKER_EXCESS_RATIO / 2 },
      { severity: "MINOR", threshold: 0.02 },
    ],
    summary: (value, threshold) =>
      `an empty vertical band covers ${(value * 100).toFixed(1)}% more of the page than the source's largest (threshold ${(threshold * 100).toFixed(1)}%)`,
  });

  const gutterExcess = round4(clone.rightGutterRatio - source.rightGutterRatio);
  rubric.evaluate({
    channel: "right-gutter-excess-ratio",
    value: gutterExcess,
    sourceValue: source.rightGutterRatio,
    note: `unused right gutter: clone ${clone.rightGutter}px of ${clone.innerWidth} (content ends at ${clone.contentMaxRight}); source ${source.rightGutter}px of ${source.innerWidth} (content ends at ${source.contentMaxRight})`,
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: RIGHT_GUTTER_MAJOR_EXCESS_RATIO },
      { severity: "MINOR", threshold: 0.05 },
    ],
    summary: (value, threshold) =>
      `${(value * 100).toFixed(1)}% more of the viewport width is dead space on the right than on the source (threshold ${(threshold * 100).toFixed(0)}%) — content stops at ${clone.contentMaxRight}px in a ${clone.innerWidth}px viewport`,
  });

  // -- 7b. BLANK REGIONS (Task 28.75) --------------------------------------
  //
  // THE CHANNEL THIS RUBRIC DID NOT HAVE. Every channel above is a PAGE TOTAL,
  // and a total cannot see a hole. `gs.severance.healthcare /gs/index.do @1440`
  // graded MINOR with `image-presence-ratio 1.0`, `missing-text-ratio 0.0000`
  // and `visible-text-ratio 1.0` on a clone whose NEWS row carries none of the
  // source's four cards and whose promotional carousel carries none of its
  // four, because every character and every image is still SOMEWHERE on the
  // clone — displaced, not dropped (`left-edge-delta-median-px 1542`). Section
  // 7's `empty-band-excess-ratio` is the closest existing channel and it cannot
  // see this either: it sweeps FULL-WIDTH bands, and a hole beside a photo or a
  // card row inside a filled section is never full width.
  //
  // This channel asks the only question that finds it — "the source paints this
  // rectangle; does the clone paint the corresponding one?" — and it asks it of
  // MEANINGFUL CONTAINERS, never of whitespace. See `blank-region.ts` for the
  // seven independent measurements that must agree before a region is reported
  // and the eighth that vetoes a mis-paired one.
  const blanks = detectBlankRegions(
    { ...source, ...(input.sourceImage ? { image: input.sourceImage } : {}) },
    { ...clone, ...(input.cloneImage ? { image: input.cloneImage } : {}) },
  );
  rubric.evaluate({
    channel: "blank-region-ratio",
    value: blanks.ratio,
    sourceValue: blanks.populatedViewportRatio,
    note: `regions the SOURCE populates and the CLONE leaves empty, unioned so nesting cannot double-count them: ${blanks.blankedAreaPx} px² = ${blanks.ratio} of a ${source.innerWidth}×${source.innerHeight} viewport, over ${blanks.regions.length} region(s) (${blanks.displacedCount} displaced — the clone container still holds a visible DOM subtree that paints elsewhere; ${blanks.absentCount} absent — there is nothing left to paint). The source's own populated region area is ${blanks.populatedViewportRatio} viewports over ${blanks.populatedSourceRegions} of its ${blanks.sourceRegions} selected regions. Correspondence: ${blanks.pairedRegions} of ${blanks.sourceRegions} regions paired by tag-path suffix (≥ ${MIN_REGION_SUFFIX_SEGMENTS} segments), ${blanks.fallbackRegions} populated region(s) fell back to the source rectangle, ${blanks.unjudgedRegions} could not be judged because the two pages differ in height by more than ${(REGION_FALLBACK_HEIGHT_TOLERANCE * 100).toFixed(0)}%. Largest single hole ${blanks.largestViewportRatio} of a viewport. Paired regions sit a median ${blanks.medianTopOffset}px lower and ${blanks.medianLeftOffset}px right of the source's, so the two coordinate systems are ${blanks.alignedGeometry ? "aligned and a raw source rectangle may be read on the clone" : "NOT aligned and only ancestor-anchored mapping is trusted"}. Regions: ${describeBlankRegions(blanks)}`,
    direction: "higher",
    bands: [
      { severity: "BLOCKER", threshold: BLANK_REGION_BLOCKER_RATIO },
      { severity: "MAJOR", threshold: BLANK_REGION_MAJOR_RATIO },
      { severity: "MINOR", threshold: BLANK_REGION_MINOR_RATIO },
    ],
    // A clone whose leaf census was truncated has a paint measurement that is a
    // LOWER BOUND on its later regions, which is the direction that invents a
    // hole. The channel is recorded and refused rather than trusted.
    eligible: !blanks.leavesTruncated && !blanks.regionsTruncated,
    severityCap: blankRegionSeverityCap(blanks.corroboratedRatio),
    severityCapReason:
      blanks.corroboratedRatio >= blanks.ratio
        ? undefined
        : `${blanks.corroboratedRatio} of the ${blanks.ratio} viewports of blanked area is CORROBORATED as missing content — the source region carries text or image leaves AND the clone's counterpart lost them, has no subtree left to paint, or inks below what its own DOM claims it paints. The remaining ${round4(blanks.ratio - blanks.corroboratedRatio)} is area that merely reads emptier than the source: extra padding, a taller gap, or a section drawn on plain ground where the source drew a panel or a photograph. That is a real difference and it is graded by the pixel and layout channels; it cannot by itself carry this pair to BLOCKER. ${blanks.corroboratedCount} of ${blanks.regions.length} reported region(s) corroborate`,
    ineligibleReason: blanks.leavesTruncated
      ? `the leaf-box cap was reached on at least one side, so paint inside a late region is a lower bound and an empty reading there cannot be told from an unmeasured one; the blank-region channel is recorded and cannot raise severity on this pair`
      : `the REGION cap was reached on at least one side. That census truncates in DOCUMENT ORDER, so it loses counterparts at the BOTTOM of the page and manufactures holes there — the direction that invents findings; the blank-region channel is recorded and cannot raise severity on this pair`,
    summary: (value, threshold) =>
      `${blanks.regions.length} region(s) the source fills are empty in the clone, covering ${(value * 100).toFixed(0)}% of a viewport (threshold ${(threshold * 100).toFixed(0)}%): ${describeBlankRegions(blanks, 3)}`,
  });
  rubric.record(
    "blank-region-count",
    blanks.regions.length,
    blanks.populatedSourceRegions,
    `maximal blanked regions against populated source regions. A blanked region wholly inside another blanked one is dropped before this count, so nesting depth cannot inflate it`,
  );
  rubric.record(
    "blank-region-largest-viewport-ratio",
    blanks.largestViewportRatio,
    null,
    `the single largest hole, as a fraction of one viewport. Recorded, never fired on: the band is defined on the union, and a page with one big hole and a page with four medium ones are the same amount of missing to a reader`,
  );
  rubric.record(
    "blank-region-displaced-count",
    blanks.displacedCount,
    null,
    `blanked regions whose CLONE container still holds ${REGION_SOURCE_MIN_DESCENDANTS}+ visible DOM descendants: the content exists and lands somewhere else. A layout fault, and the reason the page totals balance`,
  );
  rubric.record(
    "blank-region-absent-count",
    blanks.absentCount,
    null,
    `blanked regions whose clone counterpart has no visible subtree to paint, or no counterpart at all. A content fault; missing-text-ratio usually sees these and never sees the displaced ones`,
  );
  rubric.record(
    "blank-region-ink-only-count",
    blanks.inkOnlyCount,
    blanks.domOnlyCount,
    blanks.inkAvailable
      ? `blanked regions the INK leg reported and the DOM leg did not (value), against the ones only the DOM saw (sourceValue). The two legs answer different questions and BOTH are needed: the severance hero has a PERFECT DOM — right geometry, opacity 1, image decoded, headline text present — and is a white rectangle to a reader because the clone paints the body background over it, so only ink sees it; the promotional carousel one band below still paints that section's photograph, so its ink is high and only the DOM sees that its four cards are gone`
      : `THE INK LEG DID NOT RUN on this pair, so every reading here is DOM-only — the configuration in which the severance hero (perfect DOM, white-on-white pixels) reports as healthy. Withheld because ${blanks.inkWithheldReason}. DOM-vs-pixel coverage: source ${blanks.sourceDomPixelCoverage}, clone ${blanks.cloneDomPixelCoverage} (floor ${REGION_INK_DOM_COVERAGE_MIN})`,
  );
  rubric.record(
    "region-census-selected",
    clone.regionAccounting.selected,
    source.regionAccounting.selected,
    `the region census, both sides. CLONE: ${clone.regionAccounting.selected} selected + ${clone.regionAccounting.rejected} rejected = ${clone.regionAccounting.examined} examined${clone.regionAccounting.truncated ? " (CAP REACHED)" : ""}, refused as ${clone.regionAccounting.rejectedByReason.map((r) => `${r.reason} ${r.count}`).join(", ")}. SOURCE: ${source.regionAccounting.selected} + ${source.regionAccounting.rejected} = ${source.regionAccounting.examined}${source.regionAccounting.truncated ? " (CAP REACHED)" : ""}, refused as ${source.regionAccounting.rejectedByReason.map((r) => `${r.reason} ${r.count}`).join(", ")}. Node counts are not cross-side comparable — the clone ships both viewport subtrees — but the SELECTED counts are, because everything the clone ships and does not paint lands in \`not-visible\``,
  );
  if (!blanks.inkAvailable) {
    rubric.caveat(
      `THE INK LEG WAS WITHHELD on this pair (${blanks.inkWithheldReason}), so the blank-region channel ran DOM-only. A hole whose clone DOM is intact and whose pixels are flat — paint occlusion, the severance hero's failure — is INVISIBLE in that configuration, and the blank-region reading here is a lower bound. DOM-vs-pixel coverage: source ${blanks.sourceDomPixelCoverage}, clone ${blanks.cloneDomPixelCoverage}, floor ${REGION_INK_DOM_COVERAGE_MIN}`,
    );
  }
  if (blanks.unjudgedRegions > 0) {
    rubric.caveat(
      `${blanks.unjudgedRegions} populated source region(s) paired with nothing in the clone AND could not be re-measured by rectangle, because the two pages differ in height by more than ${(REGION_FALLBACK_HEIGHT_TOLERANCE * 100).toFixed(0)}%; the blank-region ratio is a lower bound on this pair`,
    );
  }
  if (blanks.regionsTruncated) {
    rubric.caveat(
      "the region census hit its cap on at least one side; the blank-region channel covers the first regions in document order only",
    );
  }

  // -- 8. important image or video missing ---------------------------------
  rubric.evaluate({
    channel: "image-presence-ratio",
    value: ratio(clone.imageLeafCount, source.imageLeafCount),
    sourceValue: source.imageLeafCount,
    note: `visible image/SVG leaves: clone ${clone.imageLeafCount}, source ${source.imageLeafCount}`,
    direction: "lower",
    bands: [{ severity: "BLOCKER", threshold: IMAGE_PRESENCE_BLOCKER_RATIO }],
    eligible: source.imageLeafCount >= IMAGE_PRESENCE_MIN_SOURCE_IMAGES,
    ineligibleReason: `the source has fewer than ${IMAGE_PRESENCE_MIN_SOURCE_IMAGES} visible images at this width, so the image-presence channel cannot fire`,
    summary: (value, threshold) =>
      `the clone renders ${clone.imageLeafCount} of the source's ${source.imageLeafCount} visible images (${(value * 100).toFixed(0)}%, threshold ${(threshold * 100).toFixed(0)}%)`,
  });
  rubric.record(
    "video-count",
    clone.videoCount,
    source.videoCount,
    `videos pinned to their first frame: clone ${clone.videosPinned}/${clone.videoCount}, source ${source.videosPinned}/${source.videoCount}`,
  );

  // -- 9. responsive layout MODE -------------------------------------------
  const columnDelta = Math.abs(clone.maxColumns - source.maxColumns);
  const sourceTop = source.columnContainers[0];
  const cloneTop = clone.columnContainers[0];
  rubric.evaluate({
    channel: "column-mode-delta",
    value: columnDelta,
    sourceValue: source.maxColumns,
    note:
      `widest structural column count: clone ${clone.maxColumns}, source ${source.maxColumns}. ` +
      `Largest container — source ${sourceTop ? `${sourceTop.childCount} children in ${sourceTop.rowCount} row(s), modal ${sourceTop.modalPerRow}/row, ${sourceTop.display} ${sourceTop.containerWidth}px` : "none"}; ` +
      `clone ${cloneTop ? `${cloneTop.childCount} children in ${cloneTop.rowCount} row(s), modal ${cloneTop.modalPerRow}/row, ${cloneTop.display} ${cloneTop.containerWidth}px` : "none"}`,
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: COLUMN_MODE_MAJOR_DELTA },
      { severity: "MINOR", threshold: 1 },
    ],
    summary: (value, threshold) =>
      `the clone's widest row holds ${clone.maxColumns} items where the source's holds ${source.maxColumns} (delta ${value}, threshold ${threshold}) — a different responsive layout mode`,
  });
  const worstMismatch = columns.mismatches[0];
  rubric.evaluate({
    channel: "column-container-mode-delta",
    value: columns.worstModeDelta,
    sourceValue: worstMismatch ? worstMismatch.sourceModalPerRow : null,
    note:
      `${columns.matchedContainers} of ${columns.sourceContainers} source containers matched a clone container by path suffix; ` +
      `${columns.mismatches.length} differ in column count` +
      (worstMismatch
        ? `. Worst: ${worstMismatch.path} — source ${worstMismatch.sourceChildCount} children as ${worstMismatch.sourceRowCount} row(s) of ${worstMismatch.sourceModalPerRow} in ${worstMismatch.sourceContainerWidth}px, clone ${worstMismatch.cloneChildCount} children as ${worstMismatch.cloneRowCount} row(s) of ${worstMismatch.cloneModalPerRow} in ${worstMismatch.cloneContainerWidth}px`
        : ""),
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: COLUMN_MODE_MAJOR_DELTA },
      { severity: "MINOR", threshold: 1 },
    ],
    eligible: columns.matchedContainers > 0,
    ineligibleReason:
      "no flex/grid container matched between the two sides by path suffix, so the per-container layout-mode channel cannot fire",
    summary: (value, threshold) =>
      worstMismatch
        ? `a matched container lays its children out as ${worstMismatch.cloneRowCount} row(s) of ${worstMismatch.cloneModalPerRow} where the source uses ${worstMismatch.sourceRowCount} row(s) of ${worstMismatch.sourceModalPerRow} (delta ${value}, threshold ${threshold}) — a different responsive layout mode`
        : `a matched container's column count differs by ${value} (threshold ${threshold})`,
  });
  rubric.record(
    "column-containers-matched",
    columns.matchedContainers,
    columns.sourceContainers,
    "flex/grid containers paired between the two sides by longest common path suffix",
  );

  // -- 10. distribution: where every matched box actually landed ------------
  //
  // ONE positional channel, not two (item C3.9). The left edge and the right
  // edge of a box move together on almost every real defect — a displaced or
  // reflowed block carries both — so firing a MAJOR on each of them reported
  // ONE defect TWICE and inflated `majorCount` accordingly. On this harness's
  // own evidence run the two p90s were 394/394, 225/231, 320/320 and 696/696 px
  // on the four pairs where they fired. They are still both RECORDED, because
  // the case where they genuinely differ — a box in the right place at the
  // wrong width — is a different defect that needs a different fix.
  //
  // ITEM G3. The channel now reads the ON-VIEWPORT population only. Off-viewport
  // pairs — those whose SOURCE box begins at or past the viewport's right edge —
  // are the source's own parked content, and on a carousel-bearing page they
  // dominated the number: 4,623-5,232px on gs.severance.healthcare's homepage
  // against 0-943px on the same clone's carousel-free route. They are still
  // measured, still counted and still recorded, one channel down.
  const positionalTrustworthy =
    correspondence.trustworthy && correspondence.onViewportMatchedPairs > 0;
  const distributionCaveat = !correspondence.trustworthy
    ? `only ${(correspondence.matchedFractionOfContentKeyed * 100).toFixed(1)}% of the source's ${correspondence.contentKeyedSourceLeaves} content-keyed leaf boxes matched a clone box, below the ${(MIN_TRUSTWORTHY_MATCH_FRACTION * 100).toFixed(0)}% needed to trust a distribution; the position channel is recorded but cannot raise severity`
    : correspondence.onViewportMatchedPairs === 0
      ? `all ${correspondence.matchedPairs} matched boxes have a SOURCE box that begins at or past the viewport's right edge (innerWidth ${correspondence.sourceInnerWidth}px), so there is no on-viewport population to measure a position from; the off-viewport distribution is recorded in position-delta-offviewport-p90-px (item G3)`
      : undefined;
  rubric.evaluate({
    channel: "position-delta-p90-px",
    value: correspondence.positionDeltaP90,
    sourceValue: null,
    note:
      `worse of the two edge distributions over the ${correspondence.onViewportMatchedPairs} of ${correspondence.matchedPairs} matched boxes whose SOURCE box begins inside the ${correspondence.sourceInnerWidth}px viewport — ` +
      `right: median ${correspondence.onViewportRightDelta.median}px, p90 ${correspondence.onViewportRightDelta.p90}px, max ${correspondence.onViewportRightDelta.max}px; ` +
      `left: median ${correspondence.onViewportLeftDelta.median}px, p90 ${correspondence.onViewportLeftDelta.p90}px, max ${correspondence.onViewportLeftDelta.max}px. ` +
      `The other ${correspondence.offViewportMatchedPairs} pairs are content the SOURCE parks off-screen (item G3); they are excluded from this channel, counted, and reported in position-delta-offviewport-p90-px. Over ALL pairs the same statistic reads ${correspondence.positionDeltaP90AllPairs}px. ` +
      `Matched ${correspondence.contentKeyedMatchedPairs} of the ${correspondence.contentKeyedSourceLeaves} content-keyed source leaves (${(correspondence.matchedFractionOfContentKeyed * 100).toFixed(1)}%) ` +
      `(${(correspondence.matchedFraction * 100).toFixed(1)}% of all ${correspondence.sourceLeaves}), ${correspondence.ambiguousPairs} pairs from repeated or structural keys`,
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: DISTRIBUTION_MAJOR_P90_PX },
      { severity: "MINOR", threshold: DISTRIBUTION_MINOR_P90_PX },
    ],
    eligible: positionalTrustworthy,
    ...(distributionCaveat ? { ineligibleReason: distributionCaveat } : {}),
    summary: (value, threshold) =>
      `9 in 10 of the ${correspondence.onViewportMatchedPairs} on-viewport matched boxes land within ${value}px of their source edge and the rest are worse, up to ${Math.max(correspondence.onViewportLeftDelta.max, correspondence.onViewportRightDelta.max)}px (threshold ${threshold}px; left p90 ${correspondence.onViewportLeftDelta.p90}px, right p90 ${correspondence.onViewportRightDelta.p90}px — these two move together on a displaced block and are ONE finding)`,
  });
  rubric.record(
    "position-delta-offviewport-pairs",
    correspondence.offViewportMatchedPairs,
    correspondence.matchedPairs,
    `matched pairs whose SOURCE box begins at or past the viewport's right edge (innerWidth ${correspondence.sourceInnerWidth}px) — content the source itself parks off-screen, typically a carousel track's non-active slides. EXCLUDED from position-delta-p90-px and counted here, never silently skipped (item G3). A clone that throws ON-screen source content off the viewport is NOT in this population: the test reads the source side only, and that defect stays in the firing channel and in offscreen-text-excess-chars`,
  );
  rubric.record(
    "position-delta-offviewport-p90-px",
    correspondence.offViewportPositionDeltaP90,
    null,
    `the same statistic over the ${correspondence.offViewportMatchedPairs} excluded pairs: right median ${correspondence.offViewportRightDelta.median}px / p90 ${correspondence.offViewportRightDelta.p90}px / max ${correspondence.offViewportRightDelta.max}px, left median ${correspondence.offViewportLeftDelta.median}px / p90 ${correspondence.offViewportLeftDelta.p90}px / max ${correspondence.offViewportLeftDelta.max}px. Recorded, never fired on: where a source's own off-screen track parks a slide is not a fidelity requirement, and reporting it as a whole-page displacement was the defect`,
  );
  rubric.record(
    "position-delta-p90-all-pairs-px",
    correspondence.positionDeltaP90AllPairs,
    null,
    "the PRE-G3 reading of the position channel, over every matched pair with no viewport split. Recorded so a rubric-2 artifact and a rubric-3 artifact of the same pair remain comparable on this channel; it is never fired on",
  );
  rubric.record(
    "right-edge-delta-p90-px",
    correspondence.rightDelta.p90,
    null,
    "right-edge component of the position channel; correlated with the left-edge component and NOT counted separately",
  );
  rubric.record(
    "left-edge-delta-p90-px",
    correspondence.leftDelta.p90,
    null,
    "left-edge component of the position channel; correlated with the right-edge component and NOT counted separately",
  );
  rubric.record(
    "matched-fraction",
    correspondence.matchedFraction,
    null,
    `${correspondence.matchedPairs} pairs matched out of ${correspondence.sourceLeaves} source leaves / ${correspondence.cloneLeaves} clone leaves, by pass: ${correspondence.passes.map((p) => `${p.pass}=${p.matched}`).join(", ") || "none"}. This fraction counts the ${correspondence.unlabelledSourceLeaves} unlabelled image leaves in its denominator; see matched-fraction-content-keyed`,
  );
  rubric.record(
    "matched-fraction-content-keyed",
    correspondence.matchedFractionOfContentKeyed,
    null,
    `${correspondence.contentKeyedMatchedPairs} pairs from the CONTENT-KEYED passes over the source's ${correspondence.contentKeyedSourceLeaves} content-keyed leaves (visible text or labelled image). The ${correspondence.unlabelledMatchedPairs} structural pairs from the ${correspondence.unlabelledSourceLeaves} unlabelled leaves are deliberately NOT in this numerator (item C3.11): they carry no content key and are not in the denominator either, and counting them here used to push the trust gate over its threshold on ambiguous icon pairings. This is the fraction the position channel's trust gate reads`,
  );
  if (correspondence.structuralPassTruncated) {
    rubric.caveat(
      "the structural correspondence pass hit its comparison budget and stopped early; the unlabelled-leaf pairing is a lower bound",
    );
  }
  rubric.record(
    "right-edge-delta-max-px",
    correspondence.rightDelta.max,
    null,
    "worst single matched-box right-edge displacement",
  );
  rubric.record(
    "left-edge-delta-median-px",
    correspondence.leftDelta.median,
    null,
    "typical matched-box left-edge displacement",
  );

  // -- 11. horizontal overflow ----------------------------------------------
  const overflowExcess = clone.horizontalOverflow - source.horizontalOverflow;
  rubric.evaluate({
    channel: "horizontal-overflow-excess-px",
    value: overflowExcess,
    sourceValue: source.horizontalOverflow,
    note: `document scrollWidth − innerWidth: clone ${clone.scrollWidth}−${clone.innerWidth}=${clone.horizontalOverflow}, source ${source.scrollWidth}−${source.innerWidth}=${source.horizontalOverflow}`,
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: HORIZONTAL_OVERFLOW_MAJOR_EXCESS_PX },
      { severity: "MINOR", threshold: 1 },
    ],
    summary: (value, threshold) =>
      `the clone scrolls ${value}px further horizontally than the source (threshold ${threshold}px)`,
  });

  // -- 12. logo rows --------------------------------------------------------
  const sourceLogo = source.logoRows[0];
  const cloneLogo = clone.logoRows[0];
  const logoOverlap = cloneLogo?.anyOverlap === true && sourceLogo?.anyOverlap !== true;
  rubric.evaluate({
    channel: "logo-row-overlap",
    value: logoOverlap ? 1 : 0,
    sourceValue: sourceLogo?.anyOverlap ? 1 : 0,
    note: cloneLogo
      ? `largest logo-style group: clone ${cloneLogo.itemCount} items, gaps min ${cloneLogo.minGap}px / median ${cloneLogo.medianGap}px / max ${cloneLogo.maxGap}px, extent ${cloneLogo.groupExtent}px of ${cloneLogo.containerWidth}px (${(cloneLogo.extentRatio * 100).toFixed(0)}%)${cloneLogo.piledTowardCentre ? ", piled toward the centre" : ""}; source ${sourceLogo ? `${sourceLogo.itemCount} items, gaps min ${sourceLogo.minGap}px, extent ${(sourceLogo.extentRatio * 100).toFixed(0)}%` : "no group found"}`
      : "no horizontal image group of 3+ siblings found on the clone",
    direction: "higher",
    bands: [{ severity: "MAJOR", threshold: 1 }],
    summary: () =>
      `consecutive items in the clone's largest logo group overlap (min gap ${cloneLogo?.minGap ?? 0}px) where the source's do not`,
  });
  const logoBunch =
    sourceLogo !== undefined &&
    cloneLogo !== undefined &&
    sourceLogo.extentRatio > 0 &&
    cloneLogo.extentRatio < sourceLogo.extentRatio * LOGO_ROW_BUNCH_EXTENT_FACTOR;
  rubric.evaluate({
    channel: "logo-row-bunching",
    value: logoBunch ? 1 : 0,
    sourceValue: sourceLogo ? sourceLogo.extentRatio : null,
    note: cloneLogo
      ? `clone group spans ${(cloneLogo.extentRatio * 100).toFixed(0)}% of its container against the source's ${sourceLogo ? (sourceLogo.extentRatio * 100).toFixed(0) : "n/a"}%`
      : "no clone group to compare",
    direction: "higher",
    bands: [{ severity: "MAJOR", threshold: 1 }],
    summary: () =>
      `the clone's logo group is bunched: it spans ${((cloneLogo?.extentRatio ?? 0) * 100).toFixed(0)}% of its container against the source's ${((sourceLogo?.extentRatio ?? 0) * 100).toFixed(0)}%`,
  });

  // -- 13. page length ------------------------------------------------------
  const heightRatio = ratio(clone.scrollHeight, source.scrollHeight);
  rubric.evaluate({
    channel: "scroll-height-ratio-high",
    value: heightRatio,
    sourceValue: source.scrollHeight,
    note: `document scrollHeight: clone ${clone.scrollHeight}, source ${source.scrollHeight}`,
    direction: "higher",
    bands: [
      { severity: "MAJOR", threshold: SCROLL_HEIGHT_MAJOR_MAX_RATIO },
      { severity: "MINOR", threshold: 1.1 },
    ],
    summary: (value, threshold) =>
      `the clone's page is ${value.toFixed(2)}× the source's height (threshold ${threshold}×) — content that should sit side by side is stacked`,
  });
  rubric.evaluate({
    channel: "scroll-height-ratio-low",
    value: heightRatio,
    sourceValue: source.scrollHeight,
    note: `document scrollHeight: clone ${clone.scrollHeight}, source ${source.scrollHeight}`,
    direction: "lower",
    bands: [
      { severity: "MAJOR", threshold: SCROLL_HEIGHT_MAJOR_MIN_RATIO },
      { severity: "MINOR", threshold: 0.9 },
    ],
    summary: (value, threshold) =>
      `the clone's page is ${value.toFixed(2)}× the source's height (threshold ${threshold}×) — content the source stacks is collapsed or absent`,
  });

  // -- 13b. how deep each side was actually scrolled (item C3.13) -----------
  //
  // The capture policy scrolls both sides to the bottom in fixed steps, and the
  // lane's own "SYMMETRY VERIFIED" note was true of self-check pairs (source
  // against source, identical depth on 39 of 40) and NOT of the clone runs: on
  // the evidence run the two sides reached different depths on 5 of 10 pairs,
  // worst case 8,687px of source against 4,976px of clone. That is legitimate —
  // the two documents are different heights — but it is a fact about how much
  // of each page was revealed before probing, and it was in no channel. It is
  // RECORDED and never fired on: the page-length channels above already own the
  // verdict on a clone that is the wrong height.
  rubric.record(
    "shadow-text-chars",
    clone.shadowTextChars,
    source.shadowTextChars,
    `text the census found inside OPEN shadow roots: clone ${clone.shadowTextChars} characters over ${clone.shadowTextNodes} nodes in ${clone.shadowRootsTraversed} roots, source ${source.shadowTextChars} over ${source.shadowTextNodes} in ${source.shadowRootsTraversed}. Item C3.10: this text used to be invisible to the census on both sides, which is how a dropped currency prefix rendered by a web component could read as 0.00% missing text. A CLOSED shadow root exposes no handle to script and is counted by nobody`,
  );
  if (sourceScroll && cloneScroll) {
    const sourceDepth = sourceScroll.scrolledToPx;
    const cloneDepth = cloneScroll.scrolledToPx;
    rubric.record(
      "scroll-depth-ratio",
      sourceDepth === 0 ? (cloneDepth === 0 ? 1 : 0) : round4(cloneDepth / sourceDepth),
      sourceDepth,
      `the clone's scroll-to-settle pass reached ${cloneDepth}px of a ${clone.scrollHeight}px document (${cloneScroll.steps} steps, bottom ${cloneScroll.reachedBottom ? "reached" : cloneScroll.documentScrollable ? "NOT reached" : `not applicable — the document was no taller than the ${cloneScroll.viewportHeight}px viewport`}); the source reached ${sourceDepth}px of ${source.scrollHeight}px (${sourceScroll.steps} steps, bottom ${sourceScroll.reachedBottom ? "reached" : sourceScroll.documentScrollable ? "NOT reached" : "not applicable"}). Recorded, never fired on: unequal depth on two documents of unequal height is expected, but how much of each page was revealed before probing belongs in a channel`,
    );
  }

  // -- 14. pixels (can only ADD a finding) ----------------------------------
  if (pixels.available) {
    rubric.evaluate({
      channel: "pixel-visible-difference-ratio",
      value: pixels.deltaE76AboveVisibleRatio ?? 0,
      sourceValue: null,
      note: `ΔE*76 over the top-left-anchored overlap of ${pixels.overlapPixels ?? 0} px: mean ${pixels.deltaE76Mean ?? 0}, max ${pixels.deltaE76Max ?? 0}; @1 changed ${((pixels.changedPixelRatio ?? 0) * 100).toFixed(1)}%, @16 changed ${((pixels.changedRatioAt16 ?? 0) * 100).toFixed(1)}%; common area ${((pixels.commonAreaRatio ?? 0) * 100).toFixed(1)}%`,
      direction: "higher",
      bands: [{ severity: "MAJOR", threshold: PIXEL_VISIBLE_MAJOR_RATIO }],
      summary: (value, threshold) =>
        `${(value * 100).toFixed(1)}% of the compared pixels differ by more than the clearly-visible ΔE*76 threshold (threshold ${(threshold * 100).toFixed(0)}%)`,
    });
    // Item C3.1. The RESIDUAL is what fires: the part of the above-JND
    // difference whose colour is not present within one pixel in any direction
    // in the other image. The raw above-JND count is still recorded in full
    // immediately below, so nothing is hidden — what changed is which of the
    // two numbers the rubric is willing to act on.
    const gate = pixels.gate;
    rubric.evaluate({
      channel: "pixel-residual-difference-ratio",
      value: gate ? gate.residualAboveJndRatio : (pixels.deltaE76AboveJndRatio ?? 0),
      sourceValue: null,
      note: gate
        ? `${gate.residualAboveJndPixels} of ${gate.overlapPixels} compared pixels differ above the ΔE*76 JND threshold AND still differ when the comparison is allowed to look ${gate.radiusPx}px away in either image; ${gate.subpixelAboveJndPixels} more were sub-pixel (antialiasing, hinting, a resampled edge) and are excluded. Of the residual, ${gate.residualOnEdgePixels} sit on a high-contrast edge of the source (glyphs, icons, borders — typography and shape) and ${gate.residualOnFlatPixels} sit in flat regions (fills, gaps, moved blocks); ${gate.residualAboveVisiblePixels} exceed the clearly-visible ΔE*76 threshold. CALIBRATION (item C3.12): this ratio is normalised by AREA, and only ${gate.sourceInkPixels} of those ${gate.overlapPixels} pixels (${(gate.sourceInkRatio * 100).toFixed(2)}%) are ink at all — the source's own non-background pixels — so the ${(PIXEL_RESIDUAL_MINOR_RATIO * 100).toFixed(0)}% threshold is ${gate.sourceInkRatio === 0 ? "undefined against ink on a blank capture" : `${((PIXEL_RESIDUAL_MINOR_RATIO / gate.sourceInkRatio) * 100).toFixed(0)}% of everything this page draws`}, and this residual is ${(gate.residualOverInkRatio * 100).toFixed(2)}% of it${gate.residualRatioRoundedToZero ? ". The area ratio ROUNDED to zero and is not a measured zero: the pixel count above is" : ""}`
        : "the displacement gate did not run; this reading falls back to the ungated above-JND ratio",
      direction: "higher",
      bands: [{ severity: "MINOR", threshold: PIXEL_RESIDUAL_MINOR_RATIO }],
      summary: (value, threshold) =>
        `${(value * 100).toFixed(2)}% of the compared pixels carry a difference that survives a ${gate?.radiusPx ?? 0}px displacement search (threshold ${(threshold * 100).toFixed(0)}%)` +
        (gate
          ? `; ${(gate.residualEdgeFraction * 100).toFixed(0)}% of it sits on source edges`
          : ""),
    });
    rubric.record(
      "pixel-jnd-difference-ratio",
      pixels.deltaE76AboveJndRatio ?? 0,
      null,
      "UNGATED fraction of compared pixels above the just-noticeable ΔE*76 threshold (2.3). Recorded, never fired on: on a real reconstruction this number does not approach zero, so a MINOR band on it made MINOR the floor of the scale and PASS unreachable. The rubric reads pixel-residual-difference-ratio instead",
    );
    if (gate) {
      rubric.record(
        "pixel-subpixel-difference-ratio",
        gate.subpixelAboveJndRatio,
        null,
        `the part of the above-JND difference that disappears under a ${gate.radiusPx}px two-sided search: the same colour IS there, one pixel over. Rasterisation, hinting, subpixel positioning, image resampling`,
      );
      rubric.record(
        "pixel-residual-edge-fraction",
        gate.residualEdgeFraction,
        null,
        `share of the residual sitting on a source edge. Near 1 means the residual is typography and icon shape; near 0 means it is fills, gaps and moved blocks`,
      );
      rubric.record(
        "pixel-residual-visible-ratio",
        gate.residualAboveVisibleRatio,
        null,
        "the residual restricted to differences above the clearly-visible ΔE*76 threshold (10)",
      );
      rubric.record(
        "pixel-source-ink-ratio",
        gate.sourceInkRatio,
        null,
        `${gate.sourceInkPixels} of the ${gate.overlapPixels} compared pixels differ from the SOURCE's own modal (background) colour by more than the JND — i.e. how much of this page is drawn on at all. Item C3.12: without this number the area-normalised residual cannot be read, because a threshold stated as a fraction of the page is a much larger fraction of the page's content`,
      );
      rubric.record(
        "pixel-residual-ink-ratio",
        gate.residualOverInkRatio,
        null,
        `the SAME residual as pixel-residual-difference-ratio, normalised by the source's ink instead of by the page area. Recorded, never fired on: the rubric's band is defined on the area ratio and moving it is a separate decision from measuring it`,
      );
      if (gate.residualRatioRoundedToZero) {
        rubric.caveat(
          `the pixel residual ratio rounds to zero at the reported precision but ${gate.residualAboveJndPixels} residual pixels were measured; read pixel counts, not the ratio, near zero`,
        );
      }
      // -- 14b. THE BAND THE DIFF NEVER LOOKED AT (Task 28.75, item L3) ----
      //
      // Every pixel number above is computed over a TOP-LEFT-ANCHORED MIN-CROP
      // of the two captures. When the captures differ in width, the remainder
      // of the wider one is not in any of them — and on a horizontally
      // overflowing page that remainder is EXACTLY the offscreen band the
      // frozen-width defect produces. The region under investigation was
      // therefore the one region guaranteed to be excluded from the pixel
      // evidence, silently.
      //
      // It is no longer silent. The strip is measured on both sides, in area
      // and in ink, and a strip carrying at least as much ink as the smallest
      // pixel difference this rubric will report is a MEASUREMENT FAILURE, not
      // a small defect: the instrument did not look at the page. WP-C guard 4's
      // rule — measurement failure is never green — is the one that applies.
      rubric.evaluate({
        channel: "pixel-uncompared-band-ink-ratio",
        value: gate.horizontalBandInkRatio,
        sourceValue: gate.comparedAreaRatio,
        note: `THE PIXEL CHANNELS ABOVE DESCRIBE A CROP. Source capture ${gate.sourceImageWidth}×${gate.sourceImageHeight}, clone capture ${gate.cloneImageWidth}×${gate.cloneImageHeight}; the comparison ran on the top-left ${gate.comparedWidth}×${gate.comparedHeight} they share (${(gate.comparedAreaRatio * 100).toFixed(1)}% of the larger capture). The ${gate.widthMismatchPx}px-wide strip that is left over carries ${gate.sourceHorizontalBandInkPixels} ink pixel(s) of ${gate.sourceHorizontalBandPixels} on the source and ${gate.cloneHorizontalBandInkPixels} of ${gate.cloneHorizontalBandPixels} on the clone; the ${gate.heightMismatchPx}px-tall bottom strip carries ${gate.sourceVerticalBandInkPixels} of ${gate.sourceVerticalBandPixels} and ${gate.cloneVerticalBandInkPixels} of ${gate.cloneVerticalBandPixels} (recorded as pixel-uncompared-vertical-band-ink-ratio, never fired on — an unequal page height is already a finding on the scroll-height channels). Ink is measured against each side's OWN modal colour over the compared canvas, so a strip of plain page background reads 0 and hides nothing`,
        direction: "higher",
        bands: [
          {
            severity: "MAJOR",
            threshold: PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO,
          },
        ],
        summary: (value, threshold) =>
          `the two captures are ${gate.sourceImageWidth}px and ${gate.cloneImageWidth}px wide, so a ${gate.widthMismatchPx}px band was never pixel-compared, and it carries ${gate.sourceHorizontalBandInkPixels + gate.cloneHorizontalBandInkPixels} ink pixels — ${(value * 100).toFixed(2)}% of the compared area (threshold ${(threshold * 100).toFixed(0)}%). The pixel verdict on this pair covers ${(gate.comparedAreaRatio * 100).toFixed(1)}% of the larger capture, not the page`,
      });
      rubric.record(
        "pixel-uncompared-vertical-band-ink-ratio",
        gate.verticalBandInkRatio,
        null,
        `ink in the ${gate.heightMismatchPx}px-tall bottom strip the min-crop removes, over the compared area. Recorded, never fired on: an unequal page HEIGHT is already a first-class finding on scroll-height-ratio-high / -low, and the strip it leaves out is the bottom of a longer page rather than a region any channel is investigating. The horizontal strip is different in kind and is graded`,
      );
      rubric.record(
        "pixel-compared-area-ratio",
        gate.comparedAreaRatio,
        null,
        `the share of the LARGER capture the pixel channels actually read: ${gate.comparedWidth}×${gate.comparedHeight} of ${gate.sourceImageWidth}×${gate.sourceImageHeight} source and ${gate.cloneImageWidth}×${gate.cloneImageHeight} clone. Recorded so a reader can never take a pixel number for a statement about the whole page without also seeing how much of the page it covers`,
      );
    }
    if ((pixels.commonAreaRatio ?? 1) < 0.75) {
      rubric.caveat(
        `the two full-page screenshots share only ${(((pixels.commonAreaRatio ?? 0) * 100)).toFixed(0)}% of their area (source ${pixels.sourceWidth}×${pixels.sourceHeight}, clone ${pixels.cloneWidth}×${pixels.cloneHeight}); the pixel channels describe the overlapping top-left region only`,
      );
    }
  } else {
    rubric.caveat(
      `pixel channels unavailable: ${pixels.unavailableReason ?? "no reason recorded"}`,
    );
  }

  // -- structural caveats ---------------------------------------------------
  if (source.leavesTruncated || clone.leavesTruncated) {
    rubric.caveat(
      "the leaf-box cap was reached on at least one side; the correspondence and overlap channels cover the first boxes in document order only",
    );
  }
  if (
    ratio(source.visibleTextChars, clone.visibleTextChars) <= SOURCE_UNDER_RENDER_RATIO
  ) {
    rubric.caveat(
      "the source capture on this pair carries almost no content; treat every other channel here as measured against a page that failed to render, and re-run the pair before drawing any conclusion about the clone",
    );
  }
  rubric.caveat(
    `node counts are NOT cross-side comparable: the clone ships both viewport subtrees (clone ${clone.totalNodes} elements, ${clone.displayNoneNodes} display:none) against the source's single tree (${source.totalNodes} elements, ${source.displayNoneNodes} display:none)`,
  );

  // -- verdict --------------------------------------------------------------
  const findings = rubric.findings
    .slice()
    .sort(
      (a, b) =>
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
        (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0),
    );
  const blockerCount = findings.filter((f) => f.severity === "BLOCKER").length;
  const majorCount = findings.filter((f) => f.severity === "MAJOR").length;
  const minorCount = findings.filter((f) => f.severity === "MINOR").length;
  const verdict: Verdict =
    blockerCount > 0 ? "BLOCKER" : majorCount > 0 ? "MAJOR" : minorCount > 0 ? "MINOR" : "PASS";

  // WP-C GUARD 3's coverage figure. `overlapFindingDemoted` is the honest
  // headline: it is true exactly when the undemoted reading would have reached
  // the lowest band and the true reading does not — i.e. when this guard
  // removed a finding rather than only annotating one. The run artifact sums
  // it, so "fewer blockers" is never reported without "and here is how many of
  // them we stopped counting".
  const demotions = {
    duplicateImageStackPairs:
      source.duplicateImageStackPairCount + clone.duplicateImageStackPairCount,
    failedImageLayerOverlapPairs:
      source.failedImageLayerOverlapPairCount + clone.failedImageLayerOverlapPairCount,
    overlapFindingDemoted:
      undemotedOverlapExcess >= OVERLAP_MINOR_EXCESS_RATIO &&
      overlapExcess < OVERLAP_MINOR_EXCESS_RATIO,
    // ITEM L1. The other half of the ledger: how much area the guard removed,
    // net of the source's own, and whether that area was itself graded. A
    // `true` here beside `overlapFindingDemoted: true` says the finding did not
    // disappear — it moved channel — and a `false` says the guard's explanation
    // is corroborated by the source.
    demotedOverlapExcessRatio: demotedOverlapExcess,
    demotedOverlapRegraded: findings.some(
      (finding) => finding.channel === "overlap-demoted-excess-ratio",
    ),
  };

  return {
    verdict,
    findings,
    channels: rubric.channels
      .slice()
      .sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0)),
    blockerCount,
    majorCount,
    minorCount,
    caveats: rubric.caveats.slice().sort(),
    demotions,
  };
}
