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
 *   S3  refused         every way the Worker refuses an overlay — and the Worker gives the same reason
 *   S4  accepted        a valid overlay → the pointer is the last write; the Worker serves the overlay
 *   S5  unaffected      activate:false, dry run (reports the guard, never throws for it), a pointer that
 *                       already names the package
 *   S6  ordinary        an ordinary package activates as before and no overlay key is ever read
 *   S7  rollback        shell → ordinary needs no overlay; → shell needs one; the portfolio-truth guard
 *                       still refuses what it refused
 *   S7b rollback truth  an incrementally published site: the authoritative ids are the live overlay
 *                       manifest's projects (what site:publish --rollback uses for such a site)
 *   S8  serving         every addressable file of the shell package is served; /_runtime/** never is
 *   S9  CLI             the offline dry run names the guard
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { planPublish, portfolioOverlayState, publishedPortfolioTruth, publishSite, PublishError, rollbackHost, ROLLBACK_TRUTH_REFUSAL, type PortfolioTruthLoader, type PublishPlan } from "../publish/publish";
import { MemoryStore, type ObjectStore } from "../publish/store";
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

await check(`S3 an overlay the Worker would refuse is refused here too (${DEFECTS.length} defects): same reason code as the Worker's trace.overlay, no routing write; and with the pointer forced, the Worker does serve the raw shell page — the hole the guard closes`, async () => {
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

    // the Worker, asked for "/" on a host forced onto this package, refuses the overlay for the same reason and answers with the shell page
    s.objects.set(shellPlan.routingKey, { body: enc({ schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: HASH, buildInputId: shellPlan.buildInputId, releaseId: shellPlan.releaseId, publishedAt: T0().toISOString() }), meta: JSON_META });
    const request = new Request(`https://${HOST}/`);
    const trace = newTrace(request);
    const r = await handle(request, { SITES: bucketOf(s) }, trace);
    eq([r.status, trace.overlay, sha256(new Uint8Array(await r.arrayBuffer()))], [200, reason, shellPlan.files.find((f) => f.path === "index.html")!.sha256], `${label}: Worker`);
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

// ── rollback ─────────────────────────────────────────────────────────────────────────────────────
/** Demo 02's last ORDINARY build (data/site-builds/<site>/previous.json), sealed through a temp repo root; returns its ref and its portfolio record ids */
async function sealOrdinaryBuild(s: MemoryStore): Promise<{ ref: { siteId: string; packageHash: string; buildInputId: string; releaseId: string; publishedAt: string }; plan: PublishPlan; ids: string[] }> {
  const prev = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SHELL_SITE, "previous.json"), "utf8")) as { buildInputId: string; packageDir: string };
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "recon-shell-guard-"));
  try {
    const dest = path.join(tmpRoot, "data/site-builds", SHELL_SITE, "packages", prev.buildInputId);
    await cp(path.join(repoRoot, prev.packageDir), dest, { recursive: true });
    await writeFile(path.join(tmpRoot, "data/site-builds", SHELL_SITE, "current.json"), JSON.stringify({ buildInputId: prev.buildInputId, packageDir: path.relative(tmpRoot, dest), finishedAt: "2026-10-09T09:09:40.032Z" }));
    const r = await publishSite({ repoRoot: tmpRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
    assert(r.status === "uploaded" && r.plan.shell === undefined && r.plan.packageHash !== HASH, "the previous build is an ordinary package of its own");
    const integration = path.join(dest, "site/_integration");
    const docName = (await readdir(integration)).find((n) => n.startsWith("portfolio."));
    assert(docName, "the ordinary build serves a portfolio document");
    const ids = (JSON.parse(await readFile(path.join(integration, docName), "utf8")) as { records: { id: string }[] }).records.map((x) => x.id);
    return { ref: { siteId: SHELL_SITE, packageHash: r.plan.packageHash, buildInputId: r.plan.buildInputId, releaseId: r.plan.releaseId, publishedAt: "2026-10-09T09:10:00.000Z" }, plan: r.plan, ids };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
function truthLoader(ids: readonly string[]): PortfolioTruthLoader & { calls: number } {
  const loader = Object.assign(async () => (loader.calls++, { authoritativeIds: ids, source: "test truth" }), { calls: 0 });
  return loader;
}

await check("S7 rollback: live shell → previous ORDINARY package needs no overlay (none is read) and still answers to the portfolio-truth guard exactly as before; ordinary → previous SHELL package is refused without a usable overlay (pointer byte-identical, zero writes) and passes with one", async () => {
  const s = new MemoryStore();
  const ordinary = await sealOrdinaryBuild(s);
  assert(ordinary.ids.length > 0, "the ordinary build has records");
  // live = the shell package (activated with a valid overlay), previous = the ordinary build
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  publishOverlay(s);
  s.objects.set(shellPlan.routingKey, { body: enc(`${JSON.stringify({ schemaVersion: 1, hostname: HOST, ...ordinary.ref }, null, 2)}\n`), meta: JSON_META });
  const activated = await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });
  assert(activated.status === "published" && activated.pointer.previous?.packageHash === ordinary.ref.packageHash, "live = shell, previous = ordinary");
  const liveShell = Buffer.from(s.objects.get(shellPlan.routingKey)!.body);

  // (1a) the truth guard is not weakened: records that are not in the authoritative data → refused, as for any site
  const noTruth = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: truthLoader([]) }), "empty truth");
  assert(noTruth.startsWith(ROLLBACK_TRUTH_REFUSAL), `truth guard message: ${noTruth}`);
  assert((await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0 }), "no loader")).includes("no authoritative site data was supplied"), "no loader → refused");
  eq(Buffer.compare(Buffer.from(s.objects.get(shellPlan.routingKey)!.body), liveShell), 0, "pointer untouched by the refusals");

  // (1b) with the records still authoritative: rolled back, and the overlay is not consulted (delete it first to prove it is not needed)
  s.objects.delete(CURRENT_KEY);
  const sp = spy(s);
  const truth = truthLoader(ordinary.ids);
  const back = await rollbackHost({ store: sp, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: truth });
  eq([back.pointer.packageHash, back.pointer.previous?.packageHash, sp.puts, truth.calls], [ordinary.ref.packageHash, HASH, [shellPlan.routingKey], 1], "rolled back to the ordinary package");
  eq(sp.gets.filter((k) => k.startsWith("portfolio-public/")), [], "no overlay key read for an ordinary target");

  // (2) now previous = the shell package: no overlay → refused; a defective one → refused; a valid one → rolled forward
  const liveOrdinary = Buffer.from(s.objects.get(shellPlan.routingKey)!.body);
  const w = s.writes.length;
  const absent = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: truthLoader(ordinary.ids) }), "rollback to shell, no overlay");
  assert(REFUSAL.test(absent) && absent.includes(`${CURRENT_KEY} does not exist`) && absent.includes("routing pointer NOT written"), `message: ${absent}`);
  publishOverlay(s, { storedManifest: enc("{}") });
  const defective = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: truthLoader(ordinary.ids) }), "rollback to shell, bad manifest");
  assert(REFUSAL.test(defective) && defective.includes("(manifest-sha256:"), `message: ${defective}`);
  eq([s.writes.length - w, Buffer.compare(Buffer.from(s.objects.get(shellPlan.routingKey)!.body), liveOrdinary)], [0, 0], "zero writes, pointer byte-identical");
  publishOverlay(s);
  const none = truthLoader(ordinary.ids);
  const forward = await rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: none });
  eq([forward.pointer.packageHash, forward.pointer.previous?.packageHash, s.writes.slice(w), none.calls], [HASH, ordinary.ref.packageHash, [shellPlan.routingKey], 0], "rolled forward to the shell package (no portfolio document in it → truth loader not called)");
});

await check("S7b portfolio truth of an incrementally published site = the record ids BoostChat has published for the package the host serves now: rollback to the ordinary build passes while every id of it is still published, is refused by name when one was withdrawn, and fails closed without a usable overlay / pointer", async () => {
  const s = new MemoryStore();
  const ordinary = await sealOrdinaryBuild(s);
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  const projectsOf = (ids: readonly string[]) => (m: Record<string, any>) => (m.projects = Object.fromEntries(ids.map((id) => [id, { slug: id, key: `projects/${id}/${"e".repeat(64)}.json`, sha256: "e".repeat(64) }])));
  const loader: PortfolioTruthLoader = () => publishedPortfolioTruth(s, SHELL_SITE, HOST);

  // no routing pointer yet → nothing is "served now"
  assert((await refusal(publishedPortfolioTruth(s, SHELL_SITE, HOST), "no pointer")).includes("does not exist"), "no pointer");
  const o = publishOverlay(s, { manifest: projectsOf([...ordinary.ids, "bi-extra"]) });
  s.objects.set(shellPlan.routingKey, { body: enc(`${JSON.stringify({ schemaVersion: 1, hostname: HOST, ...ordinary.ref }, null, 2)}\n`), meta: JSON_META });
  // live = the ordinary package: it has no overlay → no published set to read
  assert((await refusal(publishedPortfolioTruth(s, SHELL_SITE, HOST), "live ordinary")).includes("has no overlay recon-runtime would use"), "live ordinary package");
  assert((await refusal(publishedPortfolioTruth(s, "another-site", HOST), "other site")).includes(`names site "${SHELL_SITE}"`), "another site's pointer");
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0 });

  const truth = await publishedPortfolioTruth(s, SHELL_SITE, HOST);
  eq([...truth.authoritativeIds].sort(), [...ordinary.ids, "bi-extra"].sort(), "ids = manifest.projects");
  assert(truth.source.includes(CURRENT_KEY) && truth.source.includes(`revision ${o.revision}`), `source: ${truth.source}`);

  // one record of the ordinary build was withdrawn in BoostChat since → the rollback would re-expose it → refused by name
  const withdrawn = ordinary.ids[0]!;
  publishOverlay(s, { manifest: projectsOf(ordinary.ids.slice(1)) });
  const liveShell = Buffer.from(s.objects.get(shellPlan.routingKey)!.body);
  const w = s.writes.length;
  const re = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: loader }), "withdrawn record");
  assert(re.startsWith(ROLLBACK_TRUTH_REFUSAL) && re.includes(`: ${withdrawn} —`) && re.includes("the portfolio BoostChat has published"), `message: ${re}`);
  // the overlay stops verifying → no authoritative data → fails closed
  publishOverlay(s, { storedManifest: null });
  const closed = await refusal(rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: loader }), "no usable overlay");
  assert(closed.includes("could not load the site's current authoritative data") && closed.includes("manifest-missing") && closed.includes("fails closed"), `message: ${closed}`);
  eq([s.writes.length - w, Buffer.compare(Buffer.from(s.objects.get(shellPlan.routingKey)!.body), liveShell)], [0, 0], "zero writes, pointer byte-identical");
  // every record of the ordinary build is published → rolled back
  publishOverlay(s, { manifest: projectsOf(ordinary.ids) });
  const back = await rollbackHost({ store: s, siteId: SHELL_SITE, hostname: HOST, now: T0, portfolioTruth: loader });
  eq([back.pointer.packageHash, back.pointer.previous?.packageHash, s.writes.slice(w)], [ordinary.ref.packageHash, HASH, [shellPlan.routingKey]], "rolled back");
});

await check("S8 serving a shell package: every addressable file is served byte for byte with its stored headers — except /_runtime/**, which is a 404 (the package's 404 page) for both documents, with and without an overlay", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SHELL_SITE, hostname: HOST, store: s, now: T0, activate: false });
  s.objects.set(shellPlan.routingKey, { body: enc({ schemaVersion: 1, hostname: HOST, siteId: SHELL_SITE, packageHash: HASH, buildInputId: shellPlan.buildInputId, releaseId: shellPlan.releaseId, publishedAt: T0().toISOString() }), meta: JSON_META });
  const env: Env = { SITES: bucketOf(s) };
  const notFound = shellPlan.files.find((f) => f.path === "404.html")!;
  const runtimeFiles = shellPlan.files.filter((f) => f.path.startsWith("_runtime/"));
  eq(runtimeFiles.map((f) => f.path).sort(), [RUNTIME_FILE, SHELL_FILE], `${RUNTIME_DIR} holds the two documents`);
  let served = 0;
  for (const f of shellPlan.files) {
    if (f.path === "404.html" || f.path === "_not-found.html") continue;
    const url = f.path === "index.html" ? "/" : `/${f.path.endsWith(".html") ? f.path.slice(0, -5) : f.path}`;
    const r = await handle(new Request(`https://${HOST}${url}`), env);
    const body = new Uint8Array(await r.arrayBuffer());
    if (f.path.startsWith("_runtime/")) {
      eq([r.status, r.headers.get("cache-control"), sha256(body)], [404, "no-store", notFound.sha256], `${url} is never served`);
      continue;
    }
    eq([r.status, r.headers.get("content-type"), r.headers.get("cache-control"), body.length, sha256(body)], [200, f.contentType, f.cacheControl, f.size, f.sha256], url);
    served++;
  }
  eq(served, shellPlan.files.length - 2 - runtimeFiles.length, "addressable = all but 404.html, _not-found.html and /_runtime/**");
  publishOverlay(s);
  for (const f of runtimeFiles) {
    const r = await handle(new Request(`https://${HOST}/${f.path}`), env);
    eq([r.status, sha256(new Uint8Array(await r.arrayBuffer()))], [404, notFound.sha256], `/${f.path} with a live overlay`);
  }
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
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
