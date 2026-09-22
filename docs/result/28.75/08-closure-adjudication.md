# Task 28.75 — Phase A closure adjudication

**Verdict: the Phase A hard gate FAILS. `NOT READY - PRODUCT BLOCKERS REMAIN`.**
**Phase B (the four fresh public sites) does NOT start.** Both permitted correction cycles are spent.

Every clause below is judged against an artifact or an image, never against a report's own claim.
Where a clause could not be judged, it says so rather than guessing.

## Evidence base

| item | value |
| --- | --- |
| closure canary | 16 pairs, RUBRIC_VERSION 6, fresh self-check floors |
| linear.app | obs `2026-09-05T11-51-47-573Z` → spec `…12-07-20-025Z` → recon `…12-45-39-605Z` → QA `…12-46-21-873Z` |
| hobbang.net | recon `2026-09-05T11-06-40-264Z` → QA `…11-13-31-951Z` (self-check twin `…11-13-31-953Z`) |
| gs.severance.healthcare | recon `2026-09-05T10-23-08-511Z` → QA `…10-23-24-422Z` |
| seoultone.kr | origin returned late; run end to end — obs `2026-09-05T18-09-50-983Z` → spec `…18-16-32-275Z` → recon `…18-16-34-577Z` → QA `…18-17-56-681Z`. Both pairs **BLOCKER**. |
| machine tally | 18 pairs: BLOCKER 8 · MAJOR 6 · MINOR 4 · PASS 0 |
| independent visual tally | 18 pairs: BLOCKER 6 · MAJOR 5 · MINOR 5 · PASS 2 — 7/18 (39%) acceptable as-is |
| independent visual auditor | BLOCKER 6 · MAJOR 3 · MINOR 5 · PASS 2 (7/16 acceptable as-is) |
| independent architecture auditor | 9 VERIFIED · 3 PARTIAL · 3 N/A (Phase B never ran) · 0 fabricated claims · 0 weakened assertions |

## Clause-by-clause

| # | clause | status | why |
| --- | --- | --- | --- |
| **A** | blank content | **PARTIALLY MET** | The channel fires where it must and is silent where it must: BLOCKER `blank-region-ratio` 1.4533 on the pre-fix severance build, naming hero / NEWS / promo-carousel, and 0 on the linear `/pricing` must-not-fire controls. Severance's hero is populated at 1440 by eye, and the visual auditor — knowing none of the history — reported no blank hero for severance at any width. The seoultone leg is now measured, and it splits. The **product requirement is MET**: the independent visual auditor, looking at the images, found the doctor biography *fully present* in the clone — portrait, 김진용 대표원장 plate, education and appointment columns — and **more complete than the source**, which drops the whole 병원위치/주차안내/진료시간 column and all five 약속 bullets. The **detector requirement is not**: `blank-region-ratio` fired **BLOCKER 0.5767 @1440** on a 183px grey strip below the certificate carousel that is intentional section padding roughly 88px too tall. Screenshot wins over metric, so this is a **false positive** in the wave's flagship new channel. |
| **B** | width | **NOT MET** | `footer-clipped = 1` on linear `/` at 700, 1024 and 1100 (source 0 at all three), and on `/pricing` @1100. At 1024/1100 the clone's `contentMaxRight` is still pinned at **1838** against a source that reflows to 1527 / 1509; `scrollWidth` equals the viewport, so the excess is **clipped, not scrollable**, and the frozen layout is centred, so it is clipped on *both* sides. Confirmed by eye and independently by the visual auditor, who graded all seven intermediate-width pairs unacceptable. |
| **C** | protect | **NOT MET** | The linear half holds and improved: `/pricing` @390 and @1440 are human **PASS**, above the required PASS-or-MINOR. The hobbang half fails: the auditor graded `/` @390 **BLOCKER** and @1100 / @1440 **MAJOR**, on overlapping CJK footer link rows. Re-graded on the corrected engine, unchanged — the footer pixels are byte-identical across both builds. |
| **D** | popup | **MET** | The mechanism is verified and symmetric: the architecture auditor confirmed items 4 and 5 (one shared page-state policy, same two-call contract on the observer and QA sides). The seoultone desktop dismissal was demonstrated **on the live site** before the outage — `panelMatches 1 / qualified 1 / dismissed 1`, width coverage 0.347 → 0 after 닫기 — with zero false positives across 56 page×viewport combinations. The origin returned and the final run closes this on live evidence: `pageState qualified=1 dismissed=1` at **both** 390 and 1440 — including 1440, the wide viewport where 28.7's B6 said the normalizer was blind — from one viewport-independent rule, with the clone correctly qualifying nothing. |
| **E** | QA honesty | **PARTIALLY MET** | L1 **closed and VERIFIED**: geometry and ownership run first, and a demoted overlap can still reach the verdict through `overlap-demoted-excess-ratio`. L3 **PARTIAL**: the responsive-QA pixel gate no longer crops silently — it reports a 19-field excess band with an asserted conservation identity, and it fired for real on linear `/` @700 (700px source vs 862px clone, the 162px band 99.98% ink, only 78% of the capture ever compared) — but `src/reconstruction-qa/screenshot-diff.ts:209` still performs the same silent min-crop on a second code path. That path is documented and carries a check that fails the day it is fixed; it was left alone rather than edited under a spent budget. |
| **F** | calibration | **PARTIALLY MET** | The human half is met: **two** pairs reach human PASS (linear `/pricing` @390 and @1440). The machine half is **not**: **0 of 16** machine PASS. `pixel-residual-difference-ratio` fires MINOR on **16 of 16** pairs; its best value anywhere is **0.0152** against a 0.01 threshold — on the very pair two independent observers call PASS. The clause permits the adjudicator to explain the miscalibration instead, and the explanation is in §Blocker 4 below. |
| **G** | visual | **NOT MET** | Six BLOCKERs remain and five of them are generic, not source-specific. |

**Three clauses fail outright (B, C, G), one is met (D) and three are partial (A, E, F). The gate is not passed.**

The seoultone leg moved two clauses in opposite directions: D closed on live evidence, and A came back
*partial* rather than failed — its product requirement met by eye, its detector caught producing a false
positive. Neither could have changed the outcome, which rests on B, C and G.

## Top five remaining product blockers

Ordered by how much they cost the product. Nothing else is listed; the instruction is at most five.

### 1. The reconstruction keeps a frozen desktop canvas at intermediate widths
Generic. 5 of 6 visual BLOCKERs. linear `/` and `/pricing` at 700 / 1024 / 1100, severance at 1100.
The page lays out wider than the viewport and is clipped rather than scrolled: header nav links drop off
the right edge one at a time (at 700 the header has no controls at all), footer Connect/Legal columns
become unreachable, right-hand body copy is cut mid-sentence, and unfittable flex children collapse into
half-page voids where carousels and logo strips belong. Correction cycle 2 released exactly one width —
@700 moved 1838 → 1575 against a source at 1627 — by restoring the mobile probe. It did not release
1024 or 1100, and it could not: the desktop probe was already at 2291/2306 before the fix, so those
widths were never starved of measurement. They are **refused** by the containing-block guards, with the
reasons recorded per-population in `03-frozen-width-chain-root.md` §WIDTH-9. This is the same defect
28.7 carried as B1; it is measured far more precisely now, and it is not cured.

### 2. Overlapping CJK footer link rows
Generic (line-box and text-metric, not grid). hobbang `/` at 390, 1100 and 1440 — 1 BLOCKER, 2 MAJOR.
Labels wrap mid-word and their tails collide with the row beneath: "정부·공공" over "주소모음", "FAQ"
over "금융"; at 390 it degrades to an illegible glyph pile. Proven **not** to be a grid-track problem —
the footer pixels are byte-identical between the pre- and post-cycle-1 engines. Untouched this wave.

### 3. Only two DOM trees exist, and that is now load-bearing
Generic. The system observes a mobile tree (390) and a desktop tree (1440) and switches between them.
At 700 the source serves a third layout that neither tree contains. While the clone was frozen this was
invisible — it over-rendered, showing 8,835 chars against a source's 7,450. Now that it honestly
reflows, `missing-text-ratio` at 700 is **0.157** and at 1024 **0.121**. §6 lists this as carry-don't-block,
and that was right when the freeze was hiding it. It is no longer hidden, and it now sets a floor on how
good the intermediate widths can get.

### 4. The rubric's top band is miscalibrated, in both directions
Generic, and it damages every future judgement made with this instrument.
*Too strict:* 0 of 16 machine PASS while two independent humans pass two pairs; `pixel-residual-difference-ratio`
fires on 16/16 with a best value 1.5× its own threshold. *Wrong unit:* `missing-text-ratio` counts an
animation re-frame as content loss — linear `/` @1440 shows 432 chars "missing" and 432 chars
"extra", largely the same agent-demo panel caught at a different frame (clock 7:18 pm vs 8:51 pm),
which §1 lists as explicitly acceptable; it cost that pair a MAJOR the auditor scored MINOR.
The counts match exactly but the string sets do not (17 vs 14), and the clone-only set contains at
least two genuine text-join defects (`"intakeand integrations"`, a relocated `"40,000"`) that are
present at any animation frame. Animation phase explains much of that delta, not all of it.
*Too lenient:* the auditor's own strongest disagreement runs the other way — hobbang `/` @390 is machine
MINOR and human BLOCKER, because an 80px footer collision averaged over a 17,167px page is invisible to
a whole-page pixel ratio. *And the new channel itself false-positives:* `blank-region-ratio` called
BLOCKER on seoultone @1440 for intentional section padding ~88px too tall, on a page whose doctor
biography is fully present and more complete than the source's. §9 required that this channel never
classify intentional whitespace as a defect; on its first exposure to a page outside its fixture set, it
did. The instrument over-calls, under-calls, and mis-fires, so its verdict distribution should not be
read as a product score.

### 5. Content-node loss and asset corruption
Generic, lower blast radius but plainly visible. linear `/pricing` @1024 drops all seven customer logos,
leaving a blank band; hobbang silently drops one of eleven verification-table rows at 1100 and 1440;
severance renders six quick-menu icons as disconnected arcs and dots.

## What is explicitly NOT claimed

- **seoultone's two verdicts should not be read as fidelity measurements.** The source capture itself
  hides ~480 chars behind un-fired scroll-reveal opacity and its own largest empty band is far larger
  than the clone's (1,560px vs 208px at 390), so the clone shows *more* text than the source. The
  BLOCKERs are real — a genuine blank region and genuine overlap in the clone — but the source side of
  that comparison is compromised, in the direction that flatters the clone.
- **No claim that 28.75 made things worse overall.** It did not: severance's two 28.7 BLOCKERs are
  closed on the evidence (`overlap-excess-ratio` 0.4484 → 0.0016 @1100 and 0.3425 → 0.0012 @1440),
  linear `/` @700's overlap fell 0.4446 → 0.0045, and hobbang's self-check floor tightened from
  MINOR/MINOR/PASS to PASS/PASS/PASS. Two whole defect classes that had **no QA channel at all** in 28.7
  now have one.
- **No new research wave is proposed here.** Per §31 and §59 the program stops.
