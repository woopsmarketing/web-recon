// Does D9-2's proposed GR2a satisfy PB4's metamorphic form?
// PB4 form under test: for a criterion c, a record with c=not_evaluable must not sort
// BELOW an otherwise-identical record with c=unsatisfied.  (07:1017)
// EF6 rows verbatim, first match wins (07:1045-1051).
function ef6(breadth, scope, area, projectType, relation) {
  if (scope === "unsatisfied") return relation;                                    // row 1
  if (breadth === "unsatisfied" && projectType === "full_remodel") return "fallback_from_full"; // 2
  if (breadth === "unsatisfied") return "breadth_fallback";                        // row 3
  if (breadth === "not_evaluable") return "unknown_type_fallback";                 // row 4
  if (area === "unsatisfied") return "area_fallback";                              // row 5
  if ([breadth,scope,area].includes("not_evaluable")) return "not_evaluable";      // row 6
  return "exact";                                                                  // row 7
}
const ORDERS = {
  "rev 8 (current)": ["exact","scope_superset","scope_overlap","scope_subset","fallback_from_full","breadth_fallback","unknown_type_fallback","area_fallback","scope_disjoint","not_evaluable"],
  "D9-2 as written": ["exact","scope_superset","scope_overlap","scope_subset","not_evaluable","fallback_from_full","breadth_fallback","unknown_type_fallback","area_fallback","scope_disjoint"],
  "D9-2b unknowns together": ["exact","scope_superset","scope_overlap","scope_subset","unknown_type_fallback","not_evaluable","fallback_from_full","breadth_fallback","area_fallback","scope_disjoint"],
};
const S=["satisfied","unsatisfied","not_applicable","not_evaluable"];
const REL=["scope_superset","scope_overlap","scope_subset","scope_disjoint"];
const PT=["full_remodel","partial_remodel",undefined];
for (const [name, order] of Object.entries(ORDERS)) {
  const pos=c=>order.indexOf(c); const viol=[]; let pairs=0;
  for (const b of S) for (const sc of S) for (const a of S) for (const pt of PT) for (const rel of REL) {
    for (const crit of ["breadth","scope","area"]) {
      const st={breadth:b,scope:sc,area:a};
      if (st[crit]!=="unsatisfied") continue;
      const unsat=ef6(st.breadth,st.scope,st.area,pt,rel);
      const st2={...st,[crit]:"not_evaluable"};
      const nev=ef6(st2.breadth,st2.scope,st2.area,pt,rel);
      pairs++;
      if (pos(nev)>pos(unsat)) viol.push(`${crit}: unsat->${unsat}(${pos(unsat)+1})  nev->${nev}(${pos(nev)+1})`);
    }
  }
  const uniq=[...new Set(viol)];
  console.log(`${name.padEnd(26)} pairs=${pairs}  violations=${viol.length}  distinct shapes=${uniq.length}`);
  for (const u of uniq.slice(0,5)) console.log("      "+u);
}
