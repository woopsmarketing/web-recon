/**
 * recon-runtime portfolio overlay (workers/recon-runtime/src/index.ts) over a synthetic fake R2 that
 * records every key it is asked for:
 *
 *   1. no overlay pointer, ORDINARY package → the package alone, same status / headers / body as
 *      before the overlay; whether it is a shell is asked once per package (one HEAD), then remembered
 *   1b. no overlay pointer, SHELL package → 503 no-store for every path the overlay would decide,
 *      never a shell page; /_next/ and /_runtime/ answer as always
 *   2. /_next/ and /_runtime/ never consult the overlay; /_runtime/ is never served
 *   3. routes / assets from the verified live manifest (headers, HEAD, 304)
 *   4. owned paths and their RSC payloads answer from the manifest or 404, never from the package
 *   5. unpublished media, site isolation, unsafe manifest keys; every refusal → 503 no-store + one log
 *      line, never a page of the (shell) package — only /_next/ and /_runtime/ answer as always
 *   6. the manifest cache: no re-read while the pointer is unchanged, never stale after it changes
 *
 * Run: tsx --tsconfig platform/tsconfig.json platform/test/runtime-overlay.test.ts
 */

import { createHash } from "node:crypto";
import runtimeDefault, { handle, logTrace, newTrace, type Env, type R2BucketLike, type R2ObjectBodyLike, type R2ObjectLike, type Trace } from "../../workers/recon-runtime/src/index";
import {
  CACHE_IMMUTABLE,
  CACHE_REVALIDATE,
  isPortfolioKey,
  packageKey,
  portfolioAssetKey,
  portfolioCurrentKey,
  portfolioPublicKey,
  routingKey,
  sealKey,
} from "../../workers/recon-runtime/src/contract";
import { resolvePath, routeOfKey } from "../../workers/recon-runtime/src/paths";

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

const HTML = "text/html; charset=utf-8";
const sha256 = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const md5Etag = (s: string) => `"${createHash("md5").update(s).digest("hex")}"`;

class RecordingBucket implements R2BucketLike {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string; cacheControl: string }>();
  readonly recorded: string[] = [];
  set(key: string, body: Uint8Array | string, contentType = HTML, cacheControl = CACHE_REVALIDATE) {
    this.objects.set(key, { body: typeof body === "string" ? new TextEncoder().encode(body) : body, contentType, cacheControl });
  }
  private meta(key: string): R2ObjectLike | null {
    const o = this.objects.get(key);
    if (!o) return null;
    return { size: o.body.length, httpEtag: `"${createHash("md5").update(o.body).digest("hex")}"`, httpMetadata: { contentType: o.contentType, cacheControl: o.cacheControl } };
  }
  async get(key: string): Promise<R2ObjectBodyLike | null> {
    this.recorded.push(`get ${key}`);
    const m = this.meta(key);
    if (!m) return null;
    const o = this.objects.get(key)!;
    return { ...m, body: new Blob([new Uint8Array(o.body)]).stream(), text: async () => Buffer.from(o.body).toString("utf8") };
  }
  async head(key: string): Promise<R2ObjectLike | null> {
    this.recorded.push(`head ${key}`);
    return this.meta(key);
  }
}

/** A V2 shell package: index / portfolio / portfolio/<shell-slug> are placeholder pages that must never be served — with an overlay (it answers them) or without one (503). */
const PACKAGE: Record<string, [body: string, contentType: string, cacheControl?: string]> = {
  "index.html": ["SHELL index", HTML],
  "index.txt": ["SHELL rsc index", "text/x-component"],
  "__next._full.txt": ["SHELL rsc root full", "text/x-component"],
  "__next.__PAGE__.txt": ["SHELL rsc root page", "text/x-component"],
  "portfolio.html": ["SHELL portfolio", HTML],
  "portfolio.txt": ["SHELL rsc portfolio", "text/x-component"],
  "portfolio/__next._full.txt": ["SHELL rsc portfolio full", "text/x-component"],
  "portfolio/shell-slug.html": ["SHELL detail", HTML],
  "portfolio/shell-slug.txt": ["SHELL rsc detail", "text/x-component"],
  "portfolio/shell-slug/__next.portfolio.$d$slug.__PAGE__.txt": ["SHELL rsc detail page", "text/x-component"],
  "sitemap.xml": ["SHELL sitemap", "application/xml"],
  "404.html": ["PKG 404", HTML],
  "about.html": ["PKG about", HTML],
  "about.txt": ["PKG rsc about", "text/x-component"],
  "about/__next._full.txt": ["PKG rsc about full", "text/x-component"],
  "robots.txt": ["PKG robots", "text/plain; charset=utf-8"],
  "assets/pkg.jpg": ["PKG image", "image/jpeg", CACHE_IMMUTABLE],
  "_next/static/app.js": ["PKG js", "text/javascript; charset=utf-8", CACHE_IMMUTABLE],
  "_runtime/portfolio/runtime.json": ['{"schema":"portfolio-runtime@1"}', "application/json"],
  "_runtime/portfolio/shell.json": ['{"secret":"shell snapshot"}', "application/json"],
  "_package.json": ['{"seal":true}', "application/json"],
};

/** An ordinary package: the same files without the portfolio publisher's inputs — the Worker must serve it as it always did. */
const ORDINARY: typeof PACKAGE = Object.fromEntries(Object.entries(PACKAGE).filter(([rel]) => !rel.startsWith("_runtime/")));
/** the one package file that makes a package a shell */
const SHELL_MARKER = "_runtime/portfolio/runtime.json";

interface Fixture {
  b: RecordingBucket;
  env: Env;
  host: string;
  siteId: string;
  hash: string;
}
let fixtureCount = 0;
function addSite(b: RecordingBucket, label: string, files: typeof PACKAGE = PACKAGE): Fixture {
  fixtureCount++;
  const host = `${label}-${fixtureCount}.test.example`;
  const siteId = `${label}-${fixtureCount}`;
  const hash = sha256(`package ${fixtureCount}`);
  b.set(
    routingKey(host),
    JSON.stringify({ schemaVersion: 1, hostname: host, siteId, packageHash: hash, buildInputId: "2".repeat(64), releaseId: "r-1", publishedAt: "2026-10-10T00:00:00.000Z" }),
    "application/json",
    "no-store",
  );
  for (const [rel, [body, contentType, cacheControl]] of Object.entries(files)) b.set(packageKey(siteId, hash, rel), body, contentType, cacheControl);
  return { b, env: { SITES: b }, host, siteId, hash };
}
/** a host routed to a SHELL package (nothing published for it yet) */
const site = (label = "site") => addSite(new RecordingBucket(), label);
/** a host routed to an ORDINARY package */
const ordinarySite = (label = "ordinary") => addSite(new RecordingBucket(), label, ORDINARY);

interface PublishInput {
  /** URL path → page body (stored as blobs/<sha256>.html) or a ready manifest entry */
  routes?: Record<string, string | Record<string, unknown>>;
  /** URL path → storage key under portfolio-assets/ (the object is written too) or a ready manifest entry */
  assets?: Record<string, string | Record<string, unknown>>;
  owned?: unknown;
  manifest?: (m: Record<string, unknown>) => void;
  pointer?: (p: Record<string, unknown>) => void;
  /** bytes stored at the manifest key, when they are not the manifest's own */
  storedManifest?: string | null;
}
/** What the BoostChat publisher writes, in its order: blobs → manifest → pointer last. */
function publish(fx: Fixture, revision: number, input: PublishInput = {}) {
  const routes: Record<string, unknown> = {};
  for (const [p, v] of Object.entries(input.routes ?? {})) {
    if (typeof v !== "string") {
      routes[p] = v;
      continue;
    }
    const key = `blobs/${sha256(v)}.html`;
    // stored with a deliberately different type / cache policy: the manifest's must win
    fx.b.set(portfolioPublicKey(fx.siteId, key), v, "application/octet-stream", "no-store");
    routes[p] = { key, sha256: sha256(v), size: v.length, contentType: p.endsWith(".xml") ? "application/xml" : HTML };
  }
  const assets: Record<string, unknown> = {};
  for (const [p, v] of Object.entries(input.assets ?? {})) {
    if (typeof v !== "string") {
      assets[p] = v;
      continue;
    }
    fx.b.set(portfolioAssetKey(v), `IMAGE ${v}`, "application/octet-stream", "private, no-store");
    assets[p] = { key: v, sha256: sha256(`IMAGE ${v}`), size: `IMAGE ${v}`.length, contentType: "image/jpeg" };
  }
  const manifest: Record<string, unknown> = {
    schema: "portfolio-manifest@1",
    siteId: fx.siteId,
    revision,
    shell: { packageHash: fx.hash, releaseId: "rel-1" },
    owned: input.owned ?? { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
    routes,
    assets,
    projects: {},
  };
  input.manifest?.(manifest);
  const bytes = JSON.stringify(manifest);
  const manifestSha256 = sha256(bytes);
  const manifestKey = `revisions/${revision}/${manifestSha256.slice(0, 16)}.json`;
  const stored = input.storedManifest === undefined ? bytes : input.storedManifest;
  if (stored !== null) fx.b.set(portfolioPublicKey(fx.siteId, manifestKey), stored, "application/json", CACHE_IMMUTABLE);
  const pointer: Record<string, unknown> = { schema: "portfolio-current@1", siteId: fx.siteId, shellPackageHash: fx.hash, revision, manifestKey, manifestSha256, publishedAt: "2026-10-10T00:00:00.000Z" };
  input.pointer?.(pointer);
  const pointerBytes = JSON.stringify(pointer);
  fx.b.set(portfolioCurrentKey(fx.siteId, fx.hash), pointerBytes, "application/json", "no-store");
  return { manifestKey: portfolioPublicKey(fx.siteId, manifestKey), manifestSha256, pointerBytes };
}

async function call(fx: Fixture, p: string, init: RequestInit = {}) {
  const before = fx.b.recorded.length;
  const request = new Request(`https://${fx.host}${p}`, init);
  const trace: Trace = newTrace(request);
  const r = await handle(request, fx.env, trace);
  return { r, status: r.status, text: await r.text(), keys: fx.b.recorded.slice(before), trace, headers: Object.fromEntries(r.headers.entries()) };
}
/** a recorded read ("get <key>" / "head <key>") of the canonical image prefix itself */
const readsAssets = (recorded: string) => recorded.slice(recorded.indexOf(" ") + 1).startsWith("portfolio-assets/");
const pkg = (fx: Fixture, rel: string) => packageKey(fx.siteId, fx.hash, rel);
const ROUTING = (fx: Fixture) => `get ${routingKey(fx.host)}`;
const CURRENT = (fx: Fixture) => `get ${portfolioCurrentKey(fx.siteId, fx.hash)}`;
/** the read that asks whether the routed package is a shell */
const PROBE = (fx: Fixture) => `head ${pkg(fx, SHELL_MARKER)}`;
const probes = (fx: Fixture) => fx.b.recorded.filter((k) => k === PROBE(fx)).length;

const LIVE: PublishInput = {
  routes: { "/": "LIVE home", "/portfolio": "LIVE list", "/portfolio/page/2": "LIVE list 2", "/portfolio/live-slug": "LIVE detail", "/sitemap.xml": "LIVE sitemap" },
  assets: { "/assets/0123456789abcdef0123.jpg": "tenant-1/originals/photo-1.jpg" },
};

// ── 1. no overlay pointer, ordinary package ─────────────────────────────────────
console.log("\nrecon-runtime overlay: an ordinary site (no overlay pointer)");

await check("ordinary package: every path answers from the package with the stored headers, byte for byte; the reads are the absent pointer and — on the first request only — one HEAD that asks whether the package is a shell", async () => {
  const fx = ordinarySite("v1");
  const cases: [path: string, rel: string][] = [
    ["/", "index.html"],
    ["/portfolio", "portfolio.html"],
    ["/portfolio/shell-slug", "portfolio/shell-slug.html"],
    ["/index.txt", "index.txt"],
    ["/__next._full.txt", "__next._full.txt"],
    ["/portfolio.txt", "portfolio.txt"],
    ["/sitemap.xml", "sitemap.xml"],
    ["/about", "about.html"],
    ["/robots.txt", "robots.txt"],
    ["/assets/pkg.jpg", "assets/pkg.jpg"],
  ];
  let first = true;
  for (const [p, rel] of cases) {
    const [body, contentType, cacheControl = CACHE_REVALIDATE] = ORDINARY[rel]!;
    const expected = { "cache-control": cacheControl, "content-length": String(body.length), "content-type": contentType, etag: md5Etag(body), "x-content-type-options": "nosniff" };
    const got = await call(fx, p);
    eq([got.status, got.text], [200, body], `GET ${p}`);
    eq(Object.entries(got.headers).sort(), Object.entries(expected).sort(), `GET ${p} headers`);
    eq(got.keys, first ? [ROUTING(fx), CURRENT(fx), PROBE(fx), `get ${pkg(fx, rel)}`] : [ROUTING(fx), CURRENT(fx), `get ${pkg(fx, rel)}`], `GET ${p} reads`);
    first = false;
    eq([got.trace.overlay, got.trace.outcome], [undefined, "served"], `GET ${p}: nothing refused`);

    const headed = await call(fx, p, { method: "HEAD" });
    eq([headed.status, headed.text], [200, ""], `HEAD ${p}`);
    eq(Object.entries(headed.headers).sort(), Object.entries(expected).sort(), `HEAD ${p} headers`);
    eq(headed.keys, [ROUTING(fx), CURRENT(fx), `head ${pkg(fx, rel)}`], `HEAD ${p} reads`);
    const cached = await call(fx, p, { headers: { "If-None-Match": md5Etag(body) } });
    eq([cached.status, cached.text, cached.headers["content-length"]], [304, "", undefined], `304 ${p}`);
  }
  const miss = await call(fx, "/nope");
  eq([miss.status, miss.text, miss.headers["cache-control"], miss.headers.etag], [404, "PKG 404", "no-store", undefined], "miss → the package's 404 page");
  eq(miss.keys, [ROUTING(fx), CURRENT(fx), `get ${pkg(fx, "nope.html")}`, `get ${pkg(fx, "404.html")}`], "miss reads");
  eq(probes(fx), 1, `the shell question was asked once in ${fx.b.recorded.length} reads`);
  assert(fx.b.recorded.every((k) => !readsAssets(k)), "an ordinary site never reads portfolio-assets/");
});

await check("the shell question is per PACKAGE (siteId + packageHash): a second package of the same site is asked once more, and each keeps its own answer", async () => {
  const b = new RecordingBucket();
  const first = addSite(b, "two-kinds", ORDINARY);
  eq((await call(first, "/")).text, "SHELL index", "the ordinary package serves its own index");
  // the same site re-pointed (another host) at a SHELL package
  const second: Fixture = { ...first, host: `next-${first.host}`, hash: sha256("the shell package of the same site") };
  b.set(routingKey(second.host), JSON.stringify({ schemaVersion: 1, hostname: second.host, siteId: second.siteId, packageHash: second.hash, buildInputId: "2".repeat(64), releaseId: "r-2", publishedAt: "x" }));
  for (const [rel, [body, contentType]] of Object.entries(PACKAGE)) b.set(packageKey(second.siteId, second.hash, rel), body, contentType);
  const refused = await call(second, "/");
  eq([refused.status, refused.keys], [503, [ROUTING(second), CURRENT(second), PROBE(second)]], "the shell package of the same site is judged on its own");
  eq([(await call(first, "/")).status, (await call(second, "/")).status, (await call(first, "/about")).text], [200, 503, "PKG about"], "each package keeps its answer");
  eq([probes(first), probes(second)], [1, 1], "one question per package");
});

// ── 1b. no overlay pointer, shell package ───────────────────────────────────────
console.log("\nrecon-runtime overlay: a shell package without an overlay pointer");

await check("shell package, no pointer → FAILS CLOSED: 503 no-store for every path the overlay would decide (GET and HEAD), no package object read, one log line; /_next/ and /_runtime/ answer as always; the question is asked once", async () => {
  const fx = site("bare");
  const PATHS = ["/", "/portfolio", "/portfolio/shell-slug", "/portfolio/page/2", "/index.txt", "/portfolio.txt", "/sitemap.xml", "/about", "/about.txt", "/robots.txt", "/assets/pkg.jpg", "/no-such-page", "/portfolio/"];
  let first = true;
  for (const p of PATHS) {
    const got = await call(fx, p);
    eq([got.status, got.text, got.trace.outcome, got.trace.overlay], [503, "content unavailable\n", "overlay-absent", "absent"], `GET ${p}`);
    eq(Object.entries(got.headers).sort(), Object.entries({ "cache-control": "no-store", "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }).sort(), `GET ${p} headers`);
    eq(got.keys, first ? [ROUTING(fx), CURRENT(fx), PROBE(fx)] : [ROUTING(fx), CURRENT(fx)], `GET ${p} reads`);
    first = false;
    const head = await call(fx, p, { method: "HEAD" });
    eq([head.status, head.text, head.trace.outcome, head.headers["cache-control"], head.keys], [503, "", "overlay-absent", "no-store", [ROUTING(fx), CURRENT(fx)]], `HEAD ${p}`);
    eq((await call(fx, p, { headers: { "If-None-Match": "*" } })).status, 503, `${p}: never a 304`);
  }
  eq(probes(fx), 1, "asked once for the package");
  assert(fx.b.recorded.every((k) => k === PROBE(fx) || !k.includes(`/packages/${fx.hash}/`)), "no file of the shell package was read");

  // what never consults the overlay is the package's, exactly as for any site
  for (const p of ["/_next/static/app.js", "/%5Fnext/static/app.js"]) {
    const next = await call(fx, p);
    eq([next.status, next.text, next.headers["cache-control"], next.headers.etag, next.trace.overlay], [200, "PKG js", CACHE_IMMUTABLE, md5Etag("PKG js"), undefined], p);
    eq(next.keys, [ROUTING(fx), `get ${pkg(fx, "_next/static/app.js")}`], `${p} reads`);
  }
  eq((await call(fx, "/_next/static/app.js", { headers: { "If-None-Match": md5Etag("PKG js") } })).status, 304, "/_next/ still revalidates");
  const nextMiss = await call(fx, "/_next/static/missing.js");
  eq([nextMiss.status, nextMiss.text], [404, "PKG 404"], "/_next/ miss → the package's 404 page");
  for (const p of ["/_runtime/portfolio/runtime.json", "/_runtime/portfolio/shell.json", "/%5Fruntime/portfolio/shell.json"]) {
    const runtime = await call(fx, p);
    eq([runtime.status, runtime.text, runtime.trace.overlay, runtime.keys], [404, "PKG 404", undefined, [ROUTING(fx), `get ${pkg(fx, "404.html")}`]], `${p} stays a 404`);
  }
  // path rules that come before any overlay decision are unchanged
  eq((await call(fx, "/%00")).status, 400, "bad path");
  eq((await call(fx, "/", { method: "POST" })).status, 405, "method");

  const lines: string[] = [];
  const request = new Request(`https://${fx.host}/portfolio?secret=1`);
  const trace = newTrace(request);
  await handle(request, fx.env, trace);
  logTrace(fx.env, trace, (l) => lines.push(l));
  eq(lines.length, 1, "one log line");
  const line = JSON.parse(lines[0]!);
  eq([line.evt, line.status, line.outcome, line.overlay, line.siteId, line.packageHash, line.path], ["recon-runtime", 503, "overlay-absent", "absent", fx.siteId, fx.hash, "/portfolio"], "log line");
});

await check("shell package: the portfolio goes live on the next request after its pointer is written (no stale 503), and the door closes again if the pointer goes — the shell page is never served either way", async () => {
  const fx = site("bare");
  eq([(await call(fx, "/")).status, (await call(fx, "/about")).status], [503, 503], "nothing published yet");
  const live = publish(fx, 1, LIVE);
  const home = await call(fx, "/");
  eq([home.status, home.text, home.trace.overlay], [200, "LIVE home", undefined], "published → served");
  eq(home.keys, [ROUTING(fx), CURRENT(fx), `get ${live.manifestKey}`, home.keys[3]], "…from the overlay, with no question about the package");
  eq([(await call(fx, "/about")).text, (await call(fx, "/portfolio/shell-slug")).status], ["PKG about", 404], "the package's own pages answer; an owned path that was not rendered is a 404");
  fx.b.objects.delete(portfolioCurrentKey(fx.siteId, fx.hash));
  for (const p of ["/", "/portfolio", "/portfolio/live-slug", "/about"]) {
    const gone = await call(fx, p);
    eq([gone.status, gone.text, gone.trace.outcome, gone.keys], [503, "content unavailable\n", "overlay-absent", [ROUTING(fx), CURRENT(fx)]], `pointer removed: ${p}`);
  }
  eq(probes(fx), 1, "asked once, before the publish; the answer outlives the pointer");
});

await check("shell package WITH a pointer from the start: served exactly as before — the shell question is never asked", async () => {
  const fx = site("v2");
  publish(fx, 1, LIVE);
  for (const p of ["/", "/portfolio", "/portfolio/live-slug", "/about", "/robots.txt", "/assets/pkg.jpg", "/assets/0123456789abcdef0123.jpg", "/nope", "/portfolio/nope", "/_next/static/app.js", "/_runtime/portfolio/runtime.json"]) {
    await call(fx, p);
    await call(fx, p, { method: "HEAD" });
  }
  eq(probes(fx), 0, "no HEAD of the runtime document");
  assert(fx.b.recorded.every((k) => !k.includes("/_runtime/")), "nothing under /_runtime/ was read");
});

await check("the shell question fails as every R2 failure does (500), and a failure is not remembered", async () => {
  const fx = site("bare");
  let down = true;
  const flaky: Env = { SITES: { get: (key) => fx.b.get(key), head: (key) => (down && key.endsWith(SHELL_MARKER) ? Promise.reject(new Error("r2 down")) : fx.b.head(key)) } };
  const lines: string[] = [];
  const original = console.log;
  console.log = (l: string) => void lines.push(l);
  let r: Response;
  try {
    r = await runtimeDefault.fetch(new Request(`https://${fx.host}/`), flaky);
  } finally {
    console.log = original;
  }
  eq([r.status, await r.text(), JSON.parse(lines[0]!).outcome], [500, "internal error\n", "internal-error"], "the question could not be answered → 500, not a shell page");
  down = false;
  const after = await handle(new Request(`https://${fx.host}/`), flaky);
  eq([after.status, probes(fx)], [503, 1], "asked again once the store answers: still a shell, still closed");
});

// ── 2. rule 1 ───────────────────────────────────────────────────────────────────
console.log("\nrecon-runtime overlay: /_next/ and /_runtime/");

await check("/_next/* is the package's alone: two reads, neither the overlay pointer nor the shell question is asked — ordinary package, shell without or with a live overlay, even if the manifest lists the path", async () => {
  const v1 = site("v1");
  const v2 = site("v2");
  publish(v2, 1, { ...LIVE, routes: { ...LIVE.routes, "/_next/static/app.js": "HIJACK", "/_next/static/missing.js": "HIJACK" } });
  await call(v2, "/"); // manifest is now cached: still must not be consulted
  for (const fx of [ordinarySite(), v1, v2]) {
    for (const p of ["/_next/static/app.js", "/%5Fnext/static/app.js"]) {
      const got = await call(fx, p);
      eq([got.status, got.text, got.headers["cache-control"]], [200, "PKG js", CACHE_IMMUTABLE], `${fx.siteId} ${p}`);
      eq(got.keys, [ROUTING(fx), `get ${pkg(fx, "_next/static/app.js")}`], `${fx.siteId} ${p} reads`);
    }
    const head = await call(fx, "/_next/static/app.js", { method: "HEAD" });
    eq(head.keys, [ROUTING(fx), `head ${pkg(fx, "_next/static/app.js")}`], `${fx.siteId} HEAD reads`);
    const miss = await call(fx, "/_next/static/missing.js");
    eq([miss.status, miss.text], [404, "PKG 404"], `${fx.siteId} /_next/ miss`);
    eq(miss.keys, [ROUTING(fx), `get ${pkg(fx, "_next/static/missing.js")}`, `get ${pkg(fx, "404.html")}`], `${fx.siteId} /_next/ miss reads`);
    const odd = await call(fx, "/_next/static/"); // a /_next/ path the resolver refuses: still no overlay read
    eq([odd.status, odd.keys], [404, [ROUTING(fx), `get ${pkg(fx, "404.html")}`]], `${fx.siteId} /_next/static/`);
  }
});

await check("/_runtime/* is never served (the package's 404 page), in any spelling, with or without an overlay; the objects are never read", async () => {
  const v1 = site("v1");
  const v2 = site("v2");
  publish(v2, 1, { ...LIVE, routes: { ...LIVE.routes, "/_runtime/portfolio/shell.json": "HIJACK" } });
  for (const fx of [ordinarySite(), v1, v2]) {
    for (const p of ["/_runtime/portfolio/shell.json", "/_runtime/portfolio/runtime.json", "/%5Fruntime/portfolio/shell.json", "/_runtime/portfolio/shell.json?x=1", "/_runtime/portfolio/"]) {
      const got = await call(fx, p);
      eq([got.status, got.text], [404, "PKG 404"], `${fx.siteId} ${p}`);
      assert(got.keys.every((k) => !k.includes("/_runtime/")), `${fx.siteId} ${p}: read ${got.keys.join(", ")}`);
    }
    for (const p of ["/_runtime/portfolio/shell.json", "/%5Fruntime/portfolio/shell.json"]) eq((await call(fx, p)).keys, [ROUTING(fx), `get ${pkg(fx, "404.html")}`], `${fx.siteId} ${p}: no overlay read, no shell question`);
    eq((await call(fx, "/_runtime/portfolio/shell.json", { method: "HEAD" })).status, 404, `${fx.siteId} HEAD`);
  }
  eq(resolvePath("/_runtime/portfolio/shell.json").kind, "not-found", "resolver refuses _runtime/**");
  eq(resolvePath("/_runtime").kind, "key", "a top-level page named _runtime is an ordinary (absent) page");
});

// ── 3. routes and assets ────────────────────────────────────────────────────────
console.log("\nrecon-runtime overlay: routes and assets of the verified live manifest");

await check("routes[pathname] → the rendered object with the manifest's content type, revalidate, ETag, nosniff; HEAD; 304; the manifest is read once", async () => {
  const fx = site("v2");
  const live = publish(fx, 1, LIVE);
  let first = true;
  for (const [p, body] of Object.entries(LIVE.routes!) as [string, string][]) {
    const blob = portfolioPublicKey(fx.siteId, `blobs/${sha256(body)}.html`);
    const expected = {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-length": String(body.length),
      "content-type": p.endsWith(".xml") ? "application/xml" : HTML,
      etag: md5Etag(body),
      "x-content-type-options": "nosniff",
    };
    const got = await call(fx, p);
    eq([got.status, got.text], [200, body], `GET ${p}`);
    eq(Object.entries(got.headers).sort(), Object.entries(expected).sort(), `GET ${p} headers`);
    eq(got.keys, first ? [ROUTING(fx), CURRENT(fx), `get ${live.manifestKey}`, `get ${blob}`] : [ROUTING(fx), CURRENT(fx), `get ${blob}`], `GET ${p} reads`);
    first = false;

    const head = await call(fx, p, { method: "HEAD" });
    eq([head.status, head.text], [200, ""], `HEAD ${p}`);
    eq(Object.entries(head.headers).sort(), Object.entries(expected).sort(), `HEAD ${p} headers`);
    eq(head.keys, [ROUTING(fx), CURRENT(fx), `head ${blob}`], `HEAD ${p} reads`);

    for (const tag of [md5Etag(body), `W/${md5Etag(body)}`, "*"]) {
      const cached = await call(fx, p, { headers: { "If-None-Match": tag } });
      eq([cached.status, cached.text, cached.headers.etag, cached.headers["content-length"], cached.headers["cache-control"]], [304, "", md5Etag(body), undefined, CACHE_REVALIDATE], `304 ${p} ${tag}`);
    }
    eq((await call(fx, p, { headers: { "If-None-Match": '"other"' } })).status, 200, `stale validator ${p}`);
    eq((await call(fx, `${p}?_rsc=abc`)).text, body, `query string ignored ${p}`);
  }
  assert(fx.b.recorded.every((k) => !k.includes("/packages/") || k.endsWith("/404.html")), "no package page was read for a route hit");
});

await check("assets[pathname] → portfolio-assets/<key> with the manifest's content type and one-year immutable; HEAD; 304", async () => {
  const fx = site("v2");
  publish(fx, 1, LIVE);
  const p = "/assets/0123456789abcdef0123.jpg";
  const body = "IMAGE tenant-1/originals/photo-1.jpg";
  const obj = "portfolio-assets/tenant-1/originals/photo-1.jpg";
  const got = await call(fx, p);
  eq([got.status, got.text], [200, body], "GET");
  eq(
    Object.entries(got.headers).sort(),
    Object.entries({ "cache-control": "public, max-age=31536000, immutable", "content-length": String(body.length), "content-type": "image/jpeg", etag: md5Etag(body), "x-content-type-options": "nosniff" }).sort(),
    "headers",
  );
  eq(got.keys.slice(-1), [`get ${obj}`], "object read");
  const head = await call(fx, p, { method: "HEAD" });
  eq([head.status, head.text, head.headers["content-type"], head.keys.slice(-1)], [200, "", "image/jpeg", [`head ${obj}`]], "HEAD");
  const cached = await call(fx, p, { headers: { "If-None-Match": md5Etag(body) } });
  eq([cached.status, cached.text, cached.headers["cache-control"]], [304, "", CACHE_IMMUTABLE], "304");
});

await check("a path in neither table and not owned → the package, unchanged (pages, RSC payloads, package assets, misses)", async () => {
  const fx = site("v2");
  publish(fx, 1, LIVE);
  for (const [p, rel] of [
    ["/about", "about.html"],
    ["/about.txt", "about.txt"],
    ["/about/__next._full.txt", "about/__next._full.txt"],
    ["/robots.txt", "robots.txt"],
    ["/assets/pkg.jpg", "assets/pkg.jpg"],
  ] as const) {
    const got = await call(fx, p);
    eq([got.status, got.text, got.headers["content-type"], got.headers["cache-control"]], [200, PACKAGE[rel]![0], PACKAGE[rel]![1], PACKAGE[rel]![2] ?? CACHE_REVALIDATE], p);
  }
  const miss = await call(fx, "/nope");
  eq([miss.status, miss.text], [404, "PKG 404"], "miss");
});

// ── 4. owned paths ──────────────────────────────────────────────────────────────
console.log("\nrecon-runtime overlay: owned URL space");

await check("an owned path that is not in routes → the package's 404 page; the shell's own page / RSC payload is never read, in any spelling", async () => {
  const fx = site("v2");
  publish(fx, 1, { ...LIVE, routes: { "/portfolio": "LIVE list" } }); // "/", "/sitemap.xml" owned but not rendered
  const OWNED_MISSES = [
    "/", // owned exact
    "/sitemap.xml",
    "/portfolio/shell-slug", // under an owned prefix; the package has this page
    "/portfolio/page/9",
    "/portfolio/", // trailing slash
    "/index.txt", // RSC of "/"
    "/__next._full.txt",
    "/__next.__PAGE__.txt",
    "/portfolio.txt", // RSC of the owned prefix page
    "/portfolio/__next._full.txt",
    "/portfolio/shell-slug.txt",
    "/portfolio/shell-slug/__next.portfolio.$d$slug.__PAGE__.txt",
    "/portfolio/shell-slug/__next.portfolio.%24d%24slug.__PAGE__.txt",
    "/sitemap.xml.txt",
    "/%70ortfolio/shell-slug", // percent-escaped spellings of the same package file
    "/portfolio/shell%2Dslug",
    "/%69ndex.txt",
    "/portfolio%2Etxt",
    "/index.html", // spelled-out html: never served, as before
    "/portfolio.html",
    "/portfolio/shell-slug.html",
    "/index",
  ];
  for (const p of OWNED_MISSES) {
    for (const method of ["GET", "HEAD"]) {
      const got = await call(fx, p, { method });
      eq([got.status, got.text, got.headers["cache-control"], got.headers.etag], [404, method === "GET" ? "PKG 404" : "", "no-store", undefined], `${method} ${p}`);
      eq(got.trace.outcome, "not-found", `${method} ${p} outcome`);
      assert(
        got.keys.every((k) => !k.includes("/packages/") || k.endsWith(`/${fx.hash}/404.html`)),
        `${method} ${p}: read a package file: ${got.keys.join(", ")}`,
      );
    }
  }
  eq((await call(fx, "/portfolio")).text, "LIVE list", "the rendered route still answers");
  eq((await call(fx, "/%70ortfolio")).text, "LIVE list", "…also by the escaped spelling of the same path");
  eq((await call(fx, "/portfolios")).status, 404, "/portfolios is not under the /portfolio prefix (package miss)");
  eq((await call(fx, "/portfolios.txt")).trace.key, "portfolios.txt", "…and neither is its RSC payload: the package is asked");
  eq((await call(fx, "/about/__next._full.txt")).text, "PKG rsc about full", "RSC payload of a page that is not owned: package");
});

await check("owned.exact other than \"/\" covers the page, <page>.txt and __next.*.txt in its own directory — nothing deeper", async () => {
  const fx = site("v2");
  publish(fx, 1, { routes: {}, owned: { exact: ["/about"], prefixes: [] } });
  for (const p of ["/about", "/about.txt", "/about/__next._full.txt"]) eq([(await call(fx, p)).status, p], [404, p], p);
  for (const [p, body] of [
    ["/", "SHELL index"],
    ["/index.txt", "SHELL rsc index"],
    ["/__next._full.txt", "SHELL rsc root full"],
    ["/portfolio/shell-slug", "SHELL detail"],
    ["/robots.txt", "PKG robots"],
  ]) {
    eq((await call(fx, p!)).text, body, `${p} is not owned by this manifest`);
  }
});

await check("a listed route / asset whose object is missing → 503 overlay-missing, never the package's file", async () => {
  const fx = site("v2");
  publish(fx, 1, {
    routes: { "/": { key: "blobs/gone.html", sha256: "0".repeat(64), size: 1, contentType: HTML } },
    assets: { "/assets/pkg.jpg": { key: "tenant-1/gone.jpg", sha256: "0".repeat(64), size: 1, contentType: "image/jpeg" } },
  });
  for (const p of ["/", "/assets/pkg.jpg"]) {
    const got = await call(fx, p);
    eq([got.status, got.text, got.headers["cache-control"], got.trace.outcome], [503, "content unavailable\n", "no-store", "overlay-missing"], p);
    assert(got.keys.every((k) => !k.includes("/packages/")), `${p}: read a package file`);
    eq((await call(fx, p, { method: "HEAD" })).text, "", `HEAD ${p}`);
  }
});

// ── 5. safety boundaries ────────────────────────────────────────────────────────
console.log("\nrecon-runtime overlay: safety boundaries");

await check("unpublished media: an object under portfolio-assets/ is reachable only at a path the live manifest lists; an unpublish takes it away on the next request", async () => {
  const fx = site("v2");
  fx.b.set(portfolioAssetKey("tenant-1/originals/draft.jpg"), "DRAFT IMAGE", "image/jpeg");
  fx.b.set(portfolioAssetKey("0123456789abcdef9999.jpg"), "DRAFT IMAGE", "image/jpeg");
  publish(fx, 1, LIVE);
  const PROBES = [
    "/assets/0123456789abcdef9999.jpg",
    "/assets/draft.jpg",
    "/assets/tenant-1/originals/draft.jpg",
    "/tenant-1/originals/draft.jpg",
    "/portfolio-assets/tenant-1/originals/draft.jpg",
    "/portfolio-assets/tenant-1/originals/photo-1.jpg", // published, but only at its manifest path
    "/assets/0123456789abcdef0123.jpg/../draft.jpg",
    "/assets/..%2f..%2fportfolio-assets/tenant-1/originals/draft.jpg",
    "/assets/0123456789ABCDEF0123.jpg",
    "/assets/0123456789abcdef0123.jpg/",
    "/assets/0123456789abcdef0123.jpg.txt",
  ];
  for (const p of PROBES) {
    for (const method of ["GET", "HEAD"]) {
      const got = await call(fx, p, { method });
      assert(got.status === 404 || got.status === 400, `${method} ${p}: status ${got.status}`);
      assert(!got.text.includes("IMAGE"), `${method} ${p}: served image bytes`);
      assert(got.keys.every((k) => !readsAssets(k)), `${method} ${p}: read ${got.keys.join(", ")}`);
    }
  }
  eq((await call(fx, "/assets/0123456789abcdef0123.jpg")).status, 200, "the published image is served");
  publish(fx, 2, { ...LIVE, assets: {} });
  const after = await call(fx, "/assets/0123456789abcdef0123.jpg");
  eq([after.status, after.text], [404, "PKG 404"], "unpublished in revision 2: gone");
  assert(after.keys.every((k) => !readsAssets(k)), "…and its object is not read");
});

await check("site isolation: every overlay key is built from the routing pointer's siteId; a host never reads another site's overlay", async () => {
  const b = new RecordingBucket();
  const a = addSite(b, "iso-a");
  const c = addSite(b, "iso-c");
  publish(a, 1, { routes: { "/": "A home", "/portfolio": "A list" } });
  publish(c, 1, { routes: { "/": "C home" } });
  for (const p of ["/", "/portfolio", "/portfolio/x", "/about", "/assets/pkg.jpg", "/nope"]) {
    const got = await call(c, p);
    assert(!got.text.startsWith("A "), `${p}: site C served site A's content`);
    assert(got.keys.every((k) => !k.includes(a.siteId) && !k.includes(a.host)), `${p}: site C read a key of site A: ${got.keys.join(", ")}`);
  }
  eq([(await call(a, "/")).text, (await call(c, "/")).text, (await call(c, "/portfolio")).status], ["A home", "C home", 404], "each host serves its own revision");
});

/** Every way a pointer or manifest can fail to verify: [label, what is published, expected trace.overlay]. */
const OTHER_HASH = "e".repeat(64);
const REFUSALS: [label: string, input: PublishInput, reason: string][] = [
  ["pointer is not an object", { pointer: (p) => void Object.assign(p, { toJSON: () => [] }) }, "current-schema"],
  ["pointer schema", { pointer: (p) => void (p.schema = "portfolio-current@2") }, "current-schema"],
  ["pointer names another siteId", { pointer: (p) => void (p.siteId = "other-site") }, "current-identity"],
  ["pointer names another package hash", { pointer: (p) => void (p.shellPackageHash = OTHER_HASH) }, "current-identity"],
  ["pointer manifestSha256 is not a hash", { pointer: (p) => void (p.manifestSha256 = "abc") }, "current-manifest-ref"],
  ["pointer manifestKey has a .. segment", { pointer: (p) => void (p.manifestKey = "../other-site/revisions/1/m.json") }, "current-manifest-ref"],
  ["pointer manifestKey is absolute", { pointer: (p) => void (p.manifestKey = "/revisions/1/m.json") }, "current-manifest-ref"],
  ["pointer manifestKey is not a string", { pointer: (p) => void (p.manifestKey = 7) }, "current-manifest-ref"],
  ["manifest object is absent", { storedManifest: null }, "manifest-missing"],
  ["manifest bytes do not hash to manifestSha256", { storedManifest: '{"schema":"portfolio-manifest@1"}' }, "manifest-sha256"],
  ["manifest object is over the 4 MiB cap", { storedManifest: " ".repeat(4 * 1024 * 1024 + 1) }, "manifest-too-large"],
  ["pointer sha256 is another manifest's", { pointer: (p) => void (p.manifestSha256 = OTHER_HASH) }, "manifest-sha256"],
  ["manifest schema", { manifest: (m) => void (m.schema = "portfolio-manifest@2") }, "manifest-invalid"],
  ["manifest without routes", { manifest: (m) => void delete m.routes }, "manifest-invalid"],
  ["manifest owned is not two path lists", { owned: { exact: ["/"], prefixes: "/portfolio" } }, "manifest-invalid"],
  ["manifest owned entry is not a path", { owned: { exact: ["/"], prefixes: [""] } }, "manifest-invalid"],
  ["manifest names another siteId", { manifest: (m) => void (m.siteId = "other-site") }, "manifest-identity"],
  ["manifest names another package hash", { manifest: (m) => void (m.shell = { packageHash: OTHER_HASH, releaseId: "rel-1" }) }, "manifest-identity"],
];

await check(`a pointer / manifest that does not verify (${REFUSALS.length + 1} ways) FAILS CLOSED: 503 no-store for every path the overlay decides (GET and HEAD) + one log line naming the check; no page, RSC payload, sitemap or 404 page of the shell package is read; /_next/ and /_runtime/ answer as always; nothing outside this site`, async () => {
  const run = async (label: string, fx: Fixture, reason: string) => {
    for (const p of ["/", "/portfolio", "/portfolio/shell-slug", "/index.txt", "/sitemap.xml", "/about", "/robots.txt", "/assets/pkg.jpg", "/assets/0123456789abcdef0123.jpg", "/no-such-page"]) {
      const got = await call(fx, p);
      eq([got.status, got.text, got.trace.outcome, got.trace.overlay], [503, "content unavailable\n", "overlay-refused", reason], `${label}: ${p}`);
      eq([got.headers["cache-control"], got.headers["content-type"], got.headers["etag"]], ["no-store", "text/plain; charset=utf-8", undefined], `${label}: ${p} headers`);
      assert(!got.keys.some((k) => k.includes(`/packages/${fx.hash}/`)), `${label}: ${p} read a package object: ${got.keys.join(", ")}`);
      assert(!got.keys.some(readsAssets), `${label}: ${p} read portfolio-assets/: ${got.keys.join(", ")}`);
    }
    const head = await call(fx, "/portfolio", { method: "HEAD" });
    eq([head.status, head.text, head.trace.outcome, head.headers["cache-control"]], [503, "", "overlay-refused", "no-store"], `${label}: HEAD`);
    // what never consults the overlay is untouched by a refusal
    const next = await call(fx, "/_next/static/app.js");
    eq([next.status, next.text, next.trace.overlay, next.keys], [200, "PKG js", undefined, [ROUTING(fx), `get ${pkg(fx, "_next/static/app.js")}`]], `${label}: /_next/ is the package's`);
    const runtime = await call(fx, "/_runtime/portfolio/shell.json");
    eq([runtime.status, runtime.text, runtime.trace.overlay], [404, "PKG 404", undefined], `${label}: /_runtime/ stays a 404`);
    const own = [`routing/${fx.host}.json`, `sites/${fx.siteId}/packages/${fx.hash}/`, `portfolio-public/${fx.siteId}/`];
    assert(fx.b.recorded.every((k) => own.some((prefix) => k.slice(k.indexOf(" ") + 1).startsWith(prefix))), `${label}: read outside the site: ${fx.b.recorded.join(", ")}`);

    const lines: string[] = [];
    const request = new Request(`https://${fx.host}/`);
    const trace = newTrace(request);
    await handle(request, fx.env, trace);
    logTrace(fx.env, trace, (l) => lines.push(l));
    eq(lines.length, 1, `${label}: a refused overlay is logged`);
    const line = JSON.parse(lines[0]!);
    eq([line.evt, line.status, line.outcome, line.overlay, line.siteId], ["recon-runtime", 503, "overlay-refused", reason, fx.siteId], `${label}: log line`);
  };
  const seen = new Set<string>();
  for (const [label, input, reason] of REFUSALS) {
    const fx = site("refuse");
    publish(fx, 1, { ...LIVE, ...input });
    await run(label, fx, reason);
    seen.add(reason);
  }
  const fx = site("refuse");
  fx.b.set(portfolioCurrentKey(fx.siteId, fx.hash), "{not json", "application/json");
  await run("pointer is unparsable", fx, "current-unparsable");
  seen.add("current-unparsable");
  eq([...seen].sort(), ["current-identity", "current-manifest-ref", "current-schema", "current-unparsable", "manifest-identity", "manifest-invalid", "manifest-missing", "manifest-sha256", "manifest-too-large"], "every refusal class of loadOverlay is covered");
});

await check("a shell package stays closed when its refused pointer is removed (503 overlay-absent — the shell page is not the fallback); an R2 failure is still the 500", async () => {
  const fx = site("closed");
  publish(fx, 1, { ...LIVE, storedManifest: null });
  eq([(await call(fx, "/")).status, (await call(fx, "/about")).status], [503, 503], "refused while the pointer is there");
  fx.b.objects.delete(portfolioCurrentKey(fx.siteId, fx.hash));
  const home = await call(fx, "/");
  eq([home.status, home.text, home.trace.outcome, home.trace.overlay, home.headers["cache-control"]], [503, "content unavailable\n", "overlay-absent", "absent", "no-store"], "pointer absent → still no shell page");
  eq(home.keys, [ROUTING(fx), CURRENT(fx), PROBE(fx)], "…decided by the pointer read and the one question about the package");
  const broken: Env = { SITES: { get: async (key) => (key.startsWith("portfolio-public/") ? Promise.reject(new Error("r2 down")) : fx.b.get(key)), head: (key) => fx.b.head(key) } };
  const lines: string[] = [];
  const original = console.log;
  console.log = (l: string) => void lines.push(l);
  let r: Response;
  try {
    r = await runtimeDefault.fetch(new Request(`https://${fx.host}/`), broken);
  } finally {
    console.log = original;
  }
  eq([r.status, await r.text(), JSON.parse(lines[0]!).outcome], [500, "internal error\n", "internal-error"], "an R2 throw while reading the pointer is the existing 500");
});

await check("a manifest cached for one package is refused under another package's pointer (identity is checked on every request, cached or not)", async () => {
  const b = new RecordingBucket();
  const one = addSite(b, "two-packages");
  const live = publish(one, 1, LIVE);
  eq((await call(one, "/")).text, "LIVE home", "package 1 serves its revision (manifest now cached)");
  // the same site re-pointed at a new shell package, whose overlay pointer names the old package's manifest
  const next: Fixture = { ...one, host: `next-${one.host}`, hash: sha256("the next shell package") };
  b.set(routingKey(next.host), JSON.stringify({ schemaVersion: 1, hostname: next.host, siteId: next.siteId, packageHash: next.hash, buildInputId: "2".repeat(64), releaseId: "r-2", publishedAt: "x" }));
  for (const [rel, [body, contentType]] of Object.entries(PACKAGE)) b.set(packageKey(next.siteId, next.hash, rel), `NEXT ${body}`, contentType);
  b.set(portfolioCurrentKey(next.siteId, next.hash), live.pointerBytes.replace(one.hash, next.hash));
  const got = await call(next, "/");
  eq([got.status, got.text, got.trace.outcome, got.trace.overlay], [503, "content unavailable\n", "overlay-refused", "manifest-identity"], "refused for the new package: never its shell page");
  eq(got.keys, [ROUTING(next), CURRENT(next)], "…from the cache, without another manifest read, and without a package read");
  eq((await call(one, "/")).text, "LIVE home", "package 1 is unaffected");
});

await check("a manifest entry with an unsafe key or content type is ignored: an owned path then 404s, any other path goes to the package", async () => {
  const BAD_KEYS = [
    "../other-site/blobs/x.html",
    "blobs/../../other-site/blobs/x.html",
    "/blobs/x.html",
    "blobs//x.html",
    "blobs/x.html/",
    "./blobs/x.html",
    "blobs/x y.html",
    "blobs/%2e%2e/x.html",
    `blobs/${"a".repeat(129)}.html`,
    Array.from({ length: 12 }, () => "a".repeat(100)).join("/"), // every segment valid, the R2 key over 1024 bytes
    "",
    7,
    null,
  ];
  for (const key of BAD_KEYS) {
    eq(isPortfolioKey(key), typeof key === "string" && key.length > 1024, `isPortfolioKey(${JSON.stringify(key).slice(0, 40)})`);
    const fx = site("badkey");
    fx.b.set("portfolio-public/other-site/blobs/x.html", "OTHER SITE PAGE");
    fx.b.set("portfolio-assets/blobs/x.html", "OTHER TENANT IMAGE");
    const entry = { key, sha256: "0".repeat(64), size: 1, contentType: HTML };
    publish(fx, 1, { routes: { "/": entry, "/about": entry, "/portfolio": "LIVE list" }, assets: { "/assets/pkg.jpg": entry, "/assets/new.jpg": entry } });
    const label = JSON.stringify(key).slice(0, 40);
    eq([(await call(fx, "/")).status, (await call(fx, "/")).text], [404, "PKG 404"], `${label}: owned route`);
    eq((await call(fx, "/about")).text, "PKG about", `${label}: route outside the owned space → package`);
    eq((await call(fx, "/assets/pkg.jpg")).text, "PKG image", `${label}: asset → package`);
    eq((await call(fx, "/assets/new.jpg")).status, 404, `${label}: asset the package does not have`);
    eq((await call(fx, "/portfolio")).text, "LIVE list", `${label}: the manifest's good entries still serve`);
    assert(fx.b.recorded.every((k) => !k.includes("other-site") && !readsAssets(k)), `${label}: read ${fx.b.recorded.join(", ")}`);
  }
  for (const contentType of ["text/html\r\nSet-Cookie: a=b", "", 5, "x".repeat(300), "text/html; charset=유니코드"]) {
    const fx = site("badtype");
    publish(fx, 1, { routes: { "/": { key: "blobs/x.html", sha256: "0".repeat(64), size: 1, contentType } } });
    fx.b.set(portfolioPublicKey(fx.siteId, "blobs/x.html"), "PAGE");
    const got = await call(fx, "/");
    eq([got.status, got.text, got.headers["set-cookie"]], [404, "PKG 404", undefined], `content type ${JSON.stringify(contentType).slice(0, 30)}`);
  }
  // paths that collide with Object.prototype members are not manifest entries
  const fx = site("proto");
  publish(fx, 1, { routes: {}, owned: { exact: [], prefixes: [] } });
  for (const p of ["/constructor", "/__proto__", "/toString", "/hasOwnProperty"]) eq((await call(fx, p)).status, 404, p);
});

await check("existing path rules hold under a live overlay: bad requests, the seal, spelled-out .html, methods", async () => {
  const fx = site("v2");
  publish(fx, 1, { ...LIVE, routes: { ...LIVE.routes, "/_package.json": "HIJACK" } });
  for (const p of ["/..%2f..%2fx", "/%00", "/a%00b", "/%5c..%5cx", "//evil.example/x", "///x", "/%E0%A4%A", "/portfolio//live-slug", "/portfolio/%2Flive-slug"]) {
    const got = await call(fx, p);
    eq([got.status, got.text], [400, "bad request\n"], p);
    eq(got.keys, [ROUTING(fx)], `${p}: rejected before any overlay or package read`);
  }
  await call(fx, "/_package.json");
  await call(fx, "/%5Fpackage.json");
  assert(!fx.b.recorded.includes(`get ${sealKey(fx.siteId, fx.hash)}`), "the seal object is never read");
  for (const p of ["/about.html", "/404.html", "/404", "/_not-found", "/about/"]) eq([(await call(fx, p)).status, p], [404, p], p);
  const post = await call(fx, "/portfolio", { method: "POST" });
  eq([post.status, post.headers.allow, post.keys], [405, "GET, HEAD", []], "POST");
  eq((await handle(new Request("https://unknown.test.example/portfolio"), fx.env)).status, 404, "unknown host");
});

await check("routeOfKey inverts resolvePath for every key it yields", () => {
  for (const p of ["/", "/about", "/portfolio/live-slug", "/index.txt", "/__next._full.txt", "/assets/a.jpg", "/a.b/c", "/x."]) {
    const r = resolvePath(p);
    assert(r.kind === "key", `${p}: ${r.kind}`);
    eq(routeOfKey(r.key), p, p);
  }
  const escaped = resolvePath("/%70ortfolio/%EA%B0%80");
  assert(escaped.kind === "key", "escaped path resolves");
  eq(routeOfKey(escaped.key), "/portfolio/가", "the decoded spelling");
});

// ── 6. manifest cache ───────────────────────────────────────────────────────────
console.log("\nrecon-runtime overlay: manifest cache");

await check("the manifest is read once per revision; a new pointer is live on the very next request (no stale route, asset or 404); rollback re-uses the cached manifest", async () => {
  const fx = site("cache");
  const r1 = publish(fx, 1, { routes: { "/": "home r1", "/portfolio/only-in-r1": "detail r1" }, assets: { "/assets/a.jpg": "tenant-1/a.jpg" } });
  eq((await call(fx, "/")).keys.includes(`get ${r1.manifestKey}`), true, "first request reads the manifest");
  for (const [p, body] of [
    ["/", "home r1"],
    ["/portfolio/only-in-r1", "detail r1"],
    ["/assets/a.jpg", "IMAGE tenant-1/a.jpg"],
  ] as const) {
    const got = await call(fx, p);
    eq(got.text, body, `r1 ${p}`);
    eq([got.keys.length, got.keys.includes(CURRENT(fx)), got.keys.includes(`get ${r1.manifestKey}`)], [3, true, false], `r1 ${p}: pointer read, manifest from memory`);
  }

  const r2 = publish(fx, 2, { routes: { "/": "home r2", "/portfolio/only-in-r2": "detail r2" } });
  const first = await call(fx, "/");
  eq([first.text, first.keys.includes(`get ${r2.manifestKey}`)], ["home r2", true], "r2 is live on the next request");
  eq([(await call(fx, "/portfolio/only-in-r1")).status, (await call(fx, "/assets/a.jpg")).status], [404, 404], "what r2 dropped is gone");
  eq((await call(fx, "/portfolio/only-in-r2")).text, "detail r2", "what r2 added answers");

  fx.b.set(portfolioCurrentKey(fx.siteId, fx.hash), r1.pointerBytes, "application/json");
  const back = await call(fx, "/");
  eq([back.text, back.keys.length], ["home r1", 3], "rollback: r1 again, its manifest still in memory");
  eq([(await call(fx, "/portfolio/only-in-r2")).status, (await call(fx, "/assets/a.jpg")).status], [404, 200], "…and only r1's set");

  fx.b.objects.delete(portfolioCurrentKey(fx.siteId, fx.hash));
  const removed = await call(fx, "/");
  eq([removed.status, removed.text, removed.trace.outcome], [503, "content unavailable\n", "overlay-absent"], "pointer removed: closed — cached manifests are not consulted, the shell page is not served");
});

await check("the cache is bounded: after 32 newer manifests the first one is read (and verified) again", async () => {
  const fx = site("bound");
  const r1 = publish(fx, 1, { routes: { "/": "home 1" } });
  await call(fx, "/");
  eq((await call(fx, "/")).keys.includes(`get ${r1.manifestKey}`), false, "cached");
  for (let rev = 2; rev <= 33; rev++) {
    publish(fx, rev, { routes: { "/": `home ${rev}` } });
    eq((await call(fx, "/")).text, `home ${rev}`, `revision ${rev}`);
  }
  fx.b.set(portfolioCurrentKey(fx.siteId, fx.hash), r1.pointerBytes, "application/json");
  const again = await call(fx, "/");
  eq([again.text, again.keys.includes(`get ${r1.manifestKey}`)], ["home 1", true], "evicted → loaded again");
  // a cached verdict never outlives the bytes: the same key with other bytes is a different cache entry, and is refused
  fx.b.set(r1.manifestKey, JSON.stringify({ schema: "portfolio-manifest@1", tampered: true }), "application/json");
  eq((await call(fx, "/")).text, "home 1", "tampering a cached manifest's object changes nothing while it is cached");
  for (let rev = 34; rev <= 66; rev++) {
    publish(fx, rev, { routes: { "/": `home ${rev}` } });
    await call(fx, "/");
  }
  fx.b.set(portfolioCurrentKey(fx.siteId, fx.hash), r1.pointerBytes, "application/json");
  const tampered = await call(fx, "/");
  eq([tampered.status, tampered.text, tampered.trace.overlay], [503, "content unavailable\n", "manifest-sha256"], "once evicted, the tampered object fails verification → 503, not the shell page");
});

await check("default export: a refused overlay is a 503 that logs exactly one line (overlay-refused, the reason, no query string); a served overlay logs none", async () => {
  const fx = site("log");
  publish(fx, 1, { ...LIVE, pointer: (p) => void (p.siteId = "other-site") });
  const ok = site("log");
  publish(ok, 1, LIVE);
  const lines: string[] = [];
  const original = console.log;
  console.log = (l: string) => void lines.push(l);
  try {
    const r = await runtimeDefault.fetch(new Request(`https://${fx.host}/?secret=1`), fx.env);
    eq([r.status, await r.text(), r.headers.get("cache-control")], [503, "content unavailable\n", "no-store"], "refused → 503, never the package page");
    const served = await runtimeDefault.fetch(new Request(`https://${ok.host}/`), ok.env);
    eq(await served.text(), "LIVE home", "served");
  } finally {
    console.log = original;
  }
  eq(lines.length, 1, "one line");
  const line = JSON.parse(lines[0]!);
  eq([line.host, line.path, line.status, line.outcome, line.overlay], [fx.host, "/", 503, "overlay-refused", "current-identity"], "line fields");
  assert(!lines[0]!.includes("secret"), "no query string");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
