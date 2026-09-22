# Human Visual Review — www.xn--ok0b408a79cba430b.net (wix-idn), Wave 8

Source responsive-qa run: `data/www.xn--ok0b408a79cba430b.net/responsive-qa/2026-09-03T00-23-53-218Z/`
(mode: clone, no `--self-check`; widths 390/700/1024/1100/1440, routes `/` and `/link`)

Full detail: `docs/result/28.6/lanes/w8-wix-idn.md`.

Each pair has 4 images: `-source` (live site), `-final` (clone), `-composite` (side-by-side),
`-diff` (pixel diff). `contact-sheet.png` is the full grid overview.

## `/` (homepage)

| width | grade | what to look at |
|---|---|---|
| 390 | BLOCKER | Only 12 of the source's 24 images render in the clone (50%) — scan the composite for gaps where a card/photo should sit. |
| 700 | BLOCKER | 951 characters of clone text start past the right edge (scrollWidth mismatch) — check the diff for a horizontal cut-off band. |
| 1024 | BLOCKER | Clone footer's right edge sits at x=1440 inside a 1024px viewport — footer visibly overruns/clips in the composite. |
| 1100 | BLOCKER | Same footer overrun as 1024, now against a 1100px viewport. |
| 1440 | BLOCKER | **New defect surfaced by this fix**: two image cards on the source overlap in the clone (24.57% of the viewport area) even though 1440 is the exact truth-observation width — look for stacked/overlapping photo cards instead of a tiled grid. |

## `/link`

| width | grade | what to look at |
|---|---|---|
| 390 | BLOCKER | 36.4% of the source's visible text is missing from the clone — compare text density between source and final. |
| 700 | BLOCKER | Only 3 of the source's 7 images render (was 7/7 before this fix) — look for missing thumbnails/icons. |
| 1024 | BLOCKER | Footer overrun (clone right edge 1440 > 1024 viewport) plus the same missing-image gap. |
| 1100 | BLOCKER | Footer overrun (clone right edge 1440 > 1100 viewport) plus the same missing-image gap. |
| 1440 | BLOCKER | Same image gap as 700 (3 of 7) — at the truth width itself, so this is not a scaling artifact. |

## Reading the grades

Every pair above graded BLOCKER on this run (10/10), against a W7 pre-fix baseline of 8
BLOCKER / 1 MAJOR (`/link`@700) / 1 MINOR (`/link`@1440) for the same site, rubric, widths and
routes. The desktop-rule-eviction defect this wave targets (zero desktop layout rules,
`desktop:truth-width-not-probed`) is confirmed gone — see the lane report — but fixing it
exposed two new geometry/content regressions on this specific site (the `/`@1440 overlap and
the `/link` image drop at both widths), which is why 2 of the 10 pairs got worse
(MAJOR→BLOCKER, MINOR→BLOCKER) rather than better. A human comparing the `-composite` images
above should be able to see both directly: the missing image tiles on `/link`, and the
stacked/overlapping cards on `/`@1440.
