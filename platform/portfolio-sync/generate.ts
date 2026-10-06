import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AssetRegistryDocSchema, type AssetEntry } from "../assets/assets";
import { CategoriesDocSchema, ProjectSchema, ProjectsDocSchema, projectAssetRefs, type Project } from "../content/schema";
import { buildSiteSnapshot, loadSiteInstance, siteDir as siteDirOf } from "../site/load";
import { hashJson, sha256 } from "../util/hash";
import { EXPORT_MAX_TOTAL_ASSET_BYTES, EXPORT_SCHEMA, PortfolioExportSchema, RESERVED_FILE_SUFFIX, type ExportAsset, type PortfolioExport } from "./contract";
import {
  CATEGORIES_PATH,
  MANAGED_FILE,
  MANAGED_NOTICE,
  MANAGED_SCHEMA,
  PROJECTS_PATH,
  REGISTRY_PATH,
  readManagedManifest,
  serializeManagedManifest,
  type ManagedAsset,
  type ManagedManifest,
} from "./managed";

/**
 * Managed-portfolio generator: export document + asset bytes + the current site directory state →
 * the exact file plan (pure), and the small I/O around it (read the state, apply / undo a plan,
 * validate a plan against a staged copy of the site).
 *
 * Ownership model (see managed.ts): the generator owns content/projects.json, content/categories.json,
 * the image files of the exported assets and THEIR entries in assets/registry.json — nothing else.
 *   - assets/registry.json is shared: generated entries first (id order), then every site-owned entry
 *     exactly as stored, in its stored order. When that is already what the file holds, its bytes are
 *     left alone.
 *   - a file or registry id the generator does not own is never overwritten or deleted; an export
 *     asset that needs one of those names is a collision and the whole plan is refused.
 *   - only what the sidecar lists is ever deleted (an image no project references any more).
 *   - first conversion of a hand-authored site (no sidecar yet): a registry entry is taken over only
 *     when the export names its id AND the hand-authored projects.json references it AND no
 *     site-level configuration (logo, media slots, banners) does. Anything else stays site-owned.
 *
 * Deterministic: the same export on the same site-owned state gives byte-identical files, so the
 * site snapshot hash and the buildInputId do not move and the existing "up-to-date" path applies.
 * Nothing written here carries a clock value.
 */

export class PortfolioGenerateError extends Error {
  constructor(
    message: string,
    public readonly problems: readonly string[] = [],
  ) {
    super(problems.length > 0 ? `${message}: ${problems.join("; ")}` : message);
    this.name = "PortfolioGenerateError";
  }
}

export interface SiteDirState {
  siteId: string;
  /** site.json identity.publicOrigin, as the site schema normalizes it */
  publicOrigin: string | undefined;
  /** the sidecar, when the site is already managed */
  managed: ManagedManifest | undefined;
  /** assets/registry.json as stored */
  registry: { text: string; origin: string; items: AssetEntry[] };
  /** sha256 of the files the generator may touch or collide with: the sidecar, the two content documents, assets/* */
  files: ReadonlyMap<string, string>;
  /** asset ids the SITE's own configuration references: identity.logo, media slot values, banner images */
  siteAssetRefs: ReadonlySet<string>;
  /** the projects on disk BEFORE regeneration (read leniently: a broken file yields what can be read) */
  projects: readonly { id: string; slug: string; assetRefs: readonly string[] }[];
}

export interface PlannedFile {
  /** path relative to the site directory */
  path: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  action: "create" | "replace" | "unchanged";
}

export interface PortfolioFilePlan {
  siteId: string;
  revision: number;
  /** every file the generator owns after this plan, sidecar first */
  files: PlannedFile[];
  /** generated files of the previous generation that no longer exist */
  removes: string[];
  /** only with removes: the sidecar written before anything else, still owning the files about to be deleted */
  intent?: Uint8Array;
  manifest: ManagedManifest;
  /** false = the site directory already is this generation (nothing to write or delete) */
  changed: boolean;
  /** the records the site serves after this plan */
  projects: { id: string; slug: string }[];
  /** every record that left the generated portfolio and was not published again (→ the sidecar; the loader's "known but not served" ids) */
  retired: { id: string; slug: string }[];
  /** the export's changes.removing: the records whose old detail URL must be verified absent, by id */
  removing: { id: string; slug: string }[];
  /** first conversion only: hand-authored portfolio assets the generator took over */
  adopted: string[];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const lower = (s: string) => s.toLowerCase();
const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join(", ");

function looksLike(mediaType: ExportAsset["mediaType"], b: Uint8Array): boolean {
  if (mediaType === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mediaType === "image/png") return b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  const ascii = (from: number, text: string) => [...text].every((ch, i) => b[from + i] === ch.charCodeAt(0));
  return b.length > 12 && ascii(0, "RIFF") && ascii(8, "WEBP");
}

/**
 * Parse an export document. An unknown `schema` is reported as exactly that (contract §6: the
 * publisher does not proceed on a version it does not know), before any shape error.
 */
export function parseExport(raw: unknown): PortfolioExport {
  const schema = (raw as { schema?: unknown } | null)?.schema;
  if (schema !== EXPORT_SCHEMA) throw new PortfolioGenerateError(`unknown export schema ${JSON.stringify(schema)} (this publisher understands only "${EXPORT_SCHEMA}")`);
  const parsed = PortfolioExportSchema.safeParse(raw);
  if (!parsed.success) throw new PortfolioGenerateError(`export document is not a valid ${EXPORT_SCHEMA}`, [issues(parsed.error)]);
  return parsed.data;
}

/**
 * PURE. Validates everything and returns the complete file plan, or throws PortfolioGenerateError
 * listing every problem found. Nothing is read or written.
 */
export function planManagedPortfolio(input: { export: unknown; assetBytes: ReadonlyMap<string, Uint8Array>; site: SiteDirState }): PortfolioFilePlan {
  const exp = parseExport(input.export);
  const { site, assetBytes } = input;
  const problems: string[] = [];

  if (exp.site.siteId !== site.siteId) throw new PortfolioGenerateError(`export is for site "${exp.site.siteId}", not "${site.siteId}"`);
  if (site.publicOrigin === undefined) throw new PortfolioGenerateError(`site "${site.siteId}" has no publicOrigin in site.json; the export's ${exp.site.publicOrigin} cannot be confirmed (contract P5)`);
  if (exp.site.publicOrigin !== site.publicOrigin) {
    throw new PortfolioGenerateError(`export publicOrigin ${exp.site.publicOrigin} ≠ site.json publicOrigin ${site.publicOrigin} (contract P5)`);
  }

  // ---- projects: each one through the platform's own content model (contract P1) ----
  const projects: Project[] = [];
  exp.projects.forEach((raw, i) => {
    const id = typeof (raw as { id?: unknown } | null)?.id === "string" ? (raw as { id: string }).id : "?";
    const parsed = ProjectSchema.safeParse(raw);
    if (!parsed.success) return void problems.push(`projects[${i}] (id "${id}") is not a valid project: ${issues(parsed.error)}`);
    if (parsed.data.status !== "published") return void problems.push(`projects[${i}] (id "${id}") has status "${parsed.data.status}"; an export carries published records only (contract P1)`);
    projects.push(parsed.data);
  });
  if (problems.length > 0) throw new PortfolioGenerateError("export projects refused", problems);
  projects.sort((a, b) => compare(a.id, b.id));

  const projectsDoc = ProjectsDocSchema.safeParse({ schema: "projects@1", origin: exp.site.contentOrigin, items: projects });
  if (!projectsDoc.success) problems.push(`projects document invalid: ${issues(projectsDoc.error)}`);
  const categoriesDoc = CategoriesDocSchema.safeParse({ schema: "categories@1", origin: exp.site.contentOrigin, items: exp.categories });
  if (!categoriesDoc.success) problems.push(`categories document invalid: ${issues(categoriesDoc.error)}`);
  const categoryIds = new Set(exp.categories.map((c) => c.id));
  for (const p of projects) if (!categoryIds.has(p.category)) problems.push(`project "${p.id}" names category "${p.category}", which the export does not define (contract P2)`);
  const projectIds = new Set(projects.map((p) => p.id));
  const removingSeen = new Set<string>();
  for (const r of exp.changes.removing) {
    if (projectIds.has(r.id)) problems.push(`changes.removing names "${r.id}", which is also in projects`);
    if (removingSeen.has(r.id)) problems.push(`changes.removing lists id "${r.id}" twice`);
    removingSeen.add(r.id);
  }

  // ---- assets: exactly the referenced set (contract P3), bytes as declared (contract §3) ----
  const referenced = new Set(projects.flatMap(projectAssetRefs));
  const exportIds = new Set<string>();
  const exportFiles = new Set<string>();
  for (const a of exp.assets) {
    if (exportIds.has(a.id)) problems.push(`assets lists id "${a.id}" twice`);
    exportIds.add(a.id);
    if (exportFiles.has(lower(a.file))) problems.push(`assets lists file "${a.file}" twice`);
    exportFiles.add(lower(a.file));
    if (lower(a.file) === "registry.json" || lower(a.file).endsWith(RESERVED_FILE_SUFFIX)) problems.push(`asset "${a.id}" uses the reserved file name ${a.file}`);
    if (!referenced.has(a.id)) problems.push(`asset "${a.id}" is not referenced by any project (contract P3: no extras)`);
    const bytes = assetBytes.get(a.id);
    if (!bytes) {
      problems.push(`asset "${a.id}": no bytes were supplied`);
      continue;
    }
    if (bytes.length !== a.size) problems.push(`asset "${a.id}": size ${bytes.length} ≠ declared ${a.size}`);
    else if (sha256(bytes) !== a.sha256) problems.push(`asset "${a.id}": sha256 ${sha256(bytes).slice(0, 12)}… ≠ declared ${a.sha256.slice(0, 12)}…`);
    else if (!looksLike(a.mediaType, bytes)) problems.push(`asset "${a.id}": the bytes are not ${a.mediaType}`);
  }
  const totalBytes = exp.assets.reduce((n, a) => n + a.size, 0);
  if (totalBytes > EXPORT_MAX_TOTAL_ASSET_BYTES) problems.push(`assets total ${totalBytes} B, over the publisher's limit of ${EXPORT_MAX_TOTAL_ASSET_BYTES} B`);
  for (const ref of [...referenced].sort(compare)) if (!exportIds.has(ref)) problems.push(`asset "${ref}" is referenced by a project but missing from assets (contract P3)`);

  // ---- ownership: what the generator owned before, what the site owns, collisions ----
  const legacyRefs = new Set(site.projects.flatMap((p) => p.assetRefs));
  const adopted = site.managed ? [] : site.registry.items.filter((e) => exportIds.has(e.id) && legacyRefs.has(e.id) && !site.siteAssetRefs.has(e.id));
  // an interrupted regeneration left files of the generation before it: still the generator's
  const previous: { id: string; file: string }[] = site.managed ? [...site.managed.assets, ...(site.managed.interrupted ?? [])] : adopted;
  const previousIds = new Set(previous.map((a) => a.id));
  const previousFiles = new Set(previous.map((a) => lower(a.file)));
  const siteOwned = site.registry.items.filter((e) => !previousIds.has(e.id));
  const siteOwnedIds = new Set(siteOwned.map((e) => e.id));
  const siteOwnedFiles = new Set(siteOwned.map((e) => lower(e.file)));
  const onDisk = new Set([...site.files.keys()].filter((f) => f.startsWith("assets/")).map((f) => lower(f.slice("assets/".length))));
  for (const a of exp.assets) {
    if (siteOwnedIds.has(a.id)) problems.push(`asset id "${a.id}" collides with a site-level asset of the same id in ${REGISTRY_PATH}; site-level assets are never overwritten`);
    if (siteOwnedFiles.has(lower(a.file))) problems.push(`asset "${a.id}" would write assets/${a.file}, which belongs to a site-level asset; site-level files are never overwritten`);
    else if (onDisk.has(lower(a.file)) && !previousFiles.has(lower(a.file))) problems.push(`asset "${a.id}" would write assets/${a.file}, a file this generator did not create; refusing to overwrite it`);
  }
  if (problems.length > 0 || !projectsDoc.success || !categoriesDoc.success) throw new PortfolioGenerateError("export refused", problems);

  // ---- outputs ----
  const text = (doc: unknown) => new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`);
  const assets: ManagedAsset[] = [...exp.assets]
    .sort((a, b) => compare(a.id, b.id))
    .map((a) => ({ id: a.id, file: a.file, mediaType: a.mediaType, width: a.width, height: a.height, sha256: a.sha256, size: a.size }));
  const registryDoc = {
    schema: "assets@1" as const,
    origin: site.registry.origin,
    items: [...assets.map(({ sha256: _s, size: _z, ...entry }) => entry), ...siteOwned],
  };
  const registryParsed = AssetRegistryDocSchema.safeParse(registryDoc);
  if (!registryParsed.success) throw new PortfolioGenerateError(`generated ${REGISTRY_PATH} is invalid`, [issues(registryParsed.error)]);
  // the registry is shared with the site: when it already says exactly this, its bytes stay as they are
  const registrySame = JSON.stringify({ schema: "assets@1", origin: site.registry.origin, items: site.registry.items }) === JSON.stringify(registryDoc);
  const registryBytes = registrySame ? new TextEncoder().encode(site.registry.text) : text(registryDoc);

  // retired = every id that left: earlier retirements, the records of the previous projects.json (the
  // hand-authored one on the first managed run) and the export's removing — minus what is published
  // (again) now. The slug is the latest known one: the export's, else the previous record's.
  const removing = [...exp.changes.removing].map((r) => ({ id: r.id, slug: r.slug })).sort((a, b) => compare(a.id, b.id));
  const left = new Map<string, string>([...(site.managed?.retired ?? []), ...site.projects, ...removing].map((r) => [r.id, r.slug] as const));
  const retired = [...left].filter(([id]) => !projectIds.has(id)).map(([id, slug]) => ({ id, slug })).sort((a, b) => compare(a.id, b.id));

  const projectsBytes = text(projectsDoc.data);
  const categoriesBytes = text(categoriesDoc.data);
  const manifest: ManagedManifest = {
    schema: MANAGED_SCHEMA,
    notice: MANAGED_NOTICE,
    source: { schema: exp.schema, siteId: exp.site.siteId, revision: exp.revision },
    content: [
      { path: CATEGORIES_PATH, sha256: sha256(categoriesBytes), size: categoriesBytes.length },
      { path: PROJECTS_PATH, sha256: sha256(projectsBytes), size: projectsBytes.length },
    ],
    assets,
    retired,
  };

  const outputs: [string, Uint8Array][] = [
    [MANAGED_FILE, new TextEncoder().encode(serializeManagedManifest(manifest))],
    [CATEGORIES_PATH, categoriesBytes],
    [PROJECTS_PATH, projectsBytes],
    [REGISTRY_PATH, registryBytes],
    ...assets.map((a) => [`assets/${a.file}`, assetBytes.get(a.id)!] as [string, Uint8Array]),
  ];
  const files: PlannedFile[] = outputs.map(([p, bytes]) => {
    const hash = sha256(bytes);
    const before = site.files.get(p);
    return { path: p, bytes, sha256: hash, size: bytes.length, action: before === undefined ? "create" : before === hash ? "unchanged" : "replace" };
  });
  const keep = new Set(assets.map((a) => lower(a.file)));
  const removes = previous
    .filter((a) => !keep.has(lower(a.file)) && site.files.has(`assets/${a.file}`))
    .map((a) => `assets/${a.file}`)
    .sort(compare);

  // crash safety: when files are deleted, a sidecar that still owns them is written FIRST (applyFilePlan)
  const removeSet = new Set(removes);
  const interrupted = previous.filter((a) => removeSet.has(`assets/${a.file}`)).map((a) => ({ id: a.id, file: a.file }));
  const intent = interrupted.length > 0 ? new TextEncoder().encode(serializeManagedManifest({ ...manifest, interrupted })) : undefined;

  return {
    siteId: site.siteId,
    revision: exp.revision,
    files,
    removes,
    ...(intent ? { intent } : {}),
    manifest,
    changed: removes.length > 0 || files.some((f) => f.action !== "unchanged"),
    projects: projects.map((p) => ({ id: p.id, slug: p.slug })),
    retired,
    removing,
    adopted: adopted.map((e) => e.id).sort(compare),
  };
}

// ------------------------------------------------------------------- I/O ----

async function readJsonIfPresent(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return JSON.parse(text);
}

/** The current state of a site directory, as the planner needs it. Reads only. */
export async function readSiteDirState(repoRoot: string, siteId: string): Promise<SiteDirState> {
  const dir = siteDirOf(repoRoot, siteId);
  const site = await loadSiteInstance(repoRoot, siteId);
  const managed = await readManagedManifest(dir);

  const registryText = await readFile(path.join(dir, REGISTRY_PATH), "utf8");
  const registry = AssetRegistryDocSchema.safeParse(JSON.parse(registryText));
  if (!registry.success) throw new PortfolioGenerateError(`${siteId}/${REGISTRY_PATH} is invalid`, [issues(registry.error)]);

  const files = new Map<string, string>();
  for (const rel of [MANAGED_FILE, PROJECTS_PATH, CATEGORIES_PATH]) {
    const bytes = await readFile(path.join(dir, rel)).catch(() => undefined);
    if (bytes) files.set(rel, sha256(bytes));
  }
  for (const e of await readdir(path.join(dir, "assets"), { withFileTypes: true })) {
    // a non-regular entry still occupies its name (it is never hashed, so it can never look "unchanged")
    files.set(`assets/${e.name}`, e.isFile() ? sha256(await readFile(path.join(dir, "assets", e.name))) : "not-a-regular-file");
  }

  const siteAssetRefs = new Set<string>();
  if (site.identity.logo) siteAssetRefs.add(site.identity.logo);
  const slots = (await readJsonIfPresent(path.join(dir, "slots.json"))) as { values?: Record<string, Record<string, unknown>> } | undefined;
  for (const section of Object.values(slots?.values ?? {})) {
    for (const v of Object.values(section ?? {})) {
      const asset = (v as { asset?: unknown } | null)?.asset;
      if (typeof asset === "string") siteAssetRefs.add(asset);
    }
  }
  const banners = (await readJsonIfPresent(path.join(dir, "content/banners.json"))) as { items?: { image?: { asset?: unknown } }[] } | undefined;
  for (const b of banners?.items ?? []) if (typeof b?.image?.asset === "string") siteAssetRefs.add(b.image.asset);

  // lenient on purpose: the slugs of a damaged projects.json are still needed to check removals
  const stored = (await readJsonIfPresent(path.join(dir, PROJECTS_PATH)).catch(() => undefined)) as { items?: unknown } | undefined;
  const projects: { id: string; slug: string; assetRefs: string[] }[] = [];
  for (const raw of Array.isArray(stored?.items) ? stored.items : []) {
    const item = raw as { id?: unknown; slug?: unknown } | null;
    if (typeof item?.id !== "string" || typeof item.slug !== "string") continue;
    const parsed = ProjectSchema.safeParse(raw);
    projects.push({ id: item.id, slug: item.slug, assetRefs: parsed.success ? projectAssetRefs(parsed.data) : [] });
  }

  return {
    siteId,
    publicOrigin: site.identity.publicOrigin,
    managed,
    registry: { text: registryText, origin: registry.data.origin, items: registry.data.items },
    files,
    siteAssetRefs,
    projects,
  };
}

const TMP_SUFFIX = RESERVED_FILE_SUFFIX;

export interface AppliedPlan {
  /** what each touched path held before (null = it did not exist), in the order it was changed */
  undo: { path: string; previous: Uint8Array | null }[];
}

async function previousBytes(file: string): Promise<Uint8Array | null> {
  const st = await lstat(file).catch(() => undefined);
  if (!st) return null;
  if (!st.isFile()) throw new PortfolioGenerateError(`${file} exists and is not a regular file; refusing to replace it`);
  return readFile(file);
}

/**
 * Write a plan into a site directory. Everything is validated before this is called; here each new
 * file is first written beside its target and only then renamed over it (sidecar first, so any
 * interrupted run leaves a directory the loader guard refuses), and deletions come last. A failure
 * part-way puts every touched file back before rethrowing. Returns what is needed to undo it later.
 */
export async function applyFilePlan(siteDir: string, plan: PortfolioFilePlan): Promise<AppliedPlan> {
  const writes = plan.files.filter((f) => f.action !== "unchanged");
  const undo: AppliedPlan["undo"] = [];
  if (plan.intent && !writes.some((f) => f.path === MANAGED_FILE)) throw new PortfolioGenerateError("internal: a plan that deletes files must rewrite the sidecar");
  for (const p of [...writes.map((f) => f.path), ...plan.removes]) undo.push({ path: p, previous: await previousBytes(path.join(siteDir, p)) });
  const staged: string[] = [];
  let touched = 0;
  // leftovers of an interrupted run
  for (const sub of ["", "content", "assets"]) {
    for (const name of await readdir(path.join(siteDir, sub)).catch(() => [] as string[])) {
      if (name.endsWith(TMP_SUFFIX)) await rm(path.join(siteDir, sub, name), { force: true });
    }
  }
  try {
    for (const f of writes) {
      const target = path.join(siteDir, f.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(`${target}${TMP_SUFFIX}`, f.bytes);
      staged.push(`${target}${TMP_SUFFIX}`);
    }
    // Order: the sidecar first, so an interrupted run leaves a directory the loader refuses. When this
    // generation deletes files, that first sidecar is the INTENT one (it still owns them, so the next
    // run can delete them instead of mistaking them for site-level files) and the final sidecar goes last.
    const sidecar = path.join(siteDir, MANAGED_FILE);
    if (plan.intent) {
      await writeFile(`${sidecar}.intent${TMP_SUFFIX}`, plan.intent);
      staged.push(`${sidecar}.intent${TMP_SUFFIX}`);
      await rename(`${sidecar}.intent${TMP_SUFFIX}`, sidecar);
      touched++;
    }
    const ordered = plan.intent ? [...writes.filter((f) => f.path !== MANAGED_FILE), ...writes.filter((f) => f.path === MANAGED_FILE)] : writes;
    const beforeLast = async () => {
      for (const p of plan.removes) {
        await rm(path.join(siteDir, p), { force: true });
        touched++;
      }
    };
    for (const f of ordered) {
      if (plan.intent && f.path === MANAGED_FILE) await beforeLast();
      await rename(`${path.join(siteDir, f.path)}${TMP_SUFFIX}`, path.join(siteDir, f.path));
      touched++;
    }
    if (!plan.intent) await beforeLast();
  } catch (error) {
    for (const s of staged) await rm(s, { force: true }).catch(() => {});
    // nothing was renamed or deleted yet → nothing to put back
    if (touched > 0) await restoreAppliedPlan(siteDir, { undo }).catch(() => {});
    throw error;
  }
  return { undo };
}

/** Put back exactly what applyFilePlan replaced or deleted (and delete what it created). */
export async function restoreAppliedPlan(siteDir: string, applied: AppliedPlan): Promise<void> {
  for (const u of [...applied.undo].reverse()) {
    const target = path.join(siteDir, u.path);
    if (u.previous === null) await rm(target, { force: true });
    else {
      await writeFile(`${target}${TMP_SUFFIX}`, u.previous);
      await rename(`${target}${TMP_SUFFIX}`, target);
    }
  }
}

export interface StagedValidation {
  /** siteSnapshotHash of the regenerated site (public mode, at `at`) */
  siteSnapshotHash: string;
  servedIds: string[];
}

/**
 * Prove a plan against the REAL loader without touching the site directory: copy the site into a
 * throwaway root, apply the plan there and load it (public mode). Catches everything the loader
 * refuses — a banner CTA or a site-level reference that names something the export removed, a
 * category nobody defines — and a record that would not be served yet (publishedAt in the future),
 * which the public URL check could never confirm.
 */
export async function validatePlanStaged(opts: { repoRoot: string; siteId: string; plan: PortfolioFilePlan; at?: string }): Promise<StagedValidation> {
  const stageRoot = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-stage-"));
  try {
    const staged = path.join(stageRoot, "data/sites", opts.siteId);
    await mkdir(path.dirname(staged), { recursive: true });
    await cp(siteDirOf(opts.repoRoot, opts.siteId), staged, { recursive: true });
    await applyFilePlan(staged, opts.plan);
    let loaded: Awaited<ReturnType<typeof buildSiteSnapshot>>;
    try {
      loaded = await buildSiteSnapshot({ repoRoot: stageRoot, siteId: opts.siteId, mode: "public", at: opts.at ?? new Date().toISOString() });
    } catch (error) {
      throw new PortfolioGenerateError(`the regenerated site does not load: ${(error as Error).message.split(stageRoot).join("")}`);
    }
    const served = new Set(loaded.snapshot.content.projects.map((p) => p.id));
    const notServed = opts.plan.projects.filter((p) => !served.has(p.id)).map((p) => p.id);
    if (notServed.length > 0) throw new PortfolioGenerateError(`exported records would not be served yet (publishedAt in the future?): ${notServed.join(", ")}`);
    return { siteSnapshotHash: hashJson(loaded.snapshot), servedIds: [...served].sort(compare) };
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}
