/**
 * Static deployment foundation — end-to-end test.
 *
 * LOCAL mode (default, no Cloudflare account, nothing remote):
 *   1. site:publish of the site's CURRENT package through the real wrangler backend
 *      (`wrangler r2 object put/get --local --persist-to <dir>`), fresh state dir under tmp/
 *   2. republish → immutable skip (seal present), pointer unchanged
 *   3. `wrangler dev --local --persist-to <same dir>` runs workers/recon-runtime
 *   4. HTTP: every addressable package file byte-identical with stored content-type/cache-control;
 *      404 page; HEAD; 304; 405; unknown host; traversal; "%24" spelling of RSC names
 *   5. SEO delivery invariants over HTTP (title/description/canonical/ld+json counts, robots.txt,
 *      sitemap.xml <loc> reachability)
 *   6. Playwright at 390 and 1440 on the main routes: status, broken requests, console errors,
 *      external requests, horizontal overflow, broken images; client-side navigation (RSC .txt 200,
 *      no document reload); mobile menu, desktop nav, gallery/photo viewer, contact form
 *      interaction smokes; a javaScriptEnabled:false pass over the main routes
 *   7. package directory under data/site-builds/** byte-identical before/after
 * Results → docs/result/static-deployment-foundation/proof/local-e2e.json
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/publish-e2e.test.ts   (pnpm test:publish:e2e)
 *   env: E2E_PORT (8788), E2E_REUSE_STATE=1 keeps the existing state dir (skips the fresh upload)
 *
 * LIVE mode (env E2E_BASE, e.g. E2E_BASE=https://pilot.example.com): read-only against an
 * already-deployed host. Steps 1–3 above are skipped entirely — no WranglerStore, no publishSite,
 * no `wrangler dev` spawned; nothing is written anywhere. BASE/HOST/PORT are taken from E2E_BASE
 * (https → port 443 by default). The checks that need a custom Host header or the loopback IP
 * (unknown-Host, 127.0.0.1) are skipped and logged as such; everything else runs against E2E_BASE,
 * including the byte-equality check (which compares the LIVE host's bytes against the LOCAL current
 * package — a real mismatch is a real failure). Live mode adds one extra check: every canonical URL
 * and every sitemap <loc> shares E2E_BASE's origin (skipped in local mode, where the package is
 * deliberately baked for a different origin). Results → …/proof/live-e2e.json (local-e2e.json is
 * never touched by a live run). Live mode cannot be exercised against a real host yet; its plumbing
 * is instead verified by a dry run against an address nothing is listening on, which must fail fast
 * on the first connection attempt and must not publish or spawn wrangler.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { planPublish, publishSite } from "../publish/publish";
import { WranglerStore } from "../publish/wrangler-store";
import { sha256 } from "../util/hash";

// wrangler dev listens on 127.0.0.1; Node would otherwise try ::1 first for "localhost"
dns.setDefaultResultOrder("ipv4first");

const repoRoot = process.cwd();
const SITE = process.env.PUBLISH_TEST_SITE ?? "boost-interior-demo";

// ── LOCAL vs LIVE ────────────────────────────────────────────────────────────────────────────
const E2E_BASE = process.env.E2E_BASE?.trim() || undefined;
const LIVE = !!E2E_BASE;
const liveUrl = LIVE ? new URL(E2E_BASE!) : undefined;
const HOST = LIVE ? liveUrl!.hostname : "localhost";
const PORT = LIVE ? Number(liveUrl!.port || (liveUrl!.protocol === "https:" ? 443 : 80)) : Number(process.env.E2E_PORT ?? 8788);
const BASE = LIVE ? E2E_BASE!.replace(/\/+$/, "") : `http://${HOST}:${PORT}`;
const STATE = "tmp/recon-runtime-e2e-state";
const OUT = LIVE ? "docs/result/static-deployment-foundation/proof/live-e2e.json" : "docs/result/static-deployment-foundation/proof/local-e2e.json";

let passed = 0;
const failed: string[] = [];
const skipped: string[] = [];
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
function skip(name: string, reason: string) {
  skipped.push(name);
  console.log(`  skip ${name}\n       (${reason})`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
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
/** Raw HTTP (no URL normalisation, custom Host header). LOCAL always dials 127.0.0.1; LIVE dials HOST:PORT (https via node:https). */
function raw(method: string, rawPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const secure = BASE.startsWith("https:");
    const options = LIVE
      ? { hostname: HOST, port: PORT, method, path: rawPath, headers: { host: HOST, ...headers } }
      : { host: "127.0.0.1", port: PORT, method, path: rawPath, headers: { host: `${HOST}:${PORT}`, ...headers } };
    const onRes = (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks), headers: res.headers }));
    };
    const r = secure ? https.request(options, onRes) : http.request(options, onRes);
    r.on("error", reject);
    r.end();
  });
}

// ── minimal parse5 head-fact extraction (title / meta description / canonical / ld+json) ──────
type P5Node = DefaultTreeAdapterTypes.Node;
type P5Element = DefaultTreeAdapterTypes.Element;
function isElement(node: P5Node): node is P5Element {
  return "tagName" in node;
}
function attrOf(node: P5Element, name: string): string | null {
  const found = node.attrs.find((a) => a.name.toLowerCase() === name);
  return found ? found.value : null;
}
interface HeadFacts { titles: number; descriptions: number; canonicals: number; canonicalHrefs: string[]; ldJson: number }
function headFacts(html: string): HeadFacts {
  const facts: HeadFacts = { titles: 0, descriptions: 0, canonicals: 0, canonicalHrefs: [], ldJson: 0 };
  const walk = (node: P5Node): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      if (tag === "title") facts.titles++;
      else if (tag === "meta" && attrOf(node, "name")?.toLowerCase() === "description" && attrOf(node, "content") !== null) facts.descriptions++;
      else if (tag === "link" && attrOf(node, "rel")?.toLowerCase() === "canonical") {
        const href = attrOf(node, "href");
        if (href) {
          facts.canonicals++;
          facts.canonicalHrefs.push(href);
        }
      } else if (tag === "script" && attrOf(node, "type")?.toLowerCase() === "application/ld+json") facts.ldJson++;
    }
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
  };
  walk(parse(html));
  return facts;
}

const results: Record<string, unknown> = { mode: LIVE ? "live" : "local", site: SITE, host: HOST, port: PORT, base: BASE, startedAt: new Date().toISOString() };
const current = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SITE, "current.json"), "utf8")) as { packageDir: string };
const packageDir = path.join(repoRoot, current.packageDir);
const before = await treeHash(packageDir);
const plan = await planPublish({ repoRoot, siteId: SITE, hostname: HOST });
const fileBytes = new Map<string, Buffer>();
for (const f of plan.files) fileBytes.set(f.path, await readFile(f.abs));
const detail = plan.files.find((f) => /^portfolio\/[^/]+\.html$/.test(f.path))!.path.slice(0, -5);
results.package = { packageDir: current.packageDir, packageHash: plan.packageHash, buildInputId: plan.buildInputId, releaseId: plan.releaseId, files: plan.files.length, bytes: plan.bytes };
console.log(`package ${plan.packageHash.slice(0, 16)}… (${plan.releaseId}) · ${plan.files.length} files · ${plan.bytes} B`);
if (LIVE) console.log(`mode: LIVE — read-only against ${BASE}`);

// ── 1–2. publish through wrangler (local only) ─────────────────────────────────────────────────
if (!LIVE) {
  console.log("\npublish (wrangler --local)");
  if (process.env.E2E_REUSE_STATE !== "1") await rm(path.join(repoRoot, STATE), { recursive: true, force: true });
  const store = new WranglerStore({ repoRoot, bucket: "boost-sites-artifacts", mode: "local", persistTo: STATE });
  await check("site:publish uploads + verifies every file, seals, then writes routing/localhost.json", async () => {
    const t = Date.now();
    const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, expectPackageHash: plan.packageHash, store, log: (l) => console.log(`       ${l}`) });
    assert(r.status === "published", "status");
    results.publish = { upload: r.upload, uploaded: r.uploaded, verified: r.verified, pointerWrite: r.pointerWrite, ms: Date.now() - t };
    if (process.env.E2E_REUSE_STATE !== "1") eq([r.upload, r.uploaded, r.verified, r.pointerWrite], ["uploaded", plan.files.length, plan.files.length, "written"], "fresh publish");
  });
  await check("republish of the same package → immutable skip, pointer unchanged", async () => {
    const t = Date.now();
    const r = await publishSite({ repoRoot, siteId: SITE, hostname: HOST, expectPackageHash: plan.packageHash, store });
    assert(r.status === "published", "status");
    eq([r.upload, r.uploaded, r.pointerWrite], ["skipped-sealed", 0, "unchanged"], "skip");
    results.republish = { upload: r.upload, uploaded: r.uploaded, pointerWrite: r.pointerWrite, ms: Date.now() - t };
  });
  await check("_not-found.html (never addressable by URL) is stored byte-identical in R2", async () => {
    const f = plan.files.find((x) => x.path === "_not-found.html")!;
    const back = await store.get(f.key);
    assert(back && sha256(back) === f.sha256, "bytes");
  });
  await store.close();
} else {
  console.log(`\n[live mode] BASE=${BASE} — read-only, no publish, no wrangler dev started`);
  skip("site:publish uploads + verifies every file, seals, then writes routing pointer", "live mode performs no writes");
  skip("republish of the same package → immutable skip, pointer unchanged", "live mode performs no writes");
  skip("_not-found.html (never addressable by URL) is stored byte-identical in R2", "live mode touches no store");
}

// ── 3. wrangler dev (local only) ────────────────────────────────────────────────────────────────
let dev: ChildProcess | undefined;
let devLog = "";
async function startDev() {
  dev = spawn(
    path.join(repoRoot, "node_modules/.bin/wrangler"),
    ["dev", "-c", "workers/recon-runtime/wrangler.jsonc", "--local", "--persist-to", STATE, "--port", String(PORT), "--ip", "127.0.0.1", "--show-interactive-dev-session=false"],
    { cwd: repoRoot, env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  dev.stdout!.on("data", (d: Buffer) => (devLog += d.toString()));
  dev.stderr!.on("data", (d: Buffer) => (devLog += d.toString()));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/robots.txt`)).status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not become ready:\n${devLog.slice(-2000)}`);
}
function stopDev() {
  if (dev?.pid) {
    try {
      process.kill(-dev.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
process.on("exit", stopDev);

try {
  if (!LIVE) {
    console.log("\nwrangler dev (local)");
    await startDev();
    console.log(`  up at ${BASE}`);
  } else {
    console.log(`\n[live mode] read-only against ${BASE} — wrangler dev not started`);
  }

  // ── 4. HTTP ────────────────────────────────────────────────────────────────
  console.log("\nHTTP");
  const urlFor = (rel: string) => (rel === "index.html" ? "/" : rel === "404.html" || rel === "_not-found.html" ? undefined : `/${rel.endsWith(".html") ? rel.slice(0, -5) : rel}`);
  await check("every addressable package file: 200, stored content-type + cache-control, ETag, nosniff, bytes identical to the package", async () => {
    let n = 0;
    let bytes = 0;
    const bad: string[] = [];
    for (const f of plan.files) {
      const u = urlFor(f.path);
      if (!u) continue;
      const r = await fetch(`${BASE}${u}`);
      const body = Buffer.from(await r.arrayBuffer());
      const ok =
        r.status === 200 &&
        r.headers.get("content-type") === f.contentType &&
        r.headers.get("cache-control") === f.cacheControl &&
        !!r.headers.get("etag") &&
        r.headers.get("x-content-type-options") === "nosniff" &&
        Buffer.compare(body, fileBytes.get(f.path)!) === 0;
      if (!ok) bad.push(`${u} ${r.status} ${r.headers.get("content-type")} ${r.headers.get("cache-control")} ${body.length}B`);
      n++;
      bytes += body.length;
    }
    results.byteEquality = { addressable: n, identical: n - bad.length, bytes, notAddressable: ["404.html (served as the 404 body)", "_not-found.html (verified in R2)"] };
    eq(bad, [], "mismatches");
    eq(n, plan.files.length - 2, "addressable count");
  });
  await check("unknown path / .html spelled out / trailing slash → 404 with the package's 404.html bytes", async () => {
    const nf = fileBytes.get("404.html")!;
    for (const p of ["/no-such-page", "/about.html", "/index.html", "/about/", "/_package.json", "/portfolio/no-such-project"]) {
      const r = await fetch(`${BASE}${p}`);
      const body = Buffer.from(await r.arrayBuffer());
      eq([r.status, Buffer.compare(body, nf), r.headers.get("content-type")], [404, 0, "text/html; charset=utf-8"], p);
    }
  });
  await check("HEAD → 200 + Content-Length, no body; conditional GET with ETag → 304; POST/PUT/DELETE → 405 Allow: GET, HEAD", async () => {
    const idx = plan.files.find((f) => f.path === "index.html")!;
    const h = await raw("HEAD", "/");
    eq([h.status, h.headers["content-length"], h.body.length], [200, String(idx.size), 0], "HEAD /");
    const js = plan.files.find((f) => f.path.startsWith("_next/static/") && f.path.endsWith(".js"))!;
    const hj = await raw("HEAD", `/${js.path}`);
    eq([hj.status, hj.headers["content-length"], hj.headers["cache-control"]], [200, String(js.size), js.cacheControl], "HEAD js");
    for (const u of ["/", `/${js.path}`, "/portfolio"]) {
      const etag = (await fetch(`${BASE}${u}`, { method: "HEAD" })).headers.get("etag")!;
      const c = await fetch(`${BASE}${u}`, { headers: { "If-None-Match": etag } });
      eq([c.status, (await c.arrayBuffer()).byteLength], [304, 0], `304 ${u}`);
    }
    for (const m of ["POST", "PUT", "DELETE"]) {
      const r = await raw(m, "/");
      eq([r.status, r.headers.allow], [405, "GET, HEAD"], m);
    }
  });
  if (!LIVE) {
    await check("unknown Host → plain 404 (no fallback)", async () => {
      const r = await raw("GET", "/", { host: `unknown.example:${PORT}` });
      eq([r.status, r.body.toString()], [404, "unknown host\n"], "unknown host");
    });
    await check("127.0.0.1 (loopback) has no routing pointer → 404", async () => {
      const ip = await fetch(`http://127.0.0.1:${PORT}/`);
      eq(ip.status, 404, "127.0.0.1 has no pointer");
    });
  } else {
    skip("unknown Host → plain 404 (no fallback)", "needs a custom Host header — not meaningful against a real deployed host");
    skip("127.0.0.1 (loopback) has no routing pointer → 404", "needs the loopback IP — not meaningful against a real deployed host");
  }
  await check("traversal / encoded separators → 400 (or 404, never leaking a non-site file)", async () => {
    for (const p of ["/..%2f..%2fetc%2fpasswd", "/a%5cb", "/%E0%A4%A"]) eq((await raw("GET", p)).status, 400, p);
    for (const p of ["/../build-record.json", "/_next/../../build-record.json"]) {
      const t = await raw("GET", p);
      assert(t.status === 400 || t.status === 404, `${p}: ${t.status}`);
      assert(!t.body.toString().includes("schemaVersion"), `${p} leaked a non-site file`);
    }
  });
  await check('RSC names: literal "$" and "%24" spelling serve the same object', async () => {
    const f = plan.files.find((x) => x.path.includes("$"))!;
    const a = Buffer.from(await (await fetch(`${BASE}/${f.path}`)).arrayBuffer());
    const b = Buffer.from(await (await fetch(`${BASE}/${f.path.replaceAll("$", "%24")}`)).arrayBuffer());
    assert(Buffer.compare(a, b) === 0 && sha256(a) === f.sha256, "bytes");
  });

  // ── 5. SEO delivery invariants (HTTP, no browser) ─────────────────────────────────────────────
  console.log("\nSEO (HTTP, no browser)");
  const seoTargets: { url: string; pkgPath: string }[] = [
    { url: "/", pkgPath: "index.html" },
    { url: "/portfolio", pkgPath: "portfolio.html" },
    { url: `/${detail}`, pkgPath: `${detail}.html` },
    { url: "/about", pkgPath: "about.html" },
  ];
  const seoFacts: Record<string, unknown> = {};
  const canonicalGaps: string[] = [];
  for (const t of seoTargets) {
    await check(`${t.url}: served head facts equal the package's (title, description, canonical, ld+json); exactly one <title>, a meta description`, async () => {
      const body = await (await fetch(`${BASE}${t.url}`)).text();
      const served = headFacts(body);
      const pkgBytes = fileBytes.get(t.pkgPath);
      assert(pkgBytes, `no package file for ${t.pkgPath}`);
      const pkg = headFacts(pkgBytes!.toString("utf8"));
      // headFacts walks real DOM elements (parse5), so text inside RSC/flight <script> payloads is never counted.
      seoFacts[t.url] = { served, package: pkg };
      if (pkg.canonicals !== 1) canonicalGaps.push(t.url);
      // Delivery invariant: the runtime adds, removes and rewrites nothing.
      eq([served.titles, served.descriptions, served.canonicals, served.canonicalHrefs, served.ldJson], [pkg.titles, pkg.descriptions, pkg.canonicals, pkg.canonicalHrefs, pkg.ldJson], `${t.url} served vs package`);
      eq([served.titles, served.descriptions >= 1], [1, true], `${t.url} title / description`);
    });
  }
  // Canonical coverage is PACKAGE CONTENT, not delivery. It is pinned exactly so that it can neither
  // get worse unnoticed nor be "fixed" unnoticed: interior-01 <= 1.5.1 gives the homepage no canonical
  // (templates/interior-01/v1/app/page.tsx never calls pageMetadata()); every other page has one.
  const templateVersion = (JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")) as { template: { templateVersion: string } }).template.templateVersion;
  const [maj, min, pat] = templateVersion.split(".").map(Number) as [number, number, number];
  const homeCanonicalGapKnown = maj < 1 || (maj === 1 && (min < 5 || (min === 5 && pat <= 1)));
  const expectedGaps = homeCanonicalGapKnown ? ["/"] : [];
  results.seoContentNotes = { templateVersion, pagesWithoutExactlyOneCanonical: canonicalGaps, expected: expectedGaps };
  await check(`canonical coverage of the package is exactly the known state for interior-01 ${templateVersion}: pages without a canonical = ${JSON.stringify(expectedGaps)} (KNOWN TEMPLATE GAP, not a delivery defect)`, () => {
    if (canonicalGaps.length > 0) console.log(`  NOTE package content: no <link rel="canonical"> on ${canonicalGaps.join(", ")} — served bytes are identical to the package; the fix is a Template release, not the runtime`);
    eq(canonicalGaps, expectedGaps, "pages without exactly one canonical");
  });
  results.seo = seoFacts;
  const robotsFile = plan.files.find((f) => f.path === "robots.txt")!;
  const sitemapFile = plan.files.find((f) => f.path === "sitemap.xml")!;
  await check("/robots.txt: 200, package content-type, contains a Sitemap: line", async () => {
    const r = await fetch(`${BASE}/robots.txt`);
    const body = await r.text();
    const hasSitemapLine = /^Sitemap:/m.test(body);
    results.robots = { status: r.status, contentType: r.headers.get("content-type"), hasSitemapLine };
    eq([r.status, r.headers.get("content-type"), hasSitemapLine], [200, robotsFile.contentType, true], "robots.txt");
  });
  await check("/sitemap.xml: 200, package content-type, every <loc> path answers 200 through the Worker", async () => {
    const r = await fetch(`${BASE}/sitemap.xml`);
    const body = await r.text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    const statuses: Record<string, number> = {};
    for (const loc of locs) {
      const pathname = new URL(loc).pathname;
      statuses[pathname] = (await fetch(`${BASE}${pathname}`)).status;
    }
    const allOk = locs.length > 0 && Object.values(statuses).every((s) => s === 200);
    results.sitemap = { status: r.status, contentType: r.headers.get("content-type"), locs: locs.length, statuses };
    eq([r.status, r.headers.get("content-type"), allOk], [200, sitemapFile.contentType, true], "sitemap.xml");
  });
  if (LIVE) {
    await check("live mode: every canonical URL and every sitemap <loc> share BASE's origin", async () => {
      const baseOrigin = new URL(BASE).origin;
      const canonicals: string[] = [];
      for (const f of plan.files) {
        if (!f.path.endsWith(".html")) continue;
        canonicals.push(...headFacts(fileBytes.get(f.path)!.toString("utf8")).canonicalHrefs);
      }
      const sitemapBody = fileBytes.get("sitemap.xml")?.toString("utf8") ?? "";
      const locs = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      const offenders = [...canonicals, ...locs].filter((u) => {
        try {
          return new URL(u).origin !== baseOrigin;
        } catch {
          return true;
        }
      });
      results.liveOriginCheck = { baseOrigin, canonicals: canonicals.length, locs: locs.length, offenders };
      eq(offenders, [], "URLs whose origin differs from BASE");
    });
  } else {
    skip("live mode: every canonical URL and every sitemap <loc> share BASE's origin", "the local package is baked for a different origin than BASE");
  }

  // ── 6. browser ────────────────────────────────────────────────────────────
  console.log("\nbrowser (Playwright, chromium)");
  const ROUTES = ["/", "/portfolio", `/${detail}`, "/3d-portfolio", "/about", "/contact", "/no-such-page"];
  const browser = await chromium.launch();
  const pageRows: Record<string, unknown>[] = [];
  let external: string[] = [];
  const allAborted = new Map<string, number>();
  async function scrollThrough(page: Page) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 600) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(60);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState("networkidle");
  }
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      const broken: string[] = [];
      const ext: string[] = [];
      let requests = 0;
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
      page.on("request", (r) => {
        requests++;
        if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) ext.push(r.url());
      });
      const aborted: string[] = [];
      // net::ERR_ABORTED = the client cancelled the request (Next cancels in-flight link prefetches
      // when links leave the viewport / the page closes) — not a server failure; checked below
      page.on("requestfailed", (r) => (r.failure()?.errorText === "net::ERR_ABORTED" ? aborted.push(r.url()) : broken.push(`FAILED ${r.url()} ${r.failure()?.errorText}`)));
      page.on("response", (r) => {
        if (r.status() >= 400 && !(route === "/no-such-page" && r.request().resourceType() === "document")) broken.push(`${r.status()} ${r.url()}`);
      });
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await scrollThrough(page);
      const m = await page.evaluate(() => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
        images: document.images.length,
        title: document.title,
      }));
      const expected = route === "/no-such-page" ? 404 : 200;
      // the 404 document itself is reported by Chrome as a console error; nothing else may be
      const unexpectedConsole = consoleErrors.filter((c) => !(route === "/no-such-page" && /status of 404/.test(c)));
      for (const u of new Set(aborted)) {
        if (!u.startsWith(BASE) || !allAborted.has(u)) allAborted.set(u, u.startsWith(BASE) ? (await fetch(u)).status : -1);
      }
      const row = { width, route, status: res?.status(), requests, aborted: aborted.length, broken: broken.length, consoleErrors: unexpectedConsole.length, external: ext.length, overflowPx: m.overflow, images: m.images, brokenImages: m.brokenImages.length, title: m.title };
      pageRows.push(row);
      external = external.concat(ext);
      await check(`${width}px ${route}: ${expected}, 0 broken, 0 console errors, 0 external, 0 overflow, 0 broken images (${requests} requests, ${m.images} images)`, () => {
        eq([res?.status(), broken, unexpectedConsole, ext, m.overflow, m.brokenImages], [expected, [], [], [], 0, []], `${width} ${route}`);
      });
      await page.close();
    }
    await ctx.close();
  }
  results.pages = pageRows;
  results.abortedByClient = Object.fromEntries(allAborted);
  await check(`client-cancelled requests (${allAborted.size} distinct URLs, Next link prefetches) are all same-origin URLs the runtime serves 200`, () => {
    eq([...allAborted].filter(([, st]) => st !== 200), [], "aborted URLs not served 200");
  });
  results.externalRequests = [...new Set(external)];

  await check("client-side navigation / → /portfolio → detail → /about → back: no document reload, RSC .txt fetches all 200, each page <title> applied", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const docs: string[] = [];
    const rsc: { url: string; status: number; type: string | null }[] = [];
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => r.resourceType() === "document" && docs.push(r.url()));
    page.on("response", (r) => {
      if (/\.txt(\?|$)/.test(new URL(r.url()).pathname + new URL(r.url()).search) && !r.url().endsWith("/robots.txt")) rsc.push({ url: r.url().replace(BASE, ""), status: r.status(), type: r.headers()["content-type"] ?? null });
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const steps: { path: string; title: string; expectedTitle: string }[] = [];
    // expected <title> per page, from the build record's own QA of the package
    const titles = (JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")) as { qa: { pages: Record<string, { title?: string }> } }).qa.pages;
    async function go(href: string | null, target: string) {
      if (href) await page.locator(`a[href="${href}"]:visible`).first().click();
      else await page.goBack();
      await page.waitForURL(`${BASE}${target}`);
      await page.waitForLoadState("networkidle");
      const expectedTitle = titles[`${target.slice(1)}.html`]?.title ?? "";
      // Next streams metadata: <title> is applied shortly after the URL changes
      await page.waitForFunction((t) => document.title === t, expectedTitle, { timeout: 5000 }).catch(() => undefined);
      steps.push({ path: target, title: await page.title(), expectedTitle });
    }
    await go("/portfolio", "/portfolio");
    await go(`/${detail}`, `/${detail}`);
    await go("/about", "/about");
    await go(null, `/${detail}`);
    results.clientNavigation = { steps, documentRequests: docs.length, rscFetches: rsc.length, rscNon200: rsc.filter((r) => r.status !== 200), rscSample: rsc.slice(0, 8), consoleErrors: errors };
    eq(docs.length, 1, "document requests (initial load only)");
    assert(rsc.length > 0, "no RSC fetches observed");
    eq(rsc.filter((r) => r.status !== 200 || r.type !== "text/plain; charset=utf-8"), [], "RSC non-200 / wrong type");
    eq(errors, [], "console errors");
    eq(steps.filter((st) => st.title !== st.expectedTitle), [], "page <title> after client navigation");
    await ctx.close();
  });

  // ── interaction smokes (A–D) ─────────────────────────────────────────────────────────────────
  console.log("\ninteraction smokes");
  const NAV = [
    { key: "portfolio", href: "/portfolio" },
    { key: "portfolio3d", href: "/3d-portfolio" },
    { key: "about", href: "/about" },
    { key: "contact", href: "/contact" },
  ];
  const EMAIL = "hello@boost-interior-demo.example";
  const SUCCESS = /접수되었|접수 완료|전송되었|전송 완료|완료되었/;
  // ~ 300 Korean characters: well under the 500-character textarea cap, far over the 2,000-character mailto limit once encoded
  const LONG_KO = Array.from({ length: 12 }, (_, i) => `${i + 1}번째 요청: 거실과 주방 수납을 늘리고 싶습니다.`).join("\n");

  // A. mobile 390: hamburger → dialog → Esc closes + focus back → reopen → portfolio link navigates + closes
  await check("A 390px: hamburger opens the dialog; Esc closes it and returns focus to the menu button; reopening and clicking the portfolio link navigates to /portfolio and closes it (0 console errors, 0 responses ≥ 400)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url()}`));
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.click("[data-menu-button]");
    await page.waitForTimeout(250);
    const open1 = await page.evaluate(() => !!(document.querySelector("dialog[data-menu]") as HTMLDialogElement | null)?.open);
    assert(open1, "dialog did not open on first press");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const afterEsc = await page.evaluate(() => ({ present: !!document.querySelector("dialog[data-menu]"), focusIsMenuButton: document.activeElement?.hasAttribute("data-menu-button") ?? false }));
    assert(!afterEsc.present && afterEsc.focusIsMenuButton, `after Esc: ${JSON.stringify(afterEsc)}`);
    await page.click("[data-menu-button]");
    await page.waitForTimeout(250);
    const open2 = await page.evaluate(() => !!(document.querySelector("dialog[data-menu]") as HTMLDialogElement | null)?.open);
    assert(open2, "dialog did not reopen on second press");
    await page.click('dialog[data-menu] [data-menu-link="portfolio"]');
    await page.waitForURL((u) => u.pathname === "/portfolio", { timeout: 5000 });
    await page.waitForTimeout(300);
    const afterNav = await page.evaluate(() => !!document.querySelector("dialog[data-menu]"));
    results.mobileMenuInteraction = { consoleErrors, badResponses };
    eq([new URL(page.url()).pathname, afterNav, consoleErrors, badResponses], ["/portfolio", false, [], []], "final state");
    await ctx.close();
  });

  // B. desktop 1440: header nav links → client-side navigation to the 4 routes
  await check("B 1440px: header nav links navigate client-side to /portfolio, /3d-portfolio, /about, /contact (one document load, no console errors, 0 responses ≥ 400)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const badResponses: string[] = [];
    const documents: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url()}`));
    page.on("request", (r) => r.resourceType() === "document" && documents.push(r.url()));
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const walked: { key: string; href: string; landedOn: string }[] = [];
    for (const item of NAV) {
      await page.click(`.i1-header__nav [data-nav="${item.key}"]`);
      await page.waitForURL((u) => u.pathname === item.href, { timeout: 5000 });
      await page.waitForLoadState("networkidle");
      walked.push({ key: item.key, href: item.href, landedOn: new URL(page.url()).pathname });
    }
    results.desktopNavWalk = { walked, documentRequests: documents.length, consoleErrors, badResponses };
    eq([documents.length, walked.every((w) => w.landedOn === w.href), consoleErrors, badResponses], [1, true, [], []], "nav walk (1 initial document load, every link landed, no errors)");
    await ctx.close();
  });

  // C. gallery / photo viewer on the detail page, both widths
  async function gallerySmoke(width: number, height: number, mobile: boolean) {
    const ctx = await browser.newContext(mobile ? { viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width, height } });
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && badResponses.push(`${r.status()} ${r.url()}`));
    await page.goto(`${BASE}/${detail}`, { waitUntil: "networkidle" });
    await page.click(`[data-gallery-panel="all"] [data-gallery-item]:nth-child(1) [data-gallery-zoom]`);
    await page.waitForSelector("dialog[data-gallery-viewer][open]", { timeout: 4000 });
    await page.waitForFunction(() => {
      const img = document.querySelector<HTMLImageElement>("[data-viewer-img]");
      return !!img && img.complete && img.naturalWidth > 0;
    }, undefined, { timeout: 4000 });
    const v1 = await page.evaluate(() => ({
      counter: document.querySelector("[data-viewer-counter]")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      src: document.querySelector<HTMLImageElement>("[data-viewer-img]")?.getAttribute("src") ?? null,
      naturalWidth: document.querySelector<HTMLImageElement>("[data-viewer-img]")?.naturalWidth ?? 0,
    }));
    const imgUrl = new URL(v1.src ?? "", `${BASE}/`).toString();
    const sameOrigin = new URL(imgUrl).origin === new URL(BASE).origin;
    const imgResp = await fetch(imgUrl);
    await page.click('[data-viewer-arrow="next"]');
    await page.waitForTimeout(250);
    const counter2 = await page.evaluate(() => document.querySelector("[data-viewer-counter]")?.textContent?.replace(/\s+/g, " ").trim() ?? null);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => !document.querySelector("dialog[data-gallery-viewer]"));
    results[`gallery${width}`] = { v1, imgStatus: imgResp.status, sameOrigin, counter2, closed, consoleErrors, badResponses };
    eq([v1.naturalWidth > 0, sameOrigin, imgResp.status, counter2 !== v1.counter, closed, consoleErrors, badResponses], [true, true, 200, true, true, [], []], `gallery @ ${width}`);
    await ctx.close();
  }
  await check("C 390px: gallery photo viewer opens with a loaded same-origin image (200), next changes the counter, Escape closes it (0 console errors, 0 responses ≥ 400)", () => gallerySmoke(390, 844, true));
  await check("C 1440px: gallery photo viewer opens with a loaded same-origin image (200), next changes the counter, Escape closes it (0 console errors, 0 responses ≥ 400)", () => gallerySmoke(1440, 900, false));

  // D. contact form: short message → mailto hand-off, no network, no success claim; long message → no hand-off, copy fallback shown
  async function contactSmoke(width: number, height: number) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const requests: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
    // record mailto hand-offs instead of leaving for a mail app (same technique as the ia/ia151 smokes)
    await page.evaluate(() => {
      const w = window as unknown as { __handoffs: string[] };
      w.__handoffs = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.href.startsWith("mailto:")) w.__handoffs.push(this.href);
        else orig.call(this);
      };
    });
    const handoffs = () => page.evaluate(() => (window as unknown as { __handoffs: string[] }).__handoffs.slice());
    await page.fill("[name=name]", "홍길동");
    await page.fill("[name=phone]", "010-1234-5678");
    await page.fill("[name=message]", "간단한 문의입니다. 견적 부탁드립니다.");
    const before = requests.length;
    await page.click("[data-inquiry-submit]");
    await page.waitForTimeout(300);
    const shortHandoffs = await handoffs();
    const shortStatus = (await page.textContent("[data-inquiry-status]")) ?? "";
    const noNetworkOnSubmit = requests.length === before;
    // now a too-long message
    await page.fill("[name=message]", LONG_KO);
    await page.click("[data-inquiry-submit]");
    await page.waitForTimeout(300);
    const afterLongHandoffs = await handoffs(); // must still be the one short-message hand-off — no new one appended
    const longStatus = (await page.textContent("[data-inquiry-status]")) ?? "";
    const fallbackVisible = await page.evaluate(() => {
      const box = document.querySelector("[data-inquiry-fallback]");
      if (!box) return false;
      const r = box.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    results[`contact${width}`] = { shortHandoffs, shortStatus, afterLongHandoffs, longStatus, fallbackVisible, noNetworkOnSubmit, consoleErrors };
    eq(
      [shortHandoffs.length, shortHandoffs[0]?.startsWith(`mailto:${EMAIL}`), SUCCESS.test(shortStatus), noNetworkOnSubmit, afterLongHandoffs.length, fallbackVisible, SUCCESS.test(longStatus), consoleErrors],
      [1, true, false, true, 1, true, false, []],
      `contact @ ${width}`,
    );
    await ctx.close();
  }
  await check("D 1440px: contact form — short message hands off a mailto: link with no success claim and no network request; a too-long message hands off nothing and shows the copy fallback (0 console errors)", () => contactSmoke(1440, 900));
  await check("D 390px: contact form — short message hands off a mailto: link with no success claim and no network request; a too-long message hands off nothing and shows the copy fallback (0 console errors)", () => contactSmoke(390, 844));

  // ── F. JS disabled ───────────────────────────────────────────────────────────────────────────
  console.log("\nJS disabled (javaScriptEnabled: false)");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const NAV_EXPECTED = NAV.map(({ key, href }) => ({ key, href }));
    results.jsDisabled = {};
    for (const route of ["/", "/portfolio", `/${detail}`, "/about", "/contact"]) {
      const wantsImage = route === "/" || route === `/${detail}`;
      await check(`F JS disabled ${route}: 200, <h1> with text, body text > 200 chars, header nav present${wantsImage ? ", a visible loaded <img>" : ""}`, async () => {
        const page = await ctx.newPage();
        const res = await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        await page.waitForTimeout(300);
        // trigger any natively (non-JS) lazy-loaded images — real input events (mouse wheel), not
        // an in-page evaluate: with javaScriptEnabled:false, page-context timers (setTimeout) never
        // fire, so an async page.evaluate() that awaits one hangs until Playwright GCs the promise
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(80);
        }
        await page.mouse.wheel(0, -6000);
        await page.waitForTimeout(200);
        const data = await page.evaluate(() => ({
          h1: document.querySelector("h1")?.textContent?.trim() ?? "",
          bodyLen: (document.body.innerText || "").length,
          nav: Array.from(document.querySelectorAll(".i1-header__nav a[data-nav]")).map((a) => ({ key: a.getAttribute("data-nav"), href: a.getAttribute("href") })),
          visibleLoadedImage: Array.from(document.images).some((img) => img.naturalWidth > 0 && img.getClientRects().length > 0),
        }));
        (results.jsDisabled as Record<string, unknown>)[route] = { status: res?.status(), ...data };
        assert(res?.status() === 200, `status ${res?.status()}`);
        assert(data.h1.length > 0, "no <h1> text");
        assert(data.bodyLen > 200, `body innerText length ${data.bodyLen}`);
        eq(data.nav, NAV_EXPECTED, "header nav");
        if (wantsImage) assert(data.visibleLoadedImage, "no visible loaded <img> with JS disabled");
        await page.close();
      });
    }
    await ctx.close();
  }

  await browser.close();
} finally {
  stopDev();
}

// ── 7. package identity ───────────────────────────────────────────────────────
await check("published package directory under data/site-builds is byte-identical before/after", async () => {
  const after = await treeHash(packageDir);
  results.packageIdentity = { before, after };
  eq(after, before, "tree hash");
});

results.passed = passed;
results.failed = failed;
results.skipped = skipped;
results.finishedAt = new Date().toISOString();
await mkdir(path.dirname(path.join(repoRoot, OUT)), { recursive: true });
await writeFile(path.join(repoRoot, OUT), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${passed} passed, ${failed.length} failed, ${skipped.length} skipped   (→ ${OUT})`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
process.exit(0);
