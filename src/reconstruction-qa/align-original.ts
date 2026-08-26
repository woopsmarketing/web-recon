import type { ElementSpecNode, ViewportPageSpec } from "../sitespec/index.js";
import type { QaCapturedElement, QaRawCapture } from "./capture-page.js";

/**
 * Live original ↔ SiteSpec structural alignment (items 34, 35).
 *
 * Task 13 proved that a viewport's `rendered.html` reproduced its `dom.json`
 * exactly before it was allowed to supply a single attribute, and it used three
 * conditions to prove it: element count, tag sequence, and parent relation. This
 * module applies the SAME three conditions to a page captured from the live site
 * TODAY, for the same reason:
 *
 *   > node-level comparison is only meaningful when the two trees are provably
 *   > the same tree. Anything less is index arithmetic pretending to be identity.
 *
 * There is no fuzzy matching, no longest-common-subsequence repair, no "close
 * enough" tolerance. A tree that does not align exactly produces
 * `source-structural-drift`, the page's node-by-node QA is skipped, and the
 * recommendation is to re-observe (item 35). The clone is NOT edited toward the
 * current site — that would silently rewrite a past SiteSpec into the present,
 * which item 4 forbids outright.
 *
 * The live walk in `capture-page.ts` deliberately mirrors the Observer's own:
 * same skip tags, same pre-order, same "inline SVG is one opaque node" rule. If
 * those ever diverge, every page in the corpus reports structural drift at once,
 * which is a loud failure rather than a quiet one.
 */

export type AlignmentFailure =
  | "no-live-capture"
  | "element-count-mismatch"
  | "tag-sequence-mismatch"
  | "parent-relation-mismatch";

export interface AlignmentSuccess {
  aligned: true;
  /** SiteSpec element nodes in document order. */
  snapshotElements: ElementSpecNode[];
  /** Live elements in the same order. Index i in both arrays is one element. */
  liveElements: QaCapturedElement[];
  /** nodeId → live element. */
  byNodeId: Map<string, QaCapturedElement>;
  elementCount: number;
}

export interface AlignmentFailureResult {
  aligned: false;
  failure: AlignmentFailure;
  snapshotElementCount: number;
  liveElementCount: number;
  mismatchIndex?: number;
  /** `live=<tag> snapshot=<tag>` — small and deterministic, never a DOM dump. */
  detail?: string;
}

export type AlignmentResult = AlignmentSuccess | AlignmentFailureResult;

/** Element nodes of a viewport, in document order. */
export function elementNodesOf(viewport: ViewportPageSpec): ElementSpecNode[] {
  return viewport.nodes.filter(
    (node): node is ElementSpecNode => node.type === "element",
  );
}

/**
 * Align a live capture against a SiteSpec viewport tree.
 *
 * The parent check compares INDICES rather than ids: the two trees use different
 * id spaces (`n000042` vs a walk counter), and the only thing that has to agree
 * is the shape.
 */
export function alignLiveOriginal(
  viewport: ViewportPageSpec,
  live: QaRawCapture | undefined,
): AlignmentResult {
  const snapshotElements = elementNodesOf(viewport);
  if (!live) {
    return {
      aligned: false,
      failure: "no-live-capture",
      snapshotElementCount: snapshotElements.length,
      liveElementCount: 0,
    };
  }
  const liveElements = live.elements;
  if (liveElements.length !== snapshotElements.length) {
    return {
      aligned: false,
      failure: "element-count-mismatch",
      snapshotElementCount: snapshotElements.length,
      liveElementCount: liveElements.length,
      detail: `live=${liveElements.length} snapshot=${snapshotElements.length}`,
    };
  }

  const snapshotIndexById = new Map<string, number>();
  snapshotElements.forEach((node, index) => snapshotIndexById.set(node.nodeId, index));

  for (let index = 0; index < snapshotElements.length; index++) {
    const snapshot = snapshotElements[index]!;
    const liveElement = liveElements[index]!;
    if (snapshot.tagName !== liveElement.tagName) {
      return {
        aligned: false,
        failure: "tag-sequence-mismatch",
        snapshotElementCount: snapshotElements.length,
        liveElementCount: liveElements.length,
        mismatchIndex: index,
        detail: `live=${liveElement.tagName} snapshot=${snapshot.tagName}`,
      };
    }
    const snapshotParentIndex =
      snapshot.parentNodeId !== undefined
        ? snapshotIndexById.get(snapshot.parentNodeId)
        : undefined;
    const liveParentIndex =
      liveElement.parentKey !== undefined ? Number(liveElement.parentKey) : undefined;
    if (snapshotParentIndex !== liveParentIndex) {
      return {
        aligned: false,
        failure: "parent-relation-mismatch",
        snapshotElementCount: snapshotElements.length,
        liveElementCount: liveElements.length,
        mismatchIndex: index,
        detail: `live parent=${liveParentIndex ?? "(root)"} snapshot parent=${snapshotParentIndex ?? "(root)"}`,
      };
    }
  }

  const byNodeId = new Map<string, QaCapturedElement>();
  snapshotElements.forEach((node, index) => {
    byNodeId.set(node.nodeId, liveElements[index]!);
  });

  return {
    aligned: true,
    snapshotElements,
    liveElements,
    byNodeId,
    elementCount: snapshotElements.length,
  };
}
