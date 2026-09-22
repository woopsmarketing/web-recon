# Task 28.6 — LINEAR-GATE lane (Program A closure gate)

**Host:** linear.app  **Routes:** `/`, `/pricing`, `/security`, `/changelog`  **Widths:** 390 / 700 / 1024 / 1100 / 1440
**Lane status:** COMPLETE — every stage ran, every pair graded.
**Acceptance bar (BLOCKER = 0, MAJOR ≈ 0):** **NOT MET.** 20 pairs → **BLOCKER 9, MAJOR 7, MINOR 4, PASS 0**.
**Wall clock:** 18 min 41 s end to end (2026-09-02T20:17:44Z → 20:36:25Z UTC), of which 11 min 6 s is pipeline and 5 min 23 s is the grader.
**On-disk artifacts produced:** 325 MB.

The specific hypothesis this lane existed to test — the `/pricing` comparison-table band — **is confirmed
fixed, at both the artifact level and the grader level.** The lane still fails its bar, because the
comparison-table band was never the only defect at 1024/1100; it was the one the grader happened to name
first. With it gone the grader now names the defect underneath it, and that defect is bigger.

---

## 1. What I ran, in order

I did **not** use `pnpm e2e:reconstruct`. Its discovery stage calls Firecrawl unconditionally
(`src/e2e/run-discovery.ts:53-67`) and the CLI exposes no way to inject an existing `discovery.json`, so it
cannot be held to the four-route scope — it would re-crawl and re-derive families. I therefore ran the same
stages the e2e chain runs, in the same order, from the pre-existing 28.6 pilot scope. Every stage below is the
real stage API; nothing was hand-written.

The scope file was **copied** into a new run directory rather than written into
`data/linear.app/2026-09-02T08-00-00-000Z-286-pilot/`, so no existing run was modified.

| # | Command | Output run id / directory | Elapsed |
|---|---|---|---|
| 0 | `cp .../2026-09-02T08-00-00-000Z-286-pilot/{discovery,pilot-scope-provenance}.json` → new dir | `data/linear.app/2026-09-03T04-05-00-000Z-286-closure-gate/` | — |
| 1 | `pnpm verify data/linear.app/2026-09-03T04-05-00-000Z-286-closure-gate/discovery.json --concurrency 2` | same dir → `verification.json`, `verified-urls.json` | ~20 s |
| 2 | `pnpm select .../verified-urls.json` | same dir → `page-families.json`, `selected-pages.json` | ~2 s |
| 3 | `pnpm observe:site .../selected-pages.json --concurrency 2` | `data/linear.app/site-observations/2026-09-02T20-18-05-741Z` | 81.6 s |
| 4 | `pnpm detect:interactions <obs>/site-observation.json` | `<obs>/interaction-analysis.json` | 0.5 s |
| 5 | `pnpm explore:interactions <obs>/interaction-analysis.json --concurrency 2` | `data/linear.app/interaction-explorations/2026-09-02T20-20-18-000Z` | 88.1 s |
| 6 | `pnpm model:interactions .../interaction-exploration.json` | `data/linear.app/interaction-models/2026-09-02T20-21-50-073Z` | 0.07 s |
| 7 | `pnpm compile:sitespec .../interaction-patterns.json` | `data/linear.app/site-specs/2026-09-02T20-21-56-027Z` | 2.5 s |
| 8 | `pnpm reconstruct .../site-spec.json` | `data/linear.app/reconstructions/2026-09-02T20-22-04-538Z` | 8.3 s generate + 7.5 s truth check + 2.7 s `next build` (PASS) |
| 9 | `pnpm qa:responsive <rec> --widths 390,700,1024,1100,1440 --routes /,/pricing,/security,/changelog` | `data/linear.app/responsive-qa/2026-09-02T20-25-10-759Z` | 5 min 23 s |

Stage results worth recording: verify 4/4 `200 HTML`, 0 redirects, 0 blocked. Select 4 verified → 4 families →
4 representatives (all singletons, 0 reduction). Observe 4/4 pages, 0 failures, 4 desktop + 4 mobile
observations. Explore 21 actions, locator resolution 21/21, 0 live safety guards fired, mutation cap reached on
3 actions. SiteSpec 4 routes, exact behaviour on all 4. Reconstruct 4 routes, 12 521 element nodes,
3 131 CSS classes, 13 pattern triggers, validation PASS, `next build` PASS.

Analysis-only scripts I wrote (read-only, in `tmp/wr286/linear-gate/`, importing the engine's public API and
writing nothing into `src/`): `per-page-layout.ts`, `why-no-rule.ts`, `authored-padding.ts`,
`frozen-padding-blast.ts`, `overflow-probe.mjs`.

---

## 2. The responsive grade table

Every (route, width) pair, its verdict, and the channel that decided it (the highest-severity finding, first in
the rubric's own order).

| route | width | verdict | B | M | m | deciding channel | the number |
|---|---:|---|--:|--:|--:|---|---|
| `/` | 390 | MAJOR | 0 | 1 | 1 | `missing-text-ratio` | 2.17 % missing (thr 2.00 %) |
| `/` | 700 | **BLOCKER** | 3 | 3 | 2 | `image-presence-ratio` | clone renders 94 of 254 images (37 %, thr 50 %) |
| `/` | 1024 | **BLOCKER** | 3 | 3 | 1 | `footer-clipped` | clone footer max right 1438 > 1024 |
| `/` | 1100 | **BLOCKER** | 2 | 2 | 1 | `footer-clipped` | clone footer max right 1438 > 1100 |
| `/` | 1440 | MAJOR | 0 | 2 | 1 | `missing-text-ratio` | 2.73 % missing (thr 2.00 %) |
| `/pricing` | 390 | MINOR | 0 | 0 | 2 | `missing-text-ratio` | 0.40 % missing |
| `/pricing` | 700 | MAJOR | 0 | 2 | 2 | `column-container-mode-delta` | clone 3 rows × 2, source 2 rows × 4 |
| `/pricing` | 1024 | **BLOCKER** | 2 | 2 | 2 | `footer-clipped` | clone footer max right 1390 > 1024 |
| `/pricing` | 1100 | **BLOCKER** | 2 | 1 | 2 | `footer-clipped` | clone footer max right 1390 > 1100 |
| `/pricing` | 1440 | MINOR | 0 | 0 | 2 | `missing-text-ratio` | 0.28 % missing |
| `/security` | 390 | MAJOR | 0 | 1 | 2 | `column-mode-delta` | clone widest row 2 items, source 8 |
| `/security` | 700 | MAJOR | 0 | 3 | 3 | `column-container-mode-delta` | clone 3 rows × 2, source 2 rows × 4 |
| `/security` | 1024 | **BLOCKER** | 1 | 4 | 2 | `footer-clipped` | clone footer max right 1390 > 1024 |
| `/security` | 1100 | **BLOCKER** | 1 | 3 | 2 | `footer-clipped` | clone footer max right 1390 > 1100 |
| `/security` | 1440 | MAJOR | 0 | 1 | 2 | `column-mode-delta` | clone widest row 6 items, source 8 |
| `/changelog` | 390 | MINOR | 0 | 0 | 1 | `pixel-residual-difference-ratio` | 10.33 % of compared pixels |
| `/changelog` | 700 | MAJOR | 0 | 3 | 1 | `column-container-mode-delta` | clone 3 rows × 2, source 3 rows × 4 |
| `/changelog` | 1024 | **BLOCKER** | 1 | 3 | 2 | `footer-clipped` | clone footer max right 1390 > 1024 |
| `/changelog` | 1100 | **BLOCKER** | 1 | 3 | 1 | `footer-clipped` | clone footer max right 1390 > 1100 |
| `/changelog` | 1440 | MINOR | 0 | 0 | 2 | `pixel-residual-difference-ratio` | 3.12 % of compared pixels |

Channel census over the 20 pairs (BLOCKER + MAJOR occurrences, not pairs):

| severity | channel | occurrences |
|---|---|---:|
| BLOCKER | `footer-clipped` | 8 |
| BLOCKER | `offscreen-text-excess-chars` | 4 |
| BLOCKER | `image-presence-ratio` | 1 |
| BLOCKER | `missing-text-ratio` | 1 |
| BLOCKER | `visible-text-ratio` | 1 |
| BLOCKER | `overlap-excess-ratio` | 1 |
| MAJOR | `position-delta-p90-px` | 13 |
| MAJOR | `column-container-mode-delta` | 8 |
| MAJOR | `column-mode-delta` | 6 |
| MAJOR | `missing-text-ratio` | 4 |
| MAJOR | `offscreen-text-excess-chars` | 4 |
| MAJOR | `overlap-excess-ratio` | 1 |
| MAJOR | `right-gutter-excess-ratio` | 1 |

The nine BLOCKER pairs collapse to **two causes**: eight of them (all four routes at 1024 and 1100) are one
horizontal-overflow defect; the ninth (`/` @700) is a separate tree-selection defect. Both are diagnosed below.

**PASS is not a usable grade here.** 0 of 20 pairs reached it, and the harness says so itself: the best pixel
residual on the whole run is 1.52 % of compared area on `/pricing` @1440, against a 1 % MINOR threshold — but
only 2.84 % of that page's pixels are ink at all, so the "1 % of the page" threshold is 35 % of everything the
page draws. Grading was done on `blockerPairs` / `majorPairs`, as instructed. I did **not** run `--self-check`,
so I cannot state the instrument's own floor for this source (see §5).

---

## 3. Hypothesis 1 — the `/pricing` comparison-table band. **CONFIRMED FIXED.**

**Prediction:** the band on the comparison-table rows becomes `(max-width: 1024px)` and the 1100 BLOCKER clears.

**Emitted media string, quoted verbatim from `app/public/wr/generated-styles.css`:**

```css
@media (max-width: 1024.98px) {
[data-wr-page="p000003"][data-wr-viewport="desktop"] [data-wr-node="n000925"] {
  display: none;
}
}
```

`1231.98` does not appear anywhere in the generated stylesheet — `grep -c 1231.98` returns **0**. The sheet
contains exactly **one distinct `@media` string**, `@media (max-width: 1024.98px)`, in **529** blocks. All 529
recovered banded rules use it; there is no second band. (The `.98` is the engine's fractional-viewport
convention, `bandMedia()` in `layout-inference.ts:2222`; it means the clone hides across ≤ 1024.98 where the
source hides across ≤ 1024, a ≤ 1 px disagreement that only exists on fractional-DPR widths.)

**The rows are the right rows.** Walking the shipped runtime tree for `/pricing` down to the text node
`"Multiple tenants"` gives the chain

```
n000001 › n000002 › n000003 › n000007 › n000059(main) › n000339 › n000352 › n000353 › n000389
       › n000910 › n000925 › n000926 › n000928(span) › "Multiple tenants"
```

and **n000925, n000926 and n000928 each carry exactly one recovered rule: `@media (max-width: 1024.98px) { display: none }`**.
Those are the comparison-table cell ancestors the 28.5B BLOCKER named.

**Grader confirmation.** `/pricing` @1100 missing text is now **7 characters over 2 strings**, samples
`["us$", "6"]` — 0.28 %, a MINOR. The 28.5B BLOCKER's samples (`"multiple tenants"`, `"google + saml"`,
`"15 pipelines"`, `"5 levels"`, `"1 level"`) are **absent from every missing-text sample list on this run, at
every width.** The comparison table renders across 1025–1231 in the clone, as it does in the source.

**Before / after at all five widths.** I measured only the "after" column. The "before" column is quoted from
`docs/result/28.6/00-defect-ledger.md` §A7 and is *not* something I re-ran; there is no prior
`responsive-qa` run on disk for this host (`data/linear.app/responsive-qa/` contained only my run).

| `/pricing` | before (ledger A7) | after (measured, run `2026-09-02T20-25-10-759Z`) |
|---|---|---|
| 390 | not recorded in the ledger | MINOR — 0.40 % missing text |
| 700 | not recorded | MAJOR — column-container mode 3×2 vs 2×4 |
| 1024 | not recorded | BLOCKER — `footer-clipped` (1390 > 1024), **not** a comparison-table miss |
| 1100 | **BLOCKER**, missing-text samples = comparison-table cells | **BLOCKER** — `footer-clipped` (1390 > 1100); missing text 0.28 %, samples `us$`, `6` |
| 1440 | not recorded | MINOR — 0.28 % missing text |

So: **the named defect is gone; the pair is still a BLOCKER, on a different and previously-masked channel.**

**Attribution, honestly.** The band edge moved 1231.98 → 1024.98, i.e. 207 px. Essentially all of that is the
**probe-width derivation**, not the **edge snap**: the derived width set puts 1024 and 1025 adjacent, so the
midpoint the old code would have computed is already 1024. The manifest's `bandEdgeSnapShiftPx` is **529 across
529 snapped edges — exactly 1.0 px per edge.** The snap is doing the last pixel; OBS-D did the other 206.

---

## 4. Hypothesis 2 — grid track recovery on `/pricing`. **FALSIFIED (mostly).**

**Prediction:** with a denser breakpoint-derived width set, many of the 57 containers that refused
`tracks-not-reproducible-at-every-width` recover a track list.

**Measured, per page** (my `tmp/wr286/linear-gate/per-page-layout.ts`, which calls `inferLayoutRules()` once per
page with the shipped SiteSpec and `breakpoint = 915`; the 4-page total reproduces the shipped manifest's
counters exactly, so the per-page split is sound):

| page | route | grid containers reaching the check | track lists recovered | refused | refusal reasons |
|---|---|---:|---:|---:|---|
| p000001 | `/` | 182 | 1 | 181 | `no-probe` 151, `container-width-constant` 25, `no-computed-tracks` 5 |
| p000002 | `/changelog` | 19 | 0 | 19 | `container-width-constant` 8, `child-count-not-multiple-of-tracks` 11 |
| p000003 | `/pricing` | **70** | **1** | **69** | **`tracks-not-reproducible-at-every-width` 59**, `container-width-constant` 8, `children-do-not-tile-tracks` 1, `child-count-not-multiple-of-tracks` 1 |
| p000004 | `/security` | 17 | 1 | 16 | `container-width-constant` 8, `child-count-not-multiple-of-tracks` 7, `children-do-not-tile-tracks` 1 |
| **all 4** | | **288** | **3** | **285** | `no-probe` 151, `tracks-not-reproducible-at-every-width` 59, `container-width-constant` 49, `child-count-not-multiple-of-tracks` 19, `no-computed-tracks` 5, `children-do-not-tile-tracks` 2 |

**On `/pricing`, 1 of 70 containers recovers a track list and 59 still refuse
`tracks-not-reproducible-at-every-width`.** The ledger's baseline was "1 of 58 refuses
`container-width-constant`, 57 refuse `tracks-not-reproducible-at-every-width`". The populations are not
directly comparable — 70 containers reach the check now against 58 then, and `container-width-constant` went
1 → 8 — so I will not call it a regression. What I can say flatly: **the denser width set did not unlock this
class. 59 containers still refuse for want of a width where the children are visible and the container width
differs.**

**But the one that did recover is the important one.** The single `/pricing` recovery is node **n000357**,
whose five children are `Features | Free | Basic | Business | Enterprise` — the comparison table's header row —
and its emitted rule is

```css
[data-wr-page="p000003"][data-wr-viewport="desktop"] [data-wr-node="n000357"] {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.007fr);
}
```

That is exactly the `2fr repeat(4, 1fr)` shape the 28.5C investigation predicted the source authors, recovered
from probe evidence alone with no authored-CSS replay. The widths that made it possible (1025 / 1100 / 1280)
did not exist in the 28.5B probe set. The mechanism works; it is starved.

The three track rules emitted across the whole run:

| page | node | recovered tracks |
|---|---|---|
| p000001 | n000116 | `minmax(0, 1fr)` |
| p000003 | n000357 | `minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.007fr)` |
| p000004 | n000249 | `minmax(0, 1fr) minmax(0, 1fr)` |

---

## 5. Every BLOCKER and MAJOR, diagnosed

### BLOCKER-1 (8 pairs) — `footer-clipped` + `offscreen-text-excess-chars` at 1024 and 1100 on all four routes

**Root cause: `contentAt()` divides by the parent's padding frozen at the 1440 truth viewport, and Linear
authors that padding responsively through a custom property. The engine therefore concludes that a box which
genuinely fills its parent does not, refuses to restate its width, and ships it at a frozen desktop pixel
value.**

`src/reconstruction/layout-inference.ts:1453` states the assumption in its own comment:

> Padding is read from the parent's exact computed style (px at the truth viewport, **assumed constant-px**).

Here is the evidence the engine had, for `/pricing` node **n000064** (`<h1>`, computed `width: 1344px`,
`box-sizing: border-box`, parent `n000061`, parent's frozen horizontal padding 92 px). Desktop probe widths are
those ≥ the generated breakpoint 915, i.e. `928, 929, 1024, 1025, 1100, 1280, 1281, 1440, 1441, 1920`:

| probe width | node width | parent border-box | `contentAt()` = parent − 92 | node − contentAt | the parent's **real** horizontal padding |
|---:|---:|---:|---:|---:|---:|
| 928 | 872 | 928 | 836 | **+36** | 56 |
| 929 | 873 | 929 | 837 | **+36** | 56 |
| 1024 | 968 | 1024 | 932 | **+36** | 56 |
| 1025 | 1005 | 1025 | 933 | **+72** | 20 |
| 1100 | 1080 | 1100 | 1008 | **+72** | 20 |
| 1280 | 1260 | 1280 | 1188 | **+72** | 20 |
| 1281 | 1189 | 1281 | 1189 | 0 | 92 |
| 1440 | 1344 | 1436 | 1344 | 0 | 92 |
| 1441 | 1344 | 1436 | 1344 | 0 | 92 |
| 1920 | 1344 | 1436 | 1344 | 0 | 92 |

The node fills its parent's content box at **every one of the ten widths**. But `FULL_WIDTH_TOLERANCE_PX = 2`
(`layout-inference.ts:69`), so `fullWidthEverywhere` is `false`; `cappedFill` is `false`; the percentage branch
sees `ratioSpread = 0.0772` against `PERCENTAGE_RATIO_TOLERANCE = 0.01` and also refuses; the centered branch
needs a constant width and gets a 472 px range. **No branch fires, so no rule is emitted and no refusal is
counted** — this path `continue`s past every counter, which is why the manifest's honest-looking
`widthModeRefusals: 7` does not see it.

The node therefore ships with its exact computed `width: 1344px`. In the clone at 1100 the parent's padding is
also frozen at 46 px a side, so the child's right edge is 46 + 1344 = **1390 px** — which is exactly the
`contentMaxRight` the grader measured on `/pricing`, `/security` and `/changelog` at both 1024 and 1100. On `/`
the same arithmetic with a 1436 px shell gives **1438 px**, again exactly what the grader measured.

Where the responsive padding lives, and why the engine cannot see it: the parent's authored rule is
`padding-left: var(--page-padding-left)` with `media = (none)` (dumped from the SiteSpec's `authoredLayout` for
n000061). The responsive change is in the **custom property's** value under a media query, and the generated
sheet carries `--page-padding-left: max(0px, 24px)` **8 times — once per page × viewport, all identical**, i.e.
the value resolved once at 1440. So the engine holds the fact that the padding is variable and holds no value
for it at any other width.

Blast radius, measured three ways:

| measurement | `/` | `/changelog` | `/pricing` | `/security` |
|---|---:|---:|---:|---:|
| elements whose frozen computed width exceeds 1100 px | 20 | 30 | **94** | 16 |
| blockish nodes with a probed parent | 217 | 773 | 679 | 241 |
| …of those, the frozen-padding predicate passes for | 74 | 525 | 210 | 102 |
| …refused, but the probe shows them tracking the parent's content box (my estimator, **not** an engine counter) | 7 | 29 | 36 | 12 |

Live confirmation on the built clone (`npx next start`, Playwright, `/pricing` at 1100): **478 elements** have a
right edge past 1100 px; the top of the list is `width: 1440px` / `1436px` / `1344px` boxes, every one of them
without a recovered rule.

**Why this is not a regression from the width-derivation change.** Under the 28.5B probe set the desktop
samples were `1024 / 1440 / 1920`; the 1024 row above already shows a +36 px mismatch, so the predicate failed
there too. This defect is orthogonal to probe density and was simply masked at 1100 by the band defect that
used to hide these boxes.

### BLOCKER-2 (1 pair) — `/` @700: `image-presence-ratio`, `missing-text-ratio`, `visible-text-ratio`

**Root cause: the tree-switch breakpoint is still a midpoint guess of the two observed viewport widths, while
every *band* edge is now snapped to an authored breakpoint.**

`src/reconstruction/responsive-plan.ts:77-79`:

```ts
value: Math.floor((mobile.width + desktop.width) / 2),
provenance: "inferred",
method: "observed-endpoint-midpoint",
```

`floor((390 + 1440) / 2) = 915`. The clone serves the **390-observed mobile tree** for every width below 915.
Linear's own authored switches at `768 / 769` and `928 / 929` sit inside that range.

Measured consequence:

| | source | clone |
|---|---:|---:|
| `/` @390 visible text chars | 3 457 | 3 462 |
| `/` @390 visible nodes | 977 | 979 |
| `/` @700 visible text chars | **7 504** | **3 462** |
| `/` @700 visible nodes | 2 869 | 979 |
| `/` @700 image leaves | 254 | 94 |
| `/` @700 max columns | 28 | 8 |

At 390 the clone is a near-exact match. At 700 it serves **byte-for-byte the same tree it serves at 390**, while
the source has already switched to its wider layout. Hence 50.81 % missing text, 37 % of the images, 46.1 % of
the visible text — three BLOCKER channels off one cause.

The engine had the evidence to do better and did not use it: the authored-breakpoint histogram is resolved per
page at `layout-inference.ts:1259` and used for band snapping, and the mobile-context probe sampled this exact
page at `390, 480, 600, 601, 640, 641, 700, 768, 769, 914`. `inferBreakpoint()` consults neither.

### BLOCKER-3 (1 pair, secondary on `/` @1024) — `overlap-excess-ratio` 18.83 % vs source 13.52 %

Downstream of BLOCKER-1: frozen 1436/1344 px boxes inside a 1024 px viewport overlap each other. No independent
cause found.

### MAJOR-1 (13 occurrences) — `position-delta-p90-px`

Fires on every pair at 700, 1024 and 1100 (p90 220–696 px) and on `/` at 1440 (64 px). Same cause as
BLOCKER-1: frozen widths displace everything to their right. The `/` @1440 instance is the only one that is
*not* explained by overflow, and I did not isolate it.

### MAJOR-2 (8) / MAJOR-3 (6) — `column-container-mode-delta`, `column-mode-delta`

"clone lays children out as 3 rows of 2 where the source uses 2 rows of 4", and "clone's widest row holds 2/6
items where the source's holds 8". This is the grid/flex track defect of §4 seen from the grader's side: with 3
track lists recovered across 12 521 nodes, every other grid ships its 1440-resolved frozen tracks and reflows
into the wrong number of columns. `/security` @390 and @1440 (2/8 and 6/8) are the logo/feature rows; note @1440
is *not* an overflow width, so this MAJOR is a genuine independent defect and not a shadow of BLOCKER-1.

### MAJOR-4 (4) — `missing-text-ratio` on `/` at 390/1024/1100/1440 (2.17 %–4.11 %)

The harness itself flags these as dwell-sensitive: the **source** revealed 504 / 310 / 519 / 404 characters
during the scroll dwell and the clone revealed 0. That is animation and lazy reveal on a live marketing page,
not necessarily absent content. Separating the two needs `--self-check`, which I did not run.

### MAJOR-5 (4) — `offscreen-text-excess-chars` on `/security` and `/changelog` at 1024/1100 (70 chars each)

Downstream of BLOCKER-1 — 70 characters of footer link text pushed past the right edge.

### MAJOR-6 (1) — `right-gutter-excess-ratio`, `/changelog` @700

Clone right gutter 147 px vs source 35 px. Mobile-tree-at-700, same family as BLOCKER-2.

---

## 6. Engine-change measurements

### 6.1 Cross-origin CSS recovery — **works, 0 misses**

Per page × viewport, from each `observation.json`'s `stylesheetCoverage`:

| page | route | vp | sheets | CSSOM readable | CSSOM **blocked** | **fallback recovered** | **fallback missed** | bytes captured | bytes bridged | rules indexed | elements w/ authored rules |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| p000001 | `/` | desktop | 84 | 30 | 54 | **54** | **0** | 485 984 | 331 365 | 2 252 | 2 275 |
| p000001 | `/` | mobile | 78 | 24 | 54 | **54** | **0** | 466 840 | 331 365 | 2 163 | 2 278 |
| p000002 | `/changelog` | desktop | 84 | 35 | 49 | **49** | **0** | 486 999 | 242 575 | 2 246 | 2 257 |
| p000002 | `/changelog` | mobile | 79 | 30 | 49 | **49** | **0** | 454 792 | 242 575 | 2 157 | 2 257 |
| p000003 | `/pricing` | desktop | 81 | 51 | 30 | **30** | **0** | 446 449 | 151 145 | 2 085 | 1 363 |
| p000003 | `/pricing` | mobile | 73 | 43 | 30 | **30** | **0** | 415 860 | 151 145 | 2 028 | 1 363 |
| p000004 | `/security` | desktop | 79 | 51 | 28 | **28** | **0** | 449 101 | 135 790 | 2 083 | 364 |
| p000004 | `/security` | mobile | 71 | 43 | 28 | **28** | **0** | 406 838 | 135 790 | 1 957 | 364 |

`sheetsBodyUnavailable = 0`, `sheetsSkippedBySizeCap = 0`, `importsUnresolved = 0`, `ruleIndexCapHit = false`
everywhere. **322 of 322 cross-origin-blocked stylesheets were recovered; none was missed.** For context, 28.5C
recorded 34 of 3 254 authored declarations reaching `authoredLayout` on this site; this run's SiteSpec carries
**106 462 authored declarations examined, 0 unparsed** (`authoredBreakpointDeclarations` /
`authoredBreakpointUnparsedDeclarations` in the reconstruction manifest), across **27 authored breakpoint
entries** on **4 pages**, all with provenance `spec-field`. 1 041 nodes had their authored-rule list truncated
(`authoredBreakpointTruncatedNodes`).

### 6.2 Derived probe widths and their provenance

Identical on all four pages. Desktop floor `390, 700, 768, 1024, 1100, 1440, 1920`; mobile floor
`390, 480, 700, 768, 914`.

**Desktop pass (all 4 pages, byte-identical provenance):**

```
probed: 390, 640, 641, 700, 768, 769, 928, 929, 1024, 1025, 1100, 1280, 1281, 1440, 1441, 1920   (16 = cap)
```

| field | value |
|---|---|
| conditions read / weight | 31 / 385–411 depending on page |
| breakpoints folded | 14 |
| adopted (both sides sampled) | 6 |
| already bracketed by the floor | 4 |
| out of range | 0 |
| **dropped by the 16-width cap** | **4** — `min-width:1536` (w 2), `max-width:600` (1), `max-width:1140` (1), `max-width:1439` (1) |
| widths added over the floor | 9 |
| conditions width-irrelevant / unsupported / unparsed | 154–159 / 2 / 0 |
| degraded to floor | no |

Origins: `390 floor · 640 authored-below(max 640) · 641 authored-above · 700 floor · 768 floor+authored ·
769 authored-above(max 768) · 928 authored-below(max 928) · 929 authored-above · 1024 floor+authored ·
1025 authored-above(max 1024) · 1100 floor · 1280 authored-below(max 1280) · 1281 authored-above ·
1440 floor+authored · 1441 authored-above(max 1440) · 1920 floor`.

**The 1024/1025 pair is adjacent, which is the whole mechanism behind §3.** The cap is binding: four authored
breakpoints were refused for budget, itemised rather than silently dropped.

**Mobile pass (all 4 pages):** probed `390, 480, 600, 601, 640, 641, 700, 768, 769, 914` — 10 widths, cap not
hit, 3 breakpoints adopted, 2 already bracketed, **9 refused `out-of-range`** (1024, 1280, 928, 1281, 1440,
1536, 1025, 1140, 1439 — all above the 914 mobile envelope), 5 widths added.

### 6.3 Band-edge snapping

From `reconstruction-manifest.json` → `layout`:

| counter | value |
|---|---:|
| `bandEdgesConsidered` | 529 |
| `bandEdgesOpen` (open downward, handled by the generated breakpoint) | 529 |
| **`bandEdgesSnapped`** | **529** |
| `bandEdgesSnappedAmbiguous` | 0 |
| `bandEdgesKeptMidpointNoAuthoredInGap` | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 |
| `bandEdgeSnapShiftPx` (total) | 529 → **1.0 px per edge** |
| `bandSampleMismatches` | 0 |

**529 of 529 closed edges snapped to an authored breakpoint; 0 kept a midpoint.** Per page: `/` 7, `/changelog`
11, `/pricing` 503, `/security` 8.

### 6.4 Inline-size decision split

| decision | count | notes |
|---|---:|---|
| `widthModeStretch` (`width: auto`) | 571 | |
| `widthModeFillPercentage` | 21 | |
| `widthModeRefusals` | **7** | `flex-item-main-axis` 5, `grid-item-inline-size` 1, `out-of-flow-auto-margin` 1 |
| `widthValueRefusals` | 0 | |
| containing-block guard refusals | **112** | `grid-item` 53, `flex-item-basis-governed` 37, `abs-containing-block-is-padding-box` 14, `fixed-position` 8 |

Per page (rules emitted / stretch / fill-% / mode-refusals): `/` 18 / 8 / 1 / 1 · `/changelog` 449 / 415 / 15 /
1 · `/pricing` 622 / 113 / 4 / 3 · `/security` 46 / 35 / 1 / 2.

**Read this table against §5 BLOCKER-1.** Only 7 nodes were *refused* an inline-size mode across four pages,
but hundreds never reached the refusal at all, because the shape predicates upstream of it (`fullWidthEverywhere`,
`cappedFill`, ratio-constant) are evaluated against a wrong denominator and simply `continue`. The refusal
accounting is honest about what it sees; it does not see this population.

Emitted rule mix, parsed straight out of the generated stylesheet (1 135 rules, matching the manifest exactly):
`width` 603, `display` 529, `margin-left`/`margin-right` 14 each, `max-width` 14, `grid-template-columns` 3.
All 1 135 carry `[data-wr-viewport="desktop"]`; **zero recovered rules target the mobile tree** (see §7).

### 6.5 Truth-check and band-check accounting — no exemptions

| counter | value |
|---|---:|
| `candidateRules` | 1 135 |
| `acceptedRules` | **1 135** |
| `rejectedByGuard` | 112 |
| `rejectedByTruthCheck` | **0** |
| `rejectedByBandCheck` | **0** |
| `rejectedUnverifiable` | 0 |
| `acceptedUnchecked` | **0** |
| `acceptedRegressed` | 0 |
| `truthCheckable` (geometry rules) | 606 |
| `bandCheckable` (banded rules) | 529 |
| 606 + 529 | **= 1 135, i.e. every rule was checked** |
| `bandIndependentlyDiscriminated` | 529 |
| `bandExactTierHidesAtBandWidth` | **0** ⇒ 529 − 0 = 529 genuinely discriminated |
| `bandHiddenByAncestorAtBandWidth` | 344 (corroborates nothing; counted, not exempted) |
| `bandTruthBaselineNotInLayout` | 0 |
| `truthCheckStatus` / `converged` | `verified` / `true` |
| rounds / pages rendered / widths rendered | 4 / 4 / 4 |

**Every drop is explained:** 112 guard refusals by named reason (§6.4), 7 width-mode refusals by named reason,
285 grid-track refusals by named reason (§4), 0 truth-check rejections, 0 band-check rejections, 0 accepted
unchecked. The "banded rules exempted from the truth check" failure mode the ledger warns about does not appear
in this run: `acceptedUnchecked = 0` and `bandCheckable = 529` account for all 529 banded rules.

### 6.6 The mobile-context probe is captured and never consumed

The new mobile probe ran on all four pages, sampling 10 widths with its own element identity, at a cost of
**2 411 757 bytes** of `layout-probe-mobile.json` and a share of the 81.6 s observation.

Nothing downstream reads it. `grep -rn "layoutProbeMobile" src/` returns hits only in
`src/cli-observe.ts`, `src/observer/types.ts`, `src/observer/store.ts`, `src/observer/observe-page.ts`.
`src/sitespec/compile-page.ts:182` reads `observation.layoutProbe` and only that, so the mobile probe does not
cross the SiteSpec boundary. `src/reconstruction/layout-inference.ts:1246` reads
`const viewport = page.viewports.desktop;` and `:2250` hardcodes `[data-wr-viewport="desktop"]` in the emitted
selector.

**Measured consequence:** 1 135 recovered rules, 1 135 of them desktop, **0 mobile**. Every pair at 390 and 700
is graded against a mobile tree carrying no recovered layout rule at all.

---

## 7. What I could NOT measure, and why

1. **The "before" grader verdicts.** There is no prior `responsive-qa` run for linear.app on disk — the
   directory contained only my run. Every "before" number in §3 is quoted from
   `docs/result/28.6/00-defect-ledger.md`, not re-measured. I did not re-run the old engine; that would have
   required editing `src/`, which this lane forbids.
2. **The instrument's own floor.** I did not run `pnpm qa:responsive --self-check`. Without it I cannot say how
   much of the MINOR pixel residual, and how much of the 2.17–4.11 % missing-text MAJORs on `/`, is the live
   source's own instability rather than clone defect. The harness names this limitation itself and the numbers
   it cites (504 source-revealed chars on the worst capture) are large enough to matter to those four MAJORs.
   **Treat the four `missing-text-ratio` MAJORs on `/` as unattributed.**
3. **Hypothesis 2's baseline population.** The ledger's "58 containers" and my "70 containers" are not the same
   measurement — I did not reconstruct the 28.5B artifact to count its containers the way I counted mine. The
   comparable, and falsifying, number is `tracks-not-reproducible-at-every-width`: 57 then, **59 now**.
4. **The blast-radius row in §5** labelled "my estimator" is mine, not an engine counter. The engine emits no
   counter for nodes that fall past every shape predicate, which is itself the finding.
5. **`/` @1440 `position-delta-p90-px` = 64 px.** The only MAJOR at a non-overflow width I did not trace to a
   cause. I ran out of the scope this lane was given before isolating it.
6. **Per-page grid-track and inline-size figures** were produced by re-invoking `inferLayoutRules()` on one page
   at a time (`tmp/wr286/linear-gate/per-page-layout.ts`). The 4-page total reproduces the shipped manifest
   exactly, so I trust the split, but it is a re-computation and not a number the pipeline itself wrote.
7. **The 4 cap-refused desktop breakpoints** (1536, 600, 1140, 1439) were not probed, so I cannot say whether
   any band edge in the run would have moved had the cap been higher. `MAX_PROBE_WIDTHS_TOTAL = 16` is binding
   on this site.

---

## 8. Cost, for planning the remaining pilots

| stage | wall clock | artifacts on disk |
|---|---:|---:|
| verify + select | ~22 s | 48 KB |
| **observe:site** (4 pages, 16 desktop + 10 mobile probe widths) | **81.6 s** | **111 MB** |
| detect + explore + model interactions | ~89 s | 5.3 MB |
| compile:sitespec | 2.5 s | 90 MB |
| reconstruct (+ truth check + `next build`) | 18.5 s | 44 MB |
| **qa:responsive** (20 pairs, both sides captured live) | **5 min 23 s** | **75 MB** |
| **total** | **18 min 41 s** incl. analysis | **325 MB** |

Roughly 26 MB and 20 s of observation per page, and 16 s per graded (route, width) pair. A 6-pilot wave at this
shape is ≈ 2 GB and ≈ 2 hours of wall clock, dominated by `qa:responsive`.

---

## 9. Verdict for the orchestrator

- The **band-edge defect this lane was built to test is fixed** and I can quote the shipped CSS to prove it.
  Cross-origin CSS recovery, breakpoint-derived probe widths, band snapping and the no-exemption truth check
  all did on a real site exactly what they claim, with clean accounting.
- **The lane still fails its acceptance bar: 9 BLOCKER, 7 MAJOR, 0 PASS over 20 pairs.**
- Two engine defects, both generic, account for 9 of 9 BLOCKER pairs:
  1. `contentAt()` uses the parent's padding frozen at 1440 (`layout-inference.ts:1453`), so responsively
     padded shells refuse every width restatement and ship frozen px → horizontal overflow at every width
     below the truth viewport. 8 pairs.
  2. The tree-switch breakpoint is still `floor((390 + 1440) / 2)` (`responsive-plan.ts:77`) while band edges
     snap to authored breakpoints, so 700 px gets the 390 tree. 1 pair.
- A third, no BLOCKERs but 14 MAJOR occurrences: grid track recovery reaches 288 containers and emits 3 rules;
  and the mobile-context probe is captured (2.4 MB, 10 widths) and consumed by nothing.

**Program A is not closed by this run.** `NOT READY — ENGINE BLOCKERS REMAIN` on the evidence in this lane.
