# Task 28.6 — visual review pack — interiorteacher.com (lane P6)

Full report: `docs/result/28.6/lanes/w7-interiorteacher.md`
Graded run: `data/interiorteacher.com/responsive-qa/2026-09-02T23-38-14-815Z`
Floor run (source vs. itself): `data/interiorteacher.com/responsive-qa/2026-09-02T23-42-37-660Z` — **10/10 PASS**
Desktop-width run: `data/interiorteacher.com/responsive-qa/2026-09-02T23-49-01-990Z`

**Read this first.** The self-check floor for this site is 10 of 10 PASS: the source captured twice
under the same policy produces bit-identical numbers on every pair. So everything you see below that
looks wrong is the CLONE, not the instrument and not the live site moving.

**Downscale note (size budget).** The grader's source + clone PNGs for these ten pairs total 80.7 MB
and the pack budget is ~40 MB. Every pair is BLOCKER or MAJOR — there were no MINOR pairs to drop — so
instead of dropping pairs I kept **all ten**, resampled to **50 % linear** (Lanczos, 24-bit PNG). Layout,
column counts, gutters and image placement are all judgeable at this scale; body text is not. Full-size
originals are in the run directories named above under `images/`. The three desktop-width pairs are
included as the grader's own **side-by-side composites** at 60 %.
Total pack: **33 MB**.

Files sort route-then-width. `*_source.png` is the live site; `*_clone.png` is the reconstruction.

---

## Graded sweep — `/` (home)

| Pair | Verdict | Deciding channel | What to look at |
|---|---|---|---|
| `home_0390_source.png` / `home_0390_clone.png` | MAJOR | `missing-text-ratio` 3.56 % | The two are nearly the same page — scroll both to the bottom and compare the footer block; this is the width the clone was observed at, so it is the "best case" reference for everything below. |
| `home_0700_source.png` / `home_0700_clone.png` | MAJOR | `right-gutter-excess-ratio` 42.0 % | The clone is a phone page stretched onto a 700-px canvas: the content column stays narrow and a wide empty strip runs down the right-hand side that the source fills edge to edge. |
| `home_1024_source.png` / `home_1024_clone.png` | **BLOCKER** | `missing-text-ratio` 30.13 % | Whole sections the source shows at 1024 are simply not in the clone — the clone is still rendering the mobile page. Count the product/brand tiles: source 106 images, clone 60. |
| `home_1100_source.png` / `home_1100_clone.png` | **BLOCKER** | `missing-text-ratio` 30.13 % | Same failure as 1024, one width up; the empty right-hand strip is now roughly two-thirds of the picture. |
| `home_1440_source.png` / `home_1440_clone.png` | MAJOR | `missing-text-ratio` 3.55 % | Near-identical, down to the same 20 563-px page height. This is the desktop observation width — the clone is a good photograph of the page at exactly this width and nowhere else. |

## Graded sweep — `/furniture/list`

| Pair | Verdict | Deciding channel | What to look at |
|---|---|---|---|
| `furniture-list_0390_source.png` / `..._clone.png` | MAJOR | `missing-text-ratio` 5.17 % | Two-up product grid on both; the clone carries 78 visible image leaves against the source's 98, so count tiles from the bottom until they stop matching. |
| `furniture-list_0700_source.png` / `..._clone.png` | MAJOR | `position-delta-p90-px` 310 px | The source re-flows to a wider grid; the clone keeps the phone grid, so every tile sits ~310 px left of where the source puts it. |
| `furniture-list_1024_source.png` / `..._clone.png` | MAJOR | `position-delta-p90-px` 732 px | The clone page is half the source's height (8 088 px vs 16 029 px) — the source has loaded a second page of products, the clone cannot. |
| `furniture-list_1100_source.png` / `..._clone.png` | **BLOCKER** | `image-presence-ratio` 18.8 % | The source image is enormous (64 791 px tall, five pages of infinite scroll, 416 product photos); the clone is one screen of 78. This is the static-snapshot-vs-paginated-API gap, and it is reproducible — the source does exactly this at 1100 px on every capture. |
| `furniture-list_1440_source.png` / `..._clone.png` | MAJOR | `missing-text-ratio` 5.24 % | Near-identical again, same 4 379-px height. Second observation width, second "best case". |

## Desktop-width probe (composites, source left / clone right)

These three widths are above the clone's 1280 tree switch and are NOT the 1440 observation width.
They are the picture of the engine defect in §4.6 of the report.

| File | Verdict | Deciding channel | What to look at |
|---|---|---|---|
| `home_1300_source-vs-clone-composite.png` | **BLOCKER** | `footer-clipped` | The clone's footer runs off the right edge of a 1300-px window — its content is still laid out on a 1440-px canvas and simply hangs over the side. |
| `home_1680_source-vs-clone-composite.png` | **BLOCKER** | `nav-link-ratio` 1 of 7 | Look at the header row: the source opens its full navigation at its authored ≥1470 px breakpoint (7 visible nav links); the clone shows 1, because it is a frozen photograph of the page at 1440. |
| `home_1920_source-vs-clone-composite.png` | **BLOCKER** | `nav-link-ratio` 1 of 7 | Same header failure, and the white right-hand strip is unmistakable: the source paints edge to edge, the clone stops at 1440 px (measured right-gutter excess 25.0 %). |
| `furniture-list_1300_source-vs-clone-composite.png` | **BLOCKER** | `footer-clipped` + `overlap-excess` 17.6 % | The harness measured 17.6 % of the viewport covered by overlapping leaf pairs in the clone against the source's own value, and the clone's footer reaches x=1440 in a 1300-px window — look for tiles sitting on top of each other and for content running past the right edge. |
| `furniture-list_1680_source-vs-clone-composite.png` | **BLOCKER** | `nav-link-ratio` 1 of 7 | The source's grid widens to fill 1680 px; the clone's stays at its 1440 width, centred, with the same collapsed header. |
| `furniture-list_1920_source-vs-clone-composite.png` | **BLOCKER** | `nav-link-ratio` 1 of 7 | Most obvious of the six: the clone is a 1440-px page floating in a 1920-px window with a plain white strip down the right — the same shape as the home pair above. |

---

**One sentence for the operator.** At the two widths the engine observed (390 and 1440) this clone is
an excellent likeness, matching the source's page height to the pixel; at every other width it is a
photograph of one of those two pages, and the further you get from 390 or 1440 the more obvious that
becomes.
