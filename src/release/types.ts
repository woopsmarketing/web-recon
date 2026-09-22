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

/**
 * Release project REVISION (Task 27) — a second version axis, deliberately
 * separate from `schemaVersion`.
 *
 * `schemaVersion` is shared by requirements.json / run.json / the resolution
 * pack; bumping it would invalidate every one of those files. The customer
 * AUTHORING fields (`siteId`, `authored`) are a change to the PROJECT document
 * alone, so the project carries its own revision and old documents are ADAPTED
 * on load (see instance.ts `adaptReleaseProject`) — never rewritten on disk.
 *
 *   1  Task 25/26 — run-scoped projectId, no authored state
 *   2  Task 27    — stable siteId + authoritative `authored` block
 */
export const RELEASE_PROJECT_REVISION = 2 as const;
export const LEGACY_RELEASE_PROJECT_REVISION = 1 as const;

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
  "brand-leak",
  /**
   * Task 28 Phase 6: an ENABLED page links to a route the operator disabled,
   * and the removal is not deterministic (the anchor hosting the link also
   * hosts unrelated slots, or the anchor carries no slot at all). It NEVER
   * clears because the route was disabled — only when the SERVED candidate's
   * link QA reports zero `brokenInternal` for it (`src/seo/link-qa.ts`).
   */
  "dead-internal-link",
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

/**
 * WHICH collection a requirements.json describes (Task 28 §1B).
 *
 * A requirement total is only meaningful relative to the stage artifacts the
 * gaps were collected from: `release:build` re-collects from the artifacts its
 * own stage reruns just produced, so the file it writes legitimately differs
 * from the one `release:prepare` wrote against the accepted lineage. Without
 * this block the two numbers look like the same number disagreeing with
 * itself, which is exactly the drift Task 27 recorded and could not explain.
 *
 * OPTIONAL because every requirements.json written before Task 28 lacks it and
 * the schema is `.strict()` — an absent block means "provenance unrecorded",
 * never "collected from nothing".
 */
export const RequirementsProvenanceSchema = z
  .object({
    /** The release run that produced this file. */
    releaseRunId: z.string().min(1),
    releaseRunKind: z.enum(["prepare", "resolve", "build"]),
    /** stage -> the artifact directory the gaps were COLLECTED from. */
    stageArtifacts: z.record(z.string(), z.string()),
  })
  .strict();
export type RequirementsProvenance = z.infer<typeof RequirementsProvenanceSchema>;

export const RequirementsFileSchema = z
  .object({
    schemaVersion: z.literal(RELEASE_SCHEMA_VERSION),
    schemaName: z.literal(RELEASE_REQUIREMENTS_SCHEMA_NAME),
    projectId: z.string(),
    generatedAt: z.string(),
    collectedFrom: RequirementsProvenanceSchema.optional(),
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
// Authored state (Task 27) — the customer-authoring half of a site instance
// ---------------------------------------------------------------------------

/**
 * The operator's theme input. Token ids and values are validated against the
 * Task 20 Theme Contract (`isThemeToken` / `isSafeThemeValue`) at resolve time:
 * the contract vocabulary is CLOSED and carries paint only, so a layout value
 * has no token to land in — that is the whole enforcement, not a second
 * blocklist.
 */
export const AuthoredThemeSchema = z
  .object({
    /** Theme file to start from; default is the current theme run's theme. */
    themeSourceFile: z.string().min(1).optional(),
    /** theme-contract-v1 token id → paint value (overrides the base theme). */
    tokens: z.record(z.string(), z.string()).optional(),
    note: z.string().optional(),
  })
  .strict();
export type AuthoredTheme = z.infer<typeof AuthoredThemeSchema>;

/**
 * An operator-authored ASSET replacement (Task 28 Phase 2).
 *
 * KEYED EXACTLY LIKE THE RESOLUTION PACK. `ProductionResolution.assets` is a
 * map from `assetId` → file, where `assetId` is a replacement-manifest
 * `entries[].inventoryId` or one of the two site-level ids `og-image` /
 * `organization-logo` (resolve-assets.ts:129-136 is the only place that
 * vocabulary is interpreted). `authored.assets` uses the SAME key so the two
 * are mergeable without a translation table: `assetsStageRunner` applies the
 * pack's assets first and the authored ones last, so a Visual Editor edit
 * wins over the pack that first introduced the value — the same precedence
 * `contentStageRunner` already gives `authored.slotValues`.
 *
 * `alt` HAS NO CONSUMER YET and that is recorded rather than implied: the
 * asset materialization rewrites BYTES keyed on a source URL (assets/rewrite.ts)
 * and never touches markup, so an `alt` attribute can only be written by a
 * bake-time IR rewrite. It is stored here because the Visual Editor's "replace
 * this image" and Phase 2's brand REPLACE payload both need somewhere
 * authoritative to put it.
 */
export const AuthoredAssetSchema = z
  .object({
    /** Local replacement file — the same value `ResolutionAsset.file` carries. */
    file: z.string().min(1),
    /** Alt text for the surface, where it has one. RECORDED, not yet consumed. */
    alt: z.string().optional(),
    note: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict();
export type AuthoredAsset = z.infer<typeof AuthoredAssetSchema>;

/**
 * The operator's DECISION about one detected source-brand surface.
 *
 *   REPLACE   ship something else in its place (text, or a replacement asset)
 *   REMOVE    ship the surface empty / absent
 *   PRESERVE  ship the source's own mark, deliberately — requires a reason
 *
 * DETECTION IS NOT STORED HERE. A brand surface's route, node id, matched
 * value and evidence pointer are DERIVED SOURCE EVIDENCE: re-derivable by
 * re-running the detector (brand-scan.ts `scanBrandSurfaces`) against the
 * template lineage, and wrong the moment the lineage moves. Copying it into
 * mutable customer state would create a second, silently-rotting truth. Only
 * the decision lives here, addressed by the stable surface id the detector
 * produces (`brandSurfaceId`, authored.ts).
 */
export const BRAND_DECISIONS = ["REPLACE", "REMOVE", "PRESERVE"] as const;
export const BrandDecisionSchema = z.enum(BRAND_DECISIONS);
export type BrandDecision = z.infer<typeof BrandDecisionSchema>;

export const AuthoredBrandDecisionSchema = z
  .object({
    decision: BrandDecisionSchema,
    /**
     * REPLACE payload. `text` covers the textual surfaces (aria-label, svg
     * <text>/<title>, image alt, visible text); `assetId` points at an
     * `authored.assets` entry; `file` is a local file for a surface with no
     * inventory id. At least one is required for REPLACE and none may be
     * present otherwise — a REMOVE that carries a payload is an editor bug,
     * not a preference.
     */
    replacement: z
      .object({
        text: z.string().optional(),
        assetId: z.string().min(1).optional(),
        file: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /** PRESERVE only, and REQUIRED there: why this source mark may ship. */
    reason: z.string().min(1).optional(),
    note: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const payload = value.replacement;
    const hasPayload =
      payload !== undefined &&
      (payload.text !== undefined || payload.assetId !== undefined || payload.file !== undefined);
    if (value.decision === "REPLACE" && !hasPayload) {
      ctx.addIssue({
        code: "custom",
        message:
          "brand decision REPLACE requires a replacement payload (replacement.text, " +
          "replacement.assetId or replacement.file) — a REPLACE with nothing to ship is a gap, " +
          "not a decision",
      });
    }
    if (value.decision !== "REPLACE" && hasPayload) {
      ctx.addIssue({
        code: "custom",
        message: `brand decision ${value.decision} must not carry a replacement payload`,
      });
    }
    if (value.decision === "PRESERVE" && value.reason === undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "brand decision PRESERVE requires an explicit reason — shipping the source's own mark " +
          "is a decision that must be defensible on the operator checklist",
      });
    }
    if (value.decision !== "PRESERVE" && value.reason !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `brand decision ${value.decision} must not carry a PRESERVE reason`,
      });
    }
  });
export type AuthoredBrandDecision = z.infer<typeof AuthoredBrandDecisionSchema>;

// ---------------------------------------------------------------------------
// Enablement (Task 28 Phases 5 + 6) — "this section / this page is not needed"
// ---------------------------------------------------------------------------

/**
 * One DISABLED ROUTE. The key is the route-map `key` (`/pricing`).
 *
 * Recorded separately from `disabledRegions` on purpose: they stale different
 * stages (a route leaves the CONTENT scope, the SEO plan, the sitemap and the
 * export; a region only stops rendering), they are refused for different
 * reasons, and a single mixed map could not express "this region is off
 * everywhere" and "this page is off" without one of them lying.
 */
export const DisabledRouteSchema = z
  .object({
    reason: z.string().optional(),
    note: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict();
export type DisabledRoute = z.infer<typeof DisabledRouteSchema>;

/**
 * How widely a region disable applies.
 *
 *   global  every route that renders the region — the ONLY honest answer for a
 *           region that is global for enablement purposes, and the only answer
 *           available at all when the region's page is shared by several routes
 *   routes  the explicit route list. Accepted only when it covers the region's
 *           whole blast radius (see `evaluateRegionDisable`), which is what
 *           makes "disable on /a but not /b" impossible to record as a lie
 *           rather than merely discouraged.
 */
export const REGION_DISABLE_SCOPES = ["global", "routes"] as const;
export const RegionDisableScopeSchema = z.enum(REGION_DISABLE_SCOPES);
export type RegionDisableScope = z.infer<typeof RegionDisableScopeSchema>;

export const DisabledRegionSchema = z
  .object({
    scope: RegionDisableScopeSchema,
    /** Required when scope is `routes`; forbidden when scope is `global`. */
    routes: z.array(z.string().min(1)).optional(),
    reason: z.string().optional(),
    note: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "routes" && (value.routes === undefined || value.routes.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message:
          'region disable scope "routes" requires a non-empty route list — a scoped disable that ' +
          "names no route is a decision with no subject",
      });
    }
    if (value.scope === "global" && value.routes !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          'region disable scope "global" must not carry a route list — it applies to every route ' +
          "that renders the region, and a list would imply it does not",
      });
    }
  });
export type DisabledRegion = z.infer<typeof DisabledRegionSchema>;

/**
 * AUTHORITATIVE authored state. This is the future Visual Editor's write
 * target and the single source of truth for the values it owns:
 *
 *   slotValues  content-runs/<run>/slot-values.json is a DERIVED,
 *               MATERIALIZED OUTPUT of this map (store.ts, stages.ts)
 *   theme       theme-runs/<run>/selected-theme.json is derived from this
 *
 * Values still ARRIVE through resolution packs (`urls`,
 * `routeContent[*].slotValues`, `theme`); resolve folds them in here and the
 * pack stays as the immutable audit record of HOW the value arrived — a
 * derivation, never a second independent source.
 */
export const AuthoredStateSchema = z
  .object({
    /** slot key → authored value (string for text/url slots). */
    slotValues: z.record(z.string(), z.unknown()),
    theme: AuthoredThemeSchema,
    /**
     * assetId → authored replacement (Task 28 Phase 2). OPTIONAL, and ABSENT
     * rather than `{}` when nothing is authored: every release-project.json
     * already on disk lacks the field (the schema is `.strict()`, so a
     * REQUIRED one would refuse to load them) and `hashAuthoredState`
     * (revisions.ts) hashes the snapshot as captured — an empty map would
     * change the hash of every historical authored state and manufacture a
     * spurious revision on the next prepare. `removeAuthoredAsset` deletes the
     * field again when the last entry goes, so the round trip is exact.
     */
    assets: z.record(z.string(), AuthoredAssetSchema).optional(),
    /**
     * brand surface id → operator decision (Task 28 Phase 2). Absent-when-empty
     * for exactly the reasons above. The ids come from `brandSurfaceId`
     * (authored.ts) over the detector's findings; no detection evidence is
     * stored here.
     */
    brand: z.record(z.string(), AuthoredBrandDecisionSchema).optional(),
    /**
     * route key -> the operator turned this page OFF (Task 28 Phase 6).
     * Absent-when-empty for exactly the reasons `assets` is: the schema is
     * `.strict()`, every release-project.json on disk lacks the field, and
     * `hashAuthoredState` hashes the snapshot as captured — a required-but-
     * empty map would change the hash of every historical authored state and
     * manufacture a spurious revision on the next prepare.
     */
    disabledRoutes: z.record(z.string(), DisabledRouteSchema).optional(),
    /**
     * PageRegion id -> the operator deleted this section (Task 28 Phase 5).
     * The id comes from `page-regions.json`; nothing about WHY it was chosen
     * (node ids, slot keys, the interaction graph) is stored here — that is
     * all re-derived from the artifacts on every resolve, so a template
     * recompile that moved an id is caught instead of applied blind.
     */
    disabledRegions: z.record(z.string(), DisabledRegionSchema).optional(),
    updatedAt: z.string().nullable(),
  })
  .strict();
export type AuthoredState = z.infer<typeof AuthoredStateSchema>;

export function emptyAuthoredState(): AuthoredState {
  return { slotValues: {}, theme: {}, updatedAt: null };
}

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
    /** Theme authoring input (Task 27). Folded into `authored.theme` at
     *  resolve time; wires THEME_SELECTION_IMPACTS live. */
    theme: AuthoredThemeSchema.optional(),
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
    /** Project document revision — see RELEASE_PROJECT_REVISION. */
    projectRevision: z.literal(RELEASE_PROJECT_REVISION),
    /**
     * STABLE site identity (Task 27). One customer site keeps ONE siteId
     * across every prepare/build cycle; several distinct customer sites may
     * eventually be produced from one template by giving each its own siteId.
     * `projectId` defaults to it, so re-prepare lands in the SAME project.
     */
    siteId: z.string().min(1),
    projectId: z.string().min(1),
    /**
     * Human-facing site name (Task 28 CR3) — what a Library UI shows instead of
     * a host slug. OPTIONAL ON PURPOSE: the schema is `.strict()` and
     * `adaptReleaseProject` only knows the revision 1→2 upgrade, so a REQUIRED
     * field would force a revision 3 and break every project already on disk.
     * Absent means "no name recorded"; the registry then derives the display
     * name from `siteId`, exactly as it did before this field existed.
     */
    displayName: z.string().min(1).optional(),
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
        /**
         * page-regions run dir (Task 28 Phase 5) — the artifact region
         * enablement addresses. OPTIONAL: the object is `.strict()` and every
         * project on disk predates it, so a required field would refuse to
         * load them. Absent means "this project has no region compile", and
         * every region edit is then refused with `regions-not-compiled`
         * rather than silently ignored.
         */
        pageRegionsDir: z.string().optional(),
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
    /** Authoritative authored state (Task 27) — see AuthoredStateSchema. */
    authored: AuthoredStateSchema,
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
    /**
     * The requirement total this run WROTE into requirements.json (Task 28
     * §1B). Required: a run that rewrites the requirements file without
     * recording its own total leaves the operator with a CLI line and a file
     * that cannot be compared afterwards.
     */
    requirementsTotal: z.number().int().nonnegative(),
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
  "dead-internal-link": {
    severity: "release-blocking",
    basis:
      "\u00a719: a link that answers 404 is a broken production site. It is release-blocking rather " +
      "than high-value because the alternative — silently pointing it at the homepage — is the one " +
      "thing this engine must never do",
  },
  "social-handle": {
    severity: "optional",
    basis: "§22: a social handle is optional",
  },
  "brand-leak": {
    severity: "high-value",
    basis:
      "policy: DEFAULT high-value. A brand surface is escalated to release-blocking at collection " +
      "time (brand-scan.ts brandFindingSeverity) ONLY when the surface publishes the source's " +
      "identity AND an implemented resolution can clear it — i.e. it is slot-bound. Blocking a " +
      "surface with no write target is what makes `source-brand-asset` unreachable; this kind " +
      "does not repeat that",
  },
};
