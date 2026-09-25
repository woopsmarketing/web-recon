# 28 — `styles` for the existing eight, `bi-06`'s `propertyType`, and the fixture re-baseline

| | |
|---|---|
| date | 2026-09-24 |
| status | APPLIED. Two files changed: `data/sites/boost-interior-demo/content/projects.json` (data) and `platform/test/integration.test.ts` (expectations). No schema, no emitter, no validator, no contract, no sibling spec, no skipped check was edited, and no git command that mutates state was run. |
| inputs | `26-demo-data-applied.md` §4.1 / §5.1 / §6.1 / §6.4; contract `07` **§8** (`ST1`–`ST7`), **§10**, **§19**; `04-demo-data-spec.md` **§0.2** + **§2**; `18-existing-eight-workscopes.md` (scope statement only) |
| result | `npm run test:integration` **61 passed · 0 failed · 9 skipped** (from 44 · 17 · 9); `npm run typecheck:platform` exit 0; demo emission **0 errors, 0 warnings** |

---

## 1. Job 1 — `styles` authored for `bi-01` … `bi-08`

### 1.1 The standard applied

`04` §2 did **not** author the eleven's `styles` from prose. Checked mechanically, three of the
eleven (`bi-16`, `bi-19`, and `bi-09`'s `베이지`) carry style values whose word appears **nowhere**
in that record's own title, summary, body, scope or quote, while `bi-12`'s prose contains `베이지`
and its `styles` deliberately do not. The standard §2 actually used is:

> `styles` = the record's own **`keywords`**, filtered to style/mood values (`ST1`), authored order
> kept; a keyword that is not style stays a plain keyword (`ST2`).

This is exactly `ST4`'s "normally a **subset of** `keywords`", and it holds for all eleven without
exception: `bi-10` drops `간접조명`, `bi-19` drops `이사 전 공사`, `bi-18` (no keywords at all) gets
no `styles`. The same rule was applied to the eight, so the licensing text for every value below is
**that record's own authored `keywords` array**, corroborated by its own prose where the prose
speaks. Nothing was read across records and nothing was invented.

### 1.2 What was authored, per record

| id | `keywords` (unchanged) | `styles` authored | licensing text in that record |
|---|---|---|---|
| bi-01 | 화이트 · 미니멀 · 간접조명 · 수납 특화 | **["화이트","미니멀"]** | 화이트 — title 「수성 **화이트** 34평…」, body 「벽과 천장, 붙박이장을 같은 **화이트** 계열로 맞추고」. 미니멀 — body 「유행을 타는 장식보다 밝고 정돈된 바탕을」, 「거실에서 보이는 선을 단순하게 정리했습니다」, 「과한 연출보다 … 편한 구성을 우선했습니다」 |
| bi-02 | 화이트 · 내추럴 · 우드 포인트 | **["화이트","내추럴","우드 포인트"]** | 화이트·내추럴 — title 「… 24평 **화이트 내추럴** 리모델링」, body 「**화이트** 공간에 온기를 더했습니다」. 우드 포인트 — body 「바닥과 선반, 상판 모서리에 같은 **라이트 오크**를 써서」 |
| bi-03 | 모던 · 그레이지 · 수납 특화 | **["모던","그레이지"]** | 그레이지 — body 「모두 같은 **그레이지** 무광 도어로 통일하고」. 모던 — same sentence, 「**손잡이를 없앴습니다**」 + 「천장까지 닿는 붙박이장」 |
| bi-04 | 화이트 · 모던 | **["화이트","모던"]** | its own `keywords` only; the prose names neither word (body: 「큰 규격의 **무광 타일**로 줄눈을 줄이고」, 「세면대 주변을 비웠습니다」). Same footing as `bi-16` / `bi-19` in `04` §2 |
| bi-05 | 내추럴 · 우드 포인트 | **["내추럴","우드 포인트"]** | 내추럴 — title 「29평 밝은 **내추럴** 아파트 리모델링」. 우드 포인트 — body 「수납을 겸한 **오크 벤치**」, 「바닥과 식탁, 선반은 같은 톤의 밝은 **오크**로」 |
| bi-06 | 화이트 · 간접조명 · 미니멀 | **["화이트","미니멀"]** | 화이트 — body 「슬림한 **화이트** 프레임의 원슬라이딩 중문」. 미니멀 — body 「거실은 … **단정하게 정리**했습니다」, 「경계가 티 나지 않게」 |
| bi-07 | 화이트 · 미니멀 · 수납 특화 | **["화이트","미니멀"]** | both in the title 「19평 소형 아파트 **화이트 미니멀** 리모델링」; body 「문과 몰딩을 벽과 같은 **화이트**로」, 「2인 소파와 작은 원형 식탁만 두어」 |
| bi-08 | 모던 · 그레이지 · 간접조명 | **["모던","그레이지"]** | 그레이지 — body 「전체 톤은 차분한 **그레이지**로 맞추고」. 모던 — 「**월넛** 가구로 무게감을 더했습니다」 + 「슬림 트랙 조명」 |

**No record of the eight was left without `styles`.** Every one of them declares at least one
style/mood keyword of its own. (`bi-18`, one of the eleven, remains the only `styles`-less record in
the corpus — it authors no `keywords` at all.)

### 1.3 What was deliberately NOT authored

- **`간접조명`** (`bi-01`, `bi-06`, `bi-08`) and **`수납 특화`** (`bi-01`, `bi-03`, `bi-07`) stay
  plain keywords. `ST2` names both by name: a lighting technique and a functional feature are not
  styles, and *missing beats a false semantic truth* (OD-H). `04` §2 excluded `간접조명` from
  `bi-10`'s `styles` on exactly this ground.
- **`웜 화이트` on `bi-05`** and **`월넛` on `bi-08`**, although both words are in the corpus's style
  vocabulary and both appear **literally** in those records' bodies (「노란 기가 살짝 도는 **웜
  화이트**로 칠해」; 「**월넛** 가구로 무게감을 더했습니다」). Neither record lists the word in its own
  `keywords`, and all eleven of `04` §2's records keep `styles ⊆ keywords`. Authoring them would
  have broken the standard this pass is matching and would have changed the eight's `keywords`,
  which is outside this task. Flagged, not applied.

### 1.4 The `ST6` warning is gone — verified by running the emit + validate path

Run the same way `26` §3 ran it (a throwaway `tsx` script over the real `prepareSiteInput` →
`emitIntegration` → `validateIntegration`; the script lived in the repo only while it ran and was
deleted):

```
ProjectSchema: 19/19 parse        ProjectsDocSchema: PASS
records 19 · document 11608 B · manifest 274 B · version d56509c8100a56fdf9644baff78ff9e1
facets: category 4 · style 9 · tag 3
  style: 그레이지 내추럴 모던 미니멀 베이지 우드 포인트 월넛 웜 화이트 화이트
  tag:   간접조명 수납 특화 이사 전 공사
workScopes: 17 ids, sorted, closed both ways        (unchanged)
emitter warnings: []                                 <- was 1 (ST6)
validator:        { errors: [], warnings: [] }       <- was 0 errors, 1 warning
```

The two document vocabularies are now **disjoint**, which is what `ST6` asks for. The mechanism is
`ST4`'s per-record subtraction: with the same word classified the same way on every record that
carries it, nothing survives into `facets.tag` that `facets.style` also declares. The `tag`
vocabulary shrank 9 → 3 and `style` grew 8 → 9 (`미니멀`, new, comes from the eight). Document bytes
fell 11780 → 11608 — the eight moved values out of `tag` faster than `style` gained them, and
`bi-06` lost a `property.type` (§2).

---

## 2. Job 2 — `bi-06`'s `propertyType`

**Both of `26` §6.4's claims verified independently**, by scanning `title`, `summary`, every `body`
paragraph, every `scope` string and both `customerQuote` fields of all 19 records for `아파트`:

| id | `아파트` present? |
|---|---|
| bi-01, bi-02, bi-03, bi-05, bi-07, bi-08 | **yes** (6 of 8) |
| **bi-04** | **no** — title 「32평 주방·욕실 중심 리뉴얼」, quote 「북구 32평 · 3인 가족」; the word appears nowhere |
| **bi-06** | **no** — title 「34평 현관·거실 중심 리모델링」, quote 「경산시 34평 · 부부」; the word appears nowhere |

So `04` §0.2's justification *"(every body says 아파트)"* is false for exactly two records, as `26`
reported. Neither record names any other property type either (`오피스텔`, `주택`, `빌라` are all
absent from both).

- **`bi-04` — KEPT.** Contract §19's worked example emits it as
  `"property": { "type": "apartment", … }`, which is an independent, contract-level statement about
  that specific record. It stands on its own even though the blanket sentence does not.
- **`bi-06` — REMOVED.** Its `propertyType` rested on `04` §0.2's sentence alone, and that sentence
  is not true of it. `propertyType` is optional and absent means *unknown*, so removing it states
  less rather than stating something wrong — the contract's own posture (`PT6`; owner decision F:
  never guess `projectType`). One line deleted; nothing else about `bi-06` changed.

`bi-06` now emits `"property": { "area": { "value": 34, "unit": "pyeong", "basis": "supply" } }`.
It still parses (19/19) and still validates (0 errors).

**Nothing else in `projects.json` was touched.** `git diff` on the file is **728 insertions, 0
deletions** against `HEAD` — the whole change is still additive relative to the pre-V0.2 file
(`26`'s 696 + the 8 `styles` blocks, minus `bi-06`'s `propertyType` line, which was never in `HEAD`
and therefore never appears as a `-`). The file is still exactly `JSON.stringify(doc, null, 2) +
"\n"`; `styles` sits in `ProjectSchema` declaration order, after `workScopeIds`.

---

## 3. Job 3 — the re-baseline, per test

**Rules honoured:** no assertion was weakened, narrowed, deleted or skipped; the 9 skips were not
touched (verified: the skip list is byte-identical before and after); nothing outside the 17 was
edited; every check id that existed before still exists. Three of the seventeen — **`V1`, `A3`,
`A12`** — needed no expectation change at all, because Job 1 removed their cause. Net effect on the
file: assertions were **added**, never removed (`E3` +1, `E5` +2, `A8` +1, `A9` +2, `A10` +1, `V14`
+2, `B2` +3).

### 3.1 The six "the demo has 8 records / no V0.2 fields" checks

| check | old expectation | new expectation | why the delta is exactly the data change |
|---|---|---|---|
| **E1** | `recordCount 8`, `facetCounts {category:4, tag:8}`, `document.workScopes === undefined`, document key order `[schemaVersion, resource, version, listingUrl, facets, records]` | `19`, `{category:4, style:9, tag:3}`, `workScopes === DEMO_WORK_SCOPES` (the 17 ids, sorted), key order `[…, listingUrl, workScopes, facets, records]` | 26 added 11 records and `workScopeIds` to all 19 → the block exists and takes its **declared** place (07 §10 lists `workScopes` between `listingUrl` and `facets`; it was absent only because the corpus had none). 28 moved 6 words from `tag` to `style` → 8→3 and 8→9. `manifest 274 B` and `listingUrl /portfolio` unchanged and still asserted. |
| **E3** | facet key order `["category","tag"]`; `bi01.facets.tag === src.keywords` | `["category","style","tag"]`; `bi01.facets.style === src.styles` **(new assertion)** and `bi01.facets.tag === src.keywords minus src.styles` | the `style` facet now exists (28). The `tag` line is restated as `ST4`'s subtraction, which is what it always tested — "authored order" is still the property under test, now over the survivors. Record key order gains `projectType` / `workScopeIds` in their §10 positions. |
| **E4** | `6 priced records`; per record `[projectType, workScopeIds, pricing.total, property.type, facets.style] === [undefined ×5]` ("the demo authors none of the V0.2 fields yet"); `perArea.source === "authored"` always | `10 per-area prices`; per record that tuple `=== [src.projectType, src.workScopeIds, src.totalPrice, src.propertyType, src.styles]`; `perArea.source === (src.pricePerArea ? "authored" : "derived")` | 6 authored + 4 D-1 derivations (`bi-09`…`bi-12`) = 10; `bi-04`/`bi-06` still have no `pricing` key at all and that assertion is unchanged. The INV-25 loop is **not** relaxed: "none may appear" was the all-absent special case of "each appears **iff** authored", and the general form now runs on all 19, so a spurious field still fails. |
| **E5** | `r.property === {area:{value, unit, basis:"supply"}}` for every record | `r.property === { type? , area? }` built from the record's own `propertyType` / `area`, omitted when both absent; **+2 new asserts** (an `exclusive` basis survives on real data; a record with type-but-no-area still emits `property`) | `property.type` is now authored on 17 of 19 (26, minus `bi-06` per §2); `bi-14` is `exclusive` and `bi-17` `m2`, so hard-coded `"supply"` no longer describes the corpus; `bi-15` authors no area at all. "as authored, no conversion" is still the property under test, now over a corpus that exercises all four shapes. |
| **E7** | mutations `projectType → "full_remodel"`, `propertyType → "apartment"`, and `record added` with `id:"bi-09"` | `→ "partial_remodel"`, `→ "officetel"`, added record `id:"bi-20"` | `bi-01` is now authored `full_remodel` / `apartment` (26 §1.2), so those two mutations were **no-ops** and could not move the version; `bi-09` now exists, so re-using the id added a duplicate instead of a record. Each case still mutates exactly one projected fact to a different admissible value. The 15 neutral cases are untouched and still pass. |
| **E8** | `document.workScopes === ["bathroom","kitchen"]` | `=== DEMO_WORK_SCOPES` (17 ids) | the craft narrows **`bi-01`** to kitchen+bathroom, but the other 18 records carry their own scopes, so WS2's union is the full 17. Verified the delta is closure-neutral: every one of `bi-01`'s six authored ids is also used by another record, so narrowing it removes nothing from the declaration. The per-record dedupe/order assertions are unchanged. |

### 3.2 The eight crafted-from-`bi-01` checks

| check | old expectation | new expectation | why the delta is exactly the data change |
|---|---|---|---|
| **A1** | `record.property === {area:{34,pyeong,supply}}` | `=== {type:"apartment", area:{34,pyeong,supply}}` | `bi-01` authors `propertyType` (26 §1.2) and the craft does not touch it. The line's subject — the **area** is copied under `property` untouched — is unchanged. |
| **A3** | `emission.warnings.length === 1` | *(unchanged)* | it observed **2** only because the ST6 warning rode along on every demo-derived emission. Job 1 removed it; the RD1 output-guard warning this check is about is the remaining one. **No edit.** |
| **A7** | `record.property === undefined` ("omitted entirely", MD4) | *(unchanged)* — the **craft** now also does `delete p.propertyType` | MD4's "omitted entirely" needs a record with **neither** sub-field; `bi-01` now has a type. Purpose-built record, assertion untouched. |
| **A8** | `no other record has work scopes`; `document.workScopes === ["bathroom","entrance","kitchen"]`; INV-18 case `document.workScopes === undefined` | *(all unchanged)* — both cases now run on a **`soloCraft`** snapshot: every record but `bi-01` drops `projectType` + `workScopeIds` | WS2's two absence rules ("union of exactly what the records carry", "absent when none does, never `[]`") are unobservable on a corpus where all 19 carry scopes. The stripped records are in the **breadth-absent** shape PT5 prescribes and are asserted to be valid content one by one. The INV-18 craft also drops `bi-01`'s `projectType`, because a record with no scopes may not declare a breadth (INV-28/29). |
| **A9** | `document.facets.style.values === [미니멀, 화이트]`; `assert(tag.values has 화이트)` ("another record still carries it as a plain keyword") | `=== DEMO_STYLE_VALUES` (all 9, sorted); the plain-keyword record is **crafted** (`bi-06`'s `styles` deleted) and the point is asserted **twice** — 화이트 in the document's `tag` vocabulary **and** in its `style` vocabulary | the style vocabulary is the union over 19 records, not `bi-01`'s pair. The NOTE's claim — the per-record subtraction cannot make the two DOCUMENT vocabularies disjoint — is *true of the mechanism*, and 28 made the **corpus** consistent, so the second record has to be staged. Strengthened, not relaxed. |
| **A10** | `base = projects[0]`; `safeParse({...base, projectType:"partial_remodel"})` refused with INV-28 | *(every `safeParse` unchanged)* — `base` is now `projects[0]` **with `projectType` and `workScopeIds` stripped**, plus a new assert that the stripped base is itself valid | INV-28 refuses "a breadth declared, no scopes named", which can only be observed on a record carrying none. `bi-01` now carries six. This is the purpose-built record the brief calls for: INV-28, INV-29 and INV-30 must all still fire on it, and they do. |
| **V14** | 9 cases mutating `demoEmission`: `workScopes` absent / present-with-none / closure / order / repeat / INV-28 / INV-29 / trades-only ×2 | *(every regex and every case unchanged)* — those 9 now run through `errFrom(plainEmission, …)`, a demo emission with `projectType` + `workScopeIds` stripped **at the source** and asserted to be valid and `workScopes`-free before use | "workScopes absent although records carry them" and "present although none does" are statements about the whole corpus, and with all 19 carrying scopes neither could be staged by editing one record; likewise INV-28/29's "declared a breadth, named no scopes". `plainEmission` also keeps each case isolated to its one violation instead of also tripping WS2 closure on the other 18. The remaining 8 cases in V14 (facet overlap, range bounds, `perArea.source`) still run on `demoEmission` and are untouched. |
| **V15** | case 1: `records[0].pricing.perArea.source = "derived"` → `/INV-19\|D-1a/` | *(regex unchanged)* — the mutation now also does `delete r.projectType`; and the positive `good` case no longer overwrites `document.workScopes` | `bi-01` is now `full_remodel`, so case 1 fell into case 2's branch and produced a **different but equally correct** D-1 error (`26` §4.1(b) predicted exactly this). Deleting the breadth restores the "derived **without** `full_remodel`" case the regex is about. In `good`, narrowing `document.workScopes` to two ids would break WS2 closure for the other 18 records; leaving the real declaration in place is correct because every id `bi-01` gives up is used elsewhere. |

### 3.3 `B2` — the pre-V0.2 live-package snapshot hash

| | |
|---|---|
| old | `hashJson(demo.snapshot with site.template rolled back to the 1.5.2 pin) === liveParts.siteSnapshotHash` (`df04f877…`) — i.e. *"the pin is the only build-input delta from the live package"* |
| new | `=== DEMO_SNAPSHOT_HASH_AT_LIVE_PIN` (`515a7977…`, a new frozen literal) **plus three new assertions**: the roll-back moves the hash (the pin lives inside the snapshot); putting the pin back reproduces the current hash exactly (the pin is **all** the substitution touches); and the result no longer equals `df04f877…` (the content is the second, deliberate delta) |

**The delta was proved, not assumed.** In a throwaway root: restore
`content/projects.json` and `site.json` to their `HEAD` bytes, and `prepareSiteInput` produces
`df04f8775a2d28c08ecff1544a28f0c268e0897517ed99501a7f4d6918264e54` — the live package's own recorded
`siteSnapshotHash`, exactly. Substituting `LIVE_PIN` into the `HEAD`-data snapshot gives the same
value. So the residue after accounting for the pin is **`projects.json` and nothing else**:
`site.json`'s only diff is the pin itself (verified: `git diff` shows three changed lines, all inside
`template`), and no other demo input moved. `computeBuildInputId(liveParts) === LIVE_BUILD_INPUT_ID`
and the `DEMO_OFF_BUILD_INPUT_ID` assertion are unchanged and still pass.

The new literal is deliberately taken **at the live pin**, so a future re-pin does not move it; only
a change to the demo's own data does — and a silent revert of the re-authoring would now **fail**
this check rather than quietly pass it.

`B2` was **not** converted into a skip. The brief forbids it, and `26` §5.2's suggestion to file it
with the `TODO(v0.2-data)` family would have cost a real assertion.

### 3.4 Nothing unexplained

Every one of the 17 deltas above reduces to *"the demo now has 19 records with the V0.2 fields"*
(plus, for `V1` / `A3` / `A12` / `E1` / `E3` / `E4` / `E5` / `A9`, this task's own two changes, which
are themselves that same re-authoring finished). **No residue was found.** The one delta that could
have hidden something — `B2`'s hash — was reduced to `df04f877…` by hand (§3.3) and accounted for in
full.

### 3.5 Final counts

```
npm run test:integration   61 passed · 0 failed · 9 skipped     (was 44 · 17 · 9)
npm run typecheck:platform exit 0, no diagnostics
```

The 9 skips are the same 9, with identical text. **0 of them were un-skipped**, as instructed —
though `E1b`'s blocker is now fully clear and its constants are known: version
`d56509c8100a56fdf9644baff78ff9e1`, document `11608 B`. Recomputing them is a deliberate edit to a
skipped check and was left to the orchestrator. `B2b`, `G1`, `G2`, `G3`, `G5`, `T1`, `T3` and `E2b`
are unchanged in status (see §4 for `E2b`).

---

## 4. Contract §19's worked example vs the current data — REPORTED, NOT EDITED

Reproduced mechanically: the demo snapshot filtered to `bi-01` + `bi-04` (§19's exact two-record
set), run through the real emitter, and compared field by field. **The contract was not touched.**

### 4.1 Assertions of §19 that no longer hold — 4

| # | §19 says | the data emits | note |
|---|---|---|---|
| **D1** | `bi-01.workScopeIds = ["entrance","living_room","kitchen","bedroom","bathroom","built_in_furniture"]` | `["entrance","kitchen","bathroom","flooring","lighting","built_in_furniture"]` | §19 has `living_room` + `bedroom`, which `18` §2 rejected per-id under `WS9`(c) citing the `13c` re-audit; the data has `flooring` + `lighting`, which §19 omits. **Four ids differ.** §19's own prose paragraph justifying `bedroom` and `living_room` *on this record* is unreproducible with it. |
| **D2** | `bi-04.pricing = { total: { kind:"exact", amount:19000000, currency:"KRW" } }` | **no `pricing` key at all** | `bi-04` authors no price of any kind, deliberately (`04` §4 E2 keeps it and `bi-06` price-free so the "price entirely missing" fixture survives). Knock-on: the record's key order is `… workScopeIds, facets` with no `pricing`, against §19's `… workScopeIds, pricing, facets`; and §19's first bullet (*"19,000,000 / 32 = 593,750 is a number this contract forbids"*) has no live referent. |
| **D3** | `document.workScopes = ["bathroom","bedroom","built_in_furniture","entrance","kitchen","living_room"]` | `["bathroom","built_in_furniture","entrance","flooring","kitchen","lighting"]` | pure consequence of **D1**; WS2's closure is computed, not authored. |
| **D4** | `bi-01.facets` key order `category, tag, style` | `category, style, tag` | **not in `26`'s list — found here.** The emitter builds a record's facet keys in that fixed order, and §19's *own* `bi-04` record writes `category, style`. §19 is internally inconsistent on this one record. Irrelevant to meaning, fatal to a **byte-for-byte** golden such as `E2b`. |

### 4.2 What `26` §6.1 listed that **now reproduces** — 1 of its 3 is closed

`26` named three divergences. Job 1 closed the third:

- **`bi-01.facets.style`** — §19: `["화이트","미니멀"]`; the data now emits **exactly that**. The
  `styles` pass in §1 above independently reached the same pair from `bi-01`'s own keywords.

With it, the entire **facet content** of §19 now reproduces: `bi-01.facets.tag`
`["간접조명","수납 특화"]` ✓, `bi-04.facets.style` `["화이트","모던"]` with **no** `tag` key ✓,
`facets.style.values` `[모던, 미니멀, 화이트]` ✓, `facets.tag.values` `[간접조명, 수납 특화]` ✓,
`facets.category.values` `[full-remodel, kitchen-bath]` ✓. §19's `ST2` bullet (`간접조명` and
`수납 특화` stay in `tag`) is now literally true of the live data.

### 4.3 Everything else in §19 matches

`schemaVersion`, `resource`, `listingUrl`, document key order, and on **both** records: `id`,
`title`, `detailUrl`, `publishedAt`, `location`, `projectType`, `property` (including `bi-04`'s
`type: "apartment"` — §2 kept it), `bi-01.pricing.perArea` (2,900,000 KRW/pyeong, `authored`, and no
total), `bi-04.workScopeIds`, `facets.category` on both.

### 4.4 For the next contract revision

Two substantive fields (**D1**, **D2**) and one formatting fact (**D4**) have to be restated against
the authored data before §19 can serve as `E2b`'s golden; **D3** follows from **D1** automatically.
The cheapest reconciliation is to restate §19's `bi-01.workScopeIds` as `18` §2 authored it, delete
`bi-04`'s `pricing` block (its "no `perArea` for a partial" point survives without a total — though
the 593,750 illustration does not), and fix the `bi-01` facet key order to `category, style, tag`.
Alternatively `E2b` needs a different golden. **Not decided here.**

---

## 5. For the orchestrator

1. **`styles` authored for all eight**, from each record's own keywords under `ST1`/`ST2`, matching
   `04` §2's standard. No record was left without; `bi-18` remains the corpus's only `styles`-less
   record and always was.
2. **The `ST6` warning is gone.** The demo emission is 0 errors / 0 warnings; the two document
   vocabularies are disjoint.
3. **`bi-06`'s `propertyType` removed**, `bi-04`'s kept. Both claims in `26` §6.4 verified directly.
4. **61 · 0 · 9**, typecheck clean, all 9 skips untouched, no assertion weakened — assertions were
   added in 7 of the re-baselined checks.
5. **Every delta is explained.** `B2`'s hash was reduced by hand to the live package's recorded
   value; the residue is `projects.json` and nothing else.
6. **§19 diverges on 4 assertions** (§4.1), one of them (`bi-01`'s facet key order) not previously
   reported; one of `26`'s three original divergences is now closed.
