import { z } from "zod";

/**
 * web-recon SEO — the two Task 21 data models (source-seo-snapshot-v1 and
 * production-seo-plan-v1).
 *
 * They are deliberately TWO schema families with zero shared object schemas:
 * Source SEO is immutable audit EVIDENCE of how the original site does SEO
 * (provenance `observed`), Production SEO is an independent PLAN for the new
 * content/brand/domain (provenance `derived`). Sharing one model would make
 * "copy the original" the path of least resistance — the exact failure mode
 * PRODUCT_VISION §9 forbids (원본 SEO를 그대로 복사하지 않는다).
 */

// ---------------------------------------------------------------------------
// Source SEO Snapshot (source-seo-snapshot-v1) — evidence, never edited
// ---------------------------------------------------------------------------

export const SOURCE_SEO_SNAPSHOT_SCHEMA_NAME = "source-seo-snapshot-v1";

export const SourceHreflangSchema = z
  .object({ lang: z.string(), href: z.string() })
  .strict();

export const SourceMetaEntrySchema = z
  .object({ key: z.string(), content: z.string() })
  .strict();

export const SourceJsonLdSchema = z
  .object({
    parseable: z.boolean(),
    bytes: z.number().int().nonnegative(),
    /** schema.org @type values found (flattened over @graph); [] when unparseable. */
    types: z.array(z.string()),
    json: z.unknown().optional(),
  })
  .strict();

export const SourceHeadingSchema = z
  .object({ level: z.number().int().min(1).max(6), text: z.string() })
  .strict();

export const SourceImageAltAuditSchema = z
  .object({
    images: z.number().int().nonnegative(),
    withAlt: z.number().int().nonnegative(),
    emptyAlt: z.number().int().nonnegative(),
    missingAlt: z.number().int().nonnegative(),
    missingAltSample: z.array(z.string()),
  })
  .strict();

export const SourcePageSeoSchema = z
  .object({
    pageId: z.string(),
    url: z.string(),
    finalUrl: z.string(),
    /** From verification.json when the URL was a verified candidate; null = unobserved. */
    httpStatus: z.number().int().nullable(),
    htmlLang: z.string().nullable(),
    title: z.string().nullable(),
    metaDescription: z.string().nullable(),
    canonical: z
      .object({ href: z.string(), selfReferential: z.boolean() })
      .strict()
      .nullable(),
    /** null = no robots meta observed in the rendered head (NOT "indexable"). */
    metaRobots: z.string().nullable(),
    hreflangCount: z.number().int().nonnegative(),
    hreflang: z.array(SourceHreflangSchema),
    openGraph: z.array(SourceMetaEntrySchema),
    twitter: z.array(SourceMetaEntrySchema),
    jsonLd: z.array(SourceJsonLdSchema),
    headingOutline: z.array(SourceHeadingSchema),
    imageAltAudit: SourceImageAltAuditSchema,
    links: z
      .object({
        total: z.number().int().nonnegative(),
        internal: z.number().int().nonnegative(),
        external: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const SourceRobotsTxtSchema = z
  .object({
    /** live-fetched | unavailable (fetch attempted, failed) | not-fetched (fetch not requested). */
    status: z.enum(["live-fetched", "unavailable", "not-fetched"]),
    url: z.string().nullable(),
    httpStatus: z.number().int().nullable(),
    fetchedAt: z.string().nullable(),
    content: z.string().nullable(),
    sitemapUrls: z.array(z.string()),
    disallowRules: z.number().int().nullable(),
    error: z.string().nullable(),
  })
  .strict();

export const SourceSitemapEntrySchema = z
  .object({
    url: z.string(),
    httpStatus: z.number().int().nullable(),
    kind: z.enum(["sitemap-index", "urlset", "unknown"]),
    urlCount: z.number().int().nullable(),
    sampleUrls: z.array(z.string()),
    error: z.string().nullable(),
  })
  .strict();

export const SourceIndexabilitySchema = z
  .object({
    pageId: z.string(),
    url: z.string(),
    httpStatus: z.number().int().nullable(),
    metaRobots: z.string().nullable(),
    canonicalSelf: z.boolean().nullable(),
    /**
     * robots-noindex: an observed robots meta contains noindex.
     * canonical-points-elsewhere: canonical names another URL (a hint, not proof).
     * no-observed-blocker: no robots-meta blocker + self/absent canonical.
     * not-observed: not enough stored evidence to say anything.
     */
    verdict: z.enum([
      "robots-noindex",
      "canonical-points-elsewhere",
      "no-observed-blocker",
      "not-observed",
    ]),
  })
  .strict();

export const SourceSiteSeoSchema = z
  .object({
    routeDepth: z.array(
      z.object({ pageId: z.string(), url: z.string(), depth: z.number().int().nonnegative() }).strict(),
    ),
    linkGraph: z
      .object({
        nodes: z.number().int().nonnegative(),
        edges: z.number().int().nonnegative(),
        internalLinkOccurrences: z.number().int().nonnegative(),
      })
      .strict(),
    /** Pages no OTHER observed page links to — within the observed subgraph only. */
    orphanCandidatesWithinObservedSubgraph: z.array(
      z.object({ pageId: z.string(), url: z.string() }).strict(),
    ),
    duplicateTitles: z.array(
      z.object({ title: z.string(), pageIds: z.array(z.string()) }).strict(),
    ),
    duplicateDescriptions: z.array(
      z.object({ description: z.string(), pageIds: z.array(z.string()) }).strict(),
    ),
    canonicalClusters: z.array(
      z
        .object({
          canonical: z.string(),
          pageIds: z.array(z.string()),
          containsSelfReference: z.boolean(),
        })
        .strict(),
    ),
    missingMetadata: z.array(
      z
        .object({
          kind: z.enum(["title", "description", "canonical", "open-graph", "twitter", "json-ld", "h1"]),
          pageIds: z.array(z.string()),
        })
        .strict(),
    ),
    /** Internal links whose target URL was verified non-2xx / non-HTML. */
    brokenInternalLinks: z.array(
      z
        .object({
          fromPageId: z.string(),
          href: z.string(),
          resolvedUrl: z.string(),
          httpStatus: z.number().int().nullable(),
          reason: z.string(),
        })
        .strict(),
    ),
    /** Internal links pointing outside the verified set — unobserved, NOT "broken". */
    unverifiedInternalLinkTargets: z
      .object({ targets: z.number().int().nonnegative(), sampleUrls: z.array(z.string()) })
      .strict(),
    indexability: z.array(SourceIndexabilitySchema),
    robotsTxt: SourceRobotsTxtSchema,
    sitemaps: z.array(SourceSitemapEntrySchema),
  })
  .strict();

export const SourceSeoSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    schemaName: z.literal(SOURCE_SEO_SNAPSHOT_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    host: z.string(),
    rootUrl: z.string(),
    provenance: z.literal("observed"),
    source: z
      .object({
        siteObservationFile: z.string(),
        verificationFile: z.string().nullable(),
        pagesObserved: z.number().int().nonnegative(),
      })
      .strict(),
    pages: z.array(SourcePageSeoSchema),
    site: SourceSiteSeoSchema,
  })
  .strict();

export type SourceHreflang = z.infer<typeof SourceHreflangSchema>;
export type SourceMetaEntry = z.infer<typeof SourceMetaEntrySchema>;
export type SourceJsonLd = z.infer<typeof SourceJsonLdSchema>;
export type SourcePageSeo = z.infer<typeof SourcePageSeoSchema>;
export type SourceSiteSeo = z.infer<typeof SourceSiteSeoSchema>;
export type SourceSeoSnapshot = z.infer<typeof SourceSeoSnapshotSchema>;

// ---------------------------------------------------------------------------
// Production SEO Plan (production-seo-plan-v1) — independent, never a copy
// ---------------------------------------------------------------------------

export const PRODUCTION_SEO_PLAN_SCHEMA_NAME = "production-seo-plan-v1";

/**
 * Every production value carries its classification and where it came from.
 * `known` requires a basis in user-provided/derived NEW content — never the
 * source site. `needs-input` values are NEVER invented; `previewFallback` (if
 * any) is a value derived from already-known data (e.g. the brand name alone),
 * used only so preview rendering does not serve the source value.
 */
export const PlannedValueSchema = z
  .object({
    value: z.string().nullable(),
    status: z.enum(["known", "needs-input"]),
    basis: z.string(),
    previewFallback: z.string().nullable().optional(),
  })
  .strict();

export const ProductionDomainStateSchema = z
  .object({
    productionDomain: PlannedValueSchema,
    /** preview: no domain provided → noindex,nofollow + no canonical finalization. */
    mode: z.enum(["preview", "production"]),
  })
  .strict();

export const BusinessFactSchema = z
  .object({
    status: z.enum(["known", "needs-input"]),
    value: z.union([z.string(), z.array(z.string())]).nullable(),
  })
  .strict();

export const ProductionBusinessFactsSchema = z
  .object({
    address: BusinessFactSchema,
    phone: BusinessFactSchema,
    prices: BusinessFactSchema,
    reviews: BusinessFactSchema,
    ratings: BusinessFactSchema,
    foundingDate: BusinessFactSchema,
    sameAs: BusinessFactSchema,
  })
  .strict();

export const ProductionRouteSeoSchema = z
  .object({
    routeId: z.string(),
    route: z.string(),
    path: z.string(),
    contentScope: z.enum(["content-injected", "not-yet-injected"]),
    title: PlannedValueSchema,
    description: PlannedValueSchema,
    robotsMeta: z.object({ value: z.string(), basis: z.string() }).strict(),
    canonical: z
      .object({
        intent: z.literal("self-on-production-domain"),
        finalized: z.boolean(),
        value: z.string().nullable(),
        reason: z.string(),
      })
      .strict(),
    openGraph: z
      .object({
        title: PlannedValueSchema,
        description: PlannedValueSchema,
        type: PlannedValueSchema,
        locale: PlannedValueSchema,
        url: PlannedValueSchema,
        image: PlannedValueSchema,
        siteName: PlannedValueSchema,
      })
      .strict(),
    twitter: z
      .object({
        card: PlannedValueSchema,
        title: PlannedValueSchema,
        description: PlannedValueSchema,
        site: PlannedValueSchema,
      })
      .strict(),
    jsonLd: z
      .object({
        emitted: z.boolean(),
        json: z.unknown().optional(),
        omittedNeedsInput: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export const ProductionSeoPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    schemaName: z.literal(PRODUCTION_SEO_PLAN_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    /** Host of the SOURCE artifacts (artifact pathing only — NOT a production domain claim). */
    sourceHost: z.string(),
    provenance: z.literal("derived"),
    domainState: ProductionDomainStateSchema,
    site: z
      .object({
        siteName: PlannedValueSchema,
        locale: PlannedValueSchema,
        businessFacts: ProductionBusinessFactsSchema,
      })
      .strict(),
    routes: z.array(ProductionRouteSeoSchema),
    /** Intentional differences from the source, documented (not omissions). */
    decisions: z.array(z.object({ id: z.string(), decision: z.string() }).strict()),
  })
  .strict();

export const ForbiddenCopyResultSchema = z
  .object({
    pass: z.boolean(),
    comparisons: z.number().int().nonnegative(),
    violations: z.array(
      z
        .object({ route: z.string(), field: z.string(), value: z.string(), sourceValue: z.string() })
        .strict(),
    ),
  })
  .strict();

export const BrandIsolationResultSchema = z
  .object({
    pass: z.boolean(),
    forbiddenTerms: z.array(z.string()),
    scannedStrings: z.number().int().nonnegative(),
    violations: z.array(
      z.object({ location: z.string(), term: z.string(), excerpt: z.string() }).strict(),
    ),
  })
  .strict();

export const ProductionSeoPlanManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    schemaName: z.literal(PRODUCTION_SEO_PLAN_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    sourceHost: z.string(),
    inputs: z
      .object({
        templateManifestFile: z.string(),
        templateId: z.string(),
        contentRunDir: z.string().nullable(),
        sourceSnapshotDir: z.string(),
        sourceSnapshotRunId: z.string(),
      })
      .strict(),
    domainState: ProductionDomainStateSchema,
    counts: z
      .object({
        routes: z.number().int().nonnegative(),
        contentInjectedRoutes: z.number().int().nonnegative(),
        knownTitles: z.number().int().nonnegative(),
        needsInputTitles: z.number().int().nonnegative(),
        knownDescriptions: z.number().int().nonnegative(),
        needsInputDescriptions: z.number().int().nonnegative(),
        needsInputValues: z.number().int().nonnegative(),
      })
      .strict(),
    checks: z
      .object({
        forbiddenCopy: ForbiddenCopyResultSchema,
        brandIsolation: BrandIsolationResultSchema,
      })
      .strict(),
    files: z
      .object({
        planFile: z.string(),
        robotsFile: z.string(),
        sitemapFile: z.string(),
        renderedHeadFile: z.string(),
        needsInputFile: z.string(),
      })
      .strict(),
  })
  .strict();

export type PlannedValue = z.infer<typeof PlannedValueSchema>;
export type ProductionDomainState = z.infer<typeof ProductionDomainStateSchema>;
export type ProductionBusinessFacts = z.infer<typeof ProductionBusinessFactsSchema>;
export type ProductionRouteSeo = z.infer<typeof ProductionRouteSeoSchema>;
export type ProductionSeoPlan = z.infer<typeof ProductionSeoPlanSchema>;
export type ForbiddenCopyResult = z.infer<typeof ForbiddenCopyResultSchema>;
export type BrandIsolationResult = z.infer<typeof BrandIsolationResultSchema>;
export type ProductionSeoPlanManifest = z.infer<typeof ProductionSeoPlanManifestSchema>;

/** Rendered head artifact: routeKey → what the serve boundary injects. */
export const RenderedHeadSchema = z
  .object({
    schemaVersion: z.literal(1),
    routes: z.array(
      z
        .object({
          route: z.string(),
          /** The title the app would otherwise serve (from route-map.json) — needed to rewrite flight payloads. */
          upstreamTitle: z.string().nullable(),
          title: z.string(),
          headHtml: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export type RenderedHead = z.infer<typeof RenderedHeadSchema>;
