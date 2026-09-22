import type { RawElement } from "./collect-dom.js";
import {
  MAX_REVEAL_REGRESSION_SAMPLE,
  SCROLL_REVEAL_OPACITY_THRESHOLD,
  type ComputedStyleObservation,
  type ElementObservation,
  type PseudoObservation,
  type RevealRegressionPolicy,
  type StyleDedup,
  type StyleTable,
} from "./types.js";

/**
 * Computed-style deduplication (Task 04, item 5).
 *
 * Task 03 stored ~88 computed-style properties inline on every element, so the
 * same handful of style maps were repeated hundreds of times. Here we collapse
 * identical maps into a shared table (`styles.json`) and replace each inline map
 * with a `styleId` reference. Element styles AND renderable pseudo-element
 * styles share the one table.
 *
 * Determinism & correctness:
 *  - The canonical key is the style map serialized with its properties SORTED,
 *    so two maps that differ only in property order collapse to one id.
 *  - The key is the FULL canonical string (not a hash), so there is no
 *    collision risk — distinct style maps can never share a `styleId`.
 *  - `styleId`s (`s000001…`) are assigned in first-encounter document order
 *    (elements arrive in document order; within an element: main, ::before,
 *    ::after), so the same input yields the same table every run.
 */

/** Canonical, order-independent serialization of a style map. */
function canonicalize(style: ComputedStyleObservation): string {
  const keys = Object.keys(style).sort();
  // JSON-encode each key/value so separators inside values can't be confused
  // with the delimiters.
  return keys.map((k) => JSON.stringify(k) + ":" + JSON.stringify(style[k])).join(";");
}

export interface DedupeResult {
  elements: ElementObservation[];
  styleTable: StyleTable;
  dedup: StyleDedup;
  /**
   * Task 28.7 A4 — the reveal-regression correction, when the load carried any
   * marks. Absent when nothing was marked (a site that animates once, or a load
   * with no preparation scroll), so a page that needed nothing says nothing.
   */
  revealRegressionPolicy?: RevealRegressionPolicy;
}

/**
 * Task 28.7 A4 — the REVEAL-REGRESSION POLICY, applied at the
 * observation→style-token boundary.
 *
 * MEASURED PROBLEM. The preparation scroll returns to the top because geometry
 * is captured at scroll 0. On a site whose scroll-animation library runs in
 * RE-HIDE mode, the collector then records `opacity: 0` for elements a human
 * scrolling the page sees perfectly well, and the reconstruction ships blank.
 * Task 28.6 built the two marks that identify exactly those elements
 * (`scrollRevealRegressed`, `revealedOpacity`) — and I verified that nothing
 * outside `src/observer/**` consumes either. They were recorded and ignored.
 *
 * WHAT THIS DOES, and nothing more: when an element is marked regressed, its
 * CAPTURED opacity is below the visibility threshold, and the scroll observed it
 * at or above the threshold, the EMITTED style token carries the observed
 * revealed value. Both real instants stay on the element record
 * (`capturedOpacity` + `revealedOpacity`), the correction is flagged per element
 * and COUNTED for the artifact, and the caller logs it.
 *
 * WHAT IT REFUSES. Every other disagreement leaves the observed value alone and
 * marks the element unstable with a reason:
 *   `no-revealed-observation`   the mark carries no `revealedOpacity`.
 *   `revealed-below-threshold`  the scroll never saw it properly revealed.
 *   `captured-already-visible`  the capture disagrees with the mark.
 *   `hidden-by-display`         re-hidden by `display`, which opacity cannot fix.
 *   `hidden-by-visibility`      re-hidden by `visibility`, likewise.
 * This is not an animation system and it does not fabricate certainty.
 *
 * NOTE ON THE VALUE. `revealedOpacity` is a SAMPLING FLOOR (the probe samples
 * once per scroll step), so an element still mid-fade at its last sample is
 * restored to the opacity it REACHED, not the animation's target. Those are
 * counted separately as `correctedBelowFull` so a consumer can see how many.
 */
function applyRevealRegressionPolicy(raw: RawElement): {
  styles: ComputedStyleObservation;
  corrected: boolean;
  capturedOpacity?: number;
  unstableReason?: string;
} {
  if (raw.scrollRevealRegressed !== true) return { styles: raw.styles, corrected: false };
  const revealed = raw.revealedOpacity;
  const styles = raw.styles;
  const display = styles["display"];
  const visibility = styles["visibility"];
  if (display === "none") {
    return { styles, corrected: false, unstableReason: "hidden-by-display" };
  }
  if (visibility === "hidden" || visibility === "collapse") {
    return { styles, corrected: false, unstableReason: "hidden-by-visibility" };
  }
  if (revealed === undefined) {
    return { styles, corrected: false, unstableReason: "no-revealed-observation" };
  }
  if (revealed < SCROLL_REVEAL_OPACITY_THRESHOLD) {
    return { styles, corrected: false, unstableReason: "revealed-below-threshold" };
  }
  const rawCaptured = styles["opacity"];
  const captured = rawCaptured === undefined ? 1 : Number.parseFloat(rawCaptured);
  if (!Number.isFinite(captured)) {
    return { styles, corrected: false, unstableReason: "no-captured-opacity" };
  }
  if (captured >= SCROLL_REVEAL_OPACITY_THRESHOLD) {
    return { styles, corrected: false, unstableReason: "captured-already-visible" };
  }
  return {
    styles: { ...styles, opacity: String(revealed) },
    corrected: true,
    capturedOpacity: captured,
  };
}

export function dedupeStyles(rawElements: readonly RawElement[]): DedupeResult {
  const styleTable: StyleTable = {};
  const idByCanonical = new Map<string, string>();
  let styleCounter = 0;
  let rawOccurrences = 0;

  const intern = (style: ComputedStyleObservation): string => {
    rawOccurrences++;
    const key = canonicalize(style);
    const existing = idByCanonical.get(key);
    if (existing) return existing;
    styleCounter++;
    const styleId = "s" + String(styleCounter).padStart(6, "0");
    idByCanonical.set(key, styleId);
    styleTable[styleId] = style;
    return styleId;
  };

  // Task 28.7 A4 — reveal-regression tallies, filled as the walk proceeds.
  let marks = 0;
  let corrected = 0;
  let correctedBelowFull = 0;
  let unstable = 0;
  const correctedSample: string[] = [];
  const unstableSample: string[] = [];

  const elements: ElementObservation[] = rawElements.map((raw) => {
    // Task 28.7 A4 — the correction happens BEFORE interning, so a corrected
    // element gets its own style token rather than sharing the blanked one.
    const policy = applyRevealRegressionPolicy(raw);
    if (raw.scrollRevealRegressed === true) {
      marks++;
      if (policy.corrected) {
        corrected++;
        if ((raw.revealedOpacity ?? 1) < 1) correctedBelowFull++;
        if (correctedSample.length < MAX_REVEAL_REGRESSION_SAMPLE) {
          correctedSample.push(raw.id);
        }
      } else {
        unstable++;
        if (unstableSample.length < MAX_REVEAL_REGRESSION_SAMPLE) {
          unstableSample.push(`${raw.id}: ${policy.unstableReason ?? "unknown"}`);
        }
      }
    }
    const styleId = intern(policy.styles);

    let pseudo: PseudoObservation | undefined;
    if (raw.pseudoBefore || raw.pseudoAfter) {
      pseudo = {};
      if (raw.pseudoBefore) {
        pseudo.before = {
          ...(raw.pseudoBefore.content !== undefined
            ? { content: raw.pseudoBefore.content }
            : {}),
          styleId: intern(raw.pseudoBefore.styles),
        };
      }
      if (raw.pseudoAfter) {
        pseudo.after = {
          ...(raw.pseudoAfter.content !== undefined
            ? { content: raw.pseudoAfter.content }
            : {}),
          styleId: intern(raw.pseudoAfter.styles),
        };
      }
    }

    const el: ElementObservation = {
      id: raw.id,
      tagName: raw.tagName,
      attributes: raw.attributes,
      localVisible: raw.localVisible,
      effectiveVisible: raw.effectiveVisible,
      boundingBox: raw.boundingBox,
      styleId,
    };
    if (raw.parentId) el.parentId = raw.parentId;
    if (raw.text) el.text = raw.text;
    if (raw.textSegments) el.textSegments = raw.textSegments;
    if (raw.scrollState) el.scrollState = raw.scrollState;
    if (pseudo) el.pseudo = pseudo;
    if (raw.hasShadowRoot) el.hasShadowRoot = true;
    if (raw.matchedLayoutRules) el.layoutRules = raw.matchedLayoutRules;
    if (raw.layoutRulesTruncated) el.layoutRulesTruncated = true;
    // Responsive Core P0 §C1.5 / §C1.2 — cap counters and runtime inline style.
    if (raw.layoutRulesMatched !== undefined) el.layoutRulesMatched = raw.layoutRulesMatched;
    if (raw.layoutRulesKept !== undefined) el.layoutRulesKept = raw.layoutRulesKept;
    if (raw.inlineStyle) el.inlineStyle = raw.inlineStyle;
    // Task 28.6 C2 B4 — the scroll-reveal regression mark travels with the
    // element; without it a consumer would have to re-derive which elements the
    // preparation scroll re-hid, which is not derivable from the artifact.
    if (raw.scrollRevealRegressed) el.scrollRevealRegressed = true;
    if (raw.revealedOpacity !== undefined) el.revealedOpacity = raw.revealedOpacity;
    // Task 28.7 A4 — BOTH real instants survive on the raw record: the emitted
    // token carries the revealed value, `capturedOpacity` carries what the
    // collector actually measured, and the correction is flagged, not silent.
    if (policy.corrected) {
      el.revealRegressionCorrected = true;
      if (policy.capturedOpacity !== undefined) {
        el.capturedOpacity = policy.capturedOpacity;
      }
    } else if (policy.unstableReason !== undefined) {
      el.revealRegressionUnstable = true;
      el.revealRegressionUnstableReason = policy.unstableReason;
    }
    return el;
  });

  const uniqueStyleCount = styleCounter;
  const dedup: StyleDedup = {
    rawStyleOccurrences: rawOccurrences,
    uniqueStyleCount,
    dedupRatio:
      rawOccurrences > 0 ? 1 - uniqueStyleCount / rawOccurrences : 0,
  };

  return {
    elements,
    styleTable,
    dedup,
    // Recorded only when the load carried marks at all: a page that needed
    // nothing says nothing, and every pre-28.7 artifact keeps its shape.
    ...(marks > 0
      ? {
          revealRegressionPolicy: {
            marks,
            corrected,
            correctedBelowFull,
            unstable,
            correctedSample,
            unstableSample,
            opacityThreshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
          },
        }
      : {}),
  };
}

/**
 * Invariant check: every `styleId` referenced by an element (or its pseudo
 * refs) must exist in the table. Throws if a dangling reference is found — this
 * guards against the dom/styles files ever drifting apart.
 */
export function assertStyleReferencesResolve(
  elements: readonly ElementObservation[],
  styleTable: StyleTable,
): void {
  for (const el of elements) {
    if (!(el.styleId in styleTable)) {
      throw new Error(
        `Dangling styleId ${el.styleId} on element ${el.id} (not in style table)`,
      );
    }
    const before = el.pseudo?.before?.styleId;
    if (before && !(before in styleTable)) {
      throw new Error(
        `Dangling pseudo ::before styleId ${before} on element ${el.id}`,
      );
    }
    const after = el.pseudo?.after?.styleId;
    if (after && !(after in styleTable)) {
      throw new Error(
        `Dangling pseudo ::after styleId ${after} on element ${el.id}`,
      );
    }
  }
}
