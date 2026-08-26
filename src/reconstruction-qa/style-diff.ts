import type { ElementSpecNode, StyleCatalog } from "../sitespec/index.js";
import { DOCUMENT_ROOT_DROPPED_PROPERTIES } from "../reconstruction/style-generator.js";
import type { QaCapturedElement } from "./capture-page.js";
import {
  INHERITED_STYLE_MIN_NODES,
  INHERITED_STYLE_PROPERTIES,
  LENGTH_TOLERANCE_PX,
  type StyleDiffSummary,
} from "./types.js";

/**
 * Computed-style comparison (items 46, 47, 48).
 *
 * The comparison is EXACT STRING equality on the property values, and that is
 * defensible for one specific reason: both sides were serialized by the same
 * Chromium build (item 19). `rgb(17, 24, 39)` vs `#111827` is not a difference
 * this comparison can produce, because neither side is source CSS — both are
 * `getComputedStyle` output from the same engine.
 *
 * The property set is the Observer's own whitelist, so the QA compares exactly
 * what the SiteSpec stored and nothing it never saw.
 *
 * ## Two adaptations that are expected, not defects
 *
 *  - **Document-root geometry.** Task 14 renders the observed `<html>`/`<body>`
 *    as `div` wrappers and deliberately drops `width` / `height` / `min-*` /
 *    `max-*` from their style class, because those computed values are the
 *    browser REPORTING the initial containing block rather than an authored
 *    style. Those exact properties on those exact nodes are excluded here and
 *    counted separately, so they neither vanish nor pollute the top-10 table.
 *
 * ## Sub-layout-unit lengths
 *
 * The clone lays every box out again, and Blink stores lengths as a fixed-point
 * `LayoutUnit` with 1/64 px precision. Two independent layout passes of the same
 * box therefore land within two quanta of each other, and `width: 111.609px` vs
 * `111.594px` is that artifact rather than a style difference. Those are counted
 * as `subLayoutUnitLengthMismatches` and kept out of the headline, because on
 * one four-page site they are 2,002 of the 2,096 "mismatches" and would be the
 * top two properties in every table. Anything larger than two quanta is a
 * mismatch like any other.
 *
 * ## Inherited-cause grouping (item 48)
 *
 * A wrong `font-family` on `<body>` reappears on every descendant that does not
 * override it. Reporting 900 identical mismatches would hide the one node that
 * actually caused them, so mismatches on inherited properties are grouped by
 * (property, expected, actual) and attributed to the highest node in the tree
 * that carries them — the first mismatching ancestor.
 */

export interface StyleMismatch {
  nodeId: string;
  tagName: string;
  property: string;
  expected: string;
  actual: string;
  /** True for a `<html>`/`<body>` wrapper whose geometry Task 14 drops. */
  documentRootAdapted: boolean;
}

export interface InheritedStyleGroup {
  property: string;
  expected: string;
  actual: string;
  nodeCount: number;
  /** Highest node in document order carrying the mismatch. */
  rootNodeId: string;
  rootTagName: string;
  sampleNodeIds: string[];
}

/** `12.5px` → 12.5. `auto`, `none`, `rgb(…)` → undefined. */
function pxValue(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** Is this pair a length difference below the engine's own resolution? */
export function isSubLayoutUnitDifference(expected: string, actual: string): boolean {
  const a = pxValue(expected);
  const b = pxValue(actual);
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) <= LENGTH_TOLERANCE_PX;
}

export interface StyleDiffResult {
  summary: StyleDiffSummary;
  mismatches: StyleMismatch[];
  inheritedGroups: InheritedStyleGroup[];
  /** Node ids explained by an inherited group. */
  inheritedNodeIds: Set<string>;
  /** Mismatches attributable to the document-root adaptation. */
  documentRootAdaptedCount: number;
  /** Distinct nodes with at least one `font-family` mismatch. */
  fontFamilyMismatchNodes: string[];
}

export interface StyleDiffInput {
  nodes: readonly ElementSpecNode[];
  actualByNodeId: ReadonlyMap<string, QaCapturedElement>;
  styleCatalog: StyleCatalog;
  /** Clone comparison drops the document-root geometry; live drift does not. */
  applyDocumentRootAdaptation: boolean;
}

const DOC_DROPPED = new Set(DOCUMENT_ROOT_DROPPED_PROPERTIES);
const INHERITED = new Set(INHERITED_STYLE_PROPERTIES);

export function diffStyles(input: StyleDiffInput): StyleDiffResult {
  const styleById = new Map(
    input.styleCatalog.styles.map((token) => [token.styleTokenId, token.properties]),
  );
  const mismatches: StyleMismatch[] = [];
  const byProperty: Record<string, number> = {};
  const mismatchedNodeIds = new Set<string>();
  const fontFamilyMismatchNodes: string[] = [];
  let comparedNodes = 0;
  let comparedProperties = 0;
  let documentRootAdaptedCount = 0;
  let subLayoutUnitLengthMismatches = 0;

  // Document order is the SiteSpec order, so the first match in this walk is the
  // highest node carrying a given inherited mismatch.
  const orderOf = new Map<string, number>();
  input.nodes.forEach((node, index) => orderOf.set(node.nodeId, index));

  for (const node of input.nodes) {
    if (!node.styleTokenId) continue;
    const expected = styleById.get(node.styleTokenId);
    if (!expected) continue;
    const actual = input.actualByNodeId.get(node.nodeId);
    if (!actual) continue;
    const isDocumentRoot =
      input.applyDocumentRootAdaptation &&
      (node.tagName === "html" || node.tagName === "body");
    comparedNodes++;
    for (const property of Object.keys(expected).sort()) {
      const expectedValue = expected[property]!;
      const actualValue = actual.style[property];
      if (actualValue === undefined) continue;
      comparedProperties++;
      if (actualValue === expectedValue) continue;
      if (isSubLayoutUnitDifference(expectedValue, actualValue)) {
        subLayoutUnitLengthMismatches++;
        continue;
      }
      const adapted = isDocumentRoot && DOC_DROPPED.has(property);
      if (adapted) documentRootAdaptedCount++;
      byProperty[property] = (byProperty[property] ?? 0) + 1;
      mismatchedNodeIds.add(node.nodeId);
      if (property === "font-family") fontFamilyMismatchNodes.push(node.nodeId);
      mismatches.push({
        nodeId: node.nodeId,
        tagName: node.tagName,
        property,
        expected: expectedValue,
        actual: actualValue,
        documentRootAdapted: adapted,
      });
    }
  }

  // --- inherited-cause grouping -------------------------------------------
  const groups = new Map<string, StyleMismatch[]>();
  for (const mismatch of mismatches) {
    if (!INHERITED.has(mismatch.property)) continue;
    const key = `${mismatch.property}|${mismatch.expected}|${mismatch.actual}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(mismatch);
    else groups.set(key, [mismatch]);
  }
  const inheritedGroups: InheritedStyleGroup[] = [];
  const inheritedNodeIds = new Set<string>();
  for (const [key, members] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (members.length < INHERITED_STYLE_MIN_NODES) continue;
    const sorted = [...members].sort(
      (a, b) => (orderOf.get(a.nodeId) ?? 0) - (orderOf.get(b.nodeId) ?? 0),
    );
    const root = sorted[0]!;
    for (const member of members) inheritedNodeIds.add(member.nodeId);
    const [property, expected, actual] = key.split("|");
    inheritedGroups.push({
      property: property!,
      expected: expected!,
      actual: actual!,
      nodeCount: members.length,
      rootNodeId: root.nodeId,
      rootTagName: root.tagName,
      sampleNodeIds: sorted.slice(0, 5).map((member) => member.nodeId),
    });
  }
  inheritedGroups.sort((a, b) => {
    if (b.nodeCount !== a.nodeCount) return b.nodeCount - a.nodeCount;
    return a.property < b.property ? -1 : a.property > b.property ? 1 : 0;
  });

  const sortedByProperty: Record<string, number> = {};
  for (const property of Object.keys(byProperty).sort()) {
    sortedByProperty[property] = byProperty[property]!;
  }

  return {
    summary: {
      comparedNodes,
      comparedProperties,
      mismatchedProperties: mismatches.length,
      mismatchedNodes: mismatchedNodeIds.size,
      subLayoutUnitLengthMismatches,
      byProperty: sortedByProperty,
    },
    mismatches,
    inheritedGroups,
    inheritedNodeIds,
    documentRootAdaptedCount,
    fontFamilyMismatchNodes: [...new Set(fontFamilyMismatchNodes)].sort(),
  };
}
