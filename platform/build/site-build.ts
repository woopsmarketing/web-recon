import { spawn } from "node:child_process";
import { appendFile, copyFile, cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashJson, sha256 } from "../util/hash";
import { loadRelease, materializeRelease, verifyRelease, type ReleaseRecord } from "../release/release";
import { buildSiteSnapshot, loadSiteInstance } from "../site/load";
import type { BuildMode, SiteSnapshot } from "../site/instance";
import { computeBuildInputId, currentToolchain, toolchainHash, type Toolchain } from "./build-input";
import { qaStaticPackage, type PackageQaResult } from "./qa";
import type { PruneEntry } from "../site/routes";

/**
 * site:build — exact pinned Template Release + site snapshot → static package.
 *
 *  1. verify the pinned release is intact (re-hash)
 *  2. canonical site snapshot (visible content at `at`, referenced assets) → buildInputId
 *  3. disposable workspace OUTSIDE the repo: release files + scoped manifest/lockfile
 *  4. pnpm install --offline --frozen-lockfile (scoped lockfile, no repo node_modules)
 *  5. preflight (release code: settings, slots, route plan) → prune app/ routes that generate
 *     no page for this site (Next static export aborts on an empty generateStaticParams)
 *     → next build (static export) with an allowlisted env
 *  6. package QA (exactly the planned pages) → data/site-builds/<siteId>/packages/<buildInputId>/
 *  7. current → previous (the one retained rollback package); older packages pruned
 */

export const SITE_BUILDS_DIR = "data/site-builds";

export class SiteBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteBuildError";
  }
}

export interface BuildRecord {
  schemaVersion: 1;
  siteId: string;
  status: "success";
  buildInputId: string;
  parts: { releaseHash: string; siteSnapshotHash: string; mode: BuildMode; toolchainHash: string };
  toolchain: Toolchain;
  template: { templateId: string; templateVersion: string; releaseId: string; releaseHash: string; templateSourceHash: string };
  at: string;
  startedAt: string;
  finishedAt: string;
  durationMs: { total: number; install: number; preflight: number; nextBuild: number; qa: number };
  packageHash: string;
  qa: PackageQaResult;
  preflight: {
    selections: Record<string, { mode: string; resultCount: number }>;
    warnings: string[];
    /** slot → value source (site / binding / neutral-default / hidden) */
    slotSources: Record<string, Record<string, string>>;
    /** route key → number of generated pages */
    routes: Record<string, number>;
    /** routes that generate no page for this site, removed from the workspace before next build */
    pruned: PruneEntry[];
  };
  effectiveSettingsHash: string;
  effectiveThemeHash: string;
  hermeticity: string[];
}

interface Pointer {
  buildInputId: string;
  packageDir: string;
  finishedAt: string;
}

export interface SiteBuildOptions {
  repoRoot: string;
  siteId: string;
  mode?: BuildMode;
  at?: string;
  /** Explicit release id requested by the operator; must equal the site's pin. */
  releaseId?: string;
  force?: boolean;
  keepWorkspace?: boolean;
  log?: (line: string) => void;
}

export type SiteBuildResult =
  | { status: "built"; record: BuildRecord; packageDir: string; previous?: Pointer }
  | { status: "up-to-date"; buildInputId: string; packageDir: string };

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const cap = (s: string, add: string) => (s + add).slice(-200_000);
    child.stdout.on("data", (d: Buffer) => (stdout = cap(stdout, d.toString())));
    child.stderr.on("data", (d: Buffer) => (stderr = cap(stderr, d.toString())));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new SiteBuildError(`${cmd} ${args.join(" ")} exited ${code}\n${stderr.slice(-4000)}\n${stdout.slice(-4000)}`));
    });
  });
}

/** Allowlisted environment: nothing from the operator shell reaches the build except these. */
function buildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const nodeBin = path.dirname(process.execPath);
  return {
    PATH: [nodeBin, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
    HOME: os.homedir(),
    TMPDIR: os.tmpdir(),
    LANG: "C.UTF-8",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    CI: "1",
    ...extra,
  };
}

async function readPointer(file: string): Promise<Pointer | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Pointer;
  } catch {
    return undefined;
  }
}

async function hashDir(dir: string): Promise<string> {
  const entries: { path: string; sha256: string }[] = [];
  async function walk(d: string, rel: string) {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else entries.push({ path: r, sha256: sha256(await readFile(path.join(d, e.name))) });
    }
  }
  await walk(dir, "");
  return hashJson(entries);
}

export async function prepareSiteInput(opts: { repoRoot: string; siteId: string; mode: BuildMode; at: string; releaseId?: string }) {
  const site = await loadSiteInstance(opts.repoRoot, opts.siteId);
  const pin = site.template;
  if (opts.releaseId && opts.releaseId !== pin.releaseId) {
    throw new SiteBuildError(
      `release mismatch: site "${opts.siteId}" is pinned to ${pin.releaseId}; refusing to build with ${opts.releaseId} (upgrade the pin explicitly)`,
    );
  }
  const release = await loadRelease(opts.repoRoot, pin.templateId, pin.releaseId);
  if (release.releaseHash !== pin.releaseHash || release.templateVersion !== pin.templateVersion || release.templateId !== pin.templateId) {
    throw new SiteBuildError(`release mismatch: pin ${pin.releaseId}/${pin.releaseHash.slice(0, 12)} ≠ stored release ${release.releaseId}/${release.releaseHash.slice(0, 12)}`);
  }
  await verifyRelease(opts.repoRoot, release);
  const { snapshot, assetFiles, unserved } = await buildSiteSnapshot(opts);
  const tc = currentToolchain();
  const parts = {
    releaseHash: release.releaseHash,
    siteSnapshotHash: hashJson(snapshot),
    mode: opts.mode,
    toolchainHash: toolchainHash(tc),
  };
  return { site, release, snapshot, assetFiles, unserved, toolchain: tc, parts, buildInputId: computeBuildInputId(parts) };
}

/**
 * Preflight output as printed by the RELEASE's platform/site/preflight.ts. The builder is
 * not part of any release, so it must accept every shape a still-buildable release prints:
 *   1.1.0+ : routes = route plan { key, pattern, paths }[] + prune[]
 *   1.0.0  : routes = raw manifest routes { key, path }[] (static only), no prune
 */
interface RawPreflight {
  settings: unknown;
  theme: unknown;
  selections: BuildRecord["preflight"]["selections"];
  warnings: string[];
  routes: ({ key: string; pattern: string; paths: string[] } | { key: string; path: string })[];
  prune?: PruneEntry[];
  /** item route key → slugs that can never address an item (1.1.0+) */
  reservedSlugs?: Record<string, string[]>;
  slots: Record<string, Record<string, { source: string }>>;
}

export function normalizePreflight(raw: RawPreflight) {
  const routes = raw.routes.map((r) => {
    if ("paths" in r) return r;
    // legacy manifest route: only static routes existed, each generating exactly its own path
    if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/.test(r.path)) {
      throw new SiteBuildError(`legacy preflight route "${r.key}" (${r.path}) is not a static route — unsupported release shape`);
    }
    return { key: r.key, pattern: r.path, paths: [r.path] };
  });
  return { ...raw, routes, prune: raw.prune ?? [], reservedSlugs: raw.reservedSlugs ?? {} };
}

/**
 * Served items with a reserved slug fail the route plan (preflight). Unserved ones (draft,
 * scheduled) cannot — they have no page yet — so warn now instead of failing on publish day.
 */
export function unservedSlugWarnings(unserved: readonly { id: string; slug: string; status: string }[], reserved: Record<string, string[]>): string[] {
  const all = new Set(Object.values(reserved).flat());
  return unserved
    .filter((p) => all.has(p.slug))
    .map((p) => `project ${p.id} (${p.status}, not yet served) uses reserved slug "${p.slug}" — serving it will fail the build; choose another slug`);
}

/**
 * Declared destinations the Template will DROP in this build (advisory — the page still
 * builds, honestly without them): a hero CTA whose project is not served, a contact CTA on a
 * site without a contact destination, a link slot whose /path is not a page of this build.
 * In-page #anchors depend on which sections render and are not checked here.
 */
export function droppedDestinationWarnings(
  snapshot: SiteSnapshot,
  unserved: readonly { id: string; slug: string; status: string }[],
  pagePaths: readonly string[],
): string[] {
  const out: string[] = [];
  const served = new Set(snapshot.content.projects.map((p) => p.id));
  const status = new Map(unserved.map((p) => [p.id, p.status]));
  const contact = !!snapshot.content.business.contact?.email;
  for (const b of snapshot.content.banners ?? []) {
    const t = b.cta?.target;
    if (t?.kind === "project" && !served.has(t.project)) {
      out.push(`banner ${b.id}: CTA target project ${t.project} is not served in this build (${status.get(t.project) ?? "unknown"}) — that CTA is never rendered`);
    }
    if (t?.kind === "contact" && !contact) out.push(`banner ${b.id}: contact CTA but the site has no contact destination — that CTA is never rendered`);
  }
  const pages = new Set(pagePaths);
  for (const [section, values] of Object.entries(snapshot.slots?.values ?? {})) {
    for (const [key, value] of Object.entries(values ?? {})) {
      const href = (value as { href?: unknown } | null)?.href;
      if (typeof href === "string" && href.startsWith("/") && !pages.has(href)) out.push(`slot ${section}.${key}: link ${href} is not a page of this build — that link is never rendered`);
    }
  }
  return out;
}

export async function buildSite(opts: SiteBuildOptions): Promise<SiteBuildResult> {
  const log = opts.log ?? (() => {});
  const mode = opts.mode ?? "public";
  const at = opts.at ?? new Date().toISOString();
  const startedAt = new Date();
  const input = await prepareSiteInput({ repoRoot: opts.repoRoot, siteId: opts.siteId, mode, at, releaseId: opts.releaseId });
  const { release, snapshot, buildInputId } = input;
  log(`[${opts.siteId}] release ${release.releaseId} · buildInputId ${buildInputId.slice(0, 16)}…`);

  const buildsRoot = path.join(opts.repoRoot, SITE_BUILDS_DIR, opts.siteId);
  const currentFile = path.join(buildsRoot, "current.json");
  const previousFile = path.join(buildsRoot, "previous.json");
  // One build per site at a time (pointer updates + pruning must not interleave).
  await mkdir(buildsRoot, { recursive: true });
  const lockFile = path.join(buildsRoot, ".build.lock");
  const lock = await open(lockFile, "wx").catch(async () => {
    // A lock whose owner process is gone is stale (crashed build): take it over once.
    const owner = Number((await readFile(lockFile, "utf8").catch(() => "")).trim());
    let alive = false;
    if (Number.isInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0);
        alive = true;
      } catch (e) {
        alive = (e as NodeJS.ErrnoException).code === "EPERM";
      }
    }
    if (alive) throw new SiteBuildError(`site "${opts.siteId}" is already being built (lock ${lockFile}, pid ${owner})`);
    log(`[${opts.siteId}] removing stale build lock (pid ${owner || "?"} not running)`);
    await rm(lockFile, { force: true });
    return open(lockFile, "wx");
  });
  await lock.writeFile(`${process.pid}\n`);
  await lock.close();
  try {
    return await buildLocked();
  } finally {
    await rm(lockFile, { force: true });
  }

  async function buildLocked(): Promise<SiteBuildResult> {
  const current = await readPointer(currentFile);
  const currentExists = current ? await packageIntact(path.join(opts.repoRoot, current.packageDir)) : false;
  if (current?.buildInputId === buildInputId && currentExists && !opts.force) {
    log(`[${opts.siteId}] up-to-date (same buildInputId as current successful package)`);
    return { status: "up-to-date", buildInputId, packageDir: current.packageDir };
  }

  const ws = path.join(os.tmpdir(), "recon-site-build", `${opts.siteId}-${buildInputId.slice(0, 12)}-${process.pid}-${Date.now()}`);
  const templateRel = `templates/${release.templateId}/v${release.templateVersion.split(".")[0]}`;
  const projectDir = path.join(ws, templateRel);
  try {
    await materializeRelease(opts.repoRoot, release, ws);
    await writeWorkspaceInputs(ws, projectDir, release, snapshot, input.assetFiles, { siteId: opts.siteId, mode, at });
    const env = buildEnv({
      RECON_SITE_BINDING: path.join(ws, ".recon/binding.json"),
      RECON_BUILD_ID: buildInputId.slice(0, 32),
    });

    let t = Date.now();
    await run("pnpm", ["install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--reporter=silent"], ws, env, 300_000);
    const install = Date.now() - t;

    t = Date.now();
    const tsx = path.join(opts.repoRoot, "node_modules/.bin/tsx");
    const pre = await run(
      tsx,
      ["--tsconfig", path.join(projectDir, "tsconfig.json"), path.join(ws, "platform/site/preflight.ts"), path.join(projectDir, "template.ts")],
      ws,
      env,
      120_000,
    );
    const preflightOut = normalizePreflight(JSON.parse(pre.stdout.trim().split("\n").pop()!) as RawPreflight);
    const preflight = Date.now() - t;
    const pagePaths = preflightOut.routes.flatMap((r) => r.paths);
    preflightOut.warnings.push(...unservedSlugWarnings(input.unserved, preflightOut.reservedSlugs));
    preflightOut.warnings.push(...droppedDestinationWarnings(snapshot, input.unserved, pagePaths));
    for (const w of preflightOut.warnings) log(`[${opts.siteId}] WARNING ${w}`);
    if (pagePaths.length === 0) throw new SiteBuildError("route plan generates no page");
    await pruneRoutes(projectDir, preflightOut.prune);
    if (preflightOut.prune.length) log(`[${opts.siteId}] pruned routes with no page: ${preflightOut.prune.map((p) => p.key).join(", ")}`);

    t = Date.now();
    await run(path.join(ws, "node_modules/.bin/next"), ["build"], projectDir, env, 600_000);
    const nextBuild = Date.now() - t;

    t = Date.now();
    const outDir = path.join(projectDir, "out");
    const qa = await qaStaticPackage({
      outDir,
      routes: pagePaths.map((p) => ({ path: p })),
      exclusiveRoutes: true,
      forbiddenTerms: release.forbiddenTerms,
      publicOrigin: snapshot.site.identity.publicOrigin,
    });
    const qaMs = Date.now() - t;
    if (!qa.pass) {
      throw new SiteBuildError(`package QA failed:\n${qa.failures.map((f) => `  ${f.file}: ${f.why}`).join("\n")}`);
    }

    // Assemble the package beside its final place, then swap in atomically: a crash
    // never leaves current/previous pointing at a half-written or deleted package.
    const packageDir = path.join(buildsRoot, "packages", buildInputId);
    const staging = `${packageDir}.staging-${process.pid}`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    await cp(outDir, path.join(staging, "site"), { recursive: true });
    const finishedAt = new Date();
    const record: BuildRecord = {
      schemaVersion: 1,
      siteId: opts.siteId,
      status: "success",
      buildInputId,
      parts: input.parts,
      toolchain: input.toolchain,
      template: {
        templateId: release.templateId,
        templateVersion: release.templateVersion,
        releaseId: release.releaseId,
        releaseHash: release.releaseHash,
        templateSourceHash: release.templateSourceHash,
      },
      at,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: { total: finishedAt.getTime() - startedAt.getTime(), install, preflight, nextBuild, qa: qaMs },
      packageHash: await hashDir(path.join(staging, "site")),
      qa,
      preflight: {
        selections: preflightOut.selections,
        warnings: preflightOut.warnings,
        slotSources: Object.fromEntries(
          Object.entries(preflightOut.slots).map(([s, v]) => [s, Object.fromEntries(Object.entries(v).map(([k, r]) => [k, r.source]))]),
        ),
        routes: Object.fromEntries(preflightOut.routes.map((r) => [r.key, r.paths.length])),
        pruned: preflightOut.prune,
      },
      effectiveSettingsHash: hashJson(preflightOut.settings),
      effectiveThemeHash: hashJson(preflightOut.theme),
      hermeticity: [
        "RENDERED code (template + platform runtime modules) comes only from the verified release snapshot, compiled in a workspace outside the repository",
        "dependencies from the release's scoped lockfile via pnpm --offline --frozen-lockfile --ignore-scripts (shared local pnpm content store)",
        "allowlisted environment for install / preflight / next build",
        "NOT from the release: the builder itself (site snapshot loader, visibility filter, asset selection, package QA, pointers) runs from the repository working tree, and the preflight runner (tsx) comes from the repository's node_modules",
      ],
    };
    await writeFile(path.join(staging, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`);
    const replaced = `${packageDir}.replaced-${process.pid}`;
    const hadOld = await stat(packageDir).then(() => true, () => false);
    if (hadOld) await rename(packageDir, replaced);
    await rename(staging, packageDir);
    if (hadOld) await rm(replaced, { recursive: true, force: true });

    // Pointers: previous successful package retained for rollback; anything older pruned.
    const pointer: Pointer = { buildInputId, packageDir: path.relative(opts.repoRoot, packageDir), finishedAt: record.finishedAt };
    let previous: Pointer | undefined = await readPointer(previousFile);
    // Only an intact package may become the rollback target.
    if (current && current.buildInputId !== buildInputId && currentExists) {
      await writeFile(previousFile, `${JSON.stringify(current, null, 2)}\n`);
      previous = current;
    }
    await writeFile(`${currentFile}.tmp`, `${JSON.stringify(pointer, null, 2)}\n`);
    await rename(`${currentFile}.tmp`, currentFile);
    const keep = new Set([buildInputId, previous?.buildInputId].filter(Boolean));
    for (const dir of await readdir(path.join(buildsRoot, "packages"))) {
      // We hold the site lock, so any leftover staging/replaced dir is from a crashed build.
      if (!keep.has(dir)) await rm(path.join(buildsRoot, "packages", dir), { recursive: true, force: true });
    }
    await appendFile(
      path.join(buildsRoot, "history.jsonl"),
      `${JSON.stringify({ buildInputId, status: "success", finishedAt: record.finishedAt, releaseId: release.releaseId })}\n`,
    );
    log(`[${opts.siteId}] built in ${Math.round(record.durationMs.total / 1000)}s → ${pointer.packageDir}`);
    return { status: "built", record, packageDir, previous };
  } catch (error) {
    await mkdir(buildsRoot, { recursive: true });
    await appendFile(
      path.join(buildsRoot, "history.jsonl"),
      `${JSON.stringify({ buildInputId, status: "failed", finishedAt: new Date().toISOString(), error: (error as Error).message.slice(0, 500) })}\n`,
    );
    throw error;
  } finally {
    if (!opts.keepWorkspace) await rm(ws, { recursive: true, force: true });
  }
  }
}

async function writeWorkspaceInputs(
  ws: string,
  projectDir: string,
  release: ReleaseRecord,
  snapshot: SiteSnapshot,
  assetFiles: Map<string, string>,
  b: { siteId: string; mode: BuildMode; at: string },
) {
  await mkdir(path.join(ws, ".recon"), { recursive: true });
  const snapshotFile = path.join(ws, ".recon/snapshot.json");
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  await writeFile(
    path.join(ws, ".recon/binding.json"),
    JSON.stringify({
      siteId: b.siteId,
      mode: b.mode,
      at: b.at,
      release: {
        templateId: release.templateId,
        templateVersion: release.templateVersion,
        releaseId: release.releaseId,
        releaseHash: release.releaseHash,
      },
      snapshotFile,
    }),
  );
  for (const [publicPath, src] of assetFiles) {
    const target = path.join(projectDir, "public", publicPath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(src, target);
  }
}

const ROUTE_DIR_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z][a-zA-Z0-9]*\])(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z][a-zA-Z0-9]*\]))*$/;

/**
 * Remove, from the disposable workspace only, the App Router files of routes that
 * generate no page for this site (internal build detail; see platform/site/routes).
 * Entries come from the release's preflight and are re-validated here: app/-relative,
 * route-segment characters only, must exist. Emptied directories are removed too.
 */
export async function pruneRoutes(projectDir: string, prune: readonly PruneEntry[]): Promise<void> {
  const appDir = path.join(projectDir, "app");
  for (const entry of prune) {
    if (entry.dir !== "" && !ROUTE_DIR_RE.test(entry.dir)) throw new SiteBuildError(`prune: invalid route dir "${entry.dir}"`);
    const target = path.resolve(appDir, entry.dir);
    if (target !== appDir && !target.startsWith(`${appDir}${path.sep}`)) throw new SiteBuildError(`prune: "${entry.dir}" escapes app/`);
    const st = await stat(target).catch(() => undefined);
    if (!st?.isDirectory()) throw new SiteBuildError(`prune: route dir app/${entry.dir} (${entry.key}) does not exist`);
    if (entry.scope === "segment") {
      if (target === appDir || !/\]$/.test(entry.dir)) throw new SiteBuildError(`prune: segment scope requires a dynamic segment dir, got "${entry.dir}"`);
      await rm(target, { recursive: true });
    } else {
      const pages = (await readdir(target)).filter((f) => /^page\.(tsx|ts|jsx|js)$/.test(f));
      if (pages.length !== 1) throw new SiteBuildError(`prune: expected one page file in app/${entry.dir} (${entry.key}), found ${pages.length}`);
      await rm(path.join(target, pages[0]!));
    }
  }
  // Drop directories left empty by pruning (deepest first).
  async function sweep(dir: string): Promise<boolean> {
    let empty = true;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory() && (await sweep(path.join(dir, e.name)))) await rm(path.join(dir, e.name), { recursive: true });
      else empty = false;
    }
    return empty;
  }
  if (prune.length) await sweep(appDir);
}

/** A package is intact when its build record exists and its files still hash to the recorded packageHash. */
export async function packageIntact(packageDir: string): Promise<boolean> {
  try {
    const record = JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")) as { packageHash?: string };
    return record.packageHash === (await hashDir(path.join(packageDir, "site")));
  } catch {
    return false;
  }
}
