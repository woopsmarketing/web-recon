/**
 * Pre-Demo tiny polish smoke (interior-01 1.4.1) — drives the BUILT package of a site in a real
 * browser. Builds nothing: run `pnpm site:build <siteId>` first.
 *
 *   1. detail photo strip at 390: previous / next arrows step exactly one photo seat, the
 *      "n / N" counter follows, first / last ends are disabled, touch swipe still scrolls, a room
 *      tab always opens on photo 1, no visible scrollbar, no page overflow;
 *   2. desktop 1440: the grid layout has no arrows and no counter;
 *   3. Korean locale + KRW + pyeong price reads "평당 N만 원";
 *   4. /, /portfolio and the detail at 1440 + 390: HTTP 200, no console / page error, no
 *      non-local request, no broken image, no horizontal overflow.
 *
 * Usage: tsx scripts/template-platform-predemo-gallery-smoke.ts [outDir] [--site <siteId>] [--slug <slug>]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Page } from "playwright";

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
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-predemo-polish/screens");

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

const ptr = JSON.parse(await readFile(path.join(root, "data/site-builds", SITE, "current.json"), "utf8")) as { packageDir: string };
const record = JSON.parse(await readFile(path.join(root, ptr.packageDir, "build-record.json"), "utf8")) as { template: { releaseId: string }; buildInputId: string };
const siteRoot = path.join(root, ptr.packageDir, "site");
await mkdir(outDir, { recursive: true });
const server = await serveStatic(siteRoot);
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
console.log(`site ${SITE} · release ${record.template.releaseId} · build ${record.buildInputId.slice(0, 12)}`);

const browser = await chromium.launch();
const DETAIL = `/portfolio/${SLUG}`;

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

const panelState = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-gallery-panel]:not([hidden])")!;
    const ul = panel.querySelector<HTMLElement>(".i1-gallery__grid")!;
    const items = Array.from(ul.children) as HTMLElement[];
    const arrow = (k: string) => {
      const b = panel.querySelector<HTMLElement>(`[data-gallery-arrow="${k}"]`);
      if (!b) return null;
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return { disabled: b.getAttribute("aria-disabled") === "true", label: b.getAttribute("aria-label"), display: cs.display, opacity: Number(cs.opacity), pointerEvents: cs.pointerEvents, x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const ulRect = ul.getBoundingClientRect();
    return {
      // the DOM id suffix: a room's position, or "all" (1.4.2: the every-room view)
      panel: panel.dataset.galleryPanel ?? "",
      count: items.length,
      scrollLeft: ul.scrollLeft,
      seats: items.map((li) => li.offsetLeft - items[0]!.offsetLeft),
      counter: panel.querySelector(".i1-gallery__counter")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      counterDisplay: (() => { const c = panel.querySelector(".i1-gallery__counter"); return c ? getComputedStyle(c).display : null; })(),
      gridDisplay: getComputedStyle(ul).display,
      scrollbarGutter: ul.offsetHeight - ul.clientHeight,
      rect: { x: ulRect.x, y: ulRect.y, w: ulRect.width, h: ulRect.height },
      prev: arrow("prev"),
      next: arrow("next"),
    };
  });
const settle = async (page: Page, want: string) => {
  await page.waitForFunction((w) => document.querySelector("[data-gallery-panel]:not([hidden]) .i1-gallery__counter")?.textContent?.replace(/\s+/g, " ").trim() === w, want, { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(450);
};

// ------------------------------------------------------------ mobile 390
console.log("\n[mobile 390] detail photo strip");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const problems = await open(page, DETAIL);
  check("detail 200", problems.status === 200, problems.status);

  const tabs = await page.$$eval("[data-gallery-tab]", (els) => els.map((e) => e.textContent?.replace(/\s+/g, " ").trim()));
  console.log(`       rooms: ${tabs.join(" · ")}`);
  let s = await panelState(page);
  // 1.4.1 made the invisible end arrow inert with pointer-events: none. Since 1.4.2 the photo under it is the
  // viewer's button, so the disc keeps the press and ignores it — asserted as behaviour: a tap there does nothing.
  let endTapInert = false;
  if (s.prev) {
    await page.touchscreen.tap(s.prev.x + s.prev.w / 2, s.prev.y + s.prev.h / 2);
    await page.waitForTimeout(300);
    const after = await panelState(page);
    endTapInert = after.counter === s.counter && after.scrollLeft === s.scrollLeft && (await page.locator("dialog[open]").count()) === 0;
  }
  check("first photo: counter 1 / N, previous disabled + invisible + a tap on it does nothing, next enabled + visible", s.counter === `1 / ${s.count}` && s.prev?.disabled === true && s.prev.opacity === 0 && endTapInert && s.next?.disabled === false && s.next.opacity === 1, { ...s, endTapInert });
  check("arrows carry the site's aria-labels and control the strip", s.prev?.label === "이전 사진" && s.next?.label === "다음 사진", [s.prev?.label, s.next?.label]);
  check("arrows sit inside the photo, left / right, vertically centred, 44px targets", !!s.prev && !!s.next && s.prev.w >= 44 && s.next.h >= 44 && s.prev.x >= s.rect.x && s.prev.x < s.rect.x + 40 && s.next.x + s.next.w <= s.rect.x + s.rect.w && s.next.x + s.next.w > s.rect.x + s.rect.w - 40 && Math.abs(s.next.y + s.next.h / 2 - (s.rect.y + s.rect.h / 2)) <= 2, s);
  check("no visible horizontal scrollbar on the strip", s.scrollbarGutter === 0, s.scrollbarGutter);
  await page.screenshot({ path: path.join(outDir, "detail-390-gallery-first.png") });

  for (let i = 1; i < s.count; i++) {
    await page.tap('[data-gallery-panel]:not([hidden]) [data-gallery-arrow="next"]');
    await settle(page, `${i + 1} / ${s.count}`);
    const n = await panelState(page);
    check(`next → photo ${i + 1}: exact seat + counter`, Math.abs(n.scrollLeft - n.seats[i]!) <= 1 && n.counter === `${i + 1} / ${s.count}`, { scrollLeft: n.scrollLeft, seat: n.seats[i], counter: n.counter });
    if (i === 1) await page.screenshot({ path: path.join(outDir, "detail-390-gallery-middle.png") });
  }
  s = await panelState(page);
  check("last photo: next disabled + invisible, previous enabled", s.next?.disabled === true && s.next.opacity === 0 && s.prev?.disabled === false && s.prev.opacity === 1, s);
  await page.screenshot({ path: path.join(outDir, "detail-390-gallery-last.png") });
  await page.tap('[data-gallery-panel]:not([hidden]) [data-gallery-arrow="prev"]');
  await settle(page, `${s.count - 1} / ${s.count}`);
  s = await panelState(page);
  check("previous → exact seat + counter", Math.abs(s.scrollLeft - s.seats[s.count - 2]!) <= 1 && s.counter === `${s.count - 1} / ${s.count}`, { scrollLeft: s.scrollLeft, counter: s.counter });

  // touch swipe (real touch scroll gesture through CDP), from the current seat to the next
  const cdp = await ctx.newCDPSession(page);
  const before = s.scrollLeft;
  await cdp.send("Input.synthesizeScrollGesture", { x: Math.round(s.rect.x + s.rect.w * 0.75), y: Math.round(s.rect.y + s.rect.h / 2), xDistance: -260, gestureSourceType: "touch", speed: 1200 });
  await settle(page, `${s.count} / ${s.count}`);
  s = await panelState(page);
  check("touch swipe still moves the strip and snaps to a seat; counter follows", s.scrollLeft > before && s.seats.some((x) => Math.abs(x - s.scrollLeft) <= 1) && s.counter === `${s.count} / ${s.count}`, { before, after: s.scrollLeft, counter: s.counter });

  // room change: every room opens on its first photo (incl. coming back to a room left on its last photo)
  const tabIds = await page.$$eval("[data-gallery-tab]", (els) => els.map((e) => (e as HTMLElement).dataset.galleryTab ?? ""));
  const left = s.panel;
  let roomsOk = true;
  const roomDetail: unknown[] = [];
  let single: { prev: unknown; next: unknown; counter: unknown } | undefined;
  for (const gi of [...tabIds.filter((id) => id !== left), left]) {
    await page.tap(`[data-gallery-tab="${gi}"]`);
    await page.waitForTimeout(250);
    const r = await panelState(page);
    const ok = r.panel === gi && r.scrollLeft === 0 && (r.count === 1 ? r.counter === null : r.counter === `1 / ${r.count}` && r.prev?.disabled === true);
    if (!ok) roomsOk = false;
    roomDetail.push({ gi, count: r.count, scrollLeft: r.scrollLeft, counter: r.counter });
    if (r.count === 1) single = { prev: r.prev, next: r.next, counter: r.counter };
    else if (gi !== left) {
      // leave this room mid-strip so the return trip is a real test
      await page.tap('[data-gallery-panel]:not([hidden]) [data-gallery-arrow="next"]');
      await settle(page, `2 / ${r.count}`);
    }
  }
  check("every room tab opens on photo 1 (also when re-entering a room left on a later photo)", roomsOk, roomDetail);
  if (single) check("single-photo room: no arrows, no counter", single.prev === null && single.next === null && single.counter === null, single);

  // keyboard: Enter on the focused next arrow steps one seat
  await page.tap('[data-gallery-tab="0"]');
  await page.waitForTimeout(250);
  await page.focus('[data-gallery-panel]:not([hidden]) [data-gallery-arrow="next"]');
  await page.keyboard.press("Enter");
  s = await panelState(page);
  await settle(page, `2 / ${s.count}`);
  s = await panelState(page);
  check("keyboard Enter on next steps one seat", s.counter === `2 / ${s.count}` && Math.abs(s.scrollLeft - s.seats[1]!) <= 1, s.counter);

  const price = await page.$$eval(".i1-facts *", (els) => els.map((e) => (e.children.length === 0 ? e.textContent?.trim() ?? "" : "")).filter((t) => /^평당 .*원$|KRW|\/ 평/.test(t)));
  console.log(`       price fact: ${JSON.stringify(price)}`);
  check("price reads 평당 N만 원 (no KRW / 평 form)", price.length === 1 && /^평당 [\d,.]+만 원$/.test(price[0]!), price);
  check("no horizontal page overflow at 390", (await overflowOf(page)) <= 0, await overflowOf(page));
  check("no console / page error, no non-local request", problems.console.length === 0 && problems.nonLocal.length === 0, problems);
  await ctx.close();
}

// ----------------------------------------------------------- desktop 1440
console.log("\n[desktop 1440] detail grid unchanged");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = await open(page, DETAIL);
  const s = await panelState(page);
  check("grid layout, arrows + counter not rendered (display none), strip does not scroll", s.gridDisplay === "grid" && s.prev?.display === "none" && s.next?.display === "none" && s.counterDisplay === "none" && s.scrollLeft === 0, s);
  const focusable = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-gallery-arrow]")).filter((b) => b.offsetParent !== null).length);
  check("hidden arrows are out of the tab order", focusable === 0, focusable);
  check("no console / page error", problems.console.length === 0 && problems.nonLocal.length === 0, problems);
  await ctx.close();
}

// ------------------------------------------------- three pages, two widths
console.log("\n[pages] / · /portfolio · detail at 1440 + 390");
for (const vp of [{ name: "1440", width: 1440, height: 900, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
  for (const [label, url] of [["home", "/"], ["portfolio", "/portfolio"], ["detail", DETAIL]] as const) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    const problems = await open(page, url);
    // trigger lazy images, then measure
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    const broken = await mediaProblems(page);
    const images = await page.evaluate(() => document.images.length);
    const overflow = await overflowOf(page);
    check(`${label} @${vp.name}: 200, ${images} images, 0 broken, no overflow, no console error, no non-local request`, problems.status === 200 && broken.length === 0 && overflow <= 0 && problems.console.length === 0 && problems.nonLocal.length === 0, { status: problems.status, broken, overflow, console: problems.console, nonLocal: problems.nonLocal });
    // viewport-height capture (mobile fullPage flips pointer media queries mid-capture)
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vp.width, height: Math.min(height, 12000) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `${label}-${vp.name}.png`) });
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
