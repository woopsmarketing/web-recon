# Review pack — lane P3, `gs.severance.healthcare`

Full-page PNGs straight from the grader, one **source** and one **clone** per pair.
Grader run (clone): `2026-09-02T23-15-14-631Z` · floor run (self-check): `2026-09-02T23-19-24-311Z`
Full report: `docs/result/28.6/lanes/w7-severance.md`

**Read the verdicts against the floor.** Source-against-itself scored **6 PASS / 3 MAJOR / 1 BLOCKER**.
`/gs/news/news/notice.do` floors at **literal zero at all five widths**, and `/gs/index.do @700` also floors at
zero-and-PASS — so those six pairs are pure clone. `/gs/index.do @1100` floors at BLOCKER and is unadjudicable.
`/gs/index.do @390 / @1024 / @1440` floor at MAJOR because four `slick` carousels autorotate between captures.

| Pair | Files | Verdict | Deciding channel | What to look at |
| --- | --- | --- | --- | --- |
| `/gs/index.do` @390 | `index_0390_source.png` / `index_0390_clone.png` | MAJOR *(floor MAJOR)* | `position-delta-p90-px` 550 px | Compare which carousel slide is showing in the big photo band near the top — the two sides caught different slides. Below that the page is a close match; this is the pair where the source disagrees with itself. |
| **`/gs/index.do` @700** | `index_0700_source.png` / `index_0700_clone.png` / `index_0700_composite_BLOCKER.png` | **BLOCKER** *(floor PASS)* | `missing-text-ratio` 52.17% | Scroll to the dark-blue **NEWS** band. The source has three news cards with Korean headlines and dates; **the clone's NEWS band is empty blue space**. Also note the hero photo is clipped to the left ~390 px and the coloured promo tiles run as one narrow column instead of the source's two. |
| **`/gs/index.do` @1024** | `index_1024_source.png` / `index_1024_clone.png` / `index_1024_composite_BLOCKER.png` | **BLOCKER** *(floor MAJOR)* | `image-presence-ratio` 6 of 27 images | The whole right ~180 px of the clone is dead white space, the **NEWS** band is empty again, and most of the tile artwork is simply gone — count the pictures: the source draws 27, the clone draws 6. |
| `/gs/index.do` @1100 | `index_1100_source.png` / `index_1100_clone.png` | MAJOR *(floor BLOCKER — unadjudicable)* | `horizontal-overflow-excess-px` 160 px | The clone's content is laid out for a 1440 px page inside an 1100 px window, so the right-hand edge of every band is cut off. Kept for completeness only; the instrument cannot see below its own noise at this pair. |
| `/gs/index.do` @1440 | `index_1440_source.png` / `index_1440_clone.png` | MAJOR *(floor MAJOR)* | `position-delta-p90-px` 1,285 px | The overall page reads correctly at the capture width — check the carousel bands, which are showing different slides on the two sides, and the accreditation badge strip near the footer. |
| `/gs/news/news/notice.do` @390 | `notice_0390_source.png` / `notice_0390_clone.png` | MINOR *(floor PASS)* | `pixel-residual-difference-ratio` 13.96% | Essentially a match — every notice title and date is present and in place (`position-delta-p90 = 0 px`). Look for small font-weight and spacing shifts in the card text, nothing structural. |
| `/gs/news/news/notice.do` @700 | `notice_0700_source.png` / `notice_0700_clone.png` | MAJOR *(floor PASS)* | `position-delta-p90-px` 310 px | The notice cards keep their narrow 390 px phone width inside a 700 px window, so there is a wide empty strip down the right of the list. All the text is there; it is the wrong width. |
| `/gs/news/news/notice.do` @1024 | `notice_1024_source.png` / `notice_1024_clone.png` | MAJOR *(floor PASS)* | `position-delta-p90-px` 634 px | The clearest frozen-width picture in the pack: the source lays the notices out as **two columns filling the window**; the clone stacks them in **one narrow column down the left**, leaving more than half the page blank. Every notice is present and readable. |
| `/gs/news/news/notice.do` @1100 | `notice_1100_source.png` / `notice_1100_clone.png` | MAJOR *(floor PASS)* | `horizontal-overflow-excess-px` 160 px | The clone is built for 1440 px and overflows an 1100 px window; look at the right edge of the header bar and the notice cards, which run past the window. |
| `/gs/news/news/notice.do` @1440 | `notice_1440_source.png` / `notice_1440_clone.png` | MAJOR *(floor PASS)* | `position-delta-p90-px` 442 px | Close at the capture width. Look at the vertical rhythm between the search box, the card grid and the footer — the clone's blocks sit lower than the source's. |

Nothing was dropped for size: all 10 pairs are here (17 MB), plus the two BLOCKER composites.

**One sentence on what the two BLOCKERs mean.** The clone hides 195 real content nodes — the homepage news
and medical-report card carousel — at every width from 576 px up to 1025 px, because the observer's layout
probe recorded those nodes as "hidden" when the site's own carousel script destroyed and rebuilt them during
the probe's resize sweep. The source hides nothing there.
