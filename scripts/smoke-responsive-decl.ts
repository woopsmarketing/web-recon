/**
 * smoke:responsive-decl — Responsive Core P0 (contract §C2.2 / §C2.3), stream REC-D.
 *
 * Exhaustive OFFLINE unit checks for the pure responsive declaration model:
 * interval algebra + media → intervals, CSS Cascade 5 author/inline winner
 * resolution, and the piecewise width-family planner. No browser, no I/O.
 * Fixture selectors are generic (`.a`, `.b`); no site data.
 */

import {
  FULL_WIDTH_RANGE,
  MEDIA_MAX_EPSILON_PX,
  compareCascade,
  containsIntegerWidth,
  formatInterval,
  importanceTier,
  intersectInterval,
  intersectIntervals,
  intervalContains,
  intervalCovers,
  intervalEdges,
  intervalsContain,
  intervalsEqual,
  isEmptyInterval,
  makeInterval,
  mediaRelevanceAt,
  mediaToIntervals,
  normalizeIntervals,
  partitionInterval,
  pieceAt,
  planNodeProperty,
  planNodeWidthFamily,
  resolveCascade,
  resolveCascadeWinner,
  subtractIntervals,
  unionIntervals,
  type AuthoredLayoutRuleLike,
  type CascadeCandidate,
  type Interval,
  type PiecewisePlan,
  type ResponsiveDeclNode,
} from "../src/reconstruction/responsive-decl/index.js";

let passed = 0;
let total = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  total++;
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log("");
  console.log(title);
}
const INF = Number.POSITIVE_INFINITY;
const iv = (min: number, max: number): Interval => ({ min, max });
const eqList = (a: readonly Interval[], b: readonly Interval[]): boolean =>
  a.length === b.length && a.every((x, i) => x.min === b[i]!.min && x.max === b[i]!.max);
const show = (list: readonly Interval[]): string => list.map(formatInterval).join(" ∪ ") || "∅";

/** Pieces are sorted, contiguous and cover `served` exactly. */
function coversServed(plan: PiecewisePlan): boolean {
  if (plan.pieces.length === 0) return false;
  if (plan.pieces[0]!.interval.min !== plan.served.min) return false;
  if (plan.pieces[plan.pieces.length - 1]!.interval.max !== plan.served.max) return false;
  for (let i = 1; i < plan.pieces.length; i++) {
    if (plan.pieces[i]!.interval.min !== plan.pieces[i - 1]!.interval.max) return false;
  }
  return true;
}
function winnerValues(plan: PiecewisePlan): string[] {
  return plan.pieces.map((p) =>
    p.kind === "winner"
      ? `${formatInterval(p.interval)}=${p.decl.value}`
      : p.kind === "ambiguous"
        ? `${formatInterval(p.interval)}=?`
        : `${formatInterval(p.interval)}=initial${p.frozen ? `(frozen ${p.frozen.value})` : ""}`,
  );
}

// ===========================================================================
section("A. interval algebra");
// ===========================================================================
check("0.02 convention round trip: 899.98 + 0.02 rounds to exactly 900", makeInterval(0, 899.98 + MEDIA_MAX_EPSILON_PX).max === 900);
check("empty interval [5,5)", isEmptyInterval(iv(5, 5)));
check("inverted interval [6,5) is empty", isEmptyInterval(iv(6, 5)));
check("[5,6) is not empty", !isEmptyInterval(iv(5, 6)));
check("min is inclusive", intervalContains(iv(600, 900), 600));
check("max is exclusive", !intervalContains(iv(600, 900), 900));
check("Infinity upper bound contains a huge width", intervalContains(iv(900, INF), 1e7));
check(
  "normalize sorts, merges touching + overlapping, drops empty",
  eqList(normalizeIntervals([iv(900, 1200), iv(0, 600), iv(600, 700), iv(650, 800), iv(1000, 1000)]), [iv(0, 800), iv(900, 1200)]),
  show(normalizeIntervals([iv(900, 1200), iv(0, 600), iv(600, 700), iv(650, 800), iv(1000, 1000)])),
);
check("union of lists", eqList(unionIntervals([iv(0, 10)], [iv(5, 20)], [iv(30, INF)]), [iv(0, 20), iv(30, INF)]));
check("intersect single overlapping", (() => { const x = intersectInterval(iv(0, 900), iv(600, INF)); return x?.min === 600 && x?.max === 900; })());
check("intersect touching is empty (half-open)", intersectInterval(iv(0, 900), iv(900, INF)) === undefined);
check("intersect lists", eqList(intersectIntervals([iv(0, 600), iv(900, INF)], [iv(500, 1000)]), [iv(500, 600), iv(900, 1000)]));
check("subtract middle cut splits in two", eqList(subtractIntervals([iv(0, INF)], [iv(600, 900)]), [iv(0, 600), iv(900, INF)]));
check("subtract everything → empty", subtractIntervals([iv(10, 20)], [iv(0, INF)]).length === 0);
check("subtract disjoint leaves input", eqList(subtractIntervals([iv(10, 20)], [iv(30, 40)]), [iv(10, 20)]));
check("subtract prefix", eqList(subtractIntervals([iv(0, 1000)], [iv(0, 801)]), [iv(801, 1000)]));
check(
  "partition [801,∞) at edges 600/900/1200/801 → three pieces (outside/boundary edges ignored)",
  eqList(partitionInterval(iv(801, INF), [1200, 600, 900, 801, 900]), [iv(801, 900), iv(900, 1200), iv(1200, INF)]),
  show(partitionInterval(iv(801, INF), [1200, 600, 900, 801])),
);
check("partition with no inner edge → served itself", eqList(partitionInterval(iv(0, 801), [900, 1200]), [iv(0, 801)]));
check("partition of empty served → none", partitionInterval(iv(5, 5), [1]).length === 0);
check("sliver [899.02,900) contains no integer width", !containsIntegerWidth(iv(899.02, 900)));
check("[899.5,900.5) contains integer width 900", containsIntegerWidth(iv(899.5, 900.5)));
check("[900,900.02) contains integer width 900", containsIntegerWidth(iv(900, 900.02)));
check("intervalEdges finite, sorted, deduped", (() => { const e = intervalEdges([iv(900, INF), iv(0, 600), iv(600, 900)]); return e.join(",") === "0,600,900"; })());
check("intervalCovers inner", intervalCovers(iv(0, INF), iv(900, 1200)) && !intervalCovers(iv(900, 1200), iv(800, 1000)));
check("intervalsEqual ignores order/merge form", intervalsEqual([iv(600, 900), iv(0, 600)], [iv(0, 900)]));
check("intervalsContain over list", intervalsContain([iv(0, 600), iv(900, INF)], 950) && !intervalsContain([iv(0, 600), iv(900, INF)], 700));
check("FULL_WIDTH_RANGE is [0,∞)", FULL_WIDTH_RANGE.min === 0 && FULL_WIDTH_RANGE.max === INF);

// ===========================================================================
section("A2. media → intervals");
// ===========================================================================
{
  const m = mediaToIntervals(undefined);
  check("no condition → ok [0,∞)", m.status === "ok" && eqList(m.intervals, [iv(0, INF)]));
  const blank = mediaToIntervals("   ");
  check("blank condition → ok [0,∞)", blank.status === "ok" && eqList(blank.intervals, [iv(0, INF)]));
}
{
  const m = mediaToIntervals("(max-width: 899.98px)");
  check("(max-width: 899.98px) → [0,900) (inverse of bandMedia)", m.status === "ok" && eqList(m.intervals, [iv(0, 900)]), show(m.intervals));
}
{
  const m = mediaToIntervals("(max-width: 899px)");
  check("(max-width: 899px) → [0,899.02)", eqList(m.intervals, [iv(0, 899.02)]), show(m.intervals));
}
check("(min-width: 900px) → [900,∞)", eqList(mediaToIntervals("(min-width: 900px)").intervals, [iv(900, INF)]));
check("(min-width:600px) no spaces → [600,∞)", eqList(mediaToIntervals("(min-width:600px)").intervals, [iv(600, INF)]));
check(
  "(min-width: 600px) and (max-width: 899.98px) → [600,900)",
  eqList(mediaToIntervals("(min-width: 600px) and (max-width: 899.98px)").intervals, [iv(600, 900)]),
);
check("(width < 900px) strict upper → [0,900)", eqList(mediaToIntervals("(width < 900px)").intervals, [iv(0, 900)]));
check("(width > 600px) strict lower → [600.02,∞)", eqList(mediaToIntervals("(width > 600px)").intervals, [iv(600.02, INF)]));
check("(width >= 600px) → [600,∞)", eqList(mediaToIntervals("(width >= 600px)").intervals, [iv(600, INF)]));
check("(600px <= width < 900px) → [600,900)", eqList(mediaToIntervals("(600px <= width < 900px)").intervals, [iv(600, 900)]));
check("(width: 500px) exact → [500,500.02)", eqList(mediaToIntervals("(width: 500px)").intervals, [iv(500, 500.02)]));
{
  const m = mediaToIntervals("(max-width: 599.98px), (min-width: 1200px)");
  check("disjunction → union of two intervals, ok", m.status === "ok" && eqList(m.intervals, [iv(0, 600), iv(1200, INF)]), show(m.intervals));
}
check(
  "overlapping disjunction merges",
  eqList(mediaToIntervals("(max-width: 1000px), (min-width: 800px)").intervals, [iv(0, INF)]),
);
{
  const m = mediaToIntervals("print");
  check("print → not-screen, never applies", m.status === "not-screen" && m.intervals.length === 0 && m.possible.length === 0);
  check("print relevance at 1440 → not-applies", mediaRelevanceAt(m, 1440) === "not-applies");
}
check("print and (min-width: 900px) → not-screen", mediaToIntervals("print and (min-width: 900px)").status === "not-screen");
{
  const m = mediaToIntervals("print, (max-width: 600px)");
  check("print, (max-width: 600px) → ok [0,600.02)", m.status === "ok" && eqList(m.intervals, [iv(0, 600.02)]), show(m.intervals));
}
check("screen → ok [0,∞)", eqList(mediaToIntervals("screen").intervals, [iv(0, INF)]));
check("screen and (min-width: 900px) → ok [900,∞)", mediaToIntervals("screen and (min-width: 900px)").status === "ok");
check("only screen and (max-width: 600px) → ok", eqList(mediaToIntervals("only screen and (max-width: 600px)").intervals, [iv(0, 600.02)]));
{
  const m = mediaToIntervals("not all and (min-width: 900px)");
  check("not … → ambiguous, nothing definite, possible everywhere", m.status === "ambiguous" && m.intervals.length === 0 && eqList(m.possible, [iv(0, INF)]));
  check("not … reason recorded", m.reasons.includes("media-not-qualifier"), m.reasons.join(","));
}
{
  const m = mediaToIntervals("(((min-width: 900px)");
  check("unparsed → ambiguous everywhere", m.status === "ambiguous" && eqList(m.possible, [iv(0, INF)]) && m.reasons.includes("media-unparsed"), m.reasons.join(","));
}
{
  const m = mediaToIntervals("(hover: hover)");
  check("(hover: hover) → ambiguous, never definite", m.status === "ambiguous" && m.intervals.length === 0 && eqList(m.possible, [iv(0, INF)]));
  check("(hover: hover) reason names the feature", m.reasons.includes("media-non-width-feature:hover"), m.reasons.join(","));
}
{
  const m = mediaToIntervals("(min-width: 900px) and (hover: hover)");
  check("width + hover → ambiguous only over [900,∞)", m.status === "ambiguous" && m.intervals.length === 0 && eqList(m.possible, [iv(900, INF)]));
  check("width + hover relevance: 800 not-applies, 1000 unknown", mediaRelevanceAt(m, 800) === "not-applies" && mediaRelevanceAt(m, 1000) === "unknown");
}
check(
  "nested non-width group the parser ignores is still ambiguous",
  mediaToIntervals("(min-width: 900px) and ((hover: hover) or (pointer: fine))").status === "ambiguous",
);
check("(prefers-reduced-motion: reduce) → ambiguous", mediaToIntervals("(prefers-reduced-motion: reduce)").status === "ambiguous");
check("(orientation: landscape) → ambiguous (not a width function)", mediaToIntervals("(orientation: landscape)").status === "ambiguous");
{
  const m = mediaToIntervals("(min-width: 64px) and (max-width: 32px)");
  check("contradictory conjunction → ok, holds nowhere", m.status === "ok" && m.intervals.length === 0);
}
check("(max-width: 0px) → [0,0.02)", eqList(mediaToIntervals("(max-width: 0px)").intervals, [iv(0, 0.02)]));
check("(width < 0px) → holds nowhere", mediaToIntervals("(width < 0px)").intervals.length === 0);
check("(min-width: 40em) → [640,∞)", eqList(mediaToIntervals("(min-width: 40em)").intervals, [iv(640, INF)]));
check("calc() bound → ambiguous (unsupported)", mediaToIntervals("(min-width: calc(100px + 1em))").status === "ambiguous");
{
  const m = mediaToIntervals("(hover: hover), (min-width: 900px)");
  check("disjunction with one ambiguous alt: definite [900,∞), possible everywhere", m.status === "ambiguous" && eqList(m.intervals, [iv(900, INF)]) && eqList(m.possible, [iv(0, INF)]));
  check("…relevance at 1000 applies, at 500 unknown", mediaRelevanceAt(m, 1000) === "applies" && mediaRelevanceAt(m, 500) === "unknown");
}
check("device-width default policy = width", mediaToIntervals("(max-device-width: 480px)").status === "ok");
check("device-width with ambiguous option", mediaToIntervals("(max-device-width: 480px)", { deviceWidth: "ambiguous" }).status === "ambiguous");
check("mediaToIntervals is deterministic (cache returns equal copies)", JSON.stringify(mediaToIntervals("(min-width: 900px)")) === JSON.stringify(mediaToIntervals("(min-width: 900px)")));
{
  const a = mediaToIntervals("(min-width: 900px)");
  a.intervals.push(iv(1, 2));
  check("cached result is not mutable through a returned copy", mediaToIntervals("(min-width: 900px)").intervals.length === 1);
}

// ===========================================================================
section("B. Cascade 5 winner resolution");
// ===========================================================================
let seq = 0;
function C(value: string | undefined, extra: Partial<CascadeCandidate> = {}): CascadeCandidate {
  seq++;
  return {
    id: `c${seq}`,
    property: "width",
    value,
    important: false,
    inline: false,
    provenance: "authored-sheet",
    specificity: [0, 1, 0],
    ruleOrder: seq * 10,
    selector: ".a",
    ...extra,
  };
}
const INL = (value: string | undefined, extra: Partial<CascadeCandidate> = {}): CascadeCandidate =>
  C(value, { inline: true, provenance: "authored-inline", specificity: undefined, ruleOrder: 0, selector: undefined, ...extra });
{
  const r = resolveCascade([C("50%")], 1000);
  check("single relevant candidate → resolved", r.status === "resolved" && r.winner?.value === "50%");
}
check("no candidates → no-author-declaration", resolveCascade([], 1000).status === "no-author-declaration");
check("only non-matching media → no-author-declaration", resolveCascade([C("50%", { media: "(max-width: 599.98px)" })], 1000).status === "no-author-declaration");
check("resolveCascadeWinner is the contract alias", resolveCascadeWinner === resolveCascade);
check("importance tiers: normal 0 < inline 1 < important 2 < inline important 3",
  importanceTier(C("x")) === 0 && importanceTier(INL("x")) === 1 && importanceTier(C("x", { important: true })) === 2 && importanceTier(INL("x", { important: true })) === 3);
{
  const r = resolveCascade([INL("10px"), C("20px", { important: true, specificity: [0, 0, 1], ruleOrder: 1 })], 1000);
  check("author !important beats inline normal", r.status === "resolved" && r.winner?.value === "20px");
}
{
  const r = resolveCascade([C("20px", { specificity: [5, 5, 5], ruleOrder: 99999 }), INL("10px")], 1000);
  check("inline normal beats a normal author rule of any specificity/order", r.status === "resolved" && r.winner?.value === "10px");
}
{
  const r = resolveCascade([C("20px", { important: true, specificity: [9, 9, 9] }), INL("10px", { important: true })], 1000);
  check("inline !important beats author !important", r.status === "resolved" && r.winner?.value === "10px");
}
{
  const r = resolveCascade([C("20px", { important: true, specificity: [0, 0, 1], ruleOrder: 1 }), C("30px", { specificity: [3, 0, 0], ruleOrder: 500 })], 1000);
  check("author !important beats normal regardless of specificity/order", r.winner?.value === "20px");
}
{
  const r = resolveCascade([C("30px", { layer: "base", layerOrder: 1, specificity: [1, 0, 0], ruleOrder: 900 }), C("20px", { specificity: [0, 0, 1], ruleOrder: 1 })], 1000);
  check("unlayered normal beats layered normal (even with higher specificity/order)", r.winner?.value === "20px");
}
{
  const r = resolveCascade([C("L0", { layer: "a", layerOrder: 0, ruleOrder: 900 }), C("L1", { layer: "b", layerOrder: 1, ruleOrder: 1 })], 1000);
  check("later layer beats earlier layer for normal declarations", r.winner?.value === "L1");
}
{
  const r = resolveCascade([C("L0", { important: true, layer: "a", layerOrder: 0, ruleOrder: 1 }), C("L1", { important: true, layer: "b", layerOrder: 1, ruleOrder: 900 })], 1000);
  check("earlier layer !important beats later layer !important", r.winner?.value === "L0");
}
{
  const r = resolveCascade([C("L", { important: true, layer: "a", layerOrder: 3, specificity: [0, 0, 1], ruleOrder: 1 }), C("U", { important: true, specificity: [2, 0, 0], ruleOrder: 900 })], 1000);
  check("layered !important beats unlayered !important", r.winner?.value === "L");
}
{
  const r = resolveCascade([C("hi", { specificity: [0, 2, 0], ruleOrder: 1 }), C("lo", { specificity: [0, 1, 0], ruleOrder: 900 })], 1000);
  check("specificity decides before order", r.winner?.value === "hi");
}
{
  const r = resolveCascade([C("early", { ruleOrder: 1 }), C("late", { ruleOrder: 2 })], 1000);
  check("equal specificity → later ruleOrder wins", r.winner?.value === "late");
}
{
  const r = resolveCascade([C("id", { specificity: [1, 0, 0], ruleOrder: 1 }), C("cls", { specificity: [0, 10, 0], ruleOrder: 2 })], 1000);
  check("specificity is lexicographic: [1,0,0] beats [0,10,0]", r.winner?.value === "id");
}
{
  const a = C("a", { ruleOrder: 1 });
  const b = C("b", { ruleOrder: 2 });
  check("compareCascade is antisymmetric", compareCascade(a, b).result === -1 && compareCascade(b, a).result === 1);
}
{
  const base = C("100%", { ruleOrder: 1 });
  const md = C("33%", { media: "(min-width: 900px)", ruleOrder: 2 });
  check("media-dependent winner at 800 → base", resolveCascade([base, md], 800).winner?.value === "100%");
  check("media-dependent winner at 900 → media rule", resolveCascade([base, md], 900).winner?.value === "33%");
  check("media-dependent winner at 1440 → media rule", resolveCascade([base, md], 1440).winner?.value === "33%");
  check("fractional 899.99 below the bound → base", resolveCascade([base, md], 899.99).winner?.value === "100%");
}
{
  const r = resolveCascade([C("base", { ruleOrder: 1 }), C("sup", { supports: "(display: grid)", supportsMatches: false, ruleOrder: 2 })], 1000);
  check("@supports evaluated false → skipped, base wins", r.status === "resolved" && r.winner?.value === "base");
}
{
  const r = resolveCascade([C("base", { ruleOrder: 1 }), C("sup", { supports: "(display: grid)", supportsMatches: true, ruleOrder: 2 })], 1000);
  check("@supports evaluated true → applies, wins by order", r.winner?.value === "sup");
}
{
  const r = resolveCascade([C("base", { ruleOrder: 1 }), C("sup", { supports: "(display: grid)", ruleOrder: 2 })], 1000);
  check("@supports unevaluated and would win → ambiguous", r.status === "ambiguous" && r.reasons.includes("relevance-unknown:supports-unevaluated"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("imp", { important: true, ruleOrder: 1 }), C("sup", { supports: "(display: grid)", ruleOrder: 2 })], 1000);
  check("@supports unevaluated but beaten by !important → resolved (does not matter)", r.status === "resolved" && r.winner?.value === "imp");
}
{
  const r = resolveCascade([C("base", { ruleOrder: 1 }), C("cq", { container: "(min-width: 400px)", ruleOrder: 2 })], 1000);
  check("@container that could win → ambiguous", r.status === "ambiguous" && r.reasons.includes("relevance-unknown:container-query"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("base", { ruleOrder: 5, specificity: [0, 2, 0] }), C("cq", { container: "(min-width: 400px)", ruleOrder: 2 })], 1000);
  check("@container beaten by a relevant rule → resolved", r.status === "resolved" && r.winner?.value === "base");
}
{
  const r = resolveCascade([C("a", { specificity: undefined }), C("b", { specificity: undefined })], 1000);
  check("missing specificity between two relevant candidates → ambiguous", r.status === "ambiguous" && r.reasons.includes("missing-specificity"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("a", { specificity: undefined }), C("b", { specificity: undefined, important: true })], 1000);
  check("missing specificity does not matter when importance decides", r.status === "resolved" && r.winner?.value === "b");
}
{
  const r = resolveCascade([C("auto", { specificity: undefined }), C("auto", { specificity: undefined })], 1000);
  check("missing specificity but both values equal → resolved (tieSameValue)", r.status === "resolved" && r.tieSameValue === true && r.winner?.value === "auto");
}
{
  const r = resolveCascade([C("a", { ruleOrder: undefined }), C("b", { ruleOrder: undefined })], 1000);
  check("missing ruleOrder at equal specificity → ambiguous", r.status === "ambiguous" && r.reasons.includes("missing-rule-order"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("a", { ruleOrder: undefined, specificity: [0, 2, 0] }), C("b", { ruleOrder: undefined })], 1000);
  check("missing ruleOrder does not matter when specificity differs", r.status === "resolved" && r.winner?.value === "a");
}
{
  const r = resolveCascade([C("css", { ruleOrder: 1 }), C("fetched", { origin: "fetched", ruleOrder: 2 })], 1000);
  check("fetched mixed with cssom without sheetIndex → ambiguous", r.status === "ambiguous" && r.reasons.includes("fetched-order-unknown"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("css", { ruleOrder: 1, sheetIndex: 0 }), C("fetched", { origin: "fetched", ruleOrder: 2, sheetIndex: 1 })], 1000);
  check("fetched mixed with cssom WITH sheetIndex → order decides", r.status === "resolved" && r.winner?.value === "fetched");
}
{
  const r = resolveCascade([C("x", { layer: "base", ruleOrder: 1 }), C("y", { layer: "base", ruleOrder: 2 })], 1000);
  check("same named layer without layerOrder → falls through to order", r.status === "resolved" && r.winner?.value === "y");
}
{
  const r = resolveCascade([C("x", { layer: "base", ruleOrder: 1 }), C("y", { layer: "theme", ruleOrder: 2 })], 1000);
  check("different layers without layerOrder → ambiguous", r.status === "ambiguous" && r.reasons.includes("missing-layer-order"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("x", { ruleOrder: 1 }), C(undefined, { ruleOrder: 2, valueUnknownReason: "shorthand-pending-substitution" })], 1000);
  check("winner with unknown value → ambiguous value-unknown", r.status === "ambiguous" && r.reasons.includes("value-unknown:shorthand-pending-substitution"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("x", { ruleOrder: 5 }), C(undefined, { ruleOrder: 2, valueUnknownReason: "shorthand-pending-substitution" })], 1000);
  check("unknown value beaten → resolved", r.status === "resolved" && r.winner?.value === "x");
}
{
  const r = resolveCascade([C("h", { media: "(hover: hover)" })], 1000);
  check("only an unknown-relevance candidate → ambiguous (possibly no author declaration)", r.status === "ambiguous" && r.reasons.includes("possibly-no-author-declaration"), r.reasons.join(","));
}
{
  const r = resolveCascade([C("imp", { important: true, ruleOrder: 1 }), C("h", { media: "(hover: hover)", ruleOrder: 2 })], 1000);
  check("hover-conditioned candidate beaten by !important → resolved", r.status === "resolved" && r.winner?.value === "imp");
}
{
  const r = resolveCascade([INL("a", { ruleOrder: 0 }), INL("b", { ruleOrder: 1 })], 1000);
  check("two element-attached declarations → later in the style attribute wins", r.winner?.value === "b");
}
{
  const r = resolveCascade([INL("a", { ruleOrder: undefined }), INL("b", { ruleOrder: undefined })], 1000);
  check("two inline declarations without order → ambiguous", r.status === "ambiguous" && r.reasons.includes("inline-order-unknown"));
}

// ===========================================================================
section("C. piecewise planner — MUI-like grid fixture");
// ===========================================================================
const R = (property: string, value: string, extra: Partial<AuthoredLayoutRuleLike> = {}): AuthoredLayoutRuleLike => ({
  property,
  value,
  selector: ".a",
  sheetIndex: 0,
  specificity: [0, 1, 0],
  ...extra,
});
const N = (over: Partial<ResponsiveDeclNode>): ResponsiveDeclNode => ({ nodeId: "n1", tagName: "div", attributes: {}, ...over });

const mui = N({
  authoredLayout: [
    R("flex-basis", "100%", { ruleOrder: 10 }),
    R("max-width", "100%", { ruleOrder: 10 }),
    R("flex-basis", "100%", { ruleOrder: 20, media: "(min-width:600px)", selector: ".b" }),
    R("max-width", "100%", { ruleOrder: 20, media: "(min-width:600px)", selector: ".b" }),
    R("flex-basis", "33.3333%", { ruleOrder: 30, media: "(min-width:900px)", selector: ".b" }),
    R("max-width", "33.3333%", { ruleOrder: 30, media: "(min-width:900px)", selector: ".b" }),
    R("flex-basis", "33.3333%", { ruleOrder: 40, media: "(min-width:1200px)", selector: ".b" }),
    R("max-width", "33.3333%", { ruleOrder: 40, media: "(min-width:1200px)", selector: ".b" }),
    R("flex-basis", "25%", { ruleOrder: 50, media: "(min-width:1536px)", selector: ".b" }),
    R("max-width", "25%", { ruleOrder: 50, media: "(min-width:1536px)", selector: ".b" }),
  ],
});
{
  const p = planNodeProperty({ node: mui, viewportId: "desktop", property: "flex-basis", served: iv(900, INF), pageId: "p1" });
  check("MUI flex-basis over [900,∞): status ok", p.status === "ok", p.reasons.join(","));
  check("…pieces cover served exactly", coversServed(p));
  check("…two merged pieces [900,1536)=33.3333%, [1536,∞)=25%", winnerValues(p).join(" ") === "[900, 1536)=33.3333% [1536, ∞)=25%", winnerValues(p).join(" "));
  const first = p.pieces[0]!;
  check("…900 and 1200 sub-intervals merged (mergedFrom 2)", first.mergedFrom === 2);
  check("…provenance authored-sheet, pageId/viewport/node carried", first.kind === "winner" && first.decl.provenance === "authored-sheet" && first.decl.pageId === "p1" && first.decl.viewportId === "desktop" && first.decl.nodeId === "n1");
  check("…decl interval equals piece interval", first.kind === "winner" && first.decl.interval.min === 900 && first.decl.interval.max === 1536);
  check("…sourceCondition names both authored media", first.kind === "winner" && (first.decl.sourceCondition ?? "").includes("(min-width:900px)") && (first.decl.sourceCondition ?? "").includes("(min-width:1200px)"), first.kind === "winner" ? first.decl.sourceCondition : "");
  check("…cascade metadata of the winner kept", first.kind === "winner" && first.decl.cascade?.ruleOrder === 30 && first.decl.cascade?.specificity?.join(",") === "0,1,0" && first.decl.cascade?.important === false);
  check("…verifiedAt starts empty", first.kind === "winner" && first.decl.verifiedAt.length === 0);
  check("…evidence cascadeMetadata complete", p.evidence.cascadeMetadata === "complete");
  check("…pieceAt(1000) = 33.3333%", (() => { const x = pieceAt(p, 1000); return x?.kind === "winner" && x.decl.value === "33.3333%"; })());
  check("…pieceAt(700) outside served = undefined", pieceAt(p, 700) === undefined);
  check("…deterministic", JSON.stringify(p) === JSON.stringify(planNodeProperty({ node: mui, viewportId: "desktop", property: "flex-basis", served: iv(900, INF), pageId: "p1" })));
}
{
  const p = planNodeProperty({ node: mui, viewportId: "desktop", property: "flex-basis", served: iv(801, INF) });
  check("MUI flex-basis over [801,∞): partitioned at 900", winnerValues(p).join(" ") === "[801, 900)=100% [900, 1536)=33.3333% [1536, ∞)=25%", winnerValues(p).join(" "));
  check("…[801,900) winner is the (min-width:600px) rule, not the base", p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.cascade?.ruleOrder === 20);
  check("…covers served", coversServed(p));
  check("…edges evidence = inner edges 900/1200/1536", p.evidence.edges.join(",") === "900,1200,1536", p.evidence.edges.join(","));
}
{
  const p = planNodeProperty({ node: mui, viewportId: "desktop", property: "flex-basis", served: iv(900, INF), merge: false });
  check("merge:false keeps the three raw sub-intervals", p.pieces.length === 3 && p.pieces.every((x) => x.mergedFrom === 1));
}
{
  const p = planNodeProperty({ node: mui, viewportId: "mobile", property: "flex-basis", served: iv(0, 801) });
  check("MUI flex-basis over [0,801): base and 600 rule share 100% → one merged piece", p.pieces.length === 1 && p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.value === "100%" && p.pieces[0]!.mergedFrom === 2, winnerValues(p).join(" "));
}
{
  const p = planNodeProperty({ node: mui, viewportId: "desktop", property: "max-width", served: iv(801, INF) });
  check("MUI max-width over [801,∞) mirrors flex-basis", winnerValues(p).join(" ") === "[801, 900)=100% [900, 1536)=33.3333% [1536, ∞)=25%", winnerValues(p).join(" "));
}
{
  const fam = planNodeWidthFamily({ node: mui, viewportId: "desktop", served: iv(900, INF), truthComputed: { direction: "ltr", "margin-left": "0px", "margin-right": "0px" }, truthViewportWidth: 1440 });
  check("MUI width family over [900,∞) → ok", fam.ok, fam.reasons.join(" | "));
  check("…width has no author declaration → initial auto", fam.plans.width.pieces.length === 1 && fam.plans.width.pieces[0]!.kind === "no-author-declaration" && fam.plans.width.pieces[0]!.initialValue === "auto");
  check("…max-width initial would be none (not used: authored)", fam.plans["max-width"].pieces.every((x) => x.kind === "winner"));
  check("…min-width initial auto", fam.plans["min-width"].pieces[0]!.kind === "no-author-declaration" && fam.plans["min-width"].pieces[0]!.initialValue === "auto");
  check("…margin-left 0 at truth, no author → initial 0px, no frozen decl", fam.plans["margin-left"].pieces[0]!.kind === "no-author-declaration" && fam.plans["margin-left"].pieces[0]!.frozen === undefined && fam.plans["margin-left"].pieces[0]!.initialValue === "0px");
}

// ===========================================================================
section("C2. planner — centered container, shorthands, logical margins");
// ===========================================================================
const container = N({
  authoredLayout: [
    R("width", "85%", { ruleOrder: 3 }),
    R("max-width", "1920px", { ruleOrder: 5 }),
    R("margin", "0px auto", { ruleOrder: 5 }),
    R("margin-top", "0px", { ruleOrder: 5 }),
    R("margin-right", "auto", { ruleOrder: 5 }),
    R("margin-bottom", "0px", { ruleOrder: 5 }),
    R("margin-left", "auto", { ruleOrder: 5 }),
  ],
});
{
  const fam = planNodeWidthFamily({ node: container, viewportId: "desktop", served: iv(801, INF), direction: "ltr", truthComputed: { "margin-left": "80px", "margin-right": "80px" }, truthViewportWidth: 1440 });
  check("85% width + max-width 1920px + margin 0 auto → family ok", fam.ok, fam.reasons.join(" | "));
  check("…width 85% unconditional single piece", winnerValues(fam.plans.width).join(" ") === "[801, ∞)=85%");
  check("…max-width 1920px", winnerValues(fam.plans["max-width"]).join(" ") === "[801, ∞)=1920px");
  check("…margin-left auto", winnerValues(fam.plans["margin-left"]).join(" ") === "[801, ∞)=auto");
  check("…margin-right auto", winnerValues(fam.plans["margin-right"]).join(" ") === "[801, ∞)=auto");
  check("…shorthand record deduped against its longhand (1 candidate)", fam.plans["margin-left"].evidence.sheetCandidates === 1);
  check("…flex-basis no author → initial auto", fam.plans["flex-basis"].pieces[0]!.kind === "no-author-declaration");
}
{
  const node = N({ authoredLayout: [R("margin", "0 auto", { ruleOrder: 1 })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF), direction: "ltr" });
  check("shorthand-only `margin: 0 auto` expands to margin-left auto", winnerValues(p).join(" ") === "[0, ∞)=auto", winnerValues(p).join(" "));
}
{
  const node = N({ authoredLayout: [R("margin", "1px 2px 3px 4px", { ruleOrder: 1 })] });
  const l = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF) });
  const r = planNodeProperty({ node, viewportId: "desktop", property: "margin-right", served: iv(0, INF) });
  check("4-value margin → left 4px / right 2px", winnerValues(l)[0] === "[0, ∞)=4px" && winnerValues(r)[0] === "[0, ∞)=2px", `${winnerValues(l)} ${winnerValues(r)}`);
}
{
  const node = N({ authoredLayout: [R("margin", "var(--gutter) auto", { ruleOrder: 1 })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF) });
  check("shorthand with var() and no longhand → ambiguous (pending substitution)", p.status === "ambiguous" && p.reasons.includes("value-unknown:shorthand-pending-substitution"), p.reasons.join(","));
}
{
  const f1 = planNodeProperty({ node: N({ authoredLayout: [R("flex", "1", { ruleOrder: 1 })] }), viewportId: "desktop", property: "flex-basis", served: iv(0, INF) });
  const f2 = planNodeProperty({ node: N({ authoredLayout: [R("flex", "0 0 200px", { ruleOrder: 1 })] }), viewportId: "desktop", property: "flex-basis", served: iv(0, INF) });
  const f3 = planNodeProperty({ node: N({ authoredLayout: [R("flex", "none", { ruleOrder: 1 })] }), viewportId: "desktop", property: "flex-basis", served: iv(0, INF) });
  check("flex: 1 → flex-basis 0%", winnerValues(f1)[0] === "[0, ∞)=0%", winnerValues(f1).join());
  check("flex: 0 0 200px → flex-basis 200px", winnerValues(f2)[0] === "[0, ∞)=200px", winnerValues(f2).join());
  check("flex: none → flex-basis auto", winnerValues(f3)[0] === "[0, ∞)=auto", winnerValues(f3).join());
}
{
  const node = N({ authoredLayout: [R("margin-inline", "auto", { ruleOrder: 1 }), R("margin-inline-start", "auto", { ruleOrder: 1 }), R("margin-inline-end", "auto", { ruleOrder: 1 })] });
  const ltr = planNodeWidthFamily({ node, viewportId: "desktop", served: iv(0, INF), direction: "ltr", truthComputed: { "margin-left": "10px", "margin-right": "10px" }, truthViewportWidth: 1440 });
  check("margin-inline: auto with ltr → margin-left/right auto", winnerValues(ltr.plans["margin-left"])[0] === "[0, ∞)=auto" && winnerValues(ltr.plans["margin-right"])[0] === "[0, ∞)=auto", ltr.reasons.join("|"));
  const unknown = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF) });
  check("margin-inline with unknown direction → ambiguous", unknown.status === "ambiguous" && unknown.reasons.includes("relevance-unknown:logical-direction-not-ltr"), unknown.reasons.join(","));
  const rtl = planNodeProperty({ node, viewportId: "desktop", property: "margin-right", served: iv(0, INF), direction: "rtl" });
  check("margin-inline with rtl → ambiguous", rtl.status === "ambiguous");
  const vertical = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF), direction: "ltr", truthComputed: { "writing-mode": "vertical-rl" } });
  check("margin-inline with vertical writing-mode → ambiguous", vertical.status === "ambiguous");
}
{
  const node = N({ authoredLayout: [R("margin-left", "0px", { ruleOrder: 1, important: true }), R("margin-inline-start", "auto", { ruleOrder: 2, selector: ".b" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF) });
  check("logical candidate with unknown mapping beaten by physical !important → resolved", p.status === "ok" && winnerValues(p)[0] === "[0, ∞)=0px", p.reasons.join(","));
}
{
  const node = N({ authoredLayout: [R("width", "var(--w)", { ruleOrder: 1 })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(0, INF) });
  check("var() value passed through verbatim with usesVar", p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.value === "var(--w)" && p.pieces[0]!.usesVar === true);
}
{
  const node = N({ authoredLayout: [R("width", "revert-layer", { ruleOrder: 1 })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(0, INF) });
  check("revert-layer cannot be re-emitted outside its layer → ambiguous", p.status === "ambiguous");
}

// ===========================================================================
section("C3. planner — element-attached (inline) declarations");
// ===========================================================================
const sheetWidth = [R("width", "85%", { ruleOrder: 3 })];
{
  const node = N({
    authoredLayout: sheetWidth,
    inlineStyle: { decls: [{ property: "width", value: "50%" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "initial-static", initialValue: "50%", runtimeValue: "50%", variesAcrossWidths: false } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("initial-static inline beats the sheet", winnerValues(p).join(" ") === "[801, ∞)=50%", winnerValues(p).join(" "));
  check("…provenance authored-inline, cascade.inline", p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.provenance === "authored-inline" && p.pieces[0]!.decl.cascade?.inline === true);
  check("…sourceCondition style-attribute", p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.sourceCondition === "style-attribute");
  check("…evidence inlineStyle present, 1 inline candidate", p.evidence.inlineStyle === "present" && p.evidence.inlineCandidates === 1);
}
{
  const node = N({
    authoredLayout: sheetWidth,
    inlineStyle: { decls: [{ property: "width", value: "640px" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "initial-mutated", initialValue: "50%", runtimeValue: "640px", variesAcrossWidths: false } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("initial-mutated uses the runtime value", winnerValues(p).join(" ") === "[801, ∞)=640px", winnerValues(p).join(" "));
  check("…provenance runtime-inline", p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.provenance === "runtime-inline");
}
{
  const node = N({
    authoredLayout: sheetWidth,
    inlineStyle: { decls: [{ property: "width", value: "1200px" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "runtime-responsive", runtimeValue: "1200px", variesAcrossWidths: true } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("runtime-responsive inline → ambiguous", p.status === "ambiguous" && p.reasons.includes("value-unknown:inline-runtime-responsive"), p.reasons.join(","));
}
{
  const node = N({
    authoredLayout: [R("width", "85%", { ruleOrder: 3, important: true })],
    inlineStyle: { decls: [{ property: "width", value: "1200px" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "runtime-responsive", runtimeValue: "1200px", variesAcrossWidths: true } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("runtime-responsive inline normal beaten by sheet !important → resolved", p.status === "ok" && winnerValues(p)[0] === "[801, ∞)=85%", p.reasons.join(","));
}
{
  const node = N({
    authoredLayout: sheetWidth,
    inlineStyle: { decls: [{ property: "transform", value: "none" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "runtime-responsive", runtimeValue: "", variesAcrossWidths: true }, transform: { class: "initial-static", runtimeValue: "none", initialValue: "none", variesAcrossWidths: false } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("varying inline width absent at truth is still evidence → ambiguous", p.status === "ambiguous", winnerValues(p).join(" "));
}
{
  const mk = (varies: boolean): PiecewisePlan =>
    planNodeProperty({
      node: N({
        authoredLayout: sheetWidth,
        inlineStyle: { decls: [{ property: "width", value: "300px" }] },
        inlineStyleProvenance: { correspondence: "no-initial-document", byProperty: { width: { class: "unknown", runtimeValue: "300px", variesAcrossWidths: varies } } },
      }),
      viewportId: "desktop",
      property: "width",
      served: iv(801, INF),
    });
  check("unknown & varying inline → ambiguous", mk(true).status === "ambiguous" && mk(true).reasons.includes("value-unknown:inline-unknown-varying"));
  check("unknown & not varying inline → runtime value (runtime-inline)", mk(false).status === "ok" && mk(false).pieces[0]!.kind === "winner" && (mk(false).pieces[0] as { decl: { provenance: string } }).decl.provenance === "runtime-inline");
}
{
  const node = N({ authoredLayout: sheetWidth, inlineStyle: { decls: [{ property: "width", value: "300px" }] } });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("inline style without provenance → ambiguous (evidence absent, never guessed)", p.status === "ambiguous" && p.reasons.includes("value-unknown:inline-provenance-absent"), p.reasons.join(","));
}
{
  const node = N({
    authoredLayout: sheetWidth,
    inlineStyle: { decls: [{ property: "width", value: "50%", important: true }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { width: { class: "runtime-added", runtimeValue: "50%", variesAcrossWidths: false } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("runtime-added non-varying inline → element-attached runtime-inline", p.status === "ok" && p.pieces[0]!.kind === "winner" && p.pieces[0]!.decl.provenance === "runtime-inline" && p.pieces[0]!.decl.cascade?.important === true);
}
{
  const node = N({
    authoredLayout: [R("margin-left", "auto", { ruleOrder: 1, important: true })],
    inlineStyle: { decls: [{ property: "margin-left", value: "12px" }] },
    inlineStyleProvenance: { correspondence: "matched", byProperty: { "margin-left": { class: "initial-static", runtimeValue: "12px", initialValue: "12px", variesAcrossWidths: false } } },
  });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(0, INF), direction: "ltr" });
  check("sheet !important beats static inline normal", winnerValues(p)[0] === "[0, ∞)=auto", winnerValues(p).join());
}

// ===========================================================================
section("C4. planner — old artifacts, missing metadata, truncation");
// ===========================================================================
{
  const node = N({ authoredLayout: [{ property: "width", value: "100%", selector: ".a" }] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("old artifact, single candidate → resolved", p.status === "ok" && winnerValues(p)[0] === "[801, ∞)=100%");
  check("…evidence cascadeMetadata absent, inline absent-or-not-captured", p.evidence.cascadeMetadata === "absent" && p.evidence.inlineStyle === "absent-or-not-captured");
}
{
  const node = N({ authoredLayout: [{ property: "width", value: "100%", selector: ".a" }, { property: "width", value: "50%", selector: ".b" }] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("old artifact, two relevant candidates → ambiguous (never last-in-array)", p.status === "ambiguous" && p.reasons.includes("missing-specificity"), p.reasons.join(","));
}
{
  const node = N({ authoredLayout: [{ property: "width", value: "100%", selector: ".a", media: "(max-width: 599.98px)" }, { property: "width", value: "50%", selector: ".b", media: "(min-width: 900px)" }] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(0, INF) });
  check("old artifact, two candidates never relevant together → ok piecewise", p.status === "ok" && winnerValues(p).join(" ") === "[0, 600)=100% [600, 900)=initial [900, ∞)=50%", winnerValues(p).join(" "));
}
{
  const node = N({ authoredLayout: [R("width", "100%", { ruleOrder: 1, specificity: undefined }), R("width", "50%", { ruleOrder: 2, selector: ".b", specificity: undefined })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("new artifact with specificity missing on two relevant candidates → ambiguous", p.status === "ambiguous" && p.reasons.includes("missing-specificity"));
  check("…evidence cascadeMetadata partial", p.evidence.cascadeMetadata === "partial");
}
{
  const node = N({ authoredLayoutTruncated: true, authoredLayout: [{ property: "width", value: "100%", selector: ".a" }] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("old truncated artifact (source-order cap) → ambiguous", p.status === "ambiguous" && p.reasons.includes("authored-layout-truncated-source-order"), p.reasons.join(","));
}
{
  const rules: AuthoredLayoutRuleLike[] = [];
  for (let i = 0; i < 8; i++) rules.push(R("flex-basis", `${10 + i}%`, { ruleOrder: 100 + i, media: `(min-width: ${1000 + i * 100}px)`, selector: ".b" }));
  const node = N({ authoredLayoutTruncated: true, authoredLayout: rules });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "flex-basis", served: iv(801, INF) });
  check("precedence-capped truncation: below every kept rule → ambiguous (a dropped rule may apply)", pieceAt(p, 900)?.kind === "ambiguous" && (pieceAt(p, 900) as { reasons: string[] }).reasons.includes("authored-layout-truncated"), winnerValues(p).join(" "));
  check("precedence-capped truncation: winner above the kept floor → resolved", pieceAt(p, 1750)?.kind === "winner" && (pieceAt(p, 1750) as { decl: { value: string } }).decl.value === "17%", winnerValues(p).join(" "));
  check("…at the floor rule itself → resolved (dropped rules rank below it)", pieceAt(p, 1050)?.kind === "winner", winnerValues(p).join(" "));
}
{
  const rules: AuthoredLayoutRuleLike[] = [];
  for (let i = 0; i < 96; i++) rules.push(R(i === 0 ? "width" : "height", "1px", { ruleOrder: i }));
  const p = planNodeProperty({ node: N({ authoredLayoutTruncated: true, authoredLayout: rules }), viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("element-cap truncation → ambiguous", p.status === "ambiguous" && p.reasons.includes("authored-layout-truncated-element-cap"));
}
{
  const node = N({ authoredLayout: [R("width", "100%", { ruleOrder: 1 }), R("width", "50%", { ruleOrder: 2, supports: "(display: grid)", supportsMatches: false, selector: ".b" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("plan: @supports false rule ignored", p.status === "ok" && winnerValues(p)[0] === "[801, ∞)=100%");
}
{
  const node = N({ authoredLayout: [R("width", "100%", { ruleOrder: 1 }), R("width", "50%", { ruleOrder: 2, container: "(min-width: 500px)", selector: ".b" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("plan: @container rule that could win → ambiguous", p.status === "ambiguous" && p.reasons.includes("relevance-unknown:container-query"));
}
{
  const node = N({ authoredLayout: [R("flex-basis", "100%", { ruleOrder: 1 }), R("flex-basis", "50%", { ruleOrder: 2, media: "(min-width: 1200px) and (hover: hover)", selector: ".b" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "flex-basis", served: iv(801, INF) });
  check("hover-gated rule makes only its own width range ambiguous", pieceAt(p, 1000)?.kind === "winner" && pieceAt(p, 1300)?.kind === "ambiguous" && p.status === "ambiguous", winnerValues(p).join(" "));
  check("…covers served", coversServed(p));
}
{
  const node = N({ authoredLayout: [R("width", "100%", { ruleOrder: 1 }), R("width", "50%", { ruleOrder: 2, media: "(max-width: 899px)", selector: ".b" }), R("width", "33%", { ruleOrder: 3, media: "(min-width: 900px)", selector: ".b" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF) });
  const sliver = p.pieces[1];
  check("authored 899/900 pair leaves a true sliver [899.02,900) with the base value", winnerValues(p).join(" ") === "[801, 899.02)=50% [899.02, 900)=100% [900, ∞)=33%", winnerValues(p).join(" "));
  check("…sliver flagged containsIntegerWidth=false", sliver !== undefined && sliver.containsIntegerWidth === false && p.pieces[0]!.containsIntegerWidth === true);
}

// ===========================================================================
section("C5. planner — replaced elements, UA / presentational margins, admission");
// ===========================================================================
{
  const p = planNodeProperty({ node: N({ tagName: "img" }), viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("img with no author width → ambiguous (intrinsic size)", p.status === "ambiguous" && p.reasons.includes("replaced-element-no-author-declaration"));
  const mx = planNodeProperty({ node: N({ tagName: "IMG" }), viewportId: "desktop", property: "max-width", served: iv(801, INF) });
  check("tag case-insensitive; max-width on replaced also ambiguous", mx.status === "ambiguous");
  const fb = planNodeProperty({ node: N({ tagName: "img" }), viewportId: "desktop", property: "flex-basis", served: iv(801, INF) });
  check("img flex-basis with no author → initial auto (not a width/min/max property)", fb.status === "ok");
  const w = planNodeProperty({ node: N({ tagName: "img", authoredLayout: [R("width", "100%", { ruleOrder: 1 })] }), viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("img with authored width 100% → resolved", w.status === "ok" && winnerValues(w)[0] === "[801, ∞)=100%");
  const part = planNodeProperty({ node: N({ tagName: "video", authoredLayout: [R("width", "100%", { ruleOrder: 1, media: "(min-width: 1200px)" })] }), viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("video authored only above 1200 → [801,1200) ambiguous, [1200,∞) winner", pieceAt(part, 1000)?.kind === "ambiguous" && pieceAt(part, 1300)?.kind === "winner");
}
{
  const p = planNodeProperty({ node: N({ tagName: "hr", attributes: { width: "50%" } }), viewportId: "desktop", property: "width", served: iv(801, INF) });
  check("presentational width attribute with no author width → ambiguous", p.status === "ambiguous" && p.reasons.includes("presentational-width-attribute"));
}
{
  const p = planNodeProperty({ node: N({ tagName: "figure" }), viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "40px" }, truthViewportWidth: 1440 });
  const piece = p.pieces[0]!;
  check("UA margin (figure 40px, no author at truth) → frozen fallback, status ok", p.status === "ok" && piece.kind === "no-author-declaration" && piece.frozen?.value === "40px");
  check("…frozen decl provenance frozen over the piece interval", piece.kind === "no-author-declaration" && piece.frozen?.provenance === "frozen" && piece.frozen.interval.min === 801 && piece.frozen.interval.max === INF);
}
{
  // Review fix (MINOR) — UA `auto` inline margins (hr, dialog) are a resolved auto, never frozen px.
  for (const tagName of ["hr", "dialog"]) {
    const p = planNodeProperty({ node: N({ tagName }), viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "120px" }, truthViewportWidth: 1440 });
    check(`${tagName} UA auto margin with no author → ambiguous ua-auto-margin, never frozen px`, p.status === "ambiguous" && p.reasons.includes("ua-auto-margin") && !p.pieces.some((piece) => piece.kind === "no-author-declaration"));
  }
}
{
  const p = planNodeProperty({ node: N({ tagName: "div", authoredLayout: [R("margin-left", "0px", { ruleOrder: 1, media: "(max-width: 599.98px)" })] }), viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "24px" } });
  check("non-zero truth margin, author rules never relevant in served (truth width unknown) → frozen", p.status === "ok" && p.pieces[0]!.kind === "no-author-declaration" && p.pieces[0]!.frozen?.value === "24px");
}
{
  const p = planNodeProperty({ node: N({ tagName: "body" }), viewportId: "desktop", property: "margin-left", served: iv(801, INF) });
  check("UA-margin element without truth computed value → ambiguous", p.status === "ambiguous" && p.reasons.includes("ua-margin-truth-computed-absent"));
}
{
  const node = N({ tagName: "figure", authoredLayout: [R("margin-left", "0px", { ruleOrder: 1, media: "(min-width: 900px)" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "0px" }, truthViewportWidth: 1440 });
  check("UA-margin element with author at truth → no-author sub-interval ambiguous (UA value masked)", pieceAt(p, 850)?.kind === "ambiguous" && (pieceAt(p, 850) as { reasons: string[] }).reasons.includes("ua-margin-masked-by-author-at-truth"));
  check("…authored sub-interval still resolved", pieceAt(p, 1000)?.kind === "winner");
}
{
  const node = N({ tagName: "div", authoredLayout: [R("margin-left", "auto", { ruleOrder: 1, media: "(min-width: 900px)" })] });
  const p = planNodeProperty({ node, viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "120px" }, truthViewportWidth: 1440 });
  check("plain div, author at truth, no-author sub-interval → initial (no UA margin)", p.status === "ok" && pieceAt(p, 850)?.kind === "no-author-declaration" && (pieceAt(p, 850) as { frozen?: unknown }).frozen === undefined);
}
{
  const p = planNodeProperty({ node: N({ tagName: "table", attributes: { align: "center" } }), viewportId: "desktop", property: "margin-left", served: iv(801, INF), truthComputed: { "margin-left": "100px" }, truthViewportWidth: 1440 });
  check("presentational align attribute → margins ambiguous", p.status === "ambiguous" && p.reasons.includes("presentational-margin-attribute"));
}
{
  const p = planNodeProperty({ node: N({ tagName: "div" }), viewportId: "desktop", property: "margin-right", served: iv(801, INF), truthComputed: { "margin-right": "auto" }, truthViewportWidth: 1440 });
  check("unparseable truth margin → ambiguous", p.status === "ambiguous" && p.reasons.includes("truth-margin-unparsed"));
}
{
  const node = N({ authoredLayout: [R("width", "300px", { ruleOrder: 1 }), R("width", "50%", { ruleOrder: 2, media: "(min-width: 1200px)", selector: ".b" })] });
  const admit = (property: string, value: string): string => (property === "width" && /px$/.test(value) ? "value-frozen-px" : "ok");
  const p = planNodeProperty({ node, viewportId: "desktop", property: "width", served: iv(801, INF), admit });
  check("admit hook refuses a winner → that piece ambiguous with the refusal", pieceAt(p, 1000)?.kind === "ambiguous" && (pieceAt(p, 1000) as { reasons: string[] }).reasons.includes("inadmissible:value-frozen-px"));
  check("…admitted piece still resolved", pieceAt(p, 1300)?.kind === "winner");
}
{
  const p = planNodeProperty({ node: N({}), viewportId: "desktop", property: "width", served: iv(900, 900) });
  check("empty served interval → ambiguous served-interval-invalid, no pieces", p.status === "ambiguous" && p.pieces.length === 0 && p.reasons.includes("served-interval-invalid"));
}
{
  const fam = planNodeWidthFamily({ node: N({ tagName: "img", authoredLayout: [R("width", "100%", { ruleOrder: 1 })] }), viewportId: "desktop", served: iv(801, INF), truthComputed: { "margin-left": "0px", "margin-right": "0px" }, truthViewportWidth: 1440 });
  check("width family not ok when any property is ambiguous", !fam.ok);
  check("…reasons are prefixed by property", fam.reasons.includes("max-width: replaced-element-no-author-declaration") && fam.reasons.includes("min-width: replaced-element-no-author-declaration"), fam.reasons.join(" | "));
  check("…the unambiguous properties still carry ok plans", fam.plans.width.status === "ok" && fam.plans["flex-basis"].status === "ok");
}
{
  const all: PiecewisePlan[] = [];
  for (const served of [iv(0, 801), iv(801, INF), iv(900, INF), iv(0, INF)]) {
    const fam = planNodeWidthFamily({ node: mui, viewportId: "desktop", served, truthComputed: { "margin-left": "0px", "margin-right": "0px" } });
    all.push(...Object.values(fam.plans));
  }
  check("every width-family plan of the MUI fixture covers its served interval exactly (24 plans)", all.length === 24 && all.every(coversServed));
}

console.log("");
console.log(`${passed}/${total} checks passed`);
if (passed !== total) process.exit(1);
