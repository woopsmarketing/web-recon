# Task 28.6 — lane w7-linear — visual review pack

**Host:** linear.app **Routes:** `/`, `/pricing`, `/security`, `/changelog` **Widths:** 390 / 700 / 1024 / 1100 / 1440
**Grader run (clone):** `data/linear.app/responsive-qa/2026-09-02T23-29-17-748Z`
**Grading floor (source vs a second capture of itself):** `data/linear.app/responsive-qa/2026-09-02T23-18-26-778Z` — BLOCKER 2, MAJOR 0, MINOR 7, PASS 11.
**Clone grade:** BLOCKER 9, MAJOR 8, MINOR 3, PASS 0 over 20 pairs.

Files are named `<index>_<route>_<width>_<verdict>_{source,clone}.png`, so each pair's two
images sit next to each other and the whole directory sorts route-major, width-minor.
Every image is the FULL-PAGE capture the grader took; the source is the live page and the
clone is the generated Next.js app served locally.

**Three MINOR pairs were dropped to stay inside the size budget** (37.1 MB kept):
`/pricing @390`, `/pricing @1440`, `/changelog @1440`. Every BLOCKER and every MAJOR pair is here.

## The two things to look for

1. **Wrong tree below 1025 (pairs at 700 and 1024).** The clone's tree switch is 1025, so at
   700 and at 1024 it serves the DOM captured at 390. Look for a narrow one-column page with a
   hamburger where the source shows a wide multi-column page with a full navigation bar.
2. **No width restatement at all above 1025 (pairs at 1100).** The clone's desktop tree ships
   every box at its frozen 1440px measurement, so at 1100 the right-hand ~340px of the page is
   simply cut off. Look for a missing right-most column and a footer that runs off the edge.

## Pair by pair

| # | file prefix | verdict | floor | deciding channel | what to look at |
|---|---|---|---|---|---|
| 01 | `01_root_0390_MAJOR` | MAJOR | BLOCKER | `missing-text-ratio` 5.36% | Compare top-to-bottom section order — the clone is close, but the animated hero counters and one late section have not painted. The floor is a BLOCKER here, so most of this is the live page moving, not the clone. |
| 02 | `02_root_0700_BLOCKER` | BLOCKER | BLOCKER | `image-presence-ratio` 90 of 255 | The clone is the phone layout stretched to 700px; the source at 700 already shows side-by-side feature cards and product screenshots. Count the screenshots: most of them are simply not in the clone's page. |
| 03 | `03_root_1024_BLOCKER` | BLOCKER | PASS | `image-presence-ratio` 75 of 248 | The clearest picture in the pack. Source: a full desktop home page with a text nav bar and multi-column feature grids. Clone: the same narrow phone page as at 390, with a hamburger. The floor PASSES this pair, so all of it is the clone. |
| 04 | `04_root_1100_BLOCKER` | BLOCKER | MINOR | `footer-clipped` (clone max right 1440 > 1100) | Look at the right edge, top to bottom: the clone's content is a 1440px-wide page jammed into a 1100px window. The footer's right-hand column and the right side of every wide section are gone. |
| 05 | `05_root_1440_MAJOR` | MAJOR | PASS | `missing-text-ratio` 2.68% | At its own truth width the clone is a close match. Look at the hero and the late sections for text the live page reveals on scroll that the static clone never reveals. |
| 07 | `07_pricing_0700_MAJOR` | MAJOR | PASS | `column-container-mode-delta` 3x2 vs 2x4 | The four plan cards: the source packs them 2 rows of 4 across; the clone stacks them 3 rows of 2. Same content, wrong shape. |
| 08 | `08_pricing_1024_BLOCKER` | BLOCKER | PASS | `nav-link-ratio` 3 of 6 | Look at the header. The source has a full text navigation; the clone has a hamburger and three links, because it is serving the 390px DOM at 1024px. |
| 09 | `09_pricing_1100_BLOCKER` | BLOCKER | PASS | `footer-clipped` (clone max right 1440 > 1100) | Count the plan columns. The source shows four (Free / Basic / Business / Enterprise); the clone shows three and the fourth is cut off at the right edge, and the comparison table below loses the same column. |
| 11 | `11_security_0390_MAJOR` | MAJOR | MINOR | `column-mode-delta` 2 vs 8 | The compliance/certification badge row: the source lays it out 8 across, the clone 2 across, so that band is four times taller in the clone. |
| 12 | `12_security_0700_MAJOR` | MAJOR | MINOR | `column-container-mode-delta` 3x2 vs 2x4 | Same badge and feature rows as above, now at 700 — the clone is still using its phone grid. |
| 13 | `13_security_1024_BLOCKER` | BLOCKER | MINOR | `nav-link-ratio` 3 of 6 | The header again: hamburger in the clone, full nav in the source. |
| 14 | `14_security_1100_BLOCKER` | BLOCKER | MINOR | `footer-clipped` (clone max right 1440 > 1100) | The footer's right-hand link column, and the right end of the long text measure, are outside the frame in the clone. |
| 15 | `15_security_1440_MAJOR` | MAJOR | MINOR | `column-mode-delta` 6 vs 8 | At the truth width the page is broadly right; look only at the badge row, which wraps at 6 in the clone where the source fits 8. |
| 16 | `16_changelog_0390_MAJOR` | MAJOR | PASS | `position-delta-p90-px` 64px | A long page: scroll both and watch the entry cards drift progressively downward in the clone relative to the source. |
| 17 | `17_changelog_0700_MAJOR` | MAJOR | PASS | `column-container-mode-delta` 3x2 vs 3x4 | The changelog entry grid and the right gutter — the clone leaves a 147px empty strip on the right where the source leaves 35px. |
| 18 | `18_changelog_1024_BLOCKER` | BLOCKER | MINOR | `nav-link-ratio` 3 of 6 | Header hamburger versus full nav, plus a 471px empty right gutter in the clone against 35px in the source. |
| 19 | `19_changelog_1100_BLOCKER` | BLOCKER | PASS | `footer-clipped` (clone max right 1440 > 1100) | The right edge of every entry card, and the footer, run past the frame in the clone. |

## Contact sheets

The grader's own contact sheets are at
`data/linear.app/responsive-qa/2026-09-02T23-29-17-748Z/contact-sheet.png` (clone) and
`data/linear.app/responsive-qa/2026-09-02T23-18-26-778Z/contact-sheet.png` (floor).
Per-pair `-composite.png` and `-diff.png` images live beside them in each run's `images/`.
