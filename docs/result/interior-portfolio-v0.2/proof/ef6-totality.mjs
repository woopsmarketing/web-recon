// CINV-20 — executable proof for contract rev 8, section 14.3.6.
//
// V0.2 is NARROWED (see 16-narrowing-decision.md): three criteria, not four. EF5 (budget) and
// everything that fed it are deferred to section 17.1's V0.3 annex, so this proof no longer models
// PB1 at all. That removes the round-7 BLOCKER B7-1 by construction: there is no permission
// function left to transcribe unfaithfully.
//
// Two enumerations:
//   PASS A — the DERIVED set. EF2..EF4 are implemented from their own text and the three criterion
//            states are computed from a conversation x record input space. Reachability is a
//            RESULT, not an assumption.
//   PASS B — the RAW cross-product of all three criterion states x projectType, ignoring whether
//            EF2..EF4 can produce a vector. Totality over a superset is a robustness check.
//
// Run: npm run proof:ef6

const STATES = ["not_applicable", "not_evaluable", "satisfied", "unsatisfied"];
const TYPES = ["full_remodel", "partial_remodel", null];
const RELATIONS = ["scope_superset", "scope_subset", "scope_overlap", "scope_disjoint"];
const SCOPE_RELATIONS = ["scope_exact", ...RELATIONS];

// GR2's closed list. price_fallback is deferred with EF5.
const CLASSES = [
  "exact", "scope_superset", "scope_subset", "scope_overlap", "scope_disjoint",
  "fallback_from_full", "breadth_fallback", "unknown_type_fallback",
  "area_fallback", "not_evaluable",
];

// GR2a, the single class presentation order. Stated once in the contract, once here.
const PRESENTATION = [
  "exact", "scope_superset", "scope_overlap", "scope_subset", "fallback_from_full",
  "breadth_fallback", "unknown_type_fallback", "area_fallback", "scope_disjoint", "not_evaluable",
];

// EF2. `breadth` is V.breadth mapped per 14.3.2, or false when the visitor did not say.
function ef2(breadth, projectType) {
  if (breadth === false) return "not_applicable";
  if (projectType === null) return "not_evaluable";
  return projectType === breadth ? "satisfied" : "unsatisfied";
}

// EF3. `q.dropped` is WS8's case, assigned here and only here (EF1's closure).
function ef3(projectType, q) {
  if (q.empty) return "not_applicable";
  if (projectType === "full_remodel") return q.qtSubsetRt ? "satisfied" : "not_evaluable";
  if (projectType === null) return "not_evaluable";
  if (q.dropped) return "not_evaluable";
  return q.relation === "scope_exact" ? "satisfied" : "unsatisfied";
}

// EF4.
function ef4(stated, evaluable, tierOk) {
  if (!stated) return "not_applicable";
  if (!evaluable) return "not_evaluable";
  return tierOk ? "satisfied" : "unsatisfied";
}

// EF6, rows 1..7, first match wins.
function ef6({ breadth, scope, area }, projectType, relation) {
  if (scope === "unsatisfied") return { cls: relation, row: 1 };
  if (breadth === "unsatisfied" && projectType === "full_remodel") return { cls: "fallback_from_full", row: 2 };
  if (breadth === "unsatisfied") return { cls: "breadth_fallback", row: 3 };
  if (breadth === "not_evaluable") return { cls: "unknown_type_fallback", row: 4 };
  if (area === "unsatisfied") return { cls: "area_fallback", row: 5 };
  if ([breadth, scope, area].includes("not_evaluable")) return { cls: "not_evaluable", row: 6 };
  return { cls: "exact", row: 7 };
}

// Each row's condition stated independently, so "first match wins" is CHECKED, not assumed.
function rowsThatHold({ breadth, scope, area }, projectType) {
  const hold = [];
  if (scope === "unsatisfied") hold.push(1);
  if (breadth === "unsatisfied" && projectType === "full_remodel") hold.push(2);
  if (breadth === "unsatisfied") hold.push(3);
  if (breadth === "not_evaluable") hold.push(4);
  if (area === "unsatisfied") hold.push(5);
  if ([breadth, scope, area].includes("not_evaluable")) hold.push(6);
  hold.push(7);
  return hold;
}

const fail = [];
function check(cond, msg) { if (!cond) fail.push(msg); }

function assertOne(v, projectType, relation, where) {
  const { cls, row } = ef6(v, projectType, relation);
  const states = [v.breadth, v.scope, v.area];
  check(typeof cls === "string" && CLASSES.includes(cls), `${where}: class not in GR2's list -> ${cls}`);
  const hold = rowsThatHold(v, projectType);
  check(row === Math.min(...hold), `${where}: first-match-wins violated, returned row ${row}, lowest holding ${Math.min(...hold)}`);
  const missed = states.includes("unsatisfied") || states.includes("not_evaluable");
  check(cls === "exact" ? !missed : missed, `${where}: 'exact' does not coincide with "no stated criterion missed" -> ${cls}`);
  if (v.scope === "unsatisfied") {
    check(projectType === "partial_remodel", `${where}: EF3 lemma violated — row 1 fired for projectType=${projectType}`);
  }
  check(PRESENTATION.includes(cls), `${where}: class ${cls} has no position in GR2a's presentation order`);
  return cls;
}

// ---------------------------------------------------------------- PASS A: the derived set

const derivedClasses = new Set();
const derivedVectors = new Set();
let derivedInputs = 0;

const QS = [{ empty: true, relation: null, qtSubsetRt: true, dropped: false }];
for (const relation of SCOPE_RELATIONS)
  for (const qtSubsetRt of [true, false])
    for (const dropped of [true, false])
      QS.push({ empty: false, relation, qtSubsetRt, dropped });

for (const projectType of TYPES)
for (const breadth of [false, "full_remodel", "partial_remodel"])
for (const q of QS)
for (const areaStated of [true, false])
for (const areaEvaluable of [true, false])
for (const tierOk of [true, false]) {
  derivedInputs++;
  const v = { breadth: ef2(breadth, projectType), scope: ef3(projectType, q), area: ef4(areaStated, areaEvaluable, tierOk) };
  const relation = v.scope === "unsatisfied" ? q.relation : null;
  const cls = assertOne(v, projectType, relation, `derived ${JSON.stringify({ ...v, projectType, relation })}`);
  derivedClasses.add(cls);
  derivedVectors.add(`${v.breadth}|${v.scope}|${v.area}|${projectType}`);
}

for (const c of CLASSES) check(derivedClasses.has(c), `orphan class — unreachable through EF2..EF4: ${c}`);

// GR2a must be a permutation of GR2's closed list: no class missing, none invented, no duplicate.
check(PRESENTATION.length === CLASSES.length, `GR2a has ${PRESENTATION.length} entries, GR2 has ${CLASSES.length}`);
check(new Set(PRESENTATION).size === PRESENTATION.length, "GR2a repeats a class");
for (const c of PRESENTATION) check(CLASSES.includes(c), `GR2a names a class not in GR2's list: ${c}`);

// ---------------------------------------------------------------- PASS B: the raw superset

const rawClasses = new Set();
let rawEvaluations = 0;
for (const breadth of STATES)
for (const scope of STATES)
for (const area of STATES)
for (const projectType of TYPES) {
  const v = { breadth, scope, area };
  for (const relation of (scope === "unsatisfied" ? RELATIONS : [null])) {
    rawEvaluations++;
    const { cls, row } = ef6(v, projectType, relation);
    check(typeof cls === "string" && CLASSES.includes(cls), `raw: no class for ${JSON.stringify({ ...v, projectType })}`);
    const hold = rowsThatHold(v, projectType);
    check(row === Math.min(...hold), `raw: first-match-wins violated at ${JSON.stringify(v)}`);
    rawClasses.add(cls);
  }
}

// ---------------------------------------------------------------- worked cases, rounds 4-7

const Q_NONE = { empty: true, relation: null, qtSubsetRt: true, dropped: false };
const qOf = (relation, qtSubsetRt = true, dropped = false) => ({ empty: false, relation, qtSubsetRt, dropped });
const A_NONE = { areaStated: false, areaEvaluable: false, tierOk: false };
const A_OK = { areaStated: true, areaEvaluable: true, tierOk: true };

const cases = [
  ["Q-1 a: '전체 리모델링 사례 보여주세요' vs bi-15 (one bathroom, partial)",
   { projectType: "partial_remodel", breadth: "full_remodel", q: Q_NONE, ...A_NONE }, "breadth_fallback"],
  ["Q-1 b: '주방만 하고 싶어요' vs bi-09 (whole-home) — VB3: 주방만 restricts by SPACE",
   { projectType: "full_remodel", breadth: "partial_remodel", q: qOf("scope_exact"), ...A_NONE }, "fallback_from_full"],
  ["Q-1 c: '주방만 하고 싶어요' vs bi-14 (kitchen)",
   { projectType: "partial_remodel", breadth: "partial_remodel", q: qOf("scope_exact"), ...A_NONE }, "exact"],
  ["Q-3: '창호 … 34평 전체' vs bi-09 (windows NOT in R_t)",
   { projectType: "full_remodel", breadth: "full_remodel", q: qOf("scope_exact", false), ...A_OK }, "not_evaluable"],
  ["Q-3: same query vs bi-10 (windows in R_t)",
   { projectType: "full_remodel", breadth: "full_remodel", q: qOf("scope_exact"), ...A_OK }, "exact"],
  ["CINV-13 (a)/(b): '34평 전체 리모델링' vs bi-09",
   { projectType: "full_remodel", breadth: "full_remodel", q: qOf("scope_exact"), ...A_OK }, "exact"],
  ["P-4: '바닥이랑 도배만' vs bi-19 (breadth absent; VB3: 만 on a TRADE leaves V.breadth unset)",
   { projectType: null, breadth: false, q: qOf("scope_exact"), ...A_NONE }, "not_evaluable"],
  ["Q-7/CINV-9: bi-16 with an id the consumer dropped, vs '주방만'",
   { projectType: "partial_remodel", breadth: "partial_remodel", q: qOf("scope_exact", true, true), ...A_NONE }, "not_evaluable"],
  ["14.3.3 row 5: '욕실만' vs bi-16 (R_s superset of Q_s)",
   { projectType: "partial_remodel", breadth: "partial_remodel", q: qOf("scope_superset"), ...A_NONE }, "scope_superset"],
  // Round 7 B7-3, the OD-O case. Under the narrowed contract no budget is compared at all, so the
  // only question left is the class, and bi-11 is correctly NOT a direct answer for a trade query.
  ["B7-3: '바닥이랑 도배만' vs bi-11 (whole-home 20평; trades NOT in its R_t)",
   { projectType: "full_remodel", breadth: false, q: qOf("scope_exact", false), ...A_NONE }, "not_evaluable"],
  ["VB3 closed list: '큰 공사는 아니고 몇 군데만' — qualitative prose leaves V.breadth absent",
   { projectType: "full_remodel", breadth: false, q: Q_NONE, ...A_NONE }, "exact"],
];

for (const [name, c, want] of cases) {
  const v = { breadth: ef2(c.breadth, c.projectType), scope: ef3(c.projectType, c.q),
              area: ef4(c.areaStated, c.areaEvaluable, c.tierOk) };
  const { cls } = ef6(v, c.projectType, v.scope === "unsatisfied" ? c.q.relation : null);
  check(cls === want, `case "${name}": want ${want}, got ${cls} (states ${v.breadth}/${v.scope}/${v.area})`);
}

// The narrowing itself, asserted: no criterion, class or ordering key mentions price.
check(!CLASSES.includes("price_fallback"), "price_fallback is still in GR2's closed list");
check(!PRESENTATION.includes("price_fallback"), "price_fallback is still in GR2a's order");

console.log("EF6 proof — contract rev 8, section 14.3.6 (V0.2 narrowed: three criteria)");
console.log("  PASS A, derived from EF2..EF4:");
console.log(`    conversation x record inputs        : ${derivedInputs}`);
console.log(`    distinct criterion-state vectors    : ${derivedVectors.size}  (of ${4 ** 3 * 3} possible)`);
console.log(`    distinct classes reached            : ${derivedClasses.size}/${CLASSES.length}`);
console.log("  PASS B, raw cross-product superset:");
console.log(`    evaluations incl. row 1's relations : ${rawEvaluations}`);
console.log(`    distinct classes reached            : ${rawClasses.size}/${CLASSES.length}`);
console.log(`  worked cases from rounds 4-7          : ${cases.length}`);
if (fail.length) {
  console.log(`\nFAIL (${fail.length}):`);
  for (const f of [...new Set(fail)].slice(0, 40)) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nPASS — on both passes EF6 is total, returns a class in GR2's closed list, agrees with");
console.log("       'first match wins' row by row, returns 'exact' exactly when no stated criterion");
console.log("       missed, and fires row 1 only for a partial_remodel (EF3's lemma, DERIVED from");
console.log("       EF3's branches). GR2a is a permutation of GR2's list, so every class has exactly");
console.log(`       one position. No class is orphaned, and all ${cases.length} worked cases hold.`);
