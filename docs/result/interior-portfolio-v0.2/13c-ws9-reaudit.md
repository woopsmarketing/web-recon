# 13c — WS9 (rev 6, three-part) re-audit of the 19 demo records

| | |
|---|---|
| date | 2026-09-24 |
| status | READ-ONLY AUDIT. No file other than this one written. Nothing in `04-demo-data-spec.md`, the contract, or any data file was edited. |
| scope | contract `docs/reports/integration/07-integration-contract-v0.2-candidate.md` §7.4 `WS9` (three-part, rev 6) + §7.3 gloss + §15 `INV-28`/`INV-29`/`INV-30`, applied to the 19 records described in `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` |
| method | every currently-authored SPACES id was checked against its own record's Korean body for a sentence describing a change to *that space itself* (layout, fixtures, built-in elements) as opposed to (b) a trade running through it or (c) joinery merely standing in it (unless §7.3's gloss for that space names the joinery, per the rev-6 exception). Ids are stripped only when their sole justification fails that test; ids with no body sentence at all are left, flagged, not stripped. |

**Scope note, stated up front.** `04` §0.2 and the contract's own `bi-01`…`bi-08` authoring-pass language (`07:1417`, `13-delta-review-rev6.md:508`) both say `workScopeIds` for `bi-01`…`bi-08` is **not yet authored** — it is an explicit prerequisite work item, not part of `04`. This was independently confirmed against the live data: `data/sites/boost-interior-demo/content/projects.json` contains zero occurrences of `workScopeIds` for any of the 8. There are therefore no SPACES/WORKS ids on `bi-01`…`bi-08` for a `WS9` re-audit to strip or keep — the audit is applied to the 11 records that **are** fully authored (`bi-09`…`bi-19`), and the 8 are logged as out-of-scope so the sweep is still visibly complete over all 19.

---

## Summary table

| record | ids today | ids proposed | changed? | why |
|---|---|---|---|---|
| bi-01 | *(not authored in `04`/data)* | — | n/a | `workScopeIds` authoring pass not done yet (§0.2) |
| bi-02 | *(not authored)* | — | n/a | same |
| bi-03 | *(not authored)* | — | n/a | same |
| bi-04 | *(not authored)* | — | n/a | same |
| bi-05 | *(not authored)* | — | n/a | same |
| bi-06 | *(not authored)* | — | n/a | same |
| bi-07 | *(not authored)* | — | n/a | same |
| bi-08 | *(not authored)* | — | n/a | same |
| bi-09 | entrance, living_room, kitchen, bedroom, bathroom, flooring, wallpaper, lighting | entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture | **YES** | `living_room` never named in body (trade-through only); `bedroom` justified only by joinery (built-in wardrobe), gloss doesn't name it → both stripped; `built_in_furniture` added (joinery was never given its own trade id) |
| bi-10 | entrance, living_room, kitchen, bedroom, dressing_room, bathroom, windows, expansion, built_in_furniture | *(same)* | no | all 6 spaces independently justified (entrance/bedroom's joinery is superseded by expansion + gloss-named items); `dressing_room` flagged ambiguous, left |
| bi-11 | living_room, kitchen, bedroom, bathroom, flooring, wallpaper, doors | kitchen, bathroom, flooring, wallpaper, doors | **YES** | `living_room` never named in body (trade-through only); `bedroom` explicitly kept its EXISTING wardrobe (no joinery, no fixture change at all) → both stripped; no WORKS addition needed |
| bi-12 | entrance, living_room, dining, kitchen, bedroom, bathroom, flooring, lighting, built_in_furniture | entrance, kitchen, bathroom, flooring, lighting, built_in_furniture | **YES** | `living_room` and `bedroom` justified only by joinery (built-in storage), gloss doesn't name either; `dining` justified only by a new pendant light (WS9(b)'s literal "new ceiling light" example) → all three stripped; no WORKS addition needed (`built_in_furniture`/`lighting` already present) |
| bi-13 | entrance, living_room, dining, kitchen, pantry, bedroom, kids_room, dressing_room, study, bathroom, windows, lighting | entrance, living_room, dining, kitchen, kids_room, study, dressing_room, bathroom, windows, lighting, built_in_furniture | **YES** | `pantry` justified only by a joinery cabinet standing inside the *kitchen* (no separate pantry room described) → stripped, `built_in_furniture` added; `bedroom` (안방 itself) has no justifying sentence at all — only its neighbour room and its bathroom are described → stripped; `entrance`/`kids_room` have no body sentence either way → left, flagged |
| bi-14 | kitchen | *(same)* | no | kitchen fixtures directly replaced |
| bi-15 | bathroom | *(same)* | no | bathroom fixtures directly replaced |
| bi-16 | kitchen, bathroom | *(same)* | no | both spaces' own fixtures directly replaced |
| bi-17 | living_room, flooring | *(same)* | no | living_room's own wall finish (TV wall panelling) changed, not just a trade passing through |
| bi-18 | entrance, built_in_furniture | *(same)* | no | entrance justified by 중문+신발장, both named in entrance's own gloss (WS9(c) exception); hallway correctly excluded (joinery only); this record is the contract's own worked illustration of WS9(c) |
| bi-19 | flooring, wallpaper, lighting (no spaces) | *(same)* | no | deliberately zero SPACES ids — the record's own body explicitly says "구조는 건드리지 않았고" and every space-touching item is a trade run through it; this is the intended `INV-29` negative fixture |

---

## Changed records

### bi-09 — 달서 34평 아파트 실속형 전체 리모델링

Body (3 sentences, quoted in full for traceability):

> "공급면적 34평 아파트를 전체 리모델링한 사례입니다. 처음 상담에서 예산 상한이 분명했기 때문에, 어디에 돈을 쓰고 어디를 남길지 먼저 정했습니다. 창호는 상태가 괜찮아 교체하지 않았고, 구조 변경이나 확장도 하지 않았습니다. 대신 눈에 가장 많이 닿는 바닥, 벽, 문, 조명은 집 전체에서 빠짐없이 새로 했습니다."
> "바닥은 밝은 오크 톤 강마루로 전체를 깔고, 벽과 천장은 화이트 도배로 통일했습니다. 문과 몰딩은 벽과 같은 색으로 칠해 면이 끊기지 않게 했습니다. 주방은 배치를 유지한 채 상하부장과 상판, 타일을 교체했고, 욕실은 타일과 도기, 수전을 새로 넣었습니다."
> "현관에는 천장까지 닿는 신발장을, 안방에는 붙박이장을 두었습니다. 화려한 연출보다 오래 봐도 질리지 않는 바탕을 만드는 데 집중한 사례입니다."

**Kept**
- `entrance` — "현관에는 천장까지 닿는 신발장을 ... 두었습니다" (a ceiling-height shoe cabinet at the entrance). §7.3's `entrance` gloss names "shoe storage at the entrance" directly — WS9(c)'s exception applies. Stays.
- `kitchen` — "주방은 배치를 유지한 채 상하부장과 상판, 타일을 교체했고" (kitchen's own cabinets, countertop and tile replaced). Fixtures changed → WS9(a). Stays.
- `bathroom` — "욕실은 타일과 도기, 수전을 새로 넣었습니다" (bathroom tile, fixtures and faucet replaced). Fixtures changed → WS9(a). Stays.

**Stripped**
- `living_room` — 거실 is **never named anywhere in the body**. Its only coverage is "바닥, 벽, 문, 조명은 집 전체에서 빠짐없이 새로 했습니다" (floor/wall/door/light redone across the whole flat) — a trade run through the space, WS9(b). No sentence describes any layout, fixture or built-in change to the living room itself. **Strip.**
- `bedroom` — sole justification is "안방에는 붙박이장을 두었습니다" (a built-in wardrobe placed in the master bedroom) — joinery standing in the space. `bedroom`'s own §7.3 gloss ("침실, 안방 and other bedrooms for adults") does not name joinery, so WS9(c)'s exception does not apply. No other sentence describes any other change to 안방. **Strip.**

**WORKS added**
- `built_in_furniture` — the same "안방에는 붙박이장을 두었습니다" sentence describes a genuine joinery job that the record never captured as its own trade id (the id list before this audit had no `built_in_furniture` at all). Adding it keeps the fact on the record once the space id it used to be smuggled in on is removed.

Proposed: `entrance, kitchen, bathroom, flooring, wallpaper, lighting, built_in_furniture`

---

### bi-11 — 20평 구축 빌라 전체 리모델링

Body:

> "지은 지 30년 가까이 된 20평 빌라입니다. 체리색 문과 몰딩, 낡은 장판과 주방이 그대로 남아 있었습니다. 예산이 넉넉하지 않아 창호는 그대로 두고, 그 외 실내 마감은 전부 새로 하는 범위로 정했습니다."
> "바닥은 장판을 걷어내고 밝은 강마루를 깔았습니다. 벽과 천장은 화이트로 도배하고, 문과 문틀은 필름으로 화이트에 맞췄습니다. 주방은 일자형 싱크대를 교체하고 타일을 새로 붙였으며, 욕실은 방수 후 타일과 도기를 전부 바꿨습니다."
> "침실에는 붙박이장 대신 기존 옷장을 쓰기로 해 비용을 아꼈습니다. 작은 집이라 색을 화이트와 오크 두 가지로만 제한해 공간이 넓어 보이게 했습니다."

**Kept**
- `kitchen` — "주방은 일자형 싱크대를 교체하고 타일을 새로 붙였으며" (kitchen's sink unit replaced, tile relaid). WS9(a). Stays.
- `bathroom` — "욕실은 방수 후 타일과 도기를 전부 바꿨습니다" (waterproofed, then tile and fixtures entirely replaced). WS9(a). Stays.

**Stripped**
- `living_room` — 거실 is never named in the body. Coverage is only the general "실내 마감은 전부 새로 하는 범위" (all interior finishes redone) plus the named trades (flooring/wallpaper/doors reaching every room) — WS9(b). **Strip.**
- `bedroom` — "침실에는 붙박이장 대신 기존 옷장을 쓰기로 해 비용을 아꼈습니다" (the bedroom kept its **existing** wardrobe instead of a built-in one, to save cost). This sentence affirmatively states no joinery, fixture or layout change happened in the bedroom at all — the strongest possible disqualification in the set (not even a WS9(c) joinery case, since no joinery occurred). **Strip.**

**WORKS added:** none. No joinery occurred, and `flooring`/`wallpaper`/`doors` already carry the whole-flat trades that reached both stripped spaces.

Proposed: `kitchen, bathroom, flooring, wallpaper, doors`

---

### bi-12 — 26평 웜 우드 아파트 전체 리모델링

Body:

> "26평 아파트에 두 분이 살면서 취미 물건이 많아 늘 어수선했던 집입니다. 가구를 줄이는 대신 현관, 거실, 침실에 붙박이 수납을 짜 넣고, 남는 자리에 꼭 필요한 가구만 두는 순서로 계획했습니다."
> "바닥은 밝은 오크 마루, 벽은 노란 기가 살짝 도는 웜 화이트로 맞췄습니다. 주방은 일자형을 유지하면서 상판과 타일을 바꾸고, 식탁 위에는 라탄 펜던트를 달아 다이닝 자리를 만들었습니다. 조명 회로는 메인등과 간접등으로 나눴습니다."
> "욕실은 방수부터 다시 하고 밝은 베이지 타일로 마감했습니다. 확장이나 창호 교체 없이 마감과 수납 위주로 진행한 사례입니다."

**Kept**
- `entrance` — "현관, 거실, 침실에 붙박이 수납을 짜 넣고" (built-in storage installed at the entrance, living room and bedroom). `entrance`'s gloss names "shoe storage at the entrance"; entrance built-in storage in a Korean apartment is conventionally shoe storage, so the more-specific gloss exception is read to apply. Stays — **flagged lower-confidence** than `bi-09`'s (which said 신발장 explicitly rather than the generic 수납).
- `kitchen` — "주방은 일자형을 유지하면서 상판과 타일을 바꾸고" (kitchen kept its layout, but countertop and tile replaced). WS9(a). Stays.
- `bathroom` — "욕실은 방수부터 다시 하고 밝은 베이지 타일로 마감했습니다" (bathroom redone from waterproofing, finished in tile). WS9(a). Stays.

**Stripped**
- `living_room` — sole mention is the same "현관, 거실, 침실에 붙박이 수납을 짜 넣고" — joinery only; `living_room`'s gloss does not name it, and no other sentence describes any change to 거실. **Strip.**
- `dining` — sole mention: "식탁 위에는 라탄 펜던트를 달아 다이닝 자리를 만들었습니다" (hung a rattan pendant light over the dining table to create a dining spot). This is WS9(b)'s own literal example — "a new ceiling light" — authored as the trade (`lighting`) alone. No layout, partition or other built-in element is described for the dining area. **Strip.**
- `bedroom` — sole mention is the same "현관, 거실, 침실에 붙박이 수납을 짜 넣고" — joinery only; `bedroom`'s gloss does not name it. **Strip.**

**WORKS added:** none. `built_in_furniture` (the entrance/living-room/bedroom joinery) and `lighting` (the pendant) were already authored on this record before this audit.

Proposed: `entrance, kitchen, bathroom, flooring, lighting, built_in_furniture`

---

### bi-13 — 48평 대형 아파트 전체 리모델링

Body:

> "2005년에 지어진 48평 아파트입니다. 방이 넷인 구조를 유지하되 한 방은 서재로, 안방 옆 방은 드레스룸으로 용도를 바꿨습니다. 창호는 전체를 교체하고, 거실과 주방 사이 벽을 일부 열어 다이닝을 넓혔습니다."
> "톤은 차분한 그레이지에 월넛 가구를 더해 무게를 잡았습니다. 거실 우물천장에는 간접조명과 슬림 트랙 조명을 함께 넣었고, 주방은 아일랜드를 두고 뒤쪽에 키큰 팬트리 수납장을 짜 넣었습니다. 욕실 두 곳은 모두 방수부터 다시 하고, 안방 욕실에는 욕조를 유지했습니다."
> "면적이 넓고 창호와 설비가 포함되어 공사 기간은 열 주가 걸렸습니다. 마감재와 가구 사양에 따라 견적 폭이 있었던 사례라, 상담 시에는 참고 범위로 안내드리고 있습니다."

**Kept**
- `living_room` — "거실과 주방 사이 벽을 일부 열어 다이닝을 넓혔습니다" (part of the wall between the living room and kitchen was opened to enlarge the dining area). A structural change to living_room's own layout. WS9(a). Stays.
- `dining` — same sentence: dining's own footprint was enlarged by removing part of a dividing wall. WS9(a). Stays.
- `kitchen` — "주방은 아일랜드를 두고" (an island was added to the kitchen). Layout change. Stays.
- `study` — "한 방은 서재로 ... 용도를 바꿨습니다" (one room's use was changed to a study). A defined space conversion. WS9(a). Stays.
- `dressing_room` — "안방 옆 방은 드레스룸으로 용도를 바꿨습니다" (**the room next to** the master bedroom had its use changed to a dressing room). A genuine separate-room conversion, matching §7.3's gloss ("a separate wardrobe room") exactly. Stays — and is the clean contrast case against `bi-10`'s ambiguous phrasing (below).
- `bathroom` — "욕실 두 곳은 모두 방수부터 다시 하고" (both bathrooms redone from waterproofing). WS9(a). Stays.
- `entrance` — **no sentence in the body names 현관 at all** (it appears only in the record's own display `scope` field, not in prose). Cannot verify either way from the text. **Left, flagged** per "if you cannot tell from the text, say so and leave the id."
- `kids_room` — same: 아이방 is never mentioned in the body (only in `scope`). **Left, flagged.**

**Stripped**
- `pantry` — sole mention: "뒤쪽에 키큰 팬트리 수납장을 짜 넣었습니다" (a tall pantry-style cabinet was built into the back [of the kitchen island]). This describes a cabinet — joinery — standing **inside the kitchen**; §7.3's `pantry` gloss requires "a separate food-store room," and nothing in the body establishes that a physically separate pantry room exists. This is WS9(c)'s general rule (joinery in the space it stands in — here, the kitchen — does not remodel a different, undescribed space), and no gloss names this joinery under `pantry` the way `entrance`'s gloss names shoe storage. **Strip.**
- `bedroom` — no sentence describes 안방 (the master bedroom) itself changing. The only two 안방-adjacent mentions are "안방 옆 방은 드레스룸으로" (the room **next to** it, not it) and "안방 욕실에는 욕조를 유지했습니다" (the master **bathroom** kept its tub — about the bathroom, not the bedroom). No layout, fixture or built-in change to the master bedroom itself is described anywhere in the body. **Strip.**

**WORKS added**
- `built_in_furniture` — justified by the same "뒤쪽에 키큰 팬트리 수납장을 짜 넣었습니다" sentence that disqualifies `pantry`: the joinery is real and should still be on the record as a trade id once its (mis-attributed) space id is removed.

Proposed: `entrance, living_room, dining, kitchen, kids_room, study, dressing_room, bathroom, windows, lighting, built_in_furniture`

---

## Consequences

### 1. `INV-29` (`full_remodel` ⇒ `workScopeIds` contains ≥1 Spaces id)

All four changed records are `full_remodel`. None loses its last Spaces id:

| record | Spaces ids remaining after strip |
|---|---|
| bi-09 | entrance, kitchen, bathroom |
| bi-11 | kitchen, bathroom |
| bi-12 | entrance, kitchen, bathroom |
| bi-13 | living_room, dining, kitchen, study, dressing_room, bathroom (+ entrance, kids_room left) |

`INV-29` **continues to hold** for every changed record. No record is pushed to breadth-unauthorable / `PT6` by this pass.

### 2. `INV-30` (`partial_remodel` ⇒ `workScopeIds` contains ≥1 Spaces id)

None of the four changed records is `partial_remodel` — all are `full_remodel`, so `INV-30` is not directly exercised by these edits. Every `partial_remodel` record (`bi-14` kitchen, `bi-15` bathroom, `bi-16` kitchen+bathroom, `bi-17` living_room, `bi-18` entrance) is unchanged by this audit and individually still satisfies `INV-30`.

### 3. `INV-28` (`partial_remodel` ⇒ `workScopeIds` present and non-empty)

Not triggered either — same reasoning as `INV-30`. No `partial_remodel` record's `workScopeIds` changed. (For completeness: every changed `full_remodel` record's `workScopeIds` also remains non-empty after the edits — `WS7c` is satisfied throughout.)

### 4. `04` §4's id-inventory line (line 629) — recomputed

**Before (as currently published, 17 of 26 used):**
`entrance, living_room, dining, kitchen, pantry, bedroom, kids_room, dressing_room, study, bathroom, flooring, wallpaper, lighting, windows, doors, expansion, built_in_furniture`
Not used (9): `storage, hallway, balcony, utility, tiling, painting, plumbing, electrical, demolition`

**After the proposed re-audit (16 of 26 used):**
`entrance, living_room, dining, kitchen, bedroom, kids_room, dressing_room, study, bathroom, flooring, wallpaper, lighting, windows, doors, expansion, built_in_furniture`
Not used (10): `storage, hallway, balcony, utility, tiling, painting, plumbing, electrical, demolition, pantry`

Only **`pantry`** moves from used to unused. It was authored on exactly one record, `bi-13`, and this audit strips it there (its sole justifying sentence describes joinery inside the kitchen, re-captured as `built_in_furniture`, which was already in the "used" list). No other id drops out: `living_room`, `bedroom` and `dining` are each stripped from at least one record but remain authored on at least one other (`bi-10`/`bi-13`/`bi-17` for `living_room`; `bi-10` for `bedroom`; `bi-13` for `dining`), so the document-level `workScopes` array still needs to declare them (`WS2`). A grep of the rest of `07` and `04` for `pantry` turns up only its own gloss row and `bi-13`'s two citations — no worked example, `CINV`, or other fixture depends on it, so the drop is isolated.

### 5. `04` §4.1 — affected rows

**None of the sample-query rows change their expected answer.** Reasoning:

- The four changed records appear in §4.1 only through **whole-home budget queries** ("34평 전체 5천이면 되나요", "예산 3천으로 전체 가능해요?", "50평 전체 1억 넘나요") where the visitor never names a specific space (`Q_s = ∅`). Under `EF3`/`PT4`(b) the spaces criterion is evaluated on **breadth**, not on the specific id list, for these rows — so as long as the record keeps `full_remodel` status (confirmed above, `INV-29` holds), which specific Spaces ids it carries is invisible to those rows' outcomes.
- The one place in the contract that **does** cite a specific Spaces id on a changed record — `CINV-13`(b) / `07:897`, "주방 포함 34평 전체" on `bi-09`, resting on `bi-09`'s ids "already contain[ing] `kitchen` and `bathroom`" — is unaffected, because this audit did not touch `kitchen` or `bathroom` on `bi-09`; only `living_room` and `bedroom` were stripped.
- No §4.1 row names `living_room`, `bedroom`, `dining`, or `pantry` specifically for `bi-09`, `bi-11`, `bi-12` or `bi-13`.

So §4.1 is **unchanged**, row for row.

---

## No change

Checked, currently correct, left as authored:

- **bi-01 … bi-08** — `workScopeIds` not yet authored in `04` (explicitly deferred, §0.2) and confirmed absent in `data/sites/boost-interior-demo/content/projects.json` (0 matches) — nothing to re-audit yet.
- **bi-10** — `entrance`, `living_room`, `kitchen`, `bedroom`, `dressing_room`, `bathroom` all independently justified (거실/안방 발코니 확장 = a genuine layout change covering both `living_room` and `bedroom`; 3연동 중문+신발장 for `entrance` under the gloss exception; ㄷ자 주방 개조 and 방수 재시공 for `kitchen`/`bathroom`); `dressing_room` ("안방 한쪽에는 드레스룸을 새로 짜 넣었습니다") is genuinely ambiguous between "built a separate room" and "fitted a wardrobe zone inside the existing bedroom" — left per the conservative rule, flagged for a human read; `hallway` is correctly **not** authored despite "거실과 복도 벽면 수납장" (hallway joinery only, correctly folded into `built_in_furniture` instead, per rev-4/rev-5 fix already on record).
- **bi-14** — `kitchen` justified extensively (상부장/상판/타일/후드/싱크볼 replaced). No other space mentioned.
- **bi-15** — `bathroom` justified extensively (전체 철거, 방수, 타일, 세면대, 파티션). No other space mentioned.
- **bi-16** — `kitchen` (상하부장/상판/타일/수전 교체) and `bathroom` (덧방 타일 재시공, 파티션/욕조) both justified by direct fixture change.
- **bi-17** — `living_room` justified by its own wall finish changing ("거실 TV 벽은 세로 템바보드로 마감"), not merely by the `flooring` trade passing through. (Minor incidental note, not a WS9 finding: "벽지는 거실만 새로" describes a living-room-specific wallpaper job with no `wallpaper` id authored — consistent with the same restraint already on record for `bi-14`/`bi-16`'s omitted tile/counter trades, §3 of `04`, so not flagged as a WS9 violation.)
- **bi-18** — `entrance` (3연동 중문 + 천장까지 신발장, both named in `entrance`'s gloss) and `built_in_furniture` (복도 붙박이장, correctly **not** promoted to `hallway` since nothing else about the hallway itself changed) — this record is the contract's own worked illustration of WS9(c) and is correctly authored already.
- **bi-19** — deliberately zero Spaces ids; the body explicitly states "구조는 건드리지 않았고" (structure untouched) and every item (바닥/도배/조명) is a trade run through the whole flat. This is the intended `INV-29` negative fixture and is unaffected by the rev-6 amendment.

All 19 records accounted for: 4 changed (`bi-09`, `bi-11`, `bi-12`, `bi-13`), 7 checked and correct as authored (`bi-10`, `bi-14`–`bi-19`), 8 not yet authored and out of scope (`bi-01`–`bi-08`).
