# Task 28.6 — Lane P6 — interiorteacher.com

**Host:** `interiorteacher.com` (Next.js pages-router, SSR home + client-rendered list, Korean copy, Pretendard webfonts)
**Routes in scope:** `/` and `/furniture/list`
**Lane:** P6 (PILOT 6, first run) — the richest responsive corpus in the 28.6 pool.
**Status:** PARTIAL — pipeline ran end to end with no stage failure; graded sweep 3 BLOCKER / 7 MAJOR / 0 MINOR / 0 PASS over 10 route×width pairs against a **10/10 PASS self-check floor**; a supplementary desktop-width sweep found 6 more BLOCKERs traced to one engine defect (§4.6).

> Everything below is MEASURED in this repo on 2026-09-02/03 unless a line says explicitly that it
> could not be measured. Nothing under `src/` or `scripts/` was edited by this lane.

---

## 0. Independent ground truth taken before the pipeline ran

Read-only `curl` of the two in-scope routes and of every stylesheet they link
(`tmp/wr286/w7-interiorteacher/`):

| File | HTTP | Bytes |
|---|---|---|
| `/` | 200 | 234,148 |
| `/furniture/list` | 200 | 8,612 |
| `/_next/static/css/f24116875e829d30.css` (first-party) | 200 | 185,302 |
| `pretendardvariable-dynamic-subset.css` (jsDelivr, `crossorigin=anonymous`) | 200 | 62,406 |
| `pretendardvariable-jp-dynamic-subset.min.css` (jsDelivr, `crossorigin=anonymous`) | 200 | 102,098 |

Two facts from that, both load-bearing later:

1. **`/furniture/list` ships an empty body.** Its SSR HTML contains one `<h1 class="sr-only">가구 목록</h1>`
   and three empty portal roots (`#ab-test-root`, `#bottom-sheet-root`, `#modal-root`), then
   `__NEXT_DATA__`. The whole product grid is client-rendered after hydration + an API fetch. The
   Observer sees the hydrated DOM because it drives a browser, so the clone gets one snapshot of one
   API response — not a data-driven list.
2. **The first-party stylesheet authors 712 declarations inside `@media` blocks** (my own brace-matched
   count over `app.css`), spread over 12 distinct conditions:
   `450min 43 · 768min 263 · 1024min 61 · 1200min 2 · 1280min 155 · 1440min 56 · 1680min 4 · 1760min 75 ·
   450max 47 · 1280max 1 · 800maxH 2 · 801minH 3`.
   The engine's own tally (below) is by RULE, not declaration, so the two numbers are not comparable
   directly; both are reported so neither has to be trusted alone.

---
## 1. What I ran, in order, with run ids

All times UTC, 2026-09-02.

| # | Command | Wall clock | Output |
|---|---|---|---|
| 0 | `curl` of both routes + all three linked stylesheets (§0) | 23:12:30 → 23:12:32 | `tmp/wr286/w7-interiorteacher/*.html`, `*.css` |
| 1 | `pnpm e2e:reconstruct https://interiorteacher.com/ --max-urls 20 --concurrency 2 --family-escalation 4 --prepare-scroll` | 23:12:36 → 23:35:43 (**23 m 07 s**) | `data/interiorteacher.com/e2e-runs/2026-09-02T23-12-36-087Z/` |
| 2 | `pnpm verify <2-URL discovery.json> --concurrency 1` | 23:34:52 → 23:35:02 | `data/interiorteacher.com/w7-chain-2026-09-02T23-34-52-000Z/` |
| 3 | `pnpm select .../verified-urls.json` | 23:35:05 | same dir |
| 4 | `pnpm observe:site .../selected-pages.json --concurrency 2 --prepare-scroll` | 23:35:07 → 23:36:50 (**95.9 s**) | `data/interiorteacher.com/site-observations/2026-09-02T23-35-07-000Z/` |
| 5 | `pnpm detect:interactions .../site-observation.json` | 23:36:55 (154 ms) | same dir |
| 6 | `pnpm explore:interactions .../interaction-analysis.json --concurrency 2` | 23:37:00 → 23:37:36 (34.5 s) | `data/interiorteacher.com/interaction-explorations/2026-09-02T23-37-00-495Z/` |
| 7 | `pnpm model:interactions .../interaction-exploration.json` | 23:37:40 (31 ms) | `data/interiorteacher.com/interaction-models/2026-09-02T23-37-40-791Z/` |
| 8 | `pnpm compile:sitespec .../interaction-patterns.json` | 23:37:45 (677 ms) | `data/interiorteacher.com/site-specs/2026-09-02T23-37-45-201Z/` |
| 9 | `pnpm reconstruct .../site-spec.json` (incl. `next build`) | 23:37:49 → 23:38:01 (8.3 s gen + 2.6 s build) | `data/interiorteacher.com/reconstructions/2026-09-02T23-37-49-784Z/` |
| 10 | **GRADED** `pnpm qa:responsive .../reconstruction-manifest.json --widths 390,700,1024,1100,1440 --routes '/,/furniture/list'` | 23:38:14 → 23:42:27 (**4 m 13 s**) | `data/interiorteacher.com/responsive-qa/2026-09-02T23-38-14-815Z/` |
| 11 | **FLOOR** same command `--self-check --no-diff-images` | 23:42:37 → 23:48:20 (**5 m 43 s**) | `data/interiorteacher.com/responsive-qa/2026-09-02T23-42-37-660Z/` |
| 12 | **DESKTOP-TREE PROBE** same command `--widths 1300,1680,1920 --no-diff-images` | 23:49:01 → 23:51:44 (**2 m 43 s**) | `data/interiorteacher.com/responsive-qa/2026-09-02T23-49-01-990Z/` |

**Lane wall clock 23:12:30 → 23:51:44 ≈ 39 min of pipeline + grading.** Artifacts written by this lane
under `data/interiorteacher.com/` total **1.3 GB** (observation 56 MB, SiteSpec 22 MB, reconstruction
35 MB, the three responsive-QA runs 105 + 122 + 95 MB, plus the 23-minute e2e run's own
225 MB observation / 98 MB SiteSpec / 513 MB QA).

### Why steps 2–9 exist instead of a second `e2e:reconstruct`

**I could not grade `/furniture/list` from the end-to-end run.** Firecrawl discovery returned 20 URLs
for this host — 18 `/furniture/<product-slug>` pages, one `/magazine/<slug>`, and the root — and
**`/furniture/list` was not among them**; the e2e clone therefore has 21 routes and none of them is
the one in my scope. Re-rooting the e2e at `/furniture/list` would not have fixed it either:
`isSiteRoot()` protects the SITE root (`/`), not the run's root URL
(`src/selector/build-families.ts:556`), so `/furniture/list` would have been thrown into the
`/furniture/<*>` sibling family and could have lost the representative contest to a product page.

So I built the ordinary stage chain with a two-URL `discovery.json` (provider recorded honestly as
`operator-route-list`) and ran **the engine's own `verify` → `select` → `observe:site` → … → `reconstruct`
stages unmodified**. Nothing was hand-authored past that discovery file; `select` produced two
singleton families on its own. This is a generic operator capability, not a host-specific hack.

The end-to-end run is still reported below: it is an 11-page / 21-route corpus of the same engine on
the same site, and every engine measurement in §4 is given for BOTH corpora so that a one-page fluke
cannot masquerade as an engine property.

**Engine stability during this lane:** no file under `src/` or `scripts/` was written by me; the only
paths I wrote are `data/interiorteacher.com/**`, `tmp/wr286/w7-interiorteacher/**` and the two output
paths in my brief. Measured: the newest mtime under `src/` or `scripts/` is
`2026-09-03 08:02:55 src/observer/types.ts` (local), and my first pipeline command started
`2026-09-03 08:12:34` — **0 engine files changed after this lane began**, so every number here was
produced by one frozen engine.

### e2e stage results (run `2026-09-02T23-12-36-087Z`)

`discovery 20→20 (root seeded — the provider did not return the root)` · `verification 21 candidates /
21 valid-html / 0 errors` · `selection 9 families from 21 URLs` · `observation 11/11 pages, 680 s` ·
`interaction-detection 1367 candidates` · `interaction-exploration 160 s` · `sitespec 21 routes` ·
`reconstruction 21 routes / 19 464 element nodes` · `next build exit 0 in 2 647 ms` · `qa 22/22
page-viewport pairs, 482 s` · `family-escalation 0 candidates` · `final-validation
originalScripts=0 originalStylesheets=0 originStackDependencies=0`.
**No stage failed.** Final status `complete-with-known-limitations`.

---
## 2. The grading floor — and why it makes this lane's verdicts unusually strong

`pnpm qa:responsive … --self-check` measured the SOURCE against a second capture of itself, same
widths, same routes, same capture policy (run `2026-09-02T23-42-37-660Z`):

| Route | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| `/` | PASS | PASS | PASS | PASS | PASS |
| `/furniture/list` | PASS | PASS | PASS | PASS | PASS |

**10 of 10 PASS — a zero floor.** No rubric channel fired anywhere. Prior 28.6 pilots measured
7 PASS (hobbang.net), 9 PASS (gs.severance.healthcare) and 4 PASS (seoultone.kr), so this is the
cleanest instrument floor the program has recorded.

It is stronger than "PASS": the source's census numbers are **bit-identical between the self-check run
and the graded run, on every pair**, including the pathological ones.

| Route @ width | source `scrollHeight` in the GRADED run | in the SELF-CHECK run (both captures) | source visible chars | source image leaves |
|---|---|---|---|---|
| `/` @390 | 15 441 | 15 441 / 15 441 | 3 708 | 81 |
| `/` @700 | 20 306 | 20 306 / 20 306 | 3 708 | 81 |
| `/` @1024 | 18 009 | 18 009 / 18 009 | 3 720 | 106 |
| `/` @1100 | 18 578 | 18 578 / 18 578 | 3 720 | 106 |
| `/` @1440 | 20 563 | 20 563 / 20 563 | 3 723 | 104 |
| `/furniture/list` @390 | 8 088 | 8 088 / 8 088 | 2 555 | 98 |
| `/furniture/list` @700 | 12 221 | 12 221 / 12 221 | 2 555 | 92 |
| `/furniture/list` @1024 | 16 029 | 16 029 / 16 029 | 2 517 | 99 |
| `/furniture/list` @1100 | **64 791** | **64 791 / 64 791** | **7 276** | **416** |
| `/furniture/list` @1440 | 4 379 | 4 379 / 4 379 | 2 520 | 117 |

Two consequences, both load-bearing for the rest of this report:

1. **Every finding in §3 is the clone's.** Not the harness's, not the live source's. The orchestrator's
   capture-gate policy holds: the grader's own capture reports `networkIdleReached: false` on every
   source capture (networkidle is genuinely unreachable here) and still loads 8 → 82 images at 1440
   through its stepped scroll, with `scrollHeightBefore == scrollHeightAfter == 20563` by the time the
   probe runs.
2. **`/furniture/list` @1100 is a real source behaviour, not noise.** At exactly 1100 px the source's
   infinite-scroll grid loads five pages instead of one — 64 791 px of document, 416 image leaves,
   7 276 visible characters against ~2 520 at every other width — and it does so *reproducibly*, three
   captures in a row. The clone's 78 images against 416 is therefore a genuine BLOCKER, but it is a
   BLOCKER about **static snapshot vs. paginated data source**, not about layout.

---

## 3. Responsive grade table (the graded sweep)

Run `2026-09-02T23-38-14-815Z`, 2 routes × 5 widths, clone vs. live source. Verdict is the worst
channel that fired.

| Route | Width | Verdict | B/M/m | Headline channel | Deciding number |
|---|---|---|---|---|---|
| `/` | 390 | **MAJOR** | 0/1/1 | `missing-text-ratio` | 3.56 % of the source's visible text absent (threshold 2.00 %) |
| `/` | 700 | **MAJOR** | 0/4/2 | `right-gutter-excess-ratio` | clone leaves 42.0 % of the viewport empty on the right that the source fills (thr 15 %); `position-delta-p90` 310 px |
| `/` | 1024 | **BLOCKER** | 1/4/3 | `missing-text-ratio` | **30.13 %** of the source's visible text absent (thr 10 %); `right-gutter-excess` 61.9 %, `position-delta-p90` 634 px, `column-container-mode-delta` 3 |
| `/` | 1100 | **BLOCKER** | 1/4/3 | `missing-text-ratio` | **30.13 %** (thr 10 %); `right-gutter-excess` 64.6 %, `position-delta-p90` 700 px |
| `/` | 1440 | **MAJOR** | 0/1/1 | `missing-text-ratio` | 3.55 % (thr 2 %); pixel residual 3.94 % |
| `/furniture/list` | 390 | **MAJOR** | 0/1/1 | `missing-text-ratio` | 5.17 % (thr 2 %) |
| `/furniture/list` | 700 | **MAJOR** | 0/2/2 | `position-delta-p90-px` | 310 px (thr 48 px); missing text 5.17 % |
| `/furniture/list` | 1024 | **MAJOR** | 0/3/1 | `position-delta-p90-px` | 732 px (thr 48 px); `scroll-height-ratio-low` 0.505 (thr 0.6) |
| `/furniture/list` | 1100 | **BLOCKER** | 3/1/1 | `image-presence-ratio` | clone renders **78 of the source's 416** visible images (18.8 %, thr 50 %); also `missing-text` 50.71 % and `visible-text-ratio` 0.327 |
| `/furniture/list` | 1440 | **MAJOR** | 0/1/1 | `missing-text-ratio` | 5.24 % (thr 2 %) |

**10 measured, 0 failed. BLOCKER 3, MAJOR 7, MINOR 0, PASS 0 — against a 10/10 PASS floor.**

### The one table that explains almost all of it

Document geometry, both sides, same capture policy:

| Route | Width | source `scrollW × scrollH` | clone `scrollW × scrollH` | source visible chars / img leaves | clone visible chars / img leaves |
|---|---|---|---|---|---|
| `/` | 390 | 390 × **15 441** | 390 × **15 441** | 3 708 / 81 | 3 576 / 81 |
| `/` | 700 | 700 × 20 306 | 700 × **15 441** | 3 708 / 81 | 3 576 / 81 |
| `/` | 1024 | 1024 × 18 009 | 1024 × **15 441** | 3 720 / 106 | 2 909 / 60 |
| `/` | 1100 | 1100 × 18 578 | 1100 × **15 441** | 3 720 / 106 | 2 909 / 60 |
| `/` | 1440 | 1440 × **20 563** | 1440 × **20 563** | 3 723 / 104 | 3 591 / 104 |
| `/furniture/list` | 390 | 390 × **8 088** | 390 × **8 088** | 2 555 / 98 | 2 428 / 78 |
| `/furniture/list` | 700 | 700 × 12 221 | 700 × **8 088** | 2 555 / 92 | 2 428 / 78 |
| `/furniture/list` | 1024 | 1024 × 16 029 | 1024 × **8 088** | 2 517 / 99 | 2 377 / 78 |
| `/furniture/list` | 1100 | 1100 × 64 791 | 1100 × **8 088** | 7 276 / 416 | 2 377 / 78 |
| `/furniture/list` | 1440 | 1440 × **4 379** | 1440 × **4 379** | 2 520 / 117 | 2 393 / 117 |

The clone's document height takes exactly **two** values per route across the whole sweep: the 390-px
observation height (15 441 / 8 088) at every width below the generated breakpoint of 1280, and the
1440-px observation height (20 563 / 4 379) at 1440. **The clone does not reflow at all between those
two anchors.** At the two widths that ARE observation widths the clone matches the source's height to
the pixel; everywhere else it is frozen.

---
## 4. Engine-change measurements

### 4.1 Stylesheet coverage — blocked / recovered / missed

`observation.json → viewports.<id>.stylesheetCoverage`, identical on both viewports of `/`:

| Field | Value |
|---|---|
| `stylesheetsTotal` | 6 |
| `cssomReadable` | **6** |
| `cssomBlocked` | **0** |
| `fallbackRecovered` | **0** |
| `fallbackMissed` | **0** |
| `sheetsRedirectResponses` / `…AliasesKeyed` / `…ChainsTruncated` | 0 / 0 / 0 |
| `rulesIndexed` | 1 983 |
| `ruleIndexCapHit` | false |
| `elementsWithAuthoredRules` | 906 |
| `bytesCaptured` | 2 134 861 |
| `importRulesVisited` / `Followed` / `Recovered` / `Unresolved` | **7 / 0 / 0 / 7** |
| `fontFaceUrlsHarvested` | 224 |
| `fontFaceUrlsSheetResolved` / `…Absolute` / `…DocumentResolved` | **223 / 1 / 0** |

**The redirected-stylesheet recovery change was NOT exercised on this site** — every sheet is
CORS-readable because the page ships `crossorigin="anonymous"` on both jsDelivr links, so
`cssomBlocked` is 0 and there was nothing to recover. That is a measurement, not a pass: this lane
provides no evidence for or against that change.

**The `@font-face`-URL-resolves-against-its-own-sheet change IS exercised and works**: 223 of 224
harvested font URLs resolved against their own sheet (the jsDelivr Pretendard sheets), 1 was already
absolute, and **0** fell back to document-relative resolution. Under the old document-relative rule
those 223 URLs would have resolved against `https://interiorteacher.com/…` and 404'd.

**A coverage gap the counters name and nothing fixes:** the first-party stylesheet opens with **7
`@import` rules** (`pretendardvariable-dynamic-subset.css`, `fonts.cdnfonts.com/css/arsenal-2`,
`…/nanumgothic-2`, and Google Fonts `ABeeZee`, `Syne`, `Aboreto`, `Prata` — verified by
`grep '@import' tmp/wr286/w7-interiorteacher/app.css`). All 7 are counted `importRulesUnresolved`
and none is followed, so **every `@font-face` those seven sheets declare is invisible to the engine**.
Four of the site's display faces are therefore unrecoverable by construction, and no counter outside
`importRulesUnresolved` says so.

### 4.2 Authored declarations and conditions

Two independent counts of the same thing, deliberately not reconciled:

| Source of the count | What it counts | Value |
|---|---|---|
| my own brace-matched scan of `app.css` | declarations inside `@media` blocks | **712** |
| `stylesheetCoverage.authoredMediaConditions` | **rules** per condition, summed | **95** over **14** distinct conditions |
| `widthProvenance.conditionsWeight` | same, as the derivation saw it | **95** |
| `widthProvenance.conditionsRead` | distinct conditions | **14** |
| `layout.authoredBreakpointDeclarations` (2-route run / e2e run) | declarations attributed to a breakpoint, per node | **36 363** / **179 164** |
| `layout.authoredBreakpointUnparsedDeclarations` | parse failures | **0 / 0** |
| `layout.authoredBreakpointTruncatedNodes` | nodes whose list was capped | **241 / 1 094** |

Measured condition tally (identical on desktop and mobile, both routes):
`(min-width:1280px) 65 · (min-width:1470px) 5 · (max-width:640px) 4 · (min-width:768px) 4 ·
(max-height:800px) 2 · (min-height:801px) 2 · (min-width:1024px) 2 · (min-width:1440px) 2 ·
(min-width:1680px) 2 · (min-width:1760px) 2 · (min-width:450px) 2 · (max-width:1280px) 1 ·
(max-width:450px) 1 · (min-width:1200px) 1`.
`conditionsWidthIrrelevant 4 · conditionsUnsupported 0 · conditionsUnparsed 0 ·
queriesNonScreenSkipped 0 · queriesEmptyInterval 0 · rootFontSizePx 16`.
The orchestrator's scouting number of "93 CORS-readable media rules across 12 breakpoints" reproduces
as **95 rules / 14 conditions / 12 folded width breakpoints**.

### 4.3 The derived probe width set and its provenance — AND THE FOUR BREAKPOINTS ABOVE THE OLD CEILING

`layout-probe.json → widthProvenance`, `/` desktop pass (identical in both runs):

| Field | Value |
|---|---|
| `floorWidths` | 390, 700, 768, 1024, 1100, 1440, 1920 |
| `cap` / `capHit` | 16 / **true** |
| `breakpointsFolded` | 12 |
| `breakpointsAdopted` | **8** |
| `breakpointsDroppedByCap` | **4** |
| `breakpointsOutOfRange` / `…AlreadyBracketed` | 0 / 0 |
| `widthsAdded` | 13 |
| `guaranteedFloorWidths` | **390, 1024, 1920** |
| `floorWidthsEvicted` | **700, 768, 1100, 1440** |
| `breakpointsAdoptedByEviction` | 3 |
| `degradedToFloor` | false |
| **probed widths** | **390, 449, 450, 640, 641, 767, 1023, 1024, 1279, 1280, 1439, 1469, 1470, 1679, 1680, 1920** |
| `breakpointsRefused` | `1760 min (cap)`, `450 max (cap)`, `1200 min (cap)`, `1280 max (cap)` |

Mobile pass (`layout-probe-mobile.json`, `profile.id = "mobile"`, Pixel-7 UA, DPR 3):
floor `390,480,700,768,914`, `capHit false`, `degradedToFloor false`, probed
**390, 449, 450, 451, 480, 640, 641, 700, 767, 768, 914**; 8 breakpoints refused, every one for
`out-of-range` (1280×65, 1470×5, 1024, 1440, 1680, 1760, 1200, 1280max) — the correct answer for a
pass whose envelope ends at 914.

**Answering the brief's question directly.** The authored breakpoints at or above the old ceiling of
1440 are **1440, 1470, 1680, 1760**. On this run:

| Breakpoint | Sampled below | Sampled above | Verdict |
|---|---|---|---|
| 1440 min | 1439 ✔ | **1440 ✘ — evicted** (`floorWidthsEvicted`) | **half-sampled** |
| 1470 min | 1469 ✔ | 1470 ✔ | **fully sampled (new)** |
| 1680 min | 1679 ✔ | 1680 ✔ | **fully sampled (new)** |
| 1760 min | — | — | **refused, reason `cap`** |

So **two of the four are newly and correctly sampled, one is refused by the width cap, and one — 1440 —
is sampled only from below because the derivation evicted the floor width that carries its upper
side.** That eviction is the subject of §4.6, and it is the largest defect this lane found.

### 4.4 The tree switch: chosen value, method, provenance

`reconstruction-manifest.json → config.inferredBreakpoint`:

| | 2-route run (graded) | e2e run (11 pages) |
|---|---|---|
| `value` | **1280** | **1280** |
| `method` | `authored-breakpoint` | `authored-breakpoint` |
| `provenance` | `inferred` | `inferred` |
| `mobileObservedWidth` / `desktopObservedWidth` | 390 / 1440 | 390 / 1440 |
| `candidateCount` / `ambiguous` | 4 / true | 12 / true |
| `candidatesOutsideObservedInterval` | 3 | 21 |
| `chosen` | px 1280, authoredWeight 285, authoredPages 2, observedChange **1133**, observedChangePages 2, unattributable 0 | px 1280, authoredWeight 2752, authoredPages 11, observedChange **1673**, observedChangePages 11, unattributable 0 |
| runner-up | px 641, weight 12, observedChange 34 | px 641, weight 102, observedChange 511 |
| `treeDivergence` | **dual-dom** | **dual-dom** |
| `pagesIdenticalWalk / Divergent / NotComparable` | 0 / 2 / 0 | 0 / 11 / 0 |
| `domSwitchWidthObserved` | false | false |

**The old midpoint guess would have been `floor((390+1440)/2) = 915`. The snap moved it to 1280 — a
365 px move — and 1280 is the site's own dominant breakpoint (65 of 95 authored media rules).** The
number is right. §5 shows that being right about the switch is not sufficient.

### 4.5 Band edges: snapped vs. midpoint-kept

| Counter | 2-route run | e2e run |
|---|---|---|
| `bandEdgesOpen` | 170 | 145 |
| `bandEdgesConsidered` | 170 | 145 |
| `bandEdgesSnapped` | **145** | **145** |
| `bandEdgesSnappedAmbiguous` | 0 | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | **25** | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 | 0 |
| `bandEdgeSnapShiftPx` | 145 | 145 |
| `bandCheckable` / `rejectedByBandCheck` | 170 / **0** | 145 / **0** |
| `bandIndependentlyDiscriminated` | 170 | 145 |
| `bandHiddenByAncestorAtBandWidth` | 153 | 142 |
| `bandTruthBaselineNotInLayout` | 0 | 0 |
| `bandSampleMismatches` | 25 | 0 |

`bandEdgesSnapped + KeptMidpointNoAuthoredInGap = 145 + 25 = 170 = bandEdgesConsidered`: the
accounting closes. **85.3 % of band edges snapped to an authored number** and the total shift off the
midpoint guess was **145 px over 145 edges — exactly 1 px each**, because every snapped edge moved
from a midpoint that was already adjacent to the authored value. The remaining 25 kept the midpoint
for the honest reason (`no-authored-in-gap`) and are the same 25 counted by `bandSampleMismatches`.

### 4.6 Desktop / mobile recovered-rule split — **THE BLOCKER**

| Counter | 2-route run | e2e run (11 pages) |
|---|---|---|
| `viewportPasses` | desktop 2, mobile 2 | desktop 11, mobile 11 |
| `viewportPassesUsed` | **mobile 2 only** | **mobile 11 only** |
| `viewportPassRefusals` | **`desktop:truth-width-not-probed` = 2** | **`desktop:truth-width-not-probed` = 11** |
| `rulesByViewport` | mobile 768 | mobile 4 557 |
| `shippedRulesByViewport` | mobile 766 | mobile 4 498 |

**The desktop layout pass refused on 100 % of pages in both corpora, and every recovered inline-size
rule in this clone describes the MOBILE tree.** The desktop tree — the one the clone mounts at every
width ≥ 1280 — received zero.

Diagnosis, to file and line:

* `src/reconstruction/layout-inference.ts:73` — `export const TRUTH_WIDTH = 1440;`
* `src/reconstruction/layout-inference.ts:1781` — the desktop pass is resolved with `truthWidth: TRUTH_WIDTH`.
* `src/reconstruction/layout-inference.ts:1667` — `resolveViewportProbe()` refuses with
  `truth-width-not-probed` when no probed width equals `truthWidth`.
* `src/observer/probe-widths.ts:174-188` — `pickGuaranteedFloor()` protects only
  `MIN_GUARANTEED_FLOOR_WIDTHS = 3` (`src/observer/types.ts:1893`) floor widths, chosen by **evenly
  spaced index**: for the floor list `[390,700,768,1024,1100,1440,1920]` that is indices 0/3/6 =
  **390, 1024, 1920**. 1440 is index 5 and therefore evictable.
* `src/observer/probe-widths.ts:331` — when the cap binds, evictable floor widths are traded for
  higher-ranked authored brackets. Measured here: `floorWidthsEvicted: [700, 768, 1100, 1440]`.

The two modules disagree about which floor width is mandatory, and nothing checks. **1440 was evicted
from the desktop probe of every one of the 13 pages this lane observed** — 11 in the e2e run, 2 in
the 2-route run — verified page by page (`13 total, 13 missing 1440`). The mobile side is unaffected:
`MOBILE_TRUTH_WIDTH = 390` is index 0 of the mobile floor list and therefore always inside
`guaranteedFloorWidths`; **13 of 13 mobile probes contain 390**. The defect is specific to the desktop
pass and to a floor list whose required width is not at an evenly-spaced index.

This is not a theoretical harm. §5 measures it.

### 4.7 The inline-size outcome partition

2-route run (`nodesWithProbe` 1 848):

| Stage | Bucket | Count | Share of candidates |
|---|---|---|---|
| pre-stage drop | `hidden-at-truth-width` | 312 | — |
| pre-stage drop | `display-not-blockish` | 112 | — |
| **candidates** | | **1 424** | 100 % |
| emitted | `emitted-full-width` | 586 | 41.2 % |
| emitted | `emitted-centered-max-width` | 5 | 0.4 % |
| emitted | `emitted-percentage-width` | 5 | 0.4 % |
| refused | `refused-containing-block-guard` | 130 | 9.1 % |
| refused | `refused-width-mode` | 45 | 3.2 % |
| **unexplained** | **`no-branch-matched`** | **653** | **45.9 %** |

`312 + 112 + 1424 = 1848 = nodesWithProbe`, and the six outcome buckets sum to 1 424 with
`inlineSizeOutcomeDoubleCounts = 0`. **The accounting closes exactly**, which is the point of the
change — on this site 653 nodes were previously invisible and are now counted.

e2e run (`nodesWithProbe` 9 637): pre-stage `hidden-at-truth-width` 962 + `display-not-blockish` 583;
candidates 8 092 = `emitted-full-width` 4 371 + `emitted-centered-max-width` 6 +
`emitted-percentage-width` 5 + `refused-containing-block-guard` 283 + `refused-width-mode` 298 +
**`no-branch-matched` 3 129 (38.7 %)**; `inlineSizeOutcomeDoubleCounts` 0. Same closure.

**Refusal reasons, itemised.** Containing-block guard (2-route / e2e):
`flex-item-basis-governed 80 / 1`, `grid-item 41 / 254`, `parent-padding-not-constant 6 / 6`,
`fixed-position 3 / 21`, `abs-containing-block-not-parent 0 / 1`. Width mode:
`flex-item-main-axis 43 / 296`, `out-of-flow-auto-margin 2 / 2`. `widthValueRefusals 0` in both.

**Measured limitation of the new accounting:** `no-branch-matched` is a single terminal bucket with
no sub-reason breakdown (`src/reconstruction/layout-inference.ts:2521` records it with no detail), so
the largest single outcome on this site — 45.9 % of candidates — is counted but not explained. The
change made the number visible; it did not make it diagnosable.

**Parent content box measured per width.** `parent-padding-not-constant` fired 6 times in each run,
which is the counter that exists for the "padding assumed constant" case the change replaced. There
is no counter for "content box recovered from sibling geometry" successes, so I can report the
refusals but **cannot measure how many parents the new sibling-geometry recovery rescued**.

### 4.8 Grid-track recovery

2-route: `gridTrackColumns` 2 shipped, `gridTrackRefusals` 30 —
`tracks-not-px 8`, `tracks-not-reproducible-at-every-width 7`, `container-width-constant 6`,
`no-probe 6`, `child-count-not-multiple-of-tracks 2`, `children-do-not-tile-tracks 1`.
e2e: 30 shipped, 91 refused — `child-count-not-multiple-of-tracks 30`,
`container-width-constant 36`, `tracks-not-reproducible-at-every-width 16`, `tracks-not-px 8`,
`children-do-not-tile-tracks 1`.

### 4.9 Truth-check accounting, with every drop explained

| Counter | 2-route run | e2e run |
|---|---|---|
| `truthCheckStatus` | **verified** | **verified** |
| `truthCheckConverged` | true | true |
| `truthCheckRounds` | 3 | 22 |
| `truthCheckPagesRendered` | 2 | 11 |
| `candidateRules` | 768 | 4 557 |
| `acceptedRules` | 766 | 4 498 |
| `rejectedByTruthCheck` | **2** | **59** |
| `rejectedUnverifiable` | 0 | 0 |
| `acceptedUnchecked` | 0 | 0 |
| `acceptedRegressed` | 0 | 0 |
| `truthCheckable` | 598 | 4 412 |
| `bandCheckable` / `rejectedByBandCheck` | 170 / 0 | 145 / 0 |
| `bandWidthsRendered` | 2 | 1 |

Every drop is explained: `candidateRules − rejectedByTruthCheck = acceptedRules` in both runs
(768 − 2 = 766; 4 557 − 59 = 4 498), `rejectedUnverifiable` and `acceptedUnchecked` are 0, so no rule
shipped without being rendered and checked, and no rule was dropped for a reason the artifact does
not name. `truthCheckable + bandCheckable = candidateRules` exactly in BOTH runs (598 + 170 = 768;
4 412 + 145 = 4 557) — the two verification populations partition the candidates with nothing left over.

---
## 5. The desktop-tree probe — what the graded widths could not see

The graded sweep's only width above the tree switch is **1440, which is also the desktop observation
width**, so the frozen desktop subtree is invisible there by construction: a snapshot of the page at
1440 is exactly right at 1440. I therefore ran the same grader, same clone, same routes, at three
widths that are NOT the observation width and ARE above the switch — 1300 (just above 1280), 1680
(just above the newly-sampled 1680 breakpoint) and 1920 (run `2026-09-02T23-49-01-990Z`):

| Route | Width | Verdict | B/M/m | Headline | Deciding number |
|---|---|---|---|---|---|
| `/` | 1300 | **BLOCKER** | 1/3/2 | `footer-clipped` | clone footer max-right **1416 px in a 1300 px viewport**; the source's does not clip |
| `/` | 1680 | **BLOCKER** | 1/3/2 | `nav-link-ratio` | clone shows **1 of the source's 7** visible header/nav links (14.3 %, thr 50 %) |
| `/` | 1920 | **BLOCKER** | 1/4/2 | `nav-link-ratio` | 1 of 7 (14.3 %); `right-gutter-excess` 25.0 %, `position-delta-p90` 480 px |
| `/furniture/list` | 1300 | **BLOCKER** | 2/3/1 | `footer-clipped` + `overlap-excess-ratio` | clone footer max-right **1440 px in a 1300 px viewport**; overlap excess 17.6 % (thr 10 %) |
| `/furniture/list` | 1680 | **BLOCKER** | 1/2/2 | `nav-link-ratio` | 1 of 7 (14.3 %) |
| `/furniture/list` | 1920 | **BLOCKER** | 1/2/3 | `nav-link-ratio` | 1 of 7 (14.3 %); `position-delta-p90` 480 px |

**6 measured, 0 failed. BLOCKER 6, MAJOR 0, MINOR 0, PASS 0.**

Clone document height at these widths: `/` = **20 563 px at 1300, 1680 AND 1920** — bit-identical to
its 1440 value — while the source is 19 742 / 21 971 / 23 380. `/furniture/list` = **4 379 px at all
three**, source 4 064 / 4 891 / 5 408. `position-delta-p90-px` grows monotonically with distance from
1440: 140 px at 1300, 240 px at 1680, 480 px at 1920. That is the exact signature of content frozen
at a 1440-px canvas and centred in a wider or narrower viewport.

**This is the measured cost of §4.6.** The engine sampled 1469/1470 and 1679/1680 for the first time —
the change worked at the probe — and then threw the entire desktop probe away because 1440 was not in
its own width list, so the newly-sampled breakpoints above the old ceiling produced **zero** rules.
The `nav-link-ratio` BLOCKER at 1680 and 1920 is the site's own `(min-width: 1470px)` rule (5 authored
media rules) revealing the full navigation: a breakpoint the probe now samples correctly and the clone
still cannot express.

---

## 6. Every BLOCKER and MAJOR, diagnosed

### B1 — `/` @1024 and @1100 · `missing-text-ratio` 30.13 % (BLOCKER, thr 10 %)

The clone loses 811 of the source's 3 720 visible characters and 46 of its 106 image leaves (visible
leaves 305 → 198). Cause: **the tree switch at 1280 puts 1024 and 1100 on the MOBILE subtree**, and
this site's mobile DOM is not a restyled desktop DOM — it is a different tree (`treeDivergence:
dual-dom`, 2/2 and 11/11 divergent walks; 906 desktop vs. 911 mobile elements on `/`). The source at
1024 is past its own `(min-width: 768px)` (263 declarations) and `(min-width: 1024px)` (61
declarations) breakpoints and is showing desktop-only sections; the clone is showing the phone page.
Artifact fields: `config.inferredBreakpoint.value = 1280`, `treeDivergence = "dual-dom"`,
`domSwitchWidthObserved = false`.
**This is not a wrong number — 1280 is the site's dominant authored breakpoint (65 of 95 rules). It is
the limitation the manifest already declares as `tree-switch-dom-width-not-observed`:** the engine
snapped the switch to where the CSS changes, and the source swaps its DOM somewhere else. Nothing in
this pipeline observes the DOM-swap width, and this site is the case that makes the difference cost
30 % of the page.

### B2 — `/furniture/list` @1100 · `image-presence-ratio` 18.8 % (BLOCKER, thr 50 %)

Clone renders 78 of 416 source image leaves; `missing-text` 50.71 %; `visible-text-ratio` 0.327.
Cause: **the source route is client-rendered and paginated.** Its SSR body is one `sr-only` `<h1>` and
three empty portal roots (§0); the grid arrives from an API after hydration, and at 1100 px the
grader's stepped scroll drives its infinite scroll through five pages (64 791 px of document,
reproducibly — §2). The clone is a static snapshot of one API response, so it holds one page of
products at every width. Diagnosis is architectural, not a bug in a specific file: the reconstruction
has no data source, and `reconstruction-manifest.json` records it through
`renderCoverage: "exact-observed"` on a route whose observed content is one page of an infinite list.
**The `scroll-step-cap-reached` limitation fired on this pair (source reached 48 600 of 64 791 px),
so even the source side is truncated; the ratio is a lower bound on the gap, not an upper one.**

### B3 (probe sweep) — `footer-clipped` at 1300 on both routes, `nav-link-ratio` 14.3 % at 1680/1920

Diagnosed in §5 to `viewportPassRefusals: {"desktop:truth-width-not-probed": 2}` →
`src/reconstruction/layout-inference.ts:1667` + `src/observer/probe-widths.ts:174-188`.

### M1 — `right-gutter-excess-ratio` 42.0 % @700, 61.9 % @1024, 64.6 % @1100 on `/`

The clone's mobile subtree does not stretch. `layout.inlineSizeOutcomes` shows only 596 of 1 424
candidates got any inline-size rule; 653 hit `no-branch-matched` and 175 were refused. Those 828
nodes keep the width the 390-px observation recorded, so at 1024 the page paints a 390-ish column and
leaves 62 % of the viewport empty. This is the mobile-side residue of the same width-recovery
shortfall; it is measurable, it is generic, and it is what `no-branch-matched` was added to reveal.

### M2 — `missing-text-ratio` 3.55–3.56 % on `/` and 5.17–5.24 % on `/furniture/list` at EVERY width

A constant floor present even at the two observation widths where geometry matches to the pixel
(390 and 1440). 132 characters on `/`, ~127 on `/furniture/list`. The run's own
`missing-text-boundary-only-chars` accounting attributes only 9 characters over 6 strings on `/`
@1024 to the token-boundary rule (strict 30.13 % vs. loose 29.89 %), so the boundary rule is NOT the
cause of the floor. The census limitation that is: `text-census-shadow-and-generated-content` — this
run descended into **0 open shadow roots** and counts **0** shadow characters on both sides, so CSS
generated content (`::before`/`::after`) is invisible to the channel on both sides and cannot explain
a positive residue either. **I could not attribute this 3.5 %/5.2 % floor to a file or field**; it is
the honest remaining gap and it is the same at 390 and 1440, which rules out every width-dependent
mechanism in this report.

### M3 — `position-delta-p90-px` 310 px @700, 634 px @1024, 700 px @1100, 732 px on the list @1024

Same cause as M1 — a non-stretching subtree displaces every box to the left of where the source puts
it. Note the harness's own `position-channel-trust-guard` fired on `/furniture/list` @1100 (260 of
1 016 content-keyed leaves matched, 25.6 %), so that pair's position number was recorded but not
allowed to raise severity; its BLOCKER came from the image and text channels instead.

### M4 — `scroll-height-ratio-low` 0.505 on `/furniture/list` @1024 (MAJOR, thr 0.6)

Clone 8 088 px against the source's 16 029 px. Same infinite-scroll cause as B2, one width down.

### m — `pixel-residual-difference-ratio` 3.58 %–79.89 %, MINOR on all 10 pairs

The lowest is 3.58 % on `/furniture/list` @1440 against a 1 % MINOR band; on that pair 56.8 % of the
compared area is ink, so the residual is 6.31 % of everything the page draws. The harness states this
calibration itself in its `pass-reachability` limitation, and I reproduce it rather than re-deriving it.

---
## 7. Capture policy actually used, against the orchestrator's gate

The grader's `capturePolicy` (recorded in every run's artifact) is:
`goto(load) → bounded networkidle → bounded fonts.ready → settle → 2 rAF → stepped scroll to bottom →
settle → scroll to top → settle`, with `scrollStepPx 810`, `scrollMaxSteps 60`, `scrollStepWaitMs 150`,
`scrollBottomSettleMs 600`, `scrollTopSettleMs 400`, DPR 1, viewport height 900, `ko-KR`,
`Asia/Seoul`, light, reduced-motion no-preference, animations disabled, videos paused.

Measured against the orchestrator's gate on `/` @1440 (source side):
`networkIdleReached: false` — **networkidle is unreachable here, exactly as scouted**, and the policy
does not depend on it; 25 scroll steps, 19 663 px deep, `reachedBottom: true`, `stepsCapped: false`,
4 750 ms of deliberate waiting; **`imagesLoadedBefore: 8 → imagesLoadedAfter: 82`, 74 revealed**, which
is the orchestrator's 82-of-82-renderable number reproduced by the grader's own instrument;
`scrollHeightBefore == scrollHeightAfter == 20 563` (the 21 300 → 20 563 shrink has already happened
inside `stabilize` before the scroll pass begins, so the probe never straddles it);
`elementsRevealed: 0` and `textCharsRevealed: 0` on the home route — no scroll-reveal blanking, the
negative control the orchestrator predicted.
The single genuinely-404 YouTube thumbnail did not appear in any channel as a clone miss: the image
channel counts only leaves that are visible on the SOURCE side, and a failed image is not one.

`consoleErrors: 5` on the source capture of `/` @1440 — the source's own console, not the clone's.

---

## 8. What I could NOT measure, and why

1. **Whether the redirected-stylesheet recovery works.** Not exercised: `cssomBlocked 0`,
   `fallbackRecovered 0`, `fallbackMissed 0`, `sheetsRedirectResponses 0`. Every sheet on this host is
   CORS-readable. This lane is silent on that change.
2. **How many parents the new sibling-geometry content-box recovery rescued.** The artifact counts the
   refusals (`parent-padding-not-constant` 6 in each run) but exposes no success counter for the
   measured-content-box path, so the change's benefit is not observable from the manifest.
3. **Why 653 of 1 424 inline-size candidates matched no branch.** `no-branch-matched` is a single
   terminal bucket with no sub-reason map (`src/reconstruction/layout-inference.ts:2521`).
4. **The 3.5 % / 5.2 % constant missing-text floor.** Present at the observation widths where geometry
   is pixel-exact; not attributable to the boundary rule (9 of 1 121 chars) or to shadow DOM (0 open
   roots, 0 shadow chars on both sides). No artifact field names it.
5. **The width at which the SOURCE swaps its DOM.** `domSwitchWidthObserved: false` by construction —
   the two trees were observed at exactly two widths. This is the root of B1 and no run in this lane
   can close it.
6. **Whether the table-formatting-property capture change matters here.** `/` and `/furniture/list`
   contain no `<table>`; the change is untestable on this corpus.
7. **The Korean script-aware token-boundary rule in isolation.** It is exercised — the whole corpus is
   Korean — but the run reports only 9 boundary-only characters on the worst pair, which is too small a
   population to say whether the script-awareness changed a verdict. It changed no verdict here.
8. **The e2e run's 21-route clone was never graded with `qa:responsive`.** Its `reconstruction-qa`
   stage ran (22/22 pairs) but the responsive rubric was applied only to the 2-route clone, because
   `/furniture/list` is not in the e2e route map. The two clones' engine counters agree on every
   qualitative claim in §4.
9. **Machine load.** The lane ran alongside six other browser-driving lanes; `uptime` reported a
   1-minute load average of **10.06** at 23:20. No stage timed out and no retry was needed, so no
   measurement in this report is a resource artefact — but the wall-clock numbers in §1 are upper
   bounds, not the engine's cost on an idle machine.

---

## 9. Status

**PARTIAL — the pipeline ran end to end with no stage failure, both in-scope routes were graded, and
the run is BLOCKED on one engine defect that this lane measured rather than fixed.**

* Graded sweep (390/700/1024/1100/1440 × 2 routes): **BLOCKER 3, MAJOR 7, MINOR 0, PASS 0**, against a
  **10/10 PASS self-check floor** — the cleanest floor the program has measured, so none of it is noise.
* Desktop-tree probe (1300/1680/1920 × 2 routes): **BLOCKER 6, MAJOR 0, MINOR 0, PASS 0**.
* The four authored breakpoints at or above the old ceiling: **1470 and 1680 newly sampled on both
  sides, 1760 refused by the width cap, 1440 sampled only from below because the derivation evicted it.**
* One generic engine defect with a two-file diagnosis: the probe-width derivation may evict the floor
  width `1440` that `src/reconstruction/layout-inference.ts:73` requires as `TRUTH_WIDTH`, and when it
  does, the desktop layout pass refuses on 100 % of pages and the clone's desktop tree is frozen at
  the observation canvas. Measured on **13 of 13 probed pages** across two independent runs (mobile
  unaffected: 13 of 13 mobile probes keep their truth width 390), and its cost measured as 6 BLOCKERs
  at three desktop widths.

**Review images:** `docs/result/28.6/review/interiorteacher/` (33 MB — see its `README.md` for the
downscale note).
