import { readFile } from "node:fs/promises";
import type { PageSpec, ViewportPageSpec } from "../sitespec/index.js";
import type { ViewportId } from "../observer/types.js";
import type { AlignmentResult } from "./align-original.js";
import type { AssetDiffResult, AssetFinding } from "./asset-diff.js";
import type { ContentDiffResult } from "./content-diff.js";
import type { GeometryDiffResult } from "./geometry-diff.js";
import type { StyleDiffResult } from "./style-diff.js";
import type { RuntimeDiffResult } from "./runtime-diff.js";
import type { CloneNodeMapping } from "./map-clone-nodes.js";
import { DiffCollector, MAX_NODE_DIFFS_PER_DIMENSION } from "./classify-diff.js";
import { elementNodesOf } from "./align-original.js";
import { harvestDataImages } from "./data-image-recovery.js";
import type { QaInputs } from "./load-inputs.js";
import type { DataImageCandidate } from "./propose-corrections.js";
import type {
  FamilyAuditResult,
  InteractionQaResult,
  QaDiff,
  QaPageResult,
  Stability,
  UnknownQaResult,
} from "./types.js";

/**
 * Turning measurements into classified diffs (items 81–84).
 *
 * Everything that decides WHAT a difference is lives here, so the precedence
 * policy is readable in one place rather than spread across six diff engines.
 * The engines measure; this module attributes.
 *
 * Three grouping rules do most of the work, and each one replaces symptoms with
 * a cause rather than adding to them:
 *
 *   layout cascade      one displacement shared by ≥8 nodes becomes ONE diff
 *                       carrying the first divergence node and the common
 *                       ancestor (item 45)
 *   inherited style     one (property, expected, actual) triple shared by ≥5
 *                       nodes becomes ONE diff at the highest node (item 48)
 *   font binding        a font-family mismatch that COINCIDES with text geometry
 *                       drift becomes `font-binding-missing`; on its own it stays
 *                       a plain style mismatch, because "@font-face was not
 *                       compiled" is not by itself evidence that THIS page's
 *                       geometry moved because of it (item 161)
 *
 * Per-dimension diff lists are capped at {@link MAX_NODE_DIFFS_PER_DIMENSION}
 * with an explicit aggregate carrying the full count, so a page with 4,000 style
 * mismatches produces a bounded artifact that still states 4,000.
 */

export interface EmitPageDiffsInput {
  collector: DiffCollector;
  result: QaPageResult;
  mapping: CloneNodeMapping;
  content: ContentDiffResult;
  geometry: GeometryDiffResult;
  style: StyleDiffResult;
  asset: AssetDiffResult;
  runtime: RuntimeDiffResult;
  alignment: AlignmentResult;
  /** Node ids the live original disagrees with the snapshot on. */
  driftedNodeIds: ReadonlySet<string>;
  canvasMismatched: readonly string[];
  observedCanvas?: { nodeId: string; properties: Record<string, string> };
  cloneCanvas?: { html: Record<string, string>; body: Record<string, string> };
  variantOk: boolean;
  stability: Stability;
}

export function emitPageDiffs(input: EmitPageDiffsInput): void {
  const { collector, result } = input;
  const base = {
    pageId: result.pageId,
    viewport: result.viewport,
    route: result.url,
  };
  const unstable = input.stability.measured && !input.stability.stable;

  // --- infrastructure-shaped findings first --------------------------------
  if (result.status === "clone-load-error") {
    collector.add({
      ...base,
      dimension: "route",
      classification: "route-mismatch",
      cloneActual: result.errors.join("; ") || "clone did not load",
      evidence: [{ kind: "clone-load", note: "the clone route failed to load" }],
    });
    return;
  }
  if (unstable) {
    collector.add({
      ...base,
      dimension: "visual",
      classification: "environment-unstable",
      evidence: [
        {
          kind: "stability-recapture",
          count: input.stability.movingNodes,
          note: `${input.stability.movingNodes}/${input.stability.sampledNodes} sampled nodes still moving; document height Δ ${input.stability.documentHeightDelta}px`,
        },
      ],
      affectedNodeCount: input.stability.movingNodes,
    });
  }

  if (!input.variantOk) {
    collector.add({
      ...base,
      dimension: "responsive",
      classification: "responsive-variant-runtime-error",
      cloneActual: `desktop=${result.variant.desktopVisible} mobile=${result.variant.mobileVisible}`,
      evidence: [
        {
          kind: "clone-variant-visibility",
          clone: `desktop=${result.variant.desktopVisible} mobile=${result.variant.mobileVisible}`,
          note: "exactly one viewport variant must be visible",
        },
      ],
    });
  }

  // --- source drift (evaluated first so it can suppress live findings) ------
  if (result.sourceDrift.attempted && !input.alignment.aligned && result.status !== "source-load-error") {
    collector.add({
      ...base,
      dimension: "source-drift",
      classification: "source-structural-drift",
      snapshotExpected: `${result.sourceDrift.snapshotElementCount ?? 0} elements`,
      liveOriginal: `${result.sourceDrift.liveElementCount ?? 0} elements`,
      sourceDrift: true,
      evidence: [
        {
          kind: "structural-alignment",
          field: result.sourceDrift.alignmentFailure ?? "unknown",
          note: result.sourceDrift.mismatchDetail ?? "",
        },
      ],
      affectedNodeCount: result.sourceDrift.snapshotElementCount ?? 0,
    });
  }
  if (result.sourceDrift.changedTextNodes > 0) {
    collector.add({
      ...base,
      dimension: "source-drift",
      classification: "source-content-drift",
      sourceDrift: true,
      affectedNodeCount: result.sourceDrift.changedTextNodes,
      evidence: [
        {
          kind: "live-text",
          count: result.sourceDrift.changedTextNodes,
          note: "text nodes whose live value differs from the snapshot",
        },
      ],
    });
  }
  if (result.sourceDrift.changedStyleProperties > 0) {
    collector.add({
      ...base,
      dimension: "source-drift",
      classification: "source-style-drift",
      sourceDrift: true,
      affectedNodeCount: result.sourceDrift.changedStyleNodes,
      evidence: Object.entries(result.sourceDrift.styleDriftByProperty)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([property, count]) => ({ kind: "live-style", field: property, count })),
    });
  }

  // --- structure ------------------------------------------------------------
  if (input.mapping.missingNodeIds.length > 0) {
    const shown = input.mapping.missingNodeIds.slice(0, MAX_NODE_DIFFS_PER_DIMENSION);
    for (const nodeId of shown) {
      collector.add({
        ...base,
        dimension: "structure",
        classification: "structure-mismatch",
        nodeId,
        snapshotExpected: "present in the SiteSpec tree",
        cloneActual: "absent from the clone DOM",
        evidence: [{ kind: "clone-node-map", note: "no data-wr-node for this SiteSpec node" }],
      });
    }
    if (input.mapping.missingNodeIds.length > shown.length) {
      collector.add({
        ...base,
        dimension: "structure",
        classification: "structure-mismatch",
        cloneActual: `${input.mapping.missingNodeIds.length} SiteSpec nodes absent from the clone`,
        affectedNodeCount: input.mapping.missingNodeIds.length,
        evidence: [{ kind: "clone-node-map", count: input.mapping.missingNodeIds.length }],
        limitations: ["diff-list-truncated"],
      });
    }
  }
  for (const nodeId of input.mapping.duplicateNodeIds.slice(0, MAX_NODE_DIFFS_PER_DIMENSION)) {
    collector.add({
      ...base,
      dimension: "structure",
      classification: "structure-mismatch",
      nodeId,
      cloneActual: "the node id appears more than once inside one viewport variant",
      evidence: [{ kind: "clone-node-map", note: "duplicate data-wr-node" }],
    });
  }

  // --- content --------------------------------------------------------------
  const contentMismatches = input.content.mismatches;
  for (const mismatch of contentMismatches.slice(0, MAX_NODE_DIFFS_PER_DIMENSION)) {
    collector.add({
      ...base,
      dimension: "content",
      classification: "content-mismatch",
      nodeId: mismatch.nodeId,
      snapshotExpected: capText(mismatch.expected),
      cloneActual: capText(mismatch.actual),
      sourceDrift: input.driftedNodeIds.has(mismatch.nodeId),
      evidence: [{ kind: "snapshot-text", field: mismatch.kind }],
    });
  }
  if (contentMismatches.length > MAX_NODE_DIFFS_PER_DIMENSION) {
    collector.add({
      ...base,
      dimension: "content",
      classification: "content-mismatch",
      cloneActual: `${contentMismatches.length} text nodes differ from the SiteSpec`,
      affectedNodeCount: contentMismatches.length,
      evidence: [{ kind: "snapshot-text", count: contentMismatches.length }],
      limitations: ["diff-list-truncated"],
    });
  }

  // --- geometry: cascades first, then the leftovers -------------------------
  if (!unstable) {
    for (const cascade of input.geometry.cascades) {
      collector.add({
        ...base,
        dimension: "geometry",
        classification: "layout-cascade",
        nodeId: cascade.firstDivergenceNodeId,
        cloneActual: `${cascade.nodeCount} nodes displaced by ${cascade.displacement}px on y`,
        affectedNodeCount: cascade.nodeCount,
        evidence: [
          {
            kind: "geometry-cascade",
            field: "y",
            count: cascade.nodeCount,
            note: `first divergence <${cascade.firstDivergenceTag}> ${cascade.firstDivergenceNodeId}` +
              (cascade.commonAncestorNodeId
                ? `, common ancestor ${cascade.commonAncestorNodeId}`
                : ""),
          },
        ],
      });
    }
    const independent = input.geometry.deltas
      .filter(
        (delta) =>
          !input.geometry.cascadeNodeIds.has(delta.nodeId) &&
          (Math.abs(delta.dx) > 0.5 ||
            Math.abs(delta.dy) > 0.5 ||
            Math.abs(delta.dw) > 0.5 ||
            Math.abs(delta.dh) > 0.5),
      )
      .sort(
        (a, b) =>
          Math.max(Math.abs(b.dx), Math.abs(b.dy), Math.abs(b.dw), Math.abs(b.dh)) -
          Math.max(Math.abs(a.dx), Math.abs(a.dy), Math.abs(a.dw), Math.abs(a.dh)),
      );
    for (const delta of independent.slice(0, MAX_NODE_DIFFS_PER_DIMENSION)) {
      collector.add({
        ...base,
        dimension: "geometry",
        classification: "geometry-mismatch",
        nodeId: delta.nodeId,
        snapshotExpected: `x=${delta.expected.x} y=${delta.expected.y} w=${delta.expected.width} h=${delta.expected.height}`,
        cloneActual: `x=${delta.actual.x} y=${delta.actual.y} w=${delta.actual.width} h=${delta.actual.height}`,
        sourceDrift: input.driftedNodeIds.has(delta.nodeId),
        evidence: [
          { kind: "geometry", field: "dx", count: delta.dx },
          { kind: "geometry", field: "dy", count: delta.dy },
          { kind: "geometry", field: "dw", count: delta.dw },
          { kind: "geometry", field: "dh", count: delta.dh },
        ],
      });
    }
    if (independent.length > MAX_NODE_DIFFS_PER_DIMENSION) {
      collector.add({
        ...base,
        dimension: "geometry",
        classification: "geometry-mismatch",
        cloneActual: `${independent.length} nodes differ in geometry beyond the cascades`,
        affectedNodeCount: independent.length,
        evidence: [{ kind: "geometry", count: independent.length }],
        limitations: ["diff-list-truncated"],
      });
    }
  }

  // --- nested scroll state (Task 16, items 89, 90) --------------------------
  // Emitted BEFORE the document-geometry entry and reported as its own cause:
  // a scroller at the wrong offset displaces every descendant, so counting the
  // descendants would be the exact mistake `layout-cascade` exists to avoid.
  const scrollState = result.scrollState;
  if (scrollState && scrollState.mismatchedNodes > 0) {
    for (const worst of scrollState.worst) {
      collector.add({
        ...base,
        dimension: "scroll-state",
        classification: "nested-scroll-state-mismatch",
        nodeId: worst.nodeId,
        snapshotExpected: `scrollTop=${worst.expectedTop} scrollLeft=${worst.expectedLeft}`,
        cloneActual: `scrollTop=${worst.actualTop} scrollLeft=${worst.actualLeft}`,
        evidence: [
          { kind: "scroll-state", field: "topDelta", count: worst.topDelta },
        ],
      });
    }
    if (scrollState.mismatchedNodes > scrollState.worst.length) {
      collector.add({
        ...base,
        dimension: "scroll-state",
        classification: "nested-scroll-state-mismatch",
        cloneActual: `${scrollState.mismatchedNodes} scroll containers are at a different offset than observed`,
        affectedNodeCount: scrollState.mismatchedNodes,
        evidence: [
          { kind: "scroll-state", count: scrollState.mismatchedNodes },
        ],
        limitations: ["diff-list-truncated"],
      });
    }
  }

  // --- document geometry ----------------------------------------------------
  const cloneDocument = result.documentGeometry.clone;
  if (cloneDocument) {
    const heightDelta =
      cloneDocument.documentHeight - result.documentGeometry.snapshot.documentHeight;
    const widthDelta =
      cloneDocument.documentWidth - result.documentGeometry.snapshot.documentWidth;
    if (Math.abs(heightDelta) > 1 || Math.abs(widthDelta) > 1) {
      collector.add({
        ...base,
        dimension: "document-geometry",
        classification: unstable ? "environment-unstable" : "geometry-mismatch",
        snapshotExpected: `${result.documentGeometry.snapshot.documentWidth}×${result.documentGeometry.snapshot.documentHeight}`,
        cloneActual: `${cloneDocument.documentWidth}×${cloneDocument.documentHeight}`,
        evidence: [
          { kind: "document-geometry", field: "width", count: Math.round(widthDelta) },
          { kind: "document-geometry", field: "height", count: Math.round(heightDelta) },
        ],
      });
    }
  }

  // --- style: inherited groups, font binding, then the leftovers ------------
  const fontFamilyMismatches = input.style.fontFamilyMismatchNodes.length;
  const textGeometryDrift =
    input.geometry.cascades.length > 0 || input.geometry.summary.mismatchedNodes > 0;
  const fontBinding = fontFamilyMismatches > 0 && textGeometryDrift;
  if (fontBinding) {
    const sample = input.style.mismatches.find((entry) => entry.property === "font-family");
    collector.add({
      ...base,
      dimension: "style",
      classification: "font-binding-missing",
      property: "font-family",
      ...(sample ? { nodeId: sample.nodeId, snapshotExpected: sample.expected, cloneActual: sample.actual } : {}),
      affectedNodeCount: fontFamilyMismatches,
      evidence: [
        { kind: "clone-style", field: "font-family", count: fontFamilyMismatches },
        {
          kind: "geometry",
          count: input.geometry.summary.mismatchedNodes,
          note: "text-bearing geometry moved on the same page",
        },
      ],
    });
  }
  for (const group of input.style.inheritedGroups) {
    collector.add({
      ...base,
      dimension: "style",
      classification: "style-mismatch",
      nodeId: group.rootNodeId,
      property: group.property,
      snapshotExpected: group.expected,
      cloneActual: group.actual,
      affectedNodeCount: group.nodeCount,
      evidence: [
        {
          kind: "inherited-style",
          field: group.property,
          count: group.nodeCount,
          note: `first mismatching ancestor <${group.rootTagName}> ${group.rootNodeId}`,
        },
      ],
    });
  }
  const ungrouped = input.style.mismatches.filter(
    (mismatch) =>
      !input.style.inheritedNodeIds.has(mismatch.nodeId) &&
      !(fontBinding && mismatch.property === "font-family"),
  );
  for (const mismatch of ungrouped.slice(0, MAX_NODE_DIFFS_PER_DIMENSION)) {
    collector.add({
      ...base,
      dimension: "style",
      classification: "style-mismatch",
      nodeId: mismatch.nodeId,
      property: mismatch.property,
      snapshotExpected: mismatch.expected,
      cloneActual: mismatch.actual,
      sourceDrift: input.driftedNodeIds.has(mismatch.nodeId),
      ...(mismatch.documentRootAdapted
        ? { limitations: ["document-root-adapted-for-nextjs"] }
        : {}),
      evidence: [{ kind: "clone-style", field: mismatch.property }],
    });
  }
  if (ungrouped.length > MAX_NODE_DIFFS_PER_DIMENSION) {
    collector.add({
      ...base,
      dimension: "style",
      classification: "style-mismatch",
      cloneActual: `${ungrouped.length} computed style properties differ`,
      affectedNodeCount: ungrouped.length,
      evidence: [{ kind: "clone-style", count: ungrouped.length }],
      limitations: ["diff-list-truncated"],
    });
  }

  // --- assets ---------------------------------------------------------------
  for (const finding of input.asset.findings) {
    collector.add({
      ...base,
      dimension: "asset",
      classification: assetClassification(finding),
      nodeId: finding.nodeId,
      snapshotExpected:
        finding.snapshotNaturalWidth !== undefined
          ? `${finding.snapshotNaturalWidth}×${finding.snapshotNaturalHeight ?? 0}`
          : `box area ${finding.snapshotBoxArea}`,
      cloneActual: finding.cloneHasSrc
        ? `src set, naturalWidth ${finding.cloneNaturalWidth}`
        : "no src",
      ...(finding.originalNaturalWidth !== undefined
        ? { liveOriginal: `naturalWidth ${finding.originalNaturalWidth}` }
        : {}),
      sourceDrift: finding.cause === "asset-source-drift",
      evidence: [
        { kind: "asset-cause", field: finding.cause },
        ...(finding.assetUrl ? [{ kind: "asset-url", note: finding.assetUrl }] : []),
        ...(finding.failureReason
          ? [{ kind: "clone-network", note: finding.failureReason }]
          : []),
        ...(finding.assetReferenceLostUpstream
          ? [
              {
                kind: "asset-catalog",
                note: "the file IS in the SiteSpec asset catalog, attached to another node — Task 09 deduplicates URL assets on type|url",
              },
            ]
          : []),
      ],
      ...(finding.assetReferenceLostUpstream
        ? {
            recommendation: "requires-reobserve" as const,
            upstreamStage: "observation" as const,
          }
        : {}),
    });
  }

  // --- canvas ---------------------------------------------------------------
  if (input.canvasMismatched.length > 0 && input.observedCanvas) {
    collector.add({
      ...base,
      dimension: "canvas",
      classification: "canvas-background-mismatch",
      nodeId: input.observedCanvas.nodeId,
      snapshotExpected: input.canvasMismatched
        .map((property) => `${property}:${input.observedCanvas!.properties[property]}`)
        .join("; "),
      cloneActual: input.canvasMismatched
        .map((property) => `${property}:${input.cloneCanvas?.html[property] ?? "(unset)"}`)
        .join("; "),
      evidence: input.canvasMismatched.map((property) => ({
        kind: "canvas-background",
        field: property,
        snapshot: input.observedCanvas!.properties[property],
        clone: input.cloneCanvas?.html[property],
      })),
      autoFixEligibility: "eligible",
      correctionType: "document-canvas-background",
    });
  }

  // --- blocked assets, kept OUT of the runtime numbers (item 54) -----------
  if (input.runtime.blockedAssetMessages.length > 0) {
    collector.add({
      ...base,
      dimension: "asset",
      classification: "asset-hotlink-blocked",
      cloneActual: input.runtime.blockedAssetMessages[0]!,
      affectedNodeCount: input.runtime.blockedAssetMessages.length,
      evidence: [
        {
          kind: "clone-network",
          count: input.runtime.blockedAssetMessages.length,
          note: "the origin refused the cross-origin request; this is a response header, not clone JavaScript",
        },
      ],
    });
  }

  // --- runtime (JavaScript only) -------------------------------------------
  if (input.runtime.cloneOnlyErrors) {
    collector.add({
      ...base,
      dimension: "runtime",
      classification: "runtime-error",
      cloneActual: input.runtime.summary.cloneSamples.join(" | "),
      evidence: [
        { kind: "clone-console", count: input.runtime.summary.cloneJsErrors },
        ...(input.runtime.summary.cloneHydrationErrors > 0
          ? [{ kind: "clone-hydration", count: input.runtime.summary.cloneHydrationErrors }]
          : []),
      ],
    });
  }
}

function assetClassification(finding: AssetFinding): QaDiff["classification"] {
  switch (finding.cause) {
    case "asset-missing-in-sitespec":
    case "asset-unresolved-in-reconstruction":
      return "asset-missing";
    case "asset-hotlink-blocked":
      return "asset-hotlink-blocked";
    case "asset-source-drift":
      return "source-content-drift";
    default:
      return "asset-load-failure";
  }
}

function capText(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, " ");
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

/**
 * Look for a recoverable `data:` image behind an `asset-missing-in-sitespec`
 * finding (items 101, 102, 107).
 *
 * Only that ONE cause is considered: an asset the SiteSpec never referenced is
 * exactly the case the Observer's whitelist created, and it is the only one
 * where `rendered.html` can hold an answer nothing downstream has.
 */
export async function collectDataImageCandidates(input: {
  inputs: QaInputs;
  page: PageSpec;
  viewport: ViewportId;
  viewportSpec: ViewportPageSpec;
  findings: readonly AssetFinding[];
  candidates: DataImageCandidate[];
}): Promise<void> {
  const eligible = input.findings.filter(
    (finding) => finding.cause === "asset-missing-in-sitespec" && !finding.cloneHasSrc,
  );
  if (eligible.length === 0) return;

  const artifacts = input.inputs.observedPages.get(input.page.pageId);
  const renderedFile = artifacts?.renderedHtmlFiles[input.viewport];
  if (!renderedFile) return;

  let html: string;
  try {
    html = await readFile(renderedFile, "utf8");
  } catch {
    return;
  }

  const elements = elementNodesOf(input.viewportSpec);
  const alignable = elements.map((node) => ({
    id: node.sourceElementId,
    ...(node.parentNodeId !== undefined
      ? {
          parentId:
            elements.find((entry) => entry.nodeId === node.parentNodeId)?.sourceElementId,
        }
      : {}),
    tagName: node.tagName,
  }));
  const harvested = harvestDataImages(
    html,
    alignable.map((entry) => ({
      id: entry.id,
      ...(entry.parentId !== undefined ? { parentId: entry.parentId } : {}),
      tagName: entry.tagName,
    })),
  );
  if (!harvested.aligned) return;

  const indexByNodeId = new Map<string, number>();
  elements.forEach((node, index) => indexByNodeId.set(node.nodeId, index));

  for (const finding of eligible) {
    const index = indexByNodeId.get(finding.nodeId);
    if (index === undefined) continue;
    const dataUri = harvested.byElementIndex.get(index);
    if (dataUri === undefined) continue;
    input.candidates.push({
      pageId: input.page.pageId,
      viewport: input.viewport,
      nodeId: finding.nodeId,
      dataUri,
      ...(finding.snapshotNaturalWidth !== undefined
        ? { snapshotNaturalWidth: finding.snapshotNaturalWidth }
        : {}),
      ...(finding.snapshotNaturalHeight !== undefined
        ? { snapshotNaturalHeight: finding.snapshotNaturalHeight }
        : {}),
      snapshotVisible: finding.snapshotBoxArea > 0 || (finding.snapshotNaturalWidth ?? 0) > 0,
      cloneImageMissing: !finding.cloneHasSrc || finding.cloneNaturalWidth === 0,
      diffIds: [],
    });
  }
}

/**
 * Back-fill `diffIds` onto every result record.
 *
 * Diff ids exist only after the whole run is sorted, so the per-page,
 * per-pattern and per-route artifacts get their cross-references here rather
 * than carrying a mutable id during collection.
 */
export function attachDiffIds(
  pages: QaPageResult[],
  interactions: InteractionQaResult[],
  unknowns: UnknownQaResult[],
  familyAudit: FamilyAuditResult[],
  diffs: readonly QaDiff[],
): void {
  const byPage = new Map<string, string[]>();
  const byPattern = new Map<string, string[]>();
  const byUnknown = new Map<string, string[]>();
  const byRoute = new Map<string, string[]>();
  for (const diff of diffs) {
    if (diff.pageId !== undefined && diff.viewport !== undefined) {
      push(byPage, `${diff.pageId}|${diff.viewport}`, diff.id);
    }
    if (diff.patternId !== undefined) push(byPattern, diff.patternId, diff.id);
    if (diff.unknownId !== undefined) push(byUnknown, diff.unknownId, diff.id);
    if (diff.route !== undefined) push(byRoute, diff.route, diff.id);
  }
  for (const page of pages) {
    page.diffIds = byPage.get(`${page.pageId}|${page.viewport}`) ?? [];
  }
  for (const result of interactions) {
    result.diffIds = byPattern.get(result.patternId) ?? [];
  }
  for (const result of unknowns) {
    result.diffIds = byUnknown.get(result.unknownId) ?? [];
  }
  for (const result of familyAudit) {
    result.diffIds = byRoute.get(result.url) ?? [];
  }
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}
