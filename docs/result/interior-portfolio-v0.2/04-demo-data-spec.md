# 04 — Demo data spec: 11 new portfolio records (bi-09 … bi-19) for `boost-interior-demo`

| | |
|---|---|
| date | 2026-09-24 |
| status | SPEC rev 7 — no code, no data file modified. This document is the only output. |
| revision | rev 7 (2026-09-24, orchestrator) — realigned to contract **rev 8** (the narrowing). **Only §4.1 changed**; no record's data, no id inventory and no schema claim moved. §4.1's expected answers are restated with every budget verdict removed, under the commitment in `16-narrowing-decision.md` §7, and the two answers the narrowing makes **worse** (rows B and F) are labelled as worse rather than quietly reworded. rev 6 (2026-09-24, orchestrator) — realigned to contract **rev 7** after `13-delta-review-rev6.md` and `13b-fixture-execution-rev6.md`. **Four records re-authored** under rev 7's `WS9`(c) joinery clause, on the read-only audit in `13c-ws9-reaudit.md`: `bi-09` (−`living_room`, −`bedroom`, +`built_in_furniture`), `bi-11` (−`living_room`, −`bedroom`), `bi-12` (−`living_room`, −`bedroom`, −`dining`), `bi-13` (−`pantry`, −`bedroom`, +`built_in_furniture`). §4's id inventory recounted independently: **16 used / 10 unused**, `pantry` moved to unused. `INV-28`/`INV-29`/`INV-30` re-verified on all 19 — no record lost its last `Spaces` id. Stale `§14.3.3 row 2/3`, `contract rev 3` and `contract rev 5` citations corrected. rev 5 (2026-09-24, orchestrator) — realigned to contract **rev 6** after `11-delta-review-rev5.md`: the two `PB3a`-forbidden per-area comparisons removed (round-4 `D-1`, never dispositioned), every stale *"contract rev 3"* citation and every `§14.3.2 row N` citation corrected to rev 6's numbering, the `hallway` expectation reconciled with §19, `bi-18`'s alias assumption stated, and `storage`'s zero coverage recorded. No record's data changed. rev 4 (2026-09-24, orchestrator) — realigned to contract **rev 5**: `bi-10` and `bi-18` re-authored `storage` → `built_in_furniture` under rev 4's disambiguated §7.3 gloss (round-4 finding `P-6`), and the §14.3.3 class expectations restated against the new evaluation function. rev 3 (2026-09-24, orchestrator) — realigned to contract **rev 4** after the rev-3 delta review (`08-delta-review-rev3.md` §D): `D-3`, `D-5`, `D-7` corrected; `D-2`, `D-6`, `D-8` given the missing line; `bi-19`'s authoring note takes `WS9`'s new Spaces/Works rule. No record's data changed. rev 2 (2026-09-24, orchestrator) — realigned to contract **rev 3**: `bi-19` promoted from Appendix A to a **required** fixture (it is the only `breadth-absent + total` shape, so without it `INV-19` and `PB5` have no fixture at all); `bi-05` reclassified to breadth-absent; the rev-1 `PT2` citations replaced by `PT4`; the `ST4` `tag` claim in §0.1 reversed. Nothing in the 10 record bodies changed. |
| target file (later) | `data/sites/boost-interior-demo/content/projects.json` (`origin: "synthetic-fixture"`) |
| inputs read | `projects.json` (8 records), `categories.json`, `assets/registry.json` (52 ids), `platform/content/schema.ts` `ProjectSchema`, `docs/reports/integration/07-integration-contract-v0.2-candidate.md` §5 §6 §7 §9 (+ §13 §14 §15 §19), `platform/integration/emit.ts` (current V0.1 source-field mapping), sibling reviews `02-…` and `03-…` in this folder |
| purpose | take the demo site from 8 to 19 records so that the AI consultation search (BoostChat, V0.2 contract) has a real testbed: exact totals, a range, partial scopes, area/basis/unit edge cases, and honest "no answer" cases |

Everything below is **internal demo fixture** content. It reads as ordinary portfolio framing (the same restraint as the existing 8) and fabricates nothing beyond that: no awards, licences, certifications, real customer names, street addresses, or claims of real completed jobs. Locations are district level only (same as today).

---

## 0. Read this first — three things that are NOT decided by this spec

### 0.1 `ProjectSchema` is `.strict()` and has none of the V0.2 authored fields

`platform/content/schema.ts` `ProjectSchema` accepts exactly: `id slug title status publishedAt category cover summary body location area{value,unit,basis} builtYear scope period{start,end} durationWeeks keywords pricePerArea{amount,currency,unit} galleryGroups customerQuote{text,attribution}`. Anything else fails validation today.

The contract (§5.3 PT3, §7.4 WS4, §8 ST2/INV-25, §9.1 TP2, §13) requires `projectType`, `property.type`, `workScopeIds`, `pricing.total` and `style` to come from **authored source fields**. Those fields do not exist yet. Review `02` M-8 records that `style` has no named source field. So:

- Adding the fields to `ProjectSchema` (and to `emit.ts`) is a **prerequisite work item**, not part of this spec.
- Until it lands, the 11 records can be authored with existing fields only and will validate; the V0.2 facts in this spec are then added in the same change as the schema extension.
- This spec uses the following **provisional** content-side names so the intent is unambiguous. The schema work item owns the final names.

| provisional content field | wire (contract) | shape assumed here |
|---|---|---|
| `projectType` | `record.projectType` | `"full_remodel" \| "partial_remodel"`, optional; absent = unknown (no `"unknown"` string, PT1) |
| `propertyType` | `record.property.type` | `"apartment" \| "officetel" \| "villa" \| "detached_house" \| "mixed_use" \| "commercial"`, optional |
| `area` (exists) | `record.property.area` | unchanged, moved by the emitter |
| `workScopeIds` | `record.workScopeIds` | array of §7.3 ids, non-empty when present, authored order; never `[]` (WS5) |
| `totalPrice` | `record.pricing.total` | `{ kind: "exact", amount, currency }` or `{ kind: "range", minAmount, maxAmount, currency }` (`totalCost` stays a reserved name, §17) |
| `pricePerArea` (exists) | `record.pricing.perArea` + `source: "authored"` | unchanged |
| `style` | `record.facets.style` | array of style/mood strings, a **separately authored** subset of `keywords` — the classification is authored, never inferred (INV-25). Contract rev 6 `ST4`: the emitter still emits `facets.tag`, as `keywords` **minus** the style values, authored order kept, key omitted when nothing survives. (Rev 1 of this spec said a built-space producer stops emitting `tag`; that was reversed by delta-review finding `N-2`.) |
| `scope` (exists) | *(retired as a facet)* | stays as the site's Korean display strings on the detail page; it is **not** the source of `workScopeIds` (WS4: never split) |

### 0.2 The existing 8 records also need the authored fields

**`scope`'s Korean strings and `workScopeIds` now visibly diverge, and that is `WS4` working.**
After the rev-6 re-authoring, `bi-12`'s `scope` still reads `["현관", "거실", "주방·다이닝", "침실", "욕실", "붙박이 가구"]` while its `workScopeIds` are `[entrance, kitchen, bathroom, flooring, lighting, built_in_furniture]` — no `living_room`, no `bedroom`, no `dining`. A reader will take that for a bug; it is the rule. `WS4` forbids deriving ids from the site's own Korean scope field, and `WS9` authors a space id only when that space itself changed: 거실 and 침실 appear in the display string because the job *reached* them, and are absent from the ids because only trades did. The same divergence is now on `bi-09`, `bi-11` and `bi-13`. **These four records are the corpus's best fixture for `WS4`** — before rev 6 the two lists agreed closely enough that a producer could have split the Korean strings and passed.

**Authoring `workScopeIds` for bi-01 … bi-08 is a hard prerequisite, not an optional pass.** (`WS7c`, `PT4` and §13's counts are cited here at contract **rev 6**; they have not changed since rev 3, which is what this section cited through rev 4.) Under contract rev 6's `WS7c` a record that states `projectType` at all must carry `workScopeIds` (`INV-28`/`INV-29`), so without that pass bi-01, bi-04, bi-06 and bi-07 may not carry `projectType` and §13's counts collapse to full 0 · partial 0 · absent 8. Contract §13 already fixes `projectType` for bi-01 … bi-08. Under contract rev 6 that is **full 2 (bi-01, bi-07) · partial 2 (bi-04, bi-06) · absent 4 (bi-02, bi-03, bi-05, bi-08)** — bi-05 moved from `full_remodel` to absent in rev 3 (`PT4`(b): its own body names spaces that were left out; rev 2 had let the verb 전체적으로 carry it past the Spaces test). `propertyType: "apartment"` applies to all 8 (every body says 아파트). `workScopeIds` and `style` for the 8 are an authoring pass outside this spec. The coverage matrix (§4) relies only on facts the 8 already have: bi-08 has no `projectType` (§13), bi-04 and bi-06 have no price of any kind.

### 0.3 `publishedAt` for the new 10 is deliberately older than bi-08

All 11 new records are dated 2025-03 … 2025-12, i.e. **before** bi-08 (2026-01-08). Any latest-first listing or homepage keeps its current first 8 cards; the new records appear after them. Publication order is irrelevant to the consultation search. If the outreach demo wants priced cases on the first screen, re-date them into 2026-09 — that is a one-line change and does not affect anything else in this spec.

---

## 1. Design summary

| id | title | projectType | property | area | workScopeIds | total | per-area |
|---|---|---|---|---|---|---|---|
| bi-09 | 달서 34평 아파트 실속형 전체 리모델링 | full_remodel | apartment | 34 pyeong supply | entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture | exact 50,000,000 | derived 1,470,588 |
| bi-10 | 34평 확장·창호 교체 포함 전체 리모델링 | full_remodel | apartment | 34 pyeong supply | entrance, living_room, kitchen, bedroom, dressing_room, bathroom, windows, expansion, built_in_furniture | exact 85,000,000 | derived 2,500,000 |
| bi-11 | 20평 구축 빌라 전체 리모델링 | full_remodel | villa | 20 pyeong supply | kitchen, bathroom, flooring, wallpaper, doors | exact 30,000,000 | derived 1,500,000 |
| bi-12 | 26평 웜 우드 아파트 전체 리모델링 | full_remodel | apartment | 26 pyeong supply | entrance, kitchen, bathroom, flooring, lighting, built_in_furniture | exact 52,000,000 | derived 2,000,000 |
| bi-13 | 48평 대형 아파트 전체 리모델링 | full_remodel | apartment | 48 pyeong supply | entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom, windows, lighting, built_in_furniture | **range** 125,000,000–140,000,000 | **none** (range) |
| bi-14 | 전용 84㎡ 아파트 주방만 바꾼 리뉴얼 | partial_remodel | apartment | **84 m2 exclusive** | kitchen | exact 15,000,000 | none (D-1a) |
| bi-15 | 욕실 한 곳만 새로 한 리뉴얼 | partial_remodel | apartment | **ABSENT** | bathroom | exact 7,000,000 | none (D-1a) |
| bi-16 | 38평 주방과 욕실 두 곳 리뉴얼 | partial_remodel | apartment | 38 pyeong supply | kitchen, bathroom | exact 19,800,000 | none (D-1a) |
| bi-17 | 공급 112㎡ 아파트 거실과 바닥 교체 | partial_remodel | apartment | **112 m2 supply** | living_room, flooring | exact 12,500,000 | none (D-1a) |
| bi-18 | 30평 현관과 수납장 정리 공사 | partial_remodel | apartment | 30 pyeong supply | entrance, built_in_furniture | exact 6,200,000 | none (D-1a); **style ABSENT** |
| bi-19 | 32평 전체 도배·바닥·조명 교체 | **ABSENT** (PT6) | apartment | 32 pyeong supply | flooring, wallpaper, lighting | exact 11,000,000 | none (D-1 cond. 1 fails) |

Pricing realism (2026, Korean market): the four derived full-remodel figures span 1,470,588 → 2,500,000 KRW/평 and the range on bi-13 implies 2.6M–2.9M/평 (never computed by anyone). The existing authored figures (2.4M–3.2M/평) sit in the upper half of the same band, so the 19 records together cover 1.47M–3.2M/평. Every low figure is explained in its body (창호 제외, 구조 변경 없음, 기존 가구 유지). Partials are priced as whole jobs.

Per-area authoring rule applied: **no new record authors `pricePerArea`.** For the four exact-total full remodels the producer's D-1 derivation is the expected value (`source: "derived"`, `perUnit: "pyeong"`). bi-13 (range) and all partials must end with no `perArea` at all.

Two prose conventions kept from the existing 8: prices never appear in prose (the structured field is the only price; GR1 grounding), and exclusions are stated plainly in the body.

Where the design deviates from a literal reading of the brief, it is flagged inline with **DECISION**.

---

## 2. The eleven records

Conventions for every record: `status: "published"`, `publishedAt` at `09:00:00+09:00`, currency `KRW`, `galleryGroups` **omitted** (the Template shows the cover only — this keeps shared photos to one per record, see §5), cover `alt` describes the **photo** as its original record described it, not the fictional job.

### bi-09

```
id / slug / title
  bi-09 / dalseo-34py-value-full-remodeling / 달서 34평 아파트 실속형 전체 리모델링
category
  full-remodel
projectType
  full_remodel — summary says "전체 리모델링"; body: every space redone (바닥·벽·문·조명 집 전체), 창호 left as-is is a **trade**, not a
  space (contract rev 6 `PT4`(b) disqualifies only omitted *spaces*; §7.3 puts windows in the Works table). `PT4`(c) is
  satisfied — entrance/kitchen/bathroom are Spaces ids (INV-29). *(rev 6: `living_room` and `bedroom` removed under
  `WS9`(c) — the living room is named nowhere in the body and received only trades run through it, and the 안방's sole
  work was a 붙박이장, which is `built_in_furniture` and not a remodel of the room it stands in. `entrance` stays
  because §7.3's gloss names shoe storage at the entrance, and that gloss is the more specific rule.)*
property.type
  apartment
area
  34 / pyeong / supply
workScopeIds
  [entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture]
scope
  ["현관", "거실", "주방", "안방", "작은방", "욕실", "바닥·도배"]
pricing.total
  exact 50000000
pricePerArea (authored)
  ABSENT — derived value expected: 50,000,000 / 34 = 1,470,588.235… → 1,470,588 (RD1 round-half-up; identical to half-away-from-zero here, since §9 guarantees positive operands), perUnit "pyeong", source "derived"
keywords / style
  keywords ["화이트", "베이지"] / style ["화이트", "베이지"]
location
  대구 달서구
publishedAt / period / durationWeeks / builtYear
  2025-12-11T09:00:00+09:00 / 2025-10 → 2025-11 / 5 / 2004
cover
  bi01-living-02  (alt: "거실에서 주방과 방문, 중문이 이어지는 모습")
summary
  유행을 타지 않는 밝은 마감으로 34평 아파트 전체를 정리하되, 창호는 그대로 두어 예산을 맞춘 실속형 전체 리모델링입니다.
body
  [
    "공급면적 34평 아파트를 전체 리모델링한 사례입니다. 처음 상담에서 예산 상한이 분명했기 때문에, 어디에 돈을 쓰고 어디를 남길지 먼저 정했습니다. 창호는 상태가 괜찮아 교체하지 않았고, 구조 변경이나 확장도 하지 않았습니다. 대신 눈에 가장 많이 닿는 바닥, 벽, 문, 조명은 집 전체에서 빠짐없이 새로 했습니다.",
    "바닥은 밝은 오크 톤 강마루로 전체를 깔고, 벽과 천장은 화이트 도배로 통일했습니다. 문과 몰딩은 벽과 같은 색으로 칠해 면이 끊기지 않게 했습니다. 주방은 배치를 유지한 채 상하부장과 상판, 타일을 교체했고, 욕실은 타일과 도기, 수전을 새로 넣었습니다.",
    "현관에는 천장까지 닿는 신발장을, 안방에는 붙박이장을 두었습니다. 화려한 연출보다 오래 봐도 질리지 않는 바탕을 만드는 데 집중한 사례입니다."
  ]
customerQuote
  text: "예산 안에서 뭘 포기해야 하는지 처음부터 솔직하게 정리해 주셔서 결정이 쉬웠어요. 창호를 남겼는데도 새집 같습니다."
  attribution: "달서구 34평 · 3인 가족"
WHAT THIS RECORD TESTS
  The "34평 전체 5천" exact match (PB1 whole-home budget vs a full_remodel exact total) and RD1 rounding on a non-integer division (D-1, INV-20).
```

### bi-10

```
id / slug / title
  bi-10 / suseong-34py-expansion-windows-full-remodeling / 34평 확장·창호 교체 포함 전체 리모델링
category
  full-remodel
projectType
  full_remodel — summary "골조만 남기고 새로 짠 전체 리모델링"; body covers every space plus 확장, 창호 전체, 욕실 두 곳, 설비.
property.type
  apartment
area
  34 / pyeong / supply
workScopeIds
  [entrance, living_room, kitchen, bedroom, dressing_room, bathroom, windows, expansion, built_in_furniture]
  (복도 수납 and the 거실·복도 벽면 수납장 are joinery INSIDE other spaces, so contract rev 4's §7.3 gloss makes them
   built_in_furniture, not storage. `storage` is reserved for a dedicated storage space — 창고, 팬트리가 아닌 수납 공간.)
scope
  ["현관·중문", "거실 확장", "주방", "안방·드레스룸", "작은방", "욕실 2곳", "창호 전체", "복도 수납"]
pricing.total
  exact 85000000
pricePerArea (authored)
  ABSENT — derived value expected: 85,000,000 / 34 = 2,500,000 exactly, perUnit "pyeong", source "derived"
keywords / style
  keywords ["모던", "그레이지", "간접조명"] / style ["모던", "그레이지"]   (간접조명 is a technique, not a style — ST2)
location
  대구 수성구
publishedAt / period / durationWeeks / builtYear
  2025-11-20T09:00:00+09:00 / 2025-09 → 2025-10 / 7 / 2001
cover
  bi08-dining-01  (alt: "라인 펜던트 아래 6인 식탁")
summary
  20년 넘은 34평 아파트를 발코니 확장과 창호 교체까지 포함해 골조만 남기고 새로 짠 전체 리모델링입니다.
body
  [
    "2001년에 지어진 34평 아파트입니다. 외풍이 심하고 배관과 전기도 손볼 때가 되어, 마감만 바꾸는 대신 창호와 설비까지 한 번에 정리하기로 했습니다. 거실과 안방 발코니를 확장해 실내를 넓히고, 창호는 전체를 이중창으로 교체했습니다.",
    "전체 톤은 차분한 그레이지로 맞추고 우물천장 간접조명으로 저녁 분위기를 만들었습니다. 주방은 ㄷ자로 바꿔 조리 공간을 늘렸고, 안방 한쪽에는 드레스룸을 새로 짜 넣었습니다. 욕실은 공용과 안방 두 곳 모두 방수부터 다시 했습니다.",
    "현관에는 3연동 중문과 붙박이 신발장을 두었고, 거실과 복도 벽면 수납장은 같은 그레이지 도어로 통일했습니다. 공사 범위가 넓어 기간은 7주가 걸렸습니다."
  ]
customerQuote
  ABSENT
WHAT THIS RECORD TESTS
  "Similar area, clearly different price" against bi-09 (both 34평 supply pyeong: 50M vs 85M; derived 1,470,588 vs 2,500,000/평, PB3/PB3a-comparable). bi-01 (34평, authored 2,900,000/평, no total) is a **third price shape at the same area, not a third term of the comparison**: its perArea is `authored`, so PB3a permits it to be displayed and forbids comparing or ordering it against either. That is the case PB3a exists for, and this record is its fixture.
```

### bi-11

```
id / slug / title
  bi-11 / buk-20py-villa-full-remodeling / 20평 구축 빌라 전체 리모델링
category
  full-remodel
projectType
  full_remodel — summary "소형 전체 리모델링"; body: 실내 마감 전부 (바닥·벽·문·주방·욕실), 창호 excluded is a **trade**, not a space
  (contract rev 6 `PT4`(b)); the existing 옷장 kept is a furniture decision, not a space left out. `PT4`(c):
  kitchen/bathroom are Spaces ids (INV-29). *(rev 6: `living_room` and `bedroom` removed under `WS9`(c). The living
  room is named nowhere in the body; the bedroom is the clearest case in the corpus — the body says the **existing**
  옷장 was kept, so no work reached the room at all.)*
property.type
  villa
area
  20 / pyeong / supply
workScopeIds
  [kitchen, bathroom, flooring, wallpaper, doors]
scope
  ["거실", "주방", "침실", "욕실", "바닥·도배", "문·문틀"]
pricing.total
  exact 30000000
pricePerArea (authored)
  ABSENT — derived value expected: 30,000,000 / 20 = 1,500,000 exactly, perUnit "pyeong", source "derived"
keywords / style
  keywords ["화이트", "내추럴"] / style ["화이트", "내추럴"]
location
  대구 북구
publishedAt / period / durationWeeks / builtYear
  2025-10-23T09:00:00+09:00 / 2025-09 (single month, end omitted) / 3 / 1996
cover
  bi07-kitchen-01  (alt: "상부장을 천장까지 올린 일자 주방")
summary
  1990년대에 지어진 20평 빌라를 바닥과 벽, 주방, 욕실까지 한 번에 정리한 소형 전체 리모델링입니다.
body
  [
    "지은 지 30년 가까이 된 20평 빌라입니다. 체리색 문과 몰딩, 낡은 장판과 주방이 그대로 남아 있었습니다. 예산이 넉넉하지 않아 창호는 그대로 두고, 그 외 실내 마감은 전부 새로 하는 범위로 정했습니다.",
    "바닥은 장판을 걷어내고 밝은 강마루를 깔았습니다. 벽과 천장은 화이트로 도배하고, 문과 문틀은 필름으로 화이트에 맞췄습니다. 주방은 일자형 싱크대를 교체하고 타일을 새로 붙였으며, 욕실은 방수 후 타일과 도기를 전부 바꿨습니다.",
    "침실에는 붙박이장 대신 기존 옷장을 쓰기로 해 비용을 아꼈습니다. 작은 집이라 색을 화이트와 오크 두 가지로만 제한해 공간이 넓어 보이게 했습니다."
  ]
customerQuote
  text: "오래된 빌라라 포기하고 있었는데, 필요한 것만 골라서 해 주시니 부담 없이 새집처럼 살고 있어요."
  attribution: "북구 20평 · 1인 가구"
WHAT THIS RECORD TESTS
  "예산 3천 전체" has an honest full_remodel answer that is NOT a 34평 case; property.type = villa (first non-apartment record) for type filtering; derived 1,500,000/평 vs bi-07 (19평, authored 2,700,000/평) is a second similar-area / different-per-area pair.
```

### bi-12

```
id / slug / title
  bi-12 / dong-26py-warm-wood-full-remodeling / 26평 웜 우드 아파트 전체 리모델링
category
  full-remodel
projectType
  full_remodel — summary "전체 리모델링"; body covers 현관·거실·주방·침실·욕실 plus 붙박이 가구; "확장이나 창호 교체 없이" is stated as
  what the project did not need, not as a space left out.
property.type
  apartment
area
  26 / pyeong / supply
workScopeIds
  [entrance, kitchen, bathroom, flooring, lighting, built_in_furniture]
scope
  ["현관", "거실", "주방·다이닝", "침실", "욕실", "붙박이 가구"]
pricing.total
  exact 52000000
pricePerArea (authored)
  ABSENT — derived value expected: 52,000,000 / 26 = 2,000,000 exactly, perUnit "pyeong", source "derived"
keywords / style
  keywords ["내추럴", "우드 포인트", "웜 화이트"] / style ["내추럴", "우드 포인트", "웜 화이트"]
location
  대구 동구
publishedAt / period / durationWeeks / builtYear
  2025-09-25T09:00:00+09:00 / 2025-07 → 2025-08 / 5 / 2008
cover
  bi05-dining-01  (alt: "라탄 펜던트 아래 4인 오크 식탁")
summary
  부부 두 사람이 사는 26평 아파트를 밝은 오크와 웜 화이트로 정리하고, 붙박이 가구로 수납을 벽 안에 넣은 전체 리모델링입니다.
body
  [
    "26평 아파트에 두 분이 살면서 취미 물건이 많아 늘 어수선했던 집입니다. 가구를 줄이는 대신 현관, 거실, 침실에 붙박이 수납을 짜 넣고, 남는 자리에 꼭 필요한 가구만 두는 순서로 계획했습니다.",
    "바닥은 밝은 오크 마루, 벽은 노란 기가 살짝 도는 웜 화이트로 맞췄습니다. 주방은 일자형을 유지하면서 상판과 타일을 바꾸고, 식탁 위에는 라탄 펜던트를 달아 다이닝 자리를 만들었습니다. 조명 회로는 메인등과 간접등으로 나눴습니다.",
    "욕실은 방수부터 다시 하고 밝은 베이지 타일로 마감했습니다. 확장이나 창호 교체 없이 마감과 수납 위주로 진행한 사례입니다."
  ]
customerQuote
  ABSENT
WHAT THIS RECORD TESTS
  "Similar price, clearly different area" against bi-09 (52M @ 26평 vs 50M @ 34평, both full_remodel supply pyeong): a "예산 5천" answer must surface both and show the area difference; derived 2,000,000 vs 1,470,588/평 is why.
```

### bi-13

```
id / slug / title
  bi-13 / suseong-48py-large-apartment-full-remodeling / 48평 대형 아파트 전체 리모델링
category
  full-remodel
projectType
  full_remodel — summary "대형 전체 리모델링"; body: every room re-planned, 창호 전체, 욕실 두 곳, 설비 — nothing left out.
property.type
  apartment
area
  48 / pyeong / supply
workScopeIds
  [entrance, living_room, dining, kitchen, kids_room, dressing_room, study, bathroom, windows, lighting, built_in_furniture]
scope
  ["현관·중문", "거실", "다이닝", "주방·팬트리", "안방·드레스룸", "서재", "아이방", "욕실 2곳", "창호 전체"]
pricing.total
  range 125000000 – 140000000
pricePerArea (authored)
  ABSENT — and NO derived value is expected: kind "range" fails D-1 condition 2. The record must end with no pricing.perArea at all.
  (Implied 2.6M–2.9M/평 is a number nobody may compute or emit — TP3, D-1c.)
keywords / style
  keywords ["모던", "그레이지", "월넛"] / style ["모던", "그레이지", "월넛"]
location
  대구 수성구
publishedAt / period / durationWeeks / builtYear
  2025-08-28T09:00:00+09:00 / 2025-05 → 2025-07 / 10 / 2005
cover
  bi03-kitchen-01  (alt: "아일랜드와 키큰 팬트리 수납장이 있는 주방")
summary
  48평 아파트를 창호 교체부터 서재와 드레스룸 신설까지 열 주에 걸쳐 새로 짠 대형 전체 리모델링입니다.
body
  [
    "2005년에 지어진 48평 아파트입니다. 방이 넷인 구조를 유지하되 한 방은 서재로, 안방 옆 방은 드레스룸으로 용도를 바꿨습니다. 창호는 전체를 교체하고, 거실과 주방 사이 벽을 일부 열어 다이닝을 넓혔습니다.",
    "톤은 차분한 그레이지에 월넛 가구를 더해 무게를 잡았습니다. 거실 우물천장에는 간접조명과 슬림 트랙 조명을 함께 넣었고, 주방은 아일랜드를 두고 뒤쪽에 키큰 팬트리 수납장을 짜 넣었습니다. 욕실 두 곳은 모두 방수부터 다시 하고, 안방 욕실에는 욕조를 유지했습니다.",
    "면적이 넓고 창호와 설비가 포함되어 공사 기간은 열 주가 걸렸습니다. 마감재와 가구 사양에 따라 견적 폭이 있었던 사례라, 상담 시에는 참고 범위로 안내드리고 있습니다."
  ]
customerQuote
  text: "집이 넓어 어디서부터 손대야 할지 몰랐는데, 방마다 용도를 먼저 정해 주신 게 큰 도움이 됐습니다."
  attribution: "수성구 48평 · 4인 가족"
WHAT THIS RECORD TESTS
  kind: "range" (TP1, INV-23) on a full_remodel WITH an area — the producer must NOT derive a per-area price (D-1 condition 2); the
  large / high-budget anchor for "50평 전체 1억 넘나요" style questions, answered honestly as a range.
```

**DECISION** — the brief asks for "one larger (~42–51평) full with a higher total". This record carries the required **range** instead of an exact total, on purpose: the "full_remodel + range ⇒ no derivation" branch is the D-1 branch most likely to be implemented wrongly (deriving from `minAmount` or a midpoint), and it needs a full-remodel fixture with an area to be exercised at all. Its total is still unambiguously the highest. The four exact-total fulls required by the brief are bi-09, bi-10, bi-11, bi-12. If an exact large anchor is preferred later, make bi-13 `exact 132,000,000` (→ derived 2,750,000) and move the range to bi-17 (`range 11,000,000–14,000,000`, 바닥재 사양에 따라) — but then no fixture tests D-1 condition 2.

### bi-14

```
id / slug / title
  bi-14 / dalseo-84m2-kitchen-only-renewal / 전용 84㎡ 아파트 주방만 바꾼 리뉴얼
category
  kitchen-bath
projectType
  partial_remodel — summary "주방 한 곳만 골라"; body: "다른 곳은 … 상태가 좋았고 … 주방 한 곳에만 예산을".
property.type
  apartment
area
  84 / m2 / exclusive      (the body says "전용면적 84㎡, 흔히 34평형이라고 부르는" — the structured fact is EXCLUSIVE and stays so)
workScopeIds
  [kitchen]
scope
  ["주방"]
pricing.total
  exact 15000000
pricePerArea (authored)
  ABSENT — no derived value (D-1a: partial_remodel)
keywords / style
  keywords ["화이트", "모던"] / style ["화이트", "모던"]
location
  대구 달서구
publishedAt / period / durationWeeks / builtYear
  2025-07-31T09:00:00+09:00 / 2025-07 / 1 / 2010
cover
  bi01-kitchen-01  (alt: "키큰장과 일자 싱크대가 마주 보는 화이트 주방")
summary
  전용면적 84㎡ 아파트에서 주방 한 곳만 골라 상하부장과 상판, 타일, 후드를 교체한 일주일 공사입니다.
body
  [
    "다른 곳은 몇 해 전 도배와 바닥을 해 둔 상태라 상태가 좋았고, 주방만 처음 입주 때 그대로였습니다. 그래서 주방 한 곳에만 예산을 쓰기로 했습니다. 전용면적 84㎡, 흔히 34평형이라고 부르는 아파트입니다.",
    "배치는 ㄱ자를 유지하고, 상부장은 천장까지 올려 수납을 늘렸습니다. 상판은 밝은 톤의 엔지니어드 스톤, 벽 타일은 화이트 정사각 타일로 맞췄습니다. 후드는 슬림형으로 바꾸고, 싱크볼은 언더마운트로 넣어 상판을 매끈하게 정리했습니다.",
    "살면서 진행할 수 있도록 철거부터 마무리까지 일주일 안에 끝냈습니다."
  ]
customerQuote
  text: "주방만 바꿨는데 집 전체가 정리된 느낌이에요. 일주일 만에 끝나서 살면서 할 수 있었던 게 제일 좋았습니다."
  attribution: "달서구 84㎡ · 4인 가족"
WHAT THIS RECORD TESTS
  kitchen-only priced partial (exact scope match, no per-area); area authored as m2 + EXCLUSIVE — a visitor's bare "34평" (supply by
  defaultAreaBasis) must never be equated with this record's exclusive 84㎡ (AR5 / PY1), even though the prose itself says 34평형.
```

### bi-15

```
id / slug / title
  bi-15 / jung-single-bathroom-renewal / 욕실 한 곳만 새로 한 리뉴얼
category
  kitchen-bath
projectType
  partial_remodel — summary "공용 욕실 한 곳"; body: "다른 공간은 손대지 않고 공용 욕실 한 곳만 범위로".
property.type
  apartment
area
  ABSENT      (the operator did not record the flat size for a bathroom-only job; the flat has a second bathroom per the body)
workScopeIds
  [bathroom]
scope
  ["공용 욕실"]
pricing.total
  exact 7000000
pricePerArea (authored)
  ABSENT — no derived value (D-1a; and no area anyway)
keywords / style
  keywords ["화이트"] / style ["화이트"]
location
  대구 중구
publishedAt / period / durationWeeks / builtYear
  2025-07-03T09:00:00+09:00 / 2025-06 / 1 / 2007
cover
  bi07-bathroom-01  (alt: "화이트 타일과 유리 샤워 스크린이 있는 욕실")
summary
  누수와 곰팡이가 반복되던 공용 욕실 한 곳을 방수부터 다시 하고 타일, 도기, 수전을 모두 바꾼 닷새 공사입니다.
body
  [
    "욕실 바닥 줄눈에서 아랫집으로 물이 비치기 시작해 미룰 수 없게 된 공사입니다. 다른 공간은 손대지 않고 공용 욕실 한 곳만 범위로 정했습니다.",
    "기존 타일을 전부 철거하고 방수층을 새로 만든 뒤, 큰 규격의 화이트 무광 타일로 줄눈을 줄였습니다. 세면대는 벽걸이형으로, 수납은 슬라이드 거울장으로 바꿔 바닥을 비웠습니다. 샤워 공간에는 유리 파티션을 세워 물 튐을 줄였습니다.",
    "철거부터 마무리 실리콘까지 닷새가 걸렸고, 그동안은 안방 욕실을 쓰셨습니다."
  ]
customerQuote
  ABSENT
WHAT THIS RECORD TESTS
  bathroom-only priced partial in the 6–8M band; area ABSENT (an area-qualified query must neither match nor penalise it — missing is
  unknown, PB4 spirit, AR rules); with bi-16 it shows `bathroom` is emitted once whatever the count (WS3).
```

### bi-16

```
id / slug / title
  bi-16 / gyeongsan-38py-kitchen-two-bathrooms-renewal / 38평 주방과 욕실 두 곳 리뉴얼
category
  kitchen-bath
projectType
  partial_remodel — summary "바닥과 도배는 그대로 두고 … 세 곳만"; body: "전체 공사는 몇 해 뒤로 미루고".
property.type
  apartment
area
  38 / pyeong / supply
workScopeIds
  [kitchen, bathroom]        ← `bathroom` ONCE. The plurality (두 곳, 공용 + 안방) lives in the title, scope and body only (WS3).
scope
  ["주방", "공용 욕실", "안방 욕실"]
pricing.total
  exact 19800000
pricePerArea (authored)
  ABSENT — no derived value (D-1a)
keywords / style
  keywords ["화이트", "베이지"] / style ["화이트", "베이지"]
location
  경북 경산시
publishedAt / period / durationWeeks / builtYear
  2025-06-05T09:00:00+09:00 / 2025-05 / 2 / 2005
cover
  bi01-kitchen-02  (alt: "상부장 없이 세로 골 패널로 마감한 싱크대 벽")
summary
  바닥과 도배는 그대로 두고, 주방과 공용 욕실, 안방 욕실 세 곳만 2주 동안 바꾼 부분 리뉴얼입니다.
body
  [
    "38평 아파트에서 물을 쓰는 세 공간만 골라 진행했습니다. 전체 공사는 몇 해 뒤로 미루고, 당장 불편한 주방과 욕실 두 곳에 예산을 집중한 사례입니다.",
    "주방은 ㄱ자 배치를 유지하면서 상하부장과 상판, 타일, 수전을 교체했습니다. 욕실 두 곳은 모두 기존 타일 위에 덧방으로 시공해 철거 비용과 소음을 줄였고, 공용 욕실에는 샤워 파티션을, 안방 욕실에는 기존 욕조를 남겨 두었습니다.",
    "살면서 진행할 수 있게 주방 먼저, 욕실은 한 곳씩 순서를 나눠 2주 안에 마쳤습니다."
  ]
customerQuote
  text: "욕실 두 개를 한 번에 하면 며칠은 씻을 데가 없을까 걱정했는데, 한 곳씩 나눠 해 주셔서 불편이 거의 없었어요."
  attribution: "경산시 38평 · 4인 가족"
WHAT THIS RECORD TESTS
  kitchen + bathroom priced partial (~19.8M, the shape of the contract's §19 worked example — which bi-04 in the data does NOT have);
  the two-bathroom job whose plurality is invisible in workScopeIds (WS3); paired with bi-04 (same scope set, no price) and bi-15
  (one bathroom, 7M). It is also the target fixture for review 02 B-3's "주방이랑 욕실만 2천만원" utterance.
```

**DECISION** — the brief lists "a two-bathroom job" and "kitchen + bathroom together" as separate bullets. Within 10 records (5 fulls are needed for the two comparison pairs) they are merged into this one record, exactly as bi-04 already combines 주방 + 공용 욕실 + 안방 욕실. The WS3 test is stronger for it: bi-15 (`[bathroom]`, 1 bathroom, 7M) and bi-16 (`[kitchen, bathroom]`, 2 bathrooms, 19.8M) differ in bathroom count only in prose. A budget-tier kitchen (배치 유지, 상하부장·상판·타일·수전) plus two 덧방 bathrooms at 19.8M is realistic. If a bathroom-only two-bathroom record is wanted later, it is a copy of bi-15 at ~13M with "욕실 두 곳" in the title.

### bi-17

```
id / slug / title
  bi-17 / buk-112m2-living-room-flooring-renewal / 공급 112㎡ 아파트 거실과 바닥 교체
category
  partial-remodel
projectType
  partial_remodel — summary "거실 벽면과 집 전체 바닥만 골라"; body: 주방·욕실 untouched, 방 도배 kept.
property.type
  apartment
area
  112 / m2 / supply       (the body says "공급면적 112㎡, 34평형으로 불리는" — here converting 112 × 121/400 = 33.88평 IS legitimate, AR4)
workScopeIds
  [living_room, flooring]
scope
  ["거실", "바닥 전체"]
pricing.total
  exact 12500000
pricePerArea (authored)
  ABSENT — no derived value (D-1a)
keywords / style
  keywords ["내추럴", "우드 포인트"] / style ["내추럴", "우드 포인트"]
location
  대구 북구
publishedAt / period / durationWeeks / builtYear
  2025-05-08T09:00:00+09:00 / 2025-04 / 1 / 2016
cover
  bi06-living-01  (alt: "세로 템바보드 벽과 간접조명이 있는 거실")
summary
  공급면적 112㎡ 아파트에서 거실 벽면과 집 전체 바닥만 골라 일주일 만에 바꾼 부분 리모델링입니다.
body
  [
    "2016년에 지어진 아파트라 주방과 욕실은 아직 쓸 만했지만, 강화마루가 들뜨고 거실 아트월이 낡아 보이는 것이 고민이었습니다. 그래서 바닥 전체와 거실 벽면 두 가지로 범위를 좁혔습니다. 공급면적 112㎡, 34평형으로 불리는 크기의 집입니다.",
    "바닥은 기존 마루를 걷어내고 밝은 오크 톤 강마루를 거실부터 방까지 이어 깔았습니다. 거실 TV 벽은 세로 템바보드로 마감하고 위쪽에 간접조명을 넣었습니다. 벽지는 거실만 새로 하고 방은 기존 도배를 유지했습니다.",
    "가구를 잠시 옮겨 두고 일주일 안에 끝냈습니다. 바닥 색을 바꾸는 것만으로도 집 전체 인상이 달라진 사례입니다."
  ]
customerQuote
  ABSENT
WHAT THIS RECORD TESTS
  Trade + space combination ([living_room, flooring]) for "바닥이랑 거실만" (Q_s = {living_room}, Q_t = {flooring} ⇒ §14.3.3 row 3, `scope_exact`); area in m2 with SUPPLY basis — the
  consumer's unit conversion (AR4) must make it comparable with "34평" queries, yet a whole-home "34평 5천" budget must never match it
  (PB1: it is partial_remodel). Together with bi-14 it separates "unit converts" from "basis never converts".
```

### bi-18

```
id / slug / title
  bi-18 / seo-30py-entrance-storage-renewal / 30평 현관과 수납장 정리 공사
category
  partial-remodel
projectType
  partial_remodel — summary/body: "다른 공간은 손대지 않고 현관과 복도 수납만 범위로".
property.type
  apartment
area
  30 / pyeong / supply
workScopeIds
  [entrance, built_in_furniture]      (복도 붙박이장 = joinery inside the hallway; §7.3's storage is a DEDICATED storage space)
scope
  ["현관·중문", "복도 수납장"]
pricing.total
  exact 6200000
pricePerArea (authored)
  ABSENT — no derived value (D-1a)
keywords / style
  keywords ABSENT / style ABSENT      (a functional job; the operator authored no style words — facets.style must be absent, not [])
location
  대구 서구
publishedAt / period / durationWeeks / builtYear
  2025-04-10T09:00:00+09:00 / 2025-03 / 1 / 2002
cover
  bi03-entrance-01  (alt: "벤치 칸과 양쪽 신발장이 있는 현관")
summary
  신발과 계절 용품이 넘치던 현관에 중문과 천장까지 닿는 신발장을 넣고, 복도에 붙박이 수납장을 짜 넣은 소규모 공사입니다.
body
  [
    "다른 공간은 손대지 않고 현관과 복도 수납만 범위로 정한 사례입니다. 신발이 현관 밖으로 나와 있고, 청소기와 계절 용품을 둘 자리가 없다는 상담에서 시작했습니다.",
    "현관에는 슬림 프레임 중문을 달고, 신발장은 천장까지 올려 아래를 띄웠습니다. 띄운 공간에는 자주 신는 신발을 두고 센서 조명을 넣었습니다. 복도 한 면에는 청소기와 계절 용품이 들어가는 깊이의 붙박이장을 짜 넣고, 문은 벽과 같은 색으로 맞췄습니다.",
    "가구 제작 기간을 빼면 현장 공사는 사흘이었습니다."
  ]
customerQuote
  text: "현관만 바꿨는데 집에 들어올 때 스트레스가 없어졌어요. 청소기 자리가 생긴 게 제일 큽니다."
  attribution: "서구 30평 · 부부"
WHAT THIS RECORD TESTS
  a SPACE + a TRADE in one partial (R_s = {entrance}, R_t = {built_in_furniture}) — the shape §14.3.3 rows 3/4's Q_t conjunct
  turns on; style (and keywords) ABSENT — a style-flavoured query must neither drop nor penalise it (ST3, INV-18);
  a small-ticket partial whose price (6.2M) is close to bi-15's (7M) with a disjoint scope — "similar price, different scope".
```

---

### bi-19

**Required fixture (rev 2).** Promoted from rev 1's Appendix A. It is the **only** record in the whole
set with the shape *breadth-absent + exact total + a usable area*, which is the shape `INV-19` and
`D-1a` exist to police and the shape `PB5` needs. Without it those three rules ship untested.

```
id / slug / title
  bi-19 / dalseong-32py-whole-flat-wallpaper-flooring / 32평 전체 도배·바닥·조명 교체
category
  partial-remodel
projectType
  ABSENT (PT6), and it is the **clean** PT4(c) case. No space is excluded, so PT4(b) is satisfied and PT5 is unavailable
  (there is no bounded set of spaces — the work ran across all of them). PT4(a) is arguable and PT4(c) decides it:
  [flooring, wallpaper, lighting] contains no id from the §7.3 Spaces table, so full_remodel is unauthorable (INV-29) —
  three trades across a flat are not a remodel of it. Absent = unknown (PT1).
property.type
  apartment
area
  32 / pyeong / supply
workScopeIds
  [flooring, wallpaper, lighting]
scope
  ["바닥 전체", "도배 전체", "조명"]
pricing.total
  exact 11000000
pricePerArea (authored)
  ABSENT — and NO derived value: D-1 condition 1 fails (projectType is not full_remodel). 11,000,000 / 32 = 343,750 is
  exactly the meaningless figure D-1a exists to forbid, and INV-19 is the machine check that it never appears.
keywords / style
  keywords ["화이트", "이사 전 공사"] / style ["화이트"]      (ST4: facets.tag emits ["이사 전 공사"], style emits ["화이트"])
location
  대구 달성군
publishedAt / period / durationWeeks / builtYear
  2025-03-13T09:00:00+09:00 / 2025-02 / 1 / 2009
cover
  bi01-hallway-01  (alt: "붙박이 수납장이 이어지는 복도")
summary
  이사 전 일주일 동안 바닥과 도배, 천장 조명 세 가지만 집 전체에 걸쳐 새로 한 사례입니다.
body
  [
    "바닥과 도배, 천장 조명 세 가지만 집 전체에 걸쳐 새로 한 사례입니다. 이사 날짜가 정해진 상태에서 일주일 안에 끝내야 했습니다.",
    "바닥은 현관부터 방까지 전체를 걷어내고 같은 톤의 강마루로 다시 깔았고, 도배도 빠진 방 없이 흰 톤으로 통일했습니다. 천장 조명은 모든 방을 평판등으로 바꾸고 거실만 라인 조명을 더했습니다.",
    "구조는 건드리지 않았고, 가구 교체나 타일 공사처럼 다른 품목은 이번 범위에 넣지 않았습니다."
  ]
  (Authoring note: every space is included and none is downgraded, so PT4(b) does not fire. What stops full_remodel is
   PT4(c) alone. Deliberate — this is the only fixture for INV-29's negative case, and mixing in a space exclusion would
   have made it test PT4(b) instead.
   Contract rev 4's WS9 is what makes that deterministic: **a Spaces id is authored only when that space itself was
   remodelled — its layout, fixtures or built-in elements changed — and a trade run *through* a space is the trade id
   alone.** Re-flooring and re-papering a bedroom therefore authors `flooring`/`wallpaper`, never `bedroom`. Rev 3 said
   only "touched a space", under which an author could have written `bedroom`, INV-29 would have passed, full_remodel
   would have been authorable, and D-1 would have emitted 11,000,000/32 = 343,750/평 wearing a `source: "derived"`
   badge that no invariant catches.)
customerQuote
  ABSENT
WHAT THIS RECORD TESTS
  INV-19 / D-1a on an ABSENT projectType with an exact total AND a usable area — the one shape no other record has;
  PT6 reached through PT4(c) alone — no space exclusion, no ambiguity — so it is the sole negative fixture for INV-29;
  PB5 (never claimed to match a breadth-specific budget; shown as a labelled reference only);
  ST4's subtraction on a record where keywords ⊋ style (tag survives non-empty).
```

**DECISION — why not the no-new-record alternative.** Rev 1 offered instead "author an exact total on
bi-08 alongside its existing authored per-area". Rejected: bi-08 has an **authored** per-area, so
`PA1` makes the authored value win and the D-1a branch is never entered — the alternative does not
fixture the rule it was offered for. bi-19 costs one record and one reused photo.

---

## 3. Schema conformance check of the 11 (against today's `ProjectSchema`)

| constraint | check |
|---|---|
| `id` / `slug` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` | all 11 pass (`84m2`, `112m2`, `32py` are alnum tokens); no slug collides with bi-01 … bi-08 |
| `title` ≤ 80 | longest is 23 chars |
| `category` exists in `categories.json` | full-remodel ×5, kitchen-bath ×3, partial-remodel ×3 |
| `cover.asset` registered | all 11 are in `assets/registry.json` (§5) |
| `summary` ≤ 200, `body` 1..20 × ≤ 1200, no HTML | all pass (summaries 56–72 chars) |
| `area.value` ≤ 2 decimals, `unit` ∈ m2/sqft/pyeong, `basis` ∈ supply/exclusive/unknown | pass; bi-15 omits `area` entirely |
| `scope` 1..20 × ≤ 40 | pass |
| `period` YYYY-MM, `end ≥ start`, single-month = end omitted | pass |
| `durationWeeks` int 1..520, `builtYear` 1800..2100 | pass |
| `keywords` ≤ 12, unique, ≤ 32 chars | pass; bi-18 omits the field |
| `pricePerArea` | omitted on all 11 |
| `galleryGroups` | omitted on all 11 (cover only) |
| `customerQuote.text` ≤ 600, `attribution` ≤ 60 | pass; absent on bi-10, bi-12, bi-15, bi-17, bi-19 |
| new V0.2 fields (`projectType`, `propertyType`, `workScopeIds`, `totalPrice`, `style`) | **NOT in `ProjectSchema` — rejected by `.strict()` until the schema work item lands (§0.1)** |

**On the trades the bodies describe but the ids do not name.** bi-14 is authored `[kitchen]` while its body describes 상판, 벽 타일, 후드 and 싱크볼; bi-16 is `[kitchen, bathroom]` while its body describes 상판·타일·수전 and 덧방. That is correct authoring under WS1 (omit what the §7.3 gloss cannot cover without judgement) — and contract **rev 4 scoped `WS7a`'s closure to Spaces** precisely because of it: a partial's **spaces** are closed, its **works** are open, so no consumer may say "이 금액에 타일 공사는 포함되어 있지 않습니다" about either record. Rev 3 declared the whole set closed, which would have made these two records a source of statable falsehoods.

`workScopeIds` values used by the 11, all from §7.3: bathroom, bedroom, built_in_furniture, dining, doors, dressing_room, entrance, expansion, flooring, kids_room, kitchen, lighting, living_room, study, wallpaper, windows (**16 of 26**; bi-19 adds no new id). Not used by the new 11: **pantry**, storage, hallway, balcony, utility, tiling, painting, plumbing, electrical, demolition (**10**). *Recounted in rev 6 after the `WS9`(c) re-audit; `pantry` moved from used to unused because `bi-13` was its only user and its 팬트리 수납장 is a cabinet standing inside the kitchen, not a separate pantry room.* (balcony will come from bi-05/bi-06 once the existing 8 are authored; WS2 only requires that declared ids are used, not that all 26 appear).

**`hallway` and `storage` currently enter the vocabulary from no record at all.** Contract rev 5 moved bi-01's 복도 붙박이장 to `built_in_furniture`, and rev 6's WS9 makes that the only supported authoring — installing joinery is not by itself a remodel of the space it stands in — so bi-01 contributes no `hallway`, and no other record among the 19 has a 복도 item that changed the 복도 itself. `storage` is used by none of the 19 either, since §7.3's gloss sends joinery to `built_in_furniture`. Both are **declared-but-unused**, which WS2 permits; the consequence is that `INV-17`'s handling of a Spaces id is exercised on 13 of the 14 Spaces ids and these two ship untested. Recorded rather than fixed: inventing a record to exercise an id is worse than an untested id.

---

## 4. Coverage matrix — all 19 records

| # | requirement | covered by | evidence |
|---|---|---|---|
| F1 | ≥ 4 new `full_remodel` with an EXACT total | bi-09, bi-10, bi-11, bi-12 | 50M / 85M / 30M / 52M; bi-13 is a range and is not counted |
| F2 | 34평 full with a total near 50,000,000 | bi-09 | exact 50,000,000, 34 pyeong supply, title contains "34평" and "전체 리모델링" |
| F3 | 34평 full with a clearly different total | bi-10 | exact 85,000,000, 34 pyeong supply (+ bi-01: 34평, authored 2.9M/평, no total) |
| F4 | total near 30,000,000 at a smaller area (not a 34평 case) | bi-11 | exact 30,000,000 @ 20평 (villa) |
| F5 | one larger (~42–51평) full with a higher total | bi-13 | 48평, **range** 125,000,000–140,000,000 (DECISION under bi-13) |
| P1 | `kitchen` only, ≈ 15,000,000 | bi-14 | exact 15,000,000, `[kitchen]` |
| P2 | `bathroom` only, 6–8M | bi-15 | exact 7,000,000, `[bathroom]` |
| P3 | two-bathroom job, plurality in title/body only | bi-16 (+ bi-04 existing, unpriced) | title "욕실 두 곳", scope 공용/안방 욕실, ids `[kitchen, bathroom]` (DECISION under bi-16) |
| P4 | `kitchen` + `bathroom`, 19–20M | bi-16 | exact 19,800,000 |
| P5 | `living_room` + `flooring` | bi-17 | `[living_room, flooring]`, exact 12,500,000 |
| P6 | a space + a trade in one partial | bi-18 | `[entrance, built_in_furniture]`, exact 6,200,000 — `R_s = {entrance}`, `R_t = {built_in_furniture}` |
| E1 | projectType absent | **bi-08, bi-02, bi-03, bi-05 (existing)** | contract rev 6 §13 leaves 4 of the 8 breadth-absent; all four are price-poor or per-area-only |
| E1b | projectType absent **with an exact total and an area** | **bi-19** | the only record with the shape. Without it `INV-19`, `D-1a`'s absent-type branch and `PB5` have no fixture (delta review §C) |
| E2 | price entirely missing | **bi-04, bi-06 (existing)** | no `pricePerArea`, no total → `pricing` absent. Do not price bi-06 even if bi-04 later gets the §19 total |
| E3 | area missing | bi-15 | `area` omitted |
| E4 | style missing | bi-18 | `keywords` and `style` both absent (facets.style absent, never `[]`) |
| E5 | similar area, clearly different price | bi-09 vs bi-10 (34평: 50M vs 85M) | both `derived`, same unit + basis, so PB3/PB3a-comparable. **The comparable pool is exactly {bi-09, bi-10, bi-11, bi-12} — six pairs — and nothing else.** bi-07 vs bi-11 was listed here through rev 4 and is **forbidden**: bi-07's perArea is `authored`, so by PA4 its price basis is unknown and PB3a permits the two amounts to be *displayed* but never compared or ordered |
| E6 | similar price, clearly different area | bi-09 vs bi-12 (50M @ 34평 vs 52M @ 26평) | both full_remodel, supply pyeong |
| E7 | price RANGE (`kind: "range"`) | bi-13 | 125,000,000–140,000,000; also tests D-1 condition 2 (no derivation) |
| E8 | area basis `exclusive` | bi-14 | 84 m2 exclusive; prose says 34평형 — the never-convert trap (AR5/PY1) |
| E9 | unit `m2` | bi-17 (supply) and bi-14 (exclusive) | bi-17 isolates the AR4 unit-conversion path; bi-14 shows basis blocks comparison regardless of unit |
| X1 | (extra) non-apartment `property.type` | bi-11 | villa |
| X2 | (extra) D-1 rounding on a non-integer division | bi-09 | 1,470,588.235… → 1,470,588 (RD1) |
| X3 | (extra) a stated **trade** exclusion that does NOT disqualify full_remodel | bi-09, bi-11 (창호 — a Works id, so PT4(b) does not fire) | the space-exclusion counterpart is bi-03/bi-05, which are breadth-**absent** under PT4(b), not full_remodel. If `workScopeIdsExcluded` (§17) is ever adopted, those two are the records to carry it |
| X4 | (extra) records without `customerQuote` | bi-10, bi-12, bi-15, bi-17, bi-19 (+ bi-05, bi-07, bi-08) | mirrors the existing mix |
| X5 | (extra) `PT4`(c)/`INV-29` negative case — whole-dwelling scope with **no Spaces id** | bi-19 | `[flooring, wallpaper, lighting]`: trades only, so `full_remodel` is unauthorable and `PT6` fires |
| X6 | (extra) `ST4` subtraction with a surviving `tag` | bi-19 | keywords `["화이트", "이사 전 공사"]` ⊋ style `["화이트"]` ⇒ `facets.tag = ["이사 전 공사"]`, `facets.style = ["화이트"]` |

### 4.1 Consultation queries the 19 records now answer (expected behaviour, not consumer design)

Restated against contract **rev 8**'s evaluation function (§14.3). V0.2 matches on **breadth, scope
and area** only. Prices are **stated as facts** under `GR1` and are never compared, never ranked and
never called a match — the budget machinery (`PB0`/`PB1`/`PB3`/`PB6`/`EF5`) is deferred to the
contract's §17.1 V0.3 annex; see `16-narrowing-decision.md`. Read "exact" below as `EF6`'s `exact`:
*every criterion the visitor stated was evaluated and satisfied*, where a criterion the visitor did
not state is `not_applicable` and can never keep a record out.

> **What changed from rev 7 (read this before the table).** Rev 7's expected answers decided
> several rows on a budget verdict. Those verdicts are gone, and they are not silently replaced by a
> weaker word: where a row used to say a record *fits the budget*, V0.2 says nothing about the
> budget at all and states the record's own price instead. Two rows below (B, F) are visibly worse
> answers than rev 7 promised. They are listed as worse on purpose — that is the cost of the
> narrowing, and `P` forbids hiding it from the visitor as much as from this table.

| # | visitor says | expected under V0.2 | why |
|---|---|---|---|
| A | "34평 전체 5천이면 되나요" | bi-09 **exact** (breadth full, 34평 area). Its 50,000,000 is stated as a fact. bi-01/bi-10 also exact (same area, full); bi-12 (26평) is an `area_fallback`. The answer must **not** say the 5천 예산이 맞다/모자라다 | breadth `EF3` + area `EF4`. The 5천 is a budget, and V0.2 has no rule that compares one; `GR1` still lets each record's own total be quoted |
| B | "예산 3천으로 전체 가능해요?" | breadth full is the **only** stated criterion — no area, no scope. Every `full_remodel` record qualifies as `exact` and is ordered by `GR3`, each with its own total stated. bi-11 (20평 빌라, 30,000,000) is **not** promoted for being near 3천 | **worse than rev 7.** Rev 7 used `PB1` to put bi-11 first. V0.2 cannot, so the visitor gets a breadth-matched list and reads the prices themselves |
| C | "주방만 하면 얼마예요" | bi-14 (15,000,000) exact; bi-16 (19,800,000, + 욕실 2곳) as **`scope_superset`** | §14.3.3 row 5: R_s = {kitchen, bathroom} ⊋ Q_s = {kitchen}. `scope_overlap` requires neither set to contain the other |
| D | "욕실 하나만" / "욕실 두 개" | bi-15 (7,000,000) / bi-16 (19,800,000, kitchen included) — the count is only in titles; bi-04 is unpriced and is **not** ranked below the others for it | `WS3`. A missing price is not a penalty because no criterion reads price at all |
| E | "전용 84 아파트 주방" | bi-14 — but "34평 주방" must NOT be told bi-14 is a 34평 flat | `AR5`/`PY1` |
| F | "50평 전체 1억 넘나요" | bi-13's total is stated as its authored **range**, never as a per-평 figure, and the answer must not resolve the 넘나요 into a yes/no verdict against 1억. bi-08 (51평) is a projectType-absent reference | **worse than rev 7.** D-1 cond. 2 still bans the quotient; the yes/no now also goes, because answering it is a price comparison |
| G | "32평인데 도배랑 바닥만 얼마예요" | bi-19, reached on **`GR3`'s trade rung** (`R_t ⊇ Q_t`, breadth absent). Its 11,000,000 is **stated as a fact** (`GR1`). The answer must not say 343,750원/평, and must not call the job a 전체 or 부분 리모델링 | §14.3.3.1's accepted limitation: a whole-dwelling trades-only job is breadth-absent by construction. `GR5a` lets the total be quoted; `INV-19`/`D-1a` keep the quotient out. Rev 7 added "and explicitly not a budget match (`PB5`)" here; in V0.2 that sentence is unnecessary, because **no** record is ever a budget match |
| H | "바닥이랑 거실만" | bi-17 (12,500,000); m² area shown as authored (or converted for display only) | `AR3`/`AR4` |
| I | "현관 수납" | bi-18 (6,200,000); bi-06 is unpriced and is returned on equal footing | **Assumes the consumer's `WS6` alias table maps 수납 → `built_in_furniture`**, which is the mapping rev 6's `WS9` authors to. If a consumer maps 수납 → `storage` instead, Q_s = {entrance} and Q_t = {storage}: §14.3.3 **row 4** (`R_s == Q_s`, `Q_t ⊄ R_t`) ⇒ `scope_subset`. `WS6` is the consumer's to define; this expected answer names which definition it assumes. Rev 7 ended this row with "budget **refused**" — there is no budget verdict to refuse now |

**Rows that no longer exist.** Rev 7 had no row whose *only* content was a budget verdict, so no row
was deleted outright; rows A, B, F and I each lost a budget clause, and B and F lost the part of the
answer that made them good. That is recorded here rather than in a changelog because the next
reviewer's job is to check the degradation is stated, not that it was avoided.

---

## 5. Cover assets — every reused id and its original record

Reuse is allowed (the registry has no uniqueness constraint) and every new cover below is a **shared photo**: the same jpg already appears in another record's gallery. Nobody should read a new record's cover as a photograph of a distinct job. The new covers deliberately avoid the eight existing cover images so listing cards do not repeat side by side.

| new record | cover asset | original record | original use |
|---|---|---|---|
| bi-09 | `bi01-living-02` | bi-01 | gallery 거실 #2 |
| bi-10 | `bi08-dining-01` | bi-08 | gallery 다이닝 |
| bi-11 | `bi07-kitchen-01` | bi-07 | gallery 주방 |
| bi-12 | `bi05-dining-01` | bi-05 | gallery 주방·다이닝 |
| bi-13 | `bi03-kitchen-01` | bi-03 | gallery 주방·팬트리 |
| bi-14 | `bi01-kitchen-01` | bi-01 | gallery 주방 #1 |
| bi-15 | `bi07-bathroom-01` | bi-07 | gallery 욕실 |
| bi-16 | `bi01-kitchen-02` | bi-01 | gallery 주방 #2 |
| bi-17 | `bi06-living-01` | bi-06 | gallery 거실 #1 |
| bi-18 | `bi03-entrance-01` | bi-03 | gallery 현관 |
| bi-19 | `bi01-hallway-01` | bi-01 | gallery 복도·수납 |

### 5.1 The 52 registered asset ids and who uses them today

| owner | ids (count) |
|---|---|
| bi-01 | bi01-bathroom-01, bi01-bathroom-02, bi01-bedroom-01, bi01-bedroom-02, bi01-entrance-01, bi01-entrance-02, bi01-hallway-01, bi01-kitchen-01, bi01-kitchen-02, bi01-kitchen-03, bi01-living-01 (cover), bi01-living-02, bi01-living-03 (13) |
| bi-02 | bi02-bathroom-01, bi02-bedroom-01, bi02-dining-01, bi02-living-01 (cover) (4) |
| bi-03 | bi03-dress-01, bi03-entrance-01, bi03-kids-01, bi03-kitchen-01, bi03-living-01 (cover) (5) |
| bi-04 | bi04-bathroom-01, bi04-bathroom-01-before, bi04-bathroom-02, bi04-kitchen-01 (cover), bi04-kitchen-01-before, bi04-kitchen-02 (6) |
| bi-05 | bi05-balcony-01, bi05-bedroom-01, bi05-dining-01, bi05-living-01 (cover) (4) |
| bi-06 | bi06-entrance-01 (cover), bi06-hallway-01, bi06-living-01, bi06-living-02 (4) |
| bi-07 | bi07-bathroom-01, bi07-bedroom-01, bi07-kitchen-01, bi07-living-01 (cover) (4) |
| bi-08 | bi08-bedroom-01, bi08-dining-01, bi08-living-01 (cover), bi08-study-01 (4) |
| site / template (not a project) | logo, site-band, site-hero-01, site-hero-02, site-hero-03, site-intro, site-portfolio-hero, site-reviews (8) |

44 project photos + 8 site assets = 52. No new asset is required by this spec.

---

## 6. Constraints honoured / not done

- No code written; no repo file other than this one touched. `projects.json`, `categories.json`, `registry.json`, `schema.ts` unchanged.
- No awards, licences, certifications, real names, street addresses, or "real completed job" claims. Quotes are fixture text under `origin: "synthetic-fixture"`, exactly like the five existing quotes; attribution follows the existing "구 · 가구" pattern.
- Prices never appear in prose; every structured price is the only price (GR1).
- Authored `pricePerArea` is never combined with a total on the same record, so the derived value wins wherever a derivation is expected and there is no authored-vs-derived ambiguity (PA1 is exercised by the existing 8 only; bi-19's §2 DECISION records why bi-08 could not stand in for it).
- **Consequence: INV-21 ("an authored perArea is never replaced by a derived one") has no fixture, and that is a deliberate choice, unlike INV-19's.** bi-19 was promoted precisely because INV-19 had none — so the difference needs saying. INV-21 is not decidable from the emitted document at all (a correct authored value and a wrongly-replaced one are byte-identical), so a fixture record could not assert it either way; it is enforced structurally at the emitter, where the authored branch short-circuits before any derivation, and asserted on a crafted snapshot (`07-producer-implementation.md` §5.3, test A6). A demo record carrying full_remodel + authored perArea + exact total would exercise D-1 condition 4 in the golden package, which is worth having — but it buys a weaker guarantee than A6 already provides, at the cost of a record whose two prices disagree by construction. Deferred, not overlooked.
- Not done here, on purpose: authoring `projectType` / `propertyType` / `workScopeIds` / `style` for bi-01 … bi-08; giving bi-04 the §19 worked-example total (a separate decision — review 03 M-6 notes that the data and §19 currently disagree); the `ProjectSchema` extension (§0.1).

---

## Appendix A — *(retired in rev 2)*

Rev 1 offered `bi-19` here as an **optional** 11th fixture. The rev-2 delta review of the contract
found that this leaves `INV-19` — the machine check behind OD-K, *"the single most important
prohibition in V0.2"* — together with `D-1a`'s absent-type branch and `PB5` with **no fixture at
all**, because `bi-08` is breadth-absent but carries an authored *per-area* price and no total.

`bi-19` is therefore a **required** record and now lives in §2, with its full body and the rejected
no-new-record alternative recorded there. The set is 11 new records, 19 total.
