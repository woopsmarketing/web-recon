/**
 * Step 4.1 validation — portfolio filters/search/sort (spec §13 A–Z).
 * Run AFTER the new release is cut, the three fixtures are re-pinned and built:
 *   pnpm test:platform   (slice1 → step4 → this file)
 * Browser behaviour (URL state, back/forward, filtered paging in a real page, non-local
 * requests) is covered by scripts/template-platform-step41-visual-smoke.ts.
 * Throwaway-root builds never touch data/sites or data/site-builds.
 */
import { cp, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContentReader } from "../content/reader";
import type { Project } from "../content/schema";
import {
  activeCriteriaCount,
  AREA_SCALES,
  areaIn,
  buildProjectFilterVocabulary,
  EMPTY_PROJECT_FILTER,
  evaluateProjectFilter,
  isDefaultProjectFilter,
  keywordHaystack,
  normalizeProjectFilter,
  pageOfResults,
  priceIn,
  PROJECT_FILTER_GROUPS,
  toProjectFilterRecord,
  type ProjectFilter,
  type ProjectFilterInput,
  type ProjectFilterRecord,
  type ProjectFilterVocabulary,
} from "../content/project-filter";
import { resolveEffectiveSettings } from "../settings/settings";
import { buildSite } from "../build/site-build";
import { loadRelease, scanTemplateSource, verifyRelease } from "../release/release";
import template from "../../templates/interior-01/v1/template";
import { canonical141 } from "./canonical-141";
import { canonical142 } from "./canonical-142";
import { canonical150Main, canonical150Routes, canonical150Sitemap, withoutIaPages } from "./canonical-150";
import { filterToQuery, queryToFilter } from "../../templates/interior-01/v1/lib/filterQuery";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
/** The Step 4 release every site was pinned to before this step (rollback target). */
const STEP4_RELEASE = { id: "interior-01-1.1.0-512e4dd932b4", hash: "512e4dd932b4e557aaa4278d599c0e2a75703d7c7d3e368169e1ce341cd562e5" };
/** Semver order of "x.y.z" strings (Step 4.1 invariants must hold for 1.2.0 AND every later release). */
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
const exists = async (f: string) => (await stat(f).catch(() => undefined)) !== undefined;
const routeHtml = (p: string) => (p === "/" ? "index.html" : `${p.slice(1)}.html`);
const cardIds = (html: string) => [...html.matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]!);

async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}

// ---------------------------------------------------------------- helpers --
const rec = (id: string, publishedAt: string, extra: Partial<ProjectFilterRecord> = {}): ProjectFilterRecord => ({
  id,
  publishedAt,
  title: id,
  category: "c1",
  ...extra,
});
const day = (n: number) => new Date(Date.UTC(2025, 0, 1) + n * 86_400_000).toISOString();
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
const F = (input: ProjectFilterInput, vocab: ProjectFilterVocabulary): ProjectFilter => normalizeProjectFilter(input, vocab);
const run = (records: readonly ProjectFilterRecord[], input: ProjectFilterInput, vocab: ProjectFilterVocabulary) => ids(evaluateProjectFilter(records, F(input, vocab), vocab));
const vocabOf = (records: readonly ProjectFilterRecord[], opts: Partial<Parameters<typeof buildProjectFilterVocabulary>[1]> = {}) =>
  buildProjectFilterVocabulary(records, {
    groups: [...PROJECT_FILTER_GROUPS],
    categories: [
      { id: "c1", name: "One" },
      { id: "c2", name: "Two" },
      { id: "c3", name: "Three" },
    ],
    areaScale: "m2",
    priceScale: "usd-m2",
    ...opts,
  });

/** Extract the filter island props ({entries, vocabulary, labels, noindexFiltered}) from a built page's flight payload. */
function filterProps(html: string): { entries: (ProjectFilterRecord & Record<string, unknown>)[]; vocabulary: ProjectFilterVocabulary; labels: Record<string, unknown>; noindexFiltered: boolean } | undefined {
  let flight = "";
  for (const m of html.matchAll(/<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    const a = JSON.parse(m[1]!) as [number, string];
    if (a[0] === 1) flight += a[1];
  }
  const start = flight.indexOf('{"entries":[');
  if (start < 0) return undefined;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i]!;
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(flight.slice(start, i + 1));
    }
  }
  throw new Error("unterminated filter props in flight payload");
}

// ------------------------------------------------------------------ units --
console.log("\n[unit] ProjectFilter contract + pure evaluator");
{
  // area: m² values around every m² bucket edge, a pyeong and a sqft record, one missing
  const A = [
    rec("a-59", day(1), { area: { value: 59.99, unit: "m2" } }),
    rec("a-60", day(2), { area: { value: 60, unit: "m2" } }),
    rec("a-89", day(3), { area: { value: 89.99, unit: "m2" } }),
    rec("a-90", day(4), { area: { value: 90, unit: "m2" } }),
    rec("a-py34", day(5), { area: { value: 34, unit: "pyeong" } }), // 112.40 m²
    rec("a-sqft", day(6), { area: { value: 1000, unit: "sqft" } }), // 92.90 m²
    rec("a-none", day(7)),
  ];
  const vA = vocabOf(A);

  await check("E area buckets are half-open [min,max) in the scale unit; units normalized; missing never matches", () => {
    eq(run(A, { area: ["lt60"] }, vA), ["a-59"], "lt60");
    eq(run(A, { area: ["60"] }, vA), ["a-89", "a-60"], "60–90");
    eq(run(A, { area: ["90"] }, vA), ["a-sqft", "a-py34", "a-90"], "90–120 (평 and sq ft converted)");
    assert(!run(A, { area: ["lt60", "60", "90", "120", "150plus"] }, vA).includes("a-none"), "missing area matched");
    // pyeong scale: 66.12 m² = 20.0013평 → 20평대; 66.11 m² = 19.998평 → 20평 미만; 34평 stays 34 (identity, no float trip)
    const P = [rec("p-66-12", day(1), { area: { value: 66.12, unit: "m2" } }), rec("p-66-11", day(2), { area: { value: 66.11, unit: "m2" } }), rec("p-34", day(3), { area: { value: 34, unit: "pyeong" } })];
    const vP = vocabOf(P, { areaScale: "pyeong" });
    eq(run(P, { area: ["20"] }, vP), ["p-66-12"], "20평대");
    eq(run(P, { area: ["lt20"] }, vP), ["p-66-11"], "20평 미만");
    eq(run(P, { area: ["30"] }, vP), ["p-34"], "30평대");
    assert(areaIn({ value: 34, unit: "pyeong" }, "pyeong") === 34, "identity conversion");
    assert(Math.abs(areaIn({ value: 1, unit: "pyeong" }, "m2") - 400 / 121) < 1e-12, "1평 = 400/121 m²");
  });

  const S = [
    rec("s-wood", day(1), { keywords: ["Warm wood"] }),
    rec("s-stone", day(2), { keywords: ["Natural stone", "Terrazzo"] }),
    rec("s-both", day(3), { keywords: ["Warm wood", "Natural stone"] }),
    rec("s-empty", day(4)), // keywords [] → dropped by toProjectFilterRecord; absent here
    rec("s-other", day(5), { keywords: ["Pale oak"] }),
  ];
  const vS = vocabOf(S);
  await check("F style: OR within the dimension; no-keyword records never match; vocabulary by frequency then code point", () => {
    eq(run(S, { style: ["Warm wood"] }, vS), ["s-both", "s-wood"], "one style");
    eq(run(S, { style: ["Warm wood", "Terrazzo"] }, vS), ["s-both", "s-stone", "s-wood"], "wood OR terrazzo");
    assert(!run(S, { style: vS.styles }, vS).includes("s-empty"), "record without keywords matched");
    eq(vS.styles, ["Natural stone", "Warm wood", "Pale oak", "Terrazzo"], "style vocabulary order");
    const p = toProjectFilterRecord({ id: "x", slug: "x", title: "x", status: "published", publishedAt: day(0), category: "c1", cover: { asset: "a" }, keywords: [] } as Project);
    assert(!("keywords" in p), "empty keywords must not reach the index");
  });

  const PR = [
    rec("pr-1499", day(1), { pricePerArea: { amount: 1499.99, currency: "USD", unit: "m2" } }),
    rec("pr-1500", day(2), { pricePerArea: { amount: 1500, currency: "USD", unit: "m2" } }),
    rec("pr-sqft", day(3), { pricePerArea: { amount: 200, currency: "USD", unit: "sqft" } }), // 2152.78 / m²
    rec("pr-eur", day(4), { pricePerArea: { amount: 1600, currency: "EUR", unit: "m2" } }),
    rec("pr-none", day(5)),
    rec("pr-3000", day(6), { pricePerArea: { amount: 3000, currency: "USD", unit: "m2" } }),
  ];
  const vPR = vocabOf(PR);
  await check("G price: derived buckets [min,max), per-unit conversion, missing / other currency never match", () => {
    eq(run(PR, { price: ["lt1500"] }, vPR), ["pr-1499"], "< 1500");
    eq(run(PR, { price: ["1500"] }, vPR), ["pr-1500"], "1500–2000");
    eq(run(PR, { price: ["2000"] }, vPR), ["pr-sqft"], "sqft converted to per m²");
    eq(run(PR, { price: ["3000plus"] }, vPR), ["pr-3000"], "open upper bound");
    const all = run(PR, { price: vPR.price!.buckets.map((b) => b.id) }, vPR);
    assert(!all.includes("pr-eur") && !all.includes("pr-none"), `EUR / missing matched: ${all}`);
    assert(priceIn({ amount: 1600, currency: "EUR", unit: "m2" }, "USD", "m2") === undefined, "no FX conversion");
    const krw = priceIn({ amount: 1_000_000, currency: "KRW", unit: "m2" }, "KRW", "pyeong")!;
    assert(Math.abs(krw - 1_000_000 * (400 / 121)) < 1e-6, `per m² → per 평 ${krw}`);
    const none = vocabOf(PR, { priceScale: "none" });
    assert(!none.groups.includes("price") && !none.sorts.includes("price-asc") && none.price === undefined, "priceScale none → no price filter/sort");
    eq(F({ price: ["1500"] }, none).price, [], "price value dropped without a scale");
  });

  const T = [rec("t-1", day(1), { category: "c1" }), rec("t-2", day(2), { category: "c2" }), rec("t-3", day(3), { category: "c3" })];
  const vT = vocabOf(T);
  await check("H type (existing category taxonomy) filter: OR over category ids; SERVICE ontology deferred", () => {
    eq(run(T, { type: ["c1", "c3"] }, vT), ["t-3", "t-1"], "c1 OR c3");
    eq(vT.types, [{ id: "c1", label: "One" }, { id: "c2", label: "Two" }, { id: "c3", label: "Three" }], "types in taxonomy order");
    const unused = buildProjectFilterVocabulary([T[0]!], { groups: ["type"], categories: [{ id: "c1", name: "One" }, { id: "c9", name: "Unused" }], areaScale: "m2", priceScale: "none" });
    eq(unused.types.map((t) => t.id), ["c1"], "category without served projects is not offered");
    assert(!(PROJECT_FILTER_GROUPS as readonly string[]).includes("service"), "no invented service dimension");
  });

  const K = [
    rec("k-title", day(1), { title: "Quarry Hill Kitchen" }),
    rec("k-loc", day(2), { title: "A", location: "Linden   Park" }),
    rec("k-scope", day(3), { title: "B", scope: ["Dressing room", "Entry"] }),
    rec("k-kw", day(4), { title: "C", keywords: ["Warm wood"] }),
    rec("k-ko", day(5), { title: "가상시 해안로 34평 아파트", summary: "오래된 아파트 리모델링" }),
    rec("k-body", day(6), { title: "D", summary: "calm" }),
  ];
  const vK = vocabOf(K);
  await check("I keyword finds a project by title (case-insensitive, whitespace-normalized)", () => {
    eq(run(K, { keyword: "  quarry   HILL " }, vK), ["k-title"], "title");
    eq(F({ keyword: "  quarry   HILL " }, vK).keyword, "quarry HILL", "display-normal keyword");
  });
  await check("J keyword finds a project by location", () => {
    eq(run(K, { keyword: "linden park" }, vK), ["k-loc"], "location (stored with repeated spaces)");
  });
  await check("K keyword finds a project by style keyword and by scope; Korean substring; tokens AND, never across fields", () => {
    eq(run(K, { keyword: "wood" }, vK), ["k-kw"], "keyword");
    eq(run(K, { keyword: "dressing" }, vK), ["k-scope"], "scope");
    eq(run(K, { keyword: "해안로 리모델링" }, vK), ["k-ko"], "Korean tokens across title + summary (AND)");
    eq(run(K, { keyword: "34평" }, vK), ["k-ko"], "Korean substring");
    eq(run(K, { keyword: "dressing nothing" }, vK), [], "every token must match");
    assert(!keywordHaystack(K[2]!).includes("room entry"), "fields are separated");
    eq(run(K, { keyword: "roomentry" }, vK), [], "no cross-field match");
  });

  await check("L sort newest = the reader's latest order (publishedAt DESC by instant, id ASC); input order irrelevant; oldest = ASC, id ASC", () => {
    const tie = "2025-06-01T00:00:00Z";
    const set = [rec("n-c", tie), rec("n-a", "2025-06-01T09:00:00+09:00"), rec("n-b", tie), rec("n-z", day(0)), rec("n-new", day(900))];
    const v = vocabOf(set);
    eq(run(set, {}, v), ["n-new", "n-a", "n-b", "n-c", "n-z"], "newest");
    eq(run([...set].reverse(), {}, v), ["n-new", "n-a", "n-b", "n-c", "n-z"], "storage order");
    eq(run(set, { sort: "oldest" }, v), ["n-z", "n-a", "n-b", "n-c", "n-new"], "oldest");
    const projects = set.map((r) => ({ ...r, slug: r.id, status: "published", cover: { asset: "a" } }) as Project);
    const reader = createContentReader({ business: {}, categories: [], projects });
    eq(ids(reader.list({ type: "projects", selection: { mode: "latest" }, limit: 99 }).items), run(set, {}, v), "same order as ContentReader latest");
  });

  await check("M area/price sorts: missing values LAST in both directions, ties by the default order", () => {
    const set = [
      rec("m-none-new", day(9)),
      rec("m-100", day(1), { area: { value: 100, unit: "m2" }, pricePerArea: { amount: 2000, currency: "USD", unit: "m2" } }),
      rec("m-100b", day(2), { area: { value: 100, unit: "m2" }, pricePerArea: { amount: 2000, currency: "USD", unit: "m2" } }),
      rec("m-50", day(3), { area: { value: 50, unit: "m2" }, pricePerArea: { amount: 1000, currency: "USD", unit: "m2" } }),
      rec("m-py", day(4), { area: { value: 40, unit: "pyeong" }, pricePerArea: { amount: 1600, currency: "EUR", unit: "m2" } }), // 132 m², EUR = no comparable price
      rec("m-none-old", day(0)),
    ];
    const v = vocabOf(set);
    eq(run(set, { sort: "area-desc" }, v), ["m-py", "m-100b", "m-100", "m-50", "m-none-new", "m-none-old"], "area-desc");
    eq(run(set, { sort: "area-asc" }, v), ["m-50", "m-100b", "m-100", "m-py", "m-none-new", "m-none-old"], "area-asc");
    eq(run(set, { sort: "price-desc" }, v), ["m-100b", "m-100", "m-50", "m-none-new", "m-py", "m-none-old"], "price-desc (EUR last)");
    eq(run(set, { sort: "price-asc" }, v), ["m-50", "m-100b", "m-100", "m-none-new", "m-py", "m-none-old"], "price-asc (EUR last)");
  });

  const N = [
    rec("n1", day(1), { category: "c1", keywords: ["Warm wood"], area: { value: 70, unit: "m2" } }),
    rec("n2", day(2), { category: "c1", keywords: ["Terrazzo"], area: { value: 100, unit: "m2" } }),
    rec("n3", day(3), { category: "c2", keywords: ["Warm wood"], area: { value: 75, unit: "m2" } }),
    rec("n4", day(4), { category: "c1", keywords: ["Warm wood", "Terrazzo"], area: { value: 65, unit: "m2" } }),
    rec("n5", day(5), { category: "c2", area: { value: 62, unit: "m2" } }),
  ];
  const vN = vocabOf(N);
  await check("N OR within one dimension, AND across dimensions", () => {
    eq(run(N, { style: ["Warm wood", "Terrazzo"] }, vN), ["n4", "n3", "n2", "n1"], "style OR");
    eq(run(N, { style: ["Warm wood"], area: ["60"] }, vN), ["n4", "n3", "n1"], "style AND area");
    eq(run(N, { style: ["Warm wood"], area: ["60"], type: ["c1"] }, vN), ["n4", "n1"], "… AND type");
    eq(run(N, { area: ["60", "90"], type: ["c2"] }, vN), ["n5", "n3"], "area OR, AND type");
  });
  await check("O combined filters (type + area + style + price + keyword + sort)", () => {
    const set = N.map((r, i) => ({ ...r, location: i % 2 ? "Linden Park" : "Aster Bay", pricePerArea: { amount: 1500 + i * 400, currency: "USD", unit: "m2" as const } }));
    const v = vocabOf(set);
    eq(run(set, { type: ["c1"], area: ["60"], style: ["Warm wood"], price: ["1500", "2000"], keyword: "aster", sort: "price-desc" }, v), ["n1"], "all dimensions");
    eq(run(set, { type: ["c1"], style: ["Warm wood", "Terrazzo"], sort: "area-asc" }, v), ["n4", "n1", "n2"], "type + style, area-asc");
  });
  await check("P zero result is an honest empty list (valid filter, no match)", () => {
    eq(run(N, { type: ["c2"], style: ["Terrazzo"] }, vN), [], "c2 AND Terrazzo");
    const page = pageOfResults([], 3, 30);
    assert(page.total === 0 && page.items.length === 0 && page.pageCount === 1 && page.page === 1, JSON.stringify(page));
  });
  await check("Q reset: the empty filter is the default view and returns every record in the default order", () => {
    const f = F({}, vN);
    assert(isDefaultProjectFilter(f) && activeCriteriaCount(f) === 0, "empty filter");
    eq(ids(evaluateProjectFilter(N, EMPTY_PROJECT_FILTER, vN)), ["n5", "n4", "n3", "n2", "n1"], "all records");
    assert(!isDefaultProjectFilter(F({ sort: "oldest" }, vN)) && activeCriteriaCount(F({ sort: "oldest" }, vN)) === 0, "sort alone is a non-default view, not a criterion");
  });

  await check("normalize: closed vocabulary (unknown/unavailable dropped), deduped, canonical order, idempotent", () => {
    const f = F({ style: ["Terrazzo", "Warm wood", "Terrazzo", "Nope"], area: ["90", "60", "x"], type: ["c9"], price: ["lt1500"], sort: "popular" }, vN);
    eq(f, { keyword: "", type: [], area: ["60", "90"], style: ["Warm wood", "Terrazzo"], price: [], sort: "newest" }, "normalized");
    eq(F(f, vN), f, "idempotent");
    const off = normalizeProjectFilter({ keyword: "x", style: ["Warm wood"] }, { ...vN, groups: ["type"] });
    assert(off.keyword === "" && off.style.length === 0, "values of disabled groups are dropped");
    assert(F({ keyword: "x".repeat(500) }, vN).keyword.length === 80, "keyword length cap");
    assert(F({ sort: "popular" }, vN).sort === "newest" && !vN.sorts.includes("popular" as never), "no popularity sort exists");
  });

  await check("URL codec: template-owned params, repeated keys, sort/fp omitted at default, round-trip incl. Korean", () => {
    const set = [rec("u1", day(1), { keywords: ["원목 마감", "a,b"], area: { value: 70, unit: "m2" } })];
    const v = vocabOf(set);
    const f = F({ keyword: "서울 34평", style: ["원목 마감", "a,b"], area: ["60"], sort: "area-desc" }, v);
    const q = filterToQuery(f, 2);
    // style values in vocabulary order (frequency, then code point): "a,b" < "원목 마감"
    assert(/^keyword=[^&]+&area=60&style=a%2Cb&style=[^&]+&sort=area-desc&fp=2$/.test(q), q);
    eq(queryToFilter(new URLSearchParams(q), v), { filter: f, page: 2 }, "round trip");
    assert(filterToQuery(f, 1).indexOf("fp=") === -1, "fp=1 is never written");
    assert(filterToQuery(EMPTY_PROJECT_FILTER, 3) === "", "default view has no query (and no fp)");
    eq(queryToFilter(new URLSearchParams("fp=4"), v), { filter: F({}, v), page: 1 }, "fp without a filter is ignored");
    eq(queryToFilter(new URLSearchParams("area=60&fp=0"), v).page, 1, "fp=0 → 1");
    for (const bad of ["spaceSizes", "styleTypes", "sortType", "prices", "page"]) assert(!q.includes(`${bad}=`), `source param ${bad}`);
  });

  await check("vocabulary lists only options with ≥ 1 record; groups without options are hidden", () => {
    const set = [rec("v1", day(1), { area: { value: 70, unit: "m2" } }), rec("v2", day(2), { area: { value: 200, unit: "m2" } })];
    const v = vocabOf(set);
    eq(v.area!.buckets.map((b) => b.id), ["60", "150plus"], "non-empty area buckets");
    assert(!v.groups.includes("style") && !v.groups.includes("price") && v.groups.includes("keyword"), `groups ${v.groups}`);
    eq(v.sorts, ["newest", "oldest", "area-desc", "area-asc"], "sorts need data");
    assert(AREA_SCALES.m2.buckets.every((b) => !/[<>]\d|\d{3,}\s*-\s*1/.test(b.id)), "clean ids (no source upper-bound encoding)");
  });
}

// ------------------------------------------------------------ static code --
console.log("\n[static] filter rules live outside React; gate; settings");
const templateRoot = path.join(repoRoot, "templates/interior-01/v1");
const templateFiles = (await walkFiles(templateRoot)).filter((f) => !/^(node_modules|\.next|out)\//.test(f));
await check("Z the UI uses the shared contract/evaluator; no filtering/sorting rule is re-implemented in template code", async () => {
  const browser = await readFile(path.join(templateRoot, "components/PortfolioBrowser.tsx"), "utf8");
  const imports = /import \{([^}]*)\} from "@platform\/content\/project-filter"/.exec(browser)?.[1] ?? "";
  for (const name of ["evaluateProjectFilter", "normalizeProjectFilter", "pageOfResults", "isDefaultProjectFilter"]) {
    assert(imports.includes(name) && browser.split(name).length > 2, `PortfolioBrowser does not import + use ${name}`);
  }
  for (const f of templateFiles.filter((x) => /\.(ts|tsx)$/.test(x))) {
    const text = await readFile(path.join(templateRoot, f), "utf8");
    const rules = [/\.sort\(/, /toLowerCase\(/, /\binBucket\b/, /\bareaIn\b/, /\bpriceIn\b/, /\.publishedAt\b/, /\.pricePerArea\b/, /\.keywords\b/, /Date\.parse/];
    const allowed: Record<string, RegExp[]> = {
      // item → detail facts shaping (Step 4), not filtering
      "sections/PortfolioDetail.tsx": [/\.pricePerArea\b/, /\.keywords\b/],
      // build-time index shaping: drops price data when the site has no price scale
      "sections/portfolioFilter.ts": [/\.pricePerArea\b/],
    };
    for (const r of rules) {
      if ((allowed[f] ?? []).some((a) => a.source === r.source)) continue;
      assert(!r.test(text), `${f} contains filter/sort logic ${r}`);
    }
  }
  // The island and the URL codec never read filterable record fields or iterate the index themselves.
  for (const f of ["components/PortfolioBrowser.tsx", "lib/filterQuery.ts"]) {
    const text = await readFile(path.join(templateRoot, f), "utf8");
    for (const r of [/\b\w+\.(area|location|scope|category|keywords|pricePerArea|publishedAt)\??\.(value|amount|unit|currency|includes|some|length)\b/, /\b(e|entry|r|rec|p)\.(area|location|scope|category|keywords|pricePerArea|publishedAt)\b/, /\bentries\.(filter|sort|find|some|every|reduce|slice)\(/]) {
      assert(!r.test(text), `${f} reads/iterates index records directly ${r}`);
    }
  }
  const filterModule = (await readFile(path.join(repoRoot, "platform/content/project-filter.ts"), "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const deps = [...filterModule.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  eq(deps, [], "pure module has no imports");
  assert(!/\b(window|document|Intl|localStorage|fetch|React)\b|new Date\(|Date\.now/.test(filterModule), "pure module must not use DOM/Intl/clock/network");
});
await check("gate: new allowlist entries are exactly the pure filter module + browser URL door; window/storage/network still refused", () => {
  const f = "templates/interior-01/v1/components/X.tsx";
  assert(scanTemplateSource(f, `import { evaluateProjectFilter } from "@platform/content/project-filter";`, []).length === 0, "project-filter refused");
  assert(scanTemplateSource(f, `import { readQuery } from "@platform/site/browser";`, []).length === 0, "browser refused");
  for (const bad of [
    `import { createContentReader } from "@platform/content/reader";`,
    `import { loadSiteSnapshot } from "@platform/site/load";`,
    `const q = window.location.search;`,
    `history.pushState(null, "", "/x"); fetch("/x");`,
    `localStorage.setItem("a", "b"); const x = globalThis;`,
    `import { useSearchParams } from "next/navigation";`,
  ]) {
    assert(scanTemplateSource(f, bad, []).length > 0, `not refused: ${bad}`);
  }
});
await check("settings: 1.2.0 filter keys validated strictly; 1.1.0-shaped settings documents stay valid", () => {
  const base = { schemaVersion: 1, templateId: "interior-01" };
  const eff = resolveEffectiveSettings(template, { ...base, overrides: {} });
  eq(eff["portfolio.index"], { filtersEnabled: true, filterGroups: [...PROJECT_FILTER_GROUPS], areaScale: "m2", priceScale: "none" }, "defaults");
  resolveEffectiveSettings(template, { ...base, overrides: { "home.projects-a": { limit: 4, selection: { mode: "latest" } } } });
  for (const bad of [{ priceScale: "eur-m2" }, { areaScale: "tsubo" }, { filterGroups: ["area", "area"] }, { filterGroups: ["service"] }, { filterGroups: [] }, { defaultSort: "popular" }, { buckets: [] }]) {
    let threw = false;
    try {
      resolveEffectiveSettings(template, { ...base, overrides: { "portfolio.index": bad } });
    } catch {
      threw = true;
    }
    assert(threw, `accepted ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------- integration --
console.log("\n[integration] fixture packages on the new release");
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template;
const pointer = async (s: string, which: "current" | "previous") => {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", s, `${which}.json`));
  const dir = path.join(repoRoot, ptr.packageDir);
  return { ptr, dir, site: path.join(dir, "site"), record: await readJson(path.join(dir, "build-record.json")) };
};
const cur = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "current")] as const)));
const prev = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "previous").catch(() => undefined)] as const)));
const html = async (s: string, route: string, which: "current" | "previous" = "current") =>
  readFile(path.join((which === "current" ? cur : prev)[s]!.site, routeHtml(route)), "utf8");
const newPin = await pinOf("fixture-large");
const storedProjects = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "content/projects.json"))).items as Project[];
const byLatest = (a: Project, b: Project) => {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  return ta !== tb ? tb - ta : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
const served = async (s: string) => {
  const at = Date.parse(cur[s]!.record.at);
  return (await storedProjects(s)).filter((p) => p.status === "published" && Date.parse(p.publishedAt) <= at).sort(byLatest);
};
const main = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const block = (h: string, re: RegExp) => re.exec(h)?.[0];

await check("release: all three sites pin + were built with the SAME release ≥ 1.2.0 (verified); Step 4 release untouched", async () => {
  const pins = await Promise.all(SITES.map(pinOf));
  assert(new Set(pins.map((p) => `${p.releaseId}|${p.releaseHash}`)).size === 1, "pins differ");
  assert(versionAtLeast(newPin.templateVersion, "1.2.0") && template.version === newPin.templateVersion && newPin.releaseId !== STEP4_RELEASE.id, newPin.releaseId);
  for (const s of SITES) assert(cur[s]!.record.template.releaseHash === newPin.releaseHash, `${s} built with ${cur[s]!.record.template.releaseId}`);
  await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", newPin.releaseId));
  const old = await loadRelease(repoRoot, "interior-01", STEP4_RELEASE.id);
  assert(old.releaseHash === STEP4_RELEASE.hash, "Step 4 releaseHash changed");
  await verifyRelease(repoRoot, old);
  assert(!old.files.some((f) => /project-filter|browser\.ts|PortfolioBrowser/.test(f.path)), "Step 4 release contains Step 4.1 files");
  const st = await stat(path.join(repoRoot, "data/template-releases/interior-01", STEP4_RELEASE.id, "files/templates/interior-01/v1/template.ts"));
  assert((st.mode & 0o222) === 0, "old release file is writable");
});
await check("rollback: each site's previous package = the package of the release before the current one (≥ 1.1.0), intact", async () => {
  const { packageIntact } = await import("../build/site-build");
  for (const s of SITES) {
    const p = prev[s];
    assert(p, `${s}: no previous package`);
    const v = p.record.template.releaseId.split("-").at(-2)!;
    assert(p.record.template.releaseId !== newPin.releaseId && versionAtLeast(v, "1.1.0") && !versionAtLeast(v, newPin.templateVersion), `${s}: previous built with ${p.record.template.releaseId}`);
    assert(await packageIntact(p.dir), `${s}: previous package damaged`);
  }
});

await check("A unfiltered /portfolio: SSR grid + route pager byte-identical to the previous package; every other non-home page's <main> byte-identical", async () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const now = await html(s, "/portfolio");
    const before = await html(s, "/portfolio", "previous");
    const grid = /<ul class="i1-plist__grid">[\s\S]*?<\/ul>/;
    const pager = /<nav class="i1-pager"[\s\S]*?<\/nav>/;
    assert(block(now, grid) === block(before, grid), `${s}: grid HTML changed`);
    assert(block(now, pager) === block(before, pager), `${s}: pager HTML changed`);
    assert(/data-filtered="false"/.test(now) && /data-filter=""/.test(now), `${s}: filter island missing`);
    assert(!/<meta name="robots"/.test(now), `${s}: unfiltered /portfolio must stay indexable`);
    const title = /<title>[^<]*<\/title>/;
    assert(block(now, title) === block(before, title), `${s}: title changed`);
    const canon = /<link rel="canonical"[^>]*>/;
    assert(block(now, canon) === block(before, canon) && block(now, canon)?.includes("/portfolio"), `${s}: canonical changed`);
  }
  for (const s of SITES) {
    // index.html is excluded: the homepage is the Step 5 (1.3.0) surface, pinned by step5.test.ts.
    // 1.5.0's new pages have no previous counterpart (asserted by ia150.test.ts): see canonical-150.ts
    const files = withoutIaPages((await walkFiles(cur[s]!.site)).filter((f) => f.endsWith(".html") && f !== "portfolio.html" && f !== "index.html"));
    const email = JSON.parse(await readFile(path.join(repoRoot, "data/sites", s, "content/business.json"), "utf8")).data?.contact?.email as string | undefined;
    for (const f of files) {
      // 1.4.1 changed the detail <main> in two declared ways: see canonical-141.ts; 1.5.0 the CTA href: canonical-150.ts
      const locale = JSON.parse(await readFile(path.join(repoRoot, "data/sites", s, "site.json"), "utf8")).identity.locale as string;
      const a = canonical150Main(canonical142(canonical141(main(await readFile(path.join(cur[s]!.site, f), "utf8")), locale)), email);
      const b = canonical150Main(canonical142(canonical141(main(await readFile(path.join(prev[s]!.site, f), "utf8")), locale)), email);
      assert(a === b, `${s}/${f}: <main> changed`);
    }
  }
});
await check("B 173 projects still paginate 30/page unfiltered (static routes, exact order)", async () => {
  const order = await served("fixture-large");
  assert(order.length === 173, `visible ${order.length}`);
  const routes = ["/portfolio", "/portfolio/page/2", "/portfolio/page/3", "/portfolio/page/4", "/portfolio/page/5", "/portfolio/page/6"];
  const pages = await Promise.all(routes.map(async (r) => cardIds(await html("fixture-large", r))));
  eq(pages.map((p) => p.length), [30, 30, 30, 30, 30, 23], "page sizes");
  eq(pages.flat(), order.map((p) => p.id), "order");
  for (const r of routes.slice(1)) assert(!(await html("fixture-large", r)).includes("data-filter"), `${r}: filter UI on a static paged route`);
});
await check("C filter index = exactly the served projects (large 173, small 12), in the default order, with the vocabulary", async () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const props = filterProps(await html(s, "/portfolio"));
    assert(props, `${s}: no filter index`);
    eq(props.entries.map((e) => e.id), (await served(s)).map((p) => p.id), `${s}: index ids/order`);
    const txt = await readFile(path.join(cur[s]!.site, "portfolio.txt"), "utf8");
    assert(txt.includes('{"entries":['), `${s}: RSC payload lacks the index`);
  }
  const large = filterProps(await html("fixture-large", "/portfolio"))!;
  eq(large.vocabulary.groups, ["keyword", "type", "area", "style", "price"], "large groups");
  eq(large.vocabulary.area!.id, "m2", "large area scale");
  eq(large.vocabulary.price!.id, "usd-m2", "large price scale");
  const small = filterProps(await html("fixture-small", "/portfolio"))!;
  eq([small.vocabulary.area!.id, small.vocabulary.price!.id], ["pyeong", "krw-pyeong"], "small scales");
  assert(small.vocabulary.area!.buckets.every((b) => b.label.includes("평")), "small area labels");
  assert(filterProps(await html("fixture-large", "/portfolio/page/2")) === undefined, "index shipped on a paged route");
});
await check("D public index leaks nothing: no draft/scheduled record, only allowed fields, no body/gallery/quote/source fields", async () => {
  const allowed = new Set(["id", "publishedAt", "title", "summary", "location", "scope", "keywords", "category", "area", "pricePerArea", "href", "categoryLabel", "cover"]);
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const pageHtml = await html(s, "/portfolio");
    const txt = await readFile(path.join(cur[s]!.site, "portfolio.txt"), "utf8");
    const props = filterProps(pageHtml)!;
    for (const e of props.entries) for (const k of Object.keys(e)) assert(allowed.has(k), `${s}: index field "${k}"`);
    for (const e of props.entries) eq(Object.keys(e.cover as object).sort(), ["alt", "height", "src", "width"], `${s}: cover shape`);
    const servedList = await served(s);
    const servedIds = new Set(servedList.map((p) => p.id));
    const servedTitles = new Set(servedList.map((p) => p.title));
    for (const p of await storedProjects(s)) {
      if (!servedIds.has(p.id)) {
        for (const text of [pageHtml, txt]) {
          assert(!text.includes(`"${p.id}"`) && !text.includes(`/portfolio/${p.slug}`), `${s}: unserved ${p.status} ${p.id} leaked`);
          // (a draft may legitimately share its title with a published project)
          if (!servedTitles.has(p.title)) assert(!text.includes(p.title), `${s}: title of unserved ${p.id} leaked`);
        }
      }
      for (const text of [pageHtml, txt]) {
        for (const para of p.body ?? []) assert(!text.includes(para.slice(0, 60)), `${s}: body text of ${p.id} leaked`);
        if (p.customerQuote) assert(!text.includes(p.customerQuote.text.slice(0, 60)), `${s}: quote of ${p.id} leaked`);
      }
    }
    for (const term of ["galleryGroups", "customerQuote", "builtYear", "durationWeeks", '"body":[', '"status":"', "isListDisplay", "spaceSizes", "styleTypes", "sortType", "serviceTypes", "displayOrder"]) {
      assert(!pageHtml.includes(term) && !txt.includes(term), `${s}: "${term}" in the public /portfolio payload`);
    }
  }
});
await check("parity: evaluator over the SHIPPED index = evaluator over the stored canonical records (fields sufficient, no drift)", async () => {
  const props = filterProps(await html("fixture-large", "/portfolio"))!;
  const records = (await served("fixture-large")).map(toProjectFilterRecord);
  const v = props.vocabulary;
  const cases: ProjectFilterInput[] = [
    {},
    { type: ["living"] },
    { area: ["60", "150plus"], sort: "area-desc" },
    { style: ["Warm wood", "Terrazzo"], price: ["2000"], sort: "price-asc" },
    { keyword: "linden kitchen" },
    { type: ["bath"], style: ["Open kitchen"], area: ["90", "120"], sort: "oldest" },
    { sort: "price-desc" },
  ];
  for (const c of cases) {
    const f = normalizeProjectFilter(c, v);
    eq(ids(evaluateProjectFilter(props.entries, f, v)), ids(evaluateProjectFilter(records, f, v)), JSON.stringify(c));
  }
});
await check("fixtures exercise the dimensions: several areas/styles/prices/texts, missing values, results + zero result, > 30 matches", async () => {
  const props = filterProps(await html("fixture-large", "/portfolio"))!;
  const v = props.vocabulary;
  const e = props.entries;
  assert(v.area!.buckets.length >= 4 && v.styles.length >= 4 && v.price!.buckets.length >= 4, "vocabulary breadth");
  assert(new Set(e.map((x) => x.location).filter(Boolean)).size >= 4, "locations");
  assert(e.some((x) => !x.pricePerArea) && e.some((x) => !x.keywords) && e.some((x) => !x.area) && e.some((x) => !x.location), "missing optional values");
  const n = (c: ProjectFilterInput) => evaluateProjectFilter(e, normalizeProjectFilter(c, v), v).length;
  assert(n({ type: ["living"] }) > 30, `>30 matches for pagination (${n({ type: ["living"] })})`);
  assert(n({ type: ["kitchen"], style: ["Warm wood"], area: ["120"] }) > 0, "combination with results");
  assert(n({ type: ["kitchen"], keyword: "zzz-nothing" }) === 0, "combination with zero results");
  const small = filterProps(await html("fixture-small", "/portfolio"))!;
  assert(small.entries.some((x) => x.area?.unit === "pyeong") && small.entries.some((x) => x.area?.unit === "m2"), "small mixes 평 and m² (normalization exercised)");
});
await check("V no filtered static route explosion: exactly the Step 4 HTML set; route plan unchanged", async () => {
  const expected = { "fixture-large": 182, "fixture-small": 16, "fixture-empty": 3 } as const;
  for (const s of SITES) {
    // the 1.5.0 static pages are set aside on both sides (asserted by ia150.test.ts): see canonical-150.ts
    const now = withoutIaPages((await walkFiles(cur[s]!.site)).filter((f) => f.endsWith(".html")));
    const before = withoutIaPages((await walkFiles(prev[s]!.site)).filter((f) => f.endsWith(".html")));
    eq(now, before, `${s}: HTML set`);
    assert(now.length === expected[s], `${s}: ${now.length} HTML`);
    assert(!now.some((f) => /[?=&]|filter|keyword|style|area|price|sort/i.test(f.replace(/^portfolio\/[a-z0-9-]+\.html$/, ""))), `${s}: filter-shaped file`);
    eq(canonical150Routes(cur[s]!.record.preflight.routes), canonical150Routes(prev[s]!.record.preflight.routes), `${s}: route plan`);
    eq(cur[s]!.record.preflight.pruned, prev[s]!.record.preflight.pruned, `${s}: pruning`);
  }
});
await check("W unfiltered SEO unchanged: sitemap.xml + robots.txt byte-identical to the Step 4 packages", async () => {
  for (const s of SITES) {
    for (const f of ["sitemap.xml", "robots.txt"]) {
      // sitemap: the 1.5.0 static pages' entries set aside on both sides (canonical-150.ts)
      const a = canonical150Sitemap(await readFile(path.join(cur[s]!.site, f), "utf8"));
      const b = canonical150Sitemap(await readFile(path.join(prev[s]!.site, f), "utf8"));
      assert(a === b, `${s}/${f} changed`);
    }
  }
  const sitemap = canonical150Sitemap(await readFile(path.join(cur["fixture-large"]!.site, "sitemap.xml"), "utf8"));
  assert(!/<loc>[^<]*\?/.test(sitemap) && (sitemap.match(/<loc>/g) ?? []).length === 180, "sitemap: 180 URLs, none with a query");
});
await check("fixture-empty: no portfolio route at all (distinct from a filtered-zero view); no index anywhere", async () => {
  const files = await walkFiles(cur["fixture-empty"]!.site);
  assert(!files.some((f) => f.startsWith("portfolio")), files.join());
  assert(!(await html("fixture-empty", "/")).includes('{"entries":['), "index on the empty site");
});
await check("Y no source dependency/leakage: package QA passed with frozen terms; no source param/API names in template or packages", async () => {
  for (const s of SITES) assert(cur[s]!.record.qa.pass, `${s}: QA`);
  const terms = ["spaceSizes", "styleTypes", "sortType", "serviceTypes", "isListDisplay", "portfoilo", "get-by-paging", "TOGGLED_UUIDS", "apartmentary", "WOOD_POINT"];
  for (const f of templateFiles.filter((x) => /\.(ts|tsx|css)$/.test(x))) {
    const text = await readFile(path.join(templateRoot, f), "utf8");
    for (const t of terms) assert(!text.includes(t), `${f}: ${t}`);
  }
  const pf = await readFile(path.join(repoRoot, "platform/content/project-filter.ts"), "utf8");
  for (const t of terms) assert(!pf.includes(t), `project-filter.ts: ${t}`);
  for (const s of ["fixture-large", "fixture-small"] as const) {
    for (const f of (await walkFiles(cur[s]!.site)).filter((x) => /\.(html|txt|js|css)$/.test(x))) {
      const text = await readFile(path.join(cur[s]!.site, f), "utf8");
      for (const t of terms) assert(!text.toLowerCase().includes(t.toLowerCase()), `${s}/${f}: ${t}`);
    }
  }
});
await check("slots: filter copy is section-level (site vs neutral per site); option values are not slotted", async () => {
  const src = (s: string) => cur[s]!.record.preflight.slotSources["portfolio.index"];
  for (const k of ["filterLabel", "searchPlaceholder", "sortLabel", "resetLabel", "resultCountFormat", "emptyTitle", "emptyBody"]) {
    assert(src("fixture-small")[k] === "site" && src("fixture-large")[k] === "neutral-default", `${k}: ${src("fixture-small")[k]} / ${src("fixture-large")[k]}`);
  }
  // area/price bucket labels are vertical vocabulary; type/style options are content → none is a slot
  const slotKeys = Object.keys(template.sections["portfolio.index"].slots ?? {}).slice(7);
  eq(slotKeys, ["filterLabel", "searchLabel", "searchPlaceholder", "typeLabel", "areaLabel", "styleLabel", "priceLabel", "sortLabel", "sortNewest", "sortOldest", "sortAreaDesc", "sortAreaAsc", "sortPriceDesc", "sortPriceAsc", "resetLabel", "resultCountFormat", "resultCountFormatOne", "emptyTitle", "emptyBody"], "1.2.0 slots");
  const small = await html("fixture-small", "/portfolio");
  assert(small.includes("프로젝트 12개") && small.includes("필터") && small.includes("정렬"), "Korean filter copy");
  const large = await html("fixture-large", "/portfolio");
  assert(large.includes("173 projects") && !large.includes('class="i1-pfilter__reset'), "large count copy; no reset button rendered when unfiltered");
});

console.log("\n[integration] throwaway-root builds (rollback by re-pin to 1.1.0, filters off)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "step41-root-"));
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const at = cur["fixture-large"]!.record.at;

  let step4PortfolioMain: string | undefined;
  await check("re-pin to the Step 4 release builds with the current builder ONLY after the data is migrated to the 1.1.0 shape (strict old schemas; see 04 open items)", async () => {
    const dir = path.join(tmpRoot, "data/sites/step4-small");
    await cp(path.join(repoRoot, "data/sites/fixture-small"), dir, { recursive: true });
    const siteJson = await readJson(path.join(dir, "site.json"));
    const old = await loadRelease(repoRoot, "interior-01", STEP4_RELEASE.id);
    siteJson.siteId = "step4-small";
    siteJson.template = { templateId: "interior-01", templateVersion: old.templateVersion, releaseId: old.releaseId, releaseHash: old.releaseHash };
    await writeFile(path.join(dir, "site.json"), JSON.stringify(siteJson, null, 2));
    // 1.1.0 settings/slots: strip the 1.2.0+ keys (the old strict schemas refuse them)
    const settings = await readJson(path.join(dir, "settings.json"));
    delete settings.overrides["portfolio.index"];
    for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "site.floating-cta"]) delete settings.overrides[k];
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    const slots = await readJson(path.join(dir, "slots.json"));
    const step4Keys = new Set(["title", "description", "heroImage", "pageLabel", "previousLabel", "nextLabel", "paginationLabel"]);
    slots.values["portfolio.index"] = Object.fromEntries(Object.entries(slots.values["portfolio.index"]).filter(([k]) => step4Keys.has(k)));
    for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "home.image-band", "site.floating-cta"]) delete slots.values[k];
    delete slots.values["home.projects-a"].previousLabel;
    delete slots.values["home.projects-a"].nextLabel;
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    // 1.3.0 homepage collections (the old strict snapshot schema refuses them)
    await rm(path.join(dir, "content/banners.json"), { force: true });
    await rm(path.join(dir, "content/reviews.json"), { force: true });
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "step4-small", at });
    assert(r.status === "built", r.status);
    assert(r.record.template.releaseId === STEP4_RELEASE.id && r.record.qa.pass, r.record.template.releaseId);
    const h = await readFile(path.join(r.packageDir, "site/portfolio.html"), "utf8");
    assert(!h.includes("data-filter"), "1.1.0 build must not contain filters");
    // The Step 4 package itself is no longer retained (current + previous only), so the re-pinned
    // 1.1.0 build is the Step 4 reference the filters-off check below must match byte-for-byte.
    step4PortfolioMain = main(h);
    assert(step4PortfolioMain.includes("i1-plist__grid"), "re-pinned 1.1.0 build has no portfolio grid");
  });
  await check("settings filtersEnabled=false → /portfolio renders the plain Step 4 list (no island, no index), same grid", async () => {
    const dir = path.join(tmpRoot, "data/sites/fixture-small");
    await cp(path.join(repoRoot, "data/sites/fixture-small"), dir, { recursive: true });
    const settings = await readJson(path.join(dir, "settings.json"));
    settings.overrides["portfolio.index"] = { filtersEnabled: false };
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built", r.status);
    const h = await readFile(path.join(r.packageDir, "site/portfolio.html"), "utf8");
    assert(!h.includes("data-filter") && !h.includes('{"entries":['), "filter island rendered while disabled");
    assert(step4PortfolioMain !== undefined && main(h) === step4PortfolioMain, "disabled filters must render the Step 4 /portfolio main byte-identically (vs the re-pinned 1.1.0 build)");
  });
  await check("priceScale none → no price filter, no price sort and NO price data in the shipped index", async () => {
    const dir = path.join(tmpRoot, "data/sites/fixture-small");
    const settings = await readJson(path.join(dir, "settings.json"));
    settings.overrides["portfolio.index"] = { areaScale: "pyeong", priceScale: "none" };
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at, force: true });
    assert(r.status === "built", r.status);
    const h = await readFile(path.join(r.packageDir, "site/portfolio.html"), "utf8");
    const props = filterProps(h)!;
    assert(props.entries.length === 12 && props.entries.every((e) => !("pricePerArea" in e)), "price data shipped without a price scale");
    assert(!props.vocabulary.groups.includes("price") && !props.vocabulary.sorts.some((x) => x.startsWith("price")), "price group/sort offered");
    assert(props.entries.some((e) => e.area), "area data must stay (area filter + sort)");
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nstep41: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
