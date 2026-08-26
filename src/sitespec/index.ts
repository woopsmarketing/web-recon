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
