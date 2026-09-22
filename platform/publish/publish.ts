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
 *   refused too. Rollback needs no check of its own: it only returns to `previous`, the pair the
 *   forward publish already compared.
 * Rollback (rollbackHost): re-point a hostname at its pointer's `previous` package; no upload.
 */

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SITE_BUILDS_DIR, packageIntact } from "../build/site-build";
import { sha256 } from "../util/hash";
import {
  CACHE_IMMUTABLE,
  HASH_RE,
  HOSTNAME_RE,
  SCHEMA_VERSION,
  SEAL_NAME,
  SITE_ID_RE,
  packageKey,
  routingKey,
  sealKey,
  type PackageRef,
  type PackageSeal,
  type RoutingPointer,
  type SealFile,
} from "../../workers/recon-runtime/src/contract";
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
}

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
    warnings,
  };
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

/**
 * Browsers keep an immutable-cached URL for a year, so a path served immutable by BOTH the package
 * a hostname serves now and the one about to replace it must carry the same bytes. Compared against
 * the live package's seal only. A live seal that is absent or unreadable is a refusal, not a pass.
 */
async function assertImmutablePathsStable(store: ObjectStore, live: RoutingPointer, plan: PublishPlan): Promise<void> {
  const raw = await store.get(sealKey(live.siteId, live.packageHash));
  let seal: Partial<PackageSeal> | undefined;
  try {
    seal = raw ? (JSON.parse(Buffer.from(raw).toString("utf8")) as Partial<PackageSeal>) : undefined;
  } catch {
    seal = undefined;
  }
  if (!seal || !Array.isArray(seal.files)) {
    throw new PublishError(`${plan.hostname} serves package ${shortHash(live.packageHash)} whose seal cannot be read, so immutable-cached paths cannot be compared; refusing to switch. Inspect ${sealKey(live.siteId, live.packageHash)}; to start the hostname over, delete ${plan.routingKey} and publish again`);
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
      if (existing && pointerAction === "write") await assertImmutablePathsStable(ro, existing, plan);
      live = existing ? refOf(existing) : null;
      if (existing && pointerAction === "write") pointer.previous = refOf(existing);
    }
    const storeCheck: StoreCheck = {
      store: opts.store.description,
      seal: seal ? "identical" : "absent",
      wouldUpload: seal ? 0 : plan.files.length,
      wouldSkip: seal ? plan.files.length : 0,
      live,
      pointerAction,
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
  if (existing) await assertImmutablePathsStable(store, existing, plan);
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
 * Rollback = re-point routing/<hostname>.json at its `previous` package (already sealed in the
 * store, so nothing is uploaded). The package being left becomes the new `previous`, so a second
 * rollback rolls forward again. Refuses when there is no previous, the pointer serves another
 * site, or the previous package's seal is missing / does not match.
 */
export async function rollbackHost(opts: { store: ObjectStore; siteId: string; hostname: string; expectLivePackageHash?: string; now?: () => Date; log?: (line: string) => void }): Promise<{ pointer: RoutingPointer; from: PackageRef }> {
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
  const pointer: RoutingPointer = { schemaVersion: SCHEMA_VERSION, hostname, ...refOf(target), publishedAt: (opts.now ?? (() => new Date()))().toISOString(), previous: refOf(existing) };
  await writeRoutingPointer(opts.store, key, pointer);
  opts.log?.(`[${opts.siteId}] ${key} rolled back ${existing.packageHash.slice(0, 16)}… → ${target.packageHash.slice(0, 16)}… (${target.releaseId})`);
  return { pointer, from: refOf(existing) };
}
