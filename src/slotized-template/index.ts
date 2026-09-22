/**
 * Slotized Recon Template V1 (Task 29) — barrel.
 *
 * Offline and deterministic end to end: no network, no browser, no AI. The
 * compiler reads an accepted reconstruction + its Slot V2 contract and writes
 * a new run directory; the renderer reads that directory plus a content pack
 * and writes an app copy. Neither ever mutates its inputs.
 */

export * from "./types.js";
export { bindingIdOf, groupIdOf, itemIdOf, repeaterIdOf, slotIdOf, tokenIdOf, templateVersionOf } from "./ids.js";
export {
  createdAtFromRunId,
  newSlotizedRunId,
  siteFolder,
  slotizedRenderRunDir,
  slotizedTemplateRunDir,
} from "./store.js";
export { loadSlotizeInput, type SlotizeInput, type V2Contract } from "./load-input.js";
export {
  INTERNAL_PROVENANCE_FILES,
  IDENTITY_SURFACE_FILES,
  SITE_IDENTITY_SCHEMA_VERSION,
  SiteIdentitySchema,
  applyIdentityToAppShell,
  applyIdentityToRouteMap,
  loadSiteIdentity,
  provenanceOf,
  type IdentitySurfaceResult,
  type RenderProvenance,
  type SiteIdentity,
} from "./site-identity.js";
export { slotize, type SlotizeOptions, type SlotizeResult } from "./slotize.js";
export {
  loadTemplate,
  renderTemplate,
  type RenderOptions,
  type RepeaterHook,
  type RepeaterHookResult,
} from "./render.js";
export {
  detectRepeaters,
  growthPolicyOf,
  indexStyleRules,
  type LayoutEvidence,
  type RepeaterDetectionInput,
  type RepeaterDetectionResult,
} from "./repeaters.js";
export {
  applyRepeaters,
  collectDomIds,
  type RepeaterApplyContext,
  type RepeaterApplyResult,
} from "./repeaters-apply.js";
export {
  applyPageBindings,
  hideNodes,
  indexElements,
  projectValue,
  scanSvgRuns,
  type ApplyOp,
  type ApplyResult,
} from "./apply.js";
export {
  declarationValue,
  firstUrl,
  forEachRule,
  replaceFirstUrl,
  scanBackgroundImageRules,
  type BackgroundImageRule,
  type CssRule,
} from "./css.js";
export { buildGroups, type GroupBuildInput } from "./groups.js";
export { buildCoverage, type CoverageInput } from "./coverage.js";
export { buildAuthoring, type AuthoringInput } from "./authoring.js";
export { mergeGlobals, type GlobalMergeResult, type LikelyGlobal } from "./globals.js";
export { scanSurfaces, type RawBinding, type RawSlot, type SurfaceScanResult } from "./surfaces.js";
export { indexPages, indexVariant, type PageIndex, type VariantIndex } from "./tree.js";
export type { PreSlot } from "./preslot.js";
export * from "./theme-types.js";
export { censusPages, extractThemeTokens, normalizeColor } from "./theme-extract.js";
export { compileThemeCss } from "./theme-css.js";
export {
  buildDefaultThemePack,
  compileThemePackFile,
  extractAndWriteTheme,
  extractThemeForRun,
  loadThemeInput,
  loadThemePack,
  loadThemeTokens,
  resolveRunDir,
  themePackToExtraCss,
} from "./theme-pack.js";
export {
  CorpusSchema,
  MECHANICAL_REPEATERS,
  PACK_EXPECTATIONS_SCHEMA,
  PACK_PATHS,
  buildMechanicalPack,
  buildMutatedThemePack,
  buildRealisticPack,
  isQuantitative,
  loadCorpus,
  loadPackContext,
  mechanicalText,
  mechanicalUrl,
  mechanicalValue,
  realisticValue,
  stableStringify,
  svgPlaceholderDataUri,
  verifyExpectations,
  writePackFiles,
  type Corpus,
  type ExpectationVerification,
  type ExpectedRepeater,
  type ExpectedSlot,
  type MechanicalExpectations,
  type PackContext,
  type ThemeMutation,
} from "./packs.js";
export {
  AUDIT_DIR,
  AUDIT_SCHEMA_VERSION,
  auditArtifactCompleteness,
  auditContentPackValidation,
  auditDuplicateIds,
  auditFitWarnings,
  auditHardcodedContent,
  auditSlotCompleteness,
  auditSourceLeakage,
  auditThemeCoverage,
  buildNeedles,
  loadAuditContext,
  updateSummary,
  type AuditContext,
  type AuditFile,
  type AuditSummary,
  type LeakKind,
  type Verdict,
} from "./audit.js";
