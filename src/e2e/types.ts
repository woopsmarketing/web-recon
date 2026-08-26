import { z } from "zod";

/**
 * Full End-to-End Reconstruction types & schemas (Task 16).
 *
 * This layer adds no observation, no interpretation and no reconstruction of its
 * own. It is the wiring that makes one sentence executable:
 *
 *   > a public URL nobody has looked at before → an independent Next.js app,
 *   > measured, with every gap named and owned.
 *
 * Two properties are what make it worth being a module rather than a shell
 * script (items 31, 40):
 *
 *  - **Every stage is called through its own public API, in one process.** No
 *    `exec("pnpm verify …")`, so a stage's TypeScript contract is the interface
 *    and a failure is an exception with a phase rather than an exit code.
 *  - **Every artifact path is passed explicitly, from this run.** Nothing
 *    searches the filesystem for "the newest file". A pipeline that picks up a
 *    stale artifact produces a manifest that looks complete and describes two
 *    different sites, which is the worst possible failure mode for a tool whose
 *    output is evidence.
 *
 * Data levels are inherited, not redefined: every number in an E2E manifest was
 * produced by the stage that owns it. This layer's own contribution is
 * `derived` — ordering, lineage, elapsed time and accounting.
 */

/** Bumped when any persisted E2E shape changes. */
export const SCHEMA_VERSION = 1 as const;

/**
 * Bumped when the ORCHESTRATION changes without a schema change: a new stage, a
 * reordering, a different escalation policy. Separate from `schemaVersion` so a
 * reader can ask "was this run produced by the pipeline that fixed X?" without
 * diffing field lists.
 */
export const PIPELINE_VERSION = 1 as const;

export const E2E_ENGINE = "e2e-orchestrator";

/** Fixed file names inside an E2E run directory. */
export const E2E_MANIFEST_FILE = "e2e-manifest.json";
export const E2E_RUNS_DIR = "e2e-runs";

// ---------------------------------------------------------------------------
// Options (items 30, 43)
// ---------------------------------------------------------------------------

/**
 * Default URL budget for a fresh external site.
 *
 * 20 is not a performance number — it is a courtesy number. Every discovered URL
 * becomes a verification page load, then possibly a desktop + mobile deep
 * observation, then possibly interaction actions, then two QA captures. The hard
 * ceiling of 40 exists so no flag combination can turn this into a crawler.
 */
export const DEFAULT_MAX_URLS = 20;
export const MIN_MAX_URLS = 1;
export const MAX_MAX_URLS = 40;

/** Browser work in flight. Two is the Observer's own default and this stage's. */
export const DEFAULT_CONCURRENCY = 2;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 4;

/** Correction iterations, matching Task 15's own default and ceiling. */
export const DEFAULT_MAX_FIX_ITERATIONS = 2;
export const MAX_FIX_ITERATIONS_CEILING = 5;

/** Family-represented routes promoted to exact observation, at most (item 64). */
export const DEFAULT_FAMILY_ESCALATION = 4;
export const MAX_FAMILY_ESCALATION = 12;

/**
 * Targeted re-observations of one route, ever (item 62).
 *
 * One. A route that still drifts after being re-observed is a site that changes
 * faster than this pipeline measures it, and saying so is more useful than
 * looping until the numbers happen to agree.
 */
export const MAX_REOBSERVE_PER_ROUTE = 1;

// ---------------------------------------------------------------------------
// Stages (item 36)
// ---------------------------------------------------------------------------

/**
 * The pipeline, in the ONE order it runs.
 *
 * Declared as a constant rather than derived from execution, so the manifest's
 * stage order is a property of the pipeline and not of which promise settled
 * first.
 */
export const StageNameSchema = z.enum([
  "discovery",
  "verification",
  "selection",
  "observation",
  "interaction-detection",
  "interaction-exploration",
  "interaction-modeling",
  "sitespec",
  "reconstruction",
  "build",
  "qa",
  "family-escalation",
  "final-validation",
]);
export type StageName = z.infer<typeof StageNameSchema>;

export const STAGE_ORDER: readonly StageName[] = StageNameSchema.options;

export const StageStatusSchema = z.enum([
  "ok",
  /** The stage produced a usable result while losing part of its input. */
  "partial",
  "failed",
  /** Not run because an earlier stage failed, or because it was not requested. */
  "skipped",
]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

/**
 * Why a run stopped, or where it lost something (item 37).
 *
 * A closed vocabulary rather than one `failed` bit, because these have entirely
 * different answers: `verification-empty` means the site refused an anonymous
 * browser, `sitespec-invalid` means this pipeline has a bug, and
 * `observation-partial` means neither — some pages worked.
 */
export const E2eFailureSchema = z.enum([
  "discovery-failure",
  "discovery-empty",
  "verification-failure",
  "verification-empty",
  "selection-failure",
  "observation-failure",
  "observation-partial",
  "interaction-failure",
  "interaction-partial",
  "sitespec-invalid",
  "reconstruction-failure",
  "reconstruction-build-failure",
  "qa-infrastructure-failure",
  "escalation-failure",
  "final-validation-failure",
]);
export type E2eFailure = z.infer<typeof E2eFailureSchema>;

/**
 * Failures that end the run (item 38).
 *
 * The rule is "can the next stage do its job at all?". One page that failed to
 * observe costs one page; zero verified routes costs everything downstream, so
 * continuing would only produce an empty SiteSpec and a clone of nothing.
 */
export const FATAL_FAILURES: readonly E2eFailure[] = [
  "discovery-failure",
  "discovery-empty",
  "verification-failure",
  "verification-empty",
  "selection-failure",
  "observation-failure",
  "sitespec-invalid",
  "reconstruction-failure",
  "reconstruction-build-failure",
];

export const StageRecordSchema = z.object({
  stage: StageNameSchema,
  status: StageStatusSchema,
  /** Path (working-directory-relative) of this stage's primary artifact. */
  artifact: z.string().optional(),
  /** The run directory this stage wrote into, when it has its own namespace. */
  runDir: z.string().optional(),
  /** Stage-defined counts. Never a score — always a count of something real. */
  counts: z.record(z.string(), z.number()),
  /** Non-fatal problems, in the stage's own words. */
  warnings: z.array(z.string()),
  failure: E2eFailureSchema.optional(),
  error: z
    .object({ name: z.string(), message: z.string() })
    .optional(),
  elapsedMs: z.number().int().nonnegative(),
});
export type StageRecord = z.infer<typeof StageRecordSchema>;

// ---------------------------------------------------------------------------
// Lineage (item 39)
// ---------------------------------------------------------------------------

/**
 * What each stage consumed, so "did these stages describe the same site?" is
 * answerable from the manifest alone.
 *
 * Every entry is written by the orchestrator at the moment it hands a path to a
 * stage, and `assertLineage()` re-checks the chain before the SiteSpec compile.
 * A pipeline that silently mixed two runs would produce a manifest that reads
 * perfectly, so the check has to be mechanical.
 */
export const LineageSchema = z.object({
  rootUrl: z.string(),
  discoveryRunDir: z.string().optional(),
  discoveryFile: z.string().optional(),
  verificationFile: z.string().optional(),
  verifiedUrlsFile: z.string().optional(),
  pageFamiliesFile: z.string().optional(),
  selectedPagesFile: z.string().optional(),
  siteObservationFile: z.string().optional(),
  interactionAnalysisFile: z.string().optional(),
  interactionExplorationFile: z.string().optional(),
  interactionPatternsFile: z.string().optional(),
  siteSpecFile: z.string().optional(),
  reconstructionManifestFile: z.string().optional(),
  qaManifestFile: z.string().optional(),
  /** Set only when a family escalation produced an augmented observation. */
  augmentedObservationFile: z.string().optional(),
});
export type Lineage = z.infer<typeof LineageSchema>;

// ---------------------------------------------------------------------------
// Final status (items 127–131)
// ---------------------------------------------------------------------------

/**
 * More precise than success/failure, on purpose (item 127).
 *
 * `complete-with-known-limitations` is the interesting one: it is what an honest
 * run of a real site usually IS. A remote asset the origin refuses to serve
 * cross-origin, an iframe's contents, a menu whose children come from a backend
 * — none of those are failures of the pipeline, and none of them are nothing.
 */
export const FinalStatusSchema = z.enum([
  "complete",
  "complete-with-known-limitations",
  "partial",
  "failed",
]);
export type FinalStatus = z.infer<typeof FinalStatusSchema>;

/** One thing this run could not resolve, with its owner (item 142). */
export const UnresolvedIssueSchema = z.object({
  classification: z.string(),
  count: z.number().int().nonnegative(),
  affectedNodes: z.number().int().nonnegative(),
  upstreamStage: z.string(),
  recommendation: z.string(),
  /** True when a targeted re-observation could plausibly resolve it. */
  requiresReobserve: z.boolean(),
  requiresNewInteractionProbe: z.boolean(),
  autoFixPossible: z.boolean(),
});
export type UnresolvedIssue = z.infer<typeof UnresolvedIssueSchema>;

export const E2eCoverageSchema = z.object({
  discoveredUrls: z.number().int().nonnegative(),
  verifiedUrls: z.number().int().nonnegative(),
  families: z.number().int().nonnegative(),
  representatives: z.number().int().nonnegative(),
  validationSamples: z.number().int().nonnegative(),
  observedPages: z.number().int().nonnegative(),
  failedPages: z.number().int().nonnegative(),
  interactionCandidates: z.number().int().nonnegative(),
  actionsPlanned: z.number().int().nonnegative(),
  actionsExecuted: z.number().int().nonnegative(),
  patternsConfirmed: z.number().int().nonnegative(),
  unknownInteractions: z.number().int().nonnegative(),
  generatedRoutes: z.number().int().nonnegative(),
  routesRendered: z.number().int().nonnegative(),
  qaPageViewports: z.number().int().nonnegative(),
  /**
   * Combined behavior verdict counts (trigger axis + visible-target axis in
   * one verdict). Task 17 §3 split the published metric into the four fields
   * below; these two remain as the combined verdict the regression gate uses.
   */
  behaviorEquivalent: z.number().int().nonnegative(),
  behaviorMismatch: z.number().int().nonnegative(),
  /**
   * Task 17 §3 — the separated axes. `triggerState*` is what Task 16 called
   * `behaviorEquivalent`; `userVisibleTarget*` is whether the user actually
   * saw the observed after-state. Absent on pre-Task-17 manifests.
   */
  triggerStateEquivalent: z.number().int().nonnegative().optional(),
  triggerStateMismatch: z.number().int().nonnegative().optional(),
  userVisibleTargetEquivalent: z.number().int().nonnegative().optional(),
  userVisibleTargetMismatch: z.number().int().nonnegative().optional(),
  userVisibleTargetNotObserved: z.number().int().nonnegative().optional(),
  userVisibleTargetNotDeclared: z.number().int().nonnegative().optional(),
  /**
   * JavaScript errors the CLONE threw while QA measured it.
   *
   * Task 16 first shipped without this: a run could serve 19 routes that each
   * threw a React hydration error and still be summarized as
   * `complete-with-known-limitations`, because the status was computed only
   * from diff CLASSIFICATIONS and an exception is not a diff. A clone that
   * throws is a defect in this pipeline, never a boundary of what public
   * observation can reach, so it is counted here and read by `finalStatus`.
   */
  cloneRuntimeErrors: z.number().int().nonnegative().optional(),
  /**
   * Root URL Invariant (Task 17). Four explicit answers to "where did the
   * input root URL go?", one per pipeline stage that could lose it. The
   * stripe.com Task 16 run reconstructed 19 routes, none of them `/`, and
   * every counter still read as a lossless pipeline — these fields exist so a
   * missing homepage can never again look like `19 = 19 = 19`.
   *
   * Absent on manifests written before Task 17.
   */
  inputRootIncluded: z.boolean().optional(),
  inputRootVerified: z.boolean().optional(),
  inputRootSelectedOrRepresented: z.boolean().optional(),
  inputRootReconstructed: z.boolean().optional(),
  familyEscalations: z.number().int().nonnegative(),
  correctionsProposed: z.number().int().nonnegative(),
  correctionsAccepted: z.number().int().nonnegative(),
});
export type E2eCoverage = z.infer<typeof E2eCoverageSchema>;

/**
 * The Task 16 upstream additions, accounted end to end (items 49–52).
 *
 * These exist because "we added scroll observation" is not a result. The result
 * is that N scroll containers were observed, N reached the SiteSpec, and N were
 * restored in the clone — and if those three numbers disagree, the accounting
 * says where the loss happened rather than leaving it to a screenshot.
 */
export const UpstreamAccountingSchema = z.object({
  /** A1 */
  observedAssetOccurrences: z.number().int().nonnegative(),
  uniqueAssets: z.number().int().nonnegative(),
  specImageNodes: z.number().int().nonnegative(),
  specAssetBoundImageNodes: z.number().int().nonnegative(),
  assetOccurrenceLoss: z.number().int().nonnegative(),
  /** A2 */
  observedScrollContainers: z.number().int().nonnegative(),
  specScrollStateNodes: z.number().int().nonnegative(),
  specScrolledNodes: z.number().int().nonnegative(),
  cloneScrollRestoreNodes: z.number().int().nonnegative(),
  qaScrollRestored: z.number().int().nonnegative(),
  qaScrollMismatched: z.number().int().nonnegative(),
  /** A3 */
  gridPropertyOccurrences: z.record(z.string(), z.number().int().nonnegative()),
  /** Dynamic target enhancement */
  dynamicTargets: z.number().int().nonnegative(),
  dynamicTargetsWithTemplate: z.number().int().nonnegative(),
  dynamicTemplateNodes: z.number().int().nonnegative(),
});
export type UpstreamAccounting = z.infer<typeof UpstreamAccountingSchema>;

export const E2eEnvironmentSchema = z.object({
  node: z.string(),
  platform: z.string(),
  /** Chromium build used for every browser stage. */
  browser: z.string().optional(),
  nextVersion: z.string().optional(),
  reactVersion: z.string().optional(),
  typescriptVersion: z.string().optional(),
  /** Always 0 unless an AI provider was explicitly configured (item 46). */
  aiCalls: z.number().int().nonnegative(),
  /** Firecrawl requests. Discovery only, by construction (item 45). */
  firecrawlCalls: z.number().int().nonnegative(),
});
export type E2eEnvironment = z.infer<typeof E2eEnvironmentSchema>;

export const E2eOptionsSchema = z.object({
  maxUrls: z.number().int().positive(),
  concurrency: z.number().int().positive(),
  autoFix: z.boolean(),
  maxFixIterations: z.number().int().nonnegative(),
  familyEscalation: z.number().int().nonnegative(),
  prepareScroll: z.boolean(),
  /** True when Discovery ran through something other than the Firecrawl adapter. */
  localDiscovery: z.boolean(),
});
export type E2eOptions = z.infer<typeof E2eOptionsSchema>;

export const E2eManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  pipelineVersion: z.literal(PIPELINE_VERSION),
  engine: z.literal(E2E_ENGINE),
  runId: z.string(),
  input: z.object({
    rootUrl: z.string(),
    options: E2eOptionsSchema,
  }),
  environment: E2eEnvironmentSchema,
  /** In {@link STAGE_ORDER}, always — never in completion order (item 36). */
  stages: z.array(StageRecordSchema),
  lineage: LineageSchema,
  qaRun: z.string().optional(),
  correctionRun: z.string().optional(),
  /** The reconstruction a reader should look at (items 93, 94). */
  finalReconstruction: z
    .object({
      path: z.string(),
      kind: z.enum(["baseline", "corrected", "escalated"]),
      /** Why this one and not a later iteration. */
      reason: z.string(),
    })
    .optional(),
  coverage: E2eCoverageSchema,
  upstream: UpstreamAccountingSchema,
  unresolvedIssues: z.array(UnresolvedIssueSchema),
  /** Per-stage wall clock, separated (item 113). */
  timings: z.record(z.string(), z.number()),
  /** Per-stage bytes written (item 114). */
  storageBytes: z.record(z.string(), z.number()),
  finalStatus: FinalStatusSchema,
  /** Provenance only. Never an input to ordering, ids or classification. */
  startedAt: z.string(),
  completedAt: z.string(),
});
export type E2eManifest = z.infer<typeof E2eManifestSchema>;

/** A stage refused its input, or the pipeline refused to continue. */
export class E2eError extends Error {
  constructor(
    message: string,
    readonly failure: E2eFailure,
  ) {
    super(message);
    this.name = "E2eError";
  }
}
