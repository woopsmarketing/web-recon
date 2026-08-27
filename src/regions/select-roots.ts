import type { RuntimeElementNode } from "../reconstruction/types.js";
import {
  DOCUMENT_LANDMARK,
  analyzeTree,
  elementChildren,
  hasAnchorWithin,
  hasContent,
  joinPath,
  pathSegment,
  tagOf,
  unwrap,
} from "./skeleton.js";
import type { RegionLandmark, RegionPolicy } from "./types.js";

/**
 * Region ROOT selection — the only judgement call in this compiler, kept
 * closed, structural and free of semantics.
 *
 * The rule set, in the order it is applied to a candidate node:
 *
 *   1. UNWRAP. Collapse transparent single-element-child wrappers so that
 *      `div > div > <section>` yields one region, not three nested ones.
 *   2. SCOPE. If the unwrapped node is a landmark (header/nav/main/footer/aside
 *      or the ARIA equivalent) it opens a new id scope and its own path resets
 *      to `self`.
 *   3. SHELL. If a landmark or sectioning element sits within
 *      `shellLookaheadDepth` levels below the node, the node is a CONTAINER of
 *      sections rather than a section: descend into its element children and
 *      let each of them decide. This is what turns `main > div > [39 children,
 *      8 of them <section>]` into 39 candidates instead of one page-sized blob.
 *   4. EMIT. Otherwise the node is a region root.
 *
 * `descentDepthCap` bounds rule 3 so a pathological tree cannot mirror itself
 * into a second copy of the DOM, and a candidate holding no binding, no text
 * and no media is dropped as a spacer (the binding half of that test is what
 * makes the drop provably slot-safe).
 *
 * A region's MEANING is not attempted. "hero", "features", "pricing" are not
 * detectable structurally and guessing them here would put an unfalsifiable
 * label on an otherwise measurable artifact.
 */

export interface RegionRoot {
  node: RuntimeElementNode;
  landmark: RegionLandmark;
  /** `div:1>section:3`, or `self`. Measured from `landmark`'s element. */
  childPath: string;
  rootTag: string;
  /** Rank in this page-viewport's document-order region list. */
  docOrder: number;
}

export interface SelectionStats {
  emptyCandidatesDropped: number;
  depthCapHits: number;
  unwrapHops: number;
}

export interface SelectionResult {
  roots: RegionRoot[];
  stats: SelectionStats;
  /** Landmark keys present in this tree — the denominator a global lift needs. */
  landmarkKeys: Set<string>;
}

export interface SelectRegionRootsOptions {
  policy: RegionPolicy;
  /** Bindings addressing a single node id, used only by the emptiness test. */
  bindingsAt: (nodeId: string) => number;
}

export function selectRegionRoots(
  doc: RuntimeElementNode,
  options: SelectRegionRootsOptions,
): SelectionResult {
  const { policy, bindingsAt } = options;
  const { landmarks, anchors } = analyzeTree(doc);
  const anchorMemo = new Map<RuntimeElementNode, boolean>();
  const bindingMemo = new Map<RuntimeElementNode, number>();
  const roots: RegionRoot[] = [];
  const stats: SelectionStats = { emptyCandidatesDropped: 0, depthCapHits: 0, unwrapHops: 0 };

  const subtreeBindings = (node: RuntimeElementNode): number => {
    const cached = bindingMemo.get(node);
    if (cached !== undefined) return cached;
    let total = bindingsAt(node.n);
    for (const child of elementChildren(node)) total += subtreeBindings(child);
    bindingMemo.set(node, total);
    return total;
  };

  const visit = (
    candidate: RuntimeElementNode,
    scope: RegionLandmark,
    prefix: readonly string[],
    depth: number,
  ): void => {
    const unwrapped = unwrap(candidate, policy);
    stats.unwrapHops += unwrapped.segments.length;
    const node = unwrapped.node;

    // Rule 2 — a landmark is its own id scope, so the path restarts at `self`.
    const own = landmarks.get(node);
    const landmark = own ?? scope;
    const path = own ? [] : [...prefix, ...unwrapped.segments];

    // Rule 3 — shell descent.
    if (hasAnchorWithin(node, anchors, policy, anchorMemo)) {
      if (depth < policy.descentDepthCap) {
        for (const child of elementChildren(node)) {
          visit(child, landmark, [...path, pathSegment(node, child)], depth + 1);
        }
        return;
      }
      stats.depthCapHits++;
    }

    // Rule 4 — emit, unless the candidate is provably empty.
    if (subtreeBindings(node) === 0 && !hasContent(node)) {
      stats.emptyCandidatesDropped++;
      return;
    }
    roots.push({
      node,
      landmark,
      childPath: joinPath(path),
      rootTag: tagOf(node),
      docOrder: roots.length,
    });
  };

  visit(doc, DOCUMENT_LANDMARK, [], 0);

  const landmarkKeys = new Set<string>();
  for (const landmark of landmarks.values()) landmarkKeys.add(landmark.key);
  return { roots, stats, landmarkKeys };
}
