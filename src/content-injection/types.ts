import { z } from "zod";
import { SlotValueSchema, UrlKindSchema } from "../recon-template/types.js";

/**
 * Natural Language Content Injection — types (Task 19).
 *
 * This layer sits ON TOP of the Task 18 Recon Template and never modifies it:
 *
 *   Recon Template (Slot V2)   = the application substrate   (immutable input)
 *   Content Run                = one natural-language intent turned into a
 *                                validated slot-values overlay (THIS artifact)
 *
 * The pipeline the schemas below describe:
 *
 *   Natural Language Intent → Site Content Plan → Content Units → Slot Values
 *   → Recon Template + overlay → Injected Site → Layout Safety QA
 *
 * Two boundaries are structural, not conventional:
 *
 *  - The LLM never sees the raw slot inventory. A deterministic Content Unit
 *    Builder groups related slots (a CTA's label + href, a hero's headline +
 *    description) into bounded writing units, and the generation request
 *    carries only those units — never the SiteSpec, never all 9,529 slots.
 *  - The LLM's output is versioned JSON validated by a deterministic
 *    validator that is independent of any provider (including Claude Code
 *    acting as the manual provider in this MVP). Arbitrary HTML / JS / CSS /
 *    selectors are rejected; unknown slot keys fail the run instead of being
 *    silently ignored.
 */

// ---------------------------------------------------------------------------
// Versions & file names
// ---------------------------------------------------------------------------

/** Bumped when the shape of anything this Task persists changes. */
export const CONTENT_SCHEMA_VERSION = 1 as const;

/** The fixed system content policy, versioned as its own artifact. */
export const CONTENT_POLICY_ID = "content-policy-v1" as const;
export const CONTENT_POLICY_VERSION = 1 as const;

/** The provider-neutral generation contract version. */
export const CONTENT_GENERATOR_CONTRACT_VERSION = 1 as const;

export const CONTENT_ENGINE = "natural-language-content-injection" as const;

/** Fixed file / directory names inside a content-run directory. */
export const CONTENT_RUN_MANIFEST_FILE = "manifest.json";
export const INTENT_FILE = "intent.json";
export const CONTENT_POLICY_FILE = "content-policy.json";
export const TEMPLATE_SUMMARY_FILE = "template-summary.json";
export const CONTENT_UNITS_FILE = "content-units.json";
export const GENERATION_REQUEST_FILE = "generation-request.json";
export const GENERATION_SCHEMA_FILE = "generation-schema.json";
export const GENERATION_RESULT_FILE = "generation-result.json";
export const SLOT_VALUES_FILE = "slot-values.json";
export const CONTENT_REPORT_DIR = "report";
export const VALIDATION_REPORT_FILE = "validation.json";
export const BRAND_LEAK_REPORT_FILE = "brand-leak.json";
export const OPERATOR_REVIEW_MD_FILE = "operator-review.md";
export const OPERATOR_REVIEW_JSON_FILE = "operator-review.json";
export const LAYOUT_QA_REPORT_FILE = "layout-qa.json";
/** Task 27 §2 sibling: the total slot account. NEVER folded into slot-values.json. */
export const SLOT_ACCOUNTING_FILE = "slot-accounting.json";
/** Task 27: the RegionPlan layer, emitted beside the content units. */
export const REGION_PLAN_FILE = "region-plan.json";
/** Task 27 §1: proof that the batches were executed, one record per call. */
export const BATCH_EXECUTION_FILE = "batch-execution.json";
/** Task 27 §7: append-only, provider-neutral. NEVER carries estimated usage. */
export const TELEMETRY_FILE = "telemetry.jsonl";
/** Task 27 §6 (GED-D): why the bounded repair loop stopped, machine-readable. */
export const REPAIR_STOP_FILE = "repair-stop.json";
export const SCREENSHOTS_DIR = "screenshots";
export const REPAIR_DIR = "repair";

/** Deterministic id helper for content units. */
export function contentUnitId(n: number): string {
  return `cu${String(n).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Content policy (content-policy-v1)
// ---------------------------------------------------------------------------

export const ContentPolicyRuleSchema = z
  .object({
    id: z.string(),
    statement: z.string(),
  })
  .strict();

export const ContentPolicySchema = z
  .object({
    policyId: z.literal(CONTENT_POLICY_ID),
    policyVersion: z.literal(CONTENT_POLICY_VERSION),
    rules: z.array(ContentPolicyRuleSchema).min(1),
  })
  .strict();
export type ContentPolicy = z.infer<typeof ContentPolicySchema>;

// ---------------------------------------------------------------------------
// Content Intent — the user's words, kept apart from any interpretation
// ---------------------------------------------------------------------------

/**
 * A user-provided fact the generator MAY state as fact (company name, phone
 * number, address, a real customer, a real metric). Anything factual that is
 * NOT in this list must become `needs-input`, never invented.
 */
export const ProvidedFactSchema = z
  .object({
    kind: z.string(),
    value: z.string(),
  })
  .strict();
export type ProvidedFact = z.infer<typeof ProvidedFactSchema>;

// ---------------------------------------------------------------------------
// Content truth mode (Task 27 §4) — what the engine is allowed to state
// ---------------------------------------------------------------------------

/**
 * `no-invented-facts` read as "never invent any business-like detail" is right
 * for a real company's site and wrong for a fictional one, so the rule is now
 * an EXPLICIT MODE recorded on the run:
 *
 *   verified-only      a verifiable claim the user did not provide stays
 *                      UNRESOLVED. The engine refuses to state a fact it
 *                      cannot support. (Default — the conservative reading,
 *                      and the behaviour every Task 19 run already had.)
 *   synthetic-allowed  the engine MAY invent fictional detail, and every such
 *                      value carries SYNTHETIC provenance in the accounting
 *                      artifact. Nothing is ever invented silently.
 *
 * Generic marketing copy is NOT a factual claim and stays
 * `generated-marketing` in both modes; `derived-copy` (a value carried from
 * the source, e.g. an internal route) stays distinct from both. Keeping those
 * three separable is the whole point of the ORIGIN axis below.
 */
export const CONTENT_TRUTH_MODES = ["verified-only", "synthetic-allowed"] as const;
export const ContentTruthModeSchema = z.enum(CONTENT_TRUTH_MODES);
export type ContentTruthMode = z.infer<typeof ContentTruthModeSchema>;
export const DEFAULT_CONTENT_TRUTH_MODE = "verified-only" as const;

/** One engine decision the truth mode forced, recorded per slot. */
export const TruthModeDecisionSchema = z
  .object({
    slotKey: z.string(),
    /** Matched claim pattern id, or `declared-synthetic` when the generator said so. */
    claim: z.string(),
    decision: z.enum(["refused-unresolved", "marked-synthetic", "backed-by-user-fact"]),
    detail: z.string(),
  })
  .strict();
export type TruthModeDecision = z.infer<typeof TruthModeDecisionSchema>;

// ---------------------------------------------------------------------------
// Content brief (Task 27 §5) — ONE BRIEF → FIRST DRAFT
// ---------------------------------------------------------------------------

/**
 * EVERY FIELD IS OPTIONAL — this is a brief, NOT an intake form (the same rule
 * `src/release/checklist.ts` states for the release checklist). A missing
 * non-essential field is REPORTED in the packet, never a question the operator
 * has to answer before a first draft can be produced. The one thing a brief
 * must carry is what the site is for, and even that arrives as free text.
 */
export const ContentBriefSchema = z
  .object({
    /** Free text. When absent the caller's raw intent is the goal. */
    goal: z.string().optional(),
    workingName: z.string().optional(),
    category: z.string().optional(),
    audience: z.string().optional(),
    positioning: z.string().optional(),
    primaryConversion: z.string().optional(),
    tone: z.array(z.string()).optional(),
    routes: z.array(z.string()).optional(),
    includeReview: z.boolean().optional(),
    truthMode: ContentTruthModeSchema.optional(),
    facts: z.array(ProvidedFactSchema).optional(),
  })
  .strict();
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const ContentIntentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    /**
     * The user's natural-language request, verbatim and immutable. What the
     * user actually said is never merged with what a model inferred from it —
     * interpretation lives in the generated Site Content Plan.
     */
    rawIntent: z.string().min(1),
    requestedScope: z
      .object({
        routes: z.array(z.string()).min(1),
        /** Review-flagged slots are opt-in only; default conservative. */
        includeReview: z.boolean(),
      })
      .strict(),
    /** Operator-supplied structured preferences (optional, verbatim). */
    preferences: z.record(z.string(), z.string()),
    providedFacts: z.array(ProvidedFactSchema),
    /**
     * Task 27 §4. Optional so every Task 19-26 `intent.json` still parses.
     * Absent is read as DEFAULT_CONTENT_TRUTH_MODE — which is STRICTER than
     * what those runs actually had: Task 19's no-invented-facts rule bound
     * only the prompt, so re-ingesting one of their results can now withhold
     * a fact-shaped value it previously applied. See the decision record at
     * the head of `truth-mode.ts`.
     */
    truthMode: ContentTruthModeSchema.optional(),
    /** Task 27 §5: the operator's brief, verbatim, when one was supplied. */
    brief: ContentBriefSchema.optional(),
  })
  .strict();
export type ContentIntent = z.infer<typeof ContentIntentSchema>;

/**
 * Non-essential brief fields the packet noticed were absent. REPORTED, never
 * asked: a first draft is produced regardless. (§5 — one brief, one draft.)
 */
export const BriefGapSchema = z
  .object({ field: z.string(), consequence: z.string() })
  .strict();
export type BriefGap = z.infer<typeof BriefGapSchema>;

// ---------------------------------------------------------------------------
// Site / Page Content Plan — content strategy, NEVER layout strategy
// ---------------------------------------------------------------------------

export const PageContentPlanSchema = z
  .object({
    route: z.string(),
    currentPurpose: z.string(),
    newPurpose: z.string(),
    primaryMessage: z.string(),
    secondaryMessages: z.array(z.string()),
    conversionGoal: z.string(),
    contentStrategy: z.string(),
  })
  .strict();
export type PageContentPlan = z.infer<typeof PageContentPlanSchema>;

export const SiteContentPlanSchema = z
  .object({
    planVersion: z.literal(1),
    siteIdentity: z
      .object({
        workingName: z.string(),
        category: z.string(),
        audience: z.string(),
        positioning: z.string(),
      })
      .strict(),
    primaryConversion: z.string(),
    tone: z.array(z.string()),
    messages: z.array(z.string()),
    pagePlans: z.array(PageContentPlanSchema),
  })
  .strict();
export type SiteContentPlan = z.infer<typeof SiteContentPlanSchema>;

// ---------------------------------------------------------------------------
// Content Units — the deterministic LLM boundary
// ---------------------------------------------------------------------------

/**
 * Deliberately small unit vocabulary. Nothing forces a fine taxonomy: an
 * uncertain unit is `group` (multi-slot) or `content` (single text slot).
 */
export const ContentUnitKindSchema = z.enum([
  "navigation",
  "hero",
  "content",
  "cta",
  "image",
  "footer",
  "group",
]);
export type ContentUnitKind = z.infer<typeof ContentUnitKindSchema>;

/**
 * The bounded view of one slot inside a unit: exactly what a generator needs
 * (current content + observed constraints), nothing else. No nodeIds, no
 * bindings, no geometry beyond the recorded constraints.
 */
export const ContentUnitSlotSchema = z
  .object({
    key: z.string(),
    role: z.string(),
    type: z.enum(["text", "url", "image"]),
    editability: z.enum(["editable", "review"]),
    urlKind: UrlKindSchema.optional(),
    currentValue: SlotValueSchema,
    constraints: z.unknown().optional(),
  })
  .strict();
export type ContentUnitSlot = z.infer<typeof ContentUnitSlotSchema>;

export const ContentUnitSchema = z
  .object({
    unitId: z.string().regex(/^cu\d{6}$/),
    scope: z.enum(["global", "page"]),
    route: z.string().optional(),
    /** Section token from the slot key (header / nav / main / body / footer). */
    section: z.string(),
    kind: ContentUnitKindSchema,
    purpose: z.string(),
    slots: z.array(ContentUnitSlotSchema).min(1),
  })
  .strict();
export type ContentUnit = z.infer<typeof ContentUnitSchema>;

export const ContentUnitsFileSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    templateId: z.string(),
    units: z.array(ContentUnitSchema),
    /**
     * Review-flagged slot keys inside the requested scope. NEVER auto-written
     * (unless the intent opted in); listed so the operator sees what a human
     * pass would still have to decide.
     */
    reviewSlotKeys: z.array(z.string()),
  })
  .strict();
export type ContentUnitsFile = z.infer<typeof ContentUnitsFileSchema>;

// ---------------------------------------------------------------------------
// Generation request / result — the provider-neutral contract
// ---------------------------------------------------------------------------

/**
 * Prompt-budget structure: one request never carries the whole site. Batches
 * are deterministic — global units first (site-wide consistency), then each
 * route's units in bounded chunks.
 */
export const GenerationBatchSchema = z
  .object({
    batchId: z.string(),
    scope: z.enum(["global", "page"]),
    route: z.string().optional(),
    unitIds: z.array(z.string()).min(1),
  })
  .strict();
export type GenerationBatch = z.infer<typeof GenerationBatchSchema>;

export const GenerationRequestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    contractVersion: z.literal(CONTENT_GENERATOR_CONTRACT_VERSION),
    runId: z.string(),
    templateId: z.string(),
    policyId: z.literal(CONTENT_POLICY_ID),
    policyVersion: z.literal(CONTENT_POLICY_VERSION),
    /** The generator must produce a Site Content Plan BEFORE slot values. */
    steps: z.array(z.enum(["site-content-plan", "unit-values"])),
    batches: z.array(GenerationBatchSchema),
    /**
     * Task 27 §1: the bound each batch was cut at. Present so a consumer can
     * see the contract the batches were built under without re-deriving it.
     */
    batchUnitLimit: z.number().int().positive().optional(),
    /** Task 27 §4. Optional — absent means DEFAULT_CONTENT_TRUTH_MODE. */
    truthMode: ContentTruthModeSchema.optional(),
    /** Compact operating instructions restated from the policy. */
    instructions: z.array(z.string()),
    allowedSources: z.array(z.string()),
    /** Task 27 §5: what the brief did not say, and what it costs. Never a question. */
    briefGaps: z.array(BriefGapSchema).optional(),
  })
  .strict();
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

/**
 * Provenance of every generated value (§15). `needs-input` never appears in
 * `sources` — it lives in `unresolved` instead.
 */
export const SLOT_VALUE_SOURCES = [
  "user-provided",
  "derived-copy",
  "generated-marketing",
] as const;
export const SlotValueSourceSchema = z.enum(SLOT_VALUE_SOURCES);
export type SlotValueSource = z.infer<typeof SlotValueSourceSchema>;

export const UnresolvedSlotSchema = z
  .object({
    slotKey: z.string(),
    reason: z.string().min(1),
  })
  .strict();
export type UnresolvedSlot = z.infer<typeof UnresolvedSlotSchema>;

/**
 * Image handling (§19): no image generation engine in this Task. A brief
 * records what a replacement SHOULD be; an explicit replacement value (in
 * `slotValues`) is the only way an image actually changes.
 */
export const ImageBriefSchema = z
  .object({
    slotKey: z.string(),
    action: z.enum(["keep-default", "replace-recommended", "replaced"]),
    brief: z
      .object({
        subject: z.string(),
        mood: z.string(),
        aspectRatio: z.number().optional(),
        purpose: z.string(),
      })
      .strict()
      .optional(),
    /** Set when keeping the default risks misrepresenting the new company. */
    warning: z.string().optional(),
  })
  .strict();
export type ImageBrief = z.infer<typeof ImageBriefSchema>;

export const ContentGenerationResultSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    contractVersion: z.literal(CONTENT_GENERATOR_CONTRACT_VERSION),
    generator: z
      .object({
        name: z.string(),
        model: z.string().optional(),
      })
      .strict(),
    sitePlan: SiteContentPlanSchema,
    /** slot key → replacement value. Text/url slots: string. Image: object. */
    slotValues: z.record(z.string(), SlotValueSchema),
    /** slot key → provenance, REQUIRED for every entry in slotValues. */
    sources: z.record(z.string(), SlotValueSourceSchema),
    unresolved: z.array(UnresolvedSlotSchema),
    imageBriefs: z.array(ImageBriefSchema),
    /**
     * Task 27 §4: slot keys whose value is an INVENTED fictional detail. Under
     * `synthetic-allowed` these are kept and marked with synthetic provenance;
     * under `verified-only` they are refused and become `unresolved`. Optional
     * so every result written before Task 27 still parses.
     */
    synthetic: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict();
export type ContentGenerationResult = z.infer<typeof ContentGenerationResultSchema>;

// ---------------------------------------------------------------------------
// Validation report
// ---------------------------------------------------------------------------

export const ValidationIssueSchema = z
  .object({
    code: z.string(),
    slotKey: z.string().optional(),
    message: z.string(),
  })
  .strict();
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationReportSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    pass: z.boolean(),
    errors: z.array(ValidationIssueSchema),
    warnings: z.array(ValidationIssueSchema),
    stats: z
      .object({
        assignedSlots: z.number(),
        unresolvedSlots: z.number(),
        reviewSlotsSkipped: z.number(),
        imageBriefs: z.number(),
      })
      .strict(),
  })
  .strict();
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

// ---------------------------------------------------------------------------
// Source-brand leak report
// ---------------------------------------------------------------------------

/**
 * Marker an unresolved entry's `reason` must carry when a slot the user chose
 * to change stays at its source default because of an ENGINE limitation (not
 * missing user facts). Task 19.1 §13: such slots are reported at blocker
 * severity — after the twin/svg fixes there must be none in the canary's
 * hero / primary navigation / primary CTA regions.
 */
export const ENGINE_LIMITATION_MARKER = "engine-limitation";

export const BrandLeakWarningSchema = z
  .object({
    issue: z.literal("source-brand-leak"),
    slotKey: z.string(),
    kind: z.enum([
      "brand-token-in-value",
      "brand-token-in-untouched-default",
      "original-external-url-retained",
      "original-external-url-in-untouched-default",
      "blocked-visible-source-content",
    ]),
    /** Default "warning"; `blocked-visible-source-content` is a "blocker". */
    severity: z.enum(["warning", "blocker"]).optional(),
    detail: z.string(),
  })
  .strict();
export type BrandLeakWarning = z.infer<typeof BrandLeakWarningSchema>;

export const BrandLeakReportSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    brandTokens: z.array(z.string()),
    scannedSlots: z.number(),
    warnings: z.array(BrandLeakWarningSchema),
  })
  .strict();
export type BrandLeakReport = z.infer<typeof BrandLeakReportSchema>;

// ---------------------------------------------------------------------------
// Layout Safety QA
// ---------------------------------------------------------------------------

/**
 * The injected site's QA question is NOT "is it identical?" (the content
 * changed on purpose) but "did the new content break the layout?". Line-count
 * changes are diagnostic evidence; broken layout signals decide the verdict.
 */
export const SlotLayoutObservationSchema = z
  .object({
    slotKey: z.string(),
    route: z.string(),
    viewport: z.enum(["desktop", "mobile"]),
    width: z.number(),
    nodeId: z.string(),
    found: z.boolean(),
    referenceLineCount: z.number().optional(),
    defaultLineCount: z.number().optional(),
    injectedLineCount: z.number().optional(),
    clippedHorizontally: z.boolean(),
    clippedVertically: z.boolean(),
    overlapsFollowingSibling: z.boolean(),
    boxBefore: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    boxAfter: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    sectionBefore: z.object({ y: z.number(), h: z.number() }).optional(),
    sectionAfter: z.object({ y: z.number(), h: z.number() }).optional(),
    neighborDisplacement: z.number().optional(),
  })
  .strict();
export type SlotLayoutObservation = z.infer<typeof SlotLayoutObservationSchema>;

export const LayoutPageCheckSchema = z
  .object({
    route: z.string(),
    width: z.number(),
    viewport: z.enum(["desktop", "mobile"]),
    defaultDocHeight: z.number(),
    injectedDocHeight: z.number(),
    horizontalOverflowDefault: z.boolean(),
    horizontalOverflowInjected: z.boolean(),
    sectionCollisions: z.array(z.string()),
    injectedJsErrors: z.number(),
    injectedHydrationErrors: z.number(),
    pass: z.boolean(),
    notes: z.array(z.string()),
  })
  .strict();
export type LayoutPageCheck = z.infer<typeof LayoutPageCheckSchema>;

export const AppliedValueCheckSchema = z
  .object({
    slotKey: z.string(),
    bindingId: z.string(),
    surface: z.enum(["static", "dynamic-template", "paint-twin"]),
    route: z.string(),
    viewport: z.enum(["desktop", "mobile"]),
    applied: z.boolean(),
    detail: z.string(),
  })
  .strict();
export type AppliedValueCheck = z.infer<typeof AppliedValueCheckSchema>;

export const InteractionRegressionCheckSchema = z
  .object({
    route: z.string(),
    width: z.number(),
    patternId: z.string(),
    nodeId: z.string(),
    equivalent: z.boolean(),
    detail: z.string(),
  })
  .strict();
export type InteractionRegressionCheck = z.infer<typeof InteractionRegressionCheckSchema>;

export const RepairCandidateSchema = z
  .object({
    slotKey: z.string(),
    reason: z.string(),
    evidence: z.array(z.string()),
  })
  .strict();
export type RepairCandidate = z.infer<typeof RepairCandidateSchema>;

export const LayoutQaReportSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    runId: z.string(),
    templateId: z.string(),
    widths: z.array(z.number()),
    routes: z.array(z.string()),
    pages: z.array(LayoutPageCheckSchema),
    slotObservations: z.array(SlotLayoutObservationSchema),
    appliedChecks: z.array(AppliedValueCheckSchema),
    interactionChecks: z.array(InteractionRegressionCheckSchema),
    repairCandidates: z.array(RepairCandidateSchema),
    screenshots: z.array(z.string()),
    pass: z.boolean(),
  })
  .strict();
export type LayoutQaReport = z.infer<typeof LayoutQaReportSchema>;

// ---------------------------------------------------------------------------
// Repair loop (bounded)
// ---------------------------------------------------------------------------

export const MAX_REPAIR_ITERATIONS = 2 as const;

/**
 * A repair request carries ONLY the problem content and its evidence. The
 * generator may rewrite the sentence — never CSS, never layout, never other
 * slots.
 */
export const RepairItemSchema = z
  .object({
    slotKey: z.string(),
    currentValue: SlotValueSchema,
    constraints: z.unknown().optional(),
    observedLineCounts: z
      .array(
        z
          .object({
            viewport: z.string(),
            reference: z.number().optional(),
            actual: z.number().optional(),
          })
          .strict(),
      )
      .optional(),
    overflowEvidence: z.array(z.string()),
  })
  .strict();
export type RepairItem = z.infer<typeof RepairItemSchema>;

export const RepairRequestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    contractVersion: z.literal(CONTENT_GENERATOR_CONTRACT_VERSION),
    runId: z.string(),
    iteration: z.number().int().min(1).max(MAX_REPAIR_ITERATIONS),
    items: z.array(RepairItemSchema).min(1),
  })
  .strict();
export type RepairRequest = z.infer<typeof RepairRequestSchema>;

// ---------------------------------------------------------------------------
// Repair stop reasons (Task 27 §6, GED-D)
// ---------------------------------------------------------------------------

/**
 * Micro-slot repair does not converge: a slot whose source is <= 3 characters
 * meets `Math.max(4, target)` in `providers.ts` and the repaired value is
 * byte-identical every iteration, so the loop always burns
 * MAX_REPAIR_ITERATIONS to no effect. Reproduced on disk at
 * `data/domainchecker.co.kr/content-runs/2026-08-19T07-18-26-879Z/report/repair/`
 * and `data/nextjs.org/content-runs/2026-08-19T07-13-56-376Z/report/repair/`
 * (iteration 1 and 2 identical).
 *
 * This Task takes ONLY the no-progress guard; the provider length-awareness
 * half of GED-D is deliberately out of scope, so `fakeText` is untouched.
 */
export const REPAIR_STOP_REASONS = [
  "layout-qa-passed",
  "no-repair-candidates",
  "iteration-bound-reached",
  "repair-values-identical",
  "failure-signature-repeated",
  "no-candidate-keys-changed",
  "repair-validation-failed",
] as const;
export const RepairStopReasonSchema = z.enum(REPAIR_STOP_REASONS);
export type RepairStopReason = z.infer<typeof RepairStopReasonSchema>;

export const RepairStopSchema = z
  .object({
    reason: RepairStopReasonSchema,
    /** Iterations actually executed when the loop stopped. */
    iteration: z.number().int().min(0),
    /** Machine-readable evidence: which keys were still unchanged, etc. */
    detail: z.string(),
    unchangedSlotKeys: z.array(z.string()),
  })
  .strict();
export type RepairStop = z.infer<typeof RepairStopSchema>;

// ---------------------------------------------------------------------------
// Content run manifest — the audit trail
// ---------------------------------------------------------------------------

export const ContentRunManifestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    schemaName: z.literal("content-run-v1"),
    engine: z.literal(CONTENT_ENGINE),
    runId: z.string(),
    /** Derived from the run id — one clock, like every other artifact here. */
    createdAt: z.string(),
    templateId: z.string(),
    templateManifestFile: z.string(),
    policyId: z.literal(CONTENT_POLICY_ID),
    policyVersion: z.literal(CONTENT_POLICY_VERSION),
    /** SHA-256 of the raw intent string (the intent itself is in intent.json). */
    intentHash: z.string(),
    scopedRoutes: z.array(z.string()),
    includeReview: z.boolean(),
    generator: z
      .object({ name: z.string(), model: z.string().optional() })
      .strict()
      .optional(),
    /** Set true by content:validate when slot-values diverge from the
     *  generator's result — the operator edited by hand (§29). */
    manualEdits: z.boolean(),
    repairIterations: z.number(),
    /** Task 27 §4 — absent on every run prepared before Task 27. */
    truthMode: ContentTruthModeSchema.optional(),
    /** Task 27 §6 (GED-D) — why the repair loop stopped. */
    repairStop: RepairStopSchema.optional(),
    /** Task 27 §1 — one summary line per executed batch run. */
    batching: z
      .object({
        executed: z.boolean(),
        batches: z.number(),
        calls: z.number(),
        conflicts: z.number(),
        batchUnitLimit: z.number(),
      })
      .strict()
      .optional(),
    /** Task 27 §2 — the sibling accounting artifact's headline numbers. */
    slotAccounting: z
      .object({
        file: z.string(),
        inScopeSlots: z.number(),
        reconciled: z.boolean(),
        ambiguousSlots: z.number(),
      })
      .strict()
      .optional(),
    counts: z
      .object({
        units: z.number(),
        editableSlots: z.number(),
        reviewSlotsListed: z.number(),
        generatedSlots: z.number(),
        unresolvedSlots: z.number(),
        imageBriefs: z.number(),
      })
      .strict(),
    validation: z
      .object({ pass: z.boolean(), errors: z.number(), warnings: z.number() })
      .strict()
      .optional(),
    brandLeakWarnings: z.number().optional(),
    layoutQa: z
      .object({ pass: z.boolean(), pages: z.number(), repairCandidates: z.number() })
      .strict()
      .optional(),
    provenance: z.literal("derived"),
  })
  .strict();
export type ContentRunManifest = z.infer<typeof ContentRunManifestSchema>;

// ---------------------------------------------------------------------------
// Region plan (Task 27) — the missing layer between a page plan and a unit
// ---------------------------------------------------------------------------

/**
 * Brief → SiteContentPlan → PageContentPlan → RegionPlan → ContentUnit →
 * SlotValues. Everything but RegionPlan already existed; this is the one
 * genuinely missing layer, and it is a GROUPING of existing content units,
 * never a second unit vocabulary.
 *
 * The region identity comes from the Wave-1 PageRegion compiler, consumed
 * through the SMALL STABLE CONTRACT below (`RegionContract`) — regionId, the
 * slot keys the region owns, and its route/page ownership. Nothing in
 * `src/regions/` is imported and no PageRegion internal is depended on, so a
 * policy change over there moves ids and nothing else here.
 */
export const RegionContractSchema = z
  .object({
    regionId: z.string(),
    scope: z.enum(["global", "page"]),
    slotKeys: z.array(z.string()),
    routes: z.array(z.string()),
    pageSourceIds: z.array(z.string()),
  })
  .strict();
export type RegionContract = z.infer<typeof RegionContractSchema>;

export const RegionPlanSchema = z
  .object({
    regionId: z.string(),
    scope: z.enum(["global", "page"]),
    /** Every scoped route this region appears on, in packet order. */
    routes: z.array(z.string()),
    /** Content units whose slots this region owns, in unit order. */
    unitIds: z.array(z.string()),
    /** In-scope slot keys the region owns, in packet order. */
    slotKeys: z.array(z.string()),
    /** Unit kinds present, deduplicated — structural evidence, not semantics. */
    unitKinds: z.array(ContentUnitKindSchema),
    /** Derived from the unit kinds present. No AI, no similarity score. */
    purpose: z.string(),
  })
  .strict();
export type RegionPlan = z.infer<typeof RegionPlanSchema>;

export const RegionPlanFileSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    schemaName: z.literal("content-region-plan-v1"),
    runId: z.string(),
    templateId: z.string(),
    /** Where the region contract came from, verbatim, for audit. */
    contractSource: z
      .object({
        kind: z.enum(["page-regions-artifact", "absent"]),
        file: z.string().optional(),
        regionsRead: z.number(),
      })
      .strict(),
    plans: z.array(RegionPlanSchema),
    /**
     * Units no region claimed. Honest by construction: PageRegion granularity
     * follows the markup and a template with no sectioning markup produces few
     * regions, so this is expected to be non-empty rather than a defect.
     */
    unassignedUnitIds: z.array(z.string()),
    provenance: z.literal("derived"),
  })
  .strict();
export type RegionPlanFile = z.infer<typeof RegionPlanFileSchema>;

// ---------------------------------------------------------------------------
// Batch execution (Task 27 §1) — the batches are now actually EXECUTED
// ---------------------------------------------------------------------------

/**
 * `buildBatches()` has always produced correctly shaped batches; until this
 * Task nothing ran them — `src/cli-content-generate.ts` passed the whole unit
 * set in ONE call, which contradicted `GenerationRequestSchema`'s own comment
 * ("one request never carries the whole site"). These records are the proof
 * that a run actually issued one call per batch.
 */
export const BatchCallRecordSchema = z
  .object({
    callIndex: z.number().int().nonnegative(),
    batchId: z.string(),
    scope: z.enum(["global", "page"]),
    route: z.string().optional(),
    unitCount: z.number().int().nonnegative(),
    slotCount: z.number().int().nonnegative(),
    assignedKeys: z.number().int().nonnegative(),
    unresolvedKeys: z.number().int().nonnegative(),
    imageBriefs: z.number().int().nonnegative(),
    outcome: z.enum(["ok", "error"]),
    error: z.string().optional(),
  })
  .strict();
export type BatchCallRecord = z.infer<typeof BatchCallRecordSchema>;

/**
 * A key two batches both produced. NEVER resolved by last-write-wins: the
 * first writer's value is kept so the merge stays deterministic, the conflict
 * is recorded here, and the caller fails the run on it.
 */
export const BatchKeyConflictSchema = z
  .object({
    kind: z.enum([
      "duplicate-slot-value",
      "duplicate-unresolved",
      "duplicate-image-brief",
      "assigned-and-unresolved-across-batches",
      "out-of-batch-key",
    ]),
    slotKey: z.string(),
    batchIds: z.array(z.string()),
    /** True when both batches produced the same value — still a conflict. */
    identical: z.boolean(),
    detail: z.string(),
  })
  .strict();
export type BatchKeyConflict = z.infer<typeof BatchKeyConflictSchema>;

export const BatchExecutionReportSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    schemaName: z.literal("content-batch-execution-v1"),
    runId: z.string(),
    executed: z.boolean(),
    batchUnitLimit: z.number().int().positive(),
    orderingRule: z.string(),
    calls: z.array(BatchCallRecordSchema),
    conflicts: z.array(BatchKeyConflictSchema),
    /** The batch whose site content plan was kept (the first one to send one). */
    sitePlanFromBatchId: z.string().optional(),
    mergedSlotValues: z.number().int().nonnegative(),
    mergedUnresolved: z.number().int().nonnegative(),
    provenance: z.literal("derived"),
  })
  .strict();
export type BatchExecutionReport = z.infer<typeof BatchExecutionReportSchema>;

// ---------------------------------------------------------------------------
// Slot accounting (Task 27 §2/§3) — two ORTHOGONAL axes, never one enum
// ---------------------------------------------------------------------------

/**
 * ORIGIN answers "where did the value that renders here come from?".
 * DISPOSITION answers "what happened to this slot in this run?".
 *
 * They are deliberately separate fields: a value can be
 * `generated-marketing` + `applied`, `generated-marketing` + `preserved`
 * (written identical to the default), or `source-preserved` + `unresolved`.
 * One mixed enum cannot express that without losing information, which is why
 * `sources` (origin only) and `unresolved` (disposition only) never lined up.
 *
 * `human-required` is NOT called "reviewed": `editability="review"` already
 * exists on every slot and means something else entirely (the compiler was not
 * confident the slot is safe to auto-write). Nothing here claims a human
 * approved anything — the engine has no approval signal to record.
 */
export const SLOT_ORIGINS = [
  "user-provided",
  "derived-copy",
  "generated-marketing",
  "synthetic-fact",
  "source-preserved",
] as const;
export const SlotOriginSchema = z.enum(SLOT_ORIGINS);
export type SlotOrigin = z.infer<typeof SlotOriginSchema>;

export const SLOT_DISPOSITIONS = [
  "applied",
  "preserved",
  "removed",
  "human-required",
  "unresolved",
] as const;
export const SlotDispositionSchema = z.enum(SLOT_DISPOSITIONS);
export type SlotDisposition = z.infer<typeof SlotDispositionSchema>;

export const SlotAccountingEntrySchema = z
  .object({
    slotKey: z.string(),
    scope: z.enum(["global", "page"]),
    route: z.string().optional(),
    type: z.enum(["text", "url", "image"]),
    editability: z.enum(["editable", "review"]),
    /** EXACTLY ONE origin. */
    origin: SlotOriginSchema,
    /** EXACTLY ONE disposition. */
    disposition: SlotDispositionSchema,
    /**
     * §3 honesty: `confirmed` only where the template compiler was confident
     * the slot is customer-facing (`editability="editable"`). A `review` slot
     * is `ambiguous` and is counted in its own bucket, never folded into a
     * success number.
     */
    customerFacing: z.enum(["confirmed", "ambiguous"]),
    detail: z.string(),
  })
  .strict();
export type SlotAccountingEntry = z.infer<typeof SlotAccountingEntrySchema>;

export const SlotAccountingFileSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    schemaName: z.literal("content-slot-accounting-v1"),
    runId: z.string(),
    templateId: z.string(),
    truthMode: ContentTruthModeSchema,
    scopedRoutes: z.array(z.string()),
    /** The closed vocabularies, restated in the artifact so a reader sees them. */
    originValues: z.array(SlotOriginSchema),
    dispositionValues: z.array(SlotDispositionSchema),
    entries: z.array(SlotAccountingEntrySchema),
    totals: z
      .object({
        inScopeSlots: z.number(),
        byOrigin: z.record(z.string(), z.number()),
        byDisposition: z.record(z.string(), z.number()),
      })
      .strict(),
    /**
     * The reconciliation is PROVEN in the artifact, not asserted in prose:
     * every in-scope slot appears exactly once, and both axis totals equal the
     * in-scope count.
     */
    reconciliation: z
      .object({
        inScopeSlots: z.number(),
        uniqueSlotKeys: z.number(),
        originTotal: z.number(),
        dispositionTotal: z.number(),
        missing: z.array(z.string()),
        doubleCounted: z.array(z.string()),
        reconciled: z.boolean(),
      })
      .strict(),
    scopeHonesty: z
      .object({
        editableSlots: z.number(),
        reviewSlots: z.number(),
        ambiguousSlots: z.number(),
        /** Candidates the template compiler's exclusions suppressed entirely. */
        templateExcludedCandidates: z.number(),
        note: z.string(),
      })
      .strict(),
    truthDecisions: z.array(TruthModeDecisionSchema),
    provenance: z.literal("derived"),
  })
  .strict();
export type SlotAccountingFile = z.infer<typeof SlotAccountingFileSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Bad input (missing file, version mismatch, broken lineage). */
export class ContentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentInputError";
  }
}

/** The generation result failed deterministic validation. */
export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}
