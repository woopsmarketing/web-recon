/**
 * Natural Language Content Injection (Task 19) — public API.
 *
 *   prepareContentRun()        intent → bounded Content Task Packet
 *   ContentGenerator           provider-neutral generation contract
 *   FakeContentGenerator       deterministic offline provider (tests)
 *   loadManualGenerationResult manual JSON seam (operator / Claude Code MVP)
 *   ingestGenerationResult()   validate + emit slot-values overlay
 *   revalidateSlotValues()     §29 human-override revalidation
 *   runContentLayoutQa()       browser layout-safety QA (the one live stage)
 *   buildRepairRequest()       bounded repair loop input (§27)
 *
 * Task 27 additions:
 *   executeGenerationBatches() the batches are now actually EXECUTED (§1)
 *   buildSlotAccounting()      every in-scope slot, origin + disposition (§2/§3)
 *   applyTruthMode()           verified-only / synthetic-allowed (§4)
 *   loadContentBrief()         ONE BRIEF → FIRST DRAFT, every field optional (§5)
 *   RepairProgressGuard        bounded no-progress detection, GED-D (§6)
 *   buildRegionPlans()         the missing plan → unit layer
 */

export * from "./types.js";
export { CONTENT_POLICY } from "./policy.js";
export { contentRunDir, newContentRunId, createdAtFromRunId } from "./store.js";
export { loadReconTemplate, type LoadedReconTemplate } from "./load-template.js";
export { buildContentUnits, sectionOfKey, type BuiltUnits } from "./units.js";
export { prepareContentRun, intentHash, BATCH_UNIT_LIMIT, type PrepareOptions, type PreparedContentRun } from "./packet.js";
export {
  BATCH_ORDERING_RULE,
  assertNoBatchConflicts,
  executeGenerationBatches,
  mergeBatchResults,
  type BatchExecutionOptions,
  type BatchExecutionOutcome,
  type BatchResultEntry,
} from "./batching.js";
export {
  buildSlotAccounting,
  inScopeSlotKeys,
  type SlotAccountingInput,
} from "./accounting.js";
export {
  DECLARED_SYNTHETIC,
  applyTruthMode,
  claimBackedByFacts,
  factClaimIn,
  resolveTruthMode,
  type TruthModeOutcome,
} from "./truth-mode.js";
export { briefFacts, briefGaps, briefPreferences, loadContentBrief } from "./brief.js";
export {
  buildRegionPlanFile,
  buildRegionPlans,
  loadRegionContracts,
  type BuildRegionPlansResult,
  type RegionPlanFileInput,
} from "./region-plan.js";
export {
  FakeContentGenerator,
  loadManualGenerationResult,
  resolveGenerator,
  type ContentGenerationInput,
  type ContentGenerator,
} from "./providers.js";
export { validateGenerationResult, validateSlotAssignments, type ValidateOptions } from "./validate.js";
export { detectSourceBrandLeaks, brandTokensFromHost } from "./brand-leak.js";
export { buildOverlayValues, effectiveSlotValues, changedKeys } from "./overlay.js";
export { runContentLayoutQa, type ContentLayoutQaOptions } from "./layout-qa.js";
export {
  RepairProgressGuard,
  buildRepairRequest,
  changedRepairKeys,
  failureSignatureOf,
  mergeRepairValues,
  noRepairCandidatesStop,
  repairStopFromLoop,
  unitsForRepair,
  type RepairAttempt,
} from "./repair.js";
export { buildOperatorReview, type OperatorReviewInput } from "./report.js";
export {
  loadContentRun,
  ingestGenerationResult,
  revalidateSlotValues,
  recordLayoutQa,
  updateManifest,
  type LoadedContentRun,
  type IngestOutcome,
} from "./run.js";
