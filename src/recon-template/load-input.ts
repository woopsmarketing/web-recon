import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  APP_DIR,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  ReconstructionManifestSchema,
  type ReconstructionManifest,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../reconstruction/index.js";
import { loadSiteSpec, type LoadedSiteSpec } from "../sitespec/index.js";
import { TemplateInputError } from "./types.js";

/**
 * Template compiler input loading.
 *
 * TWO explicit lineage inputs, both immutable:
 *
 *   1. a reconstruction run (`reconstruction-manifest.json`) — the Exact
 *      Reconstruction whose app is copied and whose runtime page data is the
 *      surface every binding addresses, and
 *   2. the SiteSpec that reconstruction was generated from — the identity and
 *      measurement source (text node ids, bounding boxes, style tokens).
 *
 * The reconstruction manifest does not record its SiteSpec path (by design —
 * the generated app must not depend on it), so the caller names both and this
 * loader CROSS-CHECKS them instead of trusting the pairing: same rootUrl, same
 * schema versions the manifest recorded, and the same route/page shape. A
 * mismatched pair fails here, before a single slot is extracted.
 */

export interface TemplateInput {
  /** `data/<host>/reconstructions/<run-id>` (repo-relative or absolute). */
  reconstructionDir: string;
  reconstructionRunId: string;
  reconstructionManifestFile: string;
  manifest: ReconstructionManifest;
  /** The exact app directory the template app is copied from. */
  appDir: string;
  routeMap: RuntimeRouteMap;
  /** Runtime page data keyed by pageSourceId, e.g. `p000001` / `x000001`. */
  pagesById: Map<string, RuntimePage>;
  siteSpec: LoadedSiteSpec;
  siteSpecRunId: string;
  siteSpecFile: string;
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new TemplateInputError(
      `${label} could not be read: ${file} (${(error as Error).message})`,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TemplateInputError(`${label} is not valid JSON: ${file} (${(error as Error).message})`);
  }
}

export interface LoadTemplateInputOptions {
  reconstructionManifestFile: string;
  siteSpecFile: string;
}

export async function loadTemplateInput(
  options: LoadTemplateInputOptions,
): Promise<TemplateInput> {
  const manifestFile = options.reconstructionManifestFile;
  const manifestJson = await readJson(manifestFile, "reconstruction manifest");
  const parsed = ReconstructionManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    throw new TemplateInputError(
      `reconstruction manifest failed validation: ${manifestFile}\n${parsed.error.message}`,
    );
  }
  const manifest = parsed.data;

  const reconstructionDir = path.dirname(manifestFile);
  const reconstructionRunId = path.basename(reconstructionDir);
  const appDir = path.join(reconstructionDir, APP_DIR);
  try {
    const appStat = await stat(appDir);
    if (!appStat.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new TemplateInputError(`reconstruction app directory missing: ${appDir}`);
  }

  const routeMapFile = path.join(appDir, RUNTIME_DATA_DIR, ROUTE_MAP_FILE);
  const routeMap = (await readJson(routeMapFile, "route map")) as RuntimeRouteMap;
  if (routeMap.schemaVersion !== 1) {
    throw new TemplateInputError(
      `route map schemaVersion ${routeMap.schemaVersion} is not supported: ${routeMapFile}`,
    );
  }
  if (routeMap.routes.length !== manifest.stats.routes) {
    throw new TemplateInputError(
      `route map holds ${routeMap.routes.length} routes but the manifest recorded ${manifest.stats.routes}`,
    );
  }

  const pagesById = new Map<string, RuntimePage>();
  for (const route of routeMap.routes) {
    if (pagesById.has(route.pageSourceId)) continue;
    const pageFile = path.join(appDir, RUNTIME_DATA_DIR, route.pageFile);
    const page = (await readJson(pageFile, `runtime page ${route.pageSourceId}`)) as RuntimePage;
    if (page.pageId !== route.pageSourceId) {
      throw new TemplateInputError(
        `runtime page ${pageFile} declares pageId ${page.pageId} but the route map expects ${route.pageSourceId}`,
      );
    }
    pagesById.set(route.pageSourceId, page);
  }

  const siteSpec = await loadSiteSpec(options.siteSpecFile, { validate: false });
  const siteSpecRunId = path.basename(path.dirname(options.siteSpecFile));

  // Lineage cross-checks: the pairing is caller-supplied, so verify it.
  if (siteSpec.siteSpec.rootUrl !== manifest.rootUrl) {
    throw new TemplateInputError(
      `lineage mismatch: SiteSpec rootUrl ${siteSpec.siteSpec.rootUrl} != reconstruction rootUrl ${manifest.rootUrl}`,
    );
  }
  if (siteSpec.siteSpec.schemaVersion !== manifest.sourceSchemaVersion) {
    throw new TemplateInputError(
      `lineage mismatch: SiteSpec schemaVersion ${siteSpec.siteSpec.schemaVersion} != manifest.sourceSchemaVersion ${manifest.sourceSchemaVersion}`,
    );
  }
  if (routeMap.rootUrl !== manifest.rootUrl) {
    throw new TemplateInputError(
      `route map rootUrl ${routeMap.rootUrl} != manifest rootUrl ${manifest.rootUrl}`,
    );
  }
  for (const pageId of pagesById.keys()) {
    if (!siteSpec.pageById.has(pageId)) {
      throw new TemplateInputError(
        `lineage mismatch: runtime page ${pageId} has no SiteSpec page — is this the SiteSpec the reconstruction was generated from?`,
      );
    }
  }

  return {
    reconstructionDir,
    reconstructionRunId,
    reconstructionManifestFile: manifestFile,
    manifest,
    appDir,
    routeMap,
    pagesById,
    siteSpec,
    siteSpecRunId,
    siteSpecFile: options.siteSpecFile,
  };
}
