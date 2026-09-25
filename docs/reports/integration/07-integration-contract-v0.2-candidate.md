# 07 — Integration Contract V0.2 Candidate (web-recon producer ⇄ first-party data consumer)

| | |
|---|---|
| status | **READY CANDIDATE rev 9.2.1 — owner questions closed; not frozen until the consumer confirmations of §16.** V0.2 ranks on **project type, work scope, area and total price** (style a weak bonus, location never), with one match class, four tiers and one fixed order (§14.3). Budget comparison is back in one form — a total budget against the total price of an `exact` record only — and V0.2 therefore amends V0 `PR4` for `pricing.total` (§16). |
| date | 2026-09-25 |
| revision | rev 9.2.1 — closeout: owner decisions `OQ-1`…`OQ-6` recorded (§18), `34d`'s minors fixed (§20.9). Rev 9.2 — product simplification under the owner brief of 2026-09-25 and `32-round-9-handoff.md`: the evaluation function (§14.3) is replaced, the retired machinery and every change log before §20.9 move to `archive/07-rev9.1-corrected.md`. See §20.9. Earlier revisions: rev 9.1 (corrections pass), rev 9, rev 8 (the narrowing), rev 1–7 — all in the archive. |
| supersedes | `02-integration-contract-v0-candidate.md` (FROZEN V0, schemaVersion `0.1`) |
| normative | this file. `08-integration-contract-v0.2.json` is derived from it; any disagreement is a defect of that file. |
| canonical owner | **web-recon**. The consumer (BoostChat) holds a *consumer confirmation*, never a second copy of the contract. |
| owner decisions | `docs/result/interior-portfolio-v0.2/01-owner-decisions.md` (cited below as **OD-A** … **OD-S**) |
| reader | read `02` first. This document states only **what changes** and **why**; every V0 rule not named here survives unchanged. |

---

## 1. Why V0.2 exists

V0 answered *"which cases does this site publish?"*. It cannot answer what an interior visitor
actually asks:

> "34평 아파트 **전체** 리모델링, 예산 5천 정도인데 비슷한 사례 있나요?"
> "**주방이랑 욕실만** 2천만원으로 하고 싶은데요."

Three facts are missing, and nothing in V0 can be stretched to supply them.

1. **Project breadth.** V0's `facets.category` looks like it carries this. It does not: `bi-03`
   is tagged `category: "full-remodel"` while its own body says *"욕실은 몇 해 전에 고쳐 …
   그대로 두었습니다"* and its `scope` omits 안방, 욕실 and 작은방 of a 42평 flat. `category` is the
   site's own taxonomy (V0 `02` §11.3), not a structured fact about breadth. See §13.
2. **Total project price.** V0 has `pricePerArea` only, and `PR5` forbids a total. A visitor's
   budget is almost always a **total**, and V0 `BU3` correctly refused total-budget claims because
   it had nothing to make them from.
3. **Which spaces the work covered, comparably.** V0's `facets.scope` holds site-local opaque free
   text — `"거실"`, `"거실·다이닝"`, `"공용 욕실"`, `"안방 욕실"`, `"현관·중문"`: 20 distinct values
   for 8 records — and `VO2` says those ids mean nothing outside one document.

V0.2 adds exactly those three as **structured facts**, and gives style/mood its own facet.

### 1.1 Non-goals

V0 §2 unchanged, plus (OD-C, task §60): no real-time search API in web-recon, no vector database,
no image or CLIP similarity, no image-contract change, no GIS service-area system, no style
ontology, no total-price prediction, no per-customer search engine, and no domain logic in the
consumer's generic core (§14.1).

---

## 2. Layer assignment

V0's three layers (`03` `layers`) are **unchanged**. V0.2 adds only to the annex.

| layer | reuse | V0.2 additions |
|---|---|---|
| **core** | every resource kind, every vertical | `ND2` — one declared derivation (§9.3). Nothing else. |
| **portfolio** | any vertical with case records and one detail page each | *none.* `category`, `tag`, the facet mechanism, `id`/`title`/`detailUrl`/`listingUrl` are untouched. |
| **builtSpaceAnnex** | verticals dealing with built space | `projectType`, `property{type,area}`, `workScopes` + `workScopeIds`, `pricing{total,perArea}`, facet key `style` |

Every interior-specific concept lands in the annex; nothing lands in `core` or `portfolio` (OD-B).
A vertical with no built space ignores the annex and still gets a working portfolio integration.

The annex's reach is **built space** — a dwelling or a comparable unit with a floor area, a price
and rooms. It is not claimed to cover construction contracting or real-estate listings generally;
those need their own annex.

`propertyType` and `style` were **reserved** in V0 (`03` `portfolio.facetRules.reservedKeysNotEmittedInV0`).
V0.2 takes up `style` as a facet key, and takes up `propertyType` as a **structured field**
(`property.type`), not a facet — §4, §6.

---

## 3. schemaVersion — document `"1.0"`, manifest `"0.1"`

V0.2 removes and re-shapes fields. V0 `SV2` classifies a field removal as a **major** change, and
that rule is frozen and consumer-confirmed. V0.2 does **not** amend it.

> **Decision.** The portfolio resource document carries `schemaVersion: "1.0"`.
> The manifest carries `schemaVersion: "0.1"`, unchanged.

`SV1` already makes the two independent (*"manifest and each resource document carry their own"*).
The manifest gains no field in this release, so it does not move. This is the first time the two
diverge, which is what `SV1` was written for, and it makes the rollout as cheap as possible.

**Why major, not `"0.2"`** (task §14 asked for `"0.2"`; both independent reviewers found that
unsafe, and the deviation is recorded in `01-owner-decisions.md`):

- The consumer declares `SUPPORTED_MAJORS = {0}` (`boost-chat: src/lib/first-party/contract.ts:35`).
  Under `SV3` an unknown major is **TRANSIENT** — the consumer keeps its last good data.
- With `"0.2"` the same consumer would *parse* the document, ignore every unknown field, and serve
  records with no price and no scope — answering "가격 정보가 없습니다" for every case. Reduced
  freshness is an acceptable failure; a confident wrong answer is not.
- `SV4`'s machinery ("P announces a major in advance; C MUST support every major still served")
  applies as written. This document is the announcement; the consumer confirmation is the acceptance.

**Rollback interaction.** `PC6` returns the previous package unchanged, including its
`schemaVersion`. Therefore `RO2` (§16) is gated: the consumer's `"0.1"` read path may not be removed
while any package below `1.0` is still a rollback target.

---

## 4. Structured fact · semantic · display

| class | fields | how it may be matched |
|---|---|---|
| **STRUCTURED FACT** | `projectType`, `property.type`, `property.area`, `workScopeIds`, `pricing.total`, `pricing.perArea` | deterministic only: id equality, set relations, numeric comparison. Never embeddings. |
| **SEMANTIC** | `facets.style` | weak ranking bonus. May be reached by embedding. Never a filter (§14.4). |
| **SITE TAXONOMY** | `facets.category`, `facets.tag` | **still match keys**, exactly as in V0 (`02` §7.3, §11.3, §20). Their meaning is the site's own. |
| **DISPLAY** | `id`, `title`, `detailUrl`, `listingUrl`, `location`, `publishedAt` | not match keys. `location` additionally carries ranking weight 0 (`LO1`). |

> **Rule SD1 (P: MUST)** — one fact, one carrier. A value that is a structured fact is not *also*
> emitted as a facet value, and no structured fact is carried only by a facet. This does not demote
> facets: `category` and `tag` remain match keys for what they actually are — the site's own
> classification and descriptive words.
>
> **Rule SD2 (C: MUST NOT)** — `category` is never used as a proxy for `projectType`. It is the
> site's taxonomy, and §13 shows the two can disagree outright. This is the consumer-side mirror of
> `PT3`.

`workScopeIds` is a **top-level annex field, not a facet key**, even though it reuses the closure
idea: facet ids are opaque and site-local by `VO2`, and a cross-site canonical vocabulary cannot
live under that rule (§7.1).

---

## 5. `projectType`

```
projectType?: "full_remodel" | "partial_remodel"
```

### 5.1 Two values; absent means unknown

V0 already fixes how "unknown" is written: `MD1` (omitted = unknown), `MD2` (no placeholders — the
string `"unknown"` is named), `AR2` (the string `"unknown"` is never emitted). A literal
`"unknown"` would be a second way to say the same thing.

> **PT1 (P: MUST)** — `projectType` is optional. Absent = breadth not established. The wire format
> has no `"unknown"` value. (OD-F, with task §7's explicit authorisation to collapse absent and
> unknown when they carry no different meaning.)

The consumer's *visitor-intent* state is a different object and may carry an explicit `unknown`;
that is an intent, not a fact about a record, and is out of this contract.

### 5.2 Meaning, tied to the fact it governs

> **PT2 (normative meaning)**
> - `full_remodel` — the source presents the project as a remodel of the dwelling **as a whole**:
>   its principal spaces were remodelled. `property.area` is therefore the area the project covered,
>   and `pricing.total` is the price for that whole dwelling.
> - `partial_remodel` — the project addressed a **bounded subset of spaces**. `pricing.total`
>   covers **only that subset**, and `property.area` is the area of the dwelling the subset sits
>   in — **not** the area the price bought.
> - absent — anything else (`PT6`).

**Spaces, not trades.** The axis is *how much of the dwelling was remodelled*, measured in **spaces**.
An individual **trade** the project did not include — windows kept, no expansion — is a detail of the
project, not a boundary of it: nearly every whole-home remodel omits some trade, and the total still
buys the whole dwelling. A **space** left out is a boundary, because the total then does not cover
the dwelling `property.area` measures.

*(rev 1 instead carried an exception for "one already-good space". Both reviewers showed that was
elastic enough to license exactly the inference `PT3` forbids. A space exclusion now always
disqualifies `full_remodel` — `PT4`(b) — and the trade/space distinction does the work the exception
was reaching for, as a lookup in §7.3's two tables rather than a judgement.)*

### 5.3 The producer never infers it

> **PT3 (P: MUST)** — `projectType` is emitted only from an authored source field. It is never
> inferred from `category`, the title, the body text, the scope count, the duration or the price.
> No authored value = omitted. (OD-F.)
>
The two values are qualified **separately**. A disqualifier for one is not a disqualifier for the
other — a `partial_remodel` is *defined* by the spaces it leaves out, so a single rule that omitted
`projectType` whenever the source named an excluded space would delete every partial.

> **PT4 — when `full_remodel` may be authored.** All of:
> - **(a)** the source states that the project covered the dwelling **as a whole**;
> - **(b)** the source names **no space** that was left out, and **no space that received only
>   maintenance-level work** — 실리콘·수전만 교체, 덧방, 부분 보수. A space that was not really
>   remodelled is a space that was left out, whichever verb the source uses;
> - **(c)** `workScopeIds` contains at least one id from the **Spaces** table of §7.3. A project
>   that ran only trades across the dwelling is not a remodel of it. Machine-checked: `INV-29`.
>
> A stated exclusion of an individual **trade** — 창호 그대로, 확장 없음 — is **not** a disqualifier
> under (b): §7.3's two tables decide what is a space and what is a trade, so this is a table
> lookup, not a judgement. It is also not by itself evidence **for** `full_remodel`; (a) must hold.
>
> **How `PT4` is enforced.** (a) and (b) are **AUTHORING rules — not machine-checked, not `VA1`
> conditions**: they are judgements about source prose, and `PT3`/`WS4` forbid the emitter reading
> prose at all, so a fail-closed `VA1` could never satisfy them. (c) **is** a `VA1` condition, as
> `INV-29`. The same split applies to `PT5`, `PT6` and `ST2`. This is the label `WS9` and `ST6`
> already carry; rev 3 created it and did not apply it here.
>
> **PT5 (authoring rule — not machine-checked) — when `partial_remodel` may be authored.** The source states a
> **bounded set of spaces** the project covered. The spaces outside that set are its complement, not
> a disqualifier; `PT4`(b) does not apply here.
>
> **A bounded job whose only work is a trade run through the space is authored breadth-absent, not
> `partial_remodel`.** 거실 바닥만 교체 bounds one space, but `WS9` authors the trade alone — the
> living room's layout, fixtures and built-in elements did not change — so the record would carry
> `[flooring]` and no `Spaces` id, and `INV-30` would reject it. This is `bi-19`'s case at one-room
> scale and it takes `bi-19`'s answer: the document does not establish how much of the dwelling the
> price bought, so breadth stays unknown. **Cost, accepted:** such a job is never a direct answer to
> any request; on a trade-only request it is `fallback`, ordered by the trades it lists (`EV2`,
> `OQ-1`), and its total is stated as a fact (`GR1`). Closing it properly needs the
> producer-declared closed **trade** set deferred in §17.2. *(Without this sentence `PT5`, `WS9` and
> `INV-30` have no authoring that satisfies all three — the round-6 reviewer's `M-6`.)*
>
> **PT6 (authoring rule — not machine-checked)** — in every other case `projectType` is **omitted**: the source frames the project as
> something other than a remodel (홈스타일링, staging, furnishing), or makes no statement of breadth
> at all, or the statements it makes contradict one another, **or the source states a bounded job
> whose only work is a trade** — `PT5`'s own case, `bi-19`'s 바닥·도배·조명 across every room: `PT5`
> needs a bounded set of *spaces* and `PT4`(c) needs a *space* id, and such a job has neither, so it
> is breadth-absent by construction. *(Rev 9: the fourth ground was missing, so the gloss did not
> cover the case `PT5` states normatively three paragraphs above — round 7's `m7-6`, round 8's
> `m8-7`. Nothing about `PT5` changes; the enumeration is completed.)*

`PT4`(b) is why `bi-03` and `bi-05` carry no `projectType`, and `PT4`(c) is why a
바닥·도배·조명-only job does not (§13). A field that would let a `full_remodel` declare its excluded
trades explicitly is **deferred** (§17).

---

## 6. `property`

```
property?: {
  type?: "apartment" | "officetel" | "villa" | "detached_house" | "mixed_use" | "commercial",
  area?: { value: number, unit: "m2"|"sqft"|"pyeong", basis?: "supply"|"exclusive" }
}
```

`property.area` is V0's record-level `area`, **moved unchanged**. Every V0 rule survives verbatim:
`AR1` (unit required whenever area is present), `AR2` (basis omitted = unknown, never the string),
`AR3` (value and unit as authored, no conversion), `AR4` (unit conversion belongs to the consumer;
`m2/pyeong = 400/121`, `m2/sqft = 0.09290304`), `AR5`, `AR6`.

`property.type` takes up V0's reserved `propertyType` as a structured field (`SD1`). The vocabulary
is deliberately small — it covers the Korean residential-and-adjacent market without becoming an
ontology (§1.1). Absent = unknown. An unrecognised value is an **unknown value** and the record
survives (`compatibility.consumerUnknownEnumValue`; note `AR6` itself covers only unit and basis).

`property` is omitted entirely when both sub-fields are absent (`MD4`).

> **PY1 (C: MUST)** — `AR5` is not relaxed by anything in V0.2: *supply ↔ exclusive is never
> converted by either side; different bases are not compared; one unknown basis lowers confidence.*
> A visitor who says "전용 84㎡" states an **exclusive** area; it is never converted to a supply
> figure to match a record, nor the reverse. (OD-L.)

---

## 7. `workScopes` — a contract-defined canonical vocabulary

### 7.1 Why not a facet

V0's `facets.scope` fails this job three ways, all by design:

- `VO2` — facet ids are opaque and meaningful only inside one document, so a consumer cannot learn
  that site A's `"주방"` and site B's `"주방·팬트리"` are the same thing.
- `scope` is *"closed at the authored granularity … a composite token is one opaque value"*, so
  `"거실·다이닝"` can never be tested against a request for dining.
- `SD1` — work scope is a structured fact.

V0's own deferred list already anticipated this (*"managed scope vocabulary (hierarchy, aliases) …
after the first real customer data"*). V0.2 brings it forward.

### 7.2 Shape

Document level, a sibling of `facets` — **not** inside it. A plain id array: the ids are fixed by
this contract, so a label table in the document would be redundancy that can drift, and the
consumer must own the visitor-language table anyway (`WS6`).

```
workScopes?: WorkScopeId[]          // sorted, closed both ways (WS2)
```

Record level:

```
workScopeIds?: WorkScopeId[]        // non-empty when present; omitted, never []
```

### 7.3 The vocabulary (normative, closed)

26 ids. The gloss fixes what each id covers, so that two producers make the same choice — without a
gloss, a shared id list does not actually produce shared meaning.

**Spaces** — a room or a defined area of the dwelling.

| id | covers |
|---|---|
| `entrance` | 현관, 중문, shoe storage at the entrance |
| `living_room` | 거실 |
| `dining` | 다이닝 / 식사 공간, when named separately from the kitchen |
| `kitchen` | 주방, sink and counter run, 주방 storage |
| `pantry` | 팬트리, a separate food-store room |
| `bedroom` | 침실, 안방 and other bedrooms for adults |
| `kids_room` | 아이방, 자녀방 |
| `dressing_room` | 드레스룸, a separate wardrobe room |
| `study` | 서재, a home office |
| `bathroom` | 욕실, 화장실, 샤워실 — any of them |
| `hallway` | 복도 |
| `balcony` | 발코니, 베란다, including an extended one |
| `storage` | 창고, 팬트리가 아닌 수납 공간 — a **dedicated** storage space. Joinery built **inside** another space is `built_in_furniture`, not `storage` |
| `utility` | 다용도실, 세탁실 |

**Works** — a trade applied across spaces.

| id | covers |
|---|---|
| `flooring` | 바닥재 |
| `wallpaper` | 도배 |
| `lighting` | 조명 |
| `windows` | 창호 |
| `doors` | 문, 문틀 |
| `tiling` | 타일 |
| `painting` | 도장, 페인트 |
| `plumbing` | 배관, 수전 |
| `electrical` | 전기, 배선, 콘센트 |
| `built_in_furniture` | 붙박이장, 제작 가구 — joinery inside another space |
| `expansion` | 확장 |
| `demolition` | 철거 |

Adding an id is a **minor** bump (`SV2`: enum value addition). The list mixes spaces and works on
purpose: that is how visitors speak ("주방이랑 욕실", "바닥이랑 도배만").

### 7.4 Rules

> - **WS1 (P: MUST, with an AUTHORING half)** — values come from §7.3 and nowhere else. A source
>   item that cannot be mapped to an id without judgement is **omitted**, never passed through as
>   free text. *"Without judgement"* is not machine-checkable and is **not** a `VA1` condition: `VA1`
>   fails a document closed to unknown ids, not one whose author mapped a borderline item wrongly.
>   Like `WS9`, the omission half is guidance for whoever fills the authored field.
> - **WS2 (P: MUST)** — closure both ways, as `VO1`: every id used by a record appears in the
>   document's `workScopes`; every id in `workScopes` is used by at least one record; a document
>   with no work scopes does not emit the block.
> - **WS3 (P: MUST)** — `workScopeIds` is a **set**. Ids are unique and quantity is not
>   represented: a case that redid two bathrooms and one that redid one both emit `bathroom`.
>   *Accepted limitation* (OD-G is satisfied; both reviewers agreed). Quantity lives in the title
>   and the detail page. A structured `property.bathrooms` is deferred (§17).
> - **WS4 (P: MUST)** — emitted from an authored source field (`ND1`). Never split, inferred or
>   completed from free text: `"거실·다이닝"` becomes `["living_room","dining"]` only because an
>   operator authored those two ids, never because the emitter split a string.
> - **WS5 (P: MUST NOT)** — never `[]`. `MD3` reserves `[]` for `records`; absent = unknown.
> - **WS6 (C: MUST)** — match on `id` only. Every mapping from visitor language to an id
>   (부엌→`kitchen`, 화장실→`bathroom`, 싱크대→`kitchen`) belongs to the consumer and is **never**
>   emitted by the producer. V0 `02` §11.2 ownership, unchanged.
>
>   **One reading per term (`C: MUST`; rev 9.2).** The consumer's table maps each visitor term to
>   **one** id or to none, so a query has exactly one `Q` (§14.3.1). Where a word has more than one
>   plausible reading — 수납 as `storage` or as `built_in_furniture`, 복도 as `hallway` or as nothing —
>   the table fixes one, and the reply says which reading it used (§14.3.6). The choice is the
>   consumer's and is part of `V`; the evaluation is a function of `V` (§14.3.1).
>
>   *Rev 9.2.* Through rev 9.1 an ambiguous term put **every** reading into `V.scope`, and three rules
>   (`D9-7a`, `D9-8`, `D9-9`) reconciled the per-reading results — one of them by assigning a state
>   outside the rule that owns states (`31-` `B9-3`). Row I of `04` §4.1 showed the cost: on
>   *"현관 수납"* the one matching record, `bi-18`, came back `not_evaluable`, below six whole-home
>   remodels. One reading per term deletes all three rules and the conflict with them. The rev-9.1
>   text is in the archive.
> - **WS7a (P: MUST, C: MAY rely on)** — when `projectType == "partial_remodel"`,
>   `workScopeIds ∩ Spaces` is **closed** in exactly the sense `WS9` authors in: it is the complete
>   set of spaces **that were remodelled** — spaces whose layout, fixtures or built-in elements
>   changed. This is what makes `PT2`'s *"covers only that subset"* mean something, and it is what
>   `EV2` row 6's `R_s = Q_s` reads (§14.3.2).
>
>   **An absent space id means that space was not remodelled. It does not mean no work reached it.**
>   `bi-17` authored `[living_room, flooring]` and its 12,500,000 re-floored the bedrooms, because
>   flooring is a trade run *through* them. A disclosure may say *"침실은 리모델링 범위에
>   없었습니다"*; it must never say *"침실에는 아무 공사도 하지 않았습니다"*. Pairing `WS9`'s
>   trade-through-a-space rule with a closure read as "the money touched only these rooms" would put
>   a falsehood on the other axis from the one `M-11` removed.
>
>   The **works** in the set are **open even for a partial** (`WS7b`). Closure over works is not
>   achievable: `WS9` is an authoring judgement `VA1` cannot check, and `WS1` omits any source item
>   §7.3's gloss does not cover — so `bi-14`, authored `[kitchen]`, describes engineered-stone
>   worktops, wall tiling and an undermount sink in its own body, and a consumer relying on closure
>   could state *"이 금액에 타일 공사는 포함되어 있지 않습니다"*, which is false. An absent **space**
>   id is a fact; an absent **trade** id is *unknown*.
> - **WS7b (C: MUST NOT)** — for every other `projectType`, including absent, the set is **open**:
>   a record without `flooring` is *unknown* on flooring, never *confirmed without* it. Do not infer
>   exclusion.
> - **WS7c (P: MUST — consequence, stated because it surprised the implementation)** — a record that
>   states `projectType` **at all** carries `workScopeIds`. For `partial_remodel` this is `INV-28`;
>   for `full_remodel` it is `PT4`(c)/`INV-29`, which an absent set cannot satisfy. This is intended:
>   §4's whole point is that a breadth claim no structural fact backs is not emitted. It does **not**
>   make `workScopeIds` mandatory in general: a **breadth-absent** record may omit it entirely.
>
>   **Cost, stated plainly.** `WS7c` deletes one legitimate shape — *breadth known, `workScopeIds`
>   unauthorable* — and that shape is reachable, not hypothetical. `WS1` omits any source item the
>   §7.3 gloss cannot cover without judgement, and the live demo already carries **20 distinct
>   free-text scope values across 8 records** (§1). A migrating site whose scope vocabulary is
>   compounds the gloss does not cover loses breadth on every record, including records whose CMS
>   states 전체/부분 outright. That the demo loses nothing is true of the demo and of nothing else.
>   The mitigation is `WS4`: ids may be authored by an operator pass over the site's own scope
>   field, and that pass is a prerequisite wherever breadth matters.
> - **WS8 (C: MUST)** — an id the consumer does not know is an **unknown value**: ignore that id,
>   keep the record, never reject the document (§12). **Dropping an id does not make the remaining
>   set a fact:** `WS7a`'s closure holds only for a record every one of whose ids was recognised.
>   For a record the consumer dropped an id from, **no absence may be stated**, and `EV2` row 6 —
>   which is where the class is assigned, never here — does not make it `exact` (`CINV-9`). Adding an
>   id is a **minor** bump
>   (§3), so a `1.0` consumer reading a `1.1` document is the designed-for case, not an error case.
> - **WS9 (AUTHORING rule — not machine-checked, not a `VA1` condition)** — guidance for whoever
>   fills the authored field.
>
>   **Author a `Spaces` id only when that space itself was remodelled** — its layout, its fixtures
>   or its built-in elements changed. **A trade run *through* a space** — new flooring, new
>   wallpaper, a new ceiling light — **is authored as the trade id alone.** When both happened,
>   author both. When §7.3's gloss does not cover the item, author nothing (`WS1`). Styling that
>   does not alter a space — furniture placement, curtains, art — is not a work scope.
>
>   **Installing joinery is not by itself a remodel of the space it stands in** — except where §7.3's
>   gloss for a space names the joinery itself, which is the more specific rule and wins: `entrance`
>   is glossed *"현관, 중문, shoe storage at the entrance"*, so a shoe-cabinet-only entrance job
>   **is** `entrance`. Everywhere else the sentence below applies. A 복도 붙박이장 is
>   `built_in_furniture` and **not** `hallway`; the `hallway` id is authored only when something else
>   about the 복도 changed — its layout, its floor, its ceiling. Without this sentence the gloss
>   above ("its built-in elements changed") and §7.3's ("joinery built *inside* another space is
>   `built_in_furniture`") both hold, one record supports two authorings, and **one utterance gets
>   two opposite scope relations and two opposite disclosures**: `bi-18` authored
>   `[entrance, built_in_furniture]` makes *"현관이랑 복도 수납"* an `overlap`, with 복도 reported as
>   *not remodelled in this case*; authored `[entrance, hallway, built_in_furniture]` it is `exact`,
>   with no absence stated at all (`EV2`).
>
>   *Rev 3 said only "when the project **touched** a space", which decides nothing: re-papering a
>   bedroom either "touches" `bedroom` or does not, and `PT4`(c)/`INV-29` returns the opposite
>   verdict for each reading. On `bi-19` that is not academic — authoring `bedroom` would make
>   `full_remodel` authorable, `D-1` would fire, and the producer would emit 11,000,000 ÷ 32평 =
>   **343,750/평** carrying a `source: "derived"` badge, with `INV-19` and `VA1` both silent because
>   `projectType` is `full_remodel`. A machine check resting on an undefined term is a judgement
>   wearing a machine check's badge. The Spaces/Works split became load-bearing in three new places
>   in rev 3 — `PT4`(c), `INV-29` and the scope relations — so the gloss has to decide.*
>
>   `WS9` binds the **author**, never the emitter: the emitter copies the authored field and never
>   reads prose (`WS4`). Rev 2 phrased `WS9` as a `P: MUST` over "the source", which read as a
>   requirement to extract ids from body text — the very thing `WS4` forbids — and would have made
>   a fail-closed build reject any record whose prose mentioned a trade the author had not listed.

### 7.5 What the producer does not decide

Aliases, hierarchy, synonyms and compounds are the consumer's (`WS6`, V0 `02` §11.2). The producer
never emits a synonym table, and the same mapping is never maintained on both sides.

---

## 8. Facets in V0.2

| key | layer | V0.2 status |
|---|---|---|
| `category` | portfolio | **kept, unchanged.** Exactly 1 per record (`INV-16`). Still a match key. |
| `tag` | portfolio | **kept, still emitted.** Descriptive words that are not style. |
| `style` | builtSpaceAnnex | **new.** 0+ per record; omitted when none, never `[]`. |
| `scope` | builtSpaceAnnex | **retired**, replaced by `workScopeIds` (§7). |

Everything else about facets is unchanged: `facetKeyPattern`, the `{id,label}` shape, `VO1` closure,
`VO2` opacity, `VO3` label-is-not-a-synonym, `VO4`, `VO5`, `VO6`, `facetKeyOrder`, `facetValueOrder`.

> - **ST1** — `facets.style` carries **style / mood only**: colour, material feel, atmosphere.
>   From the current data: `화이트`, `미니멀`, `모던`, `내추럴`, `그레이지`, `우드 포인트`.
> - **ST2 (authoring rule — not machine-checked)** — a value that is not style is not relabelled as one. `간접조명` is a lighting
>   technique and `수납 특화` is a functional feature; both stay in `tag`. *Missing beats a false
>   semantic truth* (OD-H).
> - **ST6 (AUTHORING rule — not machine-checked)** — classify a given word the same way across a
>   site. `ST4` subtracts **per record**, so if `bi-01` calls 화이트 a style and `bi-05` leaves it an
>   ordinary keyword, the document's `facets.style.values` and `facets.tag.values` both declare
>   화이트 while no single record carries it twice. That is inconsistent authoring, not a contract
>   violation, and it is **not** a build failure: making it one would reject honest data, and the
>   alternative — letting one record's classification rewrite another's — would make a facet id mean
>   something outside the record that carries it, which `VO2` (ids are opaque within one document)
>   and `VO3` (a label is not a synonym dictionary) forbid. *(Rev 3 cited `ND1` here. `ND1` is a
>   `P: MUST NOT` on the producer and does not bind the consumer.)*
>
>   **P: SHOULD warn at build.** A value present in both document-level vocabularies is trivially
>   detectable and is a pure authoring error; `VO6` and `RD1` both warn for cheaper problems. The
>   warning keeps the "not a build failure" decision and still gives `ST6` a feedback channel.
>   The consumer is required to tolerate it (`ST7`, `CINV-12`).
> - **ST3 (C: MUST)** — `style` is a **weak ranking bonus**, never a filter. A style miss removes the
>   bonus; it never removes a record and never fails a search (§14.4).
> - **ST4 (P: MUST)** — `facets.style` is the authored style list. `facets.tag` is the authored
>   descriptive-word list **minus** every value that is in the style list, in the surviving authored
>   order, with the key omitted when nothing survives. No value appears in both (`SD1`).
>   The **classification** is authored — that is `INV-25`'s referent — while the **subtraction** is
>   mechanical set difference over authored values and invents nothing, so it is not an inference
>   and `ND1` is untouched.
>
>   *Rev 2 required the two lists to be authored disjointly. The delta review showed that fails on
>   18 of 19 demo records and would fail the build: an operator tags 화이트 once, and it is both a
>   keyword the site displays and a style the search uses. Demanding it be typed twice, in two
>   fields, with neither allowed to contain the other, is a rule no author can follow.*

`VO6` limits: `scope: 150` is retired. A limit for `style` is **to be declared by the consumer**
through the `VO6` procedure — limits are consumer-declared, and the producer only sets build
warnings from them. `category: 50` and `tag: 150` are unchanged.

---

## 9. `pricing`

```
pricing?: {
  total?:   { kind: "exact", amount, currency }
          | { kind: "range", minAmount, maxAmount, currency },
  perArea?: { amount, currency, perUnit: "m2"|"sqft"|"pyeong",
              source: "authored" | "derived" }
}
```

Amounts: a **positive** number in the currency's major unit, ≤ 2 fraction digits, ≤ 1,000,000,000,
as authored. `currency`: ISO 4217, machine-checked only as `^[A-Z]{3}$` (V0 `priceRules.shape`).
`pricing` is omitted when both sub-fields are absent (`MD4`).

### 9.1 `total` — exact XOR range, structurally

The `kind` discriminant makes "exact and range cannot coexist" a **structural** guarantee rather
than a validator rule. *(The requirement comes from the owner's task brief §10 — "exact/range 동시에
존재하는 모호한 객체 금지" — recorded at OD-I. It is **not** a V0 rule and rev 1 wrongly quoted it as
one.)*

> - **TP1 (P: MUST)** — `kind: "range"` requires `minAmount < maxAmount`. Equal bounds are not a
>   range: emit `kind: "exact"`.
> - **TP2 (P: MUST)** — `pricing.total` is the price of the work that case describes, as authored.
>   Inclusion scope (VAT, demolition, furniture, appliances) remains **unknown for every record** —
>   V0 `PR3` verbatim. A total is a coarse comparison indicator, never a quote.
> - **TP3 (P: MUST NOT)** — a total is never derived. `perArea.amount × area.value` is forbidden in
>   **every** field: V0 `PR5`, retained in full and not relaxed. The name `totalCost` stays reserved.

### 9.2 `perArea` — V0's `pricePerArea` plus provenance

> - **PA1 (P: MUST)** — `source: "authored"`: the operator entered this per-area price (V0 `PR1`).
>   Authored always wins over derivable.
> - **PA2 (P: MUST)** — `source: "derived"`: computed by the producer under §9.3.
> - **PA3** — a derived `perArea` is per the record's `property.area` **exactly**, including its
>   `basis` **or the absence of one**, which it inherits silently. `AR5` applies to it unchanged.
> - **PA4** — V0 `PR2` survives **for an authored `perArea`**: the **price basis** — which area
>   figure the price is stated against — is unavailable and unknown, and is never inferred from
>   `area.basis`. *(Inclusion scope is a different question, `PR3`, covered by `TP2`.)*
> - **PA5** — a **derived** `perArea` is the one exception, and it is not an inference: by `RD1` its
>   divisor *is* `property.area`, so its price basis **is** that area's `basis`, or is unknown when
>   the area has none. `source` is therefore what tells the consumer whether the price basis is
>   known: `derived` ⇒ it equals `property.area.basis`; `authored` ⇒ unknown (`PA4`).
>   A **comparative** per-area claim would need a known price basis on both sides, and `source` is
>   the only thing that supplies one. (`AR5` is a separate conjunct about the **area** bases.)
>   ***V0.2 compares no `perArea` (§14.3.3), so `source` guards nothing yet. The field is still
>   emitted and still required (`PA1`–`PA5`): a later per-area comparison reads it, and removing it
>   would make that a schema change instead of a consumer change.***

There is no range form for `perArea`: V0.2 has no evidence one is needed, and an unnecessary variant
is an unnecessary way to be wrong.

### 9.3 `ND2` — the one permitted derivation

V0 `ND1` forbids all derivation. It is **split, not weakened**:

> **ND1 (unchanged in force)** — the producer MUST NOT emit any value that is inferred, estimated,
> converted or synthesised rather than present in a source field. No source fact = omitted. This
> governs every fact about a record: `projectType`, `property.type`, `workScopeIds`, `facets.style`,
> `facets.tag`, `location`, `pricing.total`, an authored `perArea`.
>
> **ND2 (new, exhaustive)** — the producer MAY emit a **declared deterministic derivation** only
> when (a) this contract fixes the formula and the rounding, (b) every input is a fact present in
> the **same record**, (c) the output carries explicit provenance, and (d) the derivation is in the
> list below. **The list has exactly one entry in V0.2.**

#### D-1 · derived per-area price

Emit `pricing.perArea` with `source: "derived"` **if and only if** all of:

1. `projectType == "full_remodel"` — by `PT2` the area and the total then describe the same thing;
2. `pricing.total.kind == "exact"` — a range has no single right answer;
3. `property.area.value` and `property.area.unit` are present;
4. `pricing.perArea` was **not** authored (`PA1`);
5. the arithmetic guards of `RD1` hold.

**RD1 — arithmetic (normative, integer only).** Floating-point division is forbidden: it is not
reproducible across platforms, which would break `INV-1` and `INV-26`.

```
T = round(total.amount    * 100)      // exact integer; amounts have <= 2 fraction digits
A = round(area.value      * 100)      // exact integer

guard: A >= 1  and  A <= 100_000_000  and  T >= 1  and  T <= 100_000_000_000
perArea.amount = floor( (2*T + A) / (2*A) )                  // round half up, integer major unit
guard: 1 <= perArea.amount <= 1_000_000_000
```

The upper guard on `A` exists because V0 `areaRules.shape` caps `area.value`'s *fraction digits*
but not its *magnitude*, so without it `round(area.value * 100)` is not guaranteed to be an exact
integer. No wrong number could escape — the output guard would catch it — but "exact integer
arithmetic" would not be true as claimed.

`perUnit` is the record's own `area.unit`, never converted. `currency` is the total's.

Worked: `52,000,000 KRW / 34 pyeong` → `T=5_200_000_000, A=3_400` →
`floor(10_400_003_400 / 6_800) = 1_529_412`. Exact value `1,529,411.76…`, rounded half up. ✓

If a guard fails, **no `perArea` is emitted** and the build emits a warning (as `VO6` does). A
guard failure is a data problem to look at, not a reason to emit a number nobody can trust.

Every currency rounds to an integer in its major unit. A currency-aware minor-unit policy is
deferred (§17); the consequence — sub-unit precision is dropped for currencies with cents — is
accepted for V0.2 because the only live currency is KRW, which has no minor unit in practice.

#### What D-1 forbids

> - **D-1a (P: MUST NOT)** — never derive when `projectType` is `partial_remodel` or absent.
>   *A 34평 flat whose bathroom cost 6,000,000 KRW has no per-area price.* `6,000,000 / 34` is
>   meaningless and is never emitted. **This is the single most important prohibition in V0.2**
>   (OD-K).
> - **D-1b (P: MUST NOT)** — never derive in the other direction (`TP3`).
> - **D-1c (C: MUST NOT)** — the consumer never performs `D-1`, or any variant, itself. No producer
>   `perArea` means the record is **not evaluable** on per-area price (V0 `BU2` semantics). `D-1c`
>   is given an enforcement point in §14.3.7 (`GR5`) — a prohibition an LLM cannot be asked to obey on its
>   own honour.

---

## 10. Record shape — complete

```
PortfolioRecordV02 {
  id:           string   // ^[a-z0-9]+(?:-[a-z0-9]+)*$, <=64, site-local
  title:        string   // 1..120, untrusted operator text
  detailUrl:    string   // UR2 root-relative path
  publishedAt?: string   // ISO-8601 instant with offset
  location?:    string   // 1..80, display; ranking weight 0 (LO1)

  projectType?:   "full_remodel" | "partial_remodel"
  property?:      { type?: PropertyType, area?: { value, unit, basis? } }
  workScopeIds?:  WorkScopeId[]        // non-empty; never []; closed iff partial_remodel (WS7a)
  pricing?:       { total?: TotalPrice, perArea?: PerAreaPrice }

  facets?:        { category: [string], tag?: string[], style?: string[] }
}

PortfolioDocumentV02 {
  schemaVersion: "1.0"                 // §3
  resource:      "portfolio"
  version:       string                // RV1..RV5 unchanged
  listingUrl?:   string
  workScopes?:   WorkScopeId[]         // sorted; WS2 closure
  facets?:       { <key>: { values: [{ id, label }] } }   // VO1 closure
  records:       PortfolioRecordV02[]
}
```

`facets` is formally optional but `category` is required inside it, so any document with at least
one record emits `facets`.

Manifest: unchanged, `schemaVersion` stays `"0.1"`.

### 10.1 Field map V0 → V0.2

| V0 | V0.2 | note |
|---|---|---|
| `record.area` | `record.property.area` | moved; semantics identical |
| `record.pricePerArea` | `record.pricing.perArea` + `source` | `source` is new and required |
| `record.facets.scope` | `record.workScopeIds` + `document.workScopes` | site-local free text → canonical ids |
| `record.facets.tag` | unchanged | still emitted, still a match key |
| `record.facets.category` | unchanged | still exactly 1 (`INV-16`), still a match key |
| — | `record.projectType`, `record.property.type`, `record.pricing.total`, `record.facets.style` | new |
| `id`,`title`,`detailUrl`,`publishedAt`,`location`,`listingUrl` | unchanged | |

**No field keeps its name and changes its meaning**, so no reader can silently misread a V0.2 value
as a V0.1 value.

---

## 11. Determinism, version, serialisation

Unchanged from V0 §6.1 and §15, extended to the new blocks:

- record order: `id` ascending, Unicode code point order.
- `facets` key order and `facets.*.values` order: id ascending, code point order.
- `document.workScopes`: **id ascending, Unicode code point order**.
- `record.workScopeIds`, `record.facets.style`, `record.facets.tag`: **authored order**, keeping the
  first occurrence of a duplicate (V0 `recordFacetArray`). The consumer reads no meaning into order.
- numbers and strings as authored; no normalisation, trim or case change; no exponent notation —
  `RD1`'s cap keeps every derived value inside that rule.
- `version` = `sha256(canonical JSON of the document without its own `version`)`, sorted keys, first
  32 hex. `RV1`–`RV5` unchanged. A derived `perArea` is part of the body and therefore part of the
  version, as it must be.

---

## 12. Validation

**Document-level — C: MUST reject the whole document (TRANSIENT):**
`workScopes` present but closure broken against **the document's own declaration** (`WS2`);
`workScopes` not an array of strings; malformed `schemaVersion`; plus every V0 document-level
violation.

> An id that is simply **unknown to the consumer** is not a closure failure. `WS8` applies: ignore
> the id, keep the record. Otherwise a minor vocabulary addition would turn every document TRANSIENT.

**Record-level — C: drop that record only:**
`projectType` present and not a string; `property.type` present and not a string; malformed
`property.area` (V0 §9); `pricing.total` missing
`kind`, or `kind: "range"` with `minAmount >= maxAmount`, or a **non-positive** or non-finite
amount; `workScopeIds` present but empty or not an array of strings; plus every V0 record-level
violation.

**Unknown value — treat that value alone as unknown; never drop the record or the document:**
an unrecognised `projectType`, `property.type`, `WorkScopeId`, `unit`, `basis`, `perUnit`,
`currency`, `total.kind`, or `perArea.source`; an unknown facet key; any unknown field.
A `perArea` whose `source` is missing or unrecognised is treated as **`perArea` absent** — it loses
less than dropping the record. A `total` whose `kind` is missing or unrecognised is likewise treated
as **`pricing.total` absent**: the amounts cannot be read without knowing which shape they are, and
a price the consumer cannot name is not a price. The rest of the record — area, scopes, breadth,
facets — survives, and `EV3` gives it the price tier `none` — noted `missing` where the price tier
applies, `not_applied` where it does not: no evidence, no penalty below it, no exclusion (`PB4`).

> **VA1 (P: MUST)** — the producer's emitter validator is **fail-closed**: an opted-in public build
> that cannot satisfy every `P: MUST` here **fails the build**; it never silently emits a degraded
> document. (V0 `portfolio.producerRules`, unchanged.) The `RD1` guard failure of §9.3 is the one
> warn-and-omit case, and it is warn-and-omit precisely because emitting nothing is correct there.

---

## 13. The `category` audit, and the resulting `projectType`

All 8 current records, against the source text. *(`bi-03` disagrees with its own `category`.)*

| id | `category` | authored evidence | `projectType` |
|---|---|---|---|
| bi-01 | full-remodel | summary: "…34평 아파트 **전체 리모델링**입니다." | `full_remodel` |
| bi-02 | full-remodel | no breadth statement anywhere in title, summary, body or quote | **absent** (`PT6`) |
| bi-03 | full-remodel | body: "**욕실은** … **그대로 두었습니다**" — a **space**; `scope` also omits 안방 and 작은방 of a 42평 flat | **absent** (`PT4`b) |
| bi-04 | kitchen-bath | summary: "주방과 욕실 **두 곳만 골라** … **부분 리뉴얼**입니다." — a bounded set | `partial_remodel` (`PT5`) |
| bi-05 | full-remodel | summary says "**전체 리모델링**", but the body says "욕실은 … **실리콘과 수전만 교체**했습니다" — maintenance-level work on a space | **absent** (`PT4`b) |
| bi-06 | partial-remodel | summary "…**부분 리모델링**입니다."; body "방과 주방은 … 그대로 두고" — a bounded set, and its complement is not a disqualifier | `partial_remodel` (`PT5`) |
| bi-07 | full-remodel | summary: "…**전체 리모델링**입니다."; no space left out; spaces present | `full_remodel` (`PT4`) |
| bi-08 | move-in-styling | body: "새 아파트라 **철거 없이** 진행했습니다." | **absent** (`PT6`) |

**full 2 · partial 2 · absent 4.**

Three boundary cases, each decided by a table lookup rather than a reading of tone:

- *"창호는 그대로 두어"* on a whole-dwelling job — `windows` is in §7.3's **Works** table, so
  `PT4`(b) does not fire and the record stays `full_remodel`.
- `bi-03`'s *"욕실은 … 그대로 두었습니다"* and `bi-05`'s *"욕실은 … 실리콘과 수전만 교체했습니다"* —
  `bathroom` is in the **Spaces** table, so `PT4`(b) fires for both. **The two are now decided
  alike.** Rev 2 let `bi-05` keep `full_remodel` because the operator had written "전체 리모델링"
  and the caveat was merely "logged"; the delta review showed that made the classification turn on
  the verb rather than the fact, and that a future total on `bi-05` would have fed `D-1` a
  per-area price for a dwelling one room of which was not remodelled. `PT4`(b) now names
  maintenance-level work on a space explicitly.
- a job touching every room but running only 바닥·도배·조명 — `PT4`(c): no id from the Spaces table,
  so `full_remodel` is not available. Machine-checked by `INV-29`.

All three shapes exist in the expanded demo set
(`docs/result/interior-portfolio-v0.2/04-demo-data-spec.md`), which is how the rule is exercised
rather than merely asserted.

Two conclusions:

1. **`category` cannot be mapped to `projectType`** (`PT3`, `SD2`). `kitchen-bath` and
   `move-in-styling` describe *what kind of job it was*, not *how much of the dwelling it touched*,
   and `bi-03` shows the axes can disagree outright.
2. **The mapping is a one-time authoring decision, not an emitter rule.** Each value is written into
   `data/sites/boost-interior-demo/content/projects.json` as an authored `projectType` with the
   evidence row above as its justification; the emitter copies it.

`bi-05`'s summary says 전체 리모델링 and its body says the bathroom received 실리콘과 수전만.
`PT4`(b) governs: a space that was not really remodelled is a space that was left out, whichever
verb the source uses, so breadth is **not** established and `projectType` is omitted. *(Rev 2 kept
`full_remodel` here and "logged" the caveat rather than overriding it — which let the verb decide
instead of the fact. That sentence survived rev 3 thirty lines below the row that reversed it; an
author reading to the end of §13 would have authored `bi-05` as `full_remodel`, and since it has an
area, a later total would have produced a derived per-area price for a dwelling whose bathroom got
silicone and taps.)* `bi-02` was classified
`full_remodel` in rev 1 on the grounds that its scope covered the principal spaces and no exclusion
was stated — that is inference from absence, which `PT3` forbids, and it is why it is now absent.

---

## 14. Consumer obligations

Stated as **observable** obligations. How the consumer is structured internally is its own business
and is recorded in its implementation report, not here.

### 14.1 The annex stays out of the generic core

> **GC1 (C: MUST)** — no field of the built-space annex — `projectType`, `property`, `workScopeIds`,
> `pricing`, `facets.style` — appears in any interface that is not built-space-specific. Observable
> test: a vertical with no built space can be added without touching conversation, tool dispatch,
> gating, audit, card transport or lead storage. (OD-B.)

### 14.2 `location` ranking weight is zero

> **LO1 (C: MUST)** — `record.location` contributes **0** to portfolio ranking: no score weight, no
> tie-break, and it is not reported as an applied search criterion. V0 already said *"display only,
> not a match key"*; V0.2 states the weight because it is easy to re-introduce by accident, and the
> current implementation does exactly that. Whether the **business** serves a visitor's region is a
> separate question answered from business facts, never from record locations. (OD-D.)

### 14.3 The evaluation function

> **Rev 9.2 replaces this section.** Rev 9.1's `EF1`–`EF6`, its scope-relation tables, `GR2`'s ten
> classes, `GR2a`, `GR3a` and its five-key order are retired. Their text and review history are in
> `archive/07-rev9.1-corrected.md`. The replacement follows the owner's brief of 2026-09-25 and was
> worked by hand in `docs/result/interior-portfolio-v0.2/34a-product-rules-and-hand-examples.md`
> before it was written here.

The function takes the visitor query `V` and a record `R` and returns one **match class** and four
**tiers**. The result is ordered by one fixed tuple of those values. That is the whole function.

#### 14.3.1 Inputs

**The visitor query `V`**, extracted by the consumer:

| field | shape | absent means |
|---|---|---|
| `V.breadth` | `whole` · `partial` (`VB3`) | the visitor did not say how much of the home |
| `V.scope` | **one** set `Q` of §7.3 ids; `Q_s = Q ∩ Spaces`, `Q_t = Q ∩ Works` (`WS6`). A room or trade the visitor **excludes** (욕실만 빼고, 주방 제외) is not in `Q` | named no room and no trade |
| `V.area` | value + unit + basis. An area whose unit cannot be resolved, or that is a range or a class (30평대), is **absent**, never guessed | stated no size |
| `V.budget` | `VB1` | stated no budget |
| `V.styles` | style values the visitor stated **positively** (`ST5`) | no style preference |

The contract is a function of `V` and the document. How an utterance becomes `V` beyond `VB1` and
`VB3` — the alias table above all — belongs to the consumer (`WS6`). §19 fixes `V` for every
acceptance row, so the evaluation can be checked without any parser.

> - **VB1 (C: MUST)** — a numeric budget is held in **one** of three shapes, never two:
>   `exact {amount}` · `range {min, max}` · `max {amount}`. *"5천"* is `exact`, *"600~800만원"* is
>   `range` (`CINV-8`: never one bound), *"1억 이내"* / *"최대 1억"* is `max`. Every amount is a
>   positive amount in the site's currency, in the same form as `pricing` amounts (§9). A per-area
>   budget (평당 200만원) is not `V.budget` in V0.2 (`OQ-4`). A budget that cannot be resolved to one
>   of the three is **absent**, never guessed.
> - **VB2 (C: MUST)** — `budgetHint` free text and a resolved `V.budget` are different things. Free
>   text is never compared against a price; only a resolved shape is.
> - **VB3 (C: MUST)** — `V.breadth` is what the visitor said about **the extent of the work**. It is
>   never inferred from `V.scope` alone. The rows are tried in order and the first that matches wins.
>   The left column lists **forms**, not literal strings.
>
>   | # | the visitor says | `V.breadth` |
>   |---|---|---|
>   | 1 | a negation of whole-home framing — 집 전체는 아니고 …, 전체까지는 아니고 … | `partial` |
>   | 2 | a restriction with 만 — of rooms (주방만, 주방이랑 욕실만), of a count (욕실 하나만), of trades (도배랑 바닥만) — or 부분만, 일부만, 몇 군데만 | `partial` |
>   | 3 | the whole dwelling or a whole remodel — 전체 리모델링, 집 전체, 올수리, 34평 전체, 전체 가능해요 | `whole` |
>   | 4 | anything else — a bare enumeration (주방이랑 욕실), qualitative prose (간단하게) | absent |
>
>   전체 qualifying a **trade** (전체 도배, 집 전체 도배, 34평 전체 도배) is a statement about that
>   trade, not row 3: without 만 such an utterance reaches row 4. A restriction always wins over a
>   whole-form, because row 2 is tried first: "34평 전체 중에 주방만" and "전체는 비싸서 욕실만" are
>   `partial`. "X만 빼고" excludes X (`V.scope`); it is not a restriction.
>
>   *Rev 9.2.* "욕실 하나만" is `partial` by owner decision (2026-09-25), so rev 9's rule that 만 on a
>   quantity is not a restriction (`D9-4`) is deleted. Rev 9.1's rows 3–5 become row 2 (a trade
>   restriction, rev 9.1's row 5, moves from absent to `partial`) and its rows 6–7 become row 4. Once
>   a room or trade is named, `partial` and absent select the same mode (§14.3.2), so the move changes
>   no result, and `Q-26` (which of rows 3 and 5 a mixed 만-chain hits) no longer matters. The
>   restriction row sits above the whole-forms since the fresh review of rev 9.2 (`34c` m-2).

**The record `R`**: `R.projectType`; `R.workScopeIds` (`R_s = ∩ Spaces`, `R_t = ∩ Works`); whether
the consumer **dropped** an unrecognised id from it (`WS8`); `R.property.area`; `R.pricing.total`;
`R.facets.style`; `R.id`.

#### 14.3.2 Mode and match class

> **EV1 (C: MUST) — one writer.** The match class is assigned by `EV2` and the tiers by `EV3`.
> Nothing else assigns, overrides or re-derives either. Every other rule — `WS6`, `WS7a`/`WS7b`,
> `WS8`, `GR2`, `GR3` and the disclosures in §14.3.6 — reads them to phrase the reply.

> **EV2 (C: MUST) — mode, then class.**
>
> **Mode**, per query: `whole` if `V.breadth = whole`; else `part` if `V.breadth = partial` or
> `Q ≠ ∅`; else `open`.
>
> **Covers.** `R` covers an id if the id is in `R.workScopeIds`, or if `R.projectType` is
> `"full_remodel"` and the id is in `Spaces` — `PT4`(b) says a whole-home remodel left no room out.
>
> **Class**, per record. The first row that holds wins:
>
> | # | mode | condition | class |
> |---|---|---|---|
> | 1 | `open` | — | `exact` |
> | 2 | `whole` | `R.projectType = "full_remodel"` | `exact` |
> | 3 | `whole` | otherwise | `fallback` |
> | 4 | `part`, `Q = ∅` | `R.projectType = "partial_remodel"` | `exact` |
> | 5 | `part`, `Q = ∅` | otherwise | `fallback` |
> | 6 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel`, no id was dropped from it, and `R_s = Q_s ≠ ∅` | `exact` |
> | 7 | `part`, `Q ≠ ∅` | `R` is a `partial_remodel` and shares an id with `Q` | `overlap` |
> | 8 | `part`, `Q ≠ ∅` | `R` covers an id of `Q` | `fallback` |
> | 9 | `part`, `Q ≠ ∅` | otherwise | `other` |
>
> The three modes partition the queries and each ends in an unconditional row, so every record gets
> exactly one class.

What the table says, in the owner's terms (brief of 2026-09-25, decision A; `OD-P`):

- **A partial request ranks partial exact, then partial overlap, then full or unknown as
  fallback.** On "욕실 하나만" a `partial_remodel [bathroom]` is `exact`; with more rooms it is
  `overlap`; a `full_remodel` is `fallback` — it contains the bathroom, but it is not the job asked
  for. **A `full_remodel` is `exact` only when the visitor asked for a whole-home remodel** (row 2).
  Row 6 needs a `partial_remodel`, because only its room list is closed (`WS7a`).
- **A breadth-absent record is never `exact` on a request that names something.** Its room list is
  open (`WS7b`), so an equal room set establishes nothing. It is `fallback` when it lists a
  requested id.
- **Rooms decide `exact`; trades never do.** A trade a record does not list is *unknown*, not absent
  — for a `partial_remodel` too (`WS7a`) — so an unrecorded trade cannot move a record out of
  `exact` (`PB4`). Requested trades order records through `coverage`. On "욕실 타일만" `bi-15`
  `[bathroom]`, whose own body describes the new tiling, is `exact`.
- **A trade-only request (`Q_s = ∅`) has no `exact`.** The owner's ladder is applied as stated: a
  `partial_remodel` that lists a requested trade is `overlap`; a whole-home or breadth-absent record
  that lists one is `fallback`, ordered by `coverage`. `bi-19` (바닥·도배·조명 through the whole
  dwelling) is `fallback` on "도배랑 바닥만". Nothing in the document tells it apart from `bi-05`, a
  whole-home remodel recorded with trade ids only; the closed-trade field of §17.2 would (`OQ-1`).
- **A dropped id blocks `exact` and nothing else** (`WS8`). The room list is no longer known to be
  closed, so a `partial_remodel` is `overlap` at best.
- **`whole`, and `part` with nothing named, have two classes**: the job asked for, and everything
  else. A known `partial_remodel` and a breadth-absent record are both `fallback` on a whole request.
  The tie is the neutral choice (`PB4`).
- **`open`**: the visitor said nothing about the job, so nothing about the job can miss. The tiers
  do the ordering.

#### 14.3.3 Tiers

> **EV3 (C: MUST) — four tiers per record.** Each tier takes one value for every record in every
> query. A tier that does not apply takes its **last** value and, when the visitor stated that
> criterion, the note `not_applied` (`GR2`): the value means *not compared*, not *compared and far*.
>
> | tier | values, best first | applies when | otherwise |
> |---|---|---|---|
> | `area` | `strong` · `acceptable` · `none` | `V.area` stated, and mode `whole` or `open` | `none` (`not_applied` if `V.area` stated) |
> | `price` | `strong` · `acceptable` · `none` | `V.budget` stated, mode `whole` or `part`, and class `exact` | `none` (`not_applied` if `V.budget` stated) |
> | `coverage` | an integer `0 … |Q|`, higher first | always (it is `0` for every record when `Q = ∅`) | — |
> | `style` | `match` · `none` | `V.styles` stated | `none` |
>
> - **area** (`OD-M`). `v` is the visitor's figure and `r` the record's `property.area.value`, both
>   in one unit under `AR4`, compared in exact rational arithmetic (never floating point).
>   `|r − v| ≤ 0.10·v` ⇒ `strong`; `≤ 0.20·v` ⇒
>   `acceptable`; otherwise `none`. The tier is also `none` when the record has no area, or when
>   both bases are known and differ (`AR5`: supply and exclusive are never compared). When either
>   basis is absent the tier is still computed and the reply says the match is approximate (`PY1`);
>   that disclosure never changes the tier. There is no area tier in mode `part`: a partial job's
>   area is the dwelling's, not the area the price bought (`PT2`), and the owner ranks partial
>   requests without it.
> - **price** (`OD-N`, `OD-O`). The budget becomes an interval `B` — `exact a` ⇒ `[a, a]`, `range` ⇒
>   `[min, max]`, `max a` ⇒ `[0, a]` — and `R.pricing.total` an interval `P` — `exact` ⇒ `[x, x]`,
>   `range` ⇒ `[min, max]` — in one currency (V0 `PR6`). If `B` and `P` intersect ⇒ `strong`.
>   Otherwise let `g` be the gap between them and `b` the bound of `B` nearest to `P`: `10·g ≤ b` ⇒
>   `strong`; `5·g ≤ b` ⇒ `acceptable`; otherwise `none`. Amounts are scaled by 100 first (§9 allows
>   two fraction digits), so all of this is integer arithmetic. The tier is also `none` when the
>   record has no total (`missing`), or when its currency is not the budget's (`not_comparable`).
>   **Only an `exact` record is compared.** That is the class in which the record is the whole-home
>   remodel asked for, or remodelled exactly the rooms asked for — `OD-O`'s condition for comparing a
>   total budget with a total price. It is why a bathroom budget is never measured against a
>   whole-home total. An `exact` partial job's total can still include trades the visitor did not
>   ask for; the tier is computed all the same, and the reply must say so (§14.3.6, `OQ-6`). A `perArea` amount is never compared with anything (`PB2`).
> - **coverage** — the number of ids of `Q` **listed** in `R.workScopeIds`. `PT4`(b) decides a
>   record's class (`EV2` row 8), not its coverage. (A count that also credited the rooms `PT4`(b)
>   implies would rank a record whose `projectType` is missing below every value it could hold — the
>   penalty `PB4` forbids. `proof/contract-simplified.mjs` found it; `34a` §6.)
> - **style** — `match` iff a value of `V.styles` is in the record's **own** `style` facet (`ST3`,
>   `ST7`).
>
> *Rev 9.2 restores budget comparison in this one form (`OD-N`, `OD-O`, owner brief §3). Rev 7–9.1's
> `PB0`–`PB6a`, `EF5` and `price_fallback` are retired, not restored (§17.1).*

#### 14.3.4 Order

> **EV4 (C: MUST) — one order.** Records are sorted ascending by the tuple
>
> ```
> ( classRank, areaRank, priceRank, −coverage, styleRank, id )
> ```
>
> where `classRank` is `exact` 0 · `overlap` 1 · `fallback` 2 · `other` 3; `areaRank` and
> `priceRank` are `strong` 0 · `acceptable` 1 · `none` 2; `styleRank` is `match` 0 · `none` 1; and
> `id` is compared by code unit (`ID1`: present on every record; V0 `ID3`: unique within the resource). The
> order is over one document's records.
>
> Every position of the tuple is defined for every record. No key is skipped for some records, and
> no key refers to a position another key produced. The order is lexicographic over totally ordered
> components and ends in a unique key, so it is **total**, **transitive** and **deterministic**:
> two runs of one query over one snapshot give the same order.
>
> The order covers **every** record. No class or tier removes one (`OD-M`: a tier ranks, it never
> filters). The reply shows a prefix of this order — three records in the demo — and takes it from
> this order and nothing else.

*Why this tuple* (owner brief §3). For a whole-home request the strong signals are project type,
area and total price, then scope and style. For a partial request they are project type and scope —
both inside the class — then total price, then style. `location` is never read (`LO1`). One fixed
tuple serves both because the area tier is `none` for every record in mode `part`, and the price
tier is only computed inside `exact`. Rev 9.1's key (2) carve-out and its `publishedAt` key are
deleted; nothing replaced them.

#### 14.3.5 Missing data

> **PB4 (C: MUST) — a missing input is no evidence: never a reward, never a penalty below "no
> evidence".** This is a property `EV2` and `EV3` are written to have, and `CINV-5` checks it. It
> assigns nothing (`EV1`). For every query, every record `R` and each input listed below, let `R⁻` be
> `R` with that input missing, evaluated by `EV2` and `EV3` as written:
>
> 1. **no reserved value** — no class or tier has a value for "missing". The last value of every
>    tier, and `fallback` / `other` for the class, mean *no positive evidence*, and that is where a
>    missing input lands;
> 2. **the least favourable real value** — `R⁻`'s evaluation, class and all four tiers **together**,
>    equals the one `R` gets in that query when the input holds its least favourable **valid** value
>    (`INV-28`–`INV-30` and §9 respected): the value whose evaluation sorts last under `EV4`. Taking
>    each key's worst separately is not the rule — it can combine the worse halves of two real values.
>    Two cases have no such comparison. Where **no valid value exists** (`projectType` on a record
>    that names no room), item 2 asks nothing beyond `EV2` and `EV3` as written; items 1, 3 and 4
>    still hold. Where **every valid value would give positive evidence** on the tier the input
>    feeds (a budget "10억 이내" contains every valid total, §9), `R⁻` equals the least favourable
>    valid value's evaluation except that this tier has its last value: it loses evidence any real
>    value would have given, and nothing else changes;
> 3. **no exclusion, no failure** — `R⁻` is returned, and no reply states a failure or an absence
>    because the input is missing (`GR3`, §14.3.6);
> 4. its rank **may fall**. A record that loses a matching input loses that positive evidence. That
>    is intended. It never rises: the actual value is itself a valid value.
>
> The inputs are `projectType`, `workScopeIds` (and an id dropped under `WS8`), `property.area`,
> `pricing.total` and `facets.style`.

*Rev 9.2, by owner decision (2026-09-25).* Rev 9.1's `PB4` required that a record never move
**down** when a stated criterion's input was deleted. That rule is retired. It asked a record with
less evidence to rank like a record with more, and no class order could satisfy it (`31-` `B9-1`).
The rev-9.1 figure "0 of 798" measured a different property — a twin comparison, `D9-3`, withdrawn —
and is not evidence for this rule either. `CINV-5` measures this one.

*Worked.* On "예산 3천으로 전체 가능해요?", `bi-09` is `exact` and 4th. Without `projectType` it is
`fallback` and 13th — exactly where it would be as a `partial_remodel`, the least favourable value it
could validly carry. Under rev 9.1 that was a violation; under rev 9.2 it is the rule.

#### 14.3.6 What the result carries, and what the reply says

> **GR2 (C: MUST) — result metadata.** Every returned record carries its `matchClass`, its four tier
> values, and, for an **area** or **budget** the visitor stated that was not compared for this record,
> one note: `not_applied` (the tier does not apply in this mode or class, `EV3`), `missing` (the
> record lacks the input, or holds it in a unit or shape the consumer cannot read, §12) or
> `not_comparable` (bases or currencies differ). `style` and `coverage` carry no note: a record
> without a style facet or without `workScopeIds` simply has no positive evidence there. These are `EV2`'s and `EV3`'s
> outputs, copied. Nothing here computes them again.

> **GR3 (C: MUST) — direct answers and labelled references.** A record in class `exact` in mode
> `whole` or `part` is a **direct answer**. Every record in another class is a **labelled reference**; the reply states its label and
> the reason, and never hides it (`OD-P`):
>
> | class | mode | what the reply says about it |
> |---|---|---|
> | `overlap` | `part` | a partial job that shares some of what was asked, stated from its recorded ids only: the requested rooms it did not remodel and the rooms it remodelled beyond them; on a trade-only request, the requested trades it lists and the rooms it remodelled — never where a trade was done. If the consumer dropped an id from it (`WS8`), the reason is that its recorded scope could not be read in full |
> | `fallback` | `whole` | a job not recorded as a whole-home remodel: a partial job, or one whose extent is not recorded |
> | `fallback` | `part` | a whole-home remodel, or a job whose extent is not recorded: a reference, not the job asked for. When rooms or trades were named, the reason is the ones it lists — or, being whole-home, contains |
> | `other` | `part` | a job that does not **list** what was asked. It is never said to lack it (below) |
>
> Direct answers come first because `exact` is `classRank` 0. That follows from `EV4`; it is not a
> second ordering. In mode `open` no job was named: every record is `exact` because nothing can
> miss, and the reply presents the records as examples, not as answers to a job.

The disclosures below phrase `EV2`'s and `EV3`'s outputs. They assign nothing (`EV1`).

> - **Rooms and trades** (`WS7a`, `WS7b`). For a `partial_remodel` from which no id was dropped
>   (`WS8`), a requested room the record does not list **was not remodelled in this case** — never "no work reached it". A requested trade a
>   record does not list is **not established for this case** — never "not included". For any other
>   record, nothing is stated as absent.
> - **Whole-home cover** (`PT4`(b)). When a `full_remodel` covers a requested room only through
>   `PT4`(b), the reply states the ground — *"이 사례는 집 전체를 리모델링한 사례입니다"* — and never
>   *"주방이 포함되어 있습니다"* unless `kitchen` is listed.
> - **Tiers.** For each criterion the visitor stated, the reply gives the record's own value and
>   the tier in words — for area, within 10 %, within 20 %, or neither; for a budget, inside it
>   (the intervals meet), within 10 % or 20 % of its nearest bound, or neither — only when the tier
>   was computed. A `not_applied` note is said as *"비교하지 않았습니다"*, with the record's own value
>   as a fact if it has one; a `missing` note as *"이 사례에는 … 정보가 없습니다"*; a
>   `not_comparable` note gives the reason (`AR5`).
> - **Budget.** A visitor who stated a budget is told each shown record's total as a fact (`GR1`).
>   For an `exact` record in mode `whole` or `part` the reply may set the total beside the budget and
>   give the tier. For every other record the price is `not_applied`: the reply says it was **not
>   compared**, because the job differs or none was named. It never says *"예산에 맞습니다"* as a
>   promise.
> - **Extra trades beside a budget** (`OQ-6`, owner decision). When the reply sets the total of an
>   `exact` record in mode `part` beside the budget, and the record lists a `Works` id that is not in
>   `Q`, the reply (1) names those trades, from `workScopeIds` only; (2) says the total includes that
>   work; and (3) never presents the total as a quote for the requested scope alone, nor the tier as
>   the budget being met. It never says where in the home such a trade ran unless the record states
>   it (`WS7a`). Match suitability and price comparability are different statements. *"거실만
>   1200만원"* × `bi-17`: *"거실 사례이며 총 공사비는 약 1,250만원입니다. 다만 이 사례에는 바닥 공사도
>   포함되어 있어, 거실만 진행하는 경우의 견적과 1:1로 비교되는 금액은 아닙니다."* — never
>   *"예산 1,200만원과 거의 정확히 맞는 사례입니다."*
> - **Reading** (`WS6`). When the consumer's table resolved a term that has more than one reading,
>   the reply says which reading it used.

#### 14.3.7 Grounding and the output invariants

> - **PB2 (C: MUST NOT)** — a visitor's **total** budget is never compared against a `perArea`
>   amount, in either direction, whatever the units appear to allow (OD-O).
> - **GR1 (C: MUST)** — only values present in the search result may be stated as fact:
>   `projectType`, `workScopeIds`, `property`, `pricing`, `facets`, `title`, `location`. No price is
>   invented, no total is computed, no per-area price is computed (`D-1c`).
> - **GR4 (C: MUST, envelope)** — in the model-facing result a record does **not** carry
>   `pricing.perArea` unless the visitor asked about a **per-area** price. `property.area` is always
>   available; the **price** is what is withheld.
>
>   *Rev 2 had this the wrong way round and suppressed the area. All eight live titles carry the area
>   ("수성 화이트 **34평** 아파트 리모델링") and `GR1` makes `title` statable, so the multiplicand
>   cannot be withheld. The multiplier can.*
> - **GR5 (C: MUST, output)** — let an **area** be any area appearing in, or derivable from, the
>   result — `property.area`, an area stated in a `title`, or the area the visitor stated — and a
>   **price amount** be any of `total.amount`, `total.minAmount`, `total.maxAmount`, a
>   `perArea.amount`, or the visitor's budget amount. No number in the assistant's reply equals
>   - the **product** of any `perArea` and any area, nor
>   - the **quotient** of any price amount and any area,
>
>   with the two operands taken from any records in the result.
>
>   **Exemption (`GR5a`).** A number that **is itself the value of a `pricing` field on the record the
>   statement is about** is permitted, even when it coincides with a forbidden product or quotient.
>   The exemption is per record and does **not** reach across records: `GR5` was widened in rev 4
>   precisely to catch cross-record arithmetic, and a *"some record in the result"* exemption gives
>   that reach straight back. Executed over the 19: `bi-09`'s 50,000,000 ÷ `bi-11`'s 20평 =
>   2,500,000, which is `bi-10`'s `perArea.amount`, and `bi-12`'s 52,000,000 ÷ 20평 = 2,600,000,
>   which is `bi-05`'s authored `perArea` — so under rev 5's wording a fabricated per-area price for
>   `bi-09` passed `GR5` and `CINV-2` unflagged.
>   Without this the rule forbids the truth: `bi-10` 85,000,000 ÷ 34평 = 2,500,000, `bi-11`
>   30,000,000 ÷ 20평 = 1,500,000 and `bi-12` 52,000,000 ÷ 26평 = 2,000,000 all divide **exactly**,
>   so the producer's own `D-1` per-area price *equals* a quotient and each total *equals* a product
>   — and a correct consumer stating either would fail the invariant. The exemption is about
>   provenance, not arithmetic: an emitted field may be quoted, a computed number may not.
>   `bi-19`'s 343,750 is **not** any field's value and stays forbidden, which is the case the rule
>   exists for.
>
>   This is an **output** invariant and is tested as one (§15).

### 14.4 Style is a bonus, never a gate

> - **ST3 (C: MUST)** — the path is: visitor utterance → semantic candidate → **a `style` id actually
>   present in the document** → a small ranking bonus. An embedding never selects the final record
>   set, a style miss carries **no penalty**, and no search fails for want of a style match. Style is
>   deliberately **not** a class input (`EV2`): it is `EV3`'s last tier before `id`, it can never make
>   a record `exact` and can never keep it out. (OD-H.)
> - **ST5 (C: MUST)** — only a style the visitor stated **positively** becomes a recorded preference.
>   A negated preference (*"너무 화려한 건 싫어요"*) must not produce a positive bonus and must not be
>   echoed back as something the visitor asked for. A semantic candidate that was merely inferred is
>   not restated to the visitor as their stated preference.
> - **ST7 (C: MUST)** — the two document-level vocabularies are not disjoint sets and must not be
>   treated as one classification. A value present in both `facets.style.values` and
>   `facets.tag.values` (`ST6`) is a style **for the records that carry it as a style** and a plain
>   tag for the rest; it is never resolved site-wide, in either direction.
>
>   **Accepted limitation.** This does leave an inconsistent style bonus: with 화이트 in both
>   vocabularies, *"화이트톤으로 하고 싶어요"* gives the bonus to the record carrying it in `style`
>   and not to one carrying it in `tag`, though the two are alike on the attribute asked about. It is
>   bounded: `ST3` makes style a weak bonus with no penalty for a miss, and the `tag` carrier is
>   **still matchable on the `tag` key** (§8), so the worst case is a ranking wobble — never a
>   dropped record, never a wrong statement. `ST7` must not be implemented as *"ignore that value on
>   the other records"*.


---

## 15. Test invariants — additions to V0 §22

`INV-1` … `INV-16` survive, with two explicit carve-outs:

- **`INV-9`** ("nothing absent in the source appears") and **`INV-10`** ("area and pricePerArea
  numbers equal the source") are carved out for `pricing.perArea` with `source: "derived"`, which is
  by definition not a source value. Every other field is unchanged.

| id | invariant |
|---|---|
| `INV-17` | `workScopes` closure both ways (`WS2`); every `workScopeIds` value is in §7.3 |
| `INV-18` | no `workScopeIds: []`, no `facets.style: []`, no `facets.tag: []` — absent instead |
| `INV-19` | **`projectType != "full_remodel"` ⇒ no `perArea` with `source: "derived"`** (`D-1a`) |
| `INV-20` | `full_remodel` + exact `total` + `area` + no authored `perArea` + `RD1` guards ⇒ a derived `perArea` exists, equal to `RD1`'s integer formula, `perUnit == area.unit` |
| `INV-21` | an authored `perArea` is never replaced by a derived one (`PA1`) |
| `INV-22` | **provenance, as a metamorphic test.** Over every fixture record: changing only `area.value` changes no emitted field except `property.area.value` and a `source:"derived"` `perArea`; changing only the authored `pricePerArea` changes only `pricing.perArea`; changing only the authored total changes only `pricing.total` and a `source:"derived"` `perArea`. `RD1`'s division is the **sole** permitted dependency of any emitted value on `property.area`. This is executable, it passes the valid case where an authored `perArea` of 1,000,000 and an area of 34 coincide with a real total of 34,000,000, and it catches a total that moves when an area moves — which a static scan for `price × area` in the emitter could not do without also flagging `RD1` |
| `INV-23` | `total` carries exactly one `kind`; `range` ⇒ `minAmount < maxAmount`; every amount is positive |
| `INV-24` | **per record**: no value appears in both that record's `style` and its `tag` (`ST4`, by construction of the subtraction). Deliberately *not* asserted over the document-level facet vocabularies — see `ST6` |
| `INV-25` | no `projectType` / `property.type` / `workScopeIds` / `style` / `tag` value is emitted for a record whose corresponding **authored source field** is absent (`ND1`, `PT3`, `WS4`, `ST4`) |
| `INV-26` | `INV-1`/`INV-2` hold including the derived `perArea`: same snapshot ⇒ byte-identical document and version, across machines (`RD1` is integer-only, so this is achievable) |
| `INV-27` | manifest `schemaVersion == "0.1"` and document `schemaVersion == "1.0"` in the same package (§3) |
| `INV-28` | `projectType == "partial_remodel"` ⇒ `workScopeIds` present and non-empty (`WS7a` has no meaning otherwise) |
| `INV-29` | `projectType == "full_remodel"` ⇒ `workScopeIds` contains at least one id from §7.3's **Spaces** table (`PT4`c). Makes "a narrow set of trades is not a whole-home remodel" machine-checkable instead of a matter of judgement |
| `INV-30` | `projectType == "partial_remodel"` ⇒ `workScopeIds` contains at least one id from §7.3's **Spaces** table (`PT5`'s *bounded set of spaces*). The mirror of `INV-29`; `INV-28` required only a non-empty set. Makes "a partial job with no room" a **tested** impossibility, and forces the `bi-01`…`bi-08` authoring pass to send a trades-only job to breadth-absent rather than to `partial_remodel` |


Consumer-side:

| id | invariant |
|---|---|
| `CINV-1` | `LO1`: permuting every record's `location` leaves the ranking and the applied-criteria list unchanged |
| `CINV-2` | `GR5`, both halves: no reply number equals the **product** of any `perArea` and any area, nor the **quotient** of any price amount (`total.amount`, `total.minAmount`, `total.maxAmount`, a `perArea.amount`, the visitor's budget) and any area — where an area includes one **parsed out of a `title`** and the visitor's own stated area, and the two operands may come from two different records. Fixture: `bi-19` (11,000,000 ÷ 32평 = 343,750) must never appear |
| `CINV-3` | `D-1c`: the consumer computes no per-area value anywhere |
| `CINV-4` | `EV2`, the partial ladder: in mode `part` with `Q ≠ ∅`, only a `partial_remodel` is `exact`, every `exact` record meets row 6, and a request with `Q_s = ∅` has no `exact`. Fixtures: *"욕실 하나만"* — `bi-15` `exact` and first; `bi-04`, `bi-16` `overlap`; the seven `full_remodel` records `fallback`. *"욕실 타일만"* — `bi-15` `exact` and first although it lists no `tiling`; *"주방 타일만"* — `bi-14` `exact` and first |
| `CINV-5` | **`PB4`, as a metamorphic property.** For every fixture query, every record and every input `PB4` lists — deleted from a record that has it, and as it stands on a record that lacks it: the evaluation (the tuple without `id`) equals the least favourable valid value's; where every valid value gives positive evidence on the tier the input feeds, it equals that evaluation with this tier at its last value. Where no valid value exists, nothing is compared (`PB4` 2). Deleting an input never gives an earlier tuple than the actual value. No record is removed. Rank changes are reported, not asserted. Fixtures: `bi-09` on *"예산 3천으로 전체 가능해요?"*, `projectType` deleted ⇒ `fallback`, the same as a `partial_remodel`; *"10억 이내로 전체"*, `pricing.total` deleted ⇒ price `none`, although every valid total is `strong` |
| `CINV-6` | `EV3` price: only an `exact` record in mode `whole` or `part` has a price tier other than `none`; the interval arithmetic is as stated; a `perArea` is never compared (`PB2`). Fixtures: *"예산 3천으로 전체 가능해요?"* ⇒ `bi-11` `strong`; *"34평 전체 5천이면 되나요"* ⇒ `bi-09`, `bi-12` `strong`; *"욕실 하나만 700만원"* ⇒ `bi-15` `strong`, `bi-16` (`overlap`) `none`; *"바닥만 1000만원"* ⇒ no record `exact`, every price `none` noted `not_applied` |
| `CINV-7` | `ST5`: a negated style preference produces no bonus and no echoed preference |
| `CINV-8` | `VB1`: `"600~800만원"` parses to a range, not to one bound |
| `CINV-9` | `WS8`: an unknown work-scope id is ignored, the record survives, the document is not rejected — **and** the record is not `exact` in mode `part` with `Q ≠ ∅`, and no absence is stated about it. Fixture: `bi-16` `[kitchen, bathroom]` read by a consumer that does not know `bathroom`, against *"주방만"* ⇒ `overlap` |
| `CINV-10` | `GR4`: a model-facing record carries `pricing.perArea` only when the visitor asked about a per-area price |
| `CINV-11` | retired with rev 7–9.1's budget machinery (§17.1) |
| `CINV-12` | `ST7`: a value declared in **both** document vocabularies gives a style bonus only to the records that carry it in their own `style`, and is a plain tag on the others |
| `CINV-13` | mode `whole`. (a) *"34평 아파트 전체 리모델링"* ⇒ `bi-09` `exact`. (b) *"주방 포함 34평 전체"* ⇒ still `exact`. (c) *"창호 교체하려는데 34평 전체 리모델링"* ⇒ `bi-09` and `bi-10` both `exact`, `bi-10` first on coverage, and `bi-09`'s windows reported as not established |
| `CINV-14` | `EV1`: no rule outside §14.3.2–§14.3.3 assigns a class or a tier; and an implementation's disclosure step leaves every class and tier exactly as `EV2`/`EV3` produced them |
| `CINV-15` | trade-only requests (`OQ-1`, closed). *"32평인데 도배랑 바닥만"* ⇒ no `exact`; `bi-17` `overlap` first; `bi-09`, `bi-11`, `bi-19` `fallback` with coverage 2, in that order; area `not_applied`. *"바닥만"* ⇒ no `exact`; `bi-05` is `fallback`, never a direct answer. With no `exact`, **no budget is compared** on a trade-only request: every price is `not_applied`. `bi-19`'s 11,000,000 is stated as a fact, and nothing is said about rooms it did not list |
| `CINV-16` | retired with rev 7–9.1's budget machinery (§17.1) |
| `CINV-17` | disclosure wording, both axes (§14.3.6): a trade not listed is **not established for this case**, never "not included"; a room a `partial_remodel` does not list **was not remodelled**, never "no work reached it" — `bi-17` re-floored the bedrooms while authoring only `[living_room, flooring]` |
| `CINV-18` | `GR5a`: a number that is itself the value of a `pricing` field **on the record the statement is about** may be stated even when it equals a forbidden product or quotient. Fixtures: `bi-10` 2,500,000 (= 85,000,000 ÷ 34, exactly) **must** be statable when asked; `bi-19`'s 343,750 must not |
| `CINV-19` | the budget statement (§14.3.6): a visitor who stated a budget is told each shown record's total as a fact, **in the reply** and not only in the envelope; a non-`exact` record's price is said to be not compared |
| `CINV-25` | extra trades beside a budget (§14.3.6, `OQ-6`). *"거실만 1200만원"* ⇒ `bi-17` `exact`, price tier `strong`; the reply names 바닥 (`flooring`) from `workScopeIds`, says the 12,500,000 includes it, and never says the total fits the budget or is a quote for the living room alone. *"욕실 하나만 700만원"* × `bi-15` (lists no trade) ⇒ no extra-trade statement |
| `CINV-20` | **`EV2` totality and single-valuedness**, by enumeration: every mode × every `Q` shape × `projectType` ∈ {full, partial, absent} × every valid id set over a small vocabulary × dropped ∈ {no, yes} gets exactly one class, from the lowest-numbered row that holds; and every row of the table fires for at least one input |
| `CINV-21` | **`EV4` order**: for every fixture query the comparison is total, antisymmetric and transitive over the 19 records, and 50 shuffles of the input give one order. Fixture: *"전체 리모델링 사례 보여주세요"* — seven `exact` records, no other key discriminates, result limit 3 ⇒ `bi-01`, `bi-07`, `bi-09` by `id` |
| `CINV-22` | no class or tier is a filter: for every fixture, all 19 records are returned |
| `CINV-23` | whole-home cover (§14.3.6): for a `full_remodel` covering a requested room only through `PT4`(b), the reply says *"집 전체를 리모델링한 사례"* and **never** names that room as included. Fixture: *"욕실 하나만"* against `bi-07`, which lists no `bathroom` |
| `CINV-24` | mode `whole` and the ladder together. (a) *"전체 리모델링 사례 보여주세요"* ⇒ `bi-15` (one bathroom, 7,000,000) `fallback`, never `exact`, after every `full_remodel`. (b) *"주방만 하고 싶어요"* ⇒ `bi-14` `exact` and `bi-09` `fallback`, in that order |

---

## 16. Rollout — consumer first (OD-A)

1. **Consumer parses `"1.0"`.** A short-lived dual-read of `"0.1"` is permitted **in the consumer**.
2. **Golden V0.2 tests** pass on both sides against the same fixture.
3. **Consumer deployed if needed. The action fuse stays OFF.**
4. **Producer publishes V0.2** as a new immutable package — new build identity, pointer moved last,
   rollback intact, other sites untouched (`PC1`–`PC7`).
5. **Consumer refreshes the snapshot**; verifies `schemaVersion == "1.0"` and the record count.
6. **V0.2 search tests** run against the real snapshot.
7. Only then is exposure considered.

**Consumer confirmations required before freeze — two.**

**V0.2 amends one frozen V0 rule, for `pricing.total` only.** V0 `PR4` compares prices only between
records of one `category`. V0.2 compares a visitor's total budget with a record's total only when
the record is `exact` for the job the visitor described (`EV3`, `OD-O`). That is the same-axis
condition `PR4` approximates with `category`, stated on the job itself. `PR4` stays verbatim for
`perArea`, which V0.2 does not compare.

| item | what the consumer is being asked to confirm |
|---|---|
| `VO6` `style` limit | the values-per-facet limit for the new `style` key. The producer ships a **provisional** 150 and no consumer behaviour may be inferred from it (§8). |
| `PR4` for `pricing.total` | the amendment above. The first-party consumer implements `EV3`; it confirms that `category` no longer gates a total-price comparison |


> **RO1 (P: MUST NOT)** — the producer never emits V0.1 and V0.2 fields simultaneously. There is no
> dual-emit. Transition safety comes from the **order** above plus the consumer's temporary
> dual-read, never from a permanently duplicated schema (OD-A).
>
> **RO2** — the consumer's `"0.1"` read path may be removed only once step 6 has passed **and**
> every registered site's routing pointer has **both** `current` and `previous` at
> `schemaVersion >= 1.0` — that is, after **two** successful V0.2 publishes per site.
>
> Rev 2 phrased the gate as "no package below `1.0` remains a rollback target", which binds the
> consumer to a fact only the producer can observe and exposes no channel to observe it through.
> The restatement is exact rather than merely checkable: rollback is a single step to
> `pointer.previous` (`platform/publish/publish.ts`), so "both pointer slots at `>= 1.0`" *is* "no
> rollback target below `1.0`". Until then, removing the read path would turn a rollback into a
> silent outage.

---

## 17. Deferred

### 17.1 Budget comparison — rev 7–9.1 machinery retired

Rev 9.1 deferred budget comparison to a V0.3 annex. Rev 9.2 restores it in one form — `EV3`'s price
tier, computed only inside class `exact` — by owner decision (brief of 2026-09-25, §3: total price is
a strong signal for both whole-home and partial requests). The machinery rev 7–9.1 built and then
deferred — `PB0`, `PB0a`, `PB1`, `PB3`, `PB3a`, `PB5`, `PB6`, `PB6a`, `EF5`, the `price_fallback`
class, the budget column of the old scope table, `CINV-11` and `CINV-16` — is **retired, not
restored**. Its text and the defects found against it are in `archive/07-rev9.1-corrected.md` §17.1.
A per-area comparison stays out of V0.2.

### 17.2 Other deferrals


**A producer-declared closed *trade* set.** A job that ran a few trades across the whole dwelling —
`bi-19`: 바닥·도배·조명, every room, 11,000,000 — is breadth-absent by construction (`PT5` needs a
bounded set of *spaces*, `PT4`(c) needs a *space* id), so no rule can say its total bought exactly
those trades and nothing else. Rev 9.2 therefore makes it `fallback` on a trade-only request,
ordered by the trades it lists (`EV2`); the reply names the recorded trades and never says that
nothing else was done (`WS7b`). The same shape is carried by `bi-05`, a whole-home remodel recorded
with trade ids only, so no rule on today's fields can lift one without the other (`OQ-1`). Closing it
properly needs a new authored field — the trade equivalent of `WS7a` — and that is a schema change, a release cut and a
consumer change. Deferred, with the gap written down rather than papered over.

`workScopeIdsExcluded` — letting a record that skipped a space still claim `full_remodel`, with the
skipped spaces declared so the exclusion is **disclosed** rather than making the breadth unknowable.
Under `PT4`(b) a `full_remodel` may skip **no** space, so today such a record is breadth-absent — it
is that cost the field would buy back. Proposed in review; genuinely useful; not required for V0.2,
where breadth-absent is the safe direction and costs nothing but recall.

Also deferred: `property.bathrooms` and other room counts (`WS3`); work-scope hierarchy and aliases;
per-site work-scope labels; a `perArea` range; a currency-aware minor-unit rounding policy (`RD1`);
`totalCost` as a field name (reserved); price inclusion scope and price basis (`TP2`, `PA4`); built
year; duration; cover, gallery and any media (OD-R); summary and body; producer-authored
match-evidence text; filtered listing URLs; per-locale documents; a global opaque id.


---

## 18. Owner decisions — closed

Rev 9.1's `Q-1` … `Q-34` asked about machinery that rev 9.2 retires; they are closed with it and
kept in the archive. Rev 9.2 put six questions to the owner; the owner closed all six on
2026-09-25 (closeout brief). None is open.

| id | question | owner decision (closed) |
|---|---|---|
| `OQ-1` | Trade-only requests: may a record with no `Spaces` id that lists every requested trade be `exact`? | **No.** A trade-only request has no `exact` (`EV2` row 6). Row G leads with `bi-17` (`overlap`); `bi-19` is 4th (`fallback`). Consequence, recorded: no budget is compared on a trade-only request (`CINV-15`) |
| `OQ-2` | Whole-home requests: should a breadth-absent record rank above a known `partial_remodel`? | **No** — both `fallback`, a tie |
| `OQ-3` | A budget and nothing else (*"5천으로 뭐 할 수 있어요?"*, mode `open`): rank by price? | **No.** Prices are stated as facts, noted `not_applied` |
| `OQ-4` | `pricing.perArea` as an auxiliary whole-home signal? | **Not in V0.2.** No per-area budget shape (`VB1`), no per-area comparison (`PB2`); `perArea` is stated only when asked (`GR4`) |
| `OQ-5` | Room + trade requests (*"욕실 타일만"*): does a requested trade the record does not list demote it? | **No.** Rooms decide `exact`; trades order by `coverage` and are explained (`WS7a`, `PB4`) |
| `OQ-6` | Extra trades on an `exact` partial job (*"거실만 1200만원"* × `bi-17`). | **Class unchanged: an `exact` room match stays `exact`; extra trades are supporting information. Price disclosure is mandatory** when the total is set beside the budget: name the extra trades from the record, say the total includes them, never present it as a 1:1 quote for the requested scope (§14.3.6, `CINV-25`). No trade-extent schema is added; where a trade ran is not guessed |

---

## 19. Acceptance rows — executed

`04` §4.1's rows, with `V` fixed so that they test the evaluation and not a parser. Records are the
19 in `data/sites/boost-interior-demo/content/projects.json`. Hand-computed in
`docs/result/interior-portfolio-v0.2/34a-product-rules-and-hand-examples.md` §3.5 and re-executed by
`proof/contract-simplified.mjs`. These rows supersede `04` §4.1.

| row | utterance | `V` | top three (class) |
|---|---|---|---|
| A | 34평 전체 5천이면 되나요 | whole · area 34 py · budget 50,000,000 | `bi-09` exact · `bi-01` exact · `bi-10` exact |
| B | 예산 3천으로 전체 가능해요? | whole · budget 30,000,000 | `bi-11` exact · `bi-01` exact · `bi-07` exact |
| C | 주방만 하면 얼마예요 | partial · {kitchen} | `bi-14` exact · `bi-04` overlap · `bi-16` overlap |
| D | 욕실 하나만 | partial · {bathroom} | `bi-15` exact · `bi-04` overlap · `bi-16` overlap |
| D2 | 욕실 두 개 | absent · {bathroom} | as D |
| E | 전용 84 아파트 주방 | absent · {kitchen} · area unit unresolved ⇒ absent | as C |
| F | 50평 전체 1억 넘나요 | whole · area 50 py · no budget | `bi-13` exact · `bi-01` exact · `bi-07` exact (`bi-08` 8th, first fallback) |
| G | 32평인데 도배랑 바닥만 얼마예요 | partial · {wallpaper, flooring} · area 32 py (`not_applied`) | `bi-17` overlap · `bi-09` fallback · `bi-11` fallback (`bi-19` 4th, fallback; `OQ-1`) |
| H | 바닥이랑 거실만 | partial · {living_room, flooring} | `bi-17` exact · `bi-06` overlap · `bi-01` fallback |
| I | 현관 수납 | absent · {entrance, built_in_furniture} (consumer table: 수납 ⇒ `built_in_furniture`) | `bi-18` exact · `bi-06` overlap · `bi-01` fallback |

Row I under a consumer table that maps 수납 to `storage` instead: `Q = {entrance, storage}`, no
`exact`, and `bi-06`, `bi-18` `overlap`. The difference belongs to the alias table (`WS6`); the
evaluation is a function of `V`.

---

## 20. Change log

Rev 9.1 and every earlier change log are in `archive/07-rev9.1-corrected.md` §20–§20.8.

### 20.9 Rev 9.1 → rev 9.2 — product simplification

Driven by the owner's brief of 2026-09-25 and `32-round-9-handoff.md`. Worked in
`docs/result/interior-portfolio-v0.2/34a-…` before it was written here; checked by
`proof/contract-simplified.mjs`; reported in `34-product-invariant-simplification.md`.

| round-9 blocker | resolution |
|---|---|
| `B9-4` whole-home remodels `exact` on a partial request | `EV2`: a `full_remodel` is `exact` only in mode `whole`. `VB3` makes "욕실 하나만" `partial`; `D9-4` deleted. Rows D and I now lead with `bi-15` and `bi-18`; row G with `bi-17` (`OQ-1`) |
| `B9-1` `PB4`/`CINV-5` unsatisfiable, 4a/4b conflated | `PB4` restated as a property of `EV2`/`EV3`: *missing = no evidence — the least favourable valid value, judged on the whole evaluation* (owner decision). Global rank preservation is retired, not measured. 4b's figure is not cited |
| `B9-3` `D9-9` sentence 4 assigns a state | `EV1`: one writer. Reached by **deletion** — `WS6` now gives one `Q`, so `D9-7a`, `D9-8`, `D9-9` and the per-reading machinery have nothing left to do |
| `B9-2` ordering keys determine no order | `EV4`: one fixed tuple with a unique last key. Key (2)'s carve-out and `publishedAt` deleted |

**Retired rule ids**: `EF1`–`EF6`, `GR2a`, `GR3a`, `PB5`, `PB7`, `TI1` (its content is `EV4`'s "a tier
ranks, it never filters"), `CINV-11`, `CINV-16`, and the deferred budget ids listed in §17.1. `PB4`,
`GR2`, `GR3`, `VB3`, `WS6`, `WS8` and `CINV-4`/`5`/`6`/`9`/`13`/`14`/`15`/`17`/`19`–`24` keep their ids
with new text. **New**: `EV1`–`EV4`.

**Deleted sections**: the scope-relation tables (old §14.3.3, §14.3.3.1), §14.3.5's "stated, never
compared", §17.1's parked rev-7 text, §17.3, §18's `Q-1`…`Q-34`, §19's stale worked example, and the
change logs §20–§20.8 — all in the archive.

**Closed as a consequence, not separately**: `M9-1` (unresolvable area unit ⇒ absent, §14.3.1),
`M9-2` scoped (the alias table is the consumer's; the evaluation is a function of `V`), `M9-6` (the
prefix rule in `EV4`), `M9-7` (§19 supersedes `04` §4.1), `M9-8` and `Q-33`/`Q-34` (retired with the
machinery they misnamed), `m9-1` and `Q-26` (`VB3` no longer distinguishes the readings). `M9-3`,
`M9-4`, `M9-5`, `m9-5` were defects in text that is now archived.

**Found by the checker, fixed in the contract** (not the other way round): the first draft of `EV3`
credited a `full_remodel` with the rooms `PT4`(b) implies when counting `coverage`, and stated `PB4`
key by key. Deleting a `full_remodel`'s `projectType` then gave a class no better than a valid value's
but a `coverage` worse than every valid value's — a missing input penalised below the worst real
answer, which the owner's decision forbids. `coverage` now counts listed ids only, and `PB4` compares
the whole evaluation. Recorded in `34a` §6.

**Fresh-context review (`34c`), fixed in this revision.** One `BLOCKER`, five `MAJOR`s:

| finding | fix |
|---|---|
| `B-1` a trade-only request made a breadth-absent record `exact` — `bi-05`, a self-described whole-home remodel, led *"바닥만"* | `EV2` row 6 requires a `partial_remodel` and `Q_s ≠ ∅` (a deletion). A trade-only request has no `exact`; `OQ-1`'s default is now the ladder as stated |
| `M-4` a trade a partial job did not list demoted it to `overlap` (`bi-15` on *"욕실 타일만"*) | `Q_t ⊆ R_t` deleted from row 6: rooms decide `exact`, trades order by `coverage` (`WS7a`, `PB4`); `OQ-5` |
| `M-3` `PB4` read as a second writer, with no referent for some inputs and a contradiction with `EV3` under *"10억 이내"* | `PB4` is a property of `EV2`/`EV3`, per query, with the no-valid-value and all-positive cases stated |
| `M-1` `GR3` labels stated absences (`other`) and false reasons (`fallback` in mode `whole`) | labels per mode; `other` = does not **list**; mode `open` has no direct answers |
| `M-2` `none` also meant "not computed" | note `not_applied` (`EV3`, `GR2`); the reply grades only computed tiers |
| `M-5` checker `P3`/`P8` passes claimed more than they measured | `P3` checks records whose inputs are natively missing, validates fills, asserts "never rises" and drops the vacuous class-reachability check; `P8` checks the labels |

`MINOR`s taken: `m-1` (moot after `B-1`), `m-2` and `m-9` (`VB3`), `m-3` (`V.area`), `m-4` (`VB1`,
`EV3`), `m-5` (`OQ-4`), `m-6` (`INV-30`, §12), `m-7` (checker texts), `m-8` (`GR3`), `m-10` (`EV4`).

**Delta review (`34d`).** All six `34c` findings above resolved except `M-5`, partial (two checker
wording overstatements, `D-3`/`D-4`). New: 0 `BLOCKER`, 1 `MAJOR` (`D-1` → `OQ-6`, recorded, not
fixed), 10 `MINOR` (`D-2`…`D-11`, open, listed in `34d`). No further round, by the owner's brief.

### 20.10 Rev 9.2 → rev 9.2.1 — closeout

Driven by the owner's closeout brief of 2026-09-25. No new rule family, no change to `EV2`–`EV4`'s
results: every §19 row and every class, tier and order is unchanged. Checked by
`proof/contract-simplified.mjs` (one run) and one fresh delta review; reported in
`docs/result/interior-portfolio-v0.2/35-contract-final-closeout.md`.

| item | change |
|---|---|
| `OQ-6` (`34d` `D-1`, the open `MAJOR`) | owner decision: an extra trade never demotes an `exact` room match; setting its total beside a budget requires the extra-trade disclosure (§14.3.6, new `CINV-25`). `EV3`'s price justification says "remodelled exactly the rooms asked for", not "the kind of job asked" |
| `OQ-1`…`OQ-5` | closed as owner decisions with the defaults unchanged; §18 is now *Owner decisions — closed* |
| `D-2` | `PB4` item 2: the no-valid-value case asks nothing beyond `EV2`/`EV3`; the all-positive case sets only the fed tier to its last value. `CINV-5` split the same way |
| `D-3`, `D-4` | checker propositions: no-valid-value cases are counted, not asserted; `P8`'s label checks test the checker's transcription of `GR3`, not `GR3`'s text |
| `D-5` | the room disclosure applies only to a `partial_remodel` from which no id was dropped (`WS8`) |
| `D-6` | `GR3`'s `overlap` reason is stated from recorded ids only, never where a trade ran; a dropped-id record's reason is that its scope could not be read in full |
| `D-7` | `VB3`: a restriction always wins (row 2 first); 전체 qualifying a trade — 집 전체 도배, 34평 전체 도배 — is not row 3 |
| `D-8` | `CINV-15` and `OQ-1` record that a trade-only request compares no budget |
| `D-9` | `GR2` notes are for area and budget only; §12's kind-less total is `missing` only where the tier applies; the reply says "inside the budget" for meeting intervals; a `not_applied` value is stated only if the record has one |
| `D-10` | already fixed in `34a` §1.2 (‡); confirmed, not re-edited |
| `D-11` | `EV4` cites V0 `ID3` for uniqueness; checker fixture counts printed, `CINV-24(b)` label, and the two checker-only defaults (unknown unit, missing currency) removed |

