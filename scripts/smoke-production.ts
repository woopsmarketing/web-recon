/**
 * pnpm smoke:production — Task 23 fixture tests.
 *
 * Everything goes through the public barrel (../src/production/index.js):
 * dir-sha256-v1 hashing, the guarded template-app patches (content bake /
 * theme link / static export conversion), route-title baking, exported-site
 * post-processing (head splice + asset rewrite + robots), the generated
 * dependency-free static server (spawned and exercised over real HTTP),
 * theme probe parsing, the ProductionSpec schema, and the isolated package
 * launcher (minimal-env spawn outside the repo).
 *
 * Fixture-only: no lineage run directory, no network. Chromium is used only
 * for the interaction-sampling fixtures (Task 24 GED-A).
 */
import { readdir } from "node:fs/promises";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  bakeRouteTitles,
  buildPreviewBlockers,
  hashDirectory,
  hashFile,
  launchPackageIsolated,
  parseThemeProbes,
  patchLayout,
  patchNextConfig,
  patchPageTsx,
  patchSlotContent,
  pickContentProof,
  postProcessExport,
  PRODUCTION_PAGE_TSX,
  productionSpecSchema,
  renderServerMjs,
  routeHtmlFile,
  sampleInteractions,
  SERVER_READY_PREFIX,
  summarizeResidualRequests,
  THEME_OVERLAY_HREF,
} from "../src/production/index.js";
import { censusServedHtml, summarizeBrandCensus } from "../src/production/qa.js";
import { applyEnablementToApp, emptyEnablementPlan } from "../src/production/enablement.js";
import {
  censusFlightPayload,
  decodeFlightPayload,
  extractInlineFlightChunks,
  flightBrandSurfaceTotal,
  markupBrandSurfaceTotal,
  stripReferencedObservationChunks,
} from "../src/production/brand-census.js";
import type { RewriteMap } from "../src/assets/types.js";

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
function throws(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const fixtureRoot = path.resolve("data", `.smoke-production-${process.pid}`);

// ---------------------------------------------------------------------------
section("dir-sha256-v1 hashing");
{
  const dirA = path.join(fixtureRoot, "hash", "a");
  const dirB = path.join(fixtureRoot, "hash", "b");
  await mkdir(path.join(dirA, "sub"), { recursive: true });
  await mkdir(path.join(dirB, "sub"), { recursive: true });
  await writeFile(path.join(dirA, "x.txt"), "one");
  await writeFile(path.join(dirA, "sub", "y.txt"), "two");
  // b: same bytes, created in the opposite order
  await writeFile(path.join(dirB, "sub", "y.txt"), "two");
  await writeFile(path.join(dirB, "x.txt"), "one");
  const hashA = await hashDirectory(dirA);
  const hashB = await hashDirectory(dirB);
  check("identical trees hash identically", hashA.hash === hashB.hash);
  check("fileCount counted", hashA.fileCount === 2, String(hashA.fileCount));
  check("byteCount counted", hashA.byteCount === 6, String(hashA.byteCount));
  const fileHash = await hashFile(path.join(dirA, "x.txt"));
  check("hashFile is sha256 of bytes", fileHash === "7692c3ad3540bb803c020b3aee66cd8887123234ea0c6e7143c0add73ff431ed");
  await writeFile(path.join(dirB, "x.txt"), "one!");
  const hashB2 = await hashDirectory(dirB);
  check("byte change changes the hash", hashB2.hash !== hashA.hash);
  await mkdir(path.join(dirB, "node_modules"), { recursive: true });
  await writeFile(path.join(dirB, "node_modules", "junk.js"), "junk");
  const hashB3 = await hashDirectory(dirB, ["node_modules"]);
  check("excluded subtree does not affect the hash", hashB3.hash === hashB2.hash);
  check("exclusions recorded", hashB3.excluded.includes("node_modules"));
}

// ---------------------------------------------------------------------------
section("guarded template patches");
{
  // fixtures replicate the generated anchors exactly (the real compile run
  // fails loudly if a future generator diverges — that is the point).
  const nextConfig = "/** generated */\nconst nextConfig = {\n  reactStrictMode: true,\n};\nexport default nextConfig;\n";
  const patchedConfig = patchNextConfig(nextConfig);
  check("next.config gains output: export", patchedConfig.includes('output: "export"'));
  check("next.config re-patch throws", throws(() => patchNextConfig(patchedConfig)) !== null);
  check("next.config missing anchor throws", throws(() => patchNextConfig("nothing here")) !== null);

  const pageTsx =
    'export const dynamic = "force-dynamic";\n' +
    "async function CatchAllPage() {\n  const route = await findRoute(slug, await searchParams);\n" +
    "  const page = await loadPage(route.pageFile);\n}\n";
  const patchedPage = patchPageTsx(pageTsx);
  check("page.tsx becomes the static-export page", patchedPage === PRODUCTION_PAGE_TSX);
  check("static page declares generateStaticParams", patchedPage.includes("generateStaticParams"));
  check("static page forbids dynamic params", patchedPage.includes("dynamicParams = false"));
  check("page.tsx re-patch throws", throws(() => patchPageTsx(patchedPage)) !== null);
  check("page.tsx missing anchor throws", throws(() => patchPageTsx("const x = 1;")) !== null);

  const slotContent =
    "  const values = new Map();\n" +
    "  const overlayFile = process.env.WR_SLOT_VALUES_FILE;\n" +
    "  if (overlayFile) {\n" +
    '    const raw = await readFile(path.resolve(process.cwd(), overlayFile), "utf8");\n' +
    "    const overlay = JSON.parse(raw);\n  }\n";
  const patchedSlots = patchSlotContent(slotContent);
  check("slot-content drops the env seam", !patchedSlots.includes("WR_SLOT_VALUES_FILE"));
  check("slot-content reads the baked overlay", patchedSlots.includes("slot-values.baked.json"));
  check("slot-content re-patch throws", throws(() => patchSlotContent(patchedSlots)) !== null);

  const layout =
    "<body>\n" +
    '        <link rel="stylesheet" href={GENERATED_STYLES_HREF} precedence="wr-generated" />\n' +
    "        {children}\n</body>\n";
  const patchedLayout = patchLayout(layout);
  check("layout links the theme overlay", patchedLayout.includes(`href="${THEME_OVERLAY_HREF}"`));
  check(
    "theme overlay cascades AFTER the generated sheet",
    patchedLayout.indexOf("GENERATED_STYLES_HREF") < patchedLayout.indexOf(THEME_OVERLAY_HREF),
  );
  check("layout re-patch throws", throws(() => patchLayout(patchedLayout)) !== null);
}

// ---------------------------------------------------------------------------
section("route-title bake");
{
  const routeMap = {
    routes: [
      { key: "/", title: "Source Home" },
      { key: "/a", title: "Source A" },
      { key: "/b", title: "Drifted Title" },
    ],
  };
  const result = bakeRouteTitles(routeMap, [
    { route: "/", upstreamTitle: "Source Home", title: "새 홈" },
    { route: "/a", upstreamTitle: null, title: "새 A" },
    { route: "/b", upstreamTitle: "Source B", title: "새 B" },
    { route: "/missing", upstreamTitle: "X", title: "Y" },
  ]);
  check("all present routes baked", result.baked === 3, String(result.baked));
  check("titles replaced", routeMap.routes.every((route) => route.title.startsWith("새")));
  check("null upstream title bakes without mismatch", result.mismatches.every((m) => m.route !== "/a"));
  check(
    "guard mismatch recorded honestly",
    result.mismatches.length === 1 && result.mismatches[0].route === "/b",
    JSON.stringify(result.mismatches),
  );
  check("missing route recorded", result.missingRoutes.length === 1 && result.missingRoutes[0] === "/missing");
}

// ---------------------------------------------------------------------------
section("content proof selection");
{
  const slots = {
    slots: [
      { id: "s1", key: "hero.title" },
      { id: "s2", key: "hero.badge" },
      { id: "s3", key: "hero.escaped" },
      { id: "s4", key: "hero.unchanged" },
      { id: "s5", key: "menu.dynamic" },
    ],
  };
  const bindings = {
    bindings: [
      { slotId: "s1", pageId: "p1", viewport: "desktop", surface: "static", target: "text" },
      { slotId: "s2", pageId: "p1", viewport: "desktop", surface: "static", target: "text" },
      { slotId: "s3", pageId: "p1", viewport: "desktop", surface: "static", target: "text" },
      { slotId: "s4", pageId: "p1", viewport: "desktop", surface: "static", target: "text" },
      { slotId: "s5", pageId: "p1", viewport: "desktop", surface: "dynamic-template", target: "text" },
      { slotId: "s1", pageId: "p2", viewport: "desktop", surface: "static", target: "text" },
    ],
  };
  const defaults = {
    "hero.title": "Original hero",
    "hero.badge": "Original badge",
    "hero.escaped": "Original escaped",
    "hero.unchanged": "동일한 값 유지됨",
    "menu.dynamic": "Original menu",
  };
  const overlay = {
    "hero.title": "업무 자동화의 새로운 기준",
    "hero.badge": "신규 기능이 출시되었습니다",
    "hero.escaped": "A & B <새로운>",
    "hero.unchanged": "동일한 값 유지됨",
    "menu.dynamic": "다이나믹 메뉴 값입니다",
  };
  const proofs = pickContentProof(slots, bindings, defaults, overlay, "p1", 5);
  const keys = proofs.map((proof) => proof.slotKey);
  check("changed static text values picked", keys.includes("hero.title") && keys.includes("hero.badge"));
  check("html-escapable values skipped", !keys.includes("hero.escaped"));
  check("unchanged values skipped (must prove injection)", !keys.includes("hero.unchanged"));
  check("dynamic-template surfaces skipped", !keys.includes("menu.dynamic"));
  check("deterministic order (sorted keys)", JSON.stringify(keys) === JSON.stringify([...keys].sort()));
  const limited = pickContentProof(slots, bindings, defaults, overlay, "p1", 1);
  check("count respected", limited.length === 1);
  // Task 28 Phases 5 + 6: a proof is a promise QA holds the served HTML to, so
  // a slot the enablement plan stops rendering must never become one.
  const disabledProofs = pickContentProof(
    slots,
    bindings,
    defaults,
    overlay,
    "p1",
    5,
    new Set(["hero.title"]),
  );
  check(
    "28.P5.PR1 a DISABLED slot is never promised as a content proof",
    !disabledProofs.map((proof) => proof.slotKey).includes("hero.title") &&
      disabledProofs.map((proof) => proof.slotKey).includes("hero.badge"),
    disabledProofs.map((proof) => proof.slotKey).join(","),
  );
  check(
    "28.P5.PR2 with no disabled set the selection is byte-identical to before the parameter existed",
    JSON.stringify(pickContentProof(slots, bindings, defaults, overlay, "p1", 5)) ===
      JSON.stringify(proofs),
  );
}

// ---------------------------------------------------------------------------
section("28 Phases 5 + 6 — the disable, applied to a build copy of the app");
{
  const enDir = path.join(fixtureRoot, "enablement-app", "reconstruction-data");
  await mkdir(path.join(enDir, "pages"), { recursive: true });
  const page = (pageId: string, extra: unknown[] = []): unknown => ({
    pageId,
    desktop: {
      id: "desktop",
      width: 1440,
      doc: {
        k: "e",
        n: "n1",
        t: "div",
        c: [
          { k: "e", n: "n2", t: "header", c: [{ k: "e", n: "n3", t: "a", p: { href: "/gone" }, c: [{ k: "t", v: "Gone" }] }] },
          { k: "e", n: "n4", t: "main", c: [{ k: "e", n: "n5", t: "section", c: [{ k: "e", n: "n6", t: "p", c: [{ k: "t", v: "inside" }] }] }, ...extra] },
        ],
      },
    },
    mobile: { id: "mobile", width: 390, doc: { k: "e", n: "m1", t: "div", c: [{ k: "e", n: "m2", t: "main" }] } },
  });
  await writeFile(path.join(enDir, "pages", "p1.json"), JSON.stringify(page("p1")), "utf8");
  await writeFile(path.join(enDir, "pages", "p2.json"), JSON.stringify(page("p2")), "utf8");
  await writeFile(
    path.join(enDir, "route-map.json"),
    JSON.stringify({
      schemaVersion: 1,
      rootUrl: "https://fixture.example/",
      breakpoint: 1024,
      routes: [
        { routeId: "r1", key: "/", url: "https://fixture.example/", path: "/", pageFile: "pages/p1.json", pageSourceId: "p1" },
        { routeId: "r2", key: "/gone", url: "https://fixture.example/gone", path: "/gone", pageFile: "pages/p2.json", pageSourceId: "p2" },
      ],
    }),
    "utf8",
  );
  const appDir = path.join(fixtureRoot, "enablement-app");
  const report = await applyEnablementToApp(appDir, {
    ...emptyEnablementPlan(),
    disabledRoutes: ["/gone"],
    disabledRegionIds: ["p1:rgn:main1:section:1"],
    disabledNodes: [{ regionId: "p1:rgn:main1:section:1", pageSourceId: "p1", viewport: "desktop", nodeId: "n5" }],
    removedNavNodes: [
      { pageSourceId: "p1", viewport: "desktop", nodeId: "n3", slotKey: "nav.gone.href", groupId: "nav.gone", targetRoute: "/gone" },
    ],
    disabledSlotKeys: ["nav.gone.href", "nav.gone.label"],
  });
  const afterRouteMap = JSON.parse(await readFile(path.join(enDir, "route-map.json"), "utf8")) as {
    routes: Array<{ key: string }>;
  };
  const afterPage = await readFile(path.join(enDir, "pages", "p1.json"), "utf8");
  check(
    "28.P6.PR3 the disabled route leaves the route table and its orphaned page tree is deleted",
    afterRouteMap.routes.length === 1 &&
      afterRouteMap.routes[0].key === "/" &&
      report.pageFilesRemoved.join(",") === "pages/p2.json" &&
      !(await readdir(path.join(enDir, "pages"))).includes("p2.json"),
    `${afterRouteMap.routes.map((route) => route.key).join(",")} removed=${report.pageFilesRemoved.join(",")}`,
  );
  check(
    "28.P5.PR4 the region root AND its whole subtree are gone; the nav host is gone; the rest of the tree is untouched",
    !afterPage.includes('"n5"') &&
      !afterPage.includes('"n6"') &&
      !afterPage.includes('"n3"') &&
      afterPage.includes('"n4"') &&
      afterPage.includes('"n2"') &&
      report.regionNodesRemoved === 1 &&
      report.navNodesRemoved === 1,
    `regions=${report.regionNodesRemoved} nav=${report.navNodesRemoved}`,
  );
  check(
    "28.P6.PR5 an id the tree does not carry is reported as NOT FOUND, never silently ignored",
    (
      await applyEnablementToApp(appDir, {
        ...emptyEnablementPlan(),
        disabledNodes: [{ regionId: "x", pageSourceId: "p1", viewport: "desktop", nodeId: "n404" }],
      })
    ).regionNodesNotFound.length === 1,
  );
  // A nav host INSIDE a region the same edit disables is GONE, not missing.
  const nestedDir = path.join(fixtureRoot, "enablement-nested", "reconstruction-data");
  await mkdir(path.join(nestedDir, "pages"), { recursive: true });
  await writeFile(path.join(nestedDir, "pages", "p1.json"), JSON.stringify(page("p1")), "utf8");
  await writeFile(
    path.join(nestedDir, "route-map.json"),
    JSON.stringify({
      schemaVersion: 1,
      rootUrl: "https://fixture.example/",
      breakpoint: 1024,
      routes: [
        { routeId: "r1", key: "/", url: "https://fixture.example/", path: "/", pageFile: "pages/p1.json", pageSourceId: "p1" },
      ],
    }),
    "utf8",
  );
  const nested = await applyEnablementToApp(path.join(fixtureRoot, "enablement-nested"), {
    ...emptyEnablementPlan(),
    disabledRegionIds: ["p1:rgn:main1:self"],
    disabledNodes: [{ regionId: "p1:rgn:main1:self", pageSourceId: "p1", viewport: "desktop", nodeId: "n4" }],
    removedNavNodes: [
      { pageSourceId: "p1", viewport: "desktop", nodeId: "n6", slotKey: "inside.href", groupId: null, targetRoute: "/gone" },
    ],
    disabledSlotKeys: [],
  });
  check(
    "28.P6.PR6 a nav host INSIDE a region the same edit disables is reported REMOVED, not missing",
    nested.regionNodesRemoved === 1 &&
      nested.navNodesRemoved === 1 &&
      nested.navNodesNotFound.length === 0,
    `regions=${nested.regionNodesRemoved} nav=${nested.navNodesRemoved} missing=${nested.navNodesNotFound.length}`,
  );
}

// ---------------------------------------------------------------------------
section("export post-processing (head splice + rewrite + robots)");
{
  const outDir = path.join(fixtureRoot, "out");
  await mkdir(path.join(outDir, "sub"), { recursive: true });
  await mkdir(path.join(outDir, "wr"), { recursive: true });
  const assetUrl = "https://cdn.example-source.com/img/a.png?q=80&w=100";
  await writeFile(
    path.join(outDir, "index.html"),
    `<!DOCTYPE html><html><head><title>새 홈</title></head><body><img src="${assetUrl.replace(/&/g, "&amp;")}"><a href="https://cdn.example-source.com/keep/required.png">x</a></body></html>`,
  );
  await writeFile(
    path.join(outDir, "sub", "page.html"),
    `<!DOCTYPE html><html><head><title>새 서브</title></head><body>plain</body></html>`,
  );
  await writeFile(path.join(outDir, "index.txt"), `payload ${assetUrl.replace(/&/g, "\\u0026")} end`);
  await writeFile(path.join(outDir, "wr", "generated-styles.css"), `.x{background:url(${assetUrl})}`);
  const rewriteMap: RewriteMap = {
    schemaVersion: 1,
    entries: [
      { sourceUrl: assetUrl, localPath: "/media/aaaa.png", contexts: ["html", "css"] },
    ],
  } as RewriteMap;
  const planRoutes = [
    { route: "/", upstreamTitle: "Old", title: "새 홈", headHtml: "<!-- wr-seo-head-start --><meta name=\"robots\" content=\"noindex,nofollow\"/><!-- wr-seo-head-end -->" },
    { route: "/sub/page", upstreamTitle: null, title: "새 서브", headHtml: "<!-- wr-seo-head-start --><!-- wr-seo-head-end -->" },
    { route: "/missing", upstreamTitle: null, title: "없음", headHtml: "<!-- wr-seo-head-start -->" },
  ];
  const robots = "User-agent: *\nDisallow: /\n";
  const result = await postProcessExport(
    outDir,
    planRoutes,
    rewriteMap,
    robots,
    ["cdn.example-source.com"],
    "cdn.example-source.com",
  );
  check("routeHtmlFile maps / to index.html", routeHtmlFile("/") === "index.html");
  check("routeHtmlFile maps nested routes", routeHtmlFile("/sub/page") === "sub/page.html");
  check("head blocks spliced", result.seo.headBlocksSpliced === 2, String(result.seo.headBlocksSpliced));
  check("missing exported file recorded", result.seo.headSpliceFailures.length === 1, JSON.stringify(result.seo.headSpliceFailures));
  check("baked titles verified", result.seo.titleVerifiedRoutes === 2, String(result.seo.titleVerifiedRoutes));
  const indexHtml = await readFile(path.join(outDir, "index.html"), "utf8");
  check("head block sits before </head>", indexHtml.indexOf("wr-seo-head-start") < indexHtml.indexOf("</head>"));
  check("html-escaped asset url rewritten", indexHtml.includes('src="/media/aaaa.png"'));
  const flight = await readFile(path.join(outDir, "index.txt"), "utf8");
  check("json-escaped flight url rewritten", flight.includes("/media/aaaa.png"));
  const css = await readFile(path.join(outDir, "wr", "generated-styles.css"), "utf8");
  check("css url rewritten", css.includes("url(/media/aaaa.png)"));
  check(
    "rewrite occurrences counted",
    result.assets.rewrite.htmlReplacedOccurrences === 1 &&
      result.assets.rewrite.flightReplacedOccurrences === 1 &&
      result.assets.rewrite.cssReplacedOccurrences === 1,
    JSON.stringify(result.assets.rewrite),
  );
  check(
    "residual source-host occurrences counted honestly",
    result.assets.residualSourceUrlOccurrencesInSite === 1,
    String(result.assets.residualSourceUrlOccurrencesInSite),
  );
  const robotsOut = await readFile(path.join(outDir, "robots.txt"), "utf8");
  check("robots.txt emitted from the plan", robotsOut === robots);
  // ---- Task 28 CR7: the bake carries its own brand-surface census ---------
  check(
    "28.CR7.1 bake report carries a brand census measured on the exported route HTML",
    result.brand.measuredOn === "static-export-route-html" &&
      result.brand.measurementNote.length > 0,
    JSON.stringify({ measuredOn: result.brand.measuredOn }),
  );
  check(
    "28.CR7.2 brand tokens derived from the source host, never hardcoded",
    JSON.stringify(result.brand.census.brandTokens) === JSON.stringify(["cdn"]),
    JSON.stringify(result.brand.census.brandTokens),
  );
  check(
    "28.CR7.3 only routes with an exported file are censused (missing route omitted, not zeroed)",
    result.brand.census.routesMeasured === 2 &&
      result.brand.census.byRoute.map((row) => row.route).join(",") === "/,/sub/page",
    JSON.stringify(result.brand.census.byRoute.map((row) => row.route)),
  );
  check(
    "28.CR7.4 census is measured AFTER the asset rewrite (rewritten src no longer counts as a source URL)",
    result.brand.census.sourceUrl === 1 && result.brand.census.bodyAnchorIdentity === 1,
    JSON.stringify({
      sourceUrl: result.brand.census.sourceUrl,
      bodyAnchorIdentity: result.brand.census.bodyAnchorIdentity,
    }),
  );
  check(
    "28.CR7.5 per-route census sums to the report-level census",
    result.brand.census.byRoute.reduce((sum, row) => sum + row.sourceUrl, 0) ===
      result.brand.census.sourceUrl,
    JSON.stringify(result.brand.census.byRoute),
  );
  const again = await postProcessExport(
    outDir,
    planRoutes.slice(0, 1),
    rewriteMap,
    robots,
    [],
    "cdn.example-source.com",
  );
  check(
    "28.CR7.6 a narrowed route list censuses only those routes",
    again.brand.census.routesMeasured === 1 && again.brand.census.byRoute[0].route === "/",
    JSON.stringify(again.brand.census.byRoute.map((row) => row.route)),
  );
  check(
    "double head-splice refused",
    again.seo.headBlocksSpliced === 0 && again.seo.headSpliceFailures[0].includes("already present"),
    JSON.stringify(again.seo.headSpliceFailures),
  );
  // ---- Task 28 Phase 2: the RSC FLIGHT axis --------------------------------
  // The markup census reads ONE encoding. A Next static export ships the same
  // inline SVG again in the `.txt` flight (JSON-escaped) and again inside the
  // `self.__next_f.push` chunks inlined in the HTML (escaped twice). Without a
  // flight axis a markup-only rewrite reports a clean census while the site
  // still ships the source brand — and the flight WINS on hydration, because
  // the inline SVG arrives through dangerouslySetInnerHTML.
  check(
    "28.P2.F1 the bake report carries a flight axis alongside the markup census",
    typeof result.brand.flight.svgAriaLabel === "number" &&
      result.brand.flight.txtFiles === 1 &&
      result.brand.flight.documents === result.brand.flight.txtFiles + result.brand.flight.htmlDocuments,
    JSON.stringify(result.brand.flight),
  );
  check(
    "28.P2.F2 `bake` is null when no resolver ran — which is NOT 'nothing was found'",
    result.brand.bake === null,
  );
}

section("28 Phase 2 — the flight census sees what the markup census cannot");
{
  const outDir = path.join(fixtureRoot, "flight-out");
  await mkdir(outDir, { recursive: true });
  const mark = '<svg viewBox="0 0 60 25" aria-label="Acme Logo"><title>Acme logo</title></svg>';
  // 1. SSR markup, 2. the same mark JSON-escaped in the inlined flight chunk.
  const inlined = mark.replace(/</g, "\\u003c").replace(/"/g, '\\\\\"');
  await writeFile(
    path.join(outDir, "index.html"),
    `<!DOCTYPE html><html><head><title>t</title></head><body><span>${mark}</span>` +
      `<script>self.__next_f.push([1,"3:[\"$\",\"span\",null,{\"dangerouslySetInnerHTML\":{\"__html\":\"${inlined}\"}}]"])</script>` +
      "</body></html>",
  );
  // The `.txt` flight: JSON-escaped props AND a raw length-prefixed T-chunk.
  await writeFile(
    path.join(outDir, "index.txt"),
    `2:{"aria-label":"Acme Home"}\n3:I{"__html":"${mark.replace(/"/g, '\\"')}"}\n` +
      `10:T${mark.length.toString(16)},${mark}\n`,
  );
  const planRoutes = [
    { route: "/", upstreamTitle: null, title: "t", headHtml: "<!-- wr-seo-head-start --><!-- wr-seo-head-end -->" },
  ];
  const flightResult = await postProcessExport(
    outDir,
    planRoutes,
    { schemaVersion: 1, entries: [] } as unknown as RewriteMap,
    "User-agent: *\n",
    [],
    "acme.com",
  );
  const html = await readFile(path.join(outDir, "index.html"), "utf8");
  const txt = await readFile(path.join(outDir, "index.txt"), "utf8");
  const markupOnly = censusServedHtml(html, "acme.com", ["acme"]);
  const chunks = extractInlineFlightChunks(html);
  const inlineCensus = censusFlightPayload(chunks.join(""), "acme.com", ["acme"]);
  const txtCensus = censusFlightPayload(txt, "acme.com", ["acme"]);
  console.log(
    `  [measured] markup svgAriaLabel=${markupOnly.svgAriaLabel} svgText=${markupOnly.svgText}; ` +
      `inlined-chunk svgAriaLabel=${inlineCensus.svgAriaLabel}; txt svgAriaLabel=${txtCensus.svgAriaLabel} ` +
      `chunks=${txtCensus.lengthPrefixedChunks}`,
  );
  check("28.P2.F3 an inlined flight chunk is found in the html", chunks.length === 1, String(chunks.length));
  check(
    "28.P2.F4 the double-escaped inlined chunk is decoded and measured",
    inlineCensus.svgAriaLabel === 1,
    JSON.stringify(inlineCensus),
  );
  check(
    "28.P2.F5 the JSON-escaped .txt flight is measured too",
    txtCensus.svgAriaLabel >= 1,
    JSON.stringify(txtCensus),
  );
  check(
    "28.P2.F6 the length-prefixed T-chunk encoding is recognised",
    txtCensus.lengthPrefixedChunks === 1,
    String(txtCensus.lengthPrefixedChunks),
  );
  check(
    "28.P2.F7 the flight axis on the bake report sums both encodings",
    flightBrandSurfaceTotal(flightResult.brand.flight) >= inlineCensus.svgAriaLabel + txtCensus.svgAriaLabel,
    JSON.stringify(flightResult.brand.flight),
  );
  check(
    "28.P2.F8 decoding is idempotent",
    decodeFlightPayload(decodeFlightPayload(txt)) === decodeFlightPayload(txt),
  );
  // ---- observation-evidence payloads are NOT rendered surfaces ------------
  // `data-wr-obs` carries the recorded interaction evidence the exact-
  // reconstruction verifier reads. It is an ATTRIBUTE VALUE holding serialized
  // nodes, so nothing inside it renders as an alt / aria-label / inline SVG.
  // The markup census can never match it (it is escaped); the flight census
  // decodes, so it would — and on the real linear lineage it did, reporting
  // residual brand after every rendered surface had been resolved. An
  // over-strict gate is as dishonest as a lax one, so it is excluded — but
  // ONLY by structure: an inline value, or a chunk actually referenced as one.
  const obsAlt = '{"alt":"A blueprint image of a project in Acme"}';
  const inlineObs = `1:[{"p":{"data-wr-obs":"[{\\"k\\":\\"e\\",\\"p\\":${obsAlt.replace(/"/g, '\\\\"')}}]"}}]`;
  check(
    "28.P2.F10 an INLINE data-wr-obs payload is excluded from the flight census",
    censusFlightPayload(inlineObs, "acme.com", ["acme"]).imageAlt === 0,
    JSON.stringify(censusFlightPayload(inlineObs, "acme.com", ["acme"])),
  );
  const hoisted =
    `1:[{"p":{"data-wr-obs":"$7","alt":"Acme hero"}}]\n` +
    `7:T2f,[{"k":"e","p":${obsAlt}}]\n` +
    `8:T20,[{"k":"e","p":{"alt":"Acme banner"}}]\n`;
  const hoistedCensus = censusFlightPayload(hoisted, "acme.com", ["acme"]);
  check(
    "28.P2.F11 a HOISTED obs chunk (referenced as $id) is excluded — and ONLY that chunk",
    hoistedCensus.imageAlt === 2,
    JSON.stringify(hoistedCensus),
  );
  check(
    "28.P2.F12 the exclusion is structural: an unreferenced chunk is never dropped",
    stripReferencedObservationChunks(hoisted).includes("Acme banner") &&
      !stripReferencedObservationChunks(hoisted).includes("blueprint image"),
  );
  check(
    "28.P2.F13 a payload with no data-wr-obs reference is returned untouched",
    stripReferencedObservationChunks("1:T10,[{\"alt\":\"Acme\"}]") === "1:T10,[{\"alt\":\"Acme\"}]",
  );
  check(
    "28.P2.F9 markupBrandSurfaceTotal counts only the surfaces this resolver owns",
    markupBrandSurfaceTotal({
      sourceUrl: 99,
      bodyAnchorIdentity: 99,
      visibleText: 99,
      imageSrcPath: 1,
      imageAlt: 1,
      ariaLabel: 1,
      svgAriaLabel: 1,
      svgSymbolId: 1,
      svgText: 1,
    }) === 6,
  );
  // Task 28 close-out: `imageSrcPath` IS one of them — `image-logo` is the
  // first resolvable surface and the resolver rewrites `props.src` for it.
  // `sourceUrl` still is NOT: it is the asset layer's axis, and a self-hosted
  // `/static/AcmeLogo.svg` is not a source-host URL, so it was never counted
  // there either.
  check(
    "28.P2.F9b the image-logo surface is COUNTED and is not the same axis as sourceUrl",
    markupBrandSurfaceTotal({
      sourceUrl: 99,
      bodyAnchorIdentity: 0,
      visibleText: 0,
      imageSrcPath: 3,
      imageAlt: 0,
      ariaLabel: 0,
      svgAriaLabel: 0,
      svgSymbolId: 0,
      svgText: 0,
    }) === 3,
  );
}

// ---------------------------------------------------------------------------
section("generated static server (real HTTP)");
{
  const packageDir = path.join(fixtureRoot, "package");
  const siteDir = path.join(packageDir, "site");
  await mkdir(path.join(siteDir, "nested"), { recursive: true });
  await mkdir(path.join(siteDir, "media"), { recursive: true });
  await mkdir(path.join(siteDir, "_next", "static"), { recursive: true });
  await writeFile(path.join(packageDir, "server.mjs"), renderServerMjs());
  await writeFile(path.join(siteDir, "index.html"), "<html>home</html>");
  await writeFile(path.join(siteDir, "about.html"), "<html>about</html>");
  await writeFile(path.join(siteDir, "nested", "page.html"), "<html>nested</html>");
  await writeFile(path.join(siteDir, "404.html"), "<html>custom-404</html>");
  await writeFile(path.join(siteDir, "index.txt"), "flight-data");
  await writeFile(path.join(siteDir, "robots.txt"), "User-agent: *\nDisallow: /\n");
  await writeFile(path.join(siteDir, "media", "a".repeat(64) + ".png"), "png-bytes");
  await writeFile(path.join(siteDir, "_next", "static", "chunk.css"), ".a{}");

  check("ready line prefix is stable", SERVER_READY_PREFIX.startsWith("wr-production-server"));
  const launched = await launchPackageIsolated(packageDir);
  try {
    check("isolated copy lives outside the repo", !path.resolve(launched.isolatedDir).startsWith(path.resolve(".")));
    check("launch env is minimal (PATH only)", JSON.stringify(launched.launchEnv) === '["PATH"]', JSON.stringify(launched.launchEnv));
    const home = await fetch(launched.baseUrl + "/");
    check("/ serves index.html", home.status === 200 && (await home.text()).includes("home"));
    check("html content-type", (home.headers.get("content-type") ?? "").includes("text/html"));
    const about = await fetch(launched.baseUrl + "/about");
    check("/about maps to about.html", about.status === 200 && (await about.text()).includes("about"));
    const nested = await fetch(launched.baseUrl + "/nested/page");
    check("nested route maps to file", nested.status === 200 && (await nested.text()).includes("nested"));
    const slash = await fetch(launched.baseUrl + "/about/", { redirect: "manual" });
    check("trailing slash 308-redirects", slash.status === 308 && slash.headers.get("location") === "/about");
    const missing = await fetch(launched.baseUrl + "/nope");
    check("unknown path is 404 with 404.html", missing.status === 404 && (await missing.text()).includes("custom-404"));
    const media = await fetch(launched.baseUrl + "/media/" + "a".repeat(64) + ".png");
    check(
      "media served immutable",
      media.status === 200 &&
        media.headers.get("cache-control") === "public, max-age=31536000, immutable" &&
        media.headers.get("content-type") === "image/png",
    );
    const chunk = await fetch(launched.baseUrl + "/_next/static/chunk.css");
    check("_next/static immutable", chunk.headers.get("cache-control")?.includes("immutable") === true);
    const html = await fetch(launched.baseUrl + "/");
    check("html not cached", html.headers.get("cache-control") === "no-cache");
    const flight = await fetch(launched.baseUrl + "/index.txt");
    check("flight .txt served", flight.status === 200 && (await flight.text()) === "flight-data");
    const robots = await fetch(launched.baseUrl + "/robots.txt");
    check("robots.txt served", robots.status === 200);
    const sitemap = await fetch(launched.baseUrl + "/sitemap.xml");
    check("absent sitemap.xml is 404", sitemap.status === 404);
    const traversal = await fetch(launched.baseUrl + "/..%2f..%2fserver.mjs");
    check("path traversal rejected", traversal.status === 404, String(traversal.status));
    const post = await fetch(launched.baseUrl + "/", { method: "POST" });
    check("non-GET is 405", post.status === 405);
    const head = await fetch(launched.baseUrl + "/about", { method: "HEAD" });
    check("HEAD supported", head.status === 200 && (await head.text()) === "");
  } finally {
    await launched.stop();
  }
}

// ---------------------------------------------------------------------------
section("theme probe parsing");
{
  const css =
    ":root{--wr-theme-color-text-secondary:rgb(62, 84, 96);--wr-theme-decoration-radius-small:4px}\n" +
    ".wr-st000001,.wr-st000002{color:var(--wr-theme-color-text-secondary)}\n" +
    ".wr-st000003{color:var(--wr-theme-color-unknown-token)}\n";
  const probes = parseThemeProbes(css);
  check("class probes extracted", probes.some((probe) => probe.className === "wr-st000001"));
  check("comma selectors expanded", probes.some((probe) => probe.className === "wr-st000002"));
  check("probe carries the resolved rgb value", probes[0]?.expectedColor === "rgb(62, 84, 96)");
  check("unresolvable tokens skipped", !probes.some((probe) => probe.className === "wr-st000003"));
}

// ---------------------------------------------------------------------------
section("production-spec-v1 schema");
{
  const lineageDir = { dir: "data/x", hash: "a".repeat(64), fileCount: 1, byteCount: 1, excluded: [] };
  const spec = {
    schemaVersion: 1,
    schemaName: "production-spec-v1",
    runId: "2026-08-19T00-00-00-000Z",
    createdAt: "2026-08-19T00:00:00.000Z",
    sourceHost: "example.com",
    compiler: {
      name: "web-recon-production-compiler",
      version: 1,
      hashMethod: "dir-sha256-v1",
      hashMethodDescription: "x",
    },
    lineage: {
      template: { ...lineageDir, templateId: "t", slotSchemaVersion: 2 },
      contentRun: { ...lineageDir, contentRunId: "c", slotValueCount: 3 },
      theme: {
        ...lineageDir,
        themeRunId: "th",
        themeId: "cool-neutral",
        themeName: "Cool Neutral",
        themeMode: "light",
        adapterVersion: 1,
        adapterSourceFile: "a.json",
      },
      seoPlan: { ...lineageDir, seoPlanRunId: "s", mode: "preview", routeCount: 20, needsInputCount: 182 },
      assets: {
        ...lineageDir,
        materializationRunId: "m",
        inventoryRunDir: "i",
        mediaFileCount: 230,
        rewriteEntryCount: 278,
        replacementManifestEntryCount: 340,
      },
    },
    baseUrl: { value: null, status: "needs-input", mode: "preview", basis: "no domain provided" },
    buildMode: { chosen: "static-export", reason: "r", behaviorDeltas: [] },
    indexabilityGate: { decision: "preview", robotsPolicy: "p", blockers: [{ id: "b", summary: "s", evidence: "e" }] },
    buildRunId: "2026-08-19T00-00-00-000Z",
  };
  check("valid spec parses", productionSpecSchema.safeParse(spec).success);
  const badHash = structuredClone(spec);
  badHash.lineage.template.hash = "not-a-hash";
  check("invalid lineage hash rejected", !productionSpecSchema.safeParse(badHash).success);
  const badName = structuredClone(spec);
  (badName as { schemaName: string }).schemaName = "other";
  check("wrong schemaName rejected", !productionSpecSchema.safeParse(badName).success);
  const missingLayer = structuredClone(spec) as { lineage: Record<string, unknown> };
  delete missingLayer.lineage.seoPlan;
  check("missing lineage layer rejected", !productionSpecSchema.safeParse(missingLayer).success);

  // Task 28 Phase 10 — the mode-rules pair enforced STRUCTURALLY (not only by
  // src/release/freshness.ts `applyBlocking`): an "indexable" spec must carry
  // zero blockers. A build that is indexable WHILE blockers remain is a
  // serious defect per the program contract, never a convenience — this is
  // the schema saying the same thing a hand-crafted counter-example cannot
  // even construct.
  const indexableClean = structuredClone(spec) as Record<string, unknown>;
  indexableClean.indexabilityGate = { decision: "indexable", robotsPolicy: "per-plan production robots", blockers: [] };
  indexableClean.baseUrl = { value: "canary.example", status: "provided", mode: "production", basis: "user-provided" };
  (indexableClean.lineage as Record<string, Record<string, unknown>>).seoPlan.mode = "production";
  check(
    "28.P10.1 indexable + zero blockers parses (the REAL shape runProductionCompile emits once the gate resolves)",
    productionSpecSchema.safeParse(indexableClean).success,
  );
  const indexableWithBlockers = structuredClone(indexableClean) as Record<string, unknown>;
  indexableWithBlockers.indexabilityGate = {
    decision: "indexable",
    robotsPolicy: "per-plan production robots",
    blockers: [{ id: "replacement-required-assets", summary: "84 assets awaiting replacement", evidence: "e" }],
  };
  const rejectedIndexableWithBlockers = productionSpecSchema.safeParse(indexableWithBlockers);
  check(
    "28.P10.2 indexable + non-empty blockers is REFUSED by the schema — a build cannot claim indexable while blockers remain",
    !rejectedIndexableWithBlockers.success &&
      rejectedIndexableWithBlockers.error.issues.some((issue) => issue.path.join(".") === "indexabilityGate.blockers"),
    JSON.stringify(rejectedIndexableWithBlockers.success ? null : rejectedIndexableWithBlockers.error.issues),
  );
  check(
    "28.P10.3 preview + non-empty blockers still parses (the ORIGINAL fixture above) — the refinement is ONE-DIRECTIONAL",
    productionSpecSchema.safeParse(spec).success,
  );
}

// ---------------------------------------------------------------------------
section("preview blocker summaries derive from inputs (GED-B)");
{
  const inputsA = {
    seoPlanRunId: "seo-run-a",
    domainStatus: "needs-input",
    needsInputTotal: 77,
    fallbackTitleRouteCount: 9,
    routeCount: 12,
    materializationRunId: "mat-run-a",
    inventoryRunDir: "data/a/asset-inventories/inv-a",
    replacementRequiredCount: 23,
    replacementManifestEntryCount: 60,
    residualRenderedUrlCount: 5,
    webfontFamilies: ["fontone", "fonttwo"],
    contentRunId: "content-run-a",
    injectedRoutes: ["/", "/about"],
    inlineSvgEntryCount: 42,
  };
  const blockersA = buildPreviewBlockers(inputsA);
  const byId = new Map(blockersA.map((blocker) => [blocker.id, blocker]));
  check("all 7 blocker ids emitted", blockersA.length === 7, String(blockersA.length));
  check(
    "seo summary carries this site's needs-input + title counts",
    byId.get("seo-needs-input-values")?.summary === "77 SEO values are needs-input (9/12 route titles serve the brand-only fallback)",
    byId.get("seo-needs-input-values")?.summary,
  );
  check(
    "replacement summary + evidence carry derived counts",
    byId.get("replacement-required-assets")?.summary.startsWith("23 replacement-required assets") === true &&
      byId.get("replacement-required-assets")?.summary.includes("5 source-host asset URLs") === true &&
      byId.get("replacement-required-assets")?.evidence.includes("(60 entries)") === true &&
      byId.get("replacement-required-assets")?.evidence.endsWith("residual=5") === true,
    byId.get("replacement-required-assets")?.summary,
  );
  check(
    "font families named from the font inventory",
    byId.get("fonts-license-needs-review")?.summary.includes("(fontone / fonttwo licenses unverified)") === true,
    byId.get("fonts-license-needs-review")?.summary,
  );
  check(
    "uninjected-route counts derived from route table + content scope",
    byId.get("uninjected-route-content")?.summary === "10 of 12 routes still carry source body content (content run scope is /, /about)",
    byId.get("uninjected-route-content")?.summary,
  );
  check(
    "inline-svg evidence carries the inventory count",
    byId.get("source-brand-inline-svg")?.evidence.includes("42 inline-svg entries") === true,
    byId.get("source-brand-inline-svg")?.evidence,
  );
  // Task 28 Phase 2: the inventory count counts EVERY inline SVG (icons
  // included). When the brand-carrying host count is measured, it is carried
  // too — and when it is ZERO there is no source-brand asset to resolve, so
  // the blocker must not be emitted at all.
  const blockersHosts = buildPreviewBlockers({ ...inputsA, brandCarryingHostCount: 7 });
  const byIdHosts = new Map(blockersHosts.map((blocker) => [blocker.id, blocker]));
  check(
    "28.P2.B1 the measured brand-carrying host count is carried in summary AND evidence",
    byIdHosts.get("source-brand-inline-svg")?.summary.startsWith("7 inline host(s)") === true &&
      byIdHosts.get("source-brand-inline-svg")?.evidence.includes("7 brand-carrying host(s)") === true,
    byIdHosts.get("source-brand-inline-svg")?.summary,
  );
  check(
    "28.P2.B2 the inventory count is STILL cited beside it (nothing hidden)",
    byIdHosts.get("source-brand-inline-svg")?.evidence.includes("42 inline-svg entries") === true,
    byIdHosts.get("source-brand-inline-svg")?.evidence,
  );
  const blockersNoBrand = buildPreviewBlockers({ ...inputsA, brandCarryingHostCount: 0 });
  check(
    "28.P2.B3 zero brand-carrying hosts drops the blocker (an icon-only template is not a brand gap)",
    blockersNoBrand.every((blocker) => blocker.id !== "source-brand-inline-svg") &&
      blockersNoBrand.length === blockersA.length - 1,
    JSON.stringify(blockersNoBrand.map((blocker) => blocker.id)),
  );
  check(
    "28.P2.B4 an UNSUPPLIED count leaves the pre-Phase-2 behaviour exactly as it was",
    byId.get("source-brand-inline-svg")?.summary ===
      "inline-SVG brand marks (incl. the source logo) remain in template markup — template-layer limitation",
    byId.get("source-brand-inline-svg")?.summary,
  );
  // A second input set must change the prose — proves nothing is hardcoded.
  const blockersB = buildPreviewBlockers({
    ...inputsA,
    needsInputTotal: 403,
    fallbackTitleRouteCount: 39,
    routeCount: 40,
    replacementRequiredCount: 154,
    residualRenderedUrlCount: 33,
    webfontFamilies: ["geist mono", "geistsans", "inter"],
    injectedRoutes: ["/"],
    inlineSvgEntryCount: 78,
  });
  const byIdB = new Map(blockersB.map((blocker) => [blocker.id, blocker]));
  check(
    "different inputs produce different derived prose",
    byIdB.get("seo-needs-input-values")?.summary === "403 SEO values are needs-input (39/40 route titles serve the brand-only fallback)" &&
      byIdB.get("fonts-license-needs-review")?.summary.includes("geist mono / geistsans / inter") === true &&
      byIdB.get("uninjected-route-content")?.summary.startsWith("39 of 40 routes") === true &&
      byIdB.get("source-brand-inline-svg")?.evidence.includes("78 inline-svg entries") === true,
  );
  check(
    "blocker ids stable across inputs",
    JSON.stringify(blockersA.map((blocker) => blocker.id)) === JSON.stringify(blockersB.map((blocker) => blocker.id)),
  );
  // Fully content-injected inputs (Task 26 real-pilot regression): a "0 of N routes"
  // uninjected-route-content entry is not a real gap and must not be emitted.
  const blockersC = buildPreviewBlockers({
    ...inputsA,
    injectedRoutes: Array.from({ length: inputsA.routeCount }, (_, i) => (i === 0 ? "/" : `/r${i}`)),
  });
  check(
    "fully-injected scope drops the uninjected-route-content blocker (6 remain)",
    blockersC.length === 6 && !blockersC.some((blocker) => blocker.id === "uninjected-route-content"),
    String(blockersC.length),
  );
}

// ---------------------------------------------------------------------------
section("interaction sampling: mount-type AND static-target triggers (GED-A)");
{
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const NAME_SHIM = "globalThis.__name = globalThis.__name || function (fn) { return fn; };";
    const variant = (body: string, script: string): string =>
      `<!doctype html><html><body><div class="wr-variant" data-wr-viewport="desktop">${body}</div>` +
      `<script>${script}</script></body></html>`;

    // 1. mount-type trigger: click mounts a wr-dyn region (path unchanged).
    await page.setContent(
      variant(
        `<button data-wr-pattern-id="ip000001" data-wr-node="n1">menu</button>`,
        `document.querySelector("button").addEventListener("click", () => {
           const region = document.createElement("div");
           region.id = "wr-dyn-000001";
           region.textContent = "mounted region";
           document.body.appendChild(region);
         });`,
      ),
    );
    await page.evaluate(NAME_SHIM);
    const mount = await sampleInteractions(page, "desktop", 3);
    check(
      "mount-type trigger still counted via region mount",
      mount.clicked === 1 && mount.regionsAppeared > 0,
      JSON.stringify(mount),
    );

    // 2. native <details> disclosure: static target, no region ever mounts —
    //    the domainchecker false-fail shape; must now pass on the open flip.
    await page.setContent(
      variant(
        `<details><summary data-wr-pattern-id="ip000002" data-wr-node="n2">more</summary><p>disclosure body</p></details>`,
        "",
      ),
    );
    await page.evaluate(NAME_SHIM);
    const details = await sampleInteractions(page, "desktop", 3);
    check(
      "native <details> toggle counts as a state flip (no region mounted)",
      details.clicked === 1 && details.regionsAppeared === 0 && details.stateFlips === 1,
      JSON.stringify(details),
    );

    // 3. aria-checked selection toggle — the nextjs false-fail shape.
    await page.setContent(
      variant(
        `<div role="switch" tabindex="0" aria-checked="false" data-wr-pattern-id="ip000003" data-wr-node="n3">toggle</div>`,
        `document.querySelector("[role=switch]").addEventListener("click", (event) => {
           const el = event.currentTarget;
           el.setAttribute("aria-checked", el.getAttribute("aria-checked") === "true" ? "false" : "true");
         });`,
      ),
    );
    await page.evaluate(NAME_SHIM);
    const selection = await sampleInteractions(page, "desktop", 3);
    check(
      "aria-checked selection toggle counts as a state flip",
      selection.clicked === 1 && selection.regionsAppeared === 0 && selection.stateFlips === 1,
      JSON.stringify(selection),
    );

    // 4. aria-expanded + aria-controls target already in the DOM.
    await page.setContent(
      variant(
        `<button aria-expanded="false" aria-controls="panel" data-wr-pattern-id="ip000004" data-wr-node="n4">open</button>` +
          `<div id="panel" style="display:none">static panel</div>`,
        `document.querySelector("button").addEventListener("click", (event) => {
           const el = event.currentTarget;
           const open = el.getAttribute("aria-expanded") === "true";
           el.setAttribute("aria-expanded", open ? "false" : "true");
           document.getElementById("panel").style.display = open ? "none" : "block";
         });`,
      ),
    );
    await page.evaluate(NAME_SHIM);
    const disclosure = await sampleInteractions(page, "desktop", 3);
    check(
      "aria-expanded + target-visibility change counts as a state flip",
      disclosure.clicked === 1 && disclosure.regionsAppeared === 0 && disclosure.stateFlips === 1,
      JSON.stringify(disclosure),
    );

    // 5. inert trigger: clicking changes NOTHING — must not count as success.
    await page.setContent(
      variant(`<button data-wr-pattern-id="ip000005" data-wr-node="n5">noop</button>`, ""),
    );
    await page.evaluate(NAME_SHIM);
    const inert = await sampleInteractions(page, "desktop", 3);
    check(
      "inert trigger produces neither regions nor state flips",
      inert.clicked === 1 && inert.regionsAppeared === 0 && inert.stateFlips === 0,
      JSON.stringify(inert),
    );
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
section("cross-route per-file residual requests (GED-G)");
{
  // A per-HOST tally cannot tell an operator which file to replace, nor that
  // the file only renders on a route other than "/".
  const census: Array<{ route: string; externalUrls: Record<string, number> }> = [
    {
      route: "/",
      externalUrls: { "https://cdn.example/shared.png": 1 },
    },
    {
      route: "/newsroom/news/tour",
      externalUrls: {
        "https://cdn.example/shared.png": 2,
        "https://cdn.example/newsroom-only.png": 1,
      },
    },
  ];
  const files = summarizeResidualRequests(census);
  check("one row per FILE, not per host", files.length === 2, String(files.length));
  check(
    "most-rendered file first, attributed to every route it was requested on",
    files[0].url === "https://cdn.example/shared.png" &&
      files[0].occurrences === 3 &&
      files[0].routeCount === 2 &&
      files[0].routes.map((hit) => `${hit.route}:${hit.occurrences}`).join(",") ===
        "/:1,/newsroom/news/tour:2",
    JSON.stringify(files[0]),
  );
  const deepOnly = files.find((file) => file.url.endsWith("newsroom-only.png"));
  check(
    `a file that renders only off "/" is still reported, with its route`,
    deepOnly?.routeCount === 1 &&
      deepOnly.routes[0].route === "/newsroom/news/tour" &&
      deepOnly.host === "cdn.example",
    JSON.stringify(deepOnly),
  );
  check(
    "an empty census summarizes to no files (no invention)",
    summarizeResidualRequests([{ route: "/", externalUrls: {} }]).length === 0,
  );
}

// ---------------------------------------------------------------------------
section("Task 27 — served-html brand surface census (measurement, not a gate)");
{
  // One document carrying every surface once, so a miscount cannot hide behind
  // a total. The <svg> aria-label must NOT also land on the plain aria-label
  // axis — that double count is exactly what makes a brand number untrustworthy.
  const html =
    "<html><head><title>Newco</title></head><body>" +
    '<a href="https://linear.app/pricing">Pricing</a>' +
    '<a href="/local">Local</a>' +
    '<img src="https://linear.app/hero.png" alt="Linear screenshot"/>' +
    '<button aria-label="Open Linear menu">m</button>' +
    '<svg aria-label="Linear Logo"><symbol id="LinearAi"><path d="M0 0h1v1H0z"/></symbol>' +
    "<text>Linear</text></svg>" +
    "<p>Built on Linear conventions.</p>" +
    "</body></html>";
  const counts = censusServedHtml(html, "linear.app", ["linear"]);
  check(
    "source-url counts href AND src on the source host",
    counts.sourceUrl === 2,
    JSON.stringify(counts),
  );
  check("body anchors are counted on their own axis", counts.bodyAnchorIdentity === 1, String(counts.bodyAnchorIdentity));
  check("img alt is counted", counts.imageAlt === 1, String(counts.imageAlt));
  check(
    "an SVG aria-label is NOT also counted as a plain aria-label",
    counts.svgAriaLabel === 1 && counts.ariaLabel === 1,
    JSON.stringify({ svg: counts.svgAriaLabel, plain: counts.ariaLabel }),
  );
  check("svg <symbol id> is counted, camel humps included", counts.svgSymbolId === 1, String(counts.svgSymbolId));
  check("svg text is counted", counts.svgText === 1, String(counts.svgText));
  check(
    "visible text ignores markup and counts the brand word",
    counts.visibleText > 0,
    String(counts.visibleText),
  );
  const clean = censusServedHtml("<html><body><p>Newco ships fast.</p></body></html>", "linear.app", ["linear"]);
  check(
    "an independent document censuses to zero on every surface (no invention)",
    Object.values(clean).every((value) => value === 0),
    JSON.stringify(clean),
  );
  const census = summarizeBrandCensus(["linear"], [
    { route: "/", ...counts },
    { route: "/pricing", ...clean },
  ]);
  check(
    "the census folds per-route counts and records how many routes it measured",
    census.routesMeasured === 2 && census.sourceUrl === counts.sourceUrl && census.byRoute.length === 2,
    JSON.stringify({ routes: census.routesMeasured, sourceUrl: census.sourceUrl }),
  );
}

// ---------------------------------------------------------------------------
section("Task 27 — no BLANKET source-host assertion was introduced");
{
  // The audit's settled decision: release-blocking ONLY where production
  // independence actually requires it. A zero-equality check over the
  // source-host mention count (or any census total) would fail every honest preview
  // build over uninjected body copy the `content-route` blocker already
  // carries. This test is the guard rail, enforced over the real source tree.
  const roots = ["src", "scripts"];
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  for (const root of roots) await walk(root);
  // Built from parts so this guard does not match its own source text.
  const blanket = new RegExp(
    "(sourceHostMentionsInHtml|visibleText|sourceUrl|bodyAnchorIdentity)" + "\\s*===\\s*" + "0",
  );
  const offenders = [] as string[];
  for (const file of files) {
    const body = await readFile(file, "utf8");
    if (blanket.test(body)) offenders.push(file);
  }
  check(
    "no blanket zero-equality assertion over a source-host / brand census total exists in src/ or scripts/",
    offenders.length === 0,
    offenders.join(", "),
  );
  check(
    "the honest number is still REPORTED — sourceHostMentionsInHtml survives in the qa report",
    (await readFile("src/production/qa.ts", "utf8")).includes("sourceHostMentionsInHtml,"),
  );
}

// ---------------------------------------------------------------------------
await rm(fixtureRoot, { recursive: true, force: true });
console.log(`\nsmoke:production — ${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
