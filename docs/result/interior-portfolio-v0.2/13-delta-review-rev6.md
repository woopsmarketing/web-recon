# 13 — Delta review of Contract V0.2 **rev 6** against `11-delta-review-rev5.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `04`, `05`, `11` or `12`, and was given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 6, 1663 lines) + `docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs` |
| checklist | `11-delta-review-rev5.md` — `Q-1`…`Q-4` (BLOCKER), `Q-5`…`Q-8` (MAJOR), §C `C-1`…`C-3`, §E `D-1`…`D-7`, 10 MINOR, 6 NOTE; the author's own disposition is `12-rev6-disposition.md`, treated as a claim |
| also read | `01-owner-decisions.md` (OD-A…OD-S), `04-demo-data-spec.md` rev 5 (all 19 records), `05-review-disposition.md`, frozen V0 `02-integration-contract-v0-candidate.md` |
| method | the `.mjs` proof was run as shipped, then **re-written with a corrected reachability predicate and re-run**; `EF1`–`EF6`, `PB0`–`PB7`, `GR2`/`GR3` were executed by hand against named records and named Korean utterances. Every class, delta and set relation below is an executed result with the arithmetic shown. |

Short names: **`07`** = the contract · **`04`** = the demo-data spec · **`05`** = the disposition ·
**`11`** = round 5's review · **`12`** = the rev-6 disposition · **`proof`** =
`docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs`. All paths under
`/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 1 BLOCKER · 8 MAJOR · 9 MINOR · 6 NOTE.

**Round 5's twelve substantive findings are genuinely closed.** All four BLOCKERs, all eight MAJORs,
§C's three and §E's two are closed in the contract text, not moved: `EF6` has rows for every
criterion state, §14.3.3 has its `Q = ∅` row back, `EF3` splits `Q_s` from `Q_t`, `PB1` states one
predicate, the rung predicate is gone from the class, `PB6a` has a deterministic floor, and the
disclosures are back on rows 6–8. Of the 16 MINOR/NOTE, 14 are closed. This is the first revision
in the series whose headline claims survive checking.

**The one BLOCKER is the Q-7 fix itself.** `WS8`'s new not-closed clause assigns the scope criterion
a state from outside `EF2`–`EF5`, which `EF1` (`07:812`) forbids in terms. For `CINV-9`'s own
fixture the two rules return different states, nothing says which wins, and the losing reading
restores exactly the falsehood `Q-7` was raised about. This is not a cosmetic placement error: it is
what corrupted the contract's own proof, which transcribed `EF3` faithfully and therefore declared
`CINV-9`'s fixture **unreachable** (`proof:41` vs `proof:126-128`).

**On the proof, which `12` §6 asks be attacked first.** `ef6()` (`proof:22-31`) is a faithful,
line-for-line transcription of §14.3.6's eight rows — I checked each branch against `07:1113-1120`
and found no divergence. `CLASSES` matches `GR2`'s closed list at `07:1102-1104`. The totality,
single-valuedness and exactness assertions run over the **full** 1,344 evaluations and are
unaffected by anything below, so **the headline claim — `EF6` is total and single-valued — stands,
and I could not break it.** `reachable()` is *not* faithful (`M-1`), the `EF3`-lemma check is
vacuous by construction (`M-2`), and one of the nine worked cases asserts a class for a vector its
own utterance cannot produce (`M-3`). I re-ran the enumeration with a corrected predicate: every
assertion still passes, so the defects damage the proof's *secondary* claims (which inputs are
reachable, `CINV-20`'s "464", the lemma) and not its central one.

**What rev 6 broke.** Nothing that rev 5 had right in the §C sense — no rule id vanished, no
disclosure was lost, `PB6`'s table, the tiers, `PB2`–`PB5`, `GR1`/`GR4`, `ST3`/`ST5`/`ST7`, §3, §11,
§12 and §17 are untouched and remain consistent. What rev 6 **added** that is new and wrong is
`INV-30`'s collision with `PT5`+`WS9` (`M-6`) and, as a knock-on of the `Q-4` fix, an unguarded
`V.breadth` that the contract gives no way to extract (`M-7`).

**§20.4's relaxation list is not complete** (`M-4`). It misses the one relaxation that changes a
customer-facing answer: rev 5's `PB1` refused a total comparison when the visitor *named spaces*,
and rev 6 removed that refusal. That is the fifth consecutive revision whose closing summary of its
own relaxations is wrong, this time by omission rather than by blanket assertion.

---

## A · Are round 5's findings closed?

### A.1 The four BLOCKERs

| id | verdict | rev-6 text checked, and the executed case |
|---|---|---|
| **`Q-1`** `EF6` had no row for `breadth = unsatisfied` | **CLOSED** | `07:1103` adds `breadth_fallback` to `GR2`'s closed list; `07:1114-1116` rows 2/3/4. Executed *"전체 리모델링 사례 보여주세요"* (`V.breadth = whole`, nothing else stated) over the 19: `bi-15` (partial, 7,000,000) — `EF2` ⇒ breadth `unsatisfied`; `EF3` ⇒ `Q = ∅` ⇒ `not_applicable`; area/budget `not_applicable`; `EF6` row 1 no, row 2 no (not a full), **row 3 ⇒ `breadth_fallback`**. Same for `bi-14`, `bi-16`, `bi-17`, `bi-18`. Mirror case *"주방만 하고 싶어요"* vs `bi-09` (full): breadth `unsatisfied`, row 2 ⇒ **`fallback_from_full`**. Rev 5 returned `exact` for all six. `OD-P` is no longer inverted. |
| **`Q-2`** §14.3.3 lost its `Q = ∅` row | **CLOSED** | `07:885` row 1: *"\| 1 \| `Q = ∅` — the visitor named **no** scope of any kind \| none; scope was not a stated criterion (`EF3`) \| **permitted**; `PB0a`'s coverage statement is required \|"*, with the two-entry-point note at `07:894-899` and `PB1`'s matching clause at `07:1035-1036` (*"entered for **every** `Q`, including `Q = ∅`, which is §14.3.3 **row 1**"*). Executed `PB0`'s own utterance *"2천만원으로 뭘 할 수 있나요"* (`V.budget = exact 20,000,000`): `bi-18` δ = (6,200,000−20,000,000)/20,000,000 = **−0.69**, `bi-15` **−0.65**, `bi-17` **−0.375**, `bi-14` **−0.25**, `bi-16` **−0.01** — all ≤ 0 ⇒ budget `satisfied`, everything else `not_applicable`, `EF6` row 8 ⇒ **`exact` ×5**. Rev 5 returned `not_evaluable` for all five. |
| **`Q-3`** `EF3` extended `PT4`(b) to trades | **CLOSED** | `07:830-832`: *"The **trades** half is evaluated on the id list exactly as any other record's: `satisfied` when `Q_t ⊆ R_t`, **`not_evaluable`** otherwise."* Executed *"창호 교체하려는데 34평 전체 리모델링 사례 있나요, 예산 5천"*: `bi-09` `R_t = {flooring, wallpaper, lighting}` ⊉ `{windows}` ⇒ scope `not_evaluable` ⇒ `EF6` row 7 ⇒ **`not_evaluable`**, no longer `exact`. `bi-10` carries `windows` ⇒ scope `satisfied`, budget δ = (85,000,000−50,000,000)/50,000,000 = **+0.7** ⇒ row 5 ⇒ `price_fallback`, which precedes row 7, so `bi-10` outranks `bi-09` as `CINV-13`(c) (`07:1273`) requires. |
| **`Q-4`** `PB1`'s two non-equivalent predicates | **CLOSED, and it opened `M-7`** | `07:1026-1034` is now one predicate: *"permitted when **all** of: `V.breadth` is `whole` or absent; `EF4` is `satisfied` or `not_applicable`; and the visitor did not **frame** the work as partial (`V.breadth == partial` refuses)"*. `CINV-13`(b) is now satisfiable: *"주방 포함 34평 전체, 예산 5천"* vs `bi-09` ⇒ breadth `satisfied`, scope `satisfied` (spaces half by `PT4`(b), `Q_t = ∅ ⊆ R_t`), area δ = 0, budget δ = 0 ⇒ row 8 ⇒ **`exact`**. The refusal rev 5 keyed on named spaces is gone — see `M-4` and `M-7`. |

### A.2 The four MAJORs, §C's three, §E's two

| id | verdict | evidence |
|---|---|---|
| `Q-5` rung predicate undefined | **CLOSED** | `07:1143-1147`: *"the **ladder** … is **not an input to `EF6`**. A record whose `EF6` class is `exact` is a **direct answer**."* The circularity is gone; `CINV-22` (`07:1283`) fixtures it. The definition creates a new gap in what orders a result — `M-5`. |
| `Q-6` `GR3` not total | **CLOSED as text, dead in practice** | `07:1155` adds the fourth rung. But the rung is reached only *"When no record is a direct answer"* (`07:1148`), and `Q-2`'s fix makes five records direct answers on the rung's own worked utterance — `M-5`. |
| `Q-7` `WS8`'s drop turns unknown into fact | **CLOSED in substance, but the fix contradicts `EF1`** | `07:367-372` and `07:920-929` both carry the not-closed clause; `CINV-9` (`07:1269`) is extended. The falsehood is addressed — and re-opened by `B-1`. |
| `Q-8` `PB6a` unimplementable | **CLOSED for the case it names** | `07:1075-1091`: class order → `|delta_area|` → stated-scope count → `publishedAt` desc → `id` asc, widened from `max` to every `delta = 0` tie, with `CINV-21` (`07:1281`). Executed *"1억 이내로 전체 리모델링"*: `bi-09`/`bi-10`/`bi-11`/`bi-12` all δ = 0, all `exact`, keys 1–3 flat, order decided by `publishedAt` then `id` — determinate. The floor does not reach the no-budget case — `M-5`. |
| `C-1` (`P-13`) disclosures on rows 5–7 | **CLOSED** | `07:890-892`: rows 6, 7 and 8 each read *"the spaces in `Q_s \ R_s` are reported as **not remodelled in this case**"*. Rows 3, 4 and 5 already carried one. All six not-permitted/permitted rows now disclose. |
| `C-2` (`P-6`b) `WS9` byte-identical | **CLOSED** | `07:382-389`: *"**Installing joinery is not by itself a remodel of the space it stands in.** A 복도 붙박이장 is `built_in_furniture` and **not** `hallway`"*, with the two-authoring divergence spelled out and — checked — **correctly renumbered** to rev 6's rows 6 and 3. See `n-2`/`n-3` for what the new sentence does to two fixtures. |
| `C-3` (`P-7`) §20 instructed the unamended `PR4` | **CLOSED** | `07:1492` is rewritten around `PB0`'s declared amendment and its §16 gate; `07:1507` now reads *"`INV-17`–`INV-30` and `CINV-1`–`CINV-23` added"* — I counted the tables: `INV-17`…`INV-30` are all present (14 rows) and `CINV-1`…`CINV-23` are all present (23 rows). |
| `E-D-1` `04`'s two `PB3a`-forbidden comparisons | **CLOSED** | `04:655` now reads *"**The comparable pool is exactly {bi-09, bi-10, bi-11, bi-12} — six pairs — and nothing else.** bi-07 vs bi-11 was listed here through rev 4 and is **forbidden**"*; `04:167`'s three-way claim is gone. |
| `E-D-2` round 4's `D-1`…`D-7` never dispositioned | **CLOSED** | `05:496-511` — *"Round 4 — cross-document findings `D-1` … `D-7` (dispositioned late)"* — all seven present with a disposition each. Two of the fixes it claims are incomplete (`m-5`). |

### A.3 The 10 MINOR and 6 NOTE

| id | verdict | evidence |
|---|---|---|
| `Q-M1` `GR5a` unscoped | **CLOSED in the rule, NOT in the test** | `07:1188-1189` now reads *"the value of a `pricing` field on the record the statement is about"*, with both executed collisions recorded at `07:1192-1195`. But `CINV-18` (`07:1278`) still says *"a number that is itself a `pricing` field value **in the result**"* — see `m-1`. |
| `Q-M2` `EF5` did not route `PB6`'s not-comparable case | **CLOSED** | `07:871-873`. |
| `Q-M3` `PY1`'s confidence signal | **CLOSED** | `07:864-868`, explicitly *"a **disclosure, not a state** … never enters a ranking key"*. |
| `Q-M4` `whole` ↔ `full_remodel` mapping | **CLOSED** | `07:818-821`. |
| `Q-M5` relation renamed | **CLOSED** | `scope_exact` at `07:841, 887, 907, 938, 1152, 1269`. The change-log's claim that the rename reached §19 is vacuous — see `m-9`. |
| `Q-M6` `PB3a`'s third conjunct | **CLOSED in the rule, NOT in the test** | `07:1044-1050` drops it with the reason. `CINV-16` (`07:1276`) still requires *"the same, present, **non-`unknown`** area basis"* — see `m-2`. |
| `Q-M7` `CINV-4` | **CLOSED** | `07:1264` now reads *"**`EF6`'s row order** is the one applied"*. |
| `Q-M8`/`D-4` `04`'s row citations | **PARTIALLY CLOSED** | `04:485` (row 3, `scope_exact`), `04:677` (row 5, superset) and `04:683` (row 4, subset) are correct under rev 6. `04:531` is not — `m-3`. |
| `Q-M9`/`D-5` `04`'s header | **CLOSED** | `04:6` *"SPEC rev 5"*, `04:7` *"rev 5 … realigned to contract **rev 6**"*. |
| `Q-M10`/`D-2` `05` | **CLOSED** | `05:496-511`. |
| `Q-N1` `VB3` unannounced | **CLOSED** | `07:1648`. |
| `Q-N2` `BU4` row | **CLOSED** | `07:1498` corrects the row and refuses to invent the rule. |
| `Q-N3`/`P-18` `WS1` | **CLOSED** | `07:312` *"**WS1 (P: MUST, with an AUTHORING half)**"*. |
| `Q-N4`/`P-17` change-log summary | **NOT CLOSED** | `07:1657-1663` replaces the blanket sentence with an itemised list — which is itself incomplete. `M-4`. |
| `Q-N5`/`D-6` `storage`/`hallway` unused | **CLOSED** | `04:631`. |
| `Q-N6` rows read `Q_s` only | **CLOSED** | `07:901-905`, correctly numbered *"Rows 5–8"*. The change-log cell repeating rev-5's numbers is `m-7`. |
| round 4's `P-7`, `P-10`, `P-12`, `P-13`, `P-14`, `P-17`, `P-18`, `P-15`, `P-16` | **CLOSED** except `P-17` | verified individually against `07:1492`, `07:1075-1091`, `07:1044-1050`, `07:890-892`, `07:907-909`, `07:312`, `07:1145`, `07:1131-1135`. |

**Score: 11 of 12 BLOCKER/MAJOR findings closed cleanly, one (`Q-7`) closed with a new contradiction;
14 of 16 MINOR/NOTE closed.**

---

## B · The proof

### `B-1` (BLOCKER) · `WS8`'s not-closed clause assigns a criterion state from outside `EF2`–`EF5`, which `EF1` forbids — two states for one input, no precedence, and the losing reading restores `Q-7`'s falsehood

**Rules.** `07:812`, inside `EF1`:

> Nothing outside `EF2`–`EF5` assigns a criterion state, and no rule may leave one unassigned.

`07:841`, `EF3`'s partial branch:

> **`partial_remodel` ⇒ §14.3.3's relation**, `satisfied` iff that relation is `scope_exact`.

`07:923-924`, inside §14.3.3's restated `WS7a`, and again at `07:370` inside `WS8`:

> a record from which the consumer dropped any unrecognised `workScopeId` is **not closed**. For such
> a record the scope criterion is `not_evaluable`, no absence may be stated …

**Executed, on `CINV-9`'s own fixture.** `bi-16` = `[kitchen, bathroom]`, 19,800,000, read by a `1.0`
consumer that does not know `bathroom` (`WS8`'s designed-for case, `07:372`); visitor *"주방만, 2천"*
(`Q_s = {kitchen}`, `Q_t = ∅`, `V.budget = exact 20,000,000`).

| rule followed | `R_s` | §14.3.3 | scope criterion | budget | `EF6` | what the visitor is told |
|---|---|---|---|---|---|---|
| `EF1` + `EF3` (state assigned only by `EF2`–`EF5`) | `{kitchen}` | row 3: `R_s == Q_s`, `Q_t ⊆ R_t` ⇒ `scope_exact`, **permitted** | **`satisfied`** | δ = (19,800,000 − 20,000,000)/20,000,000 = **−0.01** ⇒ `satisfied` | row 8 ⇒ **`exact`** | *"이 사례는 주방만 리모델링했습니다"* + a budget match — about a kitchen-**and-two-bathrooms** job |
| `WS8` / §14.3.3's clause | `{kitchen}` | — | **`not_evaluable`** | not_evaluable | row 7 ⇒ `not_evaluable` | *"확인할 수 없습니다"* ✓ |

Both readings are conforming. `EF1`'s sentence is a `C: MUST` inside the block that defines the
criterion states and it positively excludes the `WS8` clause from having any effect; `CINV-9`
(`07:1269`) asserts the opposite outcome but is a test, not a rule, and no precedence rule exists.
`EF1` also says each criterion *"is in exactly one of three states"* (`07:804`) — here one input
yields two.

This is the same shape as round 5's `Q-4` (two non-equivalent predicates, no tie-breaker), which
round 5 rated BLOCKER, and the harmful reading is the one `EF1` endorses. **It is also demonstrably
load-bearing**: the contract's own proof transcribed `EF3` faithfully and therefore encodes
`if (scope === "not_evaluable" && projectType === "partial_remodel") return false;` (`proof:41`) —
declaring this very fixture unreachable while asserting it as worked case 8 (`proof:126-128`).

**Fix (one line, no new rule).** Move the clause into `EF3`: *"`partial_remodel` ⇒ §14.3.3's
relation, `satisfied` iff that relation is `scope_exact` — **except that the criterion is
`not_evaluable` when the consumer dropped any unrecognised id from this record (`WS8`)**"*, and
leave `WS8`/§14.3.3 citing `EF3` rather than assigning. `12` §2's own principle applies: when two
devices can disagree, compute one from the other.

---

### `M-1` (MAJOR) · `reachable()` is not a faithful transcription of `EF2`/`EF3`/`EF5`: it excludes a state the contract makes reachable and includes four `PB1` forbids, so `CINV-20`'s "464" is wrong and the orphan check runs over a set that is neither the reachable set nor a superset of it

**What I checked.** `ef6()` (`proof:22-31`) against `07:1113-1120`, branch by branch: row 1 →
`relation`, row 2 → `fallback_from_full` gated on `full_remodel`, row 3 → `breadth_fallback`, row 4 →
`unknown_type_fallback`, row 5 → `price_fallback`, row 6 → `area_fallback`, row 7 → `.includes("not_evaluable")`
over all four, row 8 → `exact`. **Faithful; no divergence.** `CLASSES` (`proof:15-19`) = `GR2`'s list
at `07:1102-1104`, 11 members. **Faithful.**

`reachable()` (`proof:35-47`) is not.

| line | predicate | contract | verdict |
|---|---|---|---|
| 37-38 | breadth `not_evaluable` iff `V.breadth` stated ∧ type absent | `EF2`, `07:817-818` | ✓ |
| 40 | scope `unsatisfied` ⇒ partial | `EF3`, `07:855-857` | ✓ but circular — see `M-2` |
| **41** | **scope `not_evaluable` ⇒ not a partial** | **contradicted by `07:923-924`, `07:370`, `CINV-9` `07:1269`** | ✗ |
| 42 | scope `satisfied` ⇒ type present | `EF3`, `07:842` | ✓ |
| 44-45 | budget evaluated ⇒ type present | `PB1`, `07:1037` | ✓ |
| — | **missing**: budget evaluated ⇒ breadth ≠ `unsatisfied` | `PB1` preamble, `07:1024-1025` | ✗ |
| — | **missing**: full + budget evaluated ⇒ area ∈ {`satisfied`, `not_applicable`} | `PB1` full branch, `07:1027` | ✗ |
| — | **missing**: partial + budget evaluated ⇒ scope ∈ {`satisfied`, `not_applicable`} (§14.3.3 permits only rows 1 and 3) | `PB1`, `07:1035`; `07:885-892` | ✗ |

**Executed.** I re-ran the enumeration with `proof:41` removed and the three `PB1` constraints added
(script kept out of the repo, in the session scratchpad):

```
shipped  : evaluations=1344 reachable=464 classes=11/11 orphans=[] lemmaViolations=0 failures=0
corrected: evaluations=1344 reachable=328 classes=11/11 orphans=[] lemmaViolations=0 failures=0
proof case 8 (bi-16 with a dropped id, partial_remodel) reachable under SHIPPED predicate? false
proof case 8 reachable under CORRECTED predicate? true
```

**Consequences, in order of seriousness.**
1. The proof contradicts itself: worked case 8 (`proof:126-128`, the `Q-7`/`CINV-9` fixture) is
   asserted and simultaneously classified unreachable.
2. `CINV-20` (`07:1280`) states as fact: *"**464** of the 1,344 evaluations are reachable and all 11
   classes appear among them."* 464 is the output of a wrong predicate. Under a faithful one it is
   328. A consumer implementing `CINV-20` against its own code will not reproduce 464.
3. *"orphan-free on the reachable set"* is proved over a set that both adds and removes members, so
   it is not the theorem stated. (It happens to survive: all 11 classes are still reached at 328, and
   I verified each by hand — e.g. `area_fallback` from `{breadth satisfied, scope not_applicable,
   area unsatisfied, budget not_applicable}` on a `full_remodel`, which no `PB1` clause forbids.)

**What is *not* damaged**, and I want this on the record because it is the claim `12` §1 rests on:
the totality, single-valuedness and exactness assertions (`proof:68-83`) iterate the **full** 1,344
evaluations and never consult `reachable()`. `EF6` is total and single-valued, and I could not break
it. `CINV-20`'s primary claim holds.

---

### `M-2` (MAJOR) · two of the proof's five assertions are vacuous by construction — including the `EF3` lemma, which is the same failure mode `12` §1 admits to fixing once already

**(a) The lemma check cannot fire.** `proof:89-93` asserts *"on the reachable set, row 1 fires only
for a `partial_remodel`"*. `proof:40` — the reachability filter — **is** that statement:
`if (scope === "unsatisfied" && projectType !== "partial_remodel") return false;`. So
`row1NonPartial` is 0 for every possible `ef6()`, including a deliberately broken one. The printed
line *"row-1 firings, non-partial, reachable : 0 (`EF3`'s lemma: must be 0)"* asserts nothing about
`EF3` or `EF6`.

`12:47-50` records the previous version of this counter — *"it counted the superset while the label
claimed the reachable set. I fixed the counter, not the label."* The repair made the counter
tautological. To make it real the proof would have to derive the scope state from `EF3`'s branch
structure (type × `Q`-shape × relation) rather than filter a state vector by the lemma's own
contrapositive.

**(b) The single-valuedness check cannot fire.** `proof:73-75` calls `ef6(v, projectType, relation)`
twice and compares. A pure JavaScript `if`-chain is single-valued for any table, overlapping rows or
not; transcribing an ordered table into an `if`-chain *assumes* first-match-wins rather than testing
it. `EF6` does state the ordering (`07:1109`, *"first match wins"*), so the property is true — but
the proof does not establish it, and `CINV-20`'s *"`EF6` returns exactly one class for every input"*
is therefore argued, not executed.

Net: of `CINV-20`'s five stated assertions, **two are executed and load-bearing** (totality over
`GR2`'s list; `exact` iff nothing missed), **one is executed over the wrong set** (orphans, `M-1`),
and **two are vacuous** (lemma, single-valuedness).

---

### `M-3` (MAJOR) · worked case 7 asserts a class for a state vector its own utterance cannot produce, and in doing so hides a real rev-6 behaviour change

`proof:123-125`:

```
["P-4: '바닥이랑 도배만' vs bi-19 (breadth absent)",
 { breadth: "not_evaluable", scope: "not_evaluable", area: "not_applicable", budget: "not_applicable" },
 null, null, "unknown_type_fallback"],
```

`EF2` (`07:817`): breadth is `not_evaluable` **only** when `V.breadth` was stated and
`R.projectType` is absent. *"바닥이랑 도배만"* states two **trades**. `VB3` (`07:793-796`) is explicit:
*"`V.breadth` is what the **visitor** said, and it is **never inferred from `V.scope`**. Naming two
rooms is not a statement that the project is partial."* So `V.breadth` is absent and breadth is
`not_applicable`, not `not_evaluable`.

**Executed with the correct vector.** `bi-19` (`projectType` absent, `R_t = {flooring, wallpaper,
lighting}`): breadth `not_applicable`; scope — `EF3`'s absent branch (`07:842`) ⇒ `not_evaluable`;
area, budget `not_applicable`. `EF6`: row 4 does **not** fire (breadth is `not_applicable`, not
`not_evaluable`); rows 5–6 no; **row 7 ⇒ `not_evaluable`**, not `unknown_type_fallback`.

This matters beyond the proof. Under rev 5 the class came from the **rung** row, so `bi-19` on the
trade rung was `unknown_type_fallback` — which is how round 5 verified `P-4` closed (`11:64`).
Rev 6 removed the rung from the class, so **`unknown_type_fallback` now requires the visitor to have
stated a breadth**, and it no longer fires for the canonical trade-only query the class was reached
through. `P-4` itself stays closed — `GR3`'s trade rung (`07:1153`) still makes `bi-19` reachable and
`04:681`'s expected answer still holds — but the proof's claim that *"all 9 previously-failing worked
cases return the intended class"* is false for case 7, and the change went unrecorded in §20.4.

---

## C · New defects in rev 6

### `M-4` (MAJOR) · §20.4's relaxation list is incomplete: the `Q-4` fix removed a refusal, and that removal is the one change in rev 6 that alters what a customer is told

`07:1657-1663` closes with *"**What rev 6 relaxes: nothing, and here is the check.**"* and four named
items, ending *"Every other row adds a rule, a disclosure, a state transition or a test."*

The `Q-4` row is not one of the four, and it does not add anything — it **deletes** a refusal. Rev 5's
`PB1` (quoted by round 5 at `11:262`) read *"Refused when the visitor asked about partial work **or
named spaces**"*. Rev 6 (`07:1028-1031`) reads *"Naming spaces is **not** by itself a refusal"*.

**Executed.** *"주방 포함 34평 전체 리모델링, 예산 5천"* vs `bi-09`: rev 5 refused the comparison
(budget `not_evaluable`, class `not_evaluable`); rev 6 permits it (δ = 0, class `exact`). A
comparison that was forbidden is now performed and a class that was withheld is now asserted. That is
a relaxation by any definition, and round 5 named its cost in the same paragraph that recommended the
wording (`11:285-288`): *"executed at 욕실만, 700만원 이내, `bi-09` (50,000,000) and `bi-11`
(30,000,000) both become budget-compared and labelled `price_fallback` … which is the claim `PT2` and
`PB2`'s spirit say has no referent."* That cost is live — see `M-7`.

`07:1660` also says `PB3a`'s dropped conjunct *"changes no outcome"*. True on the wire, but
`CINV-16` still tests it (`m-2`), so one outcome does change: a conforming consumer that implements
`CINV-16` rejects a comparison `PB3a` now permits.

The list is the right device and four of its five rows check out. It is incomplete, which — counting
`P-17`'s three prior recurrences — makes this the **fifth** consecutive revision whose closing
account of its own relaxations is wrong.

---

### `M-5` (MAJOR) · nothing orders a result that contains a direct answer and no budget tie — `Q-6`'s new rung is dead on its own worked utterance, and two conforming consumers show different cases

**Rules.** `GR3` `07:1143-1148`: *"the **ladder** is the order in which records are **offered**"*, then
*"**When no record is a direct answer**, the ladder is what the visitor sees, in this order:"*.
`PB6a` `07:1075-1076`: *"**whenever `PB6` yields `delta = 0` for more than one record**"*. `PB4`
`07:1062`: *"with a result limit of 3 over 19 records, fourth place is invisible"*.

**Executed case 1 — `PB0`'s own utterance, *"2천만원으로 뭘 할 수 있나요"*.** `Q-2`'s fix makes five
partials `exact` (arithmetic in §A.1). Therefore:

- `GR3`'s new budget rung (`07:1155`) is **not reached** — five records are direct answers.
- `PB6a` is **not triggered** — for an `exact` budget, δ = 0 requires `total == 20,000,000`; no record
  has it. The five deltas are −0.69, −0.65, −0.375, −0.25, −0.01.
- `PB6a`'s deterministic floor is therefore unreachable, and no other rule orders anything.

Two defensible readings of `GR3` give different answers, and with a limit of 3 they show **different
records**:

| reading | order | top 3 |
|---|---|---|
| the budget rung's own key (`\|delta\|` ascending, `07:1155`) | bi-16 (0.01), bi-14 (0.25), bi-17 (0.375), bi-11 (0.5), bi-15 (0.65), bi-18 (0.69), … | **bi-16, bi-14, bi-17** |
| *"Within a rung, `PB6a`'s sequence orders"* (`07:1157`): class → `\|delta_area\|` (n/a) → stated-scope count (0) → `publishedAt` desc | bi-14 (2025-07-31), bi-15 (2025-07-03), bi-16 (2025-06-05), bi-17 (2025-05-08), bi-18 (2025-04-10) | **bi-14, bi-15, bi-16** |
| `GR3` read literally (ladder applies only with no direct answer) | undefined | undefined |

`PB6`'s stated purpose (`07:1065`) is *"so that two consumers cannot disagree on one document"*.

**Executed case 2 — *"전체 리모델링 사례 보여주세요"*.** `bi-09`…`bi-13` (plus `bi-01`, `bi-07`) are
all breadth `satisfied`, everything else `not_applicable`, `EF6` row 8 ⇒ **seven `exact` records**,
no budget, so `PB6a` never fires and the ladder never applies. Which three of seven are shown is
undetermined.

`CINV-21` (`07:1281`) is not violated — it fixtures a `max` budget where `PB6a` does fire — so the
gap ships untested. `Q-8`'s floor needs to be lifted out of `PB6a`'s trigger and made the result's
default order.

---

### `M-6` (MAJOR) · `INV-30` collides with `PT5` and rev 6's own new `WS9` sentence: a bounded job whose only work is a trade run through the space has no authoring that satisfies all three

**Rules.** `PT5` (`07:193-195`): *"The source states a **bounded set of spaces** the project
**covered**."* `WS9` (`07:376-378`): *"**Author a `Spaces` id only when that space itself was
remodelled** … **A trade run *through* a space** … **is authored as the trade id alone.**"*
`INV-30` (`07:1254`): *"`projectType == "partial_remodel"` ⇒ `workScopeIds` contains at least one id
from §7.3's **Spaces** table"*, mirrored into the producer per `12:153-158`, i.e. under a fail-closed
`VA1` (`07:675-678`) it **fails the build**.

Take a job the demo corpus nearly contains: *거실 바닥만 교체* — one bounded space, one trade run
through it, nothing about the room itself changed.

| rule | says |
|---|---|
| `PT5` | `partial_remodel` is authorable — the source states a bounded set of spaces it covered |
| `WS9` | author `[flooring]`; `living_room` is not authorable, nothing about the room changed |
| `INV-30` | `[flooring]` on a `partial_remodel` **fails the build** |

`INV-28` accepted `[flooring]` (non-empty), so this is new in rev 6. The escape is to omit
`projectType` — but `PT6` (`07:197`) applies *"in every other case"*, and `PT5`'s case obtains. In
practice an author will drop breadth and lose the fact on a job that genuinely is bounded. §18's
`Q-19` anticipates the *trades-only-across-the-dwelling* case (`bi-19`) and is right about it; it
does not anticipate the *bounded-space-touched-only-by-a-trade* case, which `PT5` explicitly
authorises and `WS9` explicitly strips.

`bi-17` survives only by luck: `04:479` gives the living room a 템바보드 TV wall, indirect lighting
and new wallpaper, so `living_room` is authorable on its own merits. Remove the TV wall and `bi-17`
fails `INV-30`.

**Answer to `Q-19`, since §18 asks.** `INV-30` is right in direction and wrong in extent. Either
scope it to *"⇒ at least one `Spaces` id **or** an authored statement of the bounded set"*, or state
in `PT5` that a bounded set whose only work is a trade is authored breadth-absent — and say so where
an author will read it, not only in §18.

---

### `M-7` (MAJOR) · `V.breadth` is now the sole gate on the total-budget comparison and the contract gives no rule for extracting it, while `VB3` pushes consumers toward the reading that produces the claim `OD-O` forbids

**Rules.** §14.3.1 (`07:780`): *"`V.breadth` \| `whole` · `partial` \| the visitor did not say how
much of the home"*. `VB3` (`07:793-795`): *"never inferred from `V.scope`. Naming two rooms is not a
statement that the project is partial."* `PB1` (`07:1028`): *"the visitor did not **frame** the work
as partial"*. Nothing anywhere maps an utterance to `whole`/`partial`.

**Executed — *"욕실만, 700만원 이내"* vs `bi-09` (full_remodel, 50,000,000).**

| extraction | breadth | budget | `EF6` | sentence to the customer |
|---|---|---|---|---|
| `V.breadth = partial` (the 만 is framing, per `PB1`'s word *"frame"*) | `unsatisfied` | `PB1` preamble refuses ⇒ `not_evaluable` | row 2 ⇒ `fallback_from_full` | *"전체 리모델링 사례입니다 — 참고용"* ✓ |
| `V.breadth` absent (per `VB3` — the only signal is a scope word) | `not_applicable` | permitted: `V.breadth` absent ✓, `EF4` `not_applicable` ✓, not framed partial ✓. δ = (50,000,000 − 7,000,000)/7,000,000 = **+6.14** ⇒ `unsatisfied` | row 5 ⇒ `price_fallback` | *"예산을 초과합니다"* — about a whole-dwelling total, against a bathroom-only budget |

`OD-O`: *"A customer's total budget and a portfolio total price are directly comparable **when the
project semantics match**."* Under the second extraction they do not match and the comparison
happens. `PB0a`'s coverage statement discloses the mismatch; it does not make the prices comparable,
and *"예산을 초과합니다"* is still said.

Rev 5 blocked this with the refusal on named spaces. Rev 6 removed it (`M-4`) and put the whole
weight on a field nothing defines. That the ambiguity is real and not theoretical is visible inside
round 5's own review, which extracted *"주방만 하고 싶어요"* as `V.breadth = partial` (`11:129`) and
*"욕실만 700만원 이내"* as `V.breadth` absent (`11:302`) — two opposite readings of the same particle,
three pages apart, by the reviewer who wrote the rule rev 6 adopted.

**Fix.** One sentence in `VB3`: what the visitor **restricts** (…만, …만 하고 싶어요, 부분만) sets
`V.breadth`; what they **enumerate** (A랑 B) does not. That keeps `VB3`'s point, keeps `CINV-13`(b)
working, and closes the hole `Q-4`'s fix opened.

---

### `M-8` (MAJOR) · `GR3`'s rungs do not cover the classes `EF6` now produces: `breadth_fallback` is on no rung at all, and a spaces-named query ladders neither `scope_superset` nor `scope_subset`

`GR3`'s table (`07:1152-1155`) has four rows. Across all four, the rungs name: `scope_exact` partials,
`scope_overlap` partials, `full_remodel` records, breadth-absent records, partials by §14.3.3.1, and
records with a comparable/any total.

- **`breadth_fallback` (`07:1115`, new in rev 6) is on no rung.** The only query shape that produces
  it is a whole-home query (`bi-15` above), and the whole-home row's rungs are *"`full_remodel`
  records → breadth-absent records"*. The class rev 6 added to fix `Q-1` never appears in the device
  that decides what the visitor sees, and no `CINV` mentions it.
- **`scope_superset` and `scope_subset` partials are on no rung** for *"partial work, spaces named"*.
  Executed *"주방만 하고 싶어요"*: `bi-16` (`R_s = {kitchen, bathroom} ⊋ Q_s`) ⇒ §14.3.3 row 5 ⇒
  `scope_superset`; `bi-15` (`R_s ∩ Q_s = ∅`) ⇒ row 8 ⇒ `scope_disjoint`. Neither is on a rung.
  `OD-P`'s ladder reads *"partial exact scopes → **partial overlapping scopes** → full/unknown
  projects containing the requested space"*; the contract renders *"overlapping"* as its own narrow
  `scope_overlap` (*"neither contains the other"*, `07:891`), so a kitchen-and-bathroom job is not on
  the rung `OD-P` wrote for it.

`GR3` is explicitly not a filter (`CINV-22`, `07:1283`), so these records are still returned — the
damage is that their position is undefined, which compounds `M-5`. But `GR3` opens by claiming to be
*"the order in which records are **offered**"* (`07:1143`), and for three of the eleven classes it
says nothing.

---

## D · MINOR

| id | defect | where |
|---|---|---|
| `m-1` | `CINV-18` still carries the wording `Q-M1` removed from the rule: *"a number that is itself a `pricing` field value **in the result**"*. `GR5a` is now scoped to *"the record the statement is about"* (`07:1188`). The test as written passes a consumer that states `bi-10`'s 2,500,000 about `bi-09` — the exact cross-record fabrication `Q-M1` identified (`bi-09` 50,000,000 ÷ `bi-11` 20평 = 2,500,000). | `07:1278` vs `07:1188-1195` |
| `m-2` | `CINV-16` still requires the conjunct `Q-M6` deleted: *"on the same, present, **non-`unknown`** area basis"*. `PB3a` (`07:1044-1050`) no longer has it, and `07:1660` claims the drop *"changes no outcome"* — it changes `CINV-16`'s. | `07:1276` vs `07:1044-1050` |
| `m-3` | `04:531` still uses rev-5 row numbers: *"the shape §14.3.3 **row 2/3**'s `Q_t` conjunct turns on"*. Under rev 6 the rows that read `Q_t` are **3 and 4** — the contract says so itself at `07:903-905` (*"Rows 3 and 4 … are the rows where `Q_t` changes the answer"*). `04:7` claims *"every `§14.3.2 row N` citation corrected to rev 6's numbering"*; this one is spelled §14.3.3 and escaped the pass. (`04:485`, `04:677`, `04:683` are correct.) | `04:531` |
| `m-4` | `04:669` — *"Restated against contract **rev 5**'s evaluation function"* — in a §4.1 whose header (`04:7`) says the document is realigned to rev 6. | `04:669` |
| `m-5` | Two stale *"contract rev 3"* citations survive in `04`: `04:36` (*"Contract rev 3 `ST4`"*) and `04:179` (*"(rev 3 `PT4`(b))"*). `04:7` claims *"every stale *"contract rev 3"* citation … corrected"* and `05:507` claims *"Four … citations updated to rev 6"*; round 5's `D-3` named five lines. Two of five remain. | `04:36`, `04:179`, `04:7`, `05:507` |
| `m-6` | §15's tables are out of numeric order: `INV-30` is printed **before** `INV-29` (`07:1254-1255`), and `CINV-23` **before** `CINV-22` (`07:1282-1283`). Both counts are right; the order will cost a reader a double-take on the one invariant that is backward-incompatible. | `07:1254-1255`, `07:1282-1283` |
| `m-7` | §20.4's `Q-N6` cell reads *"§14.3.3 rows **4–7** ignore `Q_t`"*. That is rev 5's numbering; rev 6's are **5–8** (`07:901`). The neighbouring `C-1` cell (`07:1635`) gives both numberings explicitly, so the omission is inconsistent within one table. | `07:1651` |
| `m-8` | `CINV-20` says *"Inputs unreachable under **`EF2`/`EF3`** are included deliberately"*; the predicate it points at, and the line the proof prints, both say `EF2`/`EF3`/`EF5`. | `07:1280` vs `proof:33-47`, `proof:141` |
| `m-9` | §20.4 claims the relation was *"renamed `scope_exact` throughout (§14.3.3, §14.3.3.1, `EF3`, `GR3`, **§19**)"*. §19 (`07:1375-1481`) contains neither name — the claim is vacuous rather than wrong, but it is the kind of unchecked completeness claim §20.4 exists to stop. | `07:1642` |

---

## E · NOTE

| id | observation |
|---|---|
| `n-1` | `breadth_fallback` occurs exactly twice in the contract — `GR2`'s list (`07:1103`) and `EF6` row 3 (`07:1115`). No `CINV` fixtures it and no `GR3` rung offers it (`M-8`). The class that closes the round's headline BLOCKER ships with no test naming it. |
| `n-2` | Rev 6's new `WS9` sentence was not carried back through `04`. `bi-09` authors `bedroom` on the strength of *"안방에는 붙박이장을 두었습니다"* (`04:116`) — joinery, which the new sentence says *"is not by itself a remodel of the space it stands in"* — and authors `living_room` although `04:114-116` describes only trades run through it. It costs nothing today (`kitchen` and `bathroom` carry `PT4`(c)/`INV-29`, and `07:853` relies only on those two), but `04` rev 5 says *"No record's data changed"* and the new sentence was not applied to the five records it could touch. |
| `n-3` | §7.3's `entrance` gloss (*"현관, 중문, **shoe storage at the entrance**"*, `07:275`) and `WS9`'s new joinery sentence give opposite answers for a shoe-cabinet-only entrance job. `bi-18` survives only because it also fitted a 중문 (`04:524`), which the `entrance` gloss names directly. Worth one clause saying the `entrance` gloss is the more specific rule. |
| `n-4` | **Answer to §18's `Q-20`.** Yes — the contract has begun specifying the assistant's voice. `PB0a`'s template (`07:1006-1014`), `CINV-17`'s wording and `CINV-23`'s *"집 전체를 리모델링한 사례"* are three prescribed sentences. I think `PB0a` earns it (two consumers must build the same statement or `PB0`'s amendment is unsafe) and `CINV-23` earns it (it converts an unverifiable premise into a true-but-general sentence). `CINV-17` is on the line. This is a judgement for the owner, not a defect. |
| `n-5` | `proof/ef6-totality.mjs` is wired into no test runner — `grep -rn "ef6-totality"` over the repo returns only the file's own *"Run: node …"* comment. `CINV-20` says it *"proves the **specification**"*; nothing re-runs it when §14.3.6 is edited, which is the failure mode it was written against. One line in a package script would close it. |
| `n-6` | `05` now disposes round 4's `D-1`…`D-7` (`05:496-511`) but hands round 5 to `12` in a single paragraph (`05:513-519`), and its producer work list (`05:481-494`) is still five items with no `INV-30` — `12:163` says so deliberately (*"Items 1–5 of `05`'s list are unchanged"*). Nothing contradicts; the producer's actual delta is now split across two files, and `INV-30` is the one item that fails a build if missed. |

---

## F · Did rev 6 break anything rev 5 had right?

Checked the way round 5's §C checked rev 5.

**Rule-id survival.** No id disappeared. `PT1`–`PT6`, `PY1`, `WS1`–`WS9`, `ST1`–`ST7`, `SD1`/`SD2`,
`TP1`–`TP3`, `PA1`–`PA5`, `ND1`/`ND2`, `D-1`/`D-1a`/`D-1b`/`D-1c`, `RD1`, `VA1`, `GC1`, `LO1`,
`VB1`–`VB3`, `TI1`, `PB0`–`PB7`, `PB0a`, `EF1`–`EF6`, `GR1`–`GR5`/`GR5a`, `RO1`/`RO2` all survive.
New: `INV-30`, `CINV-20`–`CINV-23`, the `breadth_fallback` class. `INV-1`–`INV-29` untouched.

**Executed re-checks of things rev 5 had right.** `PB6`'s 3 × 2 table (`07:1068-1072`) is unchanged,
including `max` × `range` and shared-endpoint overlap. The tier bands (`07:976-980`) and
`delta_area = (r − v)/v` are unchanged. `GR5`/`GR5a`'s four exact divisions re-verified:
`bi-09` 50,000,000 ÷ 34 = 1,470,588.2… → 1,470,588; `bi-10` 85,000,000 ÷ 34 = 2,500,000;
`bi-11` 30,000,000 ÷ 20 = 1,500,000; `bi-12` 52,000,000 ÷ 26 = 2,000,000; `bi-19` 11,000,000 ÷ 32 =
343,750 remains no field's value and stays forbidden. `PB4`'s strong form, `PB2`, `PB3`, `PB5`,
`ST3`/`ST5`/`ST7`, `LO1`, `GC1`, §3's `"1.0"` reasoning, §11, §12, §16's two confirmations and §17's
deferrals are unchanged and remain consistent. `WS9`'s worked example was **correctly renumbered**
(rows 6 and 3, `07:388-389`), as was §19's (`07:1470`, row 5).

**The one regression is `B-1`**, and it is a regression in the `Q-7` fix rather than in anything rev 5
had right. `M-6` and `M-7` are new defects in new text rather than damage to old text.

---

## G · Cross-document

**`04` rev 5 against contract rev 6 — agrees, with three stale strings.** The 19 records satisfy
every invariant I could evaluate: `INV-19` (no `derived` `perArea` off a non-full — the five partials
and `bi-19` all have none), `INV-28`, `INV-29` (`bi-19` is the negative case), `INV-23`,
`INV-18`/`WS5` (`bi-18` style absent, never `[]`), `WS3` (`bathroom` once on `bi-16`). `INV-30`
passes on all five new partials: `bi-14` `kitchen`, `bi-15` `bathroom`, `bi-16` `kitchen`+`bathroom`,
`bi-17` `living_room`, `bi-18` `entrance`. Stale strings: `m-3`, `m-4`, `m-5`.

**`05` and `12` against each other and against `07`.** Consistent. `05:496-511` closes `E-D-2`;
`05:513-519` summarises round 5 and hands the itemised disposition to `12`; `12`'s own counts (4·8·10·6
plus §C's 3 and §E's 2) match `11`'s verdict line and `07:1612`. `12` §4's relaxation table is the
same list as `07:1657-1663` and carries the same omission (`M-4`). `12:153-158` adds `INV-30` as
producer item 6 while `05`'s list stays at five (`n-6`). No contradiction between the three.

**Owner decisions.** Checked each against rev 6's text: OD-A (`RO1`, `07:1306`), OD-B (`GC1`),
OD-C, OD-D (`LO1`), OD-E, OD-F (`PT1`, `07:136`), OD-G (`WS3`), OD-H (`ST3`, `07:1208-1212`),
OD-I (§9.1's `kind` discriminant), OD-J/`ND2`, OD-K/`D-1a` (verified against all six non-full priced
records), OD-L (`AR4`/`AR5`, `PY1`), OD-M (`TI1`, `07:982`), OD-N (`PB4` strong form), OD-P
(`GR3`/`GR2` — see `M-8` for the narrow reading of *"overlapping"*), OD-Q, OD-R (§17), OD-S (§16).
**`OD-O` is the one at risk**, under `M-7`'s second extraction only.

**Frozen V0.** `PB0` remains the single declared amendment to a frozen rule (`PR4`), correctly
labelled and correctly gated on §16's consumer confirmation at `07:992`, `07:1022-1023`, `07:1303`
and `07:1492`. `INV-30` is an addition, not an amendment. No other V0 rule is touched.

---

## H · What I could not verify

- **`INV-30` against `bi-04` and `bi-06`.** Their `workScopeIds` are unauthored (`04:41`), so the
  check is unverifiable, exactly as §18's `Q-19` says. On the §13 evidence (`07:691`, `07:693`) both
  will carry `Spaces` ids, so I expect it to pass — but I did not verify it and neither did the
  author.
- **The producer-side mirror of `INV-30`.** `12:153` says it mirrors `INV-29` in
  `platform/content/schema.ts` / `platform/integration/validate.ts`; the code change is queued, not
  written, so I checked the contract text only.
- **The full 19 × 12 query matrix.** Round 5 executed one; I executed nine targeted queries against
  named records rather than re-running the whole matrix, so a defect confined to a query shape I did
  not run would not appear here.
- **Sections round 5 declared clean and rev 6 did not touch** — §1–§4, §6, §8, §9–§11, §17, `PB6`'s
  table, §14.4 — were spot-checked for consistency with the changed rules, not re-reviewed.
- **Whether `CINV-20`'s "464" was ever anything but the script's output.** I can show the number is
  wrong under a faithful predicate; I cannot tell whether it was derived independently.

---

## I · The shortest path to READY

1. **`B-1`** — move `WS8`'s not-closed clause into `EF3` as an explicit branch; leave `WS8` and
   §14.3.3 citing it. One sentence moved; `EF1`'s closure sentence then holds.
2. **`M-1`/`M-2`/`M-3`** — fix `proof:41`, add `PB1`'s three constraints, re-derive `CINV-20`'s
   reachable count, correct case 7's vector to `breadth: "not_applicable"` / expected
   `"not_evaluable"`, and either make the lemma non-vacuous (derive the scope state from `EF3`'s
   branches) or delete the assertion and say the lemma is argued, not tested.
3. **`M-5`** — lift `PB6a`'s steps 4–5 out of `PB6a`'s trigger and make them the default order of any
   result; `PB6a` and `GR3` then refine an order that always exists.
4. **`M-7`** — one sentence in `VB3` distinguishing restriction from enumeration.
5. **`M-4`** — add the `PB1` row to §20.4's relaxation table.
6. **`M-6`**, **`M-8`**, the nine MINORs — mechanical.

`M-6` and `M-8` are the two that need a judgement rather than an edit, and neither is large. Nothing
in this review argues for a seventh restructure; §14.3 is now a function, and the remaining defects
are in its edges rather than in its shape.
