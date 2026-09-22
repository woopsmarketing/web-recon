/**
 * IA review fixes smoke (interior-01 1.5.1) — drives the BUILT packages in a real browser. Builds nothing.
 *
 *   A. layout: /, /portfolio, a detail, /3d-portfolio, /about, /contact at 320 / 390 / 899 / 900 /
 *      1440 — HTTP 200, horizontal overflow 0, console / page errors 0, no non-local request;
 *   B. M1 long mailto: the message textarea caps at 500 characters; a long Korean inquiry (whose
 *      mailto: would exceed 2,000 characters) opens NO mail link, the status says it is too long /
 *      nothing was sent and names the address (no success wording), the address + the composed
 *      text (subject, blank line, body) are shown and the select button selects all of it; no
 *      overflow with the fallback shown (320 / 390 / 1440); a short inquiry afterwards hands off
 *      again (≤ 2,000 characters) and the fallback goes away;
 *   C. m1: the message's own line breaks (LF and CRLF typed) reach the mailto body as CRLF, no lone LF;
 *   D. m2: every press re-creates the status text node (a live-region addition each time), for the
 *      hand-off and for the too-long status alike;
 *   E. m3: 390 menu open → viewport to 1000 → the menu closes and focus is on a rendered element in
 *      the header (not <body>, not the hidden menu button); Esc at 390 still returns focus to the button;
 *   F. m4: sitemap.xml lists /contact on the demo and fixture-small (email) and not on fixture-empty
 *      (no channel), whose /contact page still answers 200 with the unavailable line.
 *
 * Usage: tsx scripts/template-platform-ia151-smoke.ts [outDir]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const root = process.cwd();
const outDir = path.resolve(process.argv[2] ?? "docs/result/static-deployment-foundation/proof-151");
const SITE = "boost-interior-demo";
const EMAIL = "hello@boost-interior-demo.example";
const DETAIL = "/portfolio/suseong-white-34py-apartment-remodeling";
const ROUTES = ["/", "/portfolio", DETAIL, "/3d-portfolio", "/about", "/contact"];
const WIDTHS = [320, 390, 899, 900, 1440];
const SUCCESS = /접수되었|접수 완료|전송되었|전송 완료|완료되었/;
const TOO_LONG = `문의 내용이 길어 메일 앱으로 열 수 없습니다. 아직 전송된 것은 아닙니다. 아래 내용을 복사해 ${EMAIL}로 보내 주세요.`;
const AFTER = `메일 앱에서 내용을 확인한 뒤 보내 주세요. 아직 전송된 것은 아닙니다. 메일 앱이 열리지 않으면 ${EMAIL}로 보내 주세요.`;

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
async function siteOf(siteId: string) {
  const ptr = JSON.parse(await readFile(path.join(root, "data/site-builds", siteId, "current.json"), "utf8")) as { packageDir: string; buildInputId: string };
  const record = JSON.parse(await readFile(path.join(root, ptr.packageDir, "build-record.json"), "utf8")) as { template: { releaseId: string } };
  const siteRoot = path.join(root, ptr.packageDir, "site");
  const server = await serveStatic(siteRoot);
  return { siteRoot, releaseId: record.template.releaseId, buildInputId: ptr.buildInputId, server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
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
const demo = await siteOf(SITE);
console.log(`site ${SITE} · release ${demo.releaseId} · build ${demo.buildInputId.slice(0, 12)}`);
const browser: Browser = await chromium.launch();
interface Problems { console: string[]; nonLocal: string[]; status: number; requests: string[] }
function context(width: number, height = 800): Promise<BrowserContext> {
  const mobile = width < 900;
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
}
async function open(page: Page, url: string, base = demo.origin): Promise<Problems> {
  const problems: Problems = { console: [], nonLocal: [], status: 0, requests: [] };
  await page.addInitScript("window.__name = (f) => f;"); // tsx/esbuild __name shim for evaluated code
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
  await page.waitForTimeout(450); // hydration buffer
  return problems;
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
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
/** count live-region additions (child nodes added to the status element) */
async function watchStatus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __statusAdds: number };
    w.__statusAdds = 0;
    new MutationObserver((records) => {
      for (const r of records) w.__statusAdds += r.addedNodes.length;
    }).observe(document.querySelector("[data-inquiry-status]")!, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __statusAdds: number }).__statusAdds);
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
// ~ 300 Korean characters: well under the 500 cap, far over the 2,000-character mailto limit once encoded
const LONG_KO = Array.from({ length: 12 }, (_, i) => `${i + 1}번째 요청: 거실과 주방 수납을 늘리고 싶습니다.`).join("\n");

// =====================================================================================
console.log("\n[A] layout: 6 routes × 5 widths");
for (const width of WIDTHS) {
  const ctx = await context(width);
  for (const url of ROUTES) {
    const page = await ctx.newPage();
    const p = await open(page, url);
    const overflow = await overflowOf(page);
    check(`${width} ${url}: 200, overflow 0, console 0, non-local 0`, p.status === 200 && overflow <= 0 && p.console.length === 0 && p.nonLocal.length === 0, { status: p.status, overflow, console: p.console, nonLocal: p.nonLocal });
    await page.close();
  }
  await ctx.close();
}

// =====================================================================================
console.log("\n[B] M1 long mailto guard + copy fallback");
for (const width of [320, 390, 1440]) {
  const ctx = await context(width);
  const page = await ctx.newPage();
  const problems = await open(page, "/contact");
  const handoffs = await recordHandoffs(page);
  const caps = await page.evaluate(() => ({
    message: document.querySelector<HTMLTextAreaElement>("[name=message]")!.maxLength,
    oneLine: Array.from(document.querySelectorAll<HTMLInputElement>("input[name]")).map((i) => i.maxLength),
  }));
  check(`${width}: caps — message 500, each one-line field 100`, caps.message === 500 && caps.oneLine.length === 5 && caps.oneLine.every((n) => n === 100), caps);
  if (width === 390) {
    // typing past the cap: the browser stops at 500 characters
    await page.focus("[name=message]");
    for (let i = 0; i < 6; i++) await page.keyboard.insertText("다".repeat(100));
    const len = await page.evaluate(() => document.querySelector<HTMLTextAreaElement>("[name=message]")!.value.length);
    check("390: typing 600 characters into the message stops at 500", len === 500, len);
  }
  await fillRequired(page, LONG_KO);
  const requestsBefore = problems.requests.length;
  await submit(page);
  const st = await status(page);
  const fb = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-inquiry-fallback]");
    const copy = document.querySelector<HTMLTextAreaElement>("[data-inquiry-copy]");
    const link = document.querySelector<HTMLAnchorElement>("[data-inquiry-fallback] a[href^='mailto:']");
    const r = box?.getBoundingClientRect();
    return {
      shown: !!box && !!r && r.width > 0 && r.height > 0,
      address: link?.getAttribute("href") ?? null,
      addressText: link?.textContent ?? null,
      to: document.querySelector(".i1-form__fallback-to")?.textContent ?? null,
      label: document.querySelector('label[for="i1-inquiry-copy"]')?.textContent ?? null,
      readOnly: copy?.readOnly ?? null,
      text: copy?.value ?? null,
      hiddenHref: document.querySelector("[data-inquiry-mailto]")?.getAttribute("href") ?? null,
    };
  });
  const expectedText = `[견적 문의] 홍길동님\n\n이름: 홍길동\n연락처: 010-1234-5678\n\n문의 내용:\n${LONG_KO}`;
  const encodedLength = `mailto:${EMAIL}?subject=${encodeURIComponent("[견적 문의] 홍길동님")}&body=${encodeURIComponent(expectedText.split("\n\n").slice(1).join("\n\n").replace(/\n/g, "\r\n"))}`.length;
  check(`${width}: the would-be mailto is ${encodedLength} characters (> 2,000) — no mail link opened, hidden link has no href`, encodedLength > 2000 && (await handoffs()).length === 0 && fb.hiddenHref === null, { encodedLength, handoffs: await handoffs(), hiddenHref: fb.hiddenHref });
  check(`${width}: status = too long + nothing sent + the address; no success wording`, st === TOO_LONG && !SUCCESS.test(st), st);
  check(`${width}: fallback shows the address (mailto link, no body) and the composed text read-only`, fb.shown && fb.address === `mailto:${EMAIL}` && fb.addressText === EMAIL && fb.to === `이메일: ${EMAIL}` && fb.label === "문의 내용 (복사용)" && fb.readOnly === true, fb);
  check(`${width}: copy text = subject, blank line, the labelled body with the whole message`, fb.text === expectedText, { got: fb.text?.slice(0, 200), want: expectedText.slice(0, 200) });
  if (await page.$("[data-inquiry-select]")) await page.click("[data-inquiry-select]");
  const sel = await page.evaluate(() => {
    const t = document.querySelector<HTMLTextAreaElement>("[data-inquiry-copy]");
    if (!t) return { focused: false, start: -1, end: -1, len: 0 };
    return { focused: document.activeElement === t, start: t.selectionStart, end: t.selectionEnd, len: t.value.length };
  });
  check(`${width}: select button focuses and selects the whole text`, sel.focused && sel.start === 0 && sel.end === sel.len && sel.len > 0, sel);
  const overflow = await overflowOf(page);
  check(`${width}: fallback shown — overflow 0, no network request, no console error, still on /contact`, overflow <= 0 && problems.requests.length === requestsBefore && problems.console.length === 0 && new URL(page.url()).pathname.startsWith("/contact"), { overflow, req: problems.requests.slice(requestsBefore), console: problems.console });
  if (await page.$("[data-inquiry-fallback]")) await page.locator("[data-inquiry-fallback]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, `contact-too-long-${width}.png`), fullPage: true });
  // a short inquiry afterwards: hand-off again, the fallback goes away
  await page.fill("[name=message]", "견적 부탁드립니다.");
  await submit(page);
  const h = await handoffs();
  check(`${width}: a short inquiry afterwards hands off (1 link, ≤ 2,000 chars), status = the hand-off text, fallback gone`, h.length === 1 && h[0]!.length <= 2000 && (await status(page)) === AFTER && (await page.$("[data-inquiry-fallback]")) === null, { h: h.map((x) => x.length), st: await status(page) });
  await ctx.close();
}

// =====================================================================================
console.log("\n[C] m1 CRLF message body   [D] m2 re-announced status");
{
  const ctx = await context(390);
  const page = await ctx.newPage();
  const problems = await open(page, "/contact");
  const handoffs = await recordHandoffs(page);
  const adds = await watchStatus(page);
  await fillRequired(page, "첫 줄\n둘째 줄\r\n셋째 줄");
  await submit(page);
  const body = new URL((await handoffs())[0] ?? "mailto:x").searchParams.get("body") ?? "";
  check("m1: message lines reach the body as CRLF (typed LF and CRLF), no lone LF / CR anywhere", body.endsWith("문의 내용:\r\n첫 줄\r\n둘째 줄\r\n셋째 줄") && !/(^|[^\r])\n/.test(body) && !/\r(?!\n)/.test(body), JSON.stringify(body));
  const a1 = await adds();
  const node1 = await page.evaluate(() => {
    const w = window as unknown as { __n1: Node | null };
    w.__n1 = document.querySelector("[data-inquiry-status]")!.firstChild;
    return !!w.__n1;
  });
  await submit(page);
  const a2 = await adds();
  const replaced = await page.evaluate(() => (window as unknown as { __n1: Node | null }).__n1 !== document.querySelector("[data-inquiry-status]")!.firstChild);
  await submit(page);
  const a3 = await adds();
  check("m2: every hand-off press re-creates the status text (3 presses → 3 live-region additions, a new node each time), same text", node1 && replaced && a1 === 1 && a2 === 2 && a3 === 3 && (await status(page)) === AFTER && (await handoffs()).length === 3, { a1, a2, a3, replaced });
  await page.fill("[name=message]", LONG_KO);
  await submit(page);
  await submit(page);
  const a5 = await adds();
  check("m2: repeated too-long presses are announced each time too (2 more additions), no hand-off", a5 - a3 >= 2 && (await status(page)) === TOO_LONG && (await handoffs()).length === 3, { a5, a3 });
  check("C/D: no console error", problems.console.length === 0, problems.console);
  await ctx.close();
}

// =====================================================================================
console.log("\n[E] m3 focus after the menu closes");
{
  const ctx = await context(390);
  const page = await ctx.newPage();
  const problems = await open(page, "/about");
  await page.click("[data-menu-button]");
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const esc = await page.evaluate(() => document.activeElement?.hasAttribute("data-menu-button") ?? false);
  check("390: Esc closes the menu and focus returns to the (visible) menu button", esc);
  await page.click("[data-menu-button]");
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(400);
  const f = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return {
      menuOpen: !!document.querySelector("dialog[data-menu]"),
      tag: a?.tagName ?? null,
      isBody: a === document.body || a === null,
      inHeader: !!a?.closest("header"),
      rendered: !!a && a.getClientRects().length > 0,
      isMenuButton: a?.hasAttribute("data-menu-button") ?? false,
      desc: a ? `${a.tagName.toLowerCase()}.${a.className} ${a.getAttribute("href") ?? ""}` : null,
    };
  });
  check("resize 390 → 1000 with the menu open: it closes and focus is on a rendered header control (not <body>, not the hidden button)", !f.menuOpen && !f.isBody && f.inHeader && f.rendered && !f.isMenuButton, f);
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("header") !== null && document.activeElement !== document.body);
  check("…and Tab continues from there through the header", next);
  check("E: no console error", problems.console.length === 0, problems.console);
  console.log(`       focus landed on: ${f.desc}`);
  await ctx.close();
}

// =====================================================================================
console.log("\n[F] m4 sitemap vs contact channel");
{
  const results: Record<string, { contactListed: boolean; contactStatus: number; locs: number }> = {};
  for (const s of [SITE, "fixture-small", "fixture-empty"]) {
    const site = s === SITE ? demo : await siteOf(s);
    const xml = await (await fetch(`${site.origin}/sitemap.xml`)).text();
    const res = await fetch(`${site.origin}/contact`);
    results[s] = { contactListed: /<loc>[^<]*\/contact<\/loc>/.test(xml), contactStatus: res.status, locs: (xml.match(/<loc>/g) ?? []).length };
    if (s === "fixture-empty") {
      const body = await res.text();
      check("fixture-empty: /contact still answers 200 with the unavailable line and no form", res.status === 200 && body.includes("Contact details are not available yet.") && !body.includes("data-inquiry-form"));
    }
    if (site !== demo) site.server.close();
  }
  check("sitemap lists /contact on the demo and fixture-small (email), not on fixture-empty (no channel)", results[SITE]!.contactListed && results["fixture-small"]!.contactListed && !results["fixture-empty"]!.contactListed, results);
  console.log(`       ${JSON.stringify(results)}`);
}

await browser.close();
demo.server.close();
console.log(`\n${passed} / ${passed + failed.length} passed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
