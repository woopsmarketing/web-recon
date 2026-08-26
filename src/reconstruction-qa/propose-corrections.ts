import {
  isSafeCssProperty,
  isSafeCssValue,
} from "../reconstruction/style-generator.js";
import {
  decodeSafeDataImage,
  qaAssetFileName,
  qaAssetPublicPath,
  type DecodedDataImage,
} from "./data-image-recovery.js";
import { CANVAS_BACKGROUND_PROPERTIES, qaCorrectionId } from "./types.js";
import {
  correctionSortKey,
  type CorrectionPayload,
  type QaCorrection,
  type RejectedCorrection,
} from "./correction-types.js";

/**
 * Correction proposal (items 87–107).
 *
 * The gate every proposal has to pass is item 87, stated as code rather than as
 * intent:
 *
 *   > a correction exists when the pipeline OBSERVED what the right answer is —
 *   > not when something looks wrong.
 *
 * So each of the three types has an explicit evidence predicate, each records
 * which named predicates it satisfied, and each carries the measurement that
 * will later decide whether it is accepted (item 119). Nothing here is scored,
 * ranked or weighted; a candidate either satisfies its predicate or becomes a
 * rejection with a reason.
 *
 * Everything the correction engine writes into CSS goes through Task 14's own
 * property allowlist and value validator (item 98). A value that could terminate
 * a declaration is a rejected correction, not a sanitized one — sanitizing page
 * content into CSS is exactly the channel that allowlist exists to close.
 */

export interface CanvasCandidate {
  pageId: string;
  viewport: "desktop" | "mobile";
  /** SiteSpec node the observed background was read from (`html` or `body`). */
  nodeId: string;
  /** Observed document-root background properties. */
  observed: Record<string, string>;
  /** The clone's framework canvas background. */
  cloneCanvas: Record<string, string>;
  mismatchedProperties: string[];
  diffIds: string[];
  /** False when the page's live original drifted (item 112). */
  sourceStable: boolean;
}

export interface StateStyleCandidate {
  patternId: string;
  pageId: string;
  viewport: "desktop" | "mobile";
  targetNodeId: string;
  /** Task 12's mechanism — decides which attribute the corrected rule keys on. */
  mechanism: string;
  /** Property → the value the LIVE original's open state actually reached. */
  observed: Record<string, string>;
  /** The clone's open-state value for the same properties. */
  cloneOpenState: Record<string, string>;
  diffIds: string[];
  /** All of item 71's preconditions held. */
  evidenceUsable: boolean;
}

export interface DataImageCandidate {
  pageId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  /** The `data:` URI harvested from an ALIGNED rendered.html. */
  dataUri: string;
  /** Snapshot evidence the image was actually displayed. */
  snapshotNaturalWidth?: number;
  snapshotNaturalHeight?: number;
  snapshotVisible: boolean;
  cloneImageMissing: boolean;
  diffIds: string[];
}

export interface ProposeCorrectionsInput {
  canvas: readonly CanvasCandidate[];
  stateStyle: readonly StateStyleCandidate[];
  dataImage: readonly DataImageCandidate[];
}

export interface ProposedCorrections {
  corrections: QaCorrection[];
  rejected: RejectedCorrection[];
  /** Decoded bytes to write next to the correction set, by file name. */
  assets: Map<string, Buffer>;
}

/** Keep only properties Task 14 is allowed to write, with safe values. */
function safeProperties(
  properties: Readonly<Record<string, string>>,
  allowed?: readonly string[],
): { safe: Record<string, string>; rejected: string[] } {
  const safe: Record<string, string> = {};
  const rejected: string[] = [];
  for (const name of Object.keys(properties).sort()) {
    if (allowed && !allowed.includes(name)) continue;
    const value = properties[name]!;
    if (!isSafeCssProperty(name) || !isSafeCssValue(value)) {
      rejected.push(name);
      continue;
    }
    safe[name] = value;
  }
  return { safe, rejected };
}

export function proposeCorrections(
  input: ProposeCorrectionsInput,
): ProposedCorrections {
  const drafts: Array<{
    payload: CorrectionPayload;
    provenance: QaCorrection["provenance"];
    diffIds: string[];
    evidence: string[];
    targetMetric: QaCorrection["targetMetric"];
  }> = [];
  const rejectedDrafts: Array<{
    payload: CorrectionPayload;
    provenance: QaCorrection["provenance"];
    diffIds: string[];
    evidence: string[];
    targetMetric: QaCorrection["targetMetric"];
    reason: RejectedCorrection["reason"];
    detail: string;
  }> = [];
  const assets = new Map<string, Buffer>();

  // --- Correction 1: canvas background (items 91–93) ------------------------
  // Site-level by nature, so the first eligible candidate in the deterministic
  // page order wins and the rest are not re-proposed: the browser propagates ONE
  // root background to ONE canvas, and proposing four of them would be four
  // corrections fighting over the same declaration.
  const canvasOrdered = [...input.canvas].sort((a, b) => {
    const page = a.pageId.localeCompare(b.pageId);
    if (page !== 0) return page;
    return a.viewport.localeCompare(b.viewport);
  });
  let canvasProposed = false;
  for (const candidate of canvasOrdered) {
    if (candidate.mismatchedProperties.length === 0) continue;
    if (!candidate.sourceStable) continue;
    if (canvasProposed) continue;
    const { safe, rejected } = safeProperties(
      candidate.observed,
      CANVAS_BACKGROUND_PROPERTIES,
    );
    const payload: CorrectionPayload = {
      type: "document-canvas-background",
      properties: safe,
      sourcePageId: candidate.pageId,
      sourceViewport: candidate.viewport,
      sourceNodeId: candidate.nodeId,
    };
    const targetMetric = {
      metric: "canvas-background-mismatched-properties",
      before: candidate.mismatchedProperties.length,
      requiredAtMost: 0,
    };
    const evidence = [
      "exact-observed-page",
      "no-source-drift",
      "sitespec-document-root-background-known",
      "clone-canvas-background-differs",
      "difference-explained-by-root-propagation",
    ];
    if (rejected.length > 0 || Object.keys(safe).length === 0) {
      rejectedDrafts.push({
        payload,
        provenance: "observed-snapshot",
        diffIds: candidate.diffIds,
        evidence,
        targetMetric,
        reason: "unsafe-value",
        detail:
          rejected.length > 0
            ? `unsafe or disallowed properties: ${rejected.join(", ")}`
            : "no safe background property survived validation",
      });
      continue;
    }
    canvasProposed = true;
    drafts.push({
      payload,
      provenance: "observed-snapshot",
      diffIds: candidate.diffIds,
      evidence,
      targetMetric,
    });
  }

  // --- Correction 2: interaction open-state style (items 94–99) -------------
  for (const candidate of [...input.stateStyle].sort((a, b) =>
    a.patternId.localeCompare(b.patternId),
  )) {
    if (!candidate.evidenceUsable) continue;
    // Only the properties that actually differ (item 97). Copying the whole
    // 90-property computed style would bury the observation in noise and would
    // pin values the original never changed.
    const differing: Record<string, string> = {};
    for (const name of Object.keys(candidate.observed).sort()) {
      const observedValue = candidate.observed[name]!;
      if (candidate.cloneOpenState[name] !== observedValue) {
        differing[name] = observedValue;
      }
    }
    if (Object.keys(differing).length === 0) continue;
    const { safe, rejected } = safeProperties(differing);
    const payload: CorrectionPayload = {
      type: "interaction-target-state-style",
      patternId: candidate.patternId,
      pageId: candidate.pageId,
      viewport: candidate.viewport,
      targetNodeId: candidate.targetNodeId,
      state: "open",
      // A native mechanism is toggled by the browser, so the rule keys on the
      // attribute the BROWSER moves, not on the runtime's own marker.
      stateHook:
        candidate.mechanism === "native-details" || candidate.mechanism === "native-checked"
          ? "open"
          : "revealed",
      properties: safe,
    };
    const targetMetric = {
      metric: `target-style-mismatches:${candidate.patternId}`,
      before: Object.keys(differing).length,
      requiredAtMost: 0,
    };
    const evidence = [
      "verified-confirmed-pattern",
      "static-uniquely-resolved-target",
      "original-action-success",
      "clone-action-success",
      "original-after-target-visible",
      "no-source-action-drift",
      "after-state-style-mismatch",
    ];
    if (Object.keys(safe).length === 0) {
      rejectedDrafts.push({
        payload,
        provenance: "observed-live-qa",
        diffIds: candidate.diffIds,
        evidence,
        targetMetric,
        reason: "unsafe-value",
        detail: `no safe property survived validation (rejected: ${rejected.join(", ") || "none"})`,
      });
      continue;
    }
    drafts.push({
      payload,
      provenance: "observed-live-qa",
      diffIds: candidate.diffIds,
      evidence,
      targetMetric,
    });
  }

  // --- Correction 3: safe data image recovery (items 101–107) ---------------
  for (const candidate of [...input.dataImage].sort((a, b) => {
    const page = a.pageId.localeCompare(b.pageId);
    if (page !== 0) return page;
    const viewport = a.viewport.localeCompare(b.viewport);
    if (viewport !== 0) return viewport;
    return a.nodeId.localeCompare(b.nodeId);
  })) {
    const gate =
      candidate.snapshotVisible &&
      candidate.cloneImageMissing &&
      candidate.dataUri.startsWith("data:");
    const decoded = decodeSafeDataImage(candidate.dataUri);
    const evidence = [
      "snapshot-image-visible",
      "clone-image-missing",
      "exact-element-alignment",
      "safe-raster-mime",
      "within-size-cap",
      "magic-bytes-match",
    ];
    if (!gate || !decoded.ok) {
      const detail = !gate
        ? "the snapshot/clone gate was not satisfied"
        : `data URI rejected: ${(decoded as { reason: string }).reason}`;
      rejectedDrafts.push({
        payload: {
          type: "safe-data-image-recovery",
          pageId: candidate.pageId,
          viewport: candidate.viewport,
          nodeId: candidate.nodeId,
          mime: "unknown",
          sha256: "",
          bytes: 1,
          assetFile: "",
          publicPath: "",
        },
        provenance: "observed-snapshot",
        diffIds: candidate.diffIds,
        evidence,
        targetMetric: {
          metric: `clone-image-natural-width:${candidate.pageId}:${candidate.nodeId}`,
          before: 0,
          requiredAtMost: 0,
        },
        reason: "unsafe-value",
        detail,
      });
      continue;
    }
    const image: DecodedDataImage = decoded.image;
    const assetFile = qaAssetFileName(image);
    assets.set(assetFile, image.bytes);
    drafts.push({
      payload: {
        type: "safe-data-image-recovery",
        pageId: candidate.pageId,
        viewport: candidate.viewport,
        nodeId: candidate.nodeId,
        mime: image.mime,
        sha256: image.sha256,
        bytes: image.bytes.byteLength,
        assetFile,
        publicPath: qaAssetPublicPath(image),
        ...(candidate.snapshotNaturalWidth !== undefined
          ? { naturalWidth: candidate.snapshotNaturalWidth }
          : {}),
        ...(candidate.snapshotNaturalHeight !== undefined
          ? { naturalHeight: candidate.snapshotNaturalHeight }
          : {}),
      },
      provenance: "observed-snapshot",
      diffIds: candidate.diffIds,
      evidence,
      targetMetric: {
        // A recovered image is accepted when the browser actually decodes it.
        metric: `clone-image-natural-width:${candidate.pageId}:${candidate.nodeId}`,
        before: 0,
        requiredAtMost: 0,
      },
    });
  }

  // Ids are assigned only after a stable sort (item 17).
  drafts.sort((a, b) => correctionSortKey(a.payload).localeCompare(correctionSortKey(b.payload)));
  const corrections: QaCorrection[] = drafts.map((draft, index) => ({
    id: qaCorrectionId(index + 1),
    type: draft.payload.type,
    provenance: draft.provenance,
    diffIds: [...new Set(draft.diffIds)].sort(),
    payload: draft.payload,
    targetMetric: draft.targetMetric,
    evidence: [...new Set(draft.evidence)].sort(),
  }));

  rejectedDrafts.sort((a, b) =>
    correctionSortKey(a.payload).localeCompare(correctionSortKey(b.payload)),
  );
  const rejected: RejectedCorrection[] = rejectedDrafts.map((draft, index) => ({
    correction: {
      id: qaCorrectionId(corrections.length + index + 1),
      type: draft.payload.type,
      provenance: draft.provenance,
      diffIds: [...new Set(draft.diffIds)].sort(),
      payload: draft.payload,
      targetMetric: draft.targetMetric,
      evidence: [...new Set(draft.evidence)].sort(),
    },
    reason: draft.reason,
    detail: draft.detail,
  }));

  return { corrections, rejected, assets };
}
