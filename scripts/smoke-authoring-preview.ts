/**
 * pnpm smoke:authoring-preview — Task 28 Phase 3 tests.
 *
 * The fast authoring preview is the runtime the Visual Editor consumes, so
 * every claim it makes is tested against a REAL served app in a REAL browser,
 * never against a mock:
 *
 *   §1  the guarded runtime patches (pure functions, anchors, idempotence)
 *   §2  a real preview session on a real Recon Template: materialize, patch,
 *       one `next build`, `next start` behind the stable proxy
 *   §3  text / url edits become visible with NO build, NO asset copy and NO
 *       production package — proven by asserting that no build artifact moved
 *   §4  theme edits through the lightweight overlay; image edits through the
 *       existing per-request media read
 *   §5  the editor bridge: injected in preview, origin-validated, postMessage
 *       round trip, hover/click DOM identity reporting
 *   §6  hydration: real Chromium, console errors AND pageerror events counted
 *   §7  the editor bridge is ABSENT from a REAL production package baked after
 *       the preview session ran, and the immutable template run is untouched
 *   §8  linear.app canary (SKIPPED when the run is not on disk): the
 *       dynamic-template / portal-menu surface through the hot re-parse cycle
 *
 * Everything written under data/ is scoped to
 * `<host>/authoring-previews/wr28-smoke-*` plus the production run the §7 bake
 * creates. No historical run directory is written.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { chromium, type Page } from "playwright";

import {
  AUTHORING_PATCH_MARKER,
  BRIDGE_MARKER,
  isAuthoringPatched,
  loadMaterializationLineage,
  patchLoadPageForAuthoring,
  patchSlotContentForAuthoring,
  previewPaths,
  renderEditorBridgeScript,
  sniffImageContentType,
  startAuthoringPreview,
  type AuthoringPreviewSession,
} from "../src/authoring-preview/index.js";
import { startApp } from "../src/recon-template/parity-qa.js";
import { runProductionCompile } from "../src/production/index.js";
import { SiteThemeAdapterSchema, ThemeFileSchema } from "../src/theme/types.js";

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

// ---------------------------------------------------------------------------
// Fixtures — real, frozen lineage on disk. Read-only inputs.
// ---------------------------------------------------------------------------

const TEMPLATE = path.join("data", "domainchecker.co.kr", "recon-templates", "2026-08-19T07-14-22-868Z");
const MATERIALIZATION = path.join("data", "domainchecker.co.kr", "asset-materializations", "2026-08-19T07-27-43-521Z");
const THEME_RUN = path.join("data", "domainchecker.co.kr", "theme-runs", "2026-08-19T07-22-44-093Z");
const CONTENT_RUN = path.join("data", "domainchecker.co.kr", "content-runs", "2026-08-19T07-18-26-879Z");
const SEO_PLAN = path.join("data", "domainchecker.co.kr", "production-seo-plans", "2026-08-19T07-23-36-101Z");
const PREVIEW_DIR = path.join("data", "domainchecker.co.kr", "authoring-previews", "wr28-smoke");
const LINEAR_TEMPLATE = path.join("data", "linear.app", "recon-templates", "2026-08-25T21-53-26-980Z");
const LINEAR_PREVIEW_DIR = path.join("data", "linear.app", "authoring-previews", "wr28-smoke");

const ROUTE = "/blog";
const TEXT_KEY = "global.header.nav.marketplace.label";
const URL_KEY = "global.footer.link.marketplace.href";
/** linear.app portal-menu label — a dynamic-template binding (Task 17.1). */
const LINEAR_DYNAMIC_KEY = "global.header.nav.build-move-work-forward-across-teams-and.label.02";

/** A tiny solid-colour PNG, so a replaced image is provable by ONE pixel. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      raw[offset++] = rgb[0];
      raw[offset++] = rgb[1];
      raw[offset++] = rgb[2];
    }
  }
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const byte of body) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuffer]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
  });
}

/** An editor stand-in: a page on its OWN origin that embeds the preview. */
async function startEditorHarness(port: number, previewUrl: string): Promise<Server> {
  const html = `<!doctype html><html><body><script>
window.__received = [];
window.addEventListener("message", function (e) { window.__received.push({ origin: e.origin, data: e.data }); });
window.__send = function (m) { document.getElementById("f").contentWindow.postMessage(m, "*"); };
</script><iframe id="f" src="${previewUrl}" style="width:1280px;height:900px;border:0"></iframe></body></html>`;
  const server = createServer((_request, response) => {
    const body = Buffer.from(html, "utf8");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": String(body.length) });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  return server;
}

const stopServer = async (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

interface EditorMessage {
  tag?: string;
  v?: number;
  type?: string;
  payload?: Record<string, unknown>;
}

const sendToBridge = async (page: Page, message: Record<string, unknown>): Promise<void> =>
  page.evaluate((m) => (window as unknown as { __send: (x: unknown) => void }).__send(m), {
    tag: "wr-authoring-editor",
    v: 1,
    ...message,
  });

const inbox = async (page: Page): Promise<Array<{ origin: string; data: EditorMessage }>> =>
  page.evaluate(() => (window as unknown as { __received: Array<{ origin: string; data: EditorMessage }> }).__received);

/** path → `size:mtimeMs` for every file under a directory. */
async function snapshotTree(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const info = await stat(full);
        out[full] = `${info.size}:${info.mtimeMs}`;
      }
    }
  }
  await walk(dir);
  return out;
}

/** Next's OWN build identity — the only thing two builds of one app may differ in. */
function normalizeBuildIdentity(html: string): string {
  return html
    .replace(/\\"b\\":\\"[A-Za-z0-9_-]+\\"/g, '\\"b\\":\\"<buildId>\\"')
    .replace(/"b":"[A-Za-z0-9_-]+"/g, '"b":"<buildId>"')
    .replace(/chunks\/[0-9a-zA-Z._-]+\.js/g, "chunks/<hash>.js")
    .replace(/I\[\d+,/g, "I[<id>,");
}

async function main(): Promise<void> {
  for (const required of [TEMPLATE, MATERIALIZATION, THEME_RUN, CONTENT_RUN, SEO_PLAN]) {
    if (!existsSync(required)) throw new Error(`fixture lineage missing: ${required}`);
  }

  // -------------------------------------------------------------------------
  section("1. guarded runtime patches (pure functions)");
  // -------------------------------------------------------------------------
  const pristineSlotContent = await readFile(path.join(TEMPLATE, "app", "src", "runtime", "slot-content.ts"), "utf8");
  const pristineLoadPage = await readFile(path.join(TEMPLATE, "app", "src", "runtime", "load-page.ts"), "utf8");

  check(
    "28.P3.1 the immutable template's runtime files are NOT authoring-patched",
    !isAuthoringPatched(pristineSlotContent) && !isAuthoringPatched(pristineLoadPage),
  );

  const patchedSlotContent = patchSlotContentForAuthoring(pristineSlotContent);
  const patchedLoadPage = patchLoadPageForAuthoring(pristineLoadPage);
  check(
    "28.P3.2 patchSlotContentForAuthoring keeps the original getContract body and adds the epoch gate",
    patchedSlotContent.includes("if (!contractPromise) contractPromise = buildContract();") &&
      patchedSlotContent.includes("export async function slotContentEpoch()") &&
      patchedSlotContent.includes('process.env.WR_AUTHORING_HOT === "1"'),
  );
  check(
    "28.P3.3 the authoring epoch has its OWN env var — the patch adds no second WR_SLOT_VALUES_FILE read",
    (patchedSlotContent.match(/WR_SLOT_VALUES_FILE/g) ?? []).length ===
      (pristineSlotContent.match(/WR_SLOT_VALUES_FILE/g) ?? []).length &&
      patchedSlotContent.includes("WR_AUTHORING_EPOCH_FILE"),
    `${(patchedSlotContent.match(/WR_SLOT_VALUES_FILE/g) ?? []).length} vs ${(pristineSlotContent.match(/WR_SLOT_VALUES_FILE/g) ?? []).length}`,
  );
  check(
    "28.P3.4 patchLoadPageForAuthoring keeps the untouched loader for the non-hot path",
    patchedLoadPage.includes("if (AUTHORING_HOT) return loadPageHot(pageFile);") &&
      patchedLoadPage.includes("cache.set(pageFile, pending);") &&
      patchedLoadPage.includes('import { applySlotContent, slotContentEpoch } from "./slot-content";'),
  );
  let reapplyRefused = 0;
  for (const [name, fn, source] of [
    ["slot-content", patchSlotContentForAuthoring, patchedSlotContent],
    ["load-page", patchLoadPageForAuthoring, patchedLoadPage],
  ] as const) {
    try {
      fn(source);
    } catch (error) {
      if (String(error).includes("already applied")) reapplyRefused++;
      else console.log(`  (unexpected ${name} error: ${String(error)})`);
    }
  }
  check("28.P3.5 re-applying either patch is REFUSED, loudly", reapplyRefused === 2, `${reapplyRefused}/2`);
  let anchorRefused = 0;
  for (const fn of [patchSlotContentForAuthoring, patchLoadPageForAuthoring]) {
    try {
      fn("// a template compiled by a future generator\n");
    } catch (error) {
      if (String(error).includes("anchor not found")) anchorRefused++;
    }
  }
  check("28.P3.6 a missing anchor is REFUSED, loudly", anchorRefused === 2, `${anchorRefused}/2`);
  check(
    "28.P3.7 sniffImageContentType reads the BYTES, so a .webp name replaced by a PNG serves as image/png",
    sniffImageContentType(png(2, 2, [1, 2, 3])) === "image/png" && sniffImageContentType(Buffer.from("not an image")) === null,
  );
  const bridgeSample = renderEditorBridgeScript({
    editorOrigins: ["https://editor.example"],
    breakpoint: 915,
    generatedStylesPath: "/wr/generated-styles.css",
  });
  check(
    "28.P3.8 the bridge never posts to \"*\", validates origin AND source, and reports data-wr-node / data-wr-dyn-node",
    !bridgeSample.includes('postMessage(message, "*")') &&
      bridgeSample.includes("origins.indexOf(event.origin) === -1") &&
      bridgeSample.includes("event.source !== window.parent && event.source !== window.opener") &&
      bridgeSample.includes("[data-wr-node],[data-wr-dyn-node]") &&
      !bridgeSample.includes("data-wr-slot"),
  );

  // -------------------------------------------------------------------------
  section("2. a real preview session on a real Recon Template");
  // -------------------------------------------------------------------------
  await rm(PREVIEW_DIR, { recursive: true, force: true });
  const templateBefore = await snapshotTree(TEMPLATE);
  const lineage = await loadMaterializationLineage(MATERIALIZATION);
  const adapter = SiteThemeAdapterSchema.parse(
    JSON.parse(await readFile(path.join(THEME_RUN, "theme-adapter.json"), "utf8")),
  );
  const theme = ThemeFileSchema.parse(
    JSON.parse(await readFile(path.join(THEME_RUN, "selected-theme.json"), "utf8")),
  );

  const editorPort = await freePort();
  const roguePort = await freePort();
  const editorOrigin = `http://127.0.0.1:${editorPort}`;
  const rogueOrigin = `http://127.0.0.1:${roguePort}`;

  const session: AuthoringPreviewSession = await startAuthoringPreview({
    templateRunDir: TEMPLATE,
    previewDir: PREVIEW_DIR,
    themeBase: { adapter, theme },
    mediaDir: lineage.mediaDir,
    rewriteMap: lineage.rewriteMap,
    editorOrigins: [editorOrigin],
    resetMediaOverrides: true,
  });
  let editorHarness: Server | undefined;
  let rogueHarness: Server | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const jsErrors: string[] = [];
  const hydrationErrors: string[] = [];

  try {
    check(
      "28.P3.9 the preview app was materialized: copied, patched and built ONCE",
      session.materialized && session.materializeMs.build > 0,
      JSON.stringify(session.materializeMs),
    );
    check(
      "28.P3.10 the preview app carries the authoring patch; the template run still does not",
      isAuthoringPatched(await readFile(path.join(PREVIEW_DIR, "app", "src", "runtime", "slot-content.ts"), "utf8")) &&
        !isAuthoringPatched(await readFile(path.join(TEMPLATE, "app", "src", "runtime", "slot-content.ts"), "utf8")),
    );

    const buildIdFile = path.join(PREVIEW_DIR, "app", ".next", "BUILD_ID");
    const buildIdBefore = (await stat(buildIdFile)).mtimeMs;
    const productionBuildsBefore = (await readdir(path.join("data", "domainchecker.co.kr", "production-builds"))).length;
    const materializationsBefore = (await readdir(path.join("data", "domainchecker.co.kr", "asset-materializations"))).length;

    // ---------------------------------------------------------------------
    section("3. content: text + url edits, served with no build");
    // ---------------------------------------------------------------------
    const baseline = await (await fetch(session.baseUrl + ROUTE)).text();
    const textValue = `WR28 스모크 텍스트 ${Date.now()}`;
    const textStart = Date.now();
    await session.setSlotValue(TEXT_KEY, textValue);
    let servedHtml = "";
    let attempts = 0;
    while (Date.now() - textStart < 20_000) {
      attempts++;
      servedHtml = await (await fetch(session.baseUrl + ROUTE)).text();
      if (servedHtml.includes(textValue)) break;
    }
    check(
      "28.P3.11 a text edit is served on the FIRST request after the write",
      servedHtml.includes(textValue) && attempts === 1,
      `attempts=${attempts} ms=${Date.now() - textStart}`,
    );
    check(
      "28.P3.12 exactly the bound occurrences changed — the baseline had none of the new value",
      !baseline.includes(textValue) && servedHtml.split(textValue).length - 1 > 0,
      `${servedHtml.split(textValue).length - 1} occurrences`,
    );
    const urlValue = `/wr28-smoke-${Date.now()}`;
    await session.setSlotValue(URL_KEY, urlValue);
    const urlHtml = await (await fetch(session.baseUrl + ROUTE)).text();
    check(
      "28.P3.13 a url edit is served the same way (href rewritten, guard respected)",
      urlHtml.includes(`href="${urlValue}"`),
      urlHtml.includes(urlValue) ? "value present but not as an href" : "value absent",
    );
    // Reverting must restore EXACTLY — the expectedValue guard is what makes
    // the round trip lossless, and a stale applied tree would break it.
    await session.setSlotValues({});
    const revertedHtml = await (await fetch(session.baseUrl + ROUTE)).text();
    check(
      "28.P3.14 reverting to the defaults restores the served bytes exactly",
      revertedHtml === baseline,
      `${revertedHtml.length} vs ${baseline.length} bytes`,
    );
    check(
      "28.P3.15 NO `next build` ran for any edit — .next/BUILD_ID never moved",
      (await stat(buildIdFile)).mtimeMs === buildIdBefore,
    );
    check(
      "28.P3.16 NO production package and NO asset materialization was produced by an edit",
      (await readdir(path.join("data", "domainchecker.co.kr", "production-builds"))).length === productionBuildsBefore &&
        (await readdir(path.join("data", "domainchecker.co.kr", "asset-materializations"))).length === materializationsBefore,
    );
    check(
      "28.P3.17 the preview worker was never restarted for a content edit",
      session.workerStarts() === 1,
      `${session.workerStarts()} starts`,
    );
    check(
      "28.P3.18 the applier reported ZERO `[wr-slot]` guard warnings across every edit",
      (session.workerOutput().match(/\[wr-slot\]/g) ?? []).length === 0,
      session.workerOutput().split("[wr-slot]")[1]?.slice(0, 120) ?? "",
    );

    // ---------------------------------------------------------------------
    section("4. the patch is INERT when the hot seam is off");
    // ---------------------------------------------------------------------
    const pristineApp = await startApp(path.join(TEMPLATE, "app"), {});
    // The overlay env IS set (that seam is the template's own, and the overlay
    // is empty at this point after the §3 revert); WR_AUTHORING_HOT is NOT.
    const coldPatchedApp = await startApp(path.join(PREVIEW_DIR, "app"), {
      WR_SLOT_VALUES_FILE: path.resolve(previewPaths(PREVIEW_DIR).slotValuesFile),
    });
    try {
      const routes = (JSON.parse(await readFile(path.join(TEMPLATE, "manifest.json"), "utf8")) as { routes: string[] })
        .routes;
      let identical = 0;
      let firstDiff = "";
      let maxRawDelta = 0;
      for (const route of routes) {
        const a = await (await fetch(pristineApp.baseUrl + route)).text();
        const b = await (await fetch(coldPatchedApp.baseUrl + route)).text();
        maxRawDelta = Math.max(maxRawDelta, Math.abs(a.length - b.length));
        if (normalizeBuildIdentity(a) === normalizeBuildIdentity(b)) identical++;
        else if (firstDiff === "") firstDiff = route;
      }
      // The RAW delta is Next's own build identity (chunk hashes, module ids,
      // buildId) and is reported, not asserted: those strings legitimately
      // change length between two builds of the same source.
      console.log(`  NOTE  §4 raw byte delta across ${routes.length} routes, max ${maxRawDelta} chars (Next build identity)`);
      check(
        "28.P3.19 with WR_AUTHORING_HOT unset the patched app is byte-identical to the PRISTINE template app on every route, after normalizing Next's own build identity only",
        identical === routes.length,
        `${identical}/${routes.length}${firstDiff ? ` first diff ${firstDiff}` : ""}`,
      );
      // Inertness, proven by BEHAVIOUR and not only by bytes: with the hot seam
      // off, writing a new overlay + epoch must change nothing at all — the
      // process-lifetime memoization the generated file documents is intact.
      const coldBefore = await (await fetch(coldPatchedApp.baseUrl + ROUTE)).text();
      await session.setSlotValue(TEXT_KEY, `WR28 inert probe ${Date.now()}`);
      const coldAfter = await (await fetch(coldPatchedApp.baseUrl + ROUTE)).text();
      await session.setSlotValues({});
      check(
        "28.P3.20 …and the hot seam is genuinely OFF there: a new overlay + epoch changes NOTHING in that server",
        coldBefore === coldAfter,
        `${coldBefore.length} vs ${coldAfter.length} bytes`,
      );
    } finally {
      await pristineApp.stop();
      await coldPatchedApp.stop();
    }

    // ---------------------------------------------------------------------
    section("5-6. editor bridge, theme, image and hydration in a real browser");
    // ---------------------------------------------------------------------
    editorHarness = await startEditorHarness(editorPort, session.baseUrl + ROUTE);
    rogueHarness = await startEditorHarness(roguePort, session.baseUrl + ROUTE);

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
    const record = (text: string): void => {
      if (/hydrat|minified react error #(418|423|425)/i.test(text)) hydrationErrors.push(text.slice(0, 300));
      else jsErrors.push(text.slice(0, 300));
    };
    context.on("console", (message) => {
      if (message.type() === "error") record(message.text());
    });
    context.on("weberror", (error) => record(error.error().message));
    const page = await context.newPage();
    page.on("pageerror", (error) => record(error.message));
    await page.goto(editorOrigin + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1_500);

    check(
      "28.P3.21 the editor bridge is injected at the SERVE boundary of every preview HTML response",
      servedHtml.includes(BRIDGE_MARKER) && session.bridgeScript.includes(BRIDGE_MARKER),
    );
    const ready = (await inbox(page)).filter((m) => m.data?.type === "ready");
    check(
      "28.P3.22 the bridge announces itself to the editor origin on load",
      ready.length === 1 && ready[0].origin === session.baseUrl,
      `${ready.length} ready message(s)`,
    );

    await sendToBridge(page, { type: "ping", echo: "wr28-smoke" });
    await page.waitForTimeout(500);
    const pongs = (await inbox(page)).filter((m) => m.data?.type === "pong");
    check(
      "28.P3.23 postMessage round trip: the editor's ping is answered with its own echo",
      pongs.length === 1 && pongs[0].data.payload?.echo === "wr28-smoke",
      JSON.stringify(pongs.map((p) => p.data.payload)),
    );

    const rogue = await context.newPage();
    rogue.on("pageerror", (error) => record(error.message));
    await rogue.goto(rogueOrigin + "/", { waitUntil: "networkidle" });
    await rogue.waitForTimeout(1_200);
    await sendToBridge(rogue, { type: "ping", echo: "rogue" });
    await rogue.waitForTimeout(600);
    const rogueInbox = await inbox(rogue);
    check(
      "28.P3.24 an un-allowlisted origin gets NOTHING — no report, and its ping is ignored",
      rogueInbox.length === 0,
      JSON.stringify(rogueInbox.map((m) => m.data?.type)),
    );
    await rogue.close();

    const target = page.frameLocator("#f").locator("[data-wr-viewport='desktop'] p[data-wr-node]:not(a *)").first();
    await target.hover();
    await page.waitForTimeout(300);
    await target.click({ force: true });
    await page.waitForTimeout(400);
    const reports = (await inbox(page)).filter((m) => m.data?.type === "hover" || m.data?.type === "click");
    const clicked = reports.find((m) => m.data?.type === "click")?.data.payload;
    check(
      "28.P3.25 hover AND click report the rendered element's DOM identity plus route and viewport",
      reports.some((m) => m.data?.type === "hover") &&
        clicked !== undefined &&
        typeof clicked.node === "string" &&
        /^n\d+$/.test(String(clicked.node)) &&
        "dynNode" in clicked &&
        clicked.route === ROUTE &&
        clicked.viewport === "desktop" &&
        typeof clicked.pageId === "string",
      JSON.stringify(clicked ?? null).slice(0, 200),
    );

    // theme -------------------------------------------------------------------
    const themeValue = "rgb(3, 5, 7)";
    const themeBefore = await page
      .frameLocator("#f")
      .locator("html")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--wr-theme-color-accent-primary").trim());
    await session.setAuthoredTheme({ tokens: { "color.accent.primary": themeValue } });
    await sendToBridge(page, { type: "refresh-styles", token: String(Date.now()) });
    let themeVisible = true;
    await page
      .frameLocator("#f")
      .locator("html")
      .evaluate(async (el, expected) => {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          if (getComputedStyle(el).getPropertyValue("--wr-theme-color-accent-primary").trim() === expected) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error("theme never became visible");
      }, themeValue)
      .catch(() => {
        themeVisible = false;
      });
    check(
      "28.P3.26 an authored.theme token edit is visible with NO navigation and NO worker restart",
      themeVisible && themeBefore !== themeValue && session.workerStarts() === 1,
      `before=${themeBefore}`,
    );
    check(
      "28.P3.27 the theme edit did not rebuild the app either",
      (await stat(buildIdFile)).mtimeMs === buildIdBefore,
    );

    // image -------------------------------------------------------------------
    const mediaNames = await page
      .frameLocator("#f")
      .locator("img[src*='/media/']")
      .first()
      .evaluate((el) => {
        const image = el as HTMLImageElement;
        const refs = [image.getAttribute("src") ?? ""];
        for (const candidate of (image.getAttribute("srcset") ?? "").split(",")) {
          const url = candidate.trim().split(" ")[0];
          if (url !== "") refs.push(url);
        }
        return [...new Set(refs.filter((r) => r.includes("/media/")).map((r) => r.split("/media/")[1].split("?")[0]))];
      });
    check("28.P3.28 the preview rewrote source asset URLs to local /media paths", mediaNames.length > 0, `${mediaNames.length}`);
    for (const name of mediaNames) await session.replaceMedia(name, png(43, 61, [200, 10, 40]));
    await sendToBridge(page, { type: "refresh-media", token: String(Date.now()) });
    let imageVisible = true;
    await page
      .frameLocator("#f")
      .locator("img[src*='/media/']")
      .first()
      .evaluate(async (el, expected) => {
        const image = el as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          if (image.complete && image.naturalWidth > 0 && ctx !== null) {
            ctx.drawImage(image, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            if (`${data[0]},${data[1]},${data[2]}` === expected) return;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error("image never became visible");
      }, "200,10,40")
      .catch(() => {
        imageVisible = false;
      });
    check(
      "28.P3.29 an authored asset replacement repaints the RENDERED PIXEL with no navigation and no stage rerun",
      imageVisible && session.workerStarts() === 1 && (await stat(buildIdFile)).mtimeMs === buildIdBefore,
    );
    const mediaResponse = await fetch(`${session.baseUrl}/media/${mediaNames[0]}`);
    check(
      "28.P3.30 authoring-mode media is served no-store — the shipped `immutable` header is what makes a replacement invisible",
      (mediaResponse.headers.get("cache-control") ?? "").includes("no-store"),
      mediaResponse.headers.get("cache-control") ?? "(none)",
    );

    // text through the browser ------------------------------------------------
    const browserText = `WR28 브라우저 스모크 ${Date.now()}`;
    await session.setSlotValue(TEXT_KEY, browserText);
    await sendToBridge(page, { type: "reload" });
    let browserTextVisible = true;
    await page
      .frameLocator("#f")
      .locator(`text=${browserText}`)
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => {
        browserTextVisible = false;
      });
    check("28.P3.31 a text edit is visible in a REAL browser after the bridge's reload command", browserTextVisible);

    await page.waitForTimeout(1_200);
    check("28.P3.32 browser runtime errors: 0", jsErrors.length === 0, JSON.stringify(jsErrors.slice(0, 3)));
    check("28.P3.33 hydration errors: 0", hydrationErrors.length === 0, JSON.stringify(hydrationErrors.slice(0, 3)));
  } finally {
    if (browser !== undefined) await browser.close();
    if (editorHarness !== undefined) await stopServer(editorHarness);
    if (rogueHarness !== undefined) await stopServer(rogueHarness);
    await session.stop();
  }

  // -------------------------------------------------------------------------
  section("7. the bridge is ABSENT from a REAL production package baked after the preview ran");
  // -------------------------------------------------------------------------
  const compiled = await runProductionCompile({
    host: "domainchecker.co.kr",
    templateRunDir: TEMPLATE,
    contentRunDir: CONTENT_RUN,
    themeRunDir: THEME_RUN,
    seoPlanRunDir: SEO_PLAN,
    materializationRunDir: MATERIALIZATION,
  });
  let packageFiles = 0;
  let bridgeOccurrences = 0;
  let patchOccurrences = 0;
  let epochEnvOccurrences = 0;
  const walkPackage = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkPackage(full);
        continue;
      }
      packageFiles++;
      const text = (await readFile(full)).toString("utf8");
      bridgeOccurrences += text.split(BRIDGE_MARKER).length - 1;
      patchOccurrences += text.split(AUTHORING_PATCH_MARKER).length - 1;
      epochEnvOccurrences += text.split("WR_AUTHORING_EPOCH_FILE").length - 1;
    }
  };
  await walkPackage(compiled.packageDir);
  check(
    "28.P3.34 the production package is real and non-trivial",
    packageFiles > 50 && existsSync(path.join(compiled.packageDir, "server.mjs")),
    `${packageFiles} files`,
  );
  check(
    "28.P3.35 the editor bridge appears 0 times in the production package",
    bridgeOccurrences === 0,
    `${bridgeOccurrences} occurrences`,
  );
  check(
    "28.P3.36 the authoring hot seam appears 0 times in the production package",
    patchOccurrences === 0 && epochEnvOccurrences === 0,
    `patch=${patchOccurrences} env=${epochEnvOccurrences}`,
  );
  const templateAfter = await snapshotTree(TEMPLATE);
  check(
    "28.P3.37 the immutable template run is byte-untouched by the preview session and the bake",
    JSON.stringify(templateBefore) === JSON.stringify(templateAfter),
    `${Object.keys(templateBefore).length} files`,
  );

  // -------------------------------------------------------------------------
  section("8. linear.app canary — dynamic-template (portal menu) through the hot cycle");
  // -------------------------------------------------------------------------
  if (!existsSync(LINEAR_TEMPLATE)) {
    console.log(`  SKIP  §8 canary not on disk: ${LINEAR_TEMPLATE}`);
  } else {
    await rm(LINEAR_PREVIEW_DIR, { recursive: true, force: true });
    const linear = await startAuthoringPreview({
      templateRunDir: LINEAR_TEMPLATE,
      previewDir: LINEAR_PREVIEW_DIR,
      editorOrigins: [],
      resetMediaOverrides: true,
    });
    let linearBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const before = await (await fetch(linear.baseUrl + "/")).text();
      const value = `WR28 동적 ${Date.now()}`;
      await linear.setSlotValue(LINEAR_DYNAMIC_KEY, value);
      const after = await (await fetch(linear.baseUrl + "/")).text();
      check(
        "28.P3.38 a dynamic-template (portal) binding re-applies through the epoch re-parse",
        !before.includes(value) && after.split(value).length - 1 > 0,
        `${after.split(value).length - 1} occurrences`,
      );
      check(
        "28.P3.39 …with ZERO `[wr-slot]` guard warnings — the fresh parse per epoch is what makes the guard hold",
        (linear.workerOutput().match(/\[wr-slot\]/g) ?? []).length === 0,
      );
      linearBrowser = await chromium.launch();
      const linearContext = await linearBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      const linearJsErrors: string[] = [];
      const linearHydrationErrors: string[] = [];
      const recordLinear = (text: string): void => {
        if (/hydrat|minified react error #(418|423|425)/i.test(text)) linearHydrationErrors.push(text.slice(0, 300));
        else linearJsErrors.push(text.slice(0, 300));
      };
      linearContext.on("console", (m) => {
        if (m.type() === "error") recordLinear(m.text());
      });
      const linearPage = await linearContext.newPage();
      linearPage.on("pageerror", (error) => recordLinear(error.message));
      await linearPage.goto(linear.baseUrl + "/", { waitUntil: "networkidle" });
      await linearPage.waitForTimeout(1_500);
      const beforeClick = await linearPage.locator(`text=${value}`).count();
      const triggers = linearPage.locator("[data-wr-viewport='desktop'] [data-wr-pattern-id]");
      const triggerCount = await triggers.count();
      let mounted = 0;
      for (let i = 0; i < Math.min(triggerCount, 12); i++) {
        const trigger = triggers.nth(i);
        if (!(await trigger.isVisible().catch(() => false))) continue;
        await trigger.click({ timeout: 3_000 }).catch(() => {});
        await linearPage.waitForTimeout(500);
        mounted = await linearPage.locator(`text=${value}`).count();
        if (mounted > 0) break;
        await linearPage.keyboard.press("Escape").catch(() => {});
      }
      check(
        "28.P3.40 the mounted portal menu renders the hot value in a REAL browser (Task 17.1 blind spot)",
        beforeClick === 0 && mounted > 0,
        `beforeClick=${beforeClick} mounted=${mounted} triggers=${triggerCount}`,
      );
      check(
        "28.P3.41 linear canary: browser runtime errors 0, hydration errors 0",
        linearJsErrors.length === 0 && linearHydrationErrors.length === 0,
        `${linearJsErrors.length}/${linearHydrationErrors.length}`,
      );
    } finally {
      if (linearBrowser !== undefined) await linearBrowser.close();
      await linear.stop();
    }
  }

  console.log(`\nsmoke:authoring-preview — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nsmoke:authoring-preview CRASHED —", err);
  process.exit(1);
});
