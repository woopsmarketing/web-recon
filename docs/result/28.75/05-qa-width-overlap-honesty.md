# 28.75 / 05 — QA honesty: the broken image, the band nobody diffed, and the popup only one side saw

**Lane:** `src/responsive-qa/{overlap,classify,pixel-gate,composite,capture,types,run,index}.ts`,
`scripts/smoke-responsive-qa.ts`.
**Status:** shipped. Rubric **5 → 6**. Suite **271 → 349** checks (+78), all passing.
`npx tsc --noEmit` exit 0, repo-wide.
**Ordering rule honoured:** every severity change in this report landed BEFORE the
closure canary reruns, and `RUBRIC_VERSION` was bumped, so no rubric-5 floor is
comparable to a rubric-6 verdict (§5).

---

## 0. The three defects in one line each

| # | what the instrument did | what it does now |
|---|---|---|
| **L1** | one broken image asset, on either leaf, demoted a genuine layout collapse out of the BLOCKER-capable `overlap-excess-ratio` before any geometry was consulted | geometry and ownership decide first; the load flag only chooses which fault owns a pair that is already ONE PICTURE DRAWN TWICE, and the area the guard still demotes is itself graded against the source's own |
| **L3** | the pixel diff compared a top-left min-crop and dropped the remainder in silence — on an overflowing page, exactly the offscreen band under investigation | the crop stays and the band is measured, in area and in ink, on both sides; an inky uncompared band is a MAJOR finding and the composite hatches the strip in red |
| **B7** | the observer dismissed entry popups and the QA source capture did not, so the clone was charged `missing-text-ratio` for copy the engine deliberately removed | both sides run the observer's own two-call page-state contract; a source overlay that will not close makes the pair declare itself NOT COMPARABLE instead of charging the clone |
| **M6** | two channels the visual auditor found stricter than the images justify | reviewed against the self-check floor and **LEFT ALONE**, with the floor numbers and the reason recorded, plus permanent checks that freeze both thresholds (§4) |

---

## 1. Defect L1 — a broken image erased a severe overlap

### 1.1 The old behaviour, at file:line

`src/responsive-qa/overlap.ts:113-131`, `classifyOverlapPair`, with a docstring
that said "ORDER MATTERS AND IS DELIBERATE":

```ts
:118   if (a.loaded === false || b.loaded === false) return "failed-image-layer";
:119-129   …same visual owner AND sameBoxWithin → "duplicate-image-stack"
:130   return "true-overlap";
```

The load flag was consulted **first**, before any geometry or ownership test,
and it fired when **either** leaf failed. `classify.ts` then routes the three
kinds to three different places: `true-overlap` feeds `overlap-excess-ratio`
(BLOCKER at 0.10 of a viewport), while `failed-image-layer` feeds
`image-layer-state` (MAJOR only, and banded on a *leaf count*, not on area).

So a real geometric collapse — two different visual owners landing on top of
each other — was demoted from BLOCKER-capable to MAJOR-only whenever one of the
two colliding things happened to be an image whose asset did not decode. A
broken image is the normal early failure mode of a fresh public site, which is
where this wave is heading next, so the guard fired hardest exactly where a
false negative costs most.

The demoted total was carried in `overlap-excess-ratio-undemoted`, but at
`classify.ts:556-560` it went to `rubric.record(...)`, not `rubric.evaluate(...)`.
`record()` takes no bands, so no amount of demoted area could ever move a
verdict. A guard that can only subtract, and whose subtraction nothing can
question, is the shape of an instrument that quietly stops finding things.

### 1.2 The new behaviour

`overlap.ts` — geometry and ownership first, in three steps:

```ts
const sameVisualOwner = a.key === b.key || (a.ownerKey && a.ownerKey === b.ownerKey);
const oneLayer = a.kind === "image" && b.kind === "image"
              && sameVisualOwner && sameBoxWithin(a, b, tolerancePx);
if (!oneLayer) return "true-overlap";                                 // 1
if (a.loaded === false || b.loaded === false) return "failed-image-layer"; // 2
return "duplicate-image-stack";                                        // 3
```

### 1.3 Why this is principled and not a preference

The demotion asserts one thing: *these two boxes are one thing on screen, so
their intersection is not extra area*. That assertion is self-evident for a
`<picture>` under its own `<img>`, a placeholder under its full-res source, or a
crossfade holding two layers — same owner, same rectangle, to within
`DUPLICATE_IMAGE_LAYER_TOLERANCE_PX` (2px) on every edge. It is simply FALSE for
two different components in the same place.

A failed asset does not make it true. Whether a resource decoded is a fact about
the network; whether two different owners occupy one rectangle is a fact about
layout; the first is not evidence about the second. A broken `<img>` keeps the
box its CSS gives it, so the collision it participates in is the same collision
it would have participated in had the bytes arrived. The "counting the same
square pixels twice" argument the old order rested on is only valid inside the
one-layer population — which is exactly where step 2 now applies it.

`failed-image-layer` is therefore a strictly narrower category: it can only
claim pairs that would otherwise have been `duplicate-image-stack`. That is
intended, and it is the reason the demoted area is now graded.

### 1.4 The undemoted signal, made able to move a verdict

New FIRING channel, `classify.ts` §5b:

```
overlap-demoted-excess-ratio
  = (clone.duplicateImageStackAreaRatio + clone.failedImageLayerOverlapAreaRatio)
  - (source.duplicateImageStackAreaRatio + source.failedImageLayerOverlapAreaRatio)

bands: BLOCKER 0.10   MAJOR 0.02   MINOR 0.001     (the overlap channel's OWN bands)
```

Not a second, laxer copy of the primary channel — it reads a **disjoint**
population, so it cannot double-count — and not a new tuned scale: it is the
same quantity (viewport-fractions of collided area, relative to the source) read
over the population the guard removed, so grading it on any other scale would be
inventing a number.

The relativity is the whole argument. The SOURCE is rendered by the same
browser, at the same width, under the same pinning policy (`animations:
"disabled"`, videos paused and rewound). Both of the guard's explanations —
"the platform draws a picture as two layers" and "an asset failed to decode" —
apply equally to the source. A genuine platform artefact therefore **cancels
exactly**, and demoted area that does not cancel is area the clone piled up and
the guard excused with an explanation the source refuses to corroborate.

`Classification.demotions` gains `demotedOverlapExcessRatio` and
`demotedOverlapRegraded`, and `summary.coverage` gains
`overlapDemotionsRegraded`, so "guard 3 removed a finding here" is now always
printed next to "and here is where that area was re-graded".

### 1.5 The mutation proof, and where it fires

28.7's honest admission was that all four demotion counters read **0** on all
four canary runs — every guard was fixture-verified and never corpus-verified.
That was re-measured for this report and it is still true:

| run | pair | dup pairs s/c | failed-layer pairs s/c | `overlapFindingDemoted` |
|---|---|---|---|---|
| `linear.app 2026-09-04T22-53-25-263Z` | `/pricing` @390, @1440 | 0/0 | 0/0 | false |
| `hobbang.net 2026-09-04T18-17-44-481Z` | `/` and `/링크모음/검색/` @390, @1100, @1440 | 0/0 | 0/0 | false |
| `gs.severance.healthcare 2026-09-04T22-53-01-661Z` | `/gs/index.do` @1100, @1440 | 0/0 | 0/0 | false |
| `seoultone.kr 2026-09-04T18-18-47-244Z` | `/` @390, @1440 | 0/0 | 0/0 | false |

**Stated plainly: the demotion populations are EMPTY on every real pair measured
to date, so `classifyOverlapPair`'s reorder changes no number on any canary run,
and `overlap-demoted-excess-ratio` reads exactly 0 on all of them. Both fire on
FIXTURES ONLY today.** That is not a reason to leave the order wrong — it is the
reason the branch had to be mutation-proved rather than corpus-proved, and it is
why the demoted area is now gradeable at all.

The mutation, in `scripts/smoke-responsive-qa.ts` §L1:

```
baseline fixture                                    → PASS, 0 findings
same fixture, clone duplicateImageStackAreaRatio 0.2,
              source 0.0                            → BLOCKER
                                                       finding overlap-demoted-excess-ratio:BLOCKER
                                                       demotions.overlapFindingDemoted   = true
                                                       demotions.demotedOverlapRegraded  = true
                                                       demotions.demotedOverlapExcessRatio = 0.2
                                                       overlap-excess-ratio NOT also fired
```

**The verdict moves, PASS → BLOCKER, on the demoted area alone.** Two negative
controls sit beside it: the same demoted area on BOTH sides cancels and raises
nothing, and a source that stacks MORE than the clone can never fire it (the
direction is one-way).

### 1.6 The discriminating twin

The duplicate-layer separation exists to stop a crossfade being scored as a
defect, and it still works — asserted, not asserted-about:

| case | classified |
|---|---|
| crossfade: same owner, same box, both decoded | `duplicate-image-stack` (demoted) |
| the same crossfade with one layer's asset failed | `failed-image-layer` (demoted, one fault, one name) |
| same owner, DIFFERENT box | `true-overlap` |
| DIFFERENT owner, same box, both decoded | `true-overlap` |
| DIFFERENT owner, same box, one broken | `true-overlap` ← **the defect, cured** |
| hero vs broken banner, different owners, overlapping | `true-overlap`, and the same in the reverse argument order |

### 1.7 Two existing assertions were INVERTED, deliberately

Two checks in the suite pinned the defect and had to be corrected. This is
recorded here rather than buried, because "do not weaken a check" has to mean
something:

| check | was | is |
|---|---|---|
| `an overlap involving an image whose asset did not paint is attributed to the layer state` | `classifyOverlapPair(good, broken) === "failed-image-layer"` | `=== "true-overlap"`, renamed `a collision between two DIFFERENT owners is a real overlap even when one asset did not paint` |
| `the sweep counts the broken leaf and keeps its overlap OUT of the true-overlap total` | `failedImageLayerOverlapPairCount === 1 && trueOverlapPairCount === 0` | `failedImageLayerOverlapPairCount === 0 && trueOverlapPairCount === 1 && trueOverlapArea > 0`, plus the broken leaf still counted |

Neither loses coverage: both still assert on the same fixture, in the same
direction, and the L1 section adds 20 further checks around them. `good` and
`broken` are different keys and different owners occupying one box — a layout
collapse, which is what the corrected assertions say.

---

## 2. Defect L3 — the pixel diff never looked at the band under investigation

### 2.1 The old behaviour, at file:line

`src/responsive-qa/pixel-gate.ts:164-166`:

```ts
const width  = Math.min(source.width,  clone.width);
const height = Math.min(source.height, clone.height);
```

A plain top-left-anchored min-crop, with the comparison loop at `:188-267`
iterating only that region and no field anywhere in `PixelGateChannels` naming
what was removed. `classify.ts` raised a caveat only below
`commonAreaRatio < 0.75`, and the caveat was prose in a sorted list.

**The horizontal overflow band a frozen width produces is therefore exactly the
region that was silently deleted from the pixel evidence.** Real magnitudes,
read off run artifacts on disk:

| pair | source capture | clone capture | `commonAreaRatio` |
|---|---|---|---|
| `linear.app / @700` (28.7 pack) | 700 px | 862 px | — |
| `gs.severance.healthcare /gs/index.do @1100` (`2026-09-04T22-53-01-661Z`) | **1280 px** | 1100 px | **0.8594** |
| `gs.severance.healthcare /gs/news/news/notice.do @1100` | 1280 px | 1100 px | 0.8594 |
| `hobbang.net / @1024` (`2026-09-02T20-25-26-393Z`) | 1024 px | 1128 px | 0.9078 |
| `interiorbay.co.kr / @390` (`2026-09-02T23-32-44-435Z`) | **1525 px** | 390 px | **0.2259** — 77 % of the source's area never compared |
| `interiorbay.co.kr /kwa-38941-515 @390` | 1525 px | 390 px | **0.0181** |

### 2.2 The choice: option (A), cleanly

The instruction offered (A) compare on a common canvas with the excess band
reported explicitly as its own quantity, or (B) mark the pixel and position
channels NOT COMPARABLE — and forbade a compromise. **This is (A).**

Why (A) and not (B): two images of different sizes have no common canvas that
does not resize one of them, and resizing would delete the very finding a size
difference *is* (`screenshot-diff.ts`'s own rule, item 29/30). Marking the
channels not-comparable would also lose the reading over the region that IS
shared, which on severance @1100 is 86 % of the page. And a clean pixel number
can never produce a PASS by itself — §14 of the rubric is explicitly "pixels
(can only ADD a finding)" and the verdict is the maximum severity across
channels — so keeping them eligible carries no false-PASS risk. What was missing
was not eligibility; it was the band.

### 2.3 The new behaviour

`gatePixels` keeps the identical comparison over the identical crop — every
pre-existing number is bit-identical, and the clone's modal colour is derived in
a **separate** pass after the source's so palette slot assignment, and therefore
the modal tie-break, is unchanged — and adds:

```
comparedWidth / comparedHeight
sourceImageWidth / sourceImageHeight / cloneImageWidth / cloneImageHeight
widthMismatchPx / heightMismatchPx
source|cloneHorizontalBandPixels      x ∈ [comparedWidth,  imgW) × y ∈ [0, imgH)
source|cloneVerticalBandPixels        y ∈ [comparedHeight, imgH) × x ∈ [0, comparedWidth)
source|cloneHorizontalBandInkPixels   ← ink, vs that side's OWN modal colour
source|cloneVerticalBandInkPixels
horizontalBandInkRatio / verticalBandInkRatio     (over the compared area)
comparedAreaRatio
```

The two bands **partition** the uncompared area exactly, and the suite asserts
the conservation identity on every shape, including a both-axes, both-sides
mismatch:

```
2 × comparedPixels + Σ(four band pixel counts) == sourceArea + cloneArea
```

Three channels in `classify.ts` §14b:

| channel | fires | why |
|---|---|---|
| `pixel-uncompared-band-ink-ratio` | **MAJOR** at `PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO` | see below |
| `pixel-uncompared-vertical-band-ink-ratio` | never | a height difference is already a first-class finding on `scroll-height-ratio-high` / `-low`, and its uncompared strip is the bottom of a longer page, not a region any channel is investigating |
| `pixel-compared-area-ratio` | never | so a pixel number can never be read as a statement about the whole page without also seeing how much of the page it covers |

### 2.4 Why the threshold is derived and the severity is MAJOR

`PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO` **is defined as**
`PIXEL_RESIDUAL_MINOR_RATIO` (0.01) — in code, `export const
PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO = PIXEL_RESIDUAL_MINOR_RATIO;`, so the two
cannot drift apart, and the suite asserts the identity. The reasoning is one
line: *if the strip that was never compared carries at least as much ink as the
smallest pixel difference this rubric will report, then that strip could by
itself have carried a pixel finding, and a clean pixel reading over the
remainder is not evidence about the page.* It is the primary pixel band restated
over the region the crop removes — not a number chosen to make a pair behave.

Ink, not area, is the quantity, and that is what makes it honest in both
directions: a 162 px strip of plain page background reads **0** and fires
nothing, whatever its width. The suite has that negative control.

MAJOR rather than MINOR because this channel does not report a *difference* — it
reports that the instrument did not look. MINOR is the band for "a reader might
notice this", and grading a hole in the evidence as a small defect of the clone
misdescribes it. WP-C guard 4 already fixed the repo's rule for this case
("measurement failure is never green"); this is that rule applied to a partial
measurement.

### 2.5 The composite: the mismatch is now impossible to miss

`composite.ts:88-137` did label `source {W}×{H}` / `final {W}×{H}` — verified,
it was there, in the `.meta` line, at 12 px in `#9aa4b2` grey next to the scale
note. That is present, not obvious, and a composite whose two panels are
different widths is the single most misleading thing that file can produce,
because the eye reads two adjacent pictures as two views of the same thing.

When the widths differ the composite now carries, in addition to the grey line:

* a full-width **red banner** above the panels — `⚠ CAPTURE WIDTH MISMATCH —
  source 700px vs final 862px at a 700px viewport. THESE TWO PANELS ARE NOT THE
  SAME WIDTH.` with a subline naming the compared width, the strip width, the
  height mismatch when there is one, and the channel to read;
* the uncompared strip itself, **hatched in red** over the wider panel's image
  at the exact scaled offset, with a sticky label reading `162px NOT
  PIXEL-COMPARED`.

`renderComposite` was split into a pure `buildCompositeHtml` so the suite asserts
the banner text, the hatch class, both capture widths and the compared width **on
the HTML**, with a negative control proving neither appears when the widths
agree.

### 2.6 Where it fires — real corpus, not fixtures

**`pixel-uncompared-band-ink-ratio` fires on REAL CORPUS.** Measured on a fresh
canary run of `gs.severance.healthcare /gs/index.do` (§6), whose source capture
is 1,280 px against an 1,100 px clone — a 180 px strip, 14 % of the larger
capture, that no pixel channel has ever read. The pre-existing artifacts show
the same shape on six further pairs across three sites (table in §2.1), with
`interiorbay.co.kr / @390` dropping 77 % of the source's area.

### 2.7 Carried item — `src/reconstruction-qa/screenshot-diff.ts`

The gate's own docstring warned the pattern was repeated. **It is.**
`src/reconstruction-qa/screenshot-diff.ts:209-210`:

```ts
const overlapWidth  = Math.min(a.width,  b.width);
const overlapHeight = Math.min(a.height, b.height);
```

`compareImages` computes every one of its metrics — `changedPixelRatio`,
`changedRatioAt16`, `deltaE76Mean/Max`, `deltaE76AboveJndRatio`,
`deltaE76AboveVisibleRatio` — over that crop and reports `commonAreaRatio`
beside them, so the ratio is *stated* there but the band is still unmeasured.
`renderDiffImage` (`:300`) uses the same min-crop.

**That file is outside this lane's ownership and was NOT edited.** It is carried,
and the carry is enforced: the suite has a check that reads the file and asserts
the min-crop is still there, so the day someone fixes it this suite fails and
this section has to be updated rather than quietly rotting.

---

## 3. Defect B7 — the source capture did not normalize page state; the observer did

### 3.1 The old behaviour, at file:line

`normalizePageState` had **zero callers** under `src/responsive-qa/`.
`captureSide` (`capture.ts:330-402`) went `gotoQa → stabilize → pinMedia →
scrollThroughPage → probe → screenshot` and never touched page state, while
`observe-page.ts:1335` calls `markInitialPaintCensus` immediately after the
navigation and `:1100` calls `normalizePageState` before the scroll.

So the two instruments rendered the same URL into two different page states. On
seoultone `/` @390 the source screenshot shows the entry popup and the clone
correctly shows the real hero underneath, and the clone was charged
`missing-text-ratio` for content the engine had deliberately removed. The
diagnostic lane quantified it: of 393 missing characters (30.54 %) at 390, the
popup accounts for **37 characters over 4 strings** and real content loss for
**356 / 27.66 %** — and at 1440, where the popup stood on both sides, missing is
**356 characters**, the same number.

### 3.2 The new behaviour — the two-call contract, from the ONE shared implementation

`capture.ts` now imports from `../observer/index.js` and runs the contract
exactly as `docs/result/28.75/page-state-api-contract.md` specifies:

```
gotoQa(page, url)
markInitialPaintCensus(page)        ← CALL 1, before ANY settling
stabilize(page)                      (networkidle → fonts.ready → settle → 2 rAF)
normalizePageState(page, { … })     ← CALL 2, before the scroll and before any capture
pinMedia → scrollThroughPage → probe → screenshot
```

CALL 1 is before the settle because the initial-paint census is the only
time-based discriminator the normalizer has, and it powers the STRONG signal
`appeared-after-initial-paint`; after a networkidle wait the popup is already
painted and the census would record it as original page furniture. CALL 2 is
before the scroll for the observer's own reason: scrolling a page behind a modal
that locks the page scroller measures nothing.

`CAPTURE_POLICY` gains `pageStateNormalized: true` and a `pageStateNote`, and
the `waits` string now names both calls, so an artifact can never be read
without knowing which page STATE its numbers describe. Evidence is written under
`QA_PAGE_STATE_EVIDENCE_ROOT = "data/page-state-evidence/responsive-qa"` —
deliberately outside `docs/result/`, mirroring the observer lane's own fix.

### 3.3 Both sides, and why — the clone side is a CHECK

`captureSide` is invoked for both sides from `run.ts:1107-1117`, and
normalization runs on both. The justification, stated as the instruction asks:

* **The SOURCE side is the fix.** It is the side that was rendering a page state
  the observer had already dismissed, and it is the side whose extra copy the
  clone was billed for.
* **The CLONE side is a check as much as a fix.** A reconstruction built from a
  normalized observation should have no entry overlay left to dismiss, so
  `page-state-clone-overlays-dismissed` is expected to read **0**; a non-zero
  reading says the engine reproduced an entry popup, and that is a fact about
  the engine worth carrying in the artifact rather than discovering by eye.
* **Symmetry is this module's founding rule.** `captureSide` exists so that both
  sides are measured by literally the same code. Normalizing one side only would
  replace the asymmetry this defect *is* with a different one, and would make
  the clone's state unobservable.

### 3.4 Recorded per pair, and the NOT-COMPARABLE declaration

`SideProvenance.pageState` (new `PageStateRecord`) carries, per side: `ran`,
`initialPaintCensusAvailable` / `…Status` / `…Elements` / `…CapHit`,
`qualified`, `dismissed`, `qualifiedNotDismissed`, `attemptCapHit`, every
`attempts[]` entry (dom path, shape class, method, outcome, signals, close-control
label) and `limitations[]`. Three recorded channels put the same facts in
`channels[]`: `page-state-source-overlays-dismissed`,
`page-state-clone-overlays-dismissed`, `page-state-comparable`.

The declaration itself:

```
sourceOverlayStanding  ⇔  source.pageState.ran
                          AND (qualifiedNotDismissed > 0 OR attemptCapHit)

when it holds:  missing-text-ratio  and  visible-text-ratio  are held INELIGIBLE
                with an ineligibleReason naming the count and the contract doc,
                the same reason is added to caveats,
                page-state-comparable records 0,
                and both channels keep their MEASURED value in channels[].
```

Those two channels and no others, because those are the two an overlay standing
on one side directly corrupts: an overlay ADDS characters to the source's census,
which inflates `missing-text-ratio`'s numerator and deflates
`visible-text-ratio`. The guard is **one-directional** — a *clone* overlay
standing does not gate anything, because the guard exists to stop the clone
being charged for the source's page state, not to protect the clone from its own.
An absent record grades exactly as before: absent is never read as "found
nothing".

### 3.5 Where it fires — real browser, not a fixture-only claim

`scripts/smoke-responsive-qa.ts` §B7b runs **real Chromium** against a served
page reproducing the shape the diagnostic lane measured on the live seoultone
homepage (centered, lifted, inset panel, appearing 300 ms after first paint,
`aria-label="닫기"`), and asserts the whole chain:

| | measured |
|---|---|
| normalization OFF (the pre-28.75 harness) | the popup's copy IS in `visibleTextEntries`; `pageState.ran === false` |
| normalization ON (the shipped path) | `dismissed 1`, `qualifiedNotDismissed 0`, census `available`, popup copy GONE, page copy still present, the attempt recorded as `close-control` / `dismissed` |
| **the observer's own API on the same page** | `dismissed 1`, popup gone, page copy present — and the two agree **number for number** on `dismissed`, `qualified` and `initialPaintCensusStatus` |
| the attribution, end to end | an un-normalized source charges the clone `missingChars > 0`; a normalized source charges it **0.0000** |

That last row is the defect and its cure in two numbers on one page.

**Stated plainly:** the mechanism is proved in a real browser against a real
page-state, and the *cross-site* effect on the four canary sites is measured in
§6. `seoultone.kr`, the site the defect was found on, is **SOURCE_UNAVAILABLE**
(§7) and its acceptance row is NOT MEASURED.

---

## 4. Defect M6 — reviewed, and deliberately LEFT ALONE

Both channels were checked against the principled comparison the instruction
asks for. The comparison exists, it already runs, and **it contradicts the
false-alarm hypothesis on both channels.** Neither threshold was moved.

### 4.1 `offscreen-text-excess-chars` — the source's own bleed is ALREADY subtracted

The auditor's premise is "on a product mock the source itself bleeds past the
right edge; both images are clipped at the same place". The channel is already
relative — `classify.ts:455`:

```ts
const offscreenExcess = clone.offscreenTextChars - source.offscreenTextChars;
```

On the cited pair, linear `/` @390, the reading is `value 200, sourceValue 427`:
the source parks 427 characters past the right edge, the clone parks 627, and
the source's 427 are subtracted before the band is applied. The premise is
handled by construction, and the suite now pins that: a source and clone that
each park 5,000 characters off-screen raise **nothing**, and a source that parks
more than the clone can never fire it.

The self-check floor settles the rest. Three independent source-vs-source runs
(`2026-09-02T23-18-26-778Z`, `2026-09-04T15-52-40-937Z`,
`2026-09-04T17-25-07-320Z`, all `mode: self-check`) read **excess 0** on `/`
@390 against the same 427-character source population. So the instrument is
stable on that pair and the 200 is a measured clone-minus-source delta, not the
source's own bleed being charged.

What is left is a judgement about whether 80 characters is the right BLOCKER
threshold on a page whose source already parks 427 — and moving it is precisely
the move the instruction forbids and an adjudicator will look for.

**The principled alternative, named and carried forward rather than guessed at.**
A difference of two totals cannot distinguish "the same strings, more of them"
from "627 different characters went off-screen". The correct measurement of the
channel's own claim is a per-key excess over the source's off-screen census:
`Σ_key max(0, cloneOffscreenChars[key] − sourceOffscreenChars[key])`. It is not
shipped here, and the reason is evidence, not effort: on the same corpus it
would **fire where the current channel is silent** — `/ @700` reads −1206 today
because the source parks 1,419 characters off-screen while the clone parks 213,
and a per-key reading would charge those 213 if they are strings the source keeps
on screen — and the clone ships **both viewport subtrees**, an unmeasured source
of clone-only visible strings. A re-basing that can add BLOCKERs to four
already-graded sites must be measured on those sites before it lands, and the
rubric-ordering rule puts that measurement after this lane. It is a carried item
with the experiment specified (§8).

### 4.2 `position-delta-p90-px` — the floor says the 63 px is real

The suggested comparison is "the source's own behaviour", and for a
cross-side positional delta the source's own behaviour has an exact name in this
harness already: the **self-check floor**, which runs this same rubric on the
SOURCE against a second capture of ITSELF (item G4, `--self-check`).

On the cited pair, linear `/` @1440:

| run | mode | `position-delta-p90-px` |
|---|---|---|
| `2026-09-02T23-18-26-778Z` | self-check | **0** |
| `2026-09-04T15-52-40-937Z` | self-check | **0** |
| `2026-09-04T17-25-07-320Z` | self-check | **0** |
| `2026-09-04T17-25-07-319Z` | clone | **63** |

Source against source is **0 px**, three times independently. The hypothesis
that the 63 px is the source doing the same thing is contradicted by the
instrument's own control. Raising 48 → 64 would delete a finding the floor says
is real, and would be the textbook version of "loosened to produce a nicer
number".

### 4.3 What shipped instead: the decisions are frozen

Neither threshold moved, and both are now pinned by permanent checks
(`§M6`) that fail if a later change moves them silently:

```
DISTRIBUTION_MAJOR_P90_PX            === 48
OFFSCREEN_TEXT_BLOCKER_EXCESS_CHARS  === 80
```

with the floor evidence quoted in the check names and the comment above them, so
the next person to reach for either number has to argue against the floor.

---

## 5. Rubric version — 5 → 6, and what it means for floors

`types.ts` `RUBRIC_VERSION` **5 → 6**, with the delta written into the
version-history block. New roster entries:

| channel | fires? |
|---|---|
| `overlap-demoted-excess-ratio` | **yes** — BLOCKER 0.10 / MAJOR 0.02 / MINOR 0.001 |
| `pixel-uncompared-band-ink-ratio` | **yes** — MAJOR at 0.01 |
| `pixel-uncompared-vertical-band-ink-ratio` | recorded |
| `pixel-compared-area-ratio` | recorded |
| `page-state-source-overlays-dismissed` | recorded |
| `page-state-clone-overlays-dismissed` | recorded |
| `page-state-comparable` | recorded |

Two existing channels are re-based, in **opposite** directions:

* **L1 can only ADD findings.** A collision a broken asset used to demote now
  reaches `overlap-excess-ratio`, and the area still demoted is graded. A
  rubric-6 verdict can be WORSE than the rubric-5 verdict of the same clone and,
  on this channel, never better.
* **B7 can only REMOVE findings**, and only on pairs whose two sides are in
  different page states — the case where the finding was measuring the harness
  rather than the clone.

**Floor comparability: a rubric-6 verdict may be worse, better or unchanged
against the rubric-5 verdict of the same pair on the same clone, so rubric-5 and
rubric-6 verdicts must not be compared, summed, or used as each other's floor.**
`floorFrom` already refuses a floor whose `rubricVersion` differs; this bump is
what makes it refuse. **Every self-check floor must be re-measured under rubric 6
before any rubric-6 verdict is read against it** — which is why this lane ran
before the closure canary reruns, as the ordering rule requires.

---

## 6. Effect on the canary runs

Two fresh clone-mode runs under rubric 6, on the two reachable canary sites that
carry a width mismatch. `hobbang.net` was not re-run in this lane and
`seoultone.kr` is unreachable (§7).

| site | run id | reconstruction | routes × widths |
|---|---|---|---|
| `gs.severance.healthcare` | `2026-09-04T23-40-51-897Z` | `2026-09-04T18-14-47-300Z` | `/gs/index.do` @1100, @1440 |
| `linear.app` | `2026-09-04T23-44-43-588Z` | `2026-09-04T17-24-33-839Z` | `/` @700, @1440 |

Both artifacts carry `rubricVersion: 6` and `coverage.conserved: true`.

### 6.1 L3 — it fires on real corpus, with its own negative control in the same run

| pair | source capture | clone capture | band | band pixels | band INK | `pixel-uncompared-band-ink-ratio` | `comparedAreaRatio` |
|---|---|---|---|---|---|---|---|
| `linear.app / @700` | **700**×9587 | **862**×9960 | 162 px on the CLONE | 1,613,520 | **1,613,196 (99.98 %)** | **0.240384 → MAJOR** | **0.7817** |
| `gs.severance.healthcare /gs/index.do @1100` | **1280**×2700 | **1100**×2700 | 180 px on the SOURCE | 486,000 | **339,321 (69.8 %)** | **0.114249 → MAJOR** | **0.8594** |
| `linear.app / @1440` | 1440×9960 | 1440×9960 | — | 0 | 0 | 0 — silent | 1 |
| `gs.severance.healthcare /gs/index.do @1440` | 1440×2700 | 1440×2700 | — | 0 | 0 | 0 — silent | 1 |

**On `linear.app / @700` — the exact pair the defect brief cited — the 162 px
strip that no pixel channel has ever read is 99.98 % ink, and 22 % of the larger
capture was never compared.** On severance @1100 the 180 px strip is 70 % ink.
Both fire MAJOR; both equal-width pairs in the same two runs read exactly 0 and
stay silent. The composite for the severance pair carries the red banner
(`⚠ CAPTURE WIDTH MISMATCH — source 1280px vs final 1100px at a 1100px
viewport`) and the hatched `180px NOT PIXEL-COMPARED` strip on the SOURCE panel,
verified by eye on
`images/01-gs-severance-healthcare-gs-index-do-1100-composite.png`.

### 6.2 L1 — reads zero on real corpus, exactly as predicted

`overlap-demoted-excess-ratio` reads **0** on all four pairs;
`coverage.overlapDemotionsRegraded` is **0** in both runs; both demotion pair
counts are 0 on both sides of every pair. The reorder in `classifyOverlapPair`
therefore changed no number on either run — `overlap-excess-ratio` still fires
BLOCKER on both severance pairs (0.4484 @1100, 0.3425 @1440) from the same
`true-overlap` population it read under rubric 5. **Fixture only, and said so.**

### 6.3 B7 — the mechanism ran on every side; the not-comparable branch did not

| pair | source `pageState` | clone `pageState` |
|---|---|---|
| severance @1100 / @1440 | `ran`, census **available** (1,731 elements), 0 qualified, 0 dismissed | `ran`, census available (3,376), 0 / 0 |
| linear `/` @700 | `ran`, census **available** (4,868 elements), 0 / 0 | `ran`, census available, 0 / 0 |
| linear `/` @1440 | `ran`, census **available** (4,861 elements), 0 / 0 | `ran`, census available, 0 / 0 |

The two-call contract executed on **every side of every pair**, and the
initial-paint census was `available` every time — so `appeared-after-initial-paint`
was live evidence, not a silently lost signal. Neither site serves an entry
overlay, so 0 qualified / 0 dismissed is the correct reading and
`page-state-comparable` is 1 throughout; `missing-text-ratio` fires on its own
merits (0.1071 BLOCKER on linear `/` @700, 0.0062 MINOR @1440) with nothing held.

**The NOT-COMPARABLE branch did not fire on real corpus**, because no reachable
canary site currently serves an undismissable entry overlay — the site that does
is `seoultone.kr` (§7). The branch is proved on fixtures, and the *normalization
itself* is proved in a real browser against a served reproduction of the live
seoultone popup (§3.5).

### 6.4 M6, re-measured today rather than quoted

`linear.app / @1440`, rubric 6: `position-delta-p90-px` = **63**, fired MAJOR —
the auditor's exact reading, reproduced, against a self-check floor of **0 px**
on the same pair in three separate runs. `offscreen-text-excess-chars` at the
same width reads **−71** against a source that parks 99 characters off-screen
and does not fire, which is the relativity working. Both thresholds unchanged.

---

## 7. seoultone.kr — SOURCE_UNAVAILABLE, with the evidence

`seoultone.kr` is serving a Cafe24 over-traffic stub and was NOT re-measured for
this report. Evidence, taken during this lane:

```
$ curl -s -o /dev/null -w "%{http_code}" https://seoultone.kr/      → 000  (TLS handshake fails outright)
$ curl -s -o /dev/null -w "%{http_code} %{size_download}" http://seoultone.kr/
                                                                    → 200  406 bytes  (a redirect stub)
```

Against 200 / 200 / 200 for `gs.severance.healthcare`, `linear.app` and
`hobbang.net` at the same moment. **No seoultone acceptance is claimed and no
seoultone number in this report is presented as measured.** The 2026-09-04
artifacts (`data/seoultone.kr/responsive-qa/2026-09-04T18-18-47-244Z/`, and the
captured `rendered.html` under
`data/seoultone.kr/site-observations/2026-09-04T18-13-50-161Z/pages/p000001/viewports/desktop/`,
which carries the `#popup_slider` / `popup_overlay` / `popup_close` markup) were
used only as the offline substrate for the B7 fixture's shape, and the demotion
census in §1.5.

**Carry-forward:** re-run seoultone `/` @390 and @1440 when the origin is back,
and confirm that `page-state-source-overlays-dismissed` reads 1 at both widths
and that `missing-text-ratio` @390 falls from 0.3054 towards the @1440 reading of
0.2766 — the diagnostic lane's own prediction, and the cleanest single test of
B7 on real data.

---

## 8. Tests

All in `scripts/smoke-responsive-qa.ts`. **271 → 349 checks (+78), all passing.** The +78 is 20 + 21 + 6 + 11 + 11 + 5 in the six new sections, plus 4 roster entries in section F.

| section | what it pins |
|---|---|
| **L1** (20 checks) | the collapse survives a broken participant, in both argument orders and with the flag flipped; the sweep keeps its area in the true total and still counts the broken leaf; it reaches BLOCKER through the classifier while `image-layer-state` also fires; the crossfade twin is still demoted, and still demoted when one layer fails; the demotion still needs BOTH conditions; the MUTATION moving PASS → BLOCKER on the demoted area; the ledger fields; two negative controls; the bands are the overlap channel's own; the coverage counter |
| **L3** (21 checks) | equal captures have no band; both capture widths are carried; band pixels and band INK counted; the CONSERVATION identity, on one axis and on both; a background-only band reads 0 ink; the vertical band measured and never fired; MAJOR through the classifier with both widths in the summary; three negative controls; the threshold IS `PIXEL_RESIDUAL_MINOR_RATIO`; the composite banner, the hatched strip, both widths, and a no-banner control; the CARRIED min-crop in `screenshot-diff.ts` |
| **B7a** (6 checks) | the capture imports the observer's own implementation; CALL 1 after `goto` and before the settle; CALL 2 after the settle and before scroll/probe/screenshot; exactly one `captureSide`; the policy records it; evidence root outside `docs/result/` |
| **B7b** (11 checks, real Chromium) | the defect reproduced with normalization off; the fix with it on; the census available; popup copy gone and page copy kept; the attempt recorded; **the observer's own API reaching the same state, number for number**; the attribution, `missingChars > 0` → `0` |
| **B7c** (11 checks) | the negative control grades normally; a standing source overlay holds both text channels ineligible with their measured values and a stated reason; the caveat; `page-state-comparable`; the attempt-cap case; the guard is one-directional; a legacy pair with no record is unchanged; the clone channel; the absent-census caveat |
| **M6** (5 checks) | the offscreen channel is relative in both directions; the cited reading reconstructed; both thresholds FROZEN |
| **F** (4 checks) | the roster carries all four new channel ids, and `RUBRIC_VERSION === 6` |

### 8.1 Pre-fix failure counts — established honestly

Each mechanism was reverted **in place**, the suite re-run, the failures counted,
the files restored from a hash-verified backup, and the restoration checked with
`shasum -a 256 -c` (14 files, all OK, after every one of the three reverts).

| mechanism reverted | how | result | **FAILED** |
|---|---|---|---|
| **L1** | the load-flag test put back in front of the geometry test in `classifyOverlapPair`; `overlap-demoted-excess-ratio`'s bands emptied | 337/349 | **12** |
| **L3** | the four band measurements forced to zero and `comparedAreaRatio` to 1 in `gatePixels`; `pixel-uncompared-band-ink-ratio`'s bands emptied; the composite banner and hatch markup renamed away | 337/349 | **12** |
| **B7** | `normalizeEnabled` forced false in `captureSide`; `pageStateComparable` forced true and the reason to `undefined` in `classify.ts` | 338/349 | **11** |
| restored | — | **349/349** | **0** |

The failing checks are listed by name in
`tmp/wr2875/qa-honesty/prefix/{L1,L3,B7}-failures.txt`, and the baseline hashes
in `tmp/wr2875/qa-honesty/prefix/baseline.sha256`.

Note on the B7 count: the six B7a source-text checks kept PASSING under the
revert, because that revert disables the calls rather than deleting them. That
is stated rather than papered over — B7a pins the code SHAPE and B7b/B7c pin the
BEHAVIOUR, and it is the eleven behavioural checks that go red.

---

## 9. Files changed

| file | change |
|---|---|
| `src/responsive-qa/overlap.ts` | `classifyOverlapPair` reordered: geometry and ownership before the load flag |
| `src/responsive-qa/classify.ts` | §0b page-state gate + 3 channels; §5b `overlap-demoted-excess-ratio` (fires); §14b `pixel-uncompared-band-ink-ratio` (fires) + 2 recorded; `ClassifyInput.source/clonePageState`; two demotion ledger fields |
| `src/responsive-qa/pixel-gate.ts` | clone modal colour (separate pass, so no existing number moves) + 19 excess-band fields |
| `src/responsive-qa/composite.ts` | `buildCompositeHtml` split out; width-mismatch banner; hatched uncompared strip; `compositeWidthMismatch`, `COMPOSITE_WIDTH_MISMATCH_MARKER`, `COMPOSITE_UNCOMPARED_BAND_CLASS` |
| `src/responsive-qa/capture.ts` | the two-call page-state contract on BOTH sides, from `../observer/index.js`; `PageStateRecord` in the provenance; 4 new `CaptureSideInput` fields |
| `src/responsive-qa/types.ts` | `RUBRIC_VERSION` 5→6 with the delta; `PageStateRecord`; `SideProvenance.pageState`; `CapturePolicy.pageStateNormalized/Note`; `QA_PAGE_STATE_EVIDENCE_ROOT`; `PIXEL_UNCOMPARED_BAND_INK_MAJOR_RATIO`; 19 `PixelGateChannels` fields; 2 `ClassificationDemotions` fields; `coverage.overlapDemotionsRegraded` |
| `src/responsive-qa/run.ts` | `side`/`pageId` passed to both captures; both page-state records forwarded to the classifier; the coverage counter and its limitation string |
| `src/responsive-qa/index.ts` | re-exports the composite's mismatch surface |
| `scripts/smoke-responsive-qa.ts` | sections L1 / L3 / B7a / B7b / B7c / M6 (+78 checks); two inverted assertions corrected (§1.7); roster and `RUBRIC_VERSION` updated |

**Not touched, by ownership:** `src/observer/**`, `src/reconstruction/**`,
`src/reconstruction-qa/**` (including the carried `screenshot-diff.ts`),
`src/responsive-qa/{probe,blank-region,correspondence,routes,store}.ts`.
Nothing under `docs/result/` for waves ≤ 28.7 was modified. **No git mutations of
any kind were performed.**

---

## 10. Remaining risk

1. **L1's demotion populations are still empty on real corpus.** The reorder and
   the new channel are correct and mutation-proved, and they have never fired on
   a measured page. The first site with a `<picture>`/crossfade or a broken asset
   in a collision is the first real test of either.
2. **`pixel-uncompared-band-ink-ratio` will add MAJOR findings to already-graded
   pairs.** That is the point — it is reporting an omission that was always
   there — but it means rubric-6 blocker/major counts on width-mismatched pairs
   are not comparable to rubric-5 ones. §5 says so; the floors must be re-measured.
3. **B7 adds two page loads' worth of work per pair** (the census evaluate and
   the normalization scan window). `normalizePageState` is bounded and never
   throws, and a failure degrades to "changed nothing, and here is why", but the
   sweep is slower.
4. **B7's guard can only see overlays the normalizer recognises.** An entry
   overlay that never qualifies is invisible to both the normalizer and the
   guard, and the pair is graded as comparable. The observer lane owns that
   predicate; this lane consumes it.
5. **The carried min-crop in `src/reconstruction-qa/screenshot-diff.ts`** — every
   `reconstruction-qa` pixel metric still drops its band silently. Recorded, not
   edited, and enforced by a check.
6. **M6's per-key offscreen re-basing is unmeasured** and could change verdicts
   on four sites in the stricter direction. Carried with the experiment specified.
7. **seoultone.kr is unmeasured** (§7).
