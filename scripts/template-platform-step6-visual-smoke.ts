/**
 * Step 6 (Demo Customer Content Proof) visual smoke — the boost-interior-demo site as BUILT
 * (data/site-builds/boost-interior-demo/current.json), served from a local nginx-`try_files`-style
 * static server (self-contained; same conventions as the polish smoke). Builds nothing.
 *
 * Every visit: expected HTTP status, 0 console/page errors, 0 non-local requests, 0 failed
 * subresources, 0 broken images (after scrolling the whole page), 0 horizontal overflow,
 * <html lang="ko-KR">, no U+FFFD, the site-wide floating CTA (one seat, position:fixed, Korean
 * label, mailto: destination), and Korean wrapping measurements:
 *   - display text (headings, hero copy, card titles, labels, buttons): a line break INSIDE a word
 *     is reported per element ("bad wrapping"); it is a measurement AND a check;
 *   - body paragraphs: measured only (browsers break Korean anywhere unless the stylesheet says
 *     keep-all; that is Template CSS, which this step may not change).
 * /portfolio: the filter contract against the Korean demo content — keyword, type, area, style,
 * price, sort, combined, zero result, reset — with HAND-COMPUTED expectations (not the evaluator).
 *
 *   tsx scripts/template-platform-step6-visual-smoke.ts [outDir] [--site <siteId>]
 * outDir defaults to docs/result/recon-template-platform-step6-demo/screens.
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const argv = process.argv.slice(2);
let outDirArg: string | undefined;
let SITE = "boost-interior-demo";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--site") SITE = argv[++i] ?? SITE;
  else if (outDirArg === undefined) outDirArg = argv[i];
}
const root = process.cwd();
const outDir = path.resolve(outDirArg ?? "docs/result/recon-template-platform-step6-demo/screens");

// ---------------------------------------------------------- static server
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
        const nf = path.join(siteRoot, "404.html");
        if (await isFile(nf)) createReadStream(nf).pipe(res);
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

// ------------------------------------------------------------------ views
const VIEWPORTS = {
  m320: { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true },
  m390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  t800: { width: 800, height: 900, deviceScaleFactor: 1, isMobile: false },
  d1000: { width: 1000, height: 800, deviceScaleFactor: 1, isMobile: false },
  d1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  d1920: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false },
} as const;
type Vp = keyof typeof VIEWPORTS;

interface Check { name: string; pass: boolean; detail?: string }
interface Row { route: string; viewport: Vp; name: string; screenshots: string[]; checks: Check[]; measurements: Record<string, unknown> }
const rows: Row[] = [];

const FLAGSHIP = "/portfolio/suseong-white-34py-apartment-remodeling";
const BEFORE_AFTER = "/portfolio/buk-32py-kitchen-bathroom-renewal";
const CTA_LABEL = "상담 문의";

/** Elements whose text is DISPLAY text: a break inside a word there reads as broken typography. */
const DISPLAY_SELECTOR = "h1, h2, h3, h4, .i1-hero__headline, .i1-hero__text, .i1-card__title, button, a, label, legend, dt, .i1-pfilter__count";

interface Visit { route: string; vp: Vp; name: string; status?: number; shot?: boolean; run?: (page: Page, row: Row) => Promise<void> }

async function visit(browser: Browser, origin: string, v: Visit) {
  const vp = VIEWPORTS[v.vp];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.isMobile, locale: "ko-KR" });
  await ctx.addInitScript("window.__name = (f) => f;");
  const page = await ctx.newPage();
  const row: Row = { route: v.route, viewport: v.vp, name: v.name, screenshots: [], checks: [], measurements: {} };
  const check = (name: string, pass: boolean, detail?: string) => {
    row.checks.push({ name, pass, detail });
    if (!pass) console.log(`     FAIL ${v.route} ${v.vp} :: ${name}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
  };
  const consoleErrors: string[] = [], pageErrors: string[] = [], nonLocal: string[] = [], failed: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !(v.status === 404 && /404/.test(m.text()))) consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) nonLocal.push(u); });
  page.on("response", (r) => { if (r.status() >= 400 && r.url() !== `${origin}${v.route}`) failed.push(`${r.status()} ${r.url()}`); });

  const res = await page.goto(`${origin}${v.route}`, { waitUntil: "networkidle" });
  check("http-status", res?.status() === (v.status ?? 200), `${res?.status()}`);
  // load every lazy image: walk the page, then return to the top
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += Math.max(200, window.innerHeight / 2)) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(150);

  if (v.run) await v.run(page, row);

  const dom = await page.evaluate((displaySelector) => {
    const imgs = [...document.images];
    // broken = finished loading without pixels; a lazy image that never came into view (a collapsed
    // room group) is "pending" and is verified by fetching it below
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
    const pending = imgs.filter((i) => !i.complete).map((i) => i.currentSrc || i.src);
    const de = document.documentElement;
    const seats = [...document.querySelectorAll<HTMLElement>("[data-section='site.floating-cta']")];
    const link = seats[0]?.querySelector<HTMLAnchorElement>("a[data-floating-cta]");
    // line breaks inside a word, per text node
    const midWord = (el: Element): number => {
      let count = 0;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        let prevTop: number | undefined;
        for (let i = 0; i < text.length; i++) {
          if (/\s/.test(text[i]!)) { prevTop = undefined; continue; }
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const r = range.getClientRects()[0];
          if (!r || r.width === 0) continue;
          // a wrap after punctuation ("수납·" | "동선") or before an opening bracket is a normal break opportunity
          if (prevTop !== undefined && r.top - prevTop > r.height * 0.5 && !/[·\-\/,.:;!?)\]]/.test(text[i - 1]!) && !/[(\[]/.test(text[i]!)) count++;
          prevTop = r.top;
        }
      }
      return count;
    };
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const display: { text: string; breaks: number }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll(displaySelector)) {
      if (!visible(el) || [...seen].some((s) => s.contains(el))) continue;
      seen.add(el);
      const b = midWord(el);
      if (b > 0) display.push({ text: (el.textContent ?? "").trim().slice(0, 60), breaks: b });
    }
    let bodyBreaks = 0, bodyParas = 0;
    for (const p of document.querySelectorAll("p, blockquote, dd, li")) {
      if (!visible(p) || p.closest(displaySelector)) continue;
      bodyParas++;
      bodyBreaks += midWord(p);
    }
    return {
      lang: de.lang,
      overflow: de.scrollWidth - window.innerWidth,
      images: imgs.length,
      broken,
      pending,
      replacementChar: (document.body.innerText.match(/�/g) ?? []).length,
      seats: seats.length,
      seatPosition: seats[0] ? getComputedStyle(seats[0]).position : undefined,
      ctaLabel: link?.textContent?.trim(),
      ctaHref: link?.getAttribute("href"),
      display,
      bodyBreaks,
      bodyParas,
      title: document.title,
      wordBreak: getComputedStyle(document.body).wordBreak,
    };
  }, DISPLAY_SELECTOR);

  check("lang-ko-KR", dom.lang === "ko-KR", dom.lang);
  check("horizontal-overflow-0", dom.overflow <= 0, `${dom.overflow}px`);
  const pendingBad: string[] = [];
  for (const src of new Set(dom.pending)) {
    const r = await page.request.get(src);
    if (r.status() !== 200 || !(r.headers()["content-type"] ?? "").startsWith("image/")) pendingBad.push(`${r.status()} ${src}`);
  }
  check("broken-images-0", dom.broken.length === 0 && pendingBad.length === 0, [...dom.broken, ...pendingBad].join(", "));
  check("malformed-text-0", dom.replacementChar === 0, `${dom.replacementChar} U+FFFD`);
  check("console-errors-0", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("page-errors-0", pageErrors.length === 0, pageErrors.join(" | "));
  check("non-local-requests-0", nonLocal.length === 0, nonLocal.join(", "));
  check("failed-subresources-0", failed.length === 0, failed.join(", "));
  check("floating-cta-one-fixed-seat", dom.seats === 1 && dom.seatPosition === "fixed", `${dom.seats} seat(s), position ${dom.seatPosition}`);
  check("floating-cta-korean-label-and-mailto", dom.ctaLabel === CTA_LABEL && (IA150 ? dom.ctaHref === "/contact" : (dom.ctaHref ?? "").startsWith("mailto:")), `${dom.ctaLabel} → ${dom.ctaHref}`);
  check("display-text-no-mid-word-break", dom.display.length === 0, dom.display.map((d) => `"${d.text}" ×${d.breaks}`).join(" · "));
  row.measurements = { ...row.measurements, title: dom.title, images: dom.images, lazyImagesVerifiedByFetch: new Set(dom.pending).size, bodyParagraphs: dom.bodyParas, bodyMidWordBreaks: dom.bodyBreaks, displayMidWordBreaks: dom.display, bodyWordBreak: dom.wordBreak };

  // the seat never covers footer text at the end of the page
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const covered = await page.evaluate(() => {
    const seat = document.querySelector("[data-section='site.floating-cta'] a")?.getBoundingClientRect();
    if (!seat) return [];
    const hits: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("footer") ?? document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim() || n.parentElement?.closest("[data-section='site.floating-cta']")) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.right > seat.left && r.left < seat.right && r.bottom > seat.top && r.top < seat.bottom) hits.push((n.textContent ?? "").trim().slice(0, 40));
    }
    return hits;
  });
  check("floating-cta-covers-no-footer-text", covered.length === 0, covered.join(" | "));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);

  if (v.shot) {
    const base = `${v.name}-${v.vp.slice(1)}`;
    await page.screenshot({ path: path.join(outDir, `${base}-fold.png`) });
    await page.screenshot({ path: path.join(outDir, `${base}.png`), fullPage: true });
    row.screenshots.push(`${base}-fold.png`, `${base}.png`);
  }
  rows.push(row);
  await ctx.close();
  console.log(`  ${row.checks.every((c) => c.pass) ? "ok  " : "FAIL"} ${v.route} @${v.vp} (${row.checks.filter((c) => c.pass).length}/${row.checks.length})`);
}

// ------------------------------------------------------- filter contract
/** HAND-COMPUTED from data/sites/boost-interior-demo/content/projects.json (not from the evaluator). */
const FILTER_CASES: { name: string; query: string; ids: string[]; first?: string }[] = [
  { name: "keyword 수납 (title/summary/scope/keywords)", query: "keyword=수납", ids: ["bi-01", "bi-03", "bi-07"] },
  { name: "keyword 수성구 (location)", query: "keyword=수성구", ids: ["bi-01", "bi-03", "bi-08"] },
  { name: "type 주방·욕실 리뉴얼", query: "type=kitchen-bath", ids: ["bi-04"] },
  { name: "type 전체 리모델링", query: "type=full-remodel", ids: ["bi-01", "bi-02", "bi-03", "bi-05", "bi-07"] },
  { name: "area 30평대", query: "area=30", ids: ["bi-01", "bi-04", "bi-06"] },
  { name: "area 20평 미만 + 50평 이상 (OR inside a group)", query: "area=lt20&area=50plus", ids: ["bi-07", "bi-08"] },
  { name: "style 그레이지", query: "style=그레이지", ids: ["bi-03", "bi-08"] },
  { name: "style 화이트", query: "style=화이트", ids: ["bi-01", "bi-02", "bi-04", "bi-06", "bi-07"] },
  { name: "price 평당 250–300만 원", query: "price=250", ids: ["bi-01", "bi-05", "bi-07"] },
  { name: "sort 넓은 평형순", query: "sort=area-desc", ids: ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08"], first: "suseong-51py-new-apartment-home-styling" },
  { name: "sort 평당 공사비 낮은순", query: "sort=price-asc", ids: ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08"], first: "suseong-51py-new-apartment-home-styling" },
  { name: "combined 전체 리모델링 + 화이트 + 30평대", query: "type=full-remodel&style=화이트&area=30", ids: ["bi-01"] },
  { name: "zero result", query: "keyword=한옥", ids: [] },
];
const SLUG_OF: Record<string, string> = {
  "bi-01": "suseong-white-34py-apartment-remodeling", "bi-02": "dalseo-24py-white-natural-newlywed-home", "bi-03": "suseong-42py-family-storage-remodeling",
  "bi-04": "buk-32py-kitchen-bathroom-renewal", "bi-05": "dong-29py-bright-natural-remodeling", "bi-06": "gyeongsan-34py-entrance-living-remodeling",
  "bi-07": "jung-19py-compact-white-minimal-remodeling", "bi-08": "suseong-51py-new-apartment-home-styling",
};

async function filterContract(browser: Browser, origin: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  await ctx.addInitScript("window.__name = (f) => f;");
  const page = await ctx.newPage();
  const row: Row = { route: "/portfolio?<filters>", viewport: "d1440", name: "filter-contract", screenshots: [], checks: [], measurements: {} };
  const check = (name: string, pass: boolean, detail?: string) => { row.checks.push({ name, pass, detail }); if (!pass) console.log(`     FAIL filter :: ${name} — ${detail ?? ""}`); };
  const cards = () => page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>(".i1-pbrowse__results a[href^='/portfolio/']")].map((a) => a.getAttribute("href")!.replace("/portfolio/", "")).filter((s, i, all) => all.indexOf(s) === i));
  for (const c of FILTER_CASES) {
    await page.goto(`${origin}/portfolio?${c.query}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-result-count]");
    await page.waitForTimeout(120);
    const count = Number(await page.locator("[data-result-count]").getAttribute("data-result-count"));
    const got = await cards();
    const want = c.ids.map((id) => SLUG_OF[id]!);
    check(`filter: ${c.name}`, count === want.length && [...got].sort().join() === [...want].sort().join() && (!c.first || got[0] === c.first), `count ${count}, cards ${got.join(",")}`);
    if (c.ids.length === 0) check("filter: zero result shows the Korean empty state", (await page.locator("[data-filter-empty]").innerText()).includes("조건에 맞는 프로젝트가 없습니다"));
  }
  // UI-driven: type a Korean keyword, then reset
  await page.goto(`${origin}/portfolio`, { waitUntil: "networkidle" });
  await page.locator(".i1-pfilter input[type='search'], .i1-pfilter input[type='text']").first().fill("중문");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const typed = Number(await page.locator("[data-result-count]").getAttribute("data-result-count"));
  check("filter: typed Korean keyword 중문 → bi-01 + bi-06 (scope)", typed === 2 && new URL(page.url()).searchParams.get("keyword") === "중문", `count ${typed}, url ${page.url()}`);
  await page.getByRole("button", { name: "필터 초기화" }).first().click();
  await page.waitForTimeout(300);
  const afterReset = Number(await page.locator("[data-result-count]").getAttribute("data-result-count"));
  check("filter: reset returns all 8 projects and clears the URL", afterReset === 8 && new URL(page.url()).search === "", `count ${afterReset}, url ${page.url()}`);
  rows.push(row);
  await ctx.close();
  console.log(`  ${row.checks.every((c) => c.pass) ? "ok  " : "FAIL"} filter contract (${row.checks.filter((c) => c.pass).length}/${row.checks.length})`);
}

// ------------------------------------------------------------------- main
await mkdir(outDir, { recursive: true });
const ptr = JSON.parse(await readFile(path.join(root, "data/site-builds", SITE, "current.json"), "utf8")) as { packageDir: string; buildInputId?: string };
/** interior-01 ≥ 1.5.0: the floating seat opens the site's /contact page (which writes to the business mailto) */
const builtWith = (JSON.parse(await readFile(path.join(root, ptr.packageDir, "build-record.json"), "utf8")) as { template: { templateVersion: string } }).template.templateVersion;
const IA150 = (() => {
  const [a, b] = builtWith.split(".").map(Number);
  return a! > 1 || (a === 1 && b! >= 5);
})();
const server = await serveStatic(path.join(root, ptr.packageDir, "site"));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await chromium.launch();
try {
  const visits: Visit[] = [
    ...(["m390", "t800", "d1000", "d1440", "d1920"] as const).map((vp): Visit => ({ route: "/", vp, name: "home", shot: true })),
    { route: "/", vp: "m320", name: "home-stress", shot: true },
    { route: "/portfolio", vp: "m390", name: "portfolio", shot: true },
    { route: "/portfolio", vp: "d1440", name: "portfolio", shot: true },
    { route: "/portfolio?type=full-remodel&style=화이트", vp: "m390", name: "portfolio-filtered", shot: true },
    { route: "/portfolio?type=full-remodel&style=화이트", vp: "d1440", name: "portfolio-filtered", shot: true },
    { route: FLAGSHIP, vp: "m390", name: "detail-flagship", shot: true },
    { route: FLAGSHIP, vp: "d1440", name: "detail-flagship", shot: true },
    { route: FLAGSHIP, vp: "t800", name: "detail-flagship" },
    { route: BEFORE_AFTER, vp: "m390", name: "detail-before-after", shot: true },
    { route: BEFORE_AFTER, vp: "d1440", name: "detail-before-after", shot: true },
    { route: "/no-such-page", vp: "m390", name: "not-found", status: 404, shot: true },
    { route: "/no-such-page", vp: "d1440", name: "not-found", status: 404, shot: true },
  ];
  for (const v of visits) await visit(browser, origin, v);
  await filterContract(browser, origin);
} finally {
  await browser.close();
  server.close();
}

const all = rows.flatMap((r) => r.checks.map((c) => ({ ...c, where: `${r.route} @${r.viewport}` })));
const failures = all.filter((c) => !c.pass);
const byName = new Map<string, number>();
for (const f of failures) byName.set(f.name, (byName.get(f.name) ?? 0) + 1);
const report = {
  site: SITE,
  packageDir: ptr.packageDir,
  visits: rows.length,
  checks: all.length,
  passed: all.length - failures.length,
  failed: failures.length,
  failuresByCheck: Object.fromEntries(byName),
  totals: {
    nonLocalRequests: failures.filter((f) => f.name === "non-local-requests-0").length,
    brokenMedia: failures.filter((f) => f.name === "broken-images-0").length,
    horizontalOverflow: failures.filter((f) => f.name === "horizontal-overflow-0").length,
    consoleErrors: failures.filter((f) => f.name === "console-errors-0").length,
    pageErrors: failures.filter((f) => f.name === "page-errors-0").length,
  },
  rows,
};
await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ visits: report.visits, checks: report.checks, passed: report.passed, failed: report.failed, failuresByCheck: report.failuresByCheck }, null, 2));
if (failures.length) process.exit(1);
