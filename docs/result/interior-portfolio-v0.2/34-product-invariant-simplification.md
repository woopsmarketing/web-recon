# 34 — Portfolio V0.2 rescue: product-invariant simplification (final report)

| | |
|---|---|
| date | 2026-09-25 |
| task | owner brief `prompt` — *PORTFOLIO V0.2 RESCUE / SIMPLIFICATION*. No round 10; the four round-9 blockers redefined as product rules; contract shrunk; checker as its executable mirror; fresh review → fix → delta review → **STOP** |
| main agent | Claude Opus 5.5 (1M). The brief asked for Fable xhigh; the session ran on the model set with `/model` |
| sub-reports | `34a-product-rules-and-hand-examples.md` (steps 1–2, with §6 † and §7 ‡ amendments) · `34c-fresh-review.md` · `34d-delta-review.md` · `proof/contract-simplified.mjs` + `.txt` |
| contract | `docs/reports/integration/07-integration-contract-v0.2-candidate.md`, **rev 9.2**. Rev 9.1 is byte-identical in `archive/07-rev9.1-corrected.md` (sha256 prefix `7f0da257546a1e03`, same as `HEAD`) |

---

## 1. Result fields

```
START_BLOCKERS                = 4   (B9-1, B9-2, B9-3, B9-4 — 32-round-9-handoff.md)

B9_4_PRODUCT_DECISION         = owner decision A, applied as stated: on a request that names rooms,
                                a partial remodel of exactly those rooms is exact; a partial sharing
                                some is overlap; a whole-home or unknown-breadth record containing
                                them is fallback (labelled, in metadata and reply); a full_remodel is
                                exact only when a whole-home remodel was asked. "욕실 하나만" is partial.
B9_4_STATUS                   = RESOLVED (EV2; VB3; D9-4 deleted). Row D: bi-15 exact · bi-04, bi-16
                                overlap · seven full remodels fallback. Rows D/G/I re-run (§19).

CINV5_OLD_GLOBAL_MONOTONICITY = RETIRED. "A record never moves down when an input is deleted" —
                                unsatisfiable (B9-1); not measured, not cited. 4a (deletion form)
                                and 4b (twin form, "0 of 798") are not reused as evidence.
CINV5_NEW_MISSING_NEUTRALITY  = PB4 is a PROPERTY of EV2/EV3 (assigns nothing): a missing input is
                                no evidence. Per query, the record's whole evaluation equals that of
                                the least favourable VALID value of the input; where none exists or
                                every valid value is positive evidence, the no-evidence value. No
                                reserved "missing" value, no exclusion, no failure statement; rank
                                may fall, never rises. CINV-5 / checker P3.
B9_1_STATUS                   = RESOLVED.

CRITERION_STATE_SINGLE_WRITER = EV1: EV2 alone writes the class, EV3 alone writes the tiers; WS6,
                                WS7a/b, WS8, GR2, GR3 and the disclosures only read.
B9_3_STATUS                   = RESOLVED by deletion: WS6 gives one Q, so D9-7a/D9-8/D9-9 and the
                                per-reading reconciliation are gone. Checker P5.

ORDERING_MODEL                = EV4: ascending ( classRank, areaRank, priceRank, −coverage,
                                styleRank, id ). Every key defined for every record; no carve-out;
                                id unique within the document is the last key.
ORDERING_TOTAL                = yes (P2: every pair decided, 31 queries × 19 + S1)
ORDERING_TRANSITIVE           = yes (P2: every triple; lexicographic over total orders)
ORDERING_DETERMINISTIC        = yes (P2: 50 seeded shuffles → one order per query)
B9_2_STATUS                   = RESOLVED.

CONTRACT_LINES_BEFORE/AFTER   = 2,971 → 1,372   (bytes 276,922 → 98,182)
RULE_IDS_BEFORE/AFTER         = declared 104 → 93 · mentioned 244 → 173
CHECKER_PROPERTIES            = 9 (P0–P8), each with CONTRACT_PROPOSITION / CHECKER_PROPOSITION /
                                SAME_PROPOSITION. 9 PASS, exit 0. Mutation-tested (§4).
HAND_EXAMPLES                 = 46 (34a §3: 10 B9-4 + 9 missing-data + 5 single-writer + 7 ordering
                                + 10 acceptance rows; §7: 5 review scenarios)

FINAL_REVIEW_MODEL            = Claude Opus 5.5, fresh context, for both 34c and 34d. Fable was the
                                preferred reviewer; the Fable run stopped on a usage limit (HTTP 429)
                                before it wrote anything.
FINAL_BLOCKERS                = 0
FINAL_MAJORS                  = 1   (34d D-1 → contract OQ-6, an owner question; not fixed, per the brief)
IMPLEMENTABLE                 = yes as written (34d: EV1–EV4 and PB4 implementable,
                                deterministic, no contradictory MUSTs) — but NOT READY: the gate is
                                BLOCKER = MAJOR = 0.

PORTFOLIO_V02_PRODUCT_RULES_SIMPLIFIED   ✔
PORTFOLIO_V02_BLOCKERS_RESOLVED          ✔  (all four round-9 blockers; final BLOCKER = 0)
PORTFOLIO_V02_IMPLEMENTATION_READY       ✘  (one MAJOR awaits the owner — §3)

NEXT_STEP                     = owner answers OQ-6 (and, optionally, OQ-1/OQ-4/OQ-5). Then ONE edit
                                pass (OQ-6's sentence + the ten 34d MINORs), checker re-run, one
                                delta review. If that is 0/0 → READY. No round numbering, no loop.
```

---

## 2. What changed, in product terms

| blocker | the product rule now | where |
|---|---|---|
| `B9-4` | A partial request is answered by the partial job asked for. A whole-home remodel is a labelled reference unless a whole home was asked. | `EV2` class table (9 rows, first match), `VB3` |
| `B9-1` | Missing data costs the evidence it would have given and nothing more. | `PB4` (property), `CINV-5` |
| `B9-3` | One function sets the class, one sets the tiers; everything else phrases them. | `EV1` |
| `B9-2` | One fixed sort key for every query. | `EV4` |

Other results of the owner's matching intent: for whole-home requests, area and total price are tiers; for partial requests, the class carries project type and rooms, and total price is compared only for an `exact` record (`OD-O`). Location weight is 0. `perArea` is not compared (`OQ-4` records the departure from the brief's "auxiliary" signal).

**Deleted, not rebuilt:** `EF1`–`EF6`, the scope-relation tables, `GR2`'s ten classes, `GR2a`, `GR3a`, `PB5`, `PB7`, `TI1`, `CINV-11`, `CINV-16`, rev 7–9.1's budget machinery, `Q-1`…`Q-34`, §19's stale worked example, and old change logs (all in the archive).

## 3. Open for the owner (contract §18)

| id | question | default in force |
|---|---|---|
| **`OQ-6`** (open `MAJOR`, `34d` D-1) | An `exact` partial job may list **trades** beyond the request, and its total is then graded against the budget as a direct answer. *"거실만 1200만원"* ⇒ `bi-17` `exact`, price `strong`, though its 12,500,000 re-floored the whole home (reproduced). Does decision A's "extra scope ⇒ overlap" cover extra trades? If not, must the reply name them beside the budget? | undecided; the contract grades the price. This is the `OD-O` trap the status file predicted (`scope satisfied ⇒ budget comparable`), reached by a new route |
| `OQ-1` | Trade-only requests: may a record with no room id be `exact`? | no. Row G leads with `bi-17`, and `bi-19` is 4th. A "yes" would also lift `bi-05`, a self-described whole-home remodel recorded with trade ids only. With no `exact`, no budget is compared on a trade-only request (D-8) |
| `OQ-2` | Whole-home request: breadth-unknown vs known partial? | tie (both `fallback`) |
| `OQ-3` | Budget only, no job named: rank by price? | no; prices are stated as facts, noted `not_applied` |
| `OQ-4` | `perArea` as an auxiliary whole-home signal? | not in V0.2 |
| `OQ-5` | Room + trade (*"욕실 타일만"*): should an unlisted trade demote a partial job? | no. Rooms decide `exact`; trades order by `coverage` |

**Open `MINOR`s (`34d` D-2…D-11), not fixed:** the no-valid-value wording in `PB4` (D-2); the wording of P3/P8's propositions overstates what they check (D-3, D-4); the §14.3.6 room disclosure lacks `WS8`'s dropped-id exception (D-5); wording of the `overlap` reason (D-6); the `VB3` phrase "only sets the context" and "34평 전체 도배" (D-7); the note/tier wording gaps (D-9); housekeeping (`ID3` not `ID1`, fixture counts, two checker defaults) (D-11). D-8 is folded into `OQ-1`; D-10 was fixed in `34a` (a doc of this task).

## 4. How it was checked (DM-1: a number is evidence only for what it measures)

- **Order of work.** Rules first (`34a` §1), then hand examples (§3), then contract, then checker.
- **One contract correction came from the checker (`34a` §6 †).** P3 failed 22 times on its first run. `coverage` credited a `full_remodel` with the rooms `PT4`(b) implies, so deleting `projectType` placed a record below every valid value it could hold: a penalty for missing data. The fix changed the definition that broke the owner's rule (`coverage` now counts listed ids only), not the rule itself.
- **Checker result, from `proof/contract-simplified.txt`:**
  - check counts: P0 17 · P1 35,337 · P2 48,051 · P3 29,253 · P4 2,502 · P5 839 · P6 1,067 · P7 38 · P8 896.
  - P3 compared 3,255 fixture deletions and 25,920 enumerated deletions, plus 7,706 inputs that are missing in the data itself.
  - Of those, 35,243 equal the least favourable valid value, and 9 are the "every valid value positive" case.
  - 1,629 have no valid value and are **counted, not asserted** (`34d` D-3).
  - Rank after deletion: down 302, unchanged 2,953, up 0. "Never rises" is asserted on the tuple.
- **Mutation test.** Four defects were put back into a scratch copy, one at a time, and each turned the checker red:
  - the trade-only `exact` clause (P3, P4, P6, P7);
  - coverage via `PT4`(b) (P3, P7);
  - an absence label (P8);
  - a rewarded missing total (P3, P7).
- **What the checker does not establish:**
  - the parser (utterance → `V`), which belongs to the consumer, `WS6`;
  - natural-language reply wording, which is reviewed, not executed;
  - `GR3`'s label text: P8 checks the checker's own label constants (D-4);
  - totality beyond the fixtures and the 5-id enumeration, which follows from the tuple's shape.
- **Reviews.**
  - `34c` found 1 `BLOCKER`, 5 `MAJOR`, 10 `MINOR`.
  - `B-1` came from a default this session chose: reading the ladder for trade-only requests, flagged to the owner but put in force. The fix applies the owner's ladder as stated.
  - `34d` found every `34c` item resolved except `M-5` (partial, wording), and one new `MAJOR`, which became `OQ-6`.
  - Both reviewers re-implemented `EV2`–`EV4` from the contract text alone and reproduced §19.

## 5. Safety and working tree

- **Start.** web-recon `git diff` sha256 = `2efea94b…3ea2a6` and boost-chat = `91637c28…b40070`. Every per-file hash in `33-` matched, so work proceeded.
- **End (node script, `fp.mjs` in the scratchpad):**
  - web-recon: 20/20 protected files match `33-` (widget-seam files, both `head-scripts.ts`, `live-e2e.json`, the V0.2 producer, the corpus).
  - boost-chat: 18/18 match (GC1 tracked files and untracked destination modules, including `built-space.ts`). Its diff is still `91637c28…`; HEAD `319774c`, branch `feat/first-party-portfolio-reader`.
  - The web-recon diff **excluding the contract** is still `2efea94b…`. The only tracked file this task changed is `07-…candidate.md`, which was intended (whole diff now `0c87a6f6…`).
- **Status doc.** `docs/status/interior-portfolio-v0.2.md` got a banner update, because the milestone state changed (CLAUDE.md).
- **Files created:** `34`, `34a`, `34c`, `34d`, `proof/contract-simplified.mjs`, `proof/contract-simplified.txt`. No git operation changed state. Nothing was committed. No `pnpm`.
- **Not touched:** BoostChat source, GC1, producer implementation, publish, production, Fuse and the widget.
- **Two changes seen, neither caused by this task:**
  - boost-chat gained two untracked paths today at 13:13 and 13:25, `docs/work/jev-decision-rfc/` and `docs/result/BOOSTCHAT-JEV-DECISION-RFC-V0.1-2026-09-25.md`. They come from another session (a JEV decision RFC) and were left alone. No protected file is affected.
  - A mid-session drift check once printed "DRIFT" for every file. The shell was at fault: zsh ties `path` to `$PATH`. A node script rerun showed no drift.

**STOP.** No round 10 was run and no next round is scheduled. The next move is the owner's answer to `OQ-6`.
