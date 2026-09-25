# 06 — Delta review of Contract V0.2 **rev 2** against `05-review-disposition.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write `07`, `05`, `04`, `02` or `03` |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (rev 2) |
| checklist | `docs/result/interior-portfolio-v0.2/05-review-disposition.md` (D-B1…D-B6, D-M1…D-M15) |
| also read | `02-review-contract-soundness.md`, `03-review-consumer-realism.md`, `04-demo-data-spec.md`, `01-owner-decisions.md`, frozen V0 `docs/reports/integration/03-integration-contract-v0-candidate.json`, `data/sites/boost-interior-demo/content/projects.json` (8 records, read to check §13), `platform/publish/publish.ts`, `boost-chat: src/lib/first-party/{contract,interior-state}.ts` |
| scope | **DELTA only.** Settled ground is not re-opened. One deferred item (`workScopeIdsExcluded`) is re-opened; the new reason is stated. |
| verdict | **NOT READY.** 3 new BLOCKER · 10 new MAJOR. 8 of 21 dispositioned items are FIXED as claimed; 11 are PARTIAL; 1 is REGRESSED; 1 has no home. |

Arithmetic in §B-2 was executed, not reasoned about. V0 rule texts were extracted from the frozen
JSON and compared string-by-string.

---

## A · Disposition checklist

| id | verdict | evidence in rev 2 |
|---|---|---|
| **D-B1** `PT2` exclusion clause | **REGRESSED** | The clause is gone (§5.2 *"A space exclusion now always disqualifies — `PT4`(a)"*) — but `PT4`'s preamble reads *"`projectType` is **omitted** whenever any of these holds: **(a)** the source states that a **space** was excluded"*, which applies to `partial_remodel` too. `bi-06`'s body says *"방과 주방은 상태가 좋아 **그대로 두고**"* — the identical construction §13 cites as `PT4`(a) for `bi-03` — yet §13 row `bi-06` assigns `partial_remodel`. See BLOCKER **N-1**. |
| **D-B2** `PB1`/`PB3` budget claims | **PARTIAL** | All four holes have text. Hole 4 is airtight: `PB3` *"both records carry the **same, present** `projectType` … A record with **absent** `projectType` is never in a per-area comparison"*, `PR4` restored. Hole 2's fix is over-tight: `PB1` requires *"`property.area` is `AR5`-comparable **with the visitor's stated area**"*, unsatisfiable when the visitor states none (MAJOR **N-6**). Hole 1's set algebra is computed over a set that mixes spaces and trades (MAJOR **N-4**) and has no row for disjoint sets (MAJOR **N-5**). |
| **D-B3** `WS7` open/closed | **FIXED** | `WS7a` *"when `projectType == "partial_remodel"`, `workScopeIds` is **closed**: it is the complete set of spaces and works the `pricing.total` covers"*; `WS7b` open otherwise; `INV-28` gives it a referent. |
| **D-B4** `GR2` unenforceable | **PARTIAL** | Per-record class ✓, closed list ✓, `exact` defined ✓ (*"every criterion the visitor stated was evaluated and satisfied"*), not-evaluable list ✓, `CINV-4` ✓. But nothing defines **"satisfied"**, `price_fallback` appears in the closed list with no assignment rule, and no precedence exists when two classes apply. See MAJOR **N-7**. |
| **D-B5** `D-1c` enforcement point | **PARTIAL** | `GR4` and `GR5` are both present as written. `GR4` suppresses `property.area` but not `title`, and **every one of the 8 live records** carries its area in the title (`bi-01` "34평", `bi-02` "24평", … `bi-08` "51평"), as do 10 of `04`'s 11. See BLOCKER **N-3**. |
| **D-B6** `INV-22` fails on valid data | **PARTIAL** | Restated: *"`pricing.total` is only ever a copy of a source field; no emitted value is *computed* as `perArea × area`. Asserted on the code path, not on arithmetic"*, and the `INV-9`/`INV-10` carve-outs are present verbatim. The false build failure is gone. But no executable form is given and `RD1`'s own division is not carved out. See MAJOR **N-8**. |
| **D-M1** `category` demotion | **FIXED** | §4 *"SITE TAXONOMY \| `facets.category`, `facets.tag` \| **still match keys**, exactly as in V0"*; `SD2` added. *(Residual: `SD1` is worded on **values** — "A value that is a structured fact is not also emitted as a facet value" — not on **facts** as `05` describes it. §19 passes only because `"full_remodel" ≠ "full-remodel"` as strings.)* |
| **D-M2** citation defects | **PARTIAL** | Fabricated V0 quote removed (§9.1 now: *"The requirement is owner-stated, task §10 / OD-I; it is not a V0 rule."*); `ND1` restated verbatim against the frozen JSON (*"inferred, estimated, converted or synthesised"* — exact match); `OD-A` now resolves; §13 is the audit. **But `OD-I` says only *"Support both `pricing.total` and `pricing.perArea`. Semantically wrong arithmetic is forbidden."*** — it does not contain the exact-XOR-range requirement it is cited for. Fix: cite task §10 alone, or add the clause to `01` under `OD-I`. |
| **D-M3** `PA4`/`PA3` basis | **PARTIAL** | `PA4` now correctly describes `PR2` (*"the **price basis** — which area figure the price is stated against"*, with *"Inclusion scope is `PR3`, covered by `TP2`"*), and `PA3` states inheritance. The contradiction `02` M-4 named survives: `PA4` says the price basis *"is unavailable in V0.2 and is unknown"* **for every `perArea`**, while `PA3` says a derived one inherits `property.area.basis`. `PB3`'s *"`AR5` permits the area bases to be compared"* is still unevaluable without knowing which. Fix (as proposed and not applied): `PA4` → *"`PR2` survives for an **authored** `perArea`; for a derived one the area basis is `property.area.basis` by construction (`PA3`)"*, plus one sentence in §9.2 that `source` determines whether a basis is known. |
| **D-M4** `SV2-pre1` / rollback | **PARTIAL** | `SV2-pre1` is gone; `SV1`–`SV5` are listed *"**unchanged and unamended**"* in §20; `RO2` is gated. The gate is not checkable by the party bound by it — MAJOR **N-9**. |
| **D-M5** work-scope vocabulary | **PARTIAL** | §7.3 carries a "covers" gloss for all 26 ids ✓; `WS9` added ✓; §2 narrows the annex to *"a dwelling or a comparable unit"* ✓. `WS9`'s *"when the **source** names a work, use the work id"* does not say whether "source" is the prose or the authored field, and collides with `WS4` — MAJOR **N-10**. |
| **D-M6** consumer internals | **FIXED** | `GC1` is observable (*"Observable test: a vertical with no built space can be added without touching conversation, tool dispatch, gating, audit, card transport or lead storage"*); §8 *"A limit for `style` is **to be declared by the consumer** through the `VO6` procedure"*. |
| **D-M7** `ST4` deleted `tag` | **PARTIAL** | `tag` is kept (§8 *"**kept, still emitted.** Descriptive words that are not style"*; §10.1 *"unchanged \| still emitted, still a match key"*). But `ST4` reads *"The split is **authored** in the source, **never computed by the emitter**"*, which contradicts §8's own "descriptive words that are not style" and makes `INV-24` fail on 18 of the 19 records in `04` + `projects.json`. BLOCKER **N-2**. |
| **D-M8** floating-point `RD1` | **FIXED** | §9.3 `RD1` is integer-only and correct; verified by execution on 9 cases including exact division, a true tie, `7/0.28`, `area.value = 0.01` and `total.amount = 1e9` (§B-2). |
| **D-M9** `location` weight | **FIXED** | `LO1`: *"`record.location` contributes **0** … no score weight, no tie-break, and it is not reported as an applied search criterion"*; `CINV-1` is the permutation test. |
| **D-M10** missing ⇒ never shown | **PARTIAL** | `PB4` has the clause, but it forbids only **last place**: *"a not-evaluable record is never sorted below every evaluable record merely for being not evaluable"*. With `limit = 3` over 18 records that is no protection. MAJOR **N-11**. |
| **D-M11** visitor budget shape | **PARTIAL** | `VB1` ✓ (*"`600~800만원 정도` is a range of 6,000,000–8,000,000 KRW, not `800만원`"*), `VB2` ✓, `PB6` ✓, `CINV-8` ✓. `PB6` is not total: no ceiling shape, no positivity guard, endpoint-touching ranges undefined. MAJOR **N-12**. |
| **D-M12** negated style | **FIXED** | `ST5`: *"only a style the visitor stated **positively** becomes a recorded preference … A negated preference ("너무 화려한 건 싫어요") must not produce a positive bonus"*; `CINV-7`. |
| **D-M13** §19 vs §13 | **FIXED** | §19 is headed *"Worked example — illustrative, not live data"* and says *"no live record has a `pricing.total` today (§13)"*. Fixture widening landed in `05`; one required fixture is missing from `04` — see §C. |
| **D-M14** `PROPERTY_TYPES` / `TOP_LEVEL_KEYS` | **NO HOME** | Verified still true in code: `PROPERTY_TYPES = ["apartment","villa","house","officetel","shop","office","other"]` (`interior-state.ts:45`) vs §6's `apartment\|officetel\|villa\|detached_house\|mixed_use\|commercial`; `TOP_LEVEL_KEYS` is a strict allowlist returning `null` on an unknown key (`:220`). Correctly absent from rev 2 (`GC1`/`D-M6`), but no work-package document exists anywhere under `docs/`. Fix: one line in §16 step 1 — *"the consumer's state-parser key allowlist and property-type vocabulary are extended **before** any row is written with a new key."* |
| **D-M15** `WS2` closure | **FIXED** | §12: *"`workScopes` present but closure broken against **the document's own declaration**"*, with the note *"An id that is simply **unknown to the consumer** is not a closure failure"*; `WS8`; `CINV-9`. Also confirmed: `05`'s rejection of R1 m-6 was applied (`facets.category` length ≠ 1 is no longer in §12's record-level list) and m-1/m-7 landed (*"non-positive"*; *"A `perArea` whose `source` is missing … is treated as **`perArea` absent**"*). |

---

## New BLOCKERs

### N-1 (BLOCKER) · `PT4`(a) omits `projectType` for **every** `partial_remodel`; rev 2 §13 contradicts itself on live data

**Rule attacked.** §5.3: *"**PT4 (authoring rule, P: MUST)** — `projectType` is **omitted** whenever any of
these holds: **(a)** the source states that a **space** was excluded from the project;"*

`PT4` is not scoped to `full_remodel`. A `partial_remodel` is *defined* by excluding spaces, so every
partial states a space exclusion, and `PT4`(a) deletes it.

**Counterexample, verbatim from `projects.json`.** `bi-06` body: *"**방과 주방은 상태가 좋아 그대로
두고**, 손님이 가장 먼저 보는 현관과 거실에 집중했습니다."* This is the same construction — the same
verb — that rev 2 §13 cites as the `PT4`(a) trigger for `bi-03` (*"**욕실은** … **그대로
두었습니다**" — a **space**"*). §13's `bi-06` row nevertheless assigns `partial_remodel`. Under `VA1`
(fail-closed on every `P: MUST`) the emitter cannot satisfy both §13 and `PT4`, so an opted-in build
cannot be produced at all.

Same collision on `bi-04` (*"주방과 욕실 **두 곳만 골라**"*), and on `04`'s `bi-14` (*"다른 곳은 …
상태가 좋았고, 주방 한 곳에만 예산을"*), `bi-15` (*"**다른 공간은 손대지 않고** 공용 욕실 한 곳만"*),
`bi-17` (*"주방과 욕실은 아직 쓸 만했지만 … 범위를 좁혔습니다"*), `bi-18` (*"**다른 공간은 손대지
않고** 현관과 복도 수납만"*). Applied literally, rev 2 leaves **zero** `partial_remodel` records,
which unexercises `WS7a`, `INV-28`, `PB1`'s partial branch, all of §14.3.2, `GR3`'s ladder and the
second of §1's two motivating queries.

**Fix (one edit).** Split `PT4`'s preamble by the value it governs:

> **PT4** — **`full_remodel` is not emitted** when (a) the source states that a space was excluded, or
> (b) the project is defined by a narrow set of trades across the dwelling. **`projectType` is omitted
> entirely** when (c) the source presents the project as something other than a remodel, or (d) the
> source makes no explicit statement of breadth at all. **`partial_remodel` requires** the source to
> state a bounded set of spaces (`"…만"`, `"부분"`, `"세 곳만"`); the spaces it excludes are the
> complement and are not a disqualifier.

### N-2 (BLOCKER) · `ST4` forbids the emitter computing `tag = keywords \ style`, so `INV-24` fails on 18 of 19 records and the build fails `VA1`

**Rules attacked.** §8 table: *"`tag` … **kept, still emitted.** Descriptive words that are not
style."* versus `ST4`: *"no value appears in both `style` and `tag` (`SD1`). The split is **authored**
in the source, **never computed by the emitter**, so `INV-25` has a referent."* And `INV-24`: *"no
value appears in both `facets.style` and `facets.tag`"*.

`04` §0.1 authors `style` as *"a **separately authored** subset"* of the record's descriptive words
while *"`keywords` keeps feeding the site's own keyword row"*. With `tag` sourced from `keywords` and
`style` a subset of it, every value in `style` is also in `tag`.

**Counterexamples.** `04` §2: `bi-09` `keywords ["화이트","베이지"] / style ["화이트","베이지"]` —
identical. So are `bi-11`, `bi-12`, `bi-13`, `bi-14`, `bi-15`, `bi-16`, `bi-17`, `bi-19`. `bi-10`
overlaps on 모던 and 그레이지. In `projects.json`, `bi-01`'s `keywords` are
`["화이트","미니멀","간접조명","수납 특화"]` and §19 emits `style ["화이트","미니멀"]` — overlapping
unless the emitter subtracts, which `ST4` forbids. **18 of the 19 records fail `INV-24`; only `bi-18`
(no keywords, no style) passes.** `VA1` is fail-closed, so the public build fails.

Note this is the *exact* text `02` M-8's accepted fix proposed and `05` D-M7 dispositioned
(*"`style` carries style values, **`tag` carries the rest**"*), which rev 2 did not carry over.

**Fix (one sentence).** `ST4` → *"`facets.style` is emitted from the record's authored `style` field;
`facets.tag` is emitted as the record's authored descriptive words **minus** its `style` values. The
**classification** (which words are style) is authored — `INV-25`'s referent — the **subtraction** is
mechanical and is not an inference."*

### N-3 (BLOCKER) · `GR4` is defeated by `title`, which is a `GR1` statable field, on every record in the corpus

**Rules attacked.** `GR4`: *"`pricing.perArea` and `property.area` are **not both present on the same
record in the model-facing result** unless the visitor asked for a per-area comparison. Co-presenting
them is an invitation to multiply."* and `GR1`, which lists *"`title`"* among the values that may be
stated as fact.

Every title in `projects.json` carries the area: `수성 화이트 **34평** 아파트 리모델링` (bi-01),
`신혼부부를 위한 **24평** …` (bi-02), `**42평** 가족형 …`, `**32평** 주방·욕실 …`, `**29평** …`,
`**34평** 현관·거실 …`, `**19평** 소형 …`, `**51평** 신축 …`. In `04`, 10 of 11 do (`bi-15` is the
only exception). Suppressing `property.area` leaves the number in plain sight one field over:
`bi-01` arrives as `perArea 2,900,000 KRW/평` + `title "수성 화이트 34평 아파트 리모델링"`, and
`2,900,000 × 34 = 98,600,000` is the exact model-computed total `03` B-3 constructed. `GR4` blocks
nothing.

Second hole: `GR5` reads *"no number in the assistant's reply equals `perArea × area` … **for any
record in the result**"*, which does not say whether the two factors must come from the **same**
record. A result containing `bi-01` (perArea shown, area suppressed) and `bi-09` (area shown, perArea
suppressed) hands the model both factors legitimately.

**Fix (two edits, both cheap and both already implementable — `executor.ts` owns the envelope).**
1. Invert `GR4`: suppress the **price**, not the area. *"`pricing.perArea` is omitted from the
   model-facing record unless the visitor asked for a per-area comparison. `property.area` is always
   carried — it is needed to evaluate the area criterion — and a title may state it."* `pricing.total`
   is unaffected, so nothing a visitor actually asks about is lost.
2. `GR5` → *"…equals `p × a` for **any** `perArea` value `p` and **any** area value `a` appearing in or
   derivable from the result, including areas stated in a `title`."*

---

## New MAJORs

### N-4 (MAJOR) · §14.3.2's set relations are computed over a set that mixes spaces and trades, so `WS9` turns the contract's own headline queries into `scope_superset`

§14.3.2 defines `R = record.workScopeIds` and `Q` = requested scopes, and `R ⊋ Q` ⇒ *"**not
permitted** — the total bought extra spaces"*. But `workScopeIds` holds spaces **and** trades
(§7.3, deliberately: *"The list mixes spaces and works on purpose"*), and `WS9` requires trades to be
authored: *"when it names a **work**, use the work id"*.

**Counterexample on `04`'s own expectation table (§4.1).** `bi-14`'s body names 상판, 벽 타일, 후드,
싱크볼; under `WS9` its ids become `[kitchen, tiling, plumbing]`, not `[kitchen]`. Visitor "주방만 하면
얼마예요" gives `Q = {kitchen}` ⇒ `R ⊋ Q` ⇒ `scope_superset` ⇒ **not comparable** — while `04` §4.1
expects *"bi-14 (15M) exact"*. Same for `bi-17` (body: *"벽지는 거실만 새로 하고"* ⇒ `wallpaper`) against
"바닥이랑 거실만". Comparability now depends on how finely the operator authored, not on the facts.

**Fix.** Relate on spaces; disclose trades:

> Let `R_s = R ∩ Spaces(§7.3)` and `Q_s = Q ∩ Spaces(§7.3)`. The class is the relation of `R_s` to
> `Q_s`. A budget comparison is permitted when `R_s == Q_s`; the set `R \ Q` (trades the case included
> that the visitor did not name) MUST be disclosed by name ("이 사례 금액에는 집 전체 바닥 공사가
> 포함되어 있습니다"). `exact` requires `R == Q`; `R_s == Q_s` with `R \ Q ≠ ∅` is
> `scope_superset`, **comparable with disclosure**. `R_s ⊋ Q_s` is `scope_superset`, **not
> comparable**.

Checked: `bi-16` vs "주방이랑 욕실만" ⇒ `exact`; `bi-16` vs "욕실만" ⇒ not comparable (correct, the
19,800,000 bought a kitchen); `bi-17` vs "바닥이랑 거실만" ⇒ comparable with disclosure; `bi-14` vs
"주방만" ⇒ comparable with disclosure, at any authoring granularity.

### N-5 (MAJOR) · §14.3.2 has no row for disjoint sets, and none for non-partial records that are not supersets; `GR2` is then unsatisfiable

The table's five rows are `R == Q`, `R ⊋ Q`, `R ⊊ Q`, partial intersection (*"overlapping but neither
contains the other"*) and `Q ⊆ R` with a non-partial `projectType`. **Disjoint** (`R ∩ Q = ∅`) matches
none of them, and a non-partial record with `Q ⊄ R` matches none of them.

**Counterexamples.** Visitor "욕실만 600~800만원" (`Q = {bathroom}`) against `04`'s `bi-18`
(`[entrance, storage]`, partial) and against `bi-19` (`[flooring, wallpaper, lighting]`, breadth
absent) — both disjoint, neither gets a class. `GR2` (`C: MUST`) says *"**every** returned record
carries a match class from the closed list"*, and `TI1` forbids applying tiers so that *"an ordinary
request returns zero records"*, so these records will be returned and cannot be classed.

Also: the table's own premise *"`R = record.workScopeIds` (closed by `WS7a`)"* is false in its own
last row, which covers non-partial records where `WS7b` makes `R` open.

**Fix.** Add a row `R ∩ Q = ∅` ⇒ not permitted, class `scope_disjoint` (add to `GR2`'s closed list),
and change the last row's condition from `Q ⊆ R` to *"`projectType != partial_remodel`, any
relation"*, with the note that `R` is open there and the relation is therefore advisory only.

### N-6 (MAJOR) · `PB1`'s new area condition is unsatisfiable when the visitor states no area, which kills `04`'s own "예산 3천으로 전체 가능해요?"

`PB1`: *"`projectType == "full_remodel"` and the visitor asked about whole-home work **and**
`property.area` is `AR5`-comparable **with the visitor's stated area** and within the `acceptable`
tier of §14.3.1 — otherwise the record is `area_fallback`, not a budget match"*.

A visitor who gives a budget and a breadth but no area has no stated area, so the condition cannot
hold, so **every** `full_remodel` is `area_fallback` and **no** whole-home budget claim is ever
permitted. `04` §4.1 expects exactly this shape to work: *"예산 3천으로 전체 가능해요? → bi-11 (20평
빌라, 30M)"*. Under `PB1` `bi-11` is `area_fallback`. The fix for D-B2's hole 2 over-shot: the review's
ask was that a *stated* area must be honoured, not that an *absent* one must block.

**Fix.** *"When the visitor stated no area, the area condition is **not applicable** rather than
failed: the budget comparison is permitted and `area` is reported in that record's not-evaluable
criteria (`GR2`), so the assistant states the case's area rather than claiming an area match."*

### N-7 (MAJOR) · `GR2` does not define "satisfied", lists a class nothing can assign, and gives no precedence when two classes apply

Three gaps in the rule `05` D-B4 says *"pins the minimum"*:

1. *"`exact` means: **every criterion the visitor stated was evaluated and satisfied**"* — **"satisfied"
   is nowhere defined for the budget or the area.** §14.3.1 gives tiers (`strong` ≤ 0.10,
   `acceptable` ≤ 0.20, `fallback` > 0.20) but never says which tier counts as satisfied, and `PB6`'s
   `delta` is unsigned, so a 30,000,000 case is as far from a 50,000,000 budget as a 70,000,000 one —
   although only one of them is affordable. Two consumers give opposite `exact` verdicts on one
   document, which is precisely what D-B4 existed to prevent.
2. `price_fallback` is in the closed list and **no rule assigns it**. §14.3.2 produces the four scope
   classes plus two fallbacks; `PB1` produces `area_fallback`; nothing produces `price_fallback`.
3. A record can qualify for two classes at once (`scope_superset` **and** `area_fallback`) and `GR2`
   says *"a match class"*, singular, with no precedence.

**Counterexample for all three at once.** "34평 욕실만 600~800만원" against `04`'s `bi-15`
(`[bathroom]`, no `area`, total 7,000,000): scope `R == Q`; budget `delta = 0`; area stated but not
evaluable ⇒ `GR2` forbids `exact` ⇒ **no class in the closed list applies**, because `area_fallback`
per `PB1` means "area not comparable/within tolerance", not "area missing".

**Fix.** (a) *"A budget criterion is **satisfied** iff the record's total does not exceed the visitor's
exact budget, or the upper bound of the visitor's range; an area criterion is satisfied iff the tier
is `strong` or `acceptable`."* (b) Replace `price_fallback`/`area_fallback` with a single rule: a
criterion that was evaluated and **not** satisfied yields `price_fallback`/`area_fallback`; a criterion
that could not be evaluated yields `not_evaluable` (a new class) and is named in the per-record list.
(c) Add a precedence order — scope class > breadth class > `area_fallback` > `price_fallback` >
`not_evaluable` — and assert it in `CINV-4`.

### N-8 (MAJOR) · `INV-22` is not testable as stated, and does not carve out `RD1`'s own division

`INV-22`: *"**provenance:** `pricing.total` is only ever a copy of a source field; no emitted value is
*computed* as `perArea × area`. **Asserted on the code path, not on arithmetic**"*. No mechanism is
given for asserting on a code path, and `D-1` legitimately divides `total` by `area`, so any literal
"no arithmetic between price and area in `emit.ts`" lint fails `RD1` itself. As written the invariant
cannot be written as a test, which is what the D-B6 fix promised.

**Fix — give it an executable (metamorphic) form:**

> `INV-22` — for every fixture record: (i) changing only `area.value` in the source changes no emitted
> field except `property.area.value` and a `perArea` with `source: "derived"`; (ii) changing only the
> authored `pricePerArea` changes no emitted field except `pricing.perArea`; (iii) changing only the
> authored total changes `pricing.total` and a derived `perArea` and nothing else. `RD1`'s division is
> the sole permitted dependency of an emitted value on `property.area`.

That catches the actual hazard (a total that moves when an area moves) and passes on `05`'s
1,000,000 × 34 = 34,000,000 case.

### N-9 (MAJOR) · `RO2`'s rollback gate is not checkable by the party bound by it — and is cheaply made checkable

`RO2`: *"the consumer's `"0.1"` read path may be removed only once step 6 has passed **and** no
package below `1.0` remains a `PC6` rollback target."* The consumer owns the read path; the producer
owns the rollback targets. Nothing in the manifest, the document or `SV1`–`SV5` exposes the producer's
rollback state to the consumer, so the gate cannot be evaluated by whoever must obey it.

It is checkable, because rollback here is **exactly one step**: `rollbackHost` re-points at
`pointer.previous` and refuses when there is none (`platform/publish/publish.ts:35`, `:574`, *"re-point
a hostname at its pointer's `previous` package"*).

**Fix.** *"`RO2` — the `"0.1"` read path may be removed once step 6 has passed **and** every registered
site's routing pointer has `current` **and** `previous` at `schemaVersion ≥ 1.0`, i.e. after two
successful V0.2 publishes per site (`PC6` rolls back exactly one step). Until then the dual-read
stays; the producer states in the release record when the second publish has landed for every site."*

### N-10 (MAJOR) · `WS9`'s "source" is undefined and collides with `WS4`; under the prose reading, `04`'s `bi-09` and `bi-12` violate a `P: MUST`

`WS9` (`P: MUST`): *"when the **source** names a **space**, use the space id; when it names a **work**,
use the work id"*. `WS4` (`P: MUST`): *"emitted from an authored source field … **Never split, inferred
or completed from free text**"*.

If "source" means the prose, `WS9` mandates exactly what `WS4` forbids. If it means the authored
`workScopeIds` field, `WS9` is vacuous. Under the prose reading, `04`'s `bi-09` (body names 문 and
몰딩 도장; ids carry neither `doors` nor `painting`) and `bi-12` (body names 벽 finish and 타일; ids
carry neither `wallpaper` nor `tiling`) violate a `P: MUST`, and `VA1` is fail-closed on `P: MUST`.

**Fix.** Relabel and scope it: *"`WS9` (**authoring** rule, not an emitter rule; not machine-checkable
and therefore not a `VA1` condition) — when the operator authors `workScopeIds` from the case material:
a space named ⇒ the space id; a work named ⇒ the work id; both ⇒ both; unmappable ⇒ omit (`WS1`). The
emitter copies the authored field and never reads prose (`WS4`)."*

### N-11 (MAJOR) · `PB4`'s ordering neutrality forbids only last place, so "missing is never a penalty" still becomes "never shown"

`PB4`: *"a not-evaluable record is **never sorted below every evaluable record** merely for being not
evaluable"*. With `limit = 3` (`search-types.ts:94`, per `03` M-3) over 18 records, a not-evaluable
record placed 4th satisfies `PB4` and is never shown — which is the defect verbatim, and `CINV-5`
restates the weak form.

**Fix — use the formulation `03` M-3 actually proposed, which is testable:** *"a criterion that could
not be evaluated for a record contributes **nothing** to that record's score and to **no** tie-break
key; the record's position is determined entirely by the criteria that were evaluable."* `CINV-5` then
becomes: removing a record's `pricing` from the fixture must not change its rank relative to any
record whose score is unchanged.

### N-12 (MAJOR) · `PB6` is not total: no ceiling shape, no positivity guard, touching ranges undefined

The four shape combinations are all covered, and different-currency is handled (*"⇒ **not comparable**
(V0 `PR6`), never a mismatch"*). Three holes remain:

1. **No ceiling shape.** `VB1` fixes the visitor budget as *"`exact` or `range`"*, mirroring `total`.
   Korean budget talk is very often a ceiling, and `04` §4.1's own expected query is one: *"50평 전체
   **1억 넘나요**"*. So is "5천 이내", "3천까지", "최대 2천". There is no shape for it, and encoding it
   as a range needs a fabricated lower bound — which `VB1` itself forbids (*"a stated range never
   collapses to one bound"*).
2. **Divide-by-zero.** Rows 1 and 2 divide by `v`; `VB1` states no positivity requirement on the parsed
   budget (the positivity rule in §9 governs `pricing`, a producer field).
3. **Endpoint-touching ranges.** Row 4 keys on *"overlapping"* without defining it. `[6M, 8M]` against
   `[8M, 10M]` is `delta = 0` under a closed reading and a gap of 0/6M = 0 under an open one — same
   answer here, but `[6M, 8M]` vs `(8M, 10M]` is not, and `PB6` exists so two consumers cannot differ.

**Fix.** Add a third visitor shape `{ kind: "max", amount, currency }` (consumer-side only — it is not
a wire shape and needs no producer change), with `PB6`: *"visitor `max` `m` vs record exact `t`:
`t ≤ m` ⇒ `delta = 0`, else `(t − m)/m`; vs record range `[lo,hi]`: `hi ≤ m` ⇒ `0`, `lo ≤ m < hi` ⇒
`0` with the mandatory disclosure that the upper bound exceeds the budget, else `(lo − m)/m`."* Add
*"every visitor budget amount is > 0; a parse yielding ≤ 0 is discarded"* to `VB1`, and define overlap
as `a ≤ hi ∧ lo ≤ b` on closed intervals.

### N-13 (MAJOR) · `PT4`(b) is not testable — and can be made machine-checkable in one line

`PT4`(b): *"the source defines the project by a **narrow set of trades applied across the dwelling**
rather than by remodelling its spaces (flooring + wallpaper + lighting only, say)"*. "Narrow" is
undefined. `04`'s `bi-09` does 바닥·벽·문·조명 across the whole flat **plus** kitchen units and
bathroom fixtures and is `full_remodel`; `bi-19` does 바닥·도배·조명 and is absent. A job doing
바닥·도배·조명·문·타일·도장 across the dwelling sits between them with no answer, and so does one that
adds only a kitchen worktop.

**Fix (makes (b) checkable by the validator, which "narrow" never will be).**

> **(b)** the record's `workScopeIds` contain **no id from §7.3's *Spaces* table** — the project is
> defined by trades only. *(`INV-29`: `projectType == "full_remodel"` ⇒ `workScopeIds ∩ Spaces ≠ ∅`.)*

Verified against the corpus: `bi-19` `[flooring, wallpaper, lighting]` ⇒ (b) fires, absent ✓;
`bi-09` ⇒ (b) does not fire ✓; `bi-11`, `bi-12`, `bi-13` ⇒ (b) does not fire ✓.

### N-14 (MAJOR) · `bi-05` keeps `full_remodel` with a logged bathroom caveat — the D-B1 hazard survives `PT4`, and this is a **new** reason to reopen the §17 deferral

`05` deferred `workScopeIdsExcluded` on one stated ground: *"the same protection is obtained for free
by `PT4` (a stated exclusion ⇒ breadth not established ⇒ `projectType` omitted)"*. Rev 2 itself
falsifies that. §13's closing note: *"Recorded caveat: `bi-05`'s body notes the bathroom received
silicone and taps only. The operator's explicit '전체 리모델링' governs; the caveat is **logged rather
than overridden**."*

Source text, verbatim: `bi-03` — *"욕실은 몇 해 전에 고쳐 상태가 좋아 이번 공사에서는 **그대로
두었습니다**"* ⇒ absent. `bi-05` — *"욕실은 **상태가 좋아 실리콘과 수전만 교체했습니다**"* ⇒
`full_remodel`. Identical fact (the bathroom was not remodelled), identical justification (상태가
좋아), opposite classification, decided entirely by the verb the operator chose. `PT4` tests wording,
not facts — and `bi-05` is a `full_remodel` with an area, so if a total is ever authored for it, `D-1`
emits a `source: "derived"` per-area price for a dwelling one room of which was not remodelled. That
is `02` B-1's hazard with a provenance badge, reproduced under rev 2's own rules.

**Why this reopening is legitimate:** the deferral's stated rationale is that `PT4` gives equivalent
protection. Rev 2's own §13 shows it does not, on a live record. That is new information, produced by
rev 2, not a re-argument of the deferral.

**Fix (no new field needed for V0.2, one clause):** extend `PT4`(a) to cover maintenance-level work —
*"the source states that a space was excluded from the project **or received only maintenance-level
work (부분 교체, 실리콘·수전만, 덧방만)**"* — **or**, if `bi-05` is to keep `full_remodel`, add a sixth
`D-1` condition: *"the record carries no logged breadth caveat"*, and make such a record ineligible for
`exact` on a whole-home budget (`PB5` treatment). The second is cheaper and preserves the operator's
word; either closes the hole.

---

## B · Attacks on the new material

**`PT2` + `PT4` space-vs-trade.** The distinction is *more* testable than rev 1's exception on one
axis — §7.3's two tables give "space" and "trade" extensions, so 창호/확장/바닥 are decidably trades —
but rev 2 never binds `PT4`'s word "space" to that table, and the rule as a whole is not testable for
three separate reasons. (i) `PT4`'s preamble is unscoped, so clause (a) deletes every
`partial_remodel` and contradicts rev 2 §13 on `bi-04` and `bi-06` (BLOCKER N-1). (ii) Clause (b)'s
"narrow" is undefined; the gap between `bi-09` (full) and `bi-19` (absent) has no rule in it
(MAJOR N-13, with a machine-checkable replacement). (iii) Clause (a) tests the operator's verb, not
the fact: `bi-03` ("그대로 두었습니다") is absent and `bi-05` ("실리콘과 수전만 교체했습니다") is
`full_remodel`, from identical facts (MAJOR N-14). Ambiguous records I could construct that the four
clauses do not resolve: a whole-home job whose source says *"발코니는 그대로 두었습니다"* — `balcony`
is a **space** in §7.3, so (a) fires and a full remodel loses its breadth over an unextended balcony,
which nobody intends; and a whole-home job that replaced only the kitchen worktop, where whether the
kitchen was "remodelled" (for (b)) has no test. Against the corpus, clauses give **one clear answer**
for bi-01, bi-02, bi-03, bi-07, bi-08, bi-09, bi-10, bi-11, bi-12, bi-13, bi-19 and **no clear
answer** for bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 (all N-1) and bi-05 (N-14).

**`RD1` integer arithmetic.** The formula is correct. `floor((2T + A)/(2A))` with `T = round(total×100)`
and `A = round(area×100)` is identically `floor(T/A + 1/2)`, the scaling cancels, and it is
round-half-up of `total/area`. Executed against exact rationals: `52,000,000/34 → 1,529,412` (true
1,529,411.76…, and rev 2's worked example agrees); `85,000,000/34 → 2,500,000` exactly;
`30,000,000/20 → 1,500,000` exactly; `7/0.28 → 25` (rev 1's `24.999999999999996` is gone);
`2,941,177/2 → 1,470,589`, a true `.5` tie rounded up, deterministically. `area.value = 0.01` with
`total = 1e9` yields 100,000,000,000 and the **output** guard `≤ 1_000_000_000` catches it;
`total = 1e9` with `area = 0.5` yields 2,000,000,000 and is caught; `total = 1` with `area = 100`
yields 0 and the `≥ 1` guard catches it. Serialisation is safe: the result is an integer in
`[1, 1e9]`, which JSON never writes in exponent notation. Two residual items. (a) The guards cap `T`
but not `A`: V0's `areaRules.shape.value` is *"positive number, <= 2 fraction digits"* with **no
maximum**, so `round(area.value × 100)` can exceed 2^53 in a double implementation; no wrong number
escapes (the output guard catches it) but the claim "exact integer" in the comment is false there.
One-line fix: add `A <= 100_000_000` to the guard list, or cap `area.value` at 1,000,000 in §6. (b)
§11's *"no exponent notation — `RD1`'s cap keeps every derived value inside that rule"* is true for
the derived value only; `area.value` remains the one uncapped numeric in the document, and the same
cap fixes both.

**§14.3.2 set relations.** "욕실만 600~800만원" gives `Q = {bathroom}`, budget `range [6,000,000,
8,000,000]`. Against `bi-16` (`[kitchen, bathroom]`, partial, 19,800,000): `R ⊋ Q` ⇒ `scope_superset`,
**not comparable**, disclosure names 주방 — right class, right verdict, and it is exactly the case
`05` D-B2 was written for. Against `bi-15` (`[bathroom]`, partial, 7,000,000): `R == Q` ⇒ permitted;
`PB6` row 3 (visitor range × record exact), 7,000,000 ∈ [6,000,000, 8,000,000] ⇒ `delta = 0` ⇒
`strong` — right. The table is nonetheless incomplete: **disjoint sets have no row** (`Q = {bathroom}`
vs `bi-18` `[entrance, storage]`), non-partial records that are not supersets have no row (`bi-19`),
and the relation is computed over a space/trade mixture that `WS9` actively grows (N-4, N-5). A
further consequence nobody has stated: with `Q = ∅` (a bare budget question) every partial is
`R ⊋ ∅` ⇒ `scope_superset` ⇒ no partial total is ever budget-comparable for "2천만원으로 뭘 할 수
있나요".

**`PB6` totality.** All four shape combinations have a clause, different-currency returns *not
comparable* rather than a mismatch (correct, `PR6`), and a missing record total falls to `PB4`. It is
still not total: there is no shape for a **ceiling** budget, which is `04` §4.1's own "50평 전체 1억
넘나요" and the common Korean form; `v` is not guaranteed positive, so rows 1 and 2 can divide by zero;
"overlapping" is undefined at a shared endpoint; and row 3's *"divided by the nearer bound"* is
resolvable only because there is one range in play, where row 4 says *"the nearer **visitor** bound"*
explicitly. `delta` is also unsigned, so `PB6` cannot distinguish "under budget" from "over budget" —
which is what actually breaks `GR2`'s undefined "satisfied" (N-7, N-12).

**`GR4`.** It does not prevent the hazard. 18 of the 19 records in the corpus state their area in the
`title`, and `GR1` lists `title` as statable, so suppressing `property.area` leaves the multiplicand
one field away; `GR5`'s "for any record in the result" does not close the cross-record case either
(BLOCKER N-3). Worth recording for Q-3: because `GR4` suppresses whichever of the pair is deemed less
necessary, and area is needed to evaluate the area criterion while `pricing.total` already answers
budget questions, `D-1`'s output is absent from the default envelope in almost every conversation. That
is an argument for the inverted `GR4` in N-3, not for reopening `D-1` (which `05` rejected).

**`schemaVersion "1.0"` and `RO2`.** The version choice is sound and I verified the premise rather than
taking it: `SUPPORTED_MAJORS = new Set([0])` at `boost-chat: src/lib/first-party/contract.ts:35`, and
an out-of-set major returns `schema_version_major_unsupported` (`:201`) which the caller treats as
document-level rejection ⇒ TRANSIENT (`:8`). `"1.0"` also passes the stored-version CHECK pattern
`^[0-9]{1,4}\.[0-9]{1,4}$` (`contract.ts:124`). `SV1`'s independence makes the manifest/document split
legal, and `INV-27` asserts it. The **gate** is the weak part: it binds the consumer to a fact only
the producer can observe, with no channel to observe it through (N-9) — cheaply fixed, because
`rollbackHost` moves exactly one step to `pointer.previous`, so "two successful V0.2 publishes per
site" is an exact, checkable restatement.

**`INV-22` as a provenance invariant.** Not testable as stated. *"Asserted on the code path, not on
arithmetic"* names no mechanism, and the obvious mechanical reading (no price×area arithmetic in the
emitter) is violated by `RD1` itself, which is the one permitted division. N-8 gives a metamorphic
form that is executable, passes `05`'s 1,000,000 × 34 = 34,000,000 case, and actually catches a total
that moves when an area moves.

---

## C · `04-demo-data-spec.md` against rev 2

**Records that would fail the fail-closed validator (`VA1`)**

1. **`bi-09`, `bi-10`, `bi-11`, `bi-12`, `bi-13`, `bi-14`, `bi-15`, `bi-16`, `bi-17`, `bi-19`** —
   `INV-24` / `ST4`: `style` is a subset of `keywords` in every one (`bi-09`
   `keywords ["화이트","베이지"] / style ["화이트","베이지"]`), and `ST4` forbids the emitter
   subtracting. Only `bi-18` passes (both absent). The existing 8 fail the same way. BLOCKER N-2.
2. **`bi-14`, `bi-15`, `bi-17`, `bi-18`** (and existing `bi-04`, `bi-06`) — `PT4`(a) vs their
   `partial_remodel` assignment: each body states that spaces were left out
   (`bi-15`: *"다른 공간은 손대지 않고"*; `bi-18`: *"다른 공간은 손대지 않고"*; `bi-17`: *"주방과
   욕실은 아직 쓸 만했지만"*). Under `PT4` as written the emitter must omit `projectType`; under §13 and
   `04` it must emit `partial_remodel`. BLOCKER N-1.
3. Already flagged by `04` itself (§0.1, §3) and not a new finding: none of the V0.2 authored fields
   exist in `ProjectSchema`, which is `.strict()`. The schema work item is a hard prerequisite.

**Derived per-area values that disagree with `RD1`** — none. All four were recomputed:
`bi-09` 50,000,000/34 → **1,470,588** ✓, `bi-10` 85,000,000/34 → **2,500,000** ✓,
`bi-11` 30,000,000/20 → **1,500,000** ✓, `bi-12` 52,000,000/26 → **2,000,000** ✓, and `bi-13`
correctly expects **no** `perArea` (range ⇒ `D-1` condition 2 fails). `04` describes the rounding as
*"half-away-from-zero"* where rev 2 says *"round half up"*; identical for positive operands, so no
disagreement — but the two documents should use one word.

**Coverage requirements in `05`'s "Demo data consequences" not satisfied**

- **`breadth-absent + total` — NOT COVERED.** `04` §4 row E1 maps it to `bi-08` (existing), which is
  breadth-absent but carries an authored **per-area** price and **no total** (`projects.json`:
  `pricePerArea {amount: 1600000}`, no total field). The only fixture with the required shape is
  `bi-19`, which `04` deliberately places in "Appendix A — optional 11th fixture (**NOT one of the
  10**)". Consequence: the `D-1` branch *"absent `projectType` + exact total + area ⇒ must NOT derive"*
  — i.e. `INV-19`, the mirror of "the single most important prohibition in V0.2" — has **no fixture**,
  and `PB5` has none either. **Fix: promote `bi-19` to the fixture set (11 records).** `04` has already
  written it; this is a one-line status change.
- Every other requirement is satisfied: `full_remodel` + exact total (bi-09/10/11/12); `full_remodel` +
  range (bi-13); `partial_remodel` + total (bi-14…bi-18); `partial_remodel` with no price (bi-04,
  bi-06); exact division (bi-10 2,500,000 × 34 = 85,000,000 — the case that broke rev 1's `INV-22`);
  `exclusive` basis (bi-14); `m2` (bi-14, bi-17); area missing (bi-15); price missing (bi-04, bi-06);
  style missing (bi-18); similar area/different price (bi-09 vs bi-10); similar price/different area
  (bi-09 vs bi-12).

**Stale references in `04` that will mislead the implementer** (cheap to correct while `04` is edited
for the above)

- `bi-09`'s and `bi-11`'s `projectType` justifications cite *"(PT2 second sentence)"* — rev 1's deleted
  exception clause. The substance (창호 is a trade) is still correct under rev 2 `PT4`; the citation
  should read `PT4`, second paragraph of §5.2.
- §0.1's field-map row for `style` says *"under ST4 a built-space producer **stops emitting `tag`**"* —
  that is rev 1's `ST4`, reversed by D-M7. Rev 2 keeps `tag`.
- §4.1's expected answers for "주방만 하면 얼마예요" (`bi-14` exact) and "바닥이랑 거실만" (`bi-17`)
  do not survive `WS9` + §14.3.2 as written (N-4), and "예산 3천으로 전체 가능해요?" (`bi-11`) does not
  survive `PB1` as written (N-6). These are contract defects, not spec defects — but `04`'s table is
  the evidence that they are defects.

---

## D · Verdict

**NOT READY.**

Must change before implementation (each has a concrete fix above):

1. **N-1** — scope `PT4`'s preamble so (a)/(b) disqualify `full_remodel` rather than deleting
   `projectType`, and state what `partial_remodel` requires. Without this there are no partials.
2. **N-2** — `ST4`: `tag` = authored descriptive words **minus** `style`; the classification is
   authored, the subtraction is mechanical. Without this the build fails on 18 of 19 records.
3. **N-3** — invert `GR4` (suppress `perArea`, keep `area`) and extend `GR5` to any (perArea, area)
   pair in the result. Without this the D-B5 fix protects nothing.
4. **N-4, N-5, N-7** — §14.3.2 relates on spaces with trade disclosure; add the disjoint row; define
   "satisfied", assign or delete `price_fallback`, add class precedence.
5. **N-6** — "no area stated" makes `PB1`'s area condition inapplicable, not failed.
6. **N-14** — close the `bi-05` wording loophole, either in `PT4`(a) or as a sixth `D-1` condition.
7. **C** — promote `bi-19` into the fixture set so `INV-19`/`PB5` are exercised.

Should change, and are cheap enough that not doing them is a choice (**N-8**, **N-9**, **N-10**,
**N-11**, **N-12**, **N-13**, plus the `PA3`/`PA4` contradiction under D-M3, the `OD-I` citation under
D-M2, the `A` guard under `RD1`, and a home for D-M14).

Not re-opened: `D-1`'s existence, `workScopeIdsExcluded` as a **field** (N-14 is fixed without one),
`WS3` sets-not-counts, R1 m-6, labels. Answers to §18's Q-1…Q-5 are contained in N-14 (Q-1), N-9 (Q-2),
B's `RD1` and `GR4` paragraphs (Q-3), the D-B2 row (Q-4 — keeping both gates is right; `PR4` is a
frozen consumer obligation and the `projectType` gate is strictly additional), and N-10 (Q-5 — `WS9`
is not yet specific enough, and cannot be while its "source" is undefined).
