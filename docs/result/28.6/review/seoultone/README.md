# Task 28.6 — visual review pack: seoultone.kr (lane P2)

**Source:** `http://seoultone.kr` (the pool's only http-only origin; the scheme was never rewritten).
**Clone grade run:** `data/seoultone.kr/responsive-qa/2026-09-02T23-29-55-193Z`
**Self-check floor run:** `data/seoultone.kr/responsive-qa/2026-09-02T23-24-44-987Z`
**Full lane report:** `docs/result/28.6/lanes/w7-seoultone.md`

> **Content note.** Korean dermatology clinic — a regulated advertising category. These are captures
> of already-public pages, made for a local fidelity test. Nothing was deployed and nothing here is
> for redistribution outside this repo. Surfaces are named by role ("the practitioner-credential
> block", "the clinic-location column"); no practitioner name, licence number or registration number
> is transcribed in this file. Faces appear in the source's own imagery; do not re-crop or re-publish.

**Naming:** `<route-slug>_<width>_<verdict>_<source|clone>.png`. Sorting the directory gives you
route, then width, then the two sides of the same pair adjacent. All 20 files are full-page PNGs at
the graded width. 28 MB total — **no pair was dropped**.

**How to read a pair.** The clone verdict is only meaningful against the floor — the same source
measured against a second capture of itself at the same pair. Floor: **0 BLOCKER / 1 MAJOR / 6 MINOR
/ 3 PASS**. Clone: **6 BLOCKER / 4 MAJOR / 0 MINOR / 0 PASS**. Every BLOCKER below is at least two
severity bands above its floor, so none of them is instrument noise.

| # | Pair | Verdict | Floor | Deciding channel | Look at this |
|---|---|---|---|---|---|
| 1 | `root_0390_*` | **BLOCKER** | MINOR | `missing-text-ratio` 33.07 % (thr 10 %) | The clone's practitioner-credential block and every section heading below the fold are **blank white bands** — the images arrive, the words never do. |
| 2 | `root_0700_*` | **BLOCKER** | MAJOR | `missing-text-ratio` 34.92 % (thr 10 %) | The clone's mobile menu drawer is **stuck open** down the right side, and the page's content sits in a ~390 px column with a wide empty right gutter, where the source fills the full 700 px. |
| 3 | `root_1024_*` | **BLOCKER** | MINOR | `missing-text-ratio` 34.38 % (thr 10 %) | Same blank text blocks; but note the header — the clone now shows the **same narrow/hamburger header the source shows**, which it did not before the tree switch moved to 1025. |
| 4 | `root_1100_*` | **BLOCKER** | MINOR | `footer-clipped` (clone footer right edge 1296 > 1100) + `visible-text-ratio` 48.0 % | The clone's horizontal nav bar **runs off the right edge** — the last menu items are cut in half — while the source at this width is still on its hamburger. |
| 5 | `root_1440_*` | **BLOCKER** | MINOR | `missing-text-ratio` 32.53 % (thr 10 %) | **The most important image in this pack.** The two pages are the same height to the pixel (4892 = 4892) and every box lands within 11 px of its source position, yet the practitioner-credential block, the two mid-page section headings and the call-to-action copy are **empty on the clone side**. Layout right, paint wrong. |
| 6 | `page-intro04-php_0390_*` | MAJOR | PASS | `missing-text-ratio` 2.24 % (thr 2 %) | Almost identical pages; the one difference is a single small block of text present in the source and blank in the clone — 21 characters, and that alone is the whole verdict. |
| 7 | `page-intro04-php_0700_*` | MAJOR | PASS | `pixel-visible-difference-ratio` 50.1 % · `position-delta-p90-px` 310 px | The clone's four info columns (phone / location / hours / closures) are **squeezed into the left ~680 px** with the right third empty, where the source spreads them across the full width. |
| 8 | `page-intro04-php_1024_*` | MAJOR | PASS | `position-delta-p90-px` 634 px | Same squeeze, wider viewport — the gap between where the source puts the fourth column and where the clone puts it is what the 634 px is. |
| 9 | `page-intro04-php_1100_*` | **BLOCKER** | MINOR | `footer-clipped` (1296 > 1100) | Two visible faults at once: the nav bar **overflows the right edge**, and inside the clinic-location column the address lines **overlap each other** — two lines of Korean printed on top of one another. |
| 10 | `page-intro04-php_1440_*` | MAJOR | MINOR | `missing-text-ratio` 2.27 % (thr 2 %) | The closest pair in the pack. Compare the map block and the footer link row; the geometry is right and the residual is texture, not structure. |

**The single sentence that connects most of this pack:** the source animates its text in on scroll
(it holds blocks at `opacity: 0` until they enter the viewport). The observation captured one instant
of that, and the clone bakes that instant permanently — so on the homepage the clone paints ~900
characters at `opacity: 0` where the source's own capture hides ~440, and the difference is the
missing-text BLOCKER. In the previous run the grader's text census ignored opacity and scored these
same pairs **0.00 % missing**. It no longer does. Pair 5 is the clearest demonstration.
