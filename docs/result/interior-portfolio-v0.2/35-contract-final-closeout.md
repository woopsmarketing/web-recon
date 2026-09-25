# 35 — Portfolio V0.2 contract: final closeout

| | |
|---|---|
| date | 2026-09-25 |
| task | owner brief `prompt` — *PORTFOLIO V0.2 FINAL CLOSEOUT*: close `OQ-6` and `OQ-1`…`OQ-5` as owner decisions, fix `34d`'s ten minors in one edit pass, run the checker once, get one delta review, and commit only if READY |
| main agent | Claude Opus 5.5 (1M) |
| inputs read first | `34-product-invariant-simplification.md`, `34d-delta-review.md`, `33-working-tree-fingerprint.md` |
| sub-report | `35a-closeout-delta-review.md` (fresh-context delta review) |
| contract | `docs/reports/integration/07-integration-contract-v0.2-candidate.md`, **rev 9.2.1** (§18 owner decisions, §20.10 change log) |

---

## 1. Result fields

```
OQ_6_DECISION   = An exact room match stays exact: a partial_remodel whose rooms equal the rooms
                  asked for is not demoted because it lists trades the visitor did not name. Extra
                  trades are supporting information. When the reply sets such a record's total
                  beside the budget, disclosure is MANDATORY: it names the extra trades from
                  workScopeIds, says the total includes that work, and never presents the total
                  as a 1:1 quote for the requested scope or as the budget being met. No trade-extent
                  schema is added, and where a trade ran is not guessed.
OQ_6_STATUS     = CLOSED (owner decision). Contract §14.3.6 "Extra trades beside a budget",
                  EV3's price justification, CINV-25, §18.

OQ_1_STATUS     = CLOSED — trade-only request: no record without a room id is promoted to exact.
                  Recorded consequence: no budget is compared on a trade-only request (CINV-15).
OQ_2_STATUS     = CLOSED — whole-home request: breadth-unknown and known partial are both fallback.
OQ_3_STATUS     = CLOSED — budget only, no job named: no ranking by price.
OQ_4_STATUS     = CLOSED — perArea is not used in V0.2 ranking.
OQ_5_STATUS     = CLOSED — room + trade: a trade difference alone never demotes an exact room match;
                  trades are a coverage and explanation signal.

DELTA_MINORS_FIXED  = 10 of 10 (D-2…D-11; D-10 was already fixed and is confirmed, not re-edited).
                      35a: every one closed.
CHECKER_PROPERTIES  = 9 (P0–P8)
CHECKER_PASS        = 9 / 9, exit 0 — ONE run after the edit pass. The review's own re-run
                      reproduced the saved output byte for byte.

FINAL_REVIEW_MODEL  = Claude Opus 5.5, fresh context. Fable was tried first, as the brief
                      prefers; it stopped on its usage limit (HTTP 429) before writing anything,
                      so the Opus run is the one delta review.
FINAL_BLOCKERS      = 0
FINAL_MAJORS        = 0
FINAL_MINORS        = 6 (F-1…F-6, wording and housekeeping; listed in §3, not fixed, no further loop)

CONTRACT_REVISION   = rev 9.2.1
CONTRACT_READY      = YES (BLOCKER = 0, MAJOR = 0 — 35a)

PROTECTED_WEB_RECON_FILES_DRIFT = 0 (20/20 match 33-)
PROTECTED_BOOSTCHAT_FILES_DRIFT = 0 (18/18 match 33-; boost-chat diff 91637c28… unchanged)

PRODUCTION_TOUCHED        = NO
BOOSTCHAT_SOURCE_TOUCHED  = NO

CHECKPOINT_COMMIT   = the commit that adds this file: "docs(contract): finalize portfolio v0.2
                      contract rev 9.2.1 (READY)". Only the files listed in §5 are staged.

NEXT_STEP           = GC1 landing

PORTFOLIO_V02_CONTRACT_READY   ✔
BLOCKER_0                      ✔
MAJOR_0                        ✔
READY_FOR_IMPLEMENTATION       ✔
```

---

## 2. What the edit pass changed

**No evaluation result changed.** Every class, tier, order and §19 acceptance row is what rev 9.2
produced, and checker P7 re-executes them. What changed is what the reply must say, and how honest
the checker's claims are.

| item | change |
|---|---|
| `OQ-6` | new disclosure bullet in §14.3.6, with the owner's allowed and forbidden sentences. `EV3`'s justification for comparing prices only inside `exact` now reads "remodelled exactly the rooms asked for", not "the kind of job asked". Fixture `CINV-25`: *"거실만 1200만원"* × `bi-17` ⇒ `exact`, price `strong`, and the disclosure names 바닥 (flooring) and says the total includes it |
| `OQ-1`…`OQ-5` | §18 is renamed *Owner decisions — closed*. None is open |
| `D-2` | `PB4` item 2: where no valid value exists, it asks nothing beyond `EV2`/`EV3`; where every valid value is positive evidence, only the fed tier takes its last value |
| `D-3` | checker P3 says plainly that no-valid-value cases are **counted, not asserted**. Its domain gap is also fixed: a typed value is valid for a dropped-id record, because the dropped id may be a room. The count fell from 1,629 to 480, and the difference is now asserted |
| `D-4` | P8's proposition says it checks the checker's own copy of `GR3`, not the contract text |
| `D-5` | room disclosure: only for a `partial_remodel` from which no id was dropped (`WS8`) |
| `D-6` | the `overlap` reason is stated from recorded ids only, never where a trade ran; a dropped-id record says its scope could not be read in full |
| `D-7` | `VB3`: a restriction always wins; *집 전체 도배* and *34평 전체 도배* are trade statements, not whole-home |
| `D-8` | trade-only ⇒ no budget comparison, recorded in `OQ-1` and `CINV-15` |
| `D-9` | `GR2` notes cover area and budget only; §12's kind-less total is `missing` only where the tier applies; "inside the budget" wording for meeting intervals; a value is stated only if the record has one |
| `D-11` | `EV4` cites V0 `ID3`; fixture counts are printed from the data; `CINV-24(b)` label fixed; the checker's two unstated defaults are removed (unknown area unit ⇒ `missing` per §12; currencies compared strictly) |

**Size:** contract 1,372 → 1,412 lines (2,971 before the rescue); declared rule ids 93 → 94 (new `CINV-25`).

## 3. Residual minors (35a) — listed, not fixed

The brief says a new wording-only minor that doesn't block product meaning or implementation
safety is listed, not fixed, and triggers no further loop. The reviewer classed all six that way.

| id | residual |
|---|---|
| F-1 | Does the reply still state the budget tier in words when the extra-trade caveat applies? "Inside the budget" (Tiers bullet) sits beside "not as the budget being met" (`OQ-6` bullet). The caveat is mandatory either way |
| F-2 | **For the owner, not a violation.** Two cases fall outside the `OQ-6` trigger: (a) a *requested* trade whose recorded extent may exceed the requested room (*"바닥이랑 거실만 1200만원"* × `bi-17`); (b) a price question with no budget stated (*"거실만 하면 얼마예요"*). Widening the trigger is one phrase if the owner wants it |
| F-3 | `EV3`'s rewritten price justification does not describe row 4 (partial request naming no room); results unaffected |
| F-4 | "unless the record states it" gives the no-guessing rule an exception with nothing to point at; it should be deleted |
| F-5 | §12 both drops and keeps a record whose total has no `kind`. Pre-existing, committed text; only a non-conforming producer can emit it |
| F-6 | housekeeping: the header cites §20.9 where §20.10 is meant; a §20.9 history row says "P8 checks the labels"; `CINV-17` lacks the dropped-id exception; `CINV-25` is out of numeric order; two checker details on inputs the data never reaches |

## 4. Checker — what each number measures (DM-1)

- **Counts:** P0 19 · P1 35,337 · P2 49,601 · P3 29,360 · P4 2,508 · P5 866 · P6 1,130 · P7 38 · P8 927 checks. All PASS.
- **P3.** 36,535 missing-input cases equal the least favourable valid value, and are asserted. 9 are "every valid value positive ⇒ the fed tier at its last value", also asserted. 480 have no valid value and are counted, **not asserted**, because the contract asks nothing there. Rank after deletion is reported, not asserted.
- **P6 (OQ-6 half).** Checks the checker's disclosure step: 7 exact part-mode records with a budget, plus the `CINV-25` fixtures. The reply's natural-language wording is the consumer's, and was reviewed (35a), not executed.
- **P8.** The label checks test the checker's transcription of `GR3`. It is a narrower proposition, and the output says so.

## 5. Working tree and the checkpoint commit

- **Start of closeout.**
  - Protected files: web-recon 20/20 and boost-chat 18/18 match `33-`.
  - boost-chat diff: `91637c28…`, unchanged.
  - web-recon diff: excluding this task's two tracked files, it equals `33-`'s `2efea94b…`.
- **Staged explicitly** — no `git add .`, no product or widget files:
  - `docs/reports/integration/07-integration-contract-v0.2-candidate.md`
  - `docs/status/interior-portfolio-v0.2.md`
  - `docs/result/interior-portfolio-v0.2/33-working-tree-fingerprint.md` — the fingerprint these reports cite as authority; a portfolio v0.2 document, not a product file
  - `docs/result/interior-portfolio-v0.2/34-product-invariant-simplification.md`, `34a-…`, `34c-…`, `34d-…`, `35-…` (this file), `35a-…`
  - `docs/result/interior-portfolio-v0.2/proof/contract-simplified.mjs`, `proof/contract-simplified.txt`
- **Left unstaged, as they were:**
  - `data/sites/…`, `platform/**`, `templates/**` (V0.2 producer, demo corpus, widget-seam);
  - both `head-scripts.ts`;
  - `docs/result/static-deployment-foundation/**`;
  - `prompt` (gitignored).
- **After the commit,** the remaining unstaged web-recon diff should hash to `33-`'s `2efea94b…` — exactly the pre-existing product and widget work. The CLI output reports that check.
- **boost-chat:** read only (fingerprint). Two untracked RFC documents from another session (seen in `34-`) were left alone.
- **Not touched:** production, publish, Fuse, the widget, BoostChat source (GC1 included), producer and consumer implementation.

**STOP.** No new round. Next: GC1 landing.
