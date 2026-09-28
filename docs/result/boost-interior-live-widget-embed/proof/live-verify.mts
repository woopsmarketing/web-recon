// Live production verification of https://interior-demo.boostweb.co.kr (BoostChat widget embed).
//   tsx live-verify.mts <outDir> <mode>
//   mode = baseline  : widget OFF expected (pre-publish). Site regression + perf only.
//          live      : widget ON expected. Everything, incl. one greeting on the desktop homepage.
import { chromium, devices, type Page, type Frame } from "/Users/woops/projects/web-recon-track-b/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const [outDir, mode] = process.argv.slice(2) as [string, "baseline" | "live"];
if (!outDir || !["baseline", "live"].includes(mode)) throw new Error("usage: live-verify.mts <outDir> baseline|live");
mkdirSync(outDir, { recursive: true });

const ORIGIN = "https://interior-demo.boostweb.co.kr";
const SRC = "https://boostchat.co.kr/widget.js";
const KEY = "wgt_99kYYFOm7ABvdQbVh_8SdrnOlLrPqDI3";
const SLUGS = [
  "suseong-white-34py-apartment-remodeling", "dalseo-24py-white-natural-newlywed-home", "suseong-42py-family-storage-remodeling",
  "buk-32py-kitchen-bathroom-renewal", "dong-29py-bright-natural-remodeling", "gyeongsan-34py-entrance-living-remodeling",
  "jung-19py-compact-white-minimal-remodeling", "suseong-51py-new-apartment-home-styling", "dalseo-34py-value-full-remodeling",
  "suseong-34py-expansion-windows-full-remodeling", "buk-20py-villa-full-remodeling", "dong-26py-warm-wood-full-remodeling",
  "suseong-48py-large-apartment-full-remodeling", "dalseo-84m2-kitchen-only-renewal", "jung-single-bathroom-renewal",
  "gyeongsan-38py-kitchen-two-bathrooms-renewal", "buk-112m2-living-room-flooring-renewal", "seo-30py-entrance-storage-renewal",
  "dalseong-32py-whole-flat-wallpaper-flooring",
];
const PUBLIC_PATHS = ["/", "/portfolio", "/3d-portfolio", "/about", "/contact", ...SLUGS.map((s) => `/portfolio/${s}`)];
const DETAIL_DESKTOP = "/portfolio/dalseo-34py-value-full-remodeling";
const DETAIL_MOBILE = "/portfolio/dalseo-84m2-kitchen-only-renewal";
const expectWidget = mode === "live";

const result: Record<string, unknown> = { mode, origin: ORIGIN, startedAt: new Date().toISOString() };
const failures: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); return cond; };

// ── 1. raw server HTML of every public page: status, widget tag count and shape ──────────────────
const TAG_RE = /<script\b[^>]*>/g;
const raw: Record<string, unknown>[] = [];
for (const p of PUBLIC_PATHS) {
  const res = await fetch(ORIGIN + p, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  const html = await res.text();
  const tags = (html.match(TAG_RE) ?? []).filter((t) => t.includes("boostchat.co.kr"));
  const blocking = (html.match(TAG_RE) ?? []).filter((t) => /\bsrc=/.test(t) && !/\basync\b|\bdefer\b|type="module"|\bnoModule\b/i.test(t));
  const row = {
    path: p, status: res.status, bytes: html.length, widgetTags: tags.length, tag: tags[0] ?? null,
    async: tags.length === 1 && /\basync(=""|\b)/.test(tags[0]!), src: tags.length === 1 && tags[0]!.includes(`src="${SRC}"`),
    key: tags.length === 1 && tags[0]!.includes(`data-boost-chat-key="${KEY}"`), keyOccurrences: html.split(KEY).length - 1,
    otherBoostchatUrls: [...new Set(html.match(/https:\/\/boostchat\.co\.kr[^"'\\\s<>]*/g) ?? [])].filter((u) => u !== SRC),
    blockingExternalScripts: blocking.length,
  };
  raw.push(row);
  check(res.status === 200, `raw ${p}: status ${res.status}`);
  check(row.blockingExternalScripts === 0, `raw ${p}: ${row.blockingExternalScripts} render-blocking external scripts`);
  if (expectWidget) {
    check(row.widgetTags === 1, `raw ${p}: widget tags ${row.widgetTags}`);
    check(row.async && row.src && row.key, `raw ${p}: tag shape ${row.tag}`);
    check(row.otherBoostchatUrls.length === 0, `raw ${p}: other boostchat urls ${row.otherBoostchatUrls}`);
  } else check(row.widgetTags === 0, `raw ${p}: baseline has widget tag`);
}
result.rawPages = raw;

// ── 2. browser checks ────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const PERF_INIT = () => {
  (window as any).__cls = 0; (window as any).__lcp = 0; (window as any).__shifts = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) { (window as any).__cls += e.value; (window as any).__shifts.push({ v: e.value, t: e.startTime, src: (e.sources || []).map((s: any) => s.node?.nodeName + "." + (s.node?.className || "")) }); } }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as any).__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
};

async function openPage(ctxName: string, page: Page, p: string, errors: string[]) {
  const res = await page.goto(ORIGIN + p, { waitUntil: "load" });
  await page.waitForTimeout(expectWidget ? 4000 : 1500); // let the async loader + iframe settle
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const w = performance.getEntriesByType("resource").find((r) => r.name.startsWith("https://boostchat.co.kr/widget.js")) as PerformanceResourceTiming | undefined;
    return {
      dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: fcp && Math.round(fcp),
      lcp: Math.round((window as any).__lcp), cls: Number((window as any).__cls.toFixed(4)), shifts: (window as any).__shifts,
      widgetJs: w ? { start: Math.round(w.startTime), end: Math.round(w.responseEnd), renderBlockingStatus: (w as any).renderBlockingStatus ?? null } : null,
    };
  });
  const dom = await page.evaluate(() => ({
    scripts: document.querySelectorAll('script[src="https://boostchat.co.kr/widget.js"]').length,
    iframes: document.querySelectorAll("iframe[data-boost-chat-frame]").length,
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    title: document.title,
  }));
  return { status: res?.status() ?? null, perf, dom, errors: [...errors] };
}

async function widgetFrame(page: Page): Promise<Frame> {
  const el = await page.waitForSelector("iframe[data-boost-chat-frame]", { timeout: 20000 });
  const f = await el.contentFrame();
  await f!.waitForSelector('button[aria-label="상담창 열기"]', { state: "visible", timeout: 20000 });
  return f!;
}
const iframeBox = (page: Page) => page.locator("iframe[data-boost-chat-frame]").boundingBox();

async function launcherAndOpen(page: Page, label: string, vw: number, vh: number) {
  const f = await widgetFrame(page);
  const closed = await iframeBox(page);
  const launcherVisible = !!closed && closed.width >= 60 && closed.height >= 60 && closed.x >= 0 && closed.y >= 0 && closed.x + closed.width <= vw && closed.y + closed.height <= vh;
  await page.screenshot({ path: `${outDir}/${label}-closed.png` });
  await f.click('button[aria-label="상담창 열기"]');
  await f.waitForSelector('[data-testid="chat-input"]', { state: "visible", timeout: 15000 });
  await page.waitForTimeout(800);
  const open = await iframeBox(page);
  const greeting = await f.locator('[data-testid="chat-message"]').first().innerText().catch(() => "");
  const overflowOpen = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: `${outDir}/${label}-open.png` });
  return { f, closed, open, launcherVisible, greeting, overflowOpen };
}

async function siteRegression(page: Page, p: string) {
  // scroll through the page so lazy images load, then check every <img> and collect internal links
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const imgs = [...document.images].map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 }));
    const links = [...new Set([...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href).filter((h) => h.startsWith(location.origin)))];
    return { images: imgs.length, brokenImages: imgs.filter((i) => !i.ok).map((i) => i.src), links };
  });
}

const allLinks = new Set<string>();
const scenarios: Record<string, unknown> = {};
for (const vp of [
  { name: "desktop", opts: { viewport: { width: 1366, height: 900 } } },
  { name: "mobile390", opts: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
] as const) {
  const ctx = await browser.newContext({ ...(vp.opts as any), locale: "ko-KR" });
  await ctx.addInitScript(PERF_INIT);
  const vw = vp.opts.viewport.width, vh = vp.opts.viewport.height;
  const pages = vp.name === "desktop" ? ["/", "/portfolio", DETAIL_DESKTOP] : ["/", "/portfolio", DETAIL_MOBILE];
  for (const p of pages) {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
    const label = `${vp.name}${p === "/" ? "-home" : p === "/portfolio" ? "-list" : "-detail"}`;
    const s: Record<string, unknown> = await openPage(vp.name, page, p, errors);
    check(s.status === 200, `${label}: status ${s.status}`);
    const dom = s.dom as any;
    check(dom.scrollWidth <= dom.innerWidth, `${label}: horizontal overflow ${dom.scrollWidth} > ${dom.innerWidth}`);
    check(expectWidget ? dom.scripts === 1 && dom.iframes === 1 : dom.scripts === 0 && dom.iframes === 0, `${label}: dom scripts ${dom.scripts} iframes ${dom.iframes}`);
    s.regression = await siteRegression(page, p);
    for (const l of (s.regression as any).links) allLinks.add(l);
    check((s.regression as any).brokenImages.length === 0, `${label}: broken images ${(s.regression as any).brokenImages}`);
    if (expectWidget) {
      const w = await launcherAndOpen(page, label, vw, vh);
      s.widget = { closed: w.closed, open: w.open, launcherVisible: w.launcherVisible, greeting: w.greeting.slice(0, 120), overflowOpen: w.overflowOpen };
      check(w.launcherVisible, `${label}: launcher not visible ${JSON.stringify(w.closed)}`);
      check(!!w.open && w.open.width > 300 && w.open.height > 400, `${label}: widget did not open ${JSON.stringify(w.open)}`);
      check(w.greeting.includes("부스트 인테리어"), `${label}: bootstrap greeting missing: ${w.greeting}`);
      check(w.overflowOpen <= 0, `${label}: horizontal overflow with widget open ${w.overflowOpen}`);
      if (vp.name === "mobile390") {
        const o = w.open!;
        (s.widget as any).mobileOpenCoverage = { widthPct: Math.round((o.width / vw) * 100), heightPct: Math.round((o.height / vh) * 100), fullscreen: o.width >= vw && o.height >= vh };
      }
      if (vp.name === "desktop" && p === "/") {
        // one simple greeting on the live homepage
        const before = await w.f.locator('[data-testid="chat-message"]').count();
        await w.f.fill('[data-testid="chat-input"]', "안녕하세요");
        await w.f.click('[data-testid="chat-send"]');
        let reply = "";
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
          await page.waitForTimeout(1500);
          const msgs = await w.f.locator('[data-testid="chat-message"]').allInnerTexts();
          const busy = await w.f.locator('[data-testid="chat-send"]').isDisabled().catch(() => false);
          if (msgs.length >= before + 2 && !busy) { reply = msgs[msgs.length - 1]!; if (reply.trim().length > 5) break; }
        }
        const msgs = await w.f.locator('[data-testid="chat-message"]').allInnerTexts();
        s.greetingExchange = { before, after: msgs.length, lastUser: msgs[msgs.length - 2]?.slice(0, 80), reply: reply.slice(0, 400), ms: Date.now() - t0 };
        await page.screenshot({ path: `${outDir}/${label}-reply.png` });
        check(reply.trim().length > 5 && !/오류|error|문제가 발생|잠시 후 다시/i.test(reply), `${label}: greeting reply abnormal: ${reply.slice(0, 200)}`);
      }
      // close again and confirm the launcher comes back
      await w.f.click('button[aria-label="상담창 닫기"]').catch(() => {});
      await page.waitForTimeout(600);
      (s.widget as any).reclosed = await iframeBox(page);
    } else {
      await page.screenshot({ path: `${outDir}/${label}.png` });
    }
    s.errors = errors;
    scenarios[label] = s;
    await page.close();
  }
  // soft navigation: home → portfolio via the header link; the loader must not duplicate
  const page = await ctx.newPage();
  await page.goto(ORIGIN + "/", { waitUntil: "load" });
  await page.waitForTimeout(expectWidget ? 4000 : 1000);
  if (vp.name === "desktop") await page.click('a.i1-header__link[data-nav="portfolio"]');
  else await page.goto(ORIGIN + "/portfolio", { waitUntil: "load" });
  await page.waitForURL(/\/portfolio$/);
  await page.waitForTimeout(3000);
  const nav = await page.evaluate(() => ({ url: location.pathname, scripts: document.querySelectorAll('script[src="https://boostchat.co.kr/widget.js"]').length, iframes: document.querySelectorAll("iframe[data-boost-chat-frame]").length }));
  scenarios[`${vp.name}-softnav`] = nav;
  if (vp.name === "desktop") check(expectWidget ? nav.scripts === 1 && nav.iframes === 1 : nav.iframes === 0, `desktop soft nav: ${JSON.stringify(nav)}`);
  await page.close();
  await ctx.close();
}
result.scenarios = scenarios;

// ── 3. every internal link seen on the checked pages answers 200 ────────────────────────────────
const linkStatus: Record<string, number> = {};
for (const l of [...allLinks].sort()) {
  const r = await fetch(l, { redirect: "manual" });
  linkStatus[l.replace(ORIGIN, "")] = r.status;
  await r.arrayBuffer();
  check(r.status === 200, `link ${l}: ${r.status}`);
}
result.links = linkStatus;

await browser.close();
result.failures = failures;
result.finishedAt = new Date().toISOString();
writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ mode, failures, raw: raw.map((r: any) => `${r.path} ${r.status} tags=${r.widgetTags}`).join(" | ") }, null, 1));
process.exit(failures.length ? 1 : 0);
