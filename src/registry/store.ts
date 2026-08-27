/**
 * Template / Site registry — a filesystem INDEX, not a second source of truth.
 *
 *   data/.registry/templates.json   template-registry-v1
 *   data/.registry/sites.json       site-registry-v1
 *
 * The namespace is dot-prefixed so it is never mistaken for a host folder
 * (the same convention the smoke suites' `data/.smoke-*` scratch dirs use),
 * and it lives under `data/` because that is where the artifacts it indexes
 * live — `data/` is gitignored, so the registry is machine-local by
 * construction. There is no database and no UI.
 *
 * DOCTRINE — the artifact wins.
 *   `register*` derives an entry from an artifact and caches it.
 *   `list*` reads the cache, which is why listing is cheap.
 *   `read*` RE-DERIVES from the artifact and returns that, reporting whether
 *   the cached entry agreed. A stale entry can therefore never be mistaken for
 *   the truth, and an artifact that was never registered is still readable
 *   (`read*` falls back to a scan) — registration only accelerates listing.
 *   `rebuildRegistry` throws both files away and rewrites them from a scan.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  dataRootOf,
  posixPath,
  scanSites,
  scanTemplates,
  siteEntryFromDisk,
  siteRegistryWarnings,
  templateEntryFromDisk,
  type RegistryOptions,
} from "./scan.js";
import {
  REGISTRY_SCHEMA_VERSION,
  SITE_REGISTRY_SCHEMA_NAME,
  SiteRegistrySchema,
  TEMPLATE_REGISTRY_SCHEMA_NAME,
  TemplateRegistrySchema,
  type ResolvedEntry,
  type SiteEntry,
  type SiteRegistry,
  type TemplateEntry,
  type TemplateRegistry,
} from "./types.js";

export const REGISTRY_DIR = ".registry";
export const TEMPLATE_REGISTRY_FILE = "templates.json";
export const SITE_REGISTRY_FILE = "sites.json";

export function registryDir(options?: RegistryOptions): string {
  return path.join(dataRootOf(options), REGISTRY_DIR);
}

export function templateRegistryFile(options?: RegistryOptions): string {
  return path.join(registryDir(options), TEMPLATE_REGISTRY_FILE);
}

export function siteRegistryFile(options?: RegistryOptions): string {
  return path.join(registryDir(options), SITE_REGISTRY_FILE);
}

/** Key-sorted JSON, so two entries that carry the same facts compare equal. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** True when a cached entry still says exactly what the artifact says. */
export function entriesAgree(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Index files
// ---------------------------------------------------------------------------

function emptyTemplateRegistry(root: string): TemplateRegistry {
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    schemaName: TEMPLATE_REGISTRY_SCHEMA_NAME,
    generatedAt: new Date().toISOString(),
    dataRoot: posixPath(root),
    entries: [],
    warnings: [],
  };
}

function emptySiteRegistry(root: string): SiteRegistry {
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    schemaName: SITE_REGISTRY_SCHEMA_NAME,
    generatedAt: new Date().toISOString(),
    dataRoot: posixPath(root),
    entries: [],
    warnings: [],
  };
}

/** A missing index file is the EMPTY registry, never an error — the index is
 *  derived state and its absence is simply "not built yet". */
export async function loadTemplateRegistry(options?: RegistryOptions): Promise<TemplateRegistry> {
  try {
    return TemplateRegistrySchema.parse(
      JSON.parse(await readFile(templateRegistryFile(options), "utf8")),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyTemplateRegistry(dataRootOf(options));
    }
    throw err;
  }
}

export async function loadSiteRegistry(options?: RegistryOptions): Promise<SiteRegistry> {
  try {
    return SiteRegistrySchema.parse(JSON.parse(await readFile(siteRegistryFile(options), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptySiteRegistry(dataRootOf(options));
    }
    throw err;
  }
}

export async function saveTemplateRegistry(
  registry: TemplateRegistry,
  options?: RegistryOptions,
): Promise<void> {
  await writeJson(templateRegistryFile(options), TemplateRegistrySchema.parse(registry));
}

export async function saveSiteRegistry(
  registry: SiteRegistry,
  options?: RegistryOptions,
): Promise<void> {
  await writeJson(siteRegistryFile(options), SiteRegistrySchema.parse(registry));
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

/** Derive the entry for one template run directory and cache it (upsert). */
export async function registerTemplate(
  templateDir: string,
  options?: RegistryOptions,
): Promise<TemplateEntry> {
  const entry = await templateEntryFromDisk(templateDir);
  const registry = await loadTemplateRegistry(options);
  const entries = registry.entries.filter((e) => e.templateId !== entry.templateId);
  entries.push(entry);
  entries.sort((a, b) => (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0));
  await saveTemplateRegistry(
    { ...registry, generatedAt: new Date().toISOString(), entries },
    options,
  );
  return entry;
}

/** Derive the entry for one release project directory and cache it (upsert). */
export async function registerSite(
  projectDir: string,
  options?: RegistryOptions,
): Promise<SiteEntry> {
  const entry = await siteEntryFromDisk(projectDir);
  const registry = await loadSiteRegistry(options);
  const entries = registry.entries.filter((e) => e.siteKey !== entry.siteKey);
  entries.push(entry);
  entries.sort((a, b) => (a.siteKey < b.siteKey ? -1 : a.siteKey > b.siteKey ? 1 : 0));
  await saveSiteRegistry(
    {
      ...registry,
      generatedAt: new Date().toISOString(),
      entries,
      warnings: siteRegistryWarnings(entries),
    },
    options,
  );
  return entry;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listTemplates(options?: RegistryOptions): Promise<TemplateEntry[]> {
  return (await loadTemplateRegistry(options)).entries;
}

export async function listSites(options?: RegistryOptions): Promise<SiteEntry[]> {
  return (await loadSiteRegistry(options)).entries;
}

// ---------------------------------------------------------------------------
// Read — the artifact wins
// ---------------------------------------------------------------------------

/**
 * Read one template back. The cached entry supplies only the DIRECTORY to look
 * in; the entry returned is re-derived from `manifest.json` there. When the
 * cache has no entry (or names a directory that is gone) the data root is
 * scanned, so an unregistered template still reads.
 */
export async function readTemplate(
  templateId: string,
  options?: RegistryOptions,
): Promise<ResolvedEntry<TemplateEntry> | null> {
  const cached = (await loadTemplateRegistry(options)).entries.find(
    (e) => e.templateId === templateId,
  );
  if (cached !== undefined) {
    try {
      const fresh = await templateEntryFromDisk(cached.templateDir);
      return {
        entry: fresh,
        resolvedFrom: "artifact",
        registered: true,
        indexAgreed: entriesAgree(cached, fresh),
        artifactMissing: false,
      };
    } catch {
      // The directory the index names is gone or unreadable — fall through to
      // a scan before giving up on it.
    }
  }
  const scanned = (await scanTemplates(options)).entries.find((e) => e.templateId === templateId);
  if (scanned !== undefined) {
    return {
      entry: scanned,
      resolvedFrom: "artifact",
      registered: cached !== undefined,
      indexAgreed: cached !== undefined && entriesAgree(cached, scanned),
      artifactMissing: false,
    };
  }
  if (cached === undefined) return null;
  return {
    entry: cached,
    resolvedFrom: "index",
    registered: true,
    indexAgreed: false,
    artifactMissing: true,
  };
}

/**
 * Read one site back by `siteKey` (`<host>/<projectId>`) or by `siteId` when
 * that is unambiguous. An ambiguous siteId — the pre-Task-27 legacy case where
 * several projects adapt to the same host slug — resolves to nothing rather
 * than to an arbitrary one of them; use the siteKey.
 */
export async function readSite(
  siteIdOrKey: string,
  options?: RegistryOptions,
): Promise<ResolvedEntry<SiteEntry> | null> {
  const cachedEntries = (await loadSiteRegistry(options)).entries;
  const cached = matchSite(cachedEntries, siteIdOrKey);
  if (cached !== undefined) {
    try {
      const fresh = await siteEntryFromDisk(cached.projectDir);
      return {
        entry: fresh,
        resolvedFrom: "artifact",
        registered: true,
        indexAgreed: entriesAgree(cached, fresh),
        artifactMissing: false,
      };
    } catch {
      // fall through to the scan
    }
  }
  const scanned = matchSite((await scanSites(options)).entries, siteIdOrKey);
  if (scanned !== undefined) {
    return {
      entry: scanned,
      resolvedFrom: "artifact",
      registered: cached !== undefined,
      indexAgreed: cached !== undefined && entriesAgree(cached, scanned),
      artifactMissing: false,
    };
  }
  if (cached === undefined) return null;
  return {
    entry: cached,
    resolvedFrom: "index",
    registered: true,
    indexAgreed: false,
    artifactMissing: true,
  };
}

/** siteKey first (always unique); siteId only when exactly one entry has it. */
function matchSite(entries: SiteEntry[], siteIdOrKey: string): SiteEntry | undefined {
  const byKey = entries.find((e) => e.siteKey === siteIdOrKey);
  if (byKey !== undefined) return byKey;
  const bySiteId = entries.filter((e) => e.siteId === siteIdOrKey);
  return bySiteId.length === 1 ? bySiteId[0] : undefined;
}

/** Every project sharing one siteId, sorted by siteKey. */
export async function sitesWithSiteId(
  siteId: string,
  options?: RegistryOptions,
): Promise<SiteEntry[]> {
  return (await scanSites(options)).entries.filter((e) => e.siteId === siteId);
}

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

export interface RegistryRebuild {
  templates: TemplateRegistry;
  sites: SiteRegistry;
}

/**
 * Throw the index away and derive it again from the artifacts on disk. This is
 * the guarantee that the registry is not a source of truth: losing both files
 * loses nothing but the scan time it takes to make them again.
 */
export async function rebuildRegistry(options?: RegistryOptions): Promise<RegistryRebuild> {
  const root = dataRootOf(options);
  const scannedTemplates = await scanTemplates(options);
  const scannedSites = await scanSites(options);
  const templates: TemplateRegistry = {
    ...emptyTemplateRegistry(root),
    entries: scannedTemplates.entries,
    warnings: scannedTemplates.warnings,
  };
  const sites: SiteRegistry = {
    ...emptySiteRegistry(root),
    entries: scannedSites.entries,
    warnings: [...scannedSites.warnings, ...siteRegistryWarnings(scannedSites.entries)],
  };
  await saveTemplateRegistry(templates, options);
  await saveSiteRegistry(sites, options);
  return { templates, sites };
}
