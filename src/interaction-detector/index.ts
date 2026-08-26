export * from "./types.js";
export {
  buildElementIndex,
  extractSignals,
  hasAriaStateSignal,
  hasAriaValueSignal,
  hasPointerCursor,
  isPointerOperable,
  normalizeAttributes,
  sortEvidence,
  type ElementIndex,
  type ElementSignals,
} from "./classify-signals.js";
export {
  isStatefulContainer,
  parseIdRefs,
  resolveControlRelations,
  sortRelations,
  TargetCollector,
} from "./detect-targets.js";
export {
  detectViewportCandidates,
  type ViewportDetectionInput,
} from "./detect-candidates.js";
export {
  buildCapabilitySummary,
  buildGuardSummary,
  buildPageSummary,
  buildPrioritySummary,
  buildValidationComparisons,
  toSitePageSummary,
  toSitePageViewportSummary,
} from "./summarize.js";
export {
  InteractionInputError,
  loadPageObservation,
  loadSiteObservation,
  type LoadedPageObservation,
  type LoadedSiteObservation,
  type LoadedViewportObservation,
} from "./load-observation.js";
export {
  interactionCandidatesFileRelative,
  savePageInteractionAnalysis,
  saveSiteInteractionAnalysis,
  type SavedPageInteractionAnalysis,
  type SavedSiteInteractionAnalysis,
} from "./store.js";
export {
  analyzePage,
  analyzeSiteInteractions,
  type AnalyzeSiteOptions,
  type PageProgress,
  type SiteInteractionRun,
} from "./analyze-site.js";
