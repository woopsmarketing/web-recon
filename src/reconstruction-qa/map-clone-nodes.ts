import type { ElementSpecNode, ViewportPageSpec } from "../sitespec/index.js";
import { SKIPPED_TAGS } from "../reconstruction/react-attributes.js";
import type { QaCapturedElement, QaRawCapture } from "./capture-page.js";
import { elementNodesOf } from "./align-original.js";

/**
 * SiteSpec node ↔ clone DOM mapping (items 38, 39).
 *
 * The clone does not need alignment: Task 14 stamps every emitted element with
 * `data-wr-node="<SiteSpec nodeId>"`, so the mapping is a lookup rather than an
 * inference. That is the whole reason the attribute exists.
 *
 * Three things still have to be checked rather than assumed:
 *
 *  1. **Which nodes SHOULD be there.** The generator does not emit every SiteSpec
 *     node: `SKIPPED_TAGS` (script/style/noscript/template/head/meta/link/title/
 *     base) never reach the DOM, so counting them as missing would report a
 *     defect on every page. The expected set is computed with the generator's own
 *     constant rather than a copy of it.
 *  2. **Hidden variants are out of scope.** Node ids are viewport-local and both
 *     trees are in the document; `capture-clone.ts` already scopes the query to
 *     the active variant, and a node id that appears twice INSIDE one variant is a
 *     real duplicate and is reported.
 *  3. **Snapshot-hidden nodes are not compared.** A node the observation recorded
 *     as `effectiveVisible: false` has no meaningful geometry (its box is
 *     typically 0×0 at 0,0), so including it would flood the geometry percentiles
 *     with zeros. It is counted and excluded, never silently dropped.
 */

export interface CloneNodeMapping {
  /** nodeId → clone element, for nodes the generator was expected to emit. */
  byNodeId: Map<string, QaCapturedElement>;
  /** SiteSpec element nodes the generator was expected to emit, document order. */
  expected: ElementSpecNode[];
  /** Expected nodes with no clone element. */
  missingNodeIds: string[];
  /** Node ids that appeared more than once inside the active variant. */
  duplicateNodeIds: string[];
  /** Clone elements whose node id is not in the SiteSpec viewport at all. */
  unexpectedNodeIds: string[];
  /** Expected-and-present nodes that were `effectiveVisible` in the snapshot. */
  comparableNodeIds: string[];
  /** Expected nodes excluded because the snapshot recorded them hidden. */
  hiddenSnapshotNodeCount: number;
}

/** Whether the generator emits an element for this SiteSpec node. */
export function isEmittedByGenerator(node: ElementSpecNode): boolean {
  return !SKIPPED_TAGS.has(node.tagName);
}

export function mapCloneNodes(
  viewport: ViewportPageSpec,
  clone: QaRawCapture | undefined,
): CloneNodeMapping {
  const expected = elementNodesOf(viewport).filter(isEmittedByGenerator);
  const expectedIds = new Set(expected.map((node) => node.nodeId));

  const byNodeId = new Map<string, QaCapturedElement>();
  const unexpectedNodeIds: string[] = [];
  if (clone) {
    for (const element of clone.elements) {
      if (!expectedIds.has(element.key)) {
        unexpectedNodeIds.push(element.key);
        continue;
      }
      byNodeId.set(element.key, element);
    }
  }

  const missingNodeIds: string[] = [];
  const comparableNodeIds: string[] = [];
  let hiddenSnapshotNodeCount = 0;
  for (const node of expected) {
    const present = byNodeId.has(node.nodeId);
    if (!present) {
      missingNodeIds.push(node.nodeId);
      continue;
    }
    if (!node.effectiveVisible) {
      hiddenSnapshotNodeCount++;
      continue;
    }
    comparableNodeIds.push(node.nodeId);
  }

  return {
    byNodeId,
    expected,
    missingNodeIds: missingNodeIds.sort(),
    duplicateNodeIds: [...(clone?.duplicateNodeIds ?? [])].sort(),
    unexpectedNodeIds: unexpectedNodeIds.sort(),
    comparableNodeIds,
    hiddenSnapshotNodeCount,
  };
}
