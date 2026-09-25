# 02 — Independent review: contract soundness of `07-integration-contract-v0.2-candidate.md`

| | |
|---|---|
| date | 2026-09-24 |
| reviewer | independent, fresh context; did not write 07 |
| under review | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (CANDIDATE) |
| baseline | `03-integration-contract-v0-candidate.json` (FROZEN V0, machine-readable) and `02-integration-contract-v0-candidate.md` (normative V0) |
| ground truth checked | `data/sites/boost-interior-demo/content/projects.json` (8 records), `platform/content/schema.ts`, `platform/integration/{emit,validate,contract}.ts`, live `https://interior-demo.boostweb.co.kr/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json` |
| verdict | **NOT READY TO FREEZE.** 3 BLOCKER, 9 MAJOR, 8 MINOR, 6 NOTE. |

Count line: `BLOCKER=3 MAJOR=9 MINOR=8 NOTE=6`

Only real defects are listed. Where a rule is attacked, the exact text is quoted and a concrete
record or scenario is given. Where 07 is right, it is said in one line under NOTE.

---

## BLOCKER

### B-1 · PT2's exception clause + the §13 classification of bi-03 make D-1 produce a misleading "derived" number

**Rule attacked.** PT2 (§5.2): *"A whole-dwelling project that left one already-good space untouched
is still `full_remodel`; that is a detail of the project, not a boundary of it."* and §13 row bi-03:
*"`full_remodel` (PT2: one already-good space excluded is a detail, not a boundary)"*.

**Why it is wrong.**

1. *The headline motivation collapses.* §1 item 1 and §5.3 use bi-03 as **the** example of why
   `category` cannot carry breadth (*"bi-03 is tagged category: full-remodel while its own body says
   욕실은 … 그대로 두었습니다"*). §13 then assigns bi-03 `projectType: full_remodel` — the same value
   `category` already had. The one record the document cites as proof that a second axis is needed
   gets no different answer on that axis.
2. *bi-03 does not even qualify under PT2 as written.* Source: title "42평 가족형 아파트 **수납 중심**
   리모델링", scope `[현관, 거실, 주방·팬트리, 아이방, 드레스룸]`, body: 욕실 untouched. A 42평 flat has a
   master bedroom, at least one other bedroom and (almost always) two bathrooms; none of 안방, 작은방,
   욕실 are in scope. That is not "one already-good space"; it is a storage-focused partial. The
   summary never says "전체".
3. *PT2's clause is the inference PT3 forbids, moved one step upstream.* PT3: *"never inferred from
   `category`, from the title, from the body text, from the scope count"*. §13's justification for
   bi-03 is body text; for bi-02 it is *"no '전체'/'부분' wording; scope covers 거실·주방·침실·욕실, no
   exclusion stated"* — inference from **absence** plus the **scope count**, the two sources PT3 names.
   Putting the inferred value into an authored field does not make it authored.
4. *D-1's four-condition guard is therefore not exhaustive.* Condition 1 (`projectType == "full_remodel"`)
   is the only thing standing between a partial total and a per-area price, and PT2 lets a partial
   through.

**Concrete failure.** Author for bi-03, as the document invites (§13 item 2), `pricing.total =
{kind:"exact", amount:130000000, currency:"KRW"}` — the price of 현관/거실/주방·팬트리/아이방/드레스룸
storage work. All four D-1 conditions hold. The emitter writes
`perArea = {amount: 3095238, currency:"KRW", perUnit:"pyeong", source:"derived"}` — 130,000,000 / 42.
PB3 then compares it with a true whole-dwelling 42평 case, and GR1 lets the assistant state it as fact.
This is exactly the number D-1a calls *"the single most important prohibition in V0.2"*, produced
through the front door with a provenance badge that consumers will trust more than an authored value.

**Fix.** Delete PT2's exception sentence. Define `full_remodel` strictly: every habitable space of the
dwelling was in the project's scope; any stated exclusion, or a scope that omits a bedroom/bathroom of
the dwelling, is `partial_remodel` or absent. Reclassify bi-03 → `partial_remodel` (its prose states an
exclusion), bi-02 → absent (no authored breadth statement). If the lenient PT2 is kept for some reason,
D-1 cannot be kept: there is no machine-checkable condition that distinguishes "one space untouched"
from "several spaces untouched". See also O-1, O-2.

### B-2 · PB3 removes PR4's comparability gate and replaces it with nothing normative

**Rule attacked.** PB3 (§14.3): *"compare `perArea` with `perArea` when `currency` and `perUnit` match
and `AR5` permits the area bases to be compared. Replaces `PR4`'s category rule: the comparability gate
is now `projectType`"*.

**Why it is wrong.** The normative conditions in PB3 are currency, perUnit and AR5. `projectType` is
named in the commentary, not in the rule, and even the commentary does not say the two records'
`projectType` must be present or equal. V0 PR4 (`C: MUST`) forbade cross-category price comparison;
04 line 126 records the consumer accepting it as `C: MUST`. PB3 as written is strictly looser.

**Concrete failure (on the live data).** bi-08 "51평 신축 아파트 입주 전 홈스타일링": body *"철거 없이 진행
… 기본 바닥과 주방은 그대로 두고"*, authored `pricePerArea 1,600,000 KRW/pyeong`, `projectType` absent
(§13). bi-01: 전체 리모델링, `2,900,000 KRW/pyeong`, `full_remodel`. Same currency, same perUnit, same
basis (`supply`). PB3 permits: *"bi-08 is a cheaper comparable case at 1.6M/평"* to a visitor asking for a
34평 전체 리모델링. V0 PR4 forbade this (different `category`). Second failure: PA1 places no restriction
on an **authored** `perArea` on a `partial_remodel` record; PB3 compares it with a `full_remodel`
per-area price, which is the D-1a number entered by hand.

**Fix.** PB3 MUST require, as normative conditions: both records carry `projectType` and the values are
equal; AND (until the consumer confirms its removal in writing) the same `category` value — PR4 stays
in force as an additional gate. Either forbid an authored `perArea` when `projectType == "partial_remodel"`
(VA1 build failure) or mark it non-comparable. A record with `projectType` absent is never on either side
of a per-area comparison (extend PB5 from budget claims to comparisons).

### B-3 · `workScopeIds` is declared open (WS7) but PT2, PB1 and GR3 use it as if it were closed — the "주방이랑 욕실만 2천만원" case produces a false budget claim

**Rules attacked.** WS7 (§7.4): *"never infer inclusion or exclusion beyond the emitted set. A record
without `flooring` is unknown on flooring, not confirmed without flooring."* versus PT2 (§5.2):
*"`partial_remodel` — … `pricing.total` covers only that subset"*, PB1 (§14.3): *"a scope-bounded budget
against a `partial_remodel` total whose `workScopeIds` **overlap** the requested scopes"*, GR3: *"partial
exact scopes → partial overlapping scopes"*.

**Why it is wrong.** "The total covers only that subset" is only a usable fact if the subset is fully
listed. WS7 says it is not. V0's `scope` was *"closed at the authored granularity: subset tests are
allowed"* (03 wellKnownKeys.scope); V0.2 regresses to open and then builds budget claims on it. PB1's
"overlap" is the wrong operator in either reading.

**Concrete failure.** Site B authors a `partial_remodel` with `workScopeIds: [kitchen, bathroom,
flooring, wallpaper, lighting]` and `total 45,000,000`. Visitor: "주방만 1,500만원". `kitchen` overlaps,
PB1 permits a total-vs-total comparison, and the assistant says the visitor's budget is a third of a
comparable case. The total bought five things, not one. In the other direction, bi-04 (`[kitchen,
bathroom]`, 19,000,000) can never be presented as "exactly kitchen+bathroom" under WS7, so the document's
own worked example (§19) has no rule that lets the consumer say what it says about it.

**Fix.** Split the completeness rule by breadth: for `partial_remodel`, `workScopeIds` MUST be the complete
set of scopes the `pricing.total` covers (closed at the id granularity, like V0 `scope`); for
`full_remodel` and absent, the set is open (WS7). PB1: an "exact" claim requires `requested ⊆ record set`
(and, for "만" queries, equality); overlap is only a labelled fallback (GR2). WS7 must say which
`projectType` it applies to.

---

## MAJOR

### M-1 · §4 demotes `facets.category` (and `tag`) to DISPLAY / "not match keys" — a silent semantic change that contradicts V0, 04 and 07 §8

§4 table: DISPLAY = *"`id`, `title`, … `facets.category`, `facets.tag` — not match keys"*. V0 §7.3
lists `facets.<key>` with 쓰임 **매칭**; §11.3 `category` is closed; PR4 and BU3 are defined on it; §20
"+ `facets` → 분류 · 범위 · 태그 검색". 04 line 63 (consumer disposition): *"producer 가 가진 가장 믿을 만한
닫힌 facet 이다. 표시 전용으로 버리지 않는다"*; 04 line 192 `CATEGORY_SEARCH_READY = YES`. 07 §8 in the
same document says `category` is *"kept, unchanged"*. Changing an emitted field from match key to
display is a **meaning change** (SV2 → major) done in a table with no rule id and no entry in §20's change
log. It also makes SD1 (*"a structured fact is never also emitted as a facet value"*) false on the
worked example: §19 bi-01 carries `category: ["full-remodel"]` and `projectType: "full_remodel"` in one
record.

**Fix.** `category` stays a closed, site-local, structured match key (its V0 role). Reword SD1 to *"the
producer never maps a built-space structured fact into a facet key; a site's own taxonomy may overlap
one"*. Remove `category`/`tag` from the DISPLAY row.

### M-2 · INV-9 and INV-10 contradict D-1, and INV-22 is unsatisfiable together with INV-20 on any exact division

§15: *"V0's `INV-1` … `INV-16` all survive."* INV-9 (03): *"nothing absent in the source appears"*.
INV-10: *"area and pricePerArea numbers, units and basis equal the source (no conversion)"*. A derived
`perArea` is absent in the source and equals no source number. Whoever implements INV-9/INV-10 literally
fails every D-1 record; whoever makes them pass weakens them silently.

INV-22: *"no field anywhere equals `perArea.amount × area.value`"*. Verified counterexample: `total
34,000,000 KRW` exact, `area 34 pyeong`, `full_remodel`, no authored `perArea`. INV-20 requires
`perArea.amount = 1,000,000`; then `total == 1,000,000 × 34` and INV-22 fails. An opted-in customer whose
numbers divide evenly fails its public build (VA1 fail-closed).

**Fix.** Amend INV-9/INV-10 with an explicit carve-out: *"except a value with `source: "derived"`, which
must satisfy INV-20"*. Replace INV-22 with *"no field is **computed** as `perArea × area`"* (a
producer-code invariant, not a data invariant) or delete it — TP3 already states the rule.

### M-3 · Citation defects: one fabricated V0 quotation, one silently edited rule, one undocumented owner decision, one non-existent audit

| where in 07 | claim | verified |
|---|---|---|
| §9.1 | *"V0 §10's 'exact/range 동시에 존재하는 모호한 객체 금지'"* (in quotation marks) | **No such sentence in 02 or 03.** `grep -i "exact\|range\|모호"` over 02 returns nothing; 03 has only MD6. The quote is invented. |
| §9.3 | *"ND1 (restated, unchanged in force) — … inferred, estimated, guessed or converted"* | 03 ND1 reads *"inferred, estimated, converted or **synthesised**"*. The restatement replaces "synthesised" with "guessed" — the one word that a division violates — while claiming "unchanged in force". |
| §16 RO1, §18 O-5 | *"owner DECISION A"* | Occurs only inside 07. Not in 02, 03, 04, 05, 06 or anywhere else under `docs/`. |
| §13 | *"An audit of all 8 current records (`docs/result/interior-portfolio-v0.2/…`)"* | Directory did not exist before this review file was written. The audit table in §13 is the only audit. |

**Fix.** Delete the fabricated quotation (TP1's `kind` discriminant is justified on its own; it needs no
V0 ancestor). Restate ND1 verbatim and say plainly that ND2 carves "synthesised by D-1" out of it. Record
DECISION A in 04's decision log or remove the reference. Either write the audit file or point §13 at
itself.

### M-4 · PA3 and PA4 conflict on the word "basis"; PA4 misdescribes PR2

PA4: *"V0 `PR2` survives: price **basis (what the price includes)** is not available and is unknown; it is
never inferred from `area.basis`."* PR2 (03): *"price basis is not available in V0 = unknown; never
inferred from area.basis"* — where basis means the **area basis** of the price (supply/exclusive, 02 §10
"가격의 면적 기준(basis)"). "What the price includes" is PR3, not PR2. PA3 in the same section then gives a
derived `perArea` an area basis (*"per the record's `property.area` exactly, including its `basis`"*).
For a derived value that is true by construction, not by inference, so PR2 needs an explicit carve-out;
PA4 hides the conflict by describing the wrong rule. Consequence: the consumer must read `source` to know
whether a `perArea` has a basis at all (authored → unknown, derived → `property.area.basis`). That is a
semantic carried by `source` that the document never states, and PB3's *"AR5 permits the area bases to be
compared"* is unevaluable without it.

**Fix.** PA4 → *"PR2 survives for an authored `perArea`; for a derived one the area basis is
`property.area.basis` by construction (PA3)."* State in §9.2 that `source` determines whether a basis is
known.

### M-5 · SV2-pre1 is circular, and RO2 removes the only protection PC6 rollback had

§3: *"Decision: `schemaVersion = "0.2"`, with this clause added to `SV2`: SV2-pre1 — While the major is
`0` … A minor bump MAY remove, rename or re-shape a field."* 02 line 10: *"필드·enum·의미를 바꾸는 변경은
§14 의 버전 규칙을 따른다"*; SV2: *"의미 변경 = major"*. Adding SV2-pre1 changes the meaning of SV2 — under
the frozen rules that is itself a major change, made by the document that needs it to avoid one. The
consumer confirmed R-1…R-12 against the frozen SV2 with no pre-1.0 exception; it has not accepted this
clause.

The degradation trace for an **un-updated V0 consumer** is correct (verified against SV3, VO4, VO5 and
the validity table; see N-1). The unprotected direction is the reverse: RO2 lets the consumer drop its
"0.1" read path; PC6 says a rollback *"returns the old manifest/document pair unchanged, including its
schemaVersion"*; SV4 protects only **majors**. After RO2, a producer rollback to a 0.1 package degrades
the consumer to wiring-only (`area`, `pricePerArea`, `facets.scope`, `facets.tag` are unknown fields to a
0.2-only reader) with no rule that says so.

**Fix.** Either bump to `1.0` and use SV4 as designed (consumer supports `{0, 1}`), or obtain the
consumer's written acceptance of SV2-pre1 as a contract amendment **before** freeze. In both cases make
RO2 conditional: the 0.1 read path stays until no 0.1 package remains inside any registered site's
rollback window.

### M-6 · The 26-id `WorkScopeId` vocabulary does not achieve the cross-site sameness it exists for, and WS1's silent omission misrepresents records

- *No authoring rule per id.* "복도 수납" (bi-01) is `[hallway, storage]` or `[hallway, built_in_furniture]`;
  "확장 발코니" (bi-05) is `[balcony]` or `[balcony, expansion]`; 안방 and 작은방 both become `bedroom` while
  아이방 gets its own `kids_room`; "현관·중문" is `[entrance]` or `[entrance, doors]`. Two sites will author
  the same work differently, and VO2-style opacity is gone, so the consumer will treat different things as
  the same. "Ids are stable across sites, which is the entire point" (§7.3) is not delivered by a list of
  ids; it needs a one-line qualification rule per id.
- *WS1 omits silently.* bi-08's actual work — 아트월, 천장 조명, 커튼, 가구 배치, no demolition — maps to
  `lighting` and nothing else; under WS1 the operator will author `[living_room, dining, bedroom, study,
  lighting]` (the rooms the gallery groups name) and a styling job is represented as a room remodel.
  There is no `other`/unmapped signal and no authoring-time warning.
- *Residential-only semantics in an annex that claims construction and real estate.* PT2 is defined on
  "the dwelling"; `property.type` admits `commercial` and `mixed_use`; a shop fit-out is neither
  `full_remodel` nor `partial_remodel` of a dwelling, and a new-build vendor has no use for a remodel binary
  at all. The annex layer (02 §1: 인테리어·건축·부동산) now carries interior-remodel vocabulary.
- *`demolition` / `expansion` overlap the deferred price-inclusion-scope item.* TP2: inclusion of demolition
  is unknown for every record; `workScopeIds` may say `demolition` was done. Not contradictory, but the
  same word now carries two half-facts.

**Fix.** Publish a qualification rule per id (what an operator may tick it for); add an explicit
`unmapped: true` or require WS1 to fail at authoring, not omit; scope PT2 and the vocabulary to
`property.type ∈ {apartment, officetel, villa, detached_house}` or define them per property type; rename
`demolition`/`expansion` or state their relation to TP2.

### M-7 · Consumer-internal architecture and consumer declarations written by the producer

02 line 14: *"이 문서는 어느 한쪽의 내부 구현을 설명하지 않는다 … consumer 의 tool·tenant·fetch 구조는 계약에
등장하지 않는다."* 07 breaks this in four places: GC1 (*"no field … may be referenced by the consumer's
generic conversation, tool-calling, gating, audit, card or lead machinery"*), §1.1 (*"no domain logic in
the consumer's generic core"*), GR2's six match-class names, GR3's fallback ladder. The producer cannot
verify any of them. Separately, §8 states *"`style: 150` is declared"* — VO6 limits are **consumer**-declared
(03 VO6: "limits are consumer-declared, not normative"); the producer cannot declare one on the consumer's
behalf, and `contract.ts` would encode a number nobody declared.

**Fix.** Move GC1/GR2/GR3 to the consumer's design document or to the consumer confirmation; keep only
the contract-level obligation (*"a fallback is never presented as an exact match"*). Write the `style`
limit as *"to be declared by the consumer; producer warning threshold set when declared"*.

### M-8 · ST4's second sentence removes `tag` for every built-space producer — an unforced loss of V0 capability, and `style` has no named source field

ST4: *"A built-space producer that emits `style` does not emit `tag`."* SD1 only needs a value never to be
in both keys. Under ST4, `간접조명` and `수납 특화` (in 5 of 8 live records) leave the document entirely:
not style (ST2), not tag (ST4), not a work scope (WS4 forbids sourcing from `keywords`). A V0 consumer
that today searches `tag` loses that criterion (VO5) for no stated benefit. V0 §11.3's own reasoning
(*"전부를 style 로 내보내면 거짓 분류다"*) argues for a **split**, not a deletion. Also, `ProjectSchema` has
`keywords`, no `style`; INV-25 (*"no `style` value is emitted for a record whose source field is
absent"*) names no source field, so it is undefined.

**Fix.** ST4 → *"a value never appears in both; `tag` = the record's descriptive tags minus its `style`
values."* Name the authored source of `style` (a new `style` array on the record, or a per-keyword
classification stored in content — authoring, not emitter inference).

### M-9 · D-1 / RD1 arithmetic is defined on doubles and unbounded — determinism (INV-26) and serialisation (§6.1, C-21) can break

Verified in Node: `7 / 0.28` evaluates to `24.999999999999996` (true value 25); `3 / 0.08` to `37.5`.
Whether `roundHalfAwayFromZero(total / area)` sees a tie depends on the platform's division, so a producer
rebuild on another runtime, or the consumer's INV-20 recomputation, can differ by 1 on near-ties. `total`
has no upper bound (schema.ts caps `pricePerArea.amount` at 1e9 but no `total` exists yet); `1e19 / 0.01`
serialises as `1e+21`, which §6.1 / freeze review C-21 forbids (*"지수 표기 없이"*). Neither `area.value
< 1` nor 2-decimal areas are wrong per se, but they are where the tie cases live.

**Fix.** Define D-1 on integers: `T = round(total.amount × 100)`, `A = round(area.value × 100)`,
`amount = floor((2T + A) / (2A))` (half away from zero for positive operands); cap `total.amount` (1e9, as
`pricePerArea` already is) and reject a derived amount that would not serialise as a plain integer.
Then RD1 is well-defined for every currency and every legal area value.

---

## MINOR

- **m-1** §12 record-level: *"a negative / non-finite amount"* — zero is not named, so `amount: 0` reaches
  the consumer as a price (MD2 hazard, V0 PR1 says `> 0`). Write "non-positive".
- **m-2** TP1 forbids `range` with `minAmount == maxAmount` on the producer side; §12 says nothing about
  what the consumer does with one. State "treat as exact" or "drop the total".
- **m-3** §6 cites AR6 for an unknown `property.type`; AR6 covers `unit`/`basis` only. §12's unknown-value
  list is the right place and already has it — fix the citation.
- **m-4** §7.3 labels exist for `ko-KR` only. *"The `label` is the display name for the document's
  `site.locale`"* cannot be honoured for any other locale; under VA1 that is a build failure with no rule
  saying so. Resolve with O-3 (drop labels) or specify a fallback.
- **m-5** §13: *"the two records with no `pricePerArea` (bi-04, bi-06) are exactly the two clearest partials
  — which is what `D-1a` predicts"*. D-1a is about derived values; these are authored absences. It predicts
  nothing here. Delete.
- **m-6** §12 adds *"`facets.category` length ≠ 1"* as a consumer record-level drop. V0 §19 and validity (b)
  do not include it (INV-16 is a producer invariant). New consumer behaviour → needs consumer confirmation.
- **m-7** §12: *"`pricing.perArea` missing `source`"* drops the whole record (id/title/detailUrl). Consistent
  with V0's "malformed pricePerArea → drop record", but "treat `perArea` as absent" loses less. Decide
  deliberately.
- **m-8** §10 declares `facets?` optional while `category` is required with exactly one value, so `facets`
  is effectively required (inherited from V0; `emit.ts` always sets it). Say so.

## NOTE

- **N-1** The §3 degradation trace for an **un-updated V0 consumer** is correct. Traced: manifest `0.1` valid;
  document `0.2` has major 0 → parsed (SV3); `workScopes` unknown top-level → ignored; `facets.style` unknown
  key → ignored (VO4); VO1 closure on `category`+`style` holds; records keep id/title/detailUrl/location/
  publishedAt/category; `area`/`pricePerArea`/`scope`/`tag` off (VO5, MD5). Listing and category search
  survive; nothing is misread. No INV-1…INV-16 breaks on the consumer side — the breaks are producer-side
  (M-2).
- **N-2** Generic-core contamination: none in core (`ND2`, `SV2-pre1` are vertical-neutral) or in portfolio.
  ST4 is annex logic that changes a portfolio-layer key's emission — borderline, resolved by M-8.
- **N-3** GR2 lists six match classes and then says the vocabulary belongs to the consumer. Either the list
  is normative or it is not in the contract.
- **N-4** §1's factual claims about the live document check out: 8 records, `scope` 20 values, `tag` 8
  values, `pricePerArea` absent on bi-04 and bi-06 only.
- **N-5** D-1 derives even when `property.area.basis` is absent; PA3/AR5 then say "unknown lowers
  confidence". Inherited from V0's authored `pricePerArea` (also basis-unknown); acceptable, but D-1 should
  say it.
- **N-6** The `kind` discriminant on `pricing.total` (exact XOR range, structural) is the right shape; keep
  it, minus the invented ancestry (M-3).

---

## Answers to the open questions (§18)

**O-1 · ND2.** The *structure* of ND2 is sound: exhaustive list, fixed formula, same-record inputs, explicit
provenance. D-1 itself is not, for two reasons. First, its only real guard (condition 1) rests on PT2, which
B-1 shows lets partial totals through; a "derived" badge on a misleading number is worse than no number.
Second, the document's own premise (§1 item 2: a visitor's budget is a **total**) is served by
`pricing.total` + PB1 alone; a derived per-area price only enables cross-provenance per-area comparison,
which B-2 shows is under-gated anyway. Recommendation: **drop ND2/D-1 from V0.2**, keep ND1 verbatim, and
revisit when a real need appears. If it is kept: strict PT2 (B-1), integer arithmetic and bounds (M-9),
INV-9/10 carve-outs (M-2). On rounding for non-KRW: integer major unit is acceptable (relative error ≤ 0.5%
at amounts ≥ 100, which every real per-area price exceeds), but "≤ 2 fraction digits, half away from zero"
needs no currency table and matches the authored shape — either is fine once the arithmetic is exact.

**O-2 · the audit.** bi-02 → **absent**: no authored breadth statement anywhere; "no exclusion stated" +
scope count is inference from absence, which PT3 names. bi-03 → **`partial_remodel`** (or absent): the
prose states an exclusion and the scope omits 욕실 and 안방/작은방 of a 42평 flat; "one space" is not what
the source says. bi-05 → **`full_remodel`** is defensible: the operator wrote "전체 리모델링" in the summary
and the bathroom received work (실리콘·수전). PT2's exception clause is exactly the inference PT3 forbids and
should be deleted; a stated exclusion yields `partial_remodel` or absent, never `full_remodel`.

**O-3 · labels.** Do not emit `label`. The ids are contract-fixed and the consumer must own a
visitor-language → id table anyway (WS6), so the label is redundant for matching and only adds a drift
surface and a locale problem (m-4). Keep a document-level `workScopes` block as a plain **id list** (it
still gives WS2 closure and a VO5-style coverage signal); if `{id,label}` is kept for shape symmetry, mark
labels informative (VO3) and never a matching input.

**O-4 · `"0.2"`.** Not honest as written: SV2-pre1 is a meaning change to SV2, introduced by the document
that needs it, and the consumer confirmed the frozen SV2 without it (M-5). It is *practically* safe for the
forward direction (N-1) and unsafe for rollback after RO2. Either go to `1.0` and let SV4 do its job, or
have the consumer accept SV2-pre1 in writing as an amendment before freeze — and in both cases tie RO2 to
the rollback window.

**O-5 · `category`.** Two genuinely different axes — *what kind of job* (site taxonomy) versus *how much
of the dwelling* (breadth) — that correlate on this site only because this site's taxonomy ids happen to
be breadth words (`full-remodel`, `partial-remodel`). A real site's taxonomy ("주거 / 상업 / 오피스텔") would
not correlate. Keep both; do **not** demote `category` (M-1); fix SD1's wording. The duplicate-truth
appearance is a property of the demo data, not of the schema.

**O-6 · WS3 sets.** The gap will be felt immediately ("욕실 2개", "방 3개" are the first things a Korean
apartment visitor says), but counts inside `workScopeIds` are the wrong fix — the visitor is stating a
property fact, not a work-scope fact. Accept WS3 for V0.2 and record a deferred structured
`property.rooms` / `property.bathrooms` in §17 so it is not re-invented as a count on the scope set.

**O-7 · coverage.** No. Zero authored totals means PB1, D-1, TP1, INV-19…INV-23 and the GR3 ladder are
exercised only by fixtures written by the people who wrote the rules — and the exact-division case
(34,000,000 / 34) that breaks INV-22 was not among them. Before freeze: at least one operator-supplied
total per `projectType`, one `range`, one exact-division record, and one bi-03-shaped record with a total,
so that B-1 is tested rather than argued.
