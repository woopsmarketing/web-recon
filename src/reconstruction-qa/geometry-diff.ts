import type { ElementSpecNode } from "../sitespec/index.js";
import type { QaCapturedElement } from "./capture-page.js";
import {
  GEOMETRY_EPSILON_PX,
  LAYOUT_CASCADE_MIN_NODES,
  LAYOUT_CASCADE_TOLERANCE_PX,
  WORST_RANK_SIZE,
  type GeometryDiffSummary,
  type GeometryStats,
} from "./types.js";

/**
 * Geometry comparison and cascade diagnosis (items 42, 43, 45).
 *
 * Per-node `x` / `y` / `width` / `height` deltas against the SiteSpec's observed
 * `boundingBox`, aggregated as median / p90 / p95 / max rather than as a mean:
 * one 4,000 px outlier on a document-height element would drag a mean past every
 * useful threshold while the p95 keeps saying what the typical node does.
 *
 * ## Why the cascade grouping exists (item 45)
 *
 * A single wrong margin near the top of a page moves everything below it. Those
 * are not N defects; they are one defect with N symptoms, and reporting them as
 * N would (a) bury the real cause under its own consequences and (b) make any
 * before/after comparison meaningless, since fixing the cause changes the count
 * by hundreds.
 *
 * So nodes whose `y` delta agrees within a pixel are grouped, and each group is
 * reported as ONE candidate carrying:
 *
 *   - the shared displacement,
 *   - the first node in document order that shows it (the divergence point),
 *   - the deepest SiteSpec ancestor common to the whole group,
 *   - how many nodes it stands for.
 *
 * The grouping is a REPORTING decision, never a correction: nothing in this Task
 * auto-fixes a layout cascade, because "the right y" is not something the
 * pipeline observed for the clone's own box model.
 */

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index]!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function statsOf(values: readonly number[]): GeometryStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    comparedNodes: sorted.length,
    median: round2(percentile(sorted, 0.5)),
    p90: round2(percentile(sorted, 0.9)),
    p95: round2(percentile(sorted, 0.95)),
    max: round2(sorted.length === 0 ? 0 : sorted[sorted.length - 1]!),
  };
}

export interface GeometryNodeDelta {
  nodeId: string;
  tagName: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  expected: { x: number; y: number; width: number; height: number };
  actual: { x: number; y: number; width: number; height: number };
}

export interface LayoutCascade {
  /** Shared y displacement, rounded to 2 decimals. */
  displacement: number;
  nodeCount: number;
  /** First node in document order carrying the displacement. */
  firstDivergenceNodeId: string;
  firstDivergenceTag: string;
  /** Deepest SiteSpec ancestor shared by every node in the group. */
  commonAncestorNodeId?: string;
  /** Deterministic sample of member node ids. */
  sampleNodeIds: string[];
}

export interface GeometryDiffResult {
  summary: GeometryDiffSummary;
  deltas: GeometryNodeDelta[];
  cascades: LayoutCascade[];
  /** Node ids explained by a cascade — excluded from independent reporting. */
  cascadeNodeIds: Set<string>;
}

export interface GeometryDiffInput {
  /** Comparable SiteSpec nodes, in document order. */
  nodes: readonly ElementSpecNode[];
  actualByNodeId: ReadonlyMap<string, QaCapturedElement>;
  /** nodeId → parent nodeId, for the common-ancestor walk. */
  parentOf: ReadonlyMap<string, string>;
}

function ancestorChain(
  nodeId: string,
  parentOf: ReadonlyMap<string, string>,
): string[] {
  const chain: string[] = [];
  let current: string | undefined = parentOf.get(nodeId);
  let guard = 0;
  while (current !== undefined && guard < 512) {
    chain.push(current);
    current = parentOf.get(current);
    guard++;
  }
  return chain;
}

function commonAncestor(
  nodeIds: readonly string[],
  parentOf: ReadonlyMap<string, string>,
): string | undefined {
  if (nodeIds.length === 0) return undefined;
  let candidate = ancestorChain(nodeIds[0]!, parentOf);
  for (let i = 1; i < nodeIds.length && candidate.length > 0; i++) {
    const others = new Set(ancestorChain(nodeIds[i]!, parentOf));
    candidate = candidate.filter((id) => others.has(id));
  }
  return candidate[0];
}

export function diffGeometry(input: GeometryDiffInput): GeometryDiffResult {
  const deltas: GeometryNodeDelta[] = [];
  const dxs: number[] = [];
  const dys: number[] = [];
  const dws: number[] = [];
  const dhs: number[] = [];
  let mismatchedNodes = 0;

  for (const node of input.nodes) {
    const actual = input.actualByNodeId.get(node.nodeId);
    const expected = node.boundingBox;
    if (!actual || !expected) continue;
    const dx = round2(actual.box.x - expected.x);
    const dy = round2(actual.box.y - expected.y);
    const dw = round2(actual.box.width - expected.width);
    const dh = round2(actual.box.height - expected.height);
    dxs.push(Math.abs(dx));
    dys.push(Math.abs(dy));
    dws.push(Math.abs(dw));
    dhs.push(Math.abs(dh));
    const mismatched =
      Math.abs(dx) > GEOMETRY_EPSILON_PX ||
      Math.abs(dy) > GEOMETRY_EPSILON_PX ||
      Math.abs(dw) > GEOMETRY_EPSILON_PX ||
      Math.abs(dh) > GEOMETRY_EPSILON_PX;
    if (mismatched) mismatchedNodes++;
    deltas.push({
      nodeId: node.nodeId,
      tagName: node.tagName,
      dx,
      dy,
      dw,
      dh,
      expected: {
        x: expected.x,
        y: expected.y,
        width: expected.width,
        height: expected.height,
      },
      actual: {
        x: actual.box.x,
        y: actual.box.y,
        width: actual.box.width,
        height: actual.box.height,
      },
    });
  }

  // --- worst nodes per property -------------------------------------------
  const worst: GeometryDiffSummary["worst"] = [];
  const properties: Array<{
    name: "x" | "y" | "width" | "height";
    pick: (d: GeometryNodeDelta) => number;
    expected: (d: GeometryNodeDelta) => number;
    actual: (d: GeometryNodeDelta) => number;
  }> = [
    { name: "x", pick: (d) => d.dx, expected: (d) => d.expected.x, actual: (d) => d.actual.x },
    { name: "y", pick: (d) => d.dy, expected: (d) => d.expected.y, actual: (d) => d.actual.y },
    {
      name: "width",
      pick: (d) => d.dw,
      expected: (d) => d.expected.width,
      actual: (d) => d.actual.width,
    },
    {
      name: "height",
      pick: (d) => d.dh,
      expected: (d) => d.expected.height,
      actual: (d) => d.actual.height,
    },
  ];
  for (const property of properties) {
    const ranked = [...deltas]
      .filter((d) => Math.abs(property.pick(d)) > GEOMETRY_EPSILON_PX)
      .sort((a, b) => {
        const delta = Math.abs(property.pick(b)) - Math.abs(property.pick(a));
        if (delta !== 0) return delta;
        return a.nodeId < b.nodeId ? -1 : 1;
      })
      .slice(0, WORST_RANK_SIZE);
    for (const entry of ranked) {
      worst.push({
        property: property.name,
        nodeId: entry.nodeId,
        expected: property.expected(entry),
        actual: property.actual(entry),
        delta: round2(property.pick(entry)),
      });
    }
  }

  // --- cascade grouping (item 45) ------------------------------------------
  const buckets = new Map<string, GeometryNodeDelta[]>();
  for (const delta of deltas) {
    if (Math.abs(delta.dy) <= GEOMETRY_EPSILON_PX) continue;
    const bucketKey = String(
      Math.round(delta.dy / LAYOUT_CASCADE_TOLERANCE_PX) * LAYOUT_CASCADE_TOLERANCE_PX,
    );
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(delta);
    else buckets.set(bucketKey, [delta]);
  }
  const cascades: LayoutCascade[] = [];
  const cascadeNodeIds = new Set<string>();
  for (const [bucketKey, members] of [...buckets.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    if (members.length < LAYOUT_CASCADE_MIN_NODES) continue;
    const nodeIds = members.map((member) => member.nodeId).sort();
    for (const nodeId of nodeIds) cascadeNodeIds.add(nodeId);
    cascades.push({
      displacement: Number(bucketKey),
      nodeCount: members.length,
      firstDivergenceNodeId: members[0]!.nodeId,
      firstDivergenceTag: members[0]!.tagName,
      ...(() => {
        const ancestor = commonAncestor(nodeIds, input.parentOf);
        return ancestor !== undefined ? { commonAncestorNodeId: ancestor } : {};
      })(),
      sampleNodeIds: nodeIds.slice(0, 5),
    });
  }
  cascades.sort((a, b) => {
    if (b.nodeCount !== a.nodeCount) return b.nodeCount - a.nodeCount;
    return a.firstDivergenceNodeId < b.firstDivergenceNodeId ? -1 : 1;
  });

  return {
    summary: {
      comparedNodes: deltas.length,
      mismatchedNodes,
      x: statsOf(dxs),
      y: statsOf(dys),
      width: statsOf(dws),
      height: statsOf(dhs),
      worst,
    },
    deltas,
    cascades,
    cascadeNodeIds,
  };
}
