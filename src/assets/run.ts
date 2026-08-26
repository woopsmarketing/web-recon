/**
 * Run creators / loaders for the two Task 22 namespaces.
 *
 *   createAssetInventoryRun        data/<host>/asset-inventories/<run-id>/
 *   createAssetMaterializationRun  data/<host>/asset-materializations/<run-id>/
 *
 * Historical artifacts are read-only inputs; every output goes into a fresh
 * run directory.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildInventoryEntries,
  extractCssUrls,
  isFragmentOnlyCssRef,
  readAssetCatalog,
  readImageBriefs,
  readTemplateImageSlotJoin,
  scanHeadEvidence,
  type HeadEvidence,
} from "./inventory.js";
import { classifyInventory, deriveBrandTermsFromHost } from "./classify.js";
import { buildFontInventory, type FontCssFetchOptions } from "./fonts.js";
import {
  assetInventoryDir,
  createdAtFromRunId,
  newAssetRunId,
} from "./store.js";
import {
  ASSET_INVENTORY_SCHEMA_NAME,
  ASSET_SCHEMA_VERSION,
  AssetInventoryManifestSchema,
  AssetInventorySchema,
  FontInventorySchema,
  type AssetInventory,
  type AssetInventoryManifest,
  type ClassificationDecision,
  type FontInventory,
} from "./types.js";

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export interface CreateInventoryRunOptions {
  siteSpecDir: string;
  templateRunDir: string;
  contentRunDir?: string;
  /** Defaults to the observation run recorded in site-spec.json source. */
  observationRunDir?: string;
  /** Bounded opt-in live fetch of source stylesheets for @font-face rules. */
  liveFontCss?: FontCssFetchOptions | null;
  runId?: string;
  outputDir?: string;
  log?: (line: string) => void;
}

export interface InventoryRunResult {
  outputDir: string;
  manifest: AssetInventoryManifest;
  inventory: AssetInventory;
  classification: ClassificationDecision[];
  fontInventory: FontInventory;
}

export async function createAssetInventoryRun(
  options: CreateInventoryRunOptions,
): Promise<InventoryRunResult> {
  const log = options.log ?? ((): void => {});
  const siteSpecDir = path.resolve(options.siteSpecDir);
  const templateRunDir = path.resolve(options.templateRunDir);
  const siteSpec = JSON.parse(
    await readFile(path.join(siteSpecDir, "site-spec.json"), "utf8"),
  ) as { rootUrl: string; source: { siteObservation: string } };
  const sourceHost = new URL(siteSpec.rootUrl).hostname;

  const observationRunDir = path.resolve(
    options.observationRunDir ?? path.dirname(siteSpec.source.siteObservation),
  );
  const observationPagesDir = path.join(observationRunDir, "pages");
  const generatedStylesFile = path.join(
    templateRunDir,
    "app",
    "public",
    "wr",
    "generated-styles.css",
  );

  log(`reading asset catalog: ${path.join(siteSpecDir, "asset-catalog.json")}`);
  const rawCatalogAssets = await readAssetCatalog(siteSpecDir);
  // CSS url(#fragment) SVG-internal refs are not fetchable assets — skipped
  // at ingestion, counted honestly (Task 24 GED-C).
  const catalogAssets = rawCatalogAssets.filter(
    (asset) => typeof asset.url !== "string" || !isFragmentOnlyCssRef(asset.url),
  );
  log(`scanning head evidence: ${observationPagesDir}`);
  const head: HeadEvidence = await scanHeadEvidence(observationPagesDir);
  const generatedCss = await readFile(generatedStylesFile, "utf8");
  const rawCssUrls = extractCssUrls(generatedCss);
  const cssUrls = new Map([...rawCssUrls].filter(([url]) => !isFragmentOnlyCssRef(url)));
  const fragmentRefsSkipped =
    rawCatalogAssets.length - catalogAssets.length + (rawCssUrls.size - cssUrls.size);
  if (fragmentRefsSkipped > 0) {
    log(`skipped ${fragmentRefsSkipped} fragment-only css url() ref(s) — not fetchable assets`);
  }
  const slotKeysByUrl = await readTemplateImageSlotJoin(templateRunDir);
  const briefsBySlotKey = await readImageBriefs(options.contentRunDir ?? null);

  const entries = buildInventoryEntries({
    catalogAssets,
    cssUrls,
    head,
    slotKeysByUrl,
    briefsBySlotKey,
  });

  const classification = classifyInventory(entries, {
    brandTerms: deriveBrandTermsFromHost(sourceHost),
  });
  const byClassification: Record<string, number> = {};
  for (const decision of classification) {
    byClassification[decision.classification] =
      (byClassification[decision.classification] ?? 0) + 1;
  }

  const fontEntries = entries.filter((e) => e.origin === "head-font-preload");
  log(
    options.liveFontCss
      ? `font inventory: live @font-face CSS fetch enabled (max ${options.liveFontCss.maxStylesheets} stylesheets)`
      : "font inventory: no live CSS fetch (fontFaceRules stays empty, provenance not-fetched)",
  );
  const fontInventory = await buildFontInventory({
    head,
    generatedCss,
    liveFontCss: options.liveFontCss ?? null,
    fontEntries,
  });

  const runId = options.runId ?? newAssetRunId();
  const outputDir = path.resolve(
    options.outputDir ?? assetInventoryDir(sourceHost, runId),
  );
  await mkdir(outputDir, { recursive: true });

  const hostCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.host) hostCounts.set(entry.host, (hostCounts.get(entry.host) ?? 0) + 1);
  }

  const inventory: AssetInventory = AssetInventorySchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: ASSET_INVENTORY_SCHEMA_NAME,
    runId,
    createdAt: createdAtFromRunId(runId),
    sourceHost,
    inputs: {
      siteSpecDir: path.relative(process.cwd(), siteSpecDir),
      templateRunDir: path.relative(process.cwd(), templateRunDir),
      contentRunDir: options.contentRunDir
        ? path.relative(process.cwd(), path.resolve(options.contentRunDir))
        : null,
      observationRunDir: path.relative(process.cwd(), observationRunDir),
      generatedStylesFile: path.relative(process.cwd(), generatedStylesFile),
    },
    hosts: [...hostCounts.entries()]
      .map(([host, assetCount]) => ({ host, assetCount }))
      .sort((a, b) => b.assetCount - a.assetCount || a.host.localeCompare(b.host)),
    counts: {
      entries: entries.length,
      urlEntries: entries.filter((e) => e.url !== null).length,
      inlineSvgEntries: entries.filter((e) => e.url === null).length,
      truncatedEntries: entries.filter((e) => e.truncated).length,
      fragmentRefsSkipped,
      catalogAssets: rawCatalogAssets.length,
      cssUrlRefs: cssUrls.size,
      headFavicons: head.favicons.length,
      headOgImages: head.ogImages.length,
      fontPreloads: head.fontPreloads.length,
      slotJoinedEntries: entries.filter((e) => e.slotKeys.length > 0).length,
      imageBriefJoinedEntries: entries.filter((e) => e.imageBrief !== null).length,
      byClassification,
    },
    entries,
  } satisfies AssetInventory);

  const parsedFontInventory = FontInventorySchema.parse(fontInventory);

  const manifest: AssetInventoryManifest = AssetInventoryManifestSchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: ASSET_INVENTORY_SCHEMA_NAME,
    runId,
    createdAt: createdAtFromRunId(runId),
    sourceHost,
    files: {
      inventory: "asset-inventory.json",
      classification: "classification.json",
      fontInventory: "font-inventory.json",
    },
    counts: {
      entries: entries.length,
      urlEntries: inventory.counts.urlEntries,
      inlineSvgEntries: inventory.counts.inlineSvgEntries,
      truncatedEntries: inventory.counts.truncatedEntries,
      fragmentRefsSkipped,
      classificationDecisions: classification.length,
      fontUrls: parsedFontInventory.fontUrls.length,
      fontFaceRules: parsedFontInventory.fontFaceRules.length,
      webfontFamiliesNeedingLicenseReview: parsedFontInventory.license.length,
      ...Object.fromEntries(
        Object.entries(byClassification).map(([k, v]) => [`class:${k}`, v]),
      ),
    },
  } satisfies AssetInventoryManifest);

  await writeJson(path.join(outputDir, "asset-inventory.json"), inventory);
  await writeJson(path.join(outputDir, "classification.json"), {
    schemaVersion: ASSET_SCHEMA_VERSION,
    byClassification,
    decisions: classification,
  });
  await writeJson(path.join(outputDir, "font-inventory.json"), parsedFontInventory);
  await writeJson(path.join(outputDir, "manifest.json"), manifest);
  log(`inventory run written: ${outputDir}`);

  return {
    outputDir,
    manifest,
    inventory,
    classification,
    fontInventory: parsedFontInventory,
  };
}

export interface LoadedInventoryRun {
  runDir: string;
  manifest: AssetInventoryManifest;
  inventory: AssetInventory;
  classification: ClassificationDecision[];
  fontInventory: FontInventory;
}

export async function loadAssetInventoryRun(runDirRef: string): Promise<LoadedInventoryRun> {
  const runDir = path.resolve(
    runDirRef.endsWith("manifest.json") ? path.dirname(runDirRef) : runDirRef,
  );
  const manifest = AssetInventoryManifestSchema.parse(
    JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8")),
  );
  const inventory = AssetInventorySchema.parse(
    JSON.parse(await readFile(path.join(runDir, manifest.files.inventory), "utf8")),
  );
  const classificationRaw = JSON.parse(
    await readFile(path.join(runDir, manifest.files.classification), "utf8"),
  ) as { decisions: ClassificationDecision[] };
  const fontInventory = FontInventorySchema.parse(
    JSON.parse(await readFile(path.join(runDir, manifest.files.fontInventory), "utf8")),
  );
  return {
    runDir,
    manifest,
    inventory,
    classification: classificationRaw.decisions,
    fontInventory,
  };
}
