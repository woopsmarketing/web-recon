/**
 * Lightweight browser sanity for a Preservation Clone (Phase 2).
 *
 * Deliberately NOT a visual certification: no pixel comparison, no width
 * sweep, no scoring. It answers only the questions a human should not have to
 * ask before looking at the page — does it load, do the local resources
 * resolve, is the source JS really inert, and is there catastrophic overflow.
 * Judging fidelity remains the human's job.
 *
 * Usage: pnpm preserve:sanity <clone-dir> <screenshot-dir>
 *          [--expect-text "<string that must appear>"] [--min-height N]
 *
 * The expected text and height floor are FLAGS, not constants: this script must
 * work for any preserved site, not just the one it was first written against.
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { startPreviewServer } from "../src/preservation-clone/serve.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true);
const flag = (name: string): string | undefined =>
  argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined;
const cloneDir = positional[0];
const shotDir = positional[1];
const expectText = flag("--expect-text") ?? "";
const minHeight = Number(flag("--min-height") ?? 1500);
if (!cloneDir || !shotDir) {
  console.log('Usage: pnpm preserve:sanity <clone-dir> <screenshot-dir> [--expect-text "..."] [--min-height N]');
  process.exit(1);
}
await fs.mkdir(shotDir, { recursive: true });

const server = await startPreviewServer(cloneDir);
const browser = await chromium.launch();
const cases = [
  { id: "desktop", width: 1440, height: 900, isMobile: false },
  { id: "desktop-1024", path: "desktop", width: 1024, height: 900, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true },
];

let fail = 0;
for (const c of cases) {
  const variant = c.path ?? c.id;
  const context = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    isMobile: c.isMobile,
    hasTouch: c.isMobile,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const localFailures: string[] = [];
  const offsite: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(server.baseUrl)) { if (r.status() >= 400) localFailures.push(`${r.status()} ${u}`); }
    else if (!u.startsWith("data:")) offsite.push(u);
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (u.startsWith(server.baseUrl)) localFailures.push(`FAILED ${u}`);
    else if (!u.startsWith("data:")) offsite.push(`FAILED ${u}`);
  });

  const response = await page.goto(`${server.baseUrl}/${variant}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500);

  const m = await page.evaluate((expected: string) => ({
    readyState: document.readyState,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    sheets: document.styleSheets.length,
    rules: Array.from(document.styleSheets).reduce((n, s) => { try { return n + s.cssRules.length; } catch { return n; } }, 0),
    imgs: document.images.length,
    // An image with no src at all was neutralized on purpose (tracking pixel);
    // only an image that HAS a source and still failed is broken.
    brokenImgs: Array.from(document.images).filter(
      (i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute("src")),
    ).length,
    neutralizedImgs: Array.from(document.images).filter(
      (i) => !i.currentSrc && !i.getAttribute("src"),
    ).length,
    // Signals that source JS RAN. `window.__NEXT_DATA__` is not one: an
    // element id is exposed on window by named access, so the kept JSON data
    // script produces that global without anything executing.
    jsRan: {
      channelIO: typeof (window as any).ChannelIO,
      dataLayer: typeof (window as any).dataLayer,
      nextDataIsElement: (window as any).__NEXT_DATA__ instanceof HTMLElement,
      liveScripts: Array.from(document.scripts).filter(
        (s) => s.src || ["", "text/javascript", "module", "application/javascript"].includes(s.type),
      ).length,
    },
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 200),
    // innerText carries the source's own line breaks, so compare normalized.
    hasExpectedText:
      expected === "" ||
      (document.body.innerText || "").replace(/\s+/g, " ").includes(expected),
    textLength: (document.body.innerText || "").trim().length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    heroFont: getComputedStyle(document.body).fontFamily,
  }), expectText);

  await page.screenshot({ path: path.join(shotDir, `${c.id}.png`), fullPage: false });
  await page.screenshot({ path: path.join(shotDir, `${c.id}-full.png`), fullPage: true });

  const overflow = m.scrollWidth - m.clientWidth;
  const ok =
    response?.status() === 200 &&
    m.scrollHeight > minHeight &&
    overflow <= 1 &&
    m.hasExpectedText &&
    m.textLength > 0 &&
    m.rules > 100 &&
    localFailures.length === 0 &&
    errors.length === 0 &&
    m.brokenImgs === 0 &&
    m.jsRan.liveScripts === 0 &&
    m.jsRan.channelIO === "undefined" &&
    m.jsRan.dataLayer === "undefined";
  if (!ok) fail++;
  console.log(JSON.stringify({
    case: c.id, variant, httpStatus: response?.status(), ...m, overflow,
    localFailures: localFailures.slice(0, 8), localFailureCount: localFailures.length,
    offsiteUnique: [...new Set(offsite.map((u) => { try { return new URL(u).host; } catch { return u; } }))],
    errors: errors.slice(0, 5), errorCount: errors.length, ok,
  }, null, 2));
  await context.close();
}
await browser.close();
await server.close();
console.log(fail === 0 ? "SANITY OK" : `SANITY FAILURES: ${fail}`);
