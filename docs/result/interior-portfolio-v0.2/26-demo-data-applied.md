# 26 — Demo data applied: `projects.json` from 8 to 19 records with the V0.2 authored fields

| | |
|---|---|
| date | 2026-09-24 |
| status | APPLIED. One data file changed: `data/sites/boost-interior-demo/content/projects.json`. No code, no test, no schema, no contract, no sibling spec was edited, and no git command that mutates state was run. |
| sources applied | `04-demo-data-spec.md` **§2** (the eleven records `bi-09` … `bi-19`, rev 7 record data), **§5** (cover asset map), **§0.2** (`propertyType: "apartment"` for the existing eight); `18-existing-eight-workscopes.md` **§1** + **§2–§6** (`projectType` / `workScopeIds` for `bi-01` … `bi-08`) |
| deliberately not transcribed | `18` §7 (known-defective expectations section — its `EF3`/`EF6` conflation and its `bi-03` class claim appear nowhere in this file or in the data) |
| verification | all 19 parsed directly through `platform/content/schema.ts` `ProjectSchema` + `ProjectsDocSchema`; `npm run test:integration`; `npm run typecheck:platform`; a pure emission + validation spot check |

---

## 1. What was applied

### 1.1 The eleven new records (`04` §2)

`bi-09` … `bi-19` transcribed verbatim from `04` §2 — titles, slugs, summaries, bodies, Korean
`scope` strings, locations, areas, `builtYear`, `period`, `durationWeeks`, `keywords`,
`customerQuote` and the V0.2 facts (`projectType`, `propertyType`, `workScopeIds`, `totalPrice`,
`styles`). Per `04` §2's conventions: no `pricePerArea` and no `galleryGroups` on any of the
eleven; covers are the reused registered asset ids from `04` §5.

`04`'s provisional field name `style` is applied as the schema's **`styles`** (plural, authored),
as `18` §0.1 records. `styles` is the authored input to the emitted `facets.style`; the two are not
the same field.

Field-level check against `04` §1's design-summary table: the eleven `workScopeIds` sets, the eleven
totals and the five/three/three `category` split all reproduce §1 exactly.

### 1.2 The V0.2 fields on the existing eight (`18` §1, justified per record in `18` §2)

| id | `projectType` | `propertyType` | `workScopeIds` |
|---|---|---|---|
| bi-01 | `full_remodel` | apartment | entrance, kitchen, bathroom, flooring, lighting, built_in_furniture |
| bi-02 | *(absent)* | apartment | kitchen, flooring, built_in_furniture |
| bi-03 | *(absent)* | apartment | entrance, lighting, built_in_furniture |
| bi-04 | `partial_remodel` | apartment | kitchen, bathroom |
| bi-05 | *(absent)* | apartment | flooring, painting, built_in_furniture |
| bi-06 | `partial_remodel` | apartment | entrance, living_room, lighting |
| bi-07 | `full_remodel` | apartment | kitchen, flooring, doors, built_in_furniture |
| bi-08 | *(absent)* | apartment | living_room, lighting |

`projectType` counts over all 19: **full 7 · partial 7 · absent 5** — the eight contribute
full 2 · partial 2 · absent 4, exactly contract §13's table, and nothing was derived from
`category` (three `category: full-remodel` records are breadth-absent, `18` §4).

Distinct `workScopeIds` over all 19: **17 used · 9 unused**, reproducing `18` §5's recount
id-for-id (`balcony`, `hallway`, `storage`, `pantry`, `utility`, `tiling`, `plumbing`,
`electrical`, `demolition` unused).

### 1.3 What was NOT written, and why

- **`styles` on `bi-01` … `bi-08`** — `18`'s header lists `styles` as *not in scope* and no §2–§6
  entry authors one. No other input listed for this task authors them either. Left **absent**
  rather than invented. This has a measurable consequence; see §5.1.
- **`totalPrice` on `bi-01` … `bi-08`** — likewise out of `18`'s scope, and `04` §4 E2 requires
  `bi-04` and `bi-06` to stay price-free. Left absent, including the contract §19 worked example's
  `bi-04` total of 19,000,000 (see §6.3).
- Nothing else about the eight changed: no text, title, slug, date, asset ref, key order or
  formatting was touched.

### 1.4 Formatting

The file was already exactly `JSON.stringify(doc, null, 2) + "\n"`; it still is. New keys are
inserted in `ProjectSchema` declaration order, i.e. `projectType, propertyType, workScopeIds,
totalPrice, styles` between `scope` and `period`. The diff is **696 insertions, 0 deletions** —
`git diff` shows no `-` line at all.

---

## 2. Schema verification of all 19 (run, not inferred)

A throwaway `tsx` script parsed every record through the real `ProjectSchema` and the whole
document through `ProjectsDocSchema`, then re-checked the referential and invariant facts
independently. Script deleted afterwards; it lived outside the repo tree.

```
ProjectSchema: 19/19 parse
ProjectsDocSchema: PASS            (no duplicate id, no duplicate slug)
referential check done             (every `category` in categories.json; every cover asset in assets/registry.json)
INV-28/29/30 done                  (no failure on any record)
projectType counts: {"full_remodel":7,"partial_remodel":7,"absent":5}
workScopeIds distinct used: 17
```

**All 19 records satisfy `ProjectSchema`.** No `INV-28`, `INV-29` or `INV-30` failure anywhere —
including `bi-19`, whose trades-only `[flooring, wallpaper, lighting]` is paired with an **absent**
`projectType`, which is exactly the shape `PT5`/`INV-30` prescribe and the schema's `superRefine`
leaves alone.

No record in `04` §2 failed today's schema. `04` §0.1 / §3's claim that the V0.2 fields are
*"rejected by `.strict()`"* is stale — `18` §0.1 already recorded that, and it is now confirmed by
execution.

---

## 3. Emission spot check (pure emitter + validator, not a build)

| fact | result |
|---|---|
| records / document bytes / manifest bytes | 19 / 11780 B / 274 B |
| facet keys | `category, style, tag` (4 · 8 · 9 values) |
| `document.workScopes` | 17 ids, sorted, closed both ways |
| validator **errors** | **0** |
| validator warnings | **1** (ST6 — see §5.1) |

The four `D-1` derivations reproduce `04` §2's expected values **exactly**:

| record | total | area | derived `perArea` | `04` §2 expected |
|---|---|---|---|---|
| bi-09 | exact 50,000,000 | 34 pyeong | **1,470,588** /pyeong | 1,470,588 (RD1 on a non-integer division) |
| bi-10 | exact 85,000,000 | 34 pyeong | **2,500,000** /pyeong | 2,500,000 |
| bi-11 | exact 30,000,000 | 20 pyeong | **1,500,000** /pyeong | 1,500,000 |
| bi-12 | exact 52,000,000 | 26 pyeong | **2,000,000** /pyeong | 2,000,000 |

And the negative branches all hold: `bi-13` (range) → no `perArea` (D-1 condition 2);
`bi-14` … `bi-18` (partials) → no `perArea` (D-1a / INV-19); `bi-19` (breadth-absent) → no
`perArea` (D-1 condition 1). `11,000,000 / 32 = 343,750` does not appear in the document.
The eight keep their **authored** `perArea` values unchanged and unmarked as derived (PA1).

---

## 4. Test counts

| | before (given baseline) | after |
|---|---|---|
| `npm run test:integration` | **61 passed · 0 failed · 9 skipped** | **44 passed · 17 failed · 9 skipped** |
| `npm run typecheck:platform` | — | **PASS** (exit 0, no diagnostics) |

17 previously-passing checks now fail. **No assertion was weakened, deleted or skipped.** All 17
are classified below; every one of them is a *re-baseline* failure, and none indicates a defect in
the applied data.

### 4.1 The 17, classified

**(a) Hard-coded "the demo has 8 records / no V0.2 fields" expectations — 6 checks.**
These assert the pre-V0.2 shape of the demo document directly.

| check | observed vs expected |
|---|---|
| E1 | `[19,{category:4,style:8,tag:9}] ≠ [8,{category:4,tag:8}]` |
| E3 | facet key order `["category","style","tag"] ≠ ["category","tag"]` — the `style` facet now exists |
| E4 | asserts *"the demo data authors none of the V0.2 fields yet, so none of them may appear"* (its own comment) and `6 priced records`; there are now 10 (6 authored + 4 derived) |
| E5 | `bi-01` `property` is now `{type:"apartment",area:{…}}`, the check expects `{area:{…}}` |
| E7 | mutates `projects[0].projectType = "full_remodel"` to prove the version moves — `bi-01` **already** carries that exact value, so the mutation is a no-op |
| E8 | crafts scopes on `projects[0]` and expects `document.workScopes === ["bathroom","kitchen"]`; all 19 records now carry scopes, so it is the full 17 |

**(b) Crafted snapshots built *from* a demo record that was assumed to carry no V0.2 fields — 7 checks.**
`A1`, `A3`, `A7`, `A8`, `A9`, `A10`, `V14`, `V15` all start from
`demo.snapshot.content.projects[0]` (= `bi-01`) or from the demo emission. Examples:

- `A10` does `ProjectSchema.safeParse({ ...bi01, projectType: "partial_remodel" })` and expects an
  `INV-28` refusal *because `bi-01` had no `workScopeIds`*. `bi-01` now has them, so the record is
  legitimately valid. INV-28 itself is unchanged and still fires (verified independently in §2).
- `V14`'s *"workScopes is absent although records carry work scopes"* case can no longer arise:
  the demo document now always has a `workScopes` array.
- `V15`'s first case sets `perArea.source = "derived"` on `bi-01` and expects `/INV-19|D-1a/`;
  `bi-01` is now `full_remodel`, so a **different but equally correct** D-1 error fires
  (`"pricing.perArea is derived but D-1's conditions do not hold (07 §9.3)"`). The rule is still
  enforced; only the message the regex matches moved.
- `A8` expects *"no other record has work scopes"* and now finds `bi-02`'s.

**(c) A recorded historical hash — 1 check.**
`B2`'s *"pin rolled back to 1.5.2 → the live package's snapshot hash"* compares
`hashJson(snapshot with the 1.5.2 pin)` against the hash recorded in the **live** (pre-V0.2)
package. Re-authoring `projects.json` necessarily moves that hash. This check belongs with the
`TODO(v0.2-data)` family and now needs the same re-baseline treatment as `B2b`.

**(d) One substantive signal inside the churn** — `V1`, and the warning-count halves of `A3` and
`A12`. See §5.1. This is the only failure that is about the *data* rather than about a stale
expectation, and it is caused by a gap the source specs left open, not by a transcription error.

---

## 5. Findings

### 5.1 The demo emission now carries an ST6 warning, caused by the unauthored `styles` on the eight

`V1` asserts the demo emission validates with **0 errors and 0 warnings**. It now produces:

```
errors:   []
warnings: ["facets: \"그레이지\", \"내추럴\", \"모던\", \"우드 포인트\", \"화이트\" appear in both
            facets.style.values and facets.tag.values (ST6, 07 §8)"]
```

The cause is exact and fully accounted for. The eleven new records declare
`화이트 / 베이지 / 모던 / 그레이지 / 내추럴 / 우드 포인트 / 웜 화이트 / 월넛` as `styles`, so those
values enter `facets.style`. The existing eight carry
`화이트 / 미니멀 / 간접조명 / 수납 특화 / 내추럴 / 우드 포인트 / 모던 / 그레이지` as plain `keywords`
with **no `styles`**, so the same words also enter `facets.tag`. The intersection is precisely the
five values the warning names.

This is **not** a contract violation: `ST4` / `INV-24` is per record, and no record carries a value
in both of its own facets (`errors: []` confirms it). `ST6` is a SHOULD-warn about authoring
inconsistency, and it is telling the truth — the corpus classifies the same word two ways.

It is also **not fixable from the inputs listed for this task**: `18` explicitly puts `styles` out
of scope, and no listed document authors a `styles` value for any of `bi-01` … `bi-08`. Authoring
them here would have been invention. **Left as-is and escalated: a `styles` authoring pass over
the existing eight is the follow-up that clears this warning.** Contract §19's worked example
suggests the shape for one record only (`bi-01` → `facets.style: ["화이트","미니멀"]`, i.e.
`styles: ["화이트","미니멀"]`); the other seven have no authored source at all.

### 5.2 No skip can be un-skipped by this change alone

None of the 9 were un-skipped (as instructed). Assessing each honestly:

| skip | blocker stated | status after this change |
|---|---|---|
| **E1b** demo version + document bytes | *"data/sites/boost-interior-demo is still V0-authored"* | **The stated blocker is gone** — the data is now V0.2-authored. The check still needs `DEMO_VERSION` / `DEMO_DOC_BYTES` recomputed (now `63bff35152765b8177e4e933557c8e69` / `11780 B`). Recomputing them **now would be premature**: a `styles` pass on the eight (§5.1) moves both values again. |
| **E2b** §21.2 two-record + §21.3 empty golden | needs 07 §19's V0.2 worked example as the new golden | **Still blocked**, and for a new reason — see §6.1. Its two-record half filters to `bi-01` + `bi-04`, which is exactly §19's example, but the data as authored cannot reproduce §19 byte for byte. Its §21.3 half is data-independent. |
| **T3** empty site, §21.3 bytes | asserts `schemaVersion "0.1"` golden bytes | **Still blocked** — `fixture-empty`, wholly independent of demo data. Needs a new `EMPTY_DOC` constant. |
| **B2b, G1, G2, G3, G5, T1** | the golden package in `data/site-builds/` is still the V0 one | **Still blocked** — all six read or compare the on-disk package. Re-authored data is a *precondition* for rebuilding it, not a substitute. Rebuilding is also premature while §5.1 is open. |

Short answer: **0 of 9 are unblocked**; exactly one (`E1b`) has had its *stated* blocker removed
and now waits only on a deliberate constant recomputation that should come after the `styles` pass.

`B2` (§4.1(c)) should be added to this family — it now fails for the same reason its sibling `B2b`
is skipped.

---

## 6. Discrepancies hit, and how each was resolved

### 6.1 `bi-01`'s `workScopeIds`: `18` §2 vs contract §19's worked example — **RESOLVED in favour of `18`**

`18` §2 authors `bi-01` as
`[entrance, kitchen, bathroom, flooring, lighting, built_in_furniture]`, rejecting `living_room`
and `bedroom` with a per-id justification under `WS9`(c) (the living room received only trades run
through it; the bedrooms appear only as curtains and blinds, which `WS9`(b) says are not a work
scope at all).

Contract §19's worked example record shows
`"workScopeIds": ["entrance","living_room","kitchen","bedroom","bathroom","built_in_furniture"]`
— no `flooring`, no `lighting`, plus the two ids `18` rejects.

`18` is the later, dedicated authoring pass, written against contract **rev 8** and explicitly
citing the `13c` `WS9`(c) re-audit that stripped `living_room`/`bedroom` from `bi-09`/`bi-11`/`bi-12`
on the same grounds. The §19 example predates that tightening. **`18`'s set was applied.**

**Consequence for the reader who restores `E2b`:** contract §19's worked example can no longer be
reproduced from the demo data. Three fields disagree — `bi-01`'s `workScopeIds` (above), `bi-01`'s
`facets.style` (§19 shows `["화이트","미니멀"]`; no `styles` are authored, so all four keywords fall
to `tag`), and `bi-04`'s `pricing.total` (§19 shows exact 19,000,000; not authored — §6.3).
**Either §19's example is restated against the authored data, or `E2b` cannot be restored from it.**
Flagged, not resolved here: editing the contract is out of scope for this task.

### 6.2 `styles` unauthored for the existing eight — **LEFT OPEN, escalated**

See §5.1. The spec is silent, not wrong; inventing eight sets of style words would have been
design, not transcription.

### 6.3 `totalPrice` unauthored for the existing eight — **LEFT OPEN, deliberate**

`18` puts it out of scope; `04` §4 E2 requires `bi-04` and `bi-06` to remain price-free so the
"price entirely missing" fixture survives. Contract §19's worked example gives `bi-04` an exact
19,000,000 total, and `04` §4 P4's note calls that total *"the shape bi-04 in the data does NOT
have"*. Not applied. This is the second field §19's example cannot be reproduced from.

### 6.4 `propertyType: "apartment"` on `bi-04` and `bi-06` has no in-record evidence — **APPLIED, flagged**

`04` §0.2 fixes `propertyType: "apartment"` for all eight and justifies it with *"(every body says
아파트)"*. That justification is **false for two records**: the string 아파트 appears nowhere in
`bi-04`'s or `bi-06`'s `title`, `summary`, `body`, `scope` or `customerQuote`. (It is present in
the other six.)

- `bi-04` is independently backed: contract §19's worked example emits it as
  `"property": { "type": "apartment", … }`.
- **`bi-06` rests on `04` §0.2's blanket sentence alone.**

Applied as the spec explicitly directs — this is a spec-stated value, not an inference of mine, and
`propertyType` is an operator-authored fact the fixture's author is entitled to fix. But because
the stated evidence does not hold, **`bi-06`'s `propertyType` is the single item in this change most
likely to want reversing.** Removing it is a one-line edit and affects nothing else (the field is
optional; absent = unknown).

### 6.5 `bi-19`'s cover `alt` deviates from `04` §2's own convention — **APPLIED as written, minor**

§2's preamble says a new record's cover `alt` *"describes the photo as its original record
described it"*. Ten of the eleven do so verbatim. `bi-19` reuses `bi01-hallway-01`, whose alt in
`bi-01` is `"천장까지 닿는 화이트 수납장이 있는 복도"`, but §2 authors
`"붙박이 수납장이 이어지는 복도"`. §2's literal record data was transcribed, since the record data is
what this task applies and the convention sentence is prose about it. `alt` is not projected into
the integration document, so nothing downstream depends on the choice.

### 6.6 Stale claims in `04` confirmed stale — **recorded, not edited**

- §0.1 / §3: *"the V0.2 fields are NOT in `ProjectSchema` — rejected by `.strict()`"*. False in the
  working tree; all 19 parse. `18` §0.1 already reported this.
- §0.1's provisional name `style` is `styles` in the schema. Applied as `styles`.
- §4's parenthetical *"balcony will come from bi-05/bi-06 once the existing 8 are authored"*.
  It does not — `balcony` is unused across all 19, as `18` §5 predicted and the applied data
  confirms.

### 6.7 No missing asset id and no missing category

Every `category` on all 19 resolves in `categories.json` (`full-remodel` ×6, `kitchen-bath` ×4,
`move-in-styling` ×1, `partial-remodel` ×4 — 5 + 3 + 3 new on top of the existing 8). Every cover
and gallery asset ref on all 19 resolves in `assets/registry.json`. No new asset is required, as
`04` §5 states.

---

## 7. For the orchestrator

1. **The data is applied and valid**: 19/19 against `ProjectSchema`, 0 validator errors on the
   emitted document, every `D-1`/`RD1` value matching `04` §2 exactly, typecheck clean.
2. **`npm run test:integration` is 44 · 17 · 9**, down from 61 · 0 · 9. All 17 failures are stale
   expectations that the re-authoring necessarily invalidates — 13 assert the pre-V0.2 shape of the
   demo, 1 (`B2`) asserts a pre-V0.2 hash, and 3 (`V1`, `A3`, `A12`) are the ST6 warning of §5.1.
   Re-baselining them is a separate, deliberate edit and was not done here.
3. **The one real gap is `styles` on `bi-01` … `bi-08`** (§5.1). It is the cause of the only
   validator warning, it is the reason `E1b`'s constants should not be recomputed yet, and it is
   the one thing this task could not do without inventing data.
4. **Contract §19's worked example is now unreproducible** from the demo data on three fields
   (§6.1). Whoever restores `E2b` needs that reconciled first.
5. **`bi-06`'s `propertyType`** (§6.4) is the one applied value whose stated evidence does not hold.
