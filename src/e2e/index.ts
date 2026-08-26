/**
 * Task 16 — Full End-to-End Reconstruction.
 *
 * Barrel export. This module orchestrates; it does not observe, interpret or
 * generate anything of its own. Every stage below is another Task's public API
 * called in one process, with every artifact path passed explicitly from this
 * run's context (items 31, 32, 40).
 */

export * from "./types.js";
export {
  createRunContext,
  orderedStages,
  portablePath,
  assertLineage,
  type E2eRunContext,
} from "./run-context.js";
export {
  executeStage,
  recordSkipped,
  type StageOutcome,
  type StageResult,
} from "./execute-stage.js";
export {
  STAGE_REGISTRY,
  assertRegistryIntegrity,
  type StageDescriptor,
} from "./stage-registry.js";
export { runDiscoveryStage, type DiscoveryStageResult } from "./run-discovery.js";
export {
  runVerificationStage,
  runSelectionStage,
  type VerificationStageResult,
  type SelectionStageResult,
} from "./run-verification.js";
export {
  runObservationStage,
  type ObservationStageResult,
} from "./run-observation.js";
export {
  runDetectionStage,
  runExplorationStage,
  runModelingStage,
  type DetectionStageResult,
  type ExplorationStageResult,
  type ModelingStageResult,
} from "./run-interactions.js";
export { runSiteSpecStage, type SiteSpecStageResult } from "./run-sitespec.js";
export {
  runReconstructionStage,
  runBuildStage,
  type ReconstructionStageResult,
} from "./run-reconstruction.js";
export { runQaStage, type QaStageResult } from "./run-qa.js";
export {
  ALLOWED_ESCALATIONS,
  CONDITIONAL_ESCALATIONS,
  REFUSED_ESCALATIONS,
  decideEscalation,
  summarizeUnresolved,
  type EscalationDecision,
} from "./escalation-policy.js";
export {
  runFamilyEscalationStage,
  selectEscalationTargets,
  type FamilyEscalationResult,
} from "./family-escalation.js";
export {
  runFinalValidationStage,
  type FinalValidationResult,
} from "./final-validation.js";
export {
  buildE2eSummary,
  classifyFinalStatus,
  type E2eSummary,
} from "./summarize.js";
export { e2eRunDir, newE2eRunId, saveE2eManifest } from "./store.js";
export {
  runE2eReconstruction,
  type RunE2eOptions,
  type E2eRunResult,
} from "./run-e2e.js";
