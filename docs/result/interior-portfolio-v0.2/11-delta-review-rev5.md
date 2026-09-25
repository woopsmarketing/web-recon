# 11 — Delta review of Contract V0.2 **rev 5** (the §14.3 restructure) against `10-delta-review-rev4.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `10`, `05`, `04`, `02` or `03`, and was given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 5, 1418 lines) |
| checklist | `10-delta-review-rev4.md` `P-1`…`P-6` + `P-7`…`P-18`; dispositions in `05-review-disposition.md` "Round 4" |
| also read | frozen V0 `03-integration-contract-v0-candidate.json`, `data/sites/boost-interior-demo/content/projects.json` (all 8 records), `04-demo-data-spec.md` rev 4 (all 11 new records + the coverage matrix), `01-owner-decisions.md`, `platform/content/schema.ts`, `platform/test/integration.test.ts` |
| scope | the **structure**: §14.3 as a whole (`EF1`–`EF6`, `PB0`–`PB7`, `GR1`–`GR5a`, `VB1`–`VB3`), plus what the restructure moved or dropped. Rules rev 5 did not touch are re-opened only where the restructure changed how they are reached. |
| method | the evaluation function of §14.3 was **implemented** (exact `Fraction` arithmetic, §7.3's two tables, `PB7` first-match, `EF6` first-match) and executed over the full 19-record corpus × 12 visitor queries. Every class, delta and set relation quoted below is an execution result, not a reading. |

Short names: **`07`** = the contract under review · **`10`** = the rev-4 delta review · **`05`** = the
disposition · **`04`** = the demo-data spec · **`data`** =
`data/sites/boost-interior-demo/content/projects.json`. All paths under
`/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 4 BLOCKER · 8 MAJOR · 10 MINOR · 6 NOTE.

Section A: of `P-1` … `P-6`, **3 CLOSED · 3 PARTIALLY CLOSED · 0 NOT CLOSED.** Of round 4's 8 MINOR
and 4 NOTE, **5 applied, 7 not applied** — although `07:1413` records all twelve as applied.

**The restructure was the right move and should not be reverted.** `EF1`'s three states are a real
device, and they did close the class of defect they were aimed at: a criterion can no longer be left
unassigned, and the class list can no longer disagree with the criteria, because it is computed from
them. `P-1`, `P-4` and `P-5` are genuinely closed, and `P-2`'s named defect is closed.

**But the function is still not total, and the holes are in the two places §14.3 still delegates
outward.** `EF6` has no row for a `breadth` criterion that came out `unsatisfied`, so a
one-bathroom job is classed `exact` for *"전체 리모델링 사례 보여주세요"* (`Q-1`). `PB1`'s partial
branch delegates the budget permission to §14.3.3's table, and rev 5 **deleted that table's
`Q = ∅` row**, so an open budget question can be budget-compared against no partial at all — which
is `P-2` in mirror image, on `PB0`'s own worked utterance (`Q-2`). `EF3`'s new
`full_remodel ⇒ satisfied` extends `PT4`(b), a statement about **spaces**, to the visitor's
**trades**, so `bi-09` — whose own body says *"창호는 … 교체하지 않았고"* — is classed `exact` for a
창호 request (`Q-3`). And `PB1`'s `full_remodel` branch states two non-equivalent predicates in
consecutive sentences; under the one `EF3` endorses, `CINV-13`'s own second fixture cannot be
`exact` (`Q-4`).

Three of those four are seams of exactly the old kind, one level down: not between four lists, but
between the criteria and the two things that are still computed elsewhere — §14.3.3's table, which
`PB1` enters with an input `EF3` never passes it, and `GR3`'s ladder, which `EF6` queries through a
predicate (*"a direct answer"*) that the contract never defines. The difference from rounds 2–4 is
that every one of them is now expressible as **a missing row in one table**, which is a qualitative
improvement and is why the recommendation below is *finish the function*, not *restructure again*.

Separately, and independent of any finding: `07` still cannot be frozen on its own terms. §16 lists
two items needing consumer confirmation first (`PB0`, the `VO6` `style` limit), and `PB0` is the
rule the whole total-budget path rests on.

---

## A · Are `P-1` … `P-6` closed by rev 5?

| id | verdict | rev-5 text checked, and against what |
|---|---|---|
| **P-1** `GR5`'s quotient clause forbade the producer's own derived price and the record's own total | **CLOSED** | `07:1023-1031` **`GR5a`**: *"A number that **is itself the value of a `pricing` field on some record in the result** is permitted, even when it coincides with a forbidden product or quotient … The exemption is about provenance, not arithmetic."* `07:1106` `CINV-18` carries both fixtures: *"`bi-10` 2,500,000 (= 85,000,000 ÷ 34, exactly) **must** be statable when asked; `bi-19`'s 343,750 must not"*. I re-executed all four derived values (`bi-09` 1,470,588 · `bi-10` 2,500,000 · `bi-11` 1,500,000 · `bi-12` 2,000,000) and confirmed the three exact divisions. `bi-19`'s 343,750 is the value of no field in any result and stays forbidden — `M-1`'s case survives intact. One residue: the exemption is not scoped to the record the number describes (`Q-M1`, MINOR). |
| **P-2** `PB1` gave breadth no "not stated ⇒ not applicable" branch; `PB0` cited a disclosure no rule required | **CLOSED (and the fix opened `Q-2`)** | `07:792` `EF1`: *"`not_applicable` — the **visitor did not state** this criterion. It is not a miss … contributes nothing in either direction"*, applied to all four criteria by `07:787-796`; `07:801` `EF2`: *"`V.breadth` absent ⇒ `not_applicable`"*. Executed *"5천만원 예산인데 어떤 사례들이 있나요?"* over all 19: `bi-09` (50,000,000, `delta = 0`) and `bi-11` (30,000,000, `delta = −0.4`) both come out **`exact`**. The named defect is closed. `PB0a` (`07:908-912`) supplies the missing disclosure and `CINV-19` (`07:1107`) fixtures it — the second half is closed too. **But the same utterance now budget-compares against *no* `partial_remodel` at all**, because §14.3.3 lost its `Q = ∅` row — `Q-2`, BLOCKER. |
| **P-3** `exact` unreachable for a `full_remodel` whenever the visitor names a space | **PARTIALLY CLOSED** | `07:804-809` `EF3`: *"**`full_remodel` ⇒ `satisfied`, for any `Q`.**"* With **no budget stated** this works: *"주방만 하고 싶어요"* now gives `bi-09` `exact` where rev 4 gave `not_evaluable`. **But `P-3`'s own failure case is still not `exact`.** Executed *"34평 전체 리모델링 … 주방이랑 욕실이 제일 중요해요, 예산 5천"* against `bi-09`: breadth ✓, scope ✓ (`EF3`), area `delta_area = 0` ✓, and then `PB1` (`07:919-920`) — *"Refused when the visitor asked about partial work **or named spaces**"* — refuses the budget, so `EF5` (`07:818-820`) returns `not_evaluable` and `EF6` row 5 (`07:981`) returns **`not_evaluable`**. The hole moved from the scope criterion to the budget criterion; the class is unchanged. See `Q-4`. `EF3`'s fix also over-reaches to trades — `Q-3`, BLOCKER. |
| **P-4** §14.3.2.1 fired no positive row; `GR3`'s ladder was keyed on spaces, so *"바닥이랑 도배만"* could never reach `bi-19` | **CLOSED** | `07:995` `GR3` gains the rung *"**breadth-absent records whose `R_t ⊇ Q_t`**"*, ordered ahead of `full_remodel` records. Executed *"바닥이랑 도배만"* (`Q_t = {flooring, wallpaper}`) with the ladder in play: `bi-19` → **`unknown_type_fallback`** (reachable, labelled, ahead of `bi-09`'s `fallback_from_full`). `07:1103` `CINV-15` gains the positive fixture round 4 asked for. `07:862-873` states the residual limitation instead of hiding it, and `07:1149-1155` defers the closed trade set properly. §14.3.3.1's first row is still unreachable on the corpus (`07:857`) — documented rather than deleted; see `Q-17`. |
| **P-5** `WS9` + `WS7a` made an absent space id a **false exclusion** | **CLOSED** | `07:841-848`: *"`R_s` is the complete set of spaces **that were remodelled** — the sense `WS9` authors in … An absent space id therefore means **that space was not remodelled**. It does **not** mean no work reached it: `bi-17`'s 12,500,000 re-floored the bedrooms"*, and *"A disclosure may say 침실은 리모델링 범위에 없었습니다 and must never say 침실에는 아무 공사도 하지 않았습니다"*. `07:1105` `CINV-17` carries both axes. `07:328-346` (`WS7a`/`WS7b` in §7.4) is the same wording, so the two statements of the rule cannot disagree. A different route to the same falsehood survives via `WS8` — `Q-7`, MAJOR, and it is not a rev-5 regression. |
| **P-6** the `storage`/`built_in_furniture` gloss was not propagated, and `WS9` left one case with two answers | **PARTIALLY CLOSED** | (a) **Propagated.** `07:1209`/`07:1243` — §19's worked example now declares `built_in_furniture` and gives `bi-01` `["entrance","living_room","kitchen","bedroom","bathroom","built_in_furniture"]`; `04:139-141` and `04:503-504` re-author `bi-10` and `bi-18`; `04:629` and `04:647` are re-derived (I re-counted: 17 ids used, 9 unused, 26 total ✓, and coverage row `P6` now reads `R_s = {entrance}`, `R_t = {built_in_furniture}` ✓). (b) **Not fixed: `WS9` is byte-identical to rev 4.** `07:369-370` still reads *"Author a `Spaces` id only when that space itself was remodelled — its layout, its fixtures **or its built-in elements** changed"*, and `07:287` still says the joinery itself is `built_in_furniture`. Round 4's one-sentence fix was not applied, so `bi-18`'s 복도 붙박이장 still has two supported authorings — `[entrance, built_in_furniture]` and `[entrance, hallway, built_in_furniture]` — with opposite budget verdicts for *"현관이랑 복도 수납"*. See `C`. |

**`P-7` … `P-18`.** Verified individually against the text: **5 applied, 7 not.**

| id | applied? | evidence |
|---|---|---|
| `P-7` §20's `PR4` row; `CINV-1`–`CINV-11` count | **no** | `07:1312` still reads *"\| `PR4` \| **kept**, and `PB3` adds a same-`projectType` condition on top of it \|"* — the exact sentence `M-10` and `P-7` were raised against. `07:1327` still reads *"`CINV-1`–`CINV-11` added"* when the list runs to `CINV-19` (`07:1107`). |
| `P-8` `PB7` vs `GR2` precedence rank two relations oppositely | **yes** | Resolved by construction: rev 4's standalone precedence list is gone (`07:986-988`), so `PB7`'s row order (`07:827-829`) is the only authority. With `R_s = ∅`, `Q_s ≠ ∅`, rows 5 and 7 both hold and row 5 decides — one answer. |
| `P-9` classes assigned by a definition, not a rule | **yes** | `EF6` (`07:975-982`) names an assigning row for every class, and `07:978` names `fallback_from_full` / `unknown_type_fallback` against `GR3` explicitly. |
| `P-10` `PB6a` names only the `max` shape | **no** | `07:958-962` is unchanged and still `max`-only; a `range [a,b]` budget ties every record inside the band at `delta = 0` exactly as `max` does (`07:954`). Round 4's `Q-13` remedy was not adopted either — see `Q-8`. |
| `P-11` `PB1a` unconditional but not invoked by the partial branch | **yes** | Resolved by structure: `PB1a` is gone, `EF4` (`07:813-817`) is a criterion computed for every record, and the area *gate* on the budget is now explicit and full-only (`07:918-919`). That is the right split — `PT2` says a partial's area is not the area the price bought. |
| `P-12` `PB3a`'s third conjunct describes a value the wire cannot carry | **no** | `07:932-933` still reads *"present, equal and not `"unknown"`"*. `AR2` forbids emitting the string and `contract.ts:96` `AREA_BASES = ["supply","exclusive"]`. |
| `P-13` `scope_disjoint` is the only not-permitted relation with no disclosure | **no, and made worse** | `07:833-839`: only rows 2 and 3 carry a disclosure, and row 4 names the extra spaces. Rows **5** (`scope_subset`), **6** (`scope_overlap`) and **7** (`scope_disjoint`) carry none. Rev 4 carried one on rows 4–7. See `C`. |
| `P-14` the scope relation `exact` collides with the class `exact` | **no** | `07:834` names the relation `exact`; `07:982` names the class `exact`; `07:810` bridges them (*"satisfied iff that relation is `exact`"*). They are different predicates. |
| `P-15` `fallback_from_full` only when no exact case exists | **no, and now load-bearing** | `07:989` still scopes `GR3` to *"a request no direct match answers"*, and `EF6` row 2 (`07:978`) is now the **only** producer of that class. When a direct match exists the whole-home record falls through to row 6 — `exact` — not to `not_evaluable`. This is the mechanism of `Q-1`. |
| `P-16` a perfect scope match with no price is `not_evaluable` — say it is intended | **partly** | `07:793` (*"Reported per record (`GR2`)"*) + `07:969-971` (the class carries the not-evaluable criteria list) make the distinction observable, which is the substance. No sentence says it is intended. |
| `P-17` *"Nothing in rev 4 relaxes a rule"* was false | **no** | `07:1415` now says *"**Nothing in rev 5 relaxes a rule.**"* `EF3` relaxes the scope criterion for every `full_remodel` against every `Q`; §14.3.3 lost a row; rows 5–7 lost their disclosures. Fourth consecutive round in which the change log's own summary line is wrong. |
| `P-18` `WS1` is an unlabelled prose judgement | **no** | `07:313-315` unchanged. Round 4 flagged it as advisory, so this is not held against rev 5. |

---

## B · Findings

### `Q-1` (BLOCKER) · `EF6` has no row for a `breadth` criterion that came out `unsatisfied`, so a one-bathroom job is classed `exact` for a whole-home request — and a 50,000,000 whole-home remodel is classed `exact` for *"주방만 하고 싶어요"*

**Rules.** `07:975-982` `EF6`, the class table, first match wins:

| # | condition | class |
|---|---|---|
| 1 | scope is `unsatisfied` | the §14.3.3 relation |
| 2 | on a `GR3` rung | `fallback_from_full` / `unknown_type_fallback` |
| 3 | budget is `unsatisfied` | `price_fallback` |
| 4 | area is `unsatisfied` | `area_fallback` |
| 5 | any criterion is `not_evaluable` | `not_evaluable` |
| 6 | otherwise | **`exact`** |

`EF1` (`07:787`) computes **four** criteria. `EF6` has a row for three of them. **`breadth = unsatisfied`
matches no row and falls through to row 6.** `GR2`'s closed list (`07:966-968`) has no member for a
breadth mismatch either, so there is no class `EF6` *could* assign: the gap is in the vocabulary, not
only in the table.

`07:984` states the invariant the table is supposed to satisfy — *"So **`exact` means every criterion
the visitor stated was evaluated and satisfied**"* — and the table contradicts it two lines above.

**Failure case 1, executed over all 19 records.** Visitor: *"전체 리모델링 사례 보여주세요"*
(`V.breadth = whole`; nothing else stated — the commonest opening utterance in the product's own §1
framing).

| record | `projectType` | breadth | scope | area | budget | **class** |
|---|---|---|---|---|---|---|
| `bi-09` (50,000,000 full) | full | satisfied | n/a | n/a | n/a | `exact` |
| `bi-15` (**욕실 한 곳, 7,000,000**) | partial | **unsatisfied** | n/a | n/a | n/a | **`exact`** |
| `bi-18` (**현관·수납, 6,200,000**) | partial | **unsatisfied** | n/a | n/a | n/a | **`exact`** |
| `bi-14`, `bi-16`, `bi-17`, `bi-04`, `bi-06` | partial | **unsatisfied** | n/a | n/a | n/a | **`exact`** |
| `bi-19` | absent | not_evaluable | n/a | n/a | n/a | `not_evaluable` |

Eight of the nine `partial_remodel` records in the corpus are returned as **exact matches for a
whole-home request**, on the same class token as `bi-09`. `GR2` reports only the criteria that came
out `not_evaluable` (`07:969-971`), and breadth here is `unsatisfied`, not `not_evaluable` — so the
mismatch is reported **nowhere**. `SD2`/`PT3` exist to stop `category` standing in for breadth; this
row order discards the structured breadth fact the whole of §5 was written to supply.

**Failure case 2 (the mirror, and worse).** Visitor: *"주방만 하고 싶어요"*
(`V.breadth = partial`, `Q_s = {kitchen}`).

| record | breadth | scope | **class** |
|---|---|---|---|
| `bi-14` (`[kitchen]`, 15,000,000) | satisfied | satisfied (row 2) | `exact` ✓ correct |
| **`bi-09`** (full, 50,000,000) | **unsatisfied** | satisfied (`EF3`) | **`exact`** |
| **`bi-10`** (full, 85,000,000) | **unsatisfied** | satisfied (`EF3`) | **`exact`** |

`EF6` row 2 does not save this: `GR3` applies only *"for a request no direct match answers"*
(`07:989`), and `bi-14` is a direct match, so `bi-09` is not on a rung and cannot be
`fallback_from_full`. Round 4 recorded this shape as `P-15`, a NOTE, because under rev 4 the
fall-through landed on `not_evaluable`. Under rev 5 it lands on `exact`. **`OD-P` — *"The AI must
never hide that a fallback case is not an exact match"* — is inverted by the class table.**

**Suggested fix.** Two lines. (i) Add `breadth_fallback` to `GR2`'s closed list (`07:966-968`).
(ii) Insert it into `EF6` between rows 1 and 2, since a breadth mismatch is a coverage statement of
the same kind as a scope one: *"| 1b | breadth is `unsatisfied` | `breadth_fallback` |"*. (iii) Add
one sentence closing the table: *"`EF6` is total over the four criteria: every criterion has a row
for `unsatisfied`, row 5 covers `not_evaluable`, and row 6 covers the rest."* (iv) Assert totality
as a `CINV`: `EF6` over the 3⁴ = 81 criterion-state vectors × 3 `projectType` values = 243 inputs is
enumerable in a unit test, and it is the single cheapest protection against a fifth round of this.

---

### `Q-2` (BLOCKER) · §14.3.3 lost its `Q = ∅` row, so **no `partial_remodel` can be budget-compared on an open budget question** — `PB0`'s own worked utterance returns zero budget matches over a corpus containing five jobs inside the budget

**Rules.** `07:916-921` `PB1`: *"`R.projectType == "partial_remodel"` — permitted when §14.3.3
permits it."* §14.3.3's table (`07:831-839`) has seven rows. Rev 4's row 1 keyed on `Q = ∅` and
**permitted** the comparison (round 4's `P-2` table records `bi-16` as *"yes (row 1, `Q = ∅`)"*).
Rev 5's row 1 is now `Q_s = ∅` **and** `Q_t ≠ ∅` (`07:833`). **There is no row for `Q = ∅`.**

Entering the table with `Q_s = ∅` therefore falls to row 4 — `R_s ⊋ Q_s`, true for every non-empty
`R_s` — giving `scope_superset`, **not permitted** (`07:836`). The alternative reading, that §14.3.3
is simply not invoked when `EF3` short-circuits to `not_applicable` (`07:803`), leaves *"permitted
when §14.3.3 permits it"* with no value at all. A third implementer will read `not_applicable` as
"nothing objected, so permitted". Three readings, two of them silent failures.

Either way `EF5` (`07:818-820`) returns `not_evaluable`, and `EF6` row 5 returns `not_evaluable`.

**Failure case, executed — `PB0`'s own utterance and `CINV-19`'s own fixture.** `07:905-906` says
*"where neither replacement binds — `V.breadth` and `Q` both absent, an open *"2천만원으로 뭘 할 수
있나요"* — totals may still be compared and ordered, and `PB0a` is the compensating control."*
Executed at `V.budget = exact 20,000,000` over all 19:

| record | total | `PB1` permits? | class |
|---|---|---|---|
| `bi-18` | **6,200,000** | **no** — §14.3.3 row 4 | `not_evaluable` |
| `bi-15` | **7,000,000** | **no** | `not_evaluable` |
| `bi-17` | **12,500,000** | **no** | `not_evaluable` |
| `bi-14` | **15,000,000** | **no** | `not_evaluable` |
| `bi-16` | **19,800,000** | **no** | `not_evaluable` |
| `bi-09`…`bi-13` (50M–140M) | yes | `delta` = +1.5 … +5.25 | `price_fallback` ×5 |

**Five jobs at or under the visitor's 2,000만원 budget are all refused, and the only records the
consumer may call budget-relevant are five whole-home remodels between 2.5× and 7× over it.**
`PB0` explicitly licenses the comparison this rule then refuses; `PB0a` and `CINV-19` are
compensating controls for an ordering that now cannot happen for any partial; and `GR3` has no rung
for this query shape either (`Q-6`), so the five affordable records are not even laddered. This is
`P-2` with the sign flipped, on the same class of utterance, one revision later.

**Suggested fix.** Restore the row as row 1 of §14.3.3, with the permission rev 4 had and the
disclosure `PB0a` now supplies:

> `| 1 | Q = ∅ — the visitor named no scope of any kind | none; scope was not a stated criterion (EF3) | **permitted**; PB0a's coverage statement is required |`

and renumber. Then state in `PB1` that its partial branch is entered **only** when `Q ≠ ∅`, so the
delegation and `EF3`'s short-circuit cannot diverge again.

---

### `Q-3` (BLOCKER) · `EF3` extends `PT4`(b) — a statement about **spaces** — to the visitor's **trades**, so `bi-09`, whose body says the windows were *not* replaced, is classed `exact` for a 창호 request

**Rules.** `07:804-809` `EF3`: *"**`full_remodel` ⇒ `satisfied`, for any `Q`.** Not a concession:
`PT4`(b) is the statement that **no space was left out and none received only maintenance-level
work**, so every space the visitor named *was* remodelled. The open-set rule `WS7b` is about the
**id list**, which for a full remodel is an enumeration convenience, not a boundary."*

The premise is about spaces; the conclusion is *for any `Q`*, and `Q = Q_s ∪ Q_t` (`07:765`). The
contract says three times that the inference does not carry to trades:

- `07:155-158` §5.2: *"An individual **trade** the project did not include — windows kept, no
  expansion — is a detail of the project, not a boundary of it: **nearly every whole-home remodel
  omits some trade**."*
- `07:183-184` `PT4`: *"A stated exclusion of an individual **trade** — 창호 그대로, 확장 없음 — is
  **not** a disqualifier under (b)."* So `PT4`(b) is silent about trades **by design**.
- `07:347-349` `WS7b` (`C: MUST NOT`): *"for every other `projectType`, including absent, the set is
  **open**: a record without `flooring` is *unknown* on flooring, never *confirmed without* it."*

`WS7b` forbids inferring **exclusion** from an absent trade id. `EF3` infers **inclusion** from one,
which no rule licenses at all. The honest state for a trade criterion against a `full_remodel` is
`not_evaluable`, which `EF1` already has.

**Failure case, executed on `04`'s own records.** Visitor: *"창호 교체하려는데 34평 전체 리모델링
사례 있나요, 예산 5천"* — `V.breadth = whole`, `Q_t = {windows}`, area 34평 supply, budget exact
50,000,000.

| record | `workScopeIds` contains `windows`? | source text | class |
|---|---|---|---|
| **`bi-09`** | **no** | `04:114` — *"**창호는 상태가 괜찮아 교체하지 않았고**, 구조 변경이나 확장도 하지 않았습니다"* | **`exact`** |
| `bi-10` | yes (`04:139`) | *"창호는 전체를 이중창으로 교체"* | `price_fallback` (85M vs 50M) |
| `bi-11` | **no** | `04:205` — *"예산이 넉넉하지 않아 **창호는 그대로 두고**"* | `area_fallback` (20평) |

The record that explicitly did **not** do the one trade the visitor asked about is the single
`exact` match, ranked above the record that did. And the consumer cannot correct it: `WS7b` forbids
saying *"이 사례에는 창호 공사가 포함되지 않았습니다"*, so the only statable thing is the class.
The same mechanism makes `bi-09` and `bi-10` scope-`satisfied` for *"2천만원으로 바닥이랑 도배만"*
(executed: both `price_fallback`, i.e. *"over your budget"* rather than *"wrong kind of job"*),
which is `M-6`'s defect — *"the table dropped the trades the visitor named"* — returning through a
different door.

**Suggested fix.** Split `EF3`'s `full_remodel` branch on the two halves of `Q`:

> **`full_remodel`:** the **spaces** half is `satisfied` — `PT4`(b) is the statement that no space
> was left out. The **trades** half is evaluated on the id list like any other: `satisfied` when
> `Q_t ⊆ R_t`, `not_evaluable` otherwise (`WS7b` — an absent trade id is unknown, never excluded).
> The criterion is `satisfied` when both halves are, `not_evaluable` when the trade half is, and
> never `unsatisfied`.

That keeps `P-3`'s fix (a full is never *scope-failed* by a named room), removes the false
`satisfied`, and needs no new class: `EF6` row 5 already carries `not_evaluable`. `CINV-13`'s second
fixture must then name a **space** (*"주방 포함 34평 전체"* — it already does), and a new fixture
should assert that *"창호"* against `bi-09` is **not** `exact`.

**On the deeper question `Q-16` asks** — what happens when an author gets `PT4`(b) wrong — see §D.

---

### `Q-4` (BLOCKER) · `PB1`'s `full_remodel` branch states two non-equivalent conditions in consecutive sentences; under the one `EF3` endorses, `CINV-13`'s own second fixture cannot be `exact`

**Rules.** `07:918-920` `PB1`:

> - `R.projectType == "full_remodel"` — permitted when `V.breadth` is `whole` or absent **and**
>   `EF4` is `satisfied` or `not_applicable`. Refused when the visitor asked about partial work or
>   **named spaces**: the total bought the whole dwelling.

Sentence 1 is a predicate over `V.breadth` and `EF4`. Sentence 2 adds a third term — `Q_s ≠ ∅` —
that sentence 1 does not contain. They are not the same function. `EF3` (`07:808-809`) sides with
sentence 2: *"Budget comparability is a separate question and `PB1` still refuses it — the total
bought the whole dwelling, not the two rooms the visitor asked about."*

`07:1101` `CINV-13` asserts the opposite: *"Two fixtures: §1's *"34평 아파트 전체 리모델링, 예산
5천"* → `bi-09` `exact`; **and the same query with a space named** (*"주방 포함 34평 전체"*) →
**still `exact`**, because `EF3` makes scope `satisfied` for a full via `PT4`(b)."*

**Failure case, executed both ways.** *"34평 전체 리모델링, 주방 포함, 예산 5천"* against `bi-09`:

| reading | breadth | scope | area | budget | `EF6` | `CINV-13` |
|---|---|---|---|---|---|---|
| sentence 2 binds (`EF3`'s reading) | satisfied | satisfied | satisfied | **`not_evaluable`** — `PB1` refuses | row 5 ⇒ **`not_evaluable`** | **fails** |
| sentence 1 only | satisfied | satisfied | satisfied | satisfied (`delta = 0`) | row 6 ⇒ `exact` | passes |

So a named test invariant is unsatisfiable under the contract's own preferred reading, and round 4's
`P-3` failure case — *"34평 전체 리모델링 … 주방이랑 욕실이 제일 중요해요, 예산 5천"* against
`bi-09`, the best answer in the corpus at `delta_area = 0` and `delta_budget = 0` — still comes back
`not_evaluable`. Two conforming consumers will disagree on the headline query of the product.

The permissive reading is not free either: executed at *"욕실만, 700만원 이내"*, `bi-09` (50,000,000)
and `bi-11` (30,000,000) both become budget-compared and labelled `price_fallback`, i.e. *"over your
budget"* — which is the claim `PT2` and `PB2`'s spirit say has no referent, since the total bought a
whole dwelling and not a bathroom.

**Suggested fix.** Make sentence 2 the rule and sentence 1 a summary of it, so the two cannot
diverge — and separate *the visitor's framing* from *the rooms they mentioned*, which `VB3`
(`07:777-780`) already insists are different things:

> `R.projectType == "full_remodel"` — permitted when **all** of: `V.breadth` is `whole` or absent;
> `EF4` is `satisfied` or `not_applicable`; and the visitor did **not** frame the work as partial
> (`V.breadth == partial`). Naming spaces is **not** by itself a refusal — `VB3` says naming two
> rooms is not a statement that the project is partial — but when `V.breadth` is absent **and**
> `Q_s ≠ ∅`, the comparison is permitted only with `PB0a`'s coverage statement, so the visitor is
> told the total bought the whole dwelling.

Then `CINV-13`'s second fixture holds, `P-3`'s failure case returns `exact`, and *"욕실만 700만원"*
(`V.breadth` absent, `Q_s = {bathroom}`) still gets the coverage statement that stops
`price_fallback` reading as a quote.

---

### `Q-5` (MAJOR) · `EF6` row 2 assigns **no class** to a `partial_remodel` on a `GR3` rung, and *"a direct answer"* — the predicate that decides between `exact` and `fallback_from_full` — is defined nowhere in the contract

**Rules.** `07:978` `EF6` row 2: *"the record is on a `GR3` ladder rung rather than a direct answer
| `fallback_from_full` if `R.projectType == "full_remodel"`, `unknown_type_fallback` if it is
absent"*. `07:989-990` `GR3`: *"the **ladder**, for a request no direct match answers. A record is
*on a rung* — never a direct answer."*

**(a) No class for a partial on a rung.** `GR3`'s first rung of row 1 is *"partial records with
`exact` scope"* (`07:994`) and its second is *"partial records with `scope_overlap`"*; row 2's first
rung is *"partial records by §14.3.3.1"* (`07:995`). A `partial_remodel` whose scope relation is
`exact` and which is on such a rung matches `EF6` row 2 — first match wins — and row 2's cell names a
class only for `full_remodel` and for breadth-absent. The record leaves `EF6` with no class, which
`GR2` (`07:966`) requires it to have. (`scope_overlap` partials escape only because row 1 catches
them first.)

**(b) The predicate is undefined.** I grepped every occurrence of *"direct"* in `07` (lines 557, 792,
925, 978, 989, 1049, 1161): none defines *a direct match* or *a direct answer*. Yet it is the sole
thing separating `Q-1`'s `exact` from `fallback_from_full`. `GR3`'s own preamble makes the
definition circular: the ladder applies when no direct match answers, and the ladder's first rung is
the direct match.

**Failure case.** *"주방만 하고 싶어요"* against `bi-09`. A consumer that reads *"on a rung"* as "the
ladder is in play for this query" returns `fallback_from_full`; one that reads it as "the ladder ran
because nothing else answered" returns `exact` (`Q-1`). Executed: both are reachable from the same
document and the same utterance.

**Suggested fix.** (i) Define it once, in `GR3`: *"A record is **a direct answer** when its class
from `EF6` rows 1, 1b and 6 is `exact`; every other returned record is **on a rung**, and the rung is
the first one in the table below whose condition it satisfies."* That makes the ladder a labelling
of the result, not a separate search, and removes the circularity. (ii) Give row 2 a partial arm, or
— simpler — restrict row 2 to `full_remodel` and breadth-absent records explicitly and let partials
fall through to rows 3–6, which already classify them correctly.

---

### `Q-6` (MAJOR) · `GR3` is not total over the query space: a visitor who states neither breadth nor scope matches **no rung row**, so the records `Q-2` refuses are not reachable as references either

**Rules.** `07:992-996` `GR3`'s table is keyed on *"the visitor asked"* with exactly three values:
*partial work, spaces named* · *trade-only (`Q_s = ∅`, `Q_t ≠ ∅`)* · *whole-home work*.

A visitor with `V.breadth` absent and `Q = ∅` — the open budget question of §1's own framing, `PB0`'s
worked case and `CINV-19`'s fixture — matches none of the three. `GR3` is a `C: MUST` that says
nothing for that input.

**Failure case.** *"2천만원으로 뭘 할 수 있나요"*: `Q-2` shows all five affordable partials are
`not_evaluable` on budget, and `GR3` gives no rung on which to surface them as labelled references
either. `TI1` (`07:890`) — *"Tiers must not be applied so that an ordinary request returns zero
records"* — is not violated on its letter because nothing filters, but the consultation's answer to
the most ordinary question in the vertical is five over-budget whole-home remodels and a silence.

**Suggested fix.** Add a fourth row: *"| nothing stated but a budget | records with a comparable
`pricing.total`, `|delta|` ascending, each with `PB0a`'s coverage statement → records with any price
→ the rest |"*. It costs one row and it is the row that makes `PB0a` and `CINV-19` mean something.

---

### `Q-7` (MAJOR) · `WS8`'s unknown-id drop turns an *unknown* into a *fact*: a consumer one vocabulary version behind converts `scope_superset`/refused into `exact`/permitted and may then state a false closure

**Rules.** `07:364-365` `WS8` (`C: MUST`): *"an id the consumer does not know is an **unknown
value**: ignore that id, keep the record, never reject the document"*; `07:641-642` repeats it and
explains why (*"Otherwise a minor vocabulary addition would turn every document TRANSIENT"*).
`07:307-308`: *"Adding an id is a **minor** bump."* `07:841-844` `WS7a`: after the drop, the
consumer still treats `R_s` as *"the **complete** set of spaces that were remodelled"*.

Dropping an id makes `R_s` smaller. `WS7a` then licenses the consumer to assert that the dropped
space **was not remodelled**. That is the `M-11`/`P-5` falsehood arriving by a third route, and
unlike those two it is reachable without any authoring error — a `1.1` document read by a `1.0`
consumer is the designed-for case.

**Failure case, executed.** Suppose a later minor bump adds an id and `bi-16` is re-authored
`[kitchen, bathroom, <new>]`; or simply take today's `bi-16` `[kitchen, bathroom]` read by a
consumer that does not yet know `bathroom`:

| consumer's `R_s` | visitor *"주방만, 2천"* | relation | budget | class |
|---|---|---|---|---|
| `{kitchen, bathroom}` (current) | `R_s ⊋ Q_s` | row 4 `scope_superset` | **refused** | `scope_superset` |
| `{kitchen}` (id dropped) | `R_s == Q_s` | row 2 **`exact`** | **permitted**, `delta = −0.01` | **`exact`** |

The stale consumer calls a 19,800,000 kitchen-**and-two-bathrooms** job an exact match for a
kitchen-only 2,000만원 budget, and `WS7a` lets it add *"이 사례는 주방만 리모델링했습니다"*.

**Suggested fix.** One clause in `WS8`, and one in `WS7a`: *"A record from which the consumer dropped
an unrecognised `workScopeId` is **not closed**: `WS7a`'s closure holds only when every id in
`R.workScopeIds` was recognised. For such a record the scope criterion is `not_evaluable` and no
absence may be stated."* The consumer knows exactly when this happened — it is the id it just
dropped — so the check is free. Add it to `CINV-9`, which today asserts only that the record
survives.

---

### `Q-8` (MAJOR) · `PB6a` is not implementable and the determinism promise fails: four records come back `exact` with nothing to order them

**Rules.** `07:958-962` `PB6a`: *"A result produced from a `max` budget is ordered on the criteria
that still discriminate — **breadth, then scope, then area** — and never on price."* `07:948`
`PB6`'s stated purpose: *"the comparison predicate, **so that two consumers cannot disagree on one
document**."*

Each named key fails in the case `PB6a` is written for. **breadth** is an equality test — it
partitions, it does not order. **scope** yields a relation, not a magnitude, and for `Q = ∅` yields
nothing at all. **area** orders only when the visitor stated one. Round 4 raised this as `P-10`
(MINOR) and answered it at length in `Q-13`; neither was applied.

**Failure case, executed.** *"1억 이내로 전체 리모델링 하고 싶어요"* — `V.budget = max 100,000,000`,
`V.breadth = whole`, no area, no scope:

| record | total | breadth | scope | area | budget | class |
|---|---|---|---|---|---|---|
| `bi-09` | 50,000,000 | satisfied | n/a | n/a | `delta = 0` | `exact` |
| `bi-10` | 85,000,000 | satisfied | n/a | n/a | `delta = 0` | `exact` |
| `bi-11` | 30,000,000 | satisfied | n/a | n/a | `delta = 0` | `exact` |
| `bi-12` | 52,000,000 | satisfied | n/a | n/a | `delta = 0` | `exact` |
| `bi-13` | range 125–140M | satisfied | n/a | n/a | `delta = +0.25` | `price_fallback` |

Four records, one class, every `PB6a` key flat, and a result limit of 3 (`CINV-5`). Which three are
shown, and in what order, is undetermined. `PB4` forbids ordering on non-evaluable criteria,
`PB3a` forbids ordering by `perArea` unless both are derived, `LO1` forbids `location` and `PB6a`
forbids price — the contract forbids more ordering keys than it supplies and supplies no floor.

**Suggested fix** (round 4's `Q-13` recommendation, unchanged, plus `P-10`'s widening):

> **`PB6a`** — whenever `PB6` yields `delta = 0` for more than one record — the `max` shape, and any
> `range` budget with several records inside it — price is **not** a tie-break. Order such a result
> by, in sequence: (1) `EF6` class order as written; (2) `|delta_area|` ascending where the visitor
> stated an area and both records are `AR5`-comparable; (3) the count of the visitor's stated
> `workScopeIds` the record carries, descending; (4) `publishedAt` descending; (5) `id` ascending.
> Steps (4)–(5) are the deterministic floor. State that the cases shown are all within budget and
> are not ranked by price.

Add a `CINV` asserting that two runs over one snapshot produce one order.

---

### MINOR and NOTE

| id | sev | defect | where |
|---|---|---|---|
| `Q-M1` | MINOR | `GR5a`'s exemption is not scoped to the record the number describes: *"the value of a `pricing` field on **some record in the result**"*. Executed over the 19: `bi-09`'s total 50,000,000 ÷ `bi-11`'s 20평 = **2,500,000**, which is `bi-10`'s `perArea.amount`, and `bi-12`'s 52,000,000 ÷ 20평 = 2,600,000, which is `bi-05`'s authored `perArea` — so a fabricated per-area for `bi-09` passes `GR5`/`CINV-2` unflagged. `GR5` was widened in rev 4 precisely to catch cross-record arithmetic (*"the two operands need not come from the same record"*); `GR5a` removes that reach. Scope the exemption: *"…a field value **on the record the statement is about**."* | `07:1023-1029` vs `07:1014-1021` |
| `Q-M2` | MINOR | `EF5` is written as a two-branch total function ending *"Else `satisfied` iff `PB6`'s signed `delta ≤ 0`"*, but `PB6`'s different-currency case (`07:957`) yields no `delta` — it assigns `not_evaluable` from inside another rule. The state is right; `EF5`'s own text does not route to it. Add *"or `PB6` returns not-comparable"* to `EF5`'s second branch. | `07:818-821` vs `07:957` |
| `Q-M3` | MINOR | `EF4` has no place for `AR5`'s third clause. `PY1` (`07:228-232`) keeps V0's *"one unknown basis **lowers confidence**"*, and the three states cannot express it: an unknown basis does not make `AR5` refuse, so the criterion comes out plainly `satisfied`. A confidence signal that §14.3 claims to own end to end but cannot carry should either be dropped explicitly or given a home. | `07:815-817` vs `07:228-232` |
| `Q-M4` | MINOR | `EF2` says *"`satisfied` iff `R.projectType` equals **`V.breadth`'s wire value**"*, but §14.3.1 gives `V.breadth` the values `whole`·`partial` (`07:764`) and `projectType` the values `full_remodel`·`partial_remodel` (`07:127`). `whole` is not a wire value of anything. State the mapping. | `07:764` vs `07:802` |
| `Q-M5` | MINOR | `P-14` unapplied: §14.3.3 row 2's **relation** is `exact` (`07:834`) and `EF6` row 6's **class** is `exact` (`07:982`). They are different predicates — a row-2 record over budget is `price_fallback`. Rename the relation `scope_exact`. | `07:834` vs `07:982` |
| `Q-M6` | MINOR | `P-12` unapplied: `PB3a` still requires the area basis to be *"present, equal and not `"unknown"`"*. `AR2` forbids emitting the string and `platform/integration/contract.ts:96` `AREA_BASES = ["supply","exclusive"]` drops anything else, so the wire cannot carry it. Drop the third conjunct. | `07:932-933` |
| `Q-M7` | MINOR | `CINV-4` still asserts *"and the **`GR2` precedence order** is the one applied"*. Rev 5 deleted that list (`07:986-988`). The test now references a rule that does not exist; it should read *"`EF6`'s row order is the one applied"*, and should gain the totality assertion from `Q-1`. | `07:1092` |
| `Q-M8` | MINOR | `04:485` cites *"§14.3.2 row 3"* for `bi-17`'s `exact`; under rev 5 that is §14.3.3 **row 2**, and rev 5's row 3 is `scope_subset` — the citation now names the opposite outcome. `04:675` cites *"§14.3.2 row 5"* for `R_s ⊋ Q_s`; under rev 5 that is row 4. | `04:485`, `04:675` |
| `Q-M9` | MINOR | `04`'s header block contradicts itself: `04:6` *"status \| SPEC **rev 3**"*, `04:7` *"revision \| **rev 4** … realigned to contract rev 5"*. | `04:6-7` |
| `Q-M10` | MINOR | `05`'s Round-4 disposition (`05:463-476`) lists `P-1`…`P-6` and *"8 MINOR · 4 NOTE — All applied"* and **never mentions `D-1`…`D-7`**, round 4's seven cross-document findings, one of them MAJOR. Round 3's disposition listed its `D-1`…`D-8` explicitly (`05:395`). Findings that are not dispositioned are findings that survive — `D-1` and `D-2` below did. | `05:463-476` |
| `Q-N1` | NOTE | `VB3` (`07:777-780`) is a new `C: MUST` and appears in **no** change-log row of §20.3. It is a good rule — it is the only thing standing between `Q_s ≠ ∅` and an inferred `V.breadth` — but a rule that enters the contract unannounced is how `M-5` happened. | `07:777`, `07:1405-1413` |
| `Q-N2` | NOTE | §20's `BU4` row claims *"per-record budget evidence is now unit price / total / both / none"*. No rule in rev 5 states it: `GR2` requires the class plus the not-evaluable criteria list, which is a different thing. Either add the obligation to `GR2` or correct the row. | `07:1318` |
| `Q-N3` | NOTE | `P-18` unapplied: `WS1` (*"A source item that cannot be mapped to an id **without judgement** is omitted"*) is still a bare `P: MUST` under a fail-closed `VA1`, while `WS9` — the rule it pairs with — carries the AUTHORING label `M-8` created. | `07:313-315` |
| `Q-N4` | NOTE | `P-17` recurrence: `07:1415` asserts *"**Nothing in rev 5 relaxes a rule.**"* `EF3` relaxes the scope criterion for every `full_remodel` against every `Q`; §14.3.3 lost a row; rows 5–7 lost their disclosures. Three of the relaxations are deliberate and two are defects; the blanket sentence hides both. This is the **fourth** consecutive round in which the change log's summary line is wrong. | `07:1415-1418` |
| `Q-N5` | NOTE | After `P-6`'s propagation, `storage` is used by **no** record in the 19 and by none of the existing 8 (§19 moved `bi-01`'s 복도 붙박이장 to `built_in_furniture`). That is correct authoring, but it means `INV-17`'s handling of a Spaces id that is *declared and used* is exercised on 13 of the 14 Spaces ids and `storage` ships untested. One line in `04` §4 saying so would close it. | `04:629`, `07:1209` |
| `Q-N6` | NOTE | §14.3.3 rows 4–7 ignore `Q_t` entirely, so a visitor who named both rooms and trades gets a class computed only from the rooms. Every one of those rows is *not permitted*, so no budget harm follows and the cost is a less informative class. Worth one sentence saying it is intended. | `07:836-839` |

---

## C · Did the restructure lose anything rev 4 had right?

**Rule-id survival: no id disappeared silently, and one was retired as declared.** I enumerated
every rule id in rev 5 and checked it against rev 4's inventory as quoted in `10`.
`PT1`–`PT6`, `PY1`, `WS1`–`WS9`, `ST1`–`ST7`, `SD1`/`SD2`, `TP1`–`TP3`, `PA1`–`PA5`, `ND1`/`ND2`,
`D-1`/`D-1a`/`D-1b`/`D-1c`, `RD1`, `VA1`, `GC1`, `LO1`, `VB1`/`VB2`, `TI1`, `PB0`–`PB7`, `GR1`–`GR5`,
`RO1`/`RO2`, `INV-17`–`INV-29`, `CINV-1`–`CINV-17` all survive. **`PB1a` is the one retirement**, and
it is declared (`07:1402`, *"`PB1a` is folded into `EF4`"*); no normative text still invokes it — the
four remaining occurrences (`07:750`, `797`, `813-814`, `1341`, `1377`) are all history or
change-log. `GR5a`, `PB0a`, `EF1`–`EF6`, `VB3`, `CINV-18`, `CINV-19` are new; all but `VB3` are in
§20.3. **`INV-1`–`INV-29` and `RD1` are untouched**; I re-executed all four derived values and
`bi-13`'s correct non-derivation.

**Three things rev 4 had right that rev 5 damaged:**

1. **(MAJOR) §14.3.3 lost the disclosure requirement on three of its four "not permitted" rows.**
   Rev 4's table carried a disclosure on rows 4–7 (round 4's `P-5` quotes row 6's, and its `P-13`
   complained that only `scope_disjoint` lacked one). Rev 5's table (`07:833-839`) carries one on
   row 2 (*"the trades in `R_t \ Q_t` are disclosed"*), one on row 3 (*"reported as **not established
   for this case**"*) and a naming obligation on row 4 (*"the total bought extra spaces, **which are
   named**"*). Rows 5 (`scope_subset`), 6 (`scope_overlap`) and 7 (`scope_disjoint`) carry
   **nothing**. `CINV-17` (`07:1105`) still fixes the *wording* of a space disclosure, but no rule
   now *requires* one — so `bi-17` against *"거실이랑 방 바닥"* is refused a budget comparison and
   the visitor is told only a class token. `OD-P`'s *"never hide that a fallback case is not an exact
   match"* was the reason those cells existed. **Fix:** restore a disclosure cell on rows 5–7,
   worded per `CINV-17`: *"the spaces in `Q_s \ R_s` are reported as **not remodelled in this
   case**"*.
2. **(MAJOR) Round 4's `P-6`(c) was not fixed — `WS9` is byte-identical to rev 4.** `05:473` records
   `P-6` as *"Accepted. The rev-4 gloss is propagated"*, which is the (a) half. The (b) half — *"One
   record, one utterance, opposite budget verdicts from one authoring choice"* — needed one sentence
   in `WS9`, and `07:369-370` still reads *"its layout, its fixtures **or its built-in elements**
   changed"* against `07:287`'s *"Joinery built **inside** another space is `built_in_furniture`"*.
   For `bi-18`'s 복도 붙박이장 both authorings remain supported, and I re-executed their divergence:
   `[entrance, built_in_furniture]` gives *"현관이랑 복도 수납"* (`Q_s = {entrance, hallway}`) row 5
   `scope_subset`, budget **refused**; `[entrance, hallway, built_in_furniture]` gives row 2 `exact`,
   budget **permitted**. `04:681`'s expected answer depends on it. **Fix:** round 4's sentence,
   verbatim.
3. **(MAJOR, documentation) §20's change log still instructs an implementer to build the unamended
   `PR4`, and seven of round 4's twelve MINOR/NOTEs were not applied although `07:1413` says they
   were.** `07:1312` is still the exact sentence `M-10` and `P-7` were raised against; `07:1327`
   still says `CINV-1`–`CINV-11`. `P-10`, `P-12`, `P-13`, `P-14`, `P-17`, `P-18` are also unapplied
   (table in §A). §20 is what the producer and consumer teams build from, and `PB0` is the item
   §16 is about to send for consumer confirmation.

**Things rev 5 did **not** break, checked explicitly.** `PB6`'s 3 × 2 predicate table is unchanged
and I re-verified every cell including `max` × `range` straddling and shared-endpoint overlap. The
tier bands, `PB4`'s strong form, `PB2`, `PB3`, `PB3a`'s substance, `PB5`, `ST3`/`ST5`/`ST7`, `LO1`,
`GC1`, `VB1`/`VB2`, `RO1`/`RO2`, §3's `"1.0"` reasoning, §11's determinism, §12's validation table,
`GR1`, `GR4` and §17's deferrals are unchanged and remain consistent. `PB7` is strictly better than
rev 4: with the standalone precedence list gone, row order is the single authority and `P-8` cannot
recur. §19's worked example is now consistent with §7.3 and cites §14.3.3 row 4 correctly
(`07:1290`).

---

## D · The five questions §18 hands the reviewer

### `Q-14` — is every rule expressible in `EF1`'s three states, and is there an input for which some criterion gets **no** state or **two**?

**No criterion ever gets two states, and every criterion gets one for every input. The device holds.
What does not hold is everything downstream of it.** `EF2`–`EF5` are four if-else chains, each total
and each single-valued; I enumerated the input space (3 `projectType` values × `V.breadth` stated or
not × `Q` ∈ {∅, spaces only, trades only, both} × area stated or not × 3 budget shapes × record
price shapes) and found no gap and no overlap. `Q-M2` is the one seam and it is cosmetic.

**But three things that must have a value do not get one**, and all three are outside `EF1`:

- the **class** when `breadth` is `unsatisfied` — `EF6` has no row and `GR2`'s list has no member
  (`Q-1`);
- the **permission** when `Q = ∅` and the record is a partial — `PB1` delegates to a table that
  no longer has that row (`Q-2`);
- the **class** for a partial on a `GR3` rung, and the definition of *"a direct answer"* that decides
  whether any record is on one (`Q-5`).

So the answer to the question as asked is *yes, the three-state device is expressible and total*, and
the answer to the question behind it is *no, the function is not yet total*. The criteria were made
total; the class and the permission were not.

**Recommendation.** Finish the function rather than restructure again, and make totality
**machine-checked** rather than argued:

> `CINV-20` — `EF6` is total and single-valued. Enumerate all 3⁴ = 81 vectors of criterion states ×
> 3 `projectType` values × on-rung/not; every combination yields exactly one class from `GR2`'s
> closed list.

243 rows, one unit test, no fixtures needed. Three consecutive rounds found defects that this test
would have caught before the document was written, and it is the only thing in this review I would
call structurally necessary rather than merely correct.

### `Q-15` — is every class in `GR2`'s closed list reachable, and is any orphaned?

**All ten are reachable; none is orphaned; the list is missing one member.** Verified by execution,
one fixture each:

| class | assigned by | reached by |
|---|---|---|
| `exact` | `EF6` row 6 | `bi-09` vs §1's query (`CINV-13`) |
| `scope_superset` | `EF6` row 1 ← §14.3.3 row 4 | `bi-16` vs *"주방만"* |
| `scope_subset` | rows 3, 5 | `bi-14` vs *"주방이랑 욕실"* |
| `scope_overlap` | row 6; §14.3.3.1 row 3 | `bi-17` vs *"바닥이랑 도배만"* |
| `scope_disjoint` | row 7; §14.3.3.1 row 4 | `bi-15` vs *"주방만"* |
| `area_fallback` | `EF6` row 4 | `bi-13` (48평) vs *"34평 전체"*, `delta_area = +0.41` |
| `price_fallback` | `EF6` row 3 | `bi-10` (85M) vs *"예산 5천"*, `delta = +0.7` |
| `fallback_from_full` | `EF6` row 2 ← `GR3` | `bi-09` on the trade rung for *"바닥이랑 도배만"* |
| `unknown_type_fallback` | `EF6` row 2 ← `GR3` | **`bi-19`** on the trade rung — reachable, which `P-4` is about |
| `not_evaluable` | `EF6` row 5 | `bi-15` (no area) vs *"34평"*; `bi-01` (no total) vs *"예산 5천"* |

`P-9` is genuinely closed: every class now names its assigning row, and the two fallback classes are
named in the row that assigns them. **`unknown_type_fallback` is in a better place than in rev 4**,
because `EF6` row 2 precedes row 5, so a breadth-absent record on a rung gets the class that
describes it rather than the generic `not_evaluable`. **`not_evaluable` is the class most at risk of
over-use**: it absorbs every refused budget comparison, which under `Q-2` is every partial on every
open budget question.

**Recommendation.** Add `breadth_fallback` (`Q-1`), and leave the rest alone. Do not add a class for
the `Q-5` partial-on-a-rung case — restrict row 2 instead.

### `Q-16` — is `EF3`'s inference from `PT4`(b) sound, given that `PT4`(a)/(b) are authoring rules `VA1` cannot check?

**Two separate questions, and they have different answers.**

**(a) For `Q_t` the inference is unsound on the contract's own text, whatever the author does.**
`PT4`(b) is about spaces; §5.2 says *"nearly every whole-home remodel omits some trade"*; `WS7b`
makes an absent trade id *unknown*. `EF3` says `satisfied` for any `Q`. Fixed by `Q-3`'s split; this
part is not a judgement call.

**(b) For `Q_s` the inference is valid but the failure mode is wrong.** `PT4`(b) does entail that
every space the visitor named was remodelled — *if it holds*. It is unmachine-checkable by
construction (`07:186-191`), the two records that most need it are decided on prose (`bi-03`,
`bi-05`, §13), and `EF3` converts a single authoring mistake into `exact` — the strongest claim the
system can make — with no detection path anywhere: `VA1` cannot see it, `INV-29` checks only that
*some* Spaces id exists, and `WS7b` forbids the consumer from noticing the space is absent from the
id list.

That is the wrong direction for an unverifiable premise. But the remedy is **not** to weaken `EF3`
back to `not_evaluable` — that reinstates `P-3`, and the premise really is what `PT4`(b) asserts.

**Recommendation — state the ground, not the conclusion.** Add to `EF3` and to `PB0a`:

> When the scope criterion is `satisfied` for a `full_remodel` **by `PT4`(b)** rather than by
> `Q_s ⊆ R_s`, the reply states the ground and not the conclusion: *"이 사례는 집 전체를 리모델링한
> 사례입니다"*, never *"주방이 포함되어 있습니다"*. Where `Q_s ⊆ R_s` also holds, either may be
> stated.

On the 19 fixtures this costs almost nothing — `bi-09`'s ids already contain `kitchen` and
`bathroom`, so the direct statement survives for the headline query — and it means a `PT4`(b)
authoring error degrades to a true-but-general sentence instead of a false-and-specific one. It also
gives the operator a feedback channel: a visitor told *"집 전체를 리모델링한 사례"* about a job whose
bathroom got silicone and taps will say so.

### `Q-17` — is the `GR3` trade rung plus a stated total enough, or does the closed trade set need to be in V0.2?

**Enough for V0.2 — keep the deferral — but only once `Q-6` is fixed, and delete §14.3.3.1's first
row.**

The residual is a **recall** loss, not a correctness loss: the visitor reaches `bi-19`, is told
11,000,000 as a fact under `GR1`/`GR5a`, and is not told it fits their budget. `WS7b` genuinely does
leave a breadth-absent record's coverage unknown, so *"이 금액이면 됩니다"* would be asserting what
the document does not say. `07:862-873` states the limitation plainly and §17 defers it with the
reason written down. That is the right trade, and the alternative is a new authored field, a schema
change, a release cut and a consumer change for one fixture.

Two things should change anyway:

1. **Delete §14.3.3.1's first row** (`07:857`), or state the authoring shape that reaches it.
   `PT5` requires *"a bounded set of **spaces**"* for `partial_remodel`, so `R_s = ∅` is close to
   unauthorable; the row fires for no record in the 19 and for no record I can construct under `PT5`.
   Round 4 asked for one of the two and rev 5 did neither — it documented the emptiness while
   keeping the row. A rule that no input can reach will not be tested and will be wrong when
   something finally reaches it. Fold its case into the accepted-limitation paragraph.
2. **`Q-6`'s fourth `GR3` row** matters more than the trade set. Today the trade rung makes `bi-19`
   reachable for *"바닥이랑 도배만"* (verified) while an open *"2천만원으로 뭘 할 수 있나요"*
   reaches nothing.

### `Q-18` — is `PB0a` specific enough to implement twice, and is it enough to make ordering totals across categories honest?

**Not specific enough, and not sufficient — for two reasons, one of which is `Q-2`.**

**(a) It cannot be enough while `Q-2` stands.** `PB0a` is the compensating control for ordering
partials of different `category` values by price. Under `Q-2` no partial is ever in such an ordering:
executed at 2,000만원, the eligible set is five `full_remodel` records, all `category:
full-remodel` — so *"spans more than one `category` value"* is false and the clause fires only on
its second limb. The control is well-formed and the thing it controls does not currently happen.
Fix `Q-2` first, then this question becomes real.

**(b) The wording is under-specified in the one place it matters.** *"what that total bought, from
`R.projectType` and `R.workScopeIds`"* (`07:909-910`) hands the implementer the **whole** id array,
which mixes Spaces and Works, and `WS7b` makes the Works half open. An implementer who renders
`bi-16`'s `[kitchen, bathroom]` as *"주방과 욕실 공사를 포함합니다"* is fine; one who renders
`bi-10`'s `[…, windows, expansion, built_in_furniture]` as a coverage list has written a statement
whose completeness `WS7b` denies. And `CINV-17`'s wording convention — the one thing that stops
this being `M-11` again — is not cited by `PB0a`.

**Recommendation — make it a template, and give it the ordering clause it is missing:**

> **`PB0a`** — every record in such a result carries a coverage statement built **only** from:
> `R.projectType` (전체 / 부분 / *범위가 확인되지 않은 사례*); for a `partial_remodel`, `R_s` as the
> closed list of spaces **remodelled in that case** (`WS7a`, `CINV-17`'s wording); and `R_t` named
> as work **included**, never as a complete list (`WS7b`). No absence is stated for any trade, and
> none for a space except through `CINV-17`'s form. The statement is in the reply, not only in the
> envelope. **A result whose records' coverage differs is additionally ordered by `PB6a`'s
> sequence**, so that the order is reproducible and not merely disclosed.

The last sentence is the part `PB0a` is missing: putting the coverage on screen makes an ordering
*honest*, but `Q-8` shows it does not make it *reproducible*, and `PB0` is being sent for consumer
confirmation as an amendment to a rule whose whole purpose was to stop incomparable prices being
ordered.

---

## E · Cross-document checks

### E.1 · `04` rev 4 and `05` "Round 4" against contract rev 5

**Consistent, verified item by item.** `P-6`'s data propagation landed correctly: `04:139-141`
(`bi-10`) and `04:503-504` (`bi-18`) carry `built_in_furniture` with the reason; `04:629`'s id
inventory is re-derived (I re-counted: 17 used + 9 unused = 26 ✓, `storage` correctly moved to the
unused list); `04:647`'s coverage row `P6` now reads `R_s = {entrance}`, `R_t =
{built_in_furniture}` ✓; `07:1209`/`07:1243`'s §19 example matches. `04:667-681` §4.1 is restated
against `EF6` and its `bi-19` row (`04:679`) correctly describes the `GR3` trade rung, `GR5a` and
`PB5`. `04`'s §0.2 counts still match `07:681`. Nothing outside `04`, `07` §19, `05` and the
historical reviews referenced the old `storage` authoring — `platform/content/schema.ts:172` and
`platform/test/integration.test.ts:224` carry the 26-id **vocabulary**, which is unchanged, and no
code depends on which records use which id. **The re-authoring is clean.**

**Contradictions — each is a finding:**

| id | sev | contradiction |
|---|---|---|
| **D-1** | MAJOR | Round 4's `D-1` is **unfixed and undispositioned**. `04:653` (E5) still states *"also **bi-07 vs bi-11** (19/20평: authored 2.7M/평 vs derived 1.5M/평) \| same unit + basis, so **PB3-comparable**"*, and `04:167` still states that `bi-01` (authored 2,900,000/평) *"makes it a three-way 34평 comparison with three price shapes"*. `PB3a` (`07:929-934`) forbids both: `bi-07`'s and `bi-01`'s `perArea` are `authored`, so by `PA4` their price basis is unknown and the pairs may be displayed but **never compared or ordered**. `04` rev 4 claims to be realigned to rev 5. The surviving comparable pool is exactly `{bi-09, bi-10, bi-11, bi-12}` — 6 pairs — which still covers E5's and E6's headline pairs, so the fix is to correct `04`, not the contract. |
| **D-2** | MAJOR | `05`'s Round-4 disposition (`05:463-476`) records `P-1`…`P-6` and *"8 MINOR · 4 NOTE — All applied"*, and **omits `D-1`…`D-7` entirely**. Seven of round 4's cross-document findings were never dispositioned, and at least two (`D-1` above, `D-5` below) survive into rev 5 as a result. Round 3's disposition listed its `D-1`…`D-8` explicitly (`05:395`); the practice lapsed in exactly the round that needed it. |
| **D-3** | MINOR | Round 4's `D-5` unfixed: `04:36`, `04:41`, `04:88`, `04:179` and `04:648` still cite *"contract **rev 3**"* for `ST4`, `WS7c`, `PT4`(b) and the §13 counts, in a document whose header says it is realigned to rev 5. The facts still hold; the citations are two revisions stale, which is how `M-5` happened. |
| **D-4** | MINOR | `04:485` and `04:675` cite the **old section and row numbers** (*"§14.3.2 row 3"*, *"§14.3.2 row 5"*). Under rev 5 those are §14.3.3 rows 2 and 4; rev 5's row 3 is `scope_subset`, so `04:485`'s citation now names the opposite outcome from the one it asserts. (`04:531` was updated correctly and cites §14.3.3 — so this is an incomplete pass, not an unattempted one.) |
| **D-5** | MINOR | `04:6` says *"status \| SPEC **rev 3**"*; `04:7` says *"revision \| **rev 4**"*. |
| **D-6** | MINOR | `04:629` still expects *"hallway/balcony will come from bi-01/bi-05/bi-06 once the existing 8 are authored"*, but `07:1243`'s re-authored §19 example gives `bi-01` **no `hallway`** — its 복도 붙박이장 became `built_in_furniture`, and `data`'s `bi-01` scope has no other 복도 item. One of the two documents is wrong about where `hallway` enters the vocabulary. |
| **D-7** | NOTE | `04:681`'s *"현관 수납 → bi-18"* still resolves differently depending on whether the consumer's own alias table (`WS6`) maps 수납 to `built_in_furniture` or to `storage`: the first gives §14.3.3 row 2 `exact`/permitted, the second gives row 5 `scope_subset`/refused. That is legitimately the consumer's to decide, but `04` asserts an expected answer that depends on it and should say which mapping it assumes. |

### E.2 · Producer work list — unchanged from round 4

Rev 5 is **entirely consumer-side**: no wire shape, no vocabulary, no invariant and no `RD1`
constant moved, so `PORTFOLIO_SCHEMA_VERSION`, `PRODUCER_VERSION` and every golden constant stay
where they are. `05:485-492`'s five-item list is still the whole producer delta and none of it is
done: (1) `ST6`'s build warning (`emit.ts`, ~5 lines, the only code item); (2) `WS7a`'s rescoping in
`platform/content/schema.ts:283-284` and `platform/integration/validate.ts:299`, which still say the
whole set is closed — the falsehood `M-11`/`P-5` removed; (3) `INV-29`'s `PT4`(b) → `PT4`(c)
citation drift in `content/schema.ts:153`, `integration/contract.ts:63`,
`integration/validate.ts:307`; (4) the `bi-10`/`bi-18`/`bi-01` data re-authoring, now specified in
`04` rev 4 and `07` §19 but not yet in `data/`; (5) the provisional `VO6` `style` limit at
`contract.ts:119` and the Template Release ordering constraint. Add to it: `Q-7`'s `WS8` clause is
consumer-side, and `Q-1`'s `CINV-20` is a consumer test.
