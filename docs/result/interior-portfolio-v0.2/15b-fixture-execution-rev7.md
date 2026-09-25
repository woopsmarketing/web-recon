# 15b — Independent fixture execution, contract rev 7 × demo data rev 6

| | |
|---|---|
| date | 2026-09-24 |
| method | hand computation from contract rev 7 prose (`07-integration-contract-v0.2-candidate.md`) and demo corpus rev 6 (`04-demo-data-spec.md`) plus the live `data/sites/boost-interior-demo/content/projects.json` for bi-01…bi-08's actually-authored fields. **Did not read or run `docs/result/interior-portfolio-v0.2/proof/ef6-totality.mjs`** — this is the second, independent source. |
| scope | §5 `PT1`–`PT6`, §7 `WS1`–`WS9`, §14.3.1 `VB1`–`VB3`, §14.3.2 `EF1`–`EF5`, §14.3.3/.3.1, §14.3.4, §14.3.5 `PB0`–`PB7`, §14.3.6 `GR2`/`EF6`, `GR3`/`GR3a` |
| verdict posture | not a correctness sign-off. Every finding below is either a clean derivation, a corpus gap, or a contract silence/ambiguity, each labelled as such. |

## Summary

- **Utterances that produce a clean, single-valued `EF6` class for all 19 records: 2 of 8** — #3 ("전체 리모델링 사례 보여주세요") and #4 ("1억 이내로 전체 리모델링 하고 싶어요"). Both happen to name no scope (`Q = ∅`), which is exactly what keeps them clean — every other utterance names a space or a trade, and that reintroduces the one standing corpus defect below.
- **Utterances that produce a fully determined display order for all 19 records: 0 of 8.** Every one of the eight is blocked, at minimum, by the same corpus gap (bi-04/bi-06's `workScopeIds` were never authored, so their §14.3.3 relation and/or `R_s` size — needed for `GR3a`'s rung placement or tie-break — cannot be computed). Utterance #3's top-3 *direct answers* are nonetheless fully determined (see below); it is only the tail of the ladder that is stuck.
- **One standing corpus defect, present in every utterance that names any scope:** `workScopeIds` for bi-01, bi-04, bi-06 and bi-07 is not authored anywhere in the corpus (`04-demo-data-spec.md` §0.2 says this explicitly — it is "an authoring pass outside this spec"), yet `07`'s own §13 and the demo spec's §4.1 table both compute expected search behaviour as if it already existed. This is a **corpus gap, not a contract defect** — the contract's evaluation function is well-defined given the data; the data is incomplete.
- **Two contract silences found in `VB3`**, both load-bearing for the two utterances the task flags in bold (#7, #8): `VB3` enumerates only three query shapes (single-space-with-만, trade-enumeration ± 만, bare space-enumeration) and says nothing about (a) a direct negation of the whole ("큰 공사는 아니고", "집 전체는 아니고") or (b) a **multi-space** enumeration **with** 만 attached ("주방이랑 욕실만"). Both readings materially change which records come back as `exact`. Detail in #7/#8 below.
- **One rung-table finding**, surfaced by utterance #2: the `GR3a` "partial work, spaces named" rung's own label — "full_remodel records, i.e. `fallback_from_full`" — does not hold whenever `V.breadth` is absent and only a space is named (`Q_s ≠ ∅`, no breadth word). In that shape, `PT4`(b)'s space-half auto-satisfaction plus `EF2`'s `not_applicable`-not-`unsatisfied` treatment of an unstated breadth send full-remodel records to `EF6`'s `exact`, not `fallback_from_full` — they are pulled out as direct answers and never reach that bucket at all. `GR3`'s mechanics do the right thing regardless; the rung table's own worked label is simply wrong for this (ordinary) shape.
- No case was found where the visitor would be told a fallback as an exact match, or told something the records do not support, **once the corpus gap above is set aside**. The corpus gap itself, however, means a real implementation reading these two documents today cannot honestly answer several of these utterances for bi-04/bi-06 at all.

---

## 0. Record facts used (source, not this checker's invention)

`property.type = apartment` for all of bi-01…bi-19 except bi-11 (villa). `projectType` for bi-01…bi-08 per contract §13 (not re-derived here). Prices/areas for bi-01…bi-08 from the live `projects.json` (only `pricePerArea`, authored, exists for them — no `pricing.total` was ever authored for any of the 8). `workScopeIds`/`pricing.total`/style for bi-09…bi-19 from `04-demo-data-spec.md` §2 rev 6.

| id | projectType | area | total | perArea (authored) | workScopeIds | publishedAt |
|---|---|---|---|---|---|---|
| bi-01 | full_remodel | 34py supply | — | 2,900,000 | **not authored** | 2026-08-28 |
| bi-02 | absent | 24py supply | — | 2,400,000 | — | 2026-07-30 |
| bi-03 | absent | 42py supply | — | 3,200,000 | — | 2026-06-25 |
| bi-04 | partial_remodel | 32py supply | — | — | **not authored** | 2026-05-21 |
| bi-05 | absent | 29py supply | — | 2,600,000 | — | 2026-04-16 |
| bi-06 | partial_remodel | 34py supply | — | — | **not authored** | 2026-03-19 |
| bi-07 | full_remodel | 19py supply | — | 2,700,000 | **not authored** | 2026-02-12 |
| bi-08 | absent | 51py supply | — | 1,600,000 | — | 2026-01-08 |
| bi-09 | full_remodel | 34py supply | 50,000,000 | (derived 1,470,588) | entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture | 2025-12-11 |
| bi-10 | full_remodel | 34py supply | 85,000,000 | (derived 2,500,000) | entrance, living_room, kitchen, bedroom, dressing_room, bathroom, windows, expansion, built_in_furniture | 2025-11-20 |
| bi-11 | full_remodel | 20py supply (villa) | 30,000,000 | (derived 1,500,000) | kitchen, bathroom, flooring, wallpaper, doors | 2025-10-23 |
| bi-12 | full_remodel | 26py supply | 52,000,000 | (derived 2,000,000) | entrance, kitchen, bathroom, flooring, lighting, built_in_furniture | 2025-09-25 |
| bi-13 | full_remodel | 48py supply | range 125,000,000–140,000,000 | — | entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom, windows, lighting, built_in_furniture | 2025-08-28 |
| bi-14 | partial_remodel | 84 m2 **exclusive** | 15,000,000 | — | kitchen | 2025-07-31 |
| bi-15 | partial_remodel | absent | 7,000,000 | — | bathroom | 2025-07-03 |
| bi-16 | partial_remodel | 38py supply | 19,800,000 | — | kitchen, bathroom | 2025-06-05 |
| bi-17 | partial_remodel | 112 m2 supply | 12,500,000 | — | living_room, flooring | 2025-05-08 |
| bi-18 | partial_remodel | 30py supply | 6,200,000 | — | entrance, built_in_furniture | 2025-04-10 |
| bi-19 | **absent** (PT6) | 32py supply | 11,000,000 | — (D-1 cond.1 fails) | flooring, wallpaper, lighting | 2025-03-13 |

**Corpus gap G1 (flagged once, applies wherever cited below):** bi-01, bi-04, bi-06, bi-07 have no authored `workScopeIds`. Any utterance that names a space or trade (`Q ≠ ∅`) cannot compute `R_s`/`R_t` for these four, and therefore cannot compute a determinate §14.3.3 relation (bi-04, bi-06) or a determinate `EF3` trade-half state (bi-01, bi-07) for them. This is a **corpus** defect (the authoring pass §0.2 defers), not a contract defect — the function is total given complete data.

---

## 1. "창호 교체하려는데 34평 전체 리모델링 사례 있나요, 예산 5천"

`V.breadth = whole`; `Q_s = ∅, Q_t = {windows}`; `V.area = 34py` (basis as the visitor stated it — **see Finding F1** below); `V.budget = exact 50,000,000`.

**`GR3a` conflict, and its resolution.** This is literally the contract's own worked example of two rows firing at once (row 1 `V.breadth == whole` vs row 3 `Q_s = ∅ ∧ Q_t ≠ ∅`). Row 1 is written first, so *first match wins* gives the **whole-home work** rung, not trade-only. That is the defensible reading: the utterance's main clause is the breadth request ("34평 전체 리모델링 사례"), and "창호 교체하려는데" reads as a qualifier on top of it, not a second independent ask. `GR3a` resolves the conflict as designed.

A sharper, correctly-derived consequence of that resolution: because `EF3`'s full-remodel trade half treats an absent id as *unknown, never excluded* (`WS7b`), **bi-09 — the record whose body explicitly says 창호는 교체하지 않았고 — does not become `exact`.** Its windows status is unauthored in `workScopeIds` (not "known absent"), so the trade half is `not_evaluable`, and `EF6` row 7 fires: bi-09 is classed `not_evaluable`, not `exact`, even though its area and budget match perfectly. This is the exact regression the contract's own rev-5→rev-6 changelog describes averting (§ rev-6 note under `EF3`).

| id | breadth | scope (Q_t={windows}) | area Δ | budget Δ | class |
|---|---|---|---|---|---|
| bi-01 | satisfied | **gap G1** | 0/34=0 → strong, satisfied | no `total` → n/a | `not_evaluable` (row 7 fires regardless of G1, because budget alone is not_evaluable — see below) |
| bi-07 | satisfied | **gap G1** | −15/34=−0.441 → fallback, unsatisfied | n/a (never reached) | `area_fallback` (row 6 fires before G1 can matter) |
| bi-09 | satisfied | not_evaluable (windows∉R_t) | 0 → satisfied | (50M−50M)/50M=0 → satisfied | `not_evaluable` (row 7, scope) |
| bi-10 | satisfied | satisfied (windows∈R_t) | 0 → satisfied | (85M−50M)/50M=0.70 → unsatisfied | `price_fallback` (row 5) |
| bi-11 | satisfied | not_evaluable | −14/34=−0.412 → fallback | n/a | `area_fallback` |
| bi-12 | satisfied | not_evaluable | −8/34=−0.235 → fallback | n/a | `area_fallback` |
| bi-13 | satisfied | satisfied (windows∈R_t) | 14/34=0.412 → fallback | n/a | `area_fallback` |
| bi-02/03/05/08/19 | not_evaluable | not_evaluable | n/a | n/a | `unknown_type_fallback` (row 4, all 5) |
| bi-04, bi-06 | unsatisfied | **row 1 fires — class ∈ {scope_superset, scope_overlap, scope_disjoint}, gap G1, indeterminate** | — | not permitted | **INDETERMINATE (gap)** |
| bi-14/15/16 | unsatisfied | `Q_t∩R_t=∅` → `scope_disjoint` | — | not permitted | `scope_disjoint` |
| bi-17 | unsatisfied | `R_t={flooring}`, disjoint from `{windows}` | — | not permitted | `scope_disjoint` |
| bi-18 | unsatisfied | disjoint | — | not permitted | `scope_disjoint` |

**Result: zero `exact` records.** `EF6` classes are otherwise determinate for 17/19 records (bi-01 and bi-07's *class* is safe — see note — only bi-04/bi-06 are truly stuck).

Note on bi-01: its class is `not_evaluable` **regardless** of the G1 gap, because it has no `pricing.total` at all, so `EF5` is `not_evaluable` on that ground alone (row 7 fires either way). Only the *reported list of not-evaluable criteria* (scope, or scope+budget) is left undetermined by G1 — the class itself is safe.

**Order.** `GR3a` selects the whole-home rung: `full_remodel records → breadth_fallback partials, larger R_s first → breadth-absent records`. No record is `exact`, so per `GR3` "when there are no direct answers the ladder is the whole result." Within the full-remodel bucket, `PB6a` step 1 (class order as `EF6` writes rows) then step 2 (`|delta_area|`) then step 3 (stated-scope count) then step 4 (publishedAt desc) gives, fully determined: **bi-10, bi-12, bi-13, bi-11, bi-07, bi-01, bi-09** (bi-11/bi-13 tie on `|delta_area|`=14/34 exactly; bi-13 wins on step 3 — it carries `windows`, bi-11 doesn't; bi-01/bi-09 tie at 0 both ways and resolve on step 4, `publishedAt`, *regardless* of G1's effect on step 3 — worked both ways, same answer). The middle bucket ("breadth_fallback partials, larger `R_s` first") is **empty of any record actually classed `breadth_fallback`** here — every partial's scope was `unsatisfied` (row 1 fired for all seven), so they are `scope_*`-classed labelled references, not `breadth_fallback` ones. **Finding F2 (rung silence):** the whole-home rung's bucket list names only three buckets and has no stated home for a `scope_superset`/`scope_overlap`/`scope_disjoint`-classed partial record reached under a whole-home framing — bi-14…bi-18 (and bi-04/bi-06) have no textually-assigned position in this rung. The breadth-absent bucket is fully determined: bi-19, bi-05, bi-03, bi-02, bi-08 (`|delta_area|` ascending, all distinct). **Order is not fully determined** (F2, plus G1 for bi-04/bi-06's bucket and exact class).

**Finding F1 (contract silence on bare-area basis).** The demo spec's own worked notes (`bi-14`, `bi-17`) assume a "defaultAreaBasis" that renders a bare "34평" as `supply`. Nowhere in `07`'s §6/§14.3.1/`AR5`/`PY1` is a rule stated for what basis a visitor utterance with no 전용/공급 qualifier carries. `AR5`'s own text ("one unknown basis lowers confidence") suggests the consumer should *not* default it to `supply` at all, but instead treat it as genuinely unknown and still compare (with a confidence disclosure) — which for this utterance happens to produce the same numeric outcomes computed above (no record's classification changes), but is a real, unaddressed gap that would matter for any query compared against an `exclusive`-basis record (bi-14) or one needing `AR4` unit conversion (bi-17). Not exercised further here since neither bi-14 nor bi-17 reach the area/budget stage in this utterance (both are pre-empted by row 1's scope mismatch).

---

## 2. "현관이랑 복도 수납"

This is the contract's own worked `WS6` example. Two readings of "복도": (A) 복도 names nothing (only entrance is a stated space) → `Q_s={entrance}`, `bi-18`'s `R_s={entrance}` → §14.3.3 **row 3**, `scope_exact`, budget **permitted**; (B) 복도 names the `hallway` space → `Q_s={entrance,hallway}`, `R_s⊊Q_s` → **row 6**, `scope_subset`, budget **refused**.

`WS6`'s new clause ("resolve conservatively... the reading that does not permit a price comparison") closes this: the consumer must take reading **B**. `bi-18`'s `EF6` class is therefore `scope_subset` (row 1 fires), never `exact`, and this holds independent of whether a budget was even stated (the ambiguity is a *class* question, not only a disclosure question).

**What the visitor is actually told, for bi-18:** it is a labelled reference, not a direct answer; per row 6's disclosure the spaces in `Q_s \ R_s = {hallway}` are reported as **not remodelled in this case** — never "no work reached the hallway" (`bi-18` did install hallway joinery; `WS7a`/`CINV-17` forbid the stronger, false claim). `WS6` additionally requires the reply to **say which reading it took** ("복도를 별도 공간으로 해석했습니다" or equivalent) — this is a disclosure obligation the contract adds and that a naive implementation could easily skip.

**No stated budget in this utterance**, so `V.budget` is absent and `EF5 = not_applicable` for every record — the row-3-vs-row-6 fork changes the **class**, not a budget verdict, here.

Full pass (`Q_s = {entrance, hallway}`, `Q_t = ∅`, breadth/area/budget all absent):

| bucket | class | records |
|---|---|---|
| full_remodel | `exact` (all 7 — `Q_t = ∅` makes the trade half trivially true, so **G1 does not bite bi-01/bi-07 here**; spaces half is auto-satisfied by `PT4`(b) for any `Q_s`) | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 |
| partial, row 6 (`R_s ⊊ Q_s`) | `scope_subset` | bi-18 |
| partial, row 8 (disjoint) | `scope_disjoint` | bi-14, bi-15, bi-16, bi-17 |
| partial, unauthored | **indeterminate (G1)** | bi-04, bi-06 |
| absent-type | `not_evaluable` | bi-02, bi-03, bi-05, bi-08, bi-19 |

Because `hallway` is used by **no record in the 19** (`04` §3 says so explicitly), no full-remodel record satisfies `Q_s ⊆ R_s`, so every one of the 7 `exact` full-remodel records must use `EF3`'s ground-not-conclusion wording — *"집 전체를 리모델링한 사례입니다"* — and never claim 현관/복도 specifically (`CINV-23`).

**Finding F3 (rung-label mismatch).** `Q_s ≠ ∅` fires `GR3a` row 2, the "partial work, spaces named" rung, whose own bucket list says `full_remodel records, i.e. fallback_from_full`. But here all 7 full-remodel records are `exact` (pulled to the front as direct answers per `GR3`), **not** `fallback_from_full` — that bucket is empty of full-remodel records for this query. The mechanism (`GR3`'s exact/labelled-reference split) still works; the rung table's own worked label for that bucket does not hold whenever `V.breadth` is absent and only a space is named — which is an entirely ordinary utterance shape, not an edge case. This generalizes beyond this one utterance to any "space named, no breadth word" query.

**Order:** direct answers (7 exact) ordered by `PB6a`: class tied, `|delta_area|` n/a (no area stated), stated-scope count (`Q={entrance,hallway}`) — none of bi-09…13 carry `hallway`; do any carry `entrance`? bi-09✓, bi-10✓, bi-12✓, bi-11✗, bi-13✓ → count 1 for bi-09/10/12/13, count 0 for bi-11; bi-01/bi-07 unknown (G1). Among count-1: publishedAt desc → bi-09, bi-10, bi-12, bi-13 wait — publishedAt desc gives bi-09(12-11) > bi-10(11-20) > bi-12(09-25) > bi-13(08-28); bi-11 (count 0) sits after them. bi-01/bi-07's count is unresolved (G1) so their position relative to this group is **not determined**. Labelled references: scope_subset (bi-18) before scope_disjoint (bi-14,15,16,17, ordered by publishedAt desc: bi-14,15,17,18→ bi-14,15,17 since 18 already placed) before not_evaluable (bi-02,03,05,08,19, publishedAt desc). bi-04/bi-06's bucket is undetermined (G1). **Order not fully determined.**

---

## 3. "전체 리모델링 사례 보여주세요"

`V.breadth = whole`; `Q = ∅`; no area, no budget. Because `Q = ∅`, `EF3 = not_applicable` for **every** record regardless of `workScopeIds` — **G1 does not affect classification here.** This is the cleanest utterance in the set.

| class | records | count |
|---|---|---|
| `exact` | bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 | 7 |
| `breadth_fallback` | bi-04, bi-06, bi-14, bi-15, bi-16, bi-17, bi-18 | 7 |
| `unknown_type_fallback` | bi-02, bi-03, bi-05, bi-08, bi-19 | 5 |

**19/19 determinate — matches the contract's own claim of "seven `exact` records."**

**Order.** Direct answers (7 exact) ordered by `PB6a`: class tied, area/scope-count n/a (nothing stated) → `publishedAt` descending, no ties: **bi-01 (2026-08-28), bi-07 (2026-02-12), bi-09 (2025-12-11), bi-10 (2025-11-20), bi-11 (2025-10-23), bi-12 (2025-09-25), bi-13 (2025-08-28)**. This portion is **fully determined**, matching the contract's own "ordered by those two [keys] alone" claim. **With a result limit of 3, the three shown are bi-01, bi-07, bi-09.**

Labelled references, whole-home rung (`full_remodel → breadth_fallback partials, larger R_s first → breadth-absent`): the middle bucket this time genuinely is `breadth_fallback` (all 7 partials, since `Q=∅` routes them to row 1 of §14.3.3, "budget permitted, `PB0a` required," and breadth alone determines the class here — no `scope_*` class is reachable when `Q=∅`). "Larger `R_s` first": bi-16 (`|R_s|=2`) first; then bi-14, bi-15, bi-17, bi-18 (`|R_s|=1` each, tied — publishedAt desc: bi-14, bi-15, bi-17, bi-18); **bi-04 and bi-06's `|R_s|` is G1-indeterminate**, so their position relative to bi-16 and the size-1 group cannot be fixed. Breadth-absent bucket, fully determined by `|delta_area|`... wait, no area was stated either, so this falls straight to `publishedAt` desc: bi-02, bi-03, bi-05, bi-08, bi-19.

**Order not fully determined** (G1 only — the direct-answer portion and the top-3 are clean).

---

## 4. "1억 이내로 전체 리모델링 하고 싶어요" — `PB6a`'s tie case

`V.breadth = whole`; `Q = ∅` (again — G1 does not bite); `V.budget = max 100,000,000`.

`PB1`'s blanket condition ("breadth criterion is not unsatisfied") plus its full-remodel bullet ("`EF4` satisfied or not_applicable" — satisfied trivially since no area was stated) permits budget comparison for every full-remodel record with a usable total.

| id | total | vs max 100,000,000 | Δ | state |
|---|---|---|---|---|
| bi-09 | 50,000,000 | ≤ m | 0 | satisfied |
| bi-10 | 85,000,000 | ≤ m | 0 | satisfied |
| bi-11 | 30,000,000 | ≤ m | 0 | satisfied |
| bi-12 | 52,000,000 | ≤ m | 0 | satisfied |
| bi-13 | range [125M,140M] | `lo=125M > m` | (125M−100M)/100M = **0.25** | unsatisfied |
| bi-01, bi-07 | none | — | — | not_evaluable (no total) |

Partial records: blanket condition fails (breadth is `unsatisfied` for them, since `V.breadth=whole`) → budget never reached → `breadth_fallback` for all 7 regardless of price. Absent-type: `unknown_type_fallback` for all 5 (`PB5`).

**19/19 determinate.** Classes: `exact` = {bi-09, bi-10, bi-11, bi-12}; `price_fallback` = {bi-13}; `not_evaluable` = {bi-01, bi-07}; `breadth_fallback` = {bi-04, bi-06, bi-14…18}; `unknown_type_fallback` = {bi-02, bi-03, bi-05, bi-08, bi-19}. This reproduces the contract's own stated fixture ("four `exact` records... nothing to choose among them").

**The tie case, resolved.** `PB6` gives `delta = 0` for **four** records → `PB6a` fires: class tied (all `exact`) → `|delta_area|` n/a (no area stated, so this key contributes nothing and does not push anyone to the end, per `PB4`) → stated-scope count n/a (`Q = ∅`) → `publishedAt` descending, **no ties**: **bi-09 (12-11) → bi-10 (11-20) → bi-11 (10-23) → bi-12 (09-25).** Fully determined, exactly as `CINV-21` claims.

**Order beyond the top 4 is not fully determined**, for the same reason as #3: `breadth_fallback` bucket's "larger `R_s` first" needs bi-04/bi-06's `R_s` (G1). Everything else (remaining full-remodel bi-13/bi-01/bi-07, and the breadth-absent bucket) is fully determined by the same `publishedAt`-descending logic used above.

---

## 5. `CINV-15`'s rebuilt fixtures

**"바닥만" against bi-17:** `Q_t = {flooring}`, `Q_s = ∅` → §14.3.3 row 2 → §14.3.3.1. `bi-17`'s `R_t = {flooring}`, `R_s = {living_room} ≠ ∅`. `Q_t ⊆ R_t` (true) and `R_s ≠ ∅` → **`scope_superset`**, budget refused ("the total also bought the living room"). **This matches `CINV-15`(a) exactly as rev 7 states it.** No defect.

**"2천만원으로 바닥이랑 도배만" against bi-16:** `Q_t = {flooring, wallpaper}`, `Q_s = ∅`. `bi-16`'s `workScopeIds = [kitchen, bathroom]`, both Spaces ids, so `R_t = ∅`. `Q_t ⊆ R_t`? No. `R_t ∩ Q_t = ∅`? Yes → **`scope_disjoint`**, budget refused. **This matches `CINV-15`(b) exactly.** (Rev 6's version of `CINV-15` mis-cited this as `scope_superset`; rev 7's text explicitly records and corrects that in its own changelog — confirmed correct now, not a live defect.)

**bi-19** is reached only via `GR3`'s trade rung (`R_t = {flooring, wallpaper, lighting} ⊇ Q_t`), with 11,000,000 stated as a bare fact (`GR1`) and explicitly not a budget match (`PB5`, since `projectType` is absent) — confirmed, matches `CINV-15`(c).

**Full sweep, "바닥만" (`Q_t={flooring}` only, no budget stated, no breadth stated):**

| id | relation | class |
|---|---|---|
| bi-09 | trade half satisfied (`flooring∈R_t`) | `exact` |
| bi-11 | trade half satisfied | `exact` |
| bi-12 | trade half satisfied | `exact` |
| bi-10 | trade half not_evaluable (`flooring∉R_t`) | `not_evaluable` |
| bi-13 | trade half not_evaluable | `not_evaluable` |
| bi-01, bi-07 | **G1 — indeterminate between `exact` and `not_evaluable`** | **gap** |
| bi-17 | `scope_superset` | `scope_superset` |
| bi-14, bi-15, bi-16, bi-18 | `R_t=∅` or disjoint | `scope_disjoint` |
| bi-04, bi-06 | **G1 — but narrowed to a 2-way gap** (singleton `Q_t` means only `scope_superset` or `scope_disjoint` are reachable, `scope_overlap` is impossible with one id) | **gap** |
| bi-02, bi-03, bi-05, bi-08, bi-19 | breadth-absent branch | `not_evaluable` |

**Not clean** (G1, on bi-01/bi-07/bi-04/bi-06). GR3a selects the trade-only rung (`Q_s=∅, Q_t≠∅`, `V.breadth` absent): partials by §14.3.3.1 row order → breadth-absent records whose `R_t ⊇ Q_t` → full-remodel records. `bi-19` alone is confirmed to sit in the middle bucket (its `R_t ⊇ {flooring}`); **bi-02/bi-03/bi-05/bi-08 have no authored `workScopeIds` at all, so whether they even qualify for that bucket is undecidable, and — Finding F4 — the trade-only rung's bucket list has no stated fallback position for a breadth-absent record that does *not* demonstrate `R_t ⊇ Q_t`.** Order not fully determined.

**Full sweep, "2천만원으로 바닥이랑 도배만" (`Q_t={flooring,wallpaper}`, `V.budget=exact 20,000,000`):** every full-remodel record with a total (bi-09,10,11,12,13) prices out over 20,000,000 by a wide margin (deltas 1.5, 3.25, 0.5, 1.6, 5.25 respectively) → all `price_fallback`, regardless of whether their trade half is satisfied — even bi-09/bi-11, whose ids *do* cover both flooring and wallpaper, are correctly refused because their **total** buys the whole dwelling, not just those trades. bi-01/bi-07 → `not_evaluable` (no total, class safe despite G1). bi-16 → `scope_disjoint` (confirmed). bi-17 → `scope_overlap` (has flooring, not wallpaper). bi-14/15/18 → `scope_disjoint`. bi-04/bi-06 → G1 gap (now a genuine 3-way gap, `Q_t` has two ids so overlap is reachable). Absent-type → `not_evaluable`. **Not clean; order not fully determined** (same F4 gap, plus the price_fallback sub-ordering by stated-scope count, which is fully determined among the known five: bi-09, bi-11 (count 2, tie broken by publishedAt) → bi-12 (count 1) → bi-10, bi-13 (count 0, tie broken by publishedAt): **bi-09, bi-11, bi-12, bi-10, bi-13**).

---

## 6. "욕실만 700만원"

`VB3`'s own listed example — "욕실만" is a single-space restriction with 만, so `VB3` sets **`V.breadth = partial`** unambiguously here; no gap. `Q_s = {bathroom}`, `Q_t = ∅`; `V.budget = exact 7,000,000`.

Because `V.breadth = partial`, every full-remodel record's breadth criterion is `unsatisfied`, and `PB1`'s **blanket** gate ("compare... when the record's breadth criterion is not unsatisfied") categorically blocks budget comparison for **all seven** full-remodel records — bi-09's 50,000,000 whole-home total is never compared against the 700만원 budget. **`OD-O` is respected, and the contract's own commentary cites exactly this scenario** ("one of them compares `bi-09`'s 50,000,000 whole-home total against a bathroom budget, which `OD-O` forbids" — §14.3.1 `VB3` note). This citation is accurate; not a defect.

`Q_t = ∅` makes the full-remodel trade half trivially satisfied, so **G1 does not block bi-01/bi-07's `EF6` class here** — both land `fallback_from_full` cleanly (breadth unsatisfied + full_remodel = row 2).

| id | scope relation | class |
|---|---|---|
| bi-15 | `R_s == {bathroom}` → **row 3, `scope_exact`**; Δ=(7M−7M)/7M=0 | **`exact`** |
| bi-16 | `R_s={kitchen,bathroom} ⊋ {bathroom}` → row 5 | `scope_superset` |
| bi-14, bi-17, bi-18 | disjoint | `scope_disjoint` |
| bi-04, bi-06 | **G1 — gap** (bi-04's body suggests kitchen+bathroom, plausibly superset; bi-06's body suggests entrance/living-room, plausibly disjoint — neither is authored) | **gap** |
| bi-01, bi-07, bi-09, bi-10, bi-11, bi-12, bi-13 | breadth unsatisfied | `fallback_from_full` (7) |
| bi-02, bi-03, bi-05, bi-08, bi-19 | breadth not_evaluable | `unknown_type_fallback` (5) |

**17/19 determinate; not clean** (bi-04/bi-06). Single, sensible `exact` match: bi-15.

**Order.** `GR3a` row 2 ("partial work, spaces named") — direct answer bi-15 alone, first. Labelled references: `scope_exact`(already pulled) → `scope_superset` (bi-16) → `scope_overlap` (none) → `scope_subset` (none among known records; bi-04/bi-06 could land here — gap) → `fallback_from_full` (the 7 full-remodel records, ordered by `PB6a`: class tied, area n/a, stated-scope count = 1 for every one of bi-09…13 (all five carry `bathroom`!) tied, resolved by publishedAt desc: bi-09,10,11,12,13 — **but bi-01/bi-07's count of `{bathroom}` is G1-unknown, so their position among/around this group of five is undetermined**) → `unknown_type_fallback` (bi-02,03,05,08,19, publishedAt desc, none plausibly carry `bathroom` so no reordering) → `scope_disjoint` (bi-14, bi-17, bi-18, publishedAt desc). **Order not fully determined** (G1, twice over — bi-04/bi-06's bucket, and bi-01/bi-07's tie-break).

---

## 7. "큰 공사는 아니고 몇 군데만 손보려고요" — what does `VB3` say `V.breadth` is?

**The contract does not say.** `VB3` enumerates exactly three query shapes: (i) a single named space with 만 attached (주방만, 욕실만, or the generic 부분만/일부만) → sets `partial`; (ii) a named trade with 만 (바닥이랑 도배만) → does not set it; (iii) a bare enumeration of spaces, 만 or not attached to a trade → leaves it unknown. This utterance names **no space and no trade at all** — "몇 군데" (a few spots) is a vague quantifier, not a §7.3 id of any kind, and "큰 공사는 아니고" (not a big project) is a direct qualitative claim about scale that resembles 부분만/일부만 in spirit but is not that phrase and is not listed. `VB3`'s rule is written as a closed enumeration keyed to *what the visitor named*; it has no branch for a visitor who names nothing and instead describes scale in free prose. Nothing else in §14.3.1 fills the gap.

**This is consequential, not academic.** The two defensible readings produce dramatically different results:

- **Reading A — analogized to 부분만/일부만, `V.breadth = partial`:** `Q=∅` still, so scope is `not_applicable` for everyone; full-remodel records get `fallback_from_full` (7 records); **all seven partial-remodel records become `exact`** (breadth satisfied, nothing else stated); absent-type get `unknown_type_fallback` (5).
- **Reading B — literal, `V.breadth` stays absent because the phrase is not in `VB3`'s list:** `EF2` is `not_applicable` for every record (nothing was stated to fail against) → **all 19 records become `exact`**, including bi-13's 140,000,000 range and bi-10's 85,000,000 whole-flat gut renovation, for a visitor who explicitly said "it's not a big job."

Reading B is self-evidently the wrong answer for a real visitor, but it is the reading `VB3`'s literal text does not rule out — nothing in `EF1`–`EF6` treats "no criterion was extractable from this sentence" as different from "the visitor asked about nothing in particular." **Flag: gap, not a defect of arithmetic — a genuine absence of a rule**, and the two readings diverge on whether the entire corpus, or only its seven genuine partials, gets called `exact`. No class or order can be reported as "the" answer for this utterance without the checker supplying a rule the contract does not state.

---

## 8. "집 전체는 아니고 주방이랑 욕실 정도만"

Two separate `VB3` silences compound here.

**(a) Does "집 전체는 아니고" (an explicit negation of the whole) set `V.breadth = partial`?** `VB3`'s list names 부분만/일부만 as generic (space-unnamed) partial triggers but does not name a direct negation of 전체. By strong structural analogy — "not the whole house" says exactly what "부분만" says, just from the other direction — a reasonable implementer would treat it the same way, but **this is an inference beyond `VB3`'s literal enumerated text, not a rule the contract states.**

**(b) Does "주방이랑 욕실 정도만" (a multi-space enumeration *with* 만 attached) count as a "restriction by space" (→ `partial`) or an "enumeration" (→ unknown)?** Re-reading `VB3` character by character: the "restriction by space" examples (주방만, 욕실만) are all **single**-space. The "enumeration... leaves breadth unknown" clause explicitly qualifies its 만-tolerance as "with or without 만 attached **to a trade**" — that qualifier is textually scoped to trade-enumerations only. A **space**-enumeration with 만 attached is covered by neither example as written. **This is a genuine textual gap**, not a stretch: `VB3` says what happens to a single space + 만, and to a trade-list ± 만, and to a bare space-list, but never to a space-list + 만.

Because both (a) and (b) point toward `partial` on the more natural reading, and (a) is the stronger signal of the two (an explicit "not the whole house" is about as unambiguous an extent-statement as language gets), the likely-intended reading is `V.breadth = partial`, `Q_s = {kitchen, bathroom}`. Under that reading:

| id | relation | class |
|---|---|---|
| bi-16 | `R_s == {kitchen,bathroom}` → row 3 | **`exact`** |
| bi-14 | `R_s={kitchen} ⊊ Q_s` → row 6 | `scope_subset` |
| bi-15 | `R_s={bathroom} ⊊ Q_s` → row 6 | `scope_subset` |
| bi-17, bi-18 | disjoint | `scope_disjoint` |
| bi-04, bi-06 | **G1 gap** (bi-04 plausibly `scope_exact` by body content, but unauthored) | **gap** |
| full-remodel ×7 | breadth unsatisfied | `fallback_from_full` |
| absent-type ×5 | breadth not_evaluable | `unknown_type_fallback` |

This exactly matches the corpus's own declared intent for bi-16 ("the target fixture for... '주방이랑 욕실만 2천만원'" — §4.1). **But under the literal-absent reading (rejecting analogy (a)),** `EF2` is `not_applicable` everywhere, and `EF3`'s full-remodel spaces-half auto-satisfaction (`PT4`(b)) makes **every one of the seven full-remodel records `exact` too**, alongside bi-16 — an eight-way `exact` tie including whole-flat 50–140M jobs for a visitor who explicitly excluded 전체. Same failure mode as #7, on a narrower trigger.

**Flag: two compounding gaps in `VB3`, both consequential; the contract does not fully determine `V.breadth`, hence not the class, for this utterance either.**

---

## Consolidated flags

**Corpus gaps (not contract defects):**
- **G1** — `workScopeIds` unauthored for bi-01, bi-04, bi-06, bi-07. Breaks classification and/or ordering for every utterance that names any space or trade (#1, #2, #5a, #5b, #6, #8) and breaks ordering alone for the two clean utterances (#3, #4).

**Contract silences/ambiguities (defects of the text):**
- **F1** — no stated rule for the basis of a bare visitor area figure ("34평" with no 전용/공급). `AR5`/`PY1` presuppose the visitor's basis is a known input; §14.3.1's `V.area` shape does not say how the consumer derives it from an utterance that doesn't state one. Did not change any outcome computed here, but is unaddressed in the normative text.
- **F2** — the `GR3a` "whole-home work" rung's bucket list (`full_remodel → breadth_fallback partials, larger R_s first → breadth-absent`) has no stated position for a `scope_superset`/`scope_overlap`/`scope_disjoint`-classed partial record reached under whole-home framing with a scope also named (utterance #1's exact shape).
- **F3 / rung-label finding** — the "partial work, spaces named" rung's bucket labelled "full_remodel records, i.e. `fallback_from_full`" is empty whenever `V.breadth` is unstated and only a space is named, because those records resolve to `EF6`'s `exact` instead (`PT4`(b) auto-satisfies the spaces half, and an unstated breadth is `not_applicable`, never `unsatisfied`). `GR3`'s exact/labelled-reference split still functions correctly; the rung table's own worked description of that bucket does not hold for this ordinary case (utterance #2).
- **F4** — the trade-only rung's bucket list (`partials by §14.3.3.1 row order → breadth-absent records whose R_t ⊇ Q_t → full_remodel records`) has no stated position for a breadth-absent record that does *not* demonstrate `R_t ⊇ Q_t` (or whose `R_t` is simply unauthored, as with bi-02/03/05/08) (utterance #5a).
- **F5 (utterances #7, #8)** — `VB3` is a closed enumeration of three query shapes (single space + 만, trade ± 만, bare space-list) and has no branch for (i) qualitative/free-prose breadth statements that name no space or trade at all ("큰 공사는 아니고"), or (ii) a negation of the whole ("집 전체는 아니고"), or (iii) a multi-space enumeration with 만 attached ("주방이랑 욕실만"). All three are ordinary, expected visitor phrasings (the second is arguably *more* explicit than the listed 부분만/일부만), and the two readings each produces diverge by as much as "1 exact record" vs "all 19 records exact."

**No instance found** (within the scope checked) of a rule citation pointing at a row number that says something other than what the citing text claims, once rev 7's own correction of `CINV-15` is taken as current (it is — see §5).

**No instance found** of a fallback being presented to the visitor as an exact match, or a claim unsupported by the records, in any classification that was actually computable — the several near-misses (bi-09 failing "exact" on a 창호 query despite matching price and area; bi-16 correctly beating bi-04 to being the "주방+욕실" fixture) are the contract working as designed, not violations.
