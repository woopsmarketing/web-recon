import { z } from "zod";

/**
 * Preservation Clone artifact schema (Source Preservation Phase 2).
 *
 * A Preservation Clone is a browser-runnable LOCAL copy of one captured page,
 * assembled from a Phase 1 Source Package. Its defining rule is negative:
 *
 *   nothing in this artifact is derived from measured pixel geometry.
 *
 * The clone keeps the source's own DOM tree, the source's own stylesheets in
 * the source's own cascade order, and the source's own responsive CSS
 * (%, vw, rem, fr, flex, grid, calc(), clamp(), @media, @container, custom
 * properties). The builder only ever rewrites RESOURCE URLs and neutralizes
 * executable script; it never rewrites a layout declaration.
 *
 * Everything the builder could NOT preserve is recorded rather than hidden:
 * `residual-dependencies.json` lists every URL a browser will still fetch from
 * the source host, and the manifest's `limitations` says out loud which parts
 * of the source are markup-only (no listeners, no framework state, no API).
 */

export const SCHEMA_VERSION = 1;
export const PACKAGE_KIND = "web-recon-preservation-clone" as const;
export const BUILDER_NAME = "preservation-clone" as const;
export const BUILDER_VERSION = "1.0.0" as const;

/* ------------------------------------------------------------------ *
 * Resource map
 * ------------------------------------------------------------------ */

/** Why the builder went looking for this URL in the first place. */
export const ResourceOriginSchema = z.enum([
  "asset-inventory", // listed in the Source Package assets manifest
  "css-url", // discovered inside a preserved stylesheet's url(...)
  "stylesheet", // the stylesheet file itself (authored linked CSS)
  "script-body", // preserved JS bytes (Phase 3 material, never referenced)
]);
export type ResourceOrigin = z.infer<typeof ResourceOriginSchema>;

/**
 * Outcome of trying to make one source URL local.
 *
 * `fetched` is the only status that yields a `localPath`. Everything else
 * leaves the source URL in place and produces a residual dependency, so the
 * count of non-`fetched` resources is exactly the honesty budget of the clone.
 */
export const ResourceStatusSchema = z.union([
  z.literal("fetched"),
  z.literal("from-source-package"), // bytes were already captured in Phase 1
  z.literal("skipped-over-budget"), // larger than the preservation size cap
  z.literal("skipped-analytics"), // tracker/beacon: deliberately not localized
  z.literal("skipped-embed"), // third-party embed runtime, not cloned
  z.literal("skipped-non-http"), // blob:, javascript:, unresolved relative, ...
  z.string(), // SafeFetchStatus failure values pass through verbatim
]);

export const ResourceRecordSchema = z
  .object({
    sourceUrl: z.string(),
    host: z.string(),
    origin: ResourceOriginSchema,
    /** Source Package asset kinds this URL was seen as (may be several). */
    kinds: z.array(z.string()),
    dependencyClass: z.string(),
    status: ResourceStatusSchema,
    httpStatus: z.number().nullable(),
    mime: z.string().nullable(),
    bytes: z.number().nullable(),
    sha256: z.string().nullable(),
    /** Clone-root-relative path, e.g. `assets/<sha256>.<ext>`. */
    localPath: z.string().nullable(),
    redirectChain: z.array(z.string()),
    detail: z.string().nullable(),
    /** Viewport variants that reference this resource. */
    usedBy: z.array(z.string()),
    /** true when more than one viewport variant shares the same bytes. */
    shared: z.boolean(),
  })
  .strict();
export type ResourceRecord = z.infer<typeof ResourceRecordSchema>;

export const ResourceMapSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    createdAt: z.string(),
    /** sha256 -> clone-relative path, the dedupe index. */
    byHash: z.record(z.string(), z.string()),
    resources: z.array(ResourceRecordSchema),
    counts: z
      .object({
        total: z.number(),
        localized: z.number(),
        shared: z.number(),
        viewportSpecific: z.number(),
        skipped: z.number(),
        failed: z.number(),
        dedupedByHash: z.number(),
      })
      .strict(),
  })
  .strict();
export type ResourceMap = z.infer<typeof ResourceMapSchema>;

/* ------------------------------------------------------------------ *
 * Residual dependencies
 * ------------------------------------------------------------------ */

export const ResidualReasonSchema = z.enum([
  "over-size-budget",
  "fetch-failed",
  "analytics-neutralized",
  "external-embed",
  "stylesheet-unavailable",
  "navigation-link",
  "non-http-scheme",
]);
export type ResidualReason = z.infer<typeof ResidualReasonSchema>;

export const ResidualDependencySchema = z
  .object({
    url: z.string(),
    host: z.string(),
    reason: ResidualReasonSchema,
    dependencyClass: z.string(),
    kinds: z.array(z.string()),
    /**
     * true  = a browser loading the clone WILL contact the source host.
     * false = the reference was neutralized; nothing is requested, but the
     *         source behaviour is correspondingly absent.
     */
    stillRequestedFromSource: z.boolean(),
    usedBy: z.array(z.string()),
    occurrences: z.number(),
    sampleElementPath: z.string().nullable(),
    detail: z.string().nullable(),
  })
  .strict();
export type ResidualDependency = z.infer<typeof ResidualDependencySchema>;

export const ResidualDependenciesSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    createdAt: z.string(),
    /** The clone is source-independent only when this is 0. */
    stillRequestedFromSourceCount: z.number(),
    counts: z.record(z.string(), z.number()),
    dependencies: z.array(ResidualDependencySchema),
  })
  .strict();
export type ResidualDependencies = z.infer<typeof ResidualDependenciesSchema>;

/* ------------------------------------------------------------------ *
 * Stylesheet preservation decisions
 * ------------------------------------------------------------------ */

/**
 * Exactly ONE representation is chosen per StyleEntry. Emitting both authored
 * text and a CSSOM snapshot for the same entry would double the cascade, so
 * the builder refuses to and records the choice here instead.
 */
export const StyleRepresentationSchema = z.enum([
  "authored-linked", // authored bytes of a <link rel=stylesheet>, written to styles/
  "authored-inline", // authored text of a <style> tag, kept inline in place
  "runtime-derived-cssom", // CSSOM snapshot: authored text never existed (CSS-in-JS)
  "unresolved", // no authored text and no CSSOM snapshot
  "source-hosted", // authored unavailable: <link> still points at the source
]);
export type StyleRepresentation = z.infer<typeof StyleRepresentationSchema>;

export const StyleDecisionSchema = z
  .object({
    entryId: z.string(),
    /** Index in the source's `document.styleSheets`; the cascade position. */
    order: z.number(),
    sourceType: z.string(),
    declaredIn: z.string(),
    url: z.string().nullable(),
    media: z.string().nullable(),
    representation: StyleRepresentationSchema,
    /** true only for `runtime-derived-cssom`: NOT authored source. */
    runtimeDerived: z.boolean(),
    bytes: z.number(),
    sha256: z.string().nullable(),
    localPath: z.string().nullable(),
    /** How the builder matched this entry to a node in the runtime DOM. */
    domMatch: z.enum(["document-order", "owner-attributes", "none"]),
    domNode: z.string().nullable(),
    cssUrlsRewritten: z.number(),
    note: z.string().nullable(),
  })
  .strict();
export type StyleDecision = z.infer<typeof StyleDecisionSchema>;

/* ------------------------------------------------------------------ *
 * Script neutralization
 * ------------------------------------------------------------------ */

export const ScriptActionSchema = z.enum([
  "neutralized-inline", // executable inline body, made inert in place
  "neutralized-src", // executable external script, src moved to a data-* attr
  "kept-data", // application/json, ld+json, importmap, ... never executable
]);
export type ScriptAction = z.infer<typeof ScriptActionSchema>;

export const ScriptRecordSchema = z
  .object({
    action: ScriptActionSchema,
    typeAttr: z.string().nullable(),
    src: z.string().nullable(),
    host: z.string().nullable(),
    dependencyClass: z.string(),
    thirdParty: z.boolean(),
    inlineBytes: z.number(),
    /** Clone-relative path of the preserved JS bytes, when Phase 1 has them. */
    preservedBytesPath: z.string().nullable(),
  })
  .strict();
export type ScriptRecord = z.infer<typeof ScriptRecordSchema>;

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

export const VariantSchema = z
  .object({
    viewportId: z.string(),
    viewport: z
      .object({
        width: z.number(),
        height: z.number(),
        isMobile: z.boolean(),
        deviceScaleFactor: z.number(),
      })
      .strict(),
    /** Clone-root-relative path of the browser-runnable document. */
    htmlPath: z.string(),
    previewPath: z.string(),
    /** Always `runtime-dom`: the initial response is bootstrap evidence only. */
    domSource: z.literal("runtime-dom"),
    domSourceFile: z.string(),
    domSourceSha256: z.string().nullable(),
    provenance: z
      .object({
        sourcePackageDir: z.string(),
        sourcePackageContentHash: z.string(),
        responseHtmlFile: z.string().nullable(),
        runtimeHtmlFile: z.string().nullable(),
      })
      .strict(),
    styles: z.array(StyleDecisionSchema),
    styleCounts: z.record(z.string(), z.number()),
    scripts: z.array(ScriptRecordSchema),
    scriptCounts: z
      .object({
        total: z.number(),
        neutralized: z.number(),
        keptData: z.number(),
        bytesPreserved: z.number(),
        executed: z.literal(0),
      })
      .strict(),
    rewrites: z
      .object({
        localizedAttributes: z.number(),
        absolutizedAttributes: z.number(),
        srcsetCandidates: z.number(),
        neutralizedEmbeds: z.number(),
        neutralizedTrackers: z.number(),
        neutralizedNavigations: z.number(),
        neutralizedEventHandlers: z.number(),
        cssUrlsRewritten: z.number(),
      })
      .strict(),
    bytes: z.number(),
  })
  .strict();
export type Variant = z.infer<typeof VariantSchema>;

export const PreservationCloneManifestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    packageKind: z.literal(PACKAGE_KIND),
    builder: z
      .object({ name: z.literal(BUILDER_NAME), version: z.string() })
      .strict(),
    runId: z.string(),
    createdAt: z.string(),
    source: z
      .object({
        runDir: z.string(),
        url: z.string(),
        origin: z.string(),
        host: z.string(),
        sourcePackageSchemaVersion: z.number(),
        capturedAt: z.string(),
      })
      .strict(),
    policy: z
      .object({
        maxAssetBytes: z.number(),
        maxMediaBytes: z.number(),
        fetchTimeoutMs: z.number(),
        concurrency: z.number(),
        allowedHosts: z.array(z.string()),
        geometryReconstruction: z.literal("none"),
        sourceJsExecution: z.literal("disabled"),
        apiReplay: z.literal("none"),
      })
      .strict(),
    variants: z.array(VariantSchema),
    resources: z
      .object({
        total: z.number(),
        localized: z.number(),
        shared: z.number(),
        viewportSpecific: z.number(),
        skipped: z.number(),
        failed: z.number(),
      })
      .strict(),
    residual: z
      .object({
        total: z.number(),
        stillRequestedFromSource: z.number(),
      })
      .strict(),
    files: z
      .object({
        resourceMap: z.string(),
        residualDependencies: z.string(),
      })
      .strict(),
    warnings: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .strict();
export type PreservationCloneManifest = z.infer<
  typeof PreservationCloneManifestSchema
>;
