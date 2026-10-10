/**
 * pnpm tsx --tsconfig platform/tsconfig.json platform/cli/template-preview-capture.ts [--template <id>]
 *
 * Refreshes the preview pictures of the template catalog (data/template-catalog/previews/):
 * a desktop and a mobile capture of the TOP of the live demo home page of each template.
 *
 * Rules (the only network use of the catalog work):
 *   - it GETs exactly the public demo HOME page named in data/template-catalog/<id>.json (`demoUrl`), nothing else;
 *   - every request to boostchat.co.kr is aborted, so no chat bootstrap reaches production and no chat
 *     launcher appears in the picture;
 *   - desktop 1440 px wide (clip 1440x2400), mobile 390 px wide at deviceScaleFactor 2 (clip 390x1600 css px);
 *   - JPEG, quality lowered until the file is <= 450 KB.
 * Writes <id>-desktop.jpg / <id>-mobile.jpg and nothing else. No publish, no deploy.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { CATALOG_META_DIR, PREVIEW_DIR, parseTemplateMeta } from "../catalog/catalog";

const MAX_BYTES = 450 * 1024;
const BLOCKED_HOST = /(^|\.)boostchat\.co\.kr$/i;

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--template");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
if (args.some((a, i) => a !== "--template" && args[i - 1] !== "--template")) {
  console.error("usage: tsx --tsconfig platform/tsconfig.json platform/cli/template-preview-capture.ts [--template <templateId>]");
  process.exit(2);
}

type Kind = "desktop" | "mobile";
const KINDS: Record<Kind, { viewport: { width: number; height: number }; scale: number; clipHeight: number }> = {
  desktop: { viewport: { width: 1440, height: 900 }, scale: 1, clipHeight: 2400 },
  mobile: { viewport: { width: 390, height: 844 }, scale: 2, clipHeight: 1600 },
};

async function capture(browser: Browser, url: string, kind: Kind): Promise<Buffer> {
  const spec = KINDS[kind];
  const context = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: spec.scale, isMobile: kind === "mobile", hasTouch: kind === "mobile", locale: "ko-KR" });
  let requested = 0;
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (BLOCKED_HOST.test(u.hostname)) return route.abort();
    requested += 1;
    return route.continue();
  });
  try {
    const page = await context.newPage();
    // GET the home page only: no click, no scroll-triggered navigation.
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    // network idle is best effort: a page that keeps a connection open must not block the capture
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.evaluate("document.fonts.ready.then(() => true)");
    // lazy images below the fold: bring the capture area into view in steps, then return to the top
    await page.evaluate(`(async () => {
      for (let y = 0; y < ${spec.clipHeight}; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    })()`);
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    // images that are still loading get a bounded wait (a lazy image that never loads must not hang the capture).
    // The page function is a string: tsx would inject a `__name` helper into a compiled function, which the page does not have.
    await page.evaluate(`(async () => {
      const settle = (img) => (img.complete ? Promise.resolve() : new Promise((resolve) => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); }));
      await Promise.race([Promise.all(Array.from(document.images).map(settle)), new Promise((resolve) => setTimeout(resolve, 8000))]);
    })()`);
    // A full-page capture draws position:fixed elements (bottom tab bar, scroll-to-top button, corner controls) at their
    // viewport position, i.e. in the middle of the picture. Hide those that sit below the top bar so the card shows the page,
    // not floating chrome; the fixed header at the very top stays.
    await page.evaluate(`(() => {
      const h = window.innerHeight;
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (getComputedStyle(el).position !== "fixed") continue;
        if (el.getBoundingClientRect().top > h * 0.2) el.style.visibility = "hidden";
      }
    })()`);
    await page.waitForTimeout(800);
    let quality = 80;
    for (;;) {
      const buf = await page.screenshot({ type: "jpeg", quality, fullPage: true, clip: { x: 0, y: 0, width: spec.viewport.width, height: spec.clipHeight } });
      if (buf.byteLength <= MAX_BYTES || quality <= 40) {
        if (buf.byteLength > MAX_BYTES) throw new Error(`${url} ${kind}: ${buf.byteLength} bytes at quality ${quality}, over ${MAX_BYTES}`);
        console.log(`${kind} ${url} quality=${quality} bytes=${buf.byteLength} requests=${requested}`);
        return buf;
      }
      quality -= 5;
    }
  } finally {
    await context.close();
  }
}

const repoRoot = process.cwd();
const metaDir = path.join(repoRoot, CATALOG_META_DIR);
const outDir = path.join(repoRoot, PREVIEW_DIR);
await mkdir(outDir, { recursive: true });
const ids = (await readdir(metaDir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const browser = await chromium.launch();
try {
  for (const id of ids) {
    if (only && id !== only) continue;
    const meta = parseTemplateMeta(JSON.parse(await readFile(path.join(metaDir, `${id}.json`), "utf8")), id);
    const url = new URL(meta.demoUrl);
    if (url.pathname !== "/" || url.search || url.hash) throw new Error(`${id}: demoUrl must be a home page`);
    for (const kind of ["desktop", "mobile"] as const) {
      const buf = await capture(browser, url.toString(), kind);
      await writeFile(path.join(outDir, `${id}-${kind}.jpg`), buf);
    }
  }
} finally {
  await browser.close();
}
