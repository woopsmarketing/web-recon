/**
 * What the editor can open, and everything it reads to open it.
 *
 * A "Site" in this editor is a RELEASE PROJECT — the settled authoring model
 * (there is no separate site-instance). Its `acceptedLineage` already names
 * the template, content, theme and asset runs, so the editor derives its whole
 * world from the project document and never invents a second source of truth.
 *
 * Everything here is READ-ONLY. The write path is `commit.ts`, which goes
 * through `src/release/authored.ts`.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadReconTemplate, type LoadedReconTemplate } from "../content-injection/load-template.js";
import { findMatchingPageRegionsRun } from "../release/create-site.js";
import { loadReleaseProject } from "../release/store.js";
import type { ReleaseProject } from "../release/types.js";
import type { SlotValue } from "../recon-template/types.js";
import { scanSites, scanTemplates } from "../registry/scan.js";
import type { SiteEntry, TemplateEntry } from "../registry/types.js";
import type { PageRegion } from "../regions/types.js";
import { SlotInversionIndex } from "./inversion.js";

export interface EditorRoute {
  routeId: string;
  path: string;
  pageId: string;
  title: string;
  renderCoverage: string;
  behaviorCoverage: string;
}

export interface RouteMapFile {
  breakpoint: number;
  routes: Array<{
    routeId: string;
    path: string;
    pageSourceId: string;
    title?: string;
    renderCoverage?: string;
    behaviorCoverage?: string;
  }>;
}

/** origin / disposition of one slot, from a content run's slot accounting. */
export interface SlotAccountingEntry {
  slotKey: string;
  scope: string;
  route?: string;
  type: string;
  editability: string;
  origin: string;
  disposition: string;
  customerFacing: string;
  detail: string;
}

export interface EditorSite {
  siteKey: string;
  projectId: string;
  host: string;
  projectDir: string;
  displayName: string;
  releaseState: string;
  project: ReleaseProject;
  templateRunDir: string;
  templateId: string;
  template: LoadedReconTemplate;
  index: SlotInversionIndex;
  breakpoint: number;
  routes: EditorRoute[];
  /** Content run on the accepted lineage, when it is on disk. */
  contentRunDir: string | null;
  /**
   * THE FIRST DRAFT (Task 28 Phase 10). `slot-values.json` from the content
   * run on the accepted lineage — the generated copy the production bake
   * already merges into the app (`src/production/bake.ts` step A).
   *
   * WHY THE EDITOR HAS TO READ IT. Until Phase 10 the editor seeded its
   * preview with `authored.slotValues` ALONE, which on a freshly created site
   * is empty — so an operator who had just generated a full site opened the
   * editor and saw the SOURCE site's copy, and the same slot would then read
   * one way in the preview and another way in the production package. The
   * draft is the base layer under the operator's own edits, exactly as the
   * bake stacks them.
   */
  contentSlotValues: Record<string, SlotValue>;
  accounting: Map<string, SlotAccountingEntry>;
  /** Region compile whose templateId matches, newest first. */
  regionsFile: string | null;
  regions: PageRegion[];
  themeRunDir: string | null;
  materializationRunDir: string | null;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** Every release project on disk, newest-updated first. */
export async function listEditorSites(dataRoot = "data"): Promise<{
  sites: SiteEntry[];
  warnings: string[];
}> {
  const scan = await scanSites({ dataRoot });
  const sites = [...scan.entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { sites, warnings: scan.warnings };
}

/**
 * Task 28 Phase 7 — the Template Library's data source. Mirrors
 * `listEditorSites` exactly (a fresh `scan*`, not the registry cache, so a
 * template compiled since the last register/rebuild still shows up): every
 * template on disk, newest-created first. Every column is a copy or a count
 * off the template's own `manifest.json` / `site-map.json` — see
 * `src/registry/types.ts`'s doctrine comment — so nothing here is invented.
 */
export async function listEditorTemplates(dataRoot = "data"): Promise<{
  templates: TemplateEntry[];
  warnings: string[];
}> {
  const scan = await scanTemplates({ dataRoot });
  const templates = [...scan.entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { templates, warnings: scan.warnings };
}

/**
 * Task 28 Phase 8: this is now a thin wrapper over
 * `src/release/create-site.ts`'s `findMatchingPageRegionsRun` — the ONE
 * page-regions lookup. Create Site calls the very same function when it
 * decides what to record on `auxiliary.pageRegionsDir`, so the editor and
 * Create Site can never discover two different "newest matching compile"
 * answers for the same template (the KNOWN TRAP the Phase 8 recon named).
 */
async function newestMatchingRegionRun(
  host: string,
  templateId: string,
  dataRoot: string,
): Promise<{ file: string; regions: PageRegion[] } | null> {
  const match = await findMatchingPageRegionsRun(host, templateId, dataRoot);
  return match === null ? null : { file: match.file, regions: match.regions };
}

/**
 * Open one release project for editing.
 *
 * A MISSING OPTIONAL LINEAGE IS NOT AN ERROR — it is reported as absent. A
 * project with no content run simply has no accounting panel, and the editor
 * says so rather than showing an empty table that looks like "nothing to
 * report".
 */
export async function loadEditorSite(projectDir: string, dataRoot = "data"): Promise<EditorSite> {
  const { project, projectDir: dir } = await loadReleaseProject(projectDir);
  const templateRunDir = project.acceptedLineage.template.path;
  const template = await loadReconTemplate(path.join(templateRunDir, "manifest.json"));
  const index = new SlotInversionIndex(template);

  const routeMap = await readJson<RouteMapFile>(
    path.join(templateRunDir, "app", "reconstruction-data", "route-map.json"),
  );
  const routes: EditorRoute[] = routeMap.routes.map((route) => ({
    routeId: route.routeId,
    path: route.path,
    pageId: route.pageSourceId,
    title: route.title ?? route.path,
    renderCoverage: route.renderCoverage ?? "unknown",
    behaviorCoverage: route.behaviorCoverage ?? "unknown",
  }));

  const contentRunPath = project.acceptedLineage.content.path;
  const contentRunDir = existsSync(contentRunPath) ? contentRunPath : null;
  const accounting = new Map<string, SlotAccountingEntry>();
  let contentSlotValues: Record<string, SlotValue> = {};
  if (contentRunDir !== null) {
    const valuesFile = path.join(contentRunDir, "slot-values.json");
    if (existsSync(valuesFile)) {
      try {
        contentSlotValues = await readJson<Record<string, SlotValue>>(valuesFile);
      } catch {
        // A malformed overlay is an ABSENCE, not a crash: the editor opens on
        // the source defaults and the inspector says the draft is unavailable.
        contentSlotValues = {};
      }
    }
  }
  if (contentRunDir !== null) {
    const file = path.join(contentRunDir, "slot-accounting.json");
    if (existsSync(file)) {
      try {
        const parsed = await readJson<{ entries: SlotAccountingEntry[] }>(file);
        for (const entry of parsed.entries) accounting.set(entry.slotKey, entry);
      } catch {
        accounting.clear();
      }
    }
  }

  const regionRun = await newestMatchingRegionRun(
    project.source.host,
    template.manifest.templateId,
    dataRoot,
  );

  return {
    siteKey: `${project.source.host}/${project.projectId}`,
    projectId: project.projectId,
    host: project.source.host,
    projectDir: dir,
    displayName: project.displayName ?? project.siteId,
    releaseState: project.releaseState,
    project,
    templateRunDir,
    templateId: template.manifest.templateId,
    template,
    index,
    breakpoint: routeMap.breakpoint,
    routes,
    contentRunDir,
    contentSlotValues,
    accounting,
    regionsFile: regionRun?.file ?? null,
    regions: regionRun?.regions ?? [],
    themeRunDir: existsSync(project.acceptedLineage.theme.path) ? project.acceptedLineage.theme.path : null,
    materializationRunDir: existsSync(project.acceptedLineage.assets.path)
      ? project.acceptedLineage.assets.path
      : null,
  };
}
