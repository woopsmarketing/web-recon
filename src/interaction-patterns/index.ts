/**
 * Interaction Pattern Modeling & Unknown Interaction Strategy (Task 12).
 *
 * Barrel export. The whole module is offline and deterministic: nothing in this
 * import graph reaches Playwright, Firecrawl, or the network, and the AI
 * boundary is opt-in and lives behind {@link resolveAnalyzer}.
 */

export {
  loadExploration,
  InteractionPatternInputError,
  type LoadedAction,
  type LoadedExploration,
} from "./load-exploration.js";

export {
  buildActionFacts,
  booleanTransition,
  type ActionFacts,
  type TargetFacts,
  type MutationFacts,
  type ValueTransition,
} from "./facts.js";

export {
  PATTERN_RULES,
  assertRegistryIntegrity,
  type PatternRule,
  type RuleMatch,
  type RulePartial,
} from "./registry.js";

export {
  isPatternEligible,
  matchPattern,
  type PatternMatchOutcome,
} from "./match-pattern.js";

export {
  classifyUnknown,
  type ClassifyOptions,
  type UnknownClassification,
} from "./classify-unknown.js";

export {
  beforeStateFamily,
  patternSignature,
  unknownSignature,
} from "./signature.js";

export {
  buildInteractionModels,
  type BuildPatternsOptions,
  type BuiltModels,
} from "./build-patterns.js";

export { summarize, type Summaries, type SummarizeInput } from "./summarize.js";

export {
  modelRunDir,
  saveAiAnalysis,
  saveInteractionPatterns,
  saveUnknownInteractions,
  siteFolder,
  type SavedFile,
} from "./store.js";

export * from "./types.js";

export {
  AI_PROMOTION_POLICY,
  AI_SCHEMA_VERSION,
  AiAnalysisArtifactSchema,
  AiInteractionAnalysisSchema,
  AiInteractionCaseSchema,
  type AiAnalysisArtifact,
  type AiConfidence,
  type AiInteractionAnalysis,
  type AiInteractionCase,
  type AiNextProbe,
  type UnknownInteractionAnalyzer,
} from "./ai/types.js";

export { buildAiCase, selectAiCases, type SelectedAiCase } from "./ai/build-ai-case.js";
export { FakeUnknownInteractionAnalyzer } from "./ai/fake-analyzer.js";
export {
  AI_PROVIDER_ENV,
  resolveAnalyzer,
  runAiFallback,
  type AiFallbackResult,
  type ResolveAnalyzerOptions,
  type ResolvedAnalyzer,
  type RunAiFallbackOptions,
} from "./ai/analyzer.js";
