/**
 * Step 6 validation — Demo Customer Content Proof (boost-interior-demo on interior-01 1.4.0).
 *
 * The question under test: can ONE immutable Template Release produce a genuinely different
 * customer site by replacing only site data / settings / theme / assets / identity?
 * So this file asserts BOTH halves: nothing of the Template / release / fixtures moved
 * (against docs/result/recon-template-platform-step6-demo/proof/baseline.json — captured by
 * platform/test/step6-proof.ts before any Step 6 site input, asset, test or report existed; it is
 * the oldest Step 6 file, and its own sha256 is pinned below so a re-capture cannot pass silently),
 * and the demo site is a real, Korean, data-only site instance.
 *
 * Anchors, strongest first: (1) the release's frozen per-file hashes (54 release sources);
 * (2) the pinned baseline tree hashes (everything else: platform/build, cli, release, util,
 * site/load.ts, fixtures, release dirs); (3) mtimes vs the 1.4.0 release cut — forgeable, so
 * defence in depth only.
 *
 * After a newer release is cut and the sites are re-pinned (first: 1.4.1, Pre-Demo tiny polish)
 * the point-in-time half moves with it, never looser on the immutable part: the 1.4.0 release
 * and every baseline release must STILL verify and stay byte-identical (C), while "pins 1.4.0 /
 * live source = 1.4.0 / fixtures untouched" become "the demo pins ONE newer verified release,
 * every fixture a verified release of its own (pins are per site: since 1.5.2 the fixtures may
 * stay on an older one) / live source = the demo's release (no drift) / platform tree still = baseline".
 * In the Portfolio V0.2 pre-publish window (V0.2 pin/corpus, frozen V0.1 package current) the
 * package-vs-pin claims are held to demo-rollout.ts's PRE_PUBLISH_TRANSITION instead — never looser.
 * The data rules H / L / N / O are stated for the 19-record V0.2 corpus (docs/result/interior-portfolio-v0.2/38-):
 * an area and a gallery / keywords may be absent (never invented), filter expectations are explicit
 * literals derived from the authored corpus, and the page set comes from the route plan — each checked
 * on the current package AND on the pinned release's build of the whole corpus (U's rebuild).
 * Record truth split (2026-09-29, docs/work/portfolio-experience-v1/04-record-truth-audit.md): the
 * published demo is bi-01 … bi-08; the 11 synthetic records bi-09 … bi-19 are a TEST_ONLY fixture
 * (platform/test/fixtures/boost-interior-synthetic). The package / page-set rules run on the production
 * corpus; the edge-case rules that need the synthetic records (H's witnesses, L's optional fields and
 * cover-only fallback, N's literals) run on the QA corpus (portfolio-qa-corpus.ts: production + fixture,
 * the pre-split 19 records) — in memory, and as a real build in its own throwaway root (Q·build).
 *
 * Run AFTER `pnpm site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/step6.test.ts
 * Throwaway-root builds never touch data/sites or data/site-builds.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AssetRegistryDocSchema } from "../assets/assets";
import { buildProjectFilterVocabulary, evaluateProjectFilter, normalizeProjectFilter, toProjectFilterRecord, type ProjectFilterInput } from "../content/project-filter";
import { BannersDocSchema, ProjectsDocSchema, ReviewsDocSchema, areaBasisOf, projectAssetRefs, type Project } from "../content/schema";
import { buildSite, prepareSiteInput } from "../build/site-build";
import { collectReleaseSources, computeTemplateSourceHash, loadRelease, verifyRelease } from "../release/release";
import { createContentReader } from "../content/reader";
import { buildSiteSnapshot, loadSiteInstance } from "../site/load";
import { HEAD_SCRIPTS_FILE, SiteHeadScriptsDocSchema } from "../site/head-scripts";
import { planRoutes } from "../site/routes";
import { resolveEffectiveTheme } from "../theme/theme";
import { hashJson, sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { demoBuiltRelease, demoPackagedProjects, demoPagesPackage, demoRollout } from "./demo-rollout";
import { gitDirtyPaths } from "./git-checkout";
import { integrationSurfaceBefore, isIntegrationSurface } from "./integration-surface";
import { isPublishSurface } from "./publish-surface";
import { isPortfolioSyncSurface } from "./portfolio-sync-surface";
import { isPreviewSurface } from "./preview-surface";
import { isPortfolioRuntimeSurface } from "./portfolio-runtime-surface";
import { isRelease160Added, release160SurfaceBefore } from "./release-160-surface";
import { isRelease162Added, release162SurfaceBefore } from "./release-162-surface";
import { composeQaProjectsText, writeQaProjects } from "./portfolio-qa-corpus";
import { frozenDemoRoot } from "./demo-frozen-dataset";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
/**
 * The online-inquiry reuse fixture (interior-01 1.6.3): a clearly fictional SECOND customer with its
 * own inquiry endpoint (its own inquiry.json; no scripts.json, no integration.json), pinned to the
 * demo's release — it exists to prove a second site gets the online inquiry by config only
 * (inquiry163-reuse.test.ts). It is NOT one of the three generated Slice-1 FIXTURES above: it has
 * no pre-Step-6 baseline tree and no byte-identity proof, and its pin is held next to the demo's by
 * inquiry163-reuse.test.ts REUSE-1 — so it is named on its own and joins none of their loops (B,
 * E, V); A lists it as a site directory and holds its origin apart from the demo's, F keeps its
 * identity out of the demo package.
 */
const INQUIRY_FIXTURE = "fixture-online-inquiry";
/**
 * The second Template's own fictional site (interior-02): a different Template, so it joins none of
 * the interior-01 loops here (B, E, V) — A lists it as a site directory, holds its origin apart from
 * the demo's and its pin apart from interior-01.
 */
const SECOND_TEMPLATE_SITE = "ongyeol-interior-demo";
/**
 * The second Template's reuse site: the demo's brand on interior-02, a separate Site Instance with its
 * own origin. Like SECOND_TEMPLATE_SITE it joins none of the interior-01 loops here.
 */
const SECOND_TEMPLATE_REUSE_SITE = "boost-interior-demo-02";
/**
 * The third Template's two sites (interior-03): its own fictional site and its reuse site (the demo's
 * brand on interior-03, a separate Site Instance with its own origin). Like the second Template's sites
 * they join none of the interior-01 loops here — A lists them, holds their origins apart from the
 * demo's and their pins apart from interior-01.
 */
const THIRD_TEMPLATE_SITE = "nuridam-interior-demo";
const THIRD_TEMPLATE_REUSE_SITE = "boost-interior-demo-03";
const RELEASE = { id: "interior-01-1.4.0-9e1ea20da947", hash: "9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961" };
const FLAGSHIP = "bi-01";
const BASELINE_FILE = "docs/result/recon-template-platform-step6-demo/proof/baseline.json";
const BASELINE_SHA256 = "28728a75ad7d72d8ff1cf1502bc8f22a6bd97267950e5bf1fcbc2e9501adf78a"; // captured 2026-09-19T11:08:42Z

const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};

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
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
/**
 * Same tree hash as platform/test/step6-proof.ts (path + sha256 of every file). `override` replaces
 * a computed sha256 for a path present in the map (after hashing, before hashJson) — used to judge a
 * pre-existing file the first-party integration producer modified against its pre-integration hash
 * instead of its live one, so this whole-tree fingerprint keeps meaning "nothing else drifted".
 */
async function treeHash(rel: string, skipTop: readonly string[] = [], skip: (p: string) => boolean = () => false, override: Record<string, string> = {}): Promise<string> {
  const SKIP = new Set([".DS_Store", "node_modules", ".next", "out"]);
  const out: { path: string; sha256: string }[] = [];
  async function walk(dir: string, r: string) {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (SKIP.has(e.name) || (r === "" && skipTop.includes(e.name))) continue;
      const p = r ? `${r}/${e.name}` : e.name;
      if (skip(p)) continue;
      if (e.isDirectory()) await walk(path.join(dir, e.name), p);
      else if (e.isFile()) out.push({ path: p, sha256: sha256(await readFile(path.join(dir, e.name))) });
    }
  }
  await walk(path.join(repoRoot, rel), "");
  for (const f of out) if (f.path in override) f.sha256 = override[f.path]!;
  return hashJson(out);
}
const pointer = async (s: string) => {
  // the demo's package of PAGES (demo-rollout.ts demoPagesPackage): `current`, or — the demo being published incrementally, its current package a shell — its last ordinary package
  const ptr = s === DEMO ? await demoPagesPackage(repoRoot) : await readJson(path.join(repoRoot, "data/site-builds", s, "current.json"));
  const dir = path.join(repoRoot, ptr.packageDir);
  return { dir, site: path.join(dir, "site"), record: await readJson(path.join(dir, "build-record.json")) };
};
const TEXT = /\.(html|txt|js|css|json|xml|svg|map)$/;
async function packageTexts(site: string): Promise<{ file: string; text: string }[]> {
  const out: { file: string; text: string }[] = [];
  for (const f of await walkFiles(site)) if (TEXT.test(f)) out.push({ file: f, text: await readFile(path.join(site, f), "utf8") });
  return out;
}
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const visibleText = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// (1.5.0: the seat is a next/link, which writes href after data-floating-cta)
const CTA = /<div class="i1-fcta" data-section="site\.floating-cta"><a class="i1-fcta__link" (?:href="([^"]+)" data-floating-cta=""|data-floating-cta="" href="([^"]+)")>[\s\S]*?<span>([^<]*)<\/span><\/a><\/div>/g;
const ctasOf = (h: string) => [...h.matchAll(CTA)].map((m) => ({ href: (m[1] ?? m[2])!, label: m[3]! }));

const baseline = await readJson(path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/proof/baseline.json"));
// The demo's site directory is read through the frozen composition (demo-frozen-dataset.ts): byte-identical to the live one but for the adoption marker, which makes the live directory refuse to load without a generated portfolio. data/site-builds and the template releases stay in the real repoRoot.
const frozen = await frozenDemoRoot(repoRoot);
const demoDir = frozen.siteDir;
const demo = await pointer(DEMO);
const projectsDoc = ProjectsDocSchema.parse(await readJson(path.join(demoDir, "content/projects.json")));
const projects = projectsDoc.items as Project[];
/** The QA corpus (portfolio-qa-corpus.ts): the production records + the TEST_ONLY synthetic fixture, in the pre-split order — the 19 records N's literals describe. */
const qaProjects = ProjectsDocSchema.parse(JSON.parse(await composeQaProjectsText(repoRoot))).items as Project[];
const slots = await readJson(path.join(demoDir, "slots.json"));
const settings = await readJson(path.join(demoDir, "settings.json"));
/** The demo's pin. `later` = the sites moved past the 1.4.0 proof release (see the header). */
const PIN = (await readJson(path.join(demoDir, "site.json"))).template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
/** The demo's public origin and business address come from its Site Data (1.5.2 moved both to the real outreach values). */
const ORIGIN = (await readJson(path.join(demoDir, "site.json"))).identity.publicOrigin as string;
const EMAIL = (await readJson(path.join(demoDir, "content/business.json"))).data.contact.email as string;
const later = versionAtLeast(PIN.templateVersion, "1.4.1");
/** Every site's OWN pin: each Site Instance pins an exact release of its own (1.5.2 re-pinned only the demo). */
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template as typeof PIN;
/**
 * `ia` = pinned ≥ 1.5.0 (information architecture): three more pages (/3d-portfolio, /about,
 * /contact) and every contact CTA → /contact (the page writes to the business mailto). Asserted
 * here as the new expectation, and in full by ia150.test.ts.
 */
const ia = versionAtLeast(PIN.templateVersion, "1.5.0");
const CONTACT_HREF = ia ? "/contact" : `mailto:${EMAIL}`;
const htmlFiles = (await walkFiles(demo.site)).filter((f) => f.endsWith(".html"));
const html = Object.fromEntries(await Promise.all(htmlFiles.map(async (f) => [f, await readFile(path.join(demo.site, f), "utf8")] as const)));

// ------------------------------------------------------- site instance --
console.log("\n[site] a NEW site instance, pinned to the existing immutable release");
await check("A boost-interior-demo exists as its own Site Instance (siteId, Korean identity, own origin); the three generated fixtures and the online-inquiry reuse fixture are separate directories, and data/sites holds nothing else", async () => {
  const site = await loadSiteInstance(repoRoot, DEMO);
  eq([site.siteId, site.identity.brandName, site.identity.locale], [DEMO, "부스트 인테리어", "ko-KR"], "identity");
  // its own https origin, shared with no fixture (the value itself is Site Data; the package checks G / X hold the output to it)
  assert(site.identity.publicOrigin === ORIGIN && new URL(ORIGIN).protocol === "https:", String(site.identity.publicOrigin));
  for (const f of [...FIXTURES, INQUIRY_FIXTURE, SECOND_TEMPLATE_SITE, SECOND_TEMPLATE_REUSE_SITE, THIRD_TEMPLATE_SITE, THIRD_TEMPLATE_REUSE_SITE]) assert((await loadSiteInstance(repoRoot, f)).identity.publicOrigin !== ORIGIN, `${f} shares the demo origin`);
  // exactly: the demo, the three generated fixtures, the online-inquiry reuse fixture (INQUIRY_FIXTURE, its own entry)
  // and the second Template's two sites (SECOND_TEMPLATE_SITE and its reuse site, pinned to interior-02 — never to this Template)
  // and the third Template's two sites (THIRD_TEMPLATE_SITE and its reuse site, pinned to interior-03 — never to this Template)
  eq((await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort(), [DEMO, ...FIXTURES, INQUIRY_FIXTURE, SECOND_TEMPLATE_SITE, SECOND_TEMPLATE_REUSE_SITE, THIRD_TEMPLATE_SITE, THIRD_TEMPLATE_REUSE_SITE].sort(), "data/sites");
  for (const s of [SECOND_TEMPLATE_SITE, SECOND_TEMPLATE_REUSE_SITE]) eq((await loadSiteInstance(repoRoot, s)).template.templateId, "interior-02", `${s} pins the second Template`);
  for (const s of [THIRD_TEMPLATE_SITE, THIRD_TEMPLATE_REUSE_SITE]) eq((await loadSiteInstance(repoRoot, s)).template.templateId, "interior-03", `${s} pins the third Template`);
  eq((await loadSiteInstance(repoRoot, INQUIRY_FIXTURE)).siteId, INQUIRY_FIXTURE, "the reuse fixture loads as its own Site Instance");
});
await check(`B pins EXACTLY ${later ? "ONE newer verified release (each fixture pins its own verified release)" : RELEASE.id} (id + full hash), and the current package was built with it — pre-publish: with the V0.1 publish target (demo-rollout.ts)`, async () => {
  const site = await loadSiteInstance(repoRoot, DEMO);
  if (!later) eq(site.template, { templateId: "interior-01", templateVersion: "1.4.0", releaseId: RELEASE.id, releaseHash: RELEASE.hash }, "pin");
  else {
    // re-pinned: exactly ONE newer verified release. Pins are per site — a fixture may stay on an
    // older release (1.5.2 moved only the demo) — so each fixture is held to a verified release of its own.
    for (const [s, p] of [[DEMO, site.template], ...(await Promise.all(FIXTURES.map(async (f) => [f, await pinOf(f)] as const)))] as const) {
      const rel = await loadRelease(repoRoot, "interior-01", p.releaseId);
      await verifyRelease(repoRoot, rel);
      eq(p, { templateId: "interior-01", templateVersion: rel.templateVersion, releaseId: rel.releaseId, releaseHash: rel.releaseHash }, `${s} pin = a verified release`);
      assert(p.releaseId === `interior-01-${p.templateVersion}-${p.releaseHash.slice(0, 12)}`, `${s} pin id/hash: ${p.releaseId}`);
      assert(versionAtLeast(p.templateVersion, "1.4.1"), `${s} pin ${p.templateVersion}: older than the first re-pin`);
    }
  }
  // = the pin once steady; in the Portfolio V0.2 pre-publish window, the frozen V0.1 package's release
  const built = later ? await demoBuiltRelease(repoRoot, PIN) : PIN;
  eq([demo.record.template.releaseId, demo.record.template.releaseHash, demo.record.status, demo.record.qa.pass], [built.releaseId, built.releaseHash, "success", true], "build record");
});

// ------------------------------------------------ nothing else moved --
console.log("\n[unchanged] Template source, releases and fixtures against the pre-Step-6 baseline");
await check("C0 the baseline itself is the one captured at 2026-09-19T11:08:42Z (sha256 pinned): re-capturing it after a change fails here", async () => {
  eq(sha256(await readFile(path.join(repoRoot, BASELINE_FILE))), BASELINE_SHA256, "baseline.json sha256");
  eq(baseline.capturedAt, "2026-09-19T11:08:42.419Z", "capturedAt");
});
await check("C release hash unchanged: the 1.4.0 release verifies, NO release was added or removed, every release tree is byte-identical", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", RELEASE.id);
  await verifyRelease(repoRoot, rel);
  eq([rel.releaseHash, baseline.releaseHash], [RELEASE.hash, RELEASE.hash], "releaseHash");
  const now = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-")).sort();
  const ver = (d: string) => /^interior-01-(\d+)\.(\d+)\.(\d+)-/.exec(d)!.slice(1).map(Number) as [number, number, number];
  const newer = now.filter((d) => { const [a, b, c] = ver(d); return a > 1 || (a === 1 && (b > 4 || (b === 4 && c > 0))); });
  if (!later) {
    eq(now, baseline.releases, "release list");
    assert(newer.length === 0, `a newer release exists: ${now.join(", ")}`);
  } else {
    // releases are only ever ADDED: every baseline release is still there, anything else is newer than 1.4.0 and verifies
    eq(now.filter((d) => !newer.includes(d)), baseline.releases, "baseline release list");
    assert(newer.includes(PIN.releaseId), `the pinned release ${PIN.releaseId} is not in ${now.join(", ")}`);
    for (const r of newer) await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", r));
  }
  assert(now.filter((d) => d.startsWith("interior-01-1.4.0-")).length === 1, `1.4.0 release dirs: ${now.join(", ")}`);
  for (const r of baseline.releases as string[]) eq(await treeHash(`data/template-releases/interior-01/${r}`), baseline.trees[`data/template-releases/interior-01/${r}`].hash, `release tree ${r}`);
});
await check("D Template source unchanged: live templateSourceHash = baseline = the release record; live release sources have no drift; raw template + platform trees identical", async () => {
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const live = await Promise.all([...sources].map(async ([p, abs]) => ({ path: p, sha256: sha256(await readFile(abs)) })));
  const rel = await loadRelease(repoRoot, "interior-01", PIN.releaseId);
  const liveHash = computeTemplateSourceHash(live);
  // the current package carries the source hash of the release it was built with: the pin's (= live)
  // once steady; in the Portfolio V0.2 pre-publish window, the V0.1 publish target's (demo-rollout.ts)
  const builtSourceHash = later ? (await demoBuiltRelease(repoRoot, PIN)).templateSourceHash : liveHash;
  eq([liveHash, demo.record.template.templateSourceHash], [rel.templateSourceHash, builtSourceHash], "templateSourceHash");
  const recorded = new Map(rel.files.map((f) => [f.path, f.sha256]));
  eq(live.filter((f) => recorded.get(f.path) !== f.sha256).map((f) => f.path), [], "live files that differ from the release");
  if (!later) {
    eq(liveHash, baseline.liveTemplateSourceHash, "templateSourceHash vs baseline");
    eq(await treeHash("templates/interior-01/v1"), baseline.trees["templates/interior-01/v1"].hash, "templates/interior-01/v1 tree");
  } else {
    // the Template moved by a release, not by a site: the 1.4.0 record still carries the baseline source hash
    eq((await loadRelease(repoRoot, "interior-01", RELEASE.id)).templateSourceHash, baseline.liveTemplateSourceHash, "1.4.0 templateSourceHash");
    assert(liveHash !== baseline.liveTemplateSourceHash, "a newer release with the 1.4.0 sources");
  }
  // Files the first-party integration producer ADDED are excluded like publish/ and test/; a
  // pre-existing file it MODIFIED is instead judged at its pre-integration hash (`overrides`), so
  // this whole-tree fingerprint still proves the tree as of the task's start commit (be6b10a); the
  // current content of those four files is asserted by integration.test.ts instead. The 1.6.0 surface
  // (V0.2 schema + widget seam, release-160-surface.ts) is treated the same way; its current content
  // is held by integration.test.ts I2b. So is the 1.6.2 surface (the inquiry seam + door,
  // release-162-surface.ts); its current content is held by integration.test.ts I2b and inquiry162.test.ts.
  // 1.6.3 changed one platform file — the door that surface already excludes as added by 1.6.2 — so
  // this fingerprint needs no further surface; the door's 1.6.3 content is held by I2b and inquiry163.test.ts.
  // The portfolio-sync surface (portfolio-sync-surface.ts, 2026-10-06) only ADDED files (its one seam,
  // site/load.ts, is already judged at its pre-integration hash) — excluded like publish/.
  const overrides = await integrationSurfaceBefore(repoRoot);
  const overrides160 = await release160SurfaceBefore(repoRoot);
  const overrides162 = release162SurfaceBefore();
  eq(
    await treeHash("platform", ["test"], (p) => p === "publish" || isPublishSurface(p) || isPortfolioSyncSurface(p) || isPreviewSurface(p) || isPortfolioRuntimeSurface(p) || (isIntegrationSurface(p) && !(p in overrides)) || isRelease160Added(p) || isRelease162Added(p), { ...overrides, ...overrides160, ...overrides162 }),
    baseline.trees["platform (test/ excluded)"].hash,
    "platform tree (test/ excluded)",
  );
});
await check("D2 independent of the baseline: no Template / Platform implementation file (test/ excluded) was modified after the 1.4.0 release was cut", async () => {
  const cut140 = Date.parse((await loadRelease(repoRoot, "interior-01", RELEASE.id)).createdAt);
  assert(Number.isFinite(cut140) && cut140 < Date.parse(baseline.capturedAt), "release cut precedes the baseline");
  // re-pinned: the clock moves to the pinned release's cut (nothing may change after THAT either)
  const cut = Date.parse((await loadRelease(repoRoot, "interior-01", PIN.releaseId)).createdAt);
  assert(Number.isFinite(cut) && cut >= cut140, "pinned release cut");
  // A Git checkout stamps every file it writes with the checkout time, so an mtime only means something
  // for a file that differs from the commit (a local edit). Clean tracked files are held byte-for-byte by
  // D (release record + baseline tree hashes); without Git, every file is judged by its mtime as before.
  const dirty = gitDirtyPaths(repoRoot, ["templates/interior-01/v1", "platform"]);
  const late: string[] = [];
  for (const root of ["templates/interior-01/v1", "platform"]) {
    for (const f of await walkFiles(path.join(repoRoot, root))) {
      if (root === "platform" && (f.startsWith("test/") || isPublishSurface(f) || isPortfolioSyncSurface(f) || isPreviewSurface(f) || isPortfolioRuntimeSurface(f) || isIntegrationSurface(f))) continue;
      if (/(^|\/)(node_modules|\.next|out)\//.test(f)) continue;
      if (dirty && !dirty.has(`${root}/${f}`)) continue;
      if ((await stat(path.join(repoRoot, root, f))).mtimeMs > cut + 1000) late.push(`${root}/${f}`);
    }
  }
  eq(late, [], "files modified after the release cut");
});
await check("E old fixture sites unchanged: data/sites/fixture-* and data/site-builds/fixture-* (pointers, history, packages) byte-identical", async () => {
  for (const s of FIXTURES) {
    if (later) {
      // fixtures were re-pinned + rebuilt with a newer release (their byte identity was the 1.4.0-era claim);
      // each current package is built with that fixture's OWN pin (not necessarily the demo's)
      const p = await pointer(s);
      const own = await pinOf(s);
      eq([p.record.template.releaseId, p.record.template.releaseHash, p.record.status, p.record.qa.pass], [own.releaseId, own.releaseHash, "success", true], `${s} build record`);
      continue;
    }
    eq(await treeHash(`data/sites/${s}`), baseline.trees[`data/sites/${s}`].hash, `data/sites/${s}`);
    eq(await treeHash(`data/site-builds/${s}`), baseline.trees[`data/site-builds/${s}`].hash, `data/site-builds/${s}`);
  }
});
await check("V same release, different site instances: every site's package carries its own pin's releaseId + templateSourceHash, and ≥ 2 sites share one release; buildInputIds, snapshots and rendered homes all differ", async () => {
  const all = await Promise.all([...FIXTURES, DEMO].map(async (s) => ({ s, p: await pointer(s), pin: later ? await pinOf(s) : PIN })));
  for (const { s, p, pin } of all) {
    // the demo's package carries the release it was built with: its pin once steady, the V0.1 publish
    // target in the Portfolio V0.2 pre-publish window (demo-rollout.ts); a fixture's is always its pin
    if (later && s === DEMO) {
      const built = await demoBuiltRelease(repoRoot, pin);
      eq([p.record.template.releaseId, p.record.template.templateSourceHash], [built.releaseId, built.templateSourceHash], `${s} release`);
      continue;
    }
    const sourceHash = later ? (await loadRelease(repoRoot, "interior-01", pin.releaseId)).templateSourceHash : baseline.liveTemplateSourceHash;
    eq([p.record.template.releaseId, p.record.template.templateSourceHash], [pin.releaseId, sourceHash], `${s} release`);
  }
  // the Step 6 question — ONE release, genuinely different sites — still needs a release shared by several sites
  const perRelease = new Map<string, number>();
  for (const { pin } of all) perRelease.set(pin.releaseId, (perRelease.get(pin.releaseId) ?? 0) + 1);
  assert(Math.max(...perRelease.values()) >= 2, `no release is shared by two sites: ${JSON.stringify([...perRelease])}`);
  assert(new Set(all.map(({ p }) => p.record.buildInputId)).size === 4, "buildInputIds collide");
  assert(new Set(all.map(({ p }) => p.record.parts?.siteSnapshotHash ?? p.record.buildInputId)).size === 4, "snapshots collide");
  const homes = await Promise.all(all.map(async ({ p }) => sha256(mainOf(await readFile(path.join(p.site, "index.html"), "utf8")))));
  assert(new Set(homes).size === 4, "two sites render the same home");
});

// ------------------------------------------------------------ leakage --
console.log("\n[leakage] the demo package carries no fixture identity and no source-site material");
const texts = await packageTexts(demo.site);
await check("F no fixture identity anywhere in the demo package or its site documents: fixed patterns + every fixture's own brand, legal name, e-mail, origin, project ids and titles (read from the fixtures), and the online-inquiry reuse fixture's site id, identity and inquiry endpoint (read from its documents)", async () => {
  const bad = /harbor|pine studio|fixture-(large|small|empty)|fictional fixture|hp-0\d{3}|마루 아틀리에|픽스처|quiet room/i;
  const tokens = new Set<string>();
  for (const s of FIXTURES) {
    const dir = path.join(repoRoot, "data/sites", s);
    const site = await readJson(path.join(dir, "site.json"));
    const business = await readJson(path.join(dir, "content/business.json"));
    for (const t of [site.identity?.brandName, site.identity?.legalName, site.identity?.publicOrigin, business.data?.contact?.email, business.data?.summary]) if (typeof t === "string" && t.length >= 6) tokens.add(t.toLowerCase());
    const fixtureProjects = ProjectsDocSchema.parse(await readJson(path.join(dir, "content/projects.json"))).items as Project[];
    for (const p of fixtureProjects) { tokens.add(p.title.toLowerCase()); if (!/^bi-/.test(p.id)) tokens.add(`/portfolio/${p.slug}`.toLowerCase()); }
  }
  assert(tokens.size > 100, `fixture tokens: ${tokens.size}`);
  // the online-inquiry reuse fixture (INQUIRY_FIXTURE) is not one of the three: its identity joins
  // the set on its own — site id, brand, legal name, origin, e-mail, summary and its inquiry
  // endpoint + that endpoint's host, each read from its documents and each required to be there
  {
    const dir = path.join(repoRoot, "data/sites", INQUIRY_FIXTURE);
    const site = await readJson(path.join(dir, "site.json"));
    const business = await readJson(path.join(dir, "content/business.json"));
    const endpoint = (await readJson(path.join(dir, "inquiry.json"))).endpoint as string;
    const own = [site.siteId, site.identity?.brandName, site.identity?.legalName, site.identity?.publicOrigin, business.data?.contact?.email, business.data?.summary, endpoint, new URL(endpoint).host];
    eq(site.siteId, INQUIRY_FIXTURE, "reuse fixture site id");
    for (const t of own) {
      assert(typeof t === "string" && t.length >= 6, `reuse fixture token ${JSON.stringify(t)}`);
      tokens.add(t.toLowerCase());
    }
  }
  const scan = (where: string, text: string) => {
    assert(!bad.test(text), `${where}: ${bad.exec(text)?.[0]}`);
    const lower = text.toLowerCase();
    for (const t of tokens) assert(!lower.includes(t), `${where}: fixture token "${t}"`);
  };
  for (const t of texts) scan(t.file, t.text);
  for (const f of await walkFiles(demoDir)) if (/\.(json|svg)$/.test(f)) scan(`site doc ${f}`, await readFile(path.join(demoDir, f), "utf8"));
});
/**
 * The demo's own head scripts (data/sites/<demo>/scripts.json, the platform's head-scripts seam). They
 * are the ONLY remote URLs its pages may carry. Package QA (platform/build/qa.ts) allows exactly
 * those whole URLs, nothing else on their host, in any attribute or text file; G is stricter for
 * the demo's HTML: a declared URL may appear only as a <script src>, once per page.
 */
const declaredScripts = (await stat(path.join(demoDir, HEAD_SCRIPTS_FILE)).then(() => true, () => false))
  ? SiteHeadScriptsDocSchema.parse(await readJson(path.join(demoDir, HEAD_SCRIPTS_FILE))).headScripts
  : [];
await check("G no Apartmentary leakage: the release's frozen forbidden terms + the source brand (ko/en) are absent; package QA passed; no absolute URL leaves the site origin except the site's declared head scripts, each exactly once per page, async", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", PIN.releaseId);
  const terms = [...rel.forbiddenTerms, "apartmentary", "아파트멘터리"].map((t) => t.toLowerCase());
  assert(terms.length >= 2, "no forbidden terms to scan");
  for (const t of texts) for (const term of terms) assert(!t.text.toLowerCase().includes(term), `${t.file}: "${term}"`);
  assert(demo.record.qa.pass === true && (demo.record.qa.failures ?? []).length === 0, "package QA");
  const declared = new Set(declaredScripts.map((d) => d.src));
  for (const [f, h] of Object.entries(html)) {
    for (const m of h.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) assert(new URL(m[1]!).origin === ORIGIN || declared.has(m[1]!), `${f}: ${m[1]}`);
    for (const m of h.matchAll(/<(\w+)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/g)) if (declared.has(m[2]!)) eq(m[1], "script", `${f}: declared ${m[2]} used outside a <script src>`);
    for (const d of declaredScripts) {
      const tags = [...h.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`src="${d.src}"`));
      eq(tags.length, 1, `${f}: <script src="${d.src}"> count`);
      assert(/ async=""/.test(tags[0]!) || d.attrs?.defer !== undefined, `${f}: ${d.id} is neither async nor defer`);
      for (const [k, v] of Object.entries(d.attrs ?? {})) if (k.startsWith("data-")) assert(tags[0]!.includes(`${k}="${v}"`), `${f}: ${d.id} lacks ${k}`);
    }
  }
});

// --------------------------------------------------------- area basis --
console.log("\n[area] Korean area-basis contract");
/** The demo's detail area labels by the record's OWN basis (site copy since 1.6.1) — H's expected side. */
const AREA_LABEL = { supply: "공급면적", exclusive: "전용면적", unknown: "면적" } as const;
const AREA_SYMBOL = { pyeong: "평", m2: " m²", sqft: " sq ft" } as const;
const areaRowOf = (h: string) => {
  const m = /data-fact="area"><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/.exec(mainOf(h));
  return m ? [m[1]!, m[2]!] : undefined;
};
/** A present area → its own basis label + the authored figure (no conversion); no area → no row and no area label. */
function assertAreaRows(where: string, pages: Record<string, string>, records: readonly Project[]) {
  for (const p of records) {
    const h = pages[`portfolio/${p.slug}.html`];
    assert(h, `${where}: no detail page for ${p.id}`);
    if (!p.area) {
      assert(!areaRowOf(h) && !/<dt>[^<]*면적<\/dt>/.test(mainOf(h)), `${where} ${p.id}: an area row / label without an area`);
      continue;
    }
    assert(Number.isInteger(p.area.value) && p.area.value < 1000, `${p.id}: the expected figure below assumes a small integer`);
    eq(areaRowOf(h), [AREA_LABEL[areaBasisOf(p.area)], `${p.area.value}${AREA_SYMBOL[p.area.unit]}`], `${where} ${p.id} area row`);
  }
}
await check("H area basis (V0.2): the 34평 flagship is { 34, pyeong, supply }; an area may be ABSENT (never invented) and a present one is labelled by ITS basis — 공급면적 / 전용면적 / unqualified 면적 — with the authored figure, on every page of the current package (the pinned release over the whole corpus: H·build)", async () => {
  const flagship = projects.find((p) => p.id === FLAGSHIP)!;
  eq(flagship.area, { value: 34, unit: "pyeong", basis: "supply" }, "flagship area");
  // every branch of the rule has a witness in the QA corpus (the synthetic fixture): supply 평, supply m², exclusive m², no area
  const byId = (id: string) => qaProjects.find((p) => p.id === id)!;
  eq([byId("bi-17").area, byId("bi-14").area, byId("bi-15").area], [{ value: 112, unit: "m2", basis: "supply" }, { value: 84, unit: "m2", basis: "exclusive" }, undefined], "witnesses bi-17 / bi-14 / bi-15 (QA corpus)");
  const labels = slots.values["portfolio.detail"];
  eq([labels.areaSupplyLabel, labels.areaExclusiveLabel, labels.areaLabel], [AREA_LABEL.supply, AREA_LABEL.exclusive, AREA_LABEL.unknown], "detail area labels (supply, exclusive, no stated basis)");
  assertAreaRows("current package", html, await demoPackagedProjects(repoRoot, projects));
});
await check("I no automatic 34 → 84: the area fact renders as authored (34평) — no ㎡/112/84 derived beside it; 84㎡ appears only as the separately authored 전용면적 sentence; no '34평 = 84' anywhere", async () => {
  const flagship = projects.find((p) => p.id === FLAGSHIP)!;
  const page = html[`portfolio/${flagship.slug}.html`]!;
  const main = mainOf(page);
  const fact = /공급면적<\/dt>\s*<dd[^>]*>([^<]*)<\/dd>/.exec(main)?.[1];
  assert(fact === "34평", `area fact: ${fact}`);
  const text = visibleText(main);
  eq(text.match(/84\s*(㎡|m²|m2)/g) ?? [], ["84㎡"], "84㎡ occurrences in the flagship detail");
  assert(/전용면적 약 84㎡/.test(text) && /공급면적 약 34평/.test(text), "the two bases are not both labelled in the authored sentence");
  assert(!/112(\.\d+)?\s*(㎡|m²)/.test(text), "a converted ㎡ figure is rendered");
  const equiv = /34\s*평\s*(=|≈|≒|→|\(|은|는)?\s*(약\s*)?84/;
  for (const t of texts) assert(!equiv.test(visibleText(t.text)), `${t.file}: 34평 presented as 84`);
  for (const p of qaProjects) for (const s of [p.title, p.summary ?? "", ...(p.body ?? [])]) assert(!equiv.test(s), `${p.id}: ${s.slice(0, 40)}`);
  // every other card/list surface shows the authored figure too. V0.2: an 84 on the list may only be a
  // record's OWN authored title / summary stating its OWN authored 84 m² (bi-14, 전용 84㎡) — never a
  // figure derived from 34평; everything else on the list is still held to "no 84"
  let list = visibleText(mainOf(html["portfolio.html"]!));
  for (const p of await demoPackagedProjects(repoRoot, projects)) {
    for (const s of [p.title, p.summary ?? ""]) {
      if (!/84/.test(s)) continue;
      assert(p.area?.value === 84 && p.area.unit === "m2", `${p.id}: "${s.slice(0, 40)}" states 84 but its authored area is ${JSON.stringify(p.area)}`);
      list = list.split(s).join(" ");
    }
  }
  assert(!/84/.test(list), "84 on the portfolio list");
});

// -------------------------------------------------------------- assets --
/**
 * references/ (the customer's reference photos, the approved generations) stays out of Git, so K2 / K3 read
 * its tracked record (file names + sha256, step6-references.json) — a plain checkout runs them. Where the
 * folders exist (the authoring machine) the record must equal the disk, so it cannot go stale silently.
 */
type RefSet = { dir: string; files: { file: string; sha256: string }[] };
const REFS = (await readJson(path.join(repoRoot, "platform/test/step6-references.json"))) as { referenceImages: RefSet; approvedGenerated: RefSet };
console.log("\n[assets] registry, references, reference-image isolation");
await check("K1b the tracked reference record equals references/ wherever that folder exists (skipped on a checkout without it)", async () => {
  for (const [set, re] of [[REFS.referenceImages, /\.(png|jpe?g|webp)$/i], [REFS.approvedGenerated, /\.(jpg|png|webp)$/]] as const) {
    const dir = path.join(repoRoot, set.dir);
    const onDisk = await readdir(dir).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? undefined : Promise.reject(e)));
    if (!onDisk) continue;
    const disk = await Promise.all(onDisk.filter((f) => re.test(f)).sort().map(async (f) => ({ file: f, sha256: sha256(await readFile(path.join(dir, f))) })));
    eq(disk, set.files, `${set.dir} vs step6-references.json`);
  }
});
const registry = AssetRegistryDocSchema.parse(await readJson(path.join(demoDir, "assets/registry.json")));
const { snapshot } = await buildSiteSnapshot({ repoRoot: frozen.root, siteId: DEMO, mode: "public", at: demo.record.at });
await check("J every referenced asset exists: registry entry + file on disk + content-addressed copy in the package", async () => {
  const onDisk = new Set(await readdir(path.join(demoDir, "assets")));
  for (const a of snapshot.assets) {
    assert(onDisk.has(a.file), `${a.id}: file ${a.file} missing`);
    const copied = await readFile(path.join(demo.site, a.publicPath)).catch(() => undefined);
    assert(copied && sha256(copied) === a.sha256, `${a.id}: not in the package at ${a.publicPath}`);
  }
  const refs = new Set(projects.flatMap(projectAssetRefs));
  for (const r of refs) assert(registry.items.some((i) => i.id === r), `project asset ${r} not registered`);
});
await check("K no unreferenced public demo asset: registry = referenced set, no stray file in assets/, package /assets = referenced set", async () => {
  eq(registry.items.map((i) => i.id).sort(), snapshot.assets.map((a) => a.id).sort(), "registered vs referenced");
  eq((await readdir(path.join(demoDir, "assets"))).filter((f) => f !== "registry.json" && f !== ".DS_Store").sort(), registry.items.map((i) => i.file).sort(), "files vs registry");
  eq((await readdir(path.join(demo.site, "assets"))).sort(), [...new Set(snapshot.assets.map((a) => path.basename(a.publicPath)))].sort(), "package assets");
});
await check("K2 reference images are reference-only: no site/package asset is byte-identical to a reference file, none is copied by name, and no demo asset is a PNG", async () => {
  const refFiles = REFS.referenceImages.files.map((f) => f.file);
  assert(refFiles.length >= 14, `reference files: ${refFiles.length}`);
  const refHashes = new Set(REFS.referenceImages.files.map((f) => f.sha256));
  for (const a of snapshot.assets) assert(!refHashes.has(a.sha256), `${a.id} is a copied reference image`);
  for (const i of registry.items) assert(!refFiles.includes(i.file) && i.mediaType !== "image/png", `${i.id}: ${i.file}`);
  // byte identity cannot see a raster embedded INSIDE an SVG stand-in, so forbid embedding outright
  for (const i of registry.items.filter((x) => x.mediaType === "image/svg+xml")) {
    const svg = await readFile(path.join(demoDir, "assets", i.file), "utf8");
    assert(!/data:|base64|<image\b|xlink:href|href\s*=/i.test(svg), `${i.id}: SVG embeds or links external content`);
  }
});
await check("K3 asset status is honest: 04-asset-status.json matches the registry (approved-generated = raster, stand-in = SVG) and its verdict follows the counts", async () => {
  const st = await readJson(path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/image-generation/04-asset-status.json"));
  const approved = st.status.filter((s: { source: string }) => s.source === "approved-generated");
  for (const s of st.status as { shotId: string; source: string }[]) {
    const entry = registry.items.find((i) => i.id === s.shotId)!;
    assert(entry && (s.source === "approved-generated") === (entry.mediaType !== "image/svg+xml"), `${s.shotId}: ${s.source} vs ${entry?.mediaType}`);
  }
  eq(st.AI_PORTFOLIO_ASSETS, approved.length === st.shots ? "PASS" : approved.length === 0 ? "WAITING_FOR_GENERATION" : "PARTIAL", "verdict");
  eq(REFS.approvedGenerated.files.length, approved.length, "approved files vs ingested");
});

// ------------------------------------------------------------- content --
console.log("\n[content] one canonical projects collection, Korean, linked");
const assetPath = new Map(snapshot.assets.map((a) => [a.id, a.publicPath] as const));
/**
 * A usable visual on every detail page, by the Template's rule: an authored gallery renders every one of its
 * photos (and only the project's own), a project without one renders exactly its cover (the designed
 * cover-only fallback) — and every image the page references is a non-empty file in the package.
 */
async function assertVisuals(where: string, site: string, pages: Record<string, string>, records: readonly Project[]) {
  for (const p of records) {
    const h = pages[`portfolio/${p.slug}.html`];
    assert(h, `${where}: no detail page for ${p.id}`);
    const gallery = /<div class="i1-detail__gallery">([\s\S]*?)<\/div><div class="i1-detail__info/.exec(h)?.[1] ?? "";
    const srcs = [...new Set([...gallery.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/g)].map((m) => m[1]!))];
    assert(srcs.length > 0, `${where} ${p.id}: no image in the gallery`);
    for (const src of srcs) assert(((await readFile(path.join(site, src)).catch(() => undefined))?.length ?? 0) > 0, `${where} ${p.id}: broken image ${src}`);
    const own = (m: { asset: string }) => assetPath.get(m.asset) ?? `(unregistered ${m.asset})`;
    if (!p.galleryGroups) {
      eq(srcs, [own(p.cover)], `${where} ${p.id}: cover-only fallback`);
      continue;
    }
    const items = p.galleryGroups.flatMap((g) => g.items);
    const mine = new Set(items.flatMap((it) => [own(it.image), ...(it.before ? [own(it.before)] : [])]));
    eq(srcs.filter((src) => !mine.has(src)), [], `${where} ${p.id}: gallery images that are not the project's`);
    for (const it of items) assert(srcs.includes(own(it.image)), `${where} ${p.id}: gallery photo ${it.image.asset} not rendered`);
  }
}
await check("L all published project slugs (and ids) are unique; ≥ 6 projects; every project has the Step 6 core fields (Korean title + summary, body, location, scope, period, duration); galleryGroups and keywords are OPTIONAL (V0.2 cover-only records, schema-valid when present); the flagship keeps its designed gallery; every page of the current package renders a usable visual (the whole corpus: L·build)", async () => {
  assert(projects.length >= 6, `${projects.length} projects`);
  for (const [label, list] of [["production", projects], ["QA", qaProjects]] as const) {
    eq([new Set(list.map((p) => p.slug)).size, new Set(list.map((p) => p.id)).size], [list.length, list.length], `${label}: unique`);
    for (const p of list) {
      for (const k of ["summary", "body", "location", "scope", "period", "durationWeeks"] as const) assert(p[k] !== undefined, `${label} ${p.id}: ${k} missing`);
      assert(/[가-힣]/.test(p.title) && /[가-힣]/.test(p.summary!), `${label} ${p.id}: not Korean`);
    }
  }
  // the optional fields really are exercised both ways on the QA corpus (bi-18: no keywords; bi-09…: cover only)
  assert(qaProjects.some((p) => p.keywords === undefined) && qaProjects.some((p) => p.galleryGroups === undefined) && qaProjects.some((p) => p.galleryGroups !== undefined), "optional gallery / keywords not exercised both ways");
  // the published demo: every record authors its own gallery (no cover-only record is customer-facing)
  eq(projects.filter((p) => p.galleryGroups === undefined).map((p) => p.id), [], "production records without a gallery");
  const flagship = projects.find((p) => p.id === FLAGSHIP)!;
  const count = flagship.galleryGroups!.reduce((n, g) => n + g.items.length, 0);
  assert(count >= 10 && count <= 14, `flagship gallery ${count}`);
  for (const room of ["현관", "거실", "주방", "침실", "욕실"]) assert(flagship.galleryGroups!.some((g) => g.name.includes(room)), `flagship room ${room}`);
  await assertVisuals("current package", demo.site, html, await demoPackagedProjects(repoRoot, projects));
});
await check("M every internal link of every generated page resolves inside the package; every project of the package has its detail page (pre-publish: the V0.1 package's own records, demo-rollout.ts)", async () => {
  const files = new Set(await walkFiles(demo.site));
  const resolves = (p: string) => files.has(p.slice(1)) || files.has(`${p.slice(1)}.html`) || files.has(`${p.slice(1)}/index.html`.replace(/^\//, "")) || p === "/";
  for (const [f, h] of Object.entries(html)) {
    for (const m of h.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/g)) assert(resolves(m[1]!), `${f}: dead link ${m[1]}`);
  }
  // every project once steady; pre-publish, the records the frozen V0.1 package was built from (the
  // V0.2 corpus's pages are integration.test.ts T1's: a real build, 19/19 detail pages)
  const packaged = await demoPackagedProjects(repoRoot, projects);
  for (const p of packaged) assert(html[`portfolio/${p.slug}.html`], `no page for ${p.slug}`);
  eq(htmlFiles.filter((f) => f.startsWith("portfolio/")).length, packaged.length, "detail pages");
});
await check(`Z header navigation exposes only real routes (${ia ? "home, /portfolio, /3d-portfolio, /about, /contact — each an emitted page" : "home, /portfolio, contact"}): no Service / FAQ / Journal${ia ? "" : " / About"}`, async () => {
  const header = /<header[\s\S]*?<\/header>/.exec(html["index.html"]!)?.[0] ?? "";
  const hrefs = [...header.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
  if (ia) {
    eq(hrefs, ["/", "/portfolio", "/3d-portfolio", "/about", "/contact"], "header hrefs");
    for (const h of hrefs.slice(1)) assert(html[`${h.slice(1)}.html`], `${h}: no page`);
    return;
  }
  assert(hrefs.length >= 3 && hrefs.every((h) => h === "/" || h === "/portfolio" || h.startsWith("mailto:")), hrefs.join(", "));
});
await check("Q+R the demo uses the ONE canonical projects collection: content/ holds only the platform documents, home A and B are two selections of projects.json, no second collection anywhere", async () => {
  eq((await readdir(path.join(demoDir, "content"))).filter((f) => !f.startsWith(".")).sort(), ["banners.json", "business.json", "categories.json", "projects.json", "reviews.json"], "content documents");
  eq(Object.keys(snapshot.content).sort(), ["banners", "business", "categories", "projects", "reviews"], "snapshot content keys");
  const ids = new Set(projects.map((p) => p.id));
  const a = settings.overrides["home.projects-a"].selection, b = settings.overrides["home.projects-b"].selection;
  eq([a.mode, b.mode, settings.overrides["home.projects-b"].enabled], ["manual", "manual", true], "selections");
  for (const id of [...a.ids, ...b.ids]) assert(ids.has(id), `selection id ${id} is not in projects.json`);
  assert(a.ids.every((id: string) => !b.ids.includes(id)), "A and B overlap");
  for (const f of await walkFiles(demoDir)) assert(!/projects?[-_]?[ab]\b|projectsA|projectsB/i.test(f), `second collection file ${f}`);
  const home = html["index.html"]!;
  const sec = (key: string) => new RegExp(`data-section="${key.replace(".", "\\.")}"[\\s\\S]*?</section>`).exec(home)?.[0] ?? "";
  for (const [key, sel] of [["home.projects-a", a], ["home.projects-b", b]] as const) {
    const got = [...sec(key).matchAll(/href="\/portfolio\/([a-z0-9-]+)"/g)].map((m) => m[1]!).filter((s, i, all) => all.indexOf(s) === i);
    eq(got, sel.ids.map((id: string) => projects.find((p) => p.id === id)!.slug), `${key} cards`);
  }
});

// -------------------------------------------------------------- filters --
console.log("\n[filter] the unchanged filter contract against Korean demo content");
/**
 * N's expected ids are LITERALS for the canonical 19-record corpus, derived from the authored records by the
 * documented semantics (OR within a dimension, AND across; 평 buckets; 평당 KRW buckets on AUTHORED
 * pricePerArea only; keyword tokens over title / summary / location / scope / keywords) — computed
 * independently of the evaluator under test, never by calling it (38-).
 */
await check("N keyword / type / area / style / price / sort / combined / zero-result on the 19-record QA corpus (production + the TEST_ONLY synthetic fixture), evaluated by the platform evaluator with the site's own scales (pyeong, krw-pyeong), against explicit expected ids", async () => {
  eq(settings.overrides["portfolio.index"], { areaScale: "pyeong", priceScale: "krw-pyeong" }, "portfolio.index settings");
  eq(qaProjects.length, 19, "the QA corpus these literals describe");
  const records = qaProjects.map((p) => toProjectFilterRecord({ ...p, category: p.category }));
  const categories = (await readJson(path.join(demoDir, "content/categories.json"))).items;
  const vocab = buildProjectFilterVocabulary(records, { groups: ["keyword", "type", "area", "style", "price"], categories, areaScale: "pyeong", priceScale: "krw-pyeong" });
  eq(vocab.groups, ["keyword", "type", "area", "style", "price"], "active groups");
  eq(vocab.area!.buckets.map((b) => b.id), ["lt20", "20", "30", "40", "50plus"], "area buckets in use");
  eq(vocab.price!.buckets.map((b) => b.id), ["lt180", "180", "250", "300"], "price buckets in use");
  eq(vocab.types.map((t) => t.id), ["full-remodel", "kitchen-bath", "move-in-styling", "partial-remodel"], "types in use");
  eq(vocab.styles, ["화이트", "모던", "내추럴", "간접조명", "그레이지", "우드 포인트", "미니멀", "수납 특화", "베이지", "월넛", "웜 화이트", "이사 전 공사"], "styles by frequency");
  const run = (input: ProjectFilterInput) => evaluateProjectFilter(records, normalizeProjectFilter(input, vocab), vocab).map((r) => r.id);
  const set = (input: ProjectFilterInput) => run(input).sort();
  eq(set({ keyword: "수납" }), ["bi-01", "bi-03", "bi-07", "bi-10", "bi-12", "bi-18"], "keyword 수납");
  eq(set({ keyword: "수성구" }), ["bi-01", "bi-03", "bi-08", "bi-10", "bi-13"], "keyword 수성구 (location)");
  eq(set({ keyword: "중문" }), ["bi-01", "bi-06", "bi-10", "bi-13", "bi-18"], "keyword 중문 (scope)");
  eq(set({ keyword: "욕실 방수" }), ["bi-15"], "two keyword tokens = AND");
  eq(set({ type: ["kitchen-bath"] }), ["bi-04", "bi-14", "bi-15", "bi-16"], "type");
  eq(set({ area: ["30"] }), ["bi-01", "bi-04", "bi-06", "bi-09", "bi-10", "bi-16", "bi-17", "bi-18", "bi-19"], "area 30평대 (bi-17's 112 m² → 33.9평 by unit conversion; bi-14's 84 m² → 25.4평 is not)");
  eq(set({ area: ["lt20", "50plus"] }), ["bi-07", "bi-08"], "area OR");
  eq(set({ style: ["그레이지"] }), ["bi-03", "bi-08", "bi-10", "bi-13"], "style");
  eq(set({ price: ["250"] }), ["bi-01", "bi-05", "bi-07"], "price 250–300만 (authored 평당 prices only)");
  eq(set({ type: ["full-remodel"], style: ["화이트"], area: ["30"] }), ["bi-01", "bi-09"], "combined");
  eq(set({ type: ["partial-remodel"], area: ["30"] }), ["bi-06", "bi-17", "bi-18", "bi-19"], "combined partial + 30평대");
  eq(set({ keyword: "한옥" }), [], "zero result");
  eq(run({ sort: "area-desc" }).slice(0, 3), ["bi-08", "bi-13", "bi-03"], "largest first");
  eq(run({ sort: "area-desc" }).at(-1), "bi-15", "a project without an area sorts last");
  eq(run({ sort: "price-asc" }), ["bi-08", "bi-02", "bi-05", "bi-07", "bi-01", "bi-03", "bi-04", "bi-06", "bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-14", "bi-15", "bi-16", "bi-17", "bi-18", "bi-19"], "cheapest first; the 13 projects without an authored price last, in default order");
  eq(run({}), ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08", "bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-14", "bi-15", "bi-16", "bi-17", "bi-18", "bi-19"], "default = newest first");
});
/**
 * N·production: the same contract over what the published demo serves (bi-01 … bi-08). Literals written
 * from the eight authored records, never by calling the evaluator: keywords 화이트 ×5 (01 02 04 06 07),
 * 간접조명 ×3 (01 06 08), 모던 ×3 (03 04 08), 미니멀 ×3 (01 06 07), 수납 특화 ×3 (01 03 07), 그레이지 ×2
 * (03 08), 내추럴 ×2 (02 05), 우드 포인트 ×2 (02 05); areas 34 · 24 · 42 · 32 · 29 · 34 · 19 · 51 평; authored
 * 평당 prices 290 · 240 · 320 · — · 260 · — · 270 · 160만; categories full-remodel 01 02 03 05 07,
 * kitchen-bath 04, partial-remodel 06, move-in-styling 08; publishedAt newest first = bi-01 … bi-08.
 */
await check("N·production keyword / type / area / style / price / sort / combined / zero-result on the PRODUCTION corpus (bi-01 … bi-08), evaluated by the platform evaluator with the site's own scales, against explicit expected ids", async () => {
  eq(projects.map((p) => p.id), ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08"], "the production corpus these literals describe");
  const records = projects.map((p) => toProjectFilterRecord({ ...p, category: p.category }));
  const categories = (await readJson(path.join(demoDir, "content/categories.json"))).items;
  const vocab = buildProjectFilterVocabulary(records, { groups: ["keyword", "type", "area", "style", "price"], categories, areaScale: "pyeong", priceScale: "krw-pyeong" });
  eq(vocab.groups, ["keyword", "type", "area", "style", "price"], "active groups");
  eq(vocab.area!.buckets.map((b) => b.id), ["lt20", "20", "30", "40", "50plus"], "area buckets in use");
  eq(vocab.price!.buckets.map((b) => b.id), ["lt180", "180", "250", "300"], "price buckets in use");
  eq(vocab.types.map((t) => t.id), ["full-remodel", "kitchen-bath", "move-in-styling", "partial-remodel"], "types in use");
  eq(vocab.styles, ["화이트", "간접조명", "모던", "미니멀", "수납 특화", "그레이지", "내추럴", "우드 포인트"], "styles by frequency, then code point");
  const run = (input: ProjectFilterInput) => evaluateProjectFilter(records, normalizeProjectFilter(input, vocab), vocab).map((r) => r.id);
  const set = (input: ProjectFilterInput) => run(input).sort();
  eq(set({ keyword: "수납" }), ["bi-01", "bi-03", "bi-07"], "keyword 수납");
  eq(set({ keyword: "수성구" }), ["bi-01", "bi-03", "bi-08"], "keyword 수성구 (location)");
  eq(set({ keyword: "중문" }), ["bi-01", "bi-06"], "keyword 중문 (scope)");
  eq(set({ keyword: "욕실 방수" }), [], "two keyword tokens = AND (no production record has both)");
  eq(set({ type: ["kitchen-bath"] }), ["bi-04"], "type");
  eq(set({ area: ["30"] }), ["bi-01", "bi-04", "bi-06"], "area 30평대");
  eq(set({ area: ["lt20", "50plus"] }), ["bi-07", "bi-08"], "area OR");
  eq(set({ style: ["그레이지"] }), ["bi-03", "bi-08"], "style");
  eq(set({ price: ["250"] }), ["bi-01", "bi-05", "bi-07"], "price 250–300만 (authored 평당 prices only)");
  eq(set({ type: ["full-remodel"], style: ["화이트"], area: ["30"] }), ["bi-01"], "combined");
  eq(set({ type: ["partial-remodel"], area: ["30"] }), ["bi-06"], "combined partial + 30평대");
  eq(set({ keyword: "한옥" }), [], "zero result");
  eq(run({ sort: "area-desc" }).slice(0, 3), ["bi-08", "bi-03", "bi-01"], "largest first (bi-01 before bi-06 at 34평: newer)");
  eq(run({ sort: "area-desc" }).at(-1), "bi-07", "smallest last (every production record states an area)");
  eq(run({ sort: "price-asc" }), ["bi-08", "bi-02", "bi-05", "bi-07", "bi-01", "bi-03", "bi-04", "bi-06"], "cheapest first; bi-04 / bi-06 (no authored price) last, in default order");
  eq(run({}), ["bi-01", "bi-02", "bi-03", "bi-04", "bi-05", "bi-06", "bi-07", "bi-08"], "default = newest first");
});

// ------------------------------------------------------------------ CTA --
console.log("\n[cta] the site-wide floating seat");
/** Next's own error documents (app/not-found.tsx): emitted by every static export, never a planned route. */
const NEXT_ERROR_PAGES = ["404.html", "_not-found.html"];
/**
 * The seat is the demo's floating CTA unless its settings turn it off — which the demo does only
 * because a declared head script (the chat launcher, scripts.json) takes that bottom-right seat
 * (FloatingCta's replacement seam). Off without a declared script fails.
 */
const seatOn = settings.overrides?.["site.floating-cta"]?.enabled !== false;
await check(`O exactly one floating CTA on EVERY generated page — or none on any page while a declared head script takes the seat — the page set is the route plan of the package's own records${ia ? " (home, portfolio, details, 3D, about, contact)" : ""} + Next's error pages — Korean label, ${ia ? "→ /contact" : "the business mailto"}`, async () => {
  // expected side: the declared routes planned over the records the current package was built from
  // (the whole corpus once steady, the V0.1 package's own records pre-publish) — never the build output
  const packaged = new Set((await demoPackagedProjects(repoRoot, projects)).map((p) => p.id));
  const plan = planRoutes(template.routes, createContentReader({ ...snapshot.content, projects: snapshot.content.projects.filter((p) => packaged.has(p.id)) }));
  const planned = plan.routes.flatMap((r) => r.paths).map((p) => (p === "/" ? "index.html" : `${p.slice(1)}.html`));
  eq(planned.filter((f) => f.startsWith("portfolio/")).length, packaged.size, "one planned detail page per packaged record");
  eq([...htmlFiles].sort(), [...planned, ...NEXT_ERROR_PAGES].sort(), "generated pages = planned pages + error pages");
  if (!seatOn) assert(declaredScripts.length > 0, "the floating CTA is off but no declared head script takes its seat");
  for (const [f, h] of Object.entries(html)) eq(ctasOf(h), seatOn ? [{ href: CONTACT_HREF, label: "상담 문의" }] : [], f);
});

// --------------------------------------------------- banners / reviews --
console.log("\n[models] banners@1 (provisional) and reviews@1 carry the demo unchanged");
await check("S banners@1 unchanged and sufficient: 3 slides = image + headline + text + closed CTA (2 project targets, 1 contact); all render with live destinations", async () => {
  const doc = BannersDocSchema.parse(await readJson(path.join(demoDir, "content/banners.json")));
  eq(doc.items.map((b) => [Object.keys(b).sort().join(), b.cta!.target.kind]), [["cta,headline,id,image,status,text", "project"], ["cta,headline,id,image,status,text", "project"], ["cta,headline,id,image,status,text", "contact"]], "slide shape");
  const hero = /data-section="home\.hero"[\s\S]*?<\/section>/.exec(html["index.html"]!)?.[0] ?? "";
  for (const b of doc.items) {
    assert(hero.includes(b.headline!) && hero.includes(b.text!) && hero.includes(b.cta!.label), `${b.id} not rendered`);
    const t = b.cta!.target;
    const href = t.kind === "project" ? `/portfolio/${projects.find((p) => p.id === t.project)!.slug}` : CONTACT_HREF;
    assert(hero.includes(`href="${href}"`), `${b.id}: CTA destination ${href} not rendered`);
  }
  eq(demo.record.preflight.warnings, [], "builder warnings (dropped destinations)");
});
await check("T reviews@1 unchanged: 6 published reviews, none attributed to a personal name, all rendered on the home page in stored order", async () => {
  const doc = ReviewsDocSchema.parse(await readJson(path.join(demoDir, "content/reviews.json")));
  eq([doc.items.length, doc.items.every((r) => r.status === "published")], [6, true], "reviews");
  for (const r of doc.items) assert(/평 아파트/.test(r.attribution ?? "") && !/[가-힣]{2,4}\s*(님|씨|고객)/.test(r.attribution ?? ""), `${r.id}: attribution "${r.attribution}"`);
  const sec = /data-section="home\.reviews"[\s\S]*?<\/section>/.exec(html["index.html"]!)?.[0] ?? "";
  const at = doc.items.map((r) => sec.indexOf(r.text));
  assert(at.every((i) => i >= 0) && at.every((v, i) => i === 0 || v > at[i - 1]!), `order ${at.join(",")}`);
});

// ---------------------------------------------------- identity / theme --
console.log("\n[identity] Korean identity, SEO data and theme through declared inputs only");
await check("X <html lang=ko-KR>, brand title, Korean description, list/detail canonicals on the demo origin, sitemap lists every page (pre-publish: of the V0.1 package's own records, demo-rollout.ts)", async () => {
  // every project once steady; pre-publish, the records the frozen V0.1 package was built from
  const packaged = await demoPackagedProjects(repoRoot, projects);
  const home = html["index.html"]!;
  assert(/<html[^>]*lang="ko-KR"/.test(home), "lang");
  assert(/<title>[^<]*부스트 인테리어[^<]*<\/title>/.test(home), "title");
  assert(/<meta name="description" content="생활에 맞춘 설계로[^"]*"/.test(home), "description");
  // The Template emits a canonical on the pages that call pageMetadata (list + detail); before 1.5.2 the home
  // page had none and no page had OG tags (06-open-items O4) — 1.5.2 adds both, asserted by ia152.test.ts.
  assert(html["portfolio.html"]!.includes(`<link rel="canonical" href="${ORIGIN}/portfolio"/>`), "list canonical");
  for (const p of packaged) assert(html[`portfolio/${p.slug}.html`]!.includes(`<link rel="canonical" href="${ORIGIN}/portfolio/${p.slug}"/>`), `${p.slug} canonical`);
  assert(/<title>[^<]*수성 화이트 34평[^<]*부스트 인테리어<\/title>/.test(html[`portfolio/${projects.find((p) => p.id === FLAGSHIP)!.slug}.html`]!), "detail title");
  const sitemap = await readFile(path.join(demo.site, "sitemap.xml"), "utf8");
  eq((sitemap.match(/<loc>/g) ?? []).length, 2 + packaged.length + (ia ? 3 : 0), "sitemap entries");
});
await check("W theme = declared tokens only: every site token is consumed by the Template, resolves, and reaches the package stylesheet/markup", async () => {
  const theme = await readJson(path.join(demoDir, "theme.json"));
  const effective = resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, theme);
  for (const [k, v] of Object.entries(theme.tokens)) eq(effective[k as keyof typeof effective], v, k);
  assert(theme.tokens["color.action.primary"] !== (template.theme.defaults as { tokens: Record<string, string> }).tokens["color.action.primary"], "accent equals the template default");
  const all = texts.map((t) => t.text).join("\n");
  assert(all.includes("--color-action-primary:rgb(184, 84, 22)") && all.includes("--color-canvas:rgb(250, 248, 244)"), "theme variables not in the package");
});
await check("Y every demo document is declared fictional (origin synthetic-fixture), never 'customer' or 'reference-fixture'", async () => {
  for (const f of ["content/business.json", "content/projects.json", "content/categories.json", "content/reviews.json", "content/banners.json", "assets/registry.json"]) {
    eq((await readJson(path.join(demoDir, f))).origin, "synthetic-fixture", f);
  }
});

// ------------------------------------------------------------ throwaway --
console.log("\n[integration] throwaway-root builds (reproducibility, seat off)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "step6-root-"));
const qaRoot = await mkdtemp(path.join(os.tmpdir(), "step6-qa-root-"));
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const at = demo.record.at;
  /** html page count of U's rebuild — the ON build of the demo's own inputs (P's reference pre-publish) */
  let rebuiltPages: number | undefined;
  /** U's rebuild: the pinned release over the demo's own inputs (the whole corpus) — H·build / L·build */
  let rebuiltSite: string | undefined;
  await check("U reproducible: same release + snapshot + settings + theme + assets → same buildInputId (twice, and = current), and an independent rebuild gives the same packageHash (pre-publish, and for the incrementally published demo whose current package is its shell: = a second independent rebuild, demo-rollout.ts)", async () => {
    // Pre-publish (Portfolio V0.2 window) the current package is the frozen V0.1 one, not built from
    // these inputs, so "= current" becomes "= a second independent rebuild on its own root".
    // The incrementally published demo (INCREMENTAL): its current package is a SHELL — held to the
    // site's own build identity right here — and the ordinary build of these inputs is, like
    // pre-publish, held to a second independent rebuild.
    const rollout = (await demoRollout(repoRoot)).state;
    const pre = later && rollout !== "POST_PUBLISH_STEADY";
    if (rollout === "INCREMENTAL") {
      const shell = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at });
      eq(shell.buildInputId, (await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"))).buildInputId, "the shell package = the site's own build identity");
    }
    const [a, b] = await Promise.all([1, 2].map(() => prepareSiteInput({ repoRoot: frozen.root, siteId: DEMO, mode: "public", at })));
    const want = pre ? a!.buildInputId : demo.record.buildInputId;
    eq([a!.buildInputId, b!.buildInputId], [want, want], "buildInputId");
    await cp(demoDir, path.join(tmpRoot, "data/sites", DEMO), { recursive: true });
    const r = await buildSite({ repoRoot: tmpRoot, siteId: DEMO, at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    let ref: { buildInputId: string; packageHash: string } = demo.record;
    if (pre) {
      const root2 = await mkdtemp(path.join(os.tmpdir(), "step6-root2-"));
      try {
        await mkdir(path.join(root2, "data/sites"), { recursive: true });
        await symlink(path.join(repoRoot, "data/template-releases"), path.join(root2, "data/template-releases"));
        await symlink(path.join(repoRoot, "node_modules"), path.join(root2, "node_modules"));
        await cp(demoDir, path.join(root2, "data/sites", DEMO), { recursive: true });
        const r2 = await buildSite({ repoRoot: root2, siteId: DEMO, at });
        assert(r2.status === "built" && r2.record.qa.pass, `second rebuild: ${r2.status}`);
        ref = r2.record;
      } finally {
        await rm(root2, { recursive: true, force: true });
      }
    }
    eq([r.record.buildInputId, r.record.packageHash], [want, ref.packageHash], "independent rebuild");
    rebuiltPages = (await walkFiles(path.join(r.packageDir, "site"))).filter((f) => f.endsWith(".html")).length;
    rebuiltSite = path.join(r.packageDir, "site");
  });
  await check("P no CTA when the configuration disables it: site.floating-cta.enabled = false → no seat on ANY page, nothing else about the pages' count changes", async () => {
    // the reference is the ON build of the same inputs: the current package once steady, U's rebuild
    // in the Portfolio V0.2 pre-publish window (the current package is the frozen V0.1 one)
    const pre = later && (await demoRollout(repoRoot)).state === "PRE_PUBLISH_TRANSITION";
    assert(!pre || rebuiltPages !== undefined, "U's rebuild (P's reference pre-publish) did not complete");
    const onPages = pre ? rebuiltPages! : htmlFiles.length;
    const dir = path.join(tmpRoot, "data/sites/boost-off");
    await cp(demoDir, dir, { recursive: true });
    const site = await readJson(path.join(dir, "site.json"));
    site.siteId = "boost-off";
    await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
    const s = await readJson(path.join(dir, "settings.json"));
    s.overrides["site.floating-cta"] = { enabled: false };
    await writeFile(path.join(dir, "settings.json"), `${JSON.stringify(s, null, 2)}\n`);
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "boost-off", at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    const off = path.join(r.packageDir, "site");
    const pages = (await walkFiles(off)).filter((f) => f.endsWith(".html"));
    eq(pages.length, onPages, "page count");
    for (const f of pages) assert(!(await readFile(path.join(off, f), "utf8")).includes("i1-fcta"), `${f}: seat rendered while disabled`);
  });
  const detailsOf = async (site: string | undefined, records: readonly Project[], what: string) => {
    assert(site, `${what} did not complete`);
    return Object.fromEntries(await Promise.all(records.map(async (p) => [`portfolio/${p.slug}.html`, await readFile(path.join(site, `portfolio/${p.slug}.html`), "utf8").catch(() => "")] as const)));
  };
  const rebuiltDetails = () => detailsOf(rebuiltSite, projects, "U's rebuild");
  /** the pinned release over the QA corpus (production + the TEST_ONLY synthetic fixture), on its own throwaway root — H·build / L·build's synthetic witnesses */
  let qaSite: string | undefined;
  await check("Q·build the pinned release over the QA corpus (the composed projects.json written into a throwaway root only — never data/sites): built, package QA pass, one detail page per QA record (19)", async () => {
    await mkdir(path.join(qaRoot, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(qaRoot, "data/template-releases"));
    await symlink(path.join(repoRoot, "node_modules"), path.join(qaRoot, "node_modules"));
    await cp(demoDir, path.join(qaRoot, "data/sites", DEMO), { recursive: true });
    await writeQaProjects(repoRoot, path.join(qaRoot, "data/sites", DEMO));
    const r = await buildSite({ repoRoot: qaRoot, siteId: DEMO, at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    qaSite = path.join(r.packageDir, "site");
    const details = (await walkFiles(qaSite)).filter((f) => /^portfolio\/[^/]+\.html$/.test(f)).sort();
    eq(details, qaProjects.map((p) => `portfolio/${p.slug}.html`).sort(), "QA detail pages");
    eq(details.length, 19, "19 QA detail pages");
  });
  const qaDetails = () => detailsOf(qaSite, qaProjects, "the QA build");
  await check("H·build the pinned release over the WHOLE production corpus (U's rebuild) and over the QA corpus (Q·build): every present area under its own basis label with the authored figure — bi-14 전용면적 84 m², bi-17 공급면적 112 m² — and no area row for bi-15 (QA witnesses)", async () => {
    assertAreaRows("pinned release", await rebuiltDetails(), projects);
    const pages = await qaDetails();
    assertAreaRows("QA build", pages, qaProjects);
    const page = (id: string) => pages[`portfolio/${qaProjects.find((p) => p.id === id)!.slug}.html`]!;
    eq([areaRowOf(page("bi-14")), areaRowOf(page("bi-17")), areaRowOf(page("bi-15"))], [["전용면적", "84 m²"], ["공급면적", "112 m²"], undefined], "witnesses");
  });
  await check("L·build the pinned release over the WHOLE production corpus (U's rebuild) and over the QA corpus (Q·build): every detail page renders a usable visual — its full gallery, or exactly its cover for the V0.2 cover-only records (QA) — with no broken image", async () => {
    await assertVisuals("pinned release", rebuiltSite!, await rebuiltDetails(), projects);
    await assertVisuals("QA build", qaSite!, await qaDetails(), qaProjects);
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
  await rm(qaRoot, { recursive: true, force: true });
}

console.log(`\nstep6: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
