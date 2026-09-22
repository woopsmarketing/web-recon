/**
 * SiteSpec Compiler (Task 13).
 *
 * Barrel export. The whole module is offline and deterministic: nothing in this
 * import graph reaches Playwright, Firecrawl, an HTTP client or an AI provider
 * SDK. The only external dependencies are `parse5` (a pure HTML5 parser), `zod`
 * and Node builtins.
 */

export * from "./types.js";

export {
  loadInputs,
  SiteSpecInputError,
  type LoadInputsOptions,
  type SiteSpecInputs,
} from "./load-inputs.js";

export {
  alignRenderedHtml,
  normalizeText,
  type AlignedChild,
  type AlignmentResult,
  type AlignmentSuccess,
  type AlignableElement,
} from "./content-tree.js";

export {
  compileAttributes,
  type CompiledAttributes,
  type RelationSource,
} from "./safe-attributes.js";

export {
  canonicalStyleKey,
  StyleCatalogBuilder,
} from "./style-catalog.js";

export { AssetCatalogBuilder, sanitizeSvgMarkup, type SanitizedSvg } from "./asset-catalog.js";

export {
  computeAuthoredBreakpoints,
  type AuthoredLayoutBearingNode,
  type AuthoredLayoutScope,
  type ComputeAuthoredBreakpointsOptions,
} from "./authored-breakpoints.js";

export {
  compileViewport,
  type CompiledViewport,
  type CompileViewportInput,
} from "./compile-viewport.js";

export {
  compilePage,
  computeProbeAttachment,
  PROBE_PREFIX_MIN_ELEMENTS,
  type CompiledPage,
  type CompilePageInput,
  type ProbeAttachment,
  type ProbeAttachmentInput,
} from "./compile-page.js";

export { compileFamilies, type CompiledFamilies } from "./compile-families.js";

export { compileRoutes, type CompileRoutesInput } from "./compile-routes.js";

export {
  compileInteractions,
  type CompiledInteractions,
  type CompileInteractionsInput,
  type InteractionsByPage,
} from "./compile-interactions.js";

export {
  compileSiteSpec,
  pageSpecFile,
  type CompiledSiteSpec,
} from "./compile-site.js";

export {
  assertSiteSpecValid,
  SiteSpecValidationError,
  validateSiteSpec,
  type SiteSpecBundle,
  type ValidateOptions,
} from "./validate-sitespec.js";

export { summarizeSiteSpec, type SiteSpecSummary } from "./summarize.js";

export {
  saveSiteSpec,
  siteFolder,
  siteSpecRunDir,
  type SavedSiteSpec,
} from "./store.js";

export {
  loadSiteSpec,
  SiteSpecLoadError,
  type LoadedSiteSpec,
  type LoadSiteSpecOptions,
} from "./load-sitespec.js";

export {
  DEVICE_WIDTH_POLICY,
  MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX,
  MEDIA_CONDITION_MAX_LENGTH_PX,
  MEDIA_CONDITION_MIN_WIDTH_PX,
  foldMediaBreakpoints,
  parseMediaCondition,
  type MediaBreakpointEntry,
  type MediaBreakpointHistogram,
  type MediaConditionAlternative,
  type MediaConditionResult,
  type MediaConditionStatus,
  type MediaConditionTally,
  type MediaLengthUnit,
  type MediaWidthBound,
  type MediaWidthBoundKind,
  type MediaWidthBoundary,
  type MediaWidthInterval,
  type ParseMediaConditionOptions,
} from "./media-condition.js";
