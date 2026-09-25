// contract-simplified.mjs — executable mirror of contract rev 9.2.1 §14.3 (EV1–EV4, PB4, GR2/GR3).
//
// Run:   node docs/result/interior-portfolio-v0.2/proof/contract-simplified.mjs
// Reads: docs/reports/integration/07-integration-contract-v0.2-candidate.md  (anchors + §7.3 vocabulary)
//        data/sites/boost-interior-demo/content/projects.json                (the 19 records, live)
// Writes nothing. Exit code 1 if any property FAILs.
//
// Rule for this file (DM-1, `32-` §10): every property prints its CONTRACT_PROPOSITION and its
// CHECKER_PROPOSITION in plain words and says whether they are the same proposition. A number is
// quoted only for the proposition the checker actually measures. The checker decides no policy:
// where the contract is silent, the checker says so instead of choosing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const CONTRACT_PATH = resolve(ROOT, "docs/reports/integration/07-integration-contract-v0.2-candidate.md");
const DATA_PATH = resolve(ROOT, "data/sites/boost-interior-demo/content/projects.json");
const CONTRACT = readFileSync(CONTRACT_PATH, "utf8");

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

// ─────────────────────── records, loaded live from projects.json ───────────────────────
function loadRecords() {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const recs = Array.isArray(raw) ? raw : raw.projects || raw.records || raw.items;
  return recs.map((r) => ({
    id: r.id,
    projectType: r.projectType ?? null,
    ids: r.workScopeIds ? [...r.workScopeIds] : null,
    dropped: false,
    area: r.area ? { value: r.area.value, unit: r.area.unit, basis: r.area.basis ?? null } : null,
    total: r.totalPrice ? { ...r.totalPrice } : null,
    perArea: r.pricePerArea ? { ...r.pricePerArea } : null,
    styles: r.styles && r.styles.length ? [...r.styles] : null,
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
const RANK = { strong: 0, acceptable: 1, none: 2 };
// exact rational arithmetic (BigInt): a decimal as n / 10^k; AR4 factors to m²: py 400/121, sqft 0.09290304
const dec = (x) => { const [i, f = ""] = String(x).split("."); return { n: BigInt(i + f), d: 10n ** BigInt(f.length) }; };
const TO_M2 = { m2: { n: 1n, d: 1n }, pyeong: { n: 400n, d: 121n }, sqft: { n: 9290304n, d: 100000000n } };
function areaM2(a) { const f = TO_M2[a.unit]; if (!f) return null; const v = dec(a.value); return { n: v.n * f.n, d: v.d * f.d }; }
function areaTier(V, R, mode) {
  if (!V.area) return { tier: "none", note: null };
  if (!(mode === "whole" || mode === "open")) return { tier: "none", note: "not_applied" };
  if (!R.area) return { tier: "none", note: "missing" };
  if (V.area.basis && R.area.basis && V.area.basis !== R.area.basis) return { tier: "none", note: "not_comparable" };
  const v = areaM2(V.area), r = areaM2(R.area);
  if (!v) return { tier: "none", note: null }; // V.area: an unresolvable unit makes it absent (§14.3.1)
  if (!r) return { tier: "none", note: "missing" }; // an unrecognised unit is an unknown value (§12): the area cannot be read (GR2)
  // |r − v| vs v, all over the common denominator v.d·r.d
  const V_ = v.n * r.d, D_ = r.n * v.d - v.n * r.d, dAbs = D_ < 0n ? -D_ : D_;
  return { tier: 10n * dAbs <= V_ ? "strong" : 5n * dAbs <= V_ ? "acceptable" : "none", note: null, approximate: !V.area.basis || !R.area.basis };
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
  };
}
// EV4 — the tuple and the order
const CLASS_RANK = { exact: 0, overlap: 1, fallback: 2, other: 3 };
const tupleOf = (e) => [CLASS_RANK[e.matchClass], RANK[e.area], RANK[e.price], -e.coverage, e.style === "match" ? 0 : 1, e.id];
function cmpTuple(a, b) {
  for (let i = 0; i < 5; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a[5] < b[5] ? -1 : a[5] > b[5] ? 1 : 0;
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
const ALLQ = [...ACCEPT, ...EXTRA];
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
  "the rules mirrored here (EV1–EV4, PB4, GR2, GR3, the OQ-6 disclosure) are the ones in force in 07 rev 9.2.1",
  "each anchor sentence copied from 07 §14.3 is present verbatim; §7.3 parses to 14 Spaces + 12 Works",
  "narrower — an anchor proves the sentence is there, not that the code matches it (P1–P7 do that)",
  () => {
    const anchors = [
      "**Mode**, per query: `whole` if `V.breadth = whole`; else `part` if `V.breadth = partial` or\n> `Q ≠ ∅`; else `open`.",
      "| 6 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel`, no id was dropped from it, and `R_s = Q_s ≠ ∅` | `exact` |",
      "| 7 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel` and shares an id with `Q` | `overlap` |",
      "| 8 | `part`, `Q ≠ ∅` | `R` covers an id of `Q` | `fallback` |",
      "| `price` | `strong` · `acceptable` · `none` | `V.budget` stated, mode `whole` or `part`, and class `exact` | `none` (`not_applied` if `V.budget` stated) |",
      "| `area` | `strong` · `acceptable` · `none` | `V.area` stated, and mode `whole` or `open` | `none` (`not_applied` if `V.area` stated) |",
      "( classRank, areaRank, priceRank, −coverage, styleRank, id )",
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
    info(`vocabulary ${SPACES.size}+${WORKS.size} ids from §7.3; ${CORPUS.length} records from projects.json`);
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
  `for every fixture query (${ALLQ.length}) over the ${CORPUS.length} records and over S1: every component is a finite number or a string; for every ordered pair cmp≠0 and cmp(a,b)=−cmp(b,a); for every triple a<b<c ⇒ a<c; 50 seeded shuffles sort to one order`,
  "same proposition on the fixture set; totality for all queries follows from the tuple's shape (P0 anchors it) and is not enumerated beyond the fixtures",
  () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const set of [CORPUS, S1]) for (const V of ALLQ) {
      const tups = set.map((R) => tupleOf(evaluate(V, R)));
      for (const t of tups) check(t.slice(0, 5).every(Number.isFinite) && typeof t[5] === "string", `undefined component ${V.id} ${t}`);
      for (const a of tups) for (const b of tups) if (a !== b) {
        const x = cmpTuple(a, b), y = cmpTuple(b, a);
        check(x !== 0 && x === -y, `pair ${V.id} ${a[5]}/${b[5]}`);
      }
      for (const a of tups) for (const b of tups) for (const c of tups) {
        if (cmpTuple(a, b) < 0 && cmpTuple(b, c) < 0) check(cmpTuple(a, c) < 0, `intransitive ${V.id} ${a[5]}<${b[5]}<${c[5]}`);
      }
      const ref = order(V, set).join(",");
      for (let k = 0; k < 50; k++) {
        const sh = [...set];
        for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
        check(order(V, sh).join(",") === ref, `nondeterministic ${V.id}`);
      }
    }
    // the old cycle trio (32- §5, B9-2) on row A
    const tA = Object.fromEntries(CORPUS.map((R) => [R.id, tupleOf(evaluate(Q.A, R))]));
    check(cmpTuple(tA["bi-04"], tA["bi-17"]) < 0 && cmpTuple(tA["bi-17"], tA["bi-15"]) < 0 && cmpTuple(tA["bi-04"], tA["bi-15"]) < 0, "O-2 trio not a chain bi-04<bi-17<bi-15");
    info(`O-2: row A bi-04 ${JSON.stringify(tA["bi-04"])} < bi-17 ${JSON.stringify(tA["bi-17"])} < bi-15 ${JSON.stringify(tA["bi-15"])}`);
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
    const base = V.area || py(34);
    for (const k of [1, 1.15, 10]) f.push({ ...R, area: { value: Math.round(base.value * k * 100) / 100, unit: base.unit, basis: base.basis || "supply" } });
    f.push({ ...R, area: { value: base.value, unit: base.unit, basis: base.basis === "exclusive" ? "supply" : "exclusive" } });
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
  "for every query, record and listed input: the record with the input missing is evaluated (class and all four tiers together) as with the least favourable valid value of that input; where every valid value gives positive evidence on the tier the input feeds, as that value with the tier at its last value; where no valid value exists, PB4 2 asks nothing beyond EV2/EV3; deletion never raises the tuple; no record is removed; rank may fall",
  `(i) every fixture query (${ALLQ.length}) × every record (${CORPUS.length} corpus + ${S1.length} S1) × each input PB4 lists: for a record that HAS the input, the input is deleted; for a record that LACKS it natively (e.g. bi-15 area, bi-01…bi-08 total), the record is compared as it stands; (ii) the same over the enumerated queries × records for projectType, workScopeIds and a dropped id. Where validFills() (INV-28/29/30 and §9 respected) is non-empty, tuple(missing) minus id must equal the worst fill's, or — only when the input feeds a tier and every fill gives that tier positive evidence — the worst fill's with that tier at its last value. Where validFills() is EMPTY (e.g. bi-05/bi-19 projectType) the case is COUNTED, NOT ASSERTED. Separately, for every deletion: tuple(deleted) ≥ tuple(actual). Every query returns every record`,
  "narrower — 'least favourable valid value' is taken over the finite domain validFills() lists, which for each input includes a value giving no positive evidence whenever one exists (the other projectType, an id set disjoint from Q, a far area, a far or tiny total within §9, a style not asked). A domain that missed the true worst could hide a rewarded missing input from the equality check; the separate 'never rises' check does not depend on the domain. The no-valid-value count is a count of cases where the contract asks nothing, not evidence of a pass",
  () => {
    const inputs = ["projectType", "workScopeIds", "droppedId", "area", "total", "styles"];
    const TIER_KEY = { area: 1, total: 2, styles: 4 }; // tuple position the input feeds; last value: area/price 2, style 1
    const LAST = { 1: 2, 2: 2, 4: 1 };
    const worstOf = (ts) => ts.reduce((w, t) => (cmpTuple([...t, ""], [...w, ""]) > 0 ? t : w));
    const stat = { equal: 0, allPositive: 0, noValid: 0 };
    const byInput = Object.fromEntries(inputs.map((i) => [i, 0]));
    // compare a record with the input missing (M) against the fills of the record that had it (R)
    function compare(tag, V, R, M, input) {
      const fills = validFills(V, R, input);
      if (!fills.length) { stat.noValid++; return; } // no valid value: the no-evidence value is all there is
      const tm = tupleOf(evaluate(V, M)).slice(0, 5);
      const worst = worstOf(fills.map((F) => tupleOf(evaluate(V, F)).slice(0, 5)));
      if (tm.join() === worst.join()) { stat.equal++; return; }
      const k = TIER_KEY[input];
      if (k !== undefined && worst[k] < LAST[k]) {
        const expect = [...worst]; expect[k] = LAST[k];
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
          check(cmpTuple([...td.slice(0, 5), ""], [...ta.slice(0, 5), ""]) >= 0, `${V.id} ${R.id} del(${input}) RAISED the tuple: ${td} < ${ta}`);
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
        check(cmpTuple([...tupleOf(evaluate(V, D)).slice(0, 5), ""], [...ta.slice(0, 5), ""]) >= 0, `enum ${V.id} ${R.id} del(${input}) RAISED the tuple`);
      }
    }
    info(`fixture deletions ${pairs} (by input: ${Object.entries(byInput).map(([k, v]) => `${k}=${v}`).join(" ")}); enumeration deletions ${enumPairs}; natively-missing comparisons ${nativeN}`);
    info(`outcomes: equal to least favourable valid value ${stat.equal} (asserted); every valid value positive ⇒ fed tier at its last value ${stat.allPositive} (asserted); no valid value exists ${stat.noValid} (counted, NOT asserted — PB4 2 asks nothing there)`);
    info(`REPORTED, NOT ASSERTED — global rank after deletion: down ${rankDown}, unchanged ${rankSame}, up ${rankUp}. PB4 allows 'down'; 'never rises' is asserted on the tuple above`);
    // MN-1 … MN-6 of 34a §3.2 (MN-6 as amended in 34a §7), and CINV-5's 10억 fixture
    const pos = (V, set, id) => order(V, set).indexOf(id) + 1;
    const swap = (set, D) => set.map((x) => (x.id === D.id ? D : x));
    const bi = (id) => CORPUS.find((r) => r.id === id);
    const mn = [
      ["MN-1", Q.B, "bi-09", "projectType", "fallback", 4, 13],
      ["MN-2", Q.D, "bi-15", "projectType", "fallback", 1, 9],
      ["MN-3", Q.D, "bi-07", "projectType", "other", 10, 14],
      ["MN-4", Q.A, "bi-09", "area", "exact", 1, 3],
      ["MN-5", Q.A, "bi-09", "total", "exact", 1, 2],
      ["MN-6", Q.G, "bi-19", "workScopeIds", "other", 4, 19],
    ];
    for (const [tag, V, id, input, cls, before, after] of mn) {
      const D = deleted(bi(id), input);
      const got = [evaluate(V, D).matchClass, pos(V, CORPUS, id), pos(V, swap(CORPUS, D), id)];
      check(got.join() === [cls, before, after].join(), `${tag}: expected ${cls} ${before}→${after}, got ${got.join(" ")}`);
      info(`${tag} ${V.id} ${id} del(${input}): ${got[0]}, rank ${got[1]} → ${got[2]}`);
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
      const before = JSON.stringify(ev);
      let threw = null;
      try { disclose(V, R, ev); } catch (e) { threw = e; }
      n++;
      check(!threw && JSON.stringify(ev) === before, `disclosure wrote evaluation: ${V.id} ${R.id}`);
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
  "the hand-computed outcomes of 34a §3.1, §3.4 and §3.5 (as amended by 34a §6 and §7) follow from the contract",
  "each expected class / order / top-3 of 34a §3, with the cells 34a §6 (†, checker-found) and §7 (‡, fresh review) amend, is reproduced by the functions above",
  "same proposition for each listed example; examples 34a states in prose only are not asserted",
  () => {
    const cls = (V, set) => Object.fromEntries(set.map((R) => [R.id, evaluate(V, R).matchClass]));
    const eq = (tag, got, exp) => { check(JSON.stringify(got) === JSON.stringify(exp), `${tag}: got ${JSON.stringify(got)} expected ${JSON.stringify(exp)}`); };
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
    eq("O-6", order(Q.X2, CORPUS).slice(0, 7), ["bi-10", "bi-01", "bi-09", "bi-13", "bi-07", "bi-11", "bi-12"]);
    // §3.5 acceptance rows
    const top = {
      A: ["bi-09", "bi-01", "bi-10"], B: ["bi-11", "bi-01", "bi-07"], C: ["bi-14", "bi-04", "bi-16"], D: ["bi-15", "bi-04", "bi-16"],
      D2: ["bi-15", "bi-04", "bi-16"], E: ["bi-14", "bi-04", "bi-16"], F: ["bi-13", "bi-01", "bi-07"], G: ["bi-17", "bi-09", "bi-11"],
      H: ["bi-17", "bi-06", "bi-01"], I: ["bi-18", "bi-06", "bi-01"], "I-alt": ["bi-06", "bi-18", "bi-01"],
    };
    for (const [row, exp] of Object.entries(top)) eq(`row ${row} top-3`, order(Q[row], CORPUS).slice(0, 3), exp);
    eq("row A full", order(Q.A, CORPUS), ["bi-09", "bi-01", "bi-10", "bi-12", "bi-07", "bi-11", "bi-13", "bi-04", "bi-06", "bi-17", "bi-19", "bi-05", "bi-16", "bi-18", "bi-02", "bi-03", "bi-08", "bi-14", "bi-15"]);
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

// ─────────────────────────────── summary ───────────────────────────────
console.log("\n══ SUMMARY");
for (const r of results) console.log(`   ${r.id.padEnd(3)} ${r.fails.length ? "FAIL" : "PASS"}  ${String(r.checks).padStart(8)} checks  ${r.title}`);
const failed = results.filter((r) => r.fails.length);
console.log(`   PROPERTIES = ${results.length}   PASS = ${results.length - failed.length}   FAIL = ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
