# 35a — Closeout delta review of contract rev 9.2.1

| | |
|---|---|
| reviewer | fresh-context closeout delta (no involvement in the contract, its rounds, its checker, `34c`, `34d` or the closeout edit) |
| model | Claude Opus 5.5 (1M context), `claude-opus-5-5[1m]` |
| date | 2026-09-25 |
| scope | the rev 9.2 → 9.2.1 edit pass only: `OQ-6`, `OQ-1`…`OQ-5`, `34d` `D-1`…`D-11`, and any new defects the pass introduced |
| requirements used | owner closeout brief `prompt` §1 (`OQ-6`), §2 (`OQ-1`…`OQ-5`) and §3 (the minors) |
| method | Read-only. I re-ran the checker: exit 0, 9/9 PASS, output byte-identical to the saved `.txt`. I wrote a scratch re-implementation of `EV2`–`EV4` and the `OQ-6` trigger **from the contract text alone**, without the checker's functions, and used it to probe the disclosure (§4) |

Line references: `07` = the contract (1,412 lines), `mjs`/`txt` = the checker and its output, `prompt` = the owner brief, `34a`, `pj` = `projects.json`.

---

## 1. OQ-6: verdict

**Reflected exactly.** Each part of the owner decision (`prompt:35-103`) is in the contract:

| owner requirement | where | status |
|---|---|---|
| an exact room match is never demoted for extra trades | `EV2` row 6 is unchanged: `R_s = Q_s`, trades not tested (`07:881`). "Rooms decide `exact`; trades never do" (`07:899`). `§18` `OQ-6` (`07:1305`) | ✓ |
| the extra trades are named from record data | "names those trades, from `workScopeIds` only" (`07:1074`) | ✓ |
| the reply says the total includes them | (2) at `07:1075` | ✓ |
| the total is never presented as a 1:1 quote for the requested scope | (3) at `07:1075-1076`. The owner's allowed and forbidden sentences are quoted verbatim (`07:1077-1080`) | ✓ |
| the tier may still be computed, and the total is still a fact | "the tier is computed all the same, and the reply must say so" (`07:948-949`); the total is stated as a fact (`07:1067`) | ✓ (see F-1 for how the tier words and the caveat interact) |
| no trade-extent schema | none added. §17.2's closed-trade deferral predates this pass | ✓ |
| where a trade ran is never guessed | "never says where in the home such a trade ran" (`07:1076`) | ✓ (F-4: the "unless the record states it" clause is loose) |
| recorded as a CLOSED owner decision | `§18` "Owner decisions — closed … None is open" (`07:1292-1305`) | ✓ |

**Does the disclosure prevent a misleading budget comparison?** Yes, for everything the structured data records. An `exact` record in mode `part` has no extra rooms (`R_s = Q_s`) and no dropped id (row 6). The only recorded work outside the request is therefore a `Works` id outside `Q`, and that is exactly what the trigger names. A trade the record does not list is *unknown* (`WS7a`), so it cannot be named. The other shapes are also covered:

- A range total uses the same trigger.
- A record with a dropped id is never `exact`, so its total is never compared.
- Mode `open` and every non-`exact` class are `not_applied` and are said to be "not compared".
- Mode `whole` is outside the owner's scope ("exact partial record"), and `PT2` (spaces, not trades) covers it.

Two nearby cases fall outside the owner's trigger. Neither violates the decision, and both are listed as F-2 so the owner can see them.

---

## 2. OQ-1…OQ-5

| id | brief (`prompt`) | contract `§18` | status |
|---|---|---|---|
| `OQ-1` | a record with no room info is not promoted to `exact` on a trade-only request; keep the default (`:112-116`) | "**No.** A trade-only request has no `exact` (`EV2` row 6) … no budget is compared on a trade-only request (`CINV-15`)" (`07:1300`) | CLOSED, matches the kept rev 9.2 default |
| `OQ-2` | on a whole-home request, breadth-unknown and known partial are both `fallback` (`:118-121`) | "**No** — both `fallback`, a tie" (`07:1301`) | CLOSED, matches |
| `OQ-3` | a budget alone does not rank by price (`:123-126`) | "**No.** Prices are stated as facts, noted `not_applied`" (`07:1302`) | CLOSED, matches |
| `OQ-4` | `perArea` is not used in ranking (`:128-130`) | "**Not in V0.2.**" (`07:1303`) | CLOSED, matches |
| `OQ-5` | a trade difference does not demote a room-exact record (`:132-137`) | "**No.** Rooms decide `exact`; trades order by `coverage` and are explained" (`07:1304`) | CLOSED, matches |

A grep for `OQ-`, "open", "default", "pending" and "owner question" finds no OQ still described as open. The remaining `OQ-1` mentions (`07:204`, `07:907`, `07:1273`, `07:1325`) are cross-references.

---

## 3. Status of the `34d` findings

| id | sev (34d) | status | evidence |
|---|---|---|---|
| **D-1** | MAJOR | **CLOSED** by owner decision `OQ-6` | §1 above. The disclosure is at `07:1072-1080`. `EV3`'s justification now says "remodelled exactly the rooms asked for" (`07:946`). New `CINV-25` (`07:1201`). My re-implementation agrees: "거실만 1200만원" gives `bi-17` `exact`, `strong`, extra `flooring`; "현관만 600만원" gives `bi-18` `exact`, `strong`, extra `built_in_furniture`. Residuals: F-1, F-2, F-4 |
| D-2 | MINOR | CLOSED | `PB4` item 2: when no valid value exists, it "asks nothing beyond `EV2` and `EV3` as written; items 1, 3 and 4 still hold" (`07:1003-1005`). `CINV-5`: "nothing is compared (`PB4` 2)" (`07:1186`) |
| D-3 | MINOR | CLOSED (checker) | The CHECKER_PROPOSITION says the empty-`validFills` cases are "COUNTED, NOT ASSERTED", with `bi-05`/`bi-19` given as examples of that case (`mjs:420`). SAME_PROPOSITION: "not evidence of a pass" (`mjs:421`). The domain gap is fixed: a dropped id now admits a `projectType` (`mjs:377`), which takes the count from 1,629 to 480 (`txt:29`, and I traced the arithmetic: 32×3 fixture + 96×4 enumerated). Residual: the §20.9 history row still carries the old wording → F-6(b) |
| D-4 | MINOR | CLOSED (checker) | P8 SAME_PROPOSITION: "narrower — … the checker's own transcription of GR3 … not the contract's text" (`mjs:656`, `txt:89`). Recorded in §20.10 (`07:1404`). Same §20.9 residual → F-6(b) |
| D-5 | MINOR | CLOSED | "For a `partial_remodel` from which no id was dropped (`WS8`)" (`07:1054-1055`). Residual: `CINV-17` → F-6(c) |
| D-6 | MINOR | CLOSED | `overlap` reasons are "stated from its recorded ids only … the rooms it remodelled — never where a trade was done". A dropped-id record's reason is that "its recorded scope could not be read in full" (`07:1043`) |
| D-7 | MINOR | CLOSED | "that only sets the context" is deleted; "A restriction always wins over a whole-form, because row 2 is tried first". "34평 전체 도배" is listed in the trade carve-out (`07:842-845`) |
| D-8 | MINOR | CLOSED | Recorded as the `OQ-1` consequence (`07:1300`) and in `CINV-15` (`07:1196`) |
| D-9 | MINOR | CLOSED | `GR2` notes cover area and budget only, and style/coverage carry none (`07:1029-1035`). §12: "noted `missing` where the price tier applies, `not_applied` where it does not" (`07:709-710`). Meeting intervals are said as "inside it" (`07:1063`). The record's value is stated "if it has one" (`07:1064-1065`) |
| D-10 | MINOR | CONFIRMED, not re-edited | `34a:60` carries "‡ Superseded by contract `PB4`…" |
| D-11 | MINOR | CLOSED | `EV4` cites V0 `ID3` (`07:970`). P2 prints the fixture count, 32 (`mjs:343`, `txt:19`). The `CINV-24(b)` label is fixed (`mjs:649`). An unknown record unit now gives `missing` (`mjs:131`), which is what `GR2` states (`07:1032`), and there is no currency default. Residual: F-6(e) |

---

## 4. New findings

| id | sev | location | defect | failure scenario | minimal fix |
|---|---|---|---|---|---|
| F-1 | MINOR | `07:1061-1066` (Tiers), `07:1067-1069` (Budget "may"), `07:1072-1080` (`OQ-6`), `07:1201` (`CINV-25`) | Nothing says which rule wins when a record triggers the extra-trade disclosure. The Tiers bullet requires the tier in words ("inside it" when the intervals meet). `OQ-6` (3) says "never … the tier as the budget being met". The contract's own `OQ-6` example reply gives no tier words at all. The trigger is also phrased on an optional act ("sets the total beside the budget", `07:1068` "may") | "거실만 1250만원" or "거실만 1000~1300만원" × `bi-17`: the price tier is `strong` because the intervals meet (checked). Implementer A says "예산 범위 안입니다" plus the caveat; implementer B follows the example and omits the tier. A `CINV-25` test ("never says the total fits the budget") passes B and fails A. Both replies keep the mandatory caveat, so neither is a misleading comparison. The divergence is in wording and conformance tests only | Add one sentence to the `OQ-6` bullet: "Here the budget's tier words are given, if at all, only after (1) and (2), and a meeting interval is never said as the budget being met." Phrase the trigger as "whenever the reply states the total of such a record to a visitor who stated a budget" (the Budget bullet already makes stating it mandatory) |
| F-2 | MINOR (owner-visible residual; not a violation) | `07:1072-1073` (trigger), `07:366-368` (`WS7a`), `pj` `bi-17` summary ("거실 벽면과 **집 전체 바닥**만"), `bi-18` summary ("복도에 붙박이 수납장") | Two uncaveated cases sit next to the `OQ-6` trigger. The owner scoped the trigger to trades the visitor did *not* name and to a total set beside a budget, so both are outside it. (a) A **requested** trade whose recorded extent may exceed the requested room. (b) A **price question with no budget** | (a) "바닥이랑 거실만 1200만원" (row H plus a budget) or "거실 바닥만 1200만원" × `bi-17` gives `strong` with no disclosure, because `flooring ∈ Q`, though the total covers whole-home flooring. "현관 수납 600만원" × `bi-18` gives `strong` with no disclosure, and the total includes the 복도 built-in. (b) "거실만 하면 얼마예요" (row C's form) × `bi-17` is a direct answer whose 12,500,000 is stated as a fact, and no rule makes the reply mention the flooring. The mitigations are `TP2` ("never a quote", `07:523`) and the titles, which here name 바닥/수납장 | No change is needed for READY: the contract implements the owner's trigger exactly, and the owner forbade guessing extent. If the owner wants it closed, one phrase would do it without guessing: fire the disclosure "whenever the reply states the total of an `exact` part-mode record that lists any `Works` id". For a requested trade, say "where this work ran is not recorded" |
| F-3 | MINOR | `07:945-947` vs `07:879` (row 4) | The rewritten price justification ("the whole-home remodel asked for, or remodelled exactly the rooms asked for") does not describe row 4. In mode `part` with `Q = ∅`, every `partial_remodel` is `exact` and is compared, although no rooms were asked for | "부분 리모델링 1300만원": `bi-17` `strong`, `bi-14` `acceptable`, `bi-15`/`bi-16` `none`, all compared (checked). A reader who takes the prose for the rule could skip them. The `EV3` table (`07:925`) is unambiguous, so no result changes | Append "or, when no room was named, a partial job on a partial request (row 4)" |
| F-4 | MINOR | `07:1076-1077` vs `07:1043`; `prompt:98-101` | "unless the record states it (`WS7a`)" has no referent. No V0.2 field records where a trade ran, `WS7a` does not define one, and `GR3`'s `overlap` row says "never where a trade was done" with no exception. The owner's bar is *structural* proof | An LLM consumer reads `bi-17`'s title "거실과 바닥 교체" as the record stating where the flooring was laid and says "거실 바닥 공사를 포함". That is the extent guess the owner forbade | Delete "unless the record states it (`WS7a`)" |
| F-5 | MINOR (pre-existing, already in committed HEAD `07:734/743`; not introduced by this pass) | `07:697-698` vs `07:706-707` | §12's record-level drop list includes "`pricing.total` missing `kind`" (drop the record). The unknown-value paragraph says a total "whose `kind` is missing or unrecognised" is treated as absent and "the rest of the record … survives" | For a document with a kind-less total, consumer A drops the record from every ranking and consumer B keeps it with price `none`. Only a non-conforming producer can emit this (`INV-23`, `VA1`), and neither behaviour states a wrong price | Delete "`pricing.total` missing `kind`," from the drop list. The later paragraph matches `PB4`'s "no exclusion" |
| F-6 | MINOR (housekeeping) | see text | (a) `07:7` says the minors were fixed in "§20.9"; they are in §20.10. (b) The §20.9 `M-5` row (`07:1383`) still reads "`P3` checks records whose inputs are natively missing … `P8` checks the labels", which is the overclaim `D-3`/`D-4` named. It is qualified only at `07:1388-1390` and in §20.10. (c) `CINV-17` (`07:1198`) states "a room a `partial_remodel` does not list **was not remodelled**" without the `WS8` exception that `07:1054-1055` now carries (`CINV-9` covers it). (d) `CINV-25` sits between `CINV-19` and `CINV-20`. (e) Checker: `disclose()` emits the `OQ-6` tokens even when the record has no total (`mjs:207`). An unrecognised `total.kind` gives tier `none` with no note (`mjs:137-145`, `mjs:157`), where §12/`GR2` give `missing`. Neither input is reached by the corpus or S1 | A literal `CINV-17` test fails on a dropped-id record. A reader of §20.9 alone takes P8 PASS as evidence for `GR3`'s text | (a) → "§20.10". (b) Add "(overstated; see §20.10)" to that row. (c) Add "from which no id was dropped (`WS8`)". (d) Move the row. (e) Gate the `OQ-6` tokens on `R.total`, and return `missing` when `interval(total)` is null |

**No BLOCKER and no MAJOR.** None of the findings above changes a class, a tier or an order, and none violates an owner decision.

---

## 5. What I checked

- **Requirements.** `prompt` §1–§6. Each OQ was checked against its brief line (§1, §2).
- **Contract.** Read all 1,412 lines of `07`, closely at §12, §14.3 (`VB3`, `EV1`–`EV4`, `PB4`, `GR2`/`GR3`, every §14.3.6 bullet), §15, §16, §18, §19 and §20.9–§20.10. Every row of §20.10 was verified against the text rather than trusted. I grepped for `OQ-*`, "open"/"default"/"pending", §20.9/§20.10, `CINV-*` numbering, `ID1`/`ID3` (checked against `02:350-352`) and "may set the total", and read each hit in context.
- **Checker.** Read `mjs` in full and re-ran it: exit 0, 9/9 PASS, byte-identical to `txt`. For P3, P6 and P8 I compared the CONTRACT_PROPOSITION, the CHECKER_PROPOSITION and the code. P6's `OQ-6` half recomputes the checker's own formula and says so ("checks the checker's disclosure step, not the reply's wording"). No PASS is presented as evidence for more than it measures, apart from the §20.9 history row (F-6b). The only checker-side policy the contract does not state is F-6(e), on unreached inputs.
- **Independent implementation** (scratch file, from `07` alone). It reproduces the §19 top three for rows A, B, C, D, F, G (with `bi-19` 4th), H and I, and the `CINV-25` fixture.
  - *Probes:* 13 utterances covering an exact, range and max budget, meeting and gap tiers, mode `part` with `Q = ∅`, breadth absent, no budget, trade-only and mode `whole`.
  - *Sweep:* every part-mode `Q` of up to 3 corpus ids × {partial, absent} with a budget. Compared `exact` pairs: 118 with an extra listed trade (`bi-17` `flooring`, `bi-18` `built_in_furniture`), and the trigger fires on every one; 32 where the only listed trade was requested (`bi-17`, `bi-18`), where no disclosure applies (F-2a); 169 with no listed trade.
- **Determinism.** The `OQ-6` trigger is a pure function of `V` and `R`. The `EV2` table, the `EV3` tier table and the `EV4` tuple are textually identical to the anchors `34d` reviewed, and my independent results match the checker's. The §20.10 claim of "no change to `EV2`–`EV4`'s results" holds.
- **Data.** Read `bi-17`'s and `bi-18`'s titles and summaries in `projects.json` (F-2, F-4).
- **Not checked.** No rev 9.2 copy of `07` exists (HEAD holds rev 9), so the pre-edit comparison relies on `34d`'s quotes and line references. BoostChat was not opened. §5–§11 (producer) were read as context only. `35-contract-final-closeout.md`, cited at `07:1397`, does not exist yet.

---

**BLOCKER = 0 · MAJOR = 0 · MINOR = 6**

**READY: yes.** BLOCKER and MAJOR are both 0. `OQ-6` is implemented exactly as the owner decided, `OQ-1`…`OQ-5` are recorded as closed, and `D-1`…`D-11` are closed (`D-10` confirmed). `EV1`–`EV4` and `PB4` remain deterministic and implementable. The six MINORs are wording, housekeeping, one pre-existing edge case and one owner-visible residual (F-2), none of which blocks.
