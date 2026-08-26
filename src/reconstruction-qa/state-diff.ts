import type { ElementSpecNode, ViewportPageSpec } from "../sitespec/index.js";
import type { QaCapturedElement } from "./capture-page.js";

/**
 * Observed-INITIAL-STATE fidelity (Task 16, items 89–91).
 *
 * Task 15 compared structure, text, geometry, computed style, assets, visual
 * pixels and behavior — everything except the two pieces of *state* the browser
 * holds outside the DOM tree, because until Task 16 the pipeline did not observe
 * them:
 *
 *   nested scroll offset   a scroller's `scrollTop` is not an attribute, so a
 *                          server-rendered clone always starts it at 0
 *   asset occurrence       whether the element→asset MAPPING survived, which is
 *                          a different question from whether the asset exists
 *
 * Both are measured here as direct expected-vs-actual comparisons rather than
 * inferred from their symptoms. That distinction is the whole point: Task 15
 * measured MDN's scroll problem as a 19,739px geometry delta and had to reach
 * the real cause by hand, through a diff image and a DOM walk. A clone whose
 * scroller is at 0 when the snapshot says 18,106 should say exactly that.
 */

export interface ScrollStateComparison {
  /** SiteSpec nodes carrying an observed `scrollState`. */
  expectedNodes: number;
  /** …of those, how many were at a non-zero offset and must be restored. */
  expectedScrolledNodes: number;
  /** Scrolled nodes that were mapped into the clone capture at all. */
  comparedNodes: number;
  /** Mapped, scrolled nodes whose clone offset matches within tolerance. */
  restoredNodes: number;
  /** Mapped, scrolled nodes whose clone offset does NOT match. */
  mismatchedNodes: number;
  /** Worst offenders, sorted by absolute top delta, capped. */
  worst: Array<{
    nodeId: string;
    tagName: string;
    expectedTop: number;
    actualTop: number;
    topDelta: number;
    expectedLeft: number;
    actualLeft: number;
  }>;
}

/**
 * How far a restored offset may sit from the observed one and still count.
 *
 * A scroller clamps: if the clone's content is one line shorter than the
 * original's, `scrollTop = 18106` lands at `scrollHeight - clientHeight`
 * instead. That is a content-height difference showing through, not a failure of
 * the restoration, and it is already counted by the geometry and style
 * dimensions. One CSS pixel of slack keeps this metric about the mechanism.
 */
export const SCROLL_RESTORE_TOLERANCE_PX = 1;

/** Worst-N kept per page/viewport, so a report can rank without unbounded data. */
const MAX_WORST_SCROLL_NODES = 5;

export function compareScrollState(
  viewport: ViewportPageSpec,
  cloneByKey: ReadonlyMap<string, QaCapturedElement>,
): ScrollStateComparison {
  const result: ScrollStateComparison = {
    expectedNodes: 0,
    expectedScrolledNodes: 0,
    comparedNodes: 0,
    restoredNodes: 0,
    mismatchedNodes: 0,
    worst: [],
  };
  const candidates: ScrollStateComparison["worst"] = [];

  for (const node of viewport.nodes) {
    if (node.type !== "element") continue;
    const element = node as ElementSpecNode;
    const expected = element.scrollState;
    if (!expected) continue;
    result.expectedNodes++;
    if (expected.scrollTop === 0 && expected.scrollLeft === 0) continue;
    result.expectedScrolledNodes++;

    const actual = cloneByKey.get(element.nodeId);
    if (!actual) continue; // not rendered in this variant; geometry says so already
    result.comparedNodes++;

    const actualTop = actual.scroll?.top ?? 0;
    const actualLeft = actual.scroll?.left ?? 0;
    const topDelta = Math.abs(actualTop - expected.scrollTop);
    const leftDelta = Math.abs(actualLeft - expected.scrollLeft);
    if (
      topDelta <= SCROLL_RESTORE_TOLERANCE_PX &&
      leftDelta <= SCROLL_RESTORE_TOLERANCE_PX
    ) {
      result.restoredNodes++;
      continue;
    }
    result.mismatchedNodes++;
    candidates.push({
      nodeId: element.nodeId,
      tagName: element.tagName,
      expectedTop: expected.scrollTop,
      actualTop,
      topDelta: Math.round(topDelta * 100) / 100,
      expectedLeft: expected.scrollLeft,
      actualLeft,
    });
  }

  candidates.sort((a, b) =>
    b.topDelta !== a.topDelta
      ? b.topDelta - a.topDelta
      : a.nodeId < b.nodeId
        ? -1
        : a.nodeId > b.nodeId
          ? 1
          : 0,
  );
  result.worst = candidates.slice(0, MAX_WORST_SCROLL_NODES);
  return result;
}

export interface AssetOccurrenceComparison {
  /** `<img>` nodes in the SiteSpec tree for this viewport. */
  specImageNodes: number;
  /** …of those, how many carry at least one asset reference (the A1 fix). */
  specAssetBoundImageNodes: number;
  /** `<img>` nodes the clone actually rendered, among the mapped ones. */
  cloneImageNodes: number;
  /** …of those, how many carry a usable `src` / `srcset`. */
  cloneSrcBoundImageNodes: number;
  /**
   * SiteSpec `<img>` nodes that HAD an asset reference and reached the clone
   * with no `src`. Non-zero means the reference was lost between the IR and the
   * generated DOM — a reconstruction defect, distinct from never observing one.
   */
  lostInReconstruction: number;
  /**
   * SiteSpec `<img>` nodes with NO asset reference at all. Before Task 16 this
   * was 325 on nextjs.org purely because the Observer deduplicated the mapping
   * away; it should now be zero except where the page really has a bare `<img>`.
   */
  unboundInSpec: number;
  /** Node ids behind `unboundInSpec`, capped, for a report to name names. */
  unboundNodeIds: string[];
}

/** Worst-N unbound `<img>` node ids kept per page/viewport. */
const MAX_UNBOUND_SAMPLES = 10;

/**
 * Account for element→asset mappings across the two stages that can lose one
 * (Task 16, item 91).
 *
 * Three counts, never collapsed into one "asset health" number, because they
 * have three different owners: an `<img>` with no `assetRefs` is an OBSERVATION
 * gap, an `<img>` with `assetRefs` and no `src` is a RECONSTRUCTION gap, and an
 * `<img>` with a `src` that does not decode is a NETWORK / hotlink fact that
 * `asset-diff.ts` already owns.
 */
export function compareAssetOccurrence(
  viewport: ViewportPageSpec,
  cloneByKey: ReadonlyMap<string, QaCapturedElement>,
): AssetOccurrenceComparison {
  const result: AssetOccurrenceComparison = {
    specImageNodes: 0,
    specAssetBoundImageNodes: 0,
    cloneImageNodes: 0,
    cloneSrcBoundImageNodes: 0,
    lostInReconstruction: 0,
    unboundInSpec: 0,
    unboundNodeIds: [],
  };

  for (const node of viewport.nodes) {
    if (node.type !== "element") continue;
    const element = node as ElementSpecNode;
    if (element.tagName !== "img") continue;
    result.specImageNodes++;
    const bound = element.assetRefs.length > 0;
    if (bound) result.specAssetBoundImageNodes++;
    else {
      result.unboundInSpec++;
      if (result.unboundNodeIds.length < MAX_UNBOUND_SAMPLES) {
        result.unboundNodeIds.push(element.nodeId);
      }
    }

    const actual = cloneByKey.get(element.nodeId);
    if (!actual) continue;
    result.cloneImageNodes++;
    const hasSrc = actual.img?.hasSrc === true;
    if (hasSrc) result.cloneSrcBoundImageNodes++;
    else if (bound) result.lostInReconstruction++;
  }
  return result;
}
