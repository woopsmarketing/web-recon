# Task 28.75 — the frozen-width ancestor chain, attacked at the ROOT

Lane: `src/reconstruction/**` + `scripts/smoke-layout-safety.ts` + `scripts/smoke-reconstruction.ts`.
Nothing under `src/observer/**` or `src/responsive-qa/**` was read-modified, no git
mutation of any kind was made, and no file under `docs/result/` for a wave ≤ 28.7
was touched.

Two independent changes are reported here, each measured on its own:

1. **§WIDTH** — three new recovery branches plus a predicated last-resort clamp,
   aimed at the ancestor chain that 28.7 measured as 91.3 % (linear.app) and
   99.1 % (hobbang.net) of the residual frozen population.
2. **§CANVAS** — the `<body>` background, re-homed from an in-flow block box onto
   the document canvas, which is a separate defect that happened to live in a file
   this lane owns. It has its own section, its own A/B and its own tests.

**Headline verdict.** The width work is a real, two-directionally measured gain —
**2,810 node×width boxes moved toward the source, 37 away, ΣerrW −843,251 px
(−5.85 %) over 190,590 comparisons on four corpora** — and it does **not** meet
the page-level acceptance targets on `linear.app /` at 700 / 1024 / 1100. The
reason is named and quantified in §WIDTH-9, and it is not "more leaf rules are
needed": the eight remaining outermost overflow roots on that route are each
refused for a reason the module can state, and four of them are refused because
**the source's own box overflows its parent at those widths**. The canvas work is
an unambiguous BLOCKER fix on gs.severance.healthcare with a pixel-level
before/after.

---

## §WIDTH-1. Chain analysis: method and artifact

`tmp/wr2875/width-chain/chain.mjs` renders the shipped stylesheet of a
reconstruction at every width the source probe measured, computes the residual
population with the same predicate `residualsForPass()` uses
(`layout-truth-check.ts:748-850` — source WIDTH spread ≥ 8 px, clone width spread
≤ 2 px), then walks `parentNodeId` upward. A residual node whose parent is **not**
a residual is a **CHAIN ROOT**; every residual below it is one of its descendants.

Two mistakes were made and corrected while building it, and both are worth
recording because either one silently produces a clean-looking artifact:

* the `data-wr-node` attribute carries the RAW `nodeId` (`n000678`); the prefixed
  `wr-<page>-<viewport>-<node>` form is the `id` attribute (`relations.ts:30-36`).
  Querying by the prefixed form finds 0 residuals and reports success.
* the residual predicate must use WIDTH spread on both halves. Using
  `max(widthSpread, xSpread)` drops the manifest's own #1 residual (`n000678`).

Artifacts (real files, not a console summary):
`tmp/wr2875/width-chain/chain-{linear,hobbang,gs,seoultone}-before.json`.

### Root histogram, before this lane

| site | residual nodes | chain roots | residuals under those roots |
|---|---:|---:|---:|
| linear.app | 2,101 | 301 | 1,800 |
| hobbang.net | 2,304 | 487 | 1,817 |
| gs.severance.healthcare | 217 | 15 | 202 |
| seoultone.kr | 2,305 | 304 | 2,001 |
| **total** | **6,927** | **1,107** | **5,820** |

The ratio is the whole point: **6,927 frozen boxes are 1,107 decisions.** Adding
leaf rule kinds attacks 6,927 symptoms; answering a root moves its subtree.

## §WIDTH-2. The root populations, and what was done with each

**P1 — out-of-flow boxes whose used width came from the inset equation.**
Already closed by 28.7 G (`inset-resolved-width`). Nothing added.

**P2 — in-flow FULL-BLEED bands.** 28.7 rejected this because a naive
`width: 100vw` overhangs by the scrollbar/centring offset (240 px was the number
recorded on linear.app). Re-opened and **shipped**, by co-emitting the whole
pattern instead of the one declaration:

```
width: 100vw;                  /* or calc(100vw - Npx) under content-box   */
margin-left: calc(50% - 50vw);
margin-right: calc(50% - 50vw);
left: 0px; right: auto;
```

The predicate verifies at EVERY displayed width that `|w − viewport| ≤ 2`,
`|x| ≤ 2`, that the parent's border box is centred in the viewport within
`CENTER_GAP_TOLERANCE_PX`, and that the parent's inline padding and border are
symmetric — otherwise `calc(50% - 50vw)` does not land on the viewport edge.
Refusals: `not-in-flow`, `not-viewport-wide`, `width-constant`,
`fewer-than-three-visible-widths`.

**P3 — in-flow block boxes under a BANDED parent padding.** The largest class on
all four corpora, and the reason `contentAt()` cannot answer it: `contentAt()`
reads the parent's padding ONCE, at the truth width, and treats it as a constant.
linear.app authors `padding-left: var(--page-padding-left)` and moves the change
into the custom property under `@media` — 28 px below 1025, 10 px to 1280, 46 px
above. Every parent-relative branch therefore compares against a denominator that
is wrong by 36 px or 72 px against a 2 px tolerance, and the node falls out of the
funnel as `no-branch-matched`.

`trackedFillWidth()` answers it without ever forming that denominator. It asks
only whether the GAP between the node's border box and its parent's is constant
across real parent growth, in RUNS, and whether the truth-width gap decomposes
into the box model:

* `inlineSizeBehaviour(..., { autoInlineMargins: false }).mode === "stretch"` —
  the module's own discriminator for "does `width: auto` stretch here";
* ≥ 3 visible widths, width spread ≥ `PARENT_GROWTH_MIN_PX`, no negative gap;
* the gap `parentW − ownW`, sorted by parent width, forms RUNS of a constant
  value, and every run must span ≥ `PARENT_GROWTH_MIN_PX` of parent growth
  (`gap-run-unwitnessed` otherwise — a run witnessed by one width is a
  coincidence, not a relation);
* the truth-width gap equals `parentPadding + parentBorder + marginLeft +
  marginRight` within tolerance (`gap-not-box-model`).

It emits `width: auto`. Nothing else. The banded padding is left to the browser,
which is the only party that knows it.

**P4 — grid items and absolutely-positioned boxes whose containing block is not
the parent's content box.** Refused, by `containingBlockGuard()`, unchanged. This
is now the dominant remaining class on `linear.app /pricing` (§WIDTH-9) and it is
a GRID TRACK problem, not an inline-size one.

## §WIDTH-3. §19, the damage clamp — the permitted last resort, per node

After the three branches, one class is left that no relation can be recovered
for and that is provably damaged: linear.app's site header is
`width: 1436px; max-width: 1436px` on a flex ROW item, 641 px wide at a 641 px
viewport and 1436 px at 1440. `inlineSizeBehaviour()` refuses it
`flex-item-main-axis` and is right to — `width: auto` on a flex row item is its
content size, and `width: 100%` sets a flex BASE size that grow/shrink then move
again. Neither reproduces the observation.

The clamp claims something much weaker than a relation, and fully measured:
**this box never left its containing block in the source, and the frozen pixel
makes it leave it in the clone.** It emits `max-width: 100%` (or
`calc(100% - Npx)` under `content-box`) and nothing else.

Predicate, per node — there is no blanket cap:

| control | refusal |
|---|---|
| the node has a frozen px width at all | `no-frozen-width` |
| ≥ 2 displayed widths | `fewer-than-two-visible-widths` |
| the SOURCE's own width moves ≥ `RESIDUAL_SOURCE_CHANGE_MIN_PX` | `source-width-constant` |
| the frozen px IS the truth-width observation (so the cap is a no-op there) | `frozen-width-not-observed` |
| the containing block IS the parent's content box | `containing-block-not-parent` |
| the source never leaves its containing block, and no negative inline margin says it means to | `source-overflows-parent` |
| the frozen box leaves that block by ≥ `PARENT_GROWTH_MIN_PX` somewhere | `no-material-damage` |
| the node's own padding/border is readable under `content-box` | `own-box-unreadable` |

`CLAMPABLE_GUARDS` admits exactly three guard verdicts —
`flex-item-basis-governed`, `parent-padding-unreadable`,
`parent-padding-not-constant` — because those three are refusals about the
DENOMINATOR being unknowable, and `max-width: 100%` never names a denominator; it
hands the containing block back to the browser exactly as `width: auto` does. The
four that are NOT admitted (`grid-item`, both `abs-containing-block-*`,
`fixed-position`) are refusals about the containing BLOCK being a different box,
where a percentage would resolve against a box the predicate never measured.
`containingBlockGuard()` itself is **byte-for-byte unchanged**.

### The bug the discriminating twin caught

The first build compared the source's box and the damage against the parent's
**border** box. `max-width: 100%` names the parent's **content** box. On
linear.app `/`, `n000575` is `<h2 style="width: 1250px; margin-left: -2px">`
inside a parent whose border box is 1280 px at that width and whose content box is
1188 px — the source genuinely overflows its containing block there. The cap
measured **+62.0 px of new error on `n000575` at 1280** and **+307.9 px on its
inline `<strong>` child `n000577` at 1101** (source 508.81, before 597.58, after
905.45).

Fixed by introducing `containingBlockAt(entry) = parentProbe.w[i] − (frozen
parent padding + border)` and testing BOTH the containment control and the
material-damage control against it. After the fix `n000575` is refused
`source-overflows-parent`, `n000011` (the site header) still clamps, and
linear.app `p000001` desktop went from 18 clamps to 13. The fixture in
`smoke-layout-safety` Part 11k reproduces exactly this shape and asserts the
refusal.

## §WIDTH-4. Where the new branches sit in the funnel

Every new branch is reached **only from an exit that had already refused**. The
five `if (tryInsetResolved()) continue;` exits became

```ts
if (tryInsetResolved()) continue;
if (tryTrackedFill()) continue;
if (tryViewportBleed()) continue;
if (tryDamageClamp()) continue;
```

and the three `widthValue === undefined` exits call `tryDamageClamp()`. No branch
can steal a node a shipping branch would have answered; Part 11g/11h/11k each
assert that a node the ordinary branches CAN answer keeps its existing rule.

The `InlineSizeOutcome` partition is preserved: three new members
(`emitted-tracked-fill-width`, `emitted-viewport-bleed-width`,
`emitted-damage-clamped-width`) and one new counter,
`inlineSizeOutcomesSuperseded`, for the case where the clamp picks up a node whose
branch had ALREADY recorded `refused-width-mode`. Without the supersede that node
would be counted twice and `sum(outcomes) === candidates` would silently break; it
is counted rather than silent, and Part 11k asserts both halves.

## §WIDTH-5. A/B discipline: the flag-OFF byte-identity proof

Every mechanism was built behind a flag that defaulted OFF, and the OFF build was
proved byte-identical to the pre-lane build before any ON measurement was
believed. SHA-256 of `app/public/wr/generated-styles.css`:

| site | pre-lane run | flag-OFF run | verdict | sha256 |
|---|---|---|---|---|
| linear.app | `2026-09-04T21-58-43-098Z` | `2026-09-04T22-18-25-593Z` | IDENTICAL | `84177a22…c94773` |
| hobbang.net | `2026-09-04T21-59-13-014Z` | `2026-09-04T22-19-00-628Z` | IDENTICAL | `ef236163…f45fa` |
| gs.severance.healthcare | `2026-09-04T22-00-22-073Z` | `2026-09-04T22-20-16-979Z` | IDENTICAL | `bb3b152d…4ea8e247` |
| seoultone.kr | `2026-09-04T22-00-44-055Z` | `2026-09-04T22-20-34-819Z` | IDENTICAL | `8a1b3905…39708156` |

The flags were **removed** on adoption. No dead toggle ships; the code has one
path.

## §WIDTH-6. What the mechanism emitted

Rules added, ON build vs the flag-OFF baseline (`reconstruction-manifest.json`):

| site | tracked-fill | viewport-bleed | damage-clamp | guard refusals | `no-branch-matched` |
|---|---:|---:|---:|---|---|
| linear.app | 40 | 8 | 111 | 453 → 373 | 3,654 → 3,579 |
| hobbang.net | 84 | 0 | 0 | 174 → 174 | 885 → 801 |
| gs.severance.healthcare | 2 | 1 | 1 | 0 → 0 | 689 → 686 |
| seoultone.kr | 77 | 1 | 38 | 90 → 11 | 1,533 → 1,501 |
| **total** | **203** | **10** | **150** | | |

`rejectedByTruthCheck` and `acceptedRegressed` are **0 on every site, before and
after** — every new rule went through `verifyLayoutRules()` like any other.

Chain roots ANSWERED, against the pre-fix chain artifacts:

| site | roots closed | of | descendant residuals under closed roots | of |
|---|---:|---:|---:|---:|
| linear.app | 21 | 301 | 322 | 1,800 |
| hobbang.net | 84 | 487 | 678 | 1,817 |
| gs.severance.healthcare | 3 | 15 | 123 | 202 |
| seoultone.kr | 56 | 304 | 517 | 2,001 |
| **total** | **164** | **1,107** | **1,640 (28.2 %)** | **5,820** |

### Refusal histograms — the evidence the branches are predicated, not blanket

Summed over all four corpora (per-site figures in the handoff JSON):

* `trackedFillWidth` — 7,275 refusals: `auto-does-not-stretch` 5,386 (74.0 %),
  `width-constant` 1,395 (19.2 %), `gap-run-unwitnessed` 469 (6.4 %),
  `negative-gap` 15, `fewer-than-three-visible-widths` 10.
* `viewportBleedWidth` — 7,265: `width-constant` 4,908 (67.6 %),
  `not-viewport-wide` 1,713 (23.6 %), `not-in-flow` 622 (8.6 %),
  `fewer-than-three-visible-widths` 22.
* `damageClampWidth` — 7,194: `source-width-constant` 5,143 (71.5 %),
  `no-material-damage` 913 (12.7 %), `containing-block-not-parent` 865 (12.0 %),
  `source-overflows-parent` 138 (1.9 %), `fewer-than-two-visible-widths` 105,
  `frozen-width-not-observed` 30.

150 clamps against 7,194 refusals is the arithmetic of "prove the predicate per
node". Note also that `gap-not-box-model` never fires on these four corpora — it
fires only in the Part 11g fixture, which is exactly what a control for a
coincidence should look like.

## §WIDTH-7. Two-directional geometric measurement

Method: `tmp/wr2875/width-chain/geom2.mjs` (adapted from
`tmp/wr287-ideas/frozen-width-chain-root/geom.mjs`). Both stylesheets are rendered
in headless Chromium at every probe width, per page and per viewport variant, with
all network aborted; every node's rendered border box is compared with the
SOURCE's own probe at the same width. IMPROVED = the error shrinks by more than
2 px, WORSENED = it grows by more than 2 px. Both directions are reported, and the
X axis is reported alongside the width axis because a width change moves boxes.

| site | comparisons | improved W | worsened W | ΣerrW before → after | improved X | worsened X | ΣerrX before → after |
|---|---:|---:|---:|---|---:|---:|---|
| linear.app | 82,579 | 882 | 7 | 5,714,831 → 5,407,503 (**−5.4 %**) | 249 | 277 | 8,501,127 → 8,508,835 (+0.09 %) |
| hobbang.net | 34,466 | 922 | 30 | 2,293,677 → 2,001,045 (**−12.8 %**) | 175 | 25 | 1,673,490 → 1,633,993 (−2.4 %) |
| gs.severance.healthcare | 10,408 | 20 | 0 | 386,167 → 380,305 (**−1.5 %**) | 0 | 0 | 11,315,818 (unchanged) |
| seoultone.kr | 63,137 | 986 | 0 | 6,021,241 → 5,783,812 (**−3.9 %**) | 2,918 | 424 | 13,844,899 → 13,256,267 (−4.3 %) |
| **total** | **190,590** | **2,810** | **37** | **14,415,916 → 13,572,665 (−5.85 %)** | **3,342** | **726** | **35,335,334 → 34,714,908 (−1.8 %)** |

**Every worsened row, named:**

* linear.app `p000001` `n002815` `<p>`, 1101 px: source 549.50, before 549.50,
  after 481.00 — **+68.5 px**. Its own clamp. The `<p>` sits in a customer card
  `<a>` with a constant 32 px padding, so the clamp's containing-block estimate is
  right about the SOURCE; the card itself is still mis-sized in the CLONE at that
  width, and `100 %` of a wrong containing block is wrong. This is the inherent
  cost of a percentage cap and it is the single largest regression in the corpus.
* linear.app `p000002` at 1025: `n000074` +20.3, `n000093` +11.6, `n000087` +4.0,
  `n000081` +3.5, `n000078` +2.6 — one subtree, five rows.
* hobbang.net `p000001` mobile at 639: 30 rows of ≈ +20.9 px each, all descendants
  of `n001156`, which took a `tracked-fill-width` `width: auto`. The ancestor's own
  box improved; these children over-widened from 87 (source 106.97) to 147.84.
  Against hobbang's 922 improved rows and −12.8 % ΣerrW this is accepted, and it
  is the reason the site's ΣerrX still fell.

37 worsened out of 190,590 comparisons is 0.019 %.

## §WIDTH-8. Page-level outcomes at the acceptance widths

`documentElement.scrollWidth`, `scrollHeight`, and the maximum right edge over all
visible nodes, before → after, desktop variant:

| route | width | scrollWidth | maxRight | scrollHeight |
|---|---:|---|---|---|
| linear `/` (p000001) | 700 | 862 → 862 | 1839 → 1839 | 9960 → 9960 |
| linear `/` | 1024 | 1024 → 1024 | 1839 → 1839 | 9960 → 9960 |
| linear `/` | 1100 | 1100 → 1100 | 1839 → 1839 | 9960 → 9960 |
| linear `/` | 1440 | 1440 → 1440 | 1841 → 1841 | 9960 → 9960 |
| linear `/changelog` (p000002) | 1100 | 1100 → 1100 | 1438 → **1390** | 24479 → 24479 |
| linear `/pricing` (p000003) | 1100 | 1100 → 1100 | 1438 → **1390** | 6360 → 6360 |
| linear `/pricing` | 1440 | 1440 → 1440 | 1440 → 1440 | 6360 → 6360 |
| linear `/pricing` (mobile) | 390 | 390 → 390 | 1176 → 1176 | 7714 → 7714 |

**PROTECT satisfied.** `/pricing` at 390 and at 1440 are unchanged in every
page-level number, and `p000003` has **zero** worsened node rows in the
two-directional measurement.

## §WIDTH-9. Acceptance verdict: NOT MET on `linear.app /`, and why

The mandatory targets on `/` at 700 / 1024 / 1100 are **not met**. This lane moved
none of the page-level numbers on that route. The honest account:

**(a) 700 px was never observed.** The probe widths for that page are
`[390, 640, 641, 769, 900, 901, 928, 929, 1024, 1025, 1101, 1280, 1281, 1440,
1441, 1920]`. There is no measurement at 700; the nearest are 641 and 769.

**(b) The SOURCE's own desktop DOM overflows its viewport at every observed
width.** Max right edge over all visible source nodes, from the probe itself:

| width | 641 | 769 | 928 | 1024 | 1101 | 1280 | 1440 | 1920 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| source maxRight | 1661 | 1661 | 1661 | 1661 | 1665 | 1690 | **1840** | 2080 |
| overflow | +1020 | +892 | +733 | +637 | +564 | +410 | **+400** | +160 |

The clone's 1839 is the source's own 1840. `maxRight` is therefore the wrong
acceptance metric on this route — those boxes exist in the source, clipped by an
ancestor's `overflow-x`. What actually scrolls, `scrollWidth`, is 862 at 700
(162 px of horizontal scroll) and exactly the viewport at 1024, 1100 and 1440.

**(c) Every remaining outermost overflow root is refused for a stated reason.**
At 700 px, 78 nodes render wider than the viewport; they reduce to **8 outermost
roots**, and each of the three branches was asked directly
(`tmp/wr2875/width-chain/why.ts`):

| node | box | tracked-fill | viewport-bleed | damage-clamp |
|---|---|---|---|---|
| `n001526` `<div>` abs flex, 1636 px | decorative panel | `auto-does-not-stretch` | `not-in-flow` | `source-width-constant` |
| `n000678` `<div>` rel, 1478.39 px, 339 descendants | source x goes to −110 | `negative-gap` | `not-viewport-wide` | `source-overflows-parent` |
| `n001173` `<div>` rel, 1392 px | same signature | `negative-gap` | `not-viewport-wide` | `source-overflows-parent` |
| `n001864` `<div>` rel, 1392 px | same signature | `negative-gap` | `not-viewport-wide` | `source-overflows-parent` |
| `n000119` `<div>` grid, 1320 px | **source is 1320 at 928 too** | `width-constant` | `width-constant` | `source-width-constant` |
| `n002713` `<div>` abs, 1280 px | CB is a padding box | `auto-does-not-stretch` | `not-in-flow` | `containing-block-not-parent` |
| `n000575` `<h2>`, 1250 px | overflows its content box | `gap-run-unwitnessed` | `not-viewport-wide` | `source-overflows-parent` |
| `n000069` `<span>` inline | `width: auto` already | `auto-does-not-stretch` | `not-in-flow` | `no-frozen-width` |

Four of the eight are refused because **the source's own box overflows its
parent** at the widths in question, one because the source width is genuinely
constant at 1320 px across the whole desktop range (so it is not frozen — it is
authored), one is inline text with no frozen width at all, and one is refused by
`containingBlockGuard()`. **Not one of them is a case a further inline-size rule
kind would answer.** Making the clone match the source at those widths reproduces
the source's own overflow; the target "no content materially wider than the
viewport at 700" is a statement about which TREE is served at 700 (the site
breakpoint was inferred as 641, so the desktop tree is served from 641 upward),
which belongs to the tree-switch / breakpoint lane, not to width recovery.

**(d) `/pricing` at 1100 improved but is not cleared.** Nodes wider than the
viewport 76 → 74, maxRight 1438 → 1390, no horizontal scroll before or after. The
three remaining outermost roots are all 1344 px — `n000353`, `n001421` and
`n000324` — and all three are refused `containing-block-not-parent`: they are
**grid items inside a frozen grid track**. `n000291`, the `<a>` that used to head
that list, WAS closed by `tracked-fill-width`. The dominant remaining class on
this route is therefore GRID TRACK recovery (`recoverGridTracks`, 28.6 A5), not
inline size. That is the single highest-value follow-on this lane can name.

## §WIDTH-10. Complexity and regression risk

`layout-inference.ts` grew from 4,055 to ~4,600 lines: three predicate functions,
their refusal enums and counters, three call-site groups, and `supersedeOutcome()`.
No existing branch was modified, no tolerance was changed, no assertion was
weakened or deleted, and `containingBlockGuard()` is byte-for-byte unchanged.

Risk, ranked:

1. **The clamp is the only mechanism that can make a box NARROWER than the frozen
   pixel**, and its correctness depends on the CLONE's containing block being
   right. Where an ancestor is still wrong, the cap inherits that error
   (`n002815`, +68.5 px). Measured cost: 7 rows on linear, 0 elsewhere.
2. `tracked-fill-width` hands sizing back to the browser, so a descendant that was
   accidentally right under a frozen ancestor can become wrong (hobbang's 30 rows).
3. Both are bounded by `verifyLayoutRules()`, which re-renders at the truth width
   and rejected 0 of these rules and regressed 0.

## §WIDTH-11. Tests

`scripts/smoke-layout-safety.ts`: **325 → 394 checks, all PASS.** New parts:

* **11g** `trackedFillChecks` — a banded fixture (padding 20 below 1281, 92 above)
  over 7 widths. Positive emission; the evidence names both constant-gap runs and
  the box-model decomposition; **the discriminating twin** `calcbox`, identical
  tracking with a gap of 200 against a box model of 92, refused
  `gap-not-box-model`; negative controls for a constant fraction
  (`gap-run-unwitnessed`), a fixed width (`width-constant`) and a grid item; the
  funnel partition; and "a node the ordinary branches CAN answer keeps its rule".
* **11h** `viewportBleedChecks` — the whole declaration set is emitted, not one
  declaration; the frozen values it replaces are named; the parent-centred
  measurement appears at every width; a decorative bleed of viewport + 40 is
  refused `not-viewport-wide`; **the twin**, the same band inside a LEFT-ALIGNED
  parent, refused `parent-not-centred`.
* **11i** `trackedFillTruthCheckChecks` — both new kinds go through the real
  `verifyLayoutRules()`; a bleed set applied to `.p9-fill` is rejected by exactly
  332 px.
* **11k** `damageClampChecks` — the pre-fix reproduction (`flex-item-main-axis`,
  1436 − 700 = 736 px); the cap and its CLAMP-not-a-relation evidence; **the
  discriminating twin** (fits the border box, overflows the content box →
  `source-overflows-parent`) with a companion check proving the twin really does
  fit the border box, which is why the test had to change; negative controls for
  an intentional bleed, a constant width, 28 px of non-material damage and a grid
  item; and the SUPERSEDE fixture — linear's header signature exactly — asserting
  that the refusal is un-counted and the partition still sums.
* **11l** `damageClampTruthCheckChecks` — a no-op clamp ships having been
  RENDERED; a clamp that bites at the truth width is rejected.
* **11j** `documentCanvasChecks` — see §CANVAS-5.

`scripts/smoke-reconstruction.ts`: **227/227 PASS**, unchanged.

### Pre-fix failure count, established honestly

`src/reconstruction/layout-inference.ts` and `style-generator.ts` were hashed, the
mechanisms were reverted in place (an early `return { ok: false }` at the top of
each of the three predicates, and an early empty return in
`resolveDocumentRootCanvas`), the suite was re-run, and the files were restored and
verified with `shasum -a 256 -c` (all three OK).

**30 of the 69 new checks FAIL with the mechanisms reverted** — 22 width, 8 canvas.
The other 39 are reproductions, negative controls and partition invariants that
must pass in both states, which is what makes them controls.

## §WIDTH-12. Final artifacts

`pnpm typecheck` exit 0. Reconstructions rebuilt for all four canary site-specs
with the final code (hash-verified identical to the code that built them):

| site | final run id |
|---|---|
| linear.app | `2026-09-04T22-58-09-200Z` |
| hobbang.net | `2026-09-04T22-58-42-201Z` |
| gs.severance.healthcare | `2026-09-04T22-59-51-124Z` |
| seoultone.kr | `2026-09-04T23-00-04-830Z` |

The observer lane is concurrently adding `float` / `clear` / `text-indent` to the
whitelist and fixing a scroll bug, after which all four site-specs will be
regenerated. **The A/B comparisons above remain valid as controlled comparisons —
both halves were built from the same site-spec — but the absolute numbers are not
the final outcome.**

---

# §CANVAS — the `<body>` background belongs to the document canvas

## §CANVAS-1. The defect

CSS 2.1 §14.2 / css-backgrounds §2.11.2: the ROOT element's background paints the
canvas, and when the root has none, the BODY's background is propagated to the
canvas instead — in both cases the background paints the canvas, not a box, and
the element itself is then treated as having no background.

The generator emitted the observed `<body>` background as an ordinary in-flow
block background on the generated `.wr-doc-*` wrapper. On
`gs.severance.healthcare /gs/index.do` the wrapper's opaque white therefore paints
at painting-order step 3, **over** the hero image at `z-index: -1` (step 2),
leaving white headline text on white. BLOCKER-grade. That it was purely a z-order
question was already established: the hero sits at exactly source geometry
`(-240, 215, 1920×500)` with `opacity: 1` and a decoded image, and at 390 px the
same clone renders correctly because the mobile `<img>` is `position: static;
z-index: auto`.

## §CANVAS-2. The fix, and why it is generic

In `src/reconstruction/style-generator.ts`:

* `DOCUMENT_ROOT_CANVAS_PROPERTIES` — the twelve `background-*` names, shorthand
  included.
* `paintsBackground(props)` — true when the image is not `none` OR the colour is
  not fully transparent.
* `resolveDocumentRootCanvas({ pages, styleLookup })` — per PAGE, finds the
  document root and the body, and applies the spec's precedence: **if the ROOT
  paints, the ROOT's background is the canvas and the body's is NOT propagated**;
  only when the root paints nothing is the body's used. Refusals:
  `document-root-not-found`, `no-background`, and `viewports-disagree` (the two
  viewport variants must agree on the declaration TEXT — a canvas is one thing per
  document, and guessing which variant wins is not a measurement).
* `declarations()` gained an optional `keep` set, so the doc-root rule can emit
  everything EXCEPT the promoted properties, and the promoted properties are
  emitted once in an `html` rule. **The declaration is MOVED, never dropped.**

Keyed entirely on the document-root/body relationship the spec defines. No host,
class, selector or site appears anywhere in it.

**Why `html:has([data-wr-page="pXXXXXX"])` rather than a bare `html { … }`.** One
generated app serves every route from one stylesheet. hobbang.net's `/` has
`background-color: rgb(246, 247, 249)` on `<body>` while its nine other routes
have none; a global `html` rule would tint all ten. The canvas is therefore
emitted once per PAGE and scoped to it, with pages that share an identical
declaration text grouped into one rule.

## §CANVAS-3. A/B — measured separately from the width work

Two builds from the same site-specs and the same width code, differing only in
whether the canvas decision reaches `generateStylesheet()`:

| site | canvas-OFF run | canvas-ON run | stylesheet |
|---|---|---|---|
| linear.app | `2026-09-04T22-54-40-705Z` | `2026-09-04T22-58-09-200Z` | 9,179,352 → 9,178,618 B |
| hobbang.net | `2026-09-04T22-55-13-089Z` | `2026-09-04T22-58-42-201Z` | 3,664,491 → 3,664,397 B |
| gs.severance.healthcare | `2026-09-04T22-56-21-474Z` | `2026-09-04T22-59-51-124Z` | 2,616,559 → 2,616,240 B |
| seoultone.kr | `2026-09-04T22-56-34-653Z` | `2026-09-04T23-00-04-830Z` | **byte-identical** |

Every difference is a re-homing, and nothing else. Rule-level diff:

* **linear.app** — 8 `.wr-doc-*` tokens (4 pages × 2 viewports) each lose the same
  5 declarations; one rule
  `html:has([data-wr-page="p000001"]), …, html:has([data-wr-page="p000004"])`
  gains `background-color: rgb(8, 9, 10)` + the four longhands. Source = **ROOT**
  on all four pages: linear carries its background on `<html>`, so this corpus
  exercises the root-wins precedence path in production, not only in a fixture.
* **hobbang.net** — 2 tokens (one page × 2 viewports) lose them; one
  `html:has([data-wr-page="p000001"])` rule gains
  `background-color: rgb(246, 247, 249)`. The other 9 pages are refused
  `no-background` and are untouched.
* **gs.severance.healthcare** — 4 tokens (2 pages × 2 viewports) lose them; one
  grouped rule for both pages gains `background-color: rgb(255, 255, 255)`.
  Source = **body** on both.
* **seoultone.kr** — 13 pages, all refused `no-background`; output byte-identical.

Accounting: on linear 40 declarations (8 × 5) become 5 in one grouped rule — the
declaration lands in exactly one place per page rather than once per doc-root
token, which is where the −734 bytes come from. Nothing is dropped; the smoke
ACCOUNTING check asserts an identical declaration count on the single-page case,
where no grouping can hide a loss.

## §CANVAS-4. The paint measurement

`tmp/wr2875/width-chain/paint.mjs` renders one reconstruction page at one width
with all network aborted, and reads back single pixels via a 1×1
`page.screenshot({ clip })` decoded with `node:zlib` `inflateSync` (for a 1×1 PNG
every filter type reduces to the raw bytes). Hit-testing was tried first and
discarded: `elementFromPoint` returns the hero in BOTH worlds, because hit testing
is not painting.

`gs.severance.healthcare /gs/index.do`, desktop, 1440 px, natural render with **no
probe colour injected**, seven points inside the hero band
(`n002542`, measured at exactly `(-240, 215, 1920×500)` in both builds):

| point | canvas OFF | canvas ON |
|---|---|---|
| (200, 300) | `255,255,255` | `28,26,57` |
| (720, 300) | `255,255,255` | `114,119,160` |
| (1200, 300) | `255,255,255` | `143,151,196` |
| (200, 500) | `255,255,255` | `15,9,32` |
| (720, 500) | `255,255,255` | `189,187,195` |
| (1200, 500) | `255,255,255` | `63,58,80` |
| (720, 700) | `255,255,255` | `47,36,53` |

Before: the entire hero band is flat white — the body's box background covering
everything below it. After: the hero layer paints. The white headline text over
that band goes from invisible to legible. A confirmatory run with a red probe
colour forced onto the hero (identically on both sides, changing no geometry and
no stacking) gives the same verdict: fully hidden before, visible after.

## §CANVAS-5. Tests (Part 11j) and pre-fix failure

Eight of the new checks are canvas checks, and all eight FAIL with the mechanism
reverted:

* the BODY's background becomes the canvas when the root paints nothing;
* it is emitted on the real `html`, scoped to the page it came from;
* the `.wr-doc-` rule that supplied it no longer paints a box background;
* **ACCOUNTING** — the total declaration count is identical with and without;
* **THE DISCRIMINATING TWIN** — when the ROOT paints, the ROOT's background is the
  canvas and the body's is not propagated, and it is the ROOT's `.wr-doc-` rule
  that gives its background up;
* negative control — a page where neither paints gets no canvas rule at all;
* negative control — a page whose two viewports disagree is REFUSED, not guessed.

Plus `paintsBackground()` unit checks and a real Chromium **paint-order proof** in
the harness: a `z-index: -1` box under a body wrapper, screenshotted and decoded,
covered before and visible after. (That fixture needed `p { margin: 0 }` and a
`min-height` on the wrapper — margin collapse had moved the wrapper's box off the
probe point, which is a fixture bug that would have made the check pass for the
wrong reason.)

---

## Summary of what a reviewer should check first

1. §WIDTH-7 — the two-directional table, and every one of the 37 worsened rows
   named in §WIDTH-7's list.
2. §WIDTH-9 — the acceptance verdict is NOT MET on `linear.app /`, with the
   per-node refusal table and the source's own overflow figures behind it.
3. §WIDTH-3 — the clamp predicate and the 62 px / 307.9 px bug its twin caught.
4. §CANVAS-4 — the seven-point pixel table.
5. The pre-fix count: 30 of 69 new checks fail when the mechanisms are reverted.
