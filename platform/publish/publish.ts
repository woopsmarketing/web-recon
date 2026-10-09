/**
 * site:publish — upload the CURRENT immutable Site Build Package of a site to an object store
 * (R2) and point a hostname at it. Read-only towards data/site-builds/** (never writes there).
 *
 * Order (any failure before step 8 leaves the existing routing pointer untouched):
 *  1. data/site-builds/<siteId>/current.json → build-record.json (zod) → status success, qa.pass,
 *     siteId / buildInputId match, packageDir inside the site's packages/, optional expected packageHash
 *  2. re-verify packageHash with the platform's own check (packageIntact, site-build.ts)
 *  3. inventory site/** → sha256, size, content-type, cache-control (fail closed on unknown types,
 *     non-regular files, the reserved seal name, count/bytes ≠ build record); re-verify packageHash
 *     after reading so the inventory is bound to the verified bytes
 *  4. keys under sites/<siteId>/packages/<packageHash>/
 *  5. seal present and identical → immutable skip (no upload); present but different → refuse
 *  6. upload every file, then read each back and compare sha256/size
 *  7. write the seal (_package.json) LAST, read it back
 *  8. only then write routing/<hostname>.json, read it back (previous = what it pointed at before)
 * Dry run: steps 1–4 only, no store access at all. With checkStore (CLI --check-store) it also
 *   evaluates steps 5 and 8 READ-ONLY (seal present? live pointer? every refusal the real run would
 *   raise) through a wrapper whose put() throws, so it can say what would be skipped / uploaded.
 *   Dry-run results carry no clock value: same package + same store state → same output.
 * Incremental-host guard (step 8, before the write): what a hostname is published as is decided by
 *   the STORE, not by the checkout running the command. When the package the hostname serves now is a
 *   shell package (its seal lists _runtime/portfolio/*) and the package about to replace it is an
 *   ordinary build, the switch is refused: it would put statically built portfolio pages back and
 *   strand BoostChat's publishing (its overlay belongs to the shell package). rollbackHost is the way
 *   back to the previous package; leaveIncremental (CLI --leave-incremental) is the explicit override
 *   and is implied by nothing else. A dry run with checkStore throws it like every other refusal.
 * activate: false → stop after the verified seal (steps 1–7); the pointer is not read or written.
 * reverify → a package that is already sealed is read back file by file instead of being trusted.
 * expectLivePackageHash → stale-write guard: refuse unless routing/<hostname>.json currently names
 *   exactly that package ("none" = no pointer yet). Not atomic (wrangler has no conditional put); it
 *   catches an operator acting on a reviewed state that someone else has since replaced.
 * requireOriginMatch → refuse (before any store access) when the origin baked into the package
 *   (robots.txt "Sitemap:" line = canonical / sitemap origin) is not https://<hostname>; without it
 *   the mismatch is only a plan warning (local and test hosts never match).
 * Immutable-path guard (step 8, before the write): a path this package serves with the one-year
 *   immutable policy must not have had different bytes in the package the hostname serves now —
 *   browsers would keep the old bytes. Refused; the fix is a build that emits a new file name.
 *   Fails closed: a live package whose seal cannot be read cannot be compared, so the switch is
 *   refused too. Rollback skips this immutable-path check: it only returns to `previous`, the pair
 *   the forward publish already compared.
 * Shell-package guard (step 8 and rollback, before the write): a SHELL package (Portfolio Publishing
 *   V2 — it carries _runtime/portfolio/*, its portfolio pages are empty placeholders) may be pointed at
 *   by a hostname only while the same store holds an overlay recon-runtime would USE for it:
 *   portfolio-public/<siteId>/current/<packageHash>.json and the manifest it names, checked by the
 *   Worker's own loadOverlay (pointer schema / siteId / shellPackageHash, manifest object present,
 *   bytes = manifestSha256, manifest schema / siteId / shell.packageHash). Without one the Worker
 *   answers 503 for every page of the site (no pointer, or a pointer it refuses — it never serves a
 *   shell package's pages without its portfolio), so the switch is refused; BoostChat publishes the portfolio for the package first. An ordinary package is not looked at. activate: false never
 *   reads the overlay; a dry run reports the overlay (StoreCheck.portfolioOverlay) and never throws
 *   for it — the normal order is package first (activate: false), portfolio second, switch last.
 * Rollback (rollbackHost): re-point a hostname at its pointer's `previous` package; no upload.
 *   Portfolio-truth guard (before the pointer write): when the target package serves a portfolio
 *   document (_integration/manifest.json → resources.portfolio), every record id in it must still be
 *   in the site's CURRENT authoritative data (options.portfolioTruth); an older package must never
 *   re-expose records that were removed from source. Fails closed (unreadable / seal-mismatched
 *   documents, or no authoritative data supplied, are refusals). Runbook:
 *   docs/result/sales-demo-final-closeout-v1/rollback-truth-runbook.md
 *   When the package the hostname serves NOW is a shell package (per its seal in the store), the
 *   authoritative data is what BoostChat has published — the record ids of that package's live overlay
 *   manifest — whatever the checkout says and whatever loader was supplied: options.portfolioTruth is
 *   not called (no verified overlay → no data → refused). A live package whose seal cannot be read
 *   cannot be classified, so a portfolio-backed target is refused then too.
 */

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SITE_BUILDS_DIR, packageIntact } from "../build/site-build";
import { INTEGRATION_DIR, MANIFEST_FILE, PORTFOLIO_KIND } from "../integration/contract";
import { compareCodePoints } from "../integration/emit";
import { resolvePortfolioRuntime } from "../portfolio-runtime/capability";
import { RUNTIME_DIR } from "../portfolio-runtime/contract";
import { loadRelease } from "../release/release";
import { sha256 } from "../util/hash";
import {
  CACHE_IMMUTABLE,
  HASH_RE,
  HOSTNAME_RE,
  SCHEMA_VERSION,
  SEAL_NAME,
  SITE_ID_RE,
  packageKey,
  portfolioCurrentKey,
  routingKey,
  sealKey,
  type PackageRef,
  type PackageSeal,
  type PortfolioManifest,
  type RoutingPointer,
  type SealFile,
} from "../../workers/recon-runtime/src/contract";
import { loadOverlay, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import { cachePolicyFor, contentTypeFor, type CacheReason } from "./media";
import type { ObjectStore } from "./store";

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

const Hash = z.string().regex(HASH_RE);

export const CurrentPointerSchema = z.object({
  buildInputId: Hash,
  packageDir: z.string().min(1),
  finishedAt: z.string(),
});

/** The fields of build-record.json (platform/build/site-build.ts BuildRecord) that publishing relies on. */
export const PublishableRecordSchema = z.object({
  schemaVersion: z.literal(1),
  siteId: z.string().regex(SITE_ID_RE),
  status: z.literal("success"),
  buildInputId: Hash,
  template: z.object({ templateId: z.string(), templateVersion: z.string(), releaseId: z.string().min(1), releaseHash: Hash }),
  finishedAt: z.string(),
  packageHash: Hash,
  qa: z.object({ pass: z.literal(true), files: z.number().int().positive(), bytes: z.number().int().nonnegative() }),
});

export const RoutingPointerSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  hostname: z.string().regex(HOSTNAME_RE),
  siteId: z.string().regex(SITE_ID_RE),
  packageHash: Hash,
  buildInputId: Hash,
  releaseId: z.string(),
  publishedAt: z.string(),
  previous: z
    .object({ siteId: z.string(), packageHash: Hash, buildInputId: Hash, releaseId: z.string(), publishedAt: z.string() })
    .optional(),
});

export interface PlannedFile extends SealFile {
  key: string;
  cacheReason: CacheReason;
  abs: string;
}

export interface PublishPlan {
  siteId: string;
  hostname: string;
  packageDir: string;
  packageHash: string;
  buildInputId: string;
  releaseId: string;
  files: PlannedFile[];
  bytes: number;
  sealKey: string;
  routingKey: string;
  seal: PackageSeal;
  /** origin baked into the package's canonical / sitemap URLs (robots.txt "Sitemap:" line), if it declares one */
  bakedOrigin?: string;
  /** site.publicOrigin baked into _integration/manifest.json, when the package carries integration documents */
  manifestOrigin?: string;
  /** present when this is a SHELL package: the overlay pointer that must be live in the store before a hostname may point at it */
  shell?: { currentKey: string };
  /** non-fatal findings the operator should read (deterministic order) */
  warnings: string[];
}

/** publishedAt of a dry-run pointer preview: dry-run output must not depend on the clock. */
export const DRY_RUN_PUBLISHED_AT = "<set at publish time>";

/** What a dry run learned from a read-only look at the store (absent = store not consulted). */
export interface StoreCheck {
  store: string;
  seal: "absent" | "identical";
  wouldUpload: number;
  wouldSkip: number;
  live: PackageRef | null;
  pointerAction: "write" | "unchanged" | "not-activated";
  /** shell packages only: the overlay the store holds for this package, and what a pointer write would meet (never thrown by a dry run) */
  portfolioOverlay?: PortfolioOverlayState & { activation: "would-pass" | "would-refuse" };
}

/** What the store holds as the portfolio overlay of (siteId, packageHash), judged by recon-runtime's own loadOverlay. */
export type PortfolioOverlayState =
  | { state: "live"; key: string; revision: number }
  | { state: "absent"; key: string }
  /** `reason` is the Worker's trace.overlay code for the refusal */
  | { state: "refused"; key: string; reason: string };

export interface PublishOptions {
  repoRoot: string;
  siteId: string;
  hostname: string;
  store?: ObjectStore;
  dryRun?: boolean;
  /** dry run only: also look at `store` READ-ONLY (seal, live pointer); without it a dry run never touches the store */
  checkStore?: boolean;
  /** refuse unless the site's current package has exactly this packageHash (guards against a concurrent site:build) */
  expectPackageHash?: string;
  /** allow pointing a hostname that currently serves a different site at this one */
  allowSiteChange?: boolean;
  /** allow replacing the SHELL package a hostname serves now with an ordinary build (takes the host out of incremental publishing) */
  leaveIncremental?: boolean;
  /** stale-write guard: the packageHash routing/<hostname>.json must currently name, or "none" */
  expectLivePackageHash?: string;
  /** false → upload + verify + seal only; the routing pointer is neither read nor written (default true) */
  activate?: boolean;
  /** a sealed package is read back and compared file by file instead of being skipped on trust */
  reverify?: boolean;
  /** refuse unless the package's baked origin is https://<hostname> (the CLI sets it for --remote) */
  requireOriginMatch?: boolean;
  concurrency?: number;
  now?: () => Date;
  log?: (line: string) => void;
}

export type PublishResult =
  | { status: "dry-run"; plan: PublishPlan; pointer: RoutingPointer; storeCheck?: StoreCheck }
  | {
      status: "published";
      plan: PublishPlan;
      upload: "uploaded" | "skipped-sealed";
      uploaded: number;
      verified: number;
      pointer: RoutingPointer;
      pointerWrite: "written" | "unchanged";
    }
  | {
      /** activate: false — the package is uploaded, verified and sealed; no hostname points at it because of this run */
      status: "uploaded";
      plan: PublishPlan;
      upload: "uploaded" | "skipped-sealed";
      uploaded: number;
      verified: number;
    };

export function normalizeHostname(input: string): string {
  const h = input.trim().toLowerCase();
  if (h.includes(":")) throw new PublishError(`hostname "${input}" must not include a port or scheme`);
  if (!HOSTNAME_RE.test(h)) throw new PublishError(`invalid hostname "${input}"`);
  return h;
}

async function listPackageFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listPackageFiles(path.join(dir, e.name), r)));
    else if (e.isFile()) out.push(r);
    else throw new PublishError(`package contains a non-regular file: ${r}`);
  }
  return out;
}

/** Steps 1–4: validate the current package and plan every key. Reads only. */
export async function planPublish(opts: { repoRoot: string; siteId: string; hostname: string; expectPackageHash?: string; requireOriginMatch?: boolean }): Promise<PublishPlan> {
  const { repoRoot, siteId } = opts;
  if (!SITE_ID_RE.test(siteId)) throw new PublishError(`invalid siteId "${siteId}"`);
  const hostname = normalizeHostname(opts.hostname);
  const buildsRoot = path.join(repoRoot, SITE_BUILDS_DIR, siteId);

  const currentRaw = await readFile(path.join(buildsRoot, "current.json"), "utf8").catch(() => {
    throw new PublishError(`site "${siteId}" has no current build (${SITE_BUILDS_DIR}/${siteId}/current.json)`);
  });
  const current = CurrentPointerSchema.parse(JSON.parse(currentRaw));
  const packageDir = path.resolve(repoRoot, current.packageDir);
  if (packageDir !== path.join(buildsRoot, "packages", current.buildInputId)) {
    throw new PublishError(`current.json packageDir ${current.packageDir} is not ${SITE_BUILDS_DIR}/${siteId}/packages/${current.buildInputId}`);
  }

  const parsed = PublishableRecordSchema.safeParse(JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")));
  if (!parsed.success) throw new PublishError(`build-record.json is not publishable: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const record = parsed.data;
  if (record.siteId !== siteId) throw new PublishError(`build record siteId ${record.siteId} ≠ ${siteId}`);
  if (record.buildInputId !== current.buildInputId) throw new PublishError(`build record buildInputId ≠ current.json buildInputId`);
  if (opts.expectPackageHash && record.packageHash !== opts.expectPackageHash) {
    throw new PublishError(`current package is ${record.packageHash.slice(0, 16)}… (${record.template.releaseId}), not the expected ${opts.expectPackageHash.slice(0, 16)}… — the site was rebuilt; review the new package first`);
  }
  const siteDir = path.join(packageDir, "site");
  // The runtime answers "/" from index.html and every miss from 404.html (and treats a missing 404.html as a missing package).
  for (const required of ["index.html", "404.html"]) {
    const st = await lstat(path.join(siteDir, required)).catch(() => undefined);
    if (!st?.isFile()) throw new PublishError(`package has no ${required}; recon-runtime cannot serve it`);
  }
  if (!(await packageIntact(packageDir))) throw new PublishError(`package files do not hash to packageHash ${record.packageHash} (platform packageIntact)`);

  const rels = (await listPackageFiles(siteDir)).sort();
  if (rels.includes(SEAL_NAME)) throw new PublishError(`package contains the reserved seal name ${SEAL_NAME}`);
  const files: PlannedFile[] = [];
  let bytes = 0;
  for (const rel of rels) {
    const abs = path.join(siteDir, rel);
    const st = await lstat(abs);
    if (!st.isFile()) throw new PublishError(`package contains a non-regular file: ${rel}`);
    const body = await readFile(abs);
    const contentType = contentTypeFor(rel);
    if (!contentType) throw new PublishError(`no content-type for ${rel} (unknown extension; add it to platform/publish/media.ts)`);
    const hash = sha256(body);
    const { cacheControl, reason } = cachePolicyFor(rel, hash);
    files.push({ path: rel, size: body.length, sha256: hash, contentType, cacheControl, cacheReason: reason, key: packageKey(siteId, record.packageHash, rel), abs });
    bytes += body.length;
  }
  if (files.length !== record.qa.files || bytes !== record.qa.bytes) {
    throw new PublishError(`inventory ${files.length} files / ${bytes} B ≠ build record qa ${record.qa.files} files / ${record.qa.bytes} B`);
  }
  // Bind the inventory to the verified bytes (nothing changed while it was read).
  if (!(await packageIntact(packageDir))) throw new PublishError("package changed while it was being inventoried");
  // A shell package is composed by its release's runtime kit, so the release must have one: its
  // declared capability (portfolio-runtime/capability.ts), read from the release record — the
  // release's files are not looked at.
  if (isShellPackage(files)) {
    const built = record.template;
    const release = await loadRelease(repoRoot, built.templateId, built.releaseId).catch((error: unknown) => {
      throw new PublishError(`package ${shortHash(record.packageHash)} is a portfolio shell package built with ${built.releaseId}, and this checkout's release store cannot say whether that release has a portfolio runtime (${(error as Error).message})`);
    });
    const support = release.releaseHash === built.releaseHash ? resolvePortfolioRuntime(release) : { supported: false as const, reason: `the stored release ${release.releaseId} has another hash than the one the package was built with` };
    if (!support.supported) throw new PublishError(`package ${shortHash(record.packageHash)} is a portfolio shell package, but release ${built.releaseId} cannot be published incrementally: ${support.reason}`);
  }

  const seal: PackageSeal = {
    schemaVersion: SCHEMA_VERSION,
    siteId,
    packageHash: record.packageHash,
    buildInputId: record.buildInputId,
    releaseId: record.template.releaseId,
    fileCount: files.length,
    bytes,
    files: files.map(({ path: p, size, sha256: s, contentType, cacheControl }) => ({ path: p, size, sha256: s, contentType, cacheControl })),
  };
  // The package's canonical, sitemap and robots URLs were baked from the site's publicOrigin at build time.
  const robots = files.find((f) => f.path === "robots.txt");
  const bakedOrigin = robots ? /^Sitemap:\s*(https?:\/\/[^/\s]+)\//im.exec(await readFile(robots.abs, "utf8"))?.[1] : undefined;
  const warnings: string[] = [];
  if (bakedOrigin && bakedOrigin !== `https://${hostname}`) {
    const message = `package was built for ${bakedOrigin} (canonical, sitemap and robots URLs), not https://${hostname}`;
    if (opts.requireOriginMatch) throw new PublishError(`${message}; set the site's publicOrigin, rebuild, and publish that package`);
    warnings.push(`${message}; fine for a local or test host, wrong for a public one`);
  }
  // A package with first-party integration documents also bakes the origin into the manifest; a consumer
  // rejects a manifest whose site.publicOrigin is not the origin it registered (contract §5), so a mismatch
  // here is not cosmetic: the integration would never reach ON. Same policy as bakedOrigin above.
  const manifestFile = files.find((f) => f.path === "_integration/manifest.json");
  let manifestOrigin: string | undefined;
  if (manifestFile) {
    try {
      const parsed = JSON.parse(await readFile(manifestFile.abs, "utf8")) as { site?: { publicOrigin?: unknown } };
      if (typeof parsed.site?.publicOrigin === "string") manifestOrigin = parsed.site.publicOrigin;
    } catch {
      throw new PublishError("package carries _integration/manifest.json but it is not valid JSON");
    }
    if (manifestOrigin === undefined) throw new PublishError("package carries _integration/manifest.json without site.publicOrigin");
    if (manifestOrigin !== `https://${hostname}`) {
      const message = `integration manifest was built for ${manifestOrigin}, not https://${hostname}; the consumer will reject it (contract §5)`;
      if (opts.requireOriginMatch) throw new PublishError(`${message}; set the site's publicOrigin, rebuild, and publish that package`);
      warnings.push(`${message}; fine for a local or test host, wrong for a public one`);
    }
  }
  const videos = files.filter((f) => f.contentType.startsWith("video/")).length;
  if (videos > 0) warnings.push(`package contains video (${videos} file(s)); recon-runtime does not answer Range requests, so Safari/iOS will not play it`);

  return {
    siteId,
    hostname,
    packageDir: path.relative(repoRoot, packageDir),
    packageHash: record.packageHash,
    buildInputId: record.buildInputId,
    releaseId: record.template.releaseId,
    files,
    bytes,
    sealKey: sealKey(siteId, record.packageHash),
    routingKey: routingKey(hostname),
    seal,
    ...(bakedOrigin ? { bakedOrigin } : {}),
    ...(manifestOrigin ? { manifestOrigin } : {}),
    ...(isShellPackage(files) ? { shell: { currentKey: portfolioCurrentKey(siteId, record.packageHash) } } : {}),
    warnings,
  };
}

/**
 * A SHELL package (Portfolio Publishing V2) says so itself: it carries the portfolio publisher's
 * inputs under _runtime/portfolio/ (runtime.json, shell.json), which only the shell build of an
 * incrementally published site writes. Read from the package's own file list (plan or seal), so
 * the answer is the same for a publish and for a rollback to a package built long ago.
 */
export function isShellPackage(files: readonly unknown[]): boolean {
  return files.some((f) => isRecord(f) && typeof f.path === "string" && f.path.startsWith(`${RUNTIME_DIR}/`));
}

/** The store as the R2 binding recon-runtime reads (get/head only), so the Worker's own checks can run over it. */
function bucketOver(store: ObjectStore): R2BucketLike {
  const get = async (key: string): Promise<R2ObjectBodyLike | null> => {
    const bytes = await store.get(key);
    if (!bytes) return null;
    return { size: bytes.length, httpEtag: "", body: new Blob([new Uint8Array(bytes)]).stream(), text: async () => Buffer.from(bytes).toString("utf8") };
  };
  return { get, head: async (key) => get(key) };
}

async function inspectOverlay(store: ObjectStore, siteId: string, packageHash: string): Promise<{ state: PortfolioOverlayState; manifest?: PortfolioManifest }> {
  const key = portfolioCurrentKey(siteId, packageHash);
  const trace: { overlay?: string } = {};
  // cache: null — the manifest object is fetched and hashed now, never taken from this process's memory.
  const manifest = await loadOverlay({ SITES: bucketOver(store) }, { siteId, packageHash }, trace, null);
  if (manifest) return { state: { state: "live", key, revision: manifest.revision }, manifest };
  return { state: trace.overlay === undefined ? { state: "absent", key } : { state: "refused", key, reason: trace.overlay } };
}

/** The portfolio overlay the store holds for a package, exactly as recon-runtime would judge it on a request (read-only). */
export async function portfolioOverlayState(store: ObjectStore, siteId: string, packageHash: string): Promise<PortfolioOverlayState> {
  return (await inspectOverlay(store, siteId, packageHash)).state;
}

/** recon-runtime's refusal codes (trace.overlay), in words. */
const OVERLAY_REFUSALS: Readonly<Record<string, string>> = {
  "current-unparsable": "the pointer is not JSON",
  "current-schema": "the pointer's schema is not portfolio-current@1",
  "current-identity": "the pointer's siteId / shellPackageHash do not name this site and package",
  "current-manifest-ref": "the pointer's manifestKey / manifestSha256 are not valid",
  "manifest-missing": "the manifest the pointer names does not exist",
  "manifest-too-large": "the manifest is larger than recon-runtime reads",
  "manifest-sha256": "the manifest's bytes do not hash to the pointer's manifestSha256",
  "manifest-invalid": "the manifest is not a valid portfolio-manifest@1 document",
  "manifest-identity": "the manifest's siteId / shell.packageHash do not name this site and package",
};

/**
 * Shell-package guard: refuse to point `hostname` at a shell package unless the store holds an
 * overlay recon-runtime would use for it. Call it immediately before the routing pointer write.
 */
async function assertPortfolioLive(store: ObjectStore, target: { siteId: string; packageHash: string }, hostname: string, log?: (line: string) => void): Promise<void> {
  const state = await portfolioOverlayState(store, target.siteId, target.packageHash);
  if (state.state === "live") {
    log?.(`[${target.siteId}] shell package ${shortHash(target.packageHash)}: portfolio overlay is live (revision ${state.revision}, ${state.key}) → the hostname may point at it`);
    return;
  }
  const found = state.state === "absent" ? `${state.key} does not exist` : `${state.key} is refused by recon-runtime (${state.reason}: ${OVERLAY_REFUSALS[state.reason] ?? "see workers/recon-runtime/src/index.ts loadOverlay"})`;
  throw new PublishError(
    `package ${shortHash(target.packageHash)} of "${target.siteId}" is a portfolio shell package (its portfolio pages are empty placeholders until BoostChat publishes them) and ${store.description} holds no usable portfolio for it: ${found}. ` +
      `Pointing ${hostname} at it would make recon-runtime answer 503 for the whole site (it never serves a shell package's pages without its portfolio); refusing — routing pointer NOT written. ` +
      `Publish the portfolio of "${target.siteId}" for this package from BoostChat first (it writes that pointer last), then run this command again. The package itself is already uploaded and sealed.`,
  );
}

export function sealBytes(seal: PackageSeal): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(seal, null, 2)}\n`);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

async function pool<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  let failed: unknown;
  async function worker() {
    while (failed === undefined && i < items.length) {
      const item = items[i++]!;
      try {
        await fn(item);
      } catch (e) {
        failed ??= e;
      }
    }
  }
  if (!(Number.isInteger(n) && n >= 1)) throw new PublishError(`pool size must be a positive integer, got ${String(n)}`);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  if (failed !== undefined) throw failed;
}

/** Dry-run view of a store: reads pass through, any write is a bug and throws. */
function readOnly(store: ObjectStore): ObjectStore {
  return {
    description: `${store.description} (read-only)`,
    maxConcurrency: store.maxConcurrency,
    get: (key) => store.get(key),
    put: async (key) => {
      throw new PublishError(`dry run attempted to write ${key}`);
    },
  };
}

function shortHash(h: string): string {
  return `${h.slice(0, 16)}…`;
}

/** Stale-write guard shared by publish and rollback. */
function assertExpectedLive(existing: RoutingPointer | undefined, expected: string | undefined, key: string): void {
  if (expected === undefined) return;
  if (expected !== "none" && !HASH_RE.test(expected)) throw new PublishError(`expectLivePackageHash must be "none" or a 64-hex packageHash, got "${expected}"`);
  const live = existing?.packageHash ?? "none";
  if (live !== expected) {
    throw new PublishError(`${key} currently names ${live === "none" ? "no package" : shortHash(live)}, not the expected ${expected === "none" ? "none" : shortHash(expected)} — it was changed since it was reviewed; refusing (stale-write guard)`);
  }
}

/** Step 8 decision without the write; throws every refusal the write path would. */
function decidePointer(existing: RoutingPointer | undefined, plan: PublishPlan, opts: Pick<PublishOptions, "allowSiteChange" | "expectLivePackageHash">): "write" | "unchanged" {
  assertExpectedLive(existing, opts.expectLivePackageHash, plan.routingKey);
  if (existing) {
    if (existing.siteId !== plan.siteId && !opts.allowSiteChange) {
      throw new PublishError(`${plan.hostname} currently serves site "${existing.siteId}"; refusing to re-point it to "${plan.siteId}" without allowSiteChange`);
    }
    if (existing.siteId === plan.siteId && existing.packageHash === plan.packageHash) return "unchanged";
  }
  return "write";
}

/** The seal of a package as the store holds it; undefined when it is absent, not JSON, or has no file list. */
async function readSeal(store: ObjectStore, ref: { siteId: string; packageHash: string }): Promise<(Partial<PackageSeal> & { files: SealFile[] }) | undefined> {
  const raw = await store.get(sealKey(ref.siteId, ref.packageHash));
  try {
    const seal = raw ? (JSON.parse(Buffer.from(raw).toString("utf8")) as Partial<PackageSeal>) : undefined;
    return seal && Array.isArray(seal.files) ? (seal as Partial<PackageSeal> & { files: SealFile[] }) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Everything that is judged against the package a hostname serves NOW, from that package's seal in
 * the store, before the pointer may move to `plan`. A live seal that is absent or unreadable is a
 * refusal, not a pass.
 *  - Incremental-host guard: a host that serves a SHELL package is published incrementally from
 *    BoostChat; an ordinary build may not replace it unless leaveIncremental says so.
 *  - Immutable paths: browsers keep an immutable-cached URL for a year, so a path served immutable by
 *    BOTH packages must carry the same bytes.
 */
async function assertSwitchFromLive(store: ObjectStore, live: RoutingPointer, plan: PublishPlan, opts: Pick<PublishOptions, "leaveIncremental">): Promise<void> {
  const seal = await readSeal(store, live);
  if (!seal) {
    throw new PublishError(`${plan.hostname} serves package ${shortHash(live.packageHash)} whose seal cannot be read, so immutable-cached paths cannot be compared; refusing to switch. Inspect ${sealKey(live.siteId, live.packageHash)}; to start the hostname over, delete ${plan.routingKey} and publish again`);
  }
  if (isShellPackage(seal.files) && !plan.shell && !opts.leaveIncremental) {
    throw new PublishError(
      `${plan.hostname} is published incrementally from BoostChat: the package it serves now (${shortHash(live.packageHash)}, ${String(live.releaseId)}) is a portfolio shell package, and ${shortHash(plan.packageHash)} is an ordinary build. ` +
        `Replacing it would re-expose statically built portfolio pages (the portfolio baked into this build) and strand BoostChat's publishing for this host; refusing — routing pointer NOT written. ` +
        `To return to the previous package use --rollback; to take the host out of incremental publishing on purpose pass --leave-incremental (leaveIncremental).`,
    );
  }
  const liveImmutable = new Map(seal.files.filter((f) => f.cacheControl === CACHE_IMMUTABLE).map((f) => [f.path, f.sha256]));
  const changed = plan.files.filter((f) => f.cacheControl === CACHE_IMMUTABLE && liveImmutable.has(f.path) && liveImmutable.get(f.path) !== f.sha256).map((f) => f.path);
  if (changed.length > 0) {
    throw new PublishError(`${changed.length} immutable-cached path(s) have different bytes than in the package ${plan.hostname} serves now (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", …" : ""}) — browsers would keep the old bytes for a year; the build must emit new file names`);
  }
}

export async function publishSite(opts: PublishOptions): Promise<PublishResult> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const plan = await planPublish(opts);
  const ref = (publishedAt: string): PackageRef => ({
    siteId: plan.siteId,
    packageHash: plan.packageHash,
    buildInputId: plan.buildInputId,
    releaseId: plan.releaseId,
    publishedAt,
  });
  log(`[${plan.siteId}] package ${plan.packageHash.slice(0, 16)}… (build ${plan.buildInputId.slice(0, 16)}…, ${plan.releaseId}) · ${plan.files.length} files · ${plan.bytes} B · host ${plan.hostname}`);

  for (const w of plan.warnings) log(`[${plan.siteId}] WARNING ${w}`);
  const activate = opts.activate !== false;
  if (opts.checkStore && !opts.dryRun) throw new PublishError("checkStore is a dry-run option");
  if (!activate && opts.expectLivePackageHash !== undefined) throw new PublishError("expectLivePackageHash guards the pointer write; it cannot be combined with activate: false");

  if (opts.dryRun) {
    const pointer: RoutingPointer = { schemaVersion: SCHEMA_VERSION, hostname: plan.hostname, ...ref(DRY_RUN_PUBLISHED_AT) };
    if (!opts.checkStore) return { status: "dry-run", plan, pointer };
    if (!opts.store) throw new PublishError("checkStore needs a store");
    const ro = readOnly(opts.store);
    const seal = await ro.get(plan.sealKey);
    if (seal && !sameBytes(seal, sealBytes(plan.seal))) {
      throw new PublishError(`seal ${plan.sealKey} exists with different content — a sealed package is immutable; the publish would be refused`);
    }
    let live: PackageRef | null = null;
    let pointerAction: StoreCheck["pointerAction"] = "not-activated";
    if (activate) {
      const existing = await readRoutingPointer(ro, plan.routingKey);
      pointerAction = decidePointer(existing, plan, opts);
      if (existing && pointerAction === "write") await assertSwitchFromLive(ro, existing, plan, opts);
      live = existing ? refOf(existing) : null;
      if (existing && pointerAction === "write") pointer.previous = refOf(existing);
    }
    // Shell-package guard: reported, not thrown — at review time the portfolio is normally not published yet.
    const overlay = plan.shell ? await portfolioOverlayState(ro, plan.siteId, plan.packageHash) : undefined;
    const storeCheck: StoreCheck = {
      store: opts.store.description,
      seal: seal ? "identical" : "absent",
      wouldUpload: seal ? 0 : plan.files.length,
      wouldSkip: seal ? plan.files.length : 0,
      live,
      pointerAction,
      ...(overlay ? { portfolioOverlay: { ...overlay, activation: overlay.state === "live" ? ("would-pass" as const) : ("would-refuse" as const) } } : {}),
    };
    return { status: "dry-run", plan, pointer, storeCheck };
  }
  const store = opts.store;
  if (!store) throw new PublishError("no store given (use dryRun for a plan-only run)");
  if (opts.concurrency !== undefined && !(Number.isInteger(opts.concurrency) && opts.concurrency >= 1)) {
    throw new PublishError(`concurrency must be a positive integer, got ${String(opts.concurrency)}`);
  }
  const concurrency = Math.min(opts.concurrency ?? 4, store.maxConcurrency ?? Infinity);
  log(`[${plan.siteId}] store: ${store.description} · concurrency ${concurrency}`);

  // Stale-write guard, early: do not upload a whole package only to be refused at step 8 (which checks again).
  if (activate && opts.expectLivePackageHash !== undefined) {
    assertExpectedLive(await readRoutingPointer(store, plan.routingKey), opts.expectLivePackageHash, plan.routingKey);
  }

  // 5. immutable skip
  const expectedSeal = sealBytes(plan.seal);
  const existingSeal = await store.get(plan.sealKey);
  let upload: "uploaded" | "skipped-sealed";
  let uploaded = 0;
  let verified = 0;
  if (existingSeal) {
    if (!sameBytes(existingSeal, expectedSeal)) {
      throw new PublishError(`seal ${plan.sealKey} exists with different content — a sealed package is immutable; refusing`);
    }
    upload = "skipped-sealed";
    log(`[${plan.siteId}] seal present and identical → immutable skip (0 uploads)`);
    if (opts.reverify) {
      // Read-only: a sealed package is never re-uploaded over; a mismatch is reported, not repaired.
      await pool(plan.files, concurrency, async (f) => {
        const back = await store.get(f.key);
        if (!back) throw new PublishError(`reverify: sealed package is missing ${f.key}`);
        if (back.length !== f.size || sha256(back) !== f.sha256) throw new PublishError(`reverify: ${f.key} is ${back.length} B sha ${sha256(back).slice(0, 12)}, sealed as ${f.size} B sha ${f.sha256.slice(0, 12)}`);
        verified++;
      });
      if (verified !== plan.files.length) throw new PublishError(`reverify: read back ${verified} of ${plan.files.length} files`);
      log(`[${plan.siteId}] reverified ${verified}/${plan.files.length} sealed objects (sha256 + size)`);
    } else {
      // A seal is trusted, but never blindly: the two files the runtime cannot work without must still be there.
      for (const f of plan.files.filter((x) => x.path === "index.html" || x.path === "404.html")) {
        const back = await store.get(f.key);
        if (!back || sha256(back) !== f.sha256) throw new PublishError(`sealed package is ${back ? "damaged" : "incomplete"}: ${f.key} ${back ? "does not match its seal" : "is missing"} — run with reverify for the full list; refusing to activate it`);
      }
    }
  } else {
    // 6. upload all, then verify each by reading it back
    await pool(plan.files, concurrency, async (f) => {
      await store.put(f.key, await readFile(f.abs), { contentType: f.contentType, cacheControl: f.cacheControl });
      uploaded++;
    });
    log(`[${plan.siteId}] uploaded ${uploaded}/${plan.files.length}`);
    await pool(plan.files, concurrency, async (f) => {
      const back = await store.get(f.key);
      if (!back) throw new PublishError(`verify: ${f.key} missing after upload`);
      if (back.length !== f.size || sha256(back) !== f.sha256) throw new PublishError(`verify: ${f.key} read back ${back.length} B sha ${sha256(back).slice(0, 12)} ≠ ${f.size} B sha ${f.sha256.slice(0, 12)}`);
      verified++;
    });
    log(`[${plan.siteId}] verified ${verified}/${plan.files.length} (sha256 + size)`);
    // Never seal a package that was not fully uploaded AND verified: a sealed package is skipped forever after.
    if (uploaded !== plan.files.length || verified !== plan.files.length) {
      throw new PublishError(`refusing to seal: uploaded ${uploaded} / verified ${verified} of ${plan.files.length} files`);
    }
    // 7. seal last
    await store.put(plan.sealKey, expectedSeal, { contentType: "application/json", cacheControl: "no-store" });
    const sealBack = await store.get(plan.sealKey);
    if (!sealBack || !sameBytes(sealBack, expectedSeal)) throw new PublishError(`verify: seal ${plan.sealKey} did not read back identically`);
    upload = "uploaded";
    log(`[${plan.siteId}] sealed ${plan.sealKey}`);
  }

  if (!activate) {
    log(`[${plan.siteId}] activate: false → ${plan.routingKey} not read, not written`);
    return { status: "uploaded", plan, upload, uploaded, verified };
  }

  // 8. routing pointer, only after a verified seal
  const existing = await readRoutingPointer(store, plan.routingKey);
  if (decidePointer(existing, plan, opts) === "unchanged") {
    log(`[${plan.siteId}] ${plan.routingKey} already points at this package → unchanged`);
    return { status: "published", plan, upload, uploaded, verified, pointer: existing!, pointerWrite: "unchanged" };
  }
  if (existing) await assertSwitchFromLive(store, existing, plan, opts);
  if (plan.shell) await assertPortfolioLive(store, plan, plan.hostname, log);
  const pointer: RoutingPointer = { schemaVersion: SCHEMA_VERSION, hostname: plan.hostname, ...ref(now().toISOString()) };
  if (existing) pointer.previous = refOf(existing);
  await writeRoutingPointer(store, plan.routingKey, pointer);
  log(`[${plan.siteId}] ${plan.routingKey} → ${plan.packageHash.slice(0, 16)}…${pointer.previous ? ` (previous ${pointer.previous.packageHash.slice(0, 16)}…)` : ""}`);
  return { status: "published", plan, upload, uploaded, verified, pointer, pointerWrite: "written" };
}

function refOf(p: PackageRef): PackageRef {
  return { siteId: p.siteId, packageHash: p.packageHash, buildInputId: p.buildInputId, releaseId: p.releaseId, publishedAt: p.publishedAt };
}

async function readRoutingPointer(store: ObjectStore, key: string): Promise<RoutingPointer | undefined> {
  const raw = await store.get(key);
  if (!raw) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    json = undefined;
  }
  const parsed = RoutingPointerSchema.safeParse(json);
  if (!parsed.success) throw new PublishError(`existing ${key} is not a valid routing pointer; refusing to overwrite it`);
  if (routingKey(parsed.data.hostname) !== key) throw new PublishError(`existing ${key} names hostname "${parsed.data.hostname}"; refusing to overwrite a pointer that is not this host's`);
  return parsed.data as RoutingPointer;
}

async function writeRoutingPointer(store: ObjectStore, key: string, pointer: RoutingPointer): Promise<void> {
  const bytes = new TextEncoder().encode(`${JSON.stringify(pointer, null, 2)}\n`);
  await store.put(key, bytes, { contentType: "application/json", cacheControl: "no-store" });
  // From here on the pointer may already have moved: say so instead of claiming it is untouched.
  let back: Uint8Array | null;
  try {
    back = await store.get(key);
  } catch (e) {
    throw new PublishError(`verify: ${key} was WRITTEN but could not be read back (${(e as Error).message}) — the pointer may have moved; inspect it before retrying`);
  }
  if (!back || !sameBytes(back, bytes)) throw new PublishError(`verify: ${key} was WRITTEN but did not read back identically — the pointer may have moved; inspect it before retrying`);
}

/**
 * The ids a site's CURRENT authoritative data serves — the set a fresh build would emit into its
 * portfolio document — and where they came from (for the refusal message). Lazy: rollbackHost only
 * calls it when the target package actually serves a portfolio document.
 */
export type PortfolioTruthLoader = () => Promise<{ authoritativeIds: readonly string[]; source: string }>;

export const ROLLBACK_TRUTH_REFUSAL = "Rollback target would reintroduce portfolio records no longer present in current authoritative site data";
export const ROLLBACK_TRUTH_RUNBOOK = "docs/result/sales-demo-final-closeout-v1/rollback-truth-runbook.md";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Production-truth guard for rollback: a package that serves a portfolio document may become live
 * again only if every record id in that document is still in the site's current authoritative data.
 * Reads the target's sealed _integration/manifest.json and the portfolio document it names (both
 * sha256/size-checked against the seal). No manifest in the seal / no portfolio resource → not
 * portfolio-backed, nothing to check (the loader is not called). Everything else fails closed.
 */
async function assertRollbackPortfolioTruth(store: ObjectStore, target: PackageRef, seal: Partial<PackageSeal>, loader: PortfolioTruthLoader | undefined, log?: (line: string) => void): Promise<void> {
  const files = (seal.files ?? []) as Partial<SealFile>[];
  const manifestPath = `${INTEGRATION_DIR}/${MANIFEST_FILE}`;
  const refuse = (why: string) =>
    new PublishError(`rollback target ${shortHash(target.packageHash)}: ${why}; its portfolio records cannot be checked against current site data, refusing (fails closed) — routing pointer NOT written`);
  const readSealedJson = async (rel: string): Promise<unknown> => {
    const entry = files.find((f) => isRecord(f) && f.path === rel);
    if (!entry) throw refuse(`${rel} is not in the package seal`);
    const body = await store.get(packageKey(target.siteId, target.packageHash, rel));
    if (!body) throw refuse(`${rel} is sealed but missing from the store`);
    const hash = sha256(body);
    if (body.length !== entry.size || hash !== entry.sha256) throw refuse(`${rel} does not match its seal (${body.length} B sha ${hash.slice(0, 12)} ≠ sealed ${String(entry.size)} B sha ${String(entry.sha256).slice(0, 12)})`);
    try {
      return JSON.parse(Buffer.from(body).toString("utf8")) as unknown;
    } catch {
      throw refuse(`${rel} is not valid JSON`);
    }
  };

  if (!files.some((f) => isRecord(f) && f.path === manifestPath)) return; // no integration documents → not portfolio-backed
  const manifest = await readSealedJson(manifestPath);
  if (!isRecord(manifest) || !isRecord(manifest.resources)) throw refuse(`${manifestPath} has no resources object`);
  const resource = manifest.resources[PORTFOLIO_KIND];
  if (resource === undefined) return; // integration manifest without a portfolio resource
  if (!isRecord(resource) || typeof resource.href !== "string" || !resource.href.startsWith("/")) throw refuse(`${manifestPath} resources.${PORTFOLIO_KIND}.href is not a package path`);
  const docPath = resource.href.slice(1);
  const doc = await readSealedJson(docPath);
  const records = isRecord(doc) ? doc.records : undefined;
  if (!Array.isArray(records) || !records.every((r) => isRecord(r) && typeof r.id === "string")) throw refuse(`${docPath} has no records array of objects with a string id`);
  const targetIds = records.map((r) => (r as { id: string }).id);

  if (!loader) {
    throw new PublishError(`rollback target ${shortHash(target.packageHash)} serves a portfolio document (${targetIds.length} records) but no authoritative site data was supplied to check it against; refusing (production-truth guard) — routing pointer NOT written`);
  }
  let truth: Awaited<ReturnType<PortfolioTruthLoader>>;
  try {
    truth = await loader();
  } catch (e) {
    throw new PublishError(`could not load the site's current authoritative data to check rollback target ${shortHash(target.packageHash)} (${(e as Error).message}); refusing (fails closed) — routing pointer NOT written`);
  }
  const authoritative = new Set(truth.authoritativeIds);
  const extra = [...new Set(targetIds.filter((id) => !authoritative.has(id)))].sort(compareCodePoints);
  if (extra.length > 0) {
    throw new PublishError(
      `${ROLLBACK_TRUTH_REFUSAL}: ${extra.length} record id(s) served by target package ${shortHash(target.packageHash)} are not in ${truth.source}: ${extra.join(", ")} — routing pointer NOT written. ` +
        `To restore content, restore the wanted state in source, build a new package and publish it forward — see ${ROLLBACK_TRUTH_RUNBOOK}`,
    );
  }
  log?.(`[${target.siteId}] portfolio truth: rollback target ids ⊆ authoritative (${targetIds.length}/${authoritative.size})`);
}

/** The record set BoostChat has published for the shell package `live` — the manifest.projects of its verified overlay. Throws when there is none. */
async function overlayTruth(store: ObjectStore, hostname: string, live: { siteId: string; packageHash: string }): Promise<{ authoritativeIds: readonly string[]; source: string }> {
  const why = `${hostname} is published incrementally: its portfolio lives in BoostChat, not in a checkout, and the published set is read from the portfolio overlay of the package the hostname serves now`;
  const { state, manifest } = await inspectOverlay(store, live.siteId, live.packageHash);
  if (!manifest) {
    throw new PublishError(`${why} — package ${shortHash(live.packageHash)} has no overlay recon-runtime would use (${state.key} ${state.state === "refused" ? `refused: ${state.reason}` : "does not exist"})`);
  }
  if (!isRecord(manifest.projects)) throw new PublishError(`${why} — the live manifest of package ${shortHash(live.packageHash)} has no projects table`);
  return { authoritativeIds: Object.keys(manifest.projects), source: `the portfolio BoostChat has published for ${hostname} (${state.key}, revision ${String(manifest.revision)})` };
}

/**
 * The authoritative portfolio ids of an INCREMENTALLY published site, for the rollback
 * portfolio-truth guard. Such a site keeps no portfolio in the checkout — BoostChat owns it and
 * publishes it as the overlay of the site's shell package — so "what the site serves now" is the
 * record set of the live overlay manifest (manifest.projects) of the package the hostname serves at
 * this moment. Throws when that cannot be established (no pointer, another site's pointer, no
 * overlay recon-runtime would use, a manifest without a projects table): the guard then refuses.
 * rollbackHost uses this truth by itself whenever the live package is a shell package; this export is
 * for a caller whose checkout says "incremental" while the host serves something else.
 */
export async function publishedPortfolioTruth(store: ObjectStore, siteId: string, hostnameInput: string): Promise<{ authoritativeIds: readonly string[]; source: string }> {
  const hostname = normalizeHostname(hostnameInput);
  const live = await readRoutingPointer(store, routingKey(hostname));
  if (!live || live.siteId !== siteId) {
    throw new PublishError(`"${siteId}" is published incrementally and its published portfolio is read from the package ${hostname} serves now — ${routingKey(hostname)} ${live ? `names site "${live.siteId}"` : "does not exist"}`);
  }
  return overlayTruth(store, hostname, live);
}

/**
 * Rollback = re-point routing/<hostname>.json at its `previous` package (already sealed in the
 * store, so nothing is uploaded). The package being left becomes the new `previous`, so a second
 * rollback rolls forward again. Refuses when there is no previous, the pointer serves another
 * site, or the previous package's seal is missing / does not match. When the previous package
 * serves a portfolio document, its record ids must all still be in the site's current
 * authoritative data (portfolioTruth); otherwise — or when portfolioTruth is not given, or the
 * sealed documents cannot be read and verified — it refuses before the pointer is written. There
 * is no override: the fix is a new build published forward (ROLLBACK_TRUTH_RUNBOOK).
 * When the previous package is a SHELL package, the store must hold a portfolio overlay recon-runtime
 * would use for it (assertPortfolioLive), exactly as for a forward publish.
 * Which truth: decided by the STORE. If the package the hostname serves now is a shell package, the
 * truth is the portfolio BoostChat has published for it (overlayTruth) and portfolioTruth is NOT
 * called — a checkout that does not know the host is incremental must not vouch for it with its own
 * projects.json. If the live package is ordinary, portfolioTruth is used exactly as before.
 */
export async function rollbackHost(opts: {
  store: ObjectStore;
  siteId: string;
  hostname: string;
  expectLivePackageHash?: string;
  /** current authoritative portfolio ids; only called when the target package serves a portfolio document AND the live package is not a shell package */
  portfolioTruth?: PortfolioTruthLoader;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<{ pointer: RoutingPointer; from: PackageRef }> {
  const hostname = normalizeHostname(opts.hostname);
  const key = routingKey(hostname);
  const existing = await readRoutingPointer(opts.store, key);
  if (!existing) throw new PublishError(`${key} does not exist; nothing to roll back`);
  assertExpectedLive(existing, opts.expectLivePackageHash, key);
  if (existing.siteId !== opts.siteId) throw new PublishError(`${hostname} serves site "${existing.siteId}", not "${opts.siteId}"`);
  const target = existing.previous;
  if (!target) throw new PublishError(`${key} has no previous package; nothing to roll back to`);
  if (target.siteId !== opts.siteId) throw new PublishError(`previous package belongs to site "${target.siteId}"; refusing a cross-site rollback`);
  const sealRaw = await opts.store.get(sealKey(target.siteId, target.packageHash));
  let seal: Partial<PackageSeal> | undefined;
  try {
    seal = sealRaw ? (JSON.parse(Buffer.from(sealRaw).toString("utf8")) as Partial<PackageSeal>) : undefined;
  } catch {
    seal = undefined;
  }
  if (!seal || seal.siteId !== target.siteId || seal.packageHash !== target.packageHash || !Array.isArray(seal.files) || seal.files.length === 0) {
    throw new PublishError(`previous package ${target.packageHash.slice(0, 16)}… has no valid seal in the store; refusing to roll back to it`);
  }
  // The store decides whose truth applies: a host that serves a shell package is published from BoostChat.
  const liveSeal = await readSeal(opts.store, existing);
  const truth: PortfolioTruthLoader | undefined = !liveSeal
    ? async () => {
        throw new PublishError(`the seal of the package ${hostname} serves now (${sealKey(existing.siteId, existing.packageHash)}) cannot be read, so it cannot be told whether the host is published incrementally`);
      }
    : isShellPackage(liveSeal.files)
      ? () => overlayTruth(opts.store, hostname, existing)
      : opts.portfolioTruth;
  await assertRollbackPortfolioTruth(opts.store, target, seal, truth, opts.log);
  // Shell-package guard: the same rule as a forward publish. An ordinary target is not looked at.
  if (isShellPackage(seal.files)) await assertPortfolioLive(opts.store, target, hostname, opts.log);
  const pointer: RoutingPointer = { schemaVersion: SCHEMA_VERSION, hostname, ...refOf(target), publishedAt: (opts.now ?? (() => new Date()))().toISOString(), previous: refOf(existing) };
  await writeRoutingPointer(opts.store, key, pointer);
  opts.log?.(`[${opts.siteId}] ${key} rolled back ${existing.packageHash.slice(0, 16)}… → ${target.packageHash.slice(0, 16)}… (${target.releaseId})`);
  return { pointer, from: refOf(existing) };
}
