/**
 * site:publish activation guard for SHELL packages (Portfolio Publishing V2) — `pnpm test:publish-shell-guard`.
 *
 * A shell package's portfolio pages are empty placeholders; the Worker fills them from the overlay
 * BoostChat publishes (portfolio-public/<siteId>/current/<packageHash>.json → manifest). A hostname may
 * be pointed at a shell package only while the store holds an overlay the Worker would USE for it.
 * Memory store, the REAL packages of Demo 02 (current = shell, previous.json = its last ordinary
 * build) and of fixture-empty (ordinary); the Worker is the real handler over the same objects.
 *
 *   S1  plan            a shell package is recognised by its own files; an ordinary one is not
 *   S2  refused         no overlay pointer → no routing write (package uploaded + sealed, nothing else)
 *   S3  refused         every way the Worker refuses an overlay — and the Worker gives the same reason (503)
 *   S4  accepted        a valid overlay → the pointer is the last write; the Worker serves the overlay
 *   S5  unaffected      activate:false, dry run (reports the guard, never throws for it), a pointer that
 *                       already names the package
 *   S6  ordinary        an ordinary package activates as before and no overlay key is ever read
 *   S7  rollback        an ordinary target is not held to the shell guard; a shell target is
 *   S7b rollback truth  the STORE decides: live package = shell → the authoritative ids are the live
 *                       overlay manifest's projects, and the caller's (checkout) loader is never asked;
 *                       live package = ordinary → the caller's loader, as before
 *   S10 incremental host  an ordinary build may not replace the shell package a host serves — from any
 *                       checkout — unless leaveIncremental says so
 *   S8  serving         a shell package without its overlay is closed (503) outside /_next/; with it, every
 *                       addressable file the overlay does not own is served; /_runtime/** never is
 *   S9  CLI             the offline dry run names the guard
 *
 * The managed publish flow (platform/publish/managed-flow.ts) — one command ships a shell package.
 * A DIRECTORY stands in for the bucket (DirectoryStore, the layout runtime:local serves), BoostChat is
 * a fake announcer, time is a fake clock: no network, no waiting.
 *   M1  queued → BoostChat publishes during the wait → activated
 *   M2  queued → never published → timeout, routing untouched; the same command later activates
 *   M3  already_published → no wait; the guard still decides
 *   M4  mode_v1 → not activated, non-zero
 *   M5  404 site_not_found / 409 / 401 / 403 / 5xx / no answer → not activated, the reason
 *   M6  no BoostChat configuration / --no-announce → today's behaviour + one line
 *   M7  --no-activate → upload + announce, stop, exit 0
 *   M8  an ordinary package → no announce
 *   M9  the wait is not the guard (overlay gone at the write → refused); stale --expect-live first
 *   M10 the real announcer over a fake fetch: the contract, the mapping, no token in any message
 *   INVARIANT  every routing write to a shell package in M1–M9 happened under a usable overlay
 * A new managed site is V2:
 *   K1  site:portfolio-managed writes portfolio-source@2; --dry-run; idempotent
 *   K2  refused for a release without the portfolio runtime (and other unpublishable states)
 *   K3  site:portfolio-sync --adopt refuses without --legacy-v1
 *   K4  CLI flags of the flow; configuration judged before any upload
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnnounceError, createBoostChatAnnouncer, shellPackagePath, type AnnounceState, type ShellPackageAnnouncer } from "../publish/announce";
import { managedExitCode, publishManaged, type AnnounceSetup } from "../publish/managed-flow";
import { isShellPackage, planPublish, portfolioOverlayState, publishedPortfolioTruth, publishSite, PublishError, rollbackHost, ROLLBACK_TRUTH_REFUSAL, type PortfolioTruthLoader } from "../publish/publish";
import { DirectoryStore, MemoryStore, type ObjectStore } from "../publish/store";
import { declareManagedPortfolio } from "../portfolio-sync/declare";
import { ManagedPortfolioError, SOURCE_MARKER_FILE, SOURCE_MARKER_TEXT, SOURCE_MARKER_V2_TEXT, readPortfolioSource } from "../portfolio-sync/managed";
import { RUNTIME_DIR, RUNTIME_FILE, SHELL_FILE } from "../portfolio-runtime/contract";
import { handle, newTrace, type Env, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import { portfolioCurrentKey, portfolioPublicKey, sealKey } from "../../workers/recon-runtime/src/contract";

const repoRoot = process.cwd();
const SHELL_SITE = "boost-interior-demo-02";
const ORDINARY_SITE = "fixture-empty";
const HOST = "shell-guard.test.example";
const T0 = () => new Date("2026-10-10T00:00:00.000Z");
const JSON_META = { contentType: "application/json", cacheControl: "no-store" };
const REFUSAL = /is a portfolio shell package .* Publish the portfolio of "boost-interior-demo-02" for this package from BoostChat first/s;

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
/** the PublishError a promise rejects with */
async function refusal(p: Promise<unknown>, label: string): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert(e instanceof PublishError, `${label}: not a PublishError: ${(e as Error).message}`);
    return e.message;
  }
  throw new Error(`${label}: expected a refusal`);
}
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const enc = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const text = (s: MemoryStore, key: string) => Buffer.from(s.objects.get(key)!.body).toString("utf8");

/** Fake R2 over a memory store, as publish.test.ts builds it. */
function bucketOf(s: MemoryStore): R2BucketLike {
  const meta = (key: string) => {
    const o = s.objects.get(key);
    return o ? { size: o.body.length, httpEtag: `"${createHash("md5").update(o.body).digest("hex")}"`, httpMetadata: { contentType: o.meta.contentType, cacheControl: o.meta.cacheControl }, bytes: o.body } : null;
  };
  return {
    async get(key) {
      const o = meta(key);
      if (!o) return null;
      return { size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata, body: new Blob([new Uint8Array(o.bytes)]).stream(), text: async () => Buffer.from(o.bytes).toString("utf8") } as R2ObjectBodyLike;
    },
    async head(key) {
      const o = meta(key);
      return o && { size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata };
    },
  };
}
/** records every key get() / put() is called with, then forwards */
function spy(s: MemoryStore): ObjectStore & { gets: string[]; puts: string[] } {
  const gets: string[] = [];
  const puts: string[] = [];
  return { description: "spy", gets, puts, get: (k) => (gets.push(k), s.get(k)), put: (k, b, m) => (puts.push(k), s.put(k, b, m)) };
}

const shellPlan = await planPublish({ repoRoot, siteId: SHELL_SITE, hostname: HOST });
const ordinaryPlan = await planPublish({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST });
const HASH = shellPlan.packageHash;
const CURRENT_KEY = portfolioCurrentKey(SHELL_SITE, HASH);

let revisionCounter = 0;
interface OverlayEdit {
  manifest?: (m: Record<string, any>) => void;
  pointer?: (p: Record<string, any>) => void;
  /** bytes stored at the manifest key instead of the manifest's own; null = nothing stored there */
  storedManifest?: Uint8Array | null;
  /** bytes stored at the pointer key instead of the pointer's own */
  storedPointer?: Uint8Array;
  home?: string;
}
/** What the BoostChat publisher writes for (site, package), in its order: page → manifest → pointer last. A new revision on every call. */
function publishOverlay(s: MemoryStore, edit: OverlayEdit = {}, siteId = SHELL_SITE, packageHash = HASH) {
  const revision = ++revisionCounter;
  const home = enc(edit.home ?? `COMPOSED home r${revision}`);
  const homeKey = `blobs/${sha256(home)}.html`;
  s.objects.set(portfolioPublicKey(siteId, homeKey), { body: home, meta: { contentType: "text/html; charset=utf-8", cacheControl: "no-store" } });
  const manifest: Record<string, any> = {
    schema: "portfolio-manifest@1",
    siteId,
    revision,
    shell: { packageHash, releaseId: shellPlan.releaseId },
    owned: { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
    routes: { "/": { key: homeKey, sha256: sha256(home), size: home.length, contentType: "text/html; charset=utf-8" } },
    assets: {},
    projects: {},
  };
  edit.manifest?.(manifest);
  const manifestBytes = enc(manifest);
  const manifestKey = `revisions/${revision}/${sha256(manifestBytes).slice(0, 16)}.json`;
  if (edit.storedManifest !== null) s.objects.set(portfolioPublicKey(siteId, manifestKey), { body: edit.storedManifest ?? manifestBytes, meta: JSON_META });
  const pointer: Record<string, any> = { schema: "portfolio-current@1", siteId, shellPackageHash: packageHash, revision, manifestKey, manifestSha256: sha256(manifestBytes), publishedAt: "2026-10-10T00:00:00.000Z" };
  edit.pointer?.(pointer);
  s.objects.set(portfolioCurrentKey(siteId, packageHash), { body: edit.storedPointer ?? enc(pointer), meta: JSON_META });
  return { revision, home, manifestKey: portfolioPublicKey(siteId, manifestKey) };
}
const routingWrites = (s: MemoryStore) => s.writes.filter((k) => k.startsWith("routing/"));

console.log("shell package activation guard (memory store, real packages)");

await check("S1 a shell package is recognised by its own files (_runtime/portfolio/*): the plan of Demo 02 names the overlay pointer it needs; an ordinary package's plan names none", () => {
  assert(shellPlan.files.some((f) => f.path === RUNTIME_FILE) && shellPlan.files.some((f) => f.path === SHELL_FILE), "Demo 02's current package carries the runtime documents");
  eq(shellPlan.shell, { currentKey: CURRENT_KEY }, "shell plan");
  eq(CURRENT_KEY, `portfolio-public/${SHELL_SITE}/current/${HASH}.json`, "pointer key (contract §2.1)");
  assert(!ordinaryPlan.files.some((f) => f.path.startsWith("_runtime/")), "fixture-empty has no /_runtime/");
  eq(ordinaryPlan.shell, undefined, "ordinary plan");
});

await check("S2 no overlay pointer → activation REFUSED: the package is uploaded and sealed, no routing key is written; an existing pointer stays byte-identical; the message says what to do", async () => {
  const s = new MemoryStore();
  const message = await refusal(publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 }), "first activation");
  assert(REFUSAL.test(message), `message: ${message}`);
  assert(message.includes(`${CURRENT_KEY} does not exist`) && message.includes("routing pointer NOT written") && message.includes(HOST), `message names the key, the host and the outcome: ${message}`);
  eq([s.objects.has(shellPlan.sealKey), routingWrites(s), s.objects.has(shellPlan.routingKey)], [true, [], false], "sealed, no pointer");
  eq(s.writes.length, shellPlan.files.length + 1, "writes = every file + the seal");
  eq(await portfolioOverlayState(s, SHELL_SITE, HASH), { state: "absent", key: CURRENT_KEY }, "state");

  // the host already serves another (sealed) package of the site: its pointer does not move
  const prior = { schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: "a".repeat(64), buildInputId: "b".repeat(64), releaseId: "interior-02-0.0.0-prior", publishedAt: "2026-10-01T00:00:00.000Z" };
  const priorBytes = enc(`${JSON.stringify(prior, null, 2)}\n`);
  s.objects.set(shellPlan.routingKey, { body: priorBytes, meta: JSON_META });
  s.objects.set(sealKey(SHELL_SITE, prior.packageHash), { body: enc({ ...shellPlan.seal, packageHash: prior.packageHash, files: [] }), meta: JSON_META });
  const w = s.writes.length;
  assert(REFUSAL.test(await refusal(publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 }), "switch")), "refused again");
  eq([s.writes.length - w, Buffer.compare(Buffer.from(s.objects.get(shellPlan.routingKey)!.body), Buffer.from(priorBytes))], [0, 0], "zero writes, pointer bytes unchanged");
});

/** every way an overlay can be present and still not usable: the reason the Worker logs for it */
const DEFECTS: [label: string, reason: string, edit: OverlayEdit, siteId?: string][] = [
  ["pointer is not JSON", "current-unparsable", { storedPointer: enc("{not json") }],
  ["pointer schema", "current-schema", { pointer: (p) => (p.schema = "portfolio-current@2") }],
  ["pointer names another site", "current-identity", { pointer: (p) => (p.siteId = "another-site") }],
  ["pointer names another package", "current-identity", { pointer: (p) => (p.shellPackageHash = "c".repeat(64)) }],
  ["pointer manifestKey leaves the prefix", "current-manifest-ref", { pointer: (p) => (p.manifestKey = "../other/revisions/1/x.json") }],
  ["pointer manifestSha256 is not a hash", "current-manifest-ref", { pointer: (p) => (p.manifestSha256 = "xyz") }],
  ["manifest object missing", "manifest-missing", { storedManifest: null }],
  ["manifest bytes ≠ manifestSha256", "manifest-sha256", { storedManifest: enc('{"schema":"portfolio-manifest@1","tampered":true}') }],
  ["manifest schema", "manifest-invalid", { manifest: (m) => (m.schema = "portfolio-manifest@2") }],
  ["manifest without owned", "manifest-invalid", { manifest: (m) => delete m.owned }],
  ["manifest of another site", "manifest-identity", { manifest: (m) => (m.siteId = "another-site") }],
  ["manifest of another shell package", "manifest-identity", { manifest: (m) => (m.shell.packageHash = "d".repeat(64)) }],
];

await check(`S3 an overlay the Worker would refuse is refused here too (${DEFECTS.length} defects): same reason code as the Worker's trace.overlay, no routing write; with the pointer forced, the Worker fails closed for that same reason (503 overlay-refused, never the shell page)`, async () => {
  for (const [label, reason, edit] of DEFECTS) {
    const s = new MemoryStore();
    await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
    publishOverlay(s, edit);
    const state = await portfolioOverlayState(s, SHELL_SITE, HASH);
    eq(state, { state: "refused", key: CURRENT_KEY, reason }, `${label}: state`);
    const w = s.writes.length;
    const message = await refusal(publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 }), label);
    assert(REFUSAL.test(message) && message.includes(`(${reason}:`), `${label}: message carries the reason: ${message}`);
    eq([s.writes.length - w, s.objects.has(shellPlan.routingKey)], [0, false], `${label}: zero writes, no pointer`);

    // the Worker, asked for "/" on a host forced onto this package, refuses the overlay for the same reason and answers 503
    s.objects.set(shellPlan.routingKey, { body: enc({ schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: HASH, buildInputId: shellPlan.buildInputId, releaseId: shellPlan.releaseId, publishedAt: T0().toISOString() }), meta: JSON_META });
    const request = new Request(`https://${HOST}/`);
    const trace = newTrace(request);
    const r = await handle(request, { SITES: bucketOf(s) }, trace);
    eq([r.status, trace.outcome, trace.overlay, r.headers.get("cache-control"), await r.text()], [503, "overlay-refused", reason, "no-store", "content unavailable\n"], `${label}: Worker`);
  }
});

await check("S4 a valid overlay → published: the routing pointer is the LAST write and names the shell package; the Worker then answers / from the overlay and never with a shell page; a later revision needs no new activation", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  const o = publishOverlay(s);
  eq(await portfolioOverlayState(s, SHELL_SITE, HASH), { state: "live", key: CURRENT_KEY, revision: o.revision }, "state");
  const w = s.writes.length;
  const log: string[] = [];
  const r = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, log: (l) => log.push(l) });
  assert(r.status === "published" && r.upload === "skipped-sealed" && r.pointerWrite === "written", `result ${r.status}`);
  eq(s.writes.slice(w), [shellPlan.routingKey], "the one write");
  eq(JSON.parse(text(s, shellPlan.routingKey)).packageHash, HASH, "pointer");
  assert(log.some((l) => l.includes(`revision ${o.revision}`) && l.includes("portfolio")), `the passing guard is logged: ${log.join(" | ")}`);

  const env: Env = { SITES: bucketOf(s) };
  const get = async (p: string) => {
    const res = await handle(new Request(`https://${HOST}${p}`), env);
    return [res.status, sha256(new Uint8Array(await res.arrayBuffer()))];
  };
  const notFound = shellPlan.files.find((f) => f.path === "404.html")!.sha256;
  eq(await get("/"), [200, sha256(o.home)], "/ is the composed page");
  eq(await get("/portfolio"), [404, notFound], "/portfolio (owned, not in this manifest) is the 404 page, not the shell");
  eq(await get("/portfolio/_shell"), [404, notFound], "the shell detail page is never served");
  eq(await get("/about"), [200, shellPlan.files.find((f) => f.path === "about.html")!.sha256], "/about is the package's");
  const o2 = publishOverlay(s, { home: "COMPOSED home, next revision" });
  eq(await get("/"), [200, sha256(o2.home)], "next revision live without a routing write");
  eq(s.writes.slice(w), [shellPlan.routingKey], "still one routing write");
});

await check("S5 unaffected: activate:false never reads the overlay or the routing pointer; a pointer that already names the package is left as it is; a dry run never throws for the guard — without the store it only names the key, with checkStore it reports absent / refused / live and whether activation would pass (zero writes)", async () => {
  const s = new MemoryStore();
  const sp = spy(s);
  const up = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: sp, now: T0, activate: false });
  eq([up.status, sp.gets.filter((k) => k.startsWith("portfolio-public/") || k.startsWith("routing/")), routingWrites(s)], ["uploaded", [], []], "activate:false");

  let calls = 0;
  const none: ObjectStore = { description: "none", put: async () => void calls++, get: async () => (calls++, null) };
  const dry = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: none, dryRun: true, now: T0 });
  assert(dry.status === "dry-run" && dry.storeCheck === undefined && dry.plan.shell?.currentKey === CURRENT_KEY, "offline dry run");
  eq(calls, 0, "offline dry run: store calls");

  const w = s.writes.length;
  const absent = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(absent.status === "dry-run", "dry-run");
  eq(absent.storeCheck?.portfolioOverlay, { state: "absent", key: CURRENT_KEY, activation: "would-refuse" }, "checkStore, no overlay");
  eq([absent.storeCheck?.seal, absent.storeCheck?.pointerAction], ["identical", "write"], "the rest of the store check is still reported");
  const notActivated = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, activate: false, now: T0 });
  assert(notActivated.status === "dry-run", "dry-run");
  eq([notActivated.storeCheck?.pointerAction, notActivated.storeCheck?.portfolioOverlay?.activation], ["not-activated", "would-refuse"], "checkStore + activate:false still says what a later activation would meet");
  publishOverlay(s, { storedManifest: null });
  const refused = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(refused.status === "dry-run", "dry-run");
  eq(refused.storeCheck?.portfolioOverlay, { state: "refused", key: CURRENT_KEY, reason: "manifest-missing", activation: "would-refuse" }, "checkStore, manifest missing");
  const o = publishOverlay(s);
  const live = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(live.status === "dry-run", "dry-run");
  eq(live.storeCheck?.portfolioOverlay, { state: "live", key: CURRENT_KEY, revision: o.revision, activation: "would-pass" }, "checkStore, valid overlay");
  eq(s.writes.length, w, "dry runs wrote nothing");

  // the host already serves this shell package: nothing is written, so nothing is refused (even with the overlay gone)
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });
  s.objects.delete(CURRENT_KEY);
  const again = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });
  assert(again.status === "published" && again.pointerWrite === "unchanged", "unchanged pointer");
});

await check("S6 an ordinary package is unaffected: it activates with no overlay in the store, no portfolio-public/ key is ever read, and its dry-run store check carries no overlay report", async () => {
  const s = new MemoryStore();
  const sp = spy(s);
  const r = await publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST, store: sp, now: T0 });
  assert(r.status === "published" && r.pointerWrite === "written", "published");
  eq(s.writes[s.writes.length - 1], ordinaryPlan.routingKey, "pointer written last");
  eq(sp.gets.filter((k) => k.startsWith("portfolio-public/")), [], "overlay keys read");
  const dry = await publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: "other.test.example", store: s, dryRun: true, checkStore: true, now: T0 });
  assert(dry.status === "dry-run" && dry.storeCheck !== undefined && !("portfolioOverlay" in dry.storeCheck), "no overlay report for an ordinary package");
});

// ── rollback / the host's live package ───────────────────────────────────────────────────────────
/**
 * A checkout in which Demo 02 is still an ORDINARY site: its current.json names the site's last ordinary
 * build (data/site-builds/<site>/previous.json) and there is no portfolio.source.json in it at all.
 */
const prevBuild = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SHELL_SITE, "previous.json"), "utf8")) as { buildInputId: string; packageDir: string };
const ordinaryRoot = await mkdtemp(path.join(os.tmpdir(), "recon-shell-guard-"));
const ordinaryDest = path.join(ordinaryRoot, "data/site-builds", SHELL_SITE, "packages", prevBuild.buildInputId);
await cp(path.join(repoRoot, prevBuild.packageDir), ordinaryDest, { recursive: true });
await writeFile(path.join(ordinaryRoot, "data/site-builds", SHELL_SITE, "current.json"), JSON.stringify({ buildInputId: prevBuild.buildInputId, packageDir: path.relative(ordinaryRoot, ordinaryDest), finishedAt: "2026-10-09T09:09:40.032Z" }));
const ordinaryBuildPlan = await planPublish({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST });
const ORDINARY_IDS = await (async () => {
  const integration = path.join(ordinaryDest, "site/_integration");
  const docName = (await readdir(integration)).find((n) => n.startsWith("portfolio."));
  assert(docName, "the ordinary build serves a portfolio document");
  return (JSON.parse(await readFile(path.join(integration, docName), "utf8")) as { records: { id: string }[] }).records.map((x) => x.id);
})();
const ORDINARY_REF = { siteId: SHELL_SITE, packageHash: ordinaryBuildPlan.packageHash, buildInputId: ordinaryBuildPlan.buildInputId, releaseId: ordinaryBuildPlan.releaseId, publishedAt: "2026-10-09T09:10:00.000Z" };
/** upload + seal the ordinary build (no pointer) */
async function sealOrdinaryBuild(s: MemoryStore): Promise<void> {
  const r = await publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  assert(r.status === "uploaded" && r.plan.shell === undefined && r.plan.packageHash !== HASH && ORDINARY_IDS.length > 0, "the previous build is an ordinary, portfolio-backed package of its own");
}
/** a loader as a checkout would supply it (projects.json), counting its calls */
function truthLoader(ids: readonly string[]): PortfolioTruthLoader & { calls: number } {
  const loader = Object.assign(async () => (loader.calls++, { authoritativeIds: ids, source: "checkout projects.json (test)" }), { calls: 0 });
  return loader;
}
const projectsOf = (ids: readonly string[]) => (m: Record<string, any>) => (m.projects = Object.fromEntries(ids.map((id) => [id, { slug: id, key: `projects/${id}/${"e".repeat(64)}.json`, sha256: "e".repeat(64) }])));
const pointerBytes = (s: MemoryStore) => Buffer.from(s.objects.get(shellPlan.routingKey)!.body);
/** store with: ordinary build sealed, shell package sealed, an overlay publishing `ids`, host live on the SHELL package with previous = the ordinary build */
async function liveOnShell(ids: readonly string[]): Promise<MemoryStore> {
  const s = new MemoryStore();
  await sealOrdinaryBuild(s);
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  publishOverlay(s, { manifest: projectsOf(ids) });
  s.objects.set(shellPlan.routingKey, { body: enc(`${JSON.stringify({ schemaVersion: 1, hostname: HOST, ...ORDINARY_REF }, null, 2)}\n`), meta: JSON_META });
  const activated = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });
  assert(activated.status === "published" && activated.pointerWrite === "written" && activated.pointer.previous?.packageHash === ORDINARY_REF.packageHash, "live = shell, previous = ordinary");
  return s;
}

await check("S7 rollback and the shell guard: an ORDINARY target is not held to it (a target without a portfolio document rolls back with no overlay in the store and no overlay read); a SHELL target is refused without a usable overlay (pointer byte-identical, zero writes) and passes with one", async () => {
  // live = shell, previous = a crafted ordinary package with no integration documents; the overlay is gone
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  const PLAIN = "f".repeat(64);
  const plainFiles = ["index.html", "404.html"].map((rel) => ({ path: rel, size: 15, sha256: sha256("<!doctype html>"), contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=0, must-revalidate" }));
  s.objects.set(sealKey(SHELL_SITE, PLAIN), { body: enc({ schemaVersion: 1, siteId: SHELL_SITE, packageHash: PLAIN, buildInputId: "1".repeat(64), releaseId: "interior-02-0.0.0-plain", fileCount: 2, bytes: 30, files: plainFiles }), meta: JSON_META });
  const plainRef = { siteId: SHELL_SITE, packageHash: PLAIN, buildInputId: "1".repeat(64), releaseId: "interior-02-0.0.0-plain", publishedAt: "2026-10-01T00:00:00.000Z" };
  s.objects.set(shellPlan.routingKey, { body: enc({ schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: HASH, buildInputId: shellPlan.buildInputId, releaseId: shellPlan.releaseId, publishedAt: T0().toISOString(), previous: plainRef }), meta: JSON_META });
  const sp = spy(s);
  const back = await rollbackHost({ store: sp, siteId: SHELL_SITE, hostname: HOST, now: T0 });
  eq([back.pointer.packageHash, back.pointer.previous?.packageHash, sp.puts], [PLAIN, HASH, [shellPlan.routingKey]], "rolled back to the ordinary package");
  eq(sp.gets.filter((k) => k.startsWith("portfolio-public/")), [], "no overlay key read for an ordinary target without a portfolio document");

  // now previous = the shell package: no overlay → refused; a defective one → refused; a valid one → rolled forward
  const liveOrdinary = pointerBytes(s);
  const w = s.writes.length;
  const absent = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0 }), "rollback to shell, no overlay");
  assert(REFUSAL.test(absent) && absent.includes(`${CURRENT_KEY} does not exist`) && absent.includes("answer 503") && absent.includes("routing pointer NOT written"), `message: ${absent}`);
  publishOverlay(s, { storedManifest: enc("{}") });
  const defective = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0 }), "rollback to shell, bad manifest");
  assert(REFUSAL.test(defective) && defective.includes("(manifest-sha256:") && defective.includes("answer 503"), `message: ${defective}`);
  eq([s.writes.length - w, Buffer.compare(pointerBytes(s), liveOrdinary)], [0, 0], "zero writes, pointer byte-identical");
  publishOverlay(s);
  const none = truthLoader([]);
  const forward = await rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: none });
  eq([forward.pointer.packageHash, forward.pointer.previous?.packageHash, s.writes.slice(w), none.calls], [HASH, PLAIN, [shellPlan.routingKey], 0], "rolled forward to the shell package (no portfolio document in it → no truth needed)");
});

await check("S7b rollback truth is decided by the STORE: while the host serves a shell package, the authoritative ids are the record ids BoostChat has published for it — the caller's loader (a checkout WITHOUT the @2 marker that would vouch for every id from its projects.json, or one that knows none) is never called; a withdrawn record is refused by name; no usable overlay → fails closed", async () => {
  // BoostChat has withdrawn one record of the ordinary build since the host went incremental
  const withdrawn = ORDINARY_IDS[0]!;
  const s = await liveOnShell(ORDINARY_IDS.slice(1));
  const liveShell = pointerBytes(s);
  const w = s.writes.length;
  // an old checkout: no marker, projects.json still lists all the ids → by ITS truth the rollback would pass
  const stale = truthLoader(ORDINARY_IDS);
  const re = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: stale }), "withdrawn record, vouching checkout");
  assert(re.startsWith(ROLLBACK_TRUTH_REFUSAL) && re.includes(`: ${withdrawn} —`) && re.includes("the portfolio BoostChat has published") && !re.includes("checkout projects.json"), `message: ${re}`);
  eq(stale.calls, 0, "the checkout's loader was not asked");
  // no loader at all: same verdict (the store's), not "no authoritative data supplied"
  const bare = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0 }), "withdrawn record, no loader");
  assert(bare.startsWith(ROLLBACK_TRUTH_REFUSAL) && bare.includes(withdrawn), `message: ${bare}`);
  // the overlay stops verifying → no authoritative data → fails closed, still without asking the checkout
  publishOverlay(s, { storedManifest: null });
  const closed = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: stale }), "no usable overlay");
  assert(closed.includes("could not load the site's current authoritative data") && closed.includes("manifest-missing") && closed.includes("fails closed"), `message: ${closed}`);
  s.objects.delete(CURRENT_KEY);
  const gone = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: stale }), "no overlay pointer");
  assert(gone.includes("could not load the site's current authoritative data") && gone.includes(`${CURRENT_KEY} does not exist`), `message: ${gone}`);
  eq([stale.calls, s.writes.length - w, Buffer.compare(pointerBytes(s), liveShell)], [0, 0, 0], "checkout never asked, zero writes, pointer byte-identical");

  // every record of the ordinary build is published → rolled back, even though the checkout's loader knows none of them (an @2 checkout)
  const o = publishOverlay(s, { manifest: projectsOf([...ORDINARY_IDS, "bi-extra"]) });
  const truth = await publishedPortfolioTruth(s, SHELL_SITE, HOST);
  eq([...truth.authoritativeIds].sort(), [...ORDINARY_IDS, "bi-extra"].sort(), "published ids = manifest.projects");
  assert(truth.source.includes(CURRENT_KEY) && truth.source.includes(`revision ${o.revision}`), `source: ${truth.source}`);
  const empty = truthLoader([]);
  const back = await rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: empty });
  eq([back.pointer.packageHash, back.pointer.previous?.packageHash, s.writes.slice(w), empty.calls], [ORDINARY_REF.packageHash, HASH, [shellPlan.routingKey], 0], "rolled back on the store's truth");

  // the host now serves the ORDINARY package: nothing changed for it — the caller's loader decides, as before
  assert((await refusal(publishedPortfolioTruth(s, SHELL_SITE, HOST), "live ordinary")).includes("has no overlay recon-runtime would use"), "an ordinary live package has no published set");
  assert((await refusal(publishedPortfolioTruth(s, "another-site", HOST), "other site")).includes(`names site "${SHELL_SITE}"`), "another site's pointer");
  assert((await refusal(publishedPortfolioTruth(new MemoryStore(), SHELL_SITE, HOST), "no pointer")).includes("does not exist"), "no pointer");
  // second ordinary package as the rollback target of an ordinary live host: previous := the ordinary build itself under another hash is not available, so re-use it via a pointer whose previous is the same ordinary ref
  const ptr = JSON.parse(text(s, shellPlan.routingKey));
  s.objects.set(shellPlan.routingKey, { body: enc({ ...ptr, previous: ORDINARY_REF }), meta: JSON_META });
  const refusedByCheckout = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: empty }), "ordinary live, empty checkout truth");
  assert(refusedByCheckout.startsWith(ROLLBACK_TRUTH_REFUSAL) && refusedByCheckout.includes("checkout projects.json") && empty.calls === 1, `ordinary live host → the caller's loader: ${refusedByCheckout}`);
  assert((await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0 }), "ordinary live, no loader")).includes("no authoritative site data was supplied"), "ordinary live host, no loader → refused as before");
  const ok = truthLoader(ORDINARY_IDS);
  const again = await rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: ok });
  eq([again.pointer.packageHash, ok.calls], [ORDINARY_REF.packageHash, 1], "ordinary live host, truthful loader → rolled back as before");
});

await check("S10 incremental-host guard: a host that serves a SHELL package (per its seal in the store) cannot be pointed at an ordinary build by a forward publish — here from a checkout that has no @2 marker and whose current build is ordinary: refused, zero writes, pointer byte-identical, the dry run with checkStore says the same; leaveIncremental is the only way through; shell → shell and ordinary → ordinary are untouched", async () => {
  const s = await liveOnShell(ORDINARY_IDS);
  const liveShell = pointerBytes(s);
  const w = s.writes.length;
  const INCREMENTAL = /is published incrementally from BoostChat: the package it serves now \(7ef062643a5e5889…, [^)]+\) is a portfolio shell package, and [0-9a-f]{16}… is an ordinary build\. .*re-expose statically built portfolio pages.*strand BoostChat's publishing.*routing pointer NOT written.*--rollback.*--leave-incremental/s;
  const message = await refusal(publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 }), "ordinary over shell");
  assert(INCREMENTAL.test(message) && message.includes(HOST), `message: ${message}`);
  // no other option implies the override
  for (const [label, extra] of [
    ["allowSiteChange", { allowSiteChange: true }],
    ["expectLivePackageHash", { expectLivePackageHash: HASH }],
    ["expectPackageHash + reverify", { expectPackageHash: ordinaryBuildPlan.packageHash, reverify: true }],
  ] as const) {
    assert(INCREMENTAL.test(await refusal(publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, ...extra }), label)), `${label} does not imply the override`);
  }
  assert(INCREMENTAL.test(await refusal(publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, dryRun: true, checkStore: true }), "dry run")), "dry run + checkStore raises the same refusal");
  // an ordinary package of ANOTHER site, with allowSiteChange: the host still leaves incremental publishing → refused
  await publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: "elsewhere.test.example", store: s, now: T0, activate: false });
  const w2 = s.writes.length;
  assert(INCREMENTAL.test(await refusal(publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST, store: s, now: T0, allowSiteChange: true }), "another site's ordinary package")), "another site's ordinary package is refused too");
  eq([w2 - w > 0, s.writes.length - w2, Buffer.compare(pointerBytes(s), liveShell)], [true, 0, 0], "zero writes by the refusals, pointer byte-identical");
  // republishing the shell package itself (shell → the same shell) is not a switch
  const same = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });
  assert(same.status === "published" && same.pointerWrite === "unchanged", "shell → same shell: unchanged");

  // the deliberate override
  const dry = await publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, dryRun: true, checkStore: true, leaveIncremental: true });
  assert(dry.status === "dry-run" && dry.storeCheck?.pointerAction === "write", "dry run with the override plans the write");
  const left = await publishSite({ repoRoot: ordinaryRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, leaveIncremental: true });
  assert(left.status === "published" && left.pointerWrite === "written", "published with leaveIncremental");
  eq([left.pointer.packageHash, left.pointer.previous?.packageHash, s.writes.slice(w2)], [ORDINARY_REF.packageHash, HASH, [shellPlan.routingKey]], "pointer → the ordinary build, previous = the shell package");
  // the host is ordinary now: an ordinary → ordinary publish needs no flag (nothing changed for such hosts)
  const o2 = new MemoryStore();
  await publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST, store: o2, now: T0 });
  const re = await publishSite({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST, store: o2, now: T0 });
  assert(re.status === "published" && re.pointerWrite === "unchanged", "ordinary host: as before");
});

await check("S8 serving a shell package: WITHOUT an overlay only /_next/** is served (byte for byte, stored headers) and every other path is 503 no-store — never a shell page; WITH one, every addressable file outside the overlay's URL space is served byte for byte; /_runtime/** is a 404 (the package's 404 page) either way", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  s.objects.set(shellPlan.routingKey, { body: enc({ schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: HASH, buildInputId: shellPlan.buildInputId, releaseId: shellPlan.releaseId, publishedAt: T0().toISOString() }), meta: JSON_META });
  const env: Env = { SITES: bucketOf(s) };
  const notFound = shellPlan.files.find((f) => f.path === "404.html")!;
  const runtimeFiles = shellPlan.files.filter((f) => f.path.startsWith("_runtime/"));
  eq(runtimeFiles.map((f) => f.path).sort(), [RUNTIME_FILE, SHELL_FILE], `${RUNTIME_DIR} holds the two documents`);
  const addressable = shellPlan.files.filter((f) => f.path !== "404.html" && f.path !== "_not-found.html");
  const urlOf = (rel: string) => (rel === "index.html" ? "/" : `/${rel.endsWith(".html") ? rel.slice(0, -5) : rel}`);
  const fetchFile = async (rel: string) => {
    const r = await handle(new Request(`https://${HOST}${urlOf(rel)}`), env);
    const body = new Uint8Array(await r.arrayBuffer());
    return { r, body, got: [r.status, r.headers.get("content-type"), r.headers.get("cache-control"), body.length, sha256(body)] };
  };
  const asStored = (f: (typeof addressable)[number]) => [200, f.contentType, f.cacheControl, f.size, f.sha256];
  const CLOSED = [503, "text/plain; charset=utf-8", "no-store", "content unavailable\n".length, sha256("content unavailable\n")];

  // nothing published for the package: the hostname is closed, the build output is not
  const counts = { next: 0, closed: 0 };
  for (const f of addressable) {
    const { r, body, got } = await fetchFile(f.path);
    if (f.path.startsWith("_runtime/")) eq([r.status, r.headers.get("cache-control"), sha256(body)], [404, "no-store", notFound.sha256], `${urlOf(f.path)} is never served`);
    else if (f.path.startsWith("_next/")) {
      eq(got, asStored(f), `${urlOf(f.path)} (no overlay)`);
      counts.next++;
    } else {
      eq(got, CLOSED, `${urlOf(f.path)} (no overlay)`);
      counts.closed++;
    }
  }
  assert(counts.next > 0 && counts.closed > 0, `nothing compared: ${JSON.stringify(counts)}`);
  eq(counts.next + counts.closed, addressable.length - runtimeFiles.length, "every addressable file was judged");

  // the portfolio is published: the package answers everything the overlay does not own
  const overlay = publishOverlay(s);
  const owned = (url: string) => {
    const isRsc = (page: string) => url === (page === "/" ? "/index.txt" : `${page}.txt`) || (url.startsWith(page === "/" ? "/__next." : `${page}/__next.`) && url.endsWith(".txt") && !url.slice((page === "/" ? "/" : `${page}/`).length).includes("/"));
    return ["/", "/sitemap.xml"].some((p) => url === p || isRsc(p)) || url === "/portfolio" || url.startsWith("/portfolio/") || isRsc("/portfolio");
  };
  let served = 0;
  for (const f of addressable) {
    const url = urlOf(f.path);
    const { r, body, got } = await fetchFile(f.path);
    if (f.path.startsWith("_runtime/")) eq([r.status, sha256(body)], [404, notFound.sha256], `${url} with a live overlay`);
    else if (url === "/") eq([r.status, sha256(body)], [200, sha256(overlay.home)], "/ is the composed page");
    else if (owned(url)) eq([r.status, sha256(body)], [404, notFound.sha256], `${url} is the overlay's and was not rendered: never the shell's file`);
    else {
      eq(got, asStored(f), `${url} (live overlay)`);
      served++;
    }
  }
  assert(served > counts.next, `only ${served} package files served under a live overlay`);
});

await check("S9 CLI: the offline --dry-run of the shell site exits 0, names the overlay pointer the activation needs and says it was not checked; nothing about it for an ordinary site", () => {
  const run = (site: string) =>
    spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), ["--tsconfig", "platform/tsconfig.json", path.join(repoRoot, "platform/cli/site-publish.ts"), "--site", site, "--host", HOST, "--dry-run"], { cwd: repoRoot, encoding: "utf8" });
  const shell = run(SHELL_SITE);
  eq(shell.status, 0, `exit (${shell.stderr.slice(0, 300)})`);
  assert(shell.stdout.includes("SHELL PACKAGE") && shell.stdout.includes(CURRENT_KEY) && shell.stdout.includes("not checked"), "the dry run names the guard");
  assert(/"portfolioShell": \{/.test(shell.stdout), "summary carries portfolioShell");
  const ordinary = run(ORDINARY_SITE);
  eq(ordinary.status, 0, "ordinary exit");
  assert(!ordinary.stdout.includes("SHELL PACKAGE") && !ordinary.stdout.includes("portfolioShell"), "nothing for an ordinary site");
  // --leave-incremental: accepted by a dry run, in the usage text, and refused next to the flags that write no pointer / have their own way back
  const cli = (...flags: string[]) => spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), ["--tsconfig", "platform/tsconfig.json", path.join(repoRoot, "platform/cli/site-publish.ts"), "--site", ORDINARY_SITE, "--host", HOST, ...flags], { cwd: repoRoot, encoding: "utf8" });
  eq(cli("--dry-run", "--leave-incremental").status, 0, "--dry-run --leave-incremental");
  const noActivate = cli("--no-activate", "--leave-incremental");
  assert(noActivate.status === 2 && noActivate.stderr.includes("--leave-incremental overrides a refusal of the pointer write") && noActivate.stderr.includes("[--leave-incremental]"), `--no-activate --leave-incremental: ${noActivate.status} ${noActivate.stderr.slice(0, 200)}`);
  const rollback = cli("--rollback", "--leave-incremental");
  assert(rollback.status === 2 && rollback.stderr.includes("--rollback only combines with"), `--rollback --leave-incremental: ${rollback.status}`);
});

// ── the managed publish flow: ONE command (upload → announce → wait → guarded switch) ────────────
/** every directory this section creates */
const tmpDirs: string[] = [];
async function tmpDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `recon-managed-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
/** THE INVARIANT, checked on every routing write of this section: a pointer to a shell package is written only while the store holds a usable overlay for it */
const invariant = { shellPointerWrites: 0, violations: [] as string[] };
function watched(inner: DirectoryStore, label: string, intercept?: (key: string) => Uint8Array | null | undefined): ObjectStore & { gets: string[] } {
  const gets: string[] = [];
  return {
    description: inner.description,
    gets,
    async get(key) {
      gets.push(key);
      const forced = intercept?.(key);
      return forced === undefined ? inner.get(key) : forced;
    },
    async put(key, body, meta) {
      if (key.startsWith("routing/")) {
        const pointer = JSON.parse(Buffer.from(body).toString("utf8")) as { siteId: string; packageHash: string };
        const seal = await inner.get(sealKey(pointer.siteId, pointer.packageHash));
        if (!seal) invariant.violations.push(`${label}: routing → an unsealed package`);
        else if (isShellPackage((JSON.parse(Buffer.from(seal).toString("utf8")) as { files: unknown[] }).files)) {
          invariant.shellPointerWrites++;
          const state = await portfolioOverlayState(inner, pointer.siteId, pointer.packageHash);
          if (state.state !== "live") invariant.violations.push(`${label}: routing → shell package ${pointer.packageHash.slice(0, 12)} while its overlay is ${state.state}`);
        }
      }
      return inner.put(key, body, meta);
    },
  };
}
/** a fresh directory standing in for the bucket */
async function bucket(label: string, intercept?: (key: string) => Uint8Array | null | undefined) {
  const dir = await tmpDir(label);
  const store = new DirectoryStore(dir);
  return { dir, store, w: watched(store, label, intercept) };
}
const routingPuts = (s: DirectoryStore) => s.writes.filter((k) => k.startsWith("routing/"));
const onDisk = async (dir: string, key: string) => readFile(path.join(dir, key)).catch(() => null);
/** What BoostChat's publisher writes for the package, through the store: page → manifest → pointer LAST. */
async function boostchatPublishes(store: ObjectStore, edit: { manifest?: (m: Record<string, any>) => void } = {}): Promise<number> {
  const revision = ++revisionCounter;
  const home = enc(`COMPOSED home r${revision}`);
  const homeKey = `blobs/${sha256(home)}.html`;
  await store.put(portfolioPublicKey(SHELL_SITE, homeKey), home, { contentType: "text/html; charset=utf-8", cacheControl: "no-store" });
  const manifest: Record<string, any> = {
    schema: "portfolio-manifest@1",
    siteId: SHELL_SITE,
    revision,
    shell: { packageHash: HASH, releaseId: shellPlan.releaseId },
    owned: { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
    routes: { "/": { key: homeKey, sha256: sha256(home), size: home.length, contentType: "text/html; charset=utf-8" } },
    assets: {},
    projects: {},
  };
  edit.manifest?.(manifest);
  const manifestBytes = enc(manifest);
  const manifestKey = `revisions/${revision}/${sha256(manifestBytes).slice(0, 16)}.json`;
  await store.put(portfolioPublicKey(SHELL_SITE, manifestKey), manifestBytes, JSON_META);
  await store.put(CURRENT_KEY, enc({ schema: "portfolio-current@1", siteId: SHELL_SITE, shellPackageHash: HASH, revision, manifestKey, manifestSha256: sha256(manifestBytes), publishedAt: "2026-10-10T00:00:00.000Z" }), JSON_META);
  return revision;
}
/** BoostChat as the flow sees it: one fixed answer (or error) per announce, every call recorded */
function fakeBoostChat(answer: AnnounceState | AnnounceError): ShellPackageAnnouncer & { calls: { siteId: string; packageHash: string }[] } {
  const calls: { siteId: string; packageHash: string }[] = [];
  return {
    description: "BoostChat https://boostchat.test.example",
    calls,
    async announce(input) {
      calls.push(input);
      if (answer instanceof AnnounceError) throw answer;
      return { ok: true, siteId: input.siteId, packageHash: input.packageHash, state: answer, publishMode: answer === "mode_v1" ? "v1" : "v2", searchSource: "canonical", desiredRevision: 7, liveRevision: answer === "already_published" ? 7 : 6 };
    },
  };
}
/** a clock that only moves when the flow sleeps; `onSleep(n)` runs after the n-th sleep (BoostChat doing its work meanwhile) */
function fakeTime(onSleep?: (n: number) => unknown | Promise<unknown>) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    clock: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
      await onSleep?.(sleeps.length);
    },
  };
}
const on = (announcer: ShellPackageAnnouncer): AnnounceSetup => ({ mode: "on", create: () => announcer });
const NEVER: AnnounceSetup = {
  mode: "on",
  create: () => {
    throw new Error("the announcer must not be constructed");
  },
};
const managedBase = { repoRoot, siteId: SHELL_SITE, hostname: HOST, now: T0 };
const packageWrites = shellPlan.files.length + 1;

console.log("\nmanaged publish flow (directory store, fake BoostChat, fake clock — no network)");

await check("M1 queued → BoostChat publishes while the flow waits → activated: one announce naming the site and the package; the store is looked at every 3 s; the routing pointer is the LAST write, after BoostChat's pointer; exit 0", async () => {
  const b = await bucket("m1");
  const bc = fakeBoostChat("queued");
  const time = fakeTime(async (n) => void (n === 2 && (await boostchatPublishes(b.store))));
  const log: string[] = [];
  const r = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock, log: (l) => log.push(l) });
  assert(r.status === "published" && r.result.pointerWrite === "written", `result ${r.status}`);
  eq([r.result.upload, r.result.uploaded, r.result.verified], ["uploaded", shellPlan.files.length, shellPlan.files.length], "the result reports the upload of this run");
  eq(bc.calls, [{ siteId: SHELL_SITE, packageHash: HASH }], "announce");
  eq([time.sleeps, r.managed?.polls, r.managed?.waitedMs, r.managed?.announcement?.state, r.managed?.overlay?.state], [[3000, 3000], 3, 6000, "queued", "live"], "wait");
  eq([b.store.writes.length, b.store.writes[packageWrites - 1], b.store.writes[b.store.writes.length - 2], b.store.writes[b.store.writes.length - 1]], [packageWrites + 3 + 1, shellPlan.sealKey, CURRENT_KEY, shellPlan.routingKey], "order: package, seal · BoostChat's overlay (its pointer last) · routing pointer last");
  eq([routingPuts(b.store).length, JSON.parse((await onDisk(b.dir, shellPlan.routingKey))!.toString("utf8")).packageHash, managedExitCode(r)], [1, HASH, 0], "pointer");
  assert(log.some((l) => l.includes("announced shell package") && l.includes("→ queued")) && log.some((l) => l.includes("waiting for BoostChat")) && log.some((l) => l.includes("BoostChat published the portfolio")), `log: ${log.join(" | ")}`);
  // announced before the first look at the overlay, and after the seal
  eq(b.w.gets.filter((k) => k === CURRENT_KEY).length, 3 + 1, "overlay pointer reads: three looks + the guard of the write");
});

await check("M2 queued → BoostChat never publishes → TIMEOUT: stopped (exit 5), no routing write, an existing pointer byte-identical; the message says BoostChat has not published yet and that running again is safe; a refused overlay is not 'published' either; the SAME command run again later uploads nothing and activates", async () => {
  const b = await bucket("m2");
  // the host already serves an earlier (sealed) package of the site
  const prior = { schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: "a".repeat(64), buildInputId: "b".repeat(64), releaseId: "interior-02-0.0.0-prior", publishedAt: "2026-10-01T00:00:00.000Z" };
  const priorBytes = enc(`${JSON.stringify(prior, null, 2)}\n`);
  await b.store.put(shellPlan.routingKey, priorBytes, JSON_META);
  await b.store.put(sealKey(SHELL_SITE, prior.packageHash), enc({ ...shellPlan.seal, packageHash: prior.packageHash, files: [] }), JSON_META);
  const seeded = b.store.writes.length;

  const bc = fakeBoostChat("queued");
  const time = fakeTime();
  const r = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), waitSeconds: 7, sleep: time.sleep, clock: time.clock });
  assert(r.status === "stopped" && r.stop === "timeout", `result ${r.status}`);
  eq([time.sleeps, r.managed.polls, managedExitCode(r), r.result.status], [[3000, 3000, 1000], 4, 5, "uploaded"], "waited exactly --wait-seconds, then stopped");
  assert(/BoostChat has not published the portfolio of "boost-interior-demo-02" for package 7ef062643a5e5889… yet: after 7 s/.test(r.message) && r.message.includes(`${CURRENT_KEY} is absent`) && r.message.includes("running this same command again is safe") && r.message.includes("routing pointer was NOT written"), `message: ${r.message}`);
  eq([b.store.writes.length - seeded, routingPuts(b.store).length, Buffer.compare(Buffer.from((await onDisk(b.dir, shellPlan.routingKey))!), Buffer.from(priorBytes)), b.w.gets.filter((k) => k.startsWith("routing/"))], [packageWrites, 1, 0, []], "only the package was written; the pointer was not even read");

  // an overlay recon-runtime would refuse appears: still not published
  await boostchatPublishes(b.store, { manifest: (m) => (m.siteId = "another-site") });
  const again = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), waitSeconds: 3, ...fakeTime() });
  assert(again.status === "stopped" && again.stop === "timeout" && again.message.includes("refused by recon-runtime (manifest-identity)"), `a refused overlay: ${again.status} ${"message" in again ? again.message : ""}`);
  eq([again.result.upload, routingPuts(b.store).length], ["skipped-sealed", 1], "second run: nothing uploaded, nothing switched");

  // BoostChat has published by the time the operator runs the same command again
  await boostchatPublishes(b.store);
  const w = b.store.writes.length;
  const third = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), ...fakeTime() });
  assert(third.status === "published" && third.result.pointerWrite === "written" && third.result.upload === "skipped-sealed", `third run ${third.status}`);
  eq([b.store.writes.slice(w), third.result.pointer.previous?.packageHash, bc.calls.length, third.managed?.polls], [[shellPlan.routingKey], prior.packageHash, 3, 1], "the one write of the re-run is the pointer; announced on every run; live at the first look");
});

await check("M3 already_published → no wait, straight to the guard — which still decides: with the overlay in the store the host is switched; without it (BoostChat's word alone) the write is REFUSED by the same shell-package guard, nothing switched", async () => {
  const b = await bucket("m3");
  const bc = fakeBoostChat("already_published");
  const time = fakeTime();
  const refused = await refusal(publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock }), "already_published, no overlay in the store");
  assert(REFUSAL.test(refused) && refused.includes(`${CURRENT_KEY} does not exist`) && refused.includes("routing pointer NOT written"), `message: ${refused}`);
  eq([time.sleeps, routingPuts(b.store), await onDisk(b.dir, shellPlan.routingKey)], [[], [], null], "no wait, no pointer");
  await boostchatPublishes(b.store);
  const r = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock });
  assert(r.status === "published" && r.result.pointerWrite === "written", `result ${r.status}`);
  eq([time.sleeps, r.managed?.polls, r.managed?.waitedMs, b.store.writes[b.store.writes.length - 1], bc.calls.length], [[], 0, 0, shellPlan.routingKey, 2], "activated without waiting");
  // a host that already serves the package: announce, nothing to switch
  const same = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock });
  assert(same.status === "published" && same.result.pointerWrite === "unchanged", "unchanged pointer");
  eq(routingPuts(b.store).length, 1, "one routing write in all");
});

await check("M4 mode_v1 → stopped WITHOUT activating (exit 4), even when a usable overlay is in the store: the message says BoostChat still has the site in V1 mode, to switch it and to run the same command again", async () => {
  const b = await bucket("m4");
  await boostchatPublishes(b.store); // an overlay left from an earlier V2 period: the guard alone would pass
  const bc = fakeBoostChat("mode_v1");
  const time = fakeTime();
  const r = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock });
  assert(r.status === "stopped" && r.stop === "mode_v1", `result ${r.status}`);
  assert(/BoostChat still has site "boost-interior-demo-02" in V1 mode .*Switch the site to V2 in BoostChat, then run this same command again/.test(r.message) && r.message.includes("routing pointer was NOT written"), `message: ${r.message}`);
  eq([managedExitCode(r), time.sleeps, routingPuts(b.store), await onDisk(b.dir, shellPlan.routingKey), b.w.gets.filter((k) => k.startsWith("routing/")), (await onDisk(b.dir, shellPlan.sealKey)) !== null], [4, [], [], null, [], true], "non-zero, no wait, no pointer read or written, package sealed");
  // --no-activate does not turn it into a success
  const na = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), activate: false });
  eq([na.status, managedExitCode(na)], ["stopped", 4], "mode_v1 with activate: false");
});

await check("M5 the announce is refused or unanswered → stopped with the reason (exit 3), nothing switched: 404 site_not_found says the site is not linked to a BoostChat tenant and to link it (portfolio adoption); 409 package_not_v2; 401 / 403; 5xx; no answer", async () => {
  const b = await bucket("m5");
  await boostchatPublishes(b.store); // even with a usable overlay: a run that could not announce does not switch
  const CASES: [AnnounceError, string, RegExp][] = [
    [new AnnounceError("announce answered HTTP 404 site_not_found", "site_not_found", 404), "site_not_found", /is not linked to a BoostChat tenant yet .*404 site_not_found.*Link it in BoostChat \(portfolio adoption\), then run this same command again/],
    [new AnnounceError("announce answered HTTP 409 package_not_v2", "package_not_v2", 409), "package_not_v2", /does not accept package 7ef062643a5e5889… .*409 package_not_v2/],
    [new AnnounceError("announce answered HTTP 401 — check BOOSTCHAT_PUBLISHER_TOKEN", "unauthorized", 401), "announce_failed", /BoostChat was not told about package .*HTTP 401 — check BOOSTCHAT_PUBLISHER_TOKEN/],
    [new AnnounceError("announce answered HTTP 403 — check BOOSTCHAT_PUBLISHER_TOKEN", "unauthorized", 403), "announce_failed", /HTTP 403/],
    [new AnnounceError("announce answered HTTP 503 store_unavailable", "unavailable", 503), "announce_failed", /HTTP 503 store_unavailable/],
    [new AnnounceError("announce got no answer: fetch failed", "network"), "announce_failed", /got no answer: fetch failed/],
    [new AnnounceError("announce answered HTTP 400 invalid_request", "invalid_request", 400), "announce_failed", /HTTP 400 invalid_request/],
  ];
  for (const [error, stop, message] of CASES) {
    const time = fakeTime();
    const r = await publishManaged({ ...managedBase, store: b.w, announce: on(fakeBoostChat(error)), sleep: time.sleep, clock: time.clock });
    assert(r.status === "stopped" && r.stop === stop, `${error.code}: ${r.status} ${"stop" in r ? r.stop : ""}`);
    assert(message.test(r.message) && r.message.includes("routing pointer was NOT written"), `${error.code}: message: ${r.message}`);
    eq([managedExitCode(r), time.sleeps, routingPuts(b.store), b.w.gets.filter((k) => k.startsWith("routing/") || k.startsWith("portfolio-public/"))], [3, [], [], []], `${error.code}: exit 3, no wait, neither the pointer nor the overlay was looked at`);
  }
  eq([b.store.writes.length, await onDisk(b.dir, shellPlan.routingKey)], [3 + packageWrites, null], "the package was uploaded once; no pointer");
  // an unusable configuration is judged before anything is uploaded
  const fresh = await bucket("m5-config");
  let thrown: unknown;
  await publishManaged({ ...managedBase, store: fresh.w, announce: { mode: "on", create: () => createBoostChatAnnouncer({ baseUrl: "http://boostchat.test.example", token: "t" }) } }).catch((e) => (thrown = e));
  assert(thrown instanceof AnnounceError && thrown.code === "config" && thrown.message.includes("must be https"), `config: ${String(thrown)}`);
  eq(fresh.store.writes, [], "config error: zero writes");
});

await check("M6 no BoostChat configuration (or --no-announce) → exactly today's behaviour plus ONE line that says what is missing: uploaded, activated only if the guard already passes (refused otherwise, with the guard's own message); activate:false reads neither the overlay nor the pointer", async () => {
  const b = await bucket("m6");
  const why = "BOOSTCHAT_BASE_URL and BOOSTCHAT_PUBLISHER_TOKEN are not set";
  const log: string[] = [];
  const refused = await refusal(publishManaged({ ...managedBase, store: b.w, announce: { mode: "off", why }, log: (l) => log.push(l) }), "no env, no overlay");
  assert(REFUSAL.test(refused), `today's refusal: ${refused}`);
  eq([log.filter((l) => l.includes("NOT ANNOUNCED")).length, log.some((l) => l.includes(`NOT ANNOUNCED to BoostChat — ${why}`)), b.store.writes.length, routingPuts(b.store)], [1, true, packageWrites, []], "one line, package uploaded, no pointer");
  const before = b.w.gets.length;
  const up = await publishManaged({ ...managedBase, store: b.w, announce: { mode: "off", why: "--no-announce" }, activate: false });
  eq([up.status, up.managed, b.w.gets.slice(before).filter((k) => k.startsWith("routing/") || k.startsWith("portfolio-public/"))], ["uploaded", undefined, []], "activate:false, no announce");
  await boostchatPublishes(b.store);
  const r = await publishManaged({ ...managedBase, store: b.w, announce: { mode: "off", why } });
  assert(r.status === "published" && r.result.pointerWrite === "written" && r.managed === undefined, `published by the guard alone: ${r.status}`);
  eq(managedExitCode(r), 0, "exit");
});

await check("M7 --no-activate with BoostChat configured = upload + announce, then stop (exit 0) with BoostChat's answer and what the store holds: no wait, the routing pointer neither read nor written; a later run without it activates", async () => {
  const b = await bucket("m7");
  const bc = fakeBoostChat("queued");
  const time = fakeTime();
  const log: string[] = [];
  const r = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), activate: false, sleep: time.sleep, clock: time.clock, log: (l) => log.push(l) });
  assert(r.status === "uploaded", `result ${r.status}`);
  eq([managedExitCode(r), bc.calls.length, time.sleeps, r.managed?.announcement?.state, r.managed?.overlay, b.w.gets.filter((k) => k.startsWith("routing/")), routingPuts(b.store)], [0, 1, [], "queued", { state: "absent", key: CURRENT_KEY }, [], []], "uploaded + announced, state reported");
  assert(log.some((l) => l.includes("activate: false → stopping after the announce. BoostChat: queued") && l.includes("absent")), `the state is printed: ${log.join(" | ")}`);
  await boostchatPublishes(b.store);
  const done = await publishManaged({ ...managedBase, store: b.w, announce: on(bc), sleep: time.sleep, clock: time.clock });
  assert(done.status === "published" && done.result.upload === "skipped-sealed" && done.result.pointerWrite === "written", `later run: ${done.status}`);
});

await check("M8 an ORDINARY package: no announce — the announcer is not even constructed — and the run is the one publishSite call it always was (pointer written last, no overlay key read)", async () => {
  const b = await bucket("m8");
  const r = await publishManaged({ repoRoot, siteId: ORDINARY_SITE, hostname: HOST, now: T0, store: b.w, announce: NEVER });
  assert(r.status === "published" && r.result.pointerWrite === "written" && r.managed === undefined, `result ${r.status}`);
  eq([b.store.writes.length, b.store.writes[b.store.writes.length - 1], b.w.gets.filter((k) => k.startsWith("portfolio-public/"))], [ordinaryPlan.files.length + 2, ordinaryPlan.routingKey, []], "files + seal + pointer; no overlay read");
  const up = await publishManaged({ repoRoot, siteId: ORDINARY_SITE, hostname: "other.test.example", now: T0, store: b.w, announce: NEVER, activate: false });
  eq([up.status, up.managed], ["uploaded", undefined], "activate:false");
});

await check("M9 the wait is a readiness probe, not the guard: an overlay that is there when the flow looks and GONE when the pointer would be written is refused by publishSite's own guard; a stale --expect-live is refused before the upload and before any announce", async () => {
  let pointerReads = 0;
  // the overlay pointer exists for the first read only
  const b = await bucket("m9", (key) => (key === CURRENT_KEY && ++pointerReads > 1 ? null : undefined));
  await boostchatPublishes(b.store);
  const bc = fakeBoostChat("queued");
  const message = await refusal(publishManaged({ ...managedBase, store: b.w, announce: on(bc), ...fakeTime() }), "overlay gone at the write");
  assert(REFUSAL.test(message) && message.includes(`${CURRENT_KEY} does not exist`), `message: ${message}`);
  eq([pointerReads, routingPuts(b.store), await onDisk(b.dir, shellPlan.routingKey)], [2, [], null], "the flow saw it live, the guard did not: no pointer");

  const c = await bucket("m9-stale");
  const bc2 = fakeBoostChat("queued");
  const stale = await refusal(publishManaged({ ...managedBase, store: c.w, announce: on(bc2), expectLivePackageHash: "e".repeat(64), ...fakeTime() }), "stale expect-live");
  assert(stale.includes("stale-write guard"), `message: ${stale}`);
  eq([c.store.writes, bc2.calls], [[], []], "nothing uploaded, nothing announced");
});

await check("M10 the BoostChat announcer (fake fetch): POST {base}/api/publisher/sites/<siteId>/shell-package with the publisher's Bearer header and {packageHash}; the three 200 states; every refusal mapped; an answer for another package is not trusted; https only (http for loopback); the token is in no message", async () => {
  const TOKEN = "tok-SECRET-never-printed";
  const seen: { url: string; init: RequestInit }[] = [];
  const answering = (status: number, body: unknown) =>
    (async (url: unknown, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  const ok = (state: string, extra: Record<string, unknown> = {}) => ({ ok: true, siteId: SHELL_SITE, packageHash: HASH, publishMode: "v2", searchSource: "canonical", desiredRevision: 3, liveRevision: 2, state, ...extra });
  const announcer = (f: typeof fetch, baseUrl = "https://boostchat.test.example") => createBoostChatAnnouncer({ baseUrl, token: TOKEN, fetch: f });
  const input = { siteId: SHELL_SITE, packageHash: HASH };

  const a = announcer(answering(200, ok("queued")));
  eq(a.description, "BoostChat https://boostchat.test.example", "description");
  const got = await a.announce(input);
  eq([got.state, got.desiredRevision, got.liveRevision, got.publishMode], ["queued", 3, 2, "v2"], "200 queued");
  const call = seen[0]!;
  const headers = call.init.headers as Record<string, string>;
  eq([call.url, call.init.method, headers.authorization, headers["content-type"], call.init.body, call.init.redirect], [`https://boostchat.test.example/api/publisher/sites/${SHELL_SITE}/shell-package`, "POST", `Bearer ${TOKEN}`, "application/json", JSON.stringify({ packageHash: HASH }), "error"], "the request (contract)");
  eq(shellPackagePath(SHELL_SITE), `/api/publisher/sites/${SHELL_SITE}/shell-package`, "path");
  for (const state of ["already_published", "mode_v1"]) eq((await announcer(answering(200, ok(state))).announce(input)).state, state, `200 ${state}`);
  eq((await announcer(answering(200, ok("queued", { desiredRevision: null, liveRevision: null, searchSource: undefined }))).announce(input)).state, "queued", "advisory fields are read leniently");

  const messages: string[] = [];
  const failing = async (f: typeof fetch, label: string): Promise<AnnounceError> => {
    try {
      await announcer(f).announce(input);
    } catch (e) {
      assert(e instanceof AnnounceError, `${label}: not an AnnounceError: ${String(e)}`);
      messages.push(e.message);
      return e;
    }
    throw new Error(`${label}: expected a rejection`);
  };
  const MAPPED: [number, unknown, string][] = [
    [404, { error: "site_not_found" }, "site_not_found"],
    [409, { error: "package_not_v2" }, "package_not_v2"],
    [400, { error: "invalid_request" }, "invalid_request"],
    [401, { error: "unauthorized" }, "unauthorized"],
    [403, {}, "unauthorized"],
    [503, { error: "store_unavailable" }, "unavailable"],
    [503, { error: "publisher_not_configured" }, "unavailable"],
    [500, "<html>oops</html>", "unavailable"],
    [404, "not json", "http"],
    [409, { error: "stale_revision" }, "http"],
    [200, ok("published"), "protocol"],
    [200, ok("queued", { packageHash: "c".repeat(64) }), "protocol"],
    [200, ok("queued", { siteId: "another-site" }), "protocol"],
    [200, { ...ok("queued"), ok: false }, "protocol"],
    [200, "not json", "protocol"],
  ];
  for (const [status, body, code] of MAPPED) {
    const e = await failing(answering(status, body), `${status} ${JSON.stringify(body)}`);
    eq([e.code, e.status], [code, status], `${status} ${JSON.stringify(body)}`);
  }
  const network = await failing((async () => {
    throw new TypeError(`fetch failed (authorization: Bearer ${"x".repeat(4)})`);
  }) as typeof fetch, "network");
  eq([network.code, network.status], ["network", undefined], "no answer");
  assert(messages.length === MAPPED.length + 1 && messages.every((m) => !m.includes(TOKEN)) && messages.some((m) => m.includes("HTTP 409 package_not_v2")), "no message carries the token; the code is named");

  const config = (baseUrl: string, token = TOKEN) => {
    try {
      createBoostChatAnnouncer({ baseUrl, token });
    } catch (e) {
      assert(e instanceof AnnounceError && e.code === "config" && !e.message.includes(TOKEN), `config error: ${String(e)}`);
      return e.message;
    }
    return "accepted";
  };
  assert(config("http://boostchat.test.example").includes("must be https"), "plain http is refused for a real host");
  assert(config("https://boostchat.test.example/api").includes("must be an origin"), "a path is refused");
  assert(config("not a url").includes("is not a URL") && config("https://boostchat.test.example", "").includes("BOOSTCHAT_PUBLISHER_TOKEN"), "not a URL / no token");
  eq([config("http://localhost:3000"), config("http://127.0.0.1:3000"), config("https://boostchat.test.example/")], ["accepted", "accepted", "accepted"], "loopback http and https are accepted — the V1 publisher client's rule");
});

console.log("\na new managed site is V2 (marker), V1 only by name");

/** a repository-root-shaped throwaway directory with one site's site.json and the real release store */
async function markerRoot(label: string, sourceSite: string, editSite?: (site: Record<string, any>) => void): Promise<{ root: string; markerFile: string }> {
  const root = await tmpDir(label);
  const dir = path.join(root, "data/sites", sourceSite);
  await mkdir(dir, { recursive: true });
  const site = JSON.parse(await readFile(path.join(repoRoot, "data/sites", sourceSite, "site.json"), "utf8")) as Record<string, any>;
  editSite?.(site);
  await writeFile(path.join(dir, "site.json"), JSON.stringify(site, null, 2));
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  return { root, markerFile: path.join(dir, SOURCE_MARKER_FILE) };
}
async function markerRefusal(p: Promise<unknown>, label: string): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert(e instanceof ManagedPortfolioError, `${label}: not a ManagedPortfolioError: ${(e as Error).message}`);
    return e.message;
  }
  throw new Error(`${label}: expected a refusal`);
}
const UNSUPPORTED_SITE = "boost-interior-demo-03";
const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
const cliIn = (cwd: string, script: string, flags: string[], env: Record<string, string> = {}) =>
  spawnSync(tsx, ["--tsconfig", path.join(repoRoot, "platform/tsconfig.json"), path.join(repoRoot, "platform/cli", script), ...flags], { cwd, encoding: "utf8", env: { ...process.env, BOOSTCHAT_BASE_URL: "", BOOSTCHAT_PUBLISHER_TOKEN: "", ...env } });

await check("K1 declaring a site BoostChat-managed writes the portfolio-source@2 marker — and only that: --dry-run writes nothing; the marker is byte for byte SOURCE_MARKER_V2_TEXT and reads back as 'incremental'; a second run changes nothing (idempotent); the CLI does the same and exits 0", async () => {
  const { root, markerFile } = await markerRoot("k1", SHELL_SITE);
  const dry = await declareManagedPortfolio({ repoRoot: root, siteId: SHELL_SITE, dryRun: true });
  eq([dry.status, dry.from, dry.schema, dry.marker, await readFile(markerFile).catch(() => null)], ["would-write", "authored", "portfolio-source@2", `data/sites/${SHELL_SITE}/${SOURCE_MARKER_FILE}`, null], "dry run");
  const written = await declareManagedPortfolio({ repoRoot: root, siteId: SHELL_SITE });
  eq([written.status, written.from, written.releaseId, written.runtime.contract, await readFile(markerFile, "utf8"), await readPortfolioSource(path.dirname(markerFile))], ["written", "authored", shellPlan.releaseId, "portfolio-runtime@1", SOURCE_MARKER_V2_TEXT, "incremental"], "written");
  eq(JSON.parse(SOURCE_MARKER_V2_TEXT), { schema: "portfolio-source@2", managedBy: "boostchat", publishing: "incremental" }, "the V2 marker");
  const before = (await stat(markerFile)).mtimeMs;
  const again = await declareManagedPortfolio({ repoRoot: root, siteId: SHELL_SITE });
  eq([again.status, again.from, (await stat(markerFile)).mtimeMs === before, await readFile(markerFile, "utf8")], ["unchanged", "incremental", true, SOURCE_MARKER_V2_TEXT], "idempotent: not rewritten");
  eq((await readdir(path.dirname(markerFile))).sort(), [SOURCE_MARKER_FILE, "site.json"].sort(), "nothing else was written");

  const cliRoot = await markerRoot("k1-cli", SHELL_SITE);
  const dryCli = cliIn(cliRoot.root, "site-portfolio-managed.ts", ["--site", SHELL_SITE, "--dry-run"]);
  eq([dryCli.status, await readFile(cliRoot.markerFile).catch(() => null)], [0, null], `CLI --dry-run (${dryCli.stderr.slice(0, 200)})`);
  const run = cliIn(cliRoot.root, "site-portfolio-managed.ts", ["--site", SHELL_SITE]);
  eq([run.status, await readFile(cliRoot.markerFile, "utf8")], [0, SOURCE_MARKER_V2_TEXT], `CLI (${run.stderr.slice(0, 200)})`);
  assert(run.stdout.includes("portfolio-source@2") && run.stdout.includes(`pnpm site:publish --site ${SHELL_SITE} --host interior-demo-2.boostweb.co.kr --remote`), `the CLI names the next command: ${run.stdout.slice(0, 400)}`);
  const rerun = cliIn(cliRoot.root, "site-portfolio-managed.ts", ["--site", SHELL_SITE]);
  assert(rerun.status === 0 && rerun.stdout.includes("already declares portfolio-source@2"), "CLI idempotent");
  eq([cliIn(cliRoot.root, "site-portfolio-managed.ts", []).status, cliIn(cliRoot.root, "site-portfolio-managed.ts", ["--site", SHELL_SITE, "--legacy-v1"]).status], [2, 2], "usage errors (there is no V1 flag here)");
});

await check("K2 a site whose pinned release does not support the portfolio runtime is REFUSED with what to do, and nothing is written (function and CLI, exit 1); so is a site without identity.publicOrigin, a pin whose hash is not the stored release's, and a V1 (@1) site unless --upgrade-v1 asks for the conversion", async () => {
  const { root, markerFile } = await markerRoot("k2", UNSUPPORTED_SITE);
  for (const dryRun of [true, false]) {
    const message = await markerRefusal(declareManagedPortfolio({ repoRoot: root, siteId: UNSUPPORTED_SITE, dryRun }), `unsupported release (dryRun ${dryRun})`);
    assert(/cannot be declared BoostChat-managed \(portfolio-source@2, incremental publishing\): its pinned release interior-03-1\.0\.0-[0-9a-f]{12} does not support the portfolio runtime — its Template does not declare the portfolio runtime/.test(message), `message: ${message}`);
    assert(message.includes("Re-pin site.json") && message.includes("to a release of interior-03 that declares the portfolio runtime") && message.includes("--adopt --legacy-v1") && message.includes("Nothing was written"), `the message says what to do: ${message}`);
  }
  eq(await readFile(markerFile).catch(() => null), null, "no marker");
  const cli = cliIn(root, "site-portfolio-managed.ts", ["--site", UNSUPPORTED_SITE]);
  assert(cli.status === 1 && cli.stderr.includes("site:portfolio-managed REFUSED") && cli.stderr.includes("does not support the portfolio runtime"), `CLI: ${cli.status} ${cli.stderr.slice(0, 300)}`);
  eq(await readFile(markerFile).catch(() => null), null, "no marker after the CLI");

  const noOrigin = await markerRoot("k2-origin", SHELL_SITE, (site) => delete site.identity.publicOrigin);
  assert((await markerRefusal(declareManagedPortfolio({ repoRoot: noOrigin.root, siteId: SHELL_SITE }), "no publicOrigin")).includes("identity.publicOrigin"), "publicOrigin is required");
  const badPin = await markerRoot("k2-pin", SHELL_SITE, (site) => (site.template.releaseHash = `${String(site.template.releaseHash).slice(0, 12)}${"0".repeat(52)}`));
  assert((await markerRefusal(declareManagedPortfolio({ repoRoot: badPin.root, siteId: SHELL_SITE }), "pin hash")).includes("the stored release has"), "a pin that is not the stored release");
  eq([await readFile(noOrigin.markerFile).catch(() => null), await readFile(badPin.markerFile).catch(() => null)], [null, null], "no marker");

  // an existing V1 site keeps its marker unless the conversion is asked for by name
  const v1 = await markerRoot("k2-v1", SHELL_SITE);
  await writeFile(v1.markerFile, SOURCE_MARKER_TEXT);
  const kept = await markerRefusal(declareManagedPortfolio({ repoRoot: v1.root, siteId: SHELL_SITE }), "V1 site");
  assert(kept.includes("already BoostChat-managed in V1 mode") && kept.includes("--upgrade-v1"), `message: ${kept}`);
  eq([await readFile(v1.markerFile, "utf8"), await readPortfolioSource(path.dirname(v1.markerFile))], [SOURCE_MARKER_TEXT, "generated"], "the @1 marker is untouched and still means V1");
  const upgraded = await declareManagedPortfolio({ repoRoot: v1.root, siteId: SHELL_SITE, upgradeV1: true });
  eq([upgraded.status, upgraded.from, await readFile(v1.markerFile, "utf8")], ["written", "generated", SOURCE_MARKER_V2_TEXT], "--upgrade-v1");
});

await check("K3 V1 is a compatibility path, asked for by name: site:portfolio-sync --adopt without --legacy-v1 REFUSES (exit 2, before BoostChat or the site directory is touched) and points at site:portfolio-managed; --legacy-v1 is accepted next to --adopt and means nothing alone; the V1 marker and its reader are unchanged", async () => {
  const marker = path.join(repoRoot, "data/sites", ORDINARY_SITE, SOURCE_MARKER_FILE);
  const adopt = cliIn(repoRoot, "site-portfolio-sync.ts", ["--site", ORDINARY_SITE, "--host", HOST, "--adopt"]);
  assert(adopt.status === 2 && adopt.stderr.includes(`pnpm site:portfolio-managed --site ${ORDINARY_SITE}`) && adopt.stderr.includes("--adopt --legacy-v1") && adopt.stderr.includes("Nothing was changed"), `--adopt: ${adopt.status} ${adopt.stderr.slice(0, 300)}`);
  // accepted: the run gets past the flag and stops at the next rule (--adopt never combines with --dry-run)
  const legacy = cliIn(repoRoot, "site-portfolio-sync.ts", ["--site", ORDINARY_SITE, "--host", HOST, "--adopt", "--legacy-v1", "--dry-run"]);
  assert(legacy.status === 2 && legacy.stderr.includes("--adopt writes the adoption marker; it does not combine with --dry-run") && !legacy.stderr.includes("unknown arguments"), `--adopt --legacy-v1: ${legacy.status} ${legacy.stderr.slice(0, 300)}`);
  // …and without --dry-run it goes on to need BoostChat, exactly as --adopt always did
  const proceeds = cliIn(repoRoot, "site-portfolio-sync.ts", ["--site", ORDINARY_SITE, "--host", HOST, "--adopt", "--legacy-v1"]);
  assert(proceeds.status === 2 && proceeds.stderr.includes("BOOSTCHAT_BASE_URL and BOOSTCHAT_PUBLISHER_TOKEN must be set"), `--adopt --legacy-v1 proceeds: ${proceeds.status} ${proceeds.stderr.slice(0, 300)}`);
  const alone = cliIn(repoRoot, "site-portfolio-sync.ts", ["--site", ORDINARY_SITE, "--host", HOST, "--legacy-v1"]);
  assert(alone.status === 2 && alone.stderr.includes("--legacy-v1 qualifies --adopt"), `--legacy-v1 alone: ${alone.status}`);
  eq(await readFile(marker).catch(() => null), null, "no marker was written by any of them");
  eq([JSON.parse(SOURCE_MARKER_TEXT), SOURCE_MARKER_TEXT === SOURCE_MARKER_V2_TEXT], [{ schema: "portfolio-source@1", managedBy: "boostchat" }, false], "the V1 marker text is what it was");
});

await check("K4 CLI site:publish: --wait-seconds / --no-announce are validated (exit 2) and refused next to --rollback; a dry run accepts and ignores them; an unusable BOOSTCHAT_BASE_URL stops a shell publish before anything is uploaded (exit 2, the token is not printed) and does not concern an ordinary --dry-run", async () => {
  const pub = (flags: string[], env: Record<string, string> = {}, site = SHELL_SITE) => cliIn(repoRoot, "site-publish.ts", ["--site", site, "--host", HOST, ...flags], env);
  const bad = pub(["--wait-seconds", "soon"]);
  assert(bad.status === 2 && bad.stderr.includes("--wait-seconds must be a whole number of seconds") && bad.stderr.includes("[--no-announce] [--wait-seconds N]"), `--wait-seconds soon: ${bad.status} ${bad.stderr.slice(0, 200)}`);
  eq([pub(["--wait-seconds"]).status, pub(["--wait-seconds", "-1"]).status, pub(["--wait-seconds", "999999"]).status], [2, 2, 2], "missing / negative / absurd");
  for (const flags of [["--rollback", "--no-announce"], ["--rollback", "--wait-seconds", "5"]]) {
    const r = pub(flags);
    assert(r.status === 2 && r.stderr.includes("--rollback only combines with"), `${flags.join(" ")}: ${r.status}`);
  }
  assert(pub(["--no-activate", "--wait-seconds", "5"]).stderr.includes("cannot be combined with --no-activate") && pub(["--no-announce", "--wait-seconds", "5"]).stderr.includes("cannot be combined with --no-announce"), "--wait-seconds needs a wait");
  const UNUSABLE = { BOOSTCHAT_BASE_URL: "http://localhost:9/not-an-origin", BOOSTCHAT_PUBLISHER_TOKEN: "tok-SECRET-never-printed" };
  for (const flags of [["--no-announce"], ["--wait-seconds", "5"]]) {
    const dry = pub(["--dry-run", ...flags], UNUSABLE);
    eq(dry.status, 0, `--dry-run ${flags.join(" ")} (${dry.stderr.slice(0, 200)})`);
  }
  eq(pub(["--dry-run"], UNUSABLE, ORDINARY_SITE).status, 0, "an ordinary dry run next to an unusable BoostChat configuration");
  // a real (local) run of the shell site with a loopback BoostChat URL that is not an origin: refused before the store is touched
  const state = await tmpDir("k4-state");
  const config = pub(["--local", "--persist-to", state], UNUSABLE);
  assert(config.status === 2 && config.stderr.includes("BOOSTCHAT_BASE_URL must be an origin") && config.stderr.includes("nothing was uploaded"), `config: ${config.status} ${config.stderr.slice(0, 300)}`);
  assert(!`${config.stdout}${config.stderr}`.includes("tok-SECRET"), "the token is not printed");
  eq(await readdir(state), [], "the local store was not touched");
});

await check("INVARIANT every routing write of the managed flow that named a shell package (activations above) was made while the store held an overlay recon-runtime would use for it — and there were such writes; no branch wrote one otherwise", () => {
  eq(invariant.violations, [], "violations");
  assert(invariant.shellPointerWrites >= 4, `only ${invariant.shellPointerWrites} shell pointer writes were observed`);
});

for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });

await rm(ordinaryRoot, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
