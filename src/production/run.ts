/**
 * Production compile orchestration (Task 23).
 *
 * ONE run compiles the accepted lineage into TWO new namespaces:
 *
 *   production-specs/<run-id>/production-spec.json   the reproducible spec
 *   production-builds/<run-id>/                       app copy + package
 *
 * The spec pins every consumed artifact by id AND dir-sha256-v1 hash before
 * anything is baked, so the build is reproducible from named, verified
 * inputs. All lineage directories are read-only inputs — never modified.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RewriteMap } from "../assets/types.js";
import {
  bakeContent,
  bakeSeoTitles,
  bakeTheme,
  buildStaticExport,
  convertToStaticExport,
  copyMedia,
  copyTemplateApp,
  directoryStats,
  postProcessExport,
  routeHtmlFile,
  type RenderedHeadRoute,
} from "./bake.js";
import { hashDirectory, HASH_METHOD, HASH_METHOD_DESCRIPTION } from "./hash.js";
import { assemblePackage } from "./packaging.js";
import { THEME_OVERLAY_HREF } from "./patch.js";
import { newProductionRunId, productionBuildDir, productionSpecDir } from "./store.js";
import {
  PRODUCTION_COMPILER_NAME,
  PRODUCTION_COMPILER_VERSION,
  PRODUCTION_SPEC_SCHEMA_NAME,
  productionSpecSchema,
  type BakeReport,
  type DeployManifest,
  type ProductionSpec,
} from "./types.js";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

/** Deterministic injected-content proof for QA: static desktop text slots on
 *  the given page whose baked value DIFFERS from the template default. */
export function pickContentProof(
  slots: { slots: Array<{ id: string; key: string }> },
  bindings: { bindings: Array<{ slotId: string; pageId: string; viewport: string; surface: string; target: string }> },
  defaults: Record<string, unknown>,
  overlay: Record<string, unknown>,
  pageId: string,
  count: number,
): Array<{ slotKey: string; value: string }> {
  const keyById = new Map(slots.slots.map((slot) => [slot.id, slot.key]));
  const staticTextKeys = new Set<string>();
  for (const binding of bindings.bindings) {
    if (binding.pageId !== pageId) continue;
    if (binding.surface !== "static" || binding.target !== "text") continue;
    if (binding.viewport !== "desktop") continue;
    const key = keyById.get(binding.slotId);
    if (key !== undefined) staticTextKeys.add(key);
  }
  const proofs: Array<{ slotKey: string; value: string }> = [];
  for (const key of [...staticTextKeys].sort()) {
    const value = overlay[key];
    if (typeof value !== "string") continue;
    if (value.length < 10 || value.length > 120) continue;
    if (/[&<>]/.test(value)) continue; // avoid HTML-escaping ambiguity in the check
    if (value === defaults[key]) continue; // must PROVE injection, not defaults
    proofs.push({ slotKey: key, value });
    if (proofs.length >= count) break;
  }
  return proofs;
}

/** Everything a preview-mode blocker summary may cite — derived per site from
 *  the SAME in-scope artifacts the evidence paths point at, never hardcoded
 *  (Task 24 GED-B: non-stripe specs used to carry stripe's literals). */
export interface PreviewBlockerInputs {
  seoPlanRunId: string;
  domainStatus: string;
  needsInputTotal: number;
  /** Routes whose main title is needs-input (serves the brand-only fallback). */
  fallbackTitleRouteCount: number;
  routeCount: number;
  materializationRunId: string;
  inventoryRunDir: string;
  replacementRequiredCount: number;
  replacementManifestEntryCount: number;
  /** Source-host asset URLs the network census still saw rendering. */
  residualRenderedUrlCount: number;
  /** Webfont families whose license is unverified (font inventory). */
  webfontFamilies: string[];
  contentRunId: string;
  /** Routes the content run injected (its scopedRoutes). */
  injectedRoutes: string[];
  inlineSvgEntryCount: number;
}

export function buildPreviewBlockers(
  inputs: PreviewBlockerInputs,
): Array<{ id: string; summary: string; evidence: string }> {
  const uninjectedRouteCount = inputs.routeCount - inputs.injectedRoutes.length;
  const blockers = [
    {
      id: "production-domain-needs-input",
      summary: "no production domain — canonical/og:url/absolute sitemap/index-robots cannot be finalized",
      evidence: `seo plan ${inputs.seoPlanRunId} domainState.productionDomain.status=${inputs.domainStatus}`,
    },
    {
      id: "seo-needs-input-values",
      summary: `${inputs.needsInputTotal} SEO values are needs-input (${inputs.fallbackTitleRouteCount}/${inputs.routeCount} route titles serve the brand-only fallback)`,
      evidence: `production-seo-plans/${inputs.seoPlanRunId}/report/needs-input.json total=${inputs.needsInputTotal}`,
    },
    {
      id: "replacement-required-assets",
      summary: `${inputs.replacementRequiredCount} replacement-required assets were never fetched by policy; ${inputs.residualRenderedUrlCount} source-host asset URLs still render in the network census`,
      evidence: `asset-materializations/${inputs.materializationRunId}/replacement-manifest.json (${inputs.replacementManifestEntryCount} entries) + report/network-qa.json residual=${inputs.residualRenderedUrlCount}`,
    },
    {
      id: "fonts-license-needs-review",
      summary: `no font is self-hosted (${inputs.webfontFamilies.length > 0 ? inputs.webfontFamilies.join(" / ") : "no webfont families observed"} licenses unverified); measured fallback stacks render`,
      evidence: `asset inventory ${inputs.inventoryRunDir} font classification license-needs-review`,
    },
    {
      id: "business-facts-needs-input",
      summary: "address/phone/prices/reviews/ratings/foundingDate/sameAs all absent — JSON-LD carries no invented facts",
      evidence: `seo plan ${inputs.seoPlanRunId} site.businessFacts all needs-input`,
    },
    {
      id: "uninjected-route-content",
      summary: `${uninjectedRouteCount} of ${inputs.routeCount} routes still carry source body content (content run scope is ${inputs.injectedRoutes.join(", ")})`,
      evidence: `content run ${inputs.contentRunId} scope + seo plan needs-input titles`,
    },
    {
      id: "source-brand-inline-svg",
      summary: "inline-SVG brand marks (incl. the source logo) remain in template markup — template-layer limitation",
      evidence: `asset inventory: ${inputs.inlineSvgEntryCount} inline-svg entries are outside the asset layer (Task 22 report)`,
    },
  ];
  // A blocker must describe a real gap: with every route content-injected the
  // uninjected-route-content entry would claim "0 of N routes" — that is not a
  // blocker, and emitting it would overstate what is missing.
  return uninjectedRouteCount === 0
    ? blockers.filter((blocker) => blocker.id !== "uninjected-route-content")
    : blockers;
}

export interface CompileOptions {
  host: string;
  templateRunDir: string;
  contentRunDir: string;
  themeRunDir: string;
  seoPlanRunDir: string;
  materializationRunDir: string;
  runId?: string;
  log?: (line: string) => void;
}

export interface CompileResult {
  runId: string;
  specDir: string;
  specFile: string;
  buildDir: string;
  packageDir: string;
  siteDir: string;
  spec: ProductionSpec;
  bakeReport: BakeReport;
}

export async function runProductionCompile(options: CompileOptions): Promise<CompileResult> {
  const log = options.log ?? ((): void => {});
  const runId = options.runId ?? newProductionRunId();
  const specDir = productionSpecDir(options.host, runId);
  const buildDir = productionBuildDir(options.host, runId);

  // ---- 1. read lineage manifests (inputs are read-only) --------------------
  const templateManifest = await readJson<{
    templateId: string;
    slotSchemaVersion: number;
  }>(path.join(options.templateRunDir, "manifest.json"));
  const contentManifest = await readJson<{ runId: string; scopedRoutes?: string[] }>(
    path.join(options.contentRunDir, "manifest.json"),
  );
  const themeManifest = await readJson<{
    runId: string;
    themeId: string;
    themeName: string;
    themeMode: string;
    adapterVersion: number;
    adapterSourceFile: string;
  }>(path.join(options.themeRunDir, "manifest.json"));
  const seoPlan = await readJson<{
    runId: string;
    domainState: { mode: "preview" | "production"; productionDomain: { value: string | null; status: string; basis: string } };
    site: { siteName: { value: string | null } };
    routes: Array<{ route: string }>;
  }>(path.join(options.seoPlanRunDir, "production-seo-plan.json"));
  const renderedHead = await readJson<{ routes: RenderedHeadRoute[] }>(
    path.join(options.seoPlanRunDir, "rendered-head.json"),
  );
  const needsInput = await readJson<{ total: number; entries: Array<{ location: string }> }>(
    path.join(options.seoPlanRunDir, "report", "needs-input.json"),
  );
  const materializationManifest = await readJson<{
    runId: string;
    inventoryRunDir: string;
    counts: { uniqueFiles: number; rewriteEntries: number };
  }>(path.join(options.materializationRunDir, "manifest.json"));
  const rewriteMap = await readJson<RewriteMap>(
    path.join(options.materializationRunDir, "rewrite-map.json"),
  );
  const replacementManifest = await readJson<{ entries: Array<{ classification: string }> }>(
    path.join(options.materializationRunDir, "replacement-manifest.json"),
  );
  // Blocker-summary inputs (GED-B): read from the same lineage artifacts the
  // evidence strings cite, so every number/name in the prose is this site's.
  const inventoryManifest = await readJson<{ counts: Record<string, number> }>(
    path.join(materializationManifest.inventoryRunDir, "manifest.json"),
  );
  const fontInventory = await readJson<{ license: Array<{ family: string }> }>(
    path.join(materializationManifest.inventoryRunDir, "font-inventory.json"),
  );
  const slotValues = await readJson<Record<string, unknown>>(
    path.join(options.contentRunDir, "slot-values.json"),
  );
  const robotsTxt = await readFile(path.join(options.seoPlanRunDir, "robots.txt"), "utf8");
  // Task 22's measured residual: hosts still requested at runtime by
  // replacement-required surfaces (derived from evidence, never hardcoded).
  const networkQa = await readJson<{
    independent: Array<{ sourceUrls: string[] }>;
    totals: { residualSourceUrls: string[] };
  }>(path.join(options.materializationRunDir, "report", "network-qa.json"));
  const knownResidualSourceHosts = [
    ...new Set(
      networkQa.independent.flatMap((entry) => entry.sourceUrls.map((url) => new URL(url).host)),
    ),
  ].sort();

  if (seoPlan.domainState.mode !== "preview") {
    log("[production] seo plan is in production mode — indexable build path");
  }

  // ---- 2. hash lineage (over the actual artifact files) --------------------
  log("[production] hashing lineage artifacts (dir-sha256-v1)...");
  const templateHash = await hashDirectory(options.templateRunDir, ["node_modules", ".next", "out"]);
  const contentHash = await hashDirectory(options.contentRunDir);
  const themeHash = await hashDirectory(options.themeRunDir);
  const seoHash = await hashDirectory(options.seoPlanRunDir);
  const assetHash = await hashDirectory(options.materializationRunDir);

  // ---- 3. indexability gate -------------------------------------------------
  const mode = seoPlan.domainState.mode;
  const blockers =
    mode === "preview"
      ? buildPreviewBlockers({
          seoPlanRunId: seoPlan.runId,
          domainStatus: seoPlan.domainState.productionDomain.status,
          needsInputTotal: needsInput.total,
          fallbackTitleRouteCount: needsInput.entries.filter((entry) =>
            /^routes\[[^\]]*\]\.title$/.test(entry.location),
          ).length,
          routeCount: seoPlan.routes.length,
          materializationRunId: materializationManifest.runId,
          inventoryRunDir: materializationManifest.inventoryRunDir,
          replacementRequiredCount: replacementManifest.entries.filter(
            (entry) => entry.classification === "replacement-required",
          ).length,
          replacementManifestEntryCount: replacementManifest.entries.length,
          residualRenderedUrlCount: networkQa.totals.residualSourceUrls.length,
          webfontFamilies: fontInventory.license.map((license) => license.family),
          contentRunId: contentManifest.runId,
          injectedRoutes: contentManifest.scopedRoutes ?? [],
          inlineSvgEntryCount: inventoryManifest.counts.inlineSvgEntries ?? 0,
        })
      : [];

  // ---- 4. ProductionSpec (written BEFORE the bake; the bake consumes it) ----
  const spec: ProductionSpec = {
    schemaVersion: 1,
    schemaName: PRODUCTION_SPEC_SCHEMA_NAME,
    runId,
    createdAt: new Date().toISOString(),
    sourceHost: options.host,
    compiler: {
      name: PRODUCTION_COMPILER_NAME,
      version: PRODUCTION_COMPILER_VERSION,
      hashMethod: HASH_METHOD,
      hashMethodDescription: HASH_METHOD_DESCRIPTION,
    },
    lineage: {
      template: {
        templateId: templateManifest.templateId,
        slotSchemaVersion: templateManifest.slotSchemaVersion,
        dir: options.templateRunDir,
        ...templateHash,
      },
      contentRun: {
        contentRunId: contentManifest.runId,
        slotValueCount: Object.keys(slotValues).length,
        dir: options.contentRunDir,
        ...contentHash,
      },
      theme: {
        themeRunId: themeManifest.runId,
        themeId: themeManifest.themeId,
        themeName: themeManifest.themeName,
        themeMode: themeManifest.themeMode,
        adapterVersion: themeManifest.adapterVersion,
        adapterSourceFile: themeManifest.adapterSourceFile,
        dir: options.themeRunDir,
        ...themeHash,
      },
      seoPlan: {
        seoPlanRunId: seoPlan.runId,
        mode,
        routeCount: seoPlan.routes.length,
        needsInputCount: needsInput.total,
        dir: options.seoPlanRunDir,
        ...seoHash,
      },
      assets: {
        materializationRunId: materializationManifest.runId,
        inventoryRunDir: materializationManifest.inventoryRunDir,
        mediaFileCount: materializationManifest.counts.uniqueFiles,
        rewriteEntryCount: materializationManifest.counts.rewriteEntries,
        replacementManifestEntryCount: replacementManifest.entries.length,
        dir: options.materializationRunDir,
        ...assetHash,
      },
    },
    baseUrl: {
      value: seoPlan.domainState.productionDomain.value,
      status: seoPlan.domainState.productionDomain.value === null ? "needs-input" : "provided",
      mode,
      basis: seoPlan.domainState.productionDomain.basis,
    },
    buildMode: {
      chosen: "static-export",
      reason: `the verified route table is path-only (${seoPlan.routes.length} routes, no query variants), every page renders from data the app already holds at build time, and there are no route handlers / middleware / dynamic APIs — so the whole app prerenders to plain files; a static artifact is the strongest possible form of runtime independence (no Next server, no env, no run directories)`,
      behaviorDeltas: [
        "query strings no longer 404 (static hosts ignore them; the dynamic template app 404'd unknown query-variant keys)",
        "pages are prerendered once at build time instead of per request (content is baked, so responses are byte-identical anyway)",
      ],
    },
    indexabilityGate: {
      decision: mode === "preview" ? "preview" : "indexable",
      robotsPolicy:
        mode === "preview"
          ? "noindex,nofollow on every route; robots.txt Disallow all with no Sitemap line; /sitemap.xml intentionally 404"
          : "per-plan production robots",
      blockers,
    },
    buildRunId: runId,
  };
  productionSpecSchema.parse(spec);
  await writeJson(path.join(specDir, "production-spec.json"), spec);
  log(`[production] spec written: ${path.join(specDir, "production-spec.json")}`);

  // ---- 5. bake ---------------------------------------------------------------
  const appDir = path.join(buildDir, "app");
  await mkdir(buildDir, { recursive: true });
  log("[production] copying template app...");
  await copyTemplateApp(path.join(options.templateRunDir, "app"), appDir);

  const contentBake = await bakeContent(appDir, path.join(options.contentRunDir, "slot-values.json"));
  const themeOverlayBytes = await bakeTheme(appDir, path.join(options.themeRunDir, "theme-overlay.css"));
  const titleBake = await bakeSeoTitles(appDir, renderedHead.routes);
  await convertToStaticExport(appDir);
  const nextBuildMs = await buildStaticExport(appDir, log);

  const outDir = path.join(appDir, "out");
  const media = await copyMedia(path.join(options.materializationRunDir, "media"), outDir);
  const residualHosts = [options.host, ...new Set(rewriteMap.entries.map((entry) => new URL(entry.sourceUrl).host))];
  const post = await postProcessExport(outDir, renderedHead.routes, rewriteMap, robotsTxt, residualHosts);
  if (mode !== "preview") {
    // Indexable path (Task 25): the plan's FINAL sitemap is a served site file
    // (/sitemap.xml, QA-checked), not a package-only plan artifact.
    await copyFile(path.join(options.seoPlanRunDir, "sitemap.xml"), path.join(outDir, "sitemap.xml"));
  }
  post.seo.routeTitlesBaked = titleBake.baked;
  post.seo.titleGuardMismatches = titleBake.mismatches;
  if (titleBake.missingRoutes.length > 0) {
    throw new Error("seo plan routes missing from route map: " + titleBake.missingRoutes.join(", "));
  }

  // ---- 6. package -------------------------------------------------------------
  const siteStats = await directoryStats(outDir);
  const defaults = await readJson<{ values: Record<string, unknown> }>(
    path.join(options.templateRunDir, "default-content.json"),
  );
  const slots = await readJson<{ slots: Array<{ id: string; key: string }> }>(
    path.join(options.templateRunDir, "slots.json"),
  );
  const bindings = await readJson<{
    bindings: Array<{ slotId: string; pageId: string; viewport: string; surface: string; target: string }>;
  }>(path.join(options.templateRunDir, "slot-bindings.json"));
  const routeMap = await readJson<{ routes: Array<{ key: string; pageSourceId: string }> }>(
    path.join(appDir, "reconstruction-data", "route-map.json"),
  );
  const homePageId = routeMap.routes.find((route) => route.key === "/")?.pageSourceId;
  const contentProof = homePageId
    ? pickContentProof(slots, bindings, defaults.values, slotValues, homePageId, 5)
    : [];

  const deployManifest: DeployManifest = {
    schemaName: "production-deploy-manifest-v1",
    schemaVersion: 1,
    specRunId: runId,
    buildRunId: runId,
    sourceHost: options.host,
    siteName: seoPlan.site.siteName.value ?? "(needs-input)",
    mode,
    robotsPolicy: spec.indexabilityGate.robotsPolicy,
    routes: renderedHead.routes.map((route) => ({
      route: route.route,
      htmlFile: routeHtmlFile(route.route),
      expectedTitle: route.title,
      headMarker: "wr-seo-head-start",
    })),
    themeId: themeManifest.themeId,
    themeOverlayPath: THEME_OVERLAY_HREF,
    mediaFileCount: media.mediaFilesCopied,
    contentProof,
    knownResidualSourceHosts,
    blockers: blockers.map((blocker) => `${blocker.id}: ${blocker.summary}`),
  };

  const { packageDir, siteDir } = await assemblePackage({
    buildDir,
    exportOutDir: outDir,
    deployManifest,
    // Preview ships the path-only plan artifact; indexable serves the real
    // /sitemap.xml from the site instead (copied into the export above).
    sitemapPreviewFile:
      mode === "preview" ? path.join(options.seoPlanRunDir, "sitemap.preview.xml") : null,
  });

  // ---- 7. build manifest + bake report ----------------------------------------
  const bakeReport: BakeReport = {
    content: {
      bakedSlotValuesFile: "app/template-data/slot-values.baked.json",
      overlayKeyCount: contentBake.overlayKeyCount,
      unknownOverlayKeys: contentBake.unknownOverlayKeys,
      slotContentPatched: true,
    },
    theme: {
      themeOverlayFile: "package/site/wr/theme-overlay.css",
      overlayBytes: themeOverlayBytes,
      layoutPatched: true,
    },
    seo: post.seo,
    assets: {
      mediaFilesCopied: media.mediaFilesCopied,
      mediaBytes: media.mediaBytes,
      ...post.assets,
    },
    build: {
      mode: "static-export",
      nextBuildMs,
      routeHtmlFiles: post.routeHtmlFiles,
      siteFileCount: siteStats.fileCount,
      siteBytes: siteStats.byteCount,
    },
  };
  await writeJson(path.join(buildDir, "report", "bake-report.json"), bakeReport);
  await writeJson(path.join(buildDir, "manifest.json"), {
    schemaVersion: 1,
    schemaName: "production-build-v1",
    runId,
    createdAt: new Date().toISOString(),
    sourceHost: options.host,
    specFile: path.join(specDir, "production-spec.json"),
    packageDir,
    siteDir,
    mode,
  });

  return {
    runId,
    specDir,
    specFile: path.join(specDir, "production-spec.json"),
    buildDir,
    packageDir,
    siteDir,
    spec,
    bakeReport,
  };
}
