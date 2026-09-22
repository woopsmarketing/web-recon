/**
 * First-party integration producer (Contract V0, docs/reports/integration/02 — FROZEN 2026-09-22):
 *   - the pure emitter and the fail-closed validator (platform/integration/**) against the demo's
 *     real site data, the fixtures and crafted snapshots: allowlist projection, missing → omitted,
 *     [] only for records, no null, code point ordering, authored facet order, version stability
 *     (projection change → new version; anything outside the projection → same version), UR2 URLs,
 *     HT7 forbidden characters, duplicate ids, facet closure, area / price shape, resource pointer;
 *   - the builder seam: default OFF (fixtures keep their pre-integration identity), the demo ON,
 *     preview never emits, the producer version is a build input, OFF = the pre-integration
 *     buildInputId of the live package;
 *   - the golden package of boost-interior-demo (data/site-builds/…/current.json): the contract's
 *     §21 example values, the live 1.5.2 package untouched and only two files added, INV-3/INV-5;
 *   - real site:build runs on throwaway roots: same input → byte-identical package, a fixture
 *     opted in (generic, no site named in code), an empty site, no https origin / a forbidden
 *     character / preview → no emit or a failed build, a fixture OFF rebuild byte-neutral;
 *   - serving: the runtime resolves the documents, an OFF package answers 404 (never 403, CH-R11b),
 *     publish plans application/json + revalidate for the manifest (HT2/HT3);
 *   - Template Release immutability: every stored release verifies, the working tree still equals
 *     the pinned 1.5.2 release (the producer is not a Template change).
 *
 * Run AFTER the golden build of boost-interior-demo:
 *   tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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
  PORTFOLIO_SCHEMA_VERSION,
  PRODUCER_VERSION,
} from "../integration/contract";
import { IntegrationConfigError, integrationEmits, loadIntegrationConfig } from "../integration/config";
import { PRODUCER_SOURCE_FILES, producerSources } from "../integration/sources";
import { compareCodePoints, DeclaredRoutesSchema, emitIntegration, IntegrationError, portfolioVersion, type IntegrationEmission, type PlannedRoute } from "../integration/emit";
import { assertIntegration, isRootRelativePath, validateIntegration } from "../integration/validate";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
const AT = "2026-09-22T12:00:00Z";
/** the live 1.5.2 package (Cloudflare pilot, docs/result/cloudflare-live-pilot) — must stay byte-identical */
const LIVE_BUILD_INPUT_ID = "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f";
const LIVE_PACKAGE_HASH = "cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202";
const RELEASE_152 = "interior-01-1.5.2-d87807590d64";
/** 02 §21 — the golden values shared with the consumer */
const DEMO_VERSION = "6346c472e162ae07b76a4686fce54c51";
const DEMO_DOC_BYTES = 5292;
const DEMO_MANIFEST_BYTES = 274;
const EMPTY_VERSION = "31aefd2bb7264c12d3ec4e072e7394c3";
const EMPTY_DOC = `{"schemaVersion":"0.1","resource":"portfolio","version":"${EMPTY_VERSION}","records":[]}`;
const TWO_RECORD_VERSION = "6d641b6f8c9e8966551f2aed9a277285";

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

/** planned routes of a snapshot under the working-tree Template manifest (= the demo's pinned 1.5.2, asserted in I2) */
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
const goldenDir = await packageOf(repoRoot, DEMO);
const goldenRecord = (await readJson(path.join(goldenDir, "build-record.json"))) as BuildRecord;

console.log("\n[contract] constants");
await check("C1 fixed manifest path, V0 schema versions, an integer producer version", () => {
  eq(MANIFEST_PATH, "/_integration/manifest.json", "manifest path (§3.1)");
  eq([CORE_SCHEMA_VERSION, PORTFOLIO_SCHEMA_VERSION], ["0.1", "0.1"], "schemaVersion (§14 SV1)");
  assert(Number.isInteger(PRODUCER_VERSION) && PRODUCER_VERSION >= 1, "producer version");
  eq(CONSUMER_DECLARED_LIMITS.valuesPerFacet, { category: 50, scope: 150, tag: 150 }, "CH-R10 per-key limits");
  eq([CONSUMER_DECLARED_LIMITS.manifestBytes, CONSUMER_DECLARED_LIMITS.documentBytes, CONSUMER_DECLARED_LIMITS.records], [65536, 1048576, 1000], "CH-R10 sizes");
});
await check("C2 HT7 forbidden characters: C0, DEL, C1, U+2028/2029, bidi controls hit; Korean, ASCII, middle dot, emoji do not", () => {
  for (const c of ["\u0000", "\u0007", "\u001f", "\u007f", "\u0085", "\u009f", " ", " ", "‪", "‮", "⁦", "⁩"]) assert(FORBIDDEN_CHAR_RE.test(`a${c}b`), `U+${c.codePointAt(0)!.toString(16)} must be forbidden`);
  for (const s of ["주방·팬트리", "full-remodel", "34평 아파트 (공급)", "\u{1F600}", "\t".trim(), "café"]) assert(!FORBIDDEN_CHAR_RE.test(s), `${JSON.stringify(s)} must be allowed`);
});
await check("C3 code point order: U+FF5E sorts before U+1F600 (UTF-16 code unit order says the opposite)", () => {
  assert(compareCodePoints("～", "\u{1f600}") < 0 && "～" > "\u{1f600}", "code point ≠ code unit order");
  eq(["b", "a", "가", "A", "ab"].sort(compareCodePoints), ["A", "a", "ab", "b", "가"], "ascending");
});

console.log("\n[emitter] pure projection of the demo's real site data (02 §21 golden)");
await check(`E1 demo → version ${DEMO_VERSION}, document ${DEMO_DOC_BYTES} B, manifest ${DEMO_MANIFEST_BYTES} B, 8 records, facets category 4 · scope 20 · tag 8, listingUrl /portfolio (02 §21.1)`, () => {
  const e = demoEmission;
  eq(e.portfolio!.version, DEMO_VERSION, "version");
  eq([e.portfolio!.file.bytes.length, e.manifestFile.bytes.length], [DEMO_DOC_BYTES, DEMO_MANIFEST_BYTES], "bytes");
  eq([e.portfolio!.recordCount, e.portfolio!.facetCounts], [8, { category: 4, scope: 20, tag: 8 }], "counts");
  eq(e.portfolio!.document.listingUrl, "/portfolio", "listingUrl");
  eq(e.manifest, {
    schemaVersion: "0.1",
    site: { id: DEMO, publicOrigin: "https://interior-demo.boostweb.co.kr", locale: "ko-KR" },
    resources: { portfolio: { href: `/_integration/portfolio.${DEMO_VERSION}.json`, version: DEMO_VERSION } },
  }, "manifest (02 §5 key order)");
  eq(Object.keys(e.portfolio!.document), ["schemaVersion", "resource", "version", "listingUrl", "facets", "records"], "document key order (02 §6)");
  eq(e.files.map((f) => f.path), ["_integration/manifest.json", `_integration/portfolio.${DEMO_VERSION}.json`], "files");
});
await check("E2 same snapshot → byte-identical emission (INV-1); the 02 §21.2 two-record example and §21.3 empty document reproduce", () => {
  const a = emitFor(demo.snapshot);
  const b = emitFor(demo.snapshot);
  eq(a.files.map((f) => f.sha256), b.files.map((f) => f.sha256), "twice");
  const two = clone(demo.snapshot);
  two.content.projects = two.content.projects.filter((p) => p.id === "bi-01" || p.id === "bi-04");
  eq(emitFor(two).portfolio!.version, TWO_RECORD_VERSION, "§21.2");
  const empty = clone(demo.snapshot);
  empty.content.projects = [];
  const ee = emitFor(empty);
  eq(ee.portfolio!.file.text, EMPTY_DOC, "§21.3 exact bytes");
  eq([ee.portfolio!.document.listingUrl, ee.portfolio!.document.facets], [undefined, undefined], "no listingUrl / facets with zero records");
  eq(ee.manifest.resources.portfolio!.version, EMPTY_VERSION, "manifest version of the empty resource");
});
await check("E3 records by id code point, facet values by id code point, a record's scope/tag in authored order (§6.1)", () => {
  const d = demoEmission.portfolio!.document;
  eq(d.records.map((r) => r.id), [...d.records.map((r) => r.id)].sort(compareCodePoints), "record order");
  for (const [k, f] of Object.entries(d.facets!)) eq(f.values.map((v) => v.id), [...f.values.map((v) => v.id)].sort(compareCodePoints), `facet ${k} order`);
  const bi01 = d.records.find((r) => r.id === "bi-01")!;
  const src = demo.snapshot.content.projects.find((p) => p.id === "bi-01")!;
  eq(bi01.facets!.scope, src.scope, "scope authored order");
  eq(bi01.facets!.tag, src.keywords, "tag authored order");
  eq(bi01.facets!.category, [src.category], "category exactly one");
  eq(Object.keys(bi01), ["id", "title", "detailUrl", "publishedAt", "location", "area", "pricePerArea", "facets"], "record key order (02 §6)");
});
await check("E4 missing → omitted: records without a price have no pricePerArea key; no null / \"\" / {} / [] anywhere (MD1–MD3, INV-9)", () => {
  const d = demoEmission.portfolio!.document;
  for (const id of ["bi-04", "bi-06"]) assert(!("pricePerArea" in d.records.find((r) => r.id === id)!), `${id} must have no pricePerArea key`);
  assert(d.records.filter((r) => r.pricePerArea).length === 6, "6 priced records as authored");
  const hits: string[] = [];
  deepScan(demoEmission.portfolio!.document, "", hits);
  deepScan(demoEmission.manifest, "manifest", hits);
  eq(hits, [], "no empty value");
  assert(!demoEmission.portfolio!.file.text.includes("null") && !demoEmission.portfolio!.file.text.includes('"unknown"'), "no null / unknown literal in the bytes");
});
await check("E5 area: value/unit as authored (no conversion), basis supply as stored on every demo record; unknown/absent basis → no key; exclusive stays exclusive (AR2/AR3)", () => {
  for (const r of demoEmission.portfolio!.document.records) {
    const src = demo.snapshot.content.projects.find((p) => p.id === r.id)!;
    eq(r.area, { value: src.area!.value, unit: src.area!.unit, basis: "supply" }, `${r.id} area`);
    if (src.pricePerArea) eq(r.pricePerArea, { amount: src.pricePerArea.amount, currency: src.pricePerArea.currency, perUnit: src.pricePerArea.unit }, `${r.id} price`);
  }
  const s = clone(demo.snapshot);
  s.content.projects[0]!.area = { value: 84.5, unit: "m2", basis: "unknown" };
  s.content.projects[1]!.area = { value: 24, unit: "pyeong" };
  s.content.projects[2]!.area = { value: 59, unit: "m2", basis: "exclusive" };
  const d = emitFor(s).portfolio!.document;
  eq(d.records[0]!.area, { value: 84.5, unit: "m2" }, "unknown → omitted");
  eq(d.records[1]!.area, { value: 24, unit: "pyeong" }, "absent → omitted");
  eq(d.records[2]!.area, { value: 59, unit: "m2", basis: "exclusive" }, "exclusive kept");
  assert(!JSON.stringify(d).includes("totalCost"), "no total cost (PR5)");
});
await check("E6 allowlist: no summary / body / gallery / quote / slug / status / builtYear / period / duration key or text (INV-7, SE2)", () => {
  const text = demoEmission.portfolio!.file.text;
  for (const key of ["summary", "body", "galleryGroups", "customerQuote", "cover", "slug", "status", "builtYear", "period", "durationWeeks", "keywords", "attribution", "style", "propertyType", "totalCost"]) {
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
  stripped.records = (stripped.records as Record<string, unknown>[]).map((r) => {
    const { facets: _f, ...rest } = r;
    return rest;
  });
  walk(stripped);
  const allow = new Set(["schemaVersion", "resource", "version", "listingUrl", "records", "id", "title", "detailUrl", "publishedAt", "location", "area", "value", "unit", "basis", "pricePerArea", "amount", "currency", "perUnit"]);
  eq([...keys].filter((k) => !allow.has(k)), [], "keys outside the allowlist");
});
await check("E7 version changes with every projected fact and with a record added/removed; stays for anything outside the projection (INV-2, RV2)", () => {
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
    ["scope", (s) => void s.content.projects[p()]!.scope!.push("옥상")],
    ["keywords", (s) => void s.content.projects[p()]!.keywords!.push("신규")],
    ["location", (s) => void (s.content.projects[p()]!.location = "서울")],
    ["publishedAt", (s) => void (s.content.projects[p()]!.publishedAt = "2026-08-28T10:00:00+09:00")],
    ["category label", (s) => void (s.content.categories[0]!.name += " ")],
    ["category id", (s) => void ((s.content.categories.find((c) => c.id === "full-remodel")!.id = "full-remodel-2"), s.content.projects.filter((x) => x.category === "full-remodel").forEach((x) => void (x.category = "full-remodel-2")))],
    ["slug (detailUrl)", (s) => void (s.content.projects[p()]!.slug = "other-slug")],
    ["record removed", (s) => void s.content.projects.pop()],
    ["record added", (s) => void s.content.projects.push({ ...clone(s.content.projects[0]!), id: "bi-09", slug: "bi-09-slug" })],
  ];
  for (const [what, f] of changes) assert(vary(f) !== base, `${what}: version must change`);
  const neutral: [string, (s: SiteSnapshot) => void][] = [
    ["summary", (s) => void (s.content.projects[p()]!.summary = "다른 요약")],
    ["body", (s) => void (s.content.projects[p()]!.body = ["다른 본문"])],
    ["galleryGroups", (s) => void delete s.content.projects[p()]!.galleryGroups],
    ["customerQuote", (s) => void delete s.content.projects[p()]!.customerQuote],
    ["cover alt", (s) => void (s.content.projects[p()]!.cover.alt = "x")],
    ["builtYear / period / durationWeeks", (s) => void ((s.content.projects[p()]!.builtYear = 1999), (s.content.projects[p()]!.durationWeeks = 1), delete s.content.projects[p()]!.period)],
    ["settings", (s) => void (s.settings.overrides["home.projects-a"] = { limit: 2, selection: { mode: "latest" } })],
    ["theme", (s) => void (s.theme = s.theme ? { ...s.theme, tokens: { ...s.theme.tokens, "color-accent": "#123456" } } : undefined)],
    ["slots", (s) => void delete s.slots],
    ["banners / reviews", (s) => void (delete s.content.banners, delete s.content.reviews)],
    ["business", (s) => void (s.content.business.summary = "x")],
    ["assets", (s) => void (s.assets = [])],
    ["brandName / logo", (s) => void ((s.site.identity.brandName = "x"), delete s.site.identity.logo)],
    ["record order in the snapshot", (s) => void s.content.projects.reverse()],
  ];
  for (const [what, f] of neutral) eq(vary(f), base, `${what}: version must not change`);
});
await check("E8 a record's facet array keeps authored order and drops repeats (first occurrence) — INV-14; the declared values are unique", () => {
  const s = clone(demo.snapshot);
  s.content.projects[0]!.scope = ["주방", "거실", "주방", "욕실", "거실"];
  s.content.projects[0]!.keywords = ["화이트", "화이트"];
  const d = emitFor(s).portfolio!.document;
  eq(d.records[0]!.facets!.scope, ["주방", "거실", "욕실"], "scope dedupe");
  eq(d.records[0]!.facets!.tag, ["화이트"], "tag dedupe");
  eq(new Set(d.facets!.scope!.values.map((v) => v.id)).size, d.facets!.scope!.values.length, "unique declared");
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

console.log("\n[validator] fail closed");
await check("V1 the demo emission validates: 0 errors, 0 warnings; the fixtures' emissions too (fixture-large: 173 records, scope within CH-R10 limits)", async () => {
  eq(validateFor(demoEmission, demo.snapshot), { errors: [], warnings: [] }, "demo");
  for (const s of FIXTURES) {
    const inp = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: AT });
    const e = emitFor(inp.snapshot);
    eq(validateFor(e, inp.snapshot).errors, [], s);
    eq(e.portfolio!.recordCount, inp.snapshot.content.projects.length, `${s} records`);
  }
});
const err = (f: (x: IntegrationEmission) => void, re: RegExp, opts?: { keepVersion?: boolean }) => {
  const r = validateFor(remake(demoEmission, f, opts), demo.snapshot);
  assert(r.errors.some((m) => re.test(m)), `expected an error matching ${re}, got:\n${r.errors.join("\n") || "(none)"}`);
};
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
await check("V5 null · empty string · empty object · empty facet array · placeholder \"unknown\" basis → rejected (MD1–MD3, AR2)", () => {
  err((x) => void ((x.portfolio!.document.records[0] as any).location = null), /null is never emitted/);
  err((x) => void (x.portfolio!.document.records[0]!.location = ""), /empty string/);
  err((x) => void ((x.portfolio!.document.records[0] as any).area = {}), /empty object/);
  err((x) => void (x.portfolio!.document.records[0]!.facets!.scope = []), /empty array/);
  err((x) => void (x.portfolio!.document.records[0]!.area!.basis = "unknown"), /basis/);
  err((x) => void ((x.portfolio!.document.records[0] as any).pricePerArea = { amount: 0, currency: "KRW", perUnit: "pyeong" }), /amount/);
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
  err((x) => void x.portfolio!.document.records[0]!.facets!.scope!.push("옥상"), /is not declared \(VO1\)/);
  err((x) => void x.portfolio!.document.facets!.scope!.values.push({ id: "힣", label: "힣" }), /declared but no record uses it/);
  err((x) => void x.portfolio!.document.facets!.scope!.values.reverse(), /not in id code point order/);
  err((x) => void x.portfolio!.document.records[0]!.facets!.scope!.push("거실"), /repeats a value \(INV-14\)/);
});
await check("V9 shapes: 3 decimals, negative, bad unit, lowercase currency, an extra key (totalCost), an unknown top-level key, a bad facet key → rejected (§7, §9, §10)", () => {
  err((x) => void (x.portfolio!.document.records[0]!.area!.value = 34.123), /fraction digits/);
  err((x) => void (x.portfolio!.document.records[0]!.area!.value = -1), /area/);
  err((x) => void (x.portfolio!.document.records[0]!.area!.unit = "py"), /unit/);
  err((x) => void (x.portfolio!.document.records[0]!.pricePerArea!.currency = "krw"), /currency/);
  err((x) => void ((x.portfolio!.document.records[0] as any).totalCost = 98600000), /totalCost|Unrecognized/);
  err((x) => void ((x.portfolio!.document as any).generatedAt = "2026-09-22"), /generatedAt|Unrecognized/);
  err((x) => void ((x.manifest as any).recordCount = 8), /recordCount|Unrecognized/);
  err((x) => void (x.portfolio!.document.facets!["Bad Key"] = x.portfolio!.document.facets!.tag!), /Bad Key|facets/);
  err((x) => void (x.portfolio!.document.records[0]!.title = "x".repeat(121)), /title/);
  err((x) => void ((x.portfolio!.document as any).schemaVersion = "1.0"), /schemaVersion/);
});
await check("V10 zero records with a listingUrl or facets → rejected (§7.2, VO1)", () => {
  err((x) => void (x.portfolio!.document.records = []), /listingUrl present with zero records|facets present with zero records/);
});
await check("V11 consumer-declared limits are warnings, never errors and never truncation (VO6, CH-R10)", () => {
  const s = clone(demo.snapshot);
  const many = Array.from({ length: 151 }, (_, i) => `공간${i}`);
  s.content.projects[0]!.scope = many.slice(0, 20);
  for (let i = 1; i < 8; i++) s.content.projects[i]!.scope = many.slice(i * 19, i * 19 + 20);
  const e = emitFor(s);
  const r = validateFor(e, s);
  eq(r.errors, [], "no error");
  assert(r.warnings.some((w) => /facet "scope" has \d+ values, above the consumer-declared limit 150/.test(w)), `warning expected: ${r.warnings.join(" | ")}`);
  assert(e.portfolio!.facetCounts.scope! > 150, "not truncated");
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
await check("B2 the demo is ON: emit true, integrationInputHash = hash(producer, contract, config), buildInputId = the golden package ≠ the live package", async () => {
  const cfg = await loadIntegrationConfig(repoRoot, DEMO);
  eq(cfg, { schemaVersion: 1, firstPartyData: { enabled: true } }, "config");
  eq(demo.integration.emit, true, "emit");
  const src = await producerSources();
  eq(src.files.map((f) => f.path), [...PRODUCER_SOURCE_FILES], "producer source files");
  for (const f of src.files) eq(f.sha256, sha256(await readFile(path.join(repoRoot, "platform", f.path))), `${f.path} hashed from the platform tree`);
  eq(demo.integration.producerSourceHash, src.hash, "producer source hash");
  eq(demo.parts.integrationInputHash, hashJson({ producer: PRODUCER_VERSION, producerSourceHash: src.hash, contract: { core: "0.1", portfolio: "0.1" }, config: cfg }), "input hash");
  assert(hashJson({ producer: PRODUCER_VERSION, producerSourceHash: "0".repeat(64), contract: { core: "0.1", portfolio: "0.1" }, config: cfg }) !== demo.parts.integrationInputHash, "a changed producer source → a different build identity (MAJOR-1)");
  eq(demo.buildInputId, goldenRecord.buildInputId, "golden identity");
  assert(demo.buildInputId !== LIVE_BUILD_INPUT_ID, "≠ live");
  eq(computeBuildInputId({ ...demo.parts, integrationInputHash: undefined }), LIVE_BUILD_INPUT_ID, "without the integration part = the live package's identity");
});
await check("B3 preview never emits (SE5): the demo in preview mode has no integration part", async () => {
  const p = await prepareSiteInput({ repoRoot, siteId: DEMO, mode: "preview", at: AT });
  eq([p.integration.emit, p.integration.producerSourceHash, p.parts.integrationInputHash], [false, undefined, undefined], "preview");
  eq(integrationEmits({ schemaVersion: 1, firstPartyData: { enabled: true } }, "preview"), false, "helper");
  eq(integrationEmits({ schemaVersion: 1, firstPartyData: { enabled: false } }, "public"), false, "disabled");
  eq(integrationEmits(undefined, "public"), false, "absent");
});
await check("B4 OFF = the pre-integration identity: the demo without integration.json (or enabled:false) has exactly the LIVE package's buildInputId", async () => {
  for (const variant of ["absent", "disabled"] as const) {
    const root = await throwawayRoot(DEMO, async (dir) => {
      if (variant === "absent") await rm(path.join(dir, "integration.json"));
      else await writeFile(path.join(dir, "integration.json"), `${JSON.stringify({ schemaVersion: 1, firstPartyData: { enabled: false } })}\n`);
    });
    try {
      const inp = await prepareSiteInput({ repoRoot: root, siteId: DEMO, mode: "public", at: AT });
      eq(inp.buildInputId, LIVE_BUILD_INPUT_ID, `${variant}: identity`);
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
    eq(emitFor(inp.snapshot).portfolio!.version, DEMO_VERSION, "resource version unchanged (RV2)");
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

console.log("\n[golden] the demo's current package (data/site-builds)");
await check("G1 the package holds exactly the two emitted files, byte-identical to the pure emission; the build record's integration summary matches", async () => {
  const files = (await readdir(path.join(goldenDir, "site", INTEGRATION_DIR))).sort();
  eq(files, ["manifest.json", `portfolio.${DEMO_VERSION}.json`], "files");
  for (const f of demoEmission.files) eq(sha256(await readFile(path.join(goldenDir, "site", f.path))), f.sha256, f.path);
  const i = goldenRecord.integration!;
  eq([i.contract, i.producerVersion, i.warnings], [{ core: "0.1", portfolio: "0.1" }, PRODUCER_VERSION, []], "record contract");
  eq(i.producerSourceHash, (await producerSources()).hash, "record producer source hash = the working tree's producer files");
  assert(i.resources.portfolio, "portfolio offered");
  eq([i.manifest.path, i.manifest.bytes, i.manifest.sha256], [demoEmission.manifestFile.path, DEMO_MANIFEST_BYTES, demoEmission.manifestFile.sha256], "record manifest");
  eq([i.resources.portfolio.path, i.resources.portfolio!.version, i.resources.portfolio.bytes, i.resources.portfolio.records, i.resources.portfolio.facets], [demoEmission.portfolio!.file.path, DEMO_VERSION, DEMO_DOC_BYTES, 8, { category: 4, scope: 20, tag: 8 }], "record portfolio");
  eq(goldenRecord.parts.integrationInputHash, demo.parts.integrationInputHash, "record parts");
  assert(goldenRecord.qa.pass && goldenRecord.qa.files === 158, `qa ${goldenRecord.qa.files}`);
  assert(await packageIntact(goldenDir), "golden package intact");
});
await check("G2 manifest pointer = file name = document version (INV-3); the manifest origin = site.json; the runtime resolves both URLs", async () => {
  const manifest = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, "manifest.json"));
  const doc = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${DEMO_VERSION}.json`));
  eq(manifest.resources.portfolio, { href: `/_integration/portfolio.${DEMO_VERSION}.json`, version: DEMO_VERSION }, "pointer");
  eq(doc.version, DEMO_VERSION, "echo");
  eq(manifest.site.publicOrigin, (await readJson(path.join(repoRoot, "data/sites", DEMO, "site.json"))).identity.publicOrigin, "origin");
  eq(resolvePath(MANIFEST_PATH), { kind: "key", key: "_integration/manifest.json" }, "manifest key");
  eq(resolvePath(manifest.resources.portfolio.href), { kind: "key", key: `_integration/portfolio.${DEMO_VERSION}.json` }, "document key");
  eq(resolvePath(`${MANIFEST_PATH}/`).kind, "not-found", "trailing slash = 404 (HT8)");
});
await check("G3 every detailUrl and the listingUrl have an HTML page in the package (INV-5); no absolute URL or external host in the document (INV-6)", async () => {
  const doc = await readJson(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${DEMO_VERSION}.json`));
  const html = (p: string) => path.join(goldenDir, "site", `${p.replace(/^\//, "")}.html`);
  assert(await exists(html(doc.listingUrl)), "listing page");
  for (const r of doc.records) assert(await exists(html(r.detailUrl)), `${r.id} detail page`);
  const text = await readFile(path.join(goldenDir, "site", INTEGRATION_DIR, `portfolio.${DEMO_VERSION}.json`), "utf8");
  assert(!/https?:\/\//.test(text) && !text.includes("//"), "no absolute / protocol-relative URL");
});
await check(`G4 the live package ${LIVE_BUILD_INPUT_ID.slice(0, 12)}… is untouched (intact, packageHash ${LIVE_PACKAGE_HASH.slice(0, 12)}…) and is the rollback (previous.json)`, async () => {
  const liveDir = path.join(repoRoot, "data/site-builds", DEMO, "packages", LIVE_BUILD_INPUT_ID);
  const rec = await readJson(path.join(liveDir, "build-record.json"));
  eq(rec.packageHash, LIVE_PACKAGE_HASH, "recorded hash");
  assert(await packageIntact(liveDir), "live package bytes still hash to the recorded packageHash");
  eq((await readJson(path.join(repoRoot, "data/site-builds", DEMO, "previous.json"))).buildInputId, LIVE_BUILD_INPUT_ID, "previous pointer");
  assert(!(await exists(path.join(liveDir, "site", INTEGRATION_DIR))), "live package has no _integration/");
});
await check("G5 golden = live + exactly the two integration files: every other file byte-identical once the build id (Next's generateBuildId = buildInputId[0:32], embedded in HTML/RSC and the _next/static/<id>/ path) is canonicalised", async () => {
  const liveDir = path.join(repoRoot, "data/site-builds", DEMO, "packages", LIVE_BUILD_INPUT_ID, "site");
  const newDir = path.join(goldenDir, "site");
  const oldId = LIVE_BUILD_INPUT_ID.slice(0, 32);
  const newId = goldenRecord.buildInputId.slice(0, 32);
  const live = new Map<string, Buffer>();
  for (const f of await walkFiles(liveDir)) live.set(f.replaceAll(oldId, newId), Buffer.from((await readFile(path.join(liveDir, f))).toString("latin1").replaceAll(oldId, newId), "latin1"));
  const fresh = new Map<string, Buffer>();
  for (const f of await walkFiles(newDir)) fresh.set(f, await readFile(path.join(newDir, f)));
  const added = [...fresh.keys()].filter((k) => !live.has(k)).sort();
  const removed = [...live.keys()].filter((k) => !fresh.has(k));
  const changed = [...fresh.keys()].filter((k) => live.has(k) && !fresh.get(k)!.equals(live.get(k)!));
  eq(added, [`${INTEGRATION_DIR}/manifest.json`, `${INTEGRATION_DIR}/portfolio.${DEMO_VERSION}.json`], "added");
  eq([removed, changed], [[], []], "removed / changed");
  eq([live.size, fresh.size], [156, 158], "counts");
});

console.log("\n[builds] real site:build on throwaway roots (data/sites + data/site-builds untouched)");
await check("T1 same input → the same package: a rebuild of the demo (copy, same at) reproduces buildInputId, packageHash and the integration bytes (INV-1)", async () => {
  const root = await throwawayRoot(DEMO);
  try {
    const r = await buildSite({ repoRoot: root, siteId: DEMO, at: goldenRecord.at });
    assert(r.status === "built", r.status);
    eq([r.record.buildInputId, r.record.packageHash], [goldenRecord.buildInputId, goldenRecord.packageHash], "identity + bytes");
    for (const f of demoEmission.files) eq(sha256(await readFile(path.join(r.packageDir, "site", f.path))), f.sha256, f.path);
    eq(r.record.integration?.resources.portfolio!.version, DEMO_VERSION, "version");
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
await check("T3 an empty site opted in emits the §21.3 document (records []) and a manifest that still lists the resource", async () => {
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
  const pkgHash = goldenRecord.packageHash;
  const pointer: RoutingPointer = { schemaVersion: 1, hostname: HOST, siteId: DEMO, packageHash: pkgHash, buildInputId: goldenRecord.buildInputId, releaseId: RELEASE_152, publishedAt: "2026-09-22T00:00:00Z" };
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
await check("R2 publish plans the two files as application/json; the manifest revalidates (HT2/HT3); the baked origin equals the manifest origin", async () => {
  const plan = await planPublish({ repoRoot, siteId: DEMO, hostname: "interior-demo.boostweb.co.kr" });
  const m = plan.files.find((f) => f.path === "_integration/manifest.json")!;
  const d = plan.files.find((f) => f.path === `_integration/portfolio.${DEMO_VERSION}.json`)!;
  assert(m && d, "planned");
  eq([m.contentType, m.cacheControl, m.size, m.sha256], ["application/json", CACHE_REVALIDATE, DEMO_MANIFEST_BYTES, demoEmission.manifestFile.sha256], "manifest");
  eq([d.contentType, d.size, d.sha256], ["application/json", DEMO_DOC_BYTES, demoEmission.portfolio!.file.sha256], "document");
  eq([plan.packageHash, plan.files.length, plan.bakedOrigin, plan.manifestOrigin], [goldenRecord.packageHash, 158, demoEmission.manifest.site.publicOrigin, demoEmission.manifest.site.publicOrigin], "plan identity / origins");
  await rejects(() => planPublish({ repoRoot, siteId: DEMO, hostname: "other.example", requireOriginMatch: true }), /integration manifest was built for https:\/\/interior-demo\.boostweb\.co\.kr, not https:\/\/other\.example|package was built for/);
  const local = await planPublish({ repoRoot, siteId: DEMO, hostname: "localhost" });
  assert(local.warnings.some((w) => /integration manifest was built for/.test(w)), "local host → warning only (same policy as the sitemap origin)");
});

console.log("\n[release] Template Release immutability");
await check("I1 every stored release verifies; the demo is pinned to 1.5.2 and that release's hash is unchanged", async () => {
  const dir = path.join(repoRoot, "data/template-releases/interior-01");
  const ids = (await readdir(dir)).filter((d) => !d.startsWith(".")).sort();
  assert(ids.length >= 12 && ids.includes(RELEASE_152), `releases: ${ids.join(", ")}`);
  for (const id of ids) await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", id));
  const site = await readJson(path.join(repoRoot, "data/sites", DEMO, "site.json"));
  eq([site.template.releaseId, site.template.releaseHash], [RELEASE_152, "d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08"], "pin");
});
await check("I2 the working tree still equals the pinned 1.5.2 release (the producer changed no release source); platform/integration and platform/build are not release sources", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", RELEASE_152);
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const files: { path: string; sha256: string }[] = [];
  for (const [p, abs] of sources) files.push({ path: p, sha256: sha256(await readFile(abs)) });
  eq(computeReleaseHash({ ...rel, files }), rel.releaseHash, "working tree = 1.5.2");
  assert(![...sources.keys()].some((k) => k.startsWith("platform/integration/") || k.startsWith("platform/build/")), "not release sources");
  eq(goldenRecord.template.releaseHash, rel.releaseHash, "golden built from 1.5.2");
  eq(stableStringify(goldenRecord.template), stableStringify({ templateId: "interior-01", templateVersion: "1.5.2", releaseId: RELEASE_152, releaseHash: rel.releaseHash, templateSourceHash: rel.templateSourceHash }), "record template");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
