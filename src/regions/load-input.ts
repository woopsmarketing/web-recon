import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  APP_DIR,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../reconstruction/types.js";
import { hashBytes } from "./skeleton.js";
import { RegionInputError, type RegionViewport } from "./types.js";
import type { RegionBinding, RegionCompileInput } from "./compile.js";

/**
 * Region compiler input: ONE recon-template run directory, read only.
 *
 *   data/<host>/recon-templates/<run>/manifest.json          lineage + template id
 *                                     site-map.json          route → pageSourceId
 *                                     slots.json             slotId → slot key
 *                                     slot-bindings.json     the join
 *                                     app/reconstruction-data/  the trees
 *
 * A template run already carries a copy of the reconstruction's runtime page
 * data inside its `app/`, so the region compile needs neither the reconstruction
 * run nor the SiteSpec — one directory in, one new directory out. Nothing under
 * the input run is opened for writing at any point.
 *
 * The four inputs are hashed by BYTES and the hashes are pinned into the output,
 * so a region artifact can always be proven to belong to the template it claims.
 */

async function readJson(file: string, label: string): Promise<{ value: unknown; raw: string }> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new RegionInputError(`${label} could not be read: ${file} (${(error as Error).message})`);
  }
  try {
    return { value: JSON.parse(raw) as unknown, raw };
  } catch (error) {
    throw new RegionInputError(`${label} is not valid JSON: ${file} (${(error as Error).message})`);
  }
}

interface TemplateManifestShape {
  schemaVersion?: number;
  templateId?: string;
  slotSchemaVersion?: number;
  source?: { host?: string; rootUrl?: string };
}

interface SiteMapShape {
  routes?: { route: string; pageId: string; renderCoverage?: string }[];
}

interface SlotsShape {
  slots?: { id: string; key: string }[];
}

interface BindingsShape {
  bindings?: {
    bindingId: string;
    slotId: string;
    pageId: string;
    viewport: string;
    surface: string;
    nodeId: string;
  }[];
}

export interface LoadedRegionInput extends RegionCompileInput {
  templateRunDir: string;
}

export async function loadRegionInput(templateRunDir: string): Promise<LoadedRegionInput> {
  const manifestFile = path.join(templateRunDir, "manifest.json");
  const manifest = (await readJson(manifestFile, "template manifest")).value as TemplateManifestShape;
  if (!manifest.templateId) {
    throw new RegionInputError(`template manifest has no templateId: ${manifestFile}`);
  }
  const rootUrl = manifest.source?.rootUrl;
  const host = manifest.source?.host;
  if (!rootUrl || !host) {
    throw new RegionInputError(`template manifest has no source host/rootUrl: ${manifestFile}`);
  }

  const siteMap = await readJson(path.join(templateRunDir, "site-map.json"), "site map");
  const slots = await readJson(path.join(templateRunDir, "slots.json"), "slots");
  const bindings = await readJson(path.join(templateRunDir, "slot-bindings.json"), "slot bindings");
  const routeMapFile = path.join(templateRunDir, APP_DIR, RUNTIME_DATA_DIR, ROUTE_MAP_FILE);
  const routeMap = await readJson(routeMapFile, "route map");

  const siteMapRoutes = (siteMap.value as SiteMapShape).routes ?? [];
  if (siteMapRoutes.length === 0) {
    throw new RegionInputError(`site map holds no routes: ${templateRunDir}/site-map.json`);
  }
  const runtimeRouteMap = routeMap.value as RuntimeRouteMap;
  if (runtimeRouteMap.schemaVersion !== 1) {
    throw new RegionInputError(
      `route map schemaVersion ${runtimeRouteMap.schemaVersion} is not supported: ${routeMapFile}`,
    );
  }

  // The runtime trees are addressed by pageSourceId, which the route map — not
  // the site map — owns. Load each page exactly once even when several routes
  // share it (the many-to-one this artifact must preserve).
  const pages = new Map<string, RuntimePage>();
  for (const route of runtimeRouteMap.routes) {
    if (pages.has(route.pageSourceId)) continue;
    const pageFile = path.join(templateRunDir, APP_DIR, RUNTIME_DATA_DIR, ...route.pageFile.split("/"));
    const page = (await readJson(pageFile, `runtime page ${route.pageSourceId}`)).value as RuntimePage;
    if (page.pageId !== route.pageSourceId) {
      throw new RegionInputError(
        `runtime page ${pageFile} declares pageId ${page.pageId} but the route map expects ${route.pageSourceId}`,
      );
    }
    pages.set(route.pageSourceId, page);
  }

  const slotKeyById = new Map<string, string>();
  for (const slot of (slots.value as SlotsShape).slots ?? []) slotKeyById.set(slot.id, slot.key);
  if (slotKeyById.size === 0) {
    throw new RegionInputError(`slots.json holds no slots: ${templateRunDir}/slots.json`);
  }

  const regionBindings: RegionBinding[] = [];
  for (const binding of (bindings.value as BindingsShape).bindings ?? []) {
    if (binding.viewport !== "desktop" && binding.viewport !== "mobile") {
      throw new RegionInputError(
        `binding ${binding.bindingId} carries unsupported viewport ${binding.viewport}`,
      );
    }
    regionBindings.push({
      bindingId: binding.bindingId,
      slotId: binding.slotId,
      pageId: binding.pageId,
      viewport: binding.viewport as RegionViewport,
      surface: binding.surface,
      nodeId: binding.nodeId,
    });
  }

  return {
    templateRunDir,
    templateId: manifest.templateId,
    host,
    rootUrl,
    // Normalized so two compiles of the same run from different working copies
    // still produce byte-identical output.
    runDir: templateRunDir.split(path.sep).join("/"),
    ...(manifest.slotSchemaVersion === undefined ? {} : { slotSchemaVersion: manifest.slotSchemaVersion }),
    hashes: {
      slots: hashBytes(slots.raw),
      slotBindings: hashBytes(bindings.raw),
      siteMap: hashBytes(siteMap.raw),
      routeMap: hashBytes(routeMap.raw),
    },
    routes: siteMapRoutes.map((route) => ({
      route: route.route,
      pageSourceId: route.pageId,
      ...(route.renderCoverage === undefined ? {} : { renderCoverage: route.renderCoverage }),
    })),
    pages,
    slotKeyById,
    bindings: regionBindings,
  };
}
