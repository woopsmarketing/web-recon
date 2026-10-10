// contract-simplified.mjs — executable mirror of contract rev 9.3 §14.3 (EV1–EV4, PB4, GR2/GR3, VB4's interval).
// VB4's rules on reading an utterance (a compound of classes is absent, a correction names the area) are the
// consumer's parser's to keep; this checker starts from V, as §19 does, and does not mirror them.
//
// Run:   node docs/result/interior-portfolio-v0.2/proof/contract-simplified.mjs
//        (contract-simplified.txt, next to this file, is that command's stdout, redirected)
// Reads: docs/reports/integration/07-integration-contract-v0.2-candidate.md  (anchors + §7.3 vocabulary)
//        platform/test/golden/portfolio-v0.2/portfolio.d56509c8100a56fdf9644baff78ff9e1.json
//                                                                            (the 19 records, as emitted)
// Writes nothing. Exit code 1 if any property FAILs.
//
// Rev 9.3 (2026-10-10). This file is a drift guard on the LIVE contract (P0), not a frozen proof of
// one revision, so it moves with the contract: V.area is an interval (VB4), the area tier has four
// values on gap/base (EV3), the tuple has eight entries (EV4), and P9 is new. The run recorded for
// rev 9.2.1 is in git history (44a48a0).
//
// The corpus. Through rev 9.2.1 the records were read from data/sites/boost-interior-demo/content/
// projects.json. That file has held 8 of the 19 since the record truth split of 2026-09-29 (f93e04a)
// and this checker has failed on it since. The golden V0.2 package is those 19 as emitted, and the
// bytes the consumer's own tests read (sha256 pinned in P0). Under the rev 9.2.1 rules it reproduces
// the recorded rev 9.2.1 output byte for byte.
//
// Rule for this file (DM-1, `32-` §10): every property prints its CONTRACT_PROPOSITION and its
// CHECKER_PROPOSITION in plain words and says whether they are the same proposition. A number is
// quoted only for the proposition the checker actually measures. The checker decides no policy:
// where the contract is silent, the checker says so instead of choosing.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const CONTRACT_PATH = resolve(ROOT, "docs/reports/integration/07-integration-contract-v0.2-candidate.md");
const DATA_PATH = resolve(ROOT, "platform/test/golden/portfolio-v0.2/portfolio.d56509c8100a56fdf9644baff78ff9e1.json");
const DATA_SHA256 = "c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816";
const CONTRACT = readFileSync(CONTRACT_PATH, "utf8");
const DATA_BYTES = readFileSync(DATA_PATH);

// ───────────────────────────────── harness ─────────────────────────────────
const results = [];
let current = null;
function property(id, title, contractProp, checkerProp, same, fn) {
  current = { id, title, contractProp, checkerProp, same, checks: 0, fails: [], info: [] };
  fn();
  results.push(current);
  const c = current;
  console.log(`\n══ ${c.id} — ${c.title}`);
  console.log(`   CONTRACT_PROPOSITION = ${c.contractProp}`);
  console.log(`   CHECKER_PROPOSITION  = ${c.checkerProp}`);
  console.log(`   SAME_PROPOSITION     = ${c.same}`);
  for (const i of c.info) console.log(`   · ${i}`);
  for (const f of c.fails.slice(0, 25)) console.log(`   ✗ ${f}`);
  if (c.fails.length > 25) console.log(`   ✗ … ${c.fails.length - 25} more`);
  console.log(`   RESULT = ${c.fails.length ? "FAIL" : "PASS"}  (${c.checks} checks, ${c.fails.length} failures)`);
}
function check(ok, msg) { current.checks++; if (!ok) current.fails.push(msg); }
function info(msg) { current.info.push(msg); }

// ─────────────────────── §7.3 vocabulary, parsed from the contract ───────────────────────
function parseVocab() {
  const s = CONTRACT.indexOf("**Spaces** —");
  const w = CONTRACT.indexOf("**Works** —");
  const end = CONTRACT.indexOf("Adding an id is a **minor** bump", w);
  if (s < 0 || w < 0 || end < 0) throw new Error("§7.3 tables not found in contract");
  const ids = (txt) => [...txt.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
  return { SPACES: new Set(ids(CONTRACT.slice(s, w))), WORKS: new Set(ids(CONTRACT.slice(w, end))) };
}
const { SPACES, WORKS } = parseVocab();
const VOCAB = new Set([...SPACES, ...WORKS]);

// ─────────────────────── records, loaded from the golden V0.2 package ───────────────────────
// The emitted shape (§10): property.area, pricing.total / pricing.perArea, facets.style.
function loadRecords() {
  const raw = JSON.parse(DATA_BYTES.toString("utf8"));
  return raw.records.map((r) => ({
    id: r.id,
    projectType: r.projectType ?? null,
    ids: r.workScopeIds ? [...r.workScopeIds] : null,
    dropped: false,
    area: r.property && r.property.area ? { value: r.property.area.value, unit: r.property.area.unit, basis: r.property.area.basis ?? null } : null,
    total: r.pricing && r.pricing.total ? { ...r.pricing.total } : null,
    perArea: r.pricing && r.pricing.perArea ? { ...r.pricing.perArea } : null,
    styles: r.facets && r.facets.style && r.facets.style.length ? [...r.facets.style] : null,
    location: r.location ?? null,
  }));
}
const CORPUS = loadRecords();

// ───────────────────────────── the function, §14.3 ─────────────────────────────
// Each function below mirrors one contract rule and nothing else (EV1).
const sOf = (ids) => new Set((ids || []).filter((i) => SPACES.has(i)));
const tOf = (ids) => new Set((ids || []).filter((i) => WORKS.has(i)));
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const subset = (a, b) => [...a].every((x) => b.has(x));

// EV2 — mode
function modeOf(V) {
  if (V.breadth === "whole") return "whole";
  if (V.breadth === "partial" || V.Q.length > 0) return "part";
  return "open";
}
// EV2 — covers
function covers(R, id) {
  return (R.ids || []).includes(id) || (R.projectType === "full_remodel" && SPACES.has(id));
}
// EV2 — the class table, rows 1–9, first match. Returns every holding row too (for CINV-20).
const CLASS_ROWS = [
  { n: 1, mode: "open", test: () => true, cls: "exact" },
  { n: 2, mode: "whole", test: (V, R) => R.projectType === "full_remodel", cls: "exact" },
  { n: 3, mode: "whole", test: () => true, cls: "fallback" },
  { n: 4, mode: "partQ0", test: (V, R) => R.projectType === "partial_remodel", cls: "exact" },
  { n: 5, mode: "partQ0", test: () => true, cls: "fallback" },
  {
    n: 6, mode: "partQ", cls: "exact",
    test: (V, R) => {
      // rooms decide exact, trades never do (WS7a: a partial's works are open); trade-only requests have no exact
      const Rs = sOf(R.ids), Qs = sOf(V.Q);
      return R.projectType === "partial_remodel" && !R.dropped && Qs.size > 0 && setEq(Rs, Qs);
    },
  },
  { n: 7, mode: "partQ", test: (V, R) => R.projectType === "partial_remodel" && (R.ids || []).some((i) => V.Q.includes(i)), cls: "overlap" },
  { n: 8, mode: "partQ", test: (V, R) => V.Q.some((q) => covers(R, q)), cls: "fallback" },
  { n: 9, mode: "partQ", test: () => true, cls: "other" },
];
function rowMode(V) {
  const m = modeOf(V);
  return m === "part" ? (V.Q.length ? "partQ" : "partQ0") : m;
}
function classify(V, R) {
  const rm = rowMode(V);
  const holding = CLASS_ROWS.filter((r) => r.mode === rm && r.test(V, R));
  return { cls: holding.length ? holding[0].cls : undefined, row: holding.length ? holding[0].n : undefined, holding: holding.map((r) => r.n) };
}
// EV3 — tiers
const AREA_RANK = { strong: 0, acceptable: 1, similar: 2, none: 3 }; // rev 9.3: `similar` (≤ 30 %) is the area tier's alone
const PRICE_RANK = { strong: 0, acceptable: 1, none: 2 };
// exact rational arithmetic (BigInt): a decimal as n / 10^k; AR4 factors to m²: py 400/121, sqft 0.09290304
const dec = (x) => { const [i, f = ""] = String(x).split("."); return { n: BigInt(i + f), d: 10n ** BigInt(f.length) }; };
const TO_M2 = { m2: { n: 1n, d: 1n }, pyeong: { n: 400n, d: 121n }, sqft: { n: 9290304n, d: 100000000n } };
function areaM2(a) { const f = TO_M2[a.unit]; if (!f) return null; const v = dec(a.value); return { n: v.n * f.n, d: v.d * f.d }; }
// rationals n/d with d > 0
const rsub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const rcmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const rle = (ka, a, kb, b) => ka * a.n * b.d <= kb * b.n * a.d; // ka·a ≤ kb·b
// VB4 — V.area is an interval with two ends lo ≤ hi. An exact figure v is the single point [v, v]. A class "N평대"
// is the half-open interval N ≤ x < N+10 with ends lo = N and hi = N+9 (the last whole 평): `open` is where it
// stops, one unit above hi. An interval that cannot be read makes the whole V.area absent (no fall-back to a
// figure inside it).
const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
function intervalOf(a) {
  if (!a) return null;
  if (!a.range) return positive(a.value) ? { lo: a.value, hi: a.value, open: null } : null;
  return positive(a.range.min) && positive(a.range.max) && a.range.min <= a.range.max ? { lo: a.range.min, hi: a.range.max, open: a.range.max + 1 } : null;
}
// EV4's areaGap is the gap g itself. It is carried as an exact integer (BigInt) count of 1/(121·10¹⁰) ㎡, a unit
// fine enough for every AR4 unit at two fraction digits; the order does not depend on the unit. (The consumer
// counts 1/12100 ㎡, which is 10⁸ of these.) GAP_NONE is "one fixed value greater than every real gap".
const GAP_UNIT = 121n * 10n ** 10n;
const GAP_NONE = 10n ** 30n;
const gapUnits = (g) => {
  const x = g.n * GAP_UNIT;
  if (x % g.d !== 0n) throw new Error("an area with more fraction digits than this checker's unit holds — outside its domain");
  return x / g.d;
};
const fmtGap = (g) => (g === GAP_NONE ? "none" : g % 10n ** 8n === 0n ? Number(g / 10n ** 8n) : `${g}e-8`);
const showT = (t) => JSON.stringify(t.map((x) => (typeof x === "bigint" ? fmtGap(x) : x)));
const J = (o) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));
function areaTier(V, R, mode) {
  const I = intervalOf(V.area);
  if (!I) return { tier: "none", note: null }; // no area stated, or an unreadable interval: absent (VB4)
  if (!(mode === "whole" || mode === "open")) return { tier: "none", note: "not_applied" };
  if (!R.area) return { tier: "none", note: "missing" };
  if (V.area.basis && R.area.basis && V.area.basis !== R.area.basis) return { tier: "none", note: "not_comparable" };
  const lo = areaM2({ value: I.lo, unit: V.area.unit }), hi = areaM2({ value: I.hi, unit: V.area.unit }), r = areaM2(R.area);
  if (!lo || !hi) return { tier: "none", note: null }; // V.area: an unresolvable unit makes it absent (§14.3.1)
  if (!r) return { tier: "none", note: "missing" }; // an unrecognised unit is an unknown value (§12): the area cannot be read (GR2)
  // gap g and base b: below the interval → to lo, judged against lo; above → to hi, against hi; inside → 0.
  // Above is r > v for an exact figure and r ≥ N+10 for a class: an area between N+9 and N+10 is inside.
  const open = I.open === null ? null : areaM2({ value: I.open, unit: V.area.unit });
  const below = rcmp(r, lo) < 0, above = open ? rcmp(r, open) >= 0 : rcmp(r, hi) > 0;
  const g = below ? rsub(lo, r) : above ? rsub(r, hi) : { n: 0n, d: 1n };
  const b = below ? lo : hi;
  const tier = rle(10n, g, 1n, b) ? "strong" : rle(5n, g, 1n, b) ? "acceptable" : rle(10n, g, 3n, b) ? "similar" : "none";
  const approximate = !V.area.basis || !R.area.basis;
  // areaExact: computed, g = 0 and BOTH bases known (hence equal). areaGap: g inside strong/acceptable/similar.
  return { tier, note: null, approximate, exact: g.n === 0n && !approximate, gap: g };
}
const cents = (x) => BigInt(Math.round(x * 100)); // §9: ≤ 2 fraction digits, ≤ 1e9 ⇒ exact
function interval(x, isBudget) {
  if (x.kind === "exact") return [cents(x.amount), cents(x.amount)];
  if (x.kind === "range") return [cents(x.minAmount), cents(x.maxAmount)];
  if (isBudget && x.kind === "max") return [0n, cents(x.amount)];
  return null;
}
function priceTierOf(budget, total) {
  const B = interval(budget, true), P = interval(total, false);
  if (!B || !P) return "none";
  let g, b;
  if (P[1] < B[0]) { g = B[0] - P[1]; b = B[0]; }
  else if (P[0] > B[1]) { g = P[0] - B[1]; b = B[1]; }
  else return "strong";
  return 10n * g <= b ? "strong" : 5n * g <= b ? "acceptable" : "none";
}
function priceTier(V, R, mode, cls) {
  if (!V.budget) return { tier: "none", note: null };
  if (!(mode === "whole" || mode === "part") || cls !== "exact") return { tier: "none", note: "not_applied" };
  if (!R.total) return { tier: "none", note: "missing" };
  if (R.total.currency !== V.budget.currency) return { tier: "none", note: "not_comparable" };
  return { tier: priceTierOf(V.budget, R.total), note: null };
}
// EV3 coverage counts LISTED ids only; PT4(b) decides the class (row 8), not the coverage (rev 9.2 correction found by P3).
const coverage = (V, R) => V.Q.filter((q) => (R.ids || []).includes(q)).length;
function styleTier(V, R) {
  if (!V.styles.length) return "none";
  return R.styles && R.styles.some((s) => V.styles.includes(s)) ? "match" : "none";
}
// The evaluation of one record: EV2 then EV3. Nothing else writes these values.
function evaluate(V, R) {
  const mode = modeOf(V);
  const c = classify(V, R);
  const a = areaTier(V, R, mode);
  const p = priceTier(V, R, mode, c.cls);
  return {
    id: R.id, mode, matchClass: c.cls, row: c.row,
    area: a.tier, areaNote: a.note, price: p.tier, priceNote: p.note,
    coverage: coverage(V, R), style: styleTier(V, R),
    // EV3's two finer readings of the area comparison. Not tiers; defined for every record.
    areaExact: a.exact === true ? 0 : 1,
    areaGap: a.tier === "none" || !a.gap ? GAP_NONE : gapUnits(a.gap),
    areaApproximate: a.approximate === true,
  };
}
// EV4 — the tuple and the order
const CLASS_RANK = { exact: 0, overlap: 1, fallback: 2, other: 3 };
// ( classRank, areaRank, priceRank, −coverage, areaExact, styleRank, areaGap, id ) — eight entries, ascending
const NUM = 7; // the entries before id
const tupleOf = (e) => [CLASS_RANK[e.matchClass], AREA_RANK[e.area], PRICE_RANK[e.price], -e.coverage, e.areaExact, e.style === "match" ? 0 : 1, e.areaGap, e.id];
function cmpTuple(a, b) {
  for (let i = 0; i < NUM; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a[NUM] < b[NUM] ? -1 : a[NUM] > b[NUM] ? 1 : 0;
}
function rank(V, records) {
  return records.map((R) => evaluate(V, R)).sort((x, y) => cmpTuple(tupleOf(x), tupleOf(y)));
}
const order = (V, records) => rank(V, records).map((e) => e.id);

// GR2/GR3 + §14.3.6 disclosures — READ the evaluation, never write it (EV1).
function disclose(V, R, ev) {
  const out = [];
  const Qs = [...sOf(V.Q)], Qt = [...tOf(V.Q)];
  const label =
    ev.matchClass === "exact" ? (ev.mode === "open" ? "example: no job named" : "direct answer")
    : ev.matchClass === "overlap" ? (R.dropped ? "reference: recorded scope could not be read in full" : "reference: partial job sharing some of what was asked")
    : ev.matchClass === "fallback" ? (ev.mode === "whole" ? "reference: not recorded as a whole-home remodel" : "reference: whole-home or extent not recorded")
    : "reference: does not list what was asked";
  out.push(label);
  for (const q of Qs) {
    const listed = (R.ids || []).includes(q);
    if (listed) out.push(`includes:${q}`);
    else if (R.projectType === "full_remodel") out.push("ground:집 전체를 리모델링한 사례");
    else if (R.projectType === "partial_remodel" && !R.dropped) out.push(`not_remodelled:${q}`);
  }
  for (const q of Qt) if (!(R.ids || []).includes(q)) out.push(`not_established:${q}`);
  // OQ-6: an exact partial job's total set beside the budget names the listed trades outside Q
  if (V.budget && ev.matchClass === "exact" && ev.mode === "part") {
    const extra = [...tOf(R.ids)].filter((t) => !V.Q.includes(t));
    for (const t of extra) out.push(`extra_trade:${t}`);
    if (extra.length) out.push("total_includes_extra_work");
  }
  if (ev.areaNote) out.push(`area:${ev.areaNote}`);
  if (ev.priceNote) out.push(`price:${ev.priceNote}`);
  return out;
}

// §14.3.6 "Tiers", the area half — the tier in words, only when it was computed. Reads the evaluation (EV1).
function areaWords(V, ev) {
  if (!intervalOf(V.area) || ev.areaNote) return null;
  const isClass = !!V.area.range;
  const w = ev.area === "none" ? "neither"
    : isClass && ev.areaGap === 0n ? "inside the stated range"
    : !isClass && ev.areaExact === 0 ? "the same area"
    : ev.area === "strong" ? "within 10 %" : ev.area === "acceptable" ? "within 20 %" : "within 30 %";
  return ev.areaApproximate ? `${w} (approximate)` : w;
}

// ───────────────────────────── fixtures: queries (V fixed) ─────────────────────────────
const Vq = (id, utterance, breadth, Q, extra = {}) => ({ id, utterance, breadth, Q, area: null, budget: null, styles: [], ...extra });
const py = (value, basis = null) => ({ value, unit: "pyeong", basis });
const won = (amount) => ({ kind: "exact", amount, currency: "KRW" });
const ACCEPT = [
  Vq("A", "34평 전체 5천이면 되나요", "whole", [], { area: py(34), budget: won(50_000_000) }),
  Vq("B", "예산 3천으로 전체 가능해요?", "whole", [], { budget: won(30_000_000) }),
  Vq("C", "주방만 하면 얼마예요", "partial", ["kitchen"]),
  Vq("D", "욕실 하나만", "partial", ["bathroom"]),
  Vq("D2", "욕실 두 개", null, ["bathroom"]),
  Vq("E", "전용 84 아파트 주방", null, ["kitchen"]),
  Vq("F", "50평 전체 1억 넘나요", "whole", [], { area: py(50) }),
  Vq("G", "32평인데 도배랑 바닥만 얼마예요", "partial", ["wallpaper", "flooring"], { area: py(32) }),
  Vq("H", "바닥이랑 거실만", "partial", ["living_room", "flooring"]),
  Vq("I", "현관 수납 (수납⇒built_in_furniture)", null, ["entrance", "built_in_furniture"]),
  Vq("I-alt", "현관 수납 (수납⇒storage)", null, ["entrance", "storage"]),
];
const EXTRA = [
  Vq("X1", "전체 리모델링 사례 보여주세요", "whole", []),
  Vq("X2", "창호 교체하려는데 34평 전체 리모델링", "whole", ["windows"], { area: py(34) }),
  Vq("X3", "주방 포함 34평 전체", "whole", ["kitchen"], { area: py(34) }),
  Vq("X4", "바닥만", "partial", ["flooring"]),
  Vq("X5", "욕실 하나만 700만원", "partial", ["bathroom"], { budget: won(7_000_000) }),
  Vq("X6", "주방만 2천", "partial", ["kitchen"], { budget: won(20_000_000) }),
  Vq("X7", "화이트 톤으로 34평", null, [], { area: py(34), styles: ["화이트"] }),
  Vq("X8", "부분 리모델링 사례", "partial", []),
  Vq("X9", "5천으로 뭐 할 수 있어요", null, [], { budget: won(50_000_000) }),
  Vq("X10", "전용 84 전체", "whole", [], { area: { value: 84, unit: "m2", basis: "exclusive" } }),
  Vq("X11", "1억 이내로 전체 리모델링", "whole", [], { budget: { kind: "max", amount: 100_000_000, currency: "KRW" } }),
  Vq("X12", "600~800만원 예산인데 주방", null, ["kitchen"], { budget: { kind: "range", minAmount: 6_000_000, maxAmount: 8_000_000, currency: "KRW" } }),
  Vq("X13", "주방이랑 욕실만", "partial", ["kitchen", "bathroom"]),
  Vq("X14", "집 전체는 아니고 바닥이랑 도배만", "partial", ["flooring", "wallpaper"]),
  Vq("X15", "주방만 하고 싶어요", "partial", ["kitchen"]),
  Vq("X16", "10억 이내로 전체", "whole", [], { budget: { kind: "max", amount: 1_000_000_000, currency: "KRW" } }),
  Vq("X17", "욕실 타일만", "partial", ["bathroom", "tiling"]),
  Vq("X18", "주방 타일만", "partial", ["kitchen", "tiling"]),
  Vq("X19", "바닥만 1000만원", "partial", ["flooring"], { budget: won(10_000_000) }),
  Vq("X20", "30평 sqft 전체", "whole", [], { area: { value: 1000, unit: "sqft", basis: null } }),
  Vq("X21", "거실만 1200만원", "partial", ["living_room"], { budget: won(12_000_000) }),
];
// Rev 9.3 — §19 rows J–S and the queries the consumer's CLASS-2 fixes. Areas are `supply` here, as in the
// consumer's tests; a class carries its interval (the midpoint in `value` is never read).
const cls = (min, basis = "supply") => ({ value: min + 4.5, unit: "pyeong", basis, range: { min, max: min + 9 } });
const AREA93 = [
  Vq("J", "19평", null, [], { area: py(19, "supply") }),
  Vq("K", "34평", null, [], { area: py(34, "supply") }),
  Vq("K24", "24평", null, [], { area: py(24, "supply") }),
  Vq("K51", "51평", null, [], { area: py(51, "supply") }),
  Vq("Kw34", "34평 전체", "whole", [], { area: py(34, "supply") }),
  Vq("Kw19", "19평 전체", "whole", [], { area: py(19, "supply") }),
  Vq("L", "30평대", null, [], { area: cls(30) }),
  Vq("M", "20평대", null, [], { area: cls(20) }),
  Vq("N", "40평대", null, [], { area: cls(40) }),
  Vq("O", "30평대 화이트 아파트 사례 보여주세요", null, [], { area: cls(30), styles: ["화이트"] }),
  Vq("P", "30평대 전체", "whole", [], { area: cls(30) }),
  Vq("Q", "주방만 · 30평대", "partial", ["kitchen"], { area: cls(30) }),
  Vq("R", "전용 30평대", null, [], { area: cls(30, "exclusive") }),
  Vq("S", "30평대 전체 5천", "whole", [], { area: cls(30), budget: won(50_000_000) }),
];
const ALLQ = [...ACCEPT, ...EXTRA, ...AREA93];
const Q = Object.fromEntries(ALLQ.map((v) => [v.id, v]));

// Synthetic set S1 of 34a §3.1
const syn = (id, projectType, ids, extra = {}) => ({ id, projectType, ids, dropped: false, area: null, total: null, perArea: null, styles: null, location: null, ...extra });
const S1 = [
  syn("P-bath", "partial_remodel", ["bathroom"], { total: won(7_000_000) }),
  syn("P-kb", "partial_remodel", ["kitchen", "bathroom"], { total: won(19_800_000) }),
  syn("P-kit", "partial_remodel", ["kitchen"]),
  syn("F-full", "full_remodel", ["entrance", "kitchen", "bathroom", "flooring", "wallpaper"], { total: won(50_000_000) }),
  syn("F-nobath", "full_remodel", ["kitchen", "flooring", "doors"]),
  syn("U-bath", null, ["bathroom", "tiling"]),
  syn("U-kit", null, ["kitchen"]),
  syn("T-floor", null, ["flooring", "wallpaper", "lighting"], { total: won(11_000_000) }),
];

// ═══════════════════════════════ PROPERTIES ═══════════════════════════════

property("P0", "drift guard — the contract still says what this checker implements",
  "the rules mirrored here (EV1–EV4, PB4, VB4, GR2, GR3, the OQ-6 disclosure) are the ones in force in 07 rev 9.3",
  "each anchor sentence copied from 07 §14.3, §15 and the header is present verbatim; §7.3 parses to 14 Spaces + 12 Works; the corpus is the golden V0.2 package, 19 records, with the sha256 the consumer's tests pin",
  "narrower — an anchor proves the sentence is there, not that the code matches it (P1–P7 do that)",
  () => {
    const anchors = [
      "**Mode**, per query: `whole` if `V.breadth = whole`; else `part` if `V.breadth = partial` or\n> `Q ≠ ∅`; else `open`.",
      "| 6 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel`, no id was dropped from it, and `R_s = Q_s ≠ ∅` | `exact` |",
      "| 7 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel` and shares an id with `Q` | `overlap` |",
      "| 8 | `part`, `Q ≠ ∅` | `R` covers an id of `Q` | `fallback` |",
      "| `price` | `strong` · `acceptable` · `none` | `V.budget` stated, mode `whole` or `part`, and class `exact` | `none` (`not_applied` if `V.budget` stated) |",
      "| `area` | `strong` · `acceptable` · `similar` · `none` | `V.area` stated, and mode `whole` or `open` | `none` (`not_applied` if `V.area` stated) |",
      "( classRank, areaRank, priceRank, −coverage, areaExact, styleRank, areaGap, id )",
      "`strong` 0 · `acceptable` 1 · `similar` 2 · `none` 3; `priceRank` is `strong` 0 · `acceptable` 1 ·",
      "| status | **READY CANDIDATE rev 9.3 —",
      "> - **VB4 (C: MUST; rev 9.3)** — `V.area` is an **interval** in one unit, with that unit and a",
      ">   | an area **class** \"N평대\", `N` ∈ {10, 20, … 90} — 30평대, 전용 20평대 | the half-open interval `N ≤ x < N+10` 평: 10평대 = 10 ≤ x < 20, 30평대 = 30 ≤ x < 40, 90평대 = 90 ≤ x < 100 | `N` · `N+9` |",
      "`N+9`, not `N+10`.",
      ">   | any other range or class — 30~40평, 34평대, 100평대 | absent | — |",
      "cannot be read (an end that is not positive, `lo > hi`) makes the whole `V.area` **absent**",
      ">   | below the interval: `r < lo` | `lo − r` | `lo` |",
      ">   | above it: `r > v` for an exact figure; `r ≥ N+10` for a class | `r − hi` | `hi` |",
      ">   | inside it: `r = v`; `N ≤ r < N+10` | `0` | — |",
      ">   and `g ≤ 0.10·b` ⇒ `strong`; `≤ 0.20·b` ⇒ `acceptable`; `≤ 0.30·b` ⇒ `similar`; otherwise",
      ">   - **`areaExact`** — `0` iff the tier was computed, `g = 0` and **both** bases are known (and",
      ">   - **`areaGap`** — `g` itself, in the one unit of the comparison, when the tier is `strong`,",
      ">     `acceptable` or `similar`; **one fixed value greater than every real gap** when the tier is",
      "| `CINV-26` | **`EV3` area, four values with inclusive bounds**",
      "| `CINV-27` | **`EV4`, the two area readings**",
      "| `CINV-28` | **area neutrality, for the tier and both readings**",
      "> **PB4 (C: MUST) — a missing input is no evidence: never a reward, never a penalty below \"no",
      "Where **no valid value exists** (`projectType` on a record\n>    that names no room), item 2 asks nothing beyond `EV2` and `EV3` as written",
      "> - **Extra trades beside a budget** (`OQ-6`, owner decision).",
      "| `CINV-25` | extra trades beside a budget",
      "Amounts are scaled by 100 first",
      "compared in exact rational arithmetic",
      "**EV1 (C: MUST) — one writer.**",
      "> - **coverage** — the number of ids of `Q` **listed** in `R.workScopeIds`. `PT4`(b) decides a",
      "class and all four tiers **together**",
      "| `other` | `part` | a job that does not **list** what was asked. It is never said to lack it (below) |",
    ];
    for (const a of anchors) check(CONTRACT.includes(a), `anchor missing from contract: ${a.slice(0, 90)}…`);
    check(SPACES.size === 14 && WORKS.size === 12, `vocabulary parse: ${SPACES.size} spaces, ${WORKS.size} works`);
    check(CORPUS.length === 19, `corpus has ${CORPUS.length} records`);
    const sha = createHash("sha256").update(DATA_BYTES).digest("hex");
    check(sha === DATA_SHA256, `golden package sha256 ${sha}`);
    info(`vocabulary ${SPACES.size}+${WORKS.size} ids from §7.3; ${CORPUS.length} records from the golden V0.2 package (sha256 ${sha.slice(0, 8)}…${sha.slice(-4)})`);
  });

// ─── enumeration shared by P1 and P3/P4 ───
const EVOC = ["kitchen", "bathroom", "living_room", "flooring", "wallpaper"];
const powerset = (xs) => xs.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
const ENUM_RECORDS = [];
for (const ids of powerset(EVOC)) {
  for (const pt of ["full_remodel", "partial_remodel", null]) {
    for (const dropped of [false, true]) {
      const hasSpace = ids.some((i) => SPACES.has(i));
      // validity of the *document* (INV-28/29/30, WS5): a typed record carries a Spaces id;
      // with dropped=true the unknown id may be the Spaces id, so the consumer-visible set may lack one.
      if (pt && !hasSpace && !dropped) continue;
      ENUM_RECORDS.push(syn(`e-${pt || "none"}-${ids.join("+") || "∅"}${dropped ? "-dr" : ""}`, pt, ids.length ? ids : null, { dropped }));
    }
  }
}
const ENUM_QUERIES = [];
for (const breadth of ["whole", "partial", null]) for (const q of powerset(EVOC)) ENUM_QUERIES.push(Vq(`q-${breadth}-${q.join("+") || "∅"}`, "", breadth, q));

property("P1", "EV2 totality and single-valuedness (CINV-20)",
  "every record gets exactly one class, from the lowest-numbered row of the EV2 table that holds; every row can fire",
  "over 96 enumerated queries × every enumerated valid record (count printed): the class is defined, it equals the class of the lowest-numbered holding row, and each of rows 1–9 is the deciding row for ≥1 input",
  "same proposition, over a finite 5-id vocabulary (a record's class depends on ids only through set relations with Q, so a 5-id vocabulary with both kinds reaches every row)",
  () => {
    const decided = new Map();
    let n = 0;
    for (const V of ENUM_QUERIES) for (const R of ENUM_RECORDS) {
      const c = classify(V, R); n++;
      check(c.cls !== undefined, `no class: ${V.id} × ${R.id}`);
      check(c.row === Math.min(...c.holding), `not first match: ${V.id} × ${R.id}`);
      decided.set(c.row, (decided.get(c.row) || 0) + 1);
    }
    for (let r = 1; r <= 9; r++) check(decided.has(r), `row ${r} never decides`);
    info(`${n} inputs; deciding-row counts: ${[...decided.entries()].sort((a, b) => a[0] - b[0]).map(([r, k]) => `r${r}=${k}`).join(" ")}`);
    info(`records enumerated: ${ENUM_RECORDS.length} (valid under INV-28/29/30 + WS8 drop)`);
  });

property("P2", "EV4 order is total, antisymmetric, transitive and deterministic (CINV-21, B9-2)",
  "for any query the tuple order decides every pair of records, is transitive, and two runs over one snapshot give one order; every tuple component is defined for every record",
  `for every fixture query (${ALLQ.length}) over the ${CORPUS.length} records and over S1: every component is a finite number, an exact integer (areaGap) or a string; for every ordered pair cmp≠0 and cmp(a,b)=−cmp(b,a); for every triple a<b<c ⇒ a<c; 50 seeded shuffles sort to one order`,
  "same proposition on the fixture set; totality for all queries follows from the tuple's shape (P0 anchors it) and is not enumerated beyond the fixtures",
  () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const set of [CORPUS, S1]) for (const V of ALLQ) {
      const tups = set.map((R) => tupleOf(evaluate(V, R)));
      for (const t of tups) check(t.length === NUM + 1 && t.slice(0, NUM).every((x) => typeof x === "bigint" || Number.isFinite(x)) && typeof t[NUM] === "string", `undefined component ${V.id} ${t}`);
      for (const a of tups) for (const b of tups) if (a !== b) {
        const x = cmpTuple(a, b), y = cmpTuple(b, a);
        check(x !== 0 && x === -y, `pair ${V.id} ${a[NUM]}/${b[NUM]}`);
      }
      for (const a of tups) for (const b of tups) for (const c of tups) {
        if (cmpTuple(a, b) < 0 && cmpTuple(b, c) < 0) check(cmpTuple(a, c) < 0, `intransitive ${V.id} ${a[NUM]}<${b[NUM]}<${c[NUM]}`);
      }
      const ref = order(V, set).join(",");
      for (let k = 0; k < 50; k++) {
        const sh = [...set];
        for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
        check(order(V, sh).join(",") === ref, `nondeterministic ${V.id}`);
      }
    }
    // the old cycle trio (32- §5, B9-2) on row A. It must be a chain. Under rev 9.2.1 the chain was
    // bi-04 < bi-17 < bi-15 (bi-04 and bi-17 tied to id); under rev 9.3 areaGap puts bi-17 (공급 112㎡,
    // 0.12평 from 34평) before bi-04 (32평, 2평 away). Still a chain — that is what O-2 is about.
    const tA = Object.fromEntries(CORPUS.map((R) => [R.id, tupleOf(evaluate(Q.A, R))]));
    check(cmpTuple(tA["bi-17"], tA["bi-04"]) < 0 && cmpTuple(tA["bi-04"], tA["bi-15"]) < 0 && cmpTuple(tA["bi-17"], tA["bi-15"]) < 0, "O-2 trio not a chain bi-17<bi-04<bi-15");
    info(`O-2: row A bi-17 ${showT(tA["bi-17"])} < bi-04 ${showT(tA["bi-04"])} < bi-15 ${showT(tA["bi-15"])}  (rev 9.2.1: bi-04 < bi-17 on id; areaGap is printed in the consumer's unit, 1/12100 ㎡)`);
  });

// ─── PB4 fills ───
function validFills(V, R, input) {
  const hasSpaceIn = (ids) => (ids || []).some((i) => SPACES.has(i));
  const f = [];
  if (input === "projectType") {
    // valid when a Spaces id is visible, or when a dropped id may itself be one (WS8)
    for (const pt of ["full_remodel", "partial_remodel"]) if (hasSpaceIn(R.ids) || R.dropped) f.push({ ...R, projectType: pt });
  } else if (input === "workScopeIds") {
    const cands = new Map();
    const add = (ids) => { if (ids.length) cands.set([...ids].sort().join("+"), ids); };
    for (const id of VOCAB) add([id]);
    add(V.Q); add([...sOf(V.Q)]); add([...tOf(V.Q)]);
    if (R.ids) add(R.ids);
    for (const ids of cands.values()) {
      if (R.projectType && !hasSpaceIn(ids)) continue; // INV-28/29/30
      f.push({ ...R, ids: [...ids] });
    }
  } else if (input === "droppedId") {
    // the unknown id, resolved: as a room outside Q, or as a trade outside Q
    for (const extra of ["zz_space", "zz_work"]) f.push({ ...R, dropped: false, ids: [...(R.ids || []), extra], _extraKind: extra });
  } else if (input === "area") {
    // an area inside the request, one within 20 %, one within 30 % (rev 9.3), one far away; and the other basis
    const base = intervalOf(V.area) ? V.area : py(34);
    const ref = base.range ? base.range.min : base.value;
    for (const k of [1, 1.15, 0.75, 10]) f.push({ ...R, area: { value: Math.round(ref * k * 100) / 100, unit: base.unit, basis: base.basis || "supply" } });
    f.push({ ...R, area: { value: ref, unit: base.unit, basis: base.basis === "exclusive" ? "supply" : "exclusive" } });
  } else if (input === "total") {
    // §9: a valid amount is positive and ≤ 1,000,000,000 — fills are clamped into that range
    const hi = !V.budget ? 50_000_000 : V.budget.kind === "range" ? V.budget.maxAmount : V.budget.amount;
    const clamp = (x) => Math.min(1_000_000_000, Math.max(1, Math.round(x)));
    for (const amt of new Set([hi, hi * 10, 1, 1_000_000_000].map(clamp))) f.push({ ...R, total: won(amt) });
  } else if (input === "styles") {
    f.push({ ...R, styles: [...(V.styles.length ? [V.styles[0]] : []), "zz_style"] });
    f.push({ ...R, styles: ["zz_style"] });
  }
  return f;
}
function deleted(R, input) {
  if (input === "projectType") return R.projectType ? { ...R, projectType: null } : null;
  if (input === "workScopeIds") return R.ids && !R.projectType ? { ...R, ids: null } : null; // WS7c: a typed record must carry ids
  if (input === "droppedId") return { ...R, dropped: true };
  if (input === "area") return R.area ? { ...R, area: null } : null;
  if (input === "total") return R.total ? { ...R, total: null } : null;
  if (input === "styles") return R.styles ? { ...R, styles: null } : null;
  return null;
}
// SPACES/WORKS must know the synthetic resolutions of a dropped id
SPACES.add("zz_space"); WORKS.add("zz_work");

property("P3", "PB4 missing-neutrality (CINV-5, B9-1) — the NEW property; 4a and 4b are not measured here",
  "for every query, record and listed input: the record with the input missing is evaluated (class and all four tiers together, with areaExact and areaGap) as with the least favourable valid value of that input; where every valid value gives positive evidence on the tier the input feeds, as that value with the tier at its last value; where no valid value exists, PB4 2 asks nothing beyond EV2/EV3; deletion never raises the tuple; no record is removed; rank may fall",
  `(i) every fixture query (${ALLQ.length}) × every record (${CORPUS.length} corpus + ${S1.length} S1) × each input PB4 lists: for a record that HAS the input, the input is deleted; for a record that LACKS it natively (e.g. bi-15 area, bi-01…bi-08 total), the record is compared as it stands; (ii) the same over the enumerated queries × records for projectType, workScopeIds and a dropped id. Where validFills() (INV-28/29/30 and §9 respected) is non-empty, tuple(missing) minus id must equal the worst fill's, or — only when the input feeds a tier and every fill gives that tier positive evidence — the worst fill's with that tier at its last value. Where validFills() is EMPTY (e.g. bi-05/bi-19 projectType) the case is COUNTED, NOT ASSERTED. Separately, for every deletion: tuple(deleted) ≥ tuple(actual). Every query returns every record`,
  "narrower — 'least favourable valid value' is taken over the finite domain validFills() lists, which for each input includes a value giving no positive evidence whenever one exists (the other projectType, an id set disjoint from Q, a far area, a far or tiny total within §9, a style not asked). A domain that missed the true worst could hide a rewarded missing input from the equality check; the separate 'never rises' check does not depend on the domain. The no-valid-value count is a count of cases where the contract asks nothing, not evidence of a pass",
  () => {
    const inputs = ["projectType", "workScopeIds", "droppedId", "area", "total", "styles"];
    // tuple positions the input feeds, the tier first; and each position's last ("no evidence") value.
    // The area feeds its tier and the two readings EV3 derives from it (areaExact, areaGap).
    const FED = { area: [1, 4, 6], total: [2], styles: [5] };
    const LAST = { 1: 3, 2: 2, 4: 1, 5: 1, 6: GAP_NONE };
    const worstOf = (ts) => ts.reduce((w, t) => (cmpTuple([...t, ""], [...w, ""]) > 0 ? t : w));
    const stat = { equal: 0, allPositive: 0, noValid: 0 };
    const byInput = Object.fromEntries(inputs.map((i) => [i, 0]));
    // compare a record with the input missing (M) against the fills of the record that had it (R)
    function compare(tag, V, R, M, input) {
      const fills = validFills(V, R, input);
      if (!fills.length) { stat.noValid++; return; } // no valid value: the no-evidence value is all there is
      const tm = tupleOf(evaluate(V, M)).slice(0, NUM);
      const worst = worstOf(fills.map((F) => tupleOf(evaluate(V, F)).slice(0, NUM)));
      if (tm.join() === worst.join()) { stat.equal++; return; }
      const fed = FED[input];
      if (fed !== undefined && worst[fed[0]] < LAST[fed[0]]) {
        const expect = [...worst]; for (const k of fed) expect[k] = LAST[k];
        check(tm.join() === expect.join(), `${tag}: missing ${tm} ≠ worst fill with no-evidence ${input} ${expect}`);
        stat.allPositive++; return;
      }
      check(false, `${tag}: missing ${tm} ≠ worst fill ${worst}`);
    }
    const native = (R, input) =>
      input === "projectType" ? !R.projectType : input === "workScopeIds" ? !R.ids : input === "area" ? !R.area
      : input === "total" ? !R.total : input === "styles" ? !R.styles : false;
    let pairs = 0, nativeN = 0, rankDown = 0, rankSame = 0, rankUp = 0;
    for (const set of [CORPUS, S1]) for (const V of ALLQ) {
      const baseOrder = order(V, set);
      check(baseOrder.length === set.length, `record removed: ${V.id}`);
      for (const R of set) {
        const ta = tupleOf(evaluate(V, R));
        for (const input of inputs) {
          if (native(R, input)) { nativeN++; compare(`native ${V.id} ${R.id} ${input}`, V, R, R, input); continue; }
          const D = deleted(R, input);
          if (!D) continue;
          pairs++; byInput[input]++;
          compare(`${V.id} ${R.id} del(${input})`, V, R, D, input);
          const td = tupleOf(evaluate(V, D));
          check(cmpTuple([...td.slice(0, NUM), ""], [...ta.slice(0, NUM), ""]) >= 0, `${V.id} ${R.id} del(${input}) RAISED the tuple: ${td} < ${ta}`);
          const after = order(V, set.map((x) => (x.id === R.id ? D : x)));
          const b = baseOrder.indexOf(R.id), a = after.indexOf(R.id);
          if (a > b) rankDown++; else if (a === b) rankSame++; else rankUp++;
        }
      }
    }
    let enumPairs = 0;
    for (const V of ENUM_QUERIES) for (const R of ENUM_RECORDS) {
      const ta = tupleOf(evaluate(V, R));
      for (const input of ["projectType", "workScopeIds", "droppedId"]) {
        if (input === "droppedId" && R.dropped) continue;
        if (native(R, input)) { nativeN++; compare(`enum native ${V.id} ${R.id} ${input}`, V, R, R, input); continue; }
        const D = deleted(R, input); if (!D) continue;
        enumPairs++;
        compare(`enum ${V.id} ${R.id} del(${input})`, V, R, D, input);
        check(cmpTuple([...tupleOf(evaluate(V, D)).slice(0, NUM), ""], [...ta.slice(0, NUM), ""]) >= 0, `enum ${V.id} ${R.id} del(${input}) RAISED the tuple`);
      }
    }
    info(`fixture deletions ${pairs} (by input: ${Object.entries(byInput).map(([k, v]) => `${k}=${v}`).join(" ")}); enumeration deletions ${enumPairs}; natively-missing comparisons ${nativeN}`);
    info(`outcomes: equal to least favourable valid value ${stat.equal} (asserted); every valid value positive ⇒ fed tier at its last value ${stat.allPositive} (asserted); no valid value exists ${stat.noValid} (counted, NOT asserted — PB4 2 asks nothing there)`);
    info(`REPORTED, NOT ASSERTED — global rank after deletion: down ${rankDown}, unchanged ${rankSame}, up ${rankUp}. PB4 allows 'down'; 'never rises' is asserted on the tuple above`);
    // MN-1 … MN-6 of 34a §3.2 (MN-6 as amended in 34a §7), and CINV-5's 10억 fixture.
    // MN-4 is superseded by rev 9.3: 34a's hand value is rank 1 → 3. bi-12 (26평) is now `similar` for 34평,
    // so it precedes a record with no area (`none`), and bi-09 without its area falls to 4th. PB4 allows a fall.
    const pos = (V, set, id) => order(V, set).indexOf(id) + 1;
    const swap = (set, D) => set.map((x) => (x.id === D.id ? D : x));
    const bi = (id) => CORPUS.find((r) => r.id === id);
    const mn = [
      ["MN-1", Q.B, "bi-09", "projectType", "fallback", 4, 13],
      ["MN-2", Q.D, "bi-15", "projectType", "fallback", 1, 9],
      ["MN-3", Q.D, "bi-07", "projectType", "other", 10, 14],
      ["MN-4", Q.A, "bi-09", "area", "exact", 1, 4],
      ["MN-5", Q.A, "bi-09", "total", "exact", 1, 2],
      ["MN-6", Q.G, "bi-19", "workScopeIds", "other", 4, 19],
    ];
    for (const [tag, V, id, input, cls, before, after] of mn) {
      const D = deleted(bi(id), input);
      const got = [evaluate(V, D).matchClass, pos(V, CORPUS, id), pos(V, swap(CORPUS, D), id)];
      check(got.join() === [cls, before, after].join(), `${tag}: expected ${cls} ${before}→${after}, got ${got.join(" ")}`);
      info(`${tag} ${V.id} ${id} del(${input}): ${got[0]}, rank ${got[1]} → ${got[2]}${tag === "MN-4" ? "  (rev 9.2.1 and 34a §3.2: 1 → 3; rev 9.3: bi-12 is `similar` and precedes it)" : ""}`);
    }
    const e10 = evaluate(Q.X16, deleted(bi("bi-09"), "total")), f10 = validFills(Q.X16, bi("bi-09"), "total").map((F) => evaluate(Q.X16, F).price);
    check(e10.price === "none" && f10.every((t) => t === "strong"), `CINV-5 10억 fixture: deleted ${e10.price}, fills ${f10}`);
    info(`CINV-5 10억 이내 × bi-09 del(total): price ${e10.price}; every valid fill ${[...new Set(f10)]}`);
  });

property("P4", "EV2 partial ladder (CINV-4, B9-4)",
  "in mode part with something named, only a partial_remodel is exact, every exact record meets row 6, and a request naming no room (Q_s = ∅) has no exact; the class order is exact < overlap < fallback < other",
  "over the enumeration of P1 and every fixture query: in rowMode partQ every exact record is a partial_remodel decided by row 6, and no record is exact when Q_s = ∅; in each fixture order the class ranks are non-decreasing",
  "same proposition",
  () => {
    let n = 0;
    for (const V of [...ENUM_QUERIES, ...ALLQ]) {
      if (rowMode(V) !== "partQ") continue;
      for (const R of [...ENUM_RECORDS, ...CORPUS, ...S1]) {
        const c = classify(V, R); n++;
        if (c.cls === "exact") check(R.projectType === "partial_remodel" && c.row === 6, `exact not a row-6 partial: ${V.id} ${R.id}`);
        if (sOf(V.Q).size === 0) check(c.cls !== "exact", `exact on a trade-only request: ${V.id} ${R.id}`);
      }
    }
    for (const V of ALLQ) {
      const cls = rank(V, CORPUS).map((e) => CLASS_RANK[e.matchClass]);
      check(cls.every((c, i) => i === 0 || cls[i - 1] <= c), `class not a prefix order: ${V.id}`);
    }
    info(`${n} part-mode (query, record) inputs checked`);
  });

property("P5", "EV1 single writer (CINV-14, B9-3)",
  "only EV2 assigns a class and only EV3 assigns a tier; every other rule reads them and changes nothing",
  "(a) the disclosure step receives a deep-frozen evaluation, runs over every fixture query × record without a write, and the evaluation is byte-identical afterwards; (b) in 07, every blockquoted paragraph OUTSIDE §14.3 that states a class with an assignment phrase (is/are/becomes/returns/gets/classed … `exact`|`overlap`|`fallback`|`other`) attributes it to `EV2` or `EV3` in the same paragraph; such paragraphs inside §14.3 but outside §14.3.2–§14.3.3 are listed for review, not failed",
  "narrower — (a) tests the checker's own disclose(), not the contract: it is what makes P1–P4 evidence for EV2/EV3 alone. (b) is a lexical scan and cannot see an assignment phrased some other way; the fresh review is the check for that",
  () => {
    const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };
    let n = 0;
    for (const set of [CORPUS, S1]) for (const V of ALLQ) for (const R of set) {
      const ev = deepFreeze(evaluate(V, R));
      const before = J(ev);
      let threw = null;
      try { disclose(V, R, ev); areaWords(V, ev); } catch (e) { threw = e; }
      n++;
      check(!threw && J(ev) === before, `disclosure wrote evaluation: ${V.id} ${R.id}`);
    }
    info(`(a) ${n} disclosures over frozen evaluations`);
    const lines = CONTRACT.split("\n");
    const s143 = lines.findIndex((l) => l.startsWith("### 14.3 "));
    const e143 = lines.findIndex((l) => l.startsWith("### 14.4 "));
    const def0 = lines.findIndex((l) => l.startsWith("#### 14.3.2"));
    const def1 = lines.findIndex((l) => l.startsWith("#### 14.3.4"));
    const pat = /\b(is|are|becomes|returns|gets|classed as|class is)\s+(\*\*)?`(exact|overlap|fallback|other)`/;
    // blockquoted paragraphs: maximal runs of lines starting with ">" separated by a bare ">" line
    const paras = []; let cur = null;
    lines.forEach((l, i) => {
      if (l.startsWith(">") && l.trim() !== ">") { if (!cur) { cur = { start: i, text: [] }; paras.push(cur); } cur.text.push(l); }
      else cur = null;
    });
    let outside = 0, review = 0;
    for (const p of paras) {
      const hitIdx = p.text.findIndex((l) => pat.test(l));
      if (hitIdx < 0) continue;
      const ln = p.start + hitIdx;
      const where = `07:${ln + 1}: ${p.text[hitIdx].trim().slice(0, 100)}`;
      if (ln >= def0 && ln < def1) continue; // the defining rules themselves
      if (ln >= s143 && ln < e143) { review++; info(`    review (inside §14.3): ${where}`); continue; }
      outside++;
      const attributed = p.text.some((l) => l.includes("`EV2`") || l.includes("`EV3`"));
      info(`    outside §14.3, ${attributed ? "attributed to EV2/EV3" : "NOT attributed"}: ${where}`);
      check(attributed, `class stated outside §14.3 without attribution: ${where}`);
    }
    info(`(b) paragraphs with an assignment phrase: ${outside} outside §14.3, ${review} inside §14.3 listed for review`);
  });

property("P6", "EV3 price only inside exact; no per-area comparison (CINV-6, OD-O, PB2)",
  "a total budget is compared with a record's total only when the record is exact in mode whole or part; a perArea amount is never compared; when an exact partial job's total is set beside the budget, the trades it lists outside Q are named and the total is said to include them (OQ-6, CINV-25)",
  "for every fixture query × record: price tier ≠ none ⇒ class exact and mode ∈ {whole, part}; a stated budget on a record not compared carries the note not_applied; replacing every record's pricePerArea with a random amount leaves every tuple unchanged; for every exact record in mode part with a budget, the disclosure step emits extra_trade:<t> for each listed Works id outside Q and total_includes_extra_work iff there is one; CINV-25's fixtures",
  "same proposition for the price half; the perArea half is structural — evaluate() never reads perArea — and only guards against a future edit; the OQ-6 half checks the checker's disclosure step, not the reply's wording, which is reviewed",
  () => {
    let n = 0;
    for (const set of [CORPUS, S1]) for (const V of ALLQ) for (const R of set) {
      const e = evaluate(V, R); n++;
      if (e.price !== "none") check(e.matchClass === "exact" && (e.mode === "whole" || e.mode === "part"), `price compared outside exact: ${V.id} ${R.id}`);
      if (V.budget && !(e.matchClass === "exact" && (e.mode === "whole" || e.mode === "part"))) check(e.priceNote === "not_applied", `no not_applied note: ${V.id} ${R.id}`);
      const R2 = { ...R, perArea: { amount: 1 + ((n * 7919) % 5_000_000), currency: "KRW", unit: "pyeong" } };
      check(tupleOf(evaluate(V, R2)).join() === tupleOf(e).join(), `perArea changed a tuple: ${V.id} ${R.id}`);
    }
    info(`${n} (query, record) pairs`);
    const pt = (V, id) => evaluate(V, CORPUS.find((r) => r.id === id)).price;
    const exp = [[Q.B, "bi-11", "strong"], [Q.A, "bi-09", "strong"], [Q.A, "bi-12", "strong"], [Q.A, "bi-11", "none"], [Q.X5, "bi-15", "strong"], [Q.X5, "bi-16", "none"], [Q.X11, "bi-10", "strong"], [Q.X11, "bi-13", "none"], [Q.X9, "bi-09", "none"], [Q.X19, "bi-19", "none"], [Q.X19, "bi-17", "none"]];
    for (const [V, id, t] of exp) { const g = pt(V, id); check(g === t, `${V.id} ${id} price ${g}, expected ${t}`); info(`${V.id} ${id}: price ${g}`); }
    check(CORPUS.every((R) => evaluate(Q.X19, R).matchClass !== "exact"), "바닥만 1000만원: a record is exact");
    let nx = 0;
    for (const set of [CORPUS, S1]) for (const V of ALLQ) for (const R of set) {
      const e = evaluate(V, R);
      if (!(V.budget && e.matchClass === "exact" && e.mode === "part")) continue;
      const extra = [...tOf(R.ids)].filter((t) => !V.Q.includes(t)), d = disclose(V, R, e);
      check(extra.every((t) => d.includes(`extra_trade:${t}`)) && d.includes("total_includes_extra_work") === extra.length > 0, `OQ-6 disclosure: ${V.id} ${R.id}`);
      nx++;
    }
    const b17 = CORPUS.find((r) => r.id === "bi-17"), e17 = evaluate(Q.X21, b17), d17 = disclose(Q.X21, b17, e17);
    check(e17.matchClass === "exact" && e17.price === "strong" && d17.includes("extra_trade:flooring") && d17.includes("total_includes_extra_work"), `CINV-25 거실만 1200만원 × bi-17: ${e17.matchClass} ${e17.price} ${d17.join(" | ")}`);
    const b15 = CORPUS.find((r) => r.id === "bi-15"), d15 = disclose(Q.X5, b15, evaluate(Q.X5, b15));
    check(!d15.some((x) => x.startsWith("extra_trade:")), "CINV-25 욕실 하나만 700만원 × bi-15: extra trade stated");
    info(`OQ-6: ${nx} exact part-mode records with a budget; CINV-25 거실만 1200만원 × bi-17: ${e17.matchClass}, price ${e17.price}, ${d17.filter((x) => /extra/.test(x)).join(" | ")}`);
  });

property("P7", "Hand examples of 34a §3 re-executed",
  "the hand-computed outcomes of 34a §3.1, §3.4 and §3.5 (as amended by 34a §6 and §7) follow from the contract — except the two full orders rev 9.3 changes below the top three (O-6, row A), where the rev 9.3 order follows instead",
  "each expected class / order / top-3 of 34a §3, with the cells 34a §6 (†, checker-found) and §7 (‡, fresh review) amend, is reproduced by the functions above; for O-6 and row A's full order the rev 9.3 order is asserted, the rev 9.2.1 hand order is asserted to DIFFER from it, and both are printed",
  "same proposition for each listed example; examples 34a states in prose only are not asserted. 34a is rev 9.2 history and is not edited: for the two superseded orders this checker is the record",
  () => {
    const cls = (V, set) => Object.fromEntries(set.map((R) => [R.id, evaluate(V, R).matchClass]));
    const eq = (tag, got, exp) => { check(JSON.stringify(got) === JSON.stringify(exp), `${tag}: got ${JSON.stringify(got)} expected ${JSON.stringify(exp)}`); };
    // an order rev 9.3 changes: the new order is asserted; the rev 9.2.1 hand order must no longer be it
    const superseded = (tag, got, rev921, rev93, why) => {
      eq(`${tag} (rev 9.3)`, got, rev93);
      check(JSON.stringify(rev921) !== JSON.stringify(rev93), `${tag}: marked superseded but the two orders are equal`);
      info(`${tag} — rev 9.2.1 (34a): ${rev921.join(" ")}`);
      info(`${tag} — rev 9.3:         ${rev93.join(" ")}   ${why}`);
    };
    // §3.1 on S1
    const VB41 = Vq("B4-1", "욕실 하나만", "partial", ["bathroom"]);
    eq("B4-1 classes", cls(VB41, S1), { "P-bath": "exact", "P-kb": "overlap", "P-kit": "other", "F-full": "fallback", "F-nobath": "fallback", "U-bath": "fallback", "U-kit": "other", "T-floor": "other" });
    eq("B4-1 order (corrected)", order(VB41, S1), ["P-bath", "P-kb", "F-full", "U-bath", "F-nobath", "P-kit", "T-floor", "U-kit"]);
    const VB42 = Vq("B4-2", "주방이랑 욕실만", "partial", ["kitchen", "bathroom"]);
    eq("B4-2 order", order(VB42, S1), ["P-kb", "P-bath", "P-kit", "F-full", "F-nobath", "U-bath", "U-kit", "T-floor"]);
    const VB43 = { ...VB41, budget: won(7_000_000) };
    eq("B4-3 price", ["P-bath", "P-kb", "F-full"].map((id) => evaluate(VB43, S1.find((r) => r.id === id)).price), ["strong", "none", "none"]);
    eq("B4-4", cls(Vq("B4-4", "주방만", "partial", ["kitchen"]), S1)["U-kit"], "fallback");
    eq("B4-5", cls(Vq("B4-5", "도배랑 바닥만", "partial", ["wallpaper", "flooring"]), S1), { "P-bath": "other", "P-kb": "other", "P-kit": "other", "F-full": "fallback", "F-nobath": "fallback", "U-bath": "other", "U-kit": "other", "T-floor": "fallback" });
    eq("B4-6", cls(Vq("B4-6", "바닥만", "partial", ["flooring"]), S1)["T-floor"], "fallback");
    eq("B4-7 = B4-1", order(Vq("B4-7", "욕실 두 개", null, ["bathroom"]), S1), order(VB41, S1));
    eq("B4-8", cls(Vq("B4-8", "전체 리모델링", "whole", []), S1), { "P-bath": "fallback", "P-kb": "fallback", "P-kit": "fallback", "F-full": "exact", "F-nobath": "exact", "U-bath": "fallback", "U-kit": "fallback", "T-floor": "fallback" });
    eq("B4-9", evaluate(VB41, syn("P-bath-x", "partial_remodel", ["bathroom"], { dropped: true })).matchClass, "overlap");
    // §3.4
    eq("O-1", order(Q.X1, CORPUS).slice(0, 3), ["bi-01", "bi-07", "bi-09"]);
    eq("O-5", order(Q.A, CORPUS).slice(0, 3), ["bi-09", "bi-01", "bi-10"]);
    superseded("O-6", order(Q.X2, CORPUS).slice(0, 7),
      ["bi-10", "bi-01", "bi-09", "bi-13", "bi-07", "bi-11", "bi-12"],
      ["bi-10", "bi-01", "bi-09", "bi-12", "bi-13", "bi-07", "bi-11"],
      "bi-12 (26평) is `similar` for 34평 and areaRank precedes coverage, so it passes bi-13 (48평, `none`, coverage 1); the first three are unchanged");
    // §3.5 acceptance rows
    const top = {
      A: ["bi-09", "bi-01", "bi-10"], B: ["bi-11", "bi-01", "bi-07"], C: ["bi-14", "bi-04", "bi-16"], D: ["bi-15", "bi-04", "bi-16"],
      D2: ["bi-15", "bi-04", "bi-16"], E: ["bi-14", "bi-04", "bi-16"], F: ["bi-13", "bi-01", "bi-07"], G: ["bi-17", "bi-09", "bi-11"],
      H: ["bi-17", "bi-06", "bi-01"], I: ["bi-18", "bi-06", "bi-01"], "I-alt": ["bi-06", "bi-18", "bi-01"],
    };
    for (const [row, exp] of Object.entries(top)) eq(`row ${row} top-3`, order(Q[row], CORPUS).slice(0, 3), exp);
    superseded("row A full", order(Q.A, CORPUS),
      ["bi-09", "bi-01", "bi-10", "bi-12", "bi-07", "bi-11", "bi-13", "bi-04", "bi-06", "bi-17", "bi-19", "bi-05", "bi-16", "bi-18", "bi-02", "bi-03", "bi-08", "bi-14", "bi-15"],
      ["bi-09", "bi-01", "bi-10", "bi-12", "bi-07", "bi-11", "bi-13", "bi-06", "bi-17", "bi-04", "bi-19", "bi-16", "bi-18", "bi-05", "bi-03", "bi-14", "bi-02", "bi-08", "bi-15"],
      "the seven exact records keep their order; among the fallback records areaGap orders each tier (34 · 33.88 · 32 · 32평, then 38 · 30 · 29평), and 42평, 전용 84㎡ (basis of the request unknown here) and 24평 are `similar`, no longer `none`");
    eq("row D full (corrected)", order(Q.D, CORPUS), ["bi-15", "bi-04", "bi-16", "bi-01", "bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-07", "bi-02", "bi-03", "bi-05", "bi-06", "bi-08", "bi-14", "bi-17", "bi-18", "bi-19"]);
    eq("row G full", order(Q.G, CORPUS), ["bi-17", "bi-09", "bi-11", "bi-19", "bi-01", "bi-02", "bi-05", "bi-07", "bi-12", "bi-03", "bi-04", "bi-06", "bi-08", "bi-10", "bi-13", "bi-14", "bi-15", "bi-16", "bi-18"]);
    eq("row F bi-08", order(Q.F, CORPUS).indexOf("bi-08") + 1, 8);
    eq("row I fallback (corrected)", rank(Q.I, CORPUS).filter((e) => e.matchClass === "fallback").map((e) => e.id), ["bi-01", "bi-03", "bi-09", "bi-10", "bi-12", "bi-13", "bi-02", "bi-05", "bi-07", "bi-11"]);
    eq("row H fallback (corrected)", rank(Q.H, CORPUS).filter((e) => e.matchClass === "fallback").map((e) => e.id), ["bi-01", "bi-02", "bi-05", "bi-07", "bi-08", "bi-09", "bi-10", "bi-11", "bi-12", "bi-13", "bi-19"]);
    // CINV fixtures stated in 07 §15
    eq("CINV-9", evaluate(Q.X15, { ...CORPUS.find((r) => r.id === "bi-16"), ids: ["kitchen"], dropped: true }).matchClass, "overlap");
    eq("CINV-13(c)", ["bi-09", "bi-10"].map((id) => evaluate(Q.X2, CORPUS.find((r) => r.id === id)).matchClass), ["exact", "exact"]);
    eq("CINV-15 바닥만 exact", rank(Q.X4, CORPUS).filter((e) => e.matchClass === "exact").map((e) => e.id), []);
    eq("CINV-15 바닥만 bi-05", evaluate(Q.X4, CORPUS.find((r) => r.id === "bi-05")).matchClass, "fallback");
    eq("CINV-4 욕실 타일만", rank(Q.X17, CORPUS).slice(0, 3).map((e) => `${e.id}:${e.matchClass}`), ["bi-15:exact", "bi-04:overlap", "bi-16:overlap"]);
    eq("CINV-4 주방 타일만", rank(Q.X18, CORPUS).slice(0, 3).map((e) => `${e.id}:${e.matchClass}`), ["bi-14:exact", "bi-04:overlap", "bi-16:overlap"]);
    eq("CINV-24(a)", evaluate(Q.X1, CORPUS.find((r) => r.id === "bi-15")).matchClass, "fallback");
    eq("CINV-24(b)", order(Q.X15, CORPUS).indexOf("bi-14") < order(Q.X15, CORPUS).indexOf("bi-09"), true);
    info(`row-by-row top-3: ${Object.keys(top).map((r) => `${r}=${order(Q[r], CORPUS).slice(0, 3).join("/")}`).join("  ")}`);
  });

property("P8", "No filter, location weight 0, disclosure wording (CINV-1, CINV-17, CINV-22, CINV-23)",
  "every record is returned; permuting location changes nothing; a room a partial_remodel does not list is 'not remodelled' and nothing absent is stated for other records — in the disclosures or in the GR3 label; a full_remodel covering a room only via PT4(b) is described by the ground, never as including that room; mode whole never labels a fallback as whole-home; mode open has no direct answer",
  "for every fixture query: 19 in, 19 out; a rotation of all locations leaves the order identical; the disclosure step emits 'not_remodelled' only for a partial_remodel without a dropped id; no label says 'not include'/'does not include'/'lack'; in mode whole a fallback label does not say whole-home; in mode open no label is 'direct answer'; for a full_remodel lacking the room id it emits the ground and never 'includes:<room>'",
  "narrower — the label and disclosure checks test the checker's own transcription of GR3 and §14.3.6 (its constant strings), not the contract's text and not a reply; GR3's wording is reviewed, not executed. The no-filter and location halves are the same proposition",
  () => {
    for (const V of ALLQ) {
      const o = order(V, CORPUS);
      check(o.length === 19 && new Set(o).size === 19, `records lost: ${V.id}`);
      const locs = CORPUS.map((r) => r.location);
      const rotated = CORPUS.map((r, i) => ({ ...r, location: locs[(i + 1) % locs.length] }));
      check(order(V, rotated).join() === o.join(), `location moved the order: ${V.id}`);
      for (const R of CORPUS) {
        const d = disclose(V, R, evaluate(V, R));
        if (d.some((x) => x.startsWith("not_remodelled:"))) check(R.projectType === "partial_remodel" && !R.dropped, `not_remodelled on non-partial: ${V.id} ${R.id}`);
        const ev = evaluate(V, R);
        check(!/not include|does not include|lack/.test(d[0]), `label states an absence: ${V.id} ${R.id} ${d[0]}`);
        if (ev.mode === "whole" && ev.matchClass === "fallback") check(!/whole-home or/.test(d[0]), `whole-mode fallback called whole-home: ${V.id} ${R.id}`);
        if (ev.mode === "open") check(d[0] !== "direct answer", `open-mode direct answer: ${V.id} ${R.id}`);
        if (R.projectType === "full_remodel") for (const q of sOf(V.Q)) if (!(R.ids || []).includes(q)) {
          check(!d.includes(`includes:${q}`) && d.includes("ground:집 전체를 리모델링한 사례"), `CINV-23: ${V.id} ${R.id} ${q}`);
        }
      }
    }
    const d = disclose(Q.D, CORPUS.find((r) => r.id === "bi-07"), evaluate(Q.D, CORPUS.find((r) => r.id === "bi-07")));
    info(`CINV-23 fixture, 욕실 하나만 × bi-07: ${d.join(" | ")}`);
  });

property("P9", "Rev 9.3 — the area interval, the similar tier, areaExact and areaGap (VB4, EV3, EV4; CINV-26/27/28; §19 rows J–S)",
  "V.area is an interval — an exact figure [v, v], a class N ≤ x < N+10 with ends N and N+9; the area tier has four values on gap/base with inclusive bounds; areaExact is 0 iff the tier was computed, g = 0 and both bases are known; areaGap is g inside strong/acceptable/similar and one fixed value otherwise; a record with no area, on the other basis, in mode part, or under a query with no area carries the three area entries of a far record; §19 rows J–S and the fixtures of CINV-26/27/28 follow; rows A–I do not depend on how the basis of a bare 평 figure is read",
  "(a) CINV-26: its listed boundary values for 34평 and for 30평대 on one synthetic record (tier, areaExact, g = 0), the gap at both edges of a class and every area 10.0…99.9평 inside exactly one class, three unreadable intervals, and the price tier at 25 %; (b) §19 rows J–S as written, on the 19 records; (c) CINV-27 (a)–(e) on the 19 records with one or two areas/styles replaced; (d) CINV-28: for every fixture query × record, tier none ⇒ areaExact 1 and areaGap at its fixed value, and bi-15's tuple without id equals every far record's on open 34평 and open 30평대; (e) rows A, F, G: the top three with the area's basis unknown equal those with it supply; (f) the area words of §14.3.6 on rows J and L",
  "same propositions, on the listed fixtures only. Each is a case the consumer's test:portfolio-matcher-v02 asserts on the same 19 records (its test ids are printed): two implementations agreeing is evidence that the text says what the consumer does, not a proof for all inputs. Area deletion (PB4) is P3's, which now runs over rows J–S too. (f) tests this checker's transcription of the wording classes, not a reply",
  () => {
    const rec = (id) => CORPUS.find((r) => r.id === id);
    const sup = (value) => ({ value, unit: "pyeong", basis: "supply" });
    const withRec = (set, id, patch) => set.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const evOf = (V, set, id) => evaluate(V, set.find((r) => r.id === id));
    const pos = (V, set, id) => order(V, set).indexOf(id);
    const eq = (tag, got, exp) => { check(JSON.stringify(got) === JSON.stringify(exp), `${tag}: got ${JSON.stringify(got)} expected ${JSON.stringify(exp)}`); };
    const noId = (V, set, id) => tupleOf(evOf(V, set, id)).slice(0, NUM).join();
    const areaEntries = (V, set, id) => { const t = tupleOf(evOf(V, set, id)); return [t[1], t[4], t[6]].join(); };

    // (a) CINV-26 — bounds. One full_remodel record whose area is replaced; the request is a whole-home one.
    const probe = (area, value) => { const e = evaluate(Vq("probe", "", "whole", [], { area }), { ...rec("bi-01"), area: sup(value) }); return { tier: e.area, exact: e.areaExact === 0, inside: e.areaGap === 0n }; };
    const figure = [[34, "strong"], [30.6, "strong"], [30.59, "acceptable"], [27.2, "acceptable"], [27.19, "similar"], [23.8, "similar"], [23.79, "none"],
      [37.4, "strong"], [37.41, "acceptable"], [40.8, "acceptable"], [40.81, "similar"], [44.2, "similar"], [44.21, "none"]];
    for (const [value, tier] of figure) { const x = probe(py(34, "supply"), value); check(x.tier === tier && x.exact === (value === 34), `34평 × ${value}: ${x.tier}${x.exact ? " exact" : ""}, expected ${tier}`); }
    const klass = [[30, "strong", true], [39, "strong", true], [34.5, "strong", true],
      [29.99, "strong", false], [29, "strong", false], [27, "strong", false], [26.99, "acceptable", false], [24, "acceptable", false], [23.99, "similar", false], [21, "similar", false], [20.99, "none", false],
      [39.01, "strong", true], [39.5, "strong", true], [39.99, "strong", true],
      [40, "strong", false], [40.01, "strong", false], [42.9, "strong", false], [42.91, "acceptable", false], [46.8, "acceptable", false], [46.81, "similar", false], [50.7, "similar", false], [50.71, "none", false]];
    for (const [value, tier, inside] of klass) { const x = probe(cls(30), value); check(x.tier === tier && x.exact === inside && x.inside === inside, `30평대 × ${value}: ${x.tier}${x.inside ? " inside" : ""}, expected ${tier}${inside ? " inside" : ""}`); }
    info(`(a) CINV-26 [AREA-7, CLASS-10a, CLASS-10b]: 34평 ${figure.map(([v]) => `${v}→${probe(py(34, "supply"), v).tier}`).join(" ")}`);
    info(`    30평대 ${klass.map(([v]) => { const x = probe(cls(30), v); return `${v}→${x.tier}${x.inside ? "(in)" : ""}`; }).join(" ")}`);
    // the half-open class (VB4): the step above it, none below it. One 평 is 400/121 ㎡ = 4·10¹² of this checker's units.
    const PY = 4n * 10n ** 12n, gapOf = (area, value) => evaluate(Vq("probe", "", "whole", [], { area }), { ...rec("bi-01"), area: sup(value) }).areaGap;
    const gaps = [[cls(30), 39.99, 0n], [cls(30), 40, PY], [cls(30), 40.01, (PY * 101n) / 100n], [cls(30), 29.99, PY / 100n], [cls(30), 29, PY], [cls(20), 29.99, 0n], [cls(20), 30, PY], [cls(40), 39.5, PY / 2n], [cls(40), 40, 0n]];
    for (const [area, value, want] of gaps) check(gapOf(area, value) === want, `${area.range.min}평대 × ${value}평: gap ${fmtGap(gapOf(area, value))}, expected ${fmtGap(want)}`);
    check(probe(cls(20), 29.99).exact && !probe(cls(30), 29.99).exact && !probe(cls(40), 39.5).exact && probe(cls(40), 39.5).tier === "strong", "29.99평 is not inside 20평대 alone, or 39.5평 is inside 40평대");
    for (let tenths = 100; tenths < 1000; tenths++) { // every area 10.0 … 99.9평 is inside exactly one class
      const inside = [10, 20, 30, 40, 50, 60, 70, 80, 90].filter((n) => probe(cls(n), tenths / 10).inside);
      check(inside.length === 1 && inside[0] === Math.floor(tenths / 100) * 10, `${tenths / 10}평 is inside ${JSON.stringify(inside)}`);
    }
    const m130 = (basis) => evaluate(Q.L, { ...rec("bi-01"), area: { value: 130, unit: "m2", basis } });
    check(m130("supply").areaExact === 0 && m130("supply").areaGap === 0n && m130("supply").area === "strong", "공급 130㎡ (39.33평) is not inside 30평대");
    check(tupleOf(m130("supply")).slice(0, NUM).join() === noId(Q.L, CORPUS, "bi-04") && rec("bi-04").area.value === 32, "공급 130㎡ and 32평 differ in a 30평대 tuple");
    check(m130("exclusive").area === "none" && m130("exclusive").areaNote === "not_comparable" && m130("exclusive").areaGap === GAP_NONE, "전용 130㎡ compared with a supply class");
    const unk395 = evaluate(Q.L, { ...rec("bi-01"), area: { value: 39.5, unit: "pyeong", basis: null } });
    check(unk395.area === "strong" && unk395.areaApproximate === true && unk395.areaExact === 1 && unk395.areaGap === 0n, "39.5평 with no basis: not strong / approximate / areaExact 1 / gap 0");
    info(`    half-open class [CLASS-15a, CLASS-15b]: 30평대 × 39.99 → gap ${fmtGap(gapOf(cls(30), 39.99))}, 40 → ${fmtGap(gapOf(cls(30), 40))}, 40.01 → ${fmtGap(gapOf(cls(30), 40.01))}, 29.99 → ${fmtGap(gapOf(cls(30), 29.99))} (in 1/12100 ㎡, where 1평 = 40000); 29.99평 inside 20평대 only; 39.5평 is 0.5평 from 40평대; 공급 130㎡ inside 30평대, 전용 130㎡ not_comparable; 10.0…99.9평 each inside exactly one class`);
    const open0 = Vq("open0", "", null, []);
    for (const range of [{ min: 39, max: 30 }, { min: 0, max: 9 }, { min: Number.NaN, max: 39 }]) {
      const V = Vq("bad", "", null, [], { area: { value: 34.5, unit: "pyeong", basis: "supply", range } });
      eq(`unreadable interval ${range.min}..${range.max}: order = no area`, order(V, CORPUS), order(open0, CORPUS));
      check(CORPUS.every((R) => { const e = evaluate(V, R); return e.area === "none" && e.areaNote === null; }), `unreadable interval ${range.min}..${range.max}: a tier or a note`);
    }
    const b40 = evOf(Vq("b40", "", "whole", [], { budget: won(40_000_000) }), CORPUS, "bi-09");
    check(b40.price === "none", `예산 4천 × bi-09 5천 (25 %): price ${b40.price} — the price tier has no similar`);
    info(`    unreadable intervals (reversed, zero, NaN) ⇒ V.area absent; 예산 4천 × bi-09 5천 (25 % off) ⇒ price ${b40.price} [CLASS-13]`);

    // (b) §19 rows J–S
    const inRange = (lo, hi) => CORPUS.filter((R) => R.area && R.area.basis === "supply" && (() => { const p = R.area.unit === "pyeong" ? R.area.value : (R.area.value * 121) / 400; return p >= lo && p < hi + 1; })()).map((R) => R.id).sort();
    eq("row J top three", order(Q.J, CORPUS).slice(0, 3), ["bi-07", "bi-11", "bi-02"]);
    check(evOf(Q.J, CORPUS, "bi-07").areaExact === 0 && evOf(Q.J, CORPUS, "bi-11").area === "strong" && evOf(Q.J, CORPUS, "bi-02").area === "similar" && evOf(Q.J, CORPUS, "bi-01").area === "none"
      && pos(Q.J, CORPUS, "bi-02") < pos(Q.J, CORPUS, "bi-01") && "bi-01" < "bi-02", "row J: tiers, or bi-02 not before bi-01");
    eq("row K first four", order(Q.K, CORPUS).slice(0, 4), ["bi-01", "bi-06", "bi-09", "bi-10"]);
    eq("row K areaExact records", CORPUS.filter((R) => evaluate(Q.K, R).areaExact === 0).map((R) => R.id), ["bi-01", "bi-06", "bi-09", "bi-10"]);
    eq("row K: 24평, 51평, 34평 전체, 19평 전체 firsts", [Q.K24, Q.K51, Q.Kw34, Q.Kw19].map((V) => { const id = order(V, CORPUS)[0]; return `${id}:${evOf(V, CORPUS, id).areaExact}`; }), ["bi-02:0", "bi-08:0", "bi-01:0", "bi-07:0"]);
    for (const [row, lo, want] of [["L", 30, ["bi-01", "bi-04", "bi-06", "bi-09", "bi-10", "bi-16", "bi-17", "bi-18", "bi-19"]], ["M", 20, ["bi-02", "bi-05", "bi-11", "bi-12"]], ["N", 40, ["bi-03", "bi-13"]]]) {
      eq(`row ${row}: records inside the range (computed from the corpus)`, inRange(lo, lo + 9), want);
      eq(`row ${row}: first ${want.length}`, order(Q[row], CORPUS).slice(0, want.length), want);
      check(want.every((id) => areaEntries(Q[row], CORPUS, id) === [0, 0, 0n].join()), `row ${row}: an inside record's area entries are not (strong, exact, 0)`);
      check(order(Q[row], CORPUS).slice(want.length).every((id) => evOf(Q[row], CORPUS, id).areaExact === 1), `row ${row}: a record outside the range is areaExact`);
    }
    const oOrder = order(Q.O, CORPUS), oIn = inRange(30, 39), white = (id) => (rec(id).styles || []).includes("화이트");
    eq("row O first nine", oOrder.slice(0, 9), ["bi-01", "bi-04", "bi-06", "bi-09", "bi-16", "bi-19", "bi-10", "bi-17", "bi-18"]);
    check(CORPUS.filter((R) => white(R.id) && !oIn.includes(R.id)).every((R) => oOrder.indexOf(R.id) >= 9) && oOrder.indexOf("bi-18") < oOrder.indexOf("bi-02") && white("bi-02") && !white("bi-18"), "row O: a 화이트 record outside the range precedes an inside one");
    eq("row P top three", rank(Q.P, CORPUS).slice(0, 3).map((e) => `${e.id}:${e.matchClass}`), ["bi-01:exact", "bi-09:exact", "bi-10:exact"]);
    eq("row Q = row C's order", order(Q.Q, CORPUS), order(Q.C, CORPUS));
    check(rank(Q.Q, CORPUS)[0].id === "bi-14" && rank(Q.Q, CORPUS)[0].matchClass === "exact" && rank(Q.Q, CORPUS).every((e) => e.area === "none" && e.areaNote === "not_applied"), "row Q: bi-14 not exact first, or an area compared in mode part");
    const supplyIds = CORPUS.filter((R) => R.area && R.area.basis === "supply").map((R) => R.id);
    check(supplyIds.length === 17 && supplyIds.every((id) => { const e = evOf(Q.R, CORPUS, id); return e.area === "none" && e.areaNote === "not_comparable"; }), "row R: a supply record compared with an exclusive request");
    check(order(Q.R, CORPUS)[0] === "bi-14" && evOf(Q.R, CORPUS, "bi-14").area === "acceptable" && evOf(Q.R, CORPUS, "bi-14").areaApproximate === false, `row R: first ${order(Q.R, CORPUS)[0]}, bi-14 ${evOf(Q.R, CORPUS, "bi-14").area}`);
    info(`(b) §19 J [CLASS-1, RANK-4] ${order(Q.J, CORPUS).slice(0, 3).join("/")}  K [CLASS-2, RANK-12] ${order(Q.K, CORPUS).slice(0, 4).join("/")}  L [CLASS-3-30] ${order(Q.L, CORPUS).slice(0, 9).join("/")}`);
    info(`    M [CLASS-3-20] ${order(Q.M, CORPUS).slice(0, 4).join("/")}  N [CLASS-3-40] ${order(Q.N, CORPUS).slice(0, 2).join("/")}  O [CLASS-6, AC-1] ${oOrder.slice(0, 9).join("/")}`);
    eq("row S first seven", order(Q.S, CORPUS).slice(0, 7), ["bi-09", "bi-01", "bi-10", "bi-12", "bi-13", "bi-07", "bi-11"]);
    check(evOf(Q.S, CORPUS, "bi-09").price === "strong" && evOf(Q.S, CORPUS, "bi-09").areaExact === 0 && evOf(Q.S, CORPUS, "bi-01").price === "none" && evOf(Q.S, CORPUS, "bi-01").priceNote === "missing" && evOf(Q.S, CORPUS, "bi-01").areaExact === 0, "row S: bi-09 not inside the range and inside the budget, or bi-01 has a total");
    info(`    P [CLASS-12] ${order(Q.P, CORPUS).slice(0, 3).join("/")}  Q [CLASS-7, RANK-8] = row C, first ${order(Q.Q, CORPUS)[0]}  R [CLASS-9] first ${order(Q.R, CORPUS)[0]}, ${supplyIds.length} supply records not_comparable`);
    info(`    S [CLASS-16] ${order(Q.S, CORPUS).slice(0, 7).join("/")}  ${rank(Q.S, CORPUS).slice(0, 7).map((e) => `${e.id}:${e.matchClass}/${e.area}/${e.price}`).join(" ")}`);

    // (c) CINV-27 — the two readings in the order
    const WHITE = "화이트", OTHER = "미니멀";
    const s1 = withRec(CORPUS, "bi-01", { area: sup(32) });
    check(pos(Q.K, s1, "bi-09") < pos(Q.K, s1, "bi-01") && evOf(Q.K, s1, "bi-09").areaExact === 0 && evOf(Q.K, s1, "bi-01").areaExact === 1 && evOf(Q.K, s1, "bi-01").area === "strong", "CINV-27(a) [RANK-1]: 34평 does not precede 32평 with the smaller id");
    const KW = { ...Q.K, id: "K+화이트", styles: [WHITE] };
    const s2 = withRec(withRec(CORPUS, "bi-01", { area: sup(33), styles: [WHITE] }), "bi-10", { area: sup(34), styles: [OTHER] });
    check(pos(KW, s2, "bi-10") < pos(KW, s2, "bi-01") && evOf(KW, s2, "bi-10").style === "none" && evOf(KW, s2, "bi-01").style === "match", "CINV-27(a) [RANK-2]: a style match outranked the same area");
    const s3 = withRec(withRec(CORPUS, "bi-01", { area: sup(33), styles: [OTHER] }), "bi-10", { area: sup(32), styles: [WHITE] });
    check(pos(KW, s3, "bi-10") < pos(KW, s3, "bi-01") && evOf(KW, s3, "bi-10").areaGap > evOf(KW, s3, "bi-01").areaGap && evOf(KW, s3, "bi-10").areaExact === 1 && evOf(KW, s3, "bi-01").areaExact === 1, "CINV-27(b) [RANK-3]: a nearer area outranked a style match inside one tier");
    const s3b = withRec(withRec(CORPUS, "bi-01", { area: sup(32), styles: [OTHER] }), "bi-10", { area: sup(33), styles: [OTHER] });
    check(pos(Q.K, s3b, "bi-10") < pos(Q.K, s3b, "bi-01") && tupleOf(evOf(Q.K, s3b, "bi-10")).slice(0, 6).join() === tupleOf(evOf(Q.K, s3b, "bi-01")).slice(0, 6).join(), "CINV-27(b) [RANK-3b]: the nearer area does not precede the smaller id");
    const s14 = withRec(CORPUS, "bi-09", { area: sup(33) });
    const A14 = { ...Q.A, id: "A/supply", area: py(34, "supply") };
    check(pos(A14, s14, "bi-09") < pos(A14, s14, "bi-01") && evOf(A14, s14, "bi-09").price === "strong" && evOf(A14, s14, "bi-09").areaExact === 1 && evOf(A14, s14, "bi-01").price === "none" && evOf(A14, s14, "bi-01").areaExact === 0, "CINV-27(c) [RANK-14]: the same area outranked a budget match");
    const s16 = withRec(CORPUS, "bi-09", { area: sup(29) });
    check(pos(Q.S, s16, "bi-09") < pos(Q.S, s16, "bi-01") && evOf(Q.S, s16, "bi-09").area === "strong" && evOf(Q.S, s16, "bi-09").areaExact === 1 && evOf(Q.S, s16, "bi-09").price === "strong" && evOf(Q.S, s16, "bi-01").areaExact === 0 && evOf(Q.S, s16, "bi-01").price === "none", "CINV-27(c) [CLASS-16]: inside the range outranked a budget match just outside it");
    const rJ = rank(Q.J, CORPUS), farJ = rJ.filter((e) => e.area === "none");
    check(farJ.length > 1 && farJ.every((e) => e.areaGap === GAP_NONE && e.areaExact === 1), "CINV-27(d) [RANK-4]: a tier-none record has its own areaGap");
    for (let i = 0; i + 1 < rJ.length; i++) if (rJ[i].area === "none" && rJ[i + 1].area === "none" && tupleOf(rJ[i]).slice(0, NUM).join() === tupleOf(rJ[i + 1]).slice(0, NUM).join()) check(rJ[i].id < rJ[i + 1].id, `CINV-27(d): ${rJ[i].id} before ${rJ[i + 1].id}`);
    check(pos(Q.J, CORPUS, "bi-01") < pos(Q.J, CORPUS, "bi-05") && evOf(Q.J, CORPUS, "bi-05").area === "none", "CINV-27(d) [RANK-4]: 29평 (10평 away) precedes 34평 (15평 away) though both are none");
    for (const [a, b] of [[32, 37], [37, 32]]) {
      const tie = withRec(withRec(CORPUS, "bi-01", { area: sup(a), styles: ["모던"] }), "bi-10", { area: sup(b), styles: [WHITE] });
      for (const set of [tie, [...tie].reverse()]) {
        check(noId(Q.L, set, "bi-01") === noId(Q.L, set, "bi-10") && pos(Q.L, set, "bi-01") < pos(Q.L, set, "bi-10"), `CINV-27(e) [CLASS-5]: 30평대, ${a}평/${b}평 — not a tie decided by id`);
        check(areaEntries(Q.O, set, "bi-01") === areaEntries(Q.O, set, "bi-10") && pos(Q.O, set, "bi-10") < pos(Q.O, set, "bi-01"), `CINV-27(e) [CLASS-5]: 30평대 + 화이트, ${a}평/${b}평 — style did not decide`);
      }
    }
    info(`(c) CINV-27 [RANK-1, RANK-2, RANK-3, RANK-3b, RANK-14, CLASS-16, RANK-4, CLASS-5]: 34평 before 32평 with the smaller id; same area before a style match; style before a nearer area; nearer area before id; budget before the same area, and before inside-the-range (29평 inside the budget before an in-range record with no total); tier-none records by id (${farJ.length} on 19평); 32평/37평 tie inside 30평대`);

    // (d) CINV-28 — neutrality of the tier and both readings
    let none = 0;
    for (const V of ALLQ) for (const R of CORPUS) {
      const e = evaluate(V, R);
      if (e.area === "none") { none++; check(e.areaExact === 1 && e.areaGap === GAP_NONE, `tier none with a reading: ${V.id} ${R.id}`); }
      else check(e.areaGap !== GAP_NONE, `a computed tier without its gap: ${V.id} ${R.id}`);
      if (!intervalOf(V.area) || e.mode === "part") check(e.area === "none", `area compared without a request or in mode part: ${V.id} ${R.id}`);
    }
    for (const V of [Q.K, Q.L]) {
      const far = CORPUS.filter((R) => { const e = evaluate(V, R); return e.area === "none" && e.areaNote === null; }).map((R) => R.id);
      check(far.length > 0 && evOf(V, CORPUS, "bi-15").areaNote === "missing" && far.every((id) => noId(V, CORPUS, id) === noId(V, CORPUS, "bi-15")), `CINV-28: ${V.id} × bi-15 differs from a far record`);
      info(`(d) CINV-28 [RANK-5, CLASS-8]: row ${V.id} — bi-15 (no area) has the tuple without id of the compared records beyond 30 %: ${far.join(" ")}`);
    }
    info(`    ${none} (query, record) pairs with tier none, each with areaExact 1 and areaGap at its fixed value [RANK-7, RANK-8, RANK-9, CLASS-7, CLASS-9]`);

    // (e) the basis of a bare "N평" in rows A, F, G
    const top = { A: ["bi-09", "bi-01", "bi-10"], F: ["bi-13", "bi-01", "bi-07"], G: ["bi-17", "bi-09", "bi-11"] };
    for (const [row, want] of Object.entries(top)) {
      check(Q[row].area.basis === null, `row ${row}: the fixture's basis is no longer unknown`);
      eq(`row ${row} top three, basis unknown`, order(Q[row], CORPUS).slice(0, 3), want);
      eq(`row ${row} top three, basis supply`, order({ ...Q[row], area: { ...Q[row].area, basis: "supply" } }, CORPUS).slice(0, 3), want);
    }
    const fS = { ...Q.F, area: { ...Q.F.area, basis: "supply" } }, gS = { ...Q.G, area: { ...Q.G.area, basis: "supply" } };
    check(order(fS, CORPUS).indexOf("bi-08") === 7 && rank(fS, CORPUS).findIndex((e) => e.matchClass === "fallback") === 7 && order(gS, CORPUS)[3] === "bi-19", "rows F (bi-08 8th, first fallback) and G (bi-19 4th) under basis supply");
    info(`(e) rows A, F, G [ACC-A, ACC-F, ACC-F-8th, ACC-G, ACC-G-4th]: the same top three with the area's basis unknown and with it supply; F's 8th and G's 4th hold under both`);

    // (f) §14.3.6, the area words
    const words = (V, set, id) => areaWords(V, evOf(V, set, id));
    eq("row J words", ["bi-07", "bi-11", "bi-02", "bi-01"].map((id) => words(Q.J, CORPUS, id)), ["the same area", "within 10 %", "within 30 %", "neither"]);
    eq("row L words", ["bi-01", "bi-17", "bi-02", "bi-13", "bi-08", "bi-15", "bi-14"].map((id) => words(Q.L, CORPUS, id)), ["inside the stated range", "inside the stated range", "within 20 %", "within 30 %", "neither", null, null]);
    const unk = withRec(CORPUS, "bi-09", { area: { value: 34, unit: "pyeong", basis: null } });
    check(words(Q.L, unk, "bi-09") === "inside the stated range (approximate)" && evOf(Q.L, unk, "bi-09").areaExact === 1 && evOf(Q.L, unk, "bi-09").areaGap === 0n && evOf(Q.L, unk, "bi-09").area === "strong", "30평대 × 34평 with no basis: not strong / approximate / areaExact 1");
    check(words(Q.K, unk, "bi-09") === "within 10 % (approximate)" && evOf(Q.K, unk, "bi-09").areaExact === 1 && pos(Q.K, unk, "bi-10") < pos(Q.K, unk, "bi-09"), "34평 × 34평 with no basis: areaExact, or not after the same-basis 34평 records");
    info(`(f) §14.3.6 [CLASS-1, CLASS-3, CLASS-11, CLASS-9, RANK-6]: 19평 — bi-07 the same area, bi-11 within 10 %, bi-02 within 30 %, bi-01 neither; 30평대 — inside the stated range, bi-02 within 20 %, bi-13 within 30 %, bi-08 neither; an unknown basis is never areaExact`);
  });

// ─────────────────────────────── summary ───────────────────────────────
console.log("\n══ SUMMARY");
for (const r of results) console.log(`   ${r.id.padEnd(3)} ${r.fails.length ? "FAIL" : "PASS"}  ${String(r.checks).padStart(8)} checks  ${r.title}`);
const failed = results.filter((r) => r.fails.length);
console.log(`   PROPERTIES = ${results.length}   PASS = ${results.length - failed.length}   FAIL = ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
