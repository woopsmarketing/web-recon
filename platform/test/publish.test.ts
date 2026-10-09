/**
 * Static deployment foundation — unit tests (no wrangler, no network):
 *   1. recon-runtime path mapper against the observed Next static-export layout
 *   2. publish-time content-type / cache policy (content-addressing is verified, not assumed)
 *   3. publish ordering and failure semantics on the in-memory store, using the site's REAL
 *      current package: files → verify → seal → pointer; injected upload / verify / seal failures
 *      leave the existing pointer byte-identical; sealed package → immutable skip; a different
 *      seal or a hostname owned by another site → refused; dry run touches no store
 *   4. recon-runtime handler (src/index.ts) over the published objects: every package file served
 *      byte-for-byte with its stored headers, 404 page, HEAD, 304, 405, 400, unknown host
 *   5. the published package directory under data/site-builds/** is byte-identical before/after
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/publish.test.ts   (pnpm test:publish)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { planPublish, publishSite, PublishError, rollbackHost, sealBytes, DRY_RUN_PUBLISHED_AT, ROLLBACK_TRUTH_REFUSAL, ROLLBACK_TRUTH_RUNBOOK, type PortfolioTruthLoader } from "../publish/publish";
import { MemoryStore, type ObjectStore } from "../publish/store";
import { cachePolicyFor, contentTypeFor } from "../publish/media";
import { sha256 } from "../util/hash";
import { buildSiteSnapshot } from "../site/load";
import { testSiteRoot } from "./demo-frozen-dataset";
import { QA_GOLDEN_DIR, QA_GOLDEN_DOC_SHA256, QA_GOLDEN_MANIFEST_SHA256, QA_GOLDEN_VERSION } from "./portfolio-qa-corpus";
import { resolvePath } from "../../workers/recon-runtime/src/paths";
import runtimeDefault, {
  handle,
  newTrace,
  logTrace,
  requestHost,
  type Env,
  type R2BucketLike,
  type R2ObjectBodyLike,
  type R2ObjectLike,
} from "../../workers/recon-runtime/src/index";
import { CACHE_IMMUTABLE, CACHE_REVALIDATE, packageKey, portfolioCurrentKey, routingKey, sealKey, type PackageSeal } from "../../workers/recon-runtime/src/contract";

const repoRoot = process.cwd();
const SITE = process.env.PUBLISH_TEST_SITE ?? "boost-interior-demo";
const HOST = "demo.test.example";

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
async function rejects(p: Promise<unknown>, re: RegExp, msg: string) {
  try {
    await p;
  } catch (e) {
    assert(e instanceof PublishError || e instanceof Error, `${msg}: not an Error`);
    assert(re.test((e as Error).message), `${msg}: wrong error "${(e as Error).message}"`);
    return;
  }
  throw new Error(`${msg}: did not fail`);
}

/** sha256 over every file of a directory (relative path + bytes), for before/after identity. */
async function treeHash(dir: string): Promise<{ hash: string; files: number }> {
  const h = createHash("sha256");
  let files = 0;
  async function walk(d: string, rel: string) {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r);
      else {
        h.update(`${r}\0${sha256(await readFile(path.join(d, e.name)))}\n`);
        files++;
      }
    }
  }
  await walk(dir, "");
  return { hash: h.digest("hex"), files };
}

const current = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SITE, "current.json"), "utf8")) as { packageDir: string };
const packageDir = path.join(repoRoot, current.packageDir);
const before = await treeHash(packageDir);
console.log(`package under test: ${current.packageDir} (${before.files} files incl. build-record.json)`);

// ── 1. path mapper ────────────────────────────────────────────────────────────
console.log("\npath mapper");
const KEY: [string, string][] = [
  ["/", "index.html"],
  ["/about", "about.html"],
  ["/portfolio", "portfolio.html"],
  ["/3d-portfolio", "3d-portfolio.html"],
  ["/portfolio/buk-32py-kitchen-bathroom-renewal", "portfolio/buk-32py-kitchen-bathroom-renewal.html"],
  ["/portfolio.txt", "portfolio.txt"],
  ["/__next._tree.txt", "__next._tree.txt"],
  ["/portfolio/x/__next.portfolio.$d$slug.__PAGE__.txt", "portfolio/x/__next.portfolio.$d$slug.__PAGE__.txt"],
  ["/portfolio/x/__next.portfolio.%24d%24slug.__PAGE__.txt", "portfolio/x/__next.portfolio.$d$slug.__PAGE__.txt"],
  ["/_next/static/chunks/0agt8sfcbim42.js", "_next/static/chunks/0agt8sfcbim42.js"],
  ["/assets/03c625140dc4df674fb8.jpg", "assets/03c625140dc4df674fb8.jpg"],
  ["/robots.txt", "robots.txt"],
  ["/sitemap.xml", "sitemap.xml"],
  ["/_not-found.txt", "_not-found.txt"],
  ["/%ED%95%9C", "한.html"],
];
const NOT_FOUND = ["/index.html", "/about.html", "/404.html", "/_not-found.html", "/404", "/_not-found", "/index", "/portfolio/index", "/about/", "/portfolio/", "/_package.json"];
const BAD = ["/a%2Fb", "/a%2fb", "/a%5Cb", "/a\\b", "/%E0%A4%A", "/a//b", "/a/%2e%2e/b", "/../x", "/a/./b", "/a%00b", "relative"];
await check(`${KEY.length} paths resolve to the exact export file`, () => {
  for (const [p, k] of KEY) eq(resolvePath(p), { kind: "key", key: k }, p);
});
await check(`${NOT_FOUND.length} paths are never served (.html spelled out, framework pages, trailing slash, seal)`, () => {
  for (const p of NOT_FOUND) eq(resolvePath(p).kind, "not-found", p);
});
await check(`${BAD.length} traversal / encoding tricks are bad requests`, () => {
  for (const p of BAD) eq(resolvePath(p).kind, "bad-request", p);
});

// ── 2. media / cache policy ──────────────────────────────────────────────────
console.log("\ncontent-type / cache policy");
await check("content types for every extension in the export; unknown extension → undefined [P13: extended to the full MIME table (html css js mjs json map xml txt svg png jpg jpeg gif webp avif ico woff woff2 webmanifest) + extensionless]", () => {
  eq(
    ["a.html", "a.txt", "a.js", "a.css", "a.svg", "a.jpg", "a.xml", "a.bin"].map(contentTypeFor),
    ["text/html; charset=utf-8", "text/plain; charset=utf-8", "text/javascript; charset=utf-8", "text/css; charset=utf-8", "image/svg+xml", "image/jpeg", "application/xml", undefined],
    "types",
  );
  const names = [
    "a.html", "a.css", "a.js", "a.mjs", "a.json", "a.map", "a.xml", "a.txt",
    "a.svg", "a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.avif", "a.ico",
    "a.woff", "a.woff2", "a.webmanifest", "a.bin", "a",
  ];
  const expected = [
    "text/html; charset=utf-8", "text/css; charset=utf-8", "text/javascript; charset=utf-8", "text/javascript; charset=utf-8",
    "application/json", "application/json", "application/xml", "text/plain; charset=utf-8",
    "image/svg+xml", "image/png", "image/jpeg", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/x-icon",
    "font/woff", "font/woff2", "application/manifest+json", undefined, undefined,
  ];
  eq(names.map(contentTypeFor), expected, "full MIME table");
});
await check("immutable only for _next/static/** and names that ARE a prefix of their own sha256", () => {
  const sha = "03c625140dc4df674fb8db0e33f41f9ead260515a17c45ed739a4fd08b9a6d4c";
  eq(cachePolicyFor("_next/static/chunks/x.js", "00").cacheControl, CACHE_IMMUTABLE, "next static");
  eq(cachePolicyFor("assets/03c625140dc4df674fb8.jpg", sha).reason, "content-addressed", "real hash name");
  eq(cachePolicyFor("assets/ffffffffffffffffffff.jpg", sha).cacheControl, CACHE_REVALIDATE, "hash-looking name that is NOT its hash");
  eq(cachePolicyFor("index.html", sha).cacheControl, CACHE_REVALIDATE, "html");
  eq(cachePolicyFor("portfolio/__next._tree.txt", sha).cacheControl, CACHE_REVALIDATE, "rsc");
});

// ── 3. publish ordering / failure semantics ──────────────────────────────────
console.log("\npublish (memory store, real current package)");
const plan = await planPublish({ repoRoot, siteId: SITE, hostname: HOST });
const T0 = () => new Date("2026-09-21T00:00:00.000Z");
const OTHER_HASH = "a".repeat(64);
const priorPointer = {
  schemaVersion: 1,
  hostname: HOST,
  siteId: SITE,
  packageHash: OTHER_HASH,
  buildInputId: "b".repeat(64),
  releaseId: "interior-01-0.0.0-prior",
  publishedAt: "2026-09-01T00:00:00.000Z",
};
const priorBytes = new TextEncoder().encode(`${JSON.stringify(priorPointer, null, 2)}\n`);
function storeWithPrior(faults: ConstructorParameters<typeof MemoryStore>[0] = {}) {
  const s = new MemoryStore(faults);
  s.objects.set(routingKey(HOST), { body: priorBytes, meta: { contentType: "application/json", cacheControl: "no-store" } });
  // the package the host serves is sealed (as every published package is); same immutable paths, same bytes
  s.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode(JSON.stringify({ ...plan.seal, packageHash: OTHER_HASH })), meta: { contentType: "application/json", cacheControl: "no-store" } });
  return s;
}
/** the site's CURRENT served portfolio ids — the set a fresh public build emits (what site:publish --rollback loads) */
const SERVED_AT = new Date().toISOString();
// the demo is read through the frozen composition (demo-frozen-dataset.ts): the live directory holds the adoption marker and refuses to load without a generated portfolio
const servedSite = await testSiteRoot(repoRoot, SITE);
const SERVED_IDS = (await buildSiteSnapshot({ repoRoot: servedSite.root, siteId: SITE, mode: "public", at: SERVED_AT })).snapshot.content.projects.map((p) => p.id);
const SERVED_SOURCE = `data/sites/${SITE}/content/projects.json (served at ${SERVED_AT})`;
/** a portfolioTruth loader over fixed ids that counts its calls */
function truthLoader(ids: readonly string[] = SERVED_IDS): PortfolioTruthLoader & { calls: number } {
  const loader = Object.assign(async () => {
    loader.calls++;
    return { authoritativeIds: ids, source: SERVED_SOURCE };
  }, { calls: 0 });
  return loader;
}
function pointerUnchanged(s: MemoryStore) {
  const now = s.objects.get(routingKey(HOST))?.body;
  assert(now && Buffer.compare(Buffer.from(now), Buffer.from(priorBytes)) === 0, "existing routing pointer was modified");
}

await check("plan: every package file planned under sites/<siteId>/packages/<packageHash>/, counts = build record", async () => {
  const record = JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8"));
  eq([plan.packageHash, plan.files.length, plan.bytes], [record.packageHash, record.qa.files, record.qa.bytes], "identity/counts");
  assert(plan.files.every((f) => f.key === `sites/${SITE}/packages/${record.packageHash}/${f.path}`), "key layout");
  eq(plan.sealKey, sealKey(SITE, record.packageHash), "seal key");
});

await check("dry run: no store call at all", async () => {
  let calls = 0;
  const spy: ObjectStore = { description: "spy", put: async () => void calls++, get: async () => (calls++, null) };
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: spy, dryRun: true, now: T0 });
  assert(r.status === "dry-run", "status");
  eq([r.status, calls, r.pointer.packageHash], ["dry-run", 0, plan.packageHash], "dry run");
});

let published: MemoryStore | undefined;
await check("publish: all files, then seal, then pointer — pointer is the LAST write; previous = prior pointer", async () => {
  const s = storeWithPrior();
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  assert(r.status === "published", "status");
  eq([r.upload, r.uploaded, r.verified, r.pointerWrite], ["uploaded", plan.files.length, plan.files.length, "written"], "result");
  const n = s.writes.length;
  eq(n, plan.files.length + 2, "write count");
  eq(new Set(s.writes.slice(0, n - 2)).size, plan.files.length, "files first");
  eq(s.writes.slice(n - 2), [plan.sealKey, routingKey(HOST)], "seal then pointer");
  const pointer = JSON.parse(Buffer.from(s.objects.get(routingKey(HOST))!.body).toString("utf8"));
  eq([pointer.packageHash, pointer.previous?.packageHash, pointer.publishedAt], [plan.packageHash, OTHER_HASH, "2026-09-21T00:00:00.000Z"], "pointer");
  for (const f of plan.files) {
    const o = s.objects.get(f.key)!;
    eq([sha256(o.body), o.meta.contentType, o.meta.cacheControl], [f.sha256, f.contentType, f.cacheControl], f.path);
  }
  published = s;
});

await check("republish of a sealed package: immutable skip (0 file uploads) and pointer unchanged", async () => {
  const s = published!;
  const w = s.writes.length;
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  assert(r.status === "published", "status");
  eq([r.upload, r.uploaded, r.pointerWrite, s.writes.length - w], ["skipped-sealed", 0, "unchanged", 0], "skip");
});

await check("sealed package re-pointed from another host: skip upload, write only that host's pointer", async () => {
  const s = published!;
  const w = s.writes.length;
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: "second.test.example", store: s, now: T0 });
  assert(r.status === "published" && r.upload === "skipped-sealed" && r.pointer.previous === undefined, "result");
  eq(s.writes.slice(w), [routingKey("second.test.example")], "only the new pointer");
});

await check("invalid concurrency (NaN / 0 / -1 / 1.5) → refused before any upload: no file, no seal, pointer byte-identical (review B1)", async () => {
  for (const c of [Number.NaN, 0, -1, 1.5]) {
    const s = storeWithPrior();
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, concurrency: c }), /concurrency must be a positive integer/, `concurrency ${c}`);
    eq([...s.objects.keys()], [routingKey(HOST), sealKey(SITE, OTHER_HASH)], `concurrency ${c}: store objects (exactly what was seeded)`);
    pointerUnchanged(s);
  }
});
await check("injected upload failure → error, no seal, existing pointer byte-identical", async () => {
  const victim = plan.files[Math.floor(plan.files.length / 2)]!.key;
  const s = storeWithPrior({ failPut: (k) => k === victim });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /injected put failure/, "upload failure");
  assert(!s.objects.has(plan.sealKey), "seal written");
  pointerUnchanged(s);
});

await check("injected corruption → read-back verify fails, no seal, existing pointer byte-identical", async () => {
  const victim = plan.files.find((f) => f.path.endsWith(".js"))!.key;
  const s = storeWithPrior({ corruptPut: (k) => k === victim });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /verify: .* read back/, "verify failure");
  assert(!s.objects.has(plan.sealKey), "seal written");
  pointerUnchanged(s);
});

await check("injected seal write failure / seal corruption → existing pointer byte-identical", async () => {
  const a = storeWithPrior({ failPut: (k) => k === plan.sealKey });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: a, now: T0 }), /injected put failure/, "seal put");
  pointerUnchanged(a);
  const b = storeWithPrior({ corruptPut: (k) => k === plan.sealKey });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: b, now: T0 }), /verify: seal/, "seal verify");
  pointerUnchanged(b);
});

await check("injected pointer corruption → publish fails (pointer read-back verified)", async () => {
  const s = new MemoryStore({ corruptPut: (k) => k === routingKey(HOST) });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /verify: routing/, "pointer verify");
});

await check("a different seal already at this packageHash → refused, nothing uploaded, pointer untouched", async () => {
  const s = storeWithPrior();
  s.objects.set(plan.sealKey, { body: new TextEncoder().encode("{}"), meta: { contentType: "application/json", cacheControl: "no-store" } });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /immutable; refusing/, "seal mismatch");
  eq(s.writes.length, 0, "writes");
  pointerUnchanged(s);
});

await check("hostname currently serving another site → refused unless allowSiteChange (after the seal, before the pointer)", async () => {
  const s = new MemoryStore();
  const foreign = { ...priorPointer, siteId: "another-site" };
  const foreignBytes = new TextEncoder().encode(JSON.stringify(foreign));
  s.objects.set(routingKey(HOST), { body: foreignBytes, meta: { contentType: "application/json", cacheControl: "no-store" } });
  // the other site's live package is sealed, as every published package is
  s.objects.set(sealKey("another-site", OTHER_HASH), { body: new TextEncoder().encode(JSON.stringify({ ...plan.seal, siteId: "another-site", packageHash: OTHER_HASH })), meta: { contentType: "application/json", cacheControl: "no-store" } });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /currently serves site "another-site"/, "site change");
  eq(Buffer.compare(Buffer.from(s.objects.get(routingKey(HOST))!.body), Buffer.from(foreignBytes)), 0, "pointer bytes");
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, allowSiteChange: true });
  assert(r.status === "published" && r.pointer.previous?.siteId === "another-site", "allowed with flag");
});

await check("rollback: re-points to previous (sealed) package with no upload; the left package becomes previous; refused without a valid previous seal", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  // a second, fake sealed package of the same site becomes current (simulates a later publish)
  const next = { siteId: SITE, packageHash: OTHER_HASH, buildInputId: "b".repeat(64), releaseId: "interior-01-9.9.9-next", publishedAt: "2026-09-22T00:00:00.000Z" };
  const fakeSeal = { ...plan.seal, packageHash: OTHER_HASH };
  s.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode(JSON.stringify(fakeSeal)), meta: { contentType: "application/json", cacheControl: "no-store" } });
  // …and, like every sealed package, it has its objects (a byte copy of the real one)
  for (const f of plan.files) s.objects.set(packageKey(SITE, OTHER_HASH, f.path), s.objects.get(f.key)!);
  const first = JSON.parse(Buffer.from(s.objects.get(routingKey(HOST))!.body).toString("utf8"));
  const curPtr = { schemaVersion: 1, hostname: HOST, ...next, previous: { siteId: SITE, packageHash: first.packageHash, buildInputId: first.buildInputId, releaseId: first.releaseId, publishedAt: first.publishedAt } };
  s.objects.set(routingKey(HOST), { body: new TextEncoder().encode(JSON.stringify(curPtr)), meta: { contentType: "application/json", cacheControl: "no-store" } });
  const w = s.writes.length;
  const truth = truthLoader();
  const r = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
  eq([r.pointer.packageHash, r.pointer.previous?.packageHash, s.writes.slice(w)], [plan.packageHash, OTHER_HASH, [routingKey(HOST)]], "rolled back");
  const again = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
  eq(again.pointer.packageHash, OTHER_HASH, "second rollback rolls forward");
  eq(truth.calls, plan.files.some((f) => f.path === "_integration/manifest.json") ? 2 : 0, "portfolio truth consulted once per portfolio-backed rollback");
  // previous without a seal → refused, pointer untouched
  s.objects.delete(sealKey(SITE, plan.packageHash));
  const beforeBytes = Buffer.from(s.objects.get(routingKey(HOST))!.body);
  await rejects(rollbackHost({ store: s, siteId: SITE, hostname: HOST }), /no valid seal/, "missing seal");
  eq(Buffer.compare(Buffer.from(s.objects.get(routingKey(HOST))!.body), beforeBytes), 0, "pointer untouched");
  await rejects(rollbackHost({ store: new MemoryStore(), siteId: SITE, hostname: HOST }), /nothing to roll back/, "no pointer");
  await rejects(rollbackHost({ store: s, siteId: "another-site", hostname: HOST }), /serves site/, "wrong site");
});

await check("expectPackageHash: matching hash publishes; a different hash (site rebuilt since review) is refused before any store access", async () => {
  const s = new MemoryStore();
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, expectPackageHash: OTHER_HASH }), /site was rebuilt/, "stale expectation");
  eq(s.writes.length, 0, "writes");
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, expectPackageHash: plan.packageHash, now: T0 });
  eq(r.status, "published", "matching expectation");
});

await check("invalid inputs refused before any store access: hostname with port / uppercase-invalid / unknown site", async () => {
  const spy = new MemoryStore();
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: "localhost:8787", store: spy }), /port/, "port");
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: "bad_host", store: spy }), /invalid hostname/, "charset");
  await rejects(publishSite({ repoRoot, siteId: "no-such-site-xyz", hostname: HOST, store: spy }), /no current build/, "site");
  eq(spy.writes.length, 0, "writes");
});

// ── 3b. dry-run determinism / checkStore / expectLivePackageHash / activate:false / reverify ──
console.log("\npublish: dry-run determinism, checkStore, guards (new)");

await check("P1 dry-run determinism: two dry runs at different `now`, same package+store state → deep-equal result; DRY_RUN_PUBLISHED_AT sentinel", async () => {
  const strip = (v: unknown) => JSON.stringify(v, (k, val) => (k === "abs" ? undefined : val));
  const r0 = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, dryRun: true, now: () => new Date("2026-09-21T00:00:00.000Z") });
  const r1 = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, dryRun: true, now: () => new Date("2027-01-01T09:08:07.000Z") });
  assert(r0.status === "dry-run" && r1.status === "dry-run", "status");
  eq(strip(r0), strip(r1), "deep-equal across different now()");
  eq([r0.pointer.publishedAt, r1.pointer.publishedAt], [DRY_RUN_PUBLISHED_AT, DRY_RUN_PUBLISHED_AT], "sentinel publishedAt");
});

await check("P2a dry-run + checkStore, empty store: storeCheck reports it fresh, zero writes", async () => {
  const s = new MemoryStore();
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(r.status === "dry-run", "status");
  eq(r.storeCheck, { store: "memory", seal: "absent", wouldUpload: plan.files.length, wouldSkip: 0, live: null, pointerAction: "write" }, "storeCheck");
  eq(s.writes.length, 0, "writes");
});

await check("P2b dry-run + checkStore, store already sealed+published to this host: identical/unchanged, zero new writes, bytes unchanged", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  const before = new Map([...s.objects].map(([k, v]) => [k, Buffer.from(v.body)] as const));
  const w = s.writes.length;
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(r.status === "dry-run", "status");
  eq(r.storeCheck?.seal, "identical", "seal");
  eq([r.storeCheck?.wouldUpload, r.storeCheck?.wouldSkip, r.storeCheck?.pointerAction], [0, plan.files.length, "unchanged"], "storeCheck");
  eq(s.writes.length - w, 0, "no new writes");
  for (const [k, v] of before) assert(Buffer.compare(Buffer.from(s.objects.get(k)!.body), v) === 0, `${k} bytes changed`);
});

await check("P2c dry-run + checkStore, prior pointer at another package: live/pointerAction=write, pointer.previous filled, zero writes", async () => {
  const s = storeWithPrior();
  const w = s.writes.length;
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 });
  assert(r.status === "dry-run", "status");
  eq(r.storeCheck?.live?.packageHash, OTHER_HASH, "live");
  eq(r.storeCheck?.pointerAction, "write", "pointerAction");
  eq(r.pointer.previous?.packageHash, OTHER_HASH, "pointer.previous");
  eq(s.writes.length - w, 0, "no new writes");
  pointerUnchanged(s);
});

await check("P3 dry-run + checkStore surfaces the real run's refusals with zero writes", async () => {
  {
    const s = storeWithPrior();
    s.objects.set(plan.sealKey, { body: new TextEncoder().encode("{}"), meta: { contentType: "application/json", cacheControl: "no-store" } });
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 }), /immutable/, "seal mismatch");
    eq(s.writes.length, 0, "writes: seal mismatch");
  }
  {
    const s = new MemoryStore();
    const foreign = { schemaVersion: 1, hostname: HOST, siteId: "another-site", packageHash: OTHER_HASH, buildInputId: "b".repeat(64), releaseId: "x", publishedAt: "2026-09-01T00:00:00.000Z" };
    s.objects.set(routingKey(HOST), { body: new TextEncoder().encode(JSON.stringify(foreign)), meta: { contentType: "application/json", cacheControl: "no-store" } });
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0 }), /currently serves site "another-site"/, "site change");
    eq(s.writes.length, 0, "writes: site change");
  }
  {
    const s = storeWithPrior();
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, dryRun: true, checkStore: true, now: T0, expectLivePackageHash: "none" }), /stale-write guard/, "expectLive mismatch");
    eq(s.writes.length, 0, "writes: expectLive mismatch");
  }
});

await check("P4 expectLivePackageHash on the real path (stale-write guard)", async () => {
  {
    const s = storeWithPrior();
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: "none" }), /stale-write guard/, "expect none, live=OTHER_HASH");
    pointerUnchanged(s);
  }
  {
    const s = storeWithPrior();
    const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: OTHER_HASH });
    assert(r.status === "published", "status");
    eq(r.pointerWrite, "written", "pointerWrite");
  }
  {
    const s = new MemoryStore();
    const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: "none" });
    assert(r.status === "published", "status");
  }
  {
    const s = new MemoryStore();
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: OTHER_HASH }), /stale-write guard/, "expect hash, live=none");
    assert(!s.objects.has(routingKey(HOST)), "routing key must not exist");
  }
  {
    const s = new MemoryStore();
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: "abc" }), /must be "none" or a 64-hex packageHash/, "invalid value");
  }
  {
    const s = new MemoryStore();
    await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
    const next = { siteId: SITE, packageHash: OTHER_HASH, buildInputId: "b".repeat(64), releaseId: "interior-01-9.9.9-next", publishedAt: "2026-09-22T00:00:00.000Z" };
    const fakeSeal = { ...plan.seal, packageHash: OTHER_HASH };
    s.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode(JSON.stringify(fakeSeal)), meta: { contentType: "application/json", cacheControl: "no-store" } });
    const first = JSON.parse(Buffer.from(s.objects.get(routingKey(HOST))!.body).toString("utf8"));
    const curPtr = { schemaVersion: 1, hostname: HOST, ...next, previous: { siteId: SITE, packageHash: first.packageHash, buildInputId: first.buildInputId, releaseId: first.releaseId, publishedAt: first.publishedAt } };
    s.objects.set(routingKey(HOST), { body: new TextEncoder().encode(JSON.stringify(curPtr)), meta: { contentType: "application/json", cacheControl: "no-store" } });
    const before = Buffer.from(s.objects.get(routingKey(HOST))!.body);
    await rejects(rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, expectLivePackageHash: "none" }), /stale-write guard/, "rollback expectLive mismatch");
    eq(Buffer.compare(before, Buffer.from(s.objects.get(routingKey(HOST))!.body)), 0, "pointer byte-identical");
  }
});

await check("P5 activate:false: uploads+seals but the routing pointer is untouched either way; a later normal publish only switches the pointer", async () => {
  const s = new MemoryStore();
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, activate: false });
  assert(r.status === "uploaded", "status");
  eq([r.upload, r.uploaded, r.verified], ["uploaded", plan.files.length, plan.files.length], "counts");
  eq(s.writes.length, plan.files.length + 1, "writes = files + seal, no pointer");
  eq(s.writes[s.writes.length - 1], plan.sealKey, "seal is the last write");
  assert(!s.objects.has(routingKey(HOST)), "routing key must not exist (empty store)");

  const sp = storeWithPrior();
  const rp = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: sp, now: T0, activate: false });
  assert(rp.status === "uploaded", "status (prior)");
  pointerUnchanged(sp);

  const w = s.writes.length;
  const r2 = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  assert(r2.status === "published", "status");
  eq([r2.upload, r2.uploaded, r2.pointerWrite], ["skipped-sealed", 0, "written"], "follow-up publish");
  eq(s.writes.length - w, 1, "exactly one new write");
  eq(s.writes[s.writes.length - 1], routingKey(HOST), "the new write is the routing key");
});

await check("P5b activate:false combined with expectLivePackageHash throws before any store access", async () => {
  const s = new MemoryStore();
  await rejects(
    publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, activate: false, expectLivePackageHash: "none" }),
    /cannot be combined with activate: false/,
    "activate:false + expectLivePackageHash",
  );
  eq(s.writes.length, 0, "writes");
});

await check("P6 reverify: sealed package read back file-by-file; missing or corrupted object → error, zero new writes, pointer byte-identical", async () => {
  const s = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  const w = s.writes.length;
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, reverify: true });
  assert(r.status === "published", "status");
  eq(r.verified, plan.files.length, "verified count");
  eq(s.writes.length - w, 0, "no new writes");

  const s2 = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s2, now: T0 });
  const victim = plan.files[3]!.key;
  s2.objects.delete(victim);
  const before2 = Buffer.from(s2.objects.get(routingKey(HOST))!.body);
  const w2 = s2.writes.length;
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s2, now: T0, reverify: true }), /reverify: sealed package is missing/, "missing object");
  eq(s2.writes.length - w2, 0, "no new writes (missing)");
  eq(Buffer.compare(before2, Buffer.from(s2.objects.get(routingKey(HOST))!.body)), 0, "pointer byte-identical (missing)");

  const s3 = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s3, now: T0 });
  const victim3 = plan.files[3]!.key;
  const obj3 = s3.objects.get(victim3)!;
  obj3.body[0] = obj3.body[0]! ^ 0xff;
  const before3 = Buffer.from(s3.objects.get(routingKey(HOST))!.body);
  const w3 = s3.writes.length;
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s3, now: T0, reverify: true }), /reverify:/, "corrupted object");
  eq(s3.writes.length - w3, 0, "no new writes (corrupted)");
  eq(Buffer.compare(before3, Buffer.from(s3.objects.get(routingKey(HOST))!.body)), 0, "pointer byte-identical (corrupted)");
});

// ── 3b'. guards added with the delivery contract: immutable-path stability, baked origin ──
console.log("\npublish: immutable-path stability + baked origin");
function putLiveSeal(s: MemoryStore, files: PackageSeal["files"]) {
  const seal: PackageSeal = { ...plan.seal, packageHash: OTHER_HASH, files };
  s.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode(JSON.stringify(seal)), meta: { contentType: "application/json", cacheControl: "no-store" } });
}
await check("G1 an immutable-cached path whose bytes differ from the LIVE package's seal → refused, pointer byte-identical (dry-run --check-store says the same, 0 writes)", async () => {
  const victim = plan.files.find((f) => f.cacheControl === CACHE_IMMUTABLE)!;
  const liveFiles = plan.seal.files.map((f) => (f.path === victim.path ? { ...f, sha256: "b".repeat(64) } : f));
  const s = storeWithPrior();
  putLiveSeal(s, liveFiles);
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /immutable-cached path/, "publish");
  pointerUnchanged(s);
  const d = storeWithPrior();
  putLiveSeal(d, liveFiles);
  const w = d.writes.length;
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: d, dryRun: true, checkStore: true, now: T0 }), /immutable-cached path/, "dry run");
  eq(d.writes.length, w, "dry-run writes");
});
await check("G2 a revalidate path that changed → published; a live package whose seal is missing or unreadable → REFUSED (fails closed), pointer byte-identical", async () => {
  const html = plan.files.find((f) => f.path === "index.html")!;
  const s = storeWithPrior();
  putLiveSeal(s, plan.seal.files.map((f) => (f.path === html.path ? { ...f, sha256: "c".repeat(64) } : f)));
  const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
  assert(r.status === "published" && r.pointerWrite === "written", "changed HTML is normal");
  const n = storeWithPrior();
  n.objects.delete(sealKey(SITE, OTHER_HASH));
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: n, now: T0 }), /seal cannot be read/, "no live seal");
  pointerUnchanged(n);
  const g = storeWithPrior();
  g.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode("{not json"), meta: { contentType: "application/json", cacheControl: "no-store" } });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: g, now: T0 }), /seal cannot be read/, "garbage live seal");
  pointerUnchanged(g);
});
await check("G4 sealed-skip never activates a package that lost index.html / 404.html (review R7): refused, pointer byte-identical; reverify names the first missing object", async () => {
  for (const name of ["index.html", "404.html"]) {
    const s = new MemoryStore();
    const up = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, activate: false });
    assert(up.status === "uploaded", "uploaded");
    s.objects.delete(packageKey(SITE, plan.packageHash, name));
    const w = s.writes.length;
    await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /sealed package is incomplete/, name);
    eq([s.writes.length - w, s.objects.has(routingKey(HOST))], [0, false], `${name}: no write, no pointer`);
  }
  const d = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: d, now: T0, activate: false });
  const o = d.objects.get(packageKey(SITE, plan.packageHash, "index.html"))!;
  o.body[0] = o.body[0]! ^ 0xff;
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: d, now: T0 }), /sealed package is damaged/, "damaged index.html");
  assert(!d.objects.has(routingKey(HOST)), "no pointer");
});
await check("G5 expectLivePackageHash is checked BEFORE anything is uploaded (review R8): a stale expectation leaves the store with zero writes", async () => {
  const s = storeWithPrior();
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0, expectLivePackageHash: "none" }), /stale-write guard/, "stale");
  eq(s.writes.length, 0, "writes");
  pointerUnchanged(s);
});
await check("G6 pointer hygiene: a pointer stored under this host's key that names ANOTHER hostname is never overwritten; checkStore without dryRun is refused; rollback onto a corrupt previous seal is refused by name (review N1 / R9)", async () => {
  const s = new MemoryStore();
  const alien = new TextEncoder().encode(JSON.stringify({ ...priorPointer, hostname: "someone-else.example" }));
  s.objects.set(routingKey(HOST), { body: alien, meta: { contentType: "application/json", cacheControl: "no-store" } });
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 }), /not this host's/, "alien pointer");
  eq(Buffer.compare(Buffer.from(s.objects.get(routingKey(HOST))!.body), Buffer.from(alien)), 0, "alien pointer bytes");
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: new MemoryStore(), now: T0, checkStore: true }), /checkStore is a dry-run option/, "checkStore without dryRun");
  const r = new MemoryStore();
  await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: r, now: T0 });
  const cur = JSON.parse(Buffer.from(r.objects.get(routingKey(HOST))!.body).toString("utf8"));
  const withPrev = new TextEncoder().encode(JSON.stringify({ ...cur, previous: { siteId: SITE, packageHash: OTHER_HASH, buildInputId: "b".repeat(64), releaseId: "x", publishedAt: "2026-09-20T00:00:00.000Z" } }));
  r.objects.set(routingKey(HOST), { body: withPrev, meta: { contentType: "application/json", cacheControl: "no-store" } });
  r.objects.set(sealKey(SITE, OTHER_HASH), { body: new TextEncoder().encode("{broken"), meta: { contentType: "application/json", cacheControl: "no-store" } });
  await rejects(rollbackHost({ store: r, siteId: SITE, hostname: HOST, now: T0 }), /no valid seal in the store/, "corrupt previous seal");
  eq(Buffer.compare(Buffer.from(r.objects.get(routingKey(HOST))!.body), Buffer.from(withPrev)), 0, "pointer bytes after refused rollback");
});
await check("G3 baked origin: plan reports it; a host that is not that origin → warning, and a refusal before any store access with requireOriginMatch", async () => {
  const robots = await readFile(path.join(packageDir, "site/robots.txt"), "utf8");
  const origin = /^Sitemap:\s*(https?:\/\/[^/\s]+)\//im.exec(robots)![1]!;
  eq(plan.bakedOrigin, origin, "bakedOrigin");
  assert(plan.warnings.some((w) => w.includes(origin)), "mismatch warning for the test host");
  let calls = 0;
  const spy: ObjectStore = { description: "spy", put: async () => void calls++, get: async () => (calls++, null) };
  await rejects(publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: spy, requireOriginMatch: true, now: T0 }), /was built for/, "refused");
  eq(calls, 0, "store calls");
  const matching = await planPublish({ repoRoot, siteId: SITE, hostname: new URL(origin).hostname, requireOriginMatch: true });
  eq(matching.warnings.filter((w) => w.includes("was built for")), [], "no warning when the host is the baked origin");
});

// ── 3b''. rollback portfolio-truth guard: an older package must not re-expose removed records ──
console.log("\nrollback: portfolio-truth guard (production truth)");
if (SITE === "boost-interior-demo") {
  const JSON_META = { contentType: "application/json", cacheControl: "no-store" };
  const enc = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
  const routing = routingKey(HOST);
  /** the old live package of the owner policy: 19 records incl. TEST_ONLY bi-09 … bi-19 (build 71f7e5f3…) */
  const PKG19 = { packageHash: "77cc7f9f47adda09d119c6ec5a02626624b4e068b546e15185d39c1658bdbda0", buildInputId: "71f7e5f3d1a1f6e7773153a1ec091e66b5cfd7d47687af16e94a5ef3c2379407", releaseId: "interior-01-1.6.1-8da56de8d28f" };
  const refFor = (p: { packageHash: string; buildInputId: string; releaseId: string }, publishedAt = "2026-09-20T00:00:00.000Z") => ({ siteId: SITE, packageHash: p.packageHash, buildInputId: p.buildInputId, releaseId: p.releaseId, publishedAt });
  /** seal a crafted package: every file stored under its key, seal listing exactly those bytes */
  function sealCrafted(s: MemoryStore, packageHash: string, files: Record<string, Uint8Array>) {
    const sealFiles = Object.entries(files).map(([rel, body]) => {
      const hash = sha256(body);
      s.objects.set(packageKey(SITE, packageHash, rel), { body, meta: { contentType: contentTypeFor(rel)!, cacheControl: cachePolicyFor(rel, hash).cacheControl } });
      return { path: rel, size: body.length, sha256: hash, contentType: contentTypeFor(rel)!, cacheControl: cachePolicyFor(rel, hash).cacheControl };
    });
    const seal: PackageSeal = { ...plan.seal, packageHash, buildInputId: "c".repeat(64), fileCount: sealFiles.length, bytes: sealFiles.reduce((n, f) => n + f.size, 0), files: sealFiles };
    s.objects.set(sealKey(SITE, packageHash), { body: sealBytes(seal), meta: JSON_META });
  }
  /** a portfolio-backed crafted package whose document serves exactly `ids` */
  function sealPortfolio(s: MemoryStore, packageHash: string, ids: string[]) {
    const docPath = "_integration/portfolio.crafted.json";
    const manifest = { schemaVersion: "0.1", site: { id: SITE, publicOrigin: "https://demo.test.example", locale: "ko-KR" }, resources: { portfolio: { href: `/${docPath}`, version: "crafted" } } };
    sealCrafted(s, packageHash, { "index.html": enc("<!doctype html>"), "404.html": enc("<!doctype html>"), "_integration/manifest.json": enc(manifest), [docPath]: enc({ resource: "portfolio", records: ids.map((id) => ({ id })) }) });
  }
  /** the real 19-record integration documents (QA golden = byte-identical to build 71f7e5f3…'s _integration/) sealed as PKG19 */
  async function sealPkg19(s: MemoryStore) {
    const manifest = await readFile(path.join(repoRoot, QA_GOLDEN_DIR, "manifest.json"));
    const doc = await readFile(path.join(repoRoot, QA_GOLDEN_DIR, `portfolio.${QA_GOLDEN_VERSION}.json`));
    eq([sha256(manifest), sha256(doc)], [QA_GOLDEN_MANIFEST_SHA256, QA_GOLDEN_DOC_SHA256], "QA golden = the frozen 19-record bytes");
    eq(JSON.parse(manifest.toString("utf8")).resources.portfolio.href, `/_integration/portfolio.${QA_GOLDEN_VERSION}.json`, "manifest names the document");
    const index = s.objects.get(packageKey(SITE, plan.packageHash, "index.html"))!.body;
    const nf = s.objects.get(packageKey(SITE, plan.packageHash, "404.html"))!.body;
    sealCrafted(s, PKG19.packageHash, { "index.html": index, "404.html": nf, "_integration/manifest.json": manifest, [`_integration/portfolio.${QA_GOLDEN_VERSION}.json`]: doc });
    const sealed = JSON.parse(Buffer.from(s.objects.get(sealKey(SITE, PKG19.packageHash))!.body).toString("utf8")) as PackageSeal;
    s.objects.set(sealKey(SITE, PKG19.packageHash), { body: sealBytes({ ...sealed, buildInputId: PKG19.buildInputId, releaseId: PKG19.releaseId }), meta: JSON_META });
  }
  /** live = the real current package (published), previous = `prev` */
  async function liveWithPrevious(s: MemoryStore, prev: { packageHash: string; buildInputId: string; releaseId: string }): Promise<Uint8Array> {
    await publishSite({ repoRoot, siteId: SITE, hostname: HOST, store: s, now: T0 });
    const cur = JSON.parse(Buffer.from(s.objects.get(routing)!.body).toString("utf8"));
    const bytes = enc({ ...cur, previous: refFor(prev) });
    s.objects.set(routing, { body: bytes, meta: JSON_META });
    return bytes;
  }
  const sameAs = (s: MemoryStore, bytes: Uint8Array) => assert(Buffer.compare(Buffer.from(s.objects.get(routing)!.body), Buffer.from(bytes)) === 0, "routing pointer bytes changed");
  /** records the keys put() is called with, then forwards */
  function putSpy(s: MemoryStore): ObjectStore & { puts: string[] } {
    const puts: string[] = [];
    return { description: "put-spy", puts, get: (k) => s.get(k), put: (k, b, m) => (puts.push(k), s.put(k, b, m)) };
  }
  async function refusal(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      assert(e instanceof PublishError, `not a PublishError: ${(e as Error).message}`);
      return e.message;
    }
    throw new Error("rollback did not fail");
  }
  const BI = (n: number) => `bi-${String(n).padStart(2, "0")}`;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => BI(a + i));

  /** the local 8-record build the site served before the current one (data/site-builds/<site>/previous.json), sealed via a temp repo */
  async function sealPreviousBuild(s: MemoryStore): Promise<{ packageHash: string; buildInputId: string; releaseId: string }> {
    const prev = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SITE, "previous.json"), "utf8")) as { buildInputId: string; packageDir: string };
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "recon-publish-prev-"));
    try {
      const dest = path.join(tmpRoot, "data/site-builds", SITE, "packages", prev.buildInputId);
      await cp(path.join(repoRoot, prev.packageDir), dest, { recursive: true });
      await writeFile(path.join(tmpRoot, "data/site-builds", SITE, "current.json"), JSON.stringify({ buildInputId: prev.buildInputId, packageDir: path.relative(tmpRoot, dest), finishedAt: "2026-09-20T00:00:00.000Z" }));
      const r = await publishSite({ repoRoot: tmpRoot, siteId: SITE, hostname: HOST, store: s, now: T0, activate: false });
      assert(r.status === "uploaded" && r.plan.packageHash !== plan.packageHash, "previous build sealed under its own packageHash");
      return { packageHash: r.plan.packageHash, buildInputId: r.plan.buildInputId, releaseId: r.plan.releaseId };
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  }

  await check("RT0 the authoritative served set of boost-interior-demo (buildSiteSnapshot public) is exactly bi-01 … bi-08", () => {
    eq([...SERVED_IDS].sort(), range(1, 8), "served ids");
  });

  await check("RT1 SABOTAGE (real bytes): live = real 8-record package, previous = the 19-record package 77cc7f9f… → refused naming bi-09 … bi-19 only; routing pointer bytes unchanged; put-spy sees ZERO routing-key writes (LIVE_POINTER_WRITTEN_DURING_SABOTAGE = NO)", async () => {
    const s = new MemoryStore();
    const before = await liveWithPrevious(s, PKG19);
    await sealPkg19(s);
    const spy = putSpy(s);
    const w = s.writes.length;
    const truth = truthLoader();
    const msg = await refusal(rollbackHost({ store: spy, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth }));
    assert(msg.startsWith(ROLLBACK_TRUTH_REFUSAL), `message prefix: ${msg}`);
    const named = msg.match(/\bbi-\d{2}\b/g) ?? [];
    eq([...new Set(named)].sort(), range(9, 19), "ids named = the 11 TEST_ONLY records, none of bi-01 … bi-08");
    assert(msg.includes("11 record id(s)") && msg.includes("77cc7f9f47adda09") && msg.includes("routing pointer NOT written") && msg.includes(ROLLBACK_TRUTH_RUNBOOK) && msg.includes(SERVED_SOURCE), "message: count, target, pointer, runbook, source");
    eq(truth.calls, 1, "authoritative data loaded once");
    eq(spy.puts.filter((k) => k === routing).length, 0, "routing-key puts during the attempt");
    eq([spy.puts.length, s.writes.length - w], [0, 0], "no store write at all");
    sameAs(s, before);
    console.log(`       LIVE_POINTER_WRITTEN_DURING_SABOTAGE = NO (routing-key puts: ${spy.puts.filter((k) => k === routing).length})`);
    console.log(`       refusal: ${msg}`);
  });

  await check("RT2 NORMAL: live = real current 8-record package, previous = the real previous 8-record build → rolled back exactly as before (pointer re-pointed, previous swapped, one write), loader called once; rolling forward again passes too", async () => {
    const s = new MemoryStore();
    const prev = await sealPreviousBuild(s);
    await liveWithPrevious(s, prev);
    const w = s.writes.length;
    const truth = truthLoader();
    const lines: string[] = [];
    const r = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth, log: (l) => lines.push(l) });
    eq([r.pointer.packageHash, r.pointer.previous?.packageHash, r.from.packageHash, s.writes.slice(w)], [prev.packageHash, plan.packageHash, plan.packageHash, [routing]], "rolled back");
    eq(truth.calls, 1, "loader calls");
    assert(lines.some((l) => /portfolio truth: rollback target ids ⊆ authoritative \(8\/8\)/.test(l)), `pass line logged: ${lines.join(" | ")}`);
    const again = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
    eq([again.pointer.packageHash, truth.calls], [plan.packageHash, 2], "rolled forward");
  });

  await check("RT3 a proper subset (target serves bi-01, bi-03 of the 8 authoritative ids) → allowed", async () => {
    const s = new MemoryStore();
    const sub = { packageHash: "d".repeat(64), buildInputId: "c".repeat(64), releaseId: "interior-01-subset" };
    await liveWithPrevious(s, sub);
    sealPortfolio(s, sub.packageHash, ["bi-03", "bi-01"]);
    const truth = truthLoader();
    const r = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
    eq([r.pointer.packageHash, truth.calls], [sub.packageHash, 1], "subset rollback");
  });

  await check("RT4 no portfolioTruth supplied + portfolio-backed target (even a truthful one) → refused, pointer untouched, zero writes; a loader that throws → refused (fails closed)", async () => {
    const s = new MemoryStore();
    const prev = await sealPreviousBuild(s);
    const before = await liveWithPrevious(s, prev);
    const w = s.writes.length;
    const msg = await refusal(rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0 }));
    assert(/serves a portfolio document \(8 records\) but no authoritative site data was supplied/.test(msg) && msg.includes("routing pointer NOT written"), `message: ${msg}`);
    await rejects(rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: async () => { throw new Error("projects.json unreadable"); } }), /could not load the site's current authoritative data .*projects\.json unreadable/, "throwing loader");
    eq(s.writes.length - w, 0, "writes");
    sameAs(s, before);
  });

  await check("RT5 target without _integration/manifest.json in its seal (or a manifest without a portfolio resource) → rolled back, loader NOT called", async () => {
    const plain = { packageHash: "e".repeat(64), buildInputId: "c".repeat(64), releaseId: "interior-01-plain" };
    const s = new MemoryStore();
    await liveWithPrevious(s, plain);
    sealCrafted(s, plain.packageHash, { "index.html": enc("<!doctype html>"), "404.html": enc("<!doctype html>") });
    const truth = truthLoader();
    const r = await rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
    eq([r.pointer.packageHash, truth.calls], [plain.packageHash, 0], "no manifest");
    const t = new MemoryStore();
    await liveWithPrevious(t, plain);
    sealCrafted(t, plain.packageHash, { "index.html": enc("<!doctype html>"), "404.html": enc("<!doctype html>"), "_integration/manifest.json": enc({ schemaVersion: "0.1", site: { id: SITE, publicOrigin: "https://x.example", locale: "ko-KR" }, resources: {} }) });
    const r2 = await rollbackHost({ store: t, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth });
    eq([r2.pointer.packageHash, truth.calls], [plain.packageHash, 0], "manifest without portfolio resource");
  });

  await check("RT6 fails closed on the target's documents: portfolio document bytes ≠ seal / manifest missing from the store / records not an id array → refused before the loader, pointer untouched, zero writes", async () => {
    const cases: [string, (s: MemoryStore) => void, RegExp][] = [
      ["corrupted portfolio document", (s) => {
        const o = s.objects.get(packageKey(SITE, PKG19.packageHash, `_integration/portfolio.${QA_GOLDEN_VERSION}.json`))!;
        o.body[10] = o.body[10]! ^ 0xff;
      }, /portfolio\.[0-9a-f]+\.json does not match its seal/],
      ["overwritten portfolio document (8 records, not sealed)", (s) => {
        s.objects.set(packageKey(SITE, PKG19.packageHash, `_integration/portfolio.${QA_GOLDEN_VERSION}.json`), { body: enc({ records: range(1, 8).map((id) => ({ id })) }), meta: JSON_META });
      }, /does not match its seal/],
      ["manifest missing", (s) => s.objects.delete(packageKey(SITE, PKG19.packageHash, "_integration/manifest.json")), /_integration\/manifest\.json is sealed but missing from the store/],
    ];
    for (const [label, sabotage, re] of cases) {
      const s = new MemoryStore();
      const before = await liveWithPrevious(s, PKG19);
      await sealPkg19(s);
      sabotage(s);
      const w = s.writes.length;
      const truth = truthLoader(range(1, 19)); // even an authority that would accept every id never gets asked
      await rejects(rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth }), re, label);
      eq([truth.calls, s.writes.length - w], [0, 0], `${label}: loader calls / writes`);
      sameAs(s, before);
    }
    const s = new MemoryStore();
    const bad = { packageHash: "f".repeat(64), buildInputId: "c".repeat(64), releaseId: "interior-01-bad" };
    const before = await liveWithPrevious(s, bad);
    sealCrafted(s, bad.packageHash, { "index.html": enc("<!doctype html>"), "_integration/manifest.json": enc({ resources: { portfolio: { href: "/_integration/p.json", version: "x" } } }), "_integration/p.json": enc({ records: [{ id: 7 }] }) });
    const truth = truthLoader();
    await rejects(rollbackHost({ store: s, siteId: SITE, hostname: HOST, now: T0, portfolioTruth: truth }), /no records array of objects with a string id/, "records without string ids");
    eq(truth.calls, 0, "loader calls (bad records)");
    sameAs(s, before);
  });
} else {
  console.log(`  skip rollback portfolio-truth guard (boost-interior-demo only; PUBLISH_TEST_SITE=${SITE})`);
}

// ── 3c. P7: invalid build input fails closed, before any store write ─────────
console.log("\npublish: invalid build input (fails closed)");
const FIXTURE_SITE = "fixture-empty";
const FAKE_BUILD_INPUT_ID = "0123456789abcdef".repeat(4);
async function makeTempFixtureRepo(edits: {
  dirBuildInputId?: string;
  currentJsonBuildInputId?: string;
  recordPatch?: (r: any) => unknown;
  corruptFile?: string;
  removeFile?: string;
}): Promise<{ tmpRoot: string; cleanup: () => Promise<void> }> {
  const srcCurrent = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", FIXTURE_SITE, "current.json"), "utf8"));
  const srcPackageDir = path.join(repoRoot, srcCurrent.packageDir);
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "recon-publish-p7-"));
  const dirBuildInputId = edits.dirBuildInputId ?? srcCurrent.buildInputId;
  const destPackageDir = path.join(tmpRoot, "data/site-builds", FIXTURE_SITE, "packages", dirBuildInputId);
  await cp(srcPackageDir, destPackageDir, { recursive: true });
  if (edits.recordPatch) {
    const recPath = path.join(destPackageDir, "build-record.json");
    const rec = JSON.parse(await readFile(recPath, "utf8"));
    await writeFile(recPath, JSON.stringify(edits.recordPatch(rec), null, 2));
  }
  if (edits.corruptFile) {
    const p = path.join(destPackageDir, "site", edits.corruptFile);
    const buf = await readFile(p);
    buf[0] = buf[0]! ^ 0xff;
    await writeFile(p, buf);
  }
  if (edits.removeFile) await rm(path.join(destPackageDir, "site", edits.removeFile));
  const currentJsonBuildInputId = edits.currentJsonBuildInputId ?? dirBuildInputId;
  await writeFile(
    path.join(tmpRoot, "data/site-builds", FIXTURE_SITE, "current.json"),
    JSON.stringify({ buildInputId: currentJsonBuildInputId, packageDir: path.relative(tmpRoot, destPackageDir), finishedAt: srcCurrent.finishedAt }, null, 2),
  );
  return { tmpRoot, cleanup: () => rm(tmpRoot, { recursive: true, force: true }) };
}
async function expectRefused(edits: Parameters<typeof makeTempFixtureRepo>[0], re: RegExp, label: string) {
  const { tmpRoot, cleanup } = await makeTempFixtureRepo(edits);
  try {
    const s = new MemoryStore();
    await rejects(publishSite({ repoRoot: tmpRoot, siteId: FIXTURE_SITE, hostname: "fixture-test.example", store: s, now: T0 }), re, label);
    eq(s.writes.length, 0, `${label}: writes`);
  } finally {
    await cleanup();
  }
}

await check("P7a build-record status \"failed\" → not publishable, zero writes", async () => {
  await expectRefused({ recordPatch: (r) => ({ ...r, status: "failed" }) }, /not publishable/, "status failed");
});
await check("P7b build-record qa.pass false → refused, zero writes", async () => {
  await expectRefused({ recordPatch: (r) => ({ ...r, qa: { ...r.qa, pass: false } }) }, /not publishable/, "qa.pass false");
});
await check("P7c current.json buildInputId not schema-valid (\"xyz\") → throws, zero writes", async () => {
  await expectRefused({ currentJsonBuildInputId: "xyz" }, /./, "invalid buildInputId");
});
await check("P7d build-record buildInputId ≠ current.json buildInputId → refused, zero writes", async () => {
  await expectRefused({ dirBuildInputId: FAKE_BUILD_INPUT_ID }, /buildInputId ≠ current\.json buildInputId/, "buildInputId mismatch");
});
await check("P7e a file changed inside site/ → refused by packageIntact, zero writes", async () => {
  await expectRefused({ corruptFile: "index.html" }, /do not hash/, "corrupted site file");
});
await check("P7f a package without 404.html / index.html → refused by name (the runtime needs both), zero writes", async () => {
  await expectRefused({ removeFile: "404.html" }, /no 404\.html/, "no 404.html");
  await expectRefused({ removeFile: "index.html" }, /no index\.html/, "no index.html");
});

// ── 4. runtime handler over the published objects ────────────────────────────
console.log("\nrecon-runtime handler (fake R2 over the published memory store)");
function bucketOf(s: MemoryStore): R2BucketLike {
  const obj = (key: string) => {
    const o = s.objects.get(key);
    if (!o) return null;
    const etag = `"${createHash("md5").update(o.body).digest("hex")}"`;
    return { size: o.body.length, httpEtag: etag, httpMetadata: { contentType: o.meta.contentType, cacheControl: o.meta.cacheControl }, body: o.body };
  };
  return {
    async get(key) {
      const o = obj(key);
      if (!o) return null;
      return { ...o, body: new Blob([new Uint8Array(o.body)]).stream(), text: async () => Buffer.from(o.body).toString("utf8") } as R2ObjectBodyLike;
    },
    async head(key) {
      const o = obj(key);
      return o && { size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata };
    },
  };
}
const env: Env = { SITES: bucketOf(published!) };
const req = (p: string, init: RequestInit & { host?: string } = {}) => handle(new Request(`https://${init.host ?? HOST}${p}`, init), env);
function urlFor(rel: string): string | undefined {
  if (rel === "index.html") return "/";
  if (rel === "404.html" || rel === "_not-found.html") return undefined;
  return `/${rel.endsWith(".html") ? rel.slice(0, -5) : rel}`;
}

await check("every addressable package file: 200, stored content-type + cache-control, ETag, bytes identical", async () => {
  let n = 0;
  for (const f of plan.files) {
    const u = urlFor(f.path);
    if (!u) continue;
    const r = await req(u);
    const body = new Uint8Array(await r.arrayBuffer());
    eq([r.status, r.headers.get("content-type"), r.headers.get("cache-control"), r.headers.get("x-content-type-options")], [200, f.contentType, f.cacheControl, "nosniff"], u);
    assert(r.headers.get("etag"), `${u}: etag`);
    eq([body.length, sha256(body)], [f.size, f.sha256], `${u} bytes`);
    n++;
  }
  eq(n, plan.files.length - 2, "addressable = all but 404.html and _not-found.html");
});

await check("unknown path → 404 with the package's 404.html bytes, no-store, no ETag; HEAD same status, no body", async () => {
  const nf = plan.files.find((f) => f.path === "404.html")!;
  for (const p of ["/does-not-exist", "/about.html", "/about/", "/_package.json", "/portfolio/no-such-project"]) {
    const r = await req(p);
    const body = new Uint8Array(await r.arrayBuffer());
    eq([r.status, sha256(body), r.headers.get("cache-control"), r.headers.get("etag")], [404, nf.sha256, "no-store", null], p);
  }
  const h = await req("/does-not-exist", { method: "HEAD" });
  eq([h.status, (await h.arrayBuffer()).byteLength, h.headers.get("content-type")], [404, 0, "text/html; charset=utf-8"], "HEAD 404");
});

await check("HEAD: headers + Content-Length, empty body; If-None-Match → 304 (strong, weak, list, *), mismatch → 200", async () => {
  const r = await req("/", { method: "HEAD" });
  const idx = plan.files.find((f) => f.path === "index.html")!;
  eq([r.status, r.headers.get("content-length"), (await r.arrayBuffer()).byteLength], [200, String(idx.size), 0], "HEAD");
  const etag = r.headers.get("etag")!;
  for (const inm of [etag, `W/${etag}`, `"x", ${etag}`, "*"]) {
    const c = await req("/", { headers: { "If-None-Match": inm } });
    eq([c.status, (await c.arrayBuffer()).byteLength, c.headers.get("etag")], [304, 0, etag], inm);
  }
  eq((await req("/", { headers: { "If-None-Match": '"nope"' } })).status, 200, "mismatch");
});

await check("POST/PUT/DELETE/OPTIONS → 405 with Allow: GET, HEAD", async () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    const r = await req("/", { method });
    eq([r.status, r.headers.get("allow")], [405, "GET, HEAD"], method);
  }
});

await check("unknown host → plain 404 (no fallback site); malformed request path → 400", async () => {
  const r = await req("/", { host: "unknown.test.example" });
  eq([r.status, await r.text()], [404, "unknown host\n"], "unknown host");
  eq((await req("/a%2Fb")).status, 400, "encoded slash");
  eq((await req("/%E0%A4%A")).status, 400, "bad escape");
});

await check("corrupt routing pointer → 500, never another site", async () => {
  const s = new MemoryStore();
  s.objects.set(routingKey("broken.test.example"), { body: new TextEncoder().encode('{"schemaVersion":1,"hostname":"other"}'), meta: { contentType: "application/json", cacheControl: "no-store" } });
  const r = await handle(new Request("https://broken.test.example/"), { SITES: bucketOf(s) });
  eq(r.status, 500, "status");
});

await check("seal bytes are deterministic (skip decision is stable across runs)", async () => {
  const again = await planPublish({ repoRoot, siteId: SITE, hostname: HOST });
  eq(sha256(sealBytes(again.seal)), sha256(sealBytes(plan.seal)), "seal hash");
});

// ── 4b. adversarial paths / pointer switching / package-missing / trailing-dot host / logging ──
console.log("\nrecon-runtime: security / logging (synthetic fake R2, recorded keys)");

class RecordingBucket implements R2BucketLike {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string; cacheControl: string }>();
  readonly recorded: string[] = [];
  throwOnGet?: (key: string) => boolean;
  set(key: string, body: Uint8Array | string, contentType = "text/html; charset=utf-8", cacheControl = "public, max-age=0, must-revalidate") {
    this.objects.set(key, { body: typeof body === "string" ? new TextEncoder().encode(body) : body, contentType, cacheControl });
  }
  private meta(key: string): R2ObjectLike | null {
    const o = this.objects.get(key);
    if (!o) return null;
    return { size: o.body.length, httpEtag: `"${createHash("md5").update(o.body).digest("hex")}"`, httpMetadata: { contentType: o.contentType, cacheControl: o.cacheControl } };
  }
  async get(key: string): Promise<R2ObjectBodyLike | null> {
    this.recorded.push(key);
    if (this.throwOnGet?.(key)) throw new Error("injected R2 get failure");
    const m = this.meta(key);
    if (!m) return null;
    const o = this.objects.get(key)!;
    return { ...m, body: new Blob([new Uint8Array(o.body)]).stream(), text: async () => Buffer.from(o.body).toString("utf8") };
  }
  async head(key: string): Promise<R2ObjectLike | null> {
    this.recorded.push(key);
    return this.meta(key);
  }
}
function pointerBytes(host: string, siteId: string, hash: string, buildInputId = "2".repeat(64)): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, hostname: host, siteId, packageHash: hash, buildInputId, releaseId: "r-1", publishedAt: "2026-09-21T00:00:00.000Z" }));
}

await check("P8 adversarial paths: never 200/500; every R2 key touched is this host's own pointer or safely nested under the package prefix (no real '..' segment, never the seal)", async () => {
  const PHOST = "diag.test.example";
  const PSITE = "diag-site";
  const PHASH = "1".repeat(64);
  const b = new RecordingBucket();
  b.set(routingKey(PHOST), pointerBytes(PHOST, PSITE, PHASH), "application/json", "no-store");
  b.set(packageKey(PSITE, PHASH, "index.html"), "<html>index</html>");
  b.set(packageKey(PSITE, PHASH, "404.html"), "<html>404</html>");
  const penv: Env = { SITES: b };
  const prefix = `sites/${PSITE}/packages/${PHASH}/`;
  const ADV = [
    "/%2e%2e/x",
    "/..%2f..%2fx",
    "/%252e%252e/%252e%252e/routing/other.json",
    "/%00",
    "/a%00b",
    "/%5c..%5cx",
    "//evil.example/x",
    "///x",
    "/..;/x",
    "/%C0%AE%C0%AE/x",
    "/%E0%A4%A",
    "/_package.json",
    "/%5Fpackage.json",
    `/routing/${PHOST}.json`,
    "/a/../../../x.js",
    `/sites/other-site/packages/${"3".repeat(64)}/index.html`,
  ];
  for (const p of ADV) {
    const before = b.recorded.length;
    const r = await handle(new Request(`https://${PHOST}${p}`), penv);
    assert(r.status === 400 || r.status === 404, `${p}: status ${r.status}`);
    for (const k of b.recorded.slice(before)) {
      // the third known namespace: this site's own portfolio overlay pointer (absent here → package behaviour)
      const ok = k === routingKey(PHOST) || k === portfolioCurrentKey(PSITE, PHASH) || k.startsWith(prefix);
      assert(ok, `${p}: key escaped known namespaces: ${k}`);
      if (k.startsWith(prefix)) {
        const rest = k.slice(prefix.length);
        assert(!rest.split("/").includes(".."), `${p}: key has a real ".." segment: ${k}`);
        assert(rest !== "_package.json", `${p}: key exposes the seal: ${k}`);
      }
    }
  }
});

await check("resolvePath called directly (bypassing URL normalisation): dot segments / backslash / no leading slash → never kind \"key\" with a \"..\" segment; double-encoded %252e%252e decodes exactly once", () => {
  for (const p of ["/../x", "/a/../../x", "/a\\..\\x", "x", "", "/%2E%2E/%2E%2E/x"]) {
    const r = resolvePath(p);
    assert(!(r.kind === "key" && r.key.split("/").includes("..")), `${JSON.stringify(p)}: resolved to a ".." key`);
  }
  eq(resolvePath("/%252e%252e/x"), { kind: "key", key: "%2e%2e/x.html" }, "double-encoded stays literal, never collapses to ..");
});

await check("P9 pointer switch changes what is served immediately; old package stays addressable; other hosts/sites unaffected throughout", async () => {
  const PSITE = "site-ab";
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const PHOST = "pointer-switch.test.example";
  const SITE2 = "site-cd";
  const Y = "c".repeat(64);
  const HOST2 = "other-pointer.test.example";
  const b = new RecordingBucket();
  b.set(packageKey(PSITE, A, "index.html"), "A-index");
  b.set(packageKey(PSITE, A, "404.html"), "A-404");
  b.set(packageKey(PSITE, A, "about.html"), "A-about");
  b.set(packageKey(PSITE, B, "index.html"), "B-index");
  b.set(packageKey(PSITE, B, "404.html"), "B-404");
  b.set(packageKey(PSITE, B, "about.html"), "B-about");
  b.set(packageKey(SITE2, Y, "index.html"), "Y-index");
  b.set(packageKey(SITE2, Y, "404.html"), "Y-404");
  b.set(routingKey(HOST2), pointerBytes(HOST2, SITE2, Y));
  b.set(routingKey(PHOST), pointerBytes(PHOST, PSITE, A));
  const penv: Env = { SITES: b };
  async function get(host: string, p: string) {
    const before = b.recorded.length;
    const r = await handle(new Request(`https://${host}${p}`), penv);
    return { text: await r.text(), keys: b.recorded.slice(before) };
  }
  eq((await get(PHOST, "/")).text, "A-index", "A serves /");
  eq((await get(PHOST, "/about")).text, "A-about", "A serves /about");
  const other1 = await get(HOST2, "/");
  eq(other1.text, "Y-index", "other host unaffected during A");
  assert(other1.keys.every((k) => !k.startsWith(`sites/${PSITE}/`)), "host Y never reads under site X's prefix");

  b.set(routingKey(PHOST), pointerBytes(PHOST, PSITE, B));
  eq((await get(PHOST, "/")).text, "B-index", "the very next request after the switch serves B (no stale cache)");
  assert(b.objects.has(packageKey(PSITE, A, "index.html")) && b.objects.has(packageKey(PSITE, A, "about.html")), "A's keys are still in the store");

  b.set(routingKey(PHOST), pointerBytes(PHOST, PSITE, A));
  eq((await get(PHOST, "/")).text, "A-index", "pointer back to A serves A again");

  const other2 = await get(HOST2, "/");
  eq(other2.text, "Y-index", "other host still unaffected after the flips");
  assert(other2.keys.every((k) => !k.startsWith(`sites/${PSITE}/`)), "host Y still never reads site X's prefix");
});

await check("R1 a path whose R2 key would exceed 1024 bytes is a MISS (404 + the package's 404 page), never a thrown 500; R2 is never asked for the over-long key; the logged path is capped", async () => {
  const b = new RecordingBucket();
  const H = "long-path.test.example";
  const hash = "7".repeat(64);
  b.set(routingKey(H), pointerBytes(H, "site-l", hash));
  b.set(packageKey("site-l", hash, "404.html"), "<h1>nf</h1>");
  // what real R2 does with such a key
  b.throwOnGet = (key) => new TextEncoder().encode(key).length > 1024;
  const penv: Env = { SITES: b };
  for (const n of [900, 1000, 2000, 5000]) {
    for (const p of [`/${"a".repeat(n)}.js`, `/${"a".repeat(n)}`, `/${"가".repeat(n)}.js`]) {
      const r = await handle(new Request(`https://${H}${p}`), penv);
      eq([r.status, await r.text()], [404, "<h1>nf</h1>"], `${p.slice(0, 12)}… (${n})`);
    }
  }
  assert(b.recorded.every((k) => new TextEncoder().encode(k).length <= 1024), "an over-long key reached R2");
  const lines: string[] = [];
  const original = console.log;
  console.log = (l: string) => void lines.push(l);
  try {
    await runtimeDefault.fetch(new Request(`https://${H}/${"z".repeat(4000)}.js`), penv);
  } finally {
    console.log = original;
  }
  const line = JSON.parse(lines.find((l) => l.includes("recon-runtime"))!);
  eq([line.status, line.outcome, line.path.length <= 256], [404, "not-found", true], "log line");
});
await check("P10 package-missing: valid pointer, no objects under its prefix at all → 503 'package unavailable', no-store, empty HEAD body", async () => {
  const b = new RecordingBucket();
  const H = "package-missing.test.example";
  b.set(routingKey(H), pointerBytes(H, "site-z", "9".repeat(64)));
  const penv: Env = { SITES: b };
  const r1 = await handle(new Request(`https://${H}/`), penv);
  eq([r1.status, await r1.text(), r1.headers.get("cache-control")], [503, "package unavailable\n", "no-store"], "GET /");
  const r2 = await handle(new Request(`https://${H}/nope`), penv);
  eq(r2.status, 503, "GET /nope");
  const r3 = await handle(new Request(`https://${H}/`, { method: "HEAD" }), penv);
  eq([r3.status, (await r3.arrayBuffer()).byteLength], [503, 0], "HEAD /");
});

await check("P11 trailing-dot host resolves the same pointer as the bare host; requestHost unit check", async () => {
  const b = new RecordingBucket();
  const H = "trailing-dot.test.example";
  const HASH2 = "4".repeat(64);
  b.set(routingKey(H), pointerBytes(H, "site-td", HASH2));
  b.set(packageKey("site-td", HASH2, "index.html"), "hello");
  b.set(packageKey("site-td", HASH2, "404.html"), "404");
  const penv: Env = { SITES: b };
  const a = await handle(new Request(`https://${H}/`), penv);
  const dotted = await handle(new Request(`https://${H}./`), penv);
  eq([a.status, await a.text()], [200, "hello"], "no dot");
  eq([dotted.status, await dotted.text()], [200, "hello"], "trailing dot");
  eq(requestHost(new URL(`http://${H}./x`)), H, "requestHost strips one trailing FQDN dot");
  eq(requestHost(new URL(`http://${H.toUpperCase()}/x`)), H, "requestHost lowercases");
});

await check("P12 logTrace: one JSON line with the documented fields on ≥400, none on success unless LOG_ALL; default export never logs the query string; R2 failure → 500 + internal-error trace", async () => {
  const b = new RecordingBucket();
  const H = "logging.test.example";
  const PSITE = "log-site";
  const PHASH = "5".repeat(64);
  b.set(routingKey(H), pointerBytes(H, PSITE, PHASH));
  b.set(packageKey(PSITE, PHASH, "index.html"), "hi");
  b.set(packageKey(PSITE, PHASH, "404.html"), "404");
  const penv: Env = { SITES: b };

  {
    const req = new Request(`https://${H}/nope`);
    const trace = newTrace(req);
    await handle(req, penv, trace);
    const lines: string[] = [];
    logTrace(penv, trace, (l) => lines.push(l));
    eq(lines.length, 1, "one line on 404");
    const parsed = JSON.parse(lines[0]!);
    eq(
      [parsed.evt, parsed.host, parsed.path, parsed.method, parsed.status, parsed.outcome, parsed.siteId, parsed.packageHash, parsed.key],
      ["recon-runtime", H, "/nope", "GET", 404, "not-found", PSITE, PHASH, "nope.html"],
      "404 line fields",
    );
  }
  {
    const req = new Request(`https://${H}/`);
    const trace = newTrace(req);
    await handle(req, penv, trace);
    const lines: string[] = [];
    logTrace(penv, trace, (l) => lines.push(l));
    eq(lines.length, 0, "no line on 200 without LOG_ALL");
  }
  {
    const req = new Request(`https://${H}/`);
    const trace = newTrace(req);
    await handle(req, penv, trace);
    const lines: string[] = [];
    logTrace({ LOG_ALL: "1" }, trace, (l) => lines.push(l));
    eq(lines.length, 1, "one line on 200 with LOG_ALL");
  }
  {
    const origLog = console.log;
    const captured: string[] = [];
    console.log = (...a: unknown[]) => captured.push(a.map(String).join(" "));
    try {
      await runtimeDefault.fetch(new Request(`https://${H}/nope?token=SECRET123`), penv);
    } finally {
      console.log = origLog;
    }
    eq(captured.length, 1, "one captured line");
    assert(!captured[0]!.includes("SECRET123"), "query string leaked into the log");
    eq((JSON.parse(captured[0]!) as { path: string }).path, "/nope", "path has no query string");
  }
  {
    const b2 = new RecordingBucket();
    b2.throwOnGet = () => true;
    b2.set(routingKey(H), pointerBytes(H, PSITE, PHASH));
    const env2: Env = { SITES: b2 };
    const origLog = console.log;
    const captured: string[] = [];
    console.log = (...a: unknown[]) => captured.push(a.map(String).join(" "));
    let status: number;
    let text: string;
    try {
      const r = await runtimeDefault.fetch(new Request(`https://${H}/`), env2);
      status = r.status;
      text = await r.text();
    } finally {
      console.log = origLog;
    }
    eq([status!, text!], [500, "internal error\n"], "R2 throw → 500");
    eq(captured.length, 1, "one captured line");
    const parsed = JSON.parse(captured[0]!);
    eq([parsed.outcome, parsed.status, typeof parsed.error], ["internal-error", 500, "string"], "internal-error trace");
  }
});

// ── 4c. P14: site:publish CLI (spawned, no shell) ─────────────────────────────
console.log("\nsite:publish CLI (spawned, no shell)");
const stateDir = path.join(repoRoot, "tmp/recon-runtime-state");
function runCli(args: string[], envOverrides: Record<string, string | undefined> = {}): { status: number | null; stdout: string; stderr: string; createdStateDir: boolean } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const before = existsSync(stateDir);
  const r = spawnSync(
    path.join(repoRoot, "node_modules/.bin/tsx"),
    ["--tsconfig", "platform/tsconfig.json", path.join(repoRoot, "platform/cli/site-publish.ts"), ...args],
    { cwd: repoRoot, env, encoding: "utf8" },
  );
  const createdStateDir = !before && existsSync(stateDir);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, createdStateDir };
}

await check("P14 --dry-run twice: exit 0, byte-identical stdout, contains packageHash/bucket/routingKey, no machine-absolute path, never creates tmp/recon-runtime-state", () => {
  const a = runCli(["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run"]);
  const b = runCli(["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run"]);
  eq([a.status, b.status], [0, 0], "exit codes");
  eq(a.stdout, b.stdout, "byte-identical stdout");
  assert(a.stdout.includes(plan.packageHash), "packageHash present");
  assert(a.stdout.includes("boost-sites-artifacts"), "bucket present");
  assert(a.stdout.includes("routing/demo.example.json"), "routing key present");
  assert(!a.stdout.includes(repoRoot), "no repo root path leaked");
  assert(!a.stdout.includes(os.tmpdir()), "no os.tmpdir() path leaked");
  assert(!a.createdStateDir && !b.createdStateDir, "tmp/recon-runtime-state must not be created");
});

await check("P14 --remote --dry-run (offline, no store): refused while the package is built for another origin; --allow-origin-mismatch lets the plan through; --check-store --local on a state dir that does not exist creates nothing", () => {
  const base = ["--site", "boost-interior-demo", "--host", "demo.example", "--remote", "--dry-run"];
  const refused = runCli(base, { RECON_PUBLISH_ALLOW_REMOTE: undefined });
  assert(refused.status === 1 && /was built for/.test(refused.stderr) && !/"status": "dry-run"/.test(refused.stdout), `origin mismatch must fail the remote dry run (exit ${refused.status})`);
  const allowed = runCli([...base, "--allow-origin-mismatch"], { RECON_PUBLISH_ALLOW_REMOTE: undefined });
  assert(allowed.status === 0 && /"status": "dry-run"/.test(allowed.stdout) && /"storeCheck": null/.test(allowed.stdout), `override must plan offline (exit ${allowed.status})`);
  const fresh = "tmp/publish-test-no-such-state";
  assert(!existsSync(path.join(repoRoot, fresh)), "precondition");
  const local = runCli(["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run", "--check-store", "--local", "--persist-to", fresh]);
  assert(local.status === 0 && /"seal": "absent"/.test(local.stdout) && /"pointerAction": "write"/.test(local.stdout), `local check-store (exit ${local.status})`);
  assert(!existsSync(path.join(repoRoot, fresh)) && !local.createdStateDir, "a read-only look must not create local state");
});

// Each case names the refusal it must get: the demo is an adopted site (tracked portfolio.source.json), so a
// non-dry-run call that slipped past its own check would still exit 2 — on the manual-publish refusal below.
const REMOTE_GATE = /--remote reaches the live bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1/;
const USAGE_ERRORS: [string, string[], RegExp, Record<string, string | undefined>?][] = [
  ["--expect-live xyz", ["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run", "--expect-live", "xyz"], /--expect-live must be "none" or a 64-hex packageHash/],
  ["--check-store without --dry-run", ["--site", "boost-interior-demo", "--host", "demo.example", "--check-store"], /--check-store is a --dry-run option/],
  ["--concurrency abc", ["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run", "--concurrency", "abc"], /--concurrency must be a positive integer/],
  ["--bucket -bad", ["--site", "boost-interior-demo", "--host", "demo.example", "--dry-run", "--bucket", "-bad"], /is not a valid R2 bucket name/],
  ["--remote without RECON_PUBLISH_ALLOW_REMOTE", ["--site", "boost-interior-demo", "--host", "demo.example", "--remote"], REMOTE_GATE, { RECON_PUBLISH_ALLOW_REMOTE: undefined }],
  ["--remote --dry-run --check-store without RECON_PUBLISH_ALLOW_REMOTE (a live READ is gated too, review R6)", ["--site", "boost-interior-demo", "--host", "demo.example", "--remote", "--dry-run", "--check-store", "--allow-origin-mismatch"], REMOTE_GATE, { RECON_PUBLISH_ALLOW_REMOTE: undefined }],
  ["--no-activate --expect-live none", ["--site", "boost-interior-demo", "--host", "demo.example", "--no-activate", "--expect-live", "none"], /--expect-live guards the pointer write/],
];
await check(`P14 usage errors (${USAGE_ERRORS.length}): exit 2 with its own message, nothing about a publish on stdout, tmp/recon-runtime-state not created`, () => {
  for (const [name, args, message, envOv] of USAGE_ERRORS) {
    const r = runCli(args, envOv);
    eq(r.status, 2, `${name}: exit code`);
    assert(message.test(r.stderr) && !/a manual publish is refused/.test(r.stderr), `${name}: refused for another reason: ${r.stderr.slice(0, 300)}`);
    eq(r.stdout, "", `${name}: stdout`);
    assert(!r.createdStateDir, `${name}: must not create tmp/recon-runtime-state`);
  }
});
await check("P14 the demo is ADOPTED (tracked portfolio.source.json): the manual site:publish of its current package is refused — exit 2, names site:portfolio-sync, nothing on stdout, no store touched — with every flag that is not --dry-run / --rollback; the offline --dry-run above still plans", () => {
  for (const extra of [[], ["--local"], ["--no-activate"], ["--allow-site-change", "--allow-origin-mismatch"], ["--expect-package", plan.packageHash]]) {
    const r = runCli(["--site", "boost-interior-demo", "--host", "demo.example", ...extra], { RECON_PUBLISH_ALLOW_REMOTE: undefined });
    eq(r.status, 2, `${extra.join(" ") || "(no flag)"}: exit code`);
    assert(/the portfolio of "boost-interior-demo" is owned by BoostChat \(portfolio\.source\.json\); a manual publish is refused\. Run: pnpm site:portfolio-sync --site boost-interior-demo --host demo\.example --force/.test(r.stderr), `${extra.join(" ")}: ${r.stderr.slice(0, 300)}`);
    eq(r.stdout, "", `${extra.join(" ")}: stdout`);
    assert(!r.createdStateDir, `${extra.join(" ")}: must not create tmp/recon-runtime-state`);
  }
});

// ── 5. package byte identity ─────────────────────────────────────────────────
await check("published package directory under data/site-builds is byte-identical before/after", async () => {
  const after = await treeHash(packageDir);
  eq(after, before, "tree hash");
  console.log(`       ${before.files} files · tree sha256 ${before.hash.slice(0, 16)}…`);
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
