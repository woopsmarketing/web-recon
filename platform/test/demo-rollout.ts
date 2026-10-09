import { constants, rmSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packageIntact, prepareSiteInput } from "../build/site-build";
// The PRE_PUBLISH_TRANSITION window is about the V0.2 golden (document "1.0"): since media 1.1 the
// CLI's GOLDEN_DIR is the 1.1 golden, and the V0.2 one is kept, frozen, as GOLDEN_V02_DIR.
import { GOLDEN_V02_DIR as GOLDEN_DIR, GOLDEN_INPUT } from "../cli/integration-golden";
import { createContentReader } from "../content/reader";
import { emitIntegration } from "../integration/emit";
import { SOURCE_MARKER_FILE, SOURCE_MARKER_TEXT, readPortfolioSource } from "../portfolio-sync/managed";
import { planPublish } from "../publish/publish";
import { loadRelease, verifyRelease } from "../release/release";
import { planRoutes } from "../site/routes";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { gitMaterialize } from "./git-checkout";

/**
 * The demo's Portfolio V0.2 rollout window (docs/result/interior-portfolio-v0.2/37; contract 07 §16;
 * ledger PORTFOLIO-PUBLISH-GATE / DEMO-PIN-PACKAGE-SPLIT).
 *
 * The historical milestone suites assert "the demo's current package was built with its current
 * pin". That is the POST_PUBLISH_STEADY rule and it stays exactly as strict as it was. Between the
 * V0.2 pin/corpus landing (d284b93) and the controlled V0.2 publish there is ONE other valid state,
 * PRE_PUBLISH_TRANSITION, and it is valid only when every one of these holds:
 *   1. current.json points at the frozen V0.1 package (1.5.2, V0.1 contract pair, V0.1 document);
 *   2. site:publish would still publish that V0.1 package (planPublish, read only);
 *   3. the canonical V0.2 golden exists separately (platform/test/golden/portfolio-v0.2);
 *   4. no V0.2 package was built into data/site-builds (no package, no history line of the pin);
 *   5. the pin/corpus are the V0.2-ready source (a verified release ≥ 1.6.0; the corpus emits the golden);
 *   6. the V0.1 current package and the live-pilot package are byte-intact at their frozen hashes.
 * Any other split between package and pin throws, so the suite that asked fails.
 *
 * The literals below name frozen artefacts on disk (the same values integration.test.ts pins in
 * G1–G6, R2); they are not recomputable expectations.
 */
const DEMO = "boost-interior-demo";
/** the demo's current package during the window: the V0.1 package (integration.test.ts G1–G3, R2) */
const V01_CURRENT = {
  buildInputId: "0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a",
  packageHash: "286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e",
  releaseId: "interior-01-1.5.2-d87807590d64",
  releaseHash: "d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08",
  portfolioVersion: "6346c472e162ae07b76a4686fce54c51",
} as const;
/** the live Cloudflare-pilot package, the rollback behind it (integration.test.ts G4) */
const LIVE = {
  buildInputId: "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f",
  packageHash: "cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202",
} as const;
/** the canonical V0.2 golden's resourceVersion (integration.test.ts DEMO_VERSION, G6) */
const V02_GOLDEN_VERSION = "d56509c8100a56fdf9644baff78ff9e1";
/** the first release whose content model carries the V0.2 authored fields (docs/result/interior-portfolio-v0.2/23) */
const V02_MIN_TEMPLATE = "1.6.0";

export interface BuiltRelease {
  templateVersion: string;
  releaseId: string;
  releaseHash: string;
  templateSourceHash: string;
}
export type DemoRollout =
  | { state: "POST_PUBLISH_STEADY" }
  | { state: "PRE_PUBLISH_TRANSITION"; publishTarget: BuiltRelease; packagedProjectIds: string[] }
  | { state: "INCREMENTAL"; pages: DemoPagesPackage; pagesRelease: BuiltRelease; packagedProjectIds: string[] };

/**
 * INCREMENTAL (2026-10-10, portfolio.source.json `publishing: "incremental"`): the demo is built ONCE
 * as a SHELL package — `current.json` names it, it was built with the pin, and it holds no portfolio
 * page at all; the portfolio pages are composed at publish time by the release's runtime kit
 * (portfolio-runtime-interior-01.test.ts holds every composed page to the package below, and the shell
 * package itself). The milestone suites' subject — "the demo's built pages" — is then the LAST
 * ORDINARY package: the one that was live when the site was converted, kept as `previous` (rollback
 * evidence) and named here by its frozen identity. It is valid only when every one of these holds:
 *   1. the site carries the incremental marker;
 *   2. current.json points at an intact package built with the pin that carries the runtime documents;
 *   3. the last ordinary package is on disk, byte-intact at its frozen packageHash, a successful
 *      QA-passed build of a verified release, without runtime documents.
 * Anything else throws, so the suite that asked fails.
 */
const LAST_ORDINARY = {
  buildInputId: "8a0c21182f47bd45bc26f087da4538fe101d8411445de2fe2e7a71ad41effd60",
  packageHash: "3d2501990056f8da6d5e2d9cbed8491a518ca7934bb55309956cd721ad04733b",
  releaseId: "interior-01-1.6.3-93977937c0b4",
} as const;

/** what `previous.json` named while the last ordinary package was current: retired by keep-2 at the conversion, intact in the commit that last carried it */
const BEFORE_LAST_ORDINARY = {
  commit: "b2a29d235dd03742df7c8c7e01c6f3434d2ba98b",
  buildInputId: "384008316a39e1d58a0311af2410bcb20e57afabf1c2af6836fbfeb2bdbb0924",
} as const;

export interface DemoPagesPackage {
  buildInputId: string;
  /** repo-relative, as a pointer file writes it */
  packageDir: string;
  /** false: the package `current.json` names; true: the last ordinary package of an incrementally published demo */
  lastOrdinary: boolean;
}

const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`INCREMENTAL does not hold: ${msg}`);
}
function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`PRE_PUBLISH_TRANSITION does not hold: ${msg}`);
}

async function decide(repoRoot: string): Promise<DemoRollout> {
  const builds = path.join(repoRoot, "data/site-builds", DEMO);
  const site = await readJson(path.join(repoRoot, "data/sites", DEMO, "site.json"));
  const pin = site.template as { templateVersion: string; releaseId: string; releaseHash: string };
  const current = await readJson(path.join(builds, "current.json"));
  const currentDir = path.join(repoRoot, current.packageDir);
  const record = await readJson(path.join(currentDir, "build-record.json"));
  if ((await readPortfolioSource(path.join(repoRoot, "data/sites", DEMO))) === "incremental") {
    // 2. the shell package
    must(record.template.releaseId === pin.releaseId && record.template.releaseHash === pin.releaseHash, `(2) the current package was built with ${record.template.releaseId}, not the pin ${pin.releaseId}`);
    must(record.status === "success" && record.qa?.pass === true && record.portfolioRuntime !== undefined, "(2) the current package is not a successful shell build (no runtime documents)");
    must(await packageIntact(currentDir), "(2) the shell package's bytes changed");
    // 3. the last ordinary package
    const packageDir = `data/site-builds/${DEMO}/packages/${LAST_ORDINARY.buildInputId}`;
    const ordinary = await readJson(path.join(repoRoot, packageDir, "build-record.json")).catch(() => undefined);
    must(ordinary, `(3) the last ordinary package ${LAST_ORDINARY.buildInputId.slice(0, 12)}… is not on disk (it is the rollback evidence of the conversion)`);
    must(ordinary.buildInputId === LAST_ORDINARY.buildInputId && ordinary.status === "success" && ordinary.qa?.pass === true && ordinary.portfolioRuntime === undefined, "(3) the last ordinary package is not a successful, QA-passed ordinary build of itself");
    must(ordinary.packageHash === LAST_ORDINARY.packageHash && (await packageIntact(path.join(repoRoot, packageDir))), "(3) the last ordinary package's bytes changed");
    must(ordinary.template.releaseId === LAST_ORDINARY.releaseId, `(3) the last ordinary package was built with ${ordinary.template.releaseId}`);
    const built = await loadRelease(repoRoot, "interior-01", LAST_ORDINARY.releaseId);
    await verifyRelease(repoRoot, built);
    must(built.releaseHash === ordinary.template.releaseHash && built.templateSourceHash === ordinary.template.templateSourceHash, "(3) the last ordinary package's release is not the stored one");
    const manifest = await readJson(path.join(repoRoot, packageDir, "site/_integration/manifest.json"));
    const doc = await readJson(path.join(repoRoot, packageDir, "site/_integration", `portfolio.${manifest.resources.portfolio.version}.json`));
    return {
      state: "INCREMENTAL",
      pages: { buildInputId: LAST_ORDINARY.buildInputId, packageDir, lastOrdinary: true },
      pagesRelease: { templateVersion: built.templateVersion, releaseId: built.releaseId, releaseHash: built.releaseHash, templateSourceHash: built.templateSourceHash },
      packagedProjectIds: (doc.records as { id: string }[]).map((r) => r.id),
    };
  }
  if (record.template.releaseId === pin.releaseId && record.template.releaseHash === pin.releaseHash) return { state: "POST_PUBLISH_STEADY" };

  // 1. current.json is the V0.1 package
  need(current.buildInputId === V01_CURRENT.buildInputId && current.packageDir === `data/site-builds/${DEMO}/packages/${V01_CURRENT.buildInputId}`, `(1) current.json → ${current.buildInputId}, not the V0.1 package ${V01_CURRENT.buildInputId}`);
  need(record.buildInputId === V01_CURRENT.buildInputId && record.status === "success" && record.qa?.pass === true, "(1) the V0.1 build record is not a successful, QA-passed build of itself");
  need(record.template.releaseId === V01_CURRENT.releaseId && record.template.releaseHash === V01_CURRENT.releaseHash, `(1) the V0.1 package was built with ${record.template.releaseId}, not ${V01_CURRENT.releaseId}`);
  need(JSON.stringify(record.integration?.contract) === JSON.stringify({ core: "0.1", portfolio: "0.1" }), `(1) contract pair ${JSON.stringify(record.integration?.contract)} is not V0.1`);
  const integrationDir = path.join(currentDir, "site/_integration");
  const docName = `portfolio.${V01_CURRENT.portfolioVersion}.json`;
  need(JSON.stringify((await readdir(integrationDir)).filter((f) => f !== ".DS_Store").sort()) === JSON.stringify(["manifest.json", docName]), "(1) the current package's _integration/ is not exactly the V0.1 manifest + document");
  const v01Doc = await readJson(path.join(integrationDir, docName));
  need(v01Doc.schemaVersion === "0.1" && v01Doc.version === V01_CURRENT.portfolioVersion, `(1) the current document is schemaVersion ${v01Doc.schemaVersion}, not "0.1"`);

  // 6. neither the V0.1 current package nor the live-pilot package moved
  need(record.packageHash === V01_CURRENT.packageHash && (await packageIntact(currentDir)), "(6) the V0.1 current package's bytes changed");
  const liveDir = path.join(builds, "packages", LIVE.buildInputId);
  need((await readJson(path.join(liveDir, "build-record.json"))).packageHash === LIVE.packageHash && (await packageIntact(liveDir)), "(6) the live-pilot package's bytes changed");
  need((await readJson(path.join(builds, "previous.json"))).buildInputId === LIVE.buildInputId, "(6) previous.json no longer points at the live-pilot package");

  // 2. site:publish would still publish V0.1
  const plan = await planPublish({ repoRoot, siteId: DEMO, hostname: new URL(site.identity.publicOrigin).hostname });
  need(plan.packageHash === V01_CURRENT.packageHash && plan.releaseId === V01_CURRENT.releaseId, `(2) site:publish would publish ${plan.packageHash.slice(0, 12)}… (${plan.releaseId}), not the V0.1 package`);
  need(plan.files.some((f) => f.path === `_integration/${docName}`) && !plan.files.some((f) => f.path === `_integration/portfolio.${V02_GOLDEN_VERSION}.json`), "(2) the publish plan does not carry exactly the V0.1 document");

  // 3. the canonical V0.2 golden exists, separately
  const golden = path.join(repoRoot, GOLDEN_DIR);
  const goldenRecord = await readJson(path.join(golden, "golden.json"));
  const goldenDocName = `portfolio.${V02_GOLDEN_VERSION}.json`;
  const goldenDoc = await readFile(path.join(golden, goldenDocName));
  const goldenManifest = await readJson(path.join(golden, "manifest.json"));
  need(goldenRecord.resourceVersion === V02_GOLDEN_VERSION && goldenRecord.documentSchemaVersion === "1.0", `(3) golden.json names ${goldenRecord.resourceVersion} / "${goldenRecord.documentSchemaVersion}"`);
  need(goldenRecord.files.find((f: { name: string }) => f.name === goldenDocName)?.sha256 === sha256(goldenDoc), "(3) the golden document's bytes are not the ones golden.json records");
  need(JSON.parse(goldenDoc.toString("utf8")).schemaVersion === "1.0" && goldenManifest.resources?.portfolio?.version === V02_GOLDEN_VERSION, "(3) the golden is not a V0.2 manifest + document pair");

  // 4. nothing V0.2 was built into data/site-builds
  for (const id of await readdir(path.join(builds, "packages"))) {
    if (id === ".DS_Store") continue;
    const r = await readJson(path.join(builds, "packages", id, "build-record.json"));
    need(r.template.releaseId !== pin.releaseId, `(4) package ${id.slice(0, 12)}… was built with the V0.2 pin ${pin.releaseId}`);
  }
  const history = (await readFile(path.join(builds, "history.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { releaseId?: string });
  need(!history.some((h) => h.releaseId === pin.releaseId), `(4) history.jsonl records a build with the V0.2 pin ${pin.releaseId}`);

  // 5. the pin/corpus are the V0.2-ready source: a verified ≥ 1.6.0 release, and the corpus emits the golden
  const pinned = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  await verifyRelease(repoRoot, pinned);
  need(pinned.releaseHash === pin.releaseHash && versionAtLeast(pin.templateVersion, V02_MIN_TEMPLATE), `(5) pin ${pin.releaseId} is not a verified release ≥ ${V02_MIN_TEMPLATE}`);
  const input = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: GOLDEN_INPUT.mode, at: GOLDEN_INPUT.at });
  const planned = planRoutes(template.routes, createContentReader(input.snapshot.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
  const emitted = emitIntegration({ snapshot: input.snapshot, declaredRoutes: template.routes, plannedRoutes: planned }).portfolio;
  need(emitted?.version === V02_GOLDEN_VERSION && emitted.file.sha256 === sha256(goldenDoc), `(5) the corpus emits ${emitted?.version}, not the V0.2 golden ${V02_GOLDEN_VERSION}`);

  const target = await loadRelease(repoRoot, "interior-01", V01_CURRENT.releaseId);
  await verifyRelease(repoRoot, target);
  need(target.templateSourceHash === record.template.templateSourceHash, "(1) the V0.1 package's templateSourceHash is not its release's");
  return {
    state: "PRE_PUBLISH_TRANSITION",
    publishTarget: { templateVersion: target.templateVersion, releaseId: target.releaseId, releaseHash: target.releaseHash, templateSourceHash: target.templateSourceHash },
    packagedProjectIds: (v01Doc.records as { id: string }[]).map((r) => r.id),
  };
}

const memo = new Map<string, Promise<DemoRollout>>();
/** The demo's rollout state; throws (and so fails the asking check) unless it is one of the two valid states. */
export function demoRollout(repoRoot: string): Promise<DemoRollout> {
  if (!memo.has(repoRoot)) memo.set(repoRoot, decide(repoRoot));
  return memo.get(repoRoot)!;
}

/**
 * The release the demo's package of PAGES (demoPagesPackage) must have been built with: its pin once
 * steady; in the pre-publish window the V0.1 publish target, after every transition condition above
 * was proven; for the incrementally published demo the release of its last ordinary package (the
 * shell package's own release is the pin — INCREMENTAL condition 2).
 */
export async function demoBuiltRelease(repoRoot: string, pin: { releaseId: string }): Promise<BuiltRelease> {
  const r = await demoRollout(repoRoot);
  if (r.state === "PRE_PUBLISH_TRANSITION") return r.publishTarget;
  if (r.state === "INCREMENTAL") return r.pagesRelease;
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  return { templateVersion: rel.templateVersion, releaseId: rel.releaseId, releaseHash: rel.releaseHash, templateSourceHash: rel.templateSourceHash };
}

/**
 * The demo package whose pages hold the portfolio — what a milestone suite reads when it says "the
 * demo's package": the package `current.json` names; for the incrementally published demo (whose
 * current package is a shell) the last ordinary package, after every INCREMENTAL condition was proven.
 */
export async function demoPagesPackage(repoRoot: string): Promise<DemoPagesPackage> {
  const r = await demoRollout(repoRoot);
  if (r.state === "INCREMENTAL") return r.pages;
  const current = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"));
  return { buildInputId: current.buildInputId, packageDir: current.packageDir, lastOrdinary: false };
}

/**
 * The projects the demo's CURRENT package was built from: the whole corpus once steady; in the
 * pre-publish window the records the V0.1 package's own document lists — each must still be in the
 * corpus (same id), so a package page is judged against the record it renders.
 */
export async function demoPackagedProjects<P extends { id: string }>(repoRoot: string, projects: readonly P[]): Promise<P[]> {
  const r = await demoRollout(repoRoot);
  if (r.state === "POST_PUBLISH_STEADY") return [...projects];
  const ids = new Set(r.packagedProjectIds);
  for (const id of ids) need(projects.some((p) => p.id === id), `the package lists ${id}, which is not in the corpus`);
  return projects.filter((p) => ids.has(p.id));
}

/** the demo's fixed pages: the 1.5.0 IA (home, portfolio list, 3D, about, contact; ia150 P1) */
export const DEMO_FIXED_PAGES = ["index.html", "portfolio.html", "3d-portfolio.html", "about.html", "contact.html"] as const;
/** Next's two error pages, emitted by every build */
export const NEXT_ERROR_PAGES = ["404.html", "_not-found.html"] as const;

/**
 * The HTML page set the demo's CURRENT package must hold, composed without the route planner or the
 * builder: the fixed pages, Next's error pages, and one portfolio/<slug>.html per packaged record,
 * the slug as authored in content/projects.json (every record there is `published`, asserted here).
 * The packaged records are demoPackagedProjects': the V0.1 package's own document ids in the
 * pre-publish window, the whole corpus once steady. No page count is written down anywhere.
 */
export async function demoExpectedPages(repoRoot: string): Promise<{ details: string[]; pages: string[] }> {
  const corpus = (await readJson(path.join(repoRoot, "data/sites", DEMO, "content/projects.json"))).items as { id: string; slug: string; status: string }[];
  for (const p of corpus) if (p.status !== "published") throw new Error(`demoExpectedPages: corpus record ${p.id} is ${p.status}; restate the expected page set`);
  const details = (await demoPackagedProjects(repoRoot, corpus)).map((p) => `portfolio/${p.slug}.html`).sort();
  return { details, pages: [...DEMO_FIXED_PAGES, ...NEXT_ERROR_PAGES, ...details].sort() };
}

const ordinaryRoots = new Map<string, Promise<string>>();
/**
 * A repository root in which the demo is the ORDINARY site its package of pages was built from — what
 * a suite about the manual publisher (plan, upload, seal, pointer, rollback) reads the demo through.
 * Not incremental: the repository itself. INCREMENTAL: a throwaway view of the repository as it stood
 * when the site was converted — everything outside data/sites and data/site-builds is the
 * repository's (symlinks); those two are copies, the demo's being
 *   data/sites/<demo>         the live directory, pinned to the last ordinary package's release and
 *                             marked as it was then (portfolio-source@1)
 *   data/site-builds/<demo>   current.json → the last ordinary package (the directory on disk),
 *                             previous.json → the package behind it, materialised from the commit that
 *                             last carried it
 * Nothing under the real data/ is written.
 */
export function demoOrdinaryRoot(repoRoot: string): Promise<string> {
  if (!ordinaryRoots.has(repoRoot)) {
    ordinaryRoots.set(
      repoRoot,
      (async () => {
        const r = await demoRollout(repoRoot);
        if (r.state !== "INCREMENTAL") return repoRoot;
        const root = await mkdtemp(path.join(os.tmpdir(), "demo-ordinary-root-"));
        process.once("exit", () => rmSync(root, { recursive: true, force: true }));
        const copy = (from: string, to: string) => cp(from, to, { recursive: true, mode: constants.COPYFILE_FICLONE });
        const visible = (names: string[]) => names.filter((n) => n !== ".git" && n !== ".DS_Store");
        for (const e of visible(await readdir(repoRoot))) if (e !== "data") await symlink(path.join(repoRoot, e), path.join(root, e));
        await mkdir(path.join(root, "data"));
        for (const e of visible(await readdir(path.join(repoRoot, "data")))) {
          if (e !== "sites" && e !== "site-builds") {
            await symlink(path.join(repoRoot, "data", e), path.join(root, "data", e));
            continue;
          }
          // real copies (cloned where the filesystem can), never links: a suite that copies a site or a
          // package out of this root and edits the copy must not reach the repository's own files
          await mkdir(path.join(root, "data", e));
          for (const s of visible(await readdir(path.join(repoRoot, "data", e)))) if (s !== DEMO) await copy(path.join(repoRoot, "data", e, s), path.join(root, "data", e, s));
        }
        const siteDir = path.join(root, "data/sites", DEMO);
        await copy(path.join(repoRoot, "data/sites", DEMO), siteDir);
        const site = await readJson(path.join(siteDir, "site.json"));
        site.template = { ...site.template, templateVersion: r.pagesRelease.templateVersion, releaseId: r.pagesRelease.releaseId, releaseHash: r.pagesRelease.releaseHash };
        await writeFile(path.join(siteDir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
        await writeFile(path.join(siteDir, SOURCE_MARKER_FILE), SOURCE_MARKER_TEXT);
        const builds = path.join(root, "data/site-builds", DEMO);
        await mkdir(path.join(builds, "packages"), { recursive: true });
        const pointer = async (file: string, buildInputId: string) => {
          const packageDir = `data/site-builds/${DEMO}/packages/${buildInputId}`;
          const record = await readJson(path.join(root, packageDir, "build-record.json"));
          await writeFile(path.join(builds, file), `${JSON.stringify({ buildInputId, packageDir, finishedAt: record.finishedAt }, null, 2)}\n`);
        };
        await copy(path.join(repoRoot, r.pages.packageDir), path.join(builds, "packages", r.pages.buildInputId));
        await pointer("current.json", r.pages.buildInputId);
        gitMaterialize(repoRoot, BEFORE_LAST_ORDINARY.commit, `data/site-builds/${DEMO}/packages/${BEFORE_LAST_ORDINARY.buildInputId}`, root);
        if (!(await packageIntact(path.join(builds, "packages", BEFORE_LAST_ORDINARY.buildInputId)))) throw new Error("demoOrdinaryRoot: the package behind the last ordinary one does not hash to its packageHash");
        await pointer("previous.json", BEFORE_LAST_ORDINARY.buildInputId);
        return root;
      })(),
    );
  }
  return ordinaryRoots.get(repoRoot)!;
}
