import { z } from "zod";
import { ViewportProfileSchema } from "../../observer/types.js";
import { SafetyEventTypeSchema } from "../../interaction-explorer/types.js";
import {
  MutationCategorySchema,
  PatternTypeSchema,
  StateSummarySchema,
  UnknownReasonSchema,
} from "../types.js";

/**
 * AI fallback contract (Task 12, items 49–56, 114).
 *
 * Read the shape of this file as a boundary, not as a feature. Three sentences
 * define everything it is allowed to be:
 *
 *   1. AI receives a COMPACT EVIDENCE SUMMARY, never the page (item 52).
 *   2. AI returns STRUCTURED ANALYSIS, never an action (item 51).
 *   3. AI output is `inferred` and lives in its own artifact. It never becomes a
 *      confirmed pattern and never edits the deterministic registry (items 56,
 *      58).
 *
 * The interface is provider-neutral on purpose. Task 12 ships a fake analyzer
 * and no vendor SDK: a boundary is worth building now, and a lock-in is not
 * (item 54). If this project later gains a real provider, it implements
 * {@link UnknownInteractionAnalyzer} and nothing else in the pipeline moves.
 *
 * `suggestedNextProbe` is a CLOSED ENUM (item 114) for the same reason the
 * safety guards exist in Task 11: a model must not be able to hand this engine
 * an arbitrary instruction. It cannot propose JavaScript, a selector, a URL, or
 * a shell command, because there is nowhere in the schema to put one. And
 * nothing executes the suggestion — Task 12 opens no browser (item 115).
 */

/** Bumped when the AI artifact shape changes. */
export const AI_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Input (item 52)
// ---------------------------------------------------------------------------

/**
 * The ONLY thing an analyzer is given about one unknown case.
 *
 * Every field is a small named fact that already exists in a Task 11 artifact.
 * There is deliberately no field for `outerHTML`, `rendered.html`, `dom.json`,
 * `styles.json`, cookies, storage, request bodies or credentials — the schema
 * itself is the data-minimization control, so a careless caller cannot add them
 * without changing this file (item 97 checks the serialized payload too).
 */
export const AiInteractionCaseSchema = z.object({
  caseId: z.string(),
  reason: UnknownReasonSchema,

  /** Page PATH only — never the full URL with its query string. */
  pagePath: z.string(),
  viewport: ViewportProfileSchema.shape.id,

  candidate: z.object({
    tagName: z.string(),
    role: z.string().optional(),
    inputType: z.string().optional(),
    /** Short accessible label or direct text. Never markup. */
    label: z.string().optional(),
    capabilities: z.array(z.string()),
  }),

  beforeState: StateSummarySchema,
  afterState: StateSummarySchema.optional(),

  diffCategories: z.array(z.string()),

  /** Compact description of a declared region, when the trigger had one. */
  target: z
    .object({
      relation: z.string(),
      existedBefore: z.boolean(),
      existsAfter: z.boolean(),
      role: z.string().optional(),
      tagName: z.string().optional(),
      visibleAfter: z.boolean().optional(),
      interactiveDescendantsAfter: z.number().int().nonnegative().optional(),
      /** Roles seen inside the region — a census, never the nodes. */
      descendantRoles: z.array(z.string()),
    })
    .optional(),

  mutation: z.object({
    categories: z.array(MutationCategorySchema),
    recordCount: z.number().int().nonnegative(),
    addedNodeCount: z.number().int().nonnegative(),
    removedNodeCount: z.number().int().nonnegative(),
  }),

  safetyEvents: z.array(SafetyEventTypeSchema),

  /** Which deterministic rules got partway, and what they were missing. */
  partialPatternHints: z.array(
    z.object({
      ruleId: z.string(),
      patternType: PatternTypeSchema,
      missingEvidence: z.array(z.string()),
    }),
  ),

  /** How many occurrences this one representative case stands for (item 47). */
  occurrenceCount: z.number().int().positive(),
});
export type AiInteractionCase = z.infer<typeof AiInteractionCaseSchema>;

// ---------------------------------------------------------------------------
// Output (item 50)
// ---------------------------------------------------------------------------

/**
 * Confidence is a WORD, not a number (item 12).
 *
 * `0.82` invites a threshold, a threshold invites per-site tuning, and per-site
 * tuning is how a deterministic engine quietly becomes a heuristic one. Three
 * named levels cannot be tuned, and none of them promotes anything.
 */
export const AiConfidenceSchema = z.enum(["low", "medium", "high"]);
export type AiConfidence = z.infer<typeof AiConfidenceSchema>;

/**
 * The closed set of follow-up probes a model may suggest (item 114).
 *
 * Not executed by this Task under any circumstance (item 115). It is a
 * recommendation for a future exploration run, recorded so the reasoning is not
 * lost.
 */
export const AiNextProbeSchema = z.enum([
  "hover",
  "focus",
  "click-newly-mounted-child",
  "observe-style-state",
  "inspect-shadow-root",
  "inspect-frame",
  "no-further-probe",
]);
export type AiNextProbe = z.infer<typeof AiNextProbeSchema>;

export const AiAnalysisStatusSchema = z.enum(["analyzed", "unavailable", "error"]);
export type AiAnalysisStatus = z.infer<typeof AiAnalysisStatusSchema>;

export const AiInteractionAnalysisSchema = z.object({
  caseId: z.string(),
  status: AiAnalysisStatusSchema,

  /**
   * The model's guess at a behavior name. FREE TEXT on purpose: it is not
   * validated against {@link PatternTypeSchema} because a model must be able to
   * say "carousel" — a word this registry does not know — without that value
   * being mistakable for a registry pattern type (item 98).
   */
  proposedPattern: z
    .object({
      type: z.string(),
      subtype: z.string().optional(),
      confidence: AiConfidenceSchema,
    })
    .optional(),

  rationale: z.string().optional(),
  /** Which of the supplied evidence fields the model says it used. */
  evidenceUsed: z.array(z.string()),
  uncertainty: z.array(z.string()),

  suggestedNextProbe: z
    .object({
      actionType: AiNextProbeSchema,
      /** A short structural hint (`the mounted region`), never a selector. */
      targetHint: z.string().optional(),
      expectedObservation: z.string().optional(),
    })
    .optional(),

  /**
   * A rule the model thinks could be written. Deliberately inert: it is a
   * suggestion for a HUMAN to run through the promotion policy (item 57), and
   * nothing in this codebase reads it back.
   */
  reusableRuleProposal: z
    .object({
      description: z.string(),
      requiredEvidence: z.array(z.string()),
    })
    .optional(),

  /** Always `inferred`. This is the only place that value appears (item 10). */
  provenance: z.literal("inferred"),

  /** Present when `status !== "analyzed"`. */
  error: z.string().optional(),
});
export type AiInteractionAnalysis = z.infer<typeof AiInteractionAnalysisSchema>;

// ---------------------------------------------------------------------------
// Provider interface (item 53)
// ---------------------------------------------------------------------------

/**
 * The whole provider surface: one batch call in, structured analyses out.
 *
 * Batch rather than per-case because the cost control lives one level up — the
 * caller has already collapsed N occurrences into one representative per
 * signature (item 47), and handing the provider the whole list lets it decide
 * whether that is one request or many. There is no queue, no retry engine and no
 * scheduler here (item 113); a provider that needs those can build them behind
 * this method.
 */
export interface UnknownInteractionAnalyzer {
  /** Stable identifier recorded in the artifact (`fake`, `anthropic`, …). */
  readonly name: string;
  analyze(cases: readonly AiInteractionCase[]): Promise<AiInteractionAnalysis[]>;
}

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------

/**
 * `ai-analysis.json` — written ONLY when an AI pass actually ran (item 62).
 *
 * It is a sibling of the deterministic artifacts, never merged into them. A
 * reader can delete this file and lose nothing that the pattern registry claims.
 */
export const AiAnalysisArtifactSchema = z.object({
  schemaVersion: z.literal(AI_SCHEMA_VERSION),
  provider: z.string(),
  rootUrl: z.string(),
  sourceUnknownInteractions: z.string(),

  /** One representative per eligible signature group — never per occurrence. */
  analyzedCaseCount: z.number().int().nonnegative(),
  /** Occurrences those representatives stand for (the saving, as a number). */
  representedCaseCount: z.number().int().nonnegative(),

  /** Sorted by `caseId`. */
  analyses: z.array(AiInteractionAnalysisSchema),

  /**
   * Restated in the artifact so it survives being read on its own, months
   * later, by someone who never saw this module.
   */
  promotionPolicy: z.literal(
    "AI output is inferred. It never becomes a confirmed pattern instance and never edits the deterministic registry. Promotion requires repeated cases, a defined observable evidence rule, a synthetic fixture, a negative fixture, a live canary, and a false-positive review.",
  ),
});
export type AiAnalysisArtifact = z.infer<typeof AiAnalysisArtifactSchema>;

/** The exact string above, exported so callers cannot drift from the schema. */
export const AI_PROMOTION_POLICY: AiAnalysisArtifact["promotionPolicy"] =
  "AI output is inferred. It never becomes a confirmed pattern instance and never edits the deterministic registry. Promotion requires repeated cases, a defined observable evidence rule, a synthetic fixture, a negative fixture, a live canary, and a false-positive review.";
