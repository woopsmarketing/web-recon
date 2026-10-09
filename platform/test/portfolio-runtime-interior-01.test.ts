/**
 * Incremental portfolio publishing — the proof for interior-01 (`pnpm test:portfolio-runtime-interior-01`).
 *
 * Demo 01 (data/sites/boost-interior-demo) is built ONCE as a shell package; its portfolio pages are
 * composed afterwards by the release's runtime kit, with no build. This file holds that to the last
 * ORDINARY build of the same site (package 3d250199…, interior-01 1.6.3) and to a real browser.
 *
 * Everything that is this Template's or this site's is in CASE; the assertions below read CASE only,
 * so the file folds into a shared proof (one case per Template) without a rewrite.
 *
 *   A  the shell package   runtime.json + shell.json sealed in it; four shell pages, placeholders
 *                          only; no project page, no project data, no portfolio image (by id and by
 *                          bytes), no integration feed; every site-owned image
 *   B  the kit             built from the release store, import-free; composes the site from the
 *                          package + Demo 01's own dataset; deterministic; never throws; a draft
 *                          never appears; nothing published = the gate-recorded empty state; the
 *                          images in assets[] are exactly the ones the HTML references
 *   C  parity              the public URL set, and per page <main>, the markup around it, title /
 *                          description / robots / canonical / og:* / twitter:*, h1, internal links,
 *                          image references — against the last V1 package; /sitemap.xml byte for byte
 *   D  browser             headless Chromium, desktop + mobile, served with the Worker's rule: no
 *                          hydration / page error, the list filter, card → detail (a document load),
 *                          the gallery viewer, the before / after control, unknown slug = 404
 *   E  growth              a 9th record with a NEW image (list, detail, sitemap, the home showcase
 *                          when its selection includes it); 31 records → /portfolio/page/2 from its
 *                          own shell — the kit alone, the package did not move
 *   F  the home rules      a showcase that becomes empty disappears together with the intro's
 *                          anchor link to it; a hero call to action to an unserved project is dropped
 *
 * The site root is the working directory (data/sites, data/site-builds, data/template-releases);
 * the V1 reference package is read from the commit that last carried it as `current`.
 * Env: PORTFOLIO_RUNTIME_KIT_DIR — a vendored kit directory; its renderer.mjs must then be
 * byte-identical to the one built here.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import { packageIntact } from "../build/site-build";
import { RUNTIME_DIR, RUNTIME_FILE, RuntimeDocSchema, SHELL_FILE, ShellDocSchema } from "../portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult, RuntimeKitInfo } from "../portfolio-runtime/entry";
import { KIT_FILE, RENDERER_FILE, buildRuntimeKit } from "../portfolio-runtime/kit";
import { readPortfolioSource } from "../portfolio-sync/managed";
import { loadRelease } from "../release/release";
import { gitMaterialize } from "./git-checkout";
import { NOT_FOUND_KEY, resolvePath } from "../../workers/recon-runtime/src/paths";

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE CASE — everything below this block is written against it
// ════════════════════════════════════════════════════════════════════════════════════════════════
const CASE = {
  name: "interior-01 / Demo 01",
  site: "boost-interior-demo",
  templateId: "interior-01",
  at: "2026-10-10T00:00:00.000Z",
  dataset: { projects: 8, categories: 4 },
  /** the last ordinary (V1) package of the site: release interior-01 1.6.3, all 8 records built in — the live package */
  v1: {
    commit: "b2a29d235dd03742df7c8c7e01c6f3434d2ba98b",
    buildInputId: "8a0c21182f47bd45bc26f087da4538fe101d8411445de2fe2e7a71ad41effd60",
    packageHash: "3d2501990056f8da6d5e2d9cbed8491a518ca7934bb55309956cd721ad04733b",
    release: "interior-01-1.6.3-93977937c0b4",
  },
  /** shell page file → the runtime slots it holds, in document order */
  shellPages: {
    "index.html": ["home.hero", "home.intro", "home.projects-a", "home.projects-b"],
    "portfolio.html": ["portfolio.index"],
    "portfolio/page/_shell.html": ["portfolio.index"],
    "portfolio/_shell.html": ["portfolio.detail"],
  } as Record<string, string[]>,
  /** composed public path → the shell page it comes from and the slots it carries data for */
  pageKind(urlPath: string): { shell: string; slots: string[] } {
    if (urlPath === "/") return { shell: "index.html", slots: this.shellPages["index.html"]! };
    if (urlPath === "/portfolio") return { shell: "portfolio.html", slots: ["portfolio.index"] };
    if (urlPath.startsWith("/portfolio/page/")) return { shell: "portfolio/page/_shell.html", slots: ["portfolio.index"] };
    return { shell: "portfolio/_shell.html", slots: ["portfolio.detail"] };
  },
  owned: { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
  /** package pages outside the overlay (the 3D page is NOT under the /portfolio prefix) */
  packagePages: ["/3d-portfolio", "/about", "/contact"],
  /** home sections that read no project and stay shell markup */
  homeShellSections: ["home.reviews", "home.image-band"],
  /** an id a client component generates: React's in an ordinary build, a fixed one on a composed page */
  generatedId: /_R_[0-9a-z]+_|rs-[a-z0-9-]+?-browser(?![a-z])/g,
  listPageSize: 30,
  listPageTitle: (n: number) => `시공사례 — 페이지 ${n} | 부스트 인테리어`,
  /** the release gate's record for "nothing published" */
  emptyState: "supported" as "supported" | "refused",
  emptyFiles: ["/", "/portfolio", "/sitemap.xml"],
  /** the home rules of this Template, as facts of Demo 01 */
  home: {
    showcaseA: { section: "home.projects-a", anchor: "projects", ids: ["bi-01", "bi-03", "bi-02", "bi-05"] },
    showcaseB: { section: "home.projects-b", anchor: "projects-more", ids: ["bi-04", "bi-06", "bi-07", "bi-08"] },
    /** hero slide → the project its call to action names */
    heroCta: [
      { slide: "hero-living", project: "bi-01" },
      { slide: "hero-storage", project: "bi-03" },
    ],
    heroSlides: 3,
    /** Demo 01's intro links to a page; the anchor rule is exercised with a site whose intro links to showcase B */
    introAnchorLink: { label: "다른 시공사례 보기", href: "#projects-more" },
    introPageLink: "/portfolio",
  },
  /** the record that has before / after photos */
  beforeAfterProject: "bi-04",
  sel: {
    section: (name: string) => `[data-section="${name}"]`,
    listCards: '[data-section="portfolio.index"] [data-project-card]',
    listCardLinks: '[data-section="portfolio.index"] [data-project-card] a[href^="/portfolio/"]',
    resultCount: "[data-result-count]",
    filterOption: "[data-filter-group] label.i1-chip",
    filterToggle: ".i1-pfilter__toggle",
    detailTitle: '[data-section="portfolio.detail"] h1',
    galleryZoom: "[data-gallery-panel]:not([hidden]) [data-gallery-zoom]",
    viewer: "dialog[data-gallery-viewer]",
    viewerImage: "[data-viewer-img]",
    viewerClose: "[data-viewer-close]",
    galleryMore: "[data-gallery-panel]:not([hidden]) [data-gallery-more]",
    beforeAfterItem: '[data-gallery-panel]:not([hidden]) [data-gallery-item][data-has-before="true"]',
    beforeButton: '[data-ba="before"]',
    afterButton: '[data-ba="after"]',
    beforeImage: 'img[data-view="before"]',
    afterImage: 'img[data-view="after"]',
    pagerNext: '[data-pager] [data-page-step="next"]',
  },
  /**
   * What a composed page may differ in from the page an ordinary build writes — the complete list.
   * normalizeMain() applies the first two and imagePreloads() the third; everything else is compared byte for byte.
   */
  acceptedDifferences: [
    "Suspense boundary markers <!--$--> … <!--/$--> around each runtime slot (the shell renders a slot inside its own boundary; an ordinary build renders the section directly)",
    'the values of React-generated ids: "_R_…_" in an ordinary build, "rs-<slot>-<name>" in a composed page (same elements, same references between them)',
    "image preload hints in <head>: the same set of images; the attribute order inside a hint (href, as / as, href) and the order of the hints may differ",
  ],
};

const repoRoot = process.cwd();
const CODE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SLOT_ATTRIBUTE = "data-portfolio-slot";
const SLOT_DATA_ID = "recon-portfolio-slots";
/** React's hydration failures in a production build: minified errors #418 / #423 / #425 (and their dev wording) */
const HYDRATION_ERROR = /#(418|423|425)\b|react\.dev\/errors\/(418|423|425)|hydrat/i;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };

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
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (rel: string) => {
    for (const e of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else files.push(r);
    }
  };
  await walk("");
  return files;
}
async function treeHash(dir: string): Promise<{ hash: string; files: number }> {
  const h = createHash("sha256");
  const files = await listFiles(dir);
  for (const r of files) h.update(`${r}\0${sha256(await readFile(path.join(dir, r)))}\n`);
  return { hash: h.digest("hex"), files: files.length };
}

// ── page anatomy ────────────────────────────────────────────────────────────────────────────────
function mainOf(html: string): string {
  const m = /<main[\s>][\s\S]*?<\/main>/.exec(html);
  assert(m, "the page has no <main>");
  return m[0];
}
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** acceptedDifferences 1 + 2, applied: boundary markers removed, generated ids renamed in order of first appearance. */
function normalizeMain(main: string): { text: string; markers: number; ids: number } {
  const markers = count(main, "<!--$-->");
  const ids = new Map<string, string>();
  const text = main
    .replaceAll("<!--$-->", "")
    .replaceAll("<!--/$-->", "")
    .replace(CASE.generatedId, (id) => ids.get(id) ?? (ids.set(id, `ID${ids.size + 1}`), ids.get(id)!));
  return { text, markers, ids: ids.size };
}
/** title · description · robots · canonical · og:* · twitter:*, in document order, exactly as written */
function seoTags(html: string): string[] {
  const head = html.slice(0, html.indexOf("</head>"));
  return head.match(/<title>[\s\S]*?<\/title>|<meta (?:name="description"|name="robots"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>|<link rel="canonical"[^>]*>/g) ?? [];
}
/** the document's body (or a fragment of one) without its scripts (flight payload, slot data, chunk tags) */
const bodyOf = (html: string) => (html.includes("<body") ? html.slice(html.indexOf("<body"), html.indexOf("</body>")) : html).replace(/<script[\s\S]*?<\/script>/g, "");
/** around <main>: the header, the mobile menu, the footer — shell markup */
const chromeOf = (html: string) => bodyOf(html).replace(/<main[\s>][\s\S]*?<\/main>/, "<main/>");
const h1Of = (html: string) => [...bodyOf(html).matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""));
/** every same-site link of the document, in order */
const internalLinks = (html: string) => [...bodyOf(html).matchAll(/<a\s[^>]*?href="(\/[^"]*|#[^"]*)"/g)].map((m) => m[1]!);
/** every <img> of the document, in order */
const imageRefs = (html: string) => [...bodyOf(html).matchAll(/<img\s[^>]*?src="([^"]+)"/g)].map((m) => m[1]!);
/** the image preload hints of the head, exactly as written and in order */
const imagePreloadTags = (html: string) => [...html.slice(0, html.indexOf("</head>")).matchAll(/<link rel="preload"[^>]*>/g)].map((m) => m[0]).filter((tag) => / as="image"/.test(tag));
/** acceptedDifferences 3, applied: the images those hints name, as a sorted set */
const imagePreloads = (html: string) => [...new Set(imagePreloadTags(html).map((tag) => / href="([^"]+)"/.exec(tag)![1]!))].sort();
/** every /assets/ URL a document names anywhere: markup, head, inline data */
const assetUrls = (html: string) => new Set(html.match(/\/assets\/[0-9a-f]{20}\.[a-z0-9]+/g) ?? []);
/** the markup of one section of a page's <main> (a section that holds no nested <section>), or undefined when it is not there */
function sectionOf(html: string, name: string): string | undefined {
  const main = mainOf(html);
  const at = main.indexOf(`data-section="${name}"`);
  if (at < 0) return undefined;
  return main.slice(main.lastIndexOf("<section", at), main.indexOf("</section>", at) + "</section>".length);
}
const fileOf = (urlPath: string) => (urlPath === "/" ? "index.html" : `${urlPath.slice(1)}.html`);
const urlOf = (file: string) => (file === "index.html" ? "/" : `/${file.replace(/\.html$/, "")}`);

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
type Composed = Extract<PortfolioSiteResult, { ok: true }>;
const siteDir = path.join(repoRoot, "data/sites", CASE.site);
const tmp = await mkdtemp(path.join(tmpdir(), "portfolio-runtime-i01-"));
const results: Record<string, unknown> = { case: CASE.name };
try {
  // ── A. the shell package ──────────────────────────────────────────────────────────────────────
  console.log(`${CASE.name}\nA. shell package`);
  const current = await readJson(path.join(repoRoot, "data/site-builds", CASE.site, "current.json"));
  const packageDir = path.join(repoRoot, current.packageDir as string);
  const packageSite = path.join(packageDir, "site");
  const record = await readJson(path.join(packageDir, "build-record.json"));
  const site = await readJson(path.join(siteDir, "site.json"));
  const pin = site.template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
  const before = await treeHash(packageDir);
  const packageFiles = await listFiles(packageSite);
  let runtime: any;
  let shell: any;
  const shellPages: Record<string, string> = {};

  // Demo 01's own dataset, as the publisher's export: every record, category and image, with the real bytes' hash
  const projects = (await readJson(path.join(siteDir, "content/projects.json"))).items as any[];
  const categories = (await readJson(path.join(siteDir, "content/categories.json"))).items as any[];
  const registry = (await readJson(path.join(siteDir, "assets/registry.json"))).items as any[];
  const refsOf = (value: unknown) => {
    const refs = new Set<string>();
    JSON.stringify(value, (key, v) => (key === "asset" && typeof v === "string" ? (refs.add(v), v) : v));
    return refs;
  };
  const referenced = refsOf(projects);
  const assets: any[] = [];
  for (const entry of registry.filter((a) => referenced.has(a.id))) {
    const bytes = await readFile(path.join(siteDir, "assets", entry.file));
    assets.push({ ...entry, sha256: sha256(bytes), size: bytes.length });
  }
  const publicPath = (a: { sha256: string; mediaType: string }) => `/assets/${a.sha256.slice(0, 20)}.${EXT[a.mediaType]}`;
  const slugOf = (id: string) => projects.find((p) => p.id === id).slug as string;
  const hrefOf = (id: string) => `/portfolio/${slugOf(id)}`;

  await check("A1 the site is marked incremental and its current package is intact, built with the pinned release of this Template", async () => {
    eq(await readPortfolioSource(siteDir), "incremental", "portfolio source");
    eq(pin.templateId, CASE.templateId, "pinned template");
    assert(await packageIntact(packageDir), "the package does not hash to its recorded packageHash");
    eq(record.template.releaseHash, pin.releaseHash, "package release vs pin");
    eq(record.buildInputId, current.buildInputId, "build record vs current pointer");
  });
  await check("A2 runtime.json + shell.json are files of the sealed package, valid, and name this site and release", async () => {
    runtime = RuntimeDocSchema.parse(await readJson(path.join(packageSite, RUNTIME_FILE)));
    shell = ShellDocSchema.parse(await readJson(path.join(packageSite, SHELL_FILE)));
    eq(runtime.siteId, CASE.site, "runtime.siteId");
    eq(runtime.template, { templateId: pin.templateId, templateVersion: pin.templateVersion, releaseId: pin.releaseId, releaseHash: pin.releaseHash }, "runtime.template");
    eq(runtime.shell, SHELL_FILE, "runtime.shell");
    eq(runtime.publicOrigin, site.identity.publicOrigin, "runtime.publicOrigin");
    eq(record.portfolioRuntime.runtime.sha256, sha256(await readFile(path.join(packageSite, RUNTIME_FILE))), "recorded runtime.json hash");
    eq(record.portfolioRuntime.shell.sha256, sha256(await readFile(path.join(packageSite, SHELL_FILE))), "recorded shell.json hash");
    eq((await readdir(path.join(packageSite, RUNTIME_DIR))).sort(), ["runtime.json", "shell.json"], `${RUNTIME_DIR} holds exactly the two documents`);
    eq([shell.snapshot.content.projects.length, shell.snapshot.content.categories.length], [0, 0], "shell holds no portfolio");
  });
  await check("A3 the shell pages are placeholders: every slot once, no title / description / canonical / og / twitter, no project in them", async () => {
    eq(runtime.shellPages, Object.keys(CASE.shellPages), "shellPages");
    for (const file of runtime.shellPages as string[]) {
      const html = await readFile(path.join(packageSite, file), "utf8");
      shellPages[file] = html;
      eq([...mainOf(html).matchAll(new RegExp(`${SLOT_ATTRIBUTE}="([^"]+)"`, "g"))].map((m) => m[1]), CASE.shellPages[file], `${file} slots`);
      eq(seoTags(html).filter((t) => !t.startsWith('<meta name="robots"')), [], `${file} carries page metadata`);
      assert(!/data-project-card=|href="\/portfolio\/[a-z0-9]/.test(html), `${file} names a project`);
    }
    // the sections that read no project are shell markup of the home shell
    for (const section of CASE.homeShellSections) eq(count(shellPages["index.html"]!, `data-section="${section}"`), 1, `${section} in the home shell`);
  });
  await check("A4 the package holds no project page, no list page 2+, no integration feed, no project data; its sitemap lists no project", async () => {
    const reserved = Object.keys(CASE.shellPages).filter((f) => f.startsWith("portfolio/"));
    eq(packageFiles.filter((f) => f.startsWith("portfolio/") && f.endsWith(".html")).sort(), [...reserved].sort(), "HTML pages under portfolio/");
    const feed = packageFiles.filter((f) => /integration|first-party|\.well-known/.test(f));
    eq(feed, [], "integration feed files in the package");
    const sitemap = await readFile(path.join(packageSite, "sitemap.xml"), "utf8");
    assert(!/\/portfolio\/[^<]/.test(sitemap), "the build-time sitemap lists a URL under /portfolio/");
    // no record's slug, title or summary anywhere in the package (ids alone may appear: the site's own selections and banners name records by id)
    const needles = projects.flatMap((p) => [p.slug, p.title, p.summary].filter((s) => typeof s === "string" && s.length > 0)) as string[];
    const leaks: string[] = [];
    for (const f of packageFiles.filter((x) => /\.(html|txt|json|js|xml|css)$/.test(x))) {
      const text = await readFile(path.join(packageSite, f), "utf8");
      for (const n of needles) if (text.includes(n)) leaks.push(`${f}: ${n.slice(0, 40)}`);
    }
    eq(leaks, [], "project data in the package");
  });
  await check("A5 images: the package holds every site-owned image and no portfolio image — by asset id and by bytes", async () => {
    const shellAssets = shell.snapshot.assets as { id: string; sha256: string; publicPath: string }[];
    eq(shellAssets.filter((a) => referenced.has(a.id)).map((a) => a.id), [], "site-level asset ids that a record also references");
    const packageAssets = packageFiles.filter((f) => f.startsWith("assets/"));
    eq(packageAssets.map((f) => `/${f}`).sort(), shellAssets.map((a) => a.publicPath).sort(), "package assets vs the shell's site-level assets");
    const projectHashes = new Set(assets.map((a) => a.sha256));
    const siteHashes = new Set<string>();
    for (const a of shellAssets) {
      const bytes = await readFile(path.join(packageSite, a.publicPath.slice(1)));
      eq(sha256(bytes), a.sha256, `bytes of ${a.id}`);
      const entry = registry.find((e) => e.id === a.id);
      assert(entry, `site-level asset ${a.id} is not in the site's registry`);
      eq(sha256(await readFile(path.join(siteDir, "assets", entry.file))), a.sha256, `${a.id} vs the site's own file`);
      siteHashes.add(a.sha256);
    }
    // every file of the package, whatever its name: none is a portfolio image
    const smuggled: string[] = [];
    for (const f of packageFiles) if (projectHashes.has(sha256(await readFile(path.join(packageSite, f))))) smuggled.push(f);
    eq(smuggled, [], "portfolio image bytes in the package");
    eq([...siteHashes].filter((h) => projectHashes.has(h)), [], "site-owned images whose bytes are a portfolio image");
    // every site-level reference of the site resolves to a site-owned asset (slots, banners, logo)
    const siteRefs = new Set([...refsOf(shell.snapshot.slots), ...refsOf(shell.snapshot.content), shell.snapshot.site.identity.logo as string].filter(Boolean));
    eq([...siteRefs].filter((id) => !shellAssets.some((a) => a.id === id)), [], "site-level references without a site-owned asset");
    // and the source still holds the portfolio: the records and their images stay in data/sites
    eq([projects.length, categories.length], [CASE.dataset.projects, CASE.dataset.categories], "dataset in data/sites");
    results.package = { buildInputId: current.buildInputId, packageHash: record.packageHash, files: record.qa.files, bytes: record.qa.bytes, htmlPages: record.qa.htmlPages, siteImages: shellAssets.length, portfolioImages: 0 };
    results.dataset = { projects: projects.length, categories: categories.length, images: assets.length };
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
    await mkdir(kitDir);
    await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    const mod = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { kit: RuntimeKitInfo; renderPortfolioSite: typeof renderPortfolioSite };
    eq(Object.keys(mod).sort(), ["kit", "renderPortfolioSite"], "exports");
    kitInfo = mod.kit;
    renderPortfolioSite = mod.renderPortfolioSite;
    eq(kitInfo, { kitFormat: 1, kind: "portfolio-runtime", templateId: pin.templateId, templateVersion: pin.templateVersion, releaseId: pin.releaseId, releaseHash: pin.releaseHash }, "kit");
    const kitRecord = JSON.parse(kit.files[KIT_FILE]);
    eq(kitRecord.files, { [RENDERER_FILE]: sha256(kit.files[RENDERER_FILE]) }, "kit.json files");
    results.kit = { releaseId: pin.releaseId, rendererSha256: kitRecord.files[RENDERER_FILE], rendererBytes: kit.rendererBytes, bundledSources: kit.inputs.length };
    const vendored = process.env.PORTFOLIO_RUNTIME_KIT_DIR;
    if (vendored) {
      eq(sha256(await readFile(path.join(vendored, RENDERER_FILE))), kitRecord.files[RENDERER_FILE], `vendored ${vendored}/${RENDERER_FILE} vs the kit built here`);
      eq((await readJson(path.join(vendored, KIT_FILE))).files, kitRecord.files, "vendored kit.json files");
      eq((await readdir(vendored)).sort(), [KIT_FILE, RENDERER_FILE], "vendored kit directory");
      results.vendoredKit = "byte-identical";
    }
  });

  const input = (over: Partial<PortfolioSiteInput> = {}): PortfolioSiteInput => ({ runtime, shell, shellPages, portfolio: { categories, projects, assets }, at: CASE.at, ...over });
  /** the same site with another site-level choice: the shell document is data, its pages hold no slot content */
  const shellWith = (change: (snapshot: any) => void) => {
    const next = clone(shell);
    change(next.snapshot);
    return next;
  };
  const compose = (over: Partial<PortfolioSiteInput> = {}): Composed => {
    let r: PortfolioSiteResult;
    try {
      r = renderPortfolioSite(input(over));
    } catch (error) {
      throw new Error(`the kit threw: ${(error as Error).message}`);
    }
    if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
    return r;
  };
  const byPath = (r: Composed, p: string) => {
    const f = r.files.find((x) => x.path === p);
    assert(f, `no file for ${p}`);
    return f.body;
  };
  const htmlFiles = (r: Composed) => r.files.filter((f) => f.contentType.startsWith("text/html"));
  const withStatus = (ids: string[], status: string) => projects.map((p) => (ids.includes(p.id) ? { ...p, status } : p));
  let composed!: Composed;
  let empty: Composed | undefined;
  const shellAssetPaths = () => new Set((shell.snapshot.assets as { publicPath: string }[]).map((a) => a.publicPath));
  /** the images in assets[] are exactly the ones the composed HTML references (beyond the package's own) */
  const assertAssetsExact = (r: Composed, what: string) => {
    const named = new Set(r.assets.map((a) => a.publicPath));
    const used = new Set<string>();
    for (const f of htmlFiles(r)) for (const u of assetUrls(f.body)) if (!shellAssetPaths().has(u)) used.add(u);
    eq([...used].filter((u) => !named.has(u)).sort(), [], `${what}: images the HTML references that assets[] does not name`);
    eq([...named].filter((u) => !used.has(u)).sort(), [], `${what}: images in assets[] that no page references`);
    // and in the markup itself, not only in the inline data: every one is an <img> or an og:image somewhere
    const shown = new Set<string>();
    for (const f of htmlFiles(r)) {
      for (const u of imageRefs(f.body)) shown.add(u);
      for (const tag of seoTags(f.body)) for (const u of assetUrls(tag)) shown.add(u);
    }
    eq([...named].filter((u) => !shown.has(u)).sort(), [], `${what}: images in assets[] that no page shows`);
  };

  await check(`B2 composes Demo 01: /, /portfolio, one page per record (${projects.length}), /sitemap.xml — what it owns, shows and references`, () => {
    const t0 = performance.now();
    composed = compose();
    results.composeMs = Math.round(performance.now() - t0);
    const r = composed;
    eq(r.files.map((f) => f.path), ["/", "/portfolio", ...projects.map((p) => `/portfolio/${p.slug}`).sort(), "/sitemap.xml"], "files");
    eq([...new Set(r.files.map((f) => f.contentType))].sort(), ["application/xml", "text/html; charset=utf-8"], "content types");
    eq(r.owned, CASE.owned, "owned");
    eq(r.projects, [...projects].sort((a, b) => compare(a.id, b.id)).map((p) => ({ id: p.id, slug: p.slug, path: `/portfolio/${p.slug}` })), "projects");
    eq(r.assets, assets.map((a) => ({ id: a.id, publicPath: publicPath(a) })).sort((a, b) => compare(a.id, b.id)), "assets");
    for (const f of htmlFiles(r)) {
      assert(!f.body.includes(SLOT_ATTRIBUTE), `${f.path} still holds a placeholder`);
      eq(count(f.body, `id="${SLOT_DATA_ID}"`), 1, `${f.path} slot data`);
    }
    results.composed = { files: r.files.length, bytes: r.files.reduce((n, f) => n + Buffer.byteLength(f.body), 0), assets: r.assets.length };
  });
  await check(`B3 the images in assets[] are exactly the ones the HTML references: ${assets.length} named, each on a page, none missing, none extra`, () => {
    assertAssetsExact(composed, "8 records");
    eq(composed.assets.length, assets.length, "every image of the dataset is referenced by a visible record");
  });
  await check("B4 deterministic: the same input gives the same bytes; the input is not modified", () => {
    const frozen = JSON.stringify(input());
    const again = renderPortfolioSite(input());
    eq(sha256(JSON.stringify(again)), sha256(JSON.stringify(composed)), "second render");
    eq(sha256(JSON.stringify(input())), sha256(frozen), "input after rendering");
  });
  await check("B5 the inline slot data is the page: JSON that cannot leave its element, and exactly what each slot was rendered from", () => {
    for (const f of htmlFiles(composed)) {
      const m = new RegExp(`<script type="application/json" id="${SLOT_DATA_ID}">([\\s\\S]*?)</script>`).exec(f.body);
      assert(m, `${f.path}: no slot data`);
      assert(!/[<>&\u2028\u2029]/.test(m[1]!), `${f.path}: slot data is not escaped`);
      const data = JSON.parse(m[1]!) as Record<string, unknown>;
      const want = CASE.pageKind(f.path).slots;
      eq(Object.keys(data).sort(), [...want].sort(), `${f.path} slot data keys`);
      for (const slot of want) assert(f.body.includes(`data-section="${slot}"`), `${f.path}: section ${slot} is not in the markup`);
    }
  });
  await check("B6 a draft never appears, nor a record scheduled after `at`: no page, no card, no link, no image, no sitemap entry", () => {
    const hidden = [projects[0], projects[1]];
    const later = projects.map((p, i) => (i === 0 ? { ...p, publishedAt: "2026-10-10T00:00:00.001Z" } : i === 1 ? { ...p, status: "draft" } : p));
    const visibleRefs = refsOf(projects.slice(2));
    const r = compose({ portfolio: { categories, projects: later, assets } });
    eq(r.projects.length, projects.length - 2, "visible records");
    for (const p of hidden) {
      assert(!r.files.some((f) => f.path === `/portfolio/${p.slug}`), `${p.id} has a page`);
      assert(!r.files.some((f) => f.body.includes(`/portfolio/${p.slug}`)), `${p.id} is linked, listed or in the sitemap somewhere`);
      assert(!r.files.some((f) => f.body.includes(p.title)), `${p.id}'s title is on a page`);
      for (const id of [...refsOf(p)].filter((ref) => !visibleRefs.has(ref))) {
        assert(!r.assets.some((a) => a.id === id), `${p.id}'s image ${id} is in assets[]`);
        const url = publicPath(assets.find((a) => a.id === id));
        assert(!r.files.some((f) => f.body.includes(url)), `${p.id}'s image ${id} is referenced by a page`);
      }
    }
    assertAssetsExact(r, "6 visible records");
    assert(r.assets.length < composed.assets.length, "the hidden records' images are still named");
  });
  await check("B7 refuses without throwing: another release, a missing shell page (each of the four), a bad record, an unknown category / image, garbage", () => {
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
    refusal("a shell that holds a portfolio", input({ shell: shellWith((s) => (s.content.projects = [projects[0]])) }), "shell.snapshot.content");
    for (const file of Object.keys(CASE.shellPages)) {
      const rest = { ...shellPages };
      delete rest[file];
      refusal(`missing shell page ${file}`, input({ shellPages: rest }), `shellPages.${file}`);
    }
    refusal("a page that is not a shell", input({ shellPages: { ...shellPages, "portfolio.html": byPath(composed, "/portfolio") } }), "(page /portfolio)");
    refusal("bad instant", input({ at: "yesterday" }), "at");
    refusal("record without a title", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 2 ? { ...p, title: undefined } : p)) } }), "portfolio.projects.2");
    refusal("record with an unknown field", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 2 ? { ...p, surprise: true } : p)) } }), "portfolio.projects.2");
    refusal("duplicate slug", input({ portfolio: { categories, assets, projects: [...projects, { ...projects[0], id: "bi-99" }] } }), "portfolio.projects");
    refusal("unknown category", input({ portfolio: { categories: categories.filter((c) => c.id !== projects[0].category), assets, projects } }), "portfolio.projects");
    refusal("missing image", input({ portfolio: { categories, projects, assets: assets.slice(1) } }), "portfolio.assets");
    refusal("a reserved slug (the shell's)", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 0 ? { ...p, slug: "_shell" } : p)) } }), "");
    refusal("a reserved slug (the list's page segment)", input({ portfolio: { categories, assets, projects: projects.map((p, i) => (i === 0 ? { ...p, slug: "page" } : p)) } }), "");
    for (const garbage of [undefined, null, 1, "x", [], {}, { runtime: 1, shell: 2, shellPages: 3, portfolio: 4, at: 5 }]) refusal(`garbage ${JSON.stringify(garbage)}`, garbage, "");
  });
  await check(`B8 nothing published → the gate-recorded behaviour (emptyState: ${CASE.emptyState}): / without the sections that need records, /portfolio an empty list, no detail page — never a throw`, () => {
    let r: PortfolioSiteResult;
    try {
      r = renderPortfolioSite(input({ portfolio: { categories, projects: [], assets: [] } }));
    } catch (error) {
      throw new Error(`threw: ${(error as Error).message}`);
    }
    if (CASE.emptyState === "refused") {
      assert(!r.ok && r.problems.length > 0, "the gate records `refused`, the kit accepted");
      return;
    }
    if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
    eq(r.files.map((f) => f.path), CASE.emptyFiles, "files");
    eq([r.projects, r.assets], [[], []], "projects, assets");
    const list = byPath(r, "/portfolio");
    assert(list.includes('data-section="portfolio.index"') && !list.includes(SLOT_ATTRIBUTE) && !/href="\/portfolio\/[a-z0-9]/.test(mainOf(list)), "/portfolio is not an empty list");
    assert(list.includes("<title>") && h1Of(list).length === 1, "/portfolio is not a complete page");
    const home = byPath(r, "/");
    assert(!home.includes(SLOT_ATTRIBUTE) && home.includes("<title>"), "/ is not a complete page");
    for (const s of [CASE.home.showcaseA, CASE.home.showcaseB]) assert(!home.includes(`data-section="${s.section}"`) && !home.includes(`id="${s.anchor}"`), `${s.section} is on a home page without records`);
    for (const section of ["home.hero", "home.intro", ...CASE.homeShellSections]) assert(home.includes(`data-section="${section}"`), `${section} left the home page`);
    assert(!/href="\/portfolio\/[a-z0-9]/.test(home), "/ links a project");
    // the intro's link went with its destination: /portfolio is answered, not advertised, while nothing is published
    assert(!sectionOf(home, "home.intro")!.includes(`href="${CASE.home.introPageLink}"`), "the intro still links the list");
    assert(!byPath(r, "/sitemap.xml").includes("/portfolio"), "the sitemap lists a page under /portfolio");
    assertAssetsExact(r, "nothing published");
    empty = r;
    results.emptyState = { gate: CASE.emptyState, files: r.files.map((f) => f.path) };
  });

  // ── C. parity with the last ordinary build ────────────────────────────────────────────────────
  console.log("C. parity with the last V1 package");
  const v1Dir = gitMaterialize(CODE_ROOT, CASE.v1.commit, `data/site-builds/${CASE.site}/packages/${CASE.v1.buildInputId}`, tmp);
  const v1Site = path.join(v1Dir, "site");
  const v1Record = await readJson(path.join(v1Dir, "build-record.json"));
  const parity: { path: string; mainBytes: number; markers: number; ids: number; tags: number; links: number; images: number; preloads: number; preloadsVerbatim: boolean }[] = [];
  await check("C0 the reference is the intact ordinary package of Demo 01 that is live (3d250199…, interior-01 1.6.3, every record built in)", async () => {
    assert(await packageIntact(v1Dir), "the V1 package does not hash to its packageHash");
    eq([v1Record.siteId, v1Record.packageHash, v1Record.template.releaseId], [CASE.site, CASE.v1.packageHash, CASE.v1.release], "V1 package");
    assert(v1Record.template.releaseHash !== pin.releaseHash && v1Record.portfolioRuntime === undefined, "the reference is not an ordinary build of an earlier release");
    results.v1 = { buildInputId: CASE.v1.buildInputId, packageHash: v1Record.packageHash, release: v1Record.template.releaseId, files: v1Record.qa.files };
  });
  const isErrorPage = (f: string) => f === "404.html" || f === "_not-found.html";
  await check("C1 the same public URL set: the package's own pages + the composed pages = the pages of the V1 package", async () => {
    const v1Urls = (await listFiles(v1Site)).filter((f) => f.endsWith(".html") && !isErrorPage(f)).map(urlOf).sort();
    const shells = new Set(Object.keys(CASE.shellPages));
    const mine = [...packageFiles.filter((f) => f.endsWith(".html") && !isErrorPage(f) && !shells.has(f)).map(urlOf), ...htmlFiles(composed).map((f) => f.path)].sort();
    eq(mine, v1Urls, "public URLs");
    eq(packageFiles.filter((f) => f.endsWith(".html") && !isErrorPage(f) && !shells.has(f)).map(urlOf).sort(), [...CASE.packagePages].sort(), "pages the package answers itself");
    results.publicUrls = v1Urls.length;
  });
  const parityPaths = ["/", "/portfolio", ...projects.map((p) => `/portfolio/${p.slug}`).sort()];
  for (const p of parityPaths) {
    await check(`C  ${p}`, async () => {
      const built = await readFile(path.join(v1Site, fileOf(p)), "utf8");
      const mine = byPath(composed, p);
      const a = normalizeMain(mainOf(mine));
      const b = normalizeMain(mainOf(built));
      eq(a.markers - b.markers, CASE.pageKind(p).slots.length, "boundary markers added (one pair per slot)");
      eq(a.ids, b.ids, "distinct generated ids");
      sameText(a.text, b.text, "<main>");
      eq(seoTags(mine), seoTags(built), "title / description / robots / canonical / og / twitter");
      assert(seoTags(mine).length >= 17, `only ${seoTags(mine).length} head tags compared`);
      sameText(chromeOf(mine), chromeOf(built), "markup around <main>");
      eq(h1Of(mine), h1Of(built), "h1");
      eq(h1Of(mine).length, 1, "one h1");
      eq(internalLinks(mine), internalLinks(built), "internal links");
      eq(imageRefs(mine), imageRefs(built), "image references");
      eq(imagePreloads(mine), imagePreloads(built), "image preload hints (as a set)");
      parity.push({
        path: p,
        mainBytes: Buffer.byteLength(a.text),
        markers: a.markers - b.markers,
        ids: a.ids,
        tags: seoTags(mine).length,
        links: internalLinks(mine).length,
        images: imageRefs(mine).length,
        preloads: imagePreloads(mine).length,
        preloadsVerbatim: JSON.stringify(imagePreloadTags(mine)) === JSON.stringify(imagePreloadTags(built)),
      });
    });
  }
  for (const p of CASE.packagePages) {
    await check(`C  ${p} (a page of the package): the same markup, head and links as the V1 package's`, async () => {
      const built = await readFile(path.join(v1Site, fileOf(p)), "utf8");
      const mine = await readFile(path.join(packageSite, fileOf(p)), "utf8");
      sameText(bodyOf(mine), bodyOf(built), "body markup");
      eq(seoTags(mine), seoTags(built), "head tags");
      eq(internalLinks(mine), internalLinks(built), "internal links");
    });
  }
  await check("C  /sitemap.xml (composed) and /robots.txt (the package's) are byte-identical to the V1 package's", async () => {
    sameText(byPath(composed, "/sitemap.xml"), await readFile(path.join(v1Site, "sitemap.xml"), "utf8"), "sitemap.xml");
    sameText(await readFile(path.join(packageSite, "robots.txt"), "utf8"), await readFile(path.join(v1Site, "robots.txt"), "utf8"), "robots.txt");
  });
  await check("C  besides its pages the shell package differs from the V1 package in exactly: no integration feed, the two runtime documents", async () => {
    // everything that is not a page, its RSC payload, a build chunk or an image
    const other = (files: string[]) => files.filter((f) => !/\.(html|txt)$/.test(f) && !f.startsWith("_next/") && !f.startsWith("assets/")).concat(files.filter((f) => f === "robots.txt")).sort();
    const [v1Other, mineOther] = [other(await listFiles(v1Site)), other(packageFiles)];
    eq(mineOther.filter((f) => !v1Other.includes(f)), [RUNTIME_FILE, SHELL_FILE].sort(), "files only in the shell package");
    const gone = v1Other.filter((f) => !mineOther.includes(f));
    assert(gone.length > 0 && gone.every((f) => f.startsWith("_integration/")), `files only in the V1 package: ${gone.join(", ")}`);
    results.packageDifferences = { added: [RUNTIME_FILE, SHELL_FILE], removed: gone };
  });
  const sum = (key: "mainBytes" | "tags" | "links" | "images" | "markers" | "ids" | "preloads") => parity.reduce((n, p) => n + p[key], 0);
  results.parity = {
    pages: parity.length,
    of: parityPaths.length,
    packagePages: CASE.packagePages.length,
    compared: { mainBytes: sum("mainBytes"), headTags: sum("tags"), internalLinks: sum("links"), images: sum("images"), slotBoundaries: sum("markers"), generatedIds: sum("ids"), imagePreloads: sum("preloads") },
    /** accepted difference 3, measured: the pages whose preload hints are not also the same tags in the same order */
    pagesWithReorderedPreloads: parity.filter((p) => !p.preloadsVerbatim).map((p) => p.path),
    acceptedDifferences: CASE.acceptedDifferences,
  };

  // ── D. browser ────────────────────────────────────────────────────────────────────────────────
  console.log("D. browser (Playwright, headless Chromium)");
  const extraAssetFiles = new Map<string, string>();
  const overlayOf = (r: Composed): Overlay => ({
    routes: new Map(r.files.map((f) => [f.path, { contentType: f.contentType, body: f.body }])),
    assets: new Map(r.assets.map((a) => [a.publicPath, { file: extraAssetFiles.get(a.id) ?? path.join(siteDir, "assets", registry.find((e) => e.id === a.id).file as string), contentType: "image/jpeg" }])),
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
    /** loaded, and React has attached to the element `selector` (the slot is hydrated, its handlers live) */
    const settle = async (page: Page, selector?: string) => {
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => Object.keys(document).some((k) => k.startsWith("__reactContainer$")) || Object.keys(document.body).some((k) => k.startsWith("__reactFiber$")), undefined, { timeout: 10_000 }).catch(() => undefined);
      if (selector) {
        await page.waitForFunction((sel) => {
          const el = document.querySelector(sel);
          return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
        }, selector, { timeout: 10_000 });
        await page.waitForTimeout(150);
      }
    };
    const resultCount = async (page: Page) => Number(await page.locator(CASE.sel.resultCount).first().getAttribute("data-result-count"));
    const cardIds = (page: Page) => page.locator(CASE.sel.listCards).evaluateAll((els) => els.map((e) => e.getAttribute("data-project-card") ?? ""));
    const brokenImages = (page: Page) => page.locator("img").evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src));

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
        await check(`D1 ${vp.name}: / shows the runtime sections between the shell's own, hydrated from the inline data, nothing of the shell left`, async () => {
          const res = await page.goto(`${server.origin}/`);
          eq(res?.status(), 200, "status");
          await settle(page, CASE.sel.section("home.hero"));
          for (const section of [...CASE.shellPages["index.html"]!, ...CASE.homeShellSections]) eq(await page.locator(CASE.sel.section(section)).count(), 1, section);
          eq(await page.locator(`[${SLOT_ATTRIBUTE}]`).count(), 0, "placeholders in the document");
          sameText(normalizeMain(await page.locator("main").evaluate((el) => el.outerHTML)).text.replace(/ style=""/g, "").slice(0, 300), normalizeMain(mainOf(byPath(composed, "/"))).text.slice(0, 300), "the document's <main> after hydration (opening)");
          assert((await page.title()).length > 0, "no title");
          for (const c of [CASE.home.showcaseA, CASE.home.showcaseB]) eq(await page.locator(`${CASE.sel.section(c.section)} [data-project-card]`).count(), c.ids.length, `${c.section} cards`);
          for (const cta of CASE.home.heroCta) eq(await page.locator(`${CASE.sel.section("home.hero")} a[href="${hrefOf(cta.project)}"]`).count(), 1, `hero call to action of ${cta.slide}`);
          eq(await brokenImages(page), [], "broken images");
        }),
      );
      let total = 0;
      ok.push(
        await check(`D2 ${vp.name}: /portfolio lists every record; a filter changes the cards and the URL in place; back restores, forward re-applies`, async () => {
          const res = await page.goto(`${server.origin}/portfolio`);
          eq(res?.status(), 200, "status");
          await settle(page, CASE.sel.resultCount);
          total = await resultCount(page);
          eq(total, projects.length, "result count");
          const all = await cardIds(page);
          eq(all.length, projects.length, "cards");
          await page.evaluate(() => ((window as any).__proofSameDocument = true));
          // a real click on a visible control: the chips are open on desktop, behind the filter button on mobile
          const options = page.locator(CASE.sel.filterOption);
          if (!(await options.first().isVisible())) await page.locator(CASE.sel.filterToggle).click();
          // the first option that narrows the list
          let filtered = 0;
          let some: string[] = [];
          for (let i = 0; i < (await options.count()); i++) {
            await options.nth(i).click();
            await page.waitForFunction(() => location.search.length > 1);
            filtered = await resultCount(page);
            some = await cardIds(page);
            if (filtered > 0 && filtered < total) break;
            await options.nth(i).click();
            await page.waitForFunction(() => location.search === "");
          }
          assert(filtered > 0 && filtered < total, `no filter option narrowed the list (${filtered} of ${total})`);
          eq(some.length, filtered, "cards shown under the filter");
          assert(JSON.stringify(some) !== JSON.stringify(all.slice(0, some.length)) || some.length < all.length, "the cards did not change");
          eq(await page.evaluate(() => (window as any).__proofSameDocument), true, "filtering left the document");
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
          eq(await brokenImages(page), [], "broken images");
        }),
      );
      let detailPath = "";
      ok.push(
        await check(`D3 ${vp.name}: a card on /portfolio leads to its detail page — a document load, not a client transition`, async () => {
          const link = page.locator(CASE.sel.listCardLinks).first();
          detailPath = (await link.getAttribute("href"))!;
          const project = projects.find((p) => `/portfolio/${p.slug}` === detailPath);
          assert(project, `the first card links ${detailPath}, which is no record`);
          await link.scrollIntoViewIfNeeded();
          await Promise.all([page.waitForURL(`${server.origin}${detailPath}`), link.click()]);
          await settle(page, CASE.sel.section("portfolio.detail"));
          eq(await page.evaluate(() => (window as any).__proofSameDocument), undefined, "the window survived the navigation");
          eq(await page.locator(CASE.sel.section("portfolio.detail")).count(), 1, "detail section");
          assert((await page.locator(CASE.sel.detailTitle).first().innerText()).includes(project.title), "the detail page does not show the record's title");
          eq(await page.title(), `${project.title} | ${site.identity.brandName}`, "document title");
          eq(await page.locator('link[rel="canonical"]').getAttribute("href"), `${site.identity.publicOrigin}${detailPath}`, "canonical");
        }),
      );
      ok.push(
        await check(`D4 ${vp.name}: the detail gallery opens its viewer and closes again`, async () => {
          const zoom = page.locator(CASE.sel.galleryZoom).first();
          await zoom.scrollIntoViewIfNeeded();
          await zoom.click();
          const viewer = page.locator(CASE.sel.viewer);
          await viewer.waitFor({ state: "visible", timeout: 5000 });
          assert(await viewer.evaluate((d) => (d as HTMLDialogElement).open), "the dialog is not open");
          await page.locator(CASE.sel.viewerImage).waitFor({ state: "visible" });
          assert(await page.locator(CASE.sel.viewerImage).evaluate((i) => (i as HTMLImageElement).decode().then(() => (i as HTMLImageElement).naturalWidth > 0)), "the viewer image did not load");
          await page.locator(CASE.sel.viewerClose).click();
          await page.waitForFunction((sel) => !document.querySelector(sel) || !(document.querySelector(sel) as HTMLDialogElement).open, CASE.sel.viewer);
        }),
      );
      ok.push(
        await check(`D5 ${vp.name}: the before / after control on a record with \`before\` photos (${CASE.beforeAfterProject}) switches the photo and back`, async () => {
          const res = await page.goto(`${server.origin}${hrefOf(CASE.beforeAfterProject)}`);
          eq(res?.status(), 200, "status");
          await settle(page, CASE.sel.section("portfolio.detail"));
          eq(await page.locator(CASE.sel.section("portfolio.detail")).getAttribute("data-before-after"), "true", "the page says it has before / after photos");
          const item = page.locator(CASE.sel.beforeAfterItem).first();
          if (!(await item.isVisible()) && (await page.locator(CASE.sel.galleryMore).count()) > 0) await page.locator(CASE.sel.galleryMore).first().click();
          await item.scrollIntoViewIfNeeded();
          const [beforeImg, afterImg] = [item.locator(CASE.sel.beforeImage), item.locator(CASE.sel.afterImage)];
          eq([await afterImg.isVisible(), await beforeImg.isVisible()], [true, false], "opens on the after photo");
          await item.locator(CASE.sel.beforeButton).click();
          await beforeImg.waitFor({ state: "visible", timeout: 5000 });
          eq([await afterImg.isVisible(), await item.locator(CASE.sel.beforeButton).getAttribute("aria-pressed")], [false, "true"], "before is shown");
          assert(await beforeImg.evaluate((i) => (i as HTMLImageElement).decode().then(() => (i as HTMLImageElement).naturalWidth > 0)), "the before photo did not load");
          await item.locator(CASE.sel.afterButton).click();
          await afterImg.waitFor({ state: "visible", timeout: 5000 });
          eq([await beforeImg.isVisible(), await item.locator(CASE.sel.afterButton).getAttribute("aria-pressed")], [false, "true"], "after is shown again");
        }),
      );
      ok.push(
        await check(`D6 ${vp.name}: the pages outside the overlay (${CASE.packagePages.join(", ")}) are the package's and lead back with plain document loads`, async () => {
          for (const p of CASE.packagePages) {
            const res = await page.goto(`${server.origin}${p}`);
            eq(res?.status(), 200, `${p} status`);
            await settle(page);
            eq(served.filter((x) => x.path === p).at(-1)?.from, "package", `${p} is served from the package`);
          }
          await page.evaluate(() => ((window as any).__proofSameDocument = true));
          const back = page.locator('header a[href="/portfolio"]').first();
          if (!(await back.isVisible())) {
            // the mobile header keeps its links in the menu: follow the link itself
            await Promise.all([page.waitForURL(`${server.origin}/portfolio`), back.evaluate((a) => (a as HTMLAnchorElement).click())]);
          } else {
            await Promise.all([page.waitForURL(`${server.origin}/portfolio`), back.click()]);
          }
          await settle(page, CASE.sel.resultCount);
          eq(await page.evaluate(() => (window as any).__proofSameDocument), undefined, "the window survived the navigation");
          eq(await resultCount(page), projects.length, "the list after the document load");
        }),
      );
      ok.push(
        await check(`D7 ${vp.name}: no console error, no failed or 4xx/5xx request, no React hydration error (#418 / #423 / #425), no RSC request`, () => {
          eq(s.errors.filter((e) => HYDRATION_ERROR.test(e)), [], "React hydration errors");
          eq(s.errors, [], "errors");
          eq(s.rsc, [], "RSC payload requests");
        }),
      );
      results[`browser.${vp.name}.external`] = [...new Set(s.external.map((u) => new URL(u).origin))];
      browserResults[vp.name] = ok.every(Boolean) ? "PASS" : "FAIL";
      await s.context.close();
    }

    await check("D8 what the revision does not answer inside its URL space is the package's 404 page: an unknown slug, the reserved shells, a list page, RSC forms; /_runtime is never served", async () => {
      const context = await browser.newContext();
      const notFound = await readFile(path.join(packageSite, NOT_FOUND_KEY), "utf8");
      const unserved = ["/portfolio/no-such-project", "/portfolio/_shell", "/portfolio/page/_shell", "/portfolio/page/2", "/portfolio/page/1", "/portfolio.txt", `/portfolio/${projects[0].slug}.txt`, "/_runtime/portfolio/shell.json", "/_runtime/portfolio/runtime.json"];
      for (const p of unserved) {
        const res = await context.request.get(`${server.origin}${p}`);
        eq(res.status(), 404, `${p} status`);
        eq(sha256(await res.text()), sha256(notFound), `${p} body is the package's 404 page`);
      }
      eq(await (await context.request.get(`${server.origin}/sitemap.xml`)).text(), byPath(composed, "/sitemap.xml"), "/sitemap.xml is the revision's");
      await context.close();
      results.unserved = unserved.length;
    });

    // ── E. growth: the kit again, nothing else ──────────────────────────────────────────────────
    console.log("E. a 9th record with a new image, and a second list page — the kit only");
    // a new image: real, decodable bytes nobody has published before (a JPEG with trailing bytes after its end marker)
    const donor = assets.find((a) => a.id === projects[projects.length - 1].cover.asset);
    const newBytes = Buffer.concat([await readFile(path.join(siteDir, "assets", donor.file)), Buffer.from("portfolio-runtime-interior-01 proof")]);
    const newFile = path.join(tmp, "proof-ninth-cover.jpg");
    await writeFile(newFile, newBytes);
    const newAsset = { ...donor, id: "bi09-proof-cover", file: "bi09-proof-cover.jpg", sha256: sha256(newBytes), size: newBytes.length };
    extraAssetFiles.set(newAsset.id, newFile);
    const ninth = clone(projects[projects.length - 1]);
    Object.assign(ninth, { id: "bi-09", slug: "proof-ninth-project", title: "증명용 아홉 번째 시공사례", publishedAt: "2026-10-09T09:00:00+09:00" });
    ninth.cover.asset = newAsset.id;
    ninth.galleryGroups[0].items[0].image.asset = newAsset.id;
    const ninePortfolio = { categories, projects: [...projects, ninth], assets: [...assets, newAsset] };
    let nine!: Composed;
    await check("E1 nine records in → the new detail page with its new image, its card first on /portfolio, the sitemap; the other eight keep their head", () => {
      assert(!assets.some((a) => a.sha256 === newAsset.sha256), "the new image is not new");
      const r = compose({ portfolio: ninePortfolio });
      nine = r;
      eq(r.files.length, composed.files.length + 1, "files");
      eq(r.projects.length, 9, "projects");
      eq(r.assets.find((a) => a.id === newAsset.id), { id: newAsset.id, publicPath: publicPath(newAsset) }, "the new image in assets[]");
      const detail = byPath(r, "/portfolio/proof-ninth-project");
      assert(detail.includes(`<title>${ninth.title} | ${site.identity.brandName}</title>`), "the new page's title");
      assert(mainOf(detail).includes(ninth.title), "the new page's <main> does not show the record");
      assert(imageRefs(detail).includes(publicPath(newAsset)), "the new page does not show the new image");
      const list = byPath(r, "/portfolio");
      eq(internalLinks(mainOf(list)).filter((h) => /^\/portfolio\/[a-z0-9]/.test(h))[0], "/portfolio/proof-ninth-project", "the newest record is the first card");
      assert(imageRefs(list).includes(publicPath(newAsset)), "the new card does not show the new image");
      assert(!byPath(composed, "/portfolio").includes("proof-ninth-project"), "the 8-record list already had it");
      assert(byPath(r, "/sitemap.xml").includes("/portfolio/proof-ninth-project</loc>"), "the sitemap does not list the new page");
      for (const p of projects) eq(seoTags(byPath(r, `/portfolio/${p.slug}`)), seoTags(byPath(composed, `/portfolio/${p.slug}`)), `/portfolio/${p.slug} head`);
      assertAssetsExact(r, "9 records");
      results.ninth = { newImage: publicPath(newAsset), detailPagesWhoseMarkupChanged: projects.filter((p) => byPath(r, `/portfolio/${p.slug}`) !== byPath(composed, `/portfolio/${p.slug}`)).length };
    });
    await check("E2 the home showcases follow their selection: Demo 01 names its records by id, so / does not move; a site that selects the latest gets the new record first", () => {
      // Demo 01: both showcases are manual selections → the 9th record is in neither, and the page is the same bytes
      eq(sha256(byPath(nine, "/")), sha256(byPath(composed, "/")), "/ of Demo 01 with nine records");
      // the same site, had it chosen "latest" for showcase A
      const newest = [...projects].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).map((p) => p.id as string);
      const latest = shellWith((s) => (s.settings.overrides[CASE.home.showcaseA.section] = { limit: 4, selection: { mode: "latest" } }));
      const r = compose({ shell: latest, portfolio: ninePortfolio });
      const home = mainOf(byPath(r, "/"));
      const sectionA = home.slice(home.indexOf(`data-section="${CASE.home.showcaseA.section}"`), home.indexOf(`data-section="${CASE.home.showcaseB.section}"`));
      const cards = [...sectionA.matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]);
      eq(cards, ["bi-09", ...newest.slice(0, 3)], "showcase A under `latest`");
      assert(imageRefs(sectionA).includes(publicPath(newAsset)), "the showcase does not show the new image");
      // and without the 9th record the same selection is the four newest of the eight
      const eight = mainOf(byPath(compose({ shell: latest }), "/"));
      eq([...eight.slice(eight.indexOf(`data-section="${CASE.home.showcaseA.section}"`), eight.indexOf(`data-section="${CASE.home.showcaseB.section}"`)).matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]), newest.slice(0, 4), "showcase A under `latest`, eight records");
    });
    // 31 records: one more than a list page holds
    const extra = Array.from({ length: CASE.listPageSize + 1 - projects.length }, (_, i) => ({
      ...clone(projects[i % projects.length]),
      id: `bx-${String(i + 1).padStart(2, "0")}`,
      slug: `proof-extra-${String(i + 1).padStart(2, "0")}`,
      title: `증명용 추가 사례 ${i + 1}`,
      publishedAt: `2025-12-${String(28 - i).padStart(2, "0")}T09:00:00+09:00`,
    }));
    let many!: Composed;
    await check(`E3 ${CASE.listPageSize + 1} records → /portfolio/page/2, composed from its own shell: its own title and canonical, the pager links both ways, page 1 keeps the filter`, () => {
      const r = compose({ portfolio: { categories, projects: [...projects, ...extra], assets } });
      many = r;
      eq(r.files.filter((f) => f.path.startsWith("/portfolio/page/")).map((f) => f.path), ["/portfolio/page/2"], "list pages 2+");
      const two = byPath(r, "/portfolio/page/2");
      assert(two.includes(`<title>${CASE.listPageTitle(2)}</title>`), `page 2 title: ${/<title>[\s\S]*?<\/title>/.exec(two)?.[0]}`);
      assert(two.includes(`<link rel="canonical" href="${site.identity.publicOrigin}/portfolio/page/2"/>`), "page 2 canonical");
      assert(mainOf(two).includes('data-page-number="2"'), "page 2 does not say it is page 2");
      eq(count(mainOf(two), "data-project-card="), 1, "cards on page 2");
      assert(internalLinks(mainOf(two)).includes("/portfolio"), "page 2 does not link page 1");
      const one = byPath(r, "/portfolio");
      eq(count(mainOf(one), "data-project-card="), CASE.listPageSize, "cards on page 1");
      assert(internalLinks(mainOf(one)).includes("/portfolio/page/2"), "page 1 does not link page 2");
      // the two list shells differ only around <main> (the header marks the list as the current page / section): each page came from its own
      sameText(chromeOf(two), chromeOf(shellPages["portfolio/page/_shell.html"]!), "markup around <main> of page 2 vs its shell");
      sameText(chromeOf(one), chromeOf(shellPages["portfolio.html"]!), "markup around <main> of page 1 vs its shell");
      assert(byPath(r, "/sitemap.xml").includes("/portfolio/page/2</loc>"), "the sitemap does not list page 2");
      assertAssetsExact(r, `${CASE.listPageSize + 1} records`);
    });
    await check("E4 in the browser: the new detail page and its image load, /portfolio counts nine and links it; page 2 of the long list hydrates and leads back — no error", async () => {
      overlay = overlayOf(nine);
      const s = await open("desktop", { viewport: { width: 1440, height: 900 } });
      const { page } = s;
      eq((await page.goto(`${server.origin}/portfolio/proof-ninth-project`))?.status(), 200, "new detail status");
      await settle(page, CASE.sel.section("portfolio.detail"));
      assert((await page.locator(CASE.sel.detailTitle).first().innerText()).includes(ninth.title), "title on the page");
      eq(served.filter((x) => x.path === publicPath(newAsset)).at(-1)?.from, "asset", "the new image was served as a published image");
      eq(await brokenImages(page), [], "broken images");
      eq((await page.goto(`${server.origin}/portfolio`))?.status(), 200, "/portfolio status");
      await settle(page, CASE.sel.resultCount);
      eq(await resultCount(page), 9, "result count");
      const card = page.locator(`${CASE.sel.section("portfolio.index")} a[href="/portfolio/proof-ninth-project"]`).first();
      await card.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL(`${server.origin}/portfolio/proof-ninth-project`), card.click()]);
      overlay = overlayOf(many);
      eq((await page.goto(`${server.origin}/portfolio/page/2`))?.status(), 200, "/portfolio/page/2 status");
      await settle(page, CASE.sel.section("portfolio.index"));
      eq(await page.locator(CASE.sel.listCards).count(), 1, "cards on page 2");
      eq((await page.goto(`${server.origin}/portfolio`))?.status(), 200, "/portfolio status (long list)");
      await settle(page, CASE.sel.resultCount);
      eq([await resultCount(page), await page.locator(CASE.sel.listCards).count()], [CASE.listPageSize + 1, CASE.listPageSize], "count and cards on page 1");
      const next = page.locator(CASE.sel.pagerNext).first();
      await next.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL(`${server.origin}/portfolio/page/2`), next.click()]);
      await settle(page, CASE.sel.section("portfolio.index"));
      eq(s.errors, [], "errors");
      eq(s.rsc, [], "RSC payload requests");
      await s.context.close();
    });
    await check("E5 in the browser: with nothing published /portfolio is an empty list page and / still renders — no error", async () => {
      if (CASE.emptyState === "refused") return;
      assert(empty, "B8 did not compose");
      overlay = overlayOf(empty);
      const s = await open("desktop", { viewport: { width: 1440, height: 900 } });
      eq((await s.page.goto(`${server.origin}/portfolio`))?.status(), 200, "/portfolio status");
      await settle(s.page, CASE.sel.section("portfolio.index"));
      eq(await s.page.locator(CASE.sel.section("portfolio.index")).count(), 1, "list section");
      eq(await s.page.locator(`${CASE.sel.section("portfolio.index")} a[href^="/portfolio/"]`).count(), 0, "cards");
      eq((await s.page.goto(`${server.origin}/`))?.status(), 200, "/ status");
      await settle(s.page, CASE.sel.section("home.hero"));
      eq(await s.page.locator(`${CASE.sel.section("home.hero")} [data-hero-slide]`).count(), CASE.home.heroSlides, "hero slides");
      eq((await s.context.request.get(`${server.origin}/portfolio/${projects[0].slug}`)).status(), 404, "an unpublished record's URL");
      eq(s.errors, [], "errors");
      await s.context.close();
    });

    // ── F. the home rules ───────────────────────────────────────────────────────────────────────
    console.log("F. the home page's rules");
    let emptied!: Composed;
    await check("F1 a showcase that becomes empty disappears together with the intro's anchor link to it — and both are there while it has a record", () => {
      const { showcaseA: A, showcaseB: B, introAnchorLink: link } = CASE.home;
      eq(link.href, `#${B.anchor}`, "the case's intro link targets showcase B");
      const anchored = shellWith((s) => (s.slots.values["home.intro"].link = link));
      // every record published: the section, its anchor, the link
      const full = byPath(compose({ shell: anchored }), "/");
      assert(sectionOf(full, B.section)?.includes(`id="${B.anchor}"`), "showcase B is not on the page with its anchor");
      assert(sectionOf(full, "home.intro")?.includes(`href="${link.href}"`), "the intro does not link showcase B");
      // one record of B left: still there
      const one = byPath(compose({ shell: anchored, portfolio: { categories, assets, projects: withStatus(B.ids.slice(1), "draft") } }), "/");
      eq([...(sectionOf(one, B.section) ?? "").matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]), [B.ids[0]], "showcase B with one record left");
      assert(sectionOf(one, "home.intro")?.includes(`href="${link.href}"`), "the intro lost its link while showcase B is on the page");
      // none left: the section is gone — no wrapper, no anchor — and so is the intro's link; the intro itself and showcase A stay
      emptied = compose({ shell: anchored, portfolio: { categories, assets, projects: withStatus(B.ids, "draft") } });
      const none = byPath(emptied, "/");
      eq(sectionOf(none, B.section), undefined, "showcase B without a record");
      assert(!mainOf(none).includes(`id="${B.anchor}"`), "the anchor of showcase B is still on the page");
      assert(!none.includes(`href="${link.href}"`), "a link to the missing anchor is still on the page");
      const intro = sectionOf(none, "home.intro");
      assert(intro && !intro.includes(link.label), "the intro is gone, or kept the link's label");
      eq([...(sectionOf(none, A.section) ?? "").matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]), A.ids, "showcase A is untouched");
      // the slot data says the same: no entry for the section, no link in the intro's
      const data = JSON.parse(new RegExp(`id="${SLOT_DATA_ID}">([\\s\\S]*?)</script>`).exec(none)![1]!) as Record<string, any>;
      eq([Object.hasOwn(data, B.section), data["home.intro"].link], [false, undefined], "slot data");
      // Demo 01's own intro links a page: kept while the list has a record
      assert(sectionOf(byPath(composed, "/"), "home.intro")?.includes(`href="${CASE.home.introPageLink}"`), "Demo 01's intro lost its link to the list");
    });
    await check("F2 a hero call to action to a project that is not served is dropped; the slide stays, the other slides keep theirs", () => {
      const [gone, kept] = CASE.home.heroCta;
      const r = compose({ portfolio: { categories, assets, projects: withStatus([gone!.project], "draft") } });
      const hero = sectionOf(byPath(r, "/"), "home.hero");
      assert(hero, "the hero left the page");
      eq(count(hero, "data-hero-slide="), CASE.home.heroSlides, "slides");
      assert(!byPath(r, "/").includes(hrefOf(gone!.project)), "a link to the unserved project is on the page");
      assert(hero.includes(`href="${hrefOf(kept!.project)}"`), "another slide lost its call to action");
      eq(count(sectionOf(byPath(composed, "/"), "home.hero")!, "<a ") - count(hero, "<a "), 1, "links removed from the hero");
      const data = JSON.parse(new RegExp(`id="${SLOT_DATA_ID}">([\\s\\S]*?)</script>`).exec(byPath(r, "/"))![1]!) as Record<string, any>;
      eq(data["home.hero"].slides.map((x: any) => [x.id, x.cta?.href]).filter((x: any[]) => x[0] === gone!.slide), [[gone!.slide, undefined]], "slot data of the slide");
      assert(!r.files.some((f) => f.path === hrefOf(gone!.project)), "the unserved project has a page");
    });
    await check("F3 in the browser: the page without showcase B and the page with a dropped hero call to action hydrate without an error", async () => {
      const s = await open("desktop", { viewport: { width: 1440, height: 900 } });
      overlay = overlayOf(emptied);
      eq((await s.page.goto(`${server.origin}/`))?.status(), 200, "/ status");
      await settle(s.page, CASE.sel.section("home.hero"));
      eq([await s.page.locator(CASE.sel.section(CASE.home.showcaseB.section)).count(), await s.page.locator(`#${CASE.home.showcaseB.anchor}`).count()], [0, 0], "showcase B in the document");
      eq(await s.page.locator(CASE.sel.section(CASE.home.showcaseA.section)).count(), 1, "showcase A in the document");
      overlay = overlayOf(compose({ portfolio: { categories, assets, projects: withStatus([CASE.home.heroCta[0]!.project], "draft") } }));
      eq((await s.page.goto(`${server.origin}/`))?.status(), 200, "/ status");
      await settle(s.page, CASE.sel.section("home.hero"));
      eq(await s.page.locator(`${CASE.sel.section("home.hero")} [data-hero-slide]`).count(), CASE.home.heroSlides, "hero slides");
      eq(s.errors, [], "errors");
      await s.context.close();
    });

    await check("G  the package directory did not change: same tree hash, still intact — none of this cost a build", async () => {
      const after = await treeHash(packageDir);
      eq(after, before, "package tree hash");
      assert(await packageIntact(packageDir), "the package no longer hashes to its packageHash");
      eq((await readJson(path.join(repoRoot, "data/site-builds", CASE.site, "current.json"))).buildInputId, current.buildInputId, "current pointer");
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
console.log(`\nportfolio-runtime-interior-01: ${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.log(failed.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
