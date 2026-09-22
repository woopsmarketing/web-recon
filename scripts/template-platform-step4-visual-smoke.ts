/**
 * Step 4 visual smoke: exercise already-BUILT static site packages (interior-01
 * template) for fixture-large / fixture-small / fixture-empty across desktop /
 * tablet / mobile viewports in Chromium. Does NOT build anything — it only reads
 * `data/site-builds/<site>/current.json` to find each site's current package and
 * serves it from a local nginx-`try_files`-style static server.
 *
 * Per visit ("every visit" section of the spec): main document status, console
 * errors / pageerrors, non-local requests (blocked + recorded), subresource
 * responses >= 400, broken images (visible: complete+naturalWidth>0; ALL images
 * including hidden ones: fetched from the page and required to be HTTP 200),
 * horizontal overflow, and every same-origin `a[href^="/"]` on the page resolves
 * to HTTP 200 (deduped across the whole run). Plus route-specific structural /
 * interaction checks (cards, columns, pagination, tabs, show-more, before/after
 * toggle, band order, 404s) per the recon-template-platform Step 4 spec.
 *
 *   tsx scripts/template-platform-step4-visual-smoke.ts [outDir] [--root <dir>]
 *
 * `--root` defaults to cwd; everything (site data + built packages) is read
 * relative to it. `outDir` (screenshots + summary.json) defaults to
 * docs/result/recon-template-platform-step4/screens, resolved relative to cwd.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
let rootArg = process.cwd();
let outDirArg: string | undefined;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--root") rootArg = argv[++i] ?? rootArg;
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = path.resolve(rootArg);
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-step4/screens");

// ---------------------------------------------------------- static server
// nginx try_files semantics: $uri (must be a FILE, not a dir) -> $uri.html ->
// $uri/index.html -> else 404 (served with 404.html's body). This matters
// because a Step 4 package has BOTH "portfolio.html" and a "portfolio/"
// directory (holding per-slug files) for the same route.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function isFile(p: string): Promise<boolean> {
  const st = await stat(p).catch(() => undefined);
  return !!st && st.isFile();
}

function withinRoot(rootDir: string, file: string): boolean {
  const rel = path.relative(rootDir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveStaticFile(rootDir: string, rawPathname: string): Promise<string | undefined> {
  const decoded = decodeURIComponent(rawPathname);
  const candidates = [decoded];
  if (!decoded.endsWith("/")) candidates.push(`${decoded}.html`);
  candidates.push(decoded.endsWith("/") ? `${decoded}index.html` : `${decoded}/index.html`);
  for (const candidate of candidates) {
    const file = path.join(rootDir, candidate);
    if (!withinRoot(rootDir, file)) continue;
    if (await isFile(file)) return file;
  }
  return undefined;
}

function serveStatic(siteRoot: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x");
      const resolved = await resolveStaticFile(siteRoot, url.pathname);
      if (!resolved) {
        const notFound = path.join(siteRoot, "404.html");
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        if (await isFile(notFound)) createReadStream(notFound).pipe(res);
        else res.end("Not Found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(resolved)] ?? "application/octet-stream" });
      createReadStream(resolved).pipe(res);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ------------------------------------------------------------------ data
async function loadPackageRoot(rootDir: string, site: string): Promise<string> {
  const ptrPath = path.join(rootDir, "data/site-builds", site, "current.json");
  const ptr = JSON.parse(await readFile(ptrPath, "utf8")) as { packageDir: string };
  return path.join(rootDir, ptr.packageDir, "site");
}

async function loadProjectSlugs(rootDir: string, site: string): Promise<Map<string, string>> {
  const file = path.join(rootDir, "data/sites", site, "content/projects.json");
  const map = new Map<string, string>();
  const raw = await readFile(file, "utf8").catch(() => undefined);
  if (!raw) return map;
  const data = JSON.parse(raw) as { items?: { id: string; slug: string }[] };
  for (const item of data.items ?? []) map.set(item.id, item.slug);
  return map;
}

// -------------------------------------------------------------- viewports
type ViewportName = "desktop-1440" | "tablet-1000" | "mobile-390";
const VIEWPORTS: Record<ViewportName, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  "desktop-1440": { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  "tablet-1000": { width: 1000, height: 800, deviceScaleFactor: 1, isMobile: false },
  "mobile-390": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

// ------------------------------------------------------------------- row
interface Row {
  site: string;
  route: string;
  viewport: string;
  status: number | undefined;
  cards?: number;
  columns?: number;
  failures: string[];
  screenshot?: string;
}
const rows: Row[] = [];
// Same-origin link -> status, deduped across the whole run.
const linkCache = new Map<string, number>();

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function slugRoute(route: string, detailId?: string): string {
  if (detailId) return `detail-${detailId}`;
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/\//g, "-");
}

function screenshotFile(site: string, route: string, viewport: string, detailId?: string): string {
  return `${site}--${slugRoute(route, detailId)}--${viewport}.png`;
}

function logRow(row: Row): void {
  const ok = row.failures.length === 0;
  const extras = [
    row.status !== undefined ? `status=${row.status}` : null,
    row.cards !== undefined ? `cards=${row.cards}` : null,
    row.columns !== undefined ? `columns=${row.columns}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`${ok ? "ok  " : "FAIL"} ${row.site} ${row.route} ${row.viewport} ${extras}`);
  if (!ok) for (const f of row.failures) console.log(`     - ${f}`);
}

// --------------------------------------------------------------- session
interface Session {
  page: Page;
  ctx: BrowserContext;
  site: string;
  route: string;
  viewport: ViewportName;
  origin: string;
  failures: string[];
  status: number | undefined;
  cards?: number;
  columns?: number;
  screenshot?: string;
}

async function beginSession(browser: Browser, site: string, origin: string, route: string, vpName: ViewportName): Promise<Session> {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await ctx.newPage();
  // tsx/esbuild wraps named inner functions with __name(); give evaluated code a no-op shim.
  await page.addInitScript("window.__name = (f) => f;");
  const failures: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(`console: ${truncate(m.text())}`);
  });
  page.on("pageerror", (e) => failures.push(`pageerror: ${truncate(e.message)}`));
  page.on("response", (r) => {
    const status = r.status();
    if (status < 400) return;
    let isMainNav = false;
    try {
      isMainNav = r.request().isNavigationRequest() && r.frame() === page.mainFrame();
    } catch {
      isMainNav = false;
    }
    if (!isMainNav) failures.push(`subresource ${status}: ${r.url()}`);
  });
  await page.route("**/*", (rt) => {
    let hostname = "";
    try {
      hostname = new URL(rt.request().url()).hostname;
    } catch {
      hostname = "";
    }
    if (hostname && hostname !== "127.0.0.1") {
      failures.push(`nonlocal-request: ${rt.request().url()}`);
      void rt.abort();
    } else {
      void rt.continue();
    }
  });
  const resp = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" }).catch(() => undefined);
  return { page, ctx, site, route, viewport: vpName, origin, failures, status: resp?.status() };
}

async function runCommonChecks(s: Session): Promise<void> {
  if (s.status !== 200) s.failures.push(`status: expected 200 got ${s.status}`);

  // Scroll through to trigger lazy images, then settle.
  await s.page
    .evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    })
    .catch(() => {});
  await s.page.waitForLoadState("networkidle").catch(() => {});

  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  if (overflow) s.failures.push("horizontal-overflow");

  const brokenVisible: string[] = await s.page
    .evaluate(() => {
      // "Visible" = actually on screen. Below-the-fold vertical position doesn't
      // disqualify an image (the scroll-through above already triggered those
      // lazy loads and we scroll back to the top afterward), but items scrolled
      // out of view horizontally inside a nested strip (the <1281 room swiper)
      // do: they keep real layout size and pass checkVisibility() even though
      // the user can't see them without swiping, so native lazy-loading
      // correctly never fetched them. Those are still covered by the separate
      // "every img in the DOM" fetch-status check below.
      const isVisible = (img: HTMLImageElement): boolean => {
        const anyImg = img as unknown as { checkVisibility?: () => boolean };
        if (typeof anyImg.checkVisibility === "function" && !anyImg.checkVisibility()) return false;
        const r = img.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (r.right <= 0 || r.left >= window.innerWidth) return false;
        return true;
      };
      return Array.from(document.images)
        .filter((img) => isVisible(img) && !(img.complete && img.naturalWidth > 0))
        .map((img) => img.currentSrc || img.src);
    })
    .catch(() => []);
  brokenVisible.forEach((src) => s.failures.push(`broken-image-visible: ${src}`));

  const allSrcs: string[] = await s.page.evaluate(() => Array.from(document.images).map((img) => img.currentSrc || img.src)).catch(() => []);
  const uniqueSrcs = Array.from(new Set(allSrcs));
  if (uniqueSrcs.length > 0) {
    const fetchResults: { src: string; status: number }[] = await s.page
      .evaluate(async (list: string[]) => {
        const out: { src: string; status: number }[] = [];
        for (const src of list) {
          if (src.startsWith("data:")) {
            out.push({ src, status: 200 });
            continue;
          }
          try {
            const r = await fetch(src);
            out.push({ src, status: r.status });
          } catch {
            out.push({ src, status: -1 });
          }
        }
        return out;
      }, uniqueSrcs)
      .catch(() => []);
    fetchResults.filter((r) => r.status !== 200).forEach((r) => s.failures.push(`broken-image-fetch ${r.status}: ${r.src}`));
  }

  // Every same-origin a[href^="/"] must resolve 200 (dedup across the whole run).
  const hrefs: string[] = await s.page
    .evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => a.getAttribute("href") || "")
        .filter((h) => h.startsWith("/")),
    )
    .catch(() => []);
  for (const href of Array.from(new Set(hrefs))) {
    const abs = `${s.origin}${href}`;
    let status = linkCache.get(abs);
    if (status === undefined) {
      try {
        const r = await s.ctx.request.get(abs);
        status = r.status();
      } catch {
        status = -1;
      }
      linkCache.set(abs, status);
    }
    if (status !== 200) s.failures.push(`broken-link ${status}: ${href}`);
  }
}

async function finishSession(s: Session, opts: { screenshot?: boolean; detailId?: string; cards?: number; columns?: number } = {}): Promise<void> {
  if (opts.cards !== undefined) s.cards = opts.cards;
  if (opts.columns !== undefined) s.columns = opts.columns;
  if (opts.screenshot) {
    const file = screenshotFile(s.site, s.route, s.viewport, opts.detailId);
    const filePath = path.join(outDir, file);
    await s.page.screenshot({ path: filePath, fullPage: true }).catch((e) => s.failures.push(`screenshot-failed: ${String(e)}`));
    s.screenshot = path.relative(process.cwd(), filePath);
  }
  const row: Row = {
    site: s.site,
    route: s.route,
    viewport: s.viewport,
    status: s.status,
    cards: s.cards,
    columns: s.columns,
    failures: s.failures,
    screenshot: s.screenshot,
  };
  rows.push(row);
  logRow(row);
  await s.ctx.close();
}

/** Minimal visit for "just HTTP status of a navigation" cases (expected 404s). */
async function quickStatusCheck(browser: Browser, site: string, origin: string, route: string, expected: number, vpName: ViewportName = "desktop-1440"): Promise<void> {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const resp = await page.goto(`${origin}${route}`, { waitUntil: "load" }).catch(() => undefined);
  const status = resp?.status();
  const failures = status === expected ? [] : [`status: expected ${expected} got ${status}`];
  await ctx.close();
  const row: Row = { site, route, viewport: vpName, status, failures };
  rows.push(row);
  logRow(row);
}

// ------------------------------------------------------------ interactions
async function checkBandOrder(s: Session, vp: ViewportName): Promise<void> {
  const band = await s.page
    .evaluate(() => {
      const h1 = document.querySelector("h1");
      const gallery = document.querySelector("[data-gallery]");
      if (!h1 || !gallery) return null;
      return { h1Top: h1.getBoundingClientRect().top, galleryTop: gallery.getBoundingClientRect().top };
    })
    .catch(() => null);
  if (!band) {
    s.failures.push("band-order: h1 or [data-gallery] not found");
    return;
  }
  const galleryFirst = band.galleryTop < band.h1Top;
  const expectGalleryFirst = VIEWPORTS[vp].width < 1281;
  if (galleryFirst !== expectGalleryFirst) {
    s.failures.push(`band-order: expected ${expectGalleryFirst ? "gallery-first" : "title-first"} got ${galleryFirst ? "gallery-first" : "title-first"}`);
  }
}

/** Room tabs (>=2 groups) + show-more (wide-desktop collapse: >5 items, item index 6 i.e. nth(5)). */
async function runTabsAndShowMore(s: Session): Promise<void> {
  const tabCount = await s.page.locator("[data-gallery-tab]").count();
  if (tabCount < 2) {
    s.failures.push("needs-rich-data: gallery tabs < 2 (no galleryGroups)");
  } else {
    await s.page
      .locator('[data-gallery-tab="1"]')
      .click()
      .catch((e) => s.failures.push(`tab-click-failed: ${String(e)}`));
    const panel1Visible = await s.page
      .waitForSelector('[data-gallery-panel="1"]:not([hidden])', { timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!panel1Visible) s.failures.push("tabs: panel 1 did not become visible after clicking tab 1");
    const panel0Hidden = await s.page.getAttribute('[data-gallery-panel="0"]', "hidden").catch(() => null);
    if (panel0Hidden === null) s.failures.push("tabs: panel 0 not hidden after selecting tab 1");
    await s.page
      .locator('[data-gallery-tab="0"]')
      .click()
      .catch((e) => s.failures.push(`tab-click-failed: ${String(e)}`));
    const panel0VisibleAgain = await s.page
      .waitForSelector('[data-gallery-panel="0"]:not([hidden])', { timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!panel0VisibleAgain) s.failures.push("tabs: panel 0 did not become visible again after clicking back");
  }

  const activePanel = "[data-gallery-panel]:not([hidden])";
  const itemCount = await s.page.locator(`${activePanel} [data-gallery-item]`).count();
  if (itemCount > 5) {
    const item6 = s.page.locator(`${activePanel} [data-gallery-item]`).nth(5);
    const visibleBefore = await item6.isVisible().catch(() => false);
    if (visibleBefore) s.failures.push("show-more: item 6 visible before clicking show-more");
    await s.page
      .locator(`${activePanel} [data-gallery-more]`)
      .click()
      .catch((e) => s.failures.push(`show-more-click-failed: ${String(e)}`));
    const visibleAfter = await item6.isVisible().catch(() => false);
    if (!visibleAfter) s.failures.push("show-more: item 6 not visible after clicking show-more");
  }
}

/** First [data-has-before] item in the active panel: before hidden -> click before -> visible -> click after -> restored. */
async function runBeforeAfterToggle(s: Session): Promise<void> {
  const hasBA = await s.page.getAttribute('[data-section="portfolio.detail"]', "data-before-after").catch(() => null);
  if (hasBA !== "true") {
    s.failures.push("needs-rich-data: no before/after item (data-before-after=false)");
    return;
  }
  const activePanel = "[data-gallery-panel]:not([hidden])";
  const item = s.page.locator(`${activePanel} [data-has-before="true"]`).first();
  const count = await item.count();
  if (count === 0) {
    s.failures.push("needs-rich-data: no [data-has-before] item found in active panel");
    return;
  }
  const beforeImg = item.locator('img[data-view="before"]');
  const afterImg = item.locator('img[data-view="after"]');

  const beforeVisibleInitially = await beforeImg.isVisible().catch(() => true);
  if (beforeVisibleInitially) s.failures.push("before-after: before image visible before toggle");

  await item
    .locator('button[data-ba="before"]')
    .click()
    .catch((e) => s.failures.push(`ba-click-failed: ${String(e)}`));
  const beforeVisibleAfterClick = await beforeImg.isVisible().catch(() => false);
  const afterVisibleAfterClick = await afterImg.isVisible().catch(() => true);
  if (!beforeVisibleAfterClick) s.failures.push("before-after: before image not visible after clicking before");
  if (afterVisibleAfterClick) s.failures.push("before-after: after image still visible after clicking before");

  await item
    .locator('button[data-ba="after"]')
    .click()
    .catch((e) => s.failures.push(`ba-click-failed: ${String(e)}`));
  const beforeVisibleRestored = await beforeImg.isVisible().catch(() => true);
  const afterVisibleRestored = await afterImg.isVisible().catch(() => false);
  if (beforeVisibleRestored) s.failures.push("before-after: before image still visible after restoring");
  if (!afterVisibleRestored) s.failures.push("before-after: after image not visible after restoring");
}

// ----------------------------------------------------------------- visits
// fixture-large ------------------------------------------------------------
async function visit1(browser: Browser, site: string, origin: string): Promise<void> {
  const cols: Record<ViewportName, number> = { "desktop-1440": 3, "tablet-1000": 2, "mobile-390": 1 };
  for (const vp of ["desktop-1440", "tablet-1000", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, "/portfolio", vp);
    await runCommonChecks(s);
    const info = await s.page.evaluate(() => {
      const grid = document.querySelector(".i1-plist__grid");
      const columns = grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0;
      return { cards: document.querySelectorAll("[data-project-card]").length, columns };
    });
    if (info.cards !== 30) s.failures.push(`cards: expected 30 got ${info.cards}`);
    if (info.columns !== cols[vp]) s.failures.push(`columns: expected ${cols[vp]} got ${info.columns}`);
    await finishSession(s, { screenshot: true, cards: info.cards, columns: info.columns });
  }
}

async function visit2(browser: Browser, site: string, origin: string): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio/page/2", "desktop-1440");
  await runCommonChecks(s);
  const info = await s.page.evaluate(() => {
    const cards = document.querySelectorAll("[data-project-card]").length;
    const cur = document.querySelector('nav[data-pager] [aria-current="page"]');
    const sr = cur?.querySelector(".i1-sr");
    const label = sr?.textContent ?? "";
    const full = cur?.textContent ?? "";
    return { cards, found: !!cur, text: full.slice(label.length).trim() };
  });
  if (info.cards !== 30) s.failures.push(`cards: expected 30 got ${info.cards}`);
  if (!info.found) s.failures.push("pager: current-page element not found");
  else if (info.text !== "2") s.failures.push(`pager: current-page text expected "2" got "${info.text}"`);
  await finishSession(s, { screenshot: true, cards: info.cards });
}

async function visit3(browser: Browser, site: string, origin: string): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio/page/6", "desktop-1440");
  await runCommonChecks(s);
  const info = await s.page.evaluate(() => ({
    cards: document.querySelectorAll("[data-project-card]").length,
    hasNext: !!document.querySelector('a[data-page-step="next"]'),
  }));
  if (info.cards !== 23) s.failures.push(`cards: expected 23 got ${info.cards}`);
  if (info.hasNext) s.failures.push('unexpected a[data-page-step="next"] present on last page');
  await finishSession(s, { cards: info.cards });
}

async function visit4(browser: Browser, site: string, origin: string, slugs: Map<string, string>): Promise<void> {
  const id = "hp-0174";
  const slug = slugs.get(id);
  if (!slug) {
    rows.push({ site, route: `/portfolio/<unknown-slug:${id}>`, viewport: "desktop-1440", status: undefined, failures: [`no slug found for ${id} in projects.json`] });
    logRow(rows[rows.length - 1]!);
    return;
  }
  const route = `/portfolio/${slug}`;
  for (const vp of ["desktop-1440", "tablet-1000", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, route, vp);
    await runCommonChecks(s);
    await checkBandOrder(s, vp);
    if (vp === "desktop-1440") {
      await runTabsAndShowMore(s);
      await runBeforeAfterToggle(s);
    } else if (vp === "mobile-390") {
      await runBeforeAfterToggle(s);
    }
    await finishSession(s, { screenshot: true, detailId: id });
  }
}

async function visit5(browser: Browser, site: string, origin: string, slugs: Map<string, string>): Promise<void> {
  const id = "hp-0175";
  const slug = slugs.get(id);
  if (!slug) {
    rows.push({ site, route: `/portfolio/<unknown-slug:${id}>`, viewport: "desktop-1440", status: undefined, failures: [`no slug found for ${id} in projects.json`] });
    logRow(rows[rows.length - 1]!);
    return;
  }
  const route = `/portfolio/${slug}`;
  for (const vp of ["desktop-1440", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, route, vp);
    await runCommonChecks(s);
    const info = await s.page.evaluate(() => ({
      hasToggle: !!document.querySelector("[data-ba-toggle]"),
      hasQuote: !!document.querySelector("[data-quote]"),
    }));
    if (info.hasToggle) s.failures.push("unexpected [data-ba-toggle] present on hp-0175 (no before/after expected)");
    if (info.hasQuote) s.failures.push("unexpected [data-quote] present on hp-0175 (no quote expected)");
    await finishSession(s, { screenshot: true, detailId: id });
  }
}

async function visit6(browser: Browser, site: string, origin: string, slugs: Map<string, string>): Promise<void> {
  const id = "hp-0173";
  const slug = slugs.get(id);
  if (!slug) {
    rows.push({ site, route: `/portfolio/<unknown-slug:${id}>`, viewport: "desktop-1440", status: undefined, failures: [`no slug found for ${id} in projects.json`] });
    logRow(rows[rows.length - 1]!);
    return;
  }
  const route = `/portfolio/${slug}`;
  for (const vp of ["desktop-1440", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, route, vp);
    await runCommonChecks(s); // includes the horizontal-overflow check
    await finishSession(s);
  }
}

async function visit7(browser: Browser, site: string, origin: string, slugs: Map<string, string>): Promise<void> {
  const s = await beginSession(browser, site, origin, "/", "desktop-1440");
  await runCommonChecks(s);
  const info = await s.page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-project-card]")).map((li) => ({
      id: li.getAttribute("data-project-card") || "",
      href: li.querySelector("a.i1-card__link")?.getAttribute("href") || "",
    }));
    const more = document.querySelector("a[data-more-link]");
    return { cards, moreHref: more?.getAttribute("href") ?? null };
  });
  for (const c of info.cards) {
    const expectedSlug = slugs.get(c.id);
    if (!expectedSlug) {
      s.failures.push(`home-card: no slug found for id ${c.id}`);
      continue;
    }
    const expectedHref = `/portfolio/${expectedSlug}`;
    if (c.href !== expectedHref) s.failures.push(`home-card href mismatch for ${c.id}: expected ${expectedHref} got ${c.href}`);
  }
  if (info.moreHref !== "/portfolio") s.failures.push(`a[data-more-link] href: expected /portfolio got ${info.moreHref}`);

  if (info.cards.length > 0) {
    const first = info.cards[0]!;
    await s.page
      .locator("[data-project-card]")
      .first()
      .locator("a.i1-card__link")
      .click()
      .catch((e) => s.failures.push(`home-card-click-failed: ${String(e)}`));
    const navigated = await s.page
      .waitForURL((u) => u.pathname === first.href, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!navigated) s.failures.push(`home-card-click: did not navigate to ${first.href}`);
    else {
      const projectId = await s.page.getAttribute('[data-section="portfolio.detail"]', "data-project").catch(() => null);
      if (projectId !== first.id) s.failures.push(`home-card-click: landed with data-project=${projectId} expected ${first.id}`);
    }
  } else {
    s.failures.push("home: no project cards found to click");
  }
  await finishSession(s, { cards: info.cards.length });
}

async function visit8(browser: Browser, site: string, origin: string): Promise<void> {
  const s = await beginSession(browser, site, origin, "/portfolio", "desktop-1440");
  await runCommonChecks(s);
  const firstIdPage1 = await s.page.locator("[data-project-card]").first().getAttribute("data-project-card").catch(() => null);
  await s.page
    .locator('a[data-page="2"]')
    .click()
    .catch((e) => s.failures.push(`page2-click-failed: ${String(e)}`));
  const onPage2 = await s.page
    .waitForURL((u) => u.pathname === "/portfolio/page/2", { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!onPage2) s.failures.push("pagination: did not navigate to /portfolio/page/2 after clicking page 2");
  else {
    const firstIdPage2 = await s.page.locator("[data-project-card]").first().getAttribute("data-project-card").catch(() => null);
    if (firstIdPage2 === firstIdPage1) s.failures.push(`pagination: first card id unchanged (${firstIdPage1}) after navigating to page 2`);
    await s.page
      .locator('a[data-page-step="prev"]')
      .click()
      .catch((e) => s.failures.push(`prev-click-failed: ${String(e)}`));
    const backToRoot = await s.page
      .waitForURL((u) => u.pathname === "/portfolio", { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!backToRoot) s.failures.push("pagination: prev did not navigate back to /portfolio");
  }
  await finishSession(s);
}

async function visit9(browser: Browser, site: string, origin: string): Promise<void> {
  for (const route of ["/portfolio/page/1", "/portfolio/page/7", "/portfolio/page/0", "/portfolio/no-such-project"]) {
    await quickStatusCheck(browser, site, origin, route, 404);
  }
}

// fixture-small --------------------------------------------------------------
async function visit10(browser: Browser, site: string, origin: string): Promise<void> {
  for (const vp of ["desktop-1440", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, "/portfolio", vp);
    await runCommonChecks(s);
    const info = await s.page.evaluate(() => ({
      cards: document.querySelectorAll("[data-project-card]").length,
      hasPager: !!document.querySelector("nav[data-pager]"),
    }));
    if (info.cards !== 12) s.failures.push(`cards: expected 12 got ${info.cards}`);
    if (info.hasPager) s.failures.push("unexpected nav[data-pager] present (single page should not paginate)");
    await finishSession(s, { screenshot: true, cards: info.cards });
  }
}

async function visit11(browser: Browser, site: string, origin: string, slugs: Map<string, string>): Promise<void> {
  const id = "maru-012";
  const slug = slugs.get(id);
  if (!slug) {
    rows.push({ site, route: `/portfolio/<unknown-slug:${id}>`, viewport: "desktop-1440", status: undefined, failures: [`no slug found for ${id} in projects.json`] });
    logRow(rows[rows.length - 1]!);
    return;
  }
  const route = `/portfolio/${slug}`;
  for (const vp of ["desktop-1440", "mobile-390"] as ViewportName[]) {
    const s = await beginSession(browser, site, origin, route, vp);
    await runCommonChecks(s);
    const ba = await s.page.getAttribute('[data-section="portfolio.detail"]', "data-before-after").catch(() => null);
    if (ba !== "true") s.failures.push(`expected data-before-after="true" got "${ba}"`);
    await finishSession(s, { screenshot: true, detailId: id });
  }
}

// fixture-empty ----------------------------------------------------------------
async function visit12(browser: Browser, site: string, origin: string): Promise<void> {
  const s = await beginSession(browser, site, origin, "/", "desktop-1440");
  await runCommonChecks(s);
  const info = await s.page.evaluate(() => {
    const navLink = !!document.querySelector('a[data-nav="portfolio"]');
    const anyPortfolioLink = Array.from(document.querySelectorAll("a[href]")).some((a) => {
      const href = a.getAttribute("href") || "";
      return href === "/portfolio" || href.startsWith("/portfolio/");
    });
    return { navLink, anyPortfolioLink };
  });
  if (info.navLink) s.failures.push('unexpected a[data-nav="portfolio"] present on a portfolio-less site');
  if (info.anyPortfolioLink) s.failures.push("unexpected link to /portfolio found on a portfolio-less site");
  await finishSession(s, { screenshot: true });

  await quickStatusCheck(browser, site, origin, "/portfolio", 404);
}

// ------------------------------------------------------------------- main
async function runSite(browser: Browser, site: string, run: (origin: string, slugs: Map<string, string>) => Promise<void>): Promise<void> {
  const pkgRoot = await loadPackageRoot(root, site);
  const server = await serveStatic(pkgRoot);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const slugs = await loadProjectSlugs(root, site);
  try {
    await run(origin, slugs);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    await runSite(browser, "fixture-large", async (origin, slugs) => {
      await visit1(browser, "fixture-large", origin);
      await visit2(browser, "fixture-large", origin);
      await visit3(browser, "fixture-large", origin);
      await visit4(browser, "fixture-large", origin, slugs);
      await visit5(browser, "fixture-large", origin, slugs);
      await visit6(browser, "fixture-large", origin, slugs);
      await visit7(browser, "fixture-large", origin, slugs);
      await visit8(browser, "fixture-large", origin);
      await visit9(browser, "fixture-large", origin);
    });
    await runSite(browser, "fixture-small", async (origin, slugs) => {
      await visit10(browser, "fixture-small", origin);
      await visit11(browser, "fixture-small", origin, slugs);
    });
    await runSite(browser, "fixture-empty", async (origin) => {
      await visit12(browser, "fixture-empty", origin);
    });
  } finally {
    await browser.close();
  }

  const failedRows = rows.filter((r) => r.failures.length > 0);
  const totals = { visits: rows.length, passed: rows.length - failedRows.length, failed: failedRows.length };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({ rows, totals }, null, 2)}\n`);
  console.log(`visual smoke: ${totals.passed}/${totals.visits} visits pass`);
  if (failedRows.length > 0) process.exit(1);
}

await main();
