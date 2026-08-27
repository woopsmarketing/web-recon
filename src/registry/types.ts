/**
 * Template / Site registry artifacts (Task 27, Stretch Goal B).
 *
 * A registry entry is a DERIVED SUMMARY of an artifact that already exists on
 * disk — never a new fact. Every field below is copied or counted from
 * `recon-templates/<run>/manifest.json` + `site-map.json` (templates) or
 * `release-projects/<id>/release-project.json` + `revisions/` (sites), so a
 * lost index file is rebuilt by re-reading those artifacts (`rebuildRegistry`).
 *
 * THE ARTIFACT IS THE SOURCE OF TRUTH. If an entry and its artifact disagree,
 * the artifact wins and the entry is stale — `readTemplate`/`readSite` return
 * the freshly derived entry and report `indexAgreed: false`.
 */
import { z } from "zod";

export const REGISTRY_SCHEMA_VERSION = 1;
export const TEMPLATE_REGISTRY_SCHEMA_NAME = "template-registry-v1";
export const SITE_REGISTRY_SCHEMA_NAME = "site-registry-v1";

// ---------------------------------------------------------------------------
// Template entries
// ---------------------------------------------------------------------------

/**
 * One repeated route family the compiler DETECTED (Task 27 Agent 2A). Summary
 * only — the full CollectionSpec stays in the template's site-map.json.
 */
export const RegistryCollectionSchema = z
  .object({
    collectionId: z.string(),
    /** Grouping evidence verbatim, e.g. `scope:resources`. */
    groupedBy: z.string(),
    semanticKind: z.string(),
    reconstructedRoutes: z.number().int().nonnegative(),
    representativeRoutes: z.number().int().nonnegative(),
    discoveredMemberCount: z.number().int().nonnegative(),
    /** Mirrors CollectionSpec.countIsFloor — the crawl was capped. */
    countIsFloor: z.boolean(),
  })
  .strict();
export type RegistryCollection = z.infer<typeof RegistryCollectionSchema>;

export const TemplateEntrySchema = z
  .object({
    /** `<host>-<runId>` — the manifest's own id, unique across the registry. */
    templateId: z.string().min(1),
    host: z.string().min(1),
    /** Run directory name; the template namespace's only clock. */
    runId: z.string().min(1),
    /** Repo-relative POSIX path of the template run directory. */
    templateDir: z.string().min(1),
    createdAt: z.string(),
    compilerVersion: z.number().int().positive(),
    source: z
      .object({
        host: z.string(),
        rootUrl: z.string(),
        siteSpecRunId: z.string(),
        reconstructionRunId: z.string(),
      })
      .strict(),
    routes: z.array(z.string()),
    routeCount: z.number().int().nonnegative(),
    /**
     * False on a compiler v1/v2 template, which had no route policy at all —
     * every route was slotized, so `slotizedRouteCount` is the route count and
     * `structureOnlyRouteCount` is 0 BY DEFINITION, not by measurement.
     */
    routePolicyApplied: z.boolean(),
    slotizedRouteCount: z.number().int().nonnegative(),
    structureOnlyRouteCount: z.number().int().nonnegative(),
    excludedRouteCount: z.number().int().nonnegative(),
    slotCount: z.number().int().nonnegative(),
    bindingCount: z.number().int().nonnegative(),
    collections: z.array(RegistryCollectionSchema),
    limitations: z.array(z.string()),
  })
  .strict();
export type TemplateEntry = z.infer<typeof TemplateEntrySchema>;

// ---------------------------------------------------------------------------
// Site entries
// ---------------------------------------------------------------------------

/** Head of the project's append-only authored-revision chain, or null. */
export const RegistryRevisionPointerSchema = z
  .object({
    revisionId: z.string(),
    parentRevisionId: z.string().nullable(),
    authoredStateHash: z.string(),
    origin: z.string(),
    createdAt: z.string(),
    /** Chain length — `revisionId` is a position, so this is its successor. */
    revisionCount: z.number().int().positive(),
  })
  .strict();
export type RegistryRevisionPointer = z.infer<typeof RegistryRevisionPointerSchema>;

export const SiteEntrySchema = z
  .object({
    /**
     * `<host>/<projectId>` — the project's DIRECTORY identity, and the only
     * key guaranteed unique. `siteId` is not: every project written before
     * Task 27 has its siteId adapted from the host on load, so the two legacy
     * linear.app projects both adapt to siteId `linear.app`.
     */
    siteKey: z.string().min(1),
    siteId: z.string().min(1),
    projectId: z.string().min(1),
    host: z.string().min(1),
    /** Repo-relative POSIX path of the release project directory. */
    projectDir: z.string().min(1),
    /**
     * Display name. DERIVED from `siteId` — a customer-facing name has no home
     * in release-project.json today, and a name stored only here would be a
     * fact the registry could not rebuild. See changeRequests in the handoff.
     */
    name: z.string().min(1),
    nameSource: z.literal("derived-from-site-id"),
    /** `acceptedLineage.template` verbatim — the template this site came from. */
    templateLineage: z
      .object({ templateId: z.string(), path: z.string(), hash: z.string() })
      .strict(),
    releaseState: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** On-disk document revision, and the revision it was adapted FROM. */
    projectRevision: z.number().int().positive(),
    adaptedFromRevision: z.number().int().positive().nullable(),
    revision: RegistryRevisionPointerSchema.nullable(),
    authoredSlotCount: z.number().int().nonnegative(),
  })
  .strict();
export type SiteEntry = z.infer<typeof SiteEntrySchema>;

// ---------------------------------------------------------------------------
// Index files
// ---------------------------------------------------------------------------

export const TemplateRegistrySchema = z
  .object({
    schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
    schemaName: z.literal(TEMPLATE_REGISTRY_SCHEMA_NAME),
    /** Clock reading for the INDEX file only; never compared for agreement. */
    generatedAt: z.string(),
    dataRoot: z.string(),
    entries: z.array(TemplateEntrySchema),
    warnings: z.array(z.string()),
  })
  .strict();
export type TemplateRegistry = z.infer<typeof TemplateRegistrySchema>;

export const SiteRegistrySchema = z
  .object({
    schemaVersion: z.literal(REGISTRY_SCHEMA_VERSION),
    schemaName: z.literal(SITE_REGISTRY_SCHEMA_NAME),
    generatedAt: z.string(),
    dataRoot: z.string(),
    entries: z.array(SiteEntrySchema),
    warnings: z.array(z.string()),
  })
  .strict();
export type SiteRegistry = z.infer<typeof SiteRegistrySchema>;

// ---------------------------------------------------------------------------
// Resolution result (artifact-wins read)
// ---------------------------------------------------------------------------

export interface ResolvedEntry<T> {
  entry: T;
  /**
   * `artifact` — the entry was re-derived from the artifact on disk (normal).
   * `index`    — the artifact is gone and the stale index entry is all that is
   *              left; the caller is looking at a dangling pointer.
   */
  resolvedFrom: "artifact" | "index";
  /** The index carried an entry for this id. */
  registered: boolean;
  /** The index entry matched the artifact exactly. False when unregistered. */
  indexAgreed: boolean;
  /** The artifact directory named by the index no longer exists. */
  artifactMissing: boolean;
}
