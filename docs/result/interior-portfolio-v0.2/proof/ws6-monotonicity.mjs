// D9-5 monotonicity check: is §14.3.3's relation ANTITONE in Q?
// Claim under test: enlarging Q can only make the relation WEAKER, never stronger.
// Table encoded row-by-row, in written order, first match wins (07 §14.3.3, lines 925-932).
const sub=(a,b)=>[...a].every(x=>b.has(x)), eq=(a,b)=>a.size===b.size&&sub(a,b);
const inter=(a,b)=>[...a].some(x=>b.has(x));
function relation(Qs,Qt,Rs,Rt){
  if(Qs.size===0&&Qt.size===0) return "none";                       // row 1
  if(Qs.size===0&&Qt.size>0)   return "TRADE_ONLY";                 // row 2 -> §14.3.3.1
  if(eq(Rs,Qs)&&sub(Qt,Rt))    return "scope_exact";                // row 3
  if(eq(Rs,Qs)&&!sub(Qt,Rt))   return "scope_subset";               // row 4
  if(sub(Qs,Rs)&&Rs.size>Qs.size) return "scope_superset";          // row 5
  if(sub(Rs,Qs)&&Qs.size>Rs.size) return "scope_subset";            // row 6
  if(inter(Rs,Qs))             return "scope_overlap";              // row 7
  return "scope_disjoint";                                          // row 8
}
// Strength order: higher index = stronger claim about the record matching the query.
const STRENGTH={scope_disjoint:0,scope_subset:1,scope_overlap:2,scope_superset:3,scope_exact:4};
const U=["a","b","c"], sets=[];
for(let m=0;m<8;m++) sets.push(new Set(U.filter((_,i)=>m>>i&1)));
let checked=0, viol=[], skipped=0;
for(const Rs of sets) for(const Rt of sets)
for(const Qs of sets) for(const Qt of sets)
for(const Qs2 of sets) for(const Qt2 of sets){
  // only compare when Q2 is a strict superset of Q (the "enlarge Q" direction)
  if(!(sub(Qs,Qs2)&&sub(Qt,Qt2))) continue;
  if(Qs.size===Qs2.size&&Qt.size===Qt2.size) continue;
  const r1=relation(Qs,Qt,Rs,Rt), r2=relation(Qs2,Qt2,Rs,Rt);
  if(!(r1 in STRENGTH)||!(r2 in STRENGTH)){skipped++;continue;}
  checked++;
  if(STRENGTH[r2]>STRENGTH[r1]) viol.push({Rs:[...Rs],Rt:[...Rt],Q:[[...Qs],[...Qt]],Q2:[[...Qs2],[...Qt2]],r1,r2});
}
console.log(`comparable (Q ⊊ Q2, both rows 3-8): ${checked}   skipped (row 1/2 endpoints): ${skipped}`);
console.log(`violations (enlarging Q produced a STRONGER relation): ${viol.length}`);
for(const v of viol.slice(0,6)) console.log("   ",JSON.stringify(v));
console.log(viol.length===0
  ? "\nD9-5 monotonicity HOLDS on rows 3-8: enlarging Q never strengthens the relation."
  : "\nD9-5 monotonicity FAILS — the union is NOT the conservative reading. D9-5 must be withdrawn.");
