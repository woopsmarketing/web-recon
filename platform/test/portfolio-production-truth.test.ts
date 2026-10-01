/**
 * Portfolio production truth — the record truth split of 2026-09-29.
 *
 * The 11 records bi-09 … bi-19 are VERIFIED_SYNTHETIC V0.2 test fixtures
 * (docs/work/portfolio-experience-v1/04-record-truth-audit.md; docs/result/interior-portfolio-v0.2/
 * 04-demo-data-spec.md §2/§5). They left the customer-facing demo (data/sites/boost-interior-demo now
 * holds bi-01 … bi-08) and live, verbatim, in the TEST_ONLY fixture platform/test/fixtures/
 * boost-interior-synthetic, composed back into a QA corpus by portfolio-qa-corpus.ts. This file proves:
 *
 *   [fixture]    the fixture is where it must be, says what it is, and no runtime / production path
 *                names it;
 *   [production] (i) the production projects.json, site data and producer output contain NONE of the
 *                fixture's ids, slugs or titles (the forbidden set is READ from the fixture, never
 *                hard-coded), and every production record's exported media is its own;
 *   [qa]         (ii) the QA composition holds all 11 fixture records, validates, and reproduces the
 *                pre-split projects.json, snapshot (once exactly the later footer deltas — the
 *                product rename, then the notice — are reverted) and Portfolio Document (856361f5…)
 *                byte for byte — the split lost nothing and the producer did not change;
 *                (iii) each of the 8 production records is emitted deep-equal to its own record in the
 *                pre-split document — the removal changed nothing about the survivors;
 *   [build]      a real production build (throwaway root; data/sites and data/site-builds untouched):
 *                (i) its detail routes, sitemap, listing and every shipped text file carry none of the
 *                fixture's ids / slugs / titles; (iv) every portfolio link in its HTML (home, listing,
 *                details, the other pages) and every sitemap entry resolves to one of the 8 production
 *                detail pages — no dead public reference.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/portfolio-production-truth.test.ts
 */
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite, prepareSiteInput } from "../build/site-build";
import { GOLDEN_DIR, GOLDEN_INPUT } from "../cli/integration-golden";
import { createContentReader } from "../content/reader";
import { emitIntegration, type IntegrationEmission, type PortfolioDocument } from "../integration/emit";
import { validateIntegration } from "../integration/validate";
import type { SiteSnapshot } from "../site/instance";
import { planRoutes } from "../site/routes";
import { hashJson, sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import {
  DEMO_SITE_ID,
  PRE_SPLIT_PROJECTS_BYTES,
  PRE_SPLIT_PROJECTS_SHA256,
  PRE_SPLIT_SNAPSHOT_HASH,
  QA_GOLDEN_DIR,
  QA_GOLDEN_DOC_BYTES,
  QA_GOLDEN_DOC_SHA256,
  QA_GOLDEN_MANIFEST_SHA256,
  QA_GOLDEN_VERSION,
  SYNTHETIC_FIXTURE_DIR,
  SYNTHETIC_PROJECTS_FILE,
  SYNTHETIC_STATUS,
  DEMO_FOOTER_NOTICE,
  DEMO_FOOTER_PRODUCT_NAME,
  composeQaProjectsText,
  composeQaSnapshot,
  readSyntheticFixture,
  revertFooterNotice,
  revertFooterProductName,
} from "./portfolio-qa-corpus";

const repoRoot = process.cwd();
const DEMO = DEMO_SITE_ID;
const AT = GOLDEN_INPUT.at;
/** the production corpus after the split (04-record-truth-audit.md) */
const PROD_IDS = ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08"];
/** the production golden (platform/test/golden/portfolio-v1.1-media) — the same literals integration.test.ts pins */
const PROD_VERSION = "968afbccb944940d8d3c099dd54df5be";
const PROD_DOC_SHA256 = "a3450a7d0cb48d8e5248c392aea6c6dc8a2ca39f448834bc252625bde218363c";
const PROD_MANIFEST_SHA256 = "ef3dff6f711b5a0a31f399d2b1a89b6cf23aa50b438e3445f678af27df7b4adb";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const exists = (p: string) => stat(p).then(() => true, () => false);
const SKIP_DIRS = new Set([".DS_Store", "node_modules", ".next", "out", ".git"]);
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}
const TEXT = /\.(html|txt|js|mjs|cjs|ts|tsx|css|json|jsonl|xml|md|svg|map)$/;
/** every leaf path at which two JSON values differ (objects and arrays walked key by key) */
function deltaPaths(a: unknown, b: unknown, at = "$"): string[] {
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap((k) => deltaPaths(a[k], b[k], `${at}[${JSON.stringify(k)}]`));
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [at];
}

function emitFor(snapshot: SiteSnapshot): IntegrationEmission {
  const planned = planRoutes(template.routes, createContentReader(snapshot.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
  return emitIntegration({ snapshot, declaredRoutes: template.routes, plannedRoutes: planned });
}
function validateFor(e: IntegrationEmission, snapshot: SiteSnapshot) {
  const planned = planRoutes(template.routes, createContentReader(snapshot.content)).routes;
  return validateIntegration(e, { siteId: snapshot.siteId, publicOrigin: snapshot.site.identity.publicOrigin, pagePaths: new Set(planned.flatMap((r) => r.paths)) });
}

// ------------------------------------------------------------------ inputs --
const fixture = await readSyntheticFixture(repoRoot);
/**
 * The forbidden set, READ from the fixture: every id, slug and title of a synthetic record. An id is
 * matched as a whole token (bi-1 is not bi-10), a slug and a title as a substring.
 */
const idRe = new RegExp(`(?<![A-Za-z0-9_-])(${fixture.ids.map((id) => id.replace(/[-]/g, "\\-")).join("|")})(?![A-Za-z0-9_-])`);
function forbiddenIn(text: string): string[] {
  const hits: string[] = [];
  const id = idRe.exec(text)?.[1];
  if (id) hits.push(`id ${id}`);
  for (const s of fixture.slugs) if (text.includes(s)) hits.push(`slug ${s}`);
  for (const t of fixture.titles) if (text.includes(t)) hits.push(`title ${t}`);
  return hits;
}
const demo = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at: AT });
const prodEmission = emitFor(demo.snapshot);
const qaSnapshot = composeQaSnapshot(demo.snapshot, fixture, AT);
const qaEmission = emitFor(qaSnapshot);

// ------------------------------------------------------------------ fixture --
console.log("\n[fixture] TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING, test-only, never loaded by a runtime path");
await check("X1 the synthetic fixture lives under platform/test/fixtures (never under data/sites), labels itself TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING in the file and its README, and holds the 11 records bi-09 … bi-19, each valid content", async () => {
  assert(SYNTHETIC_FIXTURE_DIR.startsWith("platform/test/fixtures/") && !SYNTHETIC_PROJECTS_FILE.startsWith("data/"), `fixture path ${SYNTHETIC_PROJECTS_FILE}`);
  const doc = JSON.parse(await readFile(path.join(repoRoot, SYNTHETIC_PROJECTS_FILE), "utf8"));
  eq([doc.status, doc.removedFromProduction], [SYNTHETIC_STATUS, "2026-09-29"], "fixture labels");
  const readme = await readFile(path.join(repoRoot, SYNTHETIC_FIXTURE_DIR, "README.md"), "utf8");
  for (const s of ["TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING", "04-demo-data-spec.md", "04-record-truth-audit.md", "2026-09-29"]) assert(readme.includes(s), `README must state ${s}`);
  eq(fixture.ids, ["bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-14", "bi-15", "bi-16", "bi-17", "bi-18", "bi-19"], "fixture records");
  eq(new Set([...fixture.slugs, ...fixture.titles]).size, fixture.slugs.length + fixture.titles.length, "unique slugs and titles");
  // the fixture owns no asset: each record's cover is another record's gallery photo (spec §5) — kept
  // on purpose, so the media-ownership rule keeps being exercised
  for (const p of fixture.items) {
    eq(p.galleryGroups, undefined, `${p.id}: no gallery`);
    const owner = demo.snapshot.content.projects.find((q) => (q.galleryGroups ?? []).some((g) => g.items.some((i) => i.image.asset === p.cover.asset)));
    assert(owner && owner.id !== p.id, `${p.id}: cover ${p.cover.asset} is a production record's gallery photo`);
  }
  // nothing fixture-shaped under data/sites
  for (const f of await walkFiles(path.join(repoRoot, "data/sites"))) assert(!/synthetic|qa-golden/i.test(f), `data/sites/${f}: a fixture file under data/sites`);
});
await check("X2 no runtime or production path names the fixture or the QA composition: platform/ (tests aside), templates/, workers/, scripts/, data/sites/, data/template-releases/ and package.json never mention boost-interior-synthetic / projects.synthetic / portfolio-qa-corpus", async () => {
  const needles = ["boost-interior-synthetic", "projects.synthetic", "portfolio-qa-corpus"];
  const roots = ["platform", "templates", "workers", "scripts", "data/sites", "data/template-releases"];
  let scanned = 0;
  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    if (!(await exists(abs))) continue;
    for (const f of await walkFiles(abs)) {
      const rel = `${root}/${f}`;
      if (rel.startsWith("platform/test/") || !TEXT.test(f)) continue;
      const text = await readFile(path.join(abs, f), "utf8");
      scanned++;
      for (const n of needles) assert(!text.includes(n), `${rel} names ${n}`);
    }
  }
  const pkg = await readFile(path.join(repoRoot, "package.json"), "utf8");
  for (const n of needles) assert(!pkg.includes(n), `package.json names ${n}`);
  assert(scanned > 100, `scanned only ${scanned} files`);
});

// --------------------------------------------------------------- production --
console.log("\n[production] the published demo: bi-01 … bi-08, nothing synthetic");
await check("P1 production data: content/projects.json keeps its file-level schema / origin and holds exactly bi-01 … bi-08; no file of data/sites/boost-interior-demo names a synthetic id, slug or title (the forbidden set read from the fixture)", async () => {
  const siteDir = path.join(repoRoot, "data/sites", DEMO);
  const doc = JSON.parse(await readFile(path.join(siteDir, "content/projects.json"), "utf8"));
  eq([doc.schema, doc.origin], ["projects@1", "synthetic-fixture"], "file-level schema / origin (the demo's documents stay declared fictional)");
  eq((doc.items as { id: string }[]).map((p) => p.id), PROD_IDS, "production records");
  for (const f of await walkFiles(siteDir)) {
    if (!TEXT.test(f)) continue;
    eq(forbiddenIn(await readFile(path.join(siteDir, f), "utf8")), [], `data/sites/${DEMO}/${f}`);
  }
  eq(demo.snapshot.content.projects.map((p) => p.id), PROD_IDS, "served records");
});
await check(`P2 (i) the production producer output is the production golden (${PROD_VERSION}), validates, and contains none of the fixture's ids / slugs / titles; every production record's exported media is its own (cover and every gallery image in its own galleryGroups)`, async () => {
  eq([prodEmission.portfolio!.version, prodEmission.portfolio!.file.sha256, prodEmission.manifestFile.sha256], [PROD_VERSION, PROD_DOC_SHA256, PROD_MANIFEST_SHA256], "the production golden's bytes");
  for (const f of prodEmission.files) eq(sha256(await readFile(path.join(repoRoot, GOLDEN_DIR, path.basename(f.path)))), f.sha256, `${GOLDEN_DIR}/${path.basename(f.path)} = the emission`);
  eq(validateFor(prodEmission, demo.snapshot), { errors: [], warnings: [] }, "validates");
  const d = prodEmission.portfolio!.document;
  eq(d.records.map((r) => r.id), PROD_IDS, "records");
  for (const f of prodEmission.files) eq(forbiddenIn(f.text), [], `${f.path}`);
  // the detector is not vacuous: on the QA emission it finds a fixture id and every fixture slug and title
  const qaHits = forbiddenIn(qaEmission.portfolio!.file.text);
  assert(qaHits.some((h) => h.startsWith("id ")) && fixture.slugs.every((s) => qaHits.includes(`slug ${s}`)) && fixture.titles.every((t) => qaHits.includes(`title ${t}`)), `the forbidden-set detector must fire on the QA emission: ${qaHits.join(", ")}`);
  const assetOf = new Map(demo.snapshot.assets.map((a) => [a.publicPath, a.id]));
  for (const r of d.records) {
    const p = demo.snapshot.content.projects.find((x) => x.id === r.id)!;
    const own = new Set((p.galleryGroups ?? []).flatMap((g) => g.items.flatMap((i) => [i.image.asset, ...(i.before ? [i.before.asset] : [])])));
    const ownAfter = new Set((p.galleryGroups ?? []).flatMap((g) => g.items.map((i) => i.image.asset)));
    assert(r.media?.cover && r.media.gallery && r.media.gallery.length > 0, `${r.id}: carries its cover and gallery`);
    const cover = assetOf.get(r.media.cover.src);
    assert(cover === p.cover.asset && own.has(cover), `${r.id}: cover ${cover} is its authored cover and in its own galleryGroups`);
    for (const g of r.media.gallery) assert(ownAfter.has(assetOf.get(g.src) ?? ""), `${r.id}: gallery image ${g.src} is one of its own after images`);
  }
});

// ----------------------------------------------------------------------- qa --
console.log("\n[qa] the QA composition = the pre-split corpus, byte for byte");
await check(`Q1 (ii) the QA composition holds all 11 fixture records and reproduces the pre-split projects.json (${PRE_SPLIT_PROJECTS_BYTES} B, sha256 ${PRE_SPLIT_PROJECTS_SHA256.slice(0, 12)}…) and, with exactly the later footer deltas (the product rename, then the notice) reverted, the pre-split snapshot (siteSnapshotHash ${PRE_SPLIT_SNAPSHOT_HASH.slice(0, 12)}…)`, async () => {
  const text = await composeQaProjectsText(repoRoot);
  const bytes = new TextEncoder().encode(text);
  eq([bytes.length, sha256(bytes)], [PRE_SPLIT_PROJECTS_BYTES, PRE_SPLIT_PROJECTS_SHA256], "composed projects.json = the pre-split file");
  eq((JSON.parse(text).items as { id: string }[]).map((p) => p.id), [...PROD_IDS, ...fixture.ids], "production + fixture, original order");
  eq(qaSnapshot.content.projects.map((p) => p.id), [...PROD_IDS, ...fixture.ids], "the QA snapshot serves all 19");
  // the footer notice changed twice after the split, both times in the same one field: the notice
  // itself (DEMO_FOOTER_NOTICE), then the product name in it (DEMO_FOOTER_PRODUCT_NAME, 2026-10-01).
  // Revert exactly each, newest first.
  const NOTICE_PATH = '$["slots"]["values"]["site.footer"]["notice"]';
  const noticeOf = (s: SiteSnapshot) => (s.slots!.values["site.footer"] as { notice?: string }).notice;
  const preRename = revertFooterProductName(qaSnapshot);
  eq(deltaPaths(qaSnapshot, preRename), [NOTICE_PATH], "the product-rename delta is exactly one field");
  eq([noticeOf(qaSnapshot), noticeOf(preRename)], [DEMO_FOOTER_PRODUCT_NAME[1], DEMO_FOOTER_PRODUCT_NAME[0]], "footer notice now / before the product rename");
  eq(DEMO_FOOTER_PRODUCT_NAME[0].split("BoostChat").join("BoostInterior"), DEMO_FOOTER_PRODUCT_NAME[1], "the rename is the one word BoostChat → BoostInterior, nothing else in the sentence");
  eq(DEMO_FOOTER_PRODUCT_NAME[0].split("BoostChat").length, 2, "…which the notice named exactly once");
  const preFooter = revertFooterNotice(preRename);
  eq(deltaPaths(preRename, preFooter), [NOTICE_PATH], "the footer-notice delta is exactly one field");
  eq(deltaPaths(qaSnapshot, preFooter), [NOTICE_PATH], "…and the two together are still exactly that one field");
  eq([noticeOf(preRename), noticeOf(preFooter)], [DEMO_FOOTER_NOTICE[1], DEMO_FOOTER_NOTICE[0]], "footer notice before the product rename / before the notice change");
  assert(hashJson(qaSnapshot) !== PRE_SPLIT_SNAPSHOT_HASH, "the footer notice is a real delta (a silent revert of it would fail here)");
  assert(hashJson(preRename) !== PRE_SPLIT_SNAPSHOT_HASH && hashJson(preRename) !== hashJson(qaSnapshot), "…and so is the product rename on top of it");
  eq(hashJson(preFooter), PRE_SPLIT_SNAPSHOT_HASH, "the QA snapshot with the product rename and the footer notice reverted = the pre-split snapshot (the producer-4 package 71f7e5f3…'s recorded siteSnapshotHash)");
});
await check(`Q2 (ii) the QA composition validates and its emission IS the pre-split document ${QA_GOLDEN_VERSION} byte for byte (the QA golden, ${QA_GOLDEN_DOC_BYTES} B) — the split lost nothing and the producer did not change`, async () => {
  eq(validateFor(qaEmission, qaSnapshot), { errors: [], warnings: [] }, "validates");
  const doc = await readFile(path.join(repoRoot, QA_GOLDEN_DIR, `portfolio.${QA_GOLDEN_VERSION}.json`));
  const manifest = await readFile(path.join(repoRoot, QA_GOLDEN_DIR, "manifest.json"));
  eq([doc.length, sha256(doc), sha256(manifest)], [QA_GOLDEN_DOC_BYTES, QA_GOLDEN_DOC_SHA256, QA_GOLDEN_MANIFEST_SHA256], "the QA golden files at their literals");
  eq([qaEmission.portfolio!.version, qaEmission.portfolio!.file.bytes.length, qaEmission.portfolio!.file.sha256, qaEmission.manifestFile.sha256], [QA_GOLDEN_VERSION, QA_GOLDEN_DOC_BYTES, QA_GOLDEN_DOC_SHA256, QA_GOLDEN_MANIFEST_SHA256], "the QA emission = the QA golden");
  eq((await readdir(path.join(repoRoot, QA_GOLDEN_DIR))).filter((f) => f !== ".DS_Store").sort(), ["manifest.json", `portfolio.${QA_GOLDEN_VERSION}.json`], "qa-golden files");
  assert(!(await exists(path.join(repoRoot, GOLDEN_DIR, `portfolio.${QA_GOLDEN_VERSION}.json`))), "the 19-record document is no longer in the production golden directory");
});
await check("Q3 (iii) each of the 8 production records is emitted deep-equal to its own record in the pre-split document; the pre-split document's other records are exactly the fixture's", async () => {
  const pre = JSON.parse(await readFile(path.join(repoRoot, QA_GOLDEN_DIR, `portfolio.${QA_GOLDEN_VERSION}.json`), "utf8")) as PortfolioDocument;
  const prod = prodEmission.portfolio!.document;
  for (const r of prod.records) {
    const before = pre.records.find((x) => x.id === r.id);
    assert(before, `${r.id} is in the pre-split document`);
    eq(r, before, `${r.id}: unchanged by the removal`);
  }
  eq(pre.records.filter((r) => !PROD_IDS.includes(r.id)).map((r) => r.id), fixture.ids, "the removed records = the fixture");
  eq([prod.schemaVersion, prod.resource, prod.listingUrl], [pre.schemaVersion, pre.resource, pre.listingUrl], "same document schema / resource / listingUrl");
});

// -------------------------------------------------------------------- build --
console.log("\n[build] a real production build of the demo (throwaway root; data/sites + data/site-builds untouched)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "production-truth-root-"));
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  await cp(path.join(repoRoot, "data/sites", DEMO), path.join(tmpRoot, "data/sites", DEMO), { recursive: true });
  let site = "";
  let files: string[] = [];
  const ORIGIN = demo.snapshot.site.identity.publicOrigin!;
  const prodSlugs = demo.snapshot.content.projects.map((p) => p.slug);
  const detailPaths = new Set(prodSlugs.map((s) => `/portfolio/${s}`));

  await check("B0 the production demo builds: status built, package QA pass; its _integration/ is the production golden, byte for byte", async () => {
    const r = await buildSite({ repoRoot: tmpRoot, siteId: DEMO, at: AT });
    assert(r.status === "built" && r.record.qa.pass, `built: ${r.status}`);
    site = path.join(r.packageDir, "site");
    files = await walkFiles(site);
    eq((await readdir(path.join(site, "_integration"))).sort(), ["manifest.json", `portfolio.${PROD_VERSION}.json`], "_integration files");
    for (const f of prodEmission.files) eq(sha256(await readFile(path.join(site, f.path))), f.sha256, f.path);
  });
  await check("B1 (i) the detail routes are exactly the 8 production records' (none of the fixture's); the sitemap, the listing page and every shipped text file of the package carry none of the fixture's ids / slugs / titles", async () => {
    assert(site, "B0 build missing");
    eq(files.filter((f) => /^portfolio\/[^/]+\.html$/.test(f)), prodSlugs.map((s) => `portfolio/${s}.html`).sort(), "detail pages = the production records");
    for (const s of fixture.slugs) assert(!files.some((f) => f.includes(s)), `a package file is named after the synthetic slug ${s}`);
    for (const f of ["sitemap.xml", "portfolio.html", "index.html"]) assert(files.includes(f), `${f} missing`);
    let scanned = 0;
    for (const f of files) {
      if (!TEXT.test(f)) continue;
      eq(forbiddenIn(await readFile(path.join(site, f), "utf8")), [], f);
      scanned++;
    }
    assert(scanned > 20, `scanned only ${scanned} text files`);
  });
  await check("B2 (iv) no dead public reference: every portfolio link in every HTML page (home, listing, details, the other pages) and every sitemap entry resolves to the listing or to one of the 8 production detail pages; the listing and the sitemap reach all 8", async () => {
    assert(site, "B0 build missing");
    const toPath = (href: string): string | undefined => {
      const u = new URL(href, ORIGIN);
      return u.origin === ORIGIN ? u.pathname.replace(/\/$/, "") || "/" : undefined;
    };
    const isPortfolio = (p: string | undefined) => p !== undefined && (p === "/portfolio" || p.startsWith("/portfolio/"));
    const htmlFiles = files.filter((f) => f.endsWith(".html"));
    assert(htmlFiles.length >= 8 + 5, `html pages: ${htmlFiles.length}`);
    let links = 0;
    for (const f of htmlFiles) {
      const html = await readFile(path.join(site, f), "utf8");
      for (const m of html.matchAll(/\bhref="([^"]+)"/g)) {
        const p = toPath(m[1]!.replace(/&amp;/g, "&").split(/[?#]/)[0]!);
        if (!isPortfolio(p)) continue;
        links++;
        assert(p === "/portfolio" || detailPaths.has(p!), `${f}: dead portfolio link ${m[1]}`);
        assert(files.includes(`${p!.slice(1)}.html`), `${f}: ${p} has no page in the package`);
      }
    }
    assert(links > 0, "no portfolio link found at all");
    const listing = await readFile(path.join(site, "portfolio.html"), "utf8");
    const listed = new Set([...listing.matchAll(/\bhref="(\/portfolio\/[^"?#]+)"/g)].map((m) => m[1]!));
    eq([...listed].sort(), [...detailPaths].sort(), "the listing links exactly the 8 production detail pages");
    const sitemap = await readFile(path.join(site, "sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => toPath(m[1]!));
    assert(locs.every((p) => p !== undefined), "every sitemap entry is on the site origin");
    const portfolioLocs = locs.filter(isPortfolio) as string[];
    for (const p of portfolioLocs) assert(p === "/portfolio" || detailPaths.has(p), `sitemap: dead portfolio entry ${p}`);
    eq(portfolioLocs.filter((p) => p !== "/portfolio").sort(), [...detailPaths].sort(), "the sitemap lists exactly the 8 production detail pages");
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nportfolio-production-truth: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
