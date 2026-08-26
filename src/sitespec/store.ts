import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ASSET_CATALOG_FILE,
  AssetCatalogSchema,
  INTERACTION_SPEC_FILE,
  InteractionSpecSchema,
  PAGES_DIR,
  PageSpecSchema,
  SITE_SPEC_FILE,
  STYLE_CATALOG_FILE,
  SiteSpecSchema,
  StyleCatalogSchema,
} from "./types.js";
import type { CompiledSiteSpec } from "./compile-site.js";

/**
 * SiteSpec persistence (Task 13, items 7, 74, 116).
 *
 * The SiteSpec gets its OWN namespace and never writes a byte into any run it
 * read:
 *
 *   data/<host>/site-observations/<run>/     ← READ ONLY, never touched
 *   data/<host>/interaction-models/<run>/    ← READ ONLY, never touched
 *   data/<host>/site-specs/<run-id>/         ← everything this Task writes
 *     site-spec.json
 *     style-catalog.json
 *     asset-catalog.json
 *     interaction-spec.json
 *     pages/p000001.json …
 *
 * `rendered.html` is an INPUT and is deliberately not copied here (item 116):
 * the goal is a normalized IR, not a second archive of the pages. Screenshots
 * are not copied either, for the same reason.
 *
 * Everything is zod-validated on the way out. The run directory name carries a
 * timestamp — that is a run-tracking id, not content — while every JSON body is
 * a pure function of the inputs (item 9), so two compiles of the same run land
 * in two directories holding byte-identical files.
 */

const DATA_DIR = "data";
const SITE_SPECS_DIR = "site-specs";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/site-specs/<run-id>`. */
export function siteSpecRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), SITE_SPECS_DIR, runId);
}

export interface SavedSiteSpec {
  runDir: string;
  siteSpecPath: string;
  bytes: {
    siteSpec: number;
    styleCatalog: number;
    assetCatalog: number;
    interactionSpec: number;
    pages: number;
    total: number;
  };
  pageFileCount: number;
}

async function writeJson(file: string, value: unknown): Promise<number> {
  const json = JSON.stringify(value, null, 2) + "\n";
  await writeFile(file, json, "utf8");
  return Buffer.byteLength(json, "utf8");
}

/** Validate everything, then write it. Nothing unvalidated ever reaches disk. */
export async function saveSiteSpec(
  runDir: string,
  compiled: CompiledSiteSpec,
): Promise<SavedSiteSpec> {
  await mkdir(path.join(runDir, PAGES_DIR), { recursive: true });

  const siteSpecBytes = await writeJson(
    path.join(runDir, SITE_SPEC_FILE),
    SiteSpecSchema.parse(compiled.siteSpec),
  );
  const styleBytes = await writeJson(
    path.join(runDir, STYLE_CATALOG_FILE),
    StyleCatalogSchema.parse(compiled.styleCatalog),
  );
  const assetBytes = await writeJson(
    path.join(runDir, ASSET_CATALOG_FILE),
    AssetCatalogSchema.parse(compiled.assetCatalog),
  );
  const interactionBytes = await writeJson(
    path.join(runDir, INTERACTION_SPEC_FILE),
    InteractionSpecSchema.parse(compiled.interactionSpec),
  );

  let pageBytes = 0;
  for (const page of compiled.pages) {
    pageBytes += await writeJson(
      path.join(runDir, PAGES_DIR, `${page.pageId}.json`),
      PageSpecSchema.parse(page),
    );
  }

  return {
    runDir,
    siteSpecPath: path.join(runDir, SITE_SPEC_FILE),
    bytes: {
      siteSpec: siteSpecBytes,
      styleCatalog: styleBytes,
      assetCatalog: assetBytes,
      interactionSpec: interactionBytes,
      pages: pageBytes,
      total: siteSpecBytes + styleBytes + assetBytes + interactionBytes + pageBytes,
    },
    pageFileCount: compiled.pages.length,
  };
}
