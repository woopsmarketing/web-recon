# Task 28.75 §03b — Band-aware grid tracks and the grid item, measured

**Phase A correction cycle 1 of 2.** Status: **MECHANISMS ADOPTED, CORRECTED AND
RE-MEASURED — GATE CLAUSE NOT MET, AND THE REASON IS NOT WIDTH RECOVERY.**

Owned surface: `src/reconstruction/**`, `scripts/smoke-layout-safety.ts`,
`scripts/smoke-reconstruction.ts`. `src/responsive-qa/**` and `src/observer/**`
untouched. `containingBlockGuard()` byte-for-byte unchanged (function digest
`sha256(body)[0:32] = 490cc3523b9a8b5b4a09143207543276`; it appears in none of
this cycle's eight edits). No git mutations. Nothing under `docs/result/` for
waves ≤ 28.7 touched.

---

## 0. What this cycle found, in one paragraph

The six red checks were **not** tests for an unimplemented mechanism. Both
mechanisms — `recoverGridTracksBanded()` and `gridAreaFillWidth()` — were fully
built, fully unit-tested with discriminating twins and negative controls, and
**gated behind two `process.env` A/B flags that default to OFF**
(`WR_GRID_BANDS`, `WR_GRID_ITEM_FILL`). With the flags on, the suite was already
`451/451`. The work was therefore not to write the mechanism but to **measure
whether it earns adoption**, to find out what actually holds the clone at 1838 —
which turned out **not to be a grid track at all** — and then, when the first
adoption was measured on a second corpus, to **find and cure a regression it
shipped**. The cure is the one piece of new mechanism in this cycle (§2.2).

The measured answers:

* **`/` @1024 and @1100 are not a width-recovery defect.** The single outermost
  node holding the clone's extent at 1838, and the single outermost node
  overflowing inside the footer, both carry **no layout-probe record at all**.
  `p000001` is the only page in the corpus whose probe failed to align:
  `aligned: false`, 1,379 of 2,291 elements attached, **927 of 2,306 desktop
  element nodes (40.2%) unprobed**, and **100% of its mobile tree unprobed**.
  No width-recovery mechanism can reach a node with no observation, so this is
  an observer/compiler alignment defect, out of this lane's scope.
* **`/pricing` @1100 was exactly the grid-item defect the brief described**, and
  `gridAreaFillWidth()` answers all three outermost roots from measured area
  vectors. Its `offscreen-text-excess-chars` BLOCKER cleared.
* **`/pricing` @1100 `footer-clipped` is a *different* container** — the footer's
  own 6-track grid `n001467` — refused `children-do-not-tile-tracks`, correctly,
  and unreachable by any honest relaxation (§5).
* **The first adoption shipped a regression, and the measurement caught it.**
  Because the banded pass deliberately published no grid areas, it moved
  hobbang.net's mobile items to the source's exact x while leaving their frozen
  truth-widths in place. `/` @768 went **MAJOR → BLOCKER on a new
  `footer-clipped`** (clone footer right edge 820 against a 768 viewport).
  A correct track list whose items are still frozen is worse than no track list.
  §2.2 is the mechanism that cures it; §4.4 is the measurement.

Both mechanisms are adopted, unflagged, and the corrected build is the one every
number below is measured on.

---

## 1. Step 1 — what holds the clone's extent, measured

Tools (this cycle's, reusing the previous lane's shape):
`tmp/wr2875c/extent.mjs` (outermost extent holders), `tmp/wr2875c/ovf.mjs`
(outermost overflow roots), `tmp/wr2875c/why2.ts` (per-node interrogation of all
five mechanisms), `tmp/wr2875c/geom.mjs` (two-directional geometry, per-route
breakpoint aware), `tmp/wr2875c/ovfdiff.mjs` (before/after overflow attribution),
`tmp/wr2875c/cssdiff.mjs` (rule-level stylesheet diff, media-context aware).

Measured on the reconstruction named in the brief,
`data/linear.app/reconstructions/2026-09-05T10-13-17-947Z`, against site-spec
`2026-09-04T23-34-15-786Z`.

### 1.1 The single trap that reframes the whole route

**`linear.app` does not have one breakpoint.** `globals.css` ships a site-wide
switch at **641** plus a **per-route switch at 1025 for `p000002` and
`p000003`** (Task 28.7 §26, per-route tree switch). Interrogating `/pricing`
with `bp=641` or `bp=1024` produces refusals the shipping build never makes —
`n000352` reports `tracks-not-reproducible-at-every-width` when the build in
fact ships `minmax(0, 1fr)` for it. Only `bp=1025` reproduces the shipped
stylesheet exactly. Every number in this document uses the per-route map
`{"p000002": 1025, "p000003": 1025}` over a site-wide 641.

The same trap invalidates the previous lane's `geom2.mjs`, which assumed one
site-wide breakpoint and would compare `/pricing`'s desktop tree at widths where
it is not displayed. `tmp/wr2875c/geom.mjs` is a fork that takes the map.

### 1.2 `/` @1024 and @1100 — one root, and it has no probe

At 1024 the clone's `contentMaxRight` is 1838 against a source 1527. The
outermost nodes reaching 1838, walked up `parentNodeId` to their roots:

| node | tag | pos / display | frozen width | probe? | descendants | outcome | why the three mechanisms declined |
|---|---|---|---|---|---|---|---|
| `n002162` | `div` | static / block | `1838px` | **none** | 1 | *not in the funnel* | all three need `node.probe`; there is none to read |
| `n002946` | `div` | static / flex | `1414px` | **none** | 41 | *not in the funnel* | same — the footer's own overflow root is unobserved |

Ten of the 26 outermost desktop overflow roots at 1024 are unprobed, including
the largest chain root `n001877` (903 descendants). `p000001` is the **only**
page in the corpus with `layoutProbe.aligned === false`.

The consequence is exact and not arguable: the preference order
`SOURCE-AUTHORED RELATION > OBSERVED GEOMETRIC RELATION > SAFE GENERIC
CONTAINMENT > MINIMAL CLAMP > LEAVE FROZEN` terminates at **LEAVE FROZEN** for a
node with no observation, because every rung above it needs one.

### 1.3 `/pricing` @1100 — the brief's diagnosis confirmed exactly

The three nodes the brief named, all refused `containing-block-not-parent` by
the damage clamp:

| node | tag | display | frozen width | guard | measured grid area vector | now |
|---|---|---|---|---|---|---|
| `n000353` | `div` | block | `1090px` | `grid-item` | equals its own width vector at every width | `grid-area-fill-width` |
| `n001421` | `div` | flex | `342px` | `grid-item` | equals its own width vector at all 15 mobile widths | `grid-area-fill-width` |
| `n000324` | `div` | block | `1090px` | `grid-item` | equals its own width vector at every width | `grid-area-fill-width` |

All three are grid items whose containing block is their grid **area**, not
their parent's content box — which is precisely what `containingBlockGuard()`
says, and precisely why the damage clamp must refuse them. The area is the one
quantity nothing else in the funnel measures, and `gridAreaFillWidth()` is the
branch that measures it.

### 1.4 The three-mechanism refusal interrogation

Over `/` and `/pricing`, at the widths in scope:

| mechanism | emits | refuses | dominant refusal reason |
|---|---:|---:|---|
| `trackedFillWidth` | — | — | `auto-does-not-stretch` (the frozen node is not a stretch-fill child) |
| `viewportBleedWidth` | — | — | `not-viewport-wide-at-every-width` |
| `damageClampWidth` | **150** | **7,194** | `no-material-damage` (6,231), `containing-block-not-parent` (363 on linear) |

**Is “150 clamps against 7,194 refusals” correct conservatism or an over-tight
predicate? It is correct conservatism, with one named exception.** 6,231 of the
refusals are `no-material-damage` — the node is not measurably damaged, so a
clamp would be a guess dressed as a repair. That is the predicate working. The
exception is the 363 `containing-block-not-parent` refusals on linear.app: those
nodes *are* damaged and *are* refused, correctly, because the clamp's arithmetic
is against the parent's content box and a grid item's containing block is not
that box. **That is not an over-tight predicate; it is a missing mechanism**, and
`gridAreaFillWidth()` is it — after adoption and correction, linear's
`containing-block-not-parent` clamp refusals fall 109 → **101** and hobbang's
fall **188 → 15**.

---

## 2. What was implemented, and what was not

**Nothing was removed and no check was weakened.** All 451 pre-written checks
stand, including the 6 that were red, and **4 more were added** for the new
mechanism (§8).

### 2.1 Adoption — the A/B gate is gone

The two temporary A/B constants `GRID_TRACK_BANDS_ENABLED` /
`GRID_AREA_FILL_ENABLED` and their two guard clauses were deleted from
`src/reconstruction/layout-inference.ts`, so both branches are unconditionally
live. **No dead toggle ships.** The comment block that replaced them records the
SHA-256 A/B evidence in the source itself.

**Why the 6 checks were kept rather than dropped.** The brief's alternative —
remove them if the measurement shows the mechanism is not what the defect needs
— does not apply: the mechanisms *are* reached and they *do* fire on measured
evidence. `recoverGridTracksBanded()` emits **6 rules over 3 containers** on
linear.app and **72 rules over 36 containers** on hobbang.net;
`gridAreaFillWidth()` emits **358** on linear.app and **328** on hobbang.net.
Removing tests for a mechanism that is live, verified by render, and net
strongly positive would be the wrong call.

### 2.2 The correction — the banded pass now publishes the areas it measured

**The defect the first adoption shipped.** `recoverGridTracksBanded()` recovers a
per-band `grid-template-columns` by clustering the children's left edges. It
contributed **no** areas to the item pass, on the argument that "the child equals
its column" is true by construction there and would make `does-not-fill-area`
tautological. The measured cost of that abstention (§4.4): the banded track list
puts hobbang.net's mobile items at the source's **exact x** while their
truth-width `width: 358px` stays, so the row overflows. `/` @768 went **MAJOR →
BLOCKER on a new `footer-clipped`**, clone footer right edge **820** against a
768 viewport, content extent 744 → **820**.

**What the published area actually claims.** Not "the child equals its column" —
that is tautological and would be dishonest. The claim is **"this item has no
inline size of its OWN — it is sized BY its column"**, and the evidence for it is
the item moving with the container by a *constant share* across the band, which
the band's own already-enforced predicates establish before any area is
published:

* `band-track-not-fractional` — the tracks are constant fractional shares of the
  content box, not coincidental pixel values;
* `band-insets-not-constant` — the container's insets are constant across the
  band, so the shares are measured against a stable box;
* `band-tracks-do-not-partition` — the tracks plus gaps sum to the content box,
  so nothing outside the track list is holding the item.

A child that merely happened to equal a column at one width fails all three.

**The item pass's own guards still apply on top, unchanged.** A published area is
evidence, not a licence: `own-min-width-declared`, `no-frozen-width`,
`frozen-width-not-observed`, `fewer-than-two-visible-widths`,
`area-not-measured-at-every-width`, `area-width-constant` and
`does-not-fill-area` all still run, and a discriminating twin proves it (§8).

**The whole diff, in five edits:**

1. `Structure` gains `columnOf: Map<string, number>` — which column each
   participating child sat in **at this width**.
2. The clustering loop records member ids per cluster and fills `columnOf` after
   the clusters are sorted by x.
3. `GridTrackBandResult`'s ok branch gains
   `areas: { nodeId: string; widths: { i: number; w: number }[] }[]`, with the
   evidential argument above written in place.
4. The return builds that union by walking every band's run and reading
   `structure.tracks[columnOf.get(child)]` at each width index.
5. `inferLayoutRules()` writes them into `gridAreaByChild` keyed
   `` `${viewportId}|${nodeId}` `` immediately after the banded rules are pushed.

**Where the banded pass refuses, it refuses into its own histogram.** On
linear.app: `gridTrackBandRefusalsByReason = {"column-children-disagree": 3}`,
`gridTrackBandRefusals = 3`, and the 3 answered containers are **not** also
counted as single-band refusals (246 → 243). The funnel partition conserves.

### 2.3 What the correction moved, in counters

| counter | hobbang.net | linear.app |
|---|---|---|
| `gridAreaFill` | 155 → **328** | 350 → **358** |
| `gridAreaFillRefusalsByReason.container-tracks-not-recovered` | 190 → **17** | 284 → **276** |
| `damageClampRefusalsByReason.containing-block-not-parent` | 188 → **15** | 109 → **101** |
| `inlineSizeOutcomes.no-branch-matched` | 801 → **632** | 2,982 → **2,974** |
| `residualFrozenOmitted` | 1,370 → **814** | 2,039 → **1,978** |
| `residualFrozenConsequences.offscreen` | 345 → **127** | 754 → **750** |
| `guardRefusalsByReason.grid-item` | 19 → **15** | unchanged |
| `rejectedByTruthCheck` | 2 → **6** | 2 → **4** |
| `acceptedUnchecked` / `rejectedUnverifiable` | **0 / 0** | **0 / 0** |

The rise in `rejectedByTruthCheck` is the browser refusing four (hobbang) and two
(linear) band rules that no longer reproduce once their items are un-frozen —
`verifyLayoutRules()` doing exactly its job. It is visible in the stylesheet:
hobbang's `grid-template-columns` count falls 1,514 → 1,510, e.g. `p000002`
mobile `n000397` keeps its `<768` single-column band and loses its `≥768`
two-column band, while its child `n000399` gains `width:auto; min-width:0`.
**A rule that does not verify is dropped, never shipped.**

One honest wart: linear's `truthCheckConverged` goes `true → false`. The log
names it — `[layout-truth] p000001 @1024px: banded geometry did not settle in 4
rounds — dropping 0 rule(s)`. **Zero rules were dropped**; the loop hit its
bounded round cap with nothing left to reject. Reported because the flag flipped,
not because anything shipped.

---

## 3. A/B proof

Flag OFF must be byte-identical to the shipped baseline before any flag-on
number is believed. `shasum -a 256` on `app/public/wr/generated-styles.css`:

| site | baseline (shipped) | flag OFF | identical? | flag ON |
|---|---|---|---|---|
| linear.app | `78f7e616b8e4ea2e…` (`…10-13-17-947Z`) | `78f7e616b8e4ea2e…` (`…10-36-04-559Z`) | **yes** | `781d42fb9186a733…` (`…10-36-33-066Z`) |
| hobbang.net | `1c01ada30cbd202f…` (`…10-19-45-357Z`) | `1c01ada30cbd202f…` (`…10-37-59-284Z`) | **yes** | `ca826e9d90308a53…` (`…10-39-14-115Z`) |
| gs.severance.healthcare | `d633541616a53d33…` (`…10-23-08-511Z`) | `d633541616a53d33…` (`…10-40-29-682Z`) | **yes** | `d633541616a53d33…` — **also identical** |

`gs.severance.healthcare` has no grid containers at all, so neither branch can
reach it and its output is unchanged **by construction, proven by hash** — and
still is after the §2.2 correction: the corrected build `…11-08-19-970Z` hashes
`d633541616a53d3a3399315a2245343f7ae9b661832e60c0b2439cc5de83713e`, the same
value as the baseline.

**Adoption equivalence.** After the flags were deleted, the full rebuild
(`…10-42-36-596Z`) produced `781d42fb9186a733…` — byte-identical to the measured
flag-ON build. The §2.2 correction then changes it deliberately, to
`efa069f384772a42…` (linear) and `22f1ac3410ef6b61…` (hobbang).

---

## 4. Two-directional geometry

Method: render BEFORE and AFTER stylesheets in Chromium at every probe width the
variant is displayed at (per-route breakpoint respected), measure every
`[data-wr-node]` border box against **the source's own probe at the same width**.
IMPROVED = error shrinks > 2px, WORSENED = grows > 2px. `data-wr-node` carries
the raw nodeId, not the prefixed DOM id. Baseline for both tables is the
**flag-OFF** build, which is byte-identical to the shipped baseline (§3).

### 4.1 Headline, corrected build

| site | axis | compared | improved | worsened | total error before → after |
|---|---|---:|---:|---:|---|
| hobbang.net | width | 34,466 | **4,922** | **12** | 2,001,045 → **1,263,017** px (**−36.9%**) |
| hobbang.net | x | 34,466 | **2,985** | **110** | 1,633,993 → **676,898** px (**−58.6%**) |
| linear.app | width | 77,688 | **2,789** | **62** | 2,959,679 → **2,451,862** px (**−17.2%**) |
| linear.app | x | 77,688 | **3,048** | **44** | 7,680,951 → **6,905,405** px (**−10.1%**) |

**Both axes on both sites are net better than the untouched baseline.** Against
the *pre-correction* adoption the correction is better on three of the four
axes and worse on one, and that one is named in §4.3:

| site | axis | flag-OFF | pre-correction adoption | **corrected** |
|---|---|---:|---:|---:|
| hobbang.net | width err | 2,001,045 | 1,864,660 | **1,263,017** |
| hobbang.net | x err | 1,633,993 | 870,742 | **676,898** |
| linear.app | width err | 2,959,679 | 2,558,196 | **2,451,862** |
| linear.app | x err | 7,680,951 | **6,691,602** | 6,905,405 ← **+3.2% worse** |

### 4.2 Every worsened WIDTH row, named

**hobbang.net — 12 of 12** (all mobile, all introduced by the correction):

| page | node | widths | source w | before | after | Δ error |
|---|---|---|---:|---:|---:|---:|
| p000001 | `n000352` | 768 | 360.00 | 358.00 | 368.00 | +6.0 |
| p000001 | `n000357` | 768 | 360.00 | 358.00 | 368.00 | +6.0 |
| p000001 | `n001070` | 768 | 360.00 | 358.00 | 368.00 | +6.0 |
| p000001 | `n001075` | 768 | 360.00 | 358.00 | 368.00 | +6.0 |
| p000005 | `n000531` | 480, 639, 914, 1023 | 292.27 | 303.73 | 326.13 | +22.4 ×4 |
| p000007 | `n000430` | 480, 639, 914, 1023 | 319.78 | 303.73 | 358.09 | +22.3 ×4 |

Largest single width loss on the whole corpus: **22.4px**. Against 4,922
improved rows.

**linear.app — 62 of 62** (5 carried from the pre-correction adoption, 57 new):

| page / viewport | nodes | widths | source w | before | after | Δ error | new? |
|---|---|---|---:|---:|---:|---:|---|
| p000003 desktop | `n000738` | 1025 | 102.50 | 104.27 | 90.50 | +10.2 | carried |
| p000003 desktop | `n000457` | 1025 | 98.77 | 98.75 | 90.50 | +8.3 | carried |
| p000003 desktop | `n000521` | 1025 | 232.48 | 232.47 | 225.42 | +7.1 | carried |
| p000003 desktop | `n000371` | 1025 | 110.16 | 110.14 | 105.84 | +4.3 | carried |
| p000003 desktop | `n000368` | 1025 | 97.17 | 97.17 | 93.78 | +3.4 | carried |
| p000003 mobile | 51 nodes | 769 | 340.50 | 342.00 | 352.50 | +10.5 ×51 | **new** |
| p000003 mobile | 4 nodes | 769 | 356.50 | 358.00 | 368.50 | +10.5 ×4 | **new** |
| p000003 mobile | 1 node | 769 | 167.25 | 168.00 | 173.25 | +5.3 | **new** |
| p000003 mobile | 1 node | 769 | 165.25 | 166.00 | 171.25 | +5.3 | **new** |

Every new row is **`/pricing`'s mobile tree at the single width 769** — one width
of that route's 15-width mobile axis — losing 5–11px. No other route, viewport
or width lost width on linear.app.

### 4.3 Every worsened X row, named, and the one axis that got worse

**linear.app — 44 of 44, unchanged from the pre-correction adoption.** The
correction added none. They are the `n001423` / `n001424` next-frozen-layer rows
(§4.5) plus the same p000003 desktop inline boxes at 1025 / 1280 / 1281.

The **+3.2% x-error rise** on linear is therefore not new wrong rows; it is
`improvedX` falling 3,426 → 3,048, i.e. 378 rows that the pre-correction build
improved are now improved by less. Cause is the same one measured on hobbang
below: a container whose width moves closer to the source can move a wrapping
flex row's break point, and rows that change line trade a small width win for a
larger x delta. Net over both axes linear is 9,249,798 → 9,357,267 px
(**+1.2%**), against hobbang's 2,735,402 → 1,939,915 px (**−29.1%**).

**hobbang.net — 110 of 110, all introduced by the correction.** 69 distinct
nodes, **all on the mobile tree**, at exactly two widths: **914 (90 rows)** and
**1023 (20 rows)**. Δ range **16 – 373.1px**. They repeat across all 10 pages
because the offending subtree is the shared site footer.

Worked example, `p000002` `n000642` @914 (source x 24, before 80.19, after
453.27, Δ 373.1):

```
n000642 <li>    x=24  w=48.2      ← the regressed node
n000620 <ul>    display:flex, wrapping   source w @914 = 481.83
n000618 <nav>
n000610 <div>   ← grid item of n000608, frozen width:358px before
n000608 <div>   display:grid, banded: <768 → minmax(0,1fr)
                                      ≥768 → minmax(0,1.4fr) minmax(0,1fr), gap 40
```

`n000610` is the first item of the banded grid. Before the correction it stayed
frozen at **358px** against a source **481.83px** — a 124px width error. After,
it fills its 1.4fr track: **≈510px**, a **28px** error. Its width improved by
~96px. But `n000620` is a **wrapping flex list of 12 links**, and 510 fits one
more link per line than 481.83 does, so `n000642` lands at the end of the
previous line instead of the start of a new one. That is the 373px.

**This is a residual width error crossing a wrap boundary, not a wrong rule.**
The x-axis total on hobbang still falls 58.6%; these 110 rows are what the
remaining 28px of track error costs when it lands on a reflow discretisation.

### 4.4 The regression the first adoption shipped, and the cure

Measured on `/`, widths 640 / 700 / 768, hobbang.net mobile tree:

| width | flag-OFF `…11-00-17-822Z` | pre-correction `…11-01-25-430Z` | **corrected `…11-12-23-623Z`** |
|---|---|---|---|
| 640 | MAJOR 0/4/2 — cmr 624→**624**, footer-clipped 0 | MAJOR 0/6/2 — cmr 624→**665**, footer-clipped 0 | BLOCKER 1/1/2 — cmr 624→**624**, footer-clipped 0 |
| 700 | MAJOR 0/4/2 — cmr 684→**684**, footer-clipped 0 | MAJOR 0/6/2 — cmr 684→**695**, footer-clipped 0 | BLOCKER 1/1/2 — cmr 684→**684**, footer-clipped 0 |
| 768 | MAJOR 0/2/3 — cmr 744→**752**, footer-clipped 0 | **BLOCKER 1/4/3** — cmr 744→**820**, footer 768/**820**, **footer-clipped 1** | MAJOR 0/2/2 — cmr 744→**754**, footer-clipped **0** |

**The cure worked on what it was built for.** The @768 BLOCKER and its
`footer-clipped` are gone; content extents at 640 and 700 are **exact** again;
and four channels the pre-correction build had added disappear —
`horizontal-overflow-excess-px`, `pixel-uncompared-band-ink-ratio`,
`column-container-mode-delta`, `column-mode-delta`. Findings per pair fall from
8 to 4. `position-delta-p90-px` improves at 700 (310 → 303) and 768 (376 → 225).

**And it cost one channel, which crosses a threshold.** `overlap-excess-ratio`:

| width | flag-OFF | pre-correction | corrected | threshold |
|---|---:|---:|---:|---|
| 640 | 0.0333 MAJOR | 0.0349 MAJOR | **0.1195 BLOCKER** | MAJOR 0.02 / BLOCKER 0.10 |
| 700 | 0.0205 MAJOR | 0.0205 MAJOR | **0.1078 BLOCKER** | — |
| 768 | silent | silent | **0.0876 MAJOR** | — |

The mechanism is `min-width: 0px`, which is half of what `grid-area-fill-width`
emits and is not optional: without it a grid item's automatic minimum size is its
min-content width, which pushes the track wider than the recovered track list and
puts the extent error straight back. With it the item box equals its track and
any descendant still frozen at a truth-capture width spills **inside** the box
instead. **The correction converts a right-extent error into an in-box overlap
error.** On this page the trade buys back a BLOCKER at 768 and two exact content
extents, and pays a BLOCKER at 640 and 700. Those two widths are in neither the
acceptance set nor the PROTECT set; they are widths this cycle went looking at
on its own initiative, and the finding is reported rather than hidden. It is
item 1 for cycle 2 (§10).

### 4.5 Next-frozen-layer exposure (carried, unchanged)

`p000003` mobile `n001421` is a grid item of `n000352`. Its measured grid-area
vector equals its observed width vector **exactly at all 15 mobile widths**, so
`gridAreaFillWidth()` emits `width:auto; min-width:0` and its own width becomes
correct — a 610px improvement at 1024. `n001421` is itself a **flex** container;
its child `n001423` (and `n001423`'s child `n001424`) are still frozen at
`width: 342px` and neither is a grid item, so no branch reaches them
(`tracked-fill → auto-does-not-stretch`, `damage-clamp → no-material-damage`,
`grid-area-fill → not-a-grid-item`). While the parent was equally frozen the
child's freeze was invisible; now the parent is correct, flex alignment pushes
the still-frozen child to the far end and its **x** error grows by up to 610px
across 17 widths. Its **width** error is unchanged. A correct rule exposing the
next frozen layer, not a wrong value.

---

## 5. Acceptance

`pnpm qa:responsive <manifest> --routes /,/pricing --widths 1024,1100,1440 --with-self-check`
on the corrected build `2026-09-05T11-07-50-860Z`. Real pair run
`2026-09-05T11-15-39-529Z`; self-check floor `2026-09-05T11-15-39-531Z`.

| route | width | verdict baseline → after | B/M/m baseline → after | **footer-clipped before → after** | clone `contentMaxRight` before → after (source) |
|---|---:|---|---|---:|---|
| `/` | 1024 | BLOCKER → BLOCKER | 4/3/2 → 4/3/2 | **1 → 1** | 1838 → 1838 (1527) |
| `/` | 1100 | BLOCKER → BLOCKER | 2/1/3 → 2/1/3 | **1 → 1** | 1838 → 1838 (1509) |
| `/pricing` | 1100 | BLOCKER → BLOCKER | 2/1/3 → **1/2/2** | **1 → 1** | 1361 → 1361 (1090) |

**The gate clause is NOT met.** `footer-clipped` is still 1 on all three pairs
and `contentMaxRight` did not move. The corrected build's acceptance table is
**identical in every cell** to the pre-correction adoption's — the §2.2
correction adds 8 rules on linear, none of them on these three pairs. Both facts
were predicted by §1 before any QA ran:

* **`/` @1024 and @1100** — the footer root `n002946` and the extent holder
  `n002162` carry **no probe**. There is no observation to recover a relation
  from, so `LEAVE FROZEN` is the terminal outcome of the preference order. A
  probe-alignment defect in the observer/compiler (`p000001` only, 40.2% of its
  desktop nodes and 100% of its mobile nodes), explicitly out of this lane's
  scope.
* **`/pricing` @1100** — the footer's own grid `n001467` (6 × 224px tracks) is
  refused `children-do-not-tile-tracks` because `n001468` (a 20px logo sitting
  32px inside track 1) matches no track start, and `n001609` (`grid-column: 2`,
  257.9px at **every** width) matches no run. That refusal is correct. A
  relaxation that skipped non-matching children would land on
  `not-every-track-witnessed` instead, because track 1 would then have no span-1
  witness at all — so no honest relaxation reaches it. Verified at
  `src/reconstruction/layout-inference.ts:3057` (`matches.length !== 1`) and
  `:3092` (`spanOneByColumn.some(list => list.length === 0)`).

**Every channel that moved, baseline `2026-09-05T10-13-47-506Z` → corrected**
(unchanged channels omitted):

| pair | channel | before | after |
|---|---|---|---|
| `/` @1024 | `position-delta-p90-px` | MAJOR 517 | MAJOR **394** |
| `/` @1024 | `offscreen-text-excess-chars` | BLOCKER 1466 (src 600) | BLOCKER 1461 |
| `/` @1100 | `offscreen-text-excess-chars` | BLOCKER 716 (src 499) | BLOCKER 711 |
| `/pricing` @1100 | `offscreen-text-excess-chars` | **BLOCKER 175** (src 0) | **MAJOR 70** |
| `/pricing` @1100 | `position-delta-p90-px` | MAJOR 256 | MAJOR **212** |
| `/pricing` @1100 | `overlap-excess-ratio` | MINOR 0.41% | **cleared** |
| `/pricing` @1024 | `position-delta-p90-px` | MAJOR 622 | MAJOR **551** |
| `/pricing` @1024 | `empty-band-excess-ratio` | — | **MINOR 7.83%** (src 3.89%) — new |
| `/` @1440 | `pixel-residual-difference-ratio` | MINOR 7.4967% | MINOR 7.4966% |
| `/pricing` @1440 | `pixel-residual-difference-ratio` | MINOR 1.5205% | MINOR 1.5201% |

**What improved, measured.** `/pricing` @1100 lost a BLOCKER:
`offscreen-text-excess-chars` fell from BLOCKER to MAJOR because
`gridAreaFillWidth()` un-froze `n000353`, `n001421` and `n000324` — the three
roots the brief named. That is the one acceptance sub-goal this cycle closed.

---

## 6. PROTECT

| target | before | after (corrected build) | held? |
|---|---|---|---|
| `/pricing` @1440 | MINOR 0/0/2, cmr 1392 = 1392, right gutter 48 = 48 | MINOR 0/0/2, cmr **1392 = 1392**, gutter **48 = 48** | **YES — exact** |
| `/` @1440 | MINOR 0/0/3, cmr 1840 = 1840 | MINOR 0/0/3, cmr 1840 = 1840 | **YES — exact** |
| `/pricing` @390 | MINOR 0/0/2 | **MINOR 0/0/2**, same two channels (`missing-text-ratio`, `pixel-residual-difference-ratio`) | **YES** |
| hobbang.net @390 / @1100 / @1440 | MINOR / MAJOR / MINOR (brief's stated target) | **MINOR / MAJOR / MINOR**, cmr exact at all three (573/1076/1272), footer-clipped 0 | **YES** |
| gs.severance.healthcare ×3 | MAJOR ×3, 0 BLOCKER, `blank-region-ratio` silent | **the entire app tree is byte-identical** to the baseline — see §6.2 | **YES — by whole-tree hash** |

### 6.1 hobbang.net — this time on a clean floor

Corrected build `2026-09-05T11-06-40-264Z`. PROTECT re-run
`2026-09-05T11-13-31-951Z`, its self-check floor `…-953Z`.

| @width | floor (source vs itself) | corrected clone | source cmr = clone cmr | footer-clipped |
|---|---|---|---|---|
| 390 | **PASS 0/0/0** | MINOR 0/0/2 | 573 = 573 | 0 |
| 1100 | **PASS 0/0/0** | MAJOR 0/1/2 | 1076 = 1076 | 0 |
| 1440 | **PASS 0/0/0** | MINOR 0/0/2 | 1272 = 1272 | 0 |

This run's floor is **clean on all three pairs**, so unlike the pre-correction
re-run (whose floor was itself MINOR / MAJOR / MINOR with 8.89 / 26.13 / 5.00%
pixel self-residual — the live source moving between two captures of itself) the
verdicts here are adjudicated, not floor-contaminated. They land **exactly on the
triple the brief names as the PROTECT target**, with every content extent exact
and no footer clipping. The remaining channels are `overlap-excess-ratio`,
`pixel-residual-difference-ratio` and, at 1100, `position-delta-p90-px`.

The deterministic instrument agrees and is immune to live-source drift: §4.1,
34,466 comparisons at every displayed width, **4,922 / 12 improved-worsened in
width and 2,985 / 110 in x, both totals sharply down**. Desktop page overflow
improves further than before (`p000001` @1024: 40px → **8px**; @1100: 2px →
**0px**).

### 6.2 gs.severance.healthcare — held by whole-tree hash, not by a rubric run

Not one byte of gs.severance.healthcare's clone changed in this lane. Hashing
every file the reconstructor writes — `app/`, `src/`, `public/`,
`reconstruction-data/`, `next.config.mjs`, `package.json`, `tsconfig.json` —
gives the same digest for all three builds:

```
2026-09-05T10-23-08-511Z (baseline)   2f6e0b05e1d1f3346f97ce637911476bc005238cb3aa72e5aa69c323a48f993c
2026-09-05T10-40-29-682Z (flag OFF)   2f6e0b05e1d1f3346f97ce637911476bc005238cb3aa72e5aa69c323a48f993c
2026-09-05T11-08-19-970Z (corrected)  2f6e0b05e1d1f3346f97ce637911476bc005238cb3aa72e5aa69c323a48f993c
```

The site has no grid containers, so neither branch can reach it — and this is
proof, not an argument.

**A rubric run was nevertheless attempted and must not be read as a PROTECT
result.** `2026-09-05T11-19-40-286Z` scores BLOCKER ×3 (`image-presence-ratio`,
`missing-text-ratio`, `nav-link-ratio`, `visible-text-ratio`), but its numbers
are source-side: **source `contentMaxRight` 6,051 / 6,808 / 6,888 at viewports
390 / 1100 / 1440**, and a source footer that is present while the clone's is
absent. The clone build succeeded (`next build ✓ Compiled successfully`, 2/2
static pages). A source whose content extent is 15× its viewport is a bad
capture, not a clone defect, and with the clone provably unchanged there is
nothing this run could attribute to the lane. It was run without
`--with-self-check`, so it has no floor and, by the rubric's own rule, is
UNADJUDICATED. **PROTECT on gs.severance.healthcare rests on the hash above.**


---

## 7. Remaining limitations, quantified

1. **`min-width: 0px` trades extent error for in-box overlap.** Measured, §4.4:
   hobbang.net `/` mobile `overlap-excess-ratio` 0.0333 / 0.0205 / silent →
   **0.1195 / 0.1078 / 0.0876** at 640 / 700 / 768, crossing the 0.10 BLOCKER
   line at 640 and 700 while curing a BLOCKER at 768. The cause is descendants
   still frozen at truth-capture widths whose min-content exceeds the recovered
   track; the item pass cannot see them because whether a descendant will be
   answered by another branch is not known at the time it runs. **Highest-value
   item for cycle 2.**
2. **`/` (p000001) layout probe is misaligned — the dominant unfixable residue.**
   `aligned: false`; **927 of 2,306 desktop element nodes (40.2%) and 2,291 of
   2,291 mobile element nodes (100%) carry no probe record**. Ten of the 26
   outermost desktop overflow roots at 1024 are unprobed, including the footer's
   own root `n002946` and the largest chain root `n001877` (903 descendants).
   Every width-recovery mechanism in `src/reconstruction/**` requires an
   observation; none can reach these. **An observer/compiler task, not a
   layout-inference task**, and the single highest-leverage item left on `/`.
3. **`/pricing` footer grid `n001467` stays frozen.** 6 × 224px tracks, 10
   children; `n001468` matches no track start and `n001609` matches no run, so
   the tiling test refuses `children-do-not-tile-tracks`. Skipping non-matching
   children would leave track 1 with no span-1 witness and land on
   `not-every-track-witnessed` — no honest relaxation reaches it. This is what
   keeps `footer-clipped` at 1 on `/pricing` @1100.
4. **Reflow discretisation at wrap boundaries.** §4.3: 110 hobbang x rows at 914
   and 1023 (69 nodes, Δ 16–373px) and linear's 378 less-improved x rows come
   from a residual ~28px track error moving a wrapping flex row's break point.
   Only an exact track ratio removes them; the band's fractional snap is
   constant across a band by construction, so a band whose true ratio drifts
   inside it will always leave some residue.
5. **Next-frozen-layer exposure on `p000003` mobile.** §4.5. Reachable only by a
   flex-item inline-size branch, which does not exist.
6. **`recoverGridTracksBanded()` refuses 3 of linear.app's 6 offered
   containers**, all `column-children-disagree`, recorded in its own histogram
   and never folded into the single-band one.
7. **linear `truthCheckConverged: false`** on the corrected build, with **0 rules
   dropped** (§2.3). Cosmetic today; worth a look if the count ever rises.

---

## 8. Tests and pre-fix count

Pre-fix state established by **reverting the file in place** and verifying the
reverted bytes against the hash recorded before any edit:

```
$ shasum -a 256 -c tmp/wr2875c/prefix-check.sha
src/reconstruction/layout-inference.ts: OK      # 7aa86a37ecac6b0c…
$ npx tsx scripts/smoke-layout-safety.ts
[smoke:layout-safety] 445/451 checks passed
[smoke:layout-safety] FAIL — 6 check(s) failed
```

The six, verbatim:

1. `inferLayoutRules() emits the banded kind, with its @media and its numeric band` — got `[]`
2. `…and generateLayoutCss wraps them in the SAME @media machinery responsive-hidden uses`
3. `…and a container ANSWERED by the banded pass is not ALSO counted as a refusal` — got `{}`
4. `…and the band pass's own verdict is recorded in its OWN histogram, never folded into that one` — got `{}`
5. `inferLayoutRules() emits the new kind for the item, once` — got `["g:grid-track-columns","g:damage-clamped-width"]`
6. `…and the inline-size outcome partition still sums to the candidate count`

Restored and verified:

```
$ shasum -a 256 -c tmp/wr2875c/restore.sha
src/reconstruction/layout-inference.ts: OK      # 79c934632087452e…
$ grep -c "GRID_TRACK_BANDS_ENABLED\|GRID_AREA_FILL_ENABLED" src/reconstruction/layout-inference.ts
0
```

**Four checks were added for the §2.2 mechanism**, in Part 11m, following the
lane's discipline (a discriminating twin for every new mechanism, negative
controls that must still refuse):

| # | check | what it discriminates |
|---|---|---|
| 1 | the banded recovery **publishes** the grid area it measured, per item and per width | the union exists and is complete: 2 items × 5 widths |
| 2 | …and each area is **that band's own** column width at that width, not the truth one | `1024→1024, 1100→1100, 1440→710, 1920→950` — a band-blind implementation returning the truth-index width fails here |
| 3 | POSITIVE: an item of a BANDED container is answered `grid-area-fill-width` | with `width:auto` **and** `min-width:0px`, so a correct track list never ships around items still frozen at their truth-width px — the §4.4 regression, as a test |
| 4 | **THE TWIN**: an item of a banded container that declares its **own** `min-width` is still refused | a published area is evidence, not a licence to discard an observed declaration; asserts the emitted set is exactly `{gb}` and `gridAreaFillRefusalsByReason["own-min-width-declared"] === 1` |

Two intermediate versions of these were discarded for passing for the wrong
reason and are recorded here so the discipline is auditable: check 3 first failed
because the fixture's items carry no `width` at all (`no-frozen-width`), fixed by
stamping the truth-width onto them; check 4 first "passed" by narrowing an item
40px, which made the *container* refuse `column-children-disagree` so nothing
shipped either way — replaced with the `own-min-width-declared` twin, which keeps
the container recoverable and therefore actually tests the item pass.

| suite | lane start | after adoption | **after correction** |
|---|---|---|---|
| `scripts/smoke-layout-safety.ts` | 445 / 451, **6 FAILED** | 451 / 451 PASS | **455 / 455 PASS** |
| `scripts/smoke-reconstruction.ts` | 227 / 227 PASS | 227 / 227 PASS | **227 / 227 PASS** |
| `pnpm typecheck` | exit 0 | exit 0 | **exit 0** |

Discipline held: **no check removed, none weakened.** Every emitted rule still
goes through `verifyLayoutRules()`; `acceptedUnchecked` and
`rejectedUnverifiable` are **0 / 0** on both corrected builds. The funnel
partition and the container-level accounting both conserve
(`gridTrackColumns 72 + gridTrackBandContainers 3 + gridTrackRefusals 243`
against the same 246 containers considered before).

---

## 9. Run ids

| artifact | id |
|---|---|
| source site-spec (linear) | `data/linear.app/site-specs/2026-09-04T23-34-15-786Z` |
| source site-spec (hobbang) | `data/hobbang.net/site-specs/2026-09-04T23-34-52-203Z` |
| source site-spec (gs) | `data/gs.severance.healthcare/site-specs/2026-09-04T23-32-44-789Z` |
| baseline reconstruction (the brief's) | `2026-09-05T10-13-17-947Z` |
| baseline QA (the brief's) | `2026-09-05T10-13-47-506Z` |
| A/B flag OFF / ON (linear) | `2026-09-05T10-36-04-559Z` / `2026-09-05T10-36-33-066Z` |
| A/B flag OFF / ON (hobbang) | `2026-09-05T10-37-59-284Z` / `2026-09-05T10-39-14-115Z` |
| A/B flag OFF / ON (gs) | `2026-09-05T10-40-29-682Z` / `2026-09-05T10-40-43-308Z` — both equal baseline |
| adoption rebuild (linear, pre-correction) | `2026-09-05T10-42-36-596Z` — SHA equals flag-ON |
| adoption QA, acceptance widths | `2026-09-05T10-43-13-287Z` (floor `…-290Z`) |
| adoption QA, full sweep | `2026-09-05T10-47-09-260Z` (floor `…-286Z`) |
| adoption rebuild (hobbang, pre-correction) | `2026-09-05T10-53-10-118Z` |
| **regression evidence** — hobbang `/` @640/700/768, flag-OFF vs pre-correction | `2026-09-05T11-00-17-822Z` / `2026-09-05T11-01-25-430Z` |
| **CORRECTED reconstruction (hobbang)** | **`2026-09-05T11-06-40-264Z`** — SHA `22f1ac3410ef6b61…` |
| **CORRECTED reconstruction (linear)** | **`2026-09-05T11-07-50-860Z`** — SHA `efa069f384772a42…` |
| **CORRECTED reconstruction (gs)** | **`2026-09-05T11-08-19-970Z`** — SHA `d633541616a53d3a…`, **unchanged** |
| **corrected QA — hobbang `/` @640/700/768** | **`2026-09-05T11-12-23-623Z`** |
| **corrected QA — hobbang PROTECT @390/1100/1440** | **`2026-09-05T11-13-31-951Z`** (floor `…-953Z`, PASS ×3) |
| **corrected QA — linear ACCEPTANCE** | **`2026-09-05T11-15-39-529Z`** (floor `…-531Z`) |
| **corrected QA — linear `/pricing` @390** | **`2026-09-05T11-19-24-313Z`** |
| **corrected QA — gs PROTECT (source-side artifact, §6.2)** | `2026-09-05T11-19-40-286Z` |
| geometry (corrected) | `tmp/wr2875c/geom-hobbang-fix.json`, `tmp/wr2875c/geom-linear-fix.json` |
| geometry (pre-correction, for the delta) | `tmp/wr2875c/geom-hobbang.json`, `tmp/wr2875c/geom-linear2.json` |

`seoultone.kr` not attempted: SOURCE_UNAVAILABLE (Cafe24 over-traffic stub).

---

## 10. What cycle 2 should do, in priority order

1. **Give the item pass a way to see its own still-frozen descendants.**
   §4.4 / §7.1. `min-width: 0px` is right for the track and wrong for the
   subtree; today the choice is made with no information about what is inside.
   The measurable predicate exists in the probe — a descendant whose frozen width
   exceeds the smallest published area at a displayed width will overflow — but
   it needs an ordering the funnel does not currently have (descendants are
   resolved after their ancestors). This is the one change that would let the
   correction be strictly positive instead of a trade.
2. **`/` is a probe problem, not a layout problem.** Nothing in
   `src/reconstruction/**` can move it. Either fix `p000001`'s probe attachment
   in the observer/compiler, or re-observe `linear.app` and confirm
   `layoutProbe.aligned === true` on all four pages before spending another
   cycle on that route's width residue.
3. **A flex-item inline-size branch.** `n001423` / `n001424` (§4.5) and the
   `/pricing` footer's non-tiling children are both flex-shaped; the funnel has
   no branch that can reach a flex item at all. This would also shrink the
   reflow-discretisation residue of §4.3 by fixing the children that move the
   wrap point.
4. **Do not touch `children-do-not-tile-tracks`.** §5 shows the obvious
   relaxation converts one honest refusal into a different honest refusal and
   recovers nothing.
