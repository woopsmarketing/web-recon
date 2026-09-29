/**
 * The boost-interior-demo QA corpus — TEST-ONLY.
 *
 * On 2026-09-29 the 11 VERIFIED_SYNTHETIC records bi-09 … bi-19 left the customer-facing demo
 * (docs/work/portfolio-experience-v1/04-record-truth-audit.md): data/sites/boost-interior-demo now
 * holds bi-01 … bi-08 only. The 11 records were moved VERBATIM into a test-only fixture
 * (platform/test/fixtures/boost-interior-synthetic/, TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING)
 * because the edge cases they were authored for (04-demo-data-spec §2) — exact / range totals, D-1
 * derivation and rounding, an exclusive m² basis, an absent area / projectType / style, partial
 * scopes, and a borrowed (foreign) cover (§5) — must keep being exercised.
 *
 * This module is the ONE place that composes them back: the QA corpus = the production items + the
 * synthetic items, in the original (pre-split) order. It is imported by tests only; no build,
 * publish or producer path may import it or read the fixture (portfolio-production-truth.test.ts
 * checks that). Composition never writes into data/sites: `writeQaProjects` refuses any target
 * inside the repository's data/sites.
 */
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { ProjectSchema, ProjectsDocSchema, projectAssetRefs, type Project } from "../content/schema";
import { SiteSnapshotSchema, type SiteSnapshot } from "../site/instance";

export const DEMO_SITE_ID = "boost-interior-demo";
export const SYNTHETIC_FIXTURE_DIR = "platform/test/fixtures/boost-interior-synthetic";
export const SYNTHETIC_PROJECTS_FILE = `${SYNTHETIC_FIXTURE_DIR}/projects.synthetic.json`;
/** the fixture's own marker — the file says what it is, and a file without it is not this fixture */
export const SYNTHETIC_STATUS = "TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING";

/**
 * The pre-split 19-record Portfolio document (producer 4, document "1.1") — kept as a QA golden next
 * to the fixture (qa-golden/), NOT production. boost-chat keeps a byte-identical copy as its matcher
 * QA fixture. Literals: they name frozen bytes (formerly platform/test/golden/portfolio-v1.1-media).
 */
export const QA_GOLDEN_DIR = `${SYNTHETIC_FIXTURE_DIR}/qa-golden`;
export const QA_GOLDEN_VERSION = "856361f52e3f1b5022cce13a31afc171";
export const QA_GOLDEN_DOC_BYTES = 18520;
export const QA_GOLDEN_DOC_SHA256 = "0ae164dc03b374665d52000f997391d4b4f77325b92c60f6a3da5ec586aaac22";
export const QA_GOLDEN_MANIFEST_SHA256 = "9061827a746f986eb51127923af839930c01be7c9857ee2159a2dfae71e71e61";
/**
 * data/sites/boost-interior-demo/content/projects.json BEFORE the split (19 records, commit ee953b1),
 * and the hashJson of its public snapshot — which is the siteSnapshotHash recorded by the producer-4
 * package 71f7e5f3… built from it. The composition must reproduce both exactly (the snapshot once
 * the later footer-notice delta below is reverted).
 */
export const PRE_SPLIT_PROJECTS_BYTES = 54134;
export const PRE_SPLIT_PROJECTS_SHA256 = "7c8c6a9ecfb67e4b4a8cb250196e8aabd9662fbc7e0c52b5b7759644e2a8b8cb";
export const PRE_SPLIT_SNAPSHOT_HASH = "5edadd724cfbf3efb86398f22fb1d12000b819e6094c2b6b117e4fcbd939741b";
/**
 * Footer notice (2026-09-29, after the split): slots.json values["site.footer"].notice now names the
 * brand as fictional — a sixth deliberate data delta, [before, now]. The pre-split snapshot and the
 * record truth split's build (71a906c1…) carry `before`; `revertFooterNotice` puts back exactly it.
 */
export const DEMO_FOOTER_NOTICE: readonly [before: string, now: string] = [
  "본 사이트는 서비스 시연을 위한 데모이며, 프로젝트 이미지·후기 등 일부 콘텐츠는 AI로 생성된 예시입니다.",
  "부스트 인테리어는 BoostChat 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다.",
];

/** The snapshot with exactly the footer-notice delta reverted; throws unless it carries the current notice. */
export function revertFooterNotice(snapshot: SiteSnapshot): SiteSnapshot {
  const [before, now] = DEMO_FOOTER_NOTICE;
  const footer = snapshot.slots?.values["site.footer"];
  if (!snapshot.slots || footer?.notice !== now) throw new Error(`site.footer notice is ${JSON.stringify(footer?.notice)}, not the current notice`);
  return { ...snapshot, slots: { ...snapshot.slots, values: { ...snapshot.slots.values, "site.footer": { ...footer, notice: before } } } };
}

export interface SyntheticFixture {
  /** the fixture items exactly as stored (verbatim records, unparsed) */
  rawItems: Record<string, unknown>[];
  /** the same items, each parsed by the content model (a fixture record must itself be valid content) */
  items: Project[];
  ids: string[];
  slugs: string[];
  titles: string[];
}

const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));

/** The TEST_ONLY synthetic fixture: its 11 records, verbatim and parsed. */
export async function readSyntheticFixture(repoRoot: string): Promise<SyntheticFixture> {
  const doc = await readJson(path.join(repoRoot, SYNTHETIC_PROJECTS_FILE));
  if (doc?.status !== SYNTHETIC_STATUS || !Array.isArray(doc.items)) throw new Error(`${SYNTHETIC_PROJECTS_FILE}: not the TEST_ONLY synthetic fixture`);
  const rawItems = doc.items as Record<string, unknown>[];
  const items = rawItems.map((x, i) => {
    const r = ProjectSchema.safeParse(x);
    if (!r.success) throw new Error(`${SYNTHETIC_PROJECTS_FILE} items[${i}] is not valid content: ${JSON.stringify(r.error.issues)}`);
    return r.data;
  });
  return { rawItems, items, ids: items.map((p) => p.id), slugs: items.map((p) => p.slug), titles: items.map((p) => p.title) };
}

/**
 * The QA projects.json text: the production document (its schema / origin header and its items, in
 * order) with the fixture items appended — i.e. the pre-split file, byte for byte (the production file
 * and the fixture keep the same `JSON.stringify(doc, null, 2)` + "\n" convention). Validated as a
 * projects document (unique ids / slugs) before it is returned.
 */
export async function composeQaProjectsText(repoRoot: string, productionProjectsFile = path.join(repoRoot, "data/sites", DEMO_SITE_ID, "content/projects.json")): Promise<string> {
  const production = await readJson(productionProjectsFile);
  const fixture = await readSyntheticFixture(repoRoot);
  const clash = (production.items as { id: string }[]).filter((p) => fixture.ids.includes(p.id)).map((p) => p.id);
  if (clash.length > 0) throw new Error(`the production corpus already holds fixture ids ${clash.join(", ")}`);
  const doc = { ...production, items: [...production.items, ...fixture.rawItems] };
  ProjectsDocSchema.parse(doc);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * The QA snapshot, in memory: the production snapshot with the fixture records added exactly as the
 * site loader (platform/site/load.ts) would have served them from one projects.json — the same
 * visibility rule (public: published and publishedAt ≤ at; preview: all), the same id order, parsed
 * by the same SiteSnapshotSchema. Every asset a fixture record references must already be in the
 * production snapshot's asset table (the fixture owns no asset: its covers are borrowed).
 */
export function composeQaSnapshot(production: SiteSnapshot, fixture: SyntheticFixture, at: string): SiteSnapshot {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) throw new Error(`invalid at "${at}"`);
  const clash = production.content.projects.filter((p) => fixture.ids.includes(p.id)).map((p) => p.id);
  if (clash.length > 0) throw new Error(`the production snapshot already holds fixture ids ${clash.join(", ")}`);
  const visible = fixture.items.filter((p) => production.mode === "preview" || (p.status === "published" && Date.parse(p.publishedAt) <= atMs));
  const assets = new Set(production.assets.map((a) => a.id));
  for (const p of visible) for (const ref of projectAssetRefs(p)) if (!assets.has(ref)) throw new Error(`fixture record ${p.id} references asset ${ref}, which the production snapshot does not carry`);
  const projects = [...production.content.projects, ...structuredClone(visible)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return SiteSnapshotSchema.parse({ ...structuredClone(production), content: { ...structuredClone(production.content), projects } });
}

/**
 * Writes the QA projects.json into a THROWAWAY copy of the demo's site directory (a test's own temp
 * root). Refuses any directory inside the repository's data/sites — the production corpus is never
 * the target.
 */
export async function writeQaProjects(repoRoot: string, throwawaySiteDir: string): Promise<void> {
  const target = await realpath(throwawaySiteDir);
  const sites = await realpath(path.join(repoRoot, "data/sites"));
  if (target === sites || target.startsWith(`${sites}${path.sep}`)) throw new Error(`refusing to write the QA corpus into ${target}: it is the repository's data/sites`);
  await writeFile(path.join(target, "content/projects.json"), await composeQaProjectsText(repoRoot));
}
