/**
 * Next.js Reconstruction Engine (Task 14).
 *
 * Barrel export. The whole module is offline and deterministic: nothing in this
 * import graph reaches Playwright, Firecrawl, an HTTP client or an AI provider
 * SDK. It reads ONE thing — a SiteSpec, through `loadSiteSpec()` — and writes
 * ONE thing: a Next.js application under `data/<host>/reconstructions/<run-id>/`.
 *
 *   SiteSpec input
 *     → reconstruction plan
 *     → React semantics adaptation
 *     → CSS generation
 *     → asset mapping
 *     → interaction binding
 *     → app generation
 *     → generated-app validation
 */

export * from "./types.js";

export {
  loadReconstructionInput,
  type LoadReconstructionInputOptions,
  type ReconstructionInput,
} from "./load-input.js";

export {
  buildRoutePlan,
  clonePathFor,
  routeKeyFromParts,
  routeKeyFromUrl,
  type BuildRoutePlanOptions,
  type RoutePlan,
} from "./route-plan.js";

export {
  BREAKPOINT_CONVENTION,
  breakpointMediaQueries,
  inferBreakpoint,
  type InferBreakpointOptions,
} from "./responsive-plan.js";

export {
  BOOLEAN_ATTRIBUTES,
  BUTTON_LIKE_INPUT_TYPES,
  REACT_PROP_NAMES,
  SKIPPED_TAGS,
  VOID_ELEMENTS,
  adaptAttribute,
  hiddenStateAnnotation,
  isBooleanAttributePresent,
  isContentEditableEnabled,
  type AdaptedAttribute,
} from "./react-attributes.js";

export {
  RELATION_ATTRIBUTE,
  collectGeneratedIdNodes,
  dynamicTargetDomId,
  generatedDomId,
  rewriteRelations,
  type RelationRewrite,
  type RelationRewriteContext,
} from "./relations.js";

export {
  ALLOWED_CSS_PROPERTIES,
  DOCUMENT_ROOT_DROPPED_PROPERTIES,
  assertNoMissingStyleTokens,
  documentRootClassName,
  generateStylesheet,
  isSafeCssProperty,
  isSafeCssValue,
  styleClassName,
  type GeneratedStyles,
  type GenerateStylesheetInput,
} from "./style-generator.js";

export {
  generatePseudoStyles,
  isSafeContentValue,
  pseudoSelector,
  type GeneratedPseudoStyles,
  type PseudoRuleInput,
} from "./pseudo-generator.js";

export {
  AssetResolver,
  annotateSvgRoot,
  assertSvgIsDefused,
  type AssetResolverOptions,
  type ResolvedElementAssets,
} from "./asset-resolver.js";

export {
  LinkRewriter,
  type LinkKind,
  type LinkRewriterOptions,
  type RewrittenLink,
} from "./link-rewriter.js";

export {
  bindingKey,
  bindingProps,
  buildInteractionPlan,
  generateObservedTargetCss,
  unknownProps,
  type BuildInteractionPlanInput,
  type InteractionBinding,
  type InteractionOp,
  type InteractionPlan,
  type ObservedTargetBinding,
  type TargetOp,
  type UnknownAnnotation,
} from "./interaction-bindings.js";

export {
  collectText,
  compileDocumentRoot,
  compileNode,
  newCounters,
  optionValue,
  selectDefaultValue,
  type CompileCounters,
  type CompileNodeContext,
} from "./compile-node.js";

export {
  compileRuntimePage,
  mergeCounters,
  type CompiledRuntimePage,
  type CompileRuntimePageInput,
} from "./compile-runtime-page.js";

export {
  buildCorrectionPlan,
  type CanvasBackgroundCorrectionInput,
  type CorrectionPlan,
  type InteractionStateStyleCorrectionInput,
  type ReconstructionCorrectionInput,
  type ReconstructionCorrections,
  type SafeDataImageCorrectionInput,
} from "./qa-corrections.js";

export {
  planReconstruction,
  runtimePageFile,
  type PlanReconstructionOptions,
  type ReconstructionPlan,
} from "./plan-reconstruction.js";

export {
  generateApp,
  resolveDependencyVersions,
  type GenerateAppOptions,
  type GeneratedApp,
} from "./generate-app.js";

export {
  validateGeneratedApp,
  type GeneratedAppValidation,
  type ValidateGeneratedAppOptions,
} from "./validate-output.js";

export {
  NESTING_CONTAINER_CLASS,
  adaptParserNesting,
  countNestingContainers,
  detectNestingRepair,
  type AdaptNestingResult,
  type NestingAdaptation,
  type NestingRepair,
  type NestingRepairKind,
} from "./nesting.js";

export {
  generateLayoutCss,
  inferLayoutRules,
  type InferLayoutInput,
  type LayoutInferenceCounters,
  type LayoutInferenceResult,
  type RecoveredLayoutRule,
} from "./layout-inference.js";
export { reconstructionRunDir, siteFolder, siteSlug } from "./store.js";

export {
  runNextBuild,
  type NextBuildResult,
  type RunNextBuildOptions,
} from "./build-app.js";
