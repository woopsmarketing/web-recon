# Task 28.6 — lane **w7-linear** (Program A closure gate)

**Host:** linear.app  **Routes:** `/`, `/pricing`, `/security`, `/changelog`  **Widths:** 390 / 700 / 1024 / 1100 / 1440
**Lane status:** COMPLETE — every stage ran, all 20 pairs graded, floor measured.
**Clone grade:** **BLOCKER 9 · MAJOR 8 · MINOR 3 · PASS 0** over 20 pairs.
**Grading floor (`--self-check`, source vs a second capture of itself):** **BLOCKER 2 · MAJOR 0 · MINOR 7 · PASS 11.**
**Baseline being closed against (run `2026-09-02T20-25-10-759Z`):** BLOCKER 9 · MAJOR 7 · MINOR 4 · PASS 0.
**Wall clock:** 23 min 16 s (2026-09-02T23:12:32Z → 23:35:48Z). **Artifacts on disk:** ≈ 415 MB + 35 MB review pack.
**Review images:** `docs/result/28.6/review/linear/` (34 PNGs, 35 MB, plus `README.md`).

## Verdict for the orchestrator, first

**Program A is NOT closed by this run.** The lane's two named hypotheses have split answers, and a
**new, generic, cross-module engine defect introduced by the 28.6 probe-width work accounts for 9 of 9
BLOCKER pairs.**

- The frozen parent-padding denominator **is genuinely fixed where the new code runs**. On `/pricing`,
  the exact node the previous lane diagnosed — `n000064`, the `<h1>Pricing</h1>` that shipped
  `width: 1344px` — now ships `width: auto`, and so does its responsively-padded shell `n000061`.
- It **did not run on the tree that needed it.** All four `@1100` BLOCKERs are still `footer-clipped`,
  and the number got **worse**: clone footer max right is now **1440** on all four routes (baseline:
  1438 on `/`, 1390 on the other three). 1440 is the raw truth-viewport width — the desktop tree ships
  with **zero** recovered layout rules.
- The 915 tree switch **did** snap to an authored breakpoint (**1025**, method `authored-breakpoint`).
  On this site that **moved the boundary the wrong way**: 915 sent one pair (`/ @700`) the phone DOM;
  1025 sends **eight** (700 and 1024, on all four routes).
- Root cause of both, in one line: the new floor-width eviction in `src/observer/probe-widths.ts`
  evicted `700, 768, 1100, 1440` from the desktop probe set. Losing **1440** refuses the whole desktop
  layout pass (`layout-inference.ts:1668`); losing **768** un-brackets the `769` tree-switch candidate
  (`tree-switch.ts:339`) so the switch lands at 1025 instead.

19 of 20 pairs kept the **identical verdict** they had in the baseline. Only `/changelog @390` moved
(MINOR → MAJOR). The verdict distribution is nearly unchanged while the underlying causes are almost
entirely different — the old defects cleared and a new one of the same size took their place.

---

## 1. What I ran, with exact commands and run ids

I did **not** use `pnpm e2e:reconstruct`. Its discovery stage constructs a `FirecrawlDiscoveryProvider`
unconditionally (`src/e2e/run-discovery.ts:53-63`) and the CLI exposes no flag to inject an existing
`discovery.json`, so it cannot be held to this lane's four-route scope — it would re-crawl and re-derive
families, and the result would not be comparable with the baseline. I ran the same stages the e2e chain
runs, in the same order, from the pre-existing 28.6 pilot scope, which is also exactly what the baseline
lane did. Nothing in `src/` or `scripts/` was read-modified; every stage below is the real stage CLI.

| # | command | output run id / directory | elapsed |
|---|---|---|---|
| 0 | `cp data/linear.app/2026-09-03T04-05-00-000Z-286-closure-gate/{discovery,pilot-scope-provenance}.json → new dir` | `data/linear.app/2026-09-03T08-15-00-000Z-286-w7-linear/` | — |
| 1 | `pnpm verify data/linear.app/2026-09-03T08-15-00-000Z-286-w7-linear/discovery.json --concurrency 2` | same dir | 7 s |
| 2 | `pnpm select .../verified-urls.json` | same dir | 2 s |
| 3 | `pnpm observe:site .../selected-pages.json --concurrency 2` | `data/linear.app/site-observations/2026-09-02T23-12-52-648Z` | 118.9 s |
| 4 | `pnpm detect:interactions <obs>/site-observation.json` | `<obs>/interaction-analysis.json` | 0.5 s |
| 5 | `pnpm explore:interactions <obs>/interaction-analysis.json --concurrency 2` | `data/linear.app/interaction-explorations/2026-09-02T23-15-00-695Z` | 152.7 s |
| 6 | `pnpm model:interactions .../interaction-exploration.json` | `data/linear.app/interaction-models/2026-09-02T23-17-36-959Z` | 0.08 s |
| 7 | `pnpm compile:sitespec .../interaction-patterns.json` | `data/linear.app/site-specs/2026-09-02T23-17-43-091Z` | 2.6 s |
| 8 | `pnpm reconstruct .../site-spec.json` | `data/linear.app/reconstructions/2026-09-02T23-17-49-443Z` | 22.6 s gen (incl. 21.6 s truth check) + 3.2 s `next build` (PASS) |
| 9 | `pnpm qa:responsive <rec> --widths 390,700,1024,1100,1440 --routes /,/pricing,/security,/changelog --self-check` | `data/linear.app/responsive-qa/2026-09-02T23-18-26-778Z` | 10 min 50 s |
| 10 | `pnpm qa:responsive <rec> --widths ... --routes ... --self-check-run data/linear.app/responsive-qa/2026-09-02T23-18-26-778Z` | `data/linear.app/responsive-qa/2026-09-02T23-29-17-748Z` | 6 min 31 s |

Stage results: verify **4/4 `200 HTML`**, 0 redirects, 0 blocked. Select 4 → 4 families → 4
representatives (all singletons). Observe **4/4 pages, 0 failures**, 4 desktop + 4 mobile observations.
Explore 21 actions, 21/21 locators resolved, 0 live safety guards fired, mutation cap on 3 actions.
SiteSpec 4 routes, exact behaviour on all 4, round-trip validation PASS. Reconstruct 4 routes,
**12 523 element nodes**, 3 113 CSS classes, 13 pattern triggers, validation PASS, `next build` PASS.
The floor run was accepted as this run's floor with **`selfCheckFloor.comparable = true`** (same site,
rubric, roster, widths and routes).

Read-only analysis scripts I wrote (in `tmp/wr286/w7-linear/`, importing the engine's exported API,
writing nothing into `src/`): `per-page-layout.ts`, `no-branch-why.ts`, `tree-switch-counterfactual.ts`.

---

## 2. The grade table, against the floor and against the 9/7 baseline

`B/M/m` are this pair's blocker / major / minor finding counts. "floor" is the same pair's verdict when
the SOURCE is graded against a second capture of itself — a pair cannot be better than its floor.

| route | width | **baseline** | **now** | B | M | m | floor | deciding channel and its number |
|---|---:|---|---|--:|--:|--:|---|---|
| `/` | 390 | MAJOR | MAJOR | 0 | 1 | 1 | **BLOCKER** | `missing-text-ratio` 5.36 % (thr 2.00 %) |
| `/` | 700 | **BLOCKER** | **BLOCKER** | 3 | 2 | 3 | BLOCKER | `image-presence-ratio` 90 of 255 images (35 %, thr 50 %) |
| `/` | 1024 | **BLOCKER** | **BLOCKER** | 4 | 3 | 2 | PASS | `image-presence-ratio` 75 of 248 images (30 %, thr 50 %) |
| `/` | 1100 | **BLOCKER** | **BLOCKER** | 2 | 2 | 1 | MINOR | `footer-clipped` clone max right **1440** > 1100 |
| `/` | 1440 | MAJOR | MAJOR | 0 | 2 | 1 | PASS | `missing-text-ratio` 2.68 % (thr 2.00 %) |
| `/pricing` | 390 | MINOR | MINOR | 0 | 0 | 2 | PASS | `missing-text-ratio` 0.41 % |
| `/pricing` | 700 | MAJOR | MAJOR | 0 | 2 | 2 | PASS | `column-container-mode-delta` clone 3×2, source 2×4 |
| `/pricing` | 1024 | **BLOCKER** | **BLOCKER** | 1 | 3 | 3 | PASS | `nav-link-ratio` 3 of 6 header links (50 %, thr 50 %) |
| `/pricing` | 1100 | **BLOCKER** | **BLOCKER** | 2 | 1 | 2 | PASS | `footer-clipped` clone max right **1440** > 1100 |
| `/pricing` | 1440 | MINOR | MINOR | 0 | 0 | 2 | PASS | `missing-text-ratio` 0.29 % |
| `/security` | 390 | MAJOR | MAJOR | 0 | 1 | 2 | MINOR | `column-mode-delta` clone 2 items, source 8 |
| `/security` | 700 | MAJOR | MAJOR | 0 | 3 | 3 | MINOR | `column-container-mode-delta` clone 3×2, source 2×4 |
| `/security` | 1024 | **BLOCKER** | **BLOCKER** | 1 | 3 | 3 | MINOR | `nav-link-ratio` 3 of 6 (50 %, thr 50 %) |
| `/security` | 1100 | **BLOCKER** | **BLOCKER** | 1 | 3 | 2 | MINOR | `footer-clipped` clone max right **1440** > 1100 |
| `/security` | 1440 | MAJOR | MAJOR | 0 | 1 | 2 | MINOR | `column-mode-delta` clone 6 items, source 8 |
| `/changelog` | 390 | MINOR | **MAJOR** | 0 | 1 | 2 | PASS | `position-delta-p90-px` 64 px (thr 48 px) |
| `/changelog` | 700 | MAJOR | MAJOR | 0 | 3 | 2 | PASS | `column-container-mode-delta` clone 3×2, source 3×4 |
| `/changelog` | 1024 | **BLOCKER** | **BLOCKER** | 1 | 3 | 1 | MINOR | `nav-link-ratio` 3 of 6 (50 %, thr 50 %) |
| `/changelog` | 1100 | **BLOCKER** | **BLOCKER** | 1 | 3 | 1 | PASS | `footer-clipped` clone max right **1440** > 1100 |
| `/changelog` | 1440 | MINOR | MINOR | 0 | 0 | 2 | PASS | `pixel-residual-difference-ratio` 3.12 % of compared pixels |

**The nine BLOCKER pairs are the same nine pairs as the baseline.** The deciding channels are not:

| width band | baseline deciding channel | now | changed? |
|---|---|---|---|
| 1024 (×4) | `footer-clipped` 1390/1438 > 1024 | `nav-link-ratio` 3 of 6 / `image-presence-ratio` | **yes — old cause cleared, new cause appeared** |
| 1100 (×4) | `footer-clipped` 1390/1438 > 1100 | `footer-clipped` **1440** > 1100 | same channel, **worse number, different cause** |
| `/` 700 | `image-presence-ratio` 94 of 254 | `image-presence-ratio` 90 of 255 | same, unchanged |

Channel census over 20 pairs (occurrences, not pairs):

| severity | channel | now | baseline |
|---|---|---:|---:|
| BLOCKER | `nav-link-ratio` | **4** | 0 |
| BLOCKER | `footer-clipped` | 4 | 8 |
| BLOCKER | `visible-text-ratio` | 2 | 1 |
| BLOCKER | `offscreen-text-excess-chars` | 2 | 4 |
| BLOCKER | `missing-text-ratio` | 2 | 1 |
| BLOCKER | `image-presence-ratio` | 2 | 1 |
| BLOCKER | `overlap-excess-ratio` | 0 | 1 |
| MAJOR | `position-delta-p90-px` | 12 | 13 |
| MAJOR | `column-mode-delta` | 8 | 6 |
| MAJOR | `column-container-mode-delta` | 8 | 8 |
| MAJOR | `missing-text-ratio` | 3 | 4 |
| MAJOR | `offscreen-text-excess-chars` | 2 | 4 |
| MAJOR | `right-gutter-excess-ratio` | 2 | 1 |
| MAJOR | `scroll-height-ratio-low` | 1 | 0 |
| MAJOR | `overlap-excess-ratio` | 1 | 1 |

### The floor, and why PASS is not the grade

The `--self-check` run is the instrument's own floor plus the live source's instability: **11 of 20
pairs reach PASS when the source is graded against itself, 7 are MINOR, 0 MAJOR, and 2 are BLOCKER**
(`/ @390` and `/ @700`, both `offscreen-text-excess-chars`, 91 chars over the 80 threshold). So:

- `/ @390 MAJOR` sits **below its own floor of BLOCKER** — that pair carries no readable clone signal.
- `/ @700 BLOCKER` has a BLOCKER floor; its severity is not attributable, though the *magnitude*
  (35 % of images, 51.65 % missing text) is far outside anything the floor produced.
- **`/ @1024`, `/pricing @1024/@1100`, `/changelog @1100` all have a PASS floor** — every finding on
  those four pairs is the clone's.
- The four `/security` pairs have a MINOR floor of 0.30 % missing text; their MAJOR/BLOCKER findings
  are on other channels and are the clone's.

The harness also states the pixel calibration: on the least-inked pair only **2.84 % of 9 158 400
compared pixels are ink**, so the 1 % "of the page" MINOR band is **35 % of everything that page
draws**. Grading was done on `blockerPairs`/`majorPairs` as instructed, never on PASS.

---

## 3. THE ENGINE DEFECT — the derived probe set evicts the widths its own consumers require

This is one cause with two independent consequences, and between them they own **9 of 9** BLOCKER pairs.

### 3.1 What was measured

`data/linear.app/site-observations/2026-09-02T23-12-52-648Z/pages/*/layout-probe.json` →
`widthProvenance`, identical on all four pages:

```
floorWidths            390, 700, 768, 1024, 1100, 1440, 1920
cap / capHit           16 / true
probed (desktop)       390, 600, 601, 640, 641, 769, 928, 929, 1024, 1025, 1280, 1281, 1441, 1535, 1536, 1920
floorWidthsEvicted     [700, 768, 1100, 1440]          <-- all four pages
breakpointsAdoptedByEviction  2
degradedToFloor        false
```

The **baseline** run's probe file for the same page (`site-observations/2026-09-02T20-18-05-741Z`,
`schemaVersion 5`, no `floorWidthsEvicted` field at all) probed
`390, 640, 641, 700, 768, 769, 928, 929, 1024, 1025, 1100, 1280, 1281, 1440, 1441, 1920` — **the whole
floor retained, 1440 and 768 included**. So the eviction is new, and it is the 28.6 W6 O3 change
documented at `src/observer/probe-widths.ts:57-74`: an authored bracket may now buy room by evicting a
floor width, and only `MIN_GUARANTEED_FLOOR_WIDTHS = 3` (`src/observer/types.ts:1893` — narrowest /
median / widest, here 390 / 1024 / 1920) is protected. The eviction order is
`[...evictableRemaining].sort((a,b)=>a-b).slice(0, deficit)` (`probe-widths.ts:335`) — smallest first,
so 700, 768, 1100 and finally **1440** were given up to seat the `600/601` and `1535/1536` brackets.

### 3.2 Consequence A — the entire DESKTOP layout pass is refused

`src/reconstruction/layout-inference.ts:1667-1668`:

```ts
const truthEntry = variantIdx.find((entry) => entry.width === options.truthWidth);
if (truthEntry === undefined) return { ok: false, reason: "truth-width-not-probed" };
```

`options.truthWidth` is `TRUTH_WIDTH = 1440` for the desktop pass (`layout-inference.ts:1781`). 1440 is
not in the probe set, so the pass refuses. Measured, straight out of
`reconstruction-manifest.json → layout`:

```json
"viewportPasses":        { "desktop": 4, "mobile": 4 },
"viewportPassesUsed":    { "mobile": 4 },
"viewportPassRefusals":  { "desktop:truth-width-not-probed": 4 },
"rulesByViewport":       { "mobile": 1008 },
"shippedRulesByViewport":{ "mobile": 1006 }
```

Confirmed independently by parsing the shipped stylesheet
(`app/public/wr/generated-styles.css`, recovered block from line 8231):
**1 006 recovered rules, 1 006 of them `[data-wr-viewport="mobile"]`, ZERO desktop.**

This is an exact inversion of the baseline, which shipped **1 135 rules, all desktop, zero mobile**. The
28.6 viewport-parameterisation did give the mobile subtree its own rules — it also took every rule away
from the desktop subtree, and nothing in the artifact escalates that: `limitations[]` carries the generic
`layout-rule-inferred` and no entry saying a whole viewport pass was refused.

**Blast radius, measured by the grader:** at 1100 the clone's desktop tree ships every box at its
frozen 1440 measurement, and `footer-clipped` reports **clone max right 1440** on all four routes —
i.e. the page is exactly its truth width, unrestated, in a 1100 px window. `/ @1100` also carries
`offscreen-text-excess-chars` **723** against the source's 492.

### 3.3 Consequence B — the tree switch lands at 1025 instead of 769

`src/reconstruction/tree-switch.ts:310` reads **only** `page.layoutProbe` (the desktop probe), and
`:339` discards any candidate whose bracket is wider than `TIGHT_BRACKET_MAX_PX = 1`. With 768 evicted,
`769`'s nearest sample below is 641, a 128 px bracket, so it is `unattributable` on all four pages.
From `reconstruction-manifest.json → config.inferredBreakpoint`:

| candidate px | authoredWeight | authoredPages | observedChange | observedChangePages | unattributablePages |
|---:|---:|---:|---:|---:|---:|
| **1025 (chosen)** | 906 | 4 | **3 556** | 4 | 0 |
| 1281 | 36 | 1 | 3 378 | 4 | 0 |
| 641 | 429 | 4 | 3 122 | 4 | 0 |
| 929 | 5 | 1 | 23 | 4 | 0 |
| **769** | 240 | 4 | **0** | **0** | **4** |

`value: 1025, provenance: "inferred", method: "authored-breakpoint", ambiguous: true,
candidateCount: 5, treeDivergence: "dual-dom", domSwitchWidthObserved: false`.

**Counterfactual, measured** (`tmp/wr286/w7-linear/tree-switch-counterfactual.ts`, replaying
`tree-switch.ts`'s own arithmetic on `layoutProbeMobile`, which *does* carry both 768 and 769):

| candidate | desktop probe | mobile probe |
|---:|---|---|
| 641 | bracket 640/641, change **3 122** | bracket 640/641, change **4 653** |
| **769** | bracket 641/769 → **unattributable ×4** | bracket **768/769**, change **2 904** |
| 929 | bracket 928/929, change 23 | not bracketed |
| 1025 | bracket 1024/1025, change 3 556 | not bracketed |

The corroboration for 769 existed in the artifact and was not consulted, because the chooser reads one
probe. (Caveat, stated because it matters: the two probes measure two different DOM trees, so their
`observedChange` totals are not strictly commensurable — this is a measurement of what each probe could
have said, not a claim about which number would have won.)

**Blast radius, measured by the grader.** The convention is `width < breakpoint → mobile tree`. At 1025,
**700 and 1024 both serve the DOM captured at 390**:

| | `/` @390 | `/` @700 | `/` @1024 | `/` @1100 | `/` @1440 |
|---|---:|---:|---:|---:|---:|
| source visible text chars | 3 470 | 7 500 | 8 633 | — | — |
| clone / source visible-text ratio | ok | **0.441** | **0.382** | ok | ok |
| source visible images | — | 255 | 248 | — | — |
| clone images rendered | — | **90 (35 %)** | **75 (30 %)** | — | — |
| max columns clone/source | 8/8 | **8/28** | **8/28** | 28/28 | 28/28 |
| header/nav links clone/source | — | — | **3/6** | — | — |

`nav-link-ratio` 3-of-6 is the same finding on all four routes at 1024 and is the deciding BLOCKER on
`/pricing`, `/security` and `/changelog` there. The baseline's 915 switch cost one pair; 1025 costs eight.

### 3.4 Where the C3 measured-content-box fix DID land

Where the pass ran (the mobile tree) the fix works, and the previous lane's named node proves it.
Baseline diagnosis: `/pricing` `n000064` (`<h1>Pricing</h1>`, computed `width: 1344px`) inside
`n000061`, whose padding is authored through a custom property under a media query, fell past every
shape predicate and shipped its frozen px. **Now, in the shipped stylesheet:**

```css
[data-wr-page="p000003"][data-wr-viewport="mobile"] [data-wr-node="n000061"] { width: auto; }
[data-wr-page="p000003"][data-wr-viewport="mobile"] [data-wr-node="n000064"] { width: auto; }
```

(Both nodes verified as the same elements in both trees by walking the shipped runtime page data:
`n000061` = the pricing shell `div`, `n000064` = `<h1>Pricing</h1>`.)

And the accounting behind it, re-computed per page with `inferLayoutRules()`:

| counter | value | reading |
|---|---:|---|
| `contentBoxMeasured` | **645** | 28.9 % of 2 233 candidates got a content box measured from sibling geometry |
| `contentBoxAssumedConstant` | 1 588 | the rest still stand on the frozen padding number |
| `contentBoxMeasuredDisagreed` | **43** | measured box differs from the derived one by > 2 px |
| `contentBoxMaxDisagreementPx` | **24** | worst disagreement on this site |
| `parentPaddingNotConstant` | `media-conditional` 12, `viewport-relative` 28 | 40 parents whose padding is provably not one number |
| guard `parent-padding-not-constant` refusals | **0** | every one of those 40 had a measured box, so none was refused |

That last row is the cleanest positive result in the lane: on this site the measurement was available
exactly where the assumption was known false, so the new guard never had to fire.

---

## 4. Engine-change measurements

### 4.1 Stylesheet coverage — 322 of 322 recovered, 0 missed

Per page × viewport, from each `observation.json → viewports.<vp>.stylesheetCoverage`:

| page | route | vp | sheets | CSSOM readable | **blocked** | **recovered** | **missed** | bytes captured | bytes bridged | rules indexed | elements w/ authored rules |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| p000001 | `/` | desktop | 84 | 30 | 54 | **54** | **0** | 485 984 | 331 365 | 2 252 | 2 275 |
| p000001 | `/` | mobile | 78 | 24 | 54 | **54** | **0** | 466 840 | 331 365 | 2 163 | 2 278 |
| p000002 | `/changelog` | desktop | 84 | 35 | 49 | **49** | **0** | 486 999 | 242 575 | 2 246 | 2 257 |
| p000002 | `/changelog` | mobile | 79 | 30 | 49 | **49** | **0** | 454 792 | 242 575 | 2 157 | 2 257 |
| p000003 | `/pricing` | desktop | 81 | 51 | 30 | **30** | **0** | 446 449 | 151 145 | 2 085 | 1 363 |
| p000003 | `/pricing` | mobile | 73 | 43 | 30 | **30** | **0** | 415 860 | 151 145 | 2 028 | 1 363 |
| p000004 | `/security` | desktop | 79 | 51 | 28 | **28** | **0** | 449 101 | 135 790 | 2 083 | 366 |
| p000004 | `/security` | mobile | 71 | 43 | 28 | **28** | **0** | 406 838 | 135 790 | 1 957 | 364 |

`sheetsBodyUnavailable`, `sheetsSkippedBySizeCap`, `importsUnresolved`, `authoredMediaConditionsDropped`
are **0** everywhere; `ruleIndexCapHit` and `authoredMediaConditionsCapHit` are `false` everywhere.

Two of this release's changes **did not fire on this site**, which is a measurement, not a pass:
`sheetsRedirectResponses = 0`, `sheetsRedirectAliasesKeyed = 0`, `sheetsRedirectChainsTruncated = 0`
(no stylesheet redirected), and `fontFaceUrlsHarvested = 0` (no `@font-face` URL reached the harvester
on any page × viewport).

**Authored declarations:** `authoredBreakpointDeclarations` **106 486** examined,
`authoredBreakpointUnparsedDeclarations` **0**, over `authoredBreakpointEntries` **27** on
`authoredBreakpointPages: { "spec-field": 4 }`. `authoredBreakpointTruncatedNodes` **1 038** — that many
nodes had their authored-rule list truncated before it reached the histogram.

### 4.2 Derived probe widths and their provenance

Identical on all four pages. Desktop floor `390, 700, 768, 1024, 1100, 1440, 1920`; mobile floor
`390, 480, 700, 768, 914`.

**Desktop pass** — probed `390, 600, 601, 640, 641, 769, 928, 929, 1024, 1025, 1280, 1281, 1441, 1535,
1536, 1920` (16 = cap, `capHit: true`):

| field | value |
|---|---|
| conditions read / weight | 31 / 411 |
| conditions width-irrelevant / unsupported / unparsed / dropped by collector | 158 / 2 / 0 / 0 |
| breakpoints folded | 14 |
| adopted (both sides sampled) | **8** (baseline 6) |
| already bracketed by the floor | 3 (baseline 4) |
| out of range | 0 |
| **dropped by the 16-width cap** | **3** — `min-width:769` (w 1), `max-width:1140` (1), `max-width:1439` (1) |
| **floor widths evicted** | **700, 768, 1100, 1440** |
| brackets adopted by eviction | 2 (`600/601`, `1535/1536`) |
| degraded to floor | no |

Origins: `390 floor · 600 authored-below(max 600) · 601 authored-above · 640 authored-below(max 640) ·
641 authored-above · 769 authored-above(max 768) · 928 authored-below(max 928) · 929 authored-above ·
1024 floor+authored · 1025 authored-above(max 1024) · 1280 authored-below(max 1280) ·
1281 authored-above · 1441 authored-above(max 1440) · 1535 authored-below(min 1536) ·
1536 authored-above · 1920 floor`. Only **3 of 7 floor widths survive**, and the truth width is not one
of them. Note the asymmetry the eviction created: `1441` (the above-side of `max-width:1440`) is
sampled while `1440` itself is not, so the bracket the site authored is half-present.

**Mobile pass** — probed `390, 480, 600, 601, 640, 641, 700, 768, 769, 914` (10 widths, `capHit: false`,
`floorWidthsEvicted: []`, 0 dropped by cap). Its truth width 390 is the guaranteed narrowest floor
width, which is why this pass survived at all.

### 4.3 Tree switch

`value 1025 · provenance "inferred" · method "authored-breakpoint" · convention "mobile: width <
breakpoint; desktop: width >= breakpoint"`. `candidateCount 5`, **`ambiguous: true`**,
`candidatesOutsideObservedInterval 1`, `candidatesOmitted 0`, `pagesRead 4`, `pagesWithHistogram 4`,
`pagesWithUsableProbe 4`, `treeDivergence "dual-dom"`, `pagesIdenticalWalk 2`, `pagesDivergentWalk 2`,
`pagesWalkNotComparable 0`, **`domSwitchWidthObserved: false`**. Manifest limitation
`tree-switch-dom-width-not-observed` is declared. The full candidate table is in §3.3.

The engine is honest that it snapped to a *CSS* breakpoint and not to an observed *DOM* switch. The
grader then measured where the source's own DOM/layout actually changes: max columns on `/` are 8 at
390 and **28 at 700, 1024, 1100 and 1440** (source side, both runs). The source's structural change is
between 390 and 700 — nowhere near 1025.

### 4.4 Band edges: snapped vs midpoint-kept

| counter | value | baseline |
|---|---:|---:|
| `bandEdgesConsidered` | 136 | 529 |
| `bandEdgesOpen` | 136 | 529 |
| **`bandEdgesSnapped`** | **134** | 529 |
| `bandEdgesSnappedAmbiguous` | 0 | 0 |
| **`bandEdgesKeptMidpointNoAuthoredInGap`** | **2** | 0 |
| `bandEdgesKeptMidpointEmptyHistogram` | 0 | 0 |
| `bandEdgesKeptMidpointNoHistogram` | 0 | 0 |
| `bandEdgeSnapShiftPx` (total) | 134 → **1.0 px per snapped edge** | 529 → 1.0 px |
| **`bandSampleMismatches`** | **2** | 0 |

Per page: `/` 70 considered / 68 snapped / 2 midpoint-kept · `/changelog` 19/19/0 · `/pricing` 42/42/0 ·
`/security` 5/5/0.

**The `bandSampleMismatches = 2` is worth the orchestrator's attention.** Its own docstring
(`layout-inference.ts:365-376`) says it is "structurally 0", and it is the one scan where a snapped edge
really is a second independent source. Both mismatches are on `/` (p000001), the only page that also
has exactly 2 `bandEdgesKeptMidpointNoAuthoredInGap`. The coincidence is exact and on this run nothing
else is non-zero — **but I did not identify the specific nodes**, so this is a correlation I measured,
not a proof that the same two edges are involved. The reading it supports: where the snap had nothing
to snap to and the midpoint survived, the midpoint edge straddled a measured sample.

The band vocabulary is still one kind. All 136 banded rules are `display: none`, over exactly three
distinct media strings quoted from `app/public/wr/generated-styles.css`:

```
@media (min-width: 769px)   —  85 blocks
@media (min-width: 641px)   —  49 blocks
@media (min-width: 600px)   —   2 blocks
```

There is **no banded `width` rule of any kind** in the vocabulary, which is why a node whose fill
behaviour changes at an authored edge (e.g. `/` `n000012`: fills its parent at 390–640, then sits
571 of 595 px from 641 up) can only fall through.

### 4.5 Desktop / mobile recovered-rule split

| | rules | share |
|---|---:|---:|
| `[data-wr-viewport="mobile"]` | **1 006** | **100 %** |
| `[data-wr-viewport="desktop"]` | **0** | **0 %** |

Baseline: 1 135 desktop / 0 mobile. Per page (parsed from the generated CSS): `/` 242, `/changelog` 475,
`/pricing` 194, `/security` 95. Property mix across the 1 006: `width` 868, `display` 136,
`max-width` 5, `margin-left` 5, `margin-right` 5, `grid-template-columns` 2.

### 4.6 Inline-size outcome partition, including `no-branch-matched` by reason

Engine counters (`reconstruction-manifest.json → layout`), 4 pages:

| outcome | count | share of 2 233 candidates |
|---|---:|---:|
| `emitted-full-width` | 809 | 36.2 % |
| **`no-branch-matched`** | **1 246** | **55.8 %** |
| `refused-containing-block-guard` | 78 | 3.5 % |
| `emitted-percentage-width` | 56 | 2.5 % |
| `refused-width-mode` | 39 | 1.7 % |
| `emitted-centered-max-width` | 5 | 0.2 % |
| `inlineSizeOutcomeDoubleCounts` | 0 | — |

Pre-stage drops (before a node is a candidate at all): `hidden-at-truth-width` 2 590,
`display-not-blockish` 1 431. Refusal reasons: `refused-width-mode` = `flex-item-main-axis` 38 +
`grid-item-inline-size` 1; `refused-containing-block-guard` = `flex-item-basis-governed` 40 +
`abs-containing-block-is-padding-box` 15 + `grid-item` 14 + `fixed-position` 8 +
`abs-containing-block-not-parent` 1. `widthValueRefusals` 0.

**`no-branch-matched` is a single terminal bucket in the engine** — `layout-inference.ts:2521` calls
`outcome("no-branch-matched")` with no sub-reason. So the partition below is **mine**, a re-computation
(`tmp/wr286/w7-linear/no-branch-why.ts`) that replays the branch cascade using the engine's own exported
`resolveViewportProbe`, `measureParentContentBox`, `containingBlockGuard`, `parentPaddingConstancy`,
`inlineSizeBehaviour` and constants. **It reproduces the engine's total exactly (1 246), which is the
only check available that it is faithful.**

| my reason for falling through | count | share | shape |
|---|---:|---:|---|
| containing block does not grow ≥ 40 px across the probed widths | **551** | 44.2 % | intrinsically-sized leaves and their content-sized parents; e.g. `/` `n000016` `<a>`, 104 px inside a 96 px parent at all 10 widths |
| node width frozen while its parent grows | **350** | 28.1 % | e.g. `/` `n000041` `<ul>` at 143 px while its parent goes 143 → 550 px at the 769 edge |
| ratio to the content box not constant (spread > 0.01) | **231** | 18.5 % | e.g. `/` `n000012` fills its parent at 390–640 then drops to 571/595 from 641 up — a banded width, which the vocabulary cannot express |
| ratio constant but < 5 % of the parent | **87** | 7.0 % | 1 px spacers and hairlines |
| ratio constant but the node grows < 20 px | **27** | 2.2 % | small SVG icons |

Per page: `/` 355 · `/changelog` 240 · `/pricing` 513 · `/security` 138.

The baseline brief's figure for this site was **2 436**. The drop to 1 246 is **not** an improvement:
the desktop pass contributed 0 candidates this time, so roughly half the population was never
evaluated. Read the two numbers as covering different populations.

### 4.7 Grid track recovery, and the `/pricing` container question

Engine totals: `gridTrackColumns` **2** recovered, `gridTrackRefusals` **193** by reason —
`no-computed-tracks` 119, `container-width-constant` 38, `child-count-not-multiple-of-tracks` 18,
`children-do-not-tile-tracks` 7, `tracks-not-px` 6, `tracks-not-reproducible-at-every-width` 5.

Per page (re-computed with `inferLayoutRules()` one page at a time; the 4-page total reproduces the
shipped manifest exactly):

| page | route | recovered | refused | refusal reasons |
|---|---|---:|---:|---|
| p000001 | `/` | 0 | 165 | `no-computed-tracks` 119, `container-width-constant` 32, `tracks-not-px` 6, `tracks-not-reproducible-at-every-width` 4, `child-count-not-multiple-of-tracks` 2, `children-do-not-tile-tracks` 2 |
| p000002 | `/changelog` | 0 | 13 | `child-count-not-multiple-of-tracks` 10, `container-width-constant` 2, `children-do-not-tile-tracks` 1 |
| p000003 | **`/pricing`** | **1** | **5** | `container-width-constant` 2, `children-do-not-tile-tracks` 2, `tracks-not-reproducible-at-every-width` 1 |
| p000004 | `/security` | 1 | 10 | `child-count-not-multiple-of-tracks` 6, `children-do-not-tile-tracks` 2, `container-width-constant` 2 |

**Direct answer to the brief's question.** The "58 `/pricing` grid containers" population **no longer
exists to be measured**: it was a DESKTOP-tree population (the baseline counted 70 containers reaching
the check on `/pricing`, of which 59 refused `tracks-not-reproducible-at-every-width`), and the desktop
pass did not run. In the **mobile** tree only **6** `/pricing` containers reach the check;
**1 recovers a track list** and 5 refuse, by the reasons above. The baseline's single `/pricing`
recovery — `n000357`, the comparison-table header row, which recovered
`minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.007fr)` — **carries no recovered
rule at all now** (verified by grep against the shipped stylesheet).

The two rules that did survive, quoted from the shipped stylesheet:

```css
[data-wr-page="p000003"][data-wr-viewport="mobile"] [data-wr-node="n000352"] { grid-template-columns: minmax(0, 1fr); }
[data-wr-page="p000004"][data-wr-viewport="mobile"] [data-wr-node="n000249"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
```

The whole site ships exactly 2 `grid-template-columns` declarations, both single- or two-track.
Note what `n000352` is: it sits in the comparison table's own ancestor chain (§4.8). The mechanism
reached the right container and recovered the container's MOBILE shape — one column — because that is
the only tree it was allowed to look at.

### 4.8 The `/pricing` comparison-table band — the brief's quoted-CSS question

**There is no emitted media string for those rows. They carry no recovered rule.**

Walking the shipped runtime page data for `/pricing` down to the text `"Multiple tenants"` gives the
same chain in both trees:

```
n000001 › n000002 › n000003 › n000007 › n000059 › n000339 › n000352 › n000353 › n000389
       › n000910 › n000925 › n000926 › n000928 › "Multiple tenants"
```

Grepping the recovered-rule block of `app/public/wr/generated-styles.css`:

- `n000925`, `n000926`, `n000928` → **no rule of any kind, banded or otherwise**.
- `n000910` (their nearest ancestor with a rule) → `width: auto`, unbanded.
- `n000357` (the header row the baseline recovered tracks for) → **no rule**.

The baseline shipped `@media (max-width: 1024.98px) { … display: none }` on all three of those nodes.
That band is gone because it lived in the desktop pass. `/pricing` has 42 banded rules in this run, all
in the mobile tree, on nodes `n000056`–`n001560`, split `@media (min-width: 769px)` ×38 and
`@media (min-width: 641px)` ×4 — none of them the comparison table.

The grader's view of the same thing: `/pricing @1100` missing text is 7 characters over 1 string
(0.29 %), so the table's *text* is present; the failure at 1100 is geometric — the fourth plan column
and the fourth comparison-table column are pushed past the viewport (`footer-clipped`, clone max right
1440; `offscreen-text-excess-chars` 362 against the source's 0). See
`docs/result/28.6/review/linear/09_pricing_1100_BLOCKER_{source,clone}.png`.

### 4.9 Truth-check and band-check accounting — every drop explained

| counter | value |
|---|---:|
| `candidateRules` | **1 008** |
| `acceptedRules` | **1 006** |
| `rejectedByGuard` | 78 (by reason, §4.6) |
| **`rejectedByTruthCheck`** | **2** (baseline 0) |
| `rejectedByBandCheck` | 0 |
| `rejectedUnverifiable` | 0 |
| `acceptedUnchecked` | **0** |
| `acceptedRegressed` | 0 |
| `truthCheckable` (geometry rules) | 872 |
| `bandCheckable` (banded rules) | 136 |
| 872 + 136 | **= 1 008 — every candidate was checked** |
| `bandIndependentlyDiscriminated` | 136 |
| `bandExactTierHidesAtBandWidth` | 0 ⇒ all 136 genuinely discriminated |
| `bandHiddenByAncestorAtBandWidth` | 90 (counted, not exempted) |
| `bandTruthBaselineNotInLayout` | 0 |
| `bandWidthsRendered` | 9 |
| `truthCheckStatus` / `converged` | `verified` / `true` |
| rounds / pages rendered | 5 / 4 (21 632 ms) |

`1 008 − 2 = 1 006` shipped. The accounting closes with no exemptions: 78 guard refusals by named
reason, 39 width-mode refusals by named reason, 193 grid-track refusals by named reason, 1 246
`no-branch-matched` (single bucket, partitioned by me in §4.6), 0 accepted-unchecked.
**What the artifact does not record is *which* 2 rules the truth check rejected** — only the count.

---

## 5. Every BLOCKER and MAJOR, diagnosed

### BLOCKER-1 (4 pairs) — `footer-clipped` at 1100 on all four routes
`src/observer/probe-widths.ts:335` evicts 1440 → `src/reconstruction/layout-inference.ts:1668` refuses
the desktop pass → 0 desktop rules → every box in the desktop tree keeps its 1440 computed width.
Clone footer max right **1440** at a 1100 viewport, on all four routes. Secondary findings on the same
pairs: `offscreen-text-excess-chars` 723/`/`, 362/`/pricing`, 70/`/security`, 70/`/changelog`;
`position-delta-p90-px` 258–313 px. §3.2.

### BLOCKER-2 (4 pairs) — `nav-link-ratio` 3 of 6 at 1024 on all four routes
Tree switch 1025 (`src/reconstruction/tree-switch.ts:339` + `responsive-plan.ts:107`) serves the
390-observed DOM at 1024, so the clone renders the phone header (hamburger + 3 links) where the source
renders a 6-link nav bar. On `/` the same cause also fires `image-presence-ratio` (75 of 248),
`missing-text-ratio` (56.91 %) and `visible-text-ratio` (0.382), making that pair B4. §3.3.

### BLOCKER-3 (1 pair) — `/ @700`
Same cause as BLOCKER-2 one width down: 90 of 255 images, 51.65 % missing text, visible-text ratio
0.441, max columns 8 vs 28. **Floor caveat: this pair's floor is also BLOCKER**, so its *severity* is
not attributable to the clone even though its magnitude clearly is.

### MAJOR-1 (12 occurrences) — `position-delta-p90-px`
Fires on 12 of 20 pairs, p90 64–634 px. Every instance at 700/1024 is downstream of the wrong tree;
every instance at 1100 is downstream of the frozen desktop widths. `/ @1440` (65 px) and
`/changelog @390` (64 px) are the two at widths neither defect explains, and I did not isolate them.
On `/ @700` and `/ @1024` the harness's own `position-channel-trust-guard` suppressed this channel
(only 34.8 % and 26.5 % of content-keyed leaves matched), so those two pairs may be worse than stated.

### MAJOR-2 (8) / MAJOR-3 (8) — `column-container-mode-delta`, `column-mode-delta`
"clone lays children out as 3 rows of 2 where the source uses 2 rows of 4"; "clone's widest row holds
2/6 items where the source's holds 8". With **2 grid track lists recovered across 12 523 nodes**
(§4.7), every other grid ships its truth-viewport-resolved frozen tracks and reflows into the wrong
column count. `/security @390` (2 vs 8) and `/security @1440` (6 vs 8) are **not** at an overflow width
and **not** on the wrong tree, so this is an independent defect, not a shadow of the other two.

### MAJOR-4 (3) — `missing-text-ratio` on `/` at 390 / 1100 / 1440 (2.68 – 5.36 %)
The harness flags all three as dwell-sensitive: the source revealed 109 / 220 / 199 characters during
the scroll dwell and the clone revealed 0. The floor run puts `/ @390` at BLOCKER and `/ @1100` at
MINOR on this very channel. **Treat these three as unattributed.**

### MAJOR-5 (2) — `right-gutter-excess-ratio`, `/changelog` @700 and @1024
Clone right gutter 16 % / 42.6 % of the viewport against the source's 5 % / 3.4 %. The phone DOM served
in a wide window leaves a dead strip on the right. Same cause as BLOCKER-2.

### MAJOR-6 (2) — `offscreen-text-excess-chars`, `/security` and `/changelog` @1100 (70 chars each)
70 characters of footer link text pushed past the right edge. Downstream of BLOCKER-1.

### MAJOR-7 (1) — `overlap-excess-ratio`, `/changelog @1100`
Clone 2.68 % vs source 4.69 % — the clone overlaps *less* than the source; the channel is a two-sided
band. Downstream of the frozen widths reflowing the entry cards.

### MAJOR-8 (1) — `scroll-height-ratio-low`, `/ @1024`
Clone document 5 876 px against the source's 10 131 px — the phone page is simply shorter than the
desktop page it is standing in for. Same cause as BLOCKER-2.

---

## 6. Engine defects, stated generically

1. **The derived probe-width budget can evict a width a downstream consumer hard-requires.**
   `src/observer/probe-widths.ts:264-348` protects only `MIN_GUARANTEED_FLOOR_WIDTHS = 3` positional
   floor widths (narrowest / median / widest). Two consumers require specific widths and neither
   requirement is expressed to the derivation: `layout-inference.ts:1668` requires each viewport's
   truth width, and `tree-switch.ts:339` requires both sides of every candidate breakpoint.
   Measured here: `floorWidthsEvicted: [700, 768, 1100, 1440]` on 4/4 pages → 0 desktop rules and a
   tree switch 256 px away from the candidate the site's own CSS weights fourth-heaviest.
   Generic, not host-specific: any site whose observed desktop width is neither the widest nor the
   median floor width, and whose authored breakpoints exceed the remaining budget, hits it.
2. **A refused viewport pass is counted but not escalated.** `viewportPassRefusals:
   {"desktop:truth-width-not-probed": 4}` is in `reconstruction-manifest.json → layout`, but
   `limitations[]` carries only the generic `layout-rule-inferred`. An operator reading the limitation
   list is not told that one of the two shipped trees has no recovered layout rule at all.
3. **The manifest drops the counters for this release's headline change.** `inferLayoutRules()`
   produces `contentBoxMeasured`, `contentBoxAssumedConstant`, `contentBoxMeasuredDisagreed`,
   `contentBoxMaxDisagreementPx` and `parentPaddingNotConstant`, and
   `src/reconstruction/generate-app.ts:341-430` (the `layout: {` block) copies none of them into the
   manifest, and they are absent from the manifest schema in `src/reconstruction/types.ts:650-740`. Measured values on this site:
   645 / 1 588 / 43 / 24 px / `{media-conditional: 12, viewport-relative: 28}` — all of them
   recoverable only by re-invoking the engine, which is what I had to do.
4. **`no-branch-matched` is one bucket for 55.8 % of the candidate population.**
   `layout-inference.ts:2521`. The count is now honest — that is the 28.6 C3 improvement, and it is
   real — but 1 246 nodes leave through one door with no reason attached, and the largest sub-population
   I could identify (231 nodes whose ratio is banded, not constant) points at a missing rule kind
   rather than at a missing measurement.
5. **`bandSampleMismatches` is non-zero for the first time (2, both on `/`).** Its own docstring calls
   it structurally 0. Both sit on the only page that also kept 2 midpoint band edges. Correlation
   measured; identity of the edges not established.
6. **The tree-switch ranking is dominated by ordinary reflow.** `tree-switch.ts:344-360` counts any node
   whose visibility or geometry moved by more than `TREE_SWITCH_CHANGE_TOLERANCE_PX = 1` across a 1 px
   bracket. On a fluid site that is "how many boxes were visible here", not "where the tree changes":
   1025 → 3 556, 1281 → 3 378, 641 → 3 122 are within 12 % of each other, and the winner decided eight
   graded pairs. The signal that would have discriminated — the source's own column mode, 8 at 390 and
   28 at 700 — is measured by the grader and not by the chooser.

---

## 7. What I could NOT measure, and why

1. **Which 2 rules the truth check rejected.** `rejectedByTruthCheck: 2` is a count; the reconstruction
   run directory contains only `reconstruction-manifest.json` and `app/`, with no per-rule rejection log.
2. **Which 2 band edges produced the 2 `bandSampleMismatches`.** The scan is internal to
   `inferLayoutRules()` and emits no identities. I established only that both are on p000001, the same
   page as the 2 midpoint-kept edges.
3. **The counterfactual grade.** I could not measure what this site would score with 1440 kept in the
   probe set, because that requires an engine change and this lane may not make one. Everything in §3 is
   the measured mechanism plus the measured consequence, not a measured counterfactual grade.
4. **`/ @390` and `/ @700` severity.** Their floor verdicts are MAJOR-exceeding (BLOCKER on both), so
   the rubric cannot see below the source's own instability there. The magnitudes are far outside the
   floor's, but the *verdicts* on those two pairs are not attributable.
5. **`/ @1440` and `/changelog @390` `position-delta-p90-px`** (65 px and 64 px, threshold 48 px). The
   only two MAJORs at widths that are neither on the wrong tree nor overflowing. Not isolated.
6. **Per-page layout figures** in §4.4–4.7 come from re-invoking `inferLayoutRules()` one page at a time.
   The 4-page totals reproduce the shipped manifest exactly, so the split is sound, but it is a
   re-computation, not a number the pipeline wrote.
7. **The `no-branch-matched` partition in §4.6 is mine**, not an engine counter. Its only validation is
   that it reproduces the engine's total exactly.
8. **The redirected-stylesheet recovery, the `@font-face` URL resolution and the table-formatting
   capture were not exercised**: `sheetsRedirectResponses = 0` and `fontFaceUrlsHarvested = 0` on all 8
   page × viewport captures, so this lane says nothing about whether those changes work.
9. **The 3 cap-refused desktop breakpoints** (`min-width:769`, `max-width:1140`, `max-width:1439`) were
   never probed, so I cannot say whether any band edge would have moved had the cap been higher.
   `cap = 16` is binding on this site.

---

## 8. Cost

| stage | wall clock | artifacts |
|---|---:|---:|
| verify + select | 9 s | 48 KB |
| **observe:site** (4 pages, 16 desktop + 10 mobile probe widths) | **118.9 s** | **111 MB** |
| detect + explore + model interactions | 153 s | 4.6 MB |
| compile:sitespec | 2.6 s | 94 MB |
| reconstruct (+ truth check + `next build`) | 25.8 s | 44 MB |
| **qa:responsive `--self-check`** (20 pairs) | **10 min 50 s** | **88 MB** |
| **qa:responsive clone** (20 pairs) | **6 min 31 s** | **73 MB** |
| **total** | **23 min 16 s** | **≈ 415 MB** (+ 35 MB review pack) |

The machine was running seven browser-driving lanes concurrently (load average 4.8 at the start), so the
two grader timings are upper bounds, not properties of this site. The self-check taking 67 % longer than
the clone run despite doing strictly less work is a scheduling artefact of that contention.

---

## 9. Bottom line

`NOT READY — ENGINE BLOCKERS REMAIN.` The two defects the previous lane named are **cleared where the
new code runs**, and one new defect in the probe-width budget stopped the new code from running on the
tree that mattered while simultaneously moving the tree switch 256 px in the wrong direction. Nine of
nine BLOCKER pairs, and the whole of the 1024 and 1100 columns, trace to `floorWidthsEvicted:
[700, 768, 1100, 1440]`.
