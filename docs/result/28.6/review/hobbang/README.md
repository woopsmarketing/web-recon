# Visual review — lane P1 — hobbang.net

Full-page screenshots straight from the graded responsive-QA run
`data/hobbang.net/responsive-qa/2026-09-02T23-24-17-536Z/images/`. Filenames sort in sweep order:
`<index>_<route-slug>_<width>_<side>.png`. `source` = the live site, `clone` = the reconstructed Next.js app,
both captured by the same code in the same context with `document.fonts.ready` awaited.

Route slugs: `root` = `/`, `linkmoeum-geomsaek` = `/링크모음/검색/`
(`/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`).

**Grade: BLOCKER 2 / MAJOR 5 / MINOR 3 / PASS 0.**
**Self-check floor (source vs a second capture of itself): BLOCKER 0 / MAJOR 0 / MINOR 2 / PASS 8** — so every
BLOCKER and MAJOR below is the clone, not the instrument and not source drift.

Nothing is missing in any pair: `missingText` is 0.00 % on all ten, and the visible-character count is
**identical on both sides of every pair**. Everything you see here is mis-laid-out or mis-typeset content,
never absent content.

**Two shortcuts for reading these images fast:**
- **Compare the picture WIDTHS.** A full-page screenshot is exactly as wide as the document. Where the clone's
  PNG is 1128 px and the source's is 1024 or 1100, the clone is shipping a document wider than the window.
- **Compare the picture HEIGHTS.** The clone's page is 17 230 px tall at both 390 and 700 while the source
  reflows from 17 167 to 14 630 — the clone image is simply longer because it never reflowed.

| # | Pair | Verdict | Deciding channel | What to look at with your own eyes |
|---|---|---|---|---|
| 01 | `root` @390 | **MAJOR** | `overlap-excess-ratio` (+2.18 pp; 42 overlapping leaf pairs vs 20) | **Scroll to the coloured category cards (about a sixth of the way down, y ≈ 2 500–3 900 px).** In the source each card reads `검색·포털` on one line with its description below. In the clone the title breaks across two lines (`검색 · 포` / `털`) and the second line lands **on top of** the description sentence, so the two strings are printed over each other. The same happens on `뉴스·미디어`, `영상·OTT`, `커뮤니티`, `쇼핑·직구`, `금융·투자` and four more — 21 card titles in all. The `링크모음 보기 →` links below them wrap too, stranding the arrow on its own line. Everything else at this width is near-perfect: the five data tables are pixel-for-pixel the same height as the source's. |
| 02 | `root` @700 | **MAJOR** | `column-container-mode-delta` (3 rows of 7 vs source 2 rows of 13) | Put the two pictures side by side and note the **length**: 17 230 px of clone against 14 630 px of source. The clone is the 390 px phone layout stretched to 700 px — one narrow column of cards with wide empty margins — while the source has already gone two-up. |
| 03 | `root` @1024 | **BLOCKER** | `footer-clipped` (clone footer max-right **1053** > 1024) | **The clone PNG is 1128 px wide; the source's is 1024.** Go to the dark footer at the very bottom. In the source the nav is two tidy rows of links inside the dark band. In the clone the same links are crushed into one row of 18, each label broken mid-word (`주소모` / `음`, `검색` / `현황`), and the row **runs off the right end of the dark band onto white paper** — the band stops at 1024, the text does not. The card grid above it shows the other half: content pinned to a 1104 px-wide layout with a dead empty strip on the right. |
| 04 | `root` @1100 | **MAJOR** | `horizontal-overflow-excess-px` (28 px) | Same 1128 px-wide clone document, now only 28 px too wide. Look again at the right end of the footer band and at the right-hand column of cards — both stop 28 px past where the source's do. |
| 05 | `root` @1440 | **MINOR** | `overlap-excess-ratio` (+1.89 pp) | Both pictures are 1440 × 10 863 — the closest structural match in the run. Look at **type, not layout**: the clone's section headings are visibly wider and heavier (the display serif Hahmlet never loads, so headings run 10–22 % wide). One consequence to spot: the first big comparison table is 56 px taller in the clone and its last row pushes over the box below it. |
| 06 | `linkmoeum-geomsaek` @390 | **MINOR** | `pixel-residual-difference-ratio` (8.93 %, 86 % of it on glyph edges) | Same blocks in the same places, same page height (5 817 px both sides). The whole difference is in the Korean headings: compare `검색·포털` and the section titles and you will see the letterforms and their widths differ, which is the substituted font and nothing else. |
| 07 | `linkmoeum-geomsaek` @700 | **MAJOR** | `column-container-mode-delta` (3 rows of 5 vs source 2 rows of 9) | The clone picture is 5 817 px long against the source's 3 726 px — more than half again. Again the phone layout at 700 px: one tall stack of link cards where the source has gone two-up. |
| 08 | `linkmoeum-geomsaek` @1024 | **BLOCKER** | `footer-clipped` (clone footer max-right **1053** > 1024) | **Clone PNG 1128 px wide, source 1024.** The link-list rows are laid out at 1104 px and their right ends sit outside the 1024 px window; the footer band does the same thing as on pair 03 — nav text past the end of the dark background. See `08_linkmoeum-geomsaek_1024_composite-BLOCKER.png` for the two sides together. |
| 09 | `linkmoeum-geomsaek` @1100 | **MAJOR** | `horizontal-overflow-excess-px` (28 px) | The same 1128 px document, 28 px too wide; the right edge of every list row and of the footer band overshoots. |
| 10 | `linkmoeum-geomsaek` @1440 | **MINOR** | `overlap-excess-ratio` (+0.16 pp) | The best pair in the run: identical dimensions, identical structure. Compare the Korean serif headings for width, and otherwise expect to find very little. |

## Extra images

- `03_root_1024_composite-BLOCKER.png`, `08_linkmoeum-geomsaek_1024_composite-BLOCKER.png` — the harness's own
  side-by-side composites for the two BLOCKER pairs.

## One caveat about what a screenshot can and cannot show

A full-page PNG is exactly as wide as the document's `scrollWidth`. Where the clone's overflow is **scrollable**
(1024 and 1100 here) the PNG grows to 1128 px and you can see the overflow directly. Where it is **clipped**,
`scrollWidth` stays at the viewport, the PNG is viewport-wide, and the overflowing content is simply **absent**
from the picture. Two pairs in this run have clipped overflow (`root` @390 and `linkmoeum-geomsaek` @390 — the
clone's content reaches x = 573 px inside a 390 px viewport). On those, look for the *consequence* — text
overprinted, a longer page — not for the overflow itself.

## Dropped

Nothing. All 10 pairs are here as source + clone, plus the 2 BLOCKER composites: **25 MB**, inside the 40 MB budget.

Full lane report with every number: `docs/result/28.6/lanes/w7-hobbang.md`.
