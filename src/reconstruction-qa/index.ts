/**
 * Reconstruction QA & Automated Correction Loop (Task 15).
 *
 * Barrel export. This module is the ONLY consumer in the repo that reads both a
 * reconstruction and the observation artifacts it was compiled from — that is
 * what a QA runner is for. The dependency direction is one-way and enforced by
 * imports: `src/reconstruction-qa/` reads `src/reconstruction/`, never the
 * reverse, so the generated app's runtime keeps depending on the SiteSpec alone
 * (Task 15, item 13).
 *
 * No Firecrawl, no AI, no discovery, no SiteSpec mutation, no Task 14 baseline
 * mutation anywhere in this import graph. Playwright is used — this is the stage
 * where a browser is the point.
 */

export * from "./types.js";
export * from "./correction-types.js";

export {
  loadQaInputs,
  loadActionObservation,
  type LoadQaInputsOptions,
  type ObservedPageArtifacts,
  type QaInputs,
} from "./load-inputs.js";

export {
  correctionAssetFileRelative,
  correctionFileRelative,
  diffFileRelative,
  driftFileRelative,
  interactionResultFileRelative,
  iterationDirRelative,
  iterationReconstructionDirRelative,
  iterationSummaryFileRelative,
  newQaRunId,
  pageResultFileRelative,
  portablePath,
  qaRunDir,
  screenshotFileRelative,
  siteFolder,
  unknownResultFileRelative,
  writeQaBinary,
  writeQaJson,
  type WrittenFile,
} from "./store.js";

export {
  buildClone,
  findFreePort,
  startClone,
  type RunningClone,
  type StartCloneOptions,
} from "./start-clone.js";

export {
  attachDiagnostics,
  captureInBrowser,
  captureScreenshot,
  gotoQa,
  newQaContext,
  runCapture,
  stabilize,
  QA_ATTRIBUTE_NAMES,
  QA_STYLE_PROPERTIES,
  type PageDiagnostics,
  type QaCapturedElement,
  type QaRawCapture,
} from "./capture-page.js";

export {
  captureOriginal,
  measureStability,
  type CaptureOriginalOptions,
  type OriginalCapture,
} from "./capture-original.js";

export {
  captureClone,
  probeBreakpoint,
  type BreakpointProbeResult,
  type CaptureCloneOptions,
  type CloneCapture,
} from "./capture-clone.js";

export {
  alignLiveOriginal,
  elementNodesOf,
  type AlignmentResult,
  type AlignmentSuccess,
} from "./align-original.js";

export {
  isEmittedByGenerator,
  mapCloneNodes,
  type CloneNodeMapping,
} from "./map-clone-nodes.js";

export {
  compareImages,
  decodePng,
  encodePng,
  measurePair,
  renderDiffImage,
  type DecodedImage,
  type ImageComparison,
} from "./screenshot-diff.js";

export {
  diffContent,
  directTextOf,
  nodeIndex,
  type ContentDiffResult,
  type ContentMismatch,
} from "./content-diff.js";

export {
  diffGeometry,
  type GeometryDiffResult,
  type GeometryNodeDelta,
  type LayoutCascade,
} from "./geometry-diff.js";

export {
  diffStyles,
  type InheritedStyleGroup,
  type StyleDiffResult,
  type StyleMismatch,
} from "./style-diff.js";

export { diffAssets, type AssetDiffResult, type AssetFinding } from "./asset-diff.js";

export { diffRuntime, type RuntimeDiffResult } from "./runtime-diff.js";

export {
  DiffCollector,
  MAX_NODE_DIFFS_PER_DIMENSION,
  type DiffDraft,
} from "./classify-diff.js";

export {
  attachDiffIds,
  collectDataImageCandidates,
  emitPageDiffs,
  type EmitPageDiffsInput,
} from "./emit-diffs.js";

export {
  summarizeRootCauses,
  type RootCauseRow,
  type RootCauseSummary,
} from "./root-cause.js";

export {
  decodeSafeDataImage,
  harvestDataImages,
  magicBytesMatch,
  qaAssetFileName,
  qaAssetPublicPath,
  type DecodedDataImage,
  type DataImageRejection,
} from "./data-image-recovery.js";

export {
  proposeCorrections,
  type CanvasCandidate,
  type DataImageCandidate,
  type ProposeCorrectionsInput,
  type ProposedCorrections,
  type StateStyleCandidate,
} from "./propose-corrections.js";

export {
  applyCorrections,
  writeCorrectionSet,
  type AppliedCorrections,
  type ApplyCorrectionsInput,
} from "./apply-corrections.js";

export {
  evaluateRegression,
  judgeCorrection,
  metricIsHigherBetter,
  type CorrectionOutcome,
  type RegressionSnapshot,
  type RegressionVerdict,
} from "./correction-loop.js";

export {
  runCorrectionLoop,
  type CorrectionLoopInput,
  type CorrectionLoopResult,
} from "./run-correction-loop.js";

export {
  replayClone,
  replayOriginal,
  cloneTargetSelector,
  cssEscape,
  TARGET_STATE_STYLE_PROPERTIES,
} from "./interaction-qa.js";

export {
  changedFields,
  replayUnknownClone,
  replayUnknownOriginal,
  selectUnknownSamples,
  type UnknownSample,
} from "./unknown-qa.js";

export {
  compareBehavior,
  compareOpenStateStyle,
  isSelfReferentialTarget,
  type BehaviorComparison,
  type CompareBehaviorInput,
} from "./compare-behavior.js";

export {
  auditFamilyRoute,
  checkRoutes,
  qaOnePattern,
  qaOneUnknown,
  selectFamilyAuditRoutes,
  type FamilyAuditTarget,
  type PatternQaOutcome,
  type UnknownQaOutcome,
} from "./qa-behavior.js";

export {
  canvasBackgroundOf,
  canvasMismatchedProperties,
  qaOnePage,
  readSnapshotScreenshot,
  type PageWork,
  type QaOnePageInput,
  type RetainedScreenshots,
  type StoredOriginal,
} from "./qa-page.js";

export {
  diffIdsOfCorrections,
  median,
  summarizeBehavior,
  summarizeLiveFidelity,
  summarizeQa,
  summarizeSnapshotFidelity,
  summarizeSourceDrift,
  summarizeUnknowns,
  topStyleProperties,
  worstPages,
  type BehaviorSummary,
  type LiveFidelity,
  type QaSummary,
  type SnapshotFidelity,
  type SourceDriftTotals,
  type UnknownSummary,
  type WorstEntry,
} from "./summarize.js";

export {
  mapLimit,
  runReconstructionQa,
  type QaRunResult,
  type RunQaOptions,
} from "./run-qa.js";
