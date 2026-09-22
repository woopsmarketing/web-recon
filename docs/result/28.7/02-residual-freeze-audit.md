# Task 28.7 — Item B1 (node-scoped residual freeze audit) and Item B2 (span-aware grid track recovery)

Owner scope: `src/reconstruction/**`, `scripts/smoke-layout-safety.ts`.
Machine-readable companion: `docs/result/handoffs/28.7-residual-freeze.json`.

---

## 1. PREVIOUS FACT — what was already true before this work package

* Desktop deep observation happens at **1440** (`src/observer/types.ts:112-119`). Every value
  in the exact-computed tier is a **used value serialized at that width**:
  `grid-template-columns` arrives as `224px 224px 224px 224px 224px 224px`, `width` as
  `1440px`, and so on.
* `layout-inference.ts` re-derives responsive meaning from the multi-width probe; every
  emitted rule is then re-rendered and gated by `layout-truth-check.ts`. A rule that cannot
  be verified is REJECTED, never shipped.
* Every refusal in `layout-inference.ts` is documented as free: *"a refused node simply keeps
  its exact computed style, which is the module's existing failure mode."*
* `recoverGridTracks()` refused a container whenever `children.length % trackCount !== 0`
  (`child-count-not-multiple-of-tracks`) or whenever any child's box failed to match exactly
  one single track (`children-do-not-tile-tracks`), and it decided child participation from
  the probe's `v` flag alone.
* Refusals were counted only in aggregate: one real manifest reads `gridTrackRefusals: 209`
  with no way to name a single container.

## 2. NEW EXPERIMENT — what was measured, and how

### B1 — the residual freeze audit

The claim under test: **a refusal is not neutral.** Declining to emit a responsive rule IS a
decision to ship a 1440-resolved pixel at every other width, and nothing had ever rendered
the clone at a width that is not 1440 to see what those pixels do.

Mechanism, in one sentence per stage:

1. `inferLayoutRules()` now emits, per page × viewport, the **source half** of the evidence
   (`ResidualAuditPass`): the probe widths the variant is displayed at, and for each node whose
   own observed geometry MOVES across those widths, its `x`/`w`/`v` arrays, its parent's
   widths, its descendant count, the frozen property family it is attributed to, and the
   stage + reason that declined to give it a rule.
2. `verifyLayoutRules()` renders the **clone half**. The truth-width sample is taken in the
   render that is already open (one `evaluate`, no page load). The other widths reuse the
   multi-width loop the band check already runs, with the width sets **unioned** — a width the
   band check was going to render anyway costs the audit nothing.
3. A node is a **residual** when the source moved by ≥ 8px and the clone moved by ≤ 2px across
   the same widths. Both halves are measurements; neither is asserted.
4. Each residual is tagged `offscreen` (the frozen box's right edge leaves a viewport the
   source's stayed inside), `clipping` (it overflows its own parent where the source's did
   not), or `neither`, ranked in that order then by pixel delta then by descendants, and cut
   to the top 24 per route with a never-silent `residualFrozenOmitted`.

Corpus: two sites reconstructed offline from existing site-specs, no network.

| site | run id | before-run id |
| --- | --- | --- |
| linear.app | `2026-09-04T13-56-34-051Z` | `2026-09-03T11-43-40-893Z` |
| hobbang.net | `2026-09-04T13-57-09-329Z` | `2026-09-03T11-42-38-138Z` |

### B2 — span-aware and hidden-child-aware grid track recovery

Two pre-existing tests were wrong about grids, and both were assumptions rather than
measurements:

* `rows = children.length / trackCount` assumed a perfect rectangle. A grid with one
  `display: none` child, or one child spanning a run of columns, is an ordinary grid that this
  arithmetic called ragged.
* `probe.v` was used as "does this child participate". The observer's `v` is
  `display !== none AND visibility !== hidden AND the box has area` (`layout-probe.ts:425-434`),
  so it conflates **removed from the grid** with **still occupying its cell**.

Participation is now decided from the child's own computed style (already in the exact tier,
never read before), and a child may cover a consecutive RUN of k tracks plus the (k−1) gaps
the run absorbs.

## 3. IMPLEMENTED CHANGE

| file | change |
| --- | --- |
| `src/reconstruction/layout-inference.ts` | B2 rewrite of `recoverGridTracks()`; `gridChildRole()`, `declaredColumnSpan()`, `gridFrozenExcessPx()`, `frozenFamilyOf()`; B1 audit-evidence pass; bounded per-node grid refusal log; new refusal reasons and constants. |
| `src/reconstruction/layout-truth-check.ts` | `residualAudit` input; `residualsForPass()`, `summariseResiduals()`, `auditRenderWidths()`; the band-width loop's width set is now `union(bandVerifyWidths, auditWidths)`; `TruthCheckResult.residual`. |
| `src/reconstruction/generate-app.ts` | passes the evidence in, serializes the audit and the refusal log into `manifest.layout`. |
| `src/reconstruction/types.ts` | 13 new **optional** `manifest.layout` fields. |
| `src/reconstruction/index.ts` | barrel exports for the new symbols. |
| `scripts/smoke-layout-safety.ts` | Part 11c (B2) and Part 11d (B1), 38 new checks. |

### Code anchors (verified at time of writing)

| what | where |
| --- | --- |
| B1 evidence pass (source half) | `src/reconstruction/layout-inference.ts:3091` |
| B1 residual detection (the subtraction) | `src/reconstruction/layout-truth-check.ts:748` `residualsForPass()` |
| B1 rank + per-route cut | `src/reconstruction/layout-truth-check.ts:860` `summariseResiduals()` |
| B1 width bound | `src/reconstruction/layout-truth-check.ts:919` `auditRenderWidths()` |
| B1 truth-width sample (no extra page load) | `src/reconstruction/layout-truth-check.ts:1461` |
| B1 unioned width set (`bandVerifyWidths ∪ auditWidths`) | `src/reconstruction/layout-truth-check.ts:1520` |
| B1 per-pass subtraction, report-only | `src/reconstruction/layout-truth-check.ts:1642` |
| B1 per-node grid refusal log | `src/reconstruction/layout-inference.ts:2412` `noteGridRefusal()` |
| B2 child roles from computed style | `src/reconstruction/layout-inference.ts:1553` `gridChildRole()` |
| B2 `grid-column` corroboration | `src/reconstruction/layout-inference.ts:1572` `declaredColumnSpan()` |
| B2 measured frozen excess | `src/reconstruction/layout-inference.ts:1608` `gridFrozenExcessPx()` |
| B2 participation split | `src/reconstruction/layout-inference.ts:1737` |
| B2 span run width, `(k−1) × gap` | `src/reconstruction/layout-inference.ts:1823` `runWidth()` |
| B2 per-track single-column witness requirement | `src/reconstruction/layout-inference.ts:1869` |

### Bounds (every one of them counted, never silent)

| bound | value | counter |
| --- | --- | --- |
| audit candidates per page × viewport | 1200 | `residualAuditNodesOmitted` |
| extra render widths per pass | 4 | `residualAuditWidthsCapped` |
| residual records per route | 24 | `residualFrozenOmitted` |
| grid refusal records per route | 24 | `gridTrackRefusalNodesOmitted` |

Cost, measured: linear.app rendered **8 main pages + 9 band widths + 32 audit widths**;
hobbang.net **20 + 10 + 80**. The audit's own extra page loads are the third number and are
bounded by 4 per page × viewport.

## 4. B1 REAL RESULTS

### 4a. Frozen-property-family histogram — **`width` dominates, not `grid-template-columns`**

| family | linear.app | hobbang.net |
| --- | ---: | ---: |
| **width** | **2734 (91.3%)** | **2212 (99.1%)** |
| grid-template-columns | 172 (5.7%) | 6 (0.3%) |
| min-width | 89 (3.0%) | 14 (0.6%) |
| **total residuals detected** | **2995** | **2232** |

| consequence | linear.app | hobbang.net |
| --- | ---: | ---: |
| offscreen | 1017 | 536 |
| clipping | 0 | 0 |
| neither | 1978 | 1696 |

**Stated plainly: the dominant frozen family is `width`, by an order of magnitude over
`grid-template-columns` on both sites.** B2 was specified independently and was implemented
regardless, but the measurement says grid tracks are ~6% of the residual on linear.app and
~0.3% on hobbang.net. The next largest lever is `width`, not tracks.

The `clipping` count being 0 on both sites is a real result, not a broken detector: the
frozen boxes that overflow do so past the **viewport** (tagged `offscreen` first, which wins
the tag), because the frozen ancestors are page shells rather than inner columns.

### 4b. Ranked top residuals — linear.app (`2026-09-04T13-56-34-051Z`)

Measured at widths `[1025, 1280, 1281, 1440, 1920]`.

| route/viewport | node | frozen | source `w` | clone `w` | Δpx | rel | tag | desc | rule | refusal |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| p000001/desktop | n000116 `<div>` | `width: 1440px` | 1025 → 1920 | 1440 (const) | 480 | 0.25 | offscreen | 416 | — | `inline-size:no-branch-matched` |
| p000001/desktop | n000117 `<div>` | `width: 1440px` | 1025 → 1920 | 1440 (const) | 480 | 0.25 | offscreen | 415 | full-width | `inline-size:emitted-full-width` |
| p000001/desktop | n000123 `<div>` | `width: 1440px` | 1025 → 1920 | 1440 (const) | 480 | 0.25 | offscreen | 409 | full-width | `inline-size:emitted-full-width` |
| p000001–4/desktop | n000009 `<header>` | `width: 1440px` | 1025 → 1920 | 1440 (const) | 480 | 0.25 | offscreen | 49 | — | `inline-size:refused-containing-block-guard` |
| p000001–4/desktop | n000010 `<nav>` | `width: 1440px` | 1025 → 1920 | 1440 (const) | 480 | 0.25 | offscreen | 48 | full-width | `inline-size:emitted-full-width` |

The clone's `x` for `n000116` reads `[-2, -2, -2, 0, 240]`: at 1025 the frozen 1440px box
starts 2px left of the viewport and ends 1438px right of its left edge, i.e. **413px past the
1025px viewport**, on a subtree of 416 descendants.

### 4c. Ranked top residuals — hobbang.net (`2026-09-04T13-57-09-329Z`)

Measured at widths `[768, 1023, 1100, 1440, 1920]`.

| route/viewport | node | frozen | source `w` | clone `w` | Δpx | rel | tag | desc | rule | refusal |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| p000001/desktop | n000306 `<aside>` | `grid-template-columns: 425.609px` | 720, 975, 404.8, 425.61, 425.61 | 425.59 (const) | 549.41 | 0.56 | offscreen | 37 | **grid-track-columns** | `inline-size:no-branch-matched` |
| p000001/desktop | n000308/320/332 `<div>` | `width: 425.609px` | 720 → 425.61 | 425.59 (const) | 549.41 | 0.56 | offscreen | 10 | — | `inline-size:refused-containing-block-guard` |
| p000001/desktop | n000310…337 `<p>` (8×) | `width: 383.609px` | 678 → 383.61 | 383.59 (const) | 549.41 | 0.59 | offscreen | 1 | full-width | `inline-size:emitted-full-width` |

### 4d. The finding that the ranking makes visible

**Most of the top residual is downstream of a frozen ANCESTOR, not of a node that refused.**
Six of the ten linear.app leaders and eight of hobbang.net's carry
`recoveredKind: "full-width"` — a `width: auto` rule that recovery emitted, the truth check
verified, and which still measures a constant clone width, because the box it resolves against
is itself frozen. `hobbang n000306` is the sharpest case: its `grid-template-columns` was
successfully recovered by B2's own kind and it is still the #1 residual on the site.

This is the same arithmetic the "do not turn the audit into a gate" instruction rests on, seen
from the other side: refusing more is not the fix, and neither is emitting more on the leaves.
The residual is an ANCESTOR-CHAIN property, and the ranked list plus `descendants` is the
instrument that says which ancestor to attack first.

### 4e. Per-node grid refusal log — top entries by measured frozen excess

`excess` = `Σ frozen tracks + (n−1) × gap + padding + border − container border-box width`,
at the narrowest width the container was observed at.

| site | route/viewport | node | reason | tracks | excess | at | children |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| linear.app | p000001/mobile | n000119 `<div>` | `child-probe-missing` | 2 | **660px** | 390 | 7 |
| linear.app | p000001–4/desktop | n002947 / n003541 / n001467 / n000332 `<div>` | `children-do-not-tile-tracks` | 6 | **411px** | 1025 | 10 |
| linear.app | p000002/desktop | n000104 `<div>` | `not-every-track-witnessed` | 12 | 338.94px | 1025 | 3 |
| hobbang.net | p000001/desktop | n000269 / n000430 / n000679 / n000743 | `tracks-not-reproducible-at-every-width` | 2–4 | **384px** | 768 | 2–11 |

The `6 × 224px` footer container named in the work-package brief is the third row
(`p000004/desktop n000332`). **It still refuses**, and the log now says why, per node:
diagnosing it directly shows one child measuring a constant 20 × 20px box inside the first
224px track (`n000333`, `x` 36→320, `w` 20 at every width). That is a grid item that does not
fill its column — exactly the case `children-do-not-tile-tracks` exists to catch — and it is
NOT one of the populations B2 targets. Before this change the same container was refused with
`child-count-not-multiple-of-tracks` (10 children over 6 tracks), which was the wrong reason.

## 5. B2 BEFORE / AFTER

### linear.app

| counter | before `2026-09-03T11-43-40-893Z` | after `2026-09-04T13-56-34-051Z` |
| --- | ---: | ---: |
| `gridTrackColumns` (emitted) | 76 | **80** |
| `gridTrackRefusals` | 407 | **403** |
| `candidateRules` | 1729 | 1733 |
| `recoveredRules` (shipped) | 1727 | **1731** |
| `rejectedByTruthCheck` | 2 | 2 |
| `acceptedRegressed` | 0 | 0 |

`gridTrackRefusalsByReason`:

| reason | before | after |
| --- | ---: | ---: |
| `child-count-not-multiple-of-tracks` | 34 | **0** (retired) |
| `children-do-not-tile-tracks` | 14 | 12 |
| `container-width-constant` | 207 | 207 |
| `no-computed-tracks` | 124 | 124 |
| `no-probe` | 21 | 21 |
| `tracks-not-px` | 6 | 6 |
| `tracks-not-reproducible-at-every-width` | 1 | 2 |
| `hidden-child-participates-at-another-width` | — | **13** (new) |
| `not-every-track-witnessed` | 0 | **16** (new) |
| `child-probe-missing` | 0 | **2** (new) |

### hobbang.net

| counter | before `2026-09-03T11-42-38-138Z` | after `2026-09-04T13-57-09-329Z` |
| --- | ---: | ---: |
| `gridTrackColumns` (emitted) | 74 | **77** |
| `gridTrackRefusals` | 84 | **81** |
| `candidateRules` | 2033 | 2036 |
| `recoveredRules` (shipped) | 2033 | **2036** |
| `rejectedByTruthCheck` | 0 | 0 |
| `acceptedRegressed` | 0 | 0 |

| reason | before | after |
| --- | ---: | ---: |
| `child-count-not-multiple-of-tracks` | 4 | **0** (retired) |
| `container-width-constant` | 22 | 22 |
| `no-computed-tracks` | 30 | 30 |
| `tracks-not-px` | 10 | 10 |
| `tracks-not-reproducible-at-every-width` | 18 | 19 |

### Newly emitted rules that survived the truth check

`candidateRules` and `recoveredRules` rose by exactly the same amount on both sites
(+4 linear.app, +3 hobbang.net) while `rejectedByTruthCheck` and `acceptedRegressed` did not
move. **All 7 newly emitted grid rules were verified by a real render and shipped; none was
rejected.**

### Acceptance canary — met, generically

`linear.app p000004/desktop n000090 <div>` (and its sibling `n000172`, and both on mobile):
**7 children over 2 columns** — a genuinely ragged grid that `children.length % trackCount`
refused outright.

* frozen exact tier: `grid-template-columns: 222px 222px`, `column-gap: 28px`
* recovered: `minmax(0, 1fr) minmax(0, 1fr)`
* the evidence that proves it fluid, straight out of the emitted rule:
  `928px: content 424 = 198 + 198 + 1×28 gap` … `1440px: content 472 = 222 + 222 + 1×28 gap`

At 928px the frozen list forces `222 + 222 + 28 = 472` inside a 424px content box — a 48px
overflow that no longer ships. The recovered family is exactly the
`repeat(N, minmax(0, 1fr))` shape the acceptance criterion asks for, and it was reached with
no hostname, selector, node id or pixel constant belonging to any site.

Second population, also real: `linear.app p000001/desktop n000536 <a>` and
`p000003/desktop n000291 <a>` — one visible child plus one `display: none` child over a single
`1344px` track. Frozen `1344px` → recovered `minmax(0, 1fr)`.

## 6. TESTS

38 new permanent checks in `scripts/smoke-layout-safety.ts`; suite **222 → 260**, all passing.

Part 11c (B2) — every fixture is arithmetic on a container width array and a weight vector,
with no site, selector or borrowed pixel:

* `display: none` child, 4 children over 3 tracks → recovers `1fr 1fr 1fr`; the removed child
  is NOT a witness; a `display: none` child the source brings back at another width refuses
  with `hidden-child-participates-at-another-width`.
* a child spanning k consecutive tracks → recovers 2:1 fr weights; **the emitted weights are
  asserted**, not merely "something was emitted".
* the gap arithmetic: a child as wide as two tracks **without** the gap between them — the box
  a missing `(k−1) × gap` term would have accepted — is refused.
* `grid-column` corroboration: a declared span that contradicts the measured run refuses;
  Chromium's `auto / auto` says nothing and is ignored.
* NEGATIVE CONTROL: `visibility: hidden` child is NOT skipped, stays a witness, and the probe
  alone could not have told it apart (`v === 0` for both cases, asserted).
* NEGATIVE CONTROL: the same child at `display: none` leaves its column unmeasured and refuses.
* NEGATIVE CONTROL: a column measured only by SPANNING children refuses
  `not-every-track-witnessed`; a child matching no track and no run refuses
  `children-do-not-tile-tracks`.
* THE GATE STAYS ARMED: every emitted grid rule carries ≥ 1 witness.
* a refusal names its node, its viewport, and the measured frozen excess.

Part 11d (B1):

* the audit runs at the probe widths that are not the truth width, and its accounting
  (passes / measured / omitted / rendered / capped) is asserted.
* all four synthetic nodes are detected, **ranked** `offscreen → clipping → Δpx → descendants`.
* both measured halves are carried width by width so a finding can be re-checked.
* REPORT-ONLY INVARIANT: the correct rule still ships, `rejectedByTruthCheck`,
  `rejectedUnverifiable`, `rejectedByBandCheck` and `acceptedRegressed` are all 0, and the same
  run **without** the evidence ships a byte-identical rule list.
* a node whose clone moves with the source is not a residual.
* the width bound keeps both extremes and never renders the truth width twice.

### How pre-fix failure was established

Not by argument. Both halves were re-run against a temporarily reverted implementation, with
the original files restored afterwards and verified by `shasum -a 256 -c`:

* **B2** — `gridChildRole()` forced to `"sizing"`, the `children.length % trackCount` gate
  restored, `occupiesAt()` reduced to `v === 1`, and the span loop clamped to `span <= 1`:
  **14 of the new checks FAIL** (`246/260`), with the pre-fix reasons in the failure detail
  (`child-count-not-multiple-of-tracks`, `children-do-not-tile-tracks`).
* **B1** — the audit's extra render widths forced to `[]`, i.e. the pre-B1 world in which the
  clone is never rendered anywhere but 1440: **10 of the new checks FAIL**, all of them
  reporting `residuals: 0`. The four report-only checks still pass, which is correct: they
  assert that nothing is rejected, and a disabled audit rejects nothing either.

Three checks in Part 11c are labelled `PRE-FIX REPRODUCTION` and assert the pre-fix predicate
directly on the fixture (`4 % 3 !== 0`; `4 % 2 === 0`; the spanning child's box matching no
single track within `FULL_WIDTH_TOLERANCE_PX`), so the fixtures cannot silently drift into
cases the old code would have accepted.

## 7. REJECTED IDEAS

* **Deriving track sizes from a spanning child alone.** A span of k tracks measures their SUM,
  and every partition of that sum reproduces it identically. The tempting rescue — "if the
  frozen used tracks in the run are equal at 1440, divide `(w − (k−1)×gap)` by k" — is unsound:
  `1fr` + `200px` that happen to be equal at 1440 diverge at 1024, the sum still matches at
  every width, AND the truth check cannot catch it, because the spanning child (the only
  witness for that run) is at the right place and the right size either way. A column with no
  single-column witness is refused instead (`not-every-track-witnessed`, 16 occurrences on
  linear.app).
* **Making the residual audit a gate.** Measured, not stylistic: on the worked case, refusing
  the recovered `width: auto` as well leaves the container at 1436 and trades a 290px overhang
  for a 336px one — the refusal makes the clipping worse. The reasoning is in the code, at the
  head of the audit block in `layout-truth-check.ts`.
* **Relaxing `containingBlockGuard` for grid items.** Not touched. It was built once, measured
  net-negative (100 nodes moved up to 2px, zero overflow removed) and reverted; a grid item's
  percentage base is its grid AREA. `refused-containing-block-guard` appears as the refusal
  reason on several top residuals and is still the right answer there.
* **Loosening `FULL_WIDTH_TOLERANCE_PX` to admit spans.** It does double duty as the
  single-column match tolerance and the tiling tolerance, so loosening it would admit false
  COLUMN matches — a wrong track list the truth check can still pass. A separate
  `GRID_SPAN_TOLERANCE_PX` was introduced with the same 2px value and its own justification,
  so the two roles can move independently without one loosening the other.

## 8. REMAINING LIMITATIONS

1. **The audit needs the browser.** It runs only on the path where `verifyLayoutRules()`
   actually launches Chromium. `disabled`, `chromium-unavailable`, `no-candidates` and
   `unverifiable-candidates` all record `residualAuditStatus: "not-performed"` — honest, but it
   means a run with zero recovered rules and a fully frozen page reports nothing.
2. **The candidate bound bites on large pages.** linear.app offered 8825 audit candidates and
   measured 6513; 2312 were dropped by the per-pass bound of 1200 and counted in
   `residualAuditNodesOmitted`. hobbang.net dropped none.
3. **The width bound bites on dense probe grids.** linear.app's desktop probe samples 16
   widths; 46 audit widths across the corpus were dropped (`residualAuditWidthsCapped`). The
   sample keeps both extremes and spreads the rest, so the range is covered even where the
   sampling is not exhaustive.
4. **`clipping` is under-reported by construction.** `offscreen` is tested first and wins the
   tag, so a box that both overhangs the viewport and overflows its parent is reported as
   `offscreen` only. Both sites report 0 `clipping` for this reason.
5. **The refusal attribution is two channels, not all of them.** A residual carries a
   `refusalReason` from the grid stage or the inline-size funnel (including its pre-stage
   drops). The containing-block guard's own `refuse()` closure has no node in scope and was not
   re-plumbed; nodes it refused surface as
   `inline-size:refused-containing-block-guard` from the funnel instead, which names the class
   but not the specific guard reason.
6. **B2 does not solve the dominant family.** The measurement in §4a says `width` is 91%/99% of
   the residual and `grid-template-columns` 6%/0.3%. B2 is correct and it shipped 7 more
   verified rules, but the audit's own ranking says the next lever is the ancestor chain that
   freezes `width`, not more grid work.
7. **Descendant counts are structural, not visual.** `descendants` counts nodes in the spec
   tree beneath a residual, which over-weights text-heavy subtrees relative to their painted
   area. It is a tiebreak, never the primary rank.
8. **Not attempted.** The audit does not render the MOBILE tree at desktop widths or vice
   versa (each pass is measured only inside the half of the width axis its variant is
   displayed on), and it does not measure height or vertical overflow at all — the probe
   carries no `y` and no height, so there is nothing to compare a rendered height against.

---

## CORRECTION (appended 2026-09-05, after the independent architecture audit)

**Limitation 3 above is imprecisely worded.** It reads "linear.app's desktop probe samples 16
widths; 46 audit widths across the corpus were dropped". The **46 is linear.app alone**.
Re-measured from the artifacts:

| site | `residualAuditWidthsCapped` |
|---|---:|
| linear.app | 46 |
| hobbang.net | 20 |
| **corpus total** | **66** |

The claim "across the corpus" is wrong; every other number in that limitation is correct
(linear rendered 32 audit widths over 8 passes, hobbang 80 over 20). The bound was disclosed and
counted either way, so nothing was silent — the label was.

**A second limitation the audit named, which this report did not state and should have.** The
per-route retention cut is 24, and the ranking's first key is the `offscreen` tag. Consequence,
measured:

| site | residuals detected | records retained in the artifact | retained that are `offscreen` | detected that are `offscreen` |
|---|---:|---:|---:|---:|
| linear.app | 2,995 | 96 (3.2%) | 100% | 34% |
| hobbang.net | 2,232 | 240 (10.8%) | 100% | 24% |

So **the family histogram in §4a cannot be recomputed from the retained records** — it is
computed in-process over the full population and only the aggregate survives. What the artifact
supports is "name the top 24 residuals per route", not "enumerate which nodes shipped a frozen
value". `residualFrozenOmitted` (2,899 / 1,992) counts exactly what was dropped, so the gap is
visible, but a reader who tries to rebuild §4a from `residualFrozenNodes` will get a
100%-offscreen sample and a different histogram. Stated here rather than left to be discovered.
