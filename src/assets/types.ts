/**
 * Task 22 — Asset & Font Independence Foundation.
 *
 * Two schema families, both versioned, both additive:
 *
 *   asset-inventory-v1        WHAT the accepted lineage references (assets,
 *                             head assets, CSS url() refs, fonts) — read from
 *                             stored artifacts only, plus one bounded opt-in
 *                             live fetch for @font-face CSS (recorded as such).
 *   asset-materialization-v1  WHAT was actually fetched, hashed and rewritten —
 *                             every entry carries an explicit status; nothing
 *                             is invented for entries that were not fetched.
 *
 * License rule (Task 22 G): a font is NEVER marked self-hostable unless its
 * open license was verified. No verification mechanism exists in this repo,
 * so every font is `license-needs-review` by construction.
 */
import { z } from "zod";

export const ASSET_SCHEMA_VERSION = 1;
export const ASSET_INVENTORY_SCHEMA_NAME = "asset-inventory-v1";
export const ASSET_MATERIALIZATION_SCHEMA_NAME = "asset-materialization-v1";
export const ASSET_REPLACEMENT_SCHEMA_NAME = "asset-replacement-manifest-v1";
export const FONT_INVENTORY_SCHEMA_NAME = "font-inventory-v1";

/* ------------------------------------------------------------------ *
 * Classification (Task 22 E) — conservative by construction.
 * ------------------------------------------------------------------ */

export const AssetClassificationSchema = z.enum([
  /** May be fetched, stored and served as-is (decorative / evidence says brand-neutral). */
  "safe-to-materialize",
  /**
   * Fetched and served locally so the runtime dependency dies, but flagged
   * in the replacement manifest: an operator should supply a replacement.
   */
  "replacement-recommended",
  /**
   * NEVER auto-fetched: source brand marks (logos, favicon, social cards),
   * photos of real people, customer-identity assets, branded product
   * screenshots with an explicit misrepresentation warning.
   */
  "replacement-required",
  /** Fonts and anything whose license is unknown. Never self-hosted. */
  "license-needs-review",
]);
export type AssetClassification = z.infer<typeof AssetClassificationSchema>;

export const ClassificationDecisionSchema = z
  .object({
    inventoryId: z.string(),
    url: z.string().nullable(),
    classification: AssetClassificationSchema,
    /** Deterministic rule that decided (e.g. "brand-filename", "image-brief-warning"). */
    ruleId: z.string(),
    evidence: z.array(z.string()),
  })
  .strict();
export type ClassificationDecision = z.infer<typeof ClassificationDecisionSchema>;

/* ------------------------------------------------------------------ *
 * Asset inventory (Task 22 A)
 * ------------------------------------------------------------------ */

export const AssetInventoryEntrySchema = z
  .object({
    inventoryId: z.string(), // ai000001…
    /** Where this reference was found. */
    origin: z.enum([
      "asset-catalog", // SiteSpec asset-catalog.json
      "generated-css-url", // url() inside the generated stylesheet
      "head-favicon", // <link rel*=icon> in stored rendered.html
      "head-og-image", // og:image / twitter:image in stored rendered.html
      "head-font-preload", // <link as="font"> in stored rendered.html
    ]),
    /** Catalog kind (image / image-srcset / picture-source / inline-svg / icon / source / background-image) or a head kind. */
    kind: z.string(),
    assetId: z.string().nullable(), // asset-catalog id where applicable
    url: z.string().nullable(), // inline-svg entries have none
    host: z.string().nullable(),
    mimeHint: z.string().nullable(),
    usageCount: z.number(),
    sourcePageIds: z.array(z.string()),
    /** True when the Observer's attribute cap truncated the URL — unfetchable, recorded honestly. */
    truncated: z.boolean(),
    /** Template image-slot keys whose default src/srcset reference this URL. */
    slotKeys: z.array(z.string()),
    /** Joined Task 19 image brief (by slot key), when one exists. */
    imageBrief: z
      .object({
        slotKey: z.string(),
        action: z.string(),
        warning: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AssetInventoryEntry = z.infer<typeof AssetInventoryEntrySchema>;

export const AssetInventorySchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(ASSET_INVENTORY_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    sourceHost: z.string(),
    inputs: z
      .object({
        siteSpecDir: z.string(),
        templateRunDir: z.string(),
        contentRunDir: z.string().nullable(),
        observationRunDir: z.string(),
        generatedStylesFile: z.string(),
      })
      .strict(),
    hosts: z.array(
      z.object({ host: z.string(), assetCount: z.number() }).strict(),
    ),
    counts: z
      .object({
        entries: z.number(),
        urlEntries: z.number(),
        inlineSvgEntries: z.number(),
        truncatedEntries: z.number(),
        /** Fragment-only css url(#…) refs skipped at ingestion (Task 24 GED-C).
         *  Optional so pre-fix inventory artifacts still load. */
        fragmentRefsSkipped: z.number().optional(),
        catalogAssets: z.number(),
        cssUrlRefs: z.number(),
        headFavicons: z.number(),
        headOgImages: z.number(),
        fontPreloads: z.number(),
        slotJoinedEntries: z.number(),
        imageBriefJoinedEntries: z.number(),
        byClassification: z.record(z.string(), z.number()),
      })
      .strict(),
    entries: z.array(AssetInventoryEntrySchema),
  })
  .strict();
export type AssetInventory = z.infer<typeof AssetInventorySchema>;

/* ------------------------------------------------------------------ *
 * Font inventory (Task 22 F/G)
 * ------------------------------------------------------------------ */

export const FontFaceRuleSchema = z
  .object({
    family: z.string(),
    src: z.array(
      z.object({ url: z.string(), format: z.string().nullable() }).strict(),
    ),
    weight: z.string().nullable(),
    style: z.string().nullable(),
    display: z.string().nullable(),
    /** Which fetched stylesheet declared it (URL) — provenance `live-fetched`. */
    declaredIn: z.string(),
  })
  .strict();
export type FontFaceRule = z.infer<typeof FontFaceRuleSchema>;

export const FontInventorySchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(FONT_INVENTORY_SCHEMA_NAME),
    /** Font file URLs observed in stored rendered.html preload links. */
    fontUrls: z.array(
      z
        .object({
          url: z.string(),
          host: z.string(),
          typeHint: z.string().nullable(), // e.g. font/woff2 from the preload link
          pageIds: z.array(z.string()),
          evidence: z.literal("rendered-html-font-preload"),
        })
        .strict(),
    ),
    /**
     * @font-face rules. Empty when --live-font-css was not passed: the rules
     * live in EXTERNAL source CSS that no stored artifact carries, and we do
     * not invent them.
     */
    fontFaceRules: z.array(FontFaceRuleSchema),
    fontFaceProvenance: z.enum(["live-fetched", "not-fetched"]),
    fontFaceFetchedAt: z.string().nullable(),
    fetchedStylesheets: z.array(
      z
        .object({
          url: z.string(),
          httpStatus: z.number(),
          fontFaceCount: z.number(),
        })
        .strict(),
    ),
    /** font-family usage measured over the generated stylesheet (the clone's actual style truth). */
    familyUsage: z.array(
      z
        .object({
          family: z.string(),
          declarationCount: z.number(),
          /** Distinct full stacks this family leads, with counts. */
          stacks: z.array(
            z.object({ stack: z.string(), count: z.number() }).strict(),
          ),
          /** True when no @font-face for it exists in the generated app (renders fallback today). */
          webfontUndefinedInClone: z.boolean(),
        })
        .strict(),
    ),
    /** License verdicts — no guessing. */
    license: z.array(
      z
        .object({
          family: z.string(),
          status: z.enum(["license-needs-review", "open-license-verified"]),
          reason: z.string(),
          selfHostApproved: z.boolean(),
        })
        .strict(),
    ),
    /** Fallback plan per webfont family, derived from observed stacks. */
    fallbackPlan: z.array(
      z
        .object({
          family: z.string(),
          fallbackStack: z.string(),
          basis: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type FontInventory = z.infer<typeof FontInventorySchema>;

/* ------------------------------------------------------------------ *
 * Inventory run manifest
 * ------------------------------------------------------------------ */

export const AssetInventoryManifestSchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(ASSET_INVENTORY_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    sourceHost: z.string(),
    files: z
      .object({
        inventory: z.string(),
        classification: z.string(),
        fontInventory: z.string(),
      })
      .strict(),
    counts: z.record(z.string(), z.number()),
  })
  .strict();
export type AssetInventoryManifest = z.infer<typeof AssetInventoryManifestSchema>;

/* ------------------------------------------------------------------ *
 * Safe fetch (Task 22 B)
 * ------------------------------------------------------------------ */

export type SafeFetchStatus =
  | "fetched"
  | "rejected-scheme"
  | "rejected-credentials"
  | "rejected-port"
  | "rejected-host-not-allowed"
  | "rejected-private-address"
  | "rejected-redirect"
  | "too-many-redirects"
  | "too-large"
  | "mime-rejected"
  | "http-error"
  | "timeout"
  | "network-error";

export interface SafeFetchResult {
  status: SafeFetchStatus;
  url: string;
  httpStatus: number | null;
  mime: string | null;
  bytes: number | null;
  body: Buffer | null;
  redirectChain: string[];
  detail: string | null;
}

/* ------------------------------------------------------------------ *
 * Materialization run (Task 22 C/D)
 * ------------------------------------------------------------------ */

export const MaterializedEntrySchema = z
  .object({
    inventoryId: z.string(),
    sourceUrl: z.string(),
    classification: AssetClassificationSchema,
    status: z.string(), // SafeFetchStatus | "skipped-<classification>" | "skipped-truncated"
    httpStatus: z.number().nullable(),
    mime: z.string().nullable(),
    size: z.number().nullable(),
    sha256: z.string().nullable(),
    localPath: z.string().nullable(), // "/media/<sha256>.<ext>"
    redirectChain: z.array(z.string()),
  })
  .strict();
export type MaterializedEntry = z.infer<typeof MaterializedEntrySchema>;

export const RewriteMapSchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    entries: z.array(
      z
        .object({
          sourceUrl: z.string(),
          localPath: z.string(),
          contexts: z.array(z.enum(["html", "css"])),
        })
        .strict(),
    ),
  })
  .strict();
export type RewriteMap = z.infer<typeof RewriteMapSchema>;

export const AssetMaterializationManifestSchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(ASSET_MATERIALIZATION_SCHEMA_NAME),
    runId: z.string(),
    createdAt: z.string(),
    sourceHost: z.string(),
    inventoryRunDir: z.string(),
    policy: z
      .object({
        timeoutMs: z.number(),
        maxBytes: z.number(),
        maxRedirects: z.number(),
        concurrency: z.number(),
        allowedHosts: z.array(z.string()),
        materializedClassifications: z.array(AssetClassificationSchema),
      })
      .strict(),
    counts: z
      .object({
        candidates: z.number(),
        fetched: z.number(),
        skippedByClassification: z.number(),
        skippedTruncated: z.number(),
        failed: z.number(),
        uniqueFiles: z.number(),
        totalBytes: z.number(),
        rewriteEntries: z.number(),
      })
      .strict(),
    files: z
      .object({
        rewriteMap: z.string(),
        replacementManifest: z.string(),
        mediaDir: z.string(),
      })
      .strict(),
    entries: z.array(MaterializedEntrySchema),
  })
  .strict();
export type AssetMaterializationManifest = z.infer<
  typeof AssetMaterializationManifestSchema
>;

/* ------------------------------------------------------------------ *
 * Replacement seam (Task 22 J) — connects to Task 19 imageBrief.
 * ------------------------------------------------------------------ */

export const ReplacementEntrySchema = z
  .object({
    inventoryId: z.string(),
    sourceUrl: z.string().nullable(),
    classification: AssetClassificationSchema,
    slotKeys: z.array(z.string()),
    imageBrief: z
      .object({
        slotKey: z.string(),
        action: z.string(),
        warning: z.string().nullable(),
      })
      .strict()
      .nullable(),
    /**
     * Operator seam: set status "provided" + a file path (copied under
     * media/) to replace this asset in a FUTURE materialization run.
     * Nothing in this repo generates images.
     */
    replacement: z
      .object({
        status: z.enum(["awaiting-input", "provided"]),
        providedFile: z.string().nullable(),
        providedBy: z.string().nullable(),
      })
      .strict(),
    note: z.string(),
  })
  .strict();
export type ReplacementEntry = z.infer<typeof ReplacementEntrySchema>;

export const ReplacementManifestSchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(ASSET_REPLACEMENT_SCHEMA_NAME),
    entries: z.array(ReplacementEntrySchema),
  })
  .strict();
export type ReplacementManifest = z.infer<typeof ReplacementManifestSchema>;

/* ------------------------------------------------------------------ *
 * Cross-route residual source-asset report (Task 27 GED-G)
 *
 * The census (report/network-qa.json) already measures per-route runtime
 * requests; this schema is the JOIN of that measurement with the inventory
 * (identity) and the replacement manifest (requirement), reported per FILE
 * across every measured route.
 *
 * It adds RENDER PRIORITIZATION only — where a residual file actually shows
 * up and how often. `replacement` is READ from replacement-manifest.json and
 * cited by path; this artifact never derives a replacement verdict of its own.
 * ------------------------------------------------------------------ */

export const ASSET_RESIDUAL_REPORT_SCHEMA_NAME = "asset-residual-report-v1";

/** Which routes a census covered, and where that route list came from. */
export const CensusRouteScopeSchema = z
  .object({
    source: z.enum([
      "explicit-routes", // operator passed --routes
      "template-site-map", // <template-run>/site-map.json (the default)
      "fallback-root", // site-map unreadable — honest single-route fallback
    ]),
    routes: z.array(z.string()),
    siteMapFile: z.string().nullable(),
    /** Routes the site map declared, before any --max-routes truncation. */
    siteMapRouteCount: z.number().nullable(),
    truncatedTo: z.number().nullable(),
    /**
     * The raw --routes value when it parsed to ZERO routes and was therefore
     * NOT the scope. Null whenever the override was absent or was honoured —
     * a discarded override must never leave the scope provenance reading as
     * though the operator had said nothing.
     */
    discardedExplicitRoutes: z.string().nullable().default(null),
    note: z.string(),
  })
  .strict();
export type CensusRouteScope = z.infer<typeof CensusRouteScopeSchema>;

export const ResidualRouteHitSchema = z
  .object({ route: z.string(), occurrences: z.number() })
  .strict();
export type ResidualRouteHit = z.infer<typeof ResidualRouteHitSchema>;

export const ResidualAssetFileSchema = z
  .object({
    /** Request URL with the fragment stripped; the query is KEPT (CDN transforms are distinct files). */
    url: z.string(),
    /** URL.hostname — no port, matching how the inventory records its hosts. */
    host: z.string(),
    /** Rendered routes this file was requested on, with per-route occurrence counts. */
    routes: z.array(ResidualRouteHitSchema),
    routeCount: z.number(),
    occurrences: z.number(),
    /** Exact-URL join into the inventory — null when no entry carries this URL (never guessed). */
    inventoryId: z.string().nullable(),
    assetId: z.string().nullable(),
    slotKeys: z.array(z.string()),
    /** Read from replacement-manifest.json, which stays authoritative. */
    replacement: z
      .object({
        inManifest: z.boolean(),
        classification: AssetClassificationSchema.nullable(),
        status: z.enum(["awaiting-input", "provided"]).nullable(),
        providedFile: z.string().nullable(),
        note: z.string().nullable(),
        manifestFile: z.string(),
      })
      .strict(),
    /** Artifact path + record refs backing every field above. */
    evidence: z.array(z.string()),
  })
  .strict();
export type ResidualAssetFile = z.infer<typeof ResidualAssetFileSchema>;

export const ResidualAssetReportSchema = z
  .object({
    schemaVersion: z.literal(ASSET_SCHEMA_VERSION),
    schemaName: z.literal(ASSET_RESIDUAL_REPORT_SCHEMA_NAME),
    createdAt: z.string(),
    sourceHost: z.string(),
    routeScope: CensusRouteScopeSchema,
    inputs: z
      .object({
        networkQaFile: z.string(),
        inventoryFile: z.string(),
        replacementManifestFile: z.string(),
      })
      .strict(),
    counts: z
      .object({
        routesMeasured: z.number(),
        routesWithResidual: z.number(),
        residualFiles: z.number(),
        residualOccurrences: z.number(),
        joinedToInventory: z.number(),
        unjoinedToInventory: z.number(),
        inReplacementManifest: z.number(),
        notInReplacementManifest: z.number(),
        /**
         * Files a "/"-only census would never have seen — the GED-G defect,
         * quantified. NULL when "/" was not itself measured: with no root
         * measurement "no hit on /" is unobserved, not observed-absent.
         */
        invisibleAtRootOnly: z.number().nullable(),
      })
      .strict(),
    byHost: z.record(z.string(), z.number()),
    /** Prioritized: most-rendered first. */
    files: z.array(ResidualAssetFileSchema),
  })
  .strict();
export type ResidualAssetReport = z.infer<typeof ResidualAssetReportSchema>;
