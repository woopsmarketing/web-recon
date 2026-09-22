# Task 28.7 — 10 Final Independent Adjudication

**Adjudicator:** fresh context. No involvement in this wave, no conclusion suggested to me.
**Method:** every load-bearing number was re-read out of the artifact, not the report. Every defect
class named by the visual auditor was re-checked against the PNGs with my own eyes. Two smoke suites
and `pnpm typecheck` were re-run by me. Read-only throughout; this file is the only thing I wrote.

---

# VERDICT

# NOT READY - CORE BLOCKERS REMAIN

---

## 1. The four facts that decided it

**F1 — The dominant defect was measured precisely and then not moved.** The wave's own instrument
says `width` is 91.3% (linear) / 99.1% (hobbang) of the residual frozen population and that the
residual is an *ancestor-chain* property. Across the five linear reconstructions of this wave the
measured residual went **2,995 → 2,958 → 3,040 → 2,924** — a 2.4% net move that is not even a
controlled comparison. In the final graded artifact
(`data/linear.app/reconstructions/2026-09-04T17-24-33-839Z/reconstruction-manifest.json`),
`inlineSizeOutcomes.no-branch-matched` is **3,654 of 5,736** inline-size candidates, against
`emitted-inset-resolved-width: 42`. And `gridTrackColumns` in that same final manifest is **75** —
*fewer* than the pre-wave baseline's 76 (the series is 76 → 80 → 80 → 84 → **75**). The one fidelity
number report 03 claims (+4 grid rules) is not present in the artifact the wave graded, and no report
ties the two.

**F2 — The consequence is on the brief's own forbidden list, and I saw it.** In the final canary,
`footer-clipped` is a BLOCKER on 4 of 24 pairs and `offscreen-text-excess-chars` on 5. The clone's
full-page PNG heights give it away without any metric: linear `/` clone is **9,960px tall at 700,
1024, 1100 and 1440** while the source is 9,587 / 10,131 / 9,710 / 9,960 — one frozen desktop layout
at every width. Opening the pair at 700 (`02-linear-app-root-700-{source,final}.png`, clone PNG
**862 × 9960** against a **700 × 9587** source) shows a ~1390px desktop page inside a 700px viewport:
the hero headline reads "The product developme… / system for teams and ag", Log in / Sign up are past
the right edge, the logo strip is gone. On `/pricing` the clone PNG is **7,714px tall at 390, 700 and
1024** — the mobile tree served at 1024, two-thirds of the page black, the entire header nav absent.
Severe clipping, broken navigation, giant empty areas, broken footer, wrong responsive layout: five of
the brief's nine named-forbidden defects, in two pairs.

**F3 — The rubric has no channel for the defect a human sees first.** On
gs.severance.healthcare `/gs/index.do` @1440 the QA reports `image-presence-ratio 1`,
`missing-text-ratio 0`, `visible-text-ratio 1`, source and clone both 2,644 visible chars and both 27
image leaves — while the hero photograph and headline are a **white rectangle**, the NEWS row has
**zero of four cards**, and the promo carousel has none. I confirmed all three by eye. What the
instrument actually recorded is `left-edge-delta-median-px 1542` and `p90 5397`: the content exists
and is thousands of pixels away. The pair graded BLOCKER, but by `overlap-excess-ratio` — the right
answer for the wrong reason. A new site whose displacement happens to be smaller will score MINOR
while looking broken.

**F4 — Clause 1 of the success definition fails on the one canary chosen to demonstrate it, and no
report says so.** In the final seoultone observation
(`data/seoultone.kr/site-observations/2026-09-04T18-13-50-161Z/pages/p000001/observation.json`) the
**mobile** viewport records `structuralMatches: 1, qualified: 1, dismissed: 1`; the **desktop**
viewport, same page, same run, records `structuralMatches: 0, qualified: 0, dismissed: 0`. The only
evidence directory on disk is `p000001-mobile-1`; there is no desktop record. I opened the 1440 pair:
the clone ships the "가을이벤트 · 26.09.01–26.10.31" entry popup **baked permanently over the desktop
homepage**. The cause is generic, not site-specific: `OVERLAY_SHAPE` requires ≥50% of viewport width,
and this popup is ~449px = **31% of 1440** (it is ~100% of 390). Most centered desktop modals are
narrower than half a wide viewport, so the gate refuses them by construction at exactly the widths
reconstruction is graded at.

---

## 2. The six success-definition clauses, individually judged

| # | Clause (verbatim) | Judgement |
|---|---|---|
| 1 | temporary popup state is not accidentally frozen | **PARTIALLY MET** |
| 2 | scroll preparation cannot casually destroy a route | **MET** |
| 3 | major frozen layout values are visible and the highest-impact generic cases are recovered | **PARTIALLY MET** (visible: MET · recovered: NOT MET) |
| 4 | QA does not inflate obvious artefacts | **PARTIALLY MET** |
| 5 | existing easy/static fidelity remains good | **MET** |
| 6 | existing hard/medium canaries do not materially regress | **MET** |

### Clause 1 — temporary popup state is not accidentally frozen → PARTIALLY MET

**For.** `src/observer/normalize-page-state.ts` is real, conservative and evidence-producing: the
predicate is modal-SHAPED **and** ≥2 signals **and** ≥1 STRONG; actions are only a labelled close
control or Escape, never `force`; at most 2 attempts; **there is no DOM-removal path at all**, which
the independent architecture auditor confirmed by grepping every DOM-mutation form in the module.
Five negative controls (fixed header, chat widget, accessibility control, full-viewport hero,
scroll-locked page) hold at both viewports. Evidence per attempt with before/after PNGs and a record
naming the node, the signals, the control and the measured coverage change is written and present.
On seoultone mobile it worked: coverage 0.568 → 0.

**Against (the deciding half).** See F4. The same popup, the same page, the same observation run: found
and dismissed at mobile, **not detected at all at desktop**, and the desktop clone ships it. This is
the wave's own canary D and the clause the wave is judged on first. Neither report 01 (which presents
A2 as working) nor report 06 (which presents canary D as answered) states it. It is not a false claim
— it is a material omission at the exact boundary, and the root cause is a viewport-relative shape
gate that will refuse typical desktop modals on any new site.

### Clause 2 — scroll preparation cannot casually destroy a route → MET

`autoScrollPrepare` is now total: a per-step `page.url()` identity check after **every** step (which
catches the silent case Playwright never throws on), a bounded one-`goto` recovery plus one retry, and
a non-throwing final restore recorded separately as `restoreNavigated`. Verified at file:line by the
architecture auditor (`src/observer/layout-probe.ts:392`, `:345-360`, `:583-592`) and covered by a
real-Chromium fixture that *causes* the defect — a local HTTP server serving `/nav-once` and
`/nav-always` that assign `window.location.href` on scroll past 200px, which against the pre-fix code
loses the observation entirely.

The second door found by rejecting a green report is the stronger evidence: `page.screenshot({fullPage:
true})` silently inheriting Playwright's 30s default action timeout threw straight out of
`observeViewport` and lost the whole route — the same P0 through a different path, which would fire on
any slow real site. Now bounded at 60s with a viewport-only fallback, and the observation is **kept**
with `screenshotDegraded` recorded rather than the route being lost.

**Outcome evidence.** I checked all four final canary observations directly:
seoultone **13/13 pages success**, hobbang 10/10, linear 4/4, severance 2/2. In 28.6 seoultone lost
its root route and `pnpm reconstruct` refused outright.

**Named caveat, not a deduction.** Across all four runs every `prepareScrollStatus` is
`prepare-scroll-complete` and there were **0 navigation events** — the recovery branch is
fixture-proven, not corpus-proven. The clause says "cannot casually destroy a route", and the code
path can no longer throw out of a viewport observation at all. MET.

### Clause 3 — frozen values visible AND highest-impact generic cases recovered → PARTIALLY MET

**Visible: MET.** `manifest.layout.residualFrozenNodes[]` is a genuine per-node array carrying
`pageId`/`viewportId`/`nodeId`/`parentNodeId`/`property`/`family`/`frozenValue`/the width vector/
`sourceX,W`/`cloneX,W`/`absoluteDeltaPx`/`consequence`/`descendants`/`recoveredKind`/`refusalReason`.
The per-node grid refusal log conserves (83 retained + 325 omitted = 408 = `gridTrackRefusals`). Every
bound is counted, never silent (`residualFrozenOmitted` 2,828 on the final linear run). The finding it
produced — that most top residuals are *downstream of a frozen ancestor even when the node itself
recovered a verified rule* — is the single most valuable thing this wave produced.

Bounded honestly: only the top 24 per route are retained, the ranking's first key is the `offscreen`
tag, so the retained slice is **100% offscreen against a 34% offscreen population** and §4a's histogram
cannot be recomputed from the shipped records. Disclosed in the appended CORRECTION.

**Recovered: NOT MET.** See F1. Grid tracks are 5.7% / 0.3% of the residual by the wave's own
measurement; `inset-resolved-width` answers one of three named chain-root populations (47 roots on
linear) and shipped **42 rules** against **3,654** unanswered inline-size candidates. The #1 residual
on linear — a full-bleed `100vw` root with **416 descendants** — is named, quantified and untouched, as
are hobbang's four banded grid-track roots. The measured residual is flat across the wave. The graded
consequence is F2.

I record that the idea-lane's own report is candid about this ("The mechanism answers ONE of the three
chain-root populations"). The problem is not concealment; it is that the highest-impact case was
identified and left in place.

### Clause 4 — QA does not inflate obvious artefacts → PARTIALLY MET

**For.** Four guards implemented at the right structural level: `cloneRouteGate` as a short-circuit
with `suppressEveryFurtherChannel` (so a future channel is covered automatically) rather than
retrofitting `eligible:` onto ~15 call sites, six of which take no such argument; instability detected
post-hoc across widths so `classifyPair` stays pure; the overlap sweep lifted out of the in-page probe
into a testable module; and the `pair.classification?.verdict ?? "BLOCKER"` default — a harness hole
charged to the clone — **deleted**. `summary.coverage` conserves on all four real runs
(`conserved: true`, every bucket 0, `blocker+major+minor+pass === pairsVerdicted`). That is a real
defence against "fewer blockers because we stopped measuring", and it is populated outside fixtures.

**Against.**
- **No guard fired on real data.** All four demotion counters are **0** on all four canary runs. The
  improvement is fixture-verified, not corpus-verified; report 04's appended L2 says exactly this.
- **Still inflates, in ways the guards do not cover.** The independent visual auditor found the
  machine too strict on 4 of 20 pairs. The sharpest is linear `/` @390: a **BLOCKER** from
  `offscreen-text-excess-chars 200` on a product mock the *source itself* bleeds past the right edge.
  I confirmed both images are clipped at the same place; the floor's PASS was nearer the truth than
  the verdict. `position-delta-p90-px` produced a MAJOR at 63px against a 48px threshold on a page the
  auditor could not fault.
- **Still under-prices a total collapse of a small area.** hobbang's footer link row is broken into
  single syllables printing on top of each other — I confirmed it at 1440 — and scores MINOR because
  `overlap-excess-ratio` is area-weighted at 1.29%.
- **Disclosed after the audits, not before (L3):** `gatePixels()` crops to `min(width) × min(height)`,
  so the horizontal-overflow band the top defect produces is **never pixel-diffed**, and the human pack
  shows a 700px source next to an 862px clone, and a 1280px source next to an 1100px clone, with no
  scale warning on the page.
- **Not disclosed anywhere — a new bias this wave introduced.** `normalizePageState` has **zero callers
  under `src/responsive-qa/`**: the observer now dismisses entry popups, and the QA source capture does
  not. So on seoultone @390 the source shows the popup and the clone correctly shows the real hero, and
  the clone is charged for it in `missing-text-ratio`. The visual auditor noticed the symptom on one
  pair; no report identifies the systematic cause. (I checked the magnitude: the 27.77% at 1440, where
  *both* sides carry the popup, is genuine content loss, so the popup is the smaller part of the 30.54%
  at 390 — but the bias is structural and will land on any site with a mobile-qualifying entry modal.)
- **Carried, blast radius zero this wave (L1):** `overlap.ts:117` demotes on **either** leaf failing to
  load, before any geometry test, capping a real BLOCKER overlap at MAJOR whenever a broken image
  participates — the normal early failure mode on a fresh site.

Better instrumented than 28.6, and now mis-pricing in **both** directions. PARTIALLY MET.

### Clause 5 — existing easy/static fidelity remains good → MET

hobbang.net: **0 BLOCKER**, 2 MAJOR, 4 MINOR across 6 pairs. I confirmed the body reproduces at every
width — hero card, both red banner images, the long multi-column data tables with per-row link buttons,
the numbered guidance cards, the FAQ accordion, the 2×7 category grid. linear `/pricing` at 390 and
1440 were graded **PASS** by the independent visual auditor, who found one difference in total
(`US$10` → `$10`) across a four-card plan grid and a ~60-row comparison matrix with every tick and
cross in the right cell. The one real defect on hobbang is the footer link row (clause 4).

Judged on the absolute state, not on a delta: `RUBRIC_VERSION` moved 3 → 4, so 28.6 and 28.7 counts
are not comparable, and the reports say so.

### Clause 6 — existing hard/medium canaries do not materially regress → MET

- **Test battery.** 36 suite files on disk, 35 carrying assertions, **4,326 checks, 0 failures, 0
  non-zero exits**, typecheck exit 0, and **0 negative per-suite deltas** against the 28.5B battery. I
  re-summed `tmp/wr287/regression/parsed.json` myself (35 suites with checks, 4,326, 0 failures,
  `smoke-playwright` the only assertion-free suite) and independently re-ran `smoke-qa-independence`
  (**101/101**), `smoke-sitespec` (**466/466**) and `pnpm typecheck` (**exit 0**). Two first-pass
  failures were diagnosed to file:line and repaired at cause rather than retried — one of them
  (`smoke-qa-independence`, five table properties missing from QA's vocabulary) had been red since 28.6
  landed and is the argument for running a full battery at all.
- **linear (hard).** 6B / 2M / 2m of 10. The count did not move, but on `/`@700 and `/`@1024 the
  BLOCKER *cause* was replaced: `image-presence-ratio 0.379` and `visible-text-ratio 0.478` are silent
  and `missing-text-ratio` fell 0.4915 → **0.1071** @700 and 0.5425 → **0.0774** @1024, inside one
  rubric version. That is real progress the tally hides.
- **severance (medium).** 2B / 3M / 1m of 6, with `duplicateImageStackPairsDemoted: 0` — the two
  BLOCKERs are true overlaps, not the crossfade artefact the guard exists to separate. No regression
  signal.
- **Named partial negative, honestly reported:** §26's per-route switch broke the two-states signature
  on `/security` only; `/` and `/pricing` needed §27's rendered-population fingerprint. `/pricing`@1024
  is still served the mobile tree by construction (the swap is at 1025) and is recorded as a named
  limitation rather than papered over.

---

## 3. What this wave demonstrably fixed

1. **The 28.6 P0 (A10) whole-route loss.** seoultone 13/13 pages observed and reconstructed where 28.6
   lost the root route and refused to build. The scroll path is total, and a *second* independent route-
   loss path (the unbounded `fullPage` screenshot inheriting a 30s default) was found by refusing to
   accept a green report and is now bounded with the observation kept.
2. **The frozen-value defect became addressable.** From `gridTrackRefusals: 209` with no way to name a
   container, to a per-node residual record with the source-vs-clone width vector, the consequence tag,
   the descendant count and the exact refusal reason — plus the finding that the residual is an
   ancestor-chain property, which is what a future wave needs to attack it.
3. **The DOM-family fingerprint, and it rejected the brief's own premise.** The brief proposed an
   element-population signal; the measurement showed `totalNodes` is flat on linear (4,666/4,704 at
   every width) because both variants ship in one document, so a population fingerprint would have
   changed nothing. The **rendered** population discriminates (`/` +157% at 641, +11% at 929) at ~2ms
   on a ~300ms per-width budget, and the clone stopped serving one byte-identical tree at 390/700/1024.
4. **Coverage conservation on real runs.** Every pair accounted for, `conserved: true`, all buckets 0,
   0 clone-route-missing / 0 unstable / 0 measurement-failed. None of the improvement came from having
   stopped measuring, and that is now checkable rather than asserted.
5. **Grid recovery is generically correct** even though it is a small lever: participation from the
   child's own computed `display` instead of the probe's `v` flag, spanning runs shedding `(k−1)×gap`,
   and a per-track single-column witness requirement so `not-every-track-witnessed` stays meaningful.
6. **Two pre-existing red suites found and repaired at cause**, one of which had blinded QA to exactly
   the table-formatting property family 28.6 had just measured breaking hobbang's tables.
7. **A high standard of self-correction.** Two appended CORRECTION sections and three added limitations
   (L1/L2/L3) written *after* independent audits, admitting under-reports in the wave's own favour.

## 4. What it demonstrably did not fix

1. **A9 residual frozen `width`** — the top-ranked carried-in P0. Residual 2,995 → 2,924 on linear;
   `no-branch-matched` 3,654 of 5,736; `gridTrackColumns` in the final graded manifest (75) is *below*
   the pre-wave baseline (76). Ships as `footer-clipped` on 4 pairs and `offscreen-text-excess-chars`
   on 5, and as a hero headline chopped mid-word at 700.
2. **"A region that should hold content is blank."** severance's white hero, its zero-of-four NEWS
   cards and its empty promo carousel; seoultone's missing doctor-credential block at both widths.
   Nothing in the rubric detects it (F3), and the clone's own numbers show why on seoultone:
   `zeroOpacityNodes` **69 vs 18** in the source, `opacityHiddenTextChars` **897 vs 521**. The A4 reveal
   policy did not reach it — the observer recorded `regressedAfterReturn: 0` on both viewports, so B4's
   mechanism found nothing to correct while the clone still bakes the block blank.
3. **B5 popups at desktop** (F4), and the observer↔QA normalization asymmetry it exposes.
4. **Only two DOM trees exist and `/` needs three** — `variant-tree-not-observed-at-929` is recorded
   honestly, and is architectural rather than a bug.
5. **The QA under-report on `failed-image-layer`** (L1) and the never-pixel-diffed overflow band (L3),
   both explicitly carried to 28.8.
6. **PASS remains unreachable in practice.** 0 of 24 pairs PASS; **23 of 24 grade strictly worse than
   their own freshly-measured self-check floor** (I computed this pair by pair). The floor reaches PASS
   on 18 of 20 pack pairs, so the top of the scale is reachable by the instrument — the clone never gets
   there.

## 5. Claims I could not reproduce, or that the artifacts contradict

1. **Reports 01 and 06 present popup normalization as working on seoultone.kr without stating that it
   ran and found nothing at the desktop viewport.** Artifact: `pageStateNormalization` desktop
   `{structuralMatches: 0, qualified: 0, dismissed: 0}` vs mobile `{1, 1, 1}` in the same observation;
   the only evidence directory on disk is `p000001-mobile-1`; the 1440 clone PNG carries the popup. The
   artifact wins. Not a false statement — a material omission at the clause the wave is judged on.
2. **Report 03's headline grid gain is absent from the graded artifact.** 03 reports `gridTrackColumns`
   76 → 80 on linear. The final canary reconstruction reads **75**. The full series across this wave's
   five linear reconstructions is 76 → 80 → 80 → 84 → 75. Report 06's appended table shows the 84 → 75
   step but attributes it only to "which path each rule took". Explainable (different observations, and
   the per-route tree switch moved the probe axis) — but the wave's one claimed fidelity gain does not
   appear in the run it graded, and no report says so.
3. **`tmp/wr287/regression/index.tsv` — the live table — still records `multi-observer` exit 1 and
   `qa-independence` exit 1 with `UNPARSED` check counts**, plus `visual-vocab` and `playwright`
   UNPARSED. Only `parsed.json`, written 21 minutes later, shows the green post-repair state. Report 07
   explains this, but the raw index is the artifact a reader opens first. I verified the report's side:
   `parsed.json` sums to exactly 4,326 / 0 failures / 35 assertion suites, and my own re-runs of
   `smoke-qa-independence` (101/101), `smoke-sitespec` (466/466) and `pnpm typecheck` (exit 0)
   reproduce. The single `hasFailLines: true` entry (`responsive-qa`) is a PASS line whose *name*
   contains the word FAILED, not a failure.
4. **Report 01's verification table (`smoke-multi-observer` 222/222, four times) never reconciles with
   the final battery's 263/263.** Both are internally explained — the suite grew during the wave, and F2
   was a 1ms assertion race — but no report bridges them, and 222 appears nowhere in the final totals.
5. **Two claims the wave itself already corrected after the architecture audit**, which I confirmed as
   corrected rather than as originally stated: report 02's "46 audit widths across the corpus" (actual
   46 linear + 20 hobbang = 66) and report 27's "`elements` 2,306 at every width up to 1440" (actual
   2,260 at 1440).
6. **Human-review pack hygiene.** `index.html` and `manifest.json` reference only the four final
   Sept-4 runs, correctly. But **72 stale PNGs from four Sept-3 runs sit unreferenced in the same
   `<slug>/shots/` directories** — a reader browsing the folder rather than the index can grade a
   28.6-era image. Also, the pack shows 20 of the 24 measured pairs; the 4 omitted are all MINOR or
   MAJOR, which biases the pack pessimistically (the honest direction) but is not stated on the page.

## 6. What must be true before a fresh public URL test is meaningful

Ordered. Items 1–3 are the ones that make a new site's readout *wrong* rather than merely *bad*.

1. **Give the rubric a channel for "a region that should hold content is blank."**
   Today severance `/gs/index.do` @1440 reports `image-presence-ratio 1 / missing-text-ratio 0 /
   visible-text-ratio 1` with a white hero, zero NEWS cards and an empty carousel. Until this exists, a
   fresh site can score MINOR while a human calls it broken — which is the definition of a test that
   does not inform. *Acceptance:* fires BLOCKER on severance `/gs/index.do` @1100 and @1440 and on
   seoultone `/` at both widths; silent on linear `/pricing` @1440.

2. **Attack A9's `width` chain roots, or clamp the damage.**
   The two remaining named root populations (linear's 8 full-bleed `100vw` roots including the #1
   residual with 416 descendants; hobbang's 4 banded grid-track roots), plus the 3,654 `no-branch-matched`
   candidates. If the responsive solver is out of scope, the acceptable alternative is that a node the
   audit tags `offscreen` must not *ship* a frozen px that overflows its viewport — clamp it and measure
   the regression. *Acceptance:* `footer-clipped` and `offscreen-text-excess-chars` at 0 on linear `/`
   and `/pricing` at 700 / 1024 / 1100, and the `width` residual family down by a stated factor on both
   corpus sites.

3. **Close the popup asymmetry, in both directions.**
   (a) `OVERLAY_SHAPE`'s ≥50%-viewport-width gate refuses typical desktop modals — seoultone's is 31% of
   1440 and was dismissed at mobile in the same run. Make the gate viewport-aware or evidence-first at
   desktop. (b) responsive-QA's source capture must apply the same normalization the observer applies
   (`normalizePageState` currently has zero callers under `src/responsive-qa/`), or the rubric must
   exempt a normalized overlay. Today the clone is charged `missing-text` for a popup the engine
   deliberately removed. *Acceptance:* seoultone `/` @1440 clone no longer carries the event popup, and
   `missing-text-ratio` at @390 is attributable entirely to real content loss.

4. **Make the pixel and position channels honest about width mismatch (L3).**
   `gatePixels()` crops to `min(width)`, so the overflow band where the top defect lives is never
   diffed, and the pack pairs a 700px source with an 862px clone and a 1280px source with an 1100px
   clone without saying so. Either diff on a common canvas with the excess reported, or mark those
   pairs' pixel/position channels `not-comparable` and print that on the pack page.

5. **Fire on `overlap-excess-ratio-undemoted` (L1).**
   A real overlap is currently capped at MAJOR whenever *either* participant is a broken image — the
   normal early failure mode on a fresh public site, where asset independence is imperfect.

6. **Re-run a multi-site matrix under one rubric with fresh floors, and require some pairs to reach
   PASS.** 0 of 24 pass today and 23 of 24 sit below their own floor. Until at least the easy/static
   canary produces PASS pairs, a new site's verdict has no calibrated top end. The wave's own
   independent architecture auditor reached this conclusion unprompted ("This wave measured diagnosis,
   not outcome — close it by re-running the 7-site matrix before any readiness claim"), and I reached it
   separately.

**Carry, but do not block on:** only two DOM trees exist and `/` needs three; board/detail archetype
collapse is proven synthetically while real data already splits one route pattern into two archetypes
on both sites it runs on; `PAGE_STATE_EVIDENCE_ROOT` hardcodes `docs/result/28.7/evidence/page-state`
into permanently-enabled production code (28.8 will write into 28.7's directory); the responsive-QA
artifact family has no zod schema at all; `rejectedUnverifiable` is still derived by subtraction.

---

## 7. Confidence, and what would change my mind

**Confidence: high** on the facts, **moderate-high** on the verdict.

The facts are not in dispute and I verified each against an artifact or an image rather than a report:
0 PASS of 24, 23 of 24 below floor, the residual flat at ~2,900 on linear, `gridTrackColumns` 75 in the
graded run, the clone's 9,960px height at four different viewport widths, the desktop popup miss, and
the three channels reading "perfect" on a page with a white hero. The regression is genuinely clean and
I reproduced part of it myself.

The judgement call is clause-weighting. This wave is honest, well-instrumented and closed a real P0,
and a reasonable adjudicator could say "it completes, it conserves, it names its defects — go run a new
site and learn something." I do not, for one reason: a fresh public URL test is only meaningful if its
output can be *believed*, and right now the instrument cannot see the defect class that dominated my own
visual review, is systematically biased against the clone on any site with an entry popup, never diffs
the band where the top defect lives, and would in any case have its verdict dominated by a defect
already measured to three significant figures on two sites. That is re-measurement, not validation.

**What would change my mind, in order:**

1. A blank-region channel that fires on severance @1440 and seoultone, and does not fire on linear
   `/pricing` @1440. That alone would move me a long way, because it converts the new-site test from
   "may be confidently wrong" to "will be roughly right".
2. `footer-clipped` reaching 0 on linear `/` at 700 / 1024 / 1100 — by recovery or by clamping — with
   no new regression on the two clean `/pricing` pairs.
3. Any pair, on any site, reaching PASS under rubric 4 with a fresh floor. One calibrated PASS would
   tell me the scale's top end is real; zero of 24 tells me nothing about where the ceiling is.
4. Evidence that the desktop popup miss is specific to seoultone rather than a property of the
   ≥50%-viewport-width shape gate. If a handful of real desktop modals *do* qualify, clause 1 moves to
   MET and item 3 drops in priority.

Items 1 and 2 together would flip this to READY FOR NEW-SITE VALIDATION even with the frozen-width
residual still largely in place, because at that point the new test would be measuring something the
instrument can report faithfully.

---

*Adjudicated read-only. No source file modified, no pipeline command run, no git operation performed.
Independent re-runs performed by me: `pnpm typecheck` (exit 0), `smoke-qa-independence` (101/101),
`smoke-sitespec` (466/466). Images inspected directly: linear `/` @700 and `/pricing` @1024,
gs.severance `/gs/index.do` @1440 (two bands), seoultone `/` @390 and @1440 (two bands), hobbang `/`
@1440 footer.*
