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

import type { BrandBakeReport } from "./brand-bake.js";
import type { BrandFlightCounts, BrandSurfaceCensus } from "./brand-census.js";

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
}).superRefine((spec, ctx) => {
  // Task 28 Phase 10: the mode-rules pair, enforced STRUCTURALLY and not only
  // by orchestration (src/release/freshness.ts `applyBlocking`). A spec that
  // claims `indexable` while still naming blockers is a serious defect (a
  // convenience, per the program contract, never acceptable) — this refinement
  // makes that shape unparseable so a future caller cannot construct one, not
  // only reject one that slipped through the release gate.
  if (spec.indexabilityGate.decision === "indexable" && spec.indexabilityGate.blockers.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["indexabilityGate", "blockers"],
      message:
        `indexabilityGate.decision is "indexable" but ${spec.indexabilityGate.blockers.length} blocker(s) are ` +
        "still named — an indexable production spec must carry zero blockers (production mode is indexable ONLY " +
        "after every one clears; a spec that is indexable WHILE blockers remain is refused at the schema, not just the gate)",
    });
  }
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
  /**
   * Source-brand surface census over THIS bake's exported route HTML
   * (Task 28 CR7). Measured by `postProcessExport` after the head splice and
   * the asset rewrite — the bake output itself, so a later phase that resolves
   * a source brand asset can prove from the BUILD (not from a QA run against a
   * different artifact) that a surface count moved. Never copied from another
   * run's census; a route with no exported HTML is omitted rather than zeroed.
   */
  brand: {
    measuredOn: "static-export-route-html";
    measurementNote: string;
    census: BrandSurfaceCensus;
    /**
     * The RSC FLIGHT axis (Task 28 Phase 2). `census` above reads only the SSR
     * markup; a Next static export ships the same inline SVG again inside the
     * `.txt` flight files and again inside the `self.__next_f.push` chunks
     * inlined in each HTML, in two further escapings the markup regexes cannot
     * match. Without this axis a markup-only rewrite would report a census of
     * 0 while the flight still carried the source brand — and the flight wins
     * on hydration, because the inline SVG arrives through
     * `dangerouslySetInnerHTML`. Measured, never asserted, here.
     */
    flight: BrandFlightCounts & { txtFiles: number; htmlDocuments: number };
    /**
     * What the bake-time brand resolver actually did to the page IR of THIS
     * build, and what is left. `null` when no resolver ran (no decisions and
     * no fallback), which is not the same as "nothing was found".
     */
    bake: BrandBakeReport | null;
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
