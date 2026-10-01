/**
 * Pre-Demo tiny polish 2 smoke (interior-01 1.4.2 candidate) — drives the BUILT package of a
 * site in a real browser. Builds nothing.
 *
 *   A. home hero carousel: arrows visible + hit-testable + unobstructed at every width from
 *      320 to 1920 (36×36 in the pager row below 900px, 44×44 mid-height at ≥900px), never
 *      overlapping the pager or the active slide's copy content, next/prev navigate correctly;
 *      negative control on a one-slide hero (no arrows at all);
 *   B. detail gallery "전체" (all) tab: first tab, selected by default, count = sum of rooms,
 *      room tab order unchanged, all-panel item order = room-by-room concatenation, collapse to
 *      5 tiles + "show more" at ≥1281, swipe-strip counter at <1281, roving-tabindex keyboard nav;
 *   C. photo viewer (native <dialog>): absent until opened (incl. from the raw server HTML),
 *      correct counter/room badge tracking through a full lap incl. wrap, image contained +
 *      uncropped, background scroll locked, Escape / close-button / backdrop-click close it (a
 *      click on the image itself does not), focus returns to the pressed zoom button, room-tab
 *      viewers use that room's own count, mobile touch swipe steps a photo, and a before/after
 *      seat's chosen side is what the viewer opens;
 *   D. footer notice: present on every page, after the facts list in DOM order, small and
 *      low-emphasis, never covered by the floating CTA at the bottom of the page;
 *   E. /, /portfolio and the detail at 1440 + 390: HTTP 200, no console / page error, no
 *      non-local request, no broken image, no horizontal overflow.
 *
 * Usage: tsx scripts/template-platform-predemo2-smoke.ts [outDir] [--site <siteId>] [--slug <slug>]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const argv = process.argv.slice(2);
let outDirArg: string | undefined;
let SITE = "boost-interior-demo";
let SLUG = "suseong-white-34py-apartment-remodeling";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--site") SITE = argv[++i] ?? SITE;
  else if (argv[i] === "--slug") SLUG = argv[++i] ?? SLUG;
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = process.cwd();
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-predemo-polish-2/screens");

// this project's own detail gallery has no before/after photos at all — used only by the
// before/after sub-check in section C, which needs a project that actually has one
const BEFORE_SLUG = "buk-32py-kitchen-bathroom-renewal";
// a one-slide hero for the section-A negative control (renders no arrows / no pager at all);
// already built in this environment's fixture set, so no extra build is needed for it
const NEG_SITE = "fixture-empty";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};
const isFile = async (p: string) => !!(await stat(p).catch(() => undefined))?.isFile();
async function resolveStaticFile(rootDir: string, rawPathname: string): Promise<string | undefined> {
  const decoded = decodeURIComponent(rawPathname);
  const candidates = [decoded];
  if (!decoded.endsWith("/")) candidates.push(`${decoded}.html`);
  candidates.push(decoded.endsWith("/") ? `${decoded}index.html` : `${decoded}/index.html`);
  for (const c of candidates) {
    const file = path.join(rootDir, c);
    const rel = path.relative(rootDir, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
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
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end("Not Found");
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
async function resolveSiteRoot(siteId: string): Promise<{ siteRoot: string; releaseId: string } | undefined> {
  const ptrPath = path.join(root, "data/site-builds", siteId, "current.json");
  const ptr = JSON.parse(await readFile(ptrPath, "utf8").catch(() => "null")) as { packageDir: string } | null;
  if (!ptr) return undefined;
  const record = JSON.parse(await readFile(path.join(root, ptr.packageDir, "build-record.json"), "utf8")) as { template: { releaseId: string } };
  return { siteRoot: path.join(root, ptr.packageDir, "site"), releaseId: record.template.releaseId };
}

let passed = 0;
const failed: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? "" : `\n       ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  }
}
function note(msg: string) {
  console.log(`  note ${msg}`);
}

const main = resolveSiteRoot(SITE);
const mainResolved = await main;
if (!mainResolved) throw new Error(`no build found for site ${SITE}`);
const { siteRoot, releaseId } = mainResolved;
await mkdir(outDir, { recursive: true });
const server = await serveStatic(siteRoot);
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
console.log(`site ${SITE} · release ${releaseId}`);

const browser = await chromium.launch();
const DETAIL = `/portfolio/${SLUG}`;
const DETAIL_BEFORE = `/portfolio/${BEFORE_SLUG}`;

interface PageProblems { console: string[]; nonLocal: string[]; status: number }
async function open(page: Page, url: string): Promise<PageProblems> {
  const problems: PageProblems = { console: [], nonLocal: [], status: 0 };
  // tsx/esbuild wraps named inner functions with __name(); give evaluated code a no-op shim.
  await page.addInitScript("window.__name = (f) => f;");
  page.on("console", (m) => { if (m.type() === "error") problems.console.push(m.text()); });
  page.on("pageerror", (e) => problems.console.push(String(e)));
  page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) problems.nonLocal.push(r.url()); });
  const res = await page.goto(origin + url, { waitUntil: "networkidle" });
  problems.status = res?.status() ?? 0;
  return problems;
}
/** Broken = finished loading with no pixels; lazy images that never started are fetched instead. */
async function mediaProblems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const bad: string[] = [];
    for (const img of Array.from(document.images)) {
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) bad.push(img.currentSrc);
      else if (!img.complete || img.naturalWidth === 0) {
        const src = img.currentSrc || img.src;
        const ok = src ? await fetch(src).then((r) => r.ok).catch(() => false) : false;
        if (!ok) bad.push(src || "(no src)");
      }
    }
    return bad;
  });
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** networkidle already fired by `open()`; this is a fixed buffer for React hydration + chunk exec
 * on top of it — the server HTML and hydrated HTML are deliberately identical, so there is no
 * structural signal to wait on instead. */
const settleHydration = (page: Page) => page.waitForTimeout(450);

interface Rect { x: number; y: number; w: number; h: number }
const intersects = (a: Rect, b: Rect) => !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
const within = (inner: Rect, outer: Rect, tol = 0.5) =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

// =====================================================================================
// A. home hero carousel arrows
// =====================================================================================
console.log("\n[A] home hero carousel arrows");

interface ArrowInfo { display: string; visibility: string; opacity: number; x: number; y: number; w: number; h: number; isArrow: boolean }
interface HeroState { slideId: string | undefined; heroRect: Rect; pagerRect: Rect | null; contentRects: Rect[]; prev: ArrowInfo | null; next: ArrowInfo | null }
async function heroState(page: Page): Promise<HeroState> {
  return page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('section.i1-hero[data-section="home.hero"]');
    if (!hero) return { slideId: undefined, heroRect: { x: 0, y: 0, w: 0, h: 0 }, pagerRect: null, contentRects: [], prev: null, next: null };
    const hr = hero.getBoundingClientRect();
    const pager = hero.querySelector<HTMLElement>(".i1-hero__pager");
    const pr = pager?.getBoundingClientRect();
    const activeSlide = hero.querySelector<HTMLElement>('.i1-hero__slide[data-active="true"]');
    const copy = activeSlide?.querySelector<HTMLElement>(".i1-hero__copy");
    const contentRects = copy
      ? Array.from(copy.children).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })
      : [];
    const arrow = (cls: string) => {
      const b = hero.querySelector<HTMLElement>(`.i1-hero__arrow--${cls}`);
      if (!b) return null;
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const isArrow = !!hit && (hit === b || b.contains(hit));
      return { display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity), x: r.x, y: r.y, w: r.width, h: r.height, isArrow };
    };
    return {
      slideId: activeSlide?.getAttribute("data-hero-slide") ?? undefined,
      heroRect: { x: hr.x, y: hr.y, w: hr.width, h: hr.height },
      pagerRect: pr ? { x: pr.x, y: pr.y, w: pr.width, h: pr.height } : null,
      contentRects,
      prev: arrow("prev"),
      next: arrow("next"),
    };
  });
}

const HERO_WIDTHS = [320, 360, 390, 430, 600, 768, 820, 899, 900, 1024, 1280, 1440, 1920];
const HERO_SHOTS = new Set([390, 768, 1440]);
for (const width of HERO_WIDTHS) {
  const mobile = width <= 430;
  const ctx = await browser.newContext(
    mobile ? { viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width, height: 800 } },
  );
  const page = await ctx.newPage();
  const problems = await open(page, "/");
  await settleHydration(page);
  const s = await heroState(page);
  const minHit = width < 900 ? 36 : 44;

  const arrowVisibleOk = (a: ArrowInfo | null) =>
    !!a &&
    a.display !== "none" &&
    a.visibility === "visible" &&
    a.opacity > 0 &&
    a.w > 0 &&
    a.h > 0 &&
    within({ x: a.x, y: a.y, w: a.w, h: a.h }, s.heroRect) &&
    a.x >= -0.5 &&
    a.x + a.w <= width + 0.5;
  check(`${width}px: both arrows visible, non-empty, inside the hero box and inside the viewport`, arrowVisibleOk(s.prev) && arrowVisibleOk(s.next), s);
  check(`${width}px: nothing covers the arrows (elementFromPoint hits the arrow)`, !!s.prev?.isArrow && !!s.next?.isArrow, { prev: s.prev, next: s.next });

  const clearOfPager = (a: ArrowInfo | null) => !a || !s.pagerRect || !intersects({ x: a.x, y: a.y, w: a.w, h: a.h }, s.pagerRect);
  const clearOfCopy = (a: ArrowInfo | null) => !a || s.contentRects.every((r) => !intersects({ x: a.x, y: a.y, w: a.w, h: a.h }, r));
  check(
    `${width}px: arrows do not overlap the pager pill or the active slide's copy content`,
    clearOfPager(s.prev) && clearOfPager(s.next) && clearOfCopy(s.prev) && clearOfCopy(s.next),
    { pagerRect: s.pagerRect, contentRects: s.contentRects, prev: s.prev, next: s.next },
  );
  check(
    `${width}px: hit target ≥ ${minHit}×${minHit}`,
    !!s.prev && !!s.next && s.prev.w >= minHit - 0.5 && s.prev.h >= minHit - 0.5 && s.next.w >= minHit - 0.5 && s.next.h >= minHit - 0.5,
    { prev: s.prev, next: s.next },
  );

  if (HERO_SHOTS.has(width)) {
    await page.screenshot({ path: path.join(outDir, `hero-${width}.png`), clip: { x: s.heroRect.x, y: s.heroRect.y, width: s.heroRect.w, height: s.heroRect.h } });
  }

  const id0 = s.slideId;
  await page.click(".i1-hero__arrow--next");
  await page.waitForTimeout(200);
  const id1 = (await heroState(page)).slideId;
  await page.click(".i1-hero__arrow--prev");
  await page.waitForTimeout(200);
  const id2 = (await heroState(page)).slideId;
  check(`${width}px: next changes the active slide, prev returns to the first one`, id1 !== id0 && id2 === id0, { id0, id1, id2 });

  check(`${width}px: no horizontal page overflow`, (await overflowOf(page)) <= 0, await overflowOf(page));
  check(`${width}px: no console / page error, no non-local request`, problems.console.length === 0 && problems.nonLocal.length === 0, problems);
  await ctx.close();
}

// negative control: a one-slide hero renders no arrows and no pager at all — already built,
// no extra build needed
{
  const neg = await resolveSiteRoot(NEG_SITE).catch(() => undefined);
  if (!neg) {
    note(`negative control skipped: no build found for ${NEG_SITE}`);
  } else {
    const negServer = await serveStatic(neg.siteRoot);
    const negOrigin = `http://127.0.0.1:${(negServer.address() as AddressInfo).port}`;
    const ctx = await browser.newContext({ viewport: { width: 768, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript("window.__name = (f) => f;");
    await page.goto(negOrigin + "/", { waitUntil: "networkidle" });
    await settleHydration(page);
    const slides = await page.evaluate(() => document.querySelector(".i1-hero")?.getAttribute("data-slides"));
    const counts = await page.evaluate(() => ({ arrows: document.querySelectorAll(".i1-hero__arrow").length, pager: document.querySelectorAll(".i1-hero__pager").length }));
    check(`negative control (${NEG_SITE}, data-slides=${slides}): one-slide hero renders no arrows and no pager`, slides === "1" && counts.arrows === 0 && counts.pager === 0, counts);
    await ctx.close();
    negServer.close();
  }
}

// =====================================================================================
// B + C shared: gallery model reader
// =====================================================================================
interface TabInfo { id: string; text: string; selected: boolean }
interface PanelInfo { id: string; hidden: boolean; srcs: (string | null)[]; itemCount: number }
interface GalleryModel { tabs: TabInfo[]; panels: PanelInfo[] }
async function galleryModel(page: Page): Promise<GalleryModel> {
  return page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>("[data-gallery-tab]")).map((t) => ({
      id: t.dataset.galleryTab ?? "",
      text: t.textContent?.replace(/\s+/g, " ").trim() ?? "",
      selected: t.getAttribute("aria-selected") === "true",
    }));
    const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-gallery-panel]")).map((p) => {
      const items = Array.from(p.querySelectorAll<HTMLElement>("[data-gallery-item]"));
      return {
        id: p.dataset.galleryPanel ?? "",
        hidden: p.hasAttribute("hidden"),
        srcs: items.map((it) => it.querySelector('img[data-view="after"]')?.getAttribute("src") ?? null),
        itemCount: items.length,
      };
    });
    return { tabs, panels };
  });
}
interface Room { id: string; name: string; count: number }
function roomsFromTabs(tabs: TabInfo[]): Room[] {
  return tabs
    .filter((t) => t.id !== "all")
    .map((t) => {
      const m = t.text.match(/^(.*?)\s*\((\d+)\)$/);
      return { id: t.id, name: (m?.[1] ?? t.text).trim(), count: Number(m?.[2] ?? 0) };
    });
}
function roomForIndex(rooms: Room[], index: number): string | undefined {
  let acc = 0;
  for (const r of rooms) {
    if (index < acc + r.count) return r.name;
    acc += r.count;
  }
  return undefined;
}
const zoomSel = (index: number) => `[data-gallery-panel="all"] [data-gallery-item]:nth-child(${index + 1}) [data-gallery-zoom]`;

// =====================================================================================
// B. "전체" (all) tab
// =====================================================================================
console.log('\n[B] detail gallery "전체" (all) tab');

async function runAllTabSuite(vp: { width: number; height: number; mobile: boolean; name: string }) {
  const ctx = await browser.newContext(
    vp.mobile ? { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: vp.width, height: vp.height } },
  );
  const page = await ctx.newPage();
  const problems = await open(page, DETAIL);
  check(`[${vp.name}] detail 200`, problems.status === 200, problems.status);
  await settleHydration(page);

  const model = await galleryModel(page);
  const rooms = roomsFromTabs(model.tabs);
  const sum = rooms.reduce((a, r) => a + r.count, 0);
  const allTab = model.tabs[0];
  const allPanel = model.panels.find((p) => p.id === "all");
  const allCountMatch = allTab?.text.match(/\((\d+)\)/);

  check(`[${vp.name}] first tab is "all", selected, text starts with 전체, count = sum of rooms (${sum})`, allTab?.id === "all" && allTab.selected && allTab.text.startsWith("전체") && Number(allCountMatch?.[1]) === sum, allTab);
  check(
    `[${vp.name}] room tab order unchanged (0..${rooms.length - 1})`,
    model.tabs.slice(1).every((t, i) => t.id === String(i)),
    model.tabs.map((t) => t.id),
  );
  check(`[${vp.name}] "all" panel visible, all room panels hidden`, allPanel?.hidden === false && model.panels.slice(1).every((p) => p.hidden), model.panels.map((p) => ({ id: p.id, hidden: p.hidden })));
  check(`[${vp.name}] "all" panel item count = sum (${sum})`, allPanel?.itemCount === sum, allPanel?.itemCount);

  const concatSrcs = model.panels.slice(1).flatMap((p) => p.srcs);
  check(`[${vp.name}] "all" panel image order = room-by-room concatenation`, JSON.stringify(allPanel?.srcs) === JSON.stringify(concatSrcs), { all: allPanel?.srcs, concat: concatSrcs });

  if (vp.name === "1440" && allPanel) {
    const collapse = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-gallery-panel="all"]');
      const items = Array.from(panel?.querySelectorAll<HTMLElement>("[data-gallery-item]") ?? []);
      return { collapsed: panel?.classList.contains("is-collapsed"), visible: items.filter((it) => getComputedStyle(it).display !== "none").length, hasMore: !!panel?.querySelector("[data-gallery-more]") };
    });
    check(`[${vp.name}] "all" panel collapsed to 5 tiles with a "show more" button`, collapse.collapsed === true && collapse.visible === 5 && collapse.hasMore, collapse);
    await page.click('[data-gallery-panel="all"] [data-gallery-more]');
    await page.waitForTimeout(250);
    const expanded = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-gallery-panel="all"]');
      const items = Array.from(panel?.querySelectorAll<HTMLElement>("[data-gallery-item]") ?? []);
      return { collapsed: panel?.classList.contains("is-collapsed"), visible: items.filter((it) => getComputedStyle(it).display !== "none").length };
    });
    check(`[${vp.name}] "show more" expands "all" panel to all ${sum} tiles`, expanded.collapsed === false && expanded.visible === sum, expanded);
  }

  await page.screenshot({ path: path.join(outDir, `detail-all-${vp.name}.png`) });

  if (vp.name === "390") {
    const counter1 = await page.evaluate(() => document.querySelector('[data-gallery-panel="all"] .i1-gallery__counter')?.textContent?.replace(/\s+/g, " ").trim());
    await page.click('[data-gallery-panel="all"] [data-gallery-arrow="next"]');
    await page.waitForTimeout(400);
    const counter2 = await page.evaluate(() => document.querySelector('[data-gallery-panel="all"] .i1-gallery__counter')?.textContent?.replace(/\s+/g, " ").trim());
    check(`[${vp.name}] "all" panel counter starts 1 / ${sum} and steps to 2 / ${sum}`, counter1 === `1 / ${sum}` && counter2 === `2 / ${sum}`, { counter1, counter2 });
  }

  // room tab -> only that panel shows; back to "all"
  await page.click('[data-gallery-tab="1"]');
  await page.waitForTimeout(250);
  const onRoom = await galleryModel(page);
  const room1Panel = onRoom.panels.find((p) => p.id === "1");
  check(`[${vp.name}] clicking room tab 1 shows only panel 1`, room1Panel?.hidden === false && onRoom.panels.filter((p) => p.id !== "1").every((p) => p.hidden), onRoom.panels.map((p) => ({ id: p.id, hidden: p.hidden })));
  await page.click('[data-gallery-tab="all"]');
  await page.waitForTimeout(250);
  const backOnAll = await galleryModel(page);
  check(`[${vp.name}] clicking "all" returns to the all panel`, backOnAll.panels.find((p) => p.id === "all")?.hidden === false, backOnAll.panels.map((p) => ({ id: p.id, hidden: p.hidden })));

  // keyboard: roving tabindex
  await page.focus('[data-gallery-tab="all"]');
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const afterRight = await galleryModel(page);
  check(`[${vp.name}] keyboard ArrowRight from "all" selects tab 0`, afterRight.tabs.find((t) => t.id === "0")?.selected === true, afterRight.tabs.map((t) => ({ id: t.id, selected: t.selected })));
  await page.keyboard.press("Home");
  await page.waitForTimeout(150);
  const afterHome = await galleryModel(page);
  check(`[${vp.name}] keyboard Home selects "all"`, afterHome.tabs.find((t) => t.id === "all")?.selected === true, afterHome.tabs.map((t) => ({ id: t.id, selected: t.selected })));

  await ctx.close();
}
await runAllTabSuite({ width: 1440, height: 900, mobile: false, name: "1440" });
await runAllTabSuite({ width: 390, height: 844, mobile: true, name: "390" });

// =====================================================================================
// C. photo viewer
// =====================================================================================
console.log("\n[C] photo viewer");

interface ViewerState {
  open: boolean;
  room: string | null;
  counter: string | null;
  imgSrc: string | null;
  naturalWidth: number;
  naturalHeight: number;
  rect: Rect | null;
}
async function viewerState(page: Page): Promise<ViewerState | null> {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[data-gallery-viewer]");
    if (!dialog) return null;
    const room = dialog.querySelector("[data-viewer-room]")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const counter = dialog.querySelector("[data-viewer-counter]")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const img = dialog.querySelector<HTMLImageElement>("[data-viewer-img]");
    const r = img?.getBoundingClientRect();
    return {
      open: dialog.hasAttribute("open"),
      room,
      counter,
      imgSrc: img?.getAttribute("src") ?? null,
      naturalWidth: img?.naturalWidth ?? 0,
      naturalHeight: img?.naturalHeight ?? 0,
      rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    };
  });
}
async function waitViewerOpen(page: Page) {
  await page.waitForSelector("dialog[data-gallery-viewer][open]", { timeout: 4000 });
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>("[data-viewer-img]");
    return !!img && img.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 4000 });
}
const dialogPresent = (page: Page) => page.evaluate(() => !!document.querySelector("dialog[data-gallery-viewer]"));

async function runViewerSuite(vp: { width: number; height: number; mobile: boolean; name: string }) {
  const html = await fetch(origin + DETAIL).then((r) => r.text());
  check(`[${vp.name}] server HTML has no viewer dialog markup`, !html.includes("data-gallery-viewer"), html.includes("data-gallery-viewer"));

  const ctx = await browser.newContext(
    vp.mobile ? { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: vp.width, height: vp.height } },
  );
  const page = await ctx.newPage();
  const problems = await open(page, DETAIL);
  check(`[${vp.name}] detail 200`, problems.status === 200, problems.status);
  await settleHydration(page);
  check(`[${vp.name}] no dialog before any click`, !(await dialogPresent(page)));

  const model = await galleryModel(page);
  const rooms = roomsFromTabs(model.tabs);
  const sum = rooms.reduce((a, r) => a + r.count, 0);
  const allPanel = model.panels.find((p) => p.id === "all");

  // ---- open on the 3rd photo of the "all" panel ----
  await page.click(zoomSel(2));
  await waitViewerOpen(page);
  let v = await viewerState(page);
  check(`[${vp.name}] open on 3rd photo: counter 3 / ${sum}, badge ${roomForIndex(rooms, 2)}`, v?.counter === `3 / ${sum}` && v.room === roomForIndex(rooms, 2), v);
  check(`[${vp.name}] viewer image src matches the tile, is loaded`, v?.imgSrc === allPanel?.srcs[2] && (v?.naturalWidth ?? 0) > 0, { imgSrc: v?.imgSrc, tileSrc: allPanel?.srcs[2], naturalWidth: v?.naturalWidth });
  if (v?.rect) {
    const contained = within(v.rect, { x: 0, y: 0, w: vp.width, h: vp.height });
    const naturalRatio = v.naturalWidth / v.naturalHeight;
    const renderedRatio = v.rect.w / v.rect.h;
    const aspectOk = Math.abs(naturalRatio - renderedRatio) / naturalRatio <= 0.01;
    check(`[${vp.name}] viewer image fully inside the viewport and not cropped (aspect ratio within 1%)`, contained && aspectOk, { rect: v.rect, naturalRatio, renderedRatio, viewport: { w: vp.width, h: vp.height } });
  } else {
    check(`[${vp.name}] viewer image fully inside the viewport and not cropped`, false, "no rect");
  }

  const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  check(`[${vp.name}] html overflow hidden while the viewer is open`, htmlOverflow === "hidden", htmlOverflow);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  check(`[${vp.name}] page scroll position unchanged after a scroll attempt while the viewer is open`, scrollAfter === scrollBefore, { scrollBefore, scrollAfter });

  // ---- next -> 4th photo ----
  await page.click('[data-viewer-arrow="next"]');
  await page.waitForTimeout(150);
  v = await viewerState(page);
  check(`[${vp.name}] next arrow: 4 / ${sum}, badge ${roomForIndex(rooms, 3)}`, v?.counter === `4 / ${sum}` && v.room === roomForIndex(rooms, 3), v);

  // ---- advance (wrapping) until back at photo 1 ----
  let guard = 0;
  while (v?.counter !== `1 / ${sum}` && guard < sum + 2) {
    await page.click('[data-viewer-arrow="next"]');
    await page.waitForTimeout(120);
    v = await viewerState(page);
    guard++;
  }
  check(`[${vp.name}] stepping forward wraps around to 1 / ${sum}`, v?.counter === `1 / ${sum}` && v.room === roomForIndex(rooms, 0), v);

  // ---- full lap of `sum` clicks tracks every room boundary and wraps back to 1 / sum ----
  let lapOk = true;
  const lapDetail: unknown[] = [];
  for (let k = 1; k <= sum; k++) {
    await page.click('[data-viewer-arrow="next"]');
    await page.waitForTimeout(100);
    v = await viewerState(page);
    const expectedIndex = k % sum;
    const expectedCounter = `${expectedIndex + 1} / ${sum}`;
    const expectedRoom = roomForIndex(rooms, expectedIndex);
    const ok = v?.counter === expectedCounter && v.room === expectedRoom;
    if (!ok) { lapOk = false; lapDetail.push({ k, got: v, expectedCounter, expectedRoom }); }
  }
  check(`[${vp.name}] full lap of ${sum} "next" clicks tracks room boundaries and wraps back to 1 / ${sum}`, lapOk, lapOk ? undefined : lapDetail);

  // ---- ArrowLeft from 1 / sum wraps to sum / sum ----
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  v = await viewerState(page);
  check(`[${vp.name}] ArrowLeft from 1 / ${sum} wraps to ${sum} / ${sum}`, v?.counter === `${sum} / ${sum}` && v.room === roomForIndex(rooms, sum - 1), v);

  // ---- Escape closes, restores scroll, returns focus to the pressed zoom button ----
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const afterEscape = {
    dialogGone: !(await dialogPresent(page)),
    overflowRestored: (await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== "hidden",
    focusReturned: await page.evaluate((sel) => document.activeElement === document.querySelector(sel), zoomSel(2)),
  };
  check(`[${vp.name}] Escape closes the viewer, restores scroll, returns focus to the pressed zoom button`, afterEscape.dialogGone && afterEscape.overflowRestored && afterEscape.focusReturned, afterEscape);

  // ---- reopen, close via close button ----
  await page.click(zoomSel(2));
  await waitViewerOpen(page);
  await page.click("[data-viewer-close]");
  await page.waitForTimeout(200);
  check(`[${vp.name}] [data-viewer-close] closes the viewer`, !(await dialogPresent(page)));

  // ---- reopen, click on the image itself does NOT close it ----
  await page.click(zoomSel(2));
  await waitViewerOpen(page);
  const imgBox = await page.locator("[data-viewer-img]").boundingBox();
  if (imgBox) await page.mouse.click(imgBox.x + imgBox.width / 2, imgBox.y + imgBox.height / 2);
  await page.waitForTimeout(200);
  check(`[${vp.name}] clicking the image itself does not close the viewer`, await dialogPresent(page));

  // ---- close by clicking the backdrop below the stage ----
  await page.mouse.click(Math.round(vp.width / 2), vp.height - 6);
  await page.waitForTimeout(200);
  check(`[${vp.name}] clicking the backdrop below the stage closes the viewer`, !(await dialogPresent(page)));

  // ---- room-tab viewer uses that room's own count ----
  await page.click('[data-gallery-tab="1"]');
  await page.waitForTimeout(250);
  await page.click('[data-gallery-panel="1"] [data-gallery-item]:nth-child(1) [data-gallery-zoom]');
  await waitViewerOpen(page);
  v = await viewerState(page);
  const room1 = rooms.find((r) => r.id === "1");
  check(`[${vp.name}] room-tab viewer: 1 / ${room1?.count}, badge ${room1?.name}`, v?.counter === `1 / ${room1?.count}` && v.room === room1?.name, v);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.click('[data-gallery-tab="all"]');
  await page.waitForTimeout(250);

  // ---- mobile: touch swipe on the stage moves to the next photo ----
  if (vp.mobile) {
    await page.click(zoomSel(0));
    await waitViewerOpen(page);
    const before = await viewerState(page);
    const stageBox = await page.locator(".i1-viewer__stage").boundingBox();
    if (stageBox) {
      const cdp = await ctx.newCDPSession(page);
      const startX = stageBox.x + stageBox.width * 0.8;
      const y = stageBox.y + stageBox.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - 120, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - 260, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(250);
      const after = await viewerState(page);
      check(`[${vp.name}] touch swipe on the stage moves to the next photo`, after?.counter === "2 / " + sum && before?.counter === "1 / " + sum, { before, after });
    } else {
      note(`[${vp.name}] touch swipe check skipped: could not measure the stage`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // ---- screenshot ----
  await page.click(zoomSel(0));
  await waitViewerOpen(page);
  await page.screenshot({ path: path.join(outDir, `viewer-${vp.name}.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  await ctx.close();
}
await runViewerSuite({ width: 1440, height: 900, mobile: false, name: "1440" });
await runViewerSuite({ width: 390, height: 844, mobile: true, name: "390" });

// ---- before/after: the viewer opens on the side the seat is showing ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = await open(page, DETAIL_BEFORE);
  if (problems.status !== 200) {
    note(`before/after check skipped: ${DETAIL_BEFORE} returned ${problems.status}`);
  } else {
    await settleHydration(page);
    const beforeItem = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('[data-gallery-panel="all"] [data-gallery-item]'));
      const idx = items.findIndex((it) => it.dataset.hasBefore === "true");
      return idx;
    });
    if (beforeItem < 0) {
      note(`before/after check skipped: no data-has-before item found on ${DETAIL_BEFORE}`);
    } else {
      const itemSel = `[data-gallery-panel="all"] [data-gallery-item]:nth-child(${beforeItem + 1})`;
      await page.click(`${itemSel} [data-ba="before"]`);
      await page.waitForTimeout(150);
      check("before/after: clicking the BA toggle itself does not open the viewer", !(await dialogPresent(page)));
      const beforeSrc = await page.$eval(`${itemSel} img[data-view="before"]`, (img) => img.getAttribute("src"));
      await page.click(`${itemSel} [data-gallery-zoom]`);
      await waitViewerOpen(page);
      const v = await viewerState(page);
      check("before/after: viewer opens on the before image the seat was showing", v?.imgSrc === beforeSrc, { viewerSrc: v?.imgSrc, beforeSrc });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
  }
  await ctx.close();
}

// ---- the strip's end: extra taps on "next" past the last photo never fall through to the viewer ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await open(page, DETAIL);
  await settleHydration(page);
  await page.tap('[data-gallery-tab="1"]');
  await page.waitForTimeout(250);
  const next = page.locator('[data-gallery-panel="1"] [data-gallery-arrow="next"]');
  const box = await next.boundingBox();
  const seats = await page.locator('[data-gallery-panel="1"] [data-gallery-item]').count();
  if (!box || seats < 2) {
    note("strip-end tap check skipped: room 1 has no next arrow");
  } else {
    // seats + 3 quick taps at the arrow's spot: the last ones land while / after it turns invisible
    for (let i = 0; i < seats + 3; i++) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(600);
    const counter = (await page.locator('[data-gallery-panel="1"] .i1-gallery__counter').textContent())?.replace(/\s+/g, " ").trim();
    check('strip end: rapid extra taps on "next" reach the last photo and never open the viewer', !(await dialogPresent(page)) && counter === `${seats} / ${seats}`, { counter, dialog: await dialogPresent(page) });
  }
  await ctx.close();
}

// =====================================================================================
// D. footer notice
// =====================================================================================
console.log("\n[D] footer notice");

const FOOTER_TEXT = "부스트 인테리어는 BoostInterior 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다.";

interface FooterState {
  exists: boolean;
  text: string | null;
  afterFacts: boolean;
  fontSize: number;
  opacity: number;
  rect: Rect | null;
  fctaRect: Rect | null;
}
async function footerState(page: Page): Promise<FooterState> {
  return page.evaluate((expected) => {
    const notice = document.querySelector<HTMLElement>('footer[data-section="site.footer"] [data-footer-notice]');
    const facts = document.querySelector(".i1-footer__facts");
    const fcta = document.querySelector<HTMLElement>(".i1-fcta");
    if (!notice) return { exists: false, text: null, afterFacts: false, fontSize: 0, opacity: 0, rect: null, fctaRect: null };
    const cs = getComputedStyle(notice);
    const r = notice.getBoundingClientRect();
    const fr = fcta?.getBoundingClientRect();
    const afterFacts = !facts || !!(facts.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      exists: true,
      text: notice.textContent,
      afterFacts,
      fontSize: parseFloat(cs.fontSize),
      opacity: Number(cs.opacity),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      fctaRect: fr ? { x: fr.x, y: fr.y, w: fr.width, h: fr.height } : null,
    };
  }, FOOTER_TEXT);
}
for (const vp of [{ name: "1440", width: 1440, height: 900, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
  for (const [label, url] of [["home", "/"], ["portfolio", "/portfolio"], ["detail", DETAIL]] as const) {
    const ctx = await browser.newContext(
      vp.mobile ? { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: vp.width, height: vp.height } },
    );
    const page = await ctx.newPage();
    await open(page, url);
    await settleHydration(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    const f = await footerState(page);
    check(
      `${label}@${vp.name}: footer notice exists, exact text, after facts, ≤13px, opacity<1`,
      f.exists && f.text === FOOTER_TEXT && f.afterFacts && f.fontSize <= 13 && f.opacity < 1,
      f,
    );
    check(`${label}@${vp.name}: footer notice not covered by the floating CTA`, !f.rect || !f.fctaRect || !intersects(f.rect, f.fctaRect), { rect: f.rect, fctaRect: f.fctaRect });
    check(`${label}@${vp.name}: no horizontal overflow`, (await overflowOf(page)) <= 0, await overflowOf(page));
    if (label === "home" && (vp.name === "1440" || vp.name === "390") && f.rect) {
      await page.screenshot({ path: path.join(outDir, `footer-${vp.name}.png`), clip: { x: f.rect.x, y: Math.max(0, f.rect.y - 24), width: f.rect.w, height: f.rect.h + 24 } });
    }
    await ctx.close();
  }
}

// =====================================================================================
// E. pages hygiene
// =====================================================================================
console.log("\n[E] pages hygiene");
for (const vp of [{ name: "1440", width: 1440, height: 900, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
  for (const [label, url] of [["home", "/"], ["portfolio", "/portfolio"], ["detail", DETAIL]] as const) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    const problems = await open(page, url);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    const broken = await mediaProblems(page);
    const images = await page.evaluate(() => document.images.length);
    const overflow = await overflowOf(page);
    check(
      `${label}@${vp.name}: 200, ${images} images, 0 broken, no overflow, no console error, no non-local request`,
      problems.status === 200 && broken.length === 0 && overflow <= 0 && problems.console.length === 0 && problems.nonLocal.length === 0,
      { status: problems.status, broken, overflow, console: problems.console, nonLocal: problems.nonLocal },
    );
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${label}-${vp.name}-fold.png`) });
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(`\n${passed} / ${passed + failed.length} passed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
