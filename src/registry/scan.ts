/**
 * Derive registry entries FROM the filesystem.
 *
 * Nothing here writes. Every entry is a pure function of artifacts another
 * subsystem already owns, which is what makes the index rebuildable:
 *
 *   data/<host>/recon-templates/<run>/manifest.json + site-map.json  → template
 *   data/<host>/release-projects/<id>/release-project.json           → site
 *                              .../revisions/r00N/revision.json      → revision pointer
 *
 * Enumeration is scan + lexical sort, the shipped idiom (there is no
 * index-of-runs and no "latest" pointer anywhere in this repo). Hidden entries
 * are skipped so the registry namespace itself and the `data/.smoke-*` scratch
 * dirs the suites create mid-run are never mistaken for hosts.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  SiteMapSchema,
  TemplateManifestSchema,
  type CollectionSpec,
} from "../recon-template/types.js";
import { loadRevisionChain } from "../release/revisions.js";
import { loadReleaseProject } from "../release/store.js";
import {
  type RegistryCollection,
  type RegistryRevisionPointer,
  type SiteEntry,
  type TemplateEntry,
} from "./types.js";

export const DEFAULT_DATA_ROOT = "data";
export const RECON_TEMPLATES_DIR = "recon-templates";
export const RELEASE_PROJECTS_DIR = "release-projects";

export interface RegistryOptions {
  /** Defaults to `data`. Overridden only by tests working in a scratch tree. */
  dataRoot?: string;
}

export function dataRootOf(options: RegistryOptions | undefined): string {
  return options?.dataRoot ?? DEFAULT_DATA_ROOT;
}

/** Repo-relative POSIX, matching site-map `routePolicy.policyFile`. */
export function posixPath(p: string): string {
  return p.split(path.sep).join("/");
}

async function listDirs(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** Host folders under the data root, lexically sorted. */
export async function listHosts(options?: RegistryOptions): Promise<string[]> {
  return listDirs(dataRootOf(options));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function collectionSummary(collections: CollectionSpec[] | undefined): RegistryCollection[] {
  return (collections ?? []).map((c) => ({
    collectionId: c.collectionId,
    groupedBy: c.groupedBy,
    semanticKind: c.semanticKind,
    reconstructedRoutes: c.reconstructedRoutes.length,
    representativeRoutes: c.representativeRoutes.length,
    discoveredMemberCount: c.discoveredMemberCount,
    countIsFloor: c.countIsFloor,
  }));
}

/**
 * One template entry, read from the run directory.
 *
 * `site-map.json` is OPTIONAL here: the collections list is a compiler-v3
 * addition and a v1/v2 template simply has none. The manifest is not optional —
 * without it the directory is not a template.
 */
export async function templateEntryFromDisk(templateDir: string): Promise<TemplateEntry> {
  const manifest = TemplateManifestSchema.parse(
    JSON.parse(await readFile(path.join(templateDir, "manifest.json"), "utf8")),
  );
  let collections: RegistryCollection[] = [];
  try {
    const siteMap = SiteMapSchema.parse(
      JSON.parse(await readFile(path.join(templateDir, "site-map.json"), "utf8")),
    );
    collections = collectionSummary(siteMap.collections);
  } catch {
    collections = [];
  }
  const counts = manifest.counts;
  return {
    templateId: manifest.templateId,
    host: manifest.source.host,
    runId: path.basename(templateDir),
    templateDir: posixPath(templateDir),
    createdAt: manifest.createdAt,
    compilerVersion: manifest.compilerVersion,
    source: {
      host: manifest.source.host,
      rootUrl: manifest.source.rootUrl,
      siteSpecRunId: manifest.source.siteSpecRunId,
      reconstructionRunId: manifest.source.reconstructionRunId,
    },
    routes: manifest.routes,
    routeCount: counts.routes,
    routePolicyApplied: manifest.routePolicy?.applied ?? false,
    // No policy ⇒ the extractor saw every route (`core-reconstruct` default),
    // so the split is definitional, not a second measurement.
    slotizedRouteCount: counts.slotizedRoutes ?? counts.routes,
    structureOnlyRouteCount: counts.structureOnlyRoutes ?? 0,
    excludedRouteCount: counts.excludedRoutes ?? 0,
    slotCount: counts.slots,
    bindingCount: counts.bindings,
    collections,
    limitations: manifest.limitations,
  };
}

export interface ScanResult<T> {
  entries: T[];
  /** One line per artifact that could not be read — never a silent drop. */
  warnings: string[];
}

/** Every template under the data root, sorted by templateId. */
export async function scanTemplates(options?: RegistryOptions): Promise<ScanResult<TemplateEntry>> {
  const root = dataRootOf(options);
  const entries: TemplateEntry[] = [];
  const warnings: string[] = [];
  for (const host of await listHosts(options)) {
    const namespace = path.join(root, host, RECON_TEMPLATES_DIR);
    for (const runId of await listDirs(namespace)) {
      const dir = path.join(namespace, runId);
      try {
        entries.push(await templateEntryFromDisk(dir));
      } catch (err) {
        warnings.push(`template ${posixPath(dir)} not indexed: ${(err as Error).message}`);
      }
    }
  }
  entries.sort((a, b) => (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0));
  return { entries, warnings };
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export function siteKeyFor(host: string, projectId: string): string {
  return `${host}/${projectId}`;
}

async function revisionPointer(projectDir: string): Promise<RegistryRevisionPointer | null> {
  const chain = await loadRevisionChain(projectDir);
  const head = chain[chain.length - 1];
  if (head === undefined) return null;
  return {
    revisionId: head.revisionId,
    parentRevisionId: head.parentRevisionId,
    authoredStateHash: head.authoredStateHash,
    origin: head.origin,
    createdAt: head.createdAt,
    revisionCount: chain.length,
  };
}

/**
 * One site entry, read from the release project directory.
 *
 * `loadReleaseProject` adapts a pre-Task-27 document IN MEMORY (it never
 * rewrites the file), so a legacy project is indexable — with the honest
 * consequence that its `siteId` is the adapted host slug and may collide with
 * a sibling project's. That is why `siteKey` — the directory identity — is the
 * registry key, and why `siteRegistryWarnings` reports the collision.
 */
export async function siteEntryFromDisk(projectDir: string): Promise<SiteEntry> {
  const { project, adaptedFrom } = await loadReleaseProject(projectDir);
  const template = project.acceptedLineage.template;
  return {
    siteKey: siteKeyFor(project.source.host, project.projectId),
    siteId: project.siteId,
    projectId: project.projectId,
    host: project.source.host,
    projectDir: posixPath(projectDir),
    name: project.siteId,
    nameSource: "derived-from-site-id",
    templateLineage: { templateId: template.id, path: template.path, hash: template.hash },
    releaseState: project.releaseState,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectRevision: project.projectRevision,
    adaptedFromRevision: adaptedFrom,
    revision: await revisionPointer(projectDir),
    authoredSlotCount: Object.keys(project.authored.slotValues).length,
  };
}

/** Every release project under the data root, sorted by siteKey. */
export async function scanSites(options?: RegistryOptions): Promise<ScanResult<SiteEntry>> {
  const root = dataRootOf(options);
  const entries: SiteEntry[] = [];
  const warnings: string[] = [];
  for (const host of await listHosts(options)) {
    const namespace = path.join(root, host, RELEASE_PROJECTS_DIR);
    for (const projectId of await listDirs(namespace)) {
      const dir = path.join(namespace, projectId);
      try {
        entries.push(await siteEntryFromDisk(dir));
      } catch (err) {
        warnings.push(`site ${posixPath(dir)} not indexed: ${(err as Error).message}`);
      }
    }
  }
  entries.sort((a, b) => (a.siteKey < b.siteKey ? -1 : a.siteKey > b.siteKey ? 1 : 0));
  return { entries, warnings };
}

/** Non-unique siteIds, reported rather than silently deduplicated. */
export function siteRegistryWarnings(entries: SiteEntry[]): string[] {
  const bySiteId = new Map<string, string[]>();
  for (const entry of entries) {
    const keys = bySiteId.get(entry.siteId) ?? [];
    keys.push(entry.siteKey);
    bySiteId.set(entry.siteId, keys);
  }
  const warnings: string[] = [];
  for (const [siteId, keys] of [...bySiteId].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (keys.length > 1) {
      warnings.push(`siteId ${siteId} is shared by ${keys.length} projects: ${keys.join(", ")}`);
    }
  }
  return warnings;
}
