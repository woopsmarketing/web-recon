/**
 * Release Orchestrator (Task 25) — versioned models.
 *
 *   release-project-v1        one operator-facing release project: accepted
 *                             lineage (id/path/hash), stage freshness, applied
 *                             resolutions, requirements pointer, releaseState
 *   production-resolution-v1  the operator's input pack — every field optional;
 *                             values are added only when a requirement asks
 *   release-requirements-v1   normalized requirements COLLECTED from existing
 *                             subsystem artifacts (never re-detected here)
 *   release-run-v1            audit record of one prepare/resolve/build run
 *
 * The release layer is a conductor over Task 18-23 artifacts: it never
 * re-implements a detector and never mutates a lineage run directory.
 */
import { z } from "zod";

export const RELEASE_SCHEMA_VERSION = 1;
export const RELEASE_PROJECT_SCHEMA_NAME = "release-project-v1";
export const PRODUCTION_RESOLUTION_SCHEMA_NAME = "production-resolution-v1";
export const RELEASE_REQUIREMENTS_SCHEMA_NAME = "release-requirements-v1";
export const RELEASE_RUN_SCHEMA_NAME = "release-run-v1";

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** The release-level stage vocabulary. `reconstruction` stands for the whole
 *  frozen upstream (discovery → observation → sitespec → exact clone). */
export const RELEASE_STAGES = [
  "reconstruction",
  "template",
  "content",
  "theme",
  "seo",
  "assets",
  "production",
] as const;
export const ReleaseStageSchema = z.enum(RELEASE_STAGES);
export type ReleaseStage = z.infer<typeof ReleaseStageSchema>;

/** Stages a release build may execute. Reconstruction and template are frozen
 *  roots: unless the SOURCE site changes (out of release scope) they are never
 *  re-run — spec §12/§26. */
export const EXECUTABLE_STAGES: readonly ReleaseStage[] = [
  "content",
  "theme",
  "seo",
  "assets",
  "production",
];
export const FROZEN_STAGES: readonly ReleaseStage[] = ["reconstruction", "template"];

// ---------------------------------------------------------------------------
// Release state — a closed enum, never a single boolean (spec §5)
// ---------------------------------------------------------------------------

export const RELEASE_STATES = [
  "DISCOVERED",
  "RECONSTRUCTED",
  "TEMPLATED",
  "CONTENT_READY",
  "THEME_READY",
  "SEO_PREVIEW_READY",
  "ASSET_PREVIEW_READY",
  "PRODUCTION_PREVIEW_READY",
  "PRODUCTION_INPUTS_REQUIRED",
  "PRODUCTION_READY",
] as const;
export const ReleaseStateSchema = z.enum(RELEASE_STATES);
export type ReleaseState = z.infer<typeof ReleaseStateSchema>;

// ---------------------------------------------------------------------------
// Requirement model (spec §6, §7, §22)
// ---------------------------------------------------------------------------

export const REQUIREMENT_KINDS = [
  "production-domain",
  "business-fact",
  "external-url",
  "replacement-image",
  "organization-logo",
  "og-image",
  "font-license",
  "content-route",
  "source-brand-asset",
  "social-handle",
  "seo-fact",
] as const;
export const RequirementKindSchema = z.enum(REQUIREMENT_KINDS);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

/** Priority per spec §22 — a closed vocabulary, never an arbitrary score. */
export const REQUIREMENT_SEVERITIES = ["release-blocking", "high-value", "optional"] as const;
export const RequirementSeveritySchema = z.enum(REQUIREMENT_SEVERITIES);
export type RequirementSeverity = z.infer<typeof RequirementSeveritySchema>;

export const REQUIREMENT_STATUSES = [
  "unresolved",
  "resolved",
  "accepted-limitation",
  "not-applicable",
] as const;
export const RequirementStatusSchema = z.enum(REQUIREMENT_STATUSES);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const RequirementEvidenceSchema = z
  .object({
    /** Repo-relative artifact file the claim was READ from. */
    file: z.string(),
    /** JSON-pointer-ish location inside the file (human-readable). */
    pointer: z.string().optional(),
    detail: z.string().optional(),
  })
  .strict();
export type RequirementEvidence = z.infer<typeof RequirementEvidenceSchema>;

export const RequirementSchema = z
  .object({
    requirementId: z.string().min(1),
    kind: RequirementKindSchema,
    severity: RequirementSeveritySchema,
    status: RequirementStatusSchema,
    sourceStage: ReleaseStageSchema,
    route: z.string().optional(),
    slotKey: z.string().optional(),
    assetId: z.string().optional(),
    fontId: z.string().optional(),
    factKey: z.string().optional(),
    message: z.string().min(1),
    /** How an operator can resolve this (resolution-pack fields, decisions). */
    resolutionOptions: z.array(z.string()),
    evidence: z.array(RequirementEvidenceSchema).min(1),
    /** Traceability (spec §11): which applied resolution resolved this. */
    resolvedBy: z
      .object({ resolutionId: z.string(), field: z.string() })
      .strict()
      .optional(),
    /** Artifact-derived count backing the message (never hardcoded). */
    count: z.number().int().nonnegative().optional(),
    statusNote: z.string().optional(),
  })
  .strict();
export type Requirement = z.infer<typeof RequirementSchema>;

export const RequirementsFileSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(RELEASE_REQUIREMENTS_SCHEMA_NAME),
    projectId: z.string(),
    generatedAt: z.string(),
    counts: z
      .object({
        total: z.number().int().nonnegative(),
        unresolved: z.number().int().nonnegative(),
        resolved: z.number().int().nonnegative(),
        acceptedLimitation: z.number().int().nonnegative(),
        notApplicable: z.number().int().nonnegative(),
        releaseBlockingUnresolved: z.number().int().nonnegative(),
        highValueUnresolved: z.number().int().nonnegative(),
        optionalUnresolved: z.number().int().nonnegative(),
      })
      .strict(),
    requirements: z.array(RequirementSchema),
  })
  .strict();
export type RequirementsFile = z.infer<typeof RequirementsFileSchema>;

// ---------------------------------------------------------------------------
// Resolution pack — production-resolution-v1 (spec §9)
// ---------------------------------------------------------------------------

export const ResolutionAssetSchema = z.union([
  z.string().min(1),
  z.object({ file: z.string().min(1), note: z.string().optional() }).strict(),
]);
export type ResolutionAsset = z.infer<typeof ResolutionAssetSchema>;

export const FONT_DECISIONS = ["use-fallback-stack", "self-host-license-verified"] as const;
export const FontDecisionSchema = z
  .object({
    decision: z.enum(FONT_DECISIONS),
    license: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type FontDecision = z.infer<typeof FontDecisionSchema>;

export const RouteContentSchema = z
  .object({
    /** slot key → replacement value (string for text/url slots). */
    slotValues: z.record(z.string(), z.unknown()).optional(),
    /** Optional full/partial page plan for the route (SEO title/description
     *  derive from primaryMessage — see seo production-plan). */
    pagePlan: z
      .object({
        currentPurpose: z.string().optional(),
        newPurpose: z.string().optional(),
        primaryMessage: z.string().optional(),
        secondaryMessages: z.array(z.string()).optional(),
        conversionGoal: z.string().optional(),
        contentStrategy: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type RouteContent = z.infer<typeof RouteContentSchema>;

/** Every field optional — this is NOT an intake form (spec §3, §9). */
export const ProductionResolutionSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(PRODUCTION_RESOLUTION_SCHEMA_NAME),
    /** Free natural-language context; never machine-required. */
    notes: z.string().optional(),
    /** Production domain — bare domain or https URL; normalized to a host. */
    productionBaseUrl: z.string().min(1).optional(),
    /** Business facts. Canonical keys feed the SEO plan; `twitterSite` is a
     *  recorded social-handle decision (SEO consumption is a named seam). */
    facts: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    /** slot key → external/internal URL value. */
    urls: z.record(z.string(), z.string()).optional(),
    /** assetId (inventory id, or the site-level ids `og-image` /
     *  `organization-logo`) → local replacement file. */
    assets: z.record(z.string(), ResolutionAssetSchema).optional(),
    /** font family (font-inventory `license[].family`) → decision. */
    fontDecisions: z.record(z.string(), FontDecisionSchema).optional(),
    /** template route (or `global`) → provided content. */
    routeContent: z.record(z.string(), RouteContentSchema).optional(),
    /** Explicit operator acknowledgements → accepted-limitation. An
     *  acknowledgement never unlocks indexable production (spec §7). */
    acknowledgements: z
      .array(z.object({ requirementId: z.string(), note: z.string() }).strict())
      .optional(),
  })
  .strict();
export type ProductionResolution = z.infer<typeof ProductionResolutionSchema>;

// ---------------------------------------------------------------------------
// Lineage + stage status
// ---------------------------------------------------------------------------

export const ArtifactRefSchema = z
  .object({
    /** Subsystem id (run id / template id). */
    id: z.string(),
    /** Repo-relative directory of the artifact run. */
    path: z.string(),
    /** dir-sha256-v1 over the artifact files. */
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    fileCount: z.number().int().nonnegative().optional(),
    byteCount: z.number().int().nonnegative().optional(),
    excluded: z.array(z.string()).optional(),
  })
  .strict();
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const STAGE_FRESHNESS = ["fresh", "stale", "blocked"] as const;
export const StageStatusSchema = z
  .object({
    status: z.enum(STAGE_FRESHNESS),
    /** Current artifact for the stage (starts as the accepted lineage). */
    artifact: ArtifactRefSchema.nullable(),
    /** Hash of the stage's inputs when the artifact was produced/adopted. */
    inputsHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    reasons: z.array(z.string()),
    /** Requirement ids blocking this stage (target-mode aware). */
    blockedBy: z.array(z.string()),
  })
  .strict();
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const AppliedResolutionSchema = z
  .object({
    resolutionId: z.string(),
    appliedAt: z.string(),
    /** Repo-relative copy of the pack inside the project run dir. */
    file: z.string(),
    resolutionHash: z.string().regex(/^[0-9a-f]{64}$/),
    resolution: ProductionResolutionSchema,
    matched: z.array(z.object({ requirementId: z.string(), field: z.string() }).strict()),
    unmatchedFields: z.array(z.string()),
  })
  .strict();
export type AppliedResolution = z.infer<typeof AppliedResolutionSchema>;

export const TechnicalDebtEntrySchema = z
  .object({
    id: z.string(),
    description: z.string(),
    decision: z.string(),
    severity: z.string().optional(),
    /** Artifact file the entry was read from (never invented here). */
    source: z.string(),
    affects: z
      .object({
        requirementKinds: z.array(RequirementKindSchema),
        stages: z.array(ReleaseStageSchema),
      })
      .strict(),
  })
  .strict();
export type TechnicalDebtEntry = z.infer<typeof TechnicalDebtEntrySchema>;

export const ReleaseFailureSchema = z
  .object({
    lastSuccessfulStage: ReleaseStageSchema.nullable(),
    failedStage: ReleaseStageSchema,
    /** Repo-relative failure record (runs/<id>/failure.json). */
    failureArtifact: z.string(),
    retryable: z.boolean(),
    message: z.string(),
    at: z.string(),
  })
  .strict();
export type ReleaseFailure = z.infer<typeof ReleaseFailureSchema>;

export const ReleaseProjectSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(RELEASE_PROJECT_SCHEMA_NAME),
    projectId: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
    source: z
      .object({
        host: z.string(),
        rootUrl: z.string().nullable(),
      })
      .strict(),
    /** The accepted production candidate — immutable record (spec §4). */
    acceptedLineage: z
      .object({
        reconstruction: ArtifactRefSchema,
        template: ArtifactRefSchema,
        content: ArtifactRefSchema,
        theme: ArtifactRefSchema,
        seo: ArtifactRefSchema,
        assets: ArtifactRefSchema,
        production: z
          .object({ spec: ArtifactRefSchema, build: ArtifactRefSchema })
          .strict(),
      })
      .strict(),
    /** Frozen auxiliary inputs reruns need (read-only references). */
    auxiliary: z
      .object({
        seoSourceSnapshotDir: z.string(),
        assetInventoryDir: z.string(),
        siteSpecDir: z.string().nullable(),
      })
      .strict(),
    intent: z
      .object({
        rawIntent: z.string().nullable(),
        intentHash: z.string().nullable(),
      })
      .strict(),
    target: z
      .object({
        mode: z.enum(["preview", "indexable-production"]),
        productionBaseUrl: z.string().nullable(),
      })
      .strict(),
    stageStatus: z.record(ReleaseStageSchema, StageStatusSchema),
    requirementsFile: z.string(),
    checklistFile: z.string(),
    resolutions: z.array(AppliedResolutionSchema),
    releaseState: ReleaseStateSchema,
    failure: ReleaseFailureSchema.nullable(),
    limitations: z.array(z.string()),
    warnings: z.array(z.string()),
    technicalDebt: z.array(TechnicalDebtEntrySchema),
    runs: z.array(z.object({ runId: z.string(), kind: z.string() }).strict()),
  })
  .strict();
export type ReleaseProject = z.infer<typeof ReleaseProjectSchema>;

// ---------------------------------------------------------------------------
// Release run audit record (spec §27, §28)
// ---------------------------------------------------------------------------

export const StageExecutionRecordSchema = z
  .object({
    stage: ReleaseStageSchema,
    status: z.enum(["reused", "rerun", "blocked", "failed"]),
    elapsedMs: z.number().nonnegative(),
    artifact: ArtifactRefSchema.nullable(),
    detail: z.string().optional(),
  })
  .strict();
export type StageExecutionRecord = z.infer<typeof StageExecutionRecordSchema>;

export const ReleaseRunSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(RELEASE_RUN_SCHEMA_NAME),
    runId: z.string(),
    kind: z.enum(["prepare", "resolve", "build"]),
    projectId: z.string(),
    createdAt: z.string(),
    intentHash: z.string().nullable(),
    /** Hash of the cumulative effective resolution at run time. */
    resolutionHash: z.string().nullable(),
    inputArtifactHashes: z.record(z.string(), z.string()),
    reusedStages: z.array(ReleaseStageSchema),
    rerunStages: z.array(ReleaseStageSchema),
    blockedStages: z.array(ReleaseStageSchema),
    /** Operator overrides: font decisions + acknowledgements applied. */
    operatorOverrides: z.array(z.string()),
    warnings: z.array(z.string()),
    /** Unresolved release-blocking requirement ids at the end of the run. */
    blockers: z.array(z.string()),
    finalVerdict: ReleaseStateSchema,
    stageExecutions: z.array(StageExecutionRecordSchema),
    failure: ReleaseFailureSchema.nullable(),
  })
  .strict();
export type ReleaseRun = z.infer<typeof ReleaseRunSchema>;

// ---------------------------------------------------------------------------
// Severity policy (spec §19 / §22) — encoded ONCE, with the rationale.
// ---------------------------------------------------------------------------

/**
 * Why each kind carries its priority. `release-blocking` mirrors the spec §19
 * indexable-production conditions exactly; everything §19 does not demand is
 * high-value or optional. No numeric scores anywhere.
 */
export const SEVERITY_POLICY: Record<RequirementKind, { severity: RequirementSeverity; basis: string }> = {
  "production-domain": {
    severity: "release-blocking",
    basis: "§19: canonical / og:url / absolute sitemap / index robots require a real domain",
  },
  "content-route": {
    severity: "release-blocking",
    basis: "§19: blocked-visible-source-content must be 0 — an uninjected route serves source body copy",
  },
  "font-license": {
    severity: "release-blocking",
    basis: "§19: the required font decision must be resolved (license verified or fallback accepted)",
  },
  "source-brand-asset": {
    severity: "release-blocking",
    basis: "§19: visible source-brand content must be 0 — inline-SVG marks are outside the asset layer",
  },
  "replacement-image": {
    severity: "release-blocking",
    basis:
      "§19: replacement-required render assets and runtime source asset dependencies must be 0 " +
      "(replacement-recommended entries are downgraded to high-value at collection time)",
  },
  "business-fact": {
    severity: "high-value",
    basis: "JSON-LD omits absent facts honestly; §19 does not require them for indexability",
  },
  "og-image": {
    severity: "high-value",
    basis: "policy: a missing social image degrades sharing, not indexability (§22: blocking only if the indexable policy says so — ours does not)",
  },
  "organization-logo": {
    severity: "high-value",
    basis: "JSON-LD logo is omitted honestly when absent",
  },
  "external-url": {
    severity: "high-value",
    basis: "unresolved destinations keep source defaults (brand-leak warnings), but do not gate indexability",
  },
  "seo-fact": {
    severity: "high-value",
    basis: "non-blocking SEO value still needs-input",
  },
  "social-handle": {
    severity: "optional",
    basis: "§22: a social handle is optional",
  },
};
