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
  breakpointForPage,
  breakpointMediaQueries,
  inferBreakpoint,
  inferResponsivePlan,
  V1_RESPONSIVE_POLICY,
  type InferBreakpointOptions,
  type ResponsiveBreakpointPlan,
} from "./responsive-plan.js";

// Task 28.7 §26 — the generated app's own stylesheet, including the per-route
// tree switch it serves.
export { globalsCss, type RouteBreakpointOverride } from "./app-template.js";

export {
  FAMILY_CHANGE_MIN_ELEMENTS,
  FAMILY_CHANGE_MIN_RATIO,
  TIGHT_BRACKET_MAX_PX,
  TREE_SWITCH_CANDIDATES_REPORTED,
  TREE_SWITCH_CHANGE_TOLERANCE_PX,
  aggregateAuthoredCandidates,
  chooseTreeSwitch,
  classifyTreeDivergence,
  decidePageTreeSwitch,
  familyChangeSize,
  familyChangeVerdict,
  measureFingerprintChange,
  measureObservedChange,
  rankFamilyChangeCandidates,
  rankTreeSwitchCandidates,
  variantTreeNotObservedCode,
  type FamilyChangeVerdict,
  type PageFingerprintChange,
  type PageObservedChange,
  type PageTreeSwitch,
  type ChooseTreeSwitchInput,
  type TreeDivergence,
  type TreeDivergenceReport,
  type TreeSwitchCandidate,
  type TreeSwitchDecision,
  type TreeSwitchFallbackReason,
} from "./tree-switch.js";

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
  // Task 28.75 §CANVAS — the document canvas background, re-homed off the
  // in-flow document-root wrapper onto the real `html` element.
  DOCUMENT_ROOT_CANVAS_PROPERTIES,
  CANVAS_REFUSAL_REASONS,
  paintsBackground,
  resolveDocumentRootCanvas,
  type CanvasRefusalReason,
  type DocumentRootCanvas,
  assertNoMissingStyleTokens,
  documentRootClassName,
  generateStylesheet,
  isSafeCssProperty,
  isSafeCssValue,
  styleClassName,
  type GeneratedStyles,
  type GenerateStylesheetInput,
  // Task 28.8 A3 — text-box block-size relief, in the frozen tier.
  TEXT_BOX_HEIGHT_VARIANT_CLASS,
  TEXT_BOX_SHRINK_VARIANT_CLASS,
  textBoxHeightRelievable,
  textBoxWidthRelievable,
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
  // Task 28.8 A3 — the per-node predicates behind the relief variants.
  hasTextDescendant,
  textBoxHeightVariantApplies,
  textBoxShrinkVariantApplies,
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
  LAYOUT_VIEWPORT_IDS,
  measureParentContentBox,
  parentPaddingConstancy,
  type MeasuredContentBox,
  type ParentPaddingConstancy,
  MOBILE_TRUTH_WIDTH,
  VIEWPORT_PASS_REFUSALS,
  INLINE_SIZE_OUTCOMES,
  INLINE_SIZE_PRE_STAGE_DROPS,
  resolveViewportProbe,
  type InlineSizeOutcome,
  type InlineSizePreStageDrop,
  type LayoutViewportId,
  type ResolvedViewportPass,
  type ViewportPassRefusal,
  type RecoveredLayoutRule,
  containingBlockGuard,
  LAYOUT_GUARD_REASONS,
  FULL_WIDTH_TOLERANCE_PX,
  TRUTH_SANITY_TOLERANCE_PX,
  type LayoutGuardReason,
  // Task 28.6 R1 — hidden bands as numbers, before they become media strings.
  bandContains,
  bandMedia,
  hiddenBands,
  type HiddenBand,
  // Task 28.6 D1 — band edges snapped onto the breakpoints the SOURCE authored.
  authoredEdgeCandidates,
  authoredEdgePx,
  chooseAuthoredEdge,
  emptyBandSnapAccounting,
  resolveAuthoredBreakpoints,
  snapBandEdges,
  type AuthoredBreakpointProvenance,
  type BandEdgeDecision,
  type BandEdgeSource,
  type BandSnapAccounting,
  // Task 28.6 R2 — the `width: auto` stretch/intrinsic discriminator.
  inlineSizeBehaviour,
  INLINE_SIZE_REFUSAL_REASONS,
  // Task 28.7 G — the out-of-flow inset equation, read backwards.
  insetResolvedWidth,
  INSET_RESOLVED_REFUSAL_REASONS,
  type InsetContainingBlockKind,
  type InsetResolvedRefusalReason,
  type InsetResolvedResult,
  // Task 28.75 — the in-flow chain root: a gap that stays constant while the
  // parent grows, decomposed against the box model at the truth width.
  trackedFillWidth,
  TRACKED_FILL_REFUSAL_REASONS,
  type TrackedFillRefusalReason,
  type TrackedFillResult,
  // Task 28.75 — the in-flow full-bleed band, co-emitted rather than half-stated.
  viewportBleedWidth,
  VIEWPORT_BLEED_REFUSAL_REASONS,
  type ViewportBleedRefusalReason,
  type ViewportBleedResult,
  // Task 28.75 §19 — the damage clamp, the last resort.
  damageClampWidth,
  DAMAGE_CLAMP_REFUSAL_REASONS,
  type DamageClampRefusalReason,
  type InlineSizeBehaviour,
  type InlineSizeMode,
  type InlineSizeReason,
  // Task 28.6 V2 — refusals of the VALUE, distinct from refusals of the shape.
  WIDTH_VALUE_REFUSAL_REASONS,
  type WidthValueReason,
  // Task 28.6 A5 — grid column tracks recovered from observed child geometry.
  recoverGridTracks,
  GRID_TRACK_REFUSAL_REASONS,
  type GridTrackRecovery,
  type GridTrackRefusalReason,
  type GridTrackResult,
  type RecoveredTrack,
  type RecoveredRuleKind,
  // Task 28.75 §03b — band-aware grid column tracks, and the grid ITEM branch.
  gridAreaFillWidth,
  GRID_AREA_FILL_REFUSAL_REASONS,
  type GridAreaFillRefusalReason,
  type GridAreaFillResult,
  recoverGridTracksBanded,
  GRID_BAND_REFUSAL_REASONS,
  type GridBandRefusalReason,
  type GridTrackBand,
  type GridTrackBandResult,
  // Task 28.7 B2 — span-aware and hidden-child-aware grid track recovery.
  GRID_SPAN_TOLERANCE_PX,
  declaredColumnSpan,
  gridChildRole,
  type GridChildRole,
  // Task 28.7 B1 — the residual freeze audit's evidence side, and the bounded
  // per-node grid refusal log.
  GRID_TRACK_REFUSALS_REPORTED,
  RESIDUAL_AUDIT_MAX_NODES_PER_PASS,
  RESIDUAL_AUDIT_MAX_WIDTHS,
  RESIDUAL_CLONE_CONSTANT_PX,
  RESIDUAL_FROZEN_FAMILIES,
  RESIDUAL_FROZEN_REPORTED,
  RESIDUAL_SOURCE_CHANGE_MIN_PX,
  frozenFamilyOf,
  gridFrozenExcessPx,
  type GridTrackRefusalRecord,
  type ResidualAuditNode,
  type ResidualAuditPass,
  // Task 28.8 A2 — the authored inline-size fallback.
  authoredInlineSizeIntent,
  authoredMediaHolds,
  AUTHORED_INTENT_PROPERTIES,
  type AuthoredIntentAnswer,
  type AuthoredIntentRefusal,
  type AuthoredIntentDeclarationRefusal,
} from "./layout-inference.js";
export {
  MAX_ROUNDS as LAYOUT_TRUTH_CHECK_MAX_ROUNDS,
  REGRESSION_EPSILON_PX,
  isBanded,
  isBandedGeometry,
  truthCheckHtml,
  verifyLayoutRules,
  // Task 28.7 B1 — the residual freeze audit's measurement side.
  auditRenderWidths,
  residualsForPass,
  summariseResiduals,
  type ResidualAuditReport,
  type ResidualConsequence,
  type ResidualFrozenNode,
  type BandCheckRejection,
  type BandRejectionReason,
  type TruthCheckCounters,
  type TruthCheckInput,
  type TruthCheckRejection,
  type TruthCheckResult,
  type TruthCheckStatus,
} from "./layout-truth-check.js";
export { reconstructionRunDir, siteFolder, siteSlug } from "./store.js";

export {
  runNextBuild,
  type NextBuildResult,
  type RunNextBuildOptions,
} from "./build-app.js";
