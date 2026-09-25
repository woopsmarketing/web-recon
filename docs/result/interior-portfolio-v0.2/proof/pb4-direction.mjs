// Does the D9-2c DIRECTION drive PB4's metamorphic violations to zero?
// Proposal: EF3 calls a caveated match SATISFIED. relation exact|superset -> satisfied;
// overlap|subset|disjoint -> unsatisfied. EF6 gains a row so superset keeps its own class.
const REL=["scope_superset","scope_overlap","scope_subset","scope_disjoint"];
const SAT_RELS=new Set(["scope_exact","scope_superset"]);
function ef6New(b, scState, scRel, a, pt) {
  if (scState==="unsatisfied") return scRel;                                     // row 1 (misses only)
  if (b==="unsatisfied" && pt==="full_remodel") return "fallback_from_full";     // row 2
  if (b==="unsatisfied") return "breadth_fallback";                              // row 3
  if (b==="not_evaluable") return "unknown_type_fallback";                       // row 4
  if (a==="unsatisfied") return "area_fallback";                                 // row 5
  if ([b,scState,a].includes("not_evaluable")) return "not_evaluable";           // row 6
  if (scState==="satisfied" && scRel==="scope_superset") return "scope_superset";// row 7 NEW
  return "exact";                                                                // row 8
}
const ORDER=["exact","scope_superset","unknown_type_fallback","not_evaluable","fallback_from_full","breadth_fallback","area_fallback","scope_overlap","scope_subset","scope_disjoint"];
const pos=c=>ORDER.indexOf(c);
const S=["satisfied","unsatisfied","not_applicable","not_evaluable"];
const PT=["full_remodel","partial_remodel",undefined];
let pairs=0; const viol=[];
for (const b of S) for (const scState of S) for (const a of S) for (const pt of PT) for (const scRel of REL) {
  // scope state must be consistent with its relation under the proposal
  if (scState==="unsatisfied" && SAT_RELS.has(scRel)) continue;
  if (scState==="satisfied" && !SAT_RELS.has(scRel)) continue;
  for (const crit of ["breadth","scope","area"]) {
    const st={breadth:b,scope:scState,area:a};
    if (st[crit]!=="unsatisfied") continue;
    const rel2 = crit==="scope" ? scRel : scRel;
    const unsat=ef6New(st.breadth,st.scope,rel2,st.area,pt);
    const st2={...st,[crit]:"not_evaluable"};
    const nev=ef6New(st2.breadth,st2.scope,rel2,st2.area,pt);
    pairs++;
    if (pos(nev)>pos(unsat)) viol.push(`${crit}: unsat->${unsat}(${pos(unsat)+1})  nev->${nev}(${pos(nev)+1})`);
  }
}
const uniq=[...new Set(viol)];
console.log(`D9-2c direction:  pairs=${pairs}  violations=${viol.length}  distinct shapes=${uniq.length}`);
uniq.slice(0,8).forEach(u=>console.log("      "+u));
console.log(viol.length===0 ? "\nPB4 metamorphic form HOLDS. The direction is sound; specify it properly."
                            : "\nSTILL VIOLATED - the direction is not sufficient either.");
// sanity: every class still reachable
const reached=new Set();
for (const b of S) for (const scState of S) for (const a of S) for (const pt of PT) for (const scRel of REL) {
  if (scState==="unsatisfied" && SAT_RELS.has(scRel)) continue;
  if (scState==="satisfied" && !SAT_RELS.has(scRel)) continue;
  reached.add(ef6New(b,scState,scRel,a,pt));
}
console.log(`classes reached: ${reached.size}/${ORDER.length}  missing: ${ORDER.filter(c=>!reached.has(c)).join(",")||"none"}`);
