/**
 * TEMPLATE CATALOG — the read-only export BoostChat's Super Admin reads (contract: schema "site-template-catalog@1").
 *
 * Track B owns the truth: the releases in data/template-releases/ (id, version, hash, portfolio runtime
 * capability) plus a small hand-written presentation file per template, data/template-catalog/<templateId>.json
 * (name, tagline, description, features, demo URL, preview file names) and the preview pictures next to it.
 *
 *   data/template-catalog/<templateId>.json                 presentation metadata (strict, unknown keys refused)
 *   data/template-catalog/previews/<templateId>-{desktop,mobile}.jpg
 *   data/site-starters/<templateId>/starter.json            written by the site-starter work:
 *                                                            { schema: "site-starter@1", templateId, releaseIds: [...] }
 *
 * Pure: reads files, writes nothing (writeCatalogExport / checkCatalogExport in the CLI do the writing). Deterministic:
 * explicit key order, sorted arrays; only `generatedAt` varies between two runs.
 */
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolvePortfolioRuntime } from "../portfolio-runtime/capability";
import { RELEASES_DIR, loadRelease } from "../release/release";
import { sha256 } from "../util/hash";

export const CATALOG_SCHEMA = "site-template-catalog@1";
export const CATALOG_META_DIR = "data/template-catalog";
export const PREVIEW_DIR = "data/template-catalog/previews";
export const STARTERS_DIR = "data/site-starters";
export const STARTER_SCHEMA = "site-starter@1";

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

const TEMPLATE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PREVIEW_FILE_RE = /^[a-z0-9][a-z0-9-]*\.jpg$/;
const text = z.string().trim().min(1);

/** The hand-written presentation file of one template. */
export const TemplateMetaSchema = z
  .object({
    templateId: z.string().regex(TEMPLATE_ID_RE),
    displayName: text,
    tagline: text,
    description: text,
    features: z.array(text).min(3).max(5),
    demoUrl: z.string().url().refine((u) => u.startsWith("https://"), "demoUrl must be https"),
    previewFiles: z.object({ desktop: z.string().regex(PREVIEW_FILE_RE), mobile: z.string().regex(PREVIEW_FILE_RE) }).strict(),
  })
  .strict();
export type TemplateMeta = z.infer<typeof TemplateMetaSchema>;

/** Parse a presentation file; its `templateId` must be the file's name. */
export function parseTemplateMeta(raw: unknown, expectedTemplateId: string): TemplateMeta {
  const parsed = TemplateMetaSchema.safeParse(raw);
  if (!parsed.success) throw new CatalogError(`template metadata ${expectedTemplateId}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  if (parsed.data.templateId !== expectedTemplateId) throw new CatalogError(`template metadata ${expectedTemplateId}.json declares templateId "${parsed.data.templateId}"`);
  return parsed.data;
}

const StarterSchema = z.object({ schema: z.literal(STARTER_SCHEMA), templateId: z.string(), releaseIds: z.array(z.string()) }).strict();

// ------------------------------------------------------------ output types ---

export interface CatalogPreview {
  file: string;
  width: number;
  height: number;
  sha256: string;
}
export interface CatalogRelease {
  releaseId: string;
  templateVersion: string;
  releaseHash: string;
  portfolioRuntime: { supported: boolean; contract: string | null };
  starter: boolean;
}
export interface CatalogTemplate {
  templateId: string;
  displayName: string;
  tagline: string;
  description: string;
  features: string[];
  demoUrl: string;
  previews: { desktop: CatalogPreview | null; mobile: CatalogPreview | null };
  releases: CatalogRelease[];
}
export interface Catalog {
  schema: typeof CATALOG_SCHEMA;
  generatedAt: string;
  sourceCommit: string;
  templates: CatalogTemplate[];
}
export interface BuiltCatalog {
  catalog: Catalog;
  /** preview file (relative to the export dir, e.g. previews/interior-01-desktop.jpg) -> bytes */
  previews: Map<string, Buffer>;
}

// ------------------------------------------------------------------ helpers ---

/** Width/height of a JPEG from its SOF marker. */
export function jpegSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new CatalogError("not a JPEG (missing SOI)");
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new CatalogError("malformed JPEG (marker expected)");
    let marker = buf[i + 1];
    while (marker === 0xff && i + 2 < buf.length) {
      i += 1;
      marker = buf[i + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (c4), JPG (c8), DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new CatalogError("malformed JPEG (no SOF marker)");
}

function semverParts(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new CatalogError(`templateVersion "${v}" is not semver`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/** newest first; same version: later createdAt first, then releaseId */
function releaseOrder(a: { templateVersion: string; createdAt: string; releaseId: string }, b: typeof a): number {
  const pa = semverParts(a.templateVersion);
  const pb = semverParts(b.templateVersion);
  for (let k = 0; k < 3; k++) if (pa[k] !== pb[k]) return pb[k] - pa[k];
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.releaseId < b.releaseId ? -1 : a.releaseId > b.releaseId ? 1 : 0;
}

async function dirNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function gitHead(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new CatalogError("cannot read the git HEAD of the repository (sourceCommit)");
  }
}

// ------------------------------------------------------------------ builder ---

export interface BuildCatalogOptions {
  repoRoot: string;
  /** default: now */
  generatedAt?: string;
  /** default: git HEAD of repoRoot */
  sourceCommit?: string;
  /** default: <repoRoot>/data/template-catalog */
  metaDir?: string;
  /** default: <repoRoot>/data/site-starters */
  startersDir?: string;
}

export async function buildCatalog(opts: BuildCatalogOptions): Promise<BuiltCatalog> {
  const { repoRoot } = opts;
  const metaDir = opts.metaDir ?? path.join(repoRoot, CATALOG_META_DIR);
  const previewSrcDir = path.join(metaDir, "previews");
  const startersDir = opts.startersDir ?? path.join(repoRoot, STARTERS_DIR);

  const storeTemplates = await dirNames(path.join(repoRoot, RELEASES_DIR));
  let metaIds: string[] = [];
  try {
    metaIds = (await readdir(metaDir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)).sort();
  } catch {
    throw new CatalogError(`${metaDir} does not exist`);
  }
  for (const id of metaIds) if (!storeTemplates.includes(id)) throw new CatalogError(`template metadata ${id}.json: no release of template "${id}" in ${RELEASES_DIR}`);
  for (const id of storeTemplates) if (!metaIds.includes(id)) throw new CatalogError(`template "${id}" has releases but no ${CATALOG_META_DIR}/${id}.json`);

  const previews = new Map<string, Buffer>();
  const templates: CatalogTemplate[] = [];
  for (const templateId of metaIds) {
    const meta = parseTemplateMeta(JSON.parse(await readFile(path.join(metaDir, `${templateId}.json`), "utf8")), templateId);

    const previewOf = async (name: string): Promise<CatalogPreview | null> => {
      const bytes = await readOptional(path.join(previewSrcDir, name));
      if (!bytes) return null;
      const { width, height } = jpegSize(bytes);
      const file = `previews/${name}`;
      previews.set(file, bytes);
      return { file, width, height, sha256: sha256(bytes) };
    };
    const desktop = await previewOf(meta.previewFiles.desktop);
    const mobile = await previewOf(meta.previewFiles.mobile);

    const releaseIds = await dirNames(path.join(repoRoot, RELEASES_DIR, templateId));
    const records = await Promise.all(releaseIds.map((id) => loadRelease(repoRoot, templateId, id)));
    records.sort(releaseOrder);

    const starterRaw = await readOptional(path.join(startersDir, templateId, "starter.json"));
    let starterIds = new Set<string>();
    if (starterRaw) {
      const parsed = StarterSchema.safeParse(JSON.parse(starterRaw.toString("utf8")));
      if (!parsed.success) throw new CatalogError(`site starter ${templateId}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
      if (parsed.data.templateId !== templateId) throw new CatalogError(`site starter ${templateId}: declares templateId "${parsed.data.templateId}"`);
      for (const r of parsed.data.releaseIds) if (!releaseIds.includes(r)) throw new CatalogError(`site starter ${templateId}: release "${r}" is not in the release store`);
      starterIds = new Set(parsed.data.releaseIds);
    }

    templates.push({
      templateId,
      displayName: meta.displayName,
      tagline: meta.tagline,
      description: meta.description,
      features: meta.features,
      demoUrl: meta.demoUrl,
      previews: { desktop, mobile },
      releases: records.map((r) => {
        const support = resolvePortfolioRuntime(r);
        return {
          releaseId: r.releaseId,
          templateVersion: r.templateVersion,
          releaseHash: r.releaseHash,
          portfolioRuntime: support.supported ? { supported: true, contract: support.contract } : { supported: false, contract: null },
          starter: starterIds.has(r.releaseId),
        };
      }),
    });
  }

  return {
    catalog: { schema: CATALOG_SCHEMA, generatedAt: opts.generatedAt ?? new Date().toISOString(), sourceCommit: opts.sourceCommit ?? gitHead(repoRoot), templates },
    previews,
  };
}

/** Canonical bytes of catalog.json. */
export function serializeCatalog(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

// ------------------------------------------------------------ write / check ---

/** Write catalog.json and previews/*.jpg into `outDir`; stale previews/*.jpg are removed; nothing else is touched. */
export async function writeCatalogExport(outDir: string, built: BuiltCatalog): Promise<void> {
  const { mkdir, writeFile, rm } = await import("node:fs/promises");
  await mkdir(path.join(outDir, "previews"), { recursive: true });
  for (const name of await listPreviewFiles(outDir)) if (!built.previews.has(`previews/${name}`)) await rm(path.join(outDir, "previews", name));
  for (const [file, bytes] of built.previews) await writeFile(path.join(outDir, file), bytes);
  await writeFile(path.join(outDir, "catalog.json"), serializeCatalog(built.catalog));
}

async function listPreviewFiles(outDir: string): Promise<string[]> {
  try {
    return (await readdir(path.join(outDir, "previews"))).filter((f) => f.endsWith(".jpg")).sort();
  } catch {
    return [];
  }
}

/** Differences between `dir` and what `built` would write, ignoring generatedAt. Empty = in sync. */
export async function diffCatalogExport(dir: string, built: BuiltCatalog): Promise<string[]> {
  const problems: string[] = [];
  const existing = await readOptional(path.join(dir, "catalog.json"));
  if (!existing) problems.push("catalog.json is missing");
  else {
    try {
      const have = JSON.parse(existing.toString("utf8")) as Catalog;
      const want = { ...built.catalog, generatedAt: have.generatedAt };
      if (serializeCatalog(have) !== serializeCatalog(want as Catalog)) problems.push("catalog.json differs");
    } catch {
      problems.push("catalog.json is not valid JSON");
    }
  }
  const have = new Set(await listPreviewFiles(dir));
  for (const [file, bytes] of built.previews) {
    const name = file.slice("previews/".length);
    const got = await readOptional(path.join(dir, file));
    if (!got) problems.push(`${file} is missing`);
    else if (!got.equals(bytes)) problems.push(`${file} differs`);
    have.delete(name);
  }
  for (const name of have) problems.push(`previews/${name} is not part of the catalog`);
  return problems;
}
