/**
 * Public demo SEO + contact address smoke (interior-01 1.5.2) — drives the BUILT demo package in a
 * real browser. Builds nothing. The expected address and origin are read from the canonical site
 * data (content/business.json contact.email, site.json identity.publicOrigin), never typed here.
 *
 *   A. served <head> of /, /portfolio, a detail, /3d-portfolio, /about, /contact: exactly one
 *      robots meta = noindex; exactly one canonical = the public origin + the path; og:title =
 *      document.title, og:description = the meta description, og:url = the canonical, og:image an
 *      absolute URL on the public origin that answers 200 here; robots.txt allows the crawl and
 *      points at the origin's sitemap; every sitemap <loc> is on the origin; the 404 page is
 *      noindex with no canonical / og:url;
 *   B. the contact address at 390 (mobile) and 1440 (desktop): /contact shows it as a mailto link,
 *      the footer shows it on / and /contact; a normal inquiry hands exactly one mailto: to the mail
 *      app whose recipient is the address and whose body carries the message (status names the
 *      address, no success wording, no network request); a long Korean inquiry opens nothing, says
 *      so (no success wording), and shows the address + the whole composed text to copy; overflow
 *      0 and no console error throughout.
 *
 * Usage: tsx scripts/template-platform-ia152-smoke.ts [outDir]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const root = process.cwd();
const outDir = path.resolve(process.argv[2] ?? "docs/result/outreach-demo-151-to-152/proof-152");
const SITE = "boost-interior-demo";
const readJson = async (f: string) => JSON.parse(await readFile(path.join(root, f), "utf8"));
const EMAIL: string = (await readJson(`data/sites/${SITE}/content/business.json`)).data.contact.email;
const ORIGIN: string = (await readJson(`data/sites/${SITE}/site.json`)).identity.publicOrigin;
const DETAIL = "/portfolio/suseong-white-34py-apartment-remodeling";
const ROUTES = ["/", "/portfolio", DETAIL, "/3d-portfolio", "/about", "/contact"];
const SUCCESS = /접수되었|접수 완료|전송되었|전송 완료|완료되었/;
// the status copy is Site Data too (contact.page slots; the Template substitutes {email} = the address)
const CONTACT_SLOTS = JSON.parse(await readFile(path.join(root, "data/sites", SITE, "slots.json"), "utf8")).values["contact.page"] as Record<string, string>;
const TOO_LONG = CONTACT_SLOTS.tooLong!.replaceAll("{email}", EMAIL);
const AFTER = CONTACT_SLOTS.afterSubmit!.replaceAll("{email}", EMAIL);
// ~ 300 Korean characters: well under the 500 cap, far over the 2,000-character mailto limit once encoded
const LONG_KO = Array.from({ length: 12 }, (_, i) => `${i + 1}번째 요청: 거실과 주방 수납을 늘리고 싶습니다.`).join("\n");

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
        createReadStream(path.join(siteRoot, "404.html")).pipe(res);
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
    console.log(`  FAIL ${name}${detail === undefined ? "" : `\n       ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`);
  }
}

await mkdir(outDir, { recursive: true });
const ptr = await readJson(`data/site-builds/${SITE}/current.json`);
const record = await readJson(path.join(ptr.packageDir, "build-record.json"));
const server = await serveStatic(path.join(root, ptr.packageDir, "site"));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
console.log(`site ${SITE} · release ${record.template.releaseId} · build ${ptr.buildInputId.slice(0, 12)} · origin ${ORIGIN} · address ${EMAIL}`);
const browser: Browser = await chromium.launch();
interface Problems { console: string[]; nonLocal: string[]; status: number; requests: string[] }
function context(width: number, height = 844): Promise<BrowserContext> {
  const mobile = width < 900;
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
}
async function open(page: Page, url: string): Promise<Problems> {
  const problems: Problems = { console: [], nonLocal: [], status: 0, requests: [] };
  await page.addInitScript("window.__name = (f) => f;"); // tsx/esbuild __name shim for evaluated code
  page.on("console", (m) => {
    if (m.type() === "error") problems.console.push(m.text());
  });
  page.on("pageerror", (e) => problems.console.push(String(e)));
  page.on("request", (r) => {
    problems.requests.push(r.url());
    if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) problems.nonLocal.push(r.url());
  });
  const res = await page.goto(BASE + url, { waitUntil: "networkidle" });
  problems.status = res?.status() ?? 0;
  await page.waitForTimeout(450); // hydration buffer
  return problems;
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const headOf = (page: Page) =>
  page.evaluate(() => {
    const metas = (sel: string) => Array.from(document.head.querySelectorAll<HTMLMetaElement>(sel)).map((m) => m.content);
    return {
      title: document.title,
      description: metas('meta[name="description"]'),
      robots: metas('meta[name="robots"]'),
      canonical: Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')).map((l) => l.getAttribute("href")),
      ogTitle: metas('meta[property="og:title"]'),
      ogDescription: metas('meta[property="og:description"]'),
      ogUrl: metas('meta[property="og:url"]'),
      ogType: metas('meta[property="og:type"]'),
      ogImage: metas('meta[property="og:image"]'),
    };
  });
/** record mailto hand-offs instead of leaving for a mail app */
async function recordHandoffs(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __handoffs: string[] };
    w.__handoffs = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith("mailto:")) w.__handoffs.push(this.href);
      else orig.call(this);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __handoffs: string[] }).__handoffs.slice());
}
async function fillRequired(page: Page, message: string) {
  await page.fill("[name=name]", "홍길동");
  await page.fill("[name=phone]", "010-1234-5678");
  await page.fill("[name=message]", message);
}
const submit = async (page: Page) => {
  await page.click("[data-inquiry-submit]");
  await page.waitForTimeout(250);
};
const status = async (page: Page) => (await page.textContent("[data-inquiry-status]")) ?? "";
const footerAddress = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>("footer a[href^='mailto:']");
    const r = a?.getBoundingClientRect();
    return { href: a?.getAttribute("href") ?? null, text: a?.textContent ?? null, rendered: !!r && r.width > 0 && r.height > 0 };
  });
const results: Record<string, unknown> = { site: SITE, releaseId: record.template.releaseId, buildInputId: ptr.buildInputId, origin: ORIGIN, email: EMAIL };
check(`status copy names the address as "${EMAIL} 주소로" (no raw {email}, no "…com로")`, [AFTER, TOO_LONG].every((t) => t.includes(`${EMAIL} 주소로 보내 주세요.`) && !t.includes("{email}")), { AFTER, TOO_LONG });

// =====================================================================================
console.log("\n[A] served <head>, robots.txt, sitemap.xml");
{
  const ctx = await context(1440, 900);
  const heads: Record<string, unknown> = {};
  for (const url of ROUTES) {
    const page = await ctx.newPage();
    const p = await open(page, url);
    const h = await headOf(page);
    heads[url] = h;
    const canonical = h.canonical[0] ?? "";
    const want = `${ORIGIN}${url === "/" ? "/" : url}`;
    check(`${url}: 200, exactly one robots meta = "noindex"`, p.status === 200 && h.robots.length === 1 && h.robots[0] === "noindex", h.robots);
    check(`${url}: exactly one canonical = ${want} (URL-equal)`, h.canonical.length === 1 && new URL(canonical).href === want, h.canonical);
    check(`${url}: og:title = <title>, og:description = meta description, og:url = canonical, og:type website`, h.ogTitle.length === 1 && h.ogTitle[0] === h.title && h.description.length === 1 && h.ogDescription[0] === h.description[0] && h.ogUrl.length === 1 && h.ogUrl[0] === canonical && h.ogType[0] === "website", h);
    const img = h.ogImage[0] ?? "";
    const local = img.startsWith(`${ORIGIN}/`) ? await fetch(BASE + new URL(img).pathname) : undefined;
    check(`${url}: og:image is one absolute raster URL on the origin, served 200 here`, h.ogImage.length === 1 && /\.(jpe?g|png|webp|gif)$/.test(img) && local?.status === 200 && (local?.headers.get("content-type") ?? "").startsWith("image/"), { img, status: local?.status });
    check(`${url}: no console error, no non-local request`, p.console.length === 0 && p.nonLocal.length === 0, { console: p.console, nonLocal: p.nonLocal });
    await page.close();
  }
  results.heads = heads;
  const page = await ctx.newPage();
  const p404 = await open(page, "/this-page-does-not-exist");
  const h404 = await headOf(page);
  check("404: noindex (every robots meta), no canonical, no og:url", p404.status === 404 && h404.robots.length >= 1 && h404.robots.every((r) => r.split(/,\s*/).includes("noindex")) && h404.canonical.length === 0 && h404.ogUrl.length === 0, { status: p404.status, h404 });
  results.head404 = h404;
  await page.close();
  await ctx.close();
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots.txt allows the crawl (so the noindex can be read) and points at the origin's sitemap", robots === `User-Agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`, robots);
  const locs = [...(await (await fetch(`${BASE}/sitemap.xml`)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  check(`sitemap.xml: every <loc> (${locs.length}) is on ${ORIGIN}; / and the six smoke routes are listed`, locs.length > 0 && locs.every((l) => new URL(l).origin === ORIGIN) && ROUTES.every((r) => locs.includes(`${ORIGIN}${r}`)), locs);
  results.robotsTxt = robots;
  results.sitemapLocs = locs.length;
}

// =====================================================================================
console.log("\n[B] the contact address: display, normal hand-off, long-inquiry fallback");
for (const width of [390, 1440]) {
  const ctx = await context(width);
  const home = await ctx.newPage();
  const hp = await open(home, "/");
  const hf = await footerAddress(home);
  check(`${width} /: the footer shows the address as its mailto link`, hf.href === `mailto:${EMAIL}` && hf.text === EMAIL && hf.rendered && hp.console.length === 0, hf);
  await home.close();
  const page = await ctx.newPage();
  const problems = await open(page, "/contact");
  const direct = await page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>("main a[href^='mailto:']");
    const r = a?.getBoundingClientRect();
    return { href: a?.getAttribute("href") ?? null, text: a?.textContent ?? null, rendered: !!r && r.width > 0 && r.height > 0 };
  });
  check(`${width} /contact: the page shows the address as a mailto link`, direct.href === `mailto:${EMAIL}` && direct.text === EMAIL && direct.rendered, direct);
  const cf = await footerAddress(page);
  check(`${width} /contact: the footer shows the same address`, cf.href === `mailto:${EMAIL}` && cf.text === EMAIL, cf);
  const handoffs = await recordHandoffs(page);
  // normal inquiry
  await fillRequired(page, "34평 아파트 전체 리모델링 견적 부탁드립니다.\n입주는 3월 예정입니다.");
  const before = problems.requests.length;
  await submit(page);
  const h = await handoffs();
  const u = h[0] ? new URL(h[0]) : undefined;
  const st = await status(page);
  check(`${width}: a normal inquiry hands exactly one mailto: to the mail app, recipient = ${EMAIL}`, h.length === 1 && u?.protocol === "mailto:" && decodeURIComponent(u.pathname) === EMAIL, h);
  check(`${width}: …its subject names the visitor and its body carries the whole message (CRLF lines)`, u?.searchParams.get("subject") === "[견적 문의] 홍길동님" && (u?.searchParams.get("body") ?? "").endsWith("문의 내용:\r\n34평 아파트 전체 리모델링 견적 부탁드립니다.\r\n입주는 3월 예정입니다."), { subject: u?.searchParams.get("subject"), body: u?.searchParams.get("body") });
  check(`${width}: …status names the address and claims nothing (no success wording), no network request`, st === AFTER && !SUCCESS.test(st) && problems.requests.length === before, { st, req: problems.requests.slice(before) });
  // long Korean inquiry
  await page.fill("[name=message]", LONG_KO);
  await submit(page);
  const st2 = await status(page);
  const fb = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-inquiry-fallback]");
    const copy = document.querySelector<HTMLTextAreaElement>("[data-inquiry-copy]");
    const link = document.querySelector<HTMLAnchorElement>("[data-inquiry-fallback] a[href^='mailto:']");
    const r = box?.getBoundingClientRect();
    return { shown: !!box && !!r && r.width > 0 && r.height > 0, href: link?.getAttribute("href") ?? null, text: link?.textContent ?? null, readOnly: copy?.readOnly ?? null, copy: copy?.value ?? null };
  });
  const expectedCopy = `[견적 문의] 홍길동님\n\n이름: 홍길동\n연락처: 010-1234-5678\n\n문의 내용:\n${LONG_KO}`;
  check(`${width}: a long Korean inquiry opens nothing (still one hand-off) and says so — no success wording`, (await handoffs()).length === 1 && st2 === TOO_LONG && !SUCCESS.test(st2), { st2, handoffs: (await handoffs()).length });
  check(`${width}: …the fallback shows ${EMAIL} as a mailto link and the whole composed text read-only`, fb.shown && fb.href === `mailto:${EMAIL}` && fb.text === EMAIL && fb.readOnly === true && fb.copy === expectedCopy, { ...fb, copy: fb.copy?.slice(0, 120) });
  const overflow = await overflowOf(page);
  check(`${width}: overflow 0, no console error, no non-local request, still on /contact`, overflow <= 0 && problems.console.length === 0 && problems.nonLocal.length === 0 && new URL(page.url()).pathname.startsWith("/contact"), { overflow, console: problems.console, nonLocal: problems.nonLocal });
  if (await page.$("[data-inquiry-fallback]")) await page.locator("[data-inquiry-fallback]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, `contact-fallback-${width}.png`), fullPage: true });
  results[`contact${width}`] = { direct, footer: cf, handoff: h[0], status: st, longStatus: st2, fallback: { ...fb, copy: `${fb.copy?.length ?? 0} chars` } };
  await ctx.close();
}

await browser.close();
server.close();
results.passed = passed;
results.failed = failed;
await writeFile(path.join(outDir, "smoke-ia152.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${passed} / ${passed + failed.length} passed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
