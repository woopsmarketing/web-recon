import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  APP_DIR,
  GENERATED_STYLES_FILE,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../reconstruction/index.js";
import type { SlotBinding as V2Binding, SlotDefinition as V2Slot } from "../recon-template/index.js";
import { SlotizedInputError } from "./types.js";

/**
 * Slotize input loading.
 *
 * ONE argument (a Slot V2 `recon-templates/<run>/manifest.json`) is enough:
 * the manifest records its own lineage, so the loader follows it to the
 * accepted reconstruction app (page trees, route map, generated stylesheet)
 * and the SiteSpec directory. Everything it touches is read-only and every
 * path is verified to exist BEFORE a single slot is compiled — a half-missing
 * input must fail here, not halfway through a write.
 *
 * Lineage paths inside the manifest are repo-relative (`data/<host>/…`). They
 * are resolved against the current working directory first and, failing that,
 * against the repo root inferred from the manifest's own path — so slotize
 * works from anywhere.
 */

export interface V2Contract {
  templateId: string;
  slots: V2Slot[];
  bindings: V2Binding[];
  values: Record<string, unknown>;
}

export interface SlotizeInput {
  host: string;
  rootUrl: string;
  reconTemplateDir: string;
  reconTemplateRunId: string;
  reconstructionDir: string;
  reconstructionRunId: string;
  appDir: string;
  siteSpecDir: string;
  routeMap: RuntimeRouteMap;
  /** pageSourceId → parsed RuntimePage (one entry per distinct page file). */
  pages: Map<string, RuntimePage>;
  /** pageSourceId → `pages/p0000NN.json` as the route map spells it. */
  pageFiles: Map<string, string>;
  stylesheetFile: string;
  stylesheetRelPath: string;
  breakpoint: number;
  v2: V2Contract;
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new SlotizedInputError(`${label} could not be read: ${file} (${(error as Error).message})`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new SlotizedInputError(`${label} is not valid JSON: ${file} (${(error as Error).message})`);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a repo-relative lineage path from cwd, else from the manifest's repo root. */
async function resolveLineagePath(reference: string, manifestFile: string): Promise<string> {
  const direct = path.resolve(reference);
  if (await exists(direct)) return direct;
  const abs = path.resolve(manifestFile);
  const marker = `${path.sep}data${path.sep}`;
  const cut = abs.indexOf(marker);
  if (cut > 0) {
    const candidate = path.resolve(abs.slice(0, cut), reference);
    if (await exists(candidate)) return candidate;
  }
  throw new SlotizedInputError(`lineage path does not exist: ${reference}`);
}

interface V2ManifestShape {
  schemaName?: string;
  templateId?: string;
  source?: {
    host?: string;
    rootUrl?: string;
    siteSpecFile?: string;
    reconstructionManifestFile?: string;
  };
}

export async function loadSlotizeInput(manifestFile: string): Promise<SlotizeInput> {
  const reconTemplateDir = path.dirname(path.resolve(manifestFile));
  const manifest = (await readJson(manifestFile, "recon-template manifest")) as V2ManifestShape;
  if (manifest.schemaName !== "recon-template-v1") {
    throw new SlotizedInputError(
      `not a recon-template manifest (schemaName=${String(manifest.schemaName)}): ${manifestFile}`,
    );
  }
  const source = manifest.source ?? {};
  if (!source.reconstructionManifestFile || !source.siteSpecFile || !source.rootUrl) {
    throw new SlotizedInputError(`recon-template manifest is missing source lineage: ${manifestFile}`);
  }

  const recManifestFile = await resolveLineagePath(source.reconstructionManifestFile, manifestFile);
  const reconstructionDir = path.dirname(recManifestFile);
  const appDir = path.join(reconstructionDir, APP_DIR);
  if (!(await exists(appDir))) {
    throw new SlotizedInputError(`reconstruction app directory missing: ${appDir}`);
  }
  const siteSpecDir = path.dirname(await resolveLineagePath(source.siteSpecFile, manifestFile));

  const routeMapFile = path.join(appDir, RUNTIME_DATA_DIR, ROUTE_MAP_FILE);
  const routeMap = (await readJson(routeMapFile, "route map")) as RuntimeRouteMap;
  if (routeMap.schemaVersion !== 1) {
    throw new SlotizedInputError(`route map schemaVersion ${routeMap.schemaVersion} is unsupported`);
  }

  const pages = new Map<string, RuntimePage>();
  const pageFiles = new Map<string, string>();
  for (const route of routeMap.routes) {
    if (pages.has(route.pageSourceId)) continue;
    const pageFile = path.join(appDir, RUNTIME_DATA_DIR, route.pageFile);
    const page = (await readJson(pageFile, `runtime page ${route.pageSourceId}`)) as RuntimePage;
    if (page.pageId !== route.pageSourceId) {
      throw new SlotizedInputError(
        `runtime page ${pageFile} declares pageId ${page.pageId}, route map expects ${route.pageSourceId}`,
      );
    }
    pages.set(route.pageSourceId, page);
    pageFiles.set(route.pageSourceId, route.pageFile);
  }

  const stylesheetRelPath = path.join("public", ...GENERATED_STYLES_FILE.split("/"));
  const stylesheetFile = path.join(appDir, stylesheetRelPath);
  if (!(await exists(stylesheetFile))) {
    throw new SlotizedInputError(`generated stylesheet missing: ${stylesheetFile}`);
  }

  const slotsFile = (await readJson(path.join(reconTemplateDir, "slots.json"), "Slot V2 slots")) as {
    templateId: string;
    slots: V2Slot[];
  };
  const bindingsFile = (await readJson(
    path.join(reconTemplateDir, "slot-bindings.json"),
    "Slot V2 bindings",
  )) as { bindings: V2Binding[] };
  const contentFile = (await readJson(
    path.join(reconTemplateDir, "default-content.json"),
    "Slot V2 default content",
  )) as { values: Record<string, unknown> };

  return {
    host: source.host ?? new URL(source.rootUrl).hostname,
    rootUrl: source.rootUrl,
    reconTemplateDir,
    reconTemplateRunId: path.basename(reconTemplateDir),
    reconstructionDir,
    reconstructionRunId: path.basename(reconstructionDir),
    appDir,
    siteSpecDir,
    routeMap,
    pages,
    pageFiles,
    stylesheetFile,
    stylesheetRelPath,
    breakpoint: routeMap.breakpoint,
    v2: {
      templateId: manifest.templateId ?? slotsFile.templateId,
      slots: slotsFile.slots,
      bindings: bindingsFile.bindings,
      values: contentFile.values,
    },
  };
}
