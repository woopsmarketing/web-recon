# linear.app — human review pack (Task 28.6, post-fix, lane w8-linear)

Source run: `pnpm qa:responsive` on reconstruction `data/linear.app/reconstructions/2026-09-03T00-20-44-789Z`,
QA run id `data/linear.app/responsive-qa/2026-09-03T00-21-44-799Z`. Single pass, no `--self-check` (per
instructions — the orchestrator already holds the W7 self-check floor for this site).

Each numbered set is `<n>-linear-app-<route>-<width>-{source,final,composite}.png`. `source` is the live
site capture, `final` is the clone, `composite` is the two side by side. `contact-sheet.png` is every pair
on one sheet.

**Headline: the specific regression under test (0 desktop layout rules, footer flattened to the raw 1440
viewport width on every route) is gone.** Desktop now ships 741 recovered layout rules and the
footer-clipped numbers below are differentiated again (1438 on `/`, 1390 on the other three) instead of a
flat 1440 everywhere. Grades did not move, though — three unrelated defect channels (nav-link-ratio,
image-presence-ratio, missing-text) are equally or more severe and keep the same pairs at BLOCKER/MAJOR.
See what to check per image below.

| # | route | width | grade | what to check in the image |
|---|---|---:|---|---|
| 01 | `/` | 390 | MAJOR | Scroll-revealed source copy (5.14% of visible text) is not in the static clone — compare lower sections for text present in `source` but blank in `final`. |
| 02 | `/` | 700 | BLOCKER | Clone renders only 81 of 255 source images (32%) — look for whole image blocks missing in `final` vs `source`, plus column count mismatch (clone 8 cols vs source 28). |
| 03 | `/` | 1024 | BLOCKER | Same image-presence collapse, worse (66/248, 27%) — check the composite for entire visual sections that are blank/text-only in the clone. |
| 04 | `/` | 1100 | BLOCKER | Footer overflows the viewport: clone's widest content reaches x=1438px in a 1100px viewport — look at the footer row in `final`, it should visibly run off the right edge. |
| 05 | `/` | 1440 | MAJOR | 4.54% of source text missing (same scroll-reveal effect as @390) — compare text density in lower sections. |
| 06 | `/pricing` | 390 | MINOR | Near-parity (0.41% missing text) — should look essentially identical; check for tiny copy differences only. |
| 07 | `/pricing` | 700 | MAJOR | Pricing tier cards lay out 3 rows of 2 in the clone vs 2 rows of 4 in the source — check the tier-card grid shape in `final` vs `source`. |
| 08 | `/pricing` | 1024 | BLOCKER | Header nav shows only 3 of 6 source links (50%) — count visible nav items in the header bar of `final` vs `source`. |
| 09 | `/pricing` | 1100 | BLOCKER | Footer overflow: clone widest content reaches x=1390 in a 1100px viewport — check the footer edge. |
| 10 | `/pricing` | 1440 | MINOR | Near-parity (0.29% missing text) — should look essentially identical. |
| 11 | `/security` | 390 | MAJOR | Widest content row holds 2 items in clone vs 8 in source — check the logo/badge row layout shape. |
| 12 | `/security` | 700 | MAJOR | Same row-layout container mismatch as pricing@700 (3x2 vs 2x4) — check card/row grid shape. |
| 13 | `/security` | 1024 | BLOCKER | Header nav shows only 3 of 6 links (50%) — count visible nav items. |
| 14 | `/security` | 1100 | BLOCKER | Footer overflow: clone widest content reaches x=1390 in a 1100px viewport. |
| 15 | `/security` | 1440 | MAJOR | Widest row holds 6 items in clone vs 8 in source — check the same row for a missing item or two. |
| 16 | `/changelog` | 390 | MAJOR | 90th-percentile matched-box position drifts 64px from source (threshold 48px) — check for subtle element repositioning throughout the page. |
| 17 | `/changelog` | 700 | MAJOR | Row-layout container mismatch (3x2 clone vs 3x4 source) — check changelog entry grid shape. |
| 18 | `/changelog` | 1024 | BLOCKER | Header nav shows only 3 of 6 links (50%) — count visible nav items. |
| 19 | `/changelog` | 1100 | BLOCKER | Footer overflow: clone widest content reaches x=1390 in a 1100px viewport. |
| 20 | `/changelog` | 1440 | MINOR | 3.12% pixel residual, 87% of it off-content — should look essentially identical at a glance. |

## What changed vs the pre-fix run (w7-linear)

The grade distribution is unchanged (9 BLOCKER / 8 MAJOR / 3 MINOR / 0 PASS, identical per-pair verdict
categories) — none of the four listed residual defect classes (nav-link-ratio, image-presence-ratio,
missing-text, column/row-mode-delta) are caused by the probe-width eviction bug, so fixing it did not flip
any grade. What DID change, visible only by comparing the numbers behind `footer-clipped`, is that the
clone's shipped desktop width is no longer pinned to the raw 1440 viewport (the artifact of zero recovered
layout rules) — it is now 1438px on `/` and 1390px on the other three routes, which is differentiated,
narrower-than-viewport, and consistent with a real (if still overflowing) footer layout rather than an
un-styled block. That is the fix working; the remaining footer overflow itself is a separate, pre-existing
defect.
