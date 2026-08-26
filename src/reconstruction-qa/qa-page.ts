import { readFile } from "node:fs/promises";
import type { Browser } from "playwright";
import type { PageSpec } from "../sitespec/index.js";
import type { ElementSpecNode, StyleCatalog, ViewportPageSpec } from "../sitespec/index.js";
import type { ViewportId, ViewportProfile } from "../observer/types.js";
import { alignLiveOriginal, elementNodesOf } from "./align-original.js";
import { diffAssets, type AssetFinding } from "./asset-diff.js";
import { captureClone } from "./capture-clone.js";
import { captureOriginal } from "./capture-original.js";
import type { QaCapturedElement } from "./capture-page.js";
import type { DiffCollector } from "./classify-diff.js";
import { diffContent } from "./content-diff.js";
import { diffGeometry } from "./geometry-diff.js";
import { diffRuntime } from "./runtime-diff.js";
import { diffStyles } from "./style-diff.js";
import { emitPageDiffs, collectDataImageCandidates } from "./emit-diffs.js";
import type { QaInputs } from "./load-inputs.js";
import { mapCloneNodes } from "./map-clone-nodes.js";
import { compareAssetOccurrence, compareScrollState } from "./state-diff.js";
import { encodePng, measurePair, renderDiffImage } from "./screenshot-diff.js";
import type { CanvasCandidate, DataImageCandidate } from "./propose-corrections.js";
import {
  CANVAS_BACKGROUND_PROPERTIES,
  SCHEMA_VERSION,
  type QaPageResult,
  type QaPageStatus,
  type ScreenshotMetric,
} from "./types.js";

/**
 * One page × viewport, measured against all three truth sources.
 *
 * Extracted from the orchestrator because a CORRECTION ITERATION runs the exact
 * same measurement with the live original switched off and the stored original
 * capture supplied instead (item 118). Two implementations would drift, and the
 * before/after comparison would then be comparing two different measurements
 * rather than two different clones.
 */

export interface PageWork {
  page: PageSpec;
  viewport: ViewportId;
  clonePath: string;
  profile: ViewportProfile;
}

/** A live-original capture kept from the baseline, reused by later iterations. */
export interface StoredOriginal {
  elementByNodeId: Map<string, QaCapturedElement>;
  screenshot?: Buffer;
  documentGeometry?: QaPageResult["documentGeometry"]["liveOriginal"];
}

export interface QaOnePageInput {
  item: PageWork;
  inputs: QaInputs;
  browser: Browser;
  cloneBaseUrl: string;
  /** Visit the live original. False in every correction iteration (item 118). */
  useLiveOriginal: boolean;
  collector: DiffCollector;
  canvasCandidates?: CanvasCandidate[];
  dataImageCandidates?: DataImageCandidate[];
  assetFindingsByPage?: Map<string, AssetFinding[]>;
  storedOriginals: Map<string, StoredOriginal>;
  /** Screenshots to keep in memory for the retention pass. */
  retained?: RetainedScreenshots[];
  saveAllScreenshots?: boolean;
}

export interface RetainedScreenshots {
  pageId: string;
  viewport: ViewportId;
  snapshot?: Buffer;
  original?: Buffer;
  clone?: Buffer;
  diffs: Array<{ pair: string; image: Buffer }>;
  changedRatio: number;
  alwaysKeep: boolean;
}

function parentIndexOf(viewport: ViewportPageSpec): Map<string, string> {
  const parents = new Map<string, string>();
  for (const node of viewport.nodes) {
    if (node.type !== "element") continue;
    if (node.parentNodeId !== undefined) parents.set(node.nodeId, node.parentNodeId);
  }
  return parents;
}

/**
 * The background the browser would have propagated to the canvas (item 57).
 *
 * CSS's own rule, not an invention: the root element's background paints the
 * canvas, and when the root has none the `<body>`'s is used instead. The clone
 * renders both as inner `div`s, so nothing propagates — which is the whole
 * canvas finding.
 */
export function canvasBackgroundOf(
  viewport: ViewportPageSpec,
  styleCatalog: StyleCatalog,
): { nodeId: string; properties: Record<string, string> } | undefined {
  const styleById = new Map(
    styleCatalog.styles.map((token) => [token.styleTokenId, token.properties]),
  );
  const elements = elementNodesOf(viewport);
  const read = (
    node: ElementSpecNode | undefined,
  ): { nodeId: string; properties: Record<string, string> } | undefined => {
    if (!node?.styleTokenId) return undefined;
    const properties = styleById.get(node.styleTokenId);
    if (!properties) return undefined;
    const out: Record<string, string> = {};
    for (const name of CANVAS_BACKGROUND_PROPERTIES) {
      const value = properties[name];
      if (value !== undefined) out[name] = value;
    }
    return { nodeId: node.nodeId, properties: out };
  };
  const isTransparent = (properties: Record<string, string>): boolean =>
    (properties["background-color"] ?? "rgba(0, 0, 0, 0)") === "rgba(0, 0, 0, 0)" &&
    (properties["background-image"] ?? "none") === "none";

  const fromHtml = read(elements.find((node) => node.tagName === "html"));
  if (fromHtml && !isTransparent(fromHtml.properties)) return fromHtml;
  const fromBody = read(elements.find((node) => node.tagName === "body"));
  if (fromBody && !isTransparent(fromBody.properties)) return fromBody;
  return fromHtml ?? fromBody;
}

/**
 * Which canvas properties actually differ, resolving the UA default.
 *
 * The naive comparison is wrong in a way that fires on almost every page: a
 * document whose observed root background is `rgb(255, 255, 255)` and a clone
 * whose framework `<html>` and `<body>` are both `rgba(0, 0, 0, 0)` PAINT THE
 * SAME CANVAS, because a transparent root leaves the user agent's own white
 * canvas showing. Reporting that as a mismatch produced a correction candidate
 * on all 12 domainchecker page/viewports, none of which had a visible difference.
 *
 * So both sides are resolved to what the canvas actually shows — html, then
 * body, then the UA default — before they are compared.
 */
export function canvasMismatchedProperties(
  observed: Readonly<Record<string, string>>,
  clone: { html: Record<string, string>; body: Record<string, string> },
): string[] {
  const UA_DEFAULTS: Readonly<Record<string, string>> = {
    "background-color": "rgb(255, 255, 255)",
    "background-image": "none",
    "background-attachment": "scroll",
    "background-position": "0% 0%",
    "background-repeat": "repeat",
    "background-size": "auto",
  };
  const isUnset = (property: string, value: string | undefined): boolean => {
    if (value === undefined) return true;
    if (property === "background-color") return value === "rgba(0, 0, 0, 0)";
    if (property === "background-image") return value === "none";
    return false;
  };
  const effectiveClone = (property: string): string => {
    const fromHtml = clone.html[property];
    if (!isUnset(property, fromHtml)) return fromHtml!;
    const fromBody = clone.body[property];
    if (!isUnset(property, fromBody)) return fromBody!;
    return UA_DEFAULTS[property] ?? fromHtml ?? "";
  };
  const out: string[] = [];
  for (const property of CANVAS_BACKGROUND_PROPERTIES) {
    const expectedRaw = observed[property];
    if (expectedRaw === undefined) continue;
    const expected = isUnset(property, expectedRaw)
      ? (UA_DEFAULTS[property] ?? expectedRaw)
      : expectedRaw;
    const actual = effectiveClone(property);
    // A background-position/size/repeat difference only matters when an image is
    // actually painted; comparing them under `background-image: none` compares
    // two irrelevant defaults.
    if (
      property !== "background-color" &&
      property !== "background-image" &&
      (observed["background-image"] ?? "none") === "none"
    ) {
      continue;
    }
    if (actual !== expected) out.push(property);
  }
  return out;
}

export async function readSnapshotScreenshot(
  inputs: QaInputs,
  pageId: string,
  viewport: ViewportId,
): Promise<Buffer | undefined> {
  const file = inputs.observedPages.get(pageId)?.screenshotFiles[viewport];
  if (!file) return undefined;
  try {
    return await readFile(file);
  } catch {
    return undefined;
  }
}

export async function qaOnePage(input: QaOnePageInput): Promise<QaPageResult> {
  const { item, inputs, collector } = input;
  const { page, viewport } = item;
  const viewportSpec = viewport === "desktop" ? page.viewports.desktop : page.viewports.mobile;
  const key = `${page.pageId}|${viewport}`;
  const timings: Record<string, number> = {};
  const errors: string[] = [];

  const cloneCapture = await captureClone({
    browser: input.browser,
    baseUrl: input.cloneBaseUrl,
    clonePath: item.clonePath,
    profile: item.profile,
    viewportId: viewport,
    screenshot: true,
    measureStability: false,
  });
  timings.cloneMs = cloneCapture.totalMs;

  const originalCapture = input.useLiveOriginal
    ? await captureOriginal({
        browser: input.browser,
        url: page.url,
        profile: item.profile,
        screenshot: true,
        measureStability: true,
      })
    : undefined;
  if (originalCapture) timings.originalMs = originalCapture.totalMs;

  const diffStarted = Date.now();
  const mapping = mapCloneNodes(viewportSpec, cloneCapture.capture);
  const comparableIds = new Set(mapping.comparableNodeIds);
  const comparable = mapping.expected.filter((node) => comparableIds.has(node.nodeId));

  const content = diffContent({
    viewport: viewportSpec,
    nodes: mapping.expected,
    actualByNodeId: mapping.byNodeId,
    mode: "raw",
  });
  const geometry = diffGeometry({
    nodes: comparable,
    actualByNodeId: mapping.byNodeId,
    parentOf: parentIndexOf(viewportSpec),
  });
  const style = diffStyles({
    nodes: comparable,
    actualByNodeId: mapping.byNodeId,
    styleCatalog: inputs.siteSpec.styleCatalog,
    applyDocumentRootAdaptation: true,
  });
  const runtime = diffRuntime(
    cloneCapture.diagnostics,
    originalCapture?.diagnostics,
    cloneCapture.requestUrl,
  );
  // Task 16: the two observed-initial-state dimensions, measured directly
  // rather than inferred from the geometry they displace (items 89, 91).
  const scrollState = compareScrollState(viewportSpec, mapping.byNodeId);
  const assetOccurrence = compareAssetOccurrence(viewportSpec, mapping.byNodeId);

  // --- live-original alignment + drift -------------------------------------
  const stored = input.storedOriginals.get(key);
  const alignment = input.useLiveOriginal
    ? alignLiveOriginal(viewportSpec, originalCapture?.capture)
    : stored
      ? {
          aligned: true as const,
          snapshotElements: mapping.expected,
          liveElements: [],
          byNodeId: stored.elementByNodeId,
          elementCount: stored.elementByNodeId.size,
        }
      : alignLiveOriginal(viewportSpec, undefined);

  let driftContentNodes = 0;
  let driftStyleProperties = 0;
  let driftStyleNodes = 0;
  const driftByProperty: Record<string, number> = {};
  const driftedNodeIds = new Set<string>();
  let liveGeometryP95: number | undefined;
  if (alignment.aligned) {
    const liveContent = diffContent({
      viewport: viewportSpec,
      nodes: mapping.expected,
      actualByNodeId: alignment.byNodeId,
      mode: "normalized",
    });
    driftContentNodes = liveContent.summary.changed + liveContent.summary.missing;
    for (const mismatch of liveContent.mismatches) driftedNodeIds.add(mismatch.nodeId);
    const liveStyle = diffStyles({
      nodes: comparable,
      actualByNodeId: alignment.byNodeId,
      styleCatalog: inputs.siteSpec.styleCatalog,
      applyDocumentRootAdaptation: false,
    });
    driftStyleProperties = liveStyle.summary.mismatchedProperties;
    driftStyleNodes = liveStyle.summary.mismatchedNodes;
    for (const [property, count] of Object.entries(liveStyle.summary.byProperty)) {
      driftByProperty[property] = count;
    }
    for (const mismatch of liveStyle.mismatches) driftedNodeIds.add(mismatch.nodeId);
    liveGeometryP95 = diffGeometry({
      nodes: comparable,
      actualByNodeId: alignment.byNodeId,
      parentOf: parentIndexOf(viewportSpec),
    }).summary.y.p95;
    if (input.useLiveOriginal) {
      input.storedOriginals.set(key, {
        elementByNodeId: alignment.byNodeId,
        ...(originalCapture?.screenshot ? { screenshot: originalCapture.screenshot } : {}),
        ...(originalCapture?.capture
          ? { documentGeometry: originalCapture.capture.documentGeometry }
          : {}),
      });
    }
  }

  // --- assets (after alignment, so the live original can be compared too) --
  const asset = diffAssets({
    nodes: mapping.expected,
    cloneByNodeId: mapping.byNodeId,
    ...(alignment.aligned ? { originalByNodeId: alignment.byNodeId } : {}),
    assetCatalog: inputs.siteSpec.assetCatalog,
    ...(cloneCapture.diagnostics ? { cloneDiagnostics: cloneCapture.diagnostics } : {}),
    ...(originalCapture?.diagnostics
      ? { originalDiagnostics: originalCapture.diagnostics }
      : {}),
    rootUrl: inputs.siteSpec.siteSpec.rootUrl,
  });

  // --- screenshots ---------------------------------------------------------
  const snapshotScreenshot = await readSnapshotScreenshot(inputs, page.pageId, viewport);
  const originalScreenshot = originalCapture?.screenshot ?? stored?.screenshot;
  const screenshots: ScreenshotMetric[] = [];
  const diffImages: Array<{ pair: string; image: Buffer }> = [];
  const pairs: Array<{
    pair: ScreenshotMetric["pair"];
    a?: Buffer;
    b?: Buffer;
    aLabel: string;
    bLabel: string;
  }> = [
    {
      pair: "snapshot-clone",
      a: snapshotScreenshot,
      b: cloneCapture.screenshot,
      aLabel: "snapshot",
      bLabel: "clone",
    },
    {
      pair: "snapshot-original",
      a: snapshotScreenshot,
      b: originalScreenshot,
      aLabel: "snapshot",
      bLabel: "live original",
    },
    {
      pair: "original-clone",
      a: originalScreenshot,
      b: cloneCapture.screenshot,
      aLabel: "live original",
      bLabel: "clone",
    },
  ];
  for (const entry of pairs) {
    const measured = measurePair(entry);
    screenshots.push(measured.metric);
    if (
      measured.decoded &&
      measured.metric.changedPixels !== undefined &&
      measured.metric.changedPixels > 0
    ) {
      diffImages.push({
        pair: entry.pair,
        image: encodePng(renderDiffImage(measured.decoded.a, measured.decoded.b)),
      });
    }
  }

  // --- canvas --------------------------------------------------------------
  const observedCanvas = canvasBackgroundOf(viewportSpec, inputs.siteSpec.styleCatalog);
  const cloneCanvas = cloneCapture.capture?.canvas;
  const canvasMismatched = observedCanvas && cloneCanvas
    ? canvasMismatchedProperties(observedCanvas.properties, cloneCanvas)
    : [];

  const variants = cloneCapture.capture?.variants ?? { desktop: false, mobile: false };
  const variantOk =
    (viewport === "desktop" && variants.desktop && !variants.mobile) ||
    (viewport === "mobile" && variants.mobile && !variants.desktop);

  let status: QaPageStatus = "complete";
  if (!cloneCapture.ok) {
    status = "clone-load-error";
    if (cloneCapture.error) errors.push(`clone: ${cloneCapture.error}`);
  } else if (input.useLiveOriginal && originalCapture && !originalCapture.ok) {
    status = "source-load-error";
    if (originalCapture.error) errors.push(`original: ${originalCapture.error}`);
  } else if (input.useLiveOriginal && !alignment.aligned && originalCapture?.ok) {
    status = "source-drift";
  }

  const stability = originalCapture?.stability ?? {
    measured: false,
    movingNodes: 0,
    sampledNodes: 0,
    documentHeightDelta: 0,
    stable: true,
  };

  const result: QaPageResult = {
    schemaVersion: SCHEMA_VERSION,
    pageId: page.pageId,
    viewport,
    url: page.url,
    clonePath: item.clonePath,
    status,
    ...(cloneCapture.capturedAt ? { capturedAt: cloneCapture.capturedAt } : {}),
    snapshotNodeCount: mapping.expected.length,
    cloneMappedNodes: mapping.byNodeId.size,
    cloneMissingNodes: mapping.missingNodeIds.length,
    cloneDuplicateNodes: mapping.duplicateNodeIds.length,
    hiddenSnapshotNodes: mapping.hiddenSnapshotNodeCount,
    content: content.summary,
    geometry: geometry.summary,
    style: style.summary,
    asset: asset.summary,
    runtime: runtime.summary,
    scrollState,
    assetOccurrence,
    canvas: {
      available: observedCanvas !== undefined && cloneCanvas !== undefined,
      expected: observedCanvas?.properties ?? {},
      cloneHtml: cloneCanvas?.html ?? {},
      cloneBody: cloneCanvas?.body ?? {},
      mismatchedProperties: canvasMismatched,
    },
    variant: {
      desktopVisible: variants.desktop,
      mobileVisible: variants.mobile,
      ok: variantOk,
    },
    stability,
    documentGeometry: {
      snapshot: viewportSpec.documentDimensions,
      ...(cloneCapture.capture ? { clone: cloneCapture.capture.documentGeometry } : {}),
      ...(originalCapture?.capture
        ? { liveOriginal: originalCapture.capture.documentGeometry }
        : stored?.documentGeometry
          ? { liveOriginal: stored.documentGeometry }
          : {}),
    },
    screenshots,
    sourceDrift: {
      attempted: input.useLiveOriginal,
      structurallyAligned: alignment.aligned,
      ...(alignment.aligned
        ? {
            liveElementCount: alignment.elementCount,
            snapshotElementCount: mapping.expected.length,
          }
        : {
            alignmentFailure: alignment.failure,
            ...(alignment.mismatchIndex !== undefined
              ? { mismatchIndex: alignment.mismatchIndex }
              : {}),
            ...(alignment.detail !== undefined ? { mismatchDetail: alignment.detail } : {}),
            liveElementCount: alignment.liveElementCount,
            snapshotElementCount: alignment.snapshotElementCount,
          }),
      changedTextNodes: driftContentNodes,
      changedStyleProperties: driftStyleProperties,
      changedStyleNodes: driftStyleNodes,
      styleDriftByProperty: driftByProperty,
      ...(liveGeometryP95 !== undefined ? { geometryP95: liveGeometryP95 } : {}),
    },
    ...(alignment.aligned
      ? {
          liveFidelity: {
            comparable: driftContentNodes === 0 && driftStyleProperties === 0,
            contentExactRatio: content.summary.exactRatio,
            styleMismatches: style.summary.mismatchedProperties,
            ...(liveGeometryP95 !== undefined ? { geometryP95: liveGeometryP95 } : {}),
          },
        }
      : {}),
    diffIds: [],
    errors,
    timings,
  };
  timings.diffMs = Date.now() - diffStarted;

  emitPageDiffs({
    collector,
    result,
    mapping,
    content,
    geometry,
    style,
    asset,
    runtime,
    alignment,
    driftedNodeIds,
    canvasMismatched,
    ...(observedCanvas ? { observedCanvas } : {}),
    ...(cloneCanvas ? { cloneCanvas } : {}),
    variantOk,
    stability,
  });

  if (canvasMismatched.length > 0 && observedCanvas && input.canvasCandidates) {
    input.canvasCandidates.push({
      pageId: page.pageId,
      viewport,
      nodeId: observedCanvas.nodeId,
      observed: observedCanvas.properties,
      cloneCanvas: cloneCanvas?.html ?? {},
      mismatchedProperties: canvasMismatched,
      diffIds: [],
      sourceStable: !input.useLiveOriginal || alignment.aligned,
    });
  }
  if (asset.findings.length > 0) {
    input.assetFindingsByPage?.set(key, asset.findings);
    if (input.dataImageCandidates) {
      await collectDataImageCandidates({
        inputs,
        page,
        viewport,
        viewportSpec,
        findings: asset.findings,
        candidates: input.dataImageCandidates,
      });
    }
  }

  if (input.retained) {
    const changedRatio =
      screenshots.find((metric) => metric.pair === "snapshot-clone")?.changedPixelRatio ?? 0;
    const alwaysKeep =
      status !== "complete" ||
      runtime.summary.cloneJsErrors > 0 ||
      asset.findings.length > 0 ||
      canvasMismatched.length > 0 ||
      !variantOk;
    input.retained.push({
      pageId: page.pageId,
      viewport,
      ...(snapshotScreenshot ? { snapshot: snapshotScreenshot } : {}),
      ...(originalScreenshot ? { original: originalScreenshot } : {}),
      ...(cloneCapture.screenshot ? { clone: cloneCapture.screenshot } : {}),
      diffs: diffImages,
      changedRatio,
      alwaysKeep,
    });
  }

  return result;
}
