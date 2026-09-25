# 05 — Pre-implementation review disposition (Contract V0.2)

| | |
|---|---|
| date | 2026-09-24 |
| reviews | round 1: `02-review-contract-soundness.md`, `03-review-consumer-realism.md` (both fresh context). round 2 (delta): `06-delta-review.md` (fresh context) |
| reviewer model | Fable, fresh context, both. "Fable MAX" was not selectable as an effort tier from the orchestration tool; fresh-context Fable was used. **Model fallback recorded** (task §4). |
| orchestrator | Opus 5 (1M) xhigh. The task named Fable xhigh for the main lane. **Model fallback recorded.** |
| totals | round 1 — R1: BLOCKER 3 · MAJOR 9 · MINOR 8 · NOTE 6; R2: BLOCKER 3 · MAJOR 6 · MINOR 5 · NOTE 7. round 2 — BLOCKER 3 · MAJOR 11, verdict **NOT READY**. |
| outcome | round 1: 6 BLOCKER + 15 MAJOR → contract **rev 2**. round 2: 3 BLOCKER + 11 MAJOR → contract **rev 3**. |

The two reviewers had no contact with each other and were given no preferred answer. They converged
independently on the same central defect (the `PT2` exclusion clause and the budget-claim rules),
which is the strongest signal in this review round.

---

## Accepted BLOCKERs

### D-B1 · `PT2`'s exclusion clause is the inference `PT3` forbids
*R1 B-1, R2 M-2/O-2.* **ACCEPTED IN FULL.**

The clause *"a whole-dwelling project that left one already-good space untouched is still
`full_remodel`"* was written to keep `bi-03`. Verified against source: `bi-03`'s `scope` is
`[현관, 거실, 주방·팬트리, 아이방, 드레스룸]` — 안방, 욕실 **and** 작은방 are all absent from a 42평
family flat, and the body says *"욕실은 … 그대로 두었습니다"*. That is not "one space". The clause
was elastic enough to license exactly the inference `PT3` bans, and it was load-bearing for `D-1`.

**Fix:** clause deleted. `PT2` is strict.

**Refinement made while applying the fix.** A first cut of `PT4` read *"any space **or work**
excluded ⇒ omit"*. Applying it to the demo set showed it was too broad: `bi-09` and `bi-11` are
whole-dwelling remodels whose source says *"창호는 그대로 두어"* — a **trade**, not a space — and
they would have lost `full_remodel`, taking the "34평 전체 5천" scenario with them. The axis is
*how much of the dwelling was remodelled*, measured in **spaces**; nearly every whole-home remodel
omits some trade and the total still buys the whole dwelling.

`PT4` is therefore clause-based: **(a)** a stated **space** exclusion, **(b)** a project defined by a
narrow set of **trades across the dwelling** (바닥·도배·조명만 — every space touched, but not a
remodel's scope), **(c)** the source frames it as something other than a remodel (홈스타일링),
**(d)** no explicit breadth statement at all. A stated **trade** exclusion is not a disqualifier —
and is not by itself evidence *for* `full_remodel` either; `PT3` still requires the whole-dwelling
framing to be stated in the source.

Unlike rev 1's exception this is testable rather than elastic: a space exclusion **always**
disqualifies. All three shapes — trade-excluded full, space-excluded, trades-only — exist in the
expanded demo set, so the rule is exercised, not merely asserted. Reclassification below.

### D-B2 · `PB1`/`PB3` permit misleading budget claims
*R1 B-2, R2 B-1.* **ACCEPTED IN FULL.** Four separate holes, all fixed in rev 2 §14.3:

| hole | example on live data | fix |
|---|---|---|
| `PB1` said scopes "overlap" | "욕실만 600~800" vs `bi-04` `{kitchen,bathroom}` 1,900만 → "예산보다 낮습니다" while the total bought two rooms | set relations: `record == requested` comparable; `record ⊋ requested` **not** comparable, disclosure naming the extra spaces; partial intersection not comparable |
| full branch had no area condition | 34평/5천 vs a 19평 `full_remodel` 4,900만 → "예산에 맞는 사례" | area must be `AR5`-comparable and within the declared tolerance, else `area_fallback` |
| no predicate for exact×range | two consumers could give opposite verdicts on one document | predicate and tolerance fixed normatively (rev 2 §14.3 `PB6`) |
| `PB3` did not require `projectType` present **and** equal | `bi-08` (absent, 160만/평, 홈스타일링) vs `bi-01` (full, 290만/평) → "훨씬 저렴" | both records must carry the **same present** `projectType`; absent is never comparable |

`PR4`'s same-`category` requirement is **restored** alongside the new `projectType` gate, not replaced
by it: `PR4` is a frozen `C: MUST` the consumer has already accepted (`04` line 126), and retiring a
consumer obligation requires the consumer's confirmation, not a producer-side edit.

### D-B3 · `WS7` open set vs `PT2`/`PB1` closed set
*R1 B-3, R2 B-1a.* **ACCEPTED.** If `workScopeIds` is open (absent = unknown) then `PT2`'s
*"the total covers only that subset"* has no referent, and `bi-04` can never be described as
"exactly kitchen + bathroom".

**Fix:** `workScopeIds` is **closed when `projectType == "partial_remodel"`** — it is the complete
set of scopes the total covers — and open otherwise. Stated as `WS7a`/`WS7b` in rev 2 §7.4.

### D-B4 · `GR2` was unenforceable
*R2 B-2.* **ACCEPTED.** Listing six match classes and then disclaiming the envelope produced a rule
nobody could fail. On live data, `bi-01` satisfies breadth + area for "예산 3천, 34평 전체", the
budget is *not evaluable* (`perArea` only), and a consumer could legitimately tag it `exact` →
"딱 맞는 사례예요" to a question whose only content was the budget.

**Fix:** rev 2 §14.5 pins the minimum: a class **per record**; `exact` is defined as *every criterion
the visitor stated was evaluated and satisfied*; a per-record list of criteria that were **not
evaluable**; a closed class list; and a test invariant asserting it.

### D-B5 · `D-1c` had no enforcement point; `GR1` invited the violation
*R2 B-3.* **ACCEPTED — best finding of the round.** `D-1c` forbids the *consumer* computing a
per-area price, but the consumer is an LLM. The moment `perArea 2,900,000/평` and `area 34평` sit on
the same record in the model-facing tool result, "3천 예산으로 34평 전체 되나요?" yields
*"34평이면 약 9,860만원…"* — a model-computed total, presented as a quote, violating `TP3`, `TP2`
and `D-1c` at once. Today this is safe only by accident: `executor.ts:108-116` happens to carry no
price into the result.

Note this hazard exists for **authored** `perArea` too, so it is not an argument against `D-1`.

**Fix:** two new rules in rev 2 §14.5 — an envelope rule (`perArea` and `area` are not co-present on
a model-facing record unless the visitor asked for a per-area comparison) and an **output**
invariant (no number in the assistant's reply equals `perArea × area` or `budget / area`).

### D-B6 · `INV-22` fails the build on valid data
*R1 M-2, raised as MAJOR; treated here as a BLOCKER because it fails `VA1`.* **ACCEPTED.**
`INV-22` said "no field equals `perArea × area`". With an authored `perArea` of 1,000,000 and an
area of 34, a real total of 34,000,000 satisfies it by arithmetic coincidence and the build fails.

**Fix:** `INV-22` is restated as a **provenance** invariant — no emitted value was *computed* as
`perArea × area` — enforced by construction (no such code path) and tested by asserting
`pricing.total` is only ever a copy of a source field. `INV-9`/`INV-10` get explicit
`source: "derived"` carve-outs, since rev 1 claimed `INV-1..16` survived unchanged while `D-1`
plainly breaks both.

---

## Accepted MAJORs

| id | finding | disposition |
|---|---|---|
| D-M1 | R1 M-1: rev 1 demoted `facets.category`/`tag` to DISPLAY "not match keys", contradicting V0 §7.3/§11.3/§20 and the consumer's accepted `CATEGORY_SEARCH_READY=YES` | **ACCEPTED.** `category` stays a match key. `SD1` reworded: it forbids one *fact* having two carriers, not facets being match keys. Added consumer rule: `category` MUST NOT be used as a proxy for breadth (`PT3`'s consumer mirror) — that, not demotion, is the real protection (R2 m-4) |
| D-M2 | R1 M-3: citation defects — the "exact/range 모호한 객체 금지" sentence was quoted as V0 but exists only in the task brief; `ND1` restatement swapped a word; "owner DECISION A" resolved to nothing | **ACCEPTED.** All citations verified against `02`/`03` in rev 2. Task-brief material is now cited as *owner decision*, and the owner decisions are recorded in `01-owner-decisions.md` so the citations resolve |
| D-M3 | R1 M-4: `PA4` described `PR3`, not `PR2`; derived `perArea` basis unstated | **ACCEPTED.** `PA4` corrected; `PA3` states basis inheritance explicitly |
| D-M4 | R1 M-5 / R2 n-3: `SV2-pre1` was a circular amendment to a frozen, consumer-confirmed rule; rollback after `RO2` degrades silently | **ACCEPTED, with a different fix than either reviewer proposed — see "Escalated decision" below** |
| D-M5 | R1 M-6: work-scope vocabulary had no per-id qualification rule, so cross-site sameness was not actually achieved | **ACCEPTED.** rev 2 §7.3 adds a one-line gloss per id and mapping rule `WS9` (space named → space id; trade named → trade id; both → both; unmappable → omit). The annex's claimed reach is narrowed honestly to built space, not "construction/real estate" generally |
| D-M6 | R1 M-7 / R2 m-2: consumer *internals* specified in a producer contract; `style: 150` "declared" by the producer when `VO6` limits are consumer-declared | **ACCEPTED.** `GC1`/`GR2`/`GR3` rewritten as *observable* obligations; the architectural boundary moves to the BoostChat implementation report. `style: 150` marked **to be declared by the consumer** via the `VO6` procedure |
| D-M7 | R1 M-8: `ST4` dropped `tag` entirely, losing 간접조명 / 수납 특화 (5 of 8 records) and turning off V0 tag search | **ACCEPTED.** `tag` is **kept and still emitted**. `style` carries style values, `tag` carries the rest; no value in both. Source gains an authored `styles` field so the split is authored, never inferred (`INV-25` then has a referent) |
| D-M8 | R1 M-9: `D-1` used floating-point on unbounded inputs — `7/0.28 → 24.999999999999996`, platform-dependent ties, `1e21` exponent output breaking the no-exponent serialisation rule | **ACCEPTED.** `RD1` is now integer arithmetic on scaled minor units with an explicit cap; formula and cap in rev 2 §9.3 |
| D-M9 | R2 M-1: today's matcher gives `location` weight 1 **and** uses location-token count as the *first* tie-break, and exposes it as an applied criterion and a tool arg | **ACCEPTED.** Direct violation of owner DECISION D. Consumer work package: weight 0, remove the sort key, remove `applied.location`; `state.location` is kept for serviceability and the lead |
| D-M10 | R2 M-3: "missing is never a penalty" silently becomes "never shown" — `areaDeltaM2 == null` sorts last with a default limit of 3 | **ACCEPTED.** rev 2 §14.3 `PB4` extended with an ordering-neutrality obligation and a per-criterion not-evaluable count in the result |
| D-M11 | R2 M-4: the visitor's budget has no numeric shape; `budgetHint` keeps raw text and loses a range's lower bound ("600~800만원" → "800만원 정도"), so `PB1` is unimplementable today | **ACCEPTED.** rev 2 §14.3 states the visitor budget mirrors the `total` shape, is parsed **by the consumer from visitor text and never supplied by the model**, and fixes the comparison predicate |
| D-M12 | R2 M-5: confirmed style candidates become "선호 스타일" facts about the visitor, and a *negated* preference ("너무 화려한 건 싫어요") produces a positive bonus and a false preference line | **ACCEPTED.** rev 2 §14.4 adds: only a non-negated, visitor-stated style enters the consultation state as a preference. Consumer work package item |
| D-M13 | R2 M-6: no live record has a total, so the motivating query is unexercisable; rev 1 §19 showed `bi-04` with a total as "normative" while §13 said it has no price | **ACCEPTED.** §19's example is relabelled *illustrative, not drawn from live data*. The golden fixture requirement is widened (see "Demo data consequences") |
| D-M14 | R1 M-6 (part) / R2 m-3: consumer `PROPERTY_TYPES` (`house\|shop\|office\|other`) does not match the contract's `detached_house\|mixed_use\|commercial`; the strict state parser wipes state on unknown keys | **ACCEPTED.** Consumer work package: align the vocabulary and extend `TOP_LEVEL_KEYS` **before** writing new keys |
| D-M15 | R2 n-7: `WS2` closure checked against the consumer's known id list would make a minor id addition turn every document TRANSIENT | **ACCEPTED.** rev 2 §12: closure is checked against the **document's own declaration**; an id the consumer does not know is an *unknown value* (`WS8`) — ignore the id, keep the record, never reject the document |

---

## Escalated decision — `schemaVersion`

The task brief (§14) says to use `"0.2"`. Both reviewers independently found that unsafe:
V0 `SV2` (frozen, consumer-confirmed) classifies field removal as **major**, and R2 verified in code
that the consumer declares `SUPPORTED_MAJORS = {0}` (`src/lib/first-party/contract.ts:35`).

- With `"0.2"`: an un-updated consumer **parses** the document, silently loses price and scope, and
  answers "가격 정보가 없습니다" for every case — a customer-visible wrong answer.
- With `"1.0"`: the same consumer sees an unknown major, returns **TRANSIENT**, and keeps its last
  good data — reduced freshness, never a wrong answer.

**Decision: the portfolio resource document carries `schemaVersion: "1.0"`; the manifest stays
`"0.1"` (`SV1` — they version independently, and the manifest gains nothing in this release).**
The *document* remains named Contract V0.2. No amendment to the frozen `SV2` is needed, which also
removes R1 M-5's circularity. `RO2` (removing the consumer's V0.1 read path) is additionally gated
on the rollback window: it may not fire while any package below `1.0` remains a `PC6` rollback target.

This is a deliberate deviation from the task brief and is flagged for the final review.
Rejecting it and shipping `"0.2"` would require accepting the silent-degradation path above.

---

## Rejected / deferred

| id | finding | decision |
|---|---|---|
| R1 O-1 "drop `D-1` from V0.2" | the derived per-area price is not needed for total-budget search | **REJECTED — `D-1` is kept, hardened.** Owner DECISION J assigns the computation to the producer precisely so the consumer cannot invent one, and "평당 얼마예요?" is a first-class question in this market. R2's B-3 hazard (model-computed totals) applies equally to the *authored* `perArea` on 6 of 8 live records, so removing `D-1` would not remove it. Hardened by: strict `PT2`, integer arithmetic, `INV` carve-outs, and the new envelope rule |
| R2 M-2 `workScopeIdsExcluded` field | let a `full_remodel` declare excluded spaces so the exclusion can be disclosed | **DEFERRED.** It is a good field and it is recorded in rev 2 §17 with this rationale. For V0.2 the same protection is obtained for free by `PT4` (a stated exclusion ⇒ breadth not established ⇒ `projectType` omitted), which needs no new field. Task §60 forbids overbuilding |
| R1 O-3 / R2 n-2 work-scope labels | R1: drop them. R2: keep them (lead and card paths read labels) | **SPLIT.** R2's evidence concerns *facet* labels (`category`, `style`), which are unchanged. Work-scope ids are contract-fixed and the consumer must own the alias table anyway (`WS6`), and rev 1's labels were ko-KR-only (R1 m-4). Document-level `workScopes` becomes a **plain sorted id array, no labels**. Facet labels untouched |
| R1 O-6 / R2 n-4 `WS3` sets not counts | "욕실 2개" unsearchable | **ACCEPTED AS A LIMITATION.** Both reviewers agree. R1's suggestion of a structured `property.bathrooms` is recorded as deferred — it is a property fact, not a scope count |
| R1 m-6 | making `facets.category` length ≠ 1 a consumer record-drop | **REJECTED.** That is new consumer behaviour introduced by rev 1. `INV-16` is a **producer** invariant; the consumer's existing behaviour stands |

Minor findings R1 m-1…m-8 and R2 m-1…m-5 are applied directly in rev 2 without individual
discussion, except where listed above.

---

## Record reclassification (consequence of D-B1) — **rev 2, superseded**

> **Read the Round 2 section below before using this table.** It shows rev 2's counts, full 3 ·
> partial 2 · absent 3, with `bi-05` as `full_remodel` and its bathroom caveat "logged, not
> overridden". Round 2's `N-14` reversed that: `bi-05` is breadth-**absent** under `PT4`(b), and the
> current counts are **full 2 · partial 2 · absent 4**. The table is kept as history.

Rev 1 proposed full 5 / partial 2 / absent 1. Under strict `PT2` + `PT4`:

| id | rev 1 | **rev 2** | authored evidence |
|---|---|---|---|
| bi-01 | full | **`full_remodel`** | summary: "…34평 아파트 **전체 리모델링**입니다." |
| bi-02 | full | **absent** | no breadth statement anywhere. Rev 1 argued from "no exclusion stated + scope covers the principal spaces" — inference from absence, which `PT3` forbids |
| bi-03 | full | **absent** | body states an exclusion ("욕실은 … 그대로 두었습니다") **and** `scope` omits 안방·욕실·작은방 of a 42평 flat **and** `category` says full-remodel. Contradictory ⇒ not established (`PT4`) |
| bi-04 | partial | **`partial_remodel`** | summary: "주방과 욕실 **두 곳만 골라** … **부분 리뉴얼**입니다." |
| bi-05 | full | **`full_remodel`** | summary: "…**전체 리모델링**입니다." Caveat recorded: the body notes the bathroom got silicone and taps only. The operator's explicit word governs; the caveat is logged, not overridden |
| bi-06 | partial | **`partial_remodel`** | summary "…**부분 리모델링**입니다.", body "방과 주방은 … 그대로 두고", quote "일부만 공사했는데도" |
| bi-07 | full | **`full_remodel`** | summary: "…**전체 리모델링**입니다." |
| bi-08 | absent | **absent** | body: "새 아파트라 **철거 없이** 진행했습니다." The operator's own framing (홈스타일링) refuses the binary |

**full 3 · partial 2 · absent 3.** Three of eight carrying no breadth is an honest reading of data
that was authored before this axis existed, and it is exactly why the demo set is being expanded.

## Demo data consequences

The new demo records must now carry the whole load for the breadth-and-total axis. Required in the
golden fixture (R2 M-6, R1 O-7), each at least once:

`full_remodel` + exact total · `full_remodel` + **range** total · `partial_remodel` + total ·
`partial_remodel` with no price · breadth-absent + total · a record whose `total / area` divides
**exactly** (the case that broke rev 1's `INV-22`) · `exclusive` area basis · `m2` unit ·
area missing · price missing · style missing · similar area + different price ·
similar price + different area.

## `RD1` verification (orchestrator, before implementation baked it in)

Review R1 M-9 showed rev 1's floating-point `D-1` was wrong and non-reproducible. Rev 2's `RD1`
uses integer arithmetic: `T = round(total.amount*100)`, `A = round(area.value*100)`,
`amount = floor((2T + A) / (2A))`. Checked independently against decimal `ROUND_HALF_UP`:

| total | area | `RD1` | `ROUND_HALF_UP` | |
|---|---|---|---|---|
| 52,000,000 | 34 | 1,529,412 | 1,529,412 | ✓ |
| 85,000,000 | 34 | 2,500,000 | 2,500,000 | ✓ exact division — the case that broke rev 1's `INV-22` |
| 30,000,000 | 20 | 1,500,000 | 1,500,000 | ✓ exact division |
| 50,000,000 | 34 | 1,470,588 | 1,470,588 | ✓ the "34평 전체 5천" record |
| 7 | 0.28 | 25 | 25 | ✓ the float trap — naive division gives 24.999999999999996 |
| 3 | 2 | 2 | 2 | ✓ tie, half up |
| 5 | 2 | 3 | 3 | ✓ tie, half up |
| 1 | 0.01 | 100 | 100 | ✓ smallest permitted area |
| 1,000,000,000 | 0.01 | **guard rejects** | 100,000,000,000 | ✓ output cap fires; no absurd value, no exponent notation |

The formula is valid only for positive values, which the contract guarantees (every amount is
strictly positive, §9). Largest emittable value is 1,000,000,000, which `JSON.stringify` serialises
without exponent notation, satisfying V0 `determinism.numbers`.

## Model allocation — actual

| lane | task brief | actual | why |
|---|---|---|---|
| orchestrator | Fable xhigh | **Opus 5 (1M) xhigh** | model availability |
| READ-only recon (6 agents) | Sonnet | **Sonnet** | as specified |
| pre-implementation review (2 agents) | Fable MAX fresh context | **Fable, fresh context** | "MAX" is not a selectable effort tier from the orchestration tool |
| delta review | Fable MAX fresh context | **Opus, fresh context** | the Fable account limit was reached mid-run and the first delta-review agent was terminated by a 429. Re-run on Opus, which the repo's own rule (`CLAUDE.md` §2) assigns to independent review anyway |
| producer / consumer implementation | Fable high/xhigh | **Fable** | launched before the limit was reached |

---

# Round 2 — disposition of the rev-2 delta review (`06-delta-review.md`)

Verdict received: **NOT READY** — BLOCKER 3 (`N-1`…`N-3`), MAJOR 11 (`N-4`…`N-14`). The reviewer ran
on Opus in a fresh context and was told to review independently, not to confirm a conclusion.

**All 14 are accepted. None is rejected, none is deferred.** Three of them (`N-1`, `N-2`, `N-3`) are
the same class of defect: a rule that was *unsatisfiable or self-defeating as written*, which no
amount of careful implementation would have survived. Finding them before code is exactly what the
round-2 gate is for.

## Accepted BLOCKERs

### D-N1 · `PT4`(a) deleted every `partial_remodel`

Rev 2 wrote a single rule `PT4`: *"if the source names any space that was left out, or any space
that received only maintenance-level work, `projectType` is omitted."* It was written to close
`D-B1` (the `bi-03` case) and it does close it — but it was never scoped to `full_remodel`.

A `partial_remodel` **is** a project that leaves spaces out. Applied literally, `PT4` omits
`projectType` from every partial as well: `bi-06`'s *"방과 주방은 … 그대로 두고"* is the identical
construction that rev 2 cites to disqualify `bi-03`. Rev 2 therefore produced **zero** partials
while §13 simultaneously claimed two — the document contradicted itself, and the demo spec's whole
partial-search lane rested on the contradiction.

**Fix (contract §5.2, §13).** One rule became three:
- `PT4` — when `full_remodel` may be authored: whole dwelling (a), **no space** omitted or given
  only maintenance-level work (b), and at least one **Spaces** id present (c).
- `PT5` — when `partial_remodel` may be authored: the source states a **bounded set of spaces**.
  `PT4`(b) explicitly does not apply, since bounding the set is the definition.
- `PT6` — otherwise `projectType` is **absent**.

`D-B1` stays closed: (b) still lives in the `full_remodel` branch, where it belongs.

### D-N2 · `ST4` would have failed the build on 18 of 19 records

Rev 2's `ST4` required that no value appear in both `styles` and `keywords`. But the demo data — the
8 existing records and all of `04-demo-data-spec.md` — authors `styles` **as a subset of**
`keywords`; that is how a style word gets into the card copy at all. Rev 2 would have hard-failed
`INV-24` for all but one record the first time the emitter ran.

The reviewer's framing is the correct one: the *classification* is an authoring act, but the
*subtraction* is mechanical and belongs to the emitter.

**Fix.** `ST4` now reads: `facets.style` is the authored style list; `facets.tag` is the authored
descriptive-word list **minus** every value in the style list, in surviving authored order, key
omitted when nothing survives. `INV-24` (style ∩ tag = ∅) is unchanged in force but is a check on
the **emitted** document, which the subtraction makes true by construction. The producer agent was
sent this correction mid-run.

### D-N3 · `GR4` was defeated by `title`

Rev 2 enforced `D-1c` (never hand a visitor a partial's implied per-area price) by withholding
`property.area` from the model-facing envelope, so the model could not multiply. The reviewer
checked the live data: **all 8** titles carry the area — *"수성 화이트 **34평** 아파트 리모델링"* —
and `GR1` makes `title` statable. The multiplicand was one field away, and `GR5`'s "for any record"
wording missed the cross-record case (area from record X, per-area from record Y).

**Fix.** `GR4` is **inverted**: `property.area` is always available, and a record does not carry
`pricing.perArea` unless the visitor asked about a per-area price. Withholding the price is
enforceable; withholding the area was not, and cost the consultation a fact it legitimately needs.
`GR5` now covers any `perArea` and any area *appearing in or derivable from* the result, a title
included, with no same-record restriction. Whether this actually closes `D-1c` or only moves it is
now §18 `Q-7`, explicitly handed to the next reviewer.

## Accepted MAJORs

| id | disposition |
|---|---|
| `N-4` | §14.3.2 set relations now computed over **Spaces only** (`R_s`, `Q_s`). Rev 2 mixed Spaces and Works, so a 창호 교체 record became a `scope_superset` of a kitchen request. |
| `N-5` | `scope_disjoint` class added; a `Q_s = ∅` "not applicable" row added. |
| `N-6` | `PB1a` — the "visitor stated no budget" branch, absent in rev 2. |
| `N-7` | §14.5 defines "satisfied", closes the class list (incl. `not_evaluable`) and fixes a precedence order, so two guard rules can no longer both fire. |
| `N-8` | `INV-22` restated as a **metamorphic** provenance test. (Round 1's `D-B6` fixed the false build failure; round 2 made the replacement executable.) |
| `N-9` | `RO2` rollback gate: **both** the `current` and the `previous` pointer slot at `schemaVersion >= 1.0` — two successful V0.2 publishes per site. Rev 2's wording was satisfied by one. |
| `N-10` | `WS9` relabelled **authoring rule — not machine-checked, not a `VA1` condition**. It is judgement, and rev 2 dressed it as a validator rule. |
| `N-11` | `PB4` given an explicit ordering-neutrality statement in its **strong** form: a criterion that could not be evaluated contributes nothing to the score **and to no tie-break key** — not a penalty, not a small penalty, not a null that sorts last. *(This row originally described the **weak** "keep their pre-price order" form, which `N-11` had explicitly rejected as no protection at a result limit of 3 over 18 records. The normative `PB4` and `CINV-5` always carried the strong form; the round-3 review caught the change log, not the rule.)* |
| `N-12` | `PB6` rebuilt as a 3×2 table — visitor `exact`/`range`/`max` × record `exact`/`range` — with a **signed** delta and overlap defined as `a ≤ hi ∧ lo ≤ b`. |
| `N-13` | `INV-29` added for `PT4`(c). |
| `N-14` | `bi-05` reclassified **`full_remodel` → absent** under `PT4`(b). Rev 2 had let a verb ("전체적으로") carry the classification past the Spaces test. §13 counts are now full 2 · partial 2 · absent 4. |

## Found by the orchestrator while applying rev 3

Not in any review; recorded because they change normative text.

| what | fix |
|---|---|
| `RD1`'s guards bounded `T` but not `A`. V0's area schema caps fraction digits, not magnitude, so a nonsense area could still reach the division. | `A <= 100_000_000` added. Producer agent notified mid-run. |
| `PA4` ("the price basis is never inferred from `area.basis`") contradicted a **derived** `perArea`, whose divisor *is* `property.area` — by construction, not by inference. | `PA4` scoped to an authored `perArea`; new `PA5` states the derived case. This is also what makes `PB3`'s `AR5` condition evaluable at all. Opened as §18 `Q-8`. |
| §9.1 cited the exact-XOR-range requirement as a V0 rule. It is not — it is the owner's task brief §10. | Re-attributed, and `OD-I` in `01-owner-decisions.md` extended so the citation resolves. (Same class as round 1's R1 M-3.) |
| §12 dropped a record for a non-string `projectType` but was silent on a non-string `property.type`. | Same record-level drop. Matches the consumer parser's actual behaviour. |

## Carried, still unanswered

Round 2 answered rev 2's `Q-1`, `Q-3` and `Q-5`. `Q-2` (`schemaVersion "1.0"`) and `Q-4` (`PB3`
keeping both `category` and `projectType`) were **not** reached and are carried into rev 3's §18
alongside the new `Q-6`, `Q-7`, `Q-8`.

## Next

1. Rewrite the contract to **rev 2** with every round-1 disposition. *(done)*
2. **Delta review only** of rev 2 — not a full re-review (task §15). *(done: `06-delta-review.md`)*
3. Apply round 2 to **rev 3**. *(done)*
4. Propagate to `04-demo-data-spec.md`: promote `bi-19` to a required fixture (it is the only
   `breadth-absent + total` shape, and without it `INV-19` and `PB5` have no fixture), reclassify
   `bi-05` to breadth-absent, strip the rev-1 `PT2` citations. *(next)*
5. **Delta review of rev 3**, delta only.
6. Then implementation continues in both repos.


---

# Round 3 — disposition of the rev-3 delta review (`08-delta-review-rev3.md`)

Verdict received: **NOT READY** — BLOCKER 4 (`M-1`…`M-4`), MAJOR 7 (`M-5`…`M-11`), MINOR/NOTE 12,
plus eight contradictions in `04` and three in this file. Fresh context, Opus, given no preferred
conclusion. Of round 2's `N-1`…`N-14`: **9 closed, 5 partially closed, 0 not closed.**

**All 11 findings and all 12 MINOR/NOTEs are accepted. None rejected, none deferred.** Contract
revised to **rev 4**; `04` to rev 3; this file corrected. Full change log: contract §20.2.

## Why this round mattered more than its counts suggest

Three of the four BLOCKERs are the same failure as round 2's: **a rule that cannot be satisfied as
written**, invisible to anyone reading the rule in isolation and obvious the moment it is run
against the fixtures.

- `M-2` — §14.3.2's last row plus `GR2`'s precedence made `exact` **unreachable for every
  `full_remodel`**. The contract's own §1 motivating query — *"34평 아파트 전체 리모델링, 예산 5천"*
  against `bi-09`, which matches on breadth, area and budget — came back as "a whole-home case shown
  as a reference". Two documents disagreed and `04` §4.1 was the one that was right.
- `M-3` — the same table was **not a function**: for `Q_s = ∅`, three rows matched with opposite
  budget verdicts, and `GR2`'s precedence orders classes, which cannot resolve a permission. Two
  conforming consumers, opposite answers, one document — the exact failure `PB6` exists to prevent.
- `M-6` — the table dropped the trades the **visitor** named, so a kitchen-only job was an `exact`
  match at budget for *"주방이랑 바닥"*.

`M-1` is the one I most want on the record, because rev 3 **believed** it had fixed it. `GR4` was
inverted in rev 3 to withhold `D-1`'s output, and §18's `Q-7` asked the reviewer directly whether
`D-1c` was closed or merely moved. Merely moved: `GR5` forbade `perArea × area` and `budget / area`
and said nothing about `total ÷ area`, so `bi-19`'s 11,000,000 ÷ 32평 = **343,750/평** — the figure
OD-K calls the single most important prohibition in V0.2 — was one division from two fields `GR1`
explicitly authorises. Asking the question in §18 is what surfaced it.

`M-4` is the round's sharpest lesson about my own edits. Between rev 3 and this review I rewrote
`bi-19`'s body so it would test `PT4`(c) in isolation. The rewrite was directionally right and
**removed the record's only authoring-independent disqualifier**, leaving OD-K's showcase fixture
resting on the undefined term *"touched a space"* — under one reading of which the producer emits
343,750/평 with a `source: "derived"` badge that `INV-19` and `VA1` both miss. A late edit made to
sharpen a fixture weakened it, and only the review caught it.

## Dispositions

| id | sev | disposition |
|---|---|---|
| `M-1` | BLOCKER | Accepted as written. `GR5`/`CINV-2` extended to the **quotient** of any price amount and any area. This is `D-1c`'s enforcement point. |
| `M-2` | BLOCKER | Accepted. §14.3.2 classifies only `partial_remodel` records; `GR2` gains "a precedence list orders classes that apply; it does not create them". |
| `M-3` | BLOCKER | Accepted. Row 1 keys on `Q = ∅`; new `PB7` makes the rows ordered with first-match-decides. |
| `M-4` | BLOCKER | Accepted. `WS9` now decides Spaces vs Works; `storage`/`built_in_furniture` disambiguated; `04`'s `bi-19` note carries the rule. |
| `M-5` | MAJOR | Accepted. §13's stale caveat paragraph rewritten to `PT4`(b). |
| `M-6` | MAJOR | Accepted. `Q_t ⊆ R_t` conjunct + new §14.3.2.1 for trade-only requests. |
| `M-7` | MAJOR | Accepted. `PB1a` → "`strong` or `acceptable`". |
| `M-8` | MAJOR | Accepted. `PT4`(a)/(b), `PT5`, `PT6`, `ST2` labelled authoring rules. |
| `M-9` | MAJOR | Accepted. New `PB3a`. **Cost accepted knowingly:** an authored `perArea` can no longer be compared with anything, which is most of the existing 8. The coverage removed was never sound — `bi-01` vs `bi-09` was wrong by about a third if `bi-01` was priced on exclusive area. |
| `M-10` | MAJOR | Accepted, and resolved in the direction the reviewer called the honest one: new `PB0` **declares** the amendment instead of scoping `PR4` silently, and §16 now carries a consumer-confirmation list. The amendment is **not in force until the consumer confirms it**. |
| `M-11` | MAJOR | Accepted. `WS7a`'s closure scoped to Spaces; works open even for a partial. |
| MINOR-1…11, NOTE-1…3 | — | All applied. Three of them (`MINOR-9`/`-10`/`-11`) were change-log rows describing rules the reviews had **rejected** — an implementer reading §20.1 would have built the rejected rule. `MINOR-9` is the same sentence as `D-9` here. |
| `D-1`…`D-8` (`04`) | — | `D-1`, `D-2`, `D-4` resolved by the contract fixes; `D-3`, `D-5`, `D-7` corrected in `04`; `D-6` and `D-8` given the missing line. |
| `D-9`, `D-10` (`05`) | — | Both corrected above. |

## Accepted limitations, recorded rather than fixed

- **`ST6`/`ST7` leave an inconsistent style bonus.** A word classified as a style on one record and
  a tag on another gives the bonus only to the first. Bounded by `ST3` (weak bonus, no penalty for a
  miss) and by the `tag` key remaining matchable, so the worst case is a ranking wobble. Recorded in
  `ST7`; `ST6` gains a build **warning**.
- **`WS7c` deletes one legitimate shape** — breadth known, `workScopeIds` unauthorable. Reachable on
  a migrating site whose scope vocabulary the §7.3 gloss does not cover; the demo loses nothing but
  the demo is not the general case. Mitigation is `WS4` (an operator pass over the site's own scope
  field), now stated in `WS7c` and in `04` §0.2.
- **`INV-21` ships with no demo fixture**, deliberately and unlike `INV-19`. It is not decidable from
  the emitted document at all; it is enforced structurally and asserted on a crafted snapshot
  (`07-producer-implementation.md` §5.3, test `A6`). Reasoning now in `04` §6.

## Next

1. Apply round 3 to **rev 4**. *(done)*
2. Propagate to `04` (rev 3) and this file. *(done)*
3. **Delta review of rev 4**, delta only — it has five new unreviewed rules (`PB0`, `PB3a`, `PB6a`,
   `PB7`, §14.3.2.1) and rev 4's §18 `Q-9`…`Q-13` ask about exactly those.
4. The producer implementation predates rev 4. Re-check it against the new text before the golden
   package is rebuilt — `WS7a`'s scoping and the `ST6` build warning are producer-side.

---

# Round 4 — disposition of the rev-4 delta review (`10-delta-review-rev4.md`)

Verdict received: **NOT READY** — BLOCKER 2 (`P-1`, `P-2`), MAJOR 4 (`P-3`…`P-6`), MINOR 8, NOTE 4.
Of round 3's `M-1`…`M-11`: **9 closed, 2 partially closed, 0 not closed.** All 14 of round 3's
MINOR/NOTEs verified applied. Fresh context, Opus, no preferred conclusion given.

**All accepted.** Contract revised to **rev 5**; `04` to rev 4.

## The finding that changed the approach

The reviewer did not only list defects. It named what they had in common:

> *"I also recommend restructuring §14.3–§14.5 rather than patching a fourth time: every defect found
> in three consecutive rounds sits **between** `PB1`/`PB1a`, §14.3.2+`PB7`, and `GR2`/`GR3`, which
> jointly compute one function nobody owns end to end."*

That is correct and it is the reason this section kept failing. Look at the three rounds:

| round | BLOCKER | where it actually lived |
|---|---|---|
| 2 | `N-3` `GR4` defeated by `title` | between the envelope rule and the grounding rule |
| 3 | `M-2` `exact` unreachable for every `full_remodel` | between a table that assigned a class and a precedence list that pre-empted it |
| 3 | `M-3` the table was not a function | between the rows and the precedence list, neither of which claimed to order the rows |
| 4 | `P-2` breadth had no "not stated" branch | between `PB1` (breadth), `PB1a` (area) and the scope table — three criteria, two of which had the branch |

Every one is a **seam**, not a rule. A fourth round of patching would have produced a fourth set of
seams. So rev 5 replaces §14.3–§14.5 with **one function stated end to end**: inputs, four criteria
each in exactly one of three states (`not_applicable` / `not_evaluable` / `satisfied`·`unsatisfied`),
the scope relations, the tiers, the price permission, the class **derived from** the criteria, the
ladder, and the output invariants. Every rule id survives. Rev 4's standalone `GR2` precedence list
is gone — it ordered classes that no rule assigned — replaced by `EF6`, which is computed from the
criteria and therefore cannot disagree with them. `PB1a` is folded into `EF4` for the same reason:
as two separate rules they contradicted each other about the `strong` tier, which is exactly what
round 3's `M-7` was.

## Dispositions

| id | sev | disposition |
|---|---|---|
| `P-1` | BLOCKER | Accepted. The quotient clause I added in rev 4 **forbade the truth**: `bi-10` 85,000,000 ÷ 34 = 2,500,000, `bi-11` 30,000,000 ÷ 20 = 1,500,000 and `bi-12` 52,000,000 ÷ 26 = 2,000,000 all divide exactly, so the producer's own derived price equals a forbidden quotient and each total equals a forbidden product — a **correct** consumer would fail `CINV-2`. New `GR5a` exempts a number that is itself a `pricing` field value in the result. Provenance, not arithmetic. `bi-19`'s 343,750 is no field's value and stays forbidden. |
| `P-2` | BLOCKER | Accepted. `EF1`'s three states make `not_applicable` structural for all four criteria, so the asymmetry cannot recur. New `PB0a` gives `PB0`'s open-request case a real compensating control instead of citing a disclosure no rule required. |
| `P-3` | MAJOR | Accepted, and resolved from a fact the contract already asserts rather than by loosening a guard: `EF3` makes scope **satisfied** for a `full_remodel` against any `Q`, because `PT4`(b) *is* the statement that no space was left out. Budget permission is untouched. |
| `P-4` | MAJOR | Accepted. `GR3` gains a trade rung so `bi-19` is reachable for *"바닥이랑 도배만"*. The residual limitation — no trade-only request can be budget-**matched** against any of the 19 — is stated in §14.3.3.1 and deferred properly in §17 as a producer-declared closed trade set. |
| `P-5` | MAJOR | Accepted. `WS7a` restated in `WS9`'s own sense: the closed set is the spaces **that were remodelled**, so an absent id never means "no work reached that room". `M-11`'s falsehood had simply moved axes. |
| `P-6` | MAJOR | Accepted. The rev-4 gloss is propagated: §19's worked example and `04`'s `bi-10` and `bi-18` move `storage` → `built_in_furniture`. `storage` is now used by no demo record, which is correct — none of them has a dedicated storage room. |
| 8 MINOR · 4 NOTE | — | All applied. |

## Producer work list from `E.2` — queued, not done

Rev 4/5 are almost entirely consumer-side: **no wire shape, vocabulary, invariant or `RD1` constant
moved**, so `PRODUCER_VERSION` and the golden constants do not change. Outstanding:

> **Status corrected 2026-09-24 (orchestrator).** Items 1–3 below were listed as outstanding
> through rounds 4, 5 and 6, and round 5's `E.2` restated that *"none of it is done"*. **All three
> are in fact done, in the working tree**, verified directly:
> - **item 1 — done.** `platform/integration/emit.ts:366-380` carries the `ST6` block and pushes
>   `facets: "…" appear in both facets.style.values and facets.tag.values (ST6, 07 §8)` into the
>   existing `warnings` array, after the facet maps are built, read-only over them.
> - **item 2 — done.** `platform/content/schema.ts:283-287` reads *"only the SPACES within it are
>   CLOSED … An absent space id means that space was not remodelled; it does NOT mean no work
>   reached it"*, and `platform/integration/validate.ts:299-301` says the same.
> - **item 3 — done.** `grep -rn 'PT4(b)\|PT4b' platform/` returns **nothing**; `schema.ts:153`,
>   `contract.ts:62` and `validate.ts:305` all cite `PT4(c)`.
>
> All three are uncommitted working-tree work (`git diff --stat`: schema +167, contract +82,
> validate +124; `git show HEAD:platform/integration/validate.ts | grep PT4` is empty), which is
> why successive reviews reading the list rather than the code kept carrying them forward. The
> entries are kept below for provenance.

1. ~~**`ST6`'s `P: SHOULD warn at build` is not implemented.**~~ **Done** — `emit.ts:366-380`.
2. ~~`WS7a`'s rescoping to Spaces is not reflected in `platform/content/schema.ts` and
   `platform/integration/validate.ts`.~~ **Done** — `schema.ts:283-287`, `validate.ts:299-301`.
3. ~~`INV-29` cites `PT4`(b) where it should cite `PT4`(c).~~ **Done** — no `PT4(b)` remains in
   `platform/`.
4. Data re-authoring before any golden rebuild: `bi-10`, `bi-18` and §19's `bi-01`
   (`storage` → `built_in_furniture`). Done in `04` rev 4; the JSON follows in the data package.
5. Not from rev 4: the `VO6` `style` limit stays PROVISIONAL (`contract.ts:119`) pending consumer
   confirmation, and the Template Release cut must precede authoring any V0.2 field in
   `data/sites/**`.
6. **`INV-30`** (contract rev 6, kept and scoped in rev 7) — `projectType == "partial_remodel"` ⇒
   at least one `Spaces` id, mirroring `INV-29`. **DONE (2026-09-24), with the negative case
   exercised rather than inferred.**
   - `platform/content/schema.ts` — added to the `superRefine` beside `INV-28`/`INV-29`.
   - `platform/integration/validate.ts` — added to the record loop beside `INV-29`.
   - `platform/test/integration.test.ts` — permanent coverage in **A10** (authoring model) and
     **V14** (emitted document). Three assertions each way: the trades-only partial is **refused**,
     one `Spaces` id is **enough**, and `INV-30` is **silent when `projectType` is absent** — that
     last one matters, because breadth-absent is exactly the authoring `PT5` prescribes for such a
     job, and a rule that also rejected *that* would leave bi-19's shape unauthorable.
   - Verified: `typecheck:platform` exit 0; `test:integration` **60 passed, 0 failed, 10 skipped**.
     A green suite alone would have proved nothing here — no existing fixture constructs a
     trades-only partial — so the shape was constructed explicitly and `err()` asserts the
     `(PT5, INV-30)` message, not merely that something failed.
   - It remains the only backward-incompatible rule in V0.2: it can reject a document rev 5
     accepted. It fires on **no** record in the current corpus, including the eight just authored
     in `18-existing-eight-workscopes.md` — `bi-05` and `bi-19` are trades-only and are
     breadth-**absent**, carrying no `projectType`, so `INV-30` is silent on both by design.
7. **`WS8`'s not-closed clause** and **`CINV-20`…`CINV-24`** are consumer-side (BoostChat), not
   producer. Listed here only so the two halves are visible in one place.

*Items 4 and 7 plus the `1.6.0` Template Release cut are the whole remaining delta (item 6 closed 2026-09-24). `12` §5 and
this list are now the same list; they disagreed through rev 6 (round-6 note `n-6`).*

## Round 4 — cross-document findings `D-1` … `D-7` (dispositioned late)

These seven were **omitted** from the round-4 disposition above, which recorded only `P-1`…`P-6`
and a summary row. Round 5 found the omission (`Q-M10`, `D-2`) and confirmed that two of the seven
survived into rev 5 as a result. Recorded here in full; the practice of listing every `D-n`
explicitly, which round 3 followed and round 4 dropped, resumes.

| id | sev | disposition |
|---|---|---|
| `D-1` | MAJOR | **Accepted; survived rev 5; fixed in `04` rev 5.** `04`'s E5 row and `bi-10`'s note asserted two `PB3a`-forbidden per-area comparisons — `bi-07` vs `bi-11` and a three-way including `bi-01` — whose `perArea` values are `authored`, so their price basis is unknown. The comparable pool is exactly `{bi-09, bi-10, bi-11, bi-12}`. `bi-01` is now stated as PB3a's **fixture** rather than a term of the comparison. |
| `D-2` | MAJOR | **Accepted.** This section is the fix. |
| `D-3` | MINOR | **Accepted; fixed in `04` rev 5.** Four *"contract rev 3"* citations updated to rev 6, with one line noting the cited rules are unchanged since rev 3. |
| `D-4` | MINOR | **Accepted; fixed in `04` rev 5.** `§14.3.2 row 3` → `§14.3.3 row 3` (`scope_exact`); `§14.3.2 row 5` → `§14.3.3 row 5`. |
| `D-5` | MINOR | **Accepted; fixed in `04` rev 5.** Header now reads SPEC rev 5 / revision rev 5. |
| `D-6` | MINOR | **Accepted; fixed in `04` rev 5.** `07` §19 was right and `04` was stale: rev 6's `WS9` makes `built_in_furniture` the only supported authoring for `bi-01`'s 복도 붙박이장, so `hallway` enters the vocabulary from **no** record. Recorded as declared-but-unused alongside `storage` (`Q-N5`), with the reason for not inventing a record to cover them. |
| `D-7` | NOTE | **Accepted; fixed in `04` rev 5.** The *"현관 수납"* expected answer now names the `WS6` alias mapping it assumes and states the other mapping's outcome. |

## Round 5 — `11-delta-review-rev5.md` (NOT READY: 4 BLOCKER · 8 MAJOR · 10 MINOR · 6 NOTE)

Full disposition, including the decision **not** to invoke `00-work-plan.md` §2.4's pre-committed
narrowing clause, is `12-rev6-disposition.md`. Summary: all 4 BLOCKERs and all 8 MAJORs accepted and
fixed in contract rev 6; the 10 MINOR and 6 NOTE accepted, 19 fixed in `07`/`04`, and round 4's
seven unapplied `P-7`…`P-18` items applied in the same pass. `EF6`'s totality is now proved by
execution (`proof/ef6-totality.mjs`) rather than asserted.

## Next

1. Restructure to **rev 5**. *(done)*
2. Propagate to `04` (rev 4) and this file. *(done)*
3. **Delta review of rev 5** — and it is a review of a *structure*, not of patches, so §18's
   `Q-14`…`Q-18` ask whether the three-state device actually holds for every rule and every input.
   *(done — `11-delta-review-rev5.md`)*
4. **Rev 6**, finishing the rev-5 restructure. *(done — `12-rev6-disposition.md`)*
5. **Delta review of rev 6**, delta-only.
6. Producer work list above, batched into one pass, plus the two items round 5 added: `WS8`'s
   not-closed clause (consumer-side) and `CINV-20`/`CINV-21`/`CINV-22` (consumer tests).
