/**
 * pnpm smoke:assets — Task 22 fixture tests.
 *
 * Everything goes through the public barrel (../src/assets/index.js): the
 * SSRF-hardened fetcher (private-IP rejection, DNS-based checks, redirect
 * re-validation incl. the 169.254.169.254 metadata endpoint, size/MIME
 * limits), inventory + conservative classification, font inventory +
 * license safety, content-hash materialization, rewrite map application,
 * the asset proxy, and a real-Chromium check that the served page loads its
 * image from /media with zero requests to the source asset origin.
 *
 * Local fixtures run on 127.0.0.1 and are admitted ONLY through the
 * explicit test-only `allowPrivateHostPorts` escape hatch — the same runs
 * prove that WITHOUT it the fetcher rejects loopback.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  applyRewrite,
  createAssetInventoryRun,
  createAssetMaterializationRun,
  extensionForMime,
  findTruncatedUrls,
  GENERATED_STYLES_PATH,
  isFragmentOnlyCssRef,
  isPrivateAddress,
  loadAssetInventoryRun,
  loadAssetMaterializationRun,
  mediaContentType,
  mimeAllowed,
  rewriteVariants,
  safeFetchAsset,
  startAssetProxy,
  type RewriteMap,
  type SafeFetchPolicy,
} from "../src/assets/index.js";

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

const fixtureRoot = path.resolve("data", `.smoke-assets-${process.pid}`);

interface Fixture {
  server: Server;
  baseUrl: string;
  port: number;
  hits: Map<string, number>;
}

async function startFixture(
  routes: Record<
    string,
    (req: { url: string }, res: import("node:http").ServerResponse) => void
  >,
): Promise<Fixture> {
  const hits = new Map<string, number>();
  const server = createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0];
    hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
    const handler = routes[pathname];
    if (!handler) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    handler({ url: req.url ?? "/" }, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, port: address.port, hits };
}

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c626001000000ffff03000006000557" +
    "bfabd40000000049454e44ae426082",
  "hex",
);

function policyFor(
  fixture: Fixture,
  overrides: Partial<SafeFetchPolicy> = {},
): SafeFetchPolicy {
  return {
    timeoutMs: 10_000,
    maxBytes: 1024 * 1024,
    maxRedirects: 3,
    allowedHosts: new Set(["127.0.0.1"]),
    expectedKind: "image",
    allowedPorts: [fixture.port],
    allowPrivateHostPorts: new Set([`127.0.0.1:${fixture.port}`]),
    ...overrides,
  };
}

async function main(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  try {
    /* ============================================================ */
    section("1. address validation (SSRF ranges)");
    /* ============================================================ */
    const privateCases: [string, boolean][] = [
      ["10.0.0.1", true],
      ["10.255.255.254", true],
      ["172.16.0.1", true],
      ["172.31.255.255", true],
      ["172.32.0.1", false], // just OUTSIDE 172.16/12
      ["192.168.1.1", true],
      ["169.254.169.254", true], // cloud metadata
      ["169.254.0.1", true],
      ["127.0.0.1", true],
      ["0.0.0.0", true],
      ["100.64.0.1", true], // CGNAT
      ["8.8.8.8", false],
      ["151.101.1.140", false],
      ["::1", true],
      ["fe80::1", true],
      ["fd00::1", true],
      ["::ffff:10.0.0.1", true], // IPv4-mapped private
      ["::ffff:8.8.8.8", false], // IPv4-mapped public
      ["2606:4700::1111", false],
      ["not-an-ip", true], // unresolvable literal → rejected
    ];
    for (const [address, expected] of privateCases) {
      check(
        `isPrivateAddress(${address}) === ${expected}`,
        isPrivateAddress(address) === expected,
      );
    }

    /* ============================================================ */
    section("2. safeFetchAsset URL policy (no network)");
    /* ============================================================ */
    const publicLookup = async (): Promise<{ address: string; family: number }[]> => [
      { address: "93.184.216.34", family: 4 },
    ];
    const basePolicy: SafeFetchPolicy = {
      timeoutMs: 3000,
      maxBytes: 1000,
      maxRedirects: 3,
      allowedHosts: new Set(["cdn.example.com"]),
      expectedKind: "image",
      lookup: publicLookup,
    };
    check(
      "ftp:// rejected-scheme",
      (await safeFetchAsset("ftp://cdn.example.com/a.png", basePolicy)).status ===
        "rejected-scheme",
    );
    check(
      "file:// rejected-scheme",
      (await safeFetchAsset("file:///etc/passwd", basePolicy)).status === "rejected-scheme",
    );
    check(
      "credentials rejected",
      (await safeFetchAsset("https://user:pw@cdn.example.com/a.png", basePolicy)).status ===
        "rejected-credentials",
    );
    check(
      "non-standard port rejected",
      (await safeFetchAsset("https://cdn.example.com:8443/a.png", basePolicy)).status ===
        "rejected-port",
    );
    check(
      "host outside allowlist rejected",
      (await safeFetchAsset("https://evil.example.com/a.png", basePolicy)).status ===
        "rejected-host-not-allowed",
    );

    /* ============================================================ */
    section("3. safeFetchAsset DNS-resolution-based rejection");
    /* ============================================================ */
    const internalResult = await safeFetchAsset("https://internal.example.com/a.png", {
      ...basePolicy,
      allowedHosts: new Set(["internal.example.com"]),
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    check(
      "hostname resolving to 10/8 → rejected-private-address",
      internalResult.status === "rejected-private-address",
      internalResult.status,
    );
    check(
      "rejection detail names the resolved address",
      (internalResult.detail ?? "").includes("10.0.0.5"),
    );
    const dualResult = await safeFetchAsset("https://dual.example.com/a.png", {
      ...basePolicy,
      allowedHosts: new Set(["dual.example.com"]),
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.0.9", family: 4 },
      ],
    });
    check(
      "dual public+private resolution → rejected (ANY private address rejects)",
      dualResult.status === "rejected-private-address",
    );
    const metadataDirect = await safeFetchAsset("http://169.254.169.254/latest/meta-data", {
      ...basePolicy,
      allowedHosts: new Set(["169.254.169.254"]),
      lookup: undefined, // real resolver: IP literal resolves to itself
    });
    check(
      "direct metadata endpoint 169.254.169.254 → rejected-private-address",
      metadataDirect.status === "rejected-private-address",
      metadataDirect.status,
    );
    const loopbackNoOverride = await safeFetchAsset("http://127.0.0.1/a.png", {
      ...basePolicy,
      allowedHosts: new Set(["127.0.0.1"]),
      lookup: undefined,
    });
    check(
      "loopback WITHOUT the test override → rejected-private-address",
      loopbackNoOverride.status === "rejected-private-address",
      loopbackNoOverride.status,
    );

    /* ============================================================ */
    section("4. fixture fetches: limits, MIME, redirect re-validation");
    /* ============================================================ */
    const bigBody = Buffer.alloc(200_000, 0x41);
    const assetFixture = await startFixture({
      "/img/ok.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_BYTES);
      },
      "/img/dup.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_BYTES);
      },
      "/redirect/ok": (_req, res) => {
        res.writeHead(302, { location: "/img/ok.png" });
        res.end();
      },
      "/redirect/metadata": (_req, res) => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
        res.end();
      },
      "/redirect/private-host": (_req, res) => {
        res.writeHead(302, { location: "http://internal.example.com/a.png" });
        res.end();
      },
      "/redirect/off-allowlist": (_req, res) => {
        res.writeHead(302, { location: "https://unlisted.example.com/a.png" });
        res.end();
      },
      "/redirect/loop": (_req, res) => {
        res.writeHead(302, { location: "/redirect/loop" });
        res.end();
      },
      "/img/huge.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(bigBody);
      },
      "/img/nothtml.png": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>totally an image</html>");
      },
      "/audio/pulse.mp3": (_req, res) => {
        res.writeHead(200, { "content-type": "audio/mpeg" });
        res.end(Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]));
      },
      "/img/slow.png": (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "image/png" });
          res.end(PNG_BYTES);
        }, 3_000);
      },
    });
    const fx = assetFixture;
    const ok = await safeFetchAsset(`${fx.baseUrl}/img/ok.png`, policyFor(fx));
    check("fixture png fetched", ok.status === "fetched", ok.status + " " + (ok.detail ?? ""));
    check("fetched mime image/png", ok.mime === "image/png");
    check("fetched bytes match fixture bytes", ok.body !== null && ok.body.equals(PNG_BYTES));
    const redirected = await safeFetchAsset(`${fx.baseUrl}/redirect/ok`, policyFor(fx));
    check("same-host redirect followed", redirected.status === "fetched", redirected.status);
    check(
      "redirect chain recorded",
      redirected.redirectChain.length === 1 &&
        redirected.redirectChain[0].endsWith("/img/ok.png"),
    );
    const metadataHop = await safeFetchAsset(`${fx.baseUrl}/redirect/metadata`, {
      ...policyFor(fx),
      allowedHosts: new Set(["127.0.0.1", "169.254.169.254"]),
      allowedPorts: [fx.port, 80],
    });
    check(
      "redirect hop to metadata endpoint rejected (re-validated per hop)",
      metadataHop.status === "rejected-redirect",
      metadataHop.status,
    );
    check(
      "metadata hop rejection names the address",
      (metadataHop.detail ?? "").includes("169.254.169.254"),
    );
    const privateHop = await safeFetchAsset(`${fx.baseUrl}/redirect/private-host`, {
      ...policyFor(fx),
      allowedHosts: new Set(["127.0.0.1", "internal.example.com"]),
      allowedPorts: [fx.port, 80],
      lookup: async (hostname: string) =>
        hostname === "internal.example.com"
          ? [{ address: "10.1.2.3", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }],
    });
    check(
      "redirect hop to private-resolving hostname rejected (DNS re-check)",
      privateHop.status === "rejected-redirect",
      privateHop.status,
    );
    const offAllowlist = await safeFetchAsset(`${fx.baseUrl}/redirect/off-allowlist`, policyFor(fx));
    check(
      "redirect hop leaving the host allowlist rejected",
      offAllowlist.status === "rejected-redirect",
      offAllowlist.status,
    );
    const loop = await safeFetchAsset(`${fx.baseUrl}/redirect/loop`, policyFor(fx));
    check("redirect loop → too-many-redirects", loop.status === "too-many-redirects", loop.status);
    const huge = await safeFetchAsset(`${fx.baseUrl}/img/huge.png`, {
      ...policyFor(fx),
      maxBytes: 50_000,
    });
    check("body over maxBytes → too-large (streaming abort)", huge.status === "too-large", huge.status);
    const badMime = await safeFetchAsset(`${fx.baseUrl}/img/nothtml.png`, policyFor(fx));
    check(
      "text/html for expected image → mime-rejected",
      badMime.status === "mime-rejected",
      badMime.status,
    );
    const missing = await safeFetchAsset(`${fx.baseUrl}/img/missing.png`, policyFor(fx));
    check("404 → http-error", missing.status === "http-error" && missing.httpStatus === 404);
    const slow = await safeFetchAsset(`${fx.baseUrl}/img/slow.png`, {
      ...policyFor(fx),
      timeoutMs: 500,
    });
    check("slow endpoint → timeout", slow.status === "timeout", slow.status);
    check(
      "extensionForMime maps png / woff2 / fallback",
      extensionForMime("image/png", "https://x/a") === "png" &&
        extensionForMime("font/woff2", "https://x/a") === "woff2" &&
        extensionForMime("application/octet-stream", "https://x/file.mp4") === "mp4",
    );
    // Audio kind (Task 26 real-pilot regression: catalog kind "audio" fell through
    // to expected-kind "image", so every audio asset was mime-rejected).
    const audioOk = await safeFetchAsset(`${fx.baseUrl}/audio/pulse.mp3`, {
      ...policyFor(fx),
      expectedKind: "audio",
    });
    check(
      "audio/mpeg fetches under expected kind audio",
      audioOk.status === "fetched" && audioOk.mime === "audio/mpeg",
      audioOk.status,
    );
    const audioAsImage = await safeFetchAsset(`${fx.baseUrl}/audio/pulse.mp3`, policyFor(fx));
    check(
      "audio/mpeg still mime-rejected for expected kind image (gate not widened)",
      audioAsImage.status === "mime-rejected",
      audioAsImage.status,
    );
    check(
      "mimeAllowed audio kind accepts audio/* only",
      mimeAllowed("audio", "audio/mpeg") &&
        mimeAllowed("audio", "audio/ogg") &&
        !mimeAllowed("audio", "image/png") &&
        !mimeAllowed("image", "audio/mpeg"),
    );
    check("extensionForMime maps audio/mpeg → mp3", extensionForMime("audio/mpeg", "https://x/a") === "mp3");

    /* ============================================================ */
    section("5. inventory + conservative classification (fixture artifacts)");
    /* ============================================================ */
    const CDN = "https://cdn.fixturebrand.example";
    const mkFixtureLineage = async (
      dirName: string,
      catalogUrls: { [key: string]: string },
    ): Promise<{ siteSpecDir: string; templateRunDir: string; contentRunDir: string; obsDir: string }> => {
      const root = path.join(fixtureRoot, dirName);
      const siteSpecDir = path.join(root, "site-spec");
      const templateRunDir = path.join(root, "template");
      const contentRunDir = path.join(root, "content-run");
      const obsDir = path.join(root, "observation");
      await mkdir(siteSpecDir, { recursive: true });
      await mkdir(path.join(templateRunDir, "app", "public", "wr"), { recursive: true });
      await mkdir(contentRunDir, { recursive: true });
      await mkdir(path.join(obsDir, "pages", "p000001", "viewports", "desktop"), {
        recursive: true,
      });
      await writeFile(
        path.join(siteSpecDir, "site-spec.json"),
        JSON.stringify({
          rootUrl: "https://fixturebrand.example/",
          source: { siteObservation: path.join(obsDir, "site-observation.json") },
        }),
      );
      await writeFile(
        path.join(siteSpecDir, "asset-catalog.json"),
        JSON.stringify({
          assets: [
            { assetId: "a000001", kind: "image", url: catalogUrls.hero, usageCount: 3, sourcePageIds: ["p000001"] },
            { assetId: "a000002", kind: "image-srcset", url: catalogUrls.hero2x, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000003", kind: "icon", url: catalogUrls.favicon, usageCount: 2, sourcePageIds: ["p000001"] },
            { assetId: "a000004", kind: "inline-svg", usageCount: 5, sourcePageIds: ["p000001"] },
            { assetId: "a000005", kind: "source", url: catalogUrls.video, mimeHint: "video/mp4", usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000006", kind: "picture-source", url: catalogUrls.truncated, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000007", kind: "image", url: catalogUrls.person, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000008", kind: "image", url: catalogUrls.wave, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000009", kind: "image", url: catalogUrls.product, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000010", kind: "image", url: catalogUrls.logo, usageCount: 1, sourcePageIds: ["p000001"] },
            { assetId: "a000011", kind: "picture-source", url: catalogUrls.personWebp, usageCount: 1, sourcePageIds: ["p000001"] },
            // browser-serialized css url(#fragment) ref (SVG-internal) —
            // must be skipped at ingestion, never inventoried (GED-C)
            { assetId: "a000012", kind: "background-image", url: catalogUrls.fragmentRef, usageCount: 2, sourcePageIds: ["p000001"] },
          ],
        }),
      );
      await writeFile(
        path.join(templateRunDir, "slots.json"),
        JSON.stringify({
          slots: [
            { id: "sl1", type: "image", key: "home.main.image.person", defaultValue: { src: catalogUrls.person, alt: "", srcset: "" } },
            { id: "sl2", type: "image", key: "home.main.image.wave", defaultValue: { src: catalogUrls.wave, alt: "", srcset: `${catalogUrls.wave} 1x` } },
            { id: "sl3", type: "image", key: "home.main.image.product", defaultValue: { src: catalogUrls.product, alt: "", srcset: "" } },
            { id: "sl4", type: "text", key: "home.main.heading", defaultValue: "hello" },
          ],
        }),
      );
      await writeFile(
        path.join(templateRunDir, "app", "public", "wr", "generated-styles.css"),
        [
          `.wr-a{font-family:customsans, "Helvetica Neue", Arial, sans-serif;}`,
          `.wr-b{font-family:customsans, "Helvetica Neue", Arial, sans-serif;}`,
          `.wr-c{font-family:Arial;}`,
          `.wr-d{background-image:url(${catalogUrls.cssBg})}`,
          `.wr-e{mask-image:url(${catalogUrls.fragmentRef})}`,
        ].join("\n"),
      );
      await writeFile(
        path.join(contentRunDir, "generation-result.json"),
        JSON.stringify({
          imageBriefs: [
            { slotKey: "home.main.image.person", action: "replace-recommended", warning: "실존 인물 사진 — 반드시 교체 필요" },
            { slotKey: "home.main.image.wave", action: "keep-default", brief: { subject: "decorative", mood: "calm", purpose: "bg" } },
            { slotKey: "home.main.image.product", action: "replace-recommended" },
          ],
        }),
      );
      await writeFile(
        path.join(obsDir, "pages", "p000001", "viewports", "desktop", "rendered.html"),
        `<!doctype html><html><head>` +
          `<link rel="icon" type="image/svg+xml" href="${catalogUrls.faviconSvg}">` +
          `<link rel="shortcut icon" href="${catalogUrls.favicon}">` +
          `<meta property="og:image" content="${catalogUrls.ogImage}">` +
          `<link rel="preload" href="${catalogUrls.fontWoff2}" as="font" type="font/woff2" crossorigin="anonymous">` +
          `<link rel="preload" href="${catalogUrls.stylesheet}" as="style">` +
          `<link rel="stylesheet" href="${catalogUrls.stylesheet}">` +
          `</head><body>x</body></html>`,
      );
      return { siteSpecDir, templateRunDir, contentRunDir, obsDir };
    };

    const urlsA = {
      hero: `${CDN}/img/hero.png`,
      hero2x: `${CDN}/img/hero-large.png`,
      favicon: `${CDN}/favicon.ico`,
      faviconSvg: `${CDN}/favicon.svg`,
      ogImage: `${CDN}/social/card.jpg`,
      video: `https://video.fixturebrand.example/intro.mp4`,
      truncated: `${CDN}/img/hero`, // strict prefix of hero.png
      person: `${CDN}/img/team/johndoe.jpg`,
      personWebp: `${CDN}/img/team/johndoe.jpg?fm=webp&q=80`,
      wave: `${CDN}/img/wave.png`,
      product: `${CDN}/img/product-shot.png`,
      logo: `${CDN}/img/acme-logo-dark.png`,
      cssBg: `${CDN}/img/bg-pattern.png`,
      fragmentRef: `https://fixturebrand.example/%23glow`,
      fontWoff2: `https://static.fixturebrand.example/fonts/CustomSans.woff2`,
      stylesheet: `https://static.fixturebrand.example/css/main.css`,
    };
    const lineageA = await mkFixtureLineage("lineage-a", urlsA);
    const invRunDirA = path.join(fixtureRoot, "inventory-a");
    const invA = await createAssetInventoryRun({
      siteSpecDir: lineageA.siteSpecDir,
      templateRunDir: lineageA.templateRunDir,
      contentRunDir: lineageA.contentRunDir,
      runId: "2026-08-19T00-00-00-000Z",
      outputDir: invRunDirA,
    });
    const entriesByUrl = new Map(invA.inventory.entries.map((e) => [e.url, e]));
    const classByUrl = new Map(
      invA.classification.map((d) => [d.url, d] as const),
    );
    check(
      "inventory: catalog 12-1 fragment + css-url 2-1 fragment + head favicon.svg/og/font 3 = 15 entries",
      invA.inventory.counts.entries === 15,
      String(invA.inventory.counts.entries),
    );
    check(
      "url(#fragment) refs skipped at ingestion (catalog + css channel)",
      invA.inventory.counts.fragmentRefsSkipped === 2 &&
        !entriesByUrl.has(urlsA.fragmentRef),
      String(invA.inventory.counts.fragmentRefsSkipped),
    );
    check(
      "isFragmentOnlyCssRef: raw + browser-serialized fragment shapes only",
      isFragmentOnlyCssRef("#b") &&
        isFragmentOnlyCssRef("https://nextjs.org/%23b") &&
        !isFragmentOnlyCssRef(`${CDN}/img/sprite.svg#icon`) &&
        !isFragmentOnlyCssRef(`${CDN}/img/hero.png`),
    );
    check("inventory: 1 inline-svg entry (no url)", invA.inventory.counts.inlineSvgEntries === 1);
    check(
      "truncated prefix URL detected",
      entriesByUrl.get(urlsA.truncated)?.truncated === true,
    );
    check(
      "non-truncated sibling stays untruncated",
      entriesByUrl.get(urlsA.hero)?.truncated === false,
    );
    check(
      "css url() becomes generated-css-url entry",
      entriesByUrl.get(urlsA.cssBg)?.origin === "generated-css-url",
    );
    check(
      "head favicon.ico deduped into catalog icon entry",
      entriesByUrl.get(urlsA.favicon)?.origin === "asset-catalog",
    );
    check(
      "slot join: person image carries its slot key",
      entriesByUrl.get(urlsA.person)?.slotKeys.includes("home.main.image.person") === true,
    );
    check(
      "brief join: person image carries the warning brief",
      entriesByUrl.get(urlsA.person)?.imageBrief?.warning !== null &&
        entriesByUrl.get(urlsA.person)?.imageBrief !== null,
    );
    check(
      "classification: font preload → license-needs-review",
      classByUrl.get(urlsA.fontWoff2)?.classification === "license-needs-review",
    );
    check(
      "classification: favicon → replacement-required",
      classByUrl.get(urlsA.favicon)?.classification === "replacement-required" &&
        classByUrl.get(urlsA.faviconSvg)?.classification === "replacement-required",
    );
    check(
      "classification: og:image → replacement-required",
      classByUrl.get(urlsA.ogImage)?.classification === "replacement-required",
    );
    check(
      "classification: logo filename → replacement-required",
      classByUrl.get(urlsA.logo)?.classification === "replacement-required" &&
        classByUrl.get(urlsA.logo)?.ruleId === "brand-filename",
    );
    check(
      "classification: person (brief warning) → replacement-required",
      classByUrl.get(urlsA.person)?.classification === "replacement-required" &&
        classByUrl.get(urlsA.person)?.ruleId === "image-brief-warning",
    );
    check(
      "classification: replace-recommended brief → replacement-recommended",
      classByUrl.get(urlsA.product)?.classification === "replacement-recommended",
    );
    check(
      "classification: keep-default brief → safe-to-materialize",
      classByUrl.get(urlsA.wave)?.classification === "safe-to-materialize",
    );
    check(
      "classification: video → replacement-recommended",
      classByUrl.get(urlsA.video)?.classification === "replacement-recommended",
    );
    check(
      "classification: unproven default → replacement-recommended",
      classByUrl.get(urlsA.hero)?.classification === "replacement-recommended" &&
        classByUrl.get(urlsA.hero)?.ruleId === "default-conservative",
    );
    check(
      "sibling-variant escalation: webp rendition of a required person photo → required",
      classByUrl.get(urlsA.personWebp)?.classification === "replacement-required" &&
        classByUrl.get(urlsA.personWebp)?.ruleId === "sibling-variant-escalation",
    );
    check(
      "sibling escalation never relaxes: safe keep-default asset stays safe",
      classByUrl.get(urlsA.wave)?.classification === "safe-to-materialize",
    );
    check(
      "inline-svg entries carry no classification decision",
      invA.classification.every((d) => d.url !== null),
    );
    const invRunDirA2 = path.join(fixtureRoot, "inventory-a2");
    await createAssetInventoryRun({
      siteSpecDir: lineageA.siteSpecDir,
      templateRunDir: lineageA.templateRunDir,
      contentRunDir: lineageA.contentRunDir,
      runId: "2026-08-19T00-00-00-000Z",
      outputDir: invRunDirA2,
    });
    let deterministic = true;
    for (const file of ["asset-inventory.json", "classification.json", "font-inventory.json", "manifest.json"]) {
      const a = await readFile(path.join(invRunDirA, file), "utf8");
      const b = await readFile(path.join(invRunDirA2, file), "utf8");
      if (a !== b) deterministic = false;
    }
    check("byte-deterministic across two runs with a pinned runId", deterministic);
    const loadedInv = await loadAssetInventoryRun(invRunDirA);
    check(
      "loadAssetInventoryRun round-trips (zod-validated)",
      loadedInv.inventory.counts.entries === 15 &&
        loadedInv.classification.length === invA.classification.length,
    );

    /* ============================================================ */
    section("6. font inventory + license safety");
    /* ============================================================ */
    const fontInv = invA.fontInventory;
    check(
      "font URL observed from rendered.html preload",
      fontInv.fontUrls.length === 1 && fontInv.fontUrls[0].url === urlsA.fontWoff2,
    );
    check(
      "no live fetch → fontFaceRules empty + provenance not-fetched",
      fontInv.fontFaceRules.length === 0 && fontInv.fontFaceProvenance === "not-fetched",
    );
    const customUsage = fontInv.familyUsage.find((u) => u.family === "customsans");
    check(
      "familyUsage counts declarations per lead family",
      customUsage !== undefined && customUsage.declarationCount === 2,
    );
    check(
      "webfont with no @font-face in clone flagged webfontUndefinedInClone",
      customUsage?.webfontUndefinedInClone === true,
    );
    check(
      "system family not flagged",
      fontInv.familyUsage.find((u) => u.family === "arial")?.webfontUndefinedInClone === false,
    );
    check(
      "license: every webfont family license-needs-review, selfHostApproved false",
      fontInv.license.length > 0 &&
        fontInv.license.every(
          (l) => l.status === "license-needs-review" && l.selfHostApproved === false,
        ),
    );
    check(
      "fallback plan derived from the observed stack",
      fontInv.fallbackPlan.find((p) => p.family === "customsans")?.fallbackStack ===
        '"Helvetica Neue", Arial, sans-serif',
    );
    // live @font-face fetch against a local fixture stylesheet
    const cssFixture = await startFixture({
      "/css/main.css": (_req, res) => {
        res.writeHead(200, { "content-type": "text/css" });
        res.end(
          `@font-face{font-family:customsans;src:url(/fonts/CustomSans.woff2) format("woff2");font-weight:1 1000;font-display:swap}` +
            `.x{color:red}`,
        );
      },
    });
    const urlsB = { ...urlsA, stylesheet: `${cssFixture.baseUrl}/css/main.css` };
    const lineageB = await mkFixtureLineage("lineage-b", urlsB);
    const invB = await createAssetInventoryRun({
      siteSpecDir: lineageB.siteSpecDir,
      templateRunDir: lineageB.templateRunDir,
      contentRunDir: lineageB.contentRunDir,
      outputDir: path.join(fixtureRoot, "inventory-b"),
      liveFontCss: {
        maxStylesheets: 3,
        policyBase: {
          timeoutMs: 5000,
          maxBytes: 1024 * 1024,
          maxRedirects: 2,
          allowedPorts: [cssFixture.port],
          allowPrivateHostPorts: new Set([`127.0.0.1:${cssFixture.port}`]),
        },
      },
    });
    check(
      "live-font-css: @font-face rule recovered with provenance live-fetched",
      invB.fontInventory.fontFaceProvenance === "live-fetched" &&
        invB.fontInventory.fontFaceRules.length === 1 &&
        invB.fontInventory.fontFaceRules[0].family === "customsans",
    );
    check(
      "live-font-css: relative src URL resolved against the stylesheet URL",
      invB.fontInventory.fontFaceRules[0]?.src[0]?.url ===
        `${cssFixture.baseUrl}/fonts/CustomSans.woff2` &&
        invB.fontInventory.fontFaceRules[0]?.src[0]?.format === "woff2",
    );
    check(
      "live-font-css: fetched stylesheet recorded with rule count",
      invB.fontInventory.fetchedStylesheets.length === 1 &&
        invB.fontInventory.fetchedStylesheets[0].fontFaceCount === 1,
    );
    await new Promise<void>((resolve) => cssFixture.server.close(() => resolve()));

    /* ============================================================ */
    section("7. content-hash materialization + replacement seam");
    /* ============================================================ */
    // Lineage whose catalog URLs point at the LOCAL asset fixture.
    const JPEG_BYTES = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
    const matFixture = await startFixture({
      "/img/hero.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_BYTES);
      },
      "/img/hero-large.png": (_req, res) => {
        // identical bytes → must dedupe into ONE media file
        res.writeHead(200, { "content-type": "image/png" });
        res.end(PNG_BYTES);
      },
      "/img/wave.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(JPEG_BYTES);
      },
      "/img/product-shot.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.concat([PNG_BYTES, Buffer.from([1])]));
      },
      "/img/bg-pattern.png": (_req, res) => {
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.concat([PNG_BYTES, Buffer.from([2])]));
      },
      // /video/intro.mp4 deliberately missing → http-error path
      "/video/intro.mp4": (_req, res) => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("gone");
      },
    });
    const MB = matFixture.baseUrl;
    const urlsC = {
      hero: `${MB}/img/hero.png`,
      hero2x: `${MB}/img/hero-large.png`,
      favicon: `${MB}/favicon.ico`,
      faviconSvg: `${MB}/favicon.svg`,
      ogImage: `${MB}/social/card.jpg`,
      video: `${MB}/video/intro.mp4`,
      truncated: `${MB}/img/hero`,
      person: `${MB}/img/team/johndoe.jpg`,
      personWebp: `${MB}/img/team/johndoe.jpg?fm=webp&q=80`,
      wave: `${MB}/img/wave.png`,
      product: `${MB}/img/product-shot.png`,
      logo: `${MB}/img/acme-logo-dark.png`,
      cssBg: `${MB}/img/bg-pattern.png`,
      fragmentRef: `${MB}/%23glow`,
      fontWoff2: `${MB}/fonts/CustomSans.woff2`,
      stylesheet: `${MB}/css/main.css`,
    };
    const lineageC = await mkFixtureLineage("lineage-c", urlsC);
    const invC = await createAssetInventoryRun({
      siteSpecDir: lineageC.siteSpecDir,
      templateRunDir: lineageC.templateRunDir,
      contentRunDir: lineageC.contentRunDir,
      outputDir: path.join(fixtureRoot, "inventory-c"),
    });
    const loadedInvC = await loadAssetInventoryRun(invC.outputDir);
    const matRunDir = path.join(fixtureRoot, "materialization-c");
    const mat = await createAssetMaterializationRun({
      inventoryRun: loadedInvC,
      outputDir: matRunDir,
      concurrency: 2,
      spacingMs: 0,
      timeoutMs: 5000,
      allowedPorts: [matFixture.port],
      allowPrivateHostPorts: new Set([`127.0.0.1:${matFixture.port}`]),
    });
    const entryByUrl = new Map(mat.manifest.entries.map((e) => [e.sourceUrl, e]));
    check(
      "safe + recommended candidates fetched (hero, hero2x, wave, product, cssBg)",
      ["hero", "hero2x", "wave", "product", "cssBg"].every(
        (k) => entryByUrl.get(urlsC[k as keyof typeof urlsC])?.status === "fetched",
      ),
    );
    const heroEntry = entryByUrl.get(urlsC.hero);
    const expectedSha = createHash("sha256").update(PNG_BYTES).digest("hex");
    check(
      "media file stored as /media/<sha256>.<ext> with the CONTENT hash",
      heroEntry?.sha256 === expectedSha && heroEntry?.localPath === `/media/${expectedSha}.png`,
    );
    const storedBytes = await readFile(path.join(matRunDir, "media", `${expectedSha}.png`));
    check("stored bytes byte-identical to fixture bytes", storedBytes.equals(PNG_BYTES));
    check(
      "identical bytes under two URLs dedupe into ONE media file",
      entryByUrl.get(urlsC.hero2x)?.localPath === heroEntry?.localPath &&
        mat.manifest.counts.uniqueFiles === 4,
      String(mat.manifest.counts.uniqueFiles),
    );
    check(
      "wave stored with mime-derived extension (jpg despite .png URL)",
      entryByUrl.get(urlsC.wave)?.localPath?.endsWith(".jpg") === true,
    );
    check(
      "replacement-required (person/logo/favicon/og + escalated webp sibling) NEVER fetched",
      ["person", "personWebp", "logo", "favicon", "faviconSvg", "ogImage"].every(
        (k) => entryByUrl.get(urlsC[k as keyof typeof urlsC])?.status.startsWith("skipped-") === true,
      ),
    );
    check(
      "fixture served ZERO requests for skipped person/logo paths",
      (matFixture.hits.get("/img/team/johndoe.jpg") ?? 0) === 0 &&
        (matFixture.hits.get("/img/acme-logo-dark.png") ?? 0) === 0,
    );
    check(
      "license-needs-review font NEVER fetched",
      entryByUrl.get(urlsC.fontWoff2)?.status === "skipped-license-needs-review" &&
        (matFixture.hits.get("/fonts/CustomSans.woff2") ?? 0) === 0,
    );
    check(
      "truncated URL skipped-truncated",
      entryByUrl.get(urlsC.truncated)?.status === "skipped-truncated",
    );
    check(
      "video 404 recorded as http-error failure (not invented)",
      entryByUrl.get(urlsC.video)?.status === "http-error" &&
        mat.manifest.counts.failed === 1,
    );
    check(
      "rewrite map contains exactly the fetched URLs",
      mat.rewriteMap.entries.length === mat.manifest.counts.fetched &&
        mat.rewriteMap.entries.every((e) => e.localPath.startsWith("/media/")),
    );
    check(
      "css-origin URL rewrites in css context only",
      mat.rewriteMap.entries.find((e) => e.sourceUrl === urlsC.cssBg)?.contexts.join(",") === "css",
    );
    const seamByUrl = new Map(mat.replacementManifest.entries.map((e) => [e.sourceUrl, e]));
    check(
      "replacement seam: required entry carries brief + awaiting-input",
      seamByUrl.get(urlsC.person)?.classification === "replacement-required" &&
        seamByUrl.get(urlsC.person)?.imageBrief?.warning !== null &&
        seamByUrl.get(urlsC.person)?.replacement.status === "awaiting-input",
    );
    check(
      "replacement seam: recommended entries listed, safe entries not",
      seamByUrl.has(urlsC.product) && !seamByUrl.has(urlsC.wave),
    );
    const loadedMat = await loadAssetMaterializationRun(matRunDir);
    check(
      "loadAssetMaterializationRun round-trips (zod-validated)",
      loadedMat.manifest.counts.fetched === mat.manifest.counts.fetched &&
        loadedMat.rewriteMap.entries.length === mat.rewriteMap.entries.length,
    );

    /* ============================================================ */
    section("8. rewrite application + asset proxy + real browser");
    /* ============================================================ */
    check(
      "rewriteVariants covers raw, &amp; and \\u0026 encodings",
      rewriteVariants("https://x/a?w=1&q=2").length === 3 &&
        rewriteVariants("https://x/plain").length === 1,
    );
    const localHero = heroEntry?.localPath as string;
    const testMap: RewriteMap = {
      schemaVersion: 1,
      entries: [
        { sourceUrl: `${MB}/img/hero.png`, localPath: localHero, contexts: ["html", "css"] },
        {
          sourceUrl: `${MB}/img/hero.png?w=100&q=90`,
          localPath: localHero,
          contexts: ["html", "css"],
        },
      ],
    };
    const htmlIn =
      `<img src="${MB}/img/hero.png?w=100&amp;q=90"> ` +
      `<script>self.x=["${MB}/img/hero.png?w=100\\u0026q=90"]</script> ` +
      `<a href="${MB}/img/hero.png">x</a>`;
    const htmlOut = applyRewrite(htmlIn, testMap, "html");
    check(
      "HTML rewrite replaces raw + &amp; + \\u0026 variants",
      !htmlOut.body.includes(`${MB}/img/hero.png`) && htmlOut.replacedOccurrences === 3,
      `occurrences ${htmlOut.replacedOccurrences}`,
    );
    check(
      "longest-URL-first: query variant did not get prefix-clobbered",
      htmlOut.body.includes(`src="${localHero}"`) && !htmlOut.body.includes("?w=100"),
    );
    const cssOut = applyRewrite(`.a{background:url(${MB}/img/hero.png)}`, testMap, "css");
    check("CSS rewrite replaces url() reference", cssOut.body.includes(`url(${localHero})`));

    // upstream app fixture served through the real asset proxy
    const pageHtml =
      `<!doctype html><html><head><link rel="stylesheet" href="${GENERATED_STYLES_PATH}"></head>` +
      `<body><img id="hero" src="${MB}/img/hero.png?w=100&amp;q=90"><p>fixture page</p></body></html>`;
    const upstreamApp = await startFixture({
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(pageHtml);
      },
      [GENERATED_STYLES_PATH]: (_req, res) => {
        res.writeHead(200, { "content-type": "text/css" });
        res.end(`body{background-image:url(${MB}/img/hero.png)}`);
      },
      "/plain.bin": (_req, res) => {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(Buffer.from([1, 2, 3, 4]));
      },
    });
    const proxy = await startAssetProxy(upstreamApp.baseUrl, {
      mediaDir: path.join(matRunDir, "media"),
      rewriteMap: testMap,
      themeOverlayCss: "/* theme overlay marker */",
    });
    const proxiedHtml = await (await fetch(`${proxy.baseUrl}/`)).text();
    check(
      "proxied HTML rewritten to /media path",
      proxiedHtml.includes(`src="${localHero}"`) && !proxiedHtml.includes(`${MB}/img/hero.png`),
    );
    const proxiedCss = await (await fetch(`${proxy.baseUrl}${GENERATED_STYLES_PATH}`)).text();
    check(
      "proxied stylesheet: url() rewritten AND theme overlay appended after",
      proxiedCss.includes(`url(${localHero})`) &&
        proxiedCss.includes("theme overlay marker"),
    );
    const mediaResponse = await fetch(`${proxy.baseUrl}${localHero}`);
    check(
      "/media serves 200 with correct content-type",
      mediaResponse.status === 200 &&
        (mediaResponse.headers.get("content-type") ?? "") === "image/png",
    );
    check(
      "/media bytes are the stored asset bytes",
      Buffer.from(await mediaResponse.arrayBuffer()).equals(PNG_BYTES),
    );
    check(
      "unknown /media file → 404",
      (await fetch(`${proxy.baseUrl}/media/${"0".repeat(64)}.png`)).status === 404,
    );
    const binResponse = await fetch(`${proxy.baseUrl}/plain.bin`);
    check(
      "non-HTML passthrough byte-identical",
      Buffer.from(await binResponse.arrayBuffer()).equals(Buffer.from([1, 2, 3, 4])),
    );
    check("mediaContentType maps woff2 + fallback", mediaContentType("a.woff2") === "font/woff2" && mediaContentType("a.xyz") === "application/octet-stream");

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const requested: string[] = [];
      page.on("request", (request) => requested.push(request.url()));
      await page.goto(`${proxy.baseUrl}/`, { waitUntil: "load", timeout: 30_000 });
      await page.waitForTimeout(400);
      check(
        "browser loads the image from /media through the proxy",
        requested.some((u) => u === `${proxy.baseUrl}${localHero}`),
      );
      check(
        "browser makes ZERO requests to the source asset URL",
        !requested.some((u) => u.startsWith(`${MB}/img/`)),
        requested.filter((u) => u.startsWith(`${MB}/img/`)).join(", "),
      );
      const imgOk = (await page.evaluate(
        "(() => { const i = document.getElementById('hero'); return i && i.complete && i.naturalWidth > 0; })()",
      )) as boolean;
      check("image actually decoded (naturalWidth > 0)", imgOk === true);
    } finally {
      await browser.close();
    }

    await proxy.stop();
    await new Promise<void>((resolve) => upstreamApp.server.close(() => resolve()));
    await new Promise<void>((resolve) => matFixture.server.close(() => resolve()));
    await new Promise<void>((resolve) => assetFixture.server.close(() => resolve()));

    check("findTruncatedUrls: exact duplicates are not truncation", findTruncatedUrls(["https://a/x", "https://a/x"]).size === 0);
    check(
      "findTruncatedUrls: query variant prefix is NOT truncation",
      findTruncatedUrls(["https://a/w.png", "https://a/w.png?w=2784&q=60"]).size === 0 &&
        findTruncatedUrls(["https://a/w.png?w=21&q=80", "https://a/w.png?w=21&q=80&fm=webp"]).size === 0,
    );
    check(
      "findTruncatedUrls: mid-token prefix IS truncation",
      findTruncatedUrls(["https://a/fzn2n1nzq", "https://a/fzn2n1nzq965/img.png"]).has(
        "https://a/fzn2n1nzq",
      ),
    );
    check(
      "findTruncatedUrls: cut HOSTNAME detected despite normalized trailing slash",
      findTruncatedUrls(["https://images.st/", "https://images.stripeassets.com/x.png"]).has(
        "https://images.st/",
      ),
    );
    check(
      "findTruncatedUrls: subdomain-boundary host prefix is NOT truncation",
      findTruncatedUrls(["https://cdn.example/x.png", "https://cdn.example.mx/y.png"]).size === 0,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[smoke:assets] ERROR —", err);
  process.exitCode = 1;
});
