// Candidate soft-navigation check under the production origin (local interception only).
import { chromium } from "/Users/woops/projects/web-recon-track-b/node_modules/playwright/index.mjs";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const siteDir = process.argv[2]!;
const ORIGIN = "https://interior-demo.boostweb.co.kr";
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/x-component", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const fileFor = (p: string) => { for (const c of [p === "/" ? "/index.html" : p, `${p}.html`]) { const f = path.join(siteDir, decodeURIComponent(c)); if (existsSync(f) && statSync(f).isFile()) return f; } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const misses: string[] = []; const rsc: string[] = []; const errors: string[] = [];
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  const f = fileFor(u.pathname);
  if (/\.txt$/.test(u.pathname) || u.searchParams.has("_rsc")) rsc.push(`${u.pathname}${f ? "" : " (404)"}`);
  if (!f) { misses.push(u.pathname); return route.fulfill({ status: 404, body: "nf" }); }
  await route.fulfill({ status: 200, body: readFileSync(f), headers: { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" } });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
await page.goto(ORIGIN + "/", { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.evaluate(() => ((window as any).__marker = 1));
const steps: unknown[] = [];
for (const sel of ['a.i1-header__link[data-nav="portfolio"]', 'a[href^="/portfolio/"]', 'a.i1-header__link[data-nav="about"]', 'a.i1-header__cta[data-nav="contact"]', 'a.i1-header__brand']) {
  await page.locator(sel).first().click();
  await page.waitForLoadState("load"); await page.waitForTimeout(2000);
  steps.push(await page.evaluate(() => ({ path: location.pathname, soft: (window as any).__marker === 1, h1: document.querySelector("h1")?.textContent?.slice(0, 30), iframes: document.querySelectorAll("iframe[data-boost-chat-frame]").length, scripts: document.querySelectorAll('script[src="https://boostchat.co.kr/widget.js"]').length })));
}
console.log(JSON.stringify({ steps, misses, rsc: [...new Set(rsc)], errors }, null, 1));
await browser.close();
