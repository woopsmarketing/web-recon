/**
 * Portfolio Content System V1 — the publisher side (platform/portfolio-sync, site:portfolio-sync).
 * Fast: no network beyond 127.0.0.1, no Cloudflare, no wrangler, no site build (the opt-in [e2e]
 * block at the end is the one exception and runs only with --e2e).
 *
 *   [generator]  valid, deterministic, idempotent; a removed project takes its now-unreferenced images
 *                with it; site-level assets and every other site file are untouched; collisions and
 *                every refusal of the contract fail closed and leave the directory as it was
 *   [guard]      the site loader refuses a hand-edited generated file and says where to edit instead;
 *                site-owned edits stay free; sites without the sidecar are exactly as before
 *   [lossless]   the demo dataset → export → generator → the same projects/categories, the same site
 *                snapshot hash, the same Portfolio Document version (968afbcc…)
 *   [client]     the HTTP client against an in-process fake BoostChat
 *   [verify]     present / absent / manifest against an in-process static server
 *   [cycle]      generate → build → publish → verify → report, with the failure paths
 *   [cli]        usage, the remote gate, dry run, offline input
 *   [truth]      what the build does when a removed project is still named by site configuration
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/portfolio-sync.test.ts [--e2e]   (pnpm test:portfolio-sync)
 */
import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareSiteInput } from "../build/site-build";
import { GOLDEN_INPUT } from "../cli/integration-golden";
import { createContentReader } from "../content/reader";
import { CategoriesDocSchema, ProjectsDocSchema, projectAssetRefs } from "../content/schema";
import { AssetRegistryDocSchema } from "../assets/assets";
import { emitIntegration } from "../integration/emit";
import { BoostChatError, createPublisherClient, RESULT_BODY_MAX } from "../portfolio-sync/client";
import { EXPORT_SCHEMA, RESULT_MESSAGE_MAX, RESULT_SCHEMA, STAGE_FAILURE_MESSAGE, PortfolioResultSchema, assetPathPrefix, exportPath, resultMessage, resultPath, type ExportAsset, type PortfolioResult } from "../portfolio-sync/contract";
import { applyFilePlan, planManagedPortfolio, PortfolioGenerateError, readSiteDirState, restoreAppliedPlan, validatePlanStaged, type PortfolioFilePlan } from "../portfolio-sync/generate";
import { MANAGED_FILE, MANAGED_SCHEMA, ManagedManifestSchema, SOURCE_MARKER_FILE, hasSourceMarker, managedPortfolioProblems, readManagedManifest, readPortfolioSource } from "../portfolio-sync/managed";
import { BACKOFF_CAP_MS, buildForSync, clientSource, fileSource, liveIsFor, nextFailureMemory, publishForSync, runCycle, runSync, type BuildOutcome, type CycleResult, type FailureMemory, type SyncOptions } from "../portfolio-sync/sync";
import { isLoopbackOrigin, verifyBaseOrigin, verifyPublic, type ExpectedFile, type VerifyOutcome } from "../portfolio-sync/verify";
import { MemoryStore } from "../publish/store";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot, SiteDataError } from "../site/load";
import { planRoutes } from "../site/routes";
import { hashJson, sha256 } from "../util/hash";
import { handle, type Env, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import template from "../../templates/interior-01/v1/template";
import { homeHero } from "../../templates/interior-01/v1/sections/homeHeroData";
import { FROZEN_DEMO_SITE_ID, frozenDemoRoot } from "./demo-frozen-dataset";

const repoRoot = process.cwd();
const E2E = process.argv.includes("--e2e");
const SITE = "fixture-small"; // any site works: nothing in platform/portfolio-sync names one
const ORIGIN = "https://fixture-small.example";
const TOKEN = "test-publisher-token-0123456789abcdef-NEVER-LOGGED";
/** the Portfolio Document version production serves today (the media 1.1 golden, integration.test.ts DEMO_VERSION) */
const PROD_VERSION = "968afbccb944940d8d3c099dd54df5be";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${String((error as Error).stack ?? error).split("\n").slice(0, 6).join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
async function rejects(fn: () => unknown | Promise<unknown>, re: RegExp, msg: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    assert(re.test((error as Error).message), `${msg}: wrong error "${(error as Error).message}"`);
    return error as Error;
  }
  throw new Error(`${msg}: did not throw`);
}
const exists = (p: string) => stat(p).then(() => true, () => false);
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));

const tmpRoots: string[] = [];
/** A throwaway repository root holding a copy of one site (data/sites and data/site-builds of the repo are never written). */
async function tempRoot(siteId: string, from = repoRoot): Promise<{ root: string; dir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-root-"));
  tmpRoots.push(root);
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  const dir = path.join(root, "data/sites", siteId);
  await cp(path.join(from, "data/sites", siteId), dir, { recursive: true });
  return { root, dir };
}
/** every file of a directory → sha256 */
async function digest(dir: string, rel = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, await digest(dir, r));
    else out[r] = sha256(await readFile(path.join(dir, r)));
  }
  return out;
}

// ----------------------------------------------------------------- test data --
const MAGIC = { "image/jpeg": [0xff, 0xd8, 0xff, 0xe0], "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/webp": [...Buffer.from("RIFF\0\0\0\0WEBP")] } as const;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
function image(mediaType: keyof typeof MAGIC, seed: string): Uint8Array {
  return new Uint8Array([...MAGIC[mediaType], ...Buffer.from(`synthetic test image ${seed} `.repeat(8))]);
}
interface TestAsset extends ExportAsset {
  bytes: Uint8Array;
}
function asset(id: string, mediaType: keyof typeof MAGIC = "image/jpeg", seed = id, file = `${id}.${EXT[mediaType]}`): TestAsset {
  const bytes = image(mediaType, seed);
  return { id, file, mediaType, width: 1600, height: 1200, sha256: sha256(bytes), size: bytes.length, href: `${assetPathPrefix(SITE)}${id}`, bytes };
}
function project(id: string, slug: string, cover: string, gallery: string[] = [], extra: Record<string, unknown> = {}) {
  return {
    id,
    slug,
    title: `테스트 프로젝트 ${id}`,
    status: "published",
    publishedAt: "2025-01-01T00:00:00Z",
    category: "residential",
    cover: { asset: cover },
    ...(gallery.length ? { galleryGroups: [{ name: "거실", items: gallery.map((a) => ({ image: { asset: a } })) }] } : {}),
    ...extra,
  };
}
const CATEGORIES = [{ id: "residential", name: "주거" }, { id: "commercial", name: "상업" }];
interface ExportParts {
  siteId?: string;
  publicOrigin?: string;
  revision?: number;
  liveRevision?: number;
  projects: unknown[];
  assets: TestAsset[];
  publishing?: string[];
  removing?: { id: string; slug: string }[];
  categories?: unknown[];
  schema?: string;
}
function makeExport(p: ExportParts) {
  return {
    schema: p.schema ?? EXPORT_SCHEMA,
    site: { siteId: p.siteId ?? SITE, publicOrigin: p.publicOrigin ?? ORIGIN, contentOrigin: "synthetic-fixture" },
    revision: p.revision ?? 1,
    liveRevision: p.liveRevision ?? 0,
    categories: p.categories ?? CATEGORIES,
    projects: p.projects,
    assets: p.assets.map(({ bytes: _b, ...a }) => a),
    changes: { publishing: p.publishing ?? (p.projects as { id: string }[]).map((x) => x.id), removing: p.removing ?? [] },
  };
}
const bytesOf = (assets: TestAsset[]) => new Map(assets.map((a) => [a.id, a.bytes]));

/** maru-011 is the project fixture-small's hero banner links to; the other two are new. */
const A_COVER = asset("sync-a-cover");
const A_ROOM = asset("sync-a-room", "image/png");
const SHARED = asset("sync-shared");
const B_COVER = asset("sync-b-cover", "image/webp");
const C_COVER = asset("sync-c-cover");
const P_A = project("maru-011", "maru-project-011", "sync-a-cover", ["sync-a-room", "sync-shared"]);
const P_B = project("sync-b", "sync-b-kitchen", "sync-b-cover", ["sync-shared"], { category: "commercial" });
const P_C = project("sync-c", "sync-c-bath", "sync-c-cover");
const V1 = { projects: [P_A, P_B, P_C], assets: [A_COVER, A_ROOM, B_COVER, C_COVER, SHARED] };
const V2 = { projects: [P_A, P_C], assets: [A_COVER, A_ROOM, C_COVER, SHARED], revision: 2, liveRevision: 1, publishing: [], removing: [{ id: "sync-b", slug: "sync-b-kitchen" }] };
/** fixture-small is hand-authored with maru-001 … maru-012: on the first managed run every one the export does not carry is retired */
const MARU_RETIRED = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(3, "0")).filter((n) => n !== "011").map((n) => ({ id: `maru-${n}`, slug: `maru-project-${n}` }));
const SYNC_B_RETIRED = { id: "sync-b", slug: "sync-b-kitchen" };

async function planFor(root: string, parts: ExportParts, siteId = SITE): Promise<PortfolioFilePlan> {
  return planManagedPortfolio({ export: makeExport(parts), assetBytes: bytesOf(parts.assets), site: await readSiteDirState(root, siteId) });
}
async function generate(root: string, parts: ExportParts, siteId = SITE): Promise<PortfolioFilePlan> {
  const plan = await planFor(root, parts, siteId);
  await validatePlanStaged({ repoRoot: root, siteId, plan });
  await applyFilePlan(path.join(root, "data/sites", siteId), plan);
  return plan;
}

// ================================================================= generator ==
console.log("\n[generator] export → file plan");
const base = await tempRoot(SITE);
const pristine = await digest(base.dir);

await check("G1 a valid export gives projects@1 / categories@1 documents that pass the EXISTING schemas (origin = contentOrigin, items = the export's projects by id), the images, their registry entries first and the sidecar; the regenerated site loads", async () => {
  const { root, dir } = await tempRoot(SITE);
  const plan = await generate(root, V1);
  const projects = ProjectsDocSchema.parse(await readJson(path.join(dir, "content/projects.json")));
  const categories = CategoriesDocSchema.parse(await readJson(path.join(dir, "content/categories.json")));
  eq([projects.schema, projects.origin, categories.schema, categories.origin], ["projects@1", "synthetic-fixture", "categories@1", "synthetic-fixture"], "document headers");
  eq(projects.items.map((p) => p.id), ["maru-011", "sync-b", "sync-c"], "items = export projects, id order");
  eq(projects.items, ProjectsDocSchema.parse({ schema: "projects@1", origin: "synthetic-fixture", items: V1.projects }).items, "items deep-equal the export's projects");
  eq(categories.items, CATEGORIES, "categories written in the export's order (the display order is the site's: by id)");
  for (const a of V1.assets) eq(sha256(await readFile(path.join(dir, "assets", a.file))), a.sha256, `assets/${a.file}`);
  const registry = AssetRegistryDocSchema.parse(await readJson(path.join(dir, "assets/registry.json")));
  eq(registry.items.slice(0, 5).map((a) => a.id), V1.assets.map((a) => a.id).sort(), "generated registry entries first, by id");
  const manifest = ManagedManifestSchema.parse(await readJson(path.join(dir, MANAGED_FILE)));
  eq([manifest.schema, manifest.source, manifest.assets.map((a) => a.id), manifest.content.map((c) => c.path), manifest.retired], [MANAGED_SCHEMA, { schema: EXPORT_SCHEMA, siteId: SITE, revision: 1 }, V1.assets.map((a) => a.id).sort(), ["content/categories.json", "content/projects.json"], MARU_RETIRED], "sidecar (retired = the hand-authored records the export does not carry)");
  eq([plan.files[0]!.path, plan.changed, plan.projects.map((p) => p.slug), plan.adopted], [MANAGED_FILE, true, ["maru-project-011", "sync-b-kitchen", "sync-c-bath"], []], "plan");
  const snap = (await buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).snapshot;
  eq(snap.content.projects.map((p) => p.id), ["maru-011", "sync-b", "sync-c"], "the loader serves the export's projects");
  eq(await managedPortfolioProblems(dir, SITE), [], "guard");
});

await check("G2 deterministic: the same export on two independent copies gives byte-identical generated files, the same siteSnapshotHash and the same buildInputId; no generated file carries a clock value", async () => {
  const a = await tempRoot(SITE);
  const b = await tempRoot(SITE);
  const pa = await generate(a.root, V1);
  await new Promise((r) => setTimeout(r, 20));
  const pb = await generate(b.root, V1);
  eq(pa.files.map((f) => [f.path, f.sha256]), pb.files.map((f) => [f.path, f.sha256]), "plans");
  eq(await digest(a.dir), await digest(b.dir), "directories");
  const [ia, ib] = [await prepareSiteInput({ repoRoot: a.root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at }), await prepareSiteInput({ repoRoot: b.root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })];
  eq([ia.parts.siteSnapshotHash, ia.buildInputId], [ib.parts.siteSnapshotHash, ib.buildInputId], "identity");
  const stamp = /20\d\d-\d\d-\d\dT\d\d:\d\d/;
  assert(!stamp.test(await readFile(path.join(a.dir, MANAGED_FILE), "utf8")), "the sidecar has a timestamp");
  assert(!stamp.test(await readFile(path.join(a.dir, "assets/registry.json"), "utf8")), "the registry has a timestamp");
  eq((await readFile(path.join(a.dir, "content/projects.json"), "utf8")).match(new RegExp(stamp, "g"))?.length, 3, "projects.json: only the three authored publishedAt values");
  // key order and item order of the export do not matter
  const c = await tempRoot(SITE);
  const shuffled = { ...V1, projects: [...V1.projects].reverse().map((p) => Object.fromEntries(Object.entries(p).reverse())), assets: [...V1.assets].reverse() };
  await generate(c.root, shuffled);
  eq(await digest(c.dir), await digest(a.dir), "the same records in another order → the same bytes");
});

await check("G3 idempotent: regenerating an already generated site plans nothing (every file unchanged, no removal) and writes nothing; an unchanged export with a new revision moves only the sidecar, not the snapshot", async () => {
  const { root, dir } = await tempRoot(SITE);
  await generate(root, V1);
  const before = await digest(dir);
  const hash = (await prepareSiteInput({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).parts.siteSnapshotHash;
  const again = await planFor(root, V1);
  eq([again.changed, again.removes, [...new Set(again.files.map((f) => f.action))]], [false, [], ["unchanged"]], "second plan");
  eq((await applyFilePlan(dir, again)).undo, [], "nothing touched");
  eq(await digest(dir), before, "directory");
  const bumped = await planFor(root, { ...V1, revision: 7, liveRevision: 1 });
  eq(bumped.files.filter((f) => f.action !== "unchanged").map((f) => f.path), [MANAGED_FILE], "a revision bump alone rewrites the sidecar only");
  await applyFilePlan(dir, bumped);
  eq((await prepareSiteInput({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).parts.siteSnapshotHash, hash, "siteSnapshotHash unchanged → the build is up to date");
});

await check("G4 a removed project disappears with the images only it used (file, registry entry, sidecar); an image another project still uses stays; the record is written to `retired` the moment it leaves the export and stays there until the same id is published again; the URL to verify absent is the slug the EXPORT gives (changes.removing {id, slug})", async () => {
  const { root, dir } = await tempRoot(SITE);
  const first = await generate(root, V1);
  eq([first.retired, first.removing], [MARU_RETIRED, []], "first managed run: the hand-authored records that are not in the export are retired; nothing to verify absent");
  const plan = await generate(root, V2);
  eq([plan.removes, plan.removing, plan.retired], [["assets/sync-b-cover.webp"], [SYNC_B_RETIRED], [...MARU_RETIRED, SYNC_B_RETIRED]], "plan");
  eq((await readJson(path.join(dir, "content/projects.json"))).items.map((p: { id: string }) => p.id), ["maru-011", "sync-c"], "projects.json");
  assert(!(await exists(path.join(dir, "assets/sync-b-cover.webp"))), "the unreferenced image is still on disk");
  assert(await exists(path.join(dir, "assets/sync-shared.jpg")), "the shared image was removed");
  const registry = (await readJson(path.join(dir, "assets/registry.json"))).items.map((a: { id: string }) => a.id);
  assert(!registry.includes("sync-b-cover") && registry.includes("sync-shared"), "registry entries");
  const sidecar = (await readManagedManifest(dir))!;
  eq([sidecar.assets.map((a) => a.id), sidecar.retired], [["sync-a-cover", "sync-a-room", "sync-c-cover", "sync-shared"], [...MARU_RETIRED, SYNC_B_RETIRED]], "sidecar assets / retired");
  eq(await managedPortfolioProblems(dir, SITE), [], "guard");
  // a record that left WITHOUT being named by changes.removing is retired too (previous projects.json = the witness)
  const silent = await generate(root, { projects: [P_A], assets: [A_COVER, A_ROOM, SHARED], revision: 3, liveRevision: 2, publishing: [], removing: [] });
  eq([silent.removing, silent.retired], [[], [...MARU_RETIRED, SYNC_B_RETIRED, { id: "sync-c", slug: "sync-c-bath" }]], "left the export → retired, with its last slug");
  // retired stays when the source no longer reports it as removing…
  const settled = await generate(root, { ...V2, revision: 4, liveRevision: 3, removing: [] });
  eq(settled.retired, [...MARU_RETIRED, SYNC_B_RETIRED], "sync-c is published again → no longer retired; sync-b stays retired");
  // …and leaves only when the same id is published again
  const back = await generate(root, { ...V1, revision: 5, liveRevision: 4 });
  eq([back.retired, (await readManagedManifest(dir))!.retired], [MARU_RETIRED, MARU_RETIRED], "sync-b published again → no longer retired");
  // the export is the authority for the URL to check: a record this working tree never served is verifiable too,
  // and the export's slug wins over the one this tree remembers
  const foreign = await planFor(root, { ...V2, revision: 6, liveRevision: 5, removing: [{ id: "never-served", slug: "never-served-here" }, { id: "sync-b", slug: "sync-b-renamed" }] });
  eq(foreign.removing, [{ id: "never-served", slug: "never-served-here" }, { id: "sync-b", slug: "sync-b-renamed" }], "removing = the export's entries, by id");
  eq(foreign.retired, [...MARU_RETIRED, { id: "never-served", slug: "never-served-here" }, { id: "sync-b", slug: "sync-b-renamed" }], "retired carries the export's slug");
});
await check("G5 site-level assets and every other site file are untouched: only projects.json, the registry and the generated images/sidecar differ from the hand-authored site; site-owned registry entries keep their content and order", async () => {
  const { root, dir } = await tempRoot(SITE);
  const before = await digest(dir);
  const registryBefore = (await readJson(path.join(dir, "assets/registry.json"))).items as { id: string }[];
  await generate(root, V1);
  await generate(root, V2);
  const after = await digest(dir);
  const changed = Object.keys({ ...before, ...after }).filter((f) => before[f] !== after[f]).sort();
  eq(changed, [...["sync-a-cover.jpg", "sync-a-room.png", "sync-c-cover.jpg", "sync-shared.jpg", "registry.json"].map((f) => `assets/${f}`), "content/projects.json", MANAGED_FILE].sort(), "files that differ (categories.json already had exactly the generated bytes)");
  for (const f of ["assets/hero-01.svg", "assets/hero-02.svg", "assets/intro-media.svg", "assets/band.svg", "assets/cover-01.svg", "site.json", "settings.json", "slots.json", "theme.json", "content/banners.json", "content/business.json", "content/reviews.json"]) eq(after[f], before[f], f);
  const registryAfter = (await readJson(path.join(dir, "assets/registry.json"))).items as { id: string }[];
  eq(registryAfter.slice(4), registryBefore, "every hand-authored registry entry, verbatim, in its order (after the 4 generated ones)");
});

console.log("\n[generator] ownership: collisions fail closed");
const untouched = async (dir: string, before: Record<string, string>) => eq(await digest(dir), before, "the site directory is untouched");
await check("G6 a managed asset may never take a site-level asset's id or file, nor a file the generator did not create — the plan is refused and nothing is written", async () => {
  const { root, dir } = await tempRoot(SITE);
  const before = await digest(dir);
  // (a) id of a site-level asset (the hero banner image)
  const heroId = { ...asset("hero-01"), file: "sync-hero.jpg" };
  await rejects(() => planFor(root, { projects: [project("maru-011", "maru-project-011", "hero-01")], assets: [heroId] }), /asset id "hero-01" collides with a site-level asset/, "id collision");
  // (b) file name of a site-level asset
  const heroFile = asset("sync-x", "image/png", "x", "hero-01.svg");
  await rejects(() => planFor(root, { projects: [project("maru-011", "maru-project-011", "sync-x")], assets: [heroFile] }), /would write assets\/hero-01\.svg, which belongs to a site-level asset/, "file collision");
  // (c) a file on disk that no registry entry and no sidecar accounts for
  await writeFile(path.join(dir, "assets/stray.jpg"), "operator's own file");
  const stray = asset("sync-y", "image/jpeg", "y", "stray.jpg");
  await rejects(() => planFor(root, { projects: [project("maru-011", "maru-project-011", "sync-y")], assets: [stray] }), /would write assets\/stray\.jpg, a file this generator did not create/, "stray file");
  await rm(path.join(dir, "assets/stray.jpg"));
  // (d) the reserved registry name, and two assets on one file (case-insensitive file systems)
  await rejects(() => planFor(root, { projects: [project("maru-011", "maru-project-011", "sync-z")], assets: [asset("sync-z", "image/jpeg", "z", "registry.json")] }), /reserved file name/, "registry.json");
  await rejects(() => planFor(root, { projects: [project("maru-011", "maru-project-011", "sync-p", ["sync-q"])], assets: [asset("sync-p", "image/jpeg", "p", "same.jpg"), asset("sync-q", "image/jpeg", "q", "same.jpg")] }), /lists file "same\.jpg" twice/, "duplicate file");
  await untouched(dir, before);
});
await check("G6b first conversion of a hand-authored site: a legacy image is taken over only when the export names it, the old projects.json used it and no site-level configuration does; a legacy id the site configuration also uses is a collision; legacy images the export does not name are never deleted", async () => {
  const { root, dir } = await tempRoot(SITE);
  // cover-02 is used by the hand-authored portfolio only → adopted, its old file replaced by the export's
  const adopted = asset("cover-02", "image/jpeg", "new cover-02", "cover-02.jpg");
  const plan = await generate(root, { projects: [project("maru-011", "maru-project-011", "cover-02")], assets: [adopted] });
  eq([plan.adopted, plan.removes], [["cover-02"], ["assets/cover-02.svg"]], "adopted");
  assert(!(await exists(path.join(dir, "assets/cover-02.svg"))) && (await exists(path.join(dir, "assets/cover-02.jpg"))), "cover-02 files");
  assert(await exists(path.join(dir, "assets/cover-01.svg")), "a legacy image the export does not name was deleted");
  eq((await readJson(path.join(dir, "assets/registry.json"))).items.filter((a: { id: string }) => a.id === "cover-02"), [{ id: "cover-02", file: "cover-02.jpg", mediaType: "image/jpeg", width: 1600, height: 1200 }], "registry entry replaced");
  // a legacy portfolio image that the banner ALSO uses is site-level → never taken over
  const other = await tempRoot(SITE);
  const banners = await readJson(path.join(other.dir, "content/banners.json"));
  banners.items[0].image.asset = "cover-03";
  await writeFile(path.join(other.dir, "content/banners.json"), `${JSON.stringify(banners, null, 2)}\n`);
  const before = await digest(other.dir);
  await rejects(() => planFor(other.root, { projects: [project("maru-011", "maru-project-011", "cover-03")], assets: [asset("cover-03", "image/jpeg", "c3", "cover-03.jpg")] }), /asset id "cover-03" collides with a site-level asset/, "shared with a banner");
  await untouched(other.dir, before);
});

console.log("\n[generator] refusals (fail closed, clear message, nothing written)");
await check("G7 every refusal of the contract: unknown schema, another site, another publicOrigin (P5), asset sha256 / size / type mismatch, a project the content model rejects, a draft, a referenced asset missing from assets[] and an extra one (P3), an undefined category (P2), duplicate ids / slugs, a record both served and removing", async () => {
  const refuse = async (parts: ExportParts, re: RegExp, msg: string, bytes?: Map<string, Uint8Array>) => {
    const err = await rejects(async () => planManagedPortfolio({ export: makeExport(parts), assetBytes: bytes ?? bytesOf(parts.assets), site: await readSiteDirState(base.root, SITE) }), re, msg);
    assert(err instanceof PortfolioGenerateError, `${msg}: not a PortfolioGenerateError`);
  };
  await refuse({ ...V1, schema: "boostchat-portfolio-export@2" }, /unknown export schema "boostchat-portfolio-export@2"/, "schema @2");
  await rejects(() => planManagedPortfolio({ export: { hello: 1 }, assetBytes: new Map(), site: undefined as never }), /unknown export schema undefined/, "no schema");
  await rejects(async () => planManagedPortfolio({ export: { ...makeExport(V1), extra: true }, assetBytes: bytesOf(V1.assets), site: await readSiteDirState(base.root, SITE) }), /not a valid boostchat-portfolio-export@1/, "unknown key");
  await refuse({ ...V1, siteId: "another-site" }, /export is for site "another-site", not "fixture-small"/, "siteId");
  await refuse({ ...V1, publicOrigin: "https://elsewhere.example" }, /publicOrigin https:\/\/elsewhere\.example ≠ site\.json publicOrigin https:\/\/fixture-small\.example \(contract P5\)/, "publicOrigin");
  const tampered = new Map(bytesOf(V1.assets));
  tampered.set("sync-a-cover", Uint8Array.from(A_COVER.bytes, (v, i) => (i === 40 ? v ^ 1 : v)));
  await refuse(V1, /asset "sync-a-cover": sha256 .* ≠ declared/, "sha256", tampered);
  tampered.set("sync-a-cover", A_COVER.bytes.slice(0, -1));
  await refuse(V1, /asset "sync-a-cover": size \d+ ≠ declared \d+/, "size", tampered);
  const html = new TextEncoder().encode("<html>not an image</html>");
  await refuse({ projects: [project("maru-011", "maru-project-011", "sync-h")], assets: [{ ...asset("sync-h"), bytes: html, sha256: sha256(html), size: html.length }] }, /asset "sync-h": the bytes are not image\/jpeg/, "type");
  const missing = new Map(bytesOf(V1.assets));
  missing.delete("sync-shared");
  await refuse(V1, /asset "sync-shared": no bytes were supplied/, "no bytes", missing);
  await refuse({ ...V1, projects: [P_A, { ...P_B, slug: "Bad Slug" }, P_C] }, /projects\[1\] \(id "sync-b"\) is not a valid project: slug/, "ProjectSchema: slug");
  await refuse({ ...V1, projects: [P_A, P_B, { ...P_C, projectType: "partial_remodel" }] }, /projects\[2\] \(id "sync-c"\) is not a valid project: workScopeIds.*INV-28/, "ProjectSchema: INV-28");
  await refuse({ ...V1, projects: [P_A, P_B, { ...P_C, summary: null }] }, /projects\[2\] \(id "sync-c"\) is not a valid project: summary/, "ProjectSchema: null");
  await refuse({ ...V1, projects: [P_A, P_B, { ...P_C, status: "draft" }] }, /projects\[2\] \(id "sync-c"\) has status "draft"/, "draft");
  await refuse({ ...V1, assets: V1.assets.filter((a) => a.id !== "sync-shared") }, /asset "sync-shared" is referenced by a project but missing from assets \(contract P3\)/, "P3 missing");
  await refuse({ ...V1, assets: [...V1.assets, asset("sync-extra")] }, /asset "sync-extra" is not referenced by any project \(contract P3: no extras\)/, "P3 extra");
  await refuse({ ...V1, projects: [P_A, { ...P_B, category: "nowhere" }, P_C] }, /project "sync-b" names category "nowhere".*contract P2/, "P2");
  await refuse({ ...V1, projects: [P_A, { ...P_C, id: "maru-011" }], assets: [A_COVER, A_ROOM, C_COVER, SHARED] }, /duplicate id "maru-011"/, "duplicate id");
  await refuse({ ...V1, projects: [P_A, { ...P_C, slug: "maru-project-011" }], assets: [A_COVER, A_ROOM, C_COVER, SHARED] }, /duplicate slug "maru-project-011"/, "duplicate slug");
  await refuse({ ...V1, removing: [{ id: "sync-c", slug: "sync-c-bath" }] }, /changes\.removing names "sync-c", which is also in projects/, "removing ∩ projects");
  await refuse({ ...V1, removing: [{ id: "gone", slug: "gone-a" }, { id: "gone", slug: "gone-b" }] }, /changes\.removing lists id "gone" twice/, "duplicate removing id");
  // malformed removing entries (the pre-change bare id, a missing / invalid slug, an extra key) are not this contract
  for (const bad of [["gone"], [{ id: "gone" }], [{ id: "gone", slug: "Not A Slug" }], [{ id: "gone", slug: "gone", url: "/portfolio/gone" }], [{ slug: "gone" }]]) {
    const doc = { ...makeExport(V1), changes: { publishing: [], removing: bad } };
    const err = await rejects(async () => planManagedPortfolio({ export: doc, assetBytes: bytesOf(V1.assets), site: await readSiteDirState(base.root, SITE) }), /not a valid boostchat-portfolio-export@1[\s\S]*changes\.removing/, `malformed removing ${JSON.stringify(bad)}`);
    assert(err instanceof PortfolioGenerateError, "malformed removing: not a PortfolioGenerateError");
  }
  await refuse({ ...V1, assets: [...V1.assets, A_COVER] }, /assets lists id "sync-a-cover" twice/, "duplicate asset id");
  eq(await digest(base.dir), pristine, "the site directory was never written");
});

await check("G8 the plan is proven on a staged copy with the REAL loader before anything is written: a record scheduled in the future is refused, and so is an export whose result does not load (a banner CTA whose target was never a record of this site — a typo); the site directory stays as it was. An export that drops the project the hero banner links to is NOT a dead end: the id is retired, the site loads", async () => {
  const { root, dir } = await tempRoot(SITE);
  const before = await digest(dir);
  const future = await planFor(root, { projects: [P_A, { ...P_C, publishedAt: "2999-01-01T00:00:00Z" }], assets: [A_COVER, A_ROOM, C_COVER, SHARED] });
  await rejects(() => validatePlanStaged({ repoRoot: root, siteId: SITE, plan: future }), /would not be served yet .*: sync-c/, "scheduled");
  // the banner's target leaves the export: retired by this very plan → the staged site loads
  const dropped = await planFor(root, { projects: [P_C], assets: [C_COVER] });
  assert(dropped.retired.some((r) => r.id === "maru-011" && r.slug === "maru-project-011"), "maru-011 is retired by the plan that drops it (first managed run)");
  eq((await validatePlanStaged({ repoRoot: root, siteId: SITE, plan: dropped })).servedIds, ["sync-c"], "loads without the banner's target");
  await untouched(dir, before);
  // a target that is neither stored nor retired is still a typo: the staged load fails, nothing is written
  const banners = await readJson(path.join(dir, "content/banners.json"));
  banners.items[0].cta.target.project = "no-such-project";
  await writeFile(path.join(dir, "content/banners.json"), `${JSON.stringify(banners, null, 2)}\n`);
  const typoBefore = await digest(dir);
  const typo = await planFor(root, V1);
  await rejects(() => validatePlanStaged({ repoRoot: root, siteId: SITE, plan: typo }), /the regenerated site does not load: .*banner "warm-light" CTA targets unknown project "no-such-project"/, "typo");
  await untouched(dir, typoBefore);
});
await check("G9 apply is undoable: restoring an applied plan gives back the previous directory byte for byte (first conversion and a later regeneration); a target that is not a regular file is refused before anything is written", async () => {
  const { root, dir } = await tempRoot(SITE);
  const hand = await digest(dir);
  const first = await planFor(root, V1);
  const applied = await applyFilePlan(dir, first);
  assert(Object.keys(await digest(dir)).length > Object.keys(hand).length, "nothing was written");
  await restoreAppliedPlan(dir, applied);
  eq(await digest(dir), hand, "hand-authored state restored");
  await generate(root, V1);
  const v1 = await digest(dir);
  const second = await planFor(root, V2);
  const appliedV2 = await applyFilePlan(dir, second);
  await restoreAppliedPlan(dir, appliedV2);
  eq(await digest(dir), v1, "generation 1 restored (the removed image is back)");
  eq(await managedPortfolioProblems(dir, SITE), [], "guard after restore");
  // a directory where a generated image must go
  const third = await planFor(root, V2);
  await rm(path.join(dir, "assets/sync-shared.jpg"));
  await mkdir(path.join(dir, "assets/sync-shared.jpg"));
  const plan = { ...third, files: third.files.map((f) => (f.path === "assets/sync-shared.jpg" ? { ...f, action: "replace" as const } : f)) };
  const snapshot = await digest(dir);
  await rejects(() => applyFilePlan(dir, plan), /is not a regular file; refusing to replace it/, "non-regular target");
  eq(await digest(dir), snapshot, "nothing was written");
});

// ===================================================================== guard ==
console.log("\n[guard] the shared site loader");
await check("L1 a managed site that nobody touched loads; a hand-edit of a generated file (projects.json, categories.json, an image, a generated registry entry), a deleted image or a broken sidecar FAILS the load, and the message says the file is generated and where to edit instead", async () => {
  const { root, dir } = await tempRoot(SITE);
  await generate(root, V1);
  const load = () => buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at });
  await load();
  const clean = await digest(dir);
  const tamper = async (file: string, edit: (text: Buffer) => Buffer | string | undefined, re: RegExp) => {
    const original = await readFile(path.join(dir, file));
    const next = edit(original);
    if (next === undefined) await rm(path.join(dir, file));
    else await writeFile(path.join(dir, file), next);
    const err = await rejects(load, re, file);
    assert(err instanceof SiteDataError, `${file}: not a SiteDataError`);
    assert(/GENERATED from BoostChat — edit the portfolio in the BoostChat admin and publish, then run site:portfolio-sync/.test(err.message), `${file}: the message does not say where to edit: ${err.message}`);
    await writeFile(path.join(dir, file), original);
  };
  await tamper("content/projects.json", (b) => b.toString("utf8").replace("테스트 프로젝트 sync-c", "손으로 고친 제목"), /content\/projects\.json was modified by hand/);
  await tamper("content/projects.json", (b) => `${b.toString("utf8")}\n`, /content\/projects\.json was modified by hand/);
  await tamper("content/categories.json", (b) => b.toString("utf8").replace("주거", "주택"), /content\/categories\.json was modified by hand/);
  await tamper("assets/sync-c-cover.jpg", (b) => Buffer.concat([b, Buffer.from("x")]), /assets\/sync-c-cover\.jpg \(portfolio image "sync-c-cover"\) was replaced by hand/);
  await tamper("assets/sync-c-cover.jpg", () => undefined, /assets\/sync-c-cover\.jpg \(portfolio image "sync-c-cover"\) is missing/);
  await tamper("assets/registry.json", (b) => b.toString("utf8").replace('"id": "sync-shared",\n      "file": "sync-shared.jpg",\n      "mediaType": "image/jpeg",\n      "width": 1600', '"id": "sync-shared",\n      "file": "sync-shared.jpg",\n      "mediaType": "image/jpeg",\n      "width": 800'), /registry\.json entry "sync-shared" is not the generated one \(edited\)/);
  eq(await digest(dir), clean, "restored between cases");
  await load();
  const sidecar = await readFile(path.join(dir, MANAGED_FILE), "utf8");
  await writeFile(path.join(dir, MANAGED_FILE), "{ not json");
  await rejects(load, /managed portfolio check failed[\s\S]*portfolio\.managed\.json is not valid JSON/, "broken sidecar");
  await writeFile(path.join(dir, MANAGED_FILE), sidecar.replace(MANAGED_SCHEMA, "managed-portfolio@9"));
  await rejects(load, /portfolio\.managed\.json invalid/, "unknown sidecar schema");
  await writeFile(path.join(dir, MANAGED_FILE), sidecar);
  await load();
});
await check("L2 what the SITE owns stays editable on a managed site: a new site-level registry entry + file, a slot edit and a settings edit load fine, and the next regeneration keeps them", async () => {
  const { root, dir } = await tempRoot(SITE);
  await generate(root, V1);
  const registry = await readJson(path.join(dir, "assets/registry.json"));
  registry.items.push({ id: "new-hero", file: "new-hero.svg", mediaType: "image/svg+xml", width: 10, height: 10 });
  await writeFile(path.join(dir, "assets/registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
  await writeFile(path.join(dir, "assets/new-hero.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>');
  const banners = await readJson(path.join(dir, "content/banners.json"));
  banners.items[1].image.asset = "new-hero";
  await writeFile(path.join(dir, "content/banners.json"), `${JSON.stringify(banners, null, 2)}\n`);
  const snap = (await buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).snapshot;
  assert(snap.assets.some((a) => a.id === "new-hero"), "the site-level asset is in the snapshot");
  await generate(root, V2);
  const after = (await readJson(path.join(dir, "assets/registry.json"))).items.map((a: { id: string }) => a.id);
  assert(after.includes("new-hero") && (await exists(path.join(dir, "assets/new-hero.svg"))), "the site-level asset survived the regeneration");
  await buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at });
});
await check("L3 sites without the sidecar and without the marker are exactly as before: the guard reports nothing for them, and every unmanaged site of the repository still has the buildInputId of its current package (no behaviour or hash change); an ADOPTED site of the repository (tracked marker) is not one of them — without a generated portfolio in this checkout the guard reports exactly that", async () => {
  let compared = 0;
  const adoptedSites: string[] = [];
  for (const siteId of (await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort()) {
    const dir = path.join(repoRoot, "data/sites", siteId);
    // portfolio-source@1 = the portfolio is GENERATED into this site directory by BoostChat ("adopted").
    // portfolio-source@2 (publishing: "incremental") is not that: such a site holds no generated
    // portfolio by design — the guard has nothing to report for it, and its (shell) package is held to
    // its present data below like any other site's (platform/test/portfolio-runtime.test.ts holds the rest).
    if ((await readPortfolioSource(dir)) === "generated") {
      adoptedSites.push(siteId);
      // generated here (the publisher's checkout) → L1's rules; not generated → refused, by the tracked marker alone
      const problems = await managedPortfolioProblems(dir, siteId);
      if (!(await exists(path.join(dir, MANAGED_FILE)))) assert(problems.length === 1 && /owned by BoostChat \(portfolio\.source\.json\) but this checkout holds no generated portfolio/.test(problems[0]!), `${siteId}: adopted without a generated portfolio must be reported, got ${JSON.stringify(problems)}`);
      continue;
    }
    if (await exists(path.join(dir, MANAGED_FILE))) continue;
    eq(await managedPortfolioProblems(dir, siteId), [], `${siteId}: guard`);
    const builds = path.join(repoRoot, "data/site-builds", siteId);
    if (!(await exists(path.join(builds, "current.json")))) continue;
    const current = await readJson(path.join(builds, "current.json"));
    const record = await readJson(path.join(repoRoot, current.packageDir, "build-record.json"));
    const input = await prepareSiteInput({ repoRoot, siteId, mode: "public", at: record.at });
    eq([input.parts.siteSnapshotHash, input.buildInputId], [record.parts.siteSnapshotHash, current.buildInputId], `${siteId}: identity = its current package`);
    compared++;
  }
  assert(compared >= 3, `only ${compared} unmanaged sites compared`);
  // the demo's portfolio is BoostChat's either way: adopted (generated into the directory, @1), or — since 2026-10-10 — published incrementally (@2, compared above like every site that builds from its own data)
  const demoSource = await readPortfolioSource(path.join(repoRoot, "data/sites", FROZEN_DEMO_SITE_ID));
  assert(adoptedSites.includes(FROZEN_DEMO_SITE_ID) || demoSource === "incremental", `the demo's portfolio is owned by BoostChat (its tracked ${SOURCE_MARKER_FILE} is committed); it is "${demoSource}", adopted sites found: ${JSON.stringify(adoptedSites)}`);
});

/** An export of a hand-authored site directory as it is, minus `drop` (those are reported as removing, with their slugs). */
async function exportOfSiteDir(src: string, siteId: string, drop: string[] = [], revision = 1) {
  const projectsDoc = await readJson(path.join(src, "content/projects.json"));
  const items = (projectsDoc.items as { id: string; slug: string }[]).filter((p) => !drop.includes(p.id));
  const referenced = new Set(ProjectsDocSchema.parse({ ...projectsDoc, items }).items.flatMap(projectAssetRefs));
  const assets: TestAsset[] = [];
  for (const entry of AssetRegistryDocSchema.parse(await readJson(path.join(src, "assets/registry.json"))).items.filter((a) => referenced.has(a.id)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const bytes = await readFile(path.join(src, "assets", entry.file));
    assets.push({ ...entry, mediaType: entry.mediaType as ExportAsset["mediaType"], sha256: sha256(bytes), size: bytes.length, href: `${assetPathPrefix(siteId)}${entry.id}`, bytes });
  }
  const doc = {
    schema: EXPORT_SCHEMA,
    site: { siteId, publicOrigin: (await readJson(path.join(src, "site.json"))).identity.publicOrigin, contentOrigin: projectsDoc.origin },
    revision,
    liveRevision: revision - 1,
    categories: (await readJson(path.join(src, "content/categories.json"))).items,
    projects: items,
    assets: assets.map(({ bytes: _b, ...a }) => a),
    changes: { publishing: [], removing: (projectsDoc.items as { id: string; slug: string }[]).filter((p) => drop.includes(p.id)).map(({ id, slug }) => ({ id, slug })) },
  };
  return { doc, assets };
}
await check("L4 a banner CTA to a RETIRED project (managed site; the customer unpublished it) loads, and the real Template hides that CTA exactly like a draft's — the other slide keeps its link; nothing retired → the same siteSnapshotHash as the hand-authored site; an id that is neither stored nor retired is still a typo and fails; published again → no longer retired, the CTA is back", async () => {
  const DEMO = FROZEN_DEMO_SITE_ID;
  const frozen = await frozenDemoRoot(repoRoot);
  const target = await tempRoot(DEMO, frozen.root);
  const load = async () => (await buildSiteSnapshot({ repoRoot: target.root, siteId: DEMO, mode: "public", at: GOLDEN_INPUT.at })).snapshot;
  const gen = async (drop: string[], revision: number) => {
    const { doc, assets } = await exportOfSiteDir(frozen.siteDir, DEMO, drop, revision);
    const plan = planManagedPortfolio({ export: doc, assetBytes: bytesOf(assets), site: await readSiteDirState(target.root, DEMO) });
    await validatePlanStaged({ repoRoot: target.root, siteId: DEMO, plan, at: GOLDEN_INPUT.at });
    await applyFilePlan(target.dir, plan);
    return plan;
  };
  const heroOf = (snap: Awaited<ReturnType<typeof load>>) => {
    assert(snap.site.template.templateVersion === template.version, `the demo pins ${snap.site.template.templateVersion}, the working-tree template is ${template.version}`);
    return homeHero(createSiteContext({ siteId: DEMO, template, templateRelease: snap.site.template, mode: "public", at: GOLDEN_INPUT.at, snapshot: snap }))!;
  };
  const handAuthored = await load();
  const linked = (handAuthored.content.banners ?? []).filter((b) => b.cta?.target.kind === "project").map((b) => ({ banner: b.id, project: (b.cta!.target as { project: string }).project }));
  assert(linked.length >= 2 && linked[0]!.project !== linked[1]!.project, `the demo has two banners linking to two projects: ${JSON.stringify(linked)}`);
  const [gone, kept] = linked as [typeof linked[number], typeof linked[number]];
  const slugOf = (id: string) => handAuthored.content.projects.find((p) => p.id === id)!.slug;
  eq(heroOf(handAuthored).slides.filter((s) => linked.some((l) => l.banner === s.id)).map((s) => [s.id, s.cta?.href]), linked.map((l) => [l.banner, `/portfolio/${slugOf(l.project)}`]), "hand-authored: every project CTA is rendered");

  // managed, nothing retired: the snapshot is the hand-authored one
  eq([(await gen([], 1)).retired, hashJson(await load())], [[], hashJson(handAuthored)], "managed without retired ids: no retired entry, the same snapshot");
  // the customer unpublishes the project a banner links to
  const plan = await gen([gone.project], 2);
  eq([plan.retired, (await readManagedManifest(target.dir))!.retired], [[{ id: gone.project, slug: slugOf(gone.project) }], [{ id: gone.project, slug: slugOf(gone.project) }]], "retired the moment it leaves the export");
  const snap = await load(); // does not throw
  assert(!snap.content.projects.some((p) => p.id === gone.project), "the unpublished record is still served");
  assert((snap.content.banners ?? []).some((b) => b.id === gone.banner && b.cta?.target.kind === "project"), "the banner (site-owned) still names its target");
  const hero = heroOf(snap);
  eq(hero.slides.find((s) => s.id === gone.banner)!.cta, undefined, "the CTA to the retired project is not rendered");
  eq(hero.slides.find((s) => s.id === kept.banner)!.cta, { label: handAuthored.content.banners!.find((b) => b.id === kept.banner)!.cta!.label, href: `/portfolio/${slugOf(kept.project)}`, internal: true }, "the other slide keeps its CTA");
  eq(hero.slides.length, heroOf(handAuthored).slides.length, "the slide itself stays");
  // …the branch the Template takes (homeHeroData.ts: a manual selection of one id, `hit[0]` undefined)
  const picked = createContentReader(snap.content).list({ type: "projects", selection: { mode: "manual", ids: [gone.project] }, limit: 1 });
  eq([picked.items, picked.warnings.map((w) => w.code)], [[], ["manual-id-missing"]], "reader: not served → no item");
  // a target that is neither stored nor retired is still a typo
  const bannersFile = path.join(target.dir, "content/banners.json");
  const original = await readFile(bannersFile, "utf8");
  const typo = JSON.parse(original);
  typo.items.find((b: { id: string }) => b.id === kept.banner).cta.target.project = "bi-99";
  await writeFile(bannersFile, `${JSON.stringify(typo, null, 2)}\n`);
  const err = await rejects(load, new RegExp(`banner "${kept.banner}" CTA targets unknown project "bi-99"`), "typo on a managed site");
  assert(err instanceof SiteDataError, "typo: not a SiteDataError");
  await writeFile(bannersFile, original);
  // published again → leaves retired[]; the CTA is rendered again
  eq((await gen([], 3)).retired, [], "published again → no longer retired");
  eq(heroOf(await load()).slides.find((s) => s.id === gone.banner)!.cta?.href, `/portfolio/${slugOf(gone.project)}`, "the CTA is back");
});
await check("L5 an UNMANAGED site is exactly as before: a banner CTA to an id that is not in projects.json fails the load (there is no sidecar, so nothing is ever 'retired'), a stored draft target still loads; a sidecar's retired[] only ever widens what loads — it is not part of the snapshot", async () => {
  const { root, dir } = await tempRoot(SITE);
  const load = () => buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at });
  const pristineHash = hashJson((await load()).snapshot);
  const bannersFile = path.join(dir, "content/banners.json");
  const original = await readFile(bannersFile, "utf8");
  const edit = async (project: string) => {
    const doc = JSON.parse(original);
    doc.items[0].cta.target.project = project;
    await writeFile(bannersFile, `${JSON.stringify(doc, null, 2)}\n`);
  };
  await edit("sync-b");
  await rejects(load, /banner "warm-light" CTA targets unknown project "sync-b"/, "unmanaged: unknown id");
  const projectsFile = path.join(dir, "content/projects.json");
  const projects = await readJson(projectsFile);
  const draft = projects.items.find((p: { id: string }) => p.id === "maru-011");
  draft.status = "draft";
  await writeFile(projectsFile, `${JSON.stringify(projects, null, 2)}\n`);
  await writeFile(bannersFile, original);
  assert(!(await load()).snapshot.content.projects.some((p) => p.id === "maru-011"), "unmanaged: a stored draft target loads, unserved (as before)");
  // managed: the same banner edit loads once sync-b is retired, and the snapshot of a site with an UNUSED retired entry is unchanged
  const managed = await tempRoot(SITE);
  await generate(managed.root, V1);
  const managedLoad = async () => hashJson((await buildSiteSnapshot({ repoRoot: managed.root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).snapshot);
  await generate(managed.root, { ...V1, revision: 2, liveRevision: 1 });
  const v1Hash = await managedLoad();
  const sidecarFile = path.join(managed.dir, MANAGED_FILE);
  const sidecar = await readJson(sidecarFile);
  eq(sidecar.retired, MARU_RETIRED, "retired entries exist (the hand-authored records)");
  await writeFile(sidecarFile, `${JSON.stringify({ ...sidecar, retired: [] }, null, 2)}\n`);
  eq(await managedLoad(), v1Hash, "the same site with and without retired entries has the same snapshot hash");
  assert(pristineHash !== v1Hash, "sanity: the generated portfolio differs from the hand-authored one");
});

// ================================================================== lossless ==
console.log("\n[lossless] the demo's hand-authored dataset → export → generator → the same site");
await check(`M1 LOSSLESS MIGRATION: an export built from the demo dataset (projects and categories as they are, assets = the portfolio-referenced registry entries with their real sha256 / size) regenerates projects.json / categories.json deep-equal to the originals, touches no site-level asset and no other site file, and keeps the site snapshot hash, the buildInputId and the Portfolio Document version ${PROD_VERSION}`, async () => {
  const DEMO = FROZEN_DEMO_SITE_ID;
  const frozen = await frozenDemoRoot(repoRoot);
  // today the composition IS the live directory (hand-authored, unchanged); once the live site is managed it is the frozen dataset
  assert(frozen.live.identical || frozen.live.managed, "data/sites/boost-interior-demo is neither the frozen dataset nor a managed site");
  if (frozen.live.identical) {
    // the tracked adoption marker is the one file the composition drops: it is not a site input (outside the snapshot)
    const { [SOURCE_MARKER_FILE]: _marker, ...liveFiles } = await digest(path.join(repoRoot, "data/sites", DEMO));
    eq(await digest(frozen.siteDir), liveFiles, "the source of this proof is the CURRENT data/sites/boost-interior-demo, byte for byte");
  }
  const src = frozen.siteDir;
  const projectsDoc = await readJson(path.join(src, "content/projects.json"));
  const categoriesDoc = await readJson(path.join(src, "content/categories.json"));
  const registry = AssetRegistryDocSchema.parse(await readJson(path.join(src, "assets/registry.json")));
  const referenced = new Set(ProjectsDocSchema.parse(projectsDoc).items.flatMap(projectAssetRefs));
  const assets: TestAsset[] = [];
  for (const entry of registry.items.filter((a) => referenced.has(a.id)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const bytes = await readFile(path.join(src, "assets", entry.file));
    assets.push({ ...entry, mediaType: entry.mediaType as ExportAsset["mediaType"], sha256: sha256(bytes), size: bytes.length, href: `${assetPathPrefix(DEMO)}${entry.id}`, bytes });
  }
  eq([projectsDoc.items.length, assets.length, referenced.size], [8, 44, 44], "8 projects, 44 portfolio images");
  const site = await readJson(path.join(src, "site.json"));
  const exportDoc = {
    schema: EXPORT_SCHEMA,
    site: { siteId: DEMO, publicOrigin: site.identity.publicOrigin, contentOrigin: projectsDoc.origin },
    revision: 1,
    liveRevision: 0,
    categories: categoriesDoc.items,
    projects: projectsDoc.items,
    assets: assets.map(({ bytes: _b, ...a }) => a),
    changes: { publishing: projectsDoc.items.map((p: { id: string }) => p.id), removing: [] },
  };

  const target = await tempRoot(DEMO, frozen.root); // a TEMP COPY: the generator never sees data/sites
  const before = await digest(target.dir);
  const plan = planManagedPortfolio({ export: exportDoc, assetBytes: bytesOf(assets), site: await readSiteDirState(target.root, DEMO) });
  await validatePlanStaged({ repoRoot: target.root, siteId: DEMO, plan, at: GOLDEN_INPUT.at });
  await applyFilePlan(target.dir, plan);
  const after = await digest(target.dir);

  // (1) the documents
  eq(await readJson(path.join(target.dir, "content/projects.json")), projectsDoc, "projects.json deep-equal");
  eq(await readJson(path.join(target.dir, "content/categories.json")), categoriesDoc, "categories.json deep-equal");
  eq(after["content/projects.json"], before["content/projects.json"], "projects.json is even byte-identical");
  // (2) nothing else moved: the only new file is the sidecar, the only rewritten one categories.json (formatting)
  const differing = Object.keys({ ...before, ...after }).filter((f) => before[f] !== after[f]).sort();
  eq(differing, ["content/categories.json", MANAGED_FILE], "files that differ from the hand-authored directory");
  eq([plan.removes, plan.adopted.length, plan.files.filter((f) => f.action !== "unchanged").map((f) => f.path).sort()], [[], 44, ["content/categories.json", MANAGED_FILE]], "plan: 44 images taken over in place, nothing removed");
  for (const f of ["assets/logo.svg", "assets/site-hero-01.jpg", "assets/site-hero-02.jpg", "assets/site-hero-03.jpg", "assets/site-intro.jpg", "assets/site-band.jpg", "assets/site-reviews.jpg", "assets/site-portfolio-hero.jpg", "assets/registry.json", "site.json", "settings.json", "slots.json", "theme.json", "scripts.json", "inquiry.json", "integration.json", "content/banners.json", "content/business.json", "content/reviews.json"]) {
    assert(before[f] !== undefined && after[f] === before[f], `${f} was touched`);
  }
  // (3) identity and the emitted Portfolio Document
  const emit = async (root: string) => {
    const input = await prepareSiteInput({ repoRoot: root, siteId: DEMO, mode: "public", at: GOLDEN_INPUT.at });
    const planned = planRoutes(template.routes, createContentReader(input.snapshot.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
    const e = emitIntegration({ snapshot: input.snapshot, declaredRoutes: template.routes, plannedRoutes: planned });
    return { siteSnapshotHash: input.parts.siteSnapshotHash, buildInputId: input.buildInputId, version: e.portfolio!.version, doc: e.portfolio!.file.sha256, manifest: e.manifestFile.sha256, snapshot: hashJson(input.snapshot) };
  };
  const [original, regenerated] = [await emit(frozen.root), await emit(target.root)];
  eq(regenerated, original, "siteSnapshotHash · buildInputId · document version · document bytes · manifest bytes");
  eq(regenerated.version, PROD_VERSION, "the Portfolio Document version production serves");
  console.log(`       observed: version ${regenerated.version} · siteSnapshotHash ${regenerated.siteSnapshotHash.slice(0, 16)}… · buildInputId ${regenerated.buildInputId.slice(0, 16)}…`);
  // …and it is a managed site now: guarded, idempotent
  eq(await managedPortfolioProblems(target.dir, DEMO), [], "guard");
  const again = planManagedPortfolio({ export: exportDoc, assetBytes: bytesOf(assets), site: await readSiteDirState(target.root, DEMO) });
  eq([again.changed, again.adopted], [false, []], "second run plans nothing");
});

// ==================================================================== client ==
console.log("\n[client] the HTTP client against an in-process fake BoostChat");
interface FakeBoostChat {
  url: string;
  close(): Promise<void>;
  /** the export served now (revision / liveRevision are filled from desired / live) */
  doc: ReturnType<typeof makeExport>;
  assets: Map<string, Uint8Array>;
  desired: number;
  live: number;
  requests: { method: string; path: string; auth: string | undefined }[];
  results: PortfolioResult[];
  /** scripted answers for the next result POSTs: "drop" closes the socket, a number answers that status, "stale" answers 409 */
  postScript: ("drop" | "stale" | number)[];
  /** called when a result is accepted (to move desired / live like BoostChat would) */
  onResult?: (result: PortfolioResult) => void;
  exportStatus?: { status: number; body: unknown };
  assetHeaderSha?: (id: string) => string;
  /** answer an asset GET with this status instead of its bytes */
  assetStatus?: (id: string) => number | undefined;
}
async function fakeBoostChat(siteId = SITE): Promise<FakeBoostChat> {
  const fake = { doc: makeExport(V1), assets: bytesOf(V1.assets), desired: 1, live: 0, requests: [], results: [], postScript: [] } as unknown as FakeBoostChat;
  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    fake.requests.push({ method: req.method ?? "", path: url.pathname, auth: req.headers.authorization });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && url.pathname === exportPath(siteId)) {
      if (fake.exportStatus) return json(res, fake.exportStatus.status, fake.exportStatus.body);
      return json(res, 200, { ...fake.doc, revision: fake.desired, liveRevision: fake.live });
    }
    if (req.method === "GET" && url.pathname.startsWith(assetPathPrefix(siteId))) {
      const id = url.pathname.slice(assetPathPrefix(siteId).length);
      const forced = fake.assetStatus?.(id);
      if (forced) return json(res, forced, { error: forced === 404 ? "not_found" : "busy" });
      const bytes = fake.assets.get(id);
      if (!bytes) return json(res, 404, { error: "not_found" });
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": String(bytes.length), "x-asset-sha256": fake.assetHeaderSha?.(id) ?? sha256(bytes), "cache-control": "no-store" });
      return res.end(Buffer.from(bytes));
    }
    if (req.method === "POST" && url.pathname === resultPath(siteId)) {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const step = fake.postScript.shift();
        if (step === "drop") return void req.socket.destroy();
        if (step === "stale") return json(res, 409, { error: "stale_revision", revision: fake.desired, liveRevision: fake.live });
        if (typeof step === "number") return json(res, step, { error: step === 503 ? "publisher_not_configured" : "boom" });
        const result = PortfolioResultSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (result.revision < fake.live || result.revision > fake.desired) return json(res, 409, { error: "stale_revision", revision: fake.desired, liveRevision: fake.live });
        fake.results.push(result);
        if (result.outcome === "succeeded") fake.live = result.revision;
        else fake.desired += 1; // contract R3
        fake.onResult?.(result);
        json(res, 200, { ok: true, revision: fake.desired, liveRevision: fake.live, applied: { published: result.outcome === "succeeded" ? result.verified.present : [], removed: result.outcome === "succeeded" ? result.verified.absent : [], failed: [] } });
      });
      return;
    }
    json(res, 404, { error: "not_found" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise<void>((r) => server.close(() => r()));
  return fake;
}
const quick = { postDelayMs: () => 1, timeoutMs: 5000 };
const SUCCEEDED: PortfolioResult = { schema: RESULT_SCHEMA, revision: 1, outcome: "succeeded", packageHash: "ab".repeat(32), portfolioVersion: "cd".repeat(16), verified: { present: ["maru-011"], absent: [] } };
const noToken = (text: string, what: string) => assert(!text.includes(TOKEN), `${what} contains the publisher token`);

const bc = await fakeBoostChat();
try {
  await check("H1 success path: the export is read with the bearer token, an asset comes back verified against the export's sha256 / size, and a result is accepted (ack parsed); every request carried the token and nothing else did", async () => {
    const logs: string[] = [];
    const client = createPublisherClient({ baseUrl: bc.url, token: TOKEN, siteId: SITE, ...quick, log: (l) => logs.push(l) });
    const doc = (await client.getExport()) as { schema: string; revision: number; liveRevision: number; assets: ExportAsset[] };
    eq([doc.schema, doc.revision, doc.liveRevision, doc.assets.length], [EXPORT_SCHEMA, 1, 0, 5], "export");
    eq(sha256(await client.getAsset(doc.assets[0]!)), doc.assets[0]!.sha256, "asset bytes");
    const r = await client.postResult(SUCCEEDED);
    eq(r, { status: "accepted", ack: { ok: true, revision: 1, liveRevision: 1, applied: { published: ["maru-011"], removed: [], failed: [] } } }, "ack");
    eq(bc.results, [SUCCEEDED], "what BoostChat received");
    eq(bc.requests.map((q) => [q.method, q.path, q.auth === `Bearer ${TOKEN}`]), [["GET", exportPath(SITE), true], ["GET", `${assetPathPrefix(SITE)}${doc.assets[0]!.id}`, true], ["POST", resultPath(SITE), true]], "requests");
    noToken(logs.join("\n"), "the log");
    bc.live = 0;
    bc.results.length = 0;
  });
  await check("H2 401 → an auth error that never contains the token; 503 publisher_not_configured and 404 site_not_found are told apart; another origin, a non-loopback http base or a base with a path is refused before any request", async () => {
    const wrong = createPublisherClient({ baseUrl: bc.url, token: "wrong-token-wrong-token-wrong-token-0000", siteId: SITE, ...quick });
    const e = (await rejects(() => wrong.getExport(), /401 unauthorized/, "401")) as BoostChatError;
    eq([e.kind, e.status], ["auth", 401], "kind");
    assert(!e.message.includes("wrong-token"), "the error names the token");
    const ep = (await rejects(() => wrong.postResult(SUCCEEDED), /401 unauthorized/, "401 on POST")) as BoostChatError;
    eq(ep.kind, "auth", "POST kind (not retried)");
    const client = createPublisherClient({ baseUrl: bc.url, token: TOKEN, siteId: SITE, ...quick });
    bc.exportStatus = { status: 503, body: { error: "publisher_not_configured" } };
    eq(((await rejects(() => client.getExport(), /publisher_not_configured/, "503")) as BoostChatError).kind, "not-configured", "503 kind");
    bc.exportStatus = { status: 404, body: { error: "site_not_found" } };
    eq(((await rejects(() => client.getExport(), /site_not_found/, "404")) as BoostChatError).kind, "site-not-found", "404 kind");
    bc.exportStatus = undefined;
    for (const [baseUrl, re] of [["http://boostchat.example", /must be https/], ["https://boostchat.example/api", /must be an origin/], ["ftp://x", /must be https/], ["not a url", /is not a URL/]] as const) {
      const err = await rejects(() => createPublisherClient({ baseUrl, token: TOKEN, siteId: SITE }), re, baseUrl);
      eq((err as BoostChatError).kind, "config", `${baseUrl} kind`);
    }
    await rejects(() => createPublisherClient({ baseUrl: bc.url, token: "", siteId: SITE }), /BOOSTCHAT_PUBLISHER_TOKEN is missing/, "no token");
  });
  await check("H3 an asset is refused when its bytes are not the export's (sha256 / size), when the transfer header disagrees, when it is unknown (404) and — without any request — when its href leaves /api/publisher/sites/<siteId>/assets/", async () => {
    const client = createPublisherClient({ baseUrl: bc.url, token: TOKEN, siteId: SITE, ...quick });
    const a = makeExport(V1).assets[0]!;
    await rejects(() => client.getAsset({ ...a, sha256: "0".repeat(64) }), /downloaded \d+ B sha256 .* ≠ export/, "sha256");
    await rejects(() => client.getAsset({ ...a, size: a.size + 1 }), /≠ export/, "size");
    bc.assetHeaderSha = () => "f".repeat(64);
    await rejects(() => client.getAsset(a), /X-Asset-Sha256 header/, "header");
    bc.assetHeaderSha = undefined;
    eq(((await rejects(() => client.getAsset({ ...a, href: `${assetPathPrefix(SITE)}nope` }), /HTTP 404/, "404")) as BoostChatError).kind, "http", "404 kind");
    const before = bc.requests.length;
    for (const href of ["https://evil.example/steal", "//evil.example/x", "/api/other", `${assetPathPrefix(SITE)}../../portfolio`, `${assetPathPrefix("another-site")}x`]) {
      await rejects(() => client.getAsset({ ...a, href }), /href is not under \/api\/publisher\/sites\/fixture-small\/assets\//, href);
    }
    eq(bc.requests.length, before, "no request was made for a foreign href");
  });
  await check("H4 result POST: a network error is retried with the SAME body until it is delivered (R4); a 5xx too; 409 stale_revision comes back as `stale` with the server's revisions; a 4xx and publisher_not_configured are not retried; it gives up after the configured attempts", async () => {
    const logs: string[] = [];
    const client = createPublisherClient({ baseUrl: bc.url, token: TOKEN, siteId: SITE, ...quick, postAttempts: 4, log: (l) => logs.push(l) });
    const posts = () => bc.requests.filter((q) => q.method === "POST").length;
    let n = posts();
    bc.postScript = ["drop", "drop"];
    eq((await client.postResult(SUCCEEDED)).status, "accepted", "delivered on the third attempt");
    eq([posts() - n, bc.results.length], [3, 1], "three POSTs, one accepted");
    noToken(logs.join("\n"), "the retry log");
    n = posts();
    bc.postScript = [500, 502];
    eq((await client.postResult(SUCCEEDED)).status, "accepted", "5xx retried");
    eq(posts() - n, 3, "three POSTs");
    bc.postScript = ["stale"];
    bc.desired = 4;
    bc.live = 3;
    eq(await client.postResult(SUCCEEDED), { status: "stale", revision: 4, liveRevision: 3 }, "409");
    n = posts();
    bc.postScript = [400];
    await rejects(() => client.postResult(SUCCEEDED), /result: HTTP 400/, "400");
    bc.postScript = [503];
    await rejects(() => client.postResult(SUCCEEDED), /publisher_not_configured/, "503 not configured");
    eq(posts() - n, 2, "neither was retried");
    n = posts();
    bc.postScript = ["drop", "drop", "drop", "drop", "drop"];
    const gaveUp = (await rejects(() => client.postResult(SUCCEEDED), /could not be delivered after 4 attempt\(s\)/, "gives up")) as BoostChatError;
    eq([gaveUp.kind, posts() - n], ["network", 4], "four attempts");
    bc.postScript = [];
    await rejects(() => client.postResult({ ...SUCCEEDED, packageHash: "nope" } as PortfolioResult), /packageHash|Invalid/i, "an invalid result is never sent");
    const huge = { ...SUCCEEDED, verified: { present: Array.from({ length: 400 }, (_, i) => `record-with-a-long-identifier-${String(i).padStart(4, "0")}-abcdefghijklmnopqrstuv`), absent: [] } } as PortfolioResult;
    await rejects(() => client.postResult(huge), new RegExp(`over the contract's ${RESULT_BODY_MAX} B`), "16 KiB");
    Object.assign(bc, { desired: 1, live: 0 });
    bc.results.length = 0;
  });
} finally {
  await bc.close();
}
await check("H5 contract helpers: a result message is one line of at most 500 characters; the result schema accepts exactly the two shapes of §4", () => {
  eq(resultMessage("  build\nfailed:\t next   exited 1 "), "build failed: next exited 1", "flattened");
  const long = resultMessage("x".repeat(2000));
  eq([long.length, long.endsWith("…")], [RESULT_MESSAGE_MAX, true], "clipped");
  eq(resultMessage("   "), "unknown error", "never empty");
  assert(PortfolioResultSchema.safeParse(SUCCEEDED).success, "succeeded");
  const { portfolioVersion: _v, ...noVersion } = SUCCEEDED as Extract<PortfolioResult, { outcome: "succeeded" }>;
  assert(PortfolioResultSchema.safeParse(noVersion).success, "portfolioVersion is optional (integration off)");
  assert(PortfolioResultSchema.safeParse({ schema: RESULT_SCHEMA, revision: 2, outcome: "failed", error: { stage: "build", message: "m" } }).success, "failed");
  for (const bad of [{ ...SUCCEEDED, error: { stage: "build", message: "m" } }, { schema: RESULT_SCHEMA, revision: 2, outcome: "failed", error: { stage: "deploy", message: "m" } }, { schema: RESULT_SCHEMA, revision: 2, outcome: "failed", error: { stage: "build", message: "x".repeat(501) } }, { ...SUCCEEDED, revision: -1 }]) {
    assert(!PortfolioResultSchema.safeParse(bad).success, `accepted ${JSON.stringify(bad).slice(0, 80)}`);
  }
});

// ==================================================================== verify ==
console.log("\n[verify] the public URL checks against an in-process static server");
interface FakeSite {
  url: string;
  close(): Promise<void>;
  slugs: Set<string>;
  /** exact bytes per path (a "published package"); looked up before `slugs` */
  pages: Map<string, Uint8Array>;
  manifestVersion: string | undefined;
  hits: string[];
  /** answer the first N requests of a path with 404 (propagation delay) */
  lateBy: Map<string, number>;
}
async function fakeSite(): Promise<FakeSite> {
  const site = { slugs: new Set<string>(), pages: new Map(), manifestVersion: undefined, hits: [], lateBy: new Map() } as unknown as FakeSite;
  const server = http.createServer((req, res) => {
    const p = new URL(req.url ?? "/", "http://x").pathname;
    site.hits.push(p);
    const late = site.lateBy.get(p) ?? 0;
    if (late > 0) {
      site.lateBy.set(p, late - 1);
      res.writeHead(404).end("not yet");
    } else if (p === "/_integration/manifest.json" && site.manifestVersion) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ schemaVersion: "0.1", resources: { portfolio: { href: `/_integration/portfolio.${site.manifestVersion}.json`, version: site.manifestVersion } } }));
    } else if (site.pages.has(p)) res.writeHead(200, { "content-type": "application/octet-stream" }).end(Buffer.from(site.pages.get(p)!));
    else if (p.startsWith("/portfolio/") && site.slugs.has(p.slice("/portfolio/".length))) res.writeHead(200, { "content-type": "text/html" }).end("<h1>detail</h1>");
    else res.writeHead(404, { "content-type": "text/html" }).end("<h1>404</h1>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  site.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  site.close = () => new Promise<void>((r) => server.close(() => r()));
  return site;
}
const fast = { attempts: 1, delayMs: 1, timeoutMs: 5000 };
const web = await fakeSite();
try {
  await check("V1 present = the detail page answered 200, absent = the old detail URL answered 404; a page that is missing or a removed page that still answers is reported as unconfirmed, never as verified", async () => {
    web.slugs = new Set(["a", "b", "still-there"]);
    const r = await verifyPublic({ base: web.url, present: [{ id: "id-a", slug: "a" }, { id: "id-b", slug: "b" }, { id: "id-missing", slug: "missing" }], absent: [{ id: "id-gone", slug: "gone" }, { id: "id-still", slug: "still-there" }], ...fast });
    eq([r.present, r.absent, r.errors, r.manifest], [["id-a", "id-b"], ["id-gone"], [], undefined], "verified");
    eq(r.unconfirmed, [{ id: "id-missing", url: `${web.url}/portfolio/missing`, expected: 200, got: 404 }, { id: "id-still", url: `${web.url}/portfolio/still-there`, expected: 404, got: 200 }], "unconfirmed");
  });
  await check("V2 the integration manifest must name the version just built: equal → ok, another version / no manifest → mismatch; without an expected version the manifest is not requested at all", async () => {
    web.manifestVersion = "aa".repeat(16);
    web.hits.length = 0;
    const ok = await verifyPublic({ base: web.url, present: [{ id: "id-a", slug: "a" }], absent: [], expectPortfolioVersion: "aa".repeat(16), ...fast });
    eq(ok.manifest, { url: `${web.url}/_integration/manifest.json`, expected: "aa".repeat(16), got: "aa".repeat(16), ok: true }, "match");
    const old = await verifyPublic({ base: web.url, present: [], absent: [], expectPortfolioVersion: "bb".repeat(16), ...fast });
    eq([old.manifest!.ok, old.manifest!.got], [false, "aa".repeat(16)], "another version");
    web.manifestVersion = undefined;
    const none = await verifyPublic({ base: web.url, present: [], absent: [], expectPortfolioVersion: "bb".repeat(16), ...fast });
    eq([none.manifest!.ok, none.manifest!.got], [false, "HTTP 404"], "no manifest");
    web.hits.length = 0;
    await verifyPublic({ base: web.url, present: [{ id: "id-a", slug: "a" }], absent: [], ...fast });
    eq(web.hits, ["/portfolio/a"], "integration off → no manifest request");
  });
  await check("V3 a check is repeated before it is given up (the pointer has just moved); a host that does not answer is an ERROR, not an unconfirmed record; the base must be a bare origin", async () => {
    web.lateBy.set("/portfolio/a", 2);
    const r = await verifyPublic({ base: web.url, present: [{ id: "id-a", slug: "a" }], absent: [], attempts: 3, delayMs: 1 });
    eq([r.present, r.unconfirmed], [["id-a"], []], "confirmed on the third attempt");
    web.lateBy.set("/portfolio/a", 2);
    const tooFew = await verifyPublic({ base: web.url, present: [{ id: "id-a", slug: "a" }], absent: [], attempts: 2, delayMs: 1 });
    eq([tooFew.present, tooFew.unconfirmed.length], [[], 1], "two attempts are not enough");
    web.lateBy.clear();
    const dead = await verifyPublic({ base: "http://127.0.0.1:9", present: [{ id: "id-a", slug: "a" }], absent: [{ id: "id-g", slug: "g" }], expectPortfolioVersion: "aa".repeat(16), ...fast });
    eq([dead.present, dead.absent, dead.unconfirmed, dead.errors.length, dead.manifest], [[], [], [], 3, undefined], "nothing answered");
    eq([verifyBaseOrigin("https://Site.Example/"), verifyBaseOrigin("http://localhost:8787")], ["https://site.example", "http://localhost:8787"], "origins");
    for (const bad of ["site.example", "https://site.example/portfolio", "https://site.example/?x=1", "ftp://site.example"]) await rejects(() => verifyBaseOrigin(bad), /--verify-base/, bad);
  });
} finally {
  await web.close();
}

// ===================================================================== cycle ==
console.log("\n[cycle] generate → build → publish → verify → report (fake BoostChat, fake build/publish, real generator)");
interface Rig {
  root: string;
  dir: string;
  bc: FakeBoostChat;
  web: FakeSite;
  calls: string[];
  logs: string[];
  options: SyncOptions;
  /** what the fake build / publish do next */
  buildFails?: string;
  publishFails?: string;
  liveAfterFailedPublish?: boolean;
  /** the failing publish still moved the routing pointer (the public site serves the new package) */
  deployOnFailedPublish?: boolean;
  portfolioVersion: string | undefined;
  /** the files of the package the fake build produced last, by URL path */
  pkg: Map<string, Uint8Array>;
  close(): Promise<void>;
}
const enc = (text: string) => new TextEncoder().encode(text);
const fastSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5)));
const PKG = (n: number) => String(n).padStart(2, "0").repeat(32);
async function rig(): Promise<Rig> {
  const { root, dir } = await tempRoot(SITE);
  const bcFake = await fakeBoostChat();
  const webFake = await fakeSite();
  const r = { root, dir, bc: bcFake, web: webFake, calls: [], logs: [], portfolioVersion: "aa".repeat(16), pkg: new Map() } as unknown as Rig;
  const deploy = () => {
    // "the routing pointer moved": the public site serves exactly the package built last
    webFake.pages = new Map(r.pkg);
    webFake.manifestVersion = r.portfolioVersion;
  };
  let builds = 0;
  let lastBuilt = "";
  const client = createPublisherClient({ baseUrl: bcFake.url, token: TOKEN, siteId: SITE, ...quick, postAttempts: 2, log: (l) => r.logs.push(l) });
  r.options = {
    repoRoot: root,
    siteId: SITE,
    verifyBase: webFake.url,
    source: clientSource(client, "fake BoostChat"),
    log: (l) => r.logs.push(l),
    sleep: fastSleep,
    build: async (): Promise<BuildOutcome> => {
      r.calls.push("build");
      if (r.buildFails) throw new Error(r.buildFails);
      // a real build loads the site through the guarded loader
      await buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: new Date().toISOString() });
      lastBuilt = PKG(++builds);
      // a package: one detail page per record, its cover image, the listing page — bytes that differ per build
      const items = (await readJson(path.join(dir, "content/projects.json"))).items as { id: string; slug: string; cover: { asset: string } }[];
      const registry = (await readJson(path.join(dir, "assets/registry.json"))).items as { id: string; file: string }[];
      const pkg = new Map<string, Uint8Array>();
      const records: Record<string, ExpectedFile[]> = {};
      for (const p of items) {
        const page = enc(`<h1>${p.id}</h1><!-- build ${builds} -->`);
        const file = registry.find((e) => e.id === p.cover.asset)!.file;
        const cover = await readFile(path.join(dir, "assets", file));
        pkg.set(`/portfolio/${p.slug}`, page);
        pkg.set(`/assets/${file}`, cover);
        records[p.id] = [{ path: `/portfolio/${p.slug}`, sha256: sha256(page) }, { path: `/assets/${file}`, sha256: sha256(cover) }];
      }
      const list = enc(`<ul>${items.map((p) => p.slug).join(",")}</ul><!-- build ${builds} -->`);
      pkg.set("/portfolio", list);
      r.pkg = pkg;
      return { status: "built", packageHash: lastBuilt, ...(r.portfolioVersion ? { portfolioVersion: r.portfolioVersion } : {}), files: { list: { path: "/portfolio", sha256: sha256(list) }, records } };
    },
    publish: async (expect) => {
      r.calls.push(`publish ${expect.slice(0, 4)}`);
      if (r.publishFails) {
        if (r.deployOnFailedPublish) deploy();
        throw new Error(r.publishFails);
      }
      deploy();
    },
    liveIs: async (hash) => {
      r.calls.push(`liveIs ${hash.slice(0, 4)}`);
      return r.liveAfterFailedPublish;
    },
    verify: (input) => {
      r.calls.push("verify");
      return verifyPublic({ ...input, ...fast });
    },
  };
  r.close = async () => {
    await bcFake.close();
    await webFake.close();
  };
  return r;
}
const posts = (r: Rig) => r.bc.requests.filter((q) => q.method === "POST").length;

await check("S1 revision == liveRevision → nothing is built, published or reported. A checkout whose generated files are NOT that revision (a hand-authored tree, an older generation) is first regenerated from the export, silently; a checkout already at it is not touched at all", async () => {
  const r = await rig();
  try {
    r.bc.live = 1;
    const before = await digest(r.dir);
    eq(await runSync(r.options), [{ status: "nothing-to-do", revision: 1, regenerated: true }], "first: this checkout is regenerated");
    eq([r.calls, posts(r), (await readManagedManifest(r.dir))!.source.revision, await managedPortfolioProblems(r.dir, SITE)], [[], 0, 1, []], "generated at the live revision; no build / publish / report");
    const generated = await digest(r.dir);
    assert(JSON.stringify(generated) !== JSON.stringify(before), "the tree was not regenerated");
    r.bc.requests.length = 0;
    eq(await runSync(r.options), [{ status: "nothing-to-do", revision: 1, regenerated: false }], "second: nothing");
    eq([r.calls, r.bc.requests.map((q) => q.method), await digest(r.dir)], [[], ["GET"], generated], "one GET, nothing else");
    // a checkout generated from an OLDER revision than the live one is brought to it too
    Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2, live: 2 });
    eq((await runSync(r.options))[0], { status: "nothing-to-do", revision: 2, regenerated: true }, "stale checkout");
    eq([(await readManagedManifest(r.dir))!.source.revision, r.calls, posts(r)], [2, [], 0], "now at revision 2");
    // a refusal on this silent path is local: BoostChat asked for nothing, so it is told nothing
    Object.assign(r.bc, { doc: makeExport({ ...V1, publicOrigin: "https://other.example" }), desired: 3, live: 3 });
    const [bad] = await runSync(r.options);
    eq([bad!.status, (bad as { report?: string }).report, posts(r)], ["failed", "not-reported", 0], "not reported");
  } finally {
    await r.close();
  }
});
await check("S2 success path: the export is generated into the site directory, built, exactly the built package is published, every record is seen on the public URL and the result reports what was seen (packageHash, portfolioVersion, verified.present); then a removal is verified by the OLD detail URL answering 404", async () => {
  const r = await rig();
  try {
    const [first] = await runSync(r.options);
    assert(first!.status === "succeeded", `status ${first!.status}`);
    eq(r.calls, ["build", "publish 0101", "verify"], "stages in order");
    eq(r.bc.results, [{ schema: RESULT_SCHEMA, revision: 1, outcome: "succeeded", packageHash: PKG(1), portfolioVersion: "aa".repeat(16), verified: { present: ["maru-011", "sync-b", "sync-c"], absent: [] } }], "reported");
    eq([first!.complete, first!.report, first!.again, r.bc.live], [true, "accepted", false, 1], "accepted");
    eq(r.bc.requests.filter((q) => q.path.startsWith(assetPathPrefix(SITE))).length, 5, "five images downloaded");
    eq(await managedPortfolioProblems(r.dir, SITE), [], "the site directory is a consistent managed site");
    noToken(r.logs.join("\n"), "the log");
    // revision 2 removes sync-b
    Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2 });
    r.calls.length = 0;
    r.bc.requests.length = 0;
    const [second] = await runSync(r.options);
    assert(second!.status === "succeeded", `status ${second!.status}`);
    eq(r.bc.results[1], { schema: RESULT_SCHEMA, revision: 2, outcome: "succeeded", packageHash: PKG(2), portfolioVersion: "aa".repeat(16), verified: { present: ["maru-011", "sync-c"], absent: ["sync-b"] } }, "reported");
    assert(r.web.hits.includes("/portfolio/sync-b-kitchen"), "the old detail URL was requested");
    eq(r.bc.requests.filter((q) => q.path.startsWith(assetPathPrefix(SITE))).length, 0, "images already on disk are not downloaded again");
    assert(!(await exists(path.join(r.dir, "assets/sync-b-cover.webp"))), "the removed project's image is gone");
  } finally {
    await r.close();
  }
});
await check("S2b absence is verified by the slug the EXPORT names — also for a record this working tree never served; a removed record whose slug another record of the same export now serves cannot answer 404: it is reported absent when that record's page is confirmed", async () => {
  const r = await rig();
  try {
    await runSync(r.options);
    r.web.hits.length = 0;
    const P_D = project("sync-d", "sync-b-kitchen", "sync-b-cover", ["sync-shared"]);
    Object.assign(r.bc, {
      doc: makeExport({ projects: [P_A, P_C, P_D], assets: [A_COVER, A_ROOM, B_COVER, C_COVER, SHARED], removing: [{ id: "elsewhere-01", slug: "served-by-another-checkout" }, SYNC_B_RETIRED] }),
      assets: bytesOf(V1.assets),
      desired: 2,
    });
    const [res] = await runSync(r.options);
    assert(res!.status === "succeeded" && res!.complete, `status ${res!.status}: ${JSON.stringify(res).slice(0, 300)}`);
    eq((r.bc.results[1] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified, { present: ["maru-011", "sync-c", "sync-d"], absent: ["elsewhere-01", "sync-b"] }, "reported");
    assert(r.web.hits.includes("/portfolio/served-by-another-checkout"), "the export's slug was requested for a record this tree never served");
    // a removed record whose old URL still answers is NOT reported absent
    const realPublish = r.options.publish;
    r.options.publish = async (expect) => {
      await realPublish(expect);
      r.web.pages.set("/portfolio/still-up", enc("the removed record's page is still served"));
    };
    Object.assign(r.bc, { doc: makeExport({ ...V2, removing: [{ id: "sync-d", slug: "still-up" }] }), assets: bytesOf(V2.assets), desired: 3 });
    const [partial] = await runSync(r.options);
    assert(partial!.status === "succeeded", `status ${partial!.status}`);
    eq([partial!.complete, partial!.unconfirmed, partial!.result.verified.absent], [false, ["sync-d"], []], "still answering → unconfirmed, not absent");
  } finally {
    await r.close();
  }
});
await check("S3 a build failure after the directory was regenerated: `failed` / build is reported with the stage's FIXED sentence (no build output, no path), and the previous generated files are back byte for byte. A publish failure is decided by READING the routing pointer back: not moved → restored (and rebuilt, so the build pointer is not left on an unpublished package); unreadable → nothing undone, nothing reported; moved → the public site decides", async () => {
  const r = await rig();
  try {
    await runSync(r.options);
    const live = await digest(r.dir);
    Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2 });
    r.buildFails = `next build exited 1\n   at ${r.root}/data/sites/x\n${"very long output ".repeat(80)}`;
    r.calls.length = 0;
    const [built] = await runSync(r.options);
    eq([built!.status, (built as { stage?: string }).stage, (built as { restored?: boolean }).restored, r.calls], ["failed", "build", true, ["build"]], "failed at build, restored, publish never ran");
    eq(await digest(r.dir), live, "the directory is the live generation again");
    const failed = r.bc.results[1] as Extract<PortfolioResult, { outcome: "failed" }>;
    eq([failed.revision, failed.outcome, failed.error], [2, "failed", { stage: "build", message: STAGE_FAILURE_MESSAGE.build }], "reported: the stage and its fixed sentence");
    const local = (built as { message: string }).message;
    assert(/next build exited 1/.test(local) && local.length <= RESULT_MESSAGE_MAX && !local.includes("\n") && !local.includes(r.root), `local detail: ${local}`);
    eq((built as { again?: boolean }).again, false, "a failure never loops by itself (BoostChat's raised revision waits for the next run)");
    // publish failure, pointer read back: NOT moved → restored, and built again so current.json describes the restored site
    r.buildFails = undefined;
    r.publishFails = "injected put failure: sites/x";
    r.liveAfterFailedPublish = false;
    r.calls.length = 0;
    const [pub] = await runSync(r.options);
    eq([pub!.status, (pub as { stage?: string }).stage, (pub as { restored?: boolean }).restored], ["failed", "publish", true], "failed at publish");
    eq(r.calls.map((c) => c.split(" ")[0]), ["build", "publish", "liveIs", "build"], "pointer read back, then rebuilt on the restored files");
    eq(await digest(r.dir), live, "restored");
    eq((r.bc.results[2] as Extract<PortfolioResult, { outcome: "failed" }>).error, { stage: "publish", message: STAGE_FAILURE_MESSAGE.publish }, "reported");
    // the pointer cannot be read (a timed-out PUT says nothing): unknown → nothing undone, nothing reported
    r.liveAfterFailedPublish = undefined;
    r.publishFails = "routing pointer PUT timed out";
    r.calls.length = 0;
    const n = posts(r);
    const [unknown] = await runSync(r.options);
    eq([unknown!.status, posts(r) - n, r.calls.filter((c) => c.startsWith("liveIs")).length], ["unverified", 0, 3], "unverified: pointer asked three times, no report");
    eq((await readJson(path.join(r.dir, "content/projects.json"))).items.map((p: { id: string }) => p.id), ["maru-011", "sync-c"], "the regenerated files are kept");
    // the pointer names the new package although the publish threw → verified on the public site and reported as it is
    r.liveAfterFailedPublish = true;
    r.deployOnFailedPublish = true;
    const [moved] = await runSync(r.options);
    assert(moved!.status === "succeeded" && moved!.complete, `status ${moved!.status}: ${JSON.stringify(moved).slice(0, 300)}`);
    eq(moved!.result.verified, { present: ["maru-011", "sync-c"], absent: ["sync-b"] }, "reported what the public site serves");
  } finally {
    await r.close();
  }
});
await check("S4 a generate failure is reported as `failed` / generate with the fixed sentence and writes nothing: a damaged asset, a record the content model rejects, another publicOrigin, an unknown schema (reported with the revision it carries); the cause stays in the local result / log", async () => {
  const r = await rig();
  try {
    const before = await digest(r.dir);
    const run = async () => (await runSync(r.options))[0] as Extract<CycleResult, { status: "failed" }>;
    r.bc.assets = new Map([...bytesOf(V1.assets)].map(([id, b]) => [id, id === "sync-shared" ? b.slice(1) : b]));
    const damaged = await run();
    r.bc.assets = bytesOf(V1.assets);
    r.bc.doc = makeExport({ ...V1, projects: [P_A, P_B, { ...P_C, title: "" }] });
    const invalid = await run();
    r.bc.doc = makeExport({ ...V1, publicOrigin: "https://other.example" });
    const origin = await run();
    r.bc.doc = makeExport({ ...V1, schema: "boostchat-portfolio-export@2" });
    const schema = await run();
    eq([damaged, invalid, origin, schema].map((x) => [x.status, x.stage, x.report]), Array(4).fill(["failed", "generate", "accepted"]), "four failures at generate");
    eq(r.bc.results, [1, 2, 3, 4].map((revision) => ({ schema: RESULT_SCHEMA, revision, outcome: "failed", error: { stage: "generate", message: STAGE_FAILURE_MESSAGE.generate } })), "four reports, each at the revision it read, each the fixed sentence");
    assert(/asset "sync-shared"/.test(damaged.message) && /sync-c/.test(invalid.message) && /P5/.test(origin.message) && /unknown export schema/.test(schema.message), "the local messages name the cause");
    for (const m of Object.values(STAGE_FAILURE_MESSAGE)) assert(m.length <= RESULT_MESSAGE_MAX && !/[\/\\]|pnpm|tsx|node|wrangler|next/.test(m), `not customer-safe: ${m}`);
    eq([r.calls, await digest(r.dir)], [[], before], "nothing built, nothing written");
  } finally {
    await r.close();
  }
});
await check("S5 verify is bound to the package just built: a record whose detail page is missing, or served with OTHER bytes (an older package), or whose cover is not the built one, is NOT in `verified`; a listing page or manifest that is not the built package's is `failed` / verify (the files stay); a host that does not answer is `unverified` — published, nothing undone, nothing reported", async () => {
  const r = await rig();
  try {
    const realPublish = r.options.publish;
    r.options.publish = async (expect) => {
      await realPublish(expect);
      r.web.pages.delete("/portfolio/sync-c-bath"); // one detail page is not there
      r.web.pages.set("/portfolio/sync-b-kitchen", enc("<h1>sync-b</h1><!-- an older build -->")); // one is another package's
    };
    const [partial] = await runSync(r.options);
    assert(partial!.status === "succeeded", `status ${partial!.status}`);
    eq([partial!.complete, partial!.unconfirmed, partial!.result.verified.present], [false, ["sync-b", "sync-c"], ["maru-011"]], "partial");
    eq((r.bc.results[0] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified, { present: ["maru-011"], absent: [] }, "reported exactly what was seen");
    assert(r.logs.some((l) => /NOT CONFIRMED sync-b: .*answered 200 \(served sha256 .* is not the built package's/.test(l)), "the log says the bytes differ");
    // a cover image that is not the built one
    Object.assign(r.bc, { desired: 2 });
    r.options.publish = async (expect) => {
      await realPublish(expect);
      r.web.pages.set("/assets/sync-c-cover.jpg", enc("another image"));
    };
    eq((await runSync(r.options))[0]!.status === "succeeded" && (r.bc.results[1] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified.present, ["maru-011", "sync-b"], "cover mismatch → not verified");
    // the listing page is an older package's → the public URL does not serve this package at all
    Object.assign(r.bc, { desired: 3 });
    r.options.publish = async (expect) => {
      await realPublish(expect);
      r.web.pages.set("/portfolio", enc("<ul>the previous listing</ul>"));
    };
    const [oldList] = await runSync(r.options);
    eq([oldList!.status, (oldList as { stage?: string }).stage, (oldList as { restored?: boolean }).restored], ["failed", "verify", false], "listing mismatch");
    assert(/is not the listing page of the package just built/.test((oldList as { message: string }).message), (oldList as { message: string }).message);
    // manifest mismatch
    r.options.publish = async (expect) => {
      await realPublish(expect);
      r.web.manifestVersion = "ee".repeat(16);
    };
    const [stale] = await runSync(r.options);
    eq([stale!.status, (stale as { stage?: string }).stage, (stale as { restored?: boolean }).restored], ["failed", "verify", false], "manifest mismatch");
    assert(/reports portfolio version e{32}, the package just built carries a{32}/.test((stale as { message: string }).message), (stale as { message: string }).message);
    eq(await managedPortfolioProblems(r.dir, SITE), [], "the regenerated files are kept");
    eq((r.bc.results.at(-1) as Extract<PortfolioResult, { outcome: "failed" }>).error, { stage: "verify", message: STAGE_FAILURE_MESSAGE.verify }, "reported with the fixed sentence");
    // an integration-off site (no manifest) is bound to the package the same way: nothing of it is served → failed, never an empty success
    r.portfolioVersion = undefined;
    r.options.publish = async () => {
      r.web.pages = new Map([["/portfolio", enc("some other site")]]);
      r.web.manifestVersion = undefined;
    };
    const none = await runCycle(r.options);
    eq([none.status, (none as { stage?: string }).stage], ["failed", "verify"], "integration off, another package behind the URL");
    // the public site cannot be reached: the package is live as far as anyone knows → unverified, no `failed` report
    r.options.publish = realPublish;
    const n = posts(r);
    const dead = await runCycle({ ...r.options, verifyBase: "http://127.0.0.1:9" });
    eq([dead.status, posts(r) - n], ["unverified", 0], "no answer → unverified, nothing reported");
    assert(/request\(s\) got no answer/.test((dead as { message: string }).message), (dead as { message: string }).message);
    const [later] = await runSync(r.options);
    eq(later!.status, "succeeded", "the next run verifies and reports");
  } finally {
    await r.close();
  }
});
await check("S6 409 stale_revision on the result → the export is read again and the newer revision is processed; a success whose ack shows a newer desired revision loops once more; cycles never overlap", async () => {
  const r = await rig();
  try {
    let running = 0;
    let maxRunning = 0;
    const build = r.options.build;
    r.options.build = async () => {
      maxRunning = Math.max(maxRunning, ++running);
      try {
        return await build();
      } finally {
        running--;
      }
    };
    // while revision 1 is being processed BoostChat moves on to revision 2 and refuses the report for 1
    r.bc.postScript = ["stale"];
    const verify = r.options.verify;
    let bumped = false;
    r.options.verify = async (input): Promise<VerifyOutcome> => {
      if (!bumped) {
        bumped = true;
        Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2, live: 1 });
      }
      return verify(input);
    };
    const results = await runSync(r.options);
    eq(results.map((x) => [x.status, (x as { report?: string }).report, x.revision]), [["succeeded", "stale", 1], ["succeeded", "accepted", 2]], "two cycles");
    eq([r.bc.requests.filter((q) => q.method === "GET" && q.path === exportPath(SITE)).length, posts(r), r.bc.results.map((x) => x.revision), maxRunning], [2, 2, [2], 1], "export read twice, two POSTs, only revision 2 accepted, never two cycles at once");
    // ack says a newer revision is already waiting → one more cycle in the same run
    r.bc.onResult = (result) => {
      if (result.revision === 3) Object.assign(r.bc, { doc: makeExport({ ...V1, revision: 4 }), assets: bytesOf(V1.assets), desired: 4 });
    };
    Object.assign(r.bc, { desired: 3 });
    const more = await runSync(r.options);
    eq(more.map((x) => [x.status, x.revision, (x as { again?: boolean }).again]), [["succeeded", 3, true], ["succeeded", 4, false]], "looped once more");
  } finally {
    await r.close();
  }
});
await check("S7 BoostChat cannot be asked (401, connection refused) → the run stops with a transport error: nothing written, built or reported; a result that cannot be delivered is retried and then flagged `undelivered`", async () => {
  const r = await rig();
  try {
    const before = await digest(r.dir);
    const bad = clientSource(createPublisherClient({ baseUrl: r.bc.url, token: "x".repeat(40), siteId: SITE, ...quick }), "bad token");
    const e = (await rejects(() => runSync({ ...r.options, source: bad }), /401 unauthorized/, "401")) as BoostChatError;
    eq([e.kind, r.calls, posts(r), await digest(r.dir)], ["auth", [], 0, before], "nothing happened");
    const down = clientSource(createPublisherClient({ baseUrl: "http://127.0.0.1:9", token: TOKEN, siteId: SITE, ...quick }), "down");
    eq(((await rejects(() => runSync({ ...r.options, source: down }), /GET \/api\/publisher\/sites\/fixture-small\/portfolio: /, "refused")) as BoostChatError).kind, "network", "network kind");
    r.bc.postScript = ["drop", "drop"];
    const [res] = await runSync(r.options);
    eq([res!.status, (res as { report?: string }).report, posts(r)], ["succeeded", "undelivered", 2], "published, both POST attempts lost");
    // the next run reports the same revision again (R4): nothing to rebuild, same result
    const [again] = await runSync(r.options);
    eq([again!.status, (again as { report?: string }).report, r.bc.results.length], ["succeeded", "accepted", 1], "delivered on the next run");
  } finally {
    await r.close();
  }
});
await check("S8 dry run: the plan is fetched, validated on a staged copy and returned — the site directory is untouched and nothing is built, published or reported; offline input (--from-file) generates without BoostChat and reports nowhere", async () => {
  const r = await rig();
  try {
    const before = await digest(r.dir);
    const [dry] = await runSync({ ...r.options, dryRun: true });
    assert(dry!.status === "dry-run", `status ${dry!.status}`);
    eq([dry!.plan.changed, dry!.plan.files.filter((f) => f.action === "create").length, r.calls, posts(r), await digest(r.dir)], [true, 6, [], 0, before], "dry run (5 images + the sidecar would be created)");
    assert(/^[0-9a-f]{64}$/.test(dry!.siteSnapshotHash), "siteSnapshotHash of the staged site");
    r.bc.live = 1; // even when nothing waits, a dry run shows the plan
    eq((await runSync({ ...r.options, dryRun: true }))[0]!.status, "dry-run", "dry run ignores revision == liveRevision");
    // offline
    const inbox = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-inbox-"));
    tmpRoots.push(inbox);
    await mkdir(path.join(inbox, "assets"));
    await writeFile(path.join(inbox, "export.json"), JSON.stringify(makeExport({ ...V1, revision: 1, liveRevision: 1 })));
    for (const a of V1.assets) await writeFile(path.join(inbox, "assets", a.file), a.bytes);
    const offline = { ...r.options, source: fileSource(path.join(inbox, "export.json"), path.join(inbox, "assets")) };
    const [gen] = await runSync({ ...offline, generateOnly: true });
    eq([gen!.status, r.calls, posts(r)], ["generated", [], 0], "generate only");
    eq(await managedPortfolioProblems(r.dir, SITE), [], "generated site is consistent");
    const [full] = await runSync(offline);
    eq([full!.status, (full as { report?: string }).report, r.calls.map((c) => c.split(" ")[0]), posts(r)], ["succeeded", "not-reported", ["build", "publish", "verify"], 0], "offline full run: built, published, verified, reported nowhere");
    await rm(path.join(inbox, "assets", "sync-shared.jpg"));
    const other = await tempRoot(SITE);
    const [lost] = await runSync({ ...offline, repoRoot: other.root, generateOnly: true });
    eq([lost!.status, (lost as { stage?: string }).stage, (lost as { report?: string }).report], ["failed", "generate", "not-reported"], "a missing offline asset fails generate");
  } finally {
    await r.close();
  }
});
await check("S9 the EXISTING publish is what moves the pointer: publishForSync refuses a package other than the one just built (site:publish's --expect-package guard) and liveIsFor reads the routing pointer", async () => {
  const store = new MemoryStore();
  const current = await readJson(path.join(repoRoot, "data/site-builds", SITE, "current.json"));
  const record = await readJson(path.join(repoRoot, current.packageDir, "build-record.json"));
  const publish = publishForSync({ repoRoot, siteId: SITE, hostname: "sync.test.example", store, requireOriginMatch: false });
  await rejects(() => publish("0".repeat(64)), /not the expected/, "another package");
  eq(store.writes, [], "nothing uploaded");
  const liveIs = liveIsFor(store, "sync.test.example");
  eq(await liveIs(record.packageHash), false, "no pointer yet");
  await publish(record.packageHash);
  eq([await liveIs(record.packageHash), await liveIs("0".repeat(64))], [true, false], "pointer names the published package");
  await rejects(() => publishForSync({ repoRoot, siteId: SITE, hostname: "sync.test.example", store, requireOriginMatch: true })(record.packageHash), /package was built for https:\/\/fixture-small\.example/, "origin guard kept (remote)");
});

// ======================================================================= cli ==
console.log("\n[cli] site:portfolio-sync");
function cli(args: string[], opts: { cwd: string; env?: Record<string, string | undefined>; script?: string }): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env };
    // never inherited: the remote gate is tested by its absence only
    delete env.RECON_PUBLISH_ALLOW_REMOTE;
    for (const [k, v] of Object.entries(opts.env ?? {})) if (v === undefined) delete env[k];
    const child = spawn(path.join(repoRoot, "node_modules/.bin/tsx"), ["--tsconfig", path.join(repoRoot, "platform/tsconfig.json"), path.join(repoRoot, "platform/cli", opts.script ?? "site-portfolio-sync.ts"), ...args], { cwd: opts.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}
await check("X1 usage errors and the remote gate exit 2 before anything is contacted: missing --site/--host, unknown flag, --once with --watch, --local with --remote, --interval without --watch, --from-file without --assets-dir, no BoostChat env — and --remote without RECON_PUBLISH_ALLOW_REMOTE=1", async () => {
  const { root } = await tempRoot(SITE);
  const env = { BOOSTCHAT_BASE_URL: "http://127.0.0.1:9", BOOSTCHAT_PUBLISHER_TOKEN: TOKEN };
  const cases: [string[], RegExp, Record<string, string | undefined>?][] = [
    [[], /usage: pnpm site:portfolio-sync/],
    [["--site", SITE], /usage:/],
    [["--site", SITE, "--host", "h.example", "--frobnicate"], /unknown arguments: --frobnicate/],
    [["--site", SITE, "--host", "h.example", "--once", "--watch"], /--once and --watch are exclusive/],
    [["--site", SITE, "--host", "h.example", "--local", "--remote"], /--local and --remote are exclusive/],
    [["--site", SITE, "--host", "h.example", "--interval", "5"], /needs --watch/],
    [["--site", SITE, "--host", "h.example", "--watch", "--dry-run"], /--watch does not combine/],
    [["--site", SITE, "--host", "h.example", "--from-file", "x.json"], /--from-file and --assets-dir go together/],
    [["--site", "Bad_Site", "--host", "h.example"], /invalid --site/],
    [["--site", SITE, "--host", "h.example:8787"], /must not include a port/],
    [["--site", SITE, "--host", "h.example", "--verify-base", "h.example/x"], /--verify-base/],
    [["--site", SITE, "--host", "h.example"], /BOOSTCHAT_BASE_URL and BOOSTCHAT_PUBLISHER_TOKEN must be set/, { BOOSTCHAT_BASE_URL: undefined, BOOSTCHAT_PUBLISHER_TOKEN: undefined }],
    [["--site", SITE, "--host", "h.example"], /must be https/, { BOOSTCHAT_BASE_URL: "http://boostchat.example" }],
    [["--site", SITE, "--host", "h.example", "--remote"], /--remote reaches the live bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1/],
    [["--site", SITE, "--host", "h.example", "--remote", "--watch"], /refused unless RECON_PUBLISH_ALLOW_REMOTE=1/],
    // what is published, where it is checked and who is told must be one environment
    [["--site", SITE, "--host", "h.example"], /a --local publish goes into the local runtime state, not to https:\/\/h\.example: pass --verify-base/],
    [["--site", SITE, "--host", "h.example", "--verify-base", "https://h.example"], /--local publishes into the local runtime state; it cannot be verified on https:\/\/h\.example/],
    [["--site", SITE, "--host", "h.example", "--watch", "--verify-base", "https://h.example"], /cannot be verified on https:\/\/h\.example/],
    [["--site", SITE, "--host", "h.example", "--verify-base", "http://localhost:8787"], /a --local publish must not be reported to https:\/\/boostchat\.example as live/, { BOOSTCHAT_BASE_URL: "https://boostchat.example" }],
    [["--site", SITE, "--host", "h.example", "--from-file", "x.json", "--assets-dir", "x", "--remote"], /--from-file with --remote would publish to the live bucket without reporting to BoostChat; refused/],
  ];
  for (const [args, re, extra] of cases) {
    const r = await cli(args, { cwd: root, env: { ...env, ...extra } });
    assert(r.code === 2 && re.test(r.out), `${args.join(" ") || "(no args)"} → exit ${r.code}: ${r.out.slice(0, 300)}`);
    noToken(r.out, `output of ${args.join(" ")}`);
  }
  // (--remote with a loopback verify base is refused by the same rule; it sits behind the remote gate, which no test opens)
  eq(["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787", "http://x.localhost", "https://h.example", "http://127.0.0.1.example"].map(isLoopbackOrigin), [true, true, true, true, false, false], "loopback origins");
});
await check("X2 --dry-run against BoostChat prints the plan, exits 0 and leaves the site directory, the build output and BoostChat's state alone (also with --remote: a dry run is offline towards the store); a wrong token exits 3; --from-file --generate-only writes the generated files and exits 0; a refused export exits 1", async () => {
  const { root, dir } = await tempRoot(SITE);
  const fake = await fakeBoostChat();
  try {
    const env = { BOOSTCHAT_BASE_URL: fake.url, BOOSTCHAT_PUBLISHER_TOKEN: TOKEN };
    const before = await digest(dir);
    for (const extra of [[], ["--remote"]]) {
      const dry = await cli(["--site", SITE, "--host", "sync.test.example", "--dry-run", ...extra], { cwd: root, env });
      assert(dry.code === 0 && /DRY RUN — nothing written/.test(dry.out) && /create\tcontent\/projects\.json|replace\tcontent\/projects\.json/.test(dry.out) && /"siteSnapshotHash": "[0-9a-f]{64}"/.test(dry.out), `dry run ${extra.join(" ")}: exit ${dry.code}\n${dry.out.slice(-600)}`);
      noToken(dry.out, "dry-run output");
    }
    eq([await digest(dir), await exists(path.join(root, "data/site-builds")), fake.results.length, fake.requests.some((q) => q.method === "POST")], [before, false, 0, false], "nothing touched, nothing reported");
    assert(!(await exists(path.join(root, "tmp/portfolio-sync", `${SITE}.lock`))), "the lock was left behind");
    const denied = await cli(["--site", SITE, "--host", "sync.test.example", "--dry-run"], { cwd: root, env: { ...env, BOOSTCHAT_PUBLISHER_TOKEN: "y".repeat(40) } });
    assert(denied.code === 3 && /BoostChat could not be asked — nothing was changed: export: 401 unauthorized/.test(denied.out), `401: exit ${denied.code}\n${denied.out}`);
    assert(!denied.out.includes("y".repeat(40)), "the wrong token was printed");
    const inbox = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-inbox-"));
    tmpRoots.push(inbox);
    await mkdir(path.join(inbox, "assets"));
    await writeFile(path.join(inbox, "export.json"), JSON.stringify(makeExport(V1)));
    for (const a of V1.assets) await writeFile(path.join(inbox, "assets", a.file), a.bytes);
    const offline = ["--site", SITE, "--host", "sync.test.example", "--from-file", path.join(inbox, "export.json"), "--assets-dir", path.join(inbox, "assets")];
    const gen = await cli([...offline, "--generate-only"], { cwd: root, env: { BOOSTCHAT_BASE_URL: undefined, BOOSTCHAT_PUBLISHER_TOKEN: undefined } });
    assert(gen.code === 0 && /GENERATED — site directory written; nothing built, published or reported/.test(gen.out), `generate-only: exit ${gen.code}\n${gen.out.slice(-600)}`);
    eq([await managedPortfolioProblems(dir, SITE), await exists(path.join(root, "data/site-builds")), await exists(path.join(root, "tmp/recon-runtime-state"))], [[], false, false], "generated, not built, no store state");
    await writeFile(path.join(inbox, "export.json"), JSON.stringify(makeExport({ ...V1, publicOrigin: "https://other.example" })));
    const refused = await cli([...offline, "--generate-only"], { cwd: root, env: {} });
    assert(refused.code === 1 && /"stage": "generate"/.test(refused.out) && /contract P5/.test(refused.out), `refused: exit ${refused.code}\n${refused.out.slice(-600)}`);
  } finally {
    await fake.close();
  }
});

// ============================================ review regressions (F2, F3, F4) ==
console.log("\n[adopted] the tracked marker, transport vs export failures, watch backoff");
await check("F2 an ADOPTED site (tracked portfolio.source.json) cannot be built or manually published from a checkout that holds no generated portfolio: the loader refuses and names site:portfolio-sync, `site:publish` exits 2; with the generated files it loads; a checkout that is not at the live revision is regenerated by the next sync", async () => {
  const r = await rig();
  try {
    // adoption: the first managed sync writes the marker (to be committed) next to the generated files
    const [first] = await runSync({ ...r.options, adopt: true });
    eq([first!.status, await hasSourceMarker(r.dir), await managedPortfolioProblems(r.dir, SITE)], ["succeeded", true, []], "adopted and consistent");
    const load = () => buildSiteSnapshot({ repoRoot: r.root, siteId: SITE, mode: "public", at: new Date().toISOString() });
    const generated = (await load()).snapshot.content.projects.map((p) => p.id);
    eq(generated, ["maru-011", "sync-b", "sync-c"], "loads the generated portfolio");
    // "another checkout": the marker is tracked, the sidecar is not — the committed projects.json is NOT the truth
    await rm(path.join(r.dir, MANAGED_FILE));
    await rejects(load, /owned by BoostChat \(portfolio\.source\.json\) but this checkout holds no generated portfolio[\s\S]*site:portfolio-sync --site fixture-small/, "loader refuses");
    await rejects(() => r.options.build(), /owned by BoostChat/, "so does a build");
    const manual = await cli(["--site", SITE, "--host", "sync.test.example", "--local"], { cwd: r.root, script: "site-publish.ts" });
    assert(manual.code === 2 && /the portfolio of "fixture-small" is owned by BoostChat \(portfolio\.source\.json\); a manual publish is refused\. Run: pnpm site:portfolio-sync --site fixture-small --host sync\.test\.example --force/.test(manual.out), `site:publish: exit ${manual.code}\n${manual.out.slice(-400)}`);
    assert(!(await exists(path.join(r.root, "tmp/recon-runtime-state"))), "the manual publish touched the store");
    // the sync brings the checkout to what is live (nothing to publish: revision == liveRevision), then it loads again
    r.calls.length = 0;
    const n = posts(r);
    eq(await runSync(r.options), [{ status: "nothing-to-do", revision: 1, regenerated: true }], "regenerated");
    eq([(await load()).snapshot.content.projects.map((p) => p.id), r.calls, posts(r) - n], [generated, [], 0], "loads again; nothing built, published or reported");
    // a malformed marker is not "no marker"
    await writeFile(path.join(r.dir, SOURCE_MARKER_FILE), "{}\n");
    await rejects(load, /portfolio\.source\.json invalid/, "malformed marker");
  } finally {
    await r.close();
  }
});
await check("F3 an asset that cannot be FETCHED is not a broken export: 5xx / 429 on an asset stop the run as a transport error (nothing written, nothing reported); an asset 404 makes the publisher read the export again — it moved → that newer revision is processed instead; it did not → `failed` / generate", async () => {
  const r = await rig();
  try {
    const before = await digest(r.dir);
    for (const status of [500, 429]) {
      r.bc.assetStatus = (id) => (id === "sync-shared" ? status : undefined);
      const e = (await rejects(() => runSync(r.options), new RegExp(`asset "sync-shared": HTTP ${status}`), `asset ${status}`)) as BoostChatError;
      eq([e instanceof BoostChatError, e.status], [true, status], "a BoostChat transport error");
    }
    eq([r.calls, posts(r), await digest(r.dir)], [[], 0, before], "nothing written, built or reported");
    // 404 because a newer publish replaced the export while it was being downloaded
    r.bc.assetStatus = (id) => {
      if (id !== "sync-b-cover") return undefined;
      Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2 });
      return 404;
    };
    const moved = await runSync(r.options);
    eq(moved.map((x) => [x.status, x.revision]), [["retry", 1], ["succeeded", 2]], "read again, revision 2 processed");
    eq([r.bc.results.map((x) => [x.revision, x.outcome]), (await readJson(path.join(r.dir, "content/projects.json"))).items.map((p: { id: string }) => p.id)], [[[2, "succeeded"]], ["maru-011", "sync-c"]], "one report: revision 2");
    // 404 and the export still names that asset: this export cannot be generated
    Object.assign(r.bc, { doc: makeExport(V1), assets: bytesOf(V1.assets), desired: 3 });
    r.bc.assetStatus = (id) => (id === "sync-b-cover" ? 404 : undefined);
    const [gone] = await runSync(r.options);
    eq([gone!.status, (gone as { stage?: string }).stage, (gone as { report?: string }).report], ["failed", "generate", "accepted"], "failed at generate");
    eq(r.bc.results.at(-1), { schema: RESULT_SCHEMA, revision: 3, outcome: "failed", error: { stage: "generate", message: STAGE_FAILURE_MESSAGE.generate } }, "reported");
  } finally {
    await r.close();
  }
});
await check("F4 watch mode does not grind: the same export CONTENT that failed the same way is not processed or reported again before an exponentially growing instant (cap 10 min), although BoostChat raised the revision; new content, or the instant passing, is processed at once", async () => {
  const r = await rig();
  try {
    r.bc.doc = makeExport({ ...V1, publicOrigin: "https://other.example" });
    const failedOnce = await runCycle(r.options);
    assert(failedOnce.status === "failed" && failedOnce.contentHash, `status ${failedOnce.status}`);
    eq([posts(r), r.bc.desired], [1, 2], "reported once; BoostChat raised the desired revision (R3)");
    const T = 1_000_000;
    const m1 = nextFailureMemory(undefined, failedOnce, T, 60_000)!;
    eq([m1.failures, m1.until - T, m1.contentHash], [1, 60_000, failedOnce.contentHash], "first failure: one interval");
    // the next poll: revision 2, the same content → not generated, not reported
    r.bc.requests.length = 0;
    const waiting = await runCycle({ ...r.options, backoff: m1, now: () => T + 30_000 });
    eq([waiting, r.bc.requests.map((q) => q.method), r.calls], [{ status: "backing-off", revision: 2, until: m1.until }, ["GET"], []], "backing off: one GET, nothing else");
    eq(nextFailureMemory(m1, waiting, T + 30_000, 60_000), m1, "a skipped poll does not move the schedule");
    // the instant passed → tried again; the identical failure doubles the wait, up to the cap
    const failedTwice = await runCycle({ ...r.options, backoff: m1, now: () => m1.until + 1 });
    assert(failedTwice.status === "failed", `status ${failedTwice.status}`);
    eq(posts(r), 1, "retried on schedule (one more report)");
    let m: FailureMemory = nextFailureMemory(m1, failedTwice, T, 60_000)!;
    eq([m.failures, m.until - T], [2, 120_000], "second identical failure: two intervals");
    for (let i = 0; i < 8; i++) m = nextFailureMemory(m, failedTwice, T, 60_000)!;
    eq([m.failures, m.until - T], [10, BACKOFF_CAP_MS], "capped at ten minutes");
    eq(nextFailureMemory(m, { ...failedTwice, message: "another cause" }, T, 60_000)!.failures, 1, "another failure starts over");
    // the customer fixed the content: processed at once, the memory is gone
    r.bc.doc = makeExport(V1);
    const fixed = await runCycle({ ...r.options, backoff: m1, now: () => T });
    eq([fixed.status, nextFailureMemory(m1, fixed, T, 60_000)], ["succeeded", undefined], "new content is not held back");
  } finally {
    await r.close();
  }
});

// ===================================================================== truth ==
console.log("\n[truth] a removed project that site configuration still names");
await check("T1 a customer unpublishes the project the hero banner links to: the sync SUCCEEDS (no self-service dead end) — the record is retired, its old URL is verified 404 and reported absent, the banner CTA is simply not rendered; a banner target that never was a record still fails `generate` and publishes nothing; a home selection (settings.json manual ids) naming a removed project is skipped with a `manual-id-missing` warning", async () => {
  const r = await rig();
  try {
    await runSync(r.options);
    // banner CTA → maru-011, and the next revision removes maru-011
    Object.assign(r.bc, { doc: makeExport({ projects: [P_B, P_C], assets: [B_COVER, C_COVER, SHARED], removing: [{ id: "maru-011", slug: "maru-project-011" }] }), assets: bytesOf([B_COVER, C_COVER, SHARED]), desired: 2 });
    const [res] = await runSync(r.options);
    assert(res!.status === "succeeded" && res!.complete, `status ${res!.status}: ${JSON.stringify(res).slice(0, 300)}`);
    eq((r.bc.results[1] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified, { present: ["sync-b", "sync-c"], absent: ["maru-011"] }, "reported absent by the export's slug");
    assert(r.web.hits.includes("/portfolio/maru-project-011"), "the old detail URL was requested");
    assert((await readManagedManifest(r.dir))!.retired.some((x) => x.id === "maru-011"), "maru-011 is retired in the sidecar");
    const afterRemoval = (await buildSiteSnapshot({ repoRoot: r.root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).snapshot;
    assert(afterRemoval.content.banners!.some((b) => b.cta?.target.kind === "project" && b.cta.target.project === "maru-011"), "the banner still names maru-011");
    eq(createContentReader(afterRemoval.content).list({ type: "projects", selection: { mode: "manual", ids: ["maru-011"] }, limit: 1 }).items, [], "the Template's lookup of the CTA target finds nothing → no CTA");
    // a target that never was a record: still a typo, still fail closed
    const live = await digest(r.dir);
    const bannersFile = path.join(r.dir, "content/banners.json");
    const original = await readFile(bannersFile, "utf8");
    const typo = JSON.parse(original);
    typo.items[0].cta.target.project = "no-such-project";
    await writeFile(bannersFile, `${JSON.stringify(typo, null, 2)}\n`);
    const withTypo = await digest(r.dir);
    Object.assign(r.bc, { desired: 3 });
    const [bad] = await runSync(r.options);
    eq([bad!.status, (bad as { stage?: string }).stage], ["failed", "generate"], "typo refused");
    assert(/banner "warm-light" CTA targets unknown project "no-such-project"/.test((bad as { message: string }).message), (bad as { message: string }).message);
    eq(await digest(r.dir), withTypo, "nothing written");
    await writeFile(bannersFile, original);
    eq(await digest(r.dir), live, "the live generation stays");
    // settings.json featured ids: skipped, not fatal
    const settings = await readJson(path.join(r.dir, "settings.json"));
    settings.overrides["home.projects-a"].selection = { mode: "manual", ids: ["sync-c", "sync-b", "maru-011"] };
    await writeFile(path.join(r.dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
    Object.assign(r.bc, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 5 });
    const [ok] = await runSync(r.options);
    eq(ok!.status, "succeeded", "builds and publishes without the removed record");
    assert(!(await readManagedManifest(r.dir))!.retired.some((x) => x.id === "maru-011"), "maru-011 is published again → no longer retired");
    const snap = (await buildSiteSnapshot({ repoRoot: r.root, siteId: SITE, mode: "public", at: GOLDEN_INPUT.at })).snapshot;
    const picked = createContentReader(snap.content).list({ type: "projects", selection: { mode: "manual", ids: ["sync-c", "sync-b", "maru-011"] }, limit: 4 });
    eq([picked.items.map((p) => p.id), picked.warnings.map((w) => w.code)], [["sync-c", "maru-011"], ["manual-id-missing"]], "the removed id is skipped with a warning");
  } finally {
    await r.close();
  }
});

// ======================================================================= e2e ==
if (E2E) {
  console.log("\n[e2e] the real build + the real publish (memory store) + the real runtime handler, over HTTP on 127.0.0.1");
  const HOST = "sync.test.example";
  const { root, dir } = await tempRoot(SITE);
  await writeFile(path.join(dir, "integration.json"), `${JSON.stringify({ schemaVersion: 1, firstPartyData: { enabled: true } }, null, 2)}\n`);
  const store = new MemoryStore();
  const bucket: R2BucketLike = {
    async get(k) {
      const o = store.objects.get(k);
      if (!o) return null;
      return { size: o.body.length, httpEtag: `"${sha256(o.body).slice(0, 32)}"`, httpMetadata: o.meta, body: new Blob([o.body as BlobPart]).stream(), text: async () => Buffer.from(o.body).toString("utf8") } as R2ObjectBodyLike;
    },
    async head(k) {
      const o = store.objects.get(k);
      return o ? { size: o.body.length, httpEtag: `"${sha256(o.body).slice(0, 32)}"`, httpMetadata: o.meta } : null;
    },
  };
  const env: Env = { SITES: bucket };
  const server = http.createServer(async (req, res) => {
    const out = await handle(new Request(`https://${HOST}${req.url}`, { method: req.method }), env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fake = await fakeBoostChat();
  try {
    const logs: string[] = [];
    const options: SyncOptions = {
      repoRoot: root,
      siteId: SITE,
      verifyBase: baseUrl,
      source: clientSource(createPublisherClient({ baseUrl: fake.url, token: TOKEN, siteId: SITE, ...quick }), "fake BoostChat"),
      log: (l) => logs.push(l),
      build: () => buildForSync({ repoRoot: root, siteId: SITE }),
      publish: publishForSync({ repoRoot: root, siteId: SITE, hostname: HOST, store, requireOriginMatch: false }),
      liveIs: liveIsFor(store, HOST),
      verify: (input) => verifyPublic({ ...input, attempts: 2, delayMs: 50 }),
    };
    await check("E1 revision 1: generated → really built → really published → every detail page 200 over HTTP and the served manifest names the built Portfolio Document → reported succeeded", async () => {
      const [res] = await runSync(options);
      assert(res!.status === "succeeded" && res!.complete, `status ${res!.status}: ${JSON.stringify(res).slice(0, 400)}\n${logs.slice(-8).join("\n")}`);
      const reported = fake.results[0] as Extract<PortfolioResult, { outcome: "succeeded" }>;
      eq(reported.verified, { present: ["maru-011", "sync-b", "sync-c"], absent: [] }, "verified");
      const manifest = await (await fetch(`${baseUrl}/_integration/manifest.json`)).json();
      eq([manifest.resources.portfolio.version, /^[0-9a-f]{64}$/.test(reported.packageHash)], [reported.portfolioVersion, true], "manifest version = reported portfolioVersion");
      eq((await fetch(`${baseUrl}/portfolio/sync-b-kitchen`)).status, 200, "detail page");
      const again = await buildForSync({ repoRoot: root, siteId: SITE });
      eq([again.status, again.packageHash], ["up-to-date", reported.packageHash], "an unchanged site is up to date (no rebuild)");
    });
    await check("E2 revision 2 removes a project: rebuilt, republished, its old detail URL answers 404 and is reported absent; the rollback-truth source (projects.json) no longer holds it", async () => {
      Object.assign(fake, { doc: makeExport(V2), assets: bytesOf(V2.assets), desired: 2 });
      const [res] = await runSync(options);
      assert(res!.status === "succeeded" && res!.complete, `status ${res!.status}: ${JSON.stringify(res).slice(0, 400)}\n${logs.slice(-8).join("\n")}`);
      eq((fake.results[1] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified, { present: ["maru-011", "sync-c"], absent: ["sync-b"] }, "verified");
      eq([(await fetch(`${baseUrl}/portfolio/sync-b-kitchen`)).status, (await fetch(`${baseUrl}/portfolio/sync-c-bath`)).status], [404, 200], "over HTTP");
      eq((await buildSiteSnapshot({ repoRoot: root, siteId: SITE, mode: "public", at: new Date().toISOString() })).snapshot.content.projects.map((p) => p.id), ["maru-011", "sync-c"], "authoritative ids");
    });
    await check("E3 revision 3 unpublishes the project the hero banner links to: the real build SUCCEEDS, the built home page no longer carries a link to it (it did before), its old detail URL answers 404 and is reported absent", async () => {
      const linkTo011 = 'href="/portfolio/maru-project-011"';
      assert((await (await fetch(`${baseUrl}/`)).text()).includes(linkTo011), "before: the home page links to maru-011 (the hero CTA)");
      Object.assign(fake, { doc: makeExport({ projects: [P_C], assets: [C_COVER], removing: [{ id: "maru-011", slug: "maru-project-011" }] }), assets: bytesOf([C_COVER]), desired: 3 });
      const [res] = await runSync(options);
      assert(res!.status === "succeeded" && res!.complete, `status ${res!.status}: ${JSON.stringify(res).slice(0, 400)}\n${logs.slice(-8).join("\n")}`);
      eq((fake.results[2] as Extract<PortfolioResult, { outcome: "succeeded" }>).verified, { present: ["sync-c"], absent: ["maru-011"] }, "verified");
      const home = await fetch(`${baseUrl}/`);
      eq([home.status, (await home.text()).includes(linkTo011), (await fetch(`${baseUrl}/portfolio/maru-project-011`)).status], [200, false, 404], "home page without the CTA link; the detail page is gone");
    });
  } finally {
    await fake.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

for (const root of tmpRoots) await rm(root, { recursive: true, force: true });
console.log(`\nportfolio-sync: ${passed} passed, ${failed.length} failed${E2E ? "" : " (the opt-in [e2e] block was not run: --e2e)"}`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
