/**
 * Incremental portfolio publishing — the proof (`pnpm test:portfolio-runtime`).
 *
 * Demo 02 (data/sites/boost-interior-demo-02) is built ONCE as a shell package; its portfolio pages
 * are composed afterwards by the release's runtime kit, with no build. This file holds that to the
 * last ORDINARY build of the same site and to a real browser:
 *
 *   A  the shell package         runtime.json + shell.json sealed in it, shell pages are placeholders
 *                                without a title, no project URL and no integration feed in it
 *   B  the kit                   built here from the release store, import-free, loaded from an empty
 *                                directory; composes the site from the package + Demo 02's own
 *                                dataset as the export (8 records, real sha256/size); deterministic;
 *                                refuses bad input without throwing
 *   C  parity                    / , /portfolio and every /portfolio/<slug> against the last V1
 *                                package of Demo 02: <main> markup and title / description /
 *                                canonical / og:* / twitter:* — ACCEPTED_DIFFERENCES lists what may
 *                                differ, everything else is compared byte for byte
 *   D  browser                   headless Chromium, desktop + mobile, served with the Worker's rule
 *                                (§2.5): no console error, the list filter + back/forward, the
 *                                gallery, list → detail is a document load, unknown slug = 404
 *   E  a 9th record              the kit alone, again: the new detail page, its card on /portfolio,
 *                                the home sections — and the package directory hash did not move
 *
 * The site root is the working directory (data/sites, data/site-builds, data/template-releases);
 * the V1 reference package is read from the commit that last carried it as `current`.
 * Env: PORTFOLIO_RUNTIME_KIT_DIR — a vendored kit directory; its renderer.mjs must then be
 * byte-identical to the one built here.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import { packageIntact } from "../build/site-build";
import { escapeHtml, escapeJsonForScript, headTags, sitemapXml } from "../portfolio-runtime/compose";
import { RUNTIME_DIR, RUNTIME_FILE, RuntimeDocSchema, SHELL_FILE, ShellDocSchema } from "../portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult, RuntimeKitInfo } from "../portfolio-runtime/entry";
import { KIT_FILE, RENDERER_FILE, buildRuntimeKit } from "../portfolio-runtime/kit";
import { readPortfolioSource } from "../portfolio-sync/managed";
import { loadRelease } from "../release/release";
import { gitMaterialize } from "./git-checkout";
import { NOT_FOUND_KEY, resolvePath } from "../../workers/recon-runtime/src/paths";

const repoRoot = process.cwd();
const CODE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = "boost-interior-demo-02";
const AT = "2026-10-10T00:00:00.000Z";
/** the last ordinary (V1) package of Demo 02: release interior-02 1.0.1, all 8 records built in */
const V1 = { commit: "da1f551171a7fcd70d967adb6fe1eb525cd674c4", buildInputId: "9314d888bf9bf4596693abf11c153242ba894b5ae36209e04a562fdbf21cffc6" };
const SLOT_ATTRIBUTE = "data-portfolio-slot";
const HOME_SECTIONS = ["home.hero", "home.projects", "home.keywords", "home.recent"];
/** React's hydration failures in a production build: minified errors #418 / #423 / #425 (and their dev wording) */
const HYDRATION_ERROR = /#(418|423|425)\b|react\.dev\/errors\/(418|423|425)|hydrat/i;

/**
 * What a composed page may differ in from the page an ordinary build writes — the complete list.
 * normalizeMain() applies exactly these two; parity then compares bytes.
 */
const ACCEPTED_DIFFERENCES = [
  "Suspense boundary markers <!--$--> … <!--/$--> around each runtime slot (the shell renders a slot inside its own boundary; an ordinary build renders the section directly)",
  'the values of React-generated ids: "_R_…_" in an ordinary build, "rs-<slot>-<name>" in a composed page (same elements, same references between them)',
];

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
    return true;
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
    return false;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x?.slice(0, 600)} ≠ ${y?.slice(0, 600)}`);
}
function sameText(a: string, b: string, msg: string) {
  if (a === b) return;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  throw new Error(`${msg}: first difference at ${i}\n  composed: …${a.slice(Math.max(0, i - 80), i + 160)}\n  built:    …${b.slice(Math.max(0, i - 80), i + 160)}`);
}
const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as any;

async function treeHash(dir: string): Promise<{ hash: string; files: number }> {
  const h = createHash("sha256");
  let files = 0;
  const walk = async (rel: string) => {
    for (const e of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else {
        h.update(`${r}\0${sha256(await readFile(path.join(dir, r)))}\n`);
        files++;
      }
    }
  };
  await walk("");
  return { hash: h.digest("hex"), files };
}

// ── page anatomy ────────────────────────────────────────────────────────────────────────────────
function mainOf(html: string): string {
  const m = /<main[\s>][\s\S]*?<\/main>/.exec(html);
  assert(m, "the page has no <main>");
  return m[0];
}
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** ACCEPTED_DIFFERENCES, applied: boundary markers removed, generated ids renamed in order of first appearance. */
function normalizeMain(main: string): { text: string; markers: number; ids: number } {
  const markers = count(main, "<!--$-->");
  const ids = new Map<string, string>();
  const text = main
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replace(/_R_[0-9a-z]+_|rs-(?:home|portfolio)-[a-z]+-(?:browser|gallery|total)(?![a-z])/g, (id) => ids.get(id) ?? (ids.set(id, `ID${ids.size + 1}`), ids.get(id)!));
  return { text, markers, ids: ids.size };
}
/** title · description · robots · canonical · og:* · twitter:*, in document order, exactly as written */
function seoTags(html: string): string[] {
  const head = html.slice(0, html.indexOf("</head>"));
  return head.match(/<title>[\s\S]*?<\/title>|<meta (?:name="description"|name="robots"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>|<link rel="canonical"[^>]*>/g) ?? [];
}
const fileOf = (urlPath: string) => (urlPath === "/" ? "index.html" : `${urlPath.slice(1)}.html`);

// ── the Worker's overlay rule (contract §2.5) over local files ───────────────────────────────────
interface Overlay {
  routes: Map<string, { contentType: string; body: string }>;
  assets: Map<string, { file: string; contentType: string }>;
  owned: { exact: string[]; prefixes: string[] };
}
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
/** an owned page, or the RSC payload (".txt") form of one */
function isOwned(owned: Overlay["owned"], pathname: string): boolean {
  const page = pathname.endsWith(".txt") ? (pathname === "/index.txt" || /^\/__next\.[^/]*\.txt$/.test(pathname) ? "/" : pathname.replace(/(?:\/__next\.[^/]*)?\.txt$/, "")) : pathname;
  return owned.exact.includes(page) || owned.prefixes.some((p) => page === p || page.startsWith(`${p}/`));
}
interface Served {
  path: string;
  status: number;
  from: "package" | "route" | "asset" | "owned-miss" | "miss";
}
async function startServer(packageSite: string, overlay: () => Overlay, log: Served[]) {
  const server = http.createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const send = (status: number, type: string, body: Uint8Array | string, from: Served["from"]) => {
        log.push({ path: pathname, status, from });
        res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
        res.end(body);
      };
      const fromPackage = async (key: string, status: number, from: Served["from"]) => {
        try {
          send(status, TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream", await readFile(path.join(packageSite, key)), from);
        } catch {
          send(404, TYPES[".html"]!, await readFile(path.join(packageSite, NOT_FOUND_KEY)), "miss");
        }
      };
      const resolved = resolvePath(pathname);
      if (resolved.kind === "bad-request") return send(400, "text/plain", "bad request", "miss");
      const o = overlay();
      // 1. /_runtime/ → 404, always; /_next/ → package only
      if (pathname === "/_runtime" || pathname.startsWith("/_runtime/")) return fromPackage(NOT_FOUND_KEY, 404, "miss");
      if (pathname.startsWith("/_next/")) return fromPackage(resolved.kind === "key" ? resolved.key : NOT_FOUND_KEY, resolved.kind === "key" ? 200 : 404, resolved.kind === "key" ? "package" : "miss");
      // 4. a route of the published revision
      const route = o.routes.get(pathname);
      if (route) return send(200, route.contentType, route.body, "route");
      // 5. a published image
      const asset = o.assets.get(pathname);
      if (asset) return send(200, asset.contentType, await readFile(asset.file), "asset");
      // 6. owned URL space the revision does not answer → the package's 404 page
      if (isOwned(o.owned, pathname)) return fromPackage(NOT_FOUND_KEY, 404, "owned-miss");
      // 7. everything else → the package
      return fromPackage(resolved.kind === "key" ? resolved.key : NOT_FOUND_KEY, resolved.kind === "key" ? 200 : 404, resolved.kind === "key" ? "package" : "miss");
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
const siteDir = path.join(repoRoot, "data/sites", SITE);
const tmp = await mkdtemp(path.join(tmpdir(), "portfolio-runtime-proof-"));
const results: Record<string, unknown> = {};
try {
  // ── A. the shell package ──────────────────────────────────────────────────────────────────────
  console.log("A. shell package");
  const current = await readJson(path.join(repoRoot, "data/site-builds", SITE, "current.json"));
  const packageDir = path.join(repoRoot, current.packageDir as string);
  const packageSite = path.join(packageDir, "site");
  const record = await readJson(path.join(packageDir, "build-record.json"));
  const site = await readJson(path.join(siteDir, "site.json"));
  const pin = site.template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
  const before = await treeHash(packageDir);
  let runtime: any;
  let shell: any;
  let shellPages: Record<string, string> = {};

  await check("A1 the site is marked incremental and its current package is intact, built with the pinned release", async () => {
    eq(await readPortfolioSource(siteDir), "incremental", "portfolio source");
    assert(await packageIntact(packageDir), "the package does not hash to its recorded packageHash");
    eq(record.template.releaseHash, pin.releaseHash, "package release vs pin");
    eq(record.buildInputId, current.buildInputId, "build record vs current pointer");
  });
  await check("A2 runtime.json + shell.json are files of the sealed package, valid, and name this site and release", async () => {
    runtime = RuntimeDocSchema.parse(await readJson(path.join(packageSite, RUNTIME_FILE)));
    shell = ShellDocSchema.parse(await readJson(path.join(packageSite, SHELL_FILE)));
    eq(runtime.siteId, SITE, "runtime.siteId");
    eq(runtime.template, { templateId: pin.templateId, templateVersion: pin.templateVersion, releaseId: pin.releaseId, releaseHash: pin.releaseHash }, "runtime.template");
    eq(runtime.shell, SHELL_FILE, "runtime.shell");
    eq(runtime.publicOrigin, site.identity.publicOrigin, "runtime.publicOrigin");
    eq(record.portfolioRuntime.runtime.sha256, sha256(await readFile(path.join(packageSite, RUNTIME_FILE))), "recorded runtime.json hash");
    eq(record.portfolioRuntime.shell.sha256, sha256(await readFile(path.join(packageSite, SHELL_FILE))), "recorded shell.json hash");
    eq((await readdir(path.join(packageSite, RUNTIME_DIR))).sort(), ["runtime.json", "shell.json"], `${RUNTIME_DIR} holds exactly the two documents`);
    eq([shell.snapshot.content.projects.length, shell.snapshot.content.categories.length], [0, 0], "shell holds no portfolio");
  });
  await check("A3 the shell pages are placeholders: every slot once, no title / description / canonical / og / twitter, no project in them", async () => {
    eq(runtime.shellPages, ["index.html", "portfolio.html", "portfolio/_shell.html"], "shellPages");
    const expected: Record<string, string[]> = { "index.html": HOME_SECTIONS, "portfolio.html": ["portfolio.index"], "portfolio/_shell.html": ["portfolio.detail"] };
    for (const file of runtime.shellPages as string[]) {
      const html = await readFile(path.join(packageSite, file), "utf8");
      shellPages[file] = html;
      eq([...mainOf(html).matchAll(new RegExp(`${SLOT_ATTRIBUTE}="([^"]+)"`, "g"))].map((m) => m[1]), expected[file], `${file} slots`);
      eq(seoTags(html).filter((t) => !t.startsWith('<meta name="robots"')), [], `${file} carries page metadata`);
      assert(!/data-project-card=|href="\/portfolio\/[a-z0-9]/.test(html), `${file} names a project`);
    }
  });
  await check("A4 the package holds no project page, no list page 2+, no integration feed, and its sitemap lists no project", async () => {
    const files: string[] = [];
    const walk = async (rel: string) => {
      for (const e of await readdir(path.join(packageSite, rel), { withFileTypes: true })) e.isDirectory() ? await walk(path.join(rel, e.name)) : files.push(path.join(rel, e.name));
    };
    await walk("");
    eq(files.filter((f) => f.startsWith("portfolio/") && f.endsWith(".html")), ["portfolio/_shell.html"], "HTML pages under portfolio/");
    assert(!files.some((f) => f.startsWith("portfolio/page/")), "a list page 2+ was built");
    assert(!files.some((f) => /integration|first-party|\.well-known/.test(f)), `an integration feed is in the package: ${files.filter((f) => /integration|first-party|\.well-known/.test(f)).join(", ")}`);
    const sitemap = await readFile(path.join(packageSite, "sitemap.xml"), "utf8");
    assert(!/\/portfolio\/[^<]/.test(sitemap), "the build-time sitemap lists a URL under /portfolio/");
    const assetFiles = files.filter((f) => f.startsWith("assets/"));
    assert(assetFiles.length === shell.snapshot.assets.length, `package assets (${assetFiles.length}) ≠ shell assets (${shell.snapshot.assets.length}): portfolio images belong to the publisher`);
  });

  // ── B. the kit ────────────────────────────────────────────────────────────────────────────────
  console.log("B. runtime kit");
  let renderPortfolioSite!: (input: PortfolioSiteInput) => PortfolioSiteResult;
  let kitInfo!: RuntimeKitInfo;
  await check("B1 the kit builds from the release store: one import-free file, two exports, loadable from an empty directory", async () => {
    const release = await loadRelease(repoRoot, pin.templateId, pin.releaseId);
    eq(release.releaseHash, pin.releaseHash, "stored release vs pin");
    const kit = await buildRuntimeKit({ repoRoot, templateId: pin.templateId, releaseId: pin.releaseId, sourceCommit: "test" });
    const again = await buildRuntimeKit({ repoRoot, templateId: pin.templateId, releaseId: pin.releaseId, sourceCommit: "test" });
    eq(sha256(kit.files[RENDERER_FILE]), sha256(again.files[RENDERER_FILE]), "two builds of the kit");
    eq(kit.files[KIT_FILE], again.files[KIT_FILE], "two builds of kit.json");
    assert(!/^\s*import\s|\bimport\(|\brequire\(/m.test(kit.files[RENDERER_FILE].replace(/"(?:[^"\\]|\\.)*"/g, '""')), "renderer.mjs has an import");
    const kitDir = path.join(tmp, "kit");
    await rm(kitDir, { recursive: true, force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(kitDir);
    await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    const mod = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { kit: RuntimeKitInfo; renderPortfolioSite: typeof renderPortfolioSite };
    eq(Object.keys(mod).sort(), ["kit", "renderPortfolioSite"], "exports");
    kitInfo = mod.kit;
    renderPortfolioSite = mod.renderPortfolioSite;
    eq(kitInfo, { kitFormat: 1, kind: "portfolio-runtime", templateId: pin.templateId, templateVersion: pin.templateVersion, releaseId: pin.releaseId, releaseHash: pin.releaseHash }, "kit");
    const record = JSON.parse(kit.files[KIT_FILE]);
    eq(Object.keys(record), ["kitFormat", "kind", "templateId", "templateVersion", "releaseId", "releaseHash", "sourceCommit", "generatedBy", "files"], "kit.json keys");
    eq(record.files, { [RENDERER_FILE]: sha256(kit.files[RENDERER_FILE]) }, "kit.json files");
    results.kit = { rendererSha256: record.files[RENDERER_FILE], rendererBytes: kit.rendererBytes, bundledSources: kit.inputs.length };
    const vendored = process.env.PORTFOLIO_RUNTIME_KIT_DIR;
    if (vendored) {
      eq(sha256(await readFile(path.join(vendored, RENDERER_FILE))), record.files[RENDERER_FILE], `vendored ${vendored}/${RENDERER_FILE} vs the kit built here`);
      eq((await readJson(path.join(vendored, KIT_FILE))).files, record.files, "vendored kit.json files");
      eq((await readdir(vendored)).sort(), [KIT_FILE, RENDERER_FILE], "vendored kit directory");
      results.vendoredKit = "byte-identical";
    }
  });

  // Demo 02's own dataset, as the publisher's export: every record, category and image, with the real bytes' hash
  const projects = (await readJson(path.join(siteDir, "content/projects.json"))).items as any[];
  const categories = (await readJson(path.join(siteDir, "content/categories.json"))).items as any[];
  const registry = (await readJson(path.join(siteDir, "assets/registry.json"))).items as any[];
  const referenced = new Set<string>();
  JSON.stringify(projects, (key, value) => (key === "asset" && typeof value === "string" ? (referenced.add(value), value) : value));
  const assets: any[] = [];
  for (const entry of registry.filter((a) => referenced.has(a.id))) {
    const bytes = await readFile(path.join(siteDir, "assets", entry.file));
    assets.push({ ...entry, sha256: sha256(bytes), size: bytes.length });
  }
  const input = (over: Partial<PortfolioSiteInput> = {}): PortfolioSiteInput => ({ runtime, shell, shellPages, portfolio: { categories, projects, assets }, at: AT, ...over });
  let composed!: Extract<PortfolioSiteResult, { ok: true }>;
  let empty: Extract<PortfolioSiteResult, { ok: true }> | undefined;
  const byPath = (r: Extract<PortfolioSiteResult, { ok: true }>, p: string) => {
    const f = r.files.find((x) => x.path === p);
    assert(f, `no file for ${p}`);
    return f.body;
  };

  await check(`B2 composes Demo 02: /, /portfolio, one page per record (${projects.length}), /sitemap.xml — and what it owns, shows and references`, () => {
    eq([projects.length, categories.length], [8, 4], "dataset");
    const t0 = performance.now();
    const r = renderPortfolioSite(input());
    results.composeMs = Math.round(performance.now() - t0);
    if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
    composed = r;
    const slugs = projects.map((p) => `/portfolio/${p.slug}`).sort();
    eq(r.files.map((f) => f.path), ["/", "/portfolio", ...slugs, "/sitemap.xml"], "files");
    eq([...new Set(r.files.map((f) => f.contentType))].sort(), ["application/xml", "text/html; charset=utf-8"], "content types");
    eq(r.owned, { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] }, "owned");
    eq(r.projects, [...projects].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => ({ id: p.id, slug: p.slug, path: `/portfolio/${p.slug}` })), "projects");
    eq(r.assets, assets.map((a) => ({ id: a.id, publicPath: `/assets/${a.sha256.slice(0, 20)}.jpg` })).sort((a, b) => (a.id < b.id ? -1 : 1)), "assets");
    for (const f of r.files.filter((x) => x.contentType.startsWith("text/html"))) {
      assert(!f.body.includes(SLOT_ATTRIBUTE), `${f.path} still holds a placeholder`);
      eq(count(f.body, 'id="recon-portfolio-slots"'), 1, `${f.path} slot data`);
      // every image a page shows is either in the package or one the result names
      const known = new Set([...r.assets.map((a) => a.publicPath), ...shell.snapshot.assets.map((a: any) => a.publicPath)]);
      const unknown = [...new Set([...f.body.matchAll(/"(\/assets\/[^"\\]+)\\?"/g)].map((m) => m[1]!))].filter((u) => !known.has(u));
      eq(unknown, [], `${f.path} references an image nobody serves`);
    }
    results.composed = { files: r.files.length, bytes: r.files.reduce((n, f) => n + Buffer.byteLength(f.body), 0), assets: r.assets.length };
  });
  await check("B3 deterministic: the same input gives the same bytes; the input is not modified", () => {
    const frozen = JSON.stringify(input());
    const again = renderPortfolioSite(input());
    eq(sha256(JSON.stringify(again)), sha256(JSON.stringify(composed)), "second render");
    eq(sha256(JSON.stringify(input())), sha256(frozen), "input after rendering");
  });
  await check("B4 the inline slot data is the page: JSON that cannot leave its element, and exactly what each slot was rendered from", () => {
    for (const f of composed.files.filter((x) => x.contentType.startsWith("text/html"))) {
      const m = /<script type="application\/json" id="recon-portfolio-slots">([\s\S]*?)<\/script>/.exec(f.body);
      assert(m, `${f.path}: no slot data`);
      assert(!/[<>&\u2028\u2029]/.test(m[1]!), `${f.path}: slot data is not escaped`);
      const data = JSON.parse(m[1]!) as Record<string, unknown>;
      const want = f.path === "/" ? HOME_SECTIONS : f.path === "/portfolio" ? ["portfolio.index"] : ["portfolio.detail"];
      eq(Object.keys(data).sort(), [...want].sort(), `${f.path} slot data keys`);
      for (const slot of want) assert(f.body.includes(`data-section="${slot}"`), `${f.path}: section ${slot} is not in the markup`);
    }
    eq(escapeJsonForScript('{"a":"</script><!--&\u2028"}'), '{"a":"\\u003c/script\\u003e\\u003c!--\\u0026\\u2028"}', "escapeJsonForScript");
    eq(escapeHtml(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&#x27;e&#x27;", "escapeHtml");
  });
  await check("B5 visibility is the loader's: a draft and a record scheduled after `at` get no page, no card, no image", () => {
    const later = projects.map((p, i) => (i === 0 ? { ...p, publishedAt: "2026-10-10T00:00:00.001Z" } : i === 1 ? { ...p, status: "draft" } : p));
    const hidden = [projects[0], projects[1]];
    // the home selections of this site name records by id: both hidden ones are among them, so the release refuses or skips by its own rule
    const r = renderPortfolioSite(input({ portfolio: { categories, projects: later, assets } }));
    if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
    eq(r.projects.length, projects.length - 2, "visible records");
    for (const p of hidden) {
      assert(!r.files.some((f) => f.path === `/portfolio/${p.slug}`), `${p.id} has a page`);
      assert(!r.files.some((f) => f.body.includes(`/portfolio/${p.slug}`)), `${p.id} is linked or listed somewhere`);
    }
    assert(r.assets.length < composed.assets.length, "the hidden records' images are still referenced");
  });
  await check("B6 refuses without throwing: another release, a missing shell page, a record the release's schema rejects, an unknown category / image, garbage", () => {
    const refusal = (name: string, value: unknown, pathPrefix: string) => {
      let r: PortfolioSiteResult;
      try {
        r = renderPortfolioSite(value as PortfolioSiteInput);
      } catch (error) {
        throw new Error(`${name}: threw ${(error as Error).message}`);
      }
      assert(!r.ok, `${name}: accepted`);
      assert(r.problems.length > 0 && r.problems.every((p) => typeof p.path === "string" && typeof p.message === "string"), `${name}: malformed problems`);
      assert(r.problems.some((p) => p.path.startsWith(pathPrefix)), `${name}: no problem under "${pathPrefix}" (${JSON.stringify(r.problems).slice(0, 300)})`);
    };
    refusal("another release", input({ runtime: { ...runtime, template: { ...runtime.template, releaseHash: "0".repeat(64) } } }), "runtime.template");
    refusal("unknown runtime key", input({ runtime: { ...runtime, extra: 1 } }), "runtime");
    refusal("a shell that holds a portfolio", input({ shell: { ...shell, snapshot: { ...shell.snapshot, content: { ...shell.snapshot.content, projects: [projects[0]] } } } }), "shell.snapshot.content");
    refusal("missing shell page", input({ shellPages: { "index.html": shellPages["index.html"]! } }), "shellPages.portfolio.html");
    refusal("a page that is not a shell", input({ shellPages: { ...shellPages, "portfolio.html": byPath(composed, "/portfolio") } }), "(page /portfolio)");
    refusal("bad instant", input({ at: "yesterday" }), "at");
    refusal("record without a title", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 2 ? { ...p, title: undefined } : p)) } }), "portfolio.projects.2");
    refusal("record with an unknown field", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 2 ? { ...p, surprise: true } : p)) } }), "portfolio.projects.2");
    refusal("duplicate slug", input({ portfolio: { categories, assets, projects: [...projects, { ...projects[0], id: "bi-99" }] } }), "portfolio.projects");
    refusal("unknown category", input({ portfolio: { categories: categories.slice(1), assets, projects } }), "portfolio.projects");
    refusal("missing image", input({ portfolio: { categories, projects, assets: assets.slice(1) } }), "portfolio.assets");
    refusal("image without a hash", input({ portfolio: { categories, projects, assets: assets.map(({ sha256: _s, ...a }) => a) } }), "portfolio.assets.0");
    refusal("a reserved slug", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 0 ? { ...p, slug: "page" } : p)) } }), "");
    for (const garbage of [undefined, null, 1, "x", [], {}, { runtime: 1, shell: 2, shellPages: 3, portfolio: 4, at: 5 }]) refusal(`garbage ${JSON.stringify(garbage)}`, garbage, "");
  });
  await check("B8 nothing published: / without the portfolio sections that need records, /portfolio as an empty list (the shell links to it), no detail page", () => {
    const r = renderPortfolioSite(input({ portfolio: { categories, projects: [], assets: [] } }));
    if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
    eq(r.files.map((f) => f.path), ["/", "/portfolio", "/sitemap.xml"], "files");
    eq([r.projects, r.assets], [[], []], "projects, assets");
    const list = byPath(r, "/portfolio");
    assert(list.includes('data-section="portfolio.index"') && !list.includes(SLOT_ATTRIBUTE) && !/href="\/portfolio\/[a-z0-9]/.test(mainOf(list)), "/portfolio is not an empty list");
    assert(list.includes("<title>") && !byPath(r, "/").includes(SLOT_ATTRIBUTE), "the pages are not complete");
    empty = r;
  });
  await check("B7 head tags are Next's: order, derived twitter card, the bare origin for /, escaping; an unknown metadata field is refused", () => {
    const base = "https://example.test";
    eq(
      headTags({ title: `A & "B"`, description: "d", alternates: { canonical: "/" }, openGraph: { type: "website", title: "t", description: "o", url: "/", images: [{ url: "/assets/x.jpg", width: 10, height: 20, alt: "al" }] } }, base),
      [
        "<title>A &amp; &quot;B&quot;</title>",
        '<meta name="description" content="d"/>',
        '<link rel="canonical" href="https://example.test"/>',
        '<meta property="og:title" content="t"/>',
        '<meta property="og:description" content="o"/>',
        '<meta property="og:url" content="https://example.test"/>',
        '<meta property="og:image" content="https://example.test/assets/x.jpg"/>',
        '<meta property="og:image:width" content="10"/>',
        '<meta property="og:image:height" content="20"/>',
        '<meta property="og:image:alt" content="al"/>',
        '<meta property="og:type" content="website"/>',
        '<meta name="twitter:card" content="summary_large_image"/>',
        '<meta name="twitter:title" content="t"/>',
        '<meta name="twitter:description" content="o"/>',
        '<meta name="twitter:image" content="https://example.test/assets/x.jpg"/>',
        '<meta name="twitter:image:alt" content="al"/>',
        '<meta name="twitter:image:width" content="10"/>',
        '<meta name="twitter:image:height" content="20"/>',
      ],
      "headTags",
    );
    eq(headTags({ title: "t" }, undefined), ["<title>t</title>"], "a site without a public origin");
    let threw = false;
    try {
      headTags({ title: "t", keywords: ["k"] }, base);
    } catch {
      threw = true;
    }
    assert(threw, "an unserialised metadata field was accepted");
    eq(sitemapXml([{ url: "https://example.test/a?b=1&c=2" }]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>https://example.test/a?b=1&amp;c=2</loc>\n</url>\n</urlset>\n', "sitemapXml");
  });

  // ── C. parity with the last ordinary build ────────────────────────────────────────────────────
  console.log("C. parity with the last V1 package");
  const v1Site = path.join(gitMaterialize(CODE_ROOT, V1.commit, `data/site-builds/${SITE}/packages/${V1.buildInputId}`, tmp), "site");
  const v1Record = await readJson(path.join(v1Site, "..", "build-record.json"));
  const parity: { path: string; mainBytes: number; markers: number; ids: number; tags: number }[] = [];
  await check("C0 the reference is an intact ordinary package of Demo 02 (another release line, every record built in)", async () => {
    assert(await packageIntact(path.join(v1Site, "..")), "the V1 package does not hash to its packageHash");
    eq(v1Record.siteId, SITE, "V1 siteId");
    assert(v1Record.template.releaseHash !== pin.releaseHash && v1Record.portfolioRuntime === undefined, "the reference is not an ordinary build of an earlier release");
    results.v1 = { buildInputId: V1.buildInputId, packageHash: v1Record.packageHash, release: v1Record.template.releaseId };
  });
  const parityPaths = ["/", "/portfolio", ...projects.map((p) => `/portfolio/${p.slug}`).sort()];
  for (const p of parityPaths) {
    await check(`C  ${p}`, async () => {
      const built = await readFile(path.join(v1Site, fileOf(p)), "utf8");
      const mine = byPath(composed, p);
      const a = normalizeMain(mainOf(mine));
      const b = normalizeMain(mainOf(built));
      const slots = p === "/" ? HOME_SECTIONS.length : 1;
      eq(a.markers - b.markers, slots, "boundary markers added (one pair per slot)");
      eq(a.ids, b.ids, "distinct generated ids");
      sameText(a.text, b.text, "<main>");
      eq(seoTags(mine), seoTags(built), "title / description / robots / canonical / og / twitter");
      assert(seoTags(mine).length >= 17, `only ${seoTags(mine).length} head tags compared`);
      // around <main>: the header, the tab bar, the footer — untouched shell markup, the same as the built page's
      const chrome = (html: string) => {
        const body = html.slice(html.indexOf("<body"), html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
        return body.replace(/<main[\s>][\s\S]*?<\/main>/, "<main/>");
      };
      sameText(chrome(mine), chrome(built), "markup around <main>");
      parity.push({ path: p, mainBytes: Buffer.byteLength(a.text), markers: a.markers - b.markers, ids: a.ids, tags: seoTags(mine).length });
    });
  }
  await check("C  /sitemap.xml is byte-identical to the V1 package's", async () => {
    sameText(byPath(composed, "/sitemap.xml"), await readFile(path.join(v1Site, "sitemap.xml"), "utf8"), "sitemap.xml");
  });
  results.parity = { pages: parity.length, of: parityPaths.length, acceptedDifferences: ACCEPTED_DIFFERENCES };

  // ── D. browser ────────────────────────────────────────────────────────────────────────────────
  console.log("D. browser (Playwright, headless Chromium)");
  const overlayOf = (r: Extract<PortfolioSiteResult, { ok: true }>): Overlay => ({
    routes: new Map(r.files.map((f) => [f.path, { contentType: f.contentType, body: f.body }])),
    assets: new Map(r.assets.map((a) => [a.publicPath, { file: path.join(siteDir, "assets", registry.find((e) => e.id === a.id).file as string), contentType: "image/jpeg" }])),
    owned: r.owned,
  });
  let overlay = overlayOf(composed);
  const served: Served[] = [];
  const server = await startServer(packageSite, () => overlay, served);
  const browser = await chromium.launch();
  const browserResults: Record<string, string> = {};
  try {
    const VIEWPORTS = [
      { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
      { name: "mobile", options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    ];
    const open = async (name: string, options: Parameters<typeof browser.newContext>[0]) => {
      const context: BrowserContext = await browser.newContext(options);
      const errors: string[] = [];
      const external: string[] = [];
      const rsc: string[] = [];
      // nothing leaves the machine: the site's third-party script (the chat widget) is answered with an empty one
      await context.route(
        (url) => url.origin !== server.origin,
        (route) => {
          external.push(route.request().url());
          return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
        },
      );
      const page: Page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (u.origin === server.origin && (u.searchParams.has("_rsc") || u.pathname.endsWith(".txt"))) rsc.push(u.pathname);
      });
      page.on("response", (r) => {
        if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      });
      page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
      return { name, context, page, errors, external, rsc };
    };
    const settle = async (page: Page) => {
      await page.waitForLoadState("networkidle");
      // hydrated: React has attached to the document's root (Next sets this on the container once the tree is live)
      await page.waitForFunction(() => Object.keys(document).some((k) => k.startsWith("__reactContainer$")) || Object.keys(document.body).some((k) => k.startsWith("__reactFiber$")), undefined, { timeout: 10_000 }).catch(() => undefined);
    };
    const resultCount = async (page: Page) => Number(await page.locator("[data-result-count]").first().getAttribute("data-result-count"));
    const cardIds = (page: Page) => page.locator('[data-filter-results] [data-project-card], [data-section="portfolio.index"] ul[data-shown] > li').evaluateAll((els) => els.map((e) => e.getAttribute("data-project-card") ?? e.querySelector("a")?.getAttribute("href") ?? ""));

    await check("D0 control: the harness reports a hydration error when the markup is not what the inline data renders", async () => {
      const good = byPath(composed, "/portfolio");
      const title = projects[0].title as string;
      const at = good.indexOf(title, good.indexOf("<main"));
      assert(at > 0, "the control cannot find a record title in <main>");
      const tampered = `${good.slice(0, at)}변조된 제목${good.slice(at + title.length)}`;
      overlay = { ...overlayOf(composed), routes: new Map([...overlayOf(composed).routes, ["/portfolio", { contentType: "text/html; charset=utf-8", body: tampered }]]) };
      const s = await open("control", { viewport: { width: 1440, height: 900 } });
      await s.page.goto(`${server.origin}/portfolio`);
      await settle(s.page);
      await s.page.waitForTimeout(300);
      overlay = overlayOf(composed);
      await s.context.close();
      assert(s.errors.some((e) => HYDRATION_ERROR.test(e)), `a tampered page raised no hydration error (${JSON.stringify(s.errors)})`);
    });

    for (const vp of VIEWPORTS) {
      const s = await open(vp.name, vp.options);
      const { page } = s;
      const ok: boolean[] = [];
      ok.push(
        await check(`D1 ${vp.name}: / shows the four portfolio sections, hydrated from the inline data, nothing of the shell left`, async () => {
          const res = await page.goto(`${server.origin}/`);
          eq(res?.status(), 200, "status");
          await settle(page);
          for (const section of HOME_SECTIONS) eq(await page.locator(`[data-section="${section}"]`).count(), 1, section);
          eq(await page.locator(`[${SLOT_ATTRIBUTE}]`).count(), 0, "placeholders in the document");
          sameText(normalizeMain(await page.locator("main").evaluate((el) => el.outerHTML)).text.replace(/ style=""/g, "").slice(0, 400), normalizeMain(mainOf(byPath(composed, "/"))).text.slice(0, 400), "the document's <main> after hydration (opening)");
          assert((await page.title()).length > 0, "no title");
          assert((await page.locator('[data-section="home.projects"] a[href^="/portfolio/"]').count()) > 0, "home.projects links no project");
          const broken = await page.locator("img").evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
          eq(broken, [], "broken images");
        }),
      );
      let total = 0;
      let filtered = 0;
      ok.push(
        await check(`D2 ${vp.name}: /portfolio lists every record; a filter changes the cards and the URL; back restores, forward re-applies`, async () => {
          const res = await page.goto(`${server.origin}/portfolio`);
          eq(res?.status(), 200, "status");
          await settle(page);
          await page.locator('.i2-plist__row[data-ready="true"]').waitFor({ timeout: 10_000 });
          total = await resultCount(page);
          eq(total, projects.length, "result count");
          const all = await cardIds(page);
          assert(all.length > 0, "no card");
          // a real click on a visible control: the panel is a side column on desktop, a sheet on mobile
          const option = page.locator("[data-filter-group] label.i2-pcheck").first();
          if (!(await option.isVisible())) await page.locator("[data-filter-open]").click();
          await option.click();
          await page.waitForFunction(() => location.search.length > 1);
          const apply = page.locator("[data-filter-apply]");
          if (vp.name === "mobile" && (await apply.isVisible())) await apply.click();
          filtered = await resultCount(page);
          const some = await cardIds(page);
          assert(filtered > 0 && filtered < total, `the filter left ${filtered} of ${total}`);
          eq(some.length, filtered, "cards shown under the filter");
          assert(JSON.stringify(some) !== JSON.stringify(all), "the cards did not change");
          const filteredUrl = page.url();
          await page.goBack();
          await page.waitForFunction(() => location.search === "");
          await page.waitForFunction((n) => document.querySelector("[data-result-count]")?.getAttribute("data-result-count") === String(n), total);
          eq(await cardIds(page), all, "cards after back");
          await page.goForward();
          await page.waitForFunction((u) => location.href === u, filteredUrl);
          await page.waitForFunction((n) => document.querySelector("[data-result-count]")?.getAttribute("data-result-count") === String(n), filtered);
          eq(await cardIds(page), some, "cards after forward");
          await page.goBack();
          await page.waitForFunction(() => location.search === "");
        }),
      );
      let detailPath = "";
      ok.push(
        await check(`D3 ${vp.name}: a card on /portfolio leads to its detail page — a document load, not a client transition`, async () => {
          await page.evaluate(() => ((window as any).__proofSameDocument = true));
          const link = page.locator('[data-section="portfolio.index"] ul[data-shown] a[href^="/portfolio/"]').first();
          detailPath = (await link.getAttribute("href"))!;
          const project = projects.find((p) => `/portfolio/${p.slug}` === detailPath);
          assert(project, `the first card links ${detailPath}, which is no record`);
          await Promise.all([page.waitForURL(`${server.origin}${detailPath}`), link.click()]);
          await settle(page);
          eq(await page.evaluate(() => (window as any).__proofSameDocument), undefined, "the window survived the navigation");
          eq(await page.locator('[data-section="portfolio.detail"]').count(), 1, "detail section");
          assert((await page.locator('[data-section="portfolio.detail"] h1').first().innerText()).includes(project.title), "the detail page does not show the record's title");
          eq(await page.title(), `${project.title} | ${site.identity.brandName}`, "document title");
          eq(await page.locator('link[rel="canonical"]').getAttribute("href"), `${site.identity.publicOrigin}${detailPath}`, "canonical");
        }),
      );
      ok.push(
        await check(`D4 ${vp.name}: the detail gallery opens its viewer and closes again`, async () => {
          const zoom = page.locator("[data-gallery-zoom]").first();
          await zoom.scrollIntoViewIfNeeded();
          await zoom.click();
          const viewer = page.locator("dialog[data-gallery-viewer]");
          await viewer.waitFor({ state: "visible", timeout: 5000 });
          assert(await viewer.evaluate((d) => (d as HTMLDialogElement).open), "the dialog is not open");
          await page.locator("[data-viewer-img]").waitFor({ state: "visible" });
          assert(await page.locator("[data-viewer-img]").evaluate((i) => (i as HTMLImageElement).decode().then(() => (i as HTMLImageElement).naturalWidth > 0)), "the viewer image did not load");
          await page.locator("[data-viewer-close]").click();
          await page.waitForFunction(() => !document.querySelector("dialog[data-gallery-viewer]") || !(document.querySelector("dialog[data-gallery-viewer]") as HTMLDialogElement).open);
        }),
      );
      ok.push(
        await check(`D5 ${vp.name}: a page outside the overlay (/about) still works and links back with plain document loads`, async () => {
          const res = await page.goto(`${server.origin}/about`);
          eq(res?.status(), 200, "status");
          await settle(page);
          eq(served.filter((x) => x.path === "/about").at(-1)?.from, "package", "/about is served from the package");
        }),
      );
      ok.push(
        await check(`D6 ${vp.name}: no console error, no failed or 4xx/5xx request, no React hydration error (#418 / #423 / #425), no RSC request`, () => {
          const hydration = s.errors.filter((e) => HYDRATION_ERROR.test(e));
          eq(hydration, [], "React hydration errors");
          eq(s.errors, [], "errors");
          eq(s.rsc, [], "RSC payload requests");
        }),
      );
      results[`browser.${vp.name}.external`] = [...new Set(s.external.map((u) => new URL(u).origin))];
      browserResults[vp.name] = ok.every(Boolean) ? "PASS" : "FAIL";
      await s.context.close();
    }

    await check("D7 what the revision does not answer inside its URL space is the package's 404 page: an unknown slug, the shell slug, a list page, RSC forms; /_runtime is never served", async () => {
      const context = await browser.newContext();
      const notFound = await readFile(path.join(packageSite, NOT_FOUND_KEY), "utf8");
      for (const p of ["/portfolio/no-such-project", "/portfolio/_shell", "/portfolio/page/2", "/portfolio.txt", `/portfolio/${projects[0].slug}.txt`, "/_runtime/portfolio/shell.json", "/_runtime/portfolio/runtime.json"]) {
        const res = await context.request.get(`${server.origin}${p}`);
        eq(res.status(), 404, `${p} status`);
        eq(sha256(await res.text()), sha256(notFound), `${p} body is the package's 404 page`);
      }
      eq((await context.request.get(`${server.origin}/sitemap.xml`)).status(), 200, "/sitemap.xml");
      eq(await (await context.request.get(`${server.origin}/sitemap.xml`)).text(), byPath(composed, "/sitemap.xml"), "/sitemap.xml is the revision's");
      await context.close();
    });

    // ── E. a 9th record: the kit again, nothing else ────────────────────────────────────────────
    console.log("E. a 9th record — the kit only");
    const ninth = {
      ...projects[projects.length - 1],
      id: "bi-09",
      slug: "proof-ninth-project",
      title: "증명용 아홉 번째 시공사례",
      publishedAt: "2026-10-09T09:00:00+09:00",
    };
    let nine!: Extract<PortfolioSiteResult, { ok: true }>;
    await check("E1 nine records in → the new detail page, its card on /portfolio, the four home sections, the sitemap; the other eight keep their pages", () => {
      const r = renderPortfolioSite(input({ portfolio: { categories, projects: [...projects, ninth], assets } }));
      if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
      nine = r;
      eq(r.files.length, composed.files.length + 1, "files");
      const detail = byPath(r, "/portfolio/proof-ninth-project");
      assert(detail.includes(`<title>${ninth.title} | ${site.identity.brandName}</title>`), "the new page's title");
      assert(mainOf(detail).includes(ninth.title), "the new page's <main> does not show the record");
      assert(mainOf(byPath(r, "/portfolio")).includes('href="/portfolio/proof-ninth-project"'), "/portfolio has no card for the new record");
      assert(!mainOf(byPath(composed, "/portfolio")).includes("proof-ninth-project"), "the 8-record list already had it");
      for (const section of HOME_SECTIONS) assert(mainOf(byPath(r, "/")).includes(`data-section="${section}"`), `home section ${section}`);
      assert(byPath(r, "/sitemap.xml").includes("/portfolio/proof-ninth-project</loc>"), "the sitemap does not list the new page");
      // the other eight keep their page, head and all (their "more projects" block may now show the new record)
      for (const p of projects) eq(seoTags(byPath(r, `/portfolio/${p.slug}`)), seoTags(byPath(composed, `/portfolio/${p.slug}`)), `/portfolio/${p.slug} head`);
      results.ninth = { detailPagesWhoseMarkupChanged: projects.filter((p) => byPath(r, `/portfolio/${p.slug}`) !== byPath(composed, `/portfolio/${p.slug}`)).length };
      eq(r.projects.length, 9, "projects");
    });
    await check("E2 in the browser: the new detail page loads, /portfolio counts nine and links it, / still shows its sections — no error", async () => {
      overlay = overlayOf(nine);
      const s = await open("desktop", { viewport: { width: 1440, height: 900 } });
      const { page } = s;
      eq((await page.goto(`${server.origin}/portfolio/proof-ninth-project`))?.status(), 200, "new detail status");
      await settle(page);
      assert((await page.locator('[data-section="portfolio.detail"] h1').first().innerText()).includes(ninth.title), "title on the page");
      eq((await page.goto(`${server.origin}/portfolio`))?.status(), 200, "/portfolio status");
      await settle(page);
      await page.locator('.i2-plist__row[data-ready="true"]').waitFor({ timeout: 10_000 });
      eq(await resultCount(page), 9, "result count");
      const card = page.locator('[data-section="portfolio.index"] a[href="/portfolio/proof-ninth-project"]').first();
      await card.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL(`${server.origin}/portfolio/proof-ninth-project`), card.click()]);
      eq((await page.goto(`${server.origin}/`))?.status(), 200, "/ status");
      await settle(page);
      for (const section of HOME_SECTIONS) eq(await page.locator(`[data-section="${section}"]`).count(), 1, section);
      eq(s.errors, [], "errors");
      await s.context.close();
    });
    await check("E2b in the browser: with nothing published /portfolio is an empty list page and / still renders — no error", async () => {
      assert(empty, "B8 did not compose");
      overlay = overlayOf(empty);
      const s = await open("desktop", { viewport: { width: 1440, height: 900 } });
      eq((await s.page.goto(`${server.origin}/portfolio`))?.status(), 200, "/portfolio status");
      await settle(s.page);
      eq(await s.page.locator('[data-section="portfolio.index"]').count(), 1, "list section");
      eq(await s.page.locator('[data-section="portfolio.index"] a[href^="/portfolio/"]').count(), 0, "cards");
      eq((await s.page.goto(`${server.origin}/`))?.status(), 200, "/ status");
      await settle(s.page);
      eq((await s.context.request.get(`${server.origin}/portfolio/${projects[0].slug}`)).status(), 404, "an unpublished record's URL");
      eq(s.errors, [], "errors");
      await s.context.close();
    });
    await check("E3 the package directory did not change: same tree hash, still intact — the 9th record cost no build", async () => {
      const after = await treeHash(packageDir);
      eq(after, before, "package tree hash");
      assert(await packageIntact(packageDir), "the package no longer hashes to its packageHash");
      eq((await readJson(path.join(repoRoot, "data/site-builds", SITE, "current.json"))).buildInputId, current.buildInputId, "current pointer");
      results.package = { buildInputId: current.buildInputId, packageHash: record.packageHash, files: record.qa.files, bytes: record.qa.bytes, treeHash: after.hash };
    });
  } finally {
    await browser.close();
    await server.close();
  }
  results.browser = browserResults;
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${JSON.stringify(results, null, 2)}`);
console.log(`\nportfolio-runtime: ${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.log(failed.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
