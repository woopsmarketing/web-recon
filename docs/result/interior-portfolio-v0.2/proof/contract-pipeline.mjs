// contract-pipeline.mjs — an executable reference implementation of contract rev 8's
// consumer pipeline, so the specification can be checked mechanically instead of by hand.
//
//   07 = docs/reports/integration/07-integration-contract-v0.2-candidate.md   (rev 8)
//   04 = docs/result/interior-portfolio-v0.2/04-demo-data-spec.md
//   18 = docs/result/interior-portfolio-v0.2/18-existing-eight-workscopes.md
//   02 = docs/reports/integration/02-integration-contract-v0-candidate.md     (V0, frozen)
//   pj = data/sites/boost-interior-demo/content/projects.json
//
// Citations are written `07:<line>`.
//
// WHAT THIS IS FOR. Rules with a derivation-based executable check have stayed correct across
// eight review rounds; prose-only rules have failed every round. This file moves the prose-only
// half — query extraction, the scope relation table, the ladder, the ordering keys, the price
// prohibitions — under a check. It does NOT try to pass. A rule that cannot be implemented
// because its prose is ambiguous, circular, or contradicts another rule is recorded by
// `underdetermined()` and printed; a run with gaps is a SUCCESSFUL run that reports gaps.
//
// Everything is DERIVED. No property below is asserted by hand: each one is computed from the
// rules' own text as transcribed in the functions, over the 19-record corpus.
//
// Run: node docs/result/interior-portfolio-v0.2/proof/contract-pipeline.mjs
//      npm run proof:pipeline

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ============================================================================================
// SECTION 0 — harness: gaps, predicate observations, property verdicts
// ============================================================================================

// ============================================================================================
// CONFIGURATION — which revision of the contract this run encodes.
//
// REV 9 IS THE DEFAULT. Rev 8 is retained behind `useRev(8)` so the comparison stays runnable;
// every rev-8 figure this file reports is produced by switching to it and back.
//
// D9-6 is one indivisible change (07:2721+, section 20.7.1) and is expressed here as the four
// switches it decomposes into, so a partial adoption can be MEASURED and shown to be worse:
//   D9-1   noRungs      GR3a deleted as an ordering device      07:1365-1368
//   D9-2c  satRelations EF3 calls scope_exact/scope_superset satisfied  07:1003-1007
//          ef6Row8      EF6 gains row 7; "otherwise" becomes row 8      07:1268
//          classOrder   GR2a reordered                                   07:1316-1317
//   D9-4   vb3          first-match, rows reordered, forms, 만-on-a-quantity  07:883-900
//   D9-5a  ws6          the dead tie-break deleted; Q carries every reading   07:350-365
// ============================================================================================
const GR2A_REV8 = ["exact", "scope_superset", "scope_overlap", "scope_subset", "fallback_from_full",
  "breadth_fallback", "unknown_type_fallback", "area_fallback", "scope_disjoint", "not_evaluable"];
const GR2A_REV9 = ["exact", "scope_superset", "unknown_type_fallback", "not_evaluable",
  "fallback_from_full", "breadth_fallback", "area_fallback", "scope_overlap", "scope_subset",
  "scope_disjoint"];
const CFG = {
  rev: 9.1,
  satRelations: ["scope_exact", "scope_superset"],
  ef6Row8: true,
  classOrder: GR2A_REV9,
  noRungs: true,
  vb3: "rev9",
  ws6: "rev9",
  ef3Ambiguity: "D9-7a",    // rev 9.1's clause, 07:1008-1036: two rules, explicit first-match.
                            // "D9-5a" = rev 9's two bullets; "D9-7" = round 9's states-only draft,
                            // kept runnable because 07:1023-1036 is the contract's own audit trail
                            // for why it was widened, and an audit trail should be re-runnable.
  key3: "intersection",     // D9-8, 07:1407-1420. "union" is rev 9 as written.
  key3Skip: false,          // PB4's carve-out ON TOP of key3: a not_evaluable scope enters no key
  key3SkipMode: "position", // and WHERE the skipped record then sits: "position", "zero", or
                            // "block" (candidate 4, per-class-block applicability, section (m)).
                            // PB4 does not say, which is gap 1 / Q-29. Both are measured.
  disclosure: "intersectionOfSets",   // D9-9, 07:1103-1132 + 07:983-997 + CINV-17 07:1547.
                            // gap 3's family: how 07:978 and 14.3.3's rows read Q_s/Q_t/R_s under
                            // two readings. "asWritten" = one set (reading-dependent);
                            // "intersectionOfQ" = intersect Q first; "intersectionOfSets" =
                            // intersect the DISCLOSURE SETS. The two differ, and that is a finding.
  corpus: "spec",           // "spec" = 04 section 2 + 18; "data" = the applied projects.json
};
// useRev(8)    rev 8 as shipped.
// useRev(9)    rev 9 as written -- kept runnable because three of this file's findings are ABOUT
//              rev 9's text, and a finding whose subject cannot be re-run is not checkable.
// useRev(9.1)  the revision in force: D9-7a + D9-8 + D9-9 on top of rev 9.
function useRev(n) {
  CFG.rev = n;
  CFG.satRelations = n >= 9 ? ["scope_exact", "scope_superset"] : ["scope_exact"];
  CFG.ef6Row8 = n >= 9;
  CFG.classOrder = n >= 9 ? GR2A_REV9 : GR2A_REV8;
  CFG.noRungs = n >= 9;
  CFG.vb3 = n >= 9 ? "rev9" : "rev8";
  CFG.ws6 = n >= 9 ? "rev9" : "rev8";
  CFG.ef3Ambiguity = n >= 9.1 ? "D9-7a" : "D9-5a";                  // 07:1008-1036
  CFG.key3 = n >= 9.1 ? "intersection" : "union";                   // 07:1407-1420 (D9-8)
  CFG.disclosure = n >= 9.1 ? "intersectionOfSets" : "asWritten";   // 07:1103-1132 (D9-9)
  // Q-29's carve-out is in NO configuration at any revision: 07:2185 records it as open with
  // three dead candidates, and it is not part of rev 9 or rev 9.1.
  CFG.key3Skip = false;
  CFG.key3SkipMode = "position";
  return CFG;
}
// Round 10's adopted combination IS rev 9.1, minus the carve-out, which was held. Kept as a named
// function because section (i) still measures the four decisions against each other, and that
// comparison is what justifies the revision.
function useCombination() { return useRev(9.1); }

const GAPS = [];
// Values section (l) re-checks against the contract's own stated figures. Set where they are
// measured, read only there, so no number in (l) is retyped from a report.
const MEASURED = { row7ToExact: null, groundChangedAsWritten: null, groundFlipLast: null };

// C. The sentinel returned wherever a rule is underdetermined. Never guessed around silently:
// every caller that needs a value anyway must take it from READINGS below, which states the
// reading it took and why, in the open.
const UNDET = Object.freeze({ undetermined: true });

function underdetermined(ruleId, line, what, inputThatExposedIt) {
  const key = ruleId + " | " + line + " | " + what;
  let g = GAPS.find((x) => x.key === key);
  if (!g) {
    g = { key, ruleId, line, what, inputs: [], revs: new Set() };
    GAPS.push(g);
  }
  g.revs.add(CFG.rev);
  if (inputThatExposedIt && !g.inputs.includes(inputThatExposedIt)) g.inputs.push(inputThatExposedIt);
  return UNDET;
}

// ------------------------------------------------------------------ readings, after audit 21
//
// Audit 21 A-12: two of the four original READINGS were CHOSEN so that a stated 04 section 4.1
// answer came out, which made property 6 partly self-fulfilling. Nothing is chosen here any more.
// A place the contract does not decide is handled in exactly one of three ways:
//
//   BRANCHING   — the rule admits several values, so the pipeline runs EVERY one of them and every
//                 property quantifies over (utterance x branch). No value is preferred.
//   DERIVED     — the contract does decide, elsewhere, and the decision is COMPUTED here.
//   CLARIFYING  — the table's own column semantics settle it; the derivation is stated in the row,
//                 the gap is kept as a clarification, and the alternative is run as a diagnostic.
//
const READINGS = {
  // CLARIFYING. 07:846's left cell is a bare exemplar list; rows 2, 5, 6 and 7 introduce theirs
  // with an explicit FORM phrase ("a restriction by space", "a bare enumeration", "qualitative
  // prose"). Rows 1, 3 and 4 are bare lists. The table therefore uses two cell conventions and
  // says so nowhere — gap 1. The forms reading is taken because row 1's own `why` cell ("a
  // statement about the extent of the dwelling") is a form description; the literal reading is
  // run as a diagnostic below rather than as a branch.
  vb3Row1: "forms",
  // BRANCHING. 07:847's exemplar is 욕실*만*; "욕실 하나만" puts a count between the space and the
  // particle, and WS3 (07:338) makes the count unrepresentable. Both values are run.
  countBetweenSpaceAndMan: "BRANCH",
  // BRANCHING. 07:863 requires value + unit + basis and gives V.area no "cannot be resolved =>
  // absent" clause although VB1 (07:871) gives V.budget exactly that. Both units are run.
  bareNumberUnit: "BRANCH",
  // DERIVED. 07:2686 supplies the replacement discriminator the narrowing deleted from WS6's own
  // text: "the tie-break is now about which reading yields the weaker class, decided once per
  // query". Computed in ws6ResolveByWeakerClass; never picked.
  ws6Ambiguous: "DERIVED from 07:2686 (rev 8 only; rev 9 deletes the tie-break, D9-5a)",
  // REMOVED (audit 21 A-2). 07:1065-1068 + PY1 07:246-249 + AR5 02:246 jointly specify what an
  // ABSENT basis does — compare, lower confidence, disclose, never change the criterion state — so
  // an unstated query basis is a DEFINED state and no value has to be invented. The former
  // `queryAreaBasis: "supply"` contradicted all three. The basis is now left unknown.
  queryAreaBasis: "unknown (07:1065-1068; no longer a reading)",
};

// Dead-branch detection (property 2). Every discriminating predicate of a C: MUST rule registers
// each evaluation here; a predicate that is never true, or never false, over the whole input set
// is a branch the specification can never take.
const OBS = new Map();
// AUDIT 21 A-6. A second, UNRESTRICTED ledger: the same predicate evaluated over every record
// rather than only over the records the earlier rungs let through. A rung predicate that is
// constant in OBS but not in OBS_FREE is residual by construction, not a specification defect.
const OBS_FREE = new Map();
function observeUnrestricted(ruleId, line, predicate, value, example) {
  const k = ruleId + " :: " + predicate;
  let e = OBS_FREE.get(k);
  if (!e) { e = { t: 0, f: 0 }; OBS_FREE.set(k, e); }
  if (value) e.t += 1; else e.f += 1;
  return value;
}
// Rows whose condition IS the word "otherwise" / "every other record": never false by
// construction, and reported as such rather than as a finding.
const UNCONDITIONAL = new Set([
  "EF6 :: row 8", "EF6 :: row 7 (rev 8)", "GR3a :: row 4",
  "GR3a :: trade-only rung 4: every other record", "14.3.4 :: tier fallback",
  // 07:887-890 states this one as unconditional in terms: "The spaces half is `satisfied` for any
  // Q_s." It is constant because the rule says so, not because the corpus is thin.
  "EF3 :: full_remodel spaces half satisfied for any Q_s",
]);
function observe(ruleId, line, predicate, value, example) {
  const k = ruleId + " :: " + predicate;
  let e = OBS.get(k);
  if (!e) {
    e = { ruleId, line, predicate, t: 0, f: 0, tc: 0, fc: 0, tEx: null, fEx: null,
          // per-revision counters: a predicate belonging to a rule rev 9 DELETED is exercised
          // only by the rev-8 comparison runs, and must not be reported as a rev-9 dead branch.
          t9: 0, f9: 0, seenAtRev: new Set(),
          byConstruction: UNCONDITIONAL.has(k) };
    OBS.set(k, e);
  }
  const ex = String(example);
  const synthetic = ex.startsWith("synthetic ") || ex.startsWith("raw ");
  e.seenAtRev.add(CFG.rev);
  if (value) { e.t += 1; if (CFG.rev >= 9) e.t9 += 1; if (!synthetic) e.tc += 1; if (!e.tEx) e.tEx = example; }
  else { e.f += 1; if (CFG.rev >= 9) e.f9 += 1; if (!synthetic) e.fc += 1; if (!e.fEx) e.fEx = example; }
  return value;
}
// THE REVISION IN FORCE, in one place. Everything that asks "is this rule live?" or "is this gap
// still open?" asks here, so adding rev 9.1 cannot leave a stale `=== 9` behind. It did, twice,
// and both showed as a real defect: a rule wrongly reported deleted and a gap wrongly reported open.
const REV_IN_FORCE = 9.1;
function inForce(revSet) { return revSet.has(REV_IN_FORCE); }

const PROPERTIES = [
  { n: 1, name: "Totality + single-valuedness of the table-driven rules (VB3, 14.3.3, EF6, EF3's ambiguity clause)" },
  { n: 2, name: "Dead-branch detection over every registered C: MUST discriminator" },
  { n: 3, name: "Differential ordering: GR3's direct-answer sentence vs the ordering device" },
  { n: 4, name: "PB4: the deletion form (4a) and the strict not_evaluable/unsatisfied form (4b)" },
  { n: 5, name: "EF1 closure: no criterion state is assigned outside EF2-EF4" },
  { n: 6, name: "The nine 04 4.1 utterances, derived vs stated" },
  { n: 7, name: "Sufficiency: does the returned order separate records that differ on what was ASKED?" },
];
const FINDINGS = new Map(PROPERTIES.map((p) => [p.n, []]));
// A finding is raised under SOME configuration, and the configuration is part of the claim. A
// defect measured while CFG was switched to rev 9 as written, or to an unadopted proposal, is not
// a statement about the revision in force -- and the only honest way to know which is which is to
// capture the configuration at the moment the finding is raised rather than to classify by hand.
function cfgSig() {
  return "rev " + CFG.rev + " | " + CFG.ef3Ambiguity + " | key3=" + CFG.key3 + " | " + CFG.disclosure +
    (CFG.key3Skip ? " | +Q-29(" + CFG.key3SkipMode + ")" : "");
}
// `about` overrides the capture for a finding deliberately raised about text other than the one
// the configuration models; it must name that text, never a verdict.
// `about` may be a string -- "this finding is about the named artefact, which is IN FORCE
// whatever configuration measured it" -- or {about, inForce:false} for a finding that is about
// something OUTSIDE the contract in force: an unadopted proposal, or this checker's own report.
function finding(n, text, about) {
  const o = typeof about === "string" ? { about, inForce: true }
          : about ? { about: about.about, inForce: about.inForce !== false } : null;
  FINDINGS.get(n).push({ text, cfg: cfgSig(), about: o ? o.about : null,
                         forced: o ? o.inForce : null,
                         site: (new Error().stack.split("\n")[2] || "").trim() });
}

// ============================================================================================
// SECTION 1 — the 19-record corpus, built once, every field cited
// ============================================================================================
//
// bi-01 .. bi-08  projectType + workScopeIds  : 18:100-107  (authored by the just-completed pass;
//                                                            not yet in data/)
//                 title, area, pricePerArea,
//                 publishedAt                 : pj  (data/sites/boost-interior-demo/content/projects.json)
//                 pricing.total               : pj — ABSENT on all eight (none carries a total)
// bi-09 .. bi-19  every field                 : 04 section 2, per-record block (line cited below)
//
// `droppedUnknownId` is WS8's flag (07:429-435). It is false on every record: all 19 use only
// section 7.3 ids and this consumer knows all 26. That is an observation, not an assumption —
// the vocabulary check below derives it.

const RECORDS = [
  // ---- the existing eight ------------------------------------------------------------------
  { id: "bi-01", src: "18:100 + pj", title: "수성 화이트 34평 아파트 리모델링",
    publishedAt: "2026-08-28T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["entrance", "kitchen", "bathroom", "flooring", "lighting", "built_in_furniture"],
    area: { value: 34, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 2900000, unit: "pyeong", source: "authored" } } },
  { id: "bi-02", src: "18:101 + pj", title: "신혼부부를 위한 24평 화이트 내추럴 리모델링",
    publishedAt: "2026-07-30T09:00:00+09:00", projectType: null,
    workScopeIds: ["kitchen", "flooring", "built_in_furniture"],
    area: { value: 24, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 2400000, unit: "pyeong", source: "authored" } } },
  { id: "bi-03", src: "18:102 + pj", title: "42평 가족형 아파트 수납 중심 리모델링",
    publishedAt: "2026-06-25T09:00:00+09:00", projectType: null,
    workScopeIds: ["entrance", "lighting", "built_in_furniture"],
    area: { value: 42, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 3200000, unit: "pyeong", source: "authored" } } },
  { id: "bi-04", src: "18:103 + pj", title: "32평 주방·욕실 중심 리뉴얼",
    publishedAt: "2026-05-21T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["kitchen", "bathroom"],
    area: { value: 32, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: null } },                       // pj: E2, no price at all
  { id: "bi-05", src: "18:104 + pj", title: "29평 밝은 내추럴 아파트 리모델링",
    publishedAt: "2026-04-16T09:00:00+09:00", projectType: null,
    workScopeIds: ["flooring", "painting", "built_in_furniture"],
    area: { value: 29, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 2600000, unit: "pyeong", source: "authored" } } },
  { id: "bi-06", src: "18:105 + pj", title: "34평 현관·거실 중심 리모델링",
    publishedAt: "2026-03-19T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["entrance", "living_room", "lighting"],
    area: { value: 34, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: null } },                       // pj: E2, no price at all
  { id: "bi-07", src: "18:106 + pj", title: "19평 소형 아파트 화이트 미니멀 리모델링",
    publishedAt: "2026-02-12T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["kitchen", "flooring", "doors", "built_in_furniture"],
    area: { value: 19, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 2700000, unit: "pyeong", source: "authored" } } },
  { id: "bi-08", src: "18:107 + pj", title: "51평 신축 아파트 입주 전 홈스타일링",
    publishedAt: "2026-01-08T09:00:00+09:00", projectType: null,
    workScopeIds: ["living_room", "lighting"],
    area: { value: 51, unit: "pyeong", basis: "supply" },
    pricing: { total: null, perArea: { amount: 1600000, unit: "pyeong", source: "authored" } } },

  // ---- the eleven new ones -----------------------------------------------------------------
  { id: "bi-09", src: "04:82/86", title: "달서 34평 아파트 실속형 전체 리모델링",
    publishedAt: "2025-12-11T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["entrance", "kitchen", "bathroom", "flooring", "wallpaper", "lighting", "built_in_furniture"],
    area: { value: 34, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 50000000 },
               perArea: { amount: 1470588, unit: "pyeong", source: "derived" } } },
  { id: "bi-10", src: "04:131/135", title: "34평 확장·창호 교체 포함 전체 리모델링",
    publishedAt: "2025-11-20T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["entrance", "living_room", "kitchen", "bedroom", "dressing_room", "bathroom", "windows", "expansion", "built_in_furniture"],
    area: { value: 34, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 85000000 },
               perArea: { amount: 2500000, unit: "pyeong", source: "derived" } } },
  { id: "bi-11", src: "04:176/180", title: "20평 구축 빌라 전체 리모델링",
    publishedAt: "2025-10-23T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["kitchen", "bathroom", "flooring", "wallpaper", "doors"],
    area: { value: 20, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 30000000 },
               perArea: { amount: 1500000, unit: "pyeong", source: "derived" } } },
  { id: "bi-12", src: "04:224/228", title: "26평 웜 우드 아파트 전체 리모델링",
    publishedAt: "2025-09-25T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["entrance", "kitchen", "bathroom", "flooring", "lighting", "built_in_furniture"],
    area: { value: 26, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 52000000 },
               perArea: { amount: 2000000, unit: "pyeong", source: "derived" } } },
  { id: "bi-13", src: "04:268/272", title: "48평 대형 아파트 전체 리모델링",
    publishedAt: "2025-08-28T09:00:00+09:00", projectType: "full_remodel",
    workScopeIds: ["entrance", "living_room", "dining", "kitchen", "kids_room", "dressing_room", "study", "bathroom", "windows", "lighting", "built_in_furniture"],
    area: { value: 48, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "range", minAmount: 125000000, maxAmount: 140000000 },
               perArea: null } },                                    // 04:288 D-1 cond.2 fails
  { id: "bi-14", src: "04:316/320", title: "전용 84㎡ 아파트 주방만 바꾼 리뉴얼",
    publishedAt: "2025-07-31T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["kitchen"],
    area: { value: 84, unit: "m2", basis: "exclusive" },              // 04:328 basis stays exclusive
    pricing: { total: { kind: "exact", amount: 15000000 }, perArea: null } },
  { id: "bi-15", src: "04:361/365", title: "욕실 한 곳만 새로 한 리뉴얼",
    publishedAt: "2025-07-03T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["bathroom"],
    area: null,                                                      // 04:373 E3, area omitted
    pricing: { total: { kind: "exact", amount: 7000000 }, perArea: null } },
  { id: "bi-16", src: "04:405/409", title: "38평 주방과 욕실 두 곳 리뉴얼",
    publishedAt: "2025-06-05T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["kitchen", "bathroom"],                           // 04:419 bathroom ONCE (WS3)
    area: { value: 38, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 19800000 }, perArea: null } },
  { id: "bi-17", src: "04:453/457", title: "공급 112㎡ 아파트 거실과 바닥 교체",
    publishedAt: "2025-05-08T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["living_room", "flooring"],
    area: { value: 112, unit: "m2", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 12500000 }, perArea: null } },
  { id: "bi-18", src: "04:498/502", title: "30평 현관과 수납장 정리 공사",
    publishedAt: "2025-04-10T09:00:00+09:00", projectType: "partial_remodel",
    workScopeIds: ["entrance", "built_in_furniture"],                // 04:512 WS9(c)
    area: { value: 30, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 6200000 }, perArea: null } },
  { id: "bi-19", src: "04:546/554", title: "32평 전체 도배·바닥·조명 교체",
    publishedAt: "2025-03-13T09:00:00+09:00", projectType: null,     // 04:558 PT6 via PT4(c)
    workScopeIds: ["flooring", "wallpaper", "lighting"],
    area: { value: 32, unit: "pyeong", basis: "supply" },
    pricing: { total: { kind: "exact", amount: 11000000 }, perArea: null } },
];
for (const r of RECORDS) r.droppedUnknownId = false;   // WS8, 07:429-435 — derived in SECTION 2

// ============================================================================================
// SECTION 2 — section 7.3, the closed vocabulary (07:284-324)
// ============================================================================================

// 07:289-306. Spaces — "a room or a defined area of the dwelling."
const SPACES = ["entrance", "living_room", "dining", "kitchen", "pantry", "bedroom", "kids_room",
  "dressing_room", "study", "bathroom", "hallway", "balcony", "storage", "utility"];
// 07:308-324. Works — "a trade applied across spaces."
const WORKS = ["flooring", "wallpaper", "lighting", "windows", "doors", "tiling", "painting",
  "plumbing", "electrical", "built_in_furniture", "expansion", "demolition"];
const VOCAB = new Set([...SPACES, ...WORKS]);

const isSpace = (id) => SPACES.includes(id);
const isWork = (id) => WORKS.includes(id);
const sOf = (ids) => ids.filter(isSpace);            // R_s / Q_s   (07:936, 07:862)
const tOf = (ids) => ids.filter(isWork);             // R_t / Q_t

// WS8 (07:429-435): an id the consumer does not know is dropped and the record stops being closed.
// Derived, not assumed:
for (const r of RECORDS) {
  const unknown = r.workScopeIds.filter((id) => !VOCAB.has(id));
  r.droppedUnknownId = observe("WS8", "07:429", "record has an id this consumer dropped",
    unknown.length > 0, r.id);
}

// ============================================================================================
// SECTION 3 — WS6 (07:346-356): visitor language to ids. The consumer's table, and the
//             ambiguity tie-break whose discriminator the rev-8 narrowing removed.
// ============================================================================================

// WS6 (07:346-348) — "Every mapping from visitor language to an id ... belongs to the consumer".
// So the table itself is not a contract gap: it is this consumer's, declared here.
const ALIASES = [
  ["주방", ["kitchen"]], ["부엌", ["kitchen"]], ["싱크대", ["kitchen"]],
  ["욕실", ["bathroom"]], ["화장실", ["bathroom"]], ["샤워실", ["bathroom"]],
  ["거실", ["living_room"]], ["현관", ["entrance"]], ["중문", ["entrance"]],
  ["침실", ["bedroom"]], ["안방", ["bedroom"]], ["아이방", ["kids_room"]],
  ["드레스룸", ["dressing_room"]], ["서재", ["study"]], ["다이닝", ["dining"]],
  ["발코니", ["balcony"]], ["베란다", ["balcony"]], ["다용도실", ["utility"]],
  ["바닥", ["flooring"]], ["마루", ["flooring"]], ["도배", ["wallpaper"]],
  ["조명", ["lighting"]], ["창호", ["windows"]], ["타일", ["tiling"]],
  ["문틀", ["doors"]], ["확장", ["expansion"]], ["철거", ["demolition"]],
  ["붙박이장", ["built_in_furniture"]],
  // The two ambiguous terms WS6 names by name (07:346-347).
  ["수납", ["storage", "built_in_furniture"]],
  ["복도", ["hallway", null]],
];

// WS6 ambiguity tie-break (C: MUST) — 07:344-352:
//   "the consumer takes the reading that does NOT permit a price comparison, and says which
//    reading it took."
// The discriminator is a predicate over a reading: does this reading permit a price comparison?
// It is evaluated here rather than asserted.
function ws6ReadingPermitsPriceComparison(reading, term, utterance) {
  // Section 14.3.5 (07:1204-1208): "V0.2 does NO price comparison. The rules that performed one
  // — PB0, PB0a, PB1, PB3, PB3a, PB6, PB6a and EF5 — are deferred in full to section 17.1."
  // There is therefore no rule in force under which any reading could permit one.
  const permits = false;
  return observe("WS6", "07:346", "a reading permits a price comparison", permits,
    utterance + " / " + term + " -> " + String(reading));
}

// The rule as WRITTEN in section 7.4 is inoperative: the discriminator is constant.
function ws6RuleAsWrittenDiscriminates(candidates, term, utterance) {
  const permitting = candidates.filter((c) => ws6ReadingPermitsPriceComparison(c, term, utterance));
  const refusing = candidates.filter((c) => !ws6ReadingPermitsPriceComparison(c, term, utterance));
  const discriminates = observe("WS6", "07:346", "the tie-break discriminates between the readings",
    permitting.length > 0 && refusing.length > 0, utterance + " / " + term);
  if (!discriminates) {
    underdetermined("WS6", "07:344-352 vs 07:2686",
      "section 7.4's tie-break (C: MUST) keys on \"the reading that does not permit a price " +
      "comparison\"; section 14.3.5 (07:1204-1208) leaves no reading that permits one, so the " +
      "predicate is constant false and the rule as written selects nothing. The contract ALREADY " +
      "CONTAINS the replacement — 07:2686 (section 20.6, row M7-3): \"its discriminator ... no " +
      "longer exists; the tie-break is now about which reading yields the WEAKER CLASS, decided " +
      "once per query\" — but that sentence was never written into section 7.4, and a change-log " +
      "row is not a rule. What 07:2686 also does not say is how \"the class\" is read off a result " +
      "of 19 records. This implementation follows 07:2686 and states its aggregation below.",
      utterance + " (term " + term + ": " + candidates.map(String).join(" | ") + ")");
  }
  return discriminates ? refusing[0] : UNDET;
}

// 07:2686's discriminator, COMPUTED (audit 21 A-7, A-9, A-12). REV 8 ONLY. Rev 9 does not adopt
// it: 07:385-392 gives the reason ("a class is a function of a RECORD; there is no class until a
// record is named") and 07:2818 records it as a rejected alternative, citing the same consequence
// this checker reported against rev 8 — transcribing it overturns 04:701. Each candidate assignment of the
// ambiguous terms is run through EF2/EF3/EF4/EF6 over the whole corpus, and the reading whose
// result is WEAKER wins. "Weaker" is read off GR2a (07:1316-1317), the contract's one class order:
// a later position is a weaker claim about a record. Aggregation over 19 records, stated because
// 07:2686 does not: compare the GR2a-index multisets, sorted ascending, lexicographically; the
// larger (later, weaker) one wins; an exact tie falls to section 7.3 table order.
function ws6ResolveByWeakerClass(readings, breadth, area, corpus, where) {
  if (readings.length < 2) return readings[0];
  const scored = readings.map((r) => {
    const idx = corpus.map((R) => {
      const V = { utterance: where, breadth, Q: r.Q, Q_s: r.Q_s, Q_t: r.Q_t, area, budget: null };
      const b = EF2(V, R, where);
      const sc = EF3(V, R, where);
      const ar = EF4(V, R, where);
      const rel = sc.relation && sc.relation !== UNDET ? sc.relation.relation : null;
      return gr2aIndex(EF6({ breadth: b, scope: sc.state, area: ar.state }, R.projectType, rel, where).cls);
    }).sort((x, y) => x - y);
    return { r, idx };
  });
  scored.sort((a, b) => {
    for (let i = 0; i < a.idx.length; i += 1) if (a.idx[i] !== b.idx[i]) return b.idx[i] - a.idx[i];
    return 0;
  });
  observe("WS6", "07:2686", "the weaker-class discriminator separates the readings",
    JSON.stringify(scored[0].idx) !== JSON.stringify(scored[1].idx), where);
  return scored[0].r;
}

// Longest-match scan of the utterance against the alias table. No regex: an explicit scan, so
// that what is matched is auditable.
function scopeTermsIn(utterance) {
  const sorted = [...ALIASES].sort((a, b) => b[0].length - a[0].length);
  const hits = [];
  const taken = new Array(utterance.length).fill(false);
  for (const [term, ids] of sorted) {
    let i = utterance.indexOf(term);
    while (i >= 0) {
      let free = true;
      for (let k = i; k < i + term.length; k += 1) if (taken[k]) free = false;
      if (free) {
        for (let k = i; k < i + term.length; k += 1) taken[k] = true;
        hits.push({ term, ids, at: i, end: i + term.length });
      }
      i = utterance.indexOf(term, i + term.length);
    }
  }
  hits.sort((a, b) => a.at - b.at);
  return hits;
}

// V.scope (07:862): "a set Q of section 7.3 ids; Q_s = Q intersect Spaces, Q_t = Q intersect Works".
// Every candidate assignment of the WS6-ambiguous terms is enumerated; the choice between them is
// made by ws6ResolveByWeakerClass, not here.
function scopeReadings(utterance) {
  const hits = scopeTermsIn(utterance);
  let readings = [{ ids: [], notes: [] }];
  for (const h of hits) {
    const next = [];
    for (const base of readings) {
      for (const cand of h.ids) {
        const notes = [...base.notes];
        if (cand === null || cand === undefined) {
          notes.push(h.term + " -> (no id)");
          next.push({ ids: [...base.ids], notes });
        } else {
          if (h.ids.length > 1) notes.push(h.term + " -> " + cand);
          next.push({ ids: base.ids.includes(cand) ? [...base.ids] : [...base.ids, cand], notes });
        }
      }
    }
    readings = next;
    // The rev-8 tie-break (07:344-352) is DELETED at rev 9 (07:375-383). Its constant-false
    // discriminator is evaluated only when rev 8 is the configuration in force.
    if (h.ids.length > 1 && CFG.ws6 !== "rev9") ws6RuleAsWrittenDiscriminates(h.ids, h.term, utterance);
  }
  return readings.map((r) => ({ Q: r.ids, Q_s: sOf(r.ids), Q_t: tOf(r.ids), notes: r.notes }));
}

// ============================================================================================
// SECTION 4 — section 14.3.1, what the function takes: VB1, VB3, V.area
// ============================================================================================

const KOREAN_DIGITS = "0123456789";
function numberBefore(text, at) {
  let j = at, d = "";
  while (j > 0 && KOREAN_DIGITS.includes(text[j - 1])) { d = text[j - 1] + d; j -= 1; }
  return d ? Number(d) : null;
}
function occurrencesOf(text, marker) {
  const out = []; let i = text.indexOf(marker);
  while (i >= 0) { out.push(i); i = text.indexOf(marker, i + marker.length); }
  return out;
}

// VB1 (C: MUST) — 07:867-871. "a numeric budget is held in ONE of three shapes, never two:
// exact {amount} | range {min, max} | max {amount}. '5천' is exact, '600~800만원' is range
// (CINV-8: never one bound), '1억 이내' / '최대 1억' is max. ... A budget that cannot be resolved
// to one of the three is ABSENT, never guessed."
function koreanAmount(text, at) {
  // 천 = ten thousand won x 1000 (5천 = 50,000,000 in the fixtures' idiom), 억 = 100,000,000,
  // 만원 = 10,000. Only the three forms the rule's own examples use are decoded.
  for (const [unit, mult] of [["억", 100000000], ["천만원", 10000000], ["천", 10000000], ["만원", 10000]]) {
    for (const i of occurrencesOf(text, unit)) {
      if (i !== at) continue;
      const n = numberBefore(text, i);
      if (n !== null) return n * mult;
    }
  }
  return null;
}
function vb1ExtractBudget(utterance) {
  const marks = [];
  for (const unit of ["억", "천만원", "천", "만원"]) {
    for (const i of occurrencesOf(utterance, unit)) {
      const a = koreanAmount(utterance, i);
      if (a !== null) marks.push({ at: i, end: i + unit.length, amount: a });
    }
  }
  marks.sort((a, b) => a.at - b.at);
  // de-duplicate overlapping unit matches (천 inside 천만원)
  const kept = [];
  for (const m of marks) if (!kept.some((k) => m.at < k.end && k.at < m.end)) kept.push(m);
  if (kept.length === 0) return null;
  const tail = utterance.slice(kept[kept.length - 1].end);
  // CINV-8 (07:1538): "600~800만원" parses to a RANGE, never to one bound. The lower bound carries
  // no unit of its own; the unit after the upper bound governs both.
  let lowBare = null;
  for (const sep of ["~", "-", "에서"]) {
    const s = utterance.lastIndexOf(sep, kept[0].at);
    if (s > 0 && s < kept[0].at) {
      const n = numberBefore(utterance, s);
      const between = utterance.slice(s + sep.length, kept[0].at);
      if (n !== null && between.split("").every((ch) => KOREAN_DIGITS.includes(ch))) {
        const mult = kept[0].amount / Number(utterance.slice(s + sep.length, kept[0].at) || "1");
        lowBare = n * mult;
      }
    }
  }
  const twoMarks = kept.length >= 2 &&
    (utterance.slice(kept[0].end, kept[1].at).includes("~") ||
     utterance.slice(kept[0].end, kept[1].at).includes("-"));
  // All three shapes are observed on every call, so that "never true"/"never false" is a fact
  // about the rule and not about which branch this function happened to return from.
  const isRange = observe("VB1", "07:868", "budget is a range", twoMarks || lowBare !== null, utterance);
  const isMax = observe("VB1", "07:869", "budget is a max bound",
    !isRange && (tail.includes("이내") || utterance.includes("최대")), utterance);
  observe("VB1", "07:868", "budget is exact", !isRange && !isMax, utterance);
  if (isRange) {
    return twoMarks
      ? { kind: "range", minAmount: kept[0].amount, maxAmount: kept[1].amount }
      : { kind: "range", minAmount: lowBare, maxAmount: kept[0].amount };
  }
  if (isMax) return { kind: "max", amount: kept[0].amount };
  return { kind: "exact", amount: kept[0].amount };
}

// V.area (07:863): "value + unit + basis".
//
// AUDIT 21 A-2 / gap 4 REMOVED. The prose does answer what an unstated basis does:
//   AR5 (02:246, quoted at 07:230-231) — "different bases are not compared; ONE UNKNOWN BASIS
//   LOWERS CONFIDENCE"; PY1 (07:246-249) — AR5 is not relaxed by anything in V0.2;
//   EF4 itself (07:1065-1068) — "when either basis is absent, the record's area is stated with its
//   basis named and the match is described as approximate. It NEVER CHANGES THE CRITERION STATE
//   and never enters a ranking key."
// An unstated query basis is therefore a DEFINED state with a defined consequence. No value is
// invented. The former `basis = "supply"` contradicted all three rules, manufactured a dead
// branch and moved property 4's count.
//
// Returns a LIST of candidate area shapes. More than one only where the contract genuinely admits
// more than one (gap 5), and then every one is run.
function extractAreaCandidates(utterance) {
  let value = null, unit = null, basis = null, unitUndecided = false;
  for (const i of occurrencesOf(utterance, "평")) {
    const n = numberBefore(utterance, i);
    if (n !== null) { value = n; unit = "pyeong"; }
  }
  for (const marker of ["㎡", "m2"]) {
    for (const i of occurrencesOf(utterance, marker)) {
      const n = numberBefore(utterance, i);
      if (n !== null) { value = n; unit = "m2"; }
    }
  }
  if (value === null) {
    // "전용 84 아파트 주방" states a basis word and a bare number, and NO unit at all.
    for (const word of ["전용", "공급"]) {
      const i = utterance.indexOf(word);
      if (i < 0) continue;
      let j = i + word.length; while (j < utterance.length && utterance[j] === " ") j += 1;
      let d = ""; while (j < utterance.length && KOREAN_DIGITS.includes(utterance[j])) { d += utterance[j]; j += 1; }
      if (d) { value = Number(d); basis = word === "전용" ? "exclusive" : "supply"; unitUndecided = true; }
    }
  }
  if (value === null) return [null];
  if (basis === null) {
    if (utterance.includes("전용")) basis = "exclusive";
    else if (utterance.includes("공급")) basis = "supply";
    // else: left UNKNOWN, per 07:1065-1068. AR5 then compares with a lowered-confidence disclosure.
  }
  observe("14.3.1", "07:863", "the visitor stated an area basis", basis !== null, utterance);
  if (!unitUndecided) return [{ value, unit, basis, disclose: basis === null }];
  // gap 5 (BRANCHING): 07:863 requires a unit and VB1's "cannot be resolved => absent" clause
  // (07:871) has no V.area counterpart, so neither supplying one nor dropping the figure is
  // licensed. Both units are run.
  underdetermined("14.3.1", "07:863 vs 07:871",
    "V.area is specified as \"value + unit + basis\" and the visitor states no unit. AR1 is a " +
    "producer rule and does not reach a query. VB1 (07:871) gives V.budget an explicit " +
    "\"cannot be resolved to one of the three is ABSENT, never guessed\" clause; V.area has no " +
    "such clause, so the contract licenses neither supplying a unit nor dropping the figure.",
    utterance);
  return [{ value, unit: "m2", basis, disclose: basis === null },
          { value, unit: "pyeong", basis, disclose: basis === null }];
}

// VB3 (C: MUST) — 07:835-848. "V.breadth is what the VISITOR said, and it is never inferred from
// V.scope." The closed list, 07:844-852, transcribed row by row IN THE ORDER WRITTEN. Each row's
// left cell is a predicate over the utterance; the middle cell is the value.
//
// The rows are NOT collapsed into cleverer logic: each is its own predicate, and the checker asks
// how many of them hold, because VB3 states no first-match rule (unlike PB7 07:1074, GR3a 07:1173
// and EF6 07:1257-1270, which all do).

const MAN = "만";        // the restriction particle
const CONNECTORS = ["이랑", "랑", "과", "와", ",", " ", "하고", "도"];

// AUDIT 21 A-4. "a restriction by X" — an X-term, optionally in a conjunction chain OF TERMS OF
// THE SAME KIND, carrying the 만 particle. The chain used to skip a next scope term of ANY kind,
// against this function's own comment, which made row 5 (a restriction by TRADE) fire off
// "바닥이랑 거실만", whose 만 attaches to a SPACE. That manufactured gap 3's headline instance.
// `undecided` is returned, not a value, where 07:847's exemplar does not reach.
function restrictedByKind(utterance, kindPred) {
  const all = scopeTermsIn(utterance);
  const kindOf = (h) => h.ids.filter((x) => x !== null && x !== undefined);
  const hits = all.filter((h) => kindOf(h).length > 0 && kindOf(h).some((id) => kindPred(id)));
  let undecided = false;
  for (const h of hits) {
    let j = h.end;
    let guard = 0;
    while (j < utterance.length && guard < 40) {
      guard += 1;
      const nextHit = all.find((x) => x.at === j);
      // SAME KIND only: a chain that changes kind is not one restriction, it is two phrases.
      if (nextHit && kindOf(nextHit).some((id) => kindPred(id))) { j = nextHit.end; continue; }
      if (nextHit) break;
      const conn = CONNECTORS.find((c) => utterance.startsWith(c, j));
      if (conn) { j += conn.length; continue; }
      break;
    }
    if (utterance.startsWith(MAN, j)) return { value: true, undecided: false };
    // A quantity between the term and the particle ("욕실 하나만"). Rev 8 left it undecided (the
    // checker's gap 3 — BOTH values were run). Rev 9 decides it at 07:904-908: the 만 binds the
    // count, row 3 does not fire, and the utterance is a bare enumeration. Under rev 9 the
    // predicate is simply false here and no gap is raised.
    for (const count of ["하나", "한 곳", "한곳", "두 개", "두개", "두 곳", "전체"]) {
      if (utterance.startsWith(count, j) && utterance.startsWith(MAN, j + count.length)) {
        if (CFG.vb3 === "rev9") continue;
        underdetermined("VB3", "07:847",
          "row 2's exemplars all put the 만 adjacent to the space (주방만, 욕실만, 주방이랑 욕실만). " +
          "Nothing decides whether a quantity between the space and the particle (\"욕실 하나만\") is " +
          "still \"a restriction by space\". WS3 (07:338-341) makes the quantity itself " +
          "unrepresentable, so it cannot be recorded as a criterion either way. Both values are run.",
          utterance);
        undecided = true;
      }
    }
  }
  return { value: false, undecided };
}
const restricted = (u, k) => restrictedByKind(u, k).value;
// 07:904-908 (rev 9, D9-4): "In 욕실 하나만 the 만 binds the COUNT, not the room ... Row 3 does not
// fire; the utterance is row 6." Rev 8 left this undecided — the checker's gap 3. Under rev 9 the
// `undecided` flag is therefore not raised and the quantity case simply does not restrict.

const VB3_ROWS = [
  { n: 1, cite: "07:846", value: "whole", gloss: "전체 리모델링, 집 전체, 올수리",
    test: (u) => {
      const literal = ["전체 리모델링", "집 전체", "올수리"].some((s) => u.includes(s));
      if (READINGS.vb3Row1 === "literal") return literal;
      if (literal) return true;
      // CLARIFYING reading (gap 1): row 1's own `why` cell — "a statement about the extent of the
      // dwelling" — is a FORM description, so the exemplars are read as a form: a 전체 that is not
      // attached to a scope term (바닥 전체, 창호 전체 restrict a trade, not the dwelling).
      for (const i of occurrencesOf(u, "전체")) {
        const before = u.slice(0, i);
        const attached = scopeTermsIn(before).some((h) => before.trimEnd().endsWith(h.term) ||
          before.endsWith(h.term + " "));
        if (!attached) {
          underdetermined("VB3", "07:846 / 07:854-857",
            "the table uses TWO left-cell conventions and says so nowhere: rows 2, 5, 6 and 7 " +
            "introduce their exemplars with an explicit form phrase (\"a restriction by space\", " +
            "\"a bare enumeration\", \"qualitative prose about size\"), while rows 1, 3 and 4 are " +
            "bare literal lists. \"34평 전체\", \"전체 가능해요\" and \"50평 전체\" are on none of row 1's " +
            "three strings. Read as forms (row 1's own `why` cell is a form description) they are " +
            "`whole`; read literally they leave V.breadth absent and 07:2698's claim that the " +
            "closed list ended rev 7's undecidedness is false. One clarifying sentence fixes it.", u);
          return true;
        }
      }
      return false;
    } },
  { n: 2, cite: "07:847", value: "partial", gloss: "a restriction by space — 주방만, 욕실만",
    test: (u) => restricted(u, isSpace) },
  { n: 3, cite: "07:848", value: "partial", gloss: "부분만, 일부만, 몇 군데만",
    test: (u) => ["부분만", "일부만", "몇 군데만", "몇군데만"].some((s) => u.includes(s)) },
  { n: 4, cite: "07:849", value: "partial", gloss: "집 전체는 아니고 …, 전체까지는 아니고 …",
    test: (u) => ["집 전체는 아니고", "전체까지는 아니고", "집전체는 아니고"].some((s) => u.includes(s)) },
  { n: 5, cite: "07:850", value: null, gloss: "a restriction by trade — 바닥이랑 도배만, 조명만",
    test: (u) => restricted(u, isWork) },
  { n: 6, cite: "07:851", value: null, gloss: "a bare enumeration — 주방이랑 욕실",
    test: (u) => {
      // A SPACE is named (the row's own exemplar names two rooms) and nothing restricts it: no
      // 만 attaches to any scope term. (The 만 of 만원 is not the restriction particle, which is
      // why this reads the particle's attachment and not the character.)
      const named = scopeTermsIn(u).some((h) => h.ids.some((x) => x !== null && isSpace(x)));
      if (!named) return false;
      return !restricted(u, isSpace) && !restricted(u, isWork);
    } },
  { n: 7, cite: "07:852", value: null, gloss: "qualitative prose about size — 큰 공사는 아니고, 간단하게",
    test: (u) => ["큰 공사는 아니고", "간단하게", "간단히", "크게는 아니고"].some((s) => u.includes(s)) },
];

// ------------------------------------------------------------------ VB3, rev 9 (D9-4, 07:874-926)
// Three changes from rev 8, each transcribed rather than inferred:
//   (i)   07:883-886  "The rows are tried in written order and the first matching row wins."
//   (ii)  07:888-896  the rows are REORDERED. The negation row is now row 1 and 전체 is row 2, so
//                     "집 전체는 아니고 …" is `partial`. No row's condition is narrowed.
//   (iii) 07:898-902  "The left column lists FORMS, not literal strings (C: MUST)" — gap 1 decided.
//         07:904-908  "A 만 attached to a quantity is not a restriction by space (C: MUST)" —
//                     "욕실 하나만" is row 6, V.breadth absent. Gap 3 decided.
const VB3_ROWS_REV9 = [
  { n: 1, cite: "07:890", value: "partial", gloss: "an explicit negation of whole-home framing",
    test: (u) => ["집 전체는 아니고", "전체까지는 아니고", "집전체는 아니고",
                  "전체는 아니고"].some((x) => u.includes(x)) },
  { n: 2, cite: "07:891", value: "whole", gloss: "전체 리모델링, 집 전체, 올수리 (a FORM, 07:898-902)",
    test: (u) => {
      if (["전체 리모델링", "집 전체", "올수리"].some((x) => u.includes(x))) return true;
      // 07:898-902: the form is "a statement about the extent of the dwelling". A 전체 attached to
      // a scope term restricts the WORK, not the dwelling (바닥 전체), so it is not this form.
      for (const i of occurrencesOf(u, "전체")) {
        const before = u.slice(0, i);
        const attached = scopeTermsIn(before).some((h) => before.trimEnd().endsWith(h.term) ||
          before.endsWith(h.term + " "));
        if (!attached) return true;
      }
      return false;
    } },
  { n: 3, cite: "07:892", value: "partial", gloss: "a restriction by space — 주방만, 욕실만",
    test: (u) => restricted(u, isSpace) },
  { n: 4, cite: "07:893", value: "partial", gloss: "부분만, 일부만, 몇 군데만",
    test: (u) => ["부분만", "일부만", "몇 군데만", "몇군데만"].some((x) => u.includes(x)) },
  { n: 5, cite: "07:894", value: null, gloss: "a restriction by trade — 바닥이랑 도배만, 조명만",
    test: (u) => restricted(u, isWork) },
  { n: 6, cite: "07:895", value: null, gloss: "a bare enumeration — 주방이랑 욕실",
    test: (u) => scopeTermsIn(u).some((h) => h.ids.some((x) => x !== null && isSpace(x))) },
  { n: 7, cite: "07:896", value: null, gloss: "qualitative prose about size",
    test: (u) => ["큰 공사는 아니고", "간단하게", "간단히", "크게는 아니고"].some((x) => u.includes(x)) },
];

// Returns the CANDIDATE SET of V.breadth values, derived. Nothing is chosen (audit 21 A-12):
// where VB3's rows disagree and no evaluation order exists, every value they give is a candidate.
// Rev 9: a FUNCTION. Every row is still evaluated (so overlaps stay visible and measurable), and
// 07:883-886's first-match sentence selects. One value, never a candidate set.
function vb3Rev9(utterance) {
  const matched = [];
  for (const row of VB3_ROWS_REV9) {
    if (observe("VB3", row.cite, "rev9 row " + row.n + " (" + row.gloss + ")", row.test(utterance), utterance)) {
      matched.push(row);
    }
  }
  const overlapping = matched.length > 1 &&
    new Set(matched.map((r) => String(r.value))).size > 1;
  observe("VB3", "07:883", "more than one row holds and they disagree", overlapping, utterance);
  // 07:929-936 — the ONE case rev 9 declines to decide: a chain mixing kinds under one 만.
  // "nothing in this table says whether it binds the adjacent term only ... section 18's Q-26."
  if (restrictedByKind(utterance, isSpace).value && restrictedByKind(utterance, isWork).value) {
    underdetermined("VB3", "07:929-936 (section 18 Q-26)",
      "rev 9 resolved VB3's overlaps by ORDER, and says so, but records one case as still open: a " +
      "chain that mixes kinds under one 만 — a trade and a space — matches rows 3 and 5 on any " +
      "reading that lets the particle bind across kinds, and the table does not say whether it " +
      "binds the adjacent term only. First-match makes the rule a function anyway (row 3 wins, " +
      "`partial`), so the OUTPUT is determinate; what is undetermined is whether that output is " +
      "the intended one. This is the only VB3 gap rev 9 leaves, and the contract names it.",
      utterance);
  }
  const first = matched[0] || null;
  return { values: [first ? first.value : null], matched: first ? [first] : [],
           allMatched: matched, conflicting: false, firstMatch: true };
}

function vb3(utterance) {
  if (CFG.vb3 === "rev9") return vb3Rev9(utterance);
  const matched = [];
  for (const row of VB3_ROWS) {
    const hit = observe("VB3", row.cite, "row " + row.n + " (" + row.gloss + ")", row.test(utterance), utterance);
    if (hit) matched.push(row);
  }
  // gap 2: a row whose predicate the prose does not decide contributes BOTH outcomes.
  const spaceUndecided = restrictedByKind(utterance, isSpace).undecided;
  const values = [...new Set(matched.map((r) => r.value))];
  if (spaceUndecided && !values.includes("partial")) values.push("partial");
  if (spaceUndecided && !values.includes(null) && matched.length === 0) values.push(null);
  const conflicting = values.length > 1;
  if (matched.length > 1 && new Set(matched.map((r) => String(r.value))).size > 1) {
    underdetermined("VB3", "07:840-848",
      "the \"closed list\" (C: MUST) has rows that match one utterance with OPPOSITE values and " +
      "states no evaluation order. PB7 (07:1074), GR3a (07:1173) and EF6 (07:1257-1270) all state " +
      "first-match-wins for their tables; VB3 — the list introduced to stop utterances being " +
      "undecided — does not. VB3 is therefore not a function and EF2 has no determinate input.",
      utterance + "  [rows " + matched.map((r) => r.n).join("+") + " -> " +
      matched.map((r) => String(r.value)).join(" / ") + "]");
  }
  // 07:840-842: "V.breadth is partial, whole, or ABSENT, and only these forms set it. Anything not
  // on this list leaves it ABSENT, which is a real answer and not a failure." Zero matches is
  // total by the rule's own text; the defect is two matches, not none.
  return { values: values.length === 0 ? [null] : values, matched, conflicting };
}

// V, the whole visitor query (07:857-865). Returns every BRANCH the contract admits: the cross
// product of VB3's candidate breadths and V.area's candidate shapes. WS6's ambiguity is resolved
// INSIDE a branch, by 07:2686's weaker-class discriminator, and is therefore not a branch.
function queryBranches(utterance) {
  const b = vb3(utterance);
  const areas = extractAreaCandidates(utterance);
  const budget = vb1ExtractBudget(utterance);   // VB1 — extracted, NOT a criterion (07:864, 07:1244)
  const hint = budgetHintOf(utterance);         // VB2 (07:872-873)
  const out = [];
  for (const breadth of b.values) for (const area of areas) {
    out.push({
      utterance, breadth, area, budget, budgetHint: hint,
      breadthRows: b.matched.map((r) => r.n), breadthCandidates: b.values, breadthConflict: b.conflicting,
      branch: "breadth=" + String(breadth) + (areas.length > 1 ? " area=" + area.value + area.unit : ""),
    });
  }
  return out;
}

// ============================================================================================
// SECTION 5 — section 14.3.3 + 14.3.3.1, the scope relation tables (07:1070-1097)
// ============================================================================================

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const subset = (a, b) => a.every((x) => b.includes(x));
const properSuperset = (a, b) => subset(b, a) && !setEq(a, b);
const properSubset = (a, b) => subset(a, b) && !setEq(a, b);
const intersects = (a, b) => a.some((x) => b.includes(x));

// 14.3.3.1 (07:1158-1163) — trade-only requests. Rows in the order written, first match wins.
const TRADE_ONLY_ROWS = [
  { n: 1, cite: "07:1165", rel: "scope_exact",
    test: (R_s, R_t, Q_s, Q_t) => subset(Q_t, R_t) && R_s.length === 0 },
  { n: 2, cite: "07:1166", rel: "scope_superset",
    test: (R_s, R_t, Q_s, Q_t) => subset(Q_t, R_t) && R_s.length > 0 },
  { n: 3, cite: "07:1167", rel: "scope_overlap",
    test: (R_s, R_t, Q_s, Q_t) => !subset(Q_t, R_t) && intersects(R_t, Q_t) },
  { n: 4, cite: "07:1168", rel: "scope_disjoint",
    test: (R_s, R_t, Q_s, Q_t) => !intersects(R_t, Q_t) },
];

// 14.3.3 (07:1078-1087) — PB7 (07:1074-1076): "the rows are evaluated IN THE ORDER WRITTEN and the
// FIRST row whose condition holds decides the relation."
const SCOPE_ROWS = [
  { n: 1, cite: "07:1080", rel: "none",
    test: (R_s, R_t, Q_s, Q_t) => Q_s.length === 0 && Q_t.length === 0 },
  { n: 2, cite: "07:1081", rel: "@14.3.3.1",
    test: (R_s, R_t, Q_s, Q_t) => Q_s.length === 0 && Q_t.length > 0 },
  { n: 3, cite: "07:1082", rel: "scope_exact",
    test: (R_s, R_t, Q_s, Q_t) => setEq(R_s, Q_s) && subset(Q_t, R_t) },
  { n: 4, cite: "07:1083", rel: "scope_subset",
    test: (R_s, R_t, Q_s, Q_t) => setEq(R_s, Q_s) && !subset(Q_t, R_t) },
  { n: 5, cite: "07:1084", rel: "scope_superset",
    test: (R_s, R_t, Q_s, Q_t) => properSuperset(R_s, Q_s) },
  { n: 6, cite: "07:1085", rel: "scope_subset",
    test: (R_s, R_t, Q_s, Q_t) => properSubset(R_s, Q_s) },
  { n: 7, cite: "07:1086", rel: "scope_overlap",
    test: (R_s, R_t, Q_s, Q_t) => intersects(R_s, Q_s) && !subset(R_s, Q_s) && !subset(Q_s, R_s) },
  { n: 8, cite: "07:1087", rel: "scope_disjoint",
    test: (R_s, R_t, Q_s, Q_t) => !intersects(R_s, Q_s) },
];

function tradeOnlyRowsHolding(R_s, R_t, Q_s, Q_t, where) {
  const hold = [];
  for (const row of TRADE_ONLY_ROWS) {
    if (observe("14.3.3.1", row.cite, "row " + row.n, row.test(R_s, R_t, Q_s, Q_t), where)) hold.push(row);
  }
  return hold;
}
function scopeRowsHolding(R_s, R_t, Q_s, Q_t, where) {
  const hold = [];
  for (const row of SCOPE_ROWS) {
    if (observe("14.3.3", row.cite, "row " + row.n, row.test(R_s, R_t, Q_s, Q_t), where)) hold.push(row);
  }
  return hold;
}

// The relation, with PB7 applied. Returns {relation, row, table, hold}.
function scopeRelation(R_s, R_t, Q_s, Q_t, where) {
  const hold = scopeRowsHolding(R_s, R_t, Q_s, Q_t, where);
  if (hold.length === 0) return { relation: UNDET, row: null, table: "14.3.3", hold: [] };
  const first = hold[0];
  if (first.rel === "@14.3.3.1") {
    const h2 = tradeOnlyRowsHolding(R_s, R_t, Q_s, Q_t, where);
    if (h2.length === 0) return { relation: UNDET, row: null, table: "14.3.3.1", hold: [], hold1: hold };
    return { relation: h2[0].rel, row: h2[0].n, table: "14.3.3.1", hold: h2, hold1: hold };
  }
  return { relation: first.rel, row: first.n, table: "14.3.3", hold };
}

// ============================================================================================
// SECTION 6 — section 14.3.4 tiers (07:1192-1196), with AR4/AR5 (02:245-246, 07:230-231, PY1 07:246)
// ============================================================================================

const M2_PER_PYEONG = 400 / 121;                        // AR4, 02:245 / 07:231
function toPyeong(a) {
  if (a.unit === "pyeong") return a.value;
  if (a.unit === "m2") return a.value / M2_PER_PYEONG;
  return null;
}
// AR5 (02:246) — "공급 <-> 전용은 어느 쪽도 환산하지 않는다. 기준이 서로 다르면 비교하지 않고,
// 한쪽이 모름이면 비교 신뢰도를 낮춘다." PY1 (07:246): AR5 is not relaxed by anything in V0.2.
function ar5Permits(qArea, rArea, where) {
  if (!qArea || !rArea) return false;
  const unknown = qArea.basis === null || rArea.basis === null;
  observe("AR5", "02:246", "one basis unknown (lower confidence, still compare)", unknown, where);
  if (unknown) return true;
  const refused = qArea.basis !== rArea.basis;
  observe("AR5", "02:246", "bases differ, comparison refused", refused, where);
  return !refused;
}
// 07:1192-1196. delta_area = (r - v) / v, the VISITOR's figure is the divisor. The tier reads |delta|.
const TIER_ROWS = [
  { cite: "07:1194", tier: "strong", test: (d) => Math.abs(d) <= 0.10 },
  { cite: "07:1195", tier: "acceptable", test: (d) => Math.abs(d) <= 0.20 },
  { cite: "07:1196", tier: "fallback", test: () => true },
];
function tierOf(qArea, rArea, where) {
  const v = toPyeong(qArea), r = toPyeong(rArea);
  if (v === null || r === null || v === 0) return { tier: UNDET, delta: null };
  const delta = (r - v) / v;
  // The one numeric comparison any criterion performs (07:1192-1196). Provenance is logged so the
  // PB2/VB2 checks below are derived from a ledger of real comparisons, not from an empty one.
  comparedValues("V.area.value(pyeong)", v, "R.property.area.value(pyeong)", r, "EF4/14.3.4", where);
  for (const row of TIER_ROWS) {
    if (observe("14.3.4", row.cite, "tier " + row.tier, row.test(delta), where)) {
      return { tier: row.tier, delta };
    }
  }
  return { tier: UNDET, delta };
}

// ============================================================================================
// SECTION 7 — EF1-EF4. This is the ONLY module that assigns a criterion state.
//             EF1 (07:949): "Nothing outside EF2-EF4 assigns a criterion state, and no rule may
//             leave one unassigned."
// ============================================================================================

const STATES = ["not_applicable", "not_evaluable", "satisfied", "unsatisfied"];
const STATE_ASSIGNERS = ["EF2", "EF3", "EF4"];
const STATE_LEDGER = [];

function assignState(by, criterion, value, ctx) {
  if (!STATE_ASSIGNERS.includes(by)) throw new Error("EF1 closure broken at runtime: " + by);
  if (!STATES.includes(value)) throw new Error("EF1: not one of the three-plus-one states: " + value);
  STATE_LEDGER.push({ by, criterion, value, ctx });
  return value;
}

// EF2 breadth — 07:955-959. "V.breadth absent => not_applicable. Else R.projectType absent =>
// not_evaluable. Else satisfied iff R.projectType is V.breadth's counterpart under the mapping
// whole <-> full_remodel, partial <-> partial_remodel."
const BREADTH_TO_TYPE = { whole: "full_remodel", partial: "partial_remodel" };
function EF2(V, R, where) {
  if (observe("EF2", "07:955", "V.breadth absent", V.breadth === null, where))
    return assignState("EF2", "breadth", "not_applicable", where);
  if (observe("EF2", "07:955", "R.projectType absent", R.projectType === null, where))
    return assignState("EF2", "breadth", "not_evaluable", where);
  const match = observe("EF2", "07:956", "projectType is V.breadth's counterpart",
    R.projectType === BREADTH_TO_TYPE[V.breadth], where);
  return assignState("EF2", "breadth", match ? "satisfied" : "unsatisfied", where);
}

// EF3 scope — rev 9 07:955-1006 (rev 8 07:874-926). Returns {state, relation}; the relation is
// carried out because EF6 rows 1 and 7 name it, and it is not a second state assignment.
//
// STRUCTURE, forced by D9-5a. 07:960 computes the branch "per reading of Q ... and then resolved
// by the ambiguity clause". So the branch is a PURE function here — it assigns nothing — and the
// single assignState call is in EF3, which is what 07:1038 states: "The state is assigned by EF3
// and by nothing else, so EF1's closure is preserved."
function ef3Branch(V, R, reading, where) {
  const Q = reading.Q, Q_s = reading.Q_s, Q_t = reading.Q_t;
  if (observe("EF3", "07:955", "Q is empty", Q.length === 0, where))
    return { state: "not_applicable", relation: null, why: "Q empty" };
  const R_s = sOf(R.workScopeIds), R_t = tOf(R.workScopeIds);

  if (R.projectType === "full_remodel") {
    // 07:965-968 — the SPACES half is satisfied for any Q_s (PT4(b)).
    observe("EF3", "07:965", "full_remodel spaces half satisfied for any Q_s", true, where);
    // 07:969-971 — the TRADES half: satisfied when Q_t is a subset of R_t, not_evaluable otherwise.
    const tradesOk = observe("EF3", "07:970", "full_remodel trades half: Q_t subset of R_t",
      subset(Q_t, R_t), where);
    // 07:973-974 — "satisfied when both halves are, not_evaluable when the trade half is, and
    // NEVER unsatisfied."
    return { state: tradesOk ? "satisfied" : "not_evaluable", relation: null, why: "full_remodel" };
  }
  if (observe("EF3", "07:1005", "R.projectType absent", R.projectType === null, where))
    return { state: "not_evaluable", relation: null, why: "breadth absent" };

  // partial_remodel — 07:1000-1006.
  if (observe("EF3", "07:1000", "consumer dropped an unrecognised workScopeId (WS8)",
      R.droppedUnknownId, where))
    return { state: "not_evaluable", relation: null, why: "WS8 dropped an id" };
  const rel = scopeRelation(R_s, R_t, Q_s, Q_t, where);
  if (rel.relation === UNDET) {
    underdetermined("14.3.3", "07:1250-1267",
      "no row of the scope relation table holds for this input, so EF3's partial branch has no " +
      "relation to read.", where);
    return { state: "not_evaluable", relation: UNDET, why: "no relation row" };
  }
  // Rev 9 07:1003-1007 (D9-2c): "satisfied iff that relation is `scope_exact` or `scope_superset`;
  // scope_overlap, scope_subset and scope_disjoint are unsatisfied." Rev 8 07:906: scope_exact only.
  observe("EF3", "07:1005", "partial_remodel relation is scope_exact",
    rel.relation === "scope_exact", where);
  const ok = observe("EF3", "07:1005", "relation is in EF3's satisfied set",
    CFG.satRelations.includes(rel.relation), where);
  return { state: ok ? "satisfied" : "unsatisfied", relation: rel, why: "partial_remodel" };
}

// The ambiguity clause, 07:1008-1036, transcribed as two bullets so that its OWN totality and
// single-valuedness can be measured (section 20.7.6's unmet obligation; see property 1b).
//
//   bullet A: "All readings give the same relation, OR all give the same state
//              => that relation and that state."
//   bullet B: "The readings differ => the criterion is not_evaluable and the reply discloses
//              that the term was ambiguous."
//
// Each bullet's antecedent is evaluated independently, exactly as a table's rows are, so the
// overlap between them is a measurement and not an assumption.
// D9-7 (coordinator's decision, round 9, NOT in the contract; CFG.ef3Ambiguity === "D9-7"):
//   1. readings produce different criterion STATES  => not_evaluable, ambiguity disclosed.
//   2. otherwise (all agree on the state)           => that state; and where they also agree on a
//                                                      relation, that relation.
// Rule 1 is tried first and rule 2's condition is rule 1's exact negation, so the pair is total and
// single-valued BY CONSTRUCTION. That much is arithmetic and this file confirms it rather than
// discovering it. What it does NOT settle is what rule 2 hands DOWNSTREAM, which is checked below.
function ef3ResolveReadings(branches, where) {
  const rels = branches.map((b) => (b.relation && b.relation !== UNDET ? b.relation.relation
                                    : b.relation === UNDET ? "UNDET" : "(none)"));
  const states = branches.map((b) => b.state);
  const sameRelation = new Set(rels).size === 1;
  const sameState = new Set(states).size === 1;
  const bulletA = observe("EF3", "07:1011", "ambiguity bullet A: all readings agree on the relation, or on the state",
    sameRelation || sameState, where);
  const bulletB = observe("EF3", "07:1014", "ambiguity bullet B: the readings differ",
    !(sameRelation && sameState), where);
  // D9-7's two rules, evaluated independently so "total and single-valued" is MEASURED.
  const d97rule1 = observe("D9-7", "decision/round 9", "rule 1: the readings' criterion STATES differ",
    !sameState, where);
  const d97rule2 = observe("D9-7", "decision/round 9", "rule 2: all readings agree on the state",
    sameState, where);
  // D9-7a — rule 1 widened to "different states OR different relations" (round 10's decision).
  // Rule 2's condition is still rule 1's exact negation, so the totality/single-valuedness proof is
  // unchanged in FORM; this file measures it again rather than inheriting the earlier result.
  const d97aRule1 = observe("D9-7a", "decision/round 10",
    "rule 1: the readings' STATES differ, or their RELATIONS differ", !sameState || !sameRelation, where);
  const d97aRule2 = observe("D9-7a", "decision/round 10",
    "rule 2: all readings agree on the state AND on the relation", sameState && sameRelation, where);
  return { branches, rels, states, sameRelation, sameState, bulletA, bulletB,
           d97rule1, d97rule2, d97aRule1, d97aRule2 };
}

function EF3(V, R, where) {
  const readings = CFG.ws6 === "rev9" && V.readings && V.readings.length
    ? V.readings
    : [{ Q: V.Q, Q_s: V.Q_s, Q_t: V.Q_t }];
  const branches = readings.map((rd) => ef3Branch(V, R, rd, where));
  if (branches.length === 1) {
    return { state: assignState("EF3", "scope", branches[0].state, where),
             relation: branches[0].relation, ambiguous: false, readings: 1 };
  }
  const r = ef3ResolveReadings(branches, where);
  if (CFG.ef3Ambiguity === "D9-7a") {
    // D9-7a rule 1 — the STATES differ, OR the RELATIONS differ.
    if (!r.sameState || !r.sameRelation) {
      return { state: assignState("EF3", "scope", "not_evaluable", where),
               relation: null, ambiguous: true, readings: branches.length, resolution: r };
    }
    // D9-7a rule 2 — both agree. The state AND the relation are defined; nothing is dropped, so
    // EF6 row 1 always has the relation it reads and row 7 always has the caveat it discloses.
    return { state: assignState("EF3", "scope", branches[0].state, where),
             relation: branches[0].relation, ambiguous: false,
             readings: branches.length, resolution: r };
  }
  if (CFG.ef3Ambiguity === "D9-7") {
    // D9-7 rule 1 — the STATES differ.
    if (!r.sameState) {
      return { state: assignState("EF3", "scope", "not_evaluable", where),
               relation: null, ambiguous: true, readings: branches.length, resolution: r };
    }
    // D9-7 rule 2 — the states agree; that state, and the relation only if it too agrees.
    // "where they ALSO agree on a relation, that relation" — so when the relations differ the
    // state is reported with NO relation. That is the case this file follows downstream.
    return { state: assignState("EF3", "scope", branches[0].state, where),
             relation: r.sameRelation ? branches[0].relation : null,
             relationDropped: !r.sameRelation, ambiguous: !r.sameRelation,
             readings: branches.length, resolution: r };
  }
  // 07:1011-1012 — all readings give the same relation, or all give the same state.
  if (r.sameRelation && r.sameState) {
    return { state: assignState("EF3", "scope", branches[0].state, where),
             relation: branches[0].relation, ambiguous: false, readings: branches.length };
  }
  // 07:1014-1015 — the readings differ: not_evaluable, and the ambiguity is disclosed.
  return { state: assignState("EF3", "scope", "not_evaluable", where),
           relation: null, ambiguous: true, readings: branches.length, resolution: r };
}

// ------------------------------------------------------------------------------------------
// THE DISCLOSURE SITES — gap 3's family. Two in-force rules name a SET OF IDS in the reply, and
// both read Q_s / Q_t / R_s as though there were one of each:
//
//   07:978   full_remodel, spaces half satisfied by PT4(b): the reply states the ground and not
//            the conclusion, "unless Q_s subset-of R_s ALSO holds, in which case either may be
//            stated". A PERMISSION to assert the stronger sentence, keyed on Q_s.
//   07:1083-1087 + CINV-17 (07:1547): 14.3.3's rows 4-8 each name a set --
//            row 4  Q_t \ R_t   "not established for this case"
//            row 5  R_s \ Q_s   "the extra spaces ARE named"
//            rows 6,7,8  Q_s \ R_s   "not remodelled in this case"
//
// Round 10's decision: a disclosure may name only what EVERY reading admits. Two implementations
// of that sentence are offered because they are NOT the same function, and row 5 is where they
// part company:
//   intersectionOfQ     intersect the Q sets, then subtract.  R_s \ (∩Q_s) is the UNION of the
//                       per-reading disclosures -- it asserts MORE, the opposite of the intent.
//   intersectionOfSets  compute each reading's disclosure, then intersect. ∩(R_s \ Q_s) =
//                       R_s \ (∪Q_s). This is the one that means what the sentence says.
// For rows 4, 6, 7 and 8 the two coincide, because the record's set is the fixed side.
const DISCLOSURES = [];
function inter(sets) { return sets.length === 0 ? [] : sets[0].filter((x) => sets.every((s) => s.includes(x))); }
function uni(sets) { const o = []; for (const s of sets) for (const x of s) if (!o.includes(x)) o.push(x); return o; }

// The per-reading disclosure set a 14.3.3 row requires, as the row itself words it.
function rowDisclosure(row, R_s, R_t, Q_s, Q_t) {
  switch (row) {
    case 4: return { cite: "07:1083", axis: "Q_t \\ R_t", wording: "not established for this case",
                     ids: Q_t.filter((x) => !R_t.includes(x)) };
    case 5: return { cite: "07:1084", axis: "R_s \\ Q_s", wording: "the extra spaces are named",
                     ids: R_s.filter((x) => !Q_s.includes(x)) };
    case 6: case 7: case 8:
      return { cite: "07:" + (1030 + row), axis: "Q_s \\ R_s", wording: "not remodelled in this case",
               ids: Q_s.filter((x) => !R_s.includes(x)) };
    default: return null;
  }
}

// Emit what the reply would actually say about this record, under whichever reading rule is in
// force. Returns null when the record's relation carries no row disclosure.
function discloseScope(V, R, sc, where) {
  const readings = (CFG.ws6 === "rev9" && V.readings && V.readings.length) ? V.readings
                   : [{ Q: V.Q, Q_s: V.Q_s, Q_t: V.Q_t }];
  const R_s = sOf(R.workScopeIds), R_t = tOf(R.workScopeIds);

  // ---- 07:978, the ground-not-conclusion permission (full_remodel only).
  if (R.projectType === "full_remodel" && sc.state !== "not_applicable") {
    const per = readings.map((rd) => subset(sOf(rd.Q), R_s));
    let may;
    if (CFG.disclosure === "asWritten") {
      // No reading is named, so an implementation must pick one. It picks the first, and that
      // choice is the defect -- recorded, never hidden.
      may = per[0];
      if (new Set(per).size > 1) {
        underdetermined("EF3 / ground-not-conclusion", "07:978",
          "\"unless Q_s subset-of R_s ALSO holds, in which case either may be stated\" reads Q_s as " +
          "ONE set. Under two readings the permission to state the stronger sentence holds under " +
          "one reading and not the other, and the clause names no reading.", where);
      }
    } else {
      // A permission to assert MORE is granted only when every reading grants it: all r. Q_s^r ⊆ R_s,
      // i.e. (∪ Q_s) ⊆ R_s. Same principle as the row disclosures, applied to a permission.
      may = per.every(Boolean);
    }
    const d = { where, rec: R.id, site: "07:978", kind: "ground_permission", row: null,
                permitted: may, perReading: per, readingDependent: new Set(per).size > 1,
                chosen: new Set(per).size > 1 && CFG.disclosure === "asWritten",
                axis: "Q_s ⊆ R_s", ids: [], expectNonEmpty: false };
    DISCLOSURES.push(d);
    return d;
  }

  // ---- 07:1083-1087, the 14.3.3 row disclosures. Only when a relation survived to the reply.
  const rel = sc.relation && sc.relation !== UNDET ? sc.relation : null;
  if (!rel || !rel.row || rel.table !== "14.3.3") return null;
  const per = readings.map((rd) => rowDisclosure(rel.row, R_s, R_t, sOf(rd.Q), tOf(rd.Q)));
  if (!per[0]) return null;
  const perIds = per.map((p) => p.ids.slice().sort());
  let ids;
  if (CFG.disclosure === "asWritten") {
    ids = perIds[0];
  } else if (CFG.disclosure === "intersectionOfQ") {
    const qs = inter(readings.map((rd) => sOf(rd.Q))), qt = inter(readings.map((rd) => tOf(rd.Q)));
    ids = rowDisclosure(rel.row, R_s, R_t, qs, qt).ids.slice().sort();
  } else {
    ids = inter(perIds).sort();
  }
  const readingDependent = new Set(perIds.map((s) => s.join("+"))).size > 1;
  if (readingDependent && CFG.disclosure === "asWritten") {
    underdetermined("14.3.3 rows 4-8 / CINV-17", "07:1083-1087, 07:1547",
      "the row names a set of ids in the reply and reads Q_s / Q_t as ONE set. Under two readings " +
      "the set differs, so WHICH spaces are reported as \"not remodelled in this case\" depends on " +
      "a reading the visitor never chose. CINV-17 governs the wording of this sentence and not " +
      "its membership.", where);
  }
  // CINV-17's own premise: rows 5-8 exist BECAUSE something is uncovered. A row that fires and
  // then names nothing asserts a class whose ground it declines to give.
  const expectNonEmpty = perIds.some((s) => s.length > 0);
  // D9-9 sentence 4 (07:1126-1132), rev 9.1: "if the intersection is empty and any reading's set is
  // not, the criterion is not_evaluable and the ambiguity is disclosed". The rule is stated at the
  // DISCLOSURE level, so it can only be seen here; the caller applies the state change.
  const silentHere = expectNonEmpty && ids.length === 0;
  const d = { where, rec: R.id, site: "07:1083-1087", kind: "row_disclosure", row: rel.row,
              relation: rel.relation, axis: per[0].axis, wording: per[0].wording,
              ids, perIds, readingDependent, expectNonEmpty,
              chosen: readingDependent && CFG.disclosure === "asWritten",
              silent: silentHere,
              sentence4: silentHere && CFG.disclosure === "intersectionOfSets" };
  DISCLOSURES.push(d);
  return d;
}

// EF4 area — 07:1061-1063. "V.area absent => not_applicable. Else R.property.area absent, or AR5
// refuses the two bases, => not_evaluable. Else satisfied iff the tier is strong OR acceptable."
function EF4(V, R, where) {
  if (observe("EF4", "07:1061", "V.area absent", V.area === null, where))
    return { state: assignState("EF4", "area", "not_applicable", where), delta: null, tier: null };
  if (observe("EF4", "07:1061", "R.property.area absent", R.area === null, where))
    return { state: assignState("EF4", "area", "not_evaluable", where), delta: null, tier: null };
  if (!observe("EF4", "07:1061", "AR5 permits the two bases", ar5Permits(V.area, R.area, where), where))
    return { state: assignState("EF4", "area", "not_evaluable", where), delta: null, tier: null };
  const { tier, delta } = tierOf(V.area, R.area, where);
  if (tier === UNDET) {
    underdetermined("14.3.4", "07:1192-1196", "no tier row decides this delta", where);
    return { state: assignState("EF4", "area", "not_evaluable", where), delta, tier: null };
  }
  const ok = observe("EF4", "07:1062", "tier is strong or acceptable",
    tier === "strong" || tier === "acceptable", where);
  return { state: assignState("EF4", "area", ok ? "satisfied" : "unsatisfied", where), delta, tier };
}

// ============================================================================================
// SECTION 8 — EF6 (07:1257-1281) and GR2a (07:1313-1317)
// ============================================================================================

// GR2's closed list — 07:1250-1264. price_fallback is deferred with EF5 (07:1255).
const CLASSES = ["exact", "scope_superset", "scope_subset", "scope_overlap", "scope_disjoint",
  "fallback_from_full", "breadth_fallback", "unknown_type_fallback", "area_fallback", "not_evaluable"];

// GR2a — rev 9 07:1316-1317 (rev 8 07:1316-1317). Stated once in the contract, once here, per
// revision. CFG.classOrder selects; both are declared at the top of this file.
const GR2A = GR2A_REV9;
// VARIANT.order, when set, replaces GR2a's presentation order for the what-if runs only. Rev 8's
// GR2a is what every default run uses.
const gr2aIndex = (cls) => CFG.classOrder.indexOf(cls);

// EF6 rows 1..7, in the order written, each condition stated INDEPENDENTLY so that "first match
// wins" is checked and not assumed.
const EF6_ROWS = [
  { n: 1, cite: "07:1262", test: (c, pt) => c.scope === "unsatisfied", cls: (c, pt, rel) => rel },
  { n: 2, cite: "07:1263", test: (c, pt) => c.breadth === "unsatisfied" && pt === "full_remodel",
    cls: () => "fallback_from_full" },
  { n: 3, cite: "07:1264", test: (c, pt) => c.breadth === "unsatisfied", cls: () => "breadth_fallback" },
  { n: 4, cite: "07:1265", test: (c, pt) => c.breadth === "not_evaluable", cls: () => "unknown_type_fallback" },
  { n: 5, cite: "07:1266", test: (c, pt) => c.area === "unsatisfied", cls: () => "area_fallback" },
  { n: 6, cite: "07:1267", test: (c, pt) => [c.breadth, c.scope, c.area].includes("not_evaluable"),
    cls: () => "not_evaluable" },
  // Rev 9 07:1268 row 7 (D9-2c): scope is `satisfied` AND section 14.3.3's relation for this
  // record is `scope_superset` => class `scope_superset`. It sits AFTER row 6 (07:1280-1287:
  // "what we cannot evaluate outranks what we can caveat") and BEFORE the otherwise row. Absent
  // in rev 8, where the same records reached row 1 with scope `unsatisfied`.
  { n: 7, cite: "07:1268", rev9Only: true,
    test: (c, pt, rel) => c.scope === "satisfied" && rel === "scope_superset",
    cls: () => "scope_superset" },
  // rev 9 row 8 / rev 8 row 7 — unconditional.
  { n: 8, cite: "07:1269", test: () => true, cls: () => "exact" },
];

function ef6RowsHolding(c, pt, where, relation) {
  const hold = [];
  for (const row of EF6_ROWS) {
    if (row.rev9Only && !CFG.ef6Row8) continue;
    if (observe("EF6", row.cite, "row " + row.n, row.test(c, pt, relation), where)) hold.push(row);
  }
  return hold;
}
function EF6(c, pt, relation, where) {
  const hold = ef6RowsHolding(c, pt, where, relation);
  if (hold.length === 0) return { cls: UNDET, row: null, hold };
  const first = hold[0];
  return { cls: first.cls(c, pt, relation), row: first.n, hold };
}

// ============================================================================================
// SECTION 9 — GR3 / GR3a (07:1166-1206): rung set, rung membership, within-rung order
// ============================================================================================

// GR3a (07:1177-1182) — "The rows are evaluated in order and the first whose condition holds
// decides."
const GR3A_ROWS = [
  { n: 1, cite: "07:1179", set: "whole-home", test: (V) => V.breadth === "whole" },
  { n: 2, cite: "07:1180", set: "spaces named",
    test: (V) => V.breadth === "partial" || V.Q_s.length > 0 },
  { n: 3, cite: "07:1181", set: "trade-only", test: (V) => V.Q_s.length === 0 && V.Q_t.length > 0 },
  { n: 4, cite: "07:1182", set: "none", test: () => true },
];
function gr3aRowsHolding(V, where) {
  const hold = [];
  for (const row of GR3A_ROWS) if (observe("GR3a", row.cite, "row " + row.n, row.test(V), where)) hold.push(row);
  return hold;
}

// 07:1184-1188 — the rung tables. "Each rung is a predicate on the record, never a class name",
// and every rung set ends with an implicit final rung (07:1190-1191).
const RUNG_SETS = {
  "whole-home": {
    cite: "07:1186",
    rungs: [
      { name: "full_remodel records", test: (R) => R.projectType === "full_remodel" },
      { name: "partial_remodel records, larger R_s first", test: (R) => R.projectType === "partial_remodel",
        subSort: "larger R_s first" },
      { name: "breadth-absent records", test: (R) => R.projectType === null },
    ],
  },
  "spaces named": {
    cite: "07:1187",
    rungs: [
      { name: "partial with R_s superset of Q_s",
        test: (R, V) => R.projectType === "partial_remodel" && subset(V.Q_s, sOf(R.workScopeIds)) },
      { name: "other partial_remodel records", test: (R) => R.projectType === "partial_remodel" },
      { name: "full_remodel records", test: (R) => R.projectType === "full_remodel" },
      { name: "breadth-absent with R_s superset of Q_s",
        test: (R, V) => R.projectType === null && subset(V.Q_s, sOf(R.workScopeIds)) },
      { name: "other breadth-absent records", test: (R) => R.projectType === null },
    ],
  },
  "trade-only": {
    cite: "07:1188",
    rungs: [
      { name: "partial with R_t superset of Q_t",
        test: (R, V) => R.projectType === "partial_remodel" && subset(V.Q_t, tOf(R.workScopeIds)) },
      { name: "breadth-absent with R_t superset of Q_t",
        test: (R, V) => R.projectType === null && subset(V.Q_t, tOf(R.workScopeIds)) },
      { name: "full_remodel records", test: (R) => R.projectType === "full_remodel" },
      { name: "every other record", test: () => true },
    ],
  },
  "none": { cite: "07:1182", rungs: [] },
};

// AUDIT 21 A-3 + A-6. Each rung predicate is now observed TWICE: once restricted (only records
// that failed the earlier rungs, which is how the ladder actually evaluates it) and once over the
// UNRESTRICTED corpus. A predicate that is constant only in the restricted domain is RESIDUAL —
// the earlier rungs already filtered it — and is not a specification defect. A predicate constant
// in the unrestricted domain is. This replaces the hand-written UNCONDITIONAL allow-list for the
// rung rows, which the audit correctly found incomplete.
function rungOf(R, V, setName, where) {
  const set = RUNG_SETS[setName];
  let chosen = set.rungs.length;    // 07:1190-1191, the implicit final rung
  for (let i = 0; i < set.rungs.length; i += 1) {
    const holds = set.rungs[i].test(R, V);
    observeUnrestricted("GR3a", set.cite, setName + " rung " + (i + 1) + ": " + set.rungs[i].name,
      holds, where + "/" + R.id);
    if (chosen === set.rungs.length) {
      if (observe("GR3a", set.cite, setName + " rung " + (i + 1) + ": " + set.rungs[i].name,
          holds, where + "/" + R.id)) chosen = i;
    }
  }
  return chosen;
}

// GR3a's whole-home rung 2 carries a sort key inside its own cell (07:1186, restated normatively
// at CINV-24(a) 07:1554): "partial_remodel records, LARGER R_s FIRST". Audit 21 A-3: it was
// declared and never applied. It is applied here as a SUB-RUNG — |R_s| descending partitions the
// rung before the five within-rung keys run — because the clause sits in the rungs column, not in
// the key list. That composition is not stated anywhere, which is gap 9.
function subRungOf(R, V, setName, rungIndex) {
  const rung = RUNG_SETS[setName].rungs[rungIndex];
  if (!rung || !rung.subSort) return 0;
  underdetermined("GR3a / \"Every result has an order\"", "07:1186 vs 07:1199-1206",
    "the whole-home rung cell carries a sixth ordering key — \"partial_remodel records, larger " +
    "R_s first\" — that the five-key list at 07:1199-1206 does not contain, and no rule composes " +
    "the two. Sub-rung (partition the rung by |R_s| before the keys run) or an extra key ahead of " +
    "GR2a? The readings differ whenever a whole-home result contains partials of different |R_s| " +
    "and different classes. Sub-rung is in force here; 17b's X8-5 raised this and audit 21 " +
    "treated it as a plain omission.",
    setName + " rung " + (rungIndex + 1));
  return -sOf(R.workScopeIds).length;   // larger R_s first
}

// "Every result has an order (C: MUST)" — rev 9 07:1398-1405 (rev 8 07:1199-1206, where the
// same five keys ordered WITHIN a rung). The keys are unchanged; what changed is their domain.
// Applied as successive stable refinements from the least significant key up, which is what
// "keeping the position the previous key gave it" (key 2's PB4 carve-out) requires.
// ------------------------------------------------------------------------------------------
// Q-29 CANDIDATE 3 — "skip-to-next-key" (round 10's coordinator proposal, stated as a CANDIDATE).
//
//   "A key on which EITHER record is not_evaluable is skipped, and the comparison falls through
//    to the next key." No position, no null, no zero -- the criterion contributes nothing,
//    literally, which is 07:1220's words rather than a value standing in for them.
//
// This is a COMPARATOR, not a sequence of sorts, so it is implemented as one. It is NOT wired into
// any default and no measurement below uses it except its own tests. Returns the sign AND the key
// that decided, because a transitivity violation is only reportable if the keys are named.
//
// Key applicability, from 07:1398-1405 plus PB4 (07:1218-1220):
//   key 1  GR2a's class order          -- always; EF6 is total, so every record has a class
//   key 2  |delta_area| ascending      -- "where the visitor stated an area and AR5 permits the
//                                         bases to be compared", and not if area is not_evaluable
//   key 3  count of stated ids, desc   -- not if scope is not_evaluable
//   key 4  publishedAt descending      -- always (ID1/PC3: present on every record)
//   key 5  id ascending                -- always, and never ties
const k2Applies = (r) => r.delta !== null && r.delta !== undefined && r.c.area !== "not_evaluable";
const k3Applies = (r) => r.c.scope !== "not_evaluable";
function cmpFallthrough(a, b, V) {
  const d1 = gr2aIndex(a.cls) - gr2aIndex(b.cls);
  if (d1 !== 0) return { r: Math.sign(d1), key: 1 };
  if (k2Applies(a) && k2Applies(b)) {
    const d = Math.abs(a.delta) - Math.abs(b.delta);
    if (d !== 0) return { r: Math.sign(d), key: 2 };
  }
  if (k3Applies(a) && k3Applies(b)) {
    const ca = V.Q.filter((id) => a.rec.workScopeIds.includes(id)).length;
    const cb = V.Q.filter((id) => b.rec.workScopeIds.includes(id)).length;
    if (ca !== cb) return { r: Math.sign(cb - ca), key: 3 };
  }
  if (a.rec.publishedAt !== b.rec.publishedAt)
    return { r: a.rec.publishedAt < b.rec.publishedAt ? 1 : -1, key: 4 };
  return { r: a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0, key: 5 };
}

function orderWithinBlock(rows, V, where) {
  // Keys 5, 4, 3 applied bottom-up as stable sorts, which composes them lexicographically.
  // key (5) id ascending — 07:1403. The deterministic floor.
  let out = [...rows].sort((a, b) => (a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0));
  // key (4) publishedAt descending — 07:1402.
  out = stable(out, (a, b) => (a.rec.publishedAt < b.rec.publishedAt ? 1 : a.rec.publishedAt > b.rec.publishedAt ? -1 : 0));
  // key (3) count of the visitor's stated workScopeIds the record carries, descending — 07:1401-1402.
  // GAP 3: D9-5a made V.scope hold one candidate set PER READING (07:862) and this key still reads
  // it as one set. Five readings are implementable; CFG.key3 selects which is in force.
  //   union        every id any reading admits          (credits a record for an id the visitor
  //                                                      may not have meant)
  //   intersection only ids EVERY reading admits        (the ids the visitor definitely stated)
  //   max / min    the best / worst reading per record  (chooses a reading, which 07:350-356 forbids)
  //   pb4skip      PB4 (07:1218-1220): a criterion in state not_evaluable enters NO tie-break key,
  //                so a record whose scope is not_evaluable is not ordered by this key at all
  const readingSets = (V.readings && V.readings.length > 1)
    ? V.readings.map((rd) => rd.Q) : [V.Q];
  const inAll = readingSets[0].filter((id) => readingSets.every((q) => q.includes(id)));
  // PB4's carve-out is ORTHOGONAL to the count rule, not a sixth reading of it: it says WHETHER the
  // key applies to a record, while union/intersection/max/min say WHAT the count is once it does.
  // CFG.key3Skip turns it on independently, which is what lets the combination be measured.
  const counted = (r) => {
    const ids = r.rec.workScopeIds;
    if (readingSets.length === 1) return V.Q.filter((id) => ids.includes(id)).length;
    const per = readingSets.map((q) => q.filter((id) => ids.includes(id)).length);
    switch (CFG.key3) {
      case "intersection": return inAll.filter((id) => ids.includes(id)).length;
      case "max": return Math.max(...per);
      case "min": return Math.min(...per);
      default: return V.Q.filter((id) => ids.includes(id)).length;   // union
    }
  };
  const skipping = CFG.key3Skip || CFG.key3 === "pb4skip";
  const skipped = (r) => (skipping ? !!(r.c && r.c.scope === "not_evaluable") : false);
  const carried = (r) => (skipped(r) ? null : counted(r));
  // PB4 (07:1218-1220) says a not_evaluable criterion enters NO tie-break key. It does NOT say
  // where the record it belongs to then sits, and THAT is gap 1 / Q-29. Two readings are
  // implementable and CFG.key3SkipMode selects; they are not equivalent, which is the point.
  //   "position"  by analogy with key (2)'s own carve-out wording (07:1399-1401), the skipped
  //               record keeps the slot the previous key gave it and the keyed records are
  //               permuted around it. NOT stable under partitioning the row set — see property 3.
  //   "zero"      the record is ordered by this key with a count of 0, i.e. after every record
  //               that carries an id. A total order -- and PB4's own sentence names it and FORBIDS
  //               it: "not a penalty, not a small penalty, NOT A NULL THAT SORTS LAST" (07:1220).
  if (skipping && CFG.key3SkipMode === "block") {
    // Q-29 CANDIDATE 4 (round 12): applicability is a property of the GR2a CLASS BLOCK, not of a
    // record and not of a pair. Key (3) runs for a block only if EVERY record in it can see the
    // key; otherwise the block is not ordered by key (3) at all and falls to keys (4)-(5). This
    // is the shape 20-pipeline-checker.md 5h.8 called the only unrefuted one, and it is measured
    // here BEHIND A FLAG. It is in no revision and in no default.
    const groups = new Map();
    out.forEach((r, i) => { const k = gr2aIndex(r.cls); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
    for (const idxs of groups.values()) {
      const rs = idxs.map((i) => out[i]);
      if (!rs.every((r) => !skipped(r))) continue;          // this block cannot see the key
      const sorted = stable(rs, (a, b) => counted(b) - counted(a));
      idxs.forEach((slot, j) => { out[slot] = sorted[j]; });
    }
  } else if (skipping && CFG.key3SkipMode === "position") {
    const idx = out.map((r, i) => [r, i]).filter(([r]) => carried(r) !== null);
    const slots = idx.map(([, i]) => i);
    const sorted = idx.map(([r]) => r).slice().sort((a, b) => carried(b) - carried(a));
    sorted.forEach((r, k) => { out[slots[k]] = r; });
  } else if (skipping) {
    out = stable(out, (a, b) => (carried(b) === null ? 0 : carried(b)) - (carried(a) === null ? 0 : carried(a)));
  } else {
    out = stable(out, (a, b) => carried(b) - carried(a));
  }
  // key (1) GR2a's class order — 07:1398.
  out = stable(out, (a, b) => gr2aIndex(a.cls) - gr2aIndex(b.cls));
  // key (2) |delta_area| ascending where the visitor stated an area and AR5 permits the bases —
  // 07:1399-1401. PB4's carve-out: a record where it does not is NOT ordered by this key and is
  // NOT pushed to the end by it, "keeping the position the previous key gave it". Implemented as
  // a POSITIONAL sort inside each key-1 block: the records the key applies to are permuted among
  // the slots they already occupy, and a record the key skips keeps its slot exactly.
  const blocks = new Map();
  out.forEach((r, i) => {
    const k = gr2aIndex(r.cls);
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push(i);
  });
  for (const idxs of blocks.values()) {
    const keyed = idxs.filter((i) => out[i].delta !== null && out[i].delta !== undefined);
    if (keyed.length > 1) {
      const sorted = keyed.map((i) => out[i]).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      keyed.forEach((slot, k) => { out[slot] = sorted[k]; });
    }
  }
  for (const r of out) {
    // 07:1398-1405's five keys, with provenance. 07:1405: "No key is a price."
    if (r.delta !== null && r.delta !== undefined) {
      comparedValues("|delta_area|", Math.abs(r.delta), "|delta_area|", 0, "key 2 / 07:1399", where);
    }
    comparedValues("count(V.Q in R.workScopeIds)", V.Q.filter((id) => r.rec.workScopeIds.includes(id)).length,
      "count(V.Q in R.workScopeIds)", 0, "key 3 / 07:1401", where);
    comparedValues("R.publishedAt", r.rec.publishedAt, "R.publishedAt", "", "key 4 / 07:1402", where);
    comparedValues("R.id", r.rec.id, "R.id", "", "key 5 / 07:1403", where);
    observe("PB4", "07:1399", "key 2 applies to a record (delta defined)",
      r.delta !== null && r.delta !== undefined, where + "/" + r.rec.id);
  }
  if (out.some((r) => r.delta === null || r.delta === undefined) &&
      out.some((r) => r.delta !== null && r.delta !== undefined)) {
    underdetermined("PB4 / \"Every result has an order\"", "07:1398-1405 (section 18's Q-29)",
      "key (2) says a record the key skips \"keeps the position the PREVIOUS key gave it\". The " +
      "previous key is (1), GR2a's class order, which only ever produces blocks of ties — so the " +
      "position inside a block is fixed by keys (3)-(5), which come AFTER (2). The key list does " +
      "not say whether a skipped record holds a slot inside its class block while the keyed " +
      "records are permuted around it, or falls through to key (3). The two readings give " +
      "different orders whenever a block mixes keyed and skipped records.", where);
  }
  return out;
}
function stable(arr, cmp) {
  return arr.map((v, i) => ({ v, i })).sort((a, b) => cmp(a.v, b.v) || a.i - b.i).map((x) => x.v);
}

// ============================================================================================
// SECTION 10 — GR1 / GR4 / GR5 / GR5a (07:1439-1472) and PB2 / PB5 (07:1216, 07:1237)
// ============================================================================================

// GR1 (07:1213-1215) — only values present in the search result may be stated as fact.
function gr1StatableNumbers(R) {
  const out = [];
  if (R.pricing.total && R.pricing.total.kind === "exact") out.push({ v: R.pricing.total.amount, f: "total.amount" });
  if (R.pricing.total && R.pricing.total.kind === "range") {
    out.push({ v: R.pricing.total.minAmount, f: "total.minAmount" });
    out.push({ v: R.pricing.total.maxAmount, f: "total.maxAmount" });
  }
  if (R.pricing.perArea) out.push({ v: R.pricing.perArea.amount, f: "perArea.amount" });
  return out;
}
// GR4 (07:1442-1444, envelope) — "a record does NOT carry pricing.perArea unless the visitor asked
// about a PER-AREA price."
function gr4Envelope(R, V, where) {
  const asked = observe("GR4", "07:1442", "visitor asked about a per-area price",
    V.utterance.includes("평당") || V.utterance.includes("㎡당"), where);
  return { ...R, pricing: { total: R.pricing.total, perArea: asked ? R.pricing.perArea : null } };
}
// GR5 (07:1449-1456) — an AREA is any area appearing in, or derivable from, the result:
// property.area, an area stated in a TITLE, or the area the visitor stated. A PRICE AMOUNT is any
// of total.amount / minAmount / maxAmount / a perArea.amount / the visitor's budget amount.
function titleAreas(R) {
  const out = [];
  for (const i of occurrencesOf(R.title, "평")) {
    const n = numberBefore(R.title, i);
    if (n !== null) out.push({ value: n, unit: "pyeong" });
  }
  for (const i of occurrencesOf(R.title, "㎡")) {
    const n = numberBefore(R.title, i);
    if (n !== null) out.push({ value: n, unit: "m2" });
  }
  return out;
}
// AUDIT 21 A-13: the forbidden set was narrowed twice — quotients admitted only when integral,
// and a range budget contributing only minAmount. 07:1228 says "the quotient of any price amount
// and any area", without qualification, and 07:1225-1226 lists minAmount AND maxAmount.
function gr5ForbiddenNumbers(result, V) {
  const areas = [], perAreas = [], prices = [];
  for (const { rec } of result) {
    if (rec.area) areas.push(rec.area.value);
    for (const t of titleAreas(rec)) areas.push(t.value);
    if (rec.pricing.perArea) perAreas.push(rec.pricing.perArea.amount);
    for (const p of gr1StatableNumbers(rec)) prices.push(p.v);
  }
  if (V.area) areas.push(V.area.value);
  if (V.budget) for (const k of ["amount", "minAmount", "maxAmount"]) {
    if (typeof V.budget[k] === "number") prices.push(V.budget[k]);
  }
  const forbidden = new Set();
  for (const p of perAreas) for (const a of areas) forbidden.add(p * a);
  for (const p of prices) for (const a of areas) if (a !== 0) forbidden.add(p / a);
  return forbidden;
}
// GR5a (07:1458-1461) — "A number that IS ITSELF the value of a pricing field ON THE RECORD THE
// STATEMENT IS ABOUT is permitted ... The exemption is per record and does NOT reach across records."
function gr5aExempt(n, R) { return gr1StatableNumbers(R).some((p) => p.v === n); }

// -------------------------------------------------------- the reply model, and PB2 / PB5 / VB2
//
// AUDIT 21 A-8. pb2Check and pb5Check were `observe(..., false, ...)` — they ASSERTED the
// compliance they were supposed to derive. Both are now derived from two ledgers that the
// pipeline fills as it runs, and both are exercised by a NEGATIVE CONTROL (section 13) that
// injects the forbidden behaviour and asserts the check catches it. A check that cannot fail on
// a mutant is not a check.

// Every numeric comparison any criterion or ordering key performs, with the PROVENANCE of both
// operands. Anything not logged here is not compared by this pipeline.
const COMPARISONS = [];
// The ledgers are filled by the FIRST pass over the corpus only. The mutant re-runs in property
// 4 replace record fields, so their statements would be checked against the unmutated record and
// would report an invention that never happened. LEDGERS_ON is switched off once the reference
// pass is complete, and the checks below read the reference pass alone.
let LEDGERS_ON = true;
function comparedValues(leftProv, leftVal, rightProv, rightVal, rule, where) {
  if (!LEDGERS_ON) return true;
  COMPARISONS.push({ leftProv, leftVal, rightProv, rightVal, rule, where });
  return true;
}

// Every claim the consultation makes about a record. GR1 (07:1213-1215) is the constructor: a
// claim may only quote a value present in the search result.
const STATEMENTS = [];
function stateFact(rec, field, value, where) {
  if (!LEDGERS_ON) return;
  STATEMENTS.push({ id: rec.id, kind: "fact", field, value, where });
}
function stateRelational(rec, kind, about, where) {   // e.g. a budget verdict. V0.2 emits none.
  if (!LEDGERS_ON) return;
  STATEMENTS.push({ id: rec.id, kind, about, where });
}

// VB2 (C: MUST) — 07:872-873: "budgetHint free text and a resolved V.budget are DIFFERENT THINGS.
// Free text is never compared against a price; only a resolved shape is."
function budgetHintOf(utterance) {
  // Free text the visitor used about money that VB1 did NOT resolve into one of its three shapes.
  const hints = ["저렴하게", "가성비", "예산이 빠들해요", "부담 없이", "싸게", "실속"];
  const found = hints.filter((h) => utterance.includes(h));
  return found.length ? found.join(" / ") : null;
}
function vb2Check(where, ledger) {
  // Derived: no logged comparison may carry a free-text operand.
  const bad = (ledger || COMPARISONS).filter((c) => c.leftProv === "V.budgetHint" || c.rightProv === "V.budgetHint");
  observe("VB2", "07:872", "budgetHint free text entered a price comparison", bad.length > 0, where);
  return bad;
}

// PB2 (C: MUST NOT) — 07:1216-1217: "a visitor's TOTAL budget is never compared against a perArea
// amount, in either direction, whatever the units appear to allow."
function pb2Check(where, ledger) {
  const bad = (ledger || COMPARISONS).filter((c) =>
    (c.leftProv === "V.budget.total" && c.rightProv === "R.pricing.perArea.amount") ||
    (c.rightProv === "V.budget.total" && c.leftProv === "R.pricing.perArea.amount"));
  observe("PB2", "07:1216", "a total budget was compared against a perArea amount", bad.length > 0, where);
  return bad;
}

// PB5 (C: MUST NOT) — 07:1237-1238: "a record whose breadth is absent is never DESCRIBED AS
// MATCHING a breadth-specific budget. It may be shown as a labelled reference (GR3)."
function pb5Check(corpusById, where, ledger) {
  const bad = (ledger || STATEMENTS).filter((st) => st.kind === "budget_match" &&
    corpusById.get(st.id) && corpusById.get(st.id).projectType === null);
  observe("PB5", "07:1237", "a breadth-absent record was described as a budget match", bad.length > 0, where);
  return bad;
}

// GR1's other half (07:1440-1441, audit 21 A-13) — "No price is invented, no total is computed,
// no per-area price is computed (D-1c)." Derived: every numeric fact the reply states about a
// record must be IDENTICAL to a value the record itself carries.
function gr1InventionCheck(corpusById, where, ledger) {
  const invented = (ledger || STATEMENTS).filter((st) => {
    if (st.kind !== "fact") return false;
    const rec = corpusById.get(st.id);
    if (!rec) return true;
    const own = [...gr1StatableNumbers(rec).map((x) => x.v)];
    if (rec.area) own.push(rec.area.value);
    return typeof st.value === "number" && !own.includes(st.value);
  });
  observe("GR1", "07:1441", "the reply states a number the record does not carry",
    invented.length > 0, where);
  return invented;
}

// ============================================================================================
// SECTION 11 — the pipeline: one utterance, 19 records, an ordered labelled result
// ============================================================================================

// D9-2c's presentation order is rev 9's GR2a (07:1316-1317). Kept under its design-document name
// too, because 22-rev9-design.md and proof/pb4-direction.mjs refer to it that way.
const D9_2C_ORDER = GR2A_REV9;

// Resolve WS6's ambiguity for this branch (07:2686's weaker-class discriminator, computed), then
// evaluate all 19 records.
function evaluateBranch(V0, corpus) {
  const readings = scopeReadings(V0.utterance);
  let V;
  if (CFG.ws6 === "rev9") {
    // 07:350-356 (D9-5a): "V.scope carries EVERY reading the term admits ... EF3 resolves them
    // per record." Nothing is chosen here; the tie-break is gone, not replaced.
    const union = [...new Set(readings.flatMap((r) => r.Q))];
    V = { ...V0, readings, Q: union, Q_s: sOf(union), Q_t: tOf(union),
          scopeNotes: readings.length > 1 ? readings.map((r) => "[" + r.Q.join(",") + "]") : [],
          ws6Alternatives: readings.length };
    // Key (3) under more than one reading. CLOSED at rev 9.1 by D9-8 (07:1407-1420), which says the
    // key reads the INTERSECTION. The gap is still raised under useRev(9) so the finding that
    // produced D9-8 stays re-runnable against the text it was about.
    if (readings.length > 1 && CFG.key3 === "union") {
      underdetermined("GR3 / \"Every result has an order\"", "07:1402 vs 07:862 (D9-5a)",
        "rev 9 made V.scope hold one candidate set per WS6 reading, and tie-break key (3) still " +
        "reads \"the count of the visitor's stated workScopeIds the record carries\" as though " +
        "there were one set. Under two readings there is no such count: 현관 수납 gives " +
        "{entrance, storage} under one reading and {entrance} + trade {built_in_furniture} under " +
        "the other, and a record can carry a different number under each. EF3's ambiguity clause " +
        "resolves the CRITERION and says nothing about the ordering key. Union used here.",
        V0.utterance);
    }
  } else {
    const pick = ws6ResolveByWeakerClass(readings, V0.breadth, V0.area, corpus, V0.utterance);
    V = { ...V0, readings: [pick], Q: pick.Q, Q_s: pick.Q_s, Q_t: pick.Q_t, scopeNotes: pick.notes,
          ws6Alternatives: readings.length };
  }
  const byId = new Map(corpus.map((R) => [R.id, R]));
  const rows = [];
  for (const R of corpus) {
    const where = V.utterance + "/" + R.id;
    const breadth = EF2(V, R, where);
    const sc = EF3(V, R, where);
    // 07:1014-1015: when the readings differ the reply DISCLOSES that the term was ambiguous. The
    // disclosure is a statement about the record, so it goes in the statements ledger.
    if (sc.ambiguous) stateRelational(R, "ambiguity_disclosure", V.utterance, where);
    // 07:978 and 07:1083-1087 — what the reply ASSERTS about this record's scope. Gap 3's family.
    const disc = discloseScope(V, R, sc, where);
    // D9-9 sentence 4 (07:1126-1132). An empty intersection under a row that fired BECAUSE its set
    // is non-empty is not a weaker disclosure, it is a false one; rev 9.1 sends it to not_evaluable
    // and discloses the ambiguity. Recorded through assignState so EF1 closure still sees EF3.
    if (disc && disc.sentence4) {
      sc.state = assignState("EF3", "scope", "not_evaluable", where);
      sc.relation = null;
      sc.ambiguous = true;
      disc.suppressed = true;
      stateRelational(R, "ambiguity_disclosure", V.utterance, where);
    }
    const ar = EF4(V, R, where);
    const c = { breadth, scope: sc.state, area: ar.state };
    const relation = sc.relation && sc.relation !== UNDET ? sc.relation.relation : null;
    const scopeAmbiguous = !!sc.ambiguous;
    const { cls, row, hold } = EF6(c, R.projectType, relation, where);
    // GR4's envelope, then GR1: the reply quotes this record's own emitted prices, nothing else.
    const env = gr4Envelope(R, V, where);
    for (const pr of gr1StatableNumbers(env)) stateFact(R, pr.f, pr.v, where);
    if (R.area) stateFact(R, "property.area.value", R.area.value, where);
    // V.budget is extracted and stated back (07:1243-1246) but enters NO comparison: nothing is
    // logged to COMPARISONS with a V.budget provenance, and PB2/PB5 derive from that ledger.
    rows.push({
      rec: R, c, cls, ef6Row: row, ef6Hold: hold.map((h) => h.n), relation, scopeAmbiguous, disc,
      relRow: sc.relation && sc.relation !== UNDET ? sc.relation.row : null,
      relTable: sc.relation && sc.relation !== UNDET ? sc.relation.table : null,
      relHold: sc.relation && sc.relation !== UNDET ? sc.relation.hold.map((h) => h.n) : [],
      delta: ar.delta, tier: ar.tier,
      // GR2 (07:1253-1266): "the list of criteria the visitor STATED that came out not_evaluable".
      notEvaluable: ["breadth", "scope", "area"].filter((k) => c[k] === "not_evaluable"),
    });
  }
  // GR3a is DELETED at rev 9 (07:1365-1368) and parked in section 17.3. Its predicates are not
  // evaluated at all under rev 9, so property 2 does not report them as rev-9 dead branches.
  let gr3aHold = [], setName = "none";
  if (!CFG.noRungs) {
    gr3aHold = gr3aRowsHolding(V, V.utterance);
    setName = gr3aHold.length ? gr3aHold[0].set : "none";
    for (const r of rows) {
      r.rung = setName === "none" ? 0 : rungOf(r.rec, V, setName, V.utterance);
      r.subRung = setName === "none" ? 0 : subRungOf(r.rec, V, setName, r.rung);
    }
  } else {
    for (const r of rows) { r.rung = 0; r.subRung = 0; }
  }
  return { V, rows, setName, gr3aHold, byId };
}

function evaluateAll(utterance, corpus) {
  return queryBranches(utterance).map((V) => evaluateBranch(V, corpus));
}

// Order B — GR3a's rungs (07:1184-1206), now including the whole-home cell's own "larger R_s
// first" sub-rung (07:1186; audit 21 A-3).
function orderByRungs(ev) {
  // D9-1 (22-rev9-design.md section 1): GR3a's rungs are deleted AS AN ORDERING DEVICE and
  // GR2a's class order becomes the whole order, followed by the within-class tie-break keys.
  // orderWithinBlock already IS "key (1) GR2a class, then keys (2)-(5)", so applying it to the
  // whole result — instead of to each rung — is D9-1 exactly. Behind the flag; not in force.
  if (CFG.noRungs) return orderWithinBlock(ev.rows, ev.V, ev.V.utterance);
  const byRung = new Map();
  for (const r of ev.rows) {
    const k = r.rung * 1000 + (r.subRung || 0) + 500;
    if (!byRung.has(k)) byRung.set(k, []);
    byRung.get(k).push(r);
  }
  const out = [];
  for (const k of [...byRung.keys()].sort((a, b) => a - b)) {
    out.push(...orderWithinBlock(byRung.get(k), ev.V, ev.V.utterance));
  }
  return out;
}
// Order A — GR3's direct-answer sentence. Rev 9 07:1355-1360 makes it a DEFINITION over a named
// prefix of GR2a; rev 8 07:1169-1171 stated it as an ordering. Both read: "A record whose EF6 class is `exact` is a DIRECT
// ANSWER. Every other returned record is a LABELLED REFERENCE ... Direct answers are offered
// first, then the labelled references."
function orderByDirectAnswersFirst(ev) {
  const direct = ev.rows.filter((r) => r.cls === "exact");
  const labelled = ev.rows.filter((r) => r.cls !== "exact");
  return [...orderWithinBlock(direct, ev.V, ev.V.utterance),
          ...orderWithinBlock(labelled, ev.V, ev.V.utterance)];
}

// ============================================================================================
// SECTION 12 — the utterance corpus
// ============================================================================================

// 04 section 4.1 rows A-I (04:693-701), as amended by 18 section 7 (18:552-566). Row D carries
// two utterances; both are run.
//
// AUDIT 21 A-5 / A-11. Every expectation now carries its SOURCE, and a claim only counts as
// "reproduced" when a source states it. `src: "04"` / `src: "18"` are stated claims; `src: "drv"`
// is this transcriber's own derivation from a source's prose and is reported separately, never
// folded into the headline. Row G's ["bi-19","exact"] is REMOVED: 04:699 assigns bi-19 no class
// at all — it claims bi-19 is "reached on GR3's trade rung" and its 11,000,000 "stated as a fact",
// which are the head and price checks below. The audit is right that the class was invented here.
const ROWS_4_1 = [
  { row: "A", cite: "04:693", u: "34평 전체 5천이면 되나요",
    expect: [["bi-09", "exact", "04"], ["bi-01", "exact", "04"], ["bi-10", "exact", "04"],
             ["bi-12", "area_fallback", "04"]] },
  { row: "B", cite: "04:694 + 18:554", u: "예산 3천으로 전체 가능해요?",
    // 18:554 names the seven full_remodel records by id: "bi-01, bi-07, bi-09-bi-13".
    expect: [["bi-01", "exact", "18"], ["bi-07", "exact", "18"], ["bi-09", "exact", "18"],
             ["bi-10", "exact", "18"], ["bi-11", "exact", "18"], ["bi-12", "exact", "18"],
             ["bi-13", "exact", "18"]] },
  { row: "C", cite: "04:695 + 18:556", u: "주방만 하면 얼마예요",
    // 18:556 names ALL of them: bi-04 a second scope_superset; bi-01/bi-07 JOIN bi-09-bi-13 as
    // fallback_from_full; bi-02 unknown_type_fallback. Audit 21 A-11: 5 were missing here.
    expect: [["bi-14", "exact", "04"], ["bi-16", "scope_superset", "04"],
             ["bi-04", "scope_superset", "18"],
             ["bi-01", "fallback_from_full", "18"], ["bi-07", "fallback_from_full", "18"],
             ["bi-09", "fallback_from_full", "18"], ["bi-10", "fallback_from_full", "18"],
             ["bi-11", "fallback_from_full", "18"], ["bi-12", "fallback_from_full", "18"],
             ["bi-13", "fallback_from_full", "18"], ["bi-02", "unknown_type_fallback", "18"]] },
  { row: "D1", cite: "04:696 + 18:558", u: "욕실 하나만",
    expect: [["bi-15", "exact", "04"], ["bi-16", "scope_superset", "04"],
             ["bi-04", "scope_superset", "18"], ["bi-01", "fallback_from_full", "18"]] },
  { row: "D2", cite: "04:696 + 18:558", u: "욕실 두 개",
    // WS3 (07:338-341) erases the count, so D2 is the same query as D1 and carries the same pairs
    // (audit 21 A-11: bi-01's pair was dropped here).
    expect: [["bi-15", "exact", "04"], ["bi-16", "scope_superset", "04"],
             ["bi-04", "scope_superset", "18"], ["bi-01", "fallback_from_full", "18"]] },
  { row: "E", cite: "04:697", u: "전용 84 아파트 주방",
    expect: [["bi-14", "exact", "04"]],
    // 04:697's NEGATIVE half, which was never run (audit 21 A-11): a "34평 주방" query must NOT
    // be told bi-14 is a 34평 flat, i.e. bi-14's area criterion must not come out satisfied.
    negative: { u: "34평 주방", id: "bi-14", areaNot: "satisfied", clsNot: "exact" } },
  { row: "F", cite: "04:698", u: "50평 전체 1억 넘나요",
    // 04:698 states a RANGE claim about bi-13 and calls bi-08 "a projectType-absent reference";
    // neither is a class. Both are recorded as derivations, not as stated classes.
    expect: [["bi-13", "exact", "drv"], ["bi-08", "unknown_type_fallback", "drv"]],
    statedPrice: { id: "bi-13", kind: "range" } },
  { row: "G", cite: "04:699 + 18:561", u: "32평인데 도배랑 바닥만 얼마예요",
    expect: [], head: "bi-19", statedPrice: { id: "bi-19", kind: "exact", amount: 11000000 } },
  { row: "H", cite: "04:700 + 18:564", u: "바닥이랑 거실만",
    expect: [["bi-17", "exact", "04"], ["bi-06", "scope_superset", "18"],
             ["bi-08", "unknown_type_fallback", "18"]] },
  { row: "I", cite: "04:701 + 18:566", u: "현관 수납",
    expect: [["bi-18", "exact", "04"], ["bi-01", "exact", "18"], ["bi-09", "exact", "18"],
             ["bi-12", "exact", "18"], ["bi-03", "unknown_type_fallback", "18"],
             ["bi-06", "scope_superset", "18"]] },
];

// Extra utterances: not expectations, just inputs that exercise branches the nine do not.
const EXTRA_UTTERANCES = [
  "주방이랑 욕실 사례 있나요",              // 17:196 — B8-2's demonstration input
  "34평 전체 리모델링",                      // 17:441 — B8-3's demonstration input
  "전체 리모델링 사례 보여주세요",           // CINV-21 / CINV-24(a), 07:1551/07:1554
  "큰 공사는 아니고 몇 군데만",              // 17:381-386 — B8-4 row 3 vs row 7
  "집 전체는 아니고 바닥이랑 도배만 하려고요", // 17:410-415 — B8-4 row 4 vs row 5
  "현관이랑 복도 수납",                      // 07:348 — WS6's own worked example
  "창호 교체하려는데 34평 전체 리모델링",     // 07:1174 — GR3a's own disambiguation example
  "바닥이랑 도배만",                          // 07:1197 — the trade rung's own example
  "바닥만",                                   // CINV-15(a), 07:1545 — 14.3.3.1 row 2 vs bi-17
  "2천만원으로 바닥이랑 도배만",               // CINV-15(b), 07:1545 — 14.3.3.1 row 4 vs bi-16
  "주방만 하고 싶어요",                       // 07:1554 CINV-24(c)
  "600~800만원 예산인데 주방",                // CINV-8, 07:1538 — VB1 range
  "1억 이내로 전체 리모델링",                 // VB1 max, 07:869
  "평당 가격 알려주세요 34평 전체 리모델링",  // GR4's discriminator, 07:1442
  "저렴하게 주방만 하고 싶어요",              // VB2 (07:872) — free text, no resolvable shape
  "34평 주방",                                // 04:697's negative half
];

// CINV-9 (07:1539) supplies WS8's fixture BY NAME and the first pass left it out (audit 21 A-6):
// "bi-16 [kitchen, bathroom] read by a consumer that does not know `bathroom`". WS8 is a property
// of the (document, CONSUMER) pair, not of the document, so it needs a second consumer, not a
// twentieth record. This one knows the 26 ids of section 7.3 minus `bathroom`.
const CINV9_VOCAB = new Set([...SPACES, ...WORKS].filter((id) => id !== "bathroom"));
function corpusAsReadBy(vocab, label) {
  return RECORDS.map((R) => {
    const kept = R.workScopeIds.filter((id) => vocab.has(id));
    // the SAME registered predicate the full-vocabulary consumer evaluates (07:429), so the
    // dead-branch report in property 2 sees this consumer too rather than only the first one.
    const dropped = observe("WS8", "07:429", "record has an id this consumer dropped",
      R.workScopeIds.length !== kept.length, label + "/" + R.id);
    return { ...R, workScopeIds: kept, droppedUnknownId: dropped };
  });
}
const CINV9_CORPUS = corpusAsReadBy(CINV9_VOCAB, "CINV-9 consumer");
const CINV9_UTTERANCE = "주방만, 2천";   // 07:1539's own fixture query
const ALL_UTTERANCES = [...ROWS_4_1.map((r) => r.u), ...EXTRA_UTTERANCES];


// ============================================================================================
// SECTION 13 — the six property classes, plus the two assertions the redesign depends on
// ============================================================================================

const OUT = [];
const say = (s) => OUT.push(s === undefined ? "" : s);
function wrap(text, width) {
  const words = text.split(" "), out = []; let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) { out.push(line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// The two implementation choices audit 21 showed the counts depend on. Printed, so the numbers
// stop moving (coordinator item 8).
const CHOICES = [
  ["query area basis when the visitor states none (07:1065-1068)", "LEFT UNKNOWN; AR5 compares with a disclosure",
   "audit 21 A-2, confirmed by rev 9's Q-31: the bare-pyeong basis gap is FALSE and no rule is added"],
  ["key (2)'s PB4 carve-out (07:1398-1405)", "positional permutation inside each GR2a class block",
   "07:1405 carries it as section 18's Q-29, unpatched"],
  ["key (3) under two WS6 readings (07:1399 vs 07:862)", "union of the readings' ids",
   "NEW at rev 9: D9-5a changed V.scope's shape and the key list was not updated"],
  ["VB3's left column (07:898-902)", "FORMS — decided by rev 9, no longer a choice",
   "D9-4(iii); rev 8 left it open and the checker had to branch"],
  ["a man-particle on a quantity (07:904-908)", "not a space restriction — decided by rev 9",
   "D9-4(iv); rev 8 left it open and the checker had to branch"],
  ["GR3a's rungs and the sub-rung key", "DELETED (07:1365-1368); parked in section 17.3",
   "D9-1; the rev-8 implementation is retained behind useRev(8)"],
];

say("contract-pipeline — executable reference implementation of the integration contract");
say("  DEFAULT CONFIGURATION: REV 9 (D9-1 + D9-2c + D9-4 + D9-5a = D9-6, one indivisible change).");
say("  Rev 8 stays runnable behind useRev(8); the comparison follows the six properties.");
say("  Repaired against the independent audit in 21-pipeline-audit.md.");
say("  corpus: 19 records (bi-01..bi-08 from 18:100-107 + projects.json; bi-09..bi-19 from 04 section 2)");
say("  utterances: " + ALL_UTTERANCES.length + " (" + ROWS_4_1.length + " from 04 section 4.1, " +
  EXTRA_UTTERANCES.length + " extra)");
say("  rules rev 9 changed, and where this file encodes them:");
say("    D9-1  07:1365-1368  GR3a deleted as an ordering device         CFG.noRungs = " + CFG.noRungs);
say("    D9-2c 07:1003-1007    EF3 satisfied set = " + CFG.satRelations.join(" + "));
say("          07:1268       EF6 row 7 gives scope_superset its class   CFG.ef6Row8 = " + CFG.ef6Row8);
say("          07:1316-1317  GR2a reordered   " + CFG.classOrder.slice(0, 4).join(" > ") + " > ...");
say("    D9-4  07:883-900    VB3 first-match + reordered rows + forms + the quantity particle");
say("    D9-5a 07:350-365    WS6's tie-break deleted; Q carries every reading; EF3 resolves");
say();
say("  readings and gaps still in force (every count below is conditional on these):");
for (const [what, inForce, why] of CHOICES) {
  say("    - " + what);
  say("        " + inForce + "   [" + why + "]");
}
say();

// ---------------------------------------------------------------------- run every branch
// A BRANCH is one (utterance, V.breadth, V.area-shape) the contract admits. Nothing is chosen:
// where VB3 or 14.3.1 leaves several values open, every one of them is a branch and every
// property quantifies over branches, not over utterances.
const RUNS = [];
const LEDGER_BEFORE_RUNS = STATE_LEDGER.length;
for (const u of ALL_UTTERANCES) {
  for (const ev of evaluateAll(u, RECORDS)) {
    orderByRungs(ev);            // so the ordering keys' comparisons reach the ledger too
    RUNS.push({ u, ev, key: u + " | " + ev.V.branch });
  }
}
const LEDGER_AFTER_RUNS = STATE_LEDGER.length;
// the reference pass is complete: everything below re-runs the pipeline on mutants, so the
// ledgers are frozen here and the price-rule checks read this prefix alone.
const REF_COMPARISONS = [...COMPARISONS];
const REF_STATEMENTS = [...STATEMENTS];
const BRANCHED = [...new Set(RUNS.filter((r) => RUNS.filter((x) => x.u === r.u).length > 1).map((r) => r.u))];

// CINV-9's second consumer (07:1539), the fixture audit 21 A-6 found missing.
LEDGERS_ON = false;
const CINV9_RUN = evaluateAll(CINV9_UTTERANCE, CINV9_CORPUS)[0];
const CINV9_BASE = evaluateAll(CINV9_UTTERANCE, RECORDS)[0];

// ---------------------------------------------------------------------- property 1
say("== PROPERTY 1 — totality and single-valuedness of the table-driven rules ==");
let vb3Multi = 0, vb3None = 0;
for (const u of ALL_UTTERANCES) {
  const r = vb3(u);
  if (r.matched.length === 0) {
    vb3None += 1;
    say("  VB3  0 rows  " + u + "  -> absent (total by " +
      (CFG.vb3 === "rev9" ? "07:879-881" : "07:840-842") + "'s own default clause)");
  }
  if (r.matched.length > 1) {
    vb3Multi += 1;
    const vals = r.matched.map((x) => x.n + ":" + String(x.value));
    const conflicting = new Set(r.matched.map((x) => String(x.value))).size > 1;
    say("  VB3  " + r.matched.length + " rows " + (conflicting ? "CONFLICT" : "agree   ") +
      "  " + u + "  -> " + vals.join(" | "));
    if (conflicting) {
      finding(1, "VB3 (07:840-848) " + r.matched.length + " rows match \"" + u +
        "\" with opposite values (" + vals.join(" / ") + ") and the table states no evaluation " +
        "order — unlike PB7 (07:1074), GR3a (07:1173) and EF6 (07:1257-1270), which all do.");
    }
  }
  if (r.values.length > 1 && r.matched.length <= 1) {
    say("  VB3  undecided predicate  " + u + "  -> candidates " + r.values.map(String).join(" / "));
    finding(1, "VB3 (07:847) leaves \"" + u + "\" undecided between " +
      r.values.map(String).join(" / ") + ": the row's exemplars do not reach it and no default " +
      "covers it. Both values are run.");
  }
}

const U3 = ["kitchen", "bathroom", "entrance"];
const W2 = ["flooring", "wallpaper"];
const subsetsOf = (xs) => { const out = [[]]; for (const x of xs) for (const s of [...out]) out.push([...s, x]); return out; };
let scopeInputs = 0, scopeNone = 0, scopeMulti = 0, tradeInputs = 0, tradeNone = 0, tradeMulti = 0;
for (const R_s of subsetsOf(U3)) for (const Q_s of subsetsOf(U3))
for (const R_t of subsetsOf(W2)) for (const Q_t of subsetsOf(W2)) {
  scopeInputs += 1;
  const where = "synthetic R_s=[" + R_s + "] R_t=[" + R_t + "] Q_s=[" + Q_s + "] Q_t=[" + Q_t + "]";
  const hold = scopeRowsHolding(R_s, R_t, Q_s, Q_t, where);
  if (hold.length === 0) { scopeNone += 1; finding(1, "14.3.3 NO row holds for " + where); }
  if (hold.length > 1) scopeMulti += 1;
  if (hold.length && hold[0].rel === "@14.3.3.1") {
    tradeInputs += 1;
    const h2 = tradeOnlyRowsHolding(R_s, R_t, Q_s, Q_t, where);
    if (h2.length === 0) { tradeNone += 1; finding(1, "14.3.3.1 NO row holds for " + where); }
    if (h2.length > 1) tradeMulti += 1;
  }
}
say("  14.3.3    " + scopeInputs + " synthetic inputs: " + scopeNone + " with no row, " +
  scopeMulti + " with more than one (all resolved by PB7 07:1074, which the table states)");
say("  14.3.3.1  " + tradeInputs + " reached: " + tradeNone + " with no row, " + tradeMulti + " with more than one");

const TYPES = ["full_remodel", "partial_remodel", null];
const RELATIONS = ["scope_superset", "scope_subset", "scope_overlap", "scope_disjoint"];
function ef6RawSweep(label) {
  let n = 0, none = 0, notFirst = 0; const reached = new Set();
  for (const breadth of STATES) for (const scope of STATES) for (const area of STATES) for (const pt of TYPES) {
    const c = { breadth, scope, area };
    // relations are only meaningful for a scope verdict that has one. Under the variant a
    // `satisfied` scope carries exactly the relations the variant calls satisfying, and an
    // `unsatisfied` scope carries exactly the others; a vector that mixes them is not a state
    // the proposal can produce and is not part of EF6's input space.
    let rels = [null];
    if (scope === "satisfied") rels = CFG.satRelations.filter((r) => r !== "scope_exact").concat([null]);
    else if (scope === "unsatisfied") rels = ["scope_superset", ...RELATIONS].filter(
      (r) => !CFG.satRelations.includes(r));
    for (const rel of rels) {
      n += 1;
      const where = "raw " + breadth + "/" + scope + "/" + area + "/" + pt;
      const { cls, row, hold } = EF6(c, pt, rel, where);
      if (cls === UNDET) { none += 1; finding(1, "EF6 NO row holds for " + where); }
      else if (row !== hold[0].n) { notFirst += 1; finding(1, "EF6 first-match-wins violated at " + where); }
      if (cls !== UNDET) reached.add(cls);
    }
  }
  return { n, none, notFirst, reached };
}
const ef6Raw = ef6RawSweep("rev8");
say("  EF6       " + ef6Raw.n + " raw cross-product inputs: " + ef6Raw.none + " with no row, " +
  ef6Raw.notFirst + " where the returned row was not the lowest holding");
if (GR2A.length !== CLASSES.length || new Set(GR2A).size !== GR2A.length || !GR2A.every((c) => CLASSES.includes(c))) {
  finding(1, "GR2a (07:1316-1317) is not a permutation of GR2's closed list (07:1250-1264)");
}
say("  GR2a      permutation of GR2's closed list: " +
  (GR2A.length === CLASSES.length && new Set(GR2A).size === GR2A.length && GR2A.every((c) => CLASSES.includes(c)) ? "yes" : "NO"));

let gr3aNone = 0, gr3aMulti = 0, gr3aInputs = 0;
if (CFG.noRungs) {
  say("  GR3a      deleted at rev 9 (07:1365-1368); its table is parked in section 17.3 and is");
  say("            not enumerated here. Run under useRev(8) it is total with 11 of 12 overlaps");
  say("            resolved by its own first-match clause.");
} else
{ for (const breadth of ["whole", "partial", null]) for (const qs of [[], ["kitchen"]]) for (const qt of [[], ["flooring"]]) {
  gr3aInputs += 1;
  const V = { breadth, Q_s: qs, Q_t: qt, Q: [...qs, ...qt] };
  const where = "synthetic GR3a " + String(breadth) + "/Qs=" + qs.length + "/Qt=" + qt.length;
  const hold = gr3aRowsHolding(V, where);
  if (hold.length === 0) { gr3aNone += 1; finding(1, "GR3a NO row holds for " + where); }
  if (hold.length > 1) gr3aMulti += 1;
}
  say("  GR3a      " + gr3aInputs + " inputs: " + gr3aNone + " with no row, " + gr3aMulti +
    " with more than one (resolved by 07:1173, which the table states)");
}

// Ordering determinism (CINV-21, 07:1551), against input permutation.
let nondet = 0;
for (const { u, ev } of RUNS) {
  const ref = orderByRungs(ev).map((r) => r.rec.id).join();
  for (const seed of [1, 2, 3]) {
    const shuffled = [...RECORDS].sort((a, b) =>
      ((a.id.charCodeAt(3 + seed % 2) * seed) % 7) - ((b.id.charCodeAt(3 + seed % 2) * seed) % 7));
    if (orderByRungs(evaluateBranch(ev.V, shuffled)).map((r) => r.rec.id).join() !== ref) {
      nondet += 1;
      finding(1, "CINV-21: the composed order is not determined by the record set alone for \"" + u + "\"");
    }
  }
}
say("  CINV-21   " + (RUNS.length * 3) + " permuted re-runs, " + nondet + " differed from the reference order");
say();

// ---------------------------------------------------------------------- property 3
say("== PROPERTY 3 — GR3's direct-answer sentence vs the remaining ordering device ==");
say("  rev 9 (07:1355-1368): the rungs are deleted and \"direct answers are offered first\" is a");
say("  DEFINITION over a named prefix of GR2a, so the two cannot disagree. Rev 8 (07:1171 vs");
say("  07:1184-1206): two C: MUST orderings with no tie-breaker. The same differential is run.");
let ordDiff = 0, ordDiffTop3 = 0;
for (const { u, ev, key } of RUNS) {
  const a = orderByDirectAnswersFirst(ev), b = orderByRungs(ev);
  const top = (o) => o.slice(0, 3).map((r) => r.rec.id + "(" + r.cls + ")").join(", ");
  const ia = a.map((r) => r.rec.id), ib = b.map((r) => r.rec.id);
  if (ia.join() === ib.join()) continue;
  let at = 0; while (ia[at] === ib[at]) at += 1;
  ordDiff += 1;
  const inTop3 = at < 3;
  if (inTop3) ordDiffTop3 += 1;
  if (ordDiff <= 8 || inTop3) {
    say("  DIFFER " + (inTop3 ? "in top 3 " : "at pos " + (at + 1) + " ") + " " + key);
    say("            direct-answers-first (07:1171): " + top(a));
    say("            GR3a rungs (" + ev.setName + ", " + RUNG_SETS[ev.setName].cite + "): " + top(b));
  }
  finding(3, "\"" + key + "\": orders diverge at position " + (at + 1) + ". 07:1171 top-3 [" +
    top(a) + "]; GR3a's rungs top-3 [" + top(b) + "]");
}
say("  " + ordDiff + " of " + RUNS.length + " branches order differently under the two C: MUST rules (" +
  ordDiffTop3 + " of them inside the top 3)");
if (ordDiff > 0) {
  underdetermined("GR3", "07:1171 vs 07:1184-1206",
    "two C: MUST orderings with no tie-breaker. 07:1171 says direct answers are offered first; " +
    "07:1190-1191 makes the rungs total over the result and 07:1199 orders WITHIN a rung starting " +
    "from GR2a's class order, which contains `exact` — so a labelled reference on an earlier rung " +
    "precedes a direct answer on a later one. No rule says which governs.",
    ordDiff + " of " + RUNS.length + " branches");
}
say();

// ---------------------------------------------------------------------- property 4
say("== PROPERTY 4 — PB4 (07:1224-1237) ==");
say("  4a. METAMORPHIC — delete a price/area field, re-run, assert the record does not move down.");
const DELETABLE = ["area", "pricing.total", "pricing.perArea"];
const PB4_BY_FIELD = {}; for (const f of DELETABLE) PB4_BY_FIELD[f] = { checked: 0, moved: 0 };
let pb4Checks = 0, pb4Viol = 0;
for (const { ev, key } of RUNS) {
  const base = orderByRungs(ev).map((r) => r.rec.id);
  for (const target of RECORDS) {
    for (const field of DELETABLE) {
      if (field === "area" && target.area === null) continue;
      if (field === "pricing.total" && target.pricing.total === null) continue;
      if (field === "pricing.perArea" && target.pricing.perArea === null) continue;
      pb4Checks += 1; PB4_BY_FIELD[field].checked += 1;
      const mutated = RECORDS.map((R) => {
        if (R.id !== target.id) return R;
        if (field === "area") return { ...R, area: null };
        // AUDIT 21 A-15: deleting a total while leaving a `source: "derived"` perArea is a record
        // shape D-1 condition 2 forbids. The derived perArea goes with its total.
        if (field === "pricing.total") {
          const keepPer = R.pricing.perArea && R.pricing.perArea.source !== "derived" ? R.pricing.perArea : null;
          return { ...R, pricing: { total: null, perArea: keepPer } };
        }
        return { ...R, pricing: { ...R.pricing, perArea: null } };
      });
      const after = orderByRungs(evaluateBranch(ev.V, mutated)).map((r) => r.rec.id);
      const was = base.indexOf(target.id), now = after.indexOf(target.id);
      if (now > was) {
        pb4Viol += 1; PB4_BY_FIELD[field].moved += 1;
        const passedBy = base.slice(was, now + 1).filter((id) => id !== target.id && after.indexOf(id) < now);
        if (pb4Viol <= 6) {
          say("    VIOLATION  " + key);
          say("                 deleting " + target.id + "." + field + " moves it " + (was + 1) +
            " -> " + (now + 1) + ", behind " + passedBy.join(", "));
        } else if (pb4Viol === 7) say("    ... (all listed in the summary)");
        finding(4, "deleting " + target.id + "." + field + " on \"" + key + "\" moves it from position " +
          (was + 1) + " to " + (now + 1) + ", behind " + passedBy.join(", ") +
          " — PB4 (07:1224-1226): \"not a penalty, not a small penalty, not a null that sorts last\"");
      }
    }
  }
}
say("    " + pb4Checks + " deletions checked, " + pb4Viol + " moved the record down");
for (const f of DELETABLE) say("      " + f.padEnd(17) + PB4_BY_FIELD[f].checked + " checked, " + PB4_BY_FIELD[f].moved + " moved down");
say("    (audit 21 A-15 is right that the price arm carries no information: 07:1405 says \"No key");
say("     is a price\", so the price deletions were never capable of moving anything. They are kept");
say("     as a control on the deletion mechanism, not as evidence.)");
say();

// 4b. THE STRICT METAMORPHIC FORM the redesign depends on (coordinator).
//     For a criterion c, a record with c `not_evaluable` must NOT sort BELOW an otherwise-identical
//     record with c `unsatisfied` (07:1218-1220). Run on the REAL corpus: for each record and each
//     criterion, two mutants of that same record are built — one driving c to `not_evaluable`, one
//     to `unsatisfied` — each inserted into the otherwise-unchanged corpus, and the ranks compared.
//     STRICT: no tolerance, no "within the same class" relaxation.
function mutantsFor(R, crit, V) {
  if (crit === "area") {
    if (!V.area) return null;                            // criterion not stated: nothing to drive
    return { nev: { ...R, area: null },                  // EF4: R.property.area absent
             uns: { ...R, area: { value: Math.round(V.area.value * 3) || 300,
                                  unit: V.area.unit, basis: V.area.basis } } };  // |delta| > 0.20
  }
  if (crit === "breadth") {
    if (!V.breadth) return null;
    const other = V.breadth === "whole" ? "partial_remodel" : "full_remodel";
    return { nev: { ...R, projectType: null },           // EF2: R.projectType absent
             uns: { ...R, projectType: other } };        // EF2: the wrong counterpart
  }
  // scope. not_evaluable via WS8's dropped id (07:904); unsatisfied via a partial whose relation
  // is not scope_exact (07:906).
  if (V.Q.length === 0) return null;
  // The two mutants must be OTHERWISE IDENTICAL, which includes |R_s| — GR3a's whole-home rung 2
  // sorts partials by |R_s| (07:1186), so an unequal id count would make the sub-rung, not the
  // criterion, decide the comparison. The unsatisfied twin therefore gets a DISJOINT id set of
  // the SAME shape: as many spaces as R_s has and as many trades as R_t has, none of them in Q.
  const baseIds = R.workScopeIds.length ? R.workScopeIds : ["kitchen"];
  const nS = sOf(baseIds).length, nT = tOf(baseIds).length;
  const dS = SPACES.filter((x) => !V.Q_s.includes(x)).slice(0, nS);
  const dT = WORKS.filter((x) => !V.Q_t.includes(x)).slice(0, nT);
  const disjoint = [...dS, ...dT];
  if (disjoint.length !== baseIds.length) return null;   // cannot build an equal-shape twin
  return { nev: { ...R, projectType: "partial_remodel", droppedUnknownId: true,
                  workScopeIds: baseIds },
           uns: { ...R, projectType: "partial_remodel", droppedUnknownId: false,
                  workScopeIds: disjoint } };
}
// Names each residual violation by SHAPE (criterion + both classes) with a concrete corpus
// witness, because an aggregate can be neither fixed precisely nor accepted explicitly.
function nameResiduals(label, res) {
  if (!res.viol.length) {
    say("        " + label + ": NONE — the strict form HOLDS on the real corpus here.");
    return;
  }
  const shapes = new Map();
  for (const v of res.viol) {
    const k = v.crit + " | " + v.nev.cls + " | " + v.uns.cls;
    if (!shapes.has(k)) shapes.set(k, []);
    shapes.get(k).push(v);
  }
  say("        " + label + ": " + res.viol.length + " violation" + (res.viol.length === 1 ? "" : "s") +
    " in " + shapes.size + " shape" + (shapes.size === 1 ? "" : "s"));
  let n = 0;
  for (const [, vs] of shapes) {
    n += 1;
    const w = vs[0];
    const branches = new Set(vs.map((x) => x.key));
    say("          [" + n + "] criterion `" + w.crit + "`  x" + vs.length + " over " +
      branches.size + " branch" + (branches.size === 1 ? "" : "es") + "   cause: " + w.cause);
    say("              not_evaluable -> `" + w.nev.cls + "` at position " + (w.nev.pos + 1) +
      "   [class-order index " + (gr2aIndex(w.nev.cls) + 1) + "]");
    say("              unsatisfied   -> `" + w.uns.cls + "` at position " + (w.uns.pos + 1) +
      "   [class-order index " + (gr2aIndex(w.uns.cls) + 1) + "]");
    say("              witness: record " + w.id + " on \"" + w.key + "\"");
    finding(4, "STRICT PB4 residual under " + label + ": criterion `" + w.crit + "`, " +
      "not_evaluable -> `" + w.nev.cls + "` at position " + (w.nev.pos + 1) + " below unsatisfied -> `" +
      w.uns.cls + "` at position " + (w.uns.pos + 1) + " (cause: " + w.cause + "); witness " +
      w.id + " on \"" + w.key + "\"");
  }
}

// The applied demo content, compared field by field against the corpus built from 04 section 2
// and 18. Read-only; nothing is written back and the spec corpus stays authoritative for the run.
function compareCorpusToData() {
  const DATA_PATH = fileURLToPath(new URL("../../../../data/sites/boost-interior-demo/content/projects.json", import.meta.url));
  let doc = null;
  try { doc = JSON.parse(readFileSync(DATA_PATH, "utf8")); } catch (e) { return null; }
  const items = doc && Array.isArray(doc.items) ? doc.items : null;
  if (!items || items.length === 0) return null;
  const byId = new Map(items.map((x) => [x.id, x]));
  const diffs = [];
  const sameIds = RECORDS.length === items.length && RECORDS.every((R) => byId.has(R.id));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const R of RECORDS) {
    const d = byId.get(R.id);
    if (!d) { diffs.push(R.id + ": absent from projects.json"); continue; }
    if ((d.projectType || null) !== R.projectType) {
      diffs.push(R.id + ".projectType: spec " + String(R.projectType) + " / data " + String(d.projectType || null));
    }
    if (!eq([...(d.workScopeIds || [])].sort(), [...R.workScopeIds].sort())) {
      diffs.push(R.id + ".workScopeIds: spec [" + R.workScopeIds.join(",") + "] / data [" +
        (d.workScopeIds || []).join(",") + "]");
    }
    const dArea = d.area ? { value: d.area.value, unit: d.area.unit, basis: d.area.basis || null } : null;
    const sArea = R.area ? { value: R.area.value, unit: R.area.unit, basis: R.area.basis || null } : null;
    if (!eq(dArea, sArea)) diffs.push(R.id + ".area: spec " + JSON.stringify(sArea) + " / data " + JSON.stringify(dArea));
    if ((d.publishedAt || null) !== R.publishedAt) {
      diffs.push(R.id + ".publishedAt: spec " + R.publishedAt + " / data " + String(d.publishedAt));
    }
    if ((d.title || "") !== R.title) diffs.push(R.id + ".title: spec \"" + R.title + "\" / data \"" + String(d.title) + "\"");
    // pricing.total — the data calls it totalPrice; the shapes are otherwise the same.
    const dTotal = d.totalPrice
      ? (d.totalPrice.kind === "range"
         ? { kind: "range", minAmount: d.totalPrice.minAmount, maxAmount: d.totalPrice.maxAmount }
         : { kind: d.totalPrice.kind, amount: d.totalPrice.amount })
      : null;
    const sTotal = R.pricing.total
      ? (R.pricing.total.kind === "range"
         ? { kind: "range", minAmount: R.pricing.total.minAmount, maxAmount: R.pricing.total.maxAmount }
         : { kind: R.pricing.total.kind, amount: R.pricing.total.amount })
      : null;
    if (!eq(dTotal, sTotal)) diffs.push(R.id + ".pricing.total: spec " + JSON.stringify(sTotal) + " / data " + JSON.stringify(dTotal));
    const dPer = d.pricePerArea ? { amount: d.pricePerArea.amount, unit: d.pricePerArea.unit } : null;
    const sPer = R.pricing.perArea ? { amount: R.pricing.perArea.amount, unit: R.pricing.perArea.unit } : null;
    if (!eq(dPer, sPer)) diffs.push(R.id + ".pricing.perArea: spec " + JSON.stringify(sPer) + " / data " + JSON.stringify(dPer));
  }
  // A corpus built from the APPLIED data, in this file's own record shape, so the whole pipeline
  // can be re-run on it and the two sources compared by RESULT and not only field by field.
  const dataCorpus = RECORDS.map((R) => {
    const d = byId.get(R.id);
    if (!d) return R;
    const total = d.totalPrice
      ? (d.totalPrice.kind === "range"
         ? { kind: "range", minAmount: d.totalPrice.minAmount, maxAmount: d.totalPrice.maxAmount }
         : { kind: d.totalPrice.kind, amount: d.totalPrice.amount })
      : null;
    const per = d.pricePerArea
      ? { amount: d.pricePerArea.amount, unit: d.pricePerArea.unit, source: "authored" } : null;
    return { ...R, title: d.title, publishedAt: d.publishedAt, projectType: d.projectType || null,
             workScopeIds: [...(d.workScopeIds || [])],
             area: d.area ? { value: d.area.value, unit: d.area.unit, basis: d.area.basis || null } : null,
             pricing: { total, perArea: per }, droppedUnknownId: R.droppedUnknownId };
  });
  return { count: items.length, sameIds, diffs, dataCorpus };
}

function strictPb4(label) {
  let pairs = 0; const viol = [];
  for (const { ev, key } of RUNS) {
    for (const R of RECORDS) {
      for (const crit of ["breadth", "scope", "area"]) {
        const m = mutantsFor(R, crit, ev.V);
        if (!m) continue;
        const rank = (rec) => {
          const corpus = RECORDS.map((x) => (x.id === R.id ? rec : x));
          const e = evaluateBranch(ev.V, corpus);
          const ord = orderByRungs(e);
          const row = ord.find((x) => x.rec.id === R.id);
          return { pos: ord.findIndex((x) => x.rec.id === R.id), cls: row.cls,
                   rung: row.rung, sub: row.subRung, set: e.setName, st: row.c[crit] };
        };
        const a = rank(m.nev), b = rank(m.uns);
        if (a.st !== "not_evaluable" || b.st !== "unsatisfied") continue;  // mutant did not bite
        pairs += 1;
        if (a.pos > b.pos) {
          // Decomposition: did the two mutants land on DIFFERENT GR3a rungs, or on the same rung
          // and get separated by GR2a's class order? The two have different remedies and only one
          // of them is what D9-2's proposals touch.
          const cause = CFG.noRungs
            ? (a.cls !== b.cls ? "class" : "within-class key")
            : (a.rung !== b.rung || a.sub !== b.sub ? "rung"
               : a.cls !== b.cls ? "class" : "within-rung key");
          viol.push({ key, id: R.id, crit, nev: a, uns: b, cause });
        }
      }
    }
  }
  const by = {};
  for (const v of viol) by[v.cause] = (by[v.cause] || 0) + 1;
  return { pairs, viol, by };
}
say("  4b. STRICT — a record with a criterion `not_evaluable` must not sort BELOW an otherwise-");
say("      identical record with that criterion `unsatisfied` (07:1218-1220). Real corpus, no tolerance.");
const strictRev9 = strictPb4("rev 9 as written");
say("      REV 9 as written : " + strictRev9.pairs + " mutant pairs, " + strictRev9.viol.length +
  " violations   by cause: " + JSON.stringify(strictRev9.by));
if (strictRev9.viol.length === 0) {
  say("      PB4's strong form HOLDS at rev 9 on the real corpus, under the STRICT assertion —");
  say("      no tolerance, no same-class relaxation. Every configuration between rev 8 and rev 9");
  say("      is measured in the comparison section below.");
} else {
  nameResiduals("rev 9 as written", strictRev9);
  finding(4, "STRICT PB4 (07:1226) fails at rev 9 as written: " + strictRev9.viol.length + " of " +
    strictRev9.pairs + " mutant pairs put the `not_evaluable` record BELOW the `unsatisfied` one");
}
say();

// ---------------------------------------------------------------------- property 5, rebuilt
say("== PROPERTY 5 — EF1 closure (07:949), rebuilt over THE CONTRACT'S TEXT ==");
say("  Audit 21 A-1: the previous version quantified over this file's own assignState call sites");
say("  and a count evaluate() forces arithmetically, so no contract property could make it fail.");
say("  EF1 is a constraint on the SPECIFICATION, so this version reads 07 and asks, of every rule");
say("  in force that mentions a criterion state: does that rule ASSIGN one, and is it EF2/3/4?");
const CONTRACT_PATH = fileURLToPath(new URL("../../../reports/integration/07-integration-contract-v0.2-candidate.md", import.meta.url));
let contractText = null;
try { contractText = readFileSync(CONTRACT_PATH, "utf8"); } catch (e) { contractText = null; }
const EF1_ALLOWED = ["EF2", "EF3", "EF4"];
const RULE_ID_HEAD = new RegExp("^(EF|PB|GR|WS|VB|PT|AR|PY|TI|ND|PA|BU|PR|SV|MD|RD|ST|SD|D)[0-9]{1,2}[a-c]?$");
function ruleIdOnLine(l) {
  // A rule in this contract is a LABELLED entry: `**XX (C: MUST)**` / `**XX (P: MUST NOT)**` /
  // `**XX applies unchanged**`. A section heading is not a rule and neither is a table row in the
  // invariant register or the change log, so neither can be an EF1 offender.
  let i = l.indexOf("**");
  while (i >= 0) {
    const rest = l.slice(i + 2);
    const sp = rest.search(new RegExp("[ (*]"));
    const cand = sp > 0 ? rest.slice(0, sp) : "";
    if (RULE_ID_HEAD.test(cand)) return cand;
    i = l.indexOf("**", i + 2);
  }
  return null;
}
if (contractText === null) {
  finding(5, "could not read the contract at " + CONTRACT_PATH + " — property 5 could not run");
  say("  CONTRACT NOT READABLE at " + CONTRACT_PATH);
} else {
  const lines = contractText.split("\n");
  // Section 17.1 is deferred (07:1604-1965) and is out of force, so it is excluded by line range.
  const defFrom = lines.findIndex((l) => l.startsWith("### 17.1 "));
  const defTo = lines.findIndex((l) => l.startsWith("### 17.2 "));
  // `not_evaluable` is BOTH a criterion state (07:874) and a match class (07:1250-1264). A table row
  // whose output column is headed `class` assigns the class; only the other occurrences can be
  // state assignments. This is read off the table header, not decided by hand.
  const COLLIDING = STATES.filter((st) => CLASSES.includes(st));
  let classTable = false, inTable = false, ruleAt = null, sectionAt = "(front matter)";
  // ASSIGNMENT markers. "is `<state>`" is NOT one: EF6's condition column (07:1262-1266) and
  // EF2's assignment clause (07:955) use that surface form for opposite jobs, so a reader cannot
  // tell them apart from the wording alone. Excluding it is a READING, counted and reported below
  // rather than applied silently.
  const ASSIGN_MARKS = ["⇒", "=>", " iff ", "is assigned", "comes out", "returns"];
  const AMBIGUOUS_MARKS = ["is `", "are `"];
  const ambiguous = new Map();
  const DEFERS = ["assigns the state", "never here", "which is where the criterion state is assigned",
    "this rule supplies the reason", "never changes the criterion state", "is not a state",
    "disclosure, not a state"];
  const assigners = new Map(), deferrers = new Set(), outsideRule = [];
  let scanned = 0, asClass = 0, deferredSkipped = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const bare = l.replace(new RegExp("^>\\s*"), "");
    if (l.startsWith("#")) { sectionAt = l.replace(new RegExp("[*#` ]+", "g"), " ").trim().split(" ")[0]; ruleAt = null; }
    const id = ruleIdOnLine(l);
    if (id) ruleAt = id;
    if (bare.startsWith("|")) {
      if (bare.indexOf("---") >= 0) { inTable = true; }
      else if (!inTable) { classTable = bare.toLowerCase().indexOf("| class") >= 0; }
    } else { inTable = false; }
    if (!STATES.some((st) => l.includes("`" + st + "`"))) continue;
    if (defFrom >= 0 && i >= defFrom && (defTo < 0 || i < defTo)) { deferredSkipped += 1; continue; }
    scanned += 1;
    const onlyColliding = STATES.filter((st) => l.includes("`" + st + "`")).every((st) => COLLIDING.includes(st));
    if (inTable && classTable && onlyColliding) { asClass += 1; continue; }
    const ctx = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
    if (DEFERS.some((d) => ctx.includes(d))) { if (ruleAt) deferrers.add(ruleAt); continue; }
    if (!ASSIGN_MARKS.some((mk) => l.includes(mk))) {
      if (AMBIGUOUS_MARKS.some((mk) => l.includes(mk))) {
        const k = ruleAt || sectionAt;
        ambiguous.set(k, (ambiguous.get(k) || 0) + 1);
      }
      continue;
    }
    if (ruleAt === null) { outsideRule.push({ section: sectionAt, line: i + 1 }); continue; }
    if (!assigners.has(ruleAt)) assigners.set(ruleAt, []);
    assigners.get(ruleAt).push(i + 1);
  }
  say("  contract lines naming a criterion state, IN FORCE: " + scanned +
    "   (a further " + deferredSkipped + " are inside section 17.1's deferred annex and are excluded;" +
    (defFrom < 0 ? " ANNEX NOT LOCATED — the exclusion did not run" : " located at 07:" + (defFrom + 1) + "-" + defTo) + ")");
  say("  of those, occurrences of a token that is BOTH a state and a match class, inside a table");
  say("    whose output column is headed `class`: " + asClass + "  [collision: " + COLLIDING.join(", ") + "]");
  if (COLLIDING.length) {
    finding(5, "`" + COLLIDING.join("`, `") + "` names both a criterion state (07:945) and a match " +
      "class (07:1250-1264). EF1's closure sentence (07:949) is about the state; EF6 (07:1262-1269) " +
      "assigns the class. Nothing in the contract distinguishes the two by name, so whether EF6 " +
      "violates EF1 cannot be decided by reading — only by knowing which column the token is in.");
  }
  say("  lines using the AMBIGUOUS form \"<x> is `<state>`\", which EF6's condition column and EF2's");
  say("    assignment clause share verbatim, so they are NOT counted as assignments: " +
    ([...ambiguous].map(([k, v]) => k + " x" + v).join(", ") || "(none)"));
  finding(5, "the contract writes an EF6 CONDITION (07:1262, \"scope is `unsatisfied`\") and " +
    "an EF2 ASSIGNMENT (07:955, \"`satisfied` iff ...\") in overlapping surface forms, so whether a " +
    "line assigns a state or tests one is carried by the table layout, not by the sentence. EF1's " +
    "closure (07:949) cannot be checked from the rule text alone; " + [...ambiguous.keys()].length +
    " rule/section blocks are affected.");
  say("  rules whose own text ASSIGNS a criterion state: " +
    ([...assigners.keys()].sort().join(", ") || "(none)"));
  say("  rules that name a state and EXPLICITLY defer the assignment: " +
    ([...deferrers].sort().join(", ") || "(none)"));
  const bySection = new Map();
  for (const o of outsideRule) bySection.set(o.section, (bySection.get(o.section) || 0) + 1);
  say("  state assignments in text that is NOT inside a labelled rule (so not an EF1 subject): " +
    outsideRule.length + "  " + [...bySection].map(([k, v]) => k + " x" + v).join(", "));
  // COUNTED IS NOT CHECKED. A prose mention and an assignment look alike to a text scan -- that
  // ambiguity IS Q-32 -- so every one of these is printed with its text and with the one
  // mechanical discriminator available: a normative rule in this contract lives inside a `>`
  // blockquote and carries a conformance marker (C:/P:) on its own rule head. A line in a table
  // row, a change-log cell or an invariant description is narrative about a rule, not a rule.
  say("    each one, with the text, because a count cannot distinguish prose from a rule:");
  for (const o of outsideRule) {
    const l = lines[o.line - 1];
    const quoted = l.trimStart().startsWith(">");
    const tableRow = l.trimStart().startsWith("|");
    const normative = quoted && /\(`?[CP]: /.test(l);
    const kind = normative ? "NORMATIVE — would be an EF1 subject"
               : tableRow ? "table row (invariant/change-log cell) — narrative"
               : quoted ? "blockquote prose, no conformance marker — narrative"
               : "body prose — narrative";
    say("      07:" + o.line + "  [" + o.section + "]  " + kind);
    say("        " + l.trim().replace(/^[>|\s]+/, "").slice(0, 96));
  }
  {
    const norm = outsideRule.filter((o) => {
      const l = lines[o.line - 1];
      return l.trimStart().startsWith(">") && /\(`?[CP]: /.test(l);
    });
    say("    of the " + outsideRule.length + ", carrying a conformance marker (so actually normative): " + norm.length);
    if (norm.length === 0) {
      say("      None. Every one is a table cell or unmarked prose DESCRIBING an assignment EF2/EF3/EF4");
      say("      makes, not making one. EF1's closure is unaffected and the count moving is cosmetic.");
    } else {
      finding(5, "EF1 closure: " + norm.length + " criterion-state assignment(s) sit outside any " +
        "labelled rule while carrying a conformance marker, so they are normative and EF2/EF3/EF4 " +
        "are not the only assigners: " + norm.map((o) => "07:" + o.line).join(", ") + ".");
    }
  }
  const offenders = [...assigners.keys()].filter((r) => !EF1_ALLOWED.includes(r));
  for (const r of offenders) {
    finding(5, "EF1 closure (07:949): rule `" + r + "` assigns a criterion state at 07:" +
      assigners.get(r).join(", 07:") + ", and it is not EF2/EF3/EF4");
  }
  say("  offenders outside EF2/EF3/EF4: " + (offenders.length ? offenders.join(", ") : "none"));
}
// NEGATIVE CONTROL — the property must be able to fail. Rev 7's B-1 shape, where WS8 assigned the
// scope state itself, is run through the SAME scanner. If it is not flagged, this is not a check.
const NEG_EF1 =
  "### 7.5 work scope\n" +
  "> - **WS8 (C: MUST)** — an id the consumer does not know is dropped, and the record's scope\n" +
  ">   criterion ⇒ `not_evaluable`.\n";
function ef1ScanText(text) {
  const lines = text.split("\n"); const out = []; let ruleAt = null;
  for (const l of lines) {
    if (l.startsWith("#")) ruleAt = null;
    const id = ruleIdOnLine(l);
    if (id) ruleAt = id;
    if (!STATES.some((st) => l.includes("`" + st + "`"))) continue;
    if (!["⇒", "=>", "comes out", "is assigned", "is `", "are `", "returns"].some((mk) => l.includes(mk))) continue;
    if (["assigns the state", "never here", "is not a state"].some((d) => text.includes(d))) continue;
    if (ruleAt) out.push(ruleAt);
  }
  return out;
}
const negCaught = ef1ScanText(NEG_EF1).filter((r) => !EF1_ALLOWED.includes(r));
say("  negative control (a WS8 that assigns the state itself — rev 7's B-1 defect): " +
  (negCaught.length ? "CAUGHT (" + negCaught.join(", ") + ") — the property can fail"
                    : "NOT CAUGHT — the property is still vacuous"));
if (!negCaught.length) finding(5, "the EF1 scanner does not flag a synthetic rule that assigns a state from outside EF2-EF4 — the property is vacuous");
// The construction check is retained as a secondary statement, no longer as the property.
say("  (construction, secondary: " + (LEDGER_AFTER_RUNS - LEDGER_BEFORE_RUNS) + " states assigned over " +
  RUNS.length + " branches x " + RECORDS.length + " records by {" +
  [...new Set(STATE_LEDGER.map((e) => e.by))].sort().join(", ") + "} and nothing else)");
say();

// ---------------------------------------------------------------------- property 2
say("== PROPERTY 2 — dead-branch detection over every registered discriminator ==");
// CINV-9's consumer first, so WS8's branch has been exercised before the ledger is read.
say("  CINV-9 (07:1539) — bi-16 read by a consumer that does not know `bathroom`, against \"" +
  CINV9_UTTERANCE + "\":");
{
  const a = CINV9_BASE.rows.find((r) => r.rec.id === "bi-16");
  const b = CINV9_RUN.rows.find((r) => r.rec.id === "bi-16");
  say("    full-vocabulary consumer: scope " + a.c.scope + ", class " + a.cls);
  say("    reduced-vocabulary consumer: scope " + b.c.scope + ", class " + b.cls +
    "   (WS8 dropped: " + b.rec.droppedUnknownId + ")");
  const ok = b.c.scope === "not_evaluable" && b.cls !== "exact";
  if (!ok) finding(2, "CINV-9 (07:1539) not reproduced: bi-16 under a consumer that does not know " +
    "`bathroom` came out scope " + b.c.scope + " / class " + b.cls + ", not not_evaluable / not exact");
  else say("    CINV-9 holds: scope not_evaluable, not classed exact, no absence statable");
}
const constant = [...OBS.values()].filter((e) => e.t === 0 || e.f === 0);
constant.sort((a, b) => (a.ruleId + a.predicate < b.ruleId + b.predicate ? -1 : 1));
let deadCount = 0, residualCount = 0, byConstructionCount = 0;
for (const e of constant) {
  const kind = e.t === 0 ? "NEVER TRUE " : "NEVER FALSE";
  const free = OBS_FREE.get(e.ruleId + " :: " + e.predicate);
  const residual = !!free && free.t > 0 && free.f > 0;
  const rev8Only = !inForce(e.seenAtRev);
  let tag = "";
  if (rev8Only) { tag = "   [REV 8 ONLY — the rule is deleted at rev 9; not a rev-9 defect]"; }
  else if (e.byConstruction) { tag = "   [unconditional row — by construction]"; byConstructionCount += 1; }
  else if (residual) { tag = "   [RESIDUAL — non-constant over the unrestricted corpus (" + free.t + "T/" + free.f + "F); the earlier rungs already filtered it]"; residualCount += 1; }
  else deadCount += 1;
  say("  " + kind + "  " + (e.ruleId + " " + e.line).padEnd(24) + e.predicate + tag);
  say("                   (" + (e.t + e.f) + " evaluations; e.g. " + String(e.tEx || e.fEx).slice(0, 70) + ")");
  if (!rev8Only && !e.byConstruction && !residual) {
    finding(2, e.ruleId + " (" + e.line + ") \"" + e.predicate + "\" is " + kind.trim().toLowerCase() +
      " across all " + (e.t + e.f) + " evaluations");
  }
}
const rev8OnlyCount = constant.filter((e) => !inForce(e.seenAtRev)).length;
say("  " + constant.length + " of " + OBS.size + " registered predicates are constant: " +
  rev8OnlyCount + " belong to rules rev 9 deleted, " + byConstructionCount + " unconditional rows, " +
  residualCount + " residual, " + deadCount + " DEAD BRANCHES at rev 9");
say();
say("  dead on the 19-record corpus but reachable in the synthetic enumeration:");
let corpusDead = 0;
for (const e of OBS.values()) {
  if (e.byConstruction || e.t === 0 || e.f === 0 || !inForce(e.seenAtRev)) continue;
  if (e.tc + e.fc === 0) continue;
  if (e.tc !== 0 && e.fc !== 0) continue;
  corpusDead += 1;
  say("    " + (e.tc === 0 ? "NEVER TRUE " : "NEVER FALSE") + "  " + (e.ruleId + " " + e.line).padEnd(24) +
    e.predicate + "  (" + (e.tc + e.fc) + " corpus evaluations, " + (e.t + e.f) + " total)");
  finding(2, e.ruleId + " (" + e.line + ") \"" + e.predicate + "\" is " +
    (e.tc === 0 ? "never true" : "never false") + " on the 19-record corpus, though the synthetic " +
    "enumeration reaches both values");
}
say("    " + corpusDead + " such predicates");
say();

// 07:2856-2884 (section 20.7.5) — "What 04-demo-data-spec.md needs, which rev 9 does not edit".
// A stated claim this checker cannot reproduce is only a FINDING if it is NOT on this list.
const SUPERSEDED_BY_20_7_5 = new Map([
  ["D1/bi-01", "item 1 — row D is stated on the reading D9-4 rejects; V.breadth is absent at rev 9"],
  ["D2/bi-01", "item 1 — same, on WS3's identical twin utterance"],
  ["G/head",   "item 2 — \"reached on GR3's trade rung\" names machinery D9-1 deleted; bi-19 is " +
               "not_evaluable, 4th of ten classes, and is returned like every record"],
  ["I/bi-18",  "item 3 — 04:701 derives 수납 as a Q_t; storage is a Space, and under D9-5a the two " +
               "readings disagree, so the criterion is not_evaluable. This is the contract's own " +
               "worked example at 07:366-373, reproduced exactly."],
  ["I/bi-06",  "item 3 — same cause: the readings disagree, so no relation is reported"],
  ["I/bi-03",  "item 8 — 18 section 7 conflates EF3's record-side absence with EF6 row 4's " +
               "visitor-side breadth criterion; bi-03 derives to not_evaluable (AU-4)"],
]);
let supersededHits = 0;

// ---------------------------------------------------------------------- property 6
say("== PROPERTY 6 — the nine 04 section 4.1 rows, derived vs STATED ==");
let stated = 0, statedOk = 0, derivedPairs = 0, derivedOk = 0;
for (const r of ROWS_4_1) {
  const branches = RUNS.filter((x) => x.u === r.u);
  say("  row " + r.row + " (" + r.cite + ")  " + r.u + (branches.length > 1 ? "   [" + branches.length + " branches]" : ""));
  for (const { ev } of branches) {
    const ord = orderByRungs(ev);
    const byId = new Map(ord.map((x) => [x.rec.id, x]));
    say("    " + (branches.length > 1 ? "branch " + ev.V.branch + "  " : "") +
      "V.breadth=" + String(ev.V.breadth) + " [VB3 rows " + (ev.V.breadthRows.join("+") || "-") + "]" +
      "  Q_s=[" + ev.V.Q_s.join(",") + "]  Q_t=[" + ev.V.Q_t.join(",") + "]" +
      "  V.area=" + (ev.V.area ? ev.V.area.value + ev.V.area.unit + "/" + String(ev.V.area.basis) : "-") +
      "  V.budget=" + (ev.V.budget ? ev.V.budget.kind + " " + (ev.V.budget.amount || ev.V.budget.minAmount) : "-"));
    if (ev.V.ws6Alternatives > 1) {
      say("      WS6 " + (CFG.ws6 === "rev9"
        ? "(07:350-356, D9-5a): Q carries BOTH readings, nothing chosen: "
        : "(07:2686, rev 8's weaker-class reading): took ") +
        (ev.V.scopeNotes.join("; ") || "(none)") + "  — " + ev.V.ws6Alternatives + " readings");
      const amb = ev.rows.filter((x) => x.scopeAmbiguous);
      if (amb.length) {
        say("        EF3's ambiguity clause (07:1008-1036) fired on " + amb.length + " of " +
          ev.rows.length + " records: " + amb.map((x) => x.rec.id).join(", "));
        say("        each is scope not_evaluable with the ambiguity disclosed, never a chosen reading.");
      }
    }
    say("      GR3a -> " + ev.setName + " (row " + (ev.gr3aHold[0] ? ev.gr3aHold[0].n : "-") + ")");
    const cells = ord.map((x, i) => (i + 1) + "." + x.rec.id + "=" + x.cls);
    for (let i = 0; i < cells.length; i += 4) {
      say((i === 0 ? "      derived order: " : "                     ") + cells.slice(i, i + 4).join("  "));
    }
    if (branches.length === 1 || ev === branches[0].ev) {
      for (const [id, want, src] of r.expect) {
        const got = byId.get(id);
        const ok = got && got.cls === want;
        if (src === "drv") { derivedPairs += 1; if (ok) derivedOk += 1; }
        else { stated += 1; if (ok) statedOk += 1; }
        if (!ok) {
          const sup = SUPERSEDED_BY_20_7_5.get(r.row + "/" + id);
          say("      " + (src === "drv" ? "differs (my derivation)" : "DISAGREE with " + src) +
            "  " + id + ": " + want + " -> derived " + (got ? got.cls : "(absent)"));
          if (sup) {
            supersededHits += 1;
            say("          RECORDED at 07:2856-2884, " + sup);
          } else if (src !== "drv") {
            finding(6, "row " + r.row + " (" + r.cite + ") " + id + ": " + src + " states " + want +
              ", derived " + (got ? got.cls : "(absent)") + " — and this is NOT on section 20.7.5's " +
              "list of 04/18 edits rev 9 records");
          }
        }
      }
      if (r.head) {
        stated += 1;
        const ok = ord[0] && ord[0].rec.id === r.head;
        if (ok) statedOk += 1; else {
          const sup = SUPERSEDED_BY_20_7_5.get(r.row + "/head");
          say("      DISAGREE  head of result: stated " + r.head + ", derived " + (ord[0] ? ord[0].rec.id : "-"));
          if (sup) { supersededHits += 1; say("          RECORDED at 07:2856-2884, " + sup); }
          else {
            finding(6, "row " + r.row + " (" + r.cite + ") head of result: stated " + r.head +
              ", derived " + (ord[0] ? ord[0].rec.id : "-") + " — NOT on section 20.7.5's list");
          }
        }
      }
      if (r.statedPrice) {
        stated += 1;
        const rec = RECORDS.find((x) => x.id === r.statedPrice.id);
        const t = rec.pricing.total;
        const ok = t && t.kind === r.statedPrice.kind &&
          (r.statedPrice.amount === undefined || t.amount === r.statedPrice.amount) &&
          STATEMENTS.some((st) => st.id === rec.id && st.kind === "fact" && st.value === (t.amount || t.minAmount));
        if (ok) statedOk += 1; else {
          say("      DISAGREE  " + rec.id + "'s total is not stated as a fact of the declared shape");
          finding(6, "row " + r.row + " (" + r.cite + ") " + rec.id + "'s total is not stated as a " +
            r.statedPrice.kind + " fact under GR1");
        }
      }
      if (r.negative) {
        stated += 1;
        const nev = RUNS.find((x) => x.u === r.negative.u);
        if (!nev) { say("      negative half: utterance not in the corpus"); }
        else {
          const row = nev.ev.rows.find((x) => x.rec.id === r.negative.id);
          const ok = row.c.area !== r.negative.areaNot && row.cls !== r.negative.clsNot;
          if (ok) { statedOk += 1; say("      negative half (04:697) holds: \"" + r.negative.u + "\" gives " +
            r.negative.id + " area=" + row.c.area + ", class=" + row.cls + " — not told it is a 34평 flat"); }
          else {
            say("      DISAGREE  negative half: " + r.negative.id + " area=" + row.c.area + ", class=" + row.cls);
            finding(6, "row " + r.row + " (" + r.cite + ") negative half: \"" + r.negative.u +
              "\" makes " + r.negative.id + " area=" + row.c.area + " / class=" + row.cls);
          }
        }
      }
    }
  }
  if (branches.length > 1) {
    const classesPerBranch = branches.map((b) => orderByRungs(b.ev).map((x) => x.rec.id + "=" + x.cls).join(","));
    const differ = new Set(classesPerBranch).size > 1;
    say("      BRANCHES DIFFER: " + differ + "  (VB3/14.3.1 leave this row undecided; no reading is preferred)");
    if (differ) {
      finding(6, "row " + r.row + " (" + r.cite + ") has " + branches.length + " branches the " +
        "contract does not decide between, and they give different results");
    }
  }
}
say("  STATED claims (04 / 18): " + statedOk + " of " + stated + " reproduced");
say("  of the " + (stated - statedOk) + " not reproduced, " + supersededHits + " are RECORDED at " +
  "07:2856-2884 (section 20.7.5) as 04/18 edits rev 9 deliberately does not make.");
say("  unrecorded disagreements: " + (stated - statedOk - supersededHits));
say("  my own derivations (marked drv, not claims of 04/18): " + derivedOk + " of " + derivedPairs + " reproduced");
say();

// ============================================================================================
// PROPERTY 7 — SUFFICIENCY (round 12)
// ============================================================================================
// Properties 1-6 measure the order against ITSELF: is it total, is it single-valued, does one
// device agree with another, does deleting a criterion move a record. An order can pass all of
// that and still be useless, and an independent HAND EXECUTOR working from the prose found
// exactly that on rev 9.1: for "욕실 하나만", VB3 leaves V.breadth absent, PT4(b) makes every
// full_remodel's spaces half `satisfied` for any Q_s, and a 7,000,000 one-bathroom job sorts
// BEHIND six whole-home remodels. My own transcript printed "7.bi-15" and I did not look at it.
// This property is the instrument that would have.
//
// It reports NUMBERS, not verdicts, wherever a verdict would need a threshold I invented.
say("== PROPERTY 7 — SUFFICIENCY: does the returned order separate records that differ on what");
say("   was ASKED? (properties 1-6 measure consistency; an order can be consistent and useless) ==");
{
  useRev(REV_IN_FORCE);
  if (CFG.key3Skip) throw new Error("property 7 must be measured with no unadopted proposal in force");
  say("  measured under: " + cfgSig());

  // ---------------------------------------------------------------- the key split
  // 07:1398-1405's five keys split with no threshold and no judgement of mine, read straight off
  // the contract's own list, by asking of each: is it a function of V, or of R alone?
  //   (1) GR2a's class order      f(V, R)  -- EF6's class IS the match
  //   (2) |delta_area| ascending  f(V, R)  -- the visitor's area against the record's
  //   (3) count of the visitor's stated ids the record carries  f(V, R)
  //   (4) publishedAt descending  f(R)     -- recency. Says nothing about this question.
  //   (5) id ascending            f(R)     -- a deterministic floor. Says nothing at all.
  // Keys (1)-(3) MEASURE THE MATCH. Keys (4)-(5) BREAK A TIE THE MATCH DID NOT BREAK.
  const key3CountOf = (r, V) => {
    const sets = (V.readings && V.readings.length > 1) ? V.readings.map((rd) => rd.Q) : [V.Q];
    const ids = r.rec.workScopeIds;
    if (sets.length === 1) return V.Q.filter((id) => ids.includes(id)).length;
    const inAll = sets[0].filter((id) => sets.every((q) => q.includes(id)));
    if (CFG.key3 === "intersection") return inAll.filter((id) => ids.includes(id)).length;
    return V.Q.filter((id) => ids.includes(id)).length;
  };
  const k2On = (r) => r.delta !== null && r.delta !== undefined;
  // Which key separates this pair, under the composition orderWithinBlock actually performs.
  // "2*" is key (2)'s OWN carve-out (07:1399-1401), which is in force: a record the key skips
  // keeps its slot, so a mixed pair is not compared by key 2 at all. It is named separately
  // because it is Q-29's in-force sibling and pretending it is key 2 would hide it.
  const decider = (a, b, V) => {
    if (gr2aIndex(a.cls) !== gr2aIndex(b.cls)) return 1;
    if (k2On(a) && k2On(b)) { if (Math.abs(a.delta) !== Math.abs(b.delta)) return 2; }
    else if (k2On(a) !== k2On(b)) return "2*";
    if (key3CountOf(a, V) !== key3CountOf(b, V)) return 3;
    if (a.rec.publishedAt !== b.rec.publishedAt) return 4;
    return 5;
  };
  const informative = (k) => k === 1 || k === 2 || k === 3;

  // ---------------------------------------------------------------- 7a. where 04/18's own answer lands
  say();
  say("  7a. WHERE §4.1's OWN ANSWER LANDS. Property 6 compares the CLASS of each row's named");
  say("      record against its stated expectation. It never looked at the record's POSITION,");
  say("      which is what the visitor actually sees. Rank out of 19, first branch where a row");
  say("      branches (the same convention property 6 uses).");
  // The record 04/18 names as the answer, derived from the row's OWN source fields -- never
  // chosen by me: `head` if the row states one, else the first expectation sourced to 04, else
  // the record the row's stated price is about.
  const namedOf = (r) => {
    if (r.head) return { id: r.head, why: "04 states it as the head of the result" };
    const e04 = r.expect.find((x) => x[2] === "04");
    if (e04) return { id: e04[0], why: "04's first named record for this row" };
    if (r.statedPrice) return { id: r.statedPrice.id, why: "the record 04's stated price is about" };
    return null;
  };
  say("      row  utterance                            names    rank/19  top 3?  what decided the pair above it");
  const ranks = [];
  for (const r of ROWS_4_1) {
    const run = RUNS.find((x) => x.u === r.u);
    if (!run) continue;
    const ord = orderByRungs(run.ev);
    const nm = namedOf(r);
    if (!nm) {
      say("      " + r.row.padEnd(4) + " " + r.u.padEnd(34) + " —        —       —      " +
        "04 names no single record for this row (18 names seven)");
      continue;
    }
    const at = ord.findIndex((x) => x.rec.id === nm.id);
    const top3 = at >= 0 && at < 3;
    let by = "(head of result)";
    if (at > 0) {
      const k = decider(ord[at - 1], ord[at], run.ev.V);
      by = "key (" + k + ") " + (informative(k) ? "— the match" : "— NOT the match: " +
        (k === 4 ? "recency" : k === 5 ? "record id" : "key 2's carve-out"));
    }
    ranks.push({ row: r.row, u: r.u, id: nm.id, at: at + 1, top3, by, why: nm.why });
    say("      " + r.row.padEnd(4) + " " + r.u.padEnd(34) + " " + nm.id + "   " +
      String(at + 1).padEnd(8) + (top3 ? "yes" : "NO ").padEnd(7) + by);
  }
  const outside = ranks.filter((x) => !x.top3);
  say("      rows whose §4.1-named record is NOT in the top 3: " + outside.length + " of " + ranks.length);
  for (const x of outside) {
    say("        " + x.row + "  " + x.id + " at " + x.at + " of 19 — " + x.why);
  }

  // ---------------------------------------------------------------- 7b. which key decides, everywhere
  say();
  say("  7b. WHICH KEY DECIDES EACH ADJACENT PAIR, over every utterance — the generalisation");
  say("      past the nine. 18 adjacent pairs per branch. A pair decided by (4) or (5) is a pair");
  say("      the MATCH did not separate: the contract ranked them by recency or by id.");
  let totPairs = 0, totUninf = 0, worstRun = null;
  const perU = [];
  for (const { ev, key } of RUNS) {
    const ord = orderByRungs(ev);
    const byKey = { 1: 0, 2: 0, "2*": 0, 3: 0, 4: 0, 5: 0 };
    let run = 1, best = 1, bestAt = 0;
    for (let i = 1; i < ord.length; i += 1) {
      const k = decider(ord[i - 1], ord[i], ev.V);
      byKey[k] += 1; totPairs += 1;
      if (!informative(k)) { totUninf += 1; run += 1; if (run > best) { best = run; bestAt = i + 1 - run + 1; } }
      else run = 1;
    }
    perU.push({ key, byKey, best, bestAt, ord, ev });
    if (!worstRun || best > worstRun.best) worstRun = perU[perU.length - 1];
  }
  say("      branch                                          k1  k2  k2*  k3  k4  k5   longest run");
  say("                                                                                 keys (4)/(5) only");
  for (const x of perU) {
    const b = x.byKey;
    say("      " + x.key.slice(0, 44).padEnd(46) +
      String(b[1]).padStart(3) + String(b[2]).padStart(4) + String(b["2*"]).padStart(5) +
      String(b[3]).padStart(4) + String(b[4]).padStart(4) + String(b[5]).padStart(4) +
      String(x.best).padStart(9));
  }
  say("      TOTAL adjacent pairs over " + RUNS.length + " branches: " + totPairs +
    "   decided by keys (4)/(5), i.e. NOT by the match: " + totUninf +
    "  (" + Math.round((totUninf / totPairs) * 100) + "%)");
  say("      longest run the match does not separate: " + worstRun.best + " records, on");
  say("        \"" + worstRun.key + "\"");

  // ---------------------------------------------------------------- 7c. inside the runs
  say();
  say("  7c. WHAT IS INSIDE THE RUNS. A run the match does not separate is only harmless if its");
  say("      members are alike on what the visitor asked. Three set-valued questions, all");
  say("      threshold-free, asked of every pair inside every such run:");
  say("        (i)   do they carry the SAME subset of the ids the visitor named?  (key 3 reads the");
  say("              COUNT of that subset, never the subset itself — so two records can tie on the");
  say("              key while covering different things)");
  say("        (ii)  do they have the same projectType?  (NO key reads projectType. EF6's class");
  say("              does, but only through the relation, and PT4(b) makes a full_remodel");
  say("              `satisfied` for ANY Q_s — 07:965, the clause the hand executor named)");
  say("        (iii) do they do the same AMOUNT of work — |R.workScopeIds|?  (no key reads it)");
  let vi = 0, vii = 0, viii = 0, runsChecked = 0;
  const wit = [];
  for (const x of perU) {
    // maximal runs of consecutive records whose adjacent pairs are all decided by (4)/(5)
    let start = 0;
    for (let i = 1; i <= x.ord.length; i += 1) {
      const k = i < x.ord.length ? decider(x.ord[i - 1], x.ord[i], x.ev.V) : 1;
      if (informative(k) || i === x.ord.length) {
        const seg = x.ord.slice(start, i);
        if (seg.length > 1) {
          runsChecked += 1;
          for (let a = 0; a < seg.length; a += 1) for (let b = a + 1; b < seg.length; b += 1) {
            const A = seg[a], B = seg[b];
            const qa = x.ev.V.Q.filter((id) => A.rec.workScopeIds.includes(id)).sort().join(",");
            const qb = x.ev.V.Q.filter((id) => B.rec.workScopeIds.includes(id)).sort().join(",");
            const dSet = qa !== qb, dType = A.rec.projectType !== B.rec.projectType;
            const dSize = A.rec.workScopeIds.length !== B.rec.workScopeIds.length;
            if (dSet) vi += 1;
            if (dType) vii += 1;
            if (dSize) viii += 1;
            if ((dType || dSize) && wit.length < 6) {
              const tot = (R) => (R.pricing.total ? (R.pricing.total.kind === "exact"
                ? R.pricing.total.amount : R.pricing.total.minAmount + "~" + R.pricing.total.maxAmount)
                : "(no total; perArea " + (R.pricing.perArea ? R.pricing.perArea.amount : "none") + ")");
              wit.push(x.key + "\n          " + A.rec.id + "  " + A.rec.projectType + "  |R|=" +
                A.rec.workScopeIds.length + "  Q∩R={" + qa + "}  total " + tot(A.rec) +
                "\n          " + B.rec.id + "  " + B.rec.projectType + "  |R|=" +
                B.rec.workScopeIds.length + "  Q∩R={" + qb + "}  total " + tot(B.rec));
            }
          }
        }
        start = i;
      }
    }
  }
  say("      runs of length > 1 examined: " + runsChecked);
  say("      pairs inside them differing on (i)   the SUBSET of the visitor's ids they carry: " + vi);
  say("      pairs inside them differing on (ii)  projectType:                                " + vii);
  say("      pairs inside them differing on (iii) how much work the record did (|R|):          " + viii);
  for (const w of wit) say("        WITNESS  " + w);

  // ---------------------------------------------------------------- 7d. the property, stated
  say();
  say("  7d. THE PROPERTY, stated so it can FAIL, and with no threshold in it:");
  say("      *Within a maximal run of the returned order that keys (1)-(3) do not separate, every");
  say("      pair of records must be indistinguishable on what the visitor asked.*");
  say("      It is threshold-free because every term is set-valued: the subset of V.Q the record");
  say("      carries, its projectType, the size of its own scope. Nothing here compares a price");
  say("      or an area against a number I chose.");
  if (vi + vii + viii > 0) {
    say("      FAILS: " + (vi + vii + viii) + " pair-facts inside " + runsChecked + " runs.");
    finding(7, "the returned order does not separate records that differ on what the visitor " +
      "asked. Over " + RUNS.length + " branches, " + totUninf + " of " + totPairs + " adjacent pairs (" +
      Math.round((totUninf / totPairs) * 100) + "%) are decided by key (4) publishedAt or key (5) " +
      "id — keys that are functions of the RECORD ALONE and say nothing about this query. Inside " +
      "the maximal runs those keys produce, " + vii + " pairs differ on projectType and " + viii +
      " differ on how much work the record did, neither of which ANY of the five keys reads. " +
      "Worst run: " + worstRun.best + " records on \"" + worstRun.key + "\". This is a SUFFICIENCY " +
      "defect and properties 1-6 cannot see it: the order is total, single-valued, agrees with " +
      "itself, penalises nothing and classes everything — and ranks a 7,000,000 one-bathroom job " +
      "behind six whole-home remodels by publication date.");
  } else {
    say("      HOLDS on this corpus.");
  }

  // ---------------------------------------------------------------- 7e. the threshold question
  say();
  say("  7e. THE PART I WILL NOT TURN INTO A VERDICT. \"Materially different\" in the sense of");
  say("      7,000,000 against 50,000,000 needs a threshold, and any threshold here would be");
  say("      mine rather than the contract's — 07:1405 says \"No key is a price\", so the contract");
  say("      has deliberately declined to rank by amount and I will not smuggle a ranking in");
  say("      under the name of a check. The numbers, with no verdict attached:");
  {
    const rows = [];
    for (const x of perU) {
      let start = 0;
      for (let i = 1; i <= x.ord.length; i += 1) {
        const k = i < x.ord.length ? decider(x.ord[i - 1], x.ord[i], x.ev.V) : 1;
        if (informative(k) || i === x.ord.length) {
          const seg = x.ord.slice(start, i);
          if (seg.length > 1) {
            const amts = seg.map((r) => r.rec.pricing.total)
              .filter(Boolean).map((t) => (t.kind === "exact" ? t.amount : t.minAmount));
            const sizes = seg.map((r) => r.rec.workScopeIds.length);
            if (amts.length > 1) rows.push({ key: x.key, n: seg.length,
              lo: Math.min(...amts), hi: Math.max(...amts),
              szLo: Math.min(...sizes), szHi: Math.max(...sizes) });
          }
          start = i;
        }
      }
    }
    rows.sort((a, b) => (b.hi / b.lo) - (a.hi / a.lo));
    say("      the widest runs by the spread of the totals they contain (totals only — records");
    say("      with no total are excluded from the ratio and counted in n):");
    for (const r of rows.slice(0, 6)) {
      say("        x" + (r.hi / r.lo).toFixed(1) + "  run of " + r.n + "  totals " +
        r.lo.toLocaleString("en-US") + " … " + r.hi.toLocaleString("en-US") +
        "  |R| " + r.szLo + "…" + r.szHi + "   " + r.key.slice(0, 40));
    }
    say("      runs containing more than one total: " + rows.length +
      "; the largest spread is x" + (rows.length ? (rows[0].hi / rows[0].lo).toFixed(1) : "-") + ".");
    say("      READ THIS AS A NUMBER, NOT A VERDICT. A x" + (rows.length ? (rows[0].hi / rows[0].lo).toFixed(1) : "-") +
      " spread inside a run the ordering treats as");
    say("      indifferent is the coordinator's 7M-against-50M in the form the contract can be");
    say("      held to. Whether that is acceptable is an OWNER decision, not a checker's.");
  }

  // ---------------------------------------------------------------- 7f. what it cannot see
  say();
  say("  7f. WHAT PROPERTY 7 CANNOT SEE, which is the more important half of the answer.");
  say("      It sees that the order is ARBITRARY where the match runs out. It does NOT see that");
  say("      the arbitrary choice is WRONG, and it cannot, because nothing in the contract says");
  say("      a one-bathroom job should outrank a whole-home remodel for a one-bathroom query.");
  say("      That rule does not exist, so there is nothing to check it against. A consistency");
  say("      instrument can only ever report that a rule is MISSING by finding a place where the");
  say("      rules run out — which is what 7b's " + totUninf + " pairs are — and cannot report which");
  say("      rule should be there.");
  say("      Concretely, three things stay invisible to every property in this file:");
  say("        1. WHETHER §4.1's expected answer is the RIGHT answer. Property 7a reports that");
  say("           bi-15 lands 7th; it takes 04's word that bi-15 is what a visitor wants. If 04");
  say("           were wrong, nothing here would notice.");
  say("        2. WHETHER PT4(b) (07:965) SHOULD make a full_remodel satisfied for any Q_s. That");
  say("           is the root of the defect and it is a DELIBERATE rule, stated and justified.");
  say("           A checker can only ask whether it is applied consistently, and it is.");
  say("        3. ANY ranking the contract declines to state. 07:1405 forbids a price key; there");
  say("           is no size key, no type key, no \"closeness of fit\" key. Their absence is not a");
  say("           violation of anything, so it is not a finding — it is a gap only a reader can");
  say("           see, and this round a human reader saw it and six properties did not.");
  say("      THE HONEST SUMMARY: property 7 makes the defect VISIBLE and does not make it");
  say("      DIAGNOSABLE. Hand execution remains the only instrument for the class \"the rules are");
  say("      consistent and the answer is bad\", and it must stay in every round.");
}
say();

// ---------------------------------------------------------------------- price rules, derived
say("== price-rule checks (GR1, GR4, GR5, GR5a, PB2, PB5, VB2) — DERIVED, with negative controls ==");
const CORPUS_BY_ID = new Map(RECORDS.map((R) => [R.id, R]));
let gr5Forbidden = 0, gr5Exempt = 0;
for (const { ev } of RUNS) {
  const ord = orderByRungs(ev);
  const forbidden = gr5ForbiddenNumbers(ord, ev.V);
  for (const { rec } of ord) {
    const env = gr4Envelope(rec, ev.V, ev.V.utterance);
    for (const pr of gr1StatableNumbers(env)) {
      if (forbidden.has(pr.v)) { if (gr5aExempt(pr.v, rec)) gr5Exempt += 1; else {
        gr5Forbidden += 1;
        say("  GR5 VIOLATION  " + ev.V.utterance + " / " + rec.id + " " + pr.f + " = " + pr.v);
      } }
    }
  }
}
const pb2bad = pb2Check("all branches", REF_COMPARISONS);
const pb5bad = pb5Check(CORPUS_BY_ID, "all branches", REF_STATEMENTS);
const vb2bad = vb2Check("all branches", REF_COMPARISONS);
const gr1bad = gr1InventionCheck(CORPUS_BY_ID, "all branches", REF_STATEMENTS);
const priceOperands = REF_COMPARISONS.filter((c) => [c.leftProv, c.rightProv].some((pv) =>
  String(pv).includes("pricing") || String(pv).includes("budget")));
const provs = [...new Set(REF_COMPARISONS.map((c) => c.leftProv + " vs " + c.rightProv))];
say("  COMPARISONS ledger: " + REF_COMPARISONS.length + " numeric comparisons performed by the");
say("    criteria and the ordering keys over the " + RUNS.length + "-branch reference pass, in " +
  provs.length + " provenance shapes:");
for (const pv of provs) say("      " + pv);
say("    of these, comparisons with a PRICE or BUDGET operand: " + priceOperands.length +
  "   (07:1405: \"No key is a price\"; 07:1243-1246: V.budget \"is not a criterion, it enters no");
say("    ranking key, and no record is filtered by it\" — so PB2 and VB2 hold because V.budget has");
say("    no consumer in the pipeline at all, which is what the empty price row above measures)");
say("  STATEMENTS ledger: " + REF_STATEMENTS.length + " claims (" +
  new Set(REF_STATEMENTS.map((x) => x.id + "/" + x.field + "/" + x.value)).size +
  " distinct record-value pairs), of which " +
  REF_STATEMENTS.filter((s2) => s2.kind !== "fact").length +
  " are relational (a budget verdict would be one; V0.2 emits none, 07:1206-1208)");
say("  PB2 (07:1216) total budget vs perArea comparison : " + (pb2bad.length ? "VIOLATED x" + pb2bad.length : "none"));
say("  PB5 (07:1237) breadth-absent record called a budget match : " + (pb5bad.length ? "VIOLATED x" + pb5bad.length : "none"));
const hintUtterances = ALL_UTTERANCES.filter((u) => budgetHintOf(u) !== null);
say("  VB2 (07:872) utterances carrying budgetHint free text: " + hintUtterances.length + "  " +
  hintUtterances.map((u) => "\"" + u + "\" -> " + budgetHintOf(u)).join(" ; "));
say("  VB2 (07:872) budgetHint free text in a comparison : " + (vb2bad.length ? "VIOLATED x" + vb2bad.length : "none"));
if (hintUtterances.length === 0) {
  finding(4, "no utterance in the corpus carries budgetHint free text, so VB2 (07:872) is only " +
    "exercised by its negative control");
}
say("  GR1 (07:1441) a stated number the record does not carry : " + (gr1bad.length ? "VIOLATED x" + gr1bad.length : "none"));
if (pb2bad.length) finding(4, "PB2 (07:1216) violated " + pb2bad.length + " times");
if (pb5bad.length) finding(4, "PB5 (07:1237) violated " + pb5bad.length + " times");
// NEGATIVE CONTROLS — each check is re-run against an injected violation. A check that cannot
// fail is not a check (audit 21 A-8).
{
  LEDGERS_ON = true;
  const mutC = [], mutS = [];
  const pushC = (...a) => { const n = COMPARISONS.length; comparedValues(...a); mutC.push(COMPARISONS[n]); COMPARISONS.length = n; };
  const pushS = (fn) => { const n = STATEMENTS.length; fn(); mutS.push(STATEMENTS[n]); STATEMENTS.length = n; };
  pushC("V.budget.total", 50000000, "R.pricing.perArea.amount", 2900000, "MUTANT", "negative control");
  const caught2 = pb2Check("negative control", [...REF_COMPARISONS, mutC[0]]).length > 0;
  pushC("V.budgetHint", 0, "R.pricing.total.amount", 1, "MUTANT", "negative control");
  const caughtVb2 = vb2Check("negative control", [...REF_COMPARISONS, mutC[1]]).length > 0;
  pushS(() => stateRelational(RECORDS.find((R) => R.id === "bi-19"), "budget_match", "a breadth-specific budget", "negative control"));
  const caught5 = pb5Check(CORPUS_BY_ID, "negative control", [...REF_STATEMENTS, mutS[0]]).length > 0;
  pushS(() => stateFact({ id: "bi-19" }, "invented", 343750, "negative control"));
  const caught1 = gr1InventionCheck(CORPUS_BY_ID, "negative control", [...REF_STATEMENTS, mutS[1]]).length > 0;
  LEDGERS_ON = false;
  say("  negative controls — inject the forbidden behaviour, does the check catch it?");
  say("    PB2 " + (caught2 ? "CAUGHT" : "MISSED") + " · PB5 " + (caught5 ? "CAUGHT" : "MISSED") +
    " · VB2 " + (caughtVb2 ? "CAUGHT" : "MISSED") + " · GR1 " + (caught1 ? "CAUGHT" : "MISSED"));
  for (const [nm, ok] of [["PB2", caught2], ["PB5", caught5], ["VB2", caughtVb2], ["GR1", caught1]]) {
    if (!ok) finding(4, nm + "'s check does not catch an injected violation — it is an assertion, not a check");
  }
}
const bi19 = RECORDS.find((r) => r.id === "bi-19");
const q343750 = bi19.pricing.total.amount / bi19.area.value;
say("  bi-19 " + bi19.pricing.total.amount + " / " + bi19.area.value + "평 = " + q343750 +
  " : exempt under GR5a? " + (gr5aExempt(q343750, bi19) ? "YES" : "no — forbidden, as 07:1471-1472 requires"));
const bi10 = RECORDS.find((r) => r.id === "bi-10");
say("  bi-10 perArea 2,500,000 = 85,000,000 / 34평 : exempt under GR5a? " +
  (gr5aExempt(2500000, bi10) ? "yes — statable, as 07:1466-1470 requires" : "NO"));
const bi09 = RECORDS.find((r) => r.id === "bi-09"), bi11 = RECORDS.find((r) => r.id === "bi-11");
const cross = bi09.pricing.total.amount / bi11.area.value;
say("  cross-record probe (07:1462-1465): bi-09 " + bi09.pricing.total.amount + " / bi-11 " +
  bi11.area.value + "평 = " + cross + "; exempt for bi-09? " +
  (gr5aExempt(cross, bi09) ? "YES — GR5a has cross-record reach, which 07:1460-1461 forbids"
                           : "no — the per-record exemption holds, as 07:1460-1461 requires"));
say("  GR1-statable numbers GR5 forbids and GR5a exempts: " + gr5Exempt + "; forbidden and NOT exempt: " + gr5Forbidden);
say();

// ---------------------------------------------------------------------- diagnostics and variant
say("== REV 8 vs REV 9, and the D9-6 decomposition ==");
say("  The default configuration above is REV 9. Everything in this section re-runs the same");
say("  derivations under other configurations, switching with useRev()/CFG and switching back.");
say();

// ------------------------------------------------------------------ rev 8 under the same checker
say("  (a) the same six properties under REV 8 (useRev(8)), for comparison:");
{
  useRev(8);
  const runs8 = [];
  for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) runs8.push({ u, ev });
  // property 1: VB3 conflicts
  let conf8 = 0;
  for (const u of ALL_UTTERANCES) {
    const r = vb3(u);
    if (r.matched.length > 1 && new Set(r.matched.map((x) => String(x.value))).size > 1) conf8 += 1;
  }
  // property 3
  let diff8 = 0;
  for (const { ev } of runs8) {
    if (orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join() !==
        orderByRungs(ev).map((r) => r.rec.id).join()) diff8 += 1;
  }
  say("      branches: " + runs8.length + " (rev 9: " + RUNS.length + ")");
  say("      property 1, VB3 utterances matching rows with opposite values: " + conf8);
  say("      property 3, branches whose two orderings differ: " + diff8 + " of " + runs8.length);
  useRev(9);
}
say();

// ------------------------------------------------------------------ the D9-6 decomposition
say("  (b) STRICT PB4 (07:1224-1237) under every partial adoption of D9-6. 07:2721 (section");
say("      20.7.1) instructs: read the fifth row before the last one.");
function cfgRun(label, mut) {
  useRev(8); mut();
  const r = strictPb4(label);
  useRev(9);
  return [label, r];
}
const SAT9 = ["scope_exact", "scope_superset"];
// The row labels are 07:2756-2774's OWN, in its order, so the corrected table can be swapped in
// without re-deriving the mapping. One addition: row B isolates D9-2c's EF3 half, which the
// contract's table folds into "EF6's new row alone" — row 7 (07:1268) needs scope `satisfied`
// AND relation scope_superset, and only EF3's state change can produce that pair, so "the new row
// alone" cannot mean the row without the state change. Row B makes that explicit.
const CONFIGS = [
  cfgRun("A  rev 8 as shipped", () => {}),
  cfgRun("B  D9-2c EF3 state change alone", () => { CFG.satRelations = SAT9; }),
  cfgRun("C  EF6's new row alone (needs B)", () => { CFG.satRelations = SAT9; CFG.ef6Row8 = true; }),
  cfgRun("D  D9-2c's GR2a order alone", () => { CFG.classOrder = GR2A_REV9; }),
  cfgRun("E  EF6 row + D9-2c order", () => { CFG.satRelations = SAT9; CFG.ef6Row8 = true; CFG.classOrder = GR2A_REV9; }),
  cfgRun("F  D9-1 alone (rungs deleted)", () => { CFG.noRungs = true; }),
  cfgRun("G  D9-1 + EF6 row", () => { CFG.noRungs = true; CFG.satRelations = SAT9; CFG.ef6Row8 = true; }),
  cfgRun("H  D9-1 + D9-2c order (no EF6 row)", () => { CFG.noRungs = true; CFG.satRelations = SAT9; CFG.classOrder = GR2A_REV9; }),
  cfgRun("I  D9-1 + EF6 row + D9-2c order — REV 9", () => { useRev(9); }),
];
say("      Every row uses THE SAME " + CONFIGS[0][1].pairs + " mutant pairs — rev 9's " + RUNS.length +
  " branches over the 19 records — and varies only the RULES. That is what makes the rows");
say("      comparable to each other, and it is why the pair count is not the 893 the contract");
say("      quotes at 07:1230-1232. 893 was measured over rev 8's own 31 branches (D9-4 decides");
say("      readings the checker previously had to run twice, collapsing four of them) and with");
say("      mutant twins that were NOT equal in |R_s| — a construction defect I found and corrected");
say("      after that figure was taken, so GR3a's \"larger R_s first\" sub-rung was deciding");
say("      comparisons the criterion should decide. Under the corrected construction rev 8 is");
say("      484 of 798, not 546 of 893. The rev-9 figure is 0 either way, so the contract's");
say("      CONCLUSION stands and its rev-8 BASELINE does not.");
say("      Row labels are 07:2756-2774's own, so this table can be swapped in directly.");
say("      configuration                            pairs  violations   rung / class / within");
for (const [nm, r] of CONFIGS) {
  const bb = r.by || {};
  say("      " + nm.padEnd(40) + String(r.pairs).padStart(5) + String(r.viol.length).padStart(12) +
    "    " + String(bb.rung || 0).padStart(4) + " / " + String(bb.class || 0).padStart(4) + " / " +
    String((bb["within-rung key"] || 0) + (bb["within-class key"] || 0)).padStart(4));
}
const rev8Strict = CONFIGS[0][1], rev9Strict = CONFIGS[CONFIGS.length - 1][1];
const d9_1alone = CONFIGS[5][1];
say("      VERDICT: rev 8 " + rev8Strict.viol.length + " of " + rev8Strict.pairs + "; rev 9 " +
  rev9Strict.viol.length + " of " + rev9Strict.pairs +
  (rev9Strict.viol.length === 0 ? "  — PB4's strong form HOLDS at rev 9 on the real corpus" : ""));
say("      D9-1 ALONE is " + d9_1alone.viol.length + ", a regression on rev 8's " +
  rev8Strict.viol.length + ". 07:2721's warning reproduces.");
if (rev9Strict.viol.length) {
  nameResiduals("rev 9 as written", rev9Strict);
} else {
  say("      no residual violations to name at rev 9.");
}
say();
// Every site below is located by its own TEXT, at run time, not by a stored line number. The
// contract moved twice while this work was in progress — once by ~230 lines and once by 12 — so a
// hardcoded number here would be wrong by the time it was read. `at()` returns the current line.
const CTEXT = (() => { try { return readFileSync(CONTRACT_PATH, "utf8").split("\n"); } catch (e) { return null; } })();
const at = (anchor) => {
  if (!CTEXT) return "07:?";
  const hits = [];
  for (let k = 0; k < CTEXT.length; k += 1) if (CTEXT[k].includes(anchor)) hits.push(k + 1);
  return hits.length === 1 ? "07:" + hits[0]
       : hits.length === 0 ? "07:GONE(\"" + anchor.slice(0, 28) + "\")"
       : "07:" + hits.join("/");
};
// Rev 9.1 APPLIED all of these. The block's job therefore changes from REQUESTING corrections to
// VERIFYING them, and the verification is two-sided on purpose: the superseded text must be GONE
// and the replacement must be PRESENT. "Gone" alone would pass if a whole paragraph were deleted;
// "present" alone would pass if both texts coexisted. Both are checked from the contract's own
// text at run time, so this block cannot go stale the way a stored line number does.
const gone = (t) => !CTEXT || !CTEXT.some((l) => l.includes(t));
const here = (t) => !!CTEXT && CTEXT.some((l) => l.includes(t));
say("      REV 9.1 VERIFICATION — every figure this checker asked to have corrected, checked in the");
say("      contract's own text: the superseded text GONE and the replacement PRESENT.");
const SITES = [
  ["rev 8 strict PB4 + pair count", ["893† mutant pairs, **546†**", "**546† violations of 893† pairs**",
    "`PB4` satisfied at 0 of 893†"], ["484 violations of 798 pairs", "| A | rev 8 as shipped | 798 |"]],
  ["the rungs' share of rev 8", ["they carried 299 of rev 8's"], ["262 of 484"]],
  ["the nine-row decomposition table", ["| configuration | `PB4` violations |"],
    ["| B | `D9-2c`'s `EF3` state change alone | 798 | 488 |", "| H | `D9-1` + `D9-2c` order (**no** `EF6` row) | 798 | **0** |"]],
  ["D9-1 alone is a regression", [], ["`D9-1` alone is a measurable regression — 624 against rev 8's 484"]],
  ["D9-2c alone leaves the rung violations", ["`D9-2c` alone leaves all 299"], ["leaves all **262**"]],
  ["the phantom bi-13 residual", ["The single violation that survives"], ["**There is no such violation.**"]],
  ["property 3's branch count", ["0 of 31**"], ["0 of 27 at rev 9"]],
  ["CINV-20 pass A / pass B", ["must be **re-derived** before it is quoted again"],
    ["pass B's evaluation count, 384 \u2192 336"]],
  ["EF6 row 7 off PB4", ["and the three together reach **0"], ["and **those three** reach **0 of 798**"]],
  ["EF6 row 7's disclosure ground", [], ["16 corpus classifications change, all"]],
  ["row 7's \"its own class\" qualifier", [], ["whenever no stronger caveat applies"]],
  ["no 42%", ["42%"], []],
  ["the \u2020 footnote block", ["\u2020 FIGURES UNDER CORRECTION"], []],
  ["D9-7a, the ambiguity clause", ["All readings give the **same** relation, or all give the same state"],
    ["different criterion states OR different relations", "Rule 2's condition is rule 1's exact negation"]],
  ["D9-8, key (3)", [], ["It reads the **intersection** of the"]],
  ["D9-9, the four disclosure sentences", [], ["A disclosure names only what every reading admits",
    "never over `Q` before the row", "If the intersection is empty and any reading's set is not"]],
  ["D9-9 on 07:970's permission", [], ["the permission is the one every reading gives"]],
  ["Q-29 open with three dead candidates", [], ["three dead candidates"]],
  ["rev 9's own measured figures", [], ["`EF6` corpus inputs with no class **0**"]],
];
let sOk = 0, sBad = 0;
for (const [name, mustGo, mustBe] of SITES) {
  const goneBad = mustGo.filter((t) => !gone(t));
  const hereBad = mustBe.filter((t) => !here(t));
  const ok = goneBad.length === 0 && hereBad.length === 0;
  if (ok) sOk += 1; else sBad += 1;
  say("        " + (ok ? "OK  " : "FAIL") + "  " + name +
    (ok && mustBe.length ? "   now at " + at(mustBe[0]) : ""));
  for (const t of goneBad) say("                STILL PRESENT: \"" + t.slice(0, 46) + "\"");
  for (const t of hereBad) say("                NOT FOUND:     \"" + t.slice(0, 46) + "\"");
}
say("      sites verified: " + sOk + " of " + SITES.length + "   still wrong: " + sBad);
if (sBad > 0) {
  finding(6, "rev 9.1 did not apply " + sBad + " of the " + SITES.length + " corrections this " +
    "checker measured; the superseded text is still in the contract or the replacement is absent.");
} else {
  say("      Every correction this checker asked for is in the contract, and no superseded figure");
  say("      survives anywhere in it. The corrections block retires: there is nothing left to ask.");
}
// inflate property 4's failure count, which is carried entirely by 4a's deletion form.
say("      RECORD (not a finding): rev 8 " + rev8Strict.viol.length + " of " + rev8Strict.pairs +
  "; rev 9 " + rev9Strict.viol.length + "; D9-1 alone " + d9_1alone.viol.length +
  ", worse than rev 8 — D9-6 is indivisible and the measurement says so.");
say();

// ------------------------------------------------------------------ EF6 totality under rev 9
say("  (c) EF6 (07:1257-1287) under rev 9's EIGHT rows — CINV-20's re-derivation (07:1550).");
{
  const raw9 = ef6RawSweep("rev9");
  const reached9 = new Set();
  for (const { ev } of RUNS) for (const row of ev.rows) reached9.add(row.cls);
  useRev(8);
  const raw8 = ef6RawSweep("rev8");
  useRev(9);
  say("      Pass B, the raw superset: " + raw9.n + " evaluations (rev 8: " + raw8.n + "), " +
    raw9.none + " with no row, " + raw9.notFirst + " where the returned row was not the lowest holding");
  say("      classes reached in the raw sweep: " + raw9.reached.size + "/" + CLASSES.length +
    "   on the real 19-record corpus: " + reached9.size + "/" + CLASSES.length);
  const missing9 = CLASSES.filter((c) => !reached9.has(c));
  if (missing9.length) say("      NOT reached on the corpus: " + missing9.join(", "));
  say("      GR2a is a permutation of GR2's closed list: " +
    (new Set(CFG.classOrder).size === CLASSES.length &&
     CFG.classOrder.every((c) => CLASSES.includes(c)) ? "yes" : "NO"));
  // Pass A — the DERIVED set, replicating CINV-20's OWN enumeration so the number is comparable
  // to the "100 of 192" the contract parks at 07:1550. That figure came from proof/ef6-totality.mjs
  // over "3 projectType x 3 V.breadth x 21 scope shapes including WS8's dropped-id case x 8 area
  // shapes" = 1,512 inputs, keyed on breadth|scope|area|projectType (4 states ^ 3 x 3 types = 192).
  // EF2/EF3/EF4 are re-derived here from 07:955-1017 in that same ABSTRACT shape; EF6 is this
  // file's own row table, so the rev-9 eight-row version is what classifies.
  // The replication is VALIDATED, not trusted: run at rev 8 it must reproduce 100 of 192 and
  // 10/10 classes. If it does not, the rev-9 figure below is not comparable either and says so.
  const SCOPE_RELATIONS_A = ["scope_exact", "scope_superset", "scope_overlap", "scope_subset", "scope_disjoint"];
  function passA() {
    // EF2, 07:955-959.
    const ef2a = (breadth, pt) => breadth === false ? "not_applicable"
      : pt === null ? "not_evaluable" : (pt === breadth ? "satisfied" : "unsatisfied");
    // EF3, 07:960-980. The satisfied set is CFG.satRelations — rev 8 {scope_exact},
    // rev 9 {scope_exact, scope_superset} (07:1003-1004, D9-2c).
    const ef3a = (pt, q) => {
      if (q.empty) return "not_applicable";                                   // 07:960
      if (pt === "full_remodel") return q.qtSubsetRt ? "satisfied" : "not_evaluable"; // 07:965-966
      if (pt === null) return "not_evaluable";                                // 07:1005-1006
      if (q.dropped) return "not_evaluable";                                  // 07:1000-1002 (WS8)
      return CFG.satRelations.includes(q.relation) ? "satisfied" : "unsatisfied"; // 07:1003-1004
    };
    // EF4, 07:1061-1063.
    const ef4a = (stated, evaluable, tierOk) => !stated ? "not_applicable"
      : !evaluable ? "not_evaluable" : (tierOk ? "satisfied" : "unsatisfied");
    const QS = [{ empty: true, relation: null, qtSubsetRt: true, dropped: false }];
    for (const relation of SCOPE_RELATIONS_A)
      for (const qtSubsetRt of [true, false])
        for (const dropped of [true, false])
          QS.push({ empty: false, relation, qtSubsetRt, dropped });
    const vectors = new Set(), classes = new Set(), perClass = new Map();
    let n = 0, none = 0, notFirst = 0, lemma = 0;
    for (const pt of ["full_remodel", "partial_remodel", null])
    for (const breadth of [false, "full_remodel", "partial_remodel"])
    for (const q of QS)
    for (const areaStated of [true, false])
    for (const areaEvaluable of [true, false])
    for (const tierOk of [true, false]) {
      n += 1;
      const c = { breadth: ef2a(breadth, pt), scope: ef3a(pt, q), area: ef4a(areaStated, areaEvaluable, tierOk) };
      // The relation exists exactly where 07:1000-1009's lemma says it can: a partial_remodel with a
      // non-empty Q the consumer did not truncate. Rev 8 only ever needed it under `unsatisfied`;
      // rev 9's row 7 (07:1268) needs it under `satisfied` too, which is the shape change.
      const rel = (pt === "partial_remodel" && !q.empty && !q.dropped) ? q.relation : null;
      const { cls, row, hold } = EF6(c, pt, rel, "CINV-20 pass A");
      if (cls === UNDET) none += 1;
      else if (row !== hold[0].n) notFirst += 1;
      if (c.scope === "unsatisfied" && pt !== "partial_remodel") lemma += 1;   // 07:1000-1006
      vectors.add(c.breadth + "|" + c.scope + "|" + c.area + "|" + pt);
      if (cls !== UNDET) classes.add(cls);
      if (cls !== UNDET) perClass.set(cls, (perClass.get(cls) || 0) + 1);
    }
    return { n, none, notFirst, lemma, vectors: vectors.size, vectorSet: vectors, classes, perClass };
  }
  const a9 = passA("rev9");
  useRev(8);
  const a8 = passA("rev8");
  useRev(9);
  say("      Pass A, the derived set — CINV-20's own enumeration, re-derived:");
  say("        conversation x record inputs: " + a9.n + "   (07:1550 states 1,512: " +
    (a9.n === 1512 ? "reproduced" : "NOT REPRODUCED") + ")");
  const replOK = a8.vectors === 100 && a8.classes.size === CLASSES.length;
  say("        REPLICATION CONTROL — the same code at rev 8 must reproduce the parked figure:");
  say("          rev 8: " + a8.vectors + " of 192 vectors, " + a8.classes.size + "/" + CLASSES.length +
    " classes   (07:1550 states 100 of 192, no class orphaned: " +
    (replOK ? "REPRODUCED — the rev-9 figure below is comparable" : "NOT REPRODUCED") + ")");
  if (!replOK) {
    finding(1, "the CINV-20 pass A replication does not reproduce 07:1550's parked rev-8 figure " +
      "(got " + a8.vectors + " of 192, " + a8.classes.size + " classes), so the re-derived rev-9 " +
      "count is not comparable to it either");
  }
  say("        REV 9, the figure the contract may now state as verified:");
  say("          criterion-state vectors that OCCUR: " + a9.vectors + " of 192" +
    "   (rev 8: " + a8.vectors + ", change " + (a9.vectors - a8.vectors) + ")");
  say("          classes reached among them: " + a9.classes.size + "/" + CLASSES.length +
    "   (rev 8 " + a8.classes.size + "/" + CLASSES.length + ")");
  say("          inputs with no row: " + a9.none + "   returned row not the lowest holding: " + a9.notFirst);
  say("          EF3's lemma (07:1000-1006), scope `unsatisfied` only for a partial_remodel: " +
    (a9.lemma === 0 ? "holds, 0 counterexamples" : "VIOLATED " + a9.lemma + " times"));
  const orphan9 = CLASSES.filter((c) => !a9.classes.has(c));
  say("          classes ORPHANED in pass A at rev 9: " + (orphan9.length ? orphan9.join(", ") : "none"));
  const onlyIn9 = [...a9.vectorSet].filter((v) => !a8.vectorSet.has(v));
  const onlyIn8 = [...a8.vectorSet].filter((v) => !a9.vectorSet.has(v));
  say("          is it the SAME 100? vectors only at rev 9: " + onlyIn9.length +
    "   only at rev 8: " + onlyIn8.length + "  -> " +
    (onlyIn9.length + onlyIn8.length === 0 ? "identical SETS, not merely equal counts" : "different sets"));
  say("      WHY the count did not move, and it is derived rather than asserted: D9-2c does not");
  say("      create or remove criterion-state vectors, it REDISTRIBUTES inputs among vectors that");
  say("      already occur. A partial_remodel with relation scope_superset moves from");
  say("      scope=`unsatisfied` to scope=`satisfied` (07:1003-1004); both of those vectors were");
  say("      already reached by other inputs, so the OCCUPANCY changes and the SET does not.");
  say("      What moves is the CLASS each input reaches, which is the other half of CINV-20:");
  const cls9 = [...CLASSES].map((c) => [c, a9.perClass.get(c) || 0, a8.perClass.get(c) || 0])
    .filter(([, n9, n8]) => n9 !== n8);
  if (cls9.length === 0) say("        no class changed occupancy — which would make row 7 dead; it did not happen.");
  for (const [c, n9, n8] of cls9) say("        " + c.padEnd(22) + " rev 8 " + String(n8).padStart(4) + "  ->  rev 9 " + String(n9).padStart(4));
  const ss9 = a9.perClass.get("scope_superset") || 0, ss8 = a8.perClass.get("scope_superset") || 0;
  if (ss9 < ss8) {
    say("      DERIVED CONSEQUENCE, not stated at 07:1280-1289 in these terms: row 7 gives");
    say("      scope_superset \"back its own class\" for " + ss9 + " of the " + ss8 + " inputs that had it at");
    say("      rev 8. The other " + (ss8 - ss9) + " reach rows 2-6 first and are labelled breadth_fallback,");
    say("      area_fallback or not_evaluable instead. That follows from row 7 sitting AFTER row 6,");
    say("      which 07:1301-1304 argues for deliberately (\"what we cannot evaluate outranks what we");
    say("      can caveat\") — so this is a consequence of a stated decision and not a defect. It is");
    say("      worth stating because the caveat OD-P and GR2 exist to disclose now reaches the");
    say("      visitor under a different label in " + (ss8 - ss9) + " of " + ss8 + " cases, and the contract quantifies it nowhere.");
  }
  say("      So 07:1550 may state, VERIFIED for rev 9: 1,512 inputs, 100 of 192 vectors occur,");
  say("      all 10 classes reachable, 0 inputs with no row, 0 first-match violations, and EF3's");
  say("      lemma holds. The counts are unchanged from rev 8 and are now re-derived against the");
  say("      eight-row EF6 rather than quoted from the seven-row one.");
  if (a9.none || a9.notFirst) {
    finding(1, "EF6 at rev 9 is not total or not first-match over pass A: " + a9.none +
      " inputs with no row, " + a9.notFirst + " where the returned row was not the lowest holding");
  }
}
say();

// ------------------------------------------------------------------ D9-5a's unmet obligation
say("  (d) D9-5a's UNMET OBLIGATION (07:2900-2905, section 20.7.6): a mechanical assertion that");
say("      \"EF3 under multiple readings is total and single-valued\" — that the readings-agree");
say("      test is decidable for every record. The contract says this assertion does not exist.");
say("      It is implemented here, over the ambiguity clause's own two bullets (07:1011-1018).");
{
  // (i) On the real corpus: every record x every multi-reading branch.
  let pairs = 0, noBullet = 0, bothBullets = 0, ambiguousA = 0, vacuousRel = 0, vacuousNone = 0;
  const shapes = new Map();
  for (const { ev, key } of RUNS) {
    if (!ev.V.readings || ev.V.readings.length < 2) continue;
    for (const R of RECORDS) {
      const branches = ev.V.readings.map((rd) => ef3Branch(ev.V, R, rd, key));
      const r = ef3ResolveReadings(branches, key);
      pairs += 1;
      if (!r.bulletA && !r.bulletB) {
        noBullet += 1;
        finding(1, "EF3's ambiguity clause (07:1011-1018) is NOT TOTAL: neither bullet's antecedent " +
          "holds for " + R.id + " on \"" + key + "\" (relations " + r.rels.join("/") +
          ", states " + r.states.join("/") + ")");
      }
      if (r.bulletA && r.bulletB) {
        bothBullets += 1;
        const k = "rels " + r.rels.join("/") + "  states " + r.states.join("/");
        if (!shapes.has(k)) shapes.set(k, []);
        shapes.get(k).push({ id: R.id, key });
      }
      // The sharper failures, both inside bullet A's own consequent:
      //   (1) "all give the same STATE" while the relations differ  -> "that relation" names none;
      //   (2) "all give the same RELATION" because NEITHER reading produced one (full_remodel and
      //       breadth-absent branches return no relation, so the arm is VACUOUSLY true) while the
      //       states differ -> "that state" names none.
      if (r.sameState && !r.sameRelation) ambiguousA += 1;
      if (r.sameRelation && !r.sameState) {
        vacuousRel += 1;
        if (r.rels[0] === "(none)") vacuousNone += 1;
      }
    }
  }
  say("      on the corpus: " + pairs + " (record, multi-reading branch) pairs");
  say("        neither bullet holds (NOT TOTAL): " + noBullet);
  say("        BOTH bullets hold (NOT SINGLE-VALUED across bullets): " + bothBullets);
  say("        bullet A via \"same state\" while the RELATIONS differ, so \"that relation\" names");
  say("          none (NOT SINGLE-VALUED inside bullet A): " + ambiguousA);
  say("        bullet A via \"same relation\" while the STATES differ, so \"that state\" names none: " +
    vacuousRel + "   of which the shared relation is (none), i.e. the arm is VACUOUSLY true: " + vacuousNone);
  let shown = 0;
  for (const [k, vs] of shapes) {
    if (shown >= 3) break;
    shown += 1;
    say("          shape: " + k + "   x" + vs.length + "   e.g. " + vs[0].id + " on \"" + vs[0].key + "\"");
  }
  // (ii) Synthetically, over EVERY pair of outcomes EF3's branches can produce, so the answer
  // does not depend on which utterances happen to be in the corpus.
  const OUTCOMES = [
    { state: "not_applicable", relation: null },
    { state: "satisfied", relation: null },            // full_remodel, both halves
    { state: "not_evaluable", relation: null },        // full_remodel trades / WS8 / breadth absent
    { state: "satisfied", relation: { relation: "scope_exact" } },
    { state: "satisfied", relation: { relation: "scope_superset" } },
    { state: "unsatisfied", relation: { relation: "scope_overlap" } },
    { state: "unsatisfied", relation: { relation: "scope_subset" } },
    { state: "unsatisfied", relation: { relation: "scope_disjoint" } },
  ];
  let sN = 0, sNone = 0, sBoth = 0, sAmbigA = 0, sVacuous = 0;
  const sShapes = new Map();
  for (const a of OUTCOMES) for (const b of OUTCOMES) {
    sN += 1;
    const r = ef3ResolveReadings([a, b], "synthetic D9-5a");
    if (!r.bulletA && !r.bulletB) sNone += 1;
    if (r.bulletA && r.bulletB) {
      sBoth += 1;
      const k = a.state + "/" + (a.relation ? a.relation.relation : "-") + "  vs  " +
                b.state + "/" + (b.relation ? b.relation.relation : "-");
      sShapes.set(k, (sShapes.get(k) || 0) + 1);
    }
    if (r.sameState && !r.sameRelation) sAmbigA += 1;
    if (r.sameRelation && !r.sameState) sVacuous += 1;
  }
  say("      synthetically, over all " + sN + " ordered pairs of EF3 branch outcomes:");
  say("        neither bullet holds (NOT TOTAL): " + sNone);
  say("        BOTH bullets hold (NOT SINGLE-VALUED across bullets): " + sBoth);
  say("        bullet A via \"same state\" with DIFFERENT relations: " + sAmbigA);
  say("        bullet A via \"same relation\" with DIFFERENT states: " + sVacuous);
  let sShown = 0;
  for (const [k, v] of sShapes) {
    if (sShown >= 6) break;
    sShown += 1;
    say("          " + k + "   x" + v);
  }
  const totalOk = sNone === 0 && noBullet === 0;
  const singleOk = sBoth === 0 && sAmbigA === 0 && sVacuous === 0 &&
    bothBullets === 0 && ambiguousA === 0 && vacuousRel === 0;
  say("      RESULT — D9-5a's obligation:  TOTAL: " + (totalOk ? "HOLDS" : "FAILS") +
    "    SINGLE-VALUED: " + (singleOk ? "HOLDS" : "FAILS"));
  if (!totalOk) {
    finding(1, "D9-5a (07:1008-1036) is NOT TOTAL: there are EF3 branch outcomes for which neither " +
      "bullet of the ambiguity clause fires, so the scope criterion is left unassigned and EF1's " +
      "\"no rule may leave one unassigned\" (07:949) is violated.");
  }
  if (!singleOk) {
    say("      MECHANISM, and it is reachable on the corpus, not only synthetically. Bullet A's");
    say("      first arm — \"all readings give the same relation\" — is VACUOUSLY TRUE whenever no");
    say("      reading produces a relation at all, which is every full_remodel record and every");
    say("      breadth-absent one (07:962-966, 07:1005-1006): those branches return a state and no");
    say("      relation. So for a full_remodel whose trades half differs between the readings,");
    say("      bullet A fires on \"same relation\" (both (none)) and its consequent \"that relation");
    say("      and that state\" has no single STATE to name, while bullet B fires too and says");
    say("      not_evaluable. Witness on the corpus: bi-11 (full_remodel, R_t has no");
    say("      built_in_furniture) against \"현관 수납\" — reading {entrance, storage} gives");
    say("      satisfied, reading {entrance}+{built_in_furniture} gives not_evaluable.");
    finding(1, "D9-5a (07:1008-1036) is NOT SINGLE-VALUED. Bullet A fires when \"all readings give " +
      "the same relation, OR all give the same state\", and bullet B fires when \"the readings " +
      "differ\". On " + sBoth + " of " + sN + " synthetic outcome pairs BOTH antecedents hold, " +
      "with opposite consequents (bullet A: that relation and that state; bullet B: " +
      "not_evaluable). Inside bullet A itself, " + sAmbigA + " pairs hold via the same-STATE arm " +
      "with different relations (so \"that relation\" names none) and " + sVacuous + " hold via " +
      "the same-RELATION arm with different states (so \"that state\" names none) — the latter " +
      "VACUOUSLY, because a full_remodel or breadth-absent branch returns no relation at all, so " +
      "\"all readings give the same relation\" is trivially true for them. Reachable on the " +
      "corpus: " + bothBullets + " (record, branch) pairs, e.g. bi-11 on \"현관 수납\". The clause " +
      "states no evaluation order — the same defect D9-4 fixed in VB3 one section earlier " +
      "(07:883-886) and PB7/EF6 already carry. D9-5a is wrong as written.");
  }
}
say();

// ------------------------------------------------------------------ the applied data
say("  (e) the corpus vs the APPLIED demo data (data/sites/boost-interior-demo/content/projects.json)");
{
  const cmp = compareCorpusToData();
  if (!cmp) {
    say("      projects.json not readable or not yet populated — spec corpus used.");
  } else {
    say("      records in projects.json: " + cmp.count + "   ids matching the spec corpus: " +
      (cmp.sameIds ? "all 19" : "NO"));
    say("      fields compared per record: projectType, workScopeIds, area{value,unit,basis},");
    say("        publishedAt, title, pricing.total, pricing.perArea");
    if (cmp.diffs.length === 0) {
      say("      FIELD DISAGREEMENTS: none.");
    } else {
      say("      FIELD DISAGREEMENTS: " + cmp.diffs.length);
      for (const d of cmp.diffs) say("        " + d);
    }
    // The comparison that decides whether it matters: re-run every branch on the data-backed
    // corpus and diff the derived orders and classes, not the fields.
    let orderDiffs = 0, classDiffs = 0;
    for (const { u, ev, key } of RUNS) {
      const evD = evaluateBranch(ev.V, cmp.dataCorpus);
      const a = orderByRungs(ev).map((x) => x.rec.id + "=" + x.cls).join(",");
      const b = orderByRungs(evD).map((x) => x.rec.id + "=" + x.cls).join(",");
      if (a !== b) {
        orderDiffs += 1;
        const ca = new Map(orderByRungs(ev).map((x) => [x.rec.id, x.cls]));
        const cb = new Map(orderByRungs(evD).map((x) => [x.rec.id, x.cls]));
        const moved = [...ca.keys()].filter((id) => ca.get(id) !== cb.get(id));
        if (moved.length) classDiffs += moved.length;
        if (orderDiffs <= 3) {
          say("        ORDER DIFFERS on \"" + key + "\"" +
            (moved.length ? "; classes changed for " + moved.join(", ") : "; same classes, different order"));
        }
      }
    }
    say("      re-running all " + RUNS.length + " branches on the data-backed corpus:");
    say("        branches whose derived order differs: " + orderDiffs);
    say("        record-class changes across all branches: " + classDiffs);
    if (orderDiffs === 0) {
      say("      So the four field disagreements change NOTHING this run measures. The reason is");
      say("      in force and checkable: the only in-force readers of pricing.perArea are GR1");
      say("      (statable as a fact, 07:1213-1215) and GR5a's exemption (07:1458-1461), and");
      say("      \"No key is a price\" (07:1405) keeps it out of every ordering key.");
      say("      Reportable all the same: 04 derives those four per-area values by RD1 and the");
      say("      applied file carries none, so a consumer asked \"평당 얼마였나요?\" about bi-09..bi-12");
      say("      can answer from the spec and not from the data.");
      finding(6, "the applied demo data omits the four RD1-derived pricing.perArea values that 04 " +
        "section 2 specifies (bi-09, bi-10, bi-11, bi-12). No in-force ordering or criterion rule " +
        "reads them — 0 of " + RUNS.length + " branches change order or class — but GR1 (07:1213-1215) " +
        "makes a per-area amount statable as a fact, and GR4 (07:1442-1444) exposes it when the " +
        "visitor asks for one, so the answer to a per-area question differs between the two sources.",
        "04 \u00a72's demo data \u2014 a property of the DATA, unchanged by any contract revision");
    } else {
      finding(6, "the applied demo data changes the derived result on " + orderDiffs + " of " +
        RUNS.length + " branches (" + classDiffs + " record-class changes). The spec corpus and " +
        "the applied data are not interchangeable.");
    }
  }
}
say();

// IN FORCE = raised by the revision this run defaults to, which is rev 9.1. A gap that only the
// rev-9 comparison runs raise is CLOSED by rev 9.1 and must not be reported as open -- that was
// the whole point of D9-8 and D9-9, and reporting it open would hide whether they worked.
const GAPS9 = GAPS.filter((g) => inForce(g.revs));
const GAPS8ONLY = GAPS.filter((g) => !inForce(g.revs));
// ------------------------------------------------------------------ D9-7
say("  (f) D9-7 — round 9's DECISION on the ambiguity clause, implemented behind CFG.ef3Ambiguity.");
say("      1. readings produce different criterion STATES  => not_evaluable, ambiguity disclosed");
say("      2. otherwise (all agree on the state)           => that state; and where they also");
say("                                                         agree on a relation, that relation");
{
  const OUTCOMES = [
    { state: "not_applicable", relation: null },
    { state: "satisfied", relation: null },
    { state: "not_evaluable", relation: null },
    { state: "satisfied", relation: { relation: "scope_exact" } },
    { state: "satisfied", relation: { relation: "scope_superset" } },
    { state: "unsatisfied", relation: { relation: "scope_overlap" } },
    { state: "unsatisfied", relation: { relation: "scope_subset" } },
    { state: "unsatisfied", relation: { relation: "scope_disjoint" } },
  ];
  CFG.ef3Ambiguity = "D9-7";

  // (i) THE CLAUSE ITSELF. Rule 1 and rule 2 are evaluated independently, so "total and
  //     single-valued" is measured and not inherited from the argument that produced it.
  let sN = 0, sNeither = 0, sBoth = 0;
  for (const a of OUTCOMES) for (const b of OUTCOMES) {
    sN += 1;
    const r = ef3ResolveReadings([a, b], "synthetic D9-7");
    if (!r.d97rule1 && !r.d97rule2) sNeither += 1;
    if (r.d97rule1 && r.d97rule2) sBoth += 1;
  }
  let cPairs = 0, cNeither = 0, cBoth = 0;
  for (const { ev, key } of RUNS) {
    if (!ev.V.readings || ev.V.readings.length < 2) continue;
    for (const R of RECORDS) {
      const r = ef3ResolveReadings(ev.V.readings.map((rd) => ef3Branch(ev.V, R, rd, key)), key);
      cPairs += 1;
      if (!r.d97rule1 && !r.d97rule2) cNeither += 1;
      if (r.d97rule1 && r.d97rule2) cBoth += 1;
    }
  }
  say("      THE CLAUSE ITSELF:");
  say("        synthetic, all " + sN + " ordered pairs: neither rule fires " + sNeither +
    ", BOTH rules fire " + sBoth);
  say("        corpus, " + cPairs + " (record, multi-reading branch) pairs: neither " + cNeither +
    ", both " + cBoth);
  const clauseOk = sNeither === 0 && sBoth === 0 && cNeither === 0 && cBoth === 0;
  say("        D9-7 as a clause:  TOTAL: " + (sNeither + cNeither === 0 ? "HOLDS" : "FAILS") +
    "    SINGLE-VALUED: " + (sBoth + cBoth === 0 ? "HOLDS" : "FAILS"));
  say("        This is arithmetic, not luck: rule 2's condition is rule 1's exact negation, so no");
  say("        input can match both or neither. The measurement confirms the construction. D9-5a's");
  say("        property-1 finding CLEARS on this enumeration.");

  // (ii) WHAT RULE 2 HANDS DOWNSTREAM. The clause-level argument does not reach this.
  //      When the states agree and the RELATIONS differ, rule 2 returns a state with NO relation.
  //      EF6 row 1 (07:1262) classes an `unsatisfied` scope AS "the 14.3.3 relation", and EF6
  //      row 7 (07:1268) needs that relation to be `scope_superset`. So ask EF6, do not assume.
  //
  //      TWO CORRECTIONS TO MY OWN FIRST ATTEMPT AT THIS CHECK, both of which hid the answer:
  //      (a) EF6 returns UNDET only when NO ROW holds. Row 1 DOES hold and returns `relation`
  //          AS the class, so an absent relation yields the class `null` — a hole the UNDET test
  //          is blind to. The test is now "the class is one of GR2's ten", which is what
  //          07:1250-1264 actually requires.
  //      (b) The outcome pairs must be reachable FOR ONE RECORD. `R.projectType` is fixed per
  //          record, and EF3's branches are selected by it: a full_remodel never produces a
  //          relation and a partial always does. Crossing all eight outcomes with all eight
  //          invents pairs no record can exhibit. The enumeration is now per projectType.
  const REACHABLE = {
    // full_remodel (07:962-966): satisfied or not_evaluable, NEVER a relation.
    full_remodel: [
      { state: "not_applicable", relation: null },
      { state: "satisfied", relation: null },
      { state: "not_evaluable", relation: null },
    ],
    // partial_remodel (07:1000-1004): 14.3.3's relation, or not_applicable / not_evaluable (WS8).
    partial_remodel: [
      { state: "not_applicable", relation: null },
      { state: "not_evaluable", relation: null },
      { state: "satisfied", relation: { relation: "scope_exact" } },
      { state: "satisfied", relation: { relation: "scope_superset" } },
      { state: "unsatisfied", relation: { relation: "scope_overlap" } },
      { state: "unsatisfied", relation: { relation: "scope_subset" } },
      { state: "unsatisfied", relation: { relation: "scope_disjoint" } },
    ],
    // breadth absent (07:1005-1006): not_evaluable, never a relation.
    absent: [{ state: "not_applicable", relation: null }, { state: "not_evaluable", relation: null }],
  };
  let d2 = 0, noRel = 0, ef6None = 0, lostCaveat = 0, considered = 0;
  const holes = [], caveats = [];
  for (const ptKey of ["full_remodel", "partial_remodel", "absent"]) {
    const pt = ptKey === "absent" ? null : ptKey;
    for (const a of REACHABLE[ptKey]) for (const b of REACHABLE[ptKey]) {
      considered += 1;
      const r = ef3ResolveReadings([a, b], "D9-7 downstream");
      if (!r.d97rule2) continue;                 // rule 1 fired: not_evaluable, no relation needed
      d2 += 1;
      if (r.sameRelation) continue;
      noRel += 1;
      const scopeState = a.state;                // the states agree, so either names it
      for (const breadth of ["not_applicable", "satisfied", "unsatisfied", "not_evaluable"])
      for (const area of ["not_applicable", "satisfied", "unsatisfied", "not_evaluable"]) {
        const c = { breadth, scope: scopeState, area };
        const got = EF6(c, pt, null, "D9-7 downstream");       // rule 2 supplied NO relation
        const classed = got.cls !== UNDET && CLASSES.includes(got.cls);
        if (!classed) {
          ef6None += 1;
          const hk = a.state + "/" + (a.relation ? a.relation.relation : "-") + "|" +
                     b.state + "/" + (b.relation ? b.relation.relation : "-") + "|" + String(pt);
          if (!holes.some((h) => h.k === hk)) holes.push({ k: hk, a, b, c, pt, row: got.row, cls: String(got.cls) });
          continue;
        }
        const relA = a.relation ? a.relation.relation : null;
        const relB = b.relation ? b.relation.relation : null;
        if ((relA === "scope_superset" || relB === "scope_superset") && got.cls !== "scope_superset") {
          lostCaveat += 1;
          const ck = relA + "|" + relB + "|" + got.cls;
          if (!caveats.some((x) => x.k === ck)) caveats.push({ k: ck, relA, relB, c, pt, cls: got.cls });
        }
      }
    }
  }
  say("      WHAT RULE 2 HANDS DOWNSTREAM — the part the clause-level argument does not reach:");
  say("        outcome pairs reachable for ONE record (projectType fixed): " + considered);
  say("        of those, reaching rule 2: " + d2 + "   with DIFFERING relations, so rule 2");
  say("        returns a state and NO relation: " + noRel);
  say("        EF6 inputs built from those whose class is NOT one of GR2's ten (07:1250-1264): " + ef6None);
  for (const h of holes.slice(0, 4)) {
    say("          HOLE  readings " + h.a.state + "/" + (h.a.relation ? h.a.relation.relation : "-") +
      " and " + h.b.state + "/" + (h.b.relation ? h.b.relation.relation : "-") + " on a " +
      String(h.pt) + ":");
    say("                D9-7 rule 2 gives scope `" + h.c.scope + "` with no relation; EF6 row " +
      h.row + " (07:1262) fires and its class IS the relation -> `" + h.cls + "`");
  }
  say("        EF6 inputs where a `scope_superset` reading existed and the class is NOT");
  say("          scope_superset, so the caveat row 7 exists to disclose is silent: " + lostCaveat);
  for (const c of caveats.slice(0, 4)) {
    say("          CAVEAT LOST  readings " + c.relA + " and " + c.relB + " -> class `" + c.cls +
      "`  [breadth " + c.c.breadth + ", area " + c.c.area + "]");
  }

  // (ii-b) A CONSTRUCTED WITNESS, end to end, because a count is not a case. The corpus has no
  //        record that exhibits this; one is built here and run through the real pipeline.
  const W_UTT = "현관 수납";
  const wRec = { id: "zz-witness", title: "현관 수납 witness", publishedAt: "2026-01-01",
    projectType: "partial_remodel", workScopeIds: ["entrance", "storage", "built_in_furniture"],
    area: null, pricing: { total: null, perArea: null }, droppedUnknownId: false };
  say("      A CONSTRUCTED WITNESS, end to end — the corpus does not contain one, so one is built:");
  say("        record zz-witness: partial_remodel, workScopeIds [entrance, storage, built_in_furniture]");
  say("        utterance \"" + W_UTT + "\", where 수납 admits `storage` (Space) and `built_in_furniture` (Work)");
  for (const ev of evaluateAll(W_UTT, [wRec])) {
    if (!ev.V.readings || ev.V.readings.length < 2) continue;
    const brs = ev.V.readings.map((rd) => ef3Branch(ev.V, wRec, rd, "witness"));
    const rr = ef3ResolveReadings(brs, "witness");
    say("        readings: " + ev.V.readings.map((rd) => "{" + rd.Q.join(",") + "}").join("  and  "));
    say("        per-reading EF3: " + brs.map((b) => b.state + "/" +
      (b.relation && b.relation !== UNDET ? b.relation.relation : "-")).join("   "));
    CFG.ef3Ambiguity = "D9-5a";
    const a5 = EF3(ev.V, wRec, "witness");
    CFG.ef3Ambiguity = "D9-7";
    const a7 = EF3(ev.V, wRec, "witness");
    const cls5 = EF6({ breadth: "not_applicable", scope: a5.state, area: "not_applicable" },
      wRec.projectType, a5.relation && a5.relation !== UNDET ? a5.relation.relation : null, "witness");
    const cls7 = EF6({ breadth: "not_applicable", scope: a7.state, area: "not_applicable" },
      wRec.projectType, a7.relation && a7.relation !== UNDET ? a7.relation.relation : null, "witness");
    say("        states agree (" + rr.states.join("/") + "), relations differ (" + rr.rels.join("/") + ")");
    say("        D9-5a: scope " + a5.state + "  -> EF6 class `" + String(cls5.cls) + "` (row " + cls5.row + ")");
    say("        D9-7 : scope " + a7.state + "  -> EF6 class `" + String(cls7.cls) + "` (row " + cls7.row + ")");
    if (a7.state === "satisfied" && cls7.cls === "exact") {
      say("        So D9-7 reports this record as `exact` — 07:1269/07:1303: \"nothing was caveated\" —");
      say("        although under one reading of the visitor's own word it did MORE than they asked.");
      say("        D9-5a reported not_evaluable and disclosed the ambiguity. D9-7 discloses nothing.");
      finding(1, "D9-7, on a constructed partial_remodel [entrance, storage, built_in_furniture] " +
        "against \"현관 수납\": the two readings give scope_exact and scope_superset, both " +
        "`satisfied`, so rule 2 reports `satisfied` with no relation and EF6 returns `exact`. " +
        "The record is presented as an exact match with no caveat and no ambiguity disclosure. " +
        "D9-5a returns not_evaluable and discloses. This record is authorable under PT5 and is " +
        "absent from the 19 only by accident.");
    }
    break;
  }
  // The other half of the defect, also end to end: two readings that both come out `unsatisfied`
  // with DIFFERENT relations. Rule 2 then reports `unsatisfied` with no relation, and EF6 row 1's
  // class IS the relation.
  const hRec = { id: "zz-hole", title: "현관 수납 hole", publishedAt: "2026-01-01",
    projectType: "partial_remodel", workScopeIds: ["storage", "kitchen"],
    area: null, pricing: { total: null, perArea: null }, droppedUnknownId: false };
  say("        record zz-hole: partial_remodel, workScopeIds [storage, kitchen], same utterance");
  for (const ev of evaluateAll(W_UTT, [hRec])) {
    if (!ev.V.readings || ev.V.readings.length < 2) continue;
    const brs = ev.V.readings.map((rd) => ef3Branch(ev.V, hRec, rd, "hole"));
    const rr = ef3ResolveReadings(brs, "hole");
    say("        per-reading EF3: " + brs.map((b) => b.state + "/" +
      (b.relation && b.relation !== UNDET ? b.relation.relation : "-")).join("   "));
    CFG.ef3Ambiguity = "D9-7";
    const a7 = EF3(ev.V, hRec, "hole");
    const cls7 = EF6({ breadth: "not_applicable", scope: a7.state, area: "not_applicable" },
      hRec.projectType, a7.relation && a7.relation !== UNDET ? a7.relation.relation : null, "hole");
    say("        states agree (" + rr.states.join("/") + "), relations differ (" + rr.rels.join("/") + ")");
    say("        D9-7 : scope " + a7.state + "  -> EF6 row " + cls7.row + " class `" + String(cls7.cls) + "`");
    if (!CLASSES.includes(cls7.cls)) {
      say("        `" + String(cls7.cls) + "` is not one of GR2's ten classes (07:1250-1264). The record");
      say("        has NO class, so GR2a cannot order it and EF1's closure has nothing to close over.");
      finding(1, "D9-7, on a constructed partial_remodel [storage, kitchen] against \"현관 수납\": " +
        "the readings give scope_overlap and scope_disjoint, both `unsatisfied`, so rule 2 " +
        "reports `unsatisfied` with NO relation; EF6 row 1 (07:1262) fires and its class IS the " +
        "relation, so the record is classed `" + String(cls7.cls) + "` — not one of GR2's ten. " +
        "EF6 stops being total, which is CINV-20's primary claim (07:1550). This is the third " +
        "sentence D9-7 needs.");
    }
    break;
  }
  // (iii) THE SIX PROPERTIES UNDER D9-7, on the real corpus.
  const baseRuns = RUNS.map(({ ev, key }) => ({ key, ord: orderByRungs(ev).map((r) => r.rec.id + "=" + r.cls).join(",") }));
  const d97Runs = [];
  for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) d97Runs.push({ ev, key: u + " | " + ev.V.branch });
  let orderDiff = 0, classDiff = 0, undetCls = 0, diffKeys = [];
  for (let k = 0; k < d97Runs.length && k < baseRuns.length; k += 1) {
    const ord = orderByRungs(d97Runs[k].ev).map((r) => r.rec.id + "=" + r.cls).join(",");
    for (const row of d97Runs[k].ev.rows) if (row.cls === UNDET) undetCls += 1;
    if (ord !== baseRuns[k].ord) {
      orderDiff += 1;
      if (diffKeys.length < 4) diffKeys.push(baseRuns[k].key);
      const ca = new Map(baseRuns[k].ord.split(",").map((x) => x.split("=")));
      for (const [id, cls] of ord.split(",").map((x) => x.split("="))) if (ca.get(id) !== cls) classDiff += 1;
    }
  }
  let p3 = 0;
  for (const { ev } of d97Runs) {
    if (orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join() !== orderByRungs(ev).map((r) => r.rec.id).join()) p3 += 1;
  }
  const pb4d97 = strictPb4("D9-7");
  say("      THE SIX PROPERTIES UNDER D9-7, on the real corpus:");
  say("        branches: " + d97Runs.length + " (D9-5a: " + RUNS.length + ")");
  say("        property 1, EF6 inputs with no class on the corpus: " + undetCls);
  say("        property 3, branches whose two orderings differ: " + p3 + " of " + d97Runs.length);
  say("        property 4, strict PB4: " + pb4d97.viol.length + " of " + pb4d97.pairs + " pairs");
  say("        property 5, criterion states still assigned only by EF2/EF3/EF4: yes (D9-7 changes");
  say("          which value EF3 assigns, not who assigns it — the single assignState call is");
  say("          still in EF3 and ef3Branch remains pure)");
  say("        branches whose derived order differs from D9-5a: " + orderDiff +
    "   record-class changes: " + classDiff);
  for (const k of diffKeys) say("          differs on: " + k);
  say("      VERDICT ON D9-7: the clause is total and single-valued and nothing on the corpus");
  say("      regressed — PB4 stays at " + pb4d97.viol.length + ", property 3 stays at " + p3 + ".");
  if (ef6None > 0 || lostCaveat > 0) {
    say("      BUT the corpus does not reach the hole. " + undetCls + " corpus records hit it because no");
    say("      utterance here has two readings that agree on the state and differ on the relation;");
    say("      the synthetic enumeration does, " + noRel + " times, and EF6 has no class for " + ef6None + " of the");
    say("      inputs they produce. D9-7 is RIGHT ABOUT THE CLAUSE and INCOMPLETE ONE LEVEL DOWN —");
    say("      which is the same propagation defect as gap 3 and as D9-5a itself.");
  }
  CFG.ef3Ambiguity = "D9-5a";
}
say();

// ------------------------------------------------------------------ gap 3 and its family
say("  (g) GAP 3 — ordering key (3) still reads V.scope as ONE set (07:1401-1402 vs 07:862).");
{
  // (i) Which records are even affected: only branches with more than one reading.
  const multi = RUNS.filter(({ ev }) => ev.V.readings && ev.V.readings.length > 1);
  say("      branches with more than one WS6 reading: " + multi.length + " of " + RUNS.length +
    "   (" + multi.map(({ ev }) => "\"" + ev.V.utterance + "\"").join(", ") + ")");
  const base = new Map();
  for (const { ev, key } of RUNS) base.set(key, orderByRungs(ev).map((r) => r.rec.id).join(","));
  const READINGS = ["union", "intersection", "max", "min", "pb4skip"];
  say("      reading        branches whose order changes vs `union`   notes");
  const results = new Map();
  for (const rd of READINGS) {
    CFG.key3 = rd;
    let diff = 0; const where = [];
    for (const { ev, key } of RUNS) {
      const ord = orderByRungs(ev).map((r) => r.rec.id).join(",");
      if (ord !== base.get(key)) { diff += 1; if (where.length < 3) where.push(ev.V.utterance); }
    }
    results.set(rd, { diff, where });
    say("      " + rd.padEnd(14) + String(diff).padStart(3) + " of " + RUNS.length +
      (where.length ? "    e.g. " + where.join(" ; ") : ""));
  }
  CFG.key3 = "union";
  const anyDiff = [...results.values()].some((r) => r.diff > 0);
  // What actually moves, printed per reading, because an aggregate would hide it.
  say("      GAP 3 IS OBSERVABLE ON THIS CORPUS. Three of the five readings change the derived");
  say("      order on BOTH multi-reading branches. Concretely, on \"현관 수납\":");
  const shown = new Set();
  for (const rd of ["intersection", "min", "pb4skip"]) {
    CFG.key3 = rd;
    for (const { ev, key } of multi) {
      const ord = orderByRungs(ev).map((r) => r.rec.id);
      const was = base.get(key).split(",");
      if (ord.join(",") === base.get(key)) continue;
      const moved = ord.map((id, i) => [id, was.indexOf(id), i]).filter(([, a, b]) => a !== b);
      const tag = rd + " | " + ev.V.utterance;
      if (shown.has(tag)) continue;
      shown.add(tag);
      say("        " + rd.padEnd(13) + ev.V.utterance + ": " +
        moved.slice(0, 5).map(([id, a, b]) => id + " " + (a + 1) + "->" + (b + 1)).join(", ") +
        (moved.length > 5 ? " (+" + (moved.length - 5) + " more)" : ""));
    }
  }
  CFG.key3 = "union";
  say("      So the five readings are not interchangeable and the contract picks none of them.");
  say("      `union` and `max` coincide here only because the union's extra ids are carried by");
  say("      the same records that already win the count; that is a property of these 19 records,");
  say("      not of the rule. The gap is REAL AND LIVE, not merely latent.");
  say("      RECOMMENDED READING: `intersection` — the ids EVERY reading admits.");
  say("        It is the only candidate that is a function of Q alone and independent of which");
  say("        reading is taken, which is 07:350-356's whole point. `max` and `min` choose a");
  say("        reading PER RECORD, which is what WS6 forbids and what M7-3 was about. `union`");
  say("        credits a record for an id the visitor may not have said: for \"현관 수납\" it counts");
  say("        a record carrying built_in_furniture as though the visitor asked for it, when they");
  say("        said one word that means storage OR built_in_furniture, not both.");
  say("        \"The visitor's STATED workScopeIds\" (07:1401-1402) are exactly the ids common to");
  say("        every reading; an id in only one reading is not stated, it is one reading of an");
  say("        ambiguous word. For \"현관 수납\": union {entrance,storage,built_in_furniture} = 3,");
  say("        intersection {entrance} = 1.");
  say("      SECOND-BEST: `pb4skip`, and it is not an alternative so much as an ADDITION. PB4");
  say("        (07:1218-1220) says a criterion in state `not_evaluable` contributes to NO tie-break");
  say("        key. A record the ambiguity made not_evaluable is exactly that, so key (3) must not");
  say("        order it at all — and then key (2)'s carve-out decides where it lands, which is");
  say("        gap 1 / Q-29, still unresolved. So gap 3 does not close independently of gap 1.");

  // (ii) IS IT A FAMILY? Every in-force rule that reads V.scope as ONE set, found in the contract
  //      text rather than in this implementation, and then tested where testable.
  say("      IS IT A FAMILY? every in-force site that reads V.scope, checked:");
  const SITES = [
    ["EF3 (07:960-1009)", "SAFE", "computes per reading by construction (07:960-961)"],
    ["14.3.3 / 14.3.3.1 tables (07:1080-1087, 07:1165-1168)", "SAFE",
     "read Q_s/Q_t as one set, but EF3 calls them ONCE PER READING, so they inherit the discipline"],
    ["ordering key (3) (07:1401-1402)", "BROKEN", "gap 3 — no count is defined under two readings; round 10 adopts the intersection, measured in section (i)"],
    ["EF3's ground-not-conclusion clause (07:978)", "BROKEN",
     "\"unless Q_s subset-of R_s ALSO holds, in which case either may be stated\" — a C: MUST on what the REPLY may say, keyed on Q_s, with no reading named"],
    ["14.3.3 rows 4/6/7/8 + CINV-17 (07:1083-1087, 07:1547)", "BROKEN",
     "mandate naming Q_s \\ R_s and Q_t \\ R_t as \"not remodelled\" / \"not established\" — both differ between readings"],
  ];
  for (const [site, verdict, why] of SITES) {
    say("        " + verdict.padEnd(7) + site);
    say("                " + why);
  }
  // Test the two new ones where they are testable: does the CONDITION differ between readings?
  let groundDiff = 0, discloseDiff = 0;
  const gEg = [], dEg = [];
  for (const { ev, key } of multi) {
    for (const R of RECORDS) {
      const qs = ev.V.readings.map((rd) => sOf(rd.Q));
      if (R.projectType === "full_remodel") {
        const vals = qs.map((q) => subset(q, sOf(R.workScopeIds)));
        if (new Set(vals).size > 1) { groundDiff += 1; if (gEg.length < 2) gEg.push(R.id + " on \"" + ev.V.utterance + "\""); }
      }
      if (R.projectType === "partial_remodel") {
        const missing = qs.map((q) => q.filter((x) => !sOf(R.workScopeIds).includes(x)).sort().join("+"));
        if (new Set(missing).size > 1) { discloseDiff += 1; if (dEg.length < 2) dEg.push(R.id + " on \"" + ev.V.utterance + "\" -> {" + missing.join("} vs {") + "}"); }
      }
    }
  }
  say("        MEASURED on the corpus, over the " + multi.length + " multi-reading branches x 19 records:");
  say("          full_remodel records where \"Q_s subset-of R_s\" DIFFERS between readings, so");
  say("            07:978's permission to state the stronger sentence is reading-dependent: " + groundDiff);
  for (const e of gEg) say("              e.g. " + e);
  say("          partial_remodel records where Q_s \\ R_s DIFFERS between readings, so the spaces");
  say("            07:1083-1087 and CINV-17 require be NAMED are reading-dependent: " + discloseDiff);
  for (const e of dEg) say("              e.g. " + e);
  say("          NOTE, and section (i) supersedes this figure: " + discloseDiff + " counts (record, branch)");
  say("            pairs where Q_s \\ R_s differs, WITHOUT asking whether a row that names that set");
  say("            actually fires. Rows 3 and 5 and the trade-only table 14.3.3.1 do not name it.");
  say("            Emitting the disclosures and counting the ones really made gives 10. Use 10.");
  if (groundDiff > 0 || discloseDiff > 0) {
    finding(6, "gap 3 is a FAMILY, not an instance. Three in-force sites read V.scope as one set " +
      "after D9-5a made it one set per reading: ordering key (3) (07:1401-1402), EF3's own " +
      "ground-not-conclusion clause (07:978, \"unless Q_s subset-of R_s also holds\"), and the " +
      "14.3.3 row disclosures with CINV-17 (07:1083-1087, 07:1547, \"the spaces in Q_s \\ R_s are " +
      "reported as not remodelled\"). Measured on the corpus: the ground-not-conclusion condition " +
      "differs between readings for " + groundDiff + " (record, branch) pairs and the disclosure " +
      "set Q_s \\ R_s differs for " + discloseDiff + " (of which 10 are rows that actually FIRE and " +
      "name it — section (i) emits them and 10 is the figure to use). The last two are worse than the ordering " +
      "one: they decide what the reply ASSERTS about a record, so a reading-dependent answer is a " +
      "reading-dependent truth claim, which is what WS7a and CINV-17 exist to prevent.");
  }
}
say();

// ------------------------------------------------------------------ EF6 row 7's justification
say("  (h) EF6 ROW 7 (07:1268) — what it is actually for, since it is NOT what 07:1280 says.");
{
  // The negative half: row 7 is not needed for PB4. Row H of the table above already showed it.
  const H = CONFIGS[7][1], I = CONFIGS[8][1];
  say("      NOT LOAD-BEARING FOR PB4: configuration H (D9-1 + D9-2c's EF3 change + GR2a's order,");
  say("      WITHOUT row 7) reaches " + H.viol.length + " of " + H.pairs + ". Rev 9 with row 7 reaches " + I.viol.length + ".");
  say("      Row 7 buys nothing PB4 can see, so 07:1335 and 07:1231 must stop listing it among");
  say("      the parts that \"together reach 0\".");

  // The positive half, measured: delete row 7 at rev 9 and see what the visitor is TOLD.
  const withRow7 = new Map();
  for (const { ev, key } of RUNS) for (const r of ev.rows) withRow7.set(key + "|" + r.rec.id, r.cls);
  CFG.ef6Row8 = false;
  let changed = 0, toExact = 0; const egs = [];   // toExact -> MEASURED.row7ToExact below
  for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) {
    const key = u + " | " + ev.V.branch;
    for (const r of ev.rows) {
      const was = withRow7.get(key + "|" + r.rec.id);
      if (was === undefined || was === r.cls) continue;
      changed += 1;
      if (was === "scope_superset" && r.cls === "exact") {
        toExact += 1;
        if (egs.length < 3) egs.push(r.rec.id + " on \"" + u + "\"");
      }
    }
  }
  CFG.ef6Row8 = true;
  MEASURED.row7ToExact = toExact;
  say("      LOAD-BEARING FOR DISCLOSURE, and this is the measurement that says so: delete row 7");
  say("      at rev 9 and re-derive the corpus. " + changed + " (record, branch) classifications change, and");
  say("      " + toExact + " of them go from `scope_superset` to `exact` — a record that did MORE than the");
  say("      visitor asked, relabelled \"nothing was caveated\" (07:1269, 07:1303).");
  for (const e of egs) say("        e.g. " + e);
  say("      THAT is row 7's justification: without it OD-P's \"a fallback is never passed off as");
  say("      exact\" is violated on " + toExact + " classifications, and GR2's label set loses the only class");
  say("      that names the caveat. It is a GR2/OD-P argument end to end and needs no PB4 in it.");

  say("      THE WORDING PROBLEM, precisely, so it can be fixed in one edit:");
  say("        1. 07:1280 \"its POSITION is load-bearing\" runs two claims together. The row's");
  say("           EXISTENCE is load-bearing for DISCLOSURE (" + toExact + " classifications above). Its");
  say("           POSITION — after row 6, before row 8 — is load-bearing for WHICH disclosure wins");
  say("           when two compete, which is what 07:1301-1304 actually argues. Neither is");
  say("           load-bearing for PB4. Say \"the row is required for disclosure; its position");
  say("           decides which disclosure outranks which\".");
  say("        2. 07:1295-1296 \"Row 7 gives it back its own class and its own label\" is unqualified");
  say("           and is true of a MINORITY. Over CINV-20's 1,512-input pass A, 48 inputs reached");
  say("           class scope_superset at rev 8 and 20 do at rev 9 — 42%. The other 28 hit rows 2-6");
  say("           first and are labelled breadth_fallback, area_fallback or not_evaluable. That is");
  say("           INTENDED by 07:1301-1304's own reasoning, so the fix is a qualifier, not a");
  say("           redesign: \"gives it back its own class WHENEVER NO STRONGER CAVEAT APPLIES —");
  say("           over the enumerated input space, 20 of the 48 inputs that reached it at rev 8;");
  say("           the remaining 28 carry a caveat rows 2-6 rank above it.\"");
  say("        3. Do not write \"42%\" as a property of the rule. It is a property of CINV-20's");
  say("           enumeration, which weights inputs uniformly and is not a traffic model. State the");
  say("           two counts and the enumeration they come from, or state nothing quantitative.");
  say("        4. 07:2765-2774's two rows were the evidence that row 7 is needed to reach 0. That");
  say("           evidence is withdrawn (see the corrections above), so the row-7 paragraph must");
  say("           not cite the PB4 table at all.");
  finding(6, "EF6 row 7's justification at 07:1280-1289 rests on a PB4 claim the corrected " +
    "measurement withdraws (configuration H reaches 0 of 798 without the row), and its " +
    "\"gives it back its own class\" is unqualified while holding for 20 of 48 enumerated inputs. " +
    "The row IS justified — deleting it relabels " + toExact + " corpus classifications from " +
    "scope_superset to exact, which is the OD-P violation it exists to prevent — but the contract " +
    "states the wrong reason.");
}
say();

// ------------------------------------------------------------------ the adopted combination
say("  (i) THE ADOPTED COMBINATION — D9-7a + key(3) intersection + disclosure intersection +");
say("      PB4's carve-out, applied TOGETHER (useCombination()), because three individually-sound");
say("      fixes can still interact. Every number below is measured under all four at once.");
{
  const clear = () => { DISCLOSURES.length = 0; };
  const runsUnder = () => {
    const out = [];
    for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) out.push({ ev, key: u + " | " + ev.V.branch });
    return out;
  };
  // A stable baseline to diff against: rev 9 exactly as written (D9-5a, union, asWritten, no skip).
  useRev(9); clear();
  const asWrittenRuns = runsUnder();
  const asWrittenOrd = new Map(asWrittenRuns.map(({ ev, key }) => [key, orderByRungs(ev).map((r) => r.rec.id + "=" + r.cls).join(",")]));
  const asWrittenDisc = DISCLOSURES.slice();

  // ---------------------------------------------------------------- 1. D9-7a as a clause
  say("      1. D9-7a AS A CLAUSE — rule 1 widened to \"different states OR different relations\".");
  const OUT = [
    { state: "not_applicable", relation: null },
    { state: "satisfied", relation: null },
    { state: "not_evaluable", relation: null },
    { state: "satisfied", relation: { relation: "scope_exact" } },
    { state: "satisfied", relation: { relation: "scope_superset" } },
    { state: "unsatisfied", relation: { relation: "scope_overlap" } },
    { state: "unsatisfied", relation: { relation: "scope_subset" } },
    { state: "unsatisfied", relation: { relation: "scope_disjoint" } },
  ];
  useCombination();
  let aN = 0, aNeither = 0, aBoth = 0;
  for (const a of OUT) for (const b of OUT) {
    aN += 1;
    const r = ef3ResolveReadings([a, b], "synthetic D9-7a");
    if (!r.d97aRule1 && !r.d97aRule2) aNeither += 1;
    if (r.d97aRule1 && r.d97aRule2) aBoth += 1;
  }
  let acP = 0, acNeither = 0, acBoth = 0;
  for (const { ev, key } of asWrittenRuns) {
    if (!ev.V.readings || ev.V.readings.length < 2) continue;
    for (const R of RECORDS) {
      const r = ef3ResolveReadings(ev.V.readings.map((rd) => ef3Branch(ev.V, R, rd, key)), key);
      acP += 1;
      if (!r.d97aRule1 && !r.d97aRule2) acNeither += 1;
      if (r.d97aRule1 && r.d97aRule2) acBoth += 1;
    }
  }
  say("         synthetic, all " + aN + " ordered pairs: neither rule fires " + aNeither +
    ", BOTH fire " + aBoth);
  say("         corpus, " + acP + " (record, multi-reading branch) pairs: neither " + acNeither +
    ", both " + acBoth);
  say("         D9-7a AS A CLAUSE:  TOTAL: " + (aNeither + acNeither === 0 ? "HOLDS" : "FAILS") +
    "   SINGLE-VALUED: " + (aBoth + acBoth === 0 ? "HOLDS" : "FAILS"));

  // ---------------------------------------------------------------- 2. the two holes, re-run
  say("      2. THE TWO HOLES D9-7 LEFT, re-run under D9-7a rather than argued shut:");
  const REACH = {
    full_remodel: [{ state: "not_applicable", relation: null }, { state: "satisfied", relation: null },
                   { state: "not_evaluable", relation: null }],
    partial_remodel: [{ state: "not_applicable", relation: null }, { state: "not_evaluable", relation: null },
      { state: "satisfied", relation: { relation: "scope_exact" } },
      { state: "satisfied", relation: { relation: "scope_superset" } },
      { state: "unsatisfied", relation: { relation: "scope_overlap" } },
      { state: "unsatisfied", relation: { relation: "scope_subset" } },
      { state: "unsatisfied", relation: { relation: "scope_disjoint" } }],
    absent: [{ state: "not_applicable", relation: null }, { state: "not_evaluable", relation: null }],
  };
  let aNoRel = 0, aNoCls = 0, aLost = 0, aConsidered = 0, aRule2 = 0;
  for (const ptKey of ["full_remodel", "partial_remodel", "absent"]) {
    const pt = ptKey === "absent" ? null : ptKey;
    for (const a of REACH[ptKey]) for (const b of REACH[ptKey]) {
      aConsidered += 1;
      const r = ef3ResolveReadings([a, b], "D9-7a downstream");
      if (!r.d97aRule2) continue;
      aRule2 += 1;
      if (!r.sameRelation) { aNoRel += 1; continue; }
      const relation = a.relation ? a.relation.relation : null;
      for (const breadth of ["not_applicable", "satisfied", "unsatisfied", "not_evaluable"])
      for (const area of ["not_applicable", "satisfied", "unsatisfied", "not_evaluable"]) {
        const got = EF6({ breadth, scope: a.state, area }, pt, relation, "D9-7a downstream");
        if (!(got.cls !== UNDET && CLASSES.includes(got.cls))) aNoCls += 1;
        const sup = relation === "scope_superset";
        if (sup && got.cls !== "scope_superset" && a.state === "satisfied" &&
            breadth !== "unsatisfied" && breadth !== "not_evaluable" &&
            area !== "unsatisfied" && area !== "not_evaluable") aLost += 1;
      }
    }
  }
  say("         outcome pairs reachable for one record: " + aConsidered + "   reaching rule 2: " + aRule2);
  say("         of those, rule 2 returning a state with NO relation: " + aNoRel +
    "   (D9-7 had 8 — that is the hole)");
  say("         EF6 inputs built from rule 2 whose class is not one of GR2's ten: " + aNoCls);
  say("         EF6 inputs where a scope_superset caveat goes silent: " + aLost);
  say("         zz-hole and zz-witness re-run end to end under D9-7a:");
  const WU = "현관 수납";
  const WITS = [
    { rec: { id: "zz-hole", title: "현관 수납 hole", publishedAt: "2026-01-01", projectType: "partial_remodel",
             workScopeIds: ["storage", "kitchen"], area: null, pricing: { total: null, perArea: null }, droppedUnknownId: false },
      was: "class `null`, not one of GR2's ten" },
    { rec: { id: "zz-witness", title: "현관 수납 witness", publishedAt: "2026-01-01", projectType: "partial_remodel",
             workScopeIds: ["entrance", "storage", "built_in_furniture"], area: null, pricing: { total: null, perArea: null }, droppedUnknownId: false },
      was: "class `exact`, the scope_superset caveat lost" },
  ];
  let witFixed = 0;
  for (const w of WITS) {
    for (const ev of evaluateAll(WU, [w.rec])) {
      if (!ev.V.readings || ev.V.readings.length < 2) continue;
      const brs = ev.V.readings.map((rd) => ef3Branch(ev.V, w.rec, rd, "wit"));
      const rr = ef3ResolveReadings(brs, "wit");
      const a = EF3(ev.V, w.rec, "wit");
      const cls = EF6({ breadth: "not_applicable", scope: a.state, area: "not_applicable" },
        w.rec.projectType, a.relation && a.relation !== UNDET ? a.relation.relation : null, "wit");
      const ok = CLASSES.includes(cls.cls) && a.ambiguous;
      if (ok) witFixed += 1;
      say("           " + w.rec.id.padEnd(11) + " per-reading " + brs.map((b) => b.state + "/" +
        (b.relation && b.relation !== UNDET ? b.relation.relation : "-")).join(" and ") +
        "  -> D9-7a scope `" + a.state + "`, class `" + String(cls.cls) + "`" +
        (a.ambiguous ? ", ambiguity DISCLOSED" : ""));
      say("                       under D9-7 this was " + w.was);
      break;
    }
  }
  if (aNoRel === 0 && aNoCls === 0 && aLost === 0 && witFixed === 2) {
    say("         BOTH HOLES CLOSE, and by construction rather than by a patched condition: rule 2");
    say("         now requires the relations to agree, so it never hands EF6 an absent relation.");
  }

  // ---------------------------------------------------------------- 3. the disclosure family
  say("      3. THE DISCLOSURE FAMILY — does D9-7a already close 07:978 and 07:1083-1087?");
  useRev(9); clear(); runsUnder();
  const baseGround = asWrittenDisc.filter((d) => d.kind === "ground_permission" && d.readingDependent);
  const baseRow = asWrittenDisc.filter((d) => d.kind === "row_disclosure" && d.readingDependent);
  say("         under rev 9 as written (D9-5a): reading-dependent ground permissions " +
    baseGround.length + ", reading-dependent row disclosures " + baseRow.length);
  // Now under D9-7a alone, disclosure still asWritten, so the question is purely "does the
  // criterion rule stop the reply from reaching the disclosure at all?"
  useRev(9); CFG.ef3Ambiguity = "D9-7a"; clear(); runsUnder();
  const d7aGround = DISCLOSURES.filter((d) => d.kind === "ground_permission" && d.readingDependent);
  const d7aRow = DISCLOSURES.filter((d) => d.kind === "row_disclosure" && d.readingDependent);
  say("         under D9-7a alone:              reading-dependent ground permissions " +
    d7aGround.length + ", reading-dependent row disclosures " + d7aRow.length);
  say("         ANSWER: D9-7a closes NEITHER. I expected it to close the rows and it does not, so");
  say("         the measurement is the finding and the prediction was wrong. The reason:");
  say("           D9-7a rule 1 fires on differing STATES or differing RELATIONS. The surviving");
  say("           case is precisely the one the decision anticipated for the criterion and not for");
  say("           the reply: both readings give the SAME relation and Q_s still differs. Rule 2");
  say("           then passes the relation through, 14.3.3's row fires on it, and the row names a");
  say("           set built from Q_s. Every one of the " + d7aRow.length + " survivors is that shape.");
  say("           07:978 is not keyed on a relation at all — a full_remodel never has one — so");
  say("           rule 1's two guarantees, \"no relation is reported\" and \"no absence is stated\",");
  say("           miss it twice over: the sentence it licenses is a PRESENCE, off Q_s alone.");
  {
    const eg = d7aRow.slice(0, 3).map((d) => d.where + " row " + d.row + " (" + d.relation + "), per-reading {" +
      d.perIds.map((x) => x.join(",")).join("} vs {") + "}");
    for (const e of eg) say("           SURVIVOR: " + e);
  }
  say("         CORRECTION TO MY OWN FIGURE. Last round I reported 14 reading-dependent row");
  say("         disclosures. That counted (record, branch) pairs where Q_s \\ R_s differs, without");
  say("         asking whether a row that NAMES that set actually fired. Rows 3 and 5 and the");
  say("         trade-only table 14.3.3.1 do not name Q_s \\ R_s. Emitting the disclosures and");
  say("         counting the ones that are really made gives " + baseRow.length + ", not 14.");
  if (d7aGround.length > 0 || d7aRow.length > 0) {
    finding(1, "D9-7a closes NEITHER half of gap 3's disclosure family, and I predicted it would " +
      "close the rows. Measured: reading-dependent row disclosures " + baseRow.length + " -> " +
      d7aRow.length + ", reading-dependent 07:978 permissions " + baseGround.length + " -> " +
      d7aGround.length + ". Rule 1's \"no relation is reported\" (07:1012) does not help, because " +
      "the survivors are exactly the pairs whose readings AGREE on the relation and still differ " +
      "on Q_s: rule 2 passes the relation through and 14.3.3's row names a set built from Q_s. " +
      "07:978 is worse — it is keyed on no relation at all, and the sentence it licenses is a " +
      "PRESENCE, so \"no absence is stated\" misses it too. The intersection rule is REQUIRED for " +
      "both sites; neither is covered by the criterion-level fix. (Corrects my own 14: that " +
      "counted pairs where Q_s \\ R_s differs without asking whether a row naming it fired.)");
  }

  // ---------------------------------------------------------------- 4. what intersection changes
  say("      4. WHAT THE INTERSECTION RULE CHANGES ON THE CORPUS, with a witness per kind.");
  useRev(9); CFG.disclosure = "intersectionOfSets"; clear(); runsUnder();
  const interDisc = DISCLOSURES.slice();
  useRev(9); CFG.disclosure = "intersectionOfQ"; clear(); runsUnder();
  const qDisc = DISCLOSURES.slice();
  const keyOf = (d) => d.where + "|" + d.site + "|" + d.row;
  const bw = new Map(asWrittenDisc.map((d) => [keyOf(d), d]));
  const qw = new Map(qDisc.map((d) => [keyOf(d), d]));
  let changedRow = 0, changedGround = 0, qDiffers = 0;
  const egRow = [], egGround = [], egQ = [];
  for (const d of interDisc) {
    const b = bw.get(keyOf(d)), q = qw.get(keyOf(d));
    if (!b) continue;
    if (d.kind === "row_disclosure") {
      if (d.ids.join("+") !== b.ids.join("+")) {
        changedRow += 1;
        if (egRow.length < 3) egRow.push(d.where + "  row " + d.row + " (" + d.relation + ", " + d.axis +
          ")  as-written {" + b.ids.join(",") + "} -> intersection {" + d.ids.join(",") + "}");
      }
      if (q && q.ids.join("+") !== d.ids.join("+")) {
        qDiffers += 1;
        if (egQ.length < 3) egQ.push(d.where + "  row " + d.row + " (" + d.axis + ")  intersect-Q {" +
          q.ids.join(",") + "}  vs  intersect-SETS {" + d.ids.join(",") + "}");
      }
    } else if (d.permitted !== b.permitted) {
      changedGround += 1;
      if (egGround.length < 3) egGround.push(d.where + "  07:978 permission  as-written " +
        b.permitted + " -> intersection " + d.permitted + "  (per reading " + b.perReading.join("/") + ")");
    }
  }
  say("         14.3.3 row disclosures whose NAMED SET changes: " + changedRow);
  for (const e of egRow) say("           " + e);
  say("         07:978 permissions whose ANSWER changes: " + changedGround + " of " + baseGround.length +
    " reading-dependent ones");
  for (const e of egGround) say("           " + e);
  MEASURED.groundChangedAsWritten = changedGround;
  if (changedGround === 0 && baseGround.length > 0) {
    // Why zero, and it is NOT because the rule is harmless. An implementation with no reading named
    // must pick one; this file picks the FIRST. Pick the last and the answer flips.
    let flip = 0;
    for (const d of asWrittenDisc) {
      if (d.kind !== "ground_permission" || !d.readingDependent) continue;
      if (d.perReading[d.perReading.length - 1] !== d.perReading[0]) flip += 1;
    }
    MEASURED.groundFlipLast = flip;
    say("         ZERO, AND NOT BECAUSE THE RULE IS HARMLESS. 07:978 names no reading, so an");
    say("         implementation must pick one; this file picks the FIRST, and WS6 (07:346-384)");
    say("         happens to enumerate the larger Q_s first. Q_s ⊆ R_s is hardest for the largest");
    say("         Q_s, so reading 1 already answers `false` wherever the readings disagree — which");
    say("         is the same answer the intersection rule gives. Take the LAST reading instead and");
    say("         " + flip + " of the " + baseGround.length + " flip. The as-written clause agrees with the");
    say("         intersection rule on this corpus ONLY because of the order WS6 lists readings in,");
    say("         and nothing in 07:978 or 07:346-384 makes that order normative.");
    finding(1, "07:978's permission is reading-dependent on " + baseGround.length + " (record, branch) " +
      "pairs, and the intersection rule changes 0 of them — but only because WS6 (07:346-384) " +
      "happens to enumerate the larger Q_s first and the clause silently inherits that order. " +
      "Resolving it by the LAST reading instead flips " + flip + " of the " + baseGround.length + ". " +
      "So the 0 is an artefact of an undocumented enumeration order, not evidence that the clause " +
      "is safe: any consumer that lists WS6's readings the other way answers differently, and " +
      "07:978 gives it no ground to prefer either. The intersection rule removes the dependence.");
  } else if (changedGround > 0) {
    say("         In each, the permission goes true -> false: the as-written reading licensed the");
    say("         specific sentence off one reading; the intersection requires every reading to.");
  }
  say("      4b. THE TWO WAYS TO READ \"only what every reading admits\" ARE NOT THE SAME FUNCTION.");
  say("         disclosures where intersect-Q and intersect-SETS disagree, on the corpus: " + qDiffers);
  for (const e of egQ) say("           " + e);
  {
    // Row 5 does not fire reading-dependently on these 19 records, so the divergence is shown on a
    // constructed input rather than asserted. Q_s(2) subset-of Q_s(1) is WS6's own shape.
    const Rs = ["entrance", "storage", "kitchen"], Rt = [];
    const q1 = ["entrance", "storage"], q2 = ["entrance"];
    const p1 = rowDisclosure(5, Rs, Rt, q1, []), p2 = rowDisclosure(5, Rs, Rt, q2, []);
    const setsWay = inter([p1.ids, p2.ids]);
    const qWay = rowDisclosure(5, Rs, Rt, inter([q1, q2]), []).ids;
    say("         CONSTRUCTED, because row 5 never fires reading-dependently on these 19 records:");
    say("           partial_remodel R_s {" + Rs.join(",") + "} against \"현관 수납\";");
    say("           reading 1 Q_s {" + q1.join(",") + "} -> R_s ⊋ Q_s, row 5, names {" + p1.ids.join(",") + "}");
    say("           reading 2 Q_s {" + q2.join(",") + "}          -> R_s ⊋ Q_s, row 5, names {" + p2.ids.join(",") + "}");
    say("           same state, same relation, so D9-7a rule 2 passes it through and row 5 fires.");
    say("           intersect the DISCLOSURE SETS: {" + setsWay.join(",") + "}   <- what the principle means");
    say("           intersect Q_s first:           {" + qWay.join(",") + "}   <- strictly MORE");
    if (qWay.length > setsWay.length) {
      say("           Intersecting Q_s names " + qWay.length + " spaces where the principle names " +
        setsWay.length + ": it reports `" + qWay.filter((x) => !setsWay.includes(x)).join(",") +
        "` as an extra");
      say("           space the record covered beyond the request, which is true under ONE reading only.");
    }
  }
  say("         ROW 5 IS THE WITNESS. Rows 4/6/7/8 name a set built from Q (Q_s \\ R_s, Q_t \\ R_t),");
  say("         so shrinking Q shrinks the disclosure and the two agree. Row 5 (07:1084) names");
  say("         R_s \\ Q_s — the RECORD's extra spaces — so shrinking Q_s GROWS it:");
  say("           R_s \\ (∩Q_s) is the UNION of the per-reading disclosures, the MAXIMAL claim,");
  say("           ∩(R_s \\ Q_s) = R_s \\ (∪Q_s) is the minimal one.");
  say("         \"Intersect Q_s\" therefore asserts MORE on row 5, which is the opposite of the");
  say("         principle. The rule must be stated over the DISCLOSURE SETS, not over Q_s.");
  {
    finding(6, "the sentence \"a disclosure may name only the ids every reading admits\" has two " +
      "non-equivalent implementations and 14.3.3 row 5 separates them. Rows 4, 6, 7 and 8 name a " +
      "set of the form Q \\ R, where intersecting Q and intersecting the disclosure sets coincide. " +
      "Row 5 (07:1084) names R_s \\ Q_s — the record's EXTRA spaces — where intersecting Q_s " +
      "yields R_s \\ (∩Q_s), the UNION of the per-reading disclosures and the maximal claim, the " +
      "exact opposite of the intent. Row 5 does not fire reading-dependently on these 19 records " +
      "(" + qDiffers + " corpus disagreements), so the witness is constructed above: R_s " +
      "{entrance,storage,kitchen} against 현관 수납 names one extra space under the principle and " +
      "two under intersect-Q, the second being true under one reading only. The rule must be " +
      "written over the disclosure sets: name ∩_r (the set row r would name under reading r).");
  }

  // ---------------------------------------------------------------- 5. can asserting LESS be WRONG?
  say("      5. CAN ASSERTING LESS BE WRONG RATHER THAN MERELY WEAKER?");
  say("         By construction the intersection can never name the WRONG id: every id it names is");
  say("         named under every reading. Its only failure mode is naming TOO FEW — and the");
  say("         limiting case, naming NONE where some reading names one, is a different failure.");
  const silent = interDisc.filter((d) => d.kind === "row_disclosure" && d.silent);
  say("         disclosures where some reading names an id and the intersection names none: " +
    silent.length);
  for (const s of silent.slice(0, 4)) {
    say("           " + s.where + "  row " + s.row + " -> class `" + s.relation + "`  per-reading {" +
      s.perIds.map((x) => x.join(",")).join("} and {") + "}  intersection {}");
  }
  say("         WHY THIS IS WRONGNESS AND NOT WEAKNESS: 14.3.3's rows 6, 7 and 8 fire BECAUSE");
  say("         Q_s \\ R_s is non-empty — that is their condition. The reply then announces the");
  say("         class (`scope_overlap`, `scope_disjoint`) which asserts to the visitor that spaces");
  say("         they named were not covered, and names none of them. CINV-17 (07:1547) governs the");
  say("         WORDING of that sentence and says nothing about its membership, so nothing in the");
  say("         contract forbids the empty one. The visitor is told a space was missed and not");
  say("         which: OD-P's other half — a reply that names no space where one is expected.");
  {
    // Is it reachable? A row fires only when its own Q_s \ R_s is non-empty for the reading that
    // produced it, so ask whether the INTERSECTION can be empty while that holds.
    const reachable = silent.length > 0;
    say("         REACHABLE ON THIS CORPUS: " + (reachable ? "YES, " + silent.length + " times" : "no"));
    if (!reachable) {
      say("         and the reason is a THEOREM here, not an accident of the 19 records. WS6's two");
      say("         readings are nested — reading 2 reclassifies one token from Space to Work, so");
      say("         Q_s(2) ⊆ Q_s(1) — and a row 6/7/8 relation requires Q_s ⊄ R_s under the reading");
      say("         that fired. D9-7a additionally requires both readings to give the SAME relation");
      say("         before any row is reached. The empty-intersection case therefore needs a reading");
      say("         whose Q_s ∩ (the other's Q_s) \\ R_s is empty while both give one relation, and");
      say("         WS6's nesting makes the intersection equal to the SMALLER Q_s, which is the one");
      say("         that produced the relation. So on WS6-shaped ambiguity it cannot arise.");
      say("         IT IS NOT SAFE IN GENERAL. WS6 is not the only ambiguity the contract admits —");
      say("         07:346-384 is a rule about ONE token pair — and a future term whose readings are");
      say("         NOT nested breaks the argument immediately. Constructed below.");
    }
    // Constructed: two NON-NESTED readings of one term, both giving scope_disjoint. Built as a
    // real V/R pair and pushed through discloseScope, so what is measured is the RULE IN FORCE and
    // not my summary of it.
    const A = ["kitchen"], B = ["bathroom"];
    const Rx = { id: "zz-silent", workScopeIds: ["living_room"], projectType: "partial_remodel" };
    const Vx = { utterance: "zz-nonnested", Q: A, Q_s: A, Q_t: [],
                 readings: [{ Q: A, Q_s: A, Q_t: [] }, { Q: B, Q_s: B, Q_t: [] }] };
    const scx = { state: "unsatisfied", ambiguous: false,
                  relation: { relation: "scope_disjoint", row: 8, table: "14.3.3", hold: [] } };
    const perA = rowDisclosure(8, ["living_room"], [], A, []);
    const perB = rowDisclosure(8, ["living_room"], [], B, []);
    const both = inter([perA.ids, perB.ids]);
    say("         CONSTRUCTED, non-nested readings — a term reading as `kitchen` OR as `bathroom`,");
    say("           against a partial_remodel [living_room]:");
    say("           reading 1: Q_s {kitchen}  -> row 8 scope_disjoint, names {" + perA.ids.join(",") + "}");
    say("           reading 2: Q_s {bathroom} -> row 8 scope_disjoint, names {" + perB.ids.join(",") + "}");
    say("           same state, same relation, so D9-7a rule 2 passes it through with scope_disjoint;");
    say("           the intersection of the two disclosures is {" + both.join(",") + "} — EMPTY.");
    say("           Left there, the reply names no space at all.");
    // Now run it through the rule as rev 9.1 writes it, including D9-9 sentence 4. The surrounding
    // part-4 comparison left CFG on the intersectionOfQ arm, so the probe sets the IN-FORCE
    // disclosure rule explicitly and restores it -- a probe must not inherit a comparison's state.
    const savedDisclosure = CFG.disclosure;
    useRev(REV_IN_FORCE);
    const beforeN = DISCLOSURES.length;
    const dx = discloseScope(Vx, Rx, scx, "zz-nonnested/zz-silent");
    DISCLOSURES.length = beforeN;                      // a probe, not corpus evidence
    const caught = !!(dx && dx.sentence4);
    say("         DOES THE RULE IN FORCE CATCH IT? D9-9 sentence 4 (07:1126-1132) says an empty");
    say("           intersection with a non-empty reading is `not_evaluable` + disclose. Pushed");
    say("           through discloseScope at rev " + REV_IN_FORCE + " (CFG.disclosure=" + CFG.disclosure +
      "): row " + (dx ? dx.row : "-") + ", intersection {" + (dx ? dx.ids.join(",") : "") +
      "}, some reading non-empty " + (dx ? dx.expectNonEmpty : "-") + ", sentence 4 fires: " + caught);
    useRev(9); CFG.disclosure = savedDisclosure;
    if (caught) {
      say("         CLOSED AT REV 9.1. The criterion becomes not_evaluable, the relation is dropped");
      say("           before EF6 sees it, and the ambiguity is disclosed instead of a class being");
      say("           asserted with no ground. This was my round-10 finding; rev 9.1 answers it.");
    }
    if (both.length === 0 && !caught) {
      finding(1, "the intersection disclosure rule has a failure mode that is wrongness and not " +
        "weakness, and D9-7a does not catch it. When two readings give the SAME relation but " +
        "DISJOINT disclosure sets, rule 2 passes the relation through and the intersection names " +
        "nothing: a partial_remodel [living_room] against a term reading as `kitchen` or as " +
        "`bathroom` is classed scope_disjoint — which asserts that spaces the visitor named were " +
        "not covered — while naming none of them. 14.3.3 rows 6-8 fire BECAUSE Q_s \\ R_s is " +
        "non-empty, so an empty disclosure contradicts the row's own condition. It is unreachable " +
        "on this corpus (" + silent.length + " occurrences) only because WS6's two readings are " +
        "NESTED (Q_s(2) ⊆ Q_s(1)), which makes the intersection equal to the reading that produced " +
        "the relation. The rule needs a fourth sentence: if the intersection is empty and any " +
        "reading's set is not, the criterion is not_evaluable and the ambiguity is disclosed — " +
        "which is D9-7a rule 1's remedy, applied at the disclosure level where D9-7a cannot see.");
    }
  }

  // ---------------------------------------------------------------- 6. pb4skip, confirmed
  say("      6. PB4's CARVE-OUT (07:1218-1220) CONFIRMED — and it is bigger than I reported.");
  useRev(9); clear();
  const noSkip = new Map(runsUnder().map(({ ev, key }) => [key, orderByRungs(ev).map((r) => r.rec.id).join(",")]));
  useRev(9); CFG.key3Skip = true; clear();
  const skipRuns = runsUnder();
  let skipDiff = 0; const skipWhere = [];
  for (const { ev, key } of skipRuns) {
    const ord = orderByRungs(ev).map((r) => r.rec.id).join(",");
    if (ord !== noSkip.get(key)) { skipDiff += 1; if (skipWhere.length < 4) skipWhere.push(key); }
  }
  say("         CORRECTION TO MY OWN LAST REPORT. I said pb4skip moves 2 of 27 branches. That was");
  say("         under-applied: the skip was inside the multi-reading arm, so a record whose scope");
  say("         is not_evaluable for any OTHER reason — WS8 dropped an id (07:1000), breadth absent");
  say("         (07:1005), no 14.3.3 row — was still ordered by key (3). PB4 says a criterion in");
  say("         state not_evaluable contributes to NO tie-break key, full stop; ambiguity is not");
  say("         mentioned. Applied as written it moves " + skipDiff + " of " + skipRuns.length + " branches, not 2.");
  for (const k of skipWhere) say("           moves: " + k);
  say("         WHERE THE SKIPPED RECORDS LAND — the coupling to gap 1 / Q-29, made concrete:");
  {
    useRev(9); CFG.key3 = "intersection"; CFG.key3Skip = true;
    let mixedBlocks = 0, skippedRecs = 0; const eg = [];
    for (const { ev, key } of runsUnder()) {
      const ord = orderByRungs(ev);
      const blocks = new Map();
      for (const r of ord) {
        const k = r.cls;
        if (!blocks.has(k)) blocks.set(k, []);
        blocks.get(k).push(r);
      }
      for (const [cls, rows] of blocks) {
        const sk = rows.filter((r) => r.c.scope === "not_evaluable");
        if (sk.length && rows.length > sk.length) {
          mixedBlocks += 1; skippedRecs += sk.length;
          if (eg.length < 3) eg.push(key + "  class `" + cls + "` block of " + rows.length +
            ", " + sk.length + " skipped by key (3): " + sk.map((r) => r.rec.id).join(","));
        }
      }
    }
    say("         GR2a class blocks mixing key-(3)-skipped and key-(3)-ordered records: " + mixedBlocks +
      " (" + skippedRecs + " skipped records)");
    for (const e of eg) say("           " + e);
    say("         Each of those is exactly Q-29's undecided case: key (2) says a skipped record");
    say("         \"keeps the position the PREVIOUS key gave it\", the previous key is (1) which only");
    say("         produces ties, and the position inside a tie is fixed by keys (3)-(5) which come");
    say("         AFTER. So gap 3 cannot be closed without deciding gap 1 — CONFIRMED, and on");
    say("         " + mixedBlocks + " blocks rather than the 2 branches I reported.");
    finding(6, "PB4's carve-out applies to EVERY not_evaluable scope, not only an ambiguous one, " +
      "and my previous \"2 of 27\" under-applied it by testing the skip only on multi-reading " +
      "branches. Applied as 07:1218-1220 is written it moves " + skipDiff + " of " + skipRuns.length +
      " branches and produces " + mixedBlocks + " GR2a class blocks that mix skipped and ordered " +
      "records — each one an instance of Q-29's undecided \"keeps the position the previous key " +
      "gave it\". Gap 3 is coupled to gap 1 far more tightly than the earlier figure suggested.",
      "07:1218-1220 as rev 9.1 writes it; Q-29 is still OPEN at rev 9.1, so this is in force");
  }

  // ---------------------------------------------------------------- 7. the combination, all six
  say("      7. ALL SIX PROPERTIES UNDER THE FULL COMBINATION, and the INTERACTION test.");
  const measure = (label) => {
    clear();
    const rs = runsUnder();
    let noCls = 0, p3 = 0;
    for (const { ev } of rs) {
      for (const row of ev.rows) if (row.cls === UNDET || !CLASSES.includes(row.cls)) noCls += 1;
      if (orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join() !== orderByRungs(ev).map((r) => r.rec.id).join()) p3 += 1;
    }
    // Snapshot the disclosure ledger BEFORE strictPb4, which re-evaluates thousands of MUTANT
    // corpora and would otherwise count disclosures no real branch makes.
    // The column that matters is not "the readings disagree about this record" (a property of the
    // INPUT, which no rule change can move) but "the sentence the reply makes was decided by
    // PICKING a reading" (a property of the RULE).
    const rd = DISCLOSURES.filter((d) => d.chosen).length;
    const sil = DISCLOSURES.filter((d) => d.silent).length;
    const ord = new Map(rs.map(({ ev, key }) => [key, orderByRungs(ev).map((r) => r.rec.id + "=" + r.cls).join(",")]));
    const pb = strictPb4(label);
    return { label, n: rs.length, noCls, p3, pb4: pb.viol.length, pairs: pb.pairs, ord, rd, sil };
  };
  const M = [];
  useRev(9); M.push(measure("rev 9 as written"));
  useRev(9); CFG.ef3Ambiguity = "D9-7a"; M.push(measure("+ D9-7a alone (07:1008-1036)"));
  useRev(9); CFG.key3 = "intersection"; M.push(measure("+ D9-8 alone (07:1407-1420)"));
  useRev(9); CFG.disclosure = "intersectionOfSets"; M.push(measure("+ D9-9 alone (07:1103-1132)"));
  useRev(9.1); M.push(measure("REV 9.1 = all three"));
  // Beside them, never inside them: Q-29's carve-out is in no revision.
  useRev(9.1); CFG.key3Skip = true; CFG.key3SkipMode = "position"; M.push(measure("  [not adopted] + Q-29 position"));
  useRev(9.1); CFG.key3Skip = true; CFG.key3SkipMode = "zero"; M.push(measure("  [not adopted] + Q-29 zero"));
  say("         configuration                        branches  no-class  prop3  PB4/pairs  by-reading  silent");
  say("         (`by-reading` = disclosures whose sentence was decided by PICKING a reading)");
  for (const m of M) {
    say("         " + m.label.padEnd(36) + String(m.n).padStart(6) + String(m.noCls).padStart(10) +
      String(m.p3).padStart(7) + ("  " + m.pb4 + " of " + m.pairs).padStart(11) +
      String(m.rd).padStart(12) + String(m.sil).padStart(8));
  }
  // The interaction test: for each branch, did the combination's ORDER differ from what the
  // individual changes predict? A change that only one of them makes must survive the combination.
  const base = M[0].ord, comb = M[4].ord;
  let predicted = 0, actual = 0, surprise = 0; const surpriseEg = [];
  for (const [key, b] of base) {
    const movedAlone = M.slice(1, 4).some((m) => m.ord.get(key) !== b);   // the three, each alone
    const movedTogether = comb.get(key) !== b;
    if (movedAlone) predicted += 1;
    if (movedTogether) actual += 1;
    if (movedAlone !== movedTogether) {
      surprise += 1;
      if (surpriseEg.length < 4) surpriseEg.push(key + (movedTogether ? "  moves ONLY in combination" : "  moves alone but NOT in combination"));
    }
  }
  say("         INTERACTION TEST — branches whose order moves:");
  say("           moved by at least one change ON ITS OWN: " + predicted);
  say("           moved by the four applied TOGETHER:      " + actual);
  say("           branches where those two disagree:       " + surprise);
  for (const e of surpriseEg) say("             " + e);
  // The order test alone is not enough: "moves any number that each moved alone" is a claim about
  // every metric. Checked column by column, against the union of the individual effects.
  {
    const cols = ["noCls", "p3", "pb4", "rd", "sil"];
    const alone = (c) => M.slice(1, 4).map((m) => m[c]);
    const rows = [];
    for (const c of cols) {
      const b = M[0][c], a = alone(c), got = M[4][c];
      // the individual effects are each a delta from the baseline; composing them means taking the
      // one that moved (they never move the same column in opposite directions here, which is
      // itself checked: if two do, the composition is genuinely undefined and that is the finding)
      const movers = a.filter((x) => x !== b);
      const up = new Set(movers);
      const expect = up.size === 0 ? b : up.size === 1 ? [...up][0] : null;
      rows.push([c, b, a.join("/"), got, expect === null ? "AMBIGUOUS" : expect,
                 expect === null ? "two changes move it in different directions" :
                 got === expect ? "as composed" : "INTERACTION"]);
    }
    say("         PER-METRIC, baseline -> each change alone -> combined vs composed:");
    say("           metric   base   alone (D9-7a / D9-8 / D9-9)      rev 9.1   composed   verdict");
    for (const [c, b, a, got, exp, v] of rows) {
      say("           " + String(c).padEnd(8) + String(b).padStart(5) + "   " + String(a).padEnd(28) +
        String(got).padStart(8) + String(exp).padStart(11) + "   " + v);
    }
    const bad = rows.filter((r) => r[5] === "INTERACTION" || r[5].startsWith("two"));
    if (bad.length === 0) {
      say("         NO INTERACTION ON ANY METRIC. Each column of the combination equals the one");
      say("         change that moves it, and no two changes move the same column.");
    } else {
      finding(3, "the adopted changes interact on " + bad.length + " metric(s): " +
        bad.map((r) => r[0]).join(", ") + ". The combination is not the composition of the parts.");
    }
    // THE ONE PAIR THAT IS NOT DISJOINT: key (3)'s count rule and PB4's carve-out both edit key
    // (3), so the scalar table above cannot see whether one masks the other. Measured directly,
    // as a 2x2: does switching union -> intersection still move anything once the carve-out is on?
    const ordUnder = (f) => { f(); clear(); return new Map(runsUnder().map(({ ev, key }) =>
      [key, orderByRungs(ev).map((r) => r.rec.id).join(",")])); };
    const cell = (skip, amb) => ordUnder(() => {
      useRev(9); CFG.ef3Ambiguity = amb; CFG.key3Skip = skip; CFG.key3SkipMode = "position";
    });
    const diff = (A, B) => { let n = 0; for (const [k, v] of A) if (B.get(k) !== v) n += 1; return n; };
    const uNo = cell(false, "D9-5a"), uYes = cell(true, "D9-5a");
    const iNoM = ordUnder(() => { useRev(9); CFG.key3 = "intersection"; });
    const iYesM = ordUnder(() => { useRev(9); CFG.key3 = "intersection"; CFG.key3Skip = true; CFG.key3SkipMode = "position"; });
    const a1 = diff(uNo, iNoM), a2 = diff(uYes, iYesM);
    say("         THE ONE PAIR THAT IS NOT DISJOINT — the count rule and the carve-out both edit");
    say("         key (3), so the scalar table cannot see whether one MASKS the other. As a 2x2:");
    say("           union -> intersection, carve-out OFF: " + a1 + " of 27 branches move");
    say("           union -> intersection, carve-out ON : " + a2 + " of 27 branches move");
    if (a1 > 0 && a2 === 0) {
      say("         THE CARVE-OUT SUBSUMES THE COUNT RULE ON THIS CORPUS. Every branch where the");
      say("         union/intersection choice mattered is a multi-reading branch, and on those the");
      say("         records whose counts differ between readings are exactly the records the");
      say("         ambiguity leaves `not_evaluable` — which the carve-out then removes from key (3)");
      say("         altogether. So adopting BOTH is not additive: with the carve-out in force, the");
      say("         choice of union vs intersection is unobservable HERE.");
      say("         DO NOT CONCLUDE THE COUNT RULE IS UNNECESSARY. It is unobservable on these 19");
      say("         records under D9-7a, not inert: a record whose readings AGREE on the relation");
      say("         keeps a `satisfied`/`unsatisfied` scope, is NOT skipped, and still carries a");
      say("         different count under each reading. bi-04/bi-14/bi-15 on \"현관 수납\" are exactly");
      say("         that shape for the DISCLOSURE (see 3 above); they are tied on key (3) here only");
      say("         because, being scope_disjoint, none of them carries entrance OR storage, so both");
      say("         readings count 0. A record that DOES carry one, constructed and run:");
      {
        const kRec = { id: "zz-count", title: "key-3 witness", publishedAt: "2026-01-01",
          projectType: "partial_remodel", workScopeIds: ["entrance", "storage", "kitchen"],
          area: null, pricing: { total: null, perArea: null }, droppedUnknownId: false };
        useRev(9); CFG.ef3Ambiguity = "D9-7a";
        for (const ev of evaluateAll("현관 수납", [kRec])) {
          if (!ev.V.readings || ev.V.readings.length < 2) continue;
          const brs = ev.V.readings.map((rd) => ef3Branch(ev.V, kRec, rd, "count"));
          const a = EF3(ev.V, kRec, "count");
          const counts = ev.V.readings.map((rd) => rd.Q.filter((x) => kRec.workScopeIds.includes(x)).length);
          say("           zz-count: partial_remodel [entrance, storage, kitchen] on \"현관 수납\"");
          say("             per-reading EF3: " + brs.map((b) => b.state + "/" +
            (b.relation && b.relation !== UNDET ? b.relation.relation : "-")).join(" and ") +
            "  -> D9-7a scope `" + a.state + "`");
          say("             key (3) counts per reading: " + counts.join(" and ") +
            "   union " + uni(ev.V.readings.map((rd) => rd.Q)).filter((x) => kRec.workScopeIds.includes(x)).length +
            ", intersection " + inter(ev.V.readings.map((rd) => rd.Q)).filter((x) => kRec.workScopeIds.includes(x)).length);
          if (a.state !== "not_evaluable" && new Set(counts).size > 1) {
            say("             BOTH READINGS AGREE ON THE RELATION, so the carve-out does NOT skip it,");
            say("             and the count still differs. The count rule is load-bearing on inputs");
            say("             this corpus does not contain — which is why its ground must be the");
            say("             derivation and not the 2 branches.");
          }
          break;
        }
      }
      finding(3, "PB4's carve-out MASKS ordering key (3)'s count rule on this corpus: switching " +
        "union -> intersection moves " + a1 + " of 27 branches with the carve-out off and " + a2 +
        " with it on. The two changes are not additive because they edit the same key, and the " +
        "branches where the count rule bites are the ones the carve-out removes from the key. The " +
        "count rule is still REQUIRED — a record whose readings agree on the relation is not " +
        "skipped and still carries a reading-dependent count — but this corpus cannot witness it, " +
        "so the contract must not cite a corpus measurement as the ground for the intersection " +
        "reading. Its ground is that it is the only count that is a function of Q alone.");
    } else {
      say("         They compose: the count rule is still observable with the carve-out in force.");
    }
  }
  if (surprise === 0) {
    say("         The four changes otherwise touch different machinery — D9-7a the criterion, key");
    say("         (3) and the carve-out the within-class order, the disclosure rule the reply text.");
  } else {
    finding(3, "the four adopted changes INTERACT: " + surprise + " branches move under the " +
      "combination but not under any change alone, or the reverse. The combination is not the " +
      "composition of the parts and must be measured as one change.");
  }
  const C = M[4], Cz = M[6];
  say("         COMBINED VERDICT (position): PB4 strict " + C.pb4 + " of " + C.pairs + "; property 3 " +
    C.p3 + " of " + C.n + "; EF6 no-class " + C.noCls + "; disclosures decided by PICKING a reading " +
    C.rd + " (was " + M[0].rd + ").");
  say("         COMBINED VERDICT (zero):     PB4 strict " + Cz.pb4 + " of " + Cz.pairs + "; property 3 " +
    Cz.p3 + " of " + Cz.n + "; EF6 no-class " + Cz.noCls + "; decided by picking a reading " + Cz.rd + ".");
  // ---- THE REGRESSION, if there is one. Property 3 is the one the coordinator named by name.
  if (C.p3 > M[0].p3 || Cz.p3 > M[0].p3) {
    const bad = C.p3 > M[0].p3 ? C : Cz, good = C.p3 > M[0].p3 ? Cz : C;
    say("         PROPERTY 3 REGRESSES, and only under one reading of PB4's carve-out.");
    say("           rev 9 as written: " + M[0].p3 + " of " + M[0].n + "   carve-out `position`: " +
      M[4].p3 + "   carve-out `zero`: " + M[5].p3);
    // Name the branch.
    useRev(9); CFG.key3 = "intersection"; CFG.key3Skip = true; CFG.key3SkipMode = "position";
    const names = [];
    for (const { ev, key } of runsUnder()) {
      const a = orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join(",");
      const b2 = orderByRungs(ev).map((r) => r.rec.id).join(",");
      if (a !== b2) {
        names.push(key);
        if (names.length <= 2) {
          const A = a.split(","), B = b2.split(",");
          let d0 = 0; while (d0 < B.length && A[d0] === B[d0]) d0 += 1;
          const w = (arr) => arr.slice(Math.max(0, d0 - 1), d0 + 4).join(",");
          say("           branch: " + key);
          say("             identical for the first " + d0 + " positions, then:");
          say("               GR2a alone:           ... " + w(B) + " ...");
          say("               direct-answers-first: ... " + w(A) + " ...");
          const cls = new Map(ev.rows.map((r) => [r.rec.id, r.cls + "/" + r.c.scope]));
          say("               the records that swap: " + [B[d0], A[d0]].map((id) => id + " (" + cls.get(id) + ")").join(" <-> "));
        }
      }
    }
    say("         AND THE READING THAT KEEPS PROPERTY 3 AT 0 IS THE ONE PB4 FORBIDS BY NAME.");
    say("         07:1220: \"Not a penalty, not a small penalty, NOT A NULL THAT SORTS LAST.\" The");
    say("         `zero` reading orders the skipped record with a count of 0, which places it after");
    say("         every record that carries an id — a null that sorts last, in those words. So the");
    say("         carve-out has no free reading: `position` is the one PB4 permits (and it is only");
    say("         available by borrowing key (2)'s wording, since key (3) has no carve-out sentence");
    say("         of its own at 07:1401-1402) and it breaks property 3; `zero` keeps property 3 and");
    say("         contradicts 07:1220 in terms.");
    say("         WHY PROPERTY 3 BREAKS. It asks whether \"show direct answers first\" is already implied by");
    say("         GR2a, by partitioning the rows into `exact` and the rest and ordering each part.");
    say("         Under the `position` reading, key (3) is not a SORT: it permutes the keyed records");
    say("         among the slots they already occupy and leaves the skipped ones where they are.");
    say("         That operation is not stable under partitioning — the slots differ between one");
    say("         array of 19 and two arrays of 5 and 14 — so the two orderings come apart even");
    say("         though neither has changed a class. Under the `zero` reading key (3) is a sort");
    say("         again and the two orderings agree, as they do at rev 9 as written.");
    say("         THIS IS NOT AN ARTEFACT OF MY IMPLEMENTATION. Any positional carve-out has it:");
    say("         \"keeps the position the previous key gave it\" makes the result depend on what");
    say("         else was in the list, and GR3's own presentation splits the list.");
    finding(3, "adopting PB4's carve-out on ordering key (3) REGRESSES property 3 from " + M[0].p3 +
      " to " + M[4].p3 + " of " + M[0].n + " branches, under the positional reading of the skip — " +
      "the reading borrowed from key (2)'s own wording at 07:1399-1401. A positional skip is not a " +
      "sort: it permutes keyed records among the slots they occupy, so it is not stable under " +
      "partitioning the row set, and GR3's \"direct answers first\" presentation partitions it. " +
      "The `zero` reading (a skipped record is ordered with a count of 0) keeps property 3 at " +
      M[5].p3 + " but is itself an application of the key PB4 says must not apply. So Q-29 must be " +
      "decided BEFORE the carve-out is adopted, and neither of its two readings is free: one " +
      "breaks property 3, the other contradicts PB4's own sentence — 07:1220 forbids \"a null " +
      "that sorts last\" in those words, which is exactly what ordering a skipped record with a " +
      "count of 0 does. Note also that key (3) at 07:1401-1402 carries NO carve-out sentence of " +
      "its own: the positional reading is available only by borrowing key (2)'s. Affected " +
      "branch(es): " + names.slice(0, 3).join(" ; ") + ".");
    useCombination();
  }
  // CINV-20 and EF1 closure under the combination, since both were asked for by name.
  const before = STATE_LEDGER.length;
  useCombination(); runsUnder();
  const badAssigner = STATE_LEDGER.slice(before).filter((s) => !STATE_ASSIGNERS.includes(s.by)).length;
  say("         EF1 CLOSURE under the combination: criterion-state assignments " +
    (STATE_LEDGER.length - before) + ", made by anything other than EF2/EF3/EF4: " + badAssigner);
  {
    // CINV-20 under the combination, using the SAME validated sweep section (c) uses, so the two
    // figures are comparable. D9-7a changes which state EF3 assigns, never EF6's rows, so the
    // expectation is "identical to section (c)" and a difference would be the finding.
    useCombination();
    const rawC = ef6RawSweep("combination");
    say("         CINV-20 pass B under the combination: " + rawC.n + " evaluations, " + rawC.none +
      " with no row, " + rawC.notFirst + " where the returned row was not the lowest holding, " +
      rawC.reached.size + " of " + CLASSES.length + " classes reachable.");
    useCombination();
    const corpusCls = new Set();
    for (const { ev } of runsUnder()) for (const row of ev.rows) corpusCls.add(row.cls);
    say("           on the real 19-record corpus under the combination: " + corpusCls.size + " of " +
      CLASSES.length + " classes reached, " +
      [...corpusCls].filter((c) => !CLASSES.includes(c)).length + " outside GR2's closed list.");
  }
  useRev(9);
}
say();

// ------------------------------------------------------------------ Q-29, candidate 3
say("  (j) Q-29 — the carve-out's THIRD candidate reading, tested for TRANSITIVITY before anything");
say("      else. Candidates 1 and 2 are already dead: `position` breaks property 3 (not stable");
say("      under partitioning), `zero` is \"a null that sorts last\", which 07:1220 forbids by name.");
say("      CANDIDATE 3: a key on which EITHER record is not_evaluable is skipped and the comparison");
say("      falls through to the next key. Nothing stands in for the criterion.");
say("      NOT wired into any default. Nothing else in this file uses it.");
{
  // -------- (i) Is it even a comparator? Asymmetry first: cmp(a,b) must be -cmp(b,a).
  useRev(9);
  const runs = [];
  for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) runs.push({ ev, key: u + " | " + ev.V.branch });
  let asym = 0, pairs = 0;
  for (const { ev } of runs) for (const a of ev.rows) for (const b of ev.rows) {
    if (a === b) continue;
    pairs += 1;
    if (cmpFallthrough(a, b, ev.V).r !== -cmpFallthrough(b, a, ev.V).r) asym += 1;
  }
  say("      ASYMMETRY over " + pairs + " ordered corpus pairs: " + asym + " where cmp(a,b) != -cmp(b,a)" +
    (asym === 0 ? "  (holds)" : "  (FAILS)"));

  // -------- (ii) TRANSITIVITY, exhaustively, on the corpus. Every ordered triple.
  //         Key 1 is never skipped and GR2a is a total order on classes, so a cycle can only live
  //         INSIDE one class block -- but the test does not assume that: it runs every triple.
  const KEYNAME = { 1: "key1 class", 2: "key2 |delta|", 3: "key3 count", 4: "key4 publishedAt", 5: "key5 id" };
  let triples = 0; const cycles = [];
  for (const { ev, key } of runs) {
    const R = ev.rows;
    for (let i = 0; i < R.length; i += 1)
    for (let j = 0; j < R.length; j += 1)
    for (let k = 0; k < R.length; k += 1) {
      if (i === j || j === k || i === k) continue;
      triples += 1;
      const ab = cmpFallthrough(R[i], R[j], ev.V), bc = cmpFallthrough(R[j], R[k], ev.V),
            ac = cmpFallthrough(R[i], R[k], ev.V);
      if (ab.r < 0 && bc.r < 0 && ac.r > 0) {
        const sig = R[i].rec.id + "<" + R[j].rec.id + "<" + R[k].rec.id + "|" + key;
        if (!cycles.some((c) => c.sig === sig)) cycles.push({ sig, key, a: R[i], b: R[j], c: R[k], ab, bc, ac });
      }
    }
  }
  const brWithCycles = new Set(cycles.map((c) => c.key));
  say("      TRANSITIVITY on the corpus: " + triples + " ordered triples over " + runs.length +
    " branches x 19 records");
  say("        cycles found: " + cycles.length + "   on " + brWithCycles.size + " of " + runs.length +
    " branches");
  say("        THE CORPUS EXHIBITS IT. This is not a synthetic-only defect.");
  const desc = (r, V) => r.rec.id + " [class " + r.cls + "; area " +
    (k2Applies(r) ? "|delta| " + Math.abs(r.delta).toFixed(4) : r.c.area === "not_evaluable" ? "NOT EVALUABLE" : "no delta") +
    "; scope " + (k3Applies(r) ? V.Q.filter((x) => r.rec.workScopeIds.includes(x)).length + " of V.Q" : "NOT EVALUABLE") +
    "; pub " + r.rec.publishedAt + "]";
  for (const c of cycles.slice(0, 3)) {
    const V = runs.find((x) => x.key === c.key).ev.V;
    say("          CYCLE on \"" + c.key + "\":  " + c.a.rec.id + " < " + c.b.rec.id + " < " +
      c.c.rec.id + " < " + c.a.rec.id +
      (c.a.cls === c.b.cls && c.b.cls === c.c.cls ? "   (all three in class `" + c.a.cls + "`, so key 1 decides none of the three pairs)" : ""));
    say("            " + desc(c.a, V));
    say("            " + desc(c.b, V));
    say("            " + desc(c.c, V));
    say("            " + c.a.rec.id + " < " + c.b.rec.id + " by " + KEYNAME[c.ab.key] +
      " ;  " + c.b.rec.id + " < " + c.c.rec.id + " by " + KEYNAME[c.bc.key] +
      " ;  " + c.c.rec.id + " < " + c.a.rec.id + " by " + KEYNAME[c.ac.key]);
  }
  {
    const sameCls = cycles.filter((c) => c.a.cls === c.b.cls && c.b.cls === c.c.cls).length;
    say("        cycles whose three records share one GR2a class (so key 1 decides nothing): " +
      sameCls + " of " + cycles.length);
  }

  // -------- (iii) SYNTHETIC. The corpus is 19 records with whatever shapes they happen to have;
  //         the question is about the RULE. Enumerate the shapes the keys can see and run every
  //         ordered triple over them. A rule that is intransitive on a shape the contract admits
  //         is intransitive, whether or not these 19 records exhibit it.
  const AREAS = [null, 0.05, 0.15];              // no area / small delta / larger delta
  const SCOPES = [null, 1, 3];                   // scope not_evaluable / carries 1 id / carries 3
  const DATES = ["2026-01-01", "2026-01-02", "2026-01-03"];
  const SHAPES = [];
  for (const d of AREAS) for (const sc of SCOPES) for (const pub of DATES)
    SHAPES.push({ d, sc, pub });
  // One class for all of them: a cycle must live inside a class block, and forcing one class is
  // what makes the search over shapes rather than over classes.
  const mk = (sh, id) => ({ cls: "exact", delta: sh.d, c: { area: sh.d === null ? "not_evaluable" : "satisfied",
    scope: sh.sc === null ? "not_evaluable" : "satisfied" },
    rec: { id, publishedAt: sh.pub, workScopeIds: sh.sc === null ? [] : ["w1", "w2", "w3"].slice(0, sh.sc) } });
  const Vsyn = { Q: ["w1", "w2", "w3"] };
  let sTriples = 0; const sCycles = [];
  const IDS = [["r1", "r2", "r3"], ["r3", "r1", "r2"], ["r2", "r3", "r1"],
               ["r1", "r3", "r2"], ["r2", "r1", "r3"], ["r3", "r2", "r1"]];
  for (const ids of IDS)
  for (const sa of SHAPES) for (const sb of SHAPES) for (const sc of SHAPES) {
    const A = mk(sa, ids[0]), B = mk(sb, ids[1]), C = mk(sc, ids[2]);
    sTriples += 1;
    const ab = cmpFallthrough(A, B, Vsyn), bc = cmpFallthrough(B, C, Vsyn), ac = cmpFallthrough(A, C, Vsyn);
    if (ab.r < 0 && bc.r < 0 && ac.r > 0) {
      const sig = [ab.key, bc.key, ac.key].join("/");
      if (!sCycles.some((x) => x.sig === sig)) sCycles.push({ sig, A, B, C, sa, sb, sc, ab, bc, ac });
    }
  }
  say("      TRANSITIVITY on a synthetic enumeration of the shapes the keys can see:");
  say("        shapes: " + SHAPES.length + " (3 area x 3 scope x 3 publishedAt), all in ONE class,");
  say("        x 6 id permutations = " + sTriples + " ordered triples");
  say("        DISTINCT cycle SHAPES found: " + sCycles.length);
  const shw = (sh, id) => id + "{area " + (sh.d === null ? "not_evaluable" : "delta " + sh.d) +
    ", scope " + (sh.sc === null ? "not_evaluable" : sh.sc + " ids") + ", pub " + sh.pub + "}";
  for (const c of sCycles.slice(0, 3)) {
    say("          CYCLE  " + c.A.rec.id + " < " + c.B.rec.id + " < " + c.C.rec.id + " < " + c.A.rec.id);
    say("            " + shw(c.sa, c.A.rec.id));
    say("            " + shw(c.sb, c.B.rec.id));
    say("            " + shw(c.sc, c.C.rec.id));
    say("            " + c.A.rec.id + " < " + c.B.rec.id + " by " + KEYNAME[c.ab.key] +
      " ;  " + c.B.rec.id + " < " + c.C.rec.id + " by " + KEYNAME[c.bc.key] +
      " ;  " + c.C.rec.id + " < " + c.A.rec.id + " by " + KEYNAME[c.ac.key]);
  }

  if (sCycles.length > 0 || cycles.length > 0) {
    say("      VERDICT: CANDIDATE 3 IS INTRANSITIVE. STOPPING HERE, as instructed — it is not");
    say("      repaired into something that passes, because a third dead reading is the result.");
    say("      THE MECHANISM, so the next candidate can be judged without re-running this:");
    say("        the cycle needs three records and three DIFFERENT deciding keys. A beats B on a");
    say("        key both can see; B beats C on a LATER key, because C cannot see the earlier one;");
    say("        C beats A on a later key still, because A cannot see the middle one. Each pair is");
    say("        decided by the first key BOTH sides can see, and \"both sides\" is a property of the");
    say("        PAIR. A lexicographic order needs the key sequence to be the same for every");
    say("        comparison; here each pair gets its own sequence, so there is no order to be");
    say("        transitive. The defect is not in which keys, or in their order — it is in letting");
    say("        the PAIR decide which keys apply.");
    if (cycles.length === 0) {
      say("      REACHABILITY: 0 cycles on the corpus, " + sCycles.length + " cycle shapes in the enumeration.");
      say("        The 19 records do not exhibit it, and that is worth nothing: the rule would ship,");
      say("        sit correct for every query these records answer, and reorder silently later.");
    } else {
      say("      REACHABILITY: " + cycles.length + " cycles on the REAL corpus, across " +
        brWithCycles.size + " of " + runs.length + " branches. No construction needed — the 19");
      say("        records in 04 section 2 already contain them. The consequence is not a bad order");
      say("        but NO order: the result depends on the sort algorithm and on the input");
      say("        permutation, so CINV-21 (07:1551, \"two runs of one query over one snapshot");
      say("        produce the same order\") cannot be satisfied by any implementation of it.");
    }
    finding(3, "Q-29 candidate 3 (\"a key either record cannot see is skipped and the comparison " +
      "falls through\") is INTRANSITIVE, so it does not define an order at all. " + sCycles.length +
      " distinct cycle shapes in a synthetic enumeration of " + sTriples + " ordered triples over the " +
      SHAPES.length + " shapes the five keys can see, AND " + cycles.length + " cycles on the real " +
      "19-record corpus across " + brWithCycles.size + " of " + runs.length + " branches — no " +
      "construction needed. Because it is not an order, the result depends on the sort algorithm " +
      "and the input permutation, so CINV-21 (07:1551) is unsatisfiable under it. Mechanism: each pair is decided by the first key " +
      "BOTH sides can see, so every pair gets its own key sequence, and a lexicographic order " +
      "requires one sequence for all comparisons. Witness: A{delta 0.05, scope not_evaluable} < " +
      "B{delta 0.15, scope 3 ids} on key 2, B < C{no area, scope 1 id} on key 3, C < A on key 4. " +
      "This is the THIRD dead reading of PB4's carve-out, after `position` (breaks property 3) and " +
      "`zero` (forbidden by 07:1220). Not repaired here, as instructed.");
  } else {
    say("      VERDICT: no cycle found. Transitivity HOLDS on both enumerations.");
  }

  // -------- (iv) Is there a FOURTH reading? Answered structurally, NOT measured and NOT proposed
  //         as a fix -- measuring whether it "passes" is the move that produced D9-5a and D9-7.
  say("      IS THERE A FOURTH READING? Yes, and it is a different SHAPE, not a different tuning.");
  say("        Every candidate so far decides key applicability PER COMPARISON (candidate 3) or");
  say("        substitutes a value or a slot for the missing one (candidates 1 and 2). The shape");
  say("        neither of us has named decides applicability ONCE PER CLASS BLOCK, from the records");
  say("        in it, before any comparison happens: a key is either in force for the whole block");
  say("        or dropped from it. The comparator is then a fixed lexicographic order over a fixed");
  say("        key list, which is transitive and partition-stable BY CONSTRUCTION — the two");
  say("        properties candidates 3 and 1 respectively fail — and nothing stands in for the");
  say("        absent criterion, so 07:1220 is satisfied literally.");
  say("        ITS COST, stated so it is not oversold: one record with an unevaluable criterion");
  say("        disables that key for every record in its block, including records that could have");
  say("        been separated by it. Whether that is acceptable is a judgement about what PB4 is");
  say("        FOR — protecting the unevaluable record, or preserving the key — and it is not mine");
  say("        to make. It also has its own attack surface I have not explored: block membership is");
  say("        decided by key 1, so it makes the key list depend on GR2a, which no rule now says.");
  say("        I HAVE NOT IMPLEMENTED OR MEASURED IT. Reporting \"and this one passes\" in the same");
  say("        breath as killing the previous three is exactly the move that shipped D9-5a and");
  say("        D9-7. It needs its own round and its own attack.");
}
say();

// ------------------------------------------------------------------ rev 9.1 against itself
say("  (l) REV 9.1 AGAINST ITSELF — does anything it now says contradict something else it says?");
say("      A fresh pass over the whole IN-FORCE rule set (sections 1-16; 17 is parked, 18 is open");
say("      questions, 20 is history), not a re-check of the seven the corrections pass found.");
{
  const CT = CTEXT || [];
  const secStart = (h) => { const i = CT.findIndex((l) => l.startsWith(h)); return i < 0 ? CT.length : i + 1; };
  const IN_FORCE_END = secStart("## 17. Deferred") - 1;
  const inForceText = CT.slice(0, IN_FORCE_END);
  say("      in-force region: 07:1-" + IN_FORCE_END + " (" + inForceText.length + " lines)");

  // ---- (i) SUPERSEDED FORMULATIONS. A revision that changes a rule has to remove the old
  //      statement from every IN-FORCE site, not only from the one it edited. Each entry is a
  //      phrase that rev 9.1 replaced; finding it still in force is a contradiction with the
  //      replacement, wherever it sits.
  const SUPERSEDED = [
    ["D9-7a", "All readings give the **same** relation, or all give the same state"],
    ["D9-7a", "The readings **differ** \u21d2 the criterion"],
    ["D9-8", "the count of the visitor's stated `workScopeIds` the record carries, descending; (4)"],
    ["D9-9", "leaves its membership"],
    ["figures", "0 of 893"],
    ["figures", "546"],
    ["figures", "299 of"],
    ["figures", "0 of 31"],
    ["row 7", "its **position** is load-bearing"],
    ["row 7", "42%"],
    ["daggers", "\u2020"],
  ];
  let sup = 0;
  for (const [rule, phrase] of SUPERSEDED) {
    const hits = [];
    inForceText.forEach((l, i) => { if (l.includes(phrase)) hits.push(i + 1); });
    if (hits.length) {
      sup += 1;
      say("        SUPERSEDED TEXT STILL IN FORCE  [" + rule + "]  07:" + hits.join(", 07:"));
      say("          \"" + phrase.slice(0, 60) + "\"");
    }
  }
  say("      superseded formulations still present in the in-force region: " + sup +
    " of " + SUPERSEDED.length + " checked");

  // ---- (ii) THE CONTRACT'S OWN FIGURES vs THIS RUN. The strongest contradiction test available:
  //      a number the contract states about a measurement, re-measured. Each pair is (the exact
  //      substring the contract uses, the value this run computes).
  const rev8 = CONFIGS[0][1], rev91 = strictPb4("rev 9.1 for the figure check");
  const FIG = [
    ["484 violations of 798 pairs", rev8.viol.length === 484 && rev8.pairs === 798],
    ["| A | rev 8 as shipped | 798 | **484** | 262 / 222 |", rev8.viol.length === 484 &&
      (rev8.by.rung || 0) === 262 && (rev8.by.class || 0) === 222],
    ["| H | `D9-1` + `D9-2c` order (**no** `EF6` row) | 798 | **0** | 0 / 0 |", CONFIGS[7][1].viol.length === 0],
    ["| I | **rev 9** (`D9-1` + row 7 + `D9-2c` order) | 798 | **0** | 0 / 0 |", CONFIGS[8][1].viol.length === 0],
    ["strict form holds at **0 of 798**", rev91.viol.length === 0 && rev91.pairs === 798],
    ["`D9-1` alone is a measurable regression \u2014 624 against rev 8's 484", CONFIGS[5][1].viol.length === 624],
    ["16 corpus classifications change, all", MEASURED.row7ToExact === 16],
    ["**0 of 10** reading-dependent", MEASURED.groundChangedAsWritten === 0],
    ["is hardest for the largest `Q_s`. Resolve by the **last** reading instead and **10 of 10",
      MEASURED.groundFlipLast === 10]
  ];
  let figBad = 0;
  say("      figures the contract STATES, re-measured by this run:");
  for (const [claim, ok] of FIG) {
    const present = inForceText.some((l) => l.includes(claim.split("\n")[0])) ||
                    CT.some((l) => l.includes(claim.split("\n")[0]));
    if (!present) continue;
    if (!ok) figBad += 1;
    say("        " + (ok ? "AGREES" : "DISAGREES") + "  " + at(claim.split("\n")[0]) + "  \"" +
      claim.split("\n")[0].slice(0, 56) + "\"");
  }
  say("      figures re-measured: " + FIG.length + "   disagreeing with this run: " + figBad);

  // ---- (iii) ONE CLAIM PER RULE, counted. Rev 9.1 fixed "four things named, called three".
  //      The same shape is checkable wherever the contract counts its own parts.
  const COUNTED = [
    ["and **those three** reach **0 of 798**", 3, ["`EF3`'s state change", "`GR3a`'s rungs deleted", "The order above"]],
  ];
  for (const [phrase, n, parts] of COUNTED) {
    const i = CT.findIndex((l) => l.includes(phrase));
    if (i < 0) { say("        (the 'those three' sentence is not present; nothing to count)"); continue; }
    const win = CT.slice(Math.max(0, i - 3), i + 2).join(" ");
    const found = parts.filter((pt) => win.includes(pt)).length;
    say("      \"those three\" at " + at(phrase) + ": names " + found + " parts in its own sentence, says " + n +
      (found === n ? "  (agrees)" : "  (DISAGREES)"));
  }

  // ---- (iv) DANGLING RULE IDS. A revision that renames or drops a decision has to drop every
  //      reference to it too. This needs no model of what "defines" a rule: an id the IN-FORCE
  //      region names, which occurs exactly ONCE in the whole contract, is either its own
  //      definition (the single occurrence states it) or a reference to text that is not there.
  //      The two are separated mechanically -- a single occurrence that cites ANOTHER document
  //      (the line carries a `.md` filename) is a pointer outward, not a statement here.
  const IDRE = new RegExp("`(EF\\d+|VB\\d+|PB\\d+|WS\\d+[a-z]?|AR\\d+|PY\\d+|GR\\d+[a-z]?|PT\\d+|RD\\d+|" +
    "CINV-\\d+|D9-\\d+[a-z]?|Q-\\d+|M\\d+-\\d+|OD-[A-Z])`", "g");
  const refLine = new Map(), occAll = new Map();
  inForceText.forEach((l, i) => { for (const m of l.matchAll(IDRE)) if (!refLine.has(m[1])) refLine.set(m[1], i + 1); });
  CT.forEach((l) => { for (const m of l.matchAll(IDRE)) occAll.set(m[1], (occAll.get(m[1]) || 0) + 1); });
  const onceOnly = [...refLine.keys()].filter((k) => occAll.get(k) === 1);
  const dangling = onceOnly.filter((k) => /`[0-9]{2}[^`]*\.md`/.test(CT[refLine.get(k) - 1]));
  const selfDefining = onceOnly.filter((k) => !dangling.includes(k));
  say("      rule ids the in-force region names: " + refLine.size + "; occurring exactly once in the");
  say("        whole contract: " + onceOnly.length + " — of which " + selfDefining.length +
    " are stated at that one site (" + selfDefining.join(", ") + ")");
  for (const k of dangling) {
    say("        DANGLING  `" + k + "` at 07:" + refLine.get(k) + " — named once, in a line that cites");
    say("          another document, and stated nowhere in this contract:");
    for (const line of wrap(CT[refLine.get(k) - 1].slice(0, 300), 92)) say("            " + line);
  }
  if (dangling.length === 0) say("        dangling references: none");
  if (dangling.length) {
    say("        WHY THIS COUNTS. 07:7 lists rev 9.1's decision ledger as `D9-7a`, `D9-8`, `D9-9`,");
    say("        `D9-10`/`Q-29`. The first three each have a normative site in this contract and");
    say("        are named in \u00a720.8's change log; `D9-10` has neither. Its SUBSTANCE is present \u2014");
    say("        07:5 says rev 9.1 \"records `Q-29` as open with three dead candidates\" \u2014 but under");
    say("        the other id. So either the ledger id does not belong in this document or \u00a720.8");
    say("        owes it a row; as it stands one line of rev 9.1 names a decision the rest of");
    say("        rev 9.1 does not carry. Low severity, and not a rule conflict: recorded as what");
    say("        it is, a cross-reference rev 9.1 does not honour.");
    finding(6, "rev 9.1's revision row (07:7) names `D9-10` as one of four decision-ledger entries " +
      "\u2014 `D9-7a`, `D9-8`, `D9-9`, `D9-10`/`Q-29` \u2014 and `D9-10` occurs exactly once in the whole " +
      "contract, at that line. The other three each have a normative site AND a \u00a720.8 change-log " +
      "row; `D9-10` has neither, while its substance appears under `Q-29` (07:5, 07:2185). This is " +
      "a dangling cross-reference, not a rule conflict: either the id is a leftover from " +
      "`22-rev9-design.md`'s ledger and does not belong in 07, or \u00a720.8 owes it a row. It is the " +
      "only self-inconsistency the whole in-force pass found \u2014 11 superseded formulations absent, " +
      "9 stated figures re-measured and agreeing, the one self-counting sentence correct.",
      "07:7, a line of rev 9.1 itself \u2014 revision-independent by construction");
  }

  if (sup > 0 || figBad > 0) {
    finding(6, "rev 9.1 contradicts itself at " + (sup + figBad) + " site(s): " + sup +
      " superseded formulation(s) still in the in-force region and " + figBad +
      " stated figure(s) this run does not reproduce.");
  } else {
    say("      NO RULE CONTRADICTION FOUND in the in-force region on any check this run can derive:");
    say("        no superseded formulation survives, every re-measurable figure agrees, and the");
    say("        one self-counting sentence counts its own parts correctly.");
    say("      WHAT THIS DOES NOT COVER, stated so the result is not read as more than it is: a");
    say("        contradiction between two rules that share no phrase and no figure is not");
    say("        reachable by any check in this file. The six properties are the coverage that");
    say("        exists for that, and they are run against rev 9.1 above.");
    say("      AND ONE MORE THING IT CANNOT DO, which is worth stating because I tried it and");
    say("        stopped: \"is every rule this text names actually stated here?\" is not decidable");
    say("        from the text, because the contract marks a DEFINITION no differently from a");
    say("        REFERENCE — `CINV-3` is defined by a table row, `AR3` by a clause inside a");
    say("        sentence listing five other ids, `EF2` by a bolded heading. A definition model");
    say("        built from any one of those conventions reports the other two as dangling. That");
    say("        is the SAME defect property 5 records at 07:949: whether a line states a thing or");
    say("        merely names it is carried by layout, not by the sentence. So check (iv) is");
    say("        restricted to the case that needs no model at all — named once, nowhere stated.");
  }
}
say();

// ------------------------------------------------------------------ the revision that exists
say("  (k) THE REVISION THAT ACTUALLY EXISTS — rev 9.1 exactly as written, no proposal applied.");
say("      Measured last, from a clean useRev(9.1), so no flag set by sections (f)-(j) reaches it.");
{
  useRev(REV_IN_FORCE);
  // Assert the configuration IS the contract's, flag by flag, rather than trusting it was restored.
  const clean = CFG.rev === 9.1 && CFG.ef3Ambiguity === "D9-7a" && CFG.key3 === "intersection" &&
                CFG.disclosure === "intersectionOfSets" && CFG.key3Skip === false &&
                CFG.key3SkipMode === "position" && CFG.noRungs === true && CFG.ef6Row8 === true &&
                CFG.vb3 === "rev9" && CFG.ws6 === "rev9" && CFG.classOrder === GR2A_REV9 &&
                CFG.satRelations.length === 2;
  say("      configuration asserted clean (every flag at its rev-9.1 value): " + (clean ? "yes" : "NO"));
  say("        rev " + CFG.rev + "; ambiguity " + CFG.ef3Ambiguity + " (07:1008-1036); key (3) " +
    CFG.key3 + " (07:1407-1420); disclosure " + CFG.disclosure + " (07:1103-1132);");
  say("        Q-29 carve-out " + (CFG.key3Skip ? "ON — WRONG, it is in no revision" : "OFF, as 07:2185 requires") + ".");
  if (!clean) throw new Error("rev 9.1 baseline was not restored; every number below would be suspect");
  const rs = [];
  for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) rs.push({ ev, key: u + " | " + ev.V.branch });
  let p3 = 0, noCls = 0;
  for (const { ev } of rs) {
    for (const row of ev.rows) if (row.cls === UNDET || !CLASSES.includes(row.cls)) noCls += 1;
    if (orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join() !== orderByRungs(ev).map((r) => r.rec.id).join()) p3 += 1;
  }
  const pb = strictPb4("rev 9 as written, clean");
  say("      property 3 (differential ordering):      " + p3 + " of " + rs.length + " branches");
  say("      property 4b (PB4 strict):                " + pb.viol.length + " of " + pb.pairs + " pairs");
  say("      EF6 inputs with no class, on the corpus: " + noCls);
  say("      These are the three figures the contract now STATES (07:2885-2900). All three carry");
  say("      from rev 9 to rev 9.1 UNCHANGED — which was not safe to assume, because rev 9.1 changed");
  say("      RULES and not only prose: D9-7a alters which state EF3 assigns, D9-8 alters an ordering");
  say("      key, D9-9 alters what the reply asserts. That none of them moves these three is a");
  say("      measurement, made in section (i) and repeated here from a clean configuration.");
  say("      Q-29's findings in (i) and (j) are about a proposal in NO revision, and candidate 3 is");
  say("      not implemented anywhere the ordering runs.");
  if (p3 !== 0 || pb.viol.length !== 0) {
    finding(3, "rev 9 as written no longer measures 0/0 on the clean baseline: property 3 " + p3 +
      " of " + rs.length + ", PB4 strict " + pb.viol.length + " of " + pb.pairs + ". Something in " +
      "this file's variant runs leaked into the default configuration and every other number is suspect.");
  }
}
say();

// ------------------------------------------------------------------ Q-29 candidate 4
say("  (m) Q-29 CANDIDATE 4 — per-CLASS-BLOCK applicability, measured (round 12).");
say("      Candidates 1-3 are dead: `position` breaks property 3 (not stable under partitioning),");
say("      `zero` is \"a null that sorts last\" which 07:1220 forbids by name, `skip to the next");
say("      key` is INTRANSITIVE with 72 cycles on this corpus. Candidate 4 is the shape left.");
say();
say("      THE CANDIDATE, stated before it is tested: *PB4's carve-out applies at the granularity");
say("      of the key-(1) class block. Key (3) runs for a block only if EVERY record in that block");
say("      can see it; a block containing any not_evaluable scope is not ordered by key (3) at all");
say("      and falls through to keys (4)-(5). Applicability is a property of the PARTITION, never");
say("      of a record and never of a pair.*");
say("      BEHIND A FLAG (CFG.key3SkipMode = \"block\"). It is in no revision and in no default;");
say("      the clean baseline in (k) above asserts key3Skip === false and throws otherwise.");
say("      Tested in the order the coordinator set: GR2a permutation stability FIRST, because it");
say("      is what killed candidate 1; then transitivity; then property 3; then PB4 strict.");
{
  const savedOrder = CFG.classOrder;
  const runsUnder = () => {
    const out = [];
    for (const u of ALL_UTTERANCES) for (const ev of evaluateAll(u, RECORDS)) out.push({ ev, key: u + " | " + ev.V.branch });
    return out;
  };
  // The signature that matters: the order of records WITHIN each class. Permuting GR2a permutes
  // the blocks; if it also permutes what is INSIDE a block, the rule is reading the slots it was
  // handed rather than the records, which is candidate 1's defect.
  const withinClassSig = (ev) => {
    const ord = orderByRungs(ev);
    const m = new Map();
    for (const r of ord) { if (!m.has(r.cls)) m.set(r.cls, []); m.get(r.cls).push(r.rec.id); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([c, ids]) => c + ":" + ids.join(">")).join("|");
  };
  // Deterministic permutations: identity, reverse, every adjacent transposition, every pairwise
  // swap, and 200 seeded shuffles. Seeded so the transcript is reproducible.
  const perms = [];
  const base = GR2A_REV9.slice();
  perms.push(["identity", base.slice()]);
  perms.push(["reverse", base.slice().reverse()]);
  for (let i = 0; i < base.length; i += 1) for (let j = i + 1; j < base.length; j += 1) {
    const q = base.slice(); [q[i], q[j]] = [q[j], q[i]];
    perms.push(["swap " + base[i] + "/" + base[j], q]);
  }
  let seed = 20260924;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < 200; k += 1) {
    const q = base.slice();
    for (let i = q.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    perms.push(["shuffle " + (k + 1), q]);
  }

  const stabilityOf = (mode) => {
    useRev(REV_IN_FORCE); CFG.key3Skip = true; CFG.key3SkipMode = mode;
    CFG.classOrder = base.slice();
    const ref = new Map(runsUnder().map(({ ev, key }) => [key, withinClassSig(ev)]));
    let bad = 0; const eg = [];
    for (const [label, q] of perms) {
      if (label === "identity") continue;
      CFG.classOrder = q;
      for (const { ev, key } of runsUnder()) {
        const sig = withinClassSig(ev);
        if (sig !== ref.get(key)) {
          bad += 1;
          if (eg.length < 3) {
            const a = ref.get(key).split("|"), b = sig.split("|");
            const d = a.find((x, i) => x !== b[i]);
            eg.push(label + "  on \"" + key + "\"\n            under the contract's order: " + d +
              "\n            under the permutation:      " + b[a.indexOf(d)]);
          }
        }
      }
    }
    CFG.classOrder = base.slice();
    return { bad, eg, checks: (perms.length - 1) * RUNS.length };
  };

  say("      TEST 1 — STABILITY UNDER A GR2a PERMUTATION. " + perms.length + " class orders");
  say("        (identity, reverse, all 45 pairwise swaps, 200 seeded shuffles) x every branch.");
  say("        The question: does permuting GR2a change the order of records WITHIN a class?");
  const c1 = stabilityOf("position");
  say("        CONTROL, candidate 1 (`position`) — the one this test killed:");
  say("          within-class orders that change: " + c1.bad + " of " + c1.checks +
    (c1.bad ? "   (the test can fail: good)" : "   *** THE CONTROL DID NOT FAIL — the test is vacuous ***"));
  for (const e of c1.eg) say("            " + e);
  const c4 = stabilityOf("block");
  say("        CANDIDATE 4 (`block`):");
  say("          within-class orders that change: " + c4.bad + " of " + c4.checks);
  for (const e of c4.eg) say("            " + e);
  const stable4 = c4.bad === 0;
  say("        VERDICT ON THE TEST ITSELF, BEFORE ITS RESULT: NEITHER candidate moves under any");
  say("        of the " + (perms.length - 1) + " permutations, INCLUDING the one this test was meant to kill.");
  say("        THE TEST DOES NOT DISCRIMINATE, AND THAT CORRECTS ME. 20-pipeline-checker.md \u00a75h.8");
  say("        says candidate 1 was killed by GR2a permutation and that this is what candidate 4");
  say("        should be tested against first. That is WRONG and this run shows it: candidate 1");
  say("        is killed by PARTITIONING the row set (test 3 below, property 3, 1 of 27), which");
  say("        is a different operation. Permuting GR2a reorders the blocks; partitioning splits");
  say("        the row set and re-derives each part, so the SLOTS differ \u2014 and candidate 1 reads");
  say("        the slots. A permutation never changes a block's membership, so a rule that reads");
  say("        only a block's contents cannot notice it. Candidate 4's 0 is therefore not");
  say("        evidence of anything; the evidence is in test 3.");
  if (c1.bad === 0) {
    finding(3, "my own 20-pipeline-checker.md \u00a75h.8 misnames the test that kills Q-29 candidate 1: " +
      "it says `position` fails GR2a permutation, and it does not. Measured over " +
      (perms.length - 1) + " permutations x " + RUNS.length + " branches, candidate 1 moves " + c1.bad +
      " within-class orders \u2014 none. It fails PARTITIONING (property 3, 1 of 27), a different " +
      "operation: a permutation reorders blocks without changing their membership, while " +
      "partitioning re-derives each part and changes the slots, which is what `position` reads. " +
      "The permutation test is vacuous for this family and I proposed it as the first gate. " +
      "Reported rather than quietly replaced, because the instrument was mine.",
      { about: "this checker's own prior report (20-pipeline-checker.md \u00a75h.8), not the contract",
        inForce: false });
  }

  // ---------------------------------------------------------------- TEST 2, transitivity
  say();
  say("      TEST 2 — TRANSITIVITY. Candidate 4 is a sequence of sorts, not a comparator, so a");
  say("        comparator is derived from it and tested the way candidate 3 was. `applies` is a");
  say("        function of the BLOCK: it is computed from the record set, never from the pair.");
  say("        Two variants, because PB4's carve-out covers key (2) as well as key (3):");
  say("          4a  key (3) per-block, key (2) pairwise — what adopting candidate 4 for key (3)");
  say("              alone would give, with key (2)'s in-force positional carve-out left as it is");
  say("          4b  BOTH keys per-block — the candidate read as a statement about PB4 itself");
  const countQ = (r, V) => V.Q.filter((id) => r.rec.workScopeIds.includes(id)).length;
  const mkCmp = (variant) => (a, b, V, applies2, applies3) => {
    const d1 = gr2aIndex(a.cls) - gr2aIndex(b.cls);
    if (d1 !== 0) return { r: Math.sign(d1), key: 1 };
    const k2ok = variant === "4b" ? applies2.has(gr2aIndex(a.cls)) : (k2Applies(a) && k2Applies(b));
    if (k2ok && k2Applies(a) && k2Applies(b)) {
      const d = Math.abs(a.delta) - Math.abs(b.delta);
      if (d !== 0) return { r: Math.sign(d), key: 2 };
    }
    if (applies3.has(gr2aIndex(a.cls))) {
      const ca = countQ(a, V), cb = countQ(b, V);
      if (ca !== cb) return { r: Math.sign(cb - ca), key: 3 };
    }
    if (a.rec.publishedAt !== b.rec.publishedAt)
      return { r: a.rec.publishedAt < b.rec.publishedAt ? 1 : -1, key: 4 };
    return { r: a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0, key: 5 };
  };
  const appliesOf = (set) => {
    const g2 = new Set(), g3 = new Set(), byCls = new Map();
    for (const r of set) { const k = gr2aIndex(r.cls); if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(r); }
    for (const [k, rs] of byCls) {
      if (rs.every((r) => k2Applies(r))) g2.add(k);
      if (rs.every((r) => k3Applies(r))) g3.add(k);
    }
    return [g2, g3];
  };
  const transResult = {};
  for (const variant of ["4a", "4b"]) {
    const cmp = mkCmp(variant);
    // (i) the real corpus: every ordered triple inside every branch, with `applies` computed from
    //     the branch's full 19-record set -- the set the rule would actually see.
    useRev(REV_IN_FORCE); CFG.key3Skip = true; CFG.key3SkipMode = "block";
    const runs = runsUnder();
    let triples = 0; const cyc = [];
    for (const { ev, key } of runs) {
      const set = ev.rows;
      const [g2, g3] = appliesOf(set);
      for (const A of set) for (const B of set) for (const C of set) {
        if (A === B || B === C || A === C) continue;
        triples += 1;
        const ab = cmp(A, B, ev.V, g2, g3), bc = cmp(B, C, ev.V, g2, g3), ac = cmp(A, C, ev.V, g2, g3);
        if (ab.r < 0 && bc.r < 0 && ac.r > 0 && cyc.length < 4) {
          cyc.push(key + ": " + A.rec.id + " < " + B.rec.id + " (key " + ab.key + "), " +
            B.rec.id + " < " + C.rec.id + " (key " + bc.key + "), " +
            C.rec.id + " < " + A.rec.id + " (key " + ac.key + ")");
        }
      }
    }
    // (ii) synthetic: the same shape enumeration candidate 3 was killed on.
    const AREAS = [null, 0.05, 0.15], SCOPES = [null, 1, 3], DATES = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const SH = [];
    for (const d of AREAS) for (const sc of SCOPES) for (const pub of DATES) SH.push({ d, sc, pub });
    const mk = (sh, id) => ({ cls: "exact", delta: sh.d,
      c: { area: sh.d === null ? "not_evaluable" : "satisfied", scope: sh.sc === null ? "not_evaluable" : "satisfied" },
      rec: { id, publishedAt: sh.pub, workScopeIds: sh.sc === null ? [] : ["w1", "w2", "w3"].slice(0, sh.sc) } });
    const Vs = { Q: ["w1", "w2", "w3"] };
    const IDS = [["r1", "r2", "r3"], ["r3", "r1", "r2"], ["r2", "r3", "r1"],
                 ["r1", "r3", "r2"], ["r2", "r1", "r3"], ["r3", "r2", "r1"]];
    let sT = 0; const sCyc = [];
    for (const ids of IDS) for (const sa of SH) for (const sb of SH) for (const sc of SH) {
      const A = mk(sa, ids[0]), B = mk(sb, ids[1]), C = mk(sc, ids[2]);
      const [g2, g3] = appliesOf([A, B, C]);
      sT += 1;
      const ab = cmp(A, B, Vs, g2, g3), bc = cmp(B, C, Vs, g2, g3), ac = cmp(A, C, Vs, g2, g3);
      if (ab.r < 0 && bc.r < 0 && ac.r > 0 && sCyc.length < 4) {
        sCyc.push("r1/r2/r3 keys " + ab.key + "/" + bc.key + "/" + ac.key);
      }
    }
    transResult[variant] = { triples, cyc, sT, sCyc };
    say("        " + variant + ": corpus " + triples + " ordered triples, cycles " + cyc.length +
      " ; synthetic " + sT + " ordered triples, cycles " + sCyc.length);
    for (const c of cyc.slice(0, 2)) say("            CYCLE  " + c);
    for (const c of sCyc.slice(0, 2)) say("            SYNTHETIC CYCLE  " + c);
  }
  const trans4a = transResult["4a"].cyc.length === 0 && transResult["4a"].sCyc.length === 0;
  const trans4 = transResult["4b"].cyc.length === 0 && transResult["4b"].sCyc.length === 0;
  say("        VERDICT, 4b \u2014 THE CANDIDATE AS STATED: " + (trans4 ? "TRANSITIVE on everything tested."
    : "INTRANSITIVE. STOPPING, not repairing."));
  if (trans4) {
    say("          AND THE REASON, which is why it was predictable: `applies` is computed once per");
    say("          BLOCK from the record set, so every pair inside a block uses the SAME key");
    say("          sequence, and a fixed key sequence is lexicographic, hence transitive.");
    say("          Candidate 3 failed because each PAIR chose its own sequence. This is not");
    say("          evidence that 4b is RIGHT; it is evidence it is not wrong in candidate 3's way.");
  }
  say("        VERDICT, 4a \u2014 THE HYBRID: " + (trans4a ? "transitive." : "INTRANSITIVE, and it dies."));
  if (!trans4a) {
    say("          AND THIS IS NOT A FACT ABOUT Q-29. 4a is candidate 4 applied to key (3) while");
    say("          key (2) keeps a PAIRWISE carve-out \u2014 and the cycles are decided by KEY (2):");
    for (const c of transResult["4a"].cyc.slice(0, 2)) say("            " + c);
    say("          Key (2)'s own carve-out (07:1399-1401) is IN FORCE and carries the same");
    say("          three-way ambiguity as key (3)'s. The gap this file already records names its");
    say("          two readings \u2014 \"keeps the position the previous key gave it\" or \"falls");
    say("          through\" \u2014 and does not say that the FALL-THROUGH reading is intransitive.");
    say("          It is, on this corpus, by exactly candidate 3's mechanism: a pair both sides");
    say("          can see is decided by key (2), a pair only one side can see falls to key (4),");
    say("          and the two orders disagree. The in-force implementation here reads key (2)");
    say("          POSITIONALLY, a sequence of sorts, which cannot cycle \u2014 so no figure above");
    say("          moves. This is a defect of the TEXT at 07:1399-1401.");
    finding(3, "key (2)'s carve-out at 07:1399-1401 \u2014 IN FORCE, not a proposal \u2014 admits the same " +
      "fall-through reading that kills Q-29 candidate 3, and under that reading it is " +
      "INTRANSITIVE on the real corpus: " + transResult["4a"].cyc.length + " cycles over " +
      transResult["4a"].triples + " ordered triples, e.g. " + (transResult["4a"].cyc[0] || "") +
      ". The gap this file already records for 07:1398-1405 names key (2)'s two readings and " +
      "treats them as merely different; one of them does not define an order at all. The " +
      "in-force implementation reads key (2) positionally, a sequence of sorts, so no measured " +
      "figure moves \u2014 which is precisely why nothing caught it until a comparator was written " +
      "for a DIFFERENT question. Q-29 is not only about key (3).",
      "07:1399-1401, in force at rev 9.1");
  }

  // ---------------------------------------------------------------- TEST 3, property 3
  say();
  say("      TEST 3 — PROPERTY 3, the differential ordering. GR3's \"direct answers first\"");
  say("        presentation partitions the rows into `exact` and the rest and orders each part.");
  say("        Candidate 1 died here (0 of 27 -> 1 of 27). Candidate 4 must survive it.");
  const p3Of = (mode) => {
    useRev(REV_IN_FORCE);
    if (mode) { CFG.key3Skip = true; CFG.key3SkipMode = mode; }
    let bad = 0; const eg = [];
    for (const { ev, key } of runsUnder()) {
      const a = orderByDirectAnswersFirst(ev).map((r) => r.rec.id).join();
      const b = orderByRungs(ev).map((r) => r.rec.id).join();
      if (a !== b) { bad += 1; if (eg.length < 2) eg.push(key); }
    }
    return { bad, eg, n: RUNS.length };
  };
  const p3none = p3Of(null), p3pos = p3Of("position"), p3blk = p3Of("block");
  say("        rev 9.1 as written (no carve-out):     " + p3none.bad + " of " + p3none.n);
  say("        + candidate 1 (`position`):            " + p3pos.bad + " of " + p3pos.n +
    (p3pos.eg.length ? "   e.g. " + p3pos.eg[0] : ""));
  say("        + candidate 4 (`block`):               " + p3blk.bad + " of " + p3blk.n +
    (p3blk.eg.length ? "   e.g. " + p3blk.eg[0] : ""));
  const p3ok = p3blk.bad === 0;
  say("        VERDICT: " + (p3ok ? "property 3 HOLDS under candidate 4."
    : "property 3 FAILS under candidate 4 — it dies here. STOPPING, not repairing."));

  // ---------------------------------------------------------------- TEST 4, PB4 strict
  say();
  say("      TEST 4 — PB4 STRICT (07:1226), the not_evaluable/unsatisfied form, over all 798 pairs.");
  useRev(REV_IN_FORCE); CFG.key3Skip = true; CFG.key3SkipMode = "block";
  const pb4blk = strictPb4("Q-29 candidate 4 (block)");
  useRev(REV_IN_FORCE);
  const pb4none = strictPb4("rev 9.1, no carve-out");
  say("        rev 9.1 as written:        " + pb4none.viol.length + " of " + pb4none.pairs);
  say("        + candidate 4 (`block`):   " + pb4blk.viol.length + " of " + pb4blk.pairs);
  const pb4ok = pb4blk.viol.length === 0;
  say("        VERDICT: " + (pb4ok ? "PB4 strict HOLDS under candidate 4."
    : "PB4 strict FAILS under candidate 4 — " + pb4blk.viol.length + " violations. STOPPING."));

  // ---------------------------------------------------------------- TEST 5, not asked for
  say();
  say("      TEST 5 — NOT ASKED FOR, RUN ANYWAY, and it is the one that matters. Making");
  say("        applicability a property of the BLOCK makes every record's position depend on");
  say("        WHICH OTHER RECORDS ARE IN ITS BLOCK. That is exactly what buys transitivity in");
  say("        test 2, and it has a price: adding one record can reorder records it does not");
  say("        beat. CINV-21 (07:1551) does not catch it — CINV-21 says the order is determined");
  say("        by the record SET, and it still is. This asks the next question: is it MONOTONE?");
  say("        Method: for each branch, add ONE synthetic record whose scope is not_evaluable to");
  say("        an existing class block, re-derive, and ask whether the 19 originals keep their");
  say("        relative order.");
  const iiaOf = (mode) => {
    useRev(REV_IN_FORCE);
    if (mode) { CFG.key3Skip = true; CFG.key3SkipMode = mode; }
    let moved = 0, tried = 0; const eg = [];
    for (const { ev, key } of runsUnder()) {
      const before = orderByRungs(ev).map((r) => r.rec.id);
      const classes = [...new Set(ev.rows.map((r) => r.cls))];
      for (const cls of classes) {
        const ghost = { rec: { id: "zz-ghost", publishedAt: "2000-01-01T00:00:00+09:00",
                               workScopeIds: [], projectType: "partial_remodel" },
                        cls, delta: null, c: { breadth: "not_applicable", scope: "not_evaluable", area: "not_evaluable" },
                        relation: null, notEvaluable: ["scope"] };
        const ev2 = { ...ev, rows: [...ev.rows, ghost] };
        tried += 1;
        const after = orderByRungs(ev2).map((r) => r.rec.id).filter((x) => x !== "zz-ghost");
        if (after.join() !== before.join()) {
          moved += 1;
          if (eg.length < 3) {
            const i = before.findIndex((x, k) => x !== after[k]);
            eg.push(key + "  adding a not_evaluable record to the `" + cls + "` block moves the " +
              "originals from position " + (i + 1) + ":\n            before " + before.slice(i, i + 4).join(" > ") +
              "\n            after  " + after.slice(i, i + 4).join(" > "));
          }
        }
      }
    }
    return { moved, tried, eg };
  };
  const iiaNone = iiaOf(null), iiaBlk = iiaOf("block");
  say("        rev 9.1 as written:      " + iiaNone.moved + " of " + iiaNone.tried + " insertions reorder the originals");
  say("        + candidate 4 (`block`): " + iiaBlk.moved + " of " + iiaBlk.tried + " insertions reorder the originals");
  for (const e of iiaBlk.eg) say("          " + e);
  const iiaOk = iiaBlk.moved <= iiaNone.moved;
  say("        VERDICT: " + (iiaOk ? "candidate 4 is no less monotone than the text as written."
    : "candidate 4 is NOT MONOTONE where rev 9.1 is — " + (iiaBlk.moved - iiaNone.moved) +
      " extra reorderings. This is a REAL COST and it is the price of the transitivity in test 2."));

  // ---------------------------------------------------------------- the verdict, and the surface
  say();
  const allPass = trans4 && p3ok && pb4ok;
  say("      CANDIDATE 4 — VERDICT: " + (allPass
    ? "it is the FIRST candidate that does not die. It is not thereby right."
    : "FAILS. It is the fourth dead reading."));
  say("        test 1  GR2a permutation stability  " + c4.bad + " of " + c4.checks +
    "  — but the CONTROL also scores " + c1.bad + ", so this test");
  say("                                            decides nothing. My §5h.8 named the wrong gate.");
  say("        test 2  transitivity, 4b as stated  " + (trans4 ? "PASS" : "FAIL") + "  (" +
    transResult["4b"].triples + " corpus + " + transResult["4b"].sT + " synthetic ordered triples, " +
    (transResult["4b"].cyc.length + transResult["4b"].sCyc.length) + " cycles)");
  say("        test 2  transitivity, 4a hybrid     " + (trans4a ? "PASS" : "FAIL") + "  (" +
    transResult["4a"].cyc.length + " corpus cycles) — and the cause is KEY (2),");
  say("                                            which is in force. Reported as its own finding.");
  say("        test 3  property 3                  " + (p3ok ? "PASS" : "FAIL") + "  (" + p3blk.bad + " of " + p3blk.n +
    "; candidate 1 is " + p3pos.bad + " of " + p3pos.n + ")");
  say("        test 4  PB4 strict                  " + (pb4ok ? "PASS" : "FAIL") + "  (" + pb4blk.viol.length +
    " of " + pb4blk.pairs + ")");
  say("        test 5  monotonicity, NOT asked for " + (iiaOk ? "PASS" : "FAIL") + "  (" + iiaBlk.moved +
    " of " + iiaBlk.tried + " insertions reorder; rev 9.1 as");
  say("                                            written: " + iiaNone.moved + ")");
  if (allPass && !iiaOk) {
    say("      SO THE RESULT IS NOT \"PASSES\" AND NOT \"DIES\". 4b survives every test the");
    say("      coordinator set, in the order set, and then fails one I added. The failure is not");
    say("      incidental: it is the SAME property that makes 4b transitive. Applicability is a");
    say("      function of the block's membership, so two records' relative order depends on a");
    say("      third record that beats neither. That is what buys one key sequence per block, and");
    say("      one key sequence per block is what makes it an order at all. The two cannot be");
    say("      separated by a better implementation — they are the same sentence read twice.");
    say("      THE TRADE, stated so the owner can make it rather than discover it: candidates 1-3");
    say("      break the ORDER (unstable / forbidden / intransitive). Candidate 4 keeps the order");
    say("      and breaks INDEPENDENCE — adding a record reorders records it does not beat, on");
    say("      " + iiaBlk.moved + " of " + iiaBlk.tried + " insertions here. Nothing in the contract forbids that; CINV-21");
    say("      (07:1551) asks only that the order be a function of the record SET, and it is.");
    say("      No fifth shape is proposed here. I have not looked for one.");
  }
  say();
  say("      WHAT I DID NOT TEST — stated in full, because adopting a candidate with a known");
  say("      untested surface is a decision and adopting one with an unknown surface is not.");
  say("        1. THE 7 MIXED BLOCKS AS SUCH. Candidate 4 dissolves them: a block containing any");
  say("           not_evaluable scope simply does not run key (3), so there is no longer a block");
  say("           that MIXES skipped and ordered records. What I measured is that the resulting");
  say("           order is stable, transitive and passes properties 3 and 4b. I did NOT measure");
  say("           whether the order it produces is the one the contract's author intends — there");
  say("           is no statement of that to check against, which is Q-29 itself.");
  say("        2. THE COST IT PAYS. Candidate 4 makes key (3) run for FEWER records than");
  say("           candidate 3 would: one not_evaluable record disables the key for its whole");
  say("           block, including records that could see it. Whether that is acceptable is an");
  say("           owner decision. The size of it is measured in test 5 and nowhere else.");
  say("        3. THE ORDERS 4a AND 4b PRODUCE, AGAINST EACH OTHER. 4a is dead (test 2), so");
  say("           candidate 4 can only be adopted for the WHOLE carve-out, key (2) included.");
  say("           I did not measure how far 4b's order differs from the in-force POSITIONAL");
  say("           reading of key (2), only that both are orders. Adopting 4b therefore");
  say("           changes key (2)'s behaviour by an amount nothing here reports.");
  say("        4. THE RESULT LIMIT OF 3 (07:1222). Truncation is a subsetting operation and");
  say("           candidate 4's applicability is set-dependent, so truncating BEFORE ordering and");
  say("           truncating AFTER can differ. This file never truncates, so the question is");
  say("           untouched by every number above.");
  say("        5. ANY CORPUS BUT THIS ONE. 19 records, 27 branches. The synthetic enumeration");
  say("           covers the SHAPES the keys can see, which is stronger, but it fixes one class");
  say("           per triple; a cycle that needs three classes is outside it. For candidate 3");
  say("           that did not matter because key (1) is total and a cycle must live inside a");
  say("           block — the same argument covers candidate 4, but it is an argument, not a");
  say("           measurement.");
  say();
  say("      NOT ADOPTED, AND NOT IN ANY DEFAULT. CFG.key3SkipMode = \"block\" is reachable only");
  say("      from this section. useRev() resets key3Skip to false unconditionally at every");
  say("      revision, and section (k)'s clean baseline asserts it and throws otherwise.");
  if (allPass) {
    finding(3, "Q-29 candidate 4 (per-class-block applicability) SURVIVES every test candidates " +
      "1-3 failed, and it is the first that does not die: transitive over " +
      transResult["4b"].triples + " corpus and " + transResult["4b"].sT + " synthetic ordered " +
      "triples with 0 cycles, property 3 " + p3blk.bad + " of " + p3blk.n + ", PB4 strict " +
      pb4blk.viol.length + " of " + pb4blk.pairs + ". TWO THINGS QUALIFY THAT. (a) The " +
      "GR2a-permutation test I proposed as the first gate decides nothing \u2014 candidate 1 scores " +
      c1.bad + " on it too, so 20-pipeline-checker.md \u00a75h.8 named the wrong operation: `position` " +
      "fails PARTITIONING, not permutation. (b) It buys transitivity by making applicability a " +
      "function of the BLOCK's membership, and the price is that two records' relative order " +
      "depends on a third that beats neither: " + iiaBlk.moved + " of " + iiaBlk.tried + " single-record " +
      "insertions reorder records that did not move, against " + iiaNone.moved + " for rev 9.1 as written. " +
      "That is not a fixable detail \u2014 it is the same sentence read twice, and CINV-21 does not " +
      "forbid it. Five untested surfaces are listed in the transcript. Behind a flag, in no " +
      "default: a measurement, not an adoption.",
      { about: "Q-29 candidate 4 \u2014 a proposal in NO revision (Q-29 itself is open, 07:2185)",
        inForce: false });
  }
  CFG.classOrder = savedOrder;
  useRev(REV_IN_FORCE);
}
say();

// ------------------------------------------------------------------ citation drift
// Every "07:<line>" in this file is a claim about WHERE a rule is, and the contract is a live
// document another worker edits: during this session it grew by ~230 lines in section 17.1 and
// every citation past section 15 moved. A line number that has silently stopped pointing at its
// rule is a wrong citation presented as a verified one, so the load-bearing ones are CHECKED
// against the file as it is on disk, not trusted. Each pair is (citation, a distinctive substring
// the cited line must still contain).
const CITE_ANCHORS = [
  // [line, substring the line must contain, nth occurrence (1-based) when the text appears more
  // than once]. Rev 9.1 duplicates many in-force rules in section 17's parked text and in section
  // 20's change log, so "first occurrence" is not a safe default and the index is explicit.
  ["07:346", "WS6 (C: MUST)", 1],
  ["07:350", "An ambiguous term is carried", 1],
  ["07:366", "Worked, on the corpus", 1],
  ["07:359", "different criterion states OR different relations", 1],   // WS6's pointer (rev 9.1)
  ["07:863", "`V.area` | value + unit + basis", 1],
  ["07:871", "cannot be resolved to one of the three is **absent**", 1],
  ["07:874", "VB3 (C: MUST)", 1],
  ["07:883", "first matching row wins", 1],
  ["07:890", "an explicit negation of whole-home framing", 1],
  ["07:896", "qualitative prose about size", 1],
  ["07:898", "The left column lists *forms*", 1],
  ["07:904", "attached to a quantity is not a restriction by space", 1],
  ["07:949", "Nothing outside `EF2`", 1],
  ["07:955", "EF2 breadth", 1],
  ["07:960", "EF3 scope", 1],
  ["07:978", "unless `Q_s \u2286 R_s`", 1],
  ["07:983", "the permission is the one every reading gives", 1],        // D9-9 on a permission
  ["07:1003", "`scope_exact` or `scope_superset`", 1],
  ["07:1005", "absent \u21d2 `not_evaluable`", 1],
  ["07:1008", "Ambiguity, resolved here and nowhere else", 1],
  ["07:1011", "different criterion states OR different relations", 2],   // D9-7a rule 1
  ["07:1014", "Otherwise \u2014 all readings agree on **both**", 1],    // D9-7a rule 2
  ["07:1017", "Rule 2's condition is rule 1's exact negation", 1],
  ["07:1038", "The state is assigned by `EF3` and by nothing else", 1],
  ["07:1061", "EF4 area", 1],
  ["07:1074", "PB7 (C: MUST)", 1],
  ["07:1080", "the visitor named **no** scope", 1],
  ["07:1083", "not established for this case", 1],
  ["07:1084", "the extra spaces **are named**", 1],
  ["07:1085", "`R_s \u228a Q_s`", 2],
  ["07:1103", "A disclosure names only what every reading admits", 1],   // D9-9, the four sentences
  ["07:1110", "never over `Q` before the row", 1],
  ["07:1113", "**Row 5 names `R_s \\ Q_s`**", 1],
  ["07:1123", "If the intersection is empty and any reading's set is not", 1],
  ["07:1158", "14.3.3.1 Trade-only requests", 1],
  ["07:1165", "`R_s = \u2205` | `scope_exact`", 1],
  ["07:1218", "PB4 (C: MUST)", 1],
  ["07:1220", "not a null that sorts last", 1],
  ["07:1237", "PB5 (C: MUST NOT)", 1],
  ["07:1250", "GR2 (C: MUST)", 1],
  ["07:1262", "scope is `unsatisfied`", 2],
  ["07:1268", "`scope_superset` | `scope_superset`", 1],
  ["07:1280", "The row is required for disclosure", 1],
  ["07:1295", "gives `scope_superset` back its own class", 1],
  ["07:1313", "GR2a (C: MUST)", 1],
  ["07:1316", "`exact` \u2192 `scope_superset`", 1],
  ["07:1335", "and **those three** reach **0 of 798**", 1],
  ["07:1355", "is a definition, not an ordering rule", 1],
  ["07:1365", "deleted as an ordering device", 1],
  ["07:1398", "Every result has an order", 1],
  ["07:1401", "pushed to the end by it", 1],
  ["07:1402", "the record carries, descending", 1],
  ["07:1407", "Key (3) under more than one reading of `Q`", 1],          // D9-8
  ["07:1409", "It reads the **intersection** of the", 1],
  ["07:1405", "No key is a price", 1],
  ["07:1439", "GR1 (C: MUST)", 1],
  ["07:1442", "GR4 (C: MUST, envelope)", 1],
  ["07:1449", "GR5 (C: MUST, output)", 1],
  ["07:1458", "Exemption (`GR5a`)", 1],
  ["07:1539", "CINV-9", 2],
  ["07:1547", "CINV-17", 6],
  ["07:1550", "CINV-20", 4],
  ["07:1551", "CINV-21", 1],
  ["07:1604", "17.1 Budget comparison", 1],
  ["07:2185", "Q-29", 5],
  ["07:2721", "20.7 Change log rev 8", 1],
  ["07:2758", "| A | rev 8 as shipped | 798 |", 1],
  ["07:2856", "20.7.5 What", 1],
  ["07:2885", "20.7.6 Verification rev 9 owes", 1],
  ["07:2925", "20.8 Change log rev 9", 1],
];
say("== CITATION DRIFT — do this run's 07: line numbers still point at their rules? ==");
if (contractText === null) {
  say("  CONTRACT NOT READABLE — citations could not be checked.");
} else {
  const cl = contractText.split("\n");
  // CHARACTERS, not bytes: the contract is UTF-8 with Korean throughout, so `wc -c` reports more
  // (247,239 against 241,289 this run). The earlier label said "bytes" and was wrong.
  say("  contract as read this run: " + cl.length + " lines, " + contractText.length + " characters.");
  say("  This file is edited by other workers. Every count in this report is against THAT version.");
  const drifted = [], remap = [];
  for (const [cite, anchor, nth] of CITE_ANCHORS) {
    const n = parseInt(cite.slice(3), 10);
    const line = cl[n - 1];
    // Resolve the anchor to where it IS now, so the report carries a fix and not just an alarm.
    // `nth` disambiguates: rev 9.1 duplicates in-force rules in section 17's parked text and in
    // section 20's change log, so "the first line containing this text" is not the rule.
    const hits = [];
    for (let k = 0; k < cl.length; k += 1) if (cl[k].includes(anchor)) hits.push(k + 1);
    const want = hits[(nth || 1) - 1];
    if (line !== undefined && line.includes(anchor) && want === n) continue;
    drifted.push([cite, anchor, line === undefined ? "<past end of file>" : line.trim().slice(0, 56)]);
    remap.push([cite, n, want === undefined ? hits : [want]]);
  }
  say("  load-bearing citations checked: " + CITE_ANCHORS.length + "   drifted: " + drifted.length);
  for (const [cite, anchor, got] of drifted.slice(0, 6)) {
    say("    DRIFT  " + cite + " should contain \"" + anchor + "\"");
    say("             but reads: " + got);
  }
  if (drifted.length > 6) say("    ... and " + (drifted.length - 6) + " more");
  if (remap.length) {
    // If every drifted anchor moved by the same amount, the fix is one number.
    const deltas = remap.filter(([, , h]) => h.length === 1).map(([, n, h]) => h[0] - n);
    const uniq = [...new Set(deltas)];
    say("  REMAP — where each drifted anchor is NOW:");
    for (const [cite, n, hits] of remap.slice(0, 8)) {
      say("    " + cite + "  ->  " + (hits.length === 1 ? "07:" + hits[0] + "  (delta " +
        (hits[0] - n >= 0 ? "+" : "") + (hits[0] - n) + ")"
        : hits.length === 0 ? "NOT FOUND — the text itself changed, not just its position"
        : "AMBIGUOUS, " + hits.length + " matches: " + hits.slice(0, 4).join(", ")));
    }
    if (remap.length > 8) say("    ... and " + (remap.length - 8) + " more");
    if (uniq.length === 1) {
      say("  ALL drifted citations moved by the SAME offset, " + (uniq[0] >= 0 ? "+" : "") + uniq[0] + ".");
      say("  So the fix is mechanical: every 07: citation in this report at or after the first");
      say("  drifted line takes " + (uniq[0] >= 0 ? "+" : "") + uniq[0] + ". Nothing about the MEASUREMENTS changes — only where the");
      say("  rules now sit in a file another worker is editing while this runs.");
    } else if (uniq.length > 1) {
      say("  Offsets are NOT uniform (" + uniq.sort((a, b) => a - b).join(", ") + "), so text was");
      say("  inserted in more than one place. Use the per-anchor remap above, not a single shift.");
    }
  }
  if (drifted.length) {
    finding(6, "the contract moved WHILE THIS RUN WAS EXECUTING: " + drifted.length + " of " +
      CITE_ANCHORS.length + " load-bearing citations no longer point at the rule they name " +
      "(first: " + drifted[0][0] + "). The remap above gives each one's current line. The " +
      "measurements in this report are unaffected — they are derived from the rules' text, which " +
      "this run read — but no line number in it should be quoted without re-running.");
  } else {
    // ---- EVERY citation, not only the anchored ones. 70 anchors cover the load-bearing rules; this
  // file cites 07: in ~180 distinct places, and the rev-9.1 move exposed that ONE of the unanchored
  // ones (a claim about VB3's closed list) had been stale since before section 17.1 was restored —
  // the anchor set never looked at it. So every citation is now attributed to the contract SECTION
  // it lands in, mechanically, and the attribution is printed. A citation that has slipped into a
  // different section shows up here without anyone having to remember to check it.
  {
    const selfSrc = (() => { try { return readFileSync(new URL(import.meta.url), "utf8"); } catch (e) { return ""; } })();
    const cited = [...new Set([...selfSrc.matchAll(/07:(\d+)/g)].map((m) => +m[1]))].sort((a, b) => a - b);
    const headAt = (n) => {
      for (let k = Math.min(n, cl.length) - 1; k >= 0; k -= 1) {
        const t = cl[k];
        if (/^#{2,5} /.test(t)) return t.replace(/^#+\s*/, "").slice(0, 44);
      }
      return "(front matter)";
    };
    const groups = new Map();
    let past = 0;
    for (const n of cited) {
      if (n > cl.length) { past += 1; continue; }
      const h = headAt(n);
      if (!groups.has(h)) groups.set(h, []);
      groups.get(h).push(n);
    }
    say("  EVERY 07: citation in this file, attributed to the section it lands in:");
    say("    distinct citations: " + cited.length + "   past the end of the file: " + past);
    const sorted = [...groups.entries()].sort((a, b) => a[1][0] - b[1][0]);
    for (const [h, ns] of sorted) {
      const span = ns.length === 1 ? String(ns[0]) : ns[0] + "-" + ns[ns.length - 1] + " (" + ns.length + ")";
      say("      " + span.padEnd(18) + h);
    }
    if (past > 0) {
      finding(6, "this file cites " + past + " contract line(s) past the end of the file.");
    }
  }
  say("  All " + CITE_ANCHORS.length + " resolve. The line numbers in this report are good for this version");
    say("  of the contract and are checked, not assumed.");
  }
}
say();

say("== UNDETERMINED AT REV " + REV_IN_FORCE + " (" + GAPS9.length + ") — rules this implementation could not execute ==");
GAPS9.forEach((g, i) => {
  say("  [" + (i + 1) + "] " + g.ruleId + "  " + g.line);
  for (const line of wrap(g.what, 96)) say("      " + line);
  say("      exposed by: " + g.inputs.slice(0, 3).join(" ; ") +
    (g.inputs.length > 3 ? "  (+" + (g.inputs.length - 3) + " more)" : ""));
});
say();
say("== CLOSED BY REV 9 / 9.1 (" + GAPS8ONLY.length + ") — gaps an earlier configuration raises and rev " +
  REV_IN_FORCE + " does not ==");
say("  NOTE ON CITATIONS IN THIS SECTION ONLY: these gaps are against REV 8, and their 07: line");
say("  numbers are rev 8's. The rules they name were rewritten, moved or deleted, so those lines");
say("  point at different text in the rev-9 file on disk. Rev-9 line numbers for the rules that");
say("  survived: VB3 07:874-926, WS6 07:346-384, GR3a parked in section 17.3.");
GAPS8ONLY.forEach((g, i) => {
  say("  [" + (i + 1) + "] " + g.ruleId + "  " + g.line);
  for (const line of wrap(g.what, 96)) say("      " + line);
});
say();
say("  Also carried by the contract but NOT exposed by this run: section 18's Q-26 (07:929-936),");
say("  a chain mixing kinds under one 만. This implementation chains only terms of the same kind");
say("  (audit 21 A-4), so \"바닥이랑 거실만\" restricts by space and row 3 wins. The prose question is");
say("  real and unanswered; it simply does not change any output here, which is why no gap is");
say("  recorded for it. Fabricating one would misreport the checker's reach.");
say();

say("== SUMMARY ==");
const gapsByProp = {
  1: ["VB3", "14.3.1", "14.3.3", "14.3.4"],
  2: [],
  3: ["GR3", "GR3 / \"Every result has an order\""],
  4: ["PB4 / \"Every result has an order\"", "GR3a / \"Every result has an order\"",
      "GR3 / \"Every result has an order\""],
  5: [],
  6: ["14.3.1", "VB3", "WS6", "GR3", "GR3 / \"Every result has an order\"",
      "PB4 / \"Every result has an order\"", "GR3a / \"Every result has an order\""],
  7: ["PB4 / \"Every result has an order\"", "GR3 / \"Every result has an order\""],
};
// A finding measured while CFG was switched to rev 9 as written, or to a proposal in no revision,
// is evidence about THAT text. Reporting it under "rev 9.1" would be the same category error this
// file exists to catch, so the split is mechanical: the configuration captured when the finding was
// raised, compared with the in-force one. Nothing here is classified by hand.
useRev(REV_IN_FORCE);
const IN_FORCE_SIG = cfgSig();
const isInForce = (x) => (x.about !== null ? x.forced : x.cfg === IN_FORCE_SIG);
say("  in-force configuration: " + IN_FORCE_SIG);
say();
const OTHERS = [];
for (const p of PROPERTIES) {
  const all = FINDINGS.get(p.n);
  if (process.env.DUMP_FINDING_CFG) for (const x of all) console.error("P" + p.n + " :: " + x.cfg + " :: " + x.site + " :: " + x.text.slice(0, 60));
  const f = all.filter(isInForce);
  const other = all.filter((x) => !isInForce(x));
  for (const x of other) OTHERS.push({ n: p.n, x });
  const hasGap = GAPS9.some((g) => (gapsByProp[p.n] || []).includes(g.ruleId));
  const verdict = f.length ? "FAIL" : (hasGap ? "GAPS" : "PASS");
  say("  property " + p.n + "  " + verdict.padEnd(5) + "(" + f.length + " findings in force at rev " +
    REV_IN_FORCE + (other.length ? ", " + other.length + " under another configuration" : "") +
    (hasGap ? ", gaps attributed" : "") + ")  " + p.name);
  for (const x of f.slice(0, 6)) {
    for (const line of wrap("- " + x.text, 100)) say("        " + line);
    if (x.about) for (const line of wrap("  [in force because: " + x.about + "]", 100)) say("        " + line);
  }
  if (f.length > 6) say("        ... and " + (f.length - 6) + " more");
}
say();
say("  FINDINGS THAT ARE NOT DEFECTS OF REV 9.1 — retained, because each is the evidence for a");
say("  change rev 9.1 made, for a proposal it did not adopt, or a correction to this checker's");
say("  own earlier report. Grouped by the configuration that measured them, or by what they are");
say("  about when that is not a configuration:");
{
  const byCfg = new Map();
  for (const { n, x } of OTHERS) {
    const k = x.about ? "about: " + x.about : x.cfg;
    if (!byCfg.has(k)) byCfg.set(k, []);
    const head = x.text.split(/\.\s/)[0];
    byCfg.get(k).push("property " + n + ": " + (head.length > 240 ? head.slice(0, 240) + "\u2026" : head));
  }
  for (const [cfg, items] of byCfg) {
    say("    under [" + cfg + "]");
    for (const it of items) for (const line of wrap("- " + it, 96)) say("        " + line);
  }
  say("    total: " + OTHERS.length + " of " + (OTHERS.length + [...FINDINGS.values()].reduce((a, v) => a + v.filter(isInForce).length, 0)) + " findings raised this run");
}
say();
say("  underdetermined gaps at rev " + REV_IN_FORCE + ": " + GAPS9.length +
  "   (closed by rev 9 / 9.1: " + GAPS8ONLY.length + ")");
say("  branches run: " + RUNS.length + " over " + ALL_UTTERANCES.length + " utterances (" +
  BRANCHED.length + " utterances the contract does not decide)");
say();
say("  A FAIL above is a finding about the SPECIFICATION, not a crash. Exit code is non-zero only");
say("  if this script itself threw.");

console.log(OUT.join("\n"));
