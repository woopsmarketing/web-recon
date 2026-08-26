import { z } from "zod";
import { ViewportProfileSchema } from "../observer/types.js";
import {
  ControlRelationTypeSchema,
  InteractionCapabilitySchema,
  InteractionPrioritySchema,
} from "../interaction-detector/types.js";
import {
  ActionStatusSchema,
  DiffCategorySchema,
  DiscoveredTargetStateSchema,
  SafetyEventTypeSchema,
  TargetDiscoveryKindSchema,
  TargetRelationEvidenceSchema,
} from "../interaction-explorer/types.js";

/**
 * Interaction Pattern Modeling & Unknown Interaction Strategy types (Task 12).
 *
 * Task 11 answered "what observably changed when this element was clicked?" and
 * deliberately refused to name it. This layer answers the next question, and
 * only that one:
 *
 *   > which reusable UI behavior does this verified transition belong to —
 *   > and when it belongs to none, WHY not?
 *
 * Three layers, kept logically separate on purpose:
 *
 *   1. Deterministic Pattern Registry  explicit rules over Task 11 evidence
 *   2. Unknown Classifier              a taxonomy of *distinct* failure causes
 *   3. AI boundary                     a provider-neutral contract, off by default
 *
 * The order is the policy: **rules first, unknown second, AI last** (item 58).
 * A deterministic pattern is never produced by AI, never overridden by AI, and
 * an AI proposal is never promoted into this registry (items 56, 57).
 *
 * Data levels, unchanged from Task 10/11:
 *  - `observed`  : anything Task 11 recorded — before/after state, diff entries,
 *                  live attributes, target state, mutations, safety events.
 *  - `derived`   : everything in THIS layer — pattern type, transition
 *                  direction, signature, unknown reason, coverage.
 *  - `inferred`  : AI fallback output only, and it lives in its own artifact.
 *
 * This module performs **no interaction and no I/O against a live site**: it
 * imports no Playwright, no Firecrawl, and no network client anywhere in its
 * import graph.
 */

/**
 * Bumped when any persisted pattern/unknown shape changes.
 * v2 (Task 17): `InteractionPatternInstance.observedTargets` — the regions the
 * user actually saw change, carried from the explorer's generic discovery.
 * v3 (Task 17.1): observed-target records may carry mount-host evidence
 * (`mountHostPath` / `mountHostTag` / `mountChildIndex`) and the
 * `captureExpanded` marker, carried verbatim from exploration v4.
 */
export const SCHEMA_VERSION = 3 as const;

/** Pattern/unknown shapes this codebase can still READ. */
export const READABLE_SCHEMA_VERSIONS = [1, 2, 3] as const;
export const ReadableSchemaVersionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

/**
 * Bumped when the deterministic RULESET changes, independently of the schema
 * (item 39). A SiteSpec built later has to be able to ask "which ruleset decided
 * this?" without diffing the code.
 */
export const REGISTRY_VERSION = 1 as const;

/** Recorded in artifacts so a reader can tell what produced them. */
export const MODELER_ENGINE = "offline-deterministic";

// ---------------------------------------------------------------------------
// Pattern taxonomy (item 14)
// ---------------------------------------------------------------------------

/**
 * Pattern vocabulary v1 — deliberately small, and every member exists because a
 * rule can decide it from Task 11 evidence alone.
 *
 * Absent on purpose: `carousel`, `slider`, `before-after`, `parallax`,
 * `mega-menu`. There is no observation in the corpus that could confirm any of
 * them, and a registry entry nothing can match is a claim, not a rule (item 14).
 */
export const PatternTypeSchema = z.enum([
  "disclosure",
  "tabs",
  "menu",
  "dialog",
  "toggle",
  "selection",
  "dismiss",
  "generic-state-toggle",
]);
export type PatternType = z.infer<typeof PatternTypeSchema>;

/** Fixed order for every summary/table, so output never depends on Map order. */
export const PATTERN_TYPE_ORDER: readonly PatternType[] = [
  "disclosure",
  "tabs",
  "menu",
  "dialog",
  "toggle",
  "selection",
  "dismiss",
  "generic-state-toggle",
];

/**
 * HOW the transition was expressed in the DOM (item 65).
 *
 * A mechanism is an observation, not an interpretation: `native-details` means a
 * real `<details open>` flipped, `aria-expanded` means that attribute moved.
 * Two instances of the same pattern with different mechanisms are genuinely
 * different reconstructions later, so they are never collapsed.
 */
export const PatternMechanismSchema = z.enum([
  "native-details",
  "aria-expanded",
  "aria-selected",
  "aria-checked",
  "aria-pressed",
  "native-checked",
  "target-mounted",
  "target-visible",
  "candidate-removed",
]);
export type PatternMechanism = z.infer<typeof PatternMechanismSchema>;

export const PATTERN_MECHANISM_ORDER: readonly PatternMechanism[] = [
  "native-details",
  "aria-expanded",
  "aria-selected",
  "aria-checked",
  "aria-pressed",
  "native-checked",
  "target-mounted",
  "target-visible",
  "candidate-removed",
];

/**
 * The direction of a verified transition. Named as `<before>-to-<after>` so a
 * reader never has to know which boolean meant what.
 */
export const TransitionDirectionSchema = z.enum([
  "closed-to-open",
  "open-to-closed",
  "unselected-to-selected",
  "selected-to-unselected",
  "off-to-on",
  "on-to-off",
  "present-to-removed",
]);
export type TransitionDirection = z.infer<typeof TransitionDirectionSchema>;

export const TRANSITION_DIRECTION_ORDER: readonly TransitionDirection[] = [
  "closed-to-open",
  "open-to-closed",
  "unselected-to-selected",
  "selected-to-unselected",
  "off-to-on",
  "on-to-off",
  "present-to-removed",
];

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * One fact a rule stood on. `source` names the Task 11 field it was read from,
 * so every pattern can be argued with against the original artifact.
 *
 * `level` is never `inferred` here — that value exists only in the AI artifact.
 */
export const PatternEvidenceSchema = z.object({
  /** `aria-expanded`, `open`, `target-mounted`, `role=tab`, … */
  signal: z.string(),
  /** Where it was read: `diff.changes`, `before.candidate.attributes`, … */
  source: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  level: z.enum(["observed", "derived"]),
});
export type PatternEvidence = z.infer<typeof PatternEvidenceSchema>;

// ---------------------------------------------------------------------------
// Observed user-visible targets (Task 17 §4 carriage)
// ---------------------------------------------------------------------------

/**
 * One region the user actually saw change when this pattern's trigger was
 * clicked — the explorer's generic discovery, carried verbatim minus the
 * bounded subtree (which stays in the action artifact and is re-read by the
 * SiteSpec compiler via `source.actionId` + `discoveryId`). All `observed`
 * level; no rule reads this, it is pure carriage for reconstruction.
 */
export const ObservedTargetRecordSchema = z.object({
  discoveryId: z.string(),
  kind: TargetDiscoveryKindSchema,
  direction: z.enum(["appeared", "disappeared", "content-changed"]),
  descriptor: z.object({
    tagName: z.string(),
    htmlId: z.string().optional(),
    role: z.string().optional(),
    structuralPath: z.string(),
    /** Task 17.1 — mount-host evidence, carried verbatim from exploration v4. */
    mountHostPath: z.string().optional(),
    mountHostTag: z.string().optional(),
    mountChildIndex: z.number().int().nonnegative().optional(),
  }),
  relationEvidence: z.array(TargetRelationEvidenceSchema).min(1),
  before: DiscoveredTargetStateSchema,
  after: DiscoveredTargetStateSchema,
  mountedDescendantCount: z.number().int().nonnegative(),
  textSample: z.string().optional(),
  textLength: z.number().int().nonnegative(),
  /** Whether the action artifact holds a bounded after-state subtree capture. */
  hasCapturedSubtree: z.boolean(),
  /** Task 17.1 — the capture was retried once under the expanded caps. */
  captureExpanded: z.boolean().optional(),
  provenance: z.literal("observed"),
});
export type ObservedTargetRecord = z.infer<typeof ObservedTargetRecordSchema>;

// ---------------------------------------------------------------------------
// Pattern instance (item 36)
// ---------------------------------------------------------------------------

/**
 * The compact description of ONE verified behavior, at one page, in one
 * viewport (item 105).
 *
 * It deliberately does NOT embed the Task 11 action object. `source` is a
 * reference; anyone who wants the raw before/after can follow it. Duplicating
 * the observation here would make this artifact a second copy of a 4.5 MB run
 * and would let the two drift apart.
 */
export const InteractionPatternInstanceSchema = z.object({
  /** `ip000001…`, assigned after a stable (pageId, viewport, actionId) sort. */
  id: z.string(),

  patternType: PatternTypeSchema,
  /** Narrower shape inside the type when the markup declares one (`listbox`). */
  subtype: z.string().optional(),

  ruleId: z.string(),
  ruleVersion: z.number().int().positive(),
  registryVersion: z.literal(REGISTRY_VERSION),

  /** Always `derived`. A deterministic rule read observed facts (item 10). */
  provenance: z.literal("derived"),

  source: z.object({
    /** The Task 11 run directory this was modeled from. */
    explorationRun: z.string(),
    actionId: z.string(),
    pageId: z.string(),
    url: z.string(),
    viewport: ViewportProfileSchema.shape.id,
    sourceCandidateId: z.string(),
    sourceElementId: z.string(),
    /** `pages/p000001/desktop/ia000001.json`, relative to the run dir. */
    observationFile: z.string(),
  }),

  trigger: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    /** Task 11's normalized direct text — identity, never a matching rule. */
    text: z.string().optional(),
    priority: InteractionPrioritySchema,
    capabilities: z.array(InteractionCapabilitySchema),
  }),

  mechanism: PatternMechanismSchema,

  transition: z.object({
    direction: TransitionDirectionSchema.optional(),
    /** The field that carried the transition (`aria-expanded`, `open`, …). */
    field: z.string(),
    before: z.string(),
    after: z.string(),
  }),

  /** Present only when the trigger DECLARES a region and that region moved. */
  target: z
    .object({
      relation: ControlRelationTypeSchema,
      targetDomId: z.string().optional(),
      tagName: z.string().optional(),
      role: z.string().optional(),
      existedBefore: z.boolean(),
      existsAfter: z.boolean(),
      mounted: z.boolean(),
      unmounted: z.boolean(),
      visibilityChanged: z.boolean(),
      /** Interactive descendants counted inside the region AFTER the action. */
      interactiveDescendantsAfter: z.number().int().nonnegative().optional(),
    })
    .optional(),

  /**
   * Task 17 §4 — regions the user actually saw change on this action, from the
   * explorer's generic discovery. Absent on v1 artifacts and on actions where
   * nothing user-visible was discovered.
   */
  observedTargets: z.array(ObservedTargetRecordSchema).optional(),

  /** The facts the rule REQUIRED. Without all of them it would not have fired. */
  evidence: z.array(PatternEvidenceSchema),
  /** Facts that agreed but were not required. */
  supportingEvidence: z.array(PatternEvidenceSchema),
  /** What this instance does NOT claim (item 12's honesty requirement). */
  limitations: z.array(z.string()),

  /** Compact behavior fingerprint (item 40). Excludes id / URL / text. */
  signature: z.string(),
});
export type InteractionPatternInstance = z.infer<
  typeof InteractionPatternInstanceSchema
>;

// ---------------------------------------------------------------------------
// Unknown taxonomy (item 27)
// ---------------------------------------------------------------------------

/**
 * Why no deterministic pattern was produced. The whole point is that these are
 * DIFFERENT causes and must never collapse into one bucket (items 26, 67):
 *
 *  - `navigation-tainted`         the URL moved, so before/after are two pages.
 *  - `style-only-change`          only `class` / `style` mutated.
 *  - `already-in-target-state`    the control was already in the state a click
 *                                 would have produced.
 *  - `blocked-navigation`         a safety guard stopped the click's real effect.
 *  - `execution-error`            the action never completed.
 *  - `opaque-action`              it ran, and nothing observable moved at all.
 *  - `unsupported-dynamic-region` the DOM structurally changed outside every
 *                                 observed vocabulary (item 120's limitation).
 *  - `unmatched-transition`       a real transition no rule explains — the most
 *                                 valuable AI input there is (item 35).
 *  - `insufficient-evidence`      a transition too thin for any rule to stand on.
 */
export const UnknownReasonSchema = z.enum([
  "navigation-tainted",
  "style-only-change",
  "already-in-target-state",
  "blocked-navigation",
  "execution-error",
  "opaque-action",
  "unsupported-dynamic-region",
  "unmatched-transition",
  "insufficient-evidence",
]);
export type UnknownReason = z.infer<typeof UnknownReasonSchema>;

export const UNKNOWN_REASON_ORDER: readonly UnknownReason[] = [
  "navigation-tainted",
  "style-only-change",
  "already-in-target-state",
  "blocked-navigation",
  "execution-error",
  "opaque-action",
  "unsupported-dynamic-region",
  "unmatched-transition",
  "insufficient-evidence",
];

/**
 * Whether an AI fallback is worth spending on this case (item 48).
 *
 *  - `eligible`   : the cause is genuinely unknown; a model might see something.
 *  - `conditional`: only useful under an explicit opt-in (navigation-tainted —
 *                   the DOM diff is page replacement, so most of it is noise).
 *  - `excluded`   : the cause is already deterministically explained. Sending it
 *                   would be paying a model to repeat what a rule already knows.
 */
export const AiEligibilitySchema = z.enum([
  "eligible",
  "conditional",
  "excluded",
]);
export type AiEligibility = z.infer<typeof AiEligibilitySchema>;

/**
 * A partially-matched rule, kept as a HINT only (item 12).
 *
 * `partial` never produces a pattern instance. It records that a rule got as far
 * as N of its required facts and names the ones it did not find, which is
 * exactly what a human (or a model) needs to decide whether the rule or the site
 * is wrong.
 */
export const PartialPatternHintSchema = z.object({
  ruleId: z.string(),
  patternType: PatternTypeSchema,
  matchedEvidence: z.array(z.string()),
  missingEvidence: z.array(z.string()),
});
export type PartialPatternHint = z.infer<typeof PartialPatternHintSchema>;

/** Compact before/after state summary — stateful vocabulary only, no free text. */
export const StateSummarySchema = z.object({
  /** Values of the stateful ARIA attributes that were present. */
  aria: z.record(z.string(), z.string()),
  /** Boolean DOM state (`checked` / `open` / …) that was present. */
  state: z.record(z.string(), z.boolean()),
  visible: z.boolean().optional(),
  exists: z.boolean(),
});
export type StateSummary = z.infer<typeof StateSummarySchema>;

/** Deterministic mutation categories — never the mutated values themselves. */
export const MutationCategorySchema = z.enum([
  "class",
  "style",
  "aria",
  "state-attribute",
  "nodes-added",
  "nodes-removed",
]);
export type MutationCategory = z.infer<typeof MutationCategorySchema>;

export const MUTATION_CATEGORY_ORDER: readonly MutationCategory[] = [
  "class",
  "style",
  "aria",
  "state-attribute",
  "nodes-added",
  "nodes-removed",
];

export const UnknownInteractionCaseSchema = z.object({
  /** `iu000001…`, assigned after a stable (pageId, viewport, actionId) sort. */
  id: z.string(),
  reason: UnknownReasonSchema,

  source: z.object({
    explorationRun: z.string(),
    actionId: z.string(),
    pageId: z.string(),
    url: z.string(),
    viewport: ViewportProfileSchema.shape.id,
    candidateId: z.string(),
    elementId: z.string(),
    observationFile: z.string(),
  }),

  /** Task 11's own action status, preserved rather than folded into `reason`. */
  status: ActionStatusSchema,

  candidateSummary: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    priority: InteractionPrioritySchema,
    capabilities: z.array(InteractionCapabilitySchema),
    /** Kept for a human reading the file; excluded from the signature. */
    label: z.string().optional(),
  }),

  beforeStateSummary: StateSummarySchema,
  afterStateSummary: StateSummarySchema.optional(),

  /** Diff categories present, in the Task 11 vocabulary order. */
  diffCategories: z.array(DiffCategorySchema),
  mutationSummary: z.object({
    categories: z.array(MutationCategorySchema),
    recordCount: z.number().int().nonnegative(),
    addedNodeCount: z.number().int().nonnegative(),
    removedNodeCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  safetySummary: z.array(SafetyEventTypeSchema),

  /**
   * For `navigation-tainted` only (item 25): the URLs, kept compactly so future
   * SPA-navigation modeling has something to start from instead of nothing.
   */
  navigation: z
    .object({
      urlBefore: z.string(),
      urlAfter: z.string(),
      sameDocumentNavigation: z.boolean(),
    })
    .optional(),

  partialPatternHints: z.array(PartialPatternHintSchema),

  aiEligibility: AiEligibilitySchema,
  /** Why it is (in)eligible — one short deterministic sentence. */
  aiEligibilityReason: z.string(),

  /**
   * A better probe state for a FUTURE exploration run (item 31). Purely a
   * recommendation: Task 12 changes no Task 11 planner rule.
   */
  preferredProbeState: z.string().optional(),

  /** Compact grouping fingerprint (item 46). Excludes text / URL / id. */
  signature: z.string(),

  provenance: z.literal("derived"),
});
export type UnknownInteractionCase = z.infer<
  typeof UnknownInteractionCaseSchema
>;

// ---------------------------------------------------------------------------
// Groups (items 41, 46)
// ---------------------------------------------------------------------------

export const PatternGroupSchema = z.object({
  signature: z.string(),
  patternType: PatternTypeSchema,
  subtype: z.string().optional(),
  mechanism: PatternMechanismSchema,
  direction: TransitionDirectionSchema.optional(),
  triggerTag: z.string(),
  triggerRole: z.string().optional(),
  targetTag: z.string().optional(),
  targetRole: z.string().optional(),
  viewport: ViewportProfileSchema.shape.id,
  instanceCount: z.number().int().positive(),
  /** Pages this behavior was seen on, sorted. */
  pageIds: z.array(z.string()),
  /** Every instance in the group, sorted — never truncated. */
  patternIds: z.array(z.string()),
});
export type PatternGroup = z.infer<typeof PatternGroupSchema>;

export const UnknownGroupSchema = z.object({
  signature: z.string(),
  reason: UnknownReasonSchema,
  status: ActionStatusSchema,
  triggerTag: z.string(),
  triggerRole: z.string().optional(),
  caseCount: z.number().int().positive(),
  pageIds: z.array(z.string()),
  caseIds: z.array(z.string()),
  /** The deterministically chosen case a single AI call would analyze. */
  representativeCaseId: z.string(),
  aiEligibility: AiEligibilitySchema,
});
export type UnknownGroup = z.infer<typeof UnknownGroupSchema>;

// ---------------------------------------------------------------------------
// Rule conflicts (item 13)
// ---------------------------------------------------------------------------

/**
 * Two rules of EQUAL specificity claimed the same action.
 *
 * This is never resolved by picking one arbitrarily. It is recorded, the action
 * produces no pattern, and it becomes an `unmatched-transition` — a registry
 * whose rules overlap is a registry bug, and hiding it behind a coin flip would
 * make that bug invisible.
 */
export const RuleConflictSchema = z.object({
  actionId: z.string(),
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  specificity: z.number().int(),
  ruleIds: z.array(z.string()),
  patternTypes: z.array(PatternTypeSchema),
});
export type RuleConflict = z.infer<typeof RuleConflictSchema>;

// ---------------------------------------------------------------------------
// Stats & coverage (items 43, 63)
// ---------------------------------------------------------------------------

export const PatternCoverageSchema = z.object({
  /** Every action Task 11 planned. */
  totalActions: z.number().int().nonnegative(),
  /** Actions whose physical click really happened. */
  executedActions: z.number().int().nonnegative(),
  /** Actions Task 11 declared a meaningful state transition for. */
  changedActions: z.number().int().nonnegative(),

  confirmedPatternInstances: z.number().int().nonnegative(),
  unknownCases: z.number().int().nonnegative(),

  navigationTainted: z.number().int().nonnegative(),
  executionErrors: z.number().int().nonnegative(),
  unmatchedTransitions: z.number().int().nonnegative(),

  /** `confirmedPatternInstances / changedActions`, 4 decimals. */
  patternCoverageOfChanged: z.number(),
  /** `confirmedPatternInstances / executedActions`, 4 decimals. */
  patternCoverageOfExecuted: z.number(),
});
export type PatternCoverage = z.infer<typeof PatternCoverageSchema>;

export const PatternPageSummarySchema = z.object({
  pageId: z.string(),
  url: z.string(),
  desktopPatternIds: z.array(z.string()),
  mobilePatternIds: z.array(z.string()),
  /** Distinct pattern types observed on this page, in vocabulary order. */
  patternTypes: z.array(PatternTypeSchema),
  unknownCount: z.number().int().nonnegative(),
});
export type PatternPageSummary = z.infer<typeof PatternPageSummarySchema>;

export const ViewportPatternSummarySchema = z.object({
  viewport: ViewportProfileSchema.shape.id,
  actions: z.number().int().nonnegative(),
  patterns: z.number().int().nonnegative(),
  unknowns: z.number().int().nonnegative(),
  patternTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
});
export type ViewportPatternSummary = z.infer<
  typeof ViewportPatternSummarySchema
>;

// ---------------------------------------------------------------------------
// Artifacts (item 61)
// ---------------------------------------------------------------------------

/**
 * `interaction-patterns.json`.
 *
 * There is NO timestamp anywhere in this schema, on purpose (item 95): pattern
 * modeling is a pure function of a Task 11 run, so re-running it must produce a
 * byte-identical file. Wall-clock timings are printed by the CLI and reported;
 * they never enter the deterministic artifact.
 */
export const InteractionPatternsArtifactSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  registryVersion: z.literal(REGISTRY_VERSION),
  engine: z.string(),
  rootUrl: z.string(),

  /** The Task 11 manifest this was modeled from — immutable input (item 8). */
  sourceExploration: z.string(),
  sourceExplorationRun: z.string(),

  /** Every rule in the registry, so a reader never needs the source to argue. */
  rules: z.array(
    z.object({
      id: z.string(),
      patternType: PatternTypeSchema,
      version: z.number().int().positive(),
      specificity: z.number().int(),
      description: z.string(),
      requiredEvidence: z.array(z.string()),
      optionalEvidence: z.array(z.string()),
      rejectionConditions: z.array(z.string()),
      matchCount: z.number().int().nonnegative(),
    }),
  ),

  coverage: PatternCoverageSchema,
  /** Non-zero counts, in {@link PATTERN_TYPE_ORDER}. */
  patternTypeSummary: z.record(z.string(), z.number().int().nonnegative()),
  /** Non-zero counts, in {@link PATTERN_MECHANISM_ORDER}. */
  mechanismSummary: z.record(z.string(), z.number().int().nonnegative()),
  viewportSummary: z.array(ViewportPatternSummarySchema),
  pages: z.array(PatternPageSummarySchema),

  /** Sorted by pattern id. */
  patterns: z.array(InteractionPatternInstanceSchema),
  /** Sorted by signature. */
  groups: z.array(PatternGroupSchema),
  /** Empty in a healthy registry (item 13). */
  ruleConflicts: z.array(RuleConflictSchema),
});
export type InteractionPatternsArtifact = z.infer<
  typeof InteractionPatternsArtifactSchema
>;

export const UnknownInteractionsArtifactSchema = z.object({
  schemaVersion: ReadableSchemaVersionSchema,
  engine: z.string(),
  rootUrl: z.string(),
  sourceExploration: z.string(),
  sourceExplorationRun: z.string(),

  stats: z.object({
    totalCases: z.number().int().nonnegative(),
    signatureGroups: z.number().int().nonnegative(),
    aiEligibleGroups: z.number().int().nonnegative(),
    aiConditionalGroups: z.number().int().nonnegative(),
    aiExcludedGroups: z.number().int().nonnegative(),
    aiEligibleCases: z.number().int().nonnegative(),
    /**
     * Representatives an enabled AI pass would analyze — one per eligible
     * signature group, never one per occurrence (item 112). This is the whole
     * cost-control argument, stated as a number.
     */
    estimatedAiCalls: z.number().int().nonnegative(),
    /** Non-zero counts, in {@link UNKNOWN_REASON_ORDER}. */
    reasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  }),

  /** Sorted by signature. */
  signatureGroups: z.array(UnknownGroupSchema),
  /** Sorted by case id. */
  cases: z.array(UnknownInteractionCaseSchema),
});
export type UnknownInteractionsArtifact = z.infer<
  typeof UnknownInteractionsArtifactSchema
>;

// ---------------------------------------------------------------------------
// Classification policy constants
// ---------------------------------------------------------------------------

/**
 * ARIA attributes that carry STATE (as opposed to identity or relationship).
 * The unknown signature and `already-in-target-state` are built only from these
 * — never from `aria-label`, whose value is human text.
 */
export const STATEFUL_ARIA_ATTRIBUTES: readonly string[] = [
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "aria-checked",
  "aria-haspopup",
];

/**
 * The state values that make a repeat click a no-op *by design* (item 30).
 *
 * `aria-expanded` is deliberately NOT here. A disclosure that is already open
 * should CLOSE when clicked again, so "expanded and nothing happened" is a real
 * unexplained result, not an idempotent one — folding it in here would hide a
 * genuine finding behind a reassuring label.
 */
export const IDEMPOTENT_ACTIVE_ARIA: readonly string[] = [
  "aria-selected",
  "aria-checked",
  "aria-pressed",
];

/** Same idea for native boolean properties. */
export const IDEMPOTENT_ACTIVE_STATE: readonly string[] = ["checked", "selected"];

/** Roles whose open region is a menu-family popup (item 18). */
export const MENU_TARGET_ROLES: readonly string[] = [
  "menu",
  "listbox",
  "tree",
  "grid",
];

/** Roles that make a region a dialog (item 19). */
export const DIALOG_TARGET_ROLES: readonly string[] = ["dialog", "alertdialog"];

/** Roles / input types that make a control a member of a selection set (item 21). */
export const SELECTION_ROLES: readonly string[] = [
  "radio",
  "checkbox",
  "option",
  "menuitemcheckbox",
  "menuitemradio",
];
export const SELECTION_INPUT_TYPES: readonly string[] = ["radio", "checkbox"];

/** Safety events that mean "the click's real effect never happened" (item 32). */
export const NAVIGATION_BLOCKING_EVENTS: readonly string[] = [
  "navigation-blocked",
];

/** Safety events that mean the document itself moved (items 24, 28). */
export const NAVIGATION_TAINT_EVENTS: readonly string[] = [
  "same-document-navigation",
];

/** Max characters of a label kept in an unknown case (never in a signature). */
export const LABEL_MAX_LEN = 80;
