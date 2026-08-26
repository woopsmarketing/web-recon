/**
 * Asset-resolution application (Task 25, spec §11/§12).
 *
 * The Task 22 replacement seam is record-only (`replacement.providedFile` has
 * no byte-applying consumer). This module is that consumer at the RELEASE
 * layer: it derives a NEW asset-materialization run from the current one —
 * base bytes copied, operator files content-hashed into media/, rewrite map
 * extended, replacement-manifest entries flipped to `provided`, font
 * decisions recorded — without touching the base run (spec rule: lineage runs
 * are immutable).
 *
 * Measurement honesty: report/network-qa.json + report/font-qa.json are
 * COPIED from the base run and a report/derivation.json records that the
 * census is inherited (conservative — replacements can only shrink the
 * residual set; re-run assets:qa to re-measure).
 */
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadAssetMaterializationRun, newAssetRunId, assetMaterializationDir } from "../assets/index.js";
import { hashFile } from "../production/hash.js";
import type { FontDecision, ResolutionAsset } from "./types.js";

const EXTENSION_BY_SUFFIX: Record<string, string> = {
  ".png": ".png",
  ".jpg": ".jpg",
  ".jpeg": ".jpg",
  ".webp": ".webp",
  ".gif": ".gif",
  ".svg": ".svg",
  ".ico": ".ico",
  ".avif": ".avif",
};

export interface ApplyAssetResolutionsOptions {
  baseMaterializationRunDir: string;
  /** assetId (inventory id or `og-image` / `organization-logo`) → file. */
  assets: Record<string, ResolutionAsset>;
  fontDecisions: Record<string, FontDecision>;
  providedBy: string;
  runId?: string;
  outputDir?: string;
  log?: (line: string) => void;
}

export interface ApplyAssetResolutionsResult {
  runDir: string;
  runId: string;
  appliedAssets: Array<{ assetId: string; file: string; localPath: string }>;
  recordedFiles: Array<{ assetId: string; file: string; localPath: string }>;
  fontDecisionFamilies: string[];
  unknownAssetIds: string[];
}

export async function applyAssetResolutions(
  options: ApplyAssetResolutionsOptions,
): Promise<ApplyAssetResolutionsResult> {
  const log = options.log ?? ((): void => {});
  const base = await loadAssetMaterializationRun(options.baseMaterializationRunDir);
  const runId = options.runId ?? newAssetRunId();
  const runDir = options.outputDir ?? assetMaterializationDir(base.manifest.sourceHost, runId);
  if (existsSync(runDir)) {
    throw new Error(`derived materialization run dir already exists: ${runDir}`);
  }

  // ---- copy the base run wholesale (bytes, reports) -----------------------
  await mkdir(runDir, { recursive: true });
  await cp(base.runDir, runDir, { recursive: true });

  const manifest = structuredClone(base.manifest);
  const rewriteMap = structuredClone(base.rewriteMap);
  const replacementManifest = structuredClone(base.replacementManifest);
  const entriesByInventoryId = new Map(
    replacementManifest.entries.map((entry) => [entry.inventoryId, entry]),
  );

  const appliedAssets: ApplyAssetResolutionsResult["appliedAssets"] = [];
  const recordedFiles: ApplyAssetResolutionsResult["recordedFiles"] = [];
  const unknownAssetIds: string[] = [];
  const mediaDir = path.join(runDir, "media");
  await mkdir(mediaDir, { recursive: true });

  for (const [assetId, value] of Object.entries(options.assets)) {
    const file = typeof value === "string" ? value : value.file;
    if (!existsSync(file)) throw new Error(`resolution asset "${assetId}" file not found: ${file}`);
    const extension = EXTENSION_BY_SUFFIX[path.extname(file).toLowerCase()];
    if (extension === undefined) {
      throw new Error(`resolution asset "${assetId}" has an unsupported extension: ${file}`);
    }
    const sha256 = await hashFile(file);
    const localPath = `/media/${sha256}${extension}`;
    await copyFile(file, path.join(mediaDir, `${sha256}${extension}`));

    const entry = entriesByInventoryId.get(assetId);
    if (entry !== undefined) {
      entry.replacement = { status: "provided", providedFile: localPath, providedBy: options.providedBy };
      if (entry.sourceUrl !== null) {
        const existing = rewriteMap.entries.find((rewrite) => rewrite.sourceUrl === entry.sourceUrl);
        if (existing !== undefined) existing.localPath = localPath;
        else rewriteMap.entries.push({ sourceUrl: entry.sourceUrl, localPath, contexts: ["html", "css"] });
        manifest.entries.push({
          inventoryId: assetId,
          sourceUrl: entry.sourceUrl,
          classification: entry.classification,
          status: "operator-provided",
          httpStatus: null,
          mime: null,
          size: null,
          sha256,
          localPath,
          redirectChain: [],
        });
      }
      appliedAssets.push({ assetId, file, localPath });
      log(`[release] asset ${assetId} → ${localPath} (${entry.sourceUrl ?? "no source url"})`);
    } else if (assetId === "og-image" || assetId === "organization-logo") {
      // Site-level assets with no inventory entry: shipped in media/, recorded
      // in the derivation — SEO-plan consumption is a named seam.
      recordedFiles.push({ assetId, file, localPath });
      log(`[release] site asset ${assetId} → ${localPath} (recorded; no rewrite target)`);
    } else {
      unknownAssetIds.push(assetId);
    }
  }
  if (unknownAssetIds.length > 0) {
    throw new Error(
      `resolution assets reference unknown inventory ids: ${unknownAssetIds.join(", ")} ` +
        "(valid ids come from replacement-manifest.json entries[].inventoryId, plus og-image / organization-logo)",
    );
  }

  // ---- font decisions ------------------------------------------------------
  const fontDecisionsFile = path.join(runDir, "font-decisions.json");
  const existingDecisions = existsSync(fontDecisionsFile)
    ? (JSON.parse(await readFile(fontDecisionsFile, "utf8")) as Record<string, unknown>)
    : {};
  const decisions = {
    ...existingDecisions,
    ...Object.fromEntries(
      Object.entries(options.fontDecisions).map(([family, decision]) => [
        family,
        { ...decision, decidedBy: options.providedBy, decidedAt: new Date().toISOString() },
      ]),
    ),
  };
  await writeFile(fontDecisionsFile, JSON.stringify(decisions, null, 2) + "\n", "utf8");

  // ---- manifest counts + files --------------------------------------------
  manifest.runId = runId;
  manifest.createdAt = new Date().toISOString();
  const uniqueLocalFiles = new Set<string>([
    ...rewriteMap.entries.map((entry) => entry.localPath),
    ...appliedAssets.map((entry) => entry.localPath),
    ...recordedFiles.map((entry) => entry.localPath),
  ]);
  manifest.counts.uniqueFiles = uniqueLocalFiles.size;
  manifest.counts.rewriteEntries = rewriteMap.entries.length;

  const writeJson = (name: string, value: unknown): Promise<void> =>
    writeFile(path.join(runDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  await writeJson("manifest.json", manifest);
  await writeJson(manifest.files.rewriteMap, rewriteMap);
  await writeJson(manifest.files.replacementManifest, replacementManifest);
  await mkdir(path.join(runDir, "report"), { recursive: true });
  await writeJson(path.join("report", "derivation.json"), {
    derivedFrom: options.baseMaterializationRunDir,
    providedBy: options.providedBy,
    appliedAssets,
    recordedFiles,
    fontDecisions: Object.keys(options.fontDecisions),
    measurementNote:
      "report/network-qa.json + report/font-qa.json are inherited from the base run (conservative: " +
      "replacements only shrink the residual set); re-run assets:qa against this run to re-measure",
  });

  return {
    runDir,
    runId,
    appliedAssets,
    recordedFiles,
    fontDecisionFamilies: Object.keys(options.fontDecisions),
    unknownAssetIds: [],
  };
}
