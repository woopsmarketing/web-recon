# 17 — Delta review of Contract V0.2 **rev 8** (the narrowing)

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; read only the six inputs named in the brief plus the frozen V0 contract and `data/sites/boost-interior-demo`; given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 8, 1883 lines) · `docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs` · `04-demo-data-spec.md` §4.1 (spec rev 7) |
| checklist | `15-delta-review-rev7.md` (`B7-1`…`B7-3`; `M7-1`…`M7-4`; `m7-1`…`m7-9`; `n7-1`…`n7-5`) and `16-narrowing-decision.md`, both read as **claims**, not as evidence |
| method | the proof was run as shipped (`npm run proof:ef6`), then `ef2`/`ef3`/`ef4`/`ef6`/`rowsThatHold` were checked line-by-line against §14.3.2/§14.3.6 and the eleven worked cases re-derived against `04`'s own record bodies. `EF1`–`EF6`, `GR2`/`GR2a`/`GR3`/`GR3a`, `PB2`/`PB4`/`PB5`, `VB1`–`VB3`, `WS6`/`WS7a`/`WS8`/`WS9`, `PT4`/`PT5` were then **executed** over the 19-record corpus for seven named Korean utterances with an independent transcription of §14.3.3/§14.3.3.1. Every class, order and set relation below is an executed result. |

Short names: **`07`** = the contract · **`04`** = the demo-data spec · **`15`** = the round-7 review ·
**`16`** = the narrowing decision · **`proof`** = `proof/ef6-totality.mjs`. Paths are under
`/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 4 BLOCKER · 8 MAJOR · 16 MINOR · 6 NOTE.

**The narrowing itself is sound and I could not break the three-criterion `EF6`.** It is total,
single-valued, every class is reachable, `EF1`'s closure holds, `GR3a` and its rung sets are total
and disjoint, and §14.3.3's eight rows plus §14.3.3.1's four are a function under `PB7`. `M7-2` is
genuinely closed. The producer half — §5–§13, §15's `INV-*` — is untouched and I found nothing wrong
with it. **Area D is clean.** The wire contract could freeze today.

**What is not clean is the seam the narrowing cut through.** All four BLOCKERs are rules that V0.2
**keeps** whose meaning was supplied by something V0.2 **deferred**, or that the narrowing itself
introduced:

1. **`WS6`'s `C: MUST` tie-break now decides nothing.** Its discriminator is *"the reading that does
   not permit a price comparison"* (`07:346-347`) and V0.2 permits none, for any reading. §20.6
   claims it was rewritten; the file still carries rev 7's sentence verbatim. `M7-3` is **open**.
2. **`B7-2` recurs with a new pair of devices.** `PB6a` went, but `GR3`'s *"Direct answers are
   offered first"* (`07:1084`) now collides with `GR3a`'s rungs (`07:1099-1101`) instead. Both
   `C: MUST`, no tie-breaker, different top-3 on the corpus.
3. **`GR2a` sorts `not_evaluable` last**, which `PB4` forbids in terms — *"not a null that sorts
   last"* (`07:1017`) — and which `CINV-5` (`07:1222`) is written to catch. `GR2a` is new in rev 8.
4. **`VB3`'s "closed list" is not a function.** Two rows match *"큰 공사는 아니고 몇 군데만"* with
   opposite values and no precedence rule; the proof's own worked case 11 takes the branch the table
   contradicts. This is the utterance §20.6 claims the closed list fixed.

**On area B, the honest answer is "half".** `B7-1` and `M7-2` are genuinely gone. `B7-3`'s *budget*
half is gone and its *class* half is intact and now unmitigated: for *"바닥이랑 도배만"* the two
`exact` direct answers are `bi-09` (50,000,000 whole-home) and `bi-11` (30,000,000 whole-home), while
`bi-19` — the 11,000,000 record that ran exactly those trades — is `not_evaluable`. `B7-2` and `M7-3`
are relocated, not disposed. And `M7-1`, `B7-1`'s contract residue and `B7-3`'s `PB1` branch are
parked in §17.1 **unrecorded**, in a rev-7 text that is declared *"verbatim and unweakened"* while
five of the twelve deferred items were in fact **deleted**, not parked.

**On area E, the change log is wrong again, for the seventh consecutive revision.** `07:1836` still
reads *"What rev 7 relaxes: nothing"*, and §20.6's `M7-4` row (`07:1863`) says it was *"recorded in
the relaxation table below"* — the rev-8 relaxation table has no such row. Rev 8's own relaxation
table then omits `GR2a`'s reordering, which is customer-facing in the permissive-then-punitive
direction. And `16` §7 and `07:1866` contradict each other about whether round 7's nine MINORs were
fixed; `07` is right and `16` is wrong — seven of the nine are still open.

---

## A · Is the narrowing correctly drawn?

### Shape (i) — an in-force rule citing deferred machinery as live

§17.1's own instruction is `07:1305`: *"**Deferred rule ids**, none of which V0.2 may cite as in
force"*. §14.3 is protected by a blanket scope note (`07:790-793`) that de-forces its own historical
asides. **Everything outside §14.3 is not**, and four in-force citations survive there:

| where | text | finding |
|---|---|---|
| `07:344-352` `WS6` | *"the consumer takes the reading that does **not** permit a price comparison"* | `B8-1` — load-bearing |
| `07:1232` `CINV-15` | *"budget refused because the total also bought the living room"* … *"not budget-matched"* | `m8-1` |
| `07:1599` §19 | *"That is what lets the consumer refuse to compare its total against a "욕실만" budget (§14.3.3 row 5 … not comparable)"* | `m8-2` |
| `07:412-415` `WS9` | *"**one utterance gets two opposite budget verdicts**"* — the sole stated reason for `WS9`'s joinery clause | `m8-3` |
| `04:663` E5 | *"both `derived`, same unit + basis, so PB3/PB3a-comparable"* | `m8-13` |

`07:1599` and `07:1232` are the two that a consumer could implement: both instruct a budget verdict
that has no rule behind it. `WS9`'s is a stale rationale only — the rule still stands on §14.3.3's
*relation*, which is in force.

### Shape (ii) — an in-force rule whose meaning silently depended on a deferred one

Three found. The first is a BLOCKER; the second and third are MAJORs.

**`B8-1` (BLOCKER) · `WS6`'s conservative resolution (`C: MUST`) is now vacuous on both branches, so it returns nothing. §20.6 claims a rewrite that is not in the file.**

`07:344-347`:

> **An ambiguous term resolves conservatively (`C: MUST`).** Where a visitor's word maps to more
> than one id under the consumer's own table — 수납 to `storage` or to `built_in_furniture`,
> 복도 to `hallway` or to nothing at all — **the consumer takes the reading that does not permit
> a price comparison**, and says which reading it took.

§14.3.5 (`07:1003`): *"V0.2 does **no** price comparison."* So for **every** ambiguous term, neither
reading permits a price comparison; the discriminator is constantly false; `WS6` selects neither
reading and the rule is not a function. This is `M7-3` — which §15 rated MAJOR for a *different*
reason (a per-record discriminator on a per-query object) — reappearing as total silence.

**Executed.** *"수납 공사한 사례 있나요"*, `V.breadth` absent, no area, over all 19:

| reading | `Q` | `GR3a` | `bi-09` (full 50M) | `bi-11` (full 30M) | `bi-18` (6.2M entrance storage) |
|---|---|---|---|---|---|
| A · 수납 → `storage` (a **Space**, `07:299`) | `Q_s={storage}`, `Q_t=∅` | row 2, spaces-named | `exact` | `exact` | **`scope_disjoint`** |
| B · 수납 → `built_in_furniture` (a **Work**) | `Q_s=∅`, `Q_t={built_in_furniture}` | row **3**, trade-only | `exact` | **`not_evaluable`** | `scope_superset` |

The two readings differ in the selected **rung set**, in `bi-11`'s class (`exact` ↔ `not_evaluable`)
and in `bi-18`'s class — and the `C: MUST` written to choose between them has no operative predicate
left. A conforming consumer cannot be written.

§20.6's disposition row (`07:1862`) asserts the repair was made:

> its discriminator was *"the reading that does not permit a price comparison"*, which no longer
> exists; **the tie-break is now about which reading yields the weaker class, decided once per
> query**

No such sentence exists in `07`. `07:346` is byte-for-byte rev 7's. And the replacement the change
log describes is itself the rule `15`'s `M7-3`(ii) showed produces the wrong result: under
*"which reading yields the weaker class"*, reading A is selected for *"수납"* above and `bi-18` —
the one on-point record in the corpus — is demoted from a labelled reference to `scope_disjoint`,
the worst class `GR2a` has, while two whole-home remodels stay `exact`.

**`M8-7` (MAJOR) · `CINV-19`'s coverage statement lost its composition rule with `PB0a`; the in-force obligation is prose again, which is exactly what `Q-18` was raised and answered for.**

`07:1121-1123` and `CINV-19` (`07:1236`) keep the obligation:

> A visitor who stated a budget is additionally told each shown record's price as a fact, **with its
> coverage statement** — what that total bought, from `R.projectType` and `R.workScopeIds`

What made that statement reproducible was `PB0a`'s **template** — a closed list of four inputs
including `WS8`'s not-closed proviso, *"`R_t` named as work **included**, never as a complete list"*
and `EF3`'s ground-not-conclusion form (`07:1332-1340`). `PB0a` is deferred. The two-clause
replacement at `07:1122` names only `projectType` and `workScopeIds`, so two consumers build
different coverage statements from one document. §18's `Q-18` asked precisely *"is `PB0a` specific
enough to implement twice"*, was answered *"no … it was prose"* (`07:1465`), and the narrowing put it
back to prose without saying so. The **prohibitions** still bind independently (`WS7a`, `WS8`,
`CINV-17`), so this is under-specification rather than a falsehood — MAJOR, not BLOCKER.

**`M8-6` (MAJOR) · the whole-home rung carries a within-rung order the "Every result has an order" key list does not contain, and nothing says which wins. This is §18's own `Q-24`, answered "no".**

`07:1099`: *"whole-home | `full_remodel` records → `partial_remodel` records, **larger `R_s` first**
→ breadth-absent records"*. `07:1112-1113`: *"**Every result has an order (`C: MUST`).** Within a
rung, records are ordered by: (1) `GR2a`'s class order; (2) `|delta_area|` …"* — five keys, no `R_s`
cardinality among them.

**Executed** — *"전체 리모델링 사례 보여주세요"* (`CINV-24`(a)'s own fixture; `V.breadth = whole`,
`Q = ∅`, no area). Rung 2 holds all five authored partials, every one `breadth_fallback`, so
`GR2a` is flat and key (3) is 0 for all:

| rule followed | rung-2 order |
|---|---|
| *"larger `R_s` first"* (`07:1099`), then the key list | **bi-16** (`\|R_s\|=2`) · bi-14 · bi-15 · bi-17 · bi-18 |
| the key list alone (`07:1112`) — `publishedAt` descending | **bi-14** (2025-07-31) · bi-15 · bi-16 · bi-17 · bi-18 |

`CINV-21`'s guarantee is *"two runs … produce the same order"* and `PB6`'s retired promise was *"two
consumers cannot disagree on one document"*. Two conforming consumers disagree here. `07:1875` lists
*"`GR3`'s rungs become record predicates with a total terminal rung"* as a tightening; it is, and it
also left one class-free ordering instruction inside a rung label.

### Is anything parked in §17.1 that an in-force rule still needs?

Yes, and this is the larger half of area A. See `M8-1` in §B.

---

## B · Does the narrowing dispose of rev 7's findings, or relocate them?

| rev-7 finding | §20.6 claims | I find |
|---|---|---|
| `B7-1` | removed by construction | **genuinely gone.** The proof models no permission function; `CINV-20`'s counts are re-derived and I reproduced all three (1,512 / 100 of 192 / 336). But `B7-1`'s *contract* half — `PB1`'s partial branch keying on §14.3.3's **row** — is parked unrecorded and now unresolvable: `M8-1`. |
| `B7-2` | removed by construction | **relocated.** `PB6a` went; the collision moved to `GR3` vs `GR3a`: `B8-2`. |
| `B7-3` | removed by construction | **half.** Budget half gone; class half intact and now the headline answer: `M8-3`. The `PB1` branch that caused it is parked unrecorded: `M8-2`. |
| `M7-1` | removed with `PB1` | **parked unrecorded**: `M8-2`. |
| `M7-2` | fixed | **genuinely fixed**, verified below. |
| `M7-3` | discriminator no longer exists | **open, and the claimed fix is absent from the file**: `B8-1`. |
| `M7-4` | accepted and recorded in the relaxation table | **open. There is no such row**: `M8-4`. |

**`M7-2` verified closed.** `GR3a`'s rungs are now record predicates and each rung set ends with an
implicit *every remaining record* rung (`07:1103-1104`). I re-ran `15`'s own counter-example,
*"주방 포함 34평 전체 리모델링"* (`GR3a` row 1, whole-home): `bi-16` (`scope_superset`), `bi-15`,
`bi-17`, `bi-18` (`scope_disjoint`) are all `partial_remodel` records and therefore all on rung 2.
The second and third instances (`bi-19` on row 2; *"거실 바닥만 얼마예요"*) land on the terminal rung.
Every record has a position under every `GR3a` row. Closed.

### `B8-2` (BLOCKER) · `GR3`'s *"Direct answers are offered first"* and `GR3a`'s rungs are two `C: MUST` orderings with no tie-breaker, and they give different top-3 on the corpus. `B7-2` with `PB6a` removed and the disambiguating clause removed with it

`07:1084`:

> **Direct answers are offered first**, then the labelled references.

`07:1103-1104`, three lines later:

> **Each rung is a predicate on the record, never a class name**, and every rung set ends with an
> implicit final rung — *every record not on an earlier rung* — so the rungs are **total** over the
> result.

*Total over the result* includes the direct answers, and `07:1112` orders records **within a rung**
starting from `GR2a`'s class order — which contains `exact`, so `exact` records are inside rungs.
A labelled reference on rung 2 therefore precedes a direct answer on rung 3, and `07:1084` says it
must not. No rule says which governs.

**Executed** — *"주방이랑 욕실 사례 있나요"*. `VB3` row 6 (*a bare enumeration*) ⇒ `V.breadth`
**absent**; `Q_s = {kitchen, bathroom}`, `Q_t = ∅`, no area. `GR3a` row 2 ⇒ spaces-named rungs.

| record | `EF6` | rung |
|---|---|---|
| bi-16 `[kitchen, bathroom]` partial, 19,800,000 | `exact` (§14.3.3 row 3) | 1 |
| bi-14 `[kitchen]` partial, 15,000,000 | `scope_subset` (row 6) | 2 |
| bi-15 `[bathroom]` partial, 7,000,000 | `scope_subset` (row 6) | 2 |
| bi-17, bi-18 partial | `scope_disjoint` | 2 |
| bi-09 50M · bi-10 85M · bi-11 30M · bi-12 52M · bi-13 (full) | **`exact`** — `EF3`'s spaces half is `satisfied` for any `Q_s` by `PT4`(b), `Q_t = ∅ ⊆ R_t` | 3 |
| bi-19 | `not_evaluable` | 5 |

| rule followed | top 3 at a result limit of 3 |
|---|---|
| the rungs (`07:1099-1112`) | **bi-16**, **bi-14**, **bi-15** — a kitchen-only 15,000,000 job and a bathroom-only 7,000,000 job, each of which must be disclosed as *"the other room was not remodelled in this case"* (§14.3.3 row 6), ahead of four records that did both |
| *"direct answers first"* (`07:1084`) | **bi-16**, then two of bi-09/bi-10/bi-11 — or, if `publishedAt` decides inside the direct-answer partition, **bi-09, bi-10, bi-11** |

Rev 7 did not have this collision: its `GR3` sentence read *"Direct answers are offered first, among
themselves in the default order below; **the ladder orders the labelled references that follow**"*
(`15:158-159`), which confines the ladder to the labelled references and is consistent. Rev 8 dropped
that clause while making the rungs explicitly total over the result. **The collision is a rev-8
regression**, and it is not in §20.6's relaxation table in either direction.

`n7-3`'s case is a second demonstration: for *"현관이랑 복도 수납"* under the rungs, `bi-18` (the
on-point 6,200,000 record) is on rung 1 and is shown first — `n7-3` is fixed. Under
*"direct answers first"*, `bi-18`, `bi-09`, `bi-10`, `bi-12` and `bi-13` are all `exact`, all
`PB6a`-successor keys are flat, and `publishedAt` descending gives **bi-10 (85,000,000), bi-12
(52,000,000), bi-18** — `n7-3` unfixed, on-point record last. One reading closes a NOTE the other
leaves open.

### `M8-1` (MAJOR) · §17.1 does not preserve what it says it preserves. Five of the twelve deferred items are **deleted**, and the parked `PB1` now points at a table column that exists nowhere

`07:1299-1303`:

> **Nothing here is retracted or weakened. It is parked.** … The text below is rev 7's, **unedited**,
> so that V0.3 starts from the reviewed version rather than from memory.

`07:1305-1307` lists twelve deferred items. The `<details>` block (`07:1310-1426`) contains rev 7's
§14.3.5 only — `PB0`, `PB0a`, `PB1`, `PB2`, `PB3`, `PB3a`, `PB4`, `PB5`, `PB6`, `PB6a`. **Not
present anywhere in the file:**

- **`EF5`** — I grepped every occurrence (`07:792, 866, 1004, 1038, 1306, 1482, 1707, 1769, 1813-14, 1851`); all ten are references to a rule whose text is gone. Rev 7's `EF5` lived at §14.3.2, which rev 8 rewrote for three criteria.
- **the `price_fallback` class** — rev 7's `EF6` row 5; the annex has no `EF6`.
- **§14.3.3's budget column** — the table at `07:923-932` was rewritten without it and no copy survives.
- **§14.3.4's price tier** — the tier table at `07:990-994` likewise.
- **`GR3`'s comparing budget rung** and **`CINV-6`/`CINV-11`'s text** (`07:1223`, `07:1228` are now empty pointers).

The consequence is not cosmetic. The parked `PB1` (`07:1361-1362`) reads *"`R.projectType ==
"partial_remodel"` — **permitted when §14.3.3 permits it**. This branch is entered for **every** `Q`,
including `Q = ∅`, which is §14.3.3 **row 1**"* — and §14.3.3 as it now stands permits nothing and
has no row that carries a permission. V0.3 cannot restore `PB1` from §17.1; it has to reconstruct the
budget column from `15` and `13`. `16` §3's *"kept in full in §17 so no work is lost"* and §20.6's
*"verbatim and unweakened"* are false for five of twelve items.

### `M8-2` (MAJOR) · `B7-1`'s contract residue, `M7-1` and `B7-3` are parked inside §17.1 with no record that they were ever found

§17.1's preamble names the *diagnosis* — *"`PB1`'s two permission paths, `GR3`/`PB6a`'s two ordering
devices, `VB3`'s two axes"* (`07:1295-1296`) — and one design constraint. It records **no defect**.
Specifically, the verbatim `PB1` at `07:1350-1364` still carries, unannotated:

- **`M7-1`**: the partial branch reads §14.3.3's row, so a record from which the consumer dropped an
  unrecognised id is budget-**permitted** on the reduced `R_s` (`CINV-9`'s own fixture: `bi-16`
  against *"주방만, 2천"*, δ = −0.01 ⇒ `satisfied`) while `EF3` calls the scope `not_evaluable`.
  `15`'s one-clause repair — *"…and the consumer dropped no unrecognised id from this record"* — is
  not applied and not noted.
- **`B7-3`**: the `full_remodel` branch permits whenever `V.breadth` is absent, which `VB3` row 5 now
  makes **determinate** for every trade restriction, so *"바닥이랑 도배만 3천만원"* budget-matches
  `bi-11`'s whole-home 30,000,000 at δ = 0. `VB3`'s closed list is **in force in V0.2** and is what
  arms this; deferring `PB1` without annotating it means V0.3 re-arms an `OD-O` violation on day one.
- **`B7-1`**: that the same branch has two readings (row vs `EF3` state) is nowhere stated.

Per the brief's own standard — *"a defect parked in §17.1 is not a rev-8 blocker, but it must be
recorded there"* — this is a MAJOR, not a BLOCKER. `16` §6 item 4 promises V0.3 starts from the
round-7 diagnosis; the three concrete defects are not written down anywhere V0.3 will look.

### `M8-3` (MAJOR) · `B7-3`'s class half survives intact, and the proof's worked case 10 asserts the opposite on an input that misstates `bi-11`'s own `workScopeIds`

`proof:180-181`:

```js
// Round 7 B7-3, the OD-O case. Under the narrowed contract no budget is compared at all, so the
// only question left is the class, and bi-11 is correctly NOT a direct answer for a trade query.
["B7-3: '바닥이랑 도배만' vs bi-11 (whole-home 20평; trades NOT in its R_t)",
 { projectType: "full_remodel", breadth: false, q: qOf("scope_exact", false), ...A_NONE }, "not_evaluable"],
```

`qOf(relation, qtSubsetRt = true, …)` with `false` encodes *"trades NOT in its `R_t`"*. But
`04:189` authors `bi-11` as `[kitchen, bathroom, flooring, wallpaper, doors]`, so
`R_t = {flooring, wallpaper, doors} ⊇ {flooring, wallpaper}` and `qtSubsetRt` is **true**. With the
record's real ids, `ef3("full_remodel", q)` returns `satisfied`, `EF6` falls to row 7 and `bi-11` is
**`exact`**.

**Executed over all 19** for *"바닥이랑 도배만"* (`VB3` row 5 ⇒ `V.breadth` absent; `Q_s = ∅`,
`Q_t = {flooring, wallpaper}`; `GR3a` row 3, trade-only):

| record | `EF3` | `EF6` |
|---|---|---|
| **bi-09** full, **50,000,000** (`R_t ⊇ Q_t`) | `satisfied` | **`exact`** — a direct answer |
| **bi-11** full, **30,000,000** (`R_t ⊇ Q_t`) | `satisfied` | **`exact`** — a direct answer |
| bi-10, bi-12, bi-13 full | `not_evaluable` | `not_evaluable` |
| bi-14…bi-18 partial | `unsatisfied` | `scope_disjoint` / `scope_overlap` |
| **bi-19** breadth-absent, `R_t = {flooring, wallpaper, lighting}`, **11,000,000** | `not_evaluable` (absent branch) | **`not_evaluable`** |

So the two direct answers for a flooring-and-wallpaper request are whole-dwelling remodels at
50,000,000 and 30,000,000, and the single record in the corpus that ran exactly those trades and
nothing else, at 11,000,000, is *"확인할 수 없습니다"*. `GR1` then states all three prices as facts.
No `OD-O` violation — nothing is *compared* — but §16's own framing (*"a V0.2 that … does breadth,
scope and area correctly"*) does not survive this input, and `B7-3` is not "removed by construction";
its budget clause is. The repair `15` §J item 3 proposed — `VB3` treating *"…만"* on a trade as a
restriction of the **job** — was not taken, and rev 8 made the breadth-absent reading mandatory.

The proof's PASS line therefore rests, at case 10, on an input that contradicts the record it names.
Everything else in the proof I checked is faithful (see §D).

---

## C · Rev 7's residue — `M7-2`, the nine MINORs, the five NOTEs

`16` §7 states: *"Round 7's `M7-2` … and the nine MINORs are **not** removed by narrowing and are
**fixed on their merits in rev 8**."* `07:1866` states the opposite: *"the nine MINORs and five NOTEs
| carried into the rev-8 review rather than claimed as done"*. `07` is correct (`m8-16`).

| id | rev-8 status |
|---|---|
| **`M7-2`** | **CLOSED** — verified above. |
| `m7-1` stale `proof/ef6-totality.txt` | **CLOSED.** Regenerated 2026-09-24 19:21; its contents match the current run byte for byte (rev 8, 1512/100/336/11). |
| `m7-2` *"the default order"* undefined | **CLOSED.** The phrase is gone from §14.3; `GR3a` row 4 now reads *"none; `GR2a` alone orders the result"* (`07:1095`) and `GR2a` is defined at `07:1070-1072`. One stale use survives in the historical §20.5 (`m8-14`). |
| `m7-3` `rowsThatHold` is not independent | **OPEN.** `proof:70-80` still repeats `ef6`'s seven predicates verbatim and in the same order, then takes `Math.min`, so the check can only detect a mismatch between early-return order and row numbering, never a transcription error both copies share. `proof:69`'s comment still claims *"Each row's condition stated independently"*. `07:1237` quietly dropped the word "independent"; the proof did not. → `m8-4` |
| `m7-4` `GR3a` row 2's condition vs its rung-set name | **OPEN, verbatim.** `07:1093`: *"`V.breadth == partial` **or** `Q_s ≠ ∅`"* selecting the rung set named *"spaces named"* for *"부분만 하고 싶어요"*, which names none. → `m8-6` |
| `m7-5` `CINV-24`(c)'s *"in that order"* | **OPEN, and now wrong under both readings.** `07:1241` still asserts *"classes `bi-09` `fallback_from_full` and `bi-14` `exact`, **in that order**"* for *"주방만 하고 싶어요"*. Executed: `V.breadth = partial` ⇒ `GR3a` row 2; `bi-14` is on rung 1 and is the direct answer, `bi-09` is on rung 3. → `m8-5` |
| `m7-6` `PT6`'s gloss no longer exhaustive | **OPEN, verbatim** (`07:209-211`). → `m8-7` |
| `m7-7` *"re-verified on all 19"* | **OPEN.** `07:1824` and `04:7` both still say it; `bi-01`, `bi-04`, `bi-06`, `bi-07` carry a `projectType` and no `workScopeIds`, as `07:1443-1444` and `04:44` themselves record. 15 of 19. → `m8-8` |
| `m7-8` proof cases with inputs their utterance cannot produce | **OPEN.** `proof:166-169` still set `relation: "scope_exact"` on *"창호 … 34평 전체"*, whose `Q_s = ∅`, `Q_t = {windows}` routes to §14.3.3.1. Harmless for a `full_remodel` — but case 10 is now the same defect with a material consequence (`M8-3`). → `m8-9` |
| `m7-9` `04`'s stale contract-rev citations | **OPEN and untouched by design.** `04`'s rev-7 header says *"**Only §4.1 changed**"*. *"contract rev 6"* survives at `04:36, 44, 91, 185, 658`; *"contract rev 4"* at `04:146, 594, 635`; *"Contract rev 5"* at `04:639`. → `m8-10` |
| `n7-1` `VB3` never said what sets `whole` | **CLOSED.** `07:838` row 1: *"전체 리모델링, 집 전체, 올수리 | `whole`"*. |
| `n7-2` 부분만/일부만 filed under *"restriction by space"* | **CLOSED.** They have their own row now (`07:840`), labelled *"bounded, without naming the rooms"*. |
| `n7-3` no specificity key; the floor carries too much weight | **MOOT under one reading, OPEN under the other.** `GR3a`'s rungs put the on-point record first; *"direct answers first"* does not. Demonstrated under `B8-2`. → `N8-2` |
| `n7-4` `13b` §1.3 is not a contract defect | **MOOT.** `EF4`/`PY1` unchanged (`07:906-913`); the finding was a non-finding and stays one. |
| `n7-5` whole-home records `exact` for a narrow storage question | **OPEN as a product question, unchanged.** Executed for *"수납"* reading B: `bi-09`, `bi-12`, `bi-13` are `exact`; `bi-18`, the actual storage job, is `scope_superset`. `WS7b` keeps a full's trade set open, which is specified behaviour. → `N8-3` |

**Net: 2 of 9 MINORs closed, 2 of 5 NOTEs closed or moot, 1 NOTE half-closed.**

---

## D · The evaluation function on its own terms

**This is the clean part of rev 8 and I could not break it.**

**`EF6` is total and single-valued.** Row 7 is unconditional so some row always fires; *first match
wins* so exactly one does. Verified against `07:1043-1051` row for row and re-derived over the same
input space independently of the shipped proof.

**Every class is reachable.** Pass A reaches 10/10 over 1,512 derived inputs; I reproduced the input
arithmetic (3 × 3 × 21 × 8 = 1,512 ✓; 4³ × 3 = 192 ✓; 48 `unsatisfied`-scope vectors × 4 relations +
144 = 336 ✓). `GR2a` is a permutation of `GR2`'s ten-class list and the proof asserts it
(`proof:128-131`) — `07:1237`'s claim checks out.

**`EF1`'s closure holds.** I enumerated every occurrence of the four state names outside §14.3.2 and
found no rule that **assigns** one. `WS8` (`07:392-394`) and §14.3.3's not-closed paragraph
(`07:953-958`) both now read *"`EF3` assigns the state, this rule supplies the reason"*. `B-1` stays
closed and did not regress.

**`EF2`–`EF4` match the prose.** `ef2` (`proof:36-40`) ✓ including the `whole ↔ full_remodel` mapping
`07:870-874` states. `ef3` (`proof:43-49`) ✓ — `Q = ∅` first, the `full_remodel` branch never
returning `unsatisfied`, the `WS8` dropped-id branch inside the `partial_remodel` branch **and only
there**, the absent branch returning `not_evaluable`. `ef4` (`proof:52-56`) ✓ — `PY1`'s confidence
signal correctly not modelled as a state. `ef6` (`proof:59-67`) is row-for-row faithful, including
row 6's `.includes("not_evaluable")` over exactly the three criteria. `rowsThatHold` is the one
exception (`m8-4`).

**`GR3`'s rungs partition and are total.** Whole-home's three rungs partition on `R.projectType`;
spaces-named's five partition on `projectType` × `R_s ⊇ Q_s` with *"other"* doing the disambiguation;
trade-only's four end in *"every other record"*. `GR3a`'s four rows are first-match-wins with an
`otherwise`. Both are functions. The defects are the **ordering** rules layered on top (`B8-2`,
`M8-6`), not the rungs.

**`VB3`'s extraction table is NOT closed.** This is the one genuine defect in the function's own
inputs.

### `B8-4` (BLOCKER) · `VB3`'s "closed list" has two rows that match one utterance with opposite values and no precedence rule. The utterance is the one §20.6 claims the closed list fixed, and the proof's own case 11 takes the branch the table contradicts

`07:832-844` declares the list `C: MUST` and closed. Two rows:

> | 부분만, 일부만, **몇 군데만** | `partial` | bounded, without naming the rooms |
> | qualitative prose about size — **큰 공사는 아니고**, 간단하게 | **absent** | not a statement about extent the contract can act on |

*"큰 공사는 아니고 몇 군데만"* matches both. Nothing in `07:832-848` states an evaluation order —
contrast `PB7` (`07:919-921`) and `GR3a` (`07:1086`), which both say so explicitly for their tables.

**Executed** over all 19 (`Q = ∅`, no area):

| reading | direct answers (`exact`) |
|---|---|
| row 3 ⇒ `V.breadth = partial` | the **five** authored partials (bi-14…bi-18); every `full_remodel` is `fallback_from_full`; bi-19 is `unknown_type_fallback` |
| row 7 ⇒ `V.breadth` **absent** | **all nineteen** records — every criterion `not_applicable`, `EF6` row 7 for every one |

That is `15b`'s original divergence — *"one `exact` record and all nineteen"* — at unchanged
magnitude. `07:1864` claims it fixed: *"**fixed** — `VB3` is a **closed list** of seven forms; anything
outside it leaves `V.breadth` **absent**, a defined answer"*. The list being closed does not help when
two of its own rows fire.

`proof:182-183` asserts the row-7 reading by name:

```js
["VB3 closed list: '큰 공사는 아니고 몇 군데만' — qualitative prose leaves V.breadth absent",
 { projectType: "full_remodel", breadth: false, q: Q_NONE, ...A_NONE }, "exact"],
```

so the executable proof and the normative table disagree about the contract's own worked utterance.

**A second overlap, with a larger blast radius.** Row 4 (*"집 전체는 아니고 …, 전체까지는 아니고 …"*
⇒ `partial`) and row 5 (*a restriction by trade* ⇒ `absent`) both match
*"집 전체는 아니고 바닥이랑 도배만 하려고요"*. Against `bi-11`: `partial` ⇒ `EF2` `unsatisfied` ⇒
`fallback_from_full`, a labelled reference; `absent` ⇒ `EF2` `not_applicable`, `EF3` `satisfied` ⇒
**`exact`**, a direct answer. Opposite verdicts on a 30,000,000 whole-home remodel for a visitor who
said *"not the whole house"*.

A third, smaller: rev 7 carried an explicit clause that *"…만"* attached to a trade leaves
`V.breadth` absent *"with or without 만 attached to a trade"* (`15:250-251`); rev 8 dropped it, so
*"욕실 타일만 바꾸려고요"* — a space, a trade and one `만` — has no row that unambiguously owns it.

The repair is one sentence — *"the rows are evaluated in the order written and the first whose
condition holds decides"*, the wording `PB7` and `GR3a` already use — but until it is there, `VB3`
is not a function and `EF2` has no determinate input.

### `B8-3` (BLOCKER) · `GR2a` sorts class `not_evaluable` **last**, which `PB4` forbids in terms and which `CINV-5` is written to catch. `GR2a` is new in rev 8 and the relaxation table does not mention it

`07:1070-1072`, `GR2a` (`C: MUST`), used as ordering key (1) by `07:1112`:

> `exact` → `scope_superset` → `scope_overlap` → `scope_subset` → `fallback_from_full` →
> `breadth_fallback` → `unknown_type_fallback` → `area_fallback` → `scope_disjoint` →
> **`not_evaluable`**

`07:1015-1017`, `PB4` (`C: MUST`), retained in force by §17.1:

> a criterion in state `not_evaluable` contributes **nothing** to the record's score and to **no**
> tie-break key. Not a penalty, not a small penalty, **not a null that sorts last**.

`EF6` row 6 produces class `not_evaluable` **iff** a stated criterion is in state `not_evaluable`
(`07:1050`). So `GR2a` demotes a record to last position within its rung for exactly the reason
`PB4` says must carry no weight.

**Executed — `CINV-5`'s own metamorphic form** (`07:1222`: *"removing a record's `property.area` …
does not push it behind one that scores lower"*). Query *"34평 전체 리모델링"* (`V.breadth = whole`,
`V.area = 34평 supply`, `Q = ∅`). All three records below are `full_remodel`, so all three sit on
whole-home **rung 1** and `GR2a` alone separates them:

| record | criteria | `EF6` | `GR2a` position |
|---|---|---|---|
| bi-09, 34평 | breadth `satisfied`, area `satisfied` | `exact` | **1** |
| bi-12, 26평 (`delta_area` = −0.235, beyond `fallback`) | breadth `satisfied`, area **`unsatisfied`** | `area_fallback` | **8** |
| bi-09 **with `property.area` removed** | breadth `satisfied`, area **`not_evaluable`** | `not_evaluable` | **10** |

Removing bi-09's area moves it from first to last **and behind bi-12**, whose area is a measured
miss. `CINV-5` fails against `GR2a`, and `PB4`'s own gloss — *"Missing must not silently become
never-shown — with a result limit of 3 over 19 records, fourth place is invisible"* (`07:1018-1019`)
— describes the outcome exactly.

This is a rev-8 regression in a specific sense: rev 7's within-rung key (1) was `PB6a` step 1,
*"`EF6`'s class, in the row order `EF6` is written in"*, in which `not_evaluable` was row 7 and
therefore **ahead of** `exact` at row 8. Rev 8 fixed `exact`'s position (correctly — that was `B7-2`)
and, in the same move, sent `not_evaluable` from second-to-front to dead last, which is the direction
`PB4` names. §20.6 lists `GR2a` as *"new; the single class order, machine-checked against `GR2`"*
(`07:1876`) and says nothing about the reordering (`M8-5`).

The repair is `PB4`'s own logic: `GR2a` is a **presentation** order for classes that were *evaluated*,
and a `not_evaluable` record keeps the position the previous key gave it — the treatment key (2)
already gives a record whose area bases `AR5` refuses (`07:1113-1115`).

---

## E · Honesty of the author's own account

Spot-checked against the file, hostilely. Four of nine claims do not hold.

| claim | where | verdict |
|---|---|---|
| `CINV-20`'s re-derived counts: 1,512 / 100 of 192 / 336 / 11 worked cases | `07:1237`, `07:1857` | **true.** Reproduced, and the arithmetic of the input space checks out. |
| *"`GR2a` is a permutation of `GR2`'s closed list"*, machine-checked | `07:1237`, `07:1876` | **true.** `proof:128-131`. |
| *"V0.2 amends no frozen V0 rule"*; `PR4` satisfied as written; §16's confirmation list is one item | `07:1022-1025`, `07:1258-1264` | **true.** V0 `PR4` (`02:262`) forbids comparing, sorting or calling prices "close" outside one `category`; V0.2 does none. V0 `BU3` (`02:281`) is back in force and `GR1`'s statement-of-fact permission does not touch it. This is the narrowing's cleanest win and it is stated accurately. |
| `M7-3`: *"the tie-break is now about which reading yields the weaker class, decided once per query"* | `07:1862` | **FALSE.** No such sentence in `07`; `WS6` at `07:346` is rev 7's, unchanged. → `B8-1` |
| `M7-4`: *"**accepted as correct** and recorded in the relaxation table below"* | `07:1863` | **FALSE.** `07:1836` still reads *"**What rev 7 relaxes: nothing.**"*, uncorrected, and the rev-8 relaxation table (`07:1870-1877`) contains no row for the `WS8` clause narrowing. → `M8-4` |
| *"Budget comparison moves to §17.1, **verbatim and unweakened**"* / *"kept in full in §17 so no work is lost"* | `07:1850`, `07:1299-1303`, `16:73-76` | **FALSE for 5 of 12 items.** `EF5`, `price_fallback`'s row, §14.3.3's budget column, §14.3.4's price tier and `GR3`'s budget rung are deleted, not parked. → `M8-1` |
| *"What rev 8 relaxes … everything else | unchanged"* | `07:1877` | **FALSE.** `GR2a` reordered every result's primary key relative to rev 7's `PB6a` step 1, in both directions: `exact` from last to first (a fix) and `not_evaluable` from second-to-front to last (a `PB4` violation). Customer-facing, unlisted. → `M8-5` |
| `B7-2`: *"`PB6a` existed only to break price ties"* | `07:1858` | **misleading.** Rev 7's `07:1233` used `PB6a`'s sequence as the *universal* within-rung order, and rev 8 copied its steps 2–5 verbatim into *"Every result has an order"*. Only step 1 was price-specific. → `m8-15` |
| *"Round 7's `M7-2` … and the nine MINORs are … fixed on their merits in rev 8"* | `16:136` | **FALSE**, and contradicted by the author's own `07:1866`. 2 of 9 MINORs are closed. → `m8-16` |

**The honest caveat at `07:1879-1883` is itself well-drawn** and I ran the inverse check it asks for:
every deferred rule is a permission (`PB1`, `PB3`, `PB6`) or machinery serving one, and every
retained prohibition (`PB2`, `PB4`, `PB5`, `BU3`, `PR4`) still binds — except that `PB4` is now
contradicted by `GR2a` (`B8-3`) and the check as framed would not have caught it, because `GR2a` is a
**new** rule rather than a deferred one.

---

## F · `04` §4.1's expected answers

**Are B and F the only rows that got worse?** No. Row **G** is not merely worse — it is **not what
rev 8's rules produce**, and it is not flagged at all. Row **A** loses a yes/no budget answer by the
identical mechanism as row F and is not flagged either.

### `M8-8` (MAJOR) · §4.1 row G's expected answer is unreachable as the headline result

`04:699`:

> | G | "32평인데 도배랑 바닥만 얼마예요" | **bi-19**, reached on **`GR3`'s trade rung** (`R_t ⊇ Q_t`, breadth absent). Its 11,000,000 is **stated as a fact** (`GR1`) … |

**Executed** — `VB3` row 5 ⇒ `V.breadth` absent; `Q_t = {wallpaper, flooring}`, `V.area = 32평`:

| record | breadth | scope | area | `EF6` |
|---|---|---|---|---|
| **bi-09** full, 34평, 50,000,000 | `not_applicable` | `satisfied` (`R_t ⊇ Q_t`) | `satisfied` (δ = +0.0625, `strong`) | **`exact`** |
| bi-11 full, 20평, 30,000,000 | `not_applicable` | `satisfied` | `unsatisfied` (δ = −0.375) | `area_fallback` |
| bi-10, bi-12, bi-13 | `not_applicable` | `not_evaluable` | — | `not_evaluable` / `area_fallback` |
| **bi-19** breadth-absent, 32평, **11,000,000** | `not_applicable` | **`not_evaluable`** | `satisfied` (δ = 0) | **`not_evaluable`** |

The **only** direct answer is `bi-09` — a 34평 whole-home remodel at 50,000,000, for a visitor who
asked what wallpaper and flooring cost in a 32평 flat. `bi-19` is `not_evaluable`, which `GR2a` sorts
**last** (`B8-3`) and which `GR2` reports to the visitor as *"확인할 수 없습니다"*. Under the rungs
`bi-19` is on rung 2 and `bi-09` on rung 3; under *"direct answers first"* it is the reverse
(`B8-2`). Row G names neither the record that is actually `exact` nor the ordering question, and
`15:510-511` had already flagged the rev-7 ancestor of this row as incomplete for the same reason.

### `m8-11` · row I's alternate reading is mis-derived — `storage` is a **Space**

`04:701`: *"If a consumer maps 수납 → `storage` instead, **`Q_s = {entrance}` and `Q_t = {storage}`**:
§14.3.3 **row 4** (`R_s == Q_s`, `Q_t ⊄ R_t`) ⇒ `scope_subset`."*

`07:299` puts `storage` in the **Spaces** table (*"창고, 팬트리가 아닌 수납 공간"*). So
`Q_s = {entrance, storage}`, `Q_t = ∅`, `R_s = {entrance} ⊊ Q_s`, which is §14.3.3 **row 6** —
*"the spaces in `Q_s \ R_s` are reported as **not remodelled in this case**"*. The class is the same
(`scope_subset`) and the row and its mandated disclosure are not. This is `X-3`'s exact shape (right
class, wrong row, wrong disclosure text) recurring inside the one section `04` rev 7 rewrote.

Row I is also the row `B8-1` bites hardest: it says *"`WS6` is the consumer's to define"*, but
`WS6`'s `C: MUST` claims to constrain which way the tie falls and no longer does.

### `m8-12` · row A got worse by the same mechanism as row F and is not labelled

`04:687-689` commits: *"Two rows below (B, F) are visibly worse answers than rev 7 promised. They are
listed as worse on purpose."* `04:703-706` then concedes *"rows A, B, F and I each lost a budget
clause, and B and F lost the part of the answer that made them good."*

Row A's visitor says *"34평 전체 **5천이면 되나요**"* — a yes/no. Rev 7 answered it (`bi-09`'s
50,000,000 against a 50,000,000 budget is δ = 0). Rev 8 must not: `04:693` — *"The answer must **not**
say the 5천 예산이 맞다/모자라다"*. That is word-for-word row F's degradation — *"the yes/no now also
goes, because answering it is a price comparison"* (`04:698`) — on a *sharper* question, since row F's
visitor can at least read 125,000,000–140,000,000 and resolve *"1억 넘나요"* unaided. Three rows got
worse, not two.

**Rows checked and correct:** C (`bi-14` `exact`, `bi-16` `scope_superset` via §14.3.3 row 5 — I
re-derived it), D, E, H. Row B's claim *"Every `full_remodel` record qualifies as `exact`"* is correct
(`bi-13` included; it has no area to fail on and `V.area` is not stated). Row B and row F's *worse*
labels are accurate and well-stated; the narrowing's cost is not hidden where it is labelled.

---

## G · What I could not verify

- **Rev 7 → rev 8 as a diff.** `07` is untracked and has no committed ancestor. §B and §E rest on the
  rev-7 lines quoted verbatim inside `15` plus `07`'s own §20.4–§20.6. A rev-8 edit to a line no
  review has quoted would not appear here.
- **`INV-28`/`INV-29`/`INV-30` on `bi-01`, `bi-04`, `bi-06`, `bi-07`** — their `workScopeIds` do not
  exist yet, in `04` or in `projects.json`. Unchanged from round 7.
- **The full 19 × N matrix.** I executed seven utterances (*"바닥이랑 도배만"*, *"32평인데 도배랑
  바닥만"*, *"주방이랑 욕실 사례"*, *"큰 공사는 아니고 몇 군데만"* ×2 readings, *"수납 공사한 사례"*
  ×2 readings, *"34평 전체 리모델링"*, *"전체 리모델링 사례 보여주세요"*, *"주방만 하고 싶어요"*)
  with an independent transcription of §14.3.3/§14.3.3.1, rather than the whole matrix.
- **Sections rev 8 did not touch** — §1–§13, §14.4, §15's `INV-*`, §16, §20.1–§20.4 — were
  spot-checked for consistency with the narrowing, not re-reviewed. §13's `category` audit and the
  producer rules were read only far enough to confirm the narrowing leaves them alone. It does.
- **Answering `Q-25`** is an owner judgement, not a reviewer's; my partial answer is at `N8-5`.

---

## H · All findings

| id | sev | one line | where |
|---|---|---|---|
| `B8-1` | **BLOCKER** | `WS6`'s `C: MUST` tie-break keys on *"the reading that does not permit a price comparison"*; V0.2 permits none on either branch, so the rule returns nothing. §20.6 claims a rewrite that is not in the file. `M7-3` open. | `07:344-352`; `07:1862` |
| `B8-2` | **BLOCKER** | *"Direct answers are offered first"* and `GR3a`'s rungs are two `C: MUST` orderings with no tie-breaker; different top-3 for *"주방이랑 욕실 사례"*. `B7-2` relocated; rev 7's disambiguating clause was dropped. | `07:1084` vs `07:1099-1112` |
| `B8-3` | **BLOCKER** | `GR2a` sorts class `not_evaluable` last, which `PB4` forbids verbatim (*"not a null that sorts last"*) and `CINV-5` tests; removing `bi-09`'s area pushes it behind `bi-12`. | `07:1070-1072`, `07:1112` vs `07:1015-1019`, `07:1222` |
| `B8-4` | **BLOCKER** | `VB3`'s "closed list" has overlapping rows with opposite values and no first-match rule; *"큰 공사는 아니고 몇 군데만"* yields 5 or 19 direct answers, and `proof` case 11 takes the branch row 3 contradicts. | `07:840` vs `07:844`; `proof:182-183` |
| `M8-1` | MAJOR | §17.1 preserves only rev 7's §14.3.5. `EF5`, `price_fallback`'s row, §14.3.3's budget column, §14.3.4's price tier, `GR3`'s budget rung and `CINV-6`/`CINV-11` are deleted; parked `PB1` points at a column that no longer exists. | `07:1299-1307`, `07:1310-1426`; `16:73-76` |
| `M8-2` | MAJOR | `M7-1`, `B7-3` and `B7-1`'s contract residue are parked inside §17.1's verbatim `PB1` with no record that they were found. | `07:1295-1303`, `07:1350-1364` |
| `M8-3` | MAJOR | `B7-3`'s class half survives: *"바닥이랑 도배만"* makes `bi-09` (50M) and `bi-11` (30M) the direct answers and `bi-19` (11M) `not_evaluable`; `proof` case 10 asserts the opposite on an input that misstates `bi-11`'s `workScopeIds`. | `proof:180-181`; `04:189` |
| `M8-4` | MAJOR | `07:1836` still reads *"What rev 7 relaxes: nothing"*; §20.6 says it was corrected in a table row that does not exist. Seventh consecutive revision. | `07:1836`, `07:1863`, `07:1870-1877` |
| `M8-5` | MAJOR | Rev 8's relaxation table omits `GR2a`'s reordering: `not_evaluable` moved from ahead of `exact` (rev 7 `PB6a` step 1) to last. Customer-facing; see `B8-3`. | `07:1876-1877` |
| `M8-6` | MAJOR | The whole-home rung's *"larger `R_s` first"* is a within-rung order absent from the five-key list; two conforming consumers order rung 2 differently. §18's `Q-24`, answered no. | `07:1099` vs `07:1112-1119` |
| `M8-7` | MAJOR | `CINV-19`'s coverage statement lost `PB0a`'s template and is prose again — the defect `Q-18` was raised and answered for, reopened silently. | `07:1121-1123`, `07:1236`; `07:1332-1340` |
| `M8-8` | MAJOR | `04` §4.1 row G is unreachable as written: `bi-09` (50M whole-home) is the sole `exact`, `bi-19` is `not_evaluable`. Not among the rows labelled worse. | `04:699` |
| `m8-1` | MINOR | `CINV-15` still asserts budget verdicts (*"budget refused"*, *"not budget-matched"*) — an in-force test invariant citing the deferred budget column. | `07:1232` |
| `m8-2` | MINOR | §19 states an un-hedged live consequence of the deferred budget column. | `07:1599` |
| `m8-3` | MINOR | `WS9`'s sole stated reason is *"two opposite **budget verdicts**"*; the rule survives on the relation, the rationale is stale. | `07:412-415` |
| `m8-4` | MINOR | `rowsThatHold` still repeats `ef6`'s predicates verbatim in order; `proof:69` still claims independence. `m7-3` open. | `proof:69-80` |
| `m8-5` | MINOR | `CINV-24`(c)'s *"in that order"* is wrong under both readings: `bi-14` is the direct answer and is on rung 1. `m7-5` open. | `07:1241` |
| `m8-6` | MINOR | `GR3a` row 2 selects the *"spaces named"* rung set for *"부분만 하고 싶어요"*. `m7-4` open, verbatim. | `07:1093` |
| `m8-7` | MINOR | `PT6`'s three-ground gloss still does not cover `PT5`'s breadth-absent case. `m7-6` open, verbatim. | `07:209-211` |
| `m8-8` | MINOR | *"`INV-28`/`INV-29`/`INV-30` re-verified on all 19"* is still stated; 4 records have no `workScopeIds`. `m7-7` open. | `07:1824`; `04:7` |
| `m8-9` | MINOR | `proof` cases 4/5 still set `relation: "scope_exact"` on `Q_s = ∅` queries §14.3.3 routes to §14.3.3.1. `m7-8` open. | `proof:166-169` |
| `m8-10` | MINOR | `04` still cites *"contract rev 4/5/6"* in nine places; `04` rev 7 changed only §4.1. `m7-9` open. | `04:36, 44, 91, 146, 185, 594, 635, 639, 658` |
| `m8-11` | MINOR | `04` §4.1 row I derives the `storage` reading as `Q_t`; `storage` is a **Space**, so it is §14.3.3 row 6, not row 4. `X-3`'s shape, inside the rewritten section. | `04:701` vs `07:299` |
| `m8-12` | MINOR | Row A lost a yes/no budget answer by row F's mechanism and is not labelled worse; three rows got worse, not two. | `04:687-689`, `04:693` |
| `m8-13` | MINOR | `04`'s coverage matrix still calls `bi-09`/`bi-10` *"PB3/PB3a-comparable"* — deferred machinery cited as live. | `04:663` |
| `m8-14` | MINOR | §20.5 describes `GR3a` as *"a five-row precedence table … Row 5 is no ladder"*; rev 8's `GR3a` has four rows. | `07:1832` |
| `m8-15` | MINOR | §20.6's *"`PB6a` existed only to break price ties"* is misleading: its steps 2–5 were the universal within-rung order and rev 8 copied them. | `07:1858` vs `07:1112-1119` |
| `m8-16` | MINOR | `16` §7 says round 7's nine MINORs *"are fixed on their merits in rev 8"*; `07:1866` says the opposite and is correct (2 of 9). | `16:136` vs `07:1866` |
| `N8-1` | NOTE | `GR2a`'s justification mis-cites `OD-P`: *"projects containing the requested space"* is `OD-P`'s **last** rung, not its first. The order itself is defensible. | `07:1074-1075`; `01:25` |
| `N8-2` | NOTE | `n7-3` is closed under the rung-primary reading of `B8-2` and open under the other — a second demonstration that the two readings differ materially. | — |
| `N8-3` | NOTE | `n7-5` survives unchanged: `WS7b` keeps a full's trade set open, so whole-home records are `exact` for a narrow storage question. Specified behaviour; a product question for the owner. | `07:372-374` |
| `N8-4` | NOTE | §14.3's scope-note disclaimer covers §14.3 only. Every deferred-rule citation that matters (`WS6` §7.4, `CINV-15` §15, §19) is outside its reach. | `07:790-793` |
| `N8-5` | NOTE | **Partial answer to `Q-25`.** Stating prices with *"not selected or ordered by your budget"* is defensible, but the disclaimer presumes the visitor can trust the order they are shown, and with `B8-2`/`B8-3` unresolved that order is not determined. Separately, with `V.budget` reading into no rule, `VB1`'s three shapes are exercised only by `CINV-8`'s parse test. | `07:1489-1493` |
| `N8-6` | NOTE | Closed and recorded so round 9 does not reopen them: `M7-2`, `m7-1`, `m7-2`, `n7-1`, `n7-2`, `n7-4`. | — |

---

## I · The shortest path to READY

1. **`B8-1`** — write the sentence §20.6 already describes, and make it a *query-level* rule with a
   defined outcome when the readings do not differ. Note that *"the weaker class"* is the rule `15`'s
   `M7-3`(ii) showed demotes the on-point record; a specificity tie-break (`|R_s ∩ Q_s|`, or
   `GR3a`'s rung index) is the shape that survives execution.
2. **`B8-2`** — one sentence: either restore rev 7's *"the ladder orders the labelled references that
   follow"*, or delete *"Direct answers are offered first"* and let the rungs be the single device.
   The contract cannot keep both.
3. **`B8-3`** — `GR2a` is a presentation order over **evaluated** classes; a record whose class is
   `not_evaluable` keeps the position the previous key gave it, exactly as key (2) already specifies
   for an `AR5`-refused area.
4. **`B8-4`** — one sentence in `VB3`: *"the rows are evaluated in the order written and the first
   whose condition holds decides"*, plus a decision on which of rows 3/7 and 4/5 wins. Then fix
   `proof` case 11 to match.
5. **`M8-1`/`M8-2`** — paste the five deleted blocks into §17.1 and annotate the parked `PB1` with
   `M7-1` and `B7-3`. This is transcription, not design, and it is what makes `16` §6 item 4 true.
6. **`M8-3`/`M8-8`** — correct `proof` case 10 against `bi-11`'s real ids, and rewrite `04` row G to
   name `bi-09`. Whether the *behaviour* is acceptable is an owner call, not a contract fix.
7. **`M8-4`/`M8-5`** — correct `07:1836` and add the `GR2a` row. The relaxation account has now been
   wrong seven revisions running; a mechanical diff of the ordering keys between revisions would
   catch it in one line.
8. **`M8-6`, `M8-7`, and the sixteen MINORs** — mechanical.

**None of this argues for a ninth restructure, and none of it argues against the narrowing.** The
narrowing removed two of the three round-7 BLOCKERs outright and made `PR4` whole again, which is a
real and checkable gain. What it did not do is re-read the rules that *survived* it: `WS6`, `PB4`,
`CINV-19`, `CINV-15` and §19 each had a sentence whose meaning was supplied by a rule that left the
building, and `GR2a` and `GR3`'s new sentence were written without re-reading the rules they now
share an ordering with. That is the same failure mode `14` §4a named and `15` closed with — *the
edges are still being fixed one side at a time* — applied this round to the edge between what was
kept and what was cut.
