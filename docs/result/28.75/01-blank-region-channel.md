# 28.75 / 01 — `blank-region-ratio`: the channel that can see a hole

**Lane:** `src/responsive-qa/{probe,blank-region,types,classify,correspondence,run,index}.ts`,
`scripts/smoke-responsive-qa.ts`.
**Status:** shipped. Rubric 4 → **5**. Suite 205 → **271** checks, all passing.
`pnpm typecheck` exit 0, repo-wide.

---

## 0. The gap this closes

`gs.severance.healthcare /gs/index.do @1440` graded **MINOR**. On that page the
clone's hero photograph is a white rectangle, the NEWS row carries **none** of
the source's four cards, and the promotional carousel carries none of its four.
The rubric reported:

```
image-presence-ratio   1.0
missing-text-ratio     0.0000
visible-text-ratio     1.0
```

Every number was right and the page was broken. The reason is structural: **every
channel in the rubric before this one is a PAGE TOTAL**, and a total cannot see a
hole. The content is all still *somewhere* on that clone — `left-edge-delta-median-px`
is 1,542 and both sides count 2,644 visible characters and 27 image leaves — it is
simply not where a reader looks for it.

The new channel asks the one question that finds it:

> for each meaningful container the SOURCE fills, does the CLONE's counterpart
> paint anything?

On the same pair it now reports `blank-region-ratio 1.4533` → **BLOCKER**.

---

## 1. Mechanism

Four stages. Every threshold in the pipeline is named, with the measurement that
set it.

```
  (1) REGION CENSUS      in-page, per side  → RegionBox[]  + RegionAccounting
  (2) CORRESPONDENCE     pure               → source region ↔ clone rectangle
  (3) TWO EVIDENCE LEGS  pure               → domBlank | inkBlank
  (4) BAND               pure               → MINOR / MAJOR / BLOCKER
```

### 1.1 Stage 1 — the region census (`src/responsive-qa/probe.ts`)

Runs inside the page, on both sides, in the same `page.evaluate` that already
does the leaf and text censuses. It walks every element and either SELECTS it as
a region or rejects it with **one enumerated reason**. Selection order is fixed,
so a rejection reason is a fact and not a preference:

| # | reason | test | why |
|---|---|---|---|
| 1 | `inside-svg` | an `<svg>` ancestor | an SVG's internals are one picture, not containers |
| 2 | `not-visible` | not in the visible set (display/opacity/visibility/ancestor) | a container nobody sees is not a region |
| 3 | `media-element` | tag in `IMAGE_TAGS` | **an `<img>` is its own leaf**, so it would read `paintRatio 1.0` on both sides and mean nothing |
| 4 | `no-element-children` | `childElementCount === 0` | a leaf is content, not a container |
| 5 | `offscreen` | box clipped to `[0,innerWidth]×[0,scrollHeight]` is empty | a carousel track measured 20,850,000 px² — 16 viewports — before clipping |
| 6 | `too-narrow` | width < `REGION_MIN_WIDTH_RATIO` (**0.2**) of the viewport | a sidebar rail is not a region a reader reads as a block |
| 7 | `too-short` | height < `REGION_MIN_HEIGHT_PX` (**60**) | one line of text is not a region |
| 8 | `too-small` | area < `REGION_MIN_VIEWPORT_AREA_RATIO` (**0.02**) of a viewport | 2 % of a screen is the floor at which a hole is worth a word |
| 9 | `duplicate-of-selected-ancestor` | all four edges within `REGION_BOX_DEDUPE_PX` (**4**) of an already-selected DOM ancestor | a chain of three wrappers around one visual box is one region |
| 10 | `cap-reached` | `MAX_REGIONS` (**400**) already selected | bounded cost; **truncation disarms the channel**, see §7 |

`MAX_REGIONS` was **120** and is now **400**. At 120, `hobbang.net /@390`'s clone
hit the cap (51 `cap-reached`) and 19 source regions lost their counterparts —
which is the *false-positive* direction. At 400 nothing measured reaches the cap
(§3.3).

Each selected region carries `visibleDescendants`, `textChars`, `imageElements`
and its clipped box. `textChars` is accumulated from the **same** text census
that produces `visibleTextChars`, so a region's characters are inside the page
total rather than beside it.

### 1.2 Stage 2 — correspondence

The clone carries `data-wr-node`; the live source does not. Three mechanisms, in
the order the detector tries them (measured, §2):

1. **`path-suffix`** — a clone region whose tag-path shares a suffix of at least
   `MIN_REGION_SUFFIX_SEGMENTS` (**2**) segments, greedy and one-to-one, ordered
   by `suffix length → geometric IoU → sibling-ordinal distance → index`.
   The IoU tie-break is not cosmetic: without it, seoultone's source `div/div[1]`
   (a 2-segment path) paired by document order to a 470×707 nav panel instead of
   the 1,440×4,060 body.
2. **`ancestor-mapped`** — no counterpart element, so the source box is mapped
   through the nearest **paired ancestor** region, with a scale guard of
   `REGION_MAP_SCALE_TOLERANCE` (**1.35**). This is the only reading that
   survives a whole-page vertical offset: seoultone's source and clone are both
   4,892 px tall and every clone section sits **1,164 px lower** because the
   source overlays its event popup and the clone lays it out in flow.
3. **`source-rect`** — the raw source rectangle, allowed **only** when
   `alignedGeometry` holds: page heights within `REGION_FALLBACK_HEIGHT_TOLERANCE`
   (**0.15**) **and** at least `REGION_ALIGNMENT_MIN_PAIRS` (**3**) pairs **and**
   both median offsets within `REGION_ALIGNMENT_TOLERANCE_PX` (**16 px**).
   Equal height alone is *not* sufficient and this was measured: `hobbang.net /@390`
   matches to 0.4 % in height and still puts its `<main>` 8,011 px lower.

A populated source region that none of the three can place is counted as
`unjudgedRegions`, never guessed at, and it makes the ratio a **lower bound** —
which the classifier says in a caveat.

### 1.3 Stage 3 — two independent evidence legs

Neither leg is trusted alone, and **each is self-consistent**: a region populated
only by ink is judged only by ink, one populated only by the DOM only by the DOM.

**Leg A — DOM paint.** `paintInsideBox` lays a `REGION_PAINT_GRID`² (**32×32**)
grid over the box and marks the cells any painted leaf touches. Cost is
O(leaves); quantisation rounds coverage **up**, which can only *suppress* a
finding. A leaf larger than `REGION_BACKDROP_AREA_FACTOR` (**2**) × the region's
area is a **backdrop** and is skipped on both sides — seoultone's clone paints a
decorative 3,600×3,240 `<svg>` (11.7 M px², 40× the 542×529 credential block)
that otherwise inflated an entirely empty block to 21.9 % painted with **zero**
leaves in it.

```
sourceRegionIsPopulated(region, paint) =
      paint.paintRatio  >= REGION_SOURCE_PAINT_RATIO      (0.06)
  AND paint.leafCount   >= REGION_SOURCE_MIN_LEAVES       (3)
  AND (paint.chars      >= REGION_SOURCE_MIN_CHARS (20) OR paint.imageLeaves > 0)
  AND region.visibleDescendants >= REGION_SOURCE_MIN_DESCENDANTS (3)

cloneRegionIsBlank(src, clone) =
      clone.paintRatio  <= REGION_CLONE_BLANK_PAINT_RATIO         (0.02)
  AND clone.paintRatio  <= src.paintRatio * REGION_CLONE_BLANK_RETAINED_RATIO (0.15)
  AND clone.leafCount   <= max(REGION_CLONE_BLANK_MIN_LEAF_ALLOWANCE (2),
                               src.leafCount * REGION_CLONE_BLANK_LEAF_RETAINED_RATIO (0.1))
```

Four source tests and three clone tests. The absolute floor (0.02) and the
*retained* ratio (0.15) are both required, because an absolute floor alone fires
on a region that was barely drawn on either side, and a retained ratio alone
fires on a region that went from 4 % to 0.5 %.

**Leg B — region ink.** `inkInsideBox` samples the side's own full-page
screenshot inside the box (stride derived from the box, budget
`REGION_INK_SAMPLE_BUDGET` = **40,000** px; refused below
`REGION_INK_MIN_SAMPLES` = **400**), bins colours at
`REGION_INK_HISTOGRAM_BITS` = **5** bits per channel, and calls a pixel *ink*
when its CIE L\*a\*b\* ΔE\*76 from the region's **own modal colour** exceeds the
shared `DELTA_E76_JND_THRESHOLD` (2.3). The modal colour is computed **per
region**, not per page: a coloured band's background is not the document's.

```
sourceRegionHasInk(region, ink)     = ink.available AND ink.inkRatio >= REGION_SOURCE_INK_RATIO (0.03)
                                      AND region.visibleDescendants >= 3
cloneRegionIsBlankByInk(src, clone) = both available
                                      AND src.inkRatio   >= 0.03
                                      AND clone.inkRatio <= REGION_CLONE_BLANK_INK_RATIO (0.05)
                                      AND clone.inkRatio <= src.inkRatio * REGION_CLONE_BLANK_INK_RETAINED_RATIO (0.15)
```

`REGION_CLONE_BLANK_INK_RATIO` was calibrated at **0.05** by measuring
bimodality on severance @1440: the hero goes 92.2 % → **3.3 %**, the NEWS band
38.0 % → **1.9 %**, and every healthy region retains 94–100 % (12.25→13.00,
76.09→76.20, 81.08→81.08). Nothing measured lands between 5 % and 94 % retained.

**Leg B has a precondition, and it is the single most important guard in the
channel.** Ink reads a DOM-measured rectangle out of a separately-taken picture;
if the page moved between the two, the rectangle names the wrong pixels, silently.
`inkTrustOf(side)` refuses ink unless all three hold:

| test | threshold | measured |
|---|---|---|
| a screenshot exists | — | — |
| it is a picture of this page: same height, at least as wide as the viewport | `REGION_INK_IMAGE_SCALE_TOLERANCE` **0.02** | a full-page capture of a horizontally overflowing page is *wider* with the origin unmoved (severance @1100 → 1,280 px for an 1,100 px viewport) and indexes correctly; narrower or a different height does not |
| the census reaches down the page: `min(deepest painted leaf, scrollHeight) / scrollHeight` | `REGION_INK_DOM_COVERAGE_MIN` **0.8** | **hobbang 0.51 / 0.50**; severance 0.98/1.00, seoultone 0.98/1.00, linear 1.00/1.00. Nothing measured falls between 0.51 and 0.98 |

The coverage test is what removed the channel's only two false positives — see
§5. When it fails the ink leg is withheld **for the whole pair**, the channel
becomes DOM-only, and the classifier raises a caveat naming the loss of
sensitivity. That is a real loss, deliberately taken: DOM-only is the
configuration that grades the severance hero healthy.

### 1.4 Stage 4 — the value

Blanked regions are reduced to the **maximal** ones (a blanked region wholly
inside another is dropped, so nesting depth cannot drive the value), their boxes
are unioned **exactly** by coordinate compression, and

```
blank-region-ratio = unionArea(maximal blanked source boxes) / (innerWidth * innerHeight)
```

The unit is *viewport-fulls of hole*. It can exceed 1 — a long page can hold more
than a screen of nothing.

---

## 2. The correspondence experiment

Bounded, in `tmp/wr2875/blank-region/`. Four candidate mechanisms measured on the
same real captured pairs, hit rate reported rather than an opinion:

- **A** exact structural path
- **B** shared tag-path suffix, k = 1..4, greedy and one-to-one
- **C** leaf-set carry (map through the clone leaves whose keys match the source
  leaves inside the region)
- **D** the same rectangle read on the other side

| pair | source regions | A exact | B k=1 | **B k=2** | B k=3 | B k=4 | C leaf-carry | identical boxes of the k=2 pairs | median &#124;Δtop&#124; |
|---|---|---|---|---|---|---|---|---|---|
| severance @1440 | 49 | **0 %** | 73 % | **71 %** | 63 % | 49 % | 92 % | 31/35 | 0 px |
| severance @1100 | 58 | **0 %** | 72 % | **66 %** | 59 % | 48 % | 66 % | 10/38 | 0 px |
| linear /pricing @1440 | 26 | **0 %** | 100 % | **96 %** | 96 % | 88 % | 38 % | 25/25 | 0 px |
| linear /pricing @390 | 49 | **0 %** | 100 % | **98 %** | 98 % | 94 % | 65 % | 48/48 | 0 px |
| hobbang @1440 | 71 | **0 %** | 100 % | **96 %** | 83 % | 70 % | 92 % | 1/68 | 5,269 px |
| hobbang @390 | 96 | **0 %** | 100 % | **97 %** | 88 % | 78 % | 82 % | 0/93 | 8,666 px |

**Chosen: B at k = 2, with a geometric IoU tie-break, backed by ancestor-anchored
mapping and a gated raw rectangle.**

Why the others were rejected, on these numbers:

- **A is dead — 0 % on every pair, without exception.** The generator bolts a
  fixed shell prefix onto every clone path (`div/main/...` becomes
  `div[1]/div/div/main/...`), so no full path ever matches. This is the same fact
  item C3.4 records for leaves; it holds for regions too.
- **B at k = 1** is one tag name and pairs unrelated `div`s; at **k = 3** it
  drops 8–13 points on severance and hobbang for no measured gain in precision;
  at **k = 4** it loses a fifth to a half of the census.
- **C** yields no box. It answers "did this content survive?", which is what
  `missing-text-ratio` already answers and which is **0.0** on the severance pair
  this channel exists for. It also swings 38–92 % across pairs, so it is not a
  reliable primary.
- **D** is measured and kept only as a **gated fallback**. The right-hand columns
  are the reason: on linear it is exact (25/25, 48/48 identical boxes) and on
  hobbang it is off by 5,269 and 8,666 px. A raw rectangle that is trusted
  unconditionally invents a hole on every offset page, which is exactly what it
  did before `alignedGeometry` was introduced.

---

## 3. Region selection on real data

### 3.1 The predicate

An element is a region when it is a **visible, non-media, non-SVG container with
element children** whose clipped box is at least 20 % of the viewport wide, at
least 60 px tall, at least 2 % of a viewport in area, and not a geometric
duplicate of an already-selected ancestor.

### 3.2 The rejection histogram

Twelve real sides (6 pairs × 2), pinned reconstructions, live sources:

```
examined 32,652    selected 790    rejected 31,862    selected + rejected == examined ✔

 15,854  49.8 %  not-visible
  7,686  24.1 %  inside-svg
  3,372  10.6 %  no-element-children
  1,654   5.2 %  too-narrow
  1,206   3.8 %  offscreen
  1,087   3.4 %  too-short
    866   2.7 %  media-element
    126   0.4 %  duplicate-of-selected-ancestor
     11   0.0 %  too-small
      0   0.0 %  cap-reached
histogram sums to 31,862 == rejected ✔
```

The accounting conserves on every side, and it is asserted in the suite in a real
browser rather than assumed.

### 3.3 What the histogram says

`not-visible` at half of all rejections is the clone shipping both viewport
subtrees — everything it ships and does not paint lands there. That is why the
selected counts are cross-side comparable and the *examined* counts are not.
`cap-reached` is **0** everywhere at `MAX_REGIONS = 400`; at 120 the hobbang
clone alone contributed 51.

---

## 4. Acceptance fixtures

Measured on the pinned reconstructions, through the **real** `qa:responsive`
pipeline (not the scratch harness). Run ids are the responsive-qa run directories.

| # | site | route | width | required | **fired?** | value | severity | regions named | run id |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `gs.severance.healthcare` | `/gs/index.do` | 1100 | MUST FIRE | **YES** | 1.4533 | **BLOCKER** | `div/article/div` (hero, ink), `div/article/div[2]` (NEWS, ink), `div/article/div[3]/div/div/div` (carousel, dom) | `2026-09-04T22-53-01-661Z` |
| 2 | `gs.severance.healthcare` | `/gs/index.do` | 1440 | MUST FIRE | **YES** | 1.4533 | **BLOCKER** | same three | `2026-09-04T22-53-01-661Z` |
| 3 | `seoultone.kr` | `/` | 390 | MUST FIRE | **NOT MEASURED** | — | — | source origin offline (§4.1) | — |
| 4 | `seoultone.kr` | `/` | 1440 | MUST FIRE | **NOT MEASURED** | — | — | source origin offline (§4.1) | — |
| 5 | `linear.app` | `/pricing` | 390 | MUST NOT FIRE | **NO** | 0 | — (pair MINOR on other channels) | none | `2026-09-04T22-53-25-263Z` |
| 6 | `linear.app` | `/pricing` | 1440 | MUST NOT FIRE | **NO** | 0 | — (pair MINOR) | none | `2026-09-04T22-53-25-263Z` |
| 7 | `hobbang.net` | `/` | 390 | MUST NOT FIRE | **NO** | 0 | — (pair MINOR) | none | `2026-09-04T22-53-52-081Z` |
| 8 | `hobbang.net` | `/` | 1440 | MUST NOT FIRE | **NO** | 0 | — (pair MINOR) | none | `2026-09-04T22-53-52-081Z` |

Pinned reconstructions: severance `2026-09-04T18-14-47-300Z`, seoultone
`2026-09-04T18-17-23-059Z`, linear `2026-09-04T17-24-33-839Z`, hobbang
`2026-09-04T18-16-31-732Z`.

### 4.1 seoultone: honest status

`seoultone.kr` served a Cafe24 outage page for the whole verification window.
Every capture attempt returns a 937 px (@1440) / 907 px (@390) placeholder with
**10 leaves and 6–8 regions** instead of the 4,892 px / 29–48 region page, and
`curl` to the origin fails at the TLS handshake (exit 35). The screenshot of the
outage page is in `tmp/wr2875/blank-region/data/seoultone-1440-source.png`. A
retry loop ran twelve attempts over the session and the origin did not come back.

Two earlier captures in this session *did* get a live source (48 regions / 168
leaves @390, 29 regions / 169 leaves @1440, `capture-all.log`); those JSON files
were overwritten by a later attempt before the current detector existed, so no
valid seoultone reading survives.

**These two rows are therefore reported as NOT MEASURED, not as passing.** What
*is* verified about the seoultone shape:

- the mechanism it needs — `ancestor-mapped` correspondence across a 1,164 px
  whole-page offset — has a dedicated permanent fixture (H8), including the
  negative control that the raw source rectangle would **not** have found it;
- the backdrop rule that was derived from seoultone's decorative 3,600×3,240
  `<svg>` has a permanent fixture (H6);
- a pre-outage measurement with a partly-degraded source capture reported @1440
  `0.2212` (MAJOR) naming `div/div[1]/section[1]/div[1]`, and @390 `0.466`
  (BLOCKER). Those numbers are recorded here for continuity and are **not**
  offered as acceptance evidence, because the source side of that capture was
  already degraded.

**Carry-forward:** re-run pairs 3 and 4 when `seoultone.kr` is reachable. This is
a one-command check: `npx tsx src/cli-qa-responsive.ts
data/seoultone.kr/reconstructions/2026-09-04T18-17-23-059Z --routes / --widths 390,1440`.

### 4.2 The images were read, not just the numbers

**The severance @1440 composite confirms all three regions by eye**, in
`data/gs.severance.healthcare/responsive-qa/2026-09-04T22-53-01-661Z/images/02-gs-severance-healthcare-gs-index-do-1440-composite.png`
(SOURCE left, FINAL reconstruction right):

| region the channel names | what the composite shows |
|---|---|
| `div/article/div` @ y=215–715 | source: the hospital photograph with a white headline over it. clone: **an empty white rectangle**, only the two small floating pills survive |
| `div/article/div[2]` @ y=1481–1872 | source: four dated news cards on the navy NEWS band. clone: **the navy band with zero cards** |
| `div/article/div[3]/div/div/div` @ y=1937–2354 | source: four round promo cards over the entrance photograph. clone: **the photograph with no cards at all** |

Those are precisely the three regions a human calls broken on that page, and
they are the three the channel reports. Nothing else on the page is reported.


- **severance @1440 clone hero.** Sampled directly: the band is **92.6 % flat
  white** with a blue pill, while its DOM is perfect (`loaded: true`, opacity 1,
  exact geometry). This is what the ink leg was built for.
- **hobbang @1440.** The source's `section[10]` crop at y=1,140 (a grey card
  grid) and the clone's at its own y=6,409 (a text list) are **different
  sections**, yet the two full-page screenshots are 94 % pixel-identical **at the
  same y**. That is the proof that hobbang's *source* DOM census and its *own*
  screenshot disagree, not that the clone lost anything — see §5.

---

## 5. Which mechanism is caught by which channel

The diagnostic lane (`02-js-dependent-content-root-cause.md`) named three
distinct root causes behind the four must-fire regions. Measured, by running the
detector twice per pair — once with screenshots and once without:

| mechanism | region | DOM leg | INK leg | caught by |
|---|---|---|---|---|
| **1. paint occlusion** — body background emitted as an in-flow block background, painted over the hero; white headline on white | severance `div/article/div` (1440×500 @ y=215) | **no** | **yes** (92.2 % → 3.3 %) | **INK ONLY** |
| **2. real displacement** — `float` missing from the computed-style whitelist, slick slides stack at the track origin and are clipped by `overflow:hidden` | severance `div/article/div[3]/div/div/div` (carousel) | **yes** (100 % → 0 %, 6 → 0 leaves) | no (the section still paints its own photograph, ink 80.6 % → 90.5 %) | **DOM ONLY** |
| **2. real displacement** | severance `div/article/div[2]` (NEWS band) | **partly** — the DOM leg names a *nested* sub-region `div/article/div[2]/div/div[1]` instead; the band itself misses the absolute floor by 0.003 (clone paintRatio 0.023 vs the 0.02 gate) | **yes** (38.0 % → 1.9 %) | **BOTH, at different granularity** |
| **3. genuine absence via opacity** — `scroll-behavior: smooth` made `window.scrollBy` async, the observer's scroll pass measured `moved <= 0` and broke, ScrollReveal never fired, the collector recorded `opacity: 0` | seoultone doctor-credential block | expected `absent` via `ancestor-mapped` | expected | **NOT MEASURED THIS SESSION** (§4.1) |

**Mechanism 1 is caught by exactly one channel.** Measured directly: with
screenshots the severance pairs report 1.4533 over three regions; without them
they report **0.6435 / 0.6473** over two, and the hero is not among them. If the
ink leg goes quiet on a fresh site — because a screenshot is missing, is the
wrong size, or the DOM-coverage precondition fails — **paint occlusion becomes
invisible again and the rubric returns to the behaviour that graded the severance
hero healthy.** That is why `REGION_CLONE_BLANK_INK_RATIO` (0.05) and
`REGION_INK_DOM_COVERAGE_MIN` (0.8) are the two thresholds that matter most, and
why the classifier now raises an explicit caveat naming both sides' coverage
whenever ink is withheld.

Mechanism 2 is the only one with genuine redundancy. Mechanism 3 is DOM-first by
construction (there is no subtree to paint), and it is the one mechanism
`missing-text-ratio` also sees — at 0.278 on seoultone @1440.

### 5.1 The two false positives this produced, and their cure

Before the DOM-coverage precondition, the ink leg fired on **hobbang.net**, a
page a human graded excellent at every width:

| pair | region | value | source ink | clone ink | source DOM paint | clone DOM paint |
|---|---|---|---|---|---|---|
| hobbang @1440 | `main/section[10]` (1440×1054) | 1.1711 → BLOCKER | 47.6 % | 4.7 % | 42 % / 36 leaves | 41 % / 36 leaves |
| hobbang @390 | `main/section[12]/…/tr[3]` (363×81) | 0.0838 → MINOR | 27.1 % | 3.7 % | 100 % / 5 leaves | 100 % / 5 leaves |

The DOM was **identical on both sides** (same descendants, same characters, same
leaf count, same box height) — the DOM leg correctly said *not blank* — and only
the ink disagreed. Root cause, measured: hobbang's **source** census reaches
y=5,574 on a page whose own `scrollHeight` is 10,863 (**51 %**; 8,544 of 17,167,
**50 %**, at 390). The bottom half of the page had not revealed itself when the
probe ran and had by the time the screenshot was taken, so every box below that
point names the wrong pixels. `section[10]`'s box said y=1,140 while its content
is painted at y=6,409 in that side's **own** screenshot.

Two candidate guards were measured and **rejected** before this one:

- *residual from the page's median offset* — both hobbang findings sit at
  residual **0 px** (median Δtop 5,269 / 8,666, the region's Δtop 5,269 / 8,667).
  It separates nothing.
- *per-region DOM↔screenshot agreement* — scores healthy dark-theme linear.app
  between **0.30 and 0.74** and misaligned hobbang at **0.93**. It separates
  nothing, and in the wrong direction.

The page-level coverage test separates cleanly (0.51/0.50 against 0.98–1.00) and
is now the ink leg's precondition.

---

## 6. Severity

```
value  = union of maximal blanked source-region boxes, px², over one viewport's area
bands  = BLOCKER 0.25   MAJOR 0.10   MINOR 0.02      (direction: higher is worse)
```

- **BLOCKER 0.25** — a quarter of a screen is blank where the source is full. No
  reader calls that a minor difference.
- **MAJOR 0.10** — a tenth of a screen: a missing card row, a missing column.
- **MINOR 0.02** — the census floor. One small container that came out empty is
  worth recording and is never worth a BLOCKER; keeping the bands three-deep is
  what guarantees that.

Worked examples, from the real runs:

| pair | blanked area | viewport | value | band |
|---|---|---|---|---|
| severance @1440 | 1,883,520 px² over 3 regions | 1440×900 = 1,296,000 | 1,883,520 / 1,296,000 = **1.4533** | BLOCKER (5.8× the band) |
| severance @1100 | 1,438,800 px² over 3 regions | 1100×900 = 990,000 | **1.4533** | BLOCKER |
| synthetic H1 fixture | 1000×400 = 400,000 px² | 1000×900 = 900,000 | **0.4444** | BLOCKER |
| a single 1440×160 card row @1440 | 230,400 px² | 1,296,000 | **0.1778** | MAJOR |
| a 300×90 decorative box @1440 | 27,000 px² | 1,296,000 | **0.0208** | MINOR |
| linear, hobbang (all four pairs) | 0 | — | **0** | does not fire |

The value exceeding 1 on severance is not a bug: the hero (0.5556 of a viewport),
the NEWS band (0.4344) and the carousel (0.4633) are three separate holes on one
page, and a reader scrolling it passes through more than a screen of nothing.

Six companion readings are **recorded and never fired on**, so the value is
readable rather than asserted: `blank-region-count`,
`blank-region-largest-viewport-ratio`, `blank-region-displaced-count`,
`blank-region-absent-count`, `blank-region-ink-only-count`,
`region-census-selected`.

---

## 7. When the channel refuses to fire

| condition | behaviour |
|---|---|
| either side's **leaf** census truncated | recorded, `eligible: false` — paint inside a late region is a lower bound, and an empty reading cannot be told from an unmeasured one |
| either side's **region** census truncated | recorded, `eligible: false` — that census truncates in DOCUMENT ORDER, so it loses counterparts at the bottom of the page, the direction that invents findings |
| a populated source region no mechanism can place | counted in `unjudgedRegions`; the ratio is a lower bound and the classifier raises a caveat |
| ink withheld (no screenshot / wrong size / coverage < 0.8) | DOM-only, `blank-region-ink-only-count`'s note states the reason and both coverages, **and a caveat records the lost sensitivity by name** |

---

## 8. `paintSuppression.suppressedBelowFold` — the existing unread signal

Asked for explicitly: is the observer's already-recorded
`paintSuppression.suppressedBelowFold` usable as corroborating evidence instead
of a new census? Measured on the latest site-observation of each of the four
sites:

| site | viewport | `sizedElements` | `suppressedElements` | `suppressedBelowFold` | belowFold / sized | `scrollRevealMarked` |
|---|---|---|---|---|---|---|
| gs.severance.healthcare | desktop | 804 | 210 | **75** | **9.3 %** | 1 |
| gs.severance.healthcare | mobile | 594 | 50 | 0 | 0 % | 1 |
| seoultone.kr | desktop | 428 | 88 | **78** | **18.2 %** | 0 |
| seoultone.kr | mobile | 434 | 88 | **78** | **18.0 %** | 0 |
| linear.app | desktop | 2,077 | 14 | 11 | 0.5 % | 0 |
| linear.app | mobile | 710 | 12 | 9 | 1.3 % | 0 |
| hobbang.net | desktop | 812 | 28 | 0 | 0 % | 0 |
| hobbang.net | mobile | 767 | 0 | 0 | 0 % | 0 |

**Finding: it is a good site-level diagnostic and it is not an evidence leg, for
four reasons — and it is not redundant with what I built.**

1. **It measures the wrong side.** `paintSuppression` counts elements the
   observer's capture of the **SOURCE** found suppressed. My census measures what
   the **CLONE** fails to paint. A clone that reproduced a source perfectly would
   carry the same suppression count; the channel would fire on a correct clone.
2. **It cannot be localised.** It is a scalar per viewport. It names no element,
   no box and no area, so it cannot be banded on area and cannot say *which*
   region is empty — which is the whole product gap.
3. **It is not necessary.** severance **mobile is 0** while the severance defect
   (hero occlusion) is present at both widths. A corroborator that is absent on
   half the positive fixtures cannot gate a finding.
4. **It lives in a different artifact captured at a different time** —
   `site-observations/<run>/pages/pNNNNNN/observation.json`, not the
   responsive-qa `SideMeasurement`. Making a QA verdict depend on it would make
   the verdict depend on an artifact the QA run does not produce and cannot
   re-take.

What it *does* do, on this data, is separate the two must-fire sites (9.3 % and
18.2 %) from the two must-not-fire sites (≤ 1.3 % and 0 %) at site level, and it
is a strong corroborator of **mechanism 3 specifically**: seoultone is the only
site where it is high at *both* viewports, and mechanism 3 is exactly
"content the source capture recorded at `opacity: 0`". Recommended follow-up
(not done here, out of lane): surface it in the responsive-qa run artifact as
**context**, next to the blank-region reading, without letting it move a band.

---

## 9. Tests

All in `scripts/smoke-responsive-qa.ts`. **No existing assertion was weakened or
deleted.** Suite **205 → 271** checks (+66), all passing.

| section | what it pins |
|---|---|
| **H1** the positive | a 1000×400 region the source fills and the clone leaves empty is reported, at BLOCKER, through the classifier, found by tag-path suffix, named `displaced` |
| **H2** the discriminating twin | the **same geometry** with an EMPTY source region is refused, and the refusal is stated as a measurement |
| **H3** small decorative container | never reaches BLOCKER |
| **H4** populated but SHIFTED | does not fire |
| **H5** the mis-pairing veto | a pair that lands elsewhere on a healthy page is vetoed by the second reading |
| **H6** backdrops | a leaf 24× the region's area does not rescue an empty region |
| **H7** correspondence | exact path is dead, the suffix is not |
| **H8** ancestor-anchored mapping | the seoultone shape: found through a paired ancestor across a 1,164 px offset, **and** the raw rectangle would not have found it |
| **H9** unjudged | no pair and no paired ancestor ⇒ UNJUDGED, never guessed, and the classifier says so in a caveat |
| **H10** geometry units | exact union area, maximal filter |
| **H11** roster + `RUBRIC_VERSION === 5` | all six channel ids present |
| **H12** truncation disarms | both censuses, both directions |
| **H13** the census in a real browser | selected + rejected == examined; the histogram sums to `rejected`; every reason is enumerated; `<img>` refused as media; a 3-wrapper chain collapses to one region; **the probe's five in-page literal defaults still match the documented constants** |
| **H14** the ink leg | an identical-DOM/flat-pixels region is reported **by ink alone**; the same pair without screenshots reports nothing; the classifier forwards both screenshots; the enclosing region is not also reported |
| **H14** the two ink bugs | a flat rgb(246,247,249) region reads ~0 % and not 100 % (the bin-**centre** bug); a dense region reads a real fraction and not 0 % (the **NaN-from-a-fractional-mean** bug) |
| **H15** the ink precondition | coverage accepted at 0.97, refused at 0.46; a wrong-**height** screenshot refused; a **wider** one accepted; a **narrower** one refused; a stale side loses ink for the whole pair and both coverages are reported |
| **H16** the legs are self-consistent | flat on both sides is not a hole; a clone that retained its ink is not a hole; an unavailable reading is never read as a blank one |

### 9.1 Pre-fix failure count — established honestly

The mechanism was reverted **in place** (`MAX_REGIONS` → 0 in the probe's in-page
default, and `detectBlankRegions` short-circuited to a zero result), the suite
re-run, and the failures counted:

```
mechanism reverted:  250/271 checks passed,  21 FAILED
mechanism restored:  271/271 checks passed,   0 FAILED
```

**Pre-fix failure count: 21.** The 21 are H1 (×3), H2, H6, H7, H8 (×2), H9 (×2),
H12 (×2), H14 (×3), H15 (×2), H13 (×3). Restoration verified with
`shasum -a 256 -c`: all seven `src/responsive-qa/*.ts` files matched their
pre-revert hashes byte for byte.

One file did **not** match and the difference is deliberate and stated here:
`scripts/smoke-responsive-qa.ts` changed eight `regions[0]!.x` into
`regions[0]?.x`. With the non-null assertions in place the reverted suite
**crashed** at the fourth check and could not produce a count at all. Optional
chaining makes a missing region FAIL the check instead of throwing; it weakens no
assertion (`undefined === "div/main/section[2]"` is still false) and it is what
makes the 21 measurable.

---

## 10. Limitations and FP/FN risk

**False positives — where a hole could be invented.**

1. **A stale capture on either side.** The dominant risk, and the one that
   actually happened (§5.1). Now gated for the ink leg by DOM-pixel coverage. The
   **DOM leg is not gated by it** — it compares a census to a census, so a page
   that grew between probe and screenshot does not affect it — but a page that
   grew between the *source* probe and the *clone* probe would. Unmeasured.
2. **Mis-pairing.** Vetoed by the second, independent reading whenever one is
   available (`corroborated`), and one-to-one greedy pairing bounds the damage.
   A page with two structurally identical sections where only one is populated
   can still pair wrongly; the IoU tie-break makes that unlikely and does not
   make it impossible.
3. **A region whose clone counterpart is *intentionally* empty at that width.**
   Currently indistinguishable from a defect. `too-small` (2 % of a viewport) and
   the three-deep band keep the cost proportional.

**False negatives — where a real hole is missed.**

1. **Ink withheld ⇒ paint occlusion invisible.** Named, caveated, and the single
   largest sensitivity risk (§5).
2. **A hole smaller than 2 % of a viewport** is below the census floor by design.
3. **A hole inside a region the census rejected** — anything inside an `<svg>`,
   any childless element, anything under 20 % viewport width or 60 px tall.
4. **A container the clone renders at a wildly different size.** The
   `REGION_MAP_SCALE_TOLERANCE` (1.35) guard refuses to map through an anchor
   that scaled more than that, so such a region becomes `unjudged` rather than
   blank. This is deliberate and it is counted.
5. **Both sides blank.** If the *source* capture is degraded, the source region
   is not populated and nothing fires. seoultone's outage capture is exactly this
   shape, and the channel correctly reports 0 on it rather than inventing a
   verdict.
6. **The NEWS-band granularity gap.** The DOM leg missed the severance NEWS band
   by 0.003 on the absolute floor (clone `paintRatio` 0.023 vs a 0.02 gate) and
   named a nested sub-region instead. The band was not loosened to fix that: the
   ink leg catches it, and moving an absolute floor to catch one region is how
   false positives get made.

---

## 11. Verification

| check | command | result |
|---|---|---|
| typecheck | `npx tsc --noEmit` | **exit 0, zero diagnostics repo-wide** (a concurrent lane's `src/observer/normalize-page-state.ts` errors, present mid-task, are now gone) |
| responsive-qa suite | `npx tsx scripts/smoke-responsive-qa.ts` | **271/271 PASS** (baseline 205) |
| pre-fix baseline | mechanism reverted in place | **250/271, 21 FAILED** |
| restoration | `shasum -a 256 -c` | 7/7 `src/responsive-qa/*.ts` OK; smoke script differs by the documented `?.` change |
| acceptance, real pipeline | `npx tsx src/cli-qa-responsive.ts …` ×3 | severance BLOCKER ×2; linear 0 ×2; hobbang 0 ×2; seoultone NOT MEASURED (source offline) |
| region accounting, real browser | suite H13 | selected + rejected == examined on every side; histogram sums to `rejected` |
| region accounting, real data | 12 sides | 32,652 examined = 790 selected + 31,862 rejected ✔ |

**Run ids**

| site | responsive-qa run | reconstruction |
|---|---|---|
| gs.severance.healthcare | `2026-09-04T22-53-01-661Z` | `2026-09-04T18-14-47-300Z` |
| linear.app | `2026-09-04T22-53-25-263Z` | `2026-09-04T17-24-33-839Z` |
| hobbang.net | `2026-09-04T22-53-52-081Z` | `2026-09-04T18-16-31-732Z` |
| seoultone.kr | — (source offline) | `2026-09-04T18-17-23-059Z` |

---

## 12. Files changed

| file | change |
|---|---|
| `src/responsive-qa/probe.ts` | region census in-page, `RegionCensusConfig`, `REGION_REJECTION_REASONS`, per-element `ownTextChars` |
| `src/responsive-qa/blank-region.ts` | **new** — `paintInsideBox`, `inkInsideBox`, `inkTrustOf`, `unionArea`, `sharedPathSuffix`, `pairRegions`, the four predicates, `detectBlankRegions`, `describeBlankRegions`, `reachesBlocker` |
| `src/responsive-qa/types.ts` | `RUBRIC_VERSION` 4 → 5; `RegionBox`, `RegionAccounting`; `SideMeasurement.regions` / `.regionAccounting`; 31 documented constants |
| `src/responsive-qa/classify.ts` | section 7b — one fired channel, five recorded, two caveats; optional `sourceImage` / `cloneImage` |
| `src/responsive-qa/run.ts` | `persistSide` strips `regions` and records `regionCount`; forwards both decoded screenshots to the classifier |
| `src/responsive-qa/index.ts` | re-exports the census and blank-region surface |
| `scripts/smoke-responsive-qa.ts` | sections H1–H16 (+66 checks) |

Not touched, by ownership: `overlap.ts`, `pixel-gate.ts`, `capture.ts`,
`composite.ts`, and everything under `src/reconstruction/**` and `src/observer/**`.
No git mutations of any kind were performed.
