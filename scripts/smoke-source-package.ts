/**
 * pnpm smoke:source-package — Source Preservation V2 Phase 1 fixture tests.
 *
 * Two local HTTP fixtures on 127.0.0.1 (a second server = a second ORIGIN, so
 * its stylesheet is CORS-blocked in the CSSOM) drive the Source Package
 * capture through the public barrel (../src/source-package/index.js) and,
 * once, through the real observer (../src/observer/index.js) to prove the
 * opt-in persistence path and backward compatibility.
 *
 * Coverage map (prompt §20):
 *   T1  initial document vs runtime DOM stored separately
 *   T2  linked CSS raw source captured verbatim (authored units, not px)
 *   T3  runtime <style> (CSS-in-JS) captured via CSSOM serialization
 *   T4  cross-origin/unreadable stylesheet represented, not hidden (+ direct fetch)
 *   T5  module/classic/inline script inventory
 *   T6  runtime-loaded JS chunk (dynamic import) in the network manifest
 *   T7  resource size cap
 *   T8  sensitive headers / query tokens / POST bodies never stored
 *   T9  old artifact without Source Package still loads
 *   T10 deterministic ordering / hashing
 *   T11 classification unit checks (no browser)
 *   T12 observer integration (opt-in persistence + opt-out byte-neutrality)
 *   T13 JSON response body capture: default ON, explicit opt-out, dedicated
 *       per-body/total caps, manifest/hash integrity, privacy boundary unchanged
 *
 * Every fixture response carries secret-shaped headers so T8 is proven on the
 * SAME traffic the other tests exercise.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

import {
  assembleSourcePackage,
  attachSourceCapture,
  classifyEmbedUrl,
  classifyRequest,
  detectFrameworks,
  matchProvider,
  redactUrl,
  resolveSourceCaptureOptions,
  SAFE_RESPONSE_HEADERS,
  SOURCE_PACKAGE_DIR,
  SourcePackagePointerSchema,
  stableStringify,
  writeSourcePackage,
  type RecordedNetwork,
  type SourceCaptureOptions,
  type SourcePackageCapture,
} from "../src/source-package/index.js";
import { collectSourceInventoryInBrowser } from "../src/source-package/inventory-in-browser.js";
import { installBrowserNameShim } from "../src/observer/initial-paint-census.js";
import { observePageWithBrowser, saveObservationIntoDir } from "../src/observer/index.js";
import {
  PageObservationSchema,
  READABLE_SCHEMA_VERSIONS,
  SCHEMA_VERSION,
  ViewportObservationSchema,
} from "../src/observer/types.js";

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

const OUT_ROOT = path.resolve("tmp", "source-preservation-phase1", "smoke");
const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SECRET_COOKIE = "SECRETCOOKIE_9f3a";
const SECRET_AUTH = "Bearer SECRETAUTH_7c2b";
const SECRET_TOKEN_HDR = "SECRETXAUTH_1d4e";
const SECRET_API_KEY = "SECRETAPIKEY_5b6c";
const POST_PAYLOAD = "POSTPAYLOAD_SECRET_e8a1";

const SAME_ORIGIN_CSS = [
  ".a{width:50%;max-width:calc(100% - 40px);min-height:clamp(10rem, 20vw, 30rem);aspect-ratio:16/9;padding:2rem 1em}",
  ".g{display:grid;grid-template-columns:1fr 2fr min-content;gap:1.5%}",
  "@media (max-width:900px){.a{width:100vw}}",
  "@supports (display:grid){.g{display:grid}}",
  "@container card (min-width: 400px){.a{padding:4vw}}",
  ":root{--gap:2rem;--brand:#0af}",
  '@font-face{font-family:"Fx";src:url(/fonts/fx.woff2) format("woff2");font-display:swap}',
].join("\n");

const CROSS_ORIGIN_CSS = ".x{width:75%;margin:0 auto}@media (min-width:1200px){.x{width:60vw}}";
const STYLE_TAG_TEXT = ".s{padding:2rem;width:calc(100% - 2 * var(--gap))}";
const CLASSIC_JS = "window.__c = 1; /* classic */";
const MODULE_JS = "import('/chunk.js').then(m => { window.__k = m.k; });";
const CHUNK_JS = "export const k = 42;";
const BIG_JS = `/* big */ window.__big = "${"x".repeat(4096)}";`;
const SMALL_JS = "window.__small = 1;";

/** The embed URL keeps a real third-party host so provider classification is exercised; every page that loads it routes that host to a loopback stub (see `stubEmbedHost`). */
const EMBED_SRC = "https://www.youtube.com/embed/abc";

function fixtureHtml(crossOriginBase: string, embedSrc: string | null = EMBED_SRC): string {
  return `<!doctype html><html lang="ko" data-framework="fixture"><head><meta charset="utf-8"><title>source-package smoke</title>
<link rel="stylesheet" href="/a.css">
<link rel="stylesheet" href="${crossOriginBase}/x.css">
<link rel="modulepreload" href="/m.js">
<link rel="preload" as="script" href="/c.js">
<style>${STYLE_TAG_TEXT}</style>
<script type="application/json" id="__NEXT_DATA__">{"props":{"pageProps":{"x":1},"apiToken":"NEXTSECRET_3c9d"},"buildId":"b1"}</script>
<script src="/c.js"></script>
<script type="module" src="/m.js"></script>
<script>
const st = document.createElement('style');
st.setAttribute('data-emotion', 'css');
document.head.appendChild(st);
st.sheet.insertRule('.e{width:33%}');
const marker = document.createElement('div');
marker.id = 'runtime-marker';
marker.textContent = 'inserted at runtime';
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(marker));
fetch('/api/data?token=abc&v=1').then(r => r.json()).catch(() => {});
fetch('/api/post', { method: 'POST', body: '${POST_PAYLOAD}', headers: { 'content-type': 'text/plain' } }).catch(() => {});
</script>
</head><body class="b" data-theme="light">
<div class="a s g x">hello</div>
<img src="/i.png" srcset="/i.png 1x, /i2x.png 2x" sizes="100vw" alt="">
<video poster="/p.jpg" autoplay muted playsinline><source src="/v.mp4" type="video/mp4"></video>
${embedSrc ? `<iframe src="${embedSrc}" title="yt"></iframe>` : ""}
<div style="background-image:url(/bg.png)">bg</div>
</body></html>`;
}

const SIZE_CAP_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>cap</title>
<script src="/big.js"></script><script src="/small.js"></script></head><body>cap</body></html>`;

// T13 — three sequential (awaited, so arrival order is deterministic) same-shape
// JSON responses, ~2008 bytes each, for the per-body and total JSON cap tests.
const JSON_PAYLOAD = JSON.stringify({ v: "z".repeat(2000) });
const JSON_CAP_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>json-cap</title>
<script>
(async () => {
  await fetch('/api/j1');
  await fetch('/api/j2');
  await fetch('/api/j3');
})();
</script></head><body>json-cap</body></html>`;

interface Fixture {
  server: Server;
  baseUrl: string;
  port: number;
  hits: Map<string, number>;
}

/**
 * Hermetic embed: the third-party embed host is answered from memory, so the
 * suite makes no outbound request (review M6). The stub frame loads one
 * script so a child-frame JS_CHUNK entry exists.
 */
async function stubEmbedHost(page: Page): Promise<void> {
  await page.route(/^https:\/\/www\.youtube\.com\//, (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith(".js")) return route.fulfill({ status: 200, contentType: "application/javascript", body: "window.__stub=1;" });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: '<!doctype html><html><head><script src="/s/player/stub.js"></script></head><body>stub</body></html>' });
  });
}

async function startFixture(
  routes: (pathname: string, res: import("node:http").ServerResponse) => boolean,
): Promise<Fixture> {
  const hits = new Map<string, number>();
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    hits.set(u.pathname, (hits.get(u.pathname) ?? 0) + 1);
    // Every response carries secret-shaped headers (T8).
    res.setHeader("set-cookie", `sid=${SECRET_COOKIE}; Path=/`);
    res.setHeader("authorization", SECRET_AUTH);
    res.setHeader("x-auth-token", SECRET_TOKEN_HDR);
    res.setHeader("x-api-key", SECRET_API_KEY);
    res.setHeader("cache-control", "no-store");
    if (req.method === "POST") {
      req.resume();
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end('{"posted":true}');
      });
      return;
    }
    if (!routes(u.pathname, res)) {
      res.statusCode = 404;
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, baseUrl: `http://127.0.0.1:${port}`, port, hits };
}

function text(res: import("node:http").ServerResponse, type: string, body: string): boolean {
  res.setHeader("content-type", type);
  res.end(body);
  return true;
}

function mainRoutes(crossOriginBase: string) {
  return (p: string, res: import("node:http").ServerResponse): boolean => {
    switch (p) {
      case "/":
        return text(res, "text/html; charset=utf-8", fixtureHtml(crossOriginBase));
      case "/no-embed":
        // For pages the suite cannot route (observePage owns its browser): no third-party host at all.
        return text(res, "text/html; charset=utf-8", fixtureHtml(crossOriginBase, null));
      case "/a.css":
        return text(res, "text/css", SAME_ORIGIN_CSS);
      case "/c.js":
        return text(res, "application/javascript", CLASSIC_JS);
      case "/m.js":
        return text(res, "text/javascript", MODULE_JS);
      case "/chunk.js":
        return text(res, "text/javascript", CHUNK_JS);
      case "/api/data":
        return text(res, "application/json", '{"ok":true}');
      case "/cap":
        return text(res, "text/html; charset=utf-8", SIZE_CAP_HTML);
      case "/big.js":
        return text(res, "application/javascript", BIG_JS);
      case "/small.js":
        return text(res, "application/javascript", SMALL_JS);
      case "/json-cap":
        return text(res, "text/html; charset=utf-8", JSON_CAP_HTML);
      case "/api/j1":
      case "/api/j2":
      case "/api/j3":
        return text(res, "application/json", JSON_PAYLOAD);
      default:
        return false;
    }
  };
}

/* ------------------------------------------------------------------ *
 * Capture helper
 * ------------------------------------------------------------------ */

interface Captured {
  pkg: SourcePackageCapture;
  dir: string;
  servedBody: Buffer;
  runtimeHtml: string;
  finalUrl: string;
}

async function captureFixture(
  browser: Browser,
  url: string,
  outName: string,
  options: SourceCaptureOptions = {},
  viewportId = "desktop",
): Promise<Captured> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await stubEmbedHost(page);
    const cap = await attachSourceCapture(page, options);
    const resp = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    if (!resp) throw new Error("no main-frame response");
    // Let dynamic import + fetches land.
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const servedBody = await resp.body();
    const runtimeHtml = await page.content();
    const pkg = await cap.finish({
      requestedUrl: url,
      viewport: { id: viewportId, width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
      engine: "playwright-chromium",
      initialDocument: {
        status: "captured",
        url: resp.url(),
        httpStatus: resp.status(),
        contentType: (await resp.headerValue("content-type")) ?? undefined,
        bytes: servedBody.byteLength,
        sha256: sha256(servedBody),
        charset: "utf-8",
      },
      documentResponseBody: servedBody,
      runtimeHtml,
    });
    const dir = path.join(OUT_ROOT, outName);
    await rm(dir, { recursive: true, force: true });
    await writeSourcePackage(dir, pkg);
    return { pkg, dir, servedBody, runtimeHtml, finalUrl: resp.url() };
  } finally {
    await context.close();
  }
}

async function listFilesRecursive(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

async function grepFiles(dir: string, needle: string, exclude: string[] = []): Promise<string[]> {
  const hits: string[] = [];
  for (const rel of await listFilesRecursive(dir)) {
    if (exclude.includes(rel)) continue;
    const buf = await readFile(path.join(dir, rel));
    if (buf.includes(needle)) hits.push(rel);
  }
  return hits;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("smoke:source-package — Source Preservation V2 Phase 1");
  await rm(OUT_ROOT, { recursive: true, force: true });
  await mkdir(OUT_ROOT, { recursive: true });

  // Second server first so the main fixture can embed its origin.
  const cross = await startFixture((p, res) => (p === "/x.css" ? text(res, "text/css", CROSS_ORIGIN_CSS) : false));
  const main = await startFixture(mainRoutes(cross.baseUrl));
  const browser = await chromium.launch();

  try {
    /* ---------------------------------------------------------------- */
    section("T11 classification unit checks (no browser)");
    {
      const origin = main.baseUrl;
      const yt = classifyEmbedUrl("https://www.youtube.com/embed/x", origin);
      check("T11 youtube iframe → EXTERNAL_EMBED", yt.preservability === "EXTERNAL_EMBED", yt.preservability);
      check("T11 youtube iframe → providerHint youtube", yt.providerHint === "youtube", String(yt.providerHint));
      const same = classifyEmbedUrl(`${origin}/frame.html`, origin);
      check("T11 same-origin iframe → UNKNOWN (not recursed)", same.preservability === "UNKNOWN", same.preservability);
      const gtm = classifyRequest({
        url: "https://www.googletagmanager.com/gtm.js?id=GTM-XYZ",
        resourceType: "script",
        contentType: "application/javascript",
        sameOrigin: false,
        frame: "main",
        navigation: false,
        method: "GET",
      });
      check("T11 googletagmanager script → ANALYTICS", gtm.dependencyClass === "ANALYTICS", gtm.dependencyClass);
      check("T11 googletagmanager → dropQuery", gtm.dropQuery === true);
      check("T11 googletagmanager → thirdParty + providerHint", gtm.thirdParty && gtm.providerHint === "google-tag-manager", String(gtm.providerHint));
      const api = classifyRequest({ url: `${origin}/api/data`, resourceType: "fetch", contentType: "application/json", sameOrigin: true, frame: "main", navigation: false, method: "GET" });
      check("T11 same-origin JSON fetch → API_DATA apiLike", api.dependencyClass === "API_DATA" && api.apiLike, api.dependencyClass);
      const red = redactUrl("https://a.example/b?key=K&v=1");
      check("T11 redactUrl redacts key, keeps v", red.url === "https://a.example/b?key=%5Bredacted%5D&v=1", red.url);
      check("T11 redactUrl reports redacted key", red.redaction?.redactedQueryKeys?.join(",") === "key", JSON.stringify(red.redaction));
      const plain = redactUrl("https://a.example/b?v=1&page=2");
      check("T11 redactUrl leaves benign query untouched", plain.url === "https://a.example/b?v=1&page=2" && plain.redaction === undefined);
      const dropped = redactUrl("https://x.example/collect?cid=123", true);
      check("T11 redactUrl dropQuery removes query", dropped.url === "https://x.example/collect" && dropped.redaction?.queryDropped === true, dropped.url);
      const gf = matchProvider("fonts.googleapis.com");
      check("T11 matchProvider fonts.googleapis.com → google-fonts", gf?.hint === "google-fonts", String(gf?.hint));
      const gm = matchProvider("www.google.com", "/maps/embed");
      check("T11 matchProvider www.google.com/maps → google-maps-embed", gm?.hint === "google-maps-embed", String(gm?.hint));
      const gnone = matchProvider("www.google.com", "/search");
      check("T11 matchProvider www.google.com/search → none", gnone === undefined, String(gnone?.hint));
      const fw = detectFrameworks({ scriptSrcs: ["https://s/_next/static/chunks/a.js", "https://s/_next/static/b.js"], styleMarkers: ["data-emotion"], windowGlobals: [], rootAttributeNames: [], jsonScriptIds: [], elementTagNames: [] });
      check("T11 detectFrameworks /_next/ → next.js", fw.some((f) => f.framework === "next.js" && f.count === 2), JSON.stringify(fw));
      check("T11 detectFrameworks data-emotion → emotion", fw.some((f) => f.framework.startsWith("emotion")), JSON.stringify(fw));
    }

    /* ---------------------------------------------------------------- */
    section("Capture: main fixture (run 1)");
    const run1 = await captureFixture(browser, `${main.baseUrl}/`, "run1");
    const m1 = run1.pkg.manifest;
    console.log(
      `  counts: styles ${m1.counts.styles.total}, scripts ${m1.counts.scripts.total}, ` +
        `assets ${Object.values(m1.counts.assets).reduce((a, b) => a + b, 0)}, network ${m1.counts.network.total}, ` +
        `config ${Object.values(m1.counts.config).reduce((a, b) => a + b, 0)}; initiator ${m1.evidence.initiator}`,
    );
    const cdp = m1.evidence.initiator === "cdp-available";
    const files1 = await listFilesRecursive(run1.dir);

    /* ---------------------------------------------------------------- */
    section("T1 initial document vs runtime DOM stored separately");
    {
      const responseFile = path.join(run1.dir, "document", "response.html");
      const runtimeFile = path.join(run1.dir, "document", "runtime.html");
      check("T1 document/response.html exists", existsSync(responseFile));
      check("T1 document/runtime.html exists", existsSync(runtimeFile));
      const responseBytes = await readFile(responseFile);
      const runtimeBytes = await readFile(runtimeFile);
      check("T1 response.html === raw served bytes", responseBytes.equals(run1.servedBody));
      check("T1 manifest.document.initial.sha256 matches file", m1.document.initial.sha256 === sha256(responseBytes), String(m1.document.initial.sha256));
      check("T1 manifest.document.initial.file points at response.html", m1.document.initial.file === "document/response.html");
      check("T1 runtime.html === page.content()", runtimeBytes.toString("utf8") === run1.runtimeHtml);
      check("T1 runtime DOM differs from served bytes", !runtimeBytes.equals(responseBytes));
      check("T1 runtime DOM carries the script-inserted marker", runtimeBytes.toString("utf8").includes('id="runtime-marker"'));
      check("T1 served document does NOT carry the marker element", !run1.servedBody.toString("utf8").includes('id="runtime-marker"'));
      check("T1 runtimeDom record sha256 matches file", m1.document.runtimeDom.sha256 === sha256(runtimeBytes));
      check("T1 runtimeDom note says snapshot only", /snapshot/i.test(m1.document.runtimeDom.note) && /no listeners/i.test(m1.document.runtimeDom.note));
      check("T1 initial witness parsed", m1.evidence.initialDocumentWitness === "parsed");
      check(
        "T1 initialInventory counts scripts/links/style from the served bytes",
        m1.document.initialInventory?.scripts === 2 && m1.document.initialInventory.inlineScripts === 2 && m1.document.initialInventory.stylesheetLinks === 2 && m1.document.initialInventory.styleTags === 1 && m1.document.initialInventory.modulepreloadLinks === 1 && m1.document.initialInventory.preloadLinks === 1,
        JSON.stringify(m1.document.initialInventory),
      );
    }

    /* ---------------------------------------------------------------- */
    section("T2 linked CSS raw source captured verbatim");
    {
      const linked = run1.pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${main.baseUrl}/a.css`);
      check("T2 same-origin linked sheet present", linked !== undefined);
      if (linked) {
        check("T2 authored.status captured", linked.authored.status === "captured", linked.authored.status);
        check("T2 methods.networkBody captured", linked.methods.networkBody === "captured", linked.methods.networkBody);
        check("T2 methods.cssom readable", linked.methods.cssom === "readable", linked.methods.cssom);
        check("T2 rawBytesAvailable", linked.rawBytesAvailable === true);
        check("T2 declaredIn initial-document", linked.declaredIn === "initial-document", linked.declaredIn);
        check("T2 sameOrigin true", linked.sameOrigin === true);
        const file = linked.authored.file ? await readFile(path.join(run1.dir, linked.authored.file), "utf8") : "";
        check("T2 file bytes === served CSS byte-for-byte", file === SAME_ORIGIN_CSS);
        check("T2 authored sha256 matches", linked.authored.sha256 === sha256(SAME_ORIGIN_CSS));
        for (const token of ["50%", "100vw", "calc(100% - 40px)", "clamp(10rem, 20vw, 30rem)", "@media (max-width:900px)", "@supports (display:grid)", "@container card", "aspect-ratio:16/9", "1fr 2fr min-content", "--gap:2rem"]) {
          check(`T2 authored token preserved: ${token}`, file.includes(token));
        }
        check("T2 .a width is NOT flattened to px", !/\.a\{[^}]*width:\d+px/.test(file));
        check("T2 cssom counts media/supports/container/font-face", linked.cssom.mediaRules === 1 && linked.cssom.supportsRules === 1 && linked.cssom.containerRules === 1 && linked.cssom.fontFaceRules === 1, JSON.stringify(linked.cssom));
        check("T2 cssom counts custom property declarations", linked.cssom.customPropertyDeclarations === 2, String(linked.cssom.customPropertyDeclarations));
        check("T2 cssom mediaConditions lists the authored query", (linked.cssom.mediaConditions ?? []).some((c) => c.includes("900px")), JSON.stringify(linked.cssom.mediaConditions));
        check("T2 preservability LOCALIZABLE (url() inside)", linked.preservability === "LOCALIZABLE", linked.preservability);
        check("T2 cssomSerialized NOT duplicated for a linked sheet with bytes", linked.cssomSerialized === undefined);
      }
      check("T2 counts.styles.rawBytesCaptured >= 3 (2 linked + style tag)", m1.counts.styles.rawBytesCaptured >= 3, String(m1.counts.styles.rawBytesCaptured));
      const font = run1.pkg.assets.entries.find((a) => a.kind === "font-face");
      check("T2 @font-face url resolved against the sheet", font?.url === `${main.baseUrl}/fonts/fx.woff2`, String(font?.url));
      check("T2 @font-face family recorded", font?.attributes?.family?.includes("Fx") === true, JSON.stringify(font?.attributes));
    }

    /* ---------------------------------------------------------------- */
    section("T3 runtime <style> CSS captured");
    {
      // Rule: a <style> with EMPTY text whose rules exist only in the CSSOM (insertRule) is
      // `cssom-runtime`; a <style> with authored text is `style-tag` even if it carries a
      // CSS-in-JS marker. The emotion element below has empty text → cssom-runtime.
      const runtime = run1.pkg.styles.entries.find((s) => s.ownerAttributes?.["data-emotion"] !== undefined);
      check("T3 data-emotion style element inventoried", runtime !== undefined);
      check("T3 empty-text data-emotion element is sourceType cssom-runtime", runtime?.sourceType === "cssom-runtime", String(runtime?.sourceType));
      if (runtime) {
        check("T3 runtime markers include data-emotion", runtime.runtimeStyleMarkers?.includes("data-emotion") === true, JSON.stringify(runtime.runtimeStyleMarkers));
        check("T3 methods.styleTagText empty", runtime.methods.styleTagText === "empty", runtime.methods.styleTagText);
        check("T3 cssomSerialized.status captured", runtime.cssomSerialized?.status === "captured", String(runtime.cssomSerialized?.status));
        const file = runtime.cssomSerialized?.file ? await readFile(path.join(run1.dir, runtime.cssomSerialized.file), "utf8") : "";
        check("T3 serialized file contains the inserted rule (width: 33%)", /\.e\s*\{\s*width:\s*33%;?\s*\}/.test(file), file.slice(0, 80));
        check("T3 declaredIn runtime-injected", runtime.declaredIn === "runtime-injected", runtime.declaredIn);
        check("T3 preservability PRESERVABLE (snapshot)", runtime.preservability === "PRESERVABLE", runtime.preservability);
        check("T3 ownerAttributes carries data-emotion=css", runtime.ownerAttributes?.["data-emotion"] === "css", JSON.stringify(runtime.ownerAttributes));
      }
      const tag = run1.pkg.styles.entries.find((s) => s.sourceType === "style-tag" && s.ownerAttributes?.["data-emotion"] === undefined);
      check("T3 style-tag entry present (authored <style> text)", tag !== undefined);
      if (tag) {
        check("T3 style-tag authored captured", tag.authored.status === "captured", tag.authored.status);
        const file = tag.authored.file ? await readFile(path.join(run1.dir, tag.authored.file), "utf8") : "";
        check("T3 style-tag text equals authored text", file === STYLE_TAG_TEXT, file);
        check("T3 style-tag declaredIn initial-document", tag.declaredIn === "initial-document", tag.declaredIn);
        check("T3 style-tag var()/calc() preserved", file.includes("calc(100% - 2 * var(--gap))"));
      }
      check("T3 counts.styles.cssomRuntime === 1 (exactly the one empty-text style element)", m1.counts.styles.cssomRuntime === 1, String(m1.counts.styles.cssomRuntime));
      check("T3 frameworkEvidence reports emotion", m1.frameworkEvidence.some((f) => f.framework.startsWith("emotion")), JSON.stringify(m1.frameworkEvidence));
    }

    /* ---------------------------------------------------------------- */
    section("T4 cross-origin / unreadable stylesheet represented, not hidden");
    {
      const xo = run1.pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${cross.baseUrl}/x.css`);
      check("T4 cross-origin linked sheet present", xo !== undefined);
      if (xo) {
        check("T4 cssom.readable === false", xo.cssom.readable === false);
        check("T4 cssom.error names SecurityError", /SecurityError|cssRules|Cannot access/i.test(xo.cssom.error ?? ""), String(xo.cssom.error));
        check("T4 methods.cssom blocked", xo.methods.cssom === "blocked", xo.methods.cssom);
        check("T4 methods.networkBody captured (wire body still arrives)", xo.methods.networkBody === "captured", xo.methods.networkBody);
        check("T4 rawBytesAvailable true", xo.rawBytesAvailable === true);
        check("T4 sameOrigin false", xo.sameOrigin === false);
        const file = xo.authored.file ? await readFile(path.join(run1.dir, xo.authored.file), "utf8") : "";
        check("T4 cross-origin bytes byte-exact", file === CROSS_ORIGIN_CSS);
        check("T4 reasons mention CSSOM blocked", xo.reasons.some((r) => /CSSOM blocked/.test(r)), JSON.stringify(xo.reasons));
      }
      check("T4 counts.styles.cssomBlocked === 1", m1.counts.styles.cssomBlocked === 1, String(m1.counts.styles.cssomBlocked));
      check("T4 counts.styles.crossOrigin === 1", m1.counts.styles.crossOrigin === 1, String(m1.counts.styles.crossOrigin));
      check("T4 evidence.directFetchFallback enabled by default", m1.evidence.directFetchFallback === "enabled");
      const directFetchValues = new Set(["fetched", "not-attempted", "failed", "skipped-by-size", "skipped-by-policy"]);
      check("T4 every methods.directFetch is a documented enum value", run1.pkg.styles.entries.every((s) => directFetchValues.has(s.methods.directFetch)));

      // Policy run: stylesheet bodies skipped by policy — the failure must be VISIBLE.
      const policy = await captureFixture(browser, `${main.baseUrl}/`, "policy", { bodyPolicy: { stylesheet: false }, directFetchFallback: false });
      const pl = policy.pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${main.baseUrl}/a.css`);
      check("T4 policy run: networkBody skipped-by-policy", pl?.methods.networkBody === "skipped-by-policy", String(pl?.methods.networkBody));
      check("T4 policy run: directFetch skipped-by-policy (fallback disabled)", pl?.methods.directFetch === "skipped-by-policy", String(pl?.methods.directFetch));
      check("T4 policy run: authored not captured, but CSSOM-serialized fallback exists", pl?.authored.status !== "captured" && pl?.cssomSerialized?.status === "captured", `${pl?.authored.status}/${pl?.cssomSerialized?.status}`);
      check("T4 policy run: reasons say only a normalized copy exists", pl?.reasons.some((r) => /CSSOM-serialized/.test(r)) === true, JSON.stringify(pl?.reasons));
      check("T4 policy run: manifest.bodyPolicy.stylesheet === false", policy.pkg.manifest.bodyPolicy.stylesheet === false);
      check("T4 policy run: evidence.directFetchFallback disabled", policy.pkg.manifest.evidence.directFetchFallback === "disabled");
      check("T4 policy run: accounting.skippedByPolicy counted", policy.pkg.manifest.accounting.skippedByPolicy.count >= 1, String(policy.pkg.manifest.accounting.skippedByPolicy.count));

      // Direct-fetch run: hand-built network with NO entry for the sheet → fallback fetch.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      try {
        await stubEmbedHost(page);
        const resp = await page.goto(`${main.baseUrl}/`, { waitUntil: "load", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await installBrowserNameShim(page);
        const { limits, bodyPolicy } = resolveSourceCaptureOptions({});
        const inventory = await page.evaluate(collectSourceInventoryInBrowser, {
          maxInventoryEntries: limits.maxInventoryEntries,
          maxElementsWalked: limits.maxElementsWalked,
          maxRulesPerSheet: limits.maxRulesPerSheet,
          maxInlineTextBytes: limits.maxInlineTextBytes,
          maxMediaConditions: 300,
          windowGlobals: ["__NEXT_DATA__"],
          sensitiveConfigKeyPattern: "(secret|token)",
        });
        const emptyNetwork: RecordedNetwork = {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 0,
          entries: [],
          stats: { seen: 0, recorded: 0, overflowNotRecorded: 0, bodiesCaptured: 0, bytesCaptured: 0, bytesByClass: {}, skippedBySize: 0, skippedBySizeBytes: 0, skippedByPolicy: 0, bodyUnavailable: 0, failed: 0 },
          initiatorEvidence: "cdp-unavailable",
          initiatorReason: "hand-built network (test)",
        };
        const body = await resp!.body();
        const allow = new Set([`127.0.0.1:${main.port}`, `127.0.0.1:${cross.port}`]);
        const pkg = await assembleSourcePackage({
          input: {
            requestedUrl: `${main.baseUrl}/`,
            viewport: { id: "desktop", width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
            engine: "playwright-chromium",
            initialDocument: { status: "captured", url: resp!.url(), httpStatus: 200, contentType: "text/html; charset=utf-8", bytes: body.byteLength, sha256: sha256(body), charset: "utf-8" },
            documentResponseBody: body,
            runtimeHtml: await page.content(),
          },
          inventory,
          network: emptyNetwork,
          limits,
          bodyPolicy,
          limitations: [],
          directFetch: true,
          allowPrivateHostPorts: allow,
          page: null,
          log: () => {},
        });
        const df = pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${main.baseUrl}/a.css`);
        check("T4 direct-fetch: networkBody unavailable (no wire entry)", df?.methods.networkBody === "unavailable", String(df?.methods.networkBody));
        check("T4 direct-fetch: methods.directFetch fetched", df?.methods.directFetch === "fetched", String(df?.methods.directFetch));
        check("T4 direct-fetch: authored captured", df?.authored.status === "captured", String(df?.authored.status));
        const blob = pkg.blobs.find((b) => b.file === df?.authored.file);
        check("T4 direct-fetch: bytes match served CSS", blob?.data.toString("utf8") === SAME_ORIGIN_CSS);
        check("T4 direct-fetch: reasons record the method", df?.reasons.some((r) => /direct HTTP fetch/.test(r)) === true, JSON.stringify(df?.reasons));
        check("T4 direct-fetch: counts.styles.directFetched >= 1", pkg.manifest.counts.styles.directFetched >= 1, String(pkg.manifest.counts.styles.directFetched));
        const xdf = pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${cross.baseUrl}/x.css`);
        check("T4 direct-fetch: cross-origin sheet also recovered by fetch", xdf?.methods.directFetch === "fetched" && xdf.authored.status === "captured", `${xdf?.methods.directFetch}/${xdf?.authored.status}`);
        check("T4 direct-fetch: evidence.initiator cdp-unavailable is recorded honestly", pkg.manifest.evidence.initiator === "cdp-unavailable" && pkg.manifest.limitations.some((l) => /initiator evidence unavailable/.test(l)));

        // Same hand-built network, fallback DISABLED and page null → UNAVAILABLE, not hidden.
        const pkgOff = await assembleSourcePackage({
          input: {
            requestedUrl: `${main.baseUrl}/`,
            viewport: { id: "desktop", width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
            engine: "playwright-chromium",
            initialDocument: { status: "captured", url: resp!.url(), httpStatus: 200, contentType: "text/html; charset=utf-8", bytes: body.byteLength, sha256: sha256(body), charset: "utf-8" },
            documentResponseBody: body,
            runtimeHtml: await page.content(),
          },
          inventory,
          network: emptyNetwork,
          limits,
          bodyPolicy,
          limitations: [],
          directFetch: false,
          page: null,
          log: () => {},
        });
        const xoff = pkgOff.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${cross.baseUrl}/x.css`);
        check("T4 no-wire/no-fetch/no-page: cross-origin sheet is UNAVAILABLE", xoff?.preservability === "UNAVAILABLE" && xoff.rawBytesAvailable === false, `${xoff?.preservability}/${xoff?.rawBytesAvailable}`);
        check("T4 no-wire/no-fetch/no-page: counts.styles.unavailable >= 1", pkgOff.manifest.counts.styles.unavailable >= 1, String(pkgOff.manifest.counts.styles.unavailable));
      } finally {
        await context.close();
      }
    }

    /* ---------------------------------------------------------------- */
    section("T5 module / classic / inline script inventory");
    {
      const scripts = run1.pkg.scripts.entries;
      const classic = scripts.find((s) => s.src === `${main.baseUrl}/c.js`);
      const mod = scripts.find((s) => s.src === `${main.baseUrl}/m.js`);
      const inline = scripts.filter((s) => s.inline);
      check("T5 classic external script present", classic !== undefined);
      check("T5 module external script present", mod !== undefined);
      check("T5 exactly one inline JS script (JSON data script excluded)", inline.length === 1, String(inline.length));
      check("T5 classic kind", classic?.kind === "classic", String(classic?.kind));
      check("T5 module kind", mod?.kind === "module" && mod.typeAttr === "module", String(mod?.kind));
      check("T5 inline kind classic + inline flag", inline[0]?.kind === "classic" && inline[0].inline === true);
      check("T5 all three declaredIn initial-document", classic?.declaredIn === "initial-document" && mod?.declaredIn === "initial-document" && inline[0]?.declaredIn === "initial-document", `${classic?.declaredIn}/${mod?.declaredIn}/${inline[0]?.declaredIn}`);
      if (cdp) {
        check("T5 classic initiatorType parser", classic?.network?.initiatorType === "parser", String(classic?.network?.initiatorType));
        check("T5 module initiatorType parser", mod?.network?.initiatorType === "parser", String(mod?.network?.initiatorType));
      } else {
        check("T5 (WARN) CDP unavailable — initiator assertions skipped", true);
        check("T5 (WARN) CDP unavailable — initiator assertions skipped", true);
      }
      check("T5 classic body captured", classic?.body.status === "captured", String(classic?.body.status));
      check("T5 module body captured", mod?.body.status === "captured", String(mod?.body.status));
      const cFile = classic?.body.file ? await readFile(path.join(run1.dir, classic.body.file), "utf8") : "";
      const mFile = mod?.body.file ? await readFile(path.join(run1.dir, mod.body.file), "utf8") : "";
      check("T5 classic file bytes === served JS", cFile === CLASSIC_JS);
      check("T5 module file bytes === served JS", mFile === MODULE_JS);
      check("T5 inline body captured (text)", inline[0]?.body.status === "captured", String(inline[0]?.body.status));
      const iFile = inline[0]?.body.file ? await readFile(path.join(run1.dir, inline[0].body.file), "utf8") : "";
      check("T5 inline file holds the inline text", iFile.includes("runtime-marker"));
      check("T5 executionIndependence unknown on every script", scripts.every((s) => s.executionIndependence === "unknown"));
      check("T5 downloadable true for captured external scripts", classic?.downloadable === true && mod?.downloadable === true);
      check("T5 preservability UNKNOWN for downloadable scripts (never 'reusable')", classic?.preservability === "UNKNOWN" && mod?.preservability === "UNKNOWN", `${classic?.preservability}/${mod?.preservability}`);
      check("T5 network.loaded true", classic?.network?.loaded === true && mod?.network?.loaded === true);
      check("T5 counts.scripts documentDeclared === 3", m1.counts.scripts.documentDeclared === 3, String(m1.counts.scripts.documentDeclared));
      check("T5 counts.scripts module/classic", m1.counts.scripts.module === 1 && m1.counts.scripts.classic === 2, `${m1.counts.scripts.module}/${m1.counts.scripts.classic}`);
      const nd = run1.pkg.config.entries.find((c) => c.kind === "next-data");
      check("T5 __NEXT_DATA__ landed in config as next-data (not a script)", nd !== undefined && nd.name === "__NEXT_DATA__" && nd.body?.status === "captured" && nd.parseable === true, JSON.stringify(nd?.kind));
      check("T5 next-data declaredIn initial-document", nd?.declaredIn === "initial-document", String(nd?.declaredIn));
      const ndText = nd?.body?.file ? await readFile(path.join(run1.dir, nd.body.file), "utf8") : "";
      check("T5 next-data config copy redacts secret-shaped keys (apiToken → [redacted]) while response.html keeps raw bytes", ndText.includes('"apiToken":"[redacted]"') && nd?.redactedKeys?.includes("apiToken") === true && run1.servedBody.toString("utf8").includes('"apiToken":"NEXTSECRET_3c9d"'), `${ndText.slice(0, 120)} / ${JSON.stringify(nd?.redactedKeys)}`);
      const mp = run1.pkg.config.entries.find((c) => c.kind === "modulepreload-link");
      check("T5 modulepreload link captured as config", mp?.url === `${main.baseUrl}/m.js` && mp.declaredIn === "initial-document", JSON.stringify(mp));
      check("T5 frameworkEvidence reports next.js via __NEXT_DATA__", m1.frameworkEvidence.some((f) => f.framework === "next.js"), JSON.stringify(m1.frameworkEvidence));
    }

    /* ---------------------------------------------------------------- */
    section("T6 runtime-loaded JS chunk (dynamic import) in the network manifest");
    {
      const chunkUrl = `${main.baseUrl}/chunk.js`;
      const n = run1.pkg.network.entries.find((e) => e.url === chunkUrl);
      check("T6 network entry for /chunk.js", n !== undefined);
      check("T6 dependencyClass JS_CHUNK", n?.dependencyClass === "JS_CHUNK", String(n?.dependencyClass));
      check("T6 body captured", n?.body.status === "captured", String(n?.body.status));
      check("T6 body file exists and equals served chunk", n?.body.file !== undefined && (await readFile(path.join(run1.dir, n.body.file), "utf8")) === CHUNK_JS);
      const s = run1.pkg.scripts.entries.find((e) => e.src === chunkUrl);
      check("T6 scripts entry declaredIn runtime-loaded", s?.declaredIn === "runtime-loaded", String(s?.declaredIn));
      check("T6 scripts entry kind other (no DOM element)", s?.kind === "other", String(s?.kind));
      check("T6 scripts entry shares the network blob file", s?.body.file === n?.body.file, `${s?.body.file} vs ${n?.body.file}`);
      if (cdp) {
        check("T6 initiator.type script (dynamic import)", n?.initiator?.type === "script", String(n?.initiator?.type));
        check("T6 initiator stackTopUrl or url names m.js", /m\.js$/.test(n?.initiator?.stackTopUrl ?? n?.initiator?.url ?? ""), JSON.stringify(n?.initiator));
      } else {
        check("T6 (WARN) CDP unavailable — initiator assertions skipped", true);
        check("T6 (WARN) CDP unavailable — initiator assertions skipped", true);
      }
      check("T6 counts.scripts.runtimeLoadedChunks === 1", m1.counts.scripts.runtimeLoadedChunks === 1, String(m1.counts.scripts.runtimeLoadedChunks));
      // Child-frame (youtube embed) scripts are JS_CHUNK too, and their number is not ours to
      // control; the fixture's own chunk count is proven on main-frame entries only.
      const mainJsChunks = run1.pkg.network.entries.filter((e) => e.frame === "main" && e.dependencyClass === "JS_CHUNK");
      check("T6 main-frame JS_CHUNK entries === 3 (c.js, m.js, chunk.js)", mainJsChunks.length === 3, mainJsChunks.map((e) => e.url).join(","));
      check("T6 counts.network.byClass.JS_CHUNK >= 3", (m1.counts.network.byClass.JS_CHUNK ?? 0) >= 3, JSON.stringify(m1.counts.network.byClass));
      const api = run1.pkg.network.entries.find((e) => e.url.startsWith(`${main.baseUrl}/api/data`));
      // JSON response BODIES are captured by default (T13); API_DATA stays ORIGIN_BOUND
      // regardless — bytes are evidence, not a claim that the endpoint is replayable.
      check("T6 API fetch classified API_DATA / apiLike / ORIGIN_BOUND, JSON body captured by default", api?.dependencyClass === "API_DATA" && api.apiLike && api.preservability === "ORIGIN_BOUND" && api.body.status === "captured", JSON.stringify([api?.dependencyClass, api?.preservability, api?.body.status]));
      const doc = run1.pkg.network.entries.find((e) => e.navigation && e.frame === "main");
      check("T6 main document entry DOCUMENT / body not-applicable", doc?.dependencyClass === "DOCUMENT" && doc.body.status === "not-applicable", JSON.stringify([doc?.dependencyClass, doc?.body.status]));
      const yt = run1.pkg.network.entries.filter((e) => e.frame === "child");
      check("T6 child-frame (youtube) requests recorded with no bodies", yt.length > 0 && yt.every((e) => e.body.status !== "captured"), String(yt.length));
      check("T6 counts.network.childFrame matches", m1.counts.network.childFrame === yt.length);
      const ifr = run1.pkg.assets.entries.find((a) => a.kind === "iframe");
      check("T6 iframe asset EXTERNAL_EMBED youtube", ifr?.preservability === "EXTERNAL_EMBED" && ifr.providerHint === "youtube", JSON.stringify([ifr?.preservability, ifr?.providerHint]));
    }

    /* ---------------------------------------------------------------- */
    section("T7 resource size cap");
    {
      const cap = await captureFixture(browser, `${main.baseUrl}/cap`, "cap", { limits: { maxScriptBodyBytes: 1024 } });
      const big = cap.pkg.scripts.entries.find((s) => s.src === `${main.baseUrl}/big.js`);
      const small = cap.pkg.scripts.entries.find((s) => s.src === `${main.baseUrl}/small.js`);
      check("T7 big script body skipped-by-size", big?.body.status === "skipped-by-size", String(big?.body.status));
      check("T7 big script bytes ≈ 4 KB reported", (big?.body.bytes ?? 0) >= 4096 && (big?.body.bytes ?? 0) < 4300, String(big?.body.bytes));
      check("T7 big script reason names the cap", /cap 1024/.test(big?.body.reason ?? ""), String(big?.body.reason));
      check("T7 big script downloadable false / preservability UNKNOWN (not UNAVAILABLE)", big?.downloadable === false && big.preservability === "UNKNOWN", `${big?.downloadable}/${big?.preservability}`);
      check("T7 small sibling script still captured", small?.body.status === "captured", String(small?.body.status));
      check("T7 accounting.skippedBySize.count >= 1", cap.pkg.manifest.accounting.skippedBySize.count >= 1, String(cap.pkg.manifest.accounting.skippedBySize.count));
      check("T7 accounting.skippedBySize.bytes >= 4096", cap.pkg.manifest.accounting.skippedBySize.bytes >= 4096, String(cap.pkg.manifest.accounting.skippedBySize.bytes));
      check("T7 counts.scripts.skippedBySize === 1", cap.pkg.manifest.counts.scripts.skippedBySize === 1, String(cap.pkg.manifest.counts.scripts.skippedBySize));
      check("T7 manifest.limits records the override", cap.pkg.manifest.limits.maxScriptBodyBytes === 1024);
      check("T7 no blob written for the skipped script", !(await listFilesRecursive(cap.dir)).some((f) => f.startsWith("scripts/") && f.includes(big?.id ?? "zzz")));
      const nb = cap.pkg.network.entries.find((e) => e.url === `${main.baseUrl}/big.js`);
      check("T7 network entry mirrors skipped-by-size", nb?.body.status === "skipped-by-size", String(nb?.body.status));
    }

    /* ---------------------------------------------------------------- */
    section("T13 JSON response body capture: default ON, opt-out, dedicated caps, integrity");
    {
      // A. Default configuration → JSON response body is captured (bytes/hash/manifest correct).
      const api = run1.pkg.network.entries.find((e) => e.url.startsWith(`${main.baseUrl}/api/data`));
      check("T13a manifest.bodyPolicy.json === true by default", run1.pkg.manifest.bodyPolicy.json === true);
      check("T13a default run: JSON body captured", api?.body.status === "captured", String(api?.body.status));
      const apiJsonText = '{"ok":true}';
      check("T13f byte count correct", api?.body.bytes === Buffer.byteLength(apiJsonText), String(api?.body.bytes));
      check("T13f sha256 correct", api?.body.sha256 === sha256(apiJsonText), String(api?.body.sha256));
      const apiFile = api?.body.file ? await readFile(path.join(run1.dir, api.body.file), "utf8") : undefined;
      check("T13f manifest body reference resolves to the stored bytes", apiFile === apiJsonText, String(apiFile));
      check("T13h redaction: token query key still redacted on a captured JSON entry", api?.redaction?.redactedQueryKeys?.includes("token") === true, JSON.stringify(api?.redaction));

      // B. Explicit opt-out → JSON response body is not captured; G. other body policies unaffected.
      const optOut = await captureFixture(browser, `${main.baseUrl}/`, "json-opt-out", { bodyPolicy: { json: false } });
      const apiOff = optOut.pkg.network.entries.find((e) => e.url.startsWith(`${main.baseUrl}/api/data`));
      check("T13b manifest.bodyPolicy.json === false when opted out", optOut.pkg.manifest.bodyPolicy.json === false);
      check("T13b opt-out: JSON body skipped-by-policy", apiOff?.body.status === "skipped-by-policy", String(apiOff?.body.status));
      check("T13b opt-out: reason names bodyPolicy.json", /bodyPolicy\.json=false/.test(apiOff?.body.reason ?? ""), String(apiOff?.body.reason));
      const linkedOff = optOut.pkg.styles.entries.find((s) => s.sourceType === "linked" && s.url === `${main.baseUrl}/a.css`);
      const scriptOff = optOut.pkg.scripts.entries.find((s) => s.src === `${main.baseUrl}/c.js`);
      check("T13g json opt-out does not affect stylesheet body policy", linkedOff?.authored.status === "captured", String(linkedOff?.authored.status));
      check("T13g json opt-out does not affect script body policy", scriptOff?.body.status === "captured", String(scriptOff?.body.status));
      check("T13h redaction unchanged with json off", apiOff?.redaction?.redactedQueryKeys?.includes("token") === true, JSON.stringify(apiOff?.redaction));

      // D/E. Dedicated per-body and total JSON caps (three sequential, awaited fetches → deterministic seq order).
      const perBody = await captureFixture(browser, `${main.baseUrl}/json-cap`, "json-per-body-cap", { limits: { maxJsonBodyBytes: 500 } });
      const j1PerBody = perBody.pkg.network.entries.find((e) => e.url === `${main.baseUrl}/api/j1`);
      check("T13d JSON body above per-body limit → skipped-by-size", j1PerBody?.body.status === "skipped-by-size", String(j1PerBody?.body.status));
      check("T13d reason names the per-body cap", /cap 500/.test(j1PerBody?.body.reason ?? ""), String(j1PerBody?.body.reason));

      const totalBudget = await captureFixture(browser, `${main.baseUrl}/json-cap`, "json-total-cap", { limits: { maxJsonBodyBytes: 4096, maxTotalJsonBytes: 4500 } });
      const j1 = totalBudget.pkg.network.entries.find((e) => e.url === `${main.baseUrl}/api/j1`);
      const j2 = totalBudget.pkg.network.entries.find((e) => e.url === `${main.baseUrl}/api/j2`);
      const j3 = totalBudget.pkg.network.entries.find((e) => e.url === `${main.baseUrl}/api/j3`);
      check("T13e j1 under total budget → captured", j1?.body.status === "captured", String(j1?.body.status));
      check("T13e j2 under total budget → captured", j2?.body.status === "captured", String(j2?.body.status));
      check("T13e j3 exceeds total JSON budget → skipped-by-size, deterministically the later body", j3?.body.status === "skipped-by-size", String(j3?.body.status));
      check("T13e reason names the total json cap", /total json cap 4500/.test(j3?.body.reason ?? ""), String(j3?.body.reason));
      check("T13e manifest.limits records the JSON overrides", totalBudget.pkg.manifest.limits.maxJsonBodyBytes === 4096 && totalBudget.pkg.manifest.limits.maxTotalJsonBytes === 4500, JSON.stringify(totalBudget.pkg.manifest.limits));

      // I. Request headers/cookies/POST bodies remain uncaptured regardless of JSON policy — T8
      // proves this on the SAME fixture traffic (including this /api/data JSON entry).
      const offendersJ = Object.keys(api?.headers ?? {}).filter((k) => !new Set<string>(SAFE_RESPONSE_HEADERS).has(k));
      check("T13i no header outside the safe allowlist on the JSON entry", offendersJ.length === 0, offendersJ.join(","));
    }

    /* ---------------------------------------------------------------- */
    section("T8 sensitive headers / query tokens / POST bodies are NOT stored");
    {
      const safe = new Set<string>(SAFE_RESPONSE_HEADERS);
      const offenders: string[] = [];
      for (const e of run1.pkg.network.entries) for (const k of Object.keys(e.headers)) if (!safe.has(k)) offenders.push(`${e.id}:${k}`);
      check("T8 no network entry has a header outside SAFE_RESPONSE_HEADERS", offenders.length === 0, offenders.join(","));
      check("T8 network entries DID record safe headers (content-type)", run1.pkg.network.entries.some((e) => e.headers["content-type"] !== undefined));
      for (const [label, secret] of [["set-cookie value", SECRET_COOKIE], ["authorization value", SECRET_AUTH], ["x-auth-token value", SECRET_TOKEN_HDR], ["x-api-key value", SECRET_API_KEY], ["POST payload", POST_PAYLOAD]] as const) {
        // The POST payload is authored in the fixture's inline script, so the served document and
        // the inline-script blob (verbatim authored source) legitimately contain it.
        const hits = await grepFiles(run1.dir, secret, label === "POST payload" ? ["document/response.html", "document/runtime.html", ...files1.filter((f) => f.startsWith("scripts/"))] : []);
        check(`T8 ${label} appears in NO package file`, hits.length === 0, hits.join(","));
      }
      // The POST payload is authored inline in the fixture's own HTML, so it is legitimately
      // inside document/*.html and the inline-script blob; what must be absent is any
      // network-side copy. Prove it against the network + scripts manifests only.
      const netManifest = await readFile(path.join(run1.dir, "network", "manifest.json"), "utf8");
      check("T8 POST payload absent from network manifest", !netManifest.includes(POST_PAYLOAD));
      const post = run1.pkg.network.entries.find((e) => e.method === "POST" && e.url === `${main.baseUrl}/api/post`);
      check("T8 POST request recorded with hasPostData true", post?.hasPostData === true);
      check("T8 POST request records postDataBytes only", post?.postDataBytes === Buffer.byteLength(POST_PAYLOAD), String(post?.postDataBytes));
      check("T8 POST request body not captured", post?.body.status !== "captured", String(post?.body.status));
      const tok = run1.pkg.network.entries.find((e) => e.url.startsWith(`${main.baseUrl}/api/data`));
      check("T8 ?token=abc recorded redacted", tok !== undefined && /token=(%5Bredacted%5D|\[redacted\])/.test(tok.url) && !tok.url.includes("token=abc"), String(tok?.url));
      check("T8 redaction.redactedQueryKeys contains token", tok?.redaction?.redactedQueryKeys?.includes("token") === true, JSON.stringify(tok?.redaction));
      check("T8 benign query key v=1 kept", tok?.url.includes("v=1") === true, String(tok?.url));
      check("T8 'token=abc' absent from every manifest", (await grepFiles(run1.dir, "token=abc", ["document/response.html", "document/runtime.html", ...files1.filter((f) => f.startsWith("scripts/"))])).length === 0);
      check("T8 no 'cookie' key in any network headers object", !netManifest.includes('"set-cookie"') && !netManifest.includes('"cookie"'));
    }

    /* ---------------------------------------------------------------- */
    section("T9 old artifact without Source Package still loads");
    {
      const candidates = [
        "data/apartmentary.com/site-observations",
      ];
      let oldObservation: string | undefined;
      for (const root of candidates) {
        if (!existsSync(root)) continue;
        const runs = (await readdir(root)).sort().reverse();
        for (const run of runs) {
          const file = path.join(root, run, "pages", "p000001", "observation.json");
          if (existsSync(file)) {
            const raw = JSON.parse(await readFile(file, "utf8")) as { viewports?: { desktop?: Record<string, unknown> } };
            if (raw.viewports?.desktop && !("sourcePackage" in raw.viewports.desktop)) {
              oldObservation = file;
              break;
            }
          }
        }
        if (oldObservation) break;
      }
      if (oldObservation) {
        const raw = JSON.parse(await readFile(oldObservation, "utf8")) as unknown;
        const parsed = PageObservationSchema.safeParse(raw);
        check(`T9a pre-Phase-1 observation.json parses (${oldObservation})`, parsed.success, parsed.success ? "" : parsed.error.issues.slice(0, 2).map((i) => i.message).join("; "));
        check("T9a parsed desktop.sourcePackage is undefined", parsed.success && parsed.data.viewports.desktop.sourcePackage === undefined);
        check("T9a parsed mobile.sourcePackage is undefined", parsed.success && parsed.data.viewports.mobile.sourcePackage === undefined);
        check("T9a parsed sizes has no sourcePackageBytes", parsed.success && parsed.data.viewports.desktop.sizes.sourcePackageBytes === undefined);
      } else {
        check("T9a (SKIPPED) no pre-Phase-1 observation.json under data/ — synthetic check below covers it", true);
      }
      // Synthetic: strip the key from a freshly parsed pointer-bearing viewport shape.
      const pointerShape = ViewportObservationSchema.shape.sourcePackage;
      check("T9b ViewportObservationSchema.sourcePackage accepts undefined", pointerShape.safeParse(undefined).success);
      check("T9b SourcePackagePointerSchema rejects a wrong schemaVersion", !SourcePackagePointerSchema.safeParse({ schemaVersion: 99 }).success);
      check("T9c SCHEMA_VERSION unchanged at 5", (SCHEMA_VERSION as number) === 5, String(SCHEMA_VERSION));
      check("T9c READABLE_SCHEMA_VERSIONS still 3,4,5", [3, 4, 5].every((v) => (READABLE_SCHEMA_VERSIONS as readonly number[]).includes(v)), JSON.stringify(READABLE_SCHEMA_VERSIONS));
    }

    /* ---------------------------------------------------------------- */
    section("T10 deterministic ordering / hashing");
    {
      const run2 = await captureFixture(browser, `${main.baseUrl}/`, "run2");
      const m2 = run2.pkg.manifest;
      check("T10 contentHash identical across two captures", m1.contentHash === m2.contentHash, `${m1.contentHash.slice(0, 12)} vs ${m2.contentHash.slice(0, 12)}`);
      check("T10 contentHash is a sha256 hex", /^[0-9a-f]{64}$/.test(m1.contentHash));
      // counts.network / accounting include the youtube child frame's own traffic, which is not
      // under fixture control; determinism is asserted on everything the fixture owns.
      const ownCounts = (m: typeof m1) => JSON.stringify({ styles: m.counts.styles, scripts: m.counts.scripts, assets: m.counts.assets, config: m.counts.config });
      check("T10 styles/scripts/assets/config counts identical across two captures", ownCounts(m1) === ownCounts(m2), `${ownCounts(m1)} vs ${ownCounts(m2)}`);
      const mainNet = (pkg: SourcePackageCapture) => pkg.network.entries.filter((e) => e.frame === "main").map((e) => `${e.method} ${e.url} ${e.dependencyClass} ${e.body.status}`).join("\n");
      check("T10 main-frame network inventory identical across two captures", mainNet(run1.pkg) === mainNet(run2.pkg));
      const netKeys = run1.pkg.network.entries.map((e) => [e.url, e.method, e.seq] as const);
      let sorted = true;
      for (let i = 1; i < netKeys.length; i++) {
        const [ua, ma, sa] = netKeys[i - 1]!;
        const [ub, mb, sb] = netKeys[i]!;
        if (ua > ub || (ua === ub && (ma > mb || (ma === mb && sa > sb)))) sorted = false;
      }
      check("T10 network.entries sorted by (url, method, seq)", sorted);
      check("T10 network manifest declares its ordering", run1.pkg.network.ordering === "url,method,seq");
      const styleIds = run1.pkg.styles.entries.map((s) => s.id);
      check("T10 style ids are st0001… sequential", styleIds.every((id, i) => id === `st${String(i + 1).padStart(4, "0")}`), styleIds.join(","));
      const orders = run1.pkg.styles.entries.filter((s) => s.sourceType !== "import").map((s) => s.order);
      check("T10 style order ascending (document.styleSheets index)", orders.every((o, i) => i === 0 || o >= orders[i - 1]!), orders.join(","));
      const stable = stableStringify(m1);
      const parsedKeys = Object.keys(JSON.parse(stable) as Record<string, unknown>);
      check("T10 stableStringify root keys sorted (first is accounting)", parsedKeys[0] === "accounting" && [...parsedKeys].sort().join() === parsedKeys.join(), parsedKeys.slice(0, 3).join(","));
      const written = await readFile(path.join(run1.dir, "manifest.json"), "utf8");
      check("T10 written manifest.json is the stable form", written === stable);
      check("T10 two runs' stable manifests differ ONLY in timing/capturedAt fields", (() => {
        const strip = (m: typeof m1): string => stableStringify({ ...m, source: { ...m.source, capturedAt: "" }, observationWindow: { startedAt: "", endedAt: "", durationMs: 0, description: m.observationWindow.description } });
        return strip(m1) === strip(m2);
      })());
      const blobRe = /^(styles|scripts|config)\/[a-z]{2}\d{4}(\.cssom)?\.[0-9a-f]{12}\.[a-z0-9]+$|^document\/(response|runtime)\.html$|^network\/n\d{4}\.[0-9a-f]{12}\.[a-z0-9]+$|^(styles|scripts|assets|network|config)\/manifest\.json$|^manifest\.json$/;
      const bad = files1.filter((f) => !blobRe.test(f));
      check("T10 every written file name is content-addressed or a manifest", bad.length === 0, bad.join(","));
      const blobNames1 = files1.filter((f) => !f.endsWith("manifest.json") && !f.startsWith("document/"));
      const blobNames2 = (await listFilesRecursive(run2.dir)).filter((f) => !f.endsWith("manifest.json") && !f.startsWith("document/"));
      check("T10 blob file names identical across two captures", blobNames1.join("\n") === blobNames2.join("\n"));
      const stylesManifest = await readFile(path.join(run1.dir, "styles", "manifest.json"), "utf8");
      check("T10 sub-manifests are stable-stringified", stylesManifest === stableStringify(run1.pkg.styles));
    }

    /* ---------------------------------------------------------------- */
    section("T12 observer integration (opt-in persistence, opt-out neutrality)");
    {
      const evidenceRoot = path.join(OUT_ROOT, "evidence");
      await mkdir(evidenceRoot, { recursive: true });
      const common = { layoutProbe: false, prepareScroll: false, normalizePageState: false, pageStateEvidenceRoot: evidenceRoot, onLog: () => {} } as const;

      const onDir = path.join(OUT_ROOT, "obs-on");
      const observedOn = await observePageWithBrowser(browser, `${main.baseUrl}/no-embed`, { ...common, sourcePackage: true });
      check("T12 in-memory desktop viewport carries sourcePackage", observedOn.viewports.find((v) => v.profile.id === "desktop")?.sourcePackage !== undefined);
      check("T12 in-memory mobile viewport carries sourcePackage", observedOn.viewports.find((v) => v.profile.id === "mobile")?.sourcePackage !== undefined);
      const savedOn = await saveObservationIntoDir(onDir, observedOn);
      const dManifest = path.join(onDir, "viewports", "desktop", SOURCE_PACKAGE_DIR, "manifest.json");
      const mManifest = path.join(onDir, "viewports", "mobile", SOURCE_PACKAGE_DIR, "manifest.json");
      check("T12 desktop source-package/manifest.json written", existsSync(dManifest));
      check("T12 mobile source-package/manifest.json written", existsSync(mManifest));
      check("T12 pointer dir === viewports/desktop/source-package", savedOn.viewports.desktop.sourcePackage?.dir === "viewports/desktop/source-package", String(savedOn.viewports.desktop.sourcePackage?.dir));
      check("T12 pointer manifest path", savedOn.viewports.desktop.sourcePackage?.manifest === "viewports/desktop/source-package/manifest.json");
      check("T12 sizes.sourcePackageBytes > 0", (savedOn.viewports.desktop.sizes.sourcePackageBytes ?? 0) > 0, String(savedOn.viewports.desktop.sizes.sourcePackageBytes));
      check("T12 viewportTotalBytes includes the package", savedOn.viewports.desktop.sizes.viewportTotalBytes > savedOn.viewports.desktop.sizes.renderedHtmlBytes + (savedOn.viewports.desktop.sizes.sourcePackageBytes ?? 0) - 1);
      check("T12 pointer counts.styles matches manifest", (() => {
        const p = savedOn.viewports.desktop.sourcePackage;
        return p !== undefined && p.counts.styles >= 3 && p.counts.scripts >= 3 && p.initialDocument === "captured" && p.runtimeDom === "captured";
      })(), JSON.stringify(savedOn.viewports.desktop.sourcePackage?.counts));
      const dm = JSON.parse(await readFile(dManifest, "utf8")) as { source: { viewportId: string; requestedUrl: string }; document: { initial: { status: string; file?: string } } };
      check("T12 desktop manifest says viewportId desktop", dm.source.viewportId === "desktop");
      check("T12 desktop manifest initial document captured (observer's own navigation bytes)", dm.document.initial.status === "captured" && dm.document.initial.file === "document/response.html");
      const responseInPkg = await readFile(path.join(onDir, "viewports", "desktop", SOURCE_PACKAGE_DIR, "document", "response.html"));
      const responseInViewport = await readFile(path.join(onDir, "viewports", "desktop", "document-response.html"));
      check("T12 package response.html === viewport document-response.html (same bytes, no second request)", responseInPkg.equals(responseInViewport));
      const reparsed = PageObservationSchema.safeParse(JSON.parse(await readFile(path.join(onDir, "observation.json"), "utf8")));
      check("T12 written observation.json re-parses with the pointer", reparsed.success && reparsed.data.viewports.mobile.sourcePackage?.dir === "viewports/mobile/source-package", reparsed.success ? "" : reparsed.error.message.slice(0, 200));
      check("T12 mobile package hit counts the fixture (two loads = two document hits)", (main.hits.get("/no-embed") ?? 0) >= 2);

      const offDir = path.join(OUT_ROOT, "obs-off");
      const observedOff = await observePageWithBrowser(browser, `${main.baseUrl}/no-embed`, { ...common });
      check("T12 opt-out: no in-memory sourcePackage", observedOff.viewports.every((v) => v.sourcePackage === undefined));
      const savedOff = await saveObservationIntoDir(offDir, observedOff);
      check("T12 opt-out: observation has no sourcePackage key", savedOff.viewports.desktop.sourcePackage === undefined && savedOff.viewports.mobile.sourcePackage === undefined);
      check("T12 opt-out: no source-package directory created", !existsSync(path.join(offDir, "viewports", "desktop", SOURCE_PACKAGE_DIR)) && !existsSync(path.join(offDir, "viewports", "mobile", SOURCE_PACKAGE_DIR)));
      const offJson = await readFile(path.join(offDir, "observation.json"), "utf8");
      check("T12 opt-out: observation.json text contains no 'sourcePackage'", !offJson.includes("sourcePackage"));
      check("T12 opt-out: sizes has no sourcePackageBytes", savedOff.viewports.desktop.sizes.sourcePackageBytes === undefined);
      const sizeOn = (await stat(path.join(onDir, "observation.json"))).size;
      check("T12 both observation.json files exist", sizeOn > 0 && offJson.length > 0);
    }
  } finally {
    await browser.close();
    main.server.close();
    cross.server.close();
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${checks - failures}/${checks} checks passed (${seconds}s)`);
  if (failures > 0) {
    console.log("[smoke:source-package] FAILED");
    process.exitCode = 1;
  } else {
    console.log("[smoke:source-package] OK");
  }
}

main().catch((err) => {
  console.error(`[smoke:source-package] ERROR — ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exitCode = 1;
});
