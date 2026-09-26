import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { packageIntact, prepareSiteInput } from "../build/site-build";
import { GOLDEN_DIR, GOLDEN_INPUT } from "../cli/integration-golden";
import { createContentReader } from "../content/reader";
import { emitIntegration } from "../integration/emit";
import { planPublish } from "../publish/publish";
import { loadRelease, verifyRelease } from "../release/release";
import { planRoutes } from "../site/routes";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";

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
  | { state: "PRE_PUBLISH_TRANSITION"; publishTarget: BuiltRelease; packagedProjectIds: string[] };

const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
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
 * The release the demo's CURRENT package must have been built with: its pin once steady; in the
 * pre-publish window the V0.1 publish target, after every transition condition above was proven.
 */
export async function demoBuiltRelease(repoRoot: string, pin: { releaseId: string }): Promise<BuiltRelease> {
  const r = await demoRollout(repoRoot);
  if (r.state === "PRE_PUBLISH_TRANSITION") return r.publishTarget;
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  return { templateVersion: rel.templateVersion, releaseId: rel.releaseId, releaseHash: rel.releaseHash, templateSourceHash: rel.templateSourceHash };
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
  for (const id of ids) need(projects.some((p) => p.id === id), `the V0.1 package lists ${id}, which is not in the corpus`);
  return projects.filter((p) => ids.has(p.id));
}
