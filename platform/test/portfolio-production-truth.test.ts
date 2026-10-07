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
 *                pre-split projects.json, snapshot (once exactly the later deltas — the 1.6.3
 *                inquiry delivery and the 1.6.2 online inquiry, each with its re-pin, the product
 *                rename, then the footer notice — are reverted, newest first) and Portfolio Document
 *                (856361f5…) byte for byte — the split lost nothing and the producer did not change;
 *                (iii) each of the 8 production records is emitted deep-equal to its own record in the
 *                pre-split document — the removal changed nothing about the survivors;
 *   [build]      a real production build (throwaway root; data/sites and data/site-builds untouched):
 *                (i) its detail routes, sitemap, listing and every shipped text file carry none of the
 *                fixture's ids / slugs / titles; (iv) every portfolio link in its HTML (home, listing,
 *                details, the other pages) and every sitemap entry resolves to one of the 8 production
 *                detail pages — no dead public reference.
 *
 * Since Portfolio Content System V1 the demo's portfolio is regenerated from BoostChat by
 * site:portfolio-sync, so data/sites/boost-interior-demo legitimately changes. Every LITERAL above
 * (bi-01 … bi-08, 968afbcc…, the pre-split hashes, "the 8") is therefore asserted against the dataset
 * frozen on 2026-10-06 (demo-frozen-dataset.ts: the live site directory with the frozen portfolio in
 * place of the current one — today that composition IS the live directory, byte for byte), and
 *
 *   [live]       data/sites/boost-interior-demo as it is now is checked for what holds for ANY dataset:
 *                it is the frozen dataset or a consistent generated one (sidecar hashes), nothing
 *                synthetic leaks into its files or its producer output, every record's exported media
 *                is its own, and — whenever it is not the frozen dataset — a real build of it has no
 *                synthetic leak and no dead portfolio link / sitemap entry.
 *                The demo is ADOPTED (tracked marker portfolio.source.json): in a checkout that holds
 *                no generated portfolio the live directory is NOT a dataset — its committed content
 *                files may be older than what is live — so there the [live] block asserts exactly
 *                that instead: the guard reports it, the loader and a real build of a copy refuse
 *                it, and its committed files are still the frozen dataset with nothing synthetic.
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
import { SOURCE_MARKER_FILE, SOURCE_MARKER_TEXT, managedPortfolioProblems, readManagedManifest } from "../portfolio-sync/managed";
import type { SiteSnapshot } from "../site/instance";
import { planRoutes } from "../site/routes";
import { hashJson, sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { NOT_GENERATED, frozenDemoRoot } from "./demo-frozen-dataset";
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
  DEMO_INQUIRY_DELIVERY_SLOTS,
  DEMO_ONLINE_INQUIRY_ENDPOINT,
  DEMO_ONLINE_INQUIRY_SLOTS,
  DEMO_PIN_161,
  DEMO_PIN_162,
  atPin,
  revertInquiryDelivery,
  revertOnlineInquiry,
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
async function rejects(fn: () => unknown | Promise<unknown>, re: RegExp, msg: string) {
  let message: string | undefined;
  await Promise.resolve().then(fn).then(() => undefined, (e: Error) => (message = e.message));
  assert(message !== undefined && re.test(message), `${msg}: ${message === undefined ? "did not throw" : `wrong error "${message}"`}`);
}
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
/** the literal pins: the frozen dataset inside the live site (see the header) */
const frozen = await frozenDemoRoot(repoRoot);
const demo = await prepareSiteInput({ repoRoot: frozen.root, siteId: DEMO, mode: "public", at: AT });
/** the live directory as it is now; a generated dataset may hold records published after the golden instant */
const LIVE_AT = frozen.live.identical ? AT : new Date().toISOString();
/** undefined = adopted and not generated in this checkout: there is no live dataset to load (see [live]) */
const live = frozen.live.dataset ? await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at: LIVE_AT }) : undefined;
const liveEmission = live ? emitFor(live.snapshot) : undefined;
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
  const siteDir = frozen.siteDir;
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
await check(`Q1 (ii) the QA composition holds all 11 fixture records and reproduces the pre-split projects.json (${PRE_SPLIT_PROJECTS_BYTES} B, sha256 ${PRE_SPLIT_PROJECTS_SHA256.slice(0, 12)}…) and, with exactly the later deltas reverted newest first (the 1.6.3 inquiry delivery and its re-pin, the 1.6.2 online inquiry + terminology and its re-pin, the product rename, then the footer notice), the pre-split snapshot (siteSnapshotHash ${PRE_SPLIT_SNAPSHOT_HASH.slice(0, 12)}…)`, async () => {
  const text = await composeQaProjectsText(repoRoot, path.join(frozen.siteDir, "content/projects.json"));
  const bytes = new TextEncoder().encode(text);
  eq([bytes.length, sha256(bytes)], [PRE_SPLIT_PROJECTS_BYTES, PRE_SPLIT_PROJECTS_SHA256], "composed projects.json = the pre-split file");
  eq((JSON.parse(text).items as { id: string }[]).map((p) => p.id), [...PROD_IDS, ...fixture.ids], "production + fixture, original order");
  eq(qaSnapshot.content.projects.map((p) => p.id), [...PROD_IDS, ...fixture.ids], "the QA snapshot serves all 19");
  // Four deltas after the split, reverted newest first:
  //  (9) 2026-10-03, the 1.6.3 re-pin: the inquiry-delivery texts (five contact.page leaves,
  //      DEMO_INQUIRY_DELIVERY_SLOTS), plus the pin itself (→ DEMO_PIN_162);
  //  (8) 2026-10-02, the 1.6.2 re-pin: the online inquiry (inquiry.json + contact.page copy) and the
  //      "시공사례" terminology (DEMO_ONLINE_INQUIRY_*), plus the pin itself (→ DEMO_PIN_161);
  //  (7) 2026-10-01: the product name in the footer notice (DEMO_FOOTER_PRODUCT_NAME);
  //  (6) 2026-09-29: the footer notice itself (DEMO_FOOTER_NOTICE).
  const NOTICE_PATH = '$["slots"]["values"]["site.footer"]["notice"]';
  const PIN_PATHS = ["releaseHash", "releaseId", "templateVersion"].map((k) => `$["site"]["template"]["${k}"]`);
  const noticeOf = (s: SiteSnapshot) => (s.slots!.values["site.footer"] as { notice?: string }).notice;
  const leafPathsOf = (leaves: typeof DEMO_ONLINE_INQUIRY_SLOTS) => leaves.flatMap(([section, leafPath, before, now]) => deltaPaths(now, before, `$["slots"]["values"][${JSON.stringify(section)}]${leafPath.map((k) => `[${JSON.stringify(k)}]`).join("")}`));
  const preDeliveryData = revertInquiryDelivery(qaSnapshot);
  eq(
    DEMO_INQUIRY_DELIVERY_SLOTS.map(([section, leafPath, before]) => [section, leafPath.join("."), before === undefined]),
    ["invalidText", "conflictText", "rateLimitedText", "capacityText", "fallbackLead"].map((k) => ["contact.page", k, true]),
    "declared slot leaves of the inquiry-delivery delta: five contact.page texts, each absent before",
  );
  eq(deltaPaths(qaSnapshot, preDeliveryData).sort(), leafPathsOf(DEMO_INQUIRY_DELIVERY_SLOTS).sort(), "the inquiry-delivery delta is exactly its five declared slot leaves");
  eq(leafPathsOf(DEMO_INQUIRY_DELIVERY_SLOTS).length, 5, "…five paths, one per leaf");
  eq(preDeliveryData.inquiry, qaSnapshot.inquiry, "…the inquiry document is not part of it (the endpoint did not move)");
  const onlineLeafKeys = new Set(DEMO_ONLINE_INQUIRY_SLOTS.map(([section, leafPath]) => `${section}.${leafPath.join(".")}`));
  for (const [section, leafPath] of DEMO_INQUIRY_DELIVERY_SLOTS) assert(!onlineLeafKeys.has(`${section}.${leafPath.join(".")}`), `${section}.${leafPath.join(".")}: also a leaf of the online-inquiry delta — the two deltas must not overlap`);
  eq((DEMO_INQUIRY_DELIVERY_SLOTS.find(([, leafPath]) => leafPath.join(".") === "rateLimitedText")![3] as string).split("{minutes}").length, 2, "rateLimitedText names the pause once, as {minutes}");
  const at162 = atPin(preDeliveryData, DEMO_PIN_162);
  eq(deltaPaths(preDeliveryData, at162), PIN_PATHS, "the 1.6.3 re-pin is exactly the pin's three fields");
  assert(hashJson(preDeliveryData) !== hashJson(qaSnapshot) && hashJson(at162) !== hashJson(preDeliveryData), "the inquiry delivery and its re-pin are real deltas (a silent revert of either would fail here)");
  const preInquiryData = revertOnlineInquiry(at162);
  const declaredLeaves = leafPathsOf(DEMO_ONLINE_INQUIRY_SLOTS);
  eq(DEMO_ONLINE_INQUIRY_SLOTS.length, 27, "declared slot leaves of the online-inquiry delta");
  eq(deltaPaths(at162, preInquiryData).sort(), ['$["inquiry"]', ...declaredLeaves].sort(), "the online-inquiry delta is exactly the inquiry document + its declared slot leaves");
  eq(preInquiryData.inquiry, undefined, "…the inquiry document is gone");
  eq(qaSnapshot.inquiry, { schemaVersion: 1, endpoint: DEMO_ONLINE_INQUIRY_ENDPOINT }, "the demo declares exactly that endpoint");
  const [noticeBefore162, noticeNow] = DEMO_ONLINE_INQUIRY_SLOTS.find(([section, leafPath]) => section === "site.footer" && leafPath.join(".") === "notice")!.slice(2) as [string, string];
  eq([noticeOf(qaSnapshot), noticeOf(preInquiryData)], [noticeNow, noticeBefore162], "footer notice now / before the terminology change");
  eq(noticeBefore162.split("포트폴리오").join("시공사례"), noticeNow, "in the notice the change is the one word 포트폴리오 → 시공사례, nothing else in the sentence");
  eq(noticeBefore162.split("포트폴리오").length, 2, "…which the notice used exactly once");
  for (const [section, leafPath, , now] of DEMO_ONLINE_INQUIRY_SLOTS) assert(!/포트폴리오|시공 사례|연결되어 있지 않습니다|메일 앱/.test(JSON.stringify(now ?? "")), `${section}.${leafPath.join(".")}: the delta's new value still carries retired wording`);
  assert(!/포트폴리오|시공 사례|연결되어 있지 않습니다|메일 앱/.test(JSON.stringify(qaSnapshot.slots)), "no slot value of the site carries the retired wording any more");
  const at161 = atPin(preInquiryData, DEMO_PIN_161);
  eq(deltaPaths(preInquiryData, at161), PIN_PATHS, "the 1.6.2 re-pin is exactly the pin's three fields");
  assert(hashJson(preInquiryData) !== hashJson(qaSnapshot) && hashJson(preInquiryData) !== hashJson(at162) && hashJson(at161) !== hashJson(preInquiryData), "the online inquiry and its re-pin are real deltas (a silent revert of either would fail here)");
  const preRename = revertFooterProductName(at161);
  eq(deltaPaths(at161, preRename), [NOTICE_PATH], "the product-rename delta is exactly one field");
  eq([noticeOf(at161), noticeOf(preRename)], [DEMO_FOOTER_PRODUCT_NAME[1], DEMO_FOOTER_PRODUCT_NAME[0]], "footer notice before the terminology change / before the product rename");
  eq(DEMO_FOOTER_PRODUCT_NAME[0].split("BoostChat").join("BoostInterior"), DEMO_FOOTER_PRODUCT_NAME[1], "the rename is the one word BoostChat → BoostInterior, nothing else in the sentence");
  eq(DEMO_FOOTER_PRODUCT_NAME[0].split("BoostChat").length, 2, "…which the notice named exactly once");
  const preFooter = revertFooterNotice(preRename);
  eq(deltaPaths(preRename, preFooter), [NOTICE_PATH], "the footer-notice delta is exactly one field");
  eq(deltaPaths(at161, preFooter), [NOTICE_PATH], "…and the two together are still exactly that one field");
  eq([noticeOf(preRename), noticeOf(preFooter)], [DEMO_FOOTER_NOTICE[1], DEMO_FOOTER_NOTICE[0]], "footer notice before the product rename / before the notice change");
  assert(hashJson(qaSnapshot) !== PRE_SPLIT_SNAPSHOT_HASH && hashJson(at162) !== PRE_SPLIT_SNAPSHOT_HASH && hashJson(at161) !== PRE_SPLIT_SNAPSHOT_HASH, "the footer notice is a real delta (a silent revert of it would fail here)");
  assert(hashJson(preRename) !== PRE_SPLIT_SNAPSHOT_HASH && hashJson(preRename) !== hashJson(at161), "…and so is the product rename on top of it");
  eq(hashJson(preFooter), PRE_SPLIT_SNAPSHOT_HASH, "the QA snapshot with the inquiry delivery, the online inquiry, their two re-pins, the product rename and the footer notice reverted = the pre-split snapshot (the producer-4 package 71f7e5f3…'s recorded siteSnapshotHash)");
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
interface BuildTarget {
  /** check-name prefix: B = the frozen dataset (the literal pins), LB = the live directory when it differs */
  tag: string;
  what: string;
  siteDir: string;
  input: typeof demo;
  emission: IntegrationEmission;
  /** the Portfolio Document version the package must carry */
  version: string;
  /** how many records (= detail pages) the dataset serves */
  records: number;
  at: string;
}
async function realBuild(t: BuildTarget) {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "production-truth-root-"));
  try {
    await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
    await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
    await cp(t.siteDir, path.join(tmpRoot, "data/sites", DEMO), { recursive: true });
    let site = "";
    let files: string[] = [];
    const ORIGIN = t.input.snapshot.site.identity.publicOrigin!;
    const prodSlugs = t.input.snapshot.content.projects.map((p) => p.slug);
    const detailPaths = new Set(prodSlugs.map((s) => `/portfolio/${s}`));

    await check(`${t.tag}0 ${t.what}: the production demo builds: status built, package QA pass; its _integration/ is the production golden, byte for byte`, async () => {
      const r = await buildSite({ repoRoot: tmpRoot, siteId: DEMO, at: t.at });
      assert(r.status === "built" && r.record.qa.pass, `built: ${r.status}`);
      site = path.join(r.packageDir, "site");
      files = await walkFiles(site);
      eq((await readdir(path.join(site, "_integration"))).sort(), ["manifest.json", `portfolio.${t.version}.json`], "_integration files");
      for (const f of t.emission.files) eq(sha256(await readFile(path.join(site, f.path))), f.sha256, f.path);
    });
    await check(`${t.tag}1 ${t.what}: (i) the detail routes are exactly the 8 production records' (none of the fixture's); the sitemap, the listing page and every shipped text file of the package carry none of the fixture's ids / slugs / titles`, async () => {
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
    await check(`${t.tag}2 ${t.what}: (iv) no dead public reference: every portfolio link in every HTML page (home, listing, details, the other pages) and every sitemap entry resolves to the listing or to one of the 8 production detail pages; the listing and the sitemap reach all 8`, async () => {
      assert(site, "B0 build missing");
      const toPath = (href: string): string | undefined => {
        const u = new URL(href, ORIGIN);
        return u.origin === ORIGIN ? u.pathname.replace(/\/$/, "") || "/" : undefined;
      };
      const isPortfolio = (p: string | undefined) => p !== undefined && (p === "/portfolio" || p.startsWith("/portfolio/"));
      const htmlFiles = files.filter((f) => f.endsWith(".html"));
      assert(htmlFiles.length >= t.records + 5, `html pages: ${htmlFiles.length}`);
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
}
console.log("\n[build] a real production build of the demo's frozen dataset (throwaway root; data/sites + data/site-builds untouched)");
eq(demo.snapshot.content.projects.map((p) => p.id), PROD_IDS, "the frozen dataset serves the 8 production records");
await realBuild({ tag: "B", what: "frozen dataset, the 8 production records", siteDir: frozen.siteDir, input: demo, emission: prodEmission, version: PROD_VERSION, records: 8, at: AT });

// --------------------------------------------------------------------- live --
console.log("\n[live] data/sites/boost-interior-demo as it is NOW — what holds for any dataset, hand-authored or generated");
const liveDir = path.join(repoRoot, "data/sites", DEMO);
await check("LV1 the live directory is either the frozen dataset byte for byte (hand-authored) or a consistent generated portfolio (sidecar present and every generated file at its recorded hash) — never a silently hand-edited one; its projects.json is a projects@1 document whose records are exactly the served ones; no file of it names a synthetic id, slug or title. Adopted without a generated portfolio: the guard reports exactly that, and the committed files are still the frozen dataset", async () => {
  const manifest = await readManagedManifest(liveDir);
  eq(manifest !== undefined, frozen.live.managed, "sidecar present = managed");
  // the demo is adopted: its tracked marker is committed, exactly as site:portfolio-sync --adopt writes it
  eq([frozen.live.adopted, await readFile(path.join(liveDir, SOURCE_MARKER_FILE), "utf8").catch(() => "(missing)")], [true, SOURCE_MARKER_TEXT], `data/sites/${DEMO}/${SOURCE_MARKER_FILE}`);
  assert(frozen.live.identical || manifest !== undefined, `data/sites/${DEMO}: the portfolio dataset is neither the frozen one nor generated by site:portfolio-sync (no ${"portfolio.managed.json"}) — it was edited by hand`);
  const problems = await managedPortfolioProblems(liveDir, DEMO);
  if (live) eq(problems, [], "managed sidecar consistency");
  else assert(problems.length === 1 && NOT_GENERATED.test(problems[0]!), `adopted without a generated portfolio: the guard must report exactly that, got ${JSON.stringify(problems)}`);
  if (manifest) eq(manifest.source.siteId, DEMO, "the sidecar is this site's");
  const doc = JSON.parse(await readFile(path.join(liveDir, "content/projects.json"), "utf8"));
  assert(doc.schema === "projects@1" && typeof doc.origin === "string" && doc.origin.length > 0, `file-level schema / origin: ${doc.schema} / ${doc.origin}`);
  // not a dataset here: the committed file is the frozen one (asserted above), whose served records the frozen checks pin
  eq((live ?? demo).snapshot.content.projects.map((p) => p.id), (doc.items as { id: string }[]).map((p) => p.id).sort(), "served records = the file's records");
  let scanned = 0;
  for (const f of await walkFiles(liveDir)) {
    if (!TEXT.test(f)) continue;
    eq(forbiddenIn(await readFile(path.join(liveDir, f), "utf8")), [], `data/sites/${DEMO}/${f}`);
    scanned++;
  }
  assert(scanned >= 10, `scanned only ${scanned} files`);
  if (live && frozen.live.identical) eq([live.parts.siteSnapshotHash, live.buildInputId], [demo.parts.siteSnapshotHash, demo.buildInputId], "live = the frozen composition: same siteSnapshotHash, same buildInputId (every literal above describes the real site)");
});
if (live && liveEmission) {
  await check("LV2 the live producer output validates and contains none of the fixture's ids / slugs / titles; it emits exactly the served records, and every record's exported media is its own (its authored cover; every gallery image one of its own after images)", async () => {
    eq(validateFor(liveEmission, live.snapshot), { errors: [], warnings: [] }, "validates");
    for (const f of liveEmission.files) eq(forbiddenIn(f.text), [], f.path);
    const d = liveEmission.portfolio!.document;
    eq(d.records.map((r) => r.id), live.snapshot.content.projects.map((p) => p.id), "records = the served records");
    const assetOf = new Map(live.snapshot.assets.map((a) => [a.publicPath, a.id]));
    for (const r of d.records) {
      const p = live.snapshot.content.projects.find((x) => x.id === r.id)!;
      const ownAfter = new Set((p.galleryGroups ?? []).flatMap((g) => g.items.map((i) => i.image.asset)));
      if (r.media?.cover) eq(assetOf.get(r.media.cover.src), p.cover.asset, `${r.id}: exported cover is its authored cover`);
      for (const g of r.media?.gallery ?? []) assert(ownAfter.has(assetOf.get(g.src) ?? ""), `${r.id}: gallery image ${g.src} is one of its own after images`);
    }
  });
  if (live.buildInputId === demo.buildInputId) {
    await check("LV3 the live directory builds the SAME package as the frozen dataset (same buildInputId): B0 – B2 above are its build — no synthetic leak, no dead portfolio link, sitemap exact", () => {
      eq([live.parts.siteSnapshotHash, liveEmission.portfolio!.version], [demo.parts.siteSnapshotHash, PROD_VERSION], "same snapshot, same document");
    });
  } else {
    console.log("       the live dataset differs from the frozen one → its own real build");
    await realBuild({ tag: "LB", what: "live dataset", siteDir: liveDir, input: live, emission: liveEmission, version: liveEmission.portfolio!.version, records: live.snapshot.content.projects.length, at: LIVE_AT });
  }
} else {
  console.log(`       the live directory is adopted (${SOURCE_MARKER_FILE}) and this checkout holds no generated portfolio → it is not a dataset here; LV2 / LV3 have nothing to load`);
  await check("LVA an ADOPTED live directory without a generated portfolio is never loaded or built: prepareSiteInput refuses it and names site:portfolio-sync, and a real build of a verbatim copy (throwaway root) refuses the same way and writes no package — the committed projects.json cannot reach a build from this checkout", async () => {
    await rejects(() => prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at: LIVE_AT }), NOT_GENERATED, "prepareSiteInput");
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "production-truth-adopted-"));
    try {
      await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
      await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
      await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
      await cp(liveDir, path.join(tmpRoot, "data/sites", DEMO), { recursive: true });
      await rejects(() => buildSite({ repoRoot: tmpRoot, siteId: DEMO, at: LIVE_AT }), NOT_GENERATED, "buildSite");
      assert(!(await exists(path.join(tmpRoot, "data/site-builds"))), "the refused build wrote under data/site-builds");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
}

console.log(`\nportfolio-production-truth: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
