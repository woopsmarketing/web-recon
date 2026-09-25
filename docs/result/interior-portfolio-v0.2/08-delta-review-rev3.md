# 08 — Delta review of Contract V0.2 **rev 3** against `06-delta-review.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `06`, `05`, `04`, `02` or `03` |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 3), **including** the four late edits and the four post-implementation rules notified mid-review |
| checklist | `06-delta-review.md` findings `N-1` … `N-14`; dispositions in `05-review-disposition.md` "Round 2" |
| also read | frozen V0 `docs/reports/integration/03-integration-contract-v0-candidate.json` (rule texts extracted from the JSON, not paraphrased), `data/sites/boost-interior-demo/content/projects.json` (all 8 records, full bodies), `04-demo-data-spec.md` rev 2 (all 11 records), `01-owner-decisions.md`, `platform/integration/emit.ts` (header + `derivePerArea` + facet build) |
| scope | **DELTA only.** Rules rev 3 did not change are not re-opened. Nothing settled is re-litigated. |
| arithmetic | every `RD1` figure below was **executed** in Python with exact integers and cross-checked against `Fraction` ROUND_HALF_UP, not reasoned about. |

Short file names used below: **`07`** = the contract under review; **`06`** = the rev-2 delta review;
**`05`** = the disposition; **`04`** = the demo-data spec; **`03`** = the frozen V0 JSON;
**`data`** = `data/sites/boost-interior-demo/content/projects.json`.
Full paths: all under `/Users/woops/projects/web-recon-track-b/`.

---

## VERDICT

**NOT READY.** 4 BLOCKER · 7 MAJOR · 12 MINOR/NOTE.

Section A: of `N-1` … `N-14`, **9 CLOSED · 5 PARTIALLY CLOSED · 0 NOT CLOSED.** All three rev-2
BLOCKERs (`N-1`, `N-2`, `N-3`) are fixed as to the defect each named, and I verified each against the
live records rather than against the change log.

The four new BLOCKERs are the same class the brief asked me to hunt for, and three of the four were
**created by rev 3's own edits**:

- the `N-5` fix produced a table (`§14.3.2`) that matches three rows at once with opposite verdicts;
- the same table's last row makes `exact` unreachable for every `full_remodel`, contradicting `PB1`;
- the `N-13` fix (`PT4`(c)/`INV-29`) moved a judgement rather than removing one, and the rewritten
  `bi-19` removed the guard that was hiding it;
- and the `N-3` fix, correct in itself, does not close `D-1c` — which is `Q-7`, answered in §C.

Counts by document: `07` has 4 BLOCKER, 7 MAJOR; `04` rev 2 contradicts `07` rev 3 in 2 places that
matter and 5 that are cosmetic; `05`'s Round-2 section misdescribes 3 of the 14 fixes it records.

---

## A · Are `N-1` … `N-14` closed by rev 3?

Each row names the rev-3 text I read, quotes the operative clause, and says what I checked it
against. A change-log claim was never accepted as evidence.

| id | verdict | rev-3 text checked, and why |
|---|---|---|
| **N-1** `PT4`(a) deleted every `partial_remodel` | **CLOSED** | `07:175` `PT4` is now headed *"**when `full_remodel` may be authored.** All of:"* and its (b) — *"the source names **no space** that was left out"* — sits inside that branch. `07:187` `PT5`: *"**when `partial_remodel` may be authored.** The source states a **bounded set of spaces** the project covered. The spaces outside that set are its complement, not a disqualifier; `PT4`(b) does not apply here."* `07:191` `PT6` is the residue. Re-run against the live text: `bi-06`'s *"방과 주방은 상태가 좋아 그대로 두고"* (`data`) is now the complement of a bounded set, not a disqualifier, and its summary *"현관과 거실만 골라"* satisfies `PT5`; `bi-04`'s *"주방과 욕실 두 곳만 골라"* likewise. §13 (`07:610`, `07:612`) assigns `partial_remodel` to both, and the rules now agree with it. Partials exist again: 2 live + 5 in `04`. |
| **N-2** `ST4` failed the build on 18 of 19 records | **CLOSED** | `07:381` `ST4`: *"`facets.tag` is the authored descriptive-word list **minus** every value that is in the style list, in the surviving authored order, with the key omitted when nothing survives."* `INV-24` (`07:870`) is now scoped *"**per record**"*. I recomputed the subtraction on all 19: `bi-09` `["화이트","베이지"] − ["화이트","베이지"] = []` ⇒ key omitted (`INV-18` satisfied, not violated); `bi-10` ⇒ `tag ["간접조명"]`; `bi-19` ⇒ `tag ["이사 전 공사"]`; `bi-01` `["화이트","미니멀","간접조명","수납 특화"] − ["화이트","미니멀"]` ⇒ `tag ["간접조명","수납 특화"]`, which is exactly what `D-M7` was protecting. `emit.ts:345` implements it (`dedupe(p.keywords).filter((k) => !styles.includes(k))`). No record fails. |
| **N-3** `GR4` defeated by `title` | **PARTIALLY CLOSED** | `07:824` `GR4` is inverted as asked: *"a record does **not** carry `pricing.perArea` unless the visitor asked about a **per-area** price. `property.area` is always available; the **price** is what is withheld."* `07:833` `GR5` is extended: *"…including an area stated in a `title`… The two factors need not come from the same record."* `CINV-2` (`07:879`) mirrors both. The defect `N-3` **named** — `perArea × area-from-title`, and the cross-record pair — is closed, and I re-verified 06's premise on the live data (all 8 titles carry the area: 34평, 24평, 42평, 32평, 29평, 34평, 19평, 51평). But the *purpose* of `GR4`/`GR5` is to be `D-1c`'s enforcement point (`07:509`, `07:498`), and the forbidden figure remains one division away from two fields `GR1` explicitly authorises. See **M-1** and §C `Q-7`. |
| **N-4** relations computed over spaces+trades | **CLOSED** | `07:751` *"Classification runs over **spaces only**. Let `Spaces` be §7.3's Spaces table, `R_s = record.workScopeIds ∩ Spaces` and `Q_s` = the spaces the visitor asked for."* Re-run on `06`'s own counterexample: `bi-14` authored at any granularity (`[kitchen]` or `[kitchen, tiling, plumbing]`) gives `R_s = {kitchen}`; visitor "주방만" gives `Q_s = {kitchen}`; `R_s == Q_s` ⇒ `exact`. Comparability no longer depends on authoring granularity. (The **mirror** case — trades the *visitor* named — is now unhandled: **M-6**.) |
| **N-5** no disjoint row; last row's condition wrong | **CLOSED** | `07:767` adds *"`R_s ∩ Q_s = ∅` \| nothing in common \| not permitted \| `scope_disjoint`"*, and `07:768` changes the last row's condition to *"`projectType != partial_remodel`, **any relation**"*. `scope_disjoint` is in `GR2`'s closed list (`07:794`). Both rows `N-5` asked for exist. (The fix created two new defects in the same table: **M-2**, **M-3**.) |
| **N-6** `PB1`'s area condition unsatisfiable with no stated area | **CLOSED** | `07:696` `PB1a`: *"If the visitor **stated no area**, the condition is **not applicable** — not failed: the comparison proceeds and `area` is listed among that record's not-evaluable criteria (`GR2`). *A visitor who says only "예산 3천으로 전체 리모델링 되나요?" must still get an answer.*"* `04` §4.1's "예산 3천으로 전체 가능해요? → bi-11" is reachable again on the budget axis. (A separate wording defect in the same rule: **M-7**.) |
| **N-7** `GR2`: "satisfied" undefined, `price_fallback` unassigned, no precedence | **PARTIALLY CLOSED** | All three gaps have text. *Satisfied* is defined per criterion (`07:806-812`): budget = *"comparable under `PB6` **and** `delta ≤ 0`"*; area = *"`strong` or `acceptable` tier"*; scope = *"the `exact` row of §14.3.2"*; breadth = equality. `price_fallback`/`area_fallback` now have an assignment rule — *"mean *evaluated and not satisfied*"* (`07:817`) — and `not_evaluable` is added. A precedence order exists at `07:815`. But the order supplied is wrong: `fallback_from_full` and `unknown_type_fallback` precede `exact` and §14.3.2's last row assigns one of them to **every** non-partial record, so `exact` is unreachable for `full_remodel`. Supplying a precedence that breaks the contract's own headline query does not close "no precedence exists". **M-2**. |
| **N-8** `INV-22` not testable, `RD1` not carved out | **CLOSED** | `07:868` is now a metamorphic test with three executable clauses (*"changing only `area.value` changes no emitted field except `property.area.value` and a `source:"derived"` `perArea`"*, etc.) and states *"`RD1`'s division is the **sole** permitted dependency of any emitted value on `property.area`"*. It self-documents the two cases `06` required: it passes `1,000,000 × 34 = 34,000,000` and catches a total that moves with an area. This is writable as a test. |
| **N-9** `RO2` gate not checkable by the party bound by it | **PARTIALLY CLOSED** | `07:911` `RO2` now reads *"every registered site's routing pointer has **both** `current` and `previous` at `schemaVersion >= 1.0` — that is, after **two** successful V0.2 publishes per site"*, with the justification *"rollback is a single step to `pointer.previous`… so 'both pointer slots at `>= 1.0`' *is* 'no rollback target below `1.0`'"*. The **bound** is now exact and is the right one. The **channel** `N-9` complained about is still absent: nothing in the manifest, the document or `SV1`–`SV5` exposes pointer state, and rev 3 dropped 06's "the producer states in the release record" clause without replacing it. One sentence closes it — see §C `Q-2`. |
| **N-10** `WS9`'s "source" undefined, collides with `WS4` | **CLOSED** | `07:333` `WS9` is relabelled *"(**AUTHORING rule** — not machine-checked, not a `VA1` condition)"* and scoped: *"guidance for whoever fills the authored field… `WS9` binds the **author**, never the emitter: the emitter copies the authored field and never reads prose (`WS4`)."* The `VA1` collision is gone and `04`'s `bi-09`/`bi-12` no longer violate a `P: MUST`. (The same treatment was **not** given to `PT4`(a)/(b), `PT5`, `PT6` or `ST2`, which remain unevaluable `P: MUST`s: **M-8**.) |
| **N-11** `PB4` forbade only last place | **CLOSED** | `07:711` carries the strong form verbatim: *"a criterion that could not be evaluated for a record contributes **nothing** to that record's score and to **no** tie-break key. It is not a penalty, not a small penalty, and not a null that sorts last."* `CINV-5` (`07:882`) is the matching test and explicitly records why the weak form fails at `limit = 3`. (Both change logs misdescribe this fix — MINOR-9.) |
| **N-12** `PB6` not total | **CLOSED** | `07:720-734`: the `max` shape is added to `VB1` and to a full 3 × 2 table; `delta` is *"**signed**: negative means the record costs *less* than the budget"*; overlap is defined — *"Ranges **overlap** when `a ≤ hi` and `lo ≤ b` — a shared endpoint counts as overlapping"*; positivity is stated — *"Every divisor is a visitor-stated amount, and `VB1` requires every visitor amount to be `> 0`"*. `CINV-6`/`CINV-11` test the cells and the sign. All four of `N-12`'s holes have text. (One cell is phrased as a magnitude rather than a signed expression — MINOR-4.) |
| **N-13** `PT4`(b)'s "narrow" untestable | **PARTIALLY CLOSED** | `07:181` `PT4`(c) is `06`'s own proposed replacement verbatim — *"`workScopeIds` contains at least one id from the **Spaces** table of §7.3… Machine-checked: `INV-29`"* — and `INV-29` exists (`07:874`). The undefined word "narrow" is gone. But the judgement was **moved, not removed**: `INV-29`'s input is `workScopeIds`, and neither `§7.3` nor `WS9` says whether a bedroom that received new flooring and wallpaper is authored as `bedroom`. The rule that `07:632` calls *"a table lookup rather than a reading of tone"* still turns on a reading. **M-4**. |
| **N-14** `bi-05` kept `full_remodel` on a verb | **PARTIALLY CLOSED** | `07:179` `PT4`(b) now names it: *"and **no space that received only maintenance-level work** — 실리콘·수전만 교체, 덧방, 부분 보수. A space that was not really remodelled is a space that was left out, whichever verb the source uses."* §13's table row (`07:611`) assigns `bi-05` **absent**, the counts are *"full 2 · partial 2 · absent 4"* (`07:629`), and `07:622-628` states *"**The two are now decided alike.**"* **But `07:658` still carries rev 2's paragraph verbatim: *"Recorded caveat: `bi-05`'s body notes the bathroom received silicone and taps only. The operator's explicit "전체 리모델링" governs; the caveat is logged rather than overridden."*** That is the exact sentence `N-14` was raised against, contradicting the table 30 lines above it. **M-5**. |

---

## B · New defects introduced or left by rev 3

Ordered most severe first. Each carries a concrete failure case on real data.

### M-1 (BLOCKER) · `D-1c` has no enforcement point: `total ÷ area` is computable from two fields `GR1` explicitly authorises, and `GR5` does not forbid the quotient

**Rules.** `07:820` `GR1`: *"only values present in the search result may be stated as fact:
`projectType`, `workScopeIds`, `property`, `pricing`, `facets`, `title`, `location`."*
`07:824` `GR4`: *"`property.area` is always available; the **price** is what is withheld"* — and
"the price" is `pricing.perArea` only; `pricing.total` is untouched.
`07:833` `GR5`: *"no number in the assistant's reply equals the **product** of **any** `perArea` and
**any** area appearing in, or derivable from, the result … **nor `budget / area`** for any of them."*

`GR5` enumerates exactly two forbidden numbers. `total ÷ area` is neither. `CINV-2` (`07:879`)
mirrors the same enumeration, so the test misses it too. `D-1c` (`07:509`) still forbids it
normatively — *"the consumer never performs `D-1`, **or any variant**, itself"* — but §9.3 itself
says why that is not enough: *"`D-1c` is given an enforcement point in §14.5 — **a prohibition an LLM
cannot be asked to obey on its own honour**"* (`07:498`). Both enforcement points miss it.
`GR4` now withholds only D-1's **output**; it never withholds an **input**.

**Failure case (live fixture, computed).** `bi-19` (`04` §2) reaches the model as
`pricing.total {kind:"exact", amount: 11000000, currency:"KRW"}` +
`property.area {value: 32, unit:"pyeong", basis:"supply"}` + `title "32평 전체 도배·바닥·조명 교체"`.
`11,000,000 ÷ 32 = 343,750`. `04` §4.1 states the requirement in its own words — *"the answer must
**not** say 343,750원/평"* — and **no rule in rev 3 enforces it.** More, computed:

| record | total | area | quotient the model may state | what the contract says about it |
|---|---|---|---|---|
| `bi-19` | 11,000,000 | 32평 | **343,750/평** | `04` §2: *"exactly the meaningless figure `D-1a` exists to forbid"* |
| `bi-16` | 19,800,000 | 38평 | **521,053/평** | `D-1a`, partial — never emitted by the producer |
| `bi-14` | 15,000,000 | 84㎡ excl. | **178,571/㎡** | `D-1a` + `AR5` (exclusive basis) |
| `bi-13` | range 125–140M | 48평 | **2,604,167 / 2,916,667** | `04` §2: *"a number nobody may compute or emit — TP3, D-1c"* |
| OD-K's own example | 6,000,000 | 34평 | **176,471/평** | OD-K: *"must never become 6,000,000 / 34"* |

**This is not a regression from rev 2** — rev 2's `GR4` withheld `property.area` but never withheld
`pricing.total`, so both inputs were co-present there too, and neither review caught it. The
inversion is still the right call; it simply does not close `D-1c` by itself.

**Fix (two clauses, no new field, no envelope change).**
`GR5` → *"…no number in the assistant's reply equals the product of any `perArea` and any area,
**or the quotient of any price amount — `total.amount`, `total.minAmount`, `total.maxAmount`, a
`perArea.amount`, or the visitor's budget — and any area** appearing in, or derivable from, the
result, including an area stated in a `title`; the two factors need not come from the same record."*
`CINV-2` takes the same enumeration. Nothing legitimate is lost: the one per-area figure a visitor
may be told is the producer's own `perArea`, and `GR4` already releases it when they ask.

---

### M-2 (BLOCKER) · §14.3.2's last row makes `exact` unreachable for every `full_remodel`, and contradicts `PB1`'s own full branch

**Rules.** `07:768`, last table row: *"`projectType != partial_remodel`, any relation \| the set is
**open** (`WS7b`)… \| **not permitted** \| `fallback_from_full` or `unknown_type_fallback`"*, followed
by `07:771`: *"**The last row covers every other record, whatever the relation.**"*
`07:815` `GR2` precedence, *first match wins*:
`unknown_type_fallback` → `fallback_from_full` → … → `not_evaluable` → **`exact`**.
`07:690` `PB1` meanwhile **permits** the comparison: *"— `full_remodel`, and the visitor asked about
whole-home work, and the **area condition** below is met"*.

Two defects at once:

1. **Contradiction.** For a `full_remodel` record, `PB1` says the total-budget comparison is
   permitted and §14.3.2's last row says it is not. Nothing scopes the table to the partial branch;
   `07:771` says the opposite in so many words.
2. **`exact` is unreachable.** Because the last row assigns a class to *every* non-partial record and
   that class outranks `exact`, no `full_remodel` can ever be classed `exact`, however well it
   matches.

**Failure case — the contract's own §1 motivating query.** *"34평 아파트 **전체** 리모델링, 예산 5천
정도인데 비슷한 사례 있나요?"* against `bi-09` (`full_remodel`, 34평 supply, exact 50,000,000):
breadth satisfied, area `|delta| = 0` ⇒ `strong` ⇒ satisfied, budget `delta = (50 − 50)/50 = 0 ≤ 0`
⇒ satisfied. `GR2`'s own definition — *"`exact` means **every criterion the visitor stated was
evaluated and satisfied**"* — gives `exact`. The precedence gives `fallback_from_full`, whose meaning
under `GR3` (`07:829`) is *a whole-home case shown as a reference for a partial request*, and which
`GR3` requires be *"**stated, never hidden**"*. So the assistant must tell a visitor asking about
whole-home remodels that a perfectly matching whole-home case is only a reference. `04` §4.1 expects
*"bi-09 **exact**"*; the same breakage hits *"예산 3천으로 전체 가능해요? → bi-11"*.

**Fix.** Scope the last row: *"The last row applies only when the visitor stated a scope condition
(`Q ≠ ∅`). A record evaluated under `PB1`'s `full_remodel` branch takes **no** scope class, and
`fallback_from_full` / `unknown_type_fallback` are assigned only on the `GR3` ladder — i.e. when a
`partial_remodel` request is being answered with a non-partial case."*

---

### M-3 (BLOCKER) · §14.3.2's table is not a function: rows 1, 3 and 6 match simultaneously with opposite budget verdicts, and `GR2`'s precedence cannot resolve the conflict

**Rule.** `07:761-768`, the six partial-branch rows. Their conditions are not disjoint:

| condition | when `Q_s = ∅` and `R_s ≠ ∅` | verdict that row gives |
|---|---|---|
| row 1 `Q_s = ∅` | true | **permitted** |
| row 3 `R_s ⊋ Q_s` | true (`R_s ⊋ ∅`) | **not permitted**, `scope_superset` |
| row 6 `R_s ∩ Q_s = ∅` | true (`∅ ∩ anything = ∅`) | **not permitted**, `scope_disjoint` |

No precedence is stated inside §14.3.2, and `GR2`'s precedence (`07:815`) orders **classes** —
it cannot order the *budget-comparison permission* column at all, and row 1 names no class to order.
Row 1 also collides with row 2 when `R_s = Q_s = ∅` (row 2 says `exact`, row 1 says
"not-evaluable").

**Failure case.** *"2천만원으로 뭘 할 수 있나요"* (`Q = ∅`) against `bi-16` (`partial_remodel`,
`[kitchen, bathroom]`, exact 19,800,000). Row 1 permits the budget comparison; rows 3 and 6 forbid
it. Two conforming consumers give opposite answers on one document — the exact failure `PB6` was
written to prevent (`07:720`: *"deterministic, so two consumers cannot disagree on one document"*).
Note `06` §B flagged the rev-2 behaviour here (every partial became `scope_superset`) and rev 3
added row 1 to fix it without removing the rows it now contradicts.

**Fix.** Make row 1's condition `Q = ∅` (the visitor named **no scope of any kind**), not `Q_s = ∅`,
and add one line: *"The rows are evaluated in the order written; the first whose condition holds
decides both the permission and the class."* Then `Q = ∅` decides cleanly and rows 2-6 apply only
when the visitor named something.

---

### M-4 (BLOCKER) · `PT4`(c)/`INV-29` rest on an undefined term, and the rewritten `bi-19` removed its only authoring-independent guard — opening a path to `343,750 KRW/평` with a `source:"derived"` badge that no invariant catches

**Rules.** `07:181` `PT4`(c): *"`workScopeIds` contains at least one id from the **Spaces** table of
§7.3. A project that ran only trades across the dwelling is not a remodel of it. Machine-checked:
`INV-29`."* `07:333` `WS9`: *"when the project **touched a space**, author the space id; when it ran
a **trade**, author the trade id; when both, author both."* `07:265` defines Spaces as *"a room or a
defined area of the dwelling"*.

**Nothing says whether re-flooring and re-papering a bedroom "touches" `bedroom`.** Under one
reading the author writes `[flooring, wallpaper, lighting]`; under the other,
`[entrance, living_room, bedroom, flooring, wallpaper, lighting]`. `PT4`(c) gives opposite answers.

**Failure case — on the contract's own required fixture, after the late rewrite.** `04` §2's
rewritten `bi-19` body now reads *"바닥은 현관부터 방까지 전체를 걷어내고… 도배도 빠진 방 없이…
천장 조명은 모든 방을"* and its own note states *"every space is included and none is downgraded, so
`PT4`(b) does not fire. **What stops `full_remodel` is `PT4`(c) alone.**"* So:

- `PT4`(a) holds — the summary says *"집 전체에 걸쳐"*; `04` concedes *"PT4(a) is arguable"*.
- `PT4`(b) holds — no space excluded, by design of the rewrite.
- `PT4`(c) is the **only** thing left, and it is decided by an undefined authoring choice.

If the author writes `bedroom`, `INV-29` passes, `full_remodel` is authored, and `D-1` fires:
`11,000,000 / 32` ⇒ `T = 1,100,000,000`, `A = 3,200`, `floor((2T + A)/(2A)) = 343,750`
(executed). The producer emits `perArea {amount: 343750, source: "derived"}` — the figure `04`
§2 itself calls *"exactly the meaningless figure `D-1a` exists to forbid"* — **with a provenance
badge**. `INV-19` does not catch it (it only asserts `projectType != full_remodel ⇒ no derived
perArea`; here `projectType` **is** `full_remodel`). `VA1` does not catch it. Nothing does.

**Judgement on the late edit.** The rewrite is *directionally right* — the old `bi-19` body excluded
주방/욕실, so `PT4`(b) fired independently and the record never exercised `INV-29` at all, and `04`
X5 needs a clean negative. But as executed it **removed the record's only authoring-independent
disqualifier** and left OD-K's showcase fixture resting on an undefined term. It is a net safety
regression until the term is fixed.

**Second instance of the same root, in the live vocabulary.** `07:281` glosses `storage` (a **Space**)
as *"창고, 팬트리가 아닌 수납 공간, **built-in storage as a space**"* while `07:297` glosses
`built_in_furniture` (a **Work**) as *"붙박이장, 조작 가구"*. `04` maps the same concept both ways —
`bi-18` 복도 붙박이장 ⇒ `storage`, `bi-12` 붙박이 수납 ⇒ `built_in_furniture` — which changes `R_s`
and therefore `§14.3.2`'s class and `PT4`(c)'s verdict. The Spaces/Works split became load-bearing in
**three** new places in rev 3 (`PT4`(c), `INV-29`, `§14.3.2`) without the gloss being tightened.

**Fix (one sentence, in `WS9` or `§7.3`).** *"Author a **Spaces** id only when that space itself was
remodelled — its layout, fixtures or built-in elements changed. A trade run **through** a space (new
flooring, new wallpaper, a new ceiling light) is authored as the **trade** id alone. Built-in storage
is `storage` when it is a dedicated space and `built_in_furniture` when it is joinery inside another
space."* Then add the corresponding line to `04`'s `bi-19` authoring note, and `PT4`(c) decides
`bi-19` deterministically.

---

### M-5 (MAJOR) · §13's closing "Recorded caveat" paragraph contradicts §13's own `bi-05` row — `N-14` survives verbatim in the same section that claims to have closed it

**Text.** `07:658`: *"**Recorded caveat:** `bi-05`'s body notes the bathroom received silicone and
taps only. The operator's explicit "전체 리모델링" governs; the caveat is logged rather than
overridden."*

This is rev 2's sentence, unmodified. Thirty lines above it, `07:611` assigns `bi-05` **absent**
(`PT4`b) and `07:622-628` explains at length that *"Rev 2 let `bi-05` keep `full_remodel` because the
operator had written "전체 리모델링" and the caveat was merely "logged"; the delta review showed that
made the classification turn on the verb rather than the fact."* §13 now says both things.

**Failure case.** §13 is not decoration — `07:641` says *"Each value is written into
`data/sites/boost-interior-demo/content/projects.json` as an authored `projectType` … the emitter
copies it."* An author who reads to the end of §13 authors `bi-05` as `full_remodel` with a logged
caveat. `bi-05` has an area (29평 supply, `data`), so the moment a total is authored for it `D-1`
emits a derived per-area price for a dwelling whose bathroom got 실리콘과 수전만 — `N-14`'s hazard,
reproduced. No invariant catches it: the record is `full_remodel` and passes `INV-29` on its
`[거실, 주방·다이닝, 침실, 확장 발코니]` spaces.

**Fix.** Delete the first two sentences of `07:658`, or replace with: *"`bi-05`'s summary says
전체 리모델링 and its body says the bathroom received silicone and taps only. `PT4`(b) governs: the
statements contradict one another, so breadth is not established and `projectType` is omitted."*

---

### M-6 (MAJOR) · §14.3.2 drops the trades the **visitor** named: a case that did none of the requested trades is classed `exact` and its total is budget-compared

**Rule.** `07:751`: *"Trades are **disclosed, not classified**: a record that also ran trades the
visitor did not name is still comparable, and the extra trades are named in the disclosure."* That
handles `R \ Q`. `Q \ R` — trades the visitor asked for that the record did **not** do — is handled
nowhere, and `Q` itself is never defined (only `Q_s` is).

**Failure case.** *"주방이랑 바닥 1천5백만원"* ⇒ `Q_s = {kitchen}`, `Q \ R ⊇ {flooring}`. `bi-14`
(`partial_remodel`, `[kitchen]`, exact 15,000,000) gives `R_s = {kitchen} == Q_s` ⇒ row 2 ⇒
**`exact`, budget comparison permitted**, `delta = 0` ⇒ `strong`. But `WS7a` (`07:322`) makes the
partial's set **closed** — *"it is the complete set of spaces **and works** the `pricing.total`
covers"* — so the contract's own data says `bi-14`'s 15,000,000 bought **no flooring at all**.
The assistant tells a visitor who asked for kitchen + whole-flat flooring that a kitchen-only job is
an exact match at their budget.

A second reading of the same hole: `07:302` gives *"바닥이랑 도배만"* as one of the two ways visitors
speak, and for that utterance `Q_s = ∅`, so row 1 fires ⇒ *permitted*, scope "not evaluable" ⇒
"2천만원으로 바닥이랑 도배만" is budget-matched against `bi-16`'s 19,800,000 kitchen-and-two-bathrooms
total. That is verbatim the harm `07:774` claims the table prevents. (After **M-3**'s fix the same
utterance falls to row 6 ⇒ `scope_disjoint` ⇒ *zero* trade-query matches, including against `bi-19`
and `bi-17`, which did exactly those trades. Both readings are wrong; the rule needs a trade clause
either way.)

**Fix.** Add a trades conjunct to row 2 and a trades row: *"Let `R_t = R ∩ Works` and `Q_t = Q ∩
Works`. Row 2 (`R_s == Q_s`) additionally requires `Q_t ⊆ R_t` when `projectType ==
"partial_remodel"`; where `Q_t ⊄ R_t` the class is `scope_subset` and the budget comparison is not
permitted, and the trades in `Q_t \ R_t` are named. When `Q_s = ∅` and `Q_t ≠ ∅`, classify on
`R_t` vs `Q_t` by the same six relations."*

---

### M-7 (MAJOR) · `PB1a` requires the `acceptable` tier, which §14.3.1's bands exclude `strong` from — a perfect area match fails the area condition

**Rules.** `07:696` `PB1a`: *"`property.area` must be `AR5`-comparable with it and **within the
`acceptable` tier of §14.3.1**"*. `07:738-742`, the tier table, is a cascade of disjoint bands:
`≤ 0.10 ⇒ strong`; `≤ 0.20 ⇒ acceptable`; `> 0.20 ⇒ fallback`.

Read literally, an exact area match (`|delta| = 0`) is in the `strong` tier, **not** the
`acceptable` tier, so `PB1a` fails and the record is `area_fallback` — *"and is not a budget match"*.
`GR2` (`07:810`) says the opposite for the same fact: *"area: comparable under `AR5` and in the
**`strong` or `acceptable`** tier."*

**Failure case.** *"34평 전체 5천"* vs `bi-09` (34평 supply): `|delta| = 0` ⇒ `strong` ⇒ `PB1a` not
satisfied ⇒ `area_fallback`, not a budget match — while `GR2` calls the same criterion satisfied. The
best possible record is the one the rule rejects. Two conforming consumers disagree.

**Fix.** `PB1a` → *"…and in the `strong` **or** `acceptable` tier of §14.3.1"*, matching `GR2`
verbatim.

---

### M-8 (MAJOR) · `PT4`(a)/(b), `PT5`, `PT6` and `ST2` are `P: MUST` clauses the fail-closed `VA1` validator cannot evaluate — `N-10`'s defect, left standing in the rules rev 3 rewrote

**Rules.** `07:607` `VA1`: *"the producer's emitter validator is **fail-closed**: an opted-in public
build that cannot satisfy every `P: MUST` here **fails the build**"*. `07:175` `PT4` is
*"(authoring rule, **P: MUST**)"* and its (a)/(b) are judgements about source prose. `07:187` `PT5`
and `07:191` `PT6` likewise. `07:369` `ST2` is a bare `P: MUST` — *"a value that is not style is not
relabelled as one"* — which is a semantic judgement.

Rev 3 **created** the correct label for exactly this problem and applied it twice — `WS9` (`07:333`,
*"not machine-checked, not a `VA1` condition"*, the `N-10` fix) and the new `ST6` (`07:372`,
*"AUTHORING rule — not machine-checked"*) — and did not apply it to `PT4`/`PT5`/`PT6`/`ST2`.

**Failure case.** The emitter cannot demonstrate `PT4`(a) for `bi-01` without reading the summary
*"…34평 아파트 전체 리모델링입니다"*, and `PT3` (`07:170`) + `WS4` forbid the emitter reading prose.
So either `VA1` is unsatisfiable for every record carrying `projectType`, or `PT4`(a)/(b) is not a
`VA1` condition and the contract does not say so. The implementing agent has already been surprised
twice by exactly this class of ambiguity (`07:1122-1126`).

**Fix.** Label `PT4`(a)/(b), `PT5`, `PT6` and `ST2` *"AUTHORING rule — not machine-checked, not a
`VA1` condition"*, keeping `PT4`(c)/`INV-29` (and `INV-28`, `INV-24`, `INV-25`) as the
machine-checked part. No normative force changes; the build stops being ambiguous.

---

### M-9 (MAJOR) · `PB3`'s `AR5` conjunct tests **area** bases while `PA4`/`PA5` are about **price** bases; `perArea.source` is referenced by no consumer rule, and "lowers confidence" obliges nothing

Full analysis and the recommended fix are in §C `Q-8`. Stated here so it carries a severity.

**Rules.** `07:439` `PA5`: *"`source` is therefore what tells the consumer whether the price basis is
known… **This is what makes `PB3`'s `AR5` condition evaluable**"*. `07:706` `PB3` in fact tests
*"`AR5` permits the **area bases** to be compared"* and never mentions `source`. Grepped: **no rule
in §14 references `perArea.source`.** `03` `AR5`'s third clause — *"one unknown basis lowers
confidence"* — is the only thing left, and "confidence" is defined nowhere in V0 or V0.2.

**Failure case (computed).** `PB3` permits comparing `bi-01`'s **authored** 2,900,000/평 (price basis
unknown by `PA4`) with `bi-09`'s **derived** 1,470,588/평 (price basis = `supply` by `PA5`): same
`projectType`, same `category`, same currency and `perUnit`, and both records' *area* bases are
`supply` so the `AR5` conjunct passes. If `bi-01`'s operator priced against the **exclusive** area
(34평 supply ≈ 25.4평 exclusive at `AR4`'s 400/121), the comparable supply-basis figure is
≈ 2,170,000/평 and "roughly half the price" is wrong by about a third. V0 was uniformly uncertain
here; V0.2 puts known-basis and unknown-basis prices in one pool and gives no rule to tell them apart
in a claim.

---

### M-10 (MAJOR) · `PR4` is declared "kept" in full, but `PB1`/`PB6` compare and **order** `pricing.total` across categories with no category condition

**Rules.** `03` `PR4` (frozen, consumer-confirmed, `C: MUST`): *"compare, sort or call **prices**
'close' only among records with the same `category` value; without a usable category facet, price may
be displayed as a fact but never used for comparison or ordering."* `07:1058` and `07:1069` both
state `PR4` is **kept** and that `PB3` merely *adds* a condition on top of it. `07:690` `PB1` and
`07:720` `PB6` then compare a visitor budget against `pricing.total`, and `PB4`/`GR2` rank records by
the resulting `delta`, with **no** category condition anywhere. `PR4`'s word is "prices", not
"per-area prices", and V0.2 introduces a second price.

**Failure case.** *"2천만원으로 뭘 할 수 있나요"* returns and orders `bi-16` (`category:
kitchen-bath`, 19,800,000), `bi-17` (`partial-remodel`, 12,500,000) and `bi-19`
(`partial-remodel`, 11,000,000) by price delta — sorting prices across categories, which `PR4`
forbids as written. `§3` and `§20` both assert that V0.2 amends no frozen rule not named; this is a
silent amendment of one that is named as kept.

**Fix (choose one, explicitly).** Either scope `PR4` to `perArea` in `§20` — which is an amendment to
a frozen consumer-confirmed `C: MUST` and therefore needs the consumer's confirmation, exactly as
`05` D-B2 argued for its restoration — or add the same-`category` condition to the total path in
`PB1`. Leaving it implicit is the cheapest way to ship a violation of a rule the change log claims is
intact.

---

### M-11 (MAJOR) · `WS7a`'s closure over **works** is not achievable under `WS1`/`WS9`, `WS7c` now makes it unavoidable, and `04` violates it on every partial

**Rules.** `07:322` `WS7a` (`P: MUST`, `C: MAY rely on`): *"when `projectType == "partial_remodel"`,
`workScopeIds` is **closed**: it is the complete set of **spaces and works** the `pricing.total`
covers."* `07:307` `WS1`: *"A source item that cannot be mapped to an id without judgement is
**omitted**"*. `07:333` `WS9` is now explicitly *not* machine-checked. `07:329` `WS7c` (new) makes
`workScopeIds` mandatory for every record stating `projectType`.

So for a partial the set is mandatory (`WS7c`), authored by judgement (`WS9`, uncheckable), pruned by
`WS1` — and then **declared complete** by `WS7a`, with the consumer permitted to rely on it.

**Failure case (`04`'s own records).** `bi-14` is authored `[kitchen]` while its body describes
*"상판은 … 엔지니어드 스톤, 벽 타일은 화이트 정사각 타일 … 후드는 슬림형으로 … 싱크볼은
언더마운트로"* — `tiling` and `plumbing` are works the 15,000,000 demonstrably covered. `bi-16` is
authored `[kitchen, bathroom]` while its body describes 상판·타일·수전 and 덧방 시공. Under `WS7a` a
consumer may state *"이 사례 금액에 타일 공사는 포함되어 있지 않습니다"* about both — false in both
cases. Rev 3 made this worse in one direction (§14.3.2 no longer classifies on trades, so there is no
longer any pressure to author them) and better in another (trades no longer distort the class).

**Fix.** Scope the closure to what is achievable and to what §14.3.2 actually uses:
*"`WS7a` — when `projectType == "partial_remodel"`, `workScopeIds ∩ Spaces` is **closed**: it is the
complete set of **spaces** the `pricing.total` covers. The **works** in the set are open even for a
partial (`WS7b`), because `WS1` omits what the gloss does not cover."* `§14.3.2` already relates on
`R_s` only, so nothing downstream changes; `07:1055`'s worked-example bullet needs the same edit.

---

### B.1 · The four late amendments, judged on their merits

Neither `WS7c`, the `INV-24` rescope, `ST6` nor `ST7` had been reviewed. Verdicts:

**`INV-24` rescoped to per record (`07:870`) — CORRECT, keep as is.** `ST4`'s subtraction makes
disjointness true per record **by construction**; document-wide it was never satisfiable without one
record's classification rewriting another's. The rescope states the guarantee the mechanism actually
provides. `emit.ts:340-345` matches. No finding.

**`ST6` (`07:372`) — CORRECT in substance, one cheap gap.** Refusing to fail the build on
inconsistent classification is right: the alternative rejects honest data, and the document remains
`VO1`-valid (each vocabulary's values are each used by at least one record). Two defects, both MINOR:
(i) `07:1126`'s rationale cites **`ND1`** to forbid a *consumer* behaviour — `ND1` is a
`P: MUST NOT` on the producer and does not bind the consumer; the correct citations are `VO2`
(ids opaque within one document) and `VO3` (a label is not a synonym dictionary). (ii) `ST6` has no
feedback channel at all, while `VO6` and `RD1` both **warn at build** for cheaper problems. A value
present in both document vocabularies is trivially detectable and is a pure authoring error. Add
*"P: SHOULD warn at build"*; that preserves the "not a build failure" decision and gives `ST6` teeth.

**`ST7` + `CINV-12` (`07:782`, `07:892`) — CORRECT, but it does leave an inconsistent style bonus, and
that should be recorded as an accepted limitation rather than left implicit.** The attack succeeds:
with 화이트 in both vocabularies, a visitor saying *"화이트톤으로 하고 싶어요"* gives the bonus to
`bi-01` (carries it in `style`) and not to `bi-05` (carries it in `tag`), although the two records are
factually identical on the attribute asked about — and `ST7` **mandates** exactly that
(*"never resolved site-wide, in either direction"*). It is bounded, and that is why I do not raise it
above NOTE: `ST3` (`07:777`) makes style a *weak bonus*, *"a style miss carries **no penalty**, and no
search fails for want of a style match"*, and the tag carrier remains matchable as a tag (`§4`:
`tag` is still a match key). So the worst case is a ranking wobble, never a dropped record or a wrong
statement. Record it the way `WS3` records its limitation — *"Accepted limitation"* with one line —
and say explicitly that the tag path still matches, so nobody implements `ST7` as "ignore that value
on the other records".

**`WS7c` (`07:329`) — CORRECT in force; it **does** delete one legitimate record shape, and the
contract states the cost as zero when it is zero only for the demo.** Keeping `INV-28`/`INV-29`
literal is the right call: a breadth claim no structural fact backs is what `§4` exists to prevent,
and the failure direction is safe (it *omits* rather than asserts). But:

- The deleted shape is *`projectType` known, `workScopeIds` unauthorable*, and it is reachable today,
  not hypothetically. `WS1` omits any source item that cannot be mapped without judgement, and
  `07:33-35` records that the live site carries **20 distinct free-text scope values for 8 records**
  (I recounted them in `data`: 20 exactly). A migrating site whose scope vocabulary is compounds the
  gloss does not cover loses breadth on **every** record, including records whose CMS states
  전체/부분 outright. `07:1124`'s *"no demo record loses data"* is true of the demo and of nothing
  else. One sentence recording the cost — and noting that `WS4` already permits an operator pass to
  author ids from the site's own scope field — is enough.
- `WS7c`'s illustration is unsupported: *"a breadth-absent record may omit it, and `bi-02` and
  `bi-08` do."* Nothing establishes that. `04` §0.2 says `workScopeIds` for bi-01…bi-08 is an
  authoring pass **outside** the spec, and `bi-02`'s `scope` `["거실","주방","침실","욕실"]` maps
  cleanly to `[living_room, kitchen, bedroom, bathroom]`, so there is no reason it would omit them.
  Cite a shape, not two records. (MINOR-7.)
- `WS7c` sharpens **M-11**: mandatory + judgement-authored + `WS1`-pruned + declared closed.

**The two cosmetic edits (notices 1 and 2) are both correct.** `PT2`'s last bullet now reads
*"absent — anything else (`PT6`)"* (`07:152`): citing `PT4` there became wrong the moment `PT4` was
scoped to `full_remodel`, and `PT6` is the omission rule. The `§15` reordering is verified —
`INV-17`…`INV-29` and `CINV-1`…`CINV-12` are each in numeric order and no text changed.

---

### B.2 · MINOR and NOTE

| id | sev | defect | where |
|---|---|---|---|
| MINOR-1 | MINOR | `§14.3.2` defines `R_s` and `Q_s` but row 2 and the `N-4` note use **`R \ Q`**; `Q` (the visitor's full requested set, trades included) is never defined. This is the formal hole behind **M-6**. | `07:751`, `07:762` |
| MINOR-2 | MINOR | `§14.3.2` row 1 says *"scope listed as not-evaluable"*, but `GR2`'s not-evaluable list is *"the criteria **the visitor stated** that were not evaluable"* — in row 1 the visitor stated no scope, so it cannot be listed. | `07:762` vs `07:795` |
| MINOR-3 | MINOR | `§14.3.1` says tiers run *"on `\|delta\|` as defined above"*, but the only definition above is `PB6`'s **budget** delta. The **area** delta's divisor is never stated (visitor's area? record's?). `PB6` exists so two consumers cannot differ; the area axis has no such guarantee. | `07:737` |
| MINOR-4 | MINOR | `PB6`'s (visitor `range` × record `range`) cell gives *"gap between nearer bounds, over the nearer visitor bound"* — a **magnitude**, where the other five cells give signed expressions and the surrounding prose insists `delta` is signed. | `07:730` |
| MINOR-5 | MINOR | `§12` treats an unrecognised `total.kind` as an *unknown value* but never says what remains of `pricing.total` then. `perArea.source` got the explicit treatment (*"treated as `perArea` absent"*); `total.kind` did not. | `07:601-604` |
| MINOR-6 | MINOR | `§7.3` glosses `built_in_furniture` as *"붙박이장, **조작** 가구"* — almost certainly 제작 가구. | `07:297` |
| MINOR-7 | MINOR | `WS7c` asserts `bi-02` and `bi-08` omit `workScopeIds`; nothing establishes it and both have fully mappable `scope` values. | `07:329` |
| MINOR-8 | MINOR | `§20.1`'s rationale for `ST6`/`ST7` cites `ND1` (a `P: MUST NOT` on the **producer**) to justify a **consumer** prohibition. `VO2`/`VO3` are the right citations. | `07:1126` |
| MINOR-9 | MINOR | `§20.1`'s `N-11` row describes `PB4` as *"a priced and an unpriced record that tie on every other signal must keep their pre-price order"* — the **weak** form `N-11` rejected. The normative `PB4` (`07:711`) and `CINV-5` carry the strong form. An implementer reading the change log builds the rejected rule. Same sentence in `05` Round 2. | `07:1105`, `05:305` |
| MINOR-10 | MINOR | `§20.1`'s `N-6` row says *"`PB1` had no 'visitor stated no **budget**' branch"*. `N-6` was about a stated **area**, and `PB1a` is the area condition. | `07:1100` |
| MINOR-11 | MINOR | `§20.1`'s `N-7` row says *"`GR1`–`GR5` had no precedence"*. `N-7` was about `GR2`'s **match classes**. | `07:1101` |
| NOTE-1 | NOTE | `§17`'s deferral still describes `workScopeIdsExcluded` as *"letting a `full_remodel` declare which spaces it skipped"*. Under rev 3 a `full_remodel` may skip **no** space (`PT4`b), so the field's purpose is now "letting a record that skipped a space still claim `full_remodel`". Restate, or the deferral reads as already satisfied. | `07:925` |
| NOTE-2 | NOTE | With visitor shape `max m`, every record at or under the ceiling gets `delta = 0` ⇒ `strong`, so a 6,200,000 job and a 99,000,000 job tie on price for a "1억 이내" budget. Consistent with OD-N, but worth a line: the `max` shape carries no discrimination. | `07:731` |
| NOTE-3 | NOTE | `RD1` is correct. Executed: `52,000,000/34 ⇒ T=5,200,000,000, A=3,400, floor(10,400,003,400/6,800) = 1,529,412` — the worked example's intermediates are exact. All 16 cases I ran agree with `Fraction` ROUND_HALF_UP, including `7/0.28 ⇒ 25`, ties `3/2 ⇒ 2` and `5/2 ⇒ 3`, and both guard trips (`1/100 ⇒ 0` caught by the output floor; `1e9/0.01 ⇒ 1e11` caught by the output ceiling). The new `A <= 100_000_000` guard is consistent with `T <= 100_000_000_000` (both follow from `≤ 2` fraction digits and a `1e9` magnitude cap) and keeps `area.value * 100` inside 2^53. No finding. | `07:473-490` |

---

## C · The five questions §18 hands the reviewer

### Q-2 — is the `"1.0"` reasoning sound, and is the `RO2` gate (two V0.2 publishes per site) sufficient?

**Yes and yes; the gate is one sentence short of being usable by the party bound by it.**

The `"1.0"` reasoning holds on three independent grounds, each checked against the frozen JSON rather
than against `07`'s summary of it. (i) `03` `SV2` lists *"field removal"* first under `major`, and
V0.2 removes `record.area`, `record.pricePerArea` and `facets.scope` — so `"0.2"` would be a minor
bump for a major change, and `SV2` is frozen and consumer-confirmed. (ii) `03` `SV1` makes the
manifest's and each document's versions independent (*"manifest and each resource document carry
their own, independently"*), so the `1.0`/`0.1` split is legal without amending anything, and
`INV-27` asserts the pair. (iii) The failure modes are asymmetric in the right direction: under
`SV3` an unknown major is TRANSIENT and *"keep last good data"*, whereas `"0.2"` gives a parsed
document with every V0.2 field ignored — a confident *"가격 정보가 없습니다"* on every case.
Reduced freshness beats a wrong answer. **One premise I did not re-verify:** the consumer's
`SUPPORTED_MAJORS = {0}` at `boost-chat: src/lib/first-party/contract.ts:35` — that repository is not
in this worktree. I take `06`'s code citation as read and flag it as the single unchecked input.

The gate is now the **right bound**: `03` `PC6` returns the previous pair *"unchanged, including its
`schemaVersion`"*, and rollback is a single step, so "both pointer slots ≥ 1.0" and "no rollback
target below 1.0" are the same statement. `N-9`'s complaint was not the bound but the **channel**,
and rev 3 dropped `06`'s proposed release-record clause without replacing it.

**Recommendation — add this sentence to `RO2`, and ship.** No new field is needed, because the
consumer can already observe the fact: *"The consumer evaluates this from what it already reads.
By `RO1` there is no dual emit, so once a site serves `schemaVersion >= 1.0` it does not go back
except by a `PC6` rollback. A consumer that has observed **two distinct `version` values at
`schemaVersion >= 1.0`** for site S has observed two successful V0.2 publishes for S, and both of S's
pointer slots are therefore `>= 1.0`. Until that holds for every registered site, the `"0.1"` read
path stays."* The producer-side release-record announcement is a fine belt-and-braces addition but is
not required, and requiring it makes the gate depend on coordination the rollout does not otherwise
need.

### Q-4 — is keeping both `PR4`'s `category` condition and the new `projectType` condition right, or does `category` now only add noise?

**Keep both — but fix the scope defect that keeping them exposes (M-10).**

Two reasons to keep, one measured, one procedural.

*Measured.* I computed the comparable pool over all 19 records. After `PB3`'s same-present-
`projectType` gate, the per-area-comparable set is `{bi-01, bi-07, bi-09, bi-10, bi-11, bi-12}` —
and **every one of them carries `category: full-remodel`**. So on today's corpus `PR4` excludes
**zero** additional pairs. It is redundant, not noise, and the distinction matters: it becomes
load-bearing the moment a `partial_remodel` carries an **authored** `perArea`, which OD-K explicitly
permits (*"An operator-supplied per-area price may be kept as `authored`"*). Two partials — a
`kitchen-bath` kitchen job and a `partial-remodel` entrance job — have the same `projectType` and
nothing but `category` stopping the consumer calling their per-평 prices "close". That is a real
future pair, and `PR4` is the only guard for it.

*Procedural.* `PR4` is a frozen `C: MUST` in the consumer's confirmation. `05` D-B2 restored it on
exactly this reasoning, `§3` states that V0.2 amends no frozen rule not named, and retiring a
consumer obligation is a consumer-confirmation event, not a producer-side edit. There is no argument
for retiring it here that would not equally have applied in round 1.

**What must change anyway.** `PR4`'s subject is *"prices"*, and V0.2 introduces a second price that
`PB1`/`PB6` compare and order across categories with no condition at all. Decide it explicitly
(**M-10**): either scope `PR4` to `perArea` in `§20` — with the consumer's confirmation, because it
is an amendment — or add the same-`category` condition to the total path. Also record in `§20`, for
the next revision rather than this one, that because `category` is the site's own taxonomy (`SD2`), a
site renaming a category silently changes which prices are comparable.

### Q-6 — is 4-of-8 breadth-absent the right trade against adding `workScopeIdsExcluded` now?

**Yes. Keep the split, keep the deferral — and state the cost, which is larger than §13 admits.**

*The four are each right on their own evidence.* I re-read all four bodies in `data`. `bi-02`: no
breadth statement anywhere in title, summary, body or quote — classifying it would be inference from
absence, which `PT3` forbids and which `05` already corrected once. `bi-03`: *"욕실은 … 그대로
두었습니다"* plus a `scope` that omits 안방, 욕실 and 작은방 of a 42평 flat (verified: `["현관",
"거실", "주방·팬트리", "아이방", "드레스룸"]`). `bi-05`: *"욕실은 상태가 좋아 실리콘과 수전만
교체했습니다"* — `PT4`(b)'s maintenance-level clause, and the reason `N-14` existed. `bi-08`: *"새
아파트라 철거 없이 진행했습니다"*, framed as 홈스타일링. Nothing here is a false negative.

*The alternative is a bad trade.* `workScopeIdsExcluded` buys back `bi-03` and `bi-05` and costs a
new wire field, a new consumer branch, and — decisively — a **sixth `D-1` precondition**: a
`full_remodel` with a non-empty exclusion list must not derive, or `D-1` emits a per-area price for a
dwelling one room of which was not remodelled. Adding a precondition to what OD-K calls *"the single
most important prohibition in V0.2"*, for two legacy records, is the wrong direction. `§1.1` and
task §60 both forbid overbuilding, and `05` deferred it on a rationale that rev 3 has now made true
(`PT4`(b) does give the protection, once **M-5**'s stale paragraph is deleted).

*The cost is understated and should be written down.* `§13` presents "absent 4" as a counting
result. It is also a **pricing** result, and I computed it: six live records carry an authored
`pricePerArea` — `bi-01` 2.9M, `bi-02` 2.4M, `bi-03` 3.2M, `bi-05` 2.6M, `bi-07` 2.7M, `bi-08` 1.6M —
and `PB3`'s same-present-`projectType` gate leaves exactly **two** of them comparable (`bi-01`,
`bi-07`). Two thirds of the live priced corpus goes dark for per-area comparison. The demo expansion
is what repairs it (`bi-09`…`bi-12`, four derived values, all `full_remodel`), which is precisely why
`04` is a hard prerequisite and not a nice-to-have. Add one sentence to `§13` saying so, or a reader
will take "absent 4" as costless. `04` §0.2 already carries the same counts, so the fixtures are not
wrong — the split is right in both documents or wrong in both, and I find it right.

### Q-7 — does any remaining statable field still hand the visitor a partial record's implied per-area figure? Is `D-1c` closed, or only moved?

**Only moved — and in truth it was never closed. This is BLOCKER M-1.**

*What a model can still state.* `GR1` (`07:820`) authorises, as fact: `projectType`, `workScopeIds`,
`property` (including `area.value`, `unit`, `basis`), `pricing`, `facets`, `title`, `location`.
`GR4` removes `pricing.perArea` from the envelope. It removes nothing else. So on every record that
has them, the model holds **`pricing.total`** and **`property.area`** simultaneously, plus the area a
second time in the `title`.

*The forbidden figure.* `total ÷ area` **is** `D-1`. `D-1c` forbids *"`D-1`, or any variant"*, and
`CINV-3` tests it — but `07:498` itself says that prohibition *"an LLM cannot be asked to obey on its
own honour"* and points at §14.5 for enforcement. §14.5's two mechanisms both miss:

- `GR4` is an **envelope** rule, and it now withholds only D-1's **output**, never an input.
  Withholding a value the model does not need is not a protection.
- `GR5` is an **output** invariant, and it enumerates exactly two forbidden numbers: the *product*
  `perArea × area`, and `budget / area`. The *quotient* `total ÷ area` is neither. `CINV-2` copies
  the same enumeration, so the test misses it too.

*Computed, on the fixtures that exist for this very purpose:* `bi-19` 11,000,000 / 32평 =
**343,750** (the number `04` §4.1 says the answer must not contain); `bi-16` 19,800,000 / 38평 =
**521,053**; `bi-14` 15,000,000 / 84㎡ = **178,571/㎡**; `bi-13` 125,000,000 and 140,000,000 / 48평 =
**2,604,167** and **2,916,667** (which `04` §2 says *"nobody may compute or emit"*); and OD-K's own
sentence — a 34평 flat whose bathroom cost 6,000,000 — is **176,471/평**.

*Is the inversion still right?* Yes. I re-verified `06`'s premise directly in `data`: all eight
titles carry the area, so withholding `property.area` protected nothing, and it cost the area
criterion an input it needs (`PB1a`, `GR2`). Rev 3's `GR4` is strictly better than rev 2's. It just
was never the thing standing between the model and `total ÷ area`, because rev 2 did not withhold
`pricing.total` either. Neither review caught it; it is a live defect in rev 3 regardless.

**Recommendation.** Do **not** re-invert `GR4` and do **not** withhold `pricing.total` — that would
delete the one fact a budget conversation is about. Close it at the output invariant, where it is
testable:

> `GR5` → *"no number in the assistant's reply equals (i) the product of any `perArea` and any area,
> or (ii) the **quotient of any price amount and any area** — where "price amount" means
> `total.amount`, `total.minAmount`, `total.maxAmount`, any `perArea.amount`, or the visitor's stated
> budget — where the area appears in, or is derivable from, the result, **including an area stated in
> a `title`**, and where the two operands need not come from the same record."*

`CINV-2` takes the same enumeration. Nothing legitimate is lost: the only per-area figure a visitor
may properly be told is the producer's own `perArea`, which `GR4` releases the moment they ask for
it. For a `range` total, and for every `partial_remodel` and breadth-absent record, there is no
legitimate per-area figure at all — which is the whole point of `D-1a`.

### Q-8 — does `PA5` interact safely with `AR5`, or does it let two records with different bases be called comparable through `PB3`?

**On the question as asked: safe. One level down: it is a definition with nothing hanging off it, and
it leaves a real mis-claim reachable. See M-9.**

*The narrow answer is no, it does not.* `PB3` (`07:706`) keeps *"`AR5` permits the **area bases** to
be compared"* as a separate conjunct, and `AR5` — *"supply ↔ exclusive is never converted by either
side; different bases are not compared"* — is unamended and restated by `PY1`. A derived `perArea`
inheriting `supply` and one inheriting `exclusive` are blocked by that conjunct. `PA5` does not
loosen it. `04`'s `bi-14` (84㎡ **exclusive**) versus the 34평-supply records is the fixture for
exactly this, and it holds.

*Three problems one level down.*

1. **`PA5` claims to make a condition evaluable that does not read it.** `PA5` says *"`source` is
   therefore what tells the consumer whether the price basis is known… This is what makes `PB3`'s
   `AR5` condition evaluable"*. But `PB3` tests the **area** bases, and `PA4`/`PA5` are about the
   **price** basis — *which area figure the price is stated against*. Those are different facts; V0
   `PR2` exists precisely because they are. I grepped §14: **no rule anywhere references
   `perArea.source`.** `PA5` is presently inert.
2. **`AR5`'s third clause obliges nothing.** *"One unknown basis **lowers confidence**"* is all that
   stands between a known-basis derived price and an unknown-basis authored one, and "confidence" is
   defined nowhere in V0 or V0.2 — no field, no threshold, no disclosure requirement.
3. **The resulting mis-claim, computed.** `PB3` permits comparing `bi-01`'s authored 2,900,000/평
   (price basis unknown, `PA4`) with `bi-09`'s derived 1,470,588/평 (price basis = `supply`,
   `PA5`): same `projectType` (`full_remodel`), same `category` (`full-remodel`), same currency and
   `perUnit`, and both **area** bases are `supply` so the `AR5` conjunct passes. If `bi-01`'s operator
   priced against the **exclusive** area — 34평 supply ≈ 25.4평 exclusive by `AR4`'s 400/121 — the
   comparable supply-basis figure is ≈ 2,170,000/평, and "roughly half the price" is wrong by about a
   third. This exposure is **new**: in V0 every `perArea` was authored and every price basis equally
   unknown, so every comparison was uniformly uncertain. V0.2 puts known-basis and unknown-basis
   prices in one pool and gives the consumer no rule to distinguish them in a claim.

**Recommendation, preferred form.** Add a fourth conjunct to `PB3`, and a consumer invariant:

> *"…and both `perArea` values have a **known** price basis — that is, both carry
> `source: "derived"`, whose price basis is `property.area.basis` by `PA5` — and those bases are
> equal. An `authored` `perArea` may be **displayed** as a fact but is never the subject of a
> closeness, ordering or "cheaper/dearer" claim, because `PA4` leaves its price basis unknown."*
> `CINV-13`: a comparison claim is never made between an `authored` and a `derived` `perArea`.

Cost, computed on the corpus: this removes `bi-01` (2,900,000) and `bi-07` (2,700,000) from per-area
comparison and leaves `bi-09`…`bi-12`. That is the honest outcome — `§13` already tells the reader
the live authored prices are the weak part of this corpus — and it also gives `PA5` the referent it
currently lacks.

**Minimum acceptable form**, if that is judged too strict for V0.2: say in `PB3` *which* basis it
tests (area, not price), and give *"lowers confidence"* an observable meaning — a stated caveat in
the reply — because as written it means nothing and an implementer will drop it.

---

## D · Consistency of the two dependent documents

### D.1 `04-demo-data-spec.md` rev 2 against contract rev 3

**Consistent, verified item by item:** the counts (§0.2 *"full 2 (bi-01, bi-07) · partial 2 (bi-04,
bi-06) · absent 4"* matches `07:629`); the `ST4` field-map row (§0.1 now says the emitter emits
`facets.tag` as `keywords` minus style, reversing rev 1); the `PT4` citations on `bi-09`/`bi-11`
(rev 1's deleted-`PT2` citations are gone, as `06` asked); `bi-19` promoted to **required** with
Appendix A retired; `E1b` and `X5` fixturing `INV-19` and `INV-29`'s negative case. **All four derived
values recomputed with `RD1` and they agree exactly**: `bi-09` 50,000,000/34 ⇒ **1,470,588**;
`bi-10` 85,000,000/34 ⇒ **2,500,000**; `bi-11` 30,000,000/20 ⇒ **1,500,000**; `bi-12` 52,000,000/26
⇒ **2,000,000**; `bi-13` correctly expects **none** (`kind: "range"` fails D-1 condition 2).

**Contradictions (each is a finding):**

| id | sev | contradiction |
|---|---|---|
| **D-1** | MAJOR | `04` §4.1 expects *"34평 전체 5천이면 되나요 → **bi-09 exact**"* and *"예산 3천으로 전체 가능해요? → bi-11"*. Under `07` rev 3 both records are `full_remodel`, §14.3.2's last row assigns them `fallback_from_full`, and `GR2`'s precedence puts that **ahead of** `exact`. `exact` is unreachable for either. One of the two documents must move — see **M-2**. |
| **D-2** | MAJOR | `04` §1/§2 author `bi-14` as `[kitchen]` and `bi-16` as `[kitchen, bathroom]`, while both bodies describe tiling and plumbing the total paid for. `WS7a` declares a partial's set *"the complete set of spaces **and works** the `pricing.total` covers"* and `WS7b` lets the consumer rely on it — so `04`'s authoring makes a consumer statable falsehood. See **M-11**. |
| **D-3** | MINOR | `04` §4.1: *"주방만 하면 얼마예요 → bi-14 (15M) exact; bi-16 (19.8M, + 욕실 2곳) as **scope_overlap**"*. Under rev 3, `R_s = {kitchen, bathroom} ⊋ Q_s = {kitchen}` ⇒ **`scope_superset`**, not `scope_overlap`. `scope_overlap` requires neither set to contain the other. |
| **D-4** | MINOR | `04` §4.1 requires that the answer for `bi-19` *"must **not** say 343,750원/평"*, and §2 repeats it. No rule in rev 3 enforces it — see **M-1**. `04` is right and the contract is missing the rule. |
| **D-5** | MINOR | `04` §2 `bi-09` calls `RD1`'s rounding *"half-away-from-zero"*; `07:480` says *"round half up"*. Identical for positive operands, which `§9`'s positivity rule guarantees — `06` asked for one word and rev 2 did not apply it. |
| **D-6** | MINOR | **`INV-21` has no fixture.** `04` §6 states, deliberately, that *"Authored `pricePerArea` is never combined with a total on the same record"* — so no record in the 19 has `full_remodel` + authored `perArea` + exact total, and *"an authored `perArea` is never replaced by a derived one"* ships untested. The risk is low (`emit.ts:319-326` orders authored-before-derived by construction, D-1 condition 4), but `04` promoted `bi-19` on exactly this argument for `INV-19` and should say why `INV-21` is treated differently. |
| **D-7** | MINOR | `04` §4 row `X3` is headed *"`full_remodel` with a prose exclusion"* and lists *"bi-03 existing (욕실)"*. `bi-03` is breadth-**absent** under rev 3, not `full_remodel`. |
| **D-8** | NOTE | `04` §0.2 calls authoring `workScopeIds` for bi-01…bi-08 *"an authoring pass outside this spec"*. Under the new **`WS7c`** that pass is now a **hard prerequisite** for `bi-01`, `bi-04`, `bi-06` and `bi-07`: without it none of the four may carry `projectType` at all, and §13's counts collapse to full 0 · partial 0 · absent 8. One line in §0.2. |

**On the late `bi-19` rewrite (notices 3 and 4): directionally right, currently a net regression.**
An isolated `INV-29` negative fixture is genuinely needed — the previous body excluded 주방/욕실, so
`PT4`(b) fired independently and the record never exercised `PT4`(c) at all, and `04` X5 claims it
does. But the rewrite removed the record's only authoring-independent disqualifier and left the
outcome resting on an undefined term, opening the path to `343,750/평` with a `derived` badge
(**M-4**). Keep the new body; add the one sentence that fixes "touched a space", and add it to
`bi-19`'s authoring note.

### D.2 `05-review-disposition.md` against contract rev 3

**Consistent:** all 14 Round-2 acceptances map to text I located and read in rev 3; the four
"Found by the orchestrator" items map to `§20.1`'s four self-found rows; the `bi-05` reclassification
and the full 2 / partial 2 / absent 4 counts match `§13`; step 4's three propagations to `04` all
landed.

**Contradictions:**

| id | sev | contradiction |
|---|---|---|
| **D-9** | MINOR | `05` Round 2, `N-11` row: *"`PB4` given an explicit ordering-neutrality statement: a priced and an unpriced record tied on every other signal keep their pre-price order."* That is the **weak** form `06` `N-11` explicitly rejected (*"With `limit = 3` over 18 records that is no protection"*). The contract's actual `PB4` (`07:711`) and `CINV-5` carry the **strong** form. `07:1105` repeats `05`'s wrong description. The normative text is right; both change logs are wrong, and an implementer reading either builds the rejected rule. |
| **D-10** | NOTE | `05`'s round-1 "Record reclassification" table still shows rev 2's **full 3 · partial 2 · absent 3** with `bi-05` as `full_remodel` and *"the caveat is logged, not overridden"*. It is labelled rev 2 and is superseded by the Round 2 section, so it is history rather than a live contradiction — but it is the same sentence **M-5** attacks in the contract, and a reader who stops at the first table gets the wrong answer for `bi-05`. Add a pointer. |
| **D-11** | NOTE | `05` records `Q-2` and `Q-4` as *"not reached"* by round 2 and carried into rev 3 §18. Correct — `06` §D did assert one-line answers to Q-2 and Q-4 in its closing paragraph, but they are not worked and §18 is right to carry them. Both are answered in §C above. |

---

## E · What must change before freeze

Blocking, each with a concrete fix above:

1. **M-1** — extend `GR5`/`CINV-2` to the **quotient** of any price amount and any area. Without it
   `D-1c` has no enforcement point and OD-K's forbidden figure is one division from two authorised
   fields. (This is `Q-7`.)
2. **M-2** — scope §14.3.2's last row to scope-stated requests, so `fallback_from_full` /
   `unknown_type_fallback` are assigned only on the `GR3` ladder and `exact` is reachable for
   `full_remodel`. Without it the contract's own §1 query cannot be answered as a match.
3. **M-3** — make §14.3.2's row 1 condition `Q = ∅`, and state that the rows are evaluated in order.
   Without it the table returns two opposite budget verdicts for the same record.
4. **M-4** — one sentence fixing "touched a space" in `WS9`/§7.3, plus the matching line in `04`'s
   `bi-19`. Without it `PT4`(c)/`INV-29` is a judgement wearing a machine check, and the OD-K fixture
   can emit the number it exists to forbid.
5. **M-5** — delete or rewrite §13's "Recorded caveat" paragraph. `N-14` is otherwise not closed.
6. **M-6** — give §14.3.2 a clause for trades the **visitor** named.
7. **M-7** — `PB1a` → *"`strong` or `acceptable`"*, matching `GR2`.

Should change, and are cheap enough that not doing them is a choice: **M-8** (label the unevaluable
`P: MUST`s, as `WS9` and `ST6` already are), **M-9** / `Q-8` (`PB3`'s basis conjunct), **M-10** /
`Q-4` (decide `PR4`'s scope explicitly), **M-11** (scope `WS7a`'s closure to Spaces), `D-1`…`D-8` in
`04`, `D-9` in `05`, and MINOR-1…MINOR-11.

Not re-opened: `D-1`'s existence; `schemaVersion "1.0"` (sound — `Q-2`); `workScopeIdsExcluded`
(deferral is right — `Q-6`); `WS3` sets-not-counts; `PR4`'s restoration; the `GR4` inversion itself;
`RD1`'s arithmetic (verified correct by execution); the `INV-24` rescope, `ST6` and `ST7` (correct as
decided, with MINOR-7/8 and the `ST6` build warning as the only asks).
