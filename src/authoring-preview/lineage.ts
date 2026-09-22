/**
 * Turning authored Site state into the two LIGHTWEIGHT overlays the preview
 * serve boundary understands (Task 28 Phase 3).
 *
 * Both helpers are deliberately the cheap half of an existing stage:
 *
 *   THEME   `generateThemeOverlay(adapter, theme)` is the pure function the
 *           theme StageRunner itself calls; the expensive part of that stage
 *           is writing a run directory, and a preview needs none of it. The
 *           CSS produced here is therefore byte-identical to what the stage
 *           would produce for the same tokens — not an approximation.
 *
 *   ASSETS  an `authored.assets` key is an `assetId` — an inventory id, or the
 *           site-level `og-image` / `organization-logo`. The materialization
 *           manifest already records inventoryId → sourceUrl, and the rewrite
 *           map records sourceUrl → /media/<sha>.<ext>. Composing the two
 *           gives the media file names an authored replacement must be served
 *           at, WITHOUT re-running the assets stage or copying a media set.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateThemeOverlay } from "../theme/overlay.js";
import type { SiteThemeAdapter, ThemeFile } from "../theme/types.js";
import { ThemeFileSchema } from "../theme/types.js";
import type { RewriteMap } from "../assets/types.js";

export interface AuthoredThemeInput {
  themeSourceFile?: string;
  tokens?: Record<string, string>;
  note?: string;
}

/** The overlay CSS for a base theme plus the operator's token overrides. */
export function authoredThemeOverlayCss(options: {
  adapter: SiteThemeAdapter;
  baseTheme: ThemeFile;
  authoredTheme?: AuthoredThemeInput;
}): { css: string; themedGroupCount: number; overriddenTokens: string[] } {
  const overrides = options.authoredTheme?.tokens ?? {};
  const theme =
    Object.keys(overrides).length === 0
      ? options.baseTheme
      : ThemeFileSchema.parse({
          ...options.baseTheme,
          tokens: { ...options.baseTheme.tokens, ...overrides },
        });
  const overlay = generateThemeOverlay(options.adapter, theme);
  return {
    css: overlay.css,
    themedGroupCount: overlay.themedGroupCount,
    overriddenTokens: Object.keys(overrides).sort(),
  };
}

export interface MaterializationLineage {
  mediaDir: string;
  rewriteMap: RewriteMap;
  /** assetId (inventory id) → media file names it is served at. */
  mediaNamesByAssetId: Map<string, string[]>;
}

interface MaterializationManifestShape {
  entries: Array<{ inventoryId: string; sourceUrl: string; localPath: string | null }>;
}

/** Read the frozen materialization run into everything the preview needs. */
export async function loadMaterializationLineage(runDir: string): Promise<MaterializationLineage> {
  const manifest = JSON.parse(
    await readFile(path.join(runDir, "manifest.json"), "utf8"),
  ) as MaterializationManifestShape;
  const rewriteMap = JSON.parse(await readFile(path.join(runDir, "rewrite-map.json"), "utf8")) as RewriteMap;
  const localPathByUrl = new Map(rewriteMap.entries.map((entry) => [entry.sourceUrl, entry.localPath]));
  const mediaNamesByAssetId = new Map<string, string[]>();
  for (const entry of manifest.entries) {
    const localPath = entry.localPath ?? localPathByUrl.get(entry.sourceUrl) ?? null;
    if (localPath === null) continue;
    const name = localPath.split("/").pop();
    if (name === undefined || name === "") continue;
    const existing = mediaNamesByAssetId.get(entry.inventoryId);
    if (existing === undefined) mediaNamesByAssetId.set(entry.inventoryId, [name]);
    else if (!existing.includes(name)) existing.push(name);
  }
  return { mediaDir: path.join(runDir, "media"), rewriteMap, mediaNamesByAssetId };
}
