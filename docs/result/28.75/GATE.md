# Task 28.75 — Phase A hard gate

> **RESULT: GATE FAILED.** Three clauses NOT MET (B, C, G), one MET (D), three PARTIAL (A, E, F).
> Both correction cycles spent. Phase B did NOT start. See `08-closure-adjudication.md`.

The gate is checked once, after every Phase A lane has frozen and the 18-pair closure
canary has been re-run under the final rubric with freshly recomputed self-check floors.
All seven clauses must be true. A clause is judged against an artifact or an image, never
against a report's own claim.

| # | Clause | Evidence required | Status |
|---|--------|-------------------|--------|
| **A** | **BLANK CONTENT** — the blank-region channel fires on the known broken pre-fix examples and is silent on the clean linear `/pricing` controls; and in the FINAL clone, severance's major hero is not blank @1440 and seoultone's doctor biography region is not blank @1440. | `01-blank-region-channel.md` acceptance table + the two final composites, read by eye | **PARTIAL** — product requirement met by eye (doctor bio fully present, richer than source); detector FALSE-POSITIVED on seoultone @1440 |
| **B** | **WIDTH** — linear `/` has `footer-clipped = 0` at 700, 1024 and 1100, with no major right-edge clipping of hero, navigation, body text or footer; linear `/pricing` @1100 keeps Enterprise content reachable. | closure canary channel readings + the four composites | **NOT MET** — footer-clipped=1 at 700/1024/1100; clone canvas pinned 1838 |
| **C** | **REGRESSION** — linear `/pricing` @390 and @1440 remain human PASS or MINOR; hobbang body stays human-acceptable. | independent visual auditor's grades on the 18-pair pack | **NOT MET** — linear /pricing PASS/PASS; hobbang 390 BLOCKER, 1100/1440 MAJOR |
| **D** | **POPUP** — the SeoulTone desktop popup is normalized, and observer and QA use a consistent page state. | `04-popup-capture-consistency.md` both-viewport records + seoultone @1440 composite | **MET** — verified & symmetric; live seoultone popup dismissed at BOTH 390 and 1440 |
| **E** | **QA** — no known L1/L3 false direction remains. | `05-qa-width-overlap-honesty.md` + mutation proof that the branch can affect a verdict | **PARTIAL** — L1 closed; L3 closed in responsive-QA, screenshot-diff.ts:209 still crops |
| **F** | **CALIBRATION** — at least TWO Phase-A pairs receive human PASS, and at least ONE easy/static pair receives machine PASS (or the adjudicator explains why the machine top band remains miscalibrated). | visual auditor tally + closure canary verdicts | **PARTIAL** — 2 human PASS met; 0/16 machine PASS, explained in 08 |
| **G** | **VISUAL** — no generic BLOCKER remains across the 18-pair closure pack. Source-specific dynamic limitations may remain ONLY if the page stays professionally usable and the limitation is explicitly visible to the human reviewer. | visual auditor's per-pair grades + the adjudicator's generic-vs-source-specific split | **NOT MET** — 6 BLOCKERs, 5 of them generic |

## Correction budget

If the gate initially fails: **maximum 2 targeted correction cycles**, each aimed at ONE
proven generic failure class. No new speculative subsystems. After two cycles, if still
failing: STOP, write `NOT READY - PRODUCT BLOCKERS REMAIN`, and list **no more than the top
five** remaining product blockers. Do not propose another large research wave.

## On PASS

Do NOT stop. Print `CORE OUTCOME GATE PASSED → STARTING FRESH FOUR-SITE VALIDATION` and begin
Phase B automatically. No user intervention.
