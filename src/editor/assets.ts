/**
 * The image-slot ↔ asset join, done the only honest way available.
 *
 * A SLOT HAS NO `assetId`. `defaultValue.src` on an image slot is the ORIGINAL
 * absolute source URL; the id an authored replacement is keyed by
 * (`authored.assets[assetId]`) lives in the asset materialization's manifest,
 * and the file the preview actually serves lives in the rewrite map. So the
 * join is composed, at read time, from two artifacts:
 *
 *   manifest.entries[]   inventoryId → sourceUrl (+ status, mime, size, sha)
 *   rewrite-map.entries[] sourceUrl  → /media/<sha>.<ext>
 *
 * When either is absent the editor reports the slot as UNJOINED rather than
 * inventing an id — an image inspector that cannot name the asset it would
 * replace must say so.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { RewriteMap } from "../assets/types.js";

export interface MaterializedAsset {
  assetId: string;
  sourceUrl: string;
  status: string;
  mime: string | null;
  size: number | null;
  sha256: string | null;
  mediaName: string | null;
}

export interface EditorAssetLineage {
  runDir: string;
  mediaDir: string;
  rewriteMap: RewriteMap;
  byAssetId: Map<string, MaterializedAsset>;
  bySourceUrl: Map<string, MaterializedAsset>;
  /** sourceUrl → /media file name, from the rewrite map (the served bytes). */
  mediaNameBySourceUrl: Map<string, string>;
}

interface ManifestShape {
  entries: Array<{
    inventoryId: string;
    sourceUrl: string;
    status: string;
    mime?: string | null;
    size?: number | null;
    sha256?: string | null;
    localPath?: string | null;
  }>;
}

function mediaNameOf(localPath: string | null | undefined): string | null {
  if (localPath === null || localPath === undefined || localPath === "") return null;
  const name = localPath.split("/").pop();
  return name === undefined || name === "" ? null : name;
}

export async function loadEditorAssetLineage(runDir: string): Promise<EditorAssetLineage> {
  const manifest = JSON.parse(
    await readFile(path.join(runDir, "manifest.json"), "utf8"),
  ) as ManifestShape;
  const rewriteMap = JSON.parse(
    await readFile(path.join(runDir, "rewrite-map.json"), "utf8"),
  ) as RewriteMap;

  const mediaNameBySourceUrl = new Map<string, string>();
  for (const entry of rewriteMap.entries) {
    const name = mediaNameOf(entry.localPath);
    if (name !== null) mediaNameBySourceUrl.set(entry.sourceUrl, name);
  }

  const byAssetId = new Map<string, MaterializedAsset>();
  const bySourceUrl = new Map<string, MaterializedAsset>();
  for (const entry of manifest.entries) {
    const asset: MaterializedAsset = {
      assetId: entry.inventoryId,
      sourceUrl: entry.sourceUrl,
      status: entry.status,
      mime: entry.mime ?? null,
      size: entry.size ?? null,
      sha256: entry.sha256 ?? null,
      mediaName: mediaNameOf(entry.localPath) ?? mediaNameBySourceUrl.get(entry.sourceUrl) ?? null,
    };
    byAssetId.set(asset.assetId, asset);
    if (!bySourceUrl.has(asset.sourceUrl)) bySourceUrl.set(asset.sourceUrl, asset);
  }

  return {
    runDir,
    mediaDir: path.join(runDir, "media"),
    rewriteMap,
    byAssetId,
    bySourceUrl,
    mediaNameBySourceUrl,
  };
}
