/**
 * ProductionSpec & production build types (Task 23).
 *
 * `production-spec-v1` is the single reproducible record that names WHICH
 * accepted artifact of every layer (template / content / theme / SEO /
 * assets) a production candidate was compiled from, each pinned by a
 * dir-sha256-v1 hash over the actual artifact files. Nothing in here copies
 * layer content — the spec is lineage + decisions, the build is the bake.
 */
import { z } from "zod";

export const PRODUCTION_SPEC_SCHEMA_NAME = "production-spec-v1";
export const PRODUCTION_COMPILER_NAME = "web-recon-production-compiler";
export const PRODUCTION_COMPILER_VERSION = 1;

const hashedLineageSchema = z.object({
  dir: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  fileCount: z.number().int().nonnegative(),
  byteCount: z.number().int().nonnegative(),
  excluded: z.array(z.string()),
});

export const productionSpecSchema = z.object({
  schemaVersion: z.literal(1),
  schemaName: z.literal(PRODUCTION_SPEC_SCHEMA_NAME),
  runId: z.string(),
  createdAt: z.string(),
  sourceHost: z.string(),
  compiler: z.object({
    name: z.literal(PRODUCTION_COMPILER_NAME),
    version: z.number().int(),
    hashMethod: z.string(),
    hashMethodDescription: z.string(),
  }),
  lineage: z.object({
    template: hashedLineageSchema.extend({
      templateId: z.string(),
      slotSchemaVersion: z.number().int(),
    }),
    contentRun: hashedLineageSchema.extend({
      contentRunId: z.string(),
      slotValueCount: z.number().int().nonnegative(),
    }),
    theme: hashedLineageSchema.extend({
      themeRunId: z.string(),
      themeId: z.string(),
      themeName: z.string(),
      themeMode: z.string(),
      adapterVersion: z.number().int(),
      adapterSourceFile: z.string(),
    }),
    seoPlan: hashedLineageSchema.extend({
      seoPlanRunId: z.string(),
      mode: z.enum(["preview", "production"]),
      routeCount: z.number().int().nonnegative(),
      needsInputCount: z.number().int().nonnegative(),
    }),
    assets: hashedLineageSchema.extend({
      materializationRunId: z.string(),
      inventoryRunDir: z.string(),
      mediaFileCount: z.number().int().nonnegative(),
      rewriteEntryCount: z.number().int().nonnegative(),
      replacementManifestEntryCount: z.number().int().nonnegative(),
    }),
  }),
  baseUrl: z.object({
    value: z.string().nullable(),
    status: z.enum(["needs-input", "provided"]),
    mode: z.enum(["preview", "production"]),
    basis: z.string(),
  }),
  buildMode: z.object({
    chosen: z.enum(["static-export", "standalone-server"]),
    reason: z.string(),
    behaviorDeltas: z.array(z.string()),
  }),
  indexabilityGate: z.object({
    decision: z.enum(["preview", "indexable"]),
    robotsPolicy: z.string(),
    blockers: z.array(
      z.object({
        id: z.string(),
        summary: z.string(),
        evidence: z.string(),
      }),
    ),
  }),
  buildRunId: z.string(),
});

export type ProductionSpec = z.infer<typeof productionSpecSchema>;

/** Per-layer bake accounting, written to the build's report/bake-report.json. */
export interface BakeReport {
  content: {
    bakedSlotValuesFile: string;
    overlayKeyCount: number;
    unknownOverlayKeys: string[];
    slotContentPatched: boolean;
  };
  theme: {
    themeOverlayFile: string;
    overlayBytes: number;
    layoutPatched: boolean;
  };
  seo: {
    routeTitlesBaked: number;
    titleGuardMismatches: Array<{ route: string; routeMapTitle: string; planUpstreamTitle: string | null }>;
    headBlocksSpliced: number;
    headSpliceFailures: string[];
    titleVerifiedRoutes: number;
    robotsTxtBytes: number;
    sitemapPolicy: string;
  };
  assets: {
    mediaFilesCopied: number;
    mediaBytes: number;
    rewrite: {
      htmlFiles: number;
      htmlReplacedOccurrences: number;
      flightFiles: number;
      flightReplacedOccurrences: number;
      cssFiles: number;
      cssReplacedOccurrences: number;
    };
    residualSourceUrlOccurrencesInSite: number;
  };
  build: {
    mode: "static-export";
    nextBuildMs: number;
    routeHtmlFiles: number;
    siteFileCount: number;
    siteBytes: number;
  };
}

/** deploy-manifest.json inside the deployment package — everything QA needs
 *  to exercise the package WITHOUT reading any run directory. */
export interface DeployManifest {
  schemaName: "production-deploy-manifest-v1";
  schemaVersion: 1;
  specRunId: string;
  buildRunId: string;
  sourceHost: string;
  siteName: string;
  mode: "preview" | "production";
  robotsPolicy: string;
  routes: Array<{
    route: string;
    htmlFile: string;
    expectedTitle: string;
    headMarker: string;
  }>;
  themeId: string;
  themeOverlayPath: string;
  mediaFileCount: number;
  contentProof: Array<{ slotKey: string; value: string }>;
  knownResidualSourceHosts: string[];
  blockers: string[];
}
