# 13b — Fixture execution, by hand, against contract rev 6 (independent second source)

| | |
|---|---|
| method | worked entirely from the prose of `docs/reports/integration/07-integration-contract-v0.2-candidate.md` §5, §7, §14.3.1–§14.3.6, against the corpus `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md`. No code run, no `proof/ef6-totality.mjs` read or executed (excluded from inputs by instruction, to keep this an independent second source). |
| scope | 8 visitor utterances × 19 records (bi-01…bi-19) = 152 cells, each carrying EF2–EF5, the §14.3.3 relation where applicable, the §14.3.5 permission, and the EF6 class. |
| verdict on the deliverable | **do not fix anything** — this is a report only. |

---

## 0. Summary

| # | utterance | all 19 records get one determinate class? |
|---|---|---|
| 1 | "전체 리모델링 사례 보여주세요" | **yes** |
| 2 | "주방만 하고 싶어요" | no — bi-04, bi-06 undetermined |
| 3 | "2천만원으로 뭘 할 수 있나요" | **yes** |
| 4 | "창호 교체하려는데 34평 전체 리모델링 사례 있나요, 예산 5천" | no — bi-04, bi-06 undetermined; also a ladder-selection ambiguity (§3.4) |
| 5 | "1억 이내로 전체 리모델링 하고 싶어요" | **yes** |
| 6 | "32평인데 도배랑 바닥만 얼마예요" | no — bi-01, bi-04, bi-06 undetermined |
| 7 | "욕실만 700만원" | no — bi-04, bi-06 undetermined |
| 8 | "현관이랑 복도 수납" | no — bi-01, bi-07, bi-04, bi-06 undetermined, **and bi-18 itself splits into two classes depending on how "복도 수납" is parsed** |

**3 of 8 utterances (§1, §3, §5) produce a clean, single-valued class for every one of the 19 records. 5 of 8 do not.**

That 3-of-8 count is generous to the contract in one respect: it counts only per-record **class** determinacy. None of the 8 — including the 3 "clean" ones — has a fully determined **display order** once a direct answer (`exact`) coexists with labelled references, because §14.3.6's two ordering mechanisms (`GR3`'s ladder, `PB6a`'s sequence) are each stated to trigger under a condition the other does not share, and no cited rule says which governs when both a direct answer and non-`exact` records are present in the same result — which is the normal case, not an edge case. See §1 below.

The root cause of 4 of the 5 non-clean utterances (§2, §4, §6, §7) is not a defect in the contract's *rules* — `EF2`–`EF6` are computed correctly and totally wherever the inputs are known. It is that **the corpus does not supply `workScopeIds` for bi-01, bi-04, bi-06, bi-07**, and the contract's own `WS7c` makes that data load-bearing for exactly these four records (they are the ones that carry a stated `projectType`). `04-demo-data-spec.md` says this outright (§0.2, §6): authoring `workScopeIds` for bi-01…bi-08 is "outside this spec." The 8th utterance additionally exposes a genuine **contract gap** — not a corpus gap — in how a visitor's scope words map to `Q`, independent of any missing record data.

---

## 1. Cross-cutting findings (apply to more than one utterance)

### 1.1 `workScopeIds` for bi-01, bi-04, bi-06, bi-07 does not exist in the corpus

`04-demo-data-spec.md` §0.2: *"`workScopeIds` and `style` for the 8 are an authoring pass outside this spec."* §6 repeats it: *"Not done here, on purpose: authoring `projectType` / `propertyType` / `workScopeIds` / `style` for bi-01 … bi-08."*

Consequence, precisely: `EF2` (breadth) never needs `workScopeIds`, so bi-01–bi-08's breadth is always computable from the `projectType` values `04-demo-data-spec.md` §0.2 fixes by citing contract §13 (full: bi-01, bi-07 · partial: bi-04, bi-06 · absent: bi-02, bi-03, bi-05, bi-08). But `EF3` (scope) for a `full_remodel` record needs `R_t` whenever `Q_t ≠ ∅`, and `EF3`/the §14.3.3 relation for a `partial_remodel` record needs `R_s` (and often `R_t`) whenever `Q ≠ ∅` and it isn't the `Q = ∅` row-1 case. That is exactly when the gap bites:

| record | affected whenever | why |
|---|---|---|
| bi-01, bi-07 (`full_remodel`) | the utterance names a **trade** (`Q_t ≠ ∅`) | trades-half of `EF3` needs `R_t`; spaces-half doesn't need `R_s` (auto-satisfied by `PT4`(b) reasoning) and the trades-half is vacuously satisfied when `Q_t = ∅`, so naming only **rooms** never triggers the gap for these two |
| bi-04, bi-06 (`partial_remodel`) | the utterance names **any** scope (`Q ≠ ∅`) | every §14.3.3 row past row 1 reads `R_s`, and rows 2–4/§14.3.3.1 also read `R_t` |

Where the gap fires, the record's class is either an outright **gap** (no class can be justified at all) or an **ambiguity** narrowed by `INV-30` (every `partial_remodel` has `R_s ≠ ∅`, which rules out `scope_exact` whenever `Q` is a trade-only singleton request) or by the singleton-`Q` argument (a singleton `Q_s` or `Q_t` can never produce `scope_overlap`, since overlap requires a partial intersection that a one-element set cannot produce). The per-utterance sections below state the narrowed candidate set each time; it is never wider than 4 classes and never includes `scope_overlap` when the named `Q` half is a singleton.

One informal aside in the corpus (bi-16's write-up, line 439) calls bi-04 "paired with bi-16 (same scope set, no price)" — i.e. it hints bi-04's eventual `workScopeIds` will be `{kitchen, bathroom}`. This is explicitly forward-looking commentary, not authored data (the same section that makes this remark is the one that disclaims the authoring pass as "outside this spec"). It is not used here as a fact; where it is used at all it is flagged as an unauthored hint, not evidence.

### 1.2 `GR3`'s ladder vs. `PB6a`'s sequence: no rule says which orders a mixed result

`GR3`: *"When no record is a direct answer, the ladder is what the visitor sees, in this order: [table]."* `PB6a`: *"whenever `PB6` yields `delta = 0` for more than one record … [it] is ordered by, in sequence: 1. `EF6`'s class, in the row order `EF6` is written in; 2. …"*

These are each other's complement in trigger condition, not in scope: `GR3`'s table is stated to apply only when **zero** records are `exact`; `PB6a`'s sequence is stated to apply only when **two or more** records tie on `delta = 0`. Neither clause is stated to govern the ordinary case — present in essentially every non-trivial result, including 3 of the 3 "clean" utterances below (§1, §3, §5) — where **some** records are `exact` (direct answers) and **others** are not (labelled references, of several different `EF6` classes), with no price tie at all (§1, §5 with no stated budget) or with a tie that resolves only the top cluster (§5's four `exact` records) and says nothing about the remaining 15.

A coherent reading is available by extrapolation — direct answers first, then labelled references ordered by `PB6a`'s five-key sequence, treating "class, in the row order `EF6` is written in" as a general preference order among the seven non-`exact` classes — and it is consistent with everything checked here (e.g. §4's `bi-10` `price_fallback` outranking `bi-09` `not_evaluable`, row 5 before row 7). But it is an extrapolation: no cited sentence states that `PB6a`'s sequence is the general tie-break for labelled references whenever a direct answer also exists, and none states what happens to labelled references' relative order when there is *no* price tie at all (§1 has no stated budget, so `PB6` never runs, so key 1 of `PB6a` — the only key here that would ever discriminate between classes — is never invoked by its own trigger). **The contract does not say.** This is flagged once here and referenced by shorthand (`ORDER-GAP`) in the per-utterance sections rather than re-derived each time.

### 1.3 A visitor's bare "34평"/"32평": no cited rule states its basis

`PY1`/`AR5` state what happens when the visitor's area **basis is stated** ("전용 84㎡"). Nothing in §14.3.1's definition of `V.area` (value + unit + basis) or in `PY1`/`AR5` states what basis a visitor's **bare** pyeong figure — no 전용/공급 qualifier — carries for matching purposes. Elsewhere in this codebase (`platform/content/schema.ts:107`, `defaultAreaBasis`) a bare Korean-residential 평 figure defaults to `supply` — but that function is documented and cited everywhere else in this project as an **authoring-side** convention for filling in a record's own unstated basis, not a rule for parsing a visitor's utterance. The task's own utterance list states utterance 4's area as "34평 **supply**" explicitly (resolving it for that one case) but gives utterance 6 only "32평" with no basis. Utterance 6's §2.6 below computes on the assumption that the same `defaultAreaBasis` convention is extended to visitor utterances (bare Korean 평 ⇒ supply); this extension is not licensed by anything in the cited §14.3.1/`PY1`/`AR5` text, and is flagged as an assumption, not a rule application.

---

## 2. Per-utterance execution

Notation: `R_s` = a record's `workScopeIds ∩ Spaces`, `R_t` = `∩ Works`. `?` = unauthored in the corpus (gap). Deltas are shown as fractions before rounding. Tiers: `strong` ≤0.10, `acceptable` ≤0.20, else `fallback`.

### 2.1 "전체 리모델링 사례 보여주세요" (breadth only)

`V.breadth = whole`, `Q = ∅`, `V.area` absent, `V.budget` absent.

`EF3`/`EF4`/`EF5` are `not_applicable` for **every** record (`Q = ∅`; no area/budget stated), so `EF2` alone decides the class, and `EF2` never needs `workScopeIds` — **no record is affected by the §1.1 gap here.**

| id | `projectType` | breadth | class |
|---|---|---|---|
| bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 | full_remodel | satisfied | **exact** (row 8) |
| bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 | partial_remodel | unsatisfied | breadth_fallback (row 3) |
| bi-02, bi-03, bi-05, bi-08, bi-19 | absent | not_evaluable | unknown_type_fallback (row 4) |

**Clean: all 19 records get one determinate class.**

Positive check: this is the exact utterance the contract cites (§14.3.6) as the case rev 5's bug misclassified — *"a one-bathroom 7,000,000 job [bi-15] fell to the otherwise row and was classed `exact`."* Under rev 6's rules as computed here, bi-15 is `breadth_fallback`, not `exact`. The bug does not reproduce.

Order: exact records (7) are direct answers. `ORDER-GAP` (§1.2) applies to their relative order — no budget was stated, so `PB6`/`PB6a` never run, and nothing else orders same-class records absent a tie. It also applies to where the 12 labelled references (7 `breadth_fallback`, 5 `unknown_type_fallback`) are placed relative to the direct answers and to each other.

### 2.2 "주방만 하고 싶어요" (partial framing, kitchen)

Read per the task's own framing as `V.breadth = partial` (stated), `Q = {kitchen}` ⇒ `Q_s = {kitchen}`, `Q_t = ∅`. `V.area`/`V.budget` absent. (Flagged aside: `VB3` forbids inferring breadth from a named room alone — "주방이랑 욕실" would not set breadth. Whether "주방**만**" clears that bar on its own linguistic merits, independent of the task's framing, is not decided by anything cited here either; taken as given for this exercise.)

Because `Q_t = ∅`, the trades-half of every relevant test is vacuously satisfied regardless of `R_t` — so the §1.1 gap does **not** bite bi-01/bi-07 here (only `R_s` would matter for a full-remodel record's scope, and the spaces-half doesn't read `R_s` at all).

| id | breadth | scope (`R_s` vs `Q_s={kitchen}`) | class |
|---|---|---|---|
| bi-01, bi-07 | unsatisfied | satisfied (Q_t=∅ vacuous) | **fallback_from_full** (row 2) |
| bi-09, bi-10, bi-11, bi-12, bi-13 | unsatisfied | satisfied | fallback_from_full (row 2) |
| bi-14 | satisfied | `R_s={kitchen}`==Q_s → scope_exact | **exact** (row 8) |
| bi-15 | satisfied | `R_s={bathroom}`, disjoint → scope_disjoint | scope_disjoint (row 1) |
| bi-16 | satisfied | `R_s={kitchen,bathroom}` ⊋ Q_s → scope_superset | scope_superset (row 1) |
| bi-17 | satisfied | `R_s={living_room}`, disjoint → scope_disjoint | scope_disjoint (row 1) |
| bi-18 | satisfied | `R_s={entrance}`, disjoint → scope_disjoint | scope_disjoint (row 1) |
| bi-02, bi-03, bi-05, bi-08, bi-19 | not_evaluable | not_evaluable | unknown_type_fallback (row 4) |
| **bi-04** | satisfied | `R_s = ?` | **GAP — no class justified** |
| **bi-06** | satisfied | `R_s = ?` | **GAP — no class justified** |

Positive check: no `full_remodel` record is `exact` here — the second half of the rev-5 bug the contract names (*"a 50,000,000 whole-home remodel was classed `exact` for '주방만 하고 싶어요'"*) does not reproduce.

**bi-04 and bi-06: not merely ambiguous, but genuinely undecidable from the corpus.** The corpus states no `R_s` at all for either record — not even a value that narrows to a short candidate list — so no `EF3` state, and therefore no `EF6` row, can be justified from the given text. (If bi-04's `R_s` in fact turns out to be `{kitchen, bathroom}`, as the informal aside in §4 of the demo spec hints, it would land on `scope_superset` — but that hint is explicitly not authored data.)

Order: `exact` = {bi-14}, a single direct answer — this utterance's order is otherwise `ORDER-GAP` for the remaining 16–18 records (12–14 labelled references plus the two undecidable ones), the same as §2.1.

### 2.3 "2천만원으로 뭘 할 수 있나요" (budget only)

`V.breadth` absent, `Q = ∅`, `V.area` absent, `V.budget = exact 20,000,000`.

`EF2`/`EF3`/`EF4` are `not_applicable` everywhere (nothing about breadth, scope or area was stated). Only `EF5` varies, and — critically — `Q = ∅` means the partial-branch permission is §14.3.3 **row 1** for every `partial_remodel` record, which needs no `R_s`/`R_t` at all. **No record is affected by the §1.1 gap here.**

Permission (`PB1`): `full_remodel` — permitted (breadth absent counts as "whole or absent", area not_applicable). `partial_remodel` — permitted via row 1. `absent` — never permitted (`PB1` third bullet).

| id | total | delta = (t−b)/b, b=20,000,000 | permitted? | budget state | class |
|---|---|---|---|---|---|
| bi-09 | 50,000,000 | (50.0M−20.0M)/20.0M = **1.5** | yes | unsatisfied | **price_fallback** |
| bi-10 | 85,000,000 | (85.0M−20.0M)/20.0M = **3.25** | yes | unsatisfied | price_fallback |
| bi-11 | 30,000,000 | (30.0M−20.0M)/20.0M = **0.5** | yes | unsatisfied | price_fallback |
| bi-12 | 52,000,000 | (52.0M−20.0M)/20.0M = **1.6** | yes | unsatisfied | price_fallback |
| bi-13 | range 125.0–140.0M | nearer bound 125.0M: (125.0M−20.0M)/20.0M = **5.25** | yes | unsatisfied | price_fallback |
| bi-14 | 15,000,000 | (15.0M−20.0M)/20.0M = **−0.25** | yes | satisfied | **exact** |
| bi-15 | 7,000,000 | (7.0M−20.0M)/20.0M = **−0.65** | yes | satisfied | exact |
| bi-16 | 19,800,000 | (19.8M−20.0M)/20.0M = **−0.01** | yes | satisfied | exact |
| bi-17 | 12,500,000 | (12.5M−20.0M)/20.0M = **−0.375** | yes | satisfied | exact |
| bi-18 | 6,200,000 | (6.2M−20.0M)/20.0M = **−0.69** | yes | satisfied | exact |
| bi-01, bi-07 | absent | — | yes, but no usable price | not_evaluable | **not_evaluable** |
| bi-04, bi-06 | absent (pricing entirely absent) | — | yes, but no usable price | not_evaluable | not_evaluable |
| bi-02, bi-03, bi-05, bi-08, bi-19 | — | — | **never** (`PT1` absent) | not_evaluable | not_evaluable |

**Clean: all 19 records get one determinate class**, including bi-04 and bi-06 — the `Q = ∅` row-1 shortcut means their missing `workScopeIds` never has to be read, and their pricing absence is an explicit corpus fact, not a gap.

This matches the contract's own worked commentary on this exact utterance almost exactly (§14.3.3's row-1 note: *"a corpus containing five partial jobs inside the budget"*) — 5 records (bi-14, 15, 16, 17, 18) come out `exact`, confirming that count.

Order: this is the one utterance shape with an explicit, on-point `GR3` ladder rung ("nothing but a budget"): *"records with a comparable `pricing.total`, `|delta|` ascending, each carrying `PB0a`'s coverage statement → records with any price → the rest."* Applying it (and flagging, per §1.2, that the rung's own trigger — "no direct answer" — doesn't literally hold, since 5 records are `exact`):

`|delta|` ascending over the 10 comparable records: bi-16 (0.01) → bi-14 (0.25) → bi-17 (0.375) → bi-11 (0.5) → bi-15 (0.65) → bi-18 (0.69) → bi-09 (1.5) → bi-12 (1.6) → bi-10 (3.25) → bi-13 (5.25).

Then "records with any price": bi-01, bi-07 (authored `perArea`, no total) certainly qualify; bi-19 (has a total but permission is categorically refused) also has "any price" and belongs here rather than in the comparable tier. **bi-02, bi-03, bi-05 are a gap for this specific placement**: the corpus characterises them only as "price-poor or per-area-only" (04 §4, row E1) — it does not say whether any of the three actually carries a `perArea` value or carries no price field at all, so they cannot be confidently placed in "records with any price" vs. "the rest." Then "the rest": bi-04, bi-06 (pricing explicitly absent, confirmed).

### 2.4 "창호 교체하려는데 34평 전체 리모델링 사례 있나요, 예산 5천" (whole, trade=windows, 34평 supply, exact 50,000,000)

`V.breadth = whole`, `Q_s = ∅`, `Q_t = {windows}`, `V.area = 34 pyeong supply`, `V.budget = exact 50,000,000`.

This utterance is a budget-and-area-extended variant of the contract's own `CINV-13`(c) fixture (*"창호 교체하려는데 34평 전체 리모델링 사례 있나요"*, without the budget clause). `CINV-13`(c) itself checks out under this method (see §3 below) — but because this utterance additionally states a budget, its own bi-10 result differs from `CINV-13`(c)'s (there, with no budget, bi-10 is `exact`; here, with the 50M budget against an 85M total, it is `price_fallback`). That difference is not a defect; it shows how sensitive the class is to exactly which clauses the visitor states.

Area (Δ_area = (r−v)/v, v=34): bi-01 34py(basis unstated on the record) → 0/34=**0**, strong. bi-07 19py → (19−34)/34=**−0.4412**, fallback. bi-08 51py → (51−34)/34=**0.5**, fallback. bi-09 34py supply → **0**, strong. bi-10 34py supply → **0**, strong. bi-11 20py → (20−34)/34=**−0.4118**, fallback. bi-12 26py → (26−34)/34=**−0.2353**, fallback (just over the 0.20 line: 8/34=0.2353). bi-13 48py → (48−34)/34=**0.4118**, fallback. bi-14 84m² **exclusive** vs visitor's **supply** — both bases known and different → `AR5` refuses → not_evaluable, regardless of the arithmetic. bi-15 area absent → not_evaluable. bi-16 38py → (38−34)/34=**0.1176**, acceptable. bi-17 112m² supply → 112×121/400=**33.88py**; (33.88−34)/34=**−0.0035**, strong. bi-18 30py → (30−34)/34=**−0.1176**, acceptable. bi-19 32py → (32−34)/34=**−0.0588**, strong. bi-02, bi-03, bi-04, bi-05, bi-06: area unstated in the corpus → **gap**, but see below — it never has to be resolved for these five, because other criteria decide their class first.

| id | breadth | scope | area | budget | class |
|---|---|---|---|---|---|
| bi-09 | satisfied | not_evaluable (`windows∉R_t={flooring,wallpaper,lighting}`) | satisfied | satisfied (Δ=0) | **not_evaluable** (row 7; scope) |
| bi-10 | satisfied | satisfied (`windows∈R_t`) | satisfied | unsatisfied (Δ=(85.0M−50.0M)/50.0M=**0.7**) | **price_fallback** (row 5) |
| bi-11 | satisfied | not_evaluable (windows∉R_t) | unsatisfied | permission fails (area unsatisfied ⇒ `PB1` full-branch condition fails) | **area_fallback** (row 6) |
| bi-12 | satisfied | not_evaluable | unsatisfied | permission fails | area_fallback |
| bi-13 | satisfied | satisfied (windows∈R_t) | unsatisfied | permission fails | area_fallback |
| bi-01 | satisfied | `R_t=?` → **gap**, but moot | satisfied | not_evaluable (no total) | **not_evaluable** (row 7 fires on budget regardless of the scope gap) |
| bi-07 | satisfied | `R_t=?` → gap, moot | unsatisfied | not_evaluable | **area_fallback** (row 6 fires on area before row 7 could matter) |
| bi-14…bi-18 | satisfied | unsatisfied (all `scope_disjoint` — singleton `Q_t`, none carries `windows`) | n/a (moot) | not permitted (moot) | **scope_disjoint** (row 1) |
| bi-04, bi-06 | satisfied | `R_t=?` — **row 1 will fire** (`scope_exact` is impossible: `INV-30` forces `R_s≠∅` for any partial, and §14.3.3.1's `scope_exact` row requires `R_s=∅`) but the actual relation is undetermined | — | — | **AMBIGUOUS: scope_superset or scope_disjoint** (singleton `Q_t` rules out `scope_overlap`) |
| bi-02, bi-03, bi-05, bi-08, bi-19 | not_evaluable | not_evaluable | (moot) | never permitted | **unknown_type_fallback** (row 4) |

**No record resolves to `exact`.** bi-04/bi-06 are a 2-way ambiguity (not a full gap, thanks to `INV-30` and the singleton-`Q_t` argument), narrower than §2.1/§2.2's blanket gaps.

**A second, independent defect: the `GR3` ladder-row selector is itself ambiguous for this utterance.** The ladder table's four rows are keyed on "the visitor asked": *partial work, spaces named* / *trade-only* / *whole-home work* / *nothing but a budget*. This utterance states **both** `V.breadth = whole` (qualifying for the "whole-home work" row: `full_remodel records → breadth-absent records`) **and** a trade-only scope shape (`Q_s = ∅, Q_t ≠ ∅`, qualifying for the "trade-only" row: `partial records by §14.3.3.1 → breadth-absent records whose R_t ⊇ Q_t → full_remodel records`). These two rows prescribe **different sequences**, and nothing in `GR3` states a precedence between them (unlike `EF6` and §14.3.3, which both say "first match wins"). **The contract does not say which rung applies to an utterance that states a breadth and a trade together.**

### 2.5 "1억 이내로 전체 리모델링 하고 싶어요" (max 100,000,000, whole, no area, no scope)

`V.breadth = whole`, `Q = ∅`, `V.area` absent, `V.budget = max 100,000,000`.

`EF3`/`EF4` are `not_applicable` everywhere (`Q=∅`, no area). `PB1` full-branch permission needs only `EF4 ∈ {satisfied, not_applicable}` — here always `not_applicable` — so permission is unconditional for every `full_remodel` record, and row 1 makes it unconditional for every `partial_remodel` record too. **No record is affected by the §1.1 gap.**

| id | total | delta (m=100,000,000) | class |
|---|---|---|---|
| bi-09 | exact 50,000,000 | 50.0M≤100.0M ⇒ **0** | **exact** |
| bi-10 | exact 85,000,000 | 85.0M≤100.0M ⇒ **0** | exact |
| bi-11 | exact 30,000,000 | 30.0M≤100.0M ⇒ **0** | exact |
| bi-12 | exact 52,000,000 | 52.0M≤100.0M ⇒ **0** | exact |
| bi-13 | range 125.0–140.0M | lo=125.0M>m: (125.0M−100.0M)/100.0M=**0.25** | price_fallback |
| bi-01, bi-07 | no total | not_evaluable | **not_evaluable** (row 7) |
| bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 | (any) | breadth mismatches first (row 3 precedes row 5) | **breadth_fallback** |
| bi-02, bi-03, bi-05, bi-08, bi-19 | (any) | breadth not_evaluable (row 4) | **unknown_type_fallback** |

**Clean: all 19 records determinate.** This exactly reproduces `CINV-21`'s own fixture: *"bi-09, bi-10, bi-11, bi-12 all `delta = 0`, all `exact`, every discriminating key flat."* Verified: with no stated area or scope, `PB6a` keys 2–3 are flat across the four, so the order among them is decided by key 4, `publishedAt` descending — bi-09 (2025-12-11) → bi-10 (2025-11-20) → bi-11 (2025-10-23) → bi-12 (2025-09-25) — which matches `CINV-21`'s "the order is decided by `publishedAt` then `id`." A result limit of 3 (noted by `PB4`'s own commentary — *"fourth place is invisible"*) would drop bi-12 from what the visitor actually sees, despite it being equally `exact`.

Order: the top 4 are fully determined (above). `ORDER-GAP` (§1.2) still applies to the remaining 15 (breadth_fallback ×7, unknown_type_fallback ×5, price_fallback ×1, not_evaluable ×2) — no cited rule orders them relative to the direct answers or to each other; `PB6a`'s sequence was triggered by, and resolved, only the tied `exact` cluster.

### 2.6 "32평인데 도배랑 바닥만 얼마예요" (trade-only, 32평)

`V.breadth` absent, `Q_s = ∅`, `Q_t = {wallpaper, flooring}`, `V.area = 32 pyeong`, basis extended by assumption to `supply` (§1.3 — **not** licensed by any cited rule), `V.budget` absent (a price *question*, not a stated figure — `VB1` never resolves "얼마예요" to a number).

Because `V.budget` is absent, `EF5` is `not_applicable` everywhere — this utterance never engages `PB1`/`PB6` at all, which matters for the ordering discussion below. Because `V.breadth` is absent, `EF2` is `not_applicable` everywhere too (**not** `not_evaluable` — this is the same distinction that matters in §2.3: an absent-`projectType` record is *not* automatically `unknown_type_fallback` here, because breadth was never asked about).

Area (v=32): bi-01 34py → **0.0625**, strong. bi-07 19py → **−0.4063**, fallback. bi-08 51py → **0.5938**, fallback. bi-09 34py supply → **0.0625**, strong. bi-10 34py supply → **0.0625**, strong. bi-11 20py → **−0.375**, fallback. bi-12 26py → **−0.1875**, acceptable. bi-13 48py → **0.5**, fallback. bi-14 84m² exclusive vs. supply → bases differ, both known → not_evaluable. bi-15 area absent → not_evaluable. bi-16 38py → **0.1875**, acceptable. bi-17 112m²→33.88py → **0.0588**, strong. bi-18 30py → **−0.0625**, strong. bi-19 32py → **0**, strong. bi-02, bi-03, bi-04, bi-05, bi-06 area unstated in corpus.

| id | scope (`Q_t={wallpaper,flooring}` vs `R_t`) | area | class |
|---|---|---|---|
| bi-09 | satisfied (`R_t={flooring,wallpaper,lighting} ⊇ Q_t`) | satisfied | **exact** |
| bi-10 | not_evaluable (`R_t={windows,expansion,built_in_furniture}`, neither present) | satisfied | **not_evaluable** |
| bi-11 | satisfied (`R_t={flooring,wallpaper,doors} ⊇ Q_t`) | unsatisfied | **area_fallback** |
| bi-12 | not_evaluable (`R_t={flooring,lighting,built_in_furniture}`; wallpaper missing) | satisfied | **not_evaluable** |
| bi-13 | not_evaluable (`R_t={windows,lighting}`, neither present) | unsatisfied | **area_fallback** (row 6 precedes row 7) |
| bi-08 | not_evaluable (absent-type branch) | unsatisfied | **area_fallback** |
| bi-14…bi-16, bi-18 | unsatisfied — scope_disjoint (`R_t=∅` for all four) | (moot) | **scope_disjoint** |
| bi-17 | unsatisfied — `R_t={flooring}`: `Q_t⊄R_t` but `R_t∩Q_t={flooring}≠∅` → **scope_overlap** | (moot) | **scope_overlap** |
| bi-02, bi-03, bi-05, bi-19 | not_evaluable (absent-type) | satisfied (bi-19), gap (02/03/05) | **not_evaluable** (scope alone already triggers row 7, so the area gap for 02/03/05 never has to be resolved) |
| **bi-01** | `R_t = ?` | satisfied | **AMBIGUOUS: exact or not_evaluable** — hinges entirely on whether the unauthored `R_t` happens to contain both `wallpaper` and `flooring` |
| **bi-07** | `R_t = ?` | unsatisfied | **area_fallback** (row 6 fires regardless of the scope gap) |
| **bi-04, bi-06** | `R_s, R_t = ?` | (moot — row 1 will fire regardless, per `INV-30`) | **AMBIGUOUS: scope_superset, scope_overlap, or scope_disjoint** (3-way; `Q_t` here has 2 elements, so `scope_overlap` is not excluded the way it was in §2.4) |

**bi-01 is the sharpest finding in this utterance: it might tie bi-09 as a second `exact` match, or might not, and the corpus genuinely cannot say either way.** This utterance is the demo's own advertised showcase for `workScopeIds` (04 §4.1 lists bi-19 against this exact query, on the trade rung) — and its actual "exact" answer set is unverifiable because a sibling *already-authored-`projectType`* record's scope data was never written down.

`bi-19` (breadth-absent, `R_t={flooring,wallpaper,lighting}` — a literal superset of `Q_t`) still resolves to `not_evaluable`, not `exact` — consistent with the demo spec's own claim (04 §4.1) that bi-19 is reached only via `GR3`'s trade rung, with its 11,000,000 "stated as a fact… and explicitly not called a budget match." (Budget is moot here since none was stated; the operative fact is that the absent-`projectType` branch of `EF3` never reads `R_t` at all, so `not_evaluable` is correct independent of that.)

### 2.7 "욕실만 700만원" (bathroom, exact 7,000,000, breadth not stated)

`V.breadth` absent, `Q_s = {bathroom}`, `Q_t = ∅`, `V.area` absent, `V.budget = exact 7,000,000`.

`Q_t = ∅` again makes the trades-half vacuous for every `full_remodel` record — bi-01/bi-07's `R_t` gap does not bite here.

`PB1` full-branch: `V.breadth` absent and `Q_s ≠ ∅` ⇒ permitted **only with `PB0a`'s coverage statement** (a disclosure requirement, not a block). `PB1` partial-branch: permitted iff §14.3.3 permits.

| id | scope | budget (b=7,000,000) | class |
|---|---|---|---|
| bi-01 | satisfied (Q_t=∅ vacuous) | not_evaluable (no total) | **not_evaluable** |
| bi-07 | satisfied | not_evaluable (no total) | **not_evaluable** |
| bi-09 | satisfied | unsatisfied: (50.0M−7.0M)/7.0M=**6.143** | **price_fallback** |
| bi-10 | satisfied | unsatisfied: (85.0M−7.0M)/7.0M=**11.143** | price_fallback |
| bi-11 | satisfied | unsatisfied: (30.0M−7.0M)/7.0M=**3.286** | price_fallback |
| bi-12 | satisfied | unsatisfied: (52.0M−7.0M)/7.0M=**6.429** | price_fallback |
| bi-13 | satisfied | unsatisfied, nearer bound 125.0M: (125.0M−7.0M)/7.0M=**16.857** | price_fallback |
| bi-14 | `R_s={kitchen}`, disjoint from `{bathroom}` → scope_disjoint | (moot) | **scope_disjoint** |
| bi-15 | `R_s={bathroom}`==Q_s → **scope_exact**, permitted | (7.0M−7.0M)/7.0M=**0**, satisfied | **exact** |
| bi-16 | `R_s={kitchen,bathroom}` ⊋ Q_s → scope_superset | (moot, not permitted) | **scope_superset** |
| bi-17 | `R_s={living_room}`, disjoint → scope_disjoint | (moot) | **scope_disjoint** |
| bi-18 | `R_s={entrance}`, disjoint → scope_disjoint | (moot) | **scope_disjoint** |
| bi-02, bi-03, bi-05, bi-08, bi-19 | not_evaluable | not_evaluable (never permitted) | **not_evaluable** |
| **bi-04, bi-06** | `R_s = ?`; `Q_s` is a singleton so `scope_overlap` is excluded, leaving `{scope_exact, scope_superset, scope_disjoint}`; both records have **pricing entirely absent** (confirmed fact, no gap) | if scope_exact: not_evaluable (no price, regardless of permission); if not: row 1 fires directly | **AMBIGUOUS, 3-way: not_evaluable, scope_superset, or scope_disjoint** — never `exact` (pricing is confirmed absent either way) |

bi-15 is a clean, unambiguous `exact` — the one utterance among the 8 where the single most on-point record is also fully corpus-determined with no gap anywhere in its own row.

### 2.8 "현관이랑 복도 수납" (entrance + hallway + storage-ish)

`V.breadth` absent, `V.area`/`V.budget` absent. `Q` itself is not determined by any cited rule: `WS6` ("aliases, hierarchy, synonyms and compounds are the consumer's") governs how visitor words map to ids, but nothing in the cited sections states whether "복도" in "현관이랑 복도 수납" is read as its own named space (`hallway`) or is absorbed, together with "수납," into a single trade phrase (`built_in_furniture`) with no space claim at all. Both readings are computed; **bi-18's own class differs between them**, even though bi-18's authored data (`R_s={entrance}, R_t={built_in_furniture}` — a fully-specified, non-gap record) is fixed.

**Reading A** — `Q_s={entrance}`, `Q_t={built_in_furniture}` ("수납" read as a trade phrase, "복도" as its location, not a separate space claim; matches 04 §4.1's own assumption for the shorter utterance "현관 수납"):

| id | scope | class |
|---|---|---|
| bi-09 | not_evaluable (`built_in_furniture∉R_t`) | not_evaluable |
| bi-10 | satisfied (`built_in_furniture∈R_t`) | **exact** |
| bi-11 | not_evaluable | not_evaluable |
| bi-12 | satisfied (`built_in_furniture∈R_t`) | **exact** |
| bi-13 | not_evaluable | not_evaluable |
| bi-01, bi-07 | `R_t=?` | **AMBIGUOUS: exact or not_evaluable** |
| bi-14, bi-15, bi-16, bi-17 | `R_s` disjoint from `{entrance}` → scope_disjoint | scope_disjoint |
| bi-18 | `R_s={entrance}`==Q_s and `built_in_furniture∈R_t` → **scope_exact** | **exact** |
| bi-02, bi-03, bi-05, bi-08, bi-19 | not_evaluable | not_evaluable |
| bi-04, bi-06 | `R_s=?` | AMBIGUOUS, up to 4-way (`scope_exact`/`scope_subset`/`scope_superset`/`scope_disjoint`, `scope_overlap` excluded by the singleton `Q_s`) |

**Reading B** — `Q_s={entrance, hallway}`, `Q_t={built_in_furniture}` ("복도" read as its own named space, coordinated with "현관" by "이랑"):

Only the `partial_remodel` rows change (a `full_remodel` record's spaces-half is `Q_s`-blind by construction, so bi-09…bi-13 and the absent-type rows are unchanged from Reading A):

| id | scope | class |
|---|---|---|
| bi-14, bi-15, bi-16, bi-17 | still disjoint from `{entrance, hallway}` | scope_disjoint |
| **bi-18** | `R_s={entrance}` ⊊ `Q_s={entrance, hallway}` → **scope_subset**, not permitted, "`hallway` … not remodelled in this case" | **scope_subset** — **not** `exact` |
| bi-04, bi-06 | wider gap (a 2-element `Q_s` no longer excludes `scope_overlap`) | AMBIGUOUS, up to 5-way |

**This is the same two-verdict split the contract's own `WS9` passage warns about for this exact utterance and this exact record** (*"bi-18 authored `[entrance, built_in_furniture]` puts '현관이랑 복도 수납' on §14.3.3 row 6, budget refused; authored `[entrance, hallway, built_in_furniture]` it lands on row 3, budget permitted"*) — but the mechanism is different from the one `WS9` names. `WS9`'s passage is about the **record's own authoring**: whether bi-18 itself was authored with or without a `hallway` id. That question is closed in this corpus — bi-18's `workScopeIds` is fixed at `[entrance, built_in_furniture]`, no `hallway`, per its fully-specified §2 block. `WS9`'s fix (joinery is not by itself a remodel of the space it stands in) closes exactly that axis of ambiguity, and closes it correctly: re-checking `WS9`'s own two row-citations against §14.3.3 confirms both are individually accurate (row 6 for `R_s={entrance}` against `Q_s={entrance,hallway}`; row 3 for `R_s={entrance,hallway}` against the same `Q`).

**But the same two-verdict split reappears anyway, through the query side instead of the record side, and nothing in the cited sections closes it.** `WS9` governs the *producer's* authoring judgement for exactly this phrase ("복도 붙박이장 is `built_in_furniture` and **not** `hallway`… without this sentence… one utterance gets two opposite budget verdicts"); it says nothing about the *consumer's* parse of the same phrase out of a visitor's mouth, and `WS6` explicitly leaves that parse to the consumer with no contract-level guidance. So the contract closes the ambiguity it names, on the one axis it names, and leaves a structurally identical ambiguity open on the other axis, for the identical utterance and the identical record, without noting that it has done so.

Separately, worth flagging under "the visitor would be told something the record does not support": under Reading A, bi-10 (85,000,000, a large whole-home remodel) and bi-12 (52,000,000, another whole-home remodel) both come out **`exact`** for a query about a small entrance/storage job, purely because `WS7b` keeps a `full_remodel`'s trade set open and both happen to include `built_in_furniture` among many unrelated trades. `EF6`'s class label does not distinguish "this record is centrally about what you asked" (bi-18) from "this record satisfies your ask as an incidental side effect of being a much larger job" (bi-10, bi-12) — both are `exact`, both are "direct answers" under `GR3`, with nothing in the cited rules to rank one ahead of the other or to say so.

---

## 3. Citation checks

- **`CINV-13`(c)** (*"창호 교체하려는데 34평 전체 리모델링 사례 있나요"*, no budget clause) — checked independently: bi-09 → `not_evaluable` (scope, `windows∉R_t`); bi-10 → `exact` (`windows∈R_t`, area strong, budget `not_applicable`). Matches the citation's claim exactly. **Accurate.**
- **`GR2`'s account of the rev-5 bug** (bi-15 classed `exact` for "전체 리모델링 사례 보여주세요"; a 50M full-remodel classed `exact` for "주방만 하고 싶어요") — checked against rev 6 in §2.1/§2.2 above: neither reproduces under the current row order. **Accurate description of a fixed bug.**
- **`WS9`'s bi-18 worked example** — both of its row citations (row 6, row 3) check out arithmetically against §14.3.3 (§2.8 above). Not inaccurate, but **incomplete**: it presents the ambiguity as resolved once the record's own authoring is pinned down, without flagging that an identical ambiguity re-enters through query-side parsing, which `WS9` does not and cannot govern (`WS9` binds "the author," explicitly "never the emitter," and has nothing to say about the consumer).
- **`CINV-15`** (*"a trade-only request (`Q_s=∅`, `Q_t≠∅`) is classified on `R_t` vs `Q_t`, and a partial whose `R_s≠∅` is `scope_superset`, not `exact`. Fixture: '2천만원으로 바닥이랑 도배만' is not budget-matched against bi-16"*) — **this citation's relation claim is wrong for its own named fixture.** §14.3.3.1's `scope_superset` row requires **both** `Q_t ⊆ R_t` **and** `R_s ≠ ∅` — not `R_s ≠ ∅` alone, which is all the prose states. bi-16's `workScopeIds = [kitchen, bathroom]` contains **no** Works id at all, so `R_t = ∅`; against `Q_t = {flooring, wallpaper}`, `Q_t ⊄ R_t`, which routes to row 3 (`scope_overlap`, needs `R_t ∩ Q_t ≠ ∅`) or row 4 (`scope_disjoint`, `R_t ∩ Q_t = ∅`) — and since `R_t = ∅`, the intersection is empty, landing on **row 4, `scope_disjoint`**, not row 2's `scope_superset`. The citation's bottom-line claim — "not budget-matched" — still holds either way (both row 2 and row 4 say "not permitted"), so this does not change any pass/fail behaviour anywhere checked in this report. But the specific relation label, and the disclosure text a consumer would show (row 2 has a stated disclosure — *"`R_s` spaces were remodelled too, and the total paid for that"* — row 4 in §14.3.3.1 has none), would be wrong if implemented as literally cited.

---

## 4. Summary of defect types found

| type | instances |
|---|---|
| ambiguity (two or more classes justified from the text) | bi-04/bi-06 in §2.4 (2-way), §2.6 (3-way), §2.7 (3-way), §2.8 (4–5-way); bi-01 in §2.6, §2.8 (2-way each); **bi-18 in §2.8** (2-way, on fully-authored data — the only ambiguity in this report not attributable to the corpus gap) |
| gap (no class justified at all) | bi-04/bi-06 in §2.2 |
| contract-level gap (rule silence, not corpus silence) | ordering when a direct answer coexists with labelled references (§1.2); visitor bare-pyeong basis (§1.3); `GR3` ladder-row selection when an utterance states both a breadth and a trade (§2.4); consumer-side parse of "복도 수납" (§2.8) |
| citation defect | `CINV-15`'s relation claim for bi-16 (§3) |
| a fallback that could read as an exact match without being centrally on-point | bi-10, bi-12 both `exact` for "현관이랑 복도 수납" under Reading A (§2.8) |

None of the 8 utterances was fixed here, per the task's instruction; this file is a report only.
