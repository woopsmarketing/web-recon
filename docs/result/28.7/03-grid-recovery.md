# Task 28.7 — 03 Grid Track Recovery (Program C)

**Owner:** one agent, sole writer of `src/reconstruction/**`.
**Independent verification by the orchestrator:** counters read directly from the two new
reconstruction manifests; hack grep clean; `smoke-layout-safety` 222/222 → **260/260**;
`smoke-reconstruction` 227/227; `pnpm typecheck` exit 0.

---

## PREVIOUS FACT

`recoverGridTracks` refused any container whose children did not tile its tracks *rectangularly*.
Two refusal reasons carried the addressable population on the linear.app corpus:
`child-count-not-multiple-of-tracks` **34** and `children-do-not-tile-tracks` **14** — 48 of 407
refusals. The rest are honest: `container-width-constant` 207 (the container's own width never
changes across probe widths, so there is no evidence of fluidity to recover), `no-computed-tracks`
124, `no-probe` 21, `tracks-not-px` 6.

Two structural causes: a `display:none` child was counted as a grid item, and a child spanning k
tracks matched zero tracks under an exactly-one-track rule. The whole tiling check rested on
`rows = children.length / trackCount` — an assumption, not a measurement.

## IMPLEMENTED CHANGE

Participation is now decided from the child's **own computed `display`**, which was already in the
exact tier and had never been read (`gridChildRole()`, `layout-inference.ts:1553`):

| child state | treatment |
|---|---|
| `display: none` | removed from the grid entirely |
| `display: contents` | refuse the container (its box is not the item's box) |
| `position: absolute\|fixed` | **witness-only** — sizes no track, but a wrong track list still moves it, so it must stay under the gate |
| `visibility: hidden\|collapse` | **still occupies its cell** (`occupiesAt()` `:1832`) despite `probe.v === 0` |
| otherwise | sizing child |

A sizing child matches exactly one `(start, span)` where its left edge sits on a track offset and its
width equals that run **plus the (k−1) gaps the run absorbs** (`runWidth()` `:1823`, per-width
validation `:1877`). Every track must be measured by at least one child that occupies it *alone*;
spanning children only validate. `rows = children.length / trackCount` is deleted, replaced by
`spanOneByColumn` requiring ≥1 single-column witness per track (`:1869`), which keeps
`not-every-track-witnessed` meaningful.

### How each mandated trap was avoided

| trap | how it was handled |
|---|---|
| resurrecting the `containingBlockGuard` relaxation (measured net-negative in 28.6) | `containingBlockGuard` untouched; the diff adds no call to it and assumes no percentage base anywhere |
| `fr` is a share of FREE SPACE — a span must shed `(k−1)×gap` | `runWidth()` `:1823` + the identical term at `:1877`; a permanent test refuses a child as wide as two tracks *without* the gap |
| `probe.v` conflates `display:none` with `visibility:hidden` | the child's own computed `display` decides; `visibility:hidden` occupies |
| an empty `witnesses` array silently disarms the gate | witnesses = every child that still moves, incl. `visibility:hidden` and spanning; `witnesses.length === 0` refuses; asserted permanently |
| `FULL_WIDTH_TOLERANCE_PX` does double duty | untouched; a separate `GRID_SPAN_TOLERANCE_PX` introduced |
| `grid-column` serializes `auto / auto` for auto-placed items | geometry decides; `declaredColumnSpan()` returns `undefined` for auto/negative; a *contradiction* refuses (`span-contradicts-grid-column`) |
| `parsePx(undefined) === 0` silent-zero | the three padding/border paths untouched |
| absent `viewportId` reads as desktop in three places | every new record carries `viewportId` explicitly; refusal map keys are `${viewportId}\|${nodeId}` |

## MEASURED RESULT

| counter | linear.app | hobbang.net |
|---|---|---|
| `gridTrackColumns` emitted | 76 → **80** | 74 → **77** |
| `gridTrackRefusals` | 407 → **403** | 84 → **81** |
| `candidateRules` | 1,729 → 1,733 | 2,033 → 2,036 |
| shipped `recoveredRules` | 1,727 → **1,731** | 2,033 → **2,036** |
| `rejectedByTruthCheck` | 2 → 2 | 0 → 0 |
| `acceptedRegressed` | 0 → 0 | 0 → 0 |

**Newly emitted rules surviving the truth check: 4/4 (linear), 3/3 (hobbang).** Candidates and shipped
rose by the same amount while both rejection counters stayed flat — the fix converts refusals into
normally-gated candidates and refuses nothing that shipped before, exactly as specified.

Refusal reasons, linear.app: `child-count-not-multiple-of-tracks` **34 → 0 (retired)**,
`children-do-not-tile-tracks` 14 → 12, and three new, more specific reasons appear —
`hidden-child-participates-at-another-width` **13**, `not-every-track-witnessed` **16**,
`child-probe-missing` **2**. hobbang.net: `child-count-not-multiple-of-tracks` **4 → 0**. The blunt
rectangularity refusal is gone; what replaces it names the actual missing evidence.

### Acceptance canary, met generically

`linear.app p000004/desktop n000090 <div>` (and sibling `n000172`, both viewports): 7 children over 2
columns — previously refused outright. Frozen `222px 222px` with a `28px` gap → recovered
`minmax(0, 1fr) minmax(0, 1fr)`. The rule's own recorded evidence reads
`928px: content 424 = 198 + 198 + 1×28 gap … 1440px: content 472 = 222 + 222 + 1×28 gap`.
**At 928px the frozen list forced 472px into a 424px content box — a 48px overflow that no longer
ships.** Also `p000001 n000536 <a>` / `p000003 n000291 <a>`: one visible child + one `display:none`
child, frozen `1344px` → `minmax(0, 1fr)`.

No hostname, selector, node id, `224px` or `6` appears in any new code.

### The named Linear `/pricing` footer still refuses — and the diagnosis changed

The 6×224px footer from the brief still refuses. The new per-node refusal log makes the reason
visible for the first time: a child measures a constant 20×20px box inside the first 224px track —
a grid item that does not fill its column. That is **not** a hidden-child or span case, so it is
correctly outside B2's population. Measured frozen excess: **411px at width 1025** on four pages
(`n002947`, `n003541`, `n001467`, `n000332`). Before this wave that node was one of 407 anonymous
refusals; it can now be named, measured and ranked.

## NEW TESTS (38 added; suite 222 → 260)

Part 11c (B2, 20 checks): `display:none` child over a non-multiple child count recovers `1fr 1fr 1fr`
and the removed child is not a witness; a `display:none` child that is visible at another width
refuses `hidden-child-participates-at-another-width`; a span-k child recovers with **asserted 2:1 fr
weights**; a child as wide as two tracks *without* the gap is refused (the gap arithmetic);
`grid-column` contradiction refuses while `auto / auto` is ignored; NEGATIVE — a `visibility:hidden`
child is not skipped and stays a witness; NEGATIVE — the same child at `display:none` refuses
`not-every-track-witnessed`; NEGATIVE — a column measured only by spanning children refuses;
NEGATIVE — a child matching no track and no run refuses `children-do-not-tile-tracks`; the gate-armed
invariant (every emitted grid rule carries ≥1 witness); a refusal names its node, viewport and
measured frozen excess.

**Pre-fix proof, empirical.** The implementation was temporarily reverted in place (`gridChildRole`
forced to `"sizing"`, the `% trackCount` gate restored, `occupiesAt` reduced to `v === 1`, span loop
clamped to `span <= 1`), the suite re-run, and the source restored and verified by
`shasum -a 256 -c`: **14 of the new checks FAIL (246/260)**, with the two retired refusal reasons in
the failure details. Three checks are additionally labelled `PRE-FIX REPRODUCTION` and assert the old
predicate directly against the fixture, so the fixtures cannot drift into cases the old code would
have accepted.

## REJECTED IDEAS

- **Deriving track sizes from a spanning child alone.** Every partition of a span's sum reproduces
  that sum, and the truth check *cannot* catch a wrong split because the spanning child is the only
  witness for that run and is correct under either split. A column with no single-column witness is
  refused instead.
- **Relaxing `containingBlockGuard`** — not touched (28.6 measured it net-negative).
- **Loosening `FULL_WIDTH_TOLERANCE_PX`** — a separate constant was added instead, so span matching
  cannot silently loosen column matching.

## REMAINING LIMITATIONS

1. **B2 does not move the dominant family.** The residual audit (report 02) measures grid tracks at
   **5.7% of linear's residual and 0.3% of hobbang's**. B2 is correct and shipped 7 more verified
   rules across two sites, but it is not where the remaining defect mass is.
2. Gap is still read once at the truth width and assumed constant across widths; a source authoring
   `column-gap: 2vw` or a gap under a media query surfaces as a refusal, never as a wrong number.
3. Row tracks, implicit columns and `row-gap` remain outside the model.

---

## CORRECTION (appended 2026-09-05, after the independent adjudication)

**The +4 `gridTrackColumns` gain reported above is not present in the reconstruction that was actually
graded, and this report did not say so.** Full series, measured from every linear.app
`reconstruction-manifest.json` of this wave:

| reconstruction | `gridTrackColumns` | `child-count-not-multiple-of-tracks` refusals |
|---|---:|---:|
| `2026-09-03T11-43-40-893Z` (pre-wave baseline) | **76** | **34** |
| `2026-09-04T13-53-27-092Z` … `15-51-59-065Z` (the B2 runs this report measured) | **80** | **0** |
| `2026-09-04T16-18-35-699Z` (Program E gate run) | 84 | 0 |
| **`2026-09-04T17-24-33-839Z` (the FINAL GRADED run)** | **75** | **0** |

**What survives and what does not.**

- **The refusal-class elimination survives.** `child-count-not-multiple-of-tracks` is 34 at the baseline
  and **0 in every post-B2 run including the graded one**. That is the change this work package made and
  it holds.
- **The +4 rule count does not.** The graded run emits 75, one *below* the 76 baseline. Reporting
  "76 → 80" without re-measuring on the graded artifact was wrong.

**Why the number moved, and what may not be concluded from it.** The graded run was built from a
different observation (`2026-09-04T17-21-07-726Z`) *and* after the per-route tree switch landed, which
changes the pageId/viewport buckets, the band edges and therefore which nodes are candidates at all. The
75-vs-76 difference is **not** a controlled A/B and is **not** evidence that B2 regressed — but neither
is 80 evidence that it gained, on the run that produced the verdicts. The only defensible claim from
these artifacts is the refusal-class one.

Whatever the count, §8 of the master report is the scale check that matters: `grid-template-columns` is
5.7% of linear's residual and 0.3% of hobbang's, while `width` is 91.3% and 99.1%.
