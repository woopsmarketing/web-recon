/**
 * Slice 1 visual smoke: serve each fixture's CURRENT static package on
 * localhost and load it at desktop 1440 and mobile 390 in Chromium.
 * Checks: page loads, header/footer visible, project card count, no broken
 * images, no console errors / page errors, no non-local requests, no
 * horizontal page overflow. Writes full-page screenshots + a JSON summary.
 *
 *   tsx scripts/template-platform-visual-smoke.ts [outDir]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const repoRoot = process.cwd();
const outDir = path.resolve(process.argv[2] ?? "docs/result/recon-template-platform-slice1/screens");
const SITES = ["fixture-large", "fixture-small", "fixture-empty"];
const EXPECTED_CARDS: Record<string, number> = { "fixture-large": 8, "fixture-small": 4, "fixture-empty": 0 };
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
];
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

function serve(root: string): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    const st = await stat(file).catch(() => undefined);
    if (st?.isDirectory()) file = path.join(file, "index.html");
    else if (!st) {
      const html = `${file}.html`;
      if (await stat(html).catch(() => undefined)) file = html;
    }
    if (!(await stat(file).catch(() => undefined))) {
      res.writeHead(404, { "content-type": "text/html" });
      return void createReadStream(path.join(root, "404.html")).pipe(res);
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

interface Row {
  site: string;
  viewport: string;
  status: number | undefined;
  headerVisible: boolean;
  footerVisible: boolean;
  projectsSection: boolean;
  cards: number;
  expectedCards: number;
  brokenImages: string[];
  consoleErrors: string[];
  nonLocalRequests: string[];
  horizontalOverflow: boolean;
  canvas: string;
  headingFont: string;
  pass: boolean;
  screenshot: string;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const rows: Row[] = [];
try {
  for (const site of SITES) {
    const ptr = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", site, "current.json"), "utf8"));
    const root = path.join(repoRoot, ptr.packageDir, "site");
    const server = await serve(root);
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.isMobile });
        const page = await ctx.newPage();
        // tsx/esbuild wraps named inner functions with __name(); give evaluated code a no-op shim.
        await page.addInitScript("window.__name = (f) => f;");
        const consoleErrors: string[] = [];
        const nonLocal: string[] = [];
        page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
        page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
        page.on("request", (r) => !r.url().startsWith(origin) && !r.url().startsWith("data:") && nonLocal.push(r.url()));
        const resp = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        // Lazy images: scroll through so every card image is requested before checking.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 30));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForLoadState("networkidle");
        const info = await page.evaluate(() => {
          const vis = (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          };
          const imgs = [...document.images];
          const h2 = document.querySelector("h2");
          return {
            header: vis('[data-section="site.header"]'),
            footer: vis('[data-section="site.footer"]'),
            section: !!document.querySelector('[data-section="home.projects-a"]'),
            cards: document.querySelectorAll("[data-project-card]").length,
            broken: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute("src") ?? ""),
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            canvas: getComputedStyle(document.body).backgroundColor,
            headingFont: h2 ? getComputedStyle(h2).fontFamily : getComputedStyle(document.querySelector(".i1-footer__name")!).fontFamily,
          };
        });
        const shot = path.join(outDir, `${site}-${vp.name}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const row: Row = {
          site,
          viewport: vp.name,
          status: resp?.status(),
          headerVisible: info.header,
          footerVisible: info.footer,
          projectsSection: info.section,
          cards: info.cards,
          expectedCards: EXPECTED_CARDS[site]!,
          brokenImages: info.broken,
          consoleErrors,
          nonLocalRequests: nonLocal,
          horizontalOverflow: info.overflow,
          canvas: info.canvas,
          headingFont: info.headingFont,
          pass: false,
          screenshot: path.relative(repoRoot, shot),
        };
        row.pass =
          row.status === 200 &&
          row.headerVisible &&
          row.footerVisible &&
          row.cards === row.expectedCards &&
          row.projectsSection === row.expectedCards > 0 &&
          row.brokenImages.length === 0 &&
          row.consoleErrors.length === 0 &&
          row.nonLocalRequests.length === 0 &&
          !row.horizontalOverflow;
        rows.push(row);
        console.log(`${row.pass ? "PASS" : "FAIL"} ${site} ${vp.name} cards=${row.cards}/${row.expectedCards} broken=${row.brokenImages.length} console=${row.consoleErrors.length} nonlocal=${row.nonLocalRequests.length} overflow=${row.horizontalOverflow} canvas=${row.canvas}`);
        await ctx.close();
      }
    } finally {
      server.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(path.join(outDir, "visual-smoke.json"), `${JSON.stringify(rows, null, 2)}\n`);
const failedRows = rows.filter((r) => !r.pass);
console.log(`visual smoke: ${rows.length - failedRows.length}/${rows.length} pass`);
if (failedRows.length) process.exit(1);
