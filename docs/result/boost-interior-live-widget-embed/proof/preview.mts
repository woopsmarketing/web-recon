// Pre-publish preview: serve a LOCAL package under the production origin inside this browser only
// (request interception), so the real widget loads against the exact candidate bytes. Nothing is
// published. Sends no chat message.   tsx preview.mts <packageSiteDir> <outDir>
import { chromium, devices } from "/Users/woops/projects/web-recon-track-b/node_modules/playwright/index.mjs";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const [siteDir, outDir] = process.argv.slice(2) as [string, string];
mkdirSync(outDir, { recursive: true });
const ORIGIN = "https://interior-demo.boostweb.co.kr";
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".xml": "application/xml", ".ico": "image/x-icon" };
const fileFor = (p: string) => {
  const clean = decodeURIComponent(p.split("?")[0]!);
  for (const c of [clean === "/" ? "/index.html" : clean, `${clean}.html`]) {
    const f = path.join(siteDir, c);
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  return undefined;
};
const browser = await chromium.launch();
const out: Record<string, unknown> = {};
for (const vp of [
  { name: "desktop", opts: { viewport: { width: 1366, height: 900 } } },
  { name: "mobile390", opts: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
] as const) {
  const ctx = await browser.newContext({ ...(vp.opts as any), locale: "ko-KR" });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const f = fileFor(new URL(route.request().url()).pathname);
    if (!f) return route.fulfill({ status: 404, body: "not found" });
    await route.fulfill({ status: 200, body: readFileSync(f), headers: { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" } });
  });
  for (const p of ["/", "/portfolio/dalseo-34py-value-full-remodeling", "/contact"]) {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    await page.goto(ORIGIN + p, { waitUntil: "load" });
    const label = `${vp.name}${p === "/" ? "-home" : p === "/contact" ? "-contact" : "-detail"}`;
    const el = await page.waitForSelector("iframe[data-boost-chat-frame]", { timeout: 20000 });
    const f = (await el.contentFrame())!;
    await f.waitForSelector('button[aria-label="상담창 열기"]', { state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    const r: Record<string, unknown> = {
      fcta: await page.locator(".i1-fcta").count(),
      scripts: await page.locator('script[src="https://boostchat.co.kr/widget.js"]').count(),
      iframes: await page.locator("iframe[data-boost-chat-frame]").count(),
      closed: await el.boundingBox(),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    };
    // bottom of the page: the launcher must not cover the footer's last line of content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${label}-bottom.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${label}-closed.png` });
    await f.click('button[aria-label="상담창 열기"]');
    await f.waitForSelector('[data-testid="chat-input"]', { state: "visible", timeout: 15000 });
    await page.waitForTimeout(800);
    r.open = await el.boundingBox();
    r.overflowOpen = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${outDir}/${label}-open.png` });
    r.errors = errors;
    out[label] = r;
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
