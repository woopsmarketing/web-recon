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
import { buildSiteSnapshot, loadSiteInstance } from "../site/load";
import { resolveEffectiveTheme } from "../theme/theme";
import { hashJson, sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { gitDirtyPaths } from "./git-checkout";
import { isPublishSurface } from "./publish-surface";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
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
/** Same tree hash as platform/test/step6-proof.ts (path + sha256 of every file). */
async function treeHash(rel: string, skipTop: readonly string[] = [], skip: (p: string) => boolean = () => false): Promise<string> {
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
  return hashJson(out);
}
const pointer = async (s: string) => {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", s, "current.json"));
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
const demoDir = path.join(repoRoot, "data/sites", DEMO);
const demo = await pointer(DEMO);
const projectsDoc = ProjectsDocSchema.parse(await readJson(path.join(demoDir, "content/projects.json")));
const projects = projectsDoc.items as Project[];
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
await check("A boost-interior-demo exists as its own Site Instance (siteId, Korean identity, own origin); fixtures are separate directories", async () => {
  const site = await loadSiteInstance(repoRoot, DEMO);
  eq([site.siteId, site.identity.brandName, site.identity.locale], [DEMO, "부스트 인테리어", "ko-KR"], "identity");
  // its own https origin, shared with no fixture (the value itself is Site Data; the package checks G / X hold the output to it)
  assert(site.identity.publicOrigin === ORIGIN && new URL(ORIGIN).protocol === "https:", String(site.identity.publicOrigin));
  for (const f of FIXTURES) assert((await loadSiteInstance(repoRoot, f)).identity.publicOrigin !== ORIGIN, `${f} shares the demo origin`);
  eq((await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort(), [DEMO, ...FIXTURES].sort(), "data/sites");
});
await check(`B pins EXACTLY ${later ? "ONE newer verified release (each fixture pins its own verified release)" : RELEASE.id} (id + full hash), and the current package was built with it`, async () => {
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
  eq([demo.record.template.releaseId, demo.record.template.releaseHash, demo.record.status, demo.record.qa.pass], [PIN.releaseId, PIN.releaseHash, "success", true], "build record");
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
  eq([liveHash, liveHash], [rel.templateSourceHash, demo.record.template.templateSourceHash], "templateSourceHash");
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
  eq(await treeHash("platform", ["test"], (p) => p === "publish" || isPublishSurface(p)), baseline.trees["platform (test/ excluded)"].hash, "platform tree (test/ excluded)");
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
      if (root === "platform" && (f.startsWith("test/") || isPublishSurface(f))) continue;
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
await check("F no fixture identity anywhere in the demo package or its site documents: fixed patterns + every fixture's own brand, legal name, e-mail, origin, project ids and titles (read from the fixtures)", async () => {
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
  const scan = (where: string, text: string) => {
    assert(!bad.test(text), `${where}: ${bad.exec(text)?.[0]}`);
    const lower = text.toLowerCase();
    for (const t of tokens) assert(!lower.includes(t), `${where}: fixture token "${t}"`);
  };
  for (const t of texts) scan(t.file, t.text);
  for (const f of await walkFiles(demoDir)) if (/\.(json|svg)$/.test(f)) scan(`site doc ${f}`, await readFile(path.join(demoDir, f), "utf8"));
});
await check("G no Apartmentary leakage: the release's frozen forbidden terms + the source brand (ko/en) are absent; package QA passed; no absolute URL leaves the site origin", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", PIN.releaseId);
  const terms = [...rel.forbiddenTerms, "apartmentary", "아파트멘터리"].map((t) => t.toLowerCase());
  assert(terms.length >= 2, "no forbidden terms to scan");
  for (const t of texts) for (const term of terms) assert(!t.text.toLowerCase().includes(term), `${t.file}: "${term}"`);
  assert(demo.record.qa.pass === true && (demo.record.qa.failures ?? []).length === 0, "package QA");
  for (const [f, h] of Object.entries(html)) {
    for (const m of h.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) assert(new URL(m[1]!).origin === ORIGIN, `${f}: ${m[1]}`);
  }
});

// --------------------------------------------------------- area basis --
console.log("\n[area] Korean area-basis contract");
await check("H the 34평 flagship is { 34, pyeong, basis: supply }; EVERY project states a basis (none unknown); the 공급면적 label is true for every project", async () => {
  const flagship = projects.find((p) => p.id === FLAGSHIP)!;
  eq(flagship.area, { value: 34, unit: "pyeong", basis: "supply" }, "flagship area");
  for (const p of projects) assert(p.area && p.area.basis !== undefined && areaBasisOf(p.area) !== "unknown", `${p.id}: basis not stated`);
  assert(slots.values["portfolio.detail"].areaLabel === "공급면적", "detail area label");
  for (const p of projects) assert(areaBasisOf(p.area!) === "supply", `${p.id}: label says 공급면적 but basis is ${areaBasisOf(p.area!)}`);
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
  for (const p of projects) for (const s of [p.title, p.summary ?? "", ...(p.body ?? [])]) assert(!equiv.test(s), `${p.id}: ${s.slice(0, 40)}`);
  // every other card/list surface shows the authored figure too
  assert(!/84/.test(visibleText(mainOf(html["portfolio.html"]!))), "84 on the portfolio list");
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
const { snapshot } = await buildSiteSnapshot({ repoRoot, siteId: DEMO, mode: "public", at: demo.record.at });
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
await check("L all published project slugs (and ids) are unique; ≥ 6 projects; every project has the Step 6 data-quality fields", async () => {
  assert(projects.length >= 6, `${projects.length} projects`);
  eq([new Set(projects.map((p) => p.slug)).size, new Set(projects.map((p) => p.id)).size], [projects.length, projects.length], "unique");
  for (const p of projects) {
    for (const k of ["summary", "body", "location", "area", "scope", "keywords", "galleryGroups", "period", "durationWeeks"] as const) assert(p[k] !== undefined, `${p.id}: ${k} missing`);
    assert(/[가-힣]/.test(p.title) && /[가-힣]/.test(p.summary!), `${p.id}: not Korean`);
  }
  const flagship = projects.find((p) => p.id === FLAGSHIP)!;
  const count = flagship.galleryGroups!.reduce((n, g) => n + g.items.length, 0);
  assert(count >= 10 && count <= 14, `flagship gallery ${count}`);
  for (const room of ["현관", "거실", "주방", "침실", "욕실"]) assert(flagship.galleryGroups!.some((g) => g.name.includes(room)), `flagship room ${room}`);
});
await check("M every internal link of every generated page resolves inside the package; every project has its detail page", async () => {
  const files = new Set(await walkFiles(demo.site));
  const resolves = (p: string) => files.has(p.slice(1)) || files.has(`${p.slice(1)}.html`) || files.has(`${p.slice(1)}/index.html`.replace(/^\//, "")) || p === "/";
  for (const [f, h] of Object.entries(html)) {
    for (const m of h.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/g)) assert(resolves(m[1]!), `${f}: dead link ${m[1]}`);
  }
  for (const p of projects) assert(html[`portfolio/${p.slug}.html`], `no page for ${p.slug}`);
  eq(htmlFiles.filter((f) => f.startsWith("portfolio/")).length, projects.length, "detail pages");
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
await check("N keyword / type / area / style / price / sort / combined / zero-result, evaluated by the platform evaluator with the site's own scales (pyeong, krw-pyeong)", async () => {
  eq(settings.overrides["portfolio.index"], { areaScale: "pyeong", priceScale: "krw-pyeong" }, "portfolio.index settings");
  const records = projects.map((p) => toProjectFilterRecord({ ...p, category: p.category }));
  const categories = (await readJson(path.join(demoDir, "content/categories.json"))).items;
  const vocab = buildProjectFilterVocabulary(records, { groups: ["keyword", "type", "area", "style", "price"], categories, areaScale: "pyeong", priceScale: "krw-pyeong" });
  eq(vocab.groups, ["keyword", "type", "area", "style", "price"], "active groups");
  eq(vocab.area!.buckets.map((b) => b.id), ["lt20", "20", "30", "40", "50plus"], "area buckets in use");
  eq(vocab.price!.buckets.map((b) => b.id), ["lt180", "180", "250", "300"], "price buckets in use");
  assert(vocab.types.length === 4 && vocab.styles.length >= 6, `types ${vocab.types.length}, styles ${vocab.styles.length}`);
  const run = (input: ProjectFilterInput) => evaluateProjectFilter(records, normalizeProjectFilter(input, vocab), vocab).map((r) => r.id);
  const set = (input: ProjectFilterInput) => run(input).sort();
  eq(set({ keyword: "수납" }), ["bi-01", "bi-03", "bi-07"], "keyword 수납");
  eq(set({ keyword: "수성구" }), ["bi-01", "bi-03", "bi-08"], "keyword 수성구 (location)");
  eq(set({ keyword: "중문" }), ["bi-01", "bi-06"], "keyword 중문 (scope)");
  eq(set({ type: ["kitchen-bath"] }), ["bi-04"], "type");
  eq(set({ area: ["30"] }), ["bi-01", "bi-04", "bi-06"], "area 30평대");
  eq(set({ area: ["lt20", "50plus"] }), ["bi-07", "bi-08"], "area OR");
  eq(set({ style: ["그레이지"] }), ["bi-03", "bi-08"], "style");
  eq(set({ price: ["250"] }), ["bi-01", "bi-05", "bi-07"], "price 250–300만");
  eq(set({ type: ["full-remodel"], style: ["화이트"], area: ["30"] }), ["bi-01"], "combined");
  eq(set({ keyword: "한옥" }), [], "zero result");
  eq(run({ sort: "area-desc" })[0], "bi-08", "largest first");
  eq(run({ sort: "price-asc" }).slice(0, 2), ["bi-08", "bi-02"], "cheapest first");
  eq(run({ sort: "price-asc" }).slice(-2).sort(), ["bi-04", "bi-06"], "projects without a price sort last");
  eq(run({}), [...projects].sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt)).map((p) => p.id), "default = newest first");
});

// ------------------------------------------------------------------ CTA --
console.log("\n[cta] the site-wide floating seat");
await check(`O exactly one floating CTA on EVERY generated page (home, portfolio, 8 details, 404${ia ? ", 3D, about, contact" : ""}), Korean label, ${ia ? "→ /contact" : "the business mailto"}`, async () => {
  assert(htmlFiles.length === (ia ? 15 : 12), `pages: ${htmlFiles.join(", ")}`);
  for (const [f, h] of Object.entries(html)) eq(ctasOf(h), [{ href: CONTACT_HREF, label: "상담 문의" }], f);
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
await check("X <html lang=ko-KR>, brand title, Korean description, list/detail canonicals on the demo origin, sitemap lists every page", async () => {
  const home = html["index.html"]!;
  assert(/<html[^>]*lang="ko-KR"/.test(home), "lang");
  assert(/<title>[^<]*부스트 인테리어[^<]*<\/title>/.test(home), "title");
  assert(/<meta name="description" content="생활에 맞춘 설계로[^"]*"/.test(home), "description");
  // The Template emits a canonical on the pages that call pageMetadata (list + detail); before 1.5.2 the home
  // page had none and no page had OG tags (06-open-items O4) — 1.5.2 adds both, asserted by ia152.test.ts.
  assert(html["portfolio.html"]!.includes(`<link rel="canonical" href="${ORIGIN}/portfolio"/>`), "list canonical");
  for (const p of projects) assert(html[`portfolio/${p.slug}.html`]!.includes(`<link rel="canonical" href="${ORIGIN}/portfolio/${p.slug}"/>`), `${p.slug} canonical`);
  assert(/<title>[^<]*수성 화이트 34평[^<]*부스트 인테리어<\/title>/.test(html[`portfolio/${projects.find((p) => p.id === FLAGSHIP)!.slug}.html`]!), "detail title");
  const sitemap = await readFile(path.join(demo.site, "sitemap.xml"), "utf8");
  eq((sitemap.match(/<loc>/g) ?? []).length, 2 + projects.length + (ia ? 3 : 0), "sitemap entries");
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
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const at = demo.record.at;
  await check("U reproducible: same release + snapshot + settings + theme + assets → same buildInputId (twice, and = current), and an independent rebuild gives the same packageHash", async () => {
    const [a, b] = await Promise.all([1, 2].map(() => prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at })));
    eq([a!.buildInputId, b!.buildInputId], [demo.record.buildInputId, demo.record.buildInputId], "buildInputId");
    await cp(demoDir, path.join(tmpRoot, "data/sites", DEMO), { recursive: true });
    const r = await buildSite({ repoRoot: tmpRoot, siteId: DEMO, at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    eq([r.record.buildInputId, r.record.packageHash], [demo.record.buildInputId, demo.record.packageHash], "independent rebuild");
  });
  await check("P no CTA when the configuration disables it: site.floating-cta.enabled = false → no seat on ANY page, nothing else about the pages' count changes", async () => {
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
    eq(pages.length, htmlFiles.length, "page count");
    for (const f of pages) assert(!(await readFile(path.join(off, f), "utf8")).includes("i1-fcta"), `${f}: seat rendered while disabled`);
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nstep6: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
