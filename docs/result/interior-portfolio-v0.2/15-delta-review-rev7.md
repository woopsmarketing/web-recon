# 15 — Delta review of Contract V0.2 **rev 7**

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `04`, `05`, `13`, `13b`, `13c` or `14`, and was given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 7, 1809 lines) + `docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs` (rewritten) + `04-demo-data-spec.md` rev 6 |
| checklist | `13-delta-review-rev6.md` (`B-1`; `M-1`…`M-8`; `m-1`…`m-9`; `n-1`…`n-6`) and `13b-fixture-execution-rev6.md` (`X-1`, `X-2`, `X-3`). The author's disposition `14-rev7-disposition.md` was read as a claim, not as evidence. |
| also read | `01-owner-decisions.md` (OD-A…OD-S), `05-review-disposition.md`, `13c-ws9-reaudit.md`, frozen V0 `02-integration-contract-v0-candidate.md`, `data/sites/boost-interior-demo/content/projects.json` |
| method | the proof was run as shipped (`npm run proof:ef6`), then each of `ef2`, `ef3`, `ef4`, `ef5`, `pb1Permits`, `ef6`, `rowsThatHold` was checked line-by-line against §14.3.2/§14.3.3/§14.3.5/§14.3.6, then **re-run with one function replaced by a faithful transcription** to measure the divergence. `EF1`–`EF6`, `PB0`–`PB7`, `GR2`/`GR3`/`GR3a`, `VB3`, `WS6`, `PT5` were then executed by hand against named Korean utterances and the 19 records. Every class, delta and set relation below is an executed result with the arithmetic shown. |

Short names: **`07`** = the contract · **`04`** = the demo-data spec · **`13`**/**`13b`**/**`13c`** = the
round-6 review, hand-execution and re-audit · **`14`** = the rev-7 disposition · **`proof`** =
`docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs`. Paths are under
`/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 3 BLOCKER · 4 MAJOR · 9 MINOR · 5 NOTE.

**The round-6 checklist is largely closed.** `B-1` is closed at the rule level — the `WS8` clause now
sits inside `EF3`'s `partial_remodel` branch (`07:876-878`) and `EF1`'s closure sentence (`07:847`)
holds again. `X-1` is closed by `GR3a`, which I verified **total** over the query space. `X-3` is
closed and I re-derived both relations. All nine `m-` and all six `n-` items are closed. `04` rev 6's
re-authoring is sound: I re-derived the inventory independently and got **16 used / 10 unused**, the
same numbers, for the same reason.

**The three BLOCKERs are all in the same place: rules that were fixed one at a time and now disagree
with a rule nobody re-read.**

1. **`pb1Permits` is not a faithful transcription of `PB1`.** The brief's first job. `PB1`'s partial
   branch says *"permitted when §14.3.3 permits it"*, and §14.3.3 keys its budget column on the
   **row**; the proof keys it on `EF3`'s **criterion state**. Those differ exactly in `WS8`'s
   dropped-id case. Re-running with a faithful transcription: **272** reachable state vectors, not
   the **256** `CINV-20` publishes. This is round 6's `M-1` recurring at smaller magnitude.
2. **`PB6a` step 1 orders `exact` last**, because it sorts by *"`EF6`'s class, in the row order
   `EF6` is written in"* and `exact` is row 8. Rev 7's new `GR3` sentence *"Direct answers are
   offered first"* says the opposite. Both are `C: MUST`; no tie-breaker exists. On `CINV-21`'s
   **own fixture** the two give different top-3.
3. **`VB3`'s new extraction sentence opens the hole it was written to close, on the other axis.**
   A restriction by trade leaves `V.breadth` absent, `PB1`'s `full_remodel` branch then permits the
   comparison, and *"바닥이랑 도배만 3천만원"* makes `bi-11` — a whole-home 20평 villa remodel — an
   **`exact`** budget match, while `bi-19`, the record that actually did those trades, is
   `not_evaluable`. §14.3.3.1's own sentence *"no trade-only request can be budget-matched at all
   today"* (`07:1004-1005`) is false as written, and OD-O is violated.

**What rev 7 broke.** No rule id vanished (I checked all 70). The one regression is that `B-1`'s fix
**narrowed** the `WS8` not-closed clause from every record to `partial_remodel` only, which is a
relaxation for `full_remodel` records and is not in §20.5's list — the **sixth** consecutive
revision whose closing account of its own relaxations is wrong.

**Two fixes relocate rather than close.** `B-1`'s fix moved the scope-state assignment into `EF3`
but left `PB1`'s partial branch reading §14.3.3's budget column, which is still computed on the
non-closed reduced `R_s` (`M7-1`). `M-8`'s fix added the missing classes to two rung rows but the
claim *"Every class `EF6` produces is on a rung"* (`07:1221`) is still false per query: on `GR3a`
row 1 with `Q_s ≠ ∅`, four of the five authored partials come back with a class and no position
(`M7-2`).

---

## A · The proof — are the seven functions faithful?

Run as shipped: `npm run proof:ef6` exits 0.

```
PASS A, derived from EF2..EF5 + PB1:
  conversation x record inputs        : 24192
  distinct criterion-state vectors    : 256  (of 768 possible)
  distinct classes reached            : 11/11
PASS B, raw cross-product superset:
  evaluations incl. row 1's relations : 1344
  distinct classes reached            : 11/11
worked cases from rounds 4-6          : 10
```

Arithmetic of the input space checked: 3 `projectType` × 3 `V.breadth` × 21 scope shapes
(1 empty + 5 relations × 2 `qtSubsetRt` × 2 `dropped`) × 2³ area × 2⁴ budget = **24,192** ✓.
768 = 4⁴ × 3 ✓. Pass B: 4³ × 3 × 4 relations + (768 − 192) = 768 + 576 = **1,344** ✓.

| function | `proof` lines | contract | verdict |
|---|---|---|---|
| `ef2` | 35-39 | `EF2`, `07:852-856` | **faithful.** `breadth === false` ⇒ `not_applicable`; `projectType === null` ⇒ `not_evaluable`; else equality under the stated mapping. The mapping is pre-applied by encoding `V.breadth` as the wire value, which is legitimate because `EF2` states the bijection. |
| `ef3` | 42-48 | `EF3`, `07:857-902` | **faithful.** `q.empty` ⇒ `not_applicable` ✓; `full_remodel` ⇒ `qtSubsetRt ? satisfied : not_evaluable`, never `unsatisfied` ✓ (`07:865-870`); `null` ⇒ `not_evaluable` ✓ (`07:887`); `partial_remodel` ⇒ `dropped` first, then `relation === "scope_exact"` ✓. **The `WS8` dropped-id branch is in the right place and only there** (`07:876-878`), which is `B-1`'s fix. The `full_remodel` branch correctly has no dropped-id clause. |
| `ef4` | 51-55 | `EF4`, `07:903-913` | **faithful.** `PY1`'s confidence signal is correctly *not* modelled as a state (`07:909-913`). |
| `ef5` | 70-74 | `EF5`, `07:914-918` | **faithful.** `!permitted \|\| !hasPrice \|\| !comparable` ⇒ `not_evaluable`; else `delta ≤ 0`. |
| `ef6` | 77-86 | `EF6`, `07:1158-1167` | **faithful**, row for row, including row 1 returning the relation and row 7's `.includes("not_evaluable")` over all four. |
| `rowsThatHold` | 90-101 | — | **not independent** — see `m7-3`. |
| **`pb1Permits`** | **58-67** | **`PB1` `07:1071-1085` + §14.3.3's budget column `07:928-937`** | **NOT FAITHFUL** — see `B7-1`. |

### `B7-1` (BLOCKER) · `pb1Permits` keys the partial branch on `EF3`'s criterion state; `PB1` keys it on §14.3.3's row. They differ in exactly the case `B-1` was about, and `CINV-20`'s published "256" is the output of the divergence

**The rules.** `07:1082-1083`:

> `R.projectType == "partial_remodel"` — permitted when §14.3.3 permits it. This branch is entered
> for **every** `Q`, including `Q = ∅`, which is §14.3.3 **row 1**.

`PB7` (`07:924-926`) says the §14.3.3 rows are evaluated in order and *"the **first** row whose
condition holds decides both the relation **and the budget permission**"*. The budget column is
therefore a function of the **row**, i.e. of `R_s`/`R_t`/`Q_s`/`Q_t`. Nothing in §14.3.3 — including
the *"closure does not survive an unrecognised id"* paragraph at `07:965-977` — refuses the budget
on account of a dropped id; that paragraph assigns only *"no absence may be stated"* and the `EF3`
state.

`proof:65-66`:

```js
  // partial_remodel: 14.3.3 permits the comparison on rows 1 (Q = empty) and 3 (scope_exact) only.
  return scopeState === "not_applicable" || scopeState === "satisfied";
```

`scopeState` comes from `ef3`, which returns `not_evaluable` when `q.dropped`. So the proof
**refuses** where `PB1` + §14.3.3 **permit**.

**Executed.** `CINV-9`'s own fixture: `bi-16` `[kitchen, bathroom]`, 19,800,000, read by a `1.0`
consumer that does not know `bathroom`; visitor *"주방만, 2천"* (`Q_s = {kitchen}`, `Q_t = ∅`,
`V.budget = exact 20,000,000`). Reduced `R_s = {kitchen}`.

| | §14.3.3 row | budget permitted? | `EF5` | `EF6` |
|---|---|---|---|---|
| `PB1` as written | row 3 (`R_s == Q_s`, `Q_t ⊆ R_t`) ⇒ `scope_exact` | **yes** | δ = (19,800,000 − 20,000,000)/20,000,000 = **−0.01** ⇒ **`satisfied`** | row 7 ⇒ `not_evaluable` |
| `pb1Permits` as shipped | not consulted | **no** | ⇒ `not_evaluable` | row 7 ⇒ `not_evaluable` |

The **class** is the same, which is why no assertion fires. The **budget criterion's state** is not,
and `GR2` requires the record to carry the list of stated criteria that came out `not_evaluable` —
so the two readings tell the visitor different things about their budget.

**Measured.** I copied the proof, replaced only `pb1Permits`'s partial branch with
`GQ.empty || GQ.relation === "scope_exact"` (§14.3.3's budget column, keyed on the row, ignoring
`dropped` as §14.3.3 does), and re-ran:

```
shipped  : inputs 24192  vectors 256  classes 11/11
faithful : inputs 24192  vectors 272  classes 11/11
```

Every assertion still passes under the faithful version — totality, `GR2`-membership,
first-match-wins, `exact`-iff-nothing-missed, the `EF3` lemma, all 10 worked cases and the direct
`OD-O` check. **So the central claim survives and I could not break `EF6`.** What does not survive is
`CINV-20`'s published number: `07:1356` states *"**256** of the 768 possible criterion-state vectors
occur"* as a fact a consumer is to reproduce. Under a faithful `PB1` it is **272**. This is the same
shape as round 6's `M-1` (*"464 was the output of a wrong predicate"*), one revision later, at
one sixteenth the magnitude.

I am rating this BLOCKER because the brief fixes that severity for an unfaithful transcription, and
because the unfaithfulness is what hides the contract defect below. The blast radius, measured rather
than asserted, is: **one published number, and nothing else.**

---

## B · New defects

### `B7-2` (BLOCKER) · `PB6a` step 1 sorts `exact` **last**; `GR3`'s new sentence says direct answers come **first**. Two `C: MUST`s, no tie-breaker, different top-3 on `CINV-21`'s own fixture

**The rules.** `07:1195-1196`, new in rev 7 (`M-5`'s fix):

> **Direct answers are offered first**, among themselves in the default order below; the ladder
> orders the labelled references that follow.

`07:1125-1128`:

> Such a result is ordered by, in sequence:
> 1. `EF6`'s class, in the row order `EF6` is written in;

`EF6`'s row order (`07:1158-1167`) is `scope_*`(1) · `fallback_from_full`(2) · `breadth_fallback`(3)
· `unknown_type_fallback`(4) · `price_fallback`(5) · `area_fallback`(6) · `not_evaluable`(7) ·
**`exact`(8)**. Row 8 is the fall-through, so sorting by row order puts the direct answers **last**.

**Executed — `CINV-21`'s own fixture,** *"1억 이내로 전체 리모델링 하고 싶어요"*
(`V.breadth = whole`, `Q = ∅`, `V.area` absent, `V.budget = max 100,000,000`), over all 19:

| records | criteria | `EF6` |
|---|---|---|
| bi-09 50M · bi-10 85M · bi-11 30M · bi-12 52M | breadth `satisfied`; scope/area `not_applicable`; δ = 0 ⇒ budget `satisfied` | row 8 ⇒ **`exact`** |
| bi-13 range 125–140M | δ = (125,000,000 − 100,000,000)/100,000,000 = **+0.25** ⇒ `unsatisfied` | row 5 ⇒ `price_fallback` |
| bi-01, bi-07 | full, no total ⇒ budget `not_evaluable` | row 7 ⇒ `not_evaluable` |
| bi-04, bi-06, bi-14…bi-18 | partial ⇒ breadth `unsatisfied` | row 3 ⇒ `breadth_fallback` |
| bi-02, bi-03, bi-05, bi-08, bi-19 | breadth `not_evaluable` | row 4 ⇒ `unknown_type_fallback` |

`PB6` yields δ = 0 for four records, so **`PB6a` fires** and, by its own words, orders *"such a
result"*. Keys 2 and 3 are flat (no area stated; no scope stated ⇒ count 0 for every record), so
key 1 decides, then `publishedAt` descending.

| rule followed | top 3 at a result limit of 3 |
|---|---|
| `PB6a` step 1 (`07:1127`) — class in `EF6` row order, `breadth_fallback`(3) first | **bi-04** (2026-05-21), **bi-06** (2026-03-19), **bi-14** (2025-07-31) — three *partial* jobs, two of them with **no price at all**, for a whole-home budget question |
| `GR3` (`07:1195`) — direct answers first | **bi-09** (2025-12-11), **bi-10** (2025-11-20), **bi-11** (2025-10-23) |

`CINV-21` (`07:1357`) asserts the second: *"bi-09, bi-10, bi-11, bi-12 all `delta = 0`, all `exact`
… result limit 3. The order is decided by `publishedAt` then `id`."* Its own test therefore fails
against the rule it shares a section with.

`07:1233` (*"Within a rung, `PB6a`'s sequence orders"*) is a **use** of `PB6a` inside `GR3`; it does
not amend `PB6a`'s own scope sentence, and no rule says which of the two governs. `PB6`'s stated
purpose (`07:1112`) is *"so that two consumers cannot disagree on one document"*.

This is the shape `14` §4a names as the contract's recurring failure mode — *"two readings, no
tie-breaker"* — and rev 7 created the collision by adding one of the two sentences without
re-reading the other. Rev 6 had the same `PB6a` text but no *"direct answers first"* rule, so the
order was merely bad rather than contradictory; round 6's `M-5` asked for the fix and `13b` §1.2 had
already flagged that step 1 can only be read *"as a general preference order among the seven
**non-`exact`** classes"*.

---

### `B7-3` (BLOCKER) · `VB3`'s new extraction rule makes `V.breadth` determinately **absent** for a trade restriction, and `PB1`'s `full_remodel` branch then budget-matches a whole-home total against a two-trade budget. OD-O violated; §14.3.3.1's own limitation sentence is false

**The rules.** `VB3`, new in rev 7 (`M-7`'s fix), `07:823-831`:

> A **restriction by space** sets `V.breadth = partial` … A **restriction by trade** does **not**:
> 바닥이랑 도배**만** restricts the *work*, not the *extent*, and `bi-19` ran exactly those trades
> across every room.

`PB1`, `07:1073-1078`:

> `R.projectType == "full_remodel"` — permitted when **all** of: `V.breadth` is `whole` or absent;
> `EF4` is `satisfied` or `not_applicable`; and the visitor did not **frame** the work as partial …
> but when `V.breadth` is absent **and** `Q_s ≠ ∅`, the comparison is permitted **only** with
> `PB0a`'s coverage statement

§14.3.3.1, `07:1004-1005`:

> So the first row above fires for no record in the current 19, and no trade-only request can be
> **budget-matched** at all today.

**Executed (i) — *"바닥이랑 도배만 3천만원 정도로 생각하고 있어요"*.** `V.breadth` **absent** (by
`VB3`), `Q_s = ∅`, `Q_t = {flooring, wallpaper}`, `V.budget = exact 30,000,000`, `V.area` absent.
`Q_s = ∅`, so `PB1`'s `PB0a` proviso does not even bind.

| record | `R_t` | `EF3` | permitted? | δ | `EF6` |
|---|---|---|---|---|---|
| **bi-11** (full, 20평 villa, **30,000,000**) | `{flooring, wallpaper, doors}` ⊇ `Q_t` | **`satisfied`** | yes | (30,000,000 − 30,000,000)/30,000,000 = **0** ⇒ `satisfied` | row 8 ⇒ **`exact`** |
| bi-09 (full, 50,000,000) | `{flooring, wallpaper, lighting, built_in_furniture}` ⊇ `Q_t` | `satisfied` | yes | +0.667 ⇒ `unsatisfied` | row 5 ⇒ `price_fallback` |
| bi-10, bi-12, bi-13 (full) | `Q_t ⊄ R_t` | `not_evaluable` | yes | — | row 7 ⇒ `not_evaluable` |
| bi-14, bi-15, bi-16, bi-18 (partial) | `R_t ∩ Q_t = ∅` | `unsatisfied` | no | — | row 1 ⇒ `scope_disjoint` |
| bi-17 (partial) | `R_t = {flooring}`, `Q_t ⊄ R_t`, `∩ ≠ ∅` | `unsatisfied` | no | — | row 1 ⇒ `scope_overlap` |
| **bi-19** (absent, `R_t = {flooring, wallpaper, lighting}` ⊇ `Q_t`, **11,000,000**) | — | `not_evaluable` (absent branch) | **never** (`PB1` third bullet) | — | row 7 ⇒ `not_evaluable` |

The single **direct answer** is `bi-11`: a full 20평 villa remodel (주방 싱크대 교체, 욕실 전면
방수·타일·도기, 문·문틀 필름, 바닥, 도배) whose 30,000,000 is reported as an **exact** match for a
flooring-and-wallpaper budget. `bi-19` — the one record in the corpus that actually did
바닥·도배·조명 and nothing else — is `not_evaluable` and, per `07:1010`, *"not told it is a budget
match"*.

So the contract withholds the honest answer and volunteers the misleading one, and `07:1004-1005`'s
*"no trade-only request can be budget-matched at all today"* is **false**: it is true for
`partial_remodel` and breadth-absent records, which is the only population §14.3.3.1 analysed.

**Executed (ii) — *"욕실 타일만 바꾸려는데 예산 100만원이에요"*.** `VB3` again: 만 is attached to a
**trade**, so `V.breadth` is absent (and `07:827-828` says so explicitly — *"with or without 만
attached to a trade"*). `Q_s = {bathroom}`, `Q_t = {tiling}`. Against `bi-09` (full, 50,000,000):
`EF3` `not_evaluable` (`tiling ∉ R_t`), `EF4` `not_applicable`, `PB1` **permits**, δ =
(50,000,000 − 1,000,000)/1,000,000 = **+49** ⇒ `unsatisfied`, `EF6` row 5 ⇒ `price_fallback` —
*"예산을 초과합니다"* about a whole-dwelling total against a bathroom-tile budget.

**OD-O**: *"A customer's total budget and a portfolio total price are directly comparable **when the
project semantics match**."* They do not match in either case and the comparison is made. §14.3.3.1
row 2 refuses exactly this hazard for a **partial** that bought one extra space (*"`R_s` spaces were
remodelled too, and the total paid for that"*, `07:986`) while `PB1` permits it for a **full** that
bought the entire dwelling — the larger error is the permitted one.

`PB0a` mitigates case (ii) (coverage statement required) and, in practice, case (i) too — but only
via its *"spans more than one `category`"* trigger, which is a property of the result set, not a
guarantee. The class stays `exact` and `EF5` stays `satisfied` either way.

This is `M-7` closed on the 욕실**만** axis and opened on the 바닥·도배**만** axis by the same
sentence. `14` §5 lists `M-7` under *"tighten"*.

---

### `M7-1` (MAJOR) · `B-1`'s fix moved the scope state into `EF3` but left the **budget** permission reading the non-closed set — the same defect, relocated

`07:965-977` is now careful and correct about the state:

> a record from which the consumer dropped any unrecognised `workScopeId` is **not closed** … No
> absence may be stated for such a record, and `EF3`'s `partial_remodel` branch returns
> `not_evaluable` for it — `EF3` assigns the state, this rule supplies the reason

It says nothing about the **budget column**, and `PB7` (`07:924-926`) makes that column a function of
the row. `PB1`'s partial branch (`07:1082`) reads it directly. So for `CINV-9`'s own fixture the
comparison `§14.3.3` **refuses** when `bathroom` is recognised (row 5, `R_s = {kitchen, bathroom} ⊋
Q_s`, *"the total bought extra spaces"*) is **permitted** when it is dropped (row 3 on the reduced
`R_s = {kitchen}`), and `EF5` returns `satisfied` at δ = −0.01.

Dropping an id therefore still converts an *unknown* into a *permission* — `Q-7`'s own sentence, one
axis over. The contract's own proof disagrees with the contract here (`B7-1`), which is why nothing
caught it.

The minimal repair mirrors `B-1`'s: one clause in `PB1`'s partial branch, *"…and the consumer dropped
no unrecognised id from this record (§14.3.3)"*, after which `pb1Permits` as shipped becomes correct.

---

### `M7-2` (MAJOR) · `M-8` is not closed: *"Every class `EF6` produces is on a rung"* (`07:1221`) is false per query. On `GR3a` row 1 with `Q_s ≠ ∅`, four of the five authored partials have a class and no position

`GR3a` (`07:1199-1210`) selects **one** ladder row, first match wins. I verified it is **total** over
the query space: row 5 fires exactly when `V.breadth` is absent, `Q = ∅` and `V.budget` is absent, and
nothing else escapes rows 1–4. `X-1` is closed.

But the rungs (`07:1214-1219`) were extended row by row, without re-checking which classes each row
can now receive.

**Executed — `CINV-13`(b)'s own fixture, *"주방 포함 34평 전체 리모델링, 예산 5천"*.**
`V.breadth = whole` ⇒ `GR3a` **row 1** ⇒ the whole-home ladder, whose rungs are
*"`full_remodel` records → **`breadth_fallback` partials, larger `R_s` first** → breadth-absent
records"*. `Q_s = {kitchen}`, `Q_t = ∅`.

| partial | `R_s` | §14.3.3 | `EF3` | `EF6` | on a rung? |
|---|---|---|---|---|---|
| bi-14 | `{kitchen}` | row 3 ⇒ `scope_exact` | `satisfied` | row 3 ⇒ `breadth_fallback` | **yes** |
| bi-16 | `{kitchen, bathroom}` | row 5 ⇒ `scope_superset` | `unsatisfied` | row 1 ⇒ `scope_superset` | **no** |
| bi-15 | `{bathroom}` | row 8 ⇒ `scope_disjoint` | `unsatisfied` | row 1 ⇒ `scope_disjoint` | **no** |
| bi-17 | `{living_room}` | row 8 ⇒ `scope_disjoint` | `unsatisfied` | row 1 ⇒ `scope_disjoint` | **no** |
| bi-18 | `{entrance}` | row 8 ⇒ `scope_disjoint` | `unsatisfied` | row 1 ⇒ `scope_disjoint` | **no** |

`EF6` row 1 **precedes** row 3, so a partial whose spaces do not match exactly never reaches
`breadth_fallback` — which is the only partial class the whole-home rung names. Four of the five
authored partials are returned (`CINV-22`: `GR3` is not a filter) with an `EF6` class and **no
position**.

A second instance on `GR3a` row 2: the rung *"breadth-absent records whose `R_s ⊇ Q_s`"* excludes
breadth-absent records with `R_s ⊉ Q_s`. Executed *"주방만 하고 싶어요"*: `bi-19` (`R_s = ∅`) is
`unknown_type_fallback` and on no rung.

A third, which `PT5`'s own new sentence walks into: `07:1202-1203` says such a job's total is
*"reachable and statable (`GR1`, `GR3`'s trade rung)"*. For the natural query *"거실 바닥만 얼마예요"*
(`Q_s = {living_room}`) `GR3a` selects **row 2**, not the trade rung, and the record's `R_s = ∅` puts
it on no rung of row 2 either.

The *"every result has an order"* floor (`07:1225-1231`) does not repair this: it fixes the **last
two keys**, not the relation between an off-rung record and an on-rung one, so two conforming
consumers still order the result differently — which is `M-5`'s own complaint, surviving in the
records `M-8`'s fix did not reach.

---

### `M7-3` (MAJOR) · `WS6`'s *"resolve conservatively"* is not well-defined: its discriminator is a **per-record** verdict while `Q` is a **per-query** object, and when both readings permit (or neither does) the rule returns nothing

`07:343-351`:

> the consumer takes the reading that does **not** permit a price comparison, and says which reading
> it took.

`V.scope` is *"a set `Q` of §7.3 ids"* extracted once from the conversation (`07:806`). Whether a
reading permits a price comparison is computed per record (`PB1` + §14.3.3). The rule therefore asks
one query-level object to be decided by a record-level verdict, and the verdict is not constant
across records.

**Executed (i) — the discriminator is silent.** 수납 → `storage` (a Space) or `built_in_furniture`
(a Work) is `WS6`'s own named ambiguity. Utterance *"수납 공사한 사례 있나요"* against **`bi-11`**
(`full_remodel`, `[kitchen, bathroom, flooring, wallpaper, doors]`):

| reading | `Q` | `EF3` | `PB1` | `EF6` | what the visitor is told |
|---|---|---|---|---|---|
| A · `storage` | `Q_s = {storage}`, `Q_t = ∅` | spaces half `satisfied` by `PT4`(b); trades half vacuous ⇒ **`satisfied`** | full branch — **permits** (identical) | row 8 ⇒ **`exact`** | a direct answer |
| B · `built_in_furniture` | `Q_s = ∅`, `Q_t = {built_in_furniture}` | `built_in_furniture ∉ R_t` ⇒ **`not_evaluable`** | full branch — **permits** (identical) | row 7 ⇒ **`not_evaluable`** | *"확인할 수 없습니다"* |

`PB1`'s `full_remodel` branch does not read `Q` at all, so **both readings permit equally**. *"The
reading that does not permit a price comparison"* does not exist, the classes are opposite, and
`WS6` says nothing. The same holds whenever neither reading permits (both refused).

**Executed (ii) — where the rule does bite, it promotes the wrong records.** `X-2`'s own utterance
*"현관이랑 복도 수납"*. Reading B (복도 = `hallway`) is the one that refuses, so `WS6` selects it:

| record | reading A | reading B (`WS6`'s choice) |
|---|---|---|
| **bi-18** (partial, `R_s = {entrance}`, `R_t = {built_in_furniture}`, 6,200,000 — the one on-point record) | row 3 ⇒ `scope_exact` ⇒ **`exact`**, direct answer | row 6 ⇒ `scope_subset` ⇒ **`scope_subset`**, a labelled reference |
| bi-10 (full, 85,000,000, `built_in_furniture ∈ R_t`) | **`exact`** | **`exact`** — unchanged, `Q_s`-blind by `PT4`(b) |
| bi-12 (full, 52,000,000, `built_in_furniture ∈ R_t`) | **`exact`** | **`exact`** — unchanged |

`WS6`'s conservative choice demotes the 6,200,000 entrance-storage job to a labelled reference and
leaves an 85,000,000 and a 52,000,000 whole-home remodel as the two direct answers for an
entrance-storage question. The budget verdict is indeed conservative; the **result** is worse.

The rule is a genuine improvement over rev 6's silence. It is not yet a function.

---

### `M7-4` (MAJOR) · §20.5's *"What rev 7 relaxes: nothing"* is wrong — the sixth consecutive revision. `B-1`'s fix narrowed the `WS8` not-closed clause from every record to `partial_remodel` only

`07:1805`: *"**What rev 7 relaxes: nothing.** `B-1` … tighten … Checked row by row against the two
tables above rather than asserted."*

Rev 6's clause, as quoted by `13:127-128` from `07:370` and `07:923-924`, was unqualified:

> a record from which the consumer dropped any unrecognised `workScopeId` is **not closed**. For such
> a record **the scope criterion is `not_evaluable`** …

Rev 7 confines it to one branch (`07:876-878`, `07:969-971`): *"`EF3`'s `partial_remodel` branch
returns `not_evaluable` for it"*.

**Executed.** `WS8`'s designed-for case is a `1.0` consumer reading a `1.1` document (`07:393-394`);
adding an id is a minor bump (`07:318`), and the added id may be a **Space**. Take `bi-09`
(`full_remodel`) carrying one such id, against *"34평 전체 리모델링, 예산 5천"*:

| | scope criterion | `EF6` | what the visitor is told |
|---|---|---|---|
| rev 6 | `not_evaluable` (clause applies to every record) | row 7 ⇒ `not_evaluable` | *"확인할 수 없습니다"* |
| rev 7 | `satisfied` (`full_remodel` branch, `Q_t = ∅ ⊆ R_t`) | row 8 ⇒ **`exact`** | a direct answer |

The disposition (`14` §2) argues the **safety** of this — the spaces half rests on `PT4`(b), not on
the id list, and a dropped **trade** id can only turn `Q_t ⊆ R_t` false. I checked that argument and
it holds. But safety is not sameness: a record moves from `not_evaluable` to `exact`, which is a
customer-facing change in the permissive direction, and §20.5 does not list it.

`13`'s `M-4` counted rev 6 as the fifth. This makes six.

*Two other rev-7 changes are correctly **not** relaxations, and I checked them rather than accepting
the row.* (a) `m-2`'s `CINV-16` alignment: §12 (`07:691-693`) treats an unrecognised `basis` as an
unknown value, so a `"unknown"` string on the wire collapses to *basis absent* and `PB3a`'s
*"present and equal"* refuses anyway — the permission sets coincide, as §20.5 claims. (b) `X-1`'s
`GR3a`: it selects among rungs and, per `CINV-22`, changes no class and no permission.

---

## C · Is each round-6 / `13b` finding closed?

| id | sev | verdict | rev-7 text, with the executed check |
|---|---|---|---|
| **`B-1`** | BLOCKER | **CLOSED at the rule level; residue at `M7-1`** | `07:876-878`: *"**`partial_remodel`** — `not_evaluable` when the consumer **dropped any unrecognised `workScopeId`** from this record (`WS8`) … Otherwise **§14.3.3's relation**"*. `WS8` (`07:391-393`) and §14.3.3 (`07:969-971`) now both cite `EF3` rather than assign. `EF1`'s closure sentence (`07:847`) holds: I enumerated every rule that names a criterion state and found none outside `EF2`–`EF5` that assigns one. Executed on `CINV-9`'s fixture: scope `not_evaluable`, `EF6` row 7, never `scope_exact`. The budget half is `M7-1`. |
| **`M-1`** | MAJOR | **NOT CLOSED** — the hand-written `reachable()` is gone, but the derived set rests on an unfaithful `pb1Permits`: `B7-1`. |
| **`M-2`**(a) lemma | MAJOR | **CLOSED, and I verified it is non-vacuous.** `proof:114-116` asserts `projectType === "partial_remodel"` whenever `v.scope === "unsatisfied"`, and in pass A that state is **produced by `ef3`** (`proof:47`) rather than filtered in. Probe: in a copy I made `ef3`'s **absent** branch return `unsatisfied` instead of `not_evaluable`; the lemma check fires (*"EF3 lemma violated — row 1 fired for projectType=null"*). Round 6's tautology is genuinely gone. |
| **`M-2`**(b) single-valuedness | MAJOR | **CLOSED in form, thin in substance** — `m7-3`. |
| **`M-3`** | MAJOR | **CLOSED.** `proof:213-217`: worked case 7 now sets `breadth: false` and expects `not_evaluable`; derived states `not_applicable / not_evaluable / not_applicable / not_applicable` ⇒ row 7. `VB3` (`07:825-827`) states why. |
| **`M-4`** | MAJOR | **CLOSED.** §20.4's table (`07:1761-1768`) now leads with *"**`PB1` lost its refusal on named spaces** (the `Q-4` fix) — **a relaxation — and the one rev-6 change that alters what a customer is told**"*, and corrects the `PB3a` row. The rev-7 table has its own omission (`M7-4`). |
| **`M-5`** | MAJOR | **CLOSED as text, and it created `B7-2`.** `07:1225-1231` fixes the last two keys and names the seven-`exact` case. It collides with `PB6a` step 1. |
| **`M-6`** | MAJOR | **CLOSED.** `PT5` (`07:197-206`) carries the sentence where an author reads it, with the cost and the §17 deferral named. `INV-30` (`07:1331`) stands. Checked against `WS9` (`07:399-402`) and `INV-30`: 거실 바닥만 교체 now has exactly one authoring (`[flooring]`, breadth-absent) that satisfies all three. |
| **`M-7`** | MAJOR | **PARTIALLY CLOSED — the space axis only.** `VB3` (`07:823-831`) closes *"욕실만 700만원"*: `V.breadth = partial` ⇒ `EF2` `unsatisfied` ⇒ `PB1`'s preamble refuses ⇒ `fallback_from_full`. Executed and confirmed. The trade axis is `B7-3`. |
| **`M-8`** | MAJOR | **NOT CLOSED** — `M7-2`. `breadth_fallback` is now on the whole-home rung and `scope_superset`/`scope_subset` on the spaces-named rung, but the claim at `07:1221` is false for `GR3a` row 1 with `Q_s ≠ ∅`. |
| **`X-1`** | MAJOR | **CLOSED.** `GR3a` (`07:1199-1210`) is a five-row first-match table and I verified it **total**: rows 1–4 cover every query with a breadth, a space, a trade, or a lone budget; row 5 is reached exactly when `V.breadth` absent ∧ `Q = ∅` ∧ `V.budget` absent. *"창호 교체하려는데 34평 전체 리모델링"* now selects row 1 only. Label mismatch on row 2 at `m7-4`. |
| **`X-2`** | MAJOR | **CLOSED as a rule, under-determined as a function** — `M7-3`. |
| **`X-3`** | MINOR | **CLOSED.** `CINV-15` (`07:1351`) rebuilt, and I re-derived all three: (a) *"바닥만"* vs `bi-17` — `Q_t = {flooring} ⊆ R_t = {flooring}` ∧ `R_s = {living_room} ≠ ∅` ⇒ §14.3.3.1 row 2 ⇒ `scope_superset`, refused ✓; (b) *"바닥이랑 도배만"* vs `bi-16` — `R_t = ∅`, `R_t ∩ Q_t = ∅` ⇒ row 4 ⇒ `scope_disjoint` ✓; (c) `bi-19` on the trade rung ✓. |
| `m-1` | MINOR | **CLOSED.** `CINV-18` (`07:1354`): *"on the record the statement is about"*. |
| `m-2` | MINOR | **CLOSED.** `CINV-16` (`07:1352`): *"on the same, present area basis"* — conjunct gone, matches `PB3a` (`07:1091-1094`). |
| `m-3` | MINOR | **CLOSED.** `04:539` now reads *"§14.3.3 rows 3/4's `Q_t` conjunct"*; `04:493` (row 3, `scope_exact`) and `04:685` (row 5) re-derived and correct. |
| `m-4` | MINOR | **CLOSED.** `04:677`: *"Restated against contract rev 7's evaluation function"*. |
| `m-5` | MINOR | **CLOSED.** No *"contract rev 3"* string remains in `04`. Successor staleness at `m7-9`. |
| `m-6` | MINOR | **CLOSED.** `07:1330-1331` `INV-29` then `INV-30`; `07:1358-1360` `CINV-22`, `23`, `24`. |
| `m-7` | MINOR | **CLOSED.** `07:1750`: *"rev 5's rows 4–7; rev 6's **5–8**"*. |
| `m-8` | MINOR | **CLOSED.** `CINV-20` (`07:1356`) no longer claims an `EF2`/`EF3` reachability predicate; pass B is described as a raw superset, which matches `proof:157-175`. |
| `m-9` | MINOR | **CLOSED.** `07:1741` now says §19 needed no change and names the practice it violates. |
| `n-1` | NOTE | **CLOSED.** `CINV-24` (`07:1360`) fixtures `breadth_fallback` by name; I executed (a) *"전체 리모델링 사례 보여주세요"* ⇒ `bi-15` `breadth_fallback` ✓ and (c) ⇒ `bi-09` `fallback_from_full`, `bi-14` `exact` ✓ (ordering caveat at `m7-5`). |
| `n-2` | NOTE | **CLOSED.** `13c` + `04` rev 6; re-derived in §E below. §19 gains `07:1470-1477`. |
| `n-3` | NOTE | **CLOSED.** `WS9` (`07:404-407`): *"except where §7.3's gloss for a space names the joinery itself, which is the more specific rule and wins"*. |
| `n-4` | NOTE | **CLOSED as recorded**, not decided — `07:1445-1451`. Correct handling: it is an owner judgement. |
| `n-5` | NOTE | **CLOSED.** `package.json:108` `"proof:ef6"`; it runs and exits 0. Stale output file at `m7-1`. |
| `n-6` | NOTE | **CLOSED.** `05:476-517` is now one list of seven, with `INV-30` as item 6 and marked **Not done**. |

---

## D · §20.5 and the corrected §20.4 relaxation account, checked hostilely

I took the claim *"rev 7 relaxes nothing"* as a hypothesis to falsify and walked every rev-6 → rev-7
change I could identify, in both directions.

| change | §20.5 says | I find |
|---|---|---|
| `B-1` — `WS8` clause moved into `EF3`'s partial branch | tightens | **relaxes for `full_remodel`** — `M7-4`. The scope criterion goes `not_evaluable` → `satisfied`, and the class `not_evaluable` → `exact`, for a record with a dropped **Space** id. |
| `M-6` — `PT5`'s breadth-absent sentence | tightens | **agreed.** It removes an authoring, adds none. |
| `M-7` — `VB3`'s extraction sentence | tightens | **half.** Tightens the space axis (*"욕실만"* now refuses), **relaxes the trade axis** — `B7-3`. Before it, a consumer could read *"바닥이랑 도배만"* as partial and refuse; now it must read it as breadth-absent and `PB1` permits. |
| `M-8` — rungs extended | tightens | **neither.** Ordering only; `CINV-22` makes it class-neutral. Agreed it is not a relaxation. |
| `X-2` — `WS6` conservative resolution | tightens | **agreed on the budget verdict**, with the side effect at `M7-3`(ii). |
| `M-1`/`M-2`/`M-3`/`n-5` — proof only | no contract change | **agreed** — and the proof now differs from the contract (`B7-1`). |
| `M-5`/`X-1` — ordering guarantees | add | **agreed as additions**, but `M-5`'s sentence creates `B7-2`, and `GR3`'s preamble silently changed from *"When no record is a direct answer, the ladder is what the visitor sees"* (rev 6, quoted `13:299`) to *"Direct answers are offered first … the ladder orders the labelled references that follow"* — the ladder now **always** applies. That is a behaviour change, not listed. |
| `X-3` — `CINV-15` rebuilt | corrects a fixture | **agreed.** |
| `m-2` — `CINV-16` conjunct dropped | alignment, not relaxation | **agreed, and checked**: §12 (`07:691-693`) makes an unrecognised `basis` an unknown value, so the wire cannot carry `"unknown"` and `PB3a`'s *"present and equal"* refuses it under either wording. |

§20.4's corrected rev-5 → rev-6 account I also re-checked against `13`'s `M-4`: the `PB1` row is
present, worded as a relaxation, and the `PB3a` row now states the `CINV-16` consequence. That
correction is sound. The rev-7 table repeats the failure it corrects.

---

## E · Cross-document — `04` rev 6 against contract rev 7

**The four re-authored records, re-derived from `13c`'s quoted bodies rather than accepted.**

| record | rev-5 ids | rev-6 ids (`04:56-60`) | my derivation |
|---|---|---|---|
| bi-09 | +`living_room`, +`bedroom`, no `built_in_furniture` | `entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture` | **agree.** 거실 appears nowhere in the body; its only coverage is *"바닥, 벽, 문, 조명은 집 전체에서"* — `WS9`(b). 안방's only work is *"붙박이장을 두었습니다"* — `WS9`(c), and `bedroom`'s gloss does not name joinery, so the `entrance` exception does not transfer. `entrance` stays: *"천장까지 닿는 신발장"* is named by §7.3's `entrance` gloss verbatim. `built_in_furniture` correctly added. |
| bi-11 | +`living_room`, +`bedroom` | `kitchen, bathroom, flooring, wallpaper, doors` | **agree, and this is the strongest case in the corpus.** *"침실에는 붙박이장 대신 기존 옷장을 쓰기로 해"* affirmatively states that no joinery, fixture or layout change reached the bedroom. No `built_in_furniture` added — correct, none occurred. |
| bi-12 | +`living_room`, +`bedroom`, +`dining` | `entrance, kitchen, bathroom, flooring, lighting, built_in_furniture` | **agree on all three strips.** `dining`'s sole justification — *"식탁 위에는 라탄 펜던트를 달아"* — is `WS9`(b)'s own literal example (*"a new ceiling light"*). `entrance` is the weakest survivor (generic 붙박이 수납 rather than 신발장); `13c:97` flags it as lower-confidence and I agree with both the call and the flag. |
| bi-13 | +`pantry`, +`bedroom` | `entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom, windows, lighting, built_in_furniture` | **agree.** 팬트리 수납장 is a cabinet inside the kitchen and §7.3's `pantry` gloss requires *"a separate food-store room"*. 안방 itself is never described as changing — only *"안방 **옆 방**"* and *"안방 **욕실**"*. `entrance` and `kids_room` have no body sentence either way and are left flagged, which is the right conservative call. |

**Inventory, recomputed from scratch** over the eleven id lists at `04:56-66`:
`entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture, living_room,
bedroom, dressing_room, windows, expansion, doors, dining, kids_room, study` = **16**.
Unused: `pantry, storage, hallway, balcony, utility, tiling, painting, plumbing, electrical,
demolition` = **10**. 16 + 10 = 26 ✓ (§7.3: 14 Spaces + 12 Works). `pantry` is the only id that moved,
and `bi-13` was its only carrier ✓. `bedroom`, `living_room` and `dining` survive on `bi-10`/`bi-13`
so `WS2`'s closure still needs them ✓. **`04`'s stated counts are correct.**

**`INV-28` / `INV-29` / `INV-30` over all 19 — the claim is overstated (`m7-7`).**

| invariant | verified | unverifiable |
|---|---|---|
| `INV-28` partial ⇒ `workScopeIds` non-empty | bi-14 `[kitchen]`, bi-15 `[bathroom]`, bi-16, bi-17, bi-18 ✓ | **bi-04, bi-06** — no `workScopeIds` authored |
| `INV-29` full ⇒ ≥1 Spaces id | bi-09 `{entrance,kitchen,bathroom}`, bi-10 (6), bi-11 `{kitchen,bathroom}`, bi-12 `{entrance,kitchen,bathroom}`, bi-13 (8) ✓; **bi-19 is the negative fixture** ✓ | **bi-01, bi-07** |
| `INV-30` partial ⇒ ≥1 Spaces id | bi-14, bi-15, bi-16, bi-17, bi-18 ✓ | **bi-04, bi-06** |

`14` §4 and `07:1793` both say the three were *"re-verified on all 19"*. Four of the 19 carry a
`projectType` per §13 and no `workScopeIds`, so as data they currently **violate** `WS7c`; `04:44`
and `07:1443-1444` both say so. The re-verification covered 15. `13c` is honest about this in its own
scope note; the two summaries are not.

**`04` §4.1's expected answers** re-derived: *"주방만 하면 얼마예요"* ⇒ bi-14 `exact`, bi-16
`scope_superset` (row 5, `{kitchen,bathroom} ⊋ {kitchen}`) ✓; *"바닥이랑 거실만"* ⇒ bi-17 row 3
`scope_exact` ✓; *"현관 수납"* ⇒ the alias assumption is now stated and both outcomes named ✓.
`04:689`'s *"32평인데 도배랑 바닥만"* row is correct **for `bi-19`** and is the row `B7-3` shows is
incomplete: it does not mention that `bi-11` and `bi-09` are budget-comparable on the same query.

**`RD1` re-verified on all four derived values** (integer path):
50,000,000/34 ⇒ `floor(10,000,003,400 / 6,800)` = **1,470,588** ✓ ·
85,000,000/34 ⇒ `floor(17,000,003,400 / 6,800)` = **2,500,000** ✓ ·
30,000,000/20 ⇒ `floor(6,000,002,000 / 4,000)` = **1,500,000** ✓ ·
52,000,000/26 ⇒ `floor(10,400,002,600 / 5,200)` = **2,000,000** ✓.
§9.3's worked example (52,000,000/34 ⇒ 1,529,412) ✓. `GR5a`'s two recorded cross-record collisions
re-checked: 50,000,000 ÷ 20 = 2,500,000 = `bi-10`'s `perArea` ✓; 52,000,000 ÷ 20 = 2,600,000 =
`bi-05`'s authored `perArea` ✓ (confirmed against `projects.json`).

**Owner decisions.** Re-checked each against rev 7: OD-A (`RO1`), OD-B (`GC1`), OD-C (§1.1), OD-D
(`LO1`), OD-E, OD-F (`PT1`), OD-G (`WS3`), OD-H (`ST3`), OD-I (§9.1's `kind`), OD-J (`ND2`/`D-1`),
OD-K (`D-1a`, `INV-19` — verified against all six non-full priced records), OD-L (`PY1`), OD-M
(`TI1`), OD-N (`PB4`), OD-P (`GR3`/`GR2` — see `M7-2`), OD-Q (`04`, 19 records), OD-R (§17), OD-S
(§16). **OD-O is violated** under `B7-3`.

**Frozen V0.** `PB0` remains the single declared amendment to `PR4`, correctly gated on §16's
consumer confirmation (`07:1070`, `07:1380`, `07:1591`). `INV-30` is an addition. No other V0 rule is
amended, and I found no place where a V0 rule is amended by implication.

---

## F · Did rev 7 break anything rev 6 had right?

**Rule-id survival: complete.** I grepped all 71 ids (`PT1`–`PT6`, `PY1`, `WS1`–`WS9` incl.
`WS7a`/`b`/`c`, `ST1`–`ST7`, `SD1`/`SD2`, `TP1`–`TP3`, `PA1`–`PA5`, `ND1`/`ND2`, `RD1`, `VA1`,
`GC1`, `LO1`, `VB1`–`VB3`, `TI1`, `PB0`–`PB7` + `PB0a`/`PB3a`/`PB6a`, `EF1`–`EF6`, `GR1`–`GR5` +
`GR3a`/`GR5a`, `RO1`/`RO2`), plus `D-1`/`D-1a`/`D-1b`/`D-1c` (`07:553`, `594`, `598`, `599`); none
is missing. `INV-17`…`INV-30` and `CINV-1`…`CINV-24` are all present, in order, and `07:1606`'s count
row matches.

**Spot-checked unchanged and still consistent**: `PB6`'s 3 × 2 table including `max` × `range` and
shared-endpoint overlap, the tier bands, `delta_area = (r − v)/v`, `PB2`–`PB5`, `GR1`/`GR4`/`GR5`/
`GR5a`, `ST3`/`ST5`/`ST7`, §3's `"1.0"` reasoning, §11, §12, §16, §17, `WS9`'s two row citations
(rows 6 and 3, re-derived against §14.3.3 — both correct).

**The regressions are two, both created by rev-7 additions**: `M7-4` (the `WS8` clause narrowed) and
`B7-2` (`GR3`'s new *"direct answers first"* colliding with `PB6a`). `B7-3` is a rev-7 addition
determining a reading that rev 6 left open in the safe direction.

---

## G · MINOR

| id | defect | where |
|---|---|---|
| `m7-1` | **`proof/ef6-totality.txt` is stale.** `CINV-20` (`07:1356`) says *"output in `proof/ef6-totality.txt`"*; the file still holds rev 6's run — *"contract **rev 6**"*, *"of which reachable … : **464**"*, *"worked cases from rounds 4-5 : **9**"* — i.e. the exact output `13`'s `M-1` refuted. A reader following the contract's own pointer lands on the refuted number. |
| `m7-2` | **"the default order" is never defined.** Used twice — `07:1195` (*"among themselves in the default order below"*) and `07:1210` (*"the default order below is the whole order"*). The only ordering text below is `07:1233` (*"Within a rung, `PB6a`'s sequence orders"*), which by its own words does not apply to direct answers, and the `07:1225-1231` floor, which fixes only the last two keys. This is the same undefined-term failure as rev 5's *"direct answer"* (`Q-5`). |
| `m7-3` | **`rowsThatHold` is not "an independent statement of each row's condition."** `proof:90-101` repeats `ef6`'s eight predicates **verbatim, in the same order**, then takes `Math.min`; since the rows are pushed in ascending order, `Math.min(...hold)` is by construction the first predicate that holds. Probed both ways in copies: swapping `ef6`'s rows 2 and 3 **is** caught (39 failures), but mis-transcribing row 6's condition **identically in both copies** produces **no** first-match-wins failure at all — it is caught only by the neighbouring `exact`-iff assertion and the worked cases. So the check tests that `ef6`'s early-return order matches the row numbering; it cannot test a transcription of §14.3.6 that both copies share, which is what `07:1356`'s *"checked against an independent statement of each row's condition"* claims. `M-2`(b) is closed in form, not in substance. |
| `m7-4` | `GR3a` row 2's condition is `V.breadth == partial` **or** `Q_s ≠ ∅` (`07:1207`), so it selects the rung labelled *"partial work, **spaces named**"* for *"부분만 하고 싶어요"*, which names no space. The condition and the rung's own name disagree. |
| `m7-5` | `CINV-24`(c) (`07:1360`) — *"classes `bi-09` `fallback_from_full` and `bi-14` `exact`, **in that order**"* — reads as a display-order assertion that `GR3`'s *"Direct answers are offered first"* (`07:1195`) reverses: `bi-14` is the direct answer. Probably meant as *"respectively"*; as written it is a third statement about ordering that disagrees with the other two. |
| `m7-6` | `PT6` (`07:208-210`) enumerates three grounds for omitting `projectType` — *"something other than a remodel … no statement of breadth at all … statements contradict"* — and `PT5`'s new case (a bounded set of spaces, all work being trades) matches none of them. Only `PT6`'s operative opening (*"in every other case"*) saves it; the gloss list is no longer exhaustive. |
| `m7-7` | `14` §4 and `07:1793` state that `INV-28`/`INV-29`/`INV-30` were *"re-verified on all 19"*. Four records (`bi-01`, `bi-04`, `bi-06`, `bi-07`) carry a `projectType` and no `workScopeIds`, so the three are unverifiable there — as `07:1443-1444` itself says. 15 of 19. |
| `m7-8` | `proof:196-200`, worked case *"Q-3: '창호 … 34평 전체, 예산 5천' vs bi-09"*, sets `relation: "scope_exact"` on a query whose `Q_s = ∅` and `Q_t = {windows}` — a shape §14.3.3 routes to row 2 / §14.3.3.1, which cannot return `scope_exact` for a record with `R_s ≠ ∅`. The field is unread for a `full_remodel`, so nothing is wrong with the result; the case's inputs are nonetheless not consistent with the utterance it names. Same for case 2 and case 10. |
| `m7-9` | `04` rev 6 — whose header (`04:6-7`) says *"realigned to contract **rev 7**"* — still cites *"contract rev 4"* (`04:146`, `04:594`), *"contract rev 5"* / *"rev 6"* (`04:639`) and *"contract rev 6"* (`04:36`, `04:44`). `m-5`'s *"rev 3"* instances are gone; the pattern is not. |

---

## H · NOTE

| id | observation |
|---|---|
| `n7-1` | `VB3`'s extraction paragraph (`07:823-831`) is headed *"What sets it"* and defines only what sets **`partial`**. Nothing says what sets `whole`, though `EF2`, `PB1` and `GR3a` row 1 all key on it and `whole` vs absent changes the class (`breadth_fallback` vs `exact`; `unknown_type_fallback` vs `not_evaluable`). `VB3`'s opening sentence — *"what the visitor said"* — covers it by implication only. |
| `n7-2` | `VB3` files 부분만 and 일부만 under *"a restriction by **space**"* although neither names a space. The category is really *restriction by extent*; the label will mislead an implementer reading the rule against 몇 군데만. |
| `n7-3` | **Answer to §18's `Q-21`.** Yes, the floor carries more weight than it should, and here is an executed case. *"현관이랑 복도 수납"* under `WS6` reading A: three direct answers — `bi-10` (85,000,000 whole-home), `bi-12` (52,000,000 whole-home) and `bi-18` (6,200,000, the actual entrance-storage job) — all `exact`, every `PB6a` key flat, so `publishedAt` descending decides: **bi-10, bi-12, bi-18**. At a limit of 3 the on-point record is last. `LO1` forbids proximity and `PB6a` forbids price; what is missing is a *specificity* key, e.g. `|R_s| − |Q_s|`, which `GR3`'s whole-home rung already gestures at with *"larger `R_s` first"*. |
| `n7-4` | **`13b` §1.3 checked and it is not a contract defect.** A visitor's bare *"34평"* carries no basis; `AR5` (via `PY1`, `07:239-242`) refuses only when both bases are **known and different**, and *"one unknown basis lowers confidence"*, which `EF4` (`07:909-913`) carries as a disclosure. So `EF4` is total on that input and no assumption is needed. `13b`'s own bi-14 rows rest on an assumption it flags; the contract does not need it. |
| `n7-5` | **`13b` §2.8's last observation was not dispositioned and is correct as written.** `bi-10` and `bi-12` are `exact` for *"현관이랑 복도 수납"* because `WS7b` keeps a full's trade set open and both happen to carry `built_in_furniture`. That is `EF6`'s definition of `exact` working as specified — *every criterion the visitor stated was satisfied* — not a defect. It is the same phenomenon as `n7-3` and is worth the owner's attention as a product question rather than a contract one. |

---

## I · What I could not verify

- **Rev 6 → rev 7 as a diff.** `07` is untracked (`git status`: `?? docs/reports/integration/07-…`)
  and has no committed ancestor, so I could not diff the two revisions. Everything in §D and §F rests
  on the rev-6 lines quoted verbatim inside `13` and `13b`, plus §20.4/§20.5's own accounts. A rev-7
  change to a line neither review quoted would not appear here.
- **`INV-28`/`INV-29`/`INV-30` on `bi-01`, `bi-04`, `bi-06`, `bi-07`** — their `workScopeIds` do not
  exist, in `04` or in `projects.json` (I confirmed zero occurrences). On §13's evidence I expect all
  four to pass once authored; I did not verify it and neither did `13c`.
- **The producer-side mirror of `INV-30`** — `05:508-512` marks it **Not done**. I checked the
  contract text only. It is the one rule in V0.2 that fails a build if missed and the one that is
  backward-incompatible.
- **The full 19 × N query matrix.** I executed eleven targeted utterances against named records
  (*"전체 리모델링 사례 보여주세요"*, *"주방만 하고 싶어요"*, *"주방 포함 34평 전체 리모델링, 예산
  5천"*, *"창호 교체하려는데 34평 전체 리모델링"*, *"1억 이내로 전체 리모델링 하고 싶어요"*,
  *"바닥이랑 도배만 3천만원"*, *"욕실 타일만 … 100만원"*, *"욕실만 700만원"*, *"바닥만"*,
  *"수납 공사한 사례 있나요"*, *"현관이랑 복도 수납"*) rather than re-running the whole matrix. A
  defect confined to a shape I did not run would not appear.
- **Whether `CINV-20`'s "256" was ever anything but the script's output.** I can show it is 272 under
  a faithful `PB1`; I cannot tell whether it was derived independently.
- **Sections rev 7 did not touch** — §1–§4, §6, §8, §9–§11, §16, §17, §14.4 — were spot-checked for
  consistency with the changed rules, not re-reviewed.

---

## J · The shortest path to READY

1. **`B7-1` + `M7-1`** — one clause in `PB1`'s partial branch (*"…and the consumer dropped no
   unrecognised id from this record"*), after which `pb1Permits` as shipped becomes faithful; then
   re-run and re-publish `CINV-20`'s vector count, and regenerate `proof/ef6-totality.txt`.
2. **`B7-2`** — `PB6a` step 1 needs a stated class **preference** order (`exact` first) rather than
   `EF6`'s row order, or an explicit sentence that `PB6a` orders only within the direct-answer and
   labelled-reference partitions `GR3` creates.
3. **`B7-3`** — either `PB1`'s `full_remodel` branch refuses when `Q_t ≠ ∅` and `Q_t ⊄ R_t` is not
   the only mismatch, or `VB3` treats *"…만"* on a trade as a restriction of the **job** and sets
   `V.breadth = partial`. Whichever is chosen, `07:1004-1005`'s *"no trade-only request can be
   budget-matched at all today"* has to be corrected or made true.
4. **`M7-2`** — the rung rows need to be closed under the classes their own `GR3a` row can produce,
   or `07:1221` needs replacing with a rule for off-rung records.
5. **`M7-3`** — `WS6` needs a total tie-break: resolve once per query (not per record) and say what
   happens when the readings do not differ on permission.
6. **`M7-4`** and the nine MINORs — mechanical.

Three of the five substantive items are one sentence each. Nothing here argues for an eighth
restructure: §14.3 is a function and stayed one under everything I threw at it. What rev 7 shows is
that the *edges* — `GR3`/`PB6a`'s two ordering devices, `PB1`'s two permission paths, `VB3`'s two
axes — are still being fixed one side at a time, which is the shape `14` §4a named and then repeated
three times in the same revision.
