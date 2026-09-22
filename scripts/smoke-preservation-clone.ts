/**
 * Targeted fixture smoke for the Preservation Clone builder (Phase 2).
 *
 * Everything runs against a synthetic Source Package and a throwaway localhost
 * origin — no captured site is read, no real host is contacted, and the whole
 * thing finishes in seconds. The fixture is built through the REAL Phase 1 zod
 * schemas, so if the Source Package contract changes underneath the builder,
 * this fails loudly instead of the next Apartmentary build failing mysteriously.
 *
 * What it proves is the list of things that would silently ruin a preservation
 * clone: the wrong DOM, executing JS, a duplicated or reordered cascade,
 * layout values flattened to pixels, and assets or residuals reported
 * dishonestly.
 */
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  SourcePackageManifestSchema,
  StylesManifestSchema,
  ScriptsManifestSchema,
  AssetsManifestSchema,
  NetworkManifestSchema,
  ConfigManifestSchema,
} from "../src/source-package/types.js";
import { buildPreservationClone } from "../src/preservation-clone/build.js";
import { startPreviewServer } from "../src/preservation-clone/serve.js";

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

/* ------------------------------------------------------------------ *
 * Fixture bytes
 * ------------------------------------------------------------------ */

const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAACZgbYnAAAAFElEQVR42mNk+M/wn4EIwDiqkL4KAV6RA9cEdEGsAAAAAElFTkSuQmCC",
  "base64",
);
const WOFF2 = Buffer.from("d09GMgABAAAAAAAQAAoAAAAAACAAAAAAAAAAAAAAAAAA", "base64");
const BIG_MP4 = Buffer.alloc(200_000, 7);

const INLINE_CSS = `/* FIXTURE-AUTHORED-INLINE */
/* .disabled { background: url("/img/commented-out.png"); } */
.hero { width: 85%; display: flex; gap: 1.5rem; padding: calc(100% - 2rem); background: url("/img/hero.png") center/cover; }
@media (min-width: 48rem) { .hero { width: min(60vw, 40rem); grid-template-columns: 1fr 2fr; } }
`;

const LINKED_CSS = `/* FIXTURE-AUTHORED-LINKED */
@font-face { font-family: "Fixture"; src: url("/f/x.woff2") format("woff2"); font-display: swap; }
.card { aspect-ratio: 16 / 9; max-width: fit-content; inline-size: clamp(12rem, 40%, 30rem); }
`;

const CSSOM_DESKTOP = `.rt-desktop{color:#111;flex:1 1 auto}/* FIXTURE-CSSOM-DESKTOP */`;
const CSSOM_MOBILE = `.rt-mobile{color:#222;flex:0 0 100%}/* FIXTURE-CSSOM-MOBILE */`;

const APP_JS = "console.log('fixture app chunk');";

function runtimeHtml(origin: string, marker: string): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>RUNTIME-ONLY fixture ${marker}</title>
<style data-fixture="inline">/* placeholder */</style>
<link rel="stylesheet" href="${origin}/css/site.css">
<style data-emotion="css" data-s=""></style>
<style data-emotion="css-global 0" data-s=""></style>
<link rel="preload" as="image" href="${origin}/img/hero.png">
<script src="${origin}/js/app.js"></script>
<script>window.__BOOT__=1;document.documentElement.setAttribute("data-js-ran","yes");</script>
<script type="application/json" id="__NEXT_DATA__">{"page":"/","marker":"KEEP-DATA"}</script>
<script type="speculationrules">{"prerender":[{"urls":["/next-page"]}]}</script>
<meta http-equiv="refresh" content="5;url=https://example.com/away">
</head><body>
<h1 onclick="alert(1)">RUNTIME-ONLY heading ${marker}</h1>
<img id="hero" src="${origin}/img/hero.png" srcset="${origin}/img/hero.png 1x, ${origin}/img/hero2x.png 2x" sizes="(max-width: 600px) 100vw, 50vw" alt="hero">
<img id="inline" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="inline">
<img id="dupe" src="${origin}/img/copy.png" alt="dupe">
<div id="bg" style="background-image:url(${origin}/img/hero.png);width:33.3333%"></div>
<video id="v" poster="${origin}/img/hero.png"><source src="${origin}/big/video.mp4" type="video/mp4"></video>
<iframe src="https://www.youtube.com/embed/FIXTURE"></iframe>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=123&amp;ev=PageView&amp;noscript=1"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-FIXTURE" height="0" width="0"></iframe></noscript>
<object id="obj" data="${origin}/img/hero.png"></object>
<embed id="emb" src="${origin}/img/hero.png">
<a id="internal" href="/service">internal</a>
<a id="jslink" href="javascript:doThing()">js link</a>
</body></html>`;
}

const RESPONSE_HTML =
  "<!DOCTYPE html><html><head><title>BOOTSTRAP-ONLY</title></head><body>BOOTSTRAP-ONLY</body></html>";

/* ------------------------------------------------------------------ *
 * Fixture Source Package
 * ------------------------------------------------------------------ */

function sha(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

const ZERO_BUCKET = { count: 0, bytes: 0 };

async function writeFixturePackage(
  dir: string,
  viewportId: string,
  origin: string,
  cssomText: string,
  viewport: { width: number; height: number; isMobile: boolean },
): Promise<void> {
  await fs.mkdir(path.join(dir, "document"), { recursive: true });
  await fs.mkdir(path.join(dir, "styles"), { recursive: true });
  await fs.mkdir(path.join(dir, "scripts"), { recursive: true });

  const marker = viewportId.toUpperCase();
  const runtime = runtimeHtml(origin, marker);
  await fs.writeFile(path.join(dir, "document/runtime.html"), runtime);
  await fs.writeFile(path.join(dir, "document/response.html"), RESPONSE_HTML);
  await fs.writeFile(path.join(dir, "styles/st0001.css"), INLINE_CSS);
  await fs.writeFile(path.join(dir, "styles/st0002.css"), LINKED_CSS);
  await fs.writeFile(path.join(dir, "styles/st0003.cssom.css"), cssomText);
  await fs.writeFile(path.join(dir, "scripts/sc0001.js"), APP_JS);

  const blob = (file: string, text: string, contentType: string) => ({
    status: "captured" as const,
    file,
    bytes: Buffer.byteLength(text),
    sha256: sha(text),
    contentType,
  });

  const styles = StylesManifestSchema.parse({
    schemaVersion: 1,
    viewportId,
    entries: [
      {
        id: "st0001",
        order: 0,
        sourceType: "style-tag",
        disabled: false,
        declaredIn: "initial-document",
        ownerAttributes: { "data-fixture": "inline" },
        cssom: { readable: true, ruleCount: 2, mediaRules: 1 },
        methods: { cssom: "readable", networkBody: "not-applicable", directFetch: "not-attempted", styleTagText: "captured" },
        authored: blob("styles/st0001.css", INLINE_CSS, "text/css"),
        rawBytesAvailable: true,
        preservability: "PRESERVABLE",
        reasons: [],
      },
      {
        id: "st0002",
        order: 1,
        sourceType: "linked",
        url: `${origin}/css/site.css`,
        sameOrigin: true,
        ownerTag: "link",
        disabled: false,
        declaredIn: "initial-document",
        cssom: { readable: true, ruleCount: 2 },
        methods: { cssom: "readable", networkBody: "captured", directFetch: "not-attempted", styleTagText: "not-applicable" },
        authored: blob("styles/st0002.css", LINKED_CSS, "text/css"),
        rawBytesAvailable: true,
        preservability: "PRESERVABLE",
        reasons: [],
      },
      {
        id: "st0003",
        order: 2,
        sourceType: "cssom-runtime",
        disabled: false,
        declaredIn: "unknown",
        ownerAttributes: { "data-emotion": "css", "data-s": "" },
        cssom: { readable: true, ruleCount: 1 },
        methods: { cssom: "readable", networkBody: "not-applicable", directFetch: "not-attempted", styleTagText: "empty" },
        authored: { status: "unavailable", reason: "runtime CSSOM insertion" },
        cssomSerialized: blob("styles/st0003.cssom.css", cssomText, "text/css"),
        rawBytesAvailable: false,
        preservability: "PRESERVABLE",
        reasons: [],
      },
      {
        id: "st0004",
        order: 3,
        sourceType: "cssom-runtime",
        disabled: false,
        declaredIn: "unknown",
        ownerAttributes: { "data-emotion": "css-global 0", "data-s": "" },
        cssom: { readable: true, ruleCount: 0 },
        methods: { cssom: "empty", networkBody: "not-applicable", directFetch: "not-attempted", styleTagText: "empty" },
        authored: { status: "unavailable", reason: "empty at capture" },
        rawBytesAvailable: false,
        preservability: "UNAVAILABLE",
        reasons: [],
      },
    ],
  });

  const scripts = ScriptsManifestSchema.parse({
    schemaVersion: 1,
    viewportId,
    entries: [
      {
        id: "sc0001",
        order: 0,
        inline: false,
        src: `${origin}/js/app.js`,
        sameOrigin: true,
        kind: "classic",
        async: false,
        defer: false,
        nonceUsed: false,
        declaredIn: "initial-document",
        body: blob("scripts/sc0001.js", APP_JS, "text/javascript"),
        downloadable: true,
        executionIndependence: "unknown",
        dependencyClass: "JS_CHUNK",
        thirdParty: false,
        preservability: "LOCALIZABLE",
        reasons: [],
      },
    ],
  });

  const asset = (id: string, kind: string, url: string, dependencyClass: string) => ({
    id,
    kind,
    url,
    scheme: "http",
    sameOrigin: true,
    host: new URL(url).host,
    dependencyClass,
    thirdParty: false,
    preservability: "LOCALIZABLE",
    reasons: [],
  });

  const assets = AssetsManifestSchema.parse({
    schemaVersion: 1,
    viewportId,
    inlineSvg: { count: 0, bytes: 0 },
    fontsLoaded: [],
    entries: [
      asset("as0001", "image", `${origin}/img/hero.png`, "IMAGE"),
      asset("as0002", "srcset-candidate", `${origin}/img/hero2x.png`, "IMAGE"),
      asset("as0003", "image", `${origin}/img/copy.png`, "IMAGE"),
      asset("as0004", "font-face", `${origin}/f/x.woff2`, "FONT"),
      asset("as0005", "video-source", `${origin}/big/video.mp4`, "MEDIA"),
    ],
  });

  const network = NetworkManifestSchema.parse({
    schemaVersion: 1,
    viewportId,
    ordering: "url,method,seq",
    entries: [],
  });
  const config = ConfigManifestSchema.parse({ schemaVersion: 1, viewportId, entries: [] });

  const manifest = SourcePackageManifestSchema.parse({
    schemaVersion: 1,
    packageKind: "web-recon-source-package",
    source: {
      requestedUrl: `${origin}/`,
      finalUrl: `${origin}/`,
      origin,
      capturedAt: "2026-09-16T00:00:00.000Z",
      route: { host: new URL(origin).host, pathname: "/", search: "" },
      viewportId,
      viewport: { ...viewport, deviceScaleFactor: 1 },
      engine: "fixture",
    },
    observationWindow: {
      startedAt: "2026-09-16T00:00:00.000Z",
      endedAt: "2026-09-16T00:00:01.000Z",
      durationMs: 1000,
      description: "fixture",
    },
    document: {
      initial: {
        status: "captured",
        url: `${origin}/`,
        httpStatus: 200,
        contentType: "text/html; charset=utf-8",
        bytes: RESPONSE_HTML.length,
        sha256: sha(RESPONSE_HTML),
        file: "document/response.html",
      },
      runtimeDom: {
        status: "captured",
        file: "document/runtime.html",
        bytes: Buffer.byteLength(runtime),
        sha256: sha(runtime),
        note: "fixture runtime DOM",
      },
      initialInventory: {
        scripts: 2,
        inlineScripts: 1,
        stylesheetLinks: 1,
        styleTags: 3,
        preloadLinks: 1,
        modulepreloadLinks: 0,
      },
    },
    limits: {
      maxScriptBodyBytes: 1,
      maxStylesheetBodyBytes: 1,
      maxOtherBodyBytes: 1,
      maxJsonBodyBytes: 1,
      maxTotalScriptBytes: 1,
      maxTotalStylesheetBytes: 1,
      maxTotalJsonBytes: 1,
      maxInlineTextBytes: 1,
      maxTotalInlineTextBytes: 1,
      maxNetworkEntries: 1,
      maxInventoryEntries: 1,
      maxElementsWalked: 1,
      maxRulesPerSheet: 1,
      maxDirectFetchSheets: 1,
      directFetchTimeoutMs: 1,
    },
    bodyPolicy: {
      script: true,
      stylesheet: true,
      font: false,
      image: false,
      media: false,
      json: true,
      other: false,
    },
    evidence: {
      initiator: "cdp-available",
      initialDocumentWitness: "parsed",
      directFetchFallback: "disabled",
    },
    counts: {
      styles: {
        total: 4, linked: 1, styleTags: 1, cssomRuntime: 2, adopted: 0,
        rawBytesCaptured: 2, cssomSerializedCaptured: 1, unavailable: 2,
        crossOrigin: 0, cssomBlocked: 0, directFetched: 0,
        mediaRules: 1, containerRules: 0, supportsRules: 0, customPropertyDeclarations: 0,
      },
      scripts: {
        total: 1, documentDeclared: 1, runtimeInjected: 0, runtimeLoadedChunks: 0,
        inline: 0, external: 1, module: 0, classic: 1,
        responsesCaptured: 1, unavailable: 0, skippedBySize: 0,
      },
      assets: { image: 2, "srcset-candidate": 1, "font-face": 1, "video-source": 1 },
      network: {
        total: 0, overflowNotRecorded: 0, byClass: {}, sameOrigin: 0,
        thirdParty: 0, apiLike: 0, bodiesCaptured: 0, failed: 0, childFrame: 0,
      },
      config: {},
      byPreservability: { LOCALIZABLE: 6, PRESERVABLE: 3, UNAVAILABLE: 1 },
    },
    accounting: {
      captured: ZERO_BUCKET, skippedBySize: ZERO_BUCKET, skippedByPolicy: ZERO_BUCKET,
      failed: ZERO_BUCKET, unavailable: ZERO_BUCKET,
    },
    frameworkEvidence: [],
    files: {
      styles: "styles/manifest.json",
      scripts: "scripts/manifest.json",
      assets: "assets/manifest.json",
      network: "network/manifest.json",
      config: "config/manifest.json",
    },
    contentHash: sha(`${viewportId}-fixture`),
    limitations: [],
  });

  const put = async (file: string, value: unknown): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  };
  await put("styles/manifest.json", styles);
  await put("scripts/manifest.json", scripts);
  await put("assets/manifest.json", assets);
  await put("network/manifest.json", network);
  await put("config/manifest.json", config);
  await put("manifest.json", manifest);
}

/* ------------------------------------------------------------------ *
 * Fixture origin
 * ------------------------------------------------------------------ */

async function startOrigin(): Promise<{ origin: string; port: number; close: () => Promise<void> }> {
  const routes: Record<string, { body: Buffer; type: string }> = {
    "/img/hero.png": { body: PNG_A, type: "image/png" },
    "/img/copy.png": { body: PNG_A, type: "image/png" }, // identical bytes on purpose
    "/img/hero2x.png": { body: PNG_B, type: "image/png" },
    "/f/x.woff2": { body: WOFF2, type: "font/woff2" },
    "/big/video.mp4": { body: BIG_MP4, type: "video/mp4" },
  };
  const server = http.createServer((request, response) => {
    const route = routes[new URL(request.url ?? "/", "http://127.0.0.1").pathname];
    if (!route) {
      response.writeHead(404).end("nope");
      return;
    }
    response.writeHead(200, { "content-type": route.type, "content-length": route.body.byteLength });
    response.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function hashTree(dir: string): Promise<string> {
  const lines: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else lines.push(`${path.relative(dir, full)}\t${sha(await fs.readFile(full))}`);
    }
  };
  await walk(dir);
  return sha(lines.join("\n"));
}

/* ------------------------------------------------------------------ *
 * Smoke
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const started = Date.now();
  console.log("[smoke:preservation-clone]");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wr-preserve-smoke-"));
  const origin = await startOrigin();
  let preview: Awaited<ReturnType<typeof startPreviewServer>> | null = null;

  try {
    const runDir = path.join(tmp, "run");
    const desktopPkg = path.join(runDir, "viewports/desktop/source-package");
    const mobilePkg = path.join(runDir, "viewports/mobile/source-package");
    await writeFixturePackage(desktopPkg, "desktop", origin.origin, CSSOM_DESKTOP, {
      width: 1440, height: 900, isMobile: false,
    });
    await writeFixturePackage(mobilePkg, "mobile", origin.origin, CSSOM_MOBILE, {
      width: 390, height: 844, isMobile: true,
    });

    const packageHashBefore = await hashTree(runDir);

    const outDir = path.join(tmp, "clone");
    const { manifest, resourceMap, residual } = await buildPreservationClone({
      runDir,
      sourcePackages: [
        { viewportId: "desktop", dir: desktopPkg },
        { viewportId: "mobile", dir: mobilePkg },
      ],
      outDir,
      runId: "fixture-run",
      policy: {
        // Force the streamed over-budget path for the fixture video.
        maxMediaBytes: 1024,
        allowedPorts: [origin.port],
        allowPrivateHostPorts: new Set([`127.0.0.1:${origin.port}`]),
        concurrency: 4,
      },
    });

    const desktopHtml = await fs.readFile(path.join(outDir, "desktop/index.html"), "utf8");
    const mobileHtml = await fs.readFile(path.join(outDir, "mobile/index.html"), "utf8");
    const desktopVariant = manifest.variants.find((v) => v.viewportId === "desktop")!;
    const styleFiles = await fs.readdir(path.join(outDir, "styles"));
    const linkedCss = await fs.readFile(path.join(outDir, "styles", styleFiles[0]), "utf8");

    /* 1. runtime DOM, not the initial response document */
    check(
      "1. runtime DOM is the visual source (initial response document is not)",
      desktopHtml.includes("RUNTIME-ONLY") && !desktopHtml.includes("BOOTSTRAP-ONLY"),
    );

    /* 2. executable scripts neutralized */
    const executableLeft = /<script(?![^>]*type="text\/plain")(?![^>]*type="application\/json")[^>]*>/i.test(desktopHtml);
    check(
      "2. executable scripts are neutralized (no src, inert type)",
      !executableLeft && !/<script[^>]*\ssrc=/i.test(desktopHtml) &&
        desktopHtml.includes('data-preservation-neutralized="true"'),
    );
    check(
      "2b. non-executable data script kept verbatim",
      desktopHtml.includes('type="application/json"') && desktopHtml.includes("KEEP-DATA"),
    );
    check(
      "2c. inline script bytes preserved inert, not deleted",
      desktopHtml.includes("window.__BOOT__=1"),
    );
    check(
      "2d. preserved external JS bytes exist but are referenced by no document",
      (await fs.readdir(path.join(outDir, "scripts"))).length === 1 &&
        !desktopHtml.includes("<script src"),
    );

    /* 3-4. authored CSS preserved */
    check("3. authored linked CSS preserved", linkedCss.includes("FIXTURE-AUTHORED-LINKED"));
    check("4. authored inline CSS preserved in place", desktopHtml.includes("FIXTURE-AUTHORED-INLINE"));

    /* 5. CSSOM-only style becomes runtime-derived CSS */
    const cssomDecision = desktopVariant.styles.find((s) => s.entryId === "st0003")!;
    check(
      "5. CSSOM-only style emitted as runtime-derived (and labelled as such)",
      cssomDecision.representation === "runtime-derived-cssom" &&
        cssomDecision.runtimeDerived &&
        desktopHtml.includes("FIXTURE-CSSOM-DESKTOP") &&
        desktopHtml.includes('data-preservation-style="runtime-derived"'),
    );
    check(
      "5b. one representation per style entry (no authored + CSSOM double cascade)",
      desktopVariant.styles.every((s) => s.bytes === 0 || s.sha256 !== null) &&
        !linkedCss.includes("FIXTURE-CSSOM-DESKTOP") &&
        desktopHtml.split("FIXTURE-AUTHORED-INLINE").length - 1 === 1,
    );

    /* 6. deterministic cascade order */
    const positions = [
      desktopHtml.indexOf("FIXTURE-AUTHORED-INLINE"),
      desktopHtml.indexOf("styles/"),
      desktopHtml.indexOf("FIXTURE-CSSOM-DESKTOP"),
    ];
    check(
      "6. stylesheet order preserved (inline < linked < runtime-derived)",
      positions.every((p) => p >= 0) && positions[0] < positions[1] && positions[1] < positions[2] &&
        desktopVariant.styles.map((s) => s.order).join(",") === "0,1,2,3",
    );

    /* 7. source semantics not flattened to pixels */
    const semantics = ["width: 85%", "display: flex", "calc(100% - 2rem)", "@media (min-width: 48rem)", "min(60vw, 40rem)"];
    check(
      "7. %, flex, calc(), @media, min() survive unflattened",
      semantics.every((s) => desktopHtml.includes(s)),
      semantics.filter((s) => !desktopHtml.includes(s)).join(" | "),
    );
    check(
      "7b. linked CSS keeps aspect-ratio / fit-content / clamp()",
      ["aspect-ratio: 16 / 9", "max-width: fit-content", "clamp(12rem, 40%, 30rem)"].every((s) =>
        linkedCss.includes(s),
      ),
    );
    check(
      "7c. no frozen viewport pixel widths introduced anywhere",
      !/\b(1440|390|1024|1920)px\b/.test(desktopHtml + linkedCss),
    );

    /* 8-11. asset rewriting */
    const heroMatch = desktopHtml.match(/id="hero" src="([^"]+)"/);
    check(
      "8. normal image URL localized to a content-addressed local asset",
      Boolean(heroMatch && /^\.\.\/assets\/[0-9a-f]{64}\.png$/.test(heroMatch[1])),
      heroMatch?.[1] ?? "no match",
    );
    const srcsetMatch = desktopHtml.match(/srcset="([^"]+)"/);
    check(
      "9. srcset descriptors survive rewriting (1x / 2x kept, both localized)",
      Boolean(
        srcsetMatch &&
          /^\.\.\/assets\/[0-9a-f]{64}\.png 1x, \.\.\/assets\/[0-9a-f]{64}\.png 2x$/.test(srcsetMatch[1]),
      ),
      srcsetMatch?.[1] ?? "no match",
    );
    check(
      "9b. sizes attribute untouched",
      desktopHtml.includes('sizes="(max-width: 600px) 100vw, 50vw"'),
    );
    check(
      "10. @font-face url localized and rewritten in the emitted stylesheet",
      /@font-face \{ font-family: "Fixture"; src: url\("\.\.\/assets\/[0-9a-f]{64}\.woff2"\)/.test(linkedCss),
    );
    check(
      "11. data: URL left self-contained (not extracted, not rewritten)",
      desktopHtml.includes('id="inline" src="data:image/gif;base64,R0lGODlhAQABA'),
    );
    check(
      "11b. inline style url() localized without touching sibling declarations",
      /id="bg" style="background-image:url\(\.\.\/assets\/[0-9a-f]{64}\.png\);width:33\.3333%"/.test(desktopHtml),
    );

    /* 12. oversized media is an honest residual */
    const videoResource = resourceMap.resources.find((r) => r.sourceUrl.endsWith("/big/video.mp4"))!;
    const videoResidual = residual.dependencies.find((d) => d.url.endsWith("/big/video.mp4"));
    check(
      "12. oversized media skipped, recorded, and still reachable from the source",
      videoResource.status === "skipped-over-budget" &&
        videoResource.localPath === null &&
        videoResidual?.reason === "over-size-budget" &&
        videoResidual.stillRequestedFromSource === true &&
        desktopHtml.includes(`${origin.origin}/big/video.mp4`),
      `${videoResource.status} / ${videoResidual?.reason}`,
    );
    check(
      "12b. clone is not claimed source-independent while residuals remain",
      manifest.residual.stillRequestedFromSource > 0 &&
        manifest.limitations.some((l) => l.includes("NOT source-independent")),
    );

    /* 13. dedupe by content hash */
    const heroRecord = resourceMap.resources.find((r) => r.sourceUrl.endsWith("/img/hero.png"))!;
    const copyRecord = resourceMap.resources.find((r) => r.sourceUrl.endsWith("/img/copy.png"))!;
    const assetFiles = await fs.readdir(path.join(outDir, "assets"));
    check(
      "13. identical bytes at different URLs dedupe to one stored asset",
      heroRecord.sha256 === copyRecord.sha256 &&
        heroRecord.localPath === copyRecord.localPath &&
        assetFiles.length === 3,
      `files=${assetFiles.length}`,
    );
    check(
      "13b. both viewports share the same resources (shared, not duplicated)",
      heroRecord.usedBy.length === 2 && heroRecord.shared === true,
    );

    /* 14. the Source Package is input, never output */
    check(
      "14. Source Package left byte-identical (read-only input)",
      (await hashTree(runDir)) === packageHashBefore,
    );

    /* desktop/mobile separation */
    check(
      "15. desktop and mobile runtime states are not merged",
      desktopHtml.includes("FIXTURE-CSSOM-DESKTOP") &&
        !desktopHtml.includes("FIXTURE-CSSOM-MOBILE") &&
        mobileHtml.includes("FIXTURE-CSSOM-MOBILE") &&
        !mobileHtml.includes("FIXTURE-CSSOM-DESKTOP"),
    );

    /* neutralization of everything else that could execute or phone home */
    check(
      "16. third-party iframe neutralized, not cloned",
      !/<iframe[^>]*\ssrc=/i.test(desktopHtml) &&
        desktopHtml.includes('data-preservation-neutralized="external-embed"') &&
        residual.dependencies.some((d) => d.reason === "external-embed"),
    );
    check(
      "16b. tracking hidden inside <noscript> is neutralized, not passed through",
      // The URLs stay as inert evidence; what must be gone is any attribute
      // that would actually issue the request.
      !/\ssrc="[^"]*facebook\.com\/tr\?/.test(desktopHtml) &&
        !/\ssrc="[^"]*googletagmanager\.com\/ns\.html/.test(desktopHtml) &&
        desktopHtml.includes("data-preservation-src") &&
        desktopHtml.split('data-preservation-neutralized="tracking"').length - 1 === 2 &&
        desktopVariant.rewrites.neutralizedTrackers >= 2 &&
        residual.dependencies.filter((d) => d.reason === "analytics-neutralized").length >= 2,
      `trackers=${desktopVariant.rewrites.neutralizedTrackers}`,
    );
    check(
      "16c. no tracker was fetched at build time either",
      resourceMap.resources.every(
        (r) => !r.sourceUrl.includes("facebook.com") || r.status === "skipped-analytics",
      ),
    );
    check(
      "17. inline event handlers neutralized",
      !/\sonclick=/i.test(desktopHtml) && desktopHtml.includes("data-preservation-onclick"),
    );
    check(
      "18. javascript: link neutralized",
      desktopHtml.includes('id="jslink" href="#"') && desktopHtml.includes("data-preservation-href"),
    );
    check(
      "19. preload/prefetch hints removed (clone does not phone home for speed)",
      !/rel="preload"/i.test(desktopHtml),
    );
    check(
      "20. internal link preserved as the source route, not invented locally",
      desktopHtml.includes(`id="internal" href="${origin.origin}/service"`),
    );
    check(
      "21. manifest records zero executed scripts and no geometry reconstruction",
      desktopVariant.scriptCounts.executed === 0 &&
        manifest.policy.geometryReconstruction === "none" &&
        manifest.policy.sourceJsExecution === "disabled" &&
        manifest.policy.apiReplay === "none",
    );
    check(
      "22. unresolved style entry reported honestly, not silently dropped",
      desktopVariant.styles.some((s) => s.entryId === "st0004" && s.representation === "unresolved"),
    );

    check(
      "24. <object>/<embed> neutralized (they are browsing contexts, not images)",
      !/<object[^>]*\sdata=/i.test(desktopHtml) &&
        !/<embed[^>]*\ssrc=/i.test(desktopHtml) &&
        desktopHtml.includes('id="obj"') &&
        desktopHtml.includes('id="emb"') &&
        desktopVariant.rewrites.neutralizedEmbeds >= 3,
      `embeds=${desktopVariant.rewrites.neutralizedEmbeds}`,
    );
    check(
      "25. speculationrules neutralized (JSON the browser still acts on)",
      // \s before `type` matters: data-preservation-original-type ends with
      // the same characters and would match a looser pattern.
      !/<script[^>]*\stype="speculationrules"/i.test(desktopHtml) &&
        desktopHtml.includes('data-preservation-original-type="speculationrules"'),
    );
    check(
      "26. meta refresh neutralized (clone cannot navigate itself away)",
      !/<meta[^>]*http-equiv="refresh"[^>]*\scontent=/i.test(desktopHtml) &&
        desktopHtml.includes("data-preservation-refresh") &&
        desktopVariant.rewrites.neutralizedNavigations === 1,
    );
    check(
      "27. url() inside a CSS comment is neither rewritten nor fetched",
      desktopHtml.includes('url("/img/commented-out.png")') &&
        !resourceMap.resources.some((r) => r.sourceUrl.includes("commented-out")) &&
        !residual.dependencies.some((d) => d.url.includes("commented-out")),
    );
    check(
      "28. resource ledger has no duplicate URLs (counts are not inflated)",
      new Set(resourceMap.resources.map((r) => r.sourceUrl)).size ===
        resourceMap.resources.length &&
        resourceMap.counts.total === resourceMap.resources.length,
      `${new Set(resourceMap.resources.map((r) => r.sourceUrl)).size} unique / ${resourceMap.resources.length}`,
    );
    check(
      "28b. a script preserved for both viewports is marked shared, not counted twice",
      resourceMap.resources.filter((r) => r.origin === "script-body").length === 1 &&
        resourceMap.resources.find((r) => r.origin === "script-body")?.shared === true,
    );

    /* preview server */
    preview = await startPreviewServer(outDir);
    const page = await fetch(`${preview.baseUrl}/desktop/`);
    const pageBody = await page.text();
    const assetResponse = await fetch(`${preview.baseUrl}/${heroRecord.localPath}`);
    const traversal = await fetch(`${preview.baseUrl}/../../etc/passwd`);
    check(
      "23. preview server serves the variant over http://localhost",
      page.status === 200 && pageBody.includes("RUNTIME-ONLY"),
      `status=${page.status}`,
    );
    check(
      "23b. preview server serves localized assets",
      assetResponse.status === 200 && assetResponse.headers.get("content-type") === "image/png",
    );
    check(
      "23c. preview server refuses path traversal out of the clone root",
      traversal.status === 404 || traversal.status === 403,
      `status=${traversal.status}`,
    );
  } finally {
    if (preview) await preview.close();
    await origin.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${checks - failures}/${checks} checks passed (${seconds}s)`);
  if (failures > 0) {
    console.log("[smoke:preservation-clone] FAILED");
    process.exitCode = 1;
  } else {
    console.log("[smoke:preservation-clone] OK");
  }
}

main().catch((error) => {
  console.error("[smoke:preservation-clone] crashed", error);
  process.exitCode = 1;
});
