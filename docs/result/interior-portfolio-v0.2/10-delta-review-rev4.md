# 10 — Delta review of Contract V0.2 **rev 4** against `08-delta-review-rev3.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `08`, `05`, `04`, `02` or `03`, and was given no preferred conclusion |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 4, 1349 lines) |
| checklist | `08-delta-review-rev3.md` `M-1`…`M-11` + MINOR-1…11 / NOTE-1…3; dispositions in `05-review-disposition.md` "Round 3" |
| also read | frozen V0 `03-integration-contract-v0-candidate.json`, `data/sites/boost-interior-demo/content/projects.json` (all 8 records, full bodies), `04-demo-data-spec.md` rev 3 (all 11 new records + the coverage matrix), `01-owner-decisions.md`, `07-producer-implementation.md`, and the producer code `platform/integration/{emit,validate,contract,sources}.ts` + `platform/content/schema.ts` |
| scope | **DELTA only** (§20.2's rev 3 → rev 4 change log). Rules rev 4 did not touch are not re-opened. |
| arithmetic | every figure below was executed in Python with exact integers / `Fraction`, not reasoned about. |

Short names: **`07`** = the contract under review · **`08`** = the rev-3 delta review · **`05`** = the
disposition · **`04`** = the demo-data spec · **`03`** = the frozen V0 JSON · **`data`** =
`data/sites/boost-interior-demo/content/projects.json`. All paths under
`/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 2 BLOCKER · 4 MAJOR · 8 MINOR · 4 NOTE.

Section A: of `M-1` … `M-11`, **9 CLOSED · 2 PARTIALLY CLOSED · 0 NOT CLOSED.** Every MINOR and NOTE
from round 3 is applied. I verified each against the live records and the 19 fixtures, never against
the change log.

Two things the counts do not say.

1. **The new text repeats the round-3 pattern exactly.** Of the six findings below, five live in
   text written after the last review saw the document, and four of them are the same defect class
   the brief named: *a rule that cannot be satisfied, contradicts another rule, or returns two
   answers for one input.* `P-1` is a rule that forbids the one output the contract exists to
   permit; `P-2` is a permission gate with no not-applicable branch, which `PB1a` and §14.3.2 row 1
   both have; `P-3` is `M-2`'s hole in a new dress.
2. **§14.3–§14.5 should be restructured, not patched again.** See the note at the end of §B.

Separately, and independent of any finding: **`07` cannot be frozen on its own terms.** Its status
line and §16 both say two items need consumer confirmation first (`PB0`, the `VO6` `style` limit),
and `PB0` is the rule §14.3's whole total-budget path now rests on. Until that confirmation exists,
`PR4` (frozen, consumer-confirmed) and `PB1`/`PB6` give opposite answers and the contract does not
say which governs in the interim.

---

## A · Are `M-1` … `M-11` closed by rev 4?

| id | verdict | rev-4 text checked, and against what |
|---|---|---|
| **M-1** `D-1c` had no enforcement point; `total ÷ area` forbidden nowhere | **CLOSED** (but the fix over-reaches — `P-1`) | `07:993-999` `GR5` now defines *"a **price amount** be any of `pricing.total.amount`, `total.minAmount`, `total.maxAmount`, a `pricing.perArea.amount`, or the visitor's budget amount"* and forbids *"the **quotient** of any price amount and any area"*. `07:1059` `CINV-2` carries the same enumeration and names the fixture: *"`bi-19` (11,000,000 ÷ 32평 = 343,750) must never appear"*. Executed: `11,000,000/32 = 343750` exactly — now forbidden. Every figure `08`'s M-1 table listed (`bi-16` 521,053; `bi-14` 178,571/㎡; `bi-13` 2,604,167 / 2,916,667; OD-K's 176,471) is covered by the same clause. The defect named is closed. The clause as written also forbids three legitimate numbers — **`P-1`**. |
| **M-2** §14.3.2's last row made `exact` unreachable for every `full_remodel` | **PARTIALLY CLOSED** | `07:853-858`: *"It does **not** classify a `full_remodel` or a breadth-absent record: those take **no** scope class from this table … `fallback_from_full` / `unknown_type_fallback` are assigned **only** by `GR3`'s ladder"*, and `07:974-979` `GR2` gains *"**A class is only in play if some rule assigned it.** … A precedence list orders classes that apply; it does not create them."* `CINV-13` (`07:1070`) fixtures §1's query against `bi-09`. I re-ran it: breadth ✓, area `|delta| = 0` ⇒ `strong` ✓, budget `delta = 0 ≤ 0` ✓, no scope stated ⇒ no scope class ⇒ **`exact`**. The named defect is closed. **But `exact` is still unreachable for a `full_remodel` whenever the visitor names *any* scope**, because `GR2:961` defines scope-satisfied as *"the `exact` row of §14.3.2"* and §14.3.2 does not classify fulls — **`P-3`**. |
| **M-3** the table was not a function (rows 1, 3, 6 matched at once) | **CLOSED** | `07:883` row 1's condition is now `Q = ∅` — *"the visitor named **no scope of any kind**"* — and `07:876-879` **`PB7`**: *"the rows below are evaluated **in the order written**, and the **first** row whose condition holds decides **both** the budget permission and the class."* `07:892` adds *"Rows 3–8 apply only when `Q_s ≠ ∅`"*. I enumerated the relation space: for `Q_s ≠ ∅` the five relations (`==`, `⊋`, `⊊`, incomparable-overlapping, disjoint) are covered by rows 3/4, 5, 6, 7, 8 and the table is **total**. One pair still overlaps — `R_s = ∅` satisfies both row 6 and row 8 — and `PB7` resolves it deterministically, so `M-3`'s defect is gone; the residue is that `PB7`'s order and `GR2`'s precedence rank those same two classes **oppositely** (`P-8`, MINOR). `CINV-14` (`07:1071`) fixtures the `Q = ∅` case. |
| **M-4** `PT4`(c)/`INV-29` rested on the undefined *"touched a space"* | **CLOSED** (with one residual case — `P-6`) | `07:361-365` `WS9`: *"**Author a `Spaces` id only when that space itself was remodelled** — its layout, its fixtures or its built-in elements changed. **A trade run *through* a space** … **is authored as the trade id alone.**"* `07:287` disambiguates `storage` — *"a **dedicated** storage space. Joinery built **inside** another space is `built_in_furniture`, not `storage`"* — and `07:303` fixes 조작 → **제작**. Run on `M-4`'s own acid case: re-flooring and re-papering a bedroom now authors `flooring`/`wallpaper`, never `bedroom`; `bi-19` is `[flooring, wallpaper, lighting]` deterministically and `INV-29` fails `full_remodel` with no judgement left. `04:583-588` carries the rule in `bi-19`'s authoring note. The 343,750-with-a-`derived`-badge path is closed. |
| **M-5** §13's stale *"Recorded caveat"* paragraph | **CLOSED** | `07:702-712`: *"`bi-05`'s summary says 전체 리모델링 and its body says the bathroom received 실리콘과 수전만. `PT4`(b) governs: … breadth is **not** established and `projectType` is omitted."* The rev-2 reasoning survives only as parenthesised history. Grepped the whole of §13 for the old sentence — gone. §13's row (`07:668`) and its counts (`07:673`, *"full 2 · partial 2 · absent 4"*) now agree with the closing paragraph. |
| **M-6** §14.3.2 dropped the trades the **visitor** named | **CLOSED** (but inert on the corpus — `P-4`) | `07:885` row 3 gains the `Q_t ⊆ R_t` conjunct; `07:886` row 4 is the failure case with the *"not established for this case"* wording (`CINV-17`, `07:1074`); `07:894-919` is the new §14.3.2.1. Re-ran `M-6`'s two cases: *"주방이랑 바닥 1천5백만원"* vs `bi-14` `[kitchen]` now gives `Q_t = {flooring} ⊄ R_t = ∅` ⇒ row 4 ⇒ `scope_subset`, **not permitted** (was `exact` at budget); *"2천만원으로 바닥이랑 도배만"* vs `bi-16` now gives §14.3.2.1's last row ⇒ `scope_disjoint`, not permitted (was budget-matched). Both harms are closed. |
| **M-7** `PB1a` required `acceptable`, excluding a perfect match | **CLOSED** | `07:763-766` `PB1a`: *"in the `strong` **or** `acceptable` tier of §14.3.1 — the same wording `GR2` uses, so the two cannot disagree"*. `GR2:960` reads *"comparable under `AR5` and in the `strong` or `acceptable` tier"* — verbatim identical. `bi-09` at `\|delta_area\| = 0` now passes both. |
| **M-8** unevaluable `P: MUST`s under a fail-closed `VA1` | **CLOSED** | `07:186-191`: *"(a) and (b) are **AUTHORING rules — not machine-checked, not `VA1` conditions** … (c) **is** a `VA1` condition, as `INV-29`. The same split applies to `PT5`, `PT6` and `ST2`."* Confirmed in each rule head: `PT5` `07:193`, `PT6` `07:197`, `ST2` `07:402`. Cross-checked the producer: `07-producer-implementation.md` §2.4 *"No PT4 in code"*, and `platform/content/schema.ts:364-371` enforces only `INV-28`/`INV-29`. Consistent. |
| **M-9** `perArea.source` read by no §14 rule; unknown- and known-basis prices pooled | **CLOSED** | `07:780-798` **`PB3a`**: *"a **comparative claim** … requires that **both** prices have a **known price basis** and that the two bases are the same. By `PA4`/`PA5` that means both carry `source: "derived"` …  Otherwise the two amounts **may be displayed as facts and may not be compared or ordered**"*. `PA5` (`07:480-485`) now says *"This is what `PB3a` reads"*, so the inert definition has a referent. `CINV-16` (`07:1073`) fixtures `bi-01` vs `bi-09`. Computed the surviving pool over all 19: exactly `{bi-09, bi-10, bi-11, bi-12}` (all derived, `full_remodel`, KRW, `pyeong`, `supply`, `category: full-remodel`) — 6 comparable pairs, so the rule is not vacuous. `04` still claims two comparisons the rule now forbids (§E.1). |
| **M-10** `PR4` declared "kept" while totals were ordered across categories | **PARTIALLY CLOSED** | `07:741-749` **`PB0`** declares the amendment, and `07:1094` puts it on §16's consumer-confirmation list with *"not in force until the consumer confirms it"*. That is the substance of the fix, and it is right. **But the text `M-10` actually quoted is still there**: `07:1274`, §20's V0 change log, still reads *"\| `PR4` \| **kept**, and `PB3` adds a same-`projectType` condition on top of it \|"* — no mention of `PB0`, no mention that the condition is replaced for `pricing.total`. `M-10`'s complaint was *"declared 'kept' in full"* in exactly that table. An implementer reading §20 still builds the unamended rule. **`P-7`** (MINOR). Two further defects in `PB0`'s own new text: **`P-2`** and the disclosure it cites but that no rule requires (`P-2`b). |
| **M-11** `WS7a` closed over works, which `WS1`/`WS9` cannot achieve | **CLOSED** (the same falsehood now reachable on the other axis — `P-5`) | `07:328-338` `WS7a` is scoped: *"`workScopeIds ∩ Spaces` is **closed**"*, with `WS7b` making works open *"even for a partial"* and the `bi-14` tiling example spelled out. `07:1250-1255`, the §19 worked example, is updated to match (*"the **works** it ran are open … so nothing here may be stated as *not* included"*), and `04:624` records the same. The `"타일 공사는 포함되어 있지 않습니다"* falsehood is closed. |

**MINOR-1…11 / NOTE-1…3:** all 14 verified applied. `Q` defined (`07:868`); row 1's not-evaluable
listing corrected (`07:883`); the **area** delta given its own divisor (`07:834-838`,
`delta_area = (r − v)/v`); `PB6`'s range×range cell now signed (`07:823`); `total.kind` unknown ⇒
`pricing.total` absent (`07:646-649`); 제작 가구 (`07:303`); `WS7c`'s unsupported `bi-02`/`bi-08`
illustration replaced by the *"Cost, stated plainly"* paragraph (`07:348-355`); `ST6` cites `VO2`/`VO3`
and gains *"P: SHOULD warn at build"* (`07:412-417`); §20.1's three mis-describing rows fixed
(`07:1303`, `07:1304`, `07:1308`); §17's `workScopeIdsExcluded` restated (`07:1116-1117`); `PB6a`
added (`07:799-804`). One stale row survives: `07:1289` still says *"`CINV-1`–`CINV-11` added"* when
the list now runs to `CINV-17` (`P-7`).

---

## B · Findings

### `P-1` (BLOCKER) · `GR5`/`CINV-2` forbid the assistant from stating the producer's own derived per-area price, and the record's own total, on three of the four derived fixtures

**Rules.** `07:993-1002` `GR5` (`C: MUST, output`), rewritten in rev 4 for `M-1`:

> let an **area** be any area appearing in, or derivable from, the result … and let a **price
> amount** be any of `pricing.total.amount`, `total.minAmount`, `total.maxAmount`, a
> `pricing.perArea.amount`, or the visitor's budget amount. Then no number in the assistant's reply
> equals the **product** of any `perArea` and any area, nor the **quotient** of any price amount and
> any area. **The two operands need not come from the same record.**

`07:1011-1013` then asserts: *"Nothing legitimate is lost. The one per-area figure a visitor may be
told is the producer's own `perArea`, computed under `D-1`'s five conditions, and `GR4` releases it
exactly when they ask for it."* That sentence is false, and `CINV-2` (`07:1059`) turns it into a test
that a **correct** implementation fails.

**Failure case, computed on the required fixtures** (`04` §1; `RD1` executed, cross-checked against
`Fraction` ROUND_HALF_UP):

| record | total | area | `D-1` derived `perArea` | `total ÷ area` | `perArea × area` |
|---|---|---|---|---|---|
| `bi-09` | 50,000,000 | 34평 | 1,470,588 | 1,470,588.235… | 49,999,992 |
| **`bi-10`** | **85,000,000** | **34평** | **2,500,000** | **2,500,000 — exact** | **85,000,000 — exact** |
| **`bi-11`** | **30,000,000** | **20평** | **1,500,000** | **1,500,000 — exact** | **30,000,000 — exact** |
| **`bi-12`** | **52,000,000** | **26평** | **2,000,000** | **2,000,000 — exact** | **52,000,000 — exact** |

Take the one exchange `GR4` exists to enable. Visitor: *"34평 전체 리모델링 평당 얼마예요?"* — a
per-area question, so `GR4` (`07:984`) releases `bi-10`'s `pricing.perArea.amount = 2,500,000`, the
producer's own `source: "derived"` value, emitted under all five `D-1` conditions. The reply *"평당
250만원입니다"* contains a number that **equals the quotient of a price amount
(`total.amount = 85,000,000`) and an area (`property.area.value = 34`, also in the title *"34평
확장·창호 교체 포함 전체 리모델링"*)**. `GR5` forbids it. `CINV-2` fails. Three of the four derived
fixtures behave this way, and it is not a coincidence: `D-1` **is** `total ÷ area`, so its output
collides with `GR5`'s quotient clause whenever the division is exact or rounds to the same integer.

The product half bites in the same exchange and on the same three records: once `perArea` is in the
envelope, *"총 공사비는 8,500만원이었습니다"* — `pricing.total.amount`, a fact `GR1` (`07:946`)
explicitly authorises and the one number a budget conversation is about — equals
`perArea × area = 2,500,000 × 34`. So on `bi-10`, `bi-11` and `bi-12` the contract forbids stating
**either** price once the visitor asks about per-area pricing. (The product clause is rev-3 text, but
rev 4 rewrote `GR5` wholesale and added the "nothing legitimate is lost" claim, so both halves are in
delta scope. Note that `08`'s own `N-8` disposition had already recognised this arithmetic for
`INV-22` — *"1,000,000 × 34 = 34,000,000 … fails on honest data"* — and restated `INV-22` as a
metamorphic test. Nobody applied the same correction to `GR5`.)

**Suggested fix (one clause, no envelope change).** `GR5` is meant to stop the model **computing** a
figure the producer refused to emit, not to stop it repeating one the producer did emit. Add:

> This invariant applies only to numbers that are **not** themselves a field value carried by the
> model-facing result. A `pricing.perArea.amount` or a `pricing.total.amount` present in the result
> may always be stated as that record's own fact (`GR1`); it is the *computed* figure that is
> forbidden.

`bi-19`'s 343,750 stays forbidden — no field in any result carries it — which is the whole point of
`M-1`. `CINV-2` takes the same exemption, and keeps its `bi-19` fixture; add `bi-10` as the positive
fixture (2,500,000 and 85,000,000 must both be statable).

---

### `P-2` (BLOCKER) · `PB1` gives breadth no "not stated ⇒ not applicable" branch, so an ordinary open budget question can be answered only from `partial_remodel` records — and `PB0`'s cross-category safeguard cites a disclosure no rule requires

**Rules.** `07:757-762` `PB1` (`C: MAY`):

> compare a visitor's **total** budget against `pricing.total` only when the record's `projectType`
> is present and the relevant branch permits it:
> - `full_remodel`, **and the visitor asked about whole-home work**, and the **area condition** below is met;
> - `partial_remodel`, and the **scope condition** of §14.3.2 permits it.

`07:766-770` `PB1a` supplies the missing branch for **area** — *"If the visitor **stated no area**,
the condition is **not applicable** — not failed … *A visitor who says only "예산 3천으로 전체
리모델링 되나요?" must still get an answer.* The same applies to the scope condition when the visitor
named no scopes."* — and §14.3.2 row 1 (`07:883`) supplies it for **scope**. **Neither exists for
breadth.** *"the visitor asked about whole-home work"* is a bare positive requirement.

**Failure case (live fixtures, ordinary utterance).** *"5천만원 정도 예산인데 어떤 사례들이
있나요?"* — no breadth, no area, no scope. `PT1`'s own note (`07:140-141`) says the consumer's
visitor-intent state carries an explicit `unknown` for breadth, so the `full_remodel` branch's
condition is **false**:

| record | `projectType` | total | eligible under `PB1`? | `PB6` delta vs 50,000,000 | class |
|---|---|---|---|---|---|
| `bi-09` | full | 50,000,000 | **no** — visitor did not ask about whole-home work | — | not a budget match |
| `bi-12` | full | 52,000,000 | **no** | — | not a budget match |
| `bi-16` | partial | 19,800,000 | yes (row 1, `Q = ∅`) | −0.604 ⇒ satisfied | `exact` |
| `bi-17` | partial | 12,500,000 | yes | −0.75 ⇒ satisfied | `exact` |
| `bi-14` | partial | 15,000,000 | yes | −0.70 ⇒ satisfied | `exact` |
| `bi-15` | partial | 7,000,000 | yes | −0.86 ⇒ satisfied | `exact` |
| `bi-18` | partial | 6,200,000 | yes | −0.876 ⇒ satisfied | `exact` |
| `bi-19` | absent | 11,000,000 | no (`projectType` absent) | — | `PB5` reference |

A visitor with 5,000만원 is shown five small partials as **exact budget matches** and the one
5,000만원 whole-home case — the single best answer in the corpus, `delta = 0` — as not a budget match
at all. That is a wrong answer produced by following the rule, and it hits the product's headline
use case, which OD-E and OD-O both describe as budget-to-total matching.

**(b) The same rule's cross-category safeguard does not exist.** `PB0`'s third bullet (`07:748-749`)
says: *"wherever a total-based comparison or ordering spans more than one `category` value, the
disclosure §14.3.2 and `GR3` already require must name **what each total covered**."* I grepped every
occurrence of "disclos" in `07` (lines 749, 824, 885-889, 905, 913). §14.3.2's disclosures attach to
**rows 3–7**; **row 1 — the open-request row, the exact case `PB0` is worried about — requires no
disclosure at all** (*"class: none. Scope was not a stated criterion"*). Row 8 (`scope_disjoint`)
also has none. `GR3`'s disclosure is about the fallback ladder. So the table above orders
`bi-16` (`kitchen-bath`), `bi-17`, `bi-18` (`partial-remodel`) and `bi-14`, `bi-15` (`kitchen-bath`)
by price delta across three `category` values with **no** disclosure of what each total covered —
which is the exact behaviour `M-10` raised and the exact behaviour `PB0` is the consumer-confirmation
event for. `PB0` is being sent to the consumer for confirmation resting on a safeguard that is not in
the document.

**Suggested fix.** (i) Give `PB1` the branch its two siblings have: *"If the visitor **stated no
breadth**, the breadth condition is **not applicable** — not failed: the comparison proceeds and
`breadth` is listed among that record's not-evaluable criteria (`GR2`), so the record cannot be
`exact` but is budget-comparable."* That keeps `PB5` intact (breadth-**absent records** are still
excluded — that is a different fact) and restores `bi-09`. (ii) Make `PB0`'s third bullet normative
instead of a citation: *"a total-based comparison or ordering that spans more than one `category`
value MUST state, per record, what its total covered — its `projectType` and, for a partial, its
`workScopeIds ∩ Spaces`."* Add a `CINV` for it.

---

### `P-3` (MAJOR) · `GR2` defines scope-satisfaction only through §14.3.2, which no longer classifies fulls — so `exact` is still unreachable for a `full_remodel` whenever the visitor names a space

**Rules.** `07:955-962` `GR2`, "Satisfied, for the purpose of `exact`", fourth bullet: *"*scope*: the
`exact` row of §14.3.2."* `07:853-855`: §14.3.2 *"does **not** classify a `full_remodel` or a
breadth-absent record: those take **no** scope class from this table."* `07:963-966`: *"A criterion
that could not be evaluated … makes the class something other than `exact`, whatever else matched."*

For a `full_remodel` record and a visitor who named a space, the scope criterion is **stated** and
has **no evaluation rule**, so it lands on the not-evaluable list and `not_evaluable` (which
precedes `exact` in `07:969-971`) wins.

**Failure case.** *"34평 전체 리모델링 하려는데 주방이랑 욕실이 제일 중요해요, 예산 5천"* against
`bi-09` (`full_remodel`, `workScopeIds [entrance, living_room, kitchen, bedroom, bathroom, flooring,
wallpaper, lighting]`, 34평 supply, exact 50,000,000; `04:95`). Breadth ✓, area `|delta| = 0` ⇒
`strong` ✓, budget `delta = 0` ⇒ satisfied ✓, and the record's own ids **contain both spaces the
visitor named**. Class: `not_evaluable`. This is `M-2`'s defect with one extra clause in the
utterance, and `CINV-13` does not catch it — it fixtures only the no-scope query.

Two conforming consumers will also differ here, because a reasonable implementer will simply decide
that a `full_remodel` covering the named spaces satisfies scope, and the contract does not say so.

**Suggested fix.** Add a fifth bullet to `GR2`'s "Satisfied": *"scope, for a `full_remodel` or
breadth-absent record: satisfied when `Q_s ⊆ R_s`; otherwise **not evaluable**, never failed —
`WS7b` makes an absent space id *unknown*, so a present id is a fact and an absent one is not an
exclusion. §14.3.2's **classes** remain partial-only."* That is sound in the safe direction and
changes nothing else.

---

### `P-4` (MAJOR) · §14.3.2.1 fires no positive row on any of the 19 fixtures, and `GR3`'s ladder is keyed on spaces — so the trade-only utterances the section was written for have no path to the one record that answers them

**Rules.** `07:894-907` §14.3.2.1, *"still only for a `partial_remodel` record"*; `07:980-983` `GR3`,
whose third rung is *"`full_remodel` or breadth-absent cases that contain the requested **spaces**"*.

**Computed over all 19 records.** §14.3.2.1's first row — `Q_t ⊆ R_t` **and** `R_s = ∅` ⇒ `exact`,
**permitted** — is the only row that permits a budget comparison. It requires a `partial_remodel`
with **no Spaces id at all**. The partials in the corpus are `bi-04` `[kitchen, bathroom]`, `bi-06`,
`bi-14` `[kitchen]`, `bi-15` `[bathroom]`, `bi-16` `[kitchen, bathroom]`, `bi-17`
`[living_room, flooring]`, `bi-18` `[entrance, storage]` — **every one has `R_s ≠ ∅`**. The row is
unreachable on the fixture set it was written against. Worse, `PT5` (`07:193-195`) qualifies
`partial_remodel` on *"a **bounded set of spaces** the project covered"*, so the shape the row needs
is close to unauthorable in general.

**Failure case — §7.3's own example utterance.** *"2천만원으로 바닥이랑 도배만"*
(`Q_s = ∅`, `Q_t = {flooring, wallpaper}`):

| record | `R_t` | §14.3.2.1 row | budget |
|---|---|---|---|
| `bi-14`, `bi-15`, `bi-16`, `bi-18` | ∅ | `R_t ∩ Q_t = ∅` ⇒ `scope_disjoint` | not permitted |
| `bi-17` | `{flooring}` | `Q_t ⊄ R_t`, intersect ⇒ `scope_overlap` | not permitted |
| **`bi-19`** | `{flooring, wallpaper, lighting}` — **the exact job, 11,000,000, under budget** | **not classified: `projectType` is absent** | **not permitted (`PB1`)** |

`bi-19` did exactly those trades across a whole 32평 flat for 11,000,000 — the best possible answer —
and it is locked out, not by scope but by its breadth-absence, which `PT4`(c) gave it *because* it
ran only trades. The section written for trade-only requests and the record that is a trade-only job
can never meet. *"조명만"* is the same, with every partial `scope_disjoint`.

Nothing returns literally zero **records** (`GR3` still offers references), so `TI1` (`07:848`) is not
violated on its letter. But `GR3`'s rung 3 is keyed on *"the requested **spaces**"*, and for a
trade-only request `Q_s = ∅`, so *"contains the requested spaces"* is **vacuously true for every
record** — the ladder admits `bi-09` (a 50,000,000 whole-home remodel) on exactly the same footing as
`bi-19`, with no rule preferring the record that actually did the trades. An ordinary
*"바닥이랑 도배만"* gets a fallback list headed by whole-home remodels. `04` §4.1's own expectation —
*"32평인데 도배랑 바닥만 얼마예요 → bi-19"* — survives only as a `GR1` statement of fact plus a `PB5`
label.

**Suggested fix.** (i) Extend `GR3`'s rungs to trades: *"…cases whose `workScopeIds` contain the
requested spaces **or, when the visitor named only trades, the requested trades**, preferring a
record whose `R_t ⊇ Q_t`."* (ii) Either delete §14.3.2.1's first row as unreachable, or state the
authoring shape that reaches it. (iii) `CINV-15` currently only asserts the negative (*"must not be
budget-matched against `bi-16`"*); add the positive — that *"바닥이랑 도배만"* surfaces `bi-19` ahead
of every `full_remodel`.

---

### `P-5` (MAJOR) · `WS9`'s new authoring rule makes `R_s` no longer "the spaces the total covers", while `WS7a` still declares it closed — `M-11`'s statable falsehood, moved from works to spaces

**Rules.** `07:361-365` `WS9` (new in rev 4): *"**A trade run *through* a space** — new flooring, new
wallpaper, a new ceiling light — **is authored as the trade id alone.**"* `07:328-332` `WS7a`
(`P: MUST`, `C: MAY rely on`): *"`workScopeIds ∩ Spaces` is **closed**: it is the complete set of
**spaces** the `pricing.total` covers."* `07:909-914`: *"an absent space id means the total did not
buy that space … a missing space is a fact and downgrades by itself."*

The two cannot both be true once `WS9` says a space that received only a trade is not authored as a
space. `WS9` guarantees that some spaces the total **did** buy work in are absent from `R_s`;
`WS7a` then licenses the consumer to assert they were not bought.

**Failure case (`04`'s own record).** `bi-17`, `partial_remodel`, `workScopeIds
[living_room, flooring]`, exact 12,500,000 (`04:456-461`). Its body: *"바닥은 기존 마루를 걷어내고
밝은 오크 톤 강마루를 **거실부터 방까지 이어 깔았습니다**"* — the 12,500,000 bought new flooring in
the bedrooms. Under `WS9` the bedrooms received only a trade, so `bedroom` is correctly **not**
authored. Visitor: *"거실이랑 방 바닥 새로 하려는데"* ⇒ `Q_s = {living_room, bedroom}`,
`Q_t = {flooring}`. §14.3.2 row 6: `R_s = {living_room} ⊊ Q_s` ⇒ `scope_subset`, *"disclosure"*, and
under `WS7a` the consumer may state *"이 사례에는 침실이 포함되지 않았습니다"*. **False** — the
bedrooms got new flooring, which is precisely what the visitor asked about.

This is `M-11` on the other axis, and it is newer: before `WS9` an author who took *"touched a
space"* broadly would have written `bedroom` and the claim would have been true.

**Suggested fix.** Scope the closure to what `WS9` actually guarantees: *"`WS7a` — `workScopeIds ∩
Spaces` is the complete set of spaces whose **own** layout, fixtures or built-in elements the
`pricing.total` bought. It does **not** exclude trade work in other spaces: a space absent from
`R_s` may still have received a trade in `R_t`. A disclosure names an absent space as **not
remodelled in this case**, never as **not included in this price**."* §14.3.2.1's second row
(`07:905`) needs the same wording, and `CINV-17`'s "not established" convention should be extended to
the space side.

---

### `P-6` (MAJOR) · rev 4's `storage` / `built_in_furniture` gloss was not propagated: it re-classifies `bi-10`, `bi-18` and the contract's own §19 worked example, and `WS9` leaves one case with two answers and opposite budget permissions

**Rules.** `07:287` (new in rev 4): *"`storage` \| 창고, 팬트리가 아닌 수납 공간 — a **dedicated**
storage space. Joinery built **inside** another space is `built_in_furniture`, not `storage`"*.
`07:361-362` `WS9`: author a Spaces id *"only when that space itself was remodelled — its layout, its
**fixtures or its built-in elements** changed"*.

**(a) Three authored sets are now wrong, in three documents that claim to be aligned.**

- `04:502` `bi-18` is `[entrance, **storage**]`, and its body (`04:522`) is *"**복도** 한 면에는 …
  **붙박이장**을 짜 넣고"* — joinery inside the 복도. Under `07:287` that is `built_in_furniture`,
  not `storage`. `04` rev 3's own header says *"No record's data changed"*, so the record was never
  re-checked against the gloss that rev 4 added for it.
- `04:139` `bi-10` carries `storage` for *"거실과 복도 벽면 수납장"* (`04:160`) — same reclassification.
- `07:1205`, the contract's **own §19 worked example**, gives `bi-01` `workScopeIds [... "storage"]`
  and declares `storage` in the document-level `workScopes` (`07:1171`). `bi-01`'s source (`data`)
  is *"복도 붙박이장"* / *"주방 키큰장"* — joinery inside other spaces. The worked example
  contradicts §7.3 two hundred lines above it.

**(b) The consequences are not cosmetic.** `04:644`'s coverage row `P6` (*"`entrance` + `storage`"*)
is then covered by **no record**, and `04:626`'s vocabulary list is wrong. More importantly `R_s`
changes, and `R_s` decides budget permission.

**(c) One case now has two answers.** For `bi-18`'s 복도 붙박이장, `WS9` says a space is authored when
*"its built-in elements changed"* — which just happened — while `07:287` says the joinery itself is
`built_in_furniture`. Both readings are supported by rev-4 text:

| reading | `bi-18` `workScopeIds` | `R_s` | *"현관이랑 복도 수납"* (`Q_s = {entrance, hallway}`) | budget |
|---|---|---|---|---|
| A — joinery is a work, the space is unchanged | `[entrance, built_in_furniture]` | `{entrance}` | row 6, `R_s ⊊ Q_s` ⇒ `scope_subset` | **not permitted** |
| B — the 복도's built-in elements changed, so author it too | `[entrance, hallway, built_in_furniture]` | `{entrance, hallway}` | row 3, `R_s == Q_s`, `Q_t ⊆ R_t` ⇒ `exact` | **permitted** |

One record, one utterance, opposite budget verdicts from one authoring choice — which is `M-4`'s
defect in its remaining corner. `04` §4.1's *"현관 수납 → bi-18"* depends on it.

**Suggested fix.** One sentence in `WS9`: *"Joinery built inside another space is authored as
`built_in_furniture`; it does **not** by itself make that space's id authorable — a Spaces id
requires that the space's own layout or fixtures changed. `storage` is only ever a dedicated storage
room."* Then correct `07:1205`/`07:1171` (`bi-01`: `storage` → `built_in_furniture`), `04:139`,
`04:502`, `04:626` and `04:644`.

---

### MINOR and NOTE

| id | sev | defect | where |
|---|---|---|---|
| `P-7` | MINOR | §20's V0 change log still reads *"\| `PR4` \| **kept**, and `PB3` adds a same-`projectType` condition on top of it \|"* — no `PB0`, no "replaced for `pricing.total`". This is the sentence `M-10` was raised against. The same table says *"`CINV-1`–`CINV-11` added"* when the list now runs to `CINV-17`. | `07:1274`, `07:1289` |
| `P-8` | MINOR | `PB7`'s row order and `GR2`'s class precedence rank the same two relations **oppositely**, on a reachable input. With `R_s = ∅` and `Q_s ≠ ∅`, rows 6 and 8 both hold; `PB7` (first row wins) gives `scope_subset`, while `GR2`'s precedence (`scope_disjoint` → `scope_subset`) would give `scope_disjoint`. `PB7` decides first so no contradiction escapes, but two orderings of one relation pair with opposite priorities will be implemented inconsistently. Say which is authoritative, or make row 8 precede row 6. | `07:876-890` vs `07:969-971` |
| `P-9` | MINOR | `GR2`'s new sentence *"**A class is only in play if some rule assigned it.**"* (added for `M-2`) leaves `price_fallback`, `not_evaluable` and `exact` with no named **assigning** rule — only a stated meaning — and `GR3` (`07:980-983`) never uses the words `fallback_from_full` or `unknown_type_fallback` that `GR2` says it alone assigns. Every class is still reachable (I checked all ten), but three of them are assigned by a definition and two by an unnamed mapping. Add *"assigned by this rule"* / name the two classes in `GR3`'s rungs. | `07:974-979` |
| `P-10` | MINOR | `PB6a` names only the `max` shape, but `PB6`'s table gives `delta = 0` for **every** record inside a `range [a,b]` budget too — *"600~800만원"* ties `bi-15` (7,000,000) with any other record in the band exactly as *"1억 이내"* does. The rule should read *"whenever `PB6` yields `delta = 0` for more than one record"*. | `07:799-804` vs `07:820-824` |
| `P-11` | MINOR | `PB1a` reads unconditionally (*"if the visitor **stated an area** … otherwise the record is `area_fallback` and **is not a budget match**"*) but `PB1`'s **partial** branch does not invoke it, and `PT2` says a partial's `property.area` is *"**not** the area the price bought"*. So it is undefined whether *"34평인데 주방만 1천5백"* may be budget-compared against `bi-14` (84㎡ **exclusive**, `AR5`-incomparable). Scope `PB1a` to the `full_remodel` branch explicitly, or say the partial branch applies it too. | `07:763-770` |
| `P-12` | MINOR | `PB3a` requires each area basis to be *"present, equal and **not `"unknown"`**"*. `AR2` forbids emitting the string, `contract.ts:96` `AREA_BASES = ["supply","exclusive"]` and `emit.ts` drops any other value, so the wire never carries `"unknown"`. The clause describes a value that cannot reach the consumer and invites an implementer to look for it. Drop the third conjunct. | `07:783-784` |
| `P-13` | MINOR | §14.3.2 row 8 (`scope_disjoint`) is the only not-permitted row with **no** disclosure requirement, while rows 4–7 all carry one. A visitor told nothing about why a case was dropped is the `GR3`/OD-P failure in miniature. | `07:890` |
| `P-14` | MINOR | §14.3.2 row 3's **class** is named `exact`, the same token as `GR2`'s overall "every stated criterion satisfied" class. They are different predicates (a row-3 record over budget is `price_fallback`), and the collision is resolved only by reading `GR2`'s precedence. Rename the scope class `scope_exact`. | `07:885` vs `07:963` |
| `P-15` | NOTE | `GR3`'s ladder runs only *"with no exact case"*, and `GR2` now says the two fallback classes come only from that ladder — so in a mixed result that **does** contain an exact partial, a `full_remodel` returned alongside cannot be labelled `fallback_from_full`, the class that exactly describes it; it falls to `not_evaluable`. OD-P (*"must never hide that a fallback case is not an exact match"*) is weakened at the margin. | `07:974-983` |
| `P-16` | NOTE | A perfect scope match with no price — `bi-04` `[kitchen, bathroom]`, no `pricing` at all — is classed `not_evaluable` under `GR2`'s precedence, the same class as a record that matched nothing evaluable. `PB4`'s per-criterion counts are the only thing that distinguishes them. Worth one line saying that is intended. | `07:969-972` |
| `P-17` | NOTE | §20.2 closes *"**Nothing in rev 4 relaxes a rule.**"* `M-11`'s fix **does** relax `WS7a` (a `P: MUST` closure over works is withdrawn, and a `C: MAY rely on` entitlement with it) and the `M-2` fix restores a budget permission rev 3 denied. Both relaxations are correct; the blanket sentence is not, and this change log's accuracy has been a finding in two consecutive rounds (`MINOR-9`/`-10`/`-11`). | `07:1346-1348` |
| `P-18` | NOTE | `WS1` (*"A source item that cannot be mapped to an id **without judgement** is omitted"*) is still a bare `P: MUST` although it is the same kind of prose judgement `M-8` relabelled in four places, and `WS9` — the rule it pairs with — carries the label. Not raised as a finding because rev 4 did not touch `WS1`; flagged so the next pass does not have to rediscover it. | `07:313-315` |

---

### On structure, not patches

§14.3–§14.5 has now been rewritten in rev 2, rev 3 and rev 4, and **each round's fix created the next
round's defect**: `N-4`/`N-5`'s fix produced `M-2`/`M-3`/`M-6`; `M-2`/`M-6`'s fix produced `P-3` and
`P-4`; `M-10`'s fix produced `P-2`. That is not bad luck. One function — *(visitor intent, record)
→ (budget permission, match class, disclosure)* — is currently spread over four places that each own
part of it and none of which sees the whole domain: `PB1`'s branch list (breadth), `PB1a` (area),
§14.3.2 + §14.3.2.1 + `PB7` (scope, partials only), and `GR2`'s "satisfied" + precedence + `GR3`'s
ladder (everything else). Every defect above is a hole **between** two of those four, not inside one.

I recommend the next revision replace them with a single decision procedure whose input is typed
(`breadth ∈ {full, partial, absent} × stated ∈ {yes, no}`, `Q_s`, `Q_t`, area stated or not, budget
shape) and which is **total over all three `projectType` values** — not partial-only with prose
carve-outs for the other two — returning the permission, the class and the required disclosure in one
pass, with `PB7`-style first-match ordering over the whole thing. The rules would not change; the
holes have nowhere to hide. Patching this section a fourth time will produce a fifth round.

---

## C · Did rev 4 break anything rev 3 had right?

**`GR2`'s closed class list — every class is still reachable.** I traced all ten:

| class | assigned by | reachable? |
|---|---|---|
| `exact` | `GR2` (all stated criteria satisfied) | yes — `bi-09` vs §1's query (`CINV-13`), **but not when the visitor names a scope: `P-3`** |
| `scope_superset` | §14.3.2 row 5; §14.3.2.1 row 2 | yes — `bi-16` vs *"주방만"*; `bi-17` vs *"바닥만"* |
| `scope_subset` | §14.3.2 rows 4, 6 | yes — `bi-14` vs *"주방이랑 욕실"* |
| `scope_overlap` | §14.3.2 row 7; §14.3.2.1 row 3 | yes — `bi-16` vs *"주방이랑 거실"* |
| `scope_disjoint` | §14.3.2 row 8; §14.3.2.1 row 4 | yes — `bi-15` vs *"주방만"* |
| `area_fallback` | `PB1a` | yes |
| `price_fallback` | **nothing names it** — only `GR2`'s stated meaning | yes in effect (`bi-13` vs *"1억 이내"*: `delta = +0.25`), but see `P-9` |
| `fallback_from_full` | `GR3`'s ladder only | yes, and now **only** when no exact partial exists (`P-15`) |
| `unknown_type_fallback` | `GR3`'s ladder only | yes — `bi-19` on a partial request; `GR3` never names the class (`P-9`) |
| `not_evaluable` | `GR2`'s stated meaning | yes — `bi-04` (no price), `bi-15` (no area) |

So **no class is orphaned and none is unreachable** — the `M-2` fix did not over-correct. What it did
leave is the narrower hole in `P-3` (fulls cannot be `exact` against a scope-naming visitor) and the
two assignment-wording gaps in `P-9`/`P-15`.

**Three things rev 3 had right that rev 4 did damage to**, all recorded above: `GR5`'s rewrite now
forbids legitimate output (`P-1`, the most serious); `WS9`'s new authoring rule undermines `WS7a`'s
space closure that the same revision had just repaired (`P-5`); and the new `storage` gloss
invalidates the contract's own §19 worked example and two `04` records without either document being
updated (`P-6`).

**Things rev 4 did **not** break, checked explicitly:** `RD1` and `D-1` are untouched and I re-verified
all four derived demo values by execution (`bi-09` 1,470,588 · `bi-10` 2,500,000 · `bi-11` 1,500,000 ·
`bi-12` 2,000,000; `bi-13` correctly none). `PB6`'s 3 × 2 table, the tier bands, `PB4`'s strong form,
`ST3`/`ST5`/`ST7`, `LO1`, `GC1`, `VB1`/`VB2`, `RO1`/`RO2`, §3's `"1.0"` reasoning, §11's determinism
and `INV-17`…`INV-29` are unchanged and remain consistent. `PB3a` does **not** empty the per-area
comparison (§Q-9). `WS7c`'s literal reading is unchanged and matches the code.

---

## D · The five questions §18 hands the reviewer

### `Q-9` — is `PB3a`'s "displayable, not comparable" the right trade, or should a compared-with-disclosure form be permitted?

**Keep `PB3a` as written. Do not permit a disclosed comparison.**

Three reasons, one measured.

*It does not empty the feature.* I computed the surviving pool over all 19. `PB3a` + `PB3`'s other
conjuncts leave exactly `{bi-09, bi-10, bi-11, bi-12}` mutually comparable — all `source: "derived"`,
all `full_remodel`, all KRW / `pyeong` / `supply` / `category: full-remodel` — which is **six
comparable pairs**, including both pairs the demo was designed around: `bi-09` vs `bi-10` (the
same-area / different-price pair, E5) and `bi-09` vs `bi-12` (the similar-price / different-area pair,
E6). The headline per-area comparisons all survive.

*The disclosure form does not work here.* The error `M-9` computed is not an uncertainty band, it is
an unknown **basis**: if `bi-01`'s operator priced against the exclusive area, the supply-comparable
figure is ≈2,170,000/평 rather than 2,900,000/평 — roughly a third, and in an unknown **direction**.
A caveat cannot repair a comparison whose sign may be wrong; `AR5`'s *"different bases are not
compared"* is the frozen precedent for exactly this and `PY1` restates it in V0.2. And a disclosed
comparison is what `PR4` already refuses for a record with no usable category — `PB3a` uses the same
construction, which is the cheapest thing for the consumer to implement.

*The cost is real and should not be hidden.* It removes six of the eight live authored prices from
comparison and `08` §C's count of two-thirds-dark is right. But the fix for that is the demo
expansion, which is already a hard prerequisite, not a looser rule. **One addition I would make:**
`PB3a` should say what the consumer may still do with an authored price, because "displayable" is
easy to implement as "invisible". Add: *"An authored `perArea` is stated as that record's own fact
alongside the record it belongs to; it is simply never the subject of an ordering or a
cheaper/dearer claim."*

### `Q-10` — for an open request (`Q = ∅`, no stated area), none of `PB0`'s three replacements binds; is §14.3.2's disclosure enough?

**The premise is wrong, and the answer is no — twice over. The open-request case needs a condition of
its own.**

(a) It is **not** true that none of the three binds. `PB1`'s **breadth** condition binds hard and in
the wrong direction: with no stated breadth, only `partial_remodel` records are budget-comparable at
all, and every `full_remodel` — including a 50,000,000 whole-home case against a 5,000만원 budget —
is excluded. That is `P-2`, a BLOCKER, and it is the opposite failure from the one `Q-10` worries
about.

(b) For the records that **are** eligible, §14.3.2's disclosure is not enough because **there is
none**: row 1, the open-request row, requires no disclosure (I grepped all ten "disclos" occurrences
in `07`). So five partials spanning `kitchen-bath` and `partial-remodel` get ordered by price delta
with nothing saying what each total covered — precisely the `M-10` behaviour `PB0` exists to license
explicitly.

**Recommendation.** Two clauses, both in `PB0`, and both before the consumer is asked to confirm it:

1. Give `PB1` the not-applicable branch for breadth (`P-2` fix).
2. Make the coverage disclosure normative rather than a citation: *"A total-based comparison or
   ordering across more than one `category` value MUST state, per record, what its total covered —
   its `projectType`, and for a `partial_remodel` its `workScopeIds ∩ Spaces`. For `Q = ∅` this is the
   only disclosure required and it is required."* Add a `CINV` asserting it on the
   *"2천만원으로 뭘 할 수 있나요"* fixture.

The consumer is currently being asked to confirm an amendment whose compensating control does not
exist. Fix both, then send it.

### `Q-11` — does §14.3.2.1 leave any ordinary trade-only utterance with **zero** records?

**Checked against the 19 fixtures, not in the abstract: no utterance returns zero *records*, but the
section returns zero *matches* on every one of them, and its permitting row is unreachable on the
whole corpus.** Full working in `P-4`; the results:

| utterance | `Q_t` | best outcome across all 19 | budget-comparable record |
|---|---|---|---|
| *"바닥이랑 도배만"* | `{flooring, wallpaper}` | `bi-17` `scope_overlap`; four partials `scope_disjoint`; `bi-19` (the exact job, 11,000,000) unclassified | **none** |
| *"조명만"* | `{lighting}` | every partial `scope_disjoint`; `bi-19` unclassified | **none** |
| *"바닥만"* | `{flooring}` | `bi-17` `scope_superset`; `bi-19` unclassified | **none** |
| *"도배만"* | `{wallpaper}` | every partial `scope_disjoint`; `bi-19` unclassified | **none** |

`TI1` is not violated on its letter — `GR3` still returns records as references — but §14.3.2.1's
first row (`Q_t ⊆ R_t` ∧ `R_s = ∅` ⇒ `exact`, permitted) never fires, because no `partial_remodel` in
the corpus has an empty `R_s` and `PT5` makes that shape near-unauthorable. **Recommendation:** fix
`GR3` to carry trades (`P-4`'s fix (i)), which is what makes `bi-19` reachable and correctly ordered;
then either delete §14.3.2.1's first row or state the authoring shape that reaches it. Add the
positive fixture to `CINV-15` — today it asserts only what must **not** happen.

### `Q-12` — does `WS9`'s Spaces/Works rule flip `PT4`(c)/`INV-29` for any record in `04`, and does it flip any §14.3.2 class the demo depends on?

**`INV-29`: no record flips. §14.3.2 classes: yes, `bi-18` does, and two other authored sets are now
wrong.**

*`INV-29` — checked all five `full_remodel` records against their bodies under the new rule.*
`bi-09` (kitchen 상하부장·상판·타일, bathroom 타일·도기·수전, entrance 신발장, bedroom 붙박이장),
`bi-10`, `bi-11` (kitchen 싱크대·타일, bathroom 방수·타일·도기), `bi-12`, `bi-13` each retain **at
least one genuinely remodelled Space**, so `PT4`(c) is satisfied in every case and no breadth verdict
changes. `bi-19` remains the clean negative. `INV-28` is unaffected. **The safety property holds.**

*But the authored sets shrink, and `04` was not re-checked.* Under `WS9` strictly, `bi-09`'s
`living_room` and `bi-11`'s `living_room`/`bedroom` received **only** trades (바닥·도배·문) and should
not be authored as Spaces at all; `bi-12`'s `dining` received only a pendant light. None of these
flips `INV-29`, but each changes `R_s` and therefore `GR3`'s rung-3 reachability.

*One flip does change a class the demo's expected answers depend on.* `bi-18`'s `storage` and
`bi-10`'s `storage` are joinery inside another space and become `built_in_furniture` under `07:287`
— full working and the resulting two-answers ambiguity in `P-6`. `04:644`'s coverage row `P6`
(*"`entrance` + `storage`"*) then has no record, `04:626`'s id list is wrong, and `04` §4.1's
*"현관 수납 → bi-18"* changes class depending on how the consumer resolves 수납.

**Recommendation.** Apply `P-6`'s one-sentence `WS9` clarification, then re-author `bi-10`, `bi-18`
and the §19 example, and re-derive `04`'s coverage matrix rows `P6` and §3's id list. This is a `04`
rev-4 pass, and it is small.

### `Q-13` — is `PB6a`'s "order on breadth, scope and area instead" well enough defined to be implemented the same way twice?

**No. As written it names three keys of which at most one can order anything, and it is silent
exactly when it is needed most.**

`PB6a` (`07:799-804`) is correct in its diagnosis — under `max m` every record at or under the
ceiling is `delta = 0` and `strong`, so price carries no discrimination — and correct that price must
not be the tie-break. Its remedy is not implementable:

- **breadth** is an equality test against the visitor's stated breadth. It partitions; it does not
  order. And when breadth was not stated it is not even a partition.
- **scope** yields a *class*, not a magnitude. `GR2`'s precedence could order the classes, but
  `PB6a` does not say to use it, and for `Q = ∅` — the commonest shape of an open *"1억 이내"*
  question — §14.3.2 row 1 assigns **no class at all**.
- **area** is the only one with a real ordering (`delta_area`), and only when the visitor stated an
  area.

So for the plainest utterance in `PB6a`'s own scope — *"1억 이내로 전체 리모델링 하고 싶어요"*: no
area, no scope, breadth binary — **nothing discriminates**, and two conforming consumers order the
result differently. That is the failure `PB6` was written to prevent (`07:814-815`: *"deterministic,
so two consumers cannot disagree on one document"*). The problem compounds: `PB4` forbids ordering on
non-evaluable criteria, `PB3a` forbids ordering by `perArea` unless every value is derived, `LO1`
forbids `location`, and `PB6a` now forbids price — the contract forbids more ordering keys than it
supplies, and supplies no default.

**Recommendation — make it a rule instead of an instruction, and widen it past `max`:**

> **`PB6a`** — whenever `PB6` yields `delta = 0` for more than one record (the `max` shape, and any
> `range` budget with several records inside it), price is **not** a tie-break. Order such a result
> by, in sequence: (1) `GR2` class precedence; (2) `|delta_area|` ascending where the visitor stated
> an area and both records are `AR5`-comparable with it; (3) the number of the visitor's stated
> `workScopeIds` the record carries, descending; (4) `publishedAt` descending; (5) `id` ascending.
> Steps (4) and (5) are the deterministic floor: a result whose order no stated criterion decides is
> ordered by recency and then by id, never arbitrarily. State to the visitor that the cases shown are
> all within budget and are not ranked by price.

Steps (4)–(5) are the part that matters: they make the "nothing discriminates" case reproducible, and
they cost nothing. Add a `CINV` asserting that two runs over one snapshot produce one order.

---

## E · Cross-document checks

### E.1 · `04` rev 3 and `05` "Round 3" against contract rev 4

**Consistent, verified item by item:** `04`'s §0.2 counts (*"full 2 (bi-01, bi-07) · partial 2 (bi-04,
bi-06) · absent 4"*) match `07:673`; the `D-3` correction landed (`04:668` now says *"bi-16 … as
**scope_superset**"* citing row 5, which I re-derived: `R_s = {kitchen, bathroom} ⊋ Q_s = {kitchen}`
✓); `D-5` (half-away-from-zero → round-half-up, `04:101`), `D-6` (`04:720`, the `INV-21` reasoning),
`D-7` (`04:657`, `bi-03`/`bi-05` as breadth-absent) and `D-8` (`04:41`, the authoring pass as a hard
prerequisite) are all applied; `04:624` carries the `WS7a`-scoped-to-Spaces reasoning; `04:583-588`
carries `WS9`'s new rule in `bi-19`'s note; `bi-17`'s note (`04:483`) correctly applies rev 4's row 3
with `Q_t`. All four derived values re-executed and exact. `05`'s Round-3 dispositions map to text I
located in rev 4 for all 11 findings.

**Contradictions — each is a finding:**

| id | sev | contradiction |
|---|---|---|
| **D-1** | MAJOR | `04:650` (E5) states *"also **bi-07 vs bi-11** (19/20평: authored 2.7M/평 vs derived 1.5M/평) \| same unit + basis, so **PB3-comparable**"*, and `04:211` repeats it as what `bi-11` tests. **`PB3a` forbids it**: `bi-07`'s `perArea` is `authored`, so its price basis is unknown by `PA4` and the pair may be displayed but never compared or ordered. `04:165` makes the same claim for *"a three-way 34평 comparison"* including `bi-01` (authored). `04` rev 3 claims to be realigned to rev 4; these three claims are the rule rev 4 added. Correct `04`, not the contract. |
| **D-2** | MAJOR | `04:502`/`04:139` author `storage` for joinery inside another space, which rev 4's own `07:287` gloss reassigns to `built_in_furniture`; `04`'s header says *"No record's data changed"*. Knock-ons: coverage row `P6` (`04:644`) then has no record, `04:626`'s id list is wrong, and `04:674`'s *"현관 수납 → bi-18"* changes class. See `P-6`. |
| **D-3** | MINOR | `07:1205`/`07:1171` — the contract's **own** §19 worked example — give `bi-01` `storage` for its 복도 붙박이장 / 주방 키큰장, contradicting `07:287` two hundred lines earlier. (Listed here because it is the same defect as D-2, in the contract rather than in `04`.) |
| **D-4** | MINOR | `04:672` expects *"32평인데 도배랑 바닥만 얼마예요 → bi-19 (11M)"*. Under rev 4 `bi-19` is breadth-absent, so §14.3.2/.1 give it no class and `PB1` permits no budget comparison; the expectation survives only as a `GR1` fact plus a `PB5` reference label, and if the visitor states a budget there is **no** comparable record at all (`P-4`). `04` should say which of the two it is asserting. |
| **D-5** | MINOR | `04:41` and `04:88`/`04:176` still cite *"contract **rev 3**"* for `WS7c`, `PT4`(b) and the counts. The facts still hold in rev 4, but a spec whose header says "realigned to rev 4" citing rev 3 inline is how a stale claim survives a round (this is how `M-5` happened). |
| **D-6** | MINOR | `05:412-413` records the `WS7c` limitation as *"Mitigation is `WS4` … now stated in `WS7c` **and in `04` §0.2**"*. `07:353-355` does carry it; `04` §0.2 (`04:41`) carries `D-8`'s prerequisite line but **not** the `WS4` operator-pass mitigation. Add the sentence or correct `05`. |
| **D-7** | MINOR | `05:390` records `M-2` as *"Accepted"* and closed. It is closed for the query it was raised on and open for a scope-naming visitor (`P-3`); `05:392` records `M-4` as closed with *"`04`'s `bi-19` note carries the rule"* — true, but `04`'s **other** records were never re-checked against the same rule (`D-2`). Both dispositions overstate closure in the way §A's instruction warns about. |

### E.2 · Producer work list — rev-4 changes the implementation does not yet have

The producer implements *"rev 2 plus the four rev-3 corrections"* (`07-producer-implementation.md`
header). I read `emit.ts`, `validate.ts`, `contract.ts`, `sources.ts` and `content/schema.ts` against
rev 4. **The good news is that it is short: rev 4's substance is consumer-side.** No wire shape, no
vocabulary, no invariant and no `RD1` constant moved, so `PORTFOLIO_SCHEMA_VERSION`,
`PRODUCER_VERSION` and every golden constant stay where they are.

1. **`ST6`'s new `P: SHOULD warn at build` is not implemented** (`07:415-417`). `emit.ts` has exactly
   one warning path — the `RD1` guard failure at `platform/integration/emit.ts:324` — and none for a
   value present in both `facets.style.values` and `facets.tag.values`. **Fix:** in
   `projectPortfolio`, after the `used.style` / `used.tag` maps are built (`emit.ts:353-362`), push
   one warning per intersecting value into the existing `warnings` array; `validate.ts` already
   merges it into the build warnings. ~5 lines, no new plumbing. This is the only rev-4 item that
   needs **code**.
2. **`WS7a`'s rescoping (`M-11`) is not reflected in the two places the producer restates it.**
   `platform/content/schema.ts:283-284` still says *"the set is CLOSED — the complete set the
   `totalPrice` covers (WS7a)"* and `platform/integration/validate.ts:299` restates the same. Rev 4
   scopes the closure to `workScopeIds ∩ Spaces` with works **open even for a partial**. Doc-comment
   only — but it is the text the next implementer will read, and it is the falsehood `M-11` was
   raised against.
3. **`INV-29`'s citation drift.** Three sites cite `PT4`(b) where rev 4 makes it `PT4`(c):
   `platform/content/schema.ts:153`, `platform/integration/contract.ts:63`,
   `platform/integration/validate.ts:307` (*"trades alone are PT4(b) (INV-29)"*). `PT4`(b) is now the
   **authoring** clause about excluded spaces and is explicitly *not* machine-checked (`07:186-191`);
   `PT4`(c) is the machine-checked one. The check itself is correct — only the reason is misattributed.
4. **`WS9` / §7.3's `storage` gloss**: no code change (the 26 ids are unchanged), but it changes what
   the **data** must contain. `bi-10` and `bi-18` in `04`, and `bi-01` in the contract's §19 example,
   must be re-authored before the golden package is rebuilt, or `INV-17`'s closure will be asserted
   over a vocabulary usage the contract no longer sanctions. See `P-6` / `D-2`.
5. **No producer change for the rest of rev 4** — `PB0`, `PB3a`, `PB6a`, `PB7`, §14.3.2.1, `GR5`'s
   quotient clause, `GR2`'s precedence sentence, §12's `total.kind`-unknown rule, `PT4`/`PT5`/`PT6`/
   `ST2`'s authoring labels (already correct: `07-producer-implementation.md` §2.4, *"No PT4 in
   code"*), `WS7c` (already literal in `schema.ts:364-371` and `validate.ts:299-307`) — are all
   consumer-side or already satisfied.
6. **Still pending from §16, not from rev 4:** `CONSUMER_DECLARED_LIMITS.valuesPerFacet.style = 150`
   (`platform/integration/contract.ts:119`) stays PROVISIONAL until the consumer declares the `VO6`
   limit. One constant, correctly marked.
7. **Unchanged and still blocking, for the record:** the Template Release ordering constraint
   (`07-producer-implementation.md` §5.1/§7.4) — a release cut and a re-pin must precede any V0.2
   field being authored in `data/sites/**`. Rev 4 does not move it.

If `P-1`, `P-2`, `P-3`, `P-4`, `P-5` and `P-6` are fixed as suggested, items 1–4 above remain the
whole producer delta: one warning, three comment corrections, and a data re-authoring pass.
