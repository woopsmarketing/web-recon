/**
 * First-party integration producer (Contract V0, docs/reports/integration/02 — FROZEN 2026-09-22,
 * as extended by Contract V0.2, docs/reports/integration/07, and by the portfolio media 1.1
 * addendum, docs/reports/integration/08 — document schemaVersion "1.1"):
 *   - the pure emitter and the fail-closed validator (platform/integration/**) against the demo's
 *     real site data, the fixtures and crafted snapshots: allowlist projection, missing → omitted,
 *     [] only for records, no null, code point ordering, authored facet order, version stability
 *     (projection change → new version; anything outside the projection → same version), UR2 URLs,
 *     HT7 forbidden characters, duplicate ids, facet closure, area / price shape, resource pointer;
 *   - the V0.2 built-space annex on crafted snapshots: projectType, property{type,area},
 *     workScopeIds + document workScopes (WS2 closure), pricing{total,perArea}, facets.style, and
 *     the D-1 / RD1 derived per-area price (INV-17 … INV-30);
 *
 *   - portfolio media 1.1 (08): record `media` = the authored cover + the authored AFTER gallery
 *     (first 12, authored order, totalCount = all of them), src/width/height from the snapshot's
 *     asset table, alt only when authored; the validator's MediaImage/media rules on crafted
 *     documents; a record without media (a 1.0 record) stays valid;
 *   - the pinned media 1.1 golden integration package (platform/test/golden/portfolio-v1.1-media,
 *     written by platform/cli/integration-golden.ts): the pure emission of the demo equals it byte
 *     for byte, its golden.json records the facts of those bytes, and the 19-record corpus still
 *     covers the shapes the contract exercises (counts, area bases, price shapes, missing fields);
 *     the V0.2 golden (platform/test/golden/portfolio-v0.2, document "1.0") is FROZEN as the 1.0
 *     compatibility fixture and pinned by its own literals;
 *   - V0.1 compatibility: the frozen V0.1 package (data/site-builds/…/packages/0f80b239…, read from
 *     V01_PACKAGE_COMMIT once keep-2 retires it) and, while on disk, the live pilot package are
 *     untouched and self-consistent;
 *   - the rollout state (demo-rollout.ts): before the V0.2 publish the V0.1 package is current and
 *     nothing V0.2 is staged; after it the current package is the demo's own identity with the
 *     golden's integration bytes, and its rollback is the frozen lineage — V0.1 behind the first
 *     V0.2 package (39-), that package behind the widget build, the widget build behind the media
 *     1.1 build (B2b, G4, R2);
 *   - the builder seam: default OFF (fixtures keep their pre-integration identity), the demo ON,
 *     preview never emits, the producer version is a build input, OFF = the pre-integration
 *     buildInputId of the live package;
 *   - the V0.1 package of boost-interior-demo: the contract's §21 example values, the live 1.5.2
 *     package untouched and only two files added (point-in-time once keep-2 retires it), INV-3/INV-5;
 *   - real site:build runs on throwaway roots: same input → byte-identical package, a fixture
 *     opted in (generic, no site named in code), an empty site, no https origin / a forbidden
 *     character / preview → no emit or a failed build, a fixture OFF rebuild byte-neutral;
 *   - serving: the runtime resolves the documents, an OFF package answers 404 (never 403, CH-R11b),
 *     publish plans application/json + revalidate for the manifest (HT2/HT3);
 *   - Template Release immutability: every stored release verifies, the working tree still equals
 *     the release the demo is pinned to (the producer is not a Template change).
 *
 * Run AFTER the golden build of boost-interior-demo:
 *   tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite, packageIntact, prepareSiteInput, verifyIntegrationOutput, type BuildRecord } from "../build/site-build";
import { computeBuildInputId } from "../build/build-input";
import { createContentReader } from "../content/reader";
import { planRoutes } from "../site/routes";
import type { SiteSnapshot } from "../site/instance";
import { collectReleaseSources, computeReleaseHash, loadRelease, verifyRelease } from "../release/release";
import { hashJson, sha256, stableStringify } from "../util/hash";
import { planPublish } from "../publish/publish";
import { cachePolicyFor, contentTypeFor } from "../publish/media";
import { handle, type Env, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import { CACHE_REVALIDATE, packageKey, routingKey, type RoutingPointer } from "../../workers/recon-runtime/src/contract";
import { resolvePath } from "../../workers/recon-runtime/src/paths";
import {
  CONSUMER_DECLARED_LIMITS,
  CORE_SCHEMA_VERSION,
  FORBIDDEN_CHAR_RE,
  INTEGRATION_DIR,
  MANIFEST_PATH,
  MEDIA_ALT_MAX,
  MEDIA_GALLERY_MAX,
  MEDIA_SRC_RE,
  PORTFOLIO_SCHEMA_VERSION,
  PRODUCER_VERSION,
  PROJECT_TYPES,
  PROPERTY_TYPES,
  WORK_SCOPE_IDS,
  WORK_SCOPE_SPACE_IDS,
  WORK_SCOPE_WORK_IDS,
} from "../integration/contract";
import { IntegrationConfigError, integrationEmits, loadIntegrationConfig } from "../integration/config";
import { PRODUCER_SOURCE_FILES, producerSources } from "../integration/sources";
import { compareCodePoints, DeclaredRoutesSchema, derivePerArea, emitIntegration, IntegrationError, portfolioVersion, type IntegrationEmission, type PlannedRoute, type PortfolioDocument } from "../integration/emit";
import { assertIntegration, isRootRelativePath, validateIntegration } from "../integration/validate";
import { ProjectSchema, type Project } from "../content/schema";
import template from "../../templates/interior-01/v1/template";
import { GOLDEN_DIR, GOLDEN_V02_DIR, goldenRecord } from "../cli/integration-golden";
import { MediaImageSchema, PortfolioMediaSchema } from "../integration/validate";
import { demoExpectedPages, demoRollout } from "./demo-rollout";
import { gitMaterialize } from "./git-checkout";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
const AT = "2026-09-22T12:00:00Z";
/**
 * the live 1.5.2 package (Cloudflare pilot, docs/result/cloudflare-live-pilot) — must stay
 * byte-identical, so these three stay LITERAL: they name a frozen artefact on disk, not a
 * recomputable expectation. It was built from the 1.5.2 pin; since the demo was re-pinned to
 * 1.6.0 (docs/result/interior-portfolio-v0.2/23) it is no longer the demo's own OFF identity —
 * that one is derived from the current pin below (DEMO_OFF_BUILD_INPUT_ID).
 */
const LIVE_BUILD_INPUT_ID = "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f";
const LIVE_PACKAGE_HASH = "cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202";
const RELEASE_152 = "interior-01-1.5.2-d87807590d64";
/** 1.5.2's frozen releaseHash — the immutability golden (I1): a stored release may never move. */
const RELEASE_152_HASH = "d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08";
/**
 * The live package's recorded build-input parts (its build-record.json), literal because the first
 * V0.2 build of the demo retires that package directory (keep-2: current + previous only; its sealed
 * copy stays in R2). Self-checking: B2 asserts they hash to LIVE_BUILD_INPUT_ID, and G4 asserts the
 * on-disk record equals them while the directory exists.
 */
const LIVE_PARTS = {
  releaseHash: RELEASE_152_HASH,
  siteSnapshotHash: "df04f8775a2d28c08ecff1544a28f0c268e0897517ed99501a7f4d6918264e54",
  mode: "public",
  toolchainHash: "22e72379efb13d9ac8fe2cc0b5e7000566df689d540da253428c26ad2d7393d1",
} as const;
/** the pin the live package was built from (its snapshot carries it, so it is a build input) */
const LIVE_PIN = { templateId: "interior-01", templateVersion: "1.5.2", releaseId: RELEASE_152, releaseHash: RELEASE_152_HASH } as const;
/**
 * The re-authored demo snapshot (26, 28) hashed with the pin rolled back to 1.5.2 — B2's anchor for
 * "the pin is isolable". It is deliberately taken at the LIVE pin, so re-pinning the demo again
 * never moves it; only a change to the demo's own data does. Verified against the frozen live
 * package: with content/projects.json restored to its pre-V0.2 bytes this value becomes
 * LIVE_PARTS.siteSnapshotHash (df04f877…) exactly — see 28 §4, B2.
 *
 * 1.6.1 (38-): the demo's slots.json carries the basis-aware area labels and the V0.2 fact labels
 * — a third deliberate data delta. `_PRE_161` is the anchor before it; B2 reverts exactly the labels
 * in DEMO_161_DETAIL_LABELS and must land on it again, so those labels are the whole of that delta.
 *
 * Widget embed (2026-09-28): the demo's scripts.json puts `headScripts` in the snapshot, and its
 * settings.json turns `site.floating-cta` off (the chat launcher takes that bottom-right seat, as the
 * template's replacement seam says) — a fourth deliberate data delta. `_PRE_WIDGET` is the anchor
 * before it; B2 drops exactly those two and must land on it again, so they are the whole of it.
 */
const DEMO_SNAPSHOT_HASH_AT_LIVE_PIN = "f63e293cbff852ab0896834bc326340fbc950a9324a520a1ecbaa544955e827e";
const DEMO_SNAPSHOT_HASH_AT_LIVE_PIN_PRE_WIDGET = "8de4ff8710cd37f297e93d5926bf1244fad7ebfd81eab979711e050ad7d34140";
const DEMO_SNAPSHOT_HASH_AT_LIVE_PIN_PRE_161 = "515a797765defd5c1230dc49a2fc426b70b106c39301bf3e0731ac370ad75db3";
/** portfolio.detail copy the 1.6.1 re-pin changed: key → [before (undefined = absent), now]. */
const DEMO_161_DETAIL_LABELS: Record<string, [string | undefined, string]> = {
  areaLabel: ["공급면적", "면적"],
  areaSupplyLabel: [undefined, "공급면적"],
  areaExclusiveLabel: [undefined, "전용면적"],
  projectTypeLabel: [undefined, "리모델링 구분"],
  workScopesLabel: [undefined, "주요 공사 범위"],
  totalPriceLabel: [undefined, "총 공사비"],
};
/**
 * 02 §21 — the V0.1 golden values (schemaVersion "0.1"). They describe the FROZEN V0.1 package on
 * disk in data/site-builds/: the demo's current package in PRE_PUBLISH_TRANSITION, its rollback
 * (previous.json) once the V0.2 package is current (07 §16 step 4; docs/result/interior-portfolio-v0.2/39).
 * They are no longer what this producer emits, and are asserted only against that package (the V0.1
 * compatibility checks, G1–G3), addressed by its own frozen id — never by "whatever current.json names".
 */
const V01_BUILD_INPUT_ID = "0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a";
const V01_PACKAGE_HASH = "286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e";
const V01_DEMO_VERSION = "6346c472e162ae07b76a4686fce54c51";
const V01_DEMO_DOC_BYTES = 5292;
/**
 * The last commit whose tree still carries the V0.1 package directory. The widget embed's rebuild
 * (docs/result/BOOST-INTERIOR-LIVE-WIDGET-EMBED-2026-09-28.md) moved the rollback to the first V0.2
 * package and keep-2 retired the V0.1 directory; G1–G3/I2 then read it from this commit and re-hash
 * it against V01_PACKAGE_HASH, so the checks keep their full strength (the sealed R2 copy is unchanged).
 */
const V01_PACKAGE_COMMIT = "cb781e84a4a67ed220c2705640397bf570e8458c";
/**
 * The first V0.2 package (39-, live 2026-09-27): the V0.2 corpus without head scripts. It was the
 * rollback behind the widget build; the media 1.1 build moved the rollback one step (to the widget
 * build) and keep-2 retired this directory. B2b then reads it from V02_FIRST_PACKAGE_COMMIT and
 * re-hashes it against its frozen packageHash (its sealed R2 copy is unchanged).
 */
const V02_FIRST_BUILD_INPUT_ID = "a4777cf9b71a0da0f7f52651ec027a219d7f09ce2e8f75ac4552a028cbfd413f";
const V02_FIRST_PACKAGE_HASH = "3846a29d30ef1d48e58b0c507075918424350870b096294a83678eb87ba20aaf";
const V02_FIRST_PACKAGE_COMMIT = "cb781e84a4a67ed220c2705640397bf570e8458c";
/**
 * The widget build (docs/result/BOOST-INTERIOR-LIVE-WIDGET-EMBED-2026-09-28.md, live 2026-09-28):
 * the V0.2 corpus + head scripts, document "1.0" = the frozen V0.2 golden's bytes. Behind the media
 * 1.1 build it is the rollback (previous.json) — B2b.
 */
const WIDGET_BUILD_INPUT_ID = "32303241c78f10e5edc3a42686680aa5238a8aa76c3192795dc351ffbe55c650";
const WIDGET_PACKAGE_HASH = "ada03d20d4c0688316e274a724d4298aa031128098ed23b591a5b65c004a25d6";
const DEMO_MANIFEST_BYTES = 274;
/**
 * The FROZEN V0.2 golden values (07 rev 9.2.1, document "1.0", manifest "0.1"), pinned in
 * platform/test/golden/portfolio-v0.2 — the 1.0 compatibility fixture the consumer keeps (G6b), and
 * the integration bytes of the rollback package (B2b). The producer no longer emits them.
 */
const V02_VERSION = "d56509c8100a56fdf9644baff78ff9e1";
const V02_DOC_BYTES = 11608;
const V02_DOC_SHA256 = "c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816";
const V02_MANIFEST_SHA256 = "b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d";
/** sha256 of the frozen V0.2 golden's golden.json and README.md — nothing may rewrite them either */
const V02_GOLDEN_JSON_SHA256 = "27f65ade9e72256f0b3dc865df259a50b0f5010a139bb875276fb3769dfaaa81";
const V02_README_SHA256 = "c15b285c453e6aaa657abb876e429976de796e34a7390c734528cfeeae375b98";
/**
 * The media 1.1 golden values (08 on top of 07 rev 9.2.1, document "1.1", manifest "0.1"): the
 * demo's pure emission at AT, pinned byte for byte in platform/test/golden/portfolio-v1.1-media (G6)
 * and shared with the consumer. A change here is a change of the canonical data or of the producer.
 * (The manifest keeps its 274 bytes: only the 32-hex version inside it moved.)
 */
const DEMO_VERSION = "d95b5cb5f8f05e50e624eb44d39393f5";
const DEMO_DOC_BYTES = 20158;
const DEMO_DOC_SHA256 = "5da25dd21dc3158c1495c9211a1fcb8cea4d485d788ee56facdaf6d2e4abac3b";
const DEMO_MANIFEST_SHA256 = "495376e5f17095e7b027c613f26ad5b0a4ae1b971ebaa7f9789a971a0da9a1aa";
/** the zero-record 1.1 document (07 §10: records [] is the one permitted empty array) */
const EMPTY_VERSION = "94bea71d35178b52501438e3ed1c9a3d";
const EMPTY_DOC = `{"schemaVersion":"1.1","resource":"portfolio","version":"${EMPTY_VERSION}","records":[]}`;
/**
 * The 17 distinct work-scope ids the re-authored demo uses (26 §1.2), sorted in code point order —
 * i.e. what WS2 requires `document.workScopes` to be. Nine of the contract's 26 ids are unused by
 * this corpus (`balcony`, `hallway`, `storage`, `pantry`, `utility`, `tiling`, `plumbing`,
 * `electrical`, `demolition`), and WS2's closure forbids declaring them.
 */
const DEMO_WORK_SCOPES = [
  "bathroom", "bedroom", "built_in_furniture", "dining", "doors", "dressing_room", "entrance",
  "expansion", "flooring", "kids_room", "kitchen", "lighting", "living_room", "painting", "study",
  "wallpaper", "windows",
];
/** the demo's full `facets.style` vocabulary after 28's authoring pass, declared and sorted (VO1) */
const DEMO_STYLE_VALUES = ["그레이지", "내추럴", "모던", "미니멀", "베이지", "우드 포인트", "월넛", "웜 화이트", "화이트"].map((id) => ({ id, label: id }));

let passed = 0;
const failed: string[] = [];
const skipped: string[] = [];
/** checks whose artefact keep-2 has retired: counted as passed, listed in the summary, never silent */
const pointInTime: string[] = [];
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
/**
 * A check whose RULE stands but whose EXPECTED VALUE is knowingly out of date: the body is kept
 * compiling and is NOT run, and every skip is listed at the end of the run with its reason. Never
 * used to make a genuine assertion pass. (No check is skipped since the V0.2 golden was pinned —
 * docs/result/interior-portfolio-v0.2/36.)
 */
function skip(name: string, why: string, _body: () => unknown | Promise<unknown>) {
  skipped.push(`${name} — ${why}`);
  console.log(`  SKIP ${name}\n       ${why}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
async function rejects(fn: () => unknown | Promise<unknown>, re: RegExp) {
  try {
    await fn();
  } catch (error) {
    assert(re.test((error as Error).message), `wrong error: ${(error as Error).message}`);
    return;
  }
  throw new Error(`expected failure matching ${re}`);
}
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
const exists = (p: string) => stat(p).then(() => true, () => false);
const packageOf = async (root: string, siteId: string) => path.join(root, (await readJson(path.join(root, "data/site-builds", siteId, "current.json"))).packageDir);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** planned routes of a snapshot under the working-tree Template manifest (= the demo's pinned release, asserted in I2b) */
function plannedRoutesOf(snapshot: SiteSnapshot): PlannedRoute[] {
  return planRoutes(template.routes, createContentReader(snapshot.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
}
function emitFor(snapshot: SiteSnapshot): IntegrationEmission {
  return emitIntegration({ snapshot, declaredRoutes: template.routes, plannedRoutes: plannedRoutesOf(snapshot) });
}
function validateFor(e: IntegrationEmission, snapshot: SiteSnapshot) {
  return validateIntegration(e, { siteId: snapshot.siteId, publicOrigin: snapshot.site.identity.publicOrigin, pagePaths: new Set(plannedRoutesOf(snapshot).flatMap((r) => r.paths)) });
}
/** re-serialise an emission after mutating its objects (version / pointer recomputed unless kept) */
function remake(e: IntegrationEmission, mutate: (x: IntegrationEmission) => void, opts: { keepVersion?: boolean } = {}): IntegrationEmission {
  const x = clone(e);
  mutate(x);
  const ser = (v: unknown) => {
    const text = JSON.stringify(v);
    const bytes = new TextEncoder().encode(text);
    return { text, bytes, sha256: sha256(bytes) };
  };
  if (!opts.keepVersion && x.portfolio) {
    const version = portfolioVersion(x.portfolio!.document);
    x.portfolio!.document.version = version;
    x.portfolio!.version = version;
    const href = `/${INTEGRATION_DIR}/portfolio.${version}.json`;
    x.portfolio!.file.path = href.slice(1);
    if (x.manifest.resources.portfolio) x.manifest.resources.portfolio = { href, version };
  }
  if (x.portfolio) Object.assign(x.portfolio.file, ser(x.portfolio.document));
  Object.assign(x.manifestFile, ser(x.manifest));
  x.files = x.portfolio ? [x.manifestFile, x.portfolio.file] : [x.manifestFile];
  return x;
}
function deepScan(value: unknown, at: string, hits: string[]) {
  if (value === null) hits.push(`${at}=null`);
  else if (value === "") hits.push(`${at}=""`);
  else if (Array.isArray(value)) {
    if (value.length === 0 && at !== "records") hits.push(`${at}=[]`);
    value.forEach((v, i) => deepScan(v, `${at}[${i}]`, hits));
  } else if (value && typeof value === "object") {
    const ks = Object.keys(value);
    if (ks.length === 0) hits.push(`${at}={}`);
    for (const k of ks) deepScan((value as Record<string, unknown>)[k], at ? `${at}.${k}` : k, hits);
  }
}
async function throwawayRoot(siteId: string, mutate?: (siteDir: string) => Promise<void>): Promise<string> {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "integration-root-"));
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const dir = path.join(tmpRoot, "data/sites", siteId);
  await cp(path.join(repoRoot, "data/sites", siteId), dir, { recursive: true });
  if (mutate) await mutate(dir);
  return tmpRoot;
}
const ON = `${JSON.stringify({ schemaVersion: 1, firstPartyData: { enabled: true } }, null, 2)}\n`;
const editJson = async (file: string, f: (doc: any) => void) => {
  const doc = await readJson(file);
  f(doc);
  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
};

// ------------------------------------------------------------------ inputs --
const demo = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "public", at: AT });
const demoEmission = emitFor(demo.snapshot);
/** the demo's rollout state (demo-rollout.ts): PRE_PUBLISH_TRANSITION or POST_PUBLISH_STEADY; anything else throws */
const rollout = (await demoRollout(repoRoot)).state;
const demoBuilds = path.join(repoRoot, "data/site-builds", DEMO);
const currentDir = await packageOf(repoRoot, DEMO);
const currentRecord = (await readJson(path.join(currentDir, "build-record.json"))) as BuildRecord;
const previousId = (await readJson(path.join(demoBuilds, "previous.json"))).buildInputId as string;
/**
 * The frozen V0.1 package, by its own id: current before the V0.2 publish, the rollback
 * (previous.json) after it, and — since the widget embed rotated the rollback to the first V0.2
 * package (B2b) — retired from the working tree by keep-2. It is then materialized from
 * V01_PACKAGE_COMMIT into a scratch dir; every check below re-hashes it against its frozen
 * packageHash either way. Only its rollback ROLE is B2b's business.
 */
const v01OnDisk = path.join(demoBuilds, "packages", V01_BUILD_INPUT_ID);
const v01FromGit = !(await exists(v01OnDisk));
const v01Scratch = v01FromGit ? await mkdtemp(path.join(os.tmpdir(), "v01-package-")) : undefined;
if (v01Scratch) process.once("exit", () => rmSync(v01Scratch, { recursive: true, force: true }));
const v01Dir = v01Scratch ? gitMaterialize(repoRoot, V01_PACKAGE_COMMIT, path.relative(repoRoot, v01OnDisk), v01Scratch) : v01OnDisk;
if (v01FromGit) console.log(`  (the V0.1 package is retired from data/site-builds; read from ${V01_PACKAGE_COMMIT.slice(0, 7)} and re-hashed)`);
const v01Record = (await exists(v01Dir)) ? ((await readJson(path.join(v01Dir, "build-record.json"))) as BuildRecord) : undefined;
const needV01 = (): BuildRecord => {
  assert(v01Record, `the V0.1 package ${V01_BUILD_INPUT_ID.slice(0, 12)}… is missing on disk and at ${V01_PACKAGE_COMMIT.slice(0, 7)}`);
  return v01Record;
};
/**
 * The demo's CURRENT pin, read straight from data/sites/<DEMO>/site.json. Every pin-derived
 * expectation below (I1, B2, B4, I2b) is computed from it, so re-pinning the demo to a newly cut
 * Template Release costs no edit in this file. Only values describing a FROZEN artefact — the live
 * package, release 1.5.2 — stay literal.
 */
const demoPin = (await readJson(path.join(repoRoot, "data/sites", DEMO, "site.json"))).template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
/**
 * The demo's identity with the integration part dropped, under the CURRENT pin — derived, not
 * frozen: the LIVE package's own parts with exactly the two parts a re-pin moves taken from the
 * current input (`releaseHash`, and `siteSnapshotHash` because the pin lives inside the snapshot as
 * site.template). `mode` and `toolchainHash` therefore still have to be the live build's, and B2
 * separately proves the pin is the only delta by rolling it back (→ the live snapshot hash exactly).
 */
const DEMO_OFF_BUILD_INPUT_ID = computeBuildInputId({ ...LIVE_PARTS, releaseHash: demo.parts.releaseHash, siteSnapshotHash: demo.parts.siteSnapshotHash });

console.log("\n[contract] constants");
await check("C1 fixed manifest path, the DIVERGED schema versions (manifest 0.1 · document 1.1, INV-27), an integer producer version, the V0.2 limits, the media 1.1 limits", () => {
  eq(MANIFEST_PATH, "/_integration/manifest.json", "manifest path (§3.1)");
  // 08: media is an ADDED optional field → a MINOR bump of the document (SV2); the manifest gains
  // nothing and does not move.
  eq([CORE_SCHEMA_VERSION, PORTFOLIO_SCHEMA_VERSION], ["0.1", "1.1"], "schemaVersion (SV1 · 07 §3 · 08 · INV-27)");
  assert(Number.isInteger(PRODUCER_VERSION) && PRODUCER_VERSION >= 3, "producer version bumped for media 1.1 (projection + validation changed)");
  eq([MEDIA_GALLERY_MAX, MEDIA_ALT_MAX, MEDIA_SRC_RE.source], [12, 160, "^\\/(?!\\/)[A-Za-z0-9._~%\\/-]{1,511}$"], "media limits (08 §2 = D1)");
  // 07 §8: `scope: 150` retired with the facet; `style` added (PROVISIONAL until the consumer
  // declares it through the VO6 procedure); category / tag unchanged.
  eq(CONSUMER_DECLARED_LIMITS.valuesPerFacet, { category: 50, style: 150, tag: 150 }, "VO6 per-key limits");
  assert(CONSUMER_DECLARED_LIMITS.valuesPerFacet.scope === undefined, "the retired scope limit is gone");
  eq([CONSUMER_DECLARED_LIMITS.manifestBytes, CONSUMER_DECLARED_LIMITS.documentBytes, CONSUMER_DECLARED_LIMITS.records], [65536, 1048576, 1000], "CH-R10 sizes");
});
await check("C4 the closed V0.2 vocabularies: 26 unique work-scope ids exactly as 07 §7.3 lists them, 2 project types, 6 property types, all frozen", () => {
  eq([...WORK_SCOPE_IDS], [
    "entrance", "living_room", "dining", "kitchen", "pantry", "bedroom", "kids_room", "dressing_room", "study", "bathroom", "hallway", "balcony", "storage", "utility",
    "flooring", "wallpaper", "lighting", "windows", "doors", "tiling", "painting", "plumbing", "electrical", "built_in_furniture", "expansion", "demolition",
  ], "the 26 ids of 07 §7.3 (14 spaces, then 12 works)");
  eq([WORK_SCOPE_IDS.length, new Set(WORK_SCOPE_IDS).size], [26, 26], "26 unique");
  // INV-29 needs the two tables apart; their union, in order, IS the vocabulary.
  eq([WORK_SCOPE_SPACE_IDS.length, WORK_SCOPE_WORK_IDS.length], [14, 12], "14 spaces, 12 works");
  eq([...WORK_SCOPE_SPACE_IDS, ...WORK_SCOPE_WORK_IDS], [...WORK_SCOPE_IDS], "spaces ++ works = the vocabulary, same order");
  eq([...WORK_SCOPE_SPACE_IDS].filter((id) => (WORK_SCOPE_WORK_IDS as readonly string[]).includes(id)), [], "disjoint tables");
  for (const v of [WORK_SCOPE_SPACE_IDS, WORK_SCOPE_WORK_IDS]) assert(Object.isFrozen(v), "both tables frozen");
  eq([...PROJECT_TYPES], ["full_remodel", "partial_remodel"], "07 §5");
  eq([...PROPERTY_TYPES], ["apartment", "officetel", "villa", "detached_house", "mixed_use", "commercial"], "07 §6");
  for (const v of [WORK_SCOPE_IDS, PROJECT_TYPES, PROPERTY_TYPES]) assert(Object.isFrozen(v), "canonical vocabularies are frozen");
});
await check("C2 HT7 forbidden characters: C0, DEL, C1, U+2028/2029, bidi controls hit; Korean, ASCII, middle dot, emoji do not", () => {
  for (const c of ["\u0000", "\u0007", "\u001f", "\u007f", "\u0085", "\u009f", " ", " ", "‪", "‮", "⁦", "⁩"]) assert(FORBIDDEN_CHAR_RE.test(`a${c}b`), `U+${c.codePointAt(0)!.toString(16)} must be forbidden`);
  for (const s of ["주방·팬트리", "full-remodel", "34평 아파트 (공급)", "\u{1F600}", "\t".trim(), "café"]) assert(!FORBIDDEN_CHAR_RE.test(s), `${JSON.stringify(s)} must be allowed`);
});
await check("C3 code point order: U+FF5E sorts before U+1F600 (UTF-16 code unit order says the opposite)", () => {
  assert(compareCodePoints("～", "\u{1f600}") < 0 && "～" > "\u{1f600}", "code point ≠ code unit order");
  eq(["b", "a", "가", "A", "ab"].sort(compareCodePoints), ["A", "a", "ab", "b", "가"], "ascending");
});

console.log("\n[emitter] pure projection of the demo's real site data");
await check("E1 demo → 19 records, manifest 274 B, facets category 4 · style 9 · tag 3 and NO scope facet (07 §8), the 17 authored work scopes, listingUrl /portfolio, V0.2 document key order", () => {
  const e = demoEmission;
  const version = e.portfolio!.version;
  assert(/^[0-9a-f]{32}$/.test(version), `version shape: ${version}`);
  eq(e.manifestFile.bytes.length, DEMO_MANIFEST_BYTES, "manifest bytes (the manifest did not change shape)");
  // The demo data is now V0.2-authored (26: 8 → 19 records with projectType / propertyType /
  // workScopeIds / totalPrice; 28: `styles` on the original eight), so the document carries a
  // `style` facet and a workScopes block. The retired `scope` facet is still gone — that is the
  // shape change this release makes, and it is unaffected by the re-authoring.
  eq([e.portfolio!.recordCount, e.portfolio!.facetCounts], [19, { category: 4, style: 9, tag: 3 }], "counts");
  eq(e.portfolio!.document.workScopes, DEMO_WORK_SCOPES, "the authored work scopes, sorted and closed both ways (WS2)");
  eq(e.portfolio!.document.listingUrl, "/portfolio", "listingUrl");
  eq(e.manifest, {
    schemaVersion: "0.1",
    site: { id: DEMO, publicOrigin: "https://interior-demo.boostweb.co.kr", locale: "ko-KR" },
    resources: { portfolio: { href: `/_integration/portfolio.${version}.json`, version } },
  }, "manifest (02 §5 key order; manifest schemaVersion stays 0.1 — INV-27)");
  eq(e.portfolio!.document.schemaVersion, "1.1", "document schemaVersion (07 §3, 08, INV-27)");
  // 07 §10 declares the document as schemaVersion · resource · version · listingUrl · workScopes ·
  // facets · records; `workScopes` was simply absent from the demo's key list before the corpus
  // authored any work scope, and now takes its declared place.
  eq(Object.keys(e.portfolio!.document), ["schemaVersion", "resource", "version", "listingUrl", "workScopes", "facets", "records"], "document key order (07 §10)");
  eq(e.files.map((f) => f.path), ["_integration/manifest.json", `_integration/portfolio.${version}.json`], "files");
});
await check(`E1b demo → version ${DEMO_VERSION}, document ${DEMO_DOC_BYTES} B, manifest ${DEMO_MANIFEST_BYTES} B (the media 1.1 golden values, P-V2-05)`, () => {
  eq(demoEmission.portfolio!.version, DEMO_VERSION, "version");
  eq([demoEmission.portfolio!.file.bytes.length, demoEmission.portfolio!.file.sha256], [DEMO_DOC_BYTES, DEMO_DOC_SHA256], "document bytes");
  eq(demoEmission.manifestFile.sha256, DEMO_MANIFEST_SHA256, "manifest bytes");
  // RV1/RV5: the version is the hash of the body, and it is what names the file
  eq(portfolioVersion(JSON.parse(demoEmission.portfolio!.file.text)), DEMO_VERSION, "version = sha256(canonical body)[0:32]");
  eq(demoEmission.portfolio!.file.path, `${INTEGRATION_DIR}/portfolio.${DEMO_VERSION}.json`, "file name carries the version");
});
await check("E2 same snapshot → byte-identical emission, twice (INV-1/INV-26); an empty site emits the zero-record document with no listingUrl and no facets", () => {
  const a = emitFor(demo.snapshot);
  const b = emitFor(demo.snapshot);
  eq(a.files.map((f) => f.sha256), b.files.map((f) => f.sha256), "twice");
  const empty = clone(demo.snapshot);
  empty.content.projects = [];
  const ee = emitFor(empty);
  eq([ee.portfolio!.document.listingUrl, ee.portfolio!.document.facets, ee.portfolio!.document.workScopes], [undefined, undefined, undefined], "no listingUrl / facets / workScopes with zero records");
  eq(ee.portfolio!.document.records, [], "records [] is the one permitted empty array (MD3)");
  eq(ee.manifest.resources.portfolio!.version, ee.portfolio!.version, "manifest echoes the empty resource's version");
});
// E2b was "02 §21.2's two-record example and §21.3's empty document reproduce byte for byte". Both
// are V0.1 documents, and 07 rev 9.2.1 has no byte-level V0.2 example (its §19 is acceptance rows,
// §19's old worked example is archived), so the two-record half is retired; the empty document is
// restored with its V0.2 bytes, and the 19-record V0.2 document is pinned by E1b and G6.
await check("E2b the empty 1.1 document reproduces byte for byte (schemaVersion 1.1, records [] and nothing else)", () => {
  const empty = clone(demo.snapshot);
  empty.content.projects = [];
  eq(emitFor(empty).portfolio!.file.text, EMPTY_DOC, "exact bytes");
});
await check("E3 records by id code point, facet values by id code point, a record's tag in authored order (§6.1); the retired scope facet is absent; V0.2 record key order (07 §10)", () => {
  const d = demoEmission.portfolio!.document;
  eq(d.records.map((r) => r.id), [...d.records.map((r) => r.id)].sort(compareCodePoints), "record order");
  for (const [k, f] of Object.entries(d.facets!)) eq(f.values.map((v) => v.id), [...f.values.map((v) => v.id)].sort(compareCodePoints), `facet ${k} order`);
  eq(Object.keys(d.facets!), ["category", "style", "tag"], "facet key order, scope retired (07 §8)");
  const bi01 = d.records.find((r) => r.id === "bi-01")!;
  const src = demo.snapshot.content.projects.find((p) => p.id === "bi-01")!;
  assert(src.scope && src.scope.length > 0, "the demo record still authors free-text scope (it is display text, and still rendered)");
  eq(bi01.facets!.scope, undefined, "the scope FACET is retired: the free text never reaches the document (07 §8)");
  eq(bi01.facets!.style, src.styles, "style = the authored styles, authored order");
  eq(bi01.facets!.tag, src.keywords!.filter((k) => !(src.styles ?? []).includes(k)), "tag = keywords MINUS styles (ST4), survivors in authored order");
  eq(bi01.facets!.category, [src.category], "category exactly one");
  // 08: `media` is added LAST, after facets — every 1.0 key keeps its place
  eq(Object.keys(bi01), ["id", "title", "detailUrl", "publishedAt", "location", "projectType", "property", "workScopeIds", "pricing", "facets", "media"], "record key order (07 §10, 08)");
  eq(Object.keys(bi01.media!), ["cover", "gallery", "totalCount"], "media key order (08 §2)");
  eq(Object.keys(bi01.media!.cover!), ["src", "alt", "width", "height"], "MediaImage key order (08 §2)");
});
await check("E4 missing → omitted: records without a price have no pricing key at all (MD4); no projectType / workScopeIds / style without an authored source field (INV-25); no null / \"\" / {} / [] anywhere (MD1–MD3, INV-9)", () => {
  const d = demoEmission.portfolio!.document;
  for (const id of ["bi-04", "bi-06"]) assert(!("pricing" in d.records.find((r) => r.id === id)!), `${id} must have no pricing key (MD4)`);
  assert(d.records.filter((r) => r.pricing?.perArea).length === 10, "10 per-area prices: the 8 authored on bi-01 … bi-08 (minus bi-04/bi-06, which author no price at all) + the 4 D-1 derivations on bi-09 … bi-12");
  // INV-25 / ND1 — every V0.2 field in the document has an authored source field in the record, and
  // no record carries one it did not author. Before the demo was re-authored (26, 28) this could be
  // stated as "none of them may appear at all"; the rule is unchanged, now written as the
  // equivalence it always was, so a spurious field is still caught on every one of the 19.
  for (const r of d.records) {
    const src = demo.snapshot.content.projects.find((p) => p.id === r.id)!;
    eq(
      [r.projectType, r.workScopeIds, r.pricing?.total, r.property?.type, r.facets!.style],
      [src.projectType, src.workScopeIds, src.totalPrice, src.propertyType, src.styles && src.styles.length > 0 ? src.styles : undefined],
      `${r.id}: exactly the authored V0.2 fields, nothing invented (ND1, INV-25)`,
    );
    // PA1 / D-1a: an authored pricePerArea is copied as `authored` and never replaced; a per-area
    // price appears without one only where D-1's conditions hold, and is then marked `derived`.
    if (r.pricing?.perArea) eq(r.pricing.perArea.source, src.pricePerArea ? "authored" : "derived", `${r.id}: perArea source`);
  }
  const hits: string[] = [];
  deepScan(demoEmission.portfolio!.document, "", hits);
  deepScan(demoEmission.manifest, "manifest", hits);
  eq(hits, [], "no empty value");
  assert(!demoEmission.portfolio!.file.text.includes("null") && !demoEmission.portfolio!.file.text.includes('"unknown"'), "no null / unknown literal in the bytes");
});
await check("E5 property.area: value/unit as authored (no conversion), basis supply as stored on every demo record; unknown/absent basis → no key; exclusive stays exclusive (AR2/AR3, 07 §6); pricePerArea → pricing.perArea + source authored", () => {
  // `property` is `{ type?, area? }` in that key order and is omitted entirely when both are absent
  // (MD4). Since the re-authoring the corpus exercises all of it on real data: bi-15 authors no
  // area, bi-04 and bi-06 author no propertyType (28 §2), and bi-14 is `exclusive` while the rest
  // are `supply` — so the basis is read from the record instead of being hard-coded to "supply".
  for (const r of demoEmission.portfolio!.document.records) {
    const src = demo.snapshot.content.projects.find((p) => p.id === r.id)!;
    const expected = {
      ...(src.propertyType ? { type: src.propertyType } : {}),
      ...(src.area ? { area: { value: src.area.value, unit: src.area.unit, ...(src.area.basis && src.area.basis !== "unknown" ? { basis: src.area.basis } : {}) } } : {}),
    };
    eq(r.property, Object.keys(expected).length > 0 ? expected : undefined, `${r.id} property: value / unit / basis as authored, no conversion`);
    if (src.pricePerArea) eq(r.pricing!.perArea, { amount: src.pricePerArea.amount, currency: src.pricePerArea.currency, perUnit: src.pricePerArea.unit, source: "authored" }, `${r.id} price`);
  }
  assert(demoEmission.portfolio!.document.records.some((r) => r.property?.area?.basis === "exclusive"), "AR3: an exclusive basis survives as exclusive on real data (bi-14)");
  assert(demoEmission.portfolio!.document.records.some((r) => r.property && !r.property.area), "MD4: a record with a type but no area still emits property (bi-15)");
  const s = clone(demo.snapshot);
  s.content.projects[0]!.area = { value: 84.5, unit: "m2", basis: "unknown" };
  s.content.projects[1]!.area = { value: 24, unit: "pyeong" };
  s.content.projects[2]!.area = { value: 59, unit: "m2", basis: "exclusive" };
  s.content.projects[3]!.propertyType = "officetel";
  delete s.content.projects[3]!.area;
  const d = emitFor(s).portfolio!.document;
  eq(d.records[0]!.property!.area, { value: 84.5, unit: "m2" }, "unknown → omitted");
  eq(d.records[1]!.property!.area, { value: 24, unit: "pyeong" }, "absent → omitted");
  eq(d.records[2]!.property!.area, { value: 59, unit: "m2", basis: "exclusive" }, "exclusive kept");
  eq(d.records[3]!.property, { type: "officetel" }, "type alone still emits property (MD4)");
  assert(!JSON.stringify(d).includes("totalCost"), "no total cost (TP3 = PR5; the name stays reserved)");
});
// E6 RESTATED for media 1.1 (08): before 1.1 no image left the producer, so "cover" and any gallery
// were on the forbidden list. 08 deliberately ADDS `media` — `cover`, `gallery`, `totalCount` and
// MediaImage's `src`/`alt`/`width`/`height` — so those keys are now allowlisted, but ONLY inside
// `records[].media` (checked separately below), and everything else stays forbidden: the authored
// `galleryGroups` / `items` / `image` / `before` shape never leaks, and neither does a `hasMore`
// (08: derived, never emitted) or a URL key.
await check("E6 allowlist: no summary / body / galleryGroups / before / quote / slug / status / builtYear / period / duration key or text (INV-7, SE2); media keys only under records[].media (08)", () => {
  const text = demoEmission.portfolio!.file.text;
  // `style` is no longer on this list — it is a V0.2 facet key (07 §8) — but `propertyType` still
  // is: V0.2 takes it up as the STRUCTURED field `property.type`, never as a facet or a flat key.
  for (const key of ["summary", "body", "galleryGroups", "items", "image", "before", "asset", "hasMore", "url", "href", "customerQuote", "slug", "status", "builtYear", "period", "durationWeeks", "keywords", "styles", "attribution", "propertyType", "totalCost", "scope"]) {
    assert(!text.includes(`"${key}"`), `key ${key} must not be emitted`);
  }
  for (const p of demo.snapshot.content.projects) {
    for (const s of [p.summary, ...(p.body ?? []), p.customerQuote?.text, p.customerQuote?.attribution]) if (s) assert(!text.includes(s), `${p.id}: text "${s.slice(0, 20)}…" leaked`);
  }
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
  };
  const stripped = clone(demoEmission.portfolio!.document) as unknown as Record<string, unknown>;
  delete stripped.facets;
  const mediaKeys = new Set<string>();
  stripped.records = (stripped.records as Record<string, unknown>[]).map((r) => {
    const { facets: _f, media, ...rest } = r;
    if (media) {
      const before = new Set(keys);
      walk(media);
      for (const k of keys) if (!before.has(k)) mediaKeys.add(k);
      for (const k of [...keys]) if (!before.has(k)) keys.delete(k);
      for (const k of Object.keys(media as object)) mediaKeys.add(k);
    }
    return rest;
  });
  walk(stripped);
  const allow = new Set([
    "schemaVersion", "resource", "version", "listingUrl", "workScopes", "records",
    "id", "title", "detailUrl", "publishedAt", "location",
    "projectType", "property", "type", "area", "value", "unit", "basis", "workScopeIds",
    "pricing", "total", "kind", "minAmount", "maxAmount", "perArea", "amount", "currency", "perUnit", "source",
  ]);
  eq([...keys].filter((k) => !allow.has(k)), [], "keys outside the allowlist");
  // 08 — the media allowlist, and it is used ONLY under records[].media (none of these is a 1.0 key)
  const mediaAllow = new Set(["cover", "gallery", "totalCount", "src", "alt", "width", "height"]);
  eq([...mediaKeys].filter((k) => !mediaAllow.has(k)), [], "media keys outside the media allowlist");
  eq([...keys].filter((k) => mediaAllow.has(k)), [], "no media key outside records[].media");
  // 08 — the only images are the records' own: no og:image / site hero / band / logo / section
  // image of the site ever becomes a media src (every non-project asset of the demo is checked).
  for (const a of demo.snapshot.assets.filter((x) => !/^bi\d\d-/.test(x.id))) assert(!text.includes(`"${a.publicPath}"`), `site asset ${a.id} (${a.publicPath}) must not be a media src`);
});
// E7 RESTATED for media 1.1 (08): the cover, the gallery and the asset table's size/path are now
// PROJECTED facts (records[].media), so changing them must move the resource version — before 1.1
// they sat on the neutral list ("galleryGroups", "cover alt", "assets"). A version that did not move
// would let a consumer keep stale images under an unchanged version (INV-2 / RV2 is the same rule;
// only the projection grew). What stays neutral: before-images (not exported in V1), assets no
// record's media references (site hero, logo, band …), and everything else outside the projection.
await check("E7 version changes with every projected fact (media included, 08) and with a record added/removed; stays for anything outside the projection (INV-2, RV2)", () => {
  const base = demoEmission.portfolio!.version;
  const vary = (f: (s: SiteSnapshot) => void) => {
    const s = clone(demo.snapshot);
    f(s);
    return emitFor(s).portfolio!.version;
  };
  const p = () => 0;
  const changes: [string, (s: SiteSnapshot) => void][] = [
    ["title", (s) => void (s.content.projects[p()]!.title += "!")],
    ["area.value", (s) => void (s.content.projects[p()]!.area!.value = 35)],
    ["area.basis", (s) => void (s.content.projects[p()]!.area!.basis = "exclusive")],
    ["pricePerArea.amount", (s) => void (s.content.projects[p()]!.pricePerArea!.amount = 1)],
    ["keywords", (s) => void s.content.projects[p()]!.keywords!.push("신규")],
    // V0.2 projected facts (07 §10): each one moves the version, so a re-authoring is never
    // invisible. bi-01 is now authored `full_remodel` / `apartment` (26 §1.2), so those two values
    // would be no-op mutations — each case changes the field to a DIFFERENT admissible value.
    ["projectType", (s) => void (s.content.projects[p()]!.projectType = "partial_remodel")],
    ["propertyType", (s) => void (s.content.projects[p()]!.propertyType = "officetel")],
    ["workScopeIds", (s) => void (s.content.projects[p()]!.workScopeIds = ["kitchen"])],
    ["totalPrice", (s) => void (s.content.projects[p()]!.totalPrice = { kind: "exact", amount: 52_000_000, currency: "KRW" })],
    ["styles", (s) => void (s.content.projects[p()]!.styles = ["미니멀"])],
    ["location", (s) => void (s.content.projects[p()]!.location = "서울")],
    ["publishedAt", (s) => void (s.content.projects[p()]!.publishedAt = "2026-08-28T10:00:00+09:00")],
    ["category label", (s) => void (s.content.categories[0]!.name += " ")],
    ["category id", (s) => void ((s.content.categories.find((c) => c.id === "full-remodel")!.id = "full-remodel-2"), s.content.projects.filter((x) => x.category === "full-remodel").forEach((x) => void (x.category = "full-remodel-2")))],
    ["slug (detailUrl)", (s) => void (s.content.projects[p()]!.slug = "other-slug")],
    ["record removed", (s) => void s.content.projects.pop()],
    // bi-09 … bi-19 now exist (26 §1.1), so the added record takes the next free id
    ["record added", (s) => void s.content.projects.push({ ...clone(s.content.projects[0]!), id: "bi-20", slug: "bi-20-slug" })],
    // 08 — media is projected: every one of these reaches records[].media
    ["galleryGroups removed", (s) => void delete s.content.projects[p()]!.galleryGroups],
    ["gallery order", (s) => void s.content.projects[p()]!.galleryGroups!.reverse()],
    ["gallery alt", (s) => void (s.content.projects[p()]!.galleryGroups![0]!.items[0]!.image.alt = "x")],
    ["gallery 13th image dropped (totalCount 13 → 12)", (s) => void s.content.projects[p()]!.galleryGroups!.at(-1)!.items.pop()],
    ["cover alt", (s) => void (s.content.projects[p()]!.cover.alt = "x")],
    ["cover alt removed", (s) => void delete s.content.projects[p()]!.cover.alt],
    ["cover asset", (s) => void (s.content.projects[p()]!.cover = { ...s.content.projects[p()]!.cover, asset: "bi01-kitchen-01" })],
    ["asset width/height", (s) => void (s.assets.find((a) => a.id === s.content.projects[p()]!.cover.asset)!.width = 1599)],
    ["asset publicPath (bytes)", (s) => void (s.assets.find((a) => a.id === s.content.projects[p()]!.cover.asset)!.publicPath = "/assets/00000000000000000000.jpg")],
  ];
  for (const [what, f] of changes) assert(vary(f) !== base, `${what}: version must change`);
  const neutral: [string, (s: SiteSnapshot) => void][] = [
    // 07 §8: the free-text `scope` facet is RETIRED, so the authored display text no longer
    // reaches the document — changing it must NOT move the resource version.
    ["scope (retired facet, still display content)", (s) => void s.content.projects[p()]!.scope!.push("옥상")],
    ["summary", (s) => void (s.content.projects[p()]!.summary = "다른 요약")],
    ["body", (s) => void (s.content.projects[p()]!.body = ["다른 본문"])],
    ["customerQuote", (s) => void delete s.content.projects[p()]!.customerQuote],
    // 08 — before images are not exported in V1 and not counted in totalCount
    ["a before image (bi-04)", (s) => void s.content.projects.find((x) => x.id === "bi-04")!.galleryGroups!.forEach((g) => g.items.forEach((i) => void delete i.before))],
    ["a gallery group's name", (s) => void (s.content.projects[p()]!.galleryGroups![0]!.name = "다른 이름")],
    ["builtYear / period / durationWeeks", (s) => void ((s.content.projects[p()]!.builtYear = 1999), (s.content.projects[p()]!.durationWeeks = 1), delete s.content.projects[p()]!.period)],
    ["settings", (s) => void (s.settings.overrides["home.projects-a"] = { limit: 2, selection: { mode: "latest" } })],
    ["theme", (s) => void (s.theme = s.theme ? { ...s.theme, tokens: { ...s.theme.tokens, "color-accent": "#123456" } } : undefined)],
    ["slots", (s) => void delete s.slots],
    ["banners / reviews", (s) => void (delete s.content.banners, delete s.content.reviews)],
    ["business", (s) => void (s.content.business.summary = "x")],
    // 08 — only the assets some record's media names are projected; the others are not
    ["assets no media references (site hero / band / logo / before / the 13th)", (s) => {
      const used = new Set(s.content.projects.flatMap((x) => [x.cover.asset, ...(x.galleryGroups ?? []).flatMap((g) => g.items.map((i) => i.image.asset)).slice(0, MEDIA_GALLERY_MAX)]));
      s.assets = s.assets.filter((a) => used.has(a.id));
    }],
    ["brandName / logo", (s) => void ((s.site.identity.brandName = "x"), delete s.site.identity.logo)],
    ["record order in the snapshot", (s) => void s.content.projects.reverse()],
  ];
  for (const [what, f] of neutral) eq(vary(f), base, `${what}: version must not change`);
});
await check("E8 a record's style / tag / workScopeIds arrays keep the authored order and drop repeats (first occurrence) — INV-14, WS3, 07 §11; the declared values are unique", () => {
  const s = clone(demo.snapshot);
  s.content.projects[0]!.styles = ["화이트", "미니멀", "화이트"];
  s.content.projects[0]!.keywords = ["간접조명", "간접조명"];
  s.content.projects[0]!.workScopeIds = ["kitchen", "bathroom", "kitchen"];
  const d = emitFor(s).portfolio!.document;
  eq(d.records[0]!.facets!.style, ["화이트", "미니멀"], "style authored order + dedupe");
  eq(d.records[0]!.facets!.tag, ["간접조명"], "tag dedupe");
  eq(d.records[0]!.workScopeIds, ["kitchen", "bathroom"], "workScopeIds authored order + dedupe");
  // The other 18 records carry their own authored scopes (26 §1), so the document declares the
  // union. Narrowing bi-01 to kitchen + bathroom removes no id from it: every one of bi-01's
  // authored six is also used by another record, so WS2's closure is unchanged by this craft.
  eq(d.workScopes, DEMO_WORK_SCOPES, "document workScopes: sorted, closed both ways (WS2)");
  eq(new Set(d.facets!.style!.values.map((v) => v.id)).size, d.facets!.style!.values.length, "unique declared");
  eq(Object.keys(d.facets!), ["category", "style", "tag"], "facet key order (02 §6.1)");
});
await check("E9 no item route over projects → the resource is NOT offered: manifest only with resources {} (02 §4/§5, CONFIRMED OFF (resource)); it validates; the manifest carries no pointer", () => {
  const routes = template.routes.filter((r) => !("item" in r));
  const e = emitIntegration({ snapshot: demo.snapshot, declaredRoutes: routes, plannedRoutes: plannedRoutesOf(demo.snapshot).filter((r) => r.key !== "portfolio.detail") });
  eq(e.portfolio, undefined, "no portfolio");
  eq(e.manifest.resources, {}, "resources {}");
  eq(e.files.map((f) => f.path), ["_integration/manifest.json"], "manifest only");
  eq(e.manifestFile.text, `{"schemaVersion":"0.1","site":{"id":"${DEMO}","publicOrigin":"https://interior-demo.boostweb.co.kr","locale":"ko-KR"},"resources":{}}`, "bytes");
  eq(validateFor(e, demo.snapshot), { errors: [], warnings: [] }, "validates");
  // unknown route keys / collections / page kinds are tolerated by the lenient schema (MINOR-4)
  const parsed = DeclaredRoutesSchema.safeParse([...template.routes, { key: "x", path: "/x", nav: "later", list: { collection: "reviews", pageSize: 5, page: "third" } }]);
  assert(parsed.success, "lenient declared-route schema");
});
await check("E10 emitter fails closed: no publicOrigin, http origin, ≥ 2 item routes over projects (ambiguous), a record whose detail page is not planned", async () => {
  const noOrigin = clone(demo.snapshot);
  delete noOrigin.site.identity.publicOrigin;
  await rejects(() => emitFor(noOrigin), /no publicOrigin/);
  const http = clone(demo.snapshot);
  http.site.identity.publicOrigin = "http://interior-demo.boostweb.co.kr";
  await rejects(() => emitFor(http), /not an https origin/);
  await rejects(() => emitIntegration({ snapshot: demo.snapshot, declaredRoutes: [...template.routes, { key: "x", path: "/x/[slug]", item: { collection: "projects" } }], plannedRoutes: plannedRoutesOf(demo.snapshot) }), /ambiguous detail page: the Template declares 2 item routes/);
  const planned = plannedRoutesOf(demo.snapshot).map((r) => (r.key === "portfolio.detail" ? { ...r, paths: r.paths.slice(1) } : r));
  await rejects(() => emitIntegration({ snapshot: demo.snapshot, declaredRoutes: template.routes, plannedRoutes: planned }), /not in the route plan/);
});

await check("K1 (P-V2-01, 06, 08–13) the 19-record DEMO corpus still covers what the contract exercises: breadth 7 full / 7 partial / 5 absent; totals 10 exact / 1 range / 8 absent; per-area 6 authored / 4 derived and every derived one is RD1's; the area bases a visitor states; the partial room shapes; each field missing somewhere", () => {
  // DATA COVERAGE only — the producer ranks nothing (07 §14 is the consumer's). A number moving here
  // means the canonical corpus changed, and the reason has to be recorded before the value is.
  const d = demoEmission.portfolio!.document;
  type Rec = (typeof d.records)[number];
  const tally = (f: (r: Rec) => string) => {
    const m: Record<string, number> = {};
    for (const r of d.records) m[f(r)] = (m[f(r)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort(([a], [b]) => compareCodePoints(a, b)));
  };
  const spaces = (r: Rec) => (r.workScopeIds ?? []).filter((id) => (WORK_SCOPE_SPACE_IDS as readonly string[]).includes(id)).sort(compareCodePoints);
  const ids = (pred: (r: Rec) => boolean) => d.records.filter(pred).map((r) => r.id);
  eq([d.records.length, new Set(d.records.map((r) => r.id)).size], [19, 19], "19 records, 19 unique ids");
  eq(tally((r) => r.projectType ?? "absent"), { absent: 5, full_remodel: 7, partial_remodel: 7 }, "projectType");
  eq(tally((r) => r.pricing?.total?.kind ?? "absent"), { absent: 8, exact: 10, range: 1 }, "pricing.total");
  eq(tally((r) => r.pricing?.perArea?.source ?? "absent"), { absent: 9, authored: 6, derived: 4 }, "pricing.perArea");
  // P-V2-11/12: a derived perArea is exactly RD1's over the record's own facts, only on a full_remodel
  // with an exact total; no partial and no breadth-absent record carries a derived one
  for (const r of d.records.filter((x) => x.pricing?.perArea?.source === "derived")) {
    eq(r.pricing!.perArea, derivePerArea({ projectType: r.projectType, total: r.pricing!.total, area: r.property?.area }, () => {}), `${r.id}: derived = RD1`);
    eq([r.projectType, r.pricing!.total!.kind, r.pricing!.perArea!.perUnit], ["full_remodel", "exact", r.property!.area!.unit], `${r.id}: D-1's conditions`);
  }
  eq(ids((r) => r.projectType !== "full_remodel" && r.pricing?.perArea?.source === "derived"), [], "no derived perArea off a full_remodel (INV-19)");
  eq(ids((r) => r.projectType === "partial_remodel" && r.pricing?.perArea !== undefined), [], "no partial carries any perArea (none authored one; none may derive one)");
  // FULL — "34평 전체 5천", a different area, a different total, the same area at two prices
  const full = d.records.filter((r) => r.projectType === "full_remodel");
  eq(ids((r) => r.projectType === "full_remodel" && r.property?.area?.value === 34 && r.property.area.unit === "pyeong" && r.pricing?.total?.kind === "exact" && r.pricing.total.amount === 50_000_000), ["bi-09"], "34평 full, exact 50,000,000");
  assert(full.some((r) => r.pricing?.total?.kind === "exact" && r.pricing.total.amount <= 30_000_000), "a full job at ≤ 30,000,000 exists (bi-11, 20평; no 34평 one — the consumer says so, the producer invents none)");
  assert(new Set(full.map((r) => r.property?.area?.value)).size >= 5, "full jobs span several areas");
  const at34 = full.filter((r) => r.property?.area?.value === 34 && r.property.area.unit === "pyeong" && r.pricing?.total?.kind === "exact");
  assert(new Set(at34.map((r) => (r.pricing!.total as { amount: number }).amount)).size >= 2, `same area, different prices: ${at34.map((r) => r.id)}`);
  // PARTIAL — the rooms a partial covered, as authored (WS7a closes Spaces for a partial)
  const partialBySpaces = (want: string[]) => ids((r) => r.projectType === "partial_remodel" && JSON.stringify(spaces(r)) === JSON.stringify([...want].sort(compareCodePoints)));
  eq(partialBySpaces(["kitchen"]), ["bi-14"], "주방만");
  eq(partialBySpaces(["bathroom"]), ["bi-15"], "욕실만");
  eq(partialBySpaces(["kitchen", "bathroom"]), ["bi-04", "bi-16"], "주방+욕실");
  eq(partialBySpaces(["living_room"]), ["bi-17"], "거실만");
  eq(ids((r) => r.projectType === "partial_remodel" && spaces(r).join() === "entrance" && r.workScopeIds!.includes("built_in_furniture")), ["bi-18"], "현관 수납");
  eq(ids((r) => spaces(r).length === 0 && ["flooring", "wallpaper"].every((w) => r.workScopeIds?.includes(w as never))), ["bi-19"], "도배랑 바닥만: a trades-only job, breadth absent (PT5/PT6)");
  // AREA BASIS — as authored, never converted (AR3, PY1)
  const area = (r: Rec) => (r.property?.area ? `${r.property.area.value} ${r.property.area.unit} ${r.property.area.basis ?? "-"}` : "absent");
  const areas = new Set(d.records.map(area));
  for (const a of ["34 pyeong supply", "112 m2 supply", "84 m2 exclusive", "absent"]) assert(areas.has(a), `area ${a}`);
  // MISSING — each is left missing on some record, never filled (INV-25, E4)
  eq(ids((r) => r.projectType === undefined), ["bi-02", "bi-03", "bi-05", "bi-08", "bi-19"], "projectType absent");
  eq(ids((r) => r.property?.area === undefined), ["bi-15"], "area absent");
  eq(ids((r) => r.facets?.style === undefined), ["bi-18"], "style absent");
  eq(ids((r) => r.pricing === undefined), ["bi-04", "bi-06"], "price absent");
  eq(ids((r) => r.property?.type === undefined), ["bi-06"], "property.type absent");
});

console.log("\n[annex] the V0.2 built-space annex on crafted snapshots (07 §5–§11, INV-17 … INV-30)");
/** the demo snapshot with ONE record re-authored: only the V0.2 fields under test change. */
function craft(mutate: (p: Project) => void, id = "bi-01") {
  const snapshot = clone(demo.snapshot);
  const source = snapshot.content.projects.find((x) => x.id === id)!;
  mutate(source);
  assert(ProjectSchema.safeParse(source).success, `crafted record ${id} must itself be valid content: ${JSON.stringify(ProjectSchema.safeParse(source).error?.issues)}`);
  const emission = emitFor(snapshot);
  const document = emission.portfolio!.document;
  return { snapshot, emission, document, record: document.records.find((r) => r.id === id)!, result: validateFor(emission, snapshot) };
}
const FULL_34PY = (p: Project) => {
  delete p.pricePerArea;
  p.projectType = "full_remodel";
  // INV-29 — a full_remodel must name at least one SPACE (07 §7.3 spaces table).
  p.workScopeIds = ["living_room", "kitchen", "bathroom"];
  p.area = { value: 34, unit: "pyeong", basis: "supply" };
  p.totalPrice = { kind: "exact", amount: 52_000_000, currency: "KRW" };
};

await check("A1 INV-20 / RD1 end to end: full_remodel + exact total + area + no authored perArea → a DERIVED perArea of exactly floor((2T+A)/(2A)), perUnit = the record's own area unit, currency = the total's", () => {
  const { record, result } = craft(FULL_34PY);
  eq(record.projectType, "full_remodel", "projectType copied");
  eq(record.workScopeIds, ["living_room", "kitchen", "bathroom"], "authored order");
  // bi-01 authors `propertyType: "apartment"` (26 §1.2), so `property` carries it alongside the
  // area. What this line checks is unchanged: the AREA is copied under `property` untouched.
  eq(record.property, { type: "apartment", area: { value: 34, unit: "pyeong", basis: "supply" } }, "area unchanged under property (07 §6)");
  eq(record.pricing, { total: { kind: "exact", amount: 52_000_000, currency: "KRW" }, perArea: { amount: 1_529_412, currency: "KRW", perUnit: "pyeong", source: "derived" } }, "52,000,000 / 34평 → 1,529,412 (round half up)");
  eq([result.errors, result.warnings], [[], []], "validates with no warning");
});
await check("A2 RD1 arithmetic: the eight independently verified values reproduce exactly, and 1e9 / 0.01 is refused by the OUTPUT guard (no perArea, one warning, no error)", () => {
  const cases: [number, number, string, number][] = [
    [52_000_000, 34, "pyeong", 1_529_412],
    [85_000_000, 34, "pyeong", 2_500_000],
    [30_000_000, 20, "pyeong", 1_500_000],
    [50_000_000, 34, "pyeong", 1_470_588],
    [7, 0.28, "pyeong", 25],
    [3, 2, "m2", 2],
    [5, 2, "m2", 3],
    [1, 0.01, "m2", 100],
  ];
  for (const [amount, value, unit, expected] of cases) {
    const guardFailures: string[] = [];
    const got = derivePerArea({ projectType: "full_remodel", total: { kind: "exact", amount, currency: "KRW" }, area: { value, unit } }, (w) => guardFailures.push(w));
    eq(got, { amount: expected, currency: "KRW", perUnit: unit, source: "derived" }, `${amount} / ${value} ${unit}`);
    eq(guardFailures, [], `${amount} / ${value}: no guard failure`);
    assert(Number.isInteger(got!.amount), "the derived amount is an integer in the major unit");
  }
  // output guard: 1e9 / 0.01 = 1e11, far above the 1e9 amount ceiling → omit, never emit
  const failures: string[] = [];
  eq(derivePerArea({ projectType: "full_remodel", total: { kind: "exact", amount: 1_000_000_000, currency: "KRW" }, area: { value: 0.01, unit: "m2" } }, (w) => failures.push(w)), undefined, "refused");
  assert(failures.length === 1 && /output guard/.test(failures[0]!), `one output-guard warning: ${failures.join(" | ")}`);
  // input guards: A must be a safe integer in 1..1e8 and T in 1..1e11 — the area schema caps the
  // fraction digits but not the magnitude, so A needs its own ceiling.
  for (const [what, total, area] of [
    ["area above the A ceiling", { kind: "exact" as const, amount: 5_000_000, currency: "KRW" }, { value: 2_000_000, unit: "m2" }],
    ["area below 0.01", { kind: "exact" as const, amount: 5_000_000, currency: "KRW" }, { value: 0.001, unit: "m2" }],
  ] as const) {
    const w: string[] = [];
    eq(derivePerArea({ projectType: "full_remodel", total, area }, (x) => w.push(x)), undefined, `refused: ${what}`);
    assert(w.length === 1 && /input guard/.test(w[0]!), `${what}: one input-guard warning, got ${w.join(" | ")}`);
  }
});
await check("A3 07 §9.3 guard failure WARNS and omits — it never fails the build and never emits a number nobody can trust", () => {
  const { record, result, emission } = craft((p) => {
    FULL_34PY(p);
    p.area = { value: 0.01, unit: "m2" };
    p.totalPrice = { kind: "exact", amount: 1_000_000_000, currency: "KRW" };
  });
  eq(record.pricing!.perArea, undefined, "no perArea");
  eq(record.pricing!.total, { kind: "exact", amount: 1_000_000_000, currency: "KRW" }, "the authored total survives");
  eq(result.errors, [], "not an error (VA1's one warn-and-omit case)");
  assert(result.warnings.some((w) => /bi-01.*no derived per-area price.*RD1 output guard/.test(w)), `warning expected: ${result.warnings.join(" | ")}`);
  eq(emission.portfolio!.warnings.length, 1, "the emission carries the warning (it reaches the build record)");
});
await check("A4 INV-19 / D-1a: partial_remodel + exact total + area → NO perArea. *6,000,000 KRW for one bathroom of a 34평 flat has no per-area price.*", () => {
  const { record, result } = craft((p) => {
    delete p.pricePerArea;
    p.projectType = "partial_remodel";
    p.workScopeIds = ["bathroom"];
    p.area = { value: 34, unit: "pyeong", basis: "supply" };
    p.totalPrice = { kind: "exact", amount: 6_000_000, currency: "KRW" };
  });
  eq(record.pricing!.perArea, undefined, "no derived perArea for partial_remodel");
  eq(result.errors, [], "valid");
  assert(!JSON.stringify(record).includes("176470") && !JSON.stringify(record).includes("176471"), "6,000,000 / 34 appears nowhere");
  // and the same with projectType ABSENT (PT4) — absence is never treated as full_remodel
  const absent = craft((p) => {
    delete p.pricePerArea;
    delete p.projectType;
    p.area = { value: 34, unit: "pyeong", basis: "supply" };
    p.totalPrice = { kind: "exact", amount: 52_000_000, currency: "KRW" };
  });
  eq(absent.record.pricing!.perArea, undefined, "no derived perArea when projectType is absent (D-1a)");
  eq(absent.result.errors, [], "valid");
});
await check("A5 D-1 condition 2: full_remodel + a RANGE total + area → NO perArea (a range has no single right answer)", () => {
  const { record, result } = craft((p) => {
    FULL_34PY(p);
    p.totalPrice = { kind: "range", minAmount: 45_000_000, maxAmount: 55_000_000, currency: "KRW" };
  });
  eq(record.pricing!.total, { kind: "range", minAmount: 45_000_000, maxAmount: 55_000_000, currency: "KRW" }, "the range is copied as authored");
  eq(record.pricing!.perArea, undefined, "no derivation from a range");
  eq(result.errors, [], "valid");
});
await check("A6 INV-21 / PA1: full_remodel + an AUTHORED perArea + an exact total → the AUTHORED value survives unchanged (and is never marked derived)", () => {
  const { record, result } = craft((p) => {
    p.projectType = "full_remodel";
    p.workScopeIds = ["living_room", "kitchen", "bathroom"];
    p.area = { value: 34, unit: "pyeong", basis: "supply" };
    p.totalPrice = { kind: "exact", amount: 52_000_000, currency: "KRW" };
    p.pricePerArea = { amount: 2_900_000, currency: "KRW", unit: "pyeong" };
  });
  eq(record.pricing!.perArea, { amount: 2_900_000, currency: "KRW", perUnit: "pyeong", source: "authored" }, "authored wins over derivable (PA1)");
  assert(record.pricing!.perArea!.amount !== 1_529_412, "the derivable value never replaces it");
  eq(result.errors, [], "valid");
});
await check("A7 D-1 condition 3: full_remodel + exact total but NO area → no perArea, and the total is still emitted", () => {
  const { record, result } = craft((p) => {
    delete p.pricePerArea;
    delete p.area;
    // MD4's "omitted entirely" can only be observed on a record with NEITHER sub-field, and bi-01
    // now authors `propertyType` (26 §1.2) — so the crafted record drops it too. The assertion
    // below is unchanged; only the record it is staged on had to be built for the case.
    delete p.propertyType;
    p.projectType = "full_remodel";
    p.workScopeIds = ["living_room", "kitchen"];
    p.totalPrice = { kind: "exact", amount: 52_000_000, currency: "KRW" };
  });
  eq(record.property, undefined, "property omitted entirely (MD4)");
  eq(record.pricing, { total: { kind: "exact", amount: 52_000_000, currency: "KRW" } }, "total alone");
  eq(result.errors, [], "valid");
});
await check("A8 INV-17 / WS2: document.workScopes is a sorted plain id array, closed both ways, and absent when no record has one; INV-18: never []", () => {
  /**
   * WS2's two absence rules — the document block is the union of exactly what the records carry,
   * and is ABSENT when none carries any (INV-18: never `[]`) — can only be observed where a single
   * record decides the block. Since the re-authoring all 19 demo records carry work scopes
   * (26 §1.2), so this check stages its own corpus instead of relaxing what it asserts: every
   * record but bi-01 drops `projectType` + `workScopeIds`, which is the breadth-absent shape PT5
   * prescribes and is itself valid content (A10's last case proves INV-30 stays silent for it).
   */
  const soloCraft = (mutate: (p: Project) => void) => {
    const snapshot = clone(demo.snapshot);
    for (const p of snapshot.content.projects) {
      if (p.id === "bi-01") continue;
      delete p.projectType;
      delete p.workScopeIds;
    }
    const source = snapshot.content.projects.find((x) => x.id === "bi-01")!;
    mutate(source);
    for (const p of snapshot.content.projects) assert(ProjectSchema.safeParse(p).success, `${p.id} must itself be valid content: ${JSON.stringify(ProjectSchema.safeParse(p).error?.issues)}`);
    const emission = emitFor(snapshot);
    const document = emission.portfolio!.document;
    return { document, record: document.records.find((r) => r.id === "bi-01")!, result: validateFor(emission, snapshot) };
  };
  const { document, result } = soloCraft((p) => {
    p.workScopeIds = ["kitchen", "bathroom", "entrance"];
  });
  const other = document.records.find((r) => r.id !== "bi-01" && r.workScopeIds)!;
  eq(other, undefined, "no other record has work scopes");
  eq(document.workScopes, ["bathroom", "entrance", "kitchen"], "sorted ascending by code point; ids only, no labels (07 §7.2)");
  eq(document.records.find((r) => r.id === "bi-01")!.workScopeIds, ["kitchen", "bathroom", "entrance"], "the record keeps the authored order");
  eq(result.errors, [], "valid");
  // INV-18 / WS5 / MD3: an authored empty array never becomes `[]` in the document
  const empty = soloCraft((p) => {
    // a record that carries no work scopes may not declare a breadth either (INV-28 / INV-29);
    // bi-01 now authors `full_remodel` (26 §1.2), so the crafted record drops it with them.
    delete p.projectType;
    p.workScopeIds = undefined;
    p.styles = [];
    p.keywords = [];
  });
  eq([empty.record.workScopeIds, empty.record.facets!.style, empty.record.facets!.tag, empty.document.workScopes], [undefined, undefined, undefined, undefined], "omitted, never []");
  eq(empty.result.errors, [], "valid");
});
await check("A9 INV-24 / ST4: `style` is the authored `styles`, `tag` is the authored `keywords` MINUS them — `styles` is normally a SUBSET of `keywords`, and the subtraction makes the two facets disjoint by construction", () => {
  const { record, document, result } = craft((p) => {
    // the normal authoring shape: the operator tags 화이트 and 미니멀 once, then marks them as styles
    p.keywords = ["화이트", "간접조명", "미니멀", "수납 특화"];
    p.styles = ["화이트", "미니멀"];
  });
  eq(record.facets!.style, ["화이트", "미니멀"], "style = the authored styles, authored order");
  eq(record.facets!.tag, ["간접조명", "수납 특화"], "tag = keywords MINUS styles, survivors in authored order (ST2 keeps these two as tags)");
  // the document's style vocabulary is the union over all 19 records (28 §1), not bi-01's alone
  eq(document.facets!.style!.values, DEMO_STYLE_VALUES, "declared, sorted, {id,label}");
  eq(record.facets!.style!.filter((v) => record.facets!.tag!.includes(v)), [], "ST4/INV-24 holds on the record: no value in both of ITS facets");
  eq(result.errors, [], "valid — overlap in the AUTHORED fields is the normal case, not an error");
  // NOTE: the rule is per RECORD. A record that leaves 화이트 as a plain keyword still declares it
  // in the document's `tag` vocabulary — the subtraction cannot make the two DOCUMENT vocabularies
  // disjoint, only each record's two arrays. 28's authoring pass made the demo corpus CONSISTENT
  // (ST6), so that second record no longer exists in the data and is crafted here: bi-06 keeps
  // 화이트 / 미니멀 as plain keywords, exactly the shape A12 measures the ST6 warning on.
  const mixed = clone(demo.snapshot);
  const mixed01 = mixed.content.projects.find((p) => p.id === "bi-01")!;
  mixed01.keywords = ["화이트", "간접조명", "미니멀", "수납 특화"];
  mixed01.styles = ["화이트", "미니멀"];
  const mixed06 = mixed.content.projects.find((p) => p.id === "bi-06")!;
  delete mixed06.styles;
  assert((mixed06.keywords ?? []).includes("화이트"), "fixture: bi-06 keeps 화이트 as a plain keyword");
  const mixedDoc = emitFor(mixed).portfolio!.document;
  assert(mixedDoc.facets!.tag!.values.some((v) => v.id === "화이트"), "the record that left 화이트 a plain keyword declares it in the document's tag vocabulary");
  assert(mixedDoc.facets!.style!.values.some((v) => v.id === "화이트"), "…while bi-01 declares it a style: the per-record subtraction cannot make the two DOCUMENT vocabularies disjoint");
  assert(ProjectSchema.safeParse({ ...demo.snapshot.content.projects[0]!, styles: ["화이트"], keywords: ["화이트", "간접조명"] }).success, "the content model accepts styles ⊆ keywords");
  // every keyword marked as a style → `tag` is omitted entirely, never [] (MD3, INV-18)
  const all = craft((p) => {
    p.keywords = ["화이트"];
    p.styles = ["화이트"];
  });
  eq(all.record.facets!.tag, undefined, "empty after subtraction → the record's tag key is omitted, never []");
  eq(all.result.errors, [], "valid");
});
await check("A10 INV-28 / WS7a: a partial_remodel without workScopeIds is refused; INV-29: a full_remodel whose scopes are TRADES ONLY (flooring, wallpaper, lighting) is refused — that is PT4(c), and it must never feed D-1; INV-30: the same refusal for a trades-only PARTIAL, which INV-28 let through because the set was non-empty", () => {
  /**
   * INV-28's refusal is "a breadth is declared and NO work scopes are", so it can only be observed
   * on a record that carries none. Since the re-authoring every demo record carries them (26 §1.2),
   * so the base is bi-01 with its two breadth fields stripped — the record as it stood before that
   * pass. This is a purpose-built record, not a weakened assertion: every safeParse below is
   * unchanged, and INV-28 must still fire on it.
   */
  const { projectType: _pt, workScopeIds: _ws, ...base } = demo.snapshot.content.projects[0]!;
  assert(ProjectSchema.safeParse(base).success, "the stripped base is itself valid content (breadth-absent, PT5/PT6)");
  const bad = ProjectSchema.safeParse({ ...base, projectType: "partial_remodel" });
  assert(!bad.success && /INV-28/.test(JSON.stringify(bad.error!.issues)), "content model refuses a partial_remodel with no scopes");
  eq(craft((p) => {
    p.projectType = "partial_remodel";
    p.workScopeIds = ["kitchen", "bathroom"];
  }).result.errors, [], "with the closed set it is valid");
  const trades = ProjectSchema.safeParse({ ...base, projectType: "full_remodel", workScopeIds: ["flooring", "wallpaper", "lighting"] });
  assert(!trades.success && /INV-29/.test(JSON.stringify(trades.error!.issues)), "content model refuses a trades-only full_remodel");
  assert(!ProjectSchema.safeParse({ ...base, projectType: "full_remodel" }).success, "…and one with no scopes at all");
  assert(ProjectSchema.safeParse({ ...base, projectType: "full_remodel", workScopeIds: ["flooring", "wallpaper", "lighting", "living_room"] }).success, "one SPACE is enough");
  // INV-30 — the mirror of INV-29 for partials. PT5 authors a partial as a BOUNDED SET OF SPACES,
  // so a trades-only partial names no boundary; such a job is breadth-absent (bi-19's case), never
  // a partial. INV-28 let this through because the set was non-empty.
  const tradesPartial = ProjectSchema.safeParse({ ...base, projectType: "partial_remodel", workScopeIds: ["flooring", "wallpaper"] });
  assert(!tradesPartial.success && /INV-30/.test(JSON.stringify(tradesPartial.error!.issues)), "content model refuses a trades-only partial_remodel");
  assert(ProjectSchema.safeParse({ ...base, projectType: "partial_remodel", workScopeIds: ["kitchen", "flooring"] }).success, "one SPACE is enough for a partial too");
  assert(ProjectSchema.safeParse({ ...base, workScopeIds: ["flooring", "wallpaper"] }).success, "INV-30 is silent when projectType is absent: that IS the breadth-absent authoring PT5 prescribes");
  eq(craft((p) => {
    FULL_34PY(p);
    p.workScopeIds = ["living_room", "flooring", "wallpaper"];
  }).result.errors, [], "a full_remodel with a space + trades is valid");
});
await check("A11 INV-23 / TP1: the content model refuses an equal-bounds or inverted range, a non-positive amount, a bad currency and an amount above 1e9; `exact` and `range` cannot coexist (structurally)", () => {
  const base = demo.snapshot.content.projects[0]!;
  const bad: [string, unknown][] = [
    ["equal bounds", { kind: "range", minAmount: 5_000_000, maxAmount: 5_000_000, currency: "KRW" }],
    ["inverted", { kind: "range", minAmount: 9_000_000, maxAmount: 5_000_000, currency: "KRW" }],
    ["zero", { kind: "exact", amount: 0, currency: "KRW" }],
    ["negative", { kind: "exact", amount: -1, currency: "KRW" }],
    ["3 decimals", { kind: "exact", amount: 5_000_000.125, currency: "KRW" }],
    ["above 1e9", { kind: "exact", amount: 1_000_000_001, currency: "KRW" }],
    ["lowercase currency", { kind: "exact", amount: 5_000_000, currency: "krw" }],
    ["no kind", { amount: 5_000_000, currency: "KRW" }],
    ["both shapes", { kind: "exact", amount: 5_000_000, minAmount: 1, maxAmount: 2, currency: "KRW" }],
  ];
  for (const [what, totalPrice] of bad) assert(!ProjectSchema.safeParse({ ...base, totalPrice }).success, `accepted: ${what}`);
  assert(ProjectSchema.safeParse({ ...base, totalPrice: { kind: "range", minAmount: 45_000_000, maxAmount: 55_000_000, currency: "KRW" } }).success, "a real range is valid");
});
await check("A12 ST6 (07 §8, P: SHOULD warn at build): a value one record classifies as a style while another leaves it a plain keyword makes the DOCUMENT-level facets.style.values and facets.tag.values overlap — INV-24 is per record only (ST4), so this is authoring inconsistency, not a contract violation; it must never fail the build and must never change an emitted byte", () => {
  // bi-01 marks 화이트/미니멀 as styles (both already its own keywords, so ST4 subtracts them from
  // its OWN tag); bi-06 (untouched) still carries both as plain keywords — no record carries either
  // value in both of ITS OWN facets, but the document-level vocabularies now intersect.
  const inconsistent = clone(demo.snapshot);
  const bi01 = inconsistent.content.projects.find((p) => p.id === "bi-01")!;
  const bi06 = inconsistent.content.projects.find((p) => p.id === "bi-06")!;
  bi01.styles = ["화이트", "미니멀"];
  // 28's authoring pass gave bi-06 the SAME two styles, so the corpus is now consistent and emits
  // no ST6 warning (V1). The inconsistency this check is about therefore has to be staged: bi-06
  // goes back to leaving both words plain keywords. That is the only edit; the warning text, the
  // per-record INV-24 assertions and the byte-identity assertions below are all unchanged.
  delete bi06.styles;
  assert(["화이트", "미니멀"].every((v) => (bi01.keywords ?? []).includes(v)), "fixture assumption: bi-01 already carries both as keywords");
  assert(["화이트", "미니멀"].every((v) => (bi06.keywords ?? []).includes(v)) && (bi06.styles ?? []).length === 0, "fixture assumption: bi-06 leaves both as plain keywords");

  const emission = emitFor(inconsistent);
  const document = emission.portfolio!.document;
  const bi01Record = document.records.find((r) => r.id === "bi-01")!;
  eq(bi01Record.facets!.style, ["화이트", "미니멀"], "bi-01's own style facet");
  eq((bi01Record.facets!.tag ?? []).some((v) => ["화이트", "미니멀"].includes(v)), false, "INV-24 still holds PER RECORD — bi-01's own tag excludes both (ST4)");
  eq(document.facets!.style!.values.map((v) => v.id).filter((id) => ["화이트", "미니멀"].includes(id)).sort(), ["미니멀", "화이트"], "both declared in the document's style vocabulary");
  assert(document.facets!.tag!.values.some((v) => v.id === "화이트") && document.facets!.tag!.values.some((v) => v.id === "미니멀"), "both still declared in the document's tag vocabulary (from bi-06 and others)");
  eq(emission.portfolio!.warnings, [`facets: "미니멀", "화이트" appear in both facets.style.values and facets.tag.values (ST6, 07 §8)`], "ST6 warning fires with the offending values sorted (code point order), exact text");

  const result = validateFor(emission, inconsistent);
  eq(result.errors, [], "not a VA1 condition — ST6 never fails the build");
  eq(result.warnings, emission.portfolio!.warnings, "the validator merges the emitter's warning unchanged, same channel as a VO6 warning");

  // byte identity: the warning is read-only over the already-built facet maps and never reaches
  // the emitted bytes, and re-emitting the same (warning-triggering) snapshot is still deterministic.
  assert(!emission.portfolio!.file.text.includes("ST6"), "the warning text never reaches the emitted document bytes");
  const again = emitFor(inconsistent);
  eq(again.portfolio!.file.text, emission.portfolio!.file.text, "re-emitting the same snapshot is byte-identical regardless of the warning");
  eq(again.portfolio!.version, emission.portfolio!.version, "version unaffected by the warning");

  // negative: a style word no other record's tag carries → the vocabularies do not intersect → no warning
  const consistent = clone(demo.snapshot);
  const bi01c = consistent.content.projects.find((p) => p.id === "bi-01")!;
  // 빈티지 is ADDED to bi-01's authored styles rather than replacing them: dropping 화이트 /
  // 미니멀 back into its `tag` would re-create the very overlap this branch is proving absent,
  // because every other record now classifies them as styles (28 §1).
  bi01c.styles = [...(bi01c.styles ?? []), "빈티지"];
  bi01c.keywords = [...(bi01c.keywords ?? []), "빈티지"];
  assert(consistent.content.projects.every((p) => p.id === "bi-01" || !(p.keywords ?? []).includes("빈티지")), "fixture assumption: no other record carries 빈티지");
  eq(emitFor(consistent).portfolio!.warnings, [], "no ST6 warning when the style and tag vocabularies do not intersect");
  eq(emitFor(demo.snapshot).portfolio!.warnings, [], "the untouched demo emission (V1) carries no ST6 warning either");
});

await check("A13 INV-22 provenance, metamorphic, over every demo record: moving only area.value changes only property.area.value and a derived perArea; moving only the authored pricePerArea changes only pricing.perArea; moving only the authored total changes only pricing.total and a derived perArea — RD1 is the one dependency of any emitted value on the area", () => {
  const flat = (v: unknown, at: string, out: Record<string, string>) => {
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flat(x, at ? `${at}.${k}` : k, out);
    else out[at] = JSON.stringify(v);
    return out;
  };
  /** every document path whose value differs, the resource `version` excluded (it hashes the body) */
  const moved = (a: PortfolioDocument, b: PortfolioDocument) => {
    const fa = flat({ ...a, version: 0 }, "", {});
    const fb = flat({ ...b, version: 0 }, "", {});
    return [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => fa[k] !== fb[k]).sort();
  };
  const base = demoEmission.portfolio!.document;
  const after = (snap: SiteSnapshot, id: string, mutate: (p: Project) => void) => {
    const s = clone(snap);
    mutate(s.content.projects.find((p) => p.id === id)!);
    return emitFor(s).portfolio!.document;
  };
  const expectOnly = (label: string, got: string[], must: string[], may: string[]) => {
    assert(must.every((k) => got.includes(k)) && got.every((k) => must.includes(k) || may.includes(k)), `${label}: moved ${JSON.stringify(got)}, allowed ${JSON.stringify([...must, ...may])}`);
  };
  let runs = 0;
  base.records.forEach((rec, i) => {
    const src = demo.snapshot.content.projects.find((p) => p.id === rec.id)!;
    const at = `records.${i}.`;
    const derived = rec.pricing?.perArea?.source === "derived" ? [`${at}pricing.perArea.amount`] : [];
    if (src.area) {
      expectOnly(`${rec.id} area`, moved(base, after(demo.snapshot, rec.id, (p) => void (p.area!.value += 1))), [`${at}property.area.value`], derived);
      runs++;
    }
    if (src.pricePerArea) {
      expectOnly(`${rec.id} pricePerArea`, moved(base, after(demo.snapshot, rec.id, (p) => void (p.pricePerArea!.amount += 10_000))), [`${at}pricing.perArea.amount`], []);
      runs++;
    }
    if (src.totalPrice) {
      const t = src.totalPrice;
      const got = moved(base, after(demo.snapshot, rec.id, (p) => {
        p.totalPrice = t.kind === "exact" ? { ...t, amount: t.amount + 1_000_000 } : { ...t, minAmount: t.minAmount + 1_000_000, maxAmount: t.maxAmount + 1_000_000 };
      }));
      expectOnly(`${rec.id} total`, got, t.kind === "exact" ? [`${at}pricing.total.amount`] : [`${at}pricing.total.minAmount`, `${at}pricing.total.maxAmount`], derived);
      runs++;
    }
  });
  eq(runs, 18 + 6 + 11, "18 areas, 6 authored per-area prices, 11 totals moved");
  // 07 §15's named valid case: an authored perArea of 1,000,000 and an area of 34 coincide with a real
  // total of 34,000,000 — it validates, and moving the area still moves nothing but the area
  const s = clone(demo.snapshot);
  const bi01 = s.content.projects.find((p) => p.id === "bi-01")!;
  bi01.pricePerArea = { ...bi01.pricePerArea!, amount: 1_000_000 };
  bi01.totalPrice = { kind: "exact", amount: 34_000_000, currency: "KRW" };
  const coincide = emitFor(s);
  eq(validateFor(coincide, s).errors, [], "the coincidence validates");
  expectOnly("bi-01 coincidence area", moved(coincide.portfolio!.document, after(s, "bi-01", (p) => void (p.area!.value += 1))), ["records.0.property.area.value"], []);
});

console.log("\n[media] portfolio media 1.1 (08 = D1): the producer's sourcing on real data and crafted snapshots");
/** the after images a record authors, in authored order (08 §3: `before` is never one of them) */
const afterRefs = (p: Project) => (p.galleryGroups ?? []).flatMap((g) => g.items.map((i) => i.image));
/** the MediaImage 08 §2 expects for an authored MediaRef — written from the snapshot's asset table */
const expectImage = (ref: { asset: string; alt?: string }) => {
  const a = demo.snapshot.assets.find((x) => x.id === ref.asset)!;
  return { src: a.publicPath, ...(ref.alt ? { alt: ref.alt } : {}), width: a.width, height: a.height };
};
await check("E11 demo media = the authored cover + the authored AFTER gallery, first 12 in authored order, totalCount = all after images; bi-01 12 of 13 (hasMore derived), bi-02 … bi-08 complete, bi-09 … bi-19 cover only; bi-04's before images absent; 19 covers · 8 galleries · 41 images · totalCount 42", () => {
  const d = demoEmission.portfolio!.document;
  for (const r of d.records) {
    const src = demo.snapshot.content.projects.find((p) => p.id === r.id)!;
    const after = afterRefs(src);
    const want = {
      cover: expectImage(src.cover),
      ...(after.length > 0 ? { gallery: after.slice(0, MEDIA_GALLERY_MAX).map(expectImage), totalCount: after.length } : {}),
    };
    eq(r.media, want, `${r.id}: media = the authored cover + after gallery (08 §3)`);
    assert(PortfolioMediaSchema.safeParse(r.media).success, `${r.id}: media passes the 08 schema`);
  }
  const m = (id: string) => d.records.find((r) => r.id === id)!.media!;
  eq([m("bi-01").gallery!.length, m("bi-01").totalCount], [12, 13], "bi-01: 12 exported of 13 → a consumer derives hasMore = true");
  eq(m("bi-01").gallery!.map((g) => g.src).includes(expectImage({ asset: "bi01-bathroom-02" }).src), false, "bi-01: the 13th after image (bi01-bathroom-02) is counted, not exported");
  eq(d.records.filter((r) => r.media?.gallery && r.media.totalCount! > r.media.gallery.length).map((r) => r.id), ["bi-01"], "derived hasMore only on bi-01");
  eq(d.records.filter((r) => !r.media?.gallery).map((r) => r.id), ["bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-14", "bi-15", "bi-16", "bi-17", "bi-18", "bi-19"], "cover only: bi-09 … bi-19");
  for (const id of ["bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-14", "bi-15", "bi-16", "bi-17", "bi-18", "bi-19"]) eq(Object.keys(m(id)), ["cover"], `${id}: media = { cover } — no gallery, no totalCount`);
  // bi-09 … bi-19 reuse AUTHORED covers: each is an after image of one of bi-01 … bi-08 (a reused
  // authored asset — the site itself renders it as that record's cover — not a guessed relation)
  const earlyAfter = new Set(demo.snapshot.content.projects.filter((p) => afterRefs(p).length > 0).flatMap((p) => afterRefs(p).map((ref) => ref.asset)));
  for (const p of demo.snapshot.content.projects.filter((x) => afterRefs(x).length === 0)) assert(earlyAfter.has(p.cover.asset), `${p.id}: cover ${p.cover.asset} is a reused authored gallery asset`);
  const bi04 = demo.snapshot.content.projects.find((p) => p.id === "bi-04")!;
  const befores = (bi04.galleryGroups ?? []).flatMap((g) => g.items.flatMap((i) => (i.before ? [i.before] : [])));
  eq(befores.length, 2, "bi-04 authors two before images");
  for (const b of befores) assert(!demoEmission.portfolio!.file.text.includes(`"${expectImage(b).src}"`), `before image ${b.asset} is not exported`);
  eq(m("bi-04").totalCount, 4, "bi-04: totalCount counts the 4 after images only (not the 2 befores)");
  const all = d.records.map((r) => r.media!);
  eq([all.filter((x) => x.cover).length, all.filter((x) => x.gallery).length, all.reduce((n, x) => n + (x.gallery?.length ?? 0), 0), all.reduce((n, x) => n + (x.totalCount ?? 0), 0)], [19, 8, 41, 42], "covers · galleries · exported images · totalCount");
  // every image of this corpus authors its alt and the registry gives every size
  assert(all.flatMap((x) => [x.cover!, ...(x.gallery ?? [])]).every((i) => i.alt && i.width === 1600 && i.height === 1200 && /^\/assets\/[0-9a-f]{20}\.jpg$/.test(i.src)), "authored alt, 1600×1200, content-addressed same-origin jpg path");
});
await check("E12 media on crafted snapshots: alt only when authored (absent / \"\" → no key, never invented); exactly 12 → 12/12; 30 → 12/30; no gallery → { cover }; a before image is neither exported nor counted; an asset missing from the snapshot fails closed; media feeds no other field", async () => {
  // alt: never invented
  const noAlt = craft((p) => {
    delete p.cover.alt;
    p.galleryGroups![0]!.items[0]!.image.alt = "";
  });
  eq(noAlt.result.errors, [], "valid without alt");
  eq(Object.keys(noAlt.record.media!.cover!), ["src", "width", "height"], "cover alt absent → no key");
  eq(Object.keys(noAlt.record.media!.gallery![0]!), ["src", "width", "height"], "gallery alt \"\" → no key (MD2), never a placeholder");
  // the 12 cap and totalCount
  const withAfter = (n: number) => (p: Project) => {
    const one = afterRefs(p)[0]!;
    p.galleryGroups = [{ name: "거실", items: Array.from({ length: n }, () => ({ image: { ...one } })) }];
  };
  for (const [n, len] of [[1, 1], [12, 12], [13, 12], [30, 12]] as const) {
    const c = craft(withAfter(n));
    eq([c.record.media!.gallery!.length, c.record.media!.totalCount, c.result.errors], [len, n, []], `${n} after images → gallery ${len}, totalCount ${n}`);
  }
  const coverOnly = craft((p) => void delete p.galleryGroups);
  eq([Object.keys(coverOnly.record.media!), coverOnly.result.errors], [["cover"], []], "no galleryGroups → { cover } only");
  // before: not exported, not counted — adding one to every bi-01 item changes nothing
  const withBefore = craft((p) => p.galleryGroups!.forEach((g) => g.items.forEach((i) => void (i.before = { asset: "bi04-kitchen-01-before", alt: "공사 전" }))));
  eq(withBefore.record.media, demoEmission.portfolio!.document.records.find((r) => r.id === "bi-01")!.media, "before images change nothing in media");
  eq(withBefore.emission.portfolio!.version, demoEmission.portfolio!.version, "…nor the version");
  // fail closed on an asset the snapshot does not carry
  const missing = clone(demo.snapshot);
  missing.assets = missing.assets.filter((a) => a.id !== "bi01-kitchen-03");
  await rejects(() => emitFor(missing), /record "bi-01" gallery\[5\]: asset "bi01-kitchen-03" is not in the site snapshot/);
  // media is presentation only: stripping it from every record leaves exactly the documents a
  // gallery-less / cover-swapped corpus produces with ITS media stripped — nothing else read it
  const strip = (d: PortfolioDocument) => ({ ...d, version: "", records: d.records.map(({ media: _m, ...r }) => r) });
  const other = clone(demo.snapshot);
  for (const p of other.content.projects) {
    delete p.galleryGroups;
    p.cover = { asset: "bi01-hallway-01" };
  }
  eq(strip(emitFor(other).portfolio!.document), strip(demoEmission.portfolio!.document), "every non-media byte is independent of the media sources (08: media feeds no facet, no order, nothing else)");
});

console.log("\n[validator] fail closed");
await check("V1 the demo emission validates: 0 errors, 0 warnings; the fixtures' emissions too", async () => {
  eq(validateFor(demoEmission, demo.snapshot), { errors: [], warnings: [] }, "demo");
  for (const s of FIXTURES) {
    const inp = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: AT });
    const e = emitFor(inp.snapshot);
    eq(validateFor(e, inp.snapshot).errors, [], s);
    eq(e.portfolio!.recordCount, inp.snapshot.content.projects.length, `${s} records`);
  }
});
const errFrom = (from: IntegrationEmission, f: (x: IntegrationEmission) => void, re: RegExp, opts?: { keepVersion?: boolean }) => {
  const r = validateFor(remake(from, f, opts), demo.snapshot);
  assert(r.errors.some((m) => re.test(m)), `expected an error matching ${re}, got:\n${r.errors.join("\n") || "(none)"}`);
};
const err = (f: (x: IntegrationEmission) => void, re: RegExp, opts?: { keepVersion?: boolean }) => errFrom(demoEmission, f, re, opts);
/**
 * The demo emission with every record's V0.2 breadth fields stripped AT THE SOURCE — the corpus
 * shape WS2's two absence rules and INV-28/INV-29's "declared a breadth, named no scopes" refusals
 * describe. Since the re-authoring all 19 demo records carry `workScopeIds` (26 §1.2), so those
 * four cases can no longer be staged on `demoEmission` by mutating one record; they are staged on
 * this one instead, which keeps each case isolated to the single violation it is about.
 */
const plainEmission = (() => {
  const s = clone(demo.snapshot);
  for (const p of s.content.projects) {
    delete p.projectType;
    delete p.workScopeIds;
  }
  const e = emitFor(s);
  assert(e.portfolio!.document.workScopes === undefined, "the stripped corpus declares no work scopes");
  assert(validateFor(e, s).errors.length === 0, "…and is itself valid, so every error below is the crafted one");
  return e;
})();
await check("V1b INV-4 by name: fixture-large's document holds exactly the ids published at `at`; its draft and scheduled records are absent", async () => {
  const raw = (await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as { id: string; status: string; publishedAt: string }[];
  const publicIds = raw.filter((p) => p.status === "published" && Date.parse(p.publishedAt) <= Date.parse(AT)).map((p) => p.id).sort(compareCodePoints);
  const excluded = raw.filter((p) => !publicIds.includes(p.id)).map((p) => p.id);
  assert(excluded.length >= 2 && raw.some((p) => p.status !== "published") && raw.some((p) => p.status === "published" && Date.parse(p.publishedAt) > Date.parse(AT)), `fixture must hold a draft and a scheduled record: ${excluded.join(",")}`);
  const inp = await prepareSiteInput({ repoRoot, siteId: "fixture-large", mode: "public", at: AT });
  const ids = emitFor(inp.snapshot).portfolio!.document.records.map((r) => r.id);
  eq(ids, publicIds, "record ids = published ∧ publishedAt ≤ at");
  for (const id of excluded) assert(!ids.includes(id), `${id} must be absent`);
});
await check("V2 duplicate record id · records out of code point order → rejected (ID3, §6.1)", () => {
  err((x) => x.portfolio!.document.records.push(clone(x.portfolio!.document.records[0]!)), /duplicate record id/);
  err((x) => x.portfolio!.document.records.reverse(), /not in id code point order/);
});
await check("V3 URLs: absolute, protocol-relative, query, fragment, backslash, no leading slash, unplanned page → rejected (UR2, INV-5)", () => {
  for (const u of ["https://interior-demo.boostweb.co.kr/portfolio/x", "//evil.example/x", "/portfolio/x?utm=1", "/portfolio/x#top", "/portfolio\\x", "portfolio/x", "/portfolio/../x", "/portfolio//x", "/portfolio/x y"]) {
    err((x) => void (x.portfolio!.document.records[0]!.detailUrl = u), /UR2|INV-5/);
  }
  eq(["/", "/portfolio", "/portfolio/a-b", `/_integration/portfolio.${DEMO_VERSION}.json`].map(isRootRelativePath), [true, true, true, true], "valid shapes");
  eq(["https://a/b", "//a", "/a?b", "/a#b", "/a\\b", "a/b", "/a/../b", "/a//b", "", "/a\u0000"].map(isRootRelativePath), Array(10).fill(false), "invalid shapes");
  err((x) => void (x.portfolio!.document.records[0]!.detailUrl = "/portfolio/not-a-page"), /has no page in this build \(INV-5\)/);
  err((x) => void (x.portfolio!.document.listingUrl = "/no-such-list"), /listingUrl .* has no page/);
});
await check("V4 HT7 forbidden characters in a title / label / location / key → rejected; the manifest too", () => {
  err((x) => void (x.portfolio!.document.records[0]!.title = "수성 화이트"), /forbidden character \(HT7\)/);
  err((x) => void (x.portfolio!.document.records[0]!.location = "대구\u0007"), /forbidden character/);
  err((x) => void (x.portfolio!.document.facets!.tag!.values[0]!.label = "‮화이트"), /forbidden character/);
  err((x) => void (x.manifest.site.locale = "ko-KR "), /forbidden character|BCP 47/);
});
await check("V5 null · empty string · empty object · empty facet array · empty workScopeIds · placeholder \"unknown\" basis → rejected (MD1–MD3, WS5, AR2, INV-18)", () => {
  err((x) => void ((x.portfolio!.document.records[0] as any).location = null), /null is never emitted/);
  err((x) => void (x.portfolio!.document.records[0]!.location = ""), /empty string/);
  err((x) => void ((x.portfolio!.document.records[0] as any).property = {}), /empty object/);
  err((x) => void (x.portfolio!.document.records[0]!.facets!.tag = []), /empty array/);
  err((x) => void ((x.portfolio!.document.records[0] as any).workScopeIds = []), /empty array/);
  err((x) => void ((x.portfolio!.document as any).workScopes = []), /empty array/);
  err((x) => void (x.portfolio!.document.records[0]!.property!.area!.basis = "unknown"), /basis/);
  err((x) => void ((x.portfolio!.document.records[0] as any).pricing = { perArea: { amount: 0, currency: "KRW", perUnit: "pyeong", source: "authored" } }), /amount/);
  err((x) => void ((x.portfolio!.document.records[0] as any).pricing = {}), /empty object/);
});
await check("V6 site identity and origin: id ≠ siteId, origin ≠ site origin, http, origin with path, bad locale → rejected (§5, §13)", () => {
  err((x) => void (x.manifest.site.id = "other-site"), /≠ siteId/);
  err((x) => void (x.manifest.site.publicOrigin = "https://other.example"), /≠ the site's publicOrigin/);
  err((x) => void (x.manifest.site.publicOrigin = "http://interior-demo.boostweb.co.kr"), /must be an https origin/);
  err((x) => void (x.manifest.site.publicOrigin = "https://interior-demo.boostweb.co.kr/x"), /origin only/);
  err((x) => void (x.manifest.site.locale = "not a locale"), /BCP 47/);
});
await check("V7 version echo, href pointer, file name, content hash → rejected when they disagree (RV1, RV3, RV5, INV-3)", () => {
  err((x) => void (x.manifest.resources.portfolio!.version = "0".repeat(32)), /manifest version .* ≠ document version/, { keepVersion: true });
  err((x) => void (x.manifest.resources.portfolio!.href = "/_integration/portfolio.json"), /href .* ≠/, { keepVersion: true });
  err((x) => void (x.portfolio!.document.version = "0".repeat(32)), /not the hash of its content \(RV1\)/, { keepVersion: true });
  err((x) => void (x.portfolio!.file.path = "_integration/other.json"), /is not the manifest pointer/, { keepVersion: true });
  err((x) => void delete x.manifest.resources.portfolio, /has no "portfolio" entry/, { keepVersion: true });
  err((x) => void (x.portfolio!.document.records[0]!.title += "!"), /RV1/, { keepVersion: true });
});
await check("V8 facet closure both ways and ordering (VO1, INV-8): undeclared value, unused declared value, unsorted values, repeated value in a record → rejected", () => {
  err((x) => void x.portfolio!.document.records[0]!.facets!.tag!.push("옥상"), /is not declared \(VO1\)/);
  err((x) => void x.portfolio!.document.facets!.tag!.values.push({ id: "힣", label: "힣" }), /declared but no record uses it/);
  err((x) => void x.portfolio!.document.facets!.tag!.values.reverse(), /not in id code point order/);
  err((x) => void x.portfolio!.document.records[0]!.facets!.tag!.push(x.portfolio!.document.records[0]!.facets!.tag![0]!), /repeats a value \(INV-14\)/);
});
await check("V9 shapes: 3 decimals, negative, bad unit, lowercase currency, an extra key (totalCost), an unknown top-level key, a bad facet key, the WRONG schemaVersion → rejected (§7, §9, 07 §10)", () => {
  err((x) => void (x.portfolio!.document.records[0]!.property!.area!.value = 34.123), /fraction digits/);
  err((x) => void (x.portfolio!.document.records[0]!.property!.area!.value = -1), /area/);
  err((x) => void (x.portfolio!.document.records[0]!.property!.area!.unit = "py"), /unit/);
  err((x) => void (x.portfolio!.document.records[0]!.pricing!.perArea!.currency = "krw"), /currency/);
  err((x) => void ((x.portfolio!.document.records[0] as any).totalCost = 98600000), /totalCost|Unrecognized/);
  err((x) => void ((x.portfolio!.document.records[0] as any).area = { value: 34, unit: "pyeong" }), /area|Unrecognized/);
  err((x) => void ((x.portfolio!.document.records[0] as any).pricePerArea = { amount: 1, currency: "KRW", perUnit: "pyeong" }), /pricePerArea|Unrecognized/);
  err((x) => void ((x.portfolio!.document as any).generatedAt = "2026-09-22"), /generatedAt|Unrecognized/);
  err((x) => void ((x.manifest as any).recordCount = 8), /recordCount|Unrecognized/);
  err((x) => void (x.portfolio!.document.facets!["Bad Key"] = x.portfolio!.document.facets!.tag!), /Bad Key|facets/);
  err((x) => void (x.portfolio!.document.records[0]!.title = "x".repeat(121)), /title/);
  // 07 §3 / 08 / INV-27: the DOCUMENT is "1.1" and the MANIFEST is "0.1"; neither may carry the
  // other's, and this producer emits exactly "1.1" (a "1.0" label on a 1.1 emission is refused — the
  // 1.0 compatibility case is M3: a 1.0-SHAPED record is valid under "1.1").
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "0.1"), /schemaVersion/);
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "0.2"), /schemaVersion/);
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "1.0"), /schemaVersion/);
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "1.2"), /schemaVersion/);
  err((x) => void ((x.manifest as any).schemaVersion = "1.1"), /schemaVersion/);
});
await check("V14 the V0.2 annex, fail closed: an unknown work-scope id, a broken WS2 closure either way, a partial_remodel with no scopes, a trades-only partial (INV-30) or full (INV-29), a style/tag overlap, a range with minAmount ≥ maxAmount, a perArea with no source → rejected (INV-17, INV-23, INV-24, INV-28, INV-29, INV-30)", () => {
  // staged on `plainEmission` (above): with all 19 demo records carrying their authored scopes,
  // overwriting `document.workScopes` with a two-id set would trip WS2 closure on the other 18 as
  // well, and each case below is about exactly one violation.
  const withScopes = (x: IntegrationEmission) => {
    x.portfolio!.document.workScopes = ["bathroom", "kitchen"];
    x.portfolio!.document.records[0]!.workScopeIds = ["kitchen", "bathroom"];
  };
  errFrom(plainEmission, (x) => {
    withScopes(x);
    (x.portfolio!.document.records[0]!.workScopeIds as string[])[0] = "sauna";
  }, /not in the contract vocabulary|Invalid option/);
  errFrom(plainEmission, (x) => {
    withScopes(x);
    x.portfolio!.document.workScopes = ["bathroom"];
  }, /is not declared in document.workScopes \(WS2, INV-17\)/);
  errFrom(plainEmission, (x) => {
    withScopes(x);
    x.portfolio!.document.workScopes = ["balcony", "bathroom", "kitchen"];
  }, /declared but no record uses it \(WS2, INV-17\)/);
  errFrom(plainEmission, (x) => {
    withScopes(x);
    x.portfolio!.document.workScopes = ["kitchen", "bathroom"];
  }, /not in code point order/);
  errFrom(plainEmission, (x) => void (x.portfolio!.document.records[0]!.workScopeIds = ["kitchen", "bathroom"]), /workScopes is absent although records carry work scopes/);
  errFrom(plainEmission, (x) => void (x.portfolio!.document.workScopes = ["kitchen"]), /present although no record carries a work scope/);
  errFrom(plainEmission, (x) => {
    withScopes(x);
    x.portfolio!.document.records[0]!.workScopeIds = ["kitchen", "kitchen", "bathroom"];
  }, /repeats a value/);
  errFrom(plainEmission, (x) => void (x.portfolio!.document.records[0]!.projectType = "partial_remodel"), /INV-28/);
  errFrom(plainEmission, (x) => void (x.portfolio!.document.records[0]!.projectType = "full_remodel"), /INV-29/);
  errFrom(plainEmission, (x) => {
    x.portfolio!.document.workScopes = ["flooring", "lighting", "wallpaper"];
    x.portfolio!.document.records[0]!.projectType = "full_remodel";
    x.portfolio!.document.records[0]!.workScopeIds = ["flooring", "wallpaper", "lighting"];
  }, /requires at least one SPACE work scope .* \(INV-29\)/);
  // INV-30 — the mirror of INV-29 on the EMITTED document. INV-28 only asks for non-emptiness, so
  // before INV-30 this exact shape passed: a partial whose scopes are trades only, leaving
  // `workScopeIds ∩ Spaces` empty and `pricing.total` covering no bounded set of spaces.
  errFrom(plainEmission, (x) => {
    x.portfolio!.document.workScopes = ["flooring", "wallpaper"];
    x.portfolio!.document.records[0]!.projectType = "partial_remodel";
    x.portfolio!.document.records[0]!.workScopeIds = ["flooring", "wallpaper"];
  }, /requires at least one SPACE work scope .* \(PT5, INV-30\)/);
  err((x) => {
    x.portfolio!.document.records[0]!.facets!.style = [x.portfolio!.document.records[0]!.facets!.tag![0]!];
    x.portfolio!.document.facets!.style = { values: [{ id: x.portfolio!.document.records[0]!.facets!.tag![0]!, label: "x" }] };
  }, /appear in both facets.style and facets.tag \(ST4, INV-24\)/);
  err((x) => void (x.portfolio!.document.records[0]!.pricing!.total = { kind: "range", minAmount: 5, maxAmount: 5, currency: "KRW" }), /minAmount < maxAmount|TP1/);
  err((x) => void (x.portfolio!.document.records[0]!.pricing!.total = { kind: "range", minAmount: 9, maxAmount: 5, currency: "KRW" }), /minAmount < maxAmount|TP1/);
  err((x) => void ((x.portfolio!.document.records[0]!.pricing!.total as any) = { amount: 5, currency: "KRW" }), /kind|Invalid/);
  err((x) => void delete (x.portfolio!.document.records[0]!.pricing!.perArea as any).source, /source/);
  err((x) => void ((x.portfolio!.document.records[0]!.pricing!.perArea as any).source = "guessed"), /source/);
});
await check("V15 the D-1 rules are enforced on the document, not only on the code path: a derived perArea without full_remodel, without an exact total, or with the wrong arithmetic → rejected; so is a due derivation that is missing (INV-19, INV-20 both ways)", () => {
  // bi-01 is now authored `full_remodel` (26 §1.2), so the "derived WITHOUT full_remodel" case has
  // to drop the breadth first — otherwise the record falls into the next case's branch and a
  // different (also correct) D-1 error fires. The rule and the regex are unchanged.
  err((x) => {
    const r = x.portfolio!.document.records[0]!;
    delete r.projectType;
    r.pricing!.perArea!.source = "derived";
  }, /INV-19|D-1a/);
  err((x) => {
    const r = x.portfolio!.document.records[0]!;
    r.projectType = "full_remodel";
    r.pricing!.perArea!.source = "derived";
  }, /D-1's conditions do not hold/);
  err((x) => {
    const r = x.portfolio!.document.records[0]!;
    r.projectType = "full_remodel";
    r.property!.area = { value: 34, unit: "pyeong", basis: "supply" };
    r.pricing = { total: { kind: "exact", amount: 52_000_000, currency: "KRW" }, perArea: { amount: 1_529_411, currency: "KRW", perUnit: "pyeong", source: "derived" } };
  }, /≠ RD1's result .* \(INV-20, RD1\)/);
  err((x) => {
    const r = x.portfolio!.document.records[0]!;
    r.projectType = "full_remodel";
    r.property!.area = { value: 34, unit: "pyeong", basis: "supply" };
    r.pricing = { total: { kind: "exact", amount: 52_000_000, currency: "KRW" }, perArea: { amount: 1_529_412, currency: "KRW", perUnit: "m2", source: "derived" } };
  }, /≠ RD1's result/);
  // INV-20 the other way: bi-09 is full_remodel · exact 50,000,000 · 34평 · no authored perArea, so
  // D-1 is DUE; a document that drops it is refused (a guard failure is still legal — A3)
  err((x) => void delete x.portfolio!.document.records.find((r) => r.id === "bi-09")!.pricing!.perArea, /D-1's conditions hold but no derived pricing\.perArea was emitted .* \(INV-20\)/);
  // the correct derivation validates (it must, or the emitter could never emit one)
  const good = remake(demoEmission, (x) => {
    const r = x.portfolio!.document.records[0]!;
    r.projectType = "full_remodel";
    // INV-29. `document.workScopes` is NOT narrowed to these two: the other 18 records carry their
    // own authored scopes (26 §1.2) and WS2 closes over all of them, and every id bi-01 gives up
    // here is still used by another record — so the declaration stays correct untouched.
    r.workScopeIds = ["living_room", "kitchen"];
    r.property!.area = { value: 34, unit: "pyeong", basis: "supply" };
    r.pricing = { total: { kind: "exact", amount: 52_000_000, currency: "KRW" }, perArea: { amount: 1_529_412, currency: "KRW", perUnit: "pyeong", source: "derived" } };
  });
  eq(validateFor(good, demo.snapshot).errors, [], "the RD1 value validates");
});
await check("V10 zero records with a listingUrl or facets → rejected (§7.2, VO1)", () => {
  err((x) => void (x.portfolio!.document.records = []), /listingUrl present with zero records|facets present with zero records/);
});
await check("V11 consumer-declared limits are warnings, never errors and never truncation (VO6, CH-R10) — now measured on `tag`, since the `scope` facet and its limit are retired", () => {
  const s = clone(demo.snapshot);
  const base = s.content.projects[0]!;
  // 16 records × 12 keywords = 192 distinct tag values, above the consumer-declared 150.
  while (s.content.projects.length < 16) {
    const n = s.content.projects.length;
    s.content.projects.push({ ...clone(base), id: `bi-x${n}`, slug: `bi-x${n}` });
  }
  s.content.projects.forEach((p, i) => void (p.keywords = Array.from({ length: 12 }, (_, k) => `키워드${i}-${k}`)));
  const e = emitFor(s);
  const r = validateFor(e, s);
  eq(r.errors, [], "no error");
  assert(r.warnings.some((w) => /facet "tag" has \d+ values, above the consumer-declared limit 150/.test(w)), `warning expected: ${r.warnings.join(" | ")}`);
  assert(e.portfolio!.facetCounts.tag! > 150, "not truncated");
});
await check("V13 freeze-review rules: resources {} with a document, a pointer without a document, an explicit port, a non-ASCII or badly percent-encoded path, category ≠ 1 → rejected (C-05, C-07, C-08, MAJOR-2)", () => {
  err((x) => void (x.manifest.resources = {}), /has no "portfolio" entry/, { keepVersion: true });
  const noDoc = remake(demoEmission, (x) => void (x.portfolio = undefined), { keepVersion: true });
  assert(validateFor(noDoc, demo.snapshot).errors.some((m) => /has a "portfolio" entry but no portfolio document/.test(m)), "pointer without document");
  err((x) => void (x.manifest.site.publicOrigin = "https://interior-demo.boostweb.co.kr:8443"), /explicit port is outside V0/);
  eq(["/portfolio/수성", "/portfolio/x%2", "/portfolio/x%zz", "/portfolio/x y"].map(isRootRelativePath), [false, false, false, false], "non-ASCII / bad percent");
  eq(["/portfolio/x%20y", "/portfolio/a_b.c~d", "/p/(x)!$&'*+,;=:@"].map(isRootRelativePath), [true, true, true], "RFC 3986 pchar allowed");
  err((x) => void (x.portfolio!.document.records[0]!.facets!.category = ["full-remodel", "partial-remodel"]), /facets.category must have exactly one value/);
  err((x) => void delete x.portfolio!.document.records[0]!.facets!.category, /facets.category must have exactly one value/);
});
await check("V12 assertIntegration throws with every error listed; validateIntegration is pure (same input → same result)", async () => {
  const bad = remake(demoEmission, (x) => {
    x.portfolio!.document.records[0]!.title = "";
    x.manifest.site.id = "x";
  });
  await rejects(() => assertIntegration(bad, { siteId: DEMO, publicOrigin: demo.snapshot.site.identity.publicOrigin, pagePaths: new Set() }), /integration documents invalid:[\s\S]*≠ siteId[\s\S]*empty string/);
  eq(validateFor(demoEmission, demo.snapshot), validateFor(demoEmission, demo.snapshot), "pure");
});
await check("N1 known-bad mutations of the real V0.2 document, one violation each, each refused with ITS error: duplicate id, invalid projectType, invalid area basis, unknown work scope, malformed range, range min > max, a derived perArea with no area to derive from, a malformed detailUrl, a bad manifest pointer, a V0.1 document inside the V0.2 package", () => {
  const bi09 = (x: IntegrationEmission) => x.portfolio!.document.records.find((r) => r.id === "bi-09")!; // full · exact 50,000,000 · 34평 · derived perArea
  err((x) => x.portfolio!.document.records.splice(1, 0, clone(x.portfolio!.document.records[0]!)), /duplicate record id \(ID3\)/);
  err((x) => void ((x.portfolio!.document.records[0] as any).projectType = "whole_remodel"), /projectType: Invalid option/);
  err((x) => void ((x.portfolio!.document.records[0]!.property!.area as any).basis = "gross"), /property\.area\.basis: Invalid option/);
  err((x) => void ((x.portfolio!.document.records[0]!.workScopeIds as string[])[0] = "sauna"), /workScopeIds.*(Invalid option|not in the contract vocabulary)/);
  err((x) => void ((bi09(x).pricing as any).total = { kind: "range", minAmount: 45_000_000, currency: "KRW" }), /pricing\.total\.maxAmount/);
  err((x) => void (bi09(x).pricing!.total = { kind: "range", minAmount: 60_000_000, maxAmount: 45_000_000, currency: "KRW" }), /minAmount < maxAmount \(TP1, INV-23\)/);
  err((x) => void delete bi09(x).property!.area, /derived but D-1's conditions do not hold/);
  err((x) => void (x.portfolio!.document.records[0]!.detailUrl = "portfolio/suseong-white-34py-apartment-remodeling"), /detailUrl.*(UR2|root-relative)|UR2/);
  err((x) => void (x.manifest.resources.portfolio!.href = "/_integration/portfolio.00000000000000000000000000000000.json"), /href .* ≠/, { keepVersion: true });
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "0.1"), /schemaVersion/);
});

console.log("\n[media validator] 08 §2 rules, fail closed");
/** a demo emission with one record's media replaced (bi-01 has a gallery, bi-09 is cover only) */
const withMedia = (id: string, media: unknown) => (x: IntegrationEmission) => void ((x.portfolio!.document.records.find((r) => r.id === id) as any).media = media);
const IMG = { src: "/assets/03c625140dc4df674fb8.jpg", alt: "거실", width: 1600, height: 1200 };
const imgs = (n: number) => Array.from({ length: n }, () => ({ ...IMG }));
await check("M1 media is OPTIONAL: every record with media removed (a 1.0-shaped record under schemaVersion 1.1) validates with 0 errors; cover only / gallery without cover / images without alt or size are valid too", () => {
  const bare = remake(demoEmission, (x) => x.portfolio!.document.records.forEach((r) => void delete r.media));
  eq(validateFor(bare, demo.snapshot), { errors: [], warnings: [] }, "no record carries media → valid (08: additive)");
  for (const [what, media] of [
    ["cover only", { cover: IMG }],
    ["gallery only (no cover)", { gallery: imgs(3), totalCount: 3 }],
    ["cover + full gallery", { cover: IMG, gallery: imgs(12), totalCount: 12 }],
    ["12 of 13 (hasMore derived)", { cover: IMG, gallery: imgs(12), totalCount: 13 }],
    ["12 of 500", { gallery: imgs(12), totalCount: 500 }],
    ["no alt, no size", { cover: { src: "/assets/03c625140dc4df674fb8.jpg" } }],
    ["percent-encoded / tilde path", { cover: { src: "/media/%EA%B1%B0%EC%8B%A4~1.webp", width: 1, height: 1 } }],
  ] as const) {
    eq(validateFor(remake(demoEmission, withMedia("bi-09", media)), demo.snapshot).errors, [], `${what} is valid`);
    assert(PortfolioMediaSchema.safeParse(media).success, `${what}: schema`);
  }
});
await check("M2 1.0 compatibility: the FROZEN V0.2 golden document is refused as an emission of this producer ONLY for its schemaVersion \"1.0\"; relabelled \"1.1\" (nothing else touched) it validates with 0 errors — every 1.0 record is a valid 1.1 record", async () => {
  const v02 = await readJson(path.join(repoRoot, GOLDEN_V02_DIR, `portfolio.${V02_VERSION}.json`));
  eq([v02.schemaVersion, v02.records.length, v02.records.some((r: { media?: unknown }) => r.media !== undefined)], ["1.0", 19, false], "the frozen 1.0 document: 19 records, no media");
  const as10 = validateFor(remake(demoEmission, (x) => void (x.portfolio!.document = clone(v02))), demo.snapshot);
  assert(as10.errors.length > 0 && as10.errors.every((m) => /schemaVersion/.test(m)), `only the schemaVersion is refused:\n${as10.errors.join("\n")}`);
  const as11 = validateFor(remake(demoEmission, (x) => void (x.portfolio!.document = { ...clone(v02), schemaVersion: "1.1" })), demo.snapshot);
  eq(as11, { errors: [], warnings: [] }, "relabelled 1.1 → valid");
});
await check("M3 invalid src refused — an absolute URL, //host, a `..` segment (also percent-encoded: %2e%2e, .%2E), an encoded slash / backslash / NUL, an empty or `.` segment, a malformed escape, javascript:, data:, a query, a fragment, a backslash, no leading slash, \"/\" alone, a space, non-ASCII, > 512 characters (08 §2, MD-1a)", () => {
  for (const src of [
    "https://interior-demo.boostweb.co.kr/assets/03c625140dc4df674fb8.jpg",
    "http://evil.example/x.jpg",
    "//evil.example/x.jpg",
    "/assets/../x.jpg",
    "/..",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "/assets/x.jpg?v=1",
    "/assets/x.jpg#top",
    "/assets\\x.jpg",
    "assets/x.jpg",
    "/",
    "/assets/x y.jpg",
    "/assets/거실.jpg",
    `/${"a".repeat(512)}`,
    // MD-1a — a URL parser resolves %2e as ".": each of these would escape or alias the path
    "/assets/%2e%2e/_integration/manifest.json",
    "/assets/%2E%2E/x.jpg",
    "/assets/.%2E/x.jpg",
    "/assets/%2e/x.jpg",
    "/assets%2f..%2fx.jpg",
    "/assets/%5c../x.jpg",
    "/assets/x.jpg%00.png",
    "/assets//x.jpg",
    "/assets/./x.jpg",
    "/.",
    "/assets/x%zz.jpg",
    "/assets/x.jpg%",
  ]) {
    err(withMedia("bi-09", { cover: { ...IMG, src } }), /media\.cover\.src: media src must (be a same-origin absolute path|not contain a `\.\.` segment|be a UR2 path)/);
    err(withMedia("bi-01", { gallery: [{ ...IMG, src }], totalCount: 1 }), /media\.gallery\.0\.src/);
  }
  assert(MediaImageSchema.safeParse({ src: `/${"a".repeat(511)}` }).success, "512 characters is the maximum");
});
await check("M4 invalid image / media shapes refused: width without height (and the reverse), non-positive or fractional size, alt \"\" / > 160 / forbidden character, an unknown key, 13 gallery items, an empty gallery, a boolean hasMore, media {} or null, totalCount without gallery / gallery without totalCount / totalCount < gallery.length / gallery.length ≠ min(totalCount, 12) / totalCount 0 or fractional (08 §2)", () => {
  const cover = (patch: Record<string, unknown>, re: RegExp) => err(withMedia("bi-09", { cover: { ...IMG, ...patch } }), re);
  cover({ height: undefined }, /both present or both absent/);
  cover({ width: undefined }, /both present or both absent/);
  err(withMedia("bi-09", { cover: { src: IMG.src, width: 1600 } }), /both present or both absent/);
  for (const w of [0, -1, 1.5]) cover({ width: w }, /media\.cover\.width/);
  cover({ width: "1600" }, /media\.cover\.width/);
  cover({ alt: "" }, /media\.cover\.alt|empty string/);
  cover({ alt: "   " }, /media\.cover\.alt: media alt must not be blank/);
  cover({ alt: "가".repeat(MEDIA_ALT_MAX + 1) }, /media\.cover\.alt/);
  cover({ alt: "거실\u202e" }, /media\.cover\.alt: contains a forbidden character \(HT7\)/);
  cover({ url: "https://x.example/a.jpg" }, /media\.cover.*(Unrecognized|url)/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(13), totalCount: 13 }), /media\.gallery: .*(12|Too big)/);
  err(withMedia("bi-01", { cover: IMG, gallery: [], totalCount: 1 }), /media\.gallery/);
  err(withMedia("bi-01", { cover: IMG, gallery: [], totalCount: 1 }), /media\.gallery: empty array/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(12), totalCount: 13, hasMore: true }), /media.*(Unrecognized|hasMore)/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(12), totalCount: 13, hasMore: true }), /media\.hasMore: booleans are not part of the V0 schema/);
  err(withMedia("bi-09", {}), /media: empty object|never \{\}/);
  err(withMedia("bi-09", null), /media: null is never emitted|media/);
  err(withMedia("bi-09", { cover: IMG, totalCount: 1 }), /totalCount is present exactly when gallery is/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(4) }), /totalCount is present exactly when gallery is/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(4), totalCount: 3 }), /totalCount must be ≥ gallery\.length/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(4), totalCount: 5 }), /gallery\.length must equal min\(totalCount, 12\)/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(11), totalCount: 13 }), /gallery\.length must equal min\(totalCount, 12\)/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(1), totalCount: 0 }), /media\.totalCount/);
  err(withMedia("bi-01", { cover: IMG, gallery: imgs(1), totalCount: 1.5 }), /media\.totalCount/);
  err(withMedia("bi-09", { hero: IMG }), /media.*(Unrecognized|hero)/);
});

console.log("\n[builder] opt-in and build identity");
await check("B1 default OFF: the fixtures have no integration.json → emit false, no integrationInputHash, buildInputId unchanged (= their current package)", async () => {
  for (const s of FIXTURES) {
    eq(await loadIntegrationConfig(repoRoot, s), undefined, `${s} config`);
    const inp = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: AT });
    eq([inp.integration.emit, inp.parts.integrationInputHash], [false, undefined], `${s} parts`);
    eq(inp.buildInputId, (await readJson(path.join(repoRoot, "data/site-builds", s, "current.json"))).buildInputId, `${s} identity`);
    assert(!(await exists(path.join(await packageOf(repoRoot, s), "site", INTEGRATION_DIR))), `${s} package must have no ${INTEGRATION_DIR}/`);
  }
});
await check("B2 the demo is ON: emit true, integrationInputHash = hash(producer, contract, config) with the V0.2 contract pair, and the V0.2 producer's identity ≠ the V0 one ≠ the live package", async () => {
  const cfg = await loadIntegrationConfig(repoRoot, DEMO);
  eq(cfg, { schemaVersion: 1, firstPartyData: { enabled: true } }, "config");
  eq(demo.integration.emit, true, "emit");
  const src = await producerSources();
  eq(src.files.map((f) => f.path), [...PRODUCER_SOURCE_FILES], "producer source files");
  for (const f of src.files) eq(f.sha256, sha256(await readFile(path.join(repoRoot, "platform", f.path))), `${f.path} hashed from the platform tree`);
  eq(demo.integration.producerSourceHash, src.hash, "producer source hash");
  const contract = { core: CORE_SCHEMA_VERSION, portfolio: PORTFOLIO_SCHEMA_VERSION };
  eq(demo.parts.integrationInputHash, hashJson({ producer: PRODUCER_VERSION, producerSourceHash: src.hash, contract, config: cfg }), "input hash");
  assert(hashJson({ producer: PRODUCER_VERSION, producerSourceHash: "0".repeat(64), contract, config: cfg }) !== demo.parts.integrationInputHash, "a changed producer source → a different build identity (MAJOR-1)");
  // 07 §3: the document's schemaVersion is part of the build identity, so a V0.2 package can never
  // be reported "up-to-date" for the V0 one.
  assert(hashJson({ producer: PRODUCER_VERSION, producerSourceHash: src.hash, contract: { core: "0.1", portfolio: "0.1" }, config: cfg }) !== demo.parts.integrationInputHash, "the contract pair moved");
  assert(demo.buildInputId !== V01_BUILD_INPUT_ID, "the V0.2 producer has its own build identity, not the V0.1 package's");
  assert(demo.buildInputId !== LIVE_BUILD_INPUT_ID, "≠ live");
  // The live package was built from the 1.5.2 pin and the demo is now pinned to 1.6.0, so its
  // pre-integration identity is no longer the live one. This check has always been about isolating
  // the PIN as a build input carried INSIDE the snapshot. Until the demo was re-authored there was
  // exactly one delta from the live package, so rolling site.template back reproduced the live
  // package's recorded snapshot hash exactly. There are now TWO deliberate deltas — the pin and
  // data/sites/boost-interior-demo/content/projects.json (26: 8 → 19 records with the V0.2 fields;
  // 28: `styles` on the original eight, and bi-06's unevidenced propertyType removed) — and
  // site.json's only diff is the pin itself. 28 §4 proves the residue is nil: restore projects.json
  // to its pre-V0.2 bytes, roll the pin back, and the snapshot hashes to LIVE_PARTS.siteSnapshotHash
  // again, so the content is the whole of the remaining delta. What is asserted here is therefore
  // the pin's isolation on TODAY's data, against a frozen literal, plus the fact that the content
  // delta exists — a silent revert of the re-authoring would fail this check, not pass it.
  eq(computeBuildInputId(LIVE_PARTS), LIVE_BUILD_INPUT_ID, "the live package's recorded parts reproduce its identity");
  const atLivePin = hashJson({ ...demo.snapshot, site: { ...demo.snapshot.site, template: LIVE_PIN } });
  eq(atLivePin, DEMO_SNAPSHOT_HASH_AT_LIVE_PIN, "pin rolled back to 1.5.2 → the re-authored demo's snapshot hash");
  const { headScripts, ...withoutScripts } = demo.snapshot;
  assert(headScripts !== undefined && headScripts.headScripts.length > 0, "the demo declares its head scripts (scripts.json)");
  const { "site.floating-cta": seat, ...preWidgetOverrides } = withoutScripts.settings.overrides as Record<string, unknown>;
  eq(seat, { enabled: false }, "the chat launcher's seat: the demo's own floating CTA is off");
  const preWidget = { ...withoutScripts, settings: { ...withoutScripts.settings, overrides: preWidgetOverrides } };
  eq(hashJson({ ...preWidget, site: { ...preWidget.site, template: LIVE_PIN } }), DEMO_SNAPSHOT_HASH_AT_LIVE_PIN_PRE_WIDGET, "…without headScripts and the seat override it is the pre-widget anchor: those two are the whole of the widget delta");
  const slots = demo.snapshot.slots as { values: Record<string, Record<string, unknown>> };
  const detail160: Record<string, unknown> = { ...slots.values["portfolio.detail"] };
  for (const [k, [before, now]] of Object.entries(DEMO_161_DETAIL_LABELS)) {
    eq(detail160[k], now, `1.6.1 site copy ${k}`);
    if (before === undefined) delete detail160[k];
    else detail160[k] = before;
  }
  const slots160 = { ...slots, values: { ...slots.values, "portfolio.detail": detail160 } };
  eq(hashJson({ ...preWidget, slots: slots160, site: { ...preWidget.site, template: LIVE_PIN } }), DEMO_SNAPSHOT_HASH_AT_LIVE_PIN_PRE_161, "…with the 1.6.1 site copy reverted it is the pre-1.6.1 anchor: those labels are the whole of the slots delta (38-)");
  assert(atLivePin !== demo.parts.siteSnapshotHash, "the pin lives inside the snapshot, so rolling it back moves the hash");
  eq(hashJson({ ...demo.snapshot, site: { ...demo.snapshot.site, template: demoPin } }), demo.parts.siteSnapshotHash, "…and putting it back reproduces the current hash exactly: the pin is ALL the substitution touches");
  assert(atLivePin !== LIVE_PARTS.siteSnapshotHash, "it no longer lands on the live package's own hash — the demo CONTENT is the second, deliberate delta (26, 28)");
  eq(computeBuildInputId({ ...demo.parts, integrationInputHash: undefined }), DEMO_OFF_BUILD_INPUT_ID, "without the integration part = the pre-integration identity of the current pin");
});
// B2b states which package data/site-builds points at, per rollout state (demo-rollout.ts):
//  PRE_PUBLISH_TRANSITION — the V0.1 package is current, the pilot package is its rollback, and the
//    demo's V0.2 identity is NOT what site:publish would pick up (07 §16 steps 1–3);
//  POST_PUBLISH_STEADY — the current package IS the demo's own identity (its contract pair, its
//    _integration/ byte-identical to the canonical golden) and the rollback behind it is the frozen
//    lineage. RESTATED for media 1.1 (08, docs/result/portfolio-media-1.1): the media build is the
//    third steady package, so the rollback moved one step again — behind it is exactly the widget
//    build (32303241…, live 2026-09-28), intact at its frozen hash, same pin, contract "1.0", its
//    _integration/ = the FROZEN V0.2 golden's bytes. keep-2 retired the first V0.2 package
//    (a4777cf9…, the widget build's own rollback); it is read from V02_FIRST_PACKAGE_COMMIT and
//    re-hashed at its frozen packageHash, so the lineage proof keeps its strength (the V0.1 package
//    before it is G1–G3's). The earlier branches (current = the first V0.2 or the widget package)
//    are unreachable now: their integration part was producer 2, and `current = demo identity`
//    below requires the current producer. Moving the rollback again is a reviewed restatement, not
//    something a rebuild may do silently.
await check("B2b the current/previous packages are exactly the rollout state's: PRE = V0.1 current, pilot as rollback, nothing V0.2 staged; POST = the demo's media 1.1 identity current with the golden integration bytes, the frozen rollback lineage behind it (the widget build, its own rollback — the first V0.2 package — retired by keep-2 and intact in git)", async () => {
  eq(demo.parts.integrationInputHash !== undefined, true, "the demo is still opted in");
  if (rollout === "PRE_PUBLISH_TRANSITION") {
    eq(currentRecord.buildInputId, V01_BUILD_INPUT_ID, "current = the V0.1 package");
    assert(demo.buildInputId !== currentRecord.buildInputId, "the V0.2 build identity must differ from the current (V0.1) package's");
    eq(currentRecord.integration?.contract, { core: "0.1", portfolio: "0.1" }, "current package = V0.1 contract pair");
    eq(previousId, LIVE_BUILD_INPUT_ID, "previous = the pilot package");
    return;
  }
  eq(rollout, "POST_PUBLISH_STEADY", "rollout state");
  eq(currentRecord.buildInputId, demo.buildInputId, "current = the demo's media 1.1 identity (nothing stale, nothing else)");
  eq([currentRecord.template.releaseId, currentRecord.template.releaseHash], [demoPin.releaseId, demoPin.releaseHash], "built with the pin");
  eq([currentRecord.integration?.contract, currentRecord.integration?.producerVersion], [{ core: "0.1", portfolio: "1.1" }, PRODUCER_VERSION], "current package = the media 1.1 contract pair, this producer");
  const files = (await readdir(path.join(currentDir, "site", INTEGRATION_DIR))).filter((f) => f !== ".DS_Store").sort();
  eq(files, ["manifest.json", `portfolio.${DEMO_VERSION}.json`], "current _integration/ = the media 1.1 manifest + document");
  for (const f of files) eq(sha256(await readFile(path.join(currentDir, "site", INTEGRATION_DIR, f))), sha256(await readFile(path.join(repoRoot, GOLDEN_DIR, f))), `${f} = the canonical golden's bytes`);
  eq([DEMO_DOC_SHA256, DEMO_MANIFEST_SHA256], [sha256(await readFile(path.join(currentDir, "site", INTEGRATION_DIR, `portfolio.${DEMO_VERSION}.json`))), sha256(await readFile(path.join(currentDir, "site", INTEGRATION_DIR, "manifest.json")))], "document / manifest sha256 = the contract literals");
  assert(await packageIntact(currentDir), "current package intact");
  // 08 — every media src the current document names is a file of the current package (INV-5 for images)
  const srcs = new Set(demoEmission.portfolio!.document.records.flatMap((r) => [r.media?.cover, ...(r.media?.gallery ?? [])]).filter((m) => m !== undefined).map((m) => m.src));
  for (const src of srcs) assert(await exists(path.join(currentDir, "site", src.slice(1))), `media src ${src} is in the current package`);

  eq(previousId, WIDGET_BUILD_INPUT_ID, "previous = the widget build (the rollback behind the media 1.1 build)");
  const prevDir = path.join(demoBuilds, "packages", WIDGET_BUILD_INPUT_ID);
  const prevRecord = (await readJson(path.join(prevDir, "build-record.json"))) as BuildRecord;
  eq([prevRecord.buildInputId, prevRecord.packageHash], [WIDGET_BUILD_INPUT_ID, WIDGET_PACKAGE_HASH], "the rollback's recorded identity");
  assert(await packageIntact(prevDir), "the rollback package is intact");
  eq([prevRecord.template.releaseId, prevRecord.template.releaseHash], [demoPin.releaseId, demoPin.releaseHash], "the rollback was built with the same pin");
  eq(prevRecord.integration?.contract, { core: "0.1", portfolio: "1.0" }, "the rollback = the V0.2 contract pair (document 1.0)");
  const prevFiles = (await readdir(path.join(prevDir, "site", INTEGRATION_DIR))).filter((f) => f !== ".DS_Store").sort();
  eq(prevFiles, ["manifest.json", `portfolio.${V02_VERSION}.json`], "the rollback's _integration/ = the V0.2 manifest + document");
  for (const f of prevFiles) eq(sha256(await readFile(path.join(prevDir, "site", INTEGRATION_DIR, f))), sha256(await readFile(path.join(repoRoot, GOLDEN_V02_DIR, f))), `rollback ${f} = the frozen V0.2 golden's bytes`);
  eq([sha256(await readFile(path.join(prevDir, "site", INTEGRATION_DIR, `portfolio.${V02_VERSION}.json`))), sha256(await readFile(path.join(prevDir, "site", INTEGRATION_DIR, "manifest.json")))], [V02_DOC_SHA256, V02_MANIFEST_SHA256], "rollback document / manifest sha256 = the frozen literals");

  // the widget build's own rollback, the first V0.2 package: retired from the working tree by keep-2
  const firstOnDisk = path.join(demoBuilds, "packages", V02_FIRST_BUILD_INPUT_ID);
  assert(!(await exists(firstOnDisk)), "keep-2 retired the first V0.2 package (current + previous only)");
  const scratch = await mkdtemp(path.join(os.tmpdir(), "v02-first-package-"));
  try {
    const firstDir = gitMaterialize(repoRoot, V02_FIRST_PACKAGE_COMMIT, path.relative(repoRoot, firstOnDisk), scratch);
    const firstRecord = (await readJson(path.join(firstDir, "build-record.json"))) as BuildRecord;
    eq([firstRecord.buildInputId, firstRecord.packageHash], [V02_FIRST_BUILD_INPUT_ID, V02_FIRST_PACKAGE_HASH], "the first V0.2 package's recorded identity (from git)");
    assert(await packageIntact(firstDir), "the first V0.2 package, read from git, is intact at its frozen packageHash");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
await check("B3 preview never emits (SE5): the demo in preview mode has no integration part", async () => {
  const p = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "preview", at: AT });
  eq([p.integration.emit, p.integration.producerSourceHash, p.parts.integrationInputHash], [false, undefined, undefined], "preview");
  eq(integrationEmits({ schemaVersion: 1, firstPartyData: { enabled: true } }, "preview"), false, "helper");
  eq(integrationEmits({ schemaVersion: 1, firstPartyData: { enabled: false } }, "public"), false, "disabled");
  eq(integrationEmits(undefined, "public"), false, "absent");
});
await check("B4 OFF = the pre-integration identity: the demo without integration.json (or enabled:false) has exactly the pre-integration buildInputId of its current pin (the live package's, modulo the re-pin — B2)", async () => {
  for (const variant of ["absent", "disabled"] as const) {
    const root = await throwawayRoot(DEMO, async (dir) => {
      if (variant === "absent") await rm(path.join(dir, "integration.json"));
      else await writeFile(path.join(dir, "integration.json"), `${JSON.stringify({ schemaVersion: 1, firstPartyData: { enabled: false } })}\n`);
    });
    try {
      const inp = await prepareSiteInput({ repoRoot: root, siteId: DEMO, mode: "public", at: AT });
      eq(inp.buildInputId, DEMO_OFF_BUILD_INPUT_ID, `${variant}: identity`);
      eq(inp.integration.emit, false, `${variant}: emit`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
await check("B5 an invalid integration.json fails closed (unknown key, non-boolean, wrong schemaVersion)", async () => {
  for (const bad of [{ schemaVersion: 1, firstPartyData: { enabled: "yes" } }, { schemaVersion: 2, firstPartyData: { enabled: true } }, { schemaVersion: 1, firstPartyData: { enabled: true, resources: ["portfolio"] } }, { schemaVersion: 1 }]) {
    const root = await throwawayRoot("fixture-small", async (dir) => writeFile(path.join(dir, "integration.json"), JSON.stringify(bad)));
    try {
      await rejects(() => prepareSiteInput({ repoRoot: root, siteId: "fixture-small", mode: "public", at: AT }), /integration\.json invalid/);
      await rejects(() => loadIntegrationConfig(root, "fixture-small"), /IntegrationConfigError|invalid/);
      try {
        await loadIntegrationConfig(root, "fixture-small");
      } catch (e) {
        assert(e instanceof IntegrationConfigError, "error class");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
await check("B6 the producer version and the config are build inputs; a change outside the projection changes the buildInputId but not the resource version", async () => {
  assert(hashJson({ producer: PRODUCER_VERSION + 1, producerSourceHash: demo.integration.producerSourceHash, contract: { core: "0.1", portfolio: "0.1" }, config: demo.integration.config }) !== demo.parts.integrationInputHash, "producer version");
  const root = await throwawayRoot(DEMO, async (dir) => editJson(path.join(dir, "settings.json"), (d) => void (d.overrides["home.projects-a"].limit = 3)));
  try {
    const inp = await prepareSiteInput({ repoRoot: root, siteId: DEMO, mode: "public", at: AT });
    assert(inp.buildInputId !== demo.buildInputId, "settings change → new build identity");
    eq(emitFor(inp.snapshot).portfolio!.version, demoEmission.portfolio!.version, "resource version unchanged (RV2)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await check("B7 no site is named in the producer or the builder seam (generic opt-in)", async () => {
  for (const f of ["platform/integration/contract.ts", "platform/integration/config.ts", "platform/integration/emit.ts", "platform/integration/validate.ts", "platform/integration/sources.ts", "platform/build/site-build.ts", "platform/build/build-input.ts", "platform/build/declared-routes.ts", "platform/publish/publish.ts"]) {
    const t = await readFile(path.join(repoRoot, f), "utf8");
    for (const lit of ["boost-interior", "interior-demo", "boostweb", "fixture-"]) assert(!t.includes(lit), `${f} mentions "${lit}"`);
  }
});

console.log("\n[golden V0.1] the frozen V0.1 package (data/site-builds) — current before the V0.2 publish, the rollback after it");
// G1–G3: the V0.1 compatibility proof — the V0.1 artefact the consumer read before the V0.2 publish
// (and would read again after a rollback) is byte-intact and still self-consistent. They address the
// package by its frozen id, so they hold in both rollout states (B2b says which pointer names it).
// The V0.2 golden is G6, a separate pinned package; B2b ties the current package to it after publish.
await check("G1 V0.1 package: exactly its two V0.1 files, 8 records, the V0.1 contract pair and producer 1 in its build record; bytes intact at its frozen packageHash", async () => {
  const goldenRecord = needV01();
  const goldenDir = v01Dir;
  eq([goldenRecord.buildInputId, goldenRecord.packageHash], [V01_BUILD_INPUT_ID, V01_PACKAGE_HASH], "frozen identity");
  const files = (await readdir(path.join(goldenDir, "site", INTEGRATION_DIR))).sort();
  eq(files, ["manifest.json", `portfolio.${V01_DEMO_VERSION}.json`], "files");
  const i = goldenRecord.integration!;
  eq([i.contract, i.producerVersion, i.warnings], [{ core: "0.1", portfolio: "0.1" }, 1, []], "record contract");
  assert(i.resources.portfolio, "portfolio offered");
  eq([i.manifest.path, i.manifest.bytes], ["_integration/manifest.json", DEMO_MANIFEST_BYTES], "record manifest");
  eq([i.resources.portfolio.path, i.resources.portfolio!.version, i.resources.portfolio.bytes, i.resources.portfolio.records, i.resources.portfolio.facets], [`${INTEGRATION_DIR}/portfolio.${V01_DEMO_VERSION}.json`, V01_DEMO_VERSION, V01_DEMO_DOC_BYTES, 8, { category: 4, scope: 20, tag: 8 }], "record portfolio");
  for (const f of [i.manifest, i.resources.portfolio]) eq(sha256(await readFile(path.join(goldenDir, "site", f.path))), f.sha256, `${f.path} bytes = its build record`);
  const doc = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${V01_DEMO_VERSION}.json`));
  eq([doc.schemaVersion, doc.records.length, portfolioVersion(doc)], ["0.1", 8, V01_DEMO_VERSION], "a V0.1 document whose version is still its own body hash");
  assert(goldenRecord.qa.pass && goldenRecord.qa.files === 158, `qa ${goldenRecord.qa.files}`);
  assert(await packageIntact(goldenDir), "golden package intact");
});
await check("G2 V0.1 package: manifest pointer = file name = document version (INV-3); the manifest origin = site.json; the runtime resolves both URLs", async () => {
  needV01();
  const goldenDir = v01Dir;
  const manifest = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, "manifest.json"));
  const doc = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${V01_DEMO_VERSION}.json`));
  eq(manifest.schemaVersion, "0.1", "manifest schemaVersion (unchanged by V0.2 as well, INV-27)");
  eq(manifest.resources.portfolio, { href: `/_integration/portfolio.${V01_DEMO_VERSION}.json`, version: V01_DEMO_VERSION }, "pointer");
  eq(doc.version, V01_DEMO_VERSION, "echo");
  eq(manifest.site.publicOrigin, (await readJson(path.join(repoRoot, "data/sites", DEMO, "site.json"))).identity.publicOrigin, "origin");
  eq(resolvePath(MANIFEST_PATH), { kind: "key", key: "_integration/manifest.json" }, "manifest key");
  eq(resolvePath(manifest.resources.portfolio.href), { kind: "key", key: `_integration/portfolio.${V01_DEMO_VERSION}.json` }, "document key");
  eq(resolvePath(`${MANIFEST_PATH}/`).kind, "not-found", "trailing slash = 404 (HT8)");
});
await check("G2b the runtime resolves the manifest and a document path to their package keys; a trailing slash is 404 (HT8) — the pure half of G2, independent of any package on disk", () => {
  eq(resolvePath(MANIFEST_PATH), { kind: "key", key: "_integration/manifest.json" }, "manifest key");
  eq(resolvePath(demoEmission.manifest.resources.portfolio!.href), { kind: "key", key: demoEmission.portfolio!.file.path }, "document key");
  eq(resolvePath(`${MANIFEST_PATH}/`).kind, "not-found", "trailing slash = 404 (HT8)");
});
await check("G3 V0.1 package: every detailUrl and the listingUrl have an HTML page in the package (INV-5); no absolute URL or external host in the document (INV-6)", async () => {
  needV01();
  const goldenDir = v01Dir;
  const doc = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${V01_DEMO_VERSION}.json`));
  const html = (p: string) => path.join(goldenDir, "site", `${p.replace(/^\//, "")}.html`);
  assert(await exists(html(doc.listingUrl)), "listing page");
  for (const r of doc.records) assert(await exists(html(r.detailUrl)), `${r.id} detail page`);
  const text = await readFile(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${V01_DEMO_VERSION}.json`), "utf8");
  assert(!/https?:\/\//.test(text) && !text.includes("//"), "no absolute / protocol-relative URL");
});
await check(`G4 the live pilot package ${LIVE_BUILD_INPUT_ID.slice(0, 12)}… is untouched while on disk (intact, packageHash ${LIVE_PACKAGE_HASH.slice(0, 12)}…, parts = LIVE_PARTS): the rollback (previous.json) before the V0.2 publish, retired by keep-2 after it`, async () => {
  const liveDir = path.join(demoBuilds, "packages", LIVE_BUILD_INPUT_ID);
  if (rollout === "PRE_PUBLISH_TRANSITION") eq(previousId, LIVE_BUILD_INPUT_ID, "previous pointer");
  else assert(previousId !== LIVE_BUILD_INPUT_ID && currentRecord.buildInputId !== LIVE_BUILD_INPUT_ID, "after the V0.2 publish the pilot package is neither current nor the rollback");
  if (!(await exists(liveDir))) {
    eq(rollout, "POST_PUBLISH_STEADY", "the pilot package may only be absent once no pointer names it");
    console.log("       the pilot package directory was retired by keep-2 (its sealed copy stays in R2); LIVE_PARTS stays checked by B2");
    return;
  }
  const rec = (await readJson(path.join(liveDir, "build-record.json"))) as BuildRecord;
  eq(rec.packageHash, LIVE_PACKAGE_HASH, "recorded hash");
  eq(stableStringify(rec.parts), stableStringify(LIVE_PARTS), "recorded parts = LIVE_PARTS");
  assert(await packageIntact(liveDir), "live package bytes still hash to the recorded packageHash");
  assert(!(await exists(path.join(liveDir, "site", INTEGRATION_DIR))), "live package has no _integration/");
});
await check("G5 V0.1 package = live + exactly the two integration files: every other file byte-identical once the build id (Next's generateBuildId = buildInputId[0:32], embedded in HTML/RSC and the _next/static/<id>/ path) is canonicalised", async () => {
  const liveDir = path.join(demoBuilds, "packages", LIVE_BUILD_INPUT_ID, "site");
  if (!(await exists(liveDir)) || !v01Record) {
    // A point-in-time proof about how the V0.1 package was made. Once keep-2 retires the pilot
    // package (the first V0.2 build, G4) it cannot be re-run, and it need not be: G1 keeps the V0.1
    // package pinned at V01_PACKAGE_HASH, so the bytes G5 compared cannot have moved since.
    eq(rollout, "POST_PUBLISH_STEADY", "the comparison may only be unavailable after the V0.2 publish");
    pointInTime.push("G5 V0.1 package = live + two integration files — the pilot package was retired by keep-2 with the V0.2 build; proven at 0c34606, V0.1 bytes held by G1 (39-)");
    console.log("       point-in-time: the pilot package was retired by keep-2 after the V0.2 publish; this proof stands at 0c34606 (39-)");
    return;
  }
  const newDir = path.join(v01Dir, "site");
  const oldId = LIVE_BUILD_INPUT_ID.slice(0, 32);
  const newId = V01_BUILD_INPUT_ID.slice(0, 32);
  const live = new Map<string, Buffer>();
  for (const f of await walkFiles(liveDir)) live.set(f.replaceAll(oldId, newId), Buffer.from((await readFile(path.join(liveDir, f))).toString("latin1").replaceAll(oldId, newId), "latin1"));
  const fresh = new Map<string, Buffer>();
  for (const f of await walkFiles(newDir)) fresh.set(f, await readFile(path.join(newDir, f)));
  const added = [...fresh.keys()].filter((k) => !live.has(k)).sort();
  const removed = [...live.keys()].filter((k) => !fresh.has(k));
  const changed = [...fresh.keys()].filter((k) => live.has(k) && !fresh.get(k)!.equals(live.get(k)!));
  eq(added, [`${INTEGRATION_DIR}/manifest.json`, `${INTEGRATION_DIR}/portfolio.${V01_DEMO_VERSION}.json`], "added");
  eq([removed, changed], [[], []], "removed / changed");
  eq([live.size, fresh.size], [156, 158], "counts");
});

console.log("\n[golden] the pinned integration packages shared with the consumer: media 1.1 (platform/test/golden/portfolio-v1.1-media) and the FROZEN V0.2 one (platform/test/golden/portfolio-v0.2)");
await check(`G6 (P-V2-16) the media 1.1 golden package equals the pure emission byte for byte; golden.json records exactly the facts of those bytes (media counts included); the file name carries the version (RV5)`, async () => {
  const dir = path.join(repoRoot, GOLDEN_DIR);
  eq((await readdir(dir)).filter((f) => f !== ".DS_Store").sort(), ["README.md", "golden.json", "manifest.json", `portfolio.${DEMO_VERSION}.json`], "golden files");
  for (const f of demoEmission.files) {
    const bytes = await readFile(path.join(dir, path.basename(f.path)));
    eq([bytes.length, sha256(bytes)], [f.bytes.length, f.sha256], `${path.basename(f.path)} = the emission`);
  }
  const golden = await readJson(path.join(dir, "golden.json"));
  const v = validateFor(demoEmission, demo.snapshot);
  eq(golden, goldenRecord(demoEmission.portfolio!.document, demoEmission.files.map((f) => ({ name: path.basename(f.path), bytes: f.bytes.length, sha256: f.sha256 })), { errors: v.errors.length, warnings: v.warnings.length }), "golden.json");
  eq([golden.input, golden.contractRevision, golden.addendum, golden.manifestSchemaVersion, golden.documentSchemaVersion, golden.producerVersion], [{ siteId: DEMO, mode: "public", at: AT, template: "interior-01/v1" }, "9.2.1", "08-portfolio-media-1.1", "0.1", "1.1", 3], "the pinned input and contract pair");
  eq(golden.counts.media, { records: 19, cover: 19, gallery: 8, galleryImages: 41, totalCount: 42, derivedHasMore: 1 }, "media counts (08)");
  // the golden document parsed back is still its own version (the bytes, not only the in-memory emission)
  const doc = await readJson(path.join(dir, `portfolio.${DEMO_VERSION}.json`));
  eq([doc.version, portfolioVersion(doc)], [DEMO_VERSION, DEMO_VERSION], "golden document version = its body hash");
  eq((await readJson(path.join(dir, "manifest.json"))).resources.portfolio, { href: `/${INTEGRATION_DIR}/portfolio.${DEMO_VERSION}.json`, version: DEMO_VERSION }, "golden manifest points at the golden document (P-V2-04)");
});
await check("G6b the FROZEN V0.2 golden (document 1.0 — the consumer's 1.0 compatibility fixture) is untouched: its four files hash to their literals, golden.json still names the 1.0 / producer-2 facts, and its document is still its own version with no media", async () => {
  const dir = path.join(repoRoot, GOLDEN_V02_DIR);
  eq((await readdir(dir)).filter((f) => f !== ".DS_Store").sort(), ["README.md", "golden.json", "manifest.json", `portfolio.${V02_VERSION}.json`], "frozen golden files");
  const hashes = await Promise.all(["README.md", "golden.json", "manifest.json", `portfolio.${V02_VERSION}.json`].map(async (f) => sha256(await readFile(path.join(dir, f)))));
  eq(hashes, [V02_README_SHA256, V02_GOLDEN_JSON_SHA256, V02_MANIFEST_SHA256, V02_DOC_SHA256], "frozen bytes");
  const golden = await readJson(path.join(dir, "golden.json"));
  eq([golden.resourceVersion, golden.documentSchemaVersion, golden.producerVersion, golden.files.map((f: { bytes: number }) => f.bytes)], [V02_VERSION, "1.0", 2, [DEMO_MANIFEST_BYTES, V02_DOC_BYTES]], "golden.json facts");
  const doc = await readJson(path.join(dir, `portfolio.${V02_VERSION}.json`));
  eq([doc.schemaVersion, doc.version, portfolioVersion(doc), doc.records.filter((r: { media?: unknown }) => r.media !== undefined).length], ["1.0", V02_VERSION, V02_VERSION, 0], "a 1.0 document, its own version, no media");
});
await check("G7 (P-V2-05, 07 §11 RV) immutability: re-emitting the same canonical input gives the golden bytes again; changing one canonical fact gives new bytes AND a new resourceVersion, so one version never names two byte sequences", () => {
  const again = emitFor(clone(demo.snapshot));
  eq(again.files.map((f) => f.sha256), [DEMO_MANIFEST_SHA256, DEMO_DOC_SHA256], "same input → the golden bytes");
  const s = clone(demo.snapshot);
  const bi09 = s.content.projects.find((p) => p.id === "bi-09")!;
  assert(bi09.totalPrice?.kind === "exact", "bi-09 carries an exact total");
  bi09.totalPrice = { ...bi09.totalPrice, amount: bi09.totalPrice.amount + 1_000_000 };
  const moved = emitFor(s);
  assert(moved.portfolio!.file.sha256 !== DEMO_DOC_SHA256, "changed data → changed bytes");
  assert(moved.portfolio!.version !== DEMO_VERSION, "changed data → a new resourceVersion");
  eq(moved.portfolio!.file.path, `${INTEGRATION_DIR}/portfolio.${moved.portfolio!.version}.json`, "…and a new file name (RV5)");
  eq(moved.manifest.resources.portfolio!.version, moved.portfolio!.version, "the manifest pointer follows");
});

console.log("\n[builds] real site:build on throwaway roots (data/sites + data/site-builds untouched)");
// T1 was "a rebuild of the demo reproduces the RECORDED V0.1 package". The V0.1 package is no longer
// what the demo builds (B2b), and writing a V0.2 package into data/site-builds is what this release
// deliberately does not do; so T1 builds the V0.2 demo on a throwaway root and checks what the
// V0.2 document promises about the site it points into.
await check("T1 (P-V2-07) the demo really builds: the detail pages are exactly the 19 records' detailUrls, each resolves (never 404) and names its own record (<h1>, <title>, canonical); the listing page exists; every media src is a package file; the package's _integration bytes = the media 1.1 golden", async () => {
  const root = await throwawayRoot(DEMO);
  try {
    const r = await buildSite({ repoRoot: root, siteId: DEMO, at: AT });
    assert(r.status === "built" && r.record.qa.pass, `built: ${r.status}`);
    const site = path.join(r.packageDir, "site");
    eq((await readdir(path.join(site, INTEGRATION_DIR))).sort(), ["manifest.json", `portfolio.${DEMO_VERSION}.json`], "integration files");
    for (const f of demoEmission.files) eq(sha256(await readFile(path.join(site, f.path))), f.sha256, `${f.path} = the pure emission = the golden`);
    const i = r.record.integration!;
    eq([i.contract, i.producerVersion, i.warnings, i.resources.portfolio?.version, i.resources.portfolio?.records], [{ core: "0.1", portfolio: "1.1" }, PRODUCER_VERSION, [], DEMO_VERSION, 19], "build record integration summary");
    const doc = demoEmission.portfolio!.document;
    // 08 — every media src is a file of the same package (the images a consumer fetches exist)
    const srcs = [...new Set(doc.records.flatMap((x) => [x.media?.cover, ...(x.media?.gallery ?? [])]).filter((m) => m !== undefined).map((m) => m.src))];
    eq(srcs.length, 41, "41 distinct media images: the 41 exported gallery images; all 19 covers are among them (bi-01 … bi-08 their own, bi-09 … bi-19 reused)");
    for (const src of srcs) assert(await exists(path.join(site, src.slice(1))), `media src ${src} is in the package`);
    const detailPages = (await readdir(path.join(site, "portfolio"))).filter((f) => f.endsWith(".html")).map((f) => `/portfolio/${f.slice(0, -".html".length)}`).sort();
    eq(detailPages, doc.records.map((x) => x.detailUrl).sort(), "generated detail pages = the records' detailUrls: none missing, none extra");
    eq(detailPages.length, 19, "19 detail pages");
    assert(await exists(path.join(site, `${doc.listingUrl!.slice(1)}.html`)), "listing page");
    for (const rec of doc.records) {
      const res = resolvePath(rec.detailUrl);
      eq(res, { kind: "key", key: `${rec.detailUrl.slice(1)}.html` }, `${rec.id}: the runtime serves ${rec.detailUrl} from its page`);
      const html = await readFile(path.join(site, res.kind === "key" ? res.key : ""), "utf8");
      eq(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1], rec.title, `${rec.id} <h1>`);
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
      assert(title?.startsWith(`${rec.title} | `), `${rec.id} <title>: ${title}`);
      const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];
      assert(canonical !== undefined && new URL(canonical, "https://canonical.invalid").pathname === rec.detailUrl, `${rec.id} canonical: ${canonical}`);
    }
    eq(resolvePath("/portfolio/no-such-case"), { kind: "key", key: "portfolio/no-such-case.html" }, "an unknown slug maps to a key…");
    assert(!(await exists(path.join(site, "portfolio/no-such-case.html"))), "…that the package does not hold (the runtime answers 404)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await check("T2 generic opt-in: fixture-small with an integration.json builds /_integration/ for ITS records and origin (nothing demo-specific)", async () => {
  const root = await throwawayRoot("fixture-small", async (dir) => writeFile(path.join(dir, "integration.json"), ON));
  try {
    const inp = await prepareSiteInput({ repoRoot: root, siteId: "fixture-small", mode: "public", at: AT });
    assert(inp.buildInputId !== (await readJson(path.join(repoRoot, "data/site-builds/fixture-small/current.json"))).buildInputId, "ON identity ≠ the OFF package");
    const r = await buildSite({ repoRoot: root, siteId: "fixture-small", at: AT });
    assert(r.status === "built" && r.record.qa.pass, "built");
    const manifest = await readJson(path.join(r.packageDir, "site", INTEGRATION_DIR, "manifest.json"));
    eq(manifest.site, { id: "fixture-small", publicOrigin: "https://fixture-small.example", locale: inp.snapshot.site.identity.locale }, "site");
    const doc = await readJson(path.join(r.packageDir, "site", INTEGRATION_DIR, `portfolio.${manifest.resources.portfolio!.version}.json`));
    eq(doc.records.length, inp.snapshot.content.projects.length, "records = served projects");
    eq(doc.version, manifest.resources.portfolio!.version, "echo");
    const expected = emitFor(inp.snapshot);
    eq(sha256(await readFile(path.join(r.packageDir, "site", expected.portfolio!.file.path))), expected.portfolio!.file.sha256, "bytes = pure emission");
    eq(r.record.qa.files, (await readJson(path.join(await packageOf(repoRoot, "fixture-small"), "build-record.json"))).qa.files + 2, "+2 files");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await check("T3 an empty site opted in emits the empty V0.2 document (records []) and a manifest that still lists the resource", async () => {
  const root = await throwawayRoot("fixture-empty", async (dir) => writeFile(path.join(dir, "integration.json"), ON));
  try {
    const r = await buildSite({ repoRoot: root, siteId: "fixture-empty", at: AT });
    assert(r.status === "built", r.status);
    eq(await readFile(path.join(r.packageDir, "site", INTEGRATION_DIR, `portfolio.${EMPTY_VERSION}.json`), "utf8"), EMPTY_DOC, "document");
    eq((await readJson(path.join(r.packageDir, "site", INTEGRATION_DIR, "manifest.json"))).resources, { portfolio: { href: `/_integration/portfolio.${EMPTY_VERSION}.json`, version: EMPTY_VERSION } }, "manifest");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await check("T4 an opted-in public build FAILS without an https origin (http, or none) — never a silent skip (02 §4, INV-11)", async () => {
  for (const variant of ["http", "none"] as const) {
    const root = await throwawayRoot("fixture-small", async (dir) => {
      await writeFile(path.join(dir, "integration.json"), ON);
      await editJson(path.join(dir, "site.json"), (d) => {
        if (variant === "http") d.identity.publicOrigin = "http://fixture-small.example";
        else delete d.identity.publicOrigin;
      });
    });
    try {
      await rejects(() => buildSite({ repoRoot: root, siteId: "fixture-small", at: AT }), variant === "http" ? /integration .*not an https origin/ : /integration .*no publicOrigin/);
      assert(!(await exists(path.join(root, "data/site-builds/fixture-small/current.json"))), "no package written");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
await check("T5 a forbidden character (U+2028 inside a title) FAILS the opted-in build (HT7, INV-12); the same site builds without the opt-in", async () => {
  const mutate = async (dir: string) => editJson(path.join(dir, "content/projects.json"), (d) => void (d.items[0].title = `수성 화이트 34평`));
  const on = await throwawayRoot(DEMO, mutate);
  try {
    await rejects(() => buildSite({ repoRoot: on, siteId: DEMO, at: AT }), /integration \(site opted in, public build\)[\s\S]*title: contains a forbidden character \(HT7\)/);
  } finally {
    await rm(on, { recursive: true, force: true });
  }
  const off = await throwawayRoot(DEMO, async (dir) => {
    await mutate(dir);
    await rm(path.join(dir, "integration.json"));
  });
  try {
    const r = await buildSite({ repoRoot: off, siteId: DEMO, at: AT });
    assert(r.status === "built" && !(await exists(path.join(r.packageDir, "site", INTEGRATION_DIR))), "OFF build unaffected");
  } finally {
    await rm(off, { recursive: true, force: true });
  }
});
await check("T6 a preview build of the opted-in demo has no /_integration/ (SE5) and no integration in its record", async () => {
  const root = await throwawayRoot(DEMO);
  try {
    const r = await buildSite({ repoRoot: root, siteId: DEMO, mode: "preview", at: AT });
    assert(r.status === "built", r.status);
    assert(!(await exists(path.join(r.packageDir, "site", INTEGRATION_DIR))) && r.record.integration === undefined && r.record.parts.integrationInputHash === undefined, "preview");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
await check("T7 a fixture rebuilt OFF is byte-identical to its canonical package (INV-11 byte-neutral) and the export guard refuses a stray _integration/", async () => {
  const root = await throwawayRoot("fixture-empty");
  try {
    const canon = await readJson(path.join(await packageOf(repoRoot, "fixture-empty"), "build-record.json"));
    const r = await buildSite({ repoRoot: root, siteId: "fixture-empty", at: canon.at });
    assert(r.status === "built", r.status);
    eq([r.record.buildInputId, r.record.packageHash], [canon.buildInputId, canon.packageHash], "identity + bytes");
    const out = path.join(r.packageDir, "site");
    await verifyIntegrationOutput(out, []);
    await mkdir(path.join(out, INTEGRATION_DIR));
    await rejects(() => verifyIntegrationOutput(out, []), /contains _integration\/ but this build emits no integration documents/);
    await rejects(() => verifyIntegrationOutput(out, demoEmission.files), /holds \[\], expected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

console.log("\n[serving] runtime + publish (fake R2, no wrangler)");
function bucketOf(objects: Map<string, { body: Uint8Array; contentType: string; cacheControl: string }>): R2BucketLike {
  const meta = (k: string) => {
    const o = objects.get(k);
    return o ? { size: o.body.length, httpEtag: `"${sha256(o.body).slice(0, 32)}"`, httpMetadata: { contentType: o.contentType, cacheControl: o.cacheControl } } : null;
  };
  return {
    async get(k) {
      const m = meta(k);
      if (!m) return null;
      const o = objects.get(k)!;
      return { ...m, body: new Blob([o.body as BlobPart]).stream(), text: async () => Buffer.from(o.body).toString("utf8") } as R2ObjectBodyLike;
    },
    async head(k) {
      return meta(k);
    },
  };
}
const HOST = "demo.test.example";
await check("R1 an OFF package answers 404 on the manifest path with the package's 404 page — never 403 (CH-R11b); ON: 200 application/json, revalidate, exact bytes (HT1–HT3)", async () => {
  const pkgHash = currentRecord.packageHash;
  const pointer: RoutingPointer = { schemaVersion: 1, hostname: HOST, siteId: DEMO, packageHash: pkgHash, buildInputId: currentRecord.buildInputId, releaseId: currentRecord.template.releaseId, publishedAt: "2026-09-22T00:00:00Z" };
  const objects = new Map<string, { body: Uint8Array; contentType: string; cacheControl: string }>();
  objects.set(routingKey(HOST), { body: new TextEncoder().encode(JSON.stringify(pointer)), contentType: "application/json", cacheControl: CACHE_REVALIDATE });
  objects.set(packageKey(DEMO, pkgHash, "404.html"), { body: new TextEncoder().encode("<h1>404</h1>"), contentType: "text/html; charset=utf-8", cacheControl: CACHE_REVALIDATE });
  const env: Env = { SITES: bucketOf(objects) };
  const off = await handle(new Request(`https://${HOST}${MANIFEST_PATH}`), env);
  eq([off.status, await off.text()], [404, "<h1>404</h1>"], "OFF → 404 with the package's 404 page");
  eq((await handle(new Request(`https://${HOST}${MANIFEST_PATH}`, { method: "HEAD" }), env)).status, 404, "HEAD 404");
  for (const f of demoEmission.files) objects.set(packageKey(DEMO, pkgHash, f.path), { body: f.bytes, contentType: contentTypeFor(f.path)!, cacheControl: cachePolicyFor(f.path, f.sha256).cacheControl });
  const on = await handle(new Request(`https://${HOST}${MANIFEST_PATH}`), env);
  eq([on.status, on.headers.get("content-type"), on.headers.get("cache-control")], [200, "application/json", CACHE_REVALIDATE], "ON manifest headers");
  eq(await on.text(), demoEmission.manifestFile.text, "ON manifest bytes");
  const doc = await handle(new Request(`https://${HOST}${demoEmission.manifest.resources.portfolio!.href}`), env);
  eq([doc.status, doc.headers.get("content-type"), await doc.text()], [200, "application/json", demoEmission.portfolio!.file.text], "ON document");
  eq((await handle(new Request(`https://${HOST}${MANIFEST_PATH}/`), env)).status, 404, "trailing slash 404 (HT8)");
});
await check("R2 publish plans the two files as application/json; the manifest revalidates (HT2/HT3); the baked origin equals the manifest origin — and it plans exactly the rollout state's current package: V0.1 before the V0.2 publish, the current package (golden bytes) after it", async () => {
  const plan = await planPublish({ repoRoot, siteId: DEMO, hostname: "interior-demo.boostweb.co.kr" });
  const pre = rollout === "PRE_PUBLISH_TRANSITION";
  const [docVersion, otherVersion, docBytes] = pre ? [V01_DEMO_VERSION, DEMO_VERSION, V01_DEMO_DOC_BYTES] : [DEMO_VERSION, V01_DEMO_VERSION, DEMO_DOC_BYTES];
  const m = plan.files.find((f) => f.path === "_integration/manifest.json")!;
  const d = plan.files.find((f) => f.path === `_integration/portfolio.${docVersion}.json`)!;
  assert(m && d, "planned");
  assert(!plan.files.some((f) => f.path === `_integration/portfolio.${otherVersion}.json`), pre ? "no V0.2 document is planned before the V0.2 publish" : "no V0.1 document is planned after it");
  // The plan describes the PACKAGE ON DISK that current.json names (B2b says which one that is), so
  // it is compared with that package's own bytes (G1 / B2b tie those to their records and the golden).
  const packaged = async (rel: string) => sha256(await readFile(path.join(currentDir, "site", rel)));
  eq([m.contentType, m.cacheControl, m.size, m.sha256], ["application/json", CACHE_REVALIDATE, DEMO_MANIFEST_BYTES, await packaged("_integration/manifest.json")], "manifest");
  eq([d.contentType, d.size, d.sha256], ["application/json", docBytes, await packaged(`_integration/portfolio.${docVersion}.json`)], "document");
  if (!pre) eq([m.sha256, d.sha256], [DEMO_MANIFEST_SHA256, DEMO_DOC_SHA256], "the media 1.1 golden's bytes");
  if (!pre) assert(!plan.files.some((f) => f.path === `_integration/portfolio.${V02_VERSION}.json`), "no V0.2 (1.0) document is planned beside the 1.1 one");
  eq([plan.packageHash, plan.releaseId, plan.files.length, plan.bakedOrigin, plan.manifestOrigin], [currentRecord.packageHash, currentRecord.template.releaseId, pre ? 158 : currentRecord.qa.files, demoEmission.manifest.site.publicOrigin, demoEmission.manifest.site.publicOrigin], "plan identity / origins");
  if (pre) eq(plan.packageHash, V01_PACKAGE_HASH, "the V0.1 package");
  // inventory, independent of the build record: the planned pages are the demo's composed page set
  // (demo-rollout.ts, from the corpus), and _integration/ holds exactly the manifest + one document
  eq(plan.files.map((f) => f.path).filter((f) => f.endsWith(".html")).sort(), (await demoExpectedPages(repoRoot)).pages, "planned HTML pages = the expected page set");
  eq(plan.files.map((f) => f.path).filter((f) => f.startsWith(`${INTEGRATION_DIR}/`)).sort(), ["_integration/manifest.json", `_integration/portfolio.${docVersion}.json`], "planned _integration/ entries");
  await rejects(() => planPublish({ repoRoot, siteId: DEMO, hostname: "other.example", requireOriginMatch: true }), /integration manifest was built for https:\/\/interior-demo\.boostweb\.co\.kr, not https:\/\/other\.example|package was built for/);
  const local = await planPublish({ repoRoot, siteId: DEMO, hostname: "localhost" });
  assert(local.warnings.some((w) => /integration manifest was built for/.test(w)), "local host → warning only (same policy as the sitemap origin)");
});

console.log("\n[release] Template Release immutability");
await check("I1 every stored release verifies; 1.5.2's hash is unchanged and the demo's pin resolves to a stored release", async () => {
  const dir = path.join(repoRoot, "data/template-releases/interior-01");
  const ids = (await readdir(dir)).filter((d) => !d.startsWith(".")).sort();
  assert(ids.length >= 12 && ids.includes(RELEASE_152), `releases: ${ids.join(", ")}`);
  for (const id of ids) await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", id));
  // Immutability, kept as its own literal assertion now that the demo has moved off 1.5.2: the
  // release the live package was built from must still hash to exactly what it always did.
  eq((await loadRelease(repoRoot, "interior-01", RELEASE_152)).releaseHash, RELEASE_152_HASH, "1.5.2 hash unchanged");
  // The pin itself is read from site.json (so a re-pin needs no edit here), but it must name a
  // STORED release whose own record agrees with it field for field, and be internally consistent:
  // releaseId = <templateId>-<templateVersion>-<releaseHash[0:12]>.
  assert(ids.includes(demoPin.releaseId), `the demo's pin ${demoPin.releaseId} is not a stored release: ${ids.join(", ")}`);
  const pinned = await loadRelease(repoRoot, "interior-01", demoPin.releaseId);
  eq([pinned.templateId, pinned.templateVersion, pinned.releaseId, pinned.releaseHash], [demoPin.templateId, demoPin.templateVersion, demoPin.releaseId, demoPin.releaseHash], "pin = the stored release's own record");
  eq(demoPin.releaseId, `${demoPin.templateId}-${demoPin.templateVersion}-${demoPin.releaseHash.slice(0, 12)}`, "releaseId consistency");
});
await check("I2 the producer itself is not a release source (platform/integration, platform/build), and the V0.1 package was built from the stored 1.5.2 release", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", RELEASE_152);
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  assert(![...sources.keys()].some((k) => k.startsWith("platform/integration/") || k.startsWith("platform/build/")), "not release sources");
  // …but platform/content IS one, and V0.2 extends platform/content/schema.ts — see I2b.
  assert([...sources.keys()].includes("platform/content/schema.ts"), "platform/content/schema.ts is a release source (PLATFORM_RUNTIME_DIRS)");
  const goldenRecord = needV01();
  eq(goldenRecord.template.releaseHash, rel.releaseHash, "V0.1 package built from 1.5.2");
  eq(stableStringify(goldenRecord.template), stableStringify({ templateId: "interior-01", templateVersion: "1.5.2", releaseId: RELEASE_152, releaseHash: rel.releaseHash, templateSourceHash: rel.templateSourceHash }), "record template");
});
// Restored (was skip(): the V0.2 fields in platform/content/schema.ts — a Template Release runtime
// source — had moved the working tree off 1.5.2, and the skip's own condition was that a new
// release be cut first). Release 1.6.0 was cut from this tree and the demo re-pinned to it
// (docs/result/interior-portfolio-v0.2/23), so the check is live again, now against the PIN rather
// than a hard-coded release: the working tree must still hash to whatever the demo is pinned to.
await check("I2b the working tree still equals the release the demo is pinned to", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", demoPin.releaseId);
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const files: { path: string; sha256: string }[] = [];
  for (const [p, abs] of sources) files.push({ path: p, sha256: sha256(await readFile(abs)) });
  eq(computeReleaseHash({ ...rel, files }), rel.releaseHash, `working tree = ${demoPin.releaseId}`);
});

console.log(`\n${passed} passed, ${failed.length} failed, ${skipped.length} skipped${pointInTime.length > 0 ? `, ${pointInTime.length} point-in-time` : ""}`);
if (pointInTime.length > 0) {
  console.log("\nPOINT-IN-TIME (the artefact they compare was retired by keep-2; the proof stands at the named commit):");
  for (const p of pointInTime) console.log(`  - ${p}`);
}
if (skipped.length > 0) {
  console.log("\nSKIPPED (expected values knowingly out of date; rules unchanged):");
  for (const sk of skipped) console.log(`  - ${sk}`);
}
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
