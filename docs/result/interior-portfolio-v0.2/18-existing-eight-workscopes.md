# 18 — `workScopeIds` and `projectType` for the existing eight (`bi-01` … `bi-08`)

| | |
|---|---|
| date | 2026-09-24 |
| status | SPEC. This file is the only thing written. No data file, no contract, no sibling spec, no schema and no test was edited, and no git command was run. |
| scope | authoring pass over the **eight original records** in `data/sites/boost-interior-demo/content/projects.json`, against contract `docs/reports/integration/07-integration-contract-v0.2-candidate.md` **rev 8** §7.3 / §7.4 (`WS1`–`WS9`), §5 (`PT1`–`PT6`), §13 and §15 (`INV-28`/`INV-29`/`INV-30`) |
| closes | `04-demo-data-spec.md` §0.2's *"Authoring `workScopeIds` for bi-01 … bi-08 is a hard prerequisite, not an optional pass"*, and `16b-rev8-disposition.md` `m7-7` (`INV-28`/`INV-29`/`INV-30` unverifiable on `bi-01`, `bi-04`, `bi-06`, `bi-07`) |
| inputs read | `projects.json` (the 8 records, in full), contract §5 §7 §13 §14.3.2–§14.3.3.1 §14.3.6 §15, `04-demo-data-spec.md` §0 §1 §2 §3 §4 §4.1, `13c-ws9-reaudit.md`, `platform/content/schema.ts` |
| not in scope | `propertyType` (§13 and `04` §0.2 already fix `apartment` for all 8), `styles`, `totalPrice`, the `bi-04` §19 total, and writing any of this into `data/` |

**Result in one line: all eight are authorable.** Eight non-empty `workScopeIds` sets, eight
`projectType` decisions, **no disagreement with contract §13** on any of the eight. The pass adds
exactly **one** previously-unused id to the corpus (`painting`, from `bi-05`), taking the 19-record
inventory from **16 used / 10 unused** to **17 used / 9 unused**.

---

## 0. Two things established before authoring

### 0.1 `ProjectSchema` already has the V0.2 fields — `04` §0.1 is now out of date

`04-demo-data-spec.md` §0.1 says *"`ProjectSchema` is `.strict()` and has none of the V0.2 authored
fields"* and calls the schema extension a prerequisite work item. **That is no longer true of the
working tree.** `platform/content/schema.ts` (lines 274–377) now carries, on `ProjectSchema` itself:

| field | shape as implemented | matches the provisional name in `04` §0.1? |
|---|---|---|
| `projectType` | `z.enum(PROJECT_TYPES).optional()` | yes |
| `propertyType` | `z.enum(PROPERTY_TYPES).optional()` | yes |
| `workScopeIds` | `z.array(z.enum(WORK_SCOPE_IDS)).min(1).max(26)` + uniqueness refinement, optional | yes — `.min(1)` is `WS5`, the refinement is `WS3` |
| `totalPrice` | `TotalPriceSchema.optional()` | yes |
| `styles` | `z.array(ShortText(32)).max(12)` + uniqueness, optional | **`styles`**, not `04`'s provisional `style` |

`WORK_SCOPE_SPACE_IDS` (14) and `WORK_SCOPE_WORK_IDS` (12) are exported separately and their union,
in §7.3's order, is `WORK_SCOPE_IDS` (26) — so the Spaces/Works split `INV-29` and `INV-30` rest on
is machine-readable. I verified both lists against §7.3's two tables id-for-id: **they agree
exactly**, in the same order.

Two observations, reported and **not acted on** (this file changes no code):

1. **`INV-30` is implemented nowhere.** `ProjectSchema`'s `superRefine` (schema.ts:364–376)
   enforces `INV-28` (`partial_remodel` ⇒ non-empty) and `INV-29` (`full_remodel` ⇒ ≥1 Spaces id),
   and `platform/integration/validate.ts:299–309` mirrors both on the emitted document. Neither
   enforces `INV-30` (`partial_remodel` ⇒ ≥1 **Spaces** id). A trades-only `partial_remodel` — the
   exact shape `PT5`'s new sentence and §14.3.3.1's row 1 exist to make impossible — is accepted by
   both today. `16b-rev8-disposition.md` §143 already records this as open; this pass confirms it
   independently and neither of the two records I author as `partial_remodel` depends on it.
2. The content-side field is **`styles`**, plural. `04` §0.1's table says `style`. Anyone applying
   `04` literally will write the wrong key into a `.strict()` object. Cosmetic, but it will fail a
   build.

`projects.json` itself carries **none** of the five fields on any of the eight records (grep: zero
matches). So this pass is purely additive; nothing is being overwritten.

### 0.2 The evidence policy, stated before it is used

`WS9` binds the author, and the author here is this document. Three decisions govern every row
below, and they are stated up front so that the rejections can be checked against them rather than
argued case by case.

- **E1 — prose licenses, `scope` does not.** The record's `scope` array is the site's Korean
  **display** text (schema.ts:267–272: *"DISPLAY text … NOT the structured work scope"*), and `04`
  §0.2 makes the divergence between the two lists the corpus's headline `WS4` fixture. A space
  appearing in `scope` establishes that the job **reached** that space. It does not establish that
  the space itself was remodelled, which is what `WS9`(a) asks. So `scope` membership never
  licenses a Spaces id on its own; it is recorded as corroboration and, where prose is silent, as
  an open question in §6.
- **E2 — `alt` text describes a photograph, not a work item.** Cover and gallery `alt` strings say
  what is visible in an image. `04` §2's own convention for the eleven new records — *"cover `alt`
  describes the **photo** as its original record described it, **not** the fictional job"* —
  decouples alt text from the work by construction in this corpus, and eight of the eleven new
  covers are other records' photos. Alt text therefore corroborates a prose sentence and never
  licenses an id by itself. This is the single costliest rule in the pass (it is what withholds
  `bathroom` from `bi-02` and `bi-07`), and every id it blocks is listed in §6.
- **E3 — where a mapping needs judgement, omit (`WS1`), and say what was omitted.** Applied to
  wall finishes whose trade is unnamed (`bi-01`), to maintenance-level items (`bi-05`'s 수전), and
  to a floor that is implied but not stated (`bi-06`).

`WS9`'s three parts are used below with `13c-ws9-reaudit.md`'s labels:

- **`WS9`(a)** — author a Spaces id only when that space itself was remodelled: its layout, its
  fixtures or its **built-in elements** changed.
- **`WS9`(b)** — a trade run *through* a space (new flooring, new wallpaper, a new ceiling light)
  is authored as the **trade id alone**. Styling that does not alter a space — furniture placement,
  curtains, art — is not a work scope at all.
- **`WS9`(c)** — installing joinery is not by itself a remodel of the space it stands in, **except
  where §7.3's gloss for that space names the joinery itself**, which is the more specific rule and
  wins (`entrance` = *"현관, 중문, shoe storage at the entrance"*; `kitchen` = *"주방, sink and
  counter run, 주방 storage"*). A 복도 붙박이장 is `built_in_furniture` and **not** `hallway`.

---

## 1. Result

Ids are written in §7.3 table order (Spaces in table order, then Works in table order).

| id | `projectType` | `workScopeIds` | Spaces ⊆ set | §13 agreement |
|---|---|---|---|---|
| bi-01 | `full_remodel` | `entrance, kitchen, bathroom, flooring, lighting, built_in_furniture` | entrance, kitchen, bathroom | agrees |
| bi-02 | *(omitted)* | `kitchen, flooring, built_in_furniture` | kitchen | agrees |
| bi-03 | *(omitted)* | `entrance, lighting, built_in_furniture` | entrance | agrees |
| bi-04 | `partial_remodel` | `kitchen, bathroom` | kitchen, bathroom | agrees |
| bi-05 | *(omitted)* | `flooring, painting, built_in_furniture` | **none** | agrees |
| bi-06 | `partial_remodel` | `entrance, living_room, lighting` | entrance, living_room | agrees |
| bi-07 | `full_remodel` | `kitchen, flooring, doors, built_in_furniture` | kitchen | agrees |
| bi-08 | *(omitted)* | `living_room, lighting` | living_room | agrees |

**full 2 · partial 2 · absent 4** — contract §13's counts, unchanged, and now backed by a set of
ids on every record rather than by prose alone.

---

## 2. Per record

### bi-01 — 수성 화이트 34평 아파트 리모델링

`workScopeIds: [entrance, kitchen, bathroom, flooring, lighting, built_in_furniture]`
`projectType: full_remodel`

**Authored**

| id | licensing text | rule |
|---|---|---|
| `entrance` | body[2] *"현관에는 3연동 중문과 천장까지 닿는 신발장, 전신 거울을 두었습니다."* | `WS9`(c) **exception** — §7.3's `entrance` gloss names 중문 **and** shoe storage at the entrance, so both items are the space's own gloss, not generic joinery. This is `bi-18`'s and `bi-09`'s pattern verbatim (`13c` §bi-18). |
| `kitchen` | body[2] *"주방은 상부장을 없애 시야를 틔우고, 줄어든 수납은 맞은편 키큰장과 복도 붙박이장으로 옮겼습니다. 냉장고와 오븐을 키큰장 안에 넣어…"* | `WS9`(a) — the kitchen's own built-in elements changed (wall units removed, tall units and integrated appliances added). Independently licensed by `WS9`(c)'s exception, since §7.3's `kitchen` gloss names *주방 storage*. |
| `bathroom` | body[3] *"욕실은 따뜻한 베이지 타일과 슬라이드 거울장으로 구성했습니다."* | `WS9`(a) — the bathroom's own finishes and fixtures changed. `WS3`: the record describes one bathroom; quantity is not represented either way. |
| `flooring` | body[0] *"바닥은 밝은 아이보리 톤의 스톤 질감으로 거실부터 방까지 끊김 없이 이었습니다."* | `WS9`(b), §7.3 `flooring` = 바닥재. A new floor laid from the living room through the bedrooms is the textbook trade-through-a-space. |
| `lighting` | body[1] *"조명 회로를 나눴습니다. 낮에는 천장 메인등을, 저녁에는 우물천장 간접조명과 수납장 니치 조명만 켜 둘 수 있습니다."* | `WS9`(b), §7.3 `lighting` = 조명. |
| `built_in_furniture` | body[1] *"현관 옆과 복도, 주방 키큰장에 같은 오크 니치를 반복해…"*; gallery 복도·수납 *"천장까지 닿는 화이트 수납장이 있는 복도"* | §7.3 `built_in_furniture` = 붙박이장, 제작 가구 — joinery inside another space. The **복도** joinery is what licenses this id independently of the entrance and kitchen items. |

**Rejected**

| id | why |
|---|---|
| `living_room` | 거실 appears only as (i) the run of the new floor and (ii) the 우물천장 간접조명 circuit. Both are trades run **through** it — `WS9`(b), and the coffered-ceiling light is `WS9`(b)'s own literal example. No sentence describes a layout, fixture or built-in change to the 거실 itself. Same disposition as `13c`'s strip of `living_room` from `bi-09`/`bi-11`/`bi-12`. |
| `bedroom` | 안방/작은방 appear only in `scope` (E1) and in gallery alts describing **curtains and blinds** — *"그레이지 암막 커튼을 단 안방"*, *"콤비 블라인드와 책상을 둔 작은방"*. `WS9`(b)'s closing sentence names curtains and furniture as **not a work scope at all**. |
| `kids_room` | 작은방 is not 아이방/자녀방; §7.3's gloss is not satisfied by the word, and nothing was done to the room in any case. |
| `hallway` | 복도 carries a 붙박이장 and nothing else. `WS9`(c) decides this by name: *"A 복도 붙박이장 is `built_in_furniture` and **not** `hallway`"*. `04` §4 already records this disposition for `bi-01` specifically (contract rev 5 moved it). |
| `storage` | §7.3's `storage` gloss excludes it explicitly: *"Joinery built **inside** another space is `built_in_furniture`, not `storage`"*. The `scope` string 복도 수납 is display text (E1). |
| `wallpaper`, `painting` | body[0] *"벽과 천장, 붙박이장을 같은 화이트 계열로 **맞추고**"* — the wall and ceiling finish is coordinated in colour, but the **trade** is never named. 도배 and 도장 are two different §7.3 ids and the text does not choose. `WS1`/E3: omit. (Contrast `bi-09`, whose body says 도배 outright, and `bi-05`, whose body says 칠해.) |
| `doors` | 3연동 중문 is 중문 → absorbed by `entrance`'s own gloss; authoring it as `doors` as well would double-count one item across two ids. No other 문/문틀 work is described. |
| `tiling` | The bathroom tile is part of remodelling the bathroom and is folded into `bathroom`. Corpus precedent: `bi-09` (*"욕실은 타일과 도기, 수전을 새로 넣었습니다"*), `bi-14`, `bi-16` all describe tile in prose and author no `tiling` — `04` §3 defends that as correct `WS1` authoring. `tiling` stays unused across all 19. |
| `electrical` | *"조명 회로를 나눴습니다"* is circuit work, which touches 배선 — but §7.3 puts 조명 under `lighting` and 전기·배선·콘센트 under `electrical`, and the text names only the lighting circuits. Mapping it to both needs judgement → `WS1`. |
| `demolition` | *"상부장을 없애"* is removal inside the kitchen scope, not a 철거 line item. |
| `dining` | Only the phrase 식탁 자리 in a gallery alt (E2); no dining work described. |

**`projectType` = `full_remodel`.** `PT4`(a): summary states *"…현관부터 주방까지 수납과 동선을
다시 짠 34평 아파트 **전체 리모델링**입니다."* `PT4`(b): no space is named as left out and none
receives maintenance-level work — the bathroom was genuinely redone (body[3]). `PT4`(c)/`INV-29`:
three Spaces ids. Agrees with contract §13 and with the record's own `category: "full-remodel"`.

---

### bi-02 — 신혼부부를 위한 24평 화이트 내추럴 리모델링

`workScopeIds: [kitchen, flooring, built_in_furniture]`
`projectType:` **omitted** (`PT6`)

**Authored**

| id | licensing text | rule |
|---|---|---|
| `kitchen` | body[1] *"주방은 일자형을 유지하되 **오픈 선반**을 달아 자주 쓰는 그릇을 꺼내 두기 쉽게 했습니다."*; body[1] *"바닥과 선반, **상판** 모서리에 같은 라이트 오크를…"* | `WS9`(c) **exception** — §7.3's `kitchen` gloss names *sink and counter run* and *주방 storage*; open shelving for everyday dishes is 주방 storage and the 상판 is the counter run. Flagged **lower confidence**, the same family as `13c`'s note on `bi-12`'s entrance: the gloss carries the id, not a sentence about the room changing. |
| `flooring` | body[1] *"**바닥**과 선반, 상판 모서리에 같은 라이트 오크를 써서 화이트 공간에 온기를 더했습니다."* | `WS9`(b). The record states the floor's new material as part of the work. Weaker than `bi-01`'s 이었습니다; **moderate confidence**. |
| `built_in_furniture` | body[0] *"가구를 많이 들이기보다 **붙박이 수납**을 먼저 정하고…"*; corroborated by the 침실 gallery alt *"오크 침대와 화이트 붙박이장이 있는 침실"* | §7.3 `built_in_furniture`. |

**Rejected**

| id | why |
|---|---|
| `bedroom` | The bedroom's only item is a 붙박이장. `WS9`(c): joinery does not remodel the space it stands in, and `bedroom`'s gloss (*"침실, 안방 and other bedrooms for adults"*) names no joinery. This is `13c`'s `bi-09` strip, identical in structure. |
| `bathroom` | 욕실 is in `scope` and has a gallery photo — *"화이트 타일과 오크 톤 하부장으로 꾸민 욕실"* — but **no sentence in summary, body or quote mentions the bathroom at all**. E1 + E2: neither licenses a Spaces id. The single most likely id an operator would add; see §6. |
| `living_room` | Cover alt names 린넨 커튼 (styling, `WS9`(b)); the body never describes living-room work. |
| `dining` | 주방·다이닝 appears in no field here at all; the 원형 식탁 is furniture. |
| `tiling`, `wallpaper` | Not named anywhere. |

**`projectType` omitted (`PT6`).** There is **no breadth statement anywhere**: the title, summary,
both body paragraphs and the customer quote all say 리모델링 without 전체 or 부분, and none states a
bounded set of spaces (`PT5`) or that the dwelling as a whole was covered (`PT4`(a)). Agrees with
§13. **Note the axis clash:** the record's `category` is `"full-remodel"`. `PT3`/`SD2` forbid
mapping `category` to `projectType`, and `04` §0.2 records that reading breadth out of the scope
count here was rev 1's error. Omission stands.

---

### bi-03 — 42평 가족형 아파트 수납 중심 리모델링

`workScopeIds: [entrance, lighting, built_in_furniture]`
`projectType:` **omitted** (`PT4`(b) / `PT6`)

**Authored**

| id | licensing text | rule |
|---|---|---|
| `entrance` | body[2] *"현관에는 앉아서 **신발**을 신을 수 있는 벤치 칸을 만들고…"*; body[0] *"…**현관**… 에 천장까지 닿는 붙박이장을 계획해"*; corroborated by gallery 현관 *"벤치 칸과 양쪽 **신발장**이 있는 현관"* | `WS9`(c) **exception** — the work is shoe storage at the entrance, which §7.3's `entrance` gloss names. The body sentence (not only the alt) is explicit about shoes. |
| `lighting` | body[1] *"거실 수납장 가운데에는 **조명을 넣은** 오픈 칸을 두어 벽 전체가 답답해 보이지 않게 했습니다."* | `WS9`(b), §7.3 `lighting` = 조명. Modest: one lit bay, installed as part of the joinery. Authored because a light **was installed**, which is what the id says and all it says. |
| `built_in_furniture` | body[0] *"거실 한 면과 현관, 팬트리, 드레스룸에 천장까지 닿는 **붙박이장**을 계획해…"*; body[2] *"아이방에는 책상과 옷장을 한 벽에 **붙박이로 짜 넣어**"* | §7.3 `built_in_furniture`. This is the record's whole subject. |

**Rejected** — this record produces the most rejections in the set, and they are the point of it.

| id | why |
|---|---|
| `living_room` | Sole justification is the wall of joinery (*"거실 한 면 … 붙박이장"* + the lit open bay). `living_room`'s gloss names no joinery → `WS9`(c) → `built_in_furniture`. Identical to `13c`'s `bi-12` strip. |
| `kids_room` | *"아이방에는 책상과 옷장을 한 벽에 붙박이로 짜 넣어 바닥 면적을 넓게 남겼습니다."* — joinery, and only joinery; the freed floor area is its consequence, not a layout change. `kids_room`'s gloss (*"아이방, 자녀방"*) names no joinery → `WS9`(c). |
| `dressing_room` | *"드레스룸**에** … 붙박이장을 계획해"* — the dressing room already exists and received joinery. §7.3's gloss is *"드레스룸, a separate wardrobe room"*: it names a room, not its fitting-out. Contrast `bi-13`, where `dressing_room` survived `13c` because a room's **use was converted** (*"안방 옆 방은 드레스룸으로 용도를 바꿨습니다"*). No conversion is stated here. `WS9`(c). |
| `pantry` | *"…팬트리… 에 천장까지 닿는 붙박이장을 계획해"*, with `scope` compounding it as 주방·팬트리 and the gallery alt showing *"아일랜드와 키큰 팬트리 수납장이 있는 **주방**"*. §7.3's `pantry` gloss requires *a separate food-store room*, and nothing establishes one. This is `13c`'s `bi-13` `pantry` strip, same evidence shape, same answer → `built_in_furniture`. **`pantry` therefore remains unused across all 19.** |
| `kitchen` | No prose sentence describes kitchen work. The only kitchen evidence is the `scope` compound 주방·팬트리 (E1) and an 아일랜드 in a gallery alt (E2) that does not say the island is new. Had the body placed the pantry cabinet in the kitchen, `kitchen`'s *주방 storage* gloss would have licensed the id as it does on `bi-02` — it does not. Listed in §6. |
| `bathroom` | **Explicitly excluded**: body[2] *"욕실은 몇 해 전에 고쳐 상태가 좋아 이번 공사에서는 그대로 두었습니다."* This is the `PT4`(b) trigger below. |
| `bedroom` | 안방/작은방 appear in no field; §13 already notes `scope` omits them. |
| `storage` | §7.3's gloss sends joinery inside another space to `built_in_furniture`. The cabinets are in the living room, entrance, kitchen-side pantry zone, dressing room and kids' room — every one of them inside another space. |
| `hallway` | Not mentioned. |
| `flooring`, `wallpaper`, `painting`, `doors` | No finish trade is named anywhere in the record. |

**`projectType` omitted.** `PT4`(b) fires: the body names a **space** — the bathroom — that was left
out (*"그대로 두었습니다"*), and `bathroom` is in §7.3's Spaces table, so the exclusion is a
boundary and not a trade detail. `PT5` is also not available: the source does not state a bounded
set of spaces it covered; it presents itself as a whole-flat storage project (`category:
"full-remodel"`) with one room excluded, which is `PT6`'s *"the statements it makes contradict one
another"*. Agrees with §13, which flags this record as the one where `category` and `projectType`
disagree outright. **Had it been authored `partial_remodel`, `INV-30` would still have passed
(`entrance` is a Spaces id)** — so the omission rests on `PT4`(b)/`PT6`, not on an invariant.

---

### bi-04 — 32평 주방·욕실 중심 리뉴얼

`workScopeIds: [kitchen, bathroom]`
`projectType: partial_remodel`

**Authored**

| id | licensing text | rule |
|---|---|---|
| `kitchen` | body[1] *"주방은 ㄱ자 배치를 유지하면서 **싱크볼과 가열대 사이 조리 공간을 넓혔습니다**."* | `WS9`(a) — the counter run itself changed, which §7.3's `kitchen` gloss names directly (*sink and counter run*). The strongest single kitchen sentence in the eight. |
| `bathroom` | body[1] *"**욕실 두 곳은** 큰 규격의 무광 타일로 줄눈을 줄이고, **거울장과 하부장을 달아** 세면대 주변을 비웠습니다."* | `WS9`(a) — finishes and fixtures changed. `WS3`: two bathrooms, **one** id; the plurality stays in the title, `scope` and body, exactly as `04` §4's P3 row requires. |

**Rejected**

| id | why |
|---|---|
| `flooring`, `wallpaper` | **Explicitly not done**: body[0] *"바닥과 도배는 그대로 두고, 물을 쓰는 공간에만 예산을 집중했습니다."* Note what this costs: by `WS7b` the **works** in a partial's set are **open**, so a consumer reading this record learns only that flooring is *unknown*, never that it was excluded — although the source says so in plain Korean. That is §17's deferred `workScopeIdsExcluded`, and `bi-04` is the cleanest fixture for it in the whole corpus. |
| `tiling` | Bathroom tile folded into `bathroom`, per the `bi-09`/`bi-14`/`bi-16` precedent (`04` §3). |
| `plumbing` | 수전 appears only in a gallery alt (*"언더마운트 싱크볼과 무광 니켈 수전"*) — E2. Even in prose it would be folded into `kitchen`, as `bi-09` folds 수전 into `bathroom`. |
| `demolition` | Not named; *"공사 전"* photos evidence a before state, not a 철거 scope line. |

**`projectType` = `partial_remodel`.** `PT5`: summary states a bounded set of spaces outright —
*"주방과 욕실 **두 곳만 골라** 2주 동안 바꾼 **부분 리뉴얼**입니다."* `PT4`(b) does not apply to a
partial. `WS7a` closure holds and is **correct**: `R_s = {kitchen, bathroom}` is the complete set of
spaces remodelled, and body[0] independently confirms nothing else was. Agrees with §13. Note that
`category: "kitchen-bath"` describes *what kind of job it was* and could not have produced this
value — §13's conclusion 1, demonstrated.

---

### bi-05 — 29평 밝은 내추럴 아파트 리모델링

`workScopeIds: [flooring, painting, built_in_furniture]`
`projectType:` **omitted** (`PT4`(b))

**Authored**

| id | licensing text | rule |
|---|---|---|
| `flooring` | body[1] *"**바닥**과 식탁, 선반은 같은 톤의 밝은 오크로 맞추고…"* | `WS9`(b). Moderate confidence, as on `bi-02`: the new floor material is stated, the act of laying it is not. |
| `painting` | body[1] *"벽은 노란 기가 살짝 도는 웜 화이트로 **칠해** 오후 햇빛과 잘 어울리게 했습니다."* | `WS9`(b), §7.3 `painting` = 도장, 페인트. 칠하다 with a named paint colour is the trade, and it is the **only** unambiguous painting sentence in all nineteen records — it is why `painting` moves from unused to used (§5). |
| `built_in_furniture` | body[0] *"창 아래에는 수납을 겸한 오크 벤치를 **짜 넣었습니다**."* | §7.3 `built_in_furniture` = 제작 가구. 짜 넣다 is the corpus's standard joinery verb. |

**Rejected**

| id | why |
|---|---|
| `balcony` | The balcony's only work is the built-in bench (joinery) and a 쉬어 커튼 (styling, named by `WS9`(b) as not a work scope). §7.3's `balcony` gloss — *"발코니, 베란다, including an extended one"* — names no joinery, so `WS9`(c) sends the bench to `built_in_furniture`. **This contradicts `04` §4's parenthetical** *"balcony will come from bi-05/bi-06 once the existing 8 are authored"*; see §7. |
| `expansion` | body[0] says *"**확장된** 발코니"* and `scope` says 확장 발코니 — both describe the dwelling's **existing** state, not this project's work. Nothing says this job did the expansion. Authoring it would be inventing a fact. (Contrast `bi-10`, whose body describes the 확장 as work performed.) |
| `bathroom` | **Explicitly maintenance-only**: body[1] *"욕실은 상태가 좋아 **실리콘과 수전만 교체**했습니다."* `PT4`(b) names this exact phrasing. |
| `plumbing` | The 수전 교체 above is the only candidate, and §7.3's `plumbing` gloss does name 수전. Rejected under `WS1`/E3: the sentence's function is to state that the bathroom was **not** remodelled, and whether a maintenance item is a work scope at all is judgement, not a table lookup. Recorded because it is the closest call in the pass — authoring it would state nothing false (`WS7b`: works are open on a breadth-absent record), and an operator may overrule this. |
| `kitchen` | 주방·다이닝 is in `scope` (E1) and nowhere else. No kitchen sentence exists. See §6. |
| `dining` | The only dining items are the 식탁 (furniture) and a 라탄 펜던트 in a gallery alt (E2) — `13c` stripped `dining` from `bi-12` on exactly the pendant. |
| `living_room` | Curtains and a sofa in alts; no living-room work in prose. |
| `bedroom` | Gallery alt names a bed and a slim shelf — furniture. |
| `windows` | *"발코니 쪽 창에는 … 커튼만 달고"* — curtains on an existing window; no 창호 work. |
| `lighting` | The pendant is alt-only (E2); body[0] describes **removing** light-blocking elements, which is not an id. |

**`projectType` omitted.** `PT4`(b): the body names a space — the bathroom — that received
maintenance-level work only, and `PT4`(b) names 실리콘·수전만 교체 as its own example. The summary's
*"29평 아파트 **전체 리모델링**입니다"* does not override it: *a space that was not really
remodelled is a space that was left out, whichever verb the source uses.* Agrees with §13.

> **A machine check now backs §13's judgement here.** With the ids authored, `bi-05` carries **no
> Spaces id at all** — every one of its three ids is a trade. So even an author who read only the
> summary and wrote `full_remodel` would be **rejected by `INV-29`** at the schema
> (`schema.ts:370–376`) and again at `validate.ts:305–309`. `bi-05` was previously defended only by
> `PT4`(b), an authoring rule no build can evaluate; it is now the corpus's second `INV-29` negative
> shape alongside `bi-19`, and the only one that carries an authored `pricePerArea` (2,600,000/평)
> — which is precisely the D-1 hazard §13 worried about, now closed structurally.

---

### bi-06 — 34평 현관·거실 중심 리모델링

`workScopeIds: [entrance, living_room, lighting]`
`projectType: partial_remodel`

**Authored**

| id | licensing text | rule |
|---|---|---|
| `entrance` | body[0] *"현관에는 슬림한 화이트 프레임의 **원슬라이딩 중문**을 달고, **신발장**은 바닥에서 띄워 아래에 조명을 넣었습니다."* | `WS9`(c) **exception** — 중문 and shoe storage are both named by §7.3's `entrance` gloss. `bi-18`'s pattern. |
| `living_room` | body[1] *"거실은 우물천장 간접조명과 **세로 템바보드 벽**으로 단정하게 정리했습니다."* | `WS9`(a) — the living room's **own wall finish** changed. This is exactly the sentence shape `13c` accepted for `bi-17` (*"거실 TV 벽은 세로 템바보드로 마감"*), which is the corpus's decided precedent for panelling as a change to the space rather than a trade through it. |
| `lighting` | summary *"…중문, 신발장, **간접조명**을 새로 계획한 부분 리모델링"*; body[0] *"신발장은 … 아래에 조명을 넣었습니다"*; body[1] 우물천장 간접조명 | `WS9`(b), §7.3 `lighting` = 조명. |

**Rejected**

| id | why |
|---|---|
| `hallway` | 복도 is in `scope` and has one gallery photo — *"다운라이트가 일렬로 놓인 복도"* — which is alt text (E2) describing **lighting**, a trade run through. `WS9`(c) is explicit that `hallway` is authored *"only when something else about the 복도 changed — its layout, its floor, its ceiling"*. Nothing states that. **This rejection has teeth**: `bi-06` is a `partial_remodel`, so `R_s = {entrance, living_room}` is **closed** under `WS7a`, and a visitor asking about 복도 will be told that space was *not remodelled*. That is true and permitted — `WS7a`'s own sentence forbids only the stronger claim that no work reached it — but it is the disclosure `WS6`'s conservative-resolution rule was written for. |
| `flooring` | body[1] *"기존 바닥과 이어지는 밝은 아이보리 톤을 골라 공사하지 않은 공간과의 경계가 티 나지 않게 했습니다."* This **implies** new floor in the worked rooms matched to the untouched floor elsewhere, but it does not say a floor was laid; the tone could as easily be the panelling's. `WS1`/E3: omit. The most consequential omission in this pass — see §6 and §7 row H. |
| `built_in_furniture` | The only joinery is the 신발장 (and an 오크 벤치 in an alt), both absorbed by `entrance`'s gloss. Authoring both ids for one item would double-count it; `bi-18` sets the precedent by authoring `built_in_furniture` only for a **separate** item (its 복도 붙박이장). |
| `doors` | 중문 belongs to `entrance`'s gloss; no 문/문틀 work is described. |
| `kitchen`, `bedroom` | **Explicitly excluded**: body[0] *"방과 주방은 상태가 좋아 그대로 두고"*. Under `PT5` this complement is not a disqualifier; it is the record's boundary. |
| `balcony` | Not mentioned in any field of this record. |

**`projectType` = `partial_remodel`.** `PT5`: summary states the bounded set — *"집의 첫인상을
만드는 **현관과 거실만 골라** … **부분 리모델링**입니다."* `PT4`(b) does not apply. Agrees with
§13, and with `category: "partial-remodel"`.

---

### bi-07 — 19평 소형 아파트 화이트 미니멀 리모델링

`workScopeIds: [kitchen, flooring, doors, built_in_furniture]`
`projectType: full_remodel`

**Authored**

| id | licensing text | rule |
|---|---|---|
| `kitchen` | body[1] *"주방은 **상부장을 천장까지 올려 수납을 확보**하고 **후드는 장 안에 숨겼습니다**."* | `WS9`(a) — the kitchen's own built-in elements changed. Also `WS9`(c)'s exception via *주방 storage*. |
| `flooring` | summary *"오래된 19평 아파트를 화이트 붙박이 수납과 **밝은 바닥**으로 넓어 보이게 **고친** 전체 리모델링입니다."* | `WS9`(b). The summary names the bright floor as one of the two things the renovation did. |
| `doors` | body[0] *"**문과 몰딩**을 벽과 같은 화이트로 맞춰 면이 끊기지 않게 했습니다."* | §7.3 `doors` = 문, 문틀. Direct corpus precedent: `bi-11` authors `doors` for the near-identical *"문과 문틀은 필름으로 화이트에 맞췄습니다"*. |
| `built_in_furniture` | body[0] *"옷장과 수납장을 모두 벽 안으로 넣는 **붙박이**로 계획하고"* | §7.3 `built_in_furniture`. Corroborated by the 침실 alt *"한 벽을 붙박이장으로 채운 침실"*. |

**Rejected**

| id | why |
|---|---|
| `living_room` | body[1] *"거실에는 **2인 소파와 작은 원형 식탁만 두어** 지나다니는 길을 넉넉히 남겼습니다."* — furniture placement, which `WS9`(b) names as not a work scope. The cleanest rejection in the set: the record's only living-room sentence is about what was *put in* the room. |
| `bathroom` | 욕실 is in `scope` with a gallery photo (*"화이트 타일과 유리 샤워 스크린이 있는 욕실"*) and **no prose sentence anywhere**. E1 + E2. This is the pass's most uncomfortable omission, because the record is a `full_remodel`: see the fragility note below and §6. |
| `bedroom` | Only a 붙박이장, in an alt at that → `built_in_furniture`, `WS9`(c). |
| `dining` | 거실·다이닝 is one compound `scope` string, which `WS4` forbids splitting; the only dining item is the round table (furniture). |
| `painting` | The method behind *"문과 몰딩을 … 맞춰"* is unstated (`bi-11` used 필름, `bi-09` used 칠). `WS1`. |
| `wallpaper` | 벽 is referenced only as the colour the doors match. |
| `lighting`, `windows`, `tiling` | Not named. |

**`projectType` = `full_remodel`.** `PT4`(a): summary *"…넓어 보이게 고친 **전체 리모델링**입니다."*
`PT4`(b): no space is named as left out and none is described as maintenance-only. `PT4`(c)/`INV-29`:
`kitchen` is a Spaces id. Agrees with §13 and with `category`.

> **Fragility, stated.** `bi-07`'s `full_remodel` now hangs on **one** Spaces id. If an operator
> later decides the 주방 sentence describes joinery alone rather than the kitchen's built-in
> elements, `INV-29` fails and the record must go breadth-absent — which would drop contract
> §13's counts to full **1** · partial 2 · absent 5 and remove a record from `04` §4.1 row B and
> `CINV-21`'s seven. Resolving 욕실 (§6) removes the fragility outright; it is the highest-value
> operator question in this pass.

---

### bi-08 — 51평 신축 아파트 입주 전 홈스타일링

`workScopeIds: [living_room, lighting]`
`projectType:` **omitted** (`PT6`)

**Authored**

| id | licensing text | rule |
|---|---|---|
| `living_room` | body[0] *"기본 바닥과 주방은 그대로 두고, **거실 아트월**과 천장 조명, 커튼, 가구 배치로 집의 인상을 바꾸는 범위를 잡았습니다."* | `WS9`(a) — an 아트월 is a built feature wall, i.e. the living room's own wall finish, and the body lists it as a work item and not as decor. Same class as `bi-17`'s 템바보드 TV 벽 and `bi-06`'s 템바보드 벽. **Addressed head on:** `WS9`(b)'s exclusion list says *"furniture placement, curtains, **art**"* — that is hanging artwork, not 아트월 wall cladding. The record's own summary separates them: *"아트월, 조명, 커튼, 가구로"*, with 커튼 and 가구 rejected below on exactly that sentence. Flagged for a human read. |
| `lighting` | body[0] *"**천장 조명**"*; body[1] *"우물천장에는 **간접조명과 슬림 트랙 조명을 함께 넣어** 시간대에 따라 밝기를 나눠 쓸 수 있습니다."* | `WS9`(b) — installed lighting, `WS9`(b)'s own example. |

**Rejected**

| id | why |
|---|---|
| `kitchen`, `flooring` | **Explicitly not done**: *"기본 바닥과 주방은 그대로 두고"*. |
| `demolition` | **Explicitly not done**: *"새 아파트라 철거 없이 진행했습니다."* The one place in the eight where a §7.3 Works id is named in the negative. |
| `study` | The 서재 appears only in `scope` and in a gallery alt (*"벽 전체를 책장으로 짠 서재"*) — E1 + E2 — and even if licensed, a wall of bookshelves is joinery, which `study`'s gloss (*"서재, a home office"*) does not name → `WS9`(c) would send it to `built_in_furniture` anyway. Rejected twice over. |
| `built_in_furniture` | The bookshelf wall above is the only joinery, and it is alt-only (E2). An operator who confirms it in prose adds this id, not `study`. See §6. |
| `bedroom` | 안방's alt names a 그레이지 헤드월 — a wall finish that **would** license `bedroom` under `WS9`(a) had the body said it. It does not (E2). The asymmetry with the 아트월, which the body does state, is the evidence rule doing its work rather than a preference about rooms. |
| `dining` | A 라인 펜던트 over a table, in an alt: lighting + furniture (`13c`'s `bi-12` `dining` strip). |
| `painting`, `wallpaper` | *"전체 톤은 차분한 그레이지로 맞추고"* names no trade; 월넛 가구 is furniture. |

**`projectType` omitted (`PT6`).** The source frames the project as something other than a remodel:
`category: "move-in-styling"`, title 홈스타일링, summary *"기본 마감은 살리고 … 분위기를 완성한
입주 전 홈스타일링"*, body *"철거 없이 진행했습니다"*. `PT6`'s first branch, verbatim. Agrees with
§13. `WS7c` permits a breadth-absent record to carry `workScopeIds`; only the converse is
constrained, so authoring two ids here is legal and useful — it puts the record on `GR3`'s trade
rung for a 조명 request.

---

## 3. Invariant check

Per record, and then over all nineteen.

| record | `projectType` | `INV-28` (partial ⇒ non-empty) | `INV-29` (full ⇒ ≥1 Space) | `INV-30` (partial ⇒ ≥1 Space) |
|---|---|---|---|---|
| bi-01 | `full_remodel` | n/a | **PASS** — entrance, kitchen, bathroom | n/a |
| bi-02 | absent | n/a | n/a | n/a |
| bi-03 | absent | n/a | n/a | n/a |
| bi-04 | `partial_remodel` | **PASS** — 2 ids | n/a | **PASS** — kitchen, bathroom |
| bi-05 | absent | n/a | n/a (and would **FAIL** if authored `full_remodel` — intended, §2) | n/a |
| bi-06 | `partial_remodel` | **PASS** — 3 ids | n/a | **PASS** — entrance, living_room |
| bi-07 | `full_remodel` | n/a | **PASS** — kitchen (one id only; see the fragility note) | n/a |
| bi-08 | absent | n/a | n/a | n/a |

Other producer invariants touched by this pass:

- **`WS5` / `INV-18`** — no set is `[]`; all eight are non-empty. PASS.
- **`WS3` / schema uniqueness** — every set is a set; `bi-04`'s two bathrooms and `bi-01`'s two
  bedrooms produce no duplicate id. PASS.
- **`WS1` / `INV-17` (vocabulary)** — every one of the 26 distinct id-uses across the eight is in
  §7.3's tables, checked mechanically against `WORK_SCOPE_IDS`. PASS.
- **`INV-25`** — every id above is traced to authored record text in §2; none is derived by the
  emitter, and `WS4` is respected in the strong sense: no Korean `scope` string was split. The four
  records where the two lists visibly diverge are now **seven** (`bi-01`, `bi-03`, `bi-05`, `bi-06`,
  `bi-07`, `bi-08` join `bi-09`/`bi-11`/`bi-12`/`bi-13`), which strengthens `04` §0.2's `WS4`
  fixture rather than weakening it.
- **`WS2` closure** — the document-level `workScopes` array must be recomputed after this pass:
  it gains `painting` and nothing else. See §5.
- **`INV-30` has no producer implementation** (§0.1). Both `partial_remodel` records satisfy it by
  construction, so the pass is not blocked, but the invariant remains untested code-side.

**`m7-7` is closed.** `bi-01`, `bi-04`, `bi-06` and `bi-07` — the four records that carried a
`projectType` and no scope list — now carry both, and all three invariants are evaluable on them.

---

## 4. `projectType`: agreement, and the disagreement that does exist

**There is no `projectType` disagreement to report, because no record carries one.**
`projects.json` has zero occurrences of `projectType` (or of any other V0.2 field) across the eight.
Every value in §1 is a first authoring, and each one **agrees with contract §13's table** —
full 2 (`bi-01`, `bi-07`) · partial 2 (`bi-04`, `bi-06`) · absent 4 (`bi-02`, `bi-03`, `bi-05`,
`bi-08`) — derived here independently from `PT4`/`PT5`/`PT6` against the record text before §13's
table was re-read for confirmation.

**What does disagree, on four records, is `category`.** Stated loudly because a reader applying
this spec will see it in the same file:

| record | `category` in `projects.json` | authored `projectType` | the axis |
|---|---|---|---|
| bi-02 | `full-remodel` | **omitted** | `category` is a site taxonomy label; no breadth statement exists in the prose (`PT6`) |
| bi-03 | `full-remodel` | **omitted** | the body excludes a **space** (`PT4`(b)) |
| bi-05 | `full-remodel` | **omitted** | the body gives a space maintenance-level work only (`PT4`(b)) |
| bi-08 | `move-in-styling` | **omitted** | agrees in spirit; the value still may not be mapped |
| bi-04 | `kitchen-bath` | `partial_remodel` | `category` says *what kind of job*, `projectType` says *how much of the dwelling* |

This is §13's conclusion 1 — *`category` cannot be mapped to `projectType`* (`PT3`, `SD2`) —
observed rather than asserted: three records whose `category` reads `full-remodel` are
breadth-**absent**, and one whose `category` names two rooms is a `partial_remodel` on grounds
`category` could not have supplied. **Nothing in the applying change may derive `projectType` from
`category`.**

---

## 5. Recomputed id inventory over all 19 records

Computed independently: the eleven sets were taken from `04` §1's design-summary table (post-rev-6,
i.e. after `13c`'s re-authoring of `bi-09`/`bi-11`/`bi-12`/`bi-13`), the eight from §1 above, and
the union taken mechanically. The recomputation **reproduces `04` §4's 16 used / 10 unused for
`bi-09` … `bi-19` exactly**, which is the check that the method agrees with the published figure
before extending it.

**All 19: 17 used · 9 unused (of 26).**

| | ids |
|---|---|
| **used (17)** | `entrance`, `living_room`, `dining`, `kitchen`, `bedroom`, `kids_room`, `dressing_room`, `study`, `bathroom`, `flooring`, `wallpaper`, `lighting`, `windows`, `doors`, `painting`, `built_in_furniture`, `expansion` |
| **unused (9)** | `pantry`, `hallway`, `balcony`, `storage`, `utility`, `tiling`, `plumbing`, `electrical`, `demolition` |

Spaces: **9 of 14** used. Works: **8 of 12** used.

**The eight add exactly one id to the vocabulary: `painting`** (from `bi-05`'s
*"벽은 … 웜 화이트로 칠해"*, its only occurrence in nineteen records). The other eight ids the eight
records use — `entrance`, `living_room`, `kitchen`, `bathroom`, `flooring`, `lighting`, `doors`,
`built_in_furniture` — were already in the vocabulary from `bi-09` … `bi-19`.

Usage counts across 19, for `WS2` closure and for judging which ids are thinly evidenced:

| id | records | | id | records |
|---|---|---|---|---|
| `kitchen` | 11 | | `wallpaper` | 3 |
| `built_in_furniture` | 10 | | `dressing_room` | 2 |
| `bathroom` | 9 | | `windows` | 2 |
| `flooring` | 9 | | `doors` | 2 |
| `entrance` | 8 | | `dining` | 1 (bi-13) |
| `lighting` | 8 | | `bedroom` | 1 (bi-10) |
| `living_room` | 5 | | `kids_room` | 1 (bi-13) |
| | | | `study` | 1 (bi-13) |
| | | | `expansion` | 1 (bi-10) |
| | | | `painting` | **1 (bi-05)** |

Three consequences worth recording:

1. **`04` §4's parenthetical is wrong and should be corrected when that file is next revised**
   (not here): *"balcony will come from bi-05/bi-06 once the existing 8 are authored"*. It does not.
   `bi-05`'s balcony work is a built-in bench — `WS9`(c) sends it to `built_in_furniture` — and
   **`bi-06` has no balcony in any field at all** (its `scope` is 현관·중문 / 거실 / 복도). `balcony`
   stays declared-but-unused, joining `hallway` and `storage` in `04` §3's *"ship untested"* note.
   `INV-17`'s Spaces handling is now exercised on **9 of 14** Spaces ids.
2. **`pantry` stays unused**, and for the second time on the same reasoning: `13c` stripped it from
   `bi-13` because the 팬트리 수납장 was a cabinet in the kitchen, and `bi-03`'s 팬트리 is the same
   shape. Two independent records now agree that this corpus has no separate 팬트리 **room**.
3. `painting`, `dining`, `bedroom`, `kids_room`, `study` and `expansion` are each carried by a
   single record. Any later edit to `bi-05`, `bi-13` or `bi-10` can silently break `WS2` closure on
   the document-level `workScopes` array.

---

## 6. What could not be authored — the open questions

**No record was left unauthored.** All eight have a non-empty set and a `projectType` decision, and
none is blocked. What follows is the list of **ids that a specific missing sentence keeps out**, in
priority order. Each one is answerable by the site operator in a word; none is answerable from the
file as it stands, and none may be guessed.

| # | record | id withheld | the missing information |
|---|---|---|---|
| 1 | **bi-07** | `bathroom` | 욕실 is in `scope` and has a photo; **no prose sentence mentions it**. Did the 19평 full remodel redo the bathroom, or only decorate it? Highest priority: it is the record whose `full_remodel` currently rests on a single Spaces id. |
| 2 | **bi-06** | `flooring` | *"기존 바닥과 이어지는 밝은 아이보리 톤을 골라"* — was new floor laid in the 현관/거실, matched to the untouched floor, or does the tone refer to the panelling and finishes? Changes `04` §4.1 row H (§7). |
| 3 | **bi-02** | `bathroom` | Same shape as (1): 욕실 in `scope`, a photo showing tile and a vanity, and no sentence. |
| 4 | **bi-03** | `kitchen` | The body places the ceiling-height joinery in 현관/팬트리/드레스룸/거실 but never says the pantry cabinet stands **in the kitchen**, which only a gallery alt suggests. If it does, `kitchen`'s *주방 storage* gloss licenses the id (as on `bi-02`). Also unanswered: whether the 아일랜드 in that alt is new. |
| 5 | **bi-05** | `kitchen` | 주방·다이닝 is in `scope`; no kitchen sentence exists anywhere. |
| 6 | **bi-08** | `built_in_furniture` | The 서재 bookshelf wall (*"벽 전체를 책장으로 짠"*) appears only in an alt. If it is real work, the id is `built_in_furniture` — **not** `study`, which `WS9`(c) rules out either way. |
| 7 | **bi-08** | `bedroom` | The 안방 그레이지 헤드월 appears only in an alt. A headwall is a wall finish and would license `bedroom` under `WS9`(a) if the body stated it. |
| 8 | **bi-01** | `wallpaper` **or** `painting` | *"벽과 천장 … 같은 화이트 계열로 맞추고"* names a colour, not a trade. 도배 or 도장? Exactly one of the two ids is correct and the text chooses neither. |
| 9 | **bi-05** | `plumbing` | Whether a maintenance-level 수전 교체 is a work scope at all. Recorded as the pass's closest call; authoring it would state nothing false, and it is the operator's to overrule. |

Two further items are **not** questions — they are decided and should not be reopened by whoever
applies this:

- `bi-01`'s 복도 붙박이장 is `built_in_furniture`, never `hallway` (`WS9`(c) by name; contract
  rev 5 already moved it).
- `bi-03`'s 팬트리 is `built_in_furniture`, never `pantry` (§7.3's *separate food-store room*).

---

## 7. Effect on `04-demo-data-spec.md` §4.1, rows A–I

Read-only assessment. `04` is **not edited by this file.** Row-by-row, against contract rev 8's
`EF2`/`EF3`/`EF6`/`GR3a`.

| row | verdict | detail |
|---|---|---|
| **A** *"34평 전체 5천이면 되나요"* | **unchanged — and only now satisfiable** | The row already predicts *"bi-01/bi-10 also exact"*. `bi-01` could not have been `exact` before this pass: `WS7c` forbids a `projectType` without `workScopeIds`, so `bi-01` had no breadth and `EF2` would have returned `not_evaluable` → `EF6` row 4 → `unknown_type_fallback`. The prediction is now met. No wording changes. |
| **B** *"예산 3천으로 전체 가능해요?"* | **unchanged — membership completed** | The `full_remodel` set becomes **seven**: `bi-01`, `bi-07`, `bi-09`–`bi-13`. That is exactly the *"seven `exact` records"* `CINV-21` fixtures for *"전체 리모델링 사례 보여주세요"*, which this pass confirms rather than changes. Both new members are price-poor in the row's sense (`bi-01` has a per-area price only, `bi-07` likewise), so the row's *"reads the prices themselves"* degradation is unaffected. |
| **C** *"주방만 하면 얼마예요"* | **CHANGED — the row's stated answer is now incomplete** | `bi-04` becomes a second `scope_superset` alongside `bi-16`: it is `partial_remodel` with `R_s = {kitchen, bathroom} ⊋ Q_s = {kitchen}` (§14.3.3 row 5), i.e. **the same class as `bi-16` and with no price at all**. `bi-01`/`bi-07` join `bi-09`–`bi-13` as `fallback_from_full` (`EF6` row 2) and `bi-02` becomes `unknown_type_fallback` (row 4). Nothing displaces `bi-14`'s `exact`. The row should gain `bi-04`. |
| **D** *"욕실 하나만" / "욕실 두 개"* | **unchanged — and only now satisfiable** | The row already says *"bi-04 is unpriced and is **not** ranked below the others for it"*. Before this pass `bi-04` carried no `workScopeIds` and therefore no `projectType`, so it was `unknown_type_fallback` and could not be in the same class as `bi-15`/`bi-16` at all. It is now `scope_superset` on `Q_s = {bathroom}`. `bi-01` joins as `fallback_from_full`. |
| **E** *"전용 84 아파트 주방"* | **unchanged** | `bi-01`, `bi-02`, `bi-04`, `bi-07` now carry `kitchen`, but all four are 평 / supply, so `AR5`/`PY1` make `EF4` `not_evaluable` against a 전용 84㎡ figure and they cannot reach `exact`. `bi-14` keeps the row. The row's warning is untouched. |
| **F** *"50평 전체 1억 넘나요"* | **unchanged** | `bi-08` stays `projectType`-absent (`PT6`), which is the only property the row uses it for. Its two new ids are invisible to the row (`Q = ∅` → scope `not_applicable`). |
| **G** *"32평인데 도배랑 바닥만 얼마예요"* | **unchanged — `bi-19` keeps the rung** | Trade-only request, `Q_t = {wallpaper, flooring}`. **No record among the eight carries `wallpaper`** (`bi-01`'s wall trade is unnamed, `bi-05`'s is `painting`), so none satisfies `Q_t ⊆ R_t` and `bi-19` remains the unique first entry on `GR3`'s trade rung. `bi-05` (flooring + painting, breadth-absent) and `bi-02`/`bi-07` follow behind it; `bi-01` is `not_evaluable` (`EF3`'s full-remodel trades half). |
| **H** *"바닥이랑 거실만"* | **CHANGED — membership, and one open question decides how much** | `Q_s = {living_room}`, `Q_t = {flooring}`. `bi-17` keeps `exact`. `bi-06` enters as `scope_superset` (its `R_s` also holds `entrance`) and `bi-08` as `unknown_type_fallback`. **If the `bi-06` flooring question (§6 #2) is answered yes**, `bi-06` still lands on §14.3.3 row 5 — `R_s ⊋ Q_s` is read before `Q_t` — so the class does not change, but the record then satisfies the visitor's trade as well and moves ahead of the other `scope_superset` entries on the within-rung key *"count of the visitor's stated ids the record carries"*. Worth answering before the demo. |
| **I** *"현관 수납"* | **CHANGED — membership; `bi-06`'s stated expectation needs one word** | Under the row's own alias assumption (수납 → `built_in_furniture`): `bi-18` keeps `exact`. `bi-01` also classes **`exact`** — `full_remodel`, `EF3`'s spaces half satisfied for any `Q_s`, and `Q_t = {built_in_furniture} ⊆ R_t` — joining `bi-09`/`bi-12`, which already did. `bi-03` is `unknown_type_fallback` (breadth absent ⇒ `EF3` `not_evaluable`), so it is **never** presented as a scope match despite `R_s = {entrance}` matching exactly; that is `EF3`'s absent branch working, and it is the reason a 42평 whole-flat storage job cannot masquerade as an entrance job. `bi-06` is **`scope_superset`**, not an equal-footing `exact`, because its remodelled spaces also include the living room — the row's *"bi-06 is unpriced and is returned on equal footing"* is true in the sense it was written (no price penalty, `PB4`) but its class is second in `GR2a`, and `GR3a`'s *spaces named* rung set still offers it directly after `bi-18`. |

**Summary: three rows change (C, H, I), two only by growing their result set (H, I), one by
acquiring a record the row should name (C, `bi-04`). Four rows (A, B, D, and I's `bi-06` clause)
state expectations that were unsatisfiable before this pass and are satisfiable after it.** No row's
expected answer is contradicted, and no row's V0.2 degradation note (B, F) is affected.

---

## 8. For the orchestrator — findings, not edits

1. **`04` §0.1 is stale**: `ProjectSchema` already carries `projectType`, `propertyType`,
   `workScopeIds`, `totalPrice` and `styles`, with `INV-28`/`INV-29` enforced in `superRefine` and
   again in `validate.ts`. The prerequisite `04` describes has landed in the working tree.
2. **The content field is `styles`, not `style`** as `04` §0.1's table says.
3. **`INV-30` is implemented in neither `schema.ts` nor `validate.ts`** — a trades-only
   `partial_remodel` passes both today. Already noted in `16b` §143; confirmed independently here.
   Neither record this pass authors as `partial_remodel` depends on it.
4. **`04` §4's *"balcony will come from bi-05/bi-06"* is wrong on both records** (§5). `balcony`
   stays unused; the note beside `hallway` and `storage` should be extended to it.
5. **`bi-05` becomes a second `INV-29` negative shape** — trades only, no Spaces id — and unlike
   `bi-19` it carries an authored `pricePerArea`. §13's `PT4`(b) judgement about this record now has
   a machine check standing behind it.
6. **Possible under-authoring in `bi-09`, for the owner to weigh, not for this pass to change**:
   its body says *"문과 몰딩은 벽과 같은 색으로 **칠해**"* and it carries neither `doors` nor
   `painting`, while `bi-11` authors `doors` for the near-identical *"문과 문틀은 필름으로 화이트에
   맞췄습니다"* and this pass authors `doors` for `bi-07` on the same sentence shape. The three
   records are not being read alike.
7. **Applying order matters**: the document-level `workScopes` array (`WS2`, closure both ways) must
   be regenerated in the same change that writes these eight records, or `INV-17` fails on
   `painting`.
