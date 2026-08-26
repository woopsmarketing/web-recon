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
 */

export * from "./types.js";
export { CONTENT_POLICY } from "./policy.js";
export { contentRunDir, newContentRunId, createdAtFromRunId } from "./store.js";
export { loadReconTemplate, type LoadedReconTemplate } from "./load-template.js";
export { buildContentUnits, sectionOfKey, type BuiltUnits } from "./units.js";
export { prepareContentRun, intentHash, BATCH_UNIT_LIMIT, type PrepareOptions, type PreparedContentRun } from "./packet.js";
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
export { buildRepairRequest, mergeRepairValues, unitsForRepair } from "./repair.js";
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
