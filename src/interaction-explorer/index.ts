export * from "./types.js";
export {
  ExplorerInputError,
  loadCandidatePage,
  loadInteractionAnalysis,
  type LoadedCandidatePage,
  type LoadedInteractionAnalysis,
  type LoadedViewportDom,
} from "./load-analysis.js";
export {
  buildLocatorDescriptor,
  strongSemanticFields,
} from "./build-locator.js";
export {
  candidateEligibility,
  planSiteActions,
  selectPlanPages,
  shapeKeyOf,
  skipReasonCounts,
  skippedByPolicyCount,
  type EligibilityVerdict,
  type PlannedSite,
  type PlannedPageSelection,
} from "./plan-actions.js";
export {
  resolveLiveCandidate,
  resolveLocatorInBrowser,
  type ResolvedCandidate,
} from "./resolve-live-candidate.js";
export {
  captureSnapshot,
  collectMutations,
  installMutationObserver,
  readLiveSignals,
  waitForAnimationFrames,
  type SnapshotControlInput,
} from "./capture-state.js";
export {
  discoverUserVisibleTargets,
  installTargetBaseline,
  type TargetDiscoveryResult,
} from "./discover-targets.js";
export { reconcileLiveState, type ReconcileVerdict } from "./reconcile-live-state.js";
export { SafetyGuard } from "./safety-guards.js";
export { diffSnapshots, type DiffOptions } from "./diff-state.js";
export { executeAction, type ExecuteActionOptions } from "./execute-action.js";
export {
  buildInteractionPlan,
  exploreSite,
  type ExplorationRun,
  type ExploreSiteOptions,
} from "./explore-site.js";
export {
  actionObservationFileRelative,
  explorationRunDir,
  saveExplorationManifest,
  saveInteractionObservation,
  saveInteractionPlan,
  siteFolder,
  type SavedExploration,
  type SavedFile,
} from "./store.js";
