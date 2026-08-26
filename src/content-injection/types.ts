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
  })
  .strict();
export type ContentIntent = z.infer<typeof ContentIntentSchema>;

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
    /** Compact operating instructions restated from the policy. */
    instructions: z.array(z.string()),
    allowedSources: z.array(z.string()),
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
