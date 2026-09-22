/**
 * Information-architecture smoke (interior-01 1.5.0) — drives the BUILT package of a site in a
 * real browser. Builds nothing.
 *
 *   A. every route (/, /portfolio, a detail, /3d-portfolio, /about, /contact) at 1440 and 390:
 *      HTTP 200, no console / page error, no non-local request, no broken image, no horizontal
 *      overflow; the header shows the inline nav (portfolio · 3D · about · contact pill, in
 *      order, aria-current on its own page) at 1440 and only logo + menu button at 390; the
 *      floating CTA → /contact on every page except /contact, where it is hidden;
 *   B. header fit at 900 (inline nav, one row, inside the viewport) and 899 (menu button);
 *   C. the < 900 menu: closed + absent at load, opens (aria-expanded, aria-controls, label, focus
 *      on the close button, 4 items in order), focus stays inside, scroll lock, floating CTA hidden
 *      and not overlapping, Esc / close button / backdrop close it (a press inside the sheet does
 *      not) with focus back on the button and the scroll position kept, a link press navigates
 *      and the next page starts closed (4 links walked), keyboard open, resize to ≥ 900 closes it;
 *   D. /contact: labelled fields, required validation blocks the hand-off, the mailto hand-off
 *      (address, subject, labelled body lines) is composed on submit, no network request, the
 *      status says nothing was sent (never a success claim), the submit button is never covered;
 *      negative control fixture-empty (no email): no form, no contact CTA anywhere;
 *   E. CTA wiring: header pill, floating seat (client navigation), detail CTA → /contact.
 *
 * Usage: tsx scripts/template-platform-ia-smoke.ts [outDir] [--site <siteId>] [--slug <slug>]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

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
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-ia-final/screens");
const NEG_SITE = "fixture-empty";
const EMAIL = "hello@boost-interior-demo.example";
const NAV = [
  { key: "portfolio", href: "/portfolio", label: "포트폴리오" },
  { key: "portfolio3d", href: "/3d-portfolio", label: "3D 포트폴리오" },
  { key: "about", href: "/about", label: "소개" },
  { key: "contact", href: "/contact", label: "견적 문의" },
];
const DETAIL = `/portfolio/${SLUG}`;
const ROUTES = [
  { name: "home", url: "/", current: undefined as string | undefined },
  { name: "portfolio", url: "/portfolio", current: "portfolio" },
  { name: "detail", url: DETAIL, current: "portfolio" },
  { name: "3d-portfolio", url: "/3d-portfolio", current: "portfolio3d" },
  { name: "about", url: "/about", current: "about" },
  { name: "contact", url: "/contact", current: "contact" },
];

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
async function siteRootOf(siteId: string): Promise<{ siteRoot: string; releaseId: string }> {
  const ptr = JSON.parse(await readFile(path.join(root, "data/site-builds", siteId, "current.json"), "utf8")) as { packageDir: string };
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

const { siteRoot, releaseId } = await siteRootOf(SITE);
await mkdir(outDir, { recursive: true });
const server = await serveStatic(siteRoot);
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
console.log(`site ${SITE} · release ${releaseId}`);
/** releases ≥ 1.5.1 write the message's line breaks as CRLF */
const crlfMessage = (() => {
  const [a, b, c] = (/-(\d+)\.(\d+)\.(\d+)-/.exec(releaseId) ?? []).slice(1).map(Number) as [number, number, number];
  return a > 1 || (a === 1 && (b > 5 || (b === 5 && c >= 1)));
})();
const browser: Browser = await chromium.launch();

interface Problems { console: string[]; nonLocal: string[]; status: number; requests: string[] }
async function context(width: number, height = 800): Promise<BrowserContext> {
  const mobile = width < 900;
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
}
async function open(page: Page, url: string, base = origin): Promise<Problems> {
  const problems: Problems = { console: [], nonLocal: [], status: 0, requests: [] };
  // tsx/esbuild wraps named inner functions with __name(); give evaluated code a no-op shim.
  await page.addInitScript("window.__name = (f) => f;");
  page.on("console", (m) => {
    if (m.type() === "error") problems.console.push(m.text());
  });
  page.on("pageerror", (e) => problems.console.push(String(e)));
  page.on("request", (r) => {
    problems.requests.push(r.url());
    if (!r.url().startsWith(base) && !r.url().startsWith("data:")) problems.nonLocal.push(r.url());
  });
  const res = await page.goto(base + url, { waitUntil: "networkidle" });
  problems.status = res?.status() ?? 0;
  await page.waitForTimeout(450); // hydration buffer (server and hydrated HTML are identical by design)
  return problems;
}
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
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
interface Rect { x: number; y: number; w: number; h: number }
const intersects = (a: Rect, b: Rect) => !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);

interface HeaderState {
  navDisplay: string;
  navItems: { key: string | null; href: string | null; text: string; current: string | null; rect: Rect }[];
  menuButton: { display: string; rect: Rect; label: string | null; expanded: string | null; controls: string | null } | null;
  visibleHeaderChildren: string[];
  headerRect: Rect;
  fcta: { display: string; href: string | null; text: string; rect: Rect } | null;
}
const headerState = (page: Page) =>
  page.evaluate((): HeaderState => {
    const r = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const header = document.querySelector(".i1-header")!;
    const nav = header.querySelector<HTMLElement>(".i1-header__nav");
    const button = header.querySelector<HTMLElement>("[data-menu-button]");
    const inner = header.querySelector(".i1-header__inner")!;
    const fcta = document.querySelector<HTMLElement>(".i1-fcta");
    return {
      navDisplay: nav ? getComputedStyle(nav).display : "absent",
      navItems: nav
        ? Array.from(nav.querySelectorAll("a")).map((a) => ({ key: a.getAttribute("data-nav"), href: a.getAttribute("href"), text: a.textContent ?? "", current: a.getAttribute("aria-current"), rect: r(a) }))
        : [],
      menuButton: button
        ? { display: getComputedStyle(button).display, rect: r(button), label: button.getAttribute("aria-label"), expanded: button.getAttribute("aria-expanded"), controls: button.getAttribute("aria-controls") }
        : null,
      visibleHeaderChildren: Array.from(inner.children)
        .filter((c) => getComputedStyle(c).display !== "none")
        .map((c) => c.className),
      headerRect: r(header),
      fcta: fcta ? { display: getComputedStyle(fcta).display, href: fcta.querySelector("a")?.getAttribute("href") ?? null, text: fcta.textContent ?? "", rect: r(fcta) } : null,
    };
  });

// =====================================================================================
// A. routes × widths
// =====================================================================================
console.log("\n[A] routes at 1440 and 390");
for (const width of [1440, 390]) {
  const ctx = await context(width);
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const problems = await open(page, route.url);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((res) => setTimeout(res, 50));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    const broken = await mediaProblems(page);
    const overflow = await overflowOf(page);
    const label = `${route.name}@${width}`;
    check(
      `${label}: 200, 0 broken images, overflow 0, no console error, no non-local request`,
      problems.status === 200 && broken.length === 0 && overflow <= 0 && problems.console.length === 0 && problems.nonLocal.length === 0,
      { status: problems.status, broken, overflow, console: problems.console, nonLocal: problems.nonLocal },
    );
    const h = await headerState(page);
    const items = h.navItems.map((i) => ({ key: i.key, href: i.href, label: i.text }));
    check(`${label}: header nav = portfolio · 3D · about · contact pill (hrefs, labels, order)`, JSON.stringify(items) === JSON.stringify(NAV), items);
    const currents = h.navItems.filter((i) => i.current).map((i) => `${i.key}=${i.current}`);
    const expectCurrent = route.current ? [`${route.current}=${route.name === "detail" ? "true" : "page"}`] : [];
    check(`${label}: aria-current only on its own nav item`, JSON.stringify(currents) === JSON.stringify(expectCurrent), currents);
    if (width >= 900) {
      check(
        `${label}: inline nav shown, menu button hidden, items in one row inside the header`,
        h.navDisplay === "flex" && h.menuButton?.display === "none" && h.navItems.every((i) => i.rect.w > 0 && i.rect.y >= h.headerRect.y && i.rect.y + i.rect.h <= h.headerRect.y + h.headerRect.h) && new Set(h.navItems.map((i) => Math.round(i.rect.y + i.rect.h / 2))).size === 1,
        h,
      );
    } else {
      check(
        `${label}: header = logo + menu button only (nav hidden), button 44×44 inside the viewport`,
        h.navDisplay === "none" && !!h.menuButton && h.menuButton.display !== "none" && h.visibleHeaderChildren.length === 2 && h.menuButton.rect.w >= 44 && h.menuButton.rect.h >= 44 && h.menuButton.rect.x + h.menuButton.rect.w <= width,
        h,
      );
    }
    if (route.name === "contact") {
      check(`${label}: floating CTA hidden on /contact`, h.fcta !== null && h.fcta.display === "none", h.fcta);
    } else {
      check(`${label}: floating CTA shown → /contact, clear of the header`, h.fcta?.display === "flex" && h.fcta.href === "/contact" && h.fcta.text === "상담 문의" && !intersects(h.fcta.rect, h.headerRect), h.fcta);
    }
    await page.screenshot({ path: path.join(outDir, `${route.name}-${width}-fold.png`) });
    if (["3d-portfolio", "about", "contact"].includes(route.name)) await page.screenshot({ path: path.join(outDir, `${route.name}-${width}-full.png`), fullPage: true });
    await page.close();
  }
  await ctx.close();
}

// =====================================================================================
// B. header fit at the breakpoint
// =====================================================================================
console.log("\n[B] header at 900 / 899");
{
  const ctx = await context(900);
  const page = await ctx.newPage();
  await open(page, "/about");
  const h = await headerState(page);
  const right = Math.max(...h.navItems.map((i) => i.rect.x + i.rect.w));
  check("900: inline nav, one row, inside the viewport, no overflow", h.navDisplay === "flex" && h.menuButton?.display === "none" && new Set(h.navItems.map((i) => Math.round(i.rect.y + i.rect.h / 2))).size === 1 && right <= 900 && (await overflowOf(page)) <= 0, h);
  await page.screenshot({ path: path.join(outDir, "header-900.png"), clip: { x: 0, y: 0, width: 900, height: 80 } });
  await page.setViewportSize({ width: 899, height: 800 });
  await page.waitForTimeout(150);
  const m = await headerState(page);
  check("899: menu button, nav hidden", m.navDisplay === "none" && !!m.menuButton && m.menuButton.display !== "none", m);
  await ctx.close();
}

// =====================================================================================
// C. the < 900 menu
// =====================================================================================
console.log("\n[C] mobile menu at 390");
interface MenuState {
  open: boolean;
  present: boolean;
  label: string | null;
  id: string | null;
  items: { key: string | null; href: string | null; text: string; current: string | null }[];
  htmlOverflow: string;
  scrollY: number;
  active: string;
  activeInDialog: boolean;
  expanded: string | null;
  controls: string | null;
  fctaDisplay: string | null;
  sheet: Rect | null;
}
const menuState = (page: Page) =>
  page.evaluate((): MenuState => {
    const d = document.querySelector<HTMLDialogElement>("dialog[data-menu]");
    const button = document.querySelector("[data-menu-button]");
    const a = document.activeElement;
    const fcta = document.querySelector<HTMLElement>(".i1-fcta");
    const b = d?.getBoundingClientRect();
    return {
      open: !!d?.open,
      present: !!d,
      label: d?.getAttribute("aria-label") ?? null,
      id: d?.id ?? null,
      items: d ? Array.from(d.querySelectorAll("a")).map((l) => ({ key: l.getAttribute("data-menu-link"), href: l.getAttribute("href"), text: l.textContent ?? "", current: l.getAttribute("aria-current") })) : [],
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      scrollY: Math.round(window.scrollY),
      active: a ? `${a.tagName.toLowerCase()}${a.hasAttribute("data-menu-button") ? "[data-menu-button]" : ""}${a.hasAttribute("data-menu-close") ? "[data-menu-close]" : ""}${a.getAttribute("data-menu-link") ? `[${a.getAttribute("data-menu-link")}]` : ""}` : "none",
      activeInDialog: !!d && !!a && d.contains(a),
      expanded: button?.getAttribute("aria-expanded") ?? null,
      controls: button?.getAttribute("aria-controls") ?? null,
      fctaDisplay: fcta ? getComputedStyle(fcta).display : null,
      sheet: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null,
    };
  });
{
  const ctx = await context(390);
  const page = await ctx.newPage();
  const problems = await open(page, "/");
  const html = await (await fetch(`${origin}/`)).text();
  check("server HTML has no menu dialog (client-only, like the photo viewer)", !/<dialog\b|data-menu=""|i1-menu__/.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")));
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(100);
  let s = await menuState(page);
  check("closed at load: no dialog, aria-expanded=false, no aria-controls", !s.present && s.expanded === "false" && s.controls === null, s);
  const scrollBefore = s.scrollY;

  await page.click("[data-menu-button]");
  await page.waitForTimeout(250);
  s = await menuState(page);
  check("opens: modal dialog open, aria-expanded=true, aria-controls = its id, labelled 메뉴", s.open && s.expanded === "true" && s.controls === s.id && s.id === "i1-menu" && s.label === "메뉴", s);
  check("focus moves into the dialog, onto the close button", s.active === "button[data-menu-close]" && s.activeInDialog, s.active);
  check("4 items in order with the header's hrefs and labels; contact last", JSON.stringify(s.items.map((i) => ({ key: i.key, href: i.href, label: i.text }))) === JSON.stringify(NAV), s.items);
  check("close button named 메뉴 닫기", (await page.getAttribute("[data-menu-close]", "aria-label")) === "메뉴 닫기");
  check("menu button named 메뉴 열기", (await page.getAttribute("[data-menu-button]", "aria-label")) === "메뉴 열기");
  check("scroll lock: html overflow hidden, scroll position kept", s.htmlOverflow === "hidden" && s.scrollY === scrollBefore, s);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(200);
  check("scroll lock: a wheel over the page does not move it", (await menuState(page)).scrollY === scrollBefore);
  check("floating CTA hidden while the menu is open (no overlap)", s.fctaDisplay === "none", s.fctaDisplay);
  const topHit = await page.evaluate(() => {
    const cta = document.querySelector("dialog[data-menu] .i1-menu__cta")!;
    const b = cta.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!hit && (hit === cta || cta.contains(hit));
  });
  check("the menu's contact item is on top where it is drawn", topHit);
  check("sheet inside the viewport (full height, right edge)", !!s.sheet && s.sheet.x >= 0 && Math.round(s.sheet.x + s.sheet.w) === 390 && s.sheet.y === 0 && s.sheet.h >= 800 - 1, s.sheet);
  await page.screenshot({ path: path.join(outDir, "menu-open-390.png") });
  const trail: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const t = await menuState(page);
    trail.push(`${t.active}${t.activeInDialog ? "" : "(outside)"}`);
  }
  check("Tab ×8 never focuses anything on the page behind (modal)", trail.every((t) => !t.endsWith("(outside)") || t.startsWith("body")), trail);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  s = await menuState(page);
  check("Esc closes: dialog gone, aria-expanded=false, focus back on the menu button, lock released, scroll kept", !s.present && s.expanded === "false" && s.active === "button[data-menu-button]" && s.htmlOverflow !== "hidden" && s.scrollY === scrollBefore && s.fctaDisplay === "flex", s);

  await page.click("[data-menu-button]");
  await page.waitForTimeout(200);
  await page.click("[data-menu-close]");
  await page.waitForTimeout(200);
  s = await menuState(page);
  check("close button closes, focus back on the menu button", !s.present && s.active === "button[data-menu-button]" && s.htmlOverflow !== "hidden", s);

  await page.click("[data-menu-button]");
  await page.waitForTimeout(200);
  const sheet = (await menuState(page)).sheet!;
  await page.mouse.click(sheet.x + sheet.w / 2, sheet.y + sheet.h - 40); // empty sheet area under the list
  await page.waitForTimeout(200);
  check("a press inside the sheet (empty area) does not close it", (await menuState(page)).open);
  await page.mouse.click(Math.max(4, sheet.x / 2), 400); // backdrop, left of the sheet
  await page.waitForTimeout(200);
  s = await menuState(page);
  check("backdrop press closes", !s.present && s.expanded === "false" && s.htmlOverflow !== "hidden", s);

  // keyboard: focus the button, Enter opens, Esc closes
  await page.focus("[data-menu-button]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const kOpen = (await menuState(page)).open;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("keyboard: Enter on the button opens, Esc closes", kOpen && !(await menuState(page)).present);

  // a link press navigates (client-side) and the next page starts with the menu closed
  const walk = [
    { key: "about", path: "/about", h1: "소개" },
    { key: "portfolio3d", path: "/3d-portfolio", h1: "3D 포트폴리오" },
    { key: "contact", path: "/contact", h1: "견적 문의" },
    { key: "portfolio", path: "/portfolio", h1: "포트폴리오" },
  ];
  for (const w of walk) {
    await page.click("[data-menu-button]");
    await page.waitForTimeout(200);
    await page.click(`dialog[data-menu] [data-menu-link="${w.key}"]`);
    await page.waitForURL((u) => u.pathname === w.path || u.pathname === `${w.path}.html`, { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const after = await menuState(page);
    const h1 = await page.evaluate(() => document.querySelector("h1")?.textContent ?? "");
    const url = new URL(page.url()).pathname;
    check(
      `menu → ${w.path}: navigated, page renders, menu closed, lock released, aria-expanded=false, aria-current on the new page`,
      (url === w.path || url === `${w.path}.html`) && h1 === w.h1 && !after.present && after.htmlOverflow !== "hidden" && after.expanded === "false" &&
        (await page.getAttribute(`.i1-header__nav [data-nav="${w.key}"]`, "aria-current")) === "page",
      { url, h1, after },
    );
  }
  check("menu walk: no console error, no non-local request", problems.console.length === 0 && problems.nonLocal.length === 0, problems);

  // resize to the desktop band with the menu open → it closes (a hidden modal would make the page inert)
  await page.click("[data-menu-button]");
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(300);
  s = await menuState(page);
  const clickable = await page.evaluate(() => {
    const a = document.querySelector<HTMLElement>('.i1-header__nav [data-nav="about"]')!;
    const b = a.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!hit && (hit === a || a.contains(hit));
  });
  check("resize to 1000 with the menu open: it closes, lock released, inline nav usable", !s.present && s.htmlOverflow !== "hidden" && clickable, s);
  await ctx.close();
}

// =====================================================================================
// D. /contact form
// =====================================================================================
console.log("\n[D] /contact form");
for (const width of [390, 1440]) {
  const ctx = await context(width);
  const page = await ctx.newPage();
  const problems = await open(page, "/contact");
  const fields = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement>("form[data-inquiry-form] [name]")).map((f) => ({
      name: f.name,
      tag: f.tagName.toLowerCase(),
      required: f.required,
      label: (document.querySelector(`label[for="${f.id}"]`)?.textContent ?? "").replace(" *", ""),
    })),
  );
  check(
    `${width}: 7 labelled fields (이름*, 연락처*, 지역, 평형, 공사 유형 select, 예상 일정, 문의 내용*)`,
    JSON.stringify(fields) ===
      JSON.stringify([
        { name: "name", tag: "input", required: true, label: "이름" },
        { name: "phone", tag: "input", required: true, label: "연락처" },
        { name: "region", tag: "input", required: false, label: "지역" },
        { name: "area", tag: "input", required: false, label: "평형" },
        { name: "workType", tag: "select", required: false, label: "공사 유형" },
        { name: "schedule", tag: "input", required: false, label: "예상 일정" },
        { name: "message", tag: "textarea", required: true, label: "문의 내용" },
      ]),
    fields,
  );
  const options = await page.$$eval("select[name=workType] option", (os) => os.map((o) => o.textContent));
  check(`${width}: work-type options from the site`, JSON.stringify(options) === JSON.stringify(["선택해 주세요", "전체 리모델링", "부분 리모델링", "주방·욕실 리뉴얼", "입주 전 홈스타일링", "기타"]), options);
  const text = await page.evaluate(() => document.querySelector("main")!.textContent ?? "");
  check(`${width}: says online submission is not connected; direct email shown; no success wording at load`, text.includes("온라인 접수는 아직 연결되어 있지 않습니다") && (await page.$(`a[href="mailto:${EMAIL}"]`)) !== null && !/접수되었|접수 완료|전송되었|전송 완료|완료되었/.test(text) && (await page.textContent("[data-inquiry-status]")) === "");
  // record the hand-off instead of leaving the page for a mail app
  await page.evaluate(() => {
    const w = window as unknown as { __handoffs: string[] };
    w.__handoffs = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith("mailto:")) w.__handoffs.push(this.href);
      else orig.call(this);
    };
  });
  const handoffs = () => page.evaluate(() => (window as unknown as { __handoffs: string[] }).__handoffs);
  await page.click("[data-inquiry-submit]");
  await page.waitForTimeout(200);
  const invalid = await page.evaluate(() => Array.from(document.querySelectorAll("form[data-inquiry-form] :invalid")).map((e) => e.getAttribute("name")));
  check(`${width}: empty submit is blocked by required validation (no hand-off, no status)`, (await handoffs()).length === 0 && JSON.stringify(invalid) === JSON.stringify(["name", "phone", "message"]) && (await page.textContent("[data-inquiry-status]")) === "", invalid);
  await page.fill("[name=name]", "홍길동");
  await page.fill("[name=phone]", "010-1234-5678");
  await page.fill("[name=region]", "대구 수성구");
  await page.fill("[name=area]", "34평");
  await page.selectOption("[name=workType]", "전체 리모델링");
  await page.fill("[name=schedule]", "11월 입주 전");
  await page.fill("[name=message]", "거실과 주방 수납을 늘리고 싶습니다.\n견적 부탁드립니다.");
  const requestsBefore = problems.requests.length;
  const submit = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("[data-inquiry-submit]")!;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === b || b.contains(hit));
  });
  check(`${width}: the submit button is not covered by anything (no floating seat on /contact)`, submit);
  await page.click("[data-inquiry-submit]");
  await page.waitForTimeout(300);
  const h = await handoffs();
  const u = h[0] ? new URL(h[0]) : undefined;
  const subject = u?.searchParams.get("subject");
  const body = u?.searchParams.get("body");
  check(`${width}: one mailto hand-off to the business address`, h.length === 1 && u?.protocol === "mailto:" && u.pathname === EMAIL, h);
  check(`${width}: subject "[견적 문의] 홍길동님"`, subject === "[견적 문의] 홍길동님", subject);
  // ≥ 1.5.1 the message's own line breaks are CRLF too (RFC 6068); 1.5.0 kept them LF
  const messageBreak = crlfMessage ? "\r\n" : "\n";
  check(
    `${width}: body = one labelled line per field, message last (CRLF${crlfMessage ? ", message lines too" : ""})`,
    body === `이름: 홍길동\r\n연락처: 010-1234-5678\r\n지역: 대구 수성구\r\n평형: 34평\r\n공사 유형: 전체 리모델링\r\n예상 일정: 11월 입주 전\r\n\r\n문의 내용:\r\n거실과 주방 수납을 늘리고 싶습니다.${messageBreak}견적 부탁드립니다.`,
    body,
  );
  const status = (await page.textContent("[data-inquiry-status]")) ?? "";
  check(
    `${width}: status after the hand-off says nothing was sent yet and names the address — no success claim`,
    status === `메일 앱에서 내용을 확인한 뒤 보내 주세요. 아직 전송된 것은 아닙니다. 메일 앱이 열리지 않으면 ${EMAIL}로 보내 주세요.` && !/접수되었|접수 완료|전송되었|전송 완료|완료되었/.test(status) && (await page.getAttribute("[data-inquiry-status]", "role")) === "status",
    status,
  );
  check(`${width}: no network request on submit, no console error`, problems.requests.length === requestsBefore && problems.console.length === 0, { requests: problems.requests.slice(requestsBefore), console: problems.console });
  check(`${width}: still on /contact`, new URL(page.url()).pathname.startsWith("/contact"));
  await page.screenshot({ path: path.join(outDir, `contact-submitted-${width}.png`), fullPage: true });
  await ctx.close();
}

// negative control: a site with no email
{
  const neg = await siteRootOf(NEG_SITE);
  const negServer = await serveStatic(neg.siteRoot);
  const negOrigin = `http://127.0.0.1:${(negServer.address() as AddressInfo).port}`;
  const ctx = await context(390);
  const page = await ctx.newPage();
  const problems = await open(page, "/contact", negOrigin);
  const state = await page.evaluate(() => ({
    form: !!document.querySelector("form[data-inquiry-form]"),
    unavailable: document.querySelector(".i1-contact__unavailable")?.textContent ?? null,
    mailto: document.querySelectorAll('a[href^="mailto:"]').length,
    contactLinks: document.querySelectorAll('a[href="/contact"]').length,
    fcta: !!document.querySelector(".i1-fcta"),
  }));
  check(`${NEG_SITE} (no email) /contact: no form, the neutral unavailable line, no mailto, no contact CTA, no floating seat`, !state.form && state.unavailable === "Contact details are not available yet." && state.mailto === 0 && state.contactLinks === 0 && !state.fcta && problems.status === 200 && problems.console.length === 0, state);
  const home = await (await fetch(`${negOrigin}/`)).text();
  check(`${NEG_SITE}: no contact CTA on the home page either`, !home.includes('href="/contact"') && !home.includes("mailto:"));
  await ctx.close();
  negServer.close();
}

// =====================================================================================
// E. CTA wiring
// =====================================================================================
console.log("\n[E] contact calls to action → /contact");
{
  const ctx = await context(1440);
  const page = await ctx.newPage();
  await open(page, DETAIL);
  const detailCta = await page.evaluate(() => {
    const a = document.querySelector("[data-cta] a");
    return a ? { href: a.getAttribute("href"), text: a.textContent } : null;
  });
  check("detail CTA → /contact", detailCta?.href === "/contact" && detailCta.text === "상담 문의하기", detailCta);
  await page.click('.i1-header__nav [data-nav="contact"]');
  await page.waitForURL((u) => u.pathname.startsWith("/contact"), { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  check("header pill navigates to /contact", new URL(page.url()).pathname.startsWith("/contact") && (await page.textContent("h1")) === "견적 문의");
  await ctx.close();
  const m = await context(390);
  const mp = await m.newPage();
  await open(mp, "/about");
  await mp.click(".i1-fcta a");
  await mp.waitForURL((u) => u.pathname.startsWith("/contact"), { timeout: 5000 }).catch(() => undefined);
  await mp.waitForTimeout(300);
  const fctaDisplay = await mp.evaluate(() => getComputedStyle(document.querySelector(".i1-fcta")!).display);
  check("390: floating seat navigates to /contact (client-side, the seat survives) and hides itself there", new URL(mp.url()).pathname.startsWith("/contact") && fctaDisplay === "none", fctaDisplay);
  await mp.goBack();
  await mp.waitForTimeout(400);
  const back = await mp.evaluate(() => getComputedStyle(document.querySelector(".i1-fcta")!).display);
  check("390: back on /about the seat shows again", back === "flex", back);
  await m.close();
}

await browser.close();
server.close();
console.log(`\n${passed} / ${passed + failed.length} passed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
