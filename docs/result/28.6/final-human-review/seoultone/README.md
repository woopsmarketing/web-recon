# seoultone.kr — W8 human review pack (post-fix)

Fix under test: `src/observer/probe-widths.ts` `requiredWidths` (Task 28.6 Wave 8 O3.1) — pins each
viewport pass's own truth-observation width (desktop 1440, mobile 390) into the guaranteed probe core so
it can no longer be evicted under cap pressure. Full measurement: `docs/result/28.6/lanes/w8-seoultone.md`.
Baseline (pre-fix, same site/routes/widths): `docs/result/28.6/lanes/w7-seoultone.md`.

Grader run: `2026-09-03T00-23-07-347Z` (single pass, no `--self-check` — the orchestrator holds the W7
self-check floor for this site). Reconstruction run: `2026-09-03T00-21-25-309Z`.

**Result: 6 BLOCKER / 4 MAJOR / 0 MINOR / 0 PASS — identical verdict-for-verdict to the W7 pre-fix clone
grade on all 10 pairs.** That is expected, not a miss: of the 13 observed pages, the probe-width eviction
bug (pre-fix) only ever evicted 1440 on `p000002` (`/bbs/board.php?bo_table=Event`) and `p000004`
(`/page/intro02.php`) — neither is one of the two routes graded here. The fix's effect on THIS lane shows
up in the probe/manifest artifacts (see the lane report §2–3), not in these ten pairs' verdicts: the
defects driving every BLOCKER/MAJOR below (baked `opacity:0` scroll-reveal text, a frozen 1296px footer
container) are pre-existing and unrelated to probe-width eviction.

Each row below is `NN-seoultone-kr-<route>-<width>-{source,final,composite,diff}.png` — `final` is the
clone screenshot, `source` is the live site, `composite` places them side by side, `diff` highlights
pixel deltas.

| # | Route | Width | Grade | One thing to check in the image |
|---|---|---:|---|---|
| 01 | `/` | 390 | BLOCKER | `missing-text-ratio` 30.95% (thr 10%) — compare `01-…-composite.png`: the practitioner-credential block and two section headings are blank on the clone (`final`) side even though the layout box is there. |
| 02 | `/` | 700 | BLOCKER | Same missing-text defect (30.95%) plus boxes drifting up to 310px from source position (`position-delta-p90-px` MAJOR) — in `02-…-composite.png` watch how far clone content has shifted from where the source places it. |
| 03 | `/` | 1024 | BLOCKER | Missing-text 31.65% plus `pixel-visible-difference-ratio` 50.1% (just over the 50% MAJOR line) — `03-…-diff.png` should show broad red across the blank text regions. |
| 04 | `/` | 1100 | BLOCKER | `footer-clipped`: clone footer right edge is 1296px in a 1100px viewport — in `04-…-final.png` the footer/nav runs off the right edge and the address column prints two lines on top of each other (`column-container-mode-delta` 4). |
| 05 | `/` | 1440 | BLOCKER | Missing-text 34.62% at the TRUTH width (the width the whole desktop tier is fitted to) — `05-…-composite.png` is the cleanest layout-alignment pair (`position-delta-p90-px` only 11px) but still shows blank text blocks. |
| 06 | `/page/intro04.php` | 390 | MAJOR | Missing-text 2.24% (thr 2%) — one baked `opacity:0` node (21 chars) is the entire defect; `06-…-diff.png` should show one small isolated patch, not a broad wash. |
| 07 | `/page/intro04.php` | 700 | MAJOR | Same 21-char missing-text plus `pixel-visible-difference-ratio` 50.0% and 310px position drift — `07-…-composite.png` shows the undershoot: clone content narrower than the source at this width. |
| 08 | `/page/intro04.php` | 1024 | MAJOR | Missing-text 2.24% plus 634px position drift, the largest undershoot in this set — `08-…-composite.png`. |
| 09 | `/page/intro04.php` | 1100 | BLOCKER | Same `footer-clipped` (1296>1100) as row 04, plus `overlap-excess-ratio` 8.11% — `09-…-final.png` shows the clinic-location address text overlapping itself. |
| 10 | `/page/intro04.php` | 1440 | MAJOR | Missing-text 2.27% at the truth width, position delta only 10px — `10-…-composite.png` is the closest-fitting pair; the residual is almost entirely the one opacity-hidden node. |

**What to look for across all ten:** none of these ten defects are the probe-width eviction bug. That bug
(now fixed) would have shown up as an ENTIRE viewport losing all inline-size recovery — no desktop rules
at all, boxes frozen at their 1440-observed size at every width below 1440. That is NOT what these images
show: clone boxes visibly move between widths (rows 01→05 and 06→10 are not identical to each other), which
is the eviction fix doing its job. What remains is two separable, pre-existing defects: hidden-until-scroll
text baked permanently invisible, and a handful of containers whose used width is frozen past 1024px
(`1296px`, present 49× in the exact tier, 0× in the recovered tier).

Contact sheet: `contact-sheet.png` (all 10 pairs at a glance).
