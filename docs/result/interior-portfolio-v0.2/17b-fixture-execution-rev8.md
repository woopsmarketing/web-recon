# 17b — Fixture execution by hand, contract rev 8 (§14.3 over `04` §4.1's nine utterances)

| | |
|---|---|
| date | 2026-09-24 |
| method | **hand execution, no code.** §14.3 executed on paper for each of `04-demo-data-spec.md` §4.1's nine rows, over all 19 records. `proof/ef6-totality.mjs` was **not** read, before or after; no disagreement below was reconciled against it. |
| inputs | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` rev 8 (§5–§9, §13, §14.3, §15, §19); `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` rev 7 (§1, §2, §4, §4.1); `data/sites/boost-interior-demo/content/projects.json` (the live 8, for `area` / `publishedAt` / `pricePerArea` only) |
| result | **0 of 9 rows executable end to end without a guess.** 4 rows reproduce §4.1's named answer (A, C, E, H); 5 disagree (B, D, F, G, I). 24 findings, `X8-1` … `X8-24`. |

---

## 0. Working table

Built once, used by all nine rows. Everything here is quoted from a source; nothing is inferred.

### 0.1 The eleven authored records (`04` §1, §2)

| id | `projectType` | `property.area` | `R_s` (Spaces) | `R_t` (Works) | `pricing.total` | derived `perArea` | `publishedAt` |
|---|---|---|---|---|---|---|---|
| bi-09 | full_remodel | 34 py supply | entrance, kitchen, bathroom | flooring, wallpaper, lighting, built_in_furniture | exact 50,000,000 | 1,470,588 | 2025-12-11 |
| bi-10 | full_remodel | 34 py supply | entrance, living_room, kitchen, bedroom, dressing_room, bathroom | windows, expansion, built_in_furniture | exact 85,000,000 | 2,500,000 | 2025-11-20 |
| bi-11 | full_remodel | 20 py supply | kitchen, bathroom | flooring, wallpaper, doors | exact 30,000,000 | 1,500,000 | 2025-10-23 |
| bi-12 | full_remodel | 26 py supply | entrance, kitchen, bathroom | flooring, lighting, built_in_furniture | exact 52,000,000 | 2,000,000 | 2025-09-25 |
| bi-13 | full_remodel | 48 py supply | entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom | windows, lighting, built_in_furniture | **range** 125,000,000–140,000,000 | none | 2025-08-28 |
| bi-14 | partial_remodel | **84 m² exclusive** | kitchen | — | exact 15,000,000 | none | 2025-07-31 |
| bi-15 | partial_remodel | **absent** | bathroom | — | exact 7,000,000 | none | 2025-07-03 |
| bi-16 | partial_remodel | 38 py supply | kitchen, bathroom | — | exact 19,800,000 | none | 2025-06-05 |
| bi-17 | partial_remodel | **112 m² supply** | living_room | flooring | exact 12,500,000 | none | 2025-05-08 |
| bi-18 | partial_remodel | 30 py supply | entrance | built_in_furniture | exact 6,200,000 | none | 2025-04-10 |
| bi-19 | **absent** (`PT6`) | 32 py supply | — (empty) | flooring, wallpaper, lighting | exact 11,000,000 | none | 2025-03-13 |

### 0.2 The eight live records

`projectType` from contract §13 (`07:718-725`). `area`, `pricePerArea`, `publishedAt` from
`data/sites/boost-interior-demo/content/projects.json`. **`workScopeIds` does not exist for any of
the eight, in any document in this repo** — `04` §0.2 (`04:44`) defers the authoring pass, and §19's
`bi-01` / `bi-04` id lists are marked *"constructed to show the rules … not the current demo
document"* (`07:1497-1498`) and so are not data.

| id | `projectType` | `area` | `R_s` / `R_t` | price | `publishedAt` |
|---|---|---|---|---|---|
| bi-01 | full_remodel | 34 py supply | **UNAUTHORED** | authored perArea 2,900,000/평, **no total** | 2026-08-28 |
| bi-02 | absent | 24 py supply | **UNAUTHORED** | authored perArea 2,400,000, no total | 2026-07-30 |
| bi-03 | absent | 42 py supply | **UNAUTHORED** | authored perArea 3,200,000, no total | 2026-06-25 |
| bi-04 | partial_remodel | 32 py supply | **UNAUTHORED** | none | 2026-05-21 |
| bi-05 | absent | 29 py supply | **UNAUTHORED** | authored perArea 2,600,000, no total | 2026-04-16 |
| bi-06 | partial_remodel | 34 py supply | **UNAUTHORED** | none | 2026-03-19 |
| bi-07 | full_remodel | 19 py supply | **UNAUTHORED** | authored perArea 2,700,000, no total | 2026-02-12 |
| bi-08 | absent | 51 py supply | **UNAUTHORED** | authored perArea 1,600,000, no total | 2026-01-08 |

This is the corpus's first structural problem and it is the one I hit most often (**`X8-1`**).
`EF3`'s `partial_remodel` branch (`07:894-897`) and its `full_remodel` trades half (`07:882-885`)
both read `R_s` / `R_t`. For bi-01, bi-04, bi-06 and bi-07 those sets do not exist, so on any
utterance with `Q ≠ ∅` I must **stop those four records**. `WS7c` (`07:375`) makes it worse than a
data gap: a record that states `projectType` at all *must* carry `workScopeIds`, so as the corpus
stands today either (i) the four may not carry `projectType` — and §13's *full 2 · partial 2 ·
absent 4* collapses to *absent 8*, which deletes §4.1 rows A and D's expected answers outright — or
(ii) they carry ids nobody has written down. **I did not invent them.** Where a row needs them, the
record is marked STOP.

### 0.3 A note on the task's own citation

The brief says *"extract the query using §13"*. Contract §13 (`07:711`) is the `category` audit and
the resulting `projectType` — a producer-side authoring table. Query extraction lives in **§14.3.1**
(`VB1`–`VB3`, `07:808-849`) and in **`WS6`** (`07:340-351`). I used those. Recorded as **`X8-2`**
only because a reader sent to §13 for query extraction finds nothing.

### 0.4 Arithmetic conventions used

`AR4` (`02:245`): 1 평 = 400/121 m². `delta_area = (r − v) / v`, visitor's figure the divisor
(`07:986-987`). Tier: ≤0.10 `strong`, ≤0.20 `acceptable`, >0.20 `fallback` (`07:990-994`).
`EF4` satisfied iff `strong` or `acceptable` (`07:906-908`).

---

## Row A — "34평 전체 5천이면 되나요"

### A.1 Extraction

| field | value | licensed by | note |
|---|---|---|---|
| `V.breadth` | `whole` | `VB3` table row 1 (`07:838`) | **guess, `X8-3`.** The row's left cell is the literal list *전체 리모델링 · 집 전체 · 올수리*. The utterance is *"34평 전체"*, which is on none of them. `VB3`'s prose calls the list **closed** (`07:846-849`), and rev 7 is criticised there precisely for leaving utterances undecided. I read the left cells as **exemplars of a closed set of forms**, not as literal strings, because the *why* cell — *"a statement about the extent of the dwelling"* — is the actual predicate and *"34평 전체"* satisfies it. Read literally, `V.breadth` is **absent** and this row's entire expected answer changes. |
| `V.scope` | `Q = ∅` | `WS6` (`07:340`) | 전체 is not a §7.3 id. |
| `V.area` | 34, `pyeong`, **basis ?** | §14.3.1 (`07:813`) | **guess, `X8-4`.** §14.3.1 requires `V.area` to be *"value + unit + basis"*. **No rule anywhere says what basis a bare Korean 평 figure carries, or what to do when the visitor states none.** `04:358` asserts *"supply by `defaultAreaBasis`"*, but `defaultAreaBasis` is a `platform/content/schema.ts:107` **authoring-side** helper for filling a record's own unstated basis; it is in no contract rule. I carried both readings below. |
| `V.budget` | `exact {50,000,000}` | `VB1` (`07:820-824`) | Not a criterion (`07:866-868`). |
| `V.styles` | — | | |

### A.2 Criterion states

`EF3` = `not_applicable` for all 19 (`Q = ∅`, `07:875`). So the unauthored `workScopeIds` do **not**
bite on this row for classification — but they do for ordering (see A.4).

`EF2` (`07:870-874`): full_remodel → satisfied {bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13};
partial_remodel → unsatisfied {bi-04, bi-06, bi-14…bi-18}; absent → not_evaluable
{bi-02, bi-03, bi-05, bi-08, bi-19}.

`EF4`, v = 34평:

| record | r | `delta_area` | tier | state |
|---|---|---|---|---|
| bi-01 / bi-06 / bi-09 / bi-10 | 34 py | 0 | strong | satisfied |
| bi-04 | 32 py | −0.0588 | strong | satisfied |
| bi-19 | 32 py | −0.0588 | strong | satisfied |
| bi-17 | 112 m² = 33.88 py | −0.00353 | strong | satisfied |
| bi-18 | 30 py | −0.1176 | acceptable | satisfied |
| bi-16 | 38 py | +0.1176 | acceptable | satisfied |
| bi-05 | 29 py | −0.147 | acceptable | satisfied |
| bi-03 | 42 py | +0.2353 | fallback | unsatisfied |
| bi-12 | 26 py | −0.2353 | fallback | unsatisfied |
| bi-02 | 24 py | −0.294 | fallback | unsatisfied |
| bi-11 | 20 py | −0.4118 | fallback | unsatisfied |
| bi-13 | 48 py | +0.4118 | fallback | unsatisfied |
| bi-07 | 19 py | −0.441 | fallback | unsatisfied |
| bi-08 | 51 py | +0.50 | fallback | unsatisfied |
| bi-15 | **absent** | — | — | **not_evaluable** |
| bi-14 | 84 m² exclusive | **depends on `X8-4`** | — | supply-default ⇒ `AR5` refuses ⇒ **not_evaluable**; unknown-basis ⇒ `AR5` only *"lowers confidence"* (`02:246`) ⇒ compare 84 vs 112.397 ⇒ −0.2527 ⇒ **unsatisfied** |

### A.3 `EF6` (`07:1043-1051`)

`exact`: **bi-01, bi-09, bi-10**.
`area_fallback` (row 5): bi-07, bi-11, bi-12, bi-13.
`breadth_fallback` (row 3): bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 — row 3 pre-empts rows
5 and 6, so bi-14's and bi-15's area states never surface.
`unknown_type_fallback` (row 4): bi-02, bi-03, bi-05, bi-08, bi-19.

### A.4 `GR3a` / `GR3`

`GR3a` row 1 (`07:1092`): `V.breadth == whole` ⇒ **whole-home** rung set.

- **Rung 1, full_remodel.** `GR2a` puts the three `exact` first; `|delta_area|` ties them at 0;
  key (3) is 0 for all (no scope stated); key (4) `publishedAt` desc decides: **bi-01 → bi-09 →
  bi-10**. Then the `area_fallback` fulls by `|Δ|`: bi-12 (0.2353) → bi-11 (0.4118) = bi-13
  (0.4118, tie broken by `publishedAt`: bi-11 2025-10-23 > bi-13 2025-08-28) → bi-07 (0.441).
- **Rung 2, partial_remodel, "larger `R_s` first".** **STOP for bi-04 and bi-06** — `R_s` unauthored
  (`X8-1`). Also **`X8-5`**: the rung cell (`07:1099`) carries a sort key — *larger `R_s` first* —
  that the *"Every result has an order"* box (`07:1112-1119`) does not list, and no rule says how
  the two compose. `|R_s|`: bi-16 = 2; bi-14 / bi-15 / bi-17 / bi-18 = 1.
- **Rung 3, breadth-absent:** bi-08, bi-03, bi-02, bi-05, bi-19.

### A.5 Prices (`GR1`, `GR5`, `GR5a`)

bi-09's 50,000,000 and bi-10's 85,000,000 are statable as facts (`GR1`, `07:1009-1012`), including
under `GR5a` (`07:1145`) where they coincide with a cross-record quotient. No "예산에 맞습니다".

**bi-01 ranks first and has no statable price at all.** Its only price is an authored `perArea`, and
`GR4` (`07:1129-1131`) withholds `perArea` from the model-facing record unless the visitor asked
about a per-area price — which *"5천이면 되나요"* is not. `CINV-19` (`07:1236`) nevertheless requires
that a visitor who stated a budget *"is told each shown record's price as a fact"*. For bi-01 those
two rules cannot both hold. **`X8-6`.**

### A.6 Against §4.1 A (`04:693`)

**Agrees** — bi-09 `exact`, bi-01 and bi-10 also `exact`, bi-12 `area_fallback`, no budget verdict.
Two riders: the top-ranked record is bi-01, not bi-09 (§0.3 of `04` dated the new eleven *older*
than the live eight, so `publishedAt` desc systematically promotes the legacy records — **`X8-7`**),
and bi-01 arrives priceless (`X8-6`). §4.1's *why* cell cites *"breadth `EF3`"*; breadth is `EF2`
(**`X8-8`**).

---

## Row B — "예산 3천으로 전체 가능해요?"

### B.1 Extraction

`V.breadth = whole` — same guess as `X8-3`, and here it is outcome-critical: read `VB3`'s list
literally and *"전체"* sets nothing, so **no criterion is stated at all**, every one of the 19
records reaches `EF6` row 7 `exact`, `GR3a` row 4 fires (`07:1095`) and `GR2a` alone orders a
19-way tie. `Q = ∅`. `V.area` absent. `V.budget = exact {30,000,000}`, not a criterion.

### B.2 States and classes

Breadth is the only stated criterion. `EF3` = `EF4` = `not_applicable` everywhere.

- `exact` (row 7): **bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13** — seven, which is the count
  `CINV-21` (`07:1238`) independently asserts for the equivalent query.
- `breadth_fallback` (row 3): bi-04, bi-06, bi-14…bi-18.
- `unknown_type_fallback` (row 4): bi-02, bi-03, bi-05, bi-08, bi-19.

### B.3 Order

Whole-home rung set. Rung 1 = the seven fulls, all `exact`; `|delta_area|` does not apply (no area
stated); key (3) = 0 for all; **`publishedAt` desc is the whole decision**:

> **bi-01 (2026-08-28) → bi-07 (2026-02-12) → bi-09 (2025-12-11) → bi-10 → bi-11 → bi-12 → bi-13.**

### B.4 Disagreement with §4.1 B (`04:694`)

§4.1 B: *"Every `full_remodel` record qualifies as `exact` and is ordered by `GR3`, **each with its
own total stated**… the visitor gets a breadth-matched list and reads the prices themselves."*

**The first two records have no total, and `GR4` withholds the only price they do have.** bi-01
(2,900,000/평) and bi-07 (2,700,000/평) carry `perArea` and nothing else; the visitor asked about a
total budget, so `GR4` strips it. Under any bounded result — `PB4`'s own worked assumption is a
limit of 3 (`07:1019`) — the visitor asking *"3천으로 전체 가능해요?"* sees bi-01 (no price), bi-07
(no price) and bi-09 (50,000,000). **They cannot "read the prices themselves"; there are none to
read.** **`X8-9`.**

And bi-11 — 20평 빌라, exact 30,000,000, the one record that literally answers the question — is
**fifth**, i.e. invisible at a limit of 3. §4.1 B labels this row "worse than rev 7" and says bi-11
is "not promoted"; the accurate statement is that it is **not shown**. This is `PB4`'s own stated
failure mode (*"Missing must not silently become never-shown — with a result limit of 3 over 19
records, fourth place is invisible"*, `07:1019`) arriving through the front door rather than through
a penalty. **`X8-10`.**

---

## Row C — "주방만 하면 얼마예요"

### C.1 Extraction

`V.breadth = partial` — `VB3` row 2 (`07:839`) names *주방**만*** literally. Clean.
`Q_s = {kitchen}`, `Q_t = ∅` (`WS6`). `V.area` absent. `V.budget` absent (*"얼마예요"* asks a price,
states none). Not a per-area question ⇒ `GR4` withholds every `perArea`.

### C.2 States

`EF2`: partials satisfied; fulls **unsatisfied**; absent-breadth not_evaluable.

`EF3`:
- **full_remodel branch** — spaces half `satisfied` for any `Q_s` by `PT4`(b) (`07:880-882`); trades
  half `satisfied` because `Q_t = ∅ ⊆ R_t` vacuously. ⇒ **satisfied** for all seven fulls, *including
  bi-01 and bi-07 whose `R_t` is unauthored* — the empty `Q_t` is what saves them here.
- **partial branch**, §14.3.3 with `PB7` first-match (`07:919-932`):
  - bi-14 `R_s = {kitchen} == Q_s`, `∅ ⊆ ∅` → row 3 `scope_exact` → **satisfied**
  - bi-16 `{kitchen, bathroom} ⊋ {kitchen}` → row 5 `scope_superset` → unsatisfied
  - bi-15 / bi-17 / bi-18 → row 8 `scope_disjoint` → unsatisfied
  - **bi-04, bi-06 → STOP** (`X8-1`)
- absent branch → not_evaluable for bi-02, bi-03, bi-05, bi-08, bi-19.

`EF4` = not_applicable everywhere.

### C.3 Classes and order

bi-14 **`exact`**; bi-16 **`scope_superset`**; bi-15 / bi-17 / bi-18 `scope_disjoint`; all seven
fulls **`fallback_from_full`** (row 2); the four breadth-absent `unknown_type_fallback`.

`GR3a` row 2 ⇒ spaces-named rung set. Rung 1 (partials with `R_s ⊇ {kitchen}`): bi-14, bi-16 — plus
bi-04 **if** its ids are `[kitchen, bathroom]`, in which case its `publishedAt` 2026-05-21 puts it
**ahead of bi-14** and the unpriced legacy record is the direct answer to *"주방만 하면 얼마예요"*.
Underivable (`X8-1`, `X8-7`). Rung 2: bi-15 → bi-17 → bi-18. Rung 3: the fulls.

### C.4 Against §4.1 C (`04:695`) — **agrees**

bi-14 `exact`, bi-16 `scope_superset`, row 5 correctly cited. §4.1 omits that all seven
`full_remodel` records are also returned (as `fallback_from_full`) and that three partials come back
`scope_disjoint`; nothing filters them out (`X8-11`).

`CINV-24`(c) (`07:1241`) states this query as *"classes `bi-09` `fallback_from_full` and `bi-14`
`exact`, **in that order**"*. If *"in that order"* is an ordering claim it is wrong: bi-14 is on
rung 1 and is a **direct answer** (`GR3`, `07:1082`), bi-09 is on rung 3. **`X8-12`.**

---

## Row D — "욕실 하나만" / "욕실 두 개"

### D.1 Extraction, utterance 1 — "욕실 하나만"

`V.breadth`: `VB3` row 2's exemplar is *욕실**만** 하고 싶어요*; here the 만 attaches to **하나**, so
the restriction is on the **count**, not on the extent. `WS3` (`07:332-335`) says quantity is not
represented at all. I read it as `partial`. **Guess, `X8-13`.**
`Q_s = {bathroom}`, `Q_t = ∅`. No area, no budget.

### D.2 Extraction, utterance 2 — "욕실 두 개"

No 만, no 전체 ⇒ `VB3`'s *bare enumeration* row (`07:843`) ⇒ `V.breadth` **absent**.
`Q_s = {bathroom}` — identical, because 두 개 is unrepresentable (`WS3`).

### D.3 States, classes, order — both utterances

`EF3` partial branch: bi-15 `R_s == Q_s`, `∅ ⊆ ∅` → row 3 `scope_exact` → satisfied.
bi-16 `{kitchen, bathroom} ⊋ {bathroom}` → row 5 `scope_superset` → unsatisfied.
bi-14 / bi-17 / bi-18 → row 8 `scope_disjoint`. **bi-04, bi-06 → STOP.**
Fulls: spaces half satisfied, `Q_t = ∅` ⇒ scope satisfied.

| | "욕실 하나만" (breadth `partial`) | "욕실 두 개" (breadth absent) |
|---|---|---|
| bi-15 | **`exact`** | **`exact`** |
| bi-16 | `scope_superset` | `scope_superset` |
| bi-14 / bi-17 / bi-18 | `scope_disjoint` | `scope_disjoint` |
| the seven fulls | `fallback_from_full` | **`exact`** |
| bi-02/03/05/08/19 | `unknown_type_fallback` | `not_evaluable` |

`GR3a` row 2 fires for both (`V.breadth == partial` for the first, `Q_s ≠ ∅` for the second).
Rung 1 = {bi-15, bi-16}; `GR2a` puts `exact` first. **Both utterances return bi-15, then bi-16, then
bi-14 — the same three records in the same order.**

### D.4 Disagreement with §4.1 D (`04:696`)

§4.1 D presents the pair as a contrast: *"욕실 하나만 → bi-15 (7,000,000) / 욕실 두 개 → bi-16
(19,800,000, kitchen included)"*. The rules cannot produce that. **`WS3` erases the count on both
sides, so the two utterances are the same query to the evaluation function**, and bi-16 is
`scope_superset` on both — never the top result, and never the *direct answer* on either. The row's
own *why* cell cites `WS3`, which is the reason the contrast is unobtainable; it is cited as though
it supported the contrast. **`X8-14`.**

§4.1 D also says *"bi-04 is unpriced and is not ranked below the others for it"*. Correct as far as
it goes, but bi-04's problem is not price: its `workScopeIds` do not exist, so it cannot be placed
at all (`X8-1`). If it were `[kitchen, bathroom]`, its 2026-05-21 `publishedAt` would rank it
**above** bi-16 (`X8-7`).

---

## Row E — "전용 84 아파트 주방"

### E.1 Extraction

`V.breadth` **absent** — bare enumeration (`07:843`).
`Q_s = {kitchen}`, `Q_t = ∅`.
`V.area` = 84, unit **?**, basis `exclusive`. **Guess, `X8-15`:** the utterance states no unit.
§14.3.1 demands *"value + unit + basis"*; `AR1` (*"단위 없는 면적은 존재하지 않는다"*, `02:242`) is a
producer rule about records and says nothing about a query. I supplied `m2` from Korean convention.
No rule licenses it. The basis, unusually, **is** stated (전용 ⇒ `exclusive`, `PY1`, `07:240-244`) —
this is the one row where `X8-4` does not apply.

### E.2 States

`EF3` as row C: bi-14 `scope_exact` satisfied; bi-16 `scope_superset` unsatisfied; bi-15/17/18
`scope_disjoint`; fulls satisfied; bi-04/bi-06 STOP; breadth-absent records not_evaluable.

`EF4`, v = 84 m² **exclusive**: bi-14 (84 m² exclusive) Δ = 0 ⇒ strong ⇒ **satisfied**. **Every
other record with an area is `supply`**, so `AR5` refuses the comparison (`02:246`, `07:906-907`) ⇒
**not_evaluable** for bi-01, bi-03, bi-07…bi-13, bi-16, bi-17, bi-18, bi-19, bi-02, bi-05, bi-06,
bi-04; bi-15 not_evaluable for want of an area.

### E.3 Classes and order

bi-14 **`exact`** (row 7). bi-16 `scope_superset` (row 1). bi-15/17/18 `scope_disjoint` (row 1).
The seven fulls: scope satisfied, breadth n/a, area not_evaluable ⇒ row 6 **`not_evaluable`**.
Spaces-named rung set ⇒ rung 1 {bi-14, bi-16}, bi-14 first.

### E.4 Against §4.1 E (`04:697`) — **agrees**

bi-14 is the answer. On the second half — *"34평 주방" must NOT be told bi-14 is a 34평 flat* — both
readings of `X8-4` keep the promise, but **for different reasons and with different disclosures**:
supply-default ⇒ `AR5` refuses ⇒ bi-14 is `not_evaluable` and `GR2` reports "area could not be
evaluated"; unknown-basis ⇒ compare 34평 = 112.397 m² against 84 m² ⇒ Δ = −0.2527 ⇒ `area_fallback`
and `GR2` reports "area does not fit". Same record, opposite sentence to the visitor, decided by a
rule that does not exist. The promise survives only because 112.4 and 84 happen to be 25 % apart
(**`X8-16`**).

---

## Row F — "50평 전체 1억 넘나요"

### F.1 Extraction

`V.breadth = whole` (guess `X8-3`). `Q = ∅`. `V.area` = 50 평, basis unstated (`X8-4`).
`V.budget`: *"1억 넘나요"* resolves to **none** of `VB1`'s three shapes — `max` is glossed *"1억 이내"
/ "최대 1억"* (`07:822`), and 넘나요 asks the opposite question. ⇒ `V.budget` **absent**, *"never
guessed"* (`07:824`). It survives as a `budgetHint` under `VB2` only. Clean, and it is what makes
§4.1 F's *"must not resolve the 넘나요 into a yes/no"* automatic.

### F.2 States

`EF2` as row A. `EF4`, v = 50평: bi-08 (51) Δ +0.02 strong; bi-13 (48) Δ −0.04 strong; bi-03 (42)
Δ −0.16 acceptable — **satisfied**. Everything else ≥ 0.24 ⇒ unsatisfied; bi-15 not_evaluable;
bi-14 per `X8-4` (supply-default ⇒ not_evaluable; unknown ⇒ Δ −0.4918 unsatisfied).

### F.3 Classes

- **bi-13 `exact`** — the only one. ✓
- bi-08 row 4 **`unknown_type_fallback`**; bi-03 also row 4 (its satisfied area never surfaces).
- bi-01, bi-07, bi-09, bi-10, bi-11, bi-12 `area_fallback`.
- all seven partials `breadth_fallback` (row 3 pre-empts).
- bi-02, bi-05, bi-19 `unknown_type_fallback`.

### F.4 Order — and the disagreement

Whole-home rung set (`07:1099`): **`full_remodel` → `partial_remodel` → breadth-absent.**

Rung 1: bi-13 (`exact`) → then the `area_fallback` fulls by `|Δ|`: bi-01 / bi-09 / bi-10 (0.32,
`publishedAt` breaks) → bi-12 (0.48) → bi-11 (0.60) → bi-07 (0.62).
Rung 2: the seven partials (`R_s` order STOP for bi-04, bi-06).
Rung 3: bi-08 → bi-03 → bi-19 → bi-05 → bi-02.

**bi-08 is fifteenth.** §4.1 F (`04:698`) promises *"bi-08 (51평) is a `projectType`-absent
reference"* — but it is the single closest area match in the corpus (Δ 0.02) and the rung set puts
it behind all seven fulls and all seven partials, because its **breadth criterion came out
`not_evaluable`**. That is exactly what `PB4`'s strong form forbids: *"a criterion in state
`not_evaluable` contributes **nothing** to the record's score and to **no** tie-break key. Not a
penalty, not a small penalty, not a null that sorts last"* (`07:1015-1019`). `GR3a`'s rung set is
neither a score nor a tie-break key, so it evades `PB4`'s letter while producing precisely the
outcome `PB4`'s sentence names. `CINV-5` (`07:1222`) polices this for **area** only and has no
breadth counterpart. **`X8-17` — disagreement with §4.1 F, and a rule whose literal text defeats
another rule's stated purpose.**

### F.5 Prices

bi-13's 125,000,000 / 140,000,000 stated as an authored range (`GR1`). Note that **125,000,000 =
2,500,000 (bi-10's `perArea`) × 50 (the visitor's own stated area)** — a forbidden product under
`GR5` (`07:1136-1143`), rescued only by `GR5a` because it is bi-13's own `pricing` field and the
statement is about bi-13. A live second instance of the exemption, in the fixture corpus, not
documented at `07:1145-1157`. **`X8-18`** (confirmation, not a defect: `GR5a` is doing real work
here).

---

## Row G — "32평인데 도배랑 바닥만 얼마예요"

This is the row the trade machinery was built for, and it is where the three criteria break.

### G.1 Extraction — clean

`V.breadth` **absent**: `VB3`'s *restriction by trade* row is literally *바닥이랑 도배**만***
(`07:842`). `Q_t = {flooring, wallpaper}`, `Q_s = ∅`. `V.area` = 32 평 (basis `X8-4`, immaterial
here — every candidate is `supply` or pre-empted). `V.budget` absent.

### G.2 `EF3`

- **full_remodel** — spaces half vacuous; trades half `satisfied` iff `Q_t ⊆ R_t`, else
  `not_evaluable`, never `unsatisfied` (`07:882-887`):
  - bi-09 `R_t = {flooring, wallpaper, lighting, built_in_furniture}` ⊇ `Q_t` ⇒ **satisfied**
  - bi-11 `{flooring, wallpaper, doors}` ⊇ `Q_t` ⇒ **satisfied**
  - bi-10, bi-12 (no wallpaper), bi-13 ⇒ **not_evaluable**
  - **bi-01, bi-07 → STOP** — `Q_t ≠ ∅`, so `R_t` is genuinely needed (`X8-1`)
- **partial_remodel** → §14.3.3 row 2 → §14.3.3.1 (`07:966-970`):
  - bi-17 `R_t = {flooring}`: `Q_t ⊄ R_t`, `R_t ∩ Q_t ≠ ∅` ⇒ row 3 **`scope_overlap`**
  - bi-14, bi-15, bi-16 (`R_t = ∅`), bi-18 (`{built_in_furniture}`) ⇒ row 4 **`scope_disjoint`**
  - **bi-04, bi-06 → STOP**
- **absent** ⇒ `not_evaluable` — **including bi-19**, whose `R_t` is exactly
  `{flooring, wallpaper, lighting} ⊇ Q_t`.

### G.3 `EF4`, v = 32평

bi-19 Δ 0 strong; bi-09 / bi-10 Δ +0.0625 strong; bi-17 (33.88 py) Δ +0.0588 strong; bi-12 Δ −0.1875
acceptable; bi-16 Δ +0.1875 acceptable; bi-18 Δ −0.0625 strong; bi-11 Δ −0.375, bi-13 Δ +0.50
unsatisfied; bi-15 not_evaluable.

### G.4 Classes

| record | class | why |
|---|---|---|
| **bi-09** | **`exact`** | breadth n/a, scope satisfied, area satisfied ⇒ row 7 |
| bi-11 | `area_fallback` | row 5 |
| bi-10, bi-12, bi-13 | `not_evaluable` | row 6 (trades half) |
| bi-17 | `scope_overlap` | row 1 |
| bi-14, bi-15, bi-16, bi-18 | `scope_disjoint` | row 1 |
| **bi-19** | **`not_evaluable`** | row 6 — scope refused by `EF3`'s absent branch |
| bi-02, bi-03, bi-05, bi-08 | `not_evaluable` | row 6 |

### G.5 Order

`GR3a` row 3 ⇒ **trade-only** rung set (`07:1101`). Rung 1 (partials with `R_t ⊇ Q_t`): empty.
Rung 2 (**breadth-absent with `R_t ⊇ Q_t`**): **bi-19**. Rung 3 (fulls): bi-09 → bi-11 → bi-10 →
bi-12 → bi-13. Rung 4: bi-17 → bi-14, bi-15, bi-16, bi-18 → bi-02/03/05/08.

Top three: **bi-19, bi-09, bi-11.**

### G.6 Three findings, all on this row

**`X8-19` — `EF3`'s absent branch discards positive trade evidence.** *"absent ⇒ `not_evaluable`.
Breadth unknown means coverage unknown"* (`07:900`). That justification is a statement about
**spaces**, and it is applied to a query that names only **trades**. `WS7b` (`07:372-374`) forbids
inferring *exclusion* from an absent trade id; it says nothing against *inclusion* from a **present**
one, and the `full_remodel` branch evaluates exactly that predicate (`Q_t ⊆ R_t`) on exactly the same
id list. So bi-19 — the only record in the corpus whose ids are 바닥·도배·조명 and whose total is
11,000,000 for a 32평 flat — must be reported to the visitor under `GR2` (`07:1033-1038`) as *scope
could not be evaluated*, about a set the document states in full. §14.3.3.1's own prose says bi-19
*"is reached through `GR3`'s trade rung and its total is **stated as a fact**"* (`07:981-982`), and
§4.1 G repeats it — both true, and both silent about the class the visitor is owed.

**`X8-20` — `GR3` contradicts itself, and this row is the proof.** `GR3` states, in one rule:
*"A record whose `EF6` class is `exact` is a **direct answer** … **Direct answers are offered
first**, then the labelled references"* (`07:1082-1084`), and then a rung table in which bi-19
(class `not_evaluable`) sits on rung 2 and bi-09 (class `exact`) on rung 3. The two sentences give
opposite orders for the same result. `CINV-22` (`07:1239`) resolves it in favour of the rungs
(*"removing the ladder changes which records are shown first"*), which makes *"direct answers are
offered first"* false as written. Rev 7's `Q-5` (`07:1761`) created the definition; rev 7's `M-8`
(`07:1821`) put every class on a rung; nothing reconciled them. The same contradiction fires on rows
H and I.

**`X8-21` — the three criteria are not sufficient for this row, and the narrowing is why.** With the
budget criterion deferred, nothing in `EF1`–`EF6` relates the **size of the job** to the size of the
question. bi-09 — a 50,000,000 whole-home remodel — is the **only `exact` record**, i.e. the only
*direct answer*, for a visitor asking what 도배 and 바닥 cost on a 32평 flat, and it earns that class
honestly: breadth `not_applicable` (the visitor restricted a trade, which `VB3` correctly refuses to
read as breadth), scope `satisfied` (`{flooring, wallpaper} ⊆ R_t`), area `satisfied` (34 vs 32).
The record that actually answers the question is `not_evaluable`. Through rev 7 the budget
comparison was what separated an 11,000,000 job from a 50,000,000 one; §4.1 G asserts the narrowing
*"is unnecessary, because **no** record is ever a budget match"* — true, and it is exactly what
removes the only rule that distinguished them.

Grounding is fine: 343,750 stays out (`GR5`, `CINV-2`), 11,000,000 is statable under `GR5a` as
bi-19's own field, and `projectType` being absent means nothing may call it a 전체 or 부분 리모델링.
§4.1 G's positive claims all hold; its implied claim — that bi-19 is *the answer* — does not.

---

## Row H — "바닥이랑 거실만"

### H.1 Extraction — the ambiguity

바닥 is a **trade** (`flooring`), 거실 is a **space** (`living_room`), and the 만 covers both. `VB3`'s
closed list has a row for *a restriction by **space*** ⇒ `partial` (`07:839`) and a row for *a
restriction by **trade*** ⇒ `absent` (`07:842`). **Both rows match this utterance, and `VB3`'s table
has no ordering rule.** `PB7` (`07:919`), `GR3a` (`07:1086`) and `EF6` (`07:1040`) each state
first-match-wins explicitly; `VB3` — the only one of the four that is a *closed list introduced
precisely to stop utterances being undecided* — does not. **`X8-22`.**

I took `partial` (a named room bounds the work more strongly than a named trade). The guess is
outcome-changing: see H.3.

`Q_s = {living_room}`, `Q_t = {flooring}`. No area, no budget.

### H.2 States

- bi-17: `R_s = {living_room} == Q_s`, `Q_t = {flooring} ⊆ R_t = {flooring}` ⇒ §14.3.3 **row 3
  `scope_exact`** ⇒ satisfied. Breadth: partial ⇒ satisfied (or n/a under the other reading). Area
  n/a. ⇒ **`exact`** under both readings.
- bi-14, bi-15, bi-16, bi-18: `R_s ∩ Q_s = ∅` ⇒ row 8 `scope_disjoint`.
- bi-04, bi-06 → **STOP** (bi-06's site `scope` reads `["현관·중문","거실","복도"]`, so it plausibly
  belongs on rung 1 — underivable).
- fulls: spaces half satisfied; trades half `{flooring} ⊆ R_t`? bi-09 ✓, bi-11 ✓, bi-12 ✓;
  bi-10 ✗, bi-13 ✗ ⇒ not_evaluable. bi-01/bi-07 STOP.
- bi-19: breadth absent ⇒ scope `not_evaluable` (again `X8-19`, though `R_t ⊇ Q_t`).

### H.3 Classes — and what the guess costs

| | `V.breadth = partial` (taken) | `V.breadth = absent` (the other reading) |
|---|---|---|
| bi-17 | `exact` | `exact` |
| bi-09, bi-11, bi-12 | `fallback_from_full` | **`exact`** |
| bi-10, bi-13 | `not_evaluable` | `not_evaluable` |

So `X8-22` decides whether three whole-home remodels are presented to the visitor as **direct
answers** to *"바닥이랑 거실만"*.

### H.4 Order

`GR3a` row 2 fires under both readings (`Q_s ≠ ∅`). Rung 1: **bi-17**. Rung 2: bi-14 (2025-07-31) →
bi-15 → bi-16 → bi-18, all `scope_disjoint`. Rung 3: the fulls.

Under the `absent` reading this is `X8-20` again in its cleanest form: **four `scope_disjoint`
records are offered ahead of three records the function itself classed `exact`.**

### H.5 Against §4.1 H (`04:700`) — **agrees**

bi-17 is first, 12,500,000 statable, area 112 m² as authored or `AR4`-converted for display.

---

## Row I — "현관 수납"

### I.1 Extraction — the rule that no longer decides anything

`V.breadth` **absent** (bare enumeration). 현관 → `entrance`. **수납 is the ambiguous term `WS6`
names by name** (`07:344-351`):

> *"Where a visitor's word maps to more than one id under the consumer's own table — 수납 to
> `storage` or to `built_in_furniture` … the consumer takes the reading that does **not** permit a
> price comparison, and says which reading it took."*

**In rev 8 neither reading permits a price comparison, because nothing does** (§14.3.5, `07:1001`:
*"V0.2 does **no** price comparison"*). The tie-break selects nothing; the rule is inoperative, and
its own worked example is written entirely in the deferred vocabulary (*"the budget **permitted**"*,
*"**refused**"*), citing `PB1`-era machinery that §14.3's scope note (`07:790-794`) declares not in
force. **`X8-23` — a `C: MUST` whose decision procedure was deleted by the narrowing and whose text
was not updated.** I had to guess. I took 수납 → `built_in_furniture`, following `04:701`.

### I.2 Both readings, derived

**(a) 수납 → `built_in_furniture`** (`Q_s = {entrance}`, `Q_t = {built_in_furniture}`):
bi-18 `R_s == Q_s`, `Q_t ⊆ R_t = {built_in_furniture}` ⇒ row 3 `scope_exact` ⇒ **`exact`**.

**(b) 수납 → `storage`.** §4.1 I says this gives *"`Q_s = {entrance}` and `Q_t = {storage}`:
§14.3.3 **row 4**"*. **That is wrong. `storage` is in §7.3's Spaces table** (`07:299`: *"창고,
팬트리가 아닌 수납 공간 — a **dedicated** storage space"*), not Works. So `Q_s = {entrance, storage}`
and `Q_t = ∅`, and the first matching row is **row 6** (`R_s = {entrance} ⊊ Q_s`, `07:930`), not
row 4. The **relation label is the same** — `scope_subset` — but the **disclosure is not**: row 4
reports `Q_t \ R_t` as *"not established for this case"*; row 6 reports `Q_s \ R_s` as *"not
remodelled in this case"*. `CINV-17` (`07:1234`) makes that distinction normative on both axes.
§4.1 I therefore prescribes the wrong sentence to the visitor. **`X8-24` — disagreement with §4.1 I.**

### I.3 Order (reading a)

`GR3a` row 2 ⇒ spaces-named. Rung 1 (partials with `R_s ⊇ {entrance}`): **bi-18** — and bi-06,
whose site `scope` begins 현관·중문 and whose `publishedAt` (2026-03-19) would put it **first**.
`04:701` asserts *"bi-06 is unpriced and is returned on equal footing"*; it is not derivable that
bi-06 is returned at all, let alone where (`X8-1`).

Rung 2 (other partials, all `scope_disjoint`): bi-14 → bi-15 → bi-16 → bi-17 (`publishedAt` desc).
Rung 3 (fulls): bi-09, bi-10, bi-12, bi-13 are **`exact`** (each carries `built_in_furniture`);
bi-11 `not_evaluable`.

So the top three are **bi-18, bi-14, bi-15** — a kitchen job and a bathroom job offered ahead of
**four records the function classed `exact`**. `X8-20`, third occurrence.

### I.4 Against §4.1 I (`04:701`)

Agrees on bi-18 `exact` / 6,200,000. Disagrees on the `storage` branch (`X8-24`) and cannot derive
bi-06 (`X8-1`).

---

## Findings

Severity: **B** = blocks execution, **D** = disagreement with `04` §4.1, **A** = ambiguity I had to
resolve myself, **C** = internal contradiction, **N** = note.

| id | sev | finding | citation |
|---|---|---|---|
| `X8-1` | **B** | **bi-01 … bi-08 carry no `workScopeIds` in any document in this repo.** `EF3`'s `partial_remodel` branch and its `full_remodel` trades half both read `R_s`/`R_t`, so bi-01, bi-04, bi-06 and bi-07 are unevaluable on rows C, D, E, G, H, I, and unorderable on rows A, B, F (the whole-home rung's *larger `R_s` first*). §19's id lists are marked *"not the current demo document"*, so they are not data. `WS7c` makes the gap circular: without the ids the four may not carry `projectType` either, and §13's *full 2 · partial 2 · absent 4* becomes *absent 8*, deleting §4.1 rows A and D's expected answers. **This blocked six of nine rows.** | `04:44`; `07:375`; `07:894-897`; `07:882-885`; `07:1497-1498` |
| `X8-2` | N | The brief's *"§13 (query extraction)"* points at the `category` audit. Query extraction is §14.3.1 (`VB1`–`VB3`) and `WS6`. | `07:711` vs `07:808-849` |
| `X8-3` | **A** | **`VB3`'s closed list: closed set of literal strings, or of forms?** *"34평 전체"* (row A) and *"전체 가능해요"* (row B) are on none of the three listed strings (전체 리모델링 · 집 전체 · 올수리). Read literally ⇒ `V.breadth` absent ⇒ row B states **no criterion at all** and all 19 records are `exact` in a 19-way tie. I read the cells as exemplars of a closed set of *forms*. No rule says which. | `07:827`, `07:838`, `07:846-849` |
| `X8-4` | **A** | **No rule says what `basis` a bare Korean 평 query carries.** §14.3.1 requires `V.area` = value + unit + basis; nothing supplies the basis when the visitor omits it. `04:358` invokes `defaultAreaBasis`, which is a `schema.ts:107` **authoring** helper, not a contract rule. `AR5`'s *"one unknown basis lowers confidence"* points the opposite way (compare and disclose) from the supply-default the fixtures assume (refuse). Affects rows A, B, F, G. Flagged in identical terms by `13b` and `15b`; **unchanged through two revisions**. | `07:813`; `07:906-908`; `02:246`; `04:358`; `platform/content/schema.ts:107` |
| `X8-5` | **A** | The whole-home rung cell embeds a sort key — *"`partial_remodel` records, **larger `R_s` first**"* — that the *"Every result has an order"* key list does not contain, and no rule composes the two. Sub-rung or an extra key before `GR2a`? Undecided. | `07:1099` vs `07:1112-1119` |
| `X8-6` | **C** | **`GR4` and `CINV-19` cannot both hold** for a record whose only price is an authored `perArea` when the visitor stated a total budget. `GR4` strips `perArea` from the envelope; `CINV-19` requires each shown record's price be stated in the reply. Rows A and B put bi-01 (and bi-07) at the top of the result with nothing statable. | `07:1129-1131`; `07:1236` |
| `X8-7` | **N** | `04` §0.3 dates all eleven new records **older** than the live eight. `GR3`'s deterministic floor is `publishedAt` descending, so wherever the earlier keys tie, **every legacy record outranks every priced fixture**. Rows A, B, C, D all lead with a legacy record. | `04:46-48`; `07:1112-1119` |
| `X8-8` | N | §4.1 row A's *why* cell reads *"breadth `EF3` + area `EF4`"*. Breadth is `EF2`. | `04:693`; `07:870` |
| `X8-9` | **D** | **Row B.** §4.1 B promises *"each with its own total stated … the visitor reads the prices themselves"*. The two top-ranked records (bi-01, bi-07) have **no total**, and `GR4` withholds their `perArea` because the question was about a total. At a limit of 3 the visitor sees two priceless records and one 50,000,000 remodel. | `04:694`; `07:1129-1131` |
| `X8-10` | **D** | **Row B.** bi-11 (30,000,000, the literal answer) ranks **fifth** and is invisible at `PB4`'s own assumed limit of 3. §4.1 says "not promoted"; the accurate word is "not shown". `PB4`'s own italic names this failure mode. | `04:694`; `07:1019` |
| `X8-11` | **B/N** | **Nothing in §14.3 defines what is *returned*.** `EF6` is total over all 19, `GR3` is explicitly *"not a filter"* (`CINV-22`), and no rule states a result limit or a cutoff class. `EF1`/`GR2` both say *"every **returned** record"* without defining the term. §4.1 names 1–3 records per row, which presupposes a selection rule the contract does not contain; "result limit 3" appears only inside a `PB4` aside and two `CINV` fixtures. | `07:855`; `07:1033`; `07:1239`; `07:1019`, `07:1238` |
| `X8-12` | **C** | `CINV-24`(c) states *"classes `bi-09` `fallback_from_full` and `bi-14` `exact`, **in that order**"* for *"주방만 하고 싶어요"*. Read as an ordering claim it contradicts `GR3` (bi-14 is a **direct answer** on rung 1; bi-09 is on rung 3). | `07:1241`; `07:1082-1084` |
| `X8-13` | **A** | *"욕실 하나만"*: the 만 attaches to the **count**, not the space. `VB3` row 2's exemplar is *욕실**만***. Quantity is unrepresentable (`WS3`), so the count cannot even be recorded. I read it `partial`. | `07:839`; `07:332-335` |
| `X8-14` | **D** | **Row D.** `WS3` erases the bathroom count, so *"욕실 하나만"* and *"욕실 두 개"* are **the same query** to the function: both return bi-15 → bi-16 → bi-14, in that order. §4.1 D presents the pair as a contrast (*bi-15 / bi-16*) and cites `WS3` — the very rule that makes the contrast unobtainable — as its support. bi-16 is `scope_superset` on both utterances and is never a direct answer. | `04:696`; `07:332-335`; `07:929` |
| `X8-15` | **A** | *"전용 84 아파트 주방"* states **no unit**. §14.3.1 requires one; `AR1` is a producer rule and does not reach a query. I supplied `m2` by convention. | `04:697`; `07:813`; `02:242` |
| `X8-16` | **N** | `X8-4`'s two readings give bi-14 **different classes** on a bare-"34평" query — `not_evaluable` (bases refused) vs `area_fallback` (Δ −0.2527) — hence different `GR2` disclosures to the visitor. §4.1 E's promise survives only because 34평 = 112.4 m² and 84 m² happen to be 25 % apart. | `04:697`; `07:906-911`; `02:246` |
| `X8-17` | **D/C** | **Row F.** bi-08 (51평, Δ 0.02 — the closest area match in the corpus) is **fifteenth**, behind all 14 records that carry a `projectType`, because the whole-home rung set puts breadth-absent records last. §4.1 F promises it as a reference. `PB4`'s strong form says a `not_evaluable` criterion is *"not a penalty … not a null that sorts last"*; `GR3a`'s rung is neither a score nor a tie-break key, so it evades the letter and produces the outcome. `CINV-5` guards this for area only; there is no breadth counterpart. | `04:698`; `07:1099`; `07:1015-1019`; `07:1222` |
| `X8-18` | N | `GR5a` carries a live second exemption in this corpus that §14.3.7 does not list: bi-13's 125,000,000 = bi-10's `perArea` 2,500,000 × the **visitor's own** 50평. Statable only because it is bi-13's own field. Confirms the exemption is load-bearing. | `07:1136-1157` |
| `X8-19` | **C/D** | **Row G. `EF3`'s absent branch throws away positive trade evidence.** Its stated ground — *"Breadth unknown means coverage unknown"* — is about **spaces**, and it fires on a **trade-only** query. `WS7b` forbids inferring *exclusion* from an absent trade id, not *inclusion* from a present one, and the `full_remodel` branch evaluates `Q_t ⊆ R_t` on the same id list. Result: bi-19, whose ids are exactly 바닥·도배·조명, must be reported to the visitor as *scope not evaluable*. §14.3.3.1 and §4.1 G both treat bi-19 as reachable-and-answering and neither mentions the class. | `07:900`; `07:372-374`; `07:882-887`; `07:979-982`; `04:699` |
| `X8-20` | **C** | **`GR3` contradicts itself.** *"Direct answers are offered first, then the labelled references"* vs `GR3a`'s rung tables, which order by predicate, not class. Row G: bi-19 (`not_evaluable`) on rung 2 precedes bi-09 (`exact`) on rung 3. Row H: four `scope_disjoint` records precede three `exact` ones. Row I: four `exact` records are offered after four `scope_disjoint` ones. `CINV-22` resolves it in favour of the rungs, which makes the `GR3` sentence false as written. Created by rev 7's `Q-5` + `M-8`, never reconciled. | `07:1082-1084`; `07:1097-1101`; `07:1239`; `07:1761`, `07:1821` |
| `X8-21` | **D** | **Row G. Three criteria are not sufficient here.** For *"32평인데 도배랑 바닥만 얼마예요"*, the **only `exact` record — the only direct answer — is bi-09, a 50,000,000 whole-home remodel**, and it earns the class legitimately (breadth `not_applicable`, scope satisfied, area satisfied). bi-19 (11,000,000, the actual match) is `not_evaluable`. Through rev 7 the budget comparison was the only rule that separated them; §4.1 G says the deferral is harmless *"because **no** record is ever a budget match"*, which is the same fact seen from the other side. | `04:699`; `07:1043-1051`; `07:1001-1007` |
| `X8-22` | **A** | **`VB3`'s table has no first-match rule, and row H needs one.** *"바닥이랑 거실만"* is a restriction by **trade** (⇒ absent) **and** by **space** (⇒ partial); both rows match. `PB7`, `GR3a` and `EF6` each state first-match-wins explicitly; `VB3` — the list introduced to stop utterances being undecided — does not. The guess decides whether bi-09, bi-11 and bi-12 are `exact` or `fallback_from_full`. | `07:839`, `07:842`, `07:846-849`; cf. `07:919`, `07:1086`, `07:1040` |
| `X8-23` | **C/A** | **`WS6`'s ambiguity tie-break is inoperative in rev 8.** *"The consumer takes the reading that does **not** permit a price comparison"* — but V0.2 permits **no** price comparison at all, so the rule discriminates nothing. Its worked example is written wholly in deferred vocabulary (*budget permitted / refused*, `PB1`-era). A `C: MUST` with no decision procedure. Row I, and `WS6` is cited by §4.1 I as the thing that settles the row. | `07:344-351`; `07:1001-1007`; `07:790-794` |
| `X8-24` | **D** | **Row I. §4.1 I misclassifies `storage` as a trade.** It says 수납 → `storage` gives *"`Q_s = {entrance}` and `Q_t = {storage}` ⇒ §14.3.3 **row 4**"*. §7.3 puts `storage` in the **Spaces** table, so `Q_s = {entrance, storage}`, `Q_t = ∅`, and the first matching row is **row 6**. Same label (`scope_subset`), **different disclosure**: row 4 says *"not established for this case"*, row 6 says *"not remodelled in this case"* — a distinction `CINV-17` makes normative. | `04:701`; `07:299`; `07:928`, `07:930`; `07:1234` |

### Rules I had to read more than twice

| rule | what made it hard |
|---|---|
| `EF3` (`07:875-905`) | Four things in one bullet: a branch on `R.projectType`, a **split** branch for `full_remodel` whose two halves return different states, a `WS8` pre-condition, a reply-wording `C: MUST`, and a lemma about a *different* rule (`EF6` row 1). The `full_remodel` branch's three possible returns (satisfied / not_evaluable / never unsatisfied) have to be held simultaneously with `EF6`'s row order to see that row 1 can never fire for a full remodel. |
| `EF6` rows 4 and 6 (`07:1048`, `07:1050`) | Row 4 is *breadth* `not_evaluable`; row 6 is *any* criterion `not_evaluable`. They overlap on every breadth-absent record, and only the prose 12 lines down explains why 4 precedes 6. Rows 1–4 also silently pre-empt rows 5–6, so a record can be `breadth_fallback` while its area is `not_evaluable` and `GR2`'s per-record not-evaluable list still has to name it. |
| `GR3` + `GR3a` (`07:1079-1123`) | Three orderings in one rule — rung set, rung membership, and the five-key within-rung order — plus a definition of *direct answer* that the rungs then ignore (`X8-20`), plus a sort key hidden in a rung cell (`X8-5`). |
| §14.3.3 rows 3–8 (`07:927-932`) | *"Rows 5–8 read `Q_s` only, deliberately"* is two lines below the table; without it rows 3/4 and 5–8 look like they use the same inputs. Reading order matters and `PB7` is stated above the table, not in it. |
| `VB3` (`07:827-849`) | The table's left column mixes literal strings, glossed categories and a negation pattern, and there is no rule for what happens when two rows match or when none does (`X8-3`, `X8-22`). |
| `WS6` ambiguity clause (`07:344-351`) | Its decision procedure and its whole worked example were deleted by the rev-8 narrowing while the rule's text stayed (`X8-23`). |
| `WS7c` + `04` §0.2 (`07:375`, `04:44`) | The circularity — ids required to carry `projectType`, `projectType` already fixed by §13, ids deferred to a pass "outside this spec" — has to be assembled from two documents. |

### Does any rule, read literally, produce a result its own prose says is wrong?

Yes, four times: `X8-6` (`GR4` vs `CINV-19`), `X8-17` (`GR3a` vs `PB4`'s *"not a null that sorts
last"*), `X8-19` (`EF3`'s absent branch vs §14.3.3.1's *"reached through `GR3`'s trade rung"*),
`X8-20` (`GR3`'s *"direct answers are offered first"* vs `GR3a`'s own rung tables).

### Are three criteria sufficient for §4.1's answers?

**No, for rows B, F and G.**

- **B** needs something to surface bi-11 or at least to prefer a record that *has* a total; breadth
  alone ties seven records and `publishedAt` decides, so the two priceless legacy records win.
- **F** needs bi-08 to be reachable; breadth `not_evaluable` puts it fifteenth, and area — the one
  criterion on which it is the corpus's best match — cannot lift it off its rung.
- **G** needs bi-19 to be the answer and bi-09 not to be; with the budget criterion gone, nothing
  in the three criteria distinguishes an 11,000,000 trades job from a 50,000,000 whole-home remodel
  for a trades-only query, and `EF3`'s absent branch actively refuses the one piece of evidence that
  would (`X8-19`, `X8-21`).

Rows A, C, E and H are reproducible; D and I disagree on mechanism rather than on sufficiency
(`X8-14`, `X8-24`).
