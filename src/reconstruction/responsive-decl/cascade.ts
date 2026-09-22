/**
 * CSS Cascade 5 winner resolution for the AUTHOR origin + the style attribute
 * (Responsive Core P0, contract §C2.2). PURE, deterministic, no browser.
 *
 * Sort order implemented (highest precedence wins), per CSS Cascade 5 §6:
 *   1. RELEVANCE — the declaration's conditions hold at width W:
 *        media interval contains W (`mediaToIntervals`); `@supports` needs
 *        `supportsMatches === true` (false → not relevant, absent → unknown);
 *        `@container` → unknown.
 *   2. ORIGIN & IMPORTANCE — author normal < author important.
 *   3. ELEMENT-ATTACHED — within the same importance, a style-attribute
 *      declaration beats every non-attached one. Combined with (2) this gives the
 *      four tiers: author normal < inline normal < author important < inline important.
 *      (Element-attached is decided BEFORE layers: an inline normal declaration
 *      beats a normal declaration in any layer, unlayered included.)
 *   4. LAYERS — normal: unlayered > later layer > earlier layer;
 *               important: earlier layer > later layer > unlayered.
 *   5. SPECIFICITY — [a,b,c] lexicographic.
 *   6. ORDER OF APPEARANCE — later `ruleOrder` wins.
 *
 * NEVER "last in array wins". When a comparison needs metadata that is absent
 * (`specificity`, `ruleOrder`, `layerOrder` of a named layer, `sheetIndex` when
 * `origin: "fetched"` is mixed with CSSOM), that PAIR is incomparable. Incomparability
 * — and unknown relevance — only makes the result ambiguous when it actually affects
 * which value wins: a candidate definitely beaten by a relevant candidate is out, and
 * several undecided candidates that all carry the same value still decide the value.
 */

import { mediaRelevanceAt, mediaToIntervals } from "./intervals.js";
import type { CascadeCandidate, CascadeResolution, Relevance } from "./types.js";

export interface RelevanceVerdict {
  readonly relevance: Relevance;
  readonly reasons: string[];
}

/** Is this candidate's condition true at `width`? */
export function candidateRelevance(candidate: CascadeCandidate, width: number): RelevanceVerdict {
  const unknown: string[] = [];
  if (candidate.relevanceUnknownReason !== undefined) unknown.push(candidate.relevanceUnknownReason);
  if (!candidate.inline) {
    if (candidate.media !== undefined && candidate.media.trim() !== "") {
      const media = candidate.mediaIntervals ?? mediaToIntervals(candidate.media);
      const at = mediaRelevanceAt(media, width);
      if (at === "not-applies") return { relevance: "not-applies", reasons: [] };
      if (at === "unknown") unknown.push(...(media.reasons.length > 0 ? media.reasons : ["media-ambiguous"]));
    }
    if (candidate.supports !== undefined && candidate.supports.trim() !== "") {
      if (candidate.supportsMatches === false) return { relevance: "not-applies", reasons: [] };
      if (candidate.supportsMatches !== true) unknown.push("supports-unevaluated");
    }
    if (candidate.container !== undefined && candidate.container.trim() !== "") {
      unknown.push("container-query");
    }
  }
  if (unknown.length > 0) return { relevance: "unknown", reasons: [...new Set(unknown)].sort() };
  return { relevance: "applies", reasons: [] };
}

/** 0 author normal, 1 inline normal, 2 author important, 3 inline important. */
export function importanceTier(c: CascadeCandidate): number {
  return (c.important ? 2 : 0) + (c.inline ? 1 : 0);
}

export type CascadeComparison =
  | { readonly result: 1 | -1 }
  | { readonly result: "incomparable"; readonly reason: string };

function isLayered(c: CascadeCandidate): boolean {
  return c.layerOrder !== undefined || (c.layer !== undefined && c.layer !== "");
}

/**
 * Compare two candidates by cascade precedence, ignoring relevance.
 * `1` = `a` wins, `-1` = `b` wins.
 */
export function compareCascade(a: CascadeCandidate, b: CascadeCandidate): CascadeComparison {
  // 2 + 3. importance × element-attached
  const ta = importanceTier(a);
  const tb = importanceTier(b);
  if (ta !== tb) return { result: ta > tb ? 1 : -1 };
  const important = a.important;

  if (a.inline && b.inline) {
    // Same style attribute: declaration order inside it.
    if (a.ruleOrder === undefined || b.ruleOrder === undefined || a.ruleOrder === b.ruleOrder) {
      return { result: "incomparable", reason: "inline-order-unknown" };
    }
    return { result: a.ruleOrder > b.ruleOrder ? 1 : -1 };
  }

  // 4. layers
  const la = isLayered(a);
  const lb = isLayered(b);
  if (la !== lb) {
    // normal: unlayered wins; important: layered wins.
    const aWins = important ? la : !la;
    return { result: aWins ? 1 : -1 };
  }
  if (la && lb) {
    if (a.layerOrder !== undefined && b.layerOrder !== undefined) {
      if (a.layerOrder !== b.layerOrder) {
        const aLater = a.layerOrder > b.layerOrder;
        return { result: (important ? !aLater : aLater) ? 1 : -1 };
      }
    } else {
      const sameNamedLayer =
        a.layerOrder === undefined &&
        b.layerOrder === undefined &&
        a.layer !== undefined &&
        a.layer !== "" &&
        a.layer === b.layer;
      if (!sameNamedLayer) return { result: "incomparable", reason: "missing-layer-order" };
    }
  }

  // 5. specificity
  if (a.specificity === undefined || b.specificity === undefined) {
    return { result: "incomparable", reason: "missing-specificity" };
  }
  for (let i = 0; i < 3; i++) {
    const x = a.specificity[i] ?? 0;
    const y = b.specificity[i] ?? 0;
    if (x !== y) return { result: x > y ? 1 : -1 };
  }

  // 6. order of appearance
  if (a.ruleOrder === undefined || b.ruleOrder === undefined) {
    return { result: "incomparable", reason: "missing-rule-order" };
  }
  const fetchedA = a.origin === "fetched";
  const fetchedB = b.origin === "fetched";
  if (fetchedA !== fetchedB && (a.sheetIndex === undefined || b.sheetIndex === undefined)) {
    return { result: "incomparable", reason: "fetched-order-unknown" };
  }
  if (a.ruleOrder === b.ruleOrder) return { result: "incomparable", reason: "same-rule-order" };
  return { result: a.ruleOrder > b.ruleOrder ? 1 : -1 };
}

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Resolve the cascade winner among `candidates` (all for ONE property of ONE element)
 * at viewport `width`.
 */
export function resolveCascade(
  candidates: readonly CascadeCandidate[],
  width: number,
): CascadeResolution {
  const live: Array<{ c: CascadeCandidate; v: RelevanceVerdict }> = [];
  for (const c of candidates) {
    const v = candidateRelevance(c, width);
    if (v.relevance !== "not-applies") live.push({ c, v });
  }
  if (live.length === 0) {
    return { status: "no-author-declaration", reasons: [], possibleWinners: [] };
  }

  // A candidate is OUT when some candidate that definitely applies definitely beats it.
  const applies = live.filter((x) => x.v.relevance === "applies");
  const possible = live.filter(
    (x) => !applies.some((y) => y.c !== x.c && compareCascade(y.c, x.c).result === 1),
  );
  const possibleApplies = possible.filter((x) => x.v.relevance === "applies");

  const reasons = new Set<string>();
  if (possible.length === 1 && possibleApplies.length === 1) {
    const w = possible[0]!.c;
    if (w.value === undefined || w.value.trim() === "") {
      return {
        status: "ambiguous",
        reason: `value-unknown:${w.valueUnknownReason ?? "empty"}`,
        reasons: [`value-unknown:${w.valueUnknownReason ?? "empty"}`],
        possibleWinners: [w],
      };
    }
    return { status: "resolved", winner: w, reasons: [], possibleWinners: [w] };
  }

  // Several still possible (or only unknown-relevance ones). Same value decides?
  if (possibleApplies.length > 0) {
    const values = possible.map((x) => x.c.value);
    const first = values[0];
    const allSame =
      first !== undefined &&
      first.trim() !== "" &&
      values.every((v) => v !== undefined && normalizeValue(v) === normalizeValue(first));
    if (allSame) {
      const w = possibleApplies[0]!.c;
      return {
        status: "resolved",
        winner: w,
        reasons: [],
        possibleWinners: possible.map((x) => x.c),
        tieSameValue: true,
      };
    }
  } else {
    reasons.add("possibly-no-author-declaration");
  }

  for (const x of possible) {
    if (x.v.relevance === "unknown") for (const r of x.v.reasons) reasons.add(`relevance-unknown:${r}`);
    if (x.c.value === undefined || x.c.value.trim() === "") {
      reasons.add(`value-unknown:${x.c.valueUnknownReason ?? "empty"}`);
    }
  }
  for (let i = 0; i < possible.length; i++) {
    for (let j = i + 1; j < possible.length; j++) {
      const cmp = compareCascade(possible[i]!.c, possible[j]!.c);
      if (cmp.result === "incomparable") reasons.add(cmp.reason);
    }
  }
  if (reasons.size === 0) reasons.add("undecided");
  const sorted = [...reasons].sort();
  return {
    status: "ambiguous",
    reason: sorted[0],
    reasons: sorted,
    possibleWinners: possible.map((x) => x.c),
  };
}

/** Contract §C2.2 name. */
export const resolveCascadeWinner = resolveCascade;
