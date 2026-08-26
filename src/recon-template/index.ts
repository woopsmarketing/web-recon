/**
 * Recon Template Foundation & Slot V2 (Task 18).
 *
 * Barrel export. The whole module is offline and deterministic: nothing in
 * this import graph reaches Playwright, Firecrawl, an HTTP client or an AI
 * provider SDK. The only external dependencies are `zod` and Node builtins.
 * (The parity QA harness lives in `parity-qa.ts` and is NOT exported here —
 * it drives a browser and is imported only by its own CLI.)
 */

export * from "./types.js";

export { loadTemplateInput, type LoadTemplateInputOptions, type TemplateInput } from "./load-input.js";

export {
  extractAllPages,
  extractPage,
  type ExtractionResult,
  type HiddenTextOccurrence,
  type ImageOccurrence,
  type PageExtraction,
  type Section,
  type SvgTextOccurrence,
  type TextOccurrence,
  type UrlOccurrence,
  type Viewport,
} from "./extract.js";

export {
  decodeSvgEntities,
  escapeSvgText,
  replaceSvgTextRun,
  scanSvgTextRuns,
  type SvgTextRun,
} from "./svg-text.js";

export { coBindPaintTwins, type TwinCoBindingStats } from "./twin-binding.js";

export {
  classifyHref,
  compareLogicalSlots,
  groupOccurrences,
  pageKeyPrefix,
  pathHasLocalePrefix,
  slugify,
  type BindingSpec,
  type GroupingResult,
  type LogicalSlot,
} from "./grouping.js";

export { imageRole, linkRoles, textRole } from "./roles.js";

export {
  assembleArtifacts,
  assignKeys,
  type AssembledArtifacts,
  type KeyedSlot,
} from "./assemble.js";

export { applyOverrides, loadOverrides, type OverrideApplication } from "./overrides.js";

export {
  buildConstraintContext,
  computeConstraints,
  type ConstraintContext,
} from "./constraints.js";

export { buildSiteMap } from "./site-map.js";

export { buildSlotSummary, type SlotSample, type SlotSummary } from "./report.js";

export {
  generateTemplateApp,
  type GeneratedTemplateApp,
  type GenerateTemplateAppOptions,
} from "./generate-template-app.js";

export { validateTemplateArtifact, type TemplateValidation } from "./validate-output.js";

export {
  compileReconTemplate,
  type CompiledReconTemplate,
  type CompileReconTemplateOptions,
} from "./compile.js";

export {
  createdAtFromRunId,
  newTemplateRunId,
  reconTemplateRunDir,
  siteFolder,
} from "./store.js";
