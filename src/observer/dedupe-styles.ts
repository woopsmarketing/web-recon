import type { RawElement } from "./collect-dom.js";
import type {
  ComputedStyleObservation,
  ElementObservation,
  PseudoObservation,
  StyleDedup,
  StyleTable,
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

  const elements: ElementObservation[] = rawElements.map((raw) => {
    const styleId = intern(raw.styles);

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
    return el;
  });

  const uniqueStyleCount = styleCounter;
  const dedup: StyleDedup = {
    rawStyleOccurrences: rawOccurrences,
    uniqueStyleCount,
    dedupRatio:
      rawOccurrences > 0 ? 1 - uniqueStyleCount / rawOccurrences : 0,
  };

  return { elements, styleTable, dedup };
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
