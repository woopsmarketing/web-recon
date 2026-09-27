/**
 * Portfolio detail facts — the public detail page tells the V0.2 truth (interior-01 1.6.1).
 *
 * [unit] portfolioDetail() — the Template's own data function — over the REAL canonical demo corpus
 *        (19 records) in a SiteContext built from the demo's own snapshot:
 *          AREA-UI-1…5  the area label names the basis the record states (공급면적 / 전용면적), an
 *                       unstated basis gets the unqualified label, an absent area gets no row, and the
 *                       figure is never converted (no 평↔m², no supply↔exclusive);
 *          F1…F6        the V0.2 structured facts (projectType, workScopeIds, totalPrice) get a row only
 *                       when authored, are never inferred from title / category / scope / body / a price,
 *                       and a partial's total stays the whole case's total ("총 공사비"), never a per-room
 *                       price or a quote;
 *          G            every shown fact equals the golden integration document's record, 19/19.
 *
 * Every expected value is a literal written from the authored corpus and tied to the golden document
 * (check G) — never recomputed with the functions under test. The Korean fact labels are the demo's site
 * copy; they are injected here so this part does not depend on the pin.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/detail-facts.test.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GOLDEN_DIR, GOLDEN_INPUT } from "../cli/integration-golden";
import { emitIntegration } from "../integration/emit";
import { createContentReader } from "../content/reader";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot } from "../site/load";
import { planRoutes } from "../site/routes";
import template from "../../templates/interior-01/v1/template";
import { portfolioDetail } from "../../templates/interior-01/v1/sections/PortfolioDetail";
import { formatTotalPrice } from "../../templates/interior-01/v1/lib/format";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const GOLDEN_VERSION = "d56509c8100a56fdf9644baff78ff9e1";

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
const readJson = async (f: string) => JSON.parse(await readFile(path.join(repoRoot, f), "utf8"));

// ------------------------------------------------------------------ expectations --
/** The demo's Korean fact labels (site copy, data/sites/boost-interior-demo/slots.json from 1.6.1). */
const KO_LABELS = {
  areaLabel: "면적",
  areaSupplyLabel: "공급면적",
  areaExclusiveLabel: "전용면적",
  projectTypeLabel: "리모델링 구분",
  workScopesLabel: "주요 공사 범위",
  totalPriceLabel: "총 공사비",
} as const;
/**
 * The first-party chat consumer's own words for the 26 work-scope ids (boost-chat
 * src/lib/first-party/interior-query.ts WORK_SCOPE_LABEL, read-only copy): a visitor who reads
 * "주요 공사 범위" in the chat must read the same words on the page.
 */
const CONSUMER_WORDS: Record<string, string> = {
  entrance: "현관", living_room: "거실", dining: "다이닝", kitchen: "주방", pantry: "팬트리", bedroom: "침실",
  kids_room: "아이방", dressing_room: "드레스룸", study: "서재", bathroom: "욕실", hallway: "복도", balcony: "발코니",
  storage: "창고", utility: "다용도실", flooring: "바닥", wallpaper: "도배", lighting: "조명", windows: "창호", doors: "문",
  tiling: "타일", painting: "도장", plumbing: "배관·수전", electrical: "전기", built_in_furniture: "붙박이·제작 가구",
  expansion: "확장", demolition: "철거",
};

type Total = { kind: "exact"; amount: number; currency: "KRW" } | { kind: "range"; minAmount: number; maxAmount: number; currency: "KRW" };
type Want = {
  /** golden `property.area` (value, unit, basis) + the row the page must show */
  area?: { raw: { value: number; unit: string; basis: string }; row: [string, string] };
  projectType?: { raw: string; row: string };
  work: { raw: string[]; row: string };
  total?: { raw: Total; row: string };
};
const exact = (amount: number): Total => ({ kind: "exact", amount, currency: "KRW" });
const sup = (value: number, unit: "pyeong" | "m2"): Want["area"] => ({ raw: { value, unit, basis: "supply" }, row: ["공급면적", unit === "pyeong" ? `${value}평` : `${value} m²`] });
const FULL = { raw: "full_remodel", row: "전체 리모델링" };
const PARTIAL = { raw: "partial_remodel", row: "부분 리모델링" };
const W = (...ids: string[]) => ({ raw: ids, row: ids.map((id) => CONSUMER_WORDS[id]).join(", ") });
/** Written from the authored corpus, record by record (docs/result/interior-portfolio-v0.2/26-, 28-); tied to the golden by G. */
const WANT: Record<string, Want> = {
  "bi-01": { area: sup(34, "pyeong"), projectType: FULL, work: W("entrance", "kitchen", "bathroom", "flooring", "lighting", "built_in_furniture") },
  "bi-02": { area: sup(24, "pyeong"), work: W("kitchen", "flooring", "built_in_furniture") },
  "bi-03": { area: sup(42, "pyeong"), work: W("entrance", "lighting", "built_in_furniture") },
  "bi-04": { area: sup(32, "pyeong"), projectType: PARTIAL, work: W("kitchen", "bathroom") },
  "bi-05": { area: sup(29, "pyeong"), work: W("flooring", "painting", "built_in_furniture") },
  "bi-06": { area: sup(34, "pyeong"), projectType: PARTIAL, work: W("entrance", "living_room", "lighting") },
  "bi-07": { area: sup(19, "pyeong"), projectType: FULL, work: W("kitchen", "flooring", "doors", "built_in_furniture") },
  "bi-08": { area: sup(51, "pyeong"), work: W("living_room", "lighting") },
  "bi-09": { area: sup(34, "pyeong"), projectType: FULL, work: W("entrance", "kitchen", "bathroom", "flooring", "wallpaper", "lighting", "built_in_furniture"), total: { raw: exact(50_000_000), row: "5,000만 원" } },
  "bi-10": { area: sup(34, "pyeong"), projectType: FULL, work: W("entrance", "living_room", "kitchen", "bedroom", "dressing_room", "bathroom", "windows", "expansion", "built_in_furniture"), total: { raw: exact(85_000_000), row: "8,500만 원" } },
  "bi-11": { area: sup(20, "pyeong"), projectType: FULL, work: W("kitchen", "bathroom", "flooring", "wallpaper", "doors"), total: { raw: exact(30_000_000), row: "3,000만 원" } },
  "bi-12": { area: sup(26, "pyeong"), projectType: FULL, work: W("entrance", "kitchen", "bathroom", "flooring", "lighting", "built_in_furniture"), total: { raw: exact(52_000_000), row: "5,200만 원" } },
  "bi-13": {
    area: sup(48, "pyeong"),
    projectType: FULL,
    work: W("entrance", "living_room", "dining", "kitchen", "kids_room", "dressing_room", "study", "bathroom", "windows", "lighting", "built_in_furniture"),
    total: { raw: { kind: "range", minAmount: 125_000_000, maxAmount: 140_000_000, currency: "KRW" }, row: "1억 2,500만 원 ~ 1억 4,000만 원" },
  },
  "bi-14": { area: { raw: { value: 84, unit: "m2", basis: "exclusive" }, row: ["전용면적", "84 m²"] }, projectType: PARTIAL, work: W("kitchen"), total: { raw: exact(15_000_000), row: "1,500만 원" } },
  "bi-15": { projectType: PARTIAL, work: W("bathroom"), total: { raw: exact(7_000_000), row: "700만 원" } },
  "bi-16": { area: sup(38, "pyeong"), projectType: PARTIAL, work: W("kitchen", "bathroom"), total: { raw: exact(19_800_000), row: "1,980만 원" } },
  "bi-17": { area: sup(112, "m2"), projectType: PARTIAL, work: W("living_room", "flooring"), total: { raw: exact(12_500_000), row: "1,250만 원" } },
  "bi-18": { area: sup(30, "pyeong"), projectType: PARTIAL, work: W("entrance", "built_in_furniture"), total: { raw: exact(6_200_000), row: "620만 원" } },
  "bi-19": { area: sup(32, "pyeong"), work: W("flooring", "wallpaper", "lighting"), total: { raw: exact(11_000_000), row: "1,100만 원" } },
};
const V02_KEYS = ["area", "projectType", "workScopes", "totalPrice"] as const;

// ----------------------------------------------------------------------- context --
type Snapshot = Awaited<ReturnType<typeof buildSiteSnapshot>>["snapshot"];
type Project = Snapshot["content"]["projects"][number];
const base = (await buildSiteSnapshot({ repoRoot, siteId: DEMO, mode: GOLDEN_INPUT.mode, at: GOLDEN_INPUT.at })).snapshot;
const PIN = base.site.template;
assert(PIN.templateVersion === template.version, `the demo pins ${PIN.templateVersion} but the working-tree template is ${template.version} (run between a cut and its re-pin?)`);

/** A SiteContext over (a copy of) the demo snapshot; `slots` replace portfolio.detail copy, `mutate` edits projects. */
function ctxOf(opts: { slots?: Record<string, string | undefined>; mutate?: (projects: Project[]) => void } = {}) {
  const snap = structuredClone(base) as Snapshot;
  const values = (snap.slots!.values as Record<string, Record<string, unknown>>)["portfolio.detail"]!;
  for (const [k, v] of Object.entries(opts.slots ?? KO_LABELS)) {
    if (v === undefined) delete values[k];
    else values[k] = v;
  }
  opts.mutate?.(snap.content.projects);
  const ctx = createSiteContext({ siteId: DEMO, template, templateRelease: PIN, mode: GOLDEN_INPUT.mode, at: GOLDEN_INPUT.at, snapshot: snap });
  return { ctx, snap };
}
function detail(c: ReturnType<typeof ctxOf>, id: string) {
  const p = c.snap.content.projects.find((x) => x.id === id);
  assert(p, `${id} not in the corpus`);
  const item = c.ctx.content.getBySlug("projects", p.slug);
  assert(item, `${id}: not served`);
  return portfolioDetail(c.ctx, item);
}
const row = (d: ReturnType<typeof detail>, key: string) => d.facts.find((f) => f.key === key);
const pair = (d: ReturnType<typeof detail>, key: string) => {
  const f = row(d, key);
  return f ? [f.label, f.value] : undefined;
};
const ko = ctxOf();
const ids = base.content.projects.map((p) => p.id);

// -------------------------------------------------------------------- the corpus --
console.log("\n[corpus] the canonical 19-record demo corpus and its golden document");
const golden = await readJson(path.join(GOLDEN_DIR, `portfolio.${GOLDEN_VERSION}.json`));
await check("G0 the expectation table covers exactly the canonical corpus and the golden document's records (19/19, same ids)", () => {
  eq(ids.length, 19, "corpus size");
  eq([...ids].sort(), Object.keys(WANT).sort(), "table ids = corpus ids");
  eq((golden.records as { id: string }[]).map((r) => r.id).sort(), Object.keys(WANT).sort(), "table ids = golden ids");
});
await check("G the expectation table IS the golden document: area (value/unit/basis), projectType, workScopeIds (order), pricing.total — 19/19, nothing else authored", () => {
  for (const r of golden.records as Record<string, any>[]) {
    const w = WANT[r.id]!;
    eq(r.property?.area, w.area?.raw, `${r.id} property.area`);
    eq(r.projectType, w.projectType?.raw, `${r.id} projectType`);
    eq(r.workScopeIds, w.work.raw, `${r.id} workScopeIds`);
    eq(r.pricing?.total, w.total?.raw, `${r.id} pricing.total`);
  }
});

// -------------------------------------------------------------------------- area --
console.log("\n[area] basis-aware area label (AREA-UI)");
await check("AREA-UI-1 supply + 평 (bi-01): 공급면적 = 34평", () => eq(pair(detail(ko, "bi-01"), "area"), ["공급면적", "34평"], "bi-01"));
await check("AREA-UI-2 supply + m² (bi-17): 공급면적 = 112 m²", () => eq(pair(detail(ko, "bi-17"), "area"), ["공급면적", "112 m²"], "bi-17"));
await check("AREA-UI-3 exclusive + m² (bi-14): 전용면적 = 84 m² — never 공급면적", () => {
  const d = detail(ko, "bi-14");
  eq(pair(d, "area"), ["전용면적", "84 m²"], "bi-14");
  assert(!d.facts.some((f) => f.label === "공급면적"), "bi-14 carries a 공급면적 label");
});
await check("AREA-UI-4 area absent (bi-15): no area row, no area label, no area figure anywhere in the facts", () => {
  const d = detail(ko, "bi-15");
  assert(!row(d, "area"), "bi-15 renders an area row");
  for (const f of d.facts) {
    assert(!["면적", "공급면적", "전용면적"].includes(f.label), `bi-15: area label "${f.label}"`);
    assert(!/\d\s*(평|m²|㎡|sq ft)/.test(f.value), `bi-15: area-like figure "${f.label} = ${f.value}"`);
  }
});
await check("AREA-UI-4b basis unstated (absent) or explicitly \"unknown\": the unqualified label (면적), the figure as authored — no basis is guessed", () => {
  for (const basis of [undefined, "unknown"] as const) {
    const c = ctxOf({ mutate: (ps) => void (ps.find((p) => p.id === "bi-01")!.area = { value: 34, unit: "pyeong", ...(basis ? { basis } : {}) }) });
    eq(pair(detail(c, "bi-01"), "area"), ["면적", "34평"], `bi-01 basis ${basis ?? "absent"}`);
  }
});
await check("AREA-UI-5 no numerical conversion: re-labelling the same record through supply / exclusive / unknown changes ONLY the label (bi-01 34평, bi-14 84 m², bi-17 112 m²); no 평↔m² figure appears", () => {
  for (const [id, value] of [["bi-01", "34평"], ["bi-14", "84 m²"], ["bi-17", "112 m²"]] as const) {
    const got = (["supply", "exclusive", "unknown"] as const).map((basis) => {
      const c = ctxOf({ mutate: (ps) => void (ps.find((p) => p.id === id)!.area!.basis = basis) });
      return pair(detail(c, id), "area");
    });
    eq(got, [["공급면적", value], ["전용면적", value], ["면적", value]], id);
  }
  const text = (id: string) => detail(ko, id).facts.map((f) => f.value).join(" | ");
  assert(!/평|25[.,]4/.test(text("bi-14")), `bi-14 shows a converted figure: ${text("bi-14")}`);
  assert(!/33[.,]9|34평/.test(text("bi-17")), `bi-17 shows a converted figure: ${text("bi-17")}`);
  assert(!/m²|㎡|112|84/.test(text("bi-01")), `bi-01 shows a converted figure: ${text("bi-01")}`);
});
await check("AREA-UI-6 a site that authored no basis labels gets the neutral defaults for a stated basis — never its own unqualified label (the old demo copy areaLabel = 공급면적 must not reach bi-14)", () => {
  const c = ctxOf({ slots: { areaLabel: "공급면적", areaSupplyLabel: undefined, areaExclusiveLabel: undefined } });
  eq(pair(detail(c, "bi-14"), "area"), ["Exclusive area", "84 m²"], "bi-14");
  eq(pair(detail(c, "bi-01"), "area"), ["Supply area", "34평"], "bi-01");
});

// ------------------------------------------------------------------------- facts --
console.log("\n[facts] V0.2 structured facts: rendered only when authored, never inferred");
await check("F1 every record, 19/19: area · projectType · main work scopes · total price rows are exactly the authored facts (a row iff authored), with the expected label and value", () => {
  for (const id of ids) {
    const d = detail(ko, id);
    const w = WANT[id]!;
    eq(pair(d, "area"), w.area?.row, `${id} area`);
    eq(pair(d, "projectType"), w.projectType ? [KO_LABELS.projectTypeLabel, w.projectType.row] : undefined, `${id} projectType`);
    eq(pair(d, "workScopes"), [KO_LABELS.workScopesLabel, w.work.row], `${id} workScopes`);
    eq(pair(d, "totalPrice"), w.total ? [KO_LABELS.totalPriceLabel, w.total.row] : undefined, `${id} totalPrice`);
  }
});
await check("F2 projectType is never inferred: bi-02 / bi-03 / bi-05 (category 전체 리모델링) and bi-19 (category 부분 리모델링) have NO projectType row, even with a title / summary / body that says 전체 리모델링", () => {
  for (const id of ["bi-02", "bi-03", "bi-05", "bi-19"]) assert(!row(detail(ko, id), "projectType"), `${id}: projectType row without an authored projectType`);
  const c = ctxOf({
    mutate: (ps) => {
      const p = ps.find((x) => x.id === "bi-02")!;
      p.title = "24평 전체 리모델링";
      p.summary = "집 전체를 부분 리모델링 없이 전체 리모델링했습니다.";
      p.body = ["전체 리모델링 사례입니다."];
    },
  });
  const d = detail(c, "bi-02");
  assert(!row(d, "projectType"), "bi-02: projectType inferred from the title / summary / body");
  eq(pair(d, "category"), ["공사 유형", "전체 리모델링"], "bi-02 category row = the site taxonomy, unchanged");
});
await check("F3 main work scopes come from workScopeIds only: display `scope` text never adds, drops or renames an id; the label says 주요 (never 전체) 공사 범위", () => {
  const c = ctxOf({ mutate: (ps) => void (ps.find((x) => x.id === "bi-14")!.scope = ["주방", "욕실", "거실 전체"]) });
  eq(pair(detail(c, "bi-14"), "workScopes"), ["주요 공사 범위", "주방"], "bi-14 with a wider display scope");
  for (const id of ids) assert(!detail(ko, id).facts.some((f) => /전체\s*공사\s*범위/.test(f.label)), `${id}: an exhaustive-scope label`);
  const neutral = ctxOf({ slots: { workScopesLabel: undefined } });
  eq(row(detail(neutral, "bi-17"), "workScopes")?.label, "Main work scope", "neutral default");
});
await check("F4 total price: the whole case's total under 총 공사비 for full AND partial projects alike — never a per-room / per-trade price, never a quote; no total → no row (never pricePerArea × area)", () => {
  for (const id of ids) {
    const d = detail(ko, id);
    for (const f of d.facts) assert(!/견적|예상/.test(`${f.label} ${f.value}`), `${id}: "${f.label} = ${f.value}"`);
    const t = row(d, "totalPrice");
    if (!t) continue;
    eq(t.label, "총 공사비", `${id} total label`);
    // a partial's total is the record total: no scope word ever qualifies the label or the amount
    for (const word of Object.values(CONSUMER_WORDS)) assert(!t.label.includes(word) && !t.value.includes(word), `${id}: total qualified by "${word}"`);
  }
  // bi-17 partial (거실 · 바닥): 총 공사비 1,250만 원 beside 주요 공사 범위 거실, 바닥 — two separate facts
  const d17 = detail(ko, "bi-17");
  eq([pair(d17, "totalPrice"), pair(d17, "workScopes")], [["총 공사비", "1,250만 원"], ["주요 공사 범위", "거실, 바닥"]], "bi-17");
  // bi-01 has area + pricePerArea but no total: nothing multiplies them into one
  const d01 = detail(ko, "bi-01");
  assert(!row(d01, "totalPrice"), "bi-01: a total was derived");
  eq(pair(d01, "price"), ["평당 공사비", "평당 290만 원"], "bi-01 per-area price row unchanged");
  const c = ctxOf({ mutate: (ps) => void delete ps.find((x) => x.id === "bi-09")!.totalPrice });
  assert(!row(detail(c, "bi-09"), "totalPrice") && !row(detail(c, "bi-09"), "price"), "bi-09 without its total still shows a price");
});
await check("F5 total formatting (literals): 억/만 notation for a Korean locale + KRW, won when 만 cannot show it exactly, both ends of a range, generic form elsewhere", () => {
  const cases: [Parameters<typeof formatTotalPrice>[0], string | undefined, string][] = [
    [{ kind: "exact", amount: 100_000_000, currency: "KRW" }, "ko-KR", "1억 원"],
    [{ kind: "exact", amount: 150_000_000, currency: "KRW" }, "ko-KR", "1억 5,000만 원"],
    [{ kind: "exact", amount: 1_200_000_000 / 2, currency: "KRW" }, "ko", "6억 원"],
    [{ kind: "exact", amount: 12_345_678, currency: "KRW" }, "ko-KR", "12,345,678원"],
    [{ kind: "range", minAmount: 9_000_000, maxAmount: 12_000_000, currency: "KRW" }, "ko-KR", "900만 원 ~ 1,200만 원"],
    [{ kind: "exact", amount: 50_000_000, currency: "KRW" }, "en-US", "KRW 50,000,000"],
    [{ kind: "exact", amount: 50_000_000, currency: "KRW" }, undefined, "KRW 50,000,000"],
    [{ kind: "exact", amount: 1234.5, currency: "USD" }, "ko-KR", "USD 1,234.5"],
    [{ kind: "range", minAmount: 125_000_000, maxAmount: 140_000_000, currency: "USD" }, "ko-KR", "USD 125,000,000 – 140,000,000"],
  ];
  for (const [total, locale, want] of cases) eq(formatTotalPrice(total, locale), want, `${JSON.stringify(total)} @ ${locale}`);
});
await check("F6 one business truth: the page and the integration producer read the SAME canonical record — editing it in the snapshot moves both (no second facts object)", () => {
  const edit = (ps: Project[]) => {
    const p = ps.find((x) => x.id === "bi-17")!;
    p.totalPrice = { kind: "exact", amount: 13_000_000, currency: "KRW" };
    p.area = { value: 112, unit: "m2", basis: "exclusive" };
    p.workScopeIds = ["living_room"];
  };
  const c = ctxOf({ mutate: edit });
  const d = detail(c, "bi-17");
  eq([pair(d, "totalPrice"), pair(d, "area"), pair(d, "workScopes")], [["총 공사비", "1,300만 원"], ["전용면적", "112 m²"], ["주요 공사 범위", "거실"]], "page");
  const planned = planRoutes(template.routes, createContentReader(c.snap.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
  const rec = emitIntegration({ snapshot: c.snap, declaredRoutes: template.routes, plannedRoutes: planned }).portfolio!.document.records.find((r) => r.id === "bi-17")!;
  eq([rec.pricing?.total, rec.property?.area, rec.workScopeIds], [{ kind: "exact", amount: 13_000_000, currency: "KRW" }, { value: 112, unit: "m2", basis: "exclusive" }, ["living_room"]], "producer");
});
await check("F7 the facts never ship the raw basis / ids: labels and words only (no \"basis\", \"exclusive\", \"partial_remodel\", \"living_room\" in any fact)", () => {
  for (const id of ids) {
    for (const f of detail(ko, id).facts) assert(!/basis|supply|exclusive|unknown|_remodel|[a-z]+_[a-z]+/.test(`${f.label} ${f.value}`), `${id}: raw token in "${f.label} = ${f.value}"`);
  }
});

console.log(`\ndetail-facts: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
