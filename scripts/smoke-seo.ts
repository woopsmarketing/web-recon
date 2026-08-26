import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import {
  auditAnchors,
  buildProductionSeoPlan,
  checkBrandIsolation,
  checkForbiddenCopy,
  classifySitemap,
  createProductionSeoPlanRun,
  deriveForbiddenTerms,
  findHeadSourceAssetReferences,
  findSeoSurfaceBrandLeaks,
  generateRobotsTxt,
  generateSitemapXml,
  loadContentRunForSeo,
  loadProductionSeoPlanRun,
  loadSourceSeoSnapshot,
  loadTemplateForSeo,
  observeSourceSeo,
  parseRenderedDocumentSeo,
  parseRobotsTxt,
  renderPlanHead,
  rewriteHtmlHead,
  startSeoProxy,
} from "../src/seo/index.js";

/**
 * Task 21 smoke — Source SEO Observation & Production SEO Foundation.
 *
 * Fixture-based, through the REAL public APIs (no artifact injection):
 * a synthetic observation run (rendered.html + links.json + verification)
 * flows through the real Source SEO Observer; a synthetic template + content
 * run flows through the real Production SEO Plan run creator; the real SEO
 * head proxy fronts a local upstream and is verified with fetch + Chromium.
 *
 * Sections:
 *   1  head parsing (presence, absence, unparseable JSON-LD)
 *   2  source snapshot (duplicates, canonical clusters, orphans, broken
 *      links, indexability, robots not-fetched, determinism)
 *   3  robots.txt parsing / sitemap classification helpers
 *   4  production plan — preview mode (needs-input, fact safety, checks)
 *   5  production plan — domain-provided mode
 *   6  forbidden-copy + brand isolation (negative cases)
 *   7  serve boundary (title + flight rewrite, head injection, robots/
 *      sitemap answers, passthrough) + Chromium document.title
 *   8  internal link audit classification
 */

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

const fixtureRoot = path.resolve("data", `.smoke-seo-${process.pid}`);

const HOST = "smoke.test";
const ROOT_URL = `http://${HOST}/`;

function page1Html(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<title>Root Original Title</title>
<meta name="description" content="Root original description."/>
<link rel="canonical" href="http://smoke.test/"/>
<link rel="alternate" hreflang="en" href="http://smoke.test/"/>
<link rel="alternate" hreflang="fr" href="http://smoke.test/fr"/>
<meta property="og:title" content="Root OG Title"/>
<meta property="og:image" content="http://cdn.smoke.test/img.png"/>
<meta property="og:site_name" content="SmokeCorp"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:site" content="@smokecorp"/>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"SmokeCorp Site"},{"@type":"Organization","name":"SmokeCorp","url":"http://smoke.test","sameAs":["https://social.example/smokecorp"]}]}</script>
</head><body>
<h1>Root heading</h1><h2>Sub <span>heading</span></h2>
<img src="/a.png" alt="described image"/><img src="/b.png" alt=""/><img src="/c.png"/>
<a href="/a">a</a><a href="/missing">gone</a><a href="/unknown">unknown</a>
</body></html>`;
}

function page2Html(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<title>Duplicate Title</title>
<meta name="description" content="Shared description."/>
<link rel="canonical" href="http://smoke.test/a"/>
</head><body><h1>A</h1><a href="/">home</a></body></html>`;
}

function page3Html(): string {
  return `<!DOCTYPE html><html lang="en"><head>
<title>Duplicate Title</title>
<meta name="description" content="Shared description."/>
<link rel="canonical" href="http://smoke.test/a"/>
<meta name="robots" content="noindex, follow"/>
</head><body><p>no headings, no links</p></body></html>`;
}

async function writeObservationFixture(dir: string): Promise<string> {
  const pages = [
    { pageId: "p000001", url: ROOT_URL, html: page1Html(), links: [
      { elementId: "e1", href: "/a", resolvedUrl: `http://${HOST}/a`, internal: true },
      { elementId: "e2", href: "/missing", resolvedUrl: `http://${HOST}/missing`, internal: true },
      { elementId: "e3", href: "/unknown", resolvedUrl: `http://${HOST}/unknown`, internal: true },
      { elementId: "e4", href: "https://elsewhere.example/", resolvedUrl: "https://elsewhere.example/", internal: false },
    ] },
    { pageId: "p000002", url: `http://${HOST}/a`, html: page2Html(), links: [
      { elementId: "e1", href: "/", resolvedUrl: ROOT_URL, internal: true },
    ] },
    { pageId: "p000003", url: `http://${HOST}/b`, html: page3Html(), links: [] },
  ];
  await mkdir(dir, { recursive: true });
  for (const page of pages) {
    const viewportDir = path.join(dir, "pages", page.pageId, "viewports", "desktop");
    await mkdir(viewportDir, { recursive: true });
    await writeFile(path.join(viewportDir, "rendered.html"), page.html, "utf8");
    await writeFile(path.join(viewportDir, "links.json"), JSON.stringify(page.links), "utf8");
  }
  const manifestFile = path.join(dir, "site-observation.json");
  await writeFile(
    manifestFile,
    JSON.stringify({
      rootUrl: ROOT_URL,
      pages: pages.map((page) => ({
        pageId: page.pageId,
        url: page.url,
        finalUrl: page.url,
        status: "success",
        pageObservationFile: `pages/${page.pageId}/observation.json`,
      })),
    }),
    "utf8",
  );
  const verificationFile = path.join(dir, "verification.json");
  await writeFile(
    verificationFile,
    JSON.stringify({
      candidates: [
        { candidateUrl: ROOT_URL, finalUrl: ROOT_URL, httpStatus: 200, status: "valid-html" },
        { candidateUrl: `http://${HOST}/a`, finalUrl: `http://${HOST}/a`, httpStatus: 200, status: "valid-html" },
        { candidateUrl: `http://${HOST}/b`, finalUrl: `http://${HOST}/b`, httpStatus: 200, status: "valid-html" },
        { candidateUrl: `http://${HOST}/missing`, finalUrl: `http://${HOST}/missing`, httpStatus: 404, status: "http-error" },
      ],
    }),
    "utf8",
  );
  return manifestFile;
}

async function writeTemplateFixture(dir: string): Promise<string> {
  const appData = path.join(dir, "app", "reconstruction-data");
  await mkdir(appData, { recursive: true });
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({ templateId: `${HOST}-fixture`, source: { host: HOST } }),
    "utf8",
  );
  await writeFile(
    path.join(appData, "route-map.json"),
    JSON.stringify({
      routes: [
        { routeId: "r000001", key: "/", path: "/", title: "Root Original Title" },
        { routeId: "r000002", key: "/a", path: "/a", title: "Duplicate Title" },
      ],
    }),
    "utf8",
  );
  return path.join(dir, "manifest.json");
}

async function writeContentRunFixture(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ runId: "fixture-content-run", scopedRoutes: ["/"] }), "utf8");
  await writeFile(
    path.join(dir, "generation-result.json"),
    JSON.stringify({
      sitePlan: {
        siteIdentity: {
          workingName: "새브랜드",
          category: "테스트 카테고리",
          audience: "테스트 고객",
          positioning: "테스트 포지셔닝 문장입니다",
        },
        pagePlans: [{ route: "/", primaryMessage: "메인 메시지" }],
      },
    }),
    "utf8",
  );
  await writeFile(path.join(dir, "slot-values.json"), JSON.stringify({}), "utf8");
  await writeFile(
    path.join(dir, "intent.json"),
    JSON.stringify({ providedFacts: [], rawIntent: "한국어 인텐트", preferences: {} }),
    "utf8",
  );
}

async function startFixtureUpstream(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url.split("?")[0] === "/style.css") {
      response.writeHead(200, { "content-type": "text/css" });
      response.end("body{color:red}");
      return;
    }
    const isA = url.split("?")[0] === "/a";
    const title = isA ? "Duplicate Title" : "Root Original Title";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      `<!DOCTYPE html><html><head><title>${title}</title></head><body><div id="c">hello</div>` +
        `<script>self.__next_f=[];self.__next_f.push([1,"t:\\"${title}\\""]);document.title="${title}";</script>` +
        `</body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function main(): Promise<void> {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  try {
    // ---- 1 head parsing --------------------------------------------------
    section("1 head parsing from rendered.html");
    const full = parseRenderedDocumentSeo(page1Html());
    check("1 title extracted", full.title === "Root Original Title", JSON.stringify(full.title));
    check("1 description extracted", full.metaDescription === "Root original description.");
    check("1 canonical extracted", full.canonicalHref === "http://smoke.test/");
    check("1 robots meta absent stays null", full.metaRobots === null);
    check("1 hreflang entries", full.hreflang.length === 2 && full.hreflang[1].lang === "fr", JSON.stringify(full.hreflang));
    check("1 og entries with keys", full.openGraph.length === 3 && full.openGraph[0].key === "og:title", JSON.stringify(full.openGraph.map((e) => e.key)));
    check("1 twitter entries", full.twitter.length === 2, JSON.stringify(full.twitter.map((e) => e.key)));
    check(
      "1 JSON-LD parsed with @graph types",
      full.jsonLd.length === 1 && full.jsonLd[0].parseable && full.jsonLd[0].types.join(",") === "WebSite,Organization",
      JSON.stringify(full.jsonLd[0]?.types),
    );
    check(
      "1 heading outline in document order with joined text",
      full.headingOutline.length === 2 && full.headingOutline[0].level === 1 && full.headingOutline[1].text === "Sub heading",
      JSON.stringify(full.headingOutline),
    );
    check(
      "1 image alt audit: with/empty/missing",
      full.imageAltAudit.images === 3 && full.imageAltAudit.withAlt === 1 && full.imageAltAudit.emptyAlt === 1 && full.imageAltAudit.missingAlt === 1,
      JSON.stringify(full.imageAltAudit),
    );
    check("1 html lang", full.htmlLang === "en");
    const empty = parseRenderedDocumentSeo("<!DOCTYPE html><html><head></head><body><p>x</p></body></html>");
    check(
      "1 absent metadata stays null/[] (never defaulted)",
      empty.title === null && empty.metaDescription === null && empty.canonicalHref === null && empty.openGraph.length === 0 && empty.jsonLd.length === 0,
    );
    const badLd = parseRenderedDocumentSeo(
      `<html><head><script type="application/ld+json">{not json}</script></head><body></body></html>`,
    );
    check("1 unparseable JSON-LD recorded, not repaired", badLd.jsonLd.length === 1 && !badLd.jsonLd[0].parseable);

    // ---- 2 source snapshot ----------------------------------------------
    section("2 source SEO snapshot (real observer over the fixture run)");
    const observationDir = path.join(fixtureRoot, "observation");
    const manifestFile = await writeObservationFixture(observationDir);
    const runA = await observeSourceSeo({
      siteObservationFile: manifestFile,
      verificationFile: path.join(observationDir, "verification.json"),
      outputDir: path.join(fixtureRoot, "snapshot-a"),
      runId: "2026-08-18T00-00-00-000Z",
    });
    const snapshot = runA.snapshot;
    check("2 three pages observed", snapshot.pages.length === 3);
    check("2 httpStatus joined from verification", snapshot.pages.every((p) => p.httpStatus === 200));
    check(
      "2 duplicate titles grouped",
      snapshot.site.duplicateTitles.length === 1 && snapshot.site.duplicateTitles[0].pageIds.join(",") === "p000002,p000003",
      JSON.stringify(snapshot.site.duplicateTitles),
    );
    check("2 duplicate descriptions grouped", snapshot.site.duplicateDescriptions.length === 1);
    const cluster = snapshot.site.canonicalClusters.find((c) => c.canonical === "http://smoke.test/a");
    check(
      "2 canonical cluster with self + elsewhere member",
      cluster !== undefined && cluster.pageIds.length === 2 && cluster.containsSelfReference,
      JSON.stringify(snapshot.site.canonicalClusters),
    );
    check(
      "2 orphan candidate (observed subgraph, root excluded)",
      snapshot.site.orphanCandidatesWithinObservedSubgraph.map((o) => o.pageId).join(",") === "p000003",
      JSON.stringify(snapshot.site.orphanCandidatesWithinObservedSubgraph),
    );
    check("2 link graph edges deduplicated", snapshot.site.linkGraph.edges === 2, JSON.stringify(snapshot.site.linkGraph));
    check(
      "2 broken internal link via verified 404",
      snapshot.site.brokenInternalLinks.length === 1 && snapshot.site.brokenInternalLinks[0].httpStatus === 404,
      JSON.stringify(snapshot.site.brokenInternalLinks),
    );
    check(
      "2 unverified target is unobserved, not broken",
      snapshot.site.unverifiedInternalLinkTargets.targets === 1,
      JSON.stringify(snapshot.site.unverifiedInternalLinkTargets),
    );
    const verdictOf = (id: string) => snapshot.site.indexability.find((i) => i.pageId === id)?.verdict;
    check("2 indexability: robots noindex wins", verdictOf("p000003") === "robots-noindex", JSON.stringify(snapshot.site.indexability));
    check("2 indexability: no observed blocker", verdictOf("p000001") === "no-observed-blocker");
    check("2 indexability: canonical points elsewhere", verdictOf("p000002") === "no-observed-blocker");
    check(
      "2 missing metadata recorded per kind (h1 on p000003)",
      snapshot.site.missingMetadata.some((m) => m.kind === "h1" && m.pageIds.includes("p000003")),
      JSON.stringify(snapshot.site.missingMetadata),
    );
    check("2 robots.txt not-fetched without the flag", snapshot.site.robotsTxt.status === "not-fetched" && snapshot.site.sitemaps.length === 0);
    const runB = await observeSourceSeo({
      siteObservationFile: manifestFile,
      verificationFile: path.join(observationDir, "verification.json"),
      outputDir: path.join(fixtureRoot, "snapshot-b"),
      runId: "2026-08-18T00-00-00-000Z",
    });
    const bytesA = await readFile(runA.snapshotFile, "utf8");
    const bytesB = await readFile(runB.snapshotFile, "utf8");
    check("2 deterministic: same inputs → byte-identical snapshot", bytesA === bytesB);
    const reloaded = await loadSourceSeoSnapshot(runA.outputDir);
    check("2 snapshot round-trips through the zod schema", reloaded.pages.length === 3);

    // ---- 3 robots/sitemap helpers ----------------------------------------
    section("3 robots.txt / sitemap helpers");
    const robotsParsed = parseRobotsTxt("User-agent: *\nDisallow: /admin\nDisallow: /tmp # x\nSitemap: https://x.example/s.xml\n");
    check("3 robots.txt parse (disallow + sitemap)", robotsParsed.disallowRules === 2 && robotsParsed.sitemapUrls.length === 1, JSON.stringify(robotsParsed));
    const index = classifySitemap('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x/1.xml</loc></sitemap></sitemapindex>');
    const urlset = classifySitemap('<urlset><url><loc>https://x/a</loc></url><url><loc>https://x/b</loc></url></urlset>');
    check("3 sitemap classification", index.kind === "sitemap-index" && index.urlCount === 1 && urlset.kind === "urlset" && urlset.urlCount === 2);

    // ---- 4 production plan — preview -------------------------------------
    section("4 production SEO plan — preview mode (no domain, real run creator)");
    const templateManifest = await writeTemplateFixture(path.join(fixtureRoot, "template"));
    await writeContentRunFixture(path.join(fixtureRoot, "content-run"));
    const planRunResult = await createProductionSeoPlanRun({
      templateManifestRef: templateManifest,
      contentRunDir: path.join(fixtureRoot, "content-run"),
      sourceSnapshotRef: runA.outputDir,
      outputDir: path.join(fixtureRoot, "plan-preview"),
      runId: "2026-08-18T00-00-01-000Z",
    });
    const plan = planRunResult.plan;
    check("4 preview mode without a domain", plan.domainState.mode === "preview" && plan.domainState.productionDomain.status === "needs-input");
    const home = plan.routes.find((r) => r.route === "/");
    const other = plan.routes.find((r) => r.route === "/a");
    check(
      "4 injected route title known, derived from content run",
      home?.title.status === "known" && home.title.value === "새브랜드 | 테스트 카테고리",
      JSON.stringify(home?.title),
    );
    check(
      "4 uninjected route title needs-input with brand-only fallback",
      other?.title.status === "needs-input" && other.title.value === null && other.title.previewFallback === "새브랜드",
      JSON.stringify(other?.title),
    );
    check("4 uninjected description needs-input with NO fallback", other?.description.status === "needs-input" && (other.description.previewFallback ?? null) === null);
    check("4 preview robots noindex,nofollow on every route", plan.routes.every((r) => r.robotsMeta.value === "noindex,nofollow"));
    check("4 canonical never finalized in preview", plan.routes.every((r) => !r.canonical.finalized && r.canonical.value === null));
    check(
      "4 og:url / og:image / twitter:site needs-input (never invented)",
      plan.routes.every((r) => r.openGraph.url.status === "needs-input" && r.openGraph.image.status === "needs-input" && r.twitter.site.status === "needs-input"),
    );
    const facts = plan.site.businessFacts;
    check(
      "4 fact safety: all 7 business facts needs-input with null values",
      Object.values(facts).length === 7 && Object.values(facts).every((f) => f.status === "needs-input" && f.value === null),
      JSON.stringify(facts),
    );
    const planJsonText = JSON.stringify(plan).replaceAll("https://schema.org", "");
    check(
      "4 no invented absolute production URL anywhere in the plan",
      !planJsonText.includes("https://") && plan.routes.every((r) => r.canonical.value === null && r.openGraph.url.value === null),
    );
    check(
      "4 JSON-LD emitted with only known identity; url/sameAs omitted as needs-input",
      home !== undefined && home.jsonLd.emitted && home.jsonLd.omittedNeedsInput.some((o) => o.startsWith("url")) && home.jsonLd.omittedNeedsInput.some((o) => o.startsWith("sameAs")) && !JSON.stringify(home.jsonLd.json).includes("http://smoke.test"),
      JSON.stringify(home?.jsonLd.omittedNeedsInput),
    );
    check("4 forbidden-copy check ran and passed", planRunResult.manifest.checks.forbiddenCopy.pass && planRunResult.manifest.checks.forbiddenCopy.comparisons > 0);
    check("4 brand isolation check ran and passed", planRunResult.manifest.checks.brandIsolation.pass && planRunResult.manifest.checks.brandIsolation.forbiddenTerms.includes("SmokeCorp"));
    const robotsPreview = await readFile(path.join(planRunResult.outputDir, "robots.txt"), "utf8");
    check("4 preview robots.txt disallows all, names no Sitemap", /^Disallow: \/$/m.test(robotsPreview) && !/^Sitemap:/m.test(robotsPreview));
    const sitemapPreview = await readFile(path.join(planRunResult.outputDir, "sitemap.preview.xml"), "utf8");
    check(
      "4 preview sitemap is path-only (no absolute <loc>, marked non-final)",
      !sitemapPreview.includes("<loc>http") && sitemapPreview.includes("<loc>/a</loc>") && sitemapPreview.includes("PREVIEW"),
      sitemapPreview.slice(0, 120),
    );
    const needsInputReport = JSON.parse(await readFile(path.join(planRunResult.outputDir, "report", "needs-input.json"), "utf8")) as { total: number };
    check("4 consolidated needs-input report written", needsInputReport.total === planRunResult.manifest.counts.needsInputValues && needsInputReport.total > 0, String(needsInputReport.total));
    const loadedPlanRun = await loadProductionSeoPlanRun(planRunResult.outputDir);
    check("4 plan run round-trips (manifest + plan + rendered head)", loadedPlanRun.plan.routes.length === 2 && loadedPlanRun.sitemapXml === null && loadedPlanRun.renderedHead.routes.length === 2);
    const snapshotHreflangTotal = snapshot.pages.reduce((sum, p) => sum + p.hreflangCount, 0);
    const hreflangDecision = plan.decisions.find((d) => d.id === "no-hreflang");
    check(
      "4 no-hreflang decision derived from THIS snapshot's evidence (no hardcoded source facts)",
      hreflangDecision !== undefined &&
        hreflangDecision.decision.includes(
          `source served ${snapshotHreflangTotal} hreflang alternates across ${snapshot.pages.length} observed pages`,
        ),
      hreflangDecision?.decision,
    );

    // ---- 5 production plan — domain provided ------------------------------
    section("5 production SEO plan — domain-provided mode");
    const template = await loadTemplateForSeo(templateManifest);
    const contentRun = await loadContentRunForSeo(path.join(fixtureRoot, "content-run"));
    const prodPlan = buildProductionSeoPlan({
      runId: "2026-08-18T00-00-02-000Z",
      template,
      contentRun,
      sourceSnapshot: snapshot,
      productionDomain: "newbrand-prod.example",
    });
    check("5 production mode with known domain", prodPlan.domainState.mode === "production" && prodPlan.domainState.productionDomain.value === "newbrand-prod.example");
    check("5 robots meta index,follow", prodPlan.routes.every((r) => r.robotsMeta.value === "index,follow"));
    check(
      "5 canonical finalized self on the production domain",
      prodPlan.routes.every((r) => r.canonical.finalized) && prodPlan.routes.find((r) => r.route === "/a")?.canonical.value === "https://newbrand-prod.example/a",
    );
    check("5 og:url known on the production domain", prodPlan.routes.every((r) => r.openGraph.url.status === "known"));
    const robotsProd = generateRobotsTxt(prodPlan);
    check("5 production robots.txt allows and names the sitemap", /^Allow: \/$/m.test(robotsProd) && robotsProd.includes("Sitemap: https://newbrand-prod.example/sitemap.xml"));
    const sitemapProd = generateSitemapXml(prodPlan);
    check("5 production sitemap absolute on the domain", sitemapProd.filename === "sitemap.xml" && sitemapProd.xml.includes("<loc>https://newbrand-prod.example/a</loc>"));

    // ---- 6 forbidden copy + brand isolation negatives ---------------------
    section("6 forbidden-copy + brand isolation gates");
    const poisonedCopy = structuredClone(plan);
    poisonedCopy.routes[0].title = { value: "Root Original Title", status: "known", basis: "poison" };
    const copyResult = checkForbiddenCopy(poisonedCopy, snapshot);
    check("6 copying a source title is detected and fails", !copyResult.pass && copyResult.violations.length === 1, JSON.stringify(copyResult.violations));
    const terms = deriveForbiddenTerms(snapshot);
    check(
      "6 forbidden terms derived from source evidence (host, org, sameAs, og:site_name)",
      terms.includes("smoke.test") && terms.includes("SmokeCorp") && terms.includes("https://social.example/smokecorp"),
      JSON.stringify(terms),
    );
    const leak = checkBrandIsolation(terms, [{ location: "test", content: { a: "visit https://smoke.test/x now", b: "clean Korean 문장" } }]);
    check("6 source host URL in a production string is a violation", !leak.pass && leak.violations.some((v) => v.term === "smoke.test"), JSON.stringify(leak.violations));
    const nameLeak = checkBrandIsolation(terms, [{ location: "test", content: "Powered by SmokeCorp platform" }]);
    check("6 source org name on a word boundary is a violation", !nameLeak.pass);
    const clean = checkBrandIsolation(terms, [{ location: "test", content: "새브랜드 | 테스트 카테고리 — smokescreen unrelated" }]);
    check("6 unrelated substring does not false-positive on the name term", clean.pass, JSON.stringify(clean.violations));

    // ---- 7 serve boundary + browser --------------------------------------
    section("7 serve boundary — head rewrite, robots/sitemap, Chromium title");
    const upstreamTitles = new Map(template.routes.map((r) => [r.key, r.title ?? null]));
    const renderedHead = renderPlanHead(plan, upstreamTitles);
    const rewritten = rewriteHtmlHead(
      `<html><head><title>Root Original Title</title></head><body><script>t:"Root Original Title"</script></body></html>`,
      renderedHead.routes.find((r) => r.route === "/") as { upstreamTitle: string | null; title: string; headHtml: string },
    );
    check("7 <title> element rewritten", rewritten.includes("<title>새브랜드 | 테스트 카테고리</title>"));
    check("7 flight-payload occurrence rewritten (no upstream title anywhere)", !rewritten.includes("Root Original Title"));
    check("7 head block injected before </head>", rewritten.indexOf("wr-seo-head-start") !== -1 && rewritten.indexOf("wr-seo-head-start") < rewritten.indexOf("</head>"));
    const upstream = await startFixtureUpstream();
    const proxy = await startSeoProxy(upstream.baseUrl, {
      renderedHead,
      robotsTxt: robotsPreview,
      sitemapXml: null,
    });
    try {
      const homeResponse = await fetch(`${proxy.baseUrl}/`);
      const homeHtml = await homeResponse.text();
      check("7 proxied HTML carries the plan title and noindex", homeHtml.includes("<title>새브랜드 | 테스트 카테고리</title>") && homeHtml.includes('content="noindex,nofollow"'));
      check("7 proxied HTML retains no upstream title byte (incl. inline script)", !homeHtml.includes("Root Original Title"));
      const robotsResponse = await fetch(`${proxy.baseUrl}/robots.txt`);
      check("7 /robots.txt served by the boundary", robotsResponse.status === 200 && (await robotsResponse.text()).includes("Disallow: /"));
      const sitemapResponse = await fetch(`${proxy.baseUrl}/sitemap.xml`);
      check("7 /sitemap.xml is 404 in preview", sitemapResponse.status === 404);
      const cssResponse = await fetch(`${proxy.baseUrl}/style.css`);
      check("7 non-HTML passthrough is byte-identical", (await cssResponse.text()) === "body{color:red}");
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(`${proxy.baseUrl}/`, { waitUntil: "load", timeout: 30_000 });
        await page.waitForTimeout(300);
        const browserTitle = (await page.evaluate("document.title")) as string;
        check("7 Chromium document.title is the production title (post-script)", browserTitle === "새브랜드 | 테스트 카테고리", browserTitle);
      } finally {
        await browser.close();
      }
    } finally {
      await proxy.stop();
      await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
    }

    // ---- 8 internal link audit -------------------------------------------
    section("8 internal link audit classification");
    const audit = auditAnchors(
      `<html><body>
        <a href="/a">ok</a><a href="/a/">ok trailing</a><a href="/nope">broken</a>
        <a href="https://smoke.test/x">source</a><a href="https://www.smoke.test/y">source www</a>
        <a href="https://elsewhere.example/">ext</a>
        <a href="#frag">f</a><a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="javascript:void(0)">j</a>
      </body></html>`,
      new Set(["/", "/a"]),
      HOST,
    );
    check("8 route-resolving anchors (incl. trailing slash)", audit.routeResolves === 2, JSON.stringify(audit));
    check("8 broken internal anchors", audit.brokenInternal.length === 1 && audit.brokenInternal[0].href === "/nope");
    check("8 source-host absolute anchors (incl. www)", audit.sourceHostAbsolute === 2);
    check("8 external anchors", audit.external === 1);
    check("8 non-navigational anchors", audit.nonNavigational === 4);

    // ---- 9 seo-qa head scope: SEO-controlled surfaces vs app-emitted refs --
    section("9 seo-qa head brand scope (SEO surfaces fail; app asset refs measured)");
    const qaTerms = ["smoke.test", "smokecorp"];
    const cleanSurfaces = {
      documentTitle: "새브랜드 | 테스트 카테고리",
      headTitle: "새브랜드 | 테스트 카테고리",
      metaContents: ["width=device-width, initial-scale=1", "noindex,nofollow", "새브랜드 설명"],
      canonicalHrefs: [],
      jsonLdRaw: ['{"@graph":[{"@type":"WebSite","name":"새브랜드"}]}'],
    };
    check(
      "9 clean SEO surfaces produce no leak",
      findSeoSurfaceBrandLeaks(cleanSurfaces, qaTerms).length === 0,
    );
    check(
      "9 source term in a meta content IS an SEO-surface leak",
      findSeoSurfaceBrandLeaks(
        { ...cleanSurfaces, metaContents: [...cleanSurfaces.metaContents, "https://smoke.test/og.png"] },
        qaTerms,
      ).join(",") === "smoke.test",
    );
    check(
      "9 source org name in JSON-LD IS an SEO-surface leak",
      findSeoSurfaceBrandLeaks(
        { ...cleanSurfaces, jsonLdRaw: ['{"@graph":[{"@type":"Organization","name":"SmokeCorp"}]}'] },
        qaTerms,
      ).join(",") === "smokecorp",
    );
    // The regression the first real pilot (Task 26) exposed: a body <link rel="preload">
    // hoisted into the head by React carries a source-CDN href. That is the
    // asset layer's territory — it must NOT fail the SEO-surface scan, and it
    // MUST be measured by findHeadSourceAssetReferences.
    const hoistedHead =
      '<meta charset="utf-8"/><link rel="preload" as="image" href="https://cdn.smoke.test/img/hero.png?w=2"/>' +
      '<link rel="preload" as="image" href="https://cdn.smoke.test/img/hero.png?w=2"/>' +
      '<link rel="stylesheet" href="/wr/generated-styles.css"/><script src="/_next/static/x.js"></script>' +
      "<title>새브랜드 | 테스트 카테고리</title>";
    check(
      "9 app-emitted preload href does NOT fail the SEO-surface scan",
      findSeoSurfaceBrandLeaks(cleanSurfaces, qaTerms).length === 0 &&
        !JSON.stringify(cleanSurfaces).includes("cdn.smoke.test"),
    );
    const measuredRefs = findHeadSourceAssetReferences(hoistedHead, qaTerms);
    check(
      "9 app-emitted source asset refs measured and deduplicated",
      measuredRefs.length === 1 && measuredRefs[0] === "https://cdn.smoke.test/img/hero.png?w=2",
      JSON.stringify(measuredRefs),
    );
    check(
      "9 brand-free head yields zero measured asset refs",
      findHeadSourceAssetReferences(
        '<link rel="stylesheet" href="/wr/generated-styles.css"/><script src="/_next/static/x.js"></script>',
        qaTerms,
      ).length === 0,
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
  console.error("[smoke:seo] ERROR —", err);
  process.exitCode = 1;
});
