# 03 — Independent review of the V0.2 contract candidate, from the consumer's side

| | |
|---|---|
| reviewed | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` (CANDIDATE, 2026-09-24) |
| baseline | `docs/reports/integration/03-integration-contract-v0-candidate.json` (FROZEN V0, 0.1) |
| consumer | `boost-chat` at `src/lib/first-party/*`, `src/lib/tools/gate.ts`, `src/lib/chat/tool-loop.ts`, `src/lib/prompt/{policy,builder}.ts`, `src/lib/lead/repository.ts`, `db/migrations/{0041,0048,0050}` |
| method | trace 10 real visitor utterances through (contract fields) → (today's consumer code) → (what the assistant can say); try to construct a false claim from contract-permitted values only |
| reviewer stance | fresh context; did not write the contract; no preferred answer to §18 |
| verdict | **BLOCKER=3 MAJOR=6 MINOR=5 NOTE=7** — not freezable as written. The three blockers are all in §14.3/§14.5 (what may be *claimed*), not in the data shape (§5–§11), which is sound. |

Evidence for "today's consumer" claims was taken from the code, and the extractor behaviour on the 10 utterances was replayed mechanically (regexes copied verbatim from `interior-extract.ts`, `area.ts`, `facet-index.ts` against the demo site's labels). Replay results are quoted where they matter.

---

## 1. BLOCKER

### B-1 · PB1/PB3 permit misleading budget claims from contract-permitted values (§14.3)

PB1 (`C: MAY`) supersedes V0 `BU3` and lets the assistant compare a visitor's total budget with `pricing.total`. Its comparability conditions are incomplete in four ways; each one yields a customer-facing claim that is *permitted by the contract* and *misleading*.

**(a) "scope overlap" is the wrong set relation.** PB1: *"a scope-bounded budget against a `partial_remodel` total whose `workScopeIds` **overlap** the requested scopes"*.
Utterance 3 ("욕실만 … 600~800만원") against §19's `bi-04` (`workScopeIds: ["kitchen","bathroom"]`, `total 19,000,000`): `{bathroom}` overlaps `{kitchen,bathroom}` → comparison permitted → *"욕실 예산 600~800만원으로는 B 사례(1,900만원)보다 많이 낮습니다"*. The 1,900만원 bought two spaces. Same for utterance 2 ("주방만 1500").
Minimum fix: replace *overlap* with a set relation on the **known** scopes (WS7: absence is unknown, not confirmed-without):
- `record.workScopeIds ⊆ requested` → comparable (the case did no more than asked; its total is a reference/lower bound);
- `record.workScopeIds ⊋ requested` → **not comparable**; may be shown only with the class `scope_overlap` and the mandatory disclosure that the total covers additional spaces (name them from `workScopes.values[].label`);
- partial intersection → not comparable.

**(b) full-home comparison has no area condition.** PB1: *"a whole-home budget against a `full_remodel` total"* — nothing requires the record's `property.area` to be comparable with the visitor's (AR5) or close to it. A 34평/5천 visitor against a 19평 `full_remodel` with `total 4,900만` is a permitted *"예산에 맞는 전체 리모델링 사례가 있어요"* for a flat 56 % the size. Minimum fix: a `full_remodel` total is comparable only when `property.area` is present, AR5 permits the comparison (same basis, or one basis unknown → lowered confidence), and the area is within a declared tolerance; otherwise class `area_fallback` with the area difference stated.

**(c) the predicate itself is unspecified.** The contract defines `exact XOR range` on the record side only (§9.1). Nothing says when a visitor budget "matches": exact-vs-exact needs a tolerance; visitor-range vs record-exact needs `t ∈ [bmin,bmax]`; record-range vs visitor-exact needs `b ∈ [min,max]`; range-vs-range needs interval intersection. Two consumers (or one consumer after a refactor) can produce opposite verdicts from the same document, and the contract cannot say which one is wrong. Since the claim is now *permitted*, the predicate must be pinned here or be a consumer-declared value (VO6-style, with the disclosure wording "±x %") — not left silent.

**(d) PB3 lets `projectType`-absent records be price-compared.** PB3's gate is "`projectType`, not `category`", but does not say *present and equal on both records*. Live data: `bi-08` (move-in-styling, §13 → `projectType` **absent**) carries an authored `perArea 1,600,000/평`; `bi-01` (`full_remodel`) carries `2,900,000/평`. PB3 as written permits *"H 사례는 평당 160만원으로 A 사례보다 훨씬 저렴합니다"* — a no-demolition styling job compared with a full remodel. Minimum fix: PB3 requires `projectType` present and equal on both sides; absent ≠ absent.

### B-2 · GR2 is under-specified to the point of being unenforceable (§14.5)

GR2 names six classes and then says the vocabulary and envelope "belong to the consumer". Three things are undefined: (i) whether the class is per record or per result; (ii) what `exact` means; (iii) whether a criterion the visitor stated but the record cannot be evaluated on is visible to the assistant.

Constructed failure, utterance 8 ("예산은 3천인데 34평 전체 리모델링 가능할까요?") on the live data: `bi-01` is `full_remodel`, `34평 supply` (Δ=0), authored `perArea` only, no `total`. Breadth matches, area matches, budget is *not evaluable* (PB2 forbids total-vs-perArea; PB4 says neither match nor fail). A consumer that defines `exact` as "every *evaluated* criterion matched" legitimately tags `bi-01` `exact`, and the assistant answers *"네, A 사례가 딱 맞는 사례예요"* to a question whose only content was the budget. Every value used is contract-permitted.

Minimum the contract must pin so a fallback (or an unevaluated criterion) can never be presented as exact:
1. the class is **per record**;
2. `exact` ⇔ every criterion the visitor stated (breadth, scopes, area, budget, and only those) is **evaluated and satisfied** on that record;
3. a stated-but-not-evaluable criterion forbids `exact` and is **named per record** (e.g. `notEvaluable: ["budget"]`), so the assistant can and must say "사례 데이터로는 예산 적합 여부를 판단할 수 없습니다";
4. the class list is closed and each class carries mandatory disclosure semantics (what the assistant must say); `price_fallback`/`area_fallback` in particular must be defined as "shown although this criterion was not satisfied", not "not evaluable";
5. a class is data the consumer's §15 tests assert on, not prose.

Today's consumer already has the right raw material (`MatchResult.applied/dropped`, `areaComparable`, `RankedRecord.areaDeltaM2`, `search-types.ts:135-159`), but no per-record class and no per-record "not evaluable" list.

### B-3 · D-1c has no enforcement point in an LLM consumer, and GR1 invites the violation

D-1a/D-1c is "the single most important prohibition in V0.2" (§9.3). The consumer is a language model plus code. The code can obey D-1c; the model cannot be *made* to obey it by a `C: MUST NOT`. Today this is safe only by accident: the model-facing result (`executor.ts:108-116 ResultRecordForModel`) carries **no price at all**. GR1 now lists `pricing` among the values that "may be stated as fact". The moment the adapter puts `perArea: 2,900,000 KRW/평` and `area: 공급 34평` on the same record in the tool result, utterance 8 produces *"A 사례는 평당 290만원이라 34평이면 약 9,860만원 정도라서 3천만원으로는 어렵습니다"* — a computed total (TP3/PR5/D-1c), presented as a quote (TP2 forbids), and for a record like `bi-03` (bathroom excluded, M-2) numerically wrong as a whole-home figure.

Minimum fix, in the contract (because the producer is entitled to know the consumer's guard exists):
- the assistant-facing envelope never co-presents `perArea` and `property.area` for the same record **unless** the visitor asked for a per-area comparison (PB3 path); default presentation is `total` when present, else "가격 정보 없음";
- §15 consumer-side invariants gain an **output** check: no number in the assistant's reply equals `perArea.amount × area.value` (± RD1 rounding) for any record in the result; and no number equals `visitorBudget / area` (BU1).
Both are cheap (the executor already owns the envelope; the reply passes through `run-chat.ts`).

---

## 2. MAJOR

### M-1 · LO1 (location weight 0): today's matcher does not comply

Actual ranking today (`matcher.ts`):

| component | weight | line |
|---|---|---|
| `category` hit | 3 | `matcher.ts:22`, `:209` |
| `scope` ratio (narrowing: hits/\|record\|, else hits/\|requested\|) | 2 × ratio | `:23`, `:96-102`, `:210` |
| `tag` hits, capped at 2 | 1 × min(hits,2) | `:24-25`, `:211` |
| **`location` hit** | **1** | **`:26`, `:212`** |
| tie-break 1 | **location token count desc** | `:113`, `:123` |
| tie-break 2 | areaDeltaM2 asc, `null` last | `:124-130` |
| tie-break 3/4 | publishedAt desc, id asc | `:131-136` |

Area is not in the score at all (tie-break only). Location is in the score **and** the first tie-break, and is emitted as an `applied` criterion the model reads (`:165`), fed by a tool argument (`tool-def.ts:40-43`), verbatim-checked in `executor.ts:296-302`, extracted into state (`interior-extract.ts:104-106`) and shown to the model as "지역 …" (`interior-state.ts:571`). LO1 (`C: MUST`) requires: weight 0, no location sort key, no `applied.location` in the envelope. Keeping `state.location` for the **lead** is fine (that is not ranking). This is the consumer's own rev3 "M6" decision being reversed by the contract; it needs a decision record on the consumer side, and `scripts/portfolio-matcher-test.ts` gains the §15 "shuffle `location` ⇒ ranking unchanged" test.

### M-2 · PT2's exclusion clause makes `full_remodel` prices non-comparable in a way the consumer cannot detect (answers O-2)

PT2: *"A whole-dwelling project that left one already-good space untouched is still `full_remodel`"* — and `bi-03` is classified so although its body says the bathroom was left alone. Consequences: `bi-03`'s authored `perArea 3,200,000/평` (and any future `total`, and any D-1 derived `perArea`) excludes bathroom work; WS7 says the missing `bathroom` id is *unknown*, not *excluded*, so the consumer cannot disclose it. A 34평 "전체 리모델링" visitor (utterance 1) is shown `bi-03` as breadth-`exact` with a price that silently omits a room.
Under `PT3` the producer may not infer — but here the operator **authored** the exclusion sentence; emitting it is ND1-compliant. Options, in order of preference: (a) add `workScopeIdsExcluded?: WorkScopeId[]` (authored, same closure rules) and require PB1/D-1 to treat a record with a non-empty exclusion as *not* comparable for whole-home budgets (a fifth D-1 guard); (b) classify authored-exclusion cases as `partial_remodel`; (c) keep PT2 and accept the undetectable understatement — not recommended. `bi-02` and `bi-05` are fine under PT2 as audited.

### M-3 · "missing is never a penalty" silently becomes "ranked last, therefore never shown"

PB4/MD5 forbid a penalty for a missing value. Today's sort puts `areaDeltaM2 == null` **last** (`matcher.ts:126-129`), and the default limit is 3 (`search-types.ts:94`) over 8 records. A record without `area` is shown only if fewer than three same-score records have a comparable area — with a category hit shared by five full-remodel records, a no-area record is never in the top 3. V0.2 adds two more criteria (`projectType`, budget); if each becomes another "null last" key, `bi-08` (`projectType` absent) and every record without `total` disappear from every budget consultation. The contract must define what "no penalty" means in **ordering** terms. Recommended: a not-evaluable criterion is *neutral* for that record (contributes to neither score nor tie-break; the record keeps its position from the other criteria), and the envelope carries per-criterion `notEvaluableCount` so the assistant can say "N건은 가격 정보가 없어 예산 비교에서 제외했습니다". If instead "evaluable-first" ordering is intended, say so and require that disclosure.

### M-4 · The visitor-side budget has no shape, no parse rule, and no verbatim rule

§9 defines `total` exact-XOR-range for records only. PB1 compares "a visitor's total budget" — an object that exists nowhere. Today's consumer holds only `budgetHint` (raw text ≤ 40, `interior-extract.ts:60-61`, `:134-135`, `interior-state.ts:99`). Replay of the extractor on the 10 utterances:

| utterance | `budgetHint` today |
|---|---|
| 1 "예산은 5천 정도예요" | `"예산은 5천"` |
| 2 "주방만 1500만원 정도로" | `"1500만원 정도"` |
| 3 "600~800만원 정도" | **`"800만원 정도"`** — the lower bound is lost |
| 8 "예산은 3천인데" | `"예산은 3천인데"` |

No numeric value exists anywhere, so PB1 cannot be implemented today at all. Needed on the consumer side: a closed-grammar parser (like `area.ts`) → `{ kind: "exact"|"range", amount | minAmount/maxAmount, currency: "KRW", raw }`, with the Korean shorthand rule (`5천` = 5천만원, `1.5억`) as a closed table, and INV-B (the number must come from the visitor's utterance, never from a tool argument the model composed). Needed in the contract (one paragraph): the visitor budget mirrors the `pricing.total` shape, is parsed by the consumer from visitor text, and the predicate of B-1(c) is defined over the two shapes.

### M-5 · Style candidates become facts *about the visitor* (utterances 6 and 7)

`style` is bonus-only (ST3) — correct, and it bounds the ranking damage. But the consumer stores confirmed candidates in state (`executor.ts:393` → `styleTagIds`) and renders them as **"선호 스타일: …"** in the prompt (`interior-state.ts:580-581`, `builder.ts:485-487` "위 정보는 고객이 이미 말한 것이다"). Two failure paths:
- utterance 6 "깔끔하고 따뜻한" → semantic candidate `미니멀` (cosine ≥ 0.44) → the assistant says *"미니멀 스타일을 원하신다고 하셨는데"* — the visitor never said it;
- utterance 7 "너무 화려한 건 싫어요" → the span containing 화려 yields a **positive** candidate for whatever style id it resembles → bonus to the records the visitor dislikes, and "선호 스타일: 화려…" in the prompt.
GR1 protects facts about records, not facts about the visitor. Fix (consumer, cheap): only `via: "exact"` candidates from non-negated spans enter `known`; semantic candidates stay ranking-only; spans containing 싫/아니/말고/빼고/제외 are not style sources. Fix (contract, one sentence in §14.4): a style bonus is never stated back to the visitor as their preference unless the label occurs verbatim in their utterance.

### M-6 · The motivating query is not exercisable on the only opted-in site, and §19 contradicts §13

§13/O-7: none of the 8 records has an authored total. §19 nevertheless shows `bi-04` with `total 19,000,000` and calls the pair "normative". `data/sites/boost-interior-demo/content/projects.json` confirms `bi-04` and `bi-06` have **no** price of any kind. On live data, utterances 1, 2, 3 and 8 all end in "budget not evaluable" (perArea-only + PB2), i.e. exactly the V0 answer V0.2 was written to improve. Rollout step 6 ("V0.2 search tests against the real snapshot") cannot test PB1 until totals, `projectType`, `workScopeIds` and `style` are authored for the demo site. The document should say so, and the golden fixture (step 2) must include at least: full+exact total, full+range total, partial+total, partial without price, `projectType` absent with a total, and one `full_remodel` with an authored exclusion (M-2).

---

## 3. MINOR

- **m-1 · GC1 change list.** GC1 (`C: MUST`) is violated today in three places; see §6 for file:line. None causes a customer-facing error; all are "move only what is needed": card `area` → adapter-rendered strings; prompt `areaBasisConflict` → adapter-rendered note lines; lead's facet-key-typed label closure → adapter-exported describer.
- **m-2 · Facet key retirement is hard-coded in six places.** `KNOWN_FACET_KEYS = ["category","scope","tag"]` and `FACET_VALUE_LIMITS {scope:150, tag:150}` (`contract.ts:41-48`), `FACET_EMBED_PREFIX: Record<KnownFacetKey,…>` (`facet-index.ts:44-48` — a compile error the day `style` is added), `FacetCandidates {category,scope,tag}` (`search-types.ts:65-69`), `facetLabels` pick order (`executor.ts:136-150`), `KnownInfoLabels.facetLabel` key union (`interior-state.ts:531`), `facetLabelOf` (`exposure.ts:129`). During the dual-read window `scope` must stay parseable; after RO2 it goes. The VO6 declaration change (`style: 150`, `scope` retired) must be notified as the contract says — today the consumer has not declared `style`.
- **m-3 · Interior state under V0.2.** Fields the consumer must extract that `interior-extract.ts` does not: breadth intent (`full|partial|unknown`, closed grammar over 전체/올수리/부분/~만 — today only the site's *category label* "전체 리모델링" fires, which is the marketing axis the contract just retired for this purpose), numeric budget (M-4), `workScopeIds` via a consumer alias table replacing site-local `scopeIds`, `styleIds` replacing `styleTagIds`. `PROPERTY_TYPES` (`interior-state.ts:45`: `house|shop|office|other`) does not match `property.type` (§6: `detached_house|mixed_use|commercial`) — a mapping is needed only if `property.type` is to be matched; today it is state-only. Budget: 4,000-char DB CHECK (`0041:39`) / 3,500 app cap is **not** at risk — canonical ids are ≤ 20 ASCII chars against today's ≤ 64-char site-local ids, and breadth (~25 chars) + budget (~110 chars) are smaller than the saving. But: `TOP_LEVEL_KEYS` is a strict allowlist and the parser returns `null` (state wiped, `corrupt=true`) on any unknown key (`interior-state.ts:104-118`, `:219-221`), so the new keys must be added to the parser **before** any row is written with them; `fitInteriorState` (`:417-457`) needs overflow steps for the new keys.
- **m-4 · `category` still dominates the score (O-5).** `WEIGHT_CATEGORY = 3` is the largest weight, and for utterance 1 both the category label ("전체 리모델링") and the new breadth extractor will fire → double counting of the same fact across the marketing axis and the structured axis. Under V0.2 `category` should be display-only or ≤ the style bonus; `projectType` and `workScopeIds` carry the score. Recommend the contract's DISPLAY row (§4) say "not a ranking input" explicitly, matching LO1's style.
- **m-5 · Tool interface.** Flat strings (`sanitizeToolArgs`, `tool-loop.ts:285-302`: string-only, declared keys, ≤ 500 chars) remain adequate. V0.2 forces at most one new argument (`budget`, verbatim, server-parsed) and arguably none (state extraction already sees the utterance). Nothing in the contract forces a bad interface, but WS6 + a fixed 26-id vocabulary will tempt an implementer to expose `workScopeIds` as an enum argument; that would let the model choose canonical ids (INV-B violation: model-made values become search conditions). One sentence in §7.4 ("canonical ids are never accepted from the model; the consumer derives them from visitor text") closes it. Upside worth stating: with 26 fixed ids, the scope path no longer needs embeddings — a deterministic alias table (부엌/싱크대→`kitchen`, 화장실→`bathroom`, 안방/작은방→`bedroom`) is cheaper and testable; embeddings remain only for `style`.

---

## 4. NOTE

- **n-1 · O-1 (`ND2`).** Splitting `ND1` is sound; the four-condition guard is exhaustive *given PT2*, and becomes leaky exactly where PT2 is (M-2) — add "no authored exclusion" as a fifth condition once that field exists. RD1 integer rounding: correct for KRW/JPY; for USD/sqft it discards cents (123.46 → 123) — acceptable for a "coarse indicator" but say it.
- **n-2 · O-3 (labels).** Keep them. Today's exact-label path (`interior-extract.ts:31-43`) and the lead labeller (`lead/repository.ts:531-537`) both read `values[].label` from the stored payload; removing labels would push a consumer-side id→label table into lead code, which is itself a GC1 violation.
- **n-3 · O-4 (`0.2`).** Honest, and the degradation claim is verified in code: `SUPPORTED_MAJORS = {0}` (`contract.ts:35`, `:194-203`) accepts `0.2`; `workScopes` is an unknown top-level field (ignored); `facets.style` lands in `ignoredFacetKeys` (`:441-446`); absent `area`/`pricePerArea` simply leave the record without them (`:646-657`); `facets.scope` absent → `facet_disabled` (`matcher.ts:62-65`). Records survive with id/title/detailUrl/location/publishedAt/category. No stale-consumer misread is possible.
- **n-4 · O-6 (sets).** Accept for V0.2; "욕실 두 개" is rare on first contact and the title carries it.
- **n-5 · DB: V0.2 forces no migration.** `first_party_snapshot.payload` is `jsonb` with only `jsonb_typeof = 'object'` and ≤ 1,048,576 chars (`0048` M4); `resource_schema_version` CHECK `^[0-9]{1,4}[.][0-9]{1,4}$` accepts `0.2`; `disabled_facets text[]` has only a cardinality CHECK (so `style` is storable); `conversation_workflow_state.state` ≤ 4,000 and `workflow_key IN ('booking','interior_consult')` (`0041:39`, `0050`) are untouched. The only DB-visible change is the *shape of the stored payload*, which `parsePortfolioPayload` (`exposure.ts:110-115`) checks structurally only.
- **n-6 · Utterance 10 and LO1.** The consumer already has the right home for serviceability: `grounding/policy.ts:189` (`serviceArea` protected fact) and the prompt rule at `builder.ts:785` ("목록에 없다는 이유만으로 불가능하다고 추론하지 않는다"). LO1 should cross-reference "business facts" concretely so no implementer routes it through portfolio locations. Note that today "부산" reaches the model as `dropped: [{field: "location", reason: "no_vocabulary_match"}]` (`matcher.ts:161-162`) — readable as "we have no cases in 부산", which M-1 removes together with the location axis.
- **n-7 · WS2 closure must be checked against the document, not the consumer's list.** §12 rejects the whole document on a broken `workScopes` closure. The consumer must verify `record.workScopeIds ⊆ workScopes.values[].id` (as `contract.ts:468-473` does for facets), never `⊆ §7.3-as-known-by-the-consumer` — otherwise a minor-bump id addition (SV2) makes every V0.2 document TRANSIENT for an un-updated consumer. WS8 implies this; §12 should say it.

---

## 5. The ten utterances

| # | utterance | contract fields used | verdict |
|---|---|---|---|
| 1 | 34평 아파트 전체 리모델링, 예산 5천 | `projectType=full_remodel`, `property.area` (AR5), `pricing.total` (PB1) | **GAP** — live data has no `total` → budget not evaluable (PB2/PB4), and the envelope cannot say so per record (B-2); with a total present, PB1 lacks the area condition (B-1b); `bi-03` would be shown breadth-exact with a bathroom-less price (M-2); consumer lacks breadth extractor and numeric budget (m-3, M-4) |
| 2 | 주방만 1500만원 | `workScopeIds ∋ kitchen`, `partial_remodel`, `total` | **GAP** — PB1 "overlap" permits comparing against `bi-04` (kitchen+bath, 1,900만) → misleading (B-1a); today `narrowing=true`, `scope:주방` hit, no numeric budget |
| 3 | 욕실만 600~800만원 | as 2, plus a **visitor range** | **GAP** — visitor-side range undefined (M-4; today collapses to `"800만원 정도"`), predicate undefined (B-1c), overlap rule (B-1a) |
| 4 | 주방이랑 욕실 같이, 비슷한 사례 | `workScopeIds ⊇ {kitchen,bathroom}`, `projectType` | **OK once B-2 is fixed** — `bi-04` is scope-exact; breadth is *unstated*, so full-remodel cases containing both are `fallback_from_full` and must be labelled; today both scope labels hit exactly |
| 5 | 전체공사는 아니고 부분적으로만 | `projectType=partial_remodel` | **GAP (consumer)** — nothing extracted today (replay: no hits); GR3's ladder needs requested spaces, so with none the only correct move is to ask; contract supplies enough, consumer lacks a breadth extractor (m-3) |
| 6 | 깔끔하고 따뜻한 느낌 | `facets.style` (ST3 bonus) | **OK with caveat** — bonus only, no penalty; but the semantic candidate is echoed as "선호 스타일" (M-5); consumer must move the embedding path from `tag` to `style` (m-2) |
| 7 | 호텔 같은 느낌, 너무 화려한 건 싫어요 | `facets.style` | **GAP** — negation is unrepresentable; the negated span produces a *positive* bonus and a false "선호 스타일" fact (M-5); ranking damage bounded by ST3 |
| 8 | 예산 3천, 34평 전체 가능? | `projectType`, `property.area`, `pricing.perArea` (PB2/D-1c) | **BLOCKER** — can be tagged `exact` on breadth+area while the budget is not evaluable (B-2); co-presenting `perArea`+`area` yields a model-computed total (B-3); PB1 correctly forbids the partial `bi-04` total, but nothing in the envelope carries that |
| 9 | 전용 84㎡예요 | `property.area.basis` (AR5, PY1) | **OK** — replay: `prefix=전용, 84, m2`; every live record is `supply` → `basis_mismatch` → dropped, prompt line asks for the 공급 figure (`builder.ts:500-502`); no conversion anywhere |
| 10 | 부산인데 시공 가능할까요? | none (LO1) | **OK** — serviceability is answered from `serviceArea` (`grounding/policy.ts:189`, `builder.ts:785`); requires M-1 so record locations leave ranking and the envelope |

---

## 6. GC1 — where today's consumer would have to change

GC1 forbids the generic conversation / tool-calling / gating / audit / card / lead machinery from referencing annex fields. Today's violations (all V0 `area`, which V0.2 moves to `property.area`; the same seams will receive `pricing`/`projectType`):

- `src/lib/first-party/search-types.ts:173` — `PortfolioCard.area?: {value, unit, basis}`: an annex field in the type that crosses into generic code at `src/lib/chat/http.ts:31,250`, `src/lib/chat/tool-loop.ts:23,490`, `src/lib/chat/run-chat.ts:42,240,969`, `src/components/Chat.tsx:15,26,1258`. Fix: drop `area`, let the adapter render it into the existing string list (`facets: string[]` → rename `facts`). Then a V0.2 "1,900만원 · 주방·욕실" line is just another string and the card machinery never changes again.
- `src/lib/first-party/cards-header.ts:96-109` — the card-header parser validates the `area` object (`value/unit/basis`). Fix: delete the branch (follows from the above).
- `src/components/Chat.tsx:1193-1197`, `:1212` — `cardAreaText` renders 공급/전용/평/㎡. Fix: delete; render `facts` strings.
- `src/lib/prompt/policy.ts:123-124` — `InteriorConsultPromptInput.areaBasisConflict` is an annex concept (area basis) in the generic prompt-policy type. Fix: replace with `notes?: readonly string[]` (adapter-rendered, builder applies `neutralizeBoundaryTags` + truncation exactly as it does for `known`).
- `src/lib/prompt/builder.ts:500-502` (renders the basis-conflict sentence) and `:503-506` (hard-coded "면적은 … 평↔㎡ … 공급/전용 …" and "견적 금액·공사 기간 …" lines) — annex-domain sentences in the generic builder. Fix: move both to `exposure.ts:buildPromptInput` as `notes`; builder keeps only the domain-free lines (`:478`, `:485-487`, `:493-498`).
- `src/lib/lead/repository.ts:11` (imports `KnownInfoLabels`, whose `facetLabel(key: "category"|"scope"|"tag")` is declared at `src/lib/first-party/interior-state.ts:531`) and `:519-540` (`readPortfolioLabels` reads `payload.facets[key].values` with facet-key-typed access) — lead machinery knows the facet keys, which V0.2 changes (`scope`→gone, `style`→new). Fix: the adapter exports `describeInteriorConsult(rawState, payload) → { entries, portfolio }`; lead calls it and stops touching `payload.facets` (`:546-553` then shrinks to one call).

Not affected (correctly generic today): `src/lib/tools/gate.ts` (no first-party reference), `src/lib/tools/audit.ts` (called *by* the adapter), `src/lib/chat/tool-loop.ts:993-1028` (dispatches to the adapter by capability key; references no field), `src/lib/chat/http.ts:323-333` (opaque header).

Borderline, not required by GC1's wording: `src/lib/first-party/contract.ts:326-336, 645-657, 689-716` parse the annex inside the generic reader. Splitting the annex parse into its own module would let a non-space vertical skip it, but it is not "conversation, tool-calling, gating, audit, card or lead machinery".

---

## 7. Answers to §18, in one line each

- **O-1** sound; add "no authored exclusion" as a fifth D-1 guard once M-2's field exists; state the non-KRW cents loss.
- **O-2** `bi-02`, `bi-05`: yes. `bi-03`: only defensible together with an authored exclusion field (M-2); PT2 alone licenses an undetectable understatement, which is the inference PT3 forbids by another route.
- **O-3** keep the labels (n-2).
- **O-4** honest `0.x`; degradation verified in code (n-3).
- **O-5** two axes that correlate on eight records; keep `category` as DISPLAY but say "not a ranking input" (m-4).
- **O-6** accept (n-4).
- **O-7** no — author totals for the demo site and extend the golden fixture (M-6); §19's `bi-04` total does not exist in the data.

## 8. Freeze conditions (what would flip this to accept)

1. B-1: rewrite PB1 with the subset rule, the area condition, a defined predicate (or a declared tolerance), and PB3 with "projectType present and equal".
2. B-2: define per-record class, `exact`, and `notEvaluable[]`; make it a §15 consumer invariant.
3. B-3: add the envelope co-presentation rule and the output-check invariant.
4. M-2: decide `workScopeIdsExcluded` vs reclassify `bi-03`.
5. M-3/M-4: one paragraph each (ordering neutrality; visitor budget shape).
6. M-6: fix §19 or author the totals; extend the fixture list.
The consumer-side items (M-1, M-5, m-1…m-5) do not block the contract text but block the consumer's "step 1: parses V0.2" claim in §16.
