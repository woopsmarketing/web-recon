# 21 — Independent faithfulness audit of `proof/contract-pipeline.mjs` against contract rev 8

| | |
|---|---|
| scope | does `proof/contract-pipeline.mjs` do what `07-integration-contract-v0.2-candidate.md` (rev 8) says? Nothing else. |
| authority | `docs/reports/integration/07-integration-contract-v0.2-candidate.md` rev 8. Where the code or `20-pipeline-checker.md` disagrees with the prose, the prose wins. |
| method | rule by rule from the prose; tables verified row-condition by row-condition; each property examined for what it quantifies over and whether a violation is expressible; three implementation choices re-run as controlled variants to separate rule facts from implementation artefacts. |
| ran | `npm run proof:pipeline` — exit 0, output byte-identical to the committed `proof/contract-pipeline.txt`. Output was read, not treated as evidence of its own correctness. |
| corpus check | independent field-by-field re-derivation of all 19 records against `18` §1/§2, `projects.json` and `04` §2, plus `RD1` re-computed for `bi-09`…`bi-12`. |

---

## Trust verdict — read this before using any of the checker's numbers

**Partially trustworthy. Four of the five FAIL verdicts support their headline conclusion; none of
them supports its count; one FAIL verdict is not usable at all; and the single PASS is vacuous.**

| checker verdict | trust it as evidence for rewriting the contract? |
|---|---|
| **Property 1 FAIL** (`VB3` has no evaluation order) | **YES for the conclusion, NO for the instances.** Two of the three conflicting utterances are genuine prose overlaps that hold whatever the implementation does. The third, *"바닥이랑 거실만"* (row H), is an **artefact** of `restrictedByKind` (`:480-512`) crossing term kinds against its own comment; with the comment's own rule applied the conflict disappears. The account's headline blast-radius for gap 3 (*"12 of 19 records change class"*) is measured on that artefact and must not be cited. |
| **Property 2 FAIL** (10 dead-branch findings) | **NO, not as a list.** 4 of the 7 reported dead branches are not specification defects: 2 are residual rungs that are never-false *by construction* (the author's `UNCONDITIONAL` allow-list is incomplete), 1 (`AR5`) is manufactured by a reading that contradicts the prose, and the `WS8` pair is a corpus omission — the contract fixtures exactly that case at `CINV-9` (`07:1226`) and the checker left the fixture out. The 2 genuine items rest on a hardcoded constant (`:285`). |
| **Property 3 FAIL** (`GR3` preamble vs `GR3a` rungs) | **YES for the conclusion, NO for the count.** The divergence is real and reproducible. *"20 of 24"* is computed with `GR3a`'s *"larger `R_s` first"* key (`07:1099`) unimplemented; restoring it gives **23 of 24**. |
| **Property 4 FAIL** (59 `PB4` violations) | **YES for the conclusion, NO for the 59.** The route (`EF4` → `EF6` row 6 → `GR2a` last) is real, and the contract already concedes it at `07:1889`. The count moves to **54** when `GR3a`'s omitted rung key is restored and to **64** when the query-area basis is read as the prose reads it. *"0 price violations"* is information-free: no in-force rule reads a price. |
| **Property 5 PASS** (`EF1` closure) | **NO. Vacuous.** It quantifies over the file's own `assignState` call sites and a count that is `24 × 19 × 3` by construction of the author's own helper. No property of the contract could make it fail. It is also blind by construction to the exact defect `EF1` exists to catch (rev 7's `B-1`). |
| **Property 6 FAIL** (2 disagreements with `04` §4.1) | **ONE of the two.** Row I / `bi-03` is **correct** and `18` §7 is wrong — I re-derived it from the prose. Row G / `bi-19` is a **false disagreement**: `04` §4.1 row G (`04:699`) states no class at all, and the checker invented `exact` as the expectation. The third finding on this property (row H) is the property-1 artefact again. |

| round-8 BLOCKER | rediscovery trustworthy? |
|---|---|
| **`B8-1`** — `WS6`'s tie-break discriminator has no referent in V0.2 | **YES**, and it is correct from `07:344-352` + `07:1001-1005`. Two caveats: the "independent rediscovery" is circular (`:285` hardcodes `const permits = false`, then property 2 reports that the constant is constant); and the checker **missed** that `07:1875` already prescribes a replacement discriminator (*"which reading yields the weaker class, decided once per query"*) that was never written into `WS6`. The rewrite is a transcription, not a design decision. |
| **`B8-2`** — `GR3` preamble vs `GR3a` rungs | **YES** for the conclusion; the count is wrong (23, not 20). |
| **`B8-3`** — `GR2a` sorts `not_evaluable` last, against `PB4`'s strong form | **YES** for the conclusion; the count is unstable (54 / 59 / 64). The contract itself concedes this at `07:1889`, so it is not new evidence, it is confirmation. |
| **`B8-4`** — `VB3` rows both match one utterance | **YES** for the conclusion, on 2 of its 3 instances. Its headline instance and its blast-radius measurement are artefacts. |

**Net: rewrite `VB3` (ordering), `GR3`/`GR3a` (two orderings), `GR2a`/`PB4` (class `not_evaluable`
last) and `WS6` (discriminator) on the strength of these findings. Do not rewrite anything on the
strength of property 2's list, property 5's PASS, row G, or any of the published counts.**

---

## 1. Rule-by-rule

Code citations are `:<line>` into `proof/contract-pipeline.mjs`; prose citations are `07:<line>`.

| rule | function / constant | verdict | citation and reason |
|---|---|---|---|
| §14.3.1 `V` shape | `extractQuery` `:581`, `extractArea` `:423` | **UNFAITHFUL** | `07:816` + `07:910-913` + `07:240-243`. `:463` assigns `basis = "supply"` to a query that states none. `EF4`'s own paragraph (`07:910-913`) and `PY1` (`07:240-243`) both specify what an **absent** basis does — compare, lower confidence, disclose, *"never changes the criterion state"* — so the contract does not ask for a basis to be invented, and `AR5` forbids inferring one. Divergent input: *"34평 전체 5천이면 되나요"* vs `bi-14` (84㎡ `exclusive`): the code refuses the comparison (`not_evaluable`); the prose compares it with a lowered-confidence disclosure. `V.styles` (`07:818`) is not extracted (inert — `ST3`/`ST5` are out of this audit's scope). |
| `VB1` | `vb1ExtractBudget` `:376`, `koreanAmount` `:361` | **FAITHFUL** | `07:820-824`. Three shapes, never two; `CINV-8`'s *"600~800만원"* → `range{6,000,000 / 8,000,000}` reproduced. Minor: `gr5ForbiddenNumbers` `:998` feeds only `minAmount` for a range into `GR5`'s price set. |
| `VB2` | — | **NOT IMPLEMENTED** | `07:825-826`. No `budgetHint` model and no check. Inert in V0.2 (nothing compares), so no finding beyond the gap in the map's coverage claim. |
| `VB3` | `VB3_ROWS` `:514-556`, `vb3` `:558` | **UNFAITHFUL (one row)** | `07:836-844`. All seven rows are encoded separately, in the prose's order, and the checker correctly reports *all* matches rather than the first — that part is exemplary. But `restrictedByKind` `:480-512` skips a next scope term **of any kind** (`:492`) while its own comment at `:488` says *"terms of the same kind"*. On *"바닥이랑 거실만"* that makes row 5 (*a restriction by trade*) fire off a chain whose 만 attaches to a **space**. Controlled re-run with `:492` restricted to the same kind: the rows-2+5 conflict disappears, leaving 2 conflicts, and row H's classes are unchanged. |
| `WS6` — match on id only | `ALIASES` `:260-274`, `scopeTermsIn` `:311` | **FAITHFUL** | `07:340-342`. The rule assigns the table to the consumer; declaring it in the file is correct. |
| `WS6` — ambiguity tie-break | `ws6ReadingPermitsPriceComparison` `:281`, `ws6Resolve` `:290` | **UNFAITHFUL (partial)** | `07:344-352`. The gap it raises is real (below, gap 6). But (a) the discriminator is **asserted**, not derived — `:285` is `const permits = false;` with a citation, and property 2 then "discovers" that a constant is constant; (b) the rule's second half, *"and says which reading it took"*, is not implemented: `extractScope` builds `notes` (`:337-339`) and nothing ever prints them; (c) the declared fallback picks `built_in_furniture` for 수납 (`:64`, `:303`), which is the reading that yields the **stronger** class (`scope_exact` on `bi-18`) — `07:348-352`'s own worked example — and is the reading `04:701` needs for row I to come out as stated. |
| `WS8` | derived at `:247-251`, read by `EF3` `:758` | **FAITHFUL but unexercised** | `07:389-394`. Correctly derived rather than assumed, and correctly read from inside `EF3` (rev 7's `B-1` placement). No input in the corpus makes it true, although `CINV-9` (`07:1226`) supplies one by name (`bi-16` read by a consumer that does not know `bathroom`). |
| `EF1` | `assignState` `:715`, `STATE_LEDGER` | **FAITHFUL as a construction** | `07:864`. One writer, three owners, throws on any other. See property 5 for why the property built on it is vacuous. |
| `EF2` | `EF2` `:726` | **FAITHFUL** | `07:870-874`, including the `whole ↔ full_remodel` mapping. |
| `EF3` | `EF3` `:738` | **FAITHFUL** | `07:875-905`. All three branches: `Q = ∅ ⇒ not_applicable`; `full_remodel` spaces half unconditionally satisfied and trades half `satisfied`/`not_evaluable`, never `unsatisfied`; `WS8`'s not-closed clause inside the `partial_remodel` branch; absent ⇒ `not_evaluable`. |
| `EF4` | `EF4` `:776`, `ar5Permits` `:678` | **FAITHFUL** | `07:906-908`. `ar5Permits` implements `AR5`'s three clauses correctly, including *"one unknown basis → still compare"*. The function is right; the input §14.3.1 hands it is not. |
| §14.3.3 | `SCOPE_ROWS` `:619-636`, `scopeRelation` `:654` | **FAITHFUL** | `07:923-932`. I checked all eight row conditions individually against the prose: row 5 `R_s ⊋ Q_s`, row 6 `R_s ⊊ Q_s`, row 7 overlap-with-neither-containing, row 8 disjoint — all correct, none collapsed. `PB7` (`07:919`) applied as first-match and *checked* against the full holding set. |
| §14.3.3.1 | `TRADE_ONLY_ROWS` `:606-615` | **FAITHFUL** | `07:967-970`. All four rows correct; reachable only via §14.3.3 row 2, as the prose requires. |
| §14.3.4 tiers | `TIER_ROWS` `:688-692`, `tierOf` `:693`, `toPyeong` `:671` | **FAITHFUL** | `07:986-994`, `AR4` `07:231`. `delta = (r − v)/v` on the visitor's figure; `m²/pyeong = 400/121`; bands in order with a first match. |
| `EF6` | `EF6_ROWS` `:808-818`, `EF6` `:827` | **FAITHFUL** | `07:1045-1051`. All seven rows encoded independently; first-match verified against the lowest holding row over 336 raw vectors; row 1 returns the §14.3.3 relation. |
| `GR2a` | `GR2A` `:802-803` | **FAITHFUL** | `07:1070-1072`, verbatim order; permutation against `GR2`'s closed list (`07:1033-1036`) machine-checked. |
| `GR3` preamble | `orderByDirectAnswersFirst` `:1075` | **FAITHFUL** (as one of the two readings under test) | `07:1082-1084`. |
| `GR3a` rung-set table | `GR3A_ROWS` `:840-846` | **FAITHFUL** | `07:1092-1095`, four rows, first match. |
| `GR3a` rung tables | `RUNG_SETS` `:855-889`, `rungOf` `:891` | **NOT IMPLEMENTED (one key)** | `07:1099`. The whole-home cell reads *"`partial_remodel` records, **larger `R_s` first**"*, restated normatively in `CINV-24`(a) (`07:1241`). The code declares it as `subSort: "larger R_s first"` at `:861` and **never reads that property anywhere in the file**. Controlled re-run applying it inside the rung: property 3 goes **20 → 23 of 24**, property 4 goes **59 → 54**, and the derived order changes on three of the nine `04` §4.1 rows. |
| within-rung keys 1–5 | `orderWithinBlock` `:903-947` | **FAITHFUL to the declared reading** | `07:1112-1119`. Keys (1),(3),(4),(5) composed lexicographically by stable bottom-up sorts; key (2) applied as a positional permutation inside each key-1 block, which is the literal reading of *"keeping the position the previous key gave it"*. The choice of reading is gap 7 and is declared. |
| `GR1` | `gr1StatableNumbers` `:957` | **PARTIAL** | `07:1126-1128`. Models the four numeric price fields, which is all `GR5` needs. The rule's other half — *"No price is invented, no total is computed, no per-area price is computed (`D-1c`)"* — is not checked anywhere. |
| `GR4` | `gr4Envelope` `:969` | **FAITHFUL** | `07:1129-1131`. The **price** is withheld unless asked; `property.area` always available. Discriminator fires on exactly the one corpus utterance that asks. |
| `GR5` | `gr5ForbiddenNumbers` `:989`, `titleAreas` `:977` | **FAITHFUL (narrowed)** | `07:1136-1143`. Products and quotients, operands across records, areas including title-parsed ones and the visitor's own. Narrowing: `:1001` admits a quotient to the forbidden set only when integral. Harmless for this check (every statable amount is an integer) but the rule is not so limited. |
| `GR5a` | `gr5aExempt` `:1006` | **FAITHFUL** | `07:1145-1147`. Per record, no cross-record reach. Both of the rule's own named probes (`bi-19` 343,750 forbidden; `bi-10` 2,500,000 exempt) and the cross-record probe of `07:1149-1152` reproduce correctly. |
| `PB2` | `pb2Check` `:1011` | **NOT IMPLEMENTED** | `07:1013-1014`. The body is `observe(..., false, ...)` — it asserts compliance. Nothing is derived. (The assertion happens to be sound: V0.2 contains no comparison. But this is exactly the *"asserted by hand rather than derived"* shape the brief flags.) |
| `PB4` | property 4 `:1282-1328` + key-2 carve-out `:914-945` | **FAITHFUL as a test** | `07:1015-1019`. Genuinely metamorphic: fields deleted, pipeline re-run, positions compared. Counts are unstable — see property 4. |
| `PB5` | `pb5Check` `:1016` | **NOT IMPLEMENTED** | `07:1020-1021`. Same shape as `pb2Check`: `observe(..., false, ...)`. |
| §17.1 deferred rules | — | **CORRECTLY ABSENT** | `PB0`, `PB0a`, `PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`, `EF5` and the `price_fallback` class appear nowhere; `CLASSES` `:798-799` and `GR2A` `:802-803` both omit `price_fallback`. **No deferred rule is implemented.** |

**Totals: 4 UNFAITHFUL (§14.3.1, `VB3`, `WS6` tie-break, `GR3a` rung tables) · 3 NOT IMPLEMENTED
(`VB2`, `PB2`, `PB5`) · 1 PARTIAL (`GR1`) · 18 FAITHFUL · 0 deferred rules implemented.**

### 1.1 Tables — the specific check the brief asked for

Every prose table is encoded row by row, in the prose's order, as an independent predicate, and the
checker reports the whole holding set rather than short-circuiting. I verified each row condition
against the prose individually rather than trusting the transcription:

| table | rows | order preserved | conditions individually correct | first-match applied where the prose states it |
|---|---|---|---|---|
| `VB3` `07:836-844` | 7 | yes | 6 of 7 — row 5's chain rule crosses kinds (`:492`) | correctly **not** applied; `VB3` states none, and that is the finding |
| §14.3.3 `07:923-932` | 8 | yes | 8 of 8 | yes, `PB7` `07:919`, and verified against the holding set |
| §14.3.3.1 `07:967-970` | 4 | yes | 4 of 4 | yes |
| §14.3.4 `07:990-994` | 3 | yes | 3 of 3 | yes |
| `EF6` `07:1045-1051` | 7 | yes | 7 of 7 | yes, `07:1040`, verified against the lowest holding row |
| `GR3a` rung set `07:1092-1095` | 4 | yes | 4 of 4 | yes, `07:1086` |
| `GR3a` rungs `07:1099-1101` | 3 + 5 + 4 | yes | 11 of 12 — the whole-home rung 2 sort key is declared and never applied | n/a |
| `GR2a` `07:1070-1072` | 10-item order | yes | verbatim | n/a |

No table was optimised into cleverer logic. This is the strongest part of the implementation.

### 1.2 Corpus construction

Every field of all 19 records that any in-force rule reads — `id`, `publishedAt`, `projectType`,
`workScopeIds` (set **and** order), `property.area` `{value, unit, basis}`, `pricing.total`,
`pricing.perArea` — matches its cited source exactly (`18` §1/§2 lines 100-107 and the per-record
restatements; `projects.json`; `04` §2 per-record blocks). `RD1` re-computed independently for
`bi-09`…`bi-12`: 1,470,588 / 2,500,000 / 1,500,000 / 2,000,000, all three of formula, corpus and
`04` agreeing. `WS8`'s `droppedUnknownId` is genuinely derived (`:247-251`), not asserted.

Two real defects, neither of which moves a verdict in this run:

- **Four titles are not the titles `04` states** — `bi-10` (`04:57`/`04:135`), `bi-11` (`04:58`),
  `bi-12` (`04:59`), `bi-15` (`04:62`). `title` is load-bearing: `titleAreas` `:977` scrapes 평/㎡
  out of it for `GR5`'s forbidden set and `GR1` (`07:1127`) makes it statable. All four inventions
  happen to preserve the area token, so `GR5`'s set is unchanged and nothing moves — but `bi-10`'s
  invented *"구조 변경"* also contradicts `04`'s own body text for the record.
- **`ROWS_4_1` row C folds only 2 of the 7 records `18` §7 names** as `fallback_from_full`
  (`bi-07`, `bi-10`…`bi-13` missing). Because `expect` is consumed as a per-id subset check
  (`:1433-1441`), these are silently unchecked rather than asserted wrongly — a coverage hole in
  property 6, not a false claim. Row D2 also drops the `bi-01` `fallback_from_full` pair that row D1
  carries, on an utterance `WS3` makes identical to D1.

Fields dropped on every record (`property.type`, `location`, `facets`, `currency`, `detailUrl`) are
read by no in-force rule of this pipeline and cannot move a breadth / scope / area / price decision.

---

## 2. The six properties — what each quantifies over, and whether it can fail

### Property 1 — totality and single-valuedness of the table-driven rules · **MEANINGFUL**

Quantifies over: `VB3` × 24 utterances; §14.3.3 × 1,024 synthetic `(R_s, Q_s) ⊆ {kitchen, bathroom,
entrance}`, `(R_t, Q_t) ⊆ {flooring, wallpaper}` shapes; §14.3.3.1 × the 96 of those that reach it;
`EF6` × 336 raw state vectors; `GR3a` × 12. A violation is expressible in both directions — zero
rows and multiple rows are both counted, and *first match wins* is checked against an independently
computed holding set rather than assumed. The synthetic space is thin (3 spaces, 2 works) but it is
sufficient to realise every set relation the tables discriminate on.

**Usable.** `§14.3.3` / `§14.3.3.1` / `EF6` / `GR3a` / `GR2a` results are sound. The `VB3` finding
is sound as a conclusion on 2 of its 3 instances. One documentation error: `20-pipeline-checker.md`
§4's table records *"1 utterance with no row"* for `VB3`; the run produces **0**.

### Property 2 — dead-branch detection · **MEANINGFUL IN FORM, UNRELIABLE IN CONTENT**

Quantifies over 67 registered predicates and every evaluation of each. A violation is expressible.
But the *reported* dead branches are not what the property claims:

| reported | real? |
|---|---|
| `WS6` *a reading permits a price comparison* — never true (480) | **Genuine finding, circular evidence.** `:285` is `const permits = false;`. The observation restates the assertion. The conclusion is nevertheless correct from `07:1001-1005`. |
| `WS6` *the tie-break discriminates* — never true (120) | Derived from the line above; one finding, not two. |
| `AR5` *one basis unknown* — never true (4,914) | **ARTEFACT.** Manufactured by §14.3.1's `basis = "supply"` reading, which the prose contradicts. Re-run with the basis left unknown: the predicate becomes live and the entry vanishes. |
| `WS8` / `EF3` *record has a dropped id* — never true (19 / 4,480) | **CORPUS OMISSION, not a rule defect.** `CINV-9` (`07:1226`) supplies the fixture by name — `bi-16` `[kitchen, bathroom]` read by a consumer that does not know `bathroom` — and the checker included `CINV-15`'s fixtures but not this one. Two entries, one omission. |
| `GR3a` *spaces-named rung 5: other breadth-absent records* — never false (1,760) | **FALSE POSITIVE.** Residual by construction: a record reaching rung 5 failed rungs 1-4, so it is neither partial nor full, so `projectType === null`. Identical in kind to the entries the author placed in `UNCONDITIONAL` `:73-79`; the allow-list is simply incomplete. |
| `GR3a` *whole-home rung 3: breadth-absent records* — never false (1,800) | **FALSE POSITIVE**, same reason. |
| §14.3.3 row 1 — never true on the corpus | **GENUINE and new.** `EF3` (`07:875`) returns `not_applicable` for `Q = ∅` before the table is consulted, so the table's own row 1 is unreachable from its only caller. Correct and worth recording. |
| §14.3.3 row 4 — never true on the corpus | corpus thinness, correctly labelled as such. |
| §14.3.3.1 row 1 — never true on the corpus | **GENUINE confirmation** of the contract's own claim at `07:972-977`. |

Net: of 10 findings, **2** are usable statements about the specification (`WS6`'s constant
discriminator; §14.3.3 row 1's unreachability) plus 1 confirmation of a claim the contract already
makes. **4 are not specification defects.**

### Property 3 — differential ordering · **MEANINGFUL**

Quantifies over 24 utterances × the two orderings computed from one and the same `EF6` class
assignment. A violation (agreement) is expressible and occurs on 4 of 24. The comparison is between
two specific readings — *partition on `exact`, then the five keys* versus *rungs, then the five
keys* — and does not test a third possible reading in which the rungs order **within** each of the
direct/labelled partitions. That is a limitation, not an infidelity; the prose supplies no such
composition and that absence is the finding.

**Usable for the conclusion. The count 20/13 is wrong** — restoring `GR3a`'s omitted
*"larger `R_s` first"* key gives 23 of 24.

### Property 4 — `PB4` metamorphic · **MEANINGFUL**

Quantifies over 24 utterances × 19 records × 3 deletable fields, minus records that lack the field:
936 checks. A violation is expressible; 59 occur. The mechanism is real — the deletions take effect
(`:1296-1301` rebuild the record with the field nulled), `EF4` reads exactly the nulled field, and
`orderByRungs` is re-run from scratch.

**The area/price asymmetry is a property of the rules, not an artefact of the deletion.** I checked
the three things that could have faked it:
- the field names are the ones the code reads (`R.area`, `R.pricing.total`, `R.pricing.perArea`);
- the deletions do take effect — the same `evaluate` path is re-run on the mutated corpus;
- no derived value survives that could stand in for a deleted price **in any in-force rule**,
  because no in-force rule reads a price at all (`07:1119`: *"No key is a price"*).

That last point is also why the asymmetry carries no information: the 504 price deletions were
never capable of moving anything, so *"0 price violations"* confirms `07:1119` and nothing else. A
side effect worth noting: deleting `pricing.total` on `bi-09`…`bi-12` leaves a `source: "derived"`
`perArea` with no total, which `D-1` condition 2 makes an illegal record shape. Harmless here
precisely because nothing reads it.

**The count is unstable.** 59 as published; **54** with `GR3a`'s omitted rung key restored; **64**
with the query-area basis read as the prose reads it. Cite the route, never the number.

### Property 5 — `EF1` closure · **VACUOUS**

Quantifies over: (a) the string occurrences of `assignState("` in **this file's own source**
(`:1341-1358`); (b) a count `LEDGER_AFTER − LEDGER_BEFORE` compared against
`24 × 19 × 3`. Both are true by construction of the author's own helper: `evaluate` `:1029` calls
`EF2`, `EF3` and `EF4` exactly once each per record, so the count is arithmetically forced, and the
only way a non-`{EF2, EF3, EF4}` owner could appear is if the author wrote one — in which case
`assignState` throws at `:716` anyway.

Worse than merely trivial: `EF1`'s real content is a constraint on **the specification** — rev 7's
`B-1` was precisely that `WS8` and `WS7a` assigned a scope state from outside `EF2`–`EF5`. The
checker implements `WS8`'s clause **inside** `EF3` (`:758`), which is the repaired rev-8 placement,
so the only shape the property was written to detect is excluded a priori; and `droppedUnknownId` is
false on all 19 records, so the branch is never taken even once.

**The PASS is real about this implementation and says nothing whatever about the contract.** The
author states the limitation (`20` §4, property 5) but still lists it among six property verdicts
about the specification. It should not be counted as one.

### Property 6 — the nine `04` §4.1 utterances · **MEANINGFUL BUT NARROW, AND PARTLY SELF-FULFILLING**

Quantifies over 36 hand-listed `(row, record, class)` pairs plus one head check. It is a **subset**
check (`:1433-1441`): a record that is not listed cannot fail, and row C lists 2 of the 7 records
`18` §7 names. At least four of the 36 pairs are the transcriber's own derivation rather than a
stated claim — row F's two (`04:698` calls `bi-08` *"a projectType-absent reference"* and assigns no
class), row D2's, and row G's — so *"36 reproduced"* overstates what `04`/`18` actually assert.

It is also partly self-fulfilling: two of the four declared `READINGS` were chosen so that a stated
answer comes out. Gap 2's reading (*"욕실 하나만"* counts as a space restriction) is what makes
`bi-01` `fallback_from_full` in row D as `18` §7 states; the opposite reading makes it `exact`. Gap
6's reading (수납 → `built_in_furniture`) is what makes `bi-18` `exact` in row I; `storage` makes it
`scope_subset`. Both are declared in the open at `:53-65`, which is to the author's credit, but the
agreement they produce is not independent evidence.

---

## 3. The eight gaps — GENUINE or FALSE

| # | rule | gap as stated | verdict |
|---|---|---|---|
| 1 | `VB3` row 1 `07:838` | literal strings or forms? | **GENUINE (weak).** The contract never says whether a left cell enumerates literal strings or a form class. But the row's own *"why"* cell — *"a statement about the extent of the dwelling"* — is a form description, exactly parallel to rows 2, 5 and 7 whose left cells say *"a restriction by space/trade"* and *"qualitative prose"*. The forms reading the checker took is the right one; the repair is a one-line clarification, not a rule change. Do not rewrite `VB3` row 1 on this. |
| 2 | `VB3` row 2 `07:839` | a quantity between the space and the 만 | **GENUINE.** Row 2's exemplars all put 만 adjacent to the space; nothing decides *"욕실 하나만"*, and `WS3` (`07:332-335`) makes the count itself unrepresentable. The reading materially decides `bi-01`'s class in row D. Note the reading taken is the one that reproduces `18` §7's stated answer. |
| 3 | `VB3` `07:832-848` | no first-match rule | **GENUINE, and the most important of the eight.** Verified at prose level, independent of the implementation: *"큰 공사는 아니고 몇 군데만"* contains row 3's exemplar `몇 군데만` **and** row 7's exemplar `큰 공사는 아니고` (partial / absent); *"집 전체는 아니고 바닥이랑 도배만 하려고요"* contains row 4's exemplar, which itself **contains row 1's exemplar string** `집 전체`, and row 5's exemplar `바닥이랑 도배만` (whole / partial / absent). `PB7` `07:919`, `GR3a` `07:1086` and `EF6` `07:1040` each state first-match-wins; `VB3` does not, and `07:846-849` calls the list closed without making it a function. **Caveat: the third instance the checker reports (*"바닥이랑 거실만"*, rows 2+5) is an implementation artefact and the blast-radius measurement built on it must be discarded.** |
| 4 | §14.3.1 `07:816` | no basis for a bare 평 figure | **FALSE.** The prose answers the half that matters. `AR5` as quoted at `07:230-231` and restated by `PY1` at `07:240-243`: *"different bases are not compared; one unknown basis lowers confidence"*. `EF4` itself, `07:910-913`: *"when either basis is absent, the record's area is stated with its basis named and the match is described as approximate. It never changes the criterion state and never enters a ranking key."* An unstated query basis is therefore a **defined** state with a defined consequence — compare, disclose, do not change the state — and no rule needs to assign it a value. The checker's own gap text concedes that *"AR5 points the other way"* and then takes the other way anyway (`:463`). This is the worst kind of finding: it will provoke a rewrite of a rule that is already correct, and it manufactured one of property 2's dead branches and 5 of the difference in property 4's count. |
| 5 | §14.3.1 `07:816` | no unit for a bare number after 전용/공급 | **GENUINE (trivial).** `PY1`'s own example is *"전용 84㎡"*, with the unit. `04`'s row E drops it. The contract gives `V.area` no *"cannot be resolved ⇒ absent"* clause although `VB1` (`07:824`) gives `V.budget` exactly that; borrowing `VB1`'s sentence is the obvious repair, and it is **not** the reading the checker took. Affects one utterance. |
| 6 | `WS6` `07:344-352` | the tie-break discriminator has no referent in V0.2 | **GENUINE — and under-stated.** The rule text is as the checker says: its discriminator is *"the reading that does not permit a price comparison"* and `07:1001-1005` leaves no reading that permits one. But the checker missed that the contract **already contains the replacement**: `07:1875` (§20.6, row `M7-3`) states that the discriminator *"no longer exists; the tie-break is now about which reading yields the weaker class, decided once per query."* That repair was never written into `WS6`. The real finding is therefore stronger and cheaper to fix than the checker reports: the rule text and the change log contradict each other, and §7.4 needs `07:1875`'s sentence pasted in, not a new design decision. |
| 7 | within-rung key 2 `07:1112-1119` | the carve-out does not compose | **GENUINE.** Key (2) says a skipped record *"keeps the position the previous key gave it"*; the previous key (1) is `GR2a`'s class order, which produces only blocks of ties, so *"the position"* inside a block is fixed by keys (3)-(5), which come **after** (2). The text does not say which. Verified by reading; the two readings differ whenever a class block mixes keyed and skipped records. |
| 8 | `GR3` `07:1084` vs `07:1097-1119` | two orderings, no tie-breaker | **GENUINE.** `07:1084` (`C: MUST`) offers direct answers first; `07:1103-1104` makes the rungs total over the whole result and `07:1112` starts within-rung ordering from `GR2a`, whose first entry is `exact` — so a labelled reference on rung 1 precedes a direct answer on rung 3. Nothing composes them. The contract's own `Q-24` (`07:1484-1488`) asks a neighbouring question and does not answer this one. |

**7 genuine, 1 false (gap 4).** Two of the seven need correcting before use: gap 3's third instance
and blast radius are artefacts; gap 6 is under-stated and its fix is already written at `07:1875`.

---

## 4. The two §4.1 disagreements — derived independently from the prose

I worked both from `07` alone, before reading the checker's reasoning, using only the corpus fields
I had verified against `18`/`04`.

### Row G — *"32평인데 도배랑 바닥만 얼마예요"* (`04:699`) vs `bi-19`

1. **`VB3`** (`07:836-844`). 도배 → `wallpaper`, 바닥 → `flooring`; both are in §7.3's **Works**
   table (`07:304-317`). The 만 restricts a trade chain. Row 5 fires: *"a restriction by trade …
   `V.breadth` **absent** … this restricts the work, not the extent: `bi-19` ran exactly those
   trades across every room"*. No other row fires — no 전체 form, no space named, no 부분만/일부만,
   no negation, no qualitative prose. **`V.breadth` = absent. No conflict on this utterance.**
2. **`V.scope`** (`07:815`). `Q = {wallpaper, flooring}`, `Q_s = ∅`, `Q_t = {wallpaper, flooring}`.
3. **`V.area`** = 32평.
4. **`bi-19`**: `projectType` absent (`04:558`, `PT6` via `PT4`(c)), `workScopeIds =
   [flooring, wallpaper, lighting]`, so `R_s = ∅`, `R_t = {flooring, wallpaper, lighting}`,
   area 32평.
5. **`EF2`** (`07:870`): `V.breadth` absent ⇒ **`not_applicable`**.
6. **`EF3`** (`07:900`): `Q ≠ ∅`; `R.projectType` absent ⇒ **`not_evaluable`**. *"Breadth unknown
   means coverage unknown. The record remains reachable through `GR3`'s ladder."*
7. **`EF4`** (`07:906`): `|delta| = 0` ⇒ `strong` ⇒ **`satisfied`**.
8. **`EF6`** (`07:1045-1051`): row 1 no (scope is not `unsatisfied`); rows 2/3 no; **row 4 no —
   it keys on breadth being `not_evaluable`, and breadth here is `not_applicable`**; row 5 no;
   **row 6 fires** (scope is `not_evaluable`) ⇒ class **`not_evaluable`**.
9. **`GR3a`** (`07:1094`): `Q_s = ∅`, `Q_t ≠ ∅` ⇒ **trade-only** rung set; `bi-19` is breadth-absent
   with `R_t ⊇ Q_t` ⇒ **rung 2**, ahead of every `full_remodel` record. It is the **head of the
   result**.

**Who is right: both, about different things — and the checker's "DISAGREE" is a false finding.**
The derived class is `not_evaluable`, and the checker's derivation of it is correct. But `04:699`
**states no class**. Its full text is: *"`bi-19`, reached on **`GR3`'s trade rung** (`R_t ⊇ Q_t`,
breadth absent). Its 11,000,000 is **stated as a fact** (`GR1`)."* `18:561` likewise says only
*"`bi-19` remains the unique first entry on `GR3`'s trade rung"*. Both claims are **true** on the
derivation above, and the checker's own `head` test confirms the second one. The `exact` that the
disagreement is measured against was introduced by the checker at `:1107`, not by `04`.

The substantive observation underneath — that the contract offers `bi-19` **first** while labelling
it *scope not evaluable* — is real, and it is `B8-2`/property 3's finding, not a §4.1 disagreement.

### Row I — *"현관 수납"* (`04:701`) vs `bi-03`

1. **`VB3`**: 현관 → `entrance` (a **Space**); 수납 is `WS6`-ambiguous. No 만 attaches to anything,
   so row 2 cannot fire; row 6 does — *"a bare enumeration … `V.breadth` **absent**"*. Under either
   `WS6` reading, and under zero-row fall-through too, **`V.breadth` = absent**.
2. **`bi-03`**: `projectType` absent (`07:719`, `PT4`(b)); `workScopeIds =
   [entrance, lighting, built_in_furniture]`.
3. **`EF2`** (`07:870`): `V.breadth` absent ⇒ **`not_applicable`**.
4. **`EF3`** (`07:900`): `Q ≠ ∅`, `R.projectType` absent ⇒ **`not_evaluable`**.
5. **`EF4`** (`07:906`): `V.area` absent ⇒ **`not_applicable`**.
6. **`EF6`**: row 4 requires **breadth** `not_evaluable`; breadth here is `not_applicable`, so row 4
   **cannot fire**. Row 6 fires on scope ⇒ class **`not_evaluable`**.

**Who is right: the checker.** `18:563` states *"`bi-03` is `unknown_type_fallback` (breadth absent
⇒ `EF3` `not_evaluable`)"*, which conflates two different rules: the record's breadth being absent
sets the **scope** criterion via `EF3`, while `EF6` row 4 keys on the **breadth criterion** being
`not_evaluable`, which requires the *visitor* to have stated a breadth. The visitor did not.
`unknown_type_fallback` is unreachable for this query. `18` §7 row I is wrong; the derived class is
`not_evaluable`. `18` §7's substantive claim for that row — that `bi-03` is never presented as a
scope match despite `R_s = {entrance}` matching exactly — survives intact, since both candidate
classes withhold the match.

This does **not** depend on the `WS6` reading: `storage` gives `Q_s = {entrance, storage}` and
`built_in_furniture` gives `Q_s = {entrance}`, `Q_t = {built_in_furniture}`, and `EF3`'s absent
branch returns `not_evaluable` before the relation table is consulted either way.

---

## 5. Findings

| id | severity | finding |
|---|---|---|
| **A-1** | **BLOCKER** | **Property 5's PASS is vacuous and must not be reported as a property of the specification.** It quantifies over this file's own `assignState` call sites (`:1341-1358`) and a count that `evaluate` (`:1029`) forces arithmetically. No contract property could make it fail, and the one shape `EF1` exists to catch — a state assigned from outside `EF2`–`EF4` — is excluded by construction (`WS8`'s clause is implemented inside `EF3` at `:758`) and never reached anyway (`droppedUnknownId` false on all 19). This repeats the failure mode of the two earlier rounds: a property asserted rather than derived. |
| **A-2** | **BLOCKER** | **Gap 4 is a false finding and will cause a correct rule to be rewritten.** `07:910-913`, `07:240-243` and `AR5` at `07:230-231` jointly specify what an absent query-area basis does: compare, lower confidence, disclose, never change the criterion state. The checker's `basis = "supply"` (`:463`) contradicts that, manufactures one of property 2's seven dead branches, and shifts property 4's count by 5. |
| **A-3** | **MAJOR** | **`GR3a`'s *"larger `R_s` first"* key (`07:1099`, restated normatively at `CINV-24`(a) `07:1241`) is declared at `:861` as `subSort` and never read anywhere in the file.** A prose clause silently dropped. Measured impact: property 3 20 → **23** of 24; property 4 59 → **54**; the derived order changes on three of the nine `04` §4.1 rows. Every published count is conditional on this omission. |
| **A-4** | **MAJOR** | **`restrictedByKind` (`:480-512`) contradicts its own comment and manufactures `VB3`'s headline conflict.** `:488` says it skips *"terms of the same kind"*; `:492` skips a next scope term of **any** kind. On *"바닥이랑 거실만"* that makes row 5 fire off a chain whose 만 attaches to a space. Re-run with the comment's rule applied: the rows-2+5 conflict disappears. The account's lead evidence for gap 3 — *"12 of 19 records change class"* — is measured on this artefact, as is property 6's third finding. Gap 3 itself survives on two independent prose overlaps. |
| **A-5** | **MAJOR** | **Row G's disagreement is fabricated.** `04:699` and `18:561` assign `bi-19` no class — they claim it is *reached on `GR3`'s trade rung* and its total *stated as a fact*, both of which the derivation confirms. `:1107` introduces `expect: [["bi-19","exact"]]`, which appears in no source. One of the checker's two headline §4.1 disagreements is therefore not a disagreement. |
| **A-6** | **MAJOR** | **4 of property 2's 7 dead branches are not specification defects.** Two `GR3a` *"other X records"* rungs are residual by construction and belong in the `UNCONDITIONAL` allow-list at `:73-79`; the `AR5` entry is A-2's artefact; the `WS8` pair is a corpus omission — `CINV-9` (`07:1226`) supplies the missing fixture by name and the checker included `CINV-15`'s fixtures but not it. |
| **A-7** | **MAJOR** | **Gap 6 is under-stated, and its repair is already written in the contract.** `07:1875` (§20.6 row `M7-3`) states that `WS6`'s tie-break *"is now about which reading yields the weaker class, decided once per query"* — a replacement discriminator that was never written into §7.4. The real finding is that the rule text and the change log contradict each other; the fix is a transcription. The checker reports only the constant-false predicate and proposes a new design decision. |
| **A-8** | **MAJOR** | **`PB2` (`:1011`) and `PB5` (`:1016`) are hand-assertions, not checks.** Both bodies are `observe(..., false, ...)`. They assert the compliance they are supposed to derive. The assertions are sound in V0.2, but they should be listed as *not implementable in V0.2* rather than as implemented rules in `20` §2's map. |
| **A-9** | **MINOR** | **`WS6`'s second half is not implemented** — *"and says which reading it took"* (`07:344-352`). `extractScope` builds `notes` at `:337-339` and nothing prints them. The declared fallback (`:64`, `:303`) also picks the reading that yields the **stronger** class for `bi-18`, which is the opposite of the rule's stated direction and is the reading `04:701` needs. |
| **A-10** | **MINOR** | **Four corpus titles are inventions** — `bi-10`, `bi-11`, `bi-12`, `bi-15` diverge from `04` §1/§2. `title` is read by `titleAreas` (`:977`) into `GR5`'s forbidden set and is `GR1`-statable (`07:1127`). All four preserve the area token, so nothing moves in this run; the strings are still wrong and `bi-10`'s invented *"구조 변경"* contradicts `04`'s own body text. |
| **A-11** | **MINOR** | **Property 6 is a subset check and its coverage is uneven.** `:1433-1441` checks only listed ids; row C lists 2 of the 7 records `18:557` names; row D2 drops a pair row D1 carries on an utterance `WS3` makes identical; `04:697`'s negative half (*"34평 주방" must NOT be told `bi-14` is a 34평 flat*) is never run. At least four of the 36 *"reproduced"* pairs are the transcriber's derivation, not a stated claim. |
| **A-12** | **MINOR** | **Two of the four declared `READINGS` were chosen so that a stated answer comes out** — gap 2's (`bi-01` `fallback_from_full` in row D) and gap 6's (`bi-18` `exact` in row I). Declared in the open at `:53-65`, which is right, but property 6's agreement figure is to that extent not independent evidence. |
| **A-13** | **MINOR** | **`VB2` (`07:825-826`) and `GR1`'s non-numeric half (`07:1126-1128`) are unimplemented**, and `GR5`'s forbidden set is narrowed twice — quotients admitted only when integral (`:1001`), and a range budget contributing only `minAmount` (`:998`). All three are inert for this run. |
| **A-14** | **NOTE** | `20-pipeline-checker.md` §4's property-1 table records *"1 utterance with no `VB3` row"*; the run produces **0**. |
| **A-15** | **NOTE** | Property 4's price arm deletes `pricing.total` on `bi-09`…`bi-12` while leaving their `source: "derived"` `perArea`, which `D-1` condition 2 makes an illegal record shape. Harmless, because no in-force rule reads either field — which is also why *"0 price violations"* carries no information beyond restating `07:1119`. |
| **A-16** | **NOTE** | Six inline `04:` citations in the corpus comments are off by 1-18 lines (`:194`, `:198`, `:203`, `:207`, `:217`, `:221`); all point inside the right record block. The 11 `src:` block citations and all eight `18:` citations are correct. |

---

## 6. What this audit did **not** find

For the record, since the two previous rounds found the proof unfaithful:

- **No deferred §17.1 rule is implemented.** `PB0`, `PB0a`, `PB1`, `PB3`, `PB3a`, `PB6`, `PB6a`,
  `EF5` and the `price_fallback` class appear nowhere in the file, in any form.
- **No table is collapsed into cleverer logic.** All eight tables are encoded row by row in the
  prose's order as independent predicates, and the checker reports the whole holding set. I verified
  all 43 individual row conditions against the prose; 41 are exactly right, one (`VB3` row 5's chain
  rule) is wrong, and one (`GR3a` whole-home rung 2's sort key) is declared and unused.
- **The corpus is right on every field any in-force rule reads**, and `RD1` re-computes to the
  corpus's four derived per-area values exactly.
- **`PB4`'s area/price asymmetry is a property of the rules, not of the deletion mechanism.** The
  field names match, the deletions take effect, and the price arm is inert because `07:1119` makes
  it inert.
- **Row I / `bi-03` is a correct and valuable finding** against `18` §7, derived from the prose and
  independent of every declared reading.
